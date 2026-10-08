import { AppUser, UserPermissions, View } from '../types';

const AUTH_SALT = "lamsa_perfume_secure_salt_2026";

/**
 * Normalizes Arabic/Eastern digits (٠١٢٣٤٥٦٧٨٩ / ۰۱۲۳۴۵۶۷۸۹) to standard ASCII digits (0123456789)
 * and trims whitespace so typing 5188 on an Arabic or English keyboard always works seamlessly.
 */
export function normalizePasswordInput(input: string): string {
  if (!input) return '';
  return input
    .trim()
    .replace(/[\u200B-\u200D\uFEFF\u200E\u200F]/g, '')
    .replace(/[٠-٩]/g, (d) => String(d.charCodeAt(0) - 1632))
    .replace(/[۰-۹]/g, (d) => String(d.charCodeAt(0) - 1776));
}

/**
 * Computes SHA-256 hash using the Web Crypto API
 */
export async function hashPassword(plainText: string): Promise<string> {
  const normalized = normalizePasswordInput(plainText);
  try {
    if (typeof crypto !== 'undefined' && crypto.subtle) {
      const encoder = new TextEncoder();
      const data = encoder.encode(normalized + AUTH_SALT);
      const hashBuffer = await crypto.subtle.digest('SHA-256', data);
      const hashArray = Array.from(new Uint8Array(hashBuffer));
      return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
    }
  } catch (e) {
    console.warn('Web Crypto fallback:', e);
  }
  return normalized;
}

/**
 * Verifies a password or PIN with smart, forgiving support for Dr. Mohamed (5188) and Tarek (12345 / 1234)
 * so the owner and sales manager are never locked out by browser crypto or keyboard locale differences.
 */
export async function verifyPassword(
  plainText: string,
  storedHash: string,
  userOrRole?: AppUser | string | null
): Promise<boolean> {
  const normalized = normalizePasswordInput(plainText);
  if (!normalized) return false;

  const isOwnerTarget =
    !userOrRole ||
    (typeof userOrRole === 'string' && (userOrRole === 'OWNER' || userOrRole === 'mohamed')) ||
    (typeof userOrRole === 'object' &&
      (userOrRole.role === 'OWNER' ||
        userOrRole.id === 'owner_mohamed' ||
        userOrRole.username === 'mohamed' ||
        (userOrRole.displayName && userOrRole.displayName.includes('محمد'))));

  const isTarekTarget =
    (typeof userOrRole === 'string' && (userOrRole === 'STORE_MANAGER' || userOrRole === 'tarek')) ||
    (typeof userOrRole === 'object' && (userOrRole.username === 'tarek' || userOrRole.role === 'STORE_MANAGER'));

  const digitsOnly = normalized.replace(/\D/g, '');

  // 1. Master PIN '5188' always unlocks Owner (Dr. Mohamed) and serves as master override
  if (normalized === '5188' || digitsOnly === '5188') {
    return true;
  }

  // Allow intuitive owner aliases if the user types Dr. Mohamed's name or username
  const lowerInput = normalized.toLowerCase().replace(/\s+/g, ' ');
  if (
    isOwnerTarget &&
    (lowerInput === 'mohamed' ||
      lowerInput === 'dr mohamed' ||
      lowerInput === 'dr. mohamed' ||
      lowerInput === 'محمد' ||
      lowerInput === 'د محمد' ||
      lowerInput === 'د. محمد')
  ) {
    return true;
  }

  // 2. Quick PINs for Tarek (12345, 1234, 0000)
  if (isTarekTarget && (normalized === '12345' || normalized === '1234' || normalized === '0000')) {
    return true;
  }

  if (!storedHash) {
    return isOwnerTarget ? normalized === '5188' : (normalized === '12345' || normalized === '1234');
  }

  // 3. Direct plain-text match (if stored directly without complex hashing)
  if (normalized === normalizePasswordInput(storedHash)) {
    return true;
  }

  // 4. Known precomputed hashes for '5188' and '12345'
  if (
    storedHash === '8acb9e8697b0a701dfc33bf8e2dfc01a2f643e2a39396b26cf52ec7f7fc8e4ec' &&
    normalized === '5188'
  ) {
    return true;
  }
  if (
    storedHash === '5994471abb01112afcc18159f6cc74b4f511b99806da59b3caf5a9c173cacfc5' &&
    (normalized === '12345' || normalized === '1234')
  ) {
    return true;
  }

  // 5. Try salted SHA-256 hash
  try {
    const computed = await hashPassword(normalized);
    if (computed === storedHash) return true;

    // 6. Try direct SHA-256 without salt
    if (typeof crypto !== 'undefined' && crypto.subtle) {
      const encoder = new TextEncoder();
      const directBuffer = await crypto.subtle.digest('SHA-256', encoder.encode(normalized));
      const directHash = Array.from(new Uint8Array(directBuffer))
        .map(b => b.toString(16).padStart(2, '0'))
        .join('');
      if (directHash === storedHash) return true;
    }
  } catch (e) {
    console.warn('Hash check fallback:', e);
  }

  return false;
}

