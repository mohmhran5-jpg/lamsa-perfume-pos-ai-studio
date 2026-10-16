import { initializeApp } from 'firebase/app';
import { 
  getFirestore, 
  connectFirestoreEmulator,
  setLogLevel,
  collection, 
  doc, 
  setDoc, 
  getDoc, 
  getDocs, 
  deleteDoc, 
  onSnapshot, 
  writeBatch,
  query,
  orderBy,
  limit,
  where,
  startAfter,
  documentId,
  getDocFromServer,
  getDocsFromServer,
  runTransaction,
} from 'firebase/firestore';
import {
  getAuth,
  connectAuthEmulator,
  getIdTokenResult,
  GoogleAuthProvider,
  getRedirectResult,
  onAuthStateChanged,
  signInWithPopup,
  signInWithRedirect,
  signOut,
  User,
  UserCredential,
} from 'firebase/auth';
import {
  clearCurrentFirebaseRoleAssignment,
  isVerifiedOwnerIdentity,
  isVerifiedGoogleIdentity,
  isVerifiedTarekIdentity,
  resolveFirebaseAppRole,
  setCurrentFirebaseRoleAssignment,
  type AssignedOperationalRole,
  type FirebaseRoleAssignmentLike,
  OWNER_AUTH_EMAIL,
  TAREK_AUTH_EMAIL,
} from './authPolicy';
import {
  commitSaleAndInventory,
  reverseSaleAndInventory,
} from './saleSync';
import firebaseConfig from '../firebase-applet-config.json';
import { 
  Product, 
  Sale, 
  Expense, 
  StoreSettings, 
  BottleSize, 
  FinancialVault, 
  WithdrawalTransaction, 
  StaffAttendanceRecord,
  ProductionBatch,
  AuditLogRecord,
  AppUser,
  DailyClosure,
  PurchaseRequest,
  CustomerRequest,
  StockCheckRecord,
  CustomCustomerRecord,
  SavedMixFormula,
  DEFAULT_USERS,
  ConnectedDeviceRecord,
  APP_SYSTEM_VERSION,
  OwnerStaffBroadcast
} from '../types';
import {
  projectBottleSizeFinancials,
  projectBottleSizeCosts,
  projectCostPolicySettings,
  projectFinancialAdminSettings,
  projectOperationalProduct,
  projectOperationalStoreSettings,
  projectProductCost,
  projectTarekProduct,
  projectTarekSaleBottleSize,
  projectTarekSaleProduct,
  SEPARATED_COLLECTIONS,
} from './separatedDataModel';

export type SnapshotFreshness = 'live' | 'cached' | 'pending' | 'error' | 'missing';

const getSnapshotFreshness = (snapshot: { metadata: { fromCache: boolean; hasPendingWrites: boolean } }): SnapshotFreshness => {
  if (snapshot.metadata.hasPendingWrites) return 'pending';
  if (snapshot.metadata.fromCache) return 'cached';
  return 'live';
};

const verifiedSnapshotOptions = { includeMetadataChanges: true } as const;

// Initialize Firebase App
const app = initializeApp(firebaseConfig);

// Initialize Auth
export const auth = getAuth(app);

// Suppress transient backend connectivity warnings per environment guidelines
try {
  setLogLevel('error');
} catch {
  // Ignored if unsupported
}

// Initialize Firestore strictly targeting the provisioned database as per Firebase skill mandate
export const db = getFirestore(app, firebaseConfig.firestoreDatabaseId); /* CRITICAL: The app will break without this line */

// Temporary local preview safety switch: never let a development preview reach production Firebase.
if (import.meta.env.DEV && import.meta.env.VITE_PREVIEW_SAFE_MODE === 'true') {
  connectAuthEmulator(auth, 'http://127.0.0.1:9099', { disableWarnings: true });
  connectFirestoreEmulator(db, '127.0.0.1', 8080);
}

let currentUser: User | null = null;

export interface EmailRoleAssignment extends FirebaseRoleAssignmentLike {
  email: string;
  role: AssignedOperationalRole;
  active: boolean;
  updatedAt: string;
  updatedBy: string;
  legacyAccess?: boolean;
}

export type OperationalAccessRequestStatus = 'pending' | 'approved' | 'dismissed';

export interface OperationalAccessRequest {
  email: string;
  requesterUid: string;
  displayName: string;
  requestedAt: string;
  status: OperationalAccessRequestStatus;
  reviewedAt?: string;
  reviewedBy?: string;
  grantedRole?: AssignedOperationalRole;
}

const getVerifiedFirebaseIdentity = async (user: User | null) => {
  if (!user || user.isAnonymous) {
    throw new Error('auth/owner-auth-required');
  }
  const token = await getIdTokenResult(user);
  const firebaseClaim = token.claims.firebase as { sign_in_provider?: unknown } | undefined;
  return {
    email: token.claims.email,
    emailVerified: token.claims.email_verified,
    isAnonymous: user.isAnonymous,
    signInProvider: firebaseClaim?.sign_in_provider,
  };
};

export const validateOwnerAuthUser = async (user: User | null): Promise<User> => {
  const identity = await getVerifiedFirebaseIdentity(user);
  if (!user || !isVerifiedOwnerIdentity(identity) || user.email?.trim().toLowerCase() !== OWNER_AUTH_EMAIL) {
    throw new Error('auth/owner-not-authorized');
  }
  return user;
};

export const validateTarekAuthUser = async (user: User | null): Promise<User> => {
  const authorized = await validateAuthorizedAuthUser(user);
  if (authorized.role !== 'TAREK') {
    throw new Error('auth/tarek-not-authorized');
  }
  setCurrentFirebaseRoleAssignment(authorized.roleAssignment);
  return authorized.user;
};

export const validateAuthorizedAuthUser = async (user: User | null) => {
  const identity = await getVerifiedFirebaseIdentity(user);
  let roleAssignment: FirebaseRoleAssignmentLike | null = null;
  if (!isVerifiedOwnerIdentity(identity) && typeof identity.email === 'string') {
    const normalizedEmail = identity.email.trim().toLowerCase();
    const roleSnapshot = await getDocFromServer(doc(db, 'role_assignments', normalizedEmail));
    if (roleSnapshot.exists()) {
      const data = roleSnapshot.data();
      roleAssignment = {
        email: typeof data.email === 'string' ? data.email : '',
        role: typeof data.role === 'string' ? data.role : '',
        active: data.active === true,
        updatedAt: typeof data.updatedAt === 'string' ? data.updatedAt : '',
        updatedBy: typeof data.updatedBy === 'string' ? data.updatedBy : '',
      };
    }
  }
  const role = resolveFirebaseAppRole(identity, roleAssignment);
  if (!user || !role) throw new Error('auth/account-not-authorized');
  return { user, role, roleAssignment } as const;
};

export const assertOwnerAuth = (): User => {
  const user = auth.currentUser;
  const hasGoogleProvider = Boolean(user?.providerData.some((provider) => provider.providerId === 'google.com'));
  if (!isVerifiedOwnerIdentity({
    email: user?.email,
    emailVerified: user?.emailVerified,
    isAnonymous: user?.isAnonymous,
    signInProvider: hasGoogleProvider ? 'google.com' : undefined,
  })) {
    throw new Error('auth/owner-auth-required');
  }
  return user;
};

export const assertTarekAuth = (): User => {
  const user = auth.currentUser;
  const hasGoogleProvider = Boolean(user?.providerData.some((provider) => provider.providerId === 'google.com'));
  if (!isVerifiedTarekIdentity({
    email: user?.email,
    emailVerified: user?.emailVerified,
    isAnonymous: user?.isAnonymous,
    signInProvider: hasGoogleProvider ? 'google.com' : undefined,
  })) {
    throw new Error('auth/tarek-auth-required');
  }
  return user;
};

const waitForAuthInitialization = (): Promise<User | null> => new Promise((resolve, reject) => {
  let unsubscribe = () => {};
  unsubscribe = onAuthStateChanged(
    auth,
    (user) => {
      unsubscribe();
      resolve(user);
    },
    (error) => {
      unsubscribe();
      reject(error);
    },
  );
});

/** Requires a real Firebase session whose signed ID-token claims identify the verified owner. */
export const requireOwnerAuth = async (): Promise<User> => {
  const user = auth.currentUser || await waitForAuthInitialization();
  return validateOwnerAuthUser(user);
};

/** Requires Tarek's verified Google identity; rules still restrict this session to safe projections. */
export const requireTarekAuth = async (): Promise<User> => {
  const user = auth.currentUser || await waitForAuthInitialization();
  return validateTarekAuthUser(user);
};

export const signInWithGoogle = async (): Promise<UserCredential | null> => {
  const provider = new GoogleAuthProvider();
  provider.setCustomParameters({ prompt: 'select_account' });
  try {
    return await signInWithPopup(auth, provider);
  } catch (error) {
    const code = (error as { code?: string })?.code;
    if (code === 'auth/popup-blocked' || code === 'auth/operation-not-supported-in-this-environment') {
      await signInWithRedirect(auth, provider);
      return null;
    }
    throw error;
  }
};

export const completeGoogleRedirectSignIn = (): Promise<UserCredential | null> => getRedirectResult(auth);
export const signOutFirebase = (): Promise<void> => {
  clearCurrentFirebaseRoleAssignment();
  return signOut(auth);
};

