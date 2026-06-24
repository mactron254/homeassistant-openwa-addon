'use strict';

const fs = require('node:fs');
const path = require('node:path');

const OPTIONS_PATH = process.env.OPTIONS_PATH || '/data/options.json';
const OPENWA_DATA_DIR = process.env.OPENWA_DATA_DIR || '/data/openwa';
const BOT_DATA_DIR = process.env.BOT_DATA_DIR || '/data/bot';
const ADDON_CONFIG_DIR = process.env.ADDON_CONFIG_DIR || '/config';

function readJson(file, fallback) {
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch {
    return fallback;
  }
}

function loadOptions() {
  const raw = readJson(OPTIONS_PATH, {});
  const groq = normalizeGroq(raw);
  const homeAssistant = normalizeHomeAssistant(raw);
  const whatsapp = normalizeWhatsapp(raw);
  const assistant = normalizeAssistant(raw);
  const options = {
    api_master_key: raw.api_master_key || '',
    openwa_api_key: raw.openwa_api_key || '',
    session_id: raw.session_id || readSessionId(),
    log_level: raw.log_level || 'info',
    engine_type: raw.engine_type || 'baileys',
    whatsapp,
    home_assistant: homeAssistant,
    assistant,
    groq,
    allowed_senders: whatsapp.allowed_senders,
    recipients: whatsapp.recipients,
    groq_plan: groq.profile === 'custom' ? 'custom' : 'free',
    groq_profile: groq.profile,
    groq_api_key: groq.api_key,
    groq_chat_model: groq.chat_model,
    groq_quality_model: groq.quality_model,
    groq_voice_model: groq.voice_model,
    groq_chat_rpm: groq.custom_limits.chat.rpm,
    groq_chat_rpd: groq.custom_limits.chat.rpd,
    groq_chat_tpm: groq.custom_limits.chat.tpm,
    groq_chat_tpd: groq.custom_limits.chat.tpd,
    groq_quality_rpm: groq.custom_limits.quality.rpm,
    groq_quality_rpd: groq.custom_limits.quality.rpd,
    groq_quality_tpm: groq.custom_limits.quality.tpm,
    groq_quality_tpd: groq.custom_limits.quality.tpd,
    groq_voice_rpm: groq.custom_limits.voice.rpm,
    groq_voice_rpd: groq.custom_limits.voice.rpd,
    groq_voice_ash: groq.custom_limits.voice.ash,
    groq_voice_asd: groq.custom_limits.voice.asd,
    max_audio_seconds: groq.max_audio_seconds,
    chunk_audio: groq.chunk_audio,
    assistant_knowledge_csv: assistant.knowledge_csv,
    assistant_commands_json: assistant.commands_json,
    assistant_max_tool_rounds: assistant.max_tool_rounds,
    assistant_enable_history: assistant.enable_history,
    critical_confirmation_timeout_seconds: homeAssistant.critical.timeout_seconds,
    ha_sensors: legacySensorsFromHomeAssistant(homeAssistant, raw),
    ha_scripts: Array.isArray(raw.ha_scripts) ? raw.ha_scripts : [],
  };
  return options;
}

function normalizeAssistant(raw) {
  const source = raw.assistant && typeof raw.assistant === 'object' ? raw.assistant : {};
  return {
    knowledge_csv: stringOption(source.knowledge_csv ?? raw.assistant_knowledge_csv, 'knowledge.csv'),
    commands_json: stringOption(source.commands_json ?? raw.assistant_commands_json, 'commands.json'),
    max_tool_rounds: numberOption(source.max_tool_rounds ?? raw.assistant_max_tool_rounds, 4),
    enable_history: boolOption(source.enable_history ?? raw.assistant_enable_history, true),
  };
}

