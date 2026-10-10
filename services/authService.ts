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
  'canEditProductCost', 'canOverridePrice', 'canViewProfits', 'canViewCostAndProfit',
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
  const isTarekAccount = user.role === 'STORE_MANAGER'
    && (user.id === 'user-tarek' || user.id === 'sales_tarek' || user.username?.trim().toLowerCase() === 'tarek');
  return isTarekAccount && hasPermission(user, 'canViewCosts');
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
      return Boolean(p?.canEditProductCost && p?.canViewCosts);

    case View.FINANCIAL_VAULTS:
      return Boolean(p?.canViewVaults && p?.canApproveWithdrawal);

    case View.EXPENSES:
      return hasPermission(user, 'canViewExpenses') || hasPermission(user, 'canEditBudget');

    case View.OPERATIONS_SYSTEM:
      return hasPermission(user, 'canAccessOperationsSystem') && hasPermission(user, 'canEditBudget');

    case View.SETTINGS:
      return hasPermission(user, 'canManageSettings');

    case View.USERS_MANAGEMENT:
      return hasPermission(user, 'canManageUsers');

    case View.AUDIT_LOGS:
      return hasPermission(user, 'canViewAuditLog');

    case View.STORE_MANAGER:
      return hasPermission(user, 'canExportData');

    case View.MARKETING:
      return hasPermission(user, 'canViewExecutiveDashboard');

    default:
      // Rule 9: Default Deny for any unlisted or newly added view
      return false;
  }
}


// Compatibility-only legacy APIs: local PIN/passwords never authenticate or create sessions.
export function normalizePasswordInput(_value: string): string {
  return '';
}

export async function hashPassword(_value: string): Promise<string> {
  return '';
}

export async function verifyPassword(..._args: unknown[]): Promise<boolean> {
  return false;
}

export function saveSessionUser(_user: AppUser | null): void {
  // Firebase Google Auth is the sole session authority.
}

export function getSessionUser(): AppUser | null {
  return null;
}
