const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("entryDesktop", {
  getInfo: () => ipcRenderer.invoke("entry:get-info"),
  openExternal: (url) => ipcRenderer.invoke("entry:open-external", url),
  pickDirectory: () => ipcRenderer.invoke("entry:pick-directory"),
});
