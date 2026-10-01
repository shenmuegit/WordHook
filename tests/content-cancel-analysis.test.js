const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

test('closing the popup cancels an active analysis and ignores late messages', () => {
  const listeners = {};
  const sent = [];
  let portMessage;
  let disconnects = 0;
  let mountedHost = null;
  const node = () => ({
    style: {},
    addEventListener() {},
    classList: { toggle() {} }
  });
  const popup = { ...node(), hidden: true, getBoundingClientRect: () => ({ right: 100 }) };
  const body = { ...node(), innerHTML: '' };
  const nodes = {
    '.popup': popup,
    '.body': body,
    '.selected': node(),
    '.cached-tag': node(),
    '.toolbar-speak': node()
  };
  const modeButtons = ['word', 'sentence'].map((mode) => ({
    ...node(),
    getAttribute: () => mode
  }));
  const shadow = {
    querySelector: (selector) => nodes[selector],
    querySelectorAll: () => modeButtons
  };
  const host = {
    style: {},
    attachShadow() { this.shadowRoot = shadow; return shadow; },
    contains: () => false
  };
  const port = {
    onMessage: { addListener(handler) { portMessage = handler; } },
    onDisconnect: { addListener() {} },
    postMessage(message) { sent.push(message); },
    disconnect() { disconnects++; }
  };
  const selection = {
    isCollapsed: false,
    toString: () => 'hello',
    getRangeAt: () => ({
      getBoundingClientRect: () => ({ left: 10, bottom: 30, width: 20, height: 10 })
    })
  };
  const context = {
    chrome: { runtime: { id: 'wordhook', connect: () => port } },
    document: {
      addEventListener(type, handler) { listeners[type] = handler; },
      getElementById: () => mountedHost,
      createElement: () => host,
      documentElement: { appendChild(element) { mountedHost = element; } }
    },
    window: { scrollX: 0, scrollY: 0, innerWidth: 1000, getSelection: () => selection },
    speechSynthesis: { getVoices: () => [], addEventListener() {} },
    setTimeout: (callback) => callback()
  };
  vm.runInNewContext(fs.readFileSync(path.join(__dirname, '..', 'content.js'), 'utf8'), context);

  listeners.mouseup({ target: {} });
  assert.equal(popup.hidden, false);
  assert.equal(sent[0].type, 'start');
  assert.equal(sent[0].text, 'hello');
  const beforeClose = body.innerHTML;

  listeners.keydown({ key: 'Escape' });
  portMessage({ type: 'error', error: 'late response' });

  assert.deepEqual({
    hidden: popup.hidden,
    disconnects,
    ignoredLateMessage: body.innerHTML === beforeClose
  }, {
    hidden: true,
    disconnects: 1,
    ignoredLateMessage: true
  });
});
