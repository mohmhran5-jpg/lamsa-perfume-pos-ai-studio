import { spawn, spawnSync } from 'node:child_process';
import { once } from 'node:events';
import { createServer } from 'node:http';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { setTimeout as sleep } from 'node:timers/promises';
import path from 'node:path';
import { generateKeyPairSync } from 'node:crypto';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { importPKCS8, SignJWT } from 'jose';
import { clearEmulator, seedEmulator } from './fixtures.mjs';
import { runIntegrationTests } from '../tests/integration.mjs';

const root = fileURLToPath(new URL('../', import.meta.url));
const firebaseBin = path.join(root, 'node_modules/.bin/firebase');
const wranglerBin = path.join(root, 'node_modules/.bin/wrangler');
const devVarsPath = path.join(root, '.dev.vars');
const projectId = 'demo-worker-sale';
const issuer = `https://securetoken.google.com/${projectId}`;
const children = [];
let certificateServer;

function start(name, bin, args) {
  const child = spawn(bin, args, {
    cwd: root,
    env: { ...process.env, CI: '1', FIREBASE_CLI_EXPERIMENTS: 'disable_usage_reporting' },
    detached: true,
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  const logs = [];
  const save = (chunk) => {
    const text = chunk.toString();
    logs.push(text);
    if (logs.join('').length > 10000) logs.splice(0, logs.length - 4);
    process.stdout.write(`[${name}] ${text}`);
  };
  child.stdout.on('data', save);
  child.stderr.on('data', save);
  child.on('exit', (code) => {
    if (code && !stopping) console.error(`[${name}] exited with code ${code}`);
  });
  children.push({ name, child, logs });
  return child;
}

let stopping = false;
async function stopAll() {
  stopping = true;
  for (const { child } of children.reverse()) {
    if (child.exitCode === null) {
      try { process.kill(-child.pid, 'SIGTERM'); } catch { /* already stopped */ }
    }
  }
  await Promise.all(children.map(async ({ child }) => {
    if (child.exitCode === null) {
      try { await Promise.race([once(child, 'exit'), sleep(4000)]); } catch { /* ignore */ }
      if (child.exitCode === null) {
        try { process.kill(-child.pid, 'SIGKILL'); } catch { /* already stopped */ }
      }
    }
  }));
}

async function waitFor(url, label, timeoutMs = 120000) {
  const end = Date.now() + timeoutMs;
  let lastError;
  while (Date.now() < end) {
    for (const entry of children) {
      if (entry.child.exitCode !== null) throw new Error(`${entry.name} exited early:\n${entry.logs.join('')}`);
    }
    try {
      const response = await fetch(url, { signal: AbortSignal.timeout(2000) });
      if (label === 'worker' ? response.ok : response.status >= 200) return response;
    } catch (error) { lastError = error; }
    await sleep(500);
  }
  throw new Error(`Timed out waiting for ${label}: ${lastError || 'no response'}`);
}

async function makeEphemeralKeys() {
  const pair = generateKeyPairSync('rsa', {
    modulusLength: 2048,
    publicExponent: 0x10001,
    publicKeyEncoding: { type: 'spki', format: 'pem' },
    privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
  });
  const kid = 'ephemeral-local-test';
  const signingKey = await importPKCS8(pair.privateKey, 'RS256');
  const certificateDir = await mkdtemp(path.join(tmpdir(), 'lamsa-firebase-cert-'));
  let certificate;
  try {
    const privateKeyPath = path.join(certificateDir, 'private.pem');
    const certificatePath = path.join(certificateDir, 'certificate.pem');
    await writeFile(privateKeyPath, pair.privateKey, { mode: 0o600 });
    const generated = spawnSync('openssl', [
      'req', '-new', '-x509', '-key', privateKeyPath,
      '-out', certificatePath, '-days', '2', '-subj', '/CN=lamsa-local-firebase-test',
    ], { encoding: 'utf8' });
    if (generated.status !== 0) {
      throw new Error(`Failed to create ephemeral local certificate: ${generated.stderr || generated.error || generated.status}`);
    }
    certificate = await readFile(certificatePath, 'utf8');
  } finally {
    await rm(certificateDir, { recursive: true, force: true });
  }
  return {
    kid,
    certificate,
    mintToken: async (email, options = {}) => {
      const provider = options.provider ?? 'google.com';
      const verified = options.verified ?? true;
      const nowSeconds = Math.floor(Date.now() / 1000);
      const audience = options.audience ?? projectId;
      const tokenIssuer = options.issuer ?? issuer;
      return new SignJWT({
        email,
        email_verified: verified,
        firebase: { sign_in_provider: provider },
        ...(options.omitAuthTime ? {} : { auth_time: options.authTime ?? nowSeconds }),
      })
        .setProtectedHeader({ alg: 'RS256', kid: options.kid ?? kid })
        .setIssuer(tokenIssuer)
        .setAudience(audience)
        .setSubject(options.uid ?? `uid-${email}`)
        .setIssuedAt(options.issuedAt ?? nowSeconds)
        .setExpirationTime(options.expiration ?? '10m')
        .sign(signingKey);
    },
  };
}

async function startCertificateServer({ kid, certificate }) {
  let requestCount = 0;
  const server = createServer((request, response) => {
    if (request.method !== 'GET' || request.url !== '/certs') {
      response.writeHead(404).end();
      return;
    }
    requestCount += 1;
    response.writeHead(200, {
      'content-type': 'application/json',
      'cache-control': 'public, max-age=120',
    });
    response.end(JSON.stringify({ [kid]: certificate }));
  });
  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolve);
  });
  const address = server.address();
  return {
    server,
    url: `http://127.0.0.1:${address.port}/certs`,
    getRequestCount: () => requestCount,
  };
}

try {
  const keys = await makeEphemeralKeys();
  certificateServer = await startCertificateServer(keys);
  await writeFile(devVarsPath, `FIREBASE_TEST_CERTS_URL='${certificateServer.url}'\n`, { mode: 0o600 });
  start('firestore', firebaseBin, [
    'emulators:start', '--project', projectId, '--only', 'firestore',
    '--config', 'firebase.json', '--non-interactive',
  ]);
  await waitFor('http://127.0.0.1:8080/', 'firestore emulator');
  start('wrangler', wranglerBin, [
    'dev', '--local', '--ip', '127.0.0.1', '--port', '8787', '--log-level', 'warn',
    '--show-interactive-dev-session=false',
  ]);
  await waitFor('http://127.0.0.1:8787/health', 'worker');
  await clearEmulator();
  await seedEmulator();
  await runIntegrationTests({
    mintToken: keys.mintToken,
    getCertificateRequestCount: certificateServer.getRequestCount,
  });
} finally {
  await stopAll();
  if (certificateServer) {
    certificateServer.server.closeAllConnections?.();
    await new Promise((resolve) => certificateServer.server.close(resolve));
  }
  await rm(devVarsPath, { force: true });
}