export const getFirebaseAuthErrorMessage = (error: unknown): string => {
  const authError = error as { code?: string; message?: string } | null;
  const code = authError?.code || authError?.message;
  if (code === 'auth/popup-closed-by-user') return 'أُغلقت نافذة Google قبل إكمال تسجيل الدخول.';
  if (code === 'auth/cancelled-popup-request') return 'أُلغيت محاولة تسجيل الدخول الحالية.';
  if (code === 'auth/network-request-failed' || code === 'unavailable') return 'تعذر الاتصال بخدمة المصادقة. تحقق من الشبكة ثم أعد المحاولة.';
  if (code === 'auth/unauthorized-domain') return 'هذا النطاق غير مضاف إلى النطاقات المصرح بها في Firebase Authentication.';
  if (code === 'auth/operation-not-allowed') return 'تسجيل الدخول باستخدام Google غير مفعّل في Firebase Authentication بعد.';
  if (code === 'auth/owner-not-authorized') return `هذا الحساب غير مخوّل. استخدم حساب المالك ${OWNER_AUTH_EMAIL}.`;
  if (code === 'auth/tarek-not-authorized') return `هذا الحساب غير مخوّل لدور طارق. يجب استخدام حساب Google الموثّق ${TAREK_AUTH_EMAIL}.`;
  if (code === 'auth/account-not-authorized') return 'هذا البريد لا يحمل منحة وصول نشطة؛ يمكنك طلب الوصول من شاشة الدخول، ولن تُمنح صلاحية حتى يراجع المالك الطلب.';
  if (code === 'auth/owner-auth-required') return 'يلزم تسجيل دخول Google بحساب المالك مع بريد موثّق.';
  if (code === 'auth/tarek-auth-required') return 'يلزم تسجيل دخول Google الموثّق بحساب طارق المعتمد.';
  if (code === 'auth/email-not-verified') return 'لم تؤكد Firebase أن البريد الإلكتروني موثّق.';
  if (code === 'access-request/not-applicable') return 'لا يمكن لهذا الحساب تقديم طلب وصول.';
  if (code === 'access-request/already-reviewed') return 'سبق أن راجع المالك هذا الطلب. تواصل معه لإعادة فتحه أو منح الصلاحية.';
  if (code === 'auth/user-disabled') return 'حساب Google هذا معطّل في Firebase Authentication.';
  return 'تعذر إكمال المصادقة. لم تُمنح أي صلاحية؛ أعد المحاولة بعد التحقق من الاتصال وإعدادات Firebase.';
};

export enum OperationType {
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  LIST = 'list',
  GET = 'get',
  WRITE = 'write',
}

export interface FirestoreErrorInfo {
  error: string;
  operationType: OperationType;
  path: string | null;
  authInfo: {
    userId?: string | null;
    email?: string | null;
    emailVerified?: boolean | null;
    isAnonymous?: boolean | null;
    tenantId?: string | null;
    providerInfo?: {
      providerId?: string | null;
      email?: string | null;
    }[];
  };
}

export function handleFirestoreError(
  error: unknown,
  operationType: OperationType,
  path: string | null,
) {
  const errMsg = error instanceof Error ? error.message : String(error);
  const errorCode = typeof error === 'object' && error !== null && 'code' in error
    ? String((error as { code?: unknown }).code || '')
    : '';

  const isTransientConnectionError = (
    errMsg.includes('unavailable') ||
    errMsg.includes('the client is offline') ||
    errMsg.includes('could not reach Cloud Firestore backend') ||
    errMsg.includes('Connection failed') ||
    errorCode === 'unavailable'
  );

  const errInfo: FirestoreErrorInfo = {
    error: errMsg,
    authInfo: {
      userId: auth.currentUser?.uid,
      email: auth.currentUser?.email,
      emailVerified: auth.currentUser?.emailVerified,
      isAnonymous: auth.currentUser?.isAnonymous,
      tenantId: auth.currentUser?.tenantId,
      providerInfo: auth.currentUser?.providerData?.map(provider => ({
        providerId: provider.providerId,
        email: provider.email,
      })) || []
    },
    operationType,
    path
  };

  const statusDetail = {
    code: errorCode,
    message: errMsg,
    operationType,
    path,
    transient: isTransientConnectionError,
  };
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent('lamsa-firestore-error', { detail: statusDetail }));
  }

  if (isTransientConnectionError) {
    console.warn(`[Firestore unavailable] Operation ${operationType} on ${path}: ${errMsg}`);
  } else {
    console.error('Firestore Error: ', JSON.stringify(errInfo));
  }

  // Listener errors are reported to the App status channel; write errors must reject.
  if (operationType === OperationType.GET) return;
  throw new Error(JSON.stringify(errInfo));
}

/**
 * Recursively strips keys with `undefined` values from objects or arrays.
 * Firestore throws: "Unsupported field value: undefined" if any field contains undefined.
 */
export function cleanForFirestore<T>(data: T): T {
  if (data === null || data === undefined) {
    return data;
  }
  if (Array.isArray(data)) {
    return data.map(item => cleanForFirestore(item)) as unknown as T;
  }
  if (typeof data === 'object') {
    const cleaned: Record<string, any> = {};
    for (const [key, value] of Object.entries(data)) {
      if (value !== undefined) {
        cleaned[key] = cleanForFirestore(value);
      }
    }
    return cleaned as T;
  }
  return data;
}

// Test initial connection safely with resilient offline-first fallback
export const testFirestoreConnection = async (): Promise<boolean> => {
  try {
    await requireOwnerAuth();
    await getDocFromServer(doc(db, 'settings', 'store'));
    return true;
  } catch (error) {
    handleFirestoreError(error, OperationType.GET, 'settings/store');
    return false;
  }
};

// Cross-tab / cross-window real-time synchronization channel
export const posRealtimeChannel = typeof window !== 'undefined' && 'BroadcastChannel' in window
  ? new BroadcastChannel('lamsa_pos_realtime_v1')
  : null;

// ========================================================
// REAL-TIME SALES SYNCHRONIZATION (Zero mock/fake sales)
// ========================================================

/**
 * Real-time listener for sales across all devices.
 * Distinguishes between initial load of historical sales and live new sales added in real-time.
 */
export const subscribeToSales = (
  onUpdate: (sales: Sale[], freshness?: SnapshotFreshness) => void,
  onLiveSaleAdded?: (newSale: Sale, isRemote: boolean) => void,
  onFreshness?: (freshness: SnapshotFreshness) => void
) => {
  assertOwnerAuth();
  const salesCol = collection(db, 'sales');
  const q = query(salesCol);
  const seenSaleIds = new Set<string>();
  let isInitialSnapshot = true;

  return onSnapshot(q, verifiedSnapshotOptions, (snapshot) => {
    const freshness = getSnapshotFreshness(snapshot);
    onFreshness?.(freshness);
    const list: Sale[] = [];
    snapshot.forEach((docSnap) => {
      const data = docSnap.data() as Sale;
      list.push({ ...data, id: docSnap.id });
    });
    // Sort newest first
    list.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
    onUpdate(list, freshness);

    // CRITICAL: Only trigger live alert for new documents added in real-time AFTER the initial load!
    // Historical/past sales are loaded silently without buzzing or alerting.
    if (isInitialSnapshot) {
      snapshot.forEach((docSnap) => seenSaleIds.add(docSnap.id));
      if (freshness === 'live') isInitialSnapshot = false;
    } else {
      snapshot.docChanges().forEach((change) => {
        if (change.type === 'added' && !seenSaleIds.has(change.doc.id)) {
          seenSaleIds.add(change.doc.id);
          const newSale = { ...(change.doc.data() as Sale), id: change.doc.id };
          const isRemote = !change.doc.metadata.hasPendingWrites;
          if (onLiveSaleAdded) {
            onLiveSaleAdded(newSale, isRemote);
          }
        }
      });
    }
  }, (err) => {
    onFreshness?.('error');
    handleFirestoreError(err, OperationType.GET, 'sales');
  });
};

export const addSaleCloud = async (sale: Sale) => {
  await requireOwnerAuth();
  // Read current remote stock and commit sale + deductions atomically. The
  // stable sale ID makes retry after an ambiguous response idempotent.
  await commitSaleAndInventory(db, sale);

  // Notify other local browser windows only after Firestore confirms the batch.
  if (posRealtimeChannel) {
    try {
      posRealtimeChannel.postMessage({ type: 'LIVE_SALE', sale, timestamp: Date.now() });
    } catch {}
  }
};

/** Invoice editing is disabled; corrections must use the immutable reversal record. */
export const updateSaleAndInventoryCloud = async (_sale: Sale, _adjustInventory = true): Promise<never> => {
  throw new Error('sale/edit-disabled-use-reversal');
};

export const deleteSaleCloud = async (_saleId: string): Promise<never> => {
  throw new Error('sale/permanent-delete-disabled');
};

export const deleteSaleAndRestoreInventoryCloud = async (
  _saleId: string,
  _restoreInventory = true,
  _fallbackCommissionRate = 0.05,
): Promise<never> => {
  throw new Error('sale/permanent-delete-disabled');
};

/**
 * Reverse a sale transaction instead of deleting it (Strict Non-deletion Financial Rule)
 */
export const reverseSaleCloud = async (
  sale: Sale, 
  reversalReason: string, 
  reversedBy: string,
  restoreInventory = true,
  fallbackCommissionRate = 0.05,
) => {
  await requireOwnerAuth();
  return reverseSaleAndInventory(db, sale.id, reversalReason, reversedBy, restoreInventory, fallbackCommissionRate);
};

export const clearAllSalesCloud = async (sales: Sale[]) => {
  void sales;
  throw new Error('sale/permanent-delete-disabled');
};

// ========================================================
// REAL-TIME PRODUCTS SYNCHRONIZATION
// ========================================================

let tarekOperationalCostsReadyForSession = false;
let tarekOperationalCostsBootstrapPromise: Promise<void> | null = null;

async function markTarekOperationalCostsBootstrapReady(productCount: number): Promise<void> {
  await setDoc(doc(db, SEPARATED_COLLECTIONS.tarekOperationalCostsMeta, 'v1'), {
    schemaVersion: 1,
    status: 'ready',
    productCount,
    updatedAt: new Date().toISOString(),
  });
}

