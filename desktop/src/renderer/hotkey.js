const MODIFIER_ORDER = ['CommandOrControl', 'Alt', 'Shift', 'Super'];
const KEY_ALIASES = {
  ' ': 'Space',
  ArrowUp: 'Up',
  ArrowDown: 'Down',
  ArrowLeft: 'Left',
  ArrowRight: 'Right',
  Escape: 'Esc',
  Delete: 'Delete',
  Insert: 'Insert',
  Home: 'Home',
  End: 'End',
  PageUp: 'PageUp',
  PageDown: 'PageDown',
  Tab: 'Tab',
  Enter: 'Enter',
  Backspace: 'Backspace'
};
const MODIFIER_KEYS = new Set(['Control', 'Shift', 'Alt', 'Meta']);

function normalizeKey(key) {
  if (KEY_ALIASES[key]) return KEY_ALIASES[key];
  if (/^F([1-9]|1[0-9]|2[0-4])$/.test(key)) return key;
  if (key && key.length === 1) return key.toUpperCase();
  return '';
}

function acceleratorFromEvent(event) {
  const parts = [];
  if (event.ctrlKey) parts.push('CommandOrControl');
  if (event.altKey) parts.push('Alt');
  if (event.shiftKey) parts.push('Shift');
  if (event.metaKey) parts.push('Super');

  if (MODIFIER_KEYS.has(event.key)) return '';

  const key = normalizeKey(event.key);
  if (!key) return '';

  return [...MODIFIER_ORDER.filter((modifier) => parts.includes(modifier)), key].join('+');
}

if (typeof module !== 'undefined') {
  module.exports = {
    acceleratorFromEvent,
    normalizeKey
  };
}
