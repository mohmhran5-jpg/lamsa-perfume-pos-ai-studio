import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { after, before, beforeEach, test } from 'node:test';
import {
  assertFails,
  assertSucceeds,
  initializeTestEnvironment,
} from '@firebase/rules-unit-testing';
import { collection, doc, getDoc, getDocs, query, setDoc, updateDoc, where, writeBatch } from 'firebase/firestore';

const projectId = 'demo-lamsa-security';
const ownerEmail = 'owner@lamsa.test';
const tarekEmail = 'tarek@lamsa.test';
const rules = readFileSync(fileURLToPath(new URL('../firestore.rules', import.meta.url)), 'utf8');
const permissionKeys = [
  'canRecordSale', 'canEditSaleBeforeClose', 'canCancelSale', 'canReturnSale',
  'canApplyDiscount', 'canOverridePrice', 'canManageCustomers', 'canViewStock',
  'canRecordShortage', 'canStockCheck', 'canCreatePurchaseRequest', 'canEditProductCost',
  'canEditProductPrice', 'canOpenDay', 'canCloseDay', 'canReopenClosedDay',
  'canLogFieldActivity', 'canViewExecutiveDashboard', 'canViewVaults',
  'canRequestWithdrawal', 'canApproveWithdrawal', 'canInjectCapital',
  'canTransferBetweenVaults', 'canWithdrawOwnerProfit', 'canEditBudget',
  'canEditSalaries', 'canEditCommissions', 'canManageUsers', 'canViewAuditLog',
  'canExportData', 'canViewProfits', 'canViewCosts', 'canViewExpenses',
  'canViewReports', 'canManageSettings', 'canAccessOperationsSystem',
  'canViewCostAndProfit', 'canViewProfitAndCosts', 'canViewAuditLogs',
  'canEditSettingsAndBudgets', 'canDeleteInvoices',
];
const tarekPermissions = Object.fromEntries(permissionKeys.map((key) => [key, false]));
Object.assign(tarekPermissions, {
  canRecordSale: true,
  canEditSaleBeforeClose: true,
  canCancelSale: true,
  canManageCustomers: true,
  canViewStock: true,
  canRecordShortage: true,
  canStockCheck: true,
  canCreatePurchaseRequest: true,
  canOpenDay: true,
  canCloseDay: true,
  canLogFieldActivity: true,
  canViewCosts: true,
});

let testEnv;

function googleContext(email, uid = email) {
  return testEnv.authenticatedContext(uid, {
    email,
    email_verified: true,
    firebase: { sign_in_provider: 'google.com' },
  }).firestore();
}

function publicSale(overrides = {}) {
  return {
    id: 'sale-1',
    totalPrice: 400,
    date: '2026-10-08',
    employeeName: 'طارق',
    transactionType: 'بيع_طبيعي',
    createdByUid: 'tarek-uid',
    itemCount: 1,
    itemsSchemaVersion: 2,
    itemsReady: true,
    ...overrides,
  };
}

function publicSaleItem(saleId, index, overrides = {}) {
  return {
    id: `${saleId}-item-${index}`,
    lineItemId: `${saleId}-item-${index}`,
    saleId,
    itemIndex: index,
    createdByUid: 'tarek-uid',
    compositionType: 'single',
    productId: 'p-1',
    productName: 'عطر تجريبي',
    productType: 'عادي',
    bottleSize: 50,
    essenceGrams: 10,
    sellingPrice: 400,
    quantity: 1,
    ...overrides,
  };
}

function employeeCost(sourceCollection, sourceId, payload, createdByUid = 'tarek-uid') {
  return {
    sourceCollection,
    sourceId,
    payload,
    ...(createdByUid ? { createdByUid } : {}),
    updatedAt: '2026-10-08T12:00:00.000Z',
  };
}

before(async () => {
  testEnv = await initializeTestEnvironment({
    projectId,
    firestore: { rules },
  });
});

after(async () => {
  await testEnv?.cleanup();
});

