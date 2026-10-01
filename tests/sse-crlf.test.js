const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');
const { streamChatCompletion } = require('../desktop/src/main/llm');

function crlfResponse(content) {
  const event = `data: ${JSON.stringify({ choices: [{ delta: { content } }] })}\r\n\r\n`;
  // Split the final CRLF across reads, as a streaming response may do.
  const chunks = [event.slice(0, -1), event.slice(-1)]
    .map((part) => new TextEncoder().encode(part));
  return {
    ok: true,
    body: { getReader: () => ({
      async read() {
        return chunks.length
          ? { done: false, value: chunks.shift() }
          : { done: true };
      }
    }) }
  };
}

test('desktop reads CRLF-delimited SSE across chunks', async () => {
  const originalFetch = global.fetch;
  global.fetch = async () => crlfResponse(JSON.stringify({
    mode: 'word', words: [{ word: 'term', meaning_cn: '你好' }]
  }));
  try {
    const result = await streamChatCompletion(
      { baseURL: 'https://api.example/v1', apiKey: 'key', model: 'model' },
      'term'
    );
    assert.match(result, /你好/);
  } finally {
    global.fetch = originalFetch;
  }
});

test('extension reads CRLF-delimited SSE across chunks', async () => {
  let onConnect;
  const messages = [];
  const context = {
    AbortController,
    TextDecoder,
    importScripts() {},
    WordHookPrompt: { SYSTEM_PROMPT: 'system', userPrompt: (_mode, text) => text },
    chrome: {
      storage: { local: {
        get: async (key) => key === 'llm_config_v1'
          ? { [key]: { baseURL: 'https://api.example/v1', apiKey: 'key', model: 'model' } }
          : { [key]: {} },
        set: async () => {}
      } },
      runtime: {
        onConnect: { addListener: (handler) => { onConnect = handler; } },
        onMessage: { addListener() {} }
      }
    },
    fetch: async () => crlfResponse(JSON.stringify({
      mode: 'word', words: [{ word: 'term', meaning_cn: '你好' }]
    }))
  };
  vm.createContext(context);
  vm.runInContext(fs.readFileSync(path.join(__dirname, '..', 'background.js'), 'utf8'), context);

  let onMessage;
  onConnect({
    name: 'analyze',
    onDisconnect: { addListener() {} },
    onMessage: { addListener: (handler) => { onMessage = handler; } },
    postMessage: (message) => messages.push(message),
    disconnect() {}
  });
  await onMessage({ type: 'start', mode: 'word', text: 'term' });

  const done = messages.find((message) => message.type === 'done');
  assert.ok(done, `expected a completed analysis, received ${JSON.stringify(messages)}`);
  assert.equal(done.data.words[0].meaning_cn, '你好');
});
