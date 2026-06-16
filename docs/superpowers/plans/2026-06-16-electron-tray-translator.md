# Electron Tray Translator Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a Windows-only Electron tray app that translates the current selected text with `Ctrl+Shift+T` or a tray menu command.

**Architecture:** Add an isolated `desktop/` Electron project beside the existing Chrome extension. The Electron main process owns tray, global shortcut, clipboard capture, LLM requests, config persistence, and IPC; renderer windows only display the config form and translation result.

**Tech Stack:** Electron, Node.js CommonJS modules, native Electron `clipboard/globalShortcut/Tray/BrowserWindow`, Windows PowerShell `SendKeys` for `Ctrl+C`, OpenAI-compatible Chat Completions over `fetch`.

---

## File Structure

Create these files:

- `desktop/package.json`: Electron app metadata and scripts.
- `desktop/src/main/app.js`: Electron lifecycle, tray menu, hotkey registration, translation orchestration, IPC handlers.
- `desktop/src/main/config-store.js`: local config read/write in Electron user data.
- `desktop/src/main/selection.js`: current selected text capture via save-copy-read-restore clipboard flow.
- `desktop/src/main/llm.js`: OpenAI-compatible streaming request.
- `desktop/src/main/windows.js`: config/result window creation and IPC message helpers.
- `desktop/src/renderer/config.html`: configuration form.
- `desktop/src/renderer/config.css`: configuration styling.
- `desktop/src/renderer/config.js`: configuration renderer IPC.
- `desktop/src/renderer/translate.html`: translation result UI.
- `desktop/src/renderer/translate.css`: translation styling.
- `desktop/src/renderer/translate.js`: translation renderer IPC.

Do not modify the existing browser extension files in this MVP.

---

## Task 1: Scaffold Electron Desktop Project

**Files:**

- Modify: `.gitignore`
- Create: `desktop/package.json`
- Create: `desktop/src/main/app.js`
- Create: `desktop/src/main/config-store.js`
- Create: `desktop/src/main/selection.js`
- Create: `desktop/src/main/llm.js`
- Create: `desktop/src/main/windows.js`
- Create: `desktop/src/renderer/config.html`
- Create: `desktop/src/renderer/config.css`
- Create: `desktop/src/renderer/config.js`
- Create: `desktop/src/renderer/translate.html`
- Create: `desktop/src/renderer/translate.css`
- Create: `desktop/src/renderer/translate.js`

- [ ] **Step 1: Create the directory tree**

Run:

```powershell
New-Item -ItemType Directory -Force desktop\src\main, desktop\src\renderer
```

Expected: both directories exist.

- [ ] **Step 2: Ignore desktop dependency artifacts**

Append these lines to `.gitignore`:

```gitignore
# Desktop dependencies
desktop/node_modules/
```

- [ ] **Step 3: Create `desktop/package.json`**

```json
{
  "name": "wordhook-desktop",
  "version": "0.1.0",
  "private": true,
  "description": "Windows tray translator for WordHook",
  "main": "src/main/app.js",
  "scripts": {
    "start": "electron ."
  },
  "devDependencies": {
    "electron": "^31.7.7"
  }
}
```

- [ ] **Step 4: Create placeholder modules so Electron can start**

Create `desktop/src/main/app.js`:

```js
const { app } = require('electron');

app.whenReady().then(() => {
  console.log('WordHook desktop scaffold ready');
});

app.on('window-all-closed', (event) => {
  event.preventDefault();
});
```

Create these empty module files:

```js
module.exports = {};
```

Apply that content to:

- `desktop/src/main/config-store.js`
- `desktop/src/main/selection.js`
- `desktop/src/main/llm.js`
- `desktop/src/main/windows.js`

Create `desktop/src/renderer/config.html`:

```html
<!doctype html>
<html lang="zh-CN">
<head>
  <meta charset="utf-8">
  <title>WordHook 配置</title>
</head>
<body>
  <h1>WordHook 配置</h1>
  <script src="./config.js"></script>
</body>
</html>
```

Create `desktop/src/renderer/config.css`, `desktop/src/renderer/config.js`, `desktop/src/renderer/translate.css`, and `desktop/src/renderer/translate.js` as empty files.

Create `desktop/src/renderer/translate.html`:

