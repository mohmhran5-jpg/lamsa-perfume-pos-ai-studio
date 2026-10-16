import {
  cancelPendingPersist,
  loadDataSync,
  persistDataDurable,
} from './persistenceService.ts';

/** App-local caches that may contain sales, costs, budgets, wages, vaults or other owner-only data. */
export const OWNER_PRIVATE_CACHE_KEYS = Object.freeze([
  'lamsa_products',
  'lamsa_sales',
  'lamsa_expenses_v2',
  'lamsa_settings_v2',
  'lamsa_bottle_sizes_v2',
  'lamsa_vaults_v1',
  'lamsa_withdrawals_v1',
  'lamsa_attendance_v1',
  'lamsa_batches_v1',
  'lamsa_audit_logs_v1',
  'lamsa_users_v1',
  'lamsa_custom_customers_v1',
  'lamsa_saved_mixes_v1',
  'lamsa_closures_v1',
  'lamsa_purchase_requests_v1',
  'lamsa_customer_requests_v1',
  'lamsa_stock_checks_v1',
  'lamsa_owner_broadcasts',
  'lamsa_dismissed_broadcasts_v2',
  'lamsa_active_theme_v1',
] as const);

export class OwnerPrivateSessionGate {
  private activeOwnerUid: string | null = null;
  private currentGeneration = 0;

  get generation(): number {
    return this.currentGeneration;
  }

  /** Revoke access immediately when auth starts resolving or the account changes. */
  beginIdentityTransition(): number {
    this.currentGeneration += 1;
    this.activeOwnerUid = null;
    return this.currentGeneration;
  }

  /** Call only after Firebase Google identity and the owner role have been verified. */
  authorizeVerifiedOwner(uid: string, expectedGeneration = this.currentGeneration): boolean {
    if (!uid || expectedGeneration !== this.currentGeneration) return false;
    this.activeOwnerUid = uid;
    return true;
  }

  isAuthorized(expectedGeneration = this.currentGeneration, uid?: string): boolean {
    return expectedGeneration === this.currentGeneration
      && this.activeOwnerUid !== null
      && (uid === undefined || uid === this.activeOwnerUid);
  }
}

export type OwnerPrivateCacheReader = <T>(storageKey: string, fallback: T) => T;
export type OwnerPrivateCacheWriter = <T>(storageKey: string, data: T) => void;

/** Refuses to call the underlying storage reader unless the current owner session is verified. */
export function readOwnerPrivateCache<T>(
  gate: OwnerPrivateSessionGate,
  expectedGeneration: number,
  storageKey: string,
  fallback: T,
  reader: OwnerPrivateCacheReader = loadDataSync,
): T {
  if (!gate.isAuthorized(expectedGeneration)) return fallback;
  return reader(storageKey, fallback);
}

/** Refuses to schedule localStorage/IndexedDB writes outside the verified owner session. */
export function persistOwnerPrivateCache<T>(
  gate: OwnerPrivateSessionGate,
  expectedGeneration: number,
  storageKey: string,
  data: T,
  writer: OwnerPrivateCacheWriter = persistDataDurable,
): boolean {
  if (!gate.isAuthorized(expectedGeneration)) return false;
  writer(storageKey, data);
  return true;
}

/** Cancel debounced writes on identity transition; the durable sale outbox is intentionally excluded. */
export function cancelPendingOwnerPrivateCacheWrites(
  cancel: (storageKey: string) => void = cancelPendingPersist,
): void {
  OWNER_PRIVATE_CACHE_KEYS.forEach(cancel);
}
