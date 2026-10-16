import assert from 'node:assert/strict';
import { generateKeyPairSync } from 'node:crypto';
import { jwtVerify } from 'jose';
import { databaseId, projectId } from '../scripts/fixtures.mjs';
import { createGoogleServiceAccountTokenProvider, FIRESTORE_DATASTORE_SCOPE, GOOGLE_OAUTH_TOKEN_URL } from '../src/googleServiceAccountAuth.mjs';
import { createFirestoreTransport } from '../src/index.mjs';
import { handleLamsaSale, handleLamsaSaleQuote } from '../src/lamsaSaleWorker.mjs';
import {
  LOCAL_LAMSA_SALE_ENDPOINT,
  quoteTarekSaleToWorker,
  resolveTarekSaleWorkerEndpoint,
  submitTarekSaleIntentToWorker,
} from '../../services/workerSaleClient.ts';
import { enqueueTarekSale, flushTarekSaleOutbox, getTarekSaleOutbox } from '../../services/tarekSaleOutbox.ts';
import {
  PRODUCTION_FIRESTORE_DATABASE_ID,
  PRODUCTION_FIRESTORE_PROJECT_ID,
  PRODUCTION_FIRESTORE_SERVICE_ACCOUNT,
} from '../src/productionConfig.mjs';

