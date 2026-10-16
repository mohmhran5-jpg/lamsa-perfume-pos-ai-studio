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
  projectTarekProductCostDTO,
} from '../services/separatedDataModel.ts';
import {
  OwnerPrivateSessionGate,
  OWNER_PRIVATE_CACHE_KEYS,
  cancelPendingOwnerPrivateCacheWrites,
  persistOwnerPrivateCache,
  readOwnerPrivateCache,
} from '../services/ownerPrivateSession.ts';

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

test('shared browser owner logout then Tarek login clears private memory, blocks private cache reads, and preserves the legacy sale queue', () => {
  const legacyQueue = [{ id: 'legacy-sale-1', entityType: 'sale', payload: { id: 'legacy-sale-1' } }];
  const storage = new Map([
    ['lamsa_vaults_v1', JSON.stringify([{ id: 'vault-secret', balance: 25000 }])],
    ['lamsa_sales', JSON.stringify([{ id: 'sale-private', totalProfit: 999 }])],
    ['lamsa_offline_queue_v1', JSON.stringify(legacyQueue)],
  ]);
  let reads = 0;
  let writes = 0;
  const reader = (key, fallback) => {
    reads += 1;
    const raw = storage.get(key);
    return raw === undefined ? fallback : JSON.parse(raw);
  };
  const writer = (key, value) => {
    writes += 1;
    storage.set(key, JSON.stringify(value));
  };
  const gate = new OwnerPrivateSessionGate();
  let privateMemory = { vaults: [], sales: [] };

  const ownerGeneration = gate.beginIdentityTransition();
  assert.equal(gate.authorizeVerifiedOwner('owner-uid', ownerGeneration), true);
  privateMemory = {
    vaults: readOwnerPrivateCache(gate, ownerGeneration, 'lamsa_vaults_v1', [], reader),
    sales: readOwnerPrivateCache(gate, ownerGeneration, 'lamsa_sales', [], reader),
  };
  assert.equal(privateMemory.vaults[0].balance, 25000);
  assert.equal(privateMemory.sales[0].totalProfit, 999);
  assert.equal(persistOwnerPrivateCache(gate, ownerGeneration, 'lamsa_vaults_v1', [], writer), true);
  assert.equal(writes, 1);

  const transitionGeneration = gate.beginIdentityTransition();
  privateMemory = { vaults: [], sales: [] };
  const readsBeforeTarek = reads;
  assert.deepEqual(readOwnerPrivateCache(gate, transitionGeneration, 'lamsa_vaults_v1', [], reader), []);
  assert.equal(reads, readsBeforeTarek, 'private storage reader must not run for Tarek');
  assert.equal(persistOwnerPrivateCache(gate, transitionGeneration, 'lamsa_vaults_v1', ['forbidden'], writer), false);
  assert.deepEqual(privateMemory, { vaults: [], sales: [] });

  const tarekGeneration = gate.beginIdentityTransition();
  assert.equal(gate.isAuthorized(tarekGeneration), false);
  assert.deepEqual(readOwnerPrivateCache(gate, tarekGeneration, 'lamsa_sales', [], reader), []);
  const cancelledKeys = [];
  cancelPendingOwnerPrivateCacheWrites((key) => cancelledKeys.push(key));
  assert.ok(OWNER_PRIVATE_CACHE_KEYS.includes('lamsa_vaults_v1'));
  assert.equal(cancelledKeys.includes('lamsa_offline_queue_v1'), false);
  assert.equal(storage.get('lamsa_offline_queue_v1'), JSON.stringify(legacyQueue));
  assert.equal(writes, 1, 'no private write is scheduled after revocation');
});