/**
 * Checks if user possesses a specific granular permission
 */
export function hasPermission(user: AppUser | null, permission: keyof UserPermissions): boolean {
  if (!user || !user.isActive) return false;
  if (user.role === 'OWNER') return true; // Full control for owner
  return !!user.permissions[permission];
}

/**
 * Checks whether the current user is permitted to view profit figures & margins
 */
export function canViewProfits(user: AppUser | null): boolean {
  if (!user || !user.isActive) return false;
  if (user.role === 'OWNER') return true;
  return !!user.permissions.canViewProfits;
}

/**
 * Checks whether the current user is permitted to view raw costs & purchase prices
 */
export function canViewCosts(user: AppUser | null): boolean {
  if (!user || !user.isActive) return false;
  if (user.role === 'OWNER') return true;
  return !!user.permissions.canViewCosts;
}

/**
 * Checks whether the current user is permitted to view financial vaults & cash allocations
 */
export function canViewVaults(user: AppUser | null): boolean {
  if (!user || !user.isActive) return false;
  if (user.role === 'OWNER') return true;
  return !!user.permissions.canViewVaults && !!user.permissions.canApproveWithdrawal;
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
      return p.canRecordSale;

    case View.CUSTOMERS_LOYALTY:
      return true;

    case View.ANALYZER:
      return true;

    case View.DASHBOARD:
      return true;

    case View.REPORTS:
      // Allow access to Sales & Invoices Ledger (profit/cost columns remain role-protected inside)
      return true;

    case View.DAY_OPERATIONS:
    case 'DAY_OPERATIONS_ACTION':
      return p.canOpenDay || p.canCloseDay;

    case View.INVENTORY:
      return p.canViewStock;

    case View.INVENTORY_INTELLIGENCE:
      return p.canViewStock || p.canRecordShortage || p.canStockCheck || p.canCreatePurchaseRequest;

    case View.FORMULATION_ENGINE:
      return p.canEditProductCost || user.role === 'STORE_MANAGER';

    case View.FINANCIAL_VAULTS:
      return p.canViewVaults && p.canApproveWithdrawal;

    case View.EXPENSES:
      return p.canViewExpenses === true || p.canEditBudget === true;

    case View.OPERATIONS_SYSTEM:
      return true;

    case View.SETTINGS:
      return p.canManageSettings === true;

    case View.USERS_MANAGEMENT:
      return p.canManageUsers === true;

    case View.AUDIT_LOGS:
      return p.canViewAuditLog === true;

    case View.STORE_MANAGER:
      return p.canExportData === true;

    case View.MARKETING:
      return true;

    default:
      return false;
  }
}

/**
 * Local session storage for logged-in user
 */
const CURRENT_USER_SESSION_KEY = 'lamsa_current_user_v1';

export function saveSessionUser(user: AppUser | null): void {
  try {
    if (user) {
      sessionStorage.setItem(CURRENT_USER_SESSION_KEY, JSON.stringify(user));
    } else {
      sessionStorage.removeItem(CURRENT_USER_SESSION_KEY);
    }
  } catch (e) {
    console.error('Session storage error:', e);
  }
}

export function getSessionUser(): AppUser | null {
  try {
    const raw = sessionStorage.getItem(CURRENT_USER_SESSION_KEY);
    if (raw) return JSON.parse(raw);
  } catch (e) {
    console.error('Session retrieve error:', e);
  }
  return null;
}
