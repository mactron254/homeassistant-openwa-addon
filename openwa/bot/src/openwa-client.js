'use strict';

const OPENWA_BASE_URL = process.env.OPENWA_BASE_URL || 'http://127.0.0.1:2785';

class OpenWaClient {
  constructor(apiKey) {
    this.apiKey = apiKey;
  }

  async request(method, path, body) {
    if (!this.apiKey) throw new Error('OpenWA API key no disponible');
    const response = await fetch(`${OPENWA_BASE_URL}${path}`, {
      method,
      headers: {
        'X-API-Key': this.apiKey,
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
      body: body ? JSON.stringify(body) : undefined,
    });
    const text = await response.text();
    let payload;
    try {
      payload = text ? JSON.parse(text) : {};
    } catch {
      payload = { raw: text };
    }
    if (!response.ok) {
      throw new Error(`OpenWA ${response.status}: ${text}`);
    }
    return payload;
  }

  async createSession(name = 'homeassistant') {
    return this.request('POST', '/api/sessions', { name });
  }

  async getSession(sessionId) {
    return this.request('GET', `/api/sessions/${encodeURIComponent(sessionId)}`);
  }

  async listSessions() {
    return this.request('GET', '/api/sessions');
  }

  async startSession(sessionId) {
    return this.request('POST', `/api/sessions/${encodeURIComponent(sessionId)}/start`);
  }

  async getQr(sessionId) {
    return this.request('GET', `/api/sessions/${encodeURIComponent(sessionId)}/qr`);
  }

  async sendText(sessionId, chatId, text) {
    return this.request('POST', `/api/sessions/${encodeURIComponent(sessionId)}/messages/send-text`, {
      chatId,
      text,
    });
  }

  async listWebhooks(sessionId) {
    return this.request('GET', `/api/sessions/${encodeURIComponent(sessionId)}/webhooks`);
  }

  async createWebhook(sessionId, webhook) {
    return this.request('POST', `/api/sessions/${encodeURIComponent(sessionId)}/webhooks`, webhook);
  }
}

module.exports = { OpenWaClient };
