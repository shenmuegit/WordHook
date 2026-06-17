const SYSTEM_PROMPT = `你在帮一个完全不懂英语的中国初学者学英语。
所有解释用中文；不要用语法术语，必须用时立刻用大白话解释；
词性写"动词/名词/形容词/副词/介词/连词/代词/冠词"等中文；
每个英文例句都要配中文翻译；例句用词要简单。
严格按用户给定的 JSON 结构返回，只输出 JSON，不要 markdown 围栏，不要多余文字。`;

function detectLang(text) {
  const zh = (text.match(/[一-鿿㐀-䶿]/g) || []).length;
  const en = (text.match(/[a-zA-Z]/g) || []).length;
  if (zh + en === 0) return 'en';
  return zh > en ? 'zh' : 'en';
}

function detectMode(text) {
  const t = text.trim();
  if (!t) return 'word';
  const lang = detectLang(t);
  if (lang === 'zh') {
    if (/[.!?。！？]/.test(t)) return 'zh_sentence';
    const chars = t.replace(/\s/g, '').length;
    if (chars <= 4 && !/[,;:，；：]/.test(t)) return 'zh_word';
    return 'zh_sentence';
  }
  if (/[.!?。！？]/.test(t)) return 'sentence';
  const wordCount = t.split(/\s+/).filter(Boolean).length;
  if (wordCount <= 3 && !/[,;:，；：]/.test(t)) return 'word';
  return 'sentence';
}

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

function endpoint(baseURL) {
  return baseURL.replace(/\/+$/, '') + '/chat/completions';
}

function parseJsonObject(text) {
  try {
    return JSON.parse(text);
  } catch {}
  const start = text.indexOf('{');
  const end = text.lastIndexOf('}');
  if (start >= 0 && end > start) {
    try {
      return JSON.parse(text.slice(start, end + 1));
    } catch {}
  }
  return null;
}

function unescapeJSONString(s) {
  return s.replace(/\\(.)/g, (_match, c) => {
    if (c === 'n') return '\n';
    if (c === 't') return '\t';
    if (c === 'r') return '\r';
    if (c === '"' || c === '\\' || c === '/') return c;
    return c;
  });
}

function extractStringField(buf, key) {
  const re = new RegExp('"' + key + '"\\s*:\\s*"((?:[^"\\\\]|\\\\.)*)', 'm');
  const m = buf.match(re);
  return m ? unescapeJSONString(m[1]) : null;
}

function extractStringArray(buf, key) {
  const re = new RegExp('"' + key + '"\\s*:\\s*\\[([\\s\\S]*?)(?:\\]|$)');
  const m = buf.match(re);
  if (!m) return null;
  const items = [];
  const strRe = /"((?:[^"\\]|\\.)*)"/g;
  let mm;
  while ((mm = strRe.exec(m[1])) !== null) items.push(unescapeJSONString(mm[1]));
  return items;
}

function extractObjectsArray(buf, arrayKey) {
  const reStart = new RegExp('"' + arrayKey + '"\\s*:\\s*\\[');
  const m = buf.match(reStart);
  if (!m) return null;
  const start = m.index + m[0].length;
  const objects = [];
  let depth = 0;
  let objStart = -1;
  let inString = false;
  let escape = false;

  for (let i = start; i < buf.length; i++) {
    const c = buf[i];
    if (escape) { escape = false; continue; }
    if (inString) {
      if (c === '\\') { escape = true; continue; }
      if (c === '"') inString = false;
      continue;
    }
    if (c === '"') { inString = true; continue; }
    if (c === '{') {
      if (depth === 0) objStart = i;
      depth++;
    } else if (c === '}') {
      depth--;
      if (depth === 0 && objStart >= 0) {
        try { objects.push(JSON.parse(buf.slice(objStart, i + 1))); } catch {}
        objStart = -1;
      }
    } else if (c === ']' && depth === 0) {
      break;
    }
  }

  if (depth > 0 && objStart >= 0) {
    const partial = {};
    const partialBuf = buf.slice(objStart);
    for (const k of ['word', 'pos', 'ipa', 'meaning_cn', 'example_en', 'example_cn']) {
      const value = extractStringField(partialBuf, k);
      if (value !== null) partial[k] = value;
    }
    if (Object.keys(partial).length) objects.push(partial);
  }

  return objects;
}