function normalizeGroq(raw) {
  const source = raw.groq && typeof raw.groq === 'object' ? raw.groq : {};
  const customLimits = source.custom_limits && typeof source.custom_limits === 'object' ? source.custom_limits : {};
  return {
    api_key: source.api_key || raw.groq_api_key || '',
    profile: source.profile || profileFromLegacyPlan(raw.groq_plan),
    chat_model: source.chat_model || raw.groq_chat_model || 'llama-3.1-8b-instant',
    quality_model: source.quality_model || raw.groq_quality_model || 'llama-3.3-70b-versatile',
    voice_model: source.voice_model || raw.groq_voice_model || 'whisper-large-v3-turbo',
    max_audio_seconds: numberOption(source.max_audio_seconds ?? raw.max_audio_seconds, 120),
    chunk_audio: source.chunk_audio === true || raw.chunk_audio === true,
    custom_limits: {
      chat: {
        rpm: numberOption(customLimits.chat?.rpm ?? raw.groq_chat_rpm, 30),
        rpd: numberOption(customLimits.chat?.rpd ?? raw.groq_chat_rpd, 14400),
        tpm: numberOption(customLimits.chat?.tpm ?? raw.groq_chat_tpm, 6000),
        tpd: numberOption(customLimits.chat?.tpd ?? raw.groq_chat_tpd, 500000),
      },
      quality: {
        rpm: numberOption(customLimits.quality?.rpm ?? raw.groq_quality_rpm, 30),
        rpd: numberOption(customLimits.quality?.rpd ?? raw.groq_quality_rpd, 1000),
        tpm: numberOption(customLimits.quality?.tpm ?? raw.groq_quality_tpm, 12000),
        tpd: numberOption(customLimits.quality?.tpd ?? raw.groq_quality_tpd, 100000),
      },
      voice: {
        rpm: numberOption(customLimits.voice?.rpm ?? raw.groq_voice_rpm, 20),
        rpd: numberOption(customLimits.voice?.rpd ?? raw.groq_voice_rpd, 2000),
        ash: numberOption(customLimits.voice?.ash ?? raw.groq_voice_ash, 7200),
        asd: numberOption(customLimits.voice?.asd ?? raw.groq_voice_asd, 28800),
      },
    },
  };
}

function normalizeHomeAssistant(raw) {
  const source = raw.home_assistant && typeof raw.home_assistant === 'object' ? raw.home_assistant : {};
  const read = source.read && typeof source.read === 'object' ? source.read : {};
  const control = source.control && typeof source.control === 'object' ? source.control : {};
  const critical = source.critical && typeof source.critical === 'object' ? source.critical : {};
  const entities = control.entities && typeof control.entities === 'object' ? control.entities : {};
  return {
    read: {
      mode: read.mode || 'allowed_domains',
      domains: arrayOption(read.domains, ['sensor', 'binary_sensor', 'switch', 'light', 'climate', 'cover', 'number', 'input_number', 'select', 'input_select']),
    },
    control: {
      domains: {
        switch: boolOption(control.domains?.switch, true),
        light: boolOption(control.domains?.light, true),
        cover: boolOption(control.domains?.cover, true),
        climate: boolOption(control.domains?.climate, true),
        number: boolOption(control.domains?.number, true),
        input_number: boolOption(control.domains?.input_number, true),
        select: boolOption(control.domains?.select, true),
        input_select: boolOption(control.domains?.input_select, true),
        fan: boolOption(control.domains?.fan, true),
      },
      entities: {
        deny: arrayOption(entities.deny, []),
        allow: arrayOption(entities.allow, []),
      },
    },
    critical: {
      require_confirmation: critical.require_confirmation !== false,
      timeout_seconds: numberOption(critical.timeout_seconds ?? raw.critical_confirmation_timeout_seconds, 300),
      always_confirm_domains: arrayOption(critical.always_confirm_domains, ['lock', 'alarm_control_panel', 'cover', 'climate']),
    },
  };
}

function normalizeWhatsapp(raw) {
  const source = raw.whatsapp && typeof raw.whatsapp === 'object' ? raw.whatsapp : {};
  const recipients = source.recipients || raw.recipients || [];
  return {
    allowed_senders: arrayOption(source.allowed_senders || raw.allowed_senders, []),
    recipients: normalizeRecipients(recipients),
  };
}

function normalizeRecipients(value) {
  if (Array.isArray(value)) return value;
  if (!value || typeof value !== 'object') return [];
  return Object.entries(value)
    .filter(([, chatId]) => chatId)
    .map(([name, chatId]) => ({ name, chat_id: String(chatId) }));
}

function legacySensorsFromHomeAssistant(homeAssistant, raw) {
  if (Array.isArray(raw.ha_sensors)) return raw.ha_sensors;
  return Object.entries(raw.home_assistant?.sensors || {}).map(([name, entityId]) => ({
    name,
    entity_id: entityId,
  }));
}

function profileFromLegacyPlan(value) {
  if (value === 'custom') return 'custom';
  if (value === 'disabled') return 'disabled';
  return 'free_balanced';
}

function arrayOption(value, fallback) {
  return Array.isArray(value) ? value : fallback;
}

function boolOption(value, fallback) {
  return typeof value === 'boolean' ? value : fallback;
}

function numberOption(value, fallback) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : fallback;
}

function stringOption(value, fallback) {
  return typeof value === 'string' && value.trim() ? value.trim() : fallback;
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
  ADDON_CONFIG_DIR,
  loadOptions,
  readSessionId,
  saveSessionId,
  readOpenWaApiKey,
  helperAuthKey,
  normalizeGroq,
  normalizeHomeAssistant,
  normalizeAssistant,
  normalizeWhatsapp,
};
