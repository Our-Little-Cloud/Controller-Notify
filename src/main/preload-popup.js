const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('popupApi', {
  onStreamData: (callback) => ipcRenderer.on('stream-data', (_event, data) => callback(data)),
  sendClickStream: () => ipcRenderer.send('click-stream'),
  sendClosePopup: () => ipcRenderer.send('close-popup'),
});