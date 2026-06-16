const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

function loadSelectionModule() {
  const events = [];
  const children = [];
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
          spawn(_file, _args, _options) {
            events.push(['spawn']);
            const child = {
              stdin: {
                write(value) {
                  events.push(['stdin.write', value]);
                  clipboard.value = 'selected text';
                  setImmediate(() => child.stdoutHandler(Buffer.from('OK\n')));
                }
              },
              stdout: {
                on(event, handler) {
                  if (event === 'data') child.stdoutHandler = handler;
                }
              },
              stderr: { on() {} },
              on(event, handler) {
                events.push(['child.on', event]);
                if (event === 'exit') child.exitHandler = handler;
              }
            };
            children.push(child);
            setImmediate(() => child.stdoutHandler(Buffer.from('READY\n')));
            return child;
          },
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

  return { api: context.module.exports, events, children };
}

test('capture waits for global hotkey release before sending copy', async () => {
  const { api, events } = loadSelectionModule();

  const text = await api.captureSelectedText();

  assert.equal(text, 'selected text');
  const clearIndex = events.findIndex((event) => (
    event[0] === 'writeText' && /^__WORDHOOK_COPY_SENTINEL__/.test(event[1])
  ));
  const copyIndex = events.findIndex((event) => event[0] === 'stdin.write');
  const firstDelayIndex = events.findIndex((event) => event[0] === 'delay');

  assert(firstDelayIndex >= 0);
  assert(firstDelayIndex < clearIndex);
  assert(clearIndex < copyIndex);
  assert.deepEqual(events[firstDelayIndex], ['delay', 120]);
});

test('selection capture can be warmed and reused without spawning per capture', async () => {
  const { api, events } = loadSelectionModule();

  await api.warmSelectionCapture();
  await api.captureSelectedText();
  await api.captureSelectedText();

  assert.equal(events.filter((event) => event[0] === 'spawn').length, 1);
  assert.equal(events.filter((event) => event[0] === 'execFile').length, 0);
  assert.equal(events.filter((event) => event[0] === 'stdin.write').length, 2);
});

test('selection capture uses a sentinel so stale clipboard text is not accepted', async () => {
  const { api, events } = loadSelectionModule();

  await api.captureSelectedText();

  const clearEvent = events.find((event) => event[0] === 'writeText' && event[1] !== 'previous');
  assert(clearEvent);
  assert.match(clearEvent[1], /^__WORDHOOK_COPY_SENTINEL__/);
});
