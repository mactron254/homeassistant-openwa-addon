'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');
const { ToolRegistry } = require('../src/tool-registry');
const { buildCatalog } = require('../src/entity-catalog');
const { buildCommandRegistry } = require('../src/command-registry');

test('tool search returns allowed semantic entities and commands', async () => {
  const tools = new ToolRegistry(baseOptions(), {
    catalog: staticCatalog(),
    commands: staticCommands(),
  });

  const result = await tools.searchHome({ query: 'placas', intent: 'read' });

  assert.equal(result.ok, true);
  assert.equal(result.entities[0].entity_id, 'sensor.solar_power');
  assert.equal(result.commands.length, 0);
});

test('control_entity executes safe service map', async () => {
  const calls = [];
  const tools = new ToolRegistry(baseOptions(), {
    catalog: staticCatalog(),
    commands: staticCommands(),
    ha: { callService: async (domain, service, data) => calls.push({ domain, service, data }) },
  });

  const result = await tools.executeControl({ entity_id: 'number.evcc_limit', action: 'set_value', value: 16 });

  assert.equal(result.ok, true);
  assert.deepEqual(calls, [{ domain: 'number', service: 'set_value', data: { entity_id: 'number.evcc_limit', value: 16 } }]);
});

test('deny blocks tool control even when domain is enabled', async () => {
  const options = baseOptions();
  options.home_assistant.control.entities.deny = ['number.evcc_limit'];
  const tools = new ToolRegistry(options, {
    catalog: staticCatalog(),
    commands: staticCommands(),
    ha: { callService: async () => { throw new Error('should not run'); } },
  });

  const result = await tools.executeControl({ entity_id: 'number.evcc_limit', action: 'set_value', value: 16 });

  assert.equal(result.ok, false);
  assert.match(result.error, /no permitida/);
});

test('critical command creates pending action before execution', async () => {
  const calls = [];
  const tools = new ToolRegistry(baseOptions(), {
    catalog: staticCatalog(),
    commands: staticCommands(),
    ha: { callService: async (domain, service, data) => calls.push({ domain, service, data }) },
  });

  const prompt = await tools.executeCommand('saj_battery_self_use');
  const pending = tools.consumePending();

  assert.equal(prompt.confirmation_required, true);
  assert.equal(pending.type, 'command_actions');
  assert.deepEqual(calls, []);

  const result = await tools.executeCommandActions(pending.actions);
  assert.equal(result.ok, true);
  assert.deepEqual(calls, [{ domain: 'select', service: 'select_option', data: { entity_id: 'select.saj_work_mode', option: 'Self Use' } }]);
});

function staticCatalog() {
  const catalog = buildCatalog({
    rows: [
      { entity_id: 'sensor.solar_power', area: 'energia', aliases: 'placas;planta', priority: '10' },
      { entity_id: 'number.evcc_limit', area: 'coche', aliases: 'cargador;evcc', capabilities: 'read;control' },
      { entity_id: 'select.saj_work_mode', area: 'bateria', aliases: 'saj;bateria', capabilities: 'read;control' },
    ],
    states: [
      { entity_id: 'sensor.solar_power', state: '4200', attributes: { friendly_name: 'Potencia placas', unit_of_measurement: 'W' } },
      { entity_id: 'number.evcc_limit', state: '10', attributes: { friendly_name: 'Limite EVCC' } },
      { entity_id: 'select.saj_work_mode', state: 'Backup', attributes: { friendly_name: 'Modo SAJ', options: ['Backup', 'Self Use'] } },
    ],
  });
  return { load: async () => catalog };
}

function staticCommands() {
  const commands = buildCommandRegistry([
    {
      id: 'saj_battery_self_use',
      aliases: ['modo autoconsumo bateria'],
      description: 'Cambia SAJ AS1 a modo autoconsumo',
      critical: true,
      actions: [{ entity_id: 'select.saj_work_mode', action: 'select_option', value: 'Self Use' }],
    },
  ]);
  return { load: () => commands };
}

function baseOptions() {
  return {
    assistant: { enable_history: true },
    home_assistant: {
      read: { domains: ['sensor', 'number', 'select'] },
      control: {
        domains: { number: true, select: true },
        entities: { deny: [], allow: [] },
      },
      critical: {
        require_confirmation: true,
        always_confirm_domains: ['cover', 'climate'],
      },
    },
  };
}