test('App defers owner-private cache hydration until verified owner and clears it before auth account transitions', async () => {
  const app = await readProjectFile('App.tsx');
  const authorizeIndex = app.indexOf('authorizeVerifiedOwner(firebaseUser.uid, sessionGeneration)');
  const hydrateIndex = app.indexOf('hydrateOwnerPrivateTransientState(firebaseUser.uid, sessionGeneration)');
  assert.ok(authorizeIndex >= 0 && hydrateIndex > authorizeIndex);
  assert.match(app, /const clearOwnerPrivateTransientState = \(\) => \{[\s\S]*?cancelPendingOwnerPrivateCacheWrites\(\);[\s\S]*?setExpenses\(\[\]\);[\s\S]*?setVaults\(\[\]\);/);
  assert.match(app, /const validateFirebaseUser = async \(firebaseUser: User \| null\) => \{[\s\S]*?beginIdentityTransition\(\);[\s\S]*?clearOwnerPrivateTransientState\(\);/);
  assert.match(app, /const handleLogout = async \(\) => \{[\s\S]*?beginIdentityTransition\(\);[\s\S]*?clearOwnerPrivateTransientState\(\);[\s\S]*?await signOutFirebase\(\)/);
  assert.match(app, /const \[sales, setSales\] = useState<Sale\[]>\(\[\]\)/);
  assert.match(app, /const \[vaults, setVaults\] = useState<FinancialVault\[]>\(\[\]\)/);
  assert.doesNotMatch(app, /useState<(?:Sale|Expense|FinancialVault)\[\]>\(\(\) => loadDataSync/);
});

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

test('Tarek may read only operational product cost while broad financial cost data remains owner-only', async () => {
  const tarekProfile = { role: 'STORE_MANAGER', isActive: true };
  assert.equal(canAccessSeparatedOperationalCostData(tarekProfile, verifiedTarek), true);
  assert.equal(canAccessSeparatedCostData(tarekProfile, verifiedTarek), false);
  const typesSource = await readProjectFile('types.ts');
  const tarekBlockStart = typesSource.indexOf('export const TAREK_OPERATIONAL_PERMISSIONS');
  assert.notEqual(tarekBlockStart, -1);
  const tarekBlockEnd = typesSource.indexOf('\n};', tarekBlockStart);
  const tarekPermissions = typesSource.slice(tarekBlockStart, tarekBlockEnd === -1 ? undefined : tarekBlockEnd);
  assert.match(tarekPermissions, /canViewOperationalCosts:\s*true/);
  assert.equal(canAccessSeparatedOperationalCostData({ role: 'STORE_MANAGER', isActive: true }, verifiedOwner), false);
  assert.equal(canAccessSeparatedOperationalCostData({ role: 'OWNER', isActive: true }, verifiedTarek), false);
  assert.equal(canAccessSeparatedOperationalCostData(tarekProfile, { ...verifiedTarek, email: 'someone-else@example.com' }, {
    email: 'someone-else@example.com', role: 'INVENTORY_VIEWER', active: true,
  }), false);
  assert.equal(canAccessSeparatedOperationalCostData(tarekProfile, { ...verifiedTarek, email: 'manager@example.com' }, {
    email: 'manager@example.com', role: 'STORE_MANAGER', active: true,
  }), true);
  assert.equal(canAccessSeparatedCostData({ role: 'OWNER', isActive: true }, verifiedOwner), true);
});

test('Tarek workspace subscribes only to an allowlisted product cost DTO, not broad financial collections', async () => {
  const workspaceSource = await readProjectFile('services/tarekWorkspaceService.ts');
  assert.match(workspaceSource, /collection\(db, 'tarek_operational_costs'\)/);
  assert.match(workspaceSource, /projectTarekProductCostDTO/);
  assert.doesNotMatch(workspaceSource, /cost_catalog|mix_costs|sale_costs|sale_financials|financial_admin|totalProfit|commissionAmount/);
  const componentSource = await readProjectFile('components/TarekReadOnlyWorkspace.tsx');
  assert.match(componentSource, /data\.permissions\.canViewOperationalCosts/);
  assert.match(componentSource, /تكلفة الجرام التشغيلية/);
  assert.doesNotMatch(componentSource, /cost_catalog|sale_costs|financial_admin|officialCostEgp|bottleCostEgp|commissionAmount|totalProfit/);
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
  const tarekStockProduct = projectTarekProduct(product);
  const tarekSaleProduct = projectTarekSaleProduct(product);
  const keysDeep = (value) => value && typeof value === 'object'
    ? Object.entries(value).flatMap(([key, nested]) => [key, ...keysDeep(nested)])
    : [];
  const forbiddenEmployeeFields = /(cost|profit|margin|commission|budget|financial|vault|expense|withdrawal|salary|payroll|capital|balance|settings)/i;
  const productCosts = projectProductCost(product);
  assert.equal(operationalProduct.id, '17');
  assert.equal(operationalProduct.customSellingPriceOverride, 125);
  assert.deepEqual(keysDeep(tarekStockProduct).filter((key) => forbiddenEmployeeFields.test(key)), []);
  assert.deepEqual(keysDeep(tarekSaleProduct).filter((key) => forbiddenEmployeeFields.test(key)), []);
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
  assert.equal(operationalSale.totalPrice, 125);
  assert.equal(operationalSale.items[0].sellingPrice, 125);
  assert.deepEqual(keysDeep(operationalProduct).filter((key) => forbiddenEmployeeFields.test(key)), []);
  assert.deepEqual(keysDeep(operationalSale).filter((key) => forbiddenEmployeeFields.test(key)), []);
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

test('operational product-cost DTO exposes only the allowed gram cost and metadata', () => {
  const cost = projectProductCost({
    id: 17,
    customGramCostEgp: 12,
    updatedAt: '2026-10-16T00:00:00.000Z',
    normalPrice: 125,
    customSellingPriceOverride: 130,
    totalCostEgp: 900,
    profit: 999,
    profitMarginPercent: 80,
    commissionRate: 0.07,
    monthlyFixedBudget: 15000,
  });
  assert.deepEqual(Object.keys(cost).sort(), ['customGramCostEgp', 'productId', 'schemaVersion', 'updatedAt']);
  assert.equal(cost.productId, '17');
  assert.equal(cost.customGramCostEgp, 12);
  assert.deepEqual(Object.keys(cost).filter((key) => /(price|profit|margin|commission|budget|totalCost)/i.test(key)), []);
});

test('Tarek API DTO strips any extra raw fields and returns only per-gram cost', () => {
  const dto = projectTarekProductCostDTO({
    schemaVersion: 1,
    productId: 'oil-17',
    customGramCostEgp: 12,
    updatedAt: '2026-10-16T00:00:00.000Z',
    sellingPrice: 125,
    profit: 999,
    marginPercent: 88,
    commissionAmount: 44,
    monthlyBudget: 15000,
    employeeSalary: 1000,
  }, 'fallback-id');
  assert.deepEqual(dto, {
    schemaVersion: 1,
    productId: 'oil-17',
    customGramCostEgp: 12,
    updatedAt: '2026-10-16T00:00:00.000Z',
  });
  assert.deepEqual(Object.keys(dto).filter((key) => /(profit|margin|commission|budget|salary|price)/i.test(key)), []);
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

test('Tarek workspace isolates the legacy POS and exposes only the configured no-finance v3 sale path to STORE_MANAGER', async () => {
  const app = await readProjectFile('App.tsx');
  const view = await readProjectFile('components/TarekReadOnlyWorkspace.tsx');
  const service = await readProjectFile('services/tarekWorkspaceService.ts');
  const safePos = await readProjectFile('components/TarekSafePOS.tsx');
  const workerClient = await readProjectFile('services/workerSaleClient.ts');
  assert.match(app, /currentUser\.role === 'STORE_MANAGER'[\s\S]*?return <TarekReadOnlyWorkspace/);
  assert.match(view, /data\.permissions\.canCreateSales && <TarekSafePOS/);
  assert.match(service, /assignment\.role === 'STORE_MANAGER'/);
  assert.match(service, /canCreateSales/);
  assert.match(service, /collection\(db, 'tarek_operational_costs'\)/);
  assert.match(service, /canViewOperationalCosts/);
  assert.match(service, /productCosts/);
  assert.doesNotMatch(service, /cost_catalog|mix_costs|sale_costs|sale_financials|financial_admin|totalProfit|commissionAmount/);
  assert.match(view, /data\.permissions\.canViewOperationalCosts/);
  assert.match(view, /تكلفة الجرام التشغيلية/);
  assert.doesNotMatch(view, /cost_catalog|mix_costs|sale_costs|financial_admin|officialCostEgp|bottleCostEgp|commissionAmount|totalProfit/);
  assert.match(view, /استنتاج هامش تقريبي/);
  assert.match(safePos, /getConfiguredTarekSaleWorkerEndpoint/);
  assert.match(safePos, /quoteTarekSaleToWorker/);
  assert.match(safePos, /submitTarekSaleIntentToWorker/);
  assert.match(safePos, /enqueueTarekSale/);
  assert.match(safePos, /VITE_PREVIEW_SAFE_MODE/);
  assert.match(safePos, /addEventListener\('offline', updateOnlineState\)/);
  assert.match(safePos, /if \(saleWorkerUsable && getTarekSaleOutbox\(\)\.length > 0\) flush\(\)/);
  assert.match(safePos, /typeof navigator === 'undefined' \|\| !navigator\.onLine/);
  assert.match(workerClient, /VITE_LAMSA_SALE_WORKER_ENABLED/);
  assert.match(workerClient, /VITE_LAMSA_SALE_WORKER_URL/);
  assert.doesNotMatch(safePos, /LOCAL_LAMSA_SALE_ENDPOINT/);
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
  for (const projection of ['productOperations', 'productCosts', 'tarekOperationalCosts', 'tarekProducts', 'tarekSaleProducts']) {
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

test('employee-safe cost backfill is owner-gated, marker-backed, and runs only for live product snapshots', async () => {
  const firebase = await readProjectFile('services/firebase.ts');
  const bootstrap = firebase.slice(
    firebase.indexOf('export async function ensureTarekOperationalCostProjections'),
    firebase.indexOf('export const subscribeToProducts'),
  );
  assert.match(bootstrap, /await requireOwnerAuth\(\)/);
  assert.match(bootstrap, /getDocFromServer\(markerRef\)/);
  assert.match(bootstrap, /marker\.data\(\)\.status === 'ready'/);
  assert.match(bootstrap, /const chunkSize = 450/);
  assert.match(bootstrap, /projectProductCost\(product\)/);
  assert.match(bootstrap, /SEPARATED_COLLECTIONS\.tarekOperationalCosts/);
  assert.match(firebase, /productFreshness === 'live'[\s\S]*?ensureTarekOperationalCostProjections\(baseProducts\)/);
  assert.match(firebase, /markTarekOperationalCostsBootstrapReady\(products\.length\)/);
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
  assert.match(rules, /match \/product_costs\/\{documentId\}[\s\S]*allow read: if isVerifiedOwner\(\);/);
  assert.match(rules, /match \/tarek_operational_costs\/\{documentId\}[\s\S]*allow read: if canReadOperationalCosts\(\);[\s\S]*validTarekProductCost\(request\.resource\.data\)/);
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
