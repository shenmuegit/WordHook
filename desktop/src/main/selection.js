const { clipboard } = require('electron');
const { execFile } = require('node:child_process');

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function sendCtrlC() {
  return new Promise((resolve, reject) => {
    const script = `
Add-Type @"
using System;
using System.Runtime.InteropServices;
public static class Keyboard {
  [DllImport("user32.dll")]
  public static extern void keybd_event(byte bVk, byte bScan, uint dwFlags, UIntPtr dwExtraInfo);
}
"@
$KEYEVENTF_KEYUP = 0x0002
$VK_CONTROL = 0x11
$VK_C = 0x43
[Keyboard]::keybd_event($VK_CONTROL, 0, 0, [UIntPtr]::Zero)
[Keyboard]::keybd_event($VK_C, 0, 0, [UIntPtr]::Zero)
Start-Sleep -Milliseconds 40
[Keyboard]::keybd_event($VK_C, 0, $KEYEVENTF_KEYUP, [UIntPtr]::Zero)
[Keyboard]::keybd_event($VK_CONTROL, 0, $KEYEVENTF_KEYUP, [UIntPtr]::Zero)
`;

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
    // globalShortcut fires while the trigger keys may still be held.
    // Give Ctrl/Shift/T a moment to release before sending Ctrl+C.
    await delay(120);
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
