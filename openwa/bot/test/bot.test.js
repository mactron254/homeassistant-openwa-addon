'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'openwa-bot-'));
process.env.BOT_DATA_DIR = tmp;

const ha = require('../src/ha-client');
const { HomeAssistantBot } = require('../src/bot');

test('critical script requires SI before calling Home Assistant', async () => {
  const calls = [];
  ha.callScript = async entityId => {
    calls.push(entityId);
    return {};
  };

  const bot = new HomeAssistantBot({
    options: {
      critical_confirmation_timeout_seconds: 300,
      ha_sensors: [],
      ha_scripts: [{ name: 'carga_rapida', entity_id: 'script.carga_rapida', critical: true }],
    },
    openwa: {},
    groq: { enabled: () => false },
  });

  const prompt = await bot.handleMessage({ from: '34600111222@c.us', body: '3' });
  assert.match(prompt, /Responde SI/);
  assert.deepEqual(calls, []);

  const result = await bot.handleMessage({ from: '34600111222@c.us', body: 'SI' });
  assert.equal(result, 'Ejecutado: carga_rapida');
  assert.deepEqual(calls, ['script.carga_rapida']);
});