beforeEach(async () => {
  await testEnv.clearFirestore();
  await testEnv.withSecurityRulesDisabled(async (context) => {
    const db = context.firestore();
    await setDoc(doc(db, 'authorized_users', ownerEmail), {
      email: ownerEmail,
      appUserId: 'user-mohamed',
      displayName: 'د. محمد',
      username: 'mohamed',
      role: 'OWNER',
      isActive: true,
      migrationReady: true,
      permissions: {},
    });
    await setDoc(doc(db, 'authorized_users', tarekEmail), {
      email: tarekEmail,
      appUserId: 'user-tarek',
      displayName: 'طارق',
      username: 'tarek',
      role: 'STORE_MANAGER',
      isActive: true,
      migrationReady: true,
      permissions: tarekPermissions,
    });
    await setDoc(doc(db, 'owner_private', '__confidential_migration_v1'), {
      status: 'complete',
      version: 1,
    });
    await setDoc(doc(db, 'owner_private', '__confidential_migration_v3'), {
      status: 'complete',
      version: 3,
    });
    await setDoc(doc(db, 'sales', 'sale-1'), publicSale());
    await setDoc(doc(db, 'sale_items', 'sale-1__000000'), publicSaleItem('sale-1', 0));
    await setDoc(doc(db, 'products', 'p-1'), {
      id: 'p-1',
      name: 'عطر تجريبي',
      stock_grams: 100,
      min_threshold_grams: 10,
      customSellingPriceOverride: 400,
    });
    await setDoc(doc(db, 'employee_costs', 'sales__sale-1'), employeeCost('sales', 'sale-1', {
      totalCost: 150, commissionAmount: 20,
    }, ''));
    await setDoc(doc(db, 'employee_costs', 'sale_items__sale-1__000000'), employeeCost('sale_items', 'sale-1__000000', {
      cost: 150,
    }, ''));
    await setDoc(doc(db, 'employee_costs', 'products__p-1'), employeeCost('products', 'p-1', {
      customGramCostEgp: 10,
    }, ''));
  });
});

test('anonymous visitors cannot read or write store data', async () => {
  const guest = testEnv.unauthenticatedContext().firestore();
  await assertFails(getDoc(doc(guest, 'sales', 'sale-1')));
  await assertFails(setDoc(doc(guest, 'sales', 'intrusion'), publicSale({ id: 'intrusion' })));
  await assertFails(getDoc(doc(guest, 'products', 'p-1')));
  await assertFails(getDoc(doc(guest, 'sale_items', 'sale-1__000000')));
  await assertFails(getDoc(doc(guest, 'employee_costs', 'products__p-1')));
});

test('only a verified, allowlisted Google identity can enter', async () => {
  const unknown = googleContext('unknown@lamsa.test');
  const unverified = testEnv.authenticatedContext('unverified-user', {
    email: tarekEmail,
    email_verified: false,
    firebase: { sign_in_provider: 'google.com' },
  }).firestore();
  const passwordAuth = testEnv.authenticatedContext('password-user', {
    email: tarekEmail,
    email_verified: true,
    firebase: { sign_in_provider: 'password' },
  }).firestore();
  await assertFails(getDoc(doc(unknown, 'sales', 'sale-1')));
  await assertFails(getDoc(doc(unverified, 'sales', 'sale-1')));
  await assertFails(getDoc(doc(passwordAuth, 'sales', 'sale-1')));
});

test('the owner retains full access to private financial records', async () => {
  const owner = googleContext(ownerEmail, 'owner-uid');
  await assertSucceeds(getDoc(doc(owner, 'owner_private', '__confidential_migration_v3')));
  await assertSucceeds(setDoc(doc(owner, 'expenses', 'rent-1'), { amount: 5000, category: 'rent' }));
  await assertSucceeds(getDoc(doc(owner, 'expenses', 'rent-1')));
});

test('only the owner can read or write staff salary, commission, and settlement collections', async () => {
  const owner = googleContext(ownerEmail, 'owner-uid');
  const tarek = googleContext(tarekEmail, 'tarek-uid');
  const collections = [
    'staff_entitlements',
    'staff_advances',
    'staff_settlements',
    'staff_incentives',
    'staff_deductions',
    'commission_policies',
    'commission_audit_logs',
  ];

  for (const collectionName of collections) {
    const ownerRef = doc(owner, collectionName, 'private-record');
    await assertSucceeds(setDoc(ownerRef, { id: 'private-record', amountEgp: 1000 }));
    await assertSucceeds(getDoc(ownerRef));

    const staffRef = doc(tarek, collectionName, 'private-record');
    await assertFails(getDoc(staffRef));
    await assertFails(setDoc(staffRef, { id: 'forged-record', amountEgp: 1 }));
  }
});

