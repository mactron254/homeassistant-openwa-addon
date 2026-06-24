'use strict';

const { EntityCatalog, compactEntity } = require('./entity-catalog');
const { CommandRegistry } = require('./command-registry');
const { normalizeName } = require('./core');
const haClient = require('./ha-client');

class ToolRegistry {
  constructor(options, deps = {}) {
    this.options = options;
    this.ha = deps.ha || haClient;
    this.catalogLoader = deps.catalog || new EntityCatalog(options, { ha: this.ha, configDir: deps.configDir });
    this.commandLoader = deps.commands || new CommandRegistry(options, { configDir: deps.configDir });
    this.pending = null;
  }

  toolSchemas() {
    return TOOL_SCHEMAS;
  }

  async contextSummary() {
    const catalog = await this.catalogLoader.load();
    const commands = this.commandLoader.load();
    return {
      entities: catalog.compact(80),
      commands: commands.compact(40),
    };
  }

  async executeTool(name, args = {}) {
    if (name === 'search_home') return this.searchHome(args);
    if (name === 'get_home_state') return this.getHomeState(args);
    if (name === 'get_home_history') return this.getHomeHistory(args);
    if (name === 'control_entity') return this.executeControl(args);
    if (name === 'run_command') return this.executeCommand(args.command_id);
    return { ok: false, error: `Herramienta no permitida: ${name}` };
  }

  consumePending() {
    const pending = this.pending;
    this.pending = null;
    return pending;
  }

  async searchHome({ query = '', intent = 'read', limit = 12 } = {}) {
    const catalog = await this.catalogLoader.load();
    const commands = this.commandLoader.load();
    const mode = intent === 'control' || intent === 'command' ? 'control' : 'read';
    const entities = catalog
      .search(query, { intent: mode, limit: Number(limit) || 12 })
      .filter(entity => (mode === 'control' ? this.canControl(entity.entity_id) : this.canRead(entity.entity_id)))
      .map(compactEntity);
    const foundCommands = commands.search(query, { limit: 8 });
    return {
      ok: true,
      entities,
      commands: foundCommands.map(command => ({
        id: command.id,
        aliases: command.aliases,
        description: command.description,
        critical: command.critical,
      })),
    };
  }

  async getHomeState({ entity_ids = [] } = {}) {
    const catalog = await this.catalogLoader.load();
    const ids = unique(arrayValue(entity_ids)).filter(entityId => this.canRead(entityId));
    return {
      ok: true,
      states: ids.map(entityId => statePayload(catalog.get(entityId))).filter(Boolean),
      blocked: arrayValue(entity_ids).filter(entityId => !this.canRead(entityId)),
    };
  }

  async getHomeHistory({ entity_ids = [], period = 'today' } = {}) {
    if (this.options.assistant?.enable_history === false) return { ok: false, error: 'Historial desactivado' };
    const ids = unique(arrayValue(entity_ids)).filter(entityId => this.canRead(entityId));
    if (!ids.length) return { ok: false, error: 'Sin entidades permitidas para historial' };
    const start = startIsoForPeriod(period);
    const history = await this.ha.getHistory(ids, start);
    return { ok: true, period, start, summaries: summarizeHistory(history) };
  }

  async executeControl(args = {}, context = {}) {
    const entityId = String(args.entity_id || '');
    const action = normalizeName(args.action || '');
    const value = args.value ?? null;
    if (!entityId) return { ok: false, error: 'Falta entity_id' };
    if (!this.canControl(entityId)) return { ok: false, error: `Entidad no permitida: ${entityId}` };

    const catalog = await this.catalogLoader.load();
    const entity = catalog.get(entityId) || { entity_id: entityId, friendly_name: entityId, critical: false };
    const command = serviceForAction(entityId, action, value);
    if (!command) return { ok: false, error: `Accion no permitida para ${entityId}: ${action}` };

    if (!context.confirmed && this.requiresConfirmation(entityId, entity)) {
      this.pending = {
        type: 'tool_control',
        description: `${command.domain}.${command.service} ${entity.friendly_name || entityId}`,
        action: { entity_id: entityId, action, value },
      };
      return { ok: false, confirmation_required: true, message: `Accion critica: ${this.pending.description}` };
    }

    await this.ha.callService(command.domain, command.service, command.data);
    return { ok: true, message: `Ejecutado ${command.domain}.${command.service}`, entity_id: entityId };
  }

