const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

test('translation UI omits copy and retry controls', () => {
  const html = fs.readFileSync(path.join(process.cwd(), 'desktop', 'src', 'renderer', 'translate.html'), 'utf8');
  const js = fs.readFileSync(path.join(process.cwd(), 'desktop', 'src', 'renderer', 'translate.js'), 'utf8');

  assert.doesNotMatch(html, /id="copy"/);
  assert.doesNotMatch(html, /id="retry"/);
  assert.doesNotMatch(html, /id="status"/);
  assert.doesNotMatch(js, /translation:retry/);
  assert.doesNotMatch(js, /clipboard/);
  assert.doesNotMatch(js, /完成/);
});

test('translation UI toggles hover chrome from renderer mouse events', () => {
  const js = fs.readFileSync(path.join(process.cwd(), 'desktop', 'src', 'renderer', 'translate.js'), 'utf8');
  const css = fs.readFileSync(path.join(process.cwd(), 'desktop', 'src', 'renderer', 'translate.css'), 'utf8');

  assert.match(js, /querySelector\('\.glass-shell'\)/);
  assert.match(js, /mouseenter/);
  assert.match(js, /mousemove/);
  assert.match(js, /pointerover/);
  assert.match(js, /mouseover/);
  assert.match(js, /mouseleave/);
  assert.match(js, /classList\.add\('is-hovered'\)/);
  assert.match(js, /classList\.remove\('is-hovered'\)/);
  assert.match(css, /\.glass-shell\.is-hovered\s*\{[\s\S]*box-shadow:/);
  assert.match(css, /body:hover\s+\.glass-shell/);
});

test('translation UI hides scrollbars while retaining internal overflow', () => {
  const css = fs.readFileSync(path.join(process.cwd(), 'desktop', 'src', 'renderer', 'translate.css'), 'utf8');

  assert.match(css, /\.result\s*\{[\s\S]*overflow:\s*auto;/);
  assert.match(css, /::-webkit-scrollbar/);
  assert.match(css, /scrollbar-width:\s*none/);
});

test('translation popup is borderless until hovered and remains draggable', () => {
  const css = fs.readFileSync(path.join(process.cwd(), 'desktop', 'src', 'renderer', 'translate.css'), 'utf8');
  const html = fs.readFileSync(path.join(process.cwd(), 'desktop', 'src', 'renderer', 'translate.html'), 'utf8');

  assert.match(html, /class="drag-strip"/);
  assert.match(html, /class="glass-shell"/);
  assert.doesNotMatch(css, /body\s*\{[^}]*\bborder\s*:/);
  assert.match(css, /\.glass-shell\s*\{[\s\S]*outline:\s*1px solid transparent/);
  assert.match(css, /\.glass-shell\.is-hovered\s*\{[\s\S]*outline-color:\s*rgba\(90,\s*90,\s*96,\s*0\.38\)/);
  assert.match(css, /padding:\s*10px/);
  assert.doesNotMatch(css, /border-left:\s*3px solid/);
  assert.match(css, /-webkit-app-region:\s*drag/);
  assert.match(css, /-webkit-app-region:\s*no-drag/);
});

test('translation popup uses ios-style frosted glass surface', () => {
  const css = fs.readFileSync(path.join(process.cwd(), 'desktop', 'src', 'renderer', 'translate.css'), 'utf8');

  assert.match(css, /background:\s*rgba\(255,\s*255,\s*255,\s*0\.72\)/);
  assert.match(css, /backdrop-filter:\s*blur\(22px\) saturate\(180%\)/);
  assert.match(css, /-webkit-backdrop-filter:\s*blur\(22px\) saturate\(180%\)/);
  assert.match(css, /border-radius:\s*14px/);
});
