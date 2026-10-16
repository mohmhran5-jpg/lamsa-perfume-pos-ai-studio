import {
  createFirebaseIdTokenVerifier,
  FIREBASE_CERTS_URL,
  FirebaseCertificatesUnavailable,
  FirebaseTokenError,
} from './firebaseIdTokenVerifier.mjs';
import { createGoogleServiceAccountTokenProvider, GoogleServiceAccountAuthError } from './googleServiceAccountAuth.mjs';
import {
  handleLamsaCommissionCounterBootstrap,
  handleLamsaSale,
  handleLamsaSaleQuote,
  handleLamsaSaleReversal,
} from './lamsaSaleWorker.mjs';
import {
  PRODUCTION_FIRESTORE_DATABASE_ID,
  PRODUCTION_FIRESTORE_PROJECT_ID,
  PRODUCTION_FIRESTORE_SERVICE_ACCOUNT,
} from './productionConfig.mjs';
import {
  isAllowedLamsaRequestOrigin,
  isLamsaSalesCutoverReached,
  isProductionLamsaRouteEnabled,
  resolveLamsaCorsOrigin,
} from './workerRuntimePolicy.mjs';

const MAX_SALE_ITEMS = 100;
const MAX_MIX_COMPONENTS_PER_LINE = 20;
const MAX_COMPONENT_USES = 400;
const MAX_STOCK_DOCS = 400;
const enc = new TextEncoder();
const verifyFirebaseIdToken = createFirebaseIdTokenVerifier();
const googleServiceAccountAccessToken = createGoogleServiceAccountTokenProvider({
  expectedServiceAccountEmail: PRODUCTION_FIRESTORE_SERVICE_ACCOUNT,
});

class ApiError extends Error {
  constructor(status, code, message = code) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' },
  });
}

function withWorkerCors(response, request, env) {
  const origin = resolveLamsaCorsOrigin(env, request.headers.get('origin'));
  if (!origin) return response;
  const headers = new Headers(response.headers);
  headers.set('access-control-allow-origin', origin);
  headers.set('access-control-allow-methods', 'POST, OPTIONS');
  headers.set('access-control-allow-headers', 'authorization, content-type');
  headers.set('access-control-max-age', '300');
  headers.append('vary', 'Origin');
  return new Response(response.body, { status: response.status, statusText: response.statusText, headers });
}

function assertEmulatorOnly(env) {
  let testCertsUrl;
  try { testCertsUrl = new URL(env.FIREBASE_TEST_CERTS_URL); } catch { /* fail closed below */ }
  if (env.ENVIRONMENT !== 'local-emulator'
      || env.PROJECT_ID !== 'demo-worker-sale'
      || !/^127\.0\.0\.1:\d+$/.test(env.FIRESTORE_EMULATOR_HOST || '')
      || !env.FIRESTORE_EMULATOR_ADMIN_TOKEN
      || !testCertsUrl || testCertsUrl.protocol !== 'http:'
      || testCertsUrl.hostname !== '127.0.0.1' || !/^\d+$/.test(testCertsUrl.port)
      || testCertsUrl.pathname !== '/certs' || testCertsUrl.search || testCertsUrl.hash
      || testCertsUrl.username || testCertsUrl.password) {
    throw new ApiError(503, 'prototype/emulator-only');
  }
  firestoreDocumentsPath(env.PROJECT_ID, env.FIRESTORE_DATABASE_ID);
}

export function firestoreDocumentsPath(projectId, databaseId) {
  const validProjectId = typeof projectId === 'string' && /^[a-z][a-z0-9-]{4,28}[a-z0-9]$/.test(projectId);
  const validDatabaseId = databaseId === '(default)'
    || (typeof databaseId === 'string' && /^[a-z][a-z0-9-]{2,61}[a-z0-9]$/.test(databaseId));
  if (!validProjectId || !validDatabaseId) throw new ApiError(500, 'prototype/invalid-firestore-resource');
  return `projects/${projectId}/databases/${databaseId}/documents`;
}

export function assertProductionFirestoreConfig(env, { requireTransportEnabled = true } = {}) {
  if (requireTransportEnabled && env?.FIRESTORE_PRODUCTION_TRANSPORT_ENABLED !== 'true') {
    throw new ApiError(503, 'prototype/production-transport-disabled');
  }
  if (env?.ENVIRONMENT !== 'production'
      || env.PROJECT_ID !== PRODUCTION_FIRESTORE_PROJECT_ID
      || env.FIRESTORE_DATABASE_ID !== PRODUCTION_FIRESTORE_DATABASE_ID
      || String(env.GCP_SERVICE_ACCOUNT_EMAIL || '').trim().toLowerCase() !== PRODUCTION_FIRESTORE_SERVICE_ACCOUNT
      || typeof env.GCP_SERVICE_ACCOUNT_PRIVATE_KEY !== 'string'
      || !env.GCP_SERVICE_ACCOUNT_PRIVATE_KEY.trim().startsWith('-----BEGIN PRIVATE KEY-----')
      || !env.GCP_SERVICE_ACCOUNT_PRIVATE_KEY.includes('-----END PRIVATE KEY-----')
      || env.FIRESTORE_EMULATOR_HOST || env.FIRESTORE_EMULATOR_ADMIN_TOKEN || env.FIREBASE_TEST_CERTS_URL) {
    throw new ApiError(503, 'prototype/production-transport-not-approved');
  }
  return firestoreDocumentsPath(env.PROJECT_ID, env.FIRESTORE_DATABASE_ID);
}

