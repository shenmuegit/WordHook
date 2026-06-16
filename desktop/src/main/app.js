const { app } = require('electron');
const { readConfig, hasApiConfig } = require('./config-store');

app.whenReady().then(async () => {
  const config = await readConfig();
  console.log('Has API config:', hasApiConfig(config));
});

app.on('window-all-closed', (event) => {
  event.preventDefault();
});
