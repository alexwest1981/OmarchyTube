const { ipcRenderer, contextBridge } = require('electron');

// Rendererns hela yta mot huvudprocessen: profilerna. Ingenting annat skickas
// mellan sidan och appen, och ingen sida injiceras i — det var den delen som
// inte gick att få bra (se main.js).
try {
    contextBridge.exposeInMainWorld('omarchyBridge', {
        profiles: {
            list: () => ipcRenderer.invoke('omarchy-profiles:list'),
            add: (name) => ipcRenderer.invoke('omarchy-profiles:add', name),
            remove: (id) => ipcRenderer.invoke('omarchy-profiles:remove', id),
            pick: (id) => ipcRenderer.invoke('omarchy-profiles:pick', id),
            mode: (next) => ipcRenderer.invoke('omarchy-profiles:mode', next),
            current: () => ipcRenderer.invoke('omarchy-profiles:current')
        }
    });
} catch (err) {
    console.error('[OmarchyTube] Preload bridge error:', err);
}
