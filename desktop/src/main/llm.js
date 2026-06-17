const { SYSTEM_PROMPT, userPrompt } = require('../../../shared/prompt');

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

function emphasizedQuoteLine(label, value) {
  return value ? `#### ${label}\n> **${String(value).trim()}**` : '';
}

function wordCard(w) {
  const head = [w.word, w.pos, w.ipa].filter(Boolean).join(' ');
  const body = [
    w.meaning_cn,
    w.example_en ? `_${w.example_en}_` : '',
    w.example_cn || ''
  ].filter(Boolean);
  return [`> **${head || '词'}**`, ...body.map((item) => `> ${item}`)].join('\n');
}

function formatWords(words) {
  if (!Array.isArray(words) || !words.length) return '';
  return `#### 重点词\n${words.map(wordCard).join('\n\n')}`;
}

function formatAnalysisMarkdown(data, fallbackMode) {
  const mode = data?.mode || fallbackMode;
  const parts = [];

  if (mode === 'sentence') {
    parts.push(emphasizedQuoteLine('翻译', data.translation_cn));
  } else if (mode === 'zh_sentence') {
    parts.push(emphasizedQuoteLine('翻译', data.english));
  }

  if (Array.isArray(data?.grammar_cn) && data.grammar_cn.length) {
    parts.push(`#### 语法\n${data.grammar_cn.map((g) => `- ${g}`).join('\n')}`);
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
