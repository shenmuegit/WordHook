const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

function createElement(id, initialValue = '') {
  return {
    id,
    value: initialValue,
    textContent: '',
    className: '',
    style: {},
    addEventListener(event, handler) {
      this[`on${event}`] = handler;
    },
    appendChild() {},
    click() {},
    remove() {}
  };
}

test('popup saves HTTPS API config before requesting host permission', async () => {
  const events = [];
  const elements = {
    baseURL: createElement('baseURL', 'https://api.example.com/v1'),
    model: createElement('model', 'example-model'),
    apiKey: createElement('apiKey', 'sk-example'),
    save: createElement('save'),
    status: createElement('status'),
    cardStatus: createElement('cardStatus'),
    cardCount: createElement('cardCount'),
    export: createElement('export'),
    clear: createElement('clear'),
    copyTts: createElement('copyTts'),
    ttsLine: createElement('ttsLine')
  };
  elements.ttsLine.textContent = '{{tts en_US:正面}}';

  const context = {
    Blob: function Blob() {},
    URL,
    confirm: () => false,
    document: {
      body: createElement('body'),
      createElement: () => createElement('dynamic'),
      getElementById: (id) => elements[id]
    },
    navigator: {
      clipboard: {
        writeText: async () => {}
      }
    },
    setTimeout,
    chrome: {
      permissions: {
        request: async () => {
          events.push('permissions.request');
          return false;
        }
      },
      storage: {
        local: {
          get: async () => ({}),
          set: async (value) => {
            events.push('storage.set');
            events.push(value.llm_config_v1);
          }
        }
      }
    }
  };

  vm.createContext(context);
  const popupJs = fs.readFileSync(path.join(__dirname, '..', 'popup.js'), 'utf8');
  vm.runInContext(popupJs, context, { filename: 'popup.js' });

  await elements.save.onclick();

  assert.equal(events[0], 'storage.set');
  assert.deepEqual(JSON.parse(JSON.stringify(events[1])), {
    baseURL: 'https://api.example.com/v1',
    model: 'example-model',
    apiKey: 'sk-example'
  });
  assert.equal(events[2], 'permissions.request');

  events.length = 0;
  elements.baseURL.value = 'http://api.example.com/v1';
  await elements.save.onclick();

  assert.deepEqual(events, []);
  assert.equal(elements.status.textContent, 'baseURL 必须使用 HTTPS');
});
