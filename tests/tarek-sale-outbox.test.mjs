import assert from 'node:assert/strict';
import test from 'node:test';
import {
  enqueueTarekSale,
  flushTarekSaleOutbox,
  getTarekSaleOutbox,
  replaceTarekSaleQuote,
} from '../services/tarekSaleOutbox.ts';

class MemoryStorage {
  values = new Map();
  getItem(key) { return this.values.has(key) ? this.values.get(key) : null; }
  setItem(key, value) { this.values.set(key, String(value)); }
  removeItem(key) { this.values.delete(key); }
  clear() { this.values.clear(); }
}

const originalStorageDescriptor = Object.getOwnPropertyDescriptor(globalThis, 'localStorage');
test.beforeEach(() => {
  Object.defineProperty(globalThis, 'localStorage', {
    configurable: true,
    writable: true,
    value: new MemoryStorage(),
  });
});
test.after(() => {
  if (originalStorageDescriptor) Object.defineProperty(globalThis, 'localStorage', originalStorageDescriptor);
  else delete globalThis.localStorage;
});

function draft(overrides = {}) {
  return {
    saleId: 'tarek-outbox-sale-01',
    quoteId: 'quote-outbox-0001',
    lines: [{
      lineId: 'line-1', productId: 'perfume-1', bottleSizeId: 'bottle-50-spray',
      bottleSizeMl: 50, quantity: 1, essenceGramsPerBottle: 15, isColoredBottle: false,
    }],
    manualDiscountEgp: 10,
    paymentMethod: 'نقدي',
    packagingPaid: false,
    ...overrides,
  };
}

function acknowledgement(saleId, status = 'committed') {
  return { ok: true, status, sale: { id: saleId, totalPrice: 290 } };
}

test('outbox persists a financially minimal quoted intent and deduplicates identical submissions', async () => {
  const first = await enqueueTarekSale(draft());
  const repeated = await enqueueTarekSale(draft());
  assert.equal(first.id, 'TAREK-SALE-tarek-outbox-sale-01');
  assert.equal(repeated.id, first.id);
  assert.equal(getTarekSaleOutbox().length, 1);
  const serialized = localStorage.getItem('lamsa_tarek_sale_outbox_v1');
  assert.equal(serialized.includes('totalProfit'), false);
  assert.equal(serialized.includes('commissionAmount'), false);
  assert.equal(serialized.includes('sellingPrice'), false);
});

test('outbox refuses to persist a sale before a server-issued quote id exists', async () => {
  const { quoteId: _ignored, ...withoutQuote } = draft();
  await assert.rejects(enqueueTarekSale(withoutQuote), /server-quote-required/);
  assert.deepEqual(getTarekSaleOutbox(), []);
});

test('same sale ID with changed intent is a conflict and cannot overwrite the durable first payload', async () => {
  await enqueueTarekSale(draft());
  await assert.rejects(enqueueTarekSale(draft({ manualDiscountEgp: 11 })), /idempotency-conflict/);
  assert.equal(getTarekSaleOutbox()[0].intent.manualDiscountEgp, 10);
});

test('ambiguous response retains the exact intent and an already-committed retry removes it once', async () => {
  const queued = await enqueueTarekSale(draft());
  let firstIntent;
  const timedOut = await flushTarekSaleOutbox(async (intent) => {
    firstIntent = structuredClone(intent);
    throw new Error('worker-sale/network-timeout');
  });
  assert.deepEqual(timedOut, { attempted: 1, synced: 0, failed: 1, syncedSaleIds: [] });
  const retained = getTarekSaleOutbox()[0];
  assert.equal(retained.id, queued.id);
  assert.equal(retained.status, 'فشل');
  assert.equal(retained.retryCount, 1);

  let replayIntent;
  const retried = await flushTarekSaleOutbox(async (intent) => {
    replayIntent = structuredClone(intent);
    return acknowledgement(intent.saleId, 'already-committed');
  }, { force: true });
  assert.deepEqual(replayIntent, firstIntent);
  assert.deepEqual(retried, {
    attempted: 1, synced: 1, failed: 0, syncedSaleIds: ['tarek-outbox-sale-01'],
  });
  assert.deepEqual(getTarekSaleOutbox(), []);
});

