import { importPKCS8, SignJWT } from 'jose';

export const GOOGLE_OAUTH_TOKEN_URL = 'https://oauth2.googleapis.com/token';
export const FIRESTORE_DATASTORE_SCOPE = 'https://www.googleapis.com/auth/datastore';
const JWT_LIFETIME_SECONDS = 3600;
const TOKEN_REFRESH_SKEW_MS = 60_000;

export class GoogleServiceAccountAuthError extends Error {
  constructor(code = 'google/service-account-auth-failed') {
    super(code);
    this.code = code;
  }
}

/**
 * Creates a short-lived OAuth access-token provider for Firestore REST.
 * The private key is read only from the supplied runtime binding; this module
 * never persists it. Tests inject an ephemeral key and a mock fetch implementation.
 */
export function createGoogleServiceAccountTokenProvider({
  fetchImpl = (...args) => globalThis.fetch(...args),
  now = () => Date.now(),
  expectedServiceAccountEmail,
} = {}) {
  const stateByEmail = new Map();

  return async function getGoogleServiceAccountAccessToken(env) {
    const email = typeof env?.GCP_SERVICE_ACCOUNT_EMAIL === 'string'
      ? env.GCP_SERVICE_ACCOUNT_EMAIL.trim().toLowerCase() : '';
    const privateKey = typeof env?.GCP_SERVICE_ACCOUNT_PRIVATE_KEY === 'string'
      ? env.GCP_SERVICE_ACCOUNT_PRIVATE_KEY.replace(/\\n/g, '\n').trim() : '';
    if (!email || !/^[^@\s]+@[^@\s]+\.iam\.gserviceaccount\.com$/.test(email)
        || (expectedServiceAccountEmail && email !== expectedServiceAccountEmail.toLowerCase())
        || !privateKey.startsWith('-----BEGIN PRIVATE KEY-----')
        || !privateKey.includes('-----END PRIVATE KEY-----')) {
      throw new GoogleServiceAccountAuthError('google/service-account-config-invalid');
    }

    const nowMs = now();
    const cached = stateByEmail.get(email);
    if (cached?.accessToken && cached.expiresAtMs - TOKEN_REFRESH_SKEW_MS > nowMs) {
      return cached.accessToken;
    }
    if (cached?.pending) return cached.pending;

    const state = cached || {};
    const pending = (async () => {
      let assertion;
      try {
        const signingKey = await importPKCS8(privateKey, 'RS256');
        const issuedAt = Math.floor(now() / 1000);
        assertion = await new SignJWT({ scope: FIRESTORE_DATASTORE_SCOPE })
          .setProtectedHeader({ alg: 'RS256', typ: 'JWT' })
          .setIssuer(email)
          .setAudience(GOOGLE_OAUTH_TOKEN_URL)
          .setIssuedAt(issuedAt)
          .setExpirationTime(issuedAt + JWT_LIFETIME_SECONDS)
          .sign(signingKey);
      } catch {
        throw new GoogleServiceAccountAuthError('google/service-account-key-invalid');
      }

      let response;
      try {
        response = await fetchImpl(GOOGLE_OAUTH_TOKEN_URL, {
          method: 'POST',
          headers: { accept: 'application/json', 'content-type': 'application/x-www-form-urlencoded' },
          body: new URLSearchParams({
            grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
            assertion,
          }),
          redirect: 'manual',
        });
      } catch {
        throw new GoogleServiceAccountAuthError('google/token-service-unavailable');
      }
      if (!response?.ok) throw new GoogleServiceAccountAuthError('google/token-exchange-rejected');

      let payload;
      try { payload = await response.json(); }
      catch { throw new GoogleServiceAccountAuthError('google/token-response-invalid'); }
      const expiresIn = payload?.expires_in;
      if (typeof payload?.access_token !== 'string' || !payload.access_token
          || typeof payload?.token_type !== 'string' || payload.token_type.toLowerCase() !== 'bearer'
          || !Number.isSafeInteger(expiresIn) || expiresIn <= 60 || expiresIn > JWT_LIFETIME_SECONDS) {
        throw new GoogleServiceAccountAuthError('google/token-response-invalid');
      }
      state.accessToken = payload.access_token;
      state.expiresAtMs = now() + expiresIn * 1000;
      return state.accessToken;
    })();

    state.pending = pending;
    stateByEmail.set(email, state);
    try {
      return await pending;
    } finally {
      if (state.pending === pending) delete state.pending;
    }
  };
}