export function assertLamsaRequestAllowed(request, env, now = new Date()) {
  if (env?.ENVIRONMENT === 'local-emulator') {
    assertEmulatorOnly(env);
    if (!isAllowedLamsaRequestOrigin(env, request.headers.get('origin'))) {
      throw new ApiError(403, 'worker/origin-not-allowed');
    }
    return;
  }
  if (!isProductionLamsaRouteEnabled(env)) {
    throw new ApiError(503, 'prototype/production-routes-disabled');
  }
  assertProductionFirestoreConfig(env);
  if (!isLamsaSalesCutoverReached(now)) throw new ApiError(503, 'sale/cutover-not-started');
  if (!isAllowedLamsaRequestOrigin(env, request.headers.get('origin'))) {
    throw new ApiError(403, 'worker/origin-not-allowed');
  }
}

export function firestoreRoot(env) {
  if (env?.ENVIRONMENT === 'local-emulator') {
    assertEmulatorOnly(env);
    return `http://${env.FIRESTORE_EMULATOR_HOST}/v1/${firestoreDocumentsPath(env.PROJECT_ID, env.FIRESTORE_DATABASE_ID)}`;
  }
  const path = assertProductionFirestoreConfig(env);
  return `https://firestore.googleapis.com/v1/${path}`;
}

function docKey(collection, id) {
  return `${collection}/${String(id).split('/').map(encodeURIComponent).join('/')}`;
}

function docName(env, key) {
  return `${firestoreDocumentsPath(env.PROJECT_ID, env.FIRESTORE_DATABASE_ID)}/${key}`;
}

function decodeValue(value) {
  if (!value || typeof value !== 'object') return undefined;
  if ('nullValue' in value) return null;
  if ('booleanValue' in value) return value.booleanValue;
  if ('integerValue' in value) return Number(value.integerValue);
  if ('doubleValue' in value) return Number(value.doubleValue);
  if ('stringValue' in value) return value.stringValue;
  if ('timestampValue' in value) return value.timestampValue;
  if ('referenceValue' in value) return value.referenceValue;
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
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) throw new ApiError(400, 'sale/invalid-number');
    return Number.isSafeInteger(value)
      ? { integerValue: String(value) }
      : { doubleValue: value };
  }
  if (typeof value === 'string') return { stringValue: value };
  if (Array.isArray(value)) return { arrayValue: { values: value.map(encodeValue) } };
  if (value && typeof value === 'object') return { mapValue: { fields: encodeFields(value) } };
  throw new ApiError(400, 'sale/unsupported-value');
}

function encodeFields(fields) {
  return Object.fromEntries(Object.entries(fields)
    .filter(([, value]) => value !== undefined)
    .map(([key, value]) => [key, encodeValue(value)]));
}

function keyFromDocumentName(name) {
  const marker = '/documents/';
  const relative = name.includes(marker) ? name.split(marker).at(-1) : name;
  return relative.split('/').map((part) => {
    try { return decodeURIComponent(part); } catch { return part; }
  }).join('/');
}

