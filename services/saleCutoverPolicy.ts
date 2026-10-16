export const LAMSA_SALES_CUTOVER_AT_UTC_MS = Date.UTC(2026, 9, 16, 0, 0, 0);

export function isLamsaSalesCutoverReached(serverTimeMs: number): boolean {
  return Number.isFinite(serverTimeMs) && serverTimeMs >= LAMSA_SALES_CUTOVER_AT_UTC_MS;
}
