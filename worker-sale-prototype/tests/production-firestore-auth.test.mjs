import assert from 'node:assert/strict';
import { generateKeyPairSync } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { jwtVerify } from 'jose';
import {
  createGoogleServiceAccountTokenProvider,
  FIRESTORE_DATASTORE_SCOPE,
  GOOGLE_OAUTH_TOKEN_URL,
} from '../src/googleServiceAccountAuth.mjs';
import {
  PRODUCTION_FIRESTORE_DATABASE_ID,
  PRODUCTION_FIRESTORE_PROJECT_ID,
  PRODUCTION_FIRESTORE_SERVICE_ACCOUNT,
} from '../src/productionConfig.mjs';
import Worker, {
  assertProductionFirestoreConfig,
  firestoreRoot,
  fsRequest,
} from '../src/index.mjs';

const keyPair = generateKeyPairSync('rsa', { modulusLength: 2048 });
const testPrivateKey = keyPair.privateKey.export({ type: 'pkcs8', format: 'pem' }).toString();

function productionEnv(overrides = {}) {
  return {
    ENVIRONMENT: 'production',
    PROJECT_ID: PRODUCTION_FIRESTORE_PROJECT_ID,
    FIRESTORE_DATABASE_ID: PRODUCTION_FIRESTORE_DATABASE_ID,
    GCP_SERVICE_ACCOUNT_EMAIL: PRODUCTION_FIRESTORE_SERVICE_ACCOUNT,
    GCP_SERVICE_ACCOUNT_PRIVATE_KEY: testPrivateKey,
    FIRESTORE_PRODUCTION_TRANSPORT_ENABLED: 'true',
    SALE_WORKER_PRODUCTION_ENABLED: 'false',
    ...overrides,
  };
}

async function verifyOAuthAssertion(form, nowSeconds = Math.floor(Date.now() / 1000)) {
  assert.equal(form.get('grant_type'), 'urn:ietf:params:oauth:grant-type:jwt-bearer');
  const assertion = form.get('assertion');
  assert.equal(typeof assertion, 'string');
  const { payload, protectedHeader } = await jwtVerify(assertion, keyPair.publicKey, {
    algorithms: ['RS256'],
    audience: GOOGLE_OAUTH_TOKEN_URL,
  });
  assert.deepEqual(protectedHeader, { alg: 'RS256', typ: 'JWT' });
  assert.equal(payload.iss, PRODUCTION_FIRESTORE_SERVICE_ACCOUNT);
  assert.equal(payload.scope, FIRESTORE_DATASTORE_SCOPE);
  assert.ok(payload.iat <= nowSeconds + 2 && payload.iat >= nowSeconds - 5);
  assert.equal(payload.exp - payload.iat, 3600);
}

function oauthResponse(accessToken = 'mock-google-access-token') {
  return new Response(JSON.stringify({ access_token: accessToken, token_type: 'Bearer', expires_in: 3600 }), {
    status: 200,
    headers: { 'content-type': 'application/json' },
  });
}

test('OAuth JWT is RS256, scoped to Firestore, exchange is mocked, and access tokens are cached', async () => {
  let exchangeCount = 0;
  const fetchImpl = async (url, init) => {
    assert.equal(String(url), GOOGLE_OAUTH_TOKEN_URL);
    assert.equal(init.method, 'POST');
    assert.equal(init.redirect, 'manual');
    exchangeCount += 1;
    await verifyOAuthAssertion(new URLSearchParams(init.body));
    return oauthResponse();
  };
  const getToken = createGoogleServiceAccountTokenProvider({
    fetchImpl,
    expectedServiceAccountEmail: PRODUCTION_FIRESTORE_SERVICE_ACCOUNT,
  });
  const env = productionEnv();
  const [first, concurrent] = await Promise.all([getToken(env), getToken(env)]);
  assert.equal(first, 'mock-google-access-token');
  assert.equal(concurrent, first);
  assert.equal(await getToken(env), first);
  assert.equal(exchangeCount, 1);
});

