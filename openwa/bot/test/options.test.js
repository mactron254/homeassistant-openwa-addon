'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');
const { normalizeGroq, normalizeHomeAssistant, normalizeAssistant, normalizeWhatsapp } = require('../src/options');

test('normalizes new Groq config', () => {
  const groq = normalizeGroq({
    groq: {
      api_key: 'key',
      profile: 'custom',
      chat_model: 'qwen/qwen3-32b',
      custom_limits: {
        chat: { rpm: 60, rpd: 1000, tpm: 6000, tpd: 500000 },
      },
    },
  });

  assert.equal(groq.api_key, 'key');
  assert.equal(groq.profile, 'custom');
  assert.equal(groq.chat_model, 'qwen/qwen3-32b');
  assert.equal(groq.custom_limits.chat.rpm, 60);
});

test('normalizes legacy Groq config', () => {
  const groq = normalizeGroq({
    groq_plan: 'custom',
    groq_api_key: 'legacy',
    groq_chat_model: 'llama-3.1-8b-instant',
    groq_chat_rpm: 100,
  });

  assert.equal(groq.api_key, 'legacy');
  assert.equal(groq.profile, 'custom');
  assert.equal(groq.chat_model, 'llama-3.1-8b-instant');
  assert.equal(groq.custom_limits.chat.rpm, 100);
});

test('normalizes Home Assistant control config', () => {
  const config = normalizeHomeAssistant({
    home_assistant: {
      control: {
        domains: { switch: true, light: false },
        entities: { deny: ['switch.bad'], allow: ['switch.good'] },
      },
      critical: { timeout_seconds: 120, always_confirm_domains: ['cover'] },
    },
  });

  assert.equal(config.control.domains.switch, true);
  assert.equal(config.control.domains.light, false);
  assert.deepEqual(config.control.entities.deny, ['switch.bad']);
  assert.deepEqual(config.control.entities.allow, ['switch.good']);
  assert.equal(config.critical.timeout_seconds, 120);
});

test('normalizes assistant config', () => {
  const config = normalizeAssistant({
    assistant: {
      knowledge_csv: 'my-knowledge.csv',
      commands_json: 'my-commands.json',
      max_tool_rounds: 6,
      enable_history: false,
    },
  });

  assert.equal(config.knowledge_csv, 'my-knowledge.csv');
  assert.equal(config.commands_json, 'my-commands.json');
  assert.equal(config.max_tool_rounds, 6);
  assert.equal(config.enable_history, false);
});

test('normalizes WhatsApp recipients map and legacy allowed senders', () => {
  const config = normalizeWhatsapp({
    allowed_senders: ['34600111222@c.us'],
    whatsapp: {
      recipients: { primary: '34600111222@c.us' },
    },
  });

  assert.deepEqual(config.allowed_senders, ['34600111222@c.us']);
  assert.deepEqual(config.recipients, [{ name: 'primary', chat_id: '34600111222@c.us' }]);
});
