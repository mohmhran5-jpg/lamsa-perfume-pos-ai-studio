import assert from 'node:assert/strict';
import test from 'node:test';
import {
  clearTrustedServerTimeSample,
  createCommissionTimeEvidence,
  getTrustedServerTimeEstimate,
  MAX_COMMISSION_CLOCK_DRIFT_MS,
  MAX_TRUSTED_TIME_SAMPLE_AGE_MS,
  recordTrustedServerTimeSample,
} from '../services/commissionTimeEvidence.ts';

const T0 = Date.parse('2026-10-16T23:59:30.000Z');

test('uses the trusted UTC day across Cairo 03:00 cutover without replacing the original event timestamp', () => {
  clearTrustedServerTimeSample();
  assert.equal(recordTrustedServerTimeSample(T0, 1000, T0), true);
  const trustedNow = T0 + 31_000;
  const estimate = getTrustedServerTimeEstimate(32_000, trustedNow);
  assert.equal(estimate?.dateKey, '2026-10-17');
  const evidence = createCommissionTimeEvidence(new Date(trustedNow).toISOString(), 32_000, trustedNow);
  assert.equal(evidence.commissionTimingStatus, 'verified');
  assert.equal(evidence.commissionCandidateDayKey, '2026-10-17');
  assert.equal(evidence.commissionEventTime, '2026-10-17T00:00:01.000Z');
  assert.equal(new Date(trustedNow).toISOString(), '2026-10-17T00:00:01.000Z');
});

test('accepts an event exactly at the conservative two-minute drift threshold', () => {
  clearTrustedServerTimeSample();
  assert.equal(recordTrustedServerTimeSample(T0, 1000, T0), true);
  const serverNow = T0 + 100_000;
  const evidence = createCommissionTimeEvidence(
    new Date(serverNow + MAX_COMMISSION_CLOCK_DRIFT_MS).toISOString(),
    101_000,
    serverNow,
  );
  assert.equal(evidence.commissionTimingStatus, 'verified');
  assert.equal(evidence.commissionClockDriftMs, MAX_COMMISSION_CLOCK_DRIFT_MS);
});

test('marks device clock drift for owner review while retaining a trusted candidate UTC day', () => {
  clearTrustedServerTimeSample();
  assert.equal(recordTrustedServerTimeSample(T0, 1000, T0), true);
  const serverNow = T0 + 20_000;
  const evidence = createCommissionTimeEvidence(new Date(serverNow + 180_000).toISOString(), 21_000, serverNow + 180_000);
  assert.equal(evidence.commissionTimingStatus, 'needs_owner_review');
  assert.equal(evidence.commissionReviewReason, 'device-clock-drift');
  assert.equal(evidence.commissionCandidateDayKey, '2026-10-16');
  assert.equal(evidence.commissionEventTime, new Date(serverNow + 180_000).toISOString());
});

test('marks implausible event time for owner review rather than inventing a commission day', () => {
  clearTrustedServerTimeSample();
  assert.equal(recordTrustedServerTimeSample(T0, 1000, T0), true);
  const serverNow = T0 + 20_000;
  const evidence = createCommissionTimeEvidence('not-a-date', 21_000, serverNow);
  assert.equal(evidence.commissionTimingStatus, 'needs_owner_review');
  assert.equal(evidence.commissionReviewReason, 'invalid-event-time');
  assert.equal(evidence.commissionCandidateDayKey, '2026-10-16');
});

test('marks a missing or stale trusted sample for owner review', () => {
  clearTrustedServerTimeSample();
  assert.equal(createCommissionTimeEvidence(new Date(T0).toISOString(), 1000, T0).commissionReviewReason, 'missing-time-sample');
  assert.equal(recordTrustedServerTimeSample(T0, 1000, T0), true);
  const stale = createCommissionTimeEvidence(
    new Date(T0 + MAX_TRUSTED_TIME_SAMPLE_AGE_MS + 1).toISOString(),
    1000 + MAX_TRUSTED_TIME_SAMPLE_AGE_MS + 1,
    T0 + MAX_TRUSTED_TIME_SAMPLE_AGE_MS + 1,
  );
  assert.equal(stale.commissionTimingStatus, 'needs_owner_review');
  assert.equal(stale.commissionReviewReason, 'stale-time-sample');
  clearTrustedServerTimeSample();
});

test('a sale with valid timing but unavailable counter remains saleable and is excluded for owner review', () => {
  clearTrustedServerTimeSample();
  assert.equal(recordTrustedServerTimeSample(T0, 1000, T0), true);
  const serverNow = T0 + 20_000;
  const evidence = createCommissionTimeEvidence(new Date(serverNow).toISOString(), 21_000, serverNow, false);
  assert.equal(evidence.commissionTimingStatus, 'needs_owner_review');
  assert.equal(evidence.commissionReviewReason, 'counter-not-ready');
  assert.equal(evidence.commissionCandidateDayKey, '2026-10-16');
  clearTrustedServerTimeSample();
});