test('OAuth accepts the complete service-account JSON secret and pins its project and identity', async () => {
  let exchangeCount = 0;
  const keyJson = JSON.stringify({
    type: 'service_account',
    project_id: PRODUCTION_FIRESTORE_PROJECT_ID,
    private_key_id: 'ephemeral-test-key-id',
    private_key: testPrivateKey,
    client_email: PRODUCTION_FIRESTORE_SERVICE_ACCOUNT,
    client_id: '1234567890',
  });
  const env = productionEnv({ GCP_SERVICE_ACCOUNT_PRIVATE_KEY: '', GCP_SERVICE_ACCOUNT_KEY_JSON: keyJson });
  const fetchImpl = async (url, init) => {
    assert.equal(String(url), GOOGLE_OAUTH_TOKEN_URL);
    exchangeCount += 1;
    await verifyOAuthAssertion(new URLSearchParams(init.body));
    return oauthResponse();
  };
  const getToken = createGoogleServiceAccountTokenProvider({
    fetchImpl,
    expectedServiceAccountEmail: PRODUCTION_FIRESTORE_SERVICE_ACCOUNT,
    expectedProjectId: PRODUCTION_FIRESTORE_PROJECT_ID,
  });
  assert.equal(await getToken(env), 'mock-google-access-token');
  assert.equal(assertProductionFirestoreConfig(env), `projects/${PRODUCTION_FIRESTORE_PROJECT_ID}/databases/${PRODUCTION_FIRESTORE_DATABASE_ID}/documents`);
  assert.equal(exchangeCount, 1);

  const wrongProject = productionEnv({
    GCP_SERVICE_ACCOUNT_PRIVATE_KEY: '',
    GCP_SERVICE_ACCOUNT_KEY_JSON: JSON.stringify({
      type: 'service_account',
      project_id: 'other-project',
      private_key: testPrivateKey,
      client_email: PRODUCTION_FIRESTORE_SERVICE_ACCOUNT,
    }),
  });
  assert.throws(() => assertProductionFirestoreConfig(wrongProject),
    (error) => error.code === 'prototype/production-transport-not-approved');
  const rejectWrongProjectToken = createGoogleServiceAccountTokenProvider({
    fetchImpl: async () => { throw new Error('wrong project must fail before network'); },
    expectedServiceAccountEmail: PRODUCTION_FIRESTORE_SERVICE_ACCOUNT,
    expectedProjectId: PRODUCTION_FIRESTORE_PROJECT_ID,
  });
  await assert.rejects(rejectWrongProjectToken(wrongProject),
    (error) => error.code === 'google/service-account-config-invalid');
});

test('OAuth fails closed for missing or unexpected service-account credentials without network access', async () => {
  let networkCalls = 0;
  const getToken = createGoogleServiceAccountTokenProvider({
    fetchImpl: async () => { networkCalls += 1; throw new Error('network must not be used'); },
    expectedServiceAccountEmail: PRODUCTION_FIRESTORE_SERVICE_ACCOUNT,
  });
  await assert.rejects(getToken(productionEnv({ GCP_SERVICE_ACCOUNT_PRIVATE_KEY: '' })),
    (error) => error.code === 'google/service-account-config-invalid');
  await assert.rejects(getToken(productionEnv({ GCP_SERVICE_ACCOUNT_EMAIL: 'other@example.test' })),
    (error) => error.code === 'google/service-account-config-invalid');
  await assert.rejects(getToken(productionEnv({ GCP_SERVICE_ACCOUNT_PRIVATE_KEY: 'not-a-key' })),
    (error) => error.code === 'google/service-account-config-invalid');
  assert.equal(networkCalls, 0);
});

test('production Firestore REST uses the exact project/database and mocked OAuth Bearer token', async () => {
  const root = firestoreRoot(productionEnv());
  assert.equal(root, `https://firestore.googleapis.com/v1/projects/${PRODUCTION_FIRESTORE_PROJECT_ID}/databases/${PRODUCTION_FIRESTORE_DATABASE_ID}/documents`);
  const calls = [];
  const fetchImpl = async (url, init) => {
    const target = String(url);
    calls.push({ target, init });
    if (target === GOOGLE_OAUTH_TOKEN_URL) {
      await verifyOAuthAssertion(new URLSearchParams(init.body));
      return oauthResponse();
    }
    assert.equal(target, `${root}:commit`);
    assert.equal(init.headers.authorization, 'Bearer mock-google-access-token');
    assert.equal(init.headers['content-type'], 'application/json');
    assert.deepEqual(JSON.parse(init.body), { writes: [] });
    return new Response(JSON.stringify({ writeResults: [], commitTime: '2026-10-16T00:00:00Z' }), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    });
  };
  const tokenProvider = createGoogleServiceAccountTokenProvider({
    fetchImpl,
    expectedServiceAccountEmail: PRODUCTION_FIRESTORE_SERVICE_ACCOUNT,
  });
  const result = await fsRequest(productionEnv(), 'POST', `${root}:commit`, { writes: [] }, { fetchImpl, tokenProvider });
  assert.equal(result.parsed.writeResults.length, 0);
  assert.deepEqual(calls.map((call) => call.target), [GOOGLE_OAUTH_TOKEN_URL, `${root}:commit`]);
});

