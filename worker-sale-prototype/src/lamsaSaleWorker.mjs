import { normalizeLamsaSaleIntent } from './lamsaSaleContract.mjs';
import {
  COMMISSION_COUNTER_COLLECTION,
  MAX_COUNTER_BOOTSTRAP_DOCS_PER_COLLECTION,
  countSaleSprays,
  isExplicitTestSale,
  isValidDateKey,
  nextCommissionCounter,
  utcDateKey,
  validateReadyCommissionCounter,
} from './commissionDayCounter.mjs';

// Each unique product updates both canonical and operational stock documents.
// Keep enough headroom for the sale projections, lock, vaults and quote within Firestore's 500-write limit.
const MAX_STOCK_DOCS = 240;
export const PACKAGING = {
  basic_bag: { cost: 0, price: 0, replacesBasicBag: false },
  luxury_box: { cost: 10, price: 10, replacesBasicBag: false },
  luxury_bag: { cost: 10, price: 10, replacesBasicBag: true },
  luxury_both: { cost: 20, price: 20, replacesBasicBag: true },
};
const SPECIAL_TYPES = new Set(['نيش', 'عود', 'مسك']);
export const PRESET_PROMOTIONS = {
  'duo-50ml': { name: 'عرض الثنائية الأنيقة (2× 50مل)', sizeMl: 50, quantity: 2, type: 'percent', value: 10 },
  'trio-royal': { name: 'باقة الثلاثية الملكية (3× 50مل)', sizeMl: 50, quantity: 3, type: 'percent', value: 15 },
  'diamond-100ml': { name: 'العرض الماسي المباشر (2× 100مل)', sizeMl: 100, quantity: 2, type: 'percent', value: 20 },
  'duo-30ml': { name: 'عرض الدوام المزدوج (2× 30مل)', sizeMl: 30, quantity: 2, type: 'fixed', value: 50 },
};

class LamsaWorkerError extends Error {
  constructor(status, code) {
    super(code);
    this.status = status;
    this.code = code;
  }
}

