'use strict';

const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const test = require('node:test');
const {
  normalizeJid,
  isAllowedSender,
  routeText,
  verifyOpenWaSignature,
  groqLimits,
  FREE_CHAT_LIMITS,
  FREE_VOICE_LIMITS,
  FREE_CHAT_LIMITS_BY_MODEL,
} = require('../src/core');

test('normalizes phone senders to OpenWA c.us jid', () => {
  assert.equal(normalizeJid('+34600111222'), '34600111222@c.us');
  assert.equal(normalizeJid('34600111222'), '34600111222@c.us');
  assert.equal(normalizeJid('34600111222@c.us'), '34600111222@c.us');
});

test('allows only configured senders', () => {
  const allowed = ['34600111222@c.us'];
  assert.equal(isAllowedSender({ from: '+34600111222' }, allowed), true);
  assert.equal(isAllowedSender({ from: '+34600999888' }, allowed), false);
});

test('verifies OpenWA HMAC signature', () => {
  const rawBody = Buffer.from('{"event":"message.received"}');
  const secret = 'top-secret';
  const signature = 'sha256=' + crypto.createHmac('sha256', secret).update(rawBody).digest('hex');
  assert.equal(verifyOpenWaSignature({ rawBody, signature, secret }), true);
  assert.equal(verifyOpenWaSignature({ rawBody, signature: 'sha256=bad', secret }), false);
});

test('free Groq plan ignores user overrides and uses official free defaults', () => {
  const limits = groqLimits({ groq_plan: 'free', groq_chat_rpm: 999 }, 'chat');
  assert.deepEqual(limits, FREE_CHAT_LIMITS);
});

test('free Groq plan uses current organization limits per model', () => {
  const qwen = groqLimits({ groq_plan: 'free', groq_chat_model: 'qwen/qwen3-32b' }, 'chat');
  assert.deepEqual(qwen, FREE_CHAT_LIMITS_BY_MODEL['qwen/qwen3-32b']);
});

test('leaves natural questions for Groq agent', () => {
  assert.deepEqual(routeText('como va la energia hoy'), { kind: 'unknown' });
  assert.deepEqual(routeText('que estan generando las placas'), { kind: 'unknown' });
});

test('free_balanced Groq profile uses current organization limits per model', () => {
  const qwen = groqLimits({ groq_profile: 'free_balanced', groq_chat_model: 'qwen/qwen3-32b' }, 'chat');
  assert.deepEqual(qwen, FREE_CHAT_LIMITS_BY_MODEL['qwen/qwen3-32b']);
});

test('custom Groq plan uses configured limits', () => {
  const limits = groqLimits(
    {
      groq_plan: 'custom',
      groq_chat_rpm: 100,
      groq_chat_rpd: 2000,
      groq_chat_tpm: 3000,
      groq_chat_tpd: 4000,
    },
    'chat',
  );
  assert.deepEqual(limits, { rpm: 100, rpd: 2000, tpm: 3000, tpd: 4000 });
});

test('voice free limits match Groq current defaults', () => {
  assert.deepEqual(groqLimits({ groq_plan: 'free' }, 'voice'), FREE_VOICE_LIMITS);
});
