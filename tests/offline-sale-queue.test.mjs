import test, { beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import {
  enqueueOfflineAction,
  flushPendingSaleQueue,
  getOfflineQueue,
  saveOfflineQueue,
  startSaleQueueAutoRetry,
} from '../services/offlineSyncService.ts';

const memory = new Map();
Object.defineProperty(globalThis, 'localStorage', {
  configurable: true,
  value: {
    getItem(key) { return memory.has(key) ? memory.get(key) : null; },
    setItem(key, value) { memory.set(key, String(value)); },
    removeItem(key) { memory.delete(key); },
  },
});

const saleFixture = (id = 'sale-queue-0001') => ({
  id,
  date: '2026-10-16T00:30:00.000Z',
  items: [{ id: 'line-1', productId: 'oil-a', productName: 'Oil', bottleSize: 10, essenceGrams: 2, sellingPrice: 50 }],
  totalPrice: 50,
});

function queuedSale(id = 'sale-queue-0001') {
  return {
    id: `SALE-${id}`,
    entityType: 'sale',
    payload: saleFixture(id),
    deviceTimestamp: '2026-10-16 00:30:00',
    retryCount: 0,
    status: 'معلق',
  };
}

async function waitUntil(predicate, timeoutMs = 1200) {
  const started = Date.now();
  while (!predicate()) {
    if (Date.now() - started > timeoutMs) throw new Error('timed out waiting for local queue condition');
    await new Promise((resolve) => setTimeout(resolve, 5));
  }
}

beforeEach(() => {
  saveOfflineQueue([]);
});

test('a valid queued invoice is retained when an unrelated older row has an unknown shape', async () => {
  const legacyRow = { id: 'legacy-opaque-row', legacyPayload: { keep: true } };
  localStorage.setItem('lamsa_offline_queue_v1', JSON.stringify([legacyRow, queuedSale('malformed-neighbor-0001')]));
  const result = await flushPendingSaleQueue(async () => {
    throw Object.assign(new Error('unavailable'), { code: 'unavailable' });
  });
  const afterRetry = getOfflineQueue();
  assert.equal(result.failed, 1);
  assert.deepEqual(afterRetry[0], legacyRow);
  assert.equal(afterRetry[1].payload.id, 'malformed-neighbor-0001');
  assert.equal(afterRetry[1].status, 'فشل');
});

test('repeated local submit for one sale ID reuses one durable outbox row', () => {
  const sale = saleFixture();
  const first = enqueueOfflineAction('sale', sale);
  const second = enqueueOfflineAction('sale', sale);
  assert.equal(first.id, second.id);
  assert.equal(getOfflineQueue().length, 1);
  assert.equal(getOfflineQueue()[0].payload.id, sale.id);
  assert.equal(getOfflineQueue()[0].status, 'معلق');
});

test('a pending sale remains in local storage while server acknowledgement is unresolved', async () => {
  enqueueOfflineAction('sale', saleFixture());
  let acknowledge;
  const serverCommit = new Promise((resolve) => { acknowledge = resolve; });
  const flush = flushPendingSaleQueue(() => serverCommit);
  await waitUntil(() => getOfflineQueue()[0]?.status === 'جاري المزامنة');
  assert.equal(getOfflineQueue().length, 1);
  acknowledge({ committed: true });
  const result = await flush;
  assert.deepEqual(result, { attempted: 1, synced: 1, failed: 0, syncedIds: ['SALE-sale-queue-0001'] });
  assert.deepEqual(getOfflineQueue(), []);
});

test('permission rejection on Tarek device is a visible failure and never deletes or labels the sale synced', async () => {
  enqueueOfflineAction('sale', saleFixture('tarek-queued-0001'));
  const denied = Object.assign(new Error('auth/owner-auth-required'), { code: 'permission-denied' });
  const result = await flushPendingSaleQueue(async () => { throw denied; });
  const remaining = getOfflineQueue();
  assert.deepEqual(result, { attempted: 1, synced: 0, failed: 1, syncedIds: [] });
  assert.equal(remaining.length, 1);
  assert.equal(remaining[0].status, 'فشل');
  assert.equal(remaining[0].errorMessage, 'permission-denied');
  assert.equal(remaining[0].retryCount, 1);
});

test('a stale commission-counter sale is retained for review but excluded from automatic retries', async () => {
  enqueueOfflineAction('sale', saleFixture('counter-stale-0001'));
  const stale = Object.assign(new Error('sale-sync/commission-counter-stale'), {
    code: 'sale-sync/commission-counter-stale',
  });
  const first = await flushPendingSaleQueue(async () => { throw stale; });
  assert.deepEqual(first, { attempted: 1, synced: 0, failed: 1, syncedIds: [] });
  assert.equal(getOfflineQueue()[0].status, 'فشل');
  assert.equal(getOfflineQueue()[0].errorMessage, 'sale-sync/commission-counter-stale');

  let retryCalled = false;
  const second = await flushPendingSaleQueue(async () => {
    retryCalled = true;
    return { committed: true };
  });
  assert.deepEqual(second, { attempted: 0, synced: 0, failed: 0, syncedIds: [] });
  assert.equal(retryCalled, false);
  assert.equal(getOfflineQueue().length, 1);
});

test('auto retry resumes after online restoration and a reopened app, removing only after a successful commit', async () => {
  enqueueOfflineAction('sale', saleFixture('resume-queue-0001'));
  const target = new EventTarget();
  let online = false;
  let serverAttempts = 0;
  const firstSession = startSaleQueueAutoRetry(async () => {
    serverAttempts += 1;
    throw Object.assign(new Error('unavailable'), { code: 'unavailable' });
  }, {
    eventTarget: target,
    isOnline: () => online,
    intervalMs: 60_000,
  });

  await new Promise((resolve) => setTimeout(resolve, 10));
  assert.equal(serverAttempts, 0);
  online = true;
  target.dispatchEvent(new Event('online'));
  await waitUntil(() => getOfflineQueue()[0]?.status === 'فشل');
  assert.equal(getOfflineQueue().length, 1);
  firstSession.stop();

  // A fresh retry controller represents a later app launch with the same local storage.
  let committedIds = new Set();
  const reopenedSession = startSaleQueueAutoRetry(async (sale) => {
    serverAttempts += 1;
    committedIds.add(sale.id);
    return { committed: true };
  }, {
    eventTarget: target,
    isOnline: () => online,
    intervalMs: 60_000,
  });
  await waitUntil(() => getOfflineQueue().length === 0);
  assert.equal(serverAttempts, 2);
  assert.deepEqual([...committedIds], ['resume-queue-0001']);
  reopenedSession.stop();
});

test('the periodic safety retry catches connectivity return even if the browser emits no online event', async () => {
  enqueueOfflineAction('sale', saleFixture('timer-resume-0001'));
  const target = new EventTarget();
  let online = false;
  let attempts = 0;
  const controller = startSaleQueueAutoRetry(async () => {
    attempts += 1;
    return { committed: true };
  }, {
    eventTarget: target,
    isOnline: () => online,
    intervalMs: 1000,
  });
  await new Promise((resolve) => setTimeout(resolve, 20));
  online = true;
  await waitUntil(() => getOfflineQueue().length === 0, 1500);
  assert.equal(attempts, 1);
  controller.stop();
});
