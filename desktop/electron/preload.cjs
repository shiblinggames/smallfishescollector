// The only doorways from the game's page to the machine: the save file, and
// Steam. The page sees window.stbSave (the main process decides which file that
// is) and window.stbSteam (achievements and rich presence, see steam.cjs).

const { contextBridge, ipcRenderer } = require('electron')

contextBridge.exposeInMainWorld('stbSave', {
  where: () => ipcRenderer.invoke('save:where'),
  read: () => ipcRenderer.invoke('save:read'),
  write: (text) => ipcRenderer.invoke('save:write', text),
})

contextBridge.exposeInMainWorld('stbSteam', {
  status: () => ipcRenderer.invoke('steam:status'),
  unlock: (ids) => ipcRenderer.invoke('steam:unlock', ids),
  presence: (fields) => ipcRenderer.invoke('steam:presence', fields),
})
