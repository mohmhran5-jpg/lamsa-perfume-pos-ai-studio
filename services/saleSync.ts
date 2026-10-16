import { doc, runTransaction, type DocumentData, type DocumentSnapshot, type Firestore, type Transaction } from 'firebase/firestore';
import type { Sale } from '../types';
import {
  projectOperationalSale,
  projectSaleCosts,
  projectSaleFinancials,
  SEPARATED_COLLECTIONS,
} from './separatedDataModel.ts';

const MAX_SALE_ITEMS = 100;
const MAX_STOCK_DOCUMENTS = 400;
const MAX_TRANSACTION_WRITES = 500;
const COMMISSION_COUNTER_COLLECTION = 'commission_day_counters';

function commissionDayKeyForSale(sale: Sale): string {
  const dayKey = sale.commissionDayKey ?? sale.date?.slice(0, 10);
  if (!dayKey || !/^\d{4}-\d{2}-\d{2}$/.test(dayKey)
      || !Number.isFinite(Date.parse(`${dayKey}T00:00:00.000Z`))
      || new Date(`${dayKey}T00:00:00.000Z`).toISOString().slice(0, 10) !== dayKey
      || typeof sale.date !== 'string' || sale.date.slice(0, 10) !== dayKey) {
    throw new Error('sale-sync/commission-counter-ambiguous-date');
  }
  return dayKey;
}

function countCommissionableSprayBottles(sale: Sale): number {
  if (sale.isTestData === true || sale.dataClassification === 'TEST' || sale.dataClassification === 'DOC_EXAMPLE'
      || /^(?:TEST-|DOC-EXAMPLE)|-TEST-/i.test(String(sale.id))) return 0;
  const testText = `${sale.notes ?? ''} ${sale.customerName ?? ''}`;
  if (testText.includes('TEST / بيانات اختبار') || testText.includes('[TEST-DATA]')
      || testText.includes('بيانات اختبار تلقائية')) return 0;
  if (sale.isReversed === true || (sale.transactionType !== undefined && sale.transactionType !== 'بيع_طبيعي')) return 0;
  if (!Array.isArray(sale.items) || sale.items.length === 0) throw new Error('sale-sync/commission-counter-ambiguous-items');
  let count = 0;
  for (const item of sale.items) {
    const quantity = item.quantity ?? 1;
    if (!Number.isSafeInteger(quantity) || quantity < 1) throw new Error('sale-sync/commission-counter-ambiguous-quantity');
    if (item.isRollOn !== undefined && typeof item.isRollOn !== 'boolean') {
      throw new Error('sale-sync/commission-counter-ambiguous-roll-on');
    }
    if (item.isRollOn === true || [2, 3, 5].includes(item.bottleSize)) continue;
    if (item.isRollOn === undefined && (typeof item.bottleSize !== 'number' || !Number.isFinite(item.bottleSize) || item.bottleSize <= 0)) {
      throw new Error('sale-sync/commission-counter-ambiguous-bottle-size');
    }
    count += quantity;
    if (!Number.isSafeInteger(count)) throw new Error('sale-sync/commission-counter-count-overflow');
  }
  return count;
}

function readyCommissionCounter(snapshot: DocumentSnapshot<DocumentData>, dayKey: string): DocumentData {
  if (!snapshot.exists()) throw new Error('sale-sync/commission-counter-not-ready');
  const counter = snapshot.data();
  if (counter.schemaVersion !== 1 || counter.status !== 'ready' || counter.dateKey !== dayKey
      || !Number.isSafeInteger(counter.sprayBottlesSold) || counter.sprayBottlesSold < 0
      || !Number.isSafeInteger(counter.generation) || counter.generation < 0) {
    throw new Error('sale-sync/commission-counter-not-ready');
  }
  return counter;
}

function cleanForFirestore<T>(value: T): T {
  if (Array.isArray(value)) return value.map((entry) => cleanForFirestore(entry)) as T;
  if (value && typeof value === 'object') {
    const cleaned: Record<string, unknown> = {};
    for (const [key, entry] of Object.entries(value)) {
      if (entry !== undefined) cleaned[key] = cleanForFirestore(entry);
    }
    return cleaned as T;
  }
  return value;
}

