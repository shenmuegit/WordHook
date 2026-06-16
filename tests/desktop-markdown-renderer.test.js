const assert = require('node:assert/strict');
const test = require('node:test');

const { renderMarkdown } = require('../desktop/src/renderer/markdown');

test('renders compact markdown from LLM output', () => {
  const html = renderMarkdown(`**filter_cjk**
- **中文含义**：过滤中日韩字符
- 例如：\`text.filter_cjk()\``);

  assert.match(html, /<strong>filter_cjk<\/strong>/);
  assert.match(html, /<ul>/);
  assert.match(html, /<li><strong>中文含义<\/strong>：过滤中日韩字符<\/li>/);
  assert.match(html, /<code>text\.filter_cjk\(\)<\/code>/);
});

test('escapes html before rendering markdown', () => {
  const html = renderMarkdown('**safe** <script>alert(1)</script>');

  assert.match(html, /<strong>safe<\/strong>/);
  assert.doesNotMatch(html, /<script>/);
  assert.match(html, /&lt;script&gt;alert\(1\)&lt;\/script&gt;/);
});
