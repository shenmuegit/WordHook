const { clipboard, ipcRenderer } = require('electron');
const { renderMarkdown } = require('./markdown');

const sourceEl = document.getElementById('sourceText');
const resultEl = document.getElementById('resultText');
const statusEl = document.getElementById('status');

let currentSource = '';
let currentResult = '';

function setResultText(value) {
  currentResult = value || '';
  resultEl.innerHTML = renderMarkdown(currentResult);
}

ipcRenderer.on('translation:start', (_event, payload) => {
  currentSource = payload.sourceText || '';
  sourceEl.textContent = currentSource;
  setResultText('');
  statusEl.textContent = '生成中...';
  statusEl.style.color = '#777';
});

ipcRenderer.on('translation:status', (_event, payload) => {
  statusEl.textContent = payload.status || '';
  statusEl.style.color = '#777';
});

ipcRenderer.on('translation:delta', (_event, payload) => {
  setResultText(payload.fullText || '');
  statusEl.textContent = '生成中...';
  statusEl.style.color = '#777';
});

ipcRenderer.on('translation:done', (_event, payload) => {
  setResultText(payload.fullText || currentResult);
  statusEl.textContent = '完成';
  statusEl.style.color = '#2a8a2a';
});

ipcRenderer.on('translation:error', (_event, payload) => {
  statusEl.textContent = payload.error || '翻译失败';
  statusEl.style.color = '#c0392b';
});

document.getElementById('copy').addEventListener('click', () => {
  clipboard.writeText(resultEl.textContent || currentResult || '');
  statusEl.textContent = '已复制';
  statusEl.style.color = '#2a8a2a';
});

document.getElementById('retry').addEventListener('click', () => {
  if (currentSource) ipcRenderer.send('translation:retry', { sourceText: currentSource });
});

document.getElementById('close').addEventListener('click', () => {
  window.close();
});