function extractPartialAnalysis(buf) {
  const data = {};
  for (const k of ['mode', 'translation_cn', 'literal_cn', 'structure_cn', 'english']) {
    const value = extractStringField(buf, k);
    if (value !== null) data[k] = value;
  }
  const grammar = extractStringArray(buf, 'grammar_cn');
  if (grammar && grammar.length) data.grammar_cn = grammar;
  const words = extractObjectsArray(buf, 'words');
  if (words && words.length) data.words = words;
  return data;
}

function tableCell(value) {
  return String(value || '').replace(/\r?\n/g, '<br>').replace(/\|/g, '\\|').trim();
}

function markdownTable(headers, rows) {
  const visibleRows = rows.filter((row) => row.some(Boolean));
  if (!visibleRows.length) return '';
  return [
    `| ${headers.map(tableCell).join(' | ')} |`,
    `| ${headers.map(() => '---').join(' | ')} |`,
    ...visibleRows.map((row) => `| ${row.map(tableCell).join(' | ')} |`)
  ].join('\n');
}

function formatWords(words) {
  if (!Array.isArray(words) || !words.length) return '';
  const rows = words.map((w) => [
    w.word || '词',
    w.pos || '',
    w.ipa || '',
    [
      w.meaning_cn,
      w.example_en ? `例：${w.example_en}` : '',
      w.example_cn || ''
    ].filter(Boolean).join('；')
  ]);
  return markdownTable(['重点词', '词性', '音标', '说明'], rows);
}

function formatAnalysisMarkdown(data, fallbackMode) {
  const mode = data?.mode || fallbackMode;
  const parts = [];

  if (mode === 'sentence') {
    parts.push(markdownTable(['项目', '内容'], [
      ['翻译', data.translation_cn]
    ]));
  } else if (mode === 'zh_sentence') {
    parts.push(markdownTable(['项目', '内容'], [
      ['翻译', data.english]
    ]));
  }

  if (Array.isArray(data?.grammar_cn) && data.grammar_cn.length) {
    parts.push(markdownTable(['语法', '说明'], data.grammar_cn.map((g, index) => [String(index + 1), g])));
  }

  const words = formatWords(data?.words);
  if (words) parts.push(words);

  return parts.filter(Boolean).join('\n\n') || 'LLM 返回为空';
}

async function streamChatCompletion(config, text, handlers = {}) {
  const mode = detectMode(text);
  const response = await fetch(endpoint(config.baseURL), {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${config.apiKey}`
    },
    body: JSON.stringify({
      model: config.model,
      messages: [
        { role: 'system', content: SYSTEM_PROMPT },
        { role: 'user', content: userPrompt(mode, text) }
      ],
      response_format: { type: 'json_object' },
      temperature: 0.3,
      max_tokens: 800,
      stream: true,
      thinking: { type: 'disabled' }
    })
  });

  if (!response.ok) {
    const detail = await response.text().catch(() => '');
    throw new Error(`LLM HTTP ${response.status}: ${detail.slice(0, 300)}`);
  }

  if (!response.body) {
    throw new Error('LLM response has no body');
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder('utf-8');
  let buffer = '';
  let rawJson = '';
  let lastRendered = '';

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });

    let separatorIndex;
    while ((separatorIndex = buffer.indexOf('\n\n')) >= 0) {
      const event = buffer.slice(0, separatorIndex);
      buffer = buffer.slice(separatorIndex + 2);

      for (const lineText of event.split('\n')) {
        if (!lineText.startsWith('data:')) continue;
        const data = lineText.slice(5).trim();
        if (!data || data === '[DONE]') continue;

        const parsed = JSON.parse(data);
        const delta = parsed?.choices?.[0]?.delta?.content || '';
        if (delta) {
          rawJson += delta;
          const partial = formatAnalysisMarkdown(extractPartialAnalysis(rawJson), mode);
          if (partial !== lastRendered && partial !== 'LLM 返回为空') {
            lastRendered = partial;
            handlers.onDelta?.(delta, partial);
          }
        }
      }
    }
  }

  const finalData = parseJsonObject(rawJson);
  const finalMarkdown = finalData ? formatAnalysisMarkdown(finalData, mode) : rawJson;
  handlers.onDone?.(finalMarkdown);
  return finalMarkdown;
}

module.exports = {
  SYSTEM_PROMPT,
  detectLang,
  detectMode,
  formatAnalysisMarkdown,
  streamChatCompletion,
  userPrompt
};
