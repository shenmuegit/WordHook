// Phase 2：在 1.1 基础上加 Web Speech 朗读。

(() => {
  const HOST_ID = '__hn_english_popup_host__';
  let currentText = '';
  let currentRect = null;
  let currentMode = 'word';
  let currentPort = null;
  let inFlight = 0;

  // ——— Web Speech 朗读 ———
  // getVoices() 第一次常返回空；voiceschanged 事件后才填好。
  const voices = { en: null };
  function loadVoices() {
    try {
      const list = speechSynthesis.getVoices();
      if (!list.length) return;
      voices.en = list.find(v => /^en-US/i.test(v.lang))
               || list.find(v => /^en-GB/i.test(v.lang))
               || list.find(v => /^en/i.test(v.lang))
               || list[0];
    } catch {}
  }
  try {
    loadVoices();
    speechSynthesis.addEventListener?.('voiceschanged', loadVoices);
  } catch {}

  function speak(text) {
    if (!text) return;
    try {
      speechSynthesis.cancel();
      const u = new SpeechSynthesisUtterance(text);
      if (voices.en) u.voice = voices.en;
      u.lang = (voices.en && voices.en.lang) || 'en-US';
      u.rate = 0.9;   // 学习场景稍慢
      u.pitch = 1;
      speechSynthesis.speak(u);
    } catch {}
  }

  // ——— 模式判断 ———
  function detectMode(text) {
    const t = text.trim();
    if (!t) return 'word';
    if (/[.!?。！？]/.test(t)) return 'sentence';
    const wordCount = t.split(/\s+/).filter(Boolean).length;
    if (wordCount <= 3 && !/[,;:，；：]/.test(t)) return 'word';
    return 'sentence';
  }

  // ——— Host / Shadow DOM ———
  function ensureHost() {
    let host = document.getElementById(HOST_ID);
    if (host) return host;

    host = document.createElement('div');
    host.id = HOST_ID;
    Object.assign(host.style, {
      position: 'absolute',
      top: '0',
      left: '0',
      zIndex: '2147483647',
      pointerEvents: 'none'
    });

    const shadow = host.attachShadow({ mode: 'open' });
    shadow.innerHTML = `
      <style>
        :host { all: initial; }
        .popup {
          position: absolute;
          max-width: 420px;
          min-width: 240px;
          padding: 10px 12px;
          background: #fff;
          color: #222;
          font: 13px/1.5 -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
          border: 1px solid #ddd;
          border-radius: 6px;
          box-shadow: 0 4px 16px rgba(0,0,0,0.12);
          pointer-events: auto;
          max-height: 70vh;
          overflow-y: auto;
        }
        .toolbar {
          display: flex;
          align-items: center;
          gap: 6px;
          margin-bottom: 8px;
          padding-bottom: 6px;
          border-bottom: 1px solid #eee;
        }
        .mode-btn {
          font: 11px/1 inherit;
          padding: 3px 7px;
          border: 1px solid #ccc;
          background: #f6f6f6;
          color: #555;
          border-radius: 3px;
          cursor: pointer;
        }
        .mode-btn.active {
          background: #ff6600;
          color: #fff;
          border-color: #ff6600;
        }
        .selected {
          flex: 1;
          font-size: 11px;
          color: #888;
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
        }
        .body { word-break: break-word; }
        .loading {
          color: #888;
          font-style: italic;
        }
        .stream-meta {
          font-size: 11px;
          color: #888;
          margin-bottom: 4px;
        }
        .stream-preview {
          font: 11px/1.5 ui-monospace, "SFMono-Regular", Menlo, Consolas, monospace;
          color: #666;
          background: #fafafa;
          border: 1px solid #eee;
          border-radius: 3px;
          padding: 6px 8px;
          margin: 0;
          max-height: 200px;
          overflow-y: auto;
          white-space: pre-wrap;
          word-break: break-word;
        }
        .error { color: #c0392b; white-space: pre-wrap; }
        .section { margin-top: 8px; }
        .section h4 {
          margin: 0 0 4px;
          font-size: 11px;
          color: #888;
          font-weight: 600;
          text-transform: uppercase;
          letter-spacing: 0.04em;
        }
        .translation { font-size: 14px; color: #111; }
        .literal { color: #555; font-size: 12px; }
        .structure { color: #333; }
        ul.grammar { margin: 0; padding-left: 18px; }
        ul.grammar li { margin: 2px 0; }
        .word-card {
          margin: 6px 0;
          padding: 6px 8px;
          background: #fafafa;
          border-left: 3px solid #ff6600;
          border-radius: 3px;
        }
        .word-head {
          display: flex;
          gap: 6px;
          align-items: baseline;
          flex-wrap: wrap;
        }
        .word-head .w { font-weight: 600; font-size: 14px; color: #111; }
        .word-head .pos { font-size: 11px; color: #888; }
        .word-head .ipa { font-size: 12px; color: #666; font-family: ui-monospace, monospace; }
        .word-meaning { margin-top: 2px; }
        .word-example { margin-top: 3px; font-size: 12px; color: #444; }
        .word-example .en { font-style: italic; }
        .word-example .cn { color: #777; }
        .cached-tag {
          font-size: 10px;
          color: #aaa;
          margin-left: auto;
        }
        .speak-btn {
          font: 12px/1 inherit;
          padding: 2px 6px;
          border: 1px solid #ddd;
          background: #fff;
          color: #555;
          border-radius: 3px;
          cursor: pointer;
        }
        .speak-btn:hover { background: #f0f0f0; }
        .speak-btn.mini {
          padding: 0 4px;
          font-size: 11px;
          border-color: #e0e0e0;
        }
        .save-btn {
          font: 11px/1 inherit;
          padding: 2px 7px;
          border: 1px solid #ff6600;
          background: #fff;
          color: #ff6600;
          border-radius: 3px;
          cursor: pointer;
        }
        .save-btn:hover:not(:disabled) { background: #fff4ec; }
        .save-btn:disabled { cursor: default; opacity: 0.7; }
        .save-row {
          margin: 6px 0 0;
        }
      </style>
      <div class="popup" hidden>
        <div class="toolbar">
          <button class="mode-btn" data-mode="word">词</button>
          <button class="mode-btn" data-mode="sentence">句</button>
          <button class="speak-btn toolbar-speak" title="朗读选中文本">🔊</button>
          <span class="selected"></span>
          <span class="cached-tag" hidden>已缓存</span>
        </div>
        <div class="body"></div>
      </div>
    `;

    shadow.querySelectorAll('.mode-btn').forEach((btn) => {
      btn.addEventListener('click', () => {
        const mode = btn.getAttribute('data-mode');
        if (mode === currentMode) return;
        currentMode = mode;
        updateModeButtons();
        analyze();
      });
    });

    // toolbar 🔊：读完整选区原文
    shadow.querySelector('.toolbar-speak').addEventListener('click', () => {
      speak(currentText);
    });

    // body 内的 🔊 / 存（事件委托）
    shadow.querySelector('.body').addEventListener('click', (e) => {
      const speakBtn = e.target.closest('[data-speak]');
      if (speakBtn) { speak(speakBtn.getAttribute('data-speak')); return; }

      const saveBtn = e.target.closest('[data-save-idx]');
      if (saveBtn) handleSaveClick(saveBtn);
    });

    document.documentElement.appendChild(host);
    return host;
  }

  function shadow() { return ensureHost().shadowRoot; }
  function popupEl() { return shadow().querySelector('.popup'); }
  function bodyEl() { return shadow().querySelector('.body'); }
  function updateModeButtons() {
    shadow().querySelectorAll('.mode-btn').forEach((btn) => {
      btn.classList.toggle('active', btn.getAttribute('data-mode') === currentMode);
    });
  }

  function hidePopup() {
    const host = document.getElementById(HOST_ID);
    if (!host) return;
    host.shadowRoot.querySelector('.popup').hidden = true;
  }

  function showPopup() {
    const popup = popupEl();
    popup.hidden = false;
    const top = window.scrollY + currentRect.bottom + 8;
    let left = window.scrollX + currentRect.left;
    popup.style.top = `${top}px`;
    popup.style.left = `${left}px`;
    const rect = popup.getBoundingClientRect();
    const overflowRight = rect.right - window.innerWidth;
    if (overflowRight > 0) {
      left = Math.max(window.scrollX + 4, left - overflowRight - 8);
      popup.style.left = `${left}px`;
    }
  }

  // ——— 渲染 ———
  function escape(s) {
    return String(s ?? '').replace(/[&<>"']/g, (c) => ({
      '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
    })[c]);
  }

  function renderLoading() {
    bodyEl().innerHTML = `<div class="loading">分析中…</div>`;
    shadow().querySelector('.cached-tag').hidden = true;
  }

  function renderError(msg) {
    bodyEl().innerHTML = `<div class="error">${escape(msg)}</div>`;
    shadow().querySelector('.cached-tag').hidden = true;
  }

  // —— 卡片构建（流到正式渲染后才创建）——
  let renderedCards = [];
  function pushCard(card) { return renderedCards.push(card) - 1; }

  function makeVocabCard(w) {
    const back = [
      w.pos && `<b>${escape(w.pos)}</b>`,
      w.ipa && `<span style="font-family:ui-monospace,monospace">${escape(w.ipa)}</span>`,
      w.meaning_cn && escape(w.meaning_cn),
      w.example_en && `例：<i>${escape(w.example_en)}</i>`,
      w.example_cn && escape(w.example_cn)
    ].filter(Boolean).join('<br>');
    // 正面只放单词，让 Anki {{tts en_US:Front}} 念出来干净；例句留在背面。
    const front = escape(w.word);
    return {
      type: 'vocab',
      front,
      back,
      context: currentText,
      example: w.example_en || '',
      url: location.href
    };
  }

  function makeSentenceCard(data) {
    const parts = [];
    if (data.translation_cn) parts.push(`<b>翻译：</b>${escape(data.translation_cn)}`);
    if (data.literal_cn) parts.push(`<b>直译：</b>${escape(data.literal_cn)}`);
    if (data.structure_cn) parts.push(`<b>句式：</b>${escape(data.structure_cn)}`);
    if (Array.isArray(data.grammar_cn) && data.grammar_cn.length) {
      parts.push(`<b>语法：</b><br>${data.grammar_cn.map(g => '• ' + escape(g)).join('<br>')}`);
    }
    return {
      type: 'sentence',
      front: escape(currentText),
      back: parts.join('<br>'),
      context: currentText,
      example: '',
      url: location.href
    };
  }

  function renderWordCard(w, opts) {
    opts = opts || {};
    let saveBtn = '';
    if (!opts.streaming && w.word) {
      const idx = pushCard(makeVocabCard(w));
      saveBtn = `<button class="save-btn" data-save-idx="${idx}" title="存为 Anki 卡片">存</button>`;
    }
    return `
      <div class="word-card">
        <div class="word-head">
          ${w.word ? `<span class="w">${escape(w.word)}</span>` : ''}
          ${w.word ? `<button class="speak-btn mini" data-speak="${escape(w.word)}" title="朗读单词">🔊</button>` : ''}
          ${w.pos ? `<span class="pos">${escape(w.pos)}</span>` : ''}
          ${w.ipa ? `<span class="ipa">${escape(w.ipa)}</span>` : ''}
          ${saveBtn}
        </div>
        ${w.meaning_cn ? `<div class="word-meaning">${escape(w.meaning_cn)}</div>` : ''}
        ${w.example_en ? `
          <div class="word-example">
            <div class="en">${escape(w.example_en)} <button class="speak-btn mini" data-speak="${escape(w.example_en)}" title="朗读例句">🔊</button></div>
            ${w.example_cn ? `<div class="cn">${escape(w.example_cn)}</div>` : ''}
          </div>` : ''}
      </div>
    `;
  }

  // 点击"存"按钮：发消息给 background 落盘
  function handleSaveClick(btn) {
    const idx = +btn.dataset.saveIdx;
    const card = renderedCards[idx];
    if (!card) return;
    const original = btn.textContent;
    btn.disabled = true;
    btn.textContent = '存…';
    try {
      chrome.runtime.sendMessage({ type: 'saveCard', card }, (resp) => {
        if (chrome.runtime.lastError) {
          btn.textContent = '✗';
          setTimeout(() => { btn.disabled = false; btn.textContent = original; }, 1500);
          return;
        }
        if (resp?.ok) {
          btn.textContent = `✓ #${resp.count}`;
        } else {
          btn.textContent = '✗';
        }
        setTimeout(() => { btn.disabled = false; btn.textContent = original; }, 1500);
      });
    } catch (e) {
      btn.textContent = '✗';
      setTimeout(() => { btn.disabled = false; btn.textContent = original; }, 1500);
    }
  }

  // —— 流式 JSON 部分提取 ——
  // 容忍未闭合的字段：流到哪里就还原到哪里。
  function unescapeJSONString(s) {
    return s.replace(/\\(.)/g, (_, c) => {
      if (c === 'n') return '\n';
      if (c === 't') return '\t';
      if (c === 'r') return '\r';
      if (c === '"' || c === '\\' || c === '/') return c;
      return c;
    });
  }
  function extractStringField(buf, key) {
    // 抓到一个字符串字段的内容；字符串可能尚未闭合。
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
    let depth = 0, objStart = -1, inString = false, escape = false;
    let i;
    for (i = start; i < buf.length; i++) {
      const c = buf[i];
      if (escape) { escape = false; continue; }
      if (inString) {
        if (c === '\\') { escape = true; continue; }
        if (c === '"') { inString = false; continue; }
        continue;
      }
      if (c === '"') { inString = true; continue; }
      if (c === '{') { if (depth === 0) objStart = i; depth++; }
      else if (c === '}') {
        depth--;
        if (depth === 0 && objStart >= 0) {
          try { objects.push(JSON.parse(buf.slice(objStart, i + 1))); } catch {}
          objStart = -1;
        }
      } else if (c === ']' && depth === 0) break;
    }
    // 最后一个未闭合的对象：抓已出现的字段
    if (depth > 0 && objStart >= 0) {
      const partial = {};
      const partialBuf = buf.slice(objStart);
      for (const k of ['word', 'pos', 'ipa', 'meaning_cn', 'example_en', 'example_cn']) {
        const v = extractStringField(partialBuf, k);
        if (v !== null) partial[k] = v;
      }
      if (Object.keys(partial).length) objects.push(partial);
    }
    return objects;
  }
  function extractPartial(buf) {
    const data = {};
    const mode = extractStringField(buf, 'mode');
    if (mode) data.mode = mode;
    for (const k of ['translation_cn', 'literal_cn', 'structure_cn']) {
      const v = extractStringField(buf, k);
      if (v !== null) data[k] = v;
    }
    const grammar = extractStringArray(buf, 'grammar_cn');
    if (grammar && grammar.length) data.grammar_cn = grammar;
    const words = extractObjectsArray(buf, 'words');
    if (words && words.length) data.words = words;
    return data;
  }

  // —— HTML 构建（流式/最终共用）——
  function buildResultHTML(data, opts) {
    opts = opts || {};
    // final 渲染前清空卡片缓存；streaming 不入库不收集
    if (!opts.streaming) renderedCards = [];

    const wOpts = { streaming: !!opts.streaming };
    const parts = [];
    const isWordMode = data.mode === 'word' || (currentMode === 'word' && !data.translation_cn);

    if (isWordMode) {
      const words = data.words || [];
      if (words.length) {
        parts.push(words.map((w) => renderWordCard(w, wOpts)).join(''));
      }
    } else {
      // 句子模式：先放"存整句"按钮（仅 final）
      if (!opts.streaming) {
        const sCard = makeSentenceCard(data);
        if (sCard.back) {
          const idx = pushCard(sCard);
          parts.push(`<div class="save-row"><button class="save-btn" data-save-idx="${idx}" title="把整句存为 Anki 卡片">存整句</button></div>`);
        }
      }
      if (data.translation_cn) {
        parts.push(`<div class="section"><h4>翻译</h4><div class="translation">${escape(data.translation_cn)}</div></div>`);
      }
      if (data.literal_cn) {
        parts.push(`<div class="section"><h4>直译</h4><div class="literal">${escape(data.literal_cn)}</div></div>`);
      }
      if (data.structure_cn) {
        parts.push(`<div class="section"><h4>句式</h4><div class="structure">${escape(data.structure_cn)}</div></div>`);
      }
      if (Array.isArray(data.grammar_cn) && data.grammar_cn.length) {
        parts.push(`<div class="section"><h4>语法</h4><ul class="grammar">${
          data.grammar_cn.map((g) => `<li>${escape(g)}</li>`).join('')
        }</ul></div>`);
      }
      if (Array.isArray(data.words) && data.words.length) {
        parts.push(`<div class="section"><h4>重点词</h4>${data.words.map((w) => renderWordCard(w, wOpts)).join('')}</div>`);
      }
    }

    let html = parts.join('');
    if (opts.streaming) {
      const meta = `<div class="stream-meta">生成中 · ${opts.chars || 0} 字符</div>`;
      html = html ? meta + html : meta + `<div class="loading">等待首批 token…</div>`;
    } else if (!html) {
      html = `<div class="error">LLM 返回为空</div>`;
    }
    return html;
  }

  // rAF 节流：连续 chunk 合并到下一帧再 DOM 更新
  let pendingHTML = null;
  let rafScheduled = false;
  function applyHTML(html) {
    pendingHTML = html;
    if (rafScheduled) return;
    rafScheduled = true;
    requestAnimationFrame(() => {
      if (pendingHTML !== null) bodyEl().innerHTML = pendingHTML;
      pendingHTML = null;
      rafScheduled = false;
    });
  }

  function renderStreaming(accumulated) {
    const data = extractPartial(accumulated);
    applyHTML(buildResultHTML(data, { streaming: true, chars: accumulated.length }));
  }

  function renderResult(data, cached) {
    shadow().querySelector('.cached-tag').hidden = !cached;
    // 取消任何尚未应用的 streaming 帧
    pendingHTML = null;
    bodyEl().innerHTML = buildResultHTML(data, { streaming: false });
  }

  // 扩展是否还活着；重载后老的 content script 上下文会失效
  function isExtensionAlive() {
    try { return !!chrome?.runtime?.id; } catch { return false; }
  }

  // ——— 分析（流式）———
  function analyze() {
    if (!currentText) return;

    if (!isExtensionAlive()) {
      // 老 content script 已孤儿化，悄悄退出；用户刷新页面即可恢复
      hidePopup();
      return;
    }

    ensureHost();
    updateModeButtons();
    shadow().querySelector('.selected').textContent = currentText;
    showPopup();
    renderLoading();

    // 作废旧请求
    if (currentPort) {
      try { currentPort.disconnect(); } catch {}
      currentPort = null;
    }
    const myToken = ++inFlight;

    let port;
    try {
      port = chrome.runtime.connect({ name: 'analyze' });
    } catch (e) {
      renderError('无法连接 service worker（可能扩展刚重载，刷新页面即可）：' + e.message);
      return;
    }
    currentPort = port;

    let gotChunk = false;
    port.onMessage.addListener((msg) => {
      if (myToken !== inFlight) return;
      if (!msg) return;

      try {
        if (msg.type === 'chunk') {
          gotChunk = true;
          renderStreaming(msg.accumulated);
        } else if (msg.type === 'done') {
          renderResult(msg.data, !!msg.cached);
        } else if (msg.type === 'error') {
          renderError(msg.error || '未知错误');
        }
      } catch (e) {
        // 防御：上下文失效时跨边界对象的属性访问可能抛错
        if (!isExtensionAlive()) { hidePopup(); return; }
        renderError('渲染失败：' + (e?.message || e));
      }
    });

    port.onDisconnect.addListener(() => {
      if (currentPort === port) currentPort = null;
      const lastErr = (() => { try { return chrome.runtime.lastError; } catch { return null; } })();
      if (!lastErr || myToken !== inFlight) return;
      if (!gotChunk) {
        const body = bodyEl();
        if (body.querySelector('.loading') || body.querySelector('.stream-meta')) {
          renderError('通信中断：' + (lastErr.message || ''));
        }
      }
    });

    try {
      port.postMessage({ type: 'start', mode: currentMode, text: currentText });
    } catch (e) {
      if (!isExtensionAlive()) { hidePopup(); return; }
      renderError('发送请求失败：' + (e?.message || e));
    }
  }

  // ——— 选区事件 ———
  function isInsidePopup(node) {
    const host = document.getElementById(HOST_ID);
    if (!host) return false;
    return host.contains(node) || (node?.getRootNode && node.getRootNode().host === host);
  }

  document.addEventListener('mouseup', (e) => {
    if (e.target && isInsidePopup(e.target)) return;
    setTimeout(() => {
      const sel = window.getSelection();
      if (!sel || sel.isCollapsed) { hidePopup(); return; }
      const text = sel.toString().trim();
      if (!text) { hidePopup(); return; }
      const range = sel.getRangeAt(0);
      const rect = range.getBoundingClientRect();
      if (rect.width === 0 && rect.height === 0) { hidePopup(); return; }

      currentText = text;
      currentRect = rect;
      currentMode = detectMode(text);
      analyze();
    }, 0);
  });

  document.addEventListener('mousedown', (e) => {
    if (e.target && isInsidePopup(e.target)) return;
    const sel = window.getSelection();
    if (!sel || sel.isCollapsed) hidePopup();
  });

  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') hidePopup();
  });
})();