```html
<!doctype html>
<html lang="zh-CN">
<head>
  <meta charset="utf-8">
  <title>WordHook 翻译</title>
</head>
<body>
  <h1>WordHook 翻译</h1>
  <script src="./translate.js"></script>
</body>
</html>
```

- [ ] **Step 5: Install dependencies**

Run:

```powershell
Set-Location desktop
npm install
```

Expected: `node_modules` and `package-lock.json` are created, install exits with code 0.

- [ ] **Step 6: Verify Electron starts**

Run:

```powershell
npm start
```

Expected: console prints `WordHook desktop scaffold ready`. Quit with `Ctrl+C`.

- [ ] **Step 7: Commit scaffold**

```powershell
git add .gitignore desktop
git commit -m "feat(desktop): scaffold electron tray app"
```

---

## Task 2: Implement Local Configuration Store

**Files:**

- Modify: `desktop/src/main/config-store.js`
- Modify: `desktop/src/main/app.js`

- [ ] **Step 1: Replace `config-store.js` with config read/write helpers**

```js
const fs = require('node:fs/promises');
const path = require('node:path');
const { app } = require('electron');

const DEFAULT_CONFIG = {
  baseURL: '',
  model: '',
  apiKey: '',
  hotkey: 'CommandOrControl+Shift+T',
  hotkeyEnabled: true
};

function configPath() {
  return path.join(app.getPath('userData'), 'config.json');
}

async function readConfig() {
  try {
    const raw = await fs.readFile(configPath(), 'utf8');
    const parsed = JSON.parse(raw);
    return { ...DEFAULT_CONFIG, ...parsed };
  } catch (error) {
    if (error.code === 'ENOENT') return { ...DEFAULT_CONFIG };
    throw error;
  }
}

async function writeConfig(nextConfig) {
  const merged = { ...DEFAULT_CONFIG, ...nextConfig };
  await fs.mkdir(path.dirname(configPath()), { recursive: true });
  await fs.writeFile(configPath(), JSON.stringify(merged, null, 2), 'utf8');
  return merged;
}

function hasApiConfig(config) {
  return Boolean(config?.baseURL && config?.model && config?.apiKey);
}

module.exports = {
  DEFAULT_CONFIG,
  readConfig,
  writeConfig,
  hasApiConfig
};
```

- [ ] **Step 2: Temporarily verify config path from `app.js`**

Replace `desktop/src/main/app.js`:

```js
const { app } = require('electron');
const { readConfig } = require('./config-store');

app.whenReady().then(async () => {
  const config = await readConfig();
  console.log('WordHook config loaded:', config.hotkey);
});

app.on('window-all-closed', (event) => {
  event.preventDefault();
});
```

- [ ] **Step 3: Run startup verification**

Run:

```powershell
Set-Location desktop
npm start
```

Expected: console prints `WordHook config loaded: CommandOrControl+Shift+T`.

- [ ] **Step 4: Commit config store**

```powershell
git add desktop/src/main/config-store.js desktop/src/main/app.js
git commit -m "feat(desktop): add local config store"
```

---

## Task 3: Implement Selection Capture

**Files:**

- Modify: `desktop/src/main/selection.js`
- Modify: `desktop/src/main/app.js`

- [ ] **Step 1: Replace `selection.js` with clipboard capture logic**

```js
const { clipboard } = require('electron');
const { execFile } = require('node:child_process');

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function sendCtrlC() {
  return new Promise((resolve, reject) => {
    const script = [
      'Add-Type -AssemblyName System.Windows.Forms',
      '[System.Windows.Forms.SendKeys]::SendWait("^c")'
    ].join('; ');

    execFile(
      'powershell.exe',
      ['-NoProfile', '-STA', '-Command', script],
      { windowsHide: true },
      (error) => {
        if (error) reject(error);
        else resolve();
      }
    );
  });
}

async function captureSelectedText() {
  const previousText = clipboard.readText();

  try {
    clipboard.writeText('');
    await sendCtrlC();
    await delay(180);
    return clipboard.readText().trim();
  } finally {
    clipboard.writeText(previousText);
  }
}

module.exports = {
  captureSelectedText
};
```

- [ ] **Step 2: Temporarily wire manual capture logging in `app.js`**

Replace `desktop/src/main/app.js`:

