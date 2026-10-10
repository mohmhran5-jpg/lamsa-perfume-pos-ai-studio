import { initializeApp } from 'firebase/app';
import { 
  getFirestore, 
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
  getDocFromServer
} from 'firebase/firestore';
import { getAuth, signInAnonymously, onAuthStateChanged, User } from 'firebase/auth';
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

// Initialize Firebase App
const app = initializeApp(firebaseConfig);

// Initialize Auth
export const auth = getAuth(app);

// Initialize Firestore targeting the specific provisioned database
const dbId = (firebaseConfig as { firestoreDatabaseId?: string }).firestoreDatabaseId;
export const db = dbId && dbId !== '(default)'
  ? getFirestore(app, dbId)
  : getFirestore(app);

let currentUser: User | null = null;
let authPromise: Promise<User | null> | null = null;

// Ensure authentication session if available
export const ensureAuth = (): Promise<User | null> => {
  if (currentUser) return Promise.resolve(currentUser);
  if (authPromise) return authPromise;

  authPromise = new Promise((resolve) => {
    try {
      onAuthStateChanged(auth, async (user) => {
        if (user) {
          currentUser = user;
          resolve(user);
        } else {
          try {
            const cred = await signInAnonymously(auth);
            currentUser = cred.user;
            resolve(cred.user);
          } catch {
            // In environments where anonymous auth is restricted by project admin,
            // continue gracefully with direct store access allowed by firestore rules.
            resolve(null);
          }
        }
      });
    } catch {
      resolve(null);
    }
  });

  return authPromise;
};

// Immediate background authentication attempt
ensureAuth().catch(() => {});

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

