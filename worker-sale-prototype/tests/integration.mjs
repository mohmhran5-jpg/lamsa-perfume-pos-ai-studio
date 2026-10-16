import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { initializeTestEnvironment } from '@firebase/rules-unit-testing';
import { collection, doc, getDoc, getDocs, onSnapshot, setDoc } from 'firebase/firestore';
import { runLamsaIntegrationTests } from './lamsa-integration.mjs';
import { clearEmulator, databaseId, projectId, seedEmulator } from '../scripts/fixtures.mjs';

const workerUrl = 'http://127.0.0.1:8787';
const fsRoot = `http://127.0.0.1:8080/v1/projects/${projectId}/databases/${encodeURIComponent(databaseId)}/documents`;
const adminHeaders = { authorization: 'Bearer owner' };
let passed = 0;
let failed = 0;
const failures = [];

function decodeValue(value) {
  if (!value || typeof value !== 'object') return undefined;
  if ('nullValue' in value) return null;
  if ('booleanValue' in value) return value.booleanValue;
  if ('integerValue' in value) return Number(value.integerValue);
  if ('doubleValue' in value) return Number(value.doubleValue);
  if ('stringValue' in value) return value.stringValue;
  if ('arrayValue' in value) return (value.arrayValue.values || []).map(decodeValue);
  if ('mapValue' in value) return decodeFields(value.mapValue.fields || {});
  return undefined;
}
function decodeFields(fields = {}) {
  return Object.fromEntries(Object.entries(fields).map(([key, value]) => [key, decodeValue(value)]));
}

async function restDoc(path) {
  const response = await fetch(`${fsRoot}/${path.split('/').map(encodeURIComponent).join('/')}`, { headers: adminHeaders });
  if (response.status === 404) return null;
  if (!response.ok) throw new Error(`REST read ${path} failed (${response.status}): ${await response.text()}`);
  const body = await response.json();
  return decodeFields(body.fields || {});
}