```js
const { app, globalShortcut } = require('electron');
const { captureSelectedText } = require('./selection');

app.whenReady().then(() => {
  const ok = globalShortcut.register('CommandOrControl+Shift+T', async () => {
    const text = await captureSelectedText();
    console.log('Captured selection:', text || '<empty>');
  });
  console.log('Hotkey registered:', ok);
});

app.on('will-quit', () => {
  globalShortcut.unregisterAll();
});

app.on('window-all-closed', (event) => {
  event.preventDefault();
});
```

- [ ] **Step 3: Verify capture in Notepad**

Run:

```powershell
Set-Location desktop
npm start
```

Open Notepad, type `hello world`, select it, press `Ctrl+Shift+T`.

Expected: Electron console prints `Captured selection: hello world`.

- [ ] **Step 4: Verify empty selection**

Click into Notepad with no selected text and press `Ctrl+Shift+T`.

Expected: Electron console prints `Captured selection: <empty>`.

- [ ] **Step 5: Commit selection capture**

```powershell
git add desktop/src/main/selection.js desktop/src/main/app.js
git commit -m "feat(desktop): capture selected text with hotkey"
```

---

## Task 4: Implement LLM Streaming Client

**Files:**

- Modify: `desktop/src/main/llm.js`
- Modify: `desktop/src/main/app.js`

- [ ] **Step 1: Replace `llm.js` with OpenAI-compatible streaming client**

```js
const SYSTEM_PROMPT = `你在帮一个完全不懂英语的中国初学者学习和理解文字。
所有解释用中文；不要用语法术语，必须用时立刻用大白话解释；
如果输入是英文，解释中文含义、自然翻译和关键用法；
如果输入是中文，给出自然英文表达并解释怎么造句；
回答要简洁清楚，不要 markdown 表格。`;

function buildUserPrompt(text) {
  return `请解释或翻译下面这段选中文本：\n\n${text}`;
}

function endpoint(baseURL) {
  return baseURL.replace(/\/+$/, '') + '/chat/completions';
}

async function streamChatCompletion(config, text, handlers = {}) {
  const response = await fetch(endpoint(config.baseURL), {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${config.apiKey}`
    },
    body: JSON.stringify({
      model: config.model,
      messages: [
        { role: 'system', content: SYSTEM_PROMPT },
        { role: 'user', content: buildUserPrompt(text) }
      ],
      temperature: 0.3,
      max_tokens: 900,
      stream: true
    })
  });

  if (!response.ok) {
    const detail = await response.text().catch(() => '');
    throw new Error(`LLM HTTP ${response.status}: ${detail.slice(0, 300)}`);
  }

  if (!response.body) {
    throw new Error('LLM response has no body');
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder('utf-8');
  let buffer = '';
  let fullText = '';

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });

    let separatorIndex;
    while ((separatorIndex = buffer.indexOf('\n\n')) >= 0) {
      const event = buffer.slice(0, separatorIndex);
      buffer = buffer.slice(separatorIndex + 2);

      for (const line of event.split('\n')) {
        if (!line.startsWith('data:')) continue;
        const data = line.slice(5).trim();
        if (!data || data === '[DONE]') continue;

        const parsed = JSON.parse(data);
        const delta = parsed?.choices?.[0]?.delta?.content || '';
        if (delta) {
          fullText += delta;
          handlers.onDelta?.(delta, fullText);
        }
      }
    }
  }

  handlers.onDone?.(fullText);
  return fullText;
}

module.exports = {
  streamChatCompletion
};
```

- [ ] **Step 2: Temporarily verify missing config path from `app.js`**

Replace `desktop/src/main/app.js`:

```js
const { app } = require('electron');
const { readConfig, hasApiConfig } = require('./config-store');

app.whenReady().then(async () => {
  const config = await readConfig();
  console.log('Has API config:', hasApiConfig(config));
});

app.on('window-all-closed', (event) => {
  event.preventDefault();
});
```

- [ ] **Step 3: Run syntax verification**

Run:

```powershell
Set-Location desktop
npm start
```

Expected: app starts and prints `Has API config: false` or `Has API config: true`.

- [ ] **Step 4: Commit LLM client**

```powershell
git add desktop/src/main/llm.js desktop/src/main/app.js
git commit -m "feat(desktop): add openai compatible llm client"
```

---

## Task 5: Implement Windows and Renderer IPC

**Files:**

- Modify: `desktop/src/main/windows.js`
- Modify: `desktop/src/renderer/config.html`
- Modify: `desktop/src/renderer/config.css`
- Modify: `desktop/src/renderer/config.js`
- Modify: `desktop/src/renderer/translate.html`
- Modify: `desktop/src/renderer/translate.css`
- Modify: `desktop/src/renderer/translate.js`

- [ ] **Step 1: Replace `windows.js`**

```js
const path = require('node:path');
const { BrowserWindow, screen } = require('electron');