function roundMoney(value) {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

function requiredNumber(source, key, { min = 0, fallback } = {}) {
  const value = source?.[key] ?? fallback;
  if (typeof value !== 'number' || !Number.isFinite(value) || value < min) {
    throw new LamsaWorkerError(409, `sale/invalid-authoritative-${key}`);
  }
  return value;
}

function optionalNumber(source, key, fallback = 0) {
  return requiredNumber(source, key, { min: 0, fallback });
}

function safeId(value) {
  return typeof value === 'string' && value.length > 0 && value.length <= 1500
    && !value.includes('/') && value !== '.' && value !== '..';
}

function getOilGramCost(type, settings, product) {
  if (typeof product?.customGramCostEgp === 'number' && Number.isFinite(product.customGramCostEgp)
      && product.customGramCostEgp > 0) return product.customGramCostEgp;
  if (type === 'نيش') return requiredNumber(settings, 'priceEssenceNiche', { min: 0, fallback: 15 });
  if (type === 'عود' || type === 'مسك') return requiredNumber(settings, 'priceEssenceSpecial', { min: 0, fallback: 20 });
  if (type !== 'عادي') throw new LamsaWorkerError(409, 'sale/invalid-authoritative-product-type');
  return requiredNumber(settings, 'priceEssenceNormal', { min: 0, fallback: 10 });
}

export function approvedPrice(bottle, type, colored) {
  if (!['عادي', 'نيش', 'عود', 'مسك'].includes(type)) {
    throw new LamsaWorkerError(409, 'sale/invalid-authoritative-product-type');
  }
  const roll = bottle.isRollOn === true;
  const special = SPECIAL_TYPES.has(type);
  if (colored && !roll) {
    if (special) {
      const price = bottle.coloredSpecialPrice;
      if (typeof price === 'number' && Number.isFinite(price) && price > 0) return price;
      throw new LamsaWorkerError(409, 'sale/colored-special-price-not-approved');
    }
    const defaultColored = bottle.coloredNormalPrice
      ?? ({ 100: 600, 50: 300, 30: 250 }[bottle.sizeMl]);
    if (typeof defaultColored !== 'number' || !Number.isFinite(defaultColored) || defaultColored <= 0) {
      throw new LamsaWorkerError(409, 'sale/colored-price-not-approved');
    }
    return defaultColored;
  }
  return requiredNumber(bottle, special ? 'specialPrice' : 'normalPrice', { min: 0.01 });
}

export function derivedSingleCost(bottle, type, grams, colored, settings) {
  const normalGramCost = requiredNumber(settings, 'priceEssenceNormal', { min: 0, fallback: 10 });
  const standardGramCost = getOilGramCost(type, settings);
  const standardGrams = requiredNumber(bottle, 'essenceGrams', { min: 0.01 });
  const officialCost = requiredNumber(bottle, 'officialCost', { min: 0 });
  const coloredDelta = colored && bottle.isRollOn !== true
    ? requiredNumber(settings, 'coloredBottleExtraCost', { min: 0, fallback: 35 }) : 0;
  return Math.max(0, Math.round(officialCost
    + standardGrams * (standardGramCost - normalGramCost)
    + (grams - standardGrams) * standardGramCost
    + coloredDelta));
}

export function mixUnitCostAndSuggestedPrice(bottle, components, products, settings, colored) {
  const normalGramCost = requiredNumber(settings, 'priceEssenceNormal', { min: 0, fallback: 10 });
  const standardGrams = Math.max(1, Math.round(requiredNumber(bottle, 'essenceGrams', { min: 0.01 })));
  const officialCost = requiredNumber(bottle, 'officialCost', { min: 0 });
  const overhead = Math.max(bottle.isRollOn === true ? 5 : 15, officialCost - standardGrams * normalGramCost)
    + (colored && bottle.isRollOn !== true
      ? requiredNumber(settings, 'coloredBottleExtraCost', { min: 0, fallback: 35 }) : 0);
  const enriched = components.map((component) => {
    const product = products.get(component.productId);
    if (!product || product.isActive === false) throw new LamsaWorkerError(409, 'sale/mix-component-unavailable');
    const type = product.type;
    const costPerGram = getOilGramCost(type, settings, product);
    return {
      productId: component.productId,
      productName: String(product.name || component.productId),
      brand: String(product.brand || ''),
      productType: type,
      grams: component.gramsPerBottle,
      oilGramCost: costPerGram,
      componentOilCost: Math.round(component.gramsPerBottle * costPerGram),
    };
  });
  const totalGrams = enriched.reduce((sum, item) => sum + item.grams, 0);
  const oilCost = enriched.reduce((sum, item) => sum + item.componentOilCost, 0);
  const unitCost = Math.max(0, Math.round(overhead + oilCost));
  const normalPrice = approvedPrice(bottle, 'عادي', colored);
  const specialPrice = approvedPrice(bottle, 'عود', colored);
  const weightedBase = totalGrams > 0
    ? Math.round(enriched.reduce((sum, item) => sum + item.grams / totalGrams
      * (SPECIAL_TYPES.has(item.productType) ? specialPrice : normalPrice), 0))
    : normalPrice;
  const extraGrams = Math.max(0, totalGrams - standardGrams);
  const averageOilCost = totalGrams > 0 ? oilCost / totalGrams : normalGramCost;
  const extraPrice = Math.round(extraGrams * averageOilCost * 1.35);
  const rate = bottle.isRollOn === true ? 0 : requiredNumber(settings, 'commissionRate', { min: 0, fallback: 0.05 });
  if (rate >= 1) throw new LamsaWorkerError(409, 'sale/invalid-commission-rate');
  const minSafePrice = Math.ceil((unitCost + 10) / Math.max(0.1, 1 - rate));
  const uniformNormal = enriched.every((item) => item.productType === 'عادي') && extraGrams === 0;
  const uniformSpecial = enriched.every((item) => item.productType !== 'عادي') && extraGrams === 0;
  const rawSuggested = Math.max(minSafePrice, weightedBase + extraPrice);
  const suggestedPrice = uniformNormal
    ? Math.max(minSafePrice, normalPrice)
    : uniformSpecial
      ? Math.max(minSafePrice, specialPrice)
      : Math.ceil(rawSuggested / 5) * 5;
  return { unitCost, suggestedPrice, components: enriched, totalGrams };
}

async function queryHistoricalSalesForCounter(env, transactionId, datePrefix, fsRequest, firestoreRoot, decodeFields) {
  const nextDate = new Date(`${datePrefix}T00:00:00.000Z`);
  nextDate.setUTCDate(nextDate.getUTCDate() + 1);
  const byId = new Map();
  for (const collectionId of ['sales', 'sale_operations']) {
    const query = {
      structuredQuery: {
        from: [{ collectionId }],
        where: {
          compositeFilter: {
            op: 'AND',
            filters: [
              { fieldFilter: { field: { fieldPath: 'date' }, op: 'GREATER_THAN_OR_EQUAL', value: { stringValue: `${datePrefix}T00:00:00.000Z` } } },
              { fieldFilter: { field: { fieldPath: 'date' }, op: 'LESS_THAN', value: { stringValue: nextDate.toISOString() } } },
            ],
          },
        },
        select: { fields: [
          { fieldPath: 'date' }, { fieldPath: 'isReversed' }, { fieldPath: 'transactionType' }, { fieldPath: 'items' },
          { fieldPath: 'dataClassification' }, { fieldPath: 'isTestData' }, { fieldPath: 'notes' },
          { fieldPath: 'title' }, { fieldPath: 'customerName' }, { fieldPath: 'reason' },
        ] },
        limit: MAX_COUNTER_BOOTSTRAP_DOCS_PER_COLLECTION + 1,
      },
      transaction: transactionId,
    };
    const { parsed, text } = await fsRequest(env, 'POST', `${firestoreRoot(env)}:runQuery`, query);
    let records = Array.isArray(parsed) ? parsed : [];
    if (!records.length && text?.trim()) {
      try {
        const decoded = JSON.parse(text.trim());
        records = Array.isArray(decoded) ? decoded : [decoded];
      } catch {
        records = text.trim().split(/\r?\n/).flatMap((line) => {
          try { return [JSON.parse(line)]; } catch { return []; }
        });
      }
    }
    if (!Array.isArray(records)) throw new LamsaWorkerError(502, 'sale/commission-counter-history-query-invalid');
    const documents = records.filter((entry) => entry.document?.fields);
    if (documents.length > MAX_COUNTER_BOOTSTRAP_DOCS_PER_COLLECTION) {
      throw new LamsaWorkerError(503, 'sale/commission-counter-history-too-large');
    }
    for (const entry of documents) {
      if (!entry.document?.fields) continue;
      const id = String(entry.document.name || '').split('/').pop() || '';
      if (!id) throw new LamsaWorkerError(503, 'sale/commission-counter-history-ambiguous-id');
      const sale = { ...decodeFields(entry.document.fields), id };
      const prior = byId.get(id);
      if (prior) {
        const priorCount = prior.skip ? 0 : countSaleSprays(prior.sale);
        const nextCount = isExplicitTestSale(sale, id) ? 0 : countSaleSprays(sale);
        if (prior.dateKey !== String(sale.date || '').slice(0, 10)
            || prior.reversed !== (sale.isReversed === true)
            || priorCount !== nextCount) {
          throw new LamsaWorkerError(503, 'sale/commission-counter-history-duplicate-conflict');
        }
        if (collectionId === 'sales' && prior.collectionId !== 'sales') {
          byId.set(id, { sale, dateKey: String(sale.date || '').slice(0, 10), reversed: sale.isReversed === true,
            skip: isExplicitTestSale(sale, id), collectionId });
        }
        continue;
      }
      const saleDateKey = typeof sale.date === 'string' ? sale.date.slice(0, 10) : '';
      if (saleDateKey !== datePrefix || !isValidDateKey(saleDateKey)) {
        throw new LamsaWorkerError(503, 'sale/commission-counter-history-ambiguous-date');
      }
      const skip = isExplicitTestSale(sale, id) || sale.isReversed === true
        || (sale.transactionType !== undefined && sale.transactionType !== 'بيع_طبيعي');
      if (!skip) {
        try { countSaleSprays(sale); }
        catch { throw new LamsaWorkerError(503, 'sale/commission-counter-history-ambiguous'); }
      }
      byId.set(id, { sale, dateKey: saleDateKey, reversed: sale.isReversed === true, skip, collectionId });
    }
  }
  let sprayBottlesSold = 0;
  for (const entry of byId.values()) {
    if (!entry.skip) {
      try { sprayBottlesSold += countSaleSprays(entry.sale); }
      catch { throw new LamsaWorkerError(503, 'sale/commission-counter-history-ambiguous'); }
    }
  }
  if (!Number.isSafeInteger(sprayBottlesSold)) throw new LamsaWorkerError(503, 'sale/commission-counter-history-overflow');
  return { sprayBottlesSold, uniqueSaleCount: byId.size };
}

function commissionCounterPath(dateKey) {
  return `${COMMISSION_COUNTER_COLLECTION}/${dateKey}`;
}

function readReadyCommissionCounter(docs, dateKey) {
  const counter = docs.get(commissionCounterPath(dateKey));
  try { return validateReadyCommissionCounter(counter, dateKey); }
  catch { throw new LamsaWorkerError(503, 'sale/commission-counter-not-ready'); }
}

function readOptionalReadyCommissionCounter(docs, dateKey) {
  try { return readReadyCommissionCounter(docs, dateKey); }
  catch { return null; }
}

export const LAMSA_FRESH_START_DATE_KEY = '2026-10-17';

/** Keep the agreed zero-baseline cutover fail-closed if any same-day history exists. */
export function assertFreshStartDateHasNoSales(dateKey, history) {
  if (dateKey === LAMSA_FRESH_START_DATE_KEY
      && (history?.uniqueSaleCount !== 0 || history?.sprayBottlesSold !== 0)) {
    throw new LamsaWorkerError(409, 'sale/fresh-start-date-not-empty');
  }
}

/** Owner-only, current-UTC-day bootstrap. Repeated calls read only the counter. */
export async function handleLamsaCommissionCounterBootstrap(request, env, helpers) {
  const { authenticate, batchGet, fsRequest, firestoreRoot, makeWrite, commitWrites, rollback, decodeFields, json } = helpers;
  const user = await authenticate(request, env);
  const ownerEmail = String(env.OWNER_EMAIL || '').trim().toLowerCase();
  if (!ownerEmail || user.email !== ownerEmail) throw new LamsaWorkerError(403, 'role/owner-required');
  const contentLength = Number(request.headers.get('content-length') || 0);
  if (Number.isFinite(contentLength) && contentLength > 1024) throw new LamsaWorkerError(413, 'sale/commission-counter-request-too-large');
  const rawBody = await request.text();
  if (new TextEncoder().encode(rawBody).byteLength > 1024) throw new LamsaWorkerError(413, 'sale/commission-counter-request-too-large');
  let body;
  try { body = rawBody ? JSON.parse(rawBody) : {}; } catch { throw new LamsaWorkerError(400, 'sale/commission-counter-invalid-json'); }
  if (!body || typeof body !== 'object' || Array.isArray(body) || Object.keys(body).length) {
    throw new LamsaWorkerError(400, 'sale/commission-counter-invalid-request');
  }

  const dateKey = utcDateKey();
  const counterPath = commissionCounterPath(dateKey);
  for (let attempt = 0; attempt < 4; attempt += 1) {
    let transactionId;
    try {
      const initial = await batchGet(env, [counterPath]);
      transactionId = initial.transactionId;
      const existing = initial.docs.get(counterPath);
      if (existing) {
        const counter = readReadyCommissionCounter(initial.docs, dateKey);
        await rollback(env, transactionId);
        transactionId = null;
        return json({ ok: true, status: 'already-ready', dateKey, sprayBottlesSold: counter.sprayBottlesSold,
          generation: counter.generation, historyScanned: false });
      }

      const history = await queryHistoricalSalesForCounter(
        env, transactionId, dateKey, fsRequest, firestoreRoot, decodeFields,
      );
      assertFreshStartDateHasNoSales(dateKey, history);
      const now = new Date().toISOString();
      const counter = {
        schemaVersion: 1,
        status: 'ready',
        dateKey,
        sprayBottlesSold: history.sprayBottlesSold,
        generation: 0,
        initializedAt: now,
        updatedAt: now,
        historySource: 'sales+sale_operations-v1',
        historicalSaleIdsScanned: history.uniqueSaleCount,
      };
      await commitWrites(env, transactionId, [makeWrite(env, counterPath, counter, { exists: false })]);
      transactionId = null;
      return json({ ok: true, status: 'ready', dateKey, sprayBottlesSold: counter.sprayBottlesSold,
        generation: counter.generation, historyScanned: true, historicalSaleIdsScanned: history.uniqueSaleCount });
    } catch (error) {
      await rollback(env, transactionId);
      if (error?.retryable && attempt < 3) {
        await new Promise((resolve) => setTimeout(resolve, 10 * (2 ** attempt)));
        continue;
      }
      if (error instanceof LamsaWorkerError) throw error;
      if (error?.status && error?.code) throw new LamsaWorkerError(error.status, error.code);
      throw new LamsaWorkerError(502, 'sale/commission-counter-bootstrap-failed');
    }
  }
  throw new LamsaWorkerError(409, 'sale/commission-counter-bootstrap-conflict');
}

/** Resolve only owner-maintained split projections; never fall back to legacy prices or costs. */
export function resolveSeparatedSaleDocuments(request, sourceDocs) {
  const docs = new Map(sourceDocs);
  const costCatalog = sourceDocs.get('cost_catalog/store-cost-inputs');
  const financialAdmin = sourceDocs.get('financial_admin/store');
  const operationalSettings = sourceDocs.get('operational_settings/store');
  if (costCatalog?.schemaVersion !== 1 || financialAdmin?.schemaVersion !== 1
      || operationalSettings?.schemaVersion !== 1 || !costCatalog.costPolicy
      || !financialAdmin.settings || !Array.isArray(operationalSettings.bottleSizes)) {
    throw new LamsaWorkerError(503, 'sale/separated-settings-not-ready');
  }
  const settings = { ...costCatalog.costPolicy, ...financialAdmin.settings };
  for (const key of ['priceEssenceNormal', 'priceEssenceNiche', 'priceEssenceSpecial',
    'coloredBottleExtraCost', 'commissionRate', 'tieredCommissionRate', 'tieredCommissionBottleThreshold']) {
    if (typeof settings[key] !== 'number' || !Number.isFinite(settings[key]) || settings[key] < 0) {
      throw new LamsaWorkerError(503, `sale/separated-setting-invalid-${key}`);
    }
  }
  const operationalBottles = new Map(operationalSettings.bottleSizes.map((item) => [String(item.id), item]));
  const bottleCosts = new Map((Array.isArray(costCatalog.bottleSizes) ? costCatalog.bottleSizes : [])
    .map((item) => [String(item.id), item]));
  docs.set('settings/store', settings);

  for (const id of new Set(request.lines.map((line) => line.bottleSizeId))) {
    const saleBottle = sourceDocs.get(`tarek_sale_bottle_sizes/${id}`);
    const operationalBottle = operationalBottles.get(id);
    const bottleCost = bottleCosts.get(id);
    if (saleBottle?.schemaVersion !== 1 || String(saleBottle.id) !== id
        || !operationalBottle || !bottleCost
        || typeof bottleCost.officialCostEgp !== 'number' || !Number.isFinite(bottleCost.officialCostEgp)
        || bottleCost.officialCostEgp < 0) {
      throw new LamsaWorkerError(503, 'sale/separated-bottle-data-not-ready');
    }
    for (const key of ['sizeMl', 'essenceGrams', 'normalPrice', 'coloredNormalPrice',
      'specialPrice', 'coloredSpecialPrice', 'isRollOn', 'isActive']) {
      if ((saleBottle[key] ?? null) !== (operationalBottle[key] ?? null)) {
        throw new LamsaWorkerError(409, 'sale/bottle-catalog-stale');
      }
    }
    docs.set(`bottleSizes/${id}`, {
      ...saleBottle,
      officialCost: bottleCost.officialCostEgp,
      bottleCost: bottleCost.bottleCostEgp,
      alcoholCost: bottleCost.alcoholCostEgp,
    });
  }

  const productIds = new Set(request.lines.flatMap((line) => line.mixComponents
    ? line.mixComponents.map((component) => component.productId) : [line.productId]));
  for (const id of productIds) {
    const saleProduct = sourceDocs.get(`tarek_sale_products/${id}`);
    const stockProduct = sourceDocs.get(`tarek_products/${id}`);
    const productCost = sourceDocs.get(`product_costs/${id}`);
    if (saleProduct?.schemaVersion !== 1 || String(saleProduct.id) !== id
        || stockProduct?.schemaVersion !== 1 || String(stockProduct.id) !== id
        || !productCost || productCost.schemaVersion !== 1 || String(productCost.productId) !== id
        || typeof saleProduct.type !== 'string' || saleProduct.type !== stockProduct.type) {
      throw new LamsaWorkerError(503, 'sale/separated-product-data-not-ready');
    }
    if (productCost.customGramCostEgp !== undefined
        && (typeof productCost.customGramCostEgp !== 'number' || !Number.isFinite(productCost.customGramCostEgp)
          || productCost.customGramCostEgp < 0)) {
      throw new LamsaWorkerError(409, 'sale/separated-product-cost-invalid');
    }
    docs.set(`products/${id}`, {
      ...stockProduct,
      ...saleProduct,
      isActive: saleProduct.isActive !== false,
      ...(typeof productCost.customGramCostEgp === 'number'
        ? { customGramCostEgp: productCost.customGramCostEgp } : {}),
    });
  }
  return docs;
}

export function calculateCommission(lines, netRatio, priorSprays, settings) {
  const baseRate = requiredNumber(settings, 'commissionRate', { min: 0, fallback: 0.05 });
  const tieredRate = requiredNumber(settings, 'tieredCommissionRate', { min: 0, fallback: 0.07 });
  const threshold = requiredNumber(settings, 'tieredCommissionBottleThreshold', { min: 1, fallback: 10 });
  if (baseRate >= 1 || tieredRate >= 1) throw new LamsaWorkerError(409, 'sale/invalid-commission-rate');
  let sprayIndex = Math.max(0, Math.floor(priorSprays));
  let total = 0;
  const lineCommissions = [];
  for (const line of lines) {
    let lineCommission = 0;
    if (!line.isRollOn) {
      const unitNetPrice = Math.round(line.unitPrice * netRatio);
      for (let unit = 0; unit < line.quantity; unit += 1) {
        sprayIndex += 1;
        lineCommission += Math.round(unitNetPrice * (sprayIndex <= threshold ? baseRate : tieredRate));
      }
    }
    lineCommissions.push(lineCommission);
    total += lineCommission;
  }
  return { total: roundMoney(total), lineCommissions };
}

function buildSale({ request, requestHash, user, role, docs, priorSprayBottlesSold, commissionCounterReady, now }) {
  docs = resolveSeparatedSaleDocuments(request, docs);
  const settings = docs.get('settings/store');
  if (!settings) throw new LamsaWorkerError(503, 'sale/separated-settings-not-ready');
  const commissionRate = requiredNumber(settings, 'commissionRate', { min: 0, fallback: 0.05 });
  if (commissionRate >= 1) throw new LamsaWorkerError(409, 'sale/invalid-commission-rate');

  const deductions = new Map();
  const productDocs = new Map();
  const pricingLines = [];
  let subtotal = 0;
  let productCost = 0;

  const addDeduction = (productId, grams) => {
    if (!Number.isFinite(grams) || grams <= 0) throw new LamsaWorkerError(400, 'sale/invalid-stock-deduction');
    deductions.set(productId, (deductions.get(productId) || 0) + grams);
    if (deductions.size > MAX_STOCK_DOCS) throw new LamsaWorkerError(400, 'sale/too-many-stock-documents');
  };

  for (const line of request.lines) {
    const bottle = docs.get(`bottleSizes/${line.bottleSizeId}`);
    if (!bottle || bottle.isActive === false) throw new LamsaWorkerError(409, 'sale/bottle-size-unavailable');
    if (bottle.id && bottle.id !== line.bottleSizeId) throw new LamsaWorkerError(409, 'sale/bottle-size-id-mismatch');
    if (requiredNumber(bottle, 'sizeMl', { min: 0.01 }) !== line.bottleSizeMl) {
      throw new LamsaWorkerError(409, 'sale/bottle-size-mismatch');
    }
    const standardGrams = requiredNumber(bottle, 'essenceGrams', { min: 0.01 });
    let unitCost;
    let suggestedPrice;
    let productId;
    let productName;
    let productType;
    let mixComponents;
    if (line.mixComponents) {
      if (line.mixComponents.reduce((sum, component) => sum + component.gramsPerBottle, 0) !== line.essenceGramsPerBottle) {
        throw new LamsaWorkerError(409, 'sale/mix-essence-mismatch');
      }
      const priced = mixUnitCostAndSuggestedPrice(bottle, line.mixComponents, new Map(
        line.mixComponents.map((component) => [component.productId, docs.get(`products/${component.productId}`)]),
      ), settings, line.isColoredBottle);
      unitCost = priced.unitCost;
      suggestedPrice = priced.suggestedPrice;
      mixComponents = priced.components;
      const dominant = priced.components.some((component) => component.productType === 'عود' || component.productType === 'مسك')
        ? priced.components.find((component) => component.productType === 'عود' || component.productType === 'مسك').productType
        : priced.components.some((component) => component.productType === 'نيش') ? 'نيش' : 'عادي';
      productType = dominant;
      productName = String(line.customFormulaName || priced.components.map((component) => component.productName).join(' + ') || 'ميكس خاص');
      for (const component of priced.components) {
        const product = docs.get(`products/${component.productId}`);
        if (!product || product.isActive === false) throw new LamsaWorkerError(409, 'sale/mix-component-unavailable');
        productDocs.set(component.productId, product);
        addDeduction(component.productId, component.grams * line.quantity);
      }
      productId = `mix-${line.lineId}`;
    } else {
      productId = line.productId;
      const product = docs.get(`products/${productId}`);
      if (!product || product.isActive === false) throw new LamsaWorkerError(409, 'sale/product-unavailable');
      productDocs.set(productId, product);
      productType = product.type;
      productName = String(product.name || productId);
      unitCost = derivedSingleCost(bottle, productType, line.essenceGramsPerBottle, line.isColoredBottle, settings);
      suggestedPrice = approvedPrice(bottle, productType, line.isColoredBottle);
      addDeduction(productId, line.essenceGramsPerBottle * line.quantity);
    }

    const requestedPrice = line.requestedUnitPriceEgp ?? suggestedPrice;
    const customPrice = Math.abs(requestedPrice - suggestedPrice) > 0.009;
    if (customPrice && role !== 'OWNER') throw new LamsaWorkerError(403, 'sale/custom-price-owner-required');
    if (line.previewUnitCostEgp !== undefined && Math.abs(line.previewUnitCostEgp - unitCost) > 0.009) {
      throw new LamsaWorkerError(409, 'sale/authoritative-preview-mismatch');
    }
    const unitPrice = customPrice ? requestedPrice : suggestedPrice;
    if (!Number.isFinite(unitPrice) || unitPrice <= 0) throw new LamsaWorkerError(409, 'sale/non-positive-unit-price');
    const linePrice = roundMoney(unitPrice * line.quantity);
    const lineCost = roundMoney(unitCost * line.quantity);
    subtotal += linePrice;
    productCost += lineCost;
    const isRollOn = bottle.isRollOn === true || [2, 3, 5].includes(line.bottleSizeMl);
    pricingLines.push({ ...line, productId, productName, productType, mixComponents, unitCost, unitPrice, linePrice, lineCost, isRollOn, customPrice });
  }

  const markedPromotionLines = pricingLines.filter((line) => Boolean(line.promotionId));
  let promotionDiscount = 0;
  let promotionalSavings;
  if (request.promotionId || markedPromotionLines.length) {
    const policy = PRESET_PROMOTIONS[request.promotionId];
    if (!policy) throw new LamsaWorkerError(409, 'sale/promotion-reference-unsupported');
    if (!markedPromotionLines.length || markedPromotionLines.some((line) => line.promotionId !== request.promotionId
        || line.mixComponents || line.customPrice || line.isRollOn || line.bottleSizeMl !== policy.sizeMl)) {
      throw new LamsaWorkerError(409, 'sale/promotion-items-do-not-match-reference');
    }
    if (markedPromotionLines.reduce((sum, line) => sum + line.quantity, 0) !== policy.quantity) {
      throw new LamsaWorkerError(409, 'sale/promotion-quantity-mismatch');
    }
    promotionDiscount = policy.type === 'percent'
      ? Math.round(markedPromotionLines.reduce((sum, line) => sum + line.linePrice, 0) * policy.value / 100)
      : Math.min(markedPromotionLines.reduce((sum, line) => sum + line.linePrice, 0), policy.value);
    const originalTotal = roundMoney(markedPromotionLines.reduce((sum, line) => sum + line.linePrice, 0));
    promotionalSavings = {
      promotionId: request.promotionId,
      offerName: policy.name,
      originalTotal,
      finalTotal: roundMoney(originalTotal - promotionDiscount),
      savedAmount: promotionDiscount,
      savingsPercent: originalTotal > 0 ? Math.round(promotionDiscount / originalTotal * 100) : 0,
    };
  }

  const packaging = request.packagingOptionId ? PACKAGING[request.packagingOptionId] : null;
  if (request.packagingPaid && !packaging) throw new LamsaWorkerError(400, 'sale/packaging-option-required');
  const packageRevenue = request.packagingPaid ? packaging.price : 0;
  const packageCost = packaging?.cost || 0;
  subtotal = roundMoney(subtotal + packageRevenue);
  productCost = roundMoney(productCost + packageCost);
  if (subtotal <= 0) throw new LamsaWorkerError(409, 'sale/non-positive-subtotal');
  if (request.loyaltyPointsToRedeem > 0) throw new LamsaWorkerError(409, 'sale/loyalty-authority-required');

  const discount = roundMoney(request.manualDiscountEgp + promotionDiscount);
  if (discount >= subtotal) throw new LamsaWorkerError(409, 'sale/non-positive-total');
  const totalPrice = roundMoney(subtotal - discount);
  const netRatio = totalPrice / subtotal;
  const commission = calculateCommission(pricingLines, netRatio,
    commissionCounterReady ? priorSprayBottlesSold : Number.MAX_SAFE_INTEGER, settings);
  const allRollOn = pricingLines.every((line) => line.isRollOn);
  const minimumContribution = 10;
  const effectiveRate = allRollOn ? 0 : commissionRate;
  const minSafeNet = Math.ceil((productCost + minimumContribution) / Math.max(0.1, 1 - effectiveRate));
  const maxDiscount = Math.max(0, subtotal - minSafeNet);
  const profitEstimate = roundMoney(totalPrice - productCost - commission.total);
  const profit = commissionCounterReady ? profitEstimate : 0;
  if (![subtotal, productCost, discount, totalPrice, commission.total, profitEstimate, maxDiscount].every(Number.isFinite)) {
    throw new LamsaWorkerError(409, 'sale/non-finite-calculation');
  }
  if (request.schema === 'lamsa.sale-intent/v2'
      && (Math.abs(request.previewTotalPriceEgp - totalPrice) > 0.009
        || Math.abs(request.previewTotalCostEgp - productCost) > 0.009
        || Math.abs(request.previewCommissionEgp - commission.total) > 0.009
        || Math.abs(request.previewTotalProfitEgp - profitEstimate) > 0.009)) {
    throw new LamsaWorkerError(409, 'sale/authoritative-preview-mismatch');
  }
  if (discount > maxDiscount || totalPrice <= productCost || profitEstimate < minimumContribution) {
    throw new LamsaWorkerError(409, 'sale/discount-exceeds-safe-margin');
  }

  const itemDocs = pricingLines.map((line, index) => {
    const lineNet = roundMoney(line.linePrice * netRatio);
    const lineProfit = roundMoney(lineNet - line.lineCost - commission.lineCommissions[index]);
    return {
      id: line.lineId,
      productId: line.productId,
      productName: line.productName,
      productType: line.productType,
      bottleSize: line.bottleSizeMl,
      bottleSizeId: line.bottleSizeId,
      essenceGrams: line.essenceGramsPerBottle * line.quantity,
      cost: line.lineCost,
      sellingPrice: line.linePrice,
      profit: commissionCounterReady ? lineProfit : 0,
      quantity: line.quantity,
      isColoredBottle: line.isColoredBottle,
      isRollOn: line.isRollOn,
      isMix: Boolean(line.mixComponents),
      compositionType: line.mixComponents ? 'ميكس' : 'single',
      ...(line.mixComponents ? { mixComponents: line.mixComponents.map((component) => ({
        productId: component.productId,
        productName: component.productName,
        brand: component.brand,
        productType: component.productType,
        grams: component.grams,
        oilGramCost: component.oilGramCost,
        componentOilCost: component.componentOilCost,
      })) } : {}),
      ...(line.mixComponents ? { customFormulaName: line.productName } : {}),
      ...(line.promotionId ? { promotionId: line.promotionId } : {}),
    };
  });
  const stockDeductions = Object.fromEntries([...deductions.entries()].sort(([a], [b]) => a.localeCompare(b)));
  const sale = {
    id: request.saleId,
    requestHash,
    date: now,
    timestamp: now,
    recordedAt: now,
    recordedBy: user.email,
    employeeName: String(user.displayName || user.email),
    source: 'المتجر',
    packagingOptionId: request.packagingOptionId,
    items: itemDocs,
    totalPrice,
    totalCost: productCost,
    totalProfit: profit,
    paymentMethod: request.paymentMethod,
    discount,
    ...(request.promotionId ? { promotionId: request.promotionId, promotionalSavings } : {}),
    ...(request.customerName ? { customerName: request.customerName } : {}),
    ...(request.customerPhone ? { customerPhone: request.customerPhone } : {}),
    ...(packageRevenue > 0 ? { packagingRevenueEgp: packageRevenue } : {}),
    ...(packageCost > 0 ? { packagingCostEgp: packageCost } : {}),
    ...(packaging?.replacesBasicBag ? { isBasicBagReplacedByLuxury: true } : {}),
    commissionAmount: commissionCounterReady ? commission.total : 0,
    totalCommission: commissionCounterReady ? commission.total : 0,
    commissionTimingStatus: commissionCounterReady ? 'verified' : 'needs_owner_review',
    commissionEventTime: now,
    commissionCandidateDayKey: utcDateKey(new Date(now)),
    ...(!commissionCounterReady ? { commissionReviewReason: 'counter-not-ready' } : {}),
    transactionType: 'بيع_طبيعي',
    dataClassification: 'PRODUCTION',
    isTestData: false,
    stockDeductions,
  };
  return { sale, stockDeductions: deductions, stockAfter: new Map(), packageCost, requestHash };
}

function projectOperationalSale(sale) {
  return {
    schemaVersion: 1,
    id: sale.id,
    items: sale.items.map((item) => ({
      id: item.id,
      compositionType: item.compositionType,
      isMix: item.isMix,
      ...(item.mixComponents ? { mixComponents: item.mixComponents.map(({ productId, productName, brand, productType, grams }) => ({
        productId, productName, brand, productType, grams,
      })) } : {}),
      ...(item.customFormulaName ? { customFormulaName: item.customFormulaName } : {}),
      productId: item.productId,
      productName: item.productName,
      productType: item.productType,
      bottleSize: item.bottleSize,
      bottleSizeId: item.bottleSizeId,
      essenceGrams: item.essenceGrams,
      sellingPrice: item.sellingPrice,
      quantity: item.quantity,
      isColoredBottle: item.isColoredBottle,
      isRollOn: item.isRollOn,
    })),
    totalPrice: sale.totalPrice,
    date: sale.date,
    customerName: sale.customerName,
    customerPhone: sale.customerPhone,
    paymentMethod: sale.paymentMethod,
    transactionType: sale.transactionType,
    discount: sale.discount,
    promotionId: sale.promotionId,
    promotionalSavings: sale.promotionalSavings,
    packagingOptionId: sale.packagingOptionId,
    packagingRevenueEgp: sale.packagingRevenueEgp,
    isBasicBagReplacedByLuxury: sale.isBasicBagReplacedByLuxury,
    employeeName: sale.employeeName,
    source: sale.source,
    recordedAt: sale.recordedAt,
    recordedBy: sale.recordedBy,
    isReversed: sale.isReversed === true,
    dataClassification: sale.dataClassification,
    isTestData: sale.isTestData,
  };
}

function projectSaleCosts(sale) {
  return {
    schemaVersion: 1,
    saleId: sale.id,
    items: sale.items.map((item) => ({
      itemId: item.id,
      quantity: item.quantity,
      unitCostEgp: roundMoney(item.cost / item.quantity),
      components: (item.mixComponents || []).map((component) => ({
        productId: component.productId,
        grams: component.grams,
        oilGramCostEgp: component.oilGramCost,
        componentOilCostEgp: component.componentOilCost,
      })),
    })),
    totalCostEgp: sale.totalCost,
    ...(sale.packagingCostEgp === undefined ? {} : { packagingCostEgp: sale.packagingCostEgp }),
  };
}

function projectSaleFinancials(sale) {
  return {
    schemaVersion: 1,
    saleId: sale.id,
    itemProfits: sale.items.map((item) => ({ itemId: item.id, profitEgp: item.profit })),
    totalProfitEgp: sale.totalProfit,
    commissionEgp: sale.commissionAmount,
    profitMarginPercent: sale.totalPrice > 0 ? roundMoney(sale.totalProfit / sale.totalPrice * 100) : 0,
  };
}

function publicResult(role, sale, alreadyCommitted) {
  const base = { ok: true, status: alreadyCommitted ? 'already-committed' : 'committed' };
  if (role === 'OWNER') return { ...base, sale };
  const operational = projectOperationalSale(sale);
  return {
    ...base,
    sale: {
      id: operational.id,
      date: operational.date,
      totalPrice: operational.totalPrice,
      paymentMethod: operational.paymentMethod,
      items: operational.items.map((item) => ({
        id: item.id,
        productId: item.productId,
        productName: item.productName,
        productType: item.productType,
        bottleSize: item.bottleSize,
        quantity: item.quantity,
        sellingPrice: item.sellingPrice,
        isMix: item.isMix,
      })),
      discount: operational.discount,
      ...(operational.promotionId ? { promotionId: operational.promotionId, promotionalSavings: operational.promotionalSavings } : {}),
    },
  };
}

function quoteSummary(sale) {
  return {
    id: sale.id,
    totalPrice: sale.totalPrice,
    discount: sale.discount,
    paymentMethod: sale.paymentMethod,
    ...(sale.promotionId ? { promotionId: sale.promotionId } : {}),
    items: sale.items.map((item) => ({
      id: item.id,
      productId: item.productId,
      productName: item.productName,
      productType: item.productType,
      bottleSize: item.bottleSize,
      quantity: item.quantity,
      sellingPrice: item.sellingPrice,
      isMix: item.isMix,
    })),
  };
}

function separatedSaleInputKeys(intent) {
  const productIds = new Set(intent.lines.flatMap((line) => line.mixComponents
    ? line.mixComponents.map((component) => component.productId) : [line.productId]));
  const bottleIds = new Set(intent.lines.map((line) => line.bottleSizeId));
  return [
    'cost_catalog/store-cost-inputs',
    'financial_admin/store',
    'operational_settings/store',
    ...[...productIds].flatMap((id) => [
      `tarek_products/${id}`,
      `tarek_sale_products/${id}`,
      `product_costs/${id}`,
      `product_operations/${id}`,
    ]),
    ...[...bottleIds].map((id) => `tarek_sale_bottle_sizes/${id}`),
  ];
}

function canonical(value) {
  if (Array.isArray(value)) return value.map(canonical);
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.keys(value).sort().map((key) => [key, canonical(value[key])]));
  }
  return value;
}

