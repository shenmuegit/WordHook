const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

function iconPath(name) {
  return path.join(process.cwd(), 'assets', 'icons', name);
}

test('wordhook icon assets exist with expected image sizes', () => {
  for (const size of [16, 32, 48, 128, 256]) {
    const file = iconPath(`wordhook-${size}.png`);
    const bytes = fs.readFileSync(file);

    assert(bytes.length > 100, `${file} should not be empty`);
    assert.equal(bytes.readUInt32BE(16), size);
    assert.equal(bytes.readUInt32BE(20), size);
  }

  const ico = fs.readFileSync(iconPath('wordhook.ico'));
  assert.equal(ico.readUInt16LE(0), 0);
  assert.equal(ico.readUInt16LE(2), 1);
  assert(ico.readUInt16LE(4) >= 4);

  assert(fs.readFileSync(iconPath('wordhook.svg'), 'utf8').includes('WordHook'));
});

test('extension manifest uses the shared wordhook icon assets', () => {
  const manifest = JSON.parse(fs.readFileSync(path.join(process.cwd(), 'manifest.json'), 'utf8'));

  assert.equal(manifest.icons['16'], 'assets/icons/wordhook-16.png');
  assert.equal(manifest.icons['32'], 'assets/icons/wordhook-32.png');
  assert.equal(manifest.icons['48'], 'assets/icons/wordhook-48.png');
  assert.equal(manifest.icons['128'], 'assets/icons/wordhook-128.png');
  assert.deepEqual(manifest.action.default_icon, manifest.icons);
});

test('desktop app loads the shared ico asset for tray and windows', () => {
  const appSource = fs.readFileSync(path.join(process.cwd(), 'desktop', 'src', 'main', 'app.js'), 'utf8');
  const windowsSource = fs.readFileSync(path.join(process.cwd(), 'desktop', 'src', 'main', 'windows.js'), 'utf8');

  assert.match(appSource, /nativeImage\.createFromPath\(APP_ICON_PATH\)/);
  assert.match(appSource, /assets['"], ['"]icons['"], ['"]wordhook\.ico/);
  assert.match(windowsSource, /icon:\s*APP_ICON_PATH/);
});
