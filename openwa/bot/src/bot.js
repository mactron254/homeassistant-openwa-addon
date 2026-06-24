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
    const mapped = {
      menu: { kind: 'menu' },
      solar_status: { kind: 'sensor', group: 'solar' },
      charger_status: { kind: 'sensor', group: 'cargador' },
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
    all[sender] = {
      scriptName: normalizeName(scriptName),
      expiresAt: Date.now() + this.options.critical_confirmation_timeout_seconds * 1000,
    };
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

module.exports = { HomeAssistantBot };
