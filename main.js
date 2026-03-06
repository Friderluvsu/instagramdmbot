import { app, BrowserWindow, ipcMain, shell } from 'electron';
import { checkLicense } from './license.js';
import { runBot } from './core/bot.js';
import Store from 'electron-store';
import path from 'path';
import fs from 'fs/promises';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const store = new Store();

// Plan limits
const PLAN_LIMITS = {
  'Basic': 3, 'Basic Yearly': 3,
  'Premium': 5, 'Premium Yearly': 5,
  'VIP': 999, 'VIP Yearly': 999,
};

function getPlanLimit() {
  const plan = store.get('licensePlan') || 'Basic';
  // Strip emoji prefix if any (e.g. "💎 Basic" → "Basic")
  const cleanPlan = plan.replace(/^[^\w]+/, '').trim();
  return PLAN_LIMITS[cleanPlan] ?? 3;
}

let botAbortController = null;
let currentWindow = null;

app.whenReady().then(() => {
  currentWindow = new BrowserWindow({
    width: 1100, height: 700,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true
    }
  });
  currentWindow.loadFile('renderer/index.html');
});

// ─── LICENSE ──────────────────────────────────────────────
ipcMain.handle('check-license', async (_, key) => {
  const result = await checkLicense(key);
  if (result.valid) {
    store.set('licenseKey', key);
    // Store plan name if returned
    if (result.plan) store.set('licensePlan', result.plan);
  }
  return result;
});

ipcMain.handle('get-license-key', () => store.get('licenseKey') || '');

// ─── SETTINGS ─────────────────────────────────────────────
ipcMain.handle('save-settings', async (_, config) => {
  if (config.targets !== undefined) store.set('savedTargets', config.targets);
  if (config.messages !== undefined) store.set('savedMessages', config.messages);
  if (config.igUsername !== undefined) store.set('savedIgUsername', config.igUsername);
  if (config.igPassword !== undefined) store.set('savedIgPassword', config.igPassword);
  if (config.saveHistory !== undefined) store.set('savedSaveHistory', config.saveHistory);
  if (config.lang !== undefined) store.set('savedLang', config.lang);
  return { ok: true };
});

ipcMain.handle('clear-settings', async () => {
  store.clear();
  return { ok: true };
});

ipcMain.handle('get-saved-inputs', () => ({
  targets: store.get('savedTargets') || '',
  messages: store.get('savedMessages') || '',
  igUsername: store.get('savedIgUsername') || '',
  igPassword: store.get('savedIgPassword') || '',
  saveHistory: typeof store.get('savedSaveHistory') === 'boolean' ? store.get('savedSaveHistory') : true,
  lang: store.get('savedLang') || 'en'
}));

// ─── PROFILES ─────────────────────────────────────────────
ipcMain.handle('get-profiles', () => {
  const limit = getPlanLimit();
  const plan = store.get('licensePlan') || 'Basic';
  return { profiles: store.get('profiles') || [], limit, plan };
});

ipcMain.handle('create-profile', async (_, profileData) => {
  const profiles = store.get('profiles') || [];
  const limit = getPlanLimit();
  if (profiles.length >= limit) {
    return { error: 'limit_reached', limit };
  }
  const newProfile = {
    id: Date.now().toString(),
    name: profileData.name || `Account #${profiles.length + 1}`,
    proxy: profileData.proxy || '',      // ip:port:user:pass
    rotateUrl: profileData.rotateUrl || '', // rotation endpoint URL
    fingerprint: null,                  // generated on first bot run
    createdAt: new Date().toISOString()
  };
  profiles.push(newProfile);
  store.set('profiles', profiles);
  return { ok: true, profile: newProfile };
});

ipcMain.handle('update-profile', async (_, { id, data }) => {
  const profiles = store.get('profiles') || [];
  const idx = profiles.findIndex(p => p.id === id);
  if (idx === -1) return { error: 'not_found' };
  profiles[idx] = { ...profiles[idx], ...data };
  store.set('profiles', profiles);
  return { ok: true, profile: profiles[idx] };
});