export function handleFirestoreError(error: unknown, operationType: OperationType, path: string | null) {
  const errInfo: FirestoreErrorInfo = {
    error: error instanceof Error ? error.message : String(error),
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
  console.error('Firestore Error: ', JSON.stringify(errInfo));
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

// Test initial connection
export const testFirestoreConnection = async (): Promise<boolean> => {
  try {
    await ensureAuth();
    await getDocFromServer(doc(db, 'test', 'connection'));
    return true;
  } catch (error) {
    if (error instanceof Error && error.message.includes('the client is offline')) {
      console.warn("Firestore client is offline or connecting...");
    }
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
  onUpdate: (sales: Sale[]) => void,
  onLiveSaleAdded?: (newSale: Sale, isRemote: boolean) => void
) => {
  const salesCol = collection(db, 'sales');
  const q = query(salesCol);
  const seenSaleIds = new Set<string>();
  let isInitialSnapshot = true;

  return onSnapshot(q, (snapshot) => {
    const list: Sale[] = [];
    snapshot.forEach((docSnap) => {
      const data = docSnap.data() as Sale;
      list.push({ ...data, id: docSnap.id });
    });
    // Sort newest first
    list.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
    onUpdate(list);

    // CRITICAL: Only trigger live alert for new documents added in real-time AFTER the initial load!
    // Historical/past sales are loaded silently without buzzing or alerting.
    if (isInitialSnapshot) {
      snapshot.forEach((docSnap) => seenSaleIds.add(docSnap.id));
      isInitialSnapshot = false;
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
    handleFirestoreError(err, OperationType.GET, 'sales');
  });
};

export const addSaleCloud = async (sale: Sale, updatedProducts?: Product[]) => {
  await ensureAuth();

  // 1. Immediately persist the sale document so all connected devices sync instantaneously
  const saleRef = doc(db, 'sales', sale.id);
  await setDoc(saleRef, cleanForFirestore(sale));

  // 2. Synchronize product inventory stock deductions in the cloud
  if (updatedProducts && updatedProducts.length > 0) {
    try {
      const batch = writeBatch(db);
      updatedProducts.forEach((p) => {
        const pRef = doc(db, 'products', p.id.toString());
        batch.set(pRef, cleanForFirestore(p), { merge: true });
      });
      await batch.commit();
    } catch (prodErr) {
      console.warn("Product stock cloud sync warning:", prodErr);
    }
  }

  // 3. Notify other local browser windows and tabs immediately
  if (posRealtimeChannel) {
    try {
      posRealtimeChannel.postMessage({ type: 'LIVE_SALE', sale, timestamp: Date.now() });
    } catch {}
  }
};

export const deleteSaleCloud = async (saleId: string) => {
  await ensureAuth();
  await deleteDoc(doc(db, 'sales', saleId));
};

export const deleteSaleAndRestoreInventoryCloud = async (
  saleId: string,
  restoredProducts?: Product[]
) => {
  await ensureAuth();
  const batch = writeBatch(db);
  batch.delete(doc(db, 'sales', saleId));

  if (restoredProducts && restoredProducts.length > 0) {
    restoredProducts.forEach((p) => {
      const pRef = doc(db, 'products', p.id.toString());
      batch.set(pRef, cleanForFirestore(p), { merge: true });
    });
  }

  await batch.commit();
};

/**
 * Reverse a sale transaction instead of deleting it (Strict Non-deletion Financial Rule)
 */
export const reverseSaleCloud = async (
  sale: Sale, 
  reversalReason: string, 
  reversedBy: string,
  restoredProducts?: Product[]
) => {
  await ensureAuth();
  const batch = writeBatch(db);

  // Update sale with reversal flag
  const saleRef = doc(db, 'sales', sale.id);
  const updatedSale: Partial<Sale> = {
    ...sale,
    isReversed: true,
    reversalReason,
    reversedBy,
    reversedAt: new Date().toISOString()
  };
  batch.set(saleRef, cleanForFirestore(updatedSale), { merge: true });

  // Restore inventory if provided
  if (restoredProducts && restoredProducts.length > 0) {
    restoredProducts.forEach(p => {
      const pRef = doc(db, 'products', p.id.toString());
      batch.set(pRef, cleanForFirestore(p), { merge: true });
    });
  }

  await batch.commit();
};

export const clearAllSalesCloud = async (sales: Sale[]) => {
  await ensureAuth();
  const batch = writeBatch(db);
  sales.forEach((s) => {
    batch.delete(doc(db, 'sales', s.id));
  });
  await batch.commit();
};

// ========================================================
// REAL-TIME PRODUCTS SYNCHRONIZATION
// ========================================================

export const subscribeToProducts = (
  onUpdate: (products: Product[]) => void, 
  seedIfEmpty?: Product[]
) => {
  const productsCol = collection(db, 'products');

  return onSnapshot(productsCol, async (snapshot) => {
    if (snapshot.empty && seedIfEmpty && seedIfEmpty.length > 0) {
      // Seed initial perfume catalogue to cloud once if collection is empty
      try {
        await seedProductsCloud(seedIfEmpty);
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
    if (list.length > 0) {
      onUpdate(list);
    }
  }, (err) => {
    handleFirestoreError(err, OperationType.GET, 'products');
  });
};

export const seedProductsCloud = async (products: Product[]) => {
  await ensureAuth();
  // Batch writes in chunks of 450 (Firestore limit is 500)
  const chunkSize = 400;
  for (let i = 0; i < products.length; i += chunkSize) {
    const chunk = products.slice(i, i + chunkSize);
    const batch = writeBatch(db);
    chunk.forEach((p) => {
      const pRef = doc(db, 'products', p.id.toString());
      batch.set(pRef, cleanForFirestore(p));
    });
    await batch.commit();
  }
};

export const saveProductCloud = async (product: Product) => {
  await ensureAuth();
  const withTimestamp: Product = {
    ...product,
    updatedAt: new Date().toISOString(),
  };
  await setDoc(doc(db, 'products', product.id.toString()), cleanForFirestore(withTimestamp), { merge: true });

  if (posRealtimeChannel) {
    try {
      posRealtimeChannel.postMessage({
        type: 'PRODUCT_UPDATE',
        product: withTimestamp,
        timestamp: Date.now()
      });
    } catch {}
  }
};

export const deleteProductCloud = async (productId: number | string) => {
  await ensureAuth();
  await deleteDoc(doc(db, 'products', productId.toString()));

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
  onUpdate: (expenses: Expense[]) => void,
  seedIfEmpty?: Expense[]
) => {
  const expensesCol = collection(db, 'expenses');

  return onSnapshot(expensesCol, async (snapshot) => {
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
    if (list.length > 0) {
      onUpdate(list);
    }
  }, (err) => {
    handleFirestoreError(err, OperationType.GET, 'expenses');
  });
};

export const saveExpenseCloud = async (expense: Expense) => {
  await ensureAuth();
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
  await ensureAuth();
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
  onUpdate: (settings: StoreSettings) => void,
  initialFallback: StoreSettings
) => {
  const settingsDocRef = doc(db, 'settings', 'store');

  return onSnapshot(settingsDocRef, async (docSnap) => {
    if (!docSnap.exists()) {
      try {
        await ensureAuth();
        await setDoc(settingsDocRef, cleanForFirestore({
          ...initialFallback,
          updatedAt: new Date().toISOString(),
        }));
      } catch (e) {
        console.error("Error creating initial cloud settings:", e);
      }
      return;
    }

    const data = docSnap.data() as StoreSettings;
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
    onUpdate(merged);
  }, (err) => {
    handleFirestoreError(err, OperationType.GET, 'settings/store');
  });
};

export const saveSettingsCloud = async (settings: StoreSettings) => {
  await ensureAuth();
  const withTimestamp: StoreSettings = {
    ...settings,
    updatedAt: new Date().toISOString(),
  };
  await setDoc(doc(db, 'settings', 'store'), cleanForFirestore(withTimestamp), { merge: true });

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
  const bottleSizesCol = collection(db, 'bottleSizes');

  return onSnapshot(bottleSizesCol, async (snapshot) => {
    if (snapshot.empty && initialFallback && initialFallback.length > 0) {
      try {
        const batch = writeBatch(db);
        initialFallback.forEach((b) => {
          const bRef = doc(db, 'bottleSizes', b.id);
          batch.set(bRef, cleanForFirestore(b));
        });
        await batch.commit();
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
  await ensureAuth();
  const batch = writeBatch(db);
  sizes.forEach((b) => {
    const bRef = doc(db, 'bottleSizes', b.id);
    batch.set(bRef, cleanForFirestore(b));
  });
  await batch.commit();

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
  onUpdate: (vaults: FinancialVault[]) => void,
  initialFallback?: FinancialVault[]
) => {
  const vaultsCol = collection(db, 'vaults');

  return onSnapshot(vaultsCol, async (snapshot) => {
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
    if (list.length > 0) {
      onUpdate(list);
    }
  }, (err) => {
    handleFirestoreError(err, OperationType.GET, 'vaults');
  });
};

export const saveVaultCloud = async (vault: FinancialVault) => {
  await ensureAuth();
  await setDoc(doc(db, 'vaults', vault.id), cleanForFirestore(vault), { merge: true });
};

export const saveAllVaultsCloud = async (vaults: FinancialVault[]) => {
  await ensureAuth();
  const batch = writeBatch(db);
  vaults.forEach((v) => {
    const vRef = doc(db, 'vaults', v.id);
    batch.set(vRef, cleanForFirestore(v));
  });
  await batch.commit();
};

export const subscribeToWithdrawals = (
  onUpdate: (withdrawals: WithdrawalTransaction[]) => void
) => {
  const withdrawalsCol = collection(db, 'withdrawals');
  const q = query(withdrawalsCol);

  return onSnapshot(q, (snapshot) => {
    const list: WithdrawalTransaction[] = [];
    snapshot.forEach((docSnap) => {
      list.push({ ...docSnap.data(), id: docSnap.id } as WithdrawalTransaction);
    });
    list.sort((a, b) => new Date(b.date || 0).getTime() - new Date(a.date || 0).getTime());
    onUpdate(list);
  }, (err) => {
    handleFirestoreError(err, OperationType.GET, 'withdrawals');
  });
};

export const addWithdrawalCloud = async (
  tx: WithdrawalTransaction,
  updatedVault?: FinancialVault
) => {
  await ensureAuth();
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
  await ensureAuth();
  const docRef = doc(db, 'staff_attendance', record.id);
  await setDoc(docRef, cleanForFirestore(record), { merge: true });
};

// ========================================================
// 9. PRODUCTION BATCHES (إدارة دفعات الإنتاج والتشغيل)
// ========================================================
export const subscribeToProductionBatches = (
  onUpdate: (batches: ProductionBatch[]) => void
) => {
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
  await ensureAuth();
  const docRef = doc(db, 'production_batches', batchRecord.id);
  await setDoc(docRef, cleanForFirestore(batchRecord), { merge: true });
};

// ========================================================
// 10. IMMUTABLE AUDIT LOG (سجل التغييرات غير القابل للحذف)
// ========================================================
export const subscribeToAuditLogs = (
  onUpdate: (logs: AuditLogRecord[]) => void
) => {
  const logsCol = collection(db, 'audit_logs');
  const q = query(logsCol);

  return onSnapshot(q, (snapshot) => {
    const list: AuditLogRecord[] = [];
    snapshot.forEach((docSnap) => {
      list.push({ ...docSnap.data(), id: docSnap.id } as AuditLogRecord);
    });
    list.sort((a, b) => new Date(b.timestamp || 0).getTime() - new Date(a.timestamp || 0).getTime());
    onUpdate(list);
  }, (err) => {
    handleFirestoreError(err, OperationType.GET, 'audit_logs');
  });
};

export const addAuditLogCloud = async (logRecord: AuditLogRecord) => {
  await ensureAuth();
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
  await ensureAuth();
  const docRef = doc(db, 'app_users', user.id);
  await setDoc(docRef, cleanForFirestore(user), { merge: true });
};

export const seedInitialUsersCloud = async (users: AppUser[]) => {
  await ensureAuth();
  const batch = writeBatch(db);
  users.forEach((u) => {
    const docRef = doc(db, 'app_users', u.id);
    batch.set(docRef, cleanForFirestore(u), { merge: true });
  });
  await batch.commit();
};

// ========================================================
// 12. DAILY CLOSURES (فتح وإغلاق اليوم التشغيلي)
// ========================================================

export const subscribeToDailyClosures = (
  onUpdate: (closures: DailyClosure[]) => void
) => {
  const closuresCol = collection(db, 'daily_closures');
  return onSnapshot(closuresCol, (snapshot) => {
    const list: DailyClosure[] = [];
    snapshot.forEach((docSnap) => {
      list.push({ ...docSnap.data(), id: docSnap.id } as DailyClosure);
    });
    list.sort((a, b) => new Date(b.date || 0).getTime() - new Date(a.date || 0).getTime());
    onUpdate(list);
  }, (err) => {
    handleFirestoreError(err, OperationType.GET, 'daily_closures');
  });
};

export const saveDailyClosureCloud = async (closure: DailyClosure) => {
  await ensureAuth();
  const docRef = doc(db, 'daily_closures', closure.id);
  await setDoc(docRef, cleanForFirestore(closure), { merge: true });
};

// ========================================================
// 13. PURCHASE REQUESTS (طلبات الشراء والتوريد)
// ========================================================

export const subscribeToPurchaseRequests = (
  onUpdate: (requests: PurchaseRequest[]) => void
) => {
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
  await ensureAuth();
  const docRef = doc(db, 'purchase_requests', request.id);
  await setDoc(docRef, cleanForFirestore(request), { merge: true });
};

// ========================================================
// 14. CUSTOMER REQUESTS (طلبات المنتجات غير المتوفرة)
// ========================================================

export const subscribeToCustomerRequests = (
  onUpdate: (requests: CustomerRequest[]) => void
) => {
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
  await ensureAuth();
  const docRef = doc(db, 'customer_requests', request.id);
  await setDoc(docRef, cleanForFirestore(request), { merge: true });
};

// ========================================================
// 15. STOCK CHECKS (تسجيل الجرد الفعلي وفروقات المخزون)
// ========================================================

export const subscribeToStockChecks = (
  onUpdate: (checks: StockCheckRecord[]) => void
) => {
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
  await ensureAuth();
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
  onUpdate: (customers: CustomCustomerRecord[]) => void
) => {
  const custCol = collection(db, 'customers');
  return onSnapshot(
    custCol,
    (snapshot) => {
      const list: CustomCustomerRecord[] = [];
      snapshot.forEach((docSnap) => {
        const data = docSnap.data() as CustomCustomerRecord;
        if (isVirtualDemoCustomer(data)) {
          deleteDoc(doc(db, 'customers', docSnap.id)).catch(() => {});
          return;
        }
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
      handleFirestoreError(err, OperationType.GET, 'customers');
    }
  );
};

export const saveCustomCustomerCloud = async (record: CustomCustomerRecord) => {
  if (isVirtualDemoCustomer(record)) return;
  await ensureAuth();
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
  await ensureAuth();
  const docId = getCustomerDocId(record);
  await deleteDoc(doc(db, 'customers', docId));
};

// ========================================================
// 17. SAVED MIX FORMULAS (وصفات الميكسات العطرية المحفوظة)
// ========================================================

export const subscribeToSavedMixes = (
  onUpdate: (mixes: SavedMixFormula[]) => void
) => {
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
  await ensureAuth();
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
  await ensureAuth();
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
 * Publish heartbeats and real-time terminal presence to Firestore
 */
export const publishDevicePresence = async (
  currentUser: AppUser | null,
  currentViewName?: string,
  syncLatencyMs?: number
): Promise<void> => {
  try {
    await ensureAuth();
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
      currentView: currentViewName || 'نظام لمسة عطر',
      isOnline: true,
      lastSeen: new Date().toISOString(),
      lastSeenMs: Date.now(),
      appVersion: APP_SYSTEM_VERSION,
      syncLatencyMs: syncLatencyMs ?? 18,
    };

    await setDoc(docRef, cleanForFirestore(payload), { merge: true });
  } catch (err) {
    // Graceful silent fallback if offline
  }
};

/**
 * Mark this specific device as offline on tab closure or logout
 */
export const markDeviceOfflineCloud = async (): Promise<void> => {
  try {
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
  onUpdate: (devices: ConnectedDeviceRecord[]) => void
) => {
  const devicesCol = collection(db, 'connected_devices');
  return onSnapshot(
    devicesCol,
    (snapshot) => {
      const now = Date.now();
      const cutoff = now - 65 * 1000; // active within the last 65 seconds
      const activeDevices: ConnectedDeviceRecord[] = [];

      snapshot.forEach((docSnap) => {
        const data = docSnap.data() as ConnectedDeviceRecord;
        if (data && data.isOnline !== false && (data.lastSeenMs || 0) > cutoff) {
          activeDevices.push({
            ...data,
            deviceId: docSnap.id,
          });
        }
      });

      // Sort with current device first, then newest active
      const localId = getLocalDeviceId();
      activeDevices.sort((a, b) => {
        if (a.deviceId === localId) return -1;
        if (b.deviceId === localId) return 1;
        return (b.lastSeenMs || 0) - (a.lastSeenMs || 0);
      });

      onUpdate(activeDevices);
    },
    (err) => {
      handleFirestoreError(err, OperationType.GET, 'connected_devices');
    }
  );
};

/**
 * Turbo Sync ping: performs an instantaneous round-trip ping to measure real-time latency
 * and ensure Firestore cache is fully reconciled with server
 */
export const measureTurboSyncLatency = async (): Promise<number> => {
  const start = performance.now();
  try {
    const testDoc = doc(db, 'test', 'sync_pulse');
    await setDoc(
      testDoc,
      {
        pulseMs: Date.now(),
        clientDeviceId: getLocalDeviceId(),
      },
      { merge: true }
    );
    const end = performance.now();
    return Math.max(8, Math.round(end - start));
  } catch {
    return 32;
  }
};

/**
 * Real-Time Owner Direct Directives & Staff Broadcasts
 */
export const subscribeToOwnerBroadcasts = (
  onUpdate: (broadcasts: OwnerStaffBroadcast[]) => void
) => {
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
  await ensureAuth();
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
  await ensureAuth();
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






