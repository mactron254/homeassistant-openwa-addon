#!/usr/bin/env node
'use strict';

const http = require('node:http');
const { loadOptions, readOpenWaApiKey, helperAuthKey, saveSessionId, BOT_DATA_DIR } = require('./options');
const { verifyOpenWaSignature } = require('./core');
const { RateLimiter } = require('./rate-limiter');
const { OpenWaClient } = require('./openwa-client');
const { GroqClient } = require('./groq-client');
const { HomeAssistantBot } = require('./bot');

const PORT = Number(process.env.BOT_PORT || 2786);
const WEBHOOK_URL = process.env.OPENWA_BOT_WEBHOOK_URL || 'http://127.0.0.1:2786/webhook/openwa';

function json(res, status, payload) {
  const body = JSON.stringify(payload, null, 2);
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Content-Length': Buffer.byteLength(body),
  });
  res.end(body);
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on('data', chunk => chunks.push(chunk));
    req.on('end', () => resolve(Buffer.concat(chunks)));
    req.on('error', reject);
  });
}

async function createRuntime() {
  const options = loadOptions();
  const apiKey = readOpenWaApiKey(options);
  const openwa = new OpenWaClient(apiKey);
  const rateLimiter = new RateLimiter(`${BOT_DATA_DIR}/rate-limits.json`);
  const groq = new GroqClient(options, rateLimiter);
  return { options, openwa, bot: new HomeAssistantBot({ options, openwa, groq }) };
}

async function ensureOpenWaSetup() {
  const { options, openwa } = await createRuntime();
  if (!openwa.apiKey) {
    console.log('[OpenWA Bot ES] OpenWA API key not available yet; setup skipped.');
    return;
  }

  let sessionId = options.session_id;
  if (!sessionId) {
    const sessions = await openwa.listSessions().catch(() => []);
    const existing = Array.isArray(sessions) ? sessions.find(session => session.name === 'homeassistant') || sessions[0] : null;
    const created = existing || (await openwa.createSession('homeassistant'));
    sessionId = created.id || created.sessionId || created.name;
    saveSessionId(sessionId);
    console.log(`[OpenWA Bot ES] Created session: ${sessionId}`);
  }
  if (!sessionId) {
    console.log('[OpenWA Bot ES] No session id available; webhook setup skipped.');
    return;
  }

  try {
    const session = await openwa.getSession(sessionId);
    if (session.status !== 'ready') await openwa.startSession(sessionId);
  } catch {
    await openwa.startSession(sessionId);
  }

  const webhooks = await openwa.listWebhooks(sessionId).catch(() => []);
  const exists = Array.isArray(webhooks) && webhooks.some(webhook => webhook.url === WEBHOOK_URL);
  if (!exists) {
    await openwa.createWebhook(sessionId, {
      url: WEBHOOK_URL,
      events: ['message.received'],
      secret: helperAuthKey(options),
      retryCount: 3,
    });
    console.log('[OpenWA Bot ES] Webhook registered.');
  }
}

const server = http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
    const runtime = await createRuntime();

    if (req.method === 'GET' && url.pathname === '/') {
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
      res.end('<h1>OpenWA Bot ES</h1><p>Bot activo.</p>');
      return;
    }

    if (req.method === 'GET' && url.pathname === '/health') {
      json(res, 200, { helper: 'ok', groq_plan: runtime.options.groq_plan });
      return;
    }

    if (req.method === 'GET' && url.pathname === '/qr') {
      const key = req.headers['x-api-key'];
      if (key !== helperAuthKey(runtime.options)) return json(res, 401, { error: 'unauthorized' });
      const qr = await runtime.openwa.getQr(runtime.options.session_id);
      json(res, 200, qr);
      return;
    }

    if (req.method === 'POST' && url.pathname === '/webhook/openwa') {
      const raw = await readBody(req);
      const webhookSecret = helperAuthKey(runtime.options);
      if (!webhookSecret) return json(res, 503, { error: 'webhook_secret_unavailable' });
      if (
        !verifyOpenWaSignature({
          rawBody: raw,
          signature: req.headers['x-openwa-signature'],
          secret: webhookSecret,
        })
      ) {
        return json(res, 401, { error: 'invalid_signature' });
      }
      const payload = JSON.parse(raw.toString('utf8'));
      await runtime.bot.handleOpenWaPayload(payload);
      json(res, 200, { ok: true });
      return;
    }

    if (req.method === 'POST' && (url.pathname === '/send' || url.pathname.startsWith('/send/'))) {
      const key = req.headers['x-api-key'];
      if (key !== helperAuthKey(runtime.options)) return json(res, 401, { error: 'unauthorized' });
      const body = JSON.parse((await readBody(req)).toString('utf8') || '{}');
      const alias = url.pathname.startsWith('/send/') ? url.pathname.slice('/send/'.length) : '';
      const recipient = alias
        ? runtime.options.recipients.find(item => item.name === alias)?.chat_id
        : body.chat_id || body.chatId;
      if (!recipient) return json(res, 400, { error: 'missing_chat_id' });
      const result = await runtime.openwa.sendText(runtime.options.session_id, recipient, body.message || body.text || '');
      json(res, 200, result);
      return;
    }

    json(res, 404, { error: 'not_found' });
  } catch (error) {
    console.error('[OpenWA Bot ES]', error);
    json(res, 500, { error: 'internal_error', message: error.message });
  }
});

server.listen(PORT, '0.0.0.0', () => {
  console.log(`[OpenWA Bot ES] Listening on ${PORT}`);
  ensureOpenWaSetup().catch(error => console.error('[OpenWA Bot ES] setup failed:', error));
});