export async function fsRequest(env, method, url, body, {
  fetchImpl = (...args) => globalThis.fetch(...args),
  tokenProvider = googleServiceAccountAccessToken,
} = {}) {
  const root = new URL(firestoreRoot(env));
  let target;
  try { target = new URL(url); } catch { throw new ApiError(400, 'firestore/invalid-url'); }
  const expectedPath = root.pathname.replace(/\/$/, '');
  const withinFirestoreRoot = target.pathname === expectedPath
    || target.pathname.startsWith(`${expectedPath}/`)
    || target.pathname.startsWith(`${expectedPath}:`);
  if (target.origin !== root.origin || !withinFirestoreRoot) {
    throw new ApiError(403, 'firestore/endpoint-not-allowed');
  }

  let accessToken;
  if (env.ENVIRONMENT === 'local-emulator') {
    accessToken = env.FIRESTORE_EMULATOR_ADMIN_TOKEN;
  } else {
    try { accessToken = await tokenProvider(env); }
    catch (error) {
      const code = error instanceof GoogleServiceAccountAuthError
        ? error.code : 'google/service-account-auth-failed';
      throw new ApiError(503, code);
    }
  }
  if (typeof accessToken !== 'string' || !accessToken) throw new ApiError(503, 'firestore/auth-token-unavailable');

  const response = await fetchImpl(target.href, {
    method,
    redirect: 'manual',
    headers: {
      authorization: `Bearer ${accessToken}`,
      ...(body === undefined ? {} : { 'content-type': 'application/json' }),
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
  const text = await response.text();
  let parsed;
  try { parsed = text ? JSON.parse(text) : {}; } catch { parsed = {}; }
  if (!response.ok) {
    const err = parsed?.error || {};
    const failure = new ApiError(response.status, err.status || `firestore/http-${response.status}`, err.message || text);
    failure.retryable = response.status === 409 || err.status === 'ABORTED';
    throw failure;
  }
  return { response, text, parsed };
}

async function batchGet(env, keys, transaction, requestImpl = fsRequest) {
  const uniqueKeys = [...new Set(keys)];
  const requestBody = transaction
    ? { documents: uniqueKeys.map((key) => docName(env, key)), transaction }
    : { documents: uniqueKeys.map((key) => docName(env, key)), newTransaction: { readWrite: {} } };
  const { text } = await requestImpl(env, 'POST', `${firestoreRoot(env)}:batchGet`, requestBody);
  const records = [];
  const trimmed = text.trim();
  if (trimmed.startsWith('[')) {
    records.push(...JSON.parse(trimmed));
  } else {
    for (const line of trimmed.split(/\r?\n/).filter(Boolean)) {
      try { records.push(JSON.parse(line)); } catch { /* Firestore Emulator may prefix stream framing. */ }
    }
  }
  const docs = new Map();
  let transactionId = transaction;
  for (const record of records) {
    if (record.transaction) transactionId = record.transaction;
    if (record.found?.name) docs.set(keyFromDocumentName(record.found.name), decodeFields(record.found.fields || {}));
    if (record.missing) docs.set(keyFromDocumentName(record.missing), null);
  }
  if (!transactionId) throw new ApiError(502, 'firestore/no-transaction-id');
  for (const key of uniqueKeys) if (!docs.has(key)) docs.set(key, null);
  return { docs, transactionId };
}

async function rollback(env, transactionId, requestImpl = fsRequest) {
  if (!transactionId) return;
  try {
    await requestImpl(env, 'POST', `${firestoreRoot(env)}:rollback`, { transaction: transactionId });
  } catch { /* A transaction that has already expired or aborted is harmless. */ }
}

function makeWrite(env, key, data, options = {}) {
  const write = { update: { name: docName(env, key), fields: encodeFields(data) } };
  if (options.mask) write.updateMask = { fieldPaths: options.mask };
  if (options.exists !== undefined) write.currentDocument = { exists: options.exists };
  return write;
}

async function commitWrites(env, transactionId, writes, requestImpl = fsRequest) {
  return requestImpl(env, 'POST', `${firestoreRoot(env)}:commit`, { transaction: transactionId, writes });
}

/**
 * Builds Firestore REST dependencies for the Worker or an isolated test harness.
 * Production configuration is still checked by firestoreRoot; public routes
 * remain emulator-only. Tests may inject a fake OAuth token and a local REST adapter.
 */
export function createFirestoreTransport({ fetchImpl, tokenProvider = googleServiceAccountAccessToken } = {}) {
  const request = (env, method, url, body) => fsRequest(env, method, url, body, { fetchImpl, tokenProvider });
  return {
    fsRequest: request,
    batchGet: (env, keys, transaction) => batchGet(env, keys, transaction, request),
    firestoreRoot,
    docName,
    makeWrite,
    commitWrites: (env, transactionId, writes) => commitWrites(env, transactionId, writes, request),
    rollback: (env, transactionId) => rollback(env, transactionId, request),
    decodeFields,
    encodeFields,
    json,
  };
}

const firestoreTransport = createFirestoreTransport();

async function authenticate(request, env) {
  const header = request.headers.get('authorization') || '';
  const match = header.match(/^Bearer\s+(.+)$/i);
  if (!match) throw new ApiError(401, 'auth/missing-bearer-token');
  const certsUrl = env.ENVIRONMENT === 'local-emulator' ? env.FIREBASE_TEST_CERTS_URL : FIREBASE_CERTS_URL;
  try {
    return await verifyFirebaseIdToken(match[1], { projectId: env.PROJECT_ID, certsUrl });
  } catch (error) {
    if (error instanceof FirebaseCertificatesUnavailable) {
      throw new ApiError(503, 'auth/certificate-service-unavailable');
    }
    if (error instanceof FirebaseTokenError) throw new ApiError(401, error.code);
    throw new ApiError(503, 'auth/verifier-unavailable');
  }
}

function canonical(value) {
  if (Array.isArray(value)) return value.map(canonical);
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.keys(value).sort().map((key) => [key, canonical(value[key])]));
  }
  return value;
}

function isSafeDocumentId(value) {
  return typeof value === 'string' && value.length > 0 && value.length <= 1500
    && !value.includes('/') && value !== '.' && value !== '..';
}

async function hashRequest(request) {
  const digest = await crypto.subtle.digest('SHA-256', enc.encode(JSON.stringify(canonical(request))));
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, '0')).join('');
}

