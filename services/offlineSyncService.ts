import type { OfflineQueueItem, Sale } from '../types.ts';

// v1 is a historical queue that must remain untouched and must never be replayed.
// New owner POS outbox records use a separate key so they cannot be confused with
// pre-cutover invoices whose dates and commission evidence are untrusted.
const OFFLINE_QUEUE_KEY = 'lamsa_offline_queue_v2';
const OFFLINE_QUEUE_EVENT = 'lamsa:offline-queue-changed:v2';
const DEFAULT_RETRY_INTERVAL_MS = 30_000;

export type SaleFlushResult = {
  attempted: number;
  synced: number;
  failed: number;
  syncedIds: string[];
};

export interface SaleQueueRetryOptions {
  eventTarget?: EventTarget;
  isOnline?: () => boolean;
  isVisible?: () => boolean;
  intervalMs?: number;
  onSyncStart?: () => void;
  onResult?: (result: SaleFlushResult) => void;
  onError?: (error: unknown) => void;
}

export interface SaleQueueRetryController {
  retryNow: () => Promise<SaleFlushResult | null>;
  stop: () => void;
}

let activeSaleFlush: Promise<SaleFlushResult> | null = null;

function generateTransactionId(prefix: string): string {
  return `${prefix}-${Date.now().toString(36).toUpperCase()}-${Math.random().toString(36).slice(2, 6).toUpperCase()}`;
}

function getCairoCurrentTimeString(): string {
  return new Intl.DateTimeFormat('ar-EG', {
    timeZone: 'Africa/Cairo',
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: true,
  }).format(new Date());
}

function notifyQueueChanged(): void {
  if (typeof window === 'undefined') return;
  try {
    window.dispatchEvent(new Event(OFFLINE_QUEUE_EVENT));
  } catch (error) {
    console.warn('Could not notify the local offline queue observer:', error);
  }
}

export function getOfflineQueue(): OfflineQueueItem[] {
  try {
    if (typeof localStorage === 'undefined') return [];
    const raw = localStorage.getItem(OFFLINE_QUEUE_KEY);
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    // Preserve every object row, even if an older/interrupted shape is malformed;
    // non-object JSON values cannot represent a sale record.
    return Array.isArray(parsed)
      ? parsed.filter((item) => Boolean(item && typeof item === 'object')) as OfflineQueueItem[]
      : [];
  } catch (error) {
    console.error('Error reading offline queue:', error);
    return [];
  }
}

/** Writes synchronously and verifies the exact serialized queue before reporting success. */
export function saveOfflineQueue(queue: OfflineQueueItem[]): void {
  if (typeof localStorage === 'undefined') throw new Error('offline-queue/storage-unavailable');
  const serialized = JSON.stringify(queue);
  try {
    localStorage.setItem(OFFLINE_QUEUE_KEY, serialized);
    if (localStorage.getItem(OFFLINE_QUEUE_KEY) !== serialized) {
      throw new Error('offline-queue/persistence-failed');
    }
  } catch (error) {
    if (error instanceof Error && error.message.startsWith('offline-queue/')) throw error;
    throw new Error('offline-queue/persistence-failed');
  }
  notifyQueueChanged();
}

/** Updates this tab immediately and other tabs through the browser storage event. */
export function subscribeToOfflineQueue(listener: (queue: OfflineQueueItem[]) => void): () => void {
  if (typeof window === 'undefined') return () => {};
  const handleQueueChange = () => listener(getOfflineQueue());
  const handleStorage = (event: StorageEvent) => {
    if (event.key === OFFLINE_QUEUE_KEY) handleQueueChange();
  };
  window.addEventListener(OFFLINE_QUEUE_EVENT, handleQueueChange);
  window.addEventListener('storage', handleStorage);
  return () => {
    window.removeEventListener(OFFLINE_QUEUE_EVENT, handleQueueChange);
    window.removeEventListener('storage', handleStorage);
  };
}

export function enqueueOfflineAction(
  entityType: OfflineQueueItem['entityType'],
  payload: any,
): OfflineQueueItem {
  const queue = getOfflineQueue();
  const stableSaleId = entityType === 'sale' && typeof payload?.id === 'string' && payload.id.trim()
    ? payload.id.trim()
    : null;

  // A repeated submit/recovery for the same invoice reuses its one local outbox row.
  if (stableSaleId) {
    const existing = queue.find((queued) => queued && typeof queued === 'object'
      && queued.entityType === 'sale' && queued.payload?.id === stableSaleId);
    if (existing) return existing;
  }

  const transactionId = stableSaleId ? `SALE-${stableSaleId}` : generateTransactionId('TX');
  const cairoTime = getCairoCurrentTimeString();
  const item: OfflineQueueItem = {
    id: transactionId,
    entityType,
    payload: {
      ...payload,
      transactionId,
      deviceTimestamp: cairoTime,
      isOfflineCreated: true,
    },
    deviceTimestamp: cairoTime,
    retryCount: 0,
    status: 'معلق',
  };

  queue.push(item);
  saveOfflineQueue(queue);
  if (!getOfflineQueue().some((queued) => queued && typeof queued === 'object' && queued.id === transactionId)) {
    throw new Error('offline-queue/persistence-failed');
  }
  return item;
}

