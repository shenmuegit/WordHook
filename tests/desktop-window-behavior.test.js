const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

function loadWindowsModule() {
  const createdWindows = [];

  class FakeBrowserWindow {
    constructor(options) {
      this.options = options;
      this.destroyed = false;
      this.calls = [];
      this.webContents = {
        isLoading: () => false,
        once: (event, handler) => {
          this.calls.push(['webContents.once', event]);
          this.loadHandler = handler;
        },
        send: (channel, payload) => {
          this.calls.push(['webContents.send', channel, payload]);
        }
      };
      createdWindows.push(this);
    }

    isDestroyed() { return this.destroyed; }
    show() { this.calls.push(['show']); }
    showInactive() { this.calls.push(['showInactive']); }
    focus() { this.calls.push(['focus']); }
    restore() { this.calls.push(['restore']); }
    moveTop() { this.calls.push(['moveTop']); }
    setAlwaysOnTop(value, level) { this.calls.push(['setAlwaysOnTop', value, level]); }
    loadFile(file) { this.calls.push(['loadFile', file]); }
    on(event) { this.calls.push(['on', event]); }
  }

  const context = {
    __dirname: path.join(process.cwd(), 'desktop', 'src', 'main'),
    module: { exports: {} },
    require: (name) => {
      if (name === 'node:path') return require('node:path');
      if (name === 'electron') {
        return {
          BrowserWindow: FakeBrowserWindow,
          screen: {
            getPrimaryDisplay: () => ({
              workAreaSize: { width: 1920, height: 1080 }
            })
          }
        };
      }
      throw new Error(`Unexpected require: ${name}`);
    }
  };
  context.exports = context.module.exports;

  const source = fs.readFileSync(path.join(process.cwd(), 'desktop', 'src', 'main', 'windows.js'), 'utf8');
  vm.runInNewContext(source, context, { filename: 'windows.js' });

  return { api: context.module.exports, createdWindows };
}

test('translation window is resizable and foreground-oriented', () => {
  const { api, createdWindows } = loadWindowsModule();

  api.openTranslateWindow('hello');

  assert.equal(createdWindows.length, 1);
  assert.equal(createdWindows[0].options.width, 420);
  assert.equal(createdWindows[0].options.height, 360);
  assert.equal(createdWindows[0].options.frame, false);
  assert.equal(createdWindows[0].options.transparent, true);
  assert.equal(createdWindows[0].options.backgroundColor, '#00000000');
  assert.equal(createdWindows[0].options.resizable, true);
  assert.equal(createdWindows[0].options.skipTaskbar, true);
  assert.equal(createdWindows[0].options.alwaysOnTop, true);
  assert(createdWindows[0].calls.some((call) => call[0] === 'restore'));
  assert(createdWindows[0].calls.some((call) => call[0] === 'show'));
  assert(createdWindows[0].calls.some((call) => call[0] === 'focus'));
});

test('opening an existing translation window brings it back to front', () => {
  const { api, createdWindows } = loadWindowsModule();

  api.openTranslateWindow('first');
  api.openTranslateWindow('second');

  assert.equal(createdWindows.length, 1);
  assert(createdWindows[0].calls.some((call) => call[0] === 'moveTop'));
  assert(createdWindows[0].calls.some((call) => call[0] === 'setAlwaysOnTop' && call[1] === true));
  assert(createdWindows[0].calls.some((call) => call[0] === 'webContents.send' && call[1] === 'translation:start'));
});

test('translation window can show immediately without stealing focus before copy', () => {
  const { api, createdWindows } = loadWindowsModule();

  api.openTranslateWindow('', { focus: false });

  assert.equal(createdWindows.length, 1);
  assert.equal(createdWindows[0].options.show, false);
  assert(createdWindows[0].calls.some((call) => call[0] === 'showInactive'));
  assert(!createdWindows[0].calls.some((call) => call[0] === 'focus'));
  assert(!createdWindows[0].calls.some((call) => call[0] === 'restore'));
  assert(!createdWindows[0].calls.some((call) => call[0] === 'moveTop'));
});
