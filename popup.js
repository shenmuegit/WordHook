const CONFIG_KEY = 'llm_config_v1';
const CARDS_KEY = 'cards_v1';

const $ = (id) => document.getElementById(id);

function setStatus(msg, kind = '') {
  const el = $('status');
  el.textContent = msg;
  el.className = 'status ' + kind;
}

function setCardStatus(msg, kind = '') {
  const el = $('cardStatus');
  el.textContent = msg;
  el.className = 'status ' + kind;
}

// 载入已有配置
(async () => {
  const { [CONFIG_KEY]: cfg } = await chrome.storage.local.get(CONFIG_KEY);
  if (cfg) {
    $('baseURL').value = cfg.baseURL || '';
    $('model').value = cfg.model || '';
    $('apiKey').value = cfg.apiKey || '';
  }
})();

function originOf(urlStr) {
  try {
    const u = new URL(urlStr);
    return `${u.protocol}//${u.host}/*`;
  } catch {
    return null;
  }
}

$('save').addEventListener('click', async () => {
  const baseURL = $('baseURL').value.trim();
  const model = $('model').value.trim();
  const apiKey = $('apiKey').value.trim();

  if (!baseURL || !model || !apiKey) {
    setStatus('三项都要填', 'err');
    return;
  }
  const origin = originOf(baseURL);
  if (!origin) {
    setStatus('baseURL 不是合法 URL', 'err');
    return;
  }

  // 请求 host 权限，让 service worker 能 fetch 这个域名
  const granted = await chrome.permissions.request({ origins: [origin] });
  if (!granted) {
    setStatus('未授权访问该域名，无法调用 API', 'err');
    return;
  }

  await chrome.storage.local.set({ [CONFIG_KEY]: { baseURL, model, apiKey } });
  setStatus('已保存', 'ok');
});

// ——— Anki 卡片管理 ———

async function refreshCardCount() {
  const { [CARDS_KEY]: cards } = await chrome.storage.local.get(CARDS_KEY);
  $('cardCount').textContent = String(Array.isArray(cards) ? cards.length : 0);
}
refreshCardCount();

// 清洗一个字段：TSV 不允许字段内的 tab；换行转 <br>；
// HTML 已开 #html:true，不再额外转义 < > &（卡片 back/front 本就是 HTML 片段）。
function escapeField(s) {
  if (s == null) return '';
  return String(s)
    .replace(/\r/g, '')
    .replace(/\t/g, ' ')
    .replace(/\n/g, '<br>');
}

function buildAnkiTxt(cards) {
  const headers = [
    '#separator:Tab',
    '#html:true',
    '#deck:WordHook',
    '#notetype:Basic',
    '#tags column:3'
  ];
  const lines = cards.map((c) => {
    const typeTag = `wordhook-${c.type || 'vocab'}`;
    const srcTag = c.source ? `src-${c.source.replace(/[^a-zA-Z0-9.-]/g, '_')}` : '';
    const date = c.createdAt || '';
    const tags = [typeTag, srcTag, date].filter(Boolean).join(' ');
    return [escapeField(c.front), escapeField(c.back), tags].join('\t');
  });
  return [...headers, ...lines, ''].join('\n');
}

$('export').addEventListener('click', async () => {
  const { [CARDS_KEY]: cards } = await chrome.storage.local.get(CARDS_KEY);
  if (!Array.isArray(cards) || cards.length === 0) {
    setCardStatus('还没有卡片可导出', 'err');
    return;
  }
  const txt = buildAnkiTxt(cards);
  const blob = new Blob([txt], { type: 'text/plain;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `hn-english-${new Date().toISOString().slice(0, 10)}.txt`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
  setCardStatus(`已导出 ${cards.length} 张`, 'ok');
});

$('clear').addEventListener('click', async () => {
  if (!confirm('清空全部卡片？此操作不可撤销。')) return;
  await chrome.storage.local.set({ [CARDS_KEY]: [] });
  await refreshCardCount();
  setCardStatus('已清空', 'ok');
});

$('copyTts').addEventListener('click', async () => {
  const text = $('ttsLine').textContent;
  const btn = $('copyTts');
  try {
    await navigator.clipboard.writeText(text);
    btn.textContent = '已复制';
  } catch {
    btn.textContent = '失败';
  }
  setTimeout(() => { btn.textContent = '复制'; }, 1200);
});