/** Backfills the separate employee-safe cost projection once, after verified owner auth. */
export async function ensureTarekOperationalCostProjections(products: Product[]): Promise<void> {
  if (tarekOperationalCostsReadyForSession || products.length === 0) return;
  if (tarekOperationalCostsBootstrapPromise) return tarekOperationalCostsBootstrapPromise;

  const running = (async () => {
    await requireOwnerAuth();
    const markerRef = doc(db, SEPARATED_COLLECTIONS.tarekOperationalCostsMeta, 'v1');
    const marker = await getDocFromServer(markerRef);
    if (marker.exists() && marker.data().status === 'ready') {
      tarekOperationalCostsReadyForSession = true;
      return;
    }

    const chunkSize = 450;
    for (let offset = 0; offset < products.length; offset += chunkSize) {
      const batch = writeBatch(db);
      for (const product of products.slice(offset, offset + chunkSize)) {
        const id = String(product.id);
        if (!id.trim() || id.includes('/')) throw new Error('tarek-cost/invalid-product-id');
        batch.set(
          doc(db, SEPARATED_COLLECTIONS.tarekOperationalCosts, id),
          cleanForFirestore(projectProductCost(product)),
        );
      }
      await batch.commit();
    }
    await markTarekOperationalCostsBootstrapReady(products.length);
    tarekOperationalCostsReadyForSession = true;
  })();

  tarekOperationalCostsBootstrapPromise = running;
  try {
    await running;
  } finally {
    if (tarekOperationalCostsBootstrapPromise === running) tarekOperationalCostsBootstrapPromise = null;
  }
}

export const subscribeToProducts = (
  onUpdate: (products: Product[], freshness?: SnapshotFreshness) => void,
  seedIfEmpty?: Product[],
  onFreshness?: (freshness: SnapshotFreshness) => void
) => {
  assertOwnerAuth();
  const productsCol = collection(db, 'products');
  const stockProjectionCol = collection(db, SEPARATED_COLLECTIONS.tarekProducts);
  let baseProducts: Product[] = [];
  let productsLoaded = false;
  let productFreshness: SnapshotFreshness | null = null;
  let stockFreshness: SnapshotFreshness | null = null;
  let canonicalStocks = new Map<string, number>();
  const reportFreshness = () => {
    if (productFreshness === 'error' || stockFreshness === 'error') {
      onFreshness?.('error');
      return;
    }
    if (productFreshness === null || stockFreshness === null) return;
    onFreshness?.(
      productFreshness === 'pending' || stockFreshness === 'pending'
        ? 'pending'
        : productFreshness === 'cached' || stockFreshness === 'cached'
        ? 'cached'
        : 'live'
    );
  };
  const emitMergedProducts = () => {
    if (!productsLoaded || productFreshness === null || stockFreshness === null) return;
    const freshness: SnapshotFreshness =
      productFreshness === 'pending' || stockFreshness === 'pending'
        ? 'pending'
        : productFreshness === 'cached' || stockFreshness === 'cached'
        ? 'cached'
        : 'live';
    onUpdate(baseProducts.map((product) => {
      const canonicalStock = canonicalStocks.get(String(product.id));
      return canonicalStock === undefined ? product : { ...product, stock_grams: canonicalStock };
    }), freshness);
    reportFreshness();
  };

  const unsubscribeProducts = onSnapshot(productsCol, verifiedSnapshotOptions, async (snapshot) => {
    productFreshness = getSnapshotFreshness(snapshot);
    reportFreshness();
    if (snapshot.empty && seedIfEmpty && seedIfEmpty.length > 0) {
      // Seed initial perfume catalogue to cloud once if collection is empty
      try {
        await seedProductsCloud(seedIfEmpty);
        await markTarekOperationalCostsBootstrapReady(seedIfEmpty.length);
        tarekOperationalCostsReadyForSession = true;
      } catch (e) {
        console.error("Error seeding products:", e);
      }
      return;
    }

    const list: Product[] = [];
    snapshot.forEach((docSnap) => {
      const data = docSnap.data() as Product;
      list.push({ ...data, id: Number(docSnap.id) || data.id });
    });
    list.sort((a, b) => Number(a.id) - Number(b.id));
    baseProducts = list;
    if (productFreshness === 'live' && baseProducts.length > 0) {
      void ensureTarekOperationalCostProjections(baseProducts).catch((error) => {
        console.error('Error preparing the employee-safe product-cost projection:', error);
      });
    }
    productsLoaded = true;
    emitMergedProducts();
  }, (err) => {
    productFreshness = 'error';
    reportFreshness();
    handleFirestoreError(err, OperationType.GET, 'products');
  });
  const unsubscribeStock = onSnapshot(stockProjectionCol, verifiedSnapshotOptions, (snapshot) => {
    stockFreshness = getSnapshotFreshness(snapshot);
    reportFreshness();
    const next = new Map<string, number>();
    snapshot.forEach((docSnap) => {
      const stock = docSnap.data().stock_grams;
      if (typeof stock === 'number' && Number.isFinite(stock) && stock >= 0) next.set(docSnap.id, stock);
    });
    canonicalStocks = next;
    emitMergedProducts();
  }, (err) => {
    stockFreshness = 'error';
    reportFreshness();
    handleFirestoreError(err, OperationType.GET, SEPARATED_COLLECTIONS.tarekProducts);
  });
  return () => {
    unsubscribeProducts();
    unsubscribeStock();
  };
};

async function writeProductProjectionChunk(
  products: Product[],
  mergeLegacy: boolean,
  stockDeltas: Map<string, number> = new Map(),
): Promise<Product[]> {
  const prepared = products.map((product) => ({
    ...product,
    updatedAt: product.updatedAt || new Date().toISOString(),
  }));
  let savedProducts: Product[] = [];
  await runTransaction(db, async (transaction) => {
    const refs = prepared.map((product) => {
      const id = String(product.id).trim();
      if (!id || id.includes('/')) throw new Error('product/invalid-document-id');
      return {
        product,
        id,
        stockRef: doc(db, SEPARATED_COLLECTIONS.tarekProducts, id),
        operationRef: doc(db, SEPARATED_COLLECTIONS.productOperations, id),
      };
    });
    const stockSnapshots = await Promise.all(refs.map(({ stockRef }) => transaction.get(stockRef)));
    const operationSnapshots = await Promise.all(refs.map(({ operationRef }) => transaction.get(operationRef)));
    const nextSavedProducts: Product[] = [];

    for (let index = 0; index < refs.length; index += 1) {
      const { product, id, stockRef, operationRef } = refs[index];
      const stockSnapshot = stockSnapshots[index];
      const operationSnapshot = operationSnapshots[index];
      const hasCanonicalStock = stockSnapshot.exists() || operationSnapshot.exists();
      const currentStock = stockSnapshot.exists()
        ? stockSnapshot.data().stock_grams
        : operationSnapshot.exists() ? operationSnapshot.data().stock_grams : product.stock_grams;
      const stockDelta = stockDeltas.get(id) ?? 0;
      const nextStock = hasCanonicalStock ? Number(currentStock) + stockDelta : currentStock;
      if (typeof currentStock !== 'number' || !Number.isFinite(currentStock)
          || !Number.isFinite(stockDelta) || typeof nextStock !== 'number' || !Number.isFinite(nextStock) || nextStock < 0) {
        throw new Error(`product/invalid-canonical-stock:${id}`);
      }
      const synchronizedProduct = { ...product, stock_grams: nextStock };
      const productDocument = cleanForFirestore(synchronizedProduct);
      const legacyRef = doc(db, 'products', id);
      if (mergeLegacy) transaction.set(legacyRef, productDocument, { merge: true });
      else transaction.set(legacyRef, productDocument);
      transaction.set(operationRef, cleanForFirestore(projectOperationalProduct(synchronizedProduct)));
      transaction.set(doc(db, SEPARATED_COLLECTIONS.productCosts, id), cleanForFirestore(projectProductCost(synchronizedProduct)));
      transaction.set(doc(db, SEPARATED_COLLECTIONS.tarekOperationalCosts, id), cleanForFirestore(projectProductCost(synchronizedProduct)));
      transaction.set(stockRef, cleanForFirestore(projectTarekProduct(synchronizedProduct)));
      transaction.set(doc(db, SEPARATED_COLLECTIONS.tarekSaleProducts, id), cleanForFirestore(projectTarekSaleProduct(synchronizedProduct)));
      nextSavedProducts.push(synchronizedProduct);
    }
    savedProducts = nextSavedProducts;
  });
  return savedProducts;
}

export const seedProductsCloud = async (products: Product[], stockDeltas: Map<string, number> = new Map()) => {
  await requireOwnerAuth();
  // Six documents per product are written atomically; leave headroom under Firestore's 500-write cap.
  const chunkSize = 80;
  for (let i = 0; i < products.length; i += chunkSize) {
    await writeProductProjectionChunk(products.slice(i, i + chunkSize), false, stockDeltas);
  }
};

export const saveProductCloud = async (product: Product, stockDelta = 0) => {
  await requireOwnerAuth();
  const withTimestamp: Product = {
    ...product,
    updatedAt: new Date().toISOString(),
  };
  const [synchronizedProduct] = await writeProductProjectionChunk(
    [withTimestamp],
    true,
    new Map([[String(product.id), stockDelta]]),
  );

  if (posRealtimeChannel) {
    try {
      posRealtimeChannel.postMessage({
        type: 'PRODUCT_UPDATE',
        product: synchronizedProduct,
        timestamp: Date.now()
      });
    } catch {}
  }
};

export const deleteProductCloud = async (productId: number | string) => {
  await requireOwnerAuth();
  const id = String(productId);
  const batch = writeBatch(db);
  batch.delete(doc(db, 'products', id));
  batch.delete(doc(db, SEPARATED_COLLECTIONS.productOperations, id));
  batch.delete(doc(db, SEPARATED_COLLECTIONS.productCosts, id));
  batch.delete(doc(db, SEPARATED_COLLECTIONS.tarekProducts, id));
  batch.delete(doc(db, SEPARATED_COLLECTIONS.tarekSaleProducts, id));
  await batch.commit();

  if (posRealtimeChannel) {
    try {
      posRealtimeChannel.postMessage({
        type: 'PRODUCT_DELETE',
        productId,
        timestamp: Date.now()
      });
    } catch {}
  }
};

// ========================================================
// REAL-TIME EXPENSES SYNCHRONIZATION
// ========================================================

