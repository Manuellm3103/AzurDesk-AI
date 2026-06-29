const { spawn } = require('child_process');
const path = require('path');
const server = path.resolve(__dirname, 'server.mjs');
const proc = spawn(process.execPath, [server], { stdio: 'inherit', cwd: path.dirname(server), windowsHide: false });
proc.on('error', (e) => { console.error(e); process.exit(1); });
proc.on('exit', (c) => process.exit(c));
