import { spawn } from 'node:child_process';
import { existsSync, cpSync, mkdirSync, rmSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const currentFile = fileURLToPath(import.meta.url);
const scriptsDir = dirname(currentFile);
const repoRoot = resolve(scriptsDir, '..');
const prodbyEnneRoot = resolve(repoRoot, '..', '..', 'ProdbyENNE');
const distDir = resolve(prodbyEnneRoot, 'dist');
const targetDir = resolve(repoRoot, 'client', 'profiles', 'prodbyenne');
const embedUrl = 'http://localhost:5000/profiles/prodbyenne/index.html';

function runNpmBuild() {
  return new Promise((resolveBuild, rejectBuild) => {
    const child = spawn('npm run build', [], {
      cwd: prodbyEnneRoot,
      stdio: 'inherit',
      shell: true,
    });

    child.on('error', rejectBuild);
    child.on('exit', (code) => {
      if (code === 0) {
        resolveBuild();
        return;
      }
      rejectBuild(new Error(`ProdbyENNE build failed with exit code ${code}`));
    });
  });
}

function openInBrowser(url) {
  return new Promise((resolveOpen, rejectOpen) => {
    let command;

    if (process.platform === 'win32') {
      command = `start "" "${url}"`;
    } else if (process.platform === 'darwin') {
      command = `open "${url}"`;
    } else {
      command = `xdg-open "${url}"`;
    }

    const child = spawn(command, [], {
      cwd: repoRoot,
      stdio: 'ignore',
      shell: true,
    });

    child.on('error', rejectOpen);
    child.on('exit', (code) => {
      if (code === 0 || code === null) {
        resolveOpen();
        return;
      }
      rejectOpen(new Error(`Unable to open browser, exit code ${code}`));
    });
  });
}

async function main() {
  if (!existsSync(prodbyEnneRoot)) {
    throw new Error(`Missing source app folder: ${prodbyEnneRoot}`);
  }

  console.log(`Building ProdbyENNE app from: ${prodbyEnneRoot}`);
  await runNpmBuild();

  if (!existsSync(distDir)) {
    throw new Error(`Build output not found: ${distDir}`);
  }

  mkdirSync(targetDir, { recursive: true });
  rmSync(targetDir, { recursive: true, force: true });
  mkdirSync(targetDir, { recursive: true });
  cpSync(distDir, targetDir, { recursive: true, force: true });

  console.log(`Published embed bundle to: ${targetDir}`);

  if (process.argv.includes('--open')) {
    await openInBrowser(embedUrl);
    console.log(`Opened smoke test URL: ${embedUrl}`);
  }
}

main().catch((error) => {
  console.error(error.message);
  process.exit(1);
});