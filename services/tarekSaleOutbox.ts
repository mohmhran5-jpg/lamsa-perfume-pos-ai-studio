import {
  toTarekWorkerSaleIntentV3,
  type TarekSafeSaleDraft,
  type WorkerSaleIntentV3,
} from './workerSaleContract.ts';

const OUTBOX_KEY = 'lamsa_tarek_sale_outbox_v1';
const OUTBOX_EVENT = 'lamsa:tarek-sale-outbox-changed';

export type TarekSaleOutboxStatus = 'معلق' | 'جاري المزامنة' | 'فشل' | 'يحتاج تحديث السعر';

export interface TarekSaleOutboxEntry {
  id: string;
  saleId: string;
  intent: WorkerSaleIntentV3;
  createdAt: string;
  updatedAt: string;
  retryCount: number;
  status: TarekSaleOutboxStatus;
  errorCode?: string;
}

export interface TarekSaleFlushResult {
  attempted: number;
  synced: number;
  failed: number;
  syncedSaleIds: string[];
}

export interface TarekSaleCommitAcknowledgement {
  ok: true;
  status: 'committed' | 'already-committed';
  sale: Record<string, unknown>;
}

export type TarekSaleCommitter = (intent: WorkerSaleIntentV3) => Promise<TarekSaleCommitAcknowledgement>;

type LockManagerLike = {
  request<T>(name: string, options: { mode: 'exclusive' }, callback: () => Promise<T>): Promise<T>;
};

let activeFlush: Promise<TarekSaleFlushResult> | null = null;

function storage(): Storage {
  if (typeof localStorage === 'undefined') throw new Error('tarek-sale-outbox/storage-unavailable');
  return localStorage;
}

function notifyChanged(): void {
  if (typeof window === 'undefined') return;
  try { window.dispatchEvent(new Event(OUTBOX_EVENT)); } catch { /* storage listener remains available */ }
}

function withOutboxLock<T>(operation: () => Promise<T>): Promise<T> {
  const locks = typeof navigator === 'undefined'
    ? undefined
    : (navigator as Navigator & { locks?: LockManagerLike }).locks;
  if (!locks?.request) return operation();
  return locks.request('lamsa-tarek-sale-outbox-v1', { mode: 'exclusive' }, operation);
}

function canonicalJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`;
  if (value && typeof value === 'object') {
    const record = value as Record<string, unknown>;
    return `{${Object.keys(record).sort().map((key) => `${JSON.stringify(key)}:${canonicalJson(record[key])}`).join(',')}}`;
  }
  return JSON.stringify(value);
}

function readEntries(): TarekSaleOutboxEntry[] {
  let raw: string | null;
  try { raw = storage().getItem(OUTBOX_KEY); }
  catch { throw new Error('tarek-sale-outbox/read-failed'); }
  if (!raw) return [];
  let parsed: unknown;
  try { parsed = JSON.parse(raw); }
  catch { throw new Error('tarek-sale-outbox/corrupt-storage'); }
  if (!Array.isArray(parsed)) throw new Error('tarek-sale-outbox/invalid-storage-shape');
  for (const entry of parsed) {
    if (!entry || typeof entry !== 'object' || typeof entry.id !== 'string'
      || typeof entry.saleId !== 'string' || !entry.intent || typeof entry.intent !== 'object'
      || entry.intent.schema !== 'lamsa.sale-intent/v3' || entry.intent.saleId !== entry.saleId) {
      throw new Error('tarek-sale-outbox/invalid-entry');
    }
  }
  return parsed as TarekSaleOutboxEntry[];
}

function writeEntries(entries: TarekSaleOutboxEntry[]): void {
  const serialized = JSON.stringify(entries);
  try {
    storage().setItem(OUTBOX_KEY, serialized);
    if (storage().getItem(OUTBOX_KEY) !== serialized) throw new Error('verify');
  } catch {
    throw new Error('tarek-sale-outbox/persistence-failed');
  }
  notifyChanged();
}

export function getTarekSaleOutbox(): TarekSaleOutboxEntry[] {
  return readEntries();
}

/** Enqueue is durable-before-send; repeated IDs must carry exactly the same intent. */
export async function enqueueTarekSale(draft: TarekSafeSaleDraft): Promise<TarekSaleOutboxEntry> {
  const intent = toTarekWorkerSaleIntentV3(draft);
  if (!intent.quoteId) throw new Error('tarek-sale-outbox/server-quote-required');
  return withOutboxLock(async () => {
    const entries = readEntries();
    const existing = entries.find((entry) => entry.saleId === intent.saleId);
    if (existing) {
      if (canonicalJson(existing.intent) !== canonicalJson(intent)) {
        throw new Error('tarek-sale-outbox/idempotency-conflict');
      }
      return existing;
    }
    const now = new Date().toISOString();
    const entry: TarekSaleOutboxEntry = {
      id: `TAREK-SALE-${intent.saleId}`,
      saleId: intent.saleId,
      intent,
      createdAt: now,
      updatedAt: now,
      retryCount: 0,
      status: 'معلق',
    };
    entries.push(entry);
    writeEntries(entries);
    if (!readEntries().some((candidate) => candidate.id === entry.id)) {
      throw new Error('tarek-sale-outbox/persistence-failed');
    }
    return entry;
  });
}

export async function replaceTarekSaleQuote(
  saleId: string,
  draft: TarekSafeSaleDraft,
): Promise<TarekSaleOutboxEntry> {
  const intent = toTarekWorkerSaleIntentV3(draft);
  if (!intent.quoteId || intent.saleId !== saleId) throw new Error('tarek-sale-outbox/invalid-requote');
  return withOutboxLock(async () => {
    const entries = readEntries();
    const existing = entries.find((entry) => entry.saleId === saleId);
    if (!existing || existing.status !== 'يحتاج تحديث السعر') {
      throw new Error('tarek-sale-outbox/requote-not-authorized');
    }
    const oldIntent = { ...existing.intent, quoteId: undefined };
    const newIntent = { ...intent, quoteId: undefined };
    if (canonicalJson(oldIntent) !== canonicalJson(newIntent)) {
      throw new Error('tarek-sale-outbox/requote-input-mismatch');
    }
    const updated: TarekSaleOutboxEntry = {
      ...existing,
      intent,
      status: 'معلق',
      updatedAt: new Date().toISOString(),
    };
    delete updated.errorCode;
    writeEntries(entries.map((entry) => entry.id === existing.id ? updated : entry));
    return updated;
  });
}

async function updateEntry(id: string, status: TarekSaleOutboxStatus, errorCode?: string): Promise<void> {
  await withOutboxLock(async () => {
    const entries = readEntries();
    const next = entries.map((entry) => {
      if (entry.id !== id) return entry;
      const updated: TarekSaleOutboxEntry = {
        ...entry,
        status,
        updatedAt: new Date().toISOString(),
        retryCount: entry.retryCount + (status === 'فشل' ? 1 : 0),
      };
      if (errorCode) updated.errorCode = errorCode;
      else delete updated.errorCode;
      return updated;
    });
    writeEntries(next);
  });
}

async function removeAcknowledgedEntry(id: string): Promise<void> {
  await withOutboxLock(async () => {
    const next = readEntries().filter((entry) => entry.id !== id);
    writeEntries(next);
    if (readEntries().some((entry) => entry.id === id)) throw new Error('tarek-sale-outbox/remove-failed');
  });
}

function normalizedErrorCode(error: unknown): string {
  const source = error as { message?: unknown } | null;
  const code = typeof source?.message === 'string' ? source.message : '';
  return /^[a-z0-9/_-]{1,120}$/i.test(code) ? code : 'worker-sale/sync-failed';
}

function isCommitAcknowledgement(
  value: unknown,
  saleId: string,
): value is TarekSaleCommitAcknowledgement {
  if (!value || typeof value !== 'object') return false;
  const result = value as Partial<TarekSaleCommitAcknowledgement>;
  return result.ok === true
    && (result.status === 'committed' || result.status === 'already-committed')
    && Boolean(result.sale && typeof result.sale === 'object')
    && result.sale.id === saleId;
}

/** Retains every entry on timeout, rejection, malformed ack, or local removal failure. */
export async function flushTarekSaleOutbox(commit: TarekSaleCommitter): Promise<TarekSaleFlushResult> {
  if (activeFlush) return activeFlush;
  const task = (async () => {
    // A tab may have closed after marking an item in-flight but before observing
    // the server acknowledgement; replaying the same intent is idempotent.
    const pending = readEntries();
    let synced = 0;
    let failed = 0;
    const syncedSaleIds: string[] = [];

    for (const entry of pending) {
      if (entry.status === 'يحتاج تحديث السعر') continue;
      try {
        await updateEntry(entry.id, 'جاري المزامنة');
        const acknowledgement = await commit(entry.intent);
        if (!isCommitAcknowledgement(acknowledgement, entry.saleId)) {
          throw new Error('tarek-sale-outbox/invalid-acknowledgement');
        }
        await removeAcknowledgedEntry(entry.id);
        synced += 1;
        syncedSaleIds.push(entry.saleId);
      } catch (error) {
        const code = normalizedErrorCode(error);
        const requiresRequote = /quote-(stale|expired|missing|used|mismatch)/i.test(code);
        try { await updateEntry(entry.id, requiresRequote ? 'يحتاج تحديث السعر' : 'فشل', code); }
        catch { /* retain the last durable copy even if status cannot be refreshed */ }
        failed += 1;
      }
    }
    return { attempted: pending.length, synced, failed, syncedSaleIds };
  })();

  activeFlush = task;
  try { return await task; }
  finally { if (activeFlush === task) activeFlush = null; }
}

export function subscribeToTarekSaleOutbox(listener: (entries: TarekSaleOutboxEntry[]) => void): () => void {
  if (typeof window === 'undefined') return () => {};
  const handle = () => listener(getTarekSaleOutbox());
  const handleStorage = (event: StorageEvent) => { if (event.key === OUTBOX_KEY) handle(); };
  window.addEventListener(OUTBOX_EVENT, handle);
  window.addEventListener('storage', handleStorage);
  return () => {
    window.removeEventListener(OUTBOX_EVENT, handle);
    window.removeEventListener('storage', handleStorage);
  };
}