function validateProductId(productId: unknown): string {
  const id = String(productId ?? '').trim();
  if (!id || id.includes('/')) throw new Error('sale-sync/invalid-product-id');
  return id;
}

/**
 * POS stores single-product essenceGrams as the total for the line after
 * multiplying by quantity. Mix component grams remain per bottle and therefore
 * are multiplied here. Keep this distinction to avoid double deductions.
 */
export function getSaleStockDeductions(sale: Pick<Sale, 'items'>): Map<string, number> {
  if (!Array.isArray(sale.items) || sale.items.length === 0 || sale.items.length > MAX_SALE_ITEMS) {
    throw new Error('sale-sync/invalid-sale-items');
  }

  const deductions = new Map<string, number>();
  const add = (productId: unknown, grams: unknown) => {
    const id = validateProductId(productId);
    if (typeof grams !== 'number' || !Number.isFinite(grams) || grams <= 0) {
      throw new Error('sale-sync/invalid-stock-deduction');
    }
    deductions.set(id, (deductions.get(id) ?? 0) + grams);
    if (deductions.size > MAX_STOCK_DOCUMENTS) throw new Error('sale-sync/too-many-stock-items');
  };

  for (const item of sale.items) {
    const quantity = item.quantity ?? 1;
    if (!Number.isSafeInteger(quantity) || quantity < 1 || quantity > 100) {
      throw new Error('sale-sync/invalid-quantity');
    }
    if (item.isMix) {
      if (!Array.isArray(item.mixComponents) || item.mixComponents.length === 0 || item.mixComponents.length > 20) {
        throw new Error('sale-sync/invalid-mix-components');
      }
      for (const component of item.mixComponents) {
        add(component.productId, component.grams * quantity);
      }
    } else {
      // SaleItem.essenceGrams is already the aggregate grams for this line.
      add(item.productId, item.essenceGrams);
    }
  }
  return deductions;
}

function validateSalePayload(sale: Sale): Map<string, number> {
  const saleId = String(sale?.id ?? '').trim();
  if (!saleId || saleId.includes('/')) throw new Error('sale-sync/invalid-sale-id');
  if (typeof sale.date !== 'string' || !sale.date.trim()) throw new Error('sale-sync/invalid-sale-date');
  if (typeof sale.totalPrice !== 'number' || !Number.isFinite(sale.totalPrice) || sale.totalPrice < 0) {
    throw new Error('sale-sync/invalid-total-price');
  }
  if (sale.totalPrice === 0 && !['هدية', 'تعويض', 'تصفية', 'إتلاف', 'عينات_مجانية'].includes(String(sale.transactionType ?? ''))) {
    throw new Error('sale-sync/invalid-zero-price');
  }
  if (sale.totalCost !== undefined && (typeof sale.totalCost !== 'number' || !Number.isFinite(sale.totalCost) || sale.totalCost < 0)) {
    throw new Error('sale-sync/invalid-total-cost');
  }
  if (sale.totalProfit !== undefined && (typeof sale.totalProfit !== 'number' || !Number.isFinite(sale.totalProfit))) {
    throw new Error('sale-sync/invalid-total-profit');
  }

  for (const item of sale.items ?? []) {
    if (typeof item.bottleSize !== 'number' || !Number.isFinite(item.bottleSize) || item.bottleSize <= 0) {
      throw new Error('sale-sync/invalid-bottle-size');
    }
    if (item.sellingPrice !== undefined && (typeof item.sellingPrice !== 'number' || !Number.isFinite(item.sellingPrice) || item.sellingPrice < 0)) {
      throw new Error('sale-sync/invalid-item-price');
    }
    if (item.cost !== undefined && (typeof item.cost !== 'number' || !Number.isFinite(item.cost) || item.cost < 0)) {
      throw new Error('sale-sync/invalid-item-cost');
    }
    if (item.profit !== undefined && (typeof item.profit !== 'number' || !Number.isFinite(item.profit))) {
      throw new Error('sale-sync/invalid-item-profit');
    }
  }
  return getSaleStockDeductions(sale);
}

function effectiveDeductions(sale: Sale): Map<string, number> {
  return sale.isReversed ? new Map() : getSaleStockDeductions(sale);
}

