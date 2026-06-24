'use strict';

const fs = require('node:fs');
const path = require('node:path');

class RateLimiter {
  constructor(filePath, now = () => Date.now()) {
    this.filePath = filePath;
    this.now = now;
    this.state = this.load();
  }

  load() {
    try {
      return JSON.parse(fs.readFileSync(this.filePath, 'utf8'));
    } catch {
      return { buckets: {}, observed: {} };
    }
  }

  save() {
    fs.mkdirSync(path.dirname(this.filePath), { recursive: true });
    fs.writeFileSync(this.filePath, JSON.stringify(this.state, null, 2));
  }

  checkAndReserve(key, limits, usage = {}) {
    const now = this.now();
    const bucket = this.bucket(key);
    const checks = [
      ['rpm', 'requestsMinute', 60_000, usage.requests || 1],
      ['rpd', 'requestsDay', 86_400_000, usage.requests || 1],
      ['tpm', 'tokensMinute', 60_000, usage.tokens || 0],
      ['tpd', 'tokensDay', 86_400_000, usage.tokens || 0],
      ['ash', 'audioHour', 3_600_000, usage.audioSeconds || 0],
      ['asd', 'audioDay', 86_400_000, usage.audioSeconds || 0],
    ];

    for (const [limitName, bucketName, windowMs] of checks) {
      this.roll(bucket, bucketName, windowMs, now);
      const limit = Number(limits?.[limitName] || 0);
      const amount = checks.find(item => item[1] === bucketName)[3];
      if (limit > 0 && amount > 0 && bucket[bucketName].used + amount > limit) {
        return { allowed: false, limit: limitName };
      }
    }

    for (const [, bucketName, , amount] of checks) {
      if (amount > 0) bucket[bucketName].used += amount;
    }
    this.save();
    return { allowed: true };
  }

  recordHeaders(key, headers) {
    const get = name => {
      if (!headers) return undefined;
      if (typeof headers.get === 'function') return headers.get(name);
      return headers[name] || headers[name.toLowerCase()];
    };
    this.state.observed[key] = {
      limitRequests: get('x-ratelimit-limit-requests') || null,
      limitTokens: get('x-ratelimit-limit-tokens') || null,
      remainingRequests: get('x-ratelimit-remaining-requests') || null,
      remainingTokens: get('x-ratelimit-remaining-tokens') || null,
      resetRequests: get('x-ratelimit-reset-requests') || null,
      resetTokens: get('x-ratelimit-reset-tokens') || null,
      updatedAt: new Date(this.now()).toISOString(),
    };
    this.save();
  }

  bucket(key) {
    if (!this.state.buckets[key]) this.state.buckets[key] = {};
    return this.state.buckets[key];
  }

  roll(bucket, name, windowMs, now) {
    if (!bucket[name] || now >= bucket[name].resetAt) {
      bucket[name] = { used: 0, resetAt: now + windowMs };
    }
  }
}

module.exports = { RateLimiter };