const workerUrl = 'http://127.0.0.1:8787';
const fsRoot = `http://127.0.0.1:8080/v1/projects/${projectId}/databases/${encodeURIComponent(databaseId)}/documents`;
const adminHeaders = { authorization: 'Bearer owner' };
let passed = 0;
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
function encodeValue(value) {
  if (value === null) return { nullValue: null };
  if (typeof value === 'boolean') return { booleanValue: value };
  if (typeof value === 'number') return Number.isSafeInteger(value)
    ? { integerValue: String(value) } : { doubleValue: value };
  if (typeof value === 'string') return { stringValue: value };
  if (Array.isArray(value)) return { arrayValue: { values: value.map(encodeValue) } };
  if (value && typeof value === 'object') return { mapValue: { fields: encodeFields(value) } };
  throw new Error('unsupported local emulator field');
}
function encodeFields(fields) {
  return Object.fromEntries(Object.entries(fields).map(([key, value]) => [key, encodeValue(value)]));
}
async function restDoc(path) {
  const response = await fetch(`${fsRoot}/${path.split('/').map(encodeURIComponent).join('/')}`, { headers: adminHeaders });
  if (response.status === 404) return null;
  if (!response.ok) throw new Error(`REST read ${path} failed (${response.status}): ${await response.text()}`);
  return decodeFields((await response.json()).fields || {});
}
async function restCollection(collectionId) {
  const response = await fetch(`${fsRoot}/${encodeURIComponent(collectionId)}?pageSize=1000`, { headers: adminHeaders });
  if (!response.ok) throw new Error(`REST list ${collectionId} failed (${response.status}): ${await response.text()}`);
  return (await response.json()).documents || [];
}
async function restSet(path, data) {
  const response = await fetch(`${fsRoot}/${path.split('/').map(encodeURIComponent).join('/')}`, {
    method: 'PATCH',
    headers: { ...adminHeaders, 'content-type': 'application/json' },
    body: JSON.stringify({ fields: encodeFields(data) }),
  });
  if (!response.ok) throw new Error(`REST write ${path} failed (${response.status}): ${await response.text()}`);
}
async function call(token, body) {
  const response = await fetch(`${workerUrl}/api/lamsa/sales`, {
    method: 'POST', headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
  return { status: response.status, body: await response.json() };
}
async function callQuote(token, body) {
  const response = await fetch(`${workerUrl}/api/lamsa/sales/quote`, {
    method: 'POST', headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
  return { status: response.status, body: await response.json() };
}
async function callReverse(token, saleId, body) {
  const response = await fetch(`${workerUrl}/api/lamsa/sales/${encodeURIComponent(saleId)}/reverse`, {
    method: 'POST', headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
  return { status: response.status, body: await response.json() };
}
async function callCounterBootstrap(token) {
  const response = await fetch(`${workerUrl}/api/lamsa/commission-counter/bootstrap`, {
    method: 'POST', headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' }, body: '{}',
  });
  return { status: response.status, body: await response.json() };
}
function line({ lineId = 'line-1', productId = 'lamsa-normal', bottleSizeId = 'bottle-50-spray', bottleSizeMl = 50,
  quantity = 1, essenceGramsPerBottle = 15, requestedUnitPriceEgp = 300, previewUnitCostEgp = 70 } = {}) {
  return { lineId, productId, bottleSizeId, bottleSizeMl, quantity, essenceGramsPerBottle,
    isColoredBottle: false, requestedUnitPriceEgp, previewUnitCostEgp };
}
function intent(saleId, saleLine, overrides = {}) {
  return {
    schema: 'lamsa.sale-intent/v2', saleId, lines: [saleLine], manualDiscountEgp: 0,
    previewTotalPriceEgp: saleLine.requestedUnitPriceEgp * saleLine.quantity,
    previewTotalCostEgp: saleLine.previewUnitCostEgp * saleLine.quantity,
    previewTotalProfitEgp: 0, previewCommissionEgp: 0,
    loyaltyPointsToRedeem: 0, paymentMethod: 'نقدي', packagingPaid: false,
    ...overrides,
  };
}
function operatorV3(legacyIntent) {
  const safeLine = (line) => ({
    lineId: line.lineId,
    ...(line.productId ? { productId: line.productId } : {}),
    bottleSizeId: line.bottleSizeId,
    bottleSizeMl: line.bottleSizeMl,
    quantity: line.quantity,
    essenceGramsPerBottle: line.essenceGramsPerBottle,
    isColoredBottle: line.isColoredBottle,
    ...(line.customFormulaName ? { customFormulaName: line.customFormulaName } : {}),
    ...(line.promotionId ? { promotionId: line.promotionId } : {}),
    ...(line.mixComponents ? { mixComponents: line.mixComponents.map(({ productId, gramsPerBottle }) => ({ productId, gramsPerBottle })) } : {}),
  });
  return {
    schema: 'lamsa.sale-intent/v3',
    saleId: legacyIntent.saleId,
    quoteId: `quote-${legacyIntent.saleId}`,
    lines: legacyIntent.lines.map(safeLine),
    manualDiscountEgp: legacyIntent.manualDiscountEgp,
    ...(legacyIntent.promotionId ? { promotionId: legacyIntent.promotionId } : {}),
    ...(legacyIntent.customerName ? { customerName: legacyIntent.customerName } : {}),
    ...(legacyIntent.customerPhone ? { customerPhone: legacyIntent.customerPhone } : {}),
    paymentMethod: legacyIntent.paymentMethod,
    ...(legacyIntent.packagingOptionId ? { packagingOptionId: legacyIntent.packagingOptionId } : {}),
    packagingPaid: legacyIntent.packagingPaid,
  };
}
const quotedSaleIds = new Set();
let tarekTestTokens = new Set();
async function callOperator(token, body) {
  const intent = operatorV3(body);
  if (!quotedSaleIds.has(intent.saleId)) {
    const quote = await callQuote(token, intent);
    if (quote.status !== 200) return quote;
    if (tarekTestTokens.has(token)) assertNoTarekFinancialFields(quote.body.sale);
    quotedSaleIds.add(intent.saleId);
  }
  const committed = await call(token, intent);
  if (tarekTestTokens.has(token) && committed.status === 200) assertNoTarekFinancialFields(committed.body.sale);
  return committed;
}
async function check(name, fn) {
  try { await fn(); passed += 1; console.log(`PASS LAMSA ${name}`); }
  catch (error) { failures.push({ name, error }); console.error(`FAIL LAMSA ${name}: ${error?.stack || error}`); }
}

const TAREK_FORBIDDEN_RESPONSE_KEY = /(cost|profit|margin|commission|budget|financial|vault|expense|withdrawal|payroll|salary|capital|balance|settings)/i;
function assertNoTarekFinancialFields(value, path = 'sale') {
  if (!value || typeof value !== 'object') return;
  if (Array.isArray(value)) {
    value.forEach((item, index) => assertNoTarekFinancialFields(item, `${path}[${index}]`));
    return;
  }
  for (const [key, nested] of Object.entries(value)) {
    assert.equal(TAREK_FORBIDDEN_RESPONSE_KEY.test(key), false, `Tarek response leaked ${path}.${key}`);
    assertNoTarekFinancialFields(nested, `${path}.${key}`);
  }
}

async function runProductionTransportEmulatorTest() {
  const pair = generateKeyPairSync('rsa', { modulusLength: 2048 });
  const privateKey = pair.privateKey.export({ type: 'pkcs8', format: 'pem' }).toString();
  let oauthExchanges = 0;
  let firestoreRequests = 0;
  const tokenProvider = createGoogleServiceAccountTokenProvider({
    expectedServiceAccountEmail: PRODUCTION_FIRESTORE_SERVICE_ACCOUNT,
    fetchImpl: async (url, init) => {
      assert.equal(String(url), GOOGLE_OAUTH_TOKEN_URL, 'OAuth must be intercepted by the mock');
      assert.equal(init.redirect, 'manual');
      oauthExchanges += 1;
      const form = new URLSearchParams(init.body);
      const { payload } = await jwtVerify(form.get('assertion'), pair.publicKey, {
        algorithms: ['RS256'], audience: GOOGLE_OAUTH_TOKEN_URL,
      });
      assert.equal(payload.iss, PRODUCTION_FIRESTORE_SERVICE_ACCOUNT);
      assert.equal(payload.scope, FIRESTORE_DATASTORE_SCOPE);
      return new Response(JSON.stringify({ access_token: 'mock-production-access-token', token_type: 'Bearer', expires_in: 3600 }), {
        status: 200, headers: { 'content-type': 'application/json' },
      });
    },
  });
  const env = {
    ENVIRONMENT: 'production',
    PROJECT_ID: PRODUCTION_FIRESTORE_PROJECT_ID,
    FIRESTORE_DATABASE_ID: PRODUCTION_FIRESTORE_DATABASE_ID,
    GCP_SERVICE_ACCOUNT_EMAIL: PRODUCTION_FIRESTORE_SERVICE_ACCOUNT,
    GCP_SERVICE_ACCOUNT_PRIVATE_KEY: privateKey,
    FIRESTORE_PRODUCTION_TRANSPORT_ENABLED: 'true',
    OWNER_EMAIL: 'owner@example.test',
  };
  const productionResourcePrefix = `projects/${PRODUCTION_FIRESTORE_PROJECT_ID}/databases/${PRODUCTION_FIRESTORE_DATABASE_ID}/`;
  const emulatorResourcePrefix = `projects/${projectId}/databases/${databaseId}/`;
  const transport = createFirestoreTransport({
    tokenProvider,
    fetchImpl: async (url, init) => {
      const target = new URL(String(url));
      assert.equal(target.origin, 'https://firestore.googleapis.com', 'production REST call must use the pinned Google origin');
      assert.ok(target.pathname.includes(productionResourcePrefix), target.pathname);
      const headers = new Headers(init.headers);
      assert.equal(headers.get('authorization'), 'Bearer mock-production-access-token');
      headers.set('authorization', 'Bearer owner');
      const rewrite = (value) => typeof value === 'string' ? value.replaceAll(productionResourcePrefix, emulatorResourcePrefix)
        : Array.isArray(value) ? value.map(rewrite)
          : value && typeof value === 'object' ? Object.fromEntries(Object.entries(value).map(([key, item]) => [key, rewrite(item)]))
            : value;
      const body = init.body === undefined ? undefined : JSON.stringify(rewrite(JSON.parse(init.body)));
      target.protocol = 'http:';
      target.hostname = '127.0.0.1';
      target.port = '8080';
      target.pathname = target.pathname.replace(productionResourcePrefix, emulatorResourcePrefix);
      firestoreRequests += 1;
      return fetch(target.href, { ...init, headers, ...(body === undefined ? {} : { body }), redirect: 'manual' });
    },
  });
  const helpers = {
    ...transport,
    authenticate: async () => ({ uid: 'uid-seller@example.test', email: 'seller@example.test' }),
  };
  const sale = operatorV3(intent('lamsa-prodtransport-0001', line({ productId: 'lamsa-prodtransport' })));
  const stockBefore = (await restDoc('tarek_products/lamsa-prodtransport')).stock_grams;
  const makeRequest = (path) => new Request(`https://worker.test${path}`, {
    method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(sale),
  });

  const quoteResponse = await handleLamsaSaleQuote(makeRequest('/api/lamsa/sales/quote'), env, helpers);
  assert.equal(quoteResponse.status, 200, await quoteResponse.clone().text());
  const quoteBody = await quoteResponse.json();
  assert.equal(quoteBody.status, 'quoted');
  assert.equal(quoteBody.sale.totalPrice, 300);
  assertNoTarekFinancialFields(quoteBody.sale);
  assert.equal((await restDoc('tarek_products/lamsa-prodtransport')).stock_grams, stockBefore, 'quote must not change stock');

  const saleResponse = await handleLamsaSale(makeRequest('/api/lamsa/sales'), env, helpers);
  assert.equal(saleResponse.status, 200, await saleResponse.clone().text());
  const saleBody = await saleResponse.json();
  assert.equal(saleBody.sale.totalPrice, 300);
  assertNoTarekFinancialFields(saleBody.sale);
  assert.equal((await restDoc('tarek_products/lamsa-prodtransport')).stock_grams, stockBefore - 15);
  assert.equal((await restDoc('sale_operations/lamsa-prodtransport-0001')).totalPrice, 300);

  const retryResponse = await handleLamsaSale(makeRequest('/api/lamsa/sales'), env, helpers);
  assert.equal(retryResponse.status, 200, await retryResponse.clone().text());
  assert.equal((await retryResponse.json()).status, 'already-committed');
  assert.equal((await restDoc('tarek_products/lamsa-prodtransport')).stock_grams, stockBefore - 15, 'retry must not deduct stock twice');
  assert.equal(oauthExchanges, 1, 'mock OAuth token should be cached across the quote and sale');
  assert.ok(firestoreRequests >= 5 && firestoreRequests <= 8,
    `counter path should use bounded transaction REST calls without a daily history scan, got ${firestoreRequests}`);
}

export async function runLamsaIntegrationTests({ sellerToken, ownerToken, managerToken }) {
  tarekTestTokens = new Set([sellerToken, managerToken].filter(Boolean));
  quotedSaleIds.clear();
  await check('owner bootstrap scans legacy history once, de-duplicates projections, and excludes test data', async () => {
    const denied = await callCounterBootstrap(sellerToken);
    assert.equal(denied.status, 403, JSON.stringify(denied.body));
    const bootstrapped = await callCounterBootstrap(ownerToken);
    assert.equal(bootstrapped.status, 200, JSON.stringify(bootstrapped.body));
    assert.equal(bootstrapped.body.status, 'ready');
    assert.equal(bootstrapped.body.historyScanned, true);
    assert.equal(bootstrapped.body.sprayBottlesSold, 8);
    assert.equal(bootstrapped.body.historicalSaleIdsScanned, 2);
    const repeated = await callCounterBootstrap(ownerToken);
    assert.equal(repeated.status, 200, JSON.stringify(repeated.body));
    assert.equal(repeated.body.status, 'already-ready');
    assert.equal(repeated.body.historyScanned, false);
    assert.equal(repeated.body.sprayBottlesSold, 8);
  });

  await check('split Tarek catalogue is authoritative even when legacy product, bottle, and settings disagree', async () => {
    const product = await restDoc('products/lamsa-normal');
    const bottle = await restDoc('bottleSizes/bottle-50-spray');
    const settings = await restDoc('settings/store');
    await restSet('products/lamsa-normal', { ...product, type: 'عود', stock_grams: 0, customGramCostEgp: 999 });
    await restSet('bottleSizes/bottle-50-spray', { ...bottle, normalPrice: 999 });
    await restSet('settings/store', { ...settings, priceEssenceNormal: 999, commissionRate: 0.9 });
    try {
      const body = operatorV3(intent('lamsa-split-authority-001', line()));
      const quote = await callQuote(sellerToken, body);
      assert.equal(quote.status, 200, JSON.stringify(quote.body));
      assert.equal(quote.body.sale.totalPrice, 300);
      assert.equal(await restDoc('sales/lamsa-split-authority-001'), null);
      assert.equal((await restDoc('tarek_products/lamsa-normal')).stock_grams, 100);
    } finally {
      await restSet('products/lamsa-normal', product);
      await restSet('bottleSizes/bottle-50-spray', bottle);
      await restSet('settings/store', settings);
    }
  });

  await check('server quote has no side effects and stale prices are rejected before commit', async () => {
    const body = operatorV3(intent('lamsa-quote-stale-0001', line()));
    const stockBefore = (await restDoc('tarek_products/lamsa-normal')).stock_grams;
    const restockBefore = (await restDoc('vaults/restock')).currentBalance;
    const quote = await callQuote(sellerToken, body);
    assert.equal(quote.status, 200, JSON.stringify(quote.body));
    assert.equal(quote.body.status, 'quoted');
    assert.equal(quote.body.quoteId, body.quoteId);
    assert.equal(quote.body.sale.totalPrice, 300);
    for (const field of ['totalCost', 'totalCostEgp', 'totalProfit', 'commissionAmount', 'totalCommission']) {
      assert.equal(field in quote.body.sale, false, `quote leaked ${field}`);
    }
    assert.equal(await restDoc('sales/lamsa-quote-stale-0001'), null);
    assert.equal((await restDoc('tarek_products/lamsa-normal')).stock_grams, stockBefore);
    assert.equal((await restDoc('vaults/restock')).currentBalance, restockBefore);

    const bottle = await restDoc('tarek_sale_bottle_sizes/bottle-50-spray');
    const operationalSettings = await restDoc('operational_settings/store');
    await restSet('tarek_sale_bottle_sizes/bottle-50-spray', { ...bottle, normalPrice: 301 });
    await restSet('operational_settings/store', {
      ...operationalSettings,
      bottleSizes: operationalSettings.bottleSizes.map((item) => item.id === 'bottle-50-spray'
        ? { ...item, normalPrice: 301 } : item),
    });
    try {
      const stale = await call(sellerToken, body);
      assert.equal(stale.status, 409);
      assert.equal(stale.body.error, 'sale/quote-stale');
      assert.equal(await restDoc('sales/lamsa-quote-stale-0001'), null);
      assert.equal((await restDoc('tarek_products/lamsa-normal')).stock_grams, stockBefore);
    } finally {
      await restSet('tarek_sale_bottle_sizes/bottle-50-spray', bottle);
      await restSet('operational_settings/store', operationalSettings);
    }
  });

  await check('authoritative sale uses split price/cost policy and updates canonical and operational stock projections', async () => {
    const body = intent('lamsa-standard-0001', line(), { previewTotalProfitEgp: 215, previewCommissionEgp: 15 });
    const result = await callOperator(sellerToken, body);
    assert.equal(result.status, 200, JSON.stringify(result.body));
    assert.equal(result.body.sale.totalPrice, 300);
    assert.equal(result.body.sale.items[0].sellingPrice, 300);
    for (const field of ['totalCost', 'totalProfit', 'commissionAmount', 'totalCommission', 'requestHash']) {
      assert.equal(field in result.body.sale, false, `operator response leaked ${field}`);
    }
    const root = await restDoc('sales/lamsa-standard-0001');
    assert.equal(root.totalCost, 70);
    assert.equal(root.totalProfit, 215);
    assert.equal(root.commissionAmount, 15);
    assert.equal((await restDoc('product_operations/lamsa-normal')).stock_grams, 85);
    assert.equal((await restDoc('tarek_products/lamsa-normal')).stock_grams, 85);
    assert.equal((await restDoc('products/lamsa-normal')).stock_grams, 100, 'legacy product is not an authority or a write target');
    assert.equal((await restDoc('vaults/restock')).currentBalance, 70);
    assert.equal((await restDoc('vaults/commissions')).currentBalance, 15);
    assert.equal((await restDoc('vaults/owner_profit')).currentBalance, 0);
    const op = await restDoc('sale_operations/lamsa-standard-0001');
    const costs = await restDoc('sale_costs/lamsa-standard-0001');
    const financials = await restDoc('sale_financials/lamsa-standard-0001');
    assert.equal(op.totalPrice, 300);
    assert.equal('totalProfitEgp' in op, false);
    assert.equal('totalCostEgp' in op, false);
    assert.equal(costs.totalCostEgp, 70);
    assert.equal('sellingPrice' in costs.items[0], false);
    assert.equal(financials.totalProfitEgp, 215);
    // Client-rule authorization is exercised by the dedicated Rules Emulator suite on its configured default DB.
  });

  await check('preset promotion is recomputed from authoritative bottle price and exact line quantity', async () => {
    const duoLine = { ...line({ quantity: 2 }), promotionId: 'duo-50ml' };
    const body = intent('lamsa-promo-duo-0001', duoLine, {
      promotionId: 'duo-50ml',
      previewTotalPriceEgp: 540,
      previewTotalCostEgp: 140,
      previewTotalProfitEgp: 367,
      previewCommissionEgp: 33,
    });
    const result = await callOperator(sellerToken, body);
    assert.equal(result.status, 200, JSON.stringify(result.body));
    assert.equal(result.body.sale.totalPrice, 540);
    assert.equal(result.body.sale.discount, 60);
    assert.equal(result.body.sale.promotionId, 'duo-50ml');
    assert.equal(result.body.sale.promotionalSavings.savedAmount, 60);
    assert.equal(result.body.sale.promotionalSavings.originalTotal, 600);
    assert.equal((await restDoc('sales/lamsa-promo-duo-0001')).promotionalSavings.savedAmount, 60);

    const incomplete = { ...line({ quantity: 1 }), promotionId: 'duo-50ml' };
    const rejected = await callOperator(sellerToken, intent('lamsa-promo-duo-bad-0001', incomplete, { promotionId: 'duo-50ml' }));
    assert.equal(rejected.status, 409);
    assert.equal(rejected.body.error, 'sale/promotion-quantity-mismatch');
    assert.equal(await restDoc('sales/lamsa-promo-duo-bad-0001'), null);
  });

  await check('operator must use v3 and cannot submit a price; v2 custom price and finance stay owner-only', async () => {
    const customLine = line({ requestedUnitPriceEgp: 305 });
    const rejected = await call(sellerToken, intent('lamsa-employee-price-01', customLine, {
      previewTotalPriceEgp: 305, previewTotalProfitEgp: 214, previewCommissionEgp: 21,
    }));
    assert.equal(rejected.status, 403);
    assert.equal(rejected.body.error, 'sale/operator-v3-required');
    assert.equal(await restDoc('sales/lamsa-employee-price-01'), null);

    const forgedV3 = operatorV3(intent('lamsa-employee-price-v3-01', line()));
    forgedV3.lines[0].requestedUnitPriceEgp = 305;
    const priceRejected = await call(sellerToken, forgedV3);
    assert.equal(priceRejected.status, 400);
    assert.equal(priceRejected.body.error, 'sale/unexpected-field');
    assert.equal(await restDoc('sales/lamsa-employee-price-v3-01'), null);

    const ownerLine = line({ requestedUnitPriceEgp: 320 });
    const ownerIntent = intent('lamsa-owner-price-001', ownerLine, {
      previewTotalPriceEgp: 320, previewTotalProfitEgp: 228, previewCommissionEgp: 22,
    });
    const ownerResult = await call(ownerToken, ownerIntent);
    assert.equal(ownerResult.status, 200, JSON.stringify(ownerResult.body));
    assert.equal(ownerResult.body.sale.items[0].sellingPrice, 320);
    assert.equal(ownerResult.body.sale.totalProfit, 228);
    const forged = await call(ownerToken, { ...ownerIntent, saleId: 'lamsa-forged-finance-1', totalProfit: 999999 });
    assert.equal(forged.status, 400);
    assert.equal(forged.body.error, 'sale/unexpected-field');
    assert.equal(await restDoc('sales/lamsa-forged-finance-1'), null);
  });

  await check('manual discount honors live tier commission and hard contribution floor', async () => {
    const safe = await callOperator(sellerToken, intent('lamsa-safe-discount-01', line(), {
      manualDiscountEgp: 214, previewTotalPriceEgp: 86, previewTotalCostEgp: 70,
      previewCommissionEgp: 6, previewTotalProfitEgp: 10,
    }));
    assert.equal(safe.status, 200, JSON.stringify(safe.body));
    assert.equal(safe.body.sale.totalPrice, 86);
    const before = (await restDoc('tarek_products/lamsa-normal')).stock_grams;
    const unsafe = await callOperator(sellerToken, intent('lamsa-unsafe-discount-01', line(), {
      manualDiscountEgp: 215, previewTotalPriceEgp: 85, previewTotalCostEgp: 70,
      previewCommissionEgp: 6, previewTotalProfitEgp: 9,
    }));
    assert.equal(unsafe.status, 409);
    assert.equal(unsafe.body.error, 'sale/discount-exceeds-safe-margin');
    assert.equal(await restDoc('sales/lamsa-unsafe-discount-01'), null);
    assert.equal((await restDoc('tarek_products/lamsa-normal')).stock_grams, before);
  });

  await check('mix pricing, per-component stock, cost projection and idempotent retry are server-derived', async () => {
    const mixLine = {
      lineId: 'mix-line-1', bottleSizeId: 'bottle-50-spray', bottleSizeMl: 50,
      quantity: 1, essenceGramsPerBottle: 15, isColoredBottle: false,
      requestedUnitPriceEgp: 350, previewUnitCostEgp: 190, customFormulaName: 'خلطة الاختبار',
      mixComponents: [
        { productId: 'lamsa-mix-normal', gramsPerBottle: 10 },
        { productId: 'lamsa-niche', gramsPerBottle: 5 },
      ],
    };
    const body = intent('lamsa-mix-sale-0001', mixLine, {
      previewTotalPriceEgp: 350, previewTotalCostEgp: 190,
      previewCommissionEgp: 25, previewTotalProfitEgp: 135,
    });
    const result = await callOperator(sellerToken, body);
    assert.equal(result.status, 200, JSON.stringify(result.body));
    assert.equal(result.body.sale.totalPrice, 350);
    for (const field of ['totalCost', 'totalProfit', 'commissionAmount', 'totalCommission']) {
      assert.equal(field in result.body.sale, false, `operator response leaked ${field}`);
    }
    const ownerSale = await restDoc('sales/lamsa-mix-sale-0001');
    assert.equal(ownerSale.totalCost, 190);
    assert.equal(ownerSale.totalProfit, 135);
    assert.equal(ownerSale.commissionAmount, 25);
    assert.equal((await restDoc('tarek_products/lamsa-mix-normal')).stock_grams, 90);
    assert.equal((await restDoc('tarek_products/lamsa-niche')).stock_grams, 95);
    const op = await restDoc('sale_operations/lamsa-mix-sale-0001');
    assert.equal(op.items[0].mixComponents[0].grams, 10);
    assert.equal('componentOilCost' in op.items[0].mixComponents[0], false);
    assert.equal((await restDoc('sale_costs/lamsa-mix-sale-0001')).items[0].components[1].componentOilCostEgp, 75);
    const stockAfter = (await restDoc('tarek_products/lamsa-mix-normal')).stock_grams;
    const retry = await callOperator(sellerToken, body);
    assert.equal(retry.status, 200);
    assert.equal(retry.body.status, 'already-committed');
    assert.equal((await restDoc('tarek_products/lamsa-mix-normal')).stock_grams, stockAfter);
    const conflict = await callOperator(sellerToken, { ...body, manualDiscountEgp: 1 });
    assert.equal(conflict.status, 409);
    assert.equal(conflict.body.error, 'sale/idempotency-conflict');
    assert.equal((await restDoc('tarek_products/lamsa-mix-normal')).stock_grams, stockAfter);
  });

  await check('untrusted price/cost/profit previews are comparison-only and mismatches never commit', async () => {
    const before = (await restDoc('tarek_products/lamsa-normal')).stock_grams;
    const body = intent('lamsa-preview-mismatch-1', line(), {
      previewTotalCostEgp: 1, previewTotalProfitEgp: 294, previewCommissionEgp: 5,
    });
    const result = await call(ownerToken, body);
    assert.equal(result.status, 409);
    assert.equal(result.body.error, 'sale/authoritative-preview-mismatch');
    assert.equal(await restDoc('sales/lamsa-preview-mismatch-1'), null);
    assert.equal(await restDoc('sale_operations/lamsa-preview-mismatch-1'), null);
    assert.equal((await restDoc('tarek_products/lamsa-normal')).stock_grams, before);
  });

  await check('roll-ons pay zero commission; insufficient stock makes no partial writes', async () => {
    const rollLine = line({ bottleSizeId: 'bottle-5-roll', bottleSizeMl: 5, essenceGramsPerBottle: 2,
      requestedUnitPriceEgp: 70, previewUnitCostEgp: 25 });
    const roll = await callOperator(sellerToken, intent('lamsa-roll-sale-001', rollLine, {
      previewTotalPriceEgp: 70, previewTotalCostEgp: 25,
      previewCommissionEgp: 0, previewTotalProfitEgp: 45,
    }));
    assert.equal(roll.status, 200, JSON.stringify(roll.body));
    assert.equal((await restDoc('sales/lamsa-roll-sale-001')).commissionAmount, 0);

    const lowLine = line({ productId: 'lamsa-last-stock', quantity: 2 });
    const low = await callOperator(sellerToken, intent('lamsa-low-stock-001', lowLine, {
      previewTotalPriceEgp: 600, previewTotalCostEgp: 140,
      previewCommissionEgp: 42, previewTotalProfitEgp: 418,
    }));
    assert.equal(low.status, 409);
    assert.equal(low.body.error, 'sale/insufficient-stock');
    assert.equal(await restDoc('sales/lamsa-low-stock-001'), null);
    assert.equal(await restDoc('sale_costs/lamsa-low-stock-001'), null);
    assert.equal((await restDoc('tarek_products/lamsa-last-stock')).stock_grams, 15);
  });

  await check('concurrent sale transactions serialize on shared stock with no oversell', async () => {
    const make = (saleId) => intent(saleId, line({ productId: 'lamsa-last-stock' }), {
      previewTotalPriceEgp: 300, previewTotalCostEgp: 70,
      previewCommissionEgp: 21, previewTotalProfitEgp: 209,
    });
    const results = await Promise.all([
      callOperator(sellerToken, make('lamsa-race-a-0001')),
      callOperator(ownerToken, make('lamsa-race-b-0001')),
    ]);
    assert.equal(results.filter((result) => result.status === 200).length, 1, JSON.stringify(results));
    const stale = results.find((result) => result.status === 409);
    assert.equal(stale?.body.error, 'sale/quote-stale', JSON.stringify(results));
    const staleIndex = results.indexOf(stale);
    const staleSaleId = staleIndex === 0 ? 'lamsa-race-a-0001' : 'lamsa-race-b-0001';
    const staleToken = staleIndex === 0 ? sellerToken : ownerToken;
    const retryIntent = operatorV3(make(staleSaleId));
    retryIntent.quoteId = `quote-${staleSaleId}-after-generation-change`;
    const refreshedQuote = await callQuote(staleToken, retryIntent);
    assert.equal(refreshedQuote.status, 409, JSON.stringify(refreshedQuote.body));
    assert.equal(refreshedQuote.body.error, 'sale/insufficient-stock');
    assert.equal((await restDoc('tarek_products/lamsa-last-stock')).stock_grams, 0);
    const a = await restDoc('sales/lamsa-race-a-0001');
    const b = await restDoc('sales/lamsa-race-b-0001');
    assert.equal(Number(Boolean(a)) + Number(Boolean(b)), 1);
  });

  await check('owner-only invoice reversal is atomic, fails closed on depleted vault, and remains idempotent', async () => {
    const today = new Date().toISOString().slice(0, 10);
    const existingSales = (await restCollection('sales')).map((document) => ({
      ...decodeFields(document.fields || {}), id: document.name.split('/').at(-1),
    }));
    const priorSprays = existingSales
      .filter((sale) => typeof sale.date === 'string' && sale.date.slice(0, 10) === today
        && sale.isReversed !== true && sale.isTestData !== true
        && sale.dataClassification !== 'TEST' && sale.dataClassification !== 'DOC_EXAMPLE'
        && !sale.id.toUpperCase().startsWith('TEST-') && !sale.id.toUpperCase().includes('-TEST-')
        && !sale.id.toUpperCase().startsWith('DOC-EXAMPLE')
        && !`${sale.notes || ''} ${sale.title || ''} ${sale.customerName || ''} ${sale.reason || ''}`
          .includes('TEST / بيانات اختبار')
        && !`${sale.notes || ''} ${sale.title || ''} ${sale.customerName || ''} ${sale.reason || ''}`
          .includes('[TEST-DATA]')
        && !`${sale.notes || ''} ${sale.title || ''} ${sale.customerName || ''} ${sale.reason || ''}`
          .includes('بيانات اختبار تلقائية')
        && (!sale.transactionType || sale.transactionType === 'بيع_طبيعي'))
      .reduce((sum, sale) => sum + (Array.isArray(sale.items) ? sale.items : []).reduce((itemSum, item) => {
        if (item.isRollOn === true || [2, 3, 5].includes(item.bottleSize)) return itemSum;
        return itemSum + (Number.isSafeInteger(item.quantity) && item.quantity > 0 ? item.quantity : 1);
      }, 0), 0);
    const expectedCommission = Math.round(300 * (priorSprays < 10 ? 0.05 : 0.07));
    const saleId = 'lamsa-reversal-safe-01';
    const initialStock = (await restDoc('tarek_products/lamsa-normal')).stock_grams;
    const initialRestock = (await restDoc('vaults/restock')).currentBalance;
    const initialCommissionVault = (await restDoc('vaults/commissions')).currentBalance;
    const saleResult = await callOperator(sellerToken, intent(saleId, line(), {
      previewTotalPriceEgp: 300, previewTotalCostEgp: 70,
      previewCommissionEgp: expectedCommission, previewTotalProfitEgp: 230 - expectedCommission,
    }));
    assert.equal(saleResult.status, 200, JSON.stringify(saleResult.body));
    const committedSale = await restDoc(`sales/${saleId}`);
    assert.equal(committedSale.totalCost, 70);
    assert.equal(committedSale.commissionAmount, expectedCommission);
    const stockAfterSale = (await restDoc('tarek_products/lamsa-normal')).stock_grams;
    const restockAfterSale = (await restDoc('vaults/restock')).currentBalance;
    const commissionAfterSale = (await restDoc('vaults/commissions')).currentBalance;

    const denied = await callReverse(sellerToken, saleId, { reason: 'إرجاع موثق من الاختبار' });
    assert.equal(denied.status, 403);
    assert.equal(denied.body.error, 'role/owner-required');
    assert.notEqual((await restDoc(`sales/${saleId}`)).isReversed, true);
    const permanentDelete = await fetch(`${workerUrl}/api/lamsa/sales/${saleId}`, {
      method: 'DELETE', headers: { authorization: `Bearer ${ownerToken}` },
    });
    assert.equal(permanentDelete.status, 404);
    const invoiceEdit = await fetch(`${workerUrl}/api/lamsa/sales/${saleId}`, {
      method: 'PATCH', headers: { authorization: `Bearer ${ownerToken}`, 'content-type': 'application/json' },
      body: JSON.stringify({ totalPrice: 1 }),
    });
    assert.equal(invoiceEdit.status, 404);

    await restSet('vaults/restock', { currentBalance: 0 });
    const blocked = await callReverse(ownerToken, saleId, { reason: 'إرجاع موثق من الاختبار' });
    assert.equal(blocked.status, 409);
    assert.equal(blocked.body.error, 'sale/reversal-vault-insufficient-balance-restock');
    assert.notEqual((await restDoc(`sales/${saleId}`)).isReversed, true);
    assert.equal((await restDoc('tarek_products/lamsa-normal')).stock_grams, stockAfterSale);
    assert.equal((await restDoc('vaults/commissions')).currentBalance, commissionAfterSale);

    await restSet('vaults/restock', { currentBalance: restockAfterSale });
    const reversed = await callReverse(ownerToken, saleId, { reason: 'إرجاع موثق من الاختبار', restoreInventory: true });
    assert.equal(reversed.status, 200, JSON.stringify(reversed.body));
    assert.equal(reversed.body.status, 'reversed');
    assert.equal((await restDoc(`sales/${saleId}`)).isReversed, true);
    assert.equal((await restDoc(`sales/${saleId}`)).reversalReason, 'إرجاع موثق من الاختبار');
    assert.equal((await restDoc(`sale_operations/${saleId}`)).isReversed, true);
    assert.equal((await restDoc(`sale_costs/${saleId}`)).isReversed, true);
    assert.equal((await restDoc(`sale_financials/${saleId}`)).isReversed, true);
    assert.equal((await restDoc('product_operations/lamsa-normal')).stock_grams, stockAfterSale + 15);
    assert.equal((await restDoc('products/lamsa-normal')).stock_grams, 100);
    assert.equal((await restDoc('tarek_products/lamsa-normal')).stock_grams, stockAfterSale + 15);
    assert.equal((await restDoc('vaults/restock')).currentBalance, initialRestock);
    assert.equal((await restDoc('vaults/commissions')).currentBalance, initialCommissionVault);
    assert.equal((await restDoc('vaults/restock')).reversedInflowEgp, 70);
    assert.equal((await restDoc('vaults/commissions')).reversedInflowEgp, expectedCommission);

    const retry = await callReverse(ownerToken, saleId, { reason: 'سبب إعادة المحاولة لا يغيّر القيد' });
    assert.equal(retry.status, 200, JSON.stringify(retry.body));
    assert.equal(retry.body.status, 'already-reversed');
    assert.equal((await restDoc('tarek_products/lamsa-normal')).stock_grams, initialStock);
    assert.equal((await restDoc('vaults/restock')).currentBalance, initialRestock);
    assert.equal((await restDoc('vaults/commissions')).currentBalance, initialCommissionVault);
  });

  await check('owner-assigned STORE_MANAGER can submit an authoritative safe sale', async () => {
    const managerSaleId = 'lamsa-store-manager-0001';
    const rollOnLine = line({ bottleSizeId: 'bottle-5-roll', bottleSizeMl: 5, quantity: 1, essenceGramsPerBottle: 2, requestedUnitPriceEgp: 70, previewUnitCostEgp: 25 });
    const result = await callOperator(managerToken, intent(managerSaleId, rollOnLine, {
      previewTotalPriceEgp: 70, previewTotalCostEgp: 25,
      previewTotalProfitEgp: 45, previewCommissionEgp: 0,
    }));
    assert.equal(result.status, 200, JSON.stringify(result.body));
    const committed = await restDoc(`sales/${managerSaleId}`);
    assert.equal(committed.recordedBy, 'manager@example.test');
    assert.equal(committed.totalProfit, 45);
    assert.equal((await restDoc('tarek_products/lamsa-normal')).stock_grams, (await restDoc('product_operations/lamsa-normal')).stock_grams);
  });

  await check('Tarek v3 accepts no client financial claims; concurrent devices and ambiguous retries commit once', async () => {
    const today = new Date().toISOString().slice(0, 10);
    const lockPath = `sale_locks/${today}`;
    const lockBefore = Number((await restDoc(lockPath))?.generation || 0);
    const normalStockBefore = (await restDoc('tarek_products/lamsa-normal')).stock_grams;
    const nicheStockBefore = (await restDoc('tarek_products/lamsa-niche')).stock_grams;
    const makeV3 = (saleId, productId) => ({
      schema: 'lamsa.sale-intent/v3',
      saleId,
      quoteId: `quote-${saleId}`,
      lines: [{ lineId: `line-${saleId}`, productId, bottleSizeId: 'bottle-50-spray',
        bottleSizeMl: 50, quantity: 1, essenceGramsPerBottle: 15, isColoredBottle: false }],
      manualDiscountEgp: 0,
      paymentMethod: 'نقدي',
      packagingPaid: false,
    });
    const normalIntent = makeV3('lamsa-v3-normal-0001', 'lamsa-normal');
    const nicheIntent = makeV3('lamsa-v3-niche-0001', 'lamsa-niche');
    const quotes = await Promise.all([
      callQuote(managerToken, normalIntent),
      callQuote(managerToken, nicheIntent),
    ]);
    assert.equal(quotes.filter((result) => result.status === 200).length, 2, JSON.stringify(quotes));
    const results = await Promise.all([
      call(managerToken, normalIntent),
      call(managerToken, nicheIntent),
    ]);
    assert.equal(results.filter((result) => result.status === 200).length, 1, JSON.stringify(results));
    const staleIndex = results.findIndex((result) => result.status === 409);
    assert.equal(results[staleIndex]?.body.error, 'sale/quote-stale', JSON.stringify(results));
    const staleIntent = staleIndex === 0 ? normalIntent : nicheIntent;
    const refreshedIntent = { ...staleIntent, quoteId: `${staleIntent.quoteId}-after-counter-generation` };
    const refreshedQuote = await callQuote(managerToken, refreshedIntent);
    assert.equal(refreshedQuote.status, 200, JSON.stringify(refreshedQuote.body));
    const refreshedCommit = await call(managerToken, refreshedIntent);
    assert.equal(refreshedCommit.status, 200, JSON.stringify(refreshedCommit.body));
    if (staleIndex === 0) normalIntent.quoteId = refreshedIntent.quoteId;
    else nicheIntent.quoteId = refreshedIntent.quoteId;
    const committedResults = [...results.filter((result) => result.status === 200), refreshedCommit];
    for (const result of committedResults) {
      assert.equal(result.body.sale.totalPrice > 0, true);
      for (const field of ['totalCost', 'totalProfit', 'commissionAmount', 'totalCommission', 'requestHash']) {
        assert.equal(field in result.body.sale, false, `Tarek response leaked ${field}`);
      }
    }
    assert.equal((await restDoc('tarek_products/lamsa-normal')).stock_grams, normalStockBefore - 15);
    assert.equal((await restDoc('tarek_products/lamsa-niche')).stock_grams, nicheStockBefore - 15);
    const lockAfterCommit = Number((await restDoc(lockPath)).generation);
    assert.equal(lockAfterCommit, lockBefore + 2);

    const retry = await call(managerToken, normalIntent);
    assert.equal(retry.status, 200, JSON.stringify(retry.body));
    assert.equal(retry.body.status, 'already-committed');
    assert.equal((await restDoc('tarek_products/lamsa-normal')).stock_grams, normalStockBefore - 15);
    assert.equal(Number((await restDoc(lockPath)).generation), lockAfterCommit);
    assert.equal((await restDoc('sales/lamsa-v3-normal-0001')).items[0].sellingPrice, 300);
    assert.equal((await restDoc('sales/lamsa-v3-niche-0001')).items[0].sellingPrice, 450);
  });

  await check('application Tarek client quotes and commits through Firebase-authenticated Worker Emulator with idempotent outbox replay', async () => {
    const originalStorage = Object.getOwnPropertyDescriptor(globalThis, 'localStorage');
    const values = new Map();
    Object.defineProperty(globalThis, 'localStorage', {
      configurable: true,
      writable: true,
      value: {
        getItem: (key) => values.has(key) ? values.get(key) : null,
        setItem: (key, value) => values.set(key, String(value)),
        removeItem: (key) => values.delete(key),
      },
    });
    const saleId = 'lamsa-client-worker-e2e-0001';
    const quoteId = 'quote-lamsa-client-worker-e2e-0001';
    const draft = {
      saleId,
      quoteId,
      lines: [{
        lineId: 'line-client-worker-e2e-1',
        productId: 'lamsa-prodtransport',
        bottleSizeId: 'bottle-50-spray',
        bottleSizeMl: 50,
        quantity: 1,
        essenceGramsPerBottle: 15,
        isColoredBottle: false,
      }],
      manualDiscountEgp: 0,
      paymentMethod: 'نقدي',
      packagingPaid: false,
    };
    let idTokenCalls = 0;
    let workerRequests = 0;
    const tokenProvider = async () => { idTokenCalls += 1; return managerToken; };
    const clientConfig = { mode: 'development', enabled: true };
    const clientEndpoint = resolveTarekSaleWorkerEndpoint(clientConfig);
    assert.equal(clientEndpoint, LOCAL_LAMSA_SALE_ENDPOINT);
    const localFetch = async (input, init) => {
      assert.equal(new URL(String(input)).origin, workerUrl);
      assert.equal(new Headers(init?.headers).get('authorization'), `Bearer ${managerToken}`);
      const sent = JSON.parse(String(init?.body || '{}'));
      assert.equal(sent.schema, 'lamsa.sale-intent/v3');
      assert.equal(sent.saleId, saleId);
      const serialized = JSON.stringify(sent);
      for (const key of ['totalCost', 'totalProfit', 'commission', 'sellingPrice', 'previewTotal']) {
        assert.equal(serialized.includes(key), false, `client request leaked ${key}`);
      }
      workerRequests += 1;
      return fetch(input, init);
    };

    try {
      const stockBefore = (await restDoc('tarek_products/lamsa-prodtransport')).stock_grams;
      const quote = await quoteTarekSaleToWorker(
        draft,
        clientEndpoint,
        tokenProvider,
        localFetch,
        clientConfig,
      );
      assert.equal(quote.quoteId, quoteId);
      assert.equal(quote.sale.id, saleId);
      assert.equal(quote.sale.totalPrice, 300);
      assert.equal('totalProfit' in quote.sale, false);
      assert.equal(await restDoc(`sales/${saleId}`), null);
      assert.equal((await restDoc('tarek_products/lamsa-prodtransport')).stock_grams, stockBefore,
        'quote must not commit inventory');

      await enqueueTarekSale(draft);
      let dropFirstAcknowledgement = true;
      const commit = async (intent) => {
        const acknowledgement = await submitTarekSaleIntentToWorker(
          intent,
          clientEndpoint,
          tokenProvider,
          localFetch,
          clientConfig,
        );
        if (dropFirstAcknowledgement) {
          dropFirstAcknowledgement = false;
          throw new Error('worker-sale/network-timeout-after-commit');
        }
        return acknowledgement;
      };

      const lostAck = await flushTarekSaleOutbox(commit);
      assert.equal(lostAck.failed, 1);
      assert.equal(getTarekSaleOutbox().length, 1, 'uncertain result must remain durable');
      assert.equal((await restDoc(`sales/${saleId}`)).items[0].sellingPrice, 300);
      const stockAfterFirstCommit = (await restDoc('tarek_products/lamsa-prodtransport')).stock_grams;
      assert.equal(stockAfterFirstCommit, stockBefore - 15);

      const replay = await flushTarekSaleOutbox(commit, { force: true });
      assert.equal(replay.synced, 1);
      assert.deepEqual(getTarekSaleOutbox(), []);
      assert.equal((await restDoc('tarek_products/lamsa-prodtransport')).stock_grams, stockAfterFirstCommit,
        'idempotent retry must not deduct inventory twice');
      assert.equal(workerRequests, 3, 'one quote, one commit, and one idempotent retry');
      assert.equal(idTokenCalls, 3, 'each request must use a fresh Firebase ID token');
    } finally {
      if (originalStorage) Object.defineProperty(globalThis, 'localStorage', originalStorage);
      else delete globalThis.localStorage;
    }
  });

  await check('production-pinned OAuth/Firestore REST transport runs quote and commit only through mocked auth and local Emulator', runProductionTransportEmulatorTest);

  console.log(`LAMSA EMULATOR RESULT ${passed} passed, ${failures.length} failed`);
  if (failures.length) throw new Error(`${failures.length} Lamsa emulator integration test(s) failed`);
}