export const subscribeToExpenses = (
  onUpdate: (expenses: Expense[], freshness?: SnapshotFreshness) => void,
  seedIfEmpty?: Expense[],
  onFreshness?: (freshness: SnapshotFreshness) => void
) => {
  assertOwnerAuth();
  const expensesCol = collection(db, 'expenses');

  return onSnapshot(expensesCol, verifiedSnapshotOptions, async (snapshot) => {
    const freshness = getSnapshotFreshness(snapshot);
    onFreshness?.(freshness);
    if (snapshot.empty && seedIfEmpty && seedIfEmpty.length > 0) {
      try {
        const batch = writeBatch(db);
        seedIfEmpty.forEach((e) => {
          const eRef = doc(db, 'expenses', e.id);
          batch.set(eRef, cleanForFirestore(e));
        });
        await batch.commit();
      } catch (e) {
        console.error("Error seeding initial expenses:", e);
      }
      return;
    }

    const list: Expense[] = [];
    snapshot.forEach((docSnap) => {
      const data = docSnap.data() as Expense;
      list.push({ ...data, id: docSnap.id });
    });
    list.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
    onUpdate(list, freshness);
  }, (err) => {
    onFreshness?.('error');
    handleFirestoreError(err, OperationType.GET, 'expenses');
  });
};

export const saveExpenseCloud = async (expense: Expense) => {
  await requireOwnerAuth();
  const withTimestamp: Expense = {
    ...expense,
    updatedAt: new Date().toISOString(),
  };
  await setDoc(doc(db, 'expenses', expense.id), cleanForFirestore(withTimestamp), { merge: true });

  if (posRealtimeChannel) {
    try {
      posRealtimeChannel.postMessage({
        type: 'EXPENSE_UPDATE',
        expense: withTimestamp,
        timestamp: Date.now()
      });
    } catch {}
  }
};

export const deleteExpenseCloud = async (expenseId: string) => {
  await requireOwnerAuth();
  await deleteDoc(doc(db, 'expenses', expenseId));

  if (posRealtimeChannel) {
    try {
      posRealtimeChannel.postMessage({
        type: 'EXPENSE_DELETE',
        expenseId,
        timestamp: Date.now()
      });
    } catch {}
  }
};

// ========================================================
// REAL-TIME SETTINGS SYNCHRONIZATION
// ========================================================

export const subscribeToSettings = (
  onUpdate: (
    settings: StoreSettings,
    freshness?: SnapshotFreshness,
    rawSettings?: Partial<StoreSettings> | null
  ) => void,
  initialFallback: StoreSettings,
  onFreshness?: (freshness: SnapshotFreshness) => void
) => {
  assertOwnerAuth();
  const settingsDocRef = doc(db, 'settings', 'store');

  return onSnapshot(settingsDocRef, verifiedSnapshotOptions, (docSnap) => {
    const snapshotFreshness = getSnapshotFreshness(docSnap);
    if (!docSnap.exists()) {
      const freshness = snapshotFreshness === 'live' ? 'missing' : snapshotFreshness;
      onFreshness?.(freshness);
      onUpdate(initialFallback, freshness, null);
      return;
    }

    const data = docSnap.data() as Partial<StoreSettings>;
    const merged: StoreSettings = {
      ...initialFallback,
      ...data,
      storeName: data.storeName !== undefined ? data.storeName : initialFallback.storeName,
      storeSlogan: data.storeSlogan !== undefined ? data.storeSlogan : initialFallback.storeSlogan,
      currency: data.currency !== undefined ? data.currency : initialFallback.currency,
      storePhone: data.storePhone !== undefined ? data.storePhone : initialFallback.storePhone,
      storeAddress: data.storeAddress !== undefined ? data.storeAddress : initialFallback.storeAddress,
      logoUrl: data.logoUrl !== undefined ? data.logoUrl : initialFallback.logoUrl,
      activeThemeId: data.activeThemeId || initialFallback.activeThemeId,
      themeContrastLevel: data.themeContrastLevel || initialFallback.themeContrastLevel,
      themeSurfaceStyle: data.themeSurfaceStyle || initialFallback.themeSurfaceStyle,
      siteFontFamily: data.siteFontFamily || initialFallback.siteFontFamily,
      siteFontSizePercent: data.siteFontSizePercent ?? initialFallback.siteFontSizePercent,
      siteFontWeight: data.siteFontWeight || initialFallback.siteFontWeight,
      siteFontStrokeWidth: data.siteFontStrokeWidth || initialFallback.siteFontStrokeWidth,
      sitePrimaryTextColor: data.sitePrimaryTextColor ?? initialFallback.sitePrimaryTextColor,
      siteSecondaryTextColor: data.siteSecondaryTextColor ?? initialFallback.siteSecondaryTextColor,
      siteHeadingColorMode: data.siteHeadingColorMode || initialFallback.siteHeadingColorMode,
      siteHeadingCustomColor: data.siteHeadingCustomColor ?? initialFallback.siteHeadingCustomColor,
      siteNumeralSystem: data.siteNumeralSystem || initialFallback.siteNumeralSystem,
    };
    onFreshness?.(snapshotFreshness);
    onUpdate(merged, snapshotFreshness, data);
  }, (err) => {
    onFreshness?.('error');
    handleFirestoreError(err, OperationType.GET, 'settings/store');
  });
};

async function writeStoreProjectionBundle(
  settingsInput: StoreSettings | null,
  bottleSizeOverride?: BottleSize[],
): Promise<StoreSettings> {
  await requireOwnerAuth();
  const settingsRef = doc(db, 'settings', 'store');
  const [legacyBottleSnapshot, saleBottleSnapshot] = await Promise.all([
    getDocsFromServer(collection(db, 'bottleSizes')),
    getDocsFromServer(collection(db, SEPARATED_COLLECTIONS.tarekSaleBottleSizes)),
  ]);
  let savedSettings: StoreSettings | null = null;
  await runTransaction(db, async (transaction) => {
    const settingsSnapshot = await transaction.get(settingsRef);
    const storedSettings = settingsSnapshot.exists() ? settingsSnapshot.data() as StoreSettings : null;
    const baseSettings = settingsInput ?? storedSettings;
    if (!baseSettings) throw new Error('settings/store-missing; refusing to invent sale policy');

    if (legacyBottleSnapshot.size > 100 || saleBottleSnapshot.size > 100) {
      throw new Error('bottle-size-catalog/existing-over-100-items');
    }
    const candidateIds = new Set([
      ...legacyBottleSnapshot.docs.map((snapshot) => snapshot.id),
      ...saleBottleSnapshot.docs.map((snapshot) => snapshot.id),
      ...(storedSettings?.bottleSizes ?? []).map((bottle) => String(bottle.id)),
      ...(settingsInput?.bottleSizes ?? []).map((bottle) => String(bottle.id)),
    ].filter((id) => id.trim() && !id.includes('/')));
    if (candidateIds.size > 200) throw new Error('bottle-size-catalog/too-many-stale-ids');
    const candidateIdList = [...candidateIds];
    const legacyRefs = candidateIdList.map((id) => doc(db, 'bottleSizes', id));
    const saleRefs = candidateIdList.map((id) => doc(db, SEPARATED_COLLECTIONS.tarekSaleBottleSizes, id));
    const [legacySnapshots, saleSnapshots] = await Promise.all([
      Promise.all(legacyRefs.map((ref) => transaction.get(ref))),
      Promise.all(saleRefs.map((ref) => transaction.get(ref))),
    ]);
    const legacyBottleSizes = legacySnapshots.flatMap((snapshot, index) => snapshot.exists()
      ? [{ ...snapshot.data(), id: candidateIdList[index] } as BottleSize]
      : []);
    const bottleSizes = bottleSizeOverride
      ?? (legacyBottleSizes.length > 0 ? legacyBottleSizes : storedSettings?.bottleSizes ?? settingsInput?.bottleSizes ?? []);
    if (bottleSizes.length > 100) throw new Error('bottle-size-catalog/over-100-items');
    const bottleIds = new Set<string>();
    for (const bottle of bottleSizes) {
      const id = String(bottle.id).trim();
      if (!id || id.includes('/') || bottleIds.has(id)) throw new Error('bottle-size-catalog/invalid-or-duplicate-id');
      bottleIds.add(id);
    }

    const nextSettings: StoreSettings = {
      ...baseSettings,
      bottleSizes,
      updatedAt: new Date().toISOString(),
    };
    transaction.set(settingsRef, cleanForFirestore(nextSettings), { merge: true });
    transaction.set(
      doc(db, SEPARATED_COLLECTIONS.operationalSettings, 'store'),
      cleanForFirestore(projectOperationalStoreSettings(nextSettings)),
    );
    transaction.set(
      doc(db, SEPARATED_COLLECTIONS.costCatalog, 'store-cost-inputs'),
      cleanForFirestore({
        schemaVersion: 1,
        costPolicy: projectCostPolicySettings(nextSettings),
        bottleSizes: bottleSizes.map(projectBottleSizeCosts),
      }),
    );
    transaction.set(
      doc(db, SEPARATED_COLLECTIONS.financialAdmin, 'store'),
      cleanForFirestore({
        schemaVersion: 1,
        settings: projectFinancialAdminSettings(nextSettings),
        bottleSizeMargins: bottleSizes.map(projectBottleSizeFinancials),
      }),
    );

    for (const bottle of bottleSizes) {
      const id = String(bottle.id);
      transaction.set(doc(db, 'bottleSizes', id), cleanForFirestore(bottle));
      transaction.set(
        doc(db, SEPARATED_COLLECTIONS.tarekSaleBottleSizes, id),
        cleanForFirestore(projectTarekSaleBottleSize(bottle)),
      );
    }
    const obsoleteIds = candidateIdList.filter((id) => !bottleIds.has(id));
    const obsoleteWrites = obsoleteIds.reduce((count, id) => {
      const index = candidateIdList.indexOf(id);
      return count + Number(legacySnapshots[index].exists()) + Number(saleSnapshots[index].exists());
    }, 0);
    if (4 + bottleSizes.length * 2 + obsoleteWrites > 500) {
      throw new Error('bottle-size-catalog/transaction-write-limit');
    }
    for (const id of obsoleteIds) {
      const index = candidateIdList.indexOf(id);
      if (legacySnapshots[index].exists()) transaction.delete(legacyRefs[index]);
      if (saleSnapshots[index].exists()) transaction.delete(saleRefs[index]);
    }
    savedSettings = nextSettings;
  });
  if (!savedSettings) throw new Error('settings/projection-transaction-failed');
  return savedSettings;
}

