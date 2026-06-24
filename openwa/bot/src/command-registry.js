'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { ADDON_CONFIG_DIR } = require('./options');
const { normalizeName, normalizeSearchText } = require('./core');

class CommandRegistry {
  constructor(options, deps = {}) {
    this.options = options;
    this.configDir = deps.configDir || ADDON_CONFIG_DIR;
  }

  load() {
    return buildCommandRegistry(readCommands(resolveConfigPath(this.options.assistant?.commands_json, this.configDir)));
  }
}

function buildCommandRegistry(commands = []) {
  const normalized = commands.map(normalizeCommand).filter(command => command.id && command.actions.length);
  return {
    commands: normalized,
    get(commandId) {
      return normalized.find(command => command.id === commandId) || null;
    },
    search(query, options = {}) {
      return searchCommands(normalized, query, options.limit || 8);
    },
    findBest(query) {
      return searchCommands(normalized, query, 1)[0] || null;
    },
    compact(limit = 40) {
      return normalized.slice(0, limit).map(command => ({
        id: command.id,
        aliases: command.aliases,
        description: command.description,
        critical: command.critical,
      }));
    },
  };
}

function readCommands(filePath) {
  if (!filePath) return [];
  try {
    const payload = JSON.parse(fs.readFileSync(filePath, 'utf8'));
    return Array.isArray(payload) ? payload : [];
  } catch {
    return [];
  }
}

function resolveConfigPath(value, configDir = ADDON_CONFIG_DIR) {
  const file = String(value || 'commands.json').trim();
  if (!file) return '';
  return path.isAbsolute(file) ? file : path.join(configDir, file);
}

function normalizeCommand(command) {
  return {
    id: normalizeName(command.id || command.name || ''),
    aliases: Array.isArray(command.aliases) ? command.aliases.map(String) : [],
    description: String(command.description || command.name || command.id || ''),
    critical: command.critical === true,
    actions: Array.isArray(command.actions) ? command.actions.map(normalizeAction).filter(action => action.entity_id && action.action) : [],
  };
}

function normalizeAction(action) {
  return {
    entity_id: String(action.entity_id || ''),
    action: normalizeName(action.action || ''),
    value: action.value ?? null,
  };
}

function searchCommands(commands, query, limit) {
  const normalized = normalizeSearchText(query);
  if (!normalized) return [];
  return commands
    .map(command => ({ command, score: scoreCommand(command, normalized) }))
    .filter(item => item.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
    .map(item => item.command);
}

function scoreCommand(command, query) {
  const fields = [command.id, command.description, ...command.aliases].map(normalizeSearchText);
  if (fields.includes(query)) return 100;
  const tokens = query.split(/\s+/).filter(Boolean);
  let score = 0;
  for (const token of tokens) {
    if (fields.some(field => field.split(/\s+/).includes(token))) score += 12;
    else if (fields.some(field => field.includes(token))) score += 4;
  }
  return score;
}

module.exports = {
  CommandRegistry,
  buildCommandRegistry,
  resolveConfigPath,
};
