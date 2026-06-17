const assert = require('node:assert/strict');
const test = require('node:test');

const { acceleratorFromEvent } = require('../desktop/src/renderer/hotkey');

test('formats ctrl shift letter hotkey for Electron globalShortcut', () => {
  assert.equal(acceleratorFromEvent({
    key: 't',
    ctrlKey: true,
    altKey: false,
    shiftKey: true,
    metaKey: false
  }), 'CommandOrControl+Shift+T');
});

test('formats arbitrary modifier combinations', () => {
  assert.equal(acceleratorFromEvent({
    key: 'F8',
    ctrlKey: true,
    altKey: true,
    shiftKey: false,
    metaKey: false
  }), 'CommandOrControl+Alt+F8');
  assert.equal(acceleratorFromEvent({
    key: 'ArrowUp',
    ctrlKey: false,
    altKey: true,
    shiftKey: true,
    metaKey: true
  }), 'Alt+Shift+Super+Up');
});

test('ignores pure modifier key presses', () => {
  assert.equal(acceleratorFromEvent({
    key: 'Shift',
    ctrlKey: false,
    altKey: false,
    shiftKey: true,
    metaKey: false
  }), '');
});
