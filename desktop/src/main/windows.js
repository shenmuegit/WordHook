const path = require('node:path');
const { BrowserWindow, screen } = require('electron');

let configWindow = null;
let translateWindow = null;
let hoverPoller = null;
let lastTranslateHover = null;
let resizePoller = null;
let resizeState = null;
let movePoller = null;
let moveState = null;
const MIN_TRANSLATE_WIDTH = 320;
const MIN_TRANSLATE_HEIGHT = 240;

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
    height: 560,
    resizable: false,
    title: 'WordHook 配置',
    autoHideMenuBar: true,
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false
    }
  });
  configWindow.setMenu(null);

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

function hideTranslateWindow() {
  if (!translateWindow || translateWindow.isDestroyed()) return;
  endTranslateMove();
  endTranslateResize();
  translateWindow.hide();
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
    minWidth: MIN_TRANSLATE_WIDTH,
    minHeight: MIN_TRANSLATE_HEIGHT,
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

function beginTranslateResize(edge) {
  if (!translateWindow || translateWindow.isDestroyed()) return;
  endTranslateResize();
  const normalizedEdge = String(edge || '').toLowerCase();
  if (!/^(n|e|s|w|ne|nw|se|sw)$/.test(normalizedEdge)) return;

  resizeState = {
    edge: normalizedEdge,
    startPoint: screen.getCursorScreenPoint(),
    startBounds: translateWindow.getBounds()
  };

  resizePoller = setInterval(updateTranslateResize, 16);
}

function endTranslateResize() {
  if (resizePoller) {
    clearInterval(resizePoller);
    resizePoller = null;
  }
  resizeState = null;
}

function beginTranslateMove() {
  if (!translateWindow || translateWindow.isDestroyed()) return;
  endTranslateMove();
  moveState = {
    startPoint: screen.getCursorScreenPoint(),
    startBounds: translateWindow.getBounds()
  };
  movePoller = setInterval(updateTranslateMove, 16);
}

function endTranslateMove() {
  if (movePoller) {
    clearInterval(movePoller);
    movePoller = null;
  }
  moveState = null;
}

function updateTranslateMove() {
  if (!moveState || !translateWindow || translateWindow.isDestroyed()) {
    endTranslateMove();
    return;
  }

  const point = screen.getCursorScreenPoint();
  translateWindow.setBounds({
    ...moveState.startBounds,
    x: moveState.startBounds.x + point.x - moveState.startPoint.x,
    y: moveState.startBounds.y + point.y - moveState.startPoint.y
  });
}

function updateTranslateResize() {
  if (!resizeState || !translateWindow || translateWindow.isDestroyed()) {
    endTranslateResize();
    return;
  }

  const point = screen.getCursorScreenPoint();
  const dx = point.x - resizeState.startPoint.x;
  const dy = point.y - resizeState.startPoint.y;
  const edge = resizeState.edge;
  const start = resizeState.startBounds;
  const next = { ...start };

  if (edge.includes('e')) {
    next.width = Math.max(MIN_TRANSLATE_WIDTH, start.width + dx);
  }
  if (edge.includes('s')) {
    next.height = Math.max(MIN_TRANSLATE_HEIGHT, start.height + dy);
  }
  if (edge.includes('w')) {
    next.width = Math.max(MIN_TRANSLATE_WIDTH, start.width - dx);
    next.x = start.x + (start.width - next.width);
  }
  if (edge.includes('n')) {
    next.height = Math.max(MIN_TRANSLATE_HEIGHT, start.height - dy);
    next.y = start.y + (start.height - next.height);
  }

  translateWindow.setBounds(next);
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
  beginTranslateMove,
  beginTranslateResize,
  endTranslateMove,
  endTranslateResize,
  hideTranslateWindow,
  openConfigWindow,
  openTranslateWindow,
  prepareTranslateWindow,
  bringTranslateWindowToFront,
  showTranslateWindowInactive,
  sendToTranslate
};
