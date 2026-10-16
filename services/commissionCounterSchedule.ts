export const LAMSA_COMMISSION_CUTOVER_DATE_KEY = '2026-10-17';
export const LAMSA_COMMISSION_CUTOVER_AT_UTC_MS = Date.UTC(2026, 9, 17, 0, 0, 0);

export type CommissionCounterBootstrapPlan =
  | { action: 'disabled' | 'invalid-clock' }
  | { action: 'wait-for-cutover'; dateKey: string; delayMs: number }
  | { action: 'bootstrap-current-day'; dateKey: string }
  | { action: 'already-ready-today'; dateKey: string; delayMs: number };

/**
 * Plan only: this function does not schedule work or access Firestore.
 * A mounted, authenticated owner UI calls it; the Worker remains authoritative for server time.
 */
export function getCommissionCounterBootstrapPlan(
  now: Date,
  enabled: boolean,
  productionEnabled: boolean,
  readyDateKey = '',
): CommissionCounterBootstrapPlan {
  if (!enabled) return { action: 'disabled' };
  if (!(now instanceof Date) || !Number.isFinite(now.getTime())) return { action: 'invalid-clock' };

  const dateKey = now.toISOString().slice(0, 10);
  if (productionEnabled && dateKey < LAMSA_COMMISSION_CUTOVER_DATE_KEY) {
    return {
      action: 'wait-for-cutover',
      dateKey,
      delayMs: Math.max(0, LAMSA_COMMISSION_CUTOVER_AT_UTC_MS - now.getTime() + 1000),
    };
  }
  if (productionEnabled && dateKey === readyDateKey) {
    const nextUtcMidnight = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 1, 0, 0, 2);
    return { action: 'already-ready-today', dateKey, delayMs: Math.max(0, nextUtcMidnight - now.getTime()) };
  }
  return { action: 'bootstrap-current-day', dateKey };
}
