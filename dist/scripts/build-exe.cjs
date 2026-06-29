const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

function main() {
  const root = path.resolve(__dirname, '..');
  const outDir = path.join(root, 'dist');
  try { fs.rmSync(outDir, { recursive: true, force: true }); } catch {}
  fs.mkdirSync(outDir, { recursive: true });

  // Copy runtime files first
  const copyFiles = ['server.mjs', 'package.json', 'public', 'src', 'scripts', 'docs', 'data'];
  for (const f of copyFiles) {
    const src = path.join(root, f);
    const dst = path.join(outDir, f);
    if (!fs.existsSync(src)) continue;
    if (fs.statSync(src).isDirectory()) {
      fs.mkdirSync(dst, { recursive: true });
      execSync(`xcopy "${src}" "${dst}" /E /I /Q /Y`, { cwd: root, stdio: 'ignore' });
    } else {
      fs.copyFileSync(src, dst);
    }
  }

  // Primary portable launcher: batch that runs node with server.mjs in same folder
  fs.writeFileSync(path.join(outDir, 'azurdesk-ai.bat'), '@echo off\ncd /d "%~dp0"\nnode server.mjs\n');

  // Secondary Node launcher for pkg attempt
  const launcher = path.join(outDir, 'azurdesk-ai-launcher.js');
  fs.writeFileSync(launcher, `const { spawn } = require('child_process');\nconst path = require('path');\nconst server = path.resolve(__dirname, 'server.mjs');\nconst proc = spawn(process.execPath, [server], { stdio: 'inherit', cwd: path.dirname(server), windowsHide: false });\nproc.on('error', (e) => { console.error(e); process.exit(1); });\nproc.on('exit', (c) => process.exit(c));\n`);

  try {
    execSync('npx pkg "' + launcher + '" --targets node18-win-x64 --output "' + path.join(outDir, 'azurdesk-ai.exe') + '"', { cwd: root, stdio: 'inherit' });
    console.log('EXE generado: dist/azurdesk-ai.exe (fallback .bat también disponible)');
  } catch (e) {
    console.warn('pkg no disponible; se usa launcher batch/JS fallback.');
  }
  console.log('Archivos de runtime copiados a dist/');
}

main();