function calculateStockDeltas(before: Map<string, number>, after: Map<string, number>): Map<string, number> {
  const deltas = new Map<string, number>();
  for (const id of new Set([...before.keys(), ...after.keys()])) {
    const delta = (after.get(id) ?? 0) - (before.get(id) ?? 0);
    if (delta !== 0) deltas.set(id, delta);
  }
  return deltas;
}

async function readStockSnapshots(
  transaction: Transaction,
  productRefs: Map<string, ReturnType<typeof doc>>,
): Promise<Map<string, DocumentSnapshot<DocumentData>>> {
  const entries = [...productRefs.entries()];
  const snapshots = await Promise.all(entries.map(([, productRef]) => transaction.get(productRef)));
  return new Map(entries.map(([id], index) => [id, snapshots[index]]));
}

function validateNextStocks(
  snapshots: Map<string, DocumentSnapshot<DocumentData>>,
  deltas: Map<string, number>,
): Map<string, number> {
  const nextStocks = new Map<string, number>();
  for (const [id, snapshot] of snapshots) {
    if (!snapshot.exists()) throw new Error(`sale-sync/missing-product:${id}`);
    const stock = snapshot.data().stock_grams;
    if (typeof stock !== 'number' || !Number.isFinite(stock) || stock < 0) {
      throw new Error(`sale-sync/invalid-product-stock:${id}`);
    }
    const nextStock = stock - (deltas.get(id) ?? 0);
    if (nextStock < 0) throw new Error(`sale-sync/insufficient-stock:${id}`);
    nextStocks.set(id, nextStock);
  }
  return nextStocks;
}

/**
 * `tarek_products` is the shared canonical stock projection. One stock document
 * per ingredient keeps 400-component sales under Firestore's 500-write limit;
 * owner clients overlay this stock onto their private legacy product records.
 */
function writeSynchronizedProductStock(
  transaction: Transaction,
  productRefs: Map<string, ReturnType<typeof doc>>,
  snapshots: Map<string, DocumentSnapshot<DocumentData>>,
  nextStocks: Map<string, number>,
): void {
  const updatedAt = new Date().toISOString();
  for (const [id, productRef] of productRefs) {
    const snapshot = snapshots.get(id);
    if (!snapshot?.exists()) throw new Error(`sale-sync/missing-stock-projection:${id}`);
    const nextStock = nextStocks.get(id);
    if (nextStock === undefined) throw new Error(`sale-sync/missing-next-stock:${id}`);
    transaction.set(productRef, { stock_grams: nextStock, updatedAt }, { merge: true });
  }
}

/** Keep a split operational stock projection current when the owner has seeded it. */
function writeOptionalOperationalStock(
  transaction: Transaction,
  refs: Map<string, ReturnType<typeof doc>>,
  snapshots: Map<string, DocumentSnapshot<DocumentData>>,
  nextStocks: Map<string, number>,
): void {
  const updatedAt = new Date().toISOString();
  for (const [id, ref] of refs) {
    if (!snapshots.get(id)?.exists()) continue;
    const nextStock = nextStocks.get(id);
    if (nextStock === undefined) continue;
    transaction.set(ref, { stock_grams: nextStock, updatedAt }, { merge: true });
  }
}

function canonicalComparable(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonicalComparable);
  if (value && typeof value === 'object') {
    const source = value as Record<string, unknown>;
    return Object.fromEntries(
      Object.keys(source)
        .filter((key) => source[key] !== undefined)
        .sort()
        .map((key) => [key, canonicalComparable(source[key])]),
    );
  }
  return value;
}

function withoutCommissionCounterFields(sale: Sale): Record<string, unknown> {
  const {
    commissionDayKey: _dayKey,
    commissionSprayBottleCount: _sprayCount,
    commissionCounterGeneration: _generation,
    commissionCounterAction: _action,
    ...businessFields
  } = sale;
  return businessFields;
}

function sameCommittedSale(existing: Sale, incoming: Sale): boolean {
  return sameCanonicalRecord(
    withoutCommissionCounterFields(existing),
    cleanForFirestore(withoutCommissionCounterFields(incoming)),
  );
}

function sameCanonicalRecord(existing: unknown, expected: unknown): boolean {
  return JSON.stringify(canonicalComparable(existing)) === JSON.stringify(canonicalComparable(expected));
}

