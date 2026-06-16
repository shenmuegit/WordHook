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
