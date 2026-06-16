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