  async executeCommand(commandId, context = {}) {
    const registry = this.commandLoader.load();
    const command = registry.get(normalizeName(commandId));
    if (!command) return { ok: false, error: `Comando no encontrado: ${commandId}` };

    const critical = command.critical || command.actions.some(action => this.requiresConfirmation(action.entity_id, null));
    if (!context.confirmed && critical) {
      this.pending = {
        type: 'command_actions',
        command_id: command.id,
        description: command.description || command.id,
        actions: command.actions,
      };
      return { ok: false, confirmation_required: true, message: `Accion critica: ${command.description || command.id}` };
    }

    return this.executeCommandActions(command.actions);
  }

  async executeCommandActions(actions = []) {
    const results = [];
    for (const action of actions) {
      const result = await this.executeControl(action, { confirmed: true });
      if (!result.ok) return { ok: false, error: result.error, results };
      results.push(result);
    }
    return { ok: true, results };
  }

  findCommandByText(text) {
    return this.commandLoader.load().findBest(text);
  }

  canRead(entityId) {
    const domain = domainFromEntity(entityId);
    const read = this.options.home_assistant?.read || {};
    return (read.domains || []).includes(domain);
  }

  canControl(entityId) {
    const domain = domainFromEntity(entityId);
    const control = this.options.home_assistant?.control || {};
    const entities = control.entities || {};
    if ((entities.deny || []).includes(entityId)) return false;
    if ((entities.allow || []).length) return entities.allow.includes(entityId);
    return control.domains?.[domain] === true;
  }

  requiresConfirmation(entityId, entity) {
    const critical = this.options.home_assistant?.critical || {};
    if (critical.require_confirmation === false) return false;
    if (entity?.critical) return true;
    return (critical.always_confirm_domains || []).includes(domainFromEntity(entityId));
  }
}

function statePayload(entity) {
  if (!entity) return null;
  return {
    entity_id: entity.entity_id,
    name: entity.friendly_name,
    state: entity.state,
    unit: entity.unit,
    area: entity.area,
    zone: entity.zone,
    description: entity.description,
    device_class: entity.device_class,
    options: entity.options,
  };
}

function serviceForAction(entityId, action, value) {
  const domain = domainFromEntity(entityId);
  if (['switch', 'fan'].includes(domain)) return onOffService(domain, action, entityId);
  if (domain === 'light') return lightService(action, entityId, value);
  if (domain === 'cover') return coverService(action, entityId, value);
  if (domain === 'climate') return climateService(action, entityId, value);
  if (['number', 'input_number'].includes(domain)) return numericService(domain, entityId, value);
  if (['select', 'input_select'].includes(domain)) return selectService(domain, entityId, value);
  return null;
}

function onOffService(domain, action, entityId) {
  if (['turn_on', 'on', 'encender', 'activar'].includes(action)) return { domain, service: 'turn_on', data: { entity_id: entityId } };
  if (['turn_off', 'off', 'apagar', 'desactivar'].includes(action)) return { domain, service: 'turn_off', data: { entity_id: entityId } };
  return null;
}

function lightService(action, entityId, value) {
  const command = onOffService('light', action, entityId);
  if (command) {
    const percent = parsePercent(value);
    if (command.service === 'turn_on' && percent !== null) command.data.brightness_pct = percent;
    return command;
  }
  if (['set', 'set_value', 'brightness'].includes(action)) {
    return { domain: 'light', service: 'turn_on', data: { entity_id: entityId, brightness_pct: parsePercent(value) ?? 100 } };
  }
  return null;
}

function coverService(action, entityId, value) {
  if (['open', 'open_cover', 'turn_on'].includes(action)) return { domain: 'cover', service: 'open_cover', data: { entity_id: entityId } };
  if (['close', 'close_cover', 'turn_off'].includes(action)) return { domain: 'cover', service: 'close_cover', data: { entity_id: entityId } };
  if (['stop', 'stop_cover'].includes(action)) return { domain: 'cover', service: 'stop_cover', data: { entity_id: entityId } };
  const position = parsePercent(value);
  if (['set', 'set_position', 'set_cover_position'].includes(action) && position !== null) {
    return { domain: 'cover', service: 'set_cover_position', data: { entity_id: entityId, position } };
  }
  return null;
}

