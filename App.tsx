import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import Sidebar from './components/Sidebar';
import Dashboard from './components/Dashboard';
import Inventory from './components/Inventory';
import POS from './components/POS';
import TarekReadOnlyWorkspace from './components/TarekReadOnlyWorkspace';
import Reports from './components/Reports';
import Expenses from './components/Expenses';
import Settings from './components/Settings';
import FragranceAnalyzer from './components/FragranceAnalyzer';
import MasterStoreManager from './components/MasterStoreManager';
import OperationsSystem from './components/OperationsSystem';
import AIMarketing from './components/AIMarketing';
import FinancialVaults from './components/FinancialVaults';
import ProductFormulationEngine from './components/ProductFormulationEngine';
import AuthModal from './components/AuthModal';
import PasswordChangeModal from './components/PasswordChangeModal';
import UsersManagement from './components/UsersManagement';
import DayOperationsModal from './components/DayOperationsModal';
import InventoryIntelligence from './components/InventoryIntelligence';
import AuditLogViewer from './components/AuditLogViewer';
import ExecutiveHeaderBar from './components/ExecutiveHeaderBar';
import { AppleWelcomeLockScreen } from './components/AppleWelcomeLockScreen';
import AppleTopNotificationBanner, { AppleNotificationItem, AppleNotificationType } from './components/AppleTopNotificationBanner';
import CustomersCRM from './components/CustomersCRM';
import AppleSignatureFooter from './components/AppleSignatureFooter';
import DailyReportAutomationModal from './components/DailyReportAutomationModal';
import AppleThemeStudioModal from './components/AppleThemeStudioModal';
import InteractiveTypingController from './components/InteractiveTypingController';
import OwnerLiveAlertsRadarModal from './components/OwnerLiveAlertsRadarModal';
import PWAInstallModal from './components/PWAInstallModal';
import ConnectedDevicesSyncModal from './components/ConnectedDevicesSyncModal';
import StaffEntitlements from './components/StaffEntitlements';
import OwnerCommissionCounterBootstrap from './components/OwnerCommissionCounterBootstrap';
import { prepareTarekReadOnlyCatalogCloud } from './services/separatedDataService';
import { soundAlertService } from './services/soundAlertService';
import { browserNotificationService } from './services/browserNotificationService';
import { onAuthStateChanged, type User } from 'firebase/auth';
import { 
  View, 
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
  StrategicReplenishmentOrder,
  FragranceDatabaseEntry,
  CustomCustomerRecord,
  SavedMixFormula,
  ConnectedDeviceRecord,
  OwnerStaffBroadcast,
  DEFAULT_SETTINGS, 
  DEFAULT_BOTTLE_SIZES,
  DEFAULT_VAULTS,
  DEFAULT_USERS,
  OWNER_FULL_PERMISSIONS,
  TAREK_OPERATIONAL_PERMISSIONS,
  resolveActiveAppTheme,
  isActualPaidOperationalExpense,
  isLiveProductionSale,
  isTestOrExampleRecord,
  LEGACY_SEEDED_BUDGET_EXPENSE_IDS
} from './types';
import {
  hydrateFromIndexedDBIfNeeded,
  mergeCollectionRecords,
  addDeletedTombstone,
  removeDeletedTombstone,
  getDeletedTombstones
} from './services/persistenceService';
import {
  OwnerPrivateSessionGate,
  OWNER_PRIVATE_CACHE_KEYS,
  cancelPendingOwnerPrivateCacheWrites,
  persistOwnerPrivateCache,
  readOwnerPrivateCache,
} from './services/ownerPrivateSession';
import {
  enqueueOfflineAction,
  flushPendingSaleQueue,
  getOfflineQueue,
  startSaleQueueAutoRetry,
  subscribeToOfflineQueue,
  type SaleFlushResult,
} from './services/offlineSyncService';
import { clearCurrentFirebaseRoleAssignment, setCurrentFirebaseRoleAssignment, TAREK_AUTH_EMAIL } from './services/authPolicy';
import { 
  subscribeToFragranceDatabase, 
  saveFragranceProfileCloud, 
  bulkUpsertFragranceProfilesCloud,
  getLocalFragranceDatabase,
  enrichFragranceProfile,
  saveLocalFragranceDatabase
} from './services/fragranceDbService';
import {
  buildDailyClosingReport,
  flushOfflineReportQueue,
  getLastAutoMidnightReportDate,
  setLastAutoMidnightReportDate,
  upsertAutomatedReport,
  executeFreeWhatsAppAutomation,
} from './services/workspaceReportService';
import { 
  subscribeToStrategicOrders, 
  saveStrategicOrderCloud, 
  getLocalStrategicOrders,
  saveLocalStrategicOrders
} from './services/strategicOrderService';
import { 
  subscribeToSales, 
  subscribeToProducts, 
  subscribeToExpenses, 
  subscribeToSettings, 
  subscribeToBottleSizes,
  subscribeToVaults,
  subscribeToWithdrawals,
  subscribeToStaffAttendance,
  saveStaffAttendanceCloud,
  saveVaultCloud,
  saveAllVaultsCloud,
  addWithdrawalCloud,
  addSaleCloud,
  reverseSaleCloud,
  saveProductCloud,
  deleteProductCloud,
  seedProductsCloud,
  saveExpenseCloud,
  deleteExpenseCloud,
  saveSettingsCloud,
  saveBottleSizesCloud,
  testFirestoreConnection,
  subscribeToProductionBatches,
  saveProductionBatchCloud,
  subscribeToTodaysAuditLogs,
  loadAuditLogsPage,
  AuditLogPageCursor,
  addAuditLogCloud,
  subscribeToAppUsers,
  saveAppUserCloud,
  subscribeToDailyClosures,
  saveDailyClosureCloud,
  subscribeToPurchaseRequests,
  savePurchaseRequestCloud,
  subscribeToCustomerRequests,
  saveCustomerRequestCloud,
  subscribeToStockChecks,
  saveStockCheckCloud,
  subscribeToCustomCustomers,
  saveCustomCustomerCloud,
  deleteCustomCustomerCloud,
  subscribeToSavedMixes,
  saveSavedMixCloud,
  deleteSavedMixCloud,
  subscribeToConnectedDevices,
  publishDevicePresence,
  markDeviceOfflineCloud,
  getLocalDeviceId,
  isVirtualDemoCustomer,
  posRealtimeChannel,
  subscribeToOwnerBroadcasts,
  sendOwnerBroadcastCloud,
  acknowledgeOwnerBroadcastCloud,
  auth,
  completeGoogleRedirectSignIn,
  getFirebaseAuthErrorMessage,
  signInWithGoogle,
  signOutFirebase,
  validateAuthorizedAuthUser,
  submitOperationalAccessRequestCloud,
  getOwnOperationalAccessRequestCloud,
  subscribeToOperationalAccessRequestsCloud,
  type OperationalAccessRequestStatus,
  type SnapshotFreshness,
} from './services/firebase';
import { getSaleStockDeductions } from './services/saleSync';
import type { DashboardDataSourceHealthMap, DashboardDataSourceKey, DashboardDataSourceState } from './services/dashboardDataTypes';
import { clearSessionUser, canAccessView, hasPermission, logRejectedAccessAttempt } from './services/authService';
import { Lock, Radio, CheckCircle2, X, Sparkles, Star, Clock, Hourglass, ExternalLink, Repeat } from 'lucide-react';

// Seed Data
const INITIAL_PRODUCTS: Product[] = [
  { id: 1, name: "أديداس", brand: "Adidas", origin: "ألماني", gender: "مشترك", season: "صيف", type: "عادي", stock_grams: 1000 },
  { id: 2, name: "أكوا بروفومو", brand: "جورجيو أرماني", origin: "إيطالي", gender: "رجالي", season: "صيف", type: "عادي", stock_grams: 1000 },
  { id: 3, name: "أكوا دي جيو", brand: "جورجيو أرماني", origin: "إيطالي", gender: "رجالي", season: "صيف", type: "عادي", stock_grams: 1000 },
  { id: 4, name: "ألترا مارين", brand: "جيفنشي", origin: "فرنسي", gender: "رجالي", season: "صيف", type: "عادي", stock_grams: 1000 },
  { id: 5, name: "اسكيب", brand: "الرصاصي", origin: "إماراتي", gender: "نسائي", season: "صيف", type: "عادي", stock_grams: 1000 },
  { id: 6, name: "اسكلبشر", brand: "نيكوس", origin: "ألماني", gender: "رجالي", season: "صيف", type: "عادي", stock_grams: 1000 },
  { id: 7, name: "انفيكتوس", brand: "باكو رابان", origin: "فرنسي", gender: "رجالي", season: "صيف", type: "عادي", stock_grams: 1000 },
  { id: 8, name: "بلو شانيل", brand: "شانيل", origin: "فرنسي", gender: "رجالي", season: "صيف", type: "عادي", stock_grams: 1000 },
  { id: 9, name: "جي شو", brand: "جيفنشي", origin: "فرنسي", gender: "نسائي", season: "صيف", type: "عادي", stock_grams: 1000 },
  { id: 10, name: "روزڤانيلا", brand: "الرصاصي", origin: "إماراتي", gender: "نسائي", season: "صيف", type: "عادي", stock_grams: 1000 },
  { id: 11, name: "عود كمبودي", brand: "الرصاصي", origin: "إماراتي", gender: "رجالي", season: "صيف", type: "عود", stock_grams: 1000 },
  { id: 12, name: "فواكه", brand: "الرصاصي", origin: "إماراتي", gender: "نسائي", season: "صيف", type: "عادي", stock_grams: 1000 },
  { id: 13, name: "كليك فلير", brand: "الرصاصي", origin: "إماراتي", gender: "مشترك", season: "صيف", type: "عادي", stock_grams: 1000 },
  { id: 14, name: "لاكوست اسنشيال", brand: "لاكوست", origin: "فرنسي", gender: "رجالي", season: "صيف", type: "عادي", stock_grams: 1000 },
  { id: 15, name: "لاكوست وايت", brand: "لاكوست", origin: "فرنسي", gender: "مشترك", season: "صيف", type: "عادي", stock_grams: 1000 },
  { id: 16, name: "مون سباركل", brand: "الرصاصي", origin: "إماراتي", gender: "نسائي", season: "صيف", type: "عادي", stock_grams: 1000 },
  { id: 17, name: "نيرولي", brand: "الرصاصي", origin: "إماراتي", gender: "مشترك", season: "صيف", type: "عادي", stock_grams: 1000 },
  { id: 18, name: "هيريرا", brand: "كارولينا هيريرا", origin: "أمريكي", gender: "نسائي", season: "صيف", type: "عادي", stock_grams: 1000 },
  { id: 19, name: "ورد الطائف", brand: "الرصاصي", origin: "إماراتي", gender: "مشترك", season: "صيف", type: "عادي", stock_grams: 1000 },
  { id: 20, name: "ڤيرساتشي إيروس", brand: "فيرساتشي", origin: "إيطالي", gender: "رجالي", season: "صيف", type: "عادي", stock_grams: 1000 },
  { id: 21, name: "ويك إند", brand: "بوربري", origin: "بريطاني", gender: "نسائي", season: "صيف", type: "عادي", stock_grams: 1000 },
  { id: 22, name: "أمير العود", brand: "الرصاصي", origin: "إماراتي", gender: "رجالي", season: "شتاء", type: "عود", stock_grams: 1000 },
  { id: 23, name: "بلاك أفغانو", brand: "ناسوماتو", origin: "إيطالي", gender: "مشترك", season: "شتاء", type: "عود", stock_grams: 1000 },
  { id: 24, name: "بلاك أوركيد", brand: "توم فورد", origin: "أمريكي", gender: "نسائي", season: "شتاء", type: "نيش", stock_grams: 1000 },
  { id: 25, name: "بلاك أوبيوم", brand: "إيف سان لوران", origin: "فرنسي", gender: "نسائي", season: "شتاء", type: "عادي", stock_grams: 1000 },
  { id: 26, name: "بلاك بيور", brand: "مونتال", origin: "فرنسي", gender: "رجالي", season: "شتاء", type: "عود", stock_grams: 1000 },
  { id: 27, name: "توباكو ڤانيلا", brand: "توم فورد", origin: "أمريكي", gender: "مشترك", season: "شتاء", type: "نيش", stock_grams: 1000 },
  { id: 28, name: "ثري جي", brand: "الرصاصي", origin: "إماراتي", gender: "رجالي", season: "شتاء", type: "عادي", stock_grams: 1000 },
  { id: 29, name: "جوتشي رش", brand: "غوتشي", origin: "إيطالي", gender: "نسائي", season: "شتاء", type: "عادي", stock_grams: 1000 },
  { id: 30, name: "داركار نوار", brand: "جاي لاروش", origin: "فرنسي", gender: "رجالي", season: "شتاء", type: "عادي", stock_grams: 1000 },
  { id: 31, name: "دهن العود", brand: "الرصاصي", origin: "إماراتي", gender: "رجالي", season: "شتاء", type: "عود", stock_grams: 1000 },
  { id: 32, name: "دنهل أحمر", brand: "دنهل", origin: "بريطاني", gender: "رجالي", season: "شتاء", type: "عادي", stock_grams: 1000 },
  { id: 33, name: "ريد عود", brand: "مونتال", origin: "فرنسي", gender: "رجالي", season: "شتاء", type: "عود", stock_grams: 1000 },
  { id: 34, name: "سلطان العود", brand: "الرصاصي", origin: "إماراتي", gender: "رجالي", season: "شتاء", type: "عود", stock_grams: 1000 },
  { id: 35, name: "سيلڤر سنت", brand: "جاك بوجارت", origin: "فرنسي", gender: "رجالي", season: "شتاء", type: "عادي", stock_grams: 1000 },
  { id: 36, name: "شيروتي", brand: "شيروتي", origin: "إيطالي", gender: "رجالي", season: "شتاء", type: "عادي", stock_grams: 1000 },
  { id: 37, name: "عنبر أسود", brand: "الرصاصي", origin: "إماراتي", gender: "مشترك", season: "شتاء", type: "عود", stock_grams: 1000 },
  { id: 38, name: "عود اصفهان", brand: "الرصاصي", origin: "إماراتي", gender: "رجالي", season: "شتاء", type: "عود", stock_grams: 1000 },
  { id: 39, name: "عود الحرمين", brand: "الحرمين", origin: "سعودي", gender: "رجالي", season: "شتاء", type: "عود", stock_grams: 1000 },
  { id: 40, name: "عود شيخه", brand: "الرصاصي", origin: "إماراتي", gender: "نسائي", season: "شتاء", type: "عود", stock_grams: 1000 },
  { id: 41, name: "عود مضاوي", brand: "الرصاصي", origin: "إماراتي", gender: "رجالي", season: "شتاء", type: "عود", stock_grams: 1000 },
  { id: 42, name: "فورجي", brand: "الرصاصي", origin: "إماراتي", gender: "رجالي", season: "شتاء", type: "عادي", stock_grams: 1000 },
  { id: 43, name: "كريزي لاڤ", brand: "الرصاصي", origin: "إماراتي", gender: "نسائي", season: "شتاء", type: "عادي", stock_grams: 1000 },
  { id: 44, name: "مسك مكه", brand: "الرصاصي", origin: "إماراتي", gender: "رجالي", season: "شتاء", type: "مسك", stock_grams: 1000 },
  { id: 45, name: "مونتانا", brand: "مونتانا", origin: "فرنسي", gender: "رجالي", season: "شتاء", type: "عادي", stock_grams: 1000 },
  { id: 46, name: "فقط للرجال", brand: "الرصاصي", origin: "إماراتي", gender: "رجالي", season: "شتاء", type: "عادي", stock_grams: 1000 },
  { id: 47, name: "أترنيتي", brand: "كالفن كلاين", origin: "أمريكي", gender: "نسائي", season: "كل الفصول", type: "عادي", stock_grams: 1000 },
  { id: 48, name: "أربابورا", brand: "زيرجوف", origin: "إيطالي", gender: "مشترك", season: "كل الفصول", type: "نيش", stock_grams: 1000 },
  { id: 49, name: "أرماني بلاك كود", brand: "جورجيو أرماني", origin: "إيطالي", gender: "رجالي", season: "كل الفصول", type: "عادي", stock_grams: 1000 },
  { id: 50, name: "استرونجر ويز يو", brand: "جورجيو أرماني", origin: "إيطالي", gender: "رجالي", season: "كل الفصول", type: "عادي", stock_grams: 1000 },
  { id: 51, name: "أكسيريوس روج", brand: "جيفنشي", origin: "فرنسي", gender: "رجالي", season: "كل الفصول", type: "عادي", stock_grams: 1000 },
  { id: 52, name: "ألترا مال", brand: "جان بول غوتييه", origin: "فرنسي", gender: "رجالي", season: "كل الفصول", type: "عادي", stock_grams: 1000 },
  { id: 53, name: "ألمبيا", brand: "باكو رابان", origin: "فرنسي", gender: "نسائي", season: "كل الفصول", type: "عادي", stock_grams: 1000 },
  { id: 54, name: "الوسام", brand: "الرصاصي", origin: "إماراتي", gender: "رجالي", season: "كل الفصول", type: "عادي", stock_grams: 1000 },
  { id: 55, name: "الهضبة", brand: "عمرو دياب", origin: "مصري", gender: "رجالي", season: "كل الفصول", type: "عادي", stock_grams: 1000 },
  { id: 56, name: "أندرويد", brand: "أندرويد هوم", origin: "غير محدد", gender: "رجالي", season: "كل الفصول", type: "عادي", stock_grams: 1000 },
  { id: 57, name: "أنجل", brand: "تيري موغلر", origin: "فرنسي", gender: "نسائي", season: "كل الفصول", type: "عادي", stock_grams: 1000 },
  { id: 58, name: "أورجانزا", brand: "جيفنشي", origin: "فرنسي", gender: "نسائي", season: "كل الفصول", type: "عادي", stock_grams: 1000 },
  { id: 59, name: "باد بوي", brand: "كارولينا هيريرا", origin: "أمريكي", gender: "رجالي", season: "كل الفصول", type: "عادي", stock_grams: 1000 },
  { id: 60, name: "باي جيفنشي", brand: "جيفنشي", origin: "فرنسي", gender: "رجالي", season: "كل الفصول", type: "عادي", stock_grams: 1000 },
  { id: 61, name: "بربري هير", brand: "بوربري", origin: "بريطاني", gender: "نسائي", season: "كل الفصول", type: "عادي", stock_grams: 1000 },
  { id: 62, name: "برشيوس", brand: "لورد أوف هوستري", origin: "غير محدد", gender: "مشترك", season: "كل الفصول", type: "عادي", stock_grams: 1000 },
  { id: 63, name: "بكرات روج", brand: "ميسون فرانسيس كركديجيان", origin: "فرنسي", gender: "مشترك", season: "كل الفصول", type: "نيش", stock_grams: 1000 },
  { id: 64, name: "بلاك بوشن", brand: "باكو رابان", origin: "فرنسي", gender: "رجالي", season: "كل الفصول", type: "عادي", stock_grams: 1000 },
  { id: 65, name: "بنك شوجر", brand: "أكوالينا", origin: "إيطالي", gender: "نسائي", season: "كل الفصول", type: "عادي", stock_grams: 1000 },
  { id: 66, name: "بوند نمبر ٩", brand: "بوند نمبر ٩", origin: "أمريكي", gender: "رجالي", season: "كل الفصول", type: "نيش", stock_grams: 1000 },
  { id: 67, name: "بي إم دبليو", brand: "كوزمو آبي", origin: "مصري", gender: "رجالي", season: "كل الفصول", type: "عادي", stock_grams: 1000 },
  { id: 68, name: "تومي بوي", brand: "تومي هيلفيغر", origin: "أمريكي", gender: "رجالي", season: "كل الفصول", type: "عادي", stock_grams: 1000 },
  { id: 69, name: "ذا وان", brand: "دولتشي أند غابانا", origin: "إيطالي", gender: "نسائي", season: "كل الفصول", type: "عادي", stock_grams: 1000 },
  { id: 70, name: "جادور", brand: "ديور", origin: "فرنسي", gender: "نسائي", season: "كل الفصول", type: "عادي", stock_grams: 1000 },
  { id: 71, name: "جاجوار جرين", brand: "جاغوار", origin: "بريطاني", gender: "رجالي", season: "كل الفصول", type: "عادي", stock_grams: 1000 },
  { id: 72, name: "جود جيرل", brand: "كارولينا هيريرا", origin: "أمريكي", gender: "نسائي", season: "كل الفصول", type: "عادي", stock_grams: 1000 },
  { id: 73, name: "حكاية", brand: "مسك الحرمين", origin: "سعودي", gender: "مشترك", season: "كل الفصول", type: "مسك", stock_grams: 1000 },
  { id: 74, name: "خمرة", brand: "لطافة", origin: "إماراتي", gender: "مشترك", season: "كل الفصول", type: "عادي", stock_grams: 1000 },
  { id: 75, name: "خوخ", brand: "الماجد للعود", origin: "سعودي", gender: "مشترك", season: "كل الفصول", type: "عادي", stock_grams: 1000 },
  { id: 76, name: "دافي دوف", brand: "دافيدوف", origin: "فرنسي", gender: "رجالي", season: "كل الفصول", type: "عادي", stock_grams: 1000 },
  { id: 77, name: "دعاء الجنة", brand: "علامات تجارية متعددة", origin: "شرق أوسطي", gender: "مشترك", season: "كل الفصول", type: "عادي", stock_grams: 1000 },
  { id: 78, name: "دنهل ديزاير", brand: "دنهل", origin: "بريطاني", gender: "رجالي", season: "كل الفصول", type: "عادي", stock_grams: 1000 },
  { id: 79, name: "رومبا", brand: "تيد لابيدوس", origin: "فرنسي", gender: "نسائي", season: "كل الفصول", type: "عادي", stock_grams: 1000 },
  { id: 80, name: "روشاس", brand: "روشاس", origin: "فرنسي", gender: "رجالي", season: "كل الفصول", type: "عادي", stock_grams: 1000 },
  { id: 81, name: "رويال", brand: "الرصاصي", origin: "إماراتي", gender: "نسائي", season: "كل الفصول", type: "عادي", stock_grams: 1000 },
  { id: 82, name: "روز مسك", brand: "مونتال", origin: "فرنسي", gender: "نسائي", season: "كل الفصول", type: "مسك", stock_grams: 1000 },
  { id: 83, name: "سكاندال", brand: "جان بول غوتييه", origin: "فرنسي", gender: "نسائي", season: "كل الفصول", type: "عادي", stock_grams: 1000 },
  { id: 84, name: "سلطان العطور", brand: "برفيوم تريجر", origin: "غير محدد", gender: "مشترك", season: "كل الفصول", type: "عادي", stock_grams: 1000 },
  { id: 85, name: "سوبر سلطان", brand: "سدر الخليج", origin: "سعودي", gender: "رجالي", season: "كل الفصول", type: "عادي", stock_grams: 1000 },
  { id: 86, name: "سي كي", brand: "كالفن كلاين", origin: "أمريكي", gender: "مشترك", season: "كل الفصول", type: "عادي", stock_grams: 1000 },
  { id: 87, name: "سيجار", brand: "ريمي لاتور", origin: "فرنسي", gender: "رجالي", season: "كل الفصول", type: "عادي", stock_grams: 1000 },
  { id: 88, name: "شانيل بلاتينيوم", brand: "شانيل", origin: "فرنسي", gender: "رجالي", season: "كل الفصول", type: "عادي", stock_grams: 1000 },
  { id: 89, name: "شمس الإمارات", brand: "لطافة", origin: "إماراتي", gender: "رجالي", season: "كل الفصول", type: "عادي", stock_grams: 1000 },
  { id: 90, name: "شيخ جولد", brand: "شيخ", origin: "بحريني", gender: "رجالي", season: "كل الفصول", type: "عادي", stock_grams: 1000 },
  { id: 91, name: "عنبر أبيض", brand: "كريد", origin: "فرنسي", gender: "مشترك", season: "كل الفصول", type: "نيش", stock_grams: 1000 },
  { id: 92, name: "عود أبيض", brand: "الرصاصي", origin: "إماراتي", gender: "مشترك", season: "كل الفصول", type: "عود", stock_grams: 1000 },
  { id: 93, name: "عود ركان", brand: "سويس أربيان", origin: "إماراتي", gender: "رجالي", season: "كل الفصول", type: "عود", stock_grams: 1000 },
  { id: 94, name: "عود عماني", brand: "عمان لكجري", origin: "عماني", gender: "مشترك", season: "كل الفصول", type: "عود", stock_grams: 1000 },
  { id: 95, name: "عود ملكي", brand: "شوبارد", origin: "سويسري", gender: "رجالي", season: "كل الفصول", type: "عود", stock_grams: 1000 },
  { id: 96, name: "عود مود", brand: "الرصاصي", origin: "إماراتي", gender: "مشترك", season: "كل الفصول", type: "عود", stock_grams: 1000 },
  { id: 97, name: "عود مبخر", brand: "الرصاصي", origin: "إماراتي", gender: "مشترك", season: "كل الفصول", type: "عود", stock_grams: 1000 },
  { id: 98, name: "فندي", brand: "فندي", origin: "إيطالي", gender: "نسائي", season: "كل الفصول", type: "عادي", stock_grams: 1000 },
  { id: 99, name: "فل", brand: "الرصاصي", origin: "إماراتي", gender: "نسائي", season: "كل الفصول", type: "عادي", stock_grams: 1000 },
  { id: 100, name: "ڤيكتوريا سيكريت", brand: "فيكتوريا سيكريت", origin: "أمريكي", gender: "نسائي", season: "كل الفصول", type: "عادي", stock_grams: 1000 },
  { id: 101, name: "فيري سكسي ناو", brand: "فيكتوريا سيكريت", origin: "أمريكي", gender: "نسائي", season: "كل الفصول", type: "عادي", stock_grams: 1000 },
  { id: 102, name: "كاريزما", brand: "باريس فلورز", origin: "فرنسي", gender: "رجالي", season: "كل الفصول", type: "عادي", stock_grams: 1000 },
  { id: 103, name: "كاسيليا", brand: "باكوما", origin: "فرنسي", gender: "نسائي", season: "كل الفصول", type: "عادي", stock_grams: 1000 },
  { id: 104, name: "كروما ليجند", brand: "أزارو", origin: "فرنسي", gender: "رجالي", season: "كل الفصول", type: "عادي", stock_grams: 1000 },
  { id: 105, name: "كوكو شانيل", brand: "شانيل", origin: "فرنسي", gender: "نسائي", season: "كل الفصول", type: "عادي", stock_grams: 1000 },
  { id: 106, name: "كلمات", brand: "العربية للعود", origin: "سعودي", gender: "مشترك", season: "كل الفصول", type: "عادي", stock_grams: 1000 },
  { id: 107, name: "كليك فلير أصفر", brand: "ريفلون", origin: "أمريكي", gender: "نسائي", season: "كل الفصول", type: "عادي", stock_grams: 1000 },
  { id: 108, name: "لافندر", brand: "أحمد المغربي", origin: "إماراتي", gender: "مشترك", season: "كل الفصول", type: "عادي", stock_grams: 1000 },
  { id: 109, name: "لابيدوس", brand: "تيد لابيدوس", origin: "فرنسي", gender: "رجالي", season: "كل الفصول", type: "عادي", stock_grams: 1000 },
  { id: 110, name: "لومال جان بلو", brand: "جان بول غوتييه", origin: "فرنسي", gender: "رجالي", season: "كل الفصول", type: "عادي", stock_grams: 1000 },
  { id: 111, name: "لڤلي بيل", brand: "الرصاصي", origin: "إماراتي", gender: "نسائي", season: "كل الفصول", type: "عادي", stock_grams: 1000 },
  { id: 112, name: "ليالي المدينة", brand: "جنيد للعطور", origin: "بحريني", gender: "مشترك", season: "كل الفصول", type: "عادي", stock_grams: 1000 },
  { id: 113, name: "ماربرت مان", brand: "ماربرت", origin: "فرنسي", gender: "رجالي", season: "كل الفصول", type: "عادي", stock_grams: 1000 },
  { id: 114, name: "ميدنايت", brand: "ديور", origin: "فرنسي", gender: "نسائي", season: "كل الفصول", type: "عادي", stock_grams: 1000 },
  { id: 115, name: "مسك أبيض", brand: "جوفان", origin: "أمريكي", gender: "رجالي", season: "كل الفصول", type: "مسك", stock_grams: 1000 },
  { id: 116, name: "مسك الطهارة", brand: "علامات تجارية متعددة", origin: "سعودي/شرق أوسطي", gender: "مشترك", season: "كل الفصول", type: "مسك", stock_grams: 1000 },
  { id: 117, name: "مشاري", brand: "الرصاصي", origin: "إماراتي", gender: "رجالي", season: "كل الفصول", type: "عادي", stock_grams: 1000 },
  { id: 118, name: "موصلاح", brand: "كونكا", origin: "غير محدد", gender: "مشترك", season: "كل الفصول", type: "عادي", stock_grams: 1000 },
  { id: 119, name: "مون بلو", brand: "الرصاصي", origin: "إماراتي", gender: "رجالي", season: "كل الفصول", type: "عادي", stock_grams: 1000 },
  { id: 120, name: "نسائم", brand: "أجمل", origin: "إماراتي", gender: "مشترك", season: "كل الفصول", type: "عادي", stock_grams: 1000 },
  { id: 121, name: "نساء العالم", brand: "الرصاصي", origin: "إماراتي", gender: "نسائي", season: "كل الفصول", type: "عادي", stock_grams: 1000 },
  { id: 122, name: "ون مليون", brand: "باكو رابان", origin: "فرنسي", gender: "رجالي", season: "كل الفصول", type: "عادي", stock_grams: 1000 },
  { id: 123, name: "وصال", brand: "أجمل", origin: "إماراتي", gender: "نسائي", season: "كل الفصول", type: "عادي", stock_grams: 1000 },
  { id: 124, name: "ورد بلدي", brand: "الدخيل للعود", origin: "سعودي", gender: "مشترك", season: "كل الفصول", type: "عادي", stock_grams: 1000 },
  { id: 125, name: "ياسمين", brand: "الرصاصي", origin: "إماراتي", gender: "نسائي", season: "كل الفصول", type: "عادي", stock_grams: 1000 },
  { id: 126, name: "إيلي صعب", brand: "إيلي صعب", origin: "لبناني", gender: "نسائي", season: "كل الفصول", type: "عادي", stock_grams: 1000 },
  { id: 127, name: "أزورو", brand: "أزارو", origin: "فرنسي", gender: "رجالي", season: "كل الفصول", type: "عادي", stock_grams: 1000 }
];