function hasCompleteSaleCostProjection(sale: Sale): boolean {
  return Number.isFinite(sale.totalCost)
    && sale.items.every((item) => Number.isFinite(item.cost)
      && (item.mixComponents ?? []).every((component) => Number.isFinite(component.grams)
        && Number.isFinite(component.oilGramCost)
        && Number.isFinite(component.componentOilCost)));
}

function hasCompleteSaleFinancialProjection(sale: Sale): boolean {
  return Number.isFinite(sale.totalProfit) && sale.items.every((item) => Number.isFinite(item.profit));
}

function saleProjectionWriteCount(sale: Sale): number {
  return 1 + Number(hasCompleteSaleCostProjection(sale)) + Number(hasCompleteSaleFinancialProjection(sale));
}

function writeOwnerSaleProjections(transaction: Transaction, db: Firestore, sale: Sale): void {
  transaction.set(
    doc(db, SEPARATED_COLLECTIONS.saleOperations, sale.id),
    cleanForFirestore(projectOperationalSale(sale)),
  );
  if (hasCompleteSaleCostProjection(sale)) {
    transaction.set(
      doc(db, SEPARATED_COLLECTIONS.saleCosts, sale.id),
      cleanForFirestore(projectSaleCosts(sale)),
    );
  }
  if (hasCompleteSaleFinancialProjection(sale)) {
    transaction.set(
      doc(db, SEPARATED_COLLECTIONS.saleFinancials, sale.id),
      cleanForFirestore(projectSaleFinancials(sale)),
    );
  }
}

function assertTransactionWriteBudget(
  baseWrites: number,
  canonicalStockWrites: number,
  optionalOperationalStock: Map<string, DocumentSnapshot<DocumentData>>,
  additionalWrites = 0,
): void {
  const optionalStockWrites = [...optionalOperationalStock.values()].filter((snapshot) => snapshot.exists()).length;
  if (baseWrites + canonicalStockWrites + optionalStockWrites + additionalWrites > MAX_TRANSACTION_WRITES) {
    throw new Error('sale-sync/transaction-write-limit');
  }
}

/**
 * Atomically records a legacy-schema sale and its stock deductions. A Firestore
 * transaction (rather than a blind writeBatch) serializes competing terminals,
 * so two sales cannot both consume the same remaining grams.
 */
export async function commitSaleAndInventory(db: Firestore, sale: Sale): Promise<'committed' | 'already-committed'> {
  const deductions = validateSalePayload(sale);
  const saleRef = doc(db, 'sales', sale.id);
  const saleOperationRef = doc(db, SEPARATED_COLLECTIONS.saleOperations, sale.id);
  const productRefs = new Map([...deductions.keys()].map((id) => [id, doc(db, 'tarek_products', id)] as const));
  const operationRefs = new Map([...deductions.keys()].map((id) => [id, doc(db, 'product_operations', id)] as const));

  return runTransaction(db, async (transaction) => {
    const existingSale = await transaction.get(saleRef);
    const existingOperationalSale = await transaction.get(saleOperationRef);
    if (existingSale.exists()) {
      const storedSale = existingSale.data() as Sale;
      if (!sameCommittedSale(storedSale, sale)) throw new Error('sale-sync/idempotency-conflict');
      if (existingOperationalSale.exists()
        && !sameCanonicalRecord(existingOperationalSale.data(), cleanForFirestore(projectOperationalSale(storedSale)))) {
        throw new Error('sale-sync/operational-sale-id-conflict');
      }
      assertTransactionWriteBudget(saleProjectionWriteCount(storedSale), 0, new Map());
      writeOwnerSaleProjections(transaction, db, storedSale);
      return 'already-committed';
    }
    if (existingOperationalSale.exists()) throw new Error('sale-sync/operational-sale-id-conflict');

    const dayKey = commissionDayKeyForSale(sale);
    const sprayBottleCount = countCommissionableSprayBottles(sale);
    const counterRef = doc(db, COMMISSION_COUNTER_COLLECTION, dayKey);
    const counterSnapshot = await transaction.get(counterRef);
    const counter = readyCommissionCounter(counterSnapshot, dayKey);
    if (sale.commissionDayKey !== dayKey
        || sale.commissionCounterGeneration !== counter.generation
        || sale.commissionSprayBottleCount !== sprayBottleCount) {
      throw new Error('sale-sync/commission-counter-stale');
    }
    const nextSprayBottlesSold = counter.sprayBottlesSold + sprayBottleCount;
    const nextGeneration = counter.generation + 1;
    if (!Number.isSafeInteger(nextSprayBottlesSold) || !Number.isSafeInteger(nextGeneration)) {
      throw new Error('sale-sync/commission-counter-overflow');
    }
    const committedAt = new Date().toISOString();
    const committedSale: Sale = {
      ...sale,
      commissionDayKey: dayKey,
      commissionSprayBottleCount: sprayBottleCount,
      commissionCounterGeneration: nextGeneration,
      commissionCounterAction: 'sale',
    };

    const snapshots = await readStockSnapshots(transaction, productRefs);
    const operationSnapshots = await readStockSnapshots(transaction, operationRefs);
    const nextStocks = validateNextStocks(snapshots, deductions);
    assertTransactionWriteBudget(2 + saleProjectionWriteCount(committedSale), productRefs.size, operationSnapshots);

    transaction.set(saleRef, cleanForFirestore(committedSale));
    transaction.set(counterRef, {
      sprayBottlesSold: nextSprayBottlesSold,
      generation: nextGeneration,
      lastAppliedSaleId: sale.id,
      lastAppliedAction: 'sale',
      updatedAt: committedAt,
    }, { merge: true });
    writeSynchronizedProductStock(transaction, productRefs, snapshots, nextStocks);
    writeOptionalOperationalStock(transaction, operationRefs, operationSnapshots, nextStocks);
    writeOwnerSaleProjections(transaction, db, committedSale);
    return 'committed';
  });
}

