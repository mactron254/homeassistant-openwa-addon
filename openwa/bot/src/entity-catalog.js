'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { parseCsv } = require('./csv');
const { ADDON_CONFIG_DIR } = require('./options');
const { normalizeSearchText } = require('./core');
const ha = require('./ha-client');

class EntityCatalog {
  constructor(options, deps = {}) {
    this.options = options;
    this.ha = deps.ha || ha;
    this.configDir = deps.configDir || ADDON_CONFIG_DIR;
  }

  async load() {
    const states = await this.ha.getStates();
    return buildCatalog({
      states: Array.isArray(states) ? states : [],
      rows: readKnowledgeRows(resolveConfigPath(this.options.assistant?.knowledge_csv, this.configDir)),
    });
  }
}

function buildCatalog({ states = [], rows = [] }) {
  const byEntity = new Map();
  for (const state of states) {
    if (!state?.entity_id) continue;
    byEntity.set(state.entity_id, entityFromState(state));
  }

  for (const row of rows) {
    if (!row.entity_id) continue;
    const existing = byEntity.get(row.entity_id) || entityFromState({ entity_id: row.entity_id, state: '', attributes: {} });
    byEntity.set(row.entity_id, mergeKnowledge(existing, row));
  }

  const entities = [...byEntity.values()].map(entity => ({
    ...entity,
    search_text: buildSearchText(entity),
  }));

  return {
    entities,
    byEntityId: new Map(entities.map(entity => [entity.entity_id, entity])),
    search(query, options = {}) {
      return searchEntities(entities, query, options);
    },
    get(entityId) {
      return this.byEntityId.get(entityId) || null;
    },
    compact(limit = 80) {
      return entities
        .slice()
        .sort((a, b) => b.priority - a.priority || a.entity_id.localeCompare(b.entity_id))
        .slice(0, limit)
        .map(compactEntity);
    },
  };
}

function readKnowledgeRows(filePath) {
  if (!filePath) return [];
  try {
    return parseCsv(fs.readFileSync(filePath, 'utf8'));
  } catch {
    return [];
  }
}

function resolveConfigPath(value, configDir = ADDON_CONFIG_DIR) {
  const file = String(value || 'knowledge.csv').trim();
  if (!file) return '';
  return path.isAbsolute(file) ? file : path.join(configDir, file);
}

function entityFromState(state) {
  const attributes = state.attributes || {};
  return {
    entity_id: state.entity_id,
    domain: domainFromEntity(state.entity_id),
    friendly_name: attributes.friendly_name || state.entity_id,
    state: state.state ?? '',
    area: '',
    zone: '',
    aliases: [],
    capabilities: defaultCapabilities(state.entity_id),
    priority: 0,
    critical: false,
    description: '',
    device_class: attributes.device_class || '',
    unit: attributes.unit_of_measurement || '',
    options: Array.isArray(attributes.options) ? attributes.options : [],
    attributes: usefulAttributes(attributes),
  };
}

function mergeKnowledge(entity, row) {
  return {
    ...entity,
    friendly_name: row.friendly_name || entity.friendly_name,
    area: row.area || entity.area,
    zone: row.zone || entity.zone,
    aliases: unique([...entity.aliases, ...splitList(row.aliases)]),
    capabilities: splitList(row.capabilities).length ? splitList(row.capabilities) : entity.capabilities,
    priority: numberValue(row.priority, entity.priority),
    critical: boolValue(row.critical, entity.critical),
    description: row.description || entity.description,
  };
}

function defaultCapabilities(entityId) {
  const domain = domainFromEntity(entityId);
  const control = ['switch', 'light', 'cover', 'climate', 'number', 'input_number', 'select', 'input_select', 'fan'];
  return control.includes(domain) ? ['read', 'control'] : ['read'];
}

function usefulAttributes(attributes) {
  const keep = ['device_class', 'unit_of_measurement', 'friendly_name', 'current_position', 'brightness', 'temperature', 'current_temperature', 'hvac_mode', 'percentage'];
  return Object.fromEntries(keep.filter(key => attributes[key] !== undefined).map(key => [key, attributes[key]]));
}

function compactEntity(entity) {
  return {
    entity_id: entity.entity_id,
    name: entity.friendly_name,
    domain: entity.domain,
    area: entity.area,
    zone: entity.zone,
    aliases: entity.aliases,
    capabilities: entity.capabilities,
    priority: entity.priority,
    critical: entity.critical,
    description: entity.description,
    device_class: entity.device_class,
    unit: entity.unit,
  };
}

function searchEntities(entities, query, options = {}) {
  const intent = normalizeSearchText(options.intent || '');
  return entities
    .map(entity => ({ entity, score: scoreEntity(entity, query, intent) }))
    .filter(item => item.score > 0)
    .sort((a, b) => b.score - a.score || b.entity.priority - a.entity.priority)
    .slice(0, options.limit || 12)
    .map(item => item.entity);
}

function scoreEntity(entity, query, intent) {
  const normalized = normalizeSearchText(query);
  if (!normalized) return entity.priority || 1;
  const tokens = normalized.split(/\s+/).filter(token => token && !STOP_WORDS.has(token));
  let score = entity.priority || 0;
  for (const token of tokens) {
    if (entity.entity_id === token) score += 30;
    else if (normalizeSearchText(entity.friendly_name) === token) score += 25;
    else if (entity.aliases.map(normalizeSearchText).includes(token)) score += 20;
    else if (normalizeSearchText(entity.area) === token) score += 15;
    else if (normalizeSearchText(entity.zone) === token) score += 12;
    else if (entity.search_text.includes(token)) score += 5;
  }
  if (intent === 'control' && entity.capabilities.includes('control')) score += 6;
  if (intent === 'read' && entity.capabilities.includes('read')) score += 3;
  return score;
}

function buildSearchText(entity) {
  return normalizeSearchText([
    entity.entity_id,
    entity.domain,
    entity.friendly_name,
    entity.area,
    entity.zone,
    entity.description,
    entity.device_class,
    entity.unit,
    ...entity.aliases,
  ].filter(Boolean).join(' '));
}

function splitList(value) {
  return String(value || '')
    .split(/[;|]/)
    .map(item => item.trim())
    .filter(Boolean);
}

function unique(values) {
  return [...new Set(values.filter(Boolean))];
}

function numberValue(value, fallback) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function boolValue(value, fallback) {
  if (String(value).toLowerCase() === 'true') return true;
  if (String(value).toLowerCase() === 'false') return false;
  return fallback;
}

function domainFromEntity(entityId) {
  return String(entityId || '').split('.')[0];
}

const STOP_WORDS = new Set(['de', 'del', 'la', 'el', 'los', 'las', 'un', 'una', 'que', 'como', 'esta', 'estan', 'hay', 'casa']);

module.exports = {
  EntityCatalog,
  buildCatalog,
  resolveConfigPath,
  compactEntity,
};