function climateService(action, entityId, value) {
  const number = parseNumber(value);
  if (['set', 'set_temperature'].includes(action) && number !== null) {
    return { domain: 'climate', service: 'set_temperature', data: { entity_id: entityId, temperature: number } };
  }
  if (['set_hvac_mode', 'mode'].includes(action) && value) {
    return { domain: 'climate', service: 'set_hvac_mode', data: { entity_id: entityId, hvac_mode: String(value) } };
  }
  return null;
}

function numericService(domain, entityId, value) {
  const number = parseNumber(value);
  if (number === null) return null;
  return { domain, service: 'set_value', data: { entity_id: entityId, value: number } };
}

function selectService(domain, entityId, value) {
  if (!value) return null;
  return { domain, service: 'select_option', data: { entity_id: entityId, option: String(value) } };
}

function parseNumber(value) {
  const match = String(value ?? '').replace(',', '.').match(/-?\d+(\.\d+)?/);
  return match ? Number(match[0]) : null;
}

function parsePercent(value) {
  const number = parseNumber(value);
  if (number === null) return null;
  return Math.max(0, Math.min(100, Math.round(number)));
}

function summarizeHistory(history) {
  const groups = Array.isArray(history) ? history : [];
  return groups.map(series => {
    const samples = Array.isArray(series) ? series : [];
    const entityId = samples[0]?.entity_id || '';
    const values = samples.map(sample => Number(sample.state)).filter(Number.isFinite);
    const last = samples[samples.length - 1];
    return {
      entity_id: entityId,
      first: samples[0]?.state ?? null,
      last: last?.state ?? null,
      min: values.length ? Math.min(...values) : null,
      max: values.length ? Math.max(...values) : null,
      count: samples.length,
      unit: last?.attributes?.unit_of_measurement || null,
    };
  });
}

function startIsoForPeriod(period) {
  const now = new Date();
  if (period === 'today') {
    now.setHours(0, 0, 0, 0);
  } else if (period === 'week' || period === '7d') {
    now.setDate(now.getDate() - 7);
  } else {
    now.setHours(now.getHours() - 24);
  }
  return now.toISOString();
}

function arrayValue(value) {
  return Array.isArray(value) ? value.map(String) : String(value || '').split(',').map(item => item.trim()).filter(Boolean);
}

function unique(values) {
  return [...new Set(values)];
}

function domainFromEntity(entityId) {
  return String(entityId || '').split('.')[0];
}

const TOOL_SCHEMAS = [
  {
    type: 'function',
    function: {
      name: 'search_home',
      description: 'Busca entidades, areas y comandos de Home Assistant por lenguaje natural.',
      parameters: {
        type: 'object',
        properties: {
          query: { type: 'string', description: 'Pregunta o concepto buscado, por ejemplo energia, coche, bateria, salon.' },
          intent: { type: 'string', enum: ['read', 'control', 'command', 'status'], description: 'Tipo de necesidad del usuario.' },
          limit: { type: 'number', description: 'Maximo de entidades a devolver.' },
        },
        required: ['query'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'get_home_state',
      description: 'Lee estados actuales de entidades HA permitidas.',
      parameters: {
        type: 'object',
        properties: {
          entity_ids: { type: 'array', items: { type: 'string' }, description: 'Lista de entity_id.' },
        },
        required: ['entity_ids'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'get_home_history',
      description: 'Resume historial HA de entidades permitidas.',
      parameters: {
        type: 'object',
        properties: {
          entity_ids: { type: 'array', items: { type: 'string' } },
          period: { type: 'string', enum: ['today', '24h', 'week'] },
        },
        required: ['entity_ids', 'period'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'control_entity',
      description: 'Controla una entidad HA con mapa seguro local. No acepta servicios arbitrarios.',
      parameters: {
        type: 'object',
        properties: {
          entity_id: { type: 'string' },
          action: { type: 'string', enum: ['turn_on', 'turn_off', 'set', 'open', 'close', 'stop', 'select_option', 'set_value', 'set_temperature', 'set_hvac_mode'] },
          value: { type: ['string', 'number', 'null'] },
        },
        required: ['entity_id', 'action'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'run_command',
      description: 'Ejecuta un comando predefinido en commands.json, por ejemplo EVCC, V2C o SAJ.',
      parameters: {
        type: 'object',
        properties: {
          command_id: { type: 'string' },
          params: { type: 'object' },
        },
        required: ['command_id'],
      },
    },
  },
];

module.exports = {
  ToolRegistry,
  serviceForAction,
  summarizeHistory,
};
