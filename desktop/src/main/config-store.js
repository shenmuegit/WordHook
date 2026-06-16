const fs = require('node:fs/promises');
const path = require('node:path');
const { app } = require('electron');

const DEFAULT_CONFIG = {
  baseURL: '',
  model: '',
  apiKey: '',
  hotkey: 'CommandOrControl+Shift+T',
  hotkeyEnabled: true
};

function configPath() {
  return path.join(app.getPath('userData'), 'config.json');
}

async function readConfig() {
  try {
    const raw = (await fs.readFile(configPath(), 'utf8')).replace(/^\uFEFF/, '');
    const parsed = JSON.parse(raw);
    return { ...DEFAULT_CONFIG, ...parsed };
  } catch (error) {
    if (error.code === 'ENOENT') return { ...DEFAULT_CONFIG };
    throw error;
  }
}

async function writeConfig(nextConfig) {
  const merged = { ...DEFAULT_CONFIG, ...nextConfig };
  await fs.mkdir(path.dirname(configPath()), { recursive: true });
  await fs.writeFile(configPath(), JSON.stringify(merged, null, 2), 'utf8');
  return merged;
}

function hasApiConfig(config) {
  return Boolean(config?.baseURL && config?.model && config?.apiKey);
}

module.exports = {
  DEFAULT_CONFIG,
  readConfig,
  writeConfig,
  hasApiConfig
};
