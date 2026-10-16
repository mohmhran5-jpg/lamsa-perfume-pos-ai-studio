const enc = new TextEncoder();

function encodeValue(value) {
  if (value === null) return { nullValue: null };
  if (typeof value === 'boolean') return { booleanValue: value };
  if (typeof value === 'number') return Number.isSafeInteger(value)
    ? { integerValue: String(value) }
    : { doubleValue: value };
  if (typeof value === 'string') return { stringValue: value };
  if (Array.isArray(value)) return { arrayValue: { values: value.map(encodeValue) } };
  if (value && typeof value === 'object') return { mapValue: { fields: encodeFields(value) } };
  throw new Error(`Unsupported fixture value: ${typeof value}`);
}
function encodeFields(fields) {
  return Object.fromEntries(Object.entries(fields).map(([key, value]) => [key, encodeValue(value)]));
}

export const projectId = 'demo-worker-sale';
export const databaseId = 'demo-named-firestore-db';
export const firestoreRestFor = (selectedDatabaseId) =>
  `http://127.0.0.1:8080/v1/projects/${projectId}/databases/${encodeURIComponent(selectedDatabaseId)}/documents`;
export const firestoreRest = firestoreRestFor(databaseId);
export const adminHeaders = { authorization: 'Bearer owner' };

