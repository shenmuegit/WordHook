const {
  app,
  Menu,
  Tray,
  nativeImage,
  globalShortcut,
  ipcMain,
  dialog
} = require('electron');

const { readConfig, writeConfig, hasApiConfig } = require('./config-store');
const { captureSelectedText, warmSelectionCapture, stopSelectionCapture } = require('./selection');
const { streamChatCompletion } = require('./llm');
const {
  beginTranslateResize,
  endTranslateResize,
  openConfigWindow,
  openTranslateWindow,
  prepareTranslateWindow,
  sendToTranslate
} = require('./windows');

let tray = null;
let currentConfig = null;
let hotkeyRegistered = false;

function createTrayImage() {
  return nativeImage.createFromDataURL(
    'data:image/svg+xml;utf8,' +
    encodeURIComponent(`
      <svg xmlns="http://www.w3.org/2000/svg" width="32" height="32">
        <rect width="32" height="32" rx="6" fill="#ff6600"/>
        <text x="16" y="21" text-anchor="middle" font-family="Arial" font-size="14" font-weight="700" fill="white">W</text>
      </svg>
    `)
  );
}

function rebuildTrayMenu() {
  const label = hotkeyRegistered ? 'Disable Hotkey' : 'Enable Hotkey';
  const menu = Menu.buildFromTemplate([
    { label: 'Translate Selection', click: translateCurrentSelection },
    { label: 'Configuration', click: openConfigWindow },
    { type: 'separator' },
    { label, click: toggleHotkey },
    { type: 'separator' },
    { label: 'Exit', click: () => app.quit() }
  ]);
  tray.setContextMenu(menu);
}

function registerConfiguredHotkey() {
  globalShortcut.unregisterAll();
  hotkeyRegistered = false;

  if (!currentConfig?.hotkeyEnabled) {
    rebuildTrayMenu();
    return;
  }

  hotkeyRegistered = globalShortcut.register(currentConfig.hotkey, translateCurrentSelection);
  rebuildTrayMenu();

  if (!hotkeyRegistered) {
    dialog.showErrorBox('WordHook', `快捷键注册失败：${currentConfig.hotkey}`);
  }
}

async function toggleHotkey() {
  currentConfig = await writeConfig({
    ...currentConfig,
    hotkeyEnabled: !hotkeyRegistered
  });
  registerConfiguredHotkey();
}

async function ensureConfig() {
  currentConfig = await readConfig();
  if (!hasApiConfig(currentConfig)) {
    openConfigWindow();
    return false;
  }
  return true;
}

async function translateText(sourceText) {
  if (!(await ensureConfig())) return;

  const text = String(sourceText || '').trim();
  openTranslateWindow(text);

  if (!text) {
    sendToTranslate('translation:error', { error: '没有读取到选中文本' });
    return;
  }

  try {
    await streamChatCompletion(currentConfig, text, {
      onDelta: (_delta, fullText) => sendToTranslate('translation:delta', { fullText }),
      onDone: (fullText) => sendToTranslate('translation:done', { fullText })
    });
  } catch (error) {
    sendToTranslate('translation:error', { error: String(error?.message || error) });
  }
}

async function translateCurrentSelection() {
  const text = await captureSelectedText().catch((error) => {
    openTranslateWindow('');
    sendToTranslate('translation:error', { error: `读取选中文本失败：${error.message || error}` });
    return '';
  });
  await translateText(text);
}

function registerIpc() {
  ipcMain.handle('config:get', async () => {
    currentConfig = await readConfig();
    return currentConfig;
  });

  ipcMain.handle('config:set', async (_event, nextConfig) => {
    try {
      currentConfig = await writeConfig(nextConfig);
      registerConfiguredHotkey();
      return { ok: true, config: currentConfig, hotkeyRegistered };
    } catch (error) {
      return { ok: false, error: String(error?.message || error) };
    }
  });

  ipcMain.on('translation:retry', (_event, payload) => {
    translateText(payload?.sourceText || '');
  });

  ipcMain.on('translation:resize-start', (_event, payload) => {
    beginTranslateResize(payload?.edge);
  });

  ipcMain.on('translation:resize-end', () => {
    endTranslateResize();
  });
}

app.whenReady().then(async () => {
  currentConfig = await readConfig();
  tray = new Tray(createTrayImage());
  tray.setToolTip('WordHook');
  registerIpc();
  rebuildTrayMenu();
  prepareTranslateWindow();
  warmSelectionCapture().catch(() => {});
  registerConfiguredHotkey();
});

app.on('will-quit', () => {
  globalShortcut.unregisterAll();
  stopSelectionCapture().catch(() => {});
});

app.on('window-all-closed', (event) => {
  event.preventDefault();
});
