// Det sidan får göra: söka, bläddra i ditt, logga in, spela. Inget mer.
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('omarchyBridge', {
    search: (query) => ipcRenderer.invoke('search', query),
    feed: (kind) => ipcRenderer.invoke('feed', kind),
    account: () => ipcRenderer.invoke('account'),
    openLogin: () => ipcRenderer.invoke('openLogin'),
    play: (videoId) => ipcRenderer.invoke('play', videoId),
});
