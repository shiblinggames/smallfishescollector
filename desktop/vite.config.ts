// The desktop shell's front end. It is not a second game: `@` points into
// ../web, so the fishing core, the local store, the save file, the rules, the
// content and the real dial are the SAME files the website runs.
//
// The one swap is the Game API seam (web/lib/gameApi, step 7): here
// `@/lib/gameApi` resolves to ./src/localGameApi, which answers from the local
// core and a save file instead of calling the server.

import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'path'

const WEB = path.resolve(__dirname, '../web')

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: [
      { find: /^@\/lib\/gameApi$/, replacement: path.resolve(__dirname, 'src/localGameApi.ts') },
      { find: /^@\//, replacement: WEB + '/' },
    ],
    // ../web has its own node_modules; the dial must share this app's React.
    dedupe: ['react', 'react-dom', 'framer-motion'],
  },
  // Tauri serves the built files; the dev server is what `tauri dev` opens.
  server: { port: 5173, strictPort: true },
  clearScreen: false,
  build: { target: 'es2022', outDir: 'dist', emptyOutDir: true },
})
