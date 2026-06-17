// Phase 1.1：流式输出 + max_tokens 提速。
// 协议：OpenAI Chat Completions 兼容，stream:true，SSE 解析。

importScripts('shared/prompt.js');

const CACHE_KEY = 'llm_cache_v1';
const CONFIG_KEY = 'llm_config_v1';
const { SYSTEM_PROMPT, userPrompt } = globalThis.WordHookPrompt;

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

// ——— SSE 流式解析 ———

async function streamLLM({ baseURL, apiKey, model }, mode, text, onChunk, signal) {
  const url = baseURL.replace(/\/+$/, '') + '/chat/completions';
  const body = {
    model,
    messages: [
      { role: 'system', content: SYSTEM_PROMPT },
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
