const { clipboard } = require('electron');
const { spawn } = require('node:child_process');

let helper = null;
let helperReady = null;
let pendingCopy = null;
let stdoutBuffer = '';

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function copySentinel() {
  return `__WORDHOOK_COPY_SENTINEL__${Date.now()}_${Math.random().toString(36).slice(2)}__`;
}

function helperScript() {
  return `
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
[Console]::Out.WriteLine("READY")
[Console]::Out.Flush()
while ($true) {
  $line = [Console]::In.ReadLine()
  if ($null -eq $line) { break }
  if ($line -eq "EXIT") { break }
  if ($line -ne "COPY") { continue }
  [Keyboard]::keybd_event($VK_CONTROL, 0, 0, [UIntPtr]::Zero)
  [Keyboard]::keybd_event($VK_C, 0, 0, [UIntPtr]::Zero)
  Start-Sleep -Milliseconds 35
  [Keyboard]::keybd_event($VK_C, 0, $KEYEVENTF_KEYUP, [UIntPtr]::Zero)
  [Keyboard]::keybd_event($VK_CONTROL, 0, $KEYEVENTF_KEYUP, [UIntPtr]::Zero)
  [Console]::Out.WriteLine("OK")
  [Console]::Out.Flush()
}
`;
}

function resetHelper() {
  helper = null;
  helperReady = null;
  pendingCopy = null;
  stdoutBuffer = '';
}

function handleHelperLine(line) {
  if (line === 'READY') return;
  if (line === 'OK' && pendingCopy) {
    const resolve = pendingCopy;
    pendingCopy = null;
    resolve();
  }
}

function handleStdout(chunk) {
  stdoutBuffer += chunk.toString('utf8');
  let index;
  while ((index = stdoutBuffer.indexOf('\n')) >= 0) {
    const line = stdoutBuffer.slice(0, index).trim();
    stdoutBuffer = stdoutBuffer.slice(index + 1);
    handleHelperLine(line);
  }
}

function ensureHelper() {
  if (helperReady) return helperReady;

  helperReady = new Promise((resolve, reject) => {
    helper = spawn(
      'powershell.exe',
      ['-NoProfile', '-STA', '-NoLogo', '-Command', helperScript()],
      { windowsHide: true, stdio: ['pipe', 'pipe', 'pipe'] }
    );

    const onReady = (chunk) => {
      stdoutBuffer += chunk.toString('utf8');
      if (!stdoutBuffer.includes('READY')) return;
      helper.stdout.off?.('data', onReady);
      helper.stdout.on('data', handleStdout);
      stdoutBuffer = '';
      resolve();
    };

    helper.stdout.on('data', onReady);
    helper.stderr.on('data', () => {});
    helper.on('error', (error) => {
      resetHelper();
      reject(error);
    });
    helper.on('exit', () => {
      resetHelper();
    });
  });

  return helperReady;
}

async function sendCtrlC() {
  await ensureHelper();

  if (!helper || helper.killed || helper.stdin.writable === false) {
    resetHelper();
    await ensureHelper();
  }

  await new Promise((resolve, reject) => {
    if (pendingCopy) {
      reject(new Error('Copy helper is busy'));
      return;
    }
    pendingCopy = resolve;
    helper.stdin.write('COPY\n', (error) => {
      if (error) {
        pendingCopy = null;
        reject(error);
      }
    });
  });
}

async function readClipboardAfterCopy(sentinel) {
  const deadline = Date.now() + 320;
  while (Date.now() < deadline) {
    const value = clipboard.readText();
    if (value && value !== sentinel) return value.trim();
    await delay(20);
  }
  const value = clipboard.readText();
  return value && value !== sentinel ? value.trim() : '';
}

async function warmSelectionCapture() {
  await ensureHelper();
}

async function stopSelectionCapture() {
  if (!helper) return;
  try { helper.stdin.write('EXIT\n'); } catch {}
  try { helper.kill(); } catch {}
  resetHelper();
}

async function captureSelectedText() {
  const previousText = clipboard.readText();
  const sentinel = copySentinel();

  try {
    // globalShortcut fires while the trigger keys may still be held.
    // Give Ctrl/Shift/T a moment to release before sending Ctrl+C.
    await delay(120);
    clipboard.writeText(sentinel);
    await sendCtrlC();
    return await readClipboardAfterCopy(sentinel);
  } finally {
    clipboard.writeText(previousText);
  }
}

module.exports = {
  captureSelectedText,
  warmSelectionCapture,
  stopSelectionCapture
};
