import assert from 'node:assert/strict';
import test from 'node:test';
import worker, { firestoreDocumentsPath } from '../src/index.mjs';

test('Firestore path is explicit for the local default Emulator database', () => {
  assert.equal(
    firestoreDocumentsPath('demo-worker-sale', '(default)'),
    'projects/demo-worker-sale/databases/(default)/documents',
  );
});

test('Firestore path builder supports a synthetic named database ID explicitly', () => {
  assert.equal(
    firestoreDocumentsPath(
      'demo-gen-project-test',
      'demo-named-firestore-db',
    ),
    'projects/demo-gen-project-test/databases/demo-named-firestore-db/documents',
  );
});

test('Firestore path builder rejects malformed project and database IDs', () => {
  assert.throws(() => firestoreDocumentsPath('demo-worker-sale/other', '(default)'), /invalid-firestore-resource/);
  assert.throws(() => firestoreDocumentsPath('demo-worker-sale', 'db/path'), /invalid-firestore-resource/);
  assert.throws(() => firestoreDocumentsPath('demo-worker-sale', 'A-DATABASE'), /invalid-firestore-resource/);
});

test('all Worker routes remain blocked when the synthetic pinned target is set', async () => {
  const env = {
    ENVIRONMENT: 'production',
    PROJECT_ID: 'demo-gen-project-test',
    FIRESTORE_DATABASE_ID: 'demo-named-firestore-db',
    FIRESTORE_EMULATOR_HOST: '127.0.0.1:8080',
    FIRESTORE_EMULATOR_ADMIN_TOKEN: 'unused-test-only',
    FIREBASE_TEST_CERTS_URL: 'http://127.0.0.1:9999/certs',
  };
  const routes = [
    new Request('http://worker.local/health'),
    new Request('http://worker.local/api/lamsa/sales/quote', { method: 'POST', body: '{}' }),
    new Request('http://worker.local/api/lamsa/sales', { method: 'POST', body: '{}' }),
    new Request('http://worker.local/api/lamsa/sales/sale-1234/reverse', { method: 'POST', body: '{}' }),
    new Request('http://worker.local/api/lamsa/server-time', { method: 'POST', body: '{}' }),
    new Request('http://worker.local/api/sales', { method: 'POST', body: '{}' }),
  ];

  for (const request of routes) {
    const response = await worker.fetch(request, env);
    assert.equal(response.status, 503, `${request.method} ${new URL(request.url).pathname}`);
  }
});

test('emulator guard accepts the configured named database only with demo project and loopback endpoints', async () => {
  const env = {
    ENVIRONMENT: 'local-emulator',
    PROJECT_ID: 'demo-worker-sale',
    FIRESTORE_DATABASE_ID: 'demo-named-firestore-db',
    FIRESTORE_EMULATOR_HOST: '127.0.0.1:8080',
    FIRESTORE_EMULATOR_ADMIN_TOKEN: 'unused-test-only',
    FIREBASE_TEST_CERTS_URL: 'http://127.0.0.1:9999/certs',
  };
  const response = await worker.fetch(new Request('http://worker.local/health'), env);
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { ok: true });

  const nonDemoProject = await worker.fetch(new Request('http://worker.local/health'), {
    ...env,
    PROJECT_ID: 'demo-gen-project-test',
  });
  assert.equal(nonDemoProject.status, 503);
});
