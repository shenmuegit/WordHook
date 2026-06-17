const { ipcRenderer } = require('electron');
const { acceleratorFromEvent } = require('./hotkey');

const $ = (id) => document.getElementById(id);

async function loadConfig() {
  const config = await ipcRenderer.invoke('config:get');
  $('baseURL').value = config.baseURL || '';
  $('model').value = config.model || '';
  $('apiKey').value = config.apiKey || '';
  $('hotkey').value = config.hotkey || 'CommandOrControl+Shift+T';
  $('hotkeyEnabled').checked = config.hotkeyEnabled !== false;
  $('hideHotkey').value = config.hideHotkey || 'CommandOrControl+Shift+H';
  $('hideHotkeyEnabled').checked = config.hideHotkeyEnabled !== false;
}

$('save').addEventListener('click', async () => {
  const next = {
    baseURL: $('baseURL').value.trim(),
    model: $('model').value.trim(),
    apiKey: $('apiKey').value.trim(),
    hotkey: $('hotkey').value.trim() || 'CommandOrControl+Shift+T',
    hotkeyEnabled: $('hotkeyEnabled').checked,
    hideHotkey: $('hideHotkey').value.trim() || 'CommandOrControl+Shift+H',
    hideHotkeyEnabled: $('hideHotkeyEnabled').checked
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

loadConfig();
