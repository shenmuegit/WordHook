// Phase 1.1：流式输出 + max_tokens 提速。
// 协议：OpenAI Chat Completions 兼容，stream:true，SSE 解析。

const CACHE_KEY = 'llm_cache_v1';
const CONFIG_KEY = 'llm_config_v1';

// ——— 配置 ———

async function getConfig() {
  const { [CONFIG_KEY]: cfg } = await chrome.storage.local.get(CONFIG_KEY);
  return cfg || null;
}

// ——— 缓存 ———

async function getCache() {
  const { [CACHE_KEY]: cache } = await chrome.storage.local.get(CACHE_KEY);
  return cache || {};
}

async function setCacheEntry(key, value) {
  const cache = await getCache();
  cache[key] = value;
  const keys = Object.keys(cache);
  if (keys.length > 500) delete cache[keys[0]];
  await chrome.storage.local.set({ [CACHE_KEY]: cache });
}

function cacheKey(model, mode, text) {
  return `${model}::${mode}::${text}`;
}

// ——— Prompt ———

const SYSTEM_PROMPT_EN_TO_ZH = `你在帮一个完全不懂英语的中国初学者理解一段英文。
所有解释用中文；不要用语法术语，必须用时立刻用大白话解释；
词性写"动词/名词/形容词/副词/介词/连词/代词/冠词"等中文；
每个英文例句都要配中文翻译；例句用词要简单。
严格按用户给定的 JSON 结构返回，只输出 JSON，不要 markdown 围栏，不要多余文字。`;

const SYSTEM_PROMPT_ZH_TO_EN = `You are helping a Chinese learner of English see how a Chinese phrase or sentence is expressed in natural English, and how that English actually works.

Output the natural English translation first. Then explain the English itself in plain, simple English — what is being said, how the grammar functions, what each key word means. Use simple vocabulary a beginner can follow. Avoid grammar jargon; if you must use a term, immediately rephrase it in plain English. Always give each English example sentence a short Chinese translation.

Strictly follow the JSON structure the user gives. Output only the JSON — no markdown fences, no extra prose.`;

function getSystemPrompt(mode) {
  if (mode === 'zh_word' || mode === 'zh_sentence') return SYSTEM_PROMPT_ZH_TO_EN;
  return SYSTEM_PROMPT_EN_TO_ZH;
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
    return `Translate this Chinese word or phrase into natural English, then explain it briefly in plain English.

Input (Chinese): "${text}"

Return strictly this JSON:
{
  "mode": "zh_word",
  "words_en": [
    {
      "word": "the English translation",
      "pos": "noun / verb / adjective / adverb / preposition / ...",
      "ipa": "/IPA of the English/",
      "meaning_en": "Plain-English meaning. Add short usage notes in parentheses if helpful.",
      "example_en": "A short simple English example sentence using the word",
      "example_zh": "Chinese translation of the example"
    }
  ]
}

If multiple translations are equally natural, give the most common one only.`;
  }
  // zh_sentence
  return `Translate this Chinese sentence into natural English, then explain the English itself.

Input (Chinese): "${text}"

Return strictly this JSON:
{
  "mode": "zh_sentence",
  "english": "Natural fluent English translation",
  "structure_en": "Explain in plain simple English what the English sentence is saying, where its emphasis or pivot is. No jargon.",
  "grammar_en": ["Grammar point 1, plain-English explanation of one structure used", "Grammar point 2"],
  "words_en": [
    {
      "word": "key English word taken from the translation",
      "pos": "noun / verb / adjective / ...",
      "ipa": "/IPA/",
      "meaning_en": "Brief plain-English explanation",
      "example_en": "Another short example sentence using this word",
      "example_zh": "Chinese translation of the example"
    }
  ]
}

Pick only 2–3 most important grammar points and 2–3 key words. Keep all English simple — vocabulary a beginner can read.`;
}

// ——— SSE 流式解析 ———