export const saveSettingsCloud = async (settings: StoreSettings) => {
  const withTimestamp = await writeStoreProjectionBundle(settings);

  if (posRealtimeChannel) {
    try {
      posRealtimeChannel.postMessage({
        type: 'SETTINGS_UPDATE',
        settings: withTimestamp,
        timestamp: Date.now()
      });
    } catch {}
  }
};

// ========================================================
// REAL-TIME BOTTLE SIZES SYNCHRONIZATION
// ========================================================

export const subscribeToBottleSizes = (
  onUpdate: (sizes: BottleSize[]) => void,
  initialFallback: BottleSize[]
) => {
  assertOwnerAuth();
  const bottleSizesCol = collection(db, 'bottleSizes');

  return onSnapshot(bottleSizesCol, async (snapshot) => {
    if (snapshot.empty && initialFallback && initialFallback.length > 0) {
      try {
        await saveBottleSizesCloud(initialFallback);
      } catch (e) {
        console.error("Error seeding bottle sizes:", e);
      }
      return;
    }

    const list: BottleSize[] = [];
    snapshot.forEach((docSnap) => {
      const data = docSnap.data() as BottleSize;
      list.push({ ...data, id: docSnap.id });
    });
    list.sort((a, b) => b.sizeMl - a.sizeMl);
    if (list.length > 0) {
      onUpdate(list);
    }
  }, (err) => {
    handleFirestoreError(err, OperationType.GET, 'bottleSizes');
  });
};

export const saveBottleSizesCloud = async (sizes: BottleSize[]) => {
  await writeStoreProjectionBundle(null, sizes);

  if (posRealtimeChannel) {
    try {
      posRealtimeChannel.postMessage({
        type: 'BOTTLE_SIZES_UPDATE',
        sizes,
        timestamp: Date.now()
      });
    } catch {}
  }
};

// ========================================================
// REAL-TIME FINANCIAL VAULTS & WITHDRAWALS SYNCHRONIZATION
// ========================================================

export const subscribeToVaults = (
  onUpdate: (vaults: FinancialVault[], freshness?: SnapshotFreshness) => void,
  initialFallback?: FinancialVault[],
  onFreshness?: (freshness: SnapshotFreshness) => void
) => {
  assertOwnerAuth();
  const vaultsCol = collection(db, 'vaults');

  return onSnapshot(vaultsCol, verifiedSnapshotOptions, async (snapshot) => {
    const freshness = getSnapshotFreshness(snapshot);
    onFreshness?.(freshness);
    if (snapshot.empty && initialFallback && initialFallback.length > 0) {
      try {
        const batch = writeBatch(db);
        initialFallback.forEach((v) => {
          const vRef = doc(db, 'vaults', v.id);
          batch.set(vRef, cleanForFirestore(v));
        });
        await batch.commit();
      } catch (e) {
        console.error("Error seeding financial vaults:", e);
      }
      return;
    }

    const list: FinancialVault[] = [];
    snapshot.forEach((docSnap) => {
      list.push(docSnap.data() as FinancialVault);
    });
    onUpdate(list, freshness);
  }, (err) => {
    onFreshness?.('error');
    handleFirestoreError(err, OperationType.GET, 'vaults');
  });
};

export const saveVaultCloud = async (vault: FinancialVault) => {
  await requireOwnerAuth();
  await setDoc(doc(db, 'vaults', vault.id), cleanForFirestore(vault), { merge: true });
};

export const saveAllVaultsCloud = async (vaults: FinancialVault[]) => {
  await requireOwnerAuth();
  const batch = writeBatch(db);
  vaults.forEach((v) => {
    const vRef = doc(db, 'vaults', v.id);
    batch.set(vRef, cleanForFirestore(v));
  });
  await batch.commit();
};

export const subscribeToWithdrawals = (
  onUpdate: (withdrawals: WithdrawalTransaction[], freshness?: SnapshotFreshness) => void,
  onFreshness?: (freshness: SnapshotFreshness) => void
) => {
  assertOwnerAuth();
  const withdrawalsCol = collection(db, 'withdrawals');
  const q = query(withdrawalsCol);

  return onSnapshot(q, verifiedSnapshotOptions, (snapshot) => {
    const freshness = getSnapshotFreshness(snapshot);
    onFreshness?.(freshness);
    const list: WithdrawalTransaction[] = [];
    snapshot.forEach((docSnap) => {
      list.push({ ...docSnap.data(), id: docSnap.id } as WithdrawalTransaction);
    });
    list.sort((a, b) => new Date(b.date || 0).getTime() - new Date(a.date || 0).getTime());
    onUpdate(list, freshness);
  }, (err) => {
    onFreshness?.('error');
    handleFirestoreError(err, OperationType.GET, 'withdrawals');
  });
};

export const addWithdrawalCloud = async (
  tx: WithdrawalTransaction,
  updatedVault?: FinancialVault
) => {
  await requireOwnerAuth();
  const batch = writeBatch(db);
  const txRef = doc(db, 'withdrawals', tx.id);
  batch.set(txRef, cleanForFirestore(tx));
  if (updatedVault) {
    const vRef = doc(db, 'vaults', updatedVault.id);
    batch.set(vRef, cleanForFirestore(updatedVault), { merge: true });
  }
  await batch.commit();
};

// ========================================================
// 8. STAFF ATTENDANCE & SHIFT OPENING (حضور وفتح المتجر)
// ========================================================
export const subscribeToStaffAttendance = (
  onUpdate: (records: StaffAttendanceRecord[]) => void
) => {
  assertOwnerAuth();
  const attCol = collection(db, 'staff_attendance');
  const q = query(attCol);

  return onSnapshot(q, (snapshot) => {
    const list: StaffAttendanceRecord[] = [];
    snapshot.forEach((docSnap) => {
      list.push({ ...docSnap.data(), id: docSnap.id } as StaffAttendanceRecord);
    });
    list.sort((a, b) => new Date(b.date || 0).getTime() - new Date(a.date || 0).getTime());
    onUpdate(list);
  }, (err) => {
    handleFirestoreError(err, OperationType.GET, 'staff_attendance');
  });
};

export const saveStaffAttendanceCloud = async (record: StaffAttendanceRecord) => {
  await requireOwnerAuth();
  const docRef = doc(db, 'staff_attendance', record.id);
  await setDoc(docRef, cleanForFirestore(record), { merge: true });
};

// ========================================================
// 9. PRODUCTION BATCHES (إدارة دفعات الإنتاج والتشغيل)
// ========================================================
export const subscribeToProductionBatches = (
  onUpdate: (batches: ProductionBatch[]) => void
) => {
  assertOwnerAuth();
  const batchesCol = collection(db, 'production_batches');
  const q = query(batchesCol);

  return onSnapshot(q, (snapshot) => {
    const list: ProductionBatch[] = [];
    snapshot.forEach((docSnap) => {
      list.push({ ...docSnap.data(), id: docSnap.id } as ProductionBatch);
    });
    list.sort((a, b) => new Date(b.date || 0).getTime() - new Date(a.date || 0).getTime());
    onUpdate(list);
  }, (err) => {
    handleFirestoreError(err, OperationType.GET, 'production_batches');
  });
};

export const saveProductionBatchCloud = async (batchRecord: ProductionBatch) => {
  await requireOwnerAuth();
  const docRef = doc(db, 'production_batches', batchRecord.id);
  await setDoc(docRef, cleanForFirestore(batchRecord), { merge: true });
};

// ========================================================
// 10. IMMUTABLE AUDIT LOG (سجل التغييرات غير القابل للحذف)
// ========================================================
const AUDIT_LOG_PAGE_SIZE = 100;

export interface AuditLogPageCursor {
  timestamp: string;
  id: string;
}

export interface AuditLogPage {
  records: AuditLogRecord[];
  nextCursor: AuditLogPageCursor | null;
  hasMore: boolean;
}

const AUDIT_OPERATING_TIME_ZONE = 'Africa/Cairo';
const auditOperatingDateFormatter = new Intl.DateTimeFormat('en-CA', {
  timeZone: AUDIT_OPERATING_TIME_ZONE,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
});

const getAuditOperatingDateKey = (instant: Date = new Date()): string => {
  const parts = auditOperatingDateFormatter.formatToParts(instant);
  const year = parts.find((part) => part.type === 'year')?.value || '0000';
  const month = parts.find((part) => part.type === 'month')?.value || '01';
  const day = parts.find((part) => part.type === 'day')?.value || '01';
  return `${year}-${month}-${day}`;
};

const getNextAuditOperatingDateKey = (dateKey: string): string => {
  const [year, month, day] = dateKey.split('-').map(Number);
  return new Date(Date.UTC(year, month - 1, day + 1)).toISOString().slice(0, 10);
};

const getUtcIsoAtAuditOperatingDayStart = (dateKey: string): string => {
  const [year, month, day] = dateKey.split('-').map(Number);
  const nominalUtcMidnight = Date.UTC(year, month - 1, day);
  // Search around nominal UTC midnight for the first instant whose Cairo
  // calendar date is dateKey. This handles Cairo's UTC+2/+3 offset and DST.
  let before = nominalUtcMidnight - 36 * 60 * 60 * 1000;
  let after = nominalUtcMidnight + 36 * 60 * 60 * 1000;
  while (after - before > 1) {
    const midpoint = Math.floor((before + after) / 2);
    if (getAuditOperatingDateKey(new Date(midpoint)) >= dateKey) {
      after = midpoint;
    } else {
      before = midpoint;
    }
  }
  return new Date(after).toISOString();
};

