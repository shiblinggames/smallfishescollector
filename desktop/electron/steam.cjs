// STEAM, FROM THE MAIN PROCESS (Steam prep, 2026-09-29).
//
// Everything the game says to Steam goes through here, and the game plays the
// same with Steam or without it: no App ID yet, Steam not running, or a dev
// build all leave `client` null and every call a quiet no-op.
//
// - THE APP ID is `steamAppId` in package.json (null until the store page
//   exists), or STB_STEAM_APPID for a test run. 480 is Valve's public test app
//   (Spacewar): it proves the overlay and the bridge, but its achievements are
//   Valve's, so ours report "not configured" there.
// - ACHIEVEMENTS: the API name of each one IS the badge id (lib/badges), so
//   there is no mapping table to keep. `unlock` only accepts names that look
//   like a badge id; Steam itself ignores names its schema does not hold.
// - RICH PRESENCE: only the keys the localization file (steam/rich_presence.vdf)
//   uses can be set.
// - CLOUD SAVES are Steam Auto-Cloud, configured on the partner site against
//   captain.json (see docs/systems/steam-port.md). Nothing here writes to it.

const path = require('path')
const fs = require('fs')

let client = null
let appId = null
let why = 'not started'

function configuredAppId() {
  const env = Number(process.env.STB_STEAM_APPID)
  if (Number.isInteger(env) && env > 0) return env
  try {
    const pkg = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'package.json'), 'utf8'))
    return Number.isInteger(pkg.steamAppId) && pkg.steamAppId > 0 ? pkg.steamAppId : null
  } catch { return null }
}

/**
 * Before the app is ready: find the App ID, relaunch through Steam if a
 * packaged build was started outside it, and switch on the overlay. Returns
 * false only when the app must quit because Steam is relaunching it.
 */
function prepare(app) {
  appId = configuredAppId()
  if (!appId) { why = 'no Steam App ID configured'; return true }
  let steamworks
  try { steamworks = require('steamworks.js') } catch (e) { why = `steamworks.js did not load: ${e.message}`; return true }
  // A packaged build opened by double-click is handed back to Steam, which
  // starts it again with the overlay and the right user. Never in development.
  if (app.isPackaged) {
    try { if (steamworks.restartAppIfNecessary(appId)) return false } catch { /* Steam absent: play on */ }
  }
  try {
    client = steamworks.init(appId)
    steamworks.electronEnableSteamOverlay()
    why = 'running'
  } catch (e) {
    client = null
    why = `Steam is not running (${e.message})`
  }
  return true
}

function status() {
  if (!client) return { running: false, appId, why }
  let name = null
  try { name = client.localplayer.getName() } catch { /* keep null */ }
  return { running: true, appId, why, name }
}

const BADGE_ID = /^[a-z0-9_]{1,64}$/

/** Unlock the achievements named. Returns how many Steam accepted. */
function unlock(ids) {
  if (!client || !Array.isArray(ids)) return 0
  let n = 0
  for (const id of ids) {
    if (typeof id !== 'string' || !BADGE_ID.test(id)) continue
    try {
      if (client.achievement.isActivated(id)) continue
      if (client.achievement.activate(id)) n++
    } catch { /* not in the schema yet */ }
  }
  return n
}

const PRESENCE_KEYS = new Set(['steam_display', 'zone'])

/** Set what friends see. `fields` maps keys to text; null clears one. */
function presence(fields) {
  if (!client || !fields || typeof fields !== 'object') return
  for (const [k, v] of Object.entries(fields)) {
    if (!PRESENCE_KEYS.has(k)) continue
    if (v !== null && (typeof v !== 'string' || v.length > 64)) continue
    try { client.localplayer.setRichPresence(k, v ?? undefined) } catch { /* ignore */ }
  }
}

function register(ipcMain) {
  ipcMain.handle('steam:status', () => status())
  ipcMain.handle('steam:unlock', (_e, ids) => unlock(ids))
  ipcMain.handle('steam:presence', (_e, fields) => presence(fields))
}

module.exports = { prepare, register, status }
