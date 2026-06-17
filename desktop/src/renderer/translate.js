const { ipcRenderer } = require('electron');
const { renderMarkdown } = require('./markdown');

const sourceEl = document.getElementById('sourceText');
const resultEl = document.getElementById('resultText');
const glassShell = document.querySelector('.glass-shell');
const hideWindowButton = document.getElementById('hideWindow');

let currentSource = '';
let currentResult = '';

function applyWindowStyle(style) {
  if (style?.windowBackground) {
    document.documentElement.style.setProperty('--window-bg', style.windowBackground);
  }
}

ipcRenderer.invoke('config:get').then((config) => {
  applyWindowStyle({ windowBackground: config.windowBackground });
}).catch(() => {});

function setResultText(value) {
  currentResult = value || '';
  resultEl.innerHTML = renderMarkdown(currentResult);
}

function showHoverChrome() {
  glassShell.classList.add('is-hovered');
}

function hideHoverChrome() {
  glassShell.classList.remove('is-hovered');
}

window.addEventListener('mouseenter', showHoverChrome);
window.addEventListener('mousemove', showHoverChrome);
window.addEventListener('pointerover', showHoverChrome);
document.addEventListener('mouseover', showHoverChrome);
document.addEventListener('mouseleave', hideHoverChrome);

ipcRenderer.on('translation:hover', (_event, payload) => {
  if (payload.hovered) showHoverChrome();
  else hideHoverChrome();
});

ipcRenderer.on('translation:style', (_event, payload) => {
  applyWindowStyle(payload);
});

hideWindowButton.addEventListener('click', () => {
  ipcRenderer.send('translation:hide');
});

document.querySelector('.drag-strip').addEventListener('mousedown', (event) => {
  event.preventDefault();
  event.stopPropagation();
  ipcRenderer.send('translation:move-start');
});

document.querySelectorAll('[data-resize]').forEach((handle) => {
  handle.addEventListener('mousedown', (event) => {
    event.preventDefault();
    event.stopPropagation();
    ipcRenderer.send('translation:resize-start', { edge: handle.dataset.resize });
  });
});

window.addEventListener('mouseup', () => {
  ipcRenderer.send('translation:move-end');
  ipcRenderer.send('translation:resize-end');
});

window.addEventListener('blur', () => {
  ipcRenderer.send('translation:move-end');
  ipcRenderer.send('translation:resize-end');
});

ipcRenderer.on('translation:start', (_event, payload) => {
  currentSource = payload.sourceText || '';
  sourceEl.textContent = currentSource;
  setResultText('分析中...');
});

ipcRenderer.on('translation:status', (_event, payload) => {
  if (!currentResult) setResultText(payload.status || '分析中...');
});

ipcRenderer.on('translation:delta', (_event, payload) => {
  setResultText(payload.fullText || '');
});

ipcRenderer.on('translation:done', (_event, payload) => {
  setResultText(payload.fullText || currentResult);
});

ipcRenderer.on('translation:error', (_event, payload) => {
  setResultText(`**错误**\n\n${payload.error || '翻译失败'}`);
});