let configWindow = null;
let translateWindow = null;

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

function openTranslateWindow(sourceText) {
  const display = screen.getPrimaryDisplay();
  const { width, height } = display.workAreaSize;
  const winWidth = 480;
  const winHeight = 520;

  if (translateWindow && !translateWindow.isDestroyed()) {
    translateWindow.show();
    translateWindow.focus();
  } else {
    translateWindow = new BrowserWindow({
      width: winWidth,
      height: winHeight,
      x: Math.max(0, width - winWidth - 18),
      y: Math.max(0, height - winHeight - 18),
      title: 'WordHook 翻译',
      webPreferences: {
        nodeIntegration: true,
        contextIsolation: false
      }
    });
    translateWindow.loadFile(rendererPath('translate.html'));
    translateWindow.on('closed', () => {
      translateWindow = null;
    });
  }

  translateWindow.webContents.once('did-finish-load', () => {
    sendToTranslate('translation:start', { sourceText });
  });

  if (!translateWindow.webContents.isLoading()) {
    sendToTranslate('translation:start', { sourceText });
  }

  return translateWindow;
}

function sendToTranslate(channel, payload) {
  if (translateWindow && !translateWindow.isDestroyed()) {
    translateWindow.webContents.send(channel, payload);
  }
}

module.exports = {
  openConfigWindow,
  openTranslateWindow,
  sendToTranslate
};
```

- [ ] **Step 2: Replace config renderer files**

`desktop/src/renderer/config.html`:

```html
<!doctype html>
<html lang="zh-CN">
<head>
  <meta charset="utf-8">
  <title>WordHook 配置</title>
  <link rel="stylesheet" href="./config.css">
</head>
<body>
  <main>
    <h1>WordHook 配置</h1>
    <label>Base URL<input id="baseURL" placeholder="https://api.openai.com/v1"></label>
    <label>Model<input id="model" placeholder="gpt-4o-mini"></label>
    <label>API Key<input id="apiKey" type="password" placeholder="sk-..."></label>
    <label>快捷键<input id="hotkey" placeholder="CommandOrControl+Shift+T"></label>
    <label class="check"><input id="hotkeyEnabled" type="checkbox"> 启用快捷键</label>
    <button id="save">保存</button>
    <p id="status"></p>
  </main>
  <script src="./config.js"></script>
</body>
</html>
```

`desktop/src/renderer/config.css`:

```css
body {
  margin: 0;
  font: 13px/1.5 -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
  color: #222;
  background: #fff;
}

main {
  padding: 16px;
}

h1 {
  margin: 0 0 12px;
  font-size: 16px;
}

label {
  display: block;
  margin: 10px 0;
  color: #555;
}

input {
  display: block;
  width: 100%;
  box-sizing: border-box;
  margin-top: 4px;
  padding: 7px 8px;
  border: 1px solid #ccc;
  border-radius: 4px;
  font: inherit;
}

.check {
  display: flex;
  align-items: center;
  gap: 8px;
}

.check input {
  width: auto;
  margin: 0;
}

button {
  width: 100%;
  margin-top: 10px;
  padding: 8px 10px;
  border: 1px solid #ff6600;
  border-radius: 4px;
  background: #ff6600;
  color: #fff;
  cursor: pointer;
  font: inherit;
}

#status {
  min-height: 18px;
  margin: 10px 0 0;
  color: #2a8a2a;
}
```

`desktop/src/renderer/config.js`:

```js
const { ipcRenderer } = require('electron');

const ids = ['baseURL', 'model', 'apiKey', 'hotkey', 'hotkeyEnabled'];
const $ = (id) => document.getElementById(id);

async function loadConfig() {
  const config = await ipcRenderer.invoke('config:get');
  $('baseURL').value = config.baseURL || '';
  $('model').value = config.model || '';
  $('apiKey').value = config.apiKey || '';
  $('hotkey').value = config.hotkey || 'CommandOrControl+Shift+T';
  $('hotkeyEnabled').checked = config.hotkeyEnabled !== false;
}

