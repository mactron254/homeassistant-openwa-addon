'use strict';

const fs = require('node:fs');
const path = require('node:path');
const {
  LIMIT_MESSAGE,
  senderFromMessage,
  isAllowedSender,
  menuText,
  routeText,
  findScript,
  findSensors,
  normalizeName,
  normalizeSearchText,
} = require('./core');
const { BOT_DATA_DIR } = require('./options');
const ha = require('./ha-client');
const { prepareAudio, cleanupAudio } = require('./audio');

class HomeAssistantBot {
  constructor({ options, openwa, groq }) {
    this.options = options;
    this.openwa = openwa;
    this.groq = groq;
    this.pendingPath = path.join(BOT_DATA_DIR, 'pending-confirmations.json');
  }

  async handleOpenWaPayload(payload) {
    if (payload.event !== 'message.received') return;
    const message = payload.data || {};
    if (message.fromMe || message.isStatusBroadcast) return;
    if (!isAllowedSender(message, this.options.allowed_senders)) return;
    const chatId = message.chatId || message.from;
    const sessionId = payload.sessionId || this.options.session_id;
    if (!chatId || !sessionId) return;

    const response = await this.handleMessage(message);
    if (response) await this.openwa.sendText(sessionId, chatId, response);
  }

  async handleMessage(message) {
    const sender = senderFromMessage(message);
    const pending = this.pendingFor(sender);
    const text = String(message.body || '').trim();

    if (routeText(text).kind === 'confirm' && pending) {
      this.clearPending(sender);
      if (pending.type === 'home_control') return this.executeHomeControl(pending.route, { confirmed: true });
      return this.executeScript(pending.scriptName);
    }

    if (this.isAudioMessage(message)) {
      return this.handleAudio(message);
    }

    const fixedRoute = routeText(text);
    if (fixedRoute.kind !== 'unknown') return this.executeRoute(fixedRoute, sender);

    if (!this.groq.enabled()) {
      return `${menuText()}\n\nIA no configurada. Usa numero de menu.`;
    }

    const classified = await this.groq.classify(text);
    if (classified.error) return classified.error;
    return this.executeAiAction(classified.action, sender);
  }

  async handleAudio(message) {
    if (!this.groq.enabled()) return 'Voz no disponible: falta Groq API key.';
    if (!message.media?.data) return 'Audio recibido, pero OpenWA no entrego el archivo.';
    let prepared;
    try {
      prepared = await prepareAudio(message.media);
      if (prepared.duration > this.options.max_audio_seconds) {
        if (!this.options.chunk_audio) {
          return `Audio demasiado largo (${Math.round(prepared.duration)} s). Maximo: ${this.options.max_audio_seconds} s.`;
        }
        return 'Audio demasiado largo. Troceo automatico aun no activo en esta version.';
      }
      const result = await this.groq.transcribe(prepared.output, prepared.duration);
      if (result.error) return result.error;
      return this.handleMessage({ ...message, body: result.text, type: 'text', media: undefined });
    } finally {
      if (prepared) cleanupAudio(prepared);
    }
  }

  isAudioMessage(message) {
    return ['audio', 'voice'].includes(message.type) || /^audio\//i.test(message.media?.mimetype || '');
  }

  async executeAiAction(action, sender) {
    if (action && typeof action === 'object') {
      const route = this.routeFromAi(action);
      if (route) return this.executeRoute(route, sender);
    }
    const mapped = {
      menu: { kind: 'menu' },
      home_read: { kind: 'home_read', query: '' },
      solar_status: { kind: 'home_read', query: 'solar' },
      charger_status: { kind: 'home_read', query: 'cargador' },
      carga_rapida: { kind: 'script', name: 'carga_rapida' },
      activar_cargador: { kind: 'script', name: 'activar_cargador' },
      parar_cargador: { kind: 'script', name: 'parar_cargador' },
      modo_evcc: { kind: 'script', name: 'modo_evcc' },
      modo_v2c: { kind: 'script', name: 'modo_v2c' },
    };
    return this.executeRoute(mapped[action] || { kind: 'menu' }, sender);
  }

  async executeRoute(route, sender) {
    if (route.kind === 'menu' || route.kind === 'ai_help') return menuText();
    if (route.kind === 'home_read') return this.reportHome(route.query);
    if (route.kind === 'home_control') {
      return this.executeHomeControl(route, { sender });
    }
    if (route.kind === 'sensor') return this.reportSensors(route.group);
    if (route.kind === 'script') {
      const script = findScript(this.options, route.name);
      if (!script) return `Script no configurado: ${route.name}`;
      if (script.critical) {
        this.setPending(sender, route.name);
        return `Accion critica: ${script.name}. Responde SI para confirmar.`;
      }
      return this.executeScript(route.name);
    }
    return menuText();
  }

