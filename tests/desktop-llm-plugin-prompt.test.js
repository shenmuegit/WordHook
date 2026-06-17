const assert = require('node:assert/strict');
const test = require('node:test');

const {
  SYSTEM_PROMPT,
  detectMode,
  formatAnalysisMarkdown,
  userPrompt
} = require('../desktop/src/main/llm');

test('desktop llm prompt uses the same structured sentence fields as the extension', () => {
  const prompt = userPrompt('sentence', 'It works, but it is slow.');

  assert.match(SYSTEM_PROMPT, /严格按用户给定的 JSON 结构返回/);
  assert.match(prompt, /"structure_cn"/);
  assert.match(prompt, /只挑 2–3 个最关键的词/);
});

test('desktop detects word and sentence modes like the extension', () => {
  assert.equal(detectMode('filter_cjk'), 'word');
  assert.equal(detectMode('It works, but it is slow.'), 'sentence');
  assert.equal(detectMode('过滤'), 'zh_word');
  assert.equal(detectMode('这个功能很慢。'), 'zh_sentence');
});

test('desktop formats structured sentence analysis with the missing sentence pattern section', () => {
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

  assert.match(markdown, /\*\*句式\*\*/);
  assert.match(markdown, /前半句说功能可用/);
  assert.match(markdown, /\*\*重点词\*\*/);
});
