const { clipboard } = require('electron');
const { spawn } = require('node:child_process');

let helper = null;
let helperReady = null;
let pendingCommand = null;
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
  [DllImport("user32.dll")]
  public static extern IntPtr GetForegroundWindow();
  [DllImport("user32.dll")]
  public static extern bool SetForegroundWindow(IntPtr hWnd);
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
  if ($line -eq "GET_FOREGROUND") {
    [Console]::Out.WriteLine("HWND " + [Keyboard]::GetForegroundWindow().ToInt64())
    [Console]::Out.Flush()
    continue
  }
  if ($line.StartsWith("COPY")) {
    $parts = $line.Split(" ")
    if ($parts.Length -gt 1) {
      $hwndValue = 0L
      if ([Int64]::TryParse($parts[1], [ref]$hwndValue) -and $hwndValue -ne 0) {
        [Keyboard]::SetForegroundWindow([IntPtr]::new($hwndValue)) | Out-Null
        Start-Sleep -Milliseconds 30
      }
    }
  } else {
    continue
  }
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

function resetHelper(error = new Error('Selection helper stopped')) {
  const pending = pendingCommand;
  helper = null;
  helperReady = null;
  pendingCommand = null;
  stdoutBuffer = '';
  pending?.reject(error);
}

function handleHelperLine(line) {
  if (line === 'READY') return;
  if (!pendingCommand) return;
  if (pendingCommand.type === 'copy' && line === 'OK') {
    const { resolve } = pendingCommand;
    pendingCommand = null;
    resolve();
    return;
  }
  if (pendingCommand.type === 'foreground' && line.startsWith('HWND ')) {
    const { resolve } = pendingCommand;
    pendingCommand = null;
    resolve(line.slice(5).trim());
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
    const child = spawn(
      'powershell.exe',
      ['-NoProfile', '-STA', '-NoLogo', '-Command', helperScript()],
      { windowsHide: true, stdio: ['pipe', 'pipe', 'pipe'] }
    );
    helper = child;
    let ready = false;

    const onReady = (chunk) => {
      if (helper !== child) return;
      stdoutBuffer += chunk.toString('utf8');
      if (!stdoutBuffer.includes('READY')) return;
      ready = true;
      child.stdout.off?.('data', onReady);
      child.stdout.on('data', handleStdout);
      stdoutBuffer = '';
      resolve();
    };

    child.stdout.on('data', onReady);
    child.stderr.on('data', () => {});
    child.on('error', (error) => {
      if (helper === child) resetHelper(error);
      if (!ready) reject(error);
    });
    child.on('exit', (code) => {
      const error = new Error(`Selection helper exited (code ${code})`);
      if (helper === child) resetHelper(error);
      if (!ready) reject(error);
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
    if (pendingCommand) {
      reject(new Error('Copy helper is busy'));
      return;
    }
    pendingCommand = { type: 'copy', resolve, reject };
    helper.stdin.write('COPY\n', (error) => {
      if (error) {
        pendingCommand = null;
        reject(error);
      }
    });
  });
}

async function getForegroundWindowHandle() {
  await ensureHelper();

  return await new Promise((resolve, reject) => {
    if (pendingCommand) {
      reject(new Error('Copy helper is busy'));
      return;
    }
    pendingCommand = { type: 'foreground', resolve, reject };
    helper.stdin.write('GET_FOREGROUND\n', (error) => {
      if (error) {
        pendingCommand = null;
        reject(error);
      }
    });
  });
}

async function sendCtrlCToWindow(windowHandle) {
  await ensureHelper();

  if (!helper || helper.killed || helper.stdin.writable === false) {
    resetHelper();
    await ensureHelper();
  }

  await new Promise((resolve, reject) => {
    if (pendingCommand) {
      reject(new Error('Copy helper is busy'));
      return;
    }
    pendingCommand = { type: 'copy', resolve, reject };
    helper.stdin.write(`COPY ${windowHandle || 0}\n`, (error) => {
      if (error) {
        pendingCommand = null;
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
  const foregroundWindow = await getForegroundWindowHandle();

  try {
    // globalShortcut fires while the trigger keys may still be held.
    // Give Ctrl/Shift/T a moment to release before sending Ctrl+C.
    await delay(120);
    clipboard.writeText(sentinel);
    await sendCtrlCToWindow(foregroundWindow);
    return await readClipboardAfterCopy(sentinel);
  } finally {
    clipboard.writeText(previousText);
  }
}

module.exports = {
  captureSelectedText,
  warmSelectionCapture,
  stopSelectionCapture,
  getForegroundWindowHandle
};
