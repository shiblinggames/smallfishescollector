// PIXI'S PATHS UNDER app:// (Steam prep, 2026-09-30).
//
// Pixi resolves an asset path like '/sea/portal-ring.webp' against the page's
// root, and it only recognises http(s) as a web address. Under the shell's
// app://game/ it took the root to be "app://" and asked for app://sea/..., which
// does not exist, so the channel posts and the portal rings never drew.
//
// Teaching its one test that app:// is a web address too puts the root at
// app://game/ and every root-relative path lands where the web's does. This is
// the module pixi.js itself re-exports as `path`, so it is the same object the
// renderer reads.

// The file ships no types of its own; its shape is pixi.js's exported `path`.
// @ts-expect-error untyped .mjs, typed on the next line
import { path as untyped } from '../../web/node_modules/pixi.js/lib/utils/path.mjs'
const path = untyped as typeof import('../../web/node_modules/pixi.js').path

const isUrl = path.isUrl.bind(path)
path.isUrl = (p: string) => isUrl(p) || /^app:/.test(path.toPosix(p))
