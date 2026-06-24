#!/usr/bin/env node
'use strict';

const fs = require('node:fs');

const [optionsPath, key, defaultValue = ''] = process.argv.slice(2);

function readOption() {
  try {
    const raw = fs.readFileSync(optionsPath, 'utf8');
    const options = JSON.parse(raw);
    const value = options?.[key];
    if (value === undefined || value === null) return defaultValue;
    if (typeof value === 'string') return value;
    return JSON.stringify(value);
  } catch {
    return defaultValue;
  }
}

process.stdout.write(readOption());