export function makeFixtures() {
  const docs = [];
  const add = (collection, id, fields) => docs.push({ key: `${collection}/${id}`, fields });
  const product = (id, { name = id, stock = 500, price = 100, grams = 5, costPerGram = 1, packaging = 0, commissionExempt = false } = {}) => {
    add('products', id, {
      id, name, active: true, unitPriceEgp: price, gramsPerUnit: grams,
      costPerGram, packagingCostEgp: packaging, commissionExempt, productType: 'perfume',
    });
    add('inventory_stock', id, { id, stock_grams: stock, updatedAt: '2026-01-01T00:00:00.000Z' });
    add('sales_catalog', id, {
      id, name, unitPriceEgp: price,
      operationalCostEgp: Number((costPerGram * grams + packaging).toFixed(2)),
      productType: 'perfume', active: true,
    });
  };

  add('role_assignments', 'seller@example.test', { email: 'seller@example.test', role: 'SALES_OPERATOR', active: true });
  add('role_assignments', 'viewer@example.test', { email: 'viewer@example.test', role: 'INVENTORY_VIEWER', active: true });
  add('role_assignments', 'manager@example.test', { email: 'manager@example.test', role: 'STORE_MANAGER', active: true });
  add('role_assignments', 'inactive@example.test', { email: 'inactive@example.test', role: 'SALES_OPERATOR', active: false });
  add('settings', 'store', {
    priceEssenceNormal: 10,
    priceEssenceNiche: 15,
    priceEssenceSpecial: 20,
    commissionRate: 0.05,
    tieredCommissionRate: 0.07,
    tieredCommissionBottleThreshold: 10,
    coloredBottleExtraCost: 35,
    minimumContributionEgp: 10,
    manualDiscountCapEgp: 20,
    loyaltyEnabled: true,
    loyaltyCashPerPointEgp: 0.1,
    loyaltyMinRedeemPoints: 50,
    loyaltyMaxDiscountPercent: 25,
    loyaltyEarnStepEgp: 10,
  });
  add('promotions', 'promo10', { active: true, type: 'percent', percentOff: 10, maxDiscountEgp: 20 });
  add('customers', 'customer-1', { id: 'customer-1', name: 'عميل تجريبي', points: 1000, loyaltyLogs: [] });
  add('vaults', 'restock', { id: 'restock', currentBalance: 0, totalInflow: 0 });
  add('vaults', 'commissions', { id: 'commissions', currentBalance: 0, totalInflow: 0 });
  add('vaults', 'owner_profit', { id: 'owner_profit', currentBalance: 0, totalInflow: 0 });

  product('retail-1', { name: 'منتج عادي تجريبي', stock: 2000, price: 100, grams: 5, costPerGram: 2, packaging: 3 });
  product('owner-product', { name: 'منتج خاص باختبار المالك', stock: 100, price: 100, grams: 5, costPerGram: 1 });
  product('new-grant-product', { name: 'منتج لاختبار المنحة الجديدة', stock: 100, price: 100, grams: 5, costPerGram: 1 });
  product('mix-a', { name: 'مكوّن ميكس أ', stock: 2000, price: 40, grams: 1, costPerGram: 1.5 });
  product('mix-b', { name: 'مكوّن ميكس ب', stock: 2000, price: 50, grams: 1, costPerGram: 2 });
  add('mixes', 'mix-small', {
    id: 'mix-small', name: 'ميكس محفوظ تجريبي', active: true, sellingPriceEgp: 300,
    packagingCostEgp: 5, timesSold: 0,
    components: [
      { productId: 'mix-a', gramsPerUnit: 2 },
      { productId: 'mix-b', gramsPerUnit: 1 },
    ],
  });
  add('mix_catalog', 'mix-small', { id: 'mix-small', name: 'ميكس محفوظ تجريبي', sellingPriceEgp: 300, operationalCostEgp: 10, active: true });

  // Emulator-only Lamsa POS records using the repository's actual Product,
  // BottleSize, StoreSettings, Sale, tarek_products and vaults collections.
  const addLamsaProduct = (id, name, type, stock = 100) => {
    add('products', id, { id, name, brand: 'Fixture', type, stock_grams: stock, isActive: true });
    add('product_operations', id, { schemaVersion: 1, id, name, brand: 'Fixture', type, stock_grams: stock, isActive: true });
    add('product_costs', id, { schemaVersion: 1, productId: id });
    add('tarek_products', id, { schemaVersion: 1, id, name, type, stock_grams: stock, min_threshold_grams: 10 });
    add('tarek_sale_products', id, { schemaVersion: 1, id, name, brand: 'Fixture', type, isActive: true });
  };
  addLamsaProduct('lamsa-normal', 'عطر تجريبي عادي', 'عادي', 100);
  addLamsaProduct('lamsa-niche', 'مكوّن نيش تجريبي', 'نيش', 100);
  addLamsaProduct('lamsa-prodtransport', 'عطر اختبار النقل الإنتاجي الوهمي', 'عادي', 100);
  addLamsaProduct('lamsa-mix-normal', 'مكوّن عادي للميكس', 'عادي', 100);
  addLamsaProduct('lamsa-last-stock', 'عطر مخزون أخير', 'عادي', 15);
  add('bottleSizes', 'bottle-50-spray', {
    id: 'bottle-50-spray', name: 'عبوة 50 مل', sizeMl: 50, essenceGrams: 15,
    officialCost: 70, normalPrice: 300, specialPrice: 450,
    coloredNormalPrice: 350, coloredSpecialPrice: 500, isRollOn: false, isActive: true,
  });
  add('bottleSizes', 'bottle-5-roll', {
    id: 'bottle-5-roll', name: 'رول 5 مل', sizeMl: 5, essenceGrams: 2,
    officialCost: 25, normalPrice: 70, specialPrice: 100, isRollOn: true, isActive: true,
  });
  const splitBottle50 = {
    schemaVersion: 1, id: 'bottle-50-spray', name: 'عبوة 50 مل', sizeMl: 50, essenceGrams: 15,
    normalPrice: 300, specialPrice: 450, coloredNormalPrice: 350, coloredSpecialPrice: 500,
    isRollOn: false, isActive: true,
  };
  const splitBottle5 = {
    schemaVersion: 1, id: 'bottle-5-roll', name: 'رول 5 مل', sizeMl: 5, essenceGrams: 2,
    normalPrice: 70, specialPrice: 100, isRollOn: true, isActive: true,
  };
  add('tarek_sale_bottle_sizes', 'bottle-50-spray', splitBottle50);
  add('tarek_sale_bottle_sizes', 'bottle-5-roll', splitBottle5);
  add('operational_settings', 'store', {
    schemaVersion: 1, storeName: 'لمسة Emulator', currency: 'EGP', bottleSizes: [splitBottle50, splitBottle5],
  });
  add('cost_catalog', 'store-cost-inputs', {
    schemaVersion: 1,
    costPolicy: {
      priceEssenceNormal: 10, priceEssenceNiche: 15, priceEssenceSpecial: 20,
      coloredBottleExtraCost: 35,
    },
    bottleSizes: [
      { id: 'bottle-50-spray', sizeMl: 50, bottleCostEgp: 70, officialCostEgp: 70 },
      { id: 'bottle-5-roll', sizeMl: 5, bottleCostEgp: 25, officialCostEgp: 25 },
    ],
  });
  add('financial_admin', 'store', {
    schemaVersion: 1,
    settings: { commissionRate: 0.05, tieredCommissionRate: 0.07, tieredCommissionBottleThreshold: 10 },
  });
  add('sales', 'prior-today-eight-sprays', {
    id: 'prior-today-eight-sprays', date: new Date().toISOString(),
    transactionType: 'بيع_طبيعي', isReversed: false,
    items: [{ id: 'prior-line', bottleSize: 50, isRollOn: false, quantity: 8 }],
  });
  add('sale_operations', 'prior-today-eight-sprays', {
    schemaVersion: 1, id: 'prior-today-eight-sprays', date: new Date().toISOString(),
    transactionType: 'بيع_طبيعي', isReversed: false,
    items: [{ id: 'prior-line', bottleSize: 50, isRollOn: false, quantity: 8 }],
  });
  add('sales', 'TEST-prior-today-100-sprays', {
    id: 'TEST-prior-today-100-sprays', date: new Date().toISOString(),
    transactionType: 'بيع_طبيعي', dataClassification: 'TEST', isTestData: true,
    items: [{ id: 'test-prior-line', bottleSize: 50, isRollOn: false, quantity: 100 }],
  });
  product('role-product', { stock: 500, price: 20, grams: 5, costPerGram: 1 });
  product('discount-test', { stock: 500, price: 100, grams: 5, costPerGram: 1 });
  product('idempotent-product', { stock: 500, price: 100, grams: 5, costPerGram: 1 });
  product('low-stock', { stock: 3, price: 100, grams: 5, costPerGram: 1 });
  product('last-stock', { stock: 5, price: 100, grams: 5, costPerGram: 1 });
  product('realtime-1', { stock: 500, price: 100, grams: 5, costPerGram: 1 });

  for (let mixIndex = 0; mixIndex < 100; mixIndex += 1) {
    const mixId = `mix-${String(mixIndex).padStart(3, '0')}`;
    const components = [];
    for (let part = 0; part < 4; part += 1) {
      const productIndex = mixIndex * 4 + part;
      const productId = `max-p-${String(productIndex).padStart(3, '0')}`;
      product(productId, { name: `عنصر اختبار ${productIndex}`, stock: 100, price: 1, grams: 1, costPerGram: 0.01 });
      components.push({ productId, gramsPerUnit: 1 });
    }
    add('mixes', mixId, {
      id: mixId, name: `ميكس الحد ${mixIndex}`, active: true, sellingPriceEgp: 10,
      packagingCostEgp: 0, timesSold: 0, components,
    });
    add('mix_catalog', mixId, {
      id: mixId, name: `ميكس الحد ${mixIndex}`, sellingPriceEgp: 10,
      operationalCostEgp: 0.04, active: true,
      components: components.map(({ productId, gramsPerUnit }) => ({ productId, gramsPerUnit })),
    });
  }
  return docs;
}

