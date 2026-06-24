'use strict';

const crypto = require('node:crypto');

const LIMIT_MESSAGE = 'Limite IA alcanzado, usa menu fijo';

const FREE_CHAT_LIMITS_BY_MODEL = {
  'allam-2-7b': { rpm: 30, rpd: 7000, tpm: 6000, tpd: 500000 },
  'groq/compound': { rpm: 30, rpd: 250, tpm: 70000, tpd: 0 },
  'groq/compound-mini': { rpm: 30, rpd: 250, tpm: 70000, tpd: 0 },
  'llama-3.1-8b-instant': { rpm: 30, rpd: 14400, tpm: 6000, tpd: 500000 },
  'llama-3.3-70b-versatile': { rpm: 30, rpd: 1000, tpm: 12000, tpd: 100000 },
  'meta-llama/llama-4-scout-17b-16e-instruct': { rpm: 30, rpd: 1000, tpm: 30000, tpd: 500000 },
  'meta-llama/llama-prompt-guard-2-22m': { rpm: 30, rpd: 14400, tpm: 15000, tpd: 500000 },
  'meta-llama/llama-prompt-guard-2-86m': { rpm: 30, rpd: 14400, tpm: 15000, tpd: 500000 },
  'openai/gpt-oss-120b': { rpm: 30, rpd: 1000, tpm: 8000, tpd: 200000 },
  'openai/gpt-oss-20b': { rpm: 30, rpd: 1000, tpm: 8000, tpd: 200000 },
  'openai/gpt-oss-safeguard-20b': { rpm: 30, rpd: 1000, tpm: 8000, tpd: 200000 },
  'qwen/qwen3-32b': { rpm: 60, rpd: 1000, tpm: 6000, tpd: 500000 },
  'qwen/qwen3.6-27b': { rpm: 30, rpd: 1000, tpm: 8000, tpd: 200000 },
};

const FREE_CHAT_LIMITS = FREE_CHAT_LIMITS_BY_MODEL['llama-3.1-8b-instant'];
const FREE_QUALITY_LIMITS = FREE_CHAT_LIMITS_BY_MODEL['llama-3.3-70b-versatile'];

const FREE_VOICE_LIMITS_BY_MODEL = {
  'whisper-large-v3': { rpm: 20, rpd: 2000, ash: 7200, asd: 28800 },
  'whisper-large-v3-turbo': { rpm: 20, rpd: 2000, ash: 7200, asd: 28800 },
};

const FREE_VOICE_LIMITS = FREE_VOICE_LIMITS_BY_MODEL['whisper-large-v3-turbo'];

function normalizeJid(value) {
  if (!value) return '';
  let jid = String(value).trim().toLowerCase();
  if (!jid) return '';
  if (/^\+?\d+$/.test(jid)) {
    jid = `${jid.replace(/^\+/, '')}@c.us`;
  }
  return jid;
}

function senderFromMessage(message) {
  return normalizeJid(message?.author || message?.sender || message?.from || message?.chatId);
}

function isAllowedSender(message, allowedSenders) {
  const sender = senderFromMessage(message);
  const allowed = (allowedSenders || []).map(normalizeJid).filter(Boolean);
  return allowed.includes(sender);
}

function menuText() {
  return [
    'Menu OpenWA HA',
    '1. Resumen casa',
    '2. Luces encendidas',
    'Escribe: estado de cocina',
    'Escribe: enciende cargador',
    'Escribe: apaga luz salon',
    'Escribe: pon consigna a 22',
    '9. Ayuda IA',
  ].join('\n');
}

function routeText(text) {
  const value = String(text || '').trim().toLowerCase();
  if (!value || value === 'menu' || value === 'inicio') return { kind: 'menu' };
  if (value === '1') return { kind: 'home_read', query: '' };
  if (value === '2') return { kind: 'home_read', query: 'luces encendidas' };
  if (value === '3') return { kind: 'script', name: 'carga_rapida' };
  if (value === '4') return { kind: 'script', name: 'activar_cargador' };
  if (value === '5') return { kind: 'script', name: 'parar_cargador' };
  if (value === '6') return { kind: 'script', name: 'modo_evcc' };
  if (value === '7') return { kind: 'script', name: 'modo_v2c' };
  if (value === '9') return { kind: 'ai_help' };
  if (value === 'si') return { kind: 'confirm' };
  const command = parseHomeCommand(value);
  if (command) return command;
  return { kind: 'unknown' };
}

