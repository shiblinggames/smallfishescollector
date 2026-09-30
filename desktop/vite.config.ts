// The desktop shell's front end. It is not a second game: `@` points into
// ../web, so the fishing core, the local store, the save file, the rules, the
// content and the real dial are the SAME files the website runs.
//
// The swaps:
// - the Game API seam (web/lib/gameApi, step 7): `@/lib/gameApi` resolves to
//   ./src/localGameApi, which answers from the local core and a save file
//   instead of calling the server;
// - the bits of Next the screens use (navigation, links, lazy loading, images)
//   resolve to ./src/shims, since there is no Next in the shell;
// - the browser database client resolves to a quiet stand-in (see its header).
// The web's public/ folder (the art, the sound) is served and shipped as is.

import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import path from 'path'

const WEB = path.resolve(__dirname, '../web')
const SHIM = path.resolve(__dirname, 'src/shims')

export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: [
      { find: /^@\/lib\/gameApi$/, replacement: path.resolve(__dirname, 'src/localGameApi.ts') },
      { find: /^@\/lib\/supabase\/client$/, replacement: path.join(SHIM, 'supabaseClient.ts') },
      { find: /^@\/lib\/navState$/, replacement: path.join(SHIM, 'navState.ts') },
      { find: /^next\/navigation$/, replacement: path.join(SHIM, 'navigation.tsx') },
      { find: /^next\/link$/, replacement: path.join(SHIM, 'link.tsx') },
      { find: /^next\/dynamic$/, replacement: path.join(SHIM, 'dynamic.tsx') },
      { find: /^next\/image$/, replacement: path.join(SHIM, 'image.tsx') },
      { find: /^@\//, replacement: WEB + '/' },
    ],
    // ../web has its own node_modules; the dial must share this app's React.
    dedupe: ['react', 'react-dom', 'framer-motion'],
  },
  // Served from the root of app://game/, and the shell answers any path with
  // index.html, so a screen's URL survives a reload.
  base: '/',
  publicDir: path.join(WEB, 'public'),
  // The screens read NEXT_PUBLIC_* settings; offline none of them apply, except
  // the one that says which build this is (web/lib/platform IS_DESKTOP).
  define: { 'process.env': JSON.stringify({ NODE_ENV: process.env.NODE_ENV ?? 'production', NEXT_PUBLIC_PLATFORM: 'desktop' }) },
  // `npm run app:dev` opens the window on this dev server.
  server: { port: 5173, strictPort: true },
  clearScreen: false,
  build: { target: 'es2022', outDir: 'dist', emptyOutDir: true },
})
