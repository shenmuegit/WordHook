const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

test('desktop config UI exposes separate translate and hide hotkeys', () => {
  const html = fs.readFileSync(path.join(process.cwd(), 'desktop', 'src', 'renderer', 'config.html'), 'utf8');
  const js = fs.readFileSync(path.join(process.cwd(), 'desktop', 'src', 'renderer', 'config.js'), 'utf8');
  const store = fs.readFileSync(path.join(process.cwd(), 'desktop', 'src', 'main', 'config-store.js'), 'utf8');

  assert.match(html, /id="hotkey"/);
  assert.match(html, /id="hideHotkey"/);
  assert.match(html, /id="hideHotkeyEnabled"/);
  assert.match(js, /config\.hideHotkey/);
  assert.match(js, /hideHotkeyEnabled/);
  assert.match(store, /hideHotkey:\s*'CommandOrControl\+Shift\+H'/);
});