export const subscribeToTodaysAuditLogs = (
  onUpdate: (logs: AuditLogRecord[]) => void
) => {
  assertOwnerAuth();
  const logsCol = collection(db, 'audit_logs');
  const attachCurrentOperatingDayListener = () => {
    const operatingDateKey = getAuditOperatingDateKey();
    const operatingDayStartUtc = getUtcIsoAtAuditOperatingDayStart(operatingDateKey);
    const q = query(logsCol, where('timestamp', '>=', operatingDayStartUtc), orderBy('timestamp', 'desc'));

    return onSnapshot(q, (snapshot) => {
      const list = snapshot.docs.map((docSnap) => ({
        ...docSnap.data(),
        id: docSnap.id,
      } as AuditLogRecord));
      onUpdate(list);
    }, (err) => {
      handleFirestoreError(err, OperationType.GET, 'audit_logs');
    });
  };

  let unsubscribe = attachCurrentOperatingDayListener();
  let midnightTimer: ReturnType<typeof setTimeout> | undefined;
  const scheduleOperatingMidnightRefresh = () => {
    const currentOperatingDate = getAuditOperatingDateKey();
    const nextOperatingDate = getNextAuditOperatingDateKey(currentOperatingDate);
    const nextOperatingMidnightUtc = Date.parse(getUtcIsoAtAuditOperatingDayStart(nextOperatingDate));
    midnightTimer = setTimeout(() => {
      unsubscribe();
      unsubscribe = attachCurrentOperatingDayListener();
      scheduleOperatingMidnightRefresh();
    }, Math.max(1000, nextOperatingMidnightUtc - Date.now() + 250));
  };
  scheduleOperatingMidnightRefresh();

  return () => {
    if (midnightTimer) clearTimeout(midnightTimer);
    unsubscribe();
  };
};

export const loadAuditLogsPage = async (
  cursor: AuditLogPageCursor | null = null
): Promise<AuditLogPage> => {
  await requireOwnerAuth();
  const logsCol = collection(db, 'audit_logs');
  const q = cursor
    ? query(
        logsCol,
        orderBy('timestamp', 'desc'),
        orderBy(documentId(), 'desc'),
        startAfter(cursor.timestamp, cursor.id),
        limit(AUDIT_LOG_PAGE_SIZE)
      )
    : query(
        logsCol,
        orderBy('timestamp', 'desc'),
        orderBy(documentId(), 'desc'),
        limit(AUDIT_LOG_PAGE_SIZE)
      );
  const snapshot = await getDocs(q);
  const records = snapshot.docs.map((docSnap) => ({
    ...docSnap.data(),
    id: docSnap.id,
  } as AuditLogRecord));
  const lastDoc = snapshot.docs.at(-1);
  const lastTimestamp = lastDoc?.get('timestamp');

  return {
    records,
    nextCursor: lastDoc
      ? { timestamp: typeof lastTimestamp === 'string' ? lastTimestamp : String(lastTimestamp ?? ''), id: lastDoc.id }
      : cursor,
    hasMore: snapshot.docs.length === AUDIT_LOG_PAGE_SIZE,
  };
};

export const addAuditLogCloud = async (logRecord: AuditLogRecord) => {
  await requireOwnerAuth();
  const docRef = doc(db, 'audit_logs', logRecord.id);
  await setDoc(docRef, cleanForFirestore(logRecord), { merge: true });
};

// ========================================================
// 11. USERS & RBAC PERMISSIONS (إدارة المستخدمين والصلاحيات)
// ========================================================

export const subscribeToAppUsers = (
  onUpdate: (users: AppUser[]) => void,
  seedIfEmpty?: AppUser[]
) => {
  assertOwnerAuth();
  const usersCol = collection(db, 'app_users');
  return onSnapshot(usersCol, async (snapshot) => {
    if (snapshot.empty && seedIfEmpty && seedIfEmpty.length > 0) {
      try {
        await seedInitialUsersCloud(seedIfEmpty);
      } catch (e) {
        console.error("Error seeding initial users:", e);
      }
      return;
    }
    const list: AppUser[] = [];
    snapshot.forEach((docSnap) => {
      list.push({ ...docSnap.data(), id: docSnap.id } as AppUser);
    });
    onUpdate(list);
  }, (err) => {
    handleFirestoreError(err, OperationType.GET, 'app_users');
  });
};

export const saveAppUserCloud = async (user: AppUser) => {
  await requireOwnerAuth();
  const docRef = doc(db, 'app_users', user.id);
  await setDoc(docRef, cleanForFirestore(user), { merge: true });
};

export const seedInitialUsersCloud = async (users: AppUser[]) => {
  await requireOwnerAuth();
  const batch = writeBatch(db);
  users.forEach((u) => {
    const docRef = doc(db, 'app_users', u.id);
    batch.set(docRef, cleanForFirestore(u), { merge: true });
  });
  await batch.commit();
};

const normalizeRoleEmail = (emailInput: string): string => {
  const email = emailInput.trim().toLowerCase();
  if (!/^[^\s@/]+@[^\s@/]+\.[^\s@/]+$/.test(email)) {
    throw new Error('أدخل بريداً إلكترونياً صالحاً.');
  }
  if (email === OWNER_AUTH_EMAIL) {
    throw new Error('حساب المالك الأساسي لا يحتاج إلى منحة، ولا يمكن إيقافه من هذه الشاشة.');
  }
  return email;
};

export const subscribeToEmailRoleAssignments = (
  onUpdate: (assignments: EmailRoleAssignment[]) => void,
  onError: (error: Error) => void,
) => {
  assertOwnerAuth();
  return onSnapshot(collection(db, 'role_assignments'), (snapshot) => {
    const assignments = snapshot.docs.map((item) => ({
      ...item.data(),
      email: item.id,
    }) as EmailRoleAssignment);
    assignments.sort((a, b) => a.email.localeCompare(b.email));
    onUpdate(assignments);
  }, (reason) => onError(reason instanceof Error ? reason : new Error('تعذر تحميل منح الصلاحيات.')));
};

/** A verified Google user may request review, but this never creates a role grant. */
export const submitOperationalAccessRequestCloud = async (): Promise<OperationalAccessRequest> => {
  const user = auth.currentUser;
  const identity = await getVerifiedFirebaseIdentity(user);
  if (!user || !isVerifiedGoogleIdentity(identity) || typeof user.email !== 'string') {
    throw new Error('auth/email-not-verified');
  }
  const email = user.email.trim().toLowerCase();
  if (!email || email === OWNER_AUTH_EMAIL) throw new Error('access-request/not-applicable');

  const requestRef = doc(db, 'access_requests', email);
  const existing = await getDocFromServer(requestRef);
  if (existing.exists()) {
    const current = existing.data() as OperationalAccessRequest;
    if (current.status === 'pending') return { ...current, email };
    if (current.status !== 'dismissed') throw new Error('access-request/already-reviewed');
  }

  const request: OperationalAccessRequest = {
    email,
    requesterUid: user.uid,
    displayName: user.displayName?.trim().slice(0, 120) || email,
    requestedAt: new Date().toISOString(),
    status: 'pending',
  };
  await setDoc(requestRef, request);
  return request;
};

export const getOwnOperationalAccessRequestCloud = async (): Promise<OperationalAccessRequest | null> => {
  const user = auth.currentUser;
  const identity = await getVerifiedFirebaseIdentity(user);
  if (!user || !isVerifiedGoogleIdentity(identity) || typeof user.email !== 'string') {
    throw new Error('auth/email-not-verified');
  }
  const email = user.email.trim().toLowerCase();
  const snapshot = await getDocFromServer(doc(db, 'access_requests', email));
  return snapshot.exists()
    ? { ...snapshot.data(), email: snapshot.id } as OperationalAccessRequest
    : null;
};

export const subscribeToOperationalAccessRequestsCloud = (
  onUpdate: (requests: OperationalAccessRequest[]) => void,
  onError: (error: Error) => void,
) => {
  assertOwnerAuth();
  return onSnapshot(
    query(collection(db, 'access_requests'), where('status', '==', 'pending'), limit(100)),
    (snapshot) => {
      const requests = snapshot.docs.map((item) => ({
        ...item.data(),
        email: item.id,
      }) as OperationalAccessRequest);
      requests.sort((a, b) => b.requestedAt.localeCompare(a.requestedAt));
      onUpdate(requests);
    },
    (reason) => onError(reason instanceof Error ? reason : new Error('تعذر تحميل طلبات الوصول.')),
  );
};

export const dismissOperationalAccessRequestCloud = async (emailInput: string): Promise<void> => {
  await requireOwnerAuth();
  const email = normalizeRoleEmail(emailInput);
  const reviewedBy = auth.currentUser?.email?.trim().toLowerCase();
  if (!reviewedBy || reviewedBy !== OWNER_AUTH_EMAIL) throw new Error('auth/owner-auth-required');
  const requestRef = doc(db, 'access_requests', email);
  const requestSnapshot = await getDocFromServer(requestRef);
  if (!requestSnapshot.exists() || requestSnapshot.data().status !== 'pending') return;
  await setDoc(requestRef, {
    status: 'dismissed',
    reviewedAt: new Date().toISOString(),
    reviewedBy,
  }, { merge: true });
};

export const saveEmailRoleAssignmentCloud = async (
  emailInput: string,
  role: AssignedOperationalRole = 'INVENTORY_VIEWER',
): Promise<EmailRoleAssignment> => {
  await requireOwnerAuth();
  const email = normalizeRoleEmail(emailInput);
  if (role !== 'INVENTORY_VIEWER' && role !== 'STORE_MANAGER') throw new Error('دور التشغيل المختار غير مدعوم.');
  const updatedBy = auth.currentUser?.email?.trim().toLowerCase();
  if (!updatedBy || updatedBy !== OWNER_AUTH_EMAIL) throw new Error('auth/owner-auth-required');
  const assignment: EmailRoleAssignment = {
    email,
    role,
    active: true,
    updatedAt: new Date().toISOString(),
    updatedBy,
  };
  const assignmentRef = doc(db, 'role_assignments', email);
  const requestRef = doc(db, 'access_requests', email);
  const requestSnapshot = await getDocFromServer(requestRef);
  const batch = writeBatch(db);
  batch.set(assignmentRef, assignment);
  if (requestSnapshot.exists() && requestSnapshot.data().status === 'pending') {
    batch.set(requestRef, {
      status: 'approved',
      reviewedAt: new Date().toISOString(),
      reviewedBy: updatedBy,
      grantedRole: role,
    }, { merge: true });
  }
  await batch.commit();
  return assignment;
};

