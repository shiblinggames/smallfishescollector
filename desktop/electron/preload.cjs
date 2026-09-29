// The only doorway from the game's page to the machine: the save file, and
// nothing else. The page sees window.stbSave; the main process decides which
// file that is.

const { contextBridge, ipcRenderer } = require('electron')

contextBridge.exposeInMainWorld('stbSave', {
  where: () => ipcRenderer.invoke('save:where'),
  read: () => ipcRenderer.invoke('save:read'),
  write: (text) => ipcRenderer.invoke('save:write', text),
})
