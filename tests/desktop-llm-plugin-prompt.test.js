const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const {
  SYSTEM_PROMPT,
  detectMode,
  formatAnalysisMarkdown,
  userPrompt
} = require('../desktop/src/main/llm');
const sharedPrompt = require('../shared/prompt');

test('desktop and extension use one shared prompt source', () => {
  const root = process.cwd();
  const desktop = fs.readFileSync(path.join(root, 'desktop', 'src', 'main', 'llm.js'), 'utf8');
  const extension = fs.readFileSync(path.join(root, 'background.js'), 'utf8');
  const shared = fs.readFileSync(path.join(root, 'shared', 'prompt.js'), 'utf8');

  assert.equal(SYSTEM_PROMPT, sharedPrompt.SYSTEM_PROMPT);
  assert.equal(userPrompt('sentence', 'It works.'), sharedPrompt.userPrompt('sentence', 'It works.'));
  assert.match(desktop, /require\('\.\.\/\.\.\/\.\.\/shared\/prompt'\)/);
  assert.match(extension, /importScripts\('shared\/prompt\.js'\)/);
  assert.match(shared, /const SYSTEM_PROMPT/);
  assert.match(shared, /function userPrompt/);
  assert.doesNotMatch(desktop, /const SYSTEM_PROMPT\s*=/);
  assert.doesNotMatch(desktop, /function userPrompt/);
  assert.doesNotMatch(extension, /const SYSTEM_PROMPT\s*=/);
  assert.doesNotMatch(extension, /function userPrompt/);
});

test('shared llm prompt keeps sentence output compact', () => {
  const prompt = userPrompt('sentence', 'It works, but it is slow.');
  const zhPrompt = userPrompt('zh_sentence', '这个功能很慢。');

  assert.match(SYSTEM_PROMPT, /严格按用户给定的 JSON 结构返回/);
  assert.match(prompt, /"translation_cn"/);
  assert.doesNotMatch(prompt, /"literal_cn"/);
  assert.doesNotMatch(prompt, /"structure_cn"/);
  assert.doesNotMatch(zhPrompt, /"structure_cn"/);
  assert.match(prompt, /只挑 2–3 个最关键的词/);
});

test('desktop detects word and sentence modes like the extension', () => {
  assert.equal(detectMode('filter_cjk'), 'word');
  assert.equal(detectMode('It works, but it is slow.'), 'sentence');
  assert.equal(detectMode('过滤'), 'zh_word');
  assert.equal(detectMode('这个功能很慢。'), 'zh_sentence');
});

test('desktop formats translation as bold text without literal or structure rows', () => {
  const markdown = formatAnalysisMarkdown({
    mode: 'sentence',
    translation_cn: '它能工作，但是很慢。',
    literal_cn: '它·工作·但是·它·很慢',
    structure_cn: '前半句说功能可用，后半句用但是转到缺点。',
    grammar_cn: ['but 表示转折，意思是“但是”。'],
    words: [
      {
        word: 'slow',
        pos: '形容词',
        ipa: '/sloʊ/',
        meaning_cn: '慢的',
        example_en: 'The app is slow.',
        example_cn: '这个应用很慢。'
      }
    ]
  });

  assert.match(markdown, /#### 翻译/);
  assert.match(markdown, /\*\*它能工作，但是很慢。\*\*/);
  assert.doesNotMatch(markdown, /> \*\*它能工作，但是很慢。\*\*/);
  assert.doesNotMatch(markdown, /#### 直译/);
  assert.doesNotMatch(markdown, /它·工作·但是·它·很慢/);
  assert.doesNotMatch(markdown, /#### 句式/);
  assert.doesNotMatch(markdown, /前半句说功能可用/);
  assert.match(markdown, /#### 语法/);
  assert.match(markdown, /- but 表示转折/);
  assert.match(markdown, /#### 重点词/);
  assert.match(markdown, /> \*\*slow 形容词 \/sloʊ\/\*\*/);
});