async function hashCanonical(value) {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(JSON.stringify(canonical(value))));
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, '0')).join('');
}

function roundBalance(value) {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0) {
    throw new LamsaWorkerError(503, 'sale/invalid-vault-balance');
  }
  return roundMoney(value);
}

export async function handleLamsaSaleQuote(request, env, helpers) {
  const { authenticate, batchGet, fsRequest, firestoreRoot, makeWrite, commitWrites, rollback, decodeFields, json } = helpers;
  const user = await authenticate(request, env);
  const contentLength = Number(request.headers.get('content-length') || 0);
  if (Number.isFinite(contentLength) && contentLength > 256 * 1024) throw new LamsaWorkerError(413, 'sale/request-too-large');
  const text = await request.text();
  if (new TextEncoder().encode(text).byteLength > 256 * 1024) throw new LamsaWorkerError(413, 'sale/request-too-large');
  let body;
  try { body = JSON.parse(text); } catch { throw new LamsaWorkerError(400, 'sale/invalid-json'); }
  let intent;
  try { intent = normalizeLamsaSaleIntent(body).intent; }
  catch (error) { throw new LamsaWorkerError(400, error?.code || 'sale/invalid-intent'); }
  if (intent.schema !== 'lamsa.sale-intent/v3' || !intent.quoteId) {
    throw new LamsaWorkerError(409, 'sale/quote-v3-required');
  }

  const requestHash = await hashCanonical(intent);
  const ownerEmail = String(env.OWNER_EMAIL || '').toLowerCase();
  const role = user.email === ownerEmail ? 'OWNER' : 'SALES_OPERATOR';
  const transactionDate = new Date().toISOString().slice(0, 10);
  const quotePath = `sale_quotes/${intent.quoteId}`;
  const counterPath = commissionCounterPath(transactionDate);
  const keys = [
    `sales/${intent.saleId}`,
    quotePath,
    counterPath,
    `sale_locks/${transactionDate}`,
    'vaults/restock',
    'vaults/commissions',
    ...separatedSaleInputKeys(intent),
    ...(role === 'OWNER' ? [] : [`role_assignments/${user.email}`]),
  ];

  for (let attempt = 0; attempt < 4; attempt += 1) {
    let transactionId;
    try {
      const initial = await batchGet(env, keys);
      transactionId = initial.transactionId;
      const existingSale = initial.docs.get(`sales/${intent.saleId}`);
      if (existingSale) {
        await rollback(env, transactionId);
        transactionId = null;
        throw new LamsaWorkerError(409, existingSale.requestHash === requestHash
          ? 'sale/already-committed' : 'sale/idempotency-conflict');
      }
      const commissionCounter = readOptionalReadyCommissionCounter(initial.docs, transactionDate);
      if (role !== 'OWNER') {
        const grant = initial.docs.get(`role_assignments/${user.email}`);
        if (!grant || grant.email !== user.email || grant.active !== true
            || !['SALES_OPERATOR', 'STORE_MANAGER'].includes(grant.role)) {
          throw new LamsaWorkerError(403, 'role/no-active-sales-grant');
        }
      }
      const existingQuote = initial.docs.get(quotePath);
      if (existingQuote) {
        await rollback(env, transactionId);
        transactionId = null;
        if (existingQuote.requestHash !== requestHash || existingQuote.uid !== user.uid
            || existingQuote.email !== user.email) {
          throw new LamsaWorkerError(409, 'sale/quote-id-conflict');
        }
        if (existingQuote.status !== 'ready' || existingQuote.expiresAt <= Date.now()) {
          throw new LamsaWorkerError(409, 'sale/quote-expired');
        }
        if (existingQuote.commissionCounterReady !== Boolean(commissionCounter)
            || existingQuote.commissionCounterGeneration !== (commissionCounter?.generation ?? null)) {
          throw new LamsaWorkerError(409, 'sale/quote-stale');
        }
        return json({
          ok: true,
          status: 'quoted',
          quoteId: intent.quoteId,
          expiresAt: existingQuote.expiresAt,
          sale: existingQuote.summary,
        });
      }

      const now = new Date().toISOString();
      const { sale, stockDeductions } = buildSale({
        request: intent,
        requestHash,
        user,
        role,
        docs: initial.docs,
        priorSprayBottlesSold: commissionCounter?.sprayBottlesSold ?? Number.MAX_SAFE_INTEGER,
        commissionCounterReady: Boolean(commissionCounter),
        now,
      });
      for (const productId of stockDeductions.keys()) {
        const stockDoc = initial.docs.get(`tarek_products/${productId}`);
        if (!stockDoc) throw new LamsaWorkerError(409, 'sale/stock-projection-missing');
        const stock = requiredNumber(stockDoc, 'stock_grams', { min: 0 });
        if (stock < stockDeductions.get(productId)) throw new LamsaWorkerError(409, 'sale/insufficient-stock');
      }
      const summary = quoteSummary(sale);
      const expiresAt = Date.now() + 120_000;
      const quote = {
        id: intent.quoteId,
        saleId: intent.saleId,
        requestHash,
        snapshotHash: await hashCanonical(summary),
        uid: user.uid,
        email: user.email,
        issuedAt: now,
        expiresAt,
        status: 'ready',
        commissionCounterReady: Boolean(commissionCounter),
        commissionCounterGeneration: commissionCounter?.generation ?? null,
        summary,
      };
      await commitWrites(env, transactionId, [makeWrite(env, quotePath, quote, { exists: false })]);
      transactionId = null;
      return json({ ok: true, status: 'quoted', quoteId: intent.quoteId, expiresAt, sale: summary });
    } catch (error) {
      await rollback(env, transactionId);
      if (error?.retryable && attempt < 3) {
        await new Promise((resolve) => setTimeout(resolve, 10 * (2 ** attempt)));
        continue;
      }
      if (error instanceof LamsaWorkerError) throw error;
      if (error?.status && error?.code) throw new LamsaWorkerError(error.status, error.code);
      throw new LamsaWorkerError(502, 'sale/quote-emulator-transaction-failed');
    }
  }
  throw new LamsaWorkerError(409, 'sale/quote-conflict-retry-exhausted');
}

