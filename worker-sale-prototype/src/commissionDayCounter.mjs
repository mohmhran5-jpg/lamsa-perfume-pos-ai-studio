export const COMMISSION_COUNTER_COLLECTION = 'commission_day_counters';
export const MAX_COUNTER_BOOTSTRAP_DOCS_PER_COLLECTION = 5000;
const TEST_ID_PATTERN = /^(?:TEST-|DOC-EXAMPLE)|-TEST-/i;

export function utcDateKey(value = new Date()) {
  return value.toISOString().slice(0, 10);
}

export function isValidDateKey(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T00:00:00.000Z`);
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

export function isExplicitTestSale(sale, id = sale?.id) {
  if (sale?.isTestData === true || ['TEST', 'DOC_EXAMPLE'].includes(sale?.dataClassification)) return true;
  if (typeof id === 'string' && TEST_ID_PATTERN.test(id)) return true;
  const text = `${sale?.notes || ''} ${sale?.title || ''} ${sale?.customerName || ''} ${sale?.reason || ''}`;
  return text.includes('TEST / بيانات اختبار') || text.includes('[TEST-DATA]')
    || text.includes('بيانات اختبار تلقائية');
}

/**
 * Returns the exact spray-bottle contribution under the app's established rule.
 * Legacy missing quantity means one (the POS default); malformed values fail closed.
 */
export function countSaleSprays(sale, { allowLegacyDefaultQuantity = true } = {}) {
  if (!sale || typeof sale !== 'object' || Array.isArray(sale)) throw new Error('commission-counter/history-ambiguous-sale');
  if (sale.isReversed === true) return 0;
  if (sale.isReversed !== undefined && typeof sale.isReversed !== 'boolean') {
    throw new Error('commission-counter/history-ambiguous-reversal');
  }
  if (sale.transactionType !== undefined && sale.transactionType !== 'بيع_طبيعي') return 0;
  if (!Array.isArray(sale.items) || sale.items.length === 0) {
    throw new Error('commission-counter/history-ambiguous-items');
  }

  let total = 0;
  for (const item of sale.items) {
    if (!item || typeof item !== 'object' || Array.isArray(item)) {
      throw new Error('commission-counter/history-ambiguous-item');
    }
    let quantity = item.quantity;
    if (quantity === undefined || quantity === null) {
      if (!allowLegacyDefaultQuantity) throw new Error('commission-counter/history-ambiguous-quantity');
      quantity = 1;
    }
    if (!Number.isSafeInteger(quantity) || quantity < 1) {
      throw new Error('commission-counter/history-ambiguous-quantity');
    }
    const rollOnBySize = [2, 3, 5].includes(item.bottleSize);
    if (item.isRollOn !== undefined && typeof item.isRollOn !== 'boolean') {
      throw new Error('commission-counter/history-ambiguous-roll-on');
    }
    if (item.isRollOn === true || rollOnBySize) continue;
    if (item.isRollOn === undefined && (typeof item.bottleSize !== 'number' || !Number.isFinite(item.bottleSize) || item.bottleSize <= 0)) {
      throw new Error('commission-counter/history-ambiguous-bottle-size');
    }
    total += quantity;
    if (!Number.isSafeInteger(total)) throw new Error('commission-counter/history-count-overflow');
  }
  return total;
}

export function validateReadyCommissionCounter(counter, dateKey) {
  if (!counter || typeof counter !== 'object' || Array.isArray(counter)
      || counter.schemaVersion !== 1 || counter.status !== 'ready' || counter.dateKey !== dateKey
      || !Number.isSafeInteger(counter.sprayBottlesSold) || counter.sprayBottlesSold < 0
      || !Number.isSafeInteger(counter.generation) || counter.generation < 0) {
    throw new Error('commission-counter/not-ready');
  }
  return counter;
}

export function nextCommissionCounter(counter, { dateKey, saleId, sprayCount, action, now }) {
  validateReadyCommissionCounter(counter, dateKey);
  if (!Number.isSafeInteger(sprayCount) || sprayCount < 0) throw new Error('commission-counter/invalid-spray-count');
  if (!['sale', 'reversal'].includes(action)) throw new Error('commission-counter/invalid-action');
  const nextCount = counter.sprayBottlesSold + (action === 'sale' ? sprayCount : -sprayCount);
  if (!Number.isSafeInteger(nextCount) || nextCount < 0) throw new Error('commission-counter/count-underflow');
  const generation = counter.generation + 1;
  if (!Number.isSafeInteger(generation)) throw new Error('commission-counter/generation-overflow');
  return {
    ...counter,
    sprayBottlesSold: nextCount,
    generation,
    lastAppliedSaleId: saleId,
    lastAppliedAction: action,
    updatedAt: now,
  };
}