test('Firestore REST propagates a mocked IAM permission denial and never falls back to Emulator auth', async () => {
  const env = productionEnv({ FIRESTORE_EMULATOR_ADMIN_TOKEN: 'must-not-be-used' });
  assert.throws(() => firestoreRoot(env), (error) => error.code === 'prototype/production-transport-not-approved');

  const cleanEnv = productionEnv();
  const root = firestoreRoot(cleanEnv);
  const fetchImpl = async (url) => {
    if (String(url) === GOOGLE_OAUTH_TOKEN_URL) return oauthResponse();
    return new Response(JSON.stringify({ error: { status: 'PERMISSION_DENIED', message: 'mock IAM denial' } }), {
      status: 403,
      headers: { 'content-type': 'application/json' },
    });
  };
  const tokenProvider = createGoogleServiceAccountTokenProvider({
    fetchImpl,
    expectedServiceAccountEmail: PRODUCTION_FIRESTORE_SERVICE_ACCOUNT,
  });
  await assert.rejects(fsRequest(cleanEnv, 'POST', `${root}:commit`, { writes: [] }, { fetchImpl, tokenProvider }),
    (error) => error.status === 403 && error.code === 'PERMISSION_DENIED');
});

test('production transport pins identity/resource and rejects URL escape attempts', async () => {
  const env = productionEnv();
  assert.equal(assertProductionFirestoreConfig(env), `projects/${PRODUCTION_FIRESTORE_PROJECT_ID}/databases/${PRODUCTION_FIRESTORE_DATABASE_ID}/documents`);
  for (const changes of [
    { FIRESTORE_PRODUCTION_TRANSPORT_ENABLED: 'false' },
    { PROJECT_ID: 'demo-worker-sale' },
    { FIRESTORE_DATABASE_ID: '(default)' },
    { GCP_SERVICE_ACCOUNT_EMAIL: 'other@demo-gen-project-test.iam.gserviceaccount.com' },
    { FIRESTORE_EMULATOR_HOST: '127.0.0.1:8080' },
    { FIREBASE_TEST_CERTS_URL: 'http://127.0.0.1:9999/certs' },
  ]) {
    assert.throws(() => firestoreRoot(productionEnv(changes)),
      (error) => error.code === (changes.FIRESTORE_PRODUCTION_TRANSPORT_ENABLED === 'false'
        ? 'prototype/production-transport-disabled' : 'prototype/production-transport-not-approved'));
  }
  await assert.rejects(fsRequest(env, 'GET', 'https://example.invalid/steal', undefined, {
    fetchImpl: async () => { throw new Error('fetch must not be called'); },
    tokenProvider: async () => 'mock-token',
  }), (error) => error.code === 'firestore/endpoint-not-allowed');
});

test('production /health is read-only and returns no environment, data, or secret fields', async () => {
  const previousFetch = globalThis.fetch;
  let networkCalls = 0;
  globalThis.fetch = async () => { networkCalls += 1; throw new Error('health must not use the network'); };
  try {
    const healthy = await Worker.fetch(new Request('https://worker.test/health'), productionEnv({
      FIRESTORE_PRODUCTION_TRANSPORT_ENABLED: 'false',
      SALE_WORKER_PRODUCTION_ENABLED: 'false',
    }));
    assert.equal(healthy.status, 200);
    assert.equal(healthy.headers.get('cache-control'), 'no-store');
    assert.deepEqual(await healthy.json(), { ok: true });

    const missingSecret = await Worker.fetch(new Request('https://worker.test/health'), productionEnv({
      GCP_SERVICE_ACCOUNT_PRIVATE_KEY: '',
    }));
    assert.equal(missingSecret.status, 503);
    assert.deepEqual(await missingSecret.json(), { ok: false });
  } finally {
    globalThis.fetch = previousFetch;
  }
  assert.equal(networkCalls, 0);
});

