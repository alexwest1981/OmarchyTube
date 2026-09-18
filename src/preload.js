const { ipcRenderer, contextBridge } = require('electron');

// The renderer's whole surface to the main process: a way to leave a video
// without reaching for the mouse. CSS and the page injector are deliberately
// not injected here — main.js owns that, because it is the place that knows
// whether the current URL is YouTube at all (this file runs for every
// document, which includes the Google sign-in window).
try {
    contextBridge.exposeInMainWorld('omarchyBridge', {
        exitVideo: () => ipcRenderer.send('omarchy-exit-video')
    });
} catch (err) {
    console.error('[OmarchyTube] Preload bridge error:', err);
}