async function streamLLM({ baseURL, apiKey, model }, mode, text, onChunk, signal) {
  const url = baseURL.replace(/\/+$/, '') + '/chat/completions';
  const body = {
    model,
    messages: [
      { role: 'system', content: getSystemPrompt(mode) },
      { role: 'user', content: userPrompt(mode, text) }
    ],
    response_format: { type: 'json_object' },
    temperature: 0.3,
    max_tokens: 800,
    stream: true,
    // DeepSeek V4：关掉思考模式
    thinking: { type: 'disabled' }
  };

  const resp = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`
    },
    body: JSON.stringify(body),
    signal
  });

  if (!resp.ok) {
    const errText = await resp.text().catch(() => '');
    throw new Error(`LLM HTTP ${resp.status}: ${errText.slice(0, 300)}`);
  }
  if (!resp.body) throw new Error('LLM 返回无 body');

  const reader = resp.body.getReader();
  const decoder = new TextDecoder('utf-8');
  let buffer = '';
  let accumulated = '';

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });

    // SSE 用 \n\n 分隔事件；每个事件可能多行
    let sepIdx;
    while ((sepIdx = buffer.indexOf('\n\n')) >= 0) {
      const event = buffer.slice(0, sepIdx);
      buffer = buffer.slice(sepIdx + 2);
      for (const line of event.split('\n')) {
        if (!line.startsWith('data:')) continue;
        const data = line.slice(5).trim();
        if (data === '[DONE]') continue;
        try {
          const parsed = JSON.parse(data);
          const delta = parsed?.choices?.[0]?.delta?.content;
          if (delta) {
            accumulated += delta;
            onChunk(accumulated, delta);
          }
        } catch {
          // SSE 行解析失败就跳过；正常是注释或心跳
        }
      }
    }
  }

  return accumulated;
}

function parseFinalJSON(raw) {
  const stripped = raw.trim().replace(/^```json\s*|\s*```$/g, '');
  return JSON.parse(stripped);
}

// ——— Port 处理 ———

chrome.runtime.onConnect.addListener((port) => {
  if (port.name !== 'analyze') return;

  const abort = new AbortController();
  let closed = false;
  const safePost = (msg) => { if (!closed) try { port.postMessage(msg); } catch {} };

  port.onDisconnect.addListener(() => {
    closed = true;
    abort.abort();
  });

  port.onMessage.addListener(async (msg) => {
    if (msg?.type !== 'start') return;
    const { mode, text } = msg;

    try {
      const cfg = await getConfig();
      if (!cfg?.baseURL || !cfg?.apiKey || !cfg?.model) {
        throw new Error('未配置 API：请先点扩展图标打开 popup 填 baseURL / model / API key');
      }

      // 缓存命中：直接 done
      const key = cacheKey(cfg.model, mode, text);
      const cache = await getCache();
      if (cache[key]) {
        safePost({ type: 'done', data: cache[key], cached: true });
        try { port.disconnect(); } catch {}
        return;
      }

      // 流式调用
      const raw = await streamLLM(
        cfg, mode, text,
        (accumulated) => safePost({ type: 'chunk', accumulated }),
        abort.signal
      );

      let data;
      try {
        data = parseFinalJSON(raw);
      } catch (e) {
        throw new Error('LLM 返回不是合法 JSON：' + raw.slice(0, 200));
      }

      await setCacheEntry(key, data);
      safePost({ type: 'done', data, cached: false });
      try { port.disconnect(); } catch {}
    } catch (e) {
      if (e?.name === 'AbortError') return; // 用户切走了请求，不报错
      safePost({ type: 'error', error: String(e?.message || e) });
      try { port.disconnect(); } catch {}
    }
  });
});

// ——— 卡片存储 ———

const CARDS_KEY = 'cards_v1';

async function getCards() {
  const { [CARDS_KEY]: cards } = await chrome.storage.local.get(CARDS_KEY);
  return Array.isArray(cards) ? cards : [];
}

function sourceFromUrl(u) {
  try { return new URL(u).hostname.replace(/^www\./, ''); } catch { return 'web'; }
}

async function saveCard(card) {
  const cards = await getCards();
  cards.push({
    id: (crypto.randomUUID && crypto.randomUUID()) || String(Date.now()) + Math.random().toString(36).slice(2),
    createdAt: new Date().toISOString().slice(0, 10),
    source: card.url ? sourceFromUrl(card.url) : 'web',
    ...card
  });
  await chrome.storage.local.set({ [CARDS_KEY]: cards });
  return cards.length;
}

async function clearCards() {
  await chrome.storage.local.set({ [CARDS_KEY]: [] });
  return 0;
}

chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  if (!msg || typeof msg.type !== 'string') return;

  (async () => {
    try {
      if (msg.type === 'saveCard') {
        const count = await saveCard(msg.card);
        sendResponse({ ok: true, count });
      } else if (msg.type === 'getCards') {
        const cards = await getCards();
        sendResponse({ ok: true, cards });
      } else if (msg.type === 'getCardsCount') {
        const cards = await getCards();
        sendResponse({ ok: true, count: cards.length });
      } else if (msg.type === 'clearCards') {
        const count = await clearCards();
        sendResponse({ ok: true, count });
      } else {
        return; // 不是我们处理的类型，不回应
      }
    } catch (e) {
      sendResponse({ ok: false, error: String(e?.message || e) });
    }
  })();

  return true; // async sendResponse
});