ipcMain.handle('delete-profile', async (_, id) => {
  let profiles = store.get('profiles') || [];
  profiles = profiles.filter(p => p.id !== id);
  store.set('profiles', profiles);
  // Delete profile userDataDir
  const dirPath = path.join(app.getPath('userData'), 'profiles', id);
  await fs.rm(dirPath, { recursive: true, force: true });
  return { ok: true };
});

ipcMain.handle('reset-fingerprint', async (_, id) => {
  const profiles = store.get('profiles') || [];
  const idx = profiles.findIndex(p => p.id === id);
  if (idx === -1) return { error: 'not_found' };
  profiles[idx].fingerprint = null;
  store.set('profiles', profiles);
  return { ok: true };
});

// ─── BOT ──────────────────────────────────────────────────
ipcMain.handle('start-bot', async (event, config) => {
  const key = store.get('licenseKey');
  if (!key) return { error: 'no_license' };
  try {
    const lic = await checkLicense(key);
    if (!lic.valid) return { error: lic.error || 'license_invalid' };
  } catch (err) {
    return { error: 'Verification failed' };
  }

  botAbortController = new AbortController();
  const logFn = (message, type = '') => {
    if (currentWindow && !currentWindow.isDestroyed()) {
      currentWindow.webContents.send('log', { message, type });
    }
    console.log(`[BOT] ${message}`);
  };

  try {
    const botResult = await runBot({
      ...config,
      isElectronEnv: true,
      logCallback: logFn,
      abortSignal: botAbortController.signal
    });
    botAbortController = null;
    return { ok: true, message: botResult || 'Finished execution' };
  } catch (botErr) {
    botAbortController = null;
    if (botErr.name === 'AbortError') return { error: 'Bot was stopped manually.' };
    return { error: botErr.message };
  }
});

// Start bot for a specific profile
ipcMain.handle('start-bot-profile', async (event, { profileId, config }) => {
  const key = store.get('licenseKey');
  if (!key) return { error: 'no_license' };
  try {
    const lic = await checkLicense(key);
    if (!lic.valid) return { error: lic.error || 'license_invalid' };
  } catch {
    return { error: 'Verification failed' };
  }

  const profiles = store.get('profiles') || [];
  const profile = profiles.find(p => p.id === profileId);
  if (!profile) return { error: 'profile_not_found' };

  botAbortController = new AbortController();
  const logFn = (message, type = '') => {
    if (currentWindow && !currentWindow.isDestroyed()) {
      currentWindow.webContents.send('log', { message, type });
    }
    console.log(`[BOT:${profile.name}] ${message}`);
  };

  try {
    const botResult = await runBot({
      ...config,
      profileId: profile.id,
      proxyRaw: profile.proxy,
      rotateUrl: profile.rotateUrl,
      storedFingerprint: profile.fingerprint,
      isElectronEnv: true,
      logCallback: logFn,
      abortSignal: botAbortController.signal,
      // Callback to save generated fingerprint back to profile
      onFingerprintGenerated: (fp) => {
        const all = store.get('profiles') || [];
        const i = all.findIndex(p => p.id === profileId);
        if (i !== -1) { all[i].fingerprint = fp; store.set('profiles', all); }
      }
    });
    botAbortController = null;
    return { ok: true, message: botResult || 'Finished' };
  } catch (botErr) {
    botAbortController = null;
    if (botErr.name === 'AbortError') return { error: 'Bot was stopped manually.' };
    return { error: botErr.message };
  }
});

ipcMain.handle('stop-bot', async () => {
  if (botAbortController) {
    botAbortController.abort('Stopped by user');
    botAbortController = null;
  }
  return { ok: true };
});

ipcMain.handle('open-external', async (_, url) => {
  if (url.startsWith('https://')) shell.openExternal(url);
});
