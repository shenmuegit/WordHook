const { ipcRenderer } = require('electron');

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