  routeFromAi(action) {
    const intent = normalizeName(action.intent || action.action || '');
    if (['read', 'status', 'home_read'].includes(intent)) {
      return { kind: 'home_read', query: action.query || action.entity || action.entity_id || '' };
    }
    if (['control', 'home_control', 'turn_on', 'turn_off', 'set', 'open', 'close', 'stop'].includes(intent)) {
      return {
        kind: 'home_control',
        action: action.action || action.service || action.command || intent,
        query: action.query || action.entity || action.entity_id || '',
        value: action.value ?? action.option,
      };
    }
    return null;
  }

  async reportHome(query = '') {
    const states = await this.allowedStates('read');
    const matches = this.findStateMatches(states, query);
    if (!matches.length) return `No encuentro entidades permitidas para: ${query || 'casa'}.`;
    const filtered = filterReadMatches(matches, query).slice(0, 12);
    if (!filtered.length) return `No hay resultados para: ${query}.`;
    return filtered.map(formatState).join('\n');
  }

  async executeHomeControl(route, context = {}) {
    const states = await this.allowedStates('control');
    const match = this.findStateMatches(states, route.query)[0];
    if (!match) return `No encuentro entidad controlable: ${route.query}.`;
    const command = serviceForRoute(match, route);
    if (!command) return `No se puede ejecutar ${route.action} sobre ${match.entity_id}.`;
    const routeWithEntity = { ...route, entity_id: match.entity_id };
    if (!context.confirmed && this.requiresConfirmation(routeWithEntity)) {
      if (context.sender) this.setPending(context.sender, routeWithEntity);
      return `Accion critica: ${command.domain}.${command.service} ${friendlyName(match)}. Responde SI para confirmar.`;
    }
    await ha.callService(command.domain, command.service, command.data);
    return `Ejecutado: ${command.domain}.${command.service} en ${friendlyName(match)}.`;
  }

  requiresConfirmation(route) {
    const critical = this.options.home_assistant?.critical || {};
    if (critical.require_confirmation === false) return false;
    const domains = critical.always_confirm_domains || [];
    const entityId = route.entity_id || route.query || '';
    const domain = String(entityId).includes('.') ? entityId.split('.')[0] : '';
    return domains.includes(domain);
  }

