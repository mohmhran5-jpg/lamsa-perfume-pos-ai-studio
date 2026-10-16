export const MAX_COMMISSION_CLOCK_DRIFT_MS = 2 * 60 * 1000;
export const MAX_TRUSTED_TIME_SAMPLE_AGE_MS = 24 * 60 * 60 * 1000;

export interface TrustedServerTimeEstimate {
  serverNowMs: number;
  dateKey: string;
  sampleAgeMs: number;
  deviceClockDriftMs: number;
}

export interface CommissionTimeEvidence {
  commissionTimingStatus: 'verified' | 'needs_owner_review';
  commissionEventTime?: string;
  commissionCandidateDayKey?: string;
  commissionReviewReason?: 'missing-time-sample' | 'stale-time-sample' | 'device-clock-drift' | 'invalid-event-time' | 'event-clock-drift' | 'counter-not-ready';
  commissionClockDriftMs?: number;
}

interface TrustedTimeAnchor {
  serverTimeMs: number;
  observedMonotonicMs: number;
  observedWallMs: number;
}

let trustedTimeAnchor: TrustedTimeAnchor | null = null;
const listeners = new Set<() => void>();

function monotonicNow(): number | null {
  const value = globalThis.performance?.now?.();
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function notifyListeners(): void {
  for (const listener of listeners) listener();
}

function parseTime(value: string | number): number | null {
  const parsed = typeof value === 'number' ? value : Date.parse(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}

/** Records a server-generated timestamp in memory only; it is never persisted to browser storage. */
export function recordTrustedServerTimeSample(
  serverTime: string | number,
  observedMonotonicMs: number | null = monotonicNow(),
  observedWallMs = Date.now(),
): boolean {
  const serverTimeMs = parseTime(serverTime);
  if (serverTimeMs === null || observedMonotonicMs === null || !Number.isFinite(observedMonotonicMs)
      || !Number.isFinite(observedWallMs)) return false;
  trustedTimeAnchor = { serverTimeMs, observedMonotonicMs, observedWallMs };
  notifyListeners();
  return true;
}

export function clearTrustedServerTimeSample(): void {
  trustedTimeAnchor = null;
  notifyListeners();
}

export function subscribeTrustedServerTime(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/** Returns the estimated server clock even when the device wall clock has drifted. */
export function getTrustedServerTimeEstimate(
  observedMonotonicMs: number | null = monotonicNow(),
  observedWallMs = Date.now(),
): TrustedServerTimeEstimate | null {
  if (!trustedTimeAnchor || observedMonotonicMs === null || !Number.isFinite(observedMonotonicMs)
      || !Number.isFinite(observedWallMs)) return null;
  const sampleAgeMs = observedMonotonicMs - trustedTimeAnchor.observedMonotonicMs;
  if (sampleAgeMs < 0 || sampleAgeMs > MAX_TRUSTED_TIME_SAMPLE_AGE_MS) return null;
  const serverNowMs = trustedTimeAnchor.serverTimeMs + sampleAgeMs;
  if (!Number.isFinite(serverNowMs)) return null;
  return {
    serverNowMs,
    dateKey: new Date(serverNowMs).toISOString().slice(0, 10),
    sampleAgeMs,
    deviceClockDriftMs: Math.abs(observedWallMs - serverNowMs),
  };
}

/**
 * Binds a POS occurrence timestamp to a recent trusted server-clock sample.
 * Uncertain timestamps remain saleable but must be excluded from automatic commission accounting.
 */
export function createCommissionTimeEvidence(
  occurredAt: string,
  observedMonotonicMs: number | null = monotonicNow(),
  observedWallMs = Date.now(),
  counterReady = true,
): CommissionTimeEvidence {
  if (!trustedTimeAnchor || observedMonotonicMs === null || !Number.isFinite(observedMonotonicMs)) {
    return { commissionTimingStatus: 'needs_owner_review', commissionReviewReason: 'missing-time-sample' };
  }
  const sampleAgeMs = observedMonotonicMs - trustedTimeAnchor.observedMonotonicMs;
  if (sampleAgeMs < 0 || sampleAgeMs > MAX_TRUSTED_TIME_SAMPLE_AGE_MS) {
    return { commissionTimingStatus: 'needs_owner_review', commissionReviewReason: 'stale-time-sample' };
  }
  const serverNowMs = trustedTimeAnchor.serverTimeMs + sampleAgeMs;
  const candidateDayKey = new Date(serverNowMs).toISOString().slice(0, 10);
  const deviceClockDriftMs = Math.abs(observedWallMs - serverNowMs);
  const eventTimeMs = Date.parse(occurredAt);
  if (!Number.isFinite(eventTimeMs)) {
    return {
      commissionTimingStatus: 'needs_owner_review',
      commissionCandidateDayKey: candidateDayKey,
      commissionReviewReason: 'invalid-event-time',
    };
  }
  if (!Number.isFinite(deviceClockDriftMs) || deviceClockDriftMs > MAX_COMMISSION_CLOCK_DRIFT_MS) {
    return {
      commissionTimingStatus: 'needs_owner_review',
      commissionEventTime: new Date(eventTimeMs).toISOString(),
      commissionCandidateDayKey: candidateDayKey,
      commissionReviewReason: 'device-clock-drift',
      commissionClockDriftMs: Math.round(deviceClockDriftMs),
    };
  }
  const eventClockDriftMs = Math.abs(eventTimeMs - serverNowMs);
  if (eventClockDriftMs > MAX_COMMISSION_CLOCK_DRIFT_MS) {
    return {
      commissionTimingStatus: 'needs_owner_review',
      commissionEventTime: new Date(eventTimeMs).toISOString(),
      commissionCandidateDayKey: candidateDayKey,
      commissionReviewReason: 'event-clock-drift',
      commissionClockDriftMs: Math.round(eventClockDriftMs),
    };
  }
  if (!counterReady) {
    return {
      commissionTimingStatus: 'needs_owner_review',
      commissionEventTime: new Date(eventTimeMs).toISOString(),
      commissionCandidateDayKey: candidateDayKey,
      commissionReviewReason: 'counter-not-ready',
      commissionClockDriftMs: Math.round(eventClockDriftMs),
    };
  }
  return {
    commissionTimingStatus: 'verified',
    commissionEventTime: new Date(eventTimeMs).toISOString(),
    commissionCandidateDayKey: candidateDayKey,
    commissionClockDriftMs: Math.round(eventClockDriftMs),
  };
}
