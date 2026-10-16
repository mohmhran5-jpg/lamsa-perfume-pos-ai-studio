import { spawn } from 'node:child_process';
import { rm } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { build } from 'esbuild';

const root = fileURLToPath(new URL('../', import.meta.url));
const bundlePath = path.join(root, 'tests/.firestore-rules.bundle.mjs');
const firebaseBin = path.join(root, 'node_modules/.bin/firebase');

try {
  await build({
    entryPoints: [path.join(root, 'tests/firestore-rules.test.mjs')],
    outfile: bundlePath,
    bundle: true,
    platform: 'node',
    format: 'esm',
    packages: 'external',
    sourcemap: false,
    logLevel: 'info',
  });

  const child = spawn(firebaseBin, [
    'emulators:exec',
    '--project', 'demo-lamsa-auth-security',
    '--only', 'firestore',
    '--non-interactive',
    'node --test tests/.firestore-rules.bundle.mjs',
  ], { cwd: root, stdio: 'inherit', env: process.env });

  const code = await new Promise((resolve, reject) => {
    child.once('error', reject);
    child.once('exit', (exitCode, signal) => {
      if (signal) reject(new Error(`Firebase Emulator test runner was terminated by ${signal}`));
      else resolve(exitCode ?? 1);
    });
  });
  if (code !== 0) process.exitCode = code;
} finally {
  await rm(bundlePath, { force: true });
}
