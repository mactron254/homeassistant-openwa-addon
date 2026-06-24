'use strict';

const HA_BASE_URL = process.env.HA_BASE_URL || 'http://supervisor/core/api';
const HA_TOKEN = process.env.SUPERVISOR_TOKEN || '';

async function haRequest(method, path, body) {
  if (!HA_TOKEN) {
    throw new Error('SUPERVISOR_TOKEN no disponible');
  }
  const response = await fetch(`${HA_BASE_URL}${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${HA_TOKEN}`,
      'Content-Type': 'application/json',
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await response.text();
  let payload;
  try {
    payload = text ? JSON.parse(text) : {};
  } catch {
    payload = { raw: text };
  }
  if (!response.ok) {
    throw new Error(`HA ${response.status}: ${text}`);
  }
  return payload;
}

async function getState(entityId) {
  return haRequest('GET', `/states/${encodeURIComponent(entityId)}`);
}

async function callScript(entityId) {
  return haRequest('POST', '/services/script/turn_on', { entity_id: entityId });
}

module.exports = {
  getState,
  callScript,
};