export function removeOfflineItem(id: string): void {
  const queue = getOfflineQueue().filter((item) => !item || typeof item !== 'object' || item.id !== id);
  saveOfflineQueue(queue);
  if (getOfflineQueue().some((item) => item && typeof item === 'object' && item.id === id)) {
    throw new Error('offline-queue/remove-failed');
  }
}

export function updateOfflineItemStatus(
  id: string,
  status: OfflineQueueItem['status'],
  errorMessage?: string,
): void {
  const queue = getOfflineQueue().map((item) => {
    if (!item || typeof item !== 'object' || item.id !== id) return item;
    const updated: OfflineQueueItem = {
      ...item,
      status,
      retryCount: item.retryCount + (status === 'فشل' ? 1 : 0),
    };
    if (errorMessage) updated.errorMessage = errorMessage;
    else delete updated.errorMessage;
    return updated;
  });
  saveOfflineQueue(queue);
}

function safeErrorCode(error: unknown): string {
  const source = error as { code?: unknown; message?: unknown } | null;
  const code = typeof source?.code === 'string'
    ? source.code
    : typeof source?.message === 'string'
      ? source.message
      : '';
  return /^[a-z0-9/_-]{1,100}$/i.test(code) ? code : 'sale-sync/failed';
}

function isTerminalCommissionCounterFailure(item: OfflineQueueItem): boolean {
  return typeof item.errorMessage === 'string'
    && /^sale-sync\/commission-counter-(?:not-ready|stale|ambiguous-date)$/.test(item.errorMessage);
}

/**
 * Flush queued sales only. The callback must resolve only after the server-side
 * sale + stock transaction has committed; until then the durable outbox is kept.
 */
export async function flushPendingSaleQueue(
  syncSale: (sale: Sale) => Promise<unknown>,
): Promise<SaleFlushResult> {
  if (activeSaleFlush) return activeSaleFlush;
  const task = (async () => {
    const pending = getOfflineQueue().filter((item) =>
      item && typeof item === 'object' && item.entityType === 'sale' && typeof item.id === 'string'
      && !isTerminalCommissionCounterFailure(item)
    );
    let synced = 0;
    let failed = 0;
    const syncedIds: string[] = [];

    for (const item of pending) {
      const sale = item.payload as Sale | null;
      if (!sale || typeof sale.id !== 'string' || !Array.isArray(sale.items)) {
        updateOfflineItemStatus(item.id, 'فشل', 'sale-sync/invalid-queued-sale');
        failed += 1;
        continue;
      }

      try {
        updateOfflineItemStatus(item.id, 'جاري المزامنة');
        await syncSale(sale);
        // This is the only path that removes an invoice: the server adapter resolved.
        removeOfflineItem(item.id);
        synced += 1;
        syncedIds.push(item.id);
      } catch (error) {
        try {
          updateOfflineItemStatus(item.id, 'فشل', safeErrorCode(error));
        } catch (persistenceError) {
          console.error('Could not persist queued sale failure status:', persistenceError);
        }
        failed += 1;
      }
    }
    return { attempted: pending.length, synced, failed, syncedIds };
  })();

  activeSaleFlush = task;
  try {
    return await task;
  } finally {
    if (activeSaleFlush === task) activeSaleFlush = null;
  }
}

/**
 * Retries after authentication, online restoration, app resume/focus and a modest
 * timer. The timer catches browsers that fail to emit an `online` event reliably.
 */
export function startSaleQueueAutoRetry(
  syncSale: (sale: Sale) => Promise<unknown>,
  options: SaleQueueRetryOptions = {},
): SaleQueueRetryController {
  const target = options.eventTarget ?? (typeof window !== 'undefined' ? window : undefined);
  const visibilityTarget = typeof document !== 'undefined' ? document : target;
  const isOnline = options.isOnline ?? (() => typeof navigator === 'undefined' || navigator.onLine);
  const isVisible = options.isVisible ?? (() => typeof document === 'undefined' || document.visibilityState === 'visible');
  const intervalMs = Math.max(1000, options.intervalMs ?? DEFAULT_RETRY_INTERVAL_MS);
  let stopped = false;
  let inFlight = false;

  const retryNow = async (): Promise<SaleFlushResult | null> => {
    if (stopped || inFlight || !isOnline() || !getOfflineQueue().some((item) =>
      item && typeof item === 'object' && item.entityType === 'sale' && typeof item.id === 'string'
      && !isTerminalCommissionCounterFailure(item)
    )) {
      return null;
    }
    inFlight = true;
    options.onSyncStart?.();
    try {
      const result = await flushPendingSaleQueue(syncSale);
      if (!stopped) options.onResult?.(result);
      return result;
    } catch (error) {
      if (!stopped) options.onError?.(error);
      return null;
    } finally {
      inFlight = false;
    }
  };

  const onWake = () => {
    if (isVisible()) void retryNow();
  };
  const timer = setInterval(onWake, intervalMs);
  target?.addEventListener('online', onWake);
  target?.addEventListener('pageshow', onWake);
  target?.addEventListener('focus', onWake);
  visibilityTarget?.addEventListener('visibilitychange', onWake);

  // Covers pending rows restored from localStorage after the app is reopened.
  void retryNow();

  return {
    retryNow,
    stop: () => {
      if (stopped) return;
      stopped = true;
      clearInterval(timer);
      target?.removeEventListener('online', onWake);
      target?.removeEventListener('pageshow', onWake);
      target?.removeEventListener('focus', onWake);
      visibilityTarget?.removeEventListener('visibilitychange', onWake);
    },
  };
}
