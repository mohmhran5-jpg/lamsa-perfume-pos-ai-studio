import type { Sale } from '../types';
import {
  toTarekWorkerSaleIntentV3,
  toWorkerSaleIntent,
  type TarekSafeSaleDraft,
  type WorkerSaleIntentV2,
  type WorkerSaleIntentV3,
} from './workerSaleContract.ts';

export interface WorkerSaleCommitResult {
  ok: true;
  status: 'committed' | 'already-committed';
  sale: Record<string, unknown>;
}

export interface TarekSaleQuoteResult {
  ok: true;
  status: 'quoted';
  quoteId: string;
  expiresAt: number;
  sale: {
    id: string;
    totalPrice: number;
    discount: number;
    paymentMethod: string;
    items: Array<{
      id: string;
      productId: string | number;
      productName: string;
      productType: string;
      bottleSize: number;
      quantity: number;
      sellingPrice: number;
      isMix: boolean;
    }>;
    promotionId?: string;
  };
}

export interface CommissionCounterBootstrapResult {
  ok: true;
  status: 'ready' | 'already-ready';
  dateKey: string;
  sprayBottlesSold: number;
  generation: number;
  historyScanned: boolean;
  historicalSaleIdsScanned?: number;
}

type FetchLike = (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;
type TokenProvider = () => Promise<string>;

type WorkerSaleIntent = WorkerSaleIntentV2 | WorkerSaleIntentV3;
export interface TarekSaleWorkerBuildConfig {
  mode: 'development' | 'production';
  enabled: boolean;
  /** Base origin only, for example https://<worker-host>; never a secret. */
  workerUrl?: string;
}

export const LOCAL_LAMSA_SALE_ENDPOINT = 'http://127.0.0.1:8787/api/lamsa/sales';
export const LOCAL_LAMSA_COMMISSION_COUNTER_BOOTSTRAP_ENDPOINT = 'http://127.0.0.1:8787/api/lamsa/commission-counter/bootstrap';
const LOCAL_WORKER_ORIGINS = new Set([
  'http://127.0.0.1:8787',
  'http://localhost:8787',
]);

export function resolveTarekSaleWorkerEndpoint(config: TarekSaleWorkerBuildConfig): string | null {
  if (!config.enabled) return null;
  const raw = config.workerUrl?.trim();
  if (config.mode === 'development' && !raw) return LOCAL_LAMSA_SALE_ENDPOINT;
  if (!raw) return null;
  try {
    const url = new URL(raw);
    const local = LOCAL_WORKER_ORIGINS.has(url.origin);
    const isRootOrigin = url.pathname === '/' && !url.search && !url.hash && !url.username && !url.password;
    if (!isRootOrigin) return null;
    if (config.mode === 'development') {
      return local ? `${url.origin}/api/lamsa/sales` : null;
    }
    const hostname = url.hostname.toLowerCase();
    if (url.protocol !== 'https:' || local || hostname === 'localhost'
        || hostname === '127.0.0.1' || hostname === '[::1]' || hostname.endsWith('.localhost')
        || hostname === 'github.io' || hostname.endsWith('.github.io')) return null;
    return `${url.origin}/api/lamsa/sales`;
  } catch {
    return null;
  }
}

function runtimeTarekSaleWorkerBuildConfig(): TarekSaleWorkerBuildConfig {
  const env = (import.meta as ImportMeta & { env?: Record<string, unknown> }).env;
  if (!env) return { mode: 'production', enabled: false };
  const isDevelopment = env.DEV === true;
  return {
    mode: isDevelopment ? 'development' : 'production',
    enabled: isDevelopment
      ? env.VITE_PREVIEW_SAFE_MODE === 'true'
      : env.PROD === true && env.VITE_LAMSA_SALE_WORKER_ENABLED === 'true',
    workerUrl: typeof env.VITE_LAMSA_SALE_WORKER_URL === 'string' ? env.VITE_LAMSA_SALE_WORKER_URL : undefined,
  };
}

export function getConfiguredTarekSaleWorkerEndpoint(): string | null {
  return resolveTarekSaleWorkerEndpoint(runtimeTarekSaleWorkerBuildConfig());
}

function assertConfiguredSaleEndpoint(endpoint: string, config = runtimeTarekSaleWorkerBuildConfig()): URL {
  const expected = resolveTarekSaleWorkerEndpoint(config);
  let url: URL;
  try { url = new URL(endpoint); }
  catch { throw new Error('worker-sale/invalid-configured-url'); }
  if (!expected) throw new Error('worker-sale/not-enabled');
  const expectedUrl = new URL(expected);
  if (url.pathname !== expectedUrl.pathname || url.origin !== expectedUrl.origin
      || url.search || url.hash || url.username || url.password) {
    throw new Error('worker-sale/unconfigured-endpoint');
  }
  return url;
}
const TAREK_FORBIDDEN_RESPONSE_KEY = /(cost|profit|margin|commission|budget|financial|vault|expense|withdrawal|payroll|salary|capital|balance|settings)/i;

function assertLocalSaleEndpoint(endpoint: string): URL {
  let url: URL;
  try { url = new URL(endpoint); }
  catch { throw new Error('worker-sale/invalid-local-emulator-url'); }
  if (!LOCAL_WORKER_ORIGINS.has(url.origin) || url.pathname !== '/api/lamsa/sales'
      || url.search || url.hash || url.username || url.password) {
    throw new Error('worker-sale/local-emulator-only');
  }
  return url;
}

function assertNoTarekFinancialFields(value: unknown): void {
  if (!value || typeof value !== 'object') return;
  if (Array.isArray(value)) {
    value.forEach(assertNoTarekFinancialFields);
    return;
  }
  for (const [key, child] of Object.entries(value)) {
    if (TAREK_FORBIDDEN_RESPONSE_KEY.test(key)) throw new Error('worker-sale/unsafe-operator-response');
    assertNoTarekFinancialFields(child);
  }
}

async function postJson<T>(
  url: URL,
  body: unknown,
  getIdToken: TokenProvider,
  fetcher: FetchLike,
  responseLabel: 'sale' | 'quote' | 'bootstrap',
): Promise<T> {
  const token = await getIdToken();
  if (!token?.trim()) throw new Error('worker-sale/firebase-id-token-required');
  const response = await fetcher(url, {
    method: 'POST',
    headers: {
      authorization: `Bearer ${token}`,
      'content-type': 'application/json',
    },
    body: JSON.stringify(body),
  });
  let payload: unknown;
  try { payload = await response.json(); }
  catch { throw new Error(`worker-sale/invalid-${responseLabel}-response-${response.status}`); }
  if (!response.ok || !payload || typeof payload !== 'object' || !('ok' in payload) || payload.ok !== true) {
    const code = payload && typeof payload === 'object' && 'error' in payload
      ? String(payload.error)
      : `http-${response.status}`;
    throw new Error(`worker-sale/${code}`);
  }
  return payload as T;
}

async function submitIntent(
  intent: WorkerSaleIntent,
  endpoint: string,
  getIdToken: TokenProvider,
  fetcher: FetchLike,
  requireRedactedResult: boolean,
  validateEndpoint: (value: string) => URL = assertLocalSaleEndpoint,
): Promise<WorkerSaleCommitResult> {
  const url = validateEndpoint(endpoint);
  const payload = await postJson<Record<string, unknown>>(url, intent, getIdToken, fetcher, 'sale');
  if (!['committed', 'already-committed'].includes(String(payload.status))
      || !payload.sale || typeof payload.sale !== 'object') {
    throw new Error('worker-sale/invalid-success-response');
  }
  const sale = payload.sale as Record<string, unknown>;
  if (sale.id !== intent.saleId) throw new Error('worker-sale/acknowledgement-id-mismatch');
  if (requireRedactedResult) assertNoTarekFinancialFields(sale);
  return payload as unknown as WorkerSaleCommitResult;
}

/** Legacy v2 bridge for the owner POS; the URL allowlist rules out production endpoints. */
export async function submitSaleToLocalEmulatorWorker(
  sale: Sale,
  endpoint: string,
  getIdToken: TokenProvider,
  fetcher: FetchLike = fetch,
): Promise<WorkerSaleCommitResult> {
  return submitIntent(toWorkerSaleIntent(sale), endpoint, getIdToken, fetcher, false);
}

/** Employee-safe v3 commit bridge. Only the local emulator URL is accepted. */
export async function submitTarekSaleToLocalEmulatorWorker(
  draft: TarekSafeSaleDraft,
  endpoint: string,
  getIdToken: TokenProvider,
  fetcher: FetchLike = fetch,
): Promise<WorkerSaleCommitResult> {
  return submitIntent(toTarekWorkerSaleIntentV3(draft), endpoint, getIdToken, fetcher, true);
}

export async function submitTarekSaleIntentToLocalEmulatorWorker(
  intent: WorkerSaleIntentV3,
  endpoint: string,
  getIdToken: TokenProvider,
  fetcher: FetchLike = fetch,
): Promise<WorkerSaleCommitResult> {
  return submitIntent(intent, endpoint, getIdToken, fetcher, true);
}

/** Employee-safe v3 commit bridge for the build-configured Worker; disabled unless explicitly configured. */
export async function submitTarekSaleToWorker(
  draft: TarekSafeSaleDraft,
  endpoint: string,
  getIdToken: TokenProvider,
  fetcher: FetchLike = fetch,
  config?: TarekSaleWorkerBuildConfig,
): Promise<WorkerSaleCommitResult> {
  return submitIntent(toTarekWorkerSaleIntentV3(draft), endpoint, getIdToken, fetcher, true,
    (value) => assertConfiguredSaleEndpoint(value, config));
}

export async function submitTarekSaleIntentToWorker(
  intent: WorkerSaleIntentV3,
  endpoint: string,
  getIdToken: TokenProvider,
  fetcher: FetchLike = fetch,
  config?: TarekSaleWorkerBuildConfig,
): Promise<WorkerSaleCommitResult> {
  return submitIntent(intent, endpoint, getIdToken, fetcher, true,
    (value) => assertConfiguredSaleEndpoint(value, config));
}

/** Requests a short-lived server quote without committing stock, a sale, or vault balances. */
async function quoteTarekSale(
  draft: TarekSafeSaleDraft,
  endpoint: string,
  getIdToken: TokenProvider,
  fetcher: FetchLike,
  validateEndpoint: (value: string) => URL,
): Promise<TarekSaleQuoteResult> {
  const intent = toTarekWorkerSaleIntentV3(draft);
  if (!intent.quoteId) throw new Error('worker-sale/quote-id-required');
  const url = validateEndpoint(endpoint);
  url.pathname = `${url.pathname}/quote`;
  const payload = await postJson<Record<string, unknown>>(url, intent, getIdToken, fetcher, 'quote');
  if (payload.status !== 'quoted' || payload.quoteId !== intent.quoteId
      || typeof payload.expiresAt !== 'number' || !payload.sale || typeof payload.sale !== 'object') {
    throw new Error('worker-sale/invalid-quote-response');
  }
  const sale = payload.sale as Record<string, unknown>;
  if (sale.id !== intent.saleId || typeof sale.totalPrice !== 'number'
      || typeof sale.discount !== 'number' || typeof sale.paymentMethod !== 'string'
      || !Array.isArray(sale.items)) throw new Error('worker-sale/invalid-quote-sale');
  assertNoTarekFinancialFields(sale);
  return payload as unknown as TarekSaleQuoteResult;
}

/** Requests a quote from the explicitly configured Worker endpoint. */
export function quoteTarekSaleToWorker(
  draft: TarekSafeSaleDraft,
  endpoint: string,
  getIdToken: TokenProvider,
  fetcher: FetchLike = fetch,
  config?: TarekSaleWorkerBuildConfig,
): Promise<TarekSaleQuoteResult> {
  return quoteTarekSale(draft, endpoint, getIdToken, fetcher,
    (value) => assertConfiguredSaleEndpoint(value, config));
}

/** Requests a quote from the local emulator only. */
export function quoteTarekSaleToLocalEmulatorWorker(
  draft: TarekSafeSaleDraft,
  endpoint: string,
  getIdToken: TokenProvider,
  fetcher: FetchLike = fetch,
): Promise<TarekSaleQuoteResult> {
  return quoteTarekSale(draft, endpoint, getIdToken, fetcher, assertLocalSaleEndpoint);
}

/** One-time history bootstrap; hard-restricted to the local emulator Worker. */
export async function bootstrapCommissionCounterOnLocalEmulatorWorker(
  endpoint: string,
  getIdToken: TokenProvider,
  fetcher: FetchLike = fetch,
): Promise<CommissionCounterBootstrapResult> {
  let url: URL;
  try { url = new URL(endpoint); }
  catch { throw new Error('worker-sale/invalid-local-emulator-url'); }
  if (!LOCAL_WORKER_ORIGINS.has(url.origin)
      || url.pathname !== '/api/lamsa/commission-counter/bootstrap' || url.search || url.hash) {
    throw new Error('worker-sale/local-emulator-only');
  }
  const payload = await postJson<Record<string, unknown>>(url, {}, getIdToken, fetcher, 'bootstrap');
  if (!['ready', 'already-ready'].includes(String(payload.status))
      || typeof payload.dateKey !== 'string'
      || !Number.isSafeInteger(payload.sprayBottlesSold)
      || !Number.isSafeInteger(payload.generation)
      || typeof payload.historyScanned !== 'boolean') {
    throw new Error('worker-sale/invalid-bootstrap-response');
  }
  return payload as unknown as CommissionCounterBootstrapResult;
}
