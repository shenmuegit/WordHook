const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

test('translation UI omits copy and retry controls', () => {
  const html = fs.readFileSync(path.join(process.cwd(), 'desktop', 'src', 'renderer', 'translate.html'), 'utf8');
  const js = fs.readFileSync(path.join(process.cwd(), 'desktop', 'src', 'renderer', 'translate.js'), 'utf8');

  assert.doesNotMatch(html, /id="copy"/);
  assert.doesNotMatch(html, /id="retry"/);
  assert.doesNotMatch(js, /translation:retry/);
  assert.doesNotMatch(js, /clipboard/);
});

test('translation UI hides scrollbars while retaining internal overflow', () => {
  const css = fs.readFileSync(path.join(process.cwd(), 'desktop', 'src', 'renderer', 'translate.css'), 'utf8');

  assert.match(css, /\.result\s*\{[\s\S]*overflow:\s*auto;/);
  assert.match(css, /::-webkit-scrollbar/);
  assert.match(css, /scrollbar-width:\s*none/);
});
