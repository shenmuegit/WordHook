const { ipcRenderer } = require('electron');
const { acceleratorFromEvent } = require('./hotkey');

const $ = (id) => document.getElementById(id);
const DEFAULT_WINDOW_BACKGROUND = 'rgba(255, 255, 255, 0.72)';

function hexToRgba(hex, alpha = 0.72) {
  const value = String(hex || '').trim();
  const match = value.match(/^#([0-9a-f]{6})$/i);
  if (!match) return DEFAULT_WINDOW_BACKGROUND;
  const intValue = parseInt(match[1], 16);
  const r = (intValue >> 16) & 255;
  const g = (intValue >> 8) & 255;
  const b = intValue & 255;
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

function rgbaToHex(value) {
  const text = String(value || '').trim();
  const hexMatch = text.match(/^#([0-9a-f]{6})$/i);
  if (hexMatch) return text.toLowerCase();

  const match = text.match(/rgba?\(\s*(\d+),\s*(\d+),\s*(\d+)/i);
  if (!match) return '#ffffff';
  return '#' + [match[1], match[2], match[3]].map((part) => {
    return Math.max(0, Math.min(255, Number(part))).toString(16).padStart(2, '0');
  }).join('');
}

async function loadConfig() {
  const config = await ipcRenderer.invoke('config:get');
  $('baseURL').value = config.baseURL || '';
  $('model').value = config.model || '';
  $('apiKey').value = config.apiKey || '';
  $('hotkey').value = config.hotkey || 'CommandOrControl+Shift+T';
  $('hotkeyEnabled').checked = config.hotkeyEnabled !== false;
  $('hideHotkey').value = config.hideHotkey || 'CommandOrControl+Shift+H';
  $('hideHotkeyEnabled').checked = config.hideHotkeyEnabled !== false;
  $('windowBackground').value = config.windowBackground || DEFAULT_WINDOW_BACKGROUND;
  $('windowBackgroundColor').value = rgbaToHex($('windowBackground').value);
}

$('save').addEventListener('click', async () => {
  const next = {
    baseURL: $('baseURL').value.trim(),
    model: $('model').value.trim(),
    apiKey: $('apiKey').value.trim(),
    hotkey: $('hotkey').value.trim() || 'CommandOrControl+Shift+T',
    hotkeyEnabled: $('hotkeyEnabled').checked,
    hideHotkey: $('hideHotkey').value.trim() || 'CommandOrControl+Shift+H',
    hideHotkeyEnabled: $('hideHotkeyEnabled').checked,
    windowBackground: $('windowBackground').value.trim() || DEFAULT_WINDOW_BACKGROUND
  };
  const result = await ipcRenderer.invoke('config:set', next);
  $('status').textContent = result.ok ? '已保存' : result.error;
  $('status').style.color = result.ok ? '#2a8a2a' : '#c0392b';
});

function bindHotkeyInput(id, label) {
  $(id).addEventListener('keydown', (event) => {
    event.preventDefault();
    event.stopPropagation();

    const accelerator = acceleratorFromEvent(event);
    if (!accelerator) {
      $('status').textContent = '请再按一个非修饰键';
      $('status').style.color = '#777';
      return;
    }

    $(id).value = accelerator;
    $('status').textContent = `${label}：${accelerator}`;
    $('status').style.color = '#2a8a2a';
  });

  $(id).addEventListener('focus', () => {
    $('status').textContent = `按下新的${label}`;
    $('status').style.color = '#777';
  });
}

bindHotkeyInput('hotkey', '翻译快捷键');
bindHotkeyInput('hideHotkey', '隐藏快捷键');

$('windowBackgroundColor').addEventListener('input', () => {
  $('windowBackground').value = hexToRgba($('windowBackgroundColor').value);
});

$('windowBackground').addEventListener('input', () => {
  $('windowBackgroundColor').value = rgbaToHex($('windowBackground').value);
});

loadConfig();
