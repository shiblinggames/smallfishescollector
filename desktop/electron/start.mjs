// `npm run app`: open the shell on the built front end. Editors built on
// Electron (VS Code) export ELECTRON_RUN_AS_NODE to their terminals, which would
// start Electron as plain Node; this launcher clears it.

import { spawn } from 'child_process'
import electron from 'electron'

const env = { ...process.env }
delete env.ELECTRON_RUN_AS_NODE
const child = spawn(electron, ['.', ...process.argv.slice(2)], { stdio: 'inherit', env })
child.on('exit', (code) => process.exit(code ?? 0))
