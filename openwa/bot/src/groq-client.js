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
    return Boolean(this.options.groq_api_key) && this.options.groq_profile !== 'disabled';
  }

  async classify(text) {
    if (!this.enabled()) return { action: 'menu' };
    const useQuality = this.options.groq_profile === 'free_quality';
    const model = useQuality ? this.options.groq_quality_model : this.options.groq_chat_model;
    const tokens = estimateTokens(text) + 200;
    const allowed = this.rateLimiter.checkAndReserve(`chat:${model}`, groqLimits(this.options, useQuality ? 'quality' : 'chat'), {
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
              'Clasifica texto para bot Home Assistant. Responde solo JSON. Formato: {"intent":"read|control|menu|none","query":"texto entidad o zona","action":"turn_on|turn_off|set|open|close|stop","value":"valor opcional"}. Nunca inventes servicios ni ejecutes acciones. Si pide estado, resumen o pregunta natural usa intent read. Preguntas como "como va la energia hoy", "que genera la planta", "placas", "consumo", "bateria" deben ser {"intent":"read","query":"energia hoy"}. Si pide encender/apagar/poner valor usa control.',
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
