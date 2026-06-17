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

test('renders markdown tables from structured analysis', () => {
  const html = renderMarkdown(`| 项目 | 内容 |
| --- | --- |
| 翻译 | 它能工作，但是很慢。 |
| 句式 | 前半句说可用。 |`);

  assert.match(html, /<table>/);
  assert.match(html, /<th>项目<\/th>/);
  assert.match(html, /<td>翻译<\/td>/);
  assert.match(html, /<td>它能工作，但是很慢。<\/td>/);
});

test('renders extension-style word cards', () => {
  const html = renderMarkdown(`#### 重点词
> **slow 形容词 /sloʊ/**
> 慢的
> _The app is slow._
> 这个应用很慢。`);

  assert.match(html, /<h4>重点词<\/h4>/);
  assert.match(html, /<blockquote>/);
  assert.match(html, /<strong>slow 形容词 \/sloʊ\/<\/strong>/);
  assert.match(html, /<em>The app is slow\.<\/em>/);
});

test('renders emphasized quoted translation results', () => {
  const html = renderMarkdown(`#### 翻译
> **它能工作，但是很慢。**`);

  assert.match(html, /<h4>翻译<\/h4>/);
  assert.match(html, /<blockquote>/);
  assert.match(html, /<strong>它能工作，但是很慢。<\/strong>/);
});
