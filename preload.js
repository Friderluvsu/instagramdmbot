const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('api', {
    // License
    checkLicense: (key) => ipcRenderer.invoke('check-license', key),
    getLicenseKey: () => ipcRenderer.invoke('get-license-key'),

    // Bot
    startBot: (config) => ipcRenderer.invoke('start-bot', config),
    startBotProfile: (profileId, config) => ipcRenderer.invoke('start-bot-profile', { profileId, config }),
    stopBot: () => ipcRenderer.invoke('stop-bot'),
    onLog: (callback) => ipcRenderer.on('log', callback),

    // Settings
    getSavedInputs: () => ipcRenderer.invoke('get-saved-inputs'),
    saveSettings: (config) => ipcRenderer.invoke('save-settings', config),
    clearSettings: () => ipcRenderer.invoke('clear-settings'),

    // Profiles
    getProfiles: () => ipcRenderer.invoke('get-profiles'),
    createProfile: (data) => ipcRenderer.invoke('create-profile', data),
    updateProfile: (id, data) => ipcRenderer.invoke('update-profile', { id, data }),
    deleteProfile: (id) => ipcRenderer.invoke('delete-profile', id),
    resetFingerprint: (id) => ipcRenderer.invoke('reset-fingerprint', id),

    // Misc
    openExternal: (url) => ipcRenderer.invoke('open-external', url),
});