export const setEmailRoleAssignmentActiveCloud = async (
  emailInput: string,
  active: boolean,
): Promise<void> => {
  await requireOwnerAuth();
  const email = normalizeRoleEmail(emailInput);
  const updatedBy = auth.currentUser?.email?.trim().toLowerCase();
  if (!updatedBy || updatedBy !== OWNER_AUTH_EMAIL) throw new Error('auth/owner-auth-required');
  const roleRef = doc(db, 'role_assignments', email);
  const previousSnapshot = await getDocFromServer(roleRef);
  const previousRole = previousSnapshot.exists() ? previousSnapshot.data().role : undefined;
  const role: AssignedOperationalRole = previousRole === 'STORE_MANAGER'
    ? 'STORE_MANAGER'
    : previousRole === 'INVENTORY_VIEWER'
    ? 'INVENTORY_VIEWER'
    : email === TAREK_AUTH_EMAIL
    ? 'STORE_MANAGER'
    : 'INVENTORY_VIEWER';
  const assignment: EmailRoleAssignment = {
    email,
    role,
    active,
    updatedAt: new Date().toISOString(),
    updatedBy,
  };
  const requestRef = doc(db, 'access_requests', email);
  const requestSnapshot = await getDocFromServer(requestRef);
  const batch = writeBatch(db);
  batch.set(roleRef, assignment);
  if (!active && requestSnapshot.exists()
    && ['pending', 'approved'].includes(String(requestSnapshot.data().status))) {
    batch.set(requestRef, {
      status: 'dismissed',
      reviewedAt: new Date().toISOString(),
      reviewedBy: updatedBy,
    }, { merge: true });
  }
  await batch.commit();
};

// ========================================================
// 12. DAILY CLOSURES (فتح وإغلاق اليوم التشغيلي)
// ========================================================

export const subscribeToDailyClosures = (
  onUpdate: (closures: DailyClosure[], freshness?: SnapshotFreshness) => void,
  onFreshness?: (freshness: SnapshotFreshness) => void
) => {
  assertOwnerAuth();
  const closuresCol = collection(db, 'daily_closures');
  return onSnapshot(closuresCol, verifiedSnapshotOptions, (snapshot) => {
    const freshness = getSnapshotFreshness(snapshot);
    onFreshness?.(freshness);
    const list: DailyClosure[] = [];
    snapshot.forEach((docSnap) => {
      list.push({ ...docSnap.data(), id: docSnap.id } as DailyClosure);
    });
    list.sort((a, b) => new Date(b.date || 0).getTime() - new Date(a.date || 0).getTime());
    onUpdate(list, freshness);
  }, (err) => {
    onFreshness?.('error');
    handleFirestoreError(err, OperationType.GET, 'daily_closures');
  });
};

export const saveDailyClosureCloud = async (closure: DailyClosure) => {
  await requireOwnerAuth();
  const docRef = doc(db, 'daily_closures', closure.id);
  await setDoc(docRef, cleanForFirestore(closure), { merge: true });
};

// ========================================================
// 13. PURCHASE REQUESTS (طلبات الشراء والتوريد)
// ========================================================

export const subscribeToPurchaseRequests = (
  onUpdate: (requests: PurchaseRequest[]) => void
) => {
  assertOwnerAuth();
  const reqCol = collection(db, 'purchase_requests');
  return onSnapshot(reqCol, (snapshot) => {
    const list: PurchaseRequest[] = [];
    snapshot.forEach((docSnap) => {
      list.push({ ...docSnap.data(), id: docSnap.id } as PurchaseRequest);
    });
    list.sort((a, b) => new Date(b.date || 0).getTime() - new Date(a.date || 0).getTime());
    onUpdate(list);
  }, (err) => {
    handleFirestoreError(err, OperationType.GET, 'purchase_requests');
  });
};

export const savePurchaseRequestCloud = async (request: PurchaseRequest) => {
  await requireOwnerAuth();
  const docRef = doc(db, 'purchase_requests', request.id);
  await setDoc(docRef, cleanForFirestore(request), { merge: true });
};

// ========================================================
// 14. CUSTOMER REQUESTS (طلبات المنتجات غير المتوفرة)
// ========================================================

export const subscribeToCustomerRequests = (
  onUpdate: (requests: CustomerRequest[]) => void
) => {
  assertOwnerAuth();
  const reqCol = collection(db, 'customer_requests');
  return onSnapshot(reqCol, (snapshot) => {
    const list: CustomerRequest[] = [];
    snapshot.forEach((docSnap) => {
      list.push({ ...docSnap.data(), id: docSnap.id } as CustomerRequest);
    });
    list.sort((a, b) => new Date(b.date || 0).getTime() - new Date(a.date || 0).getTime());
    onUpdate(list);
  }, (err) => {
    handleFirestoreError(err, OperationType.GET, 'customer_requests');
  });
};

export const saveCustomerRequestCloud = async (request: CustomerRequest) => {
  await requireOwnerAuth();
  const docRef = doc(db, 'customer_requests', request.id);
  await setDoc(docRef, cleanForFirestore(request), { merge: true });
};

// ========================================================
// 15. STOCK CHECKS (تسجيل الجرد الفعلي وفروقات المخزون)
// ========================================================

export const subscribeToStockChecks = (
  onUpdate: (checks: StockCheckRecord[]) => void
) => {
  assertOwnerAuth();
  const checksCol = collection(db, 'stock_checks');
  return onSnapshot(checksCol, (snapshot) => {
    const list: StockCheckRecord[] = [];
    snapshot.forEach((docSnap) => {
      list.push({ ...docSnap.data(), id: docSnap.id } as StockCheckRecord);
    });
    list.sort((a, b) => new Date(b.date || 0).getTime() - new Date(a.date || 0).getTime());
    onUpdate(list);
  }, (err) => {
    handleFirestoreError(err, OperationType.GET, 'stock_checks');
  });
};

export const saveStockCheckCloud = async (record: StockCheckRecord) => {
  await requireOwnerAuth();
  const docRef = doc(db, 'stock_checks', record.id);
  await setDoc(docRef, cleanForFirestore(record), { merge: true });
};

// ========================================================
// 16. CUSTOMERS & LOYALTY CRM RECORDS (العملاء والولاء الفعليون)
// ========================================================

export const isVirtualDemoCustomer = (c?: Partial<CustomCustomerRecord> | null): boolean => {
  if (!c) return true;
  const phone = (c.phone || '').trim();
  const name = (c.name || '').trim();
  if (
    phone === '01098765432' ||
    phone === '01123456789' ||
    name === 'أ. محمود الشافعي' ||
    name === 'د. سارة المنصوري'
  ) {
    return true;
  }
  return false;
};