async function callSale(token, body) {
  const response = await fetch(`${workerUrl}/api/sales`, {
    method: 'POST',
    headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
  return { status: response.status, body: await response.json() };
}

async function callLamsaSale(token, body) {
  const response = await fetch(`${workerUrl}/api/lamsa/sales`, {
    method: 'POST',
    headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
  return { status: response.status, body: await response.json() };
}

function lamsaIntent(saleId, line, overrides = {}) {
  return {
    schema: 'lamsa.sale-intent/v2',
    saleId,
    lines: [line],
    manualDiscountEgp: 0,
    previewTotalPriceEgp: line.requestedUnitPriceEgp * line.quantity,
    previewTotalCostEgp: line.previewUnitCostEgp * line.quantity,
    previewTotalProfitEgp: 0,
    previewCommissionEgp: 0,
    loyaltyPointsToRedeem: 0,
    paymentMethod: 'نقدي',
    packagingPaid: false,
    ...overrides,
  };
}

function lamsaLine({ lineId = 'line-1', productId = 'lamsa-normal', bottleSizeId = 'bottle-50-spray', bottleSizeMl = 50,
  quantity = 1, essenceGramsPerBottle = 15, requestedUnitPriceEgp = 300, previewUnitCostEgp = 70,
  isColoredBottle = false } = {}) {
  return { lineId, productId, bottleSizeId, bottleSizeMl, quantity, essenceGramsPerBottle,
    isColoredBottle, requestedUnitPriceEgp, previewUnitCostEgp };
}

async function test(name, fn) {
  try {
    await fn();
    passed += 1;
    console.log(`PASS ${name}`);
  } catch (error) {
    failed += 1;
    failures.push({ name, error });
    console.error(`FAIL ${name}: ${error?.stack || error}`);
  }
}

function waitForSnapshot(db, reference, predicate, label, timeoutMs = 8000) {
  return new Promise((resolve, reject) => {
    let unsubscribe = () => {};
    const timer = setTimeout(() => {
      unsubscribe();
      reject(new Error(`Timed out waiting for ${label}`));
    }, timeoutMs);
    unsubscribe = onSnapshot(reference, (snapshot) => {
      const value = snapshot.exists() ? snapshot.data() : null;
      if (predicate(value)) {
        clearTimeout(timer);
        unsubscribe();
        resolve(value);
      }
    }, (error) => {
      clearTimeout(timer);
      unsubscribe();
      reject(error);
    });
  });
}

export async function runIntegrationTests({ mintToken, getCertificateRequestCount = () => 0 }) {
  const rules = readFileSync(new URL('../firestore.rules', import.meta.url), 'utf8');
  const testEnv = await initializeTestEnvironment({
    projectId: 'demo-worker-sale',
    firestore: { host: '127.0.0.1', port: 8080, rules },
  });
  const ownerDb = testEnv.authenticatedContext('owner-uid', {
    email: 'owner@example.test', email_verified: true, firebase: { sign_in_provider: 'google.com' },
  }).firestore();
  const sellerDb = testEnv.authenticatedContext('seller-uid', {
    email: 'seller@example.test', email_verified: true, firebase: { sign_in_provider: 'google.com' },
  }).firestore();
  const viewerDb = testEnv.authenticatedContext('viewer-uid', {
    email: 'viewer@example.test', email_verified: true, firebase: { sign_in_provider: 'google.com' },
  }).firestore();
  const managerDb = testEnv.authenticatedContext('manager-uid', {
    email: 'manager@example.test', email_verified: true, firebase: { sign_in_provider: 'google.com' },
  }).firestore();

  const sellerToken = await mintToken('seller@example.test');
  const managerToken = await mintToken('manager@example.test');
  const ownerToken = await mintToken('owner@example.test');

  await test('Firebase X.509 certificates are fetched from the local mock and cached by Cache-Control', async () => {
    const initialRequests = getCertificateRequestCount();
    const first = await callSale(await mintToken('cache-first@example.test', { provider: 'password' }), {
      saleId: 'auth-cache-first', items: [{ productId: 'retail-1', quantity: 1 }],
    });
    const second = await callSale(await mintToken('cache-second@example.test', { provider: 'password' }), {
      saleId: 'auth-cache-second', items: [{ productId: 'retail-1', quantity: 1 }],
    });
    assert.equal(first.status, 401);
    assert.equal(second.status, 401);
    assert.equal(getCertificateRequestCount() - initialRequests, 1);
  });

  await test('unknown Firebase key IDs trigger one rate-limited certificate refresh and remain rejected', async () => {
    const initialRequests = getCertificateRequestCount();
    const unknownKid = await mintToken('unknown-kid@example.test', { kid: 'not-in-certificate-map' });
    const first = await callSale(unknownKid, { saleId: 'auth-unknown-kid-1', items: [] });
    const second = await callSale(unknownKid, { saleId: 'auth-unknown-kid-2', items: [] });
    assert.equal(first.status, 401);
    assert.equal(second.status, 401);
    assert.equal(getCertificateRequestCount() - initialRequests, 1);
  });

  await test('SAFETY GATE: legacy /api/sales route explicitly rejects lamsa.sale-intent/v1 instead of guessing its schema', async () => {
    const intent = {
      schema: 'lamsa.sale-intent/v1',
      saleId: 'contract-gate-001',
      lines: [{
        lineId: 'line-1', productId: 'retail-1', bottleSizeId: 'b-50',
        bottleSizeMl: 50, quantity: 1, essenceGramsPerBottle: 15,
        isColoredBottle: false,
      }],
      manualDiscountEgp: 0,
      loyaltyPointsToRedeem: 0,
      paymentMethod: 'نقدي',
      packagingPaid: false,
    };
    const before = await restDoc('tarek_products/retail-1');
    const result = await callSale(sellerToken, intent);
    // Typed Lamsa intents belong to /api/lamsa/sales; never guess their shape on the legacy route.
    assert.equal(result.status, 409);
    assert.equal(result.body.error, 'sale/unsupported-contract');
    assert.equal(await restDoc('sales/contract-gate-001'), null);
    assert.equal(await restDoc('tarek_products/retail-1'), before);
  });

  await runLamsaIntegrationTests({ sellerToken, ownerToken, managerToken });

  // Lamsa POS writes to the repository's real vault IDs; reset between suites so
  // legacy prototype assertions start from their own clean emulator fixtures.
  await testEnv.clearFirestore();
  await clearEmulator();
  await seedEmulator();

  await test('auth rejects missing, forged, unverified, wrong-provider and wrong-audience tokens', async () => {
    const missing = await fetch(`${workerUrl}/api/sales`, { method: 'POST', body: '{}' });
    assert.equal(missing.status, 401);
    const unverified = await callSale(await mintToken('seller@example.test', { verified: false }), { saleId: 'auth-unverified', items: [{ productId: 'retail-1' }] });
    assert.equal(unverified.status, 401);
    const wrongProvider = await callSale(await mintToken('seller@example.test', { provider: 'password' }), { saleId: 'auth-provider', items: [{ productId: 'retail-1' }] });
    assert.equal(wrongProvider.status, 401);
    const wrongAudience = await callSale(await mintToken('seller@example.test', { audience: 'other-project' }), { saleId: 'auth-audience', items: [{ productId: 'retail-1' }] });
    assert.equal(wrongAudience.status, 401);
    const wrongIssuer = await callSale(await mintToken('seller@example.test', { issuer: 'https://securetoken.google.com/other-project' }), { saleId: 'auth-issuer', items: [{ productId: 'retail-1' }] });
    assert.equal(wrongIssuer.status, 401);
    const nowSeconds = Math.floor(Date.now() / 1000);
    const missingAuthTime = await callSale(await mintToken('seller@example.test', { omitAuthTime: true }), { saleId: 'auth-no-auth-time', items: [{ productId: 'retail-1' }] });
    assert.equal(missingAuthTime.status, 401);
    const futureAuthTime = await callSale(await mintToken('seller@example.test', { authTime: nowSeconds + 60 }), { saleId: 'auth-future-auth-time', items: [{ productId: 'retail-1' }] });
    assert.equal(futureAuthTime.status, 401);
    const futureIssuedAt = await callSale(await mintToken('seller@example.test', { issuedAt: nowSeconds + 60 }), { saleId: 'auth-future-iat', items: [{ productId: 'retail-1' }] });
    assert.equal(futureIssuedAt.status, 401);
    const expired = await callSale(await mintToken('seller@example.test', { expiration: nowSeconds - 30 }), { saleId: 'auth-expired', items: [{ productId: 'retail-1' }] });
    assert.equal(expired.status, 401);
    const signed = await mintToken('seller@example.test');
    const [header, payload] = signed.split('.');
    const forged = await callSale(`${header}.${payload}.${Buffer.alloc(256).toString('base64url')}`, { saleId: 'auth-forged-signature', items: [{ productId: 'retail-1' }] });
    assert.equal(forged.status, 401);
  });

  await test('request bounds reject path traversal, oversized requests and more than 100 lines', async () => {
    const slashId = await callSale(sellerToken, {
      saleId: 'sale-badpath-001', items: [{ productId: 'products/retail-1', quantity: 1 }],
    });
    assert.equal(slashId.status, 400);
    assert.equal(slashId.body.error, 'sale/invalid-product-id');
    const tooMany = await callSale(sellerToken, {
      saleId: 'sale-toomany-001', items: Array.from({ length: 101 }, () => ({ productId: 'retail-1' })),
    });
    assert.equal(tooMany.status, 400);
    assert.equal(tooMany.body.error, 'sale/invalid-item-count');
    const largeBody = JSON.stringify({ saleId: 'sale-toolarge-001', items: [{ productId: 'retail-1' }], padding: 'x'.repeat(270_000) });
    const tooLarge = await fetch(`${workerUrl}/api/sales`, {
      method: 'POST', headers: { authorization: `Bearer ${sellerToken}`, 'content-type': 'application/json' }, body: largeBody,
    });
    assert.equal(tooLarge.status, 413);
  });

  await test('dynamic email grants authorize SALES_OPERATOR and deny viewer, manager, inactive and ungranted users', async () => {
    const allowed = await callSale(sellerToken, { saleId: 'role-allow-001', items: [{ productId: 'role-product', quantity: 1 }] });
    assert.equal(allowed.status, 200, JSON.stringify(allowed.body));
    for (const [email, id] of [
      ['viewer@example.test', 'role-view-001'],
      ['manager@example.test', 'role-manager-001'],
      ['inactive@example.test', 'role-inactive-001'],
      ['nobody@example.test', 'role-none-001'],
    ]) {
      const result = await callSale(await mintToken(email), { saleId: id, items: [{ productId: 'role-product', quantity: 1 }] });
      assert.equal(result.status, 403, `${email}: ${JSON.stringify(result.body)}`);
    }
    const after = await restDoc('inventory_stock/role-product');
    assert.equal(after.stock_grams, 495);
  });

  await test('server price/cost override client claims and apply product, promotion, manual discount and loyalty from trusted docs', async () => {
    const body = {
      saleId: 'sale-mix-loyalty-001',
      items: [
        { productId: 'retail-1', quantity: 2, sellingPriceEgp: 0.01, costEgp: 99999, profitEgp: 99999 },
        { mixId: 'mix-small', quantity: 1, sellingPriceEgp: 1, totalCostEgp: 0 },
      ],
      promotionId: 'promo10',
      manualDiscountEgp: 5,
      customerId: 'customer-1',
      loyaltyPointsToRedeem: 50,
      paymentMethod: 'cash',
      totalPriceEgp: 0,
      totalCostEgp: 0,
      totalProfitEgp: 999999,
      commissionEgp: 0,
    };
    const result = await callSale(sellerToken, body);
    assert.equal(result.status, 200, JSON.stringify(result.body));
    assert.equal(result.body.sale.totalPriceEgp, 470);
    assert.equal(result.body.sale.items[0].sellingPriceEgp, 200);
    assert.equal(result.body.sale.items[0].operationalCostEgp, 26);
    assert.equal('totalCostEgp' in result.body.sale, false);
    assert.equal('totalProfitEgp' in result.body.sale, false);
    assert.equal('commissionEgp' in result.body.sale, false);

    const stored = await restDoc('sales/sale-mix-loyalty-001');
    assert.equal(stored.subtotalEgp, 500);
    assert.equal(stored.totalCostEgp, 36, JSON.stringify(stored.items));
    assert.equal(stored.commissionEgp, 23.5);
    assert.equal(stored.totalProfitEgp, 410.5);
    assert.equal(stored.promotionDiscountEgp, 20);
    assert.equal(stored.loyaltyDiscountEgp, 5);
    assert.equal((await restDoc('customers/customer-1')).points, 997);
    assert.equal((await restDoc('inventory_stock/retail-1')).stock_grams, 1990);
    assert.equal((await restDoc('inventory_stock/mix-a')).stock_grams, 1998);
    assert.equal((await restDoc('inventory_stock/mix-b')).stock_grams, 1999);
    assert.equal((await restDoc('vaults/restock')).currentBalance, 41);
    assert.equal((await restDoc('vaults/commissions')).currentBalance, 24.5);
    assert.equal((await restDoc('vaults/owner_profit')).currentBalance, 424.5);
    assert.equal((await restDoc('mixes/mix-small')).timesSold, 1);
  });

  await test('owner receives finance fields while the sales operator response remains redacted', async () => {
    const result = await callSale(ownerToken, { saleId: 'sale-owner-details-001', items: [{ productId: 'owner-product', quantity: 1 }] });
    assert.equal(result.status, 200, JSON.stringify(result.body));
    assert.equal(result.body.sale.totalCostEgp, 5);
    assert.equal(result.body.sale.commissionEgp, 5);
    assert.equal(result.body.sale.totalProfitEgp, 90);
  });

  await test('emulator grant is read from the named database and accepts only the granted verified email', async () => {
    const email = 'fresh-worker@example.test';
    const grant = await fetch(`${fsRoot}/role_assignments/${encodeURIComponent(email)}`, {
      method: 'PATCH',
      headers: { ...adminHeaders, 'content-type': 'application/json' },
      body: JSON.stringify({ fields: {
        email: { stringValue: email },
        role: { stringValue: 'SALES_OPERATOR' },
        active: { booleanValue: true },
      } }),
    });
    assert.equal(grant.ok, true, await grant.text());
    const result = await callSale(await mintToken(email), {
      saleId: 'sale-new-grant-001', items: [{ productId: 'new-grant-product', quantity: 1 }],
    });
    assert.equal(result.status, 200, JSON.stringify(result.body));
    assert.equal(result.body.sale.totalPriceEgp, 100);
    assert.equal((await restDoc(`role_assignments/${email}`)).active, true);
  });

  await test('discount limits reject unsafe discounts without changing stock, sale, customer or vaults', async () => {
    const beforeStock = (await restDoc('inventory_stock/discount-test')).stock_grams;
    const beforeVault = (await restDoc('vaults/restock')).currentBalance;
    const result = await callSale(sellerToken, {
      saleId: 'sale-discount-reject-001',
      items: [{ productId: 'discount-test', quantity: 1 }],
      manualDiscountEgp: 999,
    });
    assert.equal(result.status, 409);
    assert.equal(result.body.error, 'sale/manual-discount-over-limit');
    assert.equal(await restDoc('sales/sale-discount-reject-001'), null);
    assert.equal((await restDoc('inventory_stock/discount-test')).stock_grams, beforeStock);
    assert.equal((await restDoc('vaults/restock')).currentBalance, beforeVault);
  });

  await test('idempotency retry writes once; same key with different intent is rejected', async () => {
    const payload = { saleId: 'sale-idempotent-001', items: [{ productId: 'idempotent-product', quantity: 1 }] };
    const first = await callSale(sellerToken, payload);
    assert.equal(first.status, 200, JSON.stringify(first.body));
    const stockAfterFirst = (await restDoc('inventory_stock/idempotent-product')).stock_grams;
    const retry = await callSale(sellerToken, { ...payload, totalPriceEgp: 0.01, items: [{ ...payload.items[0], costEgp: 0, sellingPriceEgp: 0.01 }] });
    assert.equal(retry.status, 200, JSON.stringify(retry.body));
    assert.equal(retry.body.status, 'already-committed');
    assert.equal((await restDoc('inventory_stock/idempotent-product')).stock_grams, stockAfterFirst);
    const conflict = await callSale(sellerToken, { ...payload, items: [{ productId: 'idempotent-product', quantity: 2 }] });
    assert.equal(conflict.status, 409);
    assert.equal(conflict.body.error, 'sale/idempotency-conflict');
    assert.equal((await restDoc('inventory_stock/idempotent-product')).stock_grams, stockAfterFirst);
  });

  await test('insufficient inventory rejects before any sale, loyalty or financial write', async () => {
    const result = await callSale(sellerToken, { saleId: 'sale-stock-reject-001', items: [{ productId: 'low-stock', quantity: 1 }] });
    assert.equal(result.status, 409);
    assert.equal(result.body.error, 'sale/insufficient-stock');
    assert.equal(await restDoc('sales/sale-stock-reject-001'), null);
    assert.equal((await restDoc('inventory_stock/low-stock')).stock_grams, 3);
  });

  await test('owner and seller racing for final stock serialize; no oversell and no split inventory source', async () => {
    const ownerSale = callSale(ownerToken, { saleId: 'sale-race-owner-001', items: [{ productId: 'last-stock', quantity: 1 }] });
    const sellerSale = callSale(sellerToken, { saleId: 'sale-race-seller-001', items: [{ productId: 'last-stock', quantity: 1 }] });
    const results = await Promise.all([ownerSale, sellerSale]);
    assert.equal(results.filter((result) => result.status === 200).length, 1, JSON.stringify(results));
    assert.equal(results.filter((result) => result.status === 409 && result.body.error === 'sale/insufficient-stock').length, 1, JSON.stringify(results));
    assert.equal((await restDoc('inventory_stock/last-stock')).stock_grams, 0);
    const saleA = await restDoc('sales/sale-race-owner-001');
    const saleB = await restDoc('sales/sale-race-seller-001');
    assert.equal(Number(Boolean(saleA)) + Number(Boolean(saleB)), 1);
  });

  await test('100 sale lines and 400 authoritative mix components commit together', async () => {
    const items = Array.from({ length: 100 }, (_, index) => ({ mixId: `mix-${String(index).padStart(3, '0')}`, quantity: 1 }));
    const result = await callSale(sellerToken, { saleId: 'sale-max-cart-001', items });
    assert.equal(result.status, 200, JSON.stringify(result.body));
    const sale = await restDoc('sales/sale-max-cart-001');
    assert.equal(sale.items.length, 100);
    assert.equal(Object.keys(sale.stockDeductions).length, 400);
    assert.equal(Object.values(sale.stockDeductions).reduce((sum, grams) => sum + grams, 0), 400);
    assert.equal((await restDoc('inventory_stock/max-p-000')).stock_grams, 99);
    assert.equal((await restDoc('inventory_stock/max-p-399')).stock_grams, 99);
    assert.equal((await restDoc('mixes/mix-099')).timesSold, 1);
  });

  await test('Firestore onSnapshot synchronizes clients and rules block seller financial reads/writes', async () => {
    const ownerStock = waitForSnapshot(ownerDb, doc(ownerDb, 'inventory_stock', 'realtime-1'), (data) => data?.stock_grams === 495, 'owner stock snapshot');
    const sellerStock = waitForSnapshot(sellerDb, doc(sellerDb, 'inventory_stock', 'realtime-1'), (data) => data?.stock_grams === 495, 'seller stock snapshot');
    const ownerSale = waitForSnapshot(ownerDb, doc(ownerDb, 'sales', 'sale-realtime-001'), (data) => data?.id === 'sale-realtime-001', 'owner sale snapshot');
    await testEnv.withSecurityRulesDisabled(async (context) => {
      const adminDb = context.firestore();
      await setDoc(doc(adminDb, 'inventory_stock', 'realtime-1'), { stock_grams: 495 }, { merge: true });
      await setDoc(doc(adminDb, 'sales', 'sale-realtime-001'), { id: 'sale-realtime-001', totalPrice: 100 });
    });
    await Promise.all([ownerStock, sellerStock, ownerSale]);
    assert.equal((await getDoc(doc(sellerDb, 'sales_catalog', 'realtime-1'))).exists(), true);
    await assert.rejects(getDoc(doc(sellerDb, 'products', 'realtime-1')), (error) => error.code === 'permission-denied');
    await assert.rejects(getDoc(doc(sellerDb, 'sales', 'sale-realtime-001')), (error) => error.code === 'permission-denied');
    await assert.rejects(setDoc(doc(sellerDb, 'sales', 'client-forged-sale'), { totalPriceEgp: 0 }), (error) => error.code === 'permission-denied');
    assert.equal((await getDoc(doc(ownerDb, 'products', 'realtime-1'))).exists(), true);
    assert.equal((await getDocs(collection(viewerDb, 'inventory_stock'))).empty, false);
    await assert.rejects(getDoc(doc(viewerDb, 'sales_catalog', 'realtime-1')), (error) => error.code === 'permission-denied');
    assert.equal((await getDoc(doc(managerDb, 'sales_catalog', 'realtime-1'))).exists(), true);
  });

  await testEnv.cleanup();
  console.log(`\nRESULT ${passed} passed, ${failed} failed`);
  if (failures.length) throw new Error(`${failures.length} prototype test(s) failed`);
}