export async function handleLamsaSale(request, env, helpers) {
  const { authenticate, batchGet, fsRequest, firestoreRoot, docName, makeWrite, commitWrites, rollback, decodeFields, encodeFields, json } = helpers;
  const user = await authenticate(request, env);
  const contentLength = Number(request.headers.get('content-length') || 0);
  if (Number.isFinite(contentLength) && contentLength > 256 * 1024) throw new LamsaWorkerError(413, 'sale/request-too-large');
  const text = await request.text();
  if (new TextEncoder().encode(text).byteLength > 256 * 1024) throw new LamsaWorkerError(413, 'sale/request-too-large');
  let body;
  try { body = JSON.parse(text); } catch { throw new LamsaWorkerError(400, 'sale/invalid-json'); }
  let intent;
  try { intent = normalizeLamsaSaleIntent(body).intent; }
  catch (error) { throw new LamsaWorkerError(400, error?.code || 'sale/invalid-intent'); }
  if (intent.schema === 'lamsa.sale-intent/v3' && !intent.quoteId) {
    throw new LamsaWorkerError(409, 'sale/quote-required');
  }

  const canonical = (value) => Array.isArray(value) ? value.map(canonical)
    : value && typeof value === 'object' ? Object.fromEntries(Object.keys(value).sort().map((key) => [key, canonical(value[key])])) : value;
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(JSON.stringify(canonical(intent))));
  const requestHash = [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, '0')).join('');
  const ownerEmail = String(env.OWNER_EMAIL || '').toLowerCase();
  const role = user.email === ownerEmail ? 'OWNER' : 'SALES_OPERATOR';
  const transactionDate = new Date().toISOString().slice(0, 10);
  const dailyLockPath = `sale_locks/${transactionDate}`;
  const counterPath = commissionCounterPath(transactionDate);
  const quotePath = intent.quoteId ? `sale_quotes/${intent.quoteId}` : null;
  const keys = [
    `sales/${intent.saleId}`,
    dailyLockPath,
    counterPath,
    'vaults/restock',
    'vaults/commissions',
    ...(quotePath ? [quotePath] : []),
    ...separatedSaleInputKeys(intent),
    ...(role === 'OWNER' ? [] : [`role_assignments/${user.email}`]),
  ];

  for (let attempt = 0; attempt < 4; attempt += 1) {
    let transactionId;
    try {
      const initial = await batchGet(env, keys);
      transactionId = initial.transactionId;
      const existing = initial.docs.get(`sales/${intent.saleId}`);
      if (existing) {
        await rollback(env, transactionId);
        transactionId = null;
        if (existing.requestHash !== requestHash) throw new LamsaWorkerError(409, 'sale/idempotency-conflict');
        return json(publicResult(role, existing, true));
      }
      const commissionCounter = readOptionalReadyCommissionCounter(initial.docs, transactionDate);
      if (role !== 'OWNER') {
        const grant = initial.docs.get(`role_assignments/${user.email}`);
        if (!grant || grant.email !== user.email || grant.active !== true || !['SALES_OPERATOR', 'STORE_MANAGER'].includes(grant.role)) {
          throw new LamsaWorkerError(403, 'role/no-active-sales-grant');
        }
        if (intent.schema !== 'lamsa.sale-intent/v3') {
          throw new LamsaWorkerError(403, 'sale/operator-v3-required');
        }
      }
      const quote = quotePath ? initial.docs.get(quotePath) : null;
      if (intent.schema === 'lamsa.sale-intent/v3') {
        if (!quote || quote.requestHash !== requestHash || quote.saleId !== intent.saleId
            || quote.uid !== user.uid || quote.email !== user.email || quote.status !== 'ready') {
          throw new LamsaWorkerError(409, 'sale/quote-missing-or-mismatch');
        }
        if (typeof quote.expiresAt !== 'number' || quote.expiresAt <= Date.now()) {
          throw new LamsaWorkerError(409, 'sale/quote-expired');
        }
        if (quote.commissionCounterReady !== Boolean(commissionCounter)
            || quote.commissionCounterGeneration !== (commissionCounter?.generation ?? null)) {
          throw new LamsaWorkerError(409, 'sale/quote-stale');
        }
      }
      const docs = initial.docs;
      const now = new Date().toISOString();
      const { sale, stockDeductions } = buildSale({
        request: intent, requestHash, user, role, docs,
        priorSprayBottlesSold: commissionCounter?.sprayBottlesSold ?? Number.MAX_SAFE_INTEGER,
        commissionCounterReady: Boolean(commissionCounter),
        now,
      });
      if (quote && quote.snapshotHash !== await hashCanonical(quoteSummary(sale))) {
        throw new LamsaWorkerError(409, 'sale/quote-stale');
      }
      const stockAfter = new Map();
      for (const productId of stockDeductions.keys()) {
        const stockDoc = docs.get(`tarek_products/${productId}`);
        if (!stockDoc) throw new LamsaWorkerError(409, 'sale/stock-projection-missing');
        const stock = requiredNumber(stockDoc, 'stock_grams', { min: 0 });
        const deduction = stockDeductions.get(productId);
        if (stock < deduction) throw new LamsaWorkerError(409, 'sale/insufficient-stock');
        stockAfter.set(productId, roundMoney(stock - deduction));
      }

      const deltas = {
        restock: sale.totalCost,
        commissions: sale.commissionAmount,
      };
      const vaultWrites = [];
      for (const [vaultId, delta] of Object.entries(deltas)) {
        if (delta === 0) continue;
        const vault = docs.get(`vaults/${vaultId}`);
        if (!vault) throw new LamsaWorkerError(503, `sale/vault-missing-${vaultId}`);
        const currentBalance = roundBalance(vault.currentBalance);
        const totalInflow = roundBalance(vault.totalInflow ?? 0);
        vaultWrites.push(makeWrite(env, `vaults/${vaultId}`, {
          currentBalance: roundMoney(currentBalance + delta),
          totalInflow: roundMoney(totalInflow + delta),
          updatedAt: now,
        }, { mask: ['currentBalance', 'totalInflow', 'updatedAt'] }));
      }

      let nextCounter;
      if (commissionCounter) {
        let saleSprayCount;
        try { saleSprayCount = countSaleSprays(sale); }
        catch { throw new LamsaWorkerError(503, 'sale/commission-counter-sale-ambiguous'); }
        nextCounter = nextCommissionCounter(commissionCounter, {
          dateKey: transactionDate,
          saleId: sale.id,
          sprayCount: saleSprayCount,
          action: 'sale',
          now,
        });
        sale.commissionDayKey = transactionDate;
        sale.commissionSprayBottleCount = saleSprayCount;
        sale.commissionCounterGeneration = nextCounter.generation;
        sale.commissionCounterAction = 'sale';
      } else {
        sale.commissionTimingStatus = 'needs_owner_review';
        sale.commissionReviewReason = 'counter-not-ready';
        sale.commissionCandidateDayKey = transactionDate;
      }
      sale.serverAcceptedAt = now;

      const writes = [
        makeWrite(env, `sales/${intent.saleId}`, sale, { exists: false }),
        ...(nextCounter ? [makeWrite(env, counterPath, nextCounter, {
          mask: ['sprayBottlesSold', 'generation', 'lastAppliedSaleId', 'lastAppliedAction', 'updatedAt'],
          exists: true,
        })] : []),
        makeWrite(env, dailyLockPath, {
          generation: (Number(docs.get(dailyLockPath)?.generation) || 0) + 1,
          updatedAt: now,
        }, { mask: ['generation', 'updatedAt'], exists: Boolean(docs.get(dailyLockPath)) }),
        makeWrite(env, `sale_operations/${intent.saleId}`, projectOperationalSale(sale), { exists: false }),
        makeWrite(env, `sale_costs/${intent.saleId}`, projectSaleCosts(sale), { exists: false }),
        ...(commissionCounter ? [makeWrite(env, `sale_financials/${intent.saleId}`, projectSaleFinancials(sale), { exists: false })] : []),
        ...[...stockAfter].flatMap(([id, stock_grams]) => [
          makeWrite(env, `tarek_products/${id}`, { stock_grams, updatedAt: now }, { mask: ['stock_grams', 'updatedAt'], exists: true }),
          ...(docs.has(`product_operations/${id}`)
            ? [makeWrite(env, `product_operations/${id}`, { stock_grams, updatedAt: now }, { mask: ['stock_grams', 'updatedAt'], exists: true })]
            : []),
        ]),
        ...vaultWrites,
        ...(quotePath ? [makeWrite(env, quotePath, { status: 'committed', committedAt: now }, {
          mask: ['status', 'committedAt'],
          exists: true,
        })] : []),
      ];
      if (writes.length > 500) throw new LamsaWorkerError(400, 'sale/transaction-write-limit');
      await commitWrites(env, transactionId, writes);
      transactionId = null;
      return json(publicResult(role, sale, false));
    } catch (error) {
      await rollback(env, transactionId);
      if (error?.retryable && attempt < 3) {
        await new Promise((resolve) => setTimeout(resolve, 10 * (2 ** attempt)));
        continue;
      }
      if (error instanceof LamsaWorkerError) throw error;
      if (error?.status && error?.code) throw new LamsaWorkerError(error.status, error.code);
      throw new LamsaWorkerError(502, 'sale/emulator-transaction-failed');
    }
  }
  throw new LamsaWorkerError(409, 'sale/retry-exhausted');
}

