const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

test('hotkey flow captures selection before showing translation window', () => {
  const source = fs.readFileSync(path.join(process.cwd(), 'desktop', 'src', 'main', 'app.js'), 'utf8');
  const match = source.match(/async function translateCurrentSelection\(\) \{([\s\S]*?)\n\}/);

  assert(match, 'translateCurrentSelection function not found');

  const body = match[1];
  const captureIndex = body.indexOf('captureSelectedText()');
  const openIndex = body.indexOf('openTranslateWindow');

  assert(captureIndex >= 0, 'captureSelectedText() not found in hotkey flow');
  assert(openIndex >= 0, 'openTranslateWindow not found in hotkey flow');
  assert(captureIndex < openIndex, 'selection must be captured before any translation window is shown');
});

test('hide hotkey is registered to the same hide action as the minimize button', () => {
  const source = fs.readFileSync(path.join(process.cwd(), 'desktop', 'src', 'main', 'app.js'), 'utf8');

  assert.match(source, /hideHotkey/);
  assert.match(source, /globalShortcut\.register\(currentConfig\.hideHotkey,\s*hideTranslateWindow\)/);
  assert.match(source, /ipcMain\.on\('translation:hide'[\s\S]*hideTranslateWindow\(\)/);
});

test('saving config pushes translator background style to the window', () => {
  const source = fs.readFileSync(path.join(process.cwd(), 'desktop', 'src', 'main', 'app.js'), 'utf8');

  assert.match(source, /translation:style/);
  assert.match(source, /windowBackground:\s*currentConfig\.windowBackground/);
});

test('config color picker can preview translator background without saving', () => {
  const source = fs.readFileSync(path.join(process.cwd(), 'desktop', 'src', 'main', 'app.js'), 'utf8');

  assert.match(source, /ipcMain\.on\('config:preview-style'/);
  assert.match(source, /windowBackground:\s*style\?\.windowBackground/);
});
