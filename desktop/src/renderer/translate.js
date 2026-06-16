const { clipboard, ipcRenderer } = require('electron');

const sourceEl = document.getElementById('sourceText');
const resultEl = document.getElementById('resultText');
const statusEl = document.getElementById('status');

let currentSource = '';

ipcRenderer.on('translation:start', (_event, payload) => {
  currentSource = payload.sourceText || '';
  sourceEl.textContent = currentSource;
  resultEl.textContent = '';
  statusEl.textContent = '生成中...';
});

ipcRenderer.on('translation:delta', (_event, payload) => {
  resultEl.textContent = payload.fullText || '';
  statusEl.textContent = '生成中...';
});

ipcRenderer.on('translation:done', (_event, payload) => {
  resultEl.textContent = payload.fullText || resultEl.textContent;
  statusEl.textContent = '完成';
});

ipcRenderer.on('translation:error', (_event, payload) => {
  statusEl.textContent = payload.error || '翻译失败';
  statusEl.style.color = '#c0392b';
});

document.getElementById('copy').addEventListener('click', () => {
  clipboard.writeText(resultEl.textContent || '');
  statusEl.textContent = '已复制';
  statusEl.style.color = '#2a8a2a';
});

document.getElementById('retry').addEventListener('click', () => {
  if (currentSource) ipcRenderer.send('translation:retry', { sourceText: currentSource });
});
