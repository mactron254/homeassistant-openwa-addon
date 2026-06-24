'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');
const { GroqClient } = require('../src/groq-client');

test('Groq agent executes local tool call and returns final answer', async () => {
  const calls = [];
  const originalFetch = global.fetch;
  const responses = [
    {
      choices: [{
        message: {
          tool_calls: [{
            id: 'call_1',
            type: 'function',
            function: { name: 'search_home', arguments: '{"query":"energia","intent":"read"}' },
          }],
        },
      }],
    },
    {
      choices: [{ message: { content: 'La planta genera 4.2 kW ahora.' } }],
    },
  ];
  global.fetch = async (_url, init) => {
    calls.push(JSON.parse(init.body));
    return response(responses.shift());
  };

  try {
    const groq = new GroqClient(baseOptions(), fakeLimiter());
    const result = await groq.runAgent('como va la energia', fakeTools());

    assert.equal(result.response, 'La planta genera 4.2 kW ahora.');
    assert.equal(calls[0].tool_choice, 'auto');
    assert.equal(calls[0].tools[0].function.name, 'search_home');
    assert.equal(calls[1].messages.at(-1).role, 'tool');
  } finally {
    global.fetch = originalFetch;
  }
});

test('Groq agent stops after max tool rounds', async () => {
  const originalFetch = global.fetch;
  global.fetch = async () => response({
    choices: [{
      message: {
        tool_calls: [{
          id: 'call_loop',
          type: 'function',
          function: { name: 'search_home', arguments: '{"query":"x"}' },
        }],
      },
    }],
  });

  try {
    const options = baseOptions();
    options.assistant.max_tool_rounds = 1;
    const result = await new GroqClient(options, fakeLimiter()).runAgent('revisa casa', fakeTools());
    assert.match(result.error, /demasiados pasos/);
  } finally {
    global.fetch = originalFetch;
  }
});

function response(payload) {
  return {
    ok: true,
    status: 200,
    headers: { get: () => null },
    json: async () => payload,
  };
}

function fakeTools() {
  return {
    contextSummary: async () => ({ entities: [], commands: [] }),
    toolSchemas: () => [{ type: 'function', function: { name: 'search_home', parameters: { type: 'object', properties: {} } } }],
    executeTool: async (name, args) => ({ ok: true, name, args }),
    consumePending: () => null,
  };
}

function fakeLimiter() {
  return {
    checkAndReserve: () => ({ allowed: true }),
    recordHeaders: () => {},
  };
}

function baseOptions() {
  return {
    groq_api_key: 'key',
    groq_profile: 'free_balanced',
    groq_chat_model: 'llama-3.1-8b-instant',
    groq_quality_model: 'llama-3.3-70b-versatile',
    assistant: { max_tool_rounds: 4 },
  };
}
