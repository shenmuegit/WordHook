const { app } = require('electron');

app.whenReady().then(() => {
  console.log('WordHook desktop scaffold ready');
});

app.on('window-all-closed', (event) => {
  event.preventDefault();
});