function normalizeRequest(body) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) throw new ApiError(400, 'sale/invalid-body');
  if (body.schema === 'lamsa.sale-intent/v1') throw new ApiError(409, 'sale/unsupported-contract');
  const saleId = typeof body.saleId === 'string' ? body.saleId.trim() : '';
  if (!/^[A-Za-z0-9_-]{4,120}$/.test(saleId)) throw new ApiError(400, 'sale/invalid-id');
  if (!Array.isArray(body.items) || body.items.length < 1 || body.items.length > MAX_SALE_ITEMS) {
    throw new ApiError(400, 'sale/invalid-item-count');
  }
  const items = body.items.map((item) => {
    if (!item || typeof item !== 'object') throw new ApiError(400, 'sale/invalid-item');
    const hasProduct = typeof item.productId === 'string' && item.productId.trim();
    const hasMix = typeof item.mixId === 'string' && item.mixId.trim();
    if (Boolean(hasProduct) === Boolean(hasMix)) throw new ApiError(400, 'sale/one-product-or-mix-required');
    if (hasProduct && !isSafeDocumentId(item.productId.trim())) throw new ApiError(400, 'sale/invalid-product-id');
    if (hasMix && !isSafeDocumentId(item.mixId.trim())) throw new ApiError(400, 'sale/invalid-mix-id');
    const quantity = item.quantity ?? 1;
    if (!Number.isSafeInteger(quantity) || quantity < 1 || quantity > 100) throw new ApiError(400, 'sale/invalid-quantity');
    return {
      ...(hasProduct ? { productId: item.productId.trim() } : { mixId: item.mixId.trim() }),
      quantity,
    };
  });
  const manualDiscountEgp = body.manualDiscountEgp ?? 0;
  const loyaltyPointsToRedeem = body.loyaltyPointsToRedeem ?? 0;
  if (!Number.isSafeInteger(manualDiscountEgp) || manualDiscountEgp < 0) throw new ApiError(400, 'sale/invalid-manual-discount');
  if (!Number.isSafeInteger(loyaltyPointsToRedeem) || loyaltyPointsToRedeem < 0) throw new ApiError(400, 'sale/invalid-loyalty-points');
  const promotionId = body.promotionId == null ? null : String(body.promotionId).trim();
  const customerId = body.customerId == null ? null : String(body.customerId).trim();
  if ((promotionId && !isSafeDocumentId(promotionId)) || (customerId && !isSafeDocumentId(customerId))) {
    throw new ApiError(400, 'sale/invalid-reference');
  }
  const paymentMethod = body.paymentMethod ?? 'cash';
  if (!['cash', 'card', 'transfer', 'other'].includes(paymentMethod)) throw new ApiError(400, 'sale/invalid-payment-method');
  return { saleId, items, manualDiscountEgp, loyaltyPointsToRedeem, promotionId, customerId, paymentMethod };
}