test('Tarek can use operational sales and stock without accessing owner-only collections', async () => {
  const tarek = googleContext(tarekEmail, 'tarek-uid');
  const sale = await assertSucceeds(getDoc(doc(tarek, 'sales', 'sale-1')));
  assert.equal(sale.data().totalPrice, 400);
  assert.equal('totalCost' in sale.data(), false);
  assert.equal('items' in sale.data(), false);
  const item = await assertSucceeds(getDoc(doc(tarek, 'sale_items', 'sale-1__000000')));
  assert.equal(item.data().productName, 'عطر تجريبي');
  assert.equal('cost' in item.data(), false);
  assert.equal('profit' in item.data(), false);
  const cost = await assertSucceeds(getDoc(doc(tarek, 'employee_costs', 'sales__sale-1')));
  assert.equal(cost.data().payload.totalCost, 150);
  assert.equal('totalProfit' in cost.data().payload, false);
  const productCost = await assertSucceeds(getDoc(doc(tarek, 'employee_costs', 'products__p-1')));
  assert.equal(productCost.data().payload.customGramCostEgp, 10);
  await assertSucceeds(updateDoc(doc(tarek, 'products', 'p-1'), { stock_grams: 90 }));
  await assertFails(getDoc(doc(tarek, 'expenses', 'rent-1')));
  await assertFails(getDoc(doc(tarek, 'vaults', 'owner-vault')));
  await assertFails(getDoc(doc(tarek, 'owner_private', '__private__sales__sale-1')));
  await assertFails(getDoc(doc(tarek, 'app_users', 'user-mohamed')));
  await assertFails(getDoc(doc(tarek, 'audit_logs', 'log-1')));
});

test('a staff role without canViewCosts can still read operations but cannot read cost overlays', async () => {
  await testEnv.withSecurityRulesDisabled(async (context) => {
    await setDoc(doc(context.firestore(), 'authorized_users', 'cashier@lamsa.test'), {
      email: 'cashier@lamsa.test', role: 'CASHIER', isActive: true, migrationReady: true,
      permissions: Object.fromEntries(permissionKeys.map((key) => [key, false])),
    });
  });
  const cashier = googleContext('cashier@lamsa.test', 'cashier-uid');
  await assertSucceeds(getDoc(doc(cashier, 'sales', 'sale-1')));
  await assertFails(getDoc(doc(cashier, 'employee_costs', 'sales__sale-1')));
  await assertFails(getDocs(query(collection(cashier, 'employee_costs'), where('sourceCollection', '==', 'products'))));
});

test('cost visibility stays limited to Tarek even if another manager claims canViewCosts', async () => {
  await testEnv.withSecurityRulesDisabled(async (context) => {
    const db = context.firestore();
    await updateDoc(doc(db, 'authorized_users', tarekEmail), {
      permissions: { ...tarekPermissions, canViewCosts: false },
    });
    await setDoc(doc(db, 'authorized_users', 'manager2@lamsa.test'), {
      email: 'manager2@lamsa.test', appUserId: 'user-manager-2', username: 'manager2',
      role: 'STORE_MANAGER', isActive: true, migrationReady: true,
      permissions: { ...tarekPermissions, canViewCosts: true },
    });
  });
  const tarek = googleContext(tarekEmail, 'tarek-uid');
  const otherManager = googleContext('manager2@lamsa.test', 'manager2-uid');
  await assertSucceeds(getDoc(doc(tarek, 'employee_costs', 'sales__sale-1')));
  await assertFails(getDoc(doc(otherManager, 'employee_costs', 'sales__sale-1')));
  await assertFails(getDoc(doc(otherManager, 'employee_costs', 'products__p-1')));
});

test('Tarek cannot self-promote or grant another account access', async () => {
  const tarek = googleContext(tarekEmail, 'tarek-uid');
  await assertFails(setDoc(doc(tarek, 'authorized_users', 'intruder@lamsa.test'), {
    email: 'intruder@lamsa.test', role: 'OWNER', isActive: true,
  }));
  await assertFails(updateDoc(doc(tarek, 'authorized_users', tarekEmail), { role: 'OWNER' }));
  await assertFails(setDoc(doc(tarek, 'app_users', 'self'), { role: 'OWNER' }));
  await assertFails(updateDoc(doc(tarek, 'employee_costs', 'products__p-1'), {
    payload: { customGramCostEgp: 1 },
  }));
  await assertFails(updateDoc(doc(tarek, 'settings', 'store'), { storeName: 'غير مصرح' }));
});

test('Tarek can create a public operational sale, but cannot embed cost or profit fields', async () => {
  const tarek = googleContext(tarekEmail, 'tarek-uid');
  const atomicCreate = writeBatch(tarek);
  atomicCreate.set(doc(tarek, 'sales', 'valid-new-sale'), publicSale({
    id: 'valid-new-sale', itemsReady: false,
  }));
  atomicCreate.set(doc(tarek, 'employee_costs', 'sales__valid-new-sale'), employeeCost('sales', 'valid-new-sale', {
    totalCost: 150, commissionAmount: 20,
  }));
  atomicCreate.set(doc(tarek, 'sale_items', 'valid-new-sale__000000'), publicSaleItem('valid-new-sale', 0));
  atomicCreate.set(doc(tarek, 'employee_costs', 'sale_items__valid-new-sale__000000'), employeeCost('sale_items', 'valid-new-sale__000000', { cost: 150 }));
  await assertSucceeds(atomicCreate.commit());
  await assertSucceeds(updateDoc(doc(tarek, 'sales', 'valid-new-sale'), { itemsReady: true }));
  await assertFails(setDoc(doc(tarek, 'sales', 'root-profit'), publicSale({ id: 'root-profit', totalProfit: 200 })));
  await assertFails(setDoc(doc(tarek, 'sale_items', 'leaked-cost'), publicSaleItem('valid-new-sale', 1, {
    cost: 150, profit: 250, mixComponents: [{ oilGramCost: 20 }],
  })));
  await assertFails(updateDoc(doc(tarek, 'sales', 'valid-new-sale'), { itemCount: 999 }));
  await assertSucceeds(updateDoc(doc(tarek, 'sales', 'valid-new-sale'), { paymentMethod: 'بطاقة' }));
  await assertFails(updateDoc(doc(tarek, 'sales', 'valid-new-sale'), { totalPrice: 10, discount: 390 }));
  await assertFails(updateDoc(doc(tarek, 'employee_costs', 'sales__valid-new-sale'), {
    payload: { totalCost: 0, commissionAmount: 0 },
  }));
});

test('Tarek may not create an invoice whose reported cost and commission leave under 10 EGP contribution', async () => {
  const tarek = googleContext(tarekEmail, 'tarek-uid');
  const batch = writeBatch(tarek);
  batch.set(doc(tarek, 'sales', 'unsafe-discount'), publicSale({
    id: 'unsafe-discount', totalPrice: 20, itemsReady: false,
  }));
  batch.set(doc(tarek, 'employee_costs', 'sales__unsafe-discount'), employeeCost('sales', 'unsafe-discount', {
    totalCost: 12, commissionAmount: 1,
  }));
  await assertFails(batch.commit());
});

test('Known limitation: margin rules trust the employee-submitted cost snapshot', async () => {
  const tarek = googleContext(tarekEmail, 'tarek-uid');
  const saleId = 'spoofed-cost-snapshot';
  const batch = writeBatch(tarek);
  batch.set(doc(tarek, 'sales', saleId), publicSale({
    id: saleId, totalPrice: 100, itemsReady: false,
  }));
  // This intentionally documents the current trust boundary. The emulator must reject this
  // after a trusted server computes/attests costs; client-only validation is not tamper-proof.
  batch.set(doc(tarek, 'employee_costs', `sales__${saleId}`), employeeCost('sales', saleId, {
    totalCost: 1, commissionAmount: 1,
  }));
  await assertSucceeds(batch.commit());
});

test('Tarek can record invoices with more than ten separate line items without gaining new role permissions', async () => {
  const tarek = googleContext(tarekEmail, 'tarek-uid');
  const saleId = 'large-sale';
  const itemCount = 35;
  const headerBatch = writeBatch(tarek);
  headerBatch.set(doc(tarek, 'sales', saleId), publicSale({
    id: saleId, itemCount, itemsReady: false,
  }));
  headerBatch.set(doc(tarek, 'employee_costs', `sales__${saleId}`), employeeCost('sales', saleId, {
    totalCost: 150, commissionAmount: 20,
  }));
  await assertSucceeds(headerBatch.commit());
  const batch = writeBatch(tarek);
  for (let index = 0; index < itemCount; index += 1) {
    const docId = `${encodeURIComponent(saleId)}__${String(index).padStart(6, '0')}`;
    batch.set(doc(tarek, 'sale_items', docId), publicSaleItem(saleId, index));
    batch.set(doc(tarek, 'employee_costs', `sale_items__${docId}`), employeeCost('sale_items', docId, { cost: 150 }));
  }
  await assertSucceeds(batch.commit());
  await assertSucceeds(updateDoc(doc(tarek, 'sales', saleId), { itemsReady: true }));
  const itemDocs = await assertSucceeds(getDocs(query(collection(tarek, 'sale_items'), where('saleId', '==', saleId))));
  assert.equal(itemDocs.size, itemCount);

  const owner = googleContext(ownerEmail, 'owner-uid');
  await assertSucceeds(setDoc(doc(owner, 'sales', 'owner-sale'), publicSale({
    id: 'owner-sale', createdByUid: 'owner-uid', itemsReady: false,
  })));
  await assertFails(setDoc(doc(tarek, 'sale_items', 'forbidden-owner-sale'), publicSaleItem('owner-sale', 0)));
});

