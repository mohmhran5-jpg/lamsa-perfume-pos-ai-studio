import test, { after, before, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { deleteApp, initializeApp } from 'firebase/app';
import { initializeTestEnvironment, assertFails, assertSucceeds } from '@firebase/rules-unit-testing';
import { collection, connectFirestoreEmulator, deleteDoc, doc, getDoc, getDocs, getFirestore, limit, onSnapshot, orderBy, query, runTransaction, serverTimestamp, setDoc, Timestamp, where, writeBatch } from 'firebase/firestore';
import {
  commitSaleAndInventory,
  deleteSaleAndRestoreInventory,
  getSaleStockDeductions,
  reverseSaleAndInventory,
  updateSaleAndInventory,
} from '../services/saleSync.ts';
import { enqueueOfflineAction, flushPendingSaleQueue, getOfflineQueue, saveOfflineQueue } from '../services/offlineSyncService.ts';
import { calculateExactDailyCommission, DEFAULT_COMMISSION_POLICY } from '../services/staffEntitlementsService.ts';

const PROJECT_ID = 'demo-lamsa-auth-security';
const NAMED_DATABASE_ID = JSON.parse(await readFile(new URL('../firebase-applet-config.json', import.meta.url), 'utf8')).firestoreDatabaseId;
const OWNER_EMAIL = 'moh.mhran@gmail.com';
const TAREK_EMAIL = 'ttaarreekkessam@gmail.com';
const DYNAMIC_MANAGER_EMAIL = 'operator@example.com';
const INVENTORY_VIEWER_EMAIL = 'stock-only@example.com';
const ALLOWED_COLLECTIONS = [
  'sales',
  'products',
  'customers',
  'customer_requests',
  'staff_attendance',
  'bottleSizes',
  'production_batches',
  'stock_checks',
  'purchase_requests',
  'replenishment_orders',
  'fragrance_database',
  'saved_mixes',
  'connected_devices',
  'owner_broadcasts',
  'staff_entitlements',
  'staff_advances',
  'staff_settlements',
  'staff_incentives',
  'staff_deductions',
  'vaults',
  'settings',
  'expenses',
  'withdrawals',
  'audit_logs',
  'app_users',
  'daily_closures',
  'commission_day_counters',
  'commission_policies',
  'commission_audit_logs',
  'test',
  'product_operations',
  'product_costs',
  'tarek_operational_costs',
  'tarek_operational_costs_meta',
  'tarek_saved_mixes',
  'mix_operations',
  'mix_costs',
  'sale_operations',
  'sale_costs',
  'sale_financials',
  'operational_settings',
  'cost_catalog',
  'financial_admin',
  'tarek_products',
  'tarek_sale_products',
  'tarek_sale_bottle_sizes',
];
const UNKNOWN_DOCUMENT = 'unlisted_security_test/seed-document';
const NESTED_DOCUMENTS = [
  'products/seed-parent/private/seed-document',
  'products/seed-parent/private/seed-document/deeper/seed-document',
  'unlisted_security_test/seed-parent/private/seed-document',
];

test('Firebase CLI Firestore rules target only the named database used by the app', async () => {
  const firebaseConfig = JSON.parse(await readFile(new URL('../firebase.json', import.meta.url), 'utf8'));
  assert.ok(Array.isArray(firebaseConfig.firestore));
  assert.deepEqual(firebaseConfig.firestore.map((entry) => ({ database: entry.database, rules: entry.rules })), [
    { database: NAMED_DATABASE_ID, rules: 'firestore.rules' },
  ]);
});

test('Firestore serverTimestamp is readable after commit while original occurredAt remains unchanged', async () => {
  const occurredAt = '2026-10-15T10:00:00.000Z';
  const ref = doc(ownerDb, 'test', `server-time-${randomUUID()}`);
  let timestampVisibleBeforeCommit;
  await assertSucceeds(runTransaction(ownerDb, async (transaction) => {
    const beforeWrite = await transaction.get(ref);
    timestampVisibleBeforeCommit = beforeWrite.data()?.serverAcceptedAt;
    transaction.set(ref, { occurredAt, serverAcceptedAt: serverTimestamp() });
  }));
  assert.equal(timestampVisibleBeforeCommit, undefined);
  const saved = (await getDoc(ref)).data();
  assert.equal(saved.occurredAt, occurredAt);
  assert.ok(saved.serverAcceptedAt instanceof Timestamp);
  assert.ok(saved.serverAcceptedAt.toDate() instanceof Date);
});

function validWritePayload(collection, id) {
  if (collection === 'sales') return {
    id,
    date: '2026-10-15T10:00:00.000Z',
    items: [{ id: 'line-1', productId: 'oil', productName: 'Oil', bottleSize: 10, essenceGrams: 3, sellingPrice: 30 }],
    totalPrice: 30,
  };
  if (collection === 'tarek_saved_mixes') return {
    schemaVersion: 1,
    id,
    name: 'وصفة اختبار معتمدة',
    bottleSizeMl: 30,
    totalEssenceGrams: 10,
    components: [{ productId: 'oil-a', grams: 6 }, { productId: 'oil-b', grams: 4 }],
    isOwnerApproved: true,
    updatedAt: '2026-10-16T12:00:00.000Z',
  };
  if (collection === 'products') return { id, name: 'Oil', stock_grams: 100 };
  if (collection === 'customers') return { id, name: 'Test Customer' };
  if (collection === 'bottleSizes') return { id, sizeMl: 10, essenceGrams: 3, normalPrice: 30, specialPrice: 40 };
  if (collection === 'expenses') return { id, title: 'Test expense', amount: 1, category: 'أخرى', date: '2026-10-15' };
  if (collection === 'settings') return { storeName: 'لمسة عطر', currency: 'ج.م' };
  if (collection === 'tarek_operational_costs') return {
    schemaVersion: 1,
    productId: id,
    customGramCostEgp: 12,
  };
  if (collection === 'tarek_operational_costs_meta') return {
    schemaVersion: 1,
    status: 'ready',
    productCount: 1,
    updatedAt: '2026-10-17T00:00:00.000Z',
  };
  return { written: true };
}

function productFixture(id, stock = 100, overrides = {}) {
  return {
    id,
    name: `Product ${id}`,
    brand: 'Fixture Brand',
    origin: 'local',
    gender: 'مشترك',
    season: 'كل الفصول',
    type: 'عادي',
    stock_grams: stock,
    ...overrides,
  };
}

async function seedProduct(db, id, product) {
  await setDoc(doc(db, 'products', id), product);
  await setDoc(doc(db, 'product_operations', id), {
    schemaVersion: 1,
    id,
    name: product.name,
    brand: product.brand,
    origin: product.origin,
    gender: product.gender,
    season: product.season,
    type: product.type,
    stock_grams: product.stock_grams,
  });
  await setDoc(doc(db, 'tarek_products', id), {
    schemaVersion: 1,
    id,
    name: product.name,
    brand: product.brand,
    origin: product.origin,
    gender: product.gender,
    season: product.season,
    type: product.type,
    stock_grams: product.stock_grams,
    ...(product.min_threshold_grams === undefined ? {} : { min_threshold_grams: product.min_threshold_grams }),
  });
}

let testEnvironment;
let ownerDb;
let ownerDeviceTwoDb;
let otherAccountDb;
let tarekDb;
let dynamicManagerDb;
let inventoryViewerDb;
let wrongProviderDynamicManagerDb;
let wrongProviderTarekDb;
let unverifiedOwnerDb;
let unauthenticatedDb;
let anonymousAuthDb;

async function withMemoryLocalStorage(run) {
  const prior = Object.getOwnPropertyDescriptor(globalThis, 'localStorage');
  const data = new Map();
  Object.defineProperty(globalThis, 'localStorage', {
    configurable: true,
    value: {
      getItem: (key) => data.get(key) ?? null,
      setItem: (key, value) => data.set(key, String(value)),
      removeItem: (key) => data.delete(key),
      clear: () => data.clear(),
    },
  });
  try {
    return await run();
  } finally {
    if (prior) Object.defineProperty(globalThis, 'localStorage', prior);
    else delete globalThis.localStorage;
  }
}

before(async () => {
  const rules = await readFile(new URL('../firestore.rules', import.meta.url), 'utf8');
  testEnvironment = await initializeTestEnvironment({
    projectId: PROJECT_ID,
    firestore: {
      host: '127.0.0.1',
      port: 8080,
      rules,
    },
  });

  ownerDb = testEnvironment.authenticatedContext('verified-owner', {
    email: OWNER_EMAIL,
    email_verified: true,
    firebase: { sign_in_provider: 'google.com' },
  }).firestore();
  ownerDeviceTwoDb = testEnvironment.authenticatedContext('verified-owner-device-2', {
    email: OWNER_EMAIL,
    email_verified: true,
    firebase: { sign_in_provider: 'google.com' },
  }).firestore();
  otherAccountDb = testEnvironment.authenticatedContext('other-account', {
    email: 'other@example.com',
    email_verified: true,
    firebase: { sign_in_provider: 'google.com' },
  }).firestore();
  dynamicManagerDb = testEnvironment.authenticatedContext('dynamic-manager', {
    email: DYNAMIC_MANAGER_EMAIL,
    email_verified: true,
    firebase: { sign_in_provider: 'google.com' },
  }).firestore();
  inventoryViewerDb = testEnvironment.authenticatedContext('inventory-viewer', {
    email: INVENTORY_VIEWER_EMAIL,
    email_verified: true,
    firebase: { sign_in_provider: 'google.com' },
  }).firestore();
  wrongProviderDynamicManagerDb = testEnvironment.authenticatedContext('dynamic-manager-password', {
    email: DYNAMIC_MANAGER_EMAIL,
    email_verified: true,
    firebase: { sign_in_provider: 'password' },
  }).firestore();
  tarekDb = testEnvironment.authenticatedContext('verified-tarek', {
    email: TAREK_EMAIL,
    email_verified: true,
    firebase: { sign_in_provider: 'google.com' },
  }).firestore();
  wrongProviderTarekDb = testEnvironment.authenticatedContext('tarek-password-provider', {
    email: TAREK_EMAIL,
    email_verified: true,
    firebase: { sign_in_provider: 'password' },
  }).firestore();
  unverifiedOwnerDb = testEnvironment.authenticatedContext('unverified-owner', {
    email: OWNER_EMAIL,
    email_verified: false,
    firebase: { sign_in_provider: 'google.com' },
  }).firestore();
  unauthenticatedDb = testEnvironment.unauthenticatedContext().firestore();
  anonymousAuthDb = testEnvironment.authenticatedContext('firebase-anonymous', {
    firebase: { sign_in_provider: 'anonymous' },
  }).firestore();
});

after(async () => {
  await testEnvironment?.cleanup();
});

beforeEach(async () => {
  await testEnvironment.clearFirestore();
  await testEnvironment.withSecurityRulesDisabled(async (context) => {
    const adminDb = context.firestore();
    const seededDocuments = ALLOWED_COLLECTIONS.map((collectionName) =>
      setDoc(doc(adminDb, collectionName, 'seed-document'), collectionName === 'sale_operations'
        ? { seeded: true, id: 'seed-document', date: '2026-10-15T10:00:00.000Z', items: [], totalPrice: 0 }
        : collectionName === 'tarek_operational_costs'
        ? { schemaVersion: 1, productId: 'seed-product', customGramCostEgp: 12 }
        : collectionName === 'tarek_saved_mixes'
        ? validWritePayload(collectionName, 'seed-document')
        : { seeded: true }),
    );
    seededDocuments.push(
      setDoc(doc(adminDb, UNKNOWN_DOCUMENT), { seeded: true }),
      ...NESTED_DOCUMENTS.map((path) => setDoc(doc(adminDb, path), { seeded: true })),
      setDoc(doc(adminDb, 'products', 'legacy-mixed-product'), {
        name: 'Legacy product fixture',
        customGramCostEgp: 12,
        customSellingPriceOverride: 90,
        profit: 20,
      }),
      setDoc(doc(adminDb, 'sales', 'legacy-mixed-sale'), {
        totalPrice: 90,
        totalCost: 45,
        totalProfit: 40,
        items: [{ productName: 'Legacy sale fixture', cost: 45, sellingPrice: 90, profit: 40 }],
      }),
      setDoc(doc(adminDb, 'commission_day_counters', '2026-10-15'), {
        schemaVersion: 1,
        status: 'ready',
        dateKey: '2026-10-15',
        sprayBottlesSold: 0,
        generation: 0,
        initializedAt: '2026-10-15T00:00:00.000Z',
        updatedAt: '2026-10-15T00:00:00.000Z',
        historySource: 'sales+sale_operations-v1',
        historicalSaleIdsScanned: 0,
      }),
    );
    await Promise.all(seededDocuments);
  });
});

test('unauthenticated user is denied reads on a protected collection', async () => {
  await assertFails(getDoc(doc(unauthenticatedDb, 'sales/seed-document')));
});

test('unauthenticated user is denied writes on a protected collection', async () => {
  await assertFails(setDoc(doc(unauthenticatedDb, 'sales/write-target'), { value: 1 }));
});

test('a different verified email is denied reads on a protected collection', async () => {
  await assertFails(getDoc(doc(otherAccountDb, 'sales/seed-document')));
});

test('a different verified email is denied writes on a protected collection', async () => {
  await assertFails(setDoc(doc(otherAccountDb, 'sales/write-target'), { value: 1 }));
});

test('the owner email without email verification is denied reads', async () => {
  await assertFails(getDoc(doc(unverifiedOwnerDb, 'sales/seed-document')));
});

test('the owner email without email verification is denied writes', async () => {
  await assertFails(setDoc(doc(unverifiedOwnerDb, 'sales/write-target'), { value: 1 }));
});

test('a Firebase-authenticated anonymous user is denied reads', async () => {
  await assertFails(getDoc(doc(anonymousAuthDb, 'sales/seed-document')));
});

test('a Firebase-authenticated anonymous user is denied writes', async () => {
  await assertFails(setDoc(doc(anonymousAuthDb, 'sales/write-target'), { value: 1 }));
});

test('verified ungranted Google user may request access but cannot grant access to self or others', async () => {
  const email = 'other@example.com';
  const requestRef = doc(otherAccountDb, 'access_requests', email);
  const request = {
    email,
    requesterUid: 'other-account',
    displayName: 'Other Account',
    requestedAt: '2026-10-15T10:00:00.000Z',
    status: 'pending',
  };

  await assertSucceeds(setDoc(requestRef, request));
  assert.equal((await assertSucceeds(getDoc(requestRef))).data().status, 'pending');
  await assertFails(getDoc(doc(otherAccountDb, 'access_requests', DYNAMIC_MANAGER_EMAIL)));
  await assertFails(setDoc(doc(otherAccountDb, 'role_assignments', email), roleAssignment(email)));
  await assertFails(setDoc(requestRef, { ...request, status: 'approved' }));
  await assertSucceeds(getDoc(doc(ownerDb, 'access_requests', email)));

  await assertSucceeds(setDoc(doc(ownerDb, 'access_requests', email), {
    status: 'dismissed',
    reviewedAt: '2026-10-15T10:05:00.000Z',
    reviewedBy: OWNER_EMAIL,
  }, { merge: true }));
  await assertSucceeds(setDoc(requestRef, { ...request, requestedAt: '2026-10-15T10:10:00.000Z' }));

  const approval = writeBatch(ownerDb);
  approval.set(doc(ownerDb, 'role_assignments', email), roleAssignment(email));
  approval.set(doc(ownerDb, 'access_requests', email), {
    status: 'approved',
    reviewedAt: '2026-10-15T10:15:00.000Z',
    reviewedBy: OWNER_EMAIL,
    grantedRole: 'STORE_MANAGER',
  }, { merge: true });
  await assertSucceeds(approval.commit());
  assert.equal((await assertSucceeds(getDoc(doc(ownerDb, 'access_requests', email)))).data().status, 'approved');
});

test('unverified or non-Google identities cannot submit access requests', async () => {
  await assertFails(setDoc(doc(unverifiedOwnerDb, 'access_requests', OWNER_EMAIL), {
    email: OWNER_EMAIL,
    requesterUid: 'unverified-owner',
    displayName: 'Owner',
    requestedAt: '2026-10-15T10:00:00.000Z',
    status: 'pending',
  }));
  await assertFails(setDoc(doc(wrongProviderDynamicManagerDb, 'access_requests', DYNAMIC_MANAGER_EMAIL), {
    email: DYNAMIC_MANAGER_EMAIL,
    requesterUid: 'dynamic-manager-password',
    displayName: 'Password User',
    requestedAt: '2026-10-15T10:00:00.000Z',
    status: 'pending',
  }));
});

test('users with an active operational grant cannot create a redundant access request', async () => {
  await testEnvironment.withSecurityRulesDisabled(async (context) => {
    await setDoc(doc(context.firestore(), 'role_assignments', DYNAMIC_MANAGER_EMAIL), roleAssignment(DYNAMIC_MANAGER_EMAIL));
  });
  await assertFails(setDoc(doc(dynamicManagerDb, 'access_requests', DYNAMIC_MANAGER_EMAIL), {
    email: DYNAMIC_MANAGER_EMAIL,
    requesterUid: 'dynamic-manager',
    displayName: 'Dynamic Manager',
    requestedAt: '2026-10-15T10:00:00.000Z',
    status: 'pending',
  }));
});

for (const collection of ['sales', 'sale_quotes', 'vaults', 'settings', 'expenses', 'app_users', 'commission_policies', 'commission_day_counters', 'sale_costs', 'sale_financials', 'financial_admin', 'product_operations', 'mix_operations', 'mix_costs', 'operational_settings', 'product_costs', 'cost_catalog', 'tarek_operational_costs_meta']) {
  test(`verified Tarek cannot read sensitive ${collection} records`, async () => {
    await assertFails(getDoc(doc(tarekDb, collection, 'seed-document')));
  });
}

test('sale quotes are inaccessible to every Firebase client, including the verified owner', async () => {
  await assertFails(getDoc(doc(ownerDb, 'sale_quotes', 'client-denied-quote')));
  await assertFails(setDoc(doc(ownerDb, 'sale_quotes', 'client-denied-quote'), { status: 'ready' }));
});

const TAREK_OPERATIONAL_READS = [
  'tarek_products',
  'tarek_sale_products',
  'tarek_sale_bottle_sizes',
  'sale_operations',
];

for (const collection of TAREK_OPERATIONAL_READS) {
  test(`verified Tarek can read only the safe operational projection ${collection}`, async () => {
    const snapshot = await assertSucceeds(getDoc(doc(tarekDb, collection, 'seed-document')));
    assert.equal(snapshot.exists(), true);
    await assertFails(setDoc(doc(tarekDb, collection, 'tarek-write-attempt'), { forgedRole: 'OWNER' }));
  });
}

test('Tarek can read only owner-approved, narrow saved-mix projections', async () => {
  const safeMix = {
    schemaVersion: 1,
    id: 'approved-mix',
    name: 'وصفة معتمدة',
    bottleSizeMl: 30,
    totalEssenceGrams: 10,
    components: [
      { productId: 'oil-1', grams: 6 },
      { productId: 'oil-2', grams: 4 },
    ],
    isOwnerApproved: true,
    updatedAt: '2026-10-16T12:00:00.000Z',
  };
  await assertSucceeds(setDoc(doc(ownerDb, 'tarek_saved_mixes', safeMix.id), safeMix));
  const savedMix = await assertSucceeds(getDoc(doc(tarekDb, 'tarek_saved_mixes', safeMix.id)));
  assert.deepEqual(savedMix.data(), safeMix);
  const approvedQuery = await assertSucceeds(getDocs(query(
    collection(tarekDb, 'tarek_saved_mixes'),
    where('isOwnerApproved', '==', true),
    where('schemaVersion', '==', 1),
    limit(100),
  )));
  assert.equal(approvedQuery.docs.some((item) => item.id === safeMix.id), true);
  for (const item of approvedQuery.docs) {
    assert.equal('totalCostEgp' in item.data(), false);
    assert.equal('totalProfitEgp' in item.data(), false);
  }
  await assertFails(setDoc(doc(tarekDb, 'tarek_saved_mixes', 'tarek-write'), safeMix));
  await assertFails(setDoc(doc(inventoryViewerDb, 'tarek_saved_mixes', 'viewer-write'), safeMix));
  await assertFails(setDoc(doc(ownerDb, 'tarek_saved_mixes', 'unsafe-owner-write'), {
    ...safeMix,
    id: 'unsafe-owner-write',
    totalCostEgp: 999,
  }));

  await testEnvironment.withSecurityRulesDisabled(async (context) => {
    await setDoc(doc(context.firestore(), 'tarek_saved_mixes', 'malformed-projection'), {
      ...safeMix,
      id: 'malformed-projection',
      components: [{ productId: 'oil-1', grams: 10, oilGramCostEgp: 999 }],
    });
  });
  await assertFails(getDoc(doc(tarekDb, 'tarek_saved_mixes', 'malformed-projection')));
  await assertFails(deleteDoc(doc(tarekDb, 'tarek_saved_mixes', safeMix.id)));
  await assertSucceeds(deleteDoc(doc(ownerDb, 'tarek_saved_mixes', safeMix.id)));
});

test('verified Tarek can list only the separate narrow operational product-cost collection', async () => {
  await testEnvironment.withSecurityRulesDisabled(async (context) => {
    await deleteDoc(doc(context.firestore(), 'tarek_operational_costs', 'seed-document'));
  });
  const allowedCost = {
    schemaVersion: 1,
    productId: 'oil-safe-cost',
    customGramCostEgp: 12,
    updatedAt: '2026-10-16T00:00:00.000Z',
  };
  await assertSucceeds(setDoc(doc(ownerDb, 'tarek_operational_costs', 'oil-safe-cost'), allowedCost));
  const costSnapshot = await assertSucceeds(getDoc(doc(tarekDb, 'tarek_operational_costs', 'oil-safe-cost')));
  assert.deepEqual(costSnapshot.data(), allowedCost);
  const safeCostQuery = await assertSucceeds(getDocs(query(collection(tarekDb, 'tarek_operational_costs'), limit(500))));
  assert.equal(safeCostQuery.size, 1);
  await assertFails(setDoc(doc(tarekDb, 'tarek_operational_costs', 'tarek-write-attempt'), allowedCost));
  await assertFails(setDoc(doc(ownerDb, 'tarek_operational_costs', 'unsafe-cost'), {
    ...allowedCost,
    totalProfitEgp: 999,
  }));
  await assertFails(getDoc(doc(tarekDb, 'product_costs', 'seed-document')));
  await assertFails(getDoc(doc(tarekDb, 'cost_catalog', 'seed-document')));
  await assertFails(getDoc(doc(tarekDb, 'mix_costs', 'seed-document')));
  await assertFails(getDoc(doc(tarekDb, 'sale_costs', 'seed-document')));
});

test('only legacy Tarek or an active STORE_MANAGER grant receives operational product costs', async () => {
  const cost = { schemaVersion: 1, productId: 'oil-role-test', customGramCostEgp: 8 };
  await assertSucceeds(setDoc(doc(ownerDb, 'tarek_operational_costs', 'oil-role-test'), cost));
  await testEnvironment.withSecurityRulesDisabled(async (context) => {
    await setDoc(doc(context.firestore(), 'role_assignments', INVENTORY_VIEWER_EMAIL), roleAssignment(INVENTORY_VIEWER_EMAIL, true, 'INVENTORY_VIEWER'));
    await setDoc(doc(context.firestore(), 'role_assignments', DYNAMIC_MANAGER_EMAIL), roleAssignment(DYNAMIC_MANAGER_EMAIL));
  });
  await assertFails(getDoc(doc(inventoryViewerDb, 'tarek_operational_costs', 'oil-role-test')));
  await assertSucceeds(getDoc(doc(dynamicManagerDb, 'tarek_operational_costs', 'oil-role-test')));
});

test('verified Tarek can query the ordered operational sale stream used by the workspace', async () => {
  const snapshot = await assertSucceeds(getDocs(query(
    collection(tarekDb, 'sale_operations'), orderBy('date', 'desc'), limit(50),
  )));
  assert.equal(snapshot.size, 1);
  assert.equal('totalProfitEgp' in snapshot.docs[0].data(), false);
});

test('the app named-database ID connects to the Emulator and preserves owner-only financial rules', async () => {
  const suffix = randomUUID();
  const makeClient = (name, email) => {
    const app = initializeApp({ apiKey: 'local-emulator-only', projectId: PROJECT_ID }, `${name}-${suffix}`);
    const db = getFirestore(app, NAMED_DATABASE_ID);
    connectFirestoreEmulator(db, '127.0.0.1', 8080, email ? {
      mockUserToken: {
        sub: `${name}-${suffix}`,
        user_id: `${name}-${suffix}`,
        email,
        email_verified: true,
        firebase: { sign_in_provider: 'google.com' },
      },
    } : {});
    return { app, db };
  };
  const owner = makeClient('named-owner', OWNER_EMAIL);
  const tarek = makeClient('named-tarek', TAREK_EMAIL);
  const stranger = makeClient('named-stranger', 'stranger@example.com');
  const unauthenticated = makeClient('named-unauthenticated', null);
  const saleId = `named-db-sale-${suffix}`;
  const operationalSale = {
    schemaVersion: 1,
    id: saleId,
    date: '2026-10-16T07:00:00.000Z',
    items: [{ id: 'line-1', productId: 'oil', productName: 'Oil', productType: 'عادي', bottleSize: 10, essenceGrams: 2, sellingPrice: 30 }],
    totalPrice: 30,
  };

  try {
    await assertSucceeds(setDoc(doc(owner.db, 'sale_operations', saleId), operationalSale));
    await assertSucceeds(setDoc(doc(owner.db, 'sale_costs', saleId), { schemaVersion: 1, saleId, totalCostEgp: 10 }));
    await assertSucceeds(setDoc(doc(owner.db, 'sale_financials', saleId), { schemaVersion: 1, saleId, totalProfitEgp: 20 }));
    await assertSucceeds(setDoc(doc(owner.db, 'product_costs', saleId), { schemaVersion: 1, productId: saleId, customGramCostEgp: 12 }));
    await assertSucceeds(setDoc(doc(owner.db, 'tarek_operational_costs', saleId), { schemaVersion: 1, productId: saleId, customGramCostEgp: 12 }));
    await assertSucceeds(setDoc(doc(owner.db, 'cost_catalog', saleId), { schemaVersion: 1, costPolicy: { commissionRate: 0.05 } }));
    const employeeRead = await assertSucceeds(getDoc(doc(tarek.db, 'sale_operations', saleId)));
    assert.equal(employeeRead.data().totalPrice, 30);
    assert.equal('totalCostEgp' in employeeRead.data(), false);
    await assertFails(getDoc(doc(tarek.db, 'sale_costs', saleId)));
    await assertFails(getDoc(doc(tarek.db, 'sale_financials', saleId)));
    await assertFails(getDoc(doc(tarek.db, 'product_costs', saleId)));
    const tarekCostRead = await assertSucceeds(getDoc(doc(tarek.db, 'tarek_operational_costs', saleId)));
    assert.equal(tarekCostRead.data().customGramCostEgp, 12);
    assert.equal('totalProfitEgp' in tarekCostRead.data(), false);
    await assertFails(getDoc(doc(tarek.db, 'cost_catalog', saleId)));
    await assertFails(getDoc(doc(tarek.db, 'commission_day_counters', '2026-10-16')));
    await assertFails(getDoc(doc(tarek.db, 'financial_admin', 'store')));
    await assertFails(getDoc(doc(tarek.db, 'operational_settings', 'store')));
    await assertFails(setDoc(doc(tarek.db, 'sale_operations', `forged-${suffix}`), operationalSale));
    await assertFails(getDoc(doc(stranger.db, 'sale_operations', saleId)));
    await assertFails(getDoc(doc(unauthenticated.db, 'sale_operations', saleId)));
  } finally {
    await deleteApp(owner.app);
    await deleteApp(tarek.app);
    await deleteApp(stranger.app);
    await deleteApp(unauthenticated.app);
  }
});

test('verified Tarek cannot read legacy product or sale documents even when their IDs are known', async () => {
  await assertFails(getDoc(doc(tarekDb, 'products', 'legacy-mixed-product')));
  await assertFails(getDoc(doc(tarekDb, 'sales', 'legacy-mixed-sale')));
});

test('Tarek address alone is insufficient without a verified Google provider', async () => {
  await assertFails(getDoc(doc(wrongProviderTarekDb, 'tarek_products', 'seed-document')));
  await assertFails(setDoc(doc(wrongProviderTarekDb, 'sale_operations', 'forged'), { forged: true }));
});

function roleAssignment(email, active = true, role = 'STORE_MANAGER') {
  return {
    email,
    role,
    active,
    updatedAt: '2026-10-15T10:00:00.000Z',
    updatedBy: OWNER_EMAIL,
  };
}

test('any email needs an owner grant for safe projections; financial collections remain owner-only', async () => {
  await assertFails(getDoc(doc(dynamicManagerDb, 'tarek_products', 'seed-document')));
  await assertFails(getDoc(doc(dynamicManagerDb, 'product_costs', 'seed-document')));
  await assertSucceeds(setDoc(
    doc(ownerDb, 'role_assignments', DYNAMIC_MANAGER_EMAIL),
    roleAssignment(DYNAMIC_MANAGER_EMAIL),
  ));
  assert.equal((await assertSucceeds(getDoc(doc(dynamicManagerDb, 'role_assignments', DYNAMIC_MANAGER_EMAIL)))).data().active, true);
  await assertSucceeds(getDoc(doc(dynamicManagerDb, 'tarek_products', 'seed-document')));
  await assertSucceeds(getDoc(doc(dynamicManagerDb, 'sale_operations', 'seed-document')));
  await assertSucceeds(getDoc(doc(dynamicManagerDb, 'tarek_sale_products', 'seed-document')));
  await assertSucceeds(getDoc(doc(dynamicManagerDb, 'tarek_sale_bottle_sizes', 'seed-document')));
  for (const collectionName of [
    'product_costs', 'cost_catalog', 'mix_costs', 'sale_costs', 'sale_financials',
    'commission_day_counters', 'commission_policies', 'financial_admin',
    'operational_settings', 'vaults', 'expenses', 'settings', 'daily_closures',
  ]) {
    await assertFails(getDoc(doc(dynamicManagerDb, collectionName, 'seed-document')));
  }
  await assertFails(getDoc(doc(dynamicManagerDb, 'products', 'legacy-mixed-product')));
  await assertFails(getDoc(doc(dynamicManagerDb, 'sales', 'legacy-mixed-sale')));
  await assertFails(setDoc(doc(dynamicManagerDb, 'role_assignments', 'victim@example.com'), roleAssignment('victim@example.com')));
  await assertFails(setDoc(doc(dynamicManagerDb, 'tarek_products', 'forged'), { id: 'forged', stock_grams: 1 }));
  await assertFails(getDoc(doc(wrongProviderDynamicManagerDb, 'tarek_products', 'seed-document')));
});

test('inventory-only role can read stock but cannot read operating costs or sales', async () => {
  await assertSucceeds(setDoc(
    doc(ownerDb, 'role_assignments', INVENTORY_VIEWER_EMAIL),
    roleAssignment(INVENTORY_VIEWER_EMAIL, true, 'INVENTORY_VIEWER'),
  ));
  await assertSucceeds(getDoc(doc(inventoryViewerDb, 'role_assignments', INVENTORY_VIEWER_EMAIL)));
  await assertSucceeds(getDoc(doc(inventoryViewerDb, 'tarek_products', 'seed-document')));
  await assertFails(getDoc(doc(inventoryViewerDb, 'product_costs', 'seed-document')));
  await assertFails(getDoc(doc(inventoryViewerDb, 'cost_catalog', 'seed-document')));
  await assertFails(getDoc(doc(inventoryViewerDb, 'sales', 'seed-document')));
  await assertFails(getDoc(doc(inventoryViewerDb, 'sale_operations', 'seed-document')));
  await assertFails(getDoc(doc(inventoryViewerDb, 'tarek_sale_products', 'seed-document')));
  await assertFails(getDoc(doc(inventoryViewerDb, 'tarek_sale_bottle_sizes', 'seed-document')));
  await assertFails(getDoc(doc(inventoryViewerDb, 'settings', 'seed-document')));
});

test('owner can revoke Tarek or a dynamic grant, and no grant can assign OWNER', async () => {
  await assertSucceeds(getDoc(doc(tarekDb, 'tarek_products', 'seed-document')));
  await assertSucceeds(setDoc(
    doc(ownerDb, 'role_assignments', TAREK_EMAIL),
    roleAssignment(TAREK_EMAIL, false),
  ));
  await assertFails(getDoc(doc(tarekDb, 'tarek_products', 'seed-document')));

  await assertSucceeds(setDoc(
    doc(ownerDb, 'role_assignments', DYNAMIC_MANAGER_EMAIL),
    roleAssignment(DYNAMIC_MANAGER_EMAIL),
  ));
  await assertSucceeds(getDoc(doc(dynamicManagerDb, 'tarek_products', 'seed-document')));
  await assertSucceeds(setDoc(
    doc(ownerDb, 'role_assignments', DYNAMIC_MANAGER_EMAIL),
    roleAssignment(DYNAMIC_MANAGER_EMAIL, false),
  ));
  await assertFails(getDoc(doc(dynamicManagerDb, 'tarek_products', 'seed-document')));
  await assertFails(setDoc(
    doc(ownerDb, 'role_assignments', 'other-owner@example.com'),
    roleAssignment('other-owner@example.com', true, 'OWNER'),
  ));
});

test('Tarek queued sale remains local when Firestore denies it, then owner retries once atomically', async () => {
  await withMemoryLocalStorage(async () => {
    const sale = {
      id: 'emulator-sale-retry-1',
      date: '2026-10-15T10:00:00.000Z',
      items: [{ id: 'line-1', productId: 'oil-retry-1', productName: 'Oil', bottleSize: 10, essenceGrams: 12, sellingPrice: 120, quantity: 1 }],
      totalPrice: 120,
      totalCost: 40,
      totalProfit: 80,
      transactionType: 'بيع_طبيعي',
      commissionDayKey: '2026-10-15',
      commissionSprayBottleCount: 1,
      commissionCounterGeneration: 0,
    };
    await seedProduct(ownerDb, 'oil-retry-1', productFixture('oil-retry-1', 100, {
      customGramCostEgp: 12,
      customSellingPriceOverride: 190,
      profit: 99,
    }));
    const queuedSaleItem = enqueueOfflineAction('sale', sale);

    const denied = await flushPendingSaleQueue((queuedSale) => commitSaleAndInventory(tarekDb, queuedSale));
    assert.deepEqual(denied, { attempted: 1, synced: 0, failed: 1, syncedIds: [] });
    assert.equal(getOfflineQueue()[0].retryCount, 1);
    assert.equal((await getDoc(doc(ownerDb, 'products', 'oil-retry-1'))).data().stock_grams, 100);
    assert.equal((await getDoc(doc(ownerDb, 'tarek_products', 'oil-retry-1'))).data().stock_grams, 100);
    assert.equal((await getDoc(doc(ownerDb, 'sales', sale.id))).exists(), false);

    const retried = await flushPendingSaleQueue((queuedSale) => commitSaleAndInventory(ownerDb, queuedSale));
    assert.deepEqual(retried, { attempted: 1, synced: 1, failed: 0, syncedIds: [queuedSaleItem.id] });
    assert.deepEqual(getOfflineQueue(), []);
    assert.equal((await getDoc(doc(ownerDb, 'products', 'oil-retry-1'))).data().stock_grams, 100);
    const tarekProjection = (await getDoc(doc(ownerDb, 'tarek_products', 'oil-retry-1'))).data();
    assert.equal(tarekProjection.stock_grams, 88);
    assert.equal((await getDoc(doc(ownerDb, 'product_operations', 'oil-retry-1'))).data().stock_grams, 88);
    assert.equal('customGramCostEgp' in tarekProjection, false);
    assert.equal('customSellingPriceOverride' in tarekProjection, false);
    assert.equal('profit' in tarekProjection, false);
    assert.equal((await getDoc(doc(ownerDb, 'sales', sale.id))).exists(), true);
    const saleOperation = (await getDoc(doc(tarekDb, 'sale_operations', sale.id))).data();
    assert.equal(saleOperation.totalPrice, sale.totalPrice);
    assert.deepEqual(Object.keys(saleOperation).filter((key) => /(cost|profit|commission|margin)/i.test(key)), []);

    // A retry from a separate authenticated device observes the same sale ID
    // and is idempotent rather than deducting stock a second time.
    await assertSucceeds(commitSaleAndInventory(ownerDeviceTwoDb, queuedSaleItem.payload));
    assert.equal((await getDoc(doc(ownerDb, 'products', 'oil-retry-1'))).data().stock_grams, 100);
    assert.equal((await getDoc(doc(ownerDb, 'tarek_products', 'oil-retry-1'))).data().stock_grams, 88);
    const storedSale = (await getDoc(doc(ownerDb, 'sales', sale.id))).data();
    assert.equal(storedSale.id, sale.id);
    assert.equal(storedSale.date, sale.date);
    assert.equal(storedSale.commissionDayKey, sale.commissionDayKey);
    const matchingSales = await getDocs(query(collection(ownerDb, 'sales'), where('id', '==', sale.id)));
    assert.equal(matchingSales.size, 1);
  });
});

test('simulated offline owner sale replays with the same invoice ID, original date and one counter update', async () => {
  await withMemoryLocalStorage(async () => {
    const sale = {
      id: 'emulator-offline-owner-retry-1',
      date: '2026-10-15T10:00:00.000Z',
      items: [{ id: 'line-1', productId: 'oil-offline-owner', productName: 'Oil', bottleSize: 10, essenceGrams: 12, sellingPrice: 120, quantity: 1 }],
      totalPrice: 120,
      totalCost: 40,
      totalProfit: 80,
      transactionType: 'بيع_طبيعي',
      commissionDayKey: '2026-10-15',
      commissionSprayBottleCount: 1,
      commissionCounterGeneration: 0,
    };
    await seedProduct(ownerDb, 'oil-offline-owner', productFixture('oil-offline-owner', 100));
    const queued = enqueueOfflineAction('sale', sale);
    const originalDeviceTimestamp = queued.payload.deviceTimestamp;

    const offline = await flushPendingSaleQueue(async () => {
      throw Object.assign(new Error('simulated offline'), { code: 'unavailable' });
    });
    assert.deepEqual(offline, { attempted: 1, synced: 0, failed: 1, syncedIds: [] });
    const stillQueued = getOfflineQueue()[0];
    assert.equal(stillQueued.id, queued.id);
    assert.equal(stillQueued.payload.id, sale.id);
    assert.equal(stillQueued.payload.date, sale.date);
    assert.equal(stillQueued.payload.deviceTimestamp, originalDeviceTimestamp);
    assert.equal((await getDoc(doc(ownerDb, 'sales', sale.id))).exists(), false);

    const reconnected = await flushPendingSaleQueue((pendingSale) => commitSaleAndInventory(ownerDb, pendingSale));
    assert.deepEqual(reconnected, { attempted: 1, synced: 1, failed: 0, syncedIds: [queued.id] });
    assert.deepEqual(getOfflineQueue(), []);

    const stored = (await getDoc(doc(ownerDb, 'sales', sale.id))).data();
    assert.equal(stored.id, sale.id);
    assert.equal(stored.date, sale.date);
    assert.equal(stored.commissionDayKey, sale.commissionDayKey);
    assert.equal(stored.deviceTimestamp, originalDeviceTimestamp);
    assert.equal(stored.isOfflineCreated, true);
    const matches = await getDocs(query(collection(ownerDb, 'sales'), where('id', '==', sale.id)));
    assert.equal(matches.size, 1);

    await assertSucceeds(commitSaleAndInventory(ownerDeviceTwoDb, queued.payload));
    assert.equal((await getDoc(doc(ownerDb, 'products', 'oil-offline-owner'))).data().stock_grams, 100);
    assert.equal((await getDoc(doc(ownerDb, 'tarek_products', 'oil-offline-owner'))).data().stock_grams, 88);
    assert.equal((await getDoc(doc(ownerDb, 'product_operations', 'oil-offline-owner'))).data().stock_grams, 88);
    const counter = (await getDoc(doc(ownerDb, 'commission_day_counters', sale.commissionDayKey))).data();
    assert.equal(counter.sprayBottlesSold, 1);
    assert.equal(counter.generation, 1);
  });
});

test('owner POS atomically publishes a safe operational sale while keeping cost and profit owner-only', async () => {
  const productId = 'oil-owner-sale-projection';
  const sale = saleFixture('sale-owner-operational-projection', productId, 8, {
    customerName: 'Customer Example',
    customerPhone: '01000000000',
  });
  await seedProduct(ownerDb, productId, productFixture(productId, 100));

  await assertSucceeds(commitSaleAndInventory(ownerDb, sale));
  const counterAfterSale = (await getDoc(doc(ownerDb, 'commission_day_counters', '2026-10-15'))).data();
  assert.equal(counterAfterSale.sprayBottlesSold, 1);
  assert.equal(counterAfterSale.generation, 1);
  assert.equal(counterAfterSale.lastAppliedSaleId, sale.id);

  const operationalSnapshot = await assertSucceeds(getDoc(doc(tarekDb, 'sale_operations', sale.id)));
  const operational = operationalSnapshot.data();
  assert.equal(operational.id, sale.id);
  assert.equal(operational.totalPrice, sale.totalPrice);
  assert.equal(operational.items[0].sellingPrice, sale.items[0].sellingPrice);
  assert.equal(operational.customerName, sale.customerName);
  const forbiddenKeys = (value) => value && typeof value === 'object'
    ? Object.entries(value).flatMap(([key, nested]) => [key, ...forbiddenKeys(nested)])
    : [];
  assert.deepEqual(forbiddenKeys(operational).filter((key) => /(cost|profit|commission|margin)/i.test(key)), []);

  const costs = await assertSucceeds(getDoc(doc(ownerDb, 'sale_costs', sale.id)));
  const financials = await assertSucceeds(getDoc(doc(ownerDb, 'sale_financials', sale.id)));
  assert.equal(costs.data().totalCostEgp, sale.totalCost);
  assert.equal(financials.data().totalProfitEgp, sale.totalProfit);
  await assertFails(getDoc(doc(tarekDb, 'sale_costs', sale.id)));
  await assertFails(getDoc(doc(tarekDb, 'sale_financials', sale.id)));
  await assertFails(getDoc(doc(tarekDb, 'sales', sale.id)));
});

test('an existing operational sale ID without its owner legacy record is never overwritten', async () => {
  const productId = 'oil-sale-id-collision';
  const sale = saleFixture('sale-id-collision-protected', productId, 8);
  await seedProduct(ownerDb, productId, productFixture(productId, 100));
  const existingOperationalSale = {
    schemaVersion: 1,
    id: sale.id,
    date: sale.date,
    items: [],
    totalPrice: 25,
    employeeName: 'Tarek',
  };
  await setDoc(doc(ownerDb, 'sale_operations', sale.id), existingOperationalSale);

  await assert.rejects(commitSaleAndInventory(ownerDb, sale), /sale-sync\/operational-sale-id-conflict/);
  assert.deepEqual((await getDoc(doc(ownerDb, 'sale_operations', sale.id))).data(), existingOperationalSale);
  assert.equal((await getDoc(doc(ownerDb, 'sales', sale.id))).exists(), false);
  assert.equal((await getDoc(doc(ownerDb, 'tarek_products', productId))).data().stock_grams, 100);
});

test('mix sale deductions aggregate per component and missing inventory prevents any sale write', async () => {
  const mixSale = {
    id: 'emulator-mix-sale-stock',
    date: '2026-10-15T10:01:00.000Z',
    items: [{
      id: 'mix-line',
      productId: 'mix',
      productName: 'Mix',
      isMix: true,
      quantity: 2,
      bottleSize: 10,
      essenceGrams: 16,
      sellingPrice: 200,
      mixComponents: [
        { productId: 'oil-a', grams: 3 },
        { productId: 'oil-b', grams: 5 },
      ],
    }],
    totalPrice: 200,
    transactionType: 'بيع_طبيعي',
    commissionDayKey: '2026-10-15',
    commissionSprayBottleCount: 2,
    commissionCounterGeneration: 0,
  };
  await seedProduct(ownerDb, 'oil-a', productFixture('oil-a', 20));
  await seedProduct(ownerDb, 'oil-b', productFixture('oil-b', 50));
  await assertSucceeds(commitSaleAndInventory(ownerDb, mixSale));
  assert.equal((await getDoc(doc(ownerDb, 'products', 'oil-a'))).data().stock_grams, 20);
  assert.equal((await getDoc(doc(ownerDb, 'products', 'oil-b'))).data().stock_grams, 50);
  assert.equal((await getDoc(doc(ownerDb, 'tarek_products', 'oil-a'))).data().stock_grams, 14);
  assert.equal((await getDoc(doc(ownerDb, 'tarek_products', 'oil-b'))).data().stock_grams, 40);

  const missingProductSale = {
    id: 'emulator-sale-missing-stock',
    date: '2026-10-15T10:02:00.000Z',
    items: [{ id: 'line-missing', productId: 'not-seeded', productName: 'Missing', bottleSize: 10, essenceGrams: 1, sellingPrice: 10 }],
    totalPrice: 10,
    transactionType: 'بيع_طبيعي',
    commissionDayKey: '2026-10-15',
    commissionSprayBottleCount: 1,
    commissionCounterGeneration: 1,
  };
  await assert.rejects(commitSaleAndInventory(ownerDb, missingProductSale), /sale-sync\/missing-product/);
  assert.equal((await getDoc(doc(ownerDb, 'sales', missingProductSale.id))).exists(), false);
});

test('owner sale streams the same updated stock to Tarek without exposing legacy cost or price fields', async () => {
  const productId = 'oil-live-projection';
  await setDoc(doc(ownerDb, 'products', productId), productFixture(productId, 100, {
    customGramCostEgp: 14,
    customSellingPriceOverride: 210,
    profit: 80,
  }));
  await setDoc(doc(ownerDb, 'tarek_products', productId), {
    schemaVersion: 1,
    id: productId,
    name: `Product ${productId}`,
    brand: 'Fixture Brand',
    origin: 'local',
    gender: 'مشترك',
    season: 'كل الفصول',
    type: 'عادي',
    stock_grams: 100,
  });

  let initialSeen = false;
  let unsubscribe = () => {};
  let resolveInitial;
  let resolveUpdated;
  let rejectInitial;
  let rejectUpdated;
  const initialStock = new Promise((resolve, reject) => {
    resolveInitial = resolve;
    rejectInitial = reject;
  });
  const updatedStock = new Promise((resolve, reject) => {
    resolveUpdated = resolve;
    rejectUpdated = reject;
  });
  void updatedStock.catch(() => {});
  const timeout = setTimeout(() => {
    const reason = new Error('Timed out waiting for Tarek stock snapshot');
    rejectInitial(reason);
    rejectUpdated(reason);
  }, 8000);
  unsubscribe = onSnapshot(doc(tarekDb, 'tarek_products', productId), (snapshot) => {
    if (!snapshot.exists()) return;
    const stock = snapshot.data().stock_grams;
    if (!initialSeen) {
      initialSeen = true;
      resolveInitial(stock);
    } else if (stock === 88) {
      resolveUpdated(stock);
    }
  }, (reason) => {
    rejectInitial(reason);
    rejectUpdated(reason);
  });

  try {
    assert.equal(await initialStock, 100);
    await assertSucceeds(commitSaleAndInventory(ownerDb, saleFixture('sale-live-projection', productId, 12)));
    assert.equal(await updatedStock, 88);
    const projection = (await getDoc(doc(tarekDb, 'tarek_products', productId))).data();
    assert.equal(projection.stock_grams, 88);
    assert.deepEqual(Object.keys(projection).filter((key) => /(cost|profit|sellingprice|commission|margin)/i.test(key)), []);
    await assertFails(setDoc(doc(tarekDb, 'tarek_products', productId), { ...projection, stock_grams: 1 }));
  } finally {
    clearTimeout(timeout);
    unsubscribe();
  }
});

test('400-component owner sale stays atomic when only canonical stock exists and fails closed if dual projections exceed 500 writes', async () => {
  const productIds = Array.from({ length: 400 }, (_, index) => `oil-stress-${index}`);
  await testEnvironment.withSecurityRulesDisabled(async (context) => {
    const adminDb = context.firestore();
    await Promise.all(productIds.map((id) => setDoc(doc(adminDb, 'tarek_products', id), {
      schemaVersion: 1, id, name: `Product ${id}`, stock_grams: 10,
    })));
  });
  const firstSale = {
    id: 'sale-400-canonical-stock-only',
    date: '2026-10-15T10:05:00.000Z',
    items: Array.from({ length: 100 }, (_, line) => ({
      id: `line-${line}`,
      productId: `mix-${line}`,
      productName: `Mix ${line}`,
      isMix: true,
      quantity: 1,
      bottleSize: 30,
      essenceGrams: 4,
      sellingPrice: 100,
      mixComponents: Array.from({ length: 4 }, (_, component) => ({
        productId: `oil-stress-${line * 4 + component}`,
        grams: 1,
      })),
    })),
    totalPrice: 10000,
    transactionType: 'بيع_طبيعي',
    commissionDayKey: '2026-10-15',
    commissionSprayBottleCount: 100,
    commissionCounterGeneration: 0,
  };
  assert.equal(getSaleStockDeductions(firstSale).size, 400);
  await assertSucceeds(commitSaleAndInventory(ownerDb, firstSale));
  for (const id of [productIds[0], productIds[199], productIds[399]]) {
    assert.equal((await getDoc(doc(tarekDb, 'tarek_products', id))).data().stock_grams, 9);
  }

  await testEnvironment.withSecurityRulesDisabled(async (context) => {
    const adminDb = context.firestore();
    await Promise.all(productIds.map((id) => setDoc(doc(adminDb, 'product_operations', id), {
      schemaVersion: 1, id, stock_grams: 9,
    })));
  });
  const secondSale = { ...firstSale, id: 'sale-400-dual-stock-guard', commissionCounterGeneration: 1 };
  await assert.rejects(commitSaleAndInventory(ownerDb, secondSale), /sale-sync\/transaction-write-limit/);
  assert.equal((await getDoc(doc(ownerDb, 'sales', secondSale.id))).exists(), false);
  assert.equal((await getDoc(doc(ownerDb, 'sale_operations', secondSale.id))).exists(), false);
  assert.equal((await getDoc(doc(tarekDb, 'tarek_products', productIds[0]))).data().stock_grams, 9);
});

for (const collection of ALLOWED_COLLECTIONS) {
  test(`verified owner can read ${collection}`, async () => {
    const snapshot = await assertSucceeds(getDoc(doc(ownerDb, collection, 'seed-document')));
    assert.equal(snapshot.exists(), true);
    const expected = collection === 'sale_operations'
      ? { seeded: true, id: 'seed-document', date: '2026-10-15T10:00:00.000Z', items: [], totalPrice: 0 }
      : collection === 'tarek_operational_costs'
      ? { schemaVersion: 1, productId: 'seed-product', customGramCostEgp: 12 }
      : collection === 'tarek_saved_mixes'
      ? validWritePayload(collection, 'seed-document')
      : { seeded: true };
    assert.deepEqual(snapshot.data(), expected);
  });
}

for (const collection of ALLOWED_COLLECTIONS.filter((name) => !['sales', 'commission_day_counters'].includes(name))) {
  test(`verified owner can write ${collection}`, async () => {
    const documentId = collection === 'settings' ? 'store' : 'write-target';
    await assertSucceeds(setDoc(doc(ownerDb, collection, documentId), validWritePayload(collection, documentId)));
  });
}

test('daily commission counter is owner-only; orphan updates and deletion are denied', async () => {
  const seededCounter = await assertSucceeds(getDoc(doc(ownerDb, 'commission_day_counters', '2026-10-15')));
  assert.equal(seededCounter.data().status, 'ready');
  await assertFails(getDoc(doc(tarekDb, 'commission_day_counters', '2026-10-15')));
  await assertFails(setDoc(doc(tarekDb, 'commission_day_counters', '2026-10-17'), { status: 'ready' }));

  const initial = {
    schemaVersion: 1,
    status: 'ready',
    dateKey: '2026-10-17',
    sprayBottlesSold: 0,
    generation: 0,
    initializedAt: '2026-10-17T00:00:00.000Z',
    updatedAt: '2026-10-17T00:00:00.000Z',
    historySource: 'sales+sale_operations-v1',
    historicalSaleIdsScanned: 0,
  };
  const counterRef = doc(ownerDb, 'commission_day_counters', '2026-10-17');
  await assertSucceeds(setDoc(counterRef, initial));
  await assertFails(setDoc(counterRef, {
    ...initial,
    sprayBottlesSold: 1,
    generation: 1,
    lastAppliedSaleId: 'orphan-sale',
    lastAppliedAction: 'sale',
    updatedAt: '2026-10-17T00:01:00.000Z',
  }));
  await assertFails(deleteDoc(counterRef));
});

test('owner writes reject malformed financial, inventory, settings and customer payloads', async () => {
  await assertFails(setDoc(doc(ownerDb, 'sales', 'negative-price'), {
    id: 'negative-price', date: '2026-10-15', totalPrice: -1, items: [{ id: 'line' }],
  }));
  await assertFails(setDoc(doc(ownerDb, 'sales', 'mismatched-id'), {
    id: 'another-id', date: '2026-10-15', totalPrice: 10, items: [{ id: 'line' }],
  }));
  await assertFails(setDoc(doc(ownerDb, 'products', 'negative-stock'), {
    id: 'negative-stock', name: 'Oil', stock_grams: -1,
  }));
  await assertFails(setDoc(doc(ownerDb, 'expenses', 'missing-category'), {
    id: 'missing-category', title: 'Expense', amount: 10, date: '2026-10-15',
  }));
  await assertFails(setDoc(doc(ownerDb, 'bottleSizes', 'bad-size'), {
    id: 'bad-size', sizeMl: '10', essenceGrams: 3, normalPrice: 30, specialPrice: 40,
  }));
  await assertFails(setDoc(doc(ownerDb, 'settings', 'store'), { storeName: 42, currency: true }));
  await assertFails(setDoc(doc(ownerDb, 'customers', 'script-name'), {
    id: 'script-name', name: '<script>alert(1)</script>',
  }));
});

function saleFixture(id, productId, grams, overrides = {}) {
  const sale = {
    id,
    date: '2026-10-15T10:00:00.000Z',
    items: [{ id: `line-${id}`, productId, productName: 'Oil', bottleSize: 10, essenceGrams: grams, cost: 40, sellingPrice: 120, profit: 60, quantity: 1 }],
    totalPrice: 120,
    totalCost: 40,
    totalProfit: 60,
    commissionAmount: 6,
    ...overrides,
  };
  const sprayCount = sale.isReversed === true
    || (sale.transactionType !== undefined && sale.transactionType !== 'بيع_طبيعي')
    ? 0
    : sale.items.reduce((sum, item) => sum
      + (item.isRollOn === true || [2, 3, 5].includes(item.bottleSize) ? 0 : (item.quantity ?? 1)), 0);
  return {
    ...sale,
    commissionDayKey: sale.date.slice(0, 10),
    commissionSprayBottleCount: sprayCount,
    commissionCounterGeneration: 0,
  };
}

test('all product deductions are aggregated and invalid or oversized sale payloads are rejected without writes', async () => {
  await seedProduct(ownerDb, 'oil-aggregate', productFixture('oil-aggregate', 10));
  const duplicateLines = saleFixture('sale-duplicate-lines', 'oil-aggregate', 6, {
    items: [
      { id: 'line-a', productId: 'oil-aggregate', productName: 'Oil', bottleSize: 10, essenceGrams: 6, sellingPrice: 60 },
      { id: 'line-b', productId: 'oil-aggregate', productName: 'Oil', bottleSize: 10, essenceGrams: 6, sellingPrice: 60 },
    ],
  });
  assert.equal(getSaleStockDeductions(duplicateLines).get('oil-aggregate'), 12);
  await assert.rejects(commitSaleAndInventory(ownerDb, duplicateLines), /sale-sync\/insufficient-stock/);
  assert.equal((await getDoc(doc(ownerDb, 'sales', duplicateLines.id))).exists(), false);
  assert.equal((await getDoc(doc(ownerDb, 'products', 'oil-aggregate'))).data().stock_grams, 10);

  const negativeEssence = saleFixture('sale-negative-grams', 'oil-aggregate', -1);
  await assert.rejects(commitSaleAndInventory(ownerDb, negativeEssence), /sale-sync\/invalid-stock-deduction/);
  const slashId = saleFixture('bad/id', 'oil-aggregate', 1);
  await assert.rejects(commitSaleAndInventory(ownerDb, slashId), /sale-sync\/invalid-sale-id/);
  const excessiveSale = saleFixture('sale-5000-grams', 'oil-aggregate', 5000);
  await assert.rejects(commitSaleAndInventory(ownerDb, excessiveSale), /sale-sync\/insufficient-stock/);
  assert.equal((await getDoc(doc(ownerDb, 'sales', excessiveSale.id))).exists(), false);
});

test('two terminals racing for the same stock cannot oversell', async () => {
  await seedProduct(ownerDb, 'oil-race', productFixture('oil-race', 20));
  const first = saleFixture('sale-race-1', 'oil-race', 12);
  const second = saleFixture('sale-race-2', 'oil-race', 12);
  const results = await Promise.allSettled([
    commitSaleAndInventory(ownerDb, first),
    commitSaleAndInventory(ownerDeviceTwoDb, second),
  ]);
  assert.equal(results.filter(result => result.status === 'fulfilled').length, 1);
  assert.equal(results.filter(result => result.status === 'rejected').length, 1);
  assert.equal((await getDoc(doc(ownerDb, 'products', 'oil-race'))).data().stock_grams, 20);
  assert.equal((await getDoc(doc(ownerDb, 'sales', first.id))).exists() + (await getDoc(doc(ownerDb, 'sales', second.id))).exists(), 1);
});

test('invoice financial edits are denied; owner reversal remains atomic and idempotent', async () => {
  await seedProduct(ownerDb, 'oil-edit', productFixture('oil-edit', 100));
  const original = saleFixture('sale-edit-atomic', 'oil-edit', 12);
  await commitSaleAndInventory(ownerDb, original);
  const edited = { ...original, totalPrice: 150, items: [{ ...original.items[0], essenceGrams: 18, sellingPrice: 150 }] };
  await assert.rejects(updateSaleAndInventory(ownerDb, edited, true), (error) => error.code === 'permission-denied');
  assert.equal((await getDoc(doc(ownerDb, 'sales', original.id))).data().totalPrice, original.totalPrice);
  assert.equal((await getDoc(doc(ownerDb, 'products', 'oil-edit'))).data().stock_grams, 100);
  assert.equal((await getDoc(doc(ownerDb, 'tarek_products', 'oil-edit'))).data().stock_grams, 88);

  await testEnvironment.withSecurityRulesDisabled(async (context) => {
    const adminDb = context.firestore();
    for (const [id, balance] of [['restock', 100], ['commissions', 100], ['owner_profit', 100]]) {
      await setDoc(doc(adminDb, 'vaults', id), { id, currentBalance: balance });
    }
  });
  assert.equal(await reverseSaleAndInventory(ownerDb, original.id, 'reason', 'owner', true), 'reversed');
  assert.equal((await getDoc(doc(ownerDb, 'sales', original.id))).data().isReversed, true);
  const reversedOperationalSale = (await getDoc(doc(tarekDb, 'sale_operations', original.id))).data();
  assert.equal(reversedOperationalSale.isReversed, true);
  assert.equal(reversedOperationalSale.reversalReason, 'reason');
  assert.deepEqual(Object.keys(reversedOperationalSale).filter((key) => /(cost|profit|commission|margin)/i.test(key)), []);
  assert.equal((await getDoc(doc(ownerDb, 'products', 'oil-edit'))).data().stock_grams, 100);
  assert.equal((await getDoc(doc(ownerDb, 'tarek_products', 'oil-edit'))).data().stock_grams, 100);
  assert.equal((await getDoc(doc(ownerDb, 'product_operations', 'oil-edit'))).data().stock_grams, 100);
  const reversedCounter = (await getDoc(doc(ownerDb, 'commission_day_counters', '2026-10-15'))).data();
  assert.equal(reversedCounter.sprayBottlesSold, 0);
  assert.equal(reversedCounter.generation, 2);
  assert.equal(reversedCounter.lastAppliedAction, 'reversal');
  assert.equal((await getDoc(doc(ownerDb, 'vaults', 'restock'))).data().currentBalance, 60);
  assert.equal((await getDoc(doc(ownerDb, 'vaults', 'commissions'))).data().currentBalance, 94);
  assert.equal((await getDoc(doc(ownerDb, 'vaults', 'owner_profit'))).data().currentBalance, 40);
  assert.equal(await reverseSaleAndInventory(ownerDb, original.id, 'reason', 'owner', true), 'already-reversed');
  assert.equal((await getDoc(doc(ownerDb, 'products', 'oil-edit'))).data().stock_grams, 100);
  assert.equal((await getDoc(doc(ownerDb, 'tarek_products', 'oil-edit'))).data().stock_grams, 100);
  assert.equal((await getDoc(doc(ownerDb, 'vaults', 'restock'))).data().currentBalance, 60);
});

test('owner sale commits inventory atomically without automatic commission when the daily counter is missing', async () => {
  const sale = saleFixture('sale-missing-counter', 'oil-missing-counter', 12, { date: '2026-10-16T10:00:00.000Z' });
  await seedProduct(ownerDb, 'oil-missing-counter', productFixture('oil-missing-counter', 100));
  await assertSucceeds(commitSaleAndInventory(ownerDb, sale));
  const saved = (await getDoc(doc(ownerDb, 'sales', sale.id))).data();
  assert.equal(saved.commissionTimingStatus, 'needs_owner_review');
  assert.equal(saved.commissionReviewReason, 'counter-not-ready');
  assert.equal(saved.commissionAmount, 0);
  assert.equal(saved.totalProfit, 0);
  assert.ok(saved.serverAcceptedAt instanceof Timestamp);
  assert.equal((await getDoc(doc(ownerDb, 'products', 'oil-missing-counter'))).data().stock_grams, 100,
    'the legacy product record remains owner-private and is not the shared operational stock source');
  assert.equal((await getDoc(doc(ownerDb, 'tarek_products', 'oil-missing-counter'))).data().stock_grams, 88);
  assert.equal((await getDoc(doc(ownerDb, 'commission_day_counters', '2026-10-16'))).exists(), false);
  assert.equal((await getDoc(doc(ownerDb, 'sale_financials', sale.id))).exists(), false);
  const commission = calculateExactDailyCommission([saved], 'طارق', '2026-10-16', DEFAULT_COMMISSION_POLICY);
  assert.equal(commission.totalCommissionEgp, 0);
  assert.equal(commission.eligibleSalesCount, 0);
});

test('owner POS review payload commits before counter readiness with zero commission and no counter write', async () => {
  const sale = saleFixture('owner-pos-review-before-counter', 'oil-owner-pos-review', 12, {
    date: '2026-10-16T10:00:00.000Z',
    items: [{ id: 'line-owner-pos-review', productId: 'oil-owner-pos-review', productName: 'Oil', bottleSize: 10,
      essenceGrams: 12, cost: 40, sellingPrice: 120, profit: 0, quantity: 1 }],
    totalProfit: 0,
    commissionAmount: 0,
    totalCommission: 0,
    commissionTimingStatus: 'needs_owner_review',
    commissionReviewReason: 'counter-not-ready',
    commissionCandidateDayKey: '2026-10-16',
  });
  await seedProduct(ownerDb, 'oil-owner-pos-review', productFixture('oil-owner-pos-review', 100));
  await assertSucceeds(commitSaleAndInventory(ownerDb, sale));
  const saved = (await getDoc(doc(ownerDb, 'sales', sale.id))).data();
  assert.equal(saved.commissionTimingStatus, 'needs_owner_review');
  assert.equal(saved.commissionReviewReason, 'counter-not-ready');
  assert.equal(saved.commissionAmount, 0);
  assert.equal(saved.totalCommission, 0);
  assert.equal(saved.totalProfit, 0);
  assert.equal(saved.items[0].profit, 0);
  assert.equal((await getDoc(doc(ownerDb, 'commission_day_counters', '2026-10-16'))).exists(), false);
  assert.equal((await getDoc(doc(ownerDb, 'sale_financials', sale.id))).exists(), false);
  assert.equal((await getDoc(doc(ownerDb, 'tarek_products', 'oil-owner-pos-review'))).data().stock_grams, 88);
  const commission = calculateExactDailyCommission([saved], 'طارق', '2026-10-16', DEFAULT_COMMISSION_POLICY);
  assert.equal(commission.totalCommissionEgp, 0);
  assert.equal(commission.eligibleSalesCount, 0);
});

test('owner sale with a stale counter generation commits as owner-review and does not change the counter', async () => {
  const first = saleFixture('owner-counter-first', 'oil-counter-first', 10);
  const stale = saleFixture('owner-counter-stale', 'oil-counter-stale', 10);
  await seedProduct(ownerDb, 'oil-counter-first', productFixture('oil-counter-first', 100));
  await seedProduct(ownerDb, 'oil-counter-stale', productFixture('oil-counter-stale', 100));

  await commitSaleAndInventory(ownerDb, first);
  await assertSucceeds(commitSaleAndInventory(ownerDb, stale));
  assert.equal((await getDoc(doc(ownerDb, 'sales', first.id))).exists(), true);
  const pending = (await getDoc(doc(ownerDb, 'sales', stale.id))).data();
  assert.equal(pending.commissionTimingStatus, 'needs_owner_review');
  assert.equal(pending.commissionReviewReason, 'counter-stale');
  assert.equal((await getDoc(doc(ownerDb, 'tarek_products', 'oil-counter-stale'))).data().stock_grams, 90);
  const counter = (await getDoc(doc(ownerDb, 'commission_day_counters', '2026-10-15'))).data();
  assert.equal(counter.sprayBottlesSold, 1);
  assert.equal(counter.generation, 1);
});

test('owner can reverse an owner-review sale and restore inventory without changing any commission counter', async () => {
  const sale = saleFixture('sale-review-reversal', 'oil-review-reversal', 12, { date: '2026-10-16T10:00:00.000Z' });
  await seedProduct(ownerDb, 'oil-review-reversal', productFixture('oil-review-reversal', 100));
  await testEnvironment.withSecurityRulesDisabled(async (context) => {
    await setDoc(doc(context.firestore(), 'vaults', 'restock'), { id: 'restock', currentBalance: 100 });
  });
  await assertSucceeds(commitSaleAndInventory(ownerDb, sale));
  assert.equal((await getDoc(doc(ownerDb, 'tarek_products', 'oil-review-reversal'))).data().stock_grams, 88);
  await assertSucceeds(reverseSaleAndInventory(ownerDb, sale.id, 'owner review correction', 'owner', true));
  const reversed = (await getDoc(doc(ownerDb, 'sales', sale.id))).data();
  assert.equal(reversed.isReversed, true);
  assert.equal(reversed.commissionTimingStatus, 'needs_owner_review');
  assert.equal((await getDoc(doc(ownerDb, 'tarek_products', 'oil-review-reversal'))).data().stock_grams, 100);
  assert.equal((await getDoc(doc(ownerDb, 'commission_day_counters', '2026-10-16'))).exists(), false);
});

test('permanent invoice deletion is blocked without changing sale or stock', async () => {
  await seedProduct(ownerDb, 'oil-delete', productFixture('oil-delete', 100));
  const sale = saleFixture('sale-delete-atomic', 'oil-delete', 12);
  await commitSaleAndInventory(ownerDb, sale);
  assert.throws(() => deleteSaleAndRestoreInventory(ownerDb, sale.id, true), /sale\/permanent-delete-disabled/);
  await assert.rejects(deleteDoc(doc(ownerDb, 'sales', sale.id)), (error) => error.code === 'permission-denied');
  assert.equal((await getDoc(doc(ownerDb, 'sales', sale.id))).exists(), true);
  assert.equal((await getDoc(doc(ownerDb, 'products', 'oil-delete'))).data().stock_grams, 100);
  assert.equal((await getDoc(doc(ownerDb, 'tarek_products', 'oil-delete'))).data().stock_grams, 88);
});

test('verified owner is denied reads from an unknown collection', async () => {
  await assertFails(getDoc(doc(ownerDb, UNKNOWN_DOCUMENT)));
});

test('verified owner is denied writes to an unknown collection', async () => {
  await assertFails(setDoc(doc(ownerDb, 'unlisted_security_test/write-target'), { value: 1 }));
});

test('verified owner is denied reads from nested or otherwise unmatched paths', async () => {
  for (const path of NESTED_DOCUMENTS) {
    await assertFails(getDoc(doc(ownerDb, path)));
  }
});

test('verified owner is denied writes to nested or otherwise unmatched paths', async () => {
  const targetPaths = [
    'products/seed-parent/private/write-target',
    'products/seed-parent/private/write-target/deeper/document',
    'unlisted_security_test/seed-parent/private/write-target',
  ];
  for (const path of targetPaths) {
    await assertFails(setDoc(doc(ownerDb, path), { value: 1 }));
  }
});


test('a quantity-multiplied single-product line is deducted exactly once', async () => {
  await seedProduct(ownerDb, 'oil-single-quantity', productFixture('oil-single-quantity', 100));
  const sale = saleFixture('sale-single-quantity', 'oil-single-quantity', 12, {
    totalPrice: 360,
    items: [{ id: 'line-single', productId: 'oil-single-quantity', productName: 'Oil', bottleSize: 10, essenceGrams: 12, sellingPrice: 360, quantity: 3 }],
  });
  assert.equal(getSaleStockDeductions(sale).get('oil-single-quantity'), 12);
  await commitSaleAndInventory(ownerDb, sale);
  assert.equal((await getDoc(doc(ownerDb, 'products', 'oil-single-quantity'))).data().stock_grams, 100);
});