export const getCustomerDocId = (c: Partial<CustomCustomerRecord>): string => {
  if (c.id && c.id.trim()) return c.id.trim().replace(/[\/\\.#$\[\]]/g, '_');
  const cleanPhone = (c.phone || '').replace(/\D/g, '');
  if (cleanPhone) return `cust_${cleanPhone}`;
  const cleanName = (c.name || 'customer')
    .trim()
    .replace(/\s+/g, '_')
    .replace(/[\/\\.#$\[\]]/g, '');
  return `cust_${cleanName || Date.now()}`;
};

export const subscribeToCustomCustomers = (
  onUpdate: (customers: CustomCustomerRecord[], freshness?: SnapshotFreshness) => void,
  onFreshness?: (freshness: SnapshotFreshness) => void
) => {
  assertOwnerAuth();
  const custCol = collection(db, 'customers');
  return onSnapshot(
    custCol,
    verifiedSnapshotOptions,
    (snapshot) => {
      const freshness = getSnapshotFreshness(snapshot);
      onFreshness?.(freshness);
      const list: CustomCustomerRecord[] = [];
      snapshot.forEach((docSnap) => {
        const data = docSnap.data() as CustomCustomerRecord;
        if (isVirtualDemoCustomer(data)) {
          // Keep existing records untouched; demo filtering is presentation-only.
          list.push({ ...data, id: docSnap.id });
          return;
        }
        list.push({ ...data, id: docSnap.id });
      });
      list.sort(
        (a, b) =>
          new Date(b.updatedAt || b.createdAt || 0).getTime() -
          new Date(a.updatedAt || a.createdAt || 0).getTime()
      );
      onUpdate(list, freshness);
    },
    (err) => {
      onFreshness?.('error');
      handleFirestoreError(err, OperationType.GET, 'customers');
    }
  );
};

export const saveCustomCustomerCloud = async (record: CustomCustomerRecord) => {
  if (isVirtualDemoCustomer(record)) return;
  await requireOwnerAuth();
  const docId = getCustomerDocId(record);
  const docRef = doc(db, 'customers', docId);
  await setDoc(
    docRef,
    cleanForFirestore({
      ...record,
      id: docId,
      updatedAt: new Date().toISOString(),
    }),
    { merge: true }
  );
};

export const deleteCustomCustomerCloud = async (record: Partial<CustomCustomerRecord>) => {
  await requireOwnerAuth();
  const docId = getCustomerDocId(record);
  await deleteDoc(doc(db, 'customers', docId));
};

// ========================================================
// 17. SAVED MIX FORMULAS (وصفات الميكسات العطرية المحفوظة)
// ========================================================

export const subscribeToSavedMixes = (
  onUpdate: (mixes: SavedMixFormula[]) => void
) => {
  assertOwnerAuth();
  const mixesCol = collection(db, 'saved_mixes');
  return onSnapshot(
    mixesCol,
    (snapshot) => {
      const list: SavedMixFormula[] = [];
      snapshot.forEach((docSnap) => {
        const data = docSnap.data() as SavedMixFormula;
        list.push({ ...data, id: docSnap.id });
      });
      list.sort(
        (a, b) =>
          new Date(b.updatedAt || b.createdAt || 0).getTime() -
          new Date(a.updatedAt || a.createdAt || 0).getTime()
      );
      onUpdate(list);
    },
    (err) => {
      handleFirestoreError(err, OperationType.GET, 'saved_mixes');
    }
  );
};

export const saveSavedMixCloud = async (formula: SavedMixFormula) => {
  await requireOwnerAuth();
  const docRef = doc(db, 'saved_mixes', formula.id);
  await setDoc(
    docRef,
    cleanForFirestore({
      ...formula,
      updatedAt: new Date().toISOString(),
    }),
    { merge: true }
  );
};

export const deleteSavedMixCloud = async (mixId: string) => {
  await requireOwnerAuth();
  await deleteDoc(doc(db, 'saved_mixes', mixId));
};

// ========================================================
// 18. REAL-TIME MULTI-DEVICE PRESENCE & TURBO SYNC
// (ضمان تزامن كافة الأجهزة في الوقت الفعلي ورادار الأجهزة النشطة)
// ========================================================

/**
 * Get or generate persistent unique identifier for this physical terminal/browser
 */
export const getLocalDeviceId = (): string => {
  if (typeof window === 'undefined') return 'server-instance';
  try {
    let id = localStorage.getItem('lamsa_terminal_device_id');
    if (!id) {
      const randomPart = Math.random().toString(36).substring(2, 9);
      const timePart = Date.now().toString(36);
      id = `dev-${timePart}-${randomPart}`;
      localStorage.setItem('lamsa_terminal_device_id', id);
    }
    return id;
  } catch {
    return `dev-${Date.now()}`;
  }
};

/**
 * Automatically inspect browser environment for clean Arabic device naming
 */
export const detectCurrentDeviceMetadata = (): {
  deviceName: string;
  deviceType: 'mobile' | 'desktop' | 'tablet';
  browser: string;
} => {
  if (typeof window === 'undefined') {
    return { deviceName: 'خادم النظام', deviceType: 'desktop', browser: 'Node.js' };
  }

  const ua = navigator.userAgent || '';
  let deviceName = 'كمبيوتر شخصي';
  let deviceType: 'mobile' | 'desktop' | 'tablet' = 'desktop';
  let browser = 'المتصفح';

  // Device detection
  if (/iPad|tablet/i.test(ua)) {
    deviceType = 'tablet';
    deviceName = 'جهاز لوحي (تابلت)';
  } else if (/iPhone/i.test(ua)) {
    deviceType = 'mobile';
    deviceName = 'هاتف آيفون (iPhone)';
  } else if (/Android/i.test(ua)) {
    if (/Mobile/i.test(ua)) {
      deviceType = 'mobile';
      deviceName = 'هاتف ذكي (أندرويد)';
    } else {
      deviceType = 'tablet';
      deviceName = 'تابلت (أندرويد)';
    }
  } else if (/Macintosh|Mac OS X/i.test(ua)) {
    deviceName = 'جهاز ماك (Apple Mac)';
  } else if (/Windows/i.test(ua)) {
    deviceName = 'كمبيوتر ويندوز (Windows PC)';
  } else if (/Linux/i.test(ua)) {
    deviceName = 'محطة عمل (Linux)';
  }

  // Browser detection
  if (/Edg\//i.test(ua)) {
    browser = 'Edge';
  } else if (/Chrome\//i.test(ua) && !/Edg\//i.test(ua)) {
    browser = 'Chrome';
  } else if (/Safari\//i.test(ua) && !/Chrome\//i.test(ua)) {
    browser = 'Safari';
  } else if (/Firefox\//i.test(ua)) {
    browser = 'Firefox';
  }

  return { deviceName, deviceType, browser };
};

/**
 * Publish device presence and return the confirmed Firestore write duration.
 */
export const publishDevicePresence = async (
  currentUser: AppUser | null
): Promise<number> => {
  try {
    await requireOwnerAuth();
    const deviceId = getLocalDeviceId();
    const meta = detectCurrentDeviceMetadata();
    const docRef = doc(db, 'connected_devices', deviceId);

    const payload: ConnectedDeviceRecord = {
      deviceId,
      userId: currentUser?.id,
      userName: currentUser?.displayName || 'مستخدم النظام',
      userRole: currentUser?.role || 'CASHIER',
      deviceName: meta.deviceName,
      deviceType: meta.deviceType,
      browser: meta.browser,
      isOnline: true,
      lastSeen: new Date().toISOString(),
      lastSeenMs: Date.now(),
      appVersion: APP_SYSTEM_VERSION,
    };

    const startedAt = performance.now();
    await setDoc(docRef, cleanForFirestore(payload), { merge: true });
    return Math.max(0, Math.round(performance.now() - startedAt));
  } catch (err) {
    handleFirestoreError(err, OperationType.WRITE, 'connected_devices');
    throw err;
  }
};

/**
 * Mark this specific device as offline on tab closure or logout
 */
export const markDeviceOfflineCloud = async (): Promise<void> => {
  try {
    assertOwnerAuth();
    const deviceId = getLocalDeviceId();
    const docRef = doc(db, 'connected_devices', deviceId);
    await setDoc(
      docRef,
      {
        isOnline: false,
        lastSeen: new Date().toISOString(),
        lastSeenMs: Date.now(),
      },
      { merge: true }
    );
  } catch {
    // Ignore on shutdown
  }
};

/**
 * Subscribe in real time to all currently connected active terminals across all devices
 */
export const subscribeToConnectedDevices = (
  onUpdate: (devices: ConnectedDeviceRecord[]) => void,
  onStatus?: (status: 'live' | 'cached' | 'error') => void
) => {
  assertOwnerAuth();
  const devicesCol = collection(db, 'connected_devices');
  const activeWindowMs = 3 * 60 * 1000;
  const queryStartCutoff = Date.now() - activeWindowMs;
  // Fetch recent presence records on the server. There is no numeric cap, so
  // every active device remains visible while old presence documents stay untouched.
  const devicesQuery = query(
    devicesCol,
    where('lastSeenMs', '>=', queryStartCutoff),
    orderBy('lastSeenMs', 'desc')
  );
  let latestDevices: ConnectedDeviceRecord[] = [];
  let expiryTimer: ReturnType<typeof setTimeout> | undefined;

  const publishActiveDevices = () => {
    if (expiryTimer) clearTimeout(expiryTimer);
    const now = Date.now();
    const activeDevices = latestDevices.filter(
      (device) => device.isOnline !== false && (device.lastSeenMs || 0) > now - activeWindowMs
    );

    // Sort with current device first, then newest active.
    const localId = getLocalDeviceId();
    activeDevices.sort((a, b) => {
      if (a.deviceId === localId) return -1;
      if (b.deviceId === localId) return 1;
      return (b.lastSeenMs || 0) - (a.lastSeenMs || 0);
    });
    onUpdate(activeDevices);

    const nextExpiry = activeDevices.reduce((earliest, device) => {
      const expiresAt = (device.lastSeenMs || 0) + activeWindowMs;
      return Math.min(earliest, expiresAt);
    }, Number.POSITIVE_INFINITY);
    if (Number.isFinite(nextExpiry)) {
      expiryTimer = setTimeout(publishActiveDevices, Math.max(250, nextExpiry - Date.now() + 25));
    }
  };

  const unsubscribe = onSnapshot(
    devicesQuery,
    { includeMetadataChanges: true },
    (snapshot) => {
      onStatus?.(snapshot.metadata.fromCache ? 'cached' : 'live');
      latestDevices = snapshot.docs.map((docSnap) => ({
        ...docSnap.data(),
        deviceId: docSnap.id,
      } as ConnectedDeviceRecord));
      publishActiveDevices();
    },
    (err) => {
      onStatus?.('error');
      handleFirestoreError(err, OperationType.GET, 'connected_devices');
    }
  );

  return () => {
    if (expiryTimer) clearTimeout(expiryTimer);
    unsubscribe();
  };
};

/**
 * Real-Time Owner Direct Directives & Staff Broadcasts
 */
export const subscribeToOwnerBroadcasts = (
  onUpdate: (broadcasts: OwnerStaffBroadcast[]) => void
) => {
  assertOwnerAuth();
  const broadcastsCol = collection(db, 'owner_broadcasts');
  return onSnapshot(
    broadcastsCol,
    (snapshot) => {
      const list: OwnerStaffBroadcast[] = [];
      snapshot.forEach((docSnap) => {
        const data = docSnap.data() as OwnerStaffBroadcast;
        list.push({ ...data, id: docSnap.id });
      });
      list.sort(
        (a, b) =>
          new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime()
      );
      onUpdate(list);
    },
    (err) => {
      handleFirestoreError(err, OperationType.GET, 'owner_broadcasts');
    }
  );
};

export const sendOwnerBroadcastCloud = async (broadcast: OwnerStaffBroadcast) => {
  await requireOwnerAuth();
  const docRef = doc(db, 'owner_broadcasts', broadcast.id);
  await setDoc(
    docRef,
    cleanForFirestore({
      ...broadcast,
      updatedAt: new Date().toISOString(),
    }),
    { merge: true }
  );
};

export const acknowledgeOwnerBroadcastCloud = async (
  broadcastId: string,
  employeeName: string
) => {
  await requireOwnerAuth();
  const docRef = doc(db, 'owner_broadcasts', broadcastId);
  const snap = await getDoc(docRef);
  if (snap.exists()) {
    const data = snap.data() as OwnerStaffBroadcast;
    const existing = data.acknowledgedBy || [];
    if (!existing.some((a) => a.employeeName === employeeName)) {
      existing.push({
        employeeName,
        timestamp: new Date().toISOString(),
      });
      await setDoc(docRef, cleanForFirestore({ acknowledgedBy: existing }), {
        merge: true,
      });
    }
  }
};
