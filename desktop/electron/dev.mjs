// `npm run app:dev`: the Vite dev server with hot reload, and the shell's window
// opened on it. Closing the window stops both.

import { createServer } from 'vite'
import { spawn } from 'child_process'
import electron from 'electron'

const server = await createServer({ configFile: new URL('../vite.config.ts', import.meta.url).pathname.replace(/^\/(\w:)/, '$1') })
await server.listen()
const url = server.resolvedUrls.local[0]

// VS Code's terminals export ELECTRON_RUN_AS_NODE, which would start Electron as plain Node.
const env = { ...process.env, STB_DEV_URL: url }
delete env.ELECTRON_RUN_AS_NODE
const child = spawn(electron, ['.'], { stdio: 'inherit', env })
child.on('exit', async (code) => { await server.close(); process.exit(code ?? 0) })
