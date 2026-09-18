const { ipcRenderer, contextBridge } = require('electron');

// The renderer's whole surface to the main process: a way to leave a video
// without reaching for the mouse. CSS and the page injector are deliberately
// not injected here — main.js owns that, because it is the place that knows
// whether the current URL is YouTube at all (this file runs for every
// document, which includes the Google sign-in window).
try {
    contextBridge.exposeInMainWorld('omarchyBridge', {
        exitVideo: () => ipcRenderer.send('omarchy-exit-video'),
        // Our own grid (browse.html) reaches YouTube's data through these two,
        // and hands a chosen video back to the main process to play.
        browseHome: () => ipcRenderer.invoke('omarchy-browse-home'),
        browseSearch: (query) => ipcRenderer.invoke('omarchy-browse-search', query),
        play: (videoId) => ipcRenderer.send('omarchy-play', videoId),
        // Profilväljaren (profiles.html) når listan genom dessa fyra. Den ritar
        // bara; reglerna bor i main-processen.
        profiles: {
            list: () => ipcRenderer.invoke('omarchy-profiles:list'),
            add: (name) => ipcRenderer.invoke('omarchy-profiles:add', name),
            remove: (id) => ipcRenderer.invoke('omarchy-profiles:remove', id),
            pick: (id) => ipcRenderer.invoke('omarchy-profiles:pick', id)
        }
    });
} catch (err) {
    console.error('[OmarchyTube] Preload bridge error:', err);
}
