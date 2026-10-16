import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import {
  isAllowedLamsaRequestOrigin,
  isAllowedTrustedServerTimeOrigin,
  isExactHttpsOrigin,
  isLamsaSalesCutoverReached,
  isProductionLamsaRouteEnabled,
  isTrustedServerTimeRouteEnabled,
  resolveLamsaCorsOrigin,
  resolveTrustedServerTimeCorsOrigin,
} from '../src/workerRuntimePolicy.mjs';
import {
  assertLamsaCommissionCounterBootstrapAllowed,
  assertLamsaRequestAllowed,
  assertTrustedServerTimeRequestAllowed,
} from '../src/index.mjs';

const PAGES_ORIGIN = 'https://mohmhran5-jpg.github.io';

test('trusted server time uses an explicit project/origin gate without opening sale or Firestore routes', () => {
  const base = {
    ENVIRONMENT: 'production',
    PROJECT_ID: 'gen-lang-client-0515786951',
    CORS_ALLOWED_ORIGIN: PAGES_ORIGIN,
    SERVER_TIME_ENDPOINT_ENABLED: 'false',
  };
  assert.equal(isTrustedServerTimeRouteEnabled(base), false);
  const enabled = { ...base, SERVER_TIME_ENDPOINT_ENABLED: 'true' };
  assert.equal(isTrustedServerTimeRouteEnabled(enabled), true);
  assert.equal(isProductionLamsaRouteEnabled(enabled), false);
  assert.equal(isAllowedTrustedServerTimeOrigin(enabled, PAGES_ORIGIN), true);
  assert.equal(isAllowedTrustedServerTimeOrigin(enabled, 'https://evil.example'), false);
  assert.equal(resolveTrustedServerTimeCorsOrigin(enabled, PAGES_ORIGIN), PAGES_ORIGIN);
  assert.equal(resolveTrustedServerTimeCorsOrigin(enabled, undefined), null);
  assert.throws(
    () => assertTrustedServerTimeRequestAllowed(new Request('https://worker.test/api/lamsa/server-time', { method: 'POST', headers: { origin: PAGES_ORIGIN } }), base),
    (error) => error.code === 'worker/server-time-disabled',
  );
  assert.doesNotThrow(() => assertTrustedServerTimeRequestAllowed(
    new Request('https://worker.test/api/lamsa/server-time', { method: 'POST', headers: { origin: PAGES_ORIGIN } }), enabled,
  ));
  assert.throws(() => assertTrustedServerTimeRequestAllowed(
    new Request('https://worker.test/api/lamsa/server-time', { method: 'POST', headers: { origin: 'https://evil.example' } }), enabled,
  ), (error) => error.code === 'worker/origin-not-allowed');
  assert.equal(isTrustedServerTimeRouteEnabled({ ...enabled, PROJECT_ID: 'wrong-project' }), false);
});

test('production routes stay disabled unless both explicit flags and one exact HTTPS origin are present', () => {
  assert.equal(isProductionLamsaRouteEnabled({
    ENVIRONMENT: 'production',
    FIRESTORE_PRODUCTION_TRANSPORT_ENABLED: 'true',
    CORS_ALLOWED_ORIGIN: PAGES_ORIGIN,
  }), false);
  assert.equal(isProductionLamsaRouteEnabled({
    ENVIRONMENT: 'production',
    SALE_WORKER_PRODUCTION_ENABLED: 'true',
    CORS_ALLOWED_ORIGIN: PAGES_ORIGIN,
  }), false);
  assert.equal(isProductionLamsaRouteEnabled({
    ENVIRONMENT: 'production',
    SALE_WORKER_PRODUCTION_ENABLED: 'true',
    FIRESTORE_PRODUCTION_TRANSPORT_ENABLED: 'true',
    CORS_ALLOWED_ORIGIN: PAGES_ORIGIN,
  }), true);
});

test('production sales open on Oct 16 while the commission counter bootstrap stays gated until Oct 17 UTC', () => {
  assert.equal(isLamsaSalesCutoverReached(new Date('2026-10-15T23:59:59.999Z')), false);
  assert.equal(isLamsaSalesCutoverReached(new Date('2026-10-16T00:00:00.000Z')), true);
  assert.equal(isLamsaSalesCutoverReached(new Date(Number.NaN)), false);

  const env = {
    ENVIRONMENT: 'production',
    SALE_WORKER_PRODUCTION_ENABLED: 'true',
    FIRESTORE_PRODUCTION_TRANSPORT_ENABLED: 'true',
    CORS_ALLOWED_ORIGIN: PAGES_ORIGIN,
    PROJECT_ID: 'gen-lang-client-0515786951',
    FIRESTORE_DATABASE_ID: 'ai-studio-remixremixremixr-0f36aa66-a2c8-4d8a-bad2-ea0f72310677',
    GCP_SERVICE_ACCOUNT_EMAIL: 'firestore-store-worker@gen-lang-client-0515786951.iam.gserviceaccount.com',
    GCP_SERVICE_ACCOUNT_PRIVATE_KEY: '-----BEGIN PRIVATE KEY-----\\ntest\\n-----END PRIVATE KEY-----',
  };
  const saleRequest = new Request('https://worker.test/api/lamsa/sales/quote', {
    method: 'POST', headers: { origin: PAGES_ORIGIN },
  });
  assert.throws(
    () => assertLamsaRequestAllowed(saleRequest, env, new Date('2026-10-15T23:59:59.999Z')),
    (error) => error.code === 'sale/cutover-not-started',
  );
  assert.doesNotThrow(() => assertLamsaRequestAllowed(saleRequest, env, new Date('2026-10-16T00:00:00.000Z')));

  const bootstrapRequest = new Request('https://worker.test/api/lamsa/commission-counter/bootstrap', {
    method: 'POST', headers: { origin: PAGES_ORIGIN },
  });
  assert.throws(
    () => assertLamsaCommissionCounterBootstrapAllowed(bootstrapRequest, env, new Date('2026-10-16T23:59:59.999Z')),
    (error) => error.code === 'sale/commission-counter-bootstrap-not-started',
  );
  assert.doesNotThrow(() => assertLamsaCommissionCounterBootstrapAllowed(
    bootstrapRequest, env, new Date('2026-10-17T00:00:00.000Z'),
  ));
});

