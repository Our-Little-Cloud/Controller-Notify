const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('popupApi', {
  onStreamData: (callback) => ipcRenderer.on('stream-data', (_event, data) => callback(data)),
  sendClickStream: (videoId) => ipcRenderer.send('click-stream', videoId),
  sendClosePopup: () => ipcRenderer.send('close-popup'),
});