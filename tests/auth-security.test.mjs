import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import {
  canAccessSeparatedCostData,
  canAccessSeparatedOperationalCostData,
  OWNER_AUTH_EMAIL,
  TAREK_AUTH_EMAIL,
  isAuthorizedTarekProfile,
  isAuthorizedOwnerProfile,
  isVerifiedTarekIdentity,
  isVerifiedOwnerIdentity,
  resolveFirebaseAppRole,
} from '../services/authPolicy.ts';
import {
  projectBottleSizeCosts,
  projectBottleSizeFinancials,
  projectCostPolicySettings,
  projectOperationalProduct,
  projectTarekProduct,
  projectOperationalSavedMix,
  projectProductCost,
  projectOperationalSale,
  projectSaleCosts,
  projectSaleFinancials,
  projectSavedMixCosts,
  projectOperationalStoreSettings,
  projectFinancialAdminSettings,
  projectTarekSaleProduct,
} from '../services/separatedDataModel.ts';

const readProjectFile = (relativePath) =>
  readFile(new URL(`../${relativePath}`, import.meta.url), 'utf8');

const verifiedOwner = {
  email: OWNER_AUTH_EMAIL,
  emailVerified: true,
  isAnonymous: false,
  signInProvider: 'google.com',
};

const verifiedTarek = {
  email: TAREK_AUTH_EMAIL,
  emailVerified: true,
  isAnonymous: false,
  signInProvider: 'google.com',
};

test('verified Firebase owner identity is accepted case-insensitively', () => {
  assert.equal(isVerifiedOwnerIdentity(verifiedOwner), true);
  assert.equal(isVerifiedOwnerIdentity({ ...verifiedOwner, email: OWNER_AUTH_EMAIL.toUpperCase() }), true);
});

test('only the exact verified Google account gets each identity role', () => {
  assert.equal(isVerifiedOwnerIdentity(verifiedOwner), true);
  assert.equal(isVerifiedOwnerIdentity({ ...verifiedOwner, email: OWNER_AUTH_EMAIL.toUpperCase() }), true);
  assert.equal(isVerifiedTarekIdentity(verifiedTarek), true);
  assert.equal(resolveFirebaseAppRole(verifiedOwner), 'OWNER');
  assert.equal(resolveFirebaseAppRole(verifiedTarek), 'TAREK');
  assert.equal(isVerifiedOwnerIdentity(verifiedTarek), false);
  assert.equal(isVerifiedTarekIdentity({ ...verifiedTarek, email: 'other@example.com' }), false);
  assert.equal(isVerifiedOwnerIdentity({ ...verifiedOwner, emailVerified: false }), false);
  assert.equal(isVerifiedOwnerIdentity({ ...verifiedOwner, isAnonymous: true }), false);
  assert.equal(isVerifiedTarekIdentity({ ...verifiedTarek, signInProvider: 'password' }), false);
  assert.equal(isVerifiedOwnerIdentity(null), false);
});

test('a different verified email receives the operational role only with its own active assignment', () => {
  const staffIdentity = { ...verifiedTarek, email: 'staff@example.com' };
  const grant = { email: 'staff@example.com', role: 'STORE_MANAGER', active: true };
  assert.equal(resolveFirebaseAppRole(staffIdentity), null);
  assert.equal(resolveFirebaseAppRole(staffIdentity, grant), 'TAREK');
  assert.equal(resolveFirebaseAppRole(staffIdentity, { ...grant, role: 'INVENTORY_VIEWER' }), 'TAREK');
  assert.equal(resolveFirebaseAppRole({ ...staffIdentity, emailVerified: false }, grant), null);
  assert.equal(resolveFirebaseAppRole({ ...staffIdentity, signInProvider: 'password' }, grant), null);
  assert.equal(resolveFirebaseAppRole(staffIdentity, { ...grant, email: 'someone-else@example.com' }), null);
  assert.equal(resolveFirebaseAppRole(staffIdentity, { ...grant, active: false }), null);
  assert.equal(resolveFirebaseAppRole(staffIdentity, { ...grant, role: 'OWNER' }), null);
  assert.equal(resolveFirebaseAppRole(staffIdentity, { ...grant, role: 'FINANCIAL_ADMIN' }), null);
  assert.equal(resolveFirebaseAppRole(verifiedTarek, {
    email: TAREK_AUTH_EMAIL,
    role: 'STORE_MANAGER',
    active: false,
  }), null);
  assert.equal(resolveFirebaseAppRole(verifiedTarek, null), 'TAREK');
});

test('a locally changed OWNER role cannot create access without verified owner identity', () => {
  const forgedLocalOwner = { role: 'OWNER', isActive: true };
  assert.equal(isAuthorizedOwnerProfile(forgedLocalOwner, null), false);
  assert.equal(isAuthorizedOwnerProfile(forgedLocalOwner, {
    ...verifiedOwner,
    email: 'ttaarreekkessam@gmail.com',
  }), false);
  assert.equal(isAuthorizedOwnerProfile({ ...forgedLocalOwner, isActive: false }, verifiedOwner), false);
  assert.equal(isAuthorizedOwnerProfile({ role: 'STORE_MANAGER', isActive: true }, verifiedOwner), false);
  assert.equal(isAuthorizedOwnerProfile(forgedLocalOwner, verifiedOwner), true);
  assert.equal(isAuthorizedTarekProfile({ role: 'STORE_MANAGER', isActive: true }, verifiedTarek), true);
  assert.equal(isAuthorizedTarekProfile({ role: 'STORE_MANAGER', isActive: true }, {
    ...verifiedTarek,
    emailVerified: false,
  }), false);
  assert.equal(isAuthorizedTarekProfile({ role: 'STORE_MANAGER', isActive: false }, verifiedTarek), false);
  assert.equal(isAuthorizedTarekProfile({ role: 'OWNER', isActive: true }, verifiedTarek), false);
});

test('Tarek may access operational cost projections, but raw financial cost access remains owner-only', () => {
  const tarekProfile = { role: 'STORE_MANAGER', isActive: true };
  assert.equal(canAccessSeparatedOperationalCostData(tarekProfile, verifiedTarek), true);
  assert.equal(canAccessSeparatedCostData(tarekProfile, verifiedTarek), false);
  assert.equal(canAccessSeparatedOperationalCostData({ role: 'STORE_MANAGER', isActive: true }, verifiedOwner), false);
  assert.equal(canAccessSeparatedOperationalCostData({ role: 'OWNER', isActive: true }, verifiedTarek), false);
  assert.equal(canAccessSeparatedCostData({ role: 'OWNER', isActive: true }, verifiedOwner), true);
});

test('explicit projections keep operational product and sale documents free of cost and profit fields', () => {
  const product = {
    id: 17,
    name: 'Test perfume',
    brand: 'Test brand',
    origin: 'local',
    gender: 'مشترك',
    season: 'كل الفصول',
    type: 'عادي',
    stock_grams: 50,
    customGramCostEgp: 12,
    customSellingPriceOverride: 125,
    savedMixComponents: [{
      productId: 18,
      productName: 'Oil',
      brand: 'Test brand',
      productType: 'عود',
      grams: 2,
      oilGramCost: 20,
      componentOilCost: 40,
    }],
  };
  const operationalProduct = projectOperationalProduct(product);
  const productCosts = projectProductCost(product);
  assert.equal(operationalProduct.id, '17');
  assert.equal(operationalProduct.customSellingPriceOverride, 125);
  assert.equal(productCosts.customGramCostEgp, 12);

  const sale = {
    id: 'sale-1',
    items: [{
      id: 'line-1',
      productId: 17,
      productName: 'Test perfume',
      productType: 'عادي',
      bottleSize: 30,
      essenceGrams: 5,
      cost: 45,
      sellingPrice: 125,
      profit: 70,
      quantity: 1,
      mixComponents: [{
        productId: 18,
        productName: 'Oil',
        brand: 'Test brand',
        productType: 'عود',
        grams: 2,
        oilGramCost: 20,
        componentOilCost: 40,
      }],
    }],
    totalPrice: 125,
    totalCost: 45,
    totalProfit: 70,
    commissionAmount: 5,
    date: '2026-10-15',
  };
  const operationalSale = projectOperationalSale(sale);
  const saleCosts = projectSaleCosts(sale);
  const saleFinancials = projectSaleFinancials(sale);
  const keysDeep = (value) => value && typeof value === 'object'
    ? Object.entries(value).flatMap(([key, nested]) => [key, ...keysDeep(nested)])
    : [];
  assert.equal(operationalSale.totalPrice, 125);
  assert.equal(operationalSale.items[0].sellingPrice, 125);
  assert.deepEqual(keysDeep(operationalProduct).filter((key) => /(cost|profit|margin|commission)/i.test(key)), []);
  assert.deepEqual(keysDeep(operationalSale).filter((key) => /(cost|profit|margin|commission)/i.test(key)), []);
  assert.equal(saleCosts.totalCostEgp, 45);
  assert.equal(saleCosts.items[0].components[0].componentOilCostEgp, 40);
  assert.deepEqual(keysDeep(saleCosts).filter((key) => /(profit|margin|commission)/i.test(key)), []);
  assert.equal(saleFinancials.totalProfitEgp, 70);
  assert.equal(saleFinancials.commissionEgp, 5);
  assert.deepEqual(keysDeep(saleFinancials).filter((key) => /cost/i.test(key)), []);
});

test('saved mix formula projects its selling data separately from material costs', () => {
  const formula = {
    id: 'mix-1',
    name: 'Sample mix',
    bottleSizeMl: 30,
    isColoredBottle: false,
    components: [{
      productId: 'oil-1',
      productName: 'Oil',
      brand: 'Test brand',
      productType: 'عود',
      grams: 3,
      percentage: 100,
      oilGramCost: 20,
      componentOilCost: 60,
    }],
    totalEssenceGrams: 3,
    totalCost: 75,
    sellingPrice: 160,
    suggestedPrice: 180,
    createdAt: '2026-10-15T00:00:00Z',
    updatedAt: '2026-10-15T00:00:00Z',
  };
  const operations = projectOperationalSavedMix(formula);
  const costs = projectSavedMixCosts(formula);
  const keysDeep = (value) => value && typeof value === 'object'
    ? Object.entries(value).flatMap(([key, nested]) => [key, ...keysDeep(nested)])
    : [];
  assert.equal(operations.sellingPrice, 160);
  assert.equal('suggestedPrice' in operations, false);
  assert.deepEqual(keysDeep(operations).filter((key) => /(cost|profit|margin|suggestedPrice)/i.test(key)), []);
  assert.equal(costs.totalCostEgp, 75);
  assert.deepEqual(keysDeep(costs).filter((key) => /(sellingPrice|suggestedPrice|profit|margin)/i.test(key)), []);
});

test('store settings projection separates operational selling prices from owner-only cost and budget settings', () => {
  const settings = {
    storeName: 'Test store',
    currency: 'EGP',
    priceEssenceNormal: 10,
    priceEssenceSpecial: 20,
    defaultBottleCost: 15,
    defaultMargin: 35,
    dailyTargetProfit: 600,
    monthlyTargetRevenue: 28000,
    monthlyFixedBudget: 15000,
    monthlyWorkDays: 25,
    employeeBaseSalary: 1000,
    ownerSalary: 10500,
    commissionRate: 0.05,
    tieredCommissionRate: 0.07,
    tieredThresholdBottles: 10,
    bottleSizes: [{
      id: '30ml',
      sizeMl: 30,
      essenceGrams: 5,
      bottleCost: 15,
      normalPrice: 125,
      specialPrice: 160,
      officialCost: 65,
      suggestedMargin: 60,
    }],
    whatsappCallMeBotApiKey: 'must-not-enter-either-projection',
  };
  const operational = projectOperationalStoreSettings(settings);
  const costPolicy = projectCostPolicySettings(settings);
  const financial = projectFinancialAdminSettings(settings);
  assert.equal(operational.bottleSizes[0].normalPrice, 125);
  assert.equal('bottleCost' in operational.bottleSizes[0], false);
  assert.equal('monthlyFixedBudget' in operational, false);
  assert.equal('commissionRate' in operational, false);
  assert.equal('defaultBottleCost' in operational, false);
  assert.equal(costPolicy.defaultBottleCost, 15);
  assert.equal(costPolicy.priceEssenceNormal, 10);
  assert.equal('monthlyFixedBudget' in costPolicy, false);
  assert.equal('commissionRate' in costPolicy, false);
  assert.equal('defaultMargin' in costPolicy, false);
  assert.equal(financial.monthlyFixedBudget, 15000);
  assert.equal(financial.defaultMargin, 35);
  assert.equal('defaultBottleCost' in financial, false);
  assert.equal('priceEssenceNormal' in financial, false);
  const bottleCosts = projectBottleSizeCosts(settings.bottleSizes[0]);
  assert.equal('suggestedMargin' in bottleCosts, false);
  assert.equal('suggestedMarginEgp' in bottleCosts, false);
  assert.equal('normalPrice' in bottleCosts, false);
  assert.equal(projectBottleSizeFinancials(settings.bottleSizes[0]).suggestedMarginEgp, 60);
  assert.equal('whatsappCallMeBotApiKey' in operational, false);
  assert.equal('whatsappCallMeBotApiKey' in financial, false);
});