/** Atomically adjusts inventory by the difference between the stored and edited sale. */
export async function updateSaleAndInventory(
  db: Firestore,
  sale: Sale,
  adjustInventory = true,
): Promise<'updated'> {
  validateSalePayload(sale);
  if (!hasCompleteSaleCostProjection(sale) || !hasCompleteSaleFinancialProjection(sale)) {
    throw new Error('sale-sync/incomplete-financial-projection');
  }
  const saleRef = doc(db, 'sales', sale.id);
  const saleOperationRef = doc(db, SEPARATED_COLLECTIONS.saleOperations, sale.id);

  return runTransaction<'updated'>(db, async (transaction): Promise<'updated'> => {
    const existingSnapshot = await transaction.get(saleRef);
    if (!existingSnapshot.exists()) throw new Error('sale-sync/sale-not-found');
    const existingSale = existingSnapshot.data() as Sale;
    const existingOperationalSale = await transaction.get(saleOperationRef);
    if (existingOperationalSale.exists()
      && !sameCanonicalRecord(existingOperationalSale.data(), cleanForFirestore(projectOperationalSale(existingSale)))) {
      throw new Error('sale-sync/operational-sale-id-conflict');
    }
    const before = effectiveDeductions(existingSale);
    const after = adjustInventory ? effectiveDeductions(sale) : before;
    const deltas = calculateStockDeltas(before, after);
    const productRefs = new Map([...deltas.keys()].map((id) => [id, doc(db, 'tarek_products', id)] as const));
    const operationRefs = new Map([...deltas.keys()].map((id) => [id, doc(db, 'product_operations', id)] as const));
    const snapshots = await readStockSnapshots(transaction, productRefs);
    const operationSnapshots = await readStockSnapshots(transaction, operationRefs);
    const nextStocks = validateNextStocks(snapshots, deltas);
    assertTransactionWriteBudget(1 + saleProjectionWriteCount(sale), productRefs.size, operationSnapshots);

    transaction.set(saleRef, cleanForFirestore(sale));
    writeSynchronizedProductStock(transaction, productRefs, snapshots, nextStocks);
    writeOptionalOperationalStock(transaction, operationRefs, operationSnapshots, nextStocks);
    writeOwnerSaleProjections(transaction, db, sale);
    return 'updated';
  });
}

