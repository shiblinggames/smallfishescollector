// The desktop shell's main process (Electron). It does three things and no more:
//
// 1. Opens the game's window. The built front end (../dist) is served over a
//    private app:// scheme rather than file://, so module scripts and fetches
//    behave exactly as they do on a web origin. In development (STB_DEV_URL set)
//    it opens the Vite dev server instead.
// 2. Owns the save file. The page never touches the disk: it asks through the
//    preload's two calls (read, write), and this process reads or writes ONE
//    file, captain.json in the app's data folder. The write is atomic (a temp
//    file, flushed, then renamed over the save), the same guarantee
//    web/lib/data/local/nodeSaveStorage gives the tests.
// 3. Keeps the page locked down: no Node in the page, context isolation, the
//    sandbox, and no navigation or new windows away from the game.

const { app, BrowserWindow, ipcMain, protocol, net, shell } = require('electron')
const path = require('path')
const fs = require('fs')
const { pathToFileURL } = require('url')

const DIST = path.join(__dirname, '..', 'dist')
const DEV_URL = process.env.STB_DEV_URL
const SAVE_NAME = 'captain.json'

protocol.registerSchemesAsPrivileged([
  { scheme: 'app', privileges: { standard: true, secure: true, supportFetchAPI: true } },
])

function saveFile() { return path.join(app.getPath('userData'), SAVE_NAME) }

ipcMain.handle('save:where', () => saveFile())

ipcMain.handle('save:read', async () => {
  try { return await fs.promises.readFile(saveFile(), 'utf8') } catch (e) {
    if (e.code === 'ENOENT') return null
    throw e
  }
})

ipcMain.handle('save:write', async (_e, text) => {
  if (typeof text !== 'string') throw new Error('a save is text')
  const file = saveFile()
  await fs.promises.mkdir(path.dirname(file), { recursive: true })
  const tmp = `${file}.tmp`
  const h = await fs.promises.open(tmp, 'w')
  try { await h.writeFile(text, 'utf8'); await h.sync() } finally { await h.close() }
  await fs.promises.rename(tmp, file)
})

function createWindow() {
  const win = new BrowserWindow({
    title: 'Seas the Booty',
    width: 1100, height: 780, minWidth: 720, minHeight: 560,
    backgroundColor: '#07111c',
    icon: path.join(__dirname, '..', 'build', 'icon.png'),
    autoHideMenuBar: true,
    show: false,
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  })
  win.once('ready-to-show', () => win.show())
  // The game never leaves its own pages; outside links open in the browser.
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:/.test(url)) void shell.openExternal(url)
    return { action: 'deny' }
  })
  win.webContents.on('will-navigate', (e, url) => {
    if (!url.startsWith('app://game/') && !(DEV_URL && url.startsWith(DEV_URL))) e.preventDefault()
  })
  void win.loadURL(DEV_URL ?? 'app://game/index.html')
}

app.whenReady().then(() => {
  // app://game/<path> serves ../dist/<path>, and nothing outside it.
  protocol.handle('app', (req) => {
    const { pathname } = new URL(req.url)
    const file = path.normalize(path.join(DIST, decodeURIComponent(pathname)))
    if (!file.startsWith(DIST + path.sep)) return new Response('not found', { status: 404 })
    return net.fetch(pathToFileURL(file).toString())
  })
  createWindow()
  app.on('activate', () => { if (BrowserWindow.getAllWindows().length === 0) createWindow() })
})

app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit() })
