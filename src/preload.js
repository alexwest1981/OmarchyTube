// Det sidan får göra: söka, bläddra i ditt, logga in, spela. Inget mer.
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('omarchyBridge', {
    search: (query) => ipcRenderer.invoke('search', query),
    feed: (kind) => ipcRenderer.invoke('feed', kind),
    channelVideos: (channelId) => ipcRenderer.invoke('channelVideos', channelId),
    account: () => ipcRenderer.invoke('account'),
    saveClient: (id, secret) => ipcRenderer.invoke('saveClient', id, secret),
    startLogin: () => ipcRenderer.invoke('startLogin'),
    loginStatus: () => ipcRenderer.invoke('loginStatus'),
    loggedOut: () => ipcRenderer.invoke('loggedOut'),
    play: (videoId) => ipcRenderer.invoke('play', videoId),
});
