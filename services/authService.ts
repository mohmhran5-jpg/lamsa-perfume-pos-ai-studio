import { AppUser, TAREK_OPERATIONAL_PERMISSIONS, UserPermissions, View } from '../types';
import { loadDataSync, persistDataDurable } from './persistenceService';
import { auth } from './firebase';
import {
  canAccessSeparatedCostData,
  canAccessSeparatedOperationalCostData,
  isAuthorizedOwnerProfile,
  isAuthorizedTarekProfile,
  isVerifiedOwnerIdentity,
} from './authPolicy';

export interface RejectedAccessLog {
  id: string;
  timestamp: string;
  username: string;
  employeeName: string;
  role: string;
  attemptedView?: string;
  attemptedAction?: string;
  ipOrDevice?: string;
  reason: string;
}

const REJECTED_LOGS_KEY = 'lamsa_rejected_access_logs_v1';

export function loadRejectedAccessLogs(): RejectedAccessLog[] {
  return loadDataSync<RejectedAccessLog[]>(REJECTED_LOGS_KEY, []);
}

export function logRejectedAccessAttempt(
  user: AppUser | null,
  attemptedView?: string,
  attemptedAction?: string,
  reason: string = 'محاولة خرق صلاحيات الوصول والصفحات المقيدة'
): RejectedAccessLog {
  const newLog: RejectedAccessLog = {
    id: `sec-log-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    timestamp: new Date().toISOString(),
    username: user?.username || 'مجهول',
    employeeName: user?.displayName || user?.fullName || 'مستخدم غير معروف',
    role: user?.role || 'زائر',
    attemptedView,
    attemptedAction,
    reason,
  };

  const existing = loadRejectedAccessLogs();
  const next = [newLog, ...existing].slice(0, 100);
  persistDataDurable(REJECTED_LOGS_KEY, next);
  return newLog;
}

export function hasVerifiedOwnerSession(): boolean {
  return isVerifiedOwnerIdentity(auth.currentUser);
}

/**
 * Checks if user possesses a specific granular permission
 */
export function hasPermission(user: AppUser | null, permission: keyof UserPermissions): boolean {
  if (isAuthorizedOwnerProfile(user, auth.currentUser)) return true;
  if (!isAuthorizedTarekProfile(user, auth.currentUser)) return false;
  return TAREK_OPERATIONAL_PERMISSIONS[permission] === true;
}

/**
 * Checks whether the current user is permitted to view profit figures & margins
 */
export function canViewProfits(user: AppUser | null): boolean {
  return isAuthorizedOwnerProfile(user, auth.currentUser);
}

/**
 * Checks whether the current user is permitted to view raw costs & purchase prices
 */
export function canViewCosts(user: AppUser | null): boolean {
  return canAccessSeparatedCostData(user, auth.currentUser);
}

/** Tarek may read only explicitly separated purchase/operating-cost projections. */
export function canViewOperationalCosts(user: AppUser | null): boolean {
  return canAccessSeparatedOperationalCostData(user, auth.currentUser)
    && (isAuthorizedOwnerProfile(user, auth.currentUser)
      || TAREK_OPERATIONAL_PERMISSIONS.canViewOperationalCosts === true);
}

/**
 * Checks whether the current user is permitted to view financial vaults & cash allocations
 */
export function canViewVaults(user: AppUser | null): boolean {
  return isAuthorizedOwnerProfile(user, auth.currentUser);
}

/**
 * Checks whether the current user is permitted to access a specific app view.
 */
export function canAccessView(user: AppUser | null, view: View | string): boolean {
  if (isAuthorizedOwnerProfile(user, auth.currentUser)) return true;
  if (!isAuthorizedTarekProfile(user, auth.currentUser)) return false;
  return view === View.TAREK_WORKSPACE;
}

/**
 * Secure SHA-256 Password Hashing Utility
 */
export async function hashPassword(plain: string): Promise<string> {
  if (!plain) return '';
  if (typeof crypto !== 'undefined' && crypto.subtle) {
    try {
      const msgUint8 = new TextEncoder().encode(plain);
      const hashBuffer = await crypto.subtle.digest('SHA-256', msgUint8);
      const hashArray = Array.from(new Uint8Array(hashBuffer));
      return hashArray.map((b) => b.toString(16).padStart(2, '0')).join('');
    } catch {
      // Fallback below
    }
  }
  let hash = 0;
  for (let i = 0; i < plain.length; i++) {
    const char = plain.charCodeAt(i);
    hash = (hash << 5) - hash + char;
    hash |= 0;
  }
  return `sha256_${Math.abs(hash).toString(16)}`;
}

/**
 * Normalizes Arabic / Persian numerals to Western standard digits and trims whitespace
 */
export function normalizePasswordInput(input: string): string {
  if (!input) return '';
  const arabicDigits = ['٠', '١', '٢', '٣', '٤', '٥', '٦', '٧', '٨', '٩'];
  const persianDigits = ['۰', '۱', '۲', '۳', '۴', '۵', '۶', '۷', '۸', '۹'];
  let normalized = input.trim();
  for (let i = 0; i < 10; i++) {
    normalized = normalized.split(arabicDigits[i]).join(String(i));
    normalized = normalized.split(persianDigits[i]).join(String(i));
  }
  return normalized;
}

/**
 * Verifies whether input PIN / password matches the expected hash or credentials
 */
export async function verifyPassword(
  input: string,
  hash?: string,
  user?: AppUser
): Promise<boolean> {
  // Local PINs and profile hashes are not identity credentials in phase 1.
  void input;
  void hash;
  void user;
  return false;
}

const SESSION_USER_KEY = 'lamsa_current_user_v2';

/**
 * Persists the active session user in localStorage
 */
export function clearSessionUser(): void {
  try {
    if (typeof localStorage !== 'undefined') {
      localStorage.removeItem(SESSION_USER_KEY);
    }
  } catch {}
}

/** Legacy compatibility: local storage can never create or restore an authenticated user. */
export function saveSessionUser(_user: AppUser | null): void {
  clearSessionUser();
}

/** Legacy local role snapshots are deliberately ignored even if tampered with. */
export function getSessionUser(): AppUser | null {
  clearSessionUser();
  return null;
}

/**
 * Checks if user has permission to record sales with historical / backdated timestamps
 */
export function canRecordBackdatedSales(user: AppUser | null): boolean {
  return isAuthorizedOwnerProfile(user, auth.currentUser)
    || (isAuthorizedTarekProfile(user, auth.currentUser)
      && TAREK_OPERATIONAL_PERMISSIONS.canRecordBackdatedSales === true);
}

/**
 * Checks if user is permitted to view real-time connected devices & alert radar
 */
export function canViewDeviceAlerts(user: AppUser | null): boolean {
  return isAuthorizedOwnerProfile(user, auth.currentUser);
}