test('public sale routes remain disabled by default even when only the internal REST switch is enabled', async () => {
  const env = productionEnv();
  const routes = [
    new Request('https://worker.test/api/lamsa/commission-counter/bootstrap', { method: 'POST', headers: { origin: 'https://mohmhran5-jpg.github.io', 'content-type': 'application/json' }, body: '{}' }),
    new Request('https://worker.test/api/lamsa/sales/quote', { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{}' }),
    new Request('https://worker.test/api/lamsa/sales', { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{}' }),
    new Request('https://worker.test/api/lamsa/sales/sale-test-001/reverse', { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{}' }),
    new Request('https://worker.test/api/sales', { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{}' }),
  ];
  for (const [index, request] of routes.entries()) {
    const response = await Worker.fetch(request, env);
    assert.equal(response.status, 503, request.url);
    const expected = index === routes.length - 1
      ? { ok: false, error: 'prototype/emulator-only' }
      : { ok: false, error: 'prototype/production-routes-disabled' };
    assert.deepEqual(await response.json(), expected, request.url);
  }
});

test('actual Worker preflight returns exact local CORS headers and rejects non-local origins', async () => {
  const env = {
    ENVIRONMENT: 'local-emulator',
    PROJECT_ID: 'demo-worker-sale',
    FIRESTORE_DATABASE_ID: 'demo-named-firestore-db',
    FIRESTORE_EMULATOR_HOST: '127.0.0.1:8080',
    FIRESTORE_EMULATOR_ADMIN_TOKEN: 'emulator-only-test-token',
    FIREBASE_TEST_CERTS_URL: 'http://127.0.0.1:9999/certs',
  };
  const makePreflight = (origin) => new Request('http://worker.test/api/lamsa/sales/quote', {
    method: 'OPTIONS',
    headers: { origin, 'access-control-request-method': 'POST', 'access-control-request-headers': 'authorization, content-type' },
  });
  const allowed = await Worker.fetch(makePreflight('http://localhost:3000'), env);
  assert.equal(allowed.status, 204);
  assert.equal(allowed.headers.get('access-control-allow-origin'), 'http://localhost:3000');
  assert.equal(allowed.headers.get('access-control-allow-methods'), 'POST, OPTIONS');
  assert.equal(allowed.headers.get('access-control-allow-headers'), 'authorization, content-type');
  assert.equal(allowed.headers.get('access-control-max-age'), '300');

  const denied = await Worker.fetch(makePreflight('https://mohmhran5-jpg.github.io'), env);
  assert.equal(denied.status, 403);
  assert.equal(denied.headers.get('access-control-allow-origin'), null);
  assert.deepEqual(await denied.json(), { ok: false, error: 'worker/origin-not-allowed' });
});

test('Wrangler pins the production environment safely without storing credentials or enabling routes', async () => {
  const wrangler = await readFile(new URL('../wrangler.toml', import.meta.url), 'utf8');
  assert.match(wrangler, /ENVIRONMENT = "local-emulator"/);
  assert.match(wrangler, /PROJECT_ID = "demo-worker-sale"/);
  assert.match(wrangler, /FIRESTORE_PRODUCTION_TRANSPORT_ENABLED = "false"/);
  assert.match(wrangler, /SALE_WORKER_PRODUCTION_ENABLED = "false"/);
  assert.match(wrangler, /CORS_ALLOWED_ORIGIN = "https:\/\/mohmhran5-jpg\.github\.io"/);
  assert.match(wrangler, /\[env\.production\]/);
  assert.match(wrangler, /name = "lamsa-sales-worker"/);
  const productionVars = wrangler.split('[env.production.vars]')[1] || '';
  assert.match(productionVars, /PROJECT_ID = "gen-lang-client-0515786951"/);
  assert.match(productionVars, /FIRESTORE_DATABASE_ID = "ai-studio-remixremixremixr-0f36aa66-a2c8-4d8a-bad2-ea0f72310677"/);
  assert.match(productionVars, /GCP_SERVICE_ACCOUNT_EMAIL = "firestore-store-worker@gen-lang-client-0515786951\.iam\.gserviceaccount\.com"/);
  assert.match(productionVars, /FIRESTORE_PRODUCTION_TRANSPORT_ENABLED = "false"/);
  assert.match(productionVars, /SALE_WORKER_PRODUCTION_ENABLED = "false"/);
  assert.doesNotMatch(wrangler, /^\s*GCP_SERVICE_ACCOUNT_PRIVATE_KEY\s*=/m);
  assert.doesNotMatch(wrangler, /-----BEGIN PRIVATE KEY-----/);
  assert.doesNotMatch(wrangler, /^\s*GCP_SERVICE_ACCOUNT_KEY_JSON\s*=/m);
});
