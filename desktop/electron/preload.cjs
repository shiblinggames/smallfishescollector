// The only doorways from the game's page to the machine: the captains' save
// files, and Steam. The page sees window.stbSave (the main process decides which file that
// is) and window.stbSteam (achievements and rich presence, see steam.cjs).

const { contextBridge, ipcRenderer } = require('electron')

contextBridge.exposeInMainWorld('stbSave', {
  /** Every captain, for the select screen. */
  list: () => ipcRenderer.invoke('captains:list'),
  /** Move a captain's file to retired/ (never deleted). */
  retire: (id) => ipcRenderer.invoke('captains:retire', id),
  where: (id) => ipcRenderer.invoke('save:where', id),
  read: (id) => ipcRenderer.invoke('save:read', id),
  write: (id, text) => ipcRenderer.invoke('save:write', id, text),
})

contextBridge.exposeInMainWorld('stbSteam', {
  status: () => ipcRenderer.invoke('steam:status'),
  unlock: (ids) => ipcRenderer.invoke('steam:unlock', ids),
  presence: (fields) => ipcRenderer.invoke('steam:presence', fields),
})
