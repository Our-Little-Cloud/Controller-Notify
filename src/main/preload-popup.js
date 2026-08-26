const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('popupApi', {
  onStreamData: (callback) => ipcRenderer.on('stream-data', (_event, data) => callback(data)),
  sendClickStream: (videoId, type) => ipcRenderer.send('click-stream', videoId, type),
  sendClosePopup: () => ipcRenderer.send('close-popup'),
});