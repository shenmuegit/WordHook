const path = require('node:path');
const { BrowserWindow, screen } = require('electron');

let configWindow = null;
let translateWindow = null;
let hoverPoller = null;
let lastTranslateHover = null;

function rendererPath(file) {
  return path.join(__dirname, '..', 'renderer', file);
}

function openConfigWindow() {
  if (configWindow && !configWindow.isDestroyed()) {
    configWindow.show();
    configWindow.focus();
    return configWindow;
  }

  configWindow = new BrowserWindow({
    width: 420,
    height: 430,
    resizable: false,
    title: 'WordHook 配置',
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false
    }
  });

  configWindow.loadFile(rendererPath('config.html'));
  configWindow.on('closed', () => {
    configWindow = null;
  });
  return configWindow;
}

function openTranslateWindow(sourceText, options = {}) {
  const shouldFocus = options.focus !== false;
  const win = ensureTranslateWindow();

  if (shouldFocus) bringTranslateWindowToFront();
  else showTranslateWindowInactive();

  win.webContents.once('did-finish-load', () => {
    sendToTranslate('translation:start', { sourceText });
  });

  if (!win.webContents.isLoading()) {
    sendToTranslate('translation:start', { sourceText });
  }

  return win;
}

function prepareTranslateWindow() {
  return ensureTranslateWindow();
}

function ensureTranslateWindow() {
  if (translateWindow && !translateWindow.isDestroyed()) {
    return translateWindow;
  }

  const display = screen.getPrimaryDisplay();
  const { width, height } = display.workAreaSize;
  const winWidth = 420;
  const winHeight = 360;

  translateWindow = new BrowserWindow({
    width: winWidth,
    height: winHeight,
    x: Math.max(0, width - winWidth - 18),
    y: Math.max(0, height - winHeight - 18),
    title: 'WordHook 翻译',
    show: false,
    frame: false,
    transparent: true,
    backgroundColor: '#00000000',
    resizable: true,
    minWidth: 320,
    minHeight: 240,
    skipTaskbar: true,
    alwaysOnTop: true,
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false
    }
  });
  translateWindow.loadFile(rendererPath('translate.html'));
  startTranslateHoverPolling();
  translateWindow.on('closed', () => {
    stopTranslateHoverPolling();
    translateWindow = null;
  });
  return translateWindow;
}

function startTranslateHoverPolling() {
  stopTranslateHoverPolling();
  lastTranslateHover = null;
  hoverPoller = setInterval(() => {
    if (!translateWindow || translateWindow.isDestroyed()) {
      stopTranslateHoverPolling();
      return;
    }
    const point = screen.getCursorScreenPoint();
    const bounds = translateWindow.getBounds();
    const hovered = (
      point.x >= bounds.x &&
      point.x <= bounds.x + bounds.width &&
      point.y >= bounds.y &&
      point.y <= bounds.y + bounds.height
    );
    if (hovered === lastTranslateHover) return;
    lastTranslateHover = hovered;
    sendToTranslate('translation:hover', { hovered });
  }, 80);
}

function stopTranslateHoverPolling() {
  if (hoverPoller) {
    clearInterval(hoverPoller);
    hoverPoller = null;
  }
}

function showTranslateWindowInactive() {
  if (!translateWindow || translateWindow.isDestroyed()) return;
  try { translateWindow.setAlwaysOnTop(true, 'screen-saver'); } catch {}
  if (typeof translateWindow.showInactive === 'function') {
    translateWindow.showInactive();
  } else {
    translateWindow.show();
  }
}

function bringTranslateWindowToFront() {
  if (!translateWindow || translateWindow.isDestroyed()) return;
  try { translateWindow.setAlwaysOnTop(true, 'screen-saver'); } catch {}
  try { translateWindow.moveTop(); } catch {}
  try { translateWindow.restore(); } catch {}
  translateWindow.show();
  translateWindow.focus();
}

function sendToTranslate(channel, payload) {
  if (translateWindow && !translateWindow.isDestroyed()) {
    translateWindow.webContents.send(channel, payload);
  }
}

module.exports = {
  openConfigWindow,
  openTranslateWindow,
  prepareTranslateWindow,
  bringTranslateWindowToFront,
  showTranslateWindowInactive,
  sendToTranslate
};
