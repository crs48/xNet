import { contextBridge, ipcRenderer } from "electron";
contextBridge.exposeInMainWorld("xnet", {
  init: () => ipcRenderer.invoke("xnet:init"),
  createDocument: (options) => ipcRenderer.invoke("xnet:createDocument", options),
  getDocument: (id) => ipcRenderer.invoke("xnet:getDocument", id),
  listDocuments: (workspace) => ipcRenderer.invoke("xnet:listDocuments", workspace),
  deleteDocument: (id) => ipcRenderer.invoke("xnet:deleteDocument", id),
  query: (query) => ipcRenderer.invoke("xnet:query", query),
  search: (text, limit) => ipcRenderer.invoke("xnet:search", text, limit),
  getSyncStatus: () => ipcRenderer.invoke("xnet:getSyncStatus"),
  stop: () => ipcRenderer.invoke("xnet:stop"),
  // Menu events
  onNewPage: (callback) => {
    ipcRenderer.on("menu:new-page", callback);
    return () => ipcRenderer.removeListener("menu:new-page", callback);
  }
});
