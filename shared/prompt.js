const SYSTEM_PROMPT = `你在帮一个完全不懂英语的中国初学者学英语。
所有解释用中文；不要用语法术语，必须用时立刻用大白话解释；
词性写"动词/名词/形容词/副词/介词/连词/代词/冠词"等中文；
每个英文例句都要配中文翻译；例句用词要简单。
严格按用户给定的 JSON 结构返回，只输出 JSON，不要 markdown 围栏，不要多余文字。`;

function userPrompt(mode, text) {
  if (mode === 'word') {
    return `请分析这个英文词或短语：「${text}」

严格按以下 JSON 返回：
{
  "mode": "word",
  "words": [
    {
      "word": "英文原词或短语",
      "pos": "中文词性",
      "ipa": "/音标/",
      "meaning_cn": "中文释义，用大白话；括号里可补充使用场景",
      "example_en": "一句简单的英文例句",
      "example_cn": "对应的中文翻译"
    }
  ]
}`;
  }
  if (mode === 'sentence') {
    return `请分析这句英文：「${text}」

严格按以下 JSON 返回：
{
  "mode": "sentence",
  "translation_cn": "自然流畅的中文翻译",
  "literal_cn": "逐词直译，用·连接中文词，让初学者建立英中词对应",
  "structure_cn": "这句话在说什么、哪里转折，用大白话讲；不要主谓宾这种术语",
  "grammar_cn": ["语法点1，大白话解释", "语法点2"],
  "words": [
    {
      "word": "重点英文词",
      "pos": "中文词性",
      "ipa": "/音标/",
      "meaning_cn": "中文释义",
      "example_en": "简单英文例句",
      "example_cn": "中文翻译"
    }
  ]
}

只挑 2–3 个最关键的词放 words；只挑 2–3 个最重要的语法点放 grammar_cn。宁可少而懂。`;
  }
  if (mode === 'zh_word') {
    return `请告诉这个中文词或短语用英文怎么说，并用中文解释。

输入中文：「${text}」

严格按以下 JSON 返回：
{
  "mode": "zh_word",
  "words": [
    {
      "word": "对应的英文词或短语",
      "pos": "中文词性",
      "ipa": "/英文音标/",
      "meaning_cn": "用中文解释这个英文词的意思和使用场景",
      "example_en": "用这个英文词的简单英文例句",
      "example_cn": "例句的中文翻译"
    }
  ]
}

如果有多个常见说法，只挑最常用、最自然的那一个。`;
  }
  return `请把这句中文翻译成自然的英文，然后用中文解析这句英文怎么造出来的。

输入中文：「${text}」

严格按以下 JSON 返回：
{
  "mode": "zh_sentence",
  "english": "自然流畅的英文翻译",
  "structure_cn": "用中文讲这句英文在说什么、整体结构怎么搭起来，不要语法术语，用大白话",
  "grammar_cn": ["中文解释这句英文用到的一个语法点，要给出原文中的英文片段", "中文解释另一个语法点"],
  "words": [
    {
      "word": "英文翻译里的关键词或短语",
      "pos": "中文词性",
      "ipa": "/音标/",
      "meaning_cn": "中文释义",
      "example_en": "简单英文例句",
      "example_cn": "例句中文翻译"
    }
  ]
}

只挑 2–3 个最关键的英文词放 words；只挑 2–3 个最重要的语法点放 grammar_cn。所有解释都用中文，例句要简单。`;
}

const WordHookPrompt = {
  SYSTEM_PROMPT,
  userPrompt
};

if (typeof globalThis !== 'undefined') {
  globalThis.WordHookPrompt = WordHookPrompt;
}

if (typeof module !== 'undefined') {
  module.exports = WordHookPrompt;
}
