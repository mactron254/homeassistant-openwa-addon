'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'openwa-bot-'));
process.env.BOT_DATA_DIR = tmp;

const ha = require('../src/ha-client');
const { HomeAssistantBot } = require('../src/bot');

test('critical script requires SI before calling Home Assistant', async () => {
  const calls = [];
  ha.callScript = async entityId => {
    calls.push(entityId);
    return {};
  };

  const bot = new HomeAssistantBot({
    options: {
      critical_confirmation_timeout_seconds: 300,
      ha_sensors: [],
      ha_scripts: [{ name: 'carga_rapida', entity_id: 'script.carga_rapida', critical: true }],
    },
    openwa: {},
    groq: { enabled: () => false },
  });

  const prompt = await bot.handleMessage({ from: '34600111222@c.us', body: '3' });
  assert.match(prompt, /Responde SI/);
  assert.deepEqual(calls, []);

  const result = await bot.handleMessage({ from: '34600111222@c.us', body: 'SI' });
  assert.equal(result, 'Ejecutado: carga_rapida');
  assert.deepEqual(calls, ['script.carga_rapida']);
});

test('turns allowed switch on and off without a script', async () => {
  const calls = [];
  ha.getStates = async () => [
    { entity_id: 'switch.ev_charger', state: 'off', attributes: { friendly_name: 'Cargador coche' } },
  ];
  ha.callService = async (domain, service, data) => {
    calls.push({ domain, service, data });
    return {};
  };

  const bot = new HomeAssistantBot({
    options: baseOptions(),
    openwa: {},
    groq: { enabled: () => false },
  });

  assert.match(await bot.handleMessage({ from: '34600111222@c.us', body: 'enciende cargador' }), /Ejecutado: switch.turn_on/);
  assert.match(await bot.handleMessage({ from: '34600111222@c.us', body: 'apaga cargador' }), /Ejecutado: switch.turn_off/);
  assert.deepEqual(calls, [
    { domain: 'switch', service: 'turn_on', data: { entity_id: 'switch.ev_charger' } },
    { domain: 'switch', service: 'turn_off', data: { entity_id: 'switch.ev_charger' } },
  ]);
});

test('sets numeric and select entities through safe service map', async () => {
  const calls = [];
  ha.getStates = async () => [
    { entity_id: 'input_number.ev_limit', state: '10', attributes: { friendly_name: 'Limite cargador' } },
    { entity_id: 'input_select.ev_mode', state: 'solar', attributes: { friendly_name: 'Modo cargador' } },
  ];
  ha.callService = async (domain, service, data) => {
    calls.push({ domain, service, data });
    return {};
  };

  const bot = new HomeAssistantBot({
    options: baseOptions(),
    openwa: {},
    groq: { enabled: () => false },
  });

  assert.match(await bot.handleMessage({ from: '34600111222@c.us', body: 'pon limite a 16' }), /input_number.set_value/);
  assert.match(await bot.handleMessage({ from: '34600111222@c.us', body: 'pon modo a v2c' }), /input_select.select_option/);
  assert.deepEqual(calls, [
    { domain: 'input_number', service: 'set_value', data: { entity_id: 'input_number.ev_limit', value: 16 } },
    { domain: 'input_select', service: 'select_option', data: { entity_id: 'input_select.ev_mode', option: 'v2c' } },
  ]);
});

test('deny blocks control even when domain is allowed', async () => {
  ha.getStates = async () => [
    { entity_id: 'switch.ev_charger', state: 'off', attributes: { friendly_name: 'Cargador coche' } },
  ];
  ha.callService = async () => {
    throw new Error('should not call service');
  };

  const options = baseOptions();
  options.home_assistant.control.entities.deny = ['switch.ev_charger'];
  const bot = new HomeAssistantBot({ options, openwa: {}, groq: { enabled: () => false } });

  assert.match(await bot.handleMessage({ from: '34600111222@c.us', body: 'enciende cargador' }), /No encuentro entidad controlable/);
});

test('allow list restricts control when configured', async () => {
  const calls = [];
  ha.getStates = async () => [
    { entity_id: 'switch.ev_charger', state: 'off', attributes: { friendly_name: 'Cargador coche' } },
    { entity_id: 'switch.pool', state: 'off', attributes: { friendly_name: 'Piscina' } },
  ];
  ha.callService = async (domain, service, data) => calls.push({ domain, service, data });

  const options = baseOptions();
  options.home_assistant.control.entities.allow = ['switch.ev_charger'];
  const bot = new HomeAssistantBot({ options, openwa: {}, groq: { enabled: () => false } });

  assert.match(await bot.handleMessage({ from: '34600111222@c.us', body: 'enciende piscina' }), /No encuentro entidad controlable/);
  assert.match(await bot.handleMessage({ from: '34600111222@c.us', body: 'enciende cargador' }), /switch.turn_on/);
  assert.equal(calls.length, 1);
});

test('critical domains require SI before service call', async () => {
  const calls = [];
  ha.getStates = async () => [
    { entity_id: 'cover.garage', state: 'closed', attributes: { friendly_name: 'Garaje' } },
  ];
  ha.callService = async (domain, service, data) => calls.push({ domain, service, data });

  const bot = new HomeAssistantBot({ options: baseOptions(), openwa: {}, groq: { enabled: () => false } });

  assert.match(await bot.handleMessage({ from: '34600111222@c.us', body: 'abre garaje' }), /Responde SI/);
  assert.deepEqual(calls, []);
  assert.match(await bot.handleMessage({ from: '34600111222@c.us', body: 'SI' }), /cover.open_cover/);
  assert.deepEqual(calls, [{ domain: 'cover', service: 'open_cover', data: { entity_id: 'cover.garage' } }]);
});

test('reads allowed entity states', async () => {
  ha.getStates = async () => [
    { entity_id: 'sensor.solar_power', state: '4200', attributes: { friendly_name: 'Solar', unit_of_measurement: 'W' } },
  ];

  const bot = new HomeAssistantBot({ options: baseOptions(), openwa: {}, groq: { enabled: () => false } });

  assert.equal(await bot.handleMessage({ from: '34600111222@c.us', body: 'estado de solar' }), 'Solar: 4200 W');
});

function baseOptions() {
  return {
    critical_confirmation_timeout_seconds: 300,
    ha_sensors: [],
    ha_scripts: [],
    home_assistant: {
      read: {
        mode: 'allowed_domains',
        domains: ['sensor', 'binary_sensor', 'switch', 'light', 'climate', 'cover', 'number', 'input_number', 'select', 'input_select'],
      },
      control: {
        domains: {
          switch: true,
          light: true,
          cover: true,
          climate: true,
          number: true,
          input_number: true,
          select: true,
          input_select: true,
          fan: true,
        },
        entities: { deny: [], allow: [] },
      },
      critical: {
        require_confirmation: true,
        timeout_seconds: 300,
        always_confirm_domains: ['lock', 'alarm_control_panel', 'cover', 'climate'],
      },
    },
  };
}