function parseHomeCommand(text) {
  const value = normalizeSearchText(text);
  const readMatch = value.match(/^(estado|consulta|dime|muestra)( de| del| la| el)? (?<query>.+)$/);
  if (readMatch?.groups?.query) return { kind: 'home_read', query: readMatch.groups.query };

  const turnOn = value.match(/^(enciende|prende|activa|abre|sube)( el| la| los| las)? (?<query>.+)$/);
  if (turnOn?.groups?.query) return { kind: 'home_control', action: actionFromVerb(turnOn[1]), query: turnOn.groups.query };

  const turnOff = value.match(/^(apaga|desactiva|cierra|baja|para|deten)( el| la| los| las)? (?<query>.+)$/);
  if (turnOff?.groups?.query) return { kind: 'home_control', action: actionFromVerb(turnOff[1]), query: turnOff.groups.query };

  const setValue = value.match(/^(pon|establece|ajusta|cambia)( el| la)? (?<query>.+?) (a|en) (?<value>.+)$/);
  if (setValue?.groups?.query && setValue?.groups?.value) {
    return { kind: 'home_control', action: 'set', query: setValue.groups.query, value: setValue.groups.value };
  }
  return null;
}

function actionFromVerb(verb) {
  if (['abre', 'sube'].includes(verb)) return 'open';
  if (['cierra', 'baja'].includes(verb)) return 'close';
  if (['para', 'deten'].includes(verb)) return 'stop';
  if (['apaga', 'desactiva'].includes(verb)) return 'turn_off';
  return 'turn_on';
}

function findScript(options, name) {
  return (options.ha_scripts || []).find(script => normalizeName(script.name) === normalizeName(name));
}

function findSensors(options, group) {
  const normalized = normalizeName(group);
  return (options.ha_sensors || []).filter(sensor => normalizeName(sensor.name).includes(normalized));
}

function normalizeName(value) {
  return normalizeSearchText(value)
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');
}

function normalizeSearchText(value) {
  return String(value || '')
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
}

function verifyOpenWaSignature({ rawBody, signature, secret }) {
  if (!secret) return true;
  if (!signature || !signature.startsWith('sha256=')) return false;
  const expected =
    'sha256=' + crypto.createHmac('sha256', secret).update(rawBody).digest('hex');
  if (expected.length !== signature.length) return false;
  return crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(signature));
}

function groqLimits(options, mode) {
  if (mode === 'quality') {
    if (options.groq_profile !== 'custom' && options.groq_plan !== 'custom') {
      return { ...(FREE_CHAT_LIMITS_BY_MODEL[options.groq_quality_model] || FREE_QUALITY_LIMITS) };
    }
    return configuredQualityLimits(options);
  }
  if (mode === 'voice') {
    if (options.groq_profile !== 'custom' && options.groq_plan !== 'custom') {
      return { ...(FREE_VOICE_LIMITS_BY_MODEL[options.groq_voice_model] || FREE_VOICE_LIMITS) };
    }
    return configuredVoiceLimits(options);
  }
  if (options.groq_profile !== 'custom' && options.groq_plan !== 'custom') {
    return { ...(FREE_CHAT_LIMITS_BY_MODEL[options.groq_chat_model] || FREE_CHAT_LIMITS) };
  }
  return configuredChatLimits(options);
}

function configuredQualityLimits(options) {
    return {
      rpm: numberOption(options.groq_quality_rpm, FREE_QUALITY_LIMITS.rpm),
      rpd: numberOption(options.groq_quality_rpd, FREE_QUALITY_LIMITS.rpd),
      tpm: numberOption(options.groq_quality_tpm, FREE_QUALITY_LIMITS.tpm),
      tpd: numberOption(options.groq_quality_tpd, FREE_QUALITY_LIMITS.tpd),
    };
}

function configuredVoiceLimits(options) {
  return {
    rpm: numberOption(options.groq_voice_rpm, FREE_VOICE_LIMITS.rpm),
    rpd: numberOption(options.groq_voice_rpd, FREE_VOICE_LIMITS.rpd),
    ash: numberOption(options.groq_voice_ash, FREE_VOICE_LIMITS.ash),
    asd: numberOption(options.groq_voice_asd, FREE_VOICE_LIMITS.asd),
  };
}

function configuredChatLimits(options) {
  return {
    rpm: numberOption(options.groq_chat_rpm, FREE_CHAT_LIMITS.rpm),
    rpd: numberOption(options.groq_chat_rpd, FREE_CHAT_LIMITS.rpd),
    tpm: numberOption(options.groq_chat_tpm, FREE_CHAT_LIMITS.tpm),
    tpd: numberOption(options.groq_chat_tpd, FREE_CHAT_LIMITS.tpd),
  };
}

function numberOption(value, fallback) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : fallback;
}

function estimateTokens(text) {
  return Math.max(1, Math.ceil(String(text || '').length / 4));
}

module.exports = {
  LIMIT_MESSAGE,
  FREE_CHAT_LIMITS,
  FREE_QUALITY_LIMITS,
  FREE_VOICE_LIMITS,
  FREE_CHAT_LIMITS_BY_MODEL,
  FREE_VOICE_LIMITS_BY_MODEL,
  normalizeJid,
  senderFromMessage,
  isAllowedSender,
  menuText,
  routeText,
  parseHomeCommand,
  findScript,
  findSensors,
  normalizeName,
  normalizeSearchText,
  verifyOpenWaSignature,
  groqLimits,
  estimateTokens,
};