$('save').addEventListener('click', async () => {
  const next = {
    baseURL: $('baseURL').value.trim(),
    model: $('model').value.trim(),
    apiKey: $('apiKey').value.trim(),
    hotkey: $('hotkey').value.trim() || 'CommandOrControl+Shift+T',
    hotkeyEnabled: $('hotkeyEnabled').checked
  };
  const result = await ipcRenderer.invoke('config:set', next);
  $('status').textContent = result.ok ? '已保存' : result.error;
  $('status').style.color = result.ok ? '#2a8a2a' : '#c0392b';
});

loadConfig();
```

- [ ] **Step 3: Replace translate renderer files**

`desktop/src/renderer/translate.html`:

```html
<!doctype html>
<html lang="zh-CN">
<head>
  <meta charset="utf-8">
  <title>WordHook 翻译</title>
  <link rel="stylesheet" href="./translate.css">
</head>
<body>
  <main>
    <section class="source">
      <h2>选中文本</h2>
      <pre id="sourceText"></pre>
    </section>
    <section class="result">
      <h2>结果</h2>
      <pre id="resultText"></pre>
    </section>
    <div class="actions">
      <button id="copy">复制结果</button>
      <button id="retry">重新翻译</button>
    </div>
    <p id="status"></p>
  </main>
  <script src="./translate.js"></script>
</body>
</html>
```

`desktop/src/renderer/translate.css`:

```css
body {
  margin: 0;
  font: 13px/1.5 -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
  color: #222;
  background: #fff;
}

main {
  padding: 14px;
}

h2 {
  margin: 0 0 6px;
  font-size: 12px;
  color: #777;
}

pre {
  margin: 0;
  white-space: pre-wrap;
  word-break: break-word;
  font: inherit;
}

.source,
.result {
  border: 1px solid #eee;
  border-radius: 6px;
  padding: 10px;
  margin-bottom: 10px;
}

.source {
  max-height: 120px;
  overflow: auto;
  background: #fafafa;
}

.result {
  min-height: 210px;
  max-height: 280px;
  overflow: auto;
}

.actions {
  display: flex;
  gap: 8px;
}

button {
  flex: 1;
  padding: 7px 10px;
  border: 1px solid #ccc;
  border-radius: 4px;
  background: #f6f6f6;
  cursor: pointer;
  font: inherit;
}

#status {
  min-height: 18px;
  margin: 8px 0 0;
  color: #777;
}
```

`desktop/src/renderer/translate.js`:

```js
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
```

- [ ] **Step 4: Run static startup check after window files exist**

Run:

```powershell
Set-Location desktop
npm start
```

Expected: app starts without module errors.

- [ ] **Step 5: Commit window and renderer files**

```powershell
git add desktop/src/main/windows.js desktop/src/renderer
git commit -m "feat(desktop): add config and translation windows"
```

---

## Task 6: Implement Tray, Hotkey, IPC, and Translation Flow

**Files:**

- Modify: `desktop/src/main/app.js`

- [ ] **Step 1: Replace `app.js` with the complete main process**

```js
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
const { captureSelectedText } = require('./selection');
const { streamChatCompletion } = require('./llm');
const { openConfigWindow, openTranslateWindow, sendToTranslate } = require('./windows');

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
    dialog.showErrorBox('WordHook', `读取选中文本失败：${error.message || error}`);
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
}

app.whenReady().then(async () => {
  currentConfig = await readConfig();
  tray = new Tray(createTrayImage());
  tray.setToolTip('WordHook');
  registerIpc();
  rebuildTrayMenu();
  registerConfiguredHotkey();
});

app.on('will-quit', () => {
  globalShortcut.unregisterAll();
});

