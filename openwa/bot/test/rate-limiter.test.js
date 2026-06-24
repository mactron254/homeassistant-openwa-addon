'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');
const { RateLimiter } = require('../src/rate-limiter');

test('blocks before exceeding request and token limits', () => {
  let now = 1000;
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'openwa-rate-'));
  const limiter = new RateLimiter(path.join(tmp, 'limits.json'), () => now);
  const limits = { rpm: 2, rpd: 10, tpm: 10, tpd: 100 };

  assert.deepEqual(limiter.checkAndReserve('chat:model', limits, { requests: 1, tokens: 4 }), { allowed: true });
  assert.deepEqual(limiter.checkAndReserve('chat:model', limits, { requests: 1, tokens: 4 }), { allowed: true });
  assert.deepEqual(limiter.checkAndReserve('chat:model', limits, { requests: 1, tokens: 1 }), {
    allowed: false,
    limit: 'rpm',
  });

  now += 60_001;
  assert.deepEqual(limiter.checkAndReserve('chat:model', limits, { requests: 1, tokens: 7 }), { allowed: true });
  assert.deepEqual(limiter.checkAndReserve('chat:model', limits, { requests: 1, tokens: 4 }), {
    allowed: false,
    limit: 'tpm',
  });
});

test('persists observed Groq rate headers', () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'openwa-rate-'));
  const limiter = new RateLimiter(path.join(tmp, 'limits.json'), () => 42);
  limiter.recordHeaders('chat:model', {
    'x-ratelimit-limit-requests': '14400',
    'x-ratelimit-limit-tokens': '6000',
  });
  const data = JSON.parse(fs.readFileSync(path.join(tmp, 'limits.json'), 'utf8'));
  assert.equal(data.observed['chat:model'].limitRequests, '14400');
  assert.equal(data.observed['chat:model'].limitTokens, '6000');
});
