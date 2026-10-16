export const OWNER_AUTH_EMAIL = 'moh.mhran@gmail.com';
export const TAREK_AUTH_EMAIL = 'ttaarreekkessam@gmail.com';

export interface FirebaseIdentityLike {
  email?: unknown;
  emailVerified?: unknown;
  isAnonymous?: unknown;
  signInProvider?: unknown;
}

export interface FirebaseRoleAssignmentLike {
  email?: unknown;
  role?: unknown;
  active?: unknown;
  updatedAt?: unknown;
  updatedBy?: unknown;
}

export type FirebaseAppRole = 'OWNER' | 'TAREK';
export type AssignedOperationalRole = 'INVENTORY_VIEWER' | 'STORE_MANAGER';

// This in-memory value is populated only after the authenticated user reads their
// own role document from Firestore. Security Rules independently enforce grants.
let currentFirebaseRoleAssignment: FirebaseRoleAssignmentLike | null = null;

export function setCurrentFirebaseRoleAssignment(
  assignment: FirebaseRoleAssignmentLike | null,
): void {
  currentFirebaseRoleAssignment = assignment;
}

export function clearCurrentFirebaseRoleAssignment(): void {
  currentFirebaseRoleAssignment = null;
}

export function getCurrentFirebaseRoleAssignment(): FirebaseRoleAssignmentLike | null {
  return currentFirebaseRoleAssignment;
}

/** Firebase identity, Google provider and verified email are all required. */
export function isVerifiedGoogleIdentity(identity: FirebaseIdentityLike | null | undefined): boolean {
  return Boolean(
    identity
      && identity.isAnonymous !== true
      && identity.emailVerified === true
      && identity.signInProvider === 'google.com'
      && typeof identity.email === 'string'
      && identity.email.trim().length > 0,
  );
}

/**
 * Root-owner access is fixed. Any other operational role requires an active,
 * owner-created assignment whose verified email matches the Firebase identity.
 */
export function resolveFirebaseAppRole(
  identity: FirebaseIdentityLike | null | undefined,
  assignment: FirebaseRoleAssignmentLike | null | undefined = currentFirebaseRoleAssignment,
): FirebaseAppRole | null {
  if (!isVerifiedGoogleIdentity(identity) || typeof identity?.email !== 'string') return null;
  const email = identity.email.trim().toLowerCase();
  if (email === OWNER_AUTH_EMAIL) return 'OWNER';

  if (assignment && typeof assignment.email === 'string'
    && assignment.email.trim().toLowerCase() === email) {
    return assignment.active === true
      && (assignment.role === 'INVENTORY_VIEWER' || assignment.role === 'STORE_MANAGER')
      ? 'TAREK'
      : null;
  }

  // Backward-compatible access for Tarek until an explicit owner grant/revocation exists.
  return email === TAREK_AUTH_EMAIL ? 'TAREK' : null;
}

export function isVerifiedOwnerIdentity(identity: FirebaseIdentityLike | null | undefined): boolean {
  return resolveFirebaseAppRole(identity) === 'OWNER';
}

export function isVerifiedTarekIdentity(
  identity: FirebaseIdentityLike | null | undefined,
  assignment?: FirebaseRoleAssignmentLike | null,
): boolean {
  return resolveFirebaseAppRole(identity, assignment) === 'TAREK';
}

export interface AppProfileLike {
  role?: unknown;
  isActive?: unknown;
}

/** A local profile can narrow access, but never substitute for Firebase identity. */
export function isAuthorizedOwnerProfile(
  profile: AppProfileLike | null | undefined,
  identity: FirebaseIdentityLike | null | undefined,
): boolean {
  return profile?.role === 'OWNER'
    && profile.isActive === true
    && isVerifiedOwnerIdentity(identity);
}

/** An operational profile is accepted only for a verified Google identity with an active role. */
export function isAuthorizedTarekProfile(
  profile: AppProfileLike | null | undefined,
  identity: FirebaseIdentityLike | null | undefined,
): boolean {
  return profile?.role === 'STORE_MANAGER'
    && profile.isActive === true
    && isVerifiedTarekIdentity(identity);
}

export function isAuthorizedOperationalProfile(
  profile: AppProfileLike | null | undefined,
  identity: FirebaseIdentityLike | null | undefined,
): boolean {
  return isAuthorizedOwnerProfile(profile, identity) || isAuthorizedTarekProfile(profile, identity);
}

/** Full raw-cost access remains owner-only; employee access is limited to operational cost projections. */
export function canAccessSeparatedCostData(
  profile: AppProfileLike | null | undefined,
  identity: FirebaseIdentityLike | null | undefined,
): boolean {
  return isAuthorizedOwnerProfile(profile, identity);
}

export function canAccessSeparatedOperationalCostData(
  profile: AppProfileLike | null | undefined,
  identity: FirebaseIdentityLike | null | undefined,
): boolean {
  return isAuthorizedOperationalProfile(profile, identity);
}