app.on('window-all-closed', (event) => {
  event.preventDefault();
});
```

- [ ] **Step 2: Run the tray app**

Run:

```powershell
Set-Location desktop
npm start
```

Expected:

- No main window opens on launch.
- A WordHook tray icon appears in the Windows notification area.
- Right-clicking the icon shows `Translate Selection`, `Configuration`, hotkey toggle, and `Exit`.

- [ ] **Step 3: Verify configuration window**

Use tray menu `Configuration`.

Expected: config window opens, saving values shows `已保存`, closing the window does not quit the app.

- [ ] **Step 4: Verify hotkey registration**

Save config with `hotkeyEnabled` checked and hotkey `CommandOrControl+Shift+T`.

Expected: no registration error dialog appears. Tray menu shows `Disable Hotkey`.

- [ ] **Step 5: Commit main flow**

```powershell
git add desktop/src/main/app.js
git commit -m "feat(desktop): wire tray hotkey and translation flow"
```

---

## Task 7: Manual MVP Verification and Documentation

**Files:**

- Modify: `README.md`

- [ ] **Step 1: Add desktop MVP usage section to README**

Append this section before `## 许可`:

```markdown
## Windows 桌面托盘版（MVP）

桌面版是一个 Electron 托盘应用，不会打开完整客户端窗口。

运行方式：

```powershell
cd desktop
npm install
npm start
```

启动后在 Windows 右下角托盘中右键 WordHook：

- 配置：填写 Base URL、Model、API Key、快捷键
- Translate Selection：翻译当前选中文本
- Enable/Disable Hotkey：启用或停用全局快捷键
- Exit：退出

默认快捷键是 `Ctrl+Shift+T`。在任意应用中选中文字后按快捷键，会临时复制当前选区、读取文本、恢复原剪贴板，然后弹出翻译结果窗口。

桌面版 MVP 暂不支持自动鼠标划词、OCR、Anki 导出迁移和安装包。
```

- [ ] **Step 2: Run install check**

Run:

```powershell
Set-Location desktop
npm install
```

Expected: command exits with code 0.

- [ ] **Step 3: Run launch check**

Run:

```powershell
npm start
```

Expected: app launches into the tray only.

- [ ] **Step 4: Verify config persistence**

Save config in the configuration window, exit the app, restart with `npm start`, reopen configuration.

Expected: saved `Base URL`, `Model`, `API Key`, `Hotkey`, and `hotkeyEnabled` values are restored.

- [ ] **Step 5: Verify selected text capture**

Open Notepad, type and select:

```text
This cache mitigates latency spikes.
```

Press `Ctrl+Shift+T`.

Expected: translation result window opens and shows that exact source text.

- [ ] **Step 6: Verify empty selection behavior**

Click in Notepad without selecting text and press `Ctrl+Shift+T`.

Expected: result window shows `没有读取到选中文本` and no LLM request is made.

- [ ] **Step 7: Verify live LLM flow**

Use a valid OpenAI-compatible endpoint in configuration and repeat Step 5.

Expected: result text streams or appears in the translation window, and the copy button copies the result.

- [ ] **Step 8: Verify hotkey toggle and exit**

Use tray `Disable Hotkey`, then press `Ctrl+Shift+T` with selected text.

Expected: no translation window opens.

Use tray `Exit`.

Expected: Electron process exits and the tray icon disappears.

- [ ] **Step 9: Commit documentation and final verified state**

```powershell
git add README.md desktop
git commit -m "docs: document desktop tray mvp"
```

---

## Plan Self-Review

Spec coverage:

- Windows-only tray app: Task 6 creates tray-only launch and menu.
- Right-click configuration: Task 5 creates config window, Task 6 opens it from tray.
- Global hotkey: Task 3 verifies capture, Task 6 registers configured hotkey.
- Clipboard selection capture: Task 3 implements save-copy-read-restore for text clipboard.
- OpenAI-compatible LLM: Task 4 implements streaming Chat Completions without provider-specific fields.
- Translation result window: Task 5 creates renderer window, Task 6 streams deltas into it.
- Missing config, empty selection, API failure, hotkey failure: Task 6 covers these runtime paths.
- Manual verification: Task 7 covers all required MVP checks from the design spec.

Completeness scan:

- No unresolved placeholder markers or undefined follow-up placeholders are intentionally present.
- The plan excludes OCR, automatic mouse selection, installer packaging, Anki migration, and non-Windows support.

Type consistency:

- Config fields are consistently `baseURL`, `model`, `apiKey`, `hotkey`, and `hotkeyEnabled`.
- IPC channels are consistently `config:get`, `config:set`, `translation:start`, `translation:delta`, `translation:done`, `translation:error`, and `translation:retry`.
- Main-process helper names match their module exports.
