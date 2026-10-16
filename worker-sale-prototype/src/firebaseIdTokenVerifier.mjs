import { decodeProtectedHeader, importX509, jwtVerify } from 'jose';

export const FIREBASE_CERTS_URL = 'https://www.googleapis.com/robot/v1/metadata/x509/securetoken@system.gserviceaccount.com';
const FIREBASE_CLOCK_TOLERANCE_SECONDS = 10;
const FIREBASE_ID_TOKEN_MAX_AGE = '1h';

export class FirebaseTokenError extends Error {
  constructor(code = 'auth/invalid-firebase-id-token') {
    super(code);
    this.code = code;
  }
}

export class FirebaseCertificatesUnavailable extends Error {
  constructor() {
    super('auth/certificate-service-unavailable');
    this.code = 'auth/certificate-service-unavailable';
  }
}

export function createFirebaseIdTokenVerifier({
  fetchImpl = (...args) => globalThis.fetch(...args),
  now = () => Date.now(),
  unknownKidRefreshIntervalMs = 30_000,
} = {}) {
  const certificateCache = new Map();
  const inFlightFetches = new Map();
  const unknownKidRefreshTimes = new Map();

  async function fetchCertificates(certsUrl) {
    let response;
    try {
      response = await fetchImpl(certsUrl, {
        method: 'GET',
        headers: { accept: 'application/json' },
        redirect: 'manual',
      });
    } catch {
      throw new FirebaseCertificatesUnavailable();
    }
    if (!response?.ok) throw new FirebaseCertificatesUnavailable();

    let body;
    try { body = await response.json(); } catch { throw new FirebaseCertificatesUnavailable(); }
    if (!body || typeof body !== 'object' || Array.isArray(body)) {
      throw new FirebaseCertificatesUnavailable();
    }
    const certificates = Object.fromEntries(Object.entries(body).filter(([kid, pem]) =>
      /^[A-Za-z0-9_-]{1,128}$/.test(kid)
      && typeof pem === 'string'
      && pem.includes('-----BEGIN CERTIFICATE-----')
      && pem.includes('-----END CERTIFICATE-----')));
    if (Object.keys(certificates).length === 0 || Object.keys(certificates).length > 20) {
      throw new FirebaseCertificatesUnavailable();
    }

    const cacheControl = response.headers?.get?.('cache-control') || '';
    const maxAgeMatch = cacheControl.match(/(?:^|,)\s*max-age\s*=\s*"?(\d+)"?/i);
    const maxAgeMs = maxAgeMatch ? Number(maxAgeMatch[1]) * 1000 : 0;
    const fetchedAt = now();
    return { certificates, fetchedAt, expiresAt: fetchedAt + maxAgeMs };
  }

  async function getCertificates(certsUrl, { forceRefresh = false } = {}) {
    const cached = certificateCache.get(certsUrl);
    if (!forceRefresh && cached && now() < cached.expiresAt) return cached;

    const pending = inFlightFetches.get(certsUrl);
    if (pending) return pending;

    const request = fetchCertificates(certsUrl)
      .then((entry) => {
        certificateCache.set(certsUrl, entry);
        return entry;
      })
      .finally(() => inFlightFetches.delete(certsUrl));
    inFlightFetches.set(certsUrl, request);
    return request;
  }

  return async function verifyFirebaseIdToken(token, { projectId, certsUrl = FIREBASE_CERTS_URL } = {}) {
    if (typeof token !== 'string' || !token || typeof projectId !== 'string' || !projectId) {
      throw new FirebaseTokenError();
    }

    let header;
    try { header = decodeProtectedHeader(token); } catch { throw new FirebaseTokenError(); }
    if (header.alg !== 'RS256' || typeof header.kid !== 'string' || !/^[A-Za-z0-9_-]{1,128}$/.test(header.kid)) {
      throw new FirebaseTokenError();
    }

    let certEntry = await getCertificates(certsUrl);
    let certificate = certEntry.certificates[header.kid];
    if (!certificate) {
      const lastRefresh = unknownKidRefreshTimes.get(certsUrl);
      const currentTime = now();
      if (lastRefresh === undefined || currentTime - lastRefresh >= unknownKidRefreshIntervalMs) {
        unknownKidRefreshTimes.set(certsUrl, currentTime);
        certEntry = await getCertificates(certsUrl, { forceRefresh: true });
        certificate = certEntry.certificates[header.kid];
      }
      if (!certificate) throw new FirebaseTokenError();
    }

    let publicKey;
    try { publicKey = await importX509(certificate, 'RS256'); }
    catch { throw new FirebaseCertificatesUnavailable(); }

    let payload;
    const nowMs = now();
    try {
      ({ payload } = await jwtVerify(token, publicKey, {
        algorithms: ['RS256'],
        audience: projectId,
        issuer: `https://securetoken.google.com/${projectId}`,
        clockTolerance: FIREBASE_CLOCK_TOLERANCE_SECONDS,
        maxTokenAge: FIREBASE_ID_TOKEN_MAX_AGE,
        currentDate: new Date(nowMs),
      }));
    } catch { throw new FirebaseTokenError(); }

    const nowSeconds = Math.floor(nowMs / 1000);
    if (!Number.isSafeInteger(payload.iat) || !Number.isSafeInteger(payload.exp)
        || payload.iat > nowSeconds + FIREBASE_CLOCK_TOLERANCE_SECONDS
        || payload.auth_time !== undefined && (!Number.isSafeInteger(payload.auth_time)
          || payload.auth_time > nowSeconds + FIREBASE_CLOCK_TOLERANCE_SECONDS
          || payload.auth_time > payload.iat + FIREBASE_CLOCK_TOLERANCE_SECONDS)) {
      throw new FirebaseTokenError('auth/invalid-firebase-time-claims');
    }
    if (!Number.isSafeInteger(payload.auth_time)) {
      throw new FirebaseTokenError('auth/invalid-firebase-time-claims');
    }

    const firebase = payload.firebase || {};
    if (typeof payload.email !== 'string' || payload.email_verified !== true
        || firebase.sign_in_provider !== 'google.com'
        || typeof payload.sub !== 'string' || payload.sub.length < 1 || payload.sub.length > 128) {
      throw new FirebaseTokenError('auth/verified-google-email-required');
    }
    return { uid: payload.sub, email: payload.email.trim().toLowerCase() };
  };
}
