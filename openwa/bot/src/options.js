'use strict';

const fs = require('node:fs');
const path = require('node:path');

const OPTIONS_PATH = process.env.OPTIONS_PATH || '/data/options.json';
const OPENWA_DATA_DIR = process.env.OPENWA_DATA_DIR || '/data/openwa';
const BOT_DATA_DIR = process.env.BOT_DATA_DIR || '/data/bot';

function readJson(file, fallback) {
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch {
    return fallback;
  }
}

function loadOptions() {
  const raw = readJson(OPTIONS_PATH, {});
  const options = {
    api_master_key: raw.api_master_key || '',
    openwa_api_key: raw.openwa_api_key || '',
    session_id: raw.session_id || readSessionId(),
    log_level: raw.log_level || 'info',
    engine_type: raw.engine_type || 'baileys',
    allowed_senders: Array.isArray(raw.allowed_senders) ? raw.allowed_senders : [],
    recipients: Array.isArray(raw.recipients) ? raw.recipients : [],
    groq_plan: raw.groq_plan || 'free',
    groq_api_key: raw.groq_api_key || '',
    groq_chat_model: raw.groq_chat_model || 'llama-3.1-8b-instant',
    groq_quality_model: raw.groq_quality_model || 'llama-3.3-70b-versatile',
    groq_voice_model: raw.groq_voice_model || 'whisper-large-v3-turbo',
    groq_chat_rpm: raw.groq_chat_rpm,
    groq_chat_rpd: raw.groq_chat_rpd,
    groq_chat_tpm: raw.groq_chat_tpm,
    groq_chat_tpd: raw.groq_chat_tpd,
    groq_quality_rpm: raw.groq_quality_rpm,
    groq_quality_rpd: raw.groq_quality_rpd,
    groq_quality_tpm: raw.groq_quality_tpm,
    groq_quality_tpd: raw.groq_quality_tpd,
    groq_voice_rpm: raw.groq_voice_rpm,
    groq_voice_rpd: raw.groq_voice_rpd,
    groq_voice_ash: raw.groq_voice_ash,
    groq_voice_asd: raw.groq_voice_asd,
    max_audio_seconds: Number(raw.max_audio_seconds || 120),
    chunk_audio: raw.chunk_audio === true,
    critical_confirmation_timeout_seconds: Number(raw.critical_confirmation_timeout_seconds || 300),
    ha_sensors: Array.isArray(raw.ha_sensors) ? raw.ha_sensors : [],
    ha_scripts: Array.isArray(raw.ha_scripts) ? raw.ha_scripts : [],
  };
  return options;
}

function readSessionId() {
  try {
    return fs.readFileSync(path.join(BOT_DATA_DIR, 'session-id'), 'utf8').trim();
  } catch {
    return '';
  }
}

function saveSessionId(sessionId) {
  if (!sessionId) return;
  fs.mkdirSync(BOT_DATA_DIR, { recursive: true });
  fs.writeFileSync(path.join(BOT_DATA_DIR, 'session-id'), `${sessionId}\n`);
}

function readOpenWaApiKey(options = loadOptions()) {
  if (options.openwa_api_key) return options.openwa_api_key;
  const apiKeyPath = path.join(OPENWA_DATA_DIR, '.api-key');
  try {
    return fs.readFileSync(apiKeyPath, 'utf8').trim();
  } catch {
    return '';
  }
}

function helperAuthKey(options = loadOptions()) {
  return options.api_master_key || readOpenWaApiKey(options);
}

module.exports = {
  OPTIONS_PATH,
  OPENWA_DATA_DIR,
  BOT_DATA_DIR,
  loadOptions,
  readSessionId,
  saveSessionId,
  readOpenWaApiKey,
  helperAuthKey,
};