function reversalVaultDeltas(sale: Sale, fallbackCommissionRate: number): Map<string, number> {
  const rate = Number.isFinite(fallbackCommissionRate) ? fallbackCommissionRate : 0.05;
  const commission = sale.commissionAmount ?? sale.totalCommission ?? Math.round((sale.totalPrice || 0) * rate);
  const entries: Array<[string, number]> = [
    ['restock', Math.max(0, Number(sale.totalCost) || 0)],
    ['commissions', Math.max(0, Number(commission) || 0)],
    ['owner_profit', Math.max(0, Number(sale.totalProfit) || 0)],
  ];
  return new Map(entries.filter(([, amount]) => amount > 0));
}

async function readVaultSnapshots(
  transaction: Transaction,
  db: Firestore,
  deltas: Map<string, number>,
): Promise<Map<string, DocumentSnapshot<DocumentData>>> {
  const refs = new Map([...deltas.keys()].map((id) => [id, doc(db, 'vaults', id)] as const));
  const entries = [...refs.entries()];
  const snapshots = await Promise.all(entries.map(([, ref]) => transaction.get(ref)));
  return new Map(entries.map(([id], index) => [id, snapshots[index]]));
}

function calculateVaultBalances(
  snapshots: Map<string, DocumentSnapshot<DocumentData>>,
  deltas: Map<string, number>,
): Map<string, number> {
  const balances = new Map<string, number>();
  for (const [id, snapshot] of snapshots) {
    if (!snapshot.exists()) throw new Error(`sale-sync/missing-vault:${id}`);
    const currentBalance = snapshot.data().currentBalance;
    if (typeof currentBalance !== 'number' || !Number.isFinite(currentBalance) || currentBalance < 0) {
      throw new Error(`sale-sync/invalid-vault-balance:${id}`);
    }
    balances.set(id, Math.max(0, currentBalance - (deltas.get(id) ?? 0)));
  }
  return balances;
}