  async allowedStates(mode) {
    const states = await ha.getStates();
    return (Array.isArray(states) ? states : []).filter(state => {
      if (!state?.entity_id) return false;
      return mode === 'control' ? this.canControl(state.entity_id) : this.canRead(state.entity_id);
    });
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

  findStateMatches(states, query = '') {
    const normalizedQuery = normalizeSearchText(query);
    if (!normalizedQuery) return states.slice(0, 12);
    return states
      .map(state => ({ state, score: matchScore(state, normalizedQuery) }))
      .filter(item => item.score > 0)
      .sort((a, b) => b.score - a.score)
      .map(item => item.state);
  }

  async reportSensors(group) {
    const sensors = findSensors(this.options, group);
    if (!sensors.length) return `No hay sensores configurados para ${group}.`;
    const lines = [];
    for (const sensor of sensors) {
      try {
        const state = await ha.getState(sensor.entity_id);
        lines.push(`${sensor.name}: ${state.state}${state.attributes?.unit_of_measurement ? ` ${state.attributes.unit_of_measurement}` : ''}`);
      } catch (error) {
        lines.push(`${sensor.name}: error (${error.message})`);
      }
    }
    return lines.join('\n');
  }

  async executeScript(name) {
    const script = findScript(this.options, name);
    if (!script) return `Script no configurado: ${name}`;
    await ha.callScript(script.entity_id);
    return `Ejecutado: ${script.name}`;
  }

  pendingFor(sender) {
    const all = this.readPending();
    const item = all[sender];
    if (!item) return null;
    if (Date.now() > item.expiresAt) {
      delete all[sender];
      this.writePending(all);
      return null;
    }
    return item;
  }

  setPending(sender, scriptName) {
    const all = this.readPending();
    if (typeof scriptName === 'object') {
      all[sender] = {
        type: 'home_control',
        route: scriptName,
        expiresAt: Date.now() + this.options.critical_confirmation_timeout_seconds * 1000,
      };
    } else {
      all[sender] = {
        scriptName: normalizeName(scriptName),
        expiresAt: Date.now() + this.options.critical_confirmation_timeout_seconds * 1000,
      };
    }
    this.writePending(all);
  }

  clearPending(sender) {
    const all = this.readPending();
    delete all[sender];
    this.writePending(all);
  }

  readPending() {
    try {
      return JSON.parse(fs.readFileSync(this.pendingPath, 'utf8'));
    } catch {
      return {};
    }
  }

  writePending(value) {
    fs.mkdirSync(path.dirname(this.pendingPath), { recursive: true });
    fs.writeFileSync(this.pendingPath, JSON.stringify(value, null, 2));
  }
}

function domainFromEntity(entityId) {
  return String(entityId || '').split('.')[0];
}

function friendlyName(state) {
  return state.attributes?.friendly_name || state.entity_id;
}

function formatState(state) {
  const unit = state.attributes?.unit_of_measurement ? ` ${state.attributes.unit_of_measurement}` : '';
  return `${friendlyName(state)}: ${state.state}${unit}`;
}

function filterReadMatches(states, query) {
  const normalized = normalizeSearchText(query);
  if (!normalized.includes('encendid')) return states;
  return states.filter(state => ['on', 'open', 'heat', 'cool'].includes(String(state.state).toLowerCase()));
}

function matchScore(state, query) {
  const entity = normalizeSearchText(state.entity_id);
  const name = normalizeSearchText(friendlyName(state));
  const aliases = domainAliases(domainFromEntity(state.entity_id)).join(' ');
  const haystack = `${entity} ${name} ${aliases}`;
  const tokens = query.split(/\s+/).filter(token => !STOP_WORDS.has(token));
  if (!tokens.length) return 1;
  let score = 0;
  for (const token of tokens) {
    if (name === token || entity === token) score += 10;
    else if (name.includes(token)) score += 5;
    else if (entity.includes(token)) score += 4;
    else if (aliases.includes(token)) score += 3;
  }
  return score;
}

function domainAliases(domain) {
  return {
    light: ['luz', 'luces', 'lampara', 'lamparas'],
    switch: ['interruptor', 'enchufe', 'switch', 'cargador'],
    cover: ['persiana', 'toldo', 'puerta', 'cover'],
    climate: ['clima', 'termostato', 'temperatura', 'calefaccion', 'aire'],
    sensor: ['sensor', 'estado', 'solar', 'bateria', 'consumo'],
    binary_sensor: ['sensor', 'puerta', 'movimiento', 'presencia'],
    fan: ['ventilador'],
    number: ['numero', 'valor', 'consigna'],
    input_number: ['numero', 'valor', 'consigna'],
    select: ['selector', 'modo'],
    input_select: ['selector', 'modo'],
  }[domain] || [];
}

function serviceForRoute(state, route) {
  const domain = domainFromEntity(state.entity_id);
  const action = normalizeName(route.action || '');
  const value = route.value;
  if (['switch', 'fan'].includes(domain)) return simpleOnOff(domain, action, state.entity_id);
  if (domain === 'light') return lightService(action, state.entity_id, value);
  if (domain === 'cover') return coverService(action, state.entity_id, value);
  if (domain === 'climate') return climateService(action, state.entity_id, value);
  if (['number', 'input_number'].includes(domain)) return numericService(domain, state.entity_id, value);
  if (['select', 'input_select'].includes(domain)) return selectService(domain, state.entity_id, value);
  return null;
}

function simpleOnOff(domain, action, entityId) {
  if (['turn_off', 'off', 'apagar', 'desactivar'].includes(action)) return { domain, service: 'turn_off', data: { entity_id: entityId } };
  if (['turn_on', 'on', 'encender', 'activar'].includes(action)) return { domain, service: 'turn_on', data: { entity_id: entityId } };
  return null;
}

function lightService(action, entityId, value) {
  const command = simpleOnOff('light', action, entityId);
  if (command) {
    const percent = parsePercent(value);
    if (percent !== null && command.service === 'turn_on') command.data.brightness_pct = percent;
    return command;
  }
  if (action === 'set') return { domain: 'light', service: 'turn_on', data: { entity_id: entityId, brightness_pct: parsePercent(value) || 100 } };
  return null;
}

function coverService(action, entityId, value) {
  if (['open', 'turn_on'].includes(action)) return { domain: 'cover', service: 'open_cover', data: { entity_id: entityId } };
  if (['close', 'turn_off'].includes(action)) return { domain: 'cover', service: 'close_cover', data: { entity_id: entityId } };
  if (action === 'stop') return { domain: 'cover', service: 'stop_cover', data: { entity_id: entityId } };
  const position = parsePercent(value);
  if (position !== null) return { domain: 'cover', service: 'set_cover_position', data: { entity_id: entityId, position } };
  return null;
}

function climateService(action, entityId, value) {
  const number = parseNumber(value);
  if (number !== null) return { domain: 'climate', service: 'set_temperature', data: { entity_id: entityId, temperature: number } };
  if (value) return { domain: 'climate', service: 'set_hvac_mode', data: { entity_id: entityId, hvac_mode: String(value) } };
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

const STOP_WORDS = new Set(['de', 'del', 'la', 'el', 'los', 'las', 'un', 'una', 'que', 'esta', 'estan', 'hay', 'casa']);

module.exports = { HomeAssistantBot };
