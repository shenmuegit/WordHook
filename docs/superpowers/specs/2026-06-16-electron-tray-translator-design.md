# Electron Tray Translator Design

## Goal

Build a Windows-only Electron tray application for WordHook that translates the user's currently selected text with a global hotkey. The desktop app must not introduce a full client UI; it should live in the Windows system tray and expose only a right-click menu, a small configuration window, and a compact translation result window.

## Scope

MVP includes:

- Windows tray icon.
- Tray right-click menu.
- Global hotkey, defaulting to `Ctrl+Shift+T`.
- Manual tray command to translate the current selection.
- Local API configuration for OpenAI-compatible providers.
- Temporary clipboard-based selection capture.
- Streaming LLM translation/explanation result window.
- Basic error states for missing config, empty selection, hotkey registration failure, and API failure.

MVP excludes:

- Automatic mouse selection translation.
- OCR or screenshot translation.
- A full desktop client home screen.
- Account, sync, cloud storage, or server relay.
- Anki export migration from the browser extension.
- macOS or Linux support.
- Installer packaging.

## Product Behavior

The app starts into the Windows notification area. It should not open a main window at launch.

The tray menu contains:

- `Translate Selection`: captures the currently selected text and starts translation.
- `Configuration`: opens the configuration window.
- `Enable Hotkey` / `Disable Hotkey`: toggles registration for the configured global hotkey.
- `Exit`: unregisters hotkeys and quits the app.

The default global hotkey is `Ctrl+Shift+T`. When the user selects text in any application and presses the hotkey, the app captures the selected text, calls the configured LLM provider, and opens a compact translation result window.

If API configuration is missing, translation should open the configuration window instead of attempting a request.

If no text can be captured, the app should show a short non-blocking error in the result window or a small dialog: `没有读取到选中文本`.

## Configuration

The configuration window contains:

- `Base URL`
- `Model`
- `API Key`
- `Hotkey`

Configuration is stored locally in the Electron user data directory. API keys are never committed, bundled, or sent anywhere except the user-configured LLM endpoint.

The initial implementation may store config as JSON using Electron's user data path. Encryption is not required for MVP, but the file must stay outside the repository and application source tree.

## Selection Capture

The app captures selected text through the clipboard:

1. Save the current text clipboard contents.
2. Simulate `Ctrl+C`.
3. Wait briefly for the active application to populate the clipboard.
4. Read text from the clipboard.
5. Restore the saved text clipboard contents.
6. Trim the captured value and reject empty text.

The MVP only needs to preserve text clipboard content. Rich clipboard formats, files, and images are out of scope.

This approach is intentionally hotkey-driven. The app should not listen for every mouse drag or attempt automatic selection detection.

## LLM Behavior

The desktop app should use the same OpenAI-compatible Chat Completions approach as the browser extension:

- POST to `${baseURL}/chat/completions`
- Use the configured `model`
- Send the user's selected text in a prompt oriented toward Chinese explanations
- Stream result tokens when supported

For MVP, the desktop app can keep its own `desktop/src/main/llm.js` implementation instead of refactoring the existing extension files first. Shared prompt extraction is explicitly outside this MVP and can be evaluated after the desktop path works.

Provider-specific fields such as DeepSeek thinking controls should be avoided in the initial desktop request body unless made configurable. This keeps the desktop client compatible with more OpenAI-style endpoints.

## Windows

The MVP has two windows.

### Configuration Window

A small standard Electron window opened from the tray menu. It allows editing and saving local config. It should show save status and hotkey registration errors.

### Translation Result Window

A compact result window opened after capture starts. It can initially appear near the bottom-right of the screen. Exact mouse-adjacent placement is not required for MVP.

The result window shows:

- Captured source text.
- Streaming translation/explanation text.
- API or capture errors.
- A copy button for the result.
- A retry button using the same captured text.

## Proposed File Structure

Add a new `desktop` directory:

```text
desktop/
  package.json
  src/
    main/
      app.js
      config-store.js
      llm.js
      selection.js
      windows.js
    renderer/
      config.html
      config.js
      config.css
      translate.html
      translate.js
      translate.css
```

Responsibilities:

- `app.js`: Electron lifecycle, tray, menu, hotkey registration, IPC wiring.
- `config-store.js`: read/write local configuration from Electron user data.
- `selection.js`: clipboard preservation, simulated copy, text capture.
- `llm.js`: OpenAI-compatible request construction and stream parsing.
- `windows.js`: create, show, focus, and message the config/result windows.
- `renderer/config.*`: configuration form UI.
- `renderer/translate.*`: translation result UI.

## Error Handling

Missing configuration:

- Open configuration window.
- Do not attempt translation.

Hotkey registration failure:

- Show failure in configuration window or tray-triggered dialog.
- Keep manual tray translation available.

Empty selection:

- Show `没有读取到选中文本`.
- Do not call the LLM.

API failure:

- Show the HTTP status and a short provider message when available.
- Keep retry available.

Streaming parse failure:

- Show the partial text when useful.
- Show a clear error if the response cannot be parsed as a compatible stream.

## Testing Strategy

Manual MVP verification is acceptable because this adds OS-level behavior that is hard to unit test meaningfully at first.

Required checks before marking MVP done:

- `npm install` completes inside `desktop`.
- `npm start` launches with only a tray icon and no main window.
- Tray `Configuration` opens the config window.
- Saving config persists across restart.
- Default `Ctrl+Shift+T` registers successfully on Windows.
- Selecting text in Notepad and pressing the hotkey captures the text.
- Empty selection shows `没有读取到选中文本`.
- A configured OpenAI-compatible endpoint streams or returns a visible result.
- `Disable Hotkey` unregisters the shortcut.
- `Exit` quits the process.

Automated tests for `config-store.js`, `llm.js` request construction, and stream parsing are explicitly outside this MVP. They should be evaluated once the desktop structure is in place.

## Open Decisions Resolved

- Platform: Windows only.
- Desktop shell: Electron.
- Product shape: tray app, no main client window.
- Configuration entry: tray right-click menu.
- Selection trigger: global hotkey and tray command, not automatic mouse selection.