function roundMoney(value) {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

function numberField(doc, key, { min = 0, required = true } = {}) {
  const value = doc?.[key];
  if (value == null && !required) return 0;
  if (typeof value !== 'number' || !Number.isFinite(value) || value < min) {
    throw new ApiError(409, `sale/invalid-authoritative-${key}`);
  }
  return value;
}

function publicResult(role, sale, alreadyCommitted = false) {
  if (role === 'OWNER') return {
    ok: true,
    status: alreadyCommitted ? 'already-committed' : 'committed',
    sale: { ...sale },
  };
  return {
    ok: true,
    status: alreadyCommitted ? 'already-committed' : 'committed',
    sale: {
      id: sale.id,
      date: sale.date,
      totalPriceEgp: sale.totalPriceEgp,
      paymentMethod: sale.paymentMethod,
      items: (sale.items || []).map((item) => ({
        name: item.name,
        quantity: item.quantity,
        sellingPriceEgp: item.sellingPriceEgp,
        operationalCostEgp: item.operationalCostEgp,
      })),
      loyaltyPointsEarned: sale.loyaltyPointsEarned || 0,
    },
  };
}

function buildWriteSet(env, transactionData, request, requestHash, user, mixDocs, productDocs, stockDocs) {
  const settings = transactionData.get('settings/store');
  if (!settings) throw new ApiError(503, 'sale/store-settings-missing');
  const commissionRate = numberField(settings, 'commissionRate', { min: 0 });
  if (commissionRate >= 1) throw new ApiError(409, 'sale/invalid-commission-rate');
  const minimumContribution = numberField(settings, 'minimumContributionEgp', { min: 0, required: false }) || 10;
  const manualDiscountCap = numberField(settings, 'manualDiscountCapEgp', { min: 0, required: false });
  if (request.manualDiscountEgp > manualDiscountCap) throw new ApiError(409, 'sale/manual-discount-over-limit');

  let componentUses = 0;
  const stockDeductions = new Map();
  const mixQuantities = new Map();
  const lines = [];
  let subtotal = 0;
  let totalCost = 0;
  let allCommissionExempt = true;

  const addDeduction = (productId, grams) => {
    if (!Number.isFinite(grams) || grams <= 0) throw new ApiError(400, 'sale/invalid-mix-grams');
    stockDeductions.set(productId, (stockDeductions.get(productId) || 0) + grams);
    if (stockDeductions.size > MAX_STOCK_DOCS) throw new ApiError(400, 'sale/too-many-stock-documents');
  };

  for (const requested of request.items) {
    const quantity = requested.quantity;
    if (requested.productId) {
      const product = productDocs.get(requested.productId);
      if (!product || product.active === false) throw new ApiError(409, 'sale/product-unavailable');
      const gramsPerUnit = numberField(product, 'gramsPerUnit');
      const price = numberField(product, 'unitPriceEgp', { min: 0.01 });
      const costPerGram = numberField(product, 'costPerGram');
      const packagingCost = numberField(product, 'packagingCostEgp', { min: 0, required: false });
      const lineCost = roundMoney((costPerGram * gramsPerUnit + packagingCost) * quantity);
      const linePrice = roundMoney(price * quantity);
      addDeduction(requested.productId, gramsPerUnit * quantity);
      subtotal += linePrice;
      totalCost += lineCost;
      allCommissionExempt = allCommissionExempt && product.commissionExempt === true;
      lines.push({
        productId: requested.productId,
        name: String(product.name || requested.productId),
        quantity,
        sellingPriceEgp: linePrice,
        operationalCostEgp: lineCost,
        lineCostEgp: lineCost,
        lineProfitEgp: null,
        isMix: false,
      });
      continue;
    }

    const mix = mixDocs.get(requested.mixId);
    if (!mix || mix.active === false || !Array.isArray(mix.components)
        || mix.components.length < 1 || mix.components.length > MAX_MIX_COMPONENTS_PER_LINE) {
      throw new ApiError(409, 'sale/mix-unavailable-or-invalid');
    }
    componentUses += mix.components.length * quantity;
    if (componentUses > MAX_COMPONENT_USES) throw new ApiError(400, 'sale/too-many-mix-components');
    const price = numberField(mix, 'sellingPriceEgp', { min: 0.01 });
    const packagingCost = numberField(mix, 'packagingCostEgp', { min: 0, required: false });
    let mixCost = packagingCost * quantity;
    for (const component of mix.components) {
      if (!component || !isSafeDocumentId(component.productId)) throw new ApiError(400, 'sale/invalid-mix-component');
      const product = productDocs.get(component.productId);
      if (!product || product.active === false) throw new ApiError(409, 'sale/mix-component-unavailable');
      const grams = numberField(component, 'gramsPerUnit', { min: Number.MIN_VALUE });
      const costPerGram = numberField(product, 'costPerGram');
      addDeduction(component.productId, grams * quantity);
      mixCost += costPerGram * grams * quantity;
      allCommissionExempt = allCommissionExempt && product.commissionExempt === true;
    }
    mixCost = roundMoney(mixCost);
    const linePrice = roundMoney(price * quantity);
    subtotal += linePrice;
    totalCost += mixCost;
    mixQuantities.set(requested.mixId, (mixQuantities.get(requested.mixId) || 0) + quantity);
    lines.push({
      mixId: requested.mixId,
      name: String(mix.name || requested.mixId),
      quantity,
      sellingPriceEgp: linePrice,
      operationalCostEgp: mixCost,
      lineCostEgp: mixCost,
      lineProfitEgp: null,
      isMix: true,
    });
  }

  if (stockDeductions.size > MAX_STOCK_DOCS) throw new ApiError(400, 'sale/too-many-stock-documents');
  subtotal = roundMoney(subtotal);
  totalCost = roundMoney(totalCost);
  const promotion = request.promotionId ? transactionData.get(`promotions/${request.promotionId}`) : null;
  if (request.promotionId && (!promotion || promotion.active !== true || promotion.type !== 'percent')) {
    throw new ApiError(409, 'sale/promotion-unavailable');
  }
  const promotionDiscount = promotion
    ? Math.min(roundMoney(subtotal * numberField(promotion, 'percentOff', { min: 0 }) / 100), numberField(promotion, 'maxDiscountEgp', { min: 0 }))
    : 0;
  const manualDiscount = request.manualDiscountEgp;

  const customer = request.customerId ? transactionData.get(`customers/${request.customerId}`) : null;
  if (request.customerId && !customer) throw new ApiError(409, 'sale/customer-not-found');
  const loyaltyEnabled = settings.loyaltyEnabled === true;
  const redeemPoints = request.loyaltyPointsToRedeem;
  let loyaltyDiscount = 0;
  if (redeemPoints > 0) {
    if (!loyaltyEnabled || !customer) throw new ApiError(409, 'sale/loyalty-unavailable');
    const points = numberField(customer, 'points', { min: 0 });
    const minRedeem = numberField(settings, 'loyaltyMinRedeemPoints', { min: 1, required: false }) || 1;
    if (redeemPoints < minRedeem || redeemPoints > points) throw new ApiError(409, 'sale/loyalty-points-invalid');
    const cashPerPoint = numberField(settings, 'loyaltyCashPerPointEgp', { min: 0.01 });
    loyaltyDiscount = roundMoney(redeemPoints * cashPerPoint);
    const percentLimit = numberField(settings, 'loyaltyMaxDiscountPercent', { min: 0, required: false }) || 25;
    if (loyaltyDiscount > roundMoney(subtotal * percentLimit / 100)) throw new ApiError(409, 'sale/loyalty-percent-limit');
  }
  const netBeforeLoyalty = subtotal - promotionDiscount - manualDiscount;
  const safeNetMinimum = roundMoney((totalCost + minimumContribution) / (allCommissionExempt ? 1 : (1 - commissionRate)));
  const maximumTotalDiscount = Math.max(0, roundMoney(subtotal - safeNetMinimum));
  const totalDiscount = roundMoney(promotionDiscount + manualDiscount + loyaltyDiscount);
  if (totalDiscount > maximumTotalDiscount || netBeforeLoyalty - loyaltyDiscount < safeNetMinimum) {
    throw new ApiError(409, 'sale/discount-exceeds-safe-margin');
  }
  const netTotal = roundMoney(subtotal - totalDiscount);
  if (netTotal <= 0) throw new ApiError(409, 'sale/non-positive-total');
  const commission = allCommissionExempt ? 0 : roundMoney(netTotal * commissionRate);
  const profit = roundMoney(netTotal - totalCost - commission);
  if (profit < minimumContribution) throw new ApiError(409, 'sale/minimum-contribution-not-met');
  const earnedPoints = loyaltyEnabled && customer
    ? Math.floor(netTotal / (numberField(settings, 'loyaltyEarnStepEgp', { min: 1, required: false }) || 10))
    : 0;
  const stockAfter = new Map();
  for (const [productId, grams] of stockDeductions) {
    const stock = stockDocs.get(productId);
    if (!stock) throw new ApiError(409, 'sale/stock-document-missing');
    const current = numberField(stock, 'stock_grams');
    if (current < grams) throw new ApiError(409, 'sale/insufficient-stock');
    stockAfter.set(productId, roundMoney(current - grams));
  }

  const now = new Date().toISOString();
  const sale = {
    id: request.saleId,
    requestHash,
    date: now,
    recordedByEmail: user.email,
    items: lines.map((line) => ({ ...line, lineProfitEgp: roundMoney(line.sellingPriceEgp - line.lineCostEgp) })),
    subtotalEgp: subtotal,
    promotionId: request.promotionId,
    promotionDiscountEgp: promotionDiscount,
    manualDiscountEgp: manualDiscount,
    loyaltyPointsRedeemed: redeemPoints,
    loyaltyDiscountEgp: loyaltyDiscount,
    loyaltyPointsEarned: earnedPoints,
    totalDiscountEgp: totalDiscount,
    totalPriceEgp: netTotal,
    totalCostEgp: totalCost,
    commissionEgp: commission,
    totalProfitEgp: profit,
    paymentMethod: request.paymentMethod,
    customerId: request.customerId,
    stockDeductions: Object.fromEntries(stockDeductions),
  };
  const writes = [makeWrite(env, `sales/${request.saleId}`, sale, { exists: false })];
  for (const [productId, nextStock] of stockAfter) {
    writes.push(makeWrite(env, `inventory_stock/${productId}`, { stock_grams: nextStock, updatedAt: now }, { mask: ['stock_grams', 'updatedAt'] }));
  }
  for (const [mixId, quantity] of mixQuantities) {
    const mix = mixDocs.get(mixId);
    writes.push(makeWrite(env, `mixes/${mixId}`, { timesSold: (Number(mix.timesSold) || 0) + quantity, updatedAt: now }, { mask: ['timesSold', 'updatedAt'] }));
  }
  if (customer) {
    const currentPoints = Number(customer.points) || 0;
    const logs = Array.isArray(customer.loyaltyLogs) ? customer.loyaltyLogs : [];
    const newLogs = [];
    if (redeemPoints) newLogs.push({ id: `redeem-${request.saleId}`, pointsDelta: -redeemPoints, date: now, reason: 'sale redemption' });
    if (earnedPoints) newLogs.push({ id: `earn-${request.saleId}`, pointsDelta: earnedPoints, date: now, reason: 'sale earned' });
    writes.push(makeWrite(env, `customers/${request.customerId}`, {
      points: currentPoints - redeemPoints + earnedPoints,
      loyaltyLogs: [...newLogs, ...logs],
      updatedAt: now,
    }, { mask: ['points', 'loyaltyLogs', 'updatedAt'] }));
  }
  const vaultDeltas = { restock: totalCost, commissions: commission, owner_profit: profit };
  for (const [vaultId, delta] of Object.entries(vaultDeltas)) {
    const vault = transactionData.get(`vaults/${vaultId}`);
    if (!vault) throw new ApiError(503, 'sale/vault-missing');
    writes.push(makeWrite(env, `vaults/${vaultId}`, {
      currentBalance: roundMoney(numberField(vault, 'currentBalance') + delta),
      totalInflow: roundMoney(numberField(vault, 'totalInflow', { min: 0, required: false }) + delta),
      updatedAt: now,
    }, { mask: ['currentBalance', 'totalInflow', 'updatedAt'] }));
  }
  return { sale, writes };
}

async function oneTransaction(env, request, user, requestHash) {
  const initialKeys = [
    `sales/${request.saleId}`,
    'settings/store',
    'vaults/restock',
    'vaults/commissions',
    'vaults/owner_profit',
    ...(!user.email || user.email === env.OWNER_EMAIL ? [] : [`role_assignments/${user.email}`]),
    ...(request.promotionId ? [`promotions/${request.promotionId}`] : []),
    ...(request.customerId ? [`customers/${request.customerId}`] : []),
    ...request.items.filter((item) => item.mixId).map((item) => `mixes/${item.mixId}`),
  ];
  const first = await batchGet(env, initialKeys);
  const tx = first.transactionId;
  try {
  const existing = first.docs.get(`sales/${request.saleId}`);
  if (existing) {
    if (existing.requestHash === requestHash) {
      await rollback(env, tx);
      return { sale: existing, alreadyCommitted: true };
    }
    throw new ApiError(409, 'sale/idempotency-conflict');
  }

  let role = 'OWNER';
  if (user.email !== env.OWNER_EMAIL.toLowerCase()) {
    const grant = first.docs.get(`role_assignments/${user.email}`);
    if (!grant || grant.email !== user.email || grant.active !== true) {
      throw new ApiError(403, 'role/no-active-grant');
    }
    if (grant.role !== 'SALES_OPERATOR') {
      throw new ApiError(403, 'role/cannot-sell');
    }
    role = 'SALES_OPERATOR';
  }

  const mixDocs = new Map();
  let componentUses = 0;
  const productIds = new Set();
  for (const item of request.items) {
    if (item.productId) productIds.add(item.productId);
    else {
      const mix = first.docs.get(`mixes/${item.mixId}`);
      if (!mix || !Array.isArray(mix.components)) {
        throw new ApiError(409, 'sale/mix-unavailable');
      }
      mixDocs.set(item.mixId, mix);
      componentUses += mix.components.length * item.quantity;
      for (const component of mix.components) {
        if (!component || !isSafeDocumentId(component.productId)) throw new ApiError(400, 'sale/invalid-mix-component');
        productIds.add(component.productId);
      }
    }
  }
  if (componentUses > MAX_COMPONENT_USES || productIds.size > MAX_STOCK_DOCS) {
    throw new ApiError(400, 'sale/too-many-components');
  }
  const productKeys = [...productIds].flatMap((id) => [`products/${id}`, `inventory_stock/${id}`]);
  const second = await batchGet(env, productKeys, tx);
  const productDocs = new Map([...productIds].map((id) => [id, second.docs.get(`products/${id}`)]));
  const stockDocs = new Map([...productIds].map((id) => [id, second.docs.get(`inventory_stock/${id}`)]));
  const transactionData = new Map([...first.docs, ...second.docs]);
  const { sale, writes } = buildWriteSet(env, transactionData, request, requestHash, user, mixDocs, productDocs, stockDocs);
  await commitWrites(env, tx, writes);
  return { sale, role, alreadyCommitted: false };
  } catch (error) {
    await rollback(env, tx);
    throw error;
  }
}

async function handleSale(request, env) {
  assertEmulatorOnly(env);
  const user = await authenticate(request, env);
  const contentLength = Number(request.headers.get('content-length') || 0);
  if (Number.isFinite(contentLength) && contentLength > 256 * 1024) throw new ApiError(413, 'sale/request-too-large');
  const rawBody = await request.text();
  if (enc.encode(rawBody).byteLength > 256 * 1024) throw new ApiError(413, 'sale/request-too-large');
  let body;
  try { body = JSON.parse(rawBody); } catch { throw new ApiError(400, 'sale/invalid-json'); }
  const normalized = normalizeRequest(body);
  const requestHash = await hashRequest(normalized);
  for (let attempt = 0; attempt < 4; attempt += 1) {
    try {
      const result = await oneTransaction(env, normalized, user, requestHash);
      const role = result.role || (user.email === env.OWNER_EMAIL.toLowerCase() ? 'OWNER' : 'SALES_OPERATOR');
      return json(publicResult(role, result.sale, result.alreadyCommitted));
    } catch (error) {
      if (error instanceof ApiError && error.retryable && attempt < 3) {
        await new Promise((resolve) => setTimeout(resolve, 15 * (2 ** attempt) + Math.floor(Math.random() * 10)));
        continue;
      }
      throw error;
    }
  }
  throw new ApiError(409, 'sale/retry-exhausted');
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (request.method === 'OPTIONS' && (url.pathname.startsWith('/api/lamsa/sales')
        || url.pathname.startsWith('/api/lamsa/commission-counter'))) {
      try {
        if (!request.headers.get('origin')) throw new ApiError(403, 'worker/origin-not-allowed');
        assertLamsaRequestAllowed(request, env);
        return withWorkerCors(new Response(null, { status: 204 }), request, env);
      } catch (error) {
        const status = error instanceof ApiError ? error.status : 503;
        const code = error instanceof ApiError ? error.code : 'worker/request-disabled';
        return withWorkerCors(json({ ok: false, error: code }, status), request, env);
      }
    }
    if (request.method === 'GET' && url.pathname === '/health') {
      try {
        if (env?.ENVIRONMENT === 'local-emulator') assertEmulatorOnly(env);
        else assertProductionFirestoreConfig(env, { requireTransportEnabled: false });
        return json({ ok: true });
      }
      catch { return json({ ok: false }, 503); }
    }
    if (request.method === 'POST' && url.pathname === '/api/lamsa/commission-counter/bootstrap') {
      try {
        assertLamsaRequestAllowed(request, env);
        return withWorkerCors(await handleLamsaCommissionCounterBootstrap(request, env, {
          authenticate, ...firestoreTransport,
        }), request, env);
      } catch (error) {
        const status = error instanceof ApiError ? error.status : (Number.isInteger(error?.status) ? error.status : 502);
        const code = error instanceof ApiError ? error.code : (error?.code || 'sale/commission-counter-unexpected-error');
        return withWorkerCors(json({ ok: false, error: code }, status), request, env);
      }
    }
    if (request.method === 'POST' && url.pathname === '/api/lamsa/sales/quote') {
      try {
        assertLamsaRequestAllowed(request, env);
        const response = await handleLamsaSaleQuote(request, env, { authenticate, ...firestoreTransport });
        return withWorkerCors(response, request, env);
      } catch (error) {
        const status = error instanceof ApiError ? error.status : (Number.isInteger(error?.status) ? error.status : 502);
        const code = error instanceof ApiError ? error.code : (error?.code || 'sale/quote-unexpected-error');
        return withWorkerCors(json({ ok: false, error: code }, status), request, env);
      }
    }
    if (request.method === 'POST' && url.pathname === '/api/lamsa/sales') {
      try {
        assertLamsaRequestAllowed(request, env);
        return withWorkerCors(await handleLamsaSale(request, env, { authenticate, ...firestoreTransport }), request, env);
      } catch (error) {
        const status = error instanceof ApiError ? error.status : (Number.isInteger(error?.status) ? error.status : 502);
        const code = error instanceof ApiError ? error.code : (error?.code || 'sale/unexpected-error');
        return withWorkerCors(json({ ok: false, error: code }, status), request, env);
      }
    }
    const lamsaReversal = url.pathname.match(/^\/api\/lamsa\/sales\/([A-Za-z0-9_-]{4,120})\/reverse$/);
    if (request.method === 'POST' && lamsaReversal) {
      try {
        assertLamsaRequestAllowed(request, env);
        return withWorkerCors(await handleLamsaSaleReversal(request, lamsaReversal[1], env, {
          authenticate, ...firestoreTransport,
        }), request, env);
      } catch (error) {
        const status = error instanceof ApiError ? error.status : (Number.isInteger(error?.status) ? error.status : 502);
        const code = error instanceof ApiError ? error.code : (error?.code || 'sale/reversal-unexpected-error');
        return withWorkerCors(json({ ok: false, error: code }, status), request, env);
      }
    }
    if (request.method !== 'POST' || url.pathname !== '/api/sales') return json({ error: 'not-found' }, 404);
    try {
      assertEmulatorOnly(env);
      return await handleSale(request, env);
    }
    catch (error) {
      const status = error instanceof ApiError ? error.status : 502;
      const code = error instanceof ApiError ? error.code : 'sale/unexpected-error';
      return json({ ok: false, error: code }, status);
    }
  },
};