test('Tarek may update stock only, not product cost or selling policy', async () => {
  const tarek = googleContext(tarekEmail, 'tarek-uid');
  await assertFails(updateDoc(doc(tarek, 'products', 'p-1'), { customGramCostEgp: 80 }));
  await assertFails(updateDoc(doc(tarek, 'products', 'p-1'), { customSellingPriceOverride: 1 }));
});

test('staff access remains closed until confidential migration is complete', async () => {
  await testEnv.withSecurityRulesDisabled(async (context) => {
    await setDoc(doc(context.firestore(), 'owner_private', '__confidential_migration_v3'), {
      status: 'running',
      version: 3,
    });
  });
  const tarek = googleContext(tarekEmail, 'tarek-uid');
  await assertFails(getDoc(doc(tarek, 'sales', 'sale-1')));
});

test('unlisted collections use default deny', async () => {
  const tarek = googleContext(tarekEmail, 'tarek-uid');
  await assertFails(getDoc(doc(tarek, 'system_backdoor', 'x')));
  await assertFails(getDocs(collection(tarek, 'system_backdoor')));
});

test('owner broadcasts are recipient-scoped and staff may append only their own acknowledgement', async () => {
  const owner = googleContext(ownerEmail, 'owner-uid');
  const tarek = googleContext(tarekEmail, 'tarek-uid');
  const broadcast = (targetEmployee) => ({
    title: 'توجيه اختباري',
    message: 'رسالة داخلية',
    targetEmployee,
    requiresAcknowledgement: true,
    acknowledgedBy: [],
    isArchived: false,
    createdAt: '2026-10-11T00:00:00.000Z',
  });

  await assertSucceeds(setDoc(doc(owner, 'owner_broadcasts', 'broadcast-all'), broadcast('all')));
  await assertSucceeds(setDoc(doc(owner, 'owner_broadcasts', 'broadcast-tarek'), broadcast('طارق')));
  await assertSucceeds(setDoc(doc(owner, 'owner_broadcasts', 'broadcast-other'), broadcast('موظف آخر')));

  await assertSucceeds(getDoc(doc(tarek, 'owner_broadcasts', 'broadcast-all')));
  await assertSucceeds(getDoc(doc(tarek, 'owner_broadcasts', 'broadcast-tarek')));
  await assertFails(getDoc(doc(tarek, 'owner_broadcasts', 'broadcast-other')));
  const visible = await assertSucceeds(getDocs(query(
    collection(tarek, 'owner_broadcasts'),
    where('targetEmployee', 'in', ['all', 'طارق', 'tarek', 'user-tarek']),
  )));
  assert.deepEqual(new Set(visible.docs.map((entry) => entry.id)), new Set(['broadcast-all', 'broadcast-tarek']));

  const broadcastRef = doc(tarek, 'owner_broadcasts', 'broadcast-tarek');
  const ownAck = { employeeName: 'طارق', timestamp: '2026-10-11T00:01:00.000Z' };
  await assertSucceeds(updateDoc(broadcastRef, { acknowledgedBy: [ownAck] }));
  await assertFails(updateDoc(broadcastRef, { title: 'توجيه مزور' }));
  await assertFails(updateDoc(broadcastRef, {
    acknowledgedBy: [ownAck, { employeeName: 'موظف آخر', timestamp: '2026-10-11T00:02:00.000Z' }],
  }));
  await assertFails(setDoc(doc(tarek, 'owner_broadcasts', 'forged-broadcast'), broadcast('all')));
});
