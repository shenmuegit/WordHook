const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

test('extension fetches a fresh answer after the API endpoint changes', async () => {
  const store = {
    llm_config_v1: { baseURL: 'https://first.example/v1', apiKey: 'key', model: 'same-model' }
  };
  const fetched = [];
  let onConnect;
  const context = {
    AbortController,
    TextDecoder,
    importScripts() {},
    WordHookPrompt: { SYSTEM_PROMPT: 'system', userPrompt: (_mode, text) => text },
    chrome: {
      storage: { local: {
        get: async (key) => ({ [key]: store[key] }),
        set: async (values) => Object.assign(store, values)
      } },
      runtime: {
        onConnect: { addListener: (handler) => { onConnect = handler; } },
        onMessage: { addListener() {} }
      }
    },
    fetch: async (url) => {
      fetched.push(url);
      const content = JSON.stringify({ source: new URL(url).host });
      const event = `data: ${JSON.stringify({ choices: [{ delta: { content } }] })}\n\n`;
      let sent = false;
      return {
        ok: true,
        body: { getReader: () => ({
          async read() {
            if (sent) return { done: true };
            sent = true;
            return { done: false, value: new TextEncoder().encode(event) };
          }
        }) }
      };
    }
  };

  vm.createContext(context);
  vm.runInContext(fs.readFileSync(path.join(__dirname, '..', 'background.js'), 'utf8'), context);

  async function analyze() {
    let onMessage;
    const messages = [];
    onConnect({
      name: 'analyze',
      onDisconnect: { addListener() {} },
      onMessage: { addListener: (handler) => { onMessage = handler; } },
      postMessage: (message) => messages.push(message),
      disconnect() {}
    });
    await onMessage({ type: 'start', mode: 'word', text: 'term' });
    return messages.find((message) => message.type === 'done').data.source;
  }

  assert.equal(await analyze(), 'first.example');
  store.llm_config_v1 = { ...store.llm_config_v1, baseURL: 'https://second.example/v1' };
  assert.equal(await analyze(), 'second.example');
  assert.deepEqual(fetched, [
    'https://first.example/v1/chat/completions',
    'https://second.example/v1/chat/completions'
  ]);
});