const isInitialCatalogTemplate = (product: Product): boolean =>
  INITIAL_PRODUCTS.some((template) =>
    String(template.id) === String(product.id)
    && template.name === product.name
    && template.stock_grams === product.stock_grams
  );

// Default is strictly zero sales as requested (no mock or simulated sales)
const INITIAL_SALES: Sale[] = [];

// §1, §2, §36–39, §93: الموازنة الثابتة الشهرية (15,000 ج = 14,700 معلومة + 300 احتياطي) هي التزام تخطيطي شهري
// وليست مصروفاً نقدياً يومياً يُخصم من خزنة اليوم الواحد. لذلك تبدأ المصروفات النقدية اليومية الفعلية فارغة (0 ج)
// ولا يُسجل فيها إلا ما دُفع فعلياً من الدرج أو الخزنة أثناء التشغيل.
const INITIAL_EXPENSES: Expense[] = [];

const mergeAuditLogRecords = (
  existing: AuditLogRecord[],
  incoming: AuditLogRecord[]
): AuditLogRecord[] => {
  const recordsById = new Map(existing.map((record) => [record.id, record]));
  incoming.forEach((record) => recordsById.set(record.id, record));
  return Array.from(recordsById.values()).sort(
    (a, b) => new Date(b.timestamp || 0).getTime() - new Date(a.timestamp || 0).getTime()
  );
};

interface DashboardServerData {
  sales: Sale[];
  products: Product[];
  expenses: Expense[];
  settings: Partial<StoreSettings> | null;
  vaults: FinancialVault[];
  withdrawals: WithdrawalTransaction[];
  closures: DailyClosure[];
  customers: CustomCustomerRecord[];
}

const createInitialDashboardFeedHealth = (): DashboardDataSourceHealthMap => ({
  sales: { state: 'connecting', lastConfirmedAt: null },
  products: { state: 'connecting', lastConfirmedAt: null },
  expenses: { state: 'connecting', lastConfirmedAt: null },
  settings: { state: 'connecting', lastConfirmedAt: null },
  vaults: { state: 'connecting', lastConfirmedAt: null },
  withdrawals: { state: 'connecting', lastConfirmedAt: null },
  closures: { state: 'connecting', lastConfirmedAt: null },
  customers: { state: 'connecting', lastConfirmedAt: null },
});

const createInitialDashboardServerData = (): DashboardServerData => ({
  sales: [],
  products: [],
  expenses: [],
  settings: null,
  vaults: [],
  withdrawals: [],
  closures: [],
  customers: [],
});