/**
 * Owner-only immutable reversal for a sale created by this Lamsa Worker.
 * The sale is retained for audit; stock projections and the two sale-funded
 * vault balances are corrected in the same Firestore transaction. If a vault
 * has already spent the funds, the reversal fails closed for manual review.
 */
export async function handleLamsaSaleReversal(request, saleId, env, helpers) {
  const { authenticate, batchGet, makeWrite, commitWrites, rollback, json } = helpers;
  const user = await authenticate(request, env);
  const ownerEmail = String(env.OWNER_EMAIL || '').trim().toLowerCase();
  if (!ownerEmail || user.email !== ownerEmail) throw new LamsaWorkerError(403, 'role/owner-required');
  if (!/^[A-Za-z0-9_-]{4,120}$/.test(saleId)) throw new LamsaWorkerError(400, 'sale/invalid-id');

  const contentLength = Number(request.headers.get('content-length') || 0);
  if (Number.isFinite(contentLength) && contentLength > 8 * 1024) throw new LamsaWorkerError(413, 'sale/reversal-request-too-large');
  const rawBody = await request.text();
  if (new TextEncoder().encode(rawBody).byteLength > 8 * 1024) throw new LamsaWorkerError(413, 'sale/reversal-request-too-large');
  let body;
  try { body = JSON.parse(rawBody); } catch { throw new LamsaWorkerError(400, 'sale/invalid-reversal-json'); }
  if (!body || typeof body !== 'object' || Array.isArray(body)
      || Object.keys(body).some((key) => !['reason', 'restoreInventory'].includes(key))) {
    throw new LamsaWorkerError(400, 'sale/invalid-reversal-request');
  }
  const reason = typeof body.reason === 'string' ? body.reason.trim() : '';
  if (!reason || reason.length > 500) throw new LamsaWorkerError(400, 'sale/reversal-reason-required');
  const restoreInventory = body.restoreInventory ?? true;
  if (typeof restoreInventory !== 'boolean') throw new LamsaWorkerError(400, 'sale/invalid-restore-inventory');

  const saleKey = `sales/${saleId}`;
  const operationKey = `sale_operations/${saleId}`;
  const costsKey = `sale_costs/${saleId}`;
  const financialsKey = `sale_financials/${saleId}`;
  const baseKeys = [saleKey, operationKey, costsKey, financialsKey, 'vaults/restock', 'vaults/commissions'];

  for (let attempt = 0; attempt < 4; attempt += 1) {
    let transactionId;
    try {
      const initial = await batchGet(env, baseKeys);
      transactionId = initial.transactionId;
      const sale = initial.docs.get(saleKey);
      if (!sale) throw new LamsaWorkerError(404, 'sale/not-found');
      if (sale.isReversed === true) {
        await rollback(env, transactionId);
        transactionId = null;
        return json({ ok: true, status: 'already-reversed', sale: { id: saleId, isReversed: true } });
      }
      if (sale.transactionType !== 'بيع_طبيعي'
          || typeof sale.requestHash !== 'string' || !/^[a-f0-9]{64}$/.test(sale.requestHash)
          || !sale.stockDeductions || typeof sale.stockDeductions !== 'object' || Array.isArray(sale.stockDeductions)
          || !initial.docs.get(operationKey) || !initial.docs.get(costsKey)
          || (sale.commissionTimingStatus !== 'needs_owner_review' && !initial.docs.get(financialsKey))) {
        throw new LamsaWorkerError(409, 'sale/unsupported-reversal-record');
      }
      if ((sale.loyaltyPointsRedeemed || 0) > 0
          || (sale.loyaltyDiscountAmount || 0) > 0 || (sale.loyaltyPointsEarned || 0) > 0
          || sale.savedMixIds) {
        throw new LamsaWorkerError(409, 'sale/reversal-side-effects-not-supported');
      }

      const timingReview = sale.commissionTimingStatus === 'needs_owner_review';
      const dateKey = sale.commissionDayKey || sale.commissionCandidateDayKey
        || (typeof sale.date === 'string' ? sale.date.slice(0, 10) : '');
      if (!isValidDateKey(dateKey) || (typeof sale.date !== 'string' || sale.date.slice(0, 10) !== dateKey)) {
        throw new LamsaWorkerError(503, 'sale/commission-counter-sale-date-ambiguous');
      }
      let nextCounter;
      let counterPath;
      let saleSprayCount = 0;
      if (!timingReview) {
        try { saleSprayCount = countSaleSprays(sale); }
        catch { throw new LamsaWorkerError(503, 'sale/commission-counter-sale-ambiguous'); }
        if (sale.commissionSprayBottleCount !== undefined && sale.commissionSprayBottleCount !== saleSprayCount) {
          throw new LamsaWorkerError(503, 'sale/commission-counter-sale-count-mismatch');
        }
        counterPath = commissionCounterPath(dateKey);
        const counterRead = await batchGet(env, [counterPath], transactionId);
        transactionId = counterRead.transactionId;
        const counter = readReadyCommissionCounter(counterRead.docs, dateKey);
        try {
          nextCounter = nextCommissionCounter(counter, {
            dateKey, saleId, sprayCount: saleSprayCount, action: 'reversal', now: new Date().toISOString(),
          });
        } catch {
          throw new LamsaWorkerError(503, 'sale/commission-counter-reversal-underflow');
        }
      }

      const deductions = Object.entries(sale.stockDeductions);
      if (deductions.length > MAX_STOCK_DOCS) throw new LamsaWorkerError(409, 'sale/reversal-too-many-stock-documents');
      if (deductions.some(([id, grams]) => !safeId(id)
          || typeof grams !== 'number' || !Number.isFinite(grams) || grams <= 0)) {
        throw new LamsaWorkerError(409, 'sale/invalid-stock-deductions');
      }
      const totalCost = requiredNumber(sale, 'totalCost', { min: 0 });
      const commission = requiredNumber(sale, 'commissionAmount', { min: 0, fallback: sale.totalCommission });
      const stockKeys = restoreInventory
        ? deductions.flatMap(([id]) => [`tarek_products/${id}`, `product_operations/${id}`])
        : [];
      const stockRead = stockKeys.length ? await batchGet(env, stockKeys, transactionId) : { docs: new Map(), transactionId };
      transactionId = stockRead.transactionId;

      const now = new Date().toISOString();
      if (nextCounter) nextCounter.updatedAt = now;
      const stockWrites = [];
      if (restoreInventory) {
        for (const [id, grams] of deductions) {
          const projection = stockRead.docs.get(`tarek_products/${id}`);
          if (!projection) throw new LamsaWorkerError(409, 'sale/reversal-stock-document-missing');
          const sourceStock = requiredNumber(projection, 'stock_grams', { min: 0 });
          const nextStock = roundMoney(sourceStock + grams);
          stockWrites.push(makeWrite(env, `tarek_products/${id}`, { stock_grams: nextStock, updatedAt: now }, {
            mask: ['stock_grams', 'updatedAt'], exists: true,
          }));
          if (stockRead.docs.has(`product_operations/${id}`)) {
            stockWrites.push(makeWrite(env, `product_operations/${id}`, { stock_grams: nextStock, updatedAt: now }, {
              mask: ['stock_grams', 'updatedAt'], exists: true,
            }));
          }
        }
      }

      const vaultWrites = [];
      for (const [vaultId, amount] of [['restock', totalCost], ['commissions', commission]]) {
        if (amount === 0) continue;
        const vault = initial.docs.get(`vaults/${vaultId}`);
        if (!vault) throw new LamsaWorkerError(503, `sale/reversal-vault-missing-${vaultId}`);
        const currentBalance = requiredNumber(vault, 'currentBalance', { min: 0 });
        const priorReversed = optionalNumber(vault, 'reversedInflowEgp', 0);
        if (amount > currentBalance + 0.009) {
          throw new LamsaWorkerError(409, `sale/reversal-vault-insufficient-balance-${vaultId}`);
        }
        vaultWrites.push(makeWrite(env, `vaults/${vaultId}`, {
          currentBalance: roundMoney(currentBalance - amount),
          reversedInflowEgp: roundMoney(priorReversed + amount),
          updatedAt: now,
        }, { mask: ['currentBalance', 'reversedInflowEgp', 'updatedAt'], exists: true }));
      }

      const auditEntry = {
        action: 'عكس فاتورة',
        performedBy: user.email,
        timestamp: now,
        details: `${reason} | إعادة المخزون: ${restoreInventory ? 'نعم' : 'لا'}`,
      };
      const counterFields = nextCounter ? {
        commissionDayKey: dateKey,
        commissionSprayBottleCount: saleSprayCount,
        commissionCounterGeneration: nextCounter.generation,
        commissionCounterAction: 'reversal',
      } : {};
      const counterMask = nextCounter
        ? ['commissionDayKey', 'commissionSprayBottleCount', 'commissionCounterGeneration', 'commissionCounterAction']
        : [];
      const writes = [
        makeWrite(env, saleKey, {
          isReversed: true, reversalReason: reason, reversedBy: user.email, reversedAt: now,
          inventoryRestored: restoreInventory,
          ...counterFields,
          auditTrail: [...(Array.isArray(sale.auditTrail) ? sale.auditTrail : []), auditEntry],
        }, { mask: ['isReversed', 'reversalReason', 'reversedBy', 'reversedAt', 'inventoryRestored',
          ...counterMask, 'auditTrail'], exists: true }),
        makeWrite(env, operationKey, {
          isReversed: true, reversalReason: reason, reversedBy: user.email, reversedAt: now,
          inventoryRestored: restoreInventory,
        }, { mask: ['isReversed', 'reversalReason', 'reversedBy', 'reversedAt', 'inventoryRestored'], exists: true }),
        makeWrite(env, costsKey, { isReversed: true, reversedAt: now }, { mask: ['isReversed', 'reversedAt'], exists: true }),
        ...(initial.docs.get(financialsKey)
          ? [makeWrite(env, financialsKey, { isReversed: true, reversedAt: now }, { mask: ['isReversed', 'reversedAt'], exists: true })]
          : []),
        ...(nextCounter && counterPath ? [makeWrite(env, counterPath, nextCounter, {
          mask: ['sprayBottlesSold', 'generation', 'lastAppliedSaleId', 'lastAppliedAction', 'updatedAt'],
          exists: true,
        })] : []),
        ...stockWrites,
        ...vaultWrites,
      ];
      if (writes.length > 500) throw new LamsaWorkerError(400, 'sale/transaction-write-limit');
      await commitWrites(env, transactionId, writes);
      transactionId = null;
      return json({ ok: true, status: 'reversed', sale: {
        id: saleId, isReversed: true, reversalReason: reason, reversedAt: now, inventoryRestored: restoreInventory,
      } });
    } catch (error) {
      await rollback(env, transactionId);
      if (error?.retryable && attempt < 3) {
        await new Promise((resolve) => setTimeout(resolve, 10 * (2 ** attempt)));
        continue;
      }
      if (error instanceof LamsaWorkerError) throw error;
      if (error?.status && error?.code) throw new LamsaWorkerError(error.status, error.code);
      throw new LamsaWorkerError(502, 'sale/reversal-emulator-transaction-failed');
    }
  }
  throw new LamsaWorkerError(409, 'sale/reversal-retry-exhausted');
}

export function lamsaSaleErrorResponse(error, json) {
  const status = error instanceof LamsaWorkerError ? error.status : 502;
  const code = error instanceof LamsaWorkerError ? error.code : 'sale/unexpected-error';
  return json({ ok: false, error: code }, status);
}
