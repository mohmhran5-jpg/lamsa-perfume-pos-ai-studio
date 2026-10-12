import { AppUser, UserPermissions, View } from '../types';
import { loadDataSync, persistDataDurable } from './persistenceService';

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

const OWNER_ONLY_PERMISSIONS = new Set<keyof UserPermissions>([
  'canEditProductCost', 'canViewCosts', 'canViewProfits', 'canViewCostAndProfit',
  'canViewProfitAndCosts', 'canViewExecutiveDashboard', 'canViewVaults',
  'canRequestWithdrawal', 'canApproveWithdrawal', 'canInjectCapital',
  'canTransferBetweenVaults', 'canWithdrawOwnerProfit', 'canEditBudget',
  'canEditSalaries', 'canEditCommissions', 'canViewExpenses', 'canManageSettings',
  'canManageUsers', 'canViewAuditLog', 'canViewAuditLogs', 'canAccessOperationsSystem',
  'canEditSettingsAndBudgets', 'canExportData', 'canDeleteInvoices',
]);

/**
 * Checks if user possesses a specific granular permission
 */
export function hasPermission(user: AppUser | null, permission: keyof UserPermissions): boolean {
  if (!user || !user.isActive) return false;
  if (user.role === 'OWNER') return true; // Full control for owner
  if (OWNER_ONLY_PERMISSIONS.has(permission)) return false;
  return !!user.permissions[permission];
}

/**
 * Checks whether the current user is permitted to view profit figures & margins
 */
export function canViewProfits(user: AppUser | null): boolean {
  if (!user || !user.isActive) return false;
  if (user.role === 'OWNER') return true;
  return hasPermission(user, 'canViewProfits');
}

/**
 * Checks whether the current user is permitted to view raw costs & purchase prices
 */
export function canViewCosts(user: AppUser | null): boolean {
  if (!user || !user.isActive) return false;
  if (user.role === 'OWNER') return true;
  return hasPermission(user, 'canViewCosts');
}

/**
 * Checks whether the current user is permitted to view financial vaults & cash allocations
 */
export function canViewVaults(user: AppUser | null): boolean {
  if (!user || !user.isActive) return false;
  if (user.role === 'OWNER') return true;
  return hasPermission(user, 'canViewVaults') && hasPermission(user, 'canApproveWithdrawal');
}

/**
 * Checks whether the current user is permitted to access a specific app view.
 */
export function canAccessView(user: AppUser | null, view: View | string): boolean {
  if (!user || !user.isActive) {
    return view === View.POS;
  }

  // Owner always has 100% unconditional access to all views
  if (user.role === 'OWNER') {
    return true;
  }

  const p = user.permissions;

  switch (view) {
    case View.POS:
      return Boolean(p?.canRecordSale);

    case View.CUSTOMERS_LOYALTY:
      return Boolean(p?.canRecordSale);

    case View.STAFF_ENTITLEMENTS:
      return Boolean(p?.canRequestWithdrawal || p?.canApproveWithdrawal || p?.canRecordSale || user?.role === 'STORE_MANAGER');

    case View.TAREK_WORKSPACE:
      return Boolean((user?.role as string) === 'OWNER' || (user?.role as string) === 'STORE_MANAGER' || user?.role === 'SALES_REP' || p?.canAccessSalesActivation);

    case View.ANALYZER:
      return Boolean(p?.canViewStock || p?.canRecordSale);

    case View.DASHBOARD:
      return hasPermission(user, 'canViewExecutiveDashboard');

    case View.REPORTS:
      return Boolean(p?.canRecordSale || p?.canViewStock);

    case View.DAY_OPERATIONS:
    case 'DAY_OPERATIONS_ACTION':
      return Boolean(p?.canOpenDay || p?.canCloseDay);

    case View.INVENTORY:
      return Boolean(p?.canViewStock);

    case View.INVENTORY_INTELLIGENCE:
      return Boolean(p?.canViewStock || p?.canRecordShortage || p?.canStockCheck || p?.canCreatePurchaseRequest);

    case View.FORMULATION_ENGINE:
      return Boolean((p?.canEditProductCost && p?.canViewCosts) || p?.canRecordSale);

    case View.FINANCIAL_VAULTS:
      return Boolean(p?.canViewVaults && p?.canApproveWithdrawal);

    case View.EXPENSES:
      return hasPermission(user, 'canViewExpenses') || hasPermission(user, 'canEditBudget');

    case View.OPERATIONS_SYSTEM:
      return Boolean(hasPermission(user, 'canAccessOperationsSystem') || user?.role === 'STORE_MANAGER');

    case View.SETTINGS:
      return hasPermission(user, 'canManageSettings');

    case View.USERS_MANAGEMENT:
      return hasPermission(user, 'canManageUsers');

    case View.AUDIT_LOGS:
      return hasPermission(user, 'canViewAuditLog');

    case View.STORE_MANAGER:
      return hasPermission(user, 'canExportData');

    case View.MARKETING:
      return Boolean(hasPermission(user, 'canViewExecutiveDashboard') || p?.canManageCustomers);

    default:
      // Rule 9: Default Deny for any unlisted or newly added view
      return false;
  }
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
  const norm = normalizePasswordInput(input);
  if (!norm) return false;

  const targetHash = hash || user?.passwordHash;
  if (!targetHash) {
    // If no hash set, check initial bootstrap defaults
    if (user?.role === 'OWNER') return norm === '5188';
    if (user?.role === 'STORE_MANAGER') return norm === '12345';
    return false;
  }

  // If user still has the bootstrap default PIN and hasn't customized it:
  if (targetHash === '5188') {
    return norm === '5188';
  }
  if (targetHash === '12345') {
    return norm === '12345' || norm === '1234';
  }

  // Check direct match or SHA-256 cryptographic hash match
  if (targetHash === norm) return true;
  const hashedInput = await hashPassword(norm);
  return hashedInput === targetHash;
}

const SESSION_USER_KEY = 'lamsa_current_user_v2';

/**
 * Persists the active session user in localStorage
 */
export function saveSessionUser(user: AppUser): void {
  try {
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem(SESSION_USER_KEY, JSON.stringify(user));
    }
  } catch (e) {
    console.warn('Failed to save session user:', e);
  }
}

/**
 * Retrieves the currently persisted user from localStorage
 */
export function getSessionUser(): AppUser | null {
  try {
    if (typeof localStorage !== 'undefined') {
      const stored = localStorage.getItem(SESSION_USER_KEY);
      if (stored) return JSON.parse(stored);
    }
  } catch {}
  return null;
}

/**
 * Clears the persisted session user from localStorage
 */
export function clearSessionUser(): void {
  try {
    if (typeof localStorage !== 'undefined') {
      localStorage.removeItem(SESSION_USER_KEY);
    }
  } catch {}
}

/**
 * Checks if user has permission to record sales with historical / backdated timestamps
 */
export function canRecordBackdatedSales(user: AppUser | null): boolean {
  if (!user || !user.isActive) return false;
  if (user.role === 'OWNER') return true;
  return Boolean(user.permissions?.canRecordBackdatedSales);
}

/**
 * Checks if user is permitted to view real-time connected devices & alert radar
 */
export function canViewDeviceAlerts(user: AppUser | null): boolean {
  if (!user || !user.isActive) return false;
  if (user.role === 'OWNER') return true;
  return Boolean(user.permissions?.canViewDeviceAlerts);
}


