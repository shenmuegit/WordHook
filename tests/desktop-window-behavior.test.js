const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

function loadWindowsModule() {
  const createdWindows = [];
  const intervals = [];
  let cursorPoint = { x: 0, y: 0 };

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
    hide() { this.calls.push(['hide']); }
    focus() { this.calls.push(['focus']); }
    restore() { this.calls.push(['restore']); }
    moveTop() { this.calls.push(['moveTop']); }
    setAlwaysOnTop(value, level) { this.calls.push(['setAlwaysOnTop', value, level]); }
    setMenu(value) { this.calls.push(['setMenu', value]); }
    getBounds() { return { x: this.options.x, y: this.options.y, width: this.options.width, height: this.options.height }; }
    setBounds(bounds) {
      this.calls.push(['setBounds', bounds]);
      this.options = { ...this.options, ...bounds };
    }
    loadFile(file) { this.calls.push(['loadFile', file]); }
    on(event) { this.calls.push(['on', event]); }
  }

  const context = {
    __dirname: path.join(process.cwd(), 'desktop', 'src', 'main'),
    module: { exports: {} },
    setInterval: (handler, delay) => {
      intervals.push({ handler, delay });
      return intervals.length;
    },
    clearInterval: () => {},
    require: (name) => {
      if (name === 'node:path') return require('node:path');
      if (name === 'electron') {
        return {
          BrowserWindow: FakeBrowserWindow,
          screen: {
            getCursorScreenPoint: () => cursorPoint,
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

  return {
    api: context.module.exports,
    createdWindows,
    intervals,
    setCursorPoint: (point) => {
      cursorPoint = point;
    }
  };
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

test('translation window reports hover state from global cursor bounds', () => {
  const { api, createdWindows, intervals, setCursorPoint } = loadWindowsModule();

  api.openTranslateWindow('hello');

  assert.equal(intervals.length, 1);
  assert.equal(intervals[0].delay, 80);

  setCursorPoint({ x: 1510, y: 800 });
  intervals[0].handler();

  setCursorPoint({ x: 20, y: 20 });
  intervals[0].handler();

  assert(createdWindows[0].calls.some((call) => (
    call[0] === 'webContents.send' &&
    call[1] === 'translation:hover' &&
    call[2].hovered === true
  )));
  assert(createdWindows[0].calls.some((call) => (
    call[0] === 'webContents.send' &&
    call[1] === 'translation:hover' &&
    call[2].hovered === false
  )));
});

test('translation window can be resized from renderer handles', () => {
  const { api, createdWindows, intervals, setCursorPoint } = loadWindowsModule();

  api.openTranslateWindow('hello');
  setCursorPoint({ x: 1500, y: 800 });
  api.beginTranslateResize('se');
  setCursorPoint({ x: 1540, y: 830 });
  intervals[1].handler();
  api.endTranslateResize();

  assert(createdWindows[0].calls.some((call) => (
    call[0] === 'setBounds' &&
    call[1].width === 460 &&
    call[1].height === 390
  )));
});

test('translation window west resize preserves minimum width', () => {
  const { api, createdWindows, intervals, setCursorPoint } = loadWindowsModule();

  api.openTranslateWindow('hello');
  setCursorPoint({ x: 1500, y: 800 });
  api.beginTranslateResize('w');
  setCursorPoint({ x: 1700, y: 800 });
  intervals[1].handler();
  api.endTranslateResize();

  assert(createdWindows[0].calls.some((call) => (
    call[0] === 'setBounds' &&
    call[1].width === 320
  )));
});

test('translation window can be moved from the top drag strip', () => {
  const { api, createdWindows, intervals, setCursorPoint } = loadWindowsModule();

  api.openTranslateWindow('hello');
  setCursorPoint({ x: 1500, y: 800 });
  api.beginTranslateMove();
  setCursorPoint({ x: 1450, y: 850 });
  intervals[1].handler();
  api.endTranslateMove();

  assert(createdWindows[0].calls.some((call) => (
    call[0] === 'setBounds' &&
    call[1].x === 1432 &&
    call[1].y === 752
  )));
});

test('hiding translation window preserves the existing window for next show', () => {
  const { api, createdWindows } = loadWindowsModule();

  api.openTranslateWindow('first');
  api.hideTranslateWindow();
  api.openTranslateWindow('second');

  assert.equal(createdWindows.length, 1);
  assert(createdWindows[0].calls.some((call) => call[0] === 'hide'));
  assert(createdWindows[0].calls.some((call) => call[0] === 'show'));
});

test('configuration window hides the native menu bar', () => {
  const { api, createdWindows } = loadWindowsModule();

  api.openConfigWindow();

  assert.equal(createdWindows.length, 1);
  assert.equal(createdWindows[0].options.autoHideMenuBar, true);
  assert(createdWindows[0].calls.some((call) => call[0] === 'setMenu' && call[1] === null));
});