test('production CORS allows only the verified GitHub Pages origin, with no wildcard or path', () => {
  const env = {
    ENVIRONMENT: 'production',
    SALE_WORKER_PRODUCTION_ENABLED: 'true',
    FIRESTORE_PRODUCTION_TRANSPORT_ENABLED: 'true',
    CORS_ALLOWED_ORIGIN: PAGES_ORIGIN,
  };
  assert.equal(isExactHttpsOrigin(PAGES_ORIGIN), true);
  assert.equal(resolveLamsaCorsOrigin(env, PAGES_ORIGIN), PAGES_ORIGIN);
  assert.equal(resolveLamsaCorsOrigin(env, 'https://evil.example'), null);
  assert.equal(resolveLamsaCorsOrigin(env, 'https://mohmhran5-jpg.github.io.evil.example'), null);
  assert.equal(resolveLamsaCorsOrigin(env, undefined), null);
  for (const invalid of [
    '*',
    `${PAGES_ORIGIN}/`,
    `${PAGES_ORIGIN}/lamsa-perfume-pos-ai-studio/`,
    `${PAGES_ORIGIN},https://evil.example`,
    'http://mohmhran5-jpg.github.io',
    'https://user@mohmhran5-jpg.github.io',
  ]) assert.equal(isExactHttpsOrigin(invalid), false, invalid);
  assert.equal(resolveLamsaCorsOrigin({ ...env, CORS_ALLOWED_ORIGIN: '*' }, PAGES_ORIGIN), null);
  assert.equal(isAllowedLamsaRequestOrigin(env, PAGES_ORIGIN), true);
  assert.equal(isAllowedLamsaRequestOrigin(env, 'https://evil.example'), false);
});

test('local emulator permits only its local browser origins and never the live Pages origin', () => {
  const env = { ENVIRONMENT: 'local-emulator' };
  assert.equal(resolveLamsaCorsOrigin(env, 'http://localhost:3000'), 'http://localhost:3000');
  assert.equal(resolveLamsaCorsOrigin(env, 'http://127.0.0.1:3000'), 'http://127.0.0.1:3000');
  assert.equal(resolveLamsaCorsOrigin(env, PAGES_ORIGIN), null);
  assert.equal(isAllowedLamsaRequestOrigin(env, undefined), true);
  assert.equal(isAllowedLamsaRequestOrigin(env, 'https://evil.example'), false);
});

test('checked-in Wrangler config pins the app project/database and keeps both production gates closed', async () => {
  const wrangler = await readFile(new URL('../wrangler.toml', import.meta.url), 'utf8');
  assert.match(wrangler, /ENVIRONMENT = "local-emulator"/);
  assert.match(wrangler, /CORS_ALLOWED_ORIGIN = "https:\/\/mohmhran5-jpg\.github\.io"/);
  assert.match(wrangler, /\[env\.production\]/);
  const productionVars = wrangler.split('[env.production.vars]')[1] || '';
  assert.match(productionVars, /ENVIRONMENT = "production"/);
  assert.match(productionVars, /PROJECT_ID = "gen-lang-client-0515786951"/);
  assert.match(productionVars, /FIRESTORE_DATABASE_ID = "ai-studio-remixremixremixr-0f36aa66-a2c8-4d8a-bad2-ea0f72310677"/);
  assert.match(productionVars, /GCP_SERVICE_ACCOUNT_EMAIL = "firestore-store-worker@gen-lang-client-0515786951\.iam\.gserviceaccount\.com"/);
  assert.match(productionVars, /OWNER_EMAIL = "moh\.mhran@gmail\.com"/);
  assert.match(productionVars, /FIRESTORE_PRODUCTION_TRANSPORT_ENABLED = "false"/);
  assert.match(productionVars, /SALE_WORKER_PRODUCTION_ENABLED = "false"/);
  assert.match(productionVars, /SERVER_TIME_ENDPOINT_ENABLED = "false"/);
  assert.doesNotMatch(wrangler, /^\s*GCP_SERVICE_ACCOUNT_PRIVATE_KEY\s*=/m);
  assert.doesNotMatch(wrangler, /-----BEGIN PRIVATE KEY-----/);
});
