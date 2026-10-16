const LOCAL_CORS_ORIGINS = new Set([
  'http://127.0.0.1:3000',
  'http://localhost:3000',
]);

export const LAMSA_SALES_CUTOVER_DATE_KEY = '2026-10-17';

export function isLamsaSalesCutoverReached(now = new Date()) {
  return now instanceof Date
    && !Number.isNaN(now.getTime())
    && now.toISOString().slice(0, 10) >= LAMSA_SALES_CUTOVER_DATE_KEY;
}

/** Only a single canonical HTTPS origin is accepted for a production browser client. */
export function isExactHttpsOrigin(value) {
  if (typeof value !== 'string' || !value || value.includes('*') || value.includes(',')) return false;
  try {
    const url = new URL(value);
    const hostname = url.hostname.toLowerCase();
    return url.protocol === 'https:'
      && url.origin === value
      && !url.username
      && !url.password
      && !url.search
      && !url.hash
      && hostname !== 'localhost'
      && hostname !== '127.0.0.1'
      && hostname !== '[::1]'
      && !hostname.endsWith('.localhost');
  } catch {
    return false;
  }
}

/** Production routes need two independent explicit flags and an exact browser origin. */
export function isProductionLamsaRouteEnabled(env) {
  return env?.ENVIRONMENT === 'production'
    && env?.SALE_WORKER_PRODUCTION_ENABLED === 'true'
    && env?.FIRESTORE_PRODUCTION_TRANSPORT_ENABLED === 'true'
    && isExactHttpsOrigin(env?.CORS_ALLOWED_ORIGIN);
}

export function isAllowedLamsaRequestOrigin(env, origin) {
  if (env?.ENVIRONMENT === 'local-emulator') {
    return !origin || LOCAL_CORS_ORIGINS.has(origin);
  }
  return isProductionLamsaRouteEnabled(env)
    && typeof origin === 'string'
    && origin === env.CORS_ALLOWED_ORIGIN;
}

export function resolveLamsaCorsOrigin(env, origin) {
  return isAllowedLamsaRequestOrigin(env, origin) && origin ? origin : null;
}