async function commitSaleReversal(
  db: Firestore,
  saleId: string,
  reversalReason: string,
  reversedBy: string,
  restoreInventory: boolean,
  fallbackCommissionRate: number,
  deleteSale: boolean,
): Promise<'reversed' | 'already-reversed' | 'deleted' | 'already-deleted'> {
  if (!saleId.trim() || saleId.includes('/')) throw new Error('sale-sync/invalid-sale-id');
  const saleRef = doc(db, 'sales', saleId);

  return runTransaction(db, async (transaction) => {
    const saleSnapshot = await transaction.get(saleRef);
    if (!saleSnapshot.exists()) return deleteSale ? 'already-deleted' : (() => { throw new Error('sale-sync/sale-not-found'); })();
    const sale = saleSnapshot.data() as Sale;
    const saleOperationRef = doc(db, SEPARATED_COLLECTIONS.saleOperations, saleId);
    const operationalSaleSnapshot = await transaction.get(saleOperationRef);
    if (operationalSaleSnapshot.exists()
      && !sameCanonicalRecord(operationalSaleSnapshot.data(), cleanForFirestore(projectOperationalSale(sale)))) {
      throw new Error('sale-sync/operational-sale-id-conflict');
    }
    const alreadyReversed = Boolean(sale.isReversed);
    let counterRef: ReturnType<typeof doc> | undefined;
    let counterUpdate: Record<string, unknown> | undefined;
    let reversalCommissionFields: Pick<Sale, 'commissionDayKey' | 'commissionSprayBottleCount' | 'commissionCounterGeneration' | 'commissionCounterAction'> | undefined;
    if (!deleteSale && !alreadyReversed) {
      const dayKey = commissionDayKeyForSale(sale);
      const sprayBottleCount = sale.commissionSprayBottleCount ?? countCommissionableSprayBottles(sale);
      if (!Number.isSafeInteger(sprayBottleCount) || sprayBottleCount < 0
          || (sale.commissionSprayBottleCount !== undefined
            && sale.commissionSprayBottleCount !== countCommissionableSprayBottles(sale))) {
        throw new Error('sale-sync/commission-counter-sale-count-mismatch');
      }
      counterRef = doc(db, COMMISSION_COUNTER_COLLECTION, dayKey);
      const counterSnapshot = await transaction.get(counterRef);
      const counter = readyCommissionCounter(counterSnapshot, dayKey);
      const nextSprayBottlesSold = counter.sprayBottlesSold - sprayBottleCount;
      const nextGeneration = counter.generation + 1;
      if (!Number.isSafeInteger(nextSprayBottlesSold) || nextSprayBottlesSold < 0
          || !Number.isSafeInteger(nextGeneration)) {
        throw new Error('sale-sync/commission-counter-reversal-underflow');
      }
      counterUpdate = {
        sprayBottlesSold: nextSprayBottlesSold,
        generation: nextGeneration,
        lastAppliedSaleId: saleId,
        lastAppliedAction: 'reversal',
        updatedAt: new Date().toISOString(),
      };
      reversalCommissionFields = {
        commissionDayKey: dayKey,
        commissionSprayBottleCount: sprayBottleCount,
        commissionCounterGeneration: nextGeneration,
        commissionCounterAction: 'reversal',
      };
    }
    const stockDeltas = restoreInventory && !alreadyReversed ? getSaleStockDeductions(sale) : new Map<string, number>();
    const productRefs = new Map([...stockDeltas.keys()].map((id) => [id, doc(db, 'tarek_products', id)] as const));
    const operationRefs = new Map([...stockDeltas.keys()].map((id) => [id, doc(db, 'product_operations', id)] as const));
    const stockSnapshots = await readStockSnapshots(transaction, productRefs);
    const operationSnapshots = await readStockSnapshots(transaction, operationRefs);
    const nextStocks = new Map<string, number>();
    for (const [id, snapshot] of stockSnapshots) {
      if (!snapshot.exists()) throw new Error(`sale-sync/missing-product:${id}`);
      const stock = snapshot.data().stock_grams;
      if (typeof stock !== 'number' || !Number.isFinite(stock) || stock < 0) throw new Error(`sale-sync/invalid-product-stock:${id}`);
      nextStocks.set(id, stock + (stockDeltas.get(id) ?? 0));
    }

    const vaultDeltas = alreadyReversed ? new Map<string, number>() : reversalVaultDeltas(sale, fallbackCommissionRate);
    const vaultSnapshots = await readVaultSnapshots(transaction, db, vaultDeltas);
    const nextVaultBalances = calculateVaultBalances(vaultSnapshots, vaultDeltas);
    assertTransactionWriteBudget(
      (deleteSale ? 1 : Number(!alreadyReversed) + saleProjectionWriteCount(sale)) + vaultDeltas.size + Number(Boolean(counterUpdate)),
      productRefs.size,
      operationSnapshots,
    );

    if (deleteSale) {
      transaction.delete(saleRef);
    } else if (!alreadyReversed) {
      const reversedSale = {
        ...sale,
        isReversed: true,
        reversalReason,
        reversedBy,
        reversedAt: new Date().toISOString(),
        ...reversalCommissionFields,
      };
      transaction.set(saleRef, cleanForFirestore(reversedSale));
      writeOwnerSaleProjections(transaction, db, reversedSale);
      transaction.set(counterRef!, counterUpdate!, { merge: true });
    } else {
      writeOwnerSaleProjections(transaction, db, sale);
    }
    writeSynchronizedProductStock(transaction, productRefs, stockSnapshots, nextStocks);
    writeOptionalOperationalStock(transaction, operationRefs, operationSnapshots, nextStocks);
    for (const [id, balance] of nextVaultBalances) {
      transaction.set(doc(db, 'vaults', id), { currentBalance: balance }, { merge: true });
    }

    if (deleteSale) return 'deleted';
    return alreadyReversed ? 'already-reversed' : 'reversed';
  });
}

/** Reverses sale, optional stock restoration and the established vault impacts in one transaction. */
export function reverseSaleAndInventory(
  db: Firestore,
  saleId: string,
  reversalReason: string,
  reversedBy: string,
  restoreInventory = true,
  fallbackCommissionRate = 0.05,
) {
  return commitSaleReversal(db, saleId, reversalReason, reversedBy, restoreInventory, fallbackCommissionRate, false);
}

/** Permanent invoice deletion is deliberately disabled; use the immutable reversal path. */
export function deleteSaleAndRestoreInventory(
  _db: Firestore,
  _saleId: string,
  _restoreInventory = true,
  _fallbackCommissionRate = 0.05,
): never {
  throw new Error('sale/permanent-delete-disabled');
}