test('automatic retries back off after failure while explicit manual retry can proceed immediately', async () => {
  await enqueueTarekSale(draft());
  let commits = 0;
  await flushTarekSaleOutbox(async () => {
    commits += 1;
    throw new Error('worker-sale/network-timeout');
  });
  const failed = getTarekSaleOutbox()[0];
  assert.equal(failed.retryCount, 1);
  assert.equal(Number.isFinite(Date.parse(failed.nextRetryAt)), true);

  const skipped = await flushTarekSaleOutbox(async (intent) => {
    commits += 1;
    return acknowledgement(intent.saleId);
  }, { now: Date.parse(failed.nextRetryAt) - 1 });
  assert.equal(commits, 1, 'automatic retry must not call Worker before its deadline');
  assert.equal(skipped.failed, 0);
  assert.equal(getTarekSaleOutbox()[0].status, 'فشل');

  const retried = await flushTarekSaleOutbox(async (intent) => {
    commits += 1;
    return acknowledgement(intent.saleId);
  }, { force: true });
  assert.equal(commits, 2, 'manual sync may retry immediately');
  assert.equal(retried.synced, 1);
  assert.deepEqual(getTarekSaleOutbox(), []);
});

test('an acknowledgement for a different invoice never clears the queued sale', async () => {
  await enqueueTarekSale(draft());
  const result = await flushTarekSaleOutbox(async () => acknowledgement('different-sale-id'));
  assert.equal(result.synced, 0);
  assert.equal(result.failed, 1);
  assert.equal(getTarekSaleOutbox().length, 1);
  assert.equal(getTarekSaleOutbox()[0].status, 'فشل');
});

test('a row left in-flight by a closed tab is replayed with the same stable sale ID', async () => {
  const queued = await enqueueTarekSale(draft());
  const persisted = JSON.parse(localStorage.getItem('lamsa_tarek_sale_outbox_v1'));
  persisted[0].status = 'جاري المزامنة';
  localStorage.setItem('lamsa_tarek_sale_outbox_v1', JSON.stringify(persisted));
  let retriedId;
  const result = await flushTarekSaleOutbox(async (intent) => {
    retriedId = intent.saleId;
    return acknowledgement(intent.saleId, 'already-committed');
  });
  assert.equal(retriedId, queued.saleId);
  assert.equal(result.synced, 1);
  assert.deepEqual(getTarekSaleOutbox(), []);
});

test('a stale quote waits for a new quote and cannot be auto-retried at the old amount', async () => {
  await enqueueTarekSale(draft());
  const stale = await flushTarekSaleOutbox(async () => { throw new Error('worker-sale/sale/quote-stale'); });
  assert.equal(stale.failed, 1);
  assert.equal(getTarekSaleOutbox()[0].status, 'يحتاج تحديث السعر');

  const skipped = await flushTarekSaleOutbox(async () => { throw new Error('must-not-retry'); });
  assert.equal(skipped.attempted, 1);
  assert.equal(skipped.failed, 0);

  await assert.rejects(replaceTarekSaleQuote('tarek-outbox-sale-01', draft({
    quoteId: 'quote-outbox-0002', manualDiscountEgp: 11,
  })), /requote-input-mismatch/);
  await replaceTarekSaleQuote('tarek-outbox-sale-01', draft({ quoteId: 'quote-outbox-0002' }));
  const retried = await flushTarekSaleOutbox(async (intent) => acknowledgement(intent.saleId));
  assert.equal(retried.synced, 1);
  assert.deepEqual(getTarekSaleOutbox(), []);
});