export async function clearEmulator(databaseIds = [databaseId, '(default)']) {
  for (const selectedDatabaseId of databaseIds) {
    const endpoint = `http://127.0.0.1:8080/emulator/v1/projects/${projectId}/databases/${encodeURIComponent(selectedDatabaseId)}/documents`;
    const response = await fetch(endpoint, { method: 'DELETE' });
    if (response.status === 404) continue;
    if (!response.ok) {
      throw new Error(`Emulator clear failed for ${selectedDatabaseId} (${response.status}): ${await response.text()}`);
    }
  }
}

export async function seedEmulator(databaseIds = [databaseId, '(default)']) {
  const docs = makeFixtures();
  for (const selectedDatabaseId of databaseIds) {
    const selectedRoot = firestoreRestFor(selectedDatabaseId);
    const writes = docs.map(({ key, fields }) => ({
      update: {
        name: `projects/${projectId}/databases/${selectedDatabaseId}/documents/${key}`,
        fields: encodeFields(fields),
      },
    }));
    for (let start = 0; start < writes.length; start += 300) {
      const response = await fetch(`${selectedRoot}:commit`, {
        method: 'POST', headers: { ...adminHeaders, 'content-type': 'application/json' },
        body: JSON.stringify({ writes: writes.slice(start, start + 300) }),
      });
      if (!response.ok) throw new Error(`Fixture commit failed for ${selectedDatabaseId} (${start}): ${await response.text()}`);
    }
  }
  console.log(`Seeded ${docs.length} synthetic emulator documents in ${databaseIds.length} emulator databases.`);
}