test('separated Firestore writer is owner-gated and never writes to legacy collections', async () => {
  const service = await readProjectFile('services/separatedDataService.ts');
  assert.match(service, /await requireOwnerAuth\(\)/);
  assert.match(service, /SEPARATED_COLLECTIONS\.saleOperations/);
  assert.match(service, /SEPARATED_COLLECTIONS\.saleCosts/);
  assert.match(service, /SEPARATED_COLLECTIONS\.saleFinancials/);
  assert.doesNotMatch(service, /(?:batch|costBatch)\.(?:set|update|delete)\(\s*doc\(db,\s*['"](?:products|sales|settings)['"]/);
});

test('local session snapshots and legacy PIN verification cannot authenticate', async () => {
  const authService = await readProjectFile('services/authService.ts');
  const types = await readProjectFile('types.ts');
  assert.match(authService, /export function getSessionUser\(\): AppUser \| null \{\s*clearSessionUser\(\);\s*return null;/);
  assert.match(authService, /export async function verifyPassword[\s\S]*?return false;/);
  assert.doesNotMatch(authService, /'5188'|'12345'/);
  assert.doesNotMatch(types, /passwordHash:\s*'(?:5188|12345)'/);
});

test('Tarek product projection contains no selling price, custom cost, margin, or commission fields', () => {
  const projection = projectTarekProduct({
    id: 17,
    name: 'Test perfume',
    brand: 'Test brand',
    origin: 'local',
    gender: 'مشترك',
    season: 'كل الفصول',
    type: 'عادي',
    stock_grams: 50,
    normalPrice: 125,
    specialPrice: 150,
    customSellingPriceOverride: 130,
    customGramCostEgp: 12,
    profit: 999,
    commissionRate: 0.07,
  });
  assert.deepEqual(Object.keys(projection).sort(), [
    'brand', 'gender', 'id', 'name', 'origin', 'schemaVersion', 'season', 'stock_grams', 'type',
  ]);
  assert.equal('normalPrice' in projection, false);
  assert.equal('customSellingPriceOverride' in projection, false);
  assert.equal('customGramCostEgp' in projection, false);
  assert.equal('profit' in projection, false);
  assert.equal('commissionRate' in projection, false);
});

test('Tarek sale catalogue carries only identity and active state, never owner price overrides or costs', () => {
  const product = projectTarekSaleProduct({
    id: 'safe-product', name: 'عطر', brand: 'اختبار', origin: 'محلي',
    gender: 'مشترك', season: 'كل الفصول', type: 'عادي', stock_grams: 80,
    customSellingPriceOverride: 999, customGramCostEgp: 12, isActive: false,
  });
  assert.equal(product.id, 'safe-product');
  assert.equal(product.isActive, false);
  for (const field of ['customSellingPriceOverride', 'customGramCostEgp', 'stock_grams', 'profit', 'commissionRate']) {
    assert.equal(field in product, false, `sale catalogue leaked ${field}`);
  }
});

test('Tarek workspace isolates the legacy POS and only exposes the local no-finance v3 sale path to STORE_MANAGER', async () => {
  const app = await readProjectFile('App.tsx');
  const view = await readProjectFile('components/TarekReadOnlyWorkspace.tsx');
  const service = await readProjectFile('services/tarekWorkspaceService.ts');
  const safePos = await readProjectFile('components/TarekSafePOS.tsx');
  assert.match(app, /currentUser\.role === 'STORE_MANAGER'[\s\S]*?return <TarekReadOnlyWorkspace/);
  assert.match(view, /data\.permissions\.canCreateSales && <TarekSafePOS/);
  assert.match(service, /assignment\.role === 'STORE_MANAGER'/);
  assert.match(service, /canCreateSales/);
  assert.match(service, /if \(canViewOperationalCosts\) \{/);
  assert.match(view, /data\.permissions\.canViewOperationalCosts &&/);
  assert.match(safePos, /quoteTarekSaleToLocalEmulatorWorker/);
  assert.match(safePos, /enqueueTarekSale/);
  assert.match(safePos, /LOCAL_LAMSA_SALE_ENDPOINT/);
  assert.match(safePos, /VITE_PREVIEW_SAFE_MODE/);
  assert.match(safePos, /addEventListener\('offline', updateOnlineState\)/);
  assert.match(safePos, /if \(localWorkerUsable && getTarekSaleOutbox\(\)\.length > 0\) flush\(\)/);
  assert.match(safePos, /typeof navigator === 'undefined' \|\| !navigator\.onLine/);
  assert.match(safePos, /هذا مسار تطوير محلي فقط/);
  assert.doesNotMatch(view, /<POS|onCompleteSale|onSaleComplete/);
  assert.doesNotMatch(safePos, /requestedUnitPriceEgp|previewUnitCostEgp|totalProfit|commissionAmount/);
  assert.doesNotMatch(service, /setDoc|updateDoc|writeBatch|runTransaction|httpsCallable/);
});

test('owner product, bottle, and settings saves refresh the Worker projections transactionally', async () => {
  const firebase = await readProjectFile('services/firebase.ts');
  const app = await readProjectFile('App.tsx');
  const productWriter = firebase.slice(
    firebase.indexOf('async function writeProductProjectionChunk'),
    firebase.indexOf('export const deleteProductCloud'),
  );
  const storeWriter = firebase.slice(
    firebase.indexOf('async function writeStoreProjectionBundle'),
    firebase.indexOf('export const saveSettingsCloud'),
  );
  assert.match(productWriter, /await runTransaction\(db/);
  assert.match(productWriter, /stockDeltas\.get\(id\)/);
  for (const projection of ['productOperations', 'productCosts', 'tarekProducts', 'tarekSaleProducts']) {
    assert.match(productWriter, new RegExp(`SEPARATED_COLLECTIONS\\.${projection}`));
  }
  for (const projection of ['operationalSettings', 'costCatalog', 'financialAdmin', 'tarekSaleBottleSizes']) {
    assert.match(storeWriter, new RegExp(`SEPARATED_COLLECTIONS\\.${projection}`));
  }
  assert.match(storeWriter, /projectBottleSizeFinancials/);
  assert.match(storeWriter, /transaction\.delete/);
  assert.match(app, /stockDeltas\.get\(String\(p\.id\)\)/);
  assert.match(app, /seedProductsCloud\(next, stockDeltas\)/);
});

test('Firestore rules require verified Google identity and default-deny every unlisted path', async () => {
  const rules = await readProjectFile('firestore.rules');
  assert.match(rules, /isVerifiedGoogleEmail\('moh\.mhran@gmail\.com'\)/);
  assert.match(rules, /request\.auth\.token\.email_verified\s*==\s*true/);
  assert.match(rules, /request\.auth\.token\.firebase\.sign_in_provider\s*==\s*'google\.com'/);
  assert.match(rules, /isVerifiedGoogleEmail\('ttaarreekkessam@gmail\.com'\)/);
  assert.match(rules, /match \/\{document=\*\*\}[\s\S]*allow read, write: if false;/);
  assert.doesNotMatch(rules, /allow\s+(?:read|write|read\s*,\s*write)\s*:\s*true/);
  assert.match(rules, /match \/sale_costs\/\{documentId\}[\s\S]*allow read, write: if isVerifiedOwner\(\);/);
});

test('Tarek has a small safe-view allowlist and no legacy reports or commission/budget pages', async () => {
  const authService = await readProjectFile('services/authService.ts');
  const types = await readProjectFile('types.ts');
  assert.match(authService, /return view === View\.TAREK_WORKSPACE;/);
  assert.ok(types.includes('canApplyDiscount: true'));
  assert.ok(types.includes('canViewReports: false'));
  assert.ok(types.includes('canAccessOperationsSystem: false'));
});

test('Firestore audit reads and startup listeners are gated by owner auth', async () => {
  const firebase = await readProjectFile('services/firebase.ts');
  const app = await readProjectFile('App.tsx');
  const auditStart = firebase.indexOf('export const loadAuditLogsPage');
  const auditEnd = firebase.indexOf('export const addAuditLogCloud', auditStart);
  assert.ok(auditStart >= 0 && auditEnd > auditStart);
  assert.match(firebase.slice(auditStart, auditEnd), /await requireOwnerAuth\(\)/);
  assert.match(app, /authEmail\?\.trim\(\)\.toLowerCase\(\) !== 'moh\.mhran@gmail\.com'/);
  assert.doesNotMatch(firebase, /signInAnonymously|ensureAuth/);
});

test('the sale is durably queued before the first cloud attempt and ancillary writes wait for confirmation', async () => {
  const app = await readProjectFile('App.tsx');
  const pos = await readProjectFile('components/POS.tsx');
  const start = app.indexOf('const handleSaleComplete = async');
  const end = app.indexOf('// Add audited withdrawal transaction', start);
  assert.ok(start >= 0 && end > start);
  const handler = app.slice(start, end);
  assert.ok(handler.indexOf("enqueueOfflineAction('sale', sale)") < handler.indexOf('flushPendingSaleQueue'));
  assert.match(handler, /لم يؤكد Firestore البيع بعد؛ بقيت الفاتورة في الطابور/);
  assert.match(handler, /sale-sync\/offline-queue-persistence-failed/);
  assert.match(handler, /enqueueOfflineAction\('sale', sale\)/);
  assert.match(handler, /cloudSyncSucceeded \? 'sale' : 'warning'/);
  assert.match(handler, /if \(cloudSyncSucceeded\)\s*\{\s*saveVaultCloud/);
  assert.match(pos, /if \(cloudSyncSucceeded\)\s*\{\s*dispatchSaleTelegramAlert[\s\S]*?dispatchLowStockTelegramAlert/);
  assert.match(await readProjectFile('services/firebase.ts'), /await commitSaleAndInventory\(db, sale\)/);
});


test('Vite no longer interpolates secret API variables into the browser bundle', async () => {
  const viteConfig = await readProjectFile('vite.config.ts');
  assert.doesNotMatch(viteConfig, /loadEnv|process\.env\.(?:API_KEY|GEMINI_API_KEY)|VITE_GEMINI_API_KEY/);
});

test('sales use atomic stock transactions; invoice edits/deletes are blocked and reversals remain auditable', async () => {
  const saleSync = await readProjectFile('services/saleSync.ts');
  const firebase = await readProjectFile('services/firebase.ts');
  const app = await readProjectFile('App.tsx');
  const rules = await readProjectFile('firestore.rules');
  assert.match(saleSync, /runTransaction\(db/);
  assert.match(saleSync, /sale-sync\/insufficient-stock/);
  assert.match(saleSync, /export function reverseSaleAndInventory/);
  assert.match(saleSync, /sale\/permanent-delete-disabled/);
  assert.match(firebase, /sale\/edit-disabled-use-reversal/);
  assert.match(firebase, /sale\/permanent-delete-disabled/);
  assert.match(firebase, /clearAllSalesCloud = async \(sales: Sale\[\]\) => \{[\s\S]*?sale\/permanent-delete-disabled/);
  assert.doesNotMatch(app, /handleUpdateSale/);
  assert.match(app, /reverseSaleCloud/);
  assert.match(rules, /allow update: if validSaleReversal\(documentId\)/);
  assert.match(rules, /allow delete: if false/);
  assert.doesNotMatch(app, /stock_grams:\s*Math\.max\(0,\s*p\.stock_grams\s*-\s*delta/);
});
