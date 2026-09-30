// The desktop shell's main process (Electron). It does three things and no more:
//
// 1. Opens the game's window. The built front end (../dist) is served over a
//    private app:// scheme rather than file://, so module scripts and fetches
//    behave exactly as they do on a web origin. In development (STB_DEV_URL set)
//    it opens the Vite dev server instead.
// 2. Owns the saves, one file per captain (./captains.cjs). The page never
//    touches the disk: it asks through the preload by captain id. Writes are
//    atomic (a temp file, flushed, then renamed over the save), the same
//    guarantee web/lib/data/local/nodeSaveStorage gives the tests.
// 3. Keeps the page locked down: no Node in the page, context isolation, the
//    sandbox, and no navigation or new windows away from the game.
// 4. Talks to Steam (./steam.cjs): achievements, rich presence and the overlay,
//    each a quiet no-op when there is no Steam.

const { app, BrowserWindow, ipcMain, protocol, net, shell } = require('electron')
const path = require('path')
const fs = require('fs')
const { pathToFileURL } = require('url')
const steam = require('./steam.cjs')

const DIST = path.join(__dirname, '..', 'dist')
const DEV_URL = process.env.STB_DEV_URL

protocol.registerSchemesAsPrivileged([
  { scheme: 'app', privileges: { standard: true, secure: true, supportFetchAPI: true } },
])

// Steam first: a packaged build started outside Steam is handed back to it.
if (!steam.prepare(app)) app.exit(0)
steam.register(ipcMain)

// THE SAVE'S FOLDER IS PINNED, not taken from the package name: Steam Auto-Cloud
// is configured against this exact path (docs/systems/steam-port.md), and every
// player's saves live in it, so renaming the package must never move it. Each
// captain is one file in it (./captains.cjs).
const SAVE_DIR = 'seas-the-booty-desktop'
const captains = require('./captains.cjs').create(app, SAVE_DIR)
captains.register(ipcMain)

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
  void win.loadURL(DEV_URL ? `${DEV_URL.replace(/\/$/, '')}/sea` : 'app://game/sea')
}

app.whenReady().then(async () => {
  // The one-save layout of the first builds moves into captains/ before anything reads.
  await captains.migrate().catch(e => console.error('captain migration failed', e))
  // app://game/<path> serves ../dist/<path>, and nothing outside it.
  // A path with no file extension is a SCREEN (app://game/tavern/market), not a
  // file, and gets index.html: the shell's router reads the URL, so a reload or
  // a `window.location` the game sets lands on the right screen.
  protocol.handle('app', (req) => {
    const { pathname } = new URL(req.url)
    const screen = !path.extname(pathname)
    const file = screen ? path.join(DIST, 'index.html') : path.normalize(path.join(DIST, decodeURIComponent(pathname)))
    if (!file.startsWith(DIST + path.sep)) return new Response('not found', { status: 404 })
    return net.fetch(pathToFileURL(file).toString())
  })
  createWindow()
  app.on('activate', () => { if (BrowserWindow.getAllWindows().length === 0) createWindow() })
})

app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit() })
