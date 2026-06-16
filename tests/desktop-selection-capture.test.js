const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

function loadSelectionModule() {
  const events = [];
  const clipboard = {
    value: 'previous',
    readText() {
      events.push(['readText']);
      return this.value;
    },
    writeText(value) {
      events.push(['writeText', value]);
      this.value = value;
    }
  };

  const context = {
    module: { exports: {} },
    setTimeout(callback, ms) {
      events.push(['delay', ms]);
      callback();
    },
    require(name) {
      if (name === 'electron') return { clipboard };
      if (name === 'node:child_process') {
        return {
          execFile(_file, _args, _options, callback) {
            events.push(['execFile']);
            clipboard.value = 'selected text';
            callback(null);
          }
        };
      }
      throw new Error(`Unexpected require: ${name}`);
    }
  };
  context.exports = context.module.exports;

  const source = fs.readFileSync(path.join(process.cwd(), 'desktop', 'src', 'main', 'selection.js'), 'utf8');
  vm.runInNewContext(source, context, { filename: 'selection.js' });

  return { api: context.module.exports, events };
}

test('capture waits for global hotkey release before sending copy', async () => {
  const { api, events } = loadSelectionModule();

  const text = await api.captureSelectedText();

  assert.equal(text, 'selected text');
  const clearIndex = events.findIndex((event) => event[0] === 'writeText' && event[1] === '');
  const copyIndex = events.findIndex((event) => event[0] === 'execFile');
  const firstDelayIndex = events.findIndex((event) => event[0] === 'delay');

  assert(firstDelayIndex >= 0);
  assert(firstDelayIndex < clearIndex);
  assert(clearIndex < copyIndex);
  assert.deepEqual(events[firstDelayIndex], ['delay', 120]);
});
