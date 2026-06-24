'use strict';

const fs = require('node:fs');
const { LIMIT_MESSAGE, estimateTokens, groqLimits } = require('./core');

const GROQ_BASE_URL = 'https://api.groq.com/openai/v1';

class GroqClient {
  constructor(options, rateLimiter) {
    this.options = options;
    this.rateLimiter = rateLimiter;
  }

  enabled() {
    return Boolean(this.options.groq_api_key);
  }

  async classify(text) {
    if (!this.enabled()) return { action: 'menu' };
    const model = this.options.groq_chat_model;
    const tokens = estimateTokens(text) + 200;
    const allowed = this.rateLimiter.checkAndReserve(`chat:${model}`, groqLimits(this.options, 'chat'), {
      requests: 1,
      tokens,
    });
    if (!allowed.allowed) return { error: LIMIT_MESSAGE };

    const response = await fetch(`${GROQ_BASE_URL}/chat/completions`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${this.options.groq_api_key}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model,
        temperature: 0,
        response_format: { type: 'json_object' },
        messages: [
          {
            role: 'system',
            content:
              'Clasifica el texto para un bot de Home Assistant. Responde solo JSON con action: menu, solar_status, charger_status, carga_rapida, activar_cargador, parar_cargador, modo_evcc, modo_v2c, none. Nunca ejecutes acciones.',
          },
          { role: 'user', content: text },
        ],
      }),
    });
    this.rateLimiter.recordHeaders(`chat:${model}`, response.headers);
    if (response.status === 429) return { error: LIMIT_MESSAGE };
    const payload = await response.json();
    const content = payload?.choices?.[0]?.message?.content || '{}';
    try {
      return JSON.parse(content);
    } catch {
      return { action: 'none' };
    }
  }

  async transcribe(audioPath, durationSeconds) {
    if (!this.enabled()) throw new Error('Groq API key no configurada');
    const model = this.options.groq_voice_model;
    const allowed = this.rateLimiter.checkAndReserve(`voice:${model}`, groqLimits(this.options, 'voice'), {
      requests: 1,
      audioSeconds: Math.ceil(durationSeconds),
    });
    if (!allowed.allowed) return { error: LIMIT_MESSAGE };

    const form = new FormData();
    form.append('model', model);
    form.append('language', 'es');
    form.append('temperature', '0');
    form.append('response_format', 'json');
    form.append('file', new Blob([fs.readFileSync(audioPath)], { type: 'audio/flac' }), 'audio.flac');

    const response = await fetch(`${GROQ_BASE_URL}/audio/transcriptions`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${this.options.groq_api_key}`,
      },
      body: form,
    });
    this.rateLimiter.recordHeaders(`voice:${model}`, response.headers);
    if (response.status === 429) return { error: LIMIT_MESSAGE };
    if (!response.ok) throw new Error(`Groq ${response.status}: ${await response.text()}`);
    const payload = await response.json();
    return { text: payload.text || '' };
  }
}

module.exports = { GroqClient };