const getBrowserLocalDateKey = (date = new Date()): string => {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

const App: React.FC = () => {
  const ownerPrivateSessionRef = useRef(new OwnerPrivateSessionGate());
  const ownerSessionGeneration = ownerPrivateSessionRef.current.generation;
  const [currentView, setCurrentView] = useState<View>(View.DASHBOARD);
  const [formulationProduct, setFormulationProduct] = useState<Product | null>(null);

  // Owner-only caches start empty. They are not read until verified Google-owner auth completes.
  const [products, setProducts] = useState<Product[]>([]);

  const [sales, setSales] = useState<Sale[]>([]);

  const [expenses, setExpenses] = useState<Expense[]>([]);

  const [settings, setSettings] = useState<StoreSettings>(DEFAULT_SETTINGS);

  const [bottleSizes, setBottleSizes] = useState<BottleSize[]>([]);

  const [vaults, setVaults] = useState<FinancialVault[]>([]);

  const [withdrawals, setWithdrawals] = useState<WithdrawalTransaction[]>([]);

  const [attendanceRecords, setAttendanceRecords] = useState<StaffAttendanceRecord[]>([]);

  const [batches, setBatches] = useState<ProductionBatch[]>([]);

  const [auditLogs, setAuditLogs] = useState<AuditLogRecord[]>([]);
  const auditArchiveCursorRef = useRef<AuditLogPageCursor | null>(null);
  const auditArchiveLoadingRef = useRef(false);
  const auditArchiveHasMoreRef = useRef(true);
  const [hasMoreAuditLogs, setHasMoreAuditLogs] = useState(true);
  const [isLoadingAuditLogs, setIsLoadingAuditLogs] = useState(false);
  const [isLoadingAllAuditLogs, setIsLoadingAllAuditLogs] = useState(false);

  const loadMoreAuditLogs = useCallback(async () => {
    const generation = ownerPrivateSessionRef.current.generation;
    if (!ownerPrivateSessionRef.current.isAuthorized(generation)) return;
    if (auditArchiveLoadingRef.current || !auditArchiveHasMoreRef.current) return;
    auditArchiveLoadingRef.current = true;
    setIsLoadingAuditLogs(true);
    try {
      const page = await loadAuditLogsPage(auditArchiveCursorRef.current);
      if (!ownerPrivateSessionRef.current.isAuthorized(generation)) return;
      auditArchiveCursorRef.current = page.nextCursor;
      auditArchiveHasMoreRef.current = page.hasMore;
      setHasMoreAuditLogs(page.hasMore);
      if (page.records.length > 0) {
        setAuditLogs((existing) => mergeAuditLogRecords(existing, page.records));
      }
    } catch (error) {
      console.error('Failed to load the next audit-log page:', error);
    } finally {
      auditArchiveLoadingRef.current = false;
      setIsLoadingAuditLogs(false);
    }
  }, []);

  const loadAllAuditLogs = useCallback(async () => {
    const generation = ownerPrivateSessionRef.current.generation;
    if (!ownerPrivateSessionRef.current.isAuthorized(generation)) return;
    if (auditArchiveLoadingRef.current || !auditArchiveHasMoreRef.current) return;
    auditArchiveLoadingRef.current = true;
    setIsLoadingAuditLogs(true);
    setIsLoadingAllAuditLogs(true);
    try {
      let hasMore = auditArchiveHasMoreRef.current;
      while (hasMore) {
        if (!ownerPrivateSessionRef.current.isAuthorized(generation)) return;
        const page = await loadAuditLogsPage(auditArchiveCursorRef.current);
        if (!ownerPrivateSessionRef.current.isAuthorized(generation)) return;
        auditArchiveCursorRef.current = page.nextCursor;
        hasMore = page.hasMore && page.records.length > 0;
        auditArchiveHasMoreRef.current = hasMore;
        setHasMoreAuditLogs(hasMore);
        if (page.records.length > 0) {
          setAuditLogs((existing) => mergeAuditLogRecords(existing, page.records));
        }
      }
    } catch (error) {
      console.error('Failed to load the complete audit-log archive:', error);
    } finally {
      auditArchiveLoadingRef.current = false;
      setIsLoadingAuditLogs(false);
      setIsLoadingAllAuditLogs(false);
    }
  }, []);

  const [authStatus, setAuthStatus] = useState<'checking' | 'signed_out' | 'unauthorized' | 'error' | 'ready'>('checking');
  const [authEmail, setAuthEmail] = useState<string | null>(null);
  const [authError, setAuthError] = useState<string | null>(null);
  const [isSigningIn, setIsSigningIn] = useState(false);
  const [accessRequestStatus, setAccessRequestStatus] = useState<OperationalAccessRequestStatus | 'none'>('none');
  const [isSubmittingAccessRequest, setIsSubmittingAccessRequest] = useState(false);
  const [isCheckingAccessRequest, setIsCheckingAccessRequest] = useState(false);
  const [isPreparingTarekCatalog, setIsPreparingTarekCatalog] = useState(false);
  const [tarekCatalogPrepStatus, setTarekCatalogPrepStatus] = useState<string | null>(null);

  useEffect(() => {
    const generation = ownerPrivateSessionRef.current.generation;
    if (authStatus !== 'ready' || authEmail?.trim().toLowerCase() !== 'moh.mhran@gmail.com'
      || !ownerPrivateSessionRef.current.isAuthorized(generation)) return;
    return subscribeToTodaysAuditLogs((cloudAudit) => {
      if (!ownerPrivateSessionRef.current.isAuthorized(generation)) return;
      setAuditLogs((existing) => mergeAuditLogRecords(existing, cloudAudit));
    });
  }, [authStatus, authEmail, ownerSessionGeneration]);

  useEffect(() => {
    const generation = ownerPrivateSessionRef.current.generation;
    if (authStatus !== 'ready' || authEmail?.trim().toLowerCase() !== 'moh.mhran@gmail.com'
      || !ownerPrivateSessionRef.current.isAuthorized(generation)) return;
    if (currentView === View.AUDIT_LOGS) void loadMoreAuditLogs();
  }, [authStatus, authEmail, currentView, loadMoreAuditLogs, ownerSessionGeneration]);

  // User profiles are local/application data only; Firebase Auth is the sole identity source.
  const sanitizeUserAccount = (u: AppUser): AppUser => {
    const uname = (u.username || '').toLowerCase().trim();
    const dname = (u.displayName || '').trim();
    const isOwnerMohamed =
      u.id === 'user-mohamed' ||
      uname === 'mohamed' ||
      uname === 'محمد' ||
      u.role === 'OWNER' ||
      dname.includes('محمد');

    if (isOwnerMohamed) {
      return {
        ...DEFAULT_USERS[0],
        ...u,
        id: u.id || 'user-mohamed',
        username: 'mohamed',
        displayName: u.displayName || 'د. محمد (المالك)',
        role: 'OWNER',
        passwordHash: u.passwordHash || '',
        isActive: true,
        requiresPasswordChange: false,
        permissions: {
          ...OWNER_FULL_PERMISSIONS,
        },
      };
    }

    const isTarek =
      u.id === 'user-tarek' ||
      u.id === 'user-tarek-sales' ||
      uname === 'tarek' ||
      uname === 'طارق' ||
      dname.includes('طارق');

    if (isTarek) {
      return {
        ...DEFAULT_USERS[1],
        ...u,
        id: u.id || 'user-tarek',
        username: 'tarek',
        displayName: u.displayName || 'طارق (مسؤول ومدير المبيعات)',
        role: 'STORE_MANAGER',
        passwordHash: u.passwordHash || '',
        isActive: true,
        requiresPasswordChange: false,
        permissions: {
          ...TAREK_OPERATIONAL_PERMISSIONS,
          // Strictly enforce protection on sensitive financial & settings data
          canViewCostAndProfit: false,
          canViewAuditLogs: false,
          canExportData: false,
          canEditSettingsAndBudgets: false,
          canDeleteInvoices: false,
        },
      };
    }
    return {
      ...u,
      isActive: u.isActive !== false,
      requiresPasswordChange: false,
    };
  };

  const ensureCoreUsersList = (rawUsers: AppUser[]): AppUser[] => {
    const sanitizedList = Array.isArray(rawUsers) ? rawUsers.map(sanitizeUserAccount) : [];
    const existingOwner = sanitizedList.find(
      (u) => u.role === 'OWNER' || u.username === 'mohamed' || u.id === 'user-mohamed'
    );
    const existingTarek = sanitizedList.find(
      (u) => u.username === 'tarek' || u.id === 'user-tarek' || u.id === 'user-tarek-sales'
    );
    const otherUsers = sanitizedList.filter(
      (u) => u !== existingOwner && u !== existingTarek
    );

    return [
      existingOwner || sanitizeUserAccount(DEFAULT_USERS[0]),
      existingTarek || sanitizeUserAccount(DEFAULT_USERS[1]),
      ...otherUsers,
    ];
  };

  const [users, setUsers] = useState<AppUser[]>([]);

  const [currentUser, setCurrentUser] = useState<AppUser | null>(null);
  const hasVerifiedOwnerPrivateAccess = ownerPrivateSessionRef.current.isAuthorized(ownerSessionGeneration);
  const persistOwnerPrivateData = <T,>(storageKey: string, data: T, expectedGeneration = ownerSessionGeneration): boolean =>
    persistOwnerPrivateCache(ownerPrivateSessionRef.current, expectedGeneration, storageKey, data);

  const [dashboardFeedHealth, setDashboardFeedHealth] = useState<DashboardDataSourceHealthMap>(
    createInitialDashboardFeedHealth
  );
  const [dashboardServerData, setDashboardServerData] = useState<DashboardServerData>(
    createInitialDashboardServerData
  );
  const reportDashboardSource = useCallback((
    key: DashboardDataSourceKey,
    freshness: SnapshotFreshness | 'restricted',
    data?: DashboardServerData[DashboardDataSourceKey]
  ) => {
    if (!ownerPrivateSessionRef.current.isAuthorized(ownerSessionGeneration)) return;
    const state = freshness as DashboardDataSourceState;
    setDashboardFeedHealth((previous) => ({
      ...previous,
      [key]: {
        state,
        lastConfirmedAt: state === 'live' ? new Date().toISOString() : previous[key].lastConfirmedAt,
      },
    }));
    if (state === 'live' && data !== undefined) {
      setDashboardServerData((previous) => ({ ...previous, [key]: data } as DashboardServerData));
    }
  }, [ownerSessionGeneration]);

  // User roles are derived from verified Firebase Google identity; no local staff impersonation is permitted.
  const [rejectedAttemptsCount, setRejectedAttemptsCount] = useState<number>(0);

  const effectiveUser = currentUser;

  // Auto-redirect unauthorized views immediately to Tarek Workspace or POS
  useEffect(() => {
    if (effectiveUser && !canAccessView(effectiveUser, currentView)) {
      const fallbackView = canAccessView(effectiveUser, View.TAREK_WORKSPACE)
        ? View.TAREK_WORKSPACE
        : canAccessView(effectiveUser, View.POS)
        ? View.POS
        : View.POS;
      setCurrentView(fallbackView);
    }
  }, [effectiveUser, currentView]);

  // Apple Top Dynamic Island Notifications State
  const [topNotifications, setTopNotifications] = useState<AppleNotificationItem[]>([]);

  const pushTopNotification = (
    type: AppleNotificationType,
    title: string,
    subtitle?: string,
    badgeText?: string,
    actionLabel?: string,
    onAction?: () => void
  ) => {
    const id = `notif-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
    const newItem: AppleNotificationItem = {
      id,
      type,
      title,
      subtitle,
      badgeText,
      actionLabel,
      onAction,
      createdAt: new Date().toISOString(),
    };
    setTopNotifications(prev => [newItem, ...prev.slice(0, 3)]);

    // Smart modern intelligent audio cues
    try {
      if (type === 'sale' || type === 'invoice') {
        soundAlertService.playSaleChime();
      } else if (type === 'goal' || type === 'auth' || type === 'success') {
        soundAlertService.playRegisterSuccessChime();
      } else if (type === 'warning' || type === 'stock') {
        soundAlertService.playAlertChime();
      } else {
        soundAlertService.playNotificationChime(type);
      }
    } catch {
      // ignore
    }

    setTimeout(() => {
      setTopNotifications(prev => prev.filter(n => n.id !== id));
    }, 4500);
  };

  const dismissTopNotification = (id: string) => {
    setTopNotifications(prev => prev.filter(n => n.id !== id));
  };

  useEffect(() => {
    if (authStatus !== 'ready' || currentUser?.role !== 'OWNER') return;
    let initialSnapshot = true;
    const seenRequests = new Set<string>();
    return subscribeToOperationalAccessRequestsCloud((requests) => {
      for (const request of requests) {
        const requestKey = `${request.email}:${request.requestedAt}`;
        if (initialSnapshot) {
          seenRequests.add(requestKey);
          continue;
        }
        if (seenRequests.has(requestKey)) continue;
        seenRequests.add(requestKey);
        pushTopNotification(
          'auth',
          'طلب وصول جديد',
          `طلب ${request.email} صلاحية تشغيل؛ لا تُمنح أي صلاحية قبل اختيارك للدور.`,
          'طلب جديد',
          'مراجعة الطلب',
          () => setCurrentView(View.USERS_MANAGEMENT),
        );
      }
      initialSnapshot = false;
    }, (error) => {
      console.error('Unable to subscribe to access requests:', error);
    });
  }, [authStatus, currentUser?.role, currentUser?.id]);

  // Apple Welcome & Lock Screen state for complete store privacy
  const [isScreenLocked, setIsScreenLocked] = useState<boolean>(() => {
    try {
      return sessionStorage.getItem('lamsa_unlocked_session_v1') !== 'true';
    } catch {
      return true;
    }
  });

  const [isAuthModalOpen, setIsAuthModalOpen] = useState(false);
  const [isThemeStudioModalOpen, setIsThemeStudioModalOpen] = useState(false);
  const [passwordChangeUser, setPasswordChangeUser] = useState<AppUser | null>(null);

  // Synchronize active Apple Theme, Typography, Colors, Weight, Stroke, Numeral System & Surface Styles to document root
  useEffect(() => {
    const applyThemeAttributes = () => {
      const resolved = resolveActiveAppTheme(settings, effectiveUser?.id);
      const root = document.documentElement;
      root.setAttribute('data-theme', resolved.id);
      root.setAttribute('data-theme-mode', resolved.isDark ? 'dark' : 'light');
      root.setAttribute('data-ambient', settings.themeAmbientGlow !== false ? 'true' : 'false');
      root.setAttribute('data-glass', settings.themeGlassIntensity || 'balanced');
      root.setAttribute('data-elevation', settings.themeCardElevation || 'floating');
      root.setAttribute('data-font-scale', settings.themeFontScale || 'normal');
      root.setAttribute('data-surface-style', settings.themeSurfaceStyle || 'liquid_glass');
      root.setAttribute('data-border-radius', settings.themeBorderRadius || 'rounded');
      root.setAttribute('data-contrast-level', settings.themeContrastLevel || 'standard');

      // Custom Accent Color
      const customAccent = (settings.themeCustomAccentColor || settings.themeCustomAccent || '').trim();
      if (customAccent) {
        root.setAttribute('data-custom-accent', 'true');
        root.style.setProperty('--custom-accent', customAccent);
        root.style.setProperty('--apple-blue', customAccent);
        root.style.setProperty('--apple-blue-hover', customAccent);
      } else {
        root.removeAttribute('data-custom-accent');
        root.style.removeProperty('--custom-accent');
        root.style.removeProperty('--apple-blue');
        root.style.removeProperty('--apple-blue-hover');
      }

      // Site-Wide Font Family
      const fontMap: Record<string, string> = {
        readex: '"Readex Pro", "Tajawal", -apple-system, BlinkMacSystemFont, sans-serif',
        tajawal: '"Tajawal", "Readex Pro", -apple-system, BlinkMacSystemFont, sans-serif',
        cairo: '"Cairo", "Readex Pro", -apple-system, BlinkMacSystemFont, sans-serif',
        ibm_plex: '"IBM Plex Sans Arabic", "Readex Pro", -apple-system, sans-serif',
        almarai: '"Almarai", "Tajawal", -apple-system, sans-serif',
        noto_kufi: '"Noto Kufi Arabic", "Readex Pro", -apple-system, sans-serif',
        changa: '"Changa", "Cairo", -apple-system, sans-serif',
        amiri: '"Amiri", "Cairo", Georgia, serif',
      };
      const familyCss = fontMap[settings.siteFontFamily || 'readex'] || fontMap.readex;
      root.style.setProperty('--site-font-family', familyCss);

      // Site-Wide Font Size Percent (85% to 125%)
      let sizePercent = settings.siteFontSizePercent || 100;
      if (!settings.siteFontSizePercent && settings.themeFontScale) {
        if (settings.themeFontScale === 'compact') sizePercent = 95;
        else if (settings.themeFontScale === 'comfortable') sizePercent = 106;
      }
      const clampedSize = Math.max(80, Math.min(130, sizePercent));
      root.style.setProperty('--site-font-size', `${clampedSize}%`);
      root.style.setProperty('--site-font-scale-factor', String(Number((clampedSize / 100).toFixed(3))));

      // Site-Wide Font Weight
      const weightId = settings.siteFontWeight || 'regular';
      if (weightId === 'regular') {
        root.removeAttribute('data-font-weight');
      } else {
        root.setAttribute('data-font-weight', weightId);
      }

      // Site-Wide Font Stroke / Thickness (سمك الخط)
      const strokeMap: Record<string, string> = {
        none: '0px',
        crisp: '0.15px',
        medium: '0.32px',
        bold_stroke: '0.50px',
        heavy_stroke: '0.72px',
      };
      root.style.setProperty(
        '--site-text-stroke',
        strokeMap[settings.siteFontStrokeWidth || 'none'] || '0px'
      );

      // Site-Wide Line Height & Letter Spacing
      const lineHeightMap: Record<string, string> = {
        tight: '1.35',
        normal: '1.5',
        relaxed: '1.68',
        spacious: '1.85',
      };
      root.style.setProperty(
        '--site-line-height',
        lineHeightMap[settings.siteLineHeight || 'normal'] || '1.5'
      );

      const letterSpacingMap: Record<string, string> = {
        tight: '-0.015em',
        normal: '0em',
        wide: '0.02em',
      };
      root.style.setProperty(
        '--site-letter-spacing',
        letterSpacingMap[settings.siteLetterSpacing || 'normal'] || '0em'
      );

      // Site-Wide Primary & Secondary Font Colors
      const primaryColor = (settings.sitePrimaryTextColor || '').trim();
      if (primaryColor) {
        root.setAttribute('data-custom-text-color', 'true');
        root.style.setProperty('--apple-label', primaryColor);
      } else {
        root.removeAttribute('data-custom-text-color');
        root.style.removeProperty('--apple-label');
      }

      const secondaryColor = (settings.siteSecondaryTextColor || '').trim();
      if (secondaryColor) {
        root.setAttribute('data-custom-secondary-color', 'true');
        root.style.setProperty('--apple-secondary', secondaryColor);
      } else {
        root.removeAttribute('data-custom-secondary-color');
        root.style.removeProperty('--apple-secondary');
      }

      // Site-Wide Heading Color Mode
      const headingMode = settings.siteHeadingColorMode || 'theme_default';
      root.setAttribute('data-heading-color-mode', headingMode);
      const headingColorPresetMap: Record<string, string> = {
        royal_gold: '#B47B16',
        apple_blue: '#0071E3',
        emerald_luxury: '#059669',
        crimson_velvet: '#B91C1C',
        amethyst_silk: '#6D28D9',
        custom_solid: settings.siteHeadingCustomColor || primaryColor || resolved.colors.textPrimary,
      };
      if (headingMode !== 'theme_default' && headingColorPresetMap[headingMode]) {
        root.style.setProperty('--site-heading-color', headingColorPresetMap[headingMode]);
      } else {
        root.style.removeProperty('--site-heading-color');
      }
    };

    applyThemeAttributes();

    if (settings.themeAutoTimeOfDay) {
      const timer = setInterval(applyThemeAttributes, 60000);
      return () => clearInterval(timer);
    }
  }, [
    effectiveUser?.id,
    settings.activeThemeId,
    settings.themeAmbientGlow,
    settings.themeGlassIntensity,
    settings.themeAutoTimeOfDay,
    settings.themeCardElevation,
    settings.themeFontScale,
    settings.themeCustomAccent,
    settings.themeCustomAccentColor,
    settings.siteFontFamily,
    settings.siteFontSizePercent,
    settings.siteFontWeight,
    settings.siteFontStrokeWidth,
    settings.siteLineHeight,
    settings.siteLetterSpacing,
    settings.sitePrimaryTextColor,
    settings.siteSecondaryTextColor,
    settings.siteHeadingColorMode,
    settings.siteHeadingCustomColor,
    settings.themeSurfaceStyle,
    settings.themeBorderRadius,
    settings.themeContrastLevel,
  ]);

  // Customers & Loyalty CRM Records (Strictly real customers only — zero virtual/mock customers)
  const [customCustomers, setCustomCustomers] = useState<CustomCustomerRecord[]>([]);
  const [preselectedPosCustomer, setPreselectedPosCustomer] = useState<{ name: string; phone: string; autoRedeemLoyalty?: boolean } | null>(null);

  const handleSaveCustomCustomer = (record: CustomCustomerRecord) => {
    const generation = ownerSessionGeneration;
    if (!ownerPrivateSessionRef.current.isAuthorized(generation)) return;
    if (isVirtualDemoCustomer(record)) return;
    setCustomCustomers(prev => {
      if (!ownerPrivateSessionRef.current.isAuthorized(generation)) return prev;
      const idx = prev.findIndex(
        c => (record.phone && c.phone === record.phone) || c.name === record.name
      );
      let next: CustomCustomerRecord[];
      if (idx >= 0) {
        next = [...prev];
        next[idx] = record;
      } else {
        next = [record, ...prev];
      }
      try {
        if (ownerPrivateSessionRef.current.isAuthorized(generation)) {
          localStorage.setItem('lamsa_custom_customers_v1', JSON.stringify(next));
        }
      } catch (e) {
        console.error(e);
      }
      return next;
    });
    if (ownerPrivateSessionRef.current.isAuthorized(generation)) {
      saveCustomCustomerCloud(record).catch(err => console.error('Error saving customer to cloud:', err));
    }
  };

  const handleDeleteCustomCustomer = (record: Partial<CustomCustomerRecord>) => {
    const generation = ownerSessionGeneration;
    if (!ownerPrivateSessionRef.current.isAuthorized(generation)) return;
    setCustomCustomers(prev => {
      if (!ownerPrivateSessionRef.current.isAuthorized(generation)) return prev;
      const next = prev.filter(
        c =>
          !(
            (record.phone && c.phone === record.phone) ||
            (record.name && c.name === record.name)
          )
      );
      try {
        if (ownerPrivateSessionRef.current.isAuthorized(generation)) {
          localStorage.setItem('lamsa_custom_customers_v1', JSON.stringify(next));
        }
      } catch (e) {
        console.error(e);
      }
      return next;
    });
    if (ownerPrivateSessionRef.current.isAuthorized(generation)) {
      deleteCustomCustomerCloud(record).catch(err => console.error('Error deleting customer from cloud:', err));
    }
  };

  // Saved Perfume Mix Formulas (وصفات الميكسات المحفوظة)
  const [savedMixes, setSavedMixes] = useState<SavedMixFormula[]>([]);

  // Daily Closures & Day Operations State
  const [dailyClosures, setDailyClosures] = useState<DailyClosure[]>([]);
  const [isDayOpsModalOpen, setIsDayOpsModalOpen] = useState(false);
  const [isDailyReportAutomationModalOpen, setIsDailyReportAutomationModalOpen] = useState(false);
  const [settingsInitialSection, setSettingsInitialSection] = useState<
    'pricing' | 'loyalty_ai' | 'identity' | 'budget' | 'vaults' | 'privacy' | 'pos_receipts' | 'inventory' | 'security_backup' | 'staff_management' | 'commission_policies' | 'budget_management' | 'system_settings' | 'audit_log'
  >('pricing');

  // Inventory Intelligence: Purchase Requests, Customer Requests, Stock Checks
  const [purchaseRequests, setPurchaseRequests] = useState<PurchaseRequest[]>([]);

  const [customerRequests, setCustomerRequests] = useState<CustomerRequest[]>([]);

  const [stockChecks, setStockChecks] = useState<StockCheckRecord[]>([]);

  // Fragrance Database & Strategic Replenishment Orders State
  const [fragranceDatabase, setFragranceDatabase] = useState<FragranceDatabaseEntry[]>([]);

  const [strategicOrders, setStrategicOrders] = useState<StrategicReplenishmentOrder[]>([]);

  const [isCloudConnected, setIsCloudConnected] = useState<boolean>(false);
  const [cloudMessage, setCloudMessage] = useState<string>('المزامنة السحابية غير مؤكدة.');
  const [queuedSaleCount, setQueuedSaleCount] = useState(0);
  const [saleQueueSyncing, setSaleQueueSyncing] = useState(false);
  const [saleQueueNotice, setSaleQueueNotice] = useState('');
  const saleQueueRetryRef = useRef<(() => Promise<SaleFlushResult | null>) | null>(null);
  const [isOwnerLiveRadarOpen, setIsOwnerLiveRadarOpen] = useState<boolean>(false);
  const [isPWAInstallModalOpen, setIsPWAInstallModalOpen] = useState<boolean>(false);
  const [connectedDevices, setConnectedDevices] = useState<ConnectedDeviceRecord[]>([]);
  const [deviceFeedStatus, setDeviceFeedStatus] = useState<'connecting' | 'live' | 'cached' | 'error'>('connecting');
  const [deviceFeedLastServerUpdate, setDeviceFeedLastServerUpdate] = useState<number | null>(null);
  const [isConnectedDevicesModalOpen, setIsConnectedDevicesModalOpen] = useState<boolean>(false);
  const [ownerBroadcasts, setOwnerBroadcasts] = useState<OwnerStaffBroadcast[]>([]);
  const [dismissedBroadcastIds, setDismissedBroadcastIds] = useState<Set<string>>(new Set());
  const prevDeviceIdsRef = useRef<Set<string> | null>(null);

  const hydrateOwnerPrivateTransientState = (uid: string, generation: number) => {
    const gate = ownerPrivateSessionRef.current;
    if (!gate.isAuthorized(generation, uid)) return;
    const load = <T,>(storageKey: string, fallback: T): T =>
      readOwnerPrivateCache(gate, generation, storageKey, fallback);

    const cachedProducts = load<Product[]>('lamsa_products', INITIAL_PRODUCTS);
    setProducts(Array.isArray(cachedProducts) ? cachedProducts : []);

    const cachedSales = load<Sale[]>('lamsa_sales', []);
    setSales(Array.isArray(cachedSales) ? cachedSales.map((sale) => {
      const isSystemTest = sale.id.startsWith('sale-10') || isTestOrExampleRecord(sale);
      return isSystemTest
        ? {
            ...sale,
            dataClassification: 'TEST',
            isTestData: true,
            testClassificationNote: sale.testClassificationNote || 'TEST / بيانات اختبار',
          }
        : {
            ...sale,
            dataClassification: sale.dataClassification || 'PRODUCTION',
            isTestData: false,
          };
    }) : []);

    const cachedExpenses = load<Expense[]>('lamsa_expenses_v2', INITIAL_EXPENSES);
    setExpenses(Array.isArray(cachedExpenses) ? cachedExpenses.map((expense) => {
      const isSeededOrTest = LEGACY_SEEDED_BUDGET_EXPENSE_IDS.has(expense.id) || isTestOrExampleRecord(expense);
      return isSeededOrTest
        ? {
            ...expense,
            dataClassification: 'TEST',
            isTestData: true,
            testClassificationNote: expense.testClassificationNote || 'TEST / بيانات اختبار',
          }
        : {
            ...expense,
            dataClassification: expense.dataClassification || 'PRODUCTION',
            isTestData: false,
          };
    }) : INITIAL_EXPENSES);

    const parsedSettings = load<Partial<StoreSettings>>('lamsa_settings_v2', DEFAULT_SETTINGS) || DEFAULT_SETTINGS;
    const savedQuickTheme = load<string | null>('lamsa_active_theme_v1', null);
    let employeeBaseSalary = parsedSettings.employeeBaseSalary ?? DEFAULT_SETTINGS.employeeBaseSalary;
    let ownerSalary = parsedSettings.ownerSalary ?? DEFAULT_SETTINGS.ownerSalary;
    if (employeeBaseSalary === 1500 && (ownerSalary === 10000 || !ownerSalary)) {
      employeeBaseSalary = 1000;
      ownerSalary = 10500;
    } else if (employeeBaseSalary === 1500) {
      employeeBaseSalary = 1000;
      ownerSalary = (ownerSalary || 10000) + 500;
    }
    setSettings({
      ...DEFAULT_SETTINGS,
      ...parsedSettings,
      employeeBaseSalary,
      ownerSalary,
      customBudgetItems: parsedSettings.customBudgetItems && parsedSettings.customBudgetItems.length > 0
        ? parsedSettings.customBudgetItems.map((item) => {
            if (item.id === 'salary_owner' && item.monthlyAmount === 10000) return { ...item, monthlyAmount: 10500, dailyRate: 420 };
            if (item.id === 'salary_tarek' && item.monthlyAmount === 1500) return { ...item, monthlyAmount: 1000, dailyRate: 40 };
            return item;
          })
        : undefined,
      activeThemeId: parsedSettings.activeThemeId || savedQuickTheme || DEFAULT_SETTINGS.activeThemeId,
      themeContrastLevel: parsedSettings.themeContrastLevel || 'ultra_crisp',
      themeSurfaceStyle: parsedSettings.themeSurfaceStyle || 'neo_precision_2027_glass',
      siteFontWeight: parsedSettings.siteFontWeight || 'medium',
      siteFontStrokeWidth: parsedSettings.siteFontStrokeWidth || 'crisp',
      logoUrl: parsedSettings.logoUrl && parsedSettings.logoUrl.trim() !== '' ? parsedSettings.logoUrl : DEFAULT_SETTINGS.logoUrl,
      storeSlogan: parsedSettings.storeSlogan && parsedSettings.storeSlogan.trim() !== '' ? parsedSettings.storeSlogan : DEFAULT_SETTINGS.storeSlogan,
    });

    const cachedBottleSizes = load<BottleSize[]>('lamsa_bottle_sizes_v2', DEFAULT_BOTTLE_SIZES);
    const safeBottleSizes = Array.isArray(cachedBottleSizes) ? cachedBottleSizes : DEFAULT_BOTTLE_SIZES;
    if (safeBottleSizes.some((size) => size.sizeMl === 100) && safeBottleSizes.some((size) => size.officialCost !== undefined)) {
      setBottleSizes(safeBottleSizes
        .filter((size) => size.sizeMl !== 12)
        .map((size) => {
          const definition = DEFAULT_BOTTLE_SIZES.find((item) => item.sizeMl === size.sizeMl && Boolean(item.isRollOn) === Boolean(size.isRollOn));
          return { ...size, coloredNormalPrice: size.coloredNormalPrice ?? definition?.coloredNormalPrice };
        }));
    } else {
      setBottleSizes(DEFAULT_BOTTLE_SIZES);
    }

    setVaults(load<FinancialVault[]>('lamsa_vaults_v1', DEFAULT_VAULTS));
    setWithdrawals(load<WithdrawalTransaction[]>('lamsa_withdrawals_v1', []));
    setAttendanceRecords(load<StaffAttendanceRecord[]>('lamsa_attendance_v1', []));
    setBatches(load<ProductionBatch[]>('lamsa_batches_v1', []));
    setAuditLogs(load<AuditLogRecord[]>('lamsa_audit_logs_v1', []));
    setUsers(ensureCoreUsersList(load<AppUser[]>('lamsa_users_v1', DEFAULT_USERS)));

    const cachedCustomers = load<CustomCustomerRecord[]>('lamsa_custom_customers_v1', []);
    const realCustomers = Array.isArray(cachedCustomers) ? cachedCustomers.filter((customer) => !isVirtualDemoCustomer(customer)) : [];
    setCustomCustomers(realCustomers);
    if (Array.isArray(cachedCustomers) && realCustomers.length !== cachedCustomers.length) {
      persistOwnerPrivateData('lamsa_custom_customers_v1', realCustomers, generation);
    }

    setSavedMixes(load<SavedMixFormula[]>('lamsa_saved_mixes_v1', []));
    setDailyClosures(load<DailyClosure[]>('lamsa_closures_v1', []));
    setPurchaseRequests(load<PurchaseRequest[]>('lamsa_purchase_requests_v1', []));
    setCustomerRequests(load<CustomerRequest[]>('lamsa_customer_requests_v1', []));
    setStockChecks(load<StockCheckRecord[]>('lamsa_stock_checks_v1', []));
    try { setFragranceDatabase(getLocalFragranceDatabase()); } catch { setFragranceDatabase([]); }
    try { setStrategicOrders(getLocalStrategicOrders()); } catch { setStrategicOrders([]); }
    setOwnerBroadcasts(load<OwnerStaffBroadcast[]>('lamsa_owner_broadcasts', []));
    setDismissedBroadcastIds(new Set(load<string[]>('lamsa_dismissed_broadcasts_v2', [])));

    // The legacy sale outbox is only inspected in the verified owner session; never clear or rewrite it here.
    const queuedSales = getOfflineQueue().filter((item) => item.entityType === 'sale');
    setQueuedSaleCount(queuedSales.length);
    setSaleQueueNotice(queuedSales.length > 0 ? 'توجد فواتير محلية بانتظار تأكيد Firestore.' : '');
  };

  const clearOwnerPrivateTransientState = () => {
    cancelPendingOwnerPrivateCacheWrites();
    setProducts([]);
    setSales([]);
    setExpenses([]);
    setSettings(DEFAULT_SETTINGS);
    setBottleSizes([]);
    setVaults([]);
    setWithdrawals([]);
    setAttendanceRecords([]);
    setBatches([]);
    setAuditLogs([]);
    setUsers([]);
    setDashboardFeedHealth(createInitialDashboardFeedHealth());
    setDashboardServerData(createInitialDashboardServerData());
    setCustomCustomers([]);
    setSavedMixes([]);
    setDailyClosures([]);
    setPurchaseRequests([]);
    setCustomerRequests([]);
    setStockChecks([]);
    setFragranceDatabase([]);
    setStrategicOrders([]);
    setOwnerBroadcasts([]);
    setDismissedBroadcastIds(new Set());
    setConnectedDevices([]);
    setDeviceFeedStatus('connecting');
    setDeviceFeedLastServerUpdate(null);
    setQueuedSaleCount(0);
    setSaleQueueSyncing(false);
    setSaleQueueNotice('');
    setTopNotifications([]);
    setFormulationProduct(null);
    setPreselectedPosCustomer(null);
    setPasswordChangeUser(null);
    setIsOwnerLiveRadarOpen(false);
    setIsConnectedDevicesModalOpen(false);
    setIsDayOpsModalOpen(false);
    setIsDailyReportAutomationModalOpen(false);
    setIsThemeStudioModalOpen(false);
    setCurrentView(View.DASHBOARD);
    setIsScreenLocked(true);
    auditArchiveCursorRef.current = null;
    auditArchiveLoadingRef.current = false;
    auditArchiveHasMoreRef.current = true;
    isInitialSalesLoadedRef.current = false;
    knownSaleIdsRef.current.clear();
    isInitialExpensesLoadedRef.current = false;
    knownExpenseIdsRef.current.clear();
    isInitialAttendanceLoadedRef.current = false;
    knownAttendanceIdsRef.current.clear();
    isInitialClosuresLoadedRef.current = false;
    knownClosureIdsRef.current.clear();
    isInitialWithdrawalsLoadedRef.current = false;
    knownWithdrawalIdsRef.current.clear();
    setHasMoreAuditLogs(true);
    setIsLoadingAuditLogs(false);
    setIsLoadingAllAuditLogs(false);
  };

  const applyAuthorizedIdentity = (authorized: Awaited<ReturnType<typeof validateAuthorizedAuthUser>>) => {
    setCurrentFirebaseRoleAssignment(authorized.roleAssignment);
    const isOwner = authorized.role === 'OWNER';
    const profile = isOwner ? DEFAULT_USERS[0] : DEFAULT_USERS[1];
    const normalizedEmail = authorized.user.email?.trim().toLowerCase() || '';
    const isKnownTarek = normalizedEmail === TAREK_AUTH_EMAIL;
    setAuthEmail(authorized.user.email || null);
    setCurrentUser({
      ...profile,
      id: isOwner ? 'owner_mohamed' : `google_${authorized.user.uid}`,
      username: isOwner ? 'mohamed' : isKnownTarek ? 'tarek' : normalizedEmail,
      displayName: isOwner
        ? profile.displayName
        : isKnownTarek
        ? profile.displayName
        : (authorized.user.displayName?.trim() || authorized.user.email || 'مستخدم تشغيل'),
      role: isOwner ? 'OWNER' : 'STORE_MANAGER',
      isActive: true,
      requiresPasswordChange: false,
      passwordHash: '',
      permissions: isOwner ? { ...OWNER_FULL_PERMISSIONS } : { ...TAREK_OPERATIONAL_PERMISSIONS },
      lastLoginAt: new Date().toISOString(),
    });
  };

  // App roles are constructed only from verified Google ID-token claims; local profiles never authorize access.
  useEffect(() => {
    let active = true;
    let latestCheck = 0;
    let lastFirebaseUser: User | null = null;
    let transientAuthFailure = false;
    clearSessionUser();

    const validateFirebaseUser = async (firebaseUser: User | null) => {
      const checkId = ++latestCheck;
      const sessionGeneration = ownerPrivateSessionRef.current.beginIdentityTransition();
      clearOwnerPrivateTransientState();
      lastFirebaseUser = firebaseUser;
      if (!firebaseUser) {
        transientAuthFailure = false;
        clearCurrentFirebaseRoleAssignment();
        setAuthStatus('signed_out');
        setAuthEmail(null);
        setAccessRequestStatus('none');
        setCurrentUser(null);
        setIsCloudConnected(false);
        setCloudMessage('سجّل الدخول بحساب Google المعتمد؛ لا يوجد اتصال سحابي قبل التحقق.');
        return;
      }

      setAuthStatus('checking');
      setAccessRequestStatus('none');
      setCurrentUser(null);
      clearCurrentFirebaseRoleAssignment();
      try {
        const authorized = await validateAuthorizedAuthUser(firebaseUser);
        if (!active || checkId !== latestCheck || sessionGeneration !== ownerPrivateSessionRef.current.generation) return;
        transientAuthFailure = false;
        if (authorized.role === 'OWNER') {
          if (!ownerPrivateSessionRef.current.authorizeVerifiedOwner(firebaseUser.uid, sessionGeneration)) return;
          hydrateOwnerPrivateTransientState(firebaseUser.uid, sessionGeneration);
        }
        applyAuthorizedIdentity(authorized);
        setAuthError(null);
        setAuthStatus('ready');
      } catch (error) {
        if (!active || checkId !== latestCheck) return;
        clearCurrentFirebaseRoleAssignment();
        const code = (error as { code?: string })?.code;
        const isTransient = ['auth/network-request-failed', 'network-request-failed', 'unavailable', 'deadline-exceeded'].includes(String(code));
        transientAuthFailure = isTransient;
        setAuthEmail(firebaseUser.email || null);
        setCurrentUser(null);
        setAuthError(getFirebaseAuthErrorMessage(error));
        setAuthStatus(isTransient ? 'error' : 'unauthorized');
        setIsCloudConnected(false);
        setCloudMessage('لا يوجد اتصال سحابي موثوق قبل التحقق من حساب Google المعتمد.');
        if (!isTransient) {
          void getOwnOperationalAccessRequestCloud().then((request) => {
            if (!active || checkId !== latestCheck) return;
            setAccessRequestStatus(request?.status || 'none');
          }).catch(() => {
            if (active && checkId === latestCheck) setAccessRequestStatus('none');
          });
        }
      }
    };

    const retryAuthAfterConnectivityReturns = () => {
      if (!active || !transientAuthFailure) return;
      const firebaseUser = auth.currentUser || lastFirebaseUser;
      if (firebaseUser) void validateFirebaseUser(firebaseUser);
    };

    const unsubscribe = onAuthStateChanged(auth, validateFirebaseUser, (error) => {
      if (!active) return;
      ownerPrivateSessionRef.current.beginIdentityTransition();
      clearOwnerPrivateTransientState();
      setCurrentUser(null);
      setAuthStatus('error');
      setAuthError(getFirebaseAuthErrorMessage(error));
      const code = (error as { code?: string })?.code;
      transientAuthFailure = ['auth/network-request-failed', 'network-request-failed', 'unavailable', 'deadline-exceeded'].includes(String(code));
    });

    window.addEventListener('online', retryAuthAfterConnectivityReturns);
    window.addEventListener('focus', retryAuthAfterConnectivityReturns);
    window.addEventListener('pageshow', retryAuthAfterConnectivityReturns);
    document.addEventListener('visibilitychange', retryAuthAfterConnectivityReturns);

    completeGoogleRedirectSignIn().catch((error) => {
      if (!active) return;
      setAuthError(getFirebaseAuthErrorMessage(error));
    });

    return () => {
      active = false;
      unsubscribe();
      window.removeEventListener('online', retryAuthAfterConnectivityReturns);
      window.removeEventListener('focus', retryAuthAfterConnectivityReturns);
      window.removeEventListener('pageshow', retryAuthAfterConnectivityReturns);
      document.removeEventListener('visibilitychange', retryAuthAfterConnectivityReturns);
      ownerPrivateSessionRef.current.beginIdentityTransition();
      cancelPendingOwnerPrivateCacheWrites();
      clearCurrentFirebaseRoleAssignment();
    };
  }, []);

  useEffect(() => {
    const onFirestoreError = (event: Event) => {
      const detail = (event as CustomEvent<{ code?: string; transient?: boolean }>).detail || {};
      setIsCloudConnected(false);
      setCloudMessage(
        detail.code === 'permission-denied'
          ? 'رفضت قواعد Firestore العملية؛ البيانات على هذا الجهاز فقط ولم تتأكد المزامنة.'
          : detail.transient
          ? 'تعذر الاتصال بـFirestore؛ الحفظ المحلي لا يعني مزامنة سحابية.'
          : 'فشلت عملية Firestore؛ الحفظ المحلي فقط ما لم يظهر تأكيد سحابي.'
      );
    };
    window.addEventListener('lamsa-firestore-error', onFirestoreError);
    return () => window.removeEventListener('lamsa-firestore-error', onFirestoreError);
  }, []);

  // Track known remote event IDs to trigger real-time sound & system notifications when new records arrive from other devices
  const isInitialSalesLoadedRef = useRef<boolean>(false);
  const knownSaleIdsRef = useRef<Set<string>>(new Set());

  const isInitialExpensesLoadedRef = useRef<boolean>(false);
  const knownExpenseIdsRef = useRef<Set<string>>(new Set());

  const isInitialAttendanceLoadedRef = useRef<boolean>(false);
  const knownAttendanceIdsRef = useRef<Set<string>>(new Set());

  const isInitialClosuresLoadedRef = useRef<boolean>(false);
  const knownClosureIdsRef = useRef<Set<string>>(new Set());

  const isInitialWithdrawalsLoadedRef = useRef<boolean>(false);
  const knownWithdrawalIdsRef = useRef<Set<string>>(new Set());

  // Real-time synchronization across all devices via Firestore onSnapshot
  useEffect(() => {
    const gate = ownerPrivateSessionRef.current;
    const generation = ownerSessionGeneration;
    if (authStatus !== 'ready' || currentUser?.role !== 'OWNER' || !gate.isAuthorized(generation)) {
      if (authStatus === 'ready') {
        const restricted = createInitialDashboardFeedHealth();
        (Object.keys(restricted) as DashboardDataSourceKey[]).forEach((key) => {
          restricted[key] = { state: 'restricted', lastConfirmedAt: null };
        });
        setDashboardFeedHealth(restricted);
        setDashboardServerData(createInitialDashboardServerData());
      }
      setConnectedDevices([]);
      setDeviceFeedStatus('connecting');
      setDeviceFeedLastServerUpdate(null);
      return;
    }
    setDashboardFeedHealth(createInitialDashboardFeedHealth());
    setDashboardServerData(createInitialDashboardServerData());
    let active = true;
    const isCurrentOwnerSession = () => active && gate.isAuthorized(generation);
    setIsCloudConnected(false);
    setCloudMessage('جارٍ التحقق من اتصال Firestore…');
    void testFirestoreConnection().then((connected) => {
      if (!isCurrentOwnerSession()) return;
      setIsCloudConnected(connected);
      setCloudMessage(connected
        ? 'اتصال Firestore مؤكد الآن.'
        : 'تعذر تأكيد Firestore؛ البيانات المحلية فقط ولم تتأكد المزامنة.');
    });

    // Hydrate from IndexedDB on startup if localStorage was reset or cleared
    hydrateFromIndexedDBIfNeeded<Product[]>('lamsa_products', (restored) => {
      if (isCurrentOwnerSession() && restored && restored.length > 0) setProducts(restored);
    }, 'products', isCurrentOwnerSession);
    hydrateFromIndexedDBIfNeeded<Sale[]>('lamsa_sales', (restored) => {
      if (isCurrentOwnerSession() && restored && restored.length > 0) setSales(restored);
    }, 'sales', isCurrentOwnerSession);
    hydrateFromIndexedDBIfNeeded<Expense[]>('lamsa_expenses_v2', (restored) => {
      if (isCurrentOwnerSession() && restored && restored.length > 0) setExpenses(restored);
    }, 'expenses', isCurrentOwnerSession);
    hydrateFromIndexedDBIfNeeded<SavedMixFormula[]>('lamsa_saved_mixes_v1', (restored) => {
      if (isCurrentOwnerSession() && restored && restored.length > 0) setSavedMixes(restored);
    }, 'savedMixes', isCurrentOwnerSession);
    hydrateFromIndexedDBIfNeeded<CustomCustomerRecord[]>('lamsa_custom_customers_v1', (restored) => {
      if (isCurrentOwnerSession() && restored && restored.length > 0) setCustomCustomers(restored);
    }, undefined, isCurrentOwnerSession);

    // Listen to real-time sales on all open terminals/devices (never delete historical records)
    const unsubSales = subscribeToSales(
      (cloudSales, freshness) => {
        if (!isCurrentOwnerSession()) return;
        reportDashboardSource('sales', freshness || 'cached', cloudSales);
        const incomingSales = cloudSales || [];
        const classified = incomingSales.map((s) => {
          const isSystemTest = s.id.startsWith('sale-10') || isTestOrExampleRecord(s);
          return isSystemTest
            ? {
                ...s,
                dataClassification: 'TEST' as const,
                isTestData: true,
                testClassificationNote: s.testClassificationNote || 'TEST / بيانات اختبار',
              }
            : {
                ...s,
                isTestData: false,
              };
        });
        setSales(prevLocal => {
          // Keep local-only sales pending until their sale + stock can be retried atomically.
          const { merged } = mergeCollectionRecords(prevLocal, classified, 'sales');
          persistOwnerPrivateData('lamsa_sales', merged);
          return merged;
        });
      },
      (liveSale, isRemote) => {
        if (!isCurrentOwnerSession()) return;
        // Triggered ONLY for sales actually happening in real time right now!
        soundAlertService.playSaleChime();
        const currency = settings.currency || 'ج.م';
        const saleAmount = liveSale.totalPrice ?? (liveSale as any).total ?? 0;
        const cashier = liveSale.employeeName || (liveSale as any).cashierName || 'كاشير المتجر';
        const customer = liveSale.customerName || 'عميل نقدي';
        const itemsCount = liveSale.items?.length || 1;
        const deviceSource = isRemote ? 'جهاز آخر / هاتف كاشير' : 'هذا الجهاز';

        browserNotificationService.sendNotification(`💰 بيع مباشر في الوقت الفعلي: ${saleAmount} ${currency}`, {
          body: `الكاشير: ${cashier} · العميل: ${customer} · عدد الأصناف: ${itemsCount} (${deviceSource})`,
          tag: `live-sale-${liveSale.id}`,
        });

        pushTopNotification(
          'sale',
          `⚡ بيع حي الآن: ${saleAmount} ${currency}`,
          `أنجز الكاشير [${cashier}] فاتورة جديدة للعميل [${customer}] (${deviceSource})`,
          'مزامنة حية الآن',
          'عرض الفاتورة',
          () => setCurrentView(View.REPORTS)
        );
      },
      (freshness) => reportDashboardSource('sales', freshness)
    );

    // Listen to real-time perfume inventory catalogue
    const unsubProducts = subscribeToProducts((cloudProducts, freshness) => {
      if (!isCurrentOwnerSession()) return;
      reportDashboardSource('products', freshness || 'cached', cloudProducts);
      if (cloudProducts && cloudProducts.length > 0) {
        setProducts(prevLocal => {
          const { merged, unsyncedLocalItems } = mergeCollectionRecords(prevLocal, cloudProducts, 'products');
          const localUserProducts = unsyncedLocalItems.filter((product) => !isInitialCatalogTemplate(product));
          if (localUserProducts.length > 0) {
            localUserProducts.forEach((product) => saveProductCloud(product).catch(console.error));
          }
          persistOwnerPrivateData('lamsa_products', merged);
          return merged;
        });
          }
    }, undefined, (freshness) => reportDashboardSource('products', freshness));

    // Listen to real-time expenses
    const unsubExpenses = subscribeToExpenses((cloudExpenses, freshness) => {
      if (!isCurrentOwnerSession()) return;
      reportDashboardSource('expenses', freshness || 'cached', cloudExpenses);
      const incomingExpenses = cloudExpenses || [];

      // Detect incoming expenses from other devices in real-time
      if (isInitialExpensesLoadedRef.current && incomingExpenses.length > 0) {
        const remoteNewExpenses = incomingExpenses.filter(e => !knownExpenseIdsRef.current.has(e.id));
        if (remoteNewExpenses.length > 0) {
          remoteNewExpenses.forEach(exp => {
            knownExpenseIdsRef.current.add(exp.id);
            soundAlertService.playActionChime();
            const currency = settings.currency || 'ج.م';
            browserNotificationService.sendNotification(`💸 تسجيل مصروف جديد: ${exp.amount} ${currency}`, {
              body: `البند: ${exp.category} · البيان: ${exp.title} · التاريخ: ${exp.date}`,
              tag: `expense-${exp.id}`,
            });
            pushTopNotification(
              'info',
              `💸 مصروف جديد: ${exp.amount} ${currency}`,
              `البند: ${exp.category} — ${exp.title}`,
              'مصروفات'
            );
          });
        }
      } else {
        incomingExpenses.forEach(e => knownExpenseIdsRef.current.add(e.id));
        isInitialExpensesLoadedRef.current = true;
      }

      if (cloudExpenses) {
        const classifiedExpenses = cloudExpenses.map((exp) => {
          const isSeededOrTest = LEGACY_SEEDED_BUDGET_EXPENSE_IDS.has(exp.id) || isTestOrExampleRecord(exp);
          return isSeededOrTest
            ? {
                ...exp,
                dataClassification: 'TEST' as const,
                isTestData: true,
                testClassificationNote: exp.testClassificationNote || 'TEST / بيانات اختبار',
              }
            : {
                ...exp,
                isTestData: false,
              };
        });
        setExpenses(prevLocal => {
          const { merged, unsyncedLocalItems } = mergeCollectionRecords(prevLocal, classifiedExpenses, 'expenses');
          if (unsyncedLocalItems.length > 0) {
            unsyncedLocalItems.forEach(e => saveExpenseCloud(e).catch(console.error));
          }
          persistOwnerPrivateData('lamsa_expenses_v2', merged);
          return merged;
        });
          }
    }, undefined, (freshness) => reportDashboardSource('expenses', freshness));

    let isInitialSettingsReceived = false;
    let prevSyncedSettings = settings;

    // Listen to real-time settings and branding (instant color and letter sync)
    const unsubSettings = subscribeToSettings((cloudSettings, freshness, rawSettings) => {
      if (!isCurrentOwnerSession()) return;
      reportDashboardSource(
        'settings',
        freshness || 'cached',
        freshness === 'live' && rawSettings ? rawSettings : undefined
      );
      if (cloudSettings) {
        if (isInitialSettingsReceived) {
          if (cloudSettings.activeThemeId && cloudSettings.activeThemeId !== prevSyncedSettings.activeThemeId) {
            soundAlertService.playActionChime();
            pushTopNotification(
              'goal',
              '🎨 تزامن لوني فوري بالوقت الفعلي',
              `تم تحديث الثيم والألوان تلقائياً في الوقت الفعلي`,
              'تزامن الألوان'
            );
          } else if (cloudSettings.themeContrastLevel && cloudSettings.themeContrastLevel !== prevSyncedSettings.themeContrastLevel) {
            pushTopNotification(
              'goal',
              '✨ تزامن وضوح الألوان والتباين',
              `تم تحديث حدة الألوان تلقائياً على هذا الجهاز`,
              'تزامن الألوان'
            );
          } else if (cloudSettings.storeName && cloudSettings.storeName !== prevSyncedSettings.storeName) {
            pushTopNotification(
              'info',
              '✏️ تزامن نصي فوري بالوقت الفعلي',
              `تم تحديث اسم المتجر إلى: [${cloudSettings.storeName}]`,
              'تزامن النصوص'
            );
          }
        }
        isInitialSettingsReceived = true;
        prevSyncedSettings = cloudSettings;

        setSettings(cloudSettings);
        persistOwnerPrivateData('lamsa_settings_v2', cloudSettings);
          }
    }, DEFAULT_SETTINGS, (freshness) => reportDashboardSource('settings', freshness));

    // Listen to real-time bottle sizes and pricing
    const unsubBottleSizes = subscribeToBottleSizes((cloudSizes) => {
      if (!isCurrentOwnerSession()) return;
      if (cloudSizes && cloudSizes.length > 0) {
        const enriched = cloudSizes.map((b: BottleSize) => {
          const def = DEFAULT_BOTTLE_SIZES.find(d => d.sizeMl === b.sizeMl && Boolean(d.isRollOn) === Boolean(b.isRollOn));
          return {
            ...b,
            coloredNormalPrice: b.coloredNormalPrice ?? def?.coloredNormalPrice,
          };
        });
        setBottleSizes(enriched);
        persistOwnerPrivateData('lamsa_bottle_sizes_v2', enriched);
          }
    }, DEFAULT_BOTTLE_SIZES);

    // Listen to real-time financial vaults
    const unsubVaults = subscribeToVaults((cloudVaults, freshness) => {
      if (!isCurrentOwnerSession()) return;
      reportDashboardSource('vaults', freshness || 'cached', cloudVaults);
      if (cloudVaults && cloudVaults.length > 0) {
        setVaults(cloudVaults);
        persistOwnerPrivateData('lamsa_vaults_v1', cloudVaults);
          }
    }, undefined, (freshness) => reportDashboardSource('vaults', freshness));

    // Listen to real-time audited withdrawal transactions
    const unsubWithdrawals = subscribeToWithdrawals((cloudWithdrawals, freshness) => {
      if (!isCurrentOwnerSession()) return;
      reportDashboardSource('withdrawals', freshness || 'cached', cloudWithdrawals);
      const incomingWithdrawals = cloudWithdrawals || [];
      if (isInitialWithdrawalsLoadedRef.current && incomingWithdrawals.length > 0) {
        const remoteNewWithdrawals = incomingWithdrawals.filter(w => !knownWithdrawalIdsRef.current.has(w.id));
        if (remoteNewWithdrawals.length > 0) {
          remoteNewWithdrawals.forEach(w => {
            knownWithdrawalIdsRef.current.add(w.id);
            soundAlertService.playActionChime();
            const currency = settings.currency || 'ج.م';
            browserNotificationService.sendNotification(`⚠️ حركة سحب / عهدة مالية: ${w.amount} ${currency}`, {
              body: `المستلم: ${w.recipientName} · الغرض: ${w.reason}`,
              tag: `withdrawal-${w.id}`,
            });
            pushTopNotification(
              'warning',
              `⚠️ حركة سحب عهدة: ${w.amount} ${currency}`,
              `المستلم: ${w.recipientName} (${w.reason})`,
              'عهد وسحوبات'
            );
          });
        }
      } else {
        incomingWithdrawals.forEach(w => knownWithdrawalIdsRef.current.add(w.id));
        isInitialWithdrawalsLoadedRef.current = true;
      }

      if (cloudWithdrawals) {
        setWithdrawals(cloudWithdrawals);
        persistOwnerPrivateData('lamsa_withdrawals_v1', cloudWithdrawals);
          }
    }, (freshness) => reportDashboardSource('withdrawals', freshness));

    // Listen to real-time staff attendance records (حضور وفتح المتجر لطاقم العمل)
    const unsubAttendance = subscribeToStaffAttendance((cloudAttendance) => {
      if (!isCurrentOwnerSession()) return;
      const incomingAttendance = cloudAttendance || [];
      if (isInitialAttendanceLoadedRef.current && incomingAttendance.length > 0) {
        const remoteNewAttendance = incomingAttendance.filter(a => !knownAttendanceIdsRef.current.has(a.id));
        if (remoteNewAttendance.length > 0) {
          remoteNewAttendance.forEach(rec => {
            knownAttendanceIdsRef.current.add(rec.id);
            soundAlertService.playActionChime();
            browserNotificationService.sendNotification(`⏱️ تسجيل حضور طاقم العمل: ${rec.employeeName}`, {
              body: `الحالة: ${rec.status} · الوقت: ${rec.checkInTime || 'الآن'}`,
              tag: `attendance-${rec.id}`,
            });
            pushTopNotification(
              'info',
              `⏱️ تسجيل حضور: ${rec.employeeName}`,
              `تم تسجيل حضور الموظف (${rec.status}) في النظام بنجاح من جهاز متصل`,
              'طاقم العمل'
            );
          });
        }
      } else {
        incomingAttendance.forEach(a => knownAttendanceIdsRef.current.add(a.id));
        isInitialAttendanceLoadedRef.current = true;
      }

      if (cloudAttendance) {
        setAttendanceRecords(cloudAttendance);
        persistOwnerPrivateData('lamsa_attendance_v1', cloudAttendance);
          }
    });

    // Listen to real-time production batches
    const unsubBatches = subscribeToProductionBatches((cloudBatches) => {
      if (!isCurrentOwnerSession()) return;
      if (cloudBatches) {
        setBatches(cloudBatches);
        persistOwnerPrivateData('lamsa_batches_v1', cloudBatches);
          }
    });

    // Listen to real-time app users
    const unsubUsers = subscribeToAppUsers((cloudUsers) => {
      if (!isCurrentOwnerSession()) return;
      if (cloudUsers && cloudUsers.length > 0) {
        const completeUsers = ensureCoreUsersList(cloudUsers);
        setUsers(completeUsers);
        persistOwnerPrivateData('lamsa_users_v1', completeUsers);
      }
    });

    // Listen to real-time daily closures
    const unsubClosures = subscribeToDailyClosures((cloudClosures, freshness) => {
      if (!isCurrentOwnerSession()) return;
      reportDashboardSource('closures', freshness || 'cached', cloudClosures);
      const incomingClosures = cloudClosures || [];
      if (isInitialClosuresLoadedRef.current && incomingClosures.length > 0) {
        const remoteNewClosures = incomingClosures.filter(c => !knownClosureIdsRef.current.has(c.id));
        if (remoteNewClosures.length > 0) {
          remoteNewClosures.forEach(c => {
            knownClosureIdsRef.current.add(c.id);
            soundAlertService.playActionChime();
            const currency = settings.currency || 'ج.م';
            const closureTotal = c.totalSalesRevenue ?? (c as any).totalSales ?? (c.cashSalesTotal || 0);
            browserNotificationService.sendNotification(`📋 إغلاق وردية / يومية: ${c.closedBy || c.openedBy}`, {
              body: `إجمالي مبيعات الوردية: ${closureTotal} ${currency} · تاريخ الإغلاق: ${c.date}`,
              tag: `closure-${c.id}`,
            });
            pushTopNotification(
              'goal',
              `📋 تقرير إغلاق وردية جديد`,
              `تم اعتماد الإغلاق بواسطة [${c.closedBy || c.openedBy}] بإجمالي مبيعات ${closureTotal} ${currency}`,
              'إغلاق الوردية'
            );
          });
        }
      } else {
        incomingClosures.forEach(c => knownClosureIdsRef.current.add(c.id));
        isInitialClosuresLoadedRef.current = true;
      }

      if (cloudClosures) {
        setDailyClosures(cloudClosures);
        persistOwnerPrivateData('lamsa_closures_v1', cloudClosures);
          }
    }, (freshness) => reportDashboardSource('closures', freshness));

    // Listen to real-time purchase requests
    const unsubPurchases = subscribeToPurchaseRequests((cloudPurchases) => {
      if (!isCurrentOwnerSession()) return;
      if (cloudPurchases) {
        setPurchaseRequests(cloudPurchases);
        persistOwnerPrivateData('lamsa_purchase_requests_v1', cloudPurchases);
          }
    });

    // Listen to real-time customer requests
    const unsubCustomerReqs = subscribeToCustomerRequests((cloudReqs) => {
      if (!isCurrentOwnerSession()) return;
      if (cloudReqs) {
        setCustomerRequests(cloudReqs);
        persistOwnerPrivateData('lamsa_customer_requests_v1', cloudReqs);
          }
    });

    // Listen to real-time stock checks
    const unsubStockChecks = subscribeToStockChecks((cloudChecks) => {
      if (!isCurrentOwnerSession()) return;
      if (cloudChecks) {
        setStockChecks(cloudChecks);
        persistOwnerPrivateData('lamsa_stock_checks_v1', cloudChecks);
          }
    });

    // Listen to real-time fragrance database
    const unsubFragranceDb = subscribeToFragranceDatabase((entries) => {
      if (!isCurrentOwnerSession()) return;
      if (entries && entries.length > 0) {
        setFragranceDatabase(entries);
        saveLocalFragranceDatabase(entries);
          }
    });

    // Listen to real-time strategic replenishment orders
    const unsubStrategicOrders = subscribeToStrategicOrders((orders) => {
      if (!isCurrentOwnerSession()) return;
      if (orders) {
        setStrategicOrders(orders);
        saveLocalStrategicOrders(orders);
          }
    });

    // Listen to real-time custom customers & loyalty profiles
    const unsubCustomers = subscribeToCustomCustomers((cloudCustomers, freshness) => {
      if (!isCurrentOwnerSession()) return;
      reportDashboardSource('customers', freshness || 'cached', cloudCustomers);
      if (cloudCustomers) {
        const cleanReal = cloudCustomers.filter(c => !isVirtualDemoCustomer(c));
        setCustomCustomers(cleanReal);
        persistOwnerPrivateData('lamsa_custom_customers_v1', cleanReal);
          }
    }, (freshness) => reportDashboardSource('customers', freshness));

    // Listen to real-time saved perfume mix formulas
    const unsubSavedMixes = subscribeToSavedMixes((cloudMixes) => {
      if (!isCurrentOwnerSession()) return;
      if (cloudMixes) {
        setSavedMixes(prevLocal => {
          const { merged, unsyncedLocalItems } = mergeCollectionRecords(prevLocal, cloudMixes, 'savedMixes');
          if (unsyncedLocalItems.length > 0) {
            unsyncedLocalItems.forEach(m => saveSavedMixCloud(m).catch(console.error));
          }
          persistOwnerPrivateData('lamsa_saved_mixes_v1', merged);
          return merged;
        });
          }
    });

    // Real-Time Connected Devices Presence Listener
    setDeviceFeedStatus('connecting');
    const unsubDevices = subscribeToConnectedDevices(
      (activeList) => { if (isCurrentOwnerSession()) setConnectedDevices(activeList); },
      (status) => {
        if (!isCurrentOwnerSession()) return;
        setDeviceFeedStatus(status);
        if (status === 'live') setDeviceFeedLastServerUpdate(Date.now());
      }
    );

    // Real-Time Owner Staff Directives & Broadcasts Listener
    const unsubBroadcasts = subscribeToOwnerBroadcasts((cloudBroadcasts) => {
      if (!isCurrentOwnerSession()) return;
      if (cloudBroadcasts) {
        setOwnerBroadcasts(cloudBroadcasts);
        persistOwnerPrivateData('lamsa_owner_broadcasts', cloudBroadcasts);
      }
    });

    const onRealtimeMessage = (e: MessageEvent) => {
      if (!isCurrentOwnerSession() || !e.data || !e.data.type) return;

      if (e.data.type === 'LIVE_SALE' && e.data.sale) {
        const liveSale = e.data.sale as Sale;
        soundAlertService.playSaleChime();
        const currency = settings.currency || 'ج.م';
        const saleAmount = liveSale.totalPrice ?? (liveSale as any).total ?? 0;
        const cashier = liveSale.employeeName || 'كاشير المتجر';
        pushTopNotification(
          'sale',
          `⚡ بيع حي الآن: ${saleAmount} ${currency}`,
          `تم تسجيل البيع بنجاح بواسطة [${cashier}]`,
          'تبويب متصل'
        );
      } else if (e.data.type === 'SETTINGS_UPDATE' && e.data.settings) {
        setSettings(e.data.settings);
        persistOwnerPrivateData('lamsa_settings_v2', e.data.settings);
      } else if (e.data.type === 'PRODUCT_UPDATE' && e.data.product) {
        setProducts(prev => {
          const idx = prev.findIndex(p => String(p.id) === String(e.data.product.id));
          const updated = idx >= 0 ? prev.map((p, i) => (i === idx ? e.data.product : p)) : [e.data.product, ...prev];
          persistOwnerPrivateData('lamsa_products', updated);
          return updated;
        });
      } else if (e.data.type === 'PRODUCT_DELETE' && e.data.productId) {
        setProducts(prev => {
          const filtered = prev.filter(p => String(p.id) !== String(e.data.productId));
          persistOwnerPrivateData('lamsa_products', filtered);
          return filtered;
        });
      } else if (e.data.type === 'BOTTLE_SIZES_UPDATE' && e.data.sizes) {
        setBottleSizes(e.data.sizes);
        persistOwnerPrivateData('lamsa_bottle_sizes_v2', e.data.sizes);
      } else if (e.data.type === 'EXPENSE_UPDATE' && e.data.expense) {
        setExpenses(prev => {
          const idx = prev.findIndex(x => x.id === e.data.expense.id);
          const updated = idx >= 0 ? prev.map((x, i) => (i === idx ? e.data.expense : x)) : [e.data.expense, ...prev];
          persistOwnerPrivateData('lamsa_expenses_v2', updated);
          return updated;
        });
      } else if (e.data.type === 'EXPENSE_DELETE' && e.data.expenseId) {
        setExpenses(prev => {
          const filtered = prev.filter(x => x.id !== e.data.expenseId);
          persistOwnerPrivateData('lamsa_expenses_v2', filtered);
          return filtered;
        });
      }
    };

    if (posRealtimeChannel) {
      posRealtimeChannel.addEventListener('message', onRealtimeMessage);
    }

    return () => {
      active = false;
      setIsCloudConnected(false);
      if (posRealtimeChannel) {
        posRealtimeChannel.removeEventListener('message', onRealtimeMessage);
      }
      unsubSales();
      unsubProducts();
      unsubExpenses();
      unsubSettings();
      unsubBottleSizes();
      unsubVaults();
      unsubWithdrawals();
      unsubAttendance();
      unsubBatches();
      unsubUsers();
      unsubClosures();
      unsubPurchases();
      unsubCustomerReqs();
      unsubStockChecks();
      unsubFragranceDb();
      unsubStrategicOrders();
      unsubCustomers();
      unsubSavedMixes();
      unsubDevices();
      unsubBroadcasts();
    };
  }, [authStatus, currentUser?.id, currentUser?.role, ownerSessionGeneration, reportDashboardSource]);

  // Reflect synchronous outbox writes in this tab and other tabs on the same device.
  useEffect(() => {
    const gate = ownerPrivateSessionRef.current;
    const generation = ownerSessionGeneration;
    if (authStatus !== 'ready' || currentUser?.role !== 'OWNER' || !gate.isAuthorized(generation)) {
      setQueuedSaleCount(0);
      setSaleQueueNotice('');
      return;
    }
    const updateQueuedSales = (queue = getOfflineQueue()) => {
      if (!gate.isAuthorized(generation)) return;
      setQueuedSaleCount(queue.filter((item) => item.entityType === 'sale').length);
    };
    updateQueuedSales();
    return subscribeToOfflineQueue(updateQueuedSales);
  }, [authStatus, currentUser?.id, currentUser?.role, ownerSessionGeneration]);

  // The legacy full-Sale outbox is owner-only. Employee sales must use the
  // separate minimal v3 Tarek outbox; never route them through addSaleCloud.
  useEffect(() => {
    const gate = ownerPrivateSessionRef.current;
    const generation = ownerSessionGeneration;
    if (authStatus !== 'ready' || currentUser?.role !== 'OWNER' || !gate.isAuthorized(generation)) return;
    let active = true;
    const retry = startSaleQueueAutoRetry((sale) => addSaleCloud(sale), {
      onSyncStart: () => {
        if (!active || !gate.isAuthorized(generation)) return;
        setSaleQueueSyncing(true);
        setSaleQueueNotice('جارٍ إرسال الفواتير المعلقة وانتظار تأكيد Firestore…');
      },
      onResult: (result) => {
        if (!active || !gate.isAuthorized(generation) || result.attempted === 0) return;
        setSaleQueueSyncing(false);
        const remaining = getOfflineQueue().filter((item) => item.entityType === 'sale');
        setQueuedSaleCount(remaining.length);
        if (remaining.length === 0 && result.synced > 0) {
          setSaleQueueNotice(`أكد Firestore مزامنة ${result.synced} فاتورة مع المخزون.`);
          setCloudMessage('تم تأكيد مزامنة الفواتير المعلقة مع المخزون عبر Firestore.');
        } else if (remaining.length > 0) {
          const permissionBlocked = currentUser.role !== 'OWNER' && remaining.some((item) =>
            item.errorMessage?.includes('owner-auth-required')
            || item.errorMessage?.includes('permission-denied')
            || item.errorMessage?.includes('not-authorized')
          );
          setSaleQueueNotice(permissionBlocked
            ? 'الفاتورة محفوظة على هذا الجهاز، لكن صلاحيات طارق الحالية لا تسمح بكتابتها إلى Firestore؛ لم تُعتبر متزامنة.'
            : 'تعذر تأكيد بعض الفواتير؛ ما زالت محفوظة محلياً وستُعاد المحاولة تلقائياً.');
        }
      },
      onError: (error) => {
        if (!active || !gate.isAuthorized(generation)) return;
        setSaleQueueSyncing(false);
        console.error('Queued sale retry failed:', error);
        setSaleQueueNotice('تعذر إكمال محاولة المزامنة؛ ما زالت الفواتير محفوظة في الطابور المحلي.');
      },
    });
    saleQueueRetryRef.current = retry.retryNow;
    return () => {
      active = false;
      setSaleQueueSyncing(false);
      if (saleQueueRetryRef.current === retry.retryNow) saleQueueRetryRef.current = null;
      retry.stop();
    };
  }, [authStatus, currentUser?.id, currentUser?.role, ownerSessionGeneration]);

  // Real-Time Multi-Device Presence Heartbeat & Auto-Sync
  useEffect(() => {
    if (authStatus !== 'ready' || currentUser?.role !== 'OWNER') return;
    // Initial presence ping
    publishDevicePresence(currentUser).catch(() => {});

    // Presence is informational; one-minute heartbeats reduce background writes
    // while the onSnapshot streams for sales and operational data stay immediate.
    const interval = setInterval(() => {
      publishDevicePresence(currentUser).catch(() => {});
    }, 60000);

    const handleBeforeUnload = () => {
      markDeviceOfflineCloud().catch(() => {});
    };

    window.addEventListener('beforeunload', handleBeforeUnload);

    return () => {
      clearInterval(interval);
      window.removeEventListener('beforeunload', handleBeforeUnload);
    };
  }, [authStatus, currentUser]);

  // Notify only for a new device ID in a server-confirmed presence snapshot.
  useEffect(() => {
    if (deviceFeedStatus !== 'live') return;
    const currentIds = new Set(connectedDevices.map((device) => device.deviceId));
    const previousIds = prevDeviceIdsRef.current;
    if (effectiveUser?.role === 'OWNER' && previousIds) {
      const newlyJoined = connectedDevices.find((device) =>
        device.deviceId !== getLocalDeviceId() && !previousIds.has(device.deviceId)
      );
      if (newlyJoined) {
        soundAlertService.playActionChime();
        pushTopNotification(
          'goal',
          `📱 نبضة حضور جديدة`,
          `وصلت نبضة من [${newlyJoined.deviceName}] بواسطة [${newlyJoined.userName}] · إجمالي النبضات الحديثة: ${connectedDevices.length}`,
          'رادار التزامن',
          'عرض الأجهزة',
          () => setIsConnectedDevicesModalOpen(true)
        );
      }
    }
    prevDeviceIdsRef.current = currentIds;
  }, [connectedDevices, deviceFeedStatus, effectiveUser]);

  // Sync state changes to durable storage (localStorage + IndexedDB)
  useEffect(() => {
    persistOwnerPrivateData('lamsa_products', products);
  }, [products]);

  useEffect(() => {
    persistOwnerPrivateData('lamsa_sales', sales);
  }, [sales]);

  useEffect(() => {
    persistOwnerPrivateData('lamsa_expenses_v2', expenses);
  }, [expenses]);

  useEffect(() => {
    persistOwnerPrivateData('lamsa_settings_v2', settings);
  }, [settings]);

  useEffect(() => {
    persistOwnerPrivateData('lamsa_bottle_sizes_v2', bottleSizes);
  }, [bottleSizes]);

  useEffect(() => {
    persistOwnerPrivateData('lamsa_vaults_v1', vaults);
  }, [vaults]);

  useEffect(() => {
    persistOwnerPrivateData('lamsa_withdrawals_v1', withdrawals);
  }, [withdrawals]);

  useEffect(() => {
    persistOwnerPrivateData('lamsa_attendance_v1', attendanceRecords);
  }, [attendanceRecords]);

  useEffect(() => {
    persistOwnerPrivateData('lamsa_batches_v1', batches);
  }, [batches]);

  useEffect(() => {
    persistOwnerPrivateData('lamsa_audit_logs_v1', auditLogs);
  }, [auditLogs]);

  useEffect(() => {
    persistOwnerPrivateData('lamsa_users_v1', users);
  }, [users]);

  useEffect(() => {
    persistOwnerPrivateData('lamsa_closures_v1', dailyClosures);
  }, [dailyClosures]);

  useEffect(() => {
    persistOwnerPrivateData('lamsa_purchase_requests_v1', purchaseRequests);
  }, [purchaseRequests]);

  useEffect(() => {
    persistOwnerPrivateData('lamsa_customer_requests_v1', customerRequests);
  }, [customerRequests]);

  useEffect(() => {
    persistOwnerPrivateData('lamsa_stock_checks_v1', stockChecks);
  }, [stockChecks]);

  useEffect(() => {
    persistOwnerPrivateData('lamsa_saved_mixes_v1', savedMixes);
  }, [savedMixes]);

  // Sync Fragrance Encyclopedia to LocalStorage
  useEffect(() => {
    try {
      saveLocalFragranceDatabase(fragranceDatabase);
    } catch (e) {
      console.error(e);
    }
  }, [fragranceDatabase]);

  // Sync Strategic Replenishment Orders to LocalStorage
  useEffect(() => {
    try {
      saveLocalStrategicOrders(strategicOrders);
    } catch (e) {
      console.error(e);
    }
  }, [strategicOrders]);

  // Automatic Fragrance Knowledge Base Auto-Enrichment (Batched once in background without blocking UI)
  useEffect(() => {
    if (!products || products.length === 0) return;

    const timer = setTimeout(async () => {
      const existingNames = new Set(
        fragranceDatabase.map((f) => f.name.trim().toLowerCase())
      );
      const existingIds = new Set(
        fragranceDatabase.map((f) => String(f.productId || ''))
      );

      const missingProducts = products.filter(
        (prod) =>
          !existingNames.has(prod.name.trim().toLowerCase()) &&
          !existingIds.has(String(prod.id))
      );

      if (missingProducts.length === 0) return;

      const newlyEnriched: FragranceDatabaseEntry[] = [];
      for (const prod of missingProducts) {
        try {
          const enriched = await enrichFragranceProfile(
            prod.name,
            prod.brand,
            prod.origin,
            prod.type,
            fragranceDatabase,
            false
          );
          if (enriched) {
            newlyEnriched.push({ ...enriched, productId: prod.id });
          }
        } catch {}
      }

      if (newlyEnriched.length > 0) {
        setFragranceDatabase((prev) => {
          const prevMap = new Map<string, FragranceDatabaseEntry>(
            prev.map((p) => [p.name.trim().toLowerCase(), p])
          );
          newlyEnriched.forEach((item) => {
            prevMap.set(item.name.trim().toLowerCase(), item);
          });
          const merged: FragranceDatabaseEntry[] = Array.from(prevMap.values());
          saveLocalFragranceDatabase(merged);
          return merged;
        });
      }
    }, 2000);

    return () => clearTimeout(timer);
  }, [products.length]);

  // User save handler
  const handleSaveUser = async (user: AppUser) => {
    setUsers(prev => {
      const idx = prev.findIndex(u => u.id === user.id);
      if (idx >= 0) {
        const next = [...prev];
        next[idx] = user;
        return next;
      }
      return [...prev, user];
    });
    try {
      await saveAppUserCloud(user);
    } catch (e) {
      console.error("Error saving user:", e);
    }
  };

  // Daily closure save handler
  const handleSaveClosure = async (closure: DailyClosure) => {
    setDailyClosures(prev => {
      const idx = prev.findIndex(c => c.id === closure.id);
      if (idx >= 0) {
        const next = [...prev];
        next[idx] = closure;
        return next;
      }
      return [closure, ...prev];
    });
    try {
      await saveDailyClosureCloud(closure);
    } catch (e) {
      console.error("Error saving closure:", e);
    }
  };

  // Purchase request save handler
  const handleSavePurchaseRequest = async (req: PurchaseRequest) => {
    setPurchaseRequests(prev => {
      const idx = prev.findIndex(r => r.id === req.id);
      if (idx >= 0) {
        const next = [...prev];
        next[idx] = req;
        return next;
      }
      return [req, ...prev];
    });
    try {
      await savePurchaseRequestCloud(req);
    } catch (e) {
      console.error("Error saving purchase request:", e);
    }
  };

  // Customer request save handler
  const handleSaveCustomerRequest = async (req: CustomerRequest) => {
    setCustomerRequests(prev => {
      const idx = prev.findIndex(r => r.id === req.id);
      if (idx >= 0) {
        const next = [...prev];
        next[idx] = req;
        return next;
      }
      return [req, ...prev];
    });
    try {
      await saveCustomerRequestCloud(req);
    } catch (e) {
      console.error("Error saving customer request:", e);
    }
  };

  // Stock check save handler
  const handleSaveStockCheck = async (check: StockCheckRecord) => {
    setStockChecks(prev => [check, ...prev]);
    try {
      await saveStockCheckCloud(check);
    } catch (e) {
      console.error("Error saving stock check:", e);
    }
  };

  const handleSaveFragranceProfile = async (profile: FragranceDatabaseEntry) => {
    setFragranceDatabase(prev => [profile, ...prev.filter(p => p.id !== profile.id)]);
    try {
      await saveFragranceProfileCloud(profile);
    } catch (e) {
      console.error("Error saving fragrance profile:", e);
    }
  };

  const handleBulkUpsertFragranceProfiles = async (profiles: FragranceDatabaseEntry[]) => {
    if (!profiles || profiles.length === 0) return;
    const merged = await bulkUpsertFragranceProfilesCloud(profiles);
    setFragranceDatabase(merged);
  };

  // Automatic 12:00 Midnight Daily Closing Report Scheduler & Offline-to-Online Auto-Dispatch
  useEffect(() => {
    if (settings.autoMidnightReportEnabled === false) return;

    const handleOnlineFlush = async () => {
      try {
        const res = await flushOfflineReportQueue(
          settings.googleFormId,
          settings.googleFormWebhookUrl,
          settings
        );
        if (res.sentCount > 0 || res.whatsappDispatched) {
          pushTopNotification(
            'goal',
            `تم إرسال التقرير اليومي المؤجل تلقائياً فور عودة الإنترنت`,
            `أُرسل التقرير إلى ${settings.storeEmail || 'lamsteitr@gmail.com'} وواتساب طارق (${settings.storeWhatsAppPrimary || '01123376728'} / ${settings.storeWhatsAppSecondary || '01062018755'})`,
            'مزامنة تلقائية ✓'
          );
        }
      } catch (err) {
        console.warn('Auto flush offline report queue error:', err);
      }
    };

    window.addEventListener('online', handleOnlineFlush);

    // Check every 45 seconds if midnight (00:00 - 00:59) has arrived and today's closing report hasn't been generated yet
    const checkMidnightReport = async () => {
      const now = new Date();
      const hour = now.getHours();
      const todayKey = now.toISOString().slice(0, 10);
      const lastDispatchedDate = getLastAutoMidnightReportDate();

      if (hour === 0 && lastDispatchedDate !== todayKey) {
        setLastAutoMidnightReportDate(todayKey);
        const report = buildDailyClosingReport({
          targetDate: todayKey,
          triggerType: 'midnight_auto',
          sales,
          expenses,
          products,
          settings,
          currentClosure: dailyClosures.find(c => c.date === todayKey) || null,
          auditLogs,
          customCustomers,
          executedBy: 'الأتمتة التلقائية (12:00 منتصف الليل)',
        });

        upsertAutomatedReport({
          ...report,
          status: navigator.onLine ? 'pending_auth' : 'queued_offline',
        });

        if (navigator.onLine) {
          await executeFreeWhatsAppAutomation(report, settings).catch(() => {});
          const flushRes = await flushOfflineReportQueue(
            settings.googleFormId,
            settings.googleFormWebhookUrl,
            settings
          );
          if (flushRes.sentCount > 0) {
            pushTopNotification(
              'goal',
              `تم إرسال تقرير إغلاق منتصف الليل تلقائياً (${todayKey})`,
              `أُرسل إلى ${settings.storeEmail || 'lamsteitr@gmail.com'} وواتساب طارق (${settings.storeWhatsAppPrimary || '01123376728'} / ${settings.storeWhatsAppSecondary || '01062018755'})`,
              'أتمتة 12:00 ص'
            );
          } else {
            pushTopNotification(
              'info',
              `تم تجهيز تقرير إغلاق منتصف الليل (${todayKey}) لواتساب طارق والبريد`,
              `التقرير جاهز للإرسال إلى واتساب (${settings.storeWhatsAppPrimary || '01123376728'} / ${settings.storeWhatsAppSecondary || '01062018755'}) و ${settings.storeEmail || 'lamsteitr@gmail.com'}`,
              'تقرير 12:00 ص',
              'عرض وإرسال',
              () => setIsDailyReportAutomationModalOpen(true)
            );
          }
        } else {
          pushTopNotification(
            'warning',
            `تم حفظ تقرير منتصف الليل (${todayKey}) للإرسال التلقائي فور توفر الإنترنت`,
            `سيتم إرساله تلقائياً إلى ${settings.storeEmail || 'lamsteitr@gmail.com'} وواتساب طارق (${settings.storeWhatsAppPrimary || '01123376728'}) بمجرد عودة الاتصال`,
            'طابور الأتمتة'
          );
        }
      }
    };

    const intervalId = setInterval(checkMidnightReport, 45000);
    return () => {
      window.removeEventListener('online', handleOnlineFlush);
      clearInterval(intervalId);
    };
  }, [
    settings,
    sales,
    expenses,
    products,
    dailyClosures,
    auditLogs,
    customCustomers,
  ]);

  const handleSaveStrategicOrder = async (order: StrategicReplenishmentOrder) => {
    setStrategicOrders(prev => [order, ...prev.filter(o => o.id !== order.id)]);
    try {
      await saveStrategicOrderCloud(order);
    } catch (e) {
      console.error("Error saving strategic order:", e);
    }
  };

  const handleGoogleSignIn = async () => {
    setAuthError(null);
    setIsSigningIn(true);
    try {
      await signInWithGoogle();
    } catch (error) {
      setAuthError(getFirebaseAuthErrorMessage(error));
      setAuthStatus(auth.currentUser ? 'error' : 'signed_out');
    } finally {
      setIsSigningIn(false);
    }
  };

  const handleRequestOperationalAccess = async () => {
    setIsSubmittingAccessRequest(true);
    setAuthError(null);
    try {
      const request = await submitOperationalAccessRequestCloud();
      setAccessRequestStatus(request.status);
    } catch (error) {
      setAuthError(getFirebaseAuthErrorMessage(error));
    } finally {
      setIsSubmittingAccessRequest(false);
    }
  };

  const handleCheckOperationalAccess = async () => {
    const firebaseUser = auth.currentUser;
    if (!firebaseUser) {
      setAccessRequestStatus('none');
      setAuthStatus('signed_out');
      return;
    }
    setIsCheckingAccessRequest(true);
    setAuthError(null);
    try {
      const authorized = await validateAuthorizedAuthUser(firebaseUser);
      applyAuthorizedIdentity(authorized);
      setAccessRequestStatus('approved');
      setAuthStatus('ready');
    } catch (error) {
      setAuthError(getFirebaseAuthErrorMessage(error));
      try {
        const request = await getOwnOperationalAccessRequestCloud();
        setAccessRequestStatus(request?.status || 'none');
      } catch {
        setAccessRequestStatus('none');
      }
    } finally {
      setIsCheckingAccessRequest(false);
    }
  };

  const handleLocalUnlock = () => {
    if (authStatus !== 'ready' || !currentUser) return;
    setIsScreenLocked(false);
    try {
      sessionStorage.setItem('lamsa_unlocked_session_v1', 'true');
    } catch {}
  };

  const handleLockScreen = () => {
    setIsScreenLocked(true);
    try {
      sessionStorage.removeItem('lamsa_unlocked_session_v1');
    } catch {}
  };

  const handleLogout = async () => {
    ownerPrivateSessionRef.current.beginIdentityTransition();
    clearOwnerPrivateTransientState();
    clearSessionUser();
    clearCurrentFirebaseRoleAssignment();
    setCurrentUser(null);
    setAuthStatus('checking');
    setIsAuthModalOpen(false);
    setAuthError(null);
    setAccessRequestStatus('none');
    setIsCloudConnected(false);
    setCloudMessage('سجّل الدخول بحساب Google المعتمد؛ لا يوجد اتصال سحابي قبل التحقق.');
    setIsScreenLocked(true);
    try {
      sessionStorage.removeItem('lamsa_unlocked_session_v1');
    } catch {}
    try {
      await signOutFirebase();
    } catch (error) {
      setAuthStatus('error');
      setAuthError(getFirebaseAuthErrorMessage(error));
    }
  };

  const handlePrepareTarekCatalog = async () => {
    if (authStatus !== 'ready' || currentUser?.role !== 'OWNER') return;
    setIsPreparingTarekCatalog(true);
    setTarekCatalogPrepStatus(null);
    try {
      const result = await prepareTarekReadOnlyCatalogCloud();
      setTarekCatalogPrepStatus(`اكتملت الإسقاطات الآمنة: ${result.products} منتج مخزون، و${result.saleProducts} منتج بيع، و${result.saleBottleSizes} سعراً مرجعياً للعبوات. لم تُعدّل السجلات القديمة.`);
    } catch (error) {
      const detail = error instanceof Error ? error.message : 'تعذّر تجهيز الإسقاطات الآمنة.';
      setTarekCatalogPrepStatus(`لم يكتمل التجهيز: ${detail}`);
    } finally {
      setIsPreparingTarekCatalog(false);
    }
  };

  // Real-time Administrative Directives & Staff Broadcast Handlers
  const handleSendOwnerBroadcast = async (broadcast: OwnerStaffBroadcast) => {
    setOwnerBroadcasts(prev => [broadcast, ...prev.filter(b => b.id !== broadcast.id)]);
    persistOwnerPrivateData('lamsa_owner_broadcasts', [broadcast, ...ownerBroadcasts]);
    try {
      await sendOwnerBroadcastCloud(broadcast);
    } catch (e) {
      console.error("Error sending owner broadcast to cloud:", e);
    }
    pushTopNotification(
      'goal',
      `📢 ${broadcast.title}`,
      broadcast.message,
      broadcast.isImportant ? 'تنبيه هام' : 'إشعار فوري'
    );
  };

  const handleDismissBroadcast = (broadcastId: string) => {
    const todayKey = new Date().toISOString().slice(0, 10);
    const targetBroadcast = ownerBroadcasts.find(b => b.id === broadcastId);
    setDismissedBroadcastIds(prev => {
      const next = new Set(prev);
      // For recurring alerts, dismiss only for today specifically so it will repeat tomorrow/next week
      if (targetBroadcast?.repeatMode && targetBroadcast.repeatMode !== 'none') {
        next.add(`${broadcastId}_${todayKey}`);
      } else {
        next.add(broadcastId);
      }
      persistOwnerPrivateData('lamsa_dismissed_broadcasts_v2', Array.from(next));
      return next;
    });
  };

  const handleAcknowledgeOwnerBroadcast = async (broadcastId: string) => {
    const employee = currentUser?.name || 'طارق';
    setOwnerBroadcasts(prev => {
      const updated = prev.map(b => {
        if (b.id === broadcastId) {
          const acks = b.acknowledgedBy || [];
          if (!acks.some(a => a.employeeName === employee)) {
            return {
              ...b,
              acknowledgedBy: [...acks, { employeeName: employee, timestamp: new Date().toISOString() }]
            };
          }
        }
        return b;
      });
      persistOwnerPrivateData('lamsa_owner_broadcasts', updated);
      return updated;
    });
    try {
      await acknowledgeOwnerBroadcastCloud(broadcastId, employee);
    } catch (e) {
      console.error("Error acknowledging broadcast:", e);
    }
    soundAlertService.playActionChime();
    pushTopNotification('info', 'تم تأكيد الاطلاع', 'تم توثيق قراءتك للتنبيه بنجاح', 'تأكيد');
    
    // Automatically close from top banner upon read confirmation, persisting across reload
    handleDismissBroadcast(broadcastId);
  };

  // Active broadcast to display in UI for current user (handles auto-expiration, recurrence, and dismissal)
  const activeBroadcastForDisplay = useMemo(() => {
    const now = Date.now();
    const today = new Date();
    const todayDateStr = today.toISOString().slice(0, 10);
    const currentDayOfWeek = today.getDay(); // 0 = Sunday, 1 = Monday, ..., 6 = Saturday

    return ownerBroadcasts.find(b => {
      if (b.isArchived) return false;

      // Recurrence Evaluation (إعادة التنبيه كل يوم أو كل أسبوع)
      if (b.repeatMode && b.repeatMode !== 'none') {
        // If dismissed for today specifically, hide it for today
        if (dismissedBroadcastIds.has(`${b.id}_${todayDateStr}`)) return false;

        // Check start date window
        if (b.repeatStartDate && todayDateStr < b.repeatStartDate) return false;
        // Check end date window
        if (b.repeatEndDate && todayDateStr > b.repeatEndDate) return false;

        // If weekly, verify day of week matches
        if (b.repeatMode === 'weekly' && b.repeatDayOfWeek !== undefined && b.repeatDayOfWeek !== currentDayOfWeek) {
          return false;
        }
      } else {
        // Non-recurring: standard dismissal check
        if (dismissedBroadcastIds.has(b.id)) return false;

        // Auto-expiration check: Default 8 hours unless custom expiresAt or marked important
        if (b.expiresAt) {
          if (new Date(b.expiresAt).getTime() <= now) return false;
        } else if (!b.isImportant && b.createdAt) {
          const age = now - new Date(b.createdAt).getTime();
          if (age > 8 * 3600 * 1000) return false; // Expired after 8 hours default
        }
      }

      // Target matching: 'all' or specific employee name or role
      const matchesTarget = !b.targetEmployee || b.targetEmployee === 'all' || b.targetEmployee === currentUser?.name;
      if (!matchesTarget) return false;
      return true;
    });
  }, [ownerBroadcasts, dismissedBroadcastIds, currentUser]);

  // Production batch save handler (سجل التشغيل والتعتيق)
  const handleSaveBatch = async (batch: ProductionBatch) => {
    setBatches(prev => [batch, ...prev.filter(b => b.id !== batch.id)]);
    try {
      await saveProductionBatchCloud(batch);
    } catch (e) {
      console.error("Error saving batch to cloud:", e);
    }
  };

  // Audit log handler (سجل تدقيق التعديلات والعمليات والخصومات)
  const handleAddAuditLog = async (log: AuditLogRecord) => {
    setAuditLogs(prev => [log, ...prev]);
    try {
      await addAuditLogCloud(log);
    } catch (e) {
      console.error("Error saving audit log to cloud:", e);
    }
  };

  // Handle staff attendance and shift opening (تأكيد الحضور وفتح المتجر واستحقاق الراتب الأساسي)
  const handleCheckInAttendance = async (record: StaffAttendanceRecord) => {
    setAttendanceRecords(prev => {
      const filtered = prev.filter(r => r.id !== record.id && !(r.date === record.date && r.employeeName === record.employeeName));
      return [record, ...filtered];
    });
    try {
      await saveStaffAttendanceCloud(record);
    } catch (e) {
      console.error("Error saving attendance to cloud:", e);
    }
  };

  // Real-time sale completion synchronized to cloud (multi-item and single-item support)
  const handleSaleComplete = async (rawSale: Sale) => {
    if (currentUser?.role !== 'OWNER') {
      setSaleQueueNotice('مسار POS المالي القديم للمالك فقط؛ يلزم استخدام نية البيع التشغيلية v3 قبل إتاحة البيع للموظف.');
      throw new Error('sale-sync/tarek-v3-required');
    }
    const sale: Sale = {
      ...rawSale,
      dataClassification: rawSale.dataClassification || 'PRODUCTION',
      isTestData: Boolean(rawSale.isTestData),
    };
    const deductionMap = getSaleStockDeductions(sale);
    for (const [productId, deduction] of deductionMap) {
      const product = products.find(p => String(p.id) === productId);
      if (!product || !Number.isFinite(product.stock_grams) || product.stock_grams < deduction) {
        throw new Error(`sale-sync/preflight-insufficient-stock:${productId}`);
      }
    }

    // Write the durable local outbox before the first network call. If the app
    // closes while Firestore is unavailable or its acknowledgement is ambiguous,
    // the same sale ID survives restart and can be retried idempotently.
    let cloudSyncSucceeded = false;
    let queuedSale: ReturnType<typeof enqueueOfflineAction>;
    try {
      queuedSale = enqueueOfflineAction('sale', sale);
      setSaleQueueNotice('حُفظت الفاتورة في الطابور المحلي؛ بانتظار تأكيد Firestore.');
    } catch (queueError) {
      console.error('Could not persist sale to the durable outbox:', queueError);
      setSaleQueueNotice('تعذر حفظ الفاتورة محلياً؛ لم تُعتمد ولم تُعرض كبيع مكتمل.');
      throw new Error('sale-sync/offline-queue-persistence-failed');
    }

    if (typeof navigator !== 'undefined' && navigator.onLine) {
      setSaleQueueSyncing(true);
      try {
        const retryResult = await flushPendingSaleQueue((pendingSale) => addSaleCloud(pendingSale));
        if (retryResult.syncedIds.includes(queuedSale.id)) {
          cloudSyncSucceeded = true;
          setSaleQueueNotice('أكد Firestore حفظ الفاتورة وتحديث المخزون.');
          setCloudMessage('تم تأكيد مزامنة أحدث عملية إلى Firestore.');
        } else if (retryResult.failed > 0) {
          const retained = getOfflineQueue().find((item) => item.id === queuedSale.id);
          if (/^sale-sync\/commission-counter-(?:not-ready|stale|ambiguous-date)$/.test(retained?.errorMessage || '')) {
            setSaleQueueNotice('لم تُعتمد الفاتورة بسبب عدم جاهزية العداد أو تغيّر generation؛ بقيت للمراجعة ولم يُخصم المخزون محلياً. حدّث العداد/الاقتباس ثم أعد إدخالها.');
            throw new Error(retained?.errorMessage);
          }
          const permissionBlocked = currentUser?.role !== 'OWNER'
            && (retained?.errorMessage?.includes('owner-auth-required')
              || retained?.errorMessage?.includes('permission-denied')
              || retained?.errorMessage?.includes('not-authorized'));
          setSaleQueueNotice(permissionBlocked
            ? 'الفاتورة محفوظة محلياً، لكن صلاحيات طارق الحالية لا تسمح بكتابتها إلى Firestore؛ لم تُعتبر متزامنة.'
            : 'لم يؤكد Firestore البيع بعد؛ بقيت الفاتورة في الطابور وستُعاد المحاولة تلقائياً.');
        }
      } catch (retryError) {
        const retryCode = retryError instanceof Error ? retryError.message : '';
        if (/^sale-sync\/commission-counter-(?:not-ready|stale|ambiguous-date)$/.test(retryCode)) {
          setSaleQueueNotice('لم تُعتمد الفاتورة بسبب تعارض عداد العمولة؛ احتُفظ بها كعنصر فشل للمراجعة، ولم يُحدّث المخزون المحلي.');
          throw retryError;
        }
        console.error('Queued sale retry failed after durable queueing:', retryError);
        setSaleQueueNotice('لم يؤكد Firestore البيع؛ بقيت الفاتورة محفوظة في الطابور المحلي.');
      } finally {
        setSaleQueueSyncing(false);
      }
    }

    // Local sale/inventory changes are durable only after cloud commit or a verified queue write.
    const newProducts = products.map(product => {
      const deduction = deductionMap.get(String(product.id));
      return deduction === undefined ? product : { ...product, stock_grams: product.stock_grams - deduction };
    });
    setProducts(newProducts);
    persistOwnerPrivateData('lamsa_products', newProducts);
    setSales(prev => {
      const next = [sale, ...prev];
      persistOwnerPrivateData('lamsa_sales', next);
      return next;
    });

    // Update Lamsat Etr Mix Library stats (timesSold & repurchaseRatePercent) when a mix formula is sold
    const mixItemsInSale = sale.items.filter(it => it.isMix && it.mixComponents && it.mixComponents.length > 0);
    if (mixItemsInSale.length > 0 && savedMixes.length > 0) {
      const isReturningCustomer = Boolean(
        sale.customerPhone &&
        sales.some(s => !s.isReversed && s.customerPhone && s.customerPhone.trim() === sale.customerPhone?.trim())
      );
      setSavedMixes(prevMixes => {
        let changed = false;
        const nextMixes = prevMixes.map(sm => {
          const smKey = sm.components.map(c => c.productName.trim()).sort().join('|');
          const matchedSaleMix = mixItemsInSale.find(it => {
            if (it.customFormulaName && it.customFormulaName.trim() === sm.name.trim()) return true;
            const itKey = (it.mixComponents || []).map(c => c.productName.trim()).sort().join('|');
            return itKey === smKey;
          });
          if (!matchedSaleMix) return sm;
          changed = true;
          const prevSold = Number(sm.timesSold || 0);
          const nextSold = prevSold + (matchedSaleMix.quantity || 1);
          const prevRepurchase = Number(sm.repurchaseRatePercent || 0);
          const nextRepurchase = isReturningCustomer
            ? Math.min(100, Math.round((prevRepurchase * prevSold + 100) / Math.max(1, nextSold)))
            : Math.round((prevRepurchase * prevSold) / Math.max(1, nextSold));
          const updatedFormula: SavedMixFormula = {
            ...sm,
            timesSold: nextSold,
            repurchaseRatePercent: nextRepurchase,
            updatedAt: new Date().toISOString(),
          };
          if (cloudSyncSucceeded) {
            saveSavedMixCloud(updatedFormula).catch((error) => {
              console.error('Could not sync sale-related mix stats:', error);
              setIsCloudConnected(false);
              setCloudMessage('تمت مزامنة الفاتورة، لكن تعذرت مزامنة بعض بيانات التركيبة.');
            });
          }
          return updatedFormula;
        });
        if (changed) {
          persistOwnerPrivateData('lamsa_saved_mixes_v1', nextMixes);
        }
        return nextMixes;
      });
    }

    // Automatically update Customer Record & Loyalty Points Balance when sale has customer info or redeemed points
    const cleanCustPhone = (sale.customerPhone || '').trim();
    const cleanCustName = (sale.customerName || '').trim();
    if (cleanCustPhone || cleanCustName) {
      const loyaltyEnabled = settings.loyaltyEnabled !== false;
      const earnStepEgp = Math.max(1, settings.loyaltyEarnStepEgp || 10);
      const cashPerPointEgp = Math.max(0.05, settings.loyaltyCashPerPointEgp || 0.10);
      const redeemedPts = loyaltyEnabled ? (sale.loyaltyPointsRedeemed || 0) : 0;
      const earnedPts = loyaltyEnabled
        ? (sale.loyaltyPointsEarned ?? Math.floor((sale.totalPrice || 0) / earnStepEgp))
        : 0;
      const actorName = sale.employeeName || currentUser?.displayName || 'طارق';

      setCustomCustomers(prev => {
        const idx = prev.findIndex(
          c =>
            (cleanCustPhone && c.phone && c.phone.trim() === cleanCustPhone) ||
            (!cleanCustPhone && cleanCustName && c.name.trim() === cleanCustName)
        );

        const newLogs = [];
        if (redeemedPts > 0) {
          newLogs.push({
            id: `log-redeem-${sale.id}`,
            date: sale.date,
            pointsDelta: -redeemedPts,
            reason: `تحويل ${redeemedPts} نقطة ولاء إلى خصم نقدي فوري (-${sale.loyaltyDiscountAmount || Math.round(redeemedPts * cashPerPointEgp)} ${settings.currency}) في فاتورة #${sale.id.slice(-5)}`,
            byUser: actorName,
          });
        }
        if (earnedPts > 0) {
          newLogs.push({
            id: `log-earn-${sale.id}`,
            date: sale.date,
            pointsDelta: earnedPts,
            reason: `نقاط ولاء مكتسبة تلقائياً من فاتورة شراء #${sale.id.slice(-5)} (${sale.totalPrice} ${settings.currency})`,
            byUser: actorName,
          });
        }

        let next: CustomCustomerRecord[];
        let targetToSaveCloud: CustomCustomerRecord;
        if (idx >= 0) {
          const existing = prev[idx];
          const updatedRecord: CustomCustomerRecord = {
            ...existing,
            name: cleanCustName || existing.name,
            phone: cleanCustPhone || existing.phone,
            redeemedPoints: (existing.redeemedPoints || 0) + redeemedPts,
            loyaltyLogs: [...newLogs, ...(existing.loyaltyLogs || [])],
            updatedAt: sale.date,
          };
          targetToSaveCloud = updatedRecord;
          next = [...prev];
          next[idx] = updatedRecord;
        } else {
          const newRecord: CustomCustomerRecord = {
            phone: cleanCustPhone,
            name: cleanCustName || 'عميل مميز',
            favoriteStyle: 'متنوع',
            bonusPoints: 0,
            redeemedPoints: redeemedPts,
            loyaltyLogs: newLogs,
            createdAt: sale.date,
            updatedAt: sale.date,
          };
          targetToSaveCloud = newRecord;
          next = [newRecord, ...prev];
        }

        if (cloudSyncSucceeded) {
          saveCustomCustomerCloud(targetToSaveCloud).catch((error) => {
            console.error('Error syncing sale customer to cloud:', error);
            setIsCloudConnected(false);
            setCloudMessage('تمت مزامنة الفاتورة، لكن تعذرت مزامنة سجل العميل.');
          });
        }
        persistOwnerPrivateData('lamsa_custom_customers_v1', next);
        return next;
      });
    }

    const itemsSummary = sale.items.map(i => i.productName).join('، ');
    const loyaltySubtitle = sale.loyaltyPointsRedeemed
      ? ` · خصم ولاء -${sale.loyaltyDiscountAmount} ${settings.currency} (الرصيد الجديد: ★ ${sale.customerLoyaltyBalanceAfter ?? 0} نقطة)`
      : sale.loyaltyPointsEarned
      ? ` · +${sale.loyaltyPointsEarned} نقطة ولاء للعميل`
      : '';

    // Update Restock Vault balance in real-time (capital recovery for raw materials)
    if (sale.totalCost > 0) {
      setVaults(prevVaults => {
        const next = prevVaults.map(v => {
          if (v.id === 'restock') {
            const updated: FinancialVault = {
              ...v,
              totalInflow: (v.totalInflow || 0) + sale.totalCost,
              currentBalance: (v.currentBalance || 0) + sale.totalCost,
            };
            if (cloudSyncSucceeded) {
              saveVaultCloud(updated).catch((error) => {
                console.error('Could not sync sale-related vault balance:', error);
                setIsCloudConnected(false);
                setCloudMessage('تمت مزامنة الفاتورة، لكن تعذرت مزامنة رصيد الخزينة.');
              });
            }
            return updated;
          }
          return v;
        });
        persistOwnerPrivateData('lamsa_vaults_v1', next);
        return next;
      });
    }

    pushTopNotification(
      cloudSyncSucceeded ? 'sale' : 'warning',
      cloudSyncSucceeded
        ? `تم حفظ الفاتورة #${sale.id.slice(-6)} ومزامنتها مع Firestore`
        : `حُفظت الفاتورة #${sale.id.slice(-6)} محلياً فقط — المزامنة غير مؤكدة`,
      `${itemsSummary} · الإجمالي: ${sale.totalPrice.toLocaleString('ar-EG')} ${settings.currency} (${sale.paymentMethod || 'نقدي'})${loyaltySubtitle}${cloudSyncSucceeded ? '' : ' · لم يؤكد Firestore الحفظ'}`,
      cloudSyncSucceeded ? `مزامنة مؤكدة · ${sale.totalPrice} ${settings.currency}` : `محلي فقط · ${sale.totalPrice} ${settings.currency}`,
      'سجل الفواتير',
      () => setCurrentView(View.REPORTS)
    );
    return cloudSyncSucceeded;
  };

  // Add audited withdrawal transaction from any financial vault
  const handleAddWithdrawal = async (tx: WithdrawalTransaction, updatedVault: FinancialVault) => {
    setWithdrawals(prev => {
      const next = [tx, ...prev];
      persistOwnerPrivateData('lamsa_withdrawals_v1', next);
      return next;
    });
    setVaults(prev => {
      const next = prev.map(v => v.id === updatedVault.id ? updatedVault : v);
      persistOwnerPrivateData('lamsa_vaults_v1', next);
      return next;
    });

    try {
      await addWithdrawalCloud(tx);
      await saveVaultCloud(updatedVault);
    } catch (err) {
      console.error("Error saving withdrawal to Firestore:", err);
    }
  };

  const handleDeleteSale = async (
    saleId: string,
    restoreStock: boolean = true,
    reversalReason?: string,
    _mode: 'permanent' | 'reverse' = 'reverse'
  ) => {
    const targetSale = sales.find(s => s.id === saleId);
    if (!targetSale) return;
    if (targetSale.isReversed) return;

    const reasonText = reversalReason?.trim()
      || 'إلغاء فاتورة بقيد عكسي مع الاحتفاظ بالسجل الأصلي للتدقيق (§41)';
    const reversedByUser = currentUser?.displayName || 'د. محمد (المالك)';
    const reversedAtIso = new Date().toISOString();
    try {
      const result = await reverseSaleCloud(
        targetSale,
        reasonText,
        reversedByUser,
        restoreStock && !targetSale.isReversed,
        settings.commissionRate || 0.05,
      );
      if (result === 'already-reversed') return;
    } catch (err) {
      console.error('Firestore rejected the sale reversal transaction:', err);
      setCloudMessage('لم يُعتمد العكس في Firestore؛ لم يتغير السجل المحلي.');
      pushTopNotification('warning', 'لم يُعتمد العكس', 'تعذرت المعاملة الذرية؛ بقيت الفاتورة والمخزون كما هما.', 'لا يوجد نجاح سحابي');
      return;
    }

    const shouldRestoreStock = restoreStock && !targetSale.isReversed;

    if (shouldRestoreStock && targetSale.items && targetSale.items.length > 0) {
      const restoreMap = new Map<string, number>();
      const restoreByNameMap = new Map<string, number>();

      targetSale.items.forEach(it => {
        const qty = it.quantity || 1;
        if (it.isMix && it.mixComponents && it.mixComponents.length > 0) {
          it.mixComponents.forEach(comp => {
            const pidStr = String(comp.productId);
            const g = (Number(comp.grams) || 0) * qty;
            restoreMap.set(pidStr, (restoreMap.get(pidStr) || 0) + g);
            if (comp.productName) {
              const nameKey = comp.productName.trim().toLowerCase();
              restoreByNameMap.set(nameKey, (restoreByNameMap.get(nameKey) || 0) + g);
            }
          });
        } else {
          const pidStr = String(it.productId);
          const g = Number(it.essenceGrams) || 0;
          restoreMap.set(pidStr, (restoreMap.get(pidStr) || 0) + g);
          if (it.productName) {
            const cleanName = it.productName.replace(/\s*\(عبوة ملونة\)\s*$/, '').trim().toLowerCase();
            restoreByNameMap.set(cleanName, (restoreByNameMap.get(cleanName) || 0) + g);
          }
        }
      });

      const nextProducts = products.map(p => {
        const pidStr = String(p.id);
        const pNameKey = p.name.trim().toLowerCase();
        const addBack = restoreMap.has(pidStr)
          ? restoreMap.get(pidStr)!
          : restoreByNameMap.get(pNameKey) || 0;

        if (addBack > 0) {
          const updatedProd = { ...p, stock_grams: p.stock_grams + addBack };
          return updatedProd;
        }
        return p;
      });
      setProducts(nextProducts);
      persistOwnerPrivateData('lamsa_products', nextProducts);
      }

    // Reverse financial vaults impact if sale was not already reversed
    if (!targetSale.isReversed) {
      const commAmount =
        targetSale.commissionAmount ??
        targetSale.totalCommission ??
        Math.round((targetSale.totalPrice || 0) * (settings.commissionRate || 0.05));
      const updatedVaults = vaults.map(v => {
        if (v.id === 'restock') {
          return { ...v, currentBalance: Math.max(0, v.currentBalance - (targetSale.totalCost || 0)) };
        }
        if (v.id === 'commissions') {
          return { ...v, currentBalance: Math.max(0, v.currentBalance - commAmount) };
        }
        if (v.id === 'owner_profit') {
          return { ...v, currentBalance: Math.max(0, v.currentBalance - Math.max(0, targetSale.totalProfit || 0)) };
        }
        return v;
      });
      setVaults(updatedVaults);
      persistOwnerPrivateData('lamsa_vaults_v1', updatedVaults);
    }

    const reversedSale: Sale = {
      ...targetSale,
      isReversed: true,
      reversalReason: reasonText,
      reversedBy: reversedByUser,
      reversedAt: reversedAtIso,
    };

    setSales(prev => {
      const next = prev.map(s => (s.id === saleId ? reversedSale : s));
      persistOwnerPrivateData('lamsa_sales', next);
      return next;
    });

    handleAddAuditLog({
      id: `audit-rev-${Date.now()}`,
      timestamp: reversedAtIso,
      user: reversedByUser,
      action: 'قيد عكسي',
      entityType: 'sale',
      entityId: saleId,
      entityName: `فاتورة #${saleId.slice(-6)}`,
      oldValue: { totalPrice: targetSale.totalPrice, isReversed: false },
      newValue: { totalPrice: targetSale.totalPrice, isReversed: true, restoreStock },
      reason: reasonText,
      approvedBy: reversedByUser,
      category: 'مبيعات',
    });

    pushTopNotification(
      'stock',
      `تم إلغاء الفاتورة #${saleId.slice(-6)} بقيد عكسي`,
      restoreStock
        ? 'تمت استعادة جرامات الزيوت العطرية إلى المخزون والاحتفاظ بالسجل الأصلي للتدقيق'
        : 'تم تسجيل قيد عكسي للفاتورة مع الاحتفاظ بالسجل الأصلي للتدقيق (§41)',
      restoreStock ? 'قيد عكسي + استرجاع' : 'قيد عكسي'
    );

  };

  // Saved Mix handlers
  const handleSaveSavedMix = async (formula: SavedMixFormula) => {
    setSavedMixes(prev => {
      const next = [formula, ...prev.filter(m => m.id !== formula.id)];
      persistOwnerPrivateData('lamsa_saved_mixes_v1', next);
      return next;
    });
    try {
      await saveSavedMixCloud(formula);
    } catch (e) {
      console.error('Error saving mix to cloud:', e);
    }
  };

  const handleDeleteSavedMix = async (mixId: string) => {
    addDeletedTombstone('savedMixes', mixId);
    setSavedMixes(prev => {
      const next = prev.filter(m => m.id !== mixId);
      persistOwnerPrivateData('lamsa_saved_mixes_v1', next);
      return next;
    });
    try {
      await deleteSavedMixCloud(mixId);
    } catch (e) {
      console.error('Error deleting mix from cloud:', e);
    }
  };

  // Cloud-synced state updates
  const handleSetProducts: React.Dispatch<React.SetStateAction<Product[]>> = (action) => {
    setProducts(prev => {
      const next = typeof action === 'function' ? action(prev) : action;
      persistOwnerPrivateData('lamsa_products', next);

      // 1. Delete removed products from cloud
      prev.forEach(oldP => {
        if (!next.some(nP => String(nP.id) === String(oldP.id))) {
          addDeletedTombstone('products', oldP.id);
          deleteProductCloud(oldP.id).catch(console.error);
        }
      });

      // 2. Identify only changed or new products and save them with timestamp
      const changedProducts = next.filter(nP => {
        const oldP = prev.find(p => String(p.id) === String(nP.id));
        return !oldP || JSON.stringify(oldP) !== JSON.stringify(nP);
      });
      const stockDeltas = new Map<string, number>();
      changedProducts.forEach((product) => {
        const oldProduct = prev.find((previous) => String(previous.id) === String(product.id));
        if (!oldProduct) return;
        const delta = Number(product.stock_grams) - Number(oldProduct.stock_grams);
        if (Number.isFinite(delta) && delta !== 0) stockDeltas.set(String(product.id), delta);
      });

      if (changedProducts.length > 0 && changedProducts.length <= 15) {
        changedProducts.forEach(p => {
          saveProductCloud({
            ...p,
            updatedAt: new Date().toISOString(),
          }, stockDeltas.get(String(p.id)) ?? 0).catch(console.error);
        });
      } else if (changedProducts.length > 15) {
        seedProductsCloud(next, stockDeltas).catch(err => console.error(err));
      }

      return next;
    });
  };

  const handleSetExpenses: React.Dispatch<React.SetStateAction<Expense[]>> = (action) => {
    setExpenses(prev => {
      const next = typeof action === 'function' ? action(prev) : action;
      persistOwnerPrivateData('lamsa_expenses_v2', next);

      // 1. Delete removed expenses
      prev.forEach(oldExp => {
        if (!next.some(n => n.id === oldExp.id)) {
          addDeletedTombstone('expenses', oldExp.id);
          deleteExpenseCloud(oldExp.id).catch(err => console.error(err));
        }
      });

      // 2. Save only new or modified expenses
      const changedExpenses = next.filter(nE => {
        const oldE = prev.find(e => e.id === nE.id);
        return !oldE || JSON.stringify(oldE) !== JSON.stringify(nE);
      });

      changedExpenses.forEach(e => {
        saveExpenseCloud({
          ...e,
          updatedAt: new Date().toISOString(),
        }).catch(err => console.error(err));
      });

      return next;
    });
  };

  const handleSetSettings: React.Dispatch<React.SetStateAction<StoreSettings>> = (action) => {
    setSettings(prev => {
      const next = typeof action === 'function' ? action(prev) : action;
      persistOwnerPrivateData('lamsa_settings_v2', next);
      saveSettingsCloud(next).catch(err => console.error(err));
      return next;
    });
  };

  const handleSetBottleSizes: React.Dispatch<React.SetStateAction<BottleSize[]>> = (action) => {
    setBottleSizes(prev => {
      const next = typeof action === 'function' ? action(prev) : action;
      persistOwnerPrivateData('lamsa_bottle_sizes_v2', next);
      saveBottleSizesCloud(next).catch(err => console.error(err));
      return next;
    });
  };

  // Today's total gross profit for POS real-time badge (Live Production Sales only)
  const todayStr = new Date().toISOString().slice(0, 10);
  const currentClosure = dailyClosures.find(c => c.date === todayStr) || null;
  const dashboardTodayStr = getBrowserLocalDateKey();
  const dashboardCurrentClosure = dashboardServerData.closures.find((closure) =>
    closure.date.startsWith(dashboardTodayStr)
    && closure.dataClassification === 'PRODUCTION'
    && !closure.isTestData
  ) || null;
  const dashboardProducts = dashboardServerData.products.filter((product) => !isInitialCatalogTemplate(product));
  const excludedCatalogTemplateCount = dashboardServerData.products.length - dashboardProducts.length;
  const dashboardSourceHealthForDisplay: DashboardDataSourceHealthMap = queuedSaleCount > 0
    ? { ...dashboardFeedHealth, sales: { ...dashboardFeedHealth.sales, state: 'pending' } }
    : dashboardFeedHealth;
  const dashboardDataQualityNotes = [
    ...(excludedCatalogTemplateCount > 0
      ? [`استُبعد ${excludedCatalogTemplateCount} سجلًا يطابق بيانات كتالوج البداية ذات 1000 جم؛ لم يُحسب كمخزون مؤكد.`]
      : []),
    ...(dashboardServerData.products.length === 0 && dashboardFeedHealth.products.state === 'live'
      ? ['لقطة الخادم للمنتجات فارغة؛ لا يوجد رصيد مخزون مؤكد للعرض.']
      : []),
    ...(dashboardCurrentClosure?.actualCashInDrawer === undefined
      ? ['لم يُسجل جرد نقدي فعلي مؤكد لدرج اليوم؛ سيبقى هذا المؤشر غير متاح.']
      : []),
  ];
  const todaysGrossProfit = sales
    .filter(s => s.date.startsWith(todayStr) && isLiveProductionSale(s))
    .reduce((sum, s) => sum + s.totalProfit, 0);

  const dailyCoveredExpense = settings.dailyExpenseCoverageGoal || 600;

  const renderView = () => {
    // Strictly isolate confidential areas from unauthorized employees (Rules 1, 2, 3, 6, 9)
    if (!canAccessView(effectiveUser, currentView)) {
      logRejectedAccessAttempt(effectiveUser, currentView, undefined, 'محاولة وصول مباشر لصفحة غير مصرح بها');
      const targetFallback = canAccessView(effectiveUser, View.TAREK_WORKSPACE) ? View.TAREK_WORKSPACE : View.POS;

      return (
        <div className="p-6 sm:p-12 max-w-xl mx-auto my-12 text-center animate-in fade-in duration-200" dir="rtl">
          <div className="apple-glass-card rounded-3xl p-8 border border-amber-500/30 shadow-apple-lg space-y-4 bg-amber-50/10 backdrop-blur-xl">
            <div className="w-16 h-16 rounded-2xl bg-amber-500/10 text-amber-600 flex items-center justify-center mx-auto shadow-inner">
              <Lock size={32} />
            </div>
            <h2 className="text-xl font-black text-[#1D1D1F]">جاري التوجيه إلى واجهتك المخصصة</h2>
            <p className="text-xs text-[#86868B] leading-relaxed">
              هذه الشاشة مخصصة لحساب المالك (د. محمد). تم توجيهك تلقائياً إلى مساحتك المخصصة.
            </p>
            <div className="p-3 rounded-2xl bg-slate-100 dark:bg-white/5 text-slate-700 dark:text-slate-300 text-[11px] font-mono border border-slate-200 dark:border-white/10">
              المستخدم الحالي: <strong>{effectiveUser?.displayName || effectiveUser?.fullName || 'مشغل'} ({effectiveUser?.role === 'STORE_MANAGER' ? 'مشغل مساحة التشغيل · قراءة فقط' : effectiveUser?.role})</strong>
            </div>
            <div className="pt-2 flex items-center justify-center gap-2">
              <button
                type="button"
                onClick={() => setCurrentView(targetFallback)}
                className="apple-btn px-6 py-2.5 rounded-xl bg-amber-600 hover:bg-amber-700 text-white text-xs font-bold shadow-md cursor-pointer transition-all"
              >
                الانتقال لمساحة التشغيل المخصصة
              </button>
            </div>
          </div>
        </div>
      );
    }

    switch (currentView) {
      case View.DASHBOARD:
        return (
          <Dashboard 
            sales={dashboardServerData.sales}
            products={dashboardProducts}
            expenses={dashboardServerData.expenses}
            settings={settings}
            confirmedSettings={dashboardServerData.settings}
            dataSourceHealth={dashboardSourceHealthForDisplay}
            dataQualityNotes={dashboardDataQualityNotes}
            hasPendingLocalSales={queuedSaleCount > 0}
            vaults={dashboardServerData.vaults}
            withdrawals={dashboardServerData.withdrawals}
            currentClosure={dashboardCurrentClosure}
            currentUser={currentUser}
            customCustomers={dashboardServerData.customers}
            connectedDevices={connectedDevices}
            deviceFeedStatus={deviceFeedStatus}
            deviceFeedLastServerUpdate={deviceFeedLastServerUpdate}
            isCloudConnected={isCloudConnected}
            onOpenConnectedDevices={() => setIsConnectedDevicesModalOpen(true)}
            onNavigate={setCurrentView} 
            onOpenDayOperations={() => setIsDayOpsModalOpen(true)}
            onOpenLoyaltySettings={() => {
              setCurrentView(View.OPERATIONS_SYSTEM);
            }}
            onUpdateSettings={handleSetSettings}
          />
        );
      case View.INVENTORY:
        return (
          <Inventory
            products={products}
            setProducts={handleSetProducts}
            sales={sales}
            settings={settings}
            currentUser={currentUser}
            fragranceDatabase={fragranceDatabase}
            onBulkUpsertFragranceProfiles={handleBulkUpsertFragranceProfiles}
            onAddAuditLog={handleAddAuditLog}
            onSendSmartNotification={(title, subtitle, badge, type) =>
              pushTopNotification(
                type || 'stock',
                title,
                subtitle,
                badge,
                'عرض المخزون',
                () => setCurrentView(View.INVENTORY)
              )
            }
          />
        );
      case View.POS:
        return (
          <POS 
            products={products} 
            onCompleteSale={handleSaleComplete}
            settings={settings}
            bottleSizes={bottleSizes}
            dailyCoveredExpense={dailyCoveredExpense}
            todaysGrossProfit={todaysGrossProfit}
            onUpdateSettings={handleSetSettings}
            salesHistory={sales}
            attendanceRecords={attendanceRecords}
            onCheckInAttendance={handleCheckInAttendance}
            onAddAuditLog={handleAddAuditLog}
            currentUser={currentUser}
            currentClosure={dailyClosures.find(c => c.date === new Date().toISOString().slice(0, 10)) || null}
            onOpenDayOperations={() => setIsDayOpsModalOpen(true)}
            fragranceDatabase={fragranceDatabase}
            strategicOrders={strategicOrders}
            onSaveStrategicOrder={handleSaveStrategicOrder}
            onSaveClosure={handleSaveClosure}
            onSavePurchaseRequest={handleSavePurchaseRequest}
            onNavigateToInvoices={() => setCurrentView(View.REPORTS)}
            onNavigateToCustomers={() => setCurrentView(View.CUSTOMERS_LOYALTY)}
            customCustomers={customCustomers}
            preselectedCustomer={preselectedPosCustomer}
            onClearPreselectedCustomer={() => setPreselectedPosCustomer(null)}
            savedMixes={savedMixes}
            onSaveMix={handleSaveSavedMix}
            onDeleteMix={handleDeleteSavedMix}
            onDeleteSale={handleDeleteSale}
            expenses={expenses}
            onAddExpense={(newExp) => {
              handleSetExpenses(prev => [newExp, ...prev]);
              pushTopNotification(
                'info',
                `تم تسجيل مصروف سريع: ${newExp.title}`,
                `المبلغ: ${newExp.amount.toLocaleString('ar-EG')} ${settings.currency} · التصنيف: ${newExp.category}`,
                'مصروف فوري'
              );
            }}
            onOpenFormulationEngine={(product) => {
              setFormulationProduct(product || null);
              setCurrentView(View.FORMULATION_ENGINE);
            }}
            onNavigate={(v) => setCurrentView(v)}
          />
        );
      case View.CUSTOMERS_LOYALTY:
        return (
          <CustomersCRM
            sales={sales}
            products={products}
            settings={settings}
            currentUser={currentUser}
            customCustomers={customCustomers}
            bottleSizes={bottleSizes}
            customerRequests={customerRequests}
            fragranceDatabase={fragranceDatabase}
            todaysGrossProfit={todaysGrossProfit}
            onSaveCustomCustomer={handleSaveCustomCustomer}
            onDeleteCustomCustomer={handleDeleteCustomCustomer}
            onSaveCustomerRequest={handleSaveCustomerRequest}
            onSelectCustomerForPOS={(cust) => {
              setPreselectedPosCustomer(cust);
              setCurrentView(View.POS);
              pushTopNotification(
                'info',
                `تم اختيار العميل: ${cust.name}`,
                'تم تجهيز بيانات العميل في شاشة الكاشير للبيع المباشر',
                'بيع مباشر'
              );
            }}
            onSendSmartNotification={(title, subtitle, badgeText) =>
              pushTopNotification('info', title, subtitle, badgeText)
            }
            onOpenLoyaltySettings={() => setCurrentView(View.OPERATIONS_SYSTEM)}
            onOpenFormulationEngine={(product) => {
              setFormulationProduct(product || null);
              setCurrentView(View.FORMULATION_ENGINE);
            }}
          />
        );
      case View.INVENTORY_INTELLIGENCE:
        return (
          <InventoryIntelligence
            products={products}
            setProducts={handleSetProducts}
            sales={sales}
            purchaseRequests={purchaseRequests}
            onSavePurchaseRequest={handleSavePurchaseRequest}
            customerRequests={customerRequests}
            onSaveCustomerRequest={handleSaveCustomerRequest}
            stockChecks={stockChecks}
            onSaveStockCheck={handleSaveStockCheck}
            currentUser={currentUser}
            settings={settings}
            onAddAuditLog={handleAddAuditLog}
            strategicOrders={strategicOrders}
            onSaveStrategicOrder={handleSaveStrategicOrder}
          />
        );
      case View.USERS_MANAGEMENT:
        return (
          <UsersManagement
            users={users}
            currentUser={effectiveUser}
            onSaveUser={handleSaveUser}
            onAddAuditLog={handleAddAuditLog}
          />
        );
      case View.AUDIT_LOGS:
        return (
          <AuditLogViewer
            logs={auditLogs}
            sales={sales}
            products={products}
            bottleSizes={bottleSizes}
            settings={settings}
            currentUser={effectiveUser}
            onDeleteSale={handleDeleteSale}
            onAddAuditLog={handleAddAuditLog}
            hasMoreLogs={hasMoreAuditLogs}
            isLoadingMoreLogs={isLoadingAuditLogs}
            isLoadingAllLogs={isLoadingAllAuditLogs}
            onLoadMoreLogs={() => void loadMoreAuditLogs()}
            onLoadAllLogs={() => void loadAllAuditLogs()}
          />
        );
      case View.FORMULATION_ENGINE:
        return (
          <ProductFormulationEngine
            products={products}
            setProducts={handleSetProducts}
            bottleSizes={bottleSizes}
            setBottleSizes={handleSetBottleSizes}
            settings={settings}
            sales={sales}
            expenses={expenses}
            batches={batches}
            onSaveBatch={handleSaveBatch}
            auditLogs={auditLogs}
            onAddAuditLog={handleAddAuditLog}
            onLoadMoreAuditLogs={() => void loadMoreAuditLogs()}
            hasMoreAuditLogs={hasMoreAuditLogs}
            isLoadingAuditLogs={isLoadingAuditLogs}
            initialProduct={formulationProduct}
            onNavigateToPOS={(prod, sizeMl, grams) => {
              setCurrentView(View.POS);
            }}
          />
        );
      case View.FINANCIAL_VAULTS:
        return (
          <FinancialVaults
            vaults={vaults}
            withdrawals={withdrawals}
            sales={sales}
            expenses={expenses}
            settings={settings}
            onAddWithdrawal={handleAddWithdrawal}
            onUpdateVaults={(updatedList) => {
              setVaults(updatedList);
              saveAllVaultsCloud(updatedList).catch(console.error);
            }}
          />
        );
      case View.STAFF_ENTITLEMENTS:
        return (
          <StaffEntitlements
            sales={sales}
            vaults={vaults}
            currentUser={currentUser}
            users={users}
            settings={settings}
            onUpdateVaults={(updatedList) => {
              setVaults(updatedList);
              saveAllVaultsCloud(updatedList).catch(console.error);
            }}
            onAddExpense={(newExp) => handleSetExpenses(prev => [newExp, ...prev])}
          />
        );
      case View.EXPENSES:
        return (
          <Expenses
            expenses={expenses}
            setExpenses={handleSetExpenses}
            settings={settings}
            sales={sales}
          />
        );
      case View.REPORTS:
        return (
          <Reports 
            sales={sales} 
            products={products} 
            bottleSizes={bottleSizes}
            onDeleteSale={handleDeleteSale} 
            onDuplicateSale={handleSaleComplete}
            onNavigateToPOS={() => setCurrentView(View.POS)}
            settings={settings}
            onUpdateSettings={handleSetSettings}
            currentUser={currentUser}
            users={users}
          />
        );
      case View.ANALYZER:
        return (
          <FragranceAnalyzer
            products={products}
            setProducts={handleSetProducts}
            sales={sales}
            settings={settings}
            onNavigateToPOS={(product) => setCurrentView(View.POS)}
            currentUser={currentUser}
            fragranceDatabase={fragranceDatabase}
            onSaveFragranceProfile={handleSaveFragranceProfile}
          />
        );
      case View.SETTINGS:
        return (
          <Settings
            settings={settings}
            setSettings={handleSetSettings}
            bottleSizes={bottleSizes}
            setBottleSizes={handleSetBottleSizes}
            vaults={vaults}
            withdrawals={withdrawals}
            sales={sales}
            expenses={expenses}
            products={products}
            currentUser={effectiveUser}
            users={users}
            auditLogs={auditLogs}
            onSaveAppUser={handleSaveUser}
            attendanceRecords={attendanceRecords}
            onCheckInAttendance={handleCheckInAttendance}
            onAddWithdrawal={handleAddWithdrawal}
            onNavigate={setCurrentView}
            customCustomers={customCustomers}
            onAddAuditLog={handleAddAuditLog}
            initialSection={settingsInitialSection}
          />
        );
      case View.STORE_MANAGER:
        return (
          <MasterStoreManager
            products={products}
            setProducts={handleSetProducts}
            sales={sales}
            setSales={setSales}
            expenses={expenses}
            setExpenses={handleSetExpenses}
            settings={settings}
            setSettings={handleSetSettings}
            bottleSizes={bottleSizes}
            setBottleSizes={handleSetBottleSizes}
          />
        );
      case View.OPERATIONS_SYSTEM:
        return (
          <OperationsSystem
            settings={settings}
            bottleSizes={bottleSizes}
            sales={sales}
            expenses={expenses}
            attendanceRecords={attendanceRecords}
            onUpdateTarget={(newTarget) => {
              handleSetSettings(prev => ({ ...prev, dailyTargetProfit: newTarget }));
            }}
          />
        );
      case View.MARKETING:
        return <AIMarketing products={products} />;
      default:
        return (
          <Dashboard 
            sales={dashboardServerData.sales}
            products={dashboardProducts}
            expenses={dashboardServerData.expenses}
            settings={settings}
            confirmedSettings={dashboardServerData.settings}
            dataSourceHealth={dashboardSourceHealthForDisplay}
            dataQualityNotes={dashboardDataQualityNotes}
            hasPendingLocalSales={queuedSaleCount > 0}
            vaults={dashboardServerData.vaults}
            withdrawals={dashboardServerData.withdrawals}
            currentClosure={dashboardCurrentClosure}
            currentUser={currentUser}
            customCustomers={dashboardServerData.customers}
            connectedDevices={connectedDevices}
            deviceFeedStatus={deviceFeedStatus}
            deviceFeedLastServerUpdate={deviceFeedLastServerUpdate}
            isCloudConnected={isCloudConnected}
            onOpenConnectedDevices={() => setIsConnectedDevicesModalOpen(true)}
            onNavigate={setCurrentView} 
            onOpenDayOperations={() => setIsDayOpsModalOpen(true)}
            onOpenLoyaltySettings={() => {
              setCurrentView(View.OPERATIONS_SYSTEM);
            }}
            onUpdateSettings={handleSetSettings}
          />
        );
    }
  };

  if (authStatus !== 'ready' || isScreenLocked || !currentUser) {
    return (
      <>
        <InteractiveTypingController settings={settings} />
        <AppleWelcomeLockScreen
          authStatus={authStatus}
          authEmail={authEmail}
          authError={authError}
          isSigningIn={isSigningIn}
          isCloudConnected={isCloudConnected}
          cloudMessage={cloudMessage}
          accessRequestStatus={accessRequestStatus}
          isSubmittingAccessRequest={isSubmittingAccessRequest}
          isCheckingAccessRequest={isCheckingAccessRequest}
          onGoogleSignIn={handleGoogleSignIn}
          onRequestAccess={() => void handleRequestOperationalAccess()}
          onCheckAccess={() => void handleCheckOperationalAccess()}
          onLogout={() => void handleLogout()}
          onUnlock={handleLocalUnlock}
          storeName={settings.storeName || 'لَمْسَةُ عِطْر'}
          storeSlogan={settings.storeSlogan || 'فخامة العطور الشرقية والفرنسية'}
        />
      </>
    );
  }

  // Do not render the owner shell, POS, dashboards, financial state, or their local cached props for Tarek.
  if (currentUser.role === 'STORE_MANAGER') {
    return <TarekReadOnlyWorkspace onLogout={() => { void handleLogout(); }} />;
  }

  return (
    <div className="apple-theme-shell min-h-screen max-w-full overflow-x-hidden bg-[#F5F5F7] text-[#1D1D1F] font-sans antialiased">
      {/* Interactive Typing Shake, Color Sparkle & Acoustic Controller */}
      <InteractiveTypingController settings={settings} />

      {/* Apple Dynamic Island Top Notification Banner (Strictly at the Top) */}
      <AppleTopNotificationBanner
        notifications={topNotifications}
        onDismiss={dismissTopNotification}
      />

      {/* Responsive Navigation: Top Bar on Mobile + Floating Glass Sidebar on Desktop */}
      <Sidebar
        currentView={currentView}
        setCurrentView={setCurrentView}
        products={products}
        settings={settings}
        isCloudConnected={isCloudConnected}
        currentUser={effectiveUser}
        onOpenAuthModal={() => setIsAuthModalOpen(true)}
        onLogout={handleLogout}
        onOpenDayOperations={() => setIsDayOpsModalOpen(true)}
        onLockScreen={handleLockScreen}
        onOpenThemeStudio={() => setIsThemeStudioModalOpen(true)}
        onOpenLiveAlertsRadar={() => setIsOwnerLiveRadarOpen(true)}
        onOpenPWAInstall={() => setIsPWAInstallModalOpen(true)}
        onToggleDarkMode={() => {
          const currentResolved = resolveActiveAppTheme(settings);
          const nextThemeId = currentResolved.isDark ? 'apple_sonoma_light' : 'sequoia_midnight_dark';
          handleSetSettings((prev) => ({
            ...prev,
            activeThemeId: nextThemeId,
            themeAutoTimeOfDay: false,
          }));
        }}
      />

      {/* Main Content Area: Responsive padding with max-width containment (md:pr-72 for desktop sidebar, pb-20 for mobile bottom dock) */}
      <main className="min-h-screen w-full max-w-full overflow-x-hidden relative z-0 md:pr-72 pt-2 sm:pt-3 md:pt-4 pb-20 md:pb-6 transition-all duration-200">
        {/* Unified Sleek Top Header Bar & Smart Color-Coded Notification Ticker */}
        <ExecutiveHeaderBar
          currentUser={effectiveUser}
          onOpenAuthModal={() => setIsAuthModalOpen(true)}
          onOpenDayOperations={() => setIsDayOpsModalOpen(true)}
          onLockScreen={handleLockScreen}
          sales={dashboardServerData.sales}
          expenses={dashboardServerData.expenses}
          settings={settings}
          confirmedSettings={dashboardServerData.settings}
          dataSourceHealth={dashboardSourceHealthForDisplay}
          hasPendingLocalSales={queuedSaleCount > 0}
          products={dashboardProducts}
          currentClosure={dashboardCurrentClosure}
          topNotifications={topNotifications}
          currentView={currentView}
          onNavigate={setCurrentView}
          onSendSmartNotification={(title, subtitle, badgeText) =>
            pushTopNotification('info', title, subtitle, badgeText)
          }
          onOpenDailyReportAutomation={() => setIsDailyReportAutomationModalOpen(true)}
          onOpenThemeStudio={() => setIsThemeStudioModalOpen(true)}
          onOpenLiveAlertsRadar={() => setIsOwnerLiveRadarOpen(true)}
          onOpenPWAInstall={() => setIsPWAInstallModalOpen(true)}
          connectedDevicesCount={deviceFeedStatus === 'live' ? connectedDevices.length : null}
          onOpenConnectedDevices={() => setIsConnectedDevicesModalOpen(true)}
          onUpdateSettings={handleSetSettings}
        />

        {currentUser.role === 'OWNER' && <OwnerCommissionCounterBootstrap />}

        {currentUser.role === 'OWNER' && currentView === View.SETTINGS && (
          <section className="mx-4 sm:mx-6 mt-3 rounded-2xl border border-emerald-700/20 bg-emerald-50 p-4 text-emerald-950">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <h2 className="text-sm font-black">تهيئة مساحة طارق للقراءة الآمنة</h2>
                <p className="mt-1 max-w-3xl text-xs leading-5">
                  يقرأ المنتجات والإعدادات من Firestore مباشرة وينشئ إسقاطات مخزون وتكاليف بلا أسعار بيع أو أرباح. لا يغيّر السجلات القديمة، ولا يفتح البيع أو POS.
                </p>
              </div>
              <button
                type="button"
                disabled={isPreparingTarekCatalog}
                onClick={() => void handlePrepareTarekCatalog()}
                className="rounded-xl bg-emerald-800 px-4 py-2 text-xs font-black text-white disabled:opacity-50"
              >
                {isPreparingTarekCatalog ? 'جارٍ التجهيز…' : 'تهيئة الإسقاطات الآمنة'}
              </button>
            </div>
            {tarekCatalogPrepStatus && <p role="status" className="mt-3 text-xs font-semibold">{tarekCatalogPrepStatus}</p>}
          </section>
        )}

        {(queuedSaleCount > 0 || saleQueueNotice) && (
          <div
            role="status"
            aria-live="polite"
            className={`mx-4 sm:mx-6 mt-3 rounded-2xl border px-4 py-3 text-xs font-bold ${queuedSaleCount > 0 ? 'border-amber-500/35 bg-amber-50 text-amber-950' : 'border-emerald-500/30 bg-emerald-50 text-emerald-950'}`}
          >
            <div className="flex flex-wrap items-center justify-between gap-3">
              <span>
                {queuedSaleCount > 0 && <strong>{queuedSaleCount} فاتورة بانتظار المزامنة — </strong>}
                {saleQueueNotice}
              </span>
              {queuedSaleCount > 0 && (
                <button
                  type="button"
                  onClick={() => { void saleQueueRetryRef.current?.(); }}
                  disabled={saleQueueSyncing || !navigator.onLine}
                  className="rounded-xl bg-amber-800 px-3 py-2 text-[11px] font-black text-white disabled:opacity-50"
                >
                  {saleQueueSyncing ? 'جارٍ التحقق…' : 'إعادة المحاولة الآن'}
                </button>
              )}
            </div>
            {queuedSaleCount > 0 && <span className="mt-1 block font-medium">لا تُحذف الفاتورة من الطابور إلا بعد نجاح تأكيد Firestore.</span>}
          </div>
        )}

        {!isCloudConnected && (
          <div role="status" aria-live="polite" className="mx-4 sm:mx-6 mt-3 rounded-2xl border border-amber-500/35 bg-amber-50 px-4 py-3 text-xs font-bold text-amber-950">
            <span>{cloudMessage}</span>
            <span className="block mt-1 font-medium text-amber-900/80">لا تعرض الحالة المحلية على أنها مزامنة مؤكدة، ولا تعتمد على هذه النسخة كنسخة سحابية عند رفض Firestore.</span>
          </div>
        )}

        {/* Real-time Administrative Directives & Staff Alert Banner (تنبيهات وإشعارات الإدارة العامة للموظفين) */}
        {activeBroadcastForDisplay && (
          <div className="w-full max-w-7xl mx-auto px-4 sm:px-6 pt-3 animate-in fade-in slide-in-from-top-3 duration-500">
            <div className={`p-4 sm:p-4.5 rounded-3xl border shadow-xl flex flex-col md:flex-row items-start md:items-center justify-between gap-4 backdrop-blur-2xl transition-all ${
              activeBroadcastForDisplay.category === 'urgent'
                ? 'bg-rose-500/12 dark:bg-rose-950/40 border-rose-500/40 text-rose-950 dark:text-rose-100 shadow-[0_8px_30px_rgba(244,63,94,0.12)]'
                : activeBroadcastForDisplay.category === 'target'
                ? 'bg-amber-500/12 dark:bg-amber-950/40 border-amber-500/45 text-amber-950 dark:text-amber-100 shadow-[0_8px_30px_rgba(245,158,11,0.12)]'
                : activeBroadcastForDisplay.category === 'reward'
                ? 'bg-purple-500/12 dark:bg-purple-950/40 border-purple-500/40 text-purple-950 dark:text-purple-100 shadow-[0_8px_30px_rgba(168,85,247,0.12)]'
                : 'bg-blue-500/12 dark:bg-blue-950/40 border-blue-500/40 text-blue-950 dark:text-blue-100 shadow-[0_8px_30px_rgba(59,130,246,0.12)]'
            }`}>
              <div className="flex items-start gap-3.5 min-w-0">
                <div className={`w-11 h-11 rounded-2xl flex items-center justify-center shrink-0 shadow-md ${
                  activeBroadcastForDisplay.category === 'urgent'
                    ? 'bg-rose-600 text-white animate-pulse shadow-rose-600/30'
                    : activeBroadcastForDisplay.category === 'target'
                    ? 'bg-amber-500 text-slate-950 shadow-amber-500/30'
                    : activeBroadcastForDisplay.category === 'reward'
                    ? 'bg-purple-600 text-white shadow-purple-600/30'
                    : 'bg-blue-600 text-white shadow-blue-600/30'
                }`}>
                  <Radio size={20} className="animate-spin" />
                </div>
                <div className="min-w-0 space-y-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    {activeBroadcastForDisplay.isImportant ? (
                      <span className="text-[11px] font-black px-2.5 py-0.5 rounded-full bg-amber-500 text-slate-950 flex items-center gap-1.5 shadow-2xs">
                        <Star size={11} className="fill-current" />
                        <span>تنبيه فائق الأهمية</span>
                      </span>
                    ) : (
                      <span className="text-[11px] font-black px-2.5 py-0.5 rounded-full bg-black/10 dark:bg-white/10 flex items-center gap-1.5">
                        <Sparkles size={11} className="text-[#C49746]" />
                        <span>إشعار مباشر</span>
                      </span>
                    )}

                    <span className={`text-[10px] font-bold px-2.5 py-0.5 rounded-full border ${
                      activeBroadcastForDisplay.category === 'urgent'
                        ? 'bg-rose-500/20 text-rose-700 dark:text-rose-300 border-rose-500/40'
                        : activeBroadcastForDisplay.category === 'target'
                        ? 'bg-amber-500/20 text-amber-800 dark:text-amber-300 border-amber-500/40'
                        : activeBroadcastForDisplay.category === 'reward'
                        ? 'bg-purple-500/20 text-purple-700 dark:text-purple-300 border-purple-500/40'
                        : 'bg-blue-500/20 text-blue-700 dark:text-blue-300 border-blue-500/40'
                    }`}>
                      {activeBroadcastForDisplay.category === 'urgent' ? '🚨 عاجل وهام' : activeBroadcastForDisplay.category === 'target' ? '🎯 تارجت ومبيعات' : activeBroadcastForDisplay.category === 'reward' ? '🎁 مكافأة وتقدير' : '📋 تعليمات'}
                    </span>

                    {/* Recurrence Indicator Pill (تكرار التنبيه) */}
                    {activeBroadcastForDisplay.repeatMode && activeBroadcastForDisplay.repeatMode !== 'none' && (
                      <span className="text-[10px] font-bold px-2.5 py-0.5 rounded-full bg-blue-500/20 text-blue-900 dark:text-blue-200 border border-blue-400/40 flex items-center gap-1 font-mono">
                        <Repeat size={10} className="text-blue-600 dark:text-blue-300" />
                        <span>
                          {activeBroadcastForDisplay.repeatMode === 'daily'
                            ? `🔄 يتكرر يومياً${activeBroadcastForDisplay.repeatTime ? ` (${activeBroadcastForDisplay.repeatTime})` : ''}`
                            : `🔄 يتكرر كل ${activeBroadcastForDisplay.repeatDayOfWeek !== undefined ? ['أحد','إثنين','ثلاثاء','أربعاء','خميس','جمعة','سبت'][activeBroadcastForDisplay.repeatDayOfWeek] : 'أسبوع'}${activeBroadcastForDisplay.repeatTime ? ` (${activeBroadcastForDisplay.repeatTime})` : ''}`
                          }
                        </span>
                      </span>
                    )}

                    {/* Expiration Countdown Badge (Default 8 Hours) */}
                    {(() => {
                      if (activeBroadcastForDisplay.isImportant && (!activeBroadcastForDisplay.expiresAt || activeBroadcastForDisplay.durationHours === 0)) {
                        return (
                          <span className="text-[10px] font-black px-2.5 py-0.5 rounded-full bg-amber-500 text-slate-950 flex items-center gap-1 shadow-2xs">
                            <Star size={10} className="fill-current" />
                            <span>هام ومثبت دائم</span>
                          </span>
                        );
                      }
                      const expiry = activeBroadcastForDisplay.expiresAt 
                        ? new Date(activeBroadcastForDisplay.expiresAt).getTime() 
                        : (activeBroadcastForDisplay.createdAt ? new Date(activeBroadcastForDisplay.createdAt).getTime() + (activeBroadcastForDisplay.durationHours || 8) * 3600 * 1000 : null);
                      
                      if (!expiry) return null;
                      const remainingMs = expiry - Date.now();
                      if (remainingMs <= 0) return null;

                      const totalMinutes = Math.floor(remainingMs / (60 * 1000));
                      const hours = Math.floor(totalMinutes / 60);
                      const minutes = totalMinutes % 60;
                      const days = Math.floor(hours / 24);

                      let countdownStr = `${minutes} دقيقة`;
                      if (days > 0) countdownStr = `${days} يوم و ${hours % 24} س`;
                      else if (hours > 0) countdownStr = `${hours} س و ${minutes} د`;

                      return (
                        <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-black/10 dark:bg-white/10 text-slate-700 dark:text-slate-300 flex items-center gap-1 font-mono">
                          <Hourglass size={10} className="text-amber-500" />
                          <span>ينتهي تلقائياً خلال: {countdownStr}</span>
                        </span>
                      );
                    })()}

                    <span className="text-[10px] text-slate-500 dark:text-slate-400 font-mono">
                      {activeBroadcastForDisplay.createdAt ? new Date(activeBroadcastForDisplay.createdAt).toLocaleTimeString('ar-EG', { hour: '2-digit', minute: '2-digit' }) : 'الآن'}
                    </span>
                  </div>

                  <h4 className="text-sm font-black truncate">{activeBroadcastForDisplay.title}</h4>
                  <p className="text-xs opacity-90 leading-relaxed font-medium">{activeBroadcastForDisplay.message}</p>
                </div>
              </div>

              <div className="flex items-center gap-2 shrink-0 self-end md:self-center">
                {/* 1. Open Radar/Today's Notifications */}
                {(effectiveUser?.role === 'OWNER' || Boolean(effectiveUser?.permissions?.canViewDeviceAlerts)) ? (
                  <button
                    type="button"
                    onClick={() => setIsOwnerLiveRadarOpen(true)}
                    className="px-3 py-1.5 rounded-xl bg-white/70 hover:bg-white dark:bg-white/10 dark:hover:bg-white/20 text-slate-700 dark:text-slate-200 text-xs font-bold border border-slate-200/60 dark:border-white/10 transition-colors cursor-pointer flex items-center gap-1"
                    title="عرض في قسم الإشعارات اليومية والتنبيهات الهامة"
                  >
                    <ExternalLink size={12} />
                    <span>رادار الإدارة</span>
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={() => setCurrentView(View.TAREK_WORKSPACE)}
                    className="px-3 py-1.5 rounded-xl bg-amber-500/20 hover:bg-amber-500/30 text-amber-900 dark:text-amber-200 text-xs font-bold border border-amber-500/30 transition-colors cursor-pointer flex items-center gap-1"
                    title="الانتقال إلى واجهة طارق ومتابعة العمولات والتارجت"
                  >
                    <ExternalLink size={12} />
                    <span>واجهتي والتارجت</span>
                  </button>
                )}

                {/* 2. Acknowledge Receipt Button */}
                {activeBroadcastForDisplay.requiresAcknowledgement && (
                  !activeBroadcastForDisplay.acknowledgedBy?.some(a => a.employeeName === (currentUser?.name || 'طارق')) ? (
                    <button
                      type="button"
                      onClick={() => handleAcknowledgeOwnerBroadcast(activeBroadcastForDisplay.id)}
                      className="px-4 py-2 rounded-xl bg-[#1D1D1F] hover:bg-black text-amber-300 font-black text-xs flex items-center gap-1.5 shadow-md cursor-pointer transition-transform active:scale-95 border border-[#C49746]/40"
                    >
                      <CheckCircle2 size={14} className="text-amber-400" />
                      <span>تأكيد الاطلاع والاستلام ✓</span>
                    </button>
                  ) : (
                    <span className="text-[11px] font-bold text-emerald-700 dark:text-emerald-300 bg-emerald-500/15 px-3 py-1.5 rounded-xl border border-emerald-500/30 flex items-center gap-1">
                      <CheckCircle2 size={13} />
                      <span>تم تأكيد الاطلاع</span>
                    </span>
                  )
                )}

                {/* 3. Close Button: Dismisses persistently so it does NOT reappear on refresh */}
                <button
                  type="button"
                  onClick={() => handleDismissBroadcast(activeBroadcastForDisplay.id)}
                  className="p-2 rounded-xl text-slate-500 hover:text-slate-800 dark:hover:text-white hover:bg-black/10 dark:hover:bg-white/10 transition-colors cursor-pointer"
                  title="إغلاق التنبيه (يظل محفوظاً في قسم إشعارات اليوم)"
                >
                  <X size={16} />
                </button>
              </div>
            </div>
          </div>
        )}

        <div className="flex-1" data-active-section="true" data-current-view={currentView}>
          {renderView()}
        </div>

        {/* Sleek Apple Signature Footer & Smart Quick Spotlight (Mohamed Mhran2027©) */}
        <AppleSignatureFooter
          currentView={currentView}
          onNavigate={setCurrentView}
          onLockScreen={handleLockScreen}
          onOpenDayOperations={() => setIsDayOpsModalOpen(true)}
          products={products}
          customCustomers={customCustomers}
          sales={sales}
          settings={settings}
          currentUser={effectiveUser}
          onSelectCustomerForPOS={(cust) => {
            setPreselectedPosCustomer(cust);
            setCurrentView(View.POS);
            pushTopNotification(
              'info',
              `تم اختيار العميل: ${cust.name}`,
              'تم تجهيز بيانات العميل في شاشة الكاشير لتحقيق المستهدف البيعي',
              'بيع مباشر'
            );
          }}
          onOpenFormulationForProduct={(product) => {
            setFormulationProduct(product);
            setCurrentView(View.FORMULATION_ENGINE);
          }}
        />
      </main>

      {/* Auth Modal for Login and User Switching */}
      {isAuthModalOpen && (
        <AuthModal
          email={authEmail}
          onSignOut={handleLogout}
          onClose={() => setIsAuthModalOpen(false)}
        />
      )}

      {/* Password Change Enforcement Modal */}
      {passwordChangeUser && (
        <PasswordChangeModal
          user={passwordChangeUser}
          onPasswordChanged={(updated) => {
            handleSaveUser(updated);
            setPasswordChangeUser(null);
          }}
          onClose={() => setPasswordChangeUser(null)}
        />
      )}

      {/* Day Operations Modal (فتح وإغلاق اليوم والدرج) */}
      {isDayOpsModalOpen && (
        <DayOperationsModal
          currentClosure={currentClosure}
          currentUser={currentUser}
          sales={sales}
          expenses={expenses}
          products={products}
          settings={settings}
          auditLogs={auditLogs}
          customCustomers={customCustomers}
          onSaveClosure={handleSaveClosure}
          onAddAuditLog={handleAddAuditLog}
          onClose={() => setIsDayOpsModalOpen(false)}
          onOpenDailyReportAutomation={() => {
            setIsDayOpsModalOpen(false);
            setIsDailyReportAutomationModalOpen(true);
          }}
          onSendSmartNotification={(title, subtitle, badgeText) =>
            pushTopNotification('goal', title, subtitle, badgeText)
          }
          currency={settings.currency}
        />
      )}

      {/* Automated Daily Midnight Report & Google Forms / Gmail Modal */}
      <DailyReportAutomationModal
        isOpen={isDailyReportAutomationModalOpen}
        onClose={() => setIsDailyReportAutomationModalOpen(false)}
        sales={sales}
        expenses={expenses}
        products={products}
        settings={settings}
        onUpdateSettings={handleSetSettings}
        currentClosure={currentClosure}
        auditLogs={auditLogs}
        customCustomers={customCustomers}
        currentUserDisplayName={currentUser?.displayName || 'الإدارة'}
        onSendSmartNotification={(title, subtitle, badgeText) =>
          pushTopNotification('goal', title, subtitle, badgeText)
        }
      />

      {/* Apple Dynamic Theme & Atmosphere Studio Modal */}
      <AppleThemeStudioModal
        isOpen={isThemeStudioModalOpen}
        onClose={() => setIsThemeStudioModalOpen(false)}
        settings={settings}
        onUpdateSettings={handleSetSettings}
        onNotify={(title, subtitle, badgeText) =>
          pushTopNotification('info', title, subtitle, badgeText)
        }
      />


      {/* Owner Live Alerts Radar Modal (رادار التنبيهات الفورية للمالك وتزامن الأجهزة في الوقت الفعلي) */}
      <OwnerLiveAlertsRadarModal
        isOpen={isOwnerLiveRadarOpen && effectiveUser?.role === 'OWNER'}
        onClose={() => setIsOwnerLiveRadarOpen(false)}
        recentSales={sales}
        currency={settings.currency}
        isCloudConnected={isCloudConnected}
        isOwner={effectiveUser?.role === 'OWNER'}
        broadcasts={ownerBroadcasts}
        onSendBroadcast={handleSendOwnerBroadcast}
        onAcknowledgeBroadcast={handleAcknowledgeOwnerBroadcast}
        currentUser={effectiveUser}
        onTriggerTestAlert={() => {
          pushTopNotification(
            'goal',
            '🔔 تجربة رادار تنبيهات المالك الناجحة',
            'نظام التزامن الفوري والرنين وإشعارات الشاشة يعمل بكفاءة 100% على اللاب توب والموبايل',
            'تنبيه حي'
          );
        }}
      />

      {/* PWA Independent App Packaging Modal (تثبيت البرنامج كتطبيق مستقل على الموبايل واللاب توب والتابلت) */}
      <PWAInstallModal
        isOpen={isPWAInstallModalOpen}
        onClose={() => setIsPWAInstallModalOpen(false)}
      />

      {/* Real-time Connected Devices & Multi-Device Turbo Sync Modal */}
      <ConnectedDevicesSyncModal
        isOpen={isConnectedDevicesModalOpen && effectiveUser?.role === 'OWNER'}
        onClose={() => setIsConnectedDevicesModalOpen(false)}
        devices={connectedDevices}
        deviceFeedStatus={deviceFeedStatus}
        deviceFeedLastServerUpdate={deviceFeedLastServerUpdate}
        isOwner={effectiveUser?.role === 'OWNER'}
        onTriggerInstantSync={async () => {
          const latencyMs = await publishDevicePresence(effectiveUser);
          pushTopNotification(
            'info',
            'تم تأكيد نبضة هذا الجهاز',
            `أكد Firestore كتابة نبضة الاتصال خلال ${latencyMs} مللي ثانية؛ هذا لا يثبت مزامنة محتوى الأجهزة الأخرى.`,
            'رادار الأجهزة'
          );
          return latencyMs;
        }}
      />
    </div>
  );
};

export default App;
