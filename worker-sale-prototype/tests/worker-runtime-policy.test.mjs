import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import {
  isAllowedLamsaRequestOrigin,
  isExactHttpsOrigin,
  isProductionLamsaRouteEnabled,
  resolveLamsaCorsOrigin,
} from '../src/workerRuntimePolicy.mjs';

const PAGES_ORIGIN = 'https://mohmhran5-jpg.github.io';

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
  assert.doesNotMatch(wrangler, /^\s*GCP_SERVICE_ACCOUNT_PRIVATE_KEY\s*=/m);
  assert.doesNotMatch(wrangler, /-----BEGIN PRIVATE KEY-----/);
});
