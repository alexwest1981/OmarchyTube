// Det enda sidan får göra: söka, spela. Inget mer.
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('omarchyBridge', {
    search: (query) => ipcRenderer.invoke('search', query),
    play: (videoId) => ipcRenderer.invoke('play', videoId),
});
