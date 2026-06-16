const { app } = require('electron');
const { readConfig } = require('./config-store');

app.whenReady().then(async () => {
  const config = await readConfig();
  console.log('WordHook config loaded:', config.hotkey);
});

app.on('window-all-closed', (event) => {
  event.preventDefault();
});
