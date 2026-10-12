import React, { useState, useMemo, useEffect, useRef } from 'react';
import { 
  BottleSize, 
  StoreSettings, 
  DEFAULT_SETTINGS, 
  DEFAULT_BOTTLE_SIZES,
  FinancialVault,
  WithdrawalTransaction,
  VaultType,
  Sale,
  Expense,
  Product,
  StaffAttendanceRecord,
  AppUser,
  View,
  CustomCustomerRecord,
  LoyaltyAIAnalysisResult,
  calculateSafeLoyaltyRedemption,
  ReceiptDesignConfig,
  DEFAULT_RECEIPT_DESIGN,
  AuditLogRecord,
  buildCommercialReferenceRow,
  isLiveProductionSale,
  isLiveProductionWithdrawal,
  APPROVED_FIXED_BUDGET_ITEMS,
  FixedBudgetItem
} from '../types';
import { SmoothNumberInput } from './SmoothNumberInput';
import { ThermalReceiptLiveView } from './ReceiptModal';
import { AppleThemeStudioPanel } from './AppleThemeStudioModal';
import { DashboardLayoutStudioPanel } from './DashboardLayoutStudioPanel';
import UsersManagement from './UsersManagement';
import { soundAlertService } from '../services/soundAlertService';
import { loadTelegramSettings, saveTelegramSettings, testTelegramConnection, TelegramSettings } from '../services/telegramNotificationService';
import AuditLogViewer from './AuditLogViewer';
import { FinancialVaults } from './FinancialVaults';
import { canViewProfits, canViewCosts, hashPassword } from '../services/authService';
import { analyzeLoyaltyProgramWithAI } from '../services/geminiService';
import { 
  Store, 
  Sliders, 
  Beaker, 
  Target, 
  Wallet, 
  ShieldCheck, 
  Receipt, 
  Package, 
  KeyRound, 
  RotateCcw, 
  Save, 
  Check, 
  Search, 
  Plus, 
  Trash2, 
  Edit3, 
  Lock, 
  ArrowDownRight, 
  Download, 
  Upload, 
  CheckCircle2, 
  AlertTriangle, 
  DollarSign, 
  Building, 
  Coins, 
  Zap, 
  Users, 
  Eye, 
  EyeOff,
  Sparkles,
  ArrowRight,
  Crown,
  Gift,
  RefreshCw,
  TrendingUp,
  Power,
  Award,
  Calculator,
  Printer,
  Type,
  Layout,
  Palette,
  AlignCenter,
  AlignRight,
  AlignLeft,
  History,
  Radio, Send,
  Clock,
  Gauge,
  X
} from 'lucide-react';

export type SettingsSection = 
  | 'staff_management'
  | 'commission_policies'
  | 'budget_management'
  | 'system_settings'
  | 'audit_log'
  // Backward compatibility aliases
  | 'dashboard_layout'
  | 'themes'
  | 'loyalty_ai'
  | 'identity' 
  | 'pricing' 
  | 'budget' 
  | 'vaults' 
  | 'privacy' 
  | 'pos_receipts' 
  | 'inventory' 
  | 'security_backup';

interface SettingsProps {
  settings: StoreSettings;
  setSettings: React.Dispatch<React.SetStateAction<StoreSettings>>;
  bottleSizes: BottleSize[];
  setBottleSizes: React.Dispatch<React.SetStateAction<BottleSize[]>>;
  vaults?: FinancialVault[];
  withdrawals?: WithdrawalTransaction[];
  sales?: Sale[];
  expenses?: Expense[];
  products?: Product[];
  customCustomers?: CustomCustomerRecord[];
  currentUser?: AppUser | null;
  users?: AppUser[];
  auditLogs?: AuditLogRecord[];
  attendanceRecords?: StaffAttendanceRecord[];
  onCheckInAttendance?: (record: StaffAttendanceRecord) => void;
  onAddWithdrawal?: (tx: WithdrawalTransaction, updatedVault: FinancialVault) => void;
  onNavigate?: (view: View) => void;
  onSaveAppUser?: (user: AppUser) => void;
  onAddAuditLog?: (log: AuditLogRecord) => void;
  onPreviewUserPermissions?: (user: AppUser | null) => void;
  onUpdateSale?: (updatedSale: Sale, previousSale: Sale, adjustStock?: boolean) => void;
  initialSection?: SettingsSection;
}

export const Settings: React.FC<SettingsProps> = ({
  settings,
  setSettings,
  bottleSizes,
  setBottleSizes,
  vaults = [],
  withdrawals = [],
  sales = [],
  expenses = [],
  products = [],
  customCustomers = [],
  currentUser,
  users = [],
  auditLogs = [],
  attendanceRecords = [],
  onCheckInAttendance,
  onAddWithdrawal,
  onNavigate,
  onSaveAppUser,
  onAddAuditLog,
  onPreviewUserPermissions,
  onUpdateSale,
  initialSection = 'pricing'
}) => {
  const isOwner = currentUser?.role === 'OWNER';

  // Active Main Administrative Tab (Default to 'pricing' to immediately show real numbers & controls)
  const [activeSection, setActiveSection] = useState<SettingsSection>(() => {
    if (initialSection === 'loyalty_ai' || initialSection === 'budget' || initialSection === 'vaults') return 'budget_management';
    if (['identity', 'privacy', 'pos_receipts', 'inventory', 'security_backup', 'themes', 'dashboard_layout'].includes(initialSection)) {
      return 'system_settings';
    }
    return initialSection || 'pricing';
  });

  // System Settings Sub-Tab
    // Telegram Notifications State
  const [telegramConfig, setTelegramConfig] = useState<TelegramSettings>(loadTelegramSettings);
  const [telegramTesting, setTelegramTesting] = useState<boolean>(false);
  const [telegramStatusMsg, setTelegramStatusMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  const [systemSubTab, setSystemSubTab] = useState<'identity' | 'themes' | 'pos_receipts' | 'pricing' | 'inventory' | 'security_backup' | 'loyalty_ai' | 'dashboard_layout'>('identity');

  // Budget Management Sub-Tab
  const [budgetSubTab, setBudgetSubTab] = useState<'budget_target' | 'vaults'>('budget_target');

  // Interactive Commission Simulator State for commission_policies tab
  const [simSoldBottles, setSimSoldBottles] = useState<number>(12);
  const [simAvgBottlePrice, setSimAvgBottlePrice] = useState<number>(120);

  const [searchTerm, setSearchTerm] = useState('');

  // Sync if initialSection prop changes or if navigated from Dashboard customization button
  useEffect(() => {
    let target = initialSection;
    try {
      const requestedSection = sessionStorage.getItem('lamsa_open_settings_section') as SettingsSection | null;
      if (requestedSection) {
        sessionStorage.removeItem('lamsa_open_settings_section');
        target = requestedSection;
      }
    } catch {
      // ignore storage errors
    }

    if (!target) return;

    if (target === 'pricing') {
      setActiveSection('pricing');
    } else if (['identity', 'privacy', 'pos_receipts', 'inventory', 'security_backup', 'themes', 'dashboard_layout', 'loyalty_ai'].includes(target)) {
      setActiveSection('system_settings');
      if (target === 'inventory') setSystemSubTab('inventory');
      else if (target === 'themes') setSystemSubTab('themes');
      else if (target === 'pos_receipts') setSystemSubTab('pos_receipts');
      else if (target === 'security_backup') setSystemSubTab('security_backup');
      else if (target === 'loyalty_ai') setSystemSubTab('loyalty_ai');
      else if (target === 'dashboard_layout') setSystemSubTab('dashboard_layout');
      else setSystemSubTab('identity');
    } else if (target === 'budget' || target === 'vaults') {
      setActiveSection('budget_management');
      setBudgetSubTab(target === 'vaults' ? 'vaults' : 'budget_target');
    } else {
      setActiveSection(target);
    }
  }, [initialSection]);

  // Local settings draft state
  const isLocalTypingActiveRef = useRef(false);
  const [localSettings, setLocalSettings] = useState<StoreSettings>(settings);
  const [receiptStudioTab, setReceiptStudioTab] = useState<'elements' | 'typography' | 'layout' | 'branding'>('elements');
  const [draftReceiptDesign, setDraftReceiptDesign] = useState<ReceiptDesignConfig>(() => ({
    ...DEFAULT_RECEIPT_DESIGN,
    ...(settings.receiptDesign || {}),
    showLogo: settings.receiptDesign?.showLogo ?? settings.showLogoOnReceipt ?? true,
  }));

  useEffect(() => {
    if (!isLocalTypingActiveRef.current) {
      setLocalSettings(settings);
      setDraftReceiptDesign({
        ...DEFAULT_RECEIPT_DESIGN,
        ...(settings.receiptDesign || {}),
        showLogo: settings.receiptDesign?.showLogo ?? settings.showLogoOnReceipt ?? true,
      });
    }
  }, [settings]);

  // Real-time Ultra-Sync: Any letter, color, or setting modified is immediately synced to cloud & all connected devices
  const isSettingsInitializedRef = useRef(false);
  useEffect(() => {
    if (!isSettingsInitializedRef.current) {
      isSettingsInitializedRef.current = true;
      return;
    }
    const timer = setTimeout(() => {
      if (JSON.stringify(localSettings) !== JSON.stringify(settings)) {
        setSettings(localSettings);
      }
    }, 280);
    return () => clearTimeout(timer);
  }, [localSettings, settings, setSettings]);

  // Dynamic Budget Management State & Calculations
  const [showAddBudgetItemModal, setShowAddBudgetItemModal] = useState<boolean>(false);
  const [newBudgetItemName, setNewBudgetItemName] = useState<string>('');
  const [newBudgetItemAmount, setNewBudgetItemAmount] = useState<number>(500);
  const [newBudgetItemCategory, setNewBudgetItemCategory] = useState<string>('utilities');

  const currentBudgetItems: FixedBudgetItem[] = useMemo(() => {
    if (localSettings.customBudgetItems && localSettings.customBudgetItems.length > 0) {
      return localSettings.customBudgetItems;
    }
    return APPROVED_FIXED_BUDGET_ITEMS.map((item) => {
      if (item.id === 'salary_owner') {
        const amt = localSettings.ownerSalary || 10500;
        return {
          ...item,
          monthlyAmount: amt,
          dailyRate: Math.round(amt / (localSettings.monthlyWorkDays || 25)),
        };
      }
      if (item.id === 'salary_tarek') {
        const amt = localSettings.employeeBaseSalary || 1000;
        return {
          ...item,
          monthlyAmount: amt,
          dailyRate: Math.round(amt / (localSettings.monthlyWorkDays || 25)),
        };
      }
      return item;
    });
  }, [
    localSettings.customBudgetItems,
    localSettings.ownerSalary,
    localSettings.employeeBaseSalary,
    localSettings.monthlyWorkDays,
  ]);

  const computedTotalBudget = useMemo(() => {
    return currentBudgetItems.reduce((acc, it) => acc + (Number(it.monthlyAmount) || 0), 0);
  }, [currentBudgetItems]);

  const computedDailyShare = useMemo(() => {
    const days = localSettings.monthlyWorkDays || 25;
    return days > 0 ? Math.round(computedTotalBudget / days) : 0;
  }, [computedTotalBudget, localSettings.monthlyWorkDays]);

  const handleUpdateBudgetItemAmount = (id: string, newAmount: number) => {
    const updated = currentBudgetItems.map((item) => {
      if (item.id === id) {
        return {
          ...item,
          monthlyAmount: newAmount,
          dailyRate: Math.round(newAmount / (localSettings.monthlyWorkDays || 25)),
        };
      }
      return item;
    });
    const newTotal = updated.reduce((acc, it) => acc + (Number(it.monthlyAmount) || 0), 0);
    let nextOwnerSalary = localSettings.ownerSalary;
    let nextEmployeeSalary = localSettings.employeeBaseSalary;
    if (id === 'salary_owner') nextOwnerSalary = newAmount;
    if (id === 'salary_tarek') nextEmployeeSalary = newAmount;

    setLocalSettings((prev) => ({
      ...prev,
      customBudgetItems: updated,
      monthlyFixedBudget: newTotal,
      ownerSalary: nextOwnerSalary,
      employeeBaseSalary: nextEmployeeSalary,
    }));
  };

  const handleAddBudgetItem = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newBudgetItemName.trim() || newBudgetItemAmount <= 0) return;
    const newItem: FixedBudgetItem = {
      id: `budget-custom-${Date.now()}`,
      name: newBudgetItemName.trim(),
      category: newBudgetItemCategory,
      monthlyAmount: newBudgetItemAmount,
      dailyRate: Math.round(newBudgetItemAmount / (localSettings.monthlyWorkDays || 25)),
      icon: 'Box',
    };
    const updated = [...currentBudgetItems, newItem];
    const newTotal = updated.reduce((acc, it) => acc + (Number(it.monthlyAmount) || 0), 0);
    setLocalSettings((prev) => ({
      ...prev,
      customBudgetItems: updated,
      monthlyFixedBudget: newTotal,
    }));
    setShowAddBudgetItemModal(false);
    setNewBudgetItemName('');
    setNewBudgetItemAmount(500);
  };

  const handleRemoveBudgetItem = (id: string) => {
    const updated = currentBudgetItems.filter((item) => item.id !== id);
    const newTotal = updated.reduce((acc, it) => acc + (Number(it.monthlyAmount) || 0), 0);
    setLocalSettings((prev) => ({
      ...prev,
      customBudgetItems: updated,
      monthlyFixedBudget: newTotal,
    }));
  };

  const handleResetBudgetDefaults = () => {
    const resetItems = APPROVED_FIXED_BUDGET_ITEMS.map((item) => {
      if (item.id === 'salary_owner') return { ...item, monthlyAmount: 10500, dailyRate: 420 };
      if (item.id === 'salary_tarek') return { ...item, monthlyAmount: 1000, dailyRate: 40 };
      return item;
    });
    setLocalSettings((prev) => ({
      ...prev,
      customBudgetItems: resetItems,
      monthlyFixedBudget: 15000,
      ownerSalary: 10500,
      employeeBaseSalary: 1000,
      monthlyWorkDays: 25,
      dailyTargetProfit: 600,
    }));
  };

  // Sample sale for Live Receipt Preview in Settings (Strictly isolated as DOC_EXAMPLE)
  const samplePreviewSale: Sale = useMemo(() => {
    const liveSales = sales.filter(s => isLiveProductionSale(s));
    if (liveSales.length > 0) {
      return liveSales[0];
    }
    return {
      id: 'DOC-PREVIEW-RECEIPT',
      date: new Date().toISOString(),
      customerName: 'معاينة تصميم الفاتورة',
      customerPhone: '01000000000',
      employeeName: 'طارق',
      paymentMethod: 'نقدي',
      discount: 10,
      totalPrice: 390,
      totalCost: 295,
      totalProfit: 95,
      dataClassification: 'DOC_EXAMPLE',
      isTestData: true,
      testClassificationNote: 'DOC_EXAMPLE / معاينة تصميم الفاتورة فقط — لا تدخل في المبيعات أو التقارير',
      items: [
        {
          id: 'item-1',
          productId: 1,
          productName: 'سوفاج ديور (Sauvage Elixir)',
          productType: 'عادي',
          bottleSize: 50,
          essenceGrams: 15,
          cost: 180,
          sellingPrice: 230,
          profit: 38.5,
          quantity: 1,
        },
        {
          id: 'item-2',
          productId: 2,
          productName: 'عود كمبودي ملكي خاص',
          productType: 'عود',
          bottleSize: 30,
          essenceGrams: 10,
          cost: 115,
          sellingPrice: 170,
          profit: 46.5,
          quantity: 1,
        },
      ],
    };
  }, [sales]);

  const handleApproveReceiptStudio = () => {
    const updated: StoreSettings = {
      ...localSettings,
      showLogoOnReceipt: draftReceiptDesign.showLogo,
      receiptDesign: draftReceiptDesign,
    };
    setLocalSettings(updated);
    setSettings(updated);
    setToastMessage('✅ تم اعتماد وتطبيق إعدادات الفاتورة والطباعة الشاملة بنجاح.');
    setIsSavedToast(true);
    setTimeout(() => setIsSavedToast(false), 3000);
  };

  const handleRestoreDefaultReceiptStudio = () => {
    setDraftReceiptDesign(DEFAULT_RECEIPT_DESIGN);
    setLocalSettings((prev) => ({
      ...prev,
      storeName: DEFAULT_SETTINGS.storeName,
      storeSlogan: DEFAULT_SETTINGS.storeSlogan,
      storePhone: DEFAULT_SETTINGS.storePhone,
      storeAddress: DEFAULT_SETTINGS.storeAddress,
      receiptFooterMessage: DEFAULT_SETTINGS.receiptFooterMessage,
      logoUrl: DEFAULT_SETTINGS.logoUrl,
      showLogoOnReceipt: true,
      receiptDesign: DEFAULT_RECEIPT_DESIGN,
    }));
    setToastMessage('🔄 تمت استعادة التصميم الافتراضي للفاتورة في المعاينة الفورية — اضغط اعتماد للحفظ.');
    setIsSavedToast(true);
    setTimeout(() => setIsSavedToast(false), 3500);
  };

  const [isSavedToast, setIsSavedToast] = useState(false);
  const [toastMessage, setToastMessage] = useState('تم حفظ الإعدادات بنجاح ومزامنتها لحظياً.');

  // Smart Auto-Save: Persist any changes to localSettings or draftReceiptDesign automatically
  useEffect(() => {
    const mergedWithReceipt: StoreSettings = {
      ...localSettings,
      showLogoOnReceipt: draftReceiptDesign.showLogo,
      receiptDesign: draftReceiptDesign,
    };
    if (JSON.stringify(mergedWithReceipt) === JSON.stringify(settings)) return;
    const timer = window.setTimeout(() => {
      setSettings(mergedWithReceipt);
    }, 320);
    return () => window.clearTimeout(timer);
  }, [localSettings, draftReceiptDesign]);

  // AI Loyalty Governance & Profit Alignment state
  const [loyaltyAiReport, setLoyaltyAiReport] = useState<LoyaltyAIAnalysisResult | null>(null);
  const [isAnalyzingLoyaltyAi, setIsAnalyzingLoyaltyAi] = useState(false);
  const [simBottlePrice, setSimBottlePrice] = useState<number>(230);
  const [simBottleCost, setSimBottleCost] = useState<number>(180);
  const [simCustomerPoints, setSimCustomerPoints] = useState<number>(100);

  // Bottle size add/edit modal & Owner Audit Reason
  const [isBottleModalOpen, setIsBottleModalOpen] = useState(false);
  const [editingBottle, setEditingBottle] = useState<BottleSize | null>(null);
  const [ownerAuditReason, setOwnerAuditReason] = useState<string>('تحديث معتمد من لوحة المالك وفق المرجع التجاري والمالي');
  const [bottleFormData, setBottleFormData] = useState<Partial<BottleSize>>({
    sizeMl: 50,
    essenceGrams: 15,
    bottleCost: 15,
    suggestedMargin: 35,
    normalPrice: 230,
    coloredNormalPrice: 300,
    specialPrice: 450,
    coloredSpecialPrice: undefined,
    officialCost: 180,
    isRollOn: false
  });

  // Owner withdrawal quick ledger modal
  const [isWithdrawModalOpen, setIsWithdrawModalOpen] = useState(false);
  const [withdrawType, setWithdrawType] = useState<'owner_salary' | 'owner_profit' | 'restock' | 'utilities' | 'capital'>('owner_salary');
  const [withdrawAmount, setWithdrawAmount] = useState<number | ''>('');
  const [withdrawReason, setWithdrawReason] = useState('صرف جزء من مخصص راتب الإدارة المعتمد');
  const [withdrawRef, setWithdrawRef] = useState('');

  // Password change in security tab
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [passwordError, setPasswordError] = useState<string | null>(null);
  const [passwordSuccess, setPasswordSuccess] = useState<string | null>(null);

  // Financial calculations summary (Live Production Data only)
  const liveSalesList = useMemo(() => sales.filter(s => isLiveProductionSale(s)), [sales]);
  const liveWithdrawalsList = useMemo(() => withdrawals.filter(w => isLiveProductionWithdrawal(w)), [withdrawals]);
  const totalRevenue = useMemo(() => liveSalesList.reduce((s, x) => s + (x.totalPrice || 0), 0), [liveSalesList]);
  const totalRestockCost = useMemo(() => liveSalesList.reduce((s, x) => s + (x.totalCost || 0), 0), [liveSalesList]);
  const restockWithdrawn = useMemo(() => {
    return liveWithdrawalsList.filter(w => w.vaultId === 'restock' && w.type !== 'capital_deposit').reduce((s, w) => s + w.amount, 0);
  }, [liveWithdrawalsList]);
  const restockBalance = Math.max(0, totalRestockCost - restockWithdrawn);

  // Today's net contribution for AI Loyalty alignment
  const todayStr = new Date().toISOString().slice(0, 10);
  const todaysSales = useMemo(() => liveSalesList.filter(s => s.date && s.date.startsWith(todayStr)), [liveSalesList, todayStr]);
  const todayNetContribution = useMemo(() => {
    const rev = todaysSales.reduce((acc, s) => acc + (s.totalPrice || 0), 0);
    const cost = todaysSales.reduce((acc, s) => acc + (s.totalCost || 0), 0);
    const comm = todaysSales.reduce((acc, s) => acc + (s.commissionAmount ?? (s.totalPrice * 0.05)), 0);
    return rev - cost - comm;
  }, [todaysSales]);

  // Run AI Loyalty Analysis
  const runLoyaltyAiAnalysis = async (overrideSettings?: StoreSettings) => {
    setIsAnalyzingLoyaltyAi(true);
    try {
      const report = await analyzeLoyaltyProgramWithAI({
        sales,
        customCustomers,
        settings: overrideSettings || localSettings,
        todayNetContribution,
        dailyBreakEvenTarget: 600,
      });
      setLoyaltyAiReport(report);
    } catch (err) {
      console.warn(err);
    } finally {
      setIsAnalyzingLoyaltyAi(false);
    }
  };

  // Apply AI Recommended Loyalty Settings in 1 click
  const handleApplyAiLoyaltyRecommendation = () => {
    if (!loyaltyAiReport) return;
    const rec = loyaltyAiReport.recommendedSettings;
    const updated: StoreSettings = {
      ...localSettings,
      loyaltyEnabled: true,
      loyaltyAutoAI: rec.loyaltyAutoAI,
      loyaltyProtectBreakEven: rec.loyaltyProtectBreakEven,
      loyaltyStrategyMode: rec.loyaltyStrategyMode,
      loyaltyPointsPerSpendEgp: rec.loyaltyPointsPerSpendEgp,
      loyaltyPointsPerVisit: rec.loyaltyPointsPerVisit,
      loyaltyCashPerPointEgp: rec.loyaltyCashPerPointEgp,
      loyaltyMinRedeemPoints: rec.loyaltyMinRedeemPoints,
      loyaltyMaxBillDiscountPercent: rec.loyaltyMaxBillDiscountPercent,
      loyaltyMinSafeMarginEgp: rec.loyaltyMinSafeMarginEgp,
    };
    setLocalSettings(updated);
    setSettings(updated);
    setToastMessage('✨ تم اعتماد وتطبيق إعدادات الذكاء الاصطناعي لنقاط الولاء وحماية الأرباح بنجاح!');
    setIsSavedToast(true);
    setTimeout(() => setIsSavedToast(false), 3500);
    runLoyaltyAiAnalysis(updated);
  };

  // Apply one of the 3 Smart AI Strategy Modes
  const handleSelectLoyaltyStrategyPreset = (mode: 'profit_shield' | 'balanced' | 'growth_vip') => {
    let updated: StoreSettings;
    if (mode === 'profit_shield') {
      updated = {
        ...localSettings,
        loyaltyEnabled: true,
        loyaltyStrategyMode: 'profit_shield',
        loyaltyPointsPerSpendEgp: 10,
        loyaltyPointsPerVisit: 3,
        loyaltyCashPerPointEgp: 0.5,
        loyaltyMinRedeemPoints: 20,
        loyaltyMaxBillDiscountPercent: 18,
        loyaltyMinSafeMarginEgp: 22,
        loyaltyProtectBreakEven: true,
      };
    } else if (mode === 'growth_vip') {
      updated = {
        ...localSettings,
        loyaltyEnabled: true,
        loyaltyStrategyMode: 'growth_vip',
        loyaltyPointsPerSpendEgp: 8,
        loyaltyPointsPerVisit: 8,
        loyaltyCashPerPointEgp: 0.75,
        loyaltyMinRedeemPoints: 10,
        loyaltyMaxBillDiscountPercent: 30,
        loyaltyMinSafeMarginEgp: 15,
        loyaltyProtectBreakEven: true,
      };
    } else {
      updated = {
        ...localSettings,
        loyaltyEnabled: true,
        loyaltyStrategyMode: 'balanced',
        loyaltyPointsPerSpendEgp: 10,
        loyaltyPointsPerVisit: 0,
        loyaltyCashPerPointEgp: 0.10,
        loyaltyMinRedeemPoints: 50,
        loyaltyMaxBillDiscountPercent: 25,
        loyaltyMinSafeMarginEgp: 10,
        loyaltyProtectBreakEven: true,
      };
    }
    setLocalSettings(updated);
    setSettings(updated);
    setToastMessage(
      mode === 'profit_shield'
        ? '🛡️ تم تفعيل وضع درع حماية الربح والتعادل بنجاح'
        : mode === 'growth_vip'
        ? '🚀 تم تفعيل وضع تنشيط المبيعات ومكافأة VIP بنجاح'
        : '⚖️ تم تفعيل وضع التوازن الذكي المعتمد بنجاح'
    );
    setIsSavedToast(true);
    setTimeout(() => setIsSavedToast(false), 3000);
  };

  // Live Simulator Calculation for Loyalty Profit Protection
  const simResult = useMemo(() => {
    const safeCalc = calculateSafeLoyaltyRedemption({
      billSubtotal: simBottlePrice,
      billTotalCost: simBottleCost,
      commissionRate: localSettings.commissionRate || 0.05,
      customerAvailablePoints: simCustomerPoints,
      settings: localSettings,
      todayNetContribution,
      dailyBreakEvenTarget: 600,
    });
    const netPriceAfterMaxDiscount = Math.max(0, simBottlePrice - safeCalc.maxSafeLoyaltyDiscountEgp);
    const commissionAfterDiscount = Math.round(netPriceAfterMaxDiscount * (localSettings.commissionRate || 0.05));
    const guaranteedStoreNetProfit = netPriceAfterMaxDiscount - simBottleCost - commissionAfterDiscount;
    const newPointsEarned = safeCalc.pointsEarnedOnNetBill(netPriceAfterMaxDiscount);

    return {
      ...safeCalc,
      netPriceAfterMaxDiscount,
      commissionAfterDiscount,
      guaranteedStoreNetProfit,
      newPointsEarned,
    };
  }, [simBottlePrice, simBottleCost, simCustomerPoints, localSettings, todayNetContribution]);

  // 5 Master Administrative Sidebar Tabs
  const menuItems: { id: SettingsSection; label: string; desc: string; icon: any; category: string; badge: string }[] = [
    {
      id: 'staff_management',
      label: 'إدارة الموظفين والصلاحيات',
      desc: 'حسابات كادر العمل، أدوار الـ RBAC، ومعاينة الصلاحيات',
      icon: Users,
      category: 'الموظفين',
      badge: 'الكادر'
    },
    {
      id: 'commission_policies',
      label: 'سياسات العمولات والحوافز',
      desc: 'نسبة الـ 5% والـ 7%، شرائح العبوات، واحتياطي المكافآت',
      icon: Award,
      category: 'العمولات',
      badge: 'الحوافز'
    },
    {
      id: 'budget_management',
      label: 'إدارة الموازنة والخزائن',
      desc: 'موازنة الـ 15,000 ج المعتمدة، الخزائن، ومسحوبات المالك',
      icon: Target,
      category: 'الموازنة',
      badge: '15k'
    },
    {
      id: 'system_settings',
      label: 'إعدادات النظام والهوية والطباعة',
      desc: 'الهوية، الثيمات، تصميم الفواتير، التكاليف والنسخ الاحتياطي',
      icon: Sliders,
      category: 'النظام',
      badge: 'الإعدادات'
    },
    {
      id: 'audit_log',
      label: 'سجل التدقيق وتتبع العمليات',
      desc: 'تتبع تغيير الأسعار، تعديل التكاليف، وسجلات أمان النظام',
      icon: History,
      category: 'التدقيق',
      badge: 'الأمان'
    }
  ];

  // Filter menu items by search
  const filteredMenuItems = useMemo(() => {
    if (!searchTerm.trim()) return menuItems;
    const term = searchTerm.toLowerCase();
    return menuItems.filter(item => 
      item.label.toLowerCase().includes(term) || 
      item.desc.toLowerCase().includes(term) ||
      item.category.toLowerCase().includes(term)
    );
  }, [searchTerm, menuItems]);

  // Save Settings handler with automatic Audit Trail logging (Old Value, New Value, Timestamp, Reason)
  const handleSaveSettings = (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (onAddAuditLog) {
      const trackedFields: { key: keyof StoreSettings; label: string }[] = [
        { key: 'priceEssenceNormal', label: 'تكلفة جرام الزيت العادي' },
        { key: 'priceEssenceNiche', label: 'تكلفة جرام زيت النيش' },
        { key: 'priceEssenceSpecial', label: 'تكلفة جرام العود/المسك' },
        { key: 'standardBottleAndSprayCost', label: 'تكلفة العبوة العادية + البخاخ' },
        { key: 'coloredBottleCost', label: 'تكلفة العبوة الملونة' },
        { key: 'stickerCost', label: 'تكلفة الاستيكر' },
        { key: 'basicPlasticBagCost', label: 'تكلفة الكيس البلاستيك الأساسي' },
        { key: 'commissionRate', label: 'نسبة العمولة الأساسية' },
        { key: 'monthlyFixedBudget', label: 'الموازنة الشهرية الثابتة' },
        { key: 'dailyTargetProfit', label: 'التارجت اليومي' },
      ];
      trackedFields.forEach(({ key, label }) => {
        if (settings[key] !== localSettings[key]) {
          onAddAuditLog({
            id: `audit-${Date.now()}-${String(key)}`,
            timestamp: new Date().toISOString(),
            user: currentUser?.fullName || 'د. محمد (المالك)',
            action: 'تعديل تسعير',
            entityType: 'pricing',
            entityId: String(key),
            entityName: label,
            oldValue: String(settings[key] ?? ''),
            newValue: String(localSettings[key] ?? ''),
            reason: ownerAuditReason.trim() || 'تعديل معتمد من لوحة المالك',
            approvedBy: 'المالك',
          });
        }
      });
    }
    setSettings(localSettings);
    setToastMessage('تم حفظ الإعدادات وتوثيق التغييرات في سجل الرقابة بنجاح.');
    setIsSavedToast(true);
    setTimeout(() => setIsSavedToast(false), 3000);
  };

  // Reset defaults handler
  const handleResetDefaults = () => {
    if (confirm('هل أنت متأكد من استعادة كافة الإعدادات الافتراضية المعتمدة للمتجر وفق المرجع التجاري والمالي؟')) {
      if (onAddAuditLog) {
        onAddAuditLog({
          id: `audit-reset-${Date.now()}`,
          timestamp: new Date().toISOString(),
          user: currentUser?.fullName || 'د. محمد (المالك)',
          action: 'تعديل تسعير',
          entityType: 'pricing',
          entityId: 'reset-defaults',
          entityName: 'المرجع التجاري والمالي للمنتجات',
          oldValue: 'إعدادات مخصصة',
          newValue: 'المرجع الافتراضي المعتمد',
          reason: ownerAuditReason.trim() || 'استعادة القيم المعيارية المعتمدة من لوحة المالك',
          approvedBy: 'المالك',
        });
      }
      setLocalSettings(DEFAULT_SETTINGS);
      setSettings(DEFAULT_SETTINGS);
      setBottleSizes(DEFAULT_BOTTLE_SIZES);
      setToastMessage('تمت استعادة الإعدادات الافتراضية وتوثيقها في سجل التدقيق.');
      setIsSavedToast(true);
      setTimeout(() => setIsSavedToast(false), 3000);
    }
  };

  // Bottle size modal handlers
  const handleOpenBottleModal = (bottle?: BottleSize) => {
    if (bottle) {
      setEditingBottle(bottle);
      setBottleFormData(bottle);
    } else {
      setEditingBottle(null);
      setBottleFormData({
        sizeMl: 50,
        essenceGrams: 15,
        bottleCost: 15,
        suggestedMargin: 35,
        normalPrice: 230,
        coloredNormalPrice: 300,
        specialPrice: 450,
        coloredSpecialPrice: undefined,
        officialCost: 180,
        isRollOn: false
      });
    }
    setIsBottleModalOpen(true);
  };

  const handleSaveBottleForm = () => {
    if (!bottleFormData.sizeMl || bottleFormData.sizeMl <= 0) {
      setToastMessage('يرجى تحديد حجم الزجاجة بالمليلتر.');
      setIsSavedToast(true);
      setTimeout(() => setIsSavedToast(false), 3000);
      return;
    }

    const calculatedCost = 
      (Number(bottleFormData.essenceGrams || 10) * localSettings.priceEssenceNormal) + 
      Number(bottleFormData.bottleCost || 15) + 
      (bottleFormData.isRollOn ? 0 : 5);

    const updatedBottle: BottleSize = {
      id: editingBottle ? editingBottle.id : `b-${bottleFormData.sizeMl}-${Date.now().toString(36)}`,
      sizeMl: Number(bottleFormData.sizeMl),
      essenceGrams: Number(bottleFormData.essenceGrams || 10),
      bottleCost: Number(bottleFormData.bottleCost || 15),
      suggestedMargin: Number(bottleFormData.suggestedMargin || 35),
      normalPrice: Number(bottleFormData.normalPrice || (calculatedCost + (bottleFormData.suggestedMargin || 35))),
      coloredNormalPrice: bottleFormData.coloredNormalPrice && Number(bottleFormData.coloredNormalPrice) > 0
        ? Number(bottleFormData.coloredNormalPrice)
        : undefined,
      specialPrice: Number(bottleFormData.specialPrice || (calculatedCost * 1.8)),
      coloredSpecialPrice: bottleFormData.coloredSpecialPrice && Number(bottleFormData.coloredSpecialPrice) > 0
        ? Number(bottleFormData.coloredSpecialPrice)
        : undefined,
      officialCost: Number(bottleFormData.officialCost || calculatedCost),
      isRollOn: Boolean(bottleFormData.isRollOn)
    };

    if (onAddAuditLog) {
      onAddAuditLog({
        id: `audit-bottle-${Date.now()}`,
        timestamp: new Date().toISOString(),
        user: currentUser?.fullName || 'د. محمد (المالك)',
        action: 'تعديل تسعير',
        entityType: 'pricing',
        entityId: updatedBottle.id,
        entityName: `حجم عبوة ${updatedBottle.sizeMl} مل ${updatedBottle.isRollOn ? '(رول)' : '(بخاخ)'}`,
        oldValue: editingBottle
          ? `عادي: ${editingBottle.normalPrice}ج | ملون: ${editingBottle.coloredNormalPrice || '—'} | نيش/عود: ${editingBottle.specialPrice}ج | تكلفة: ${editingBottle.officialCost}ج | زيت: ${editingBottle.essenceGrams}جم`
          : 'حجم جديد غير مسجل',
        newValue: `عادي: ${updatedBottle.normalPrice}ج | ملون: ${updatedBottle.coloredNormalPrice || '—'} | نيش/عود: ${updatedBottle.specialPrice}ج | تكلفة: ${updatedBottle.officialCost}ج | زيت: ${updatedBottle.essenceGrams}جم`,
        reason: ownerAuditReason.trim() || 'تعديل معتمد من لوحة المالك',
        approvedBy: 'المالك',
      });
    }

    if (editingBottle) {
      setBottleSizes(prev => prev.map(b => b.id === editingBottle.id ? updatedBottle : b));
    } else {
      setBottleSizes(prev => [...prev, updatedBottle].sort((a, b) => b.sizeMl - a.sizeMl));
    }

    setIsBottleModalOpen(false);
    setToastMessage('تم حفظ حجم الزجاجة وتوثيق القيمة القديمة والجديدة وتاريخ التغيير وسببه.');
    setIsSavedToast(true);
    setTimeout(() => setIsSavedToast(false), 2500);
  };

  const handleDeleteBottleSize = (id: string) => {
    const targetBottle = bottleSizes.find(b => b.id === id);
    if (!targetBottle) return;
    const isCurrentlyActive = targetBottle.isActive !== false;
    const activeCount = bottleSizes.filter(b => b.isActive !== false).length;

    if (isCurrentlyActive && activeCount <= 1) {
      setToastMessage('يجب الإبقاء على حجم زجاجة واحد نشط على الأقل في النظام.');
      setIsSavedToast(true);
      setTimeout(() => setIsSavedToast(false), 3000);
      return;
    }

    const nextActiveState = !isCurrentlyActive;
    const actionConfirmMsg = isCurrentlyActive
      ? `هل تريد تحويل حجم الزجاجة (${targetBottle.sizeMl} مل) إلى حالة «غير نشط»؟ ستبقى جميع السجلات التاريخية محفوظة.`
      : `هل تريد إعادة تفعيل حجم الزجاجة (${targetBottle.sizeMl} مل) ليصبح «نشط» في الكاشير؟`;

    if (confirm(actionConfirmMsg)) {
      setBottleSizes(prev => prev.map(b => b.id === id ? { ...b, isActive: nextActiveState } : b));
      if (onAddAuditLog) {
        onAddAuditLog({
          id: `audit-bottle-status-${Date.now()}`,
          timestamp: new Date().toISOString(),
          user: currentUser?.fullName || 'د. محمد (المالك)',
          action: 'تعديل تسعير',
          entityType: 'pricing',
          entityId: targetBottle.id,
          entityName: `حالة حجم عبوة ${targetBottle.sizeMl} مل`,
          oldValue: isCurrentlyActive ? 'نشط' : 'غير نشط',
          newValue: nextActiveState ? 'نشط' : 'غير نشط (مع حفظ السجلات التاريخية)',
          reason: ownerAuditReason.trim() || (nextActiveState ? 'إعادة تفعيل الحجم من لوحة المالك' : 'إيقاف الحجم وتحويله إلى غير نشط مع بقاء السجلات التاريخية محفوظة'),
          approvedBy: 'المالك',
        });
      }
      setToastMessage(
        nextActiveState
          ? `تم إعادة تفعيل عبوة ${targetBottle.sizeMl} مل بنجاح.`
          : `تم تحويل عبوة ${targetBottle.sizeMl} مل إلى «غير نشط» مع الاحتفاظ بالسجلات التاريخية.`
      );
      setIsSavedToast(true);
      setTimeout(() => setIsSavedToast(false), 2800);
    }
  };

  // Owner withdrawal submission with ledger rules
  const handleExecuteWithdrawal = () => {
    if (!onAddWithdrawal || !withdrawAmount || Number(withdrawAmount) <= 0) return;

    const amount = Number(withdrawAmount);
    let targetVaultId: VaultType = 'salaries';
    let vaultName = '👤 مخصص راتب د. محمد (الإدارة)';
    let isCapital = false;

    if (withdrawType === 'owner_salary') {
      targetVaultId = 'salaries';
      vaultName = '👤 مخصص راتب د. محمد (الإدارة)';
    } else if (withdrawType === 'owner_profit') {
      targetVaultId = 'owner_profit';
      vaultName = '📈 محفظة الأرباح الصافية الحرة للمالك';
    } else if (withdrawType === 'restock') {
      targetVaultId = 'restock';
      vaultName = '🧴 قسم تكلفة المخزون وإعادة الشراء';
    } else if (withdrawType === 'utilities') {
      targetVaultId = 'utilities';
      vaultName = '🏪 محفظة المصروفات التشغيلية والمرافق';
    } else if (withdrawType === 'capital') {
      targetVaultId = 'capital';
      vaultName = '🔒 قسم رأس المال وتمويل صاحب المشروع';
      isCapital = true;
    }

    const activeVault = vaults.find(v => v.id === targetVaultId) || {
      id: targetVaultId,
      name: vaultName,
      description: 'محفظة مالية رسمية',
      currentBalance: 0,
      totalInflow: 0,
      totalWithdrawn: 0,
      withdrawalFrequency: 'anytime',
      iconName: 'Wallet',
    };

    const balanceBefore = activeVault.currentBalance;
    const balanceAfter = isCapital ? (balanceBefore + amount) : Math.max(0, balanceBefore - amount);

    const tx: WithdrawalTransaction = {
      id: `wth-${Date.now()}`,
      vaultId: targetVaultId,
      vaultName,
      type: isCapital ? 'capital_deposit' : 'withdrawal',
      amount,
      date: new Date().toISOString(),
      executedBy: currentUser?.displayName || 'د. محمد (صاحب المتجر)',
      recipientName: isCapital ? 'خزينة متجر لمسة عطر' : (currentUser?.displayName || 'د. محمد (صاحب المتجر)'),
      reason: withdrawReason.trim(),
      invoiceRef: withdrawRef.trim() || undefined,
      status: isCapital ? 'مؤكد ومودع' : 'مؤكد ومصروف',
      balanceBefore,
      balanceAfter,
      notes: `مسحوب رسمي مصنف - ممنوع السحب العشوائي غير الموثق`,
    };

    const updatedVault: FinancialVault = {
      ...activeVault,
      currentBalance: balanceAfter,
      totalInflow: isCapital ? (activeVault.totalInflow + amount) : activeVault.totalInflow,
      totalWithdrawn: !isCapital ? (activeVault.totalWithdrawn + amount) : activeVault.totalWithdrawn,
    };

    onAddWithdrawal(tx, updatedVault);
    setIsWithdrawModalOpen(false);
    setWithdrawAmount('');
    setWithdrawRef('');
    setToastMessage('تم تسجيل المعاملة المالية وترحيلها للخزائن بنجاح.');
    setIsSavedToast(true);
    setTimeout(() => setIsSavedToast(false), 2500);
  };

  // Change password for current logged-in user
  const handleChangePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setPasswordError(null);
    setPasswordSuccess(null);

    if (newPassword.length < 4) {
      setPasswordError('كلمة المرور يجب أن لا تقل عن 4 خانات.');
      return;
    }

    if (newPassword !== confirmPassword) {
      setPasswordError('كلمتا المرور غير متطابقتين.');
      return;
    }

    try {
      const hash = await hashPassword(newPassword);
      if (currentUser && onSaveAppUser) {
        const updated: AppUser = {
          ...currentUser,
          passwordHash: hash,
          requiresPasswordChange: false
        };
        onSaveAppUser(updated);
        setPasswordSuccess('تم تحديث وتشفير كلمة المرور بنجاح.');
        setNewPassword('');
        setConfirmPassword('');
      } else {
        setPasswordSuccess('تم تشفير كلمة المرور بنجاح.');
      }
    } catch (err) {
      setPasswordError('حدث خطأ أثناء تشفير كلمة المرور.');
    }
  };

  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleImportRestoreBackup = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      try {
        const text = event.target?.result as string;
        if (!text) return;

        const data = JSON.parse(text);
        if (!data || typeof data !== 'object') {
          alert('ملف النسخة الاحتياطية غير صالح أو تالف.');
          return;
        }

        const restoredSettings = data.settings || data.localSettings;
        const restoredProducts = Array.isArray(data.products) ? data.products : null;
        const restoredSales = Array.isArray(data.sales) ? data.sales : null;
        const restoredExpenses = Array.isArray(data.expenses) ? data.expenses : null;
        const restoredBottleSizes = Array.isArray(data.bottleSizes) ? data.bottleSizes : null;
        const restoredVaults = Array.isArray(data.vaults) ? data.vaults : null;
        const restoredWithdrawals = Array.isArray(data.withdrawals) ? data.withdrawals : null;

        const summaryMsg = `تم العثور على البيانات التالية في الملف:
- الإعدادات: ${restoredSettings ? "موجودة" : "غير موجودة"}
- العطور والمنتجات: ${restoredProducts ? restoredProducts.length + " صنف" : "0"}
- المبيعات والفواتير: ${restoredSales ? restoredSales.length + " فاتورة" : "0"}
- المصروفات: ${restoredExpenses ? restoredExpenses.length + " مصروف" : "0"}
- أحجام العبوات: ${restoredBottleSizes ? restoredBottleSizes.length + " حجم" : "0"}

هل أنت متأكد من استعادة هذه البيانات واستبدال قاعدة البيانات المحلية الحالية؟`;
        if (confirm(summaryMsg)) {
          if (restoredSettings) {
            setLocalSettings(restoredSettings);
            setSettings(restoredSettings);
            localStorage.setItem('lamsa_settings_v1', JSON.stringify(restoredSettings));
          }
          if (restoredBottleSizes) {
            setBottleSizes(restoredBottleSizes);
            localStorage.setItem('lamsa_bottle_sizes_v2', JSON.stringify(restoredBottleSizes));
          }
          if (restoredProducts) {
            localStorage.setItem('lamsa_products', JSON.stringify(restoredProducts));
          }
          if (restoredSales) {
            localStorage.setItem('lamsa_sales', JSON.stringify(restoredSales));
          }
          if (restoredExpenses) {
            localStorage.setItem('lamsa_expenses_v2', JSON.stringify(restoredExpenses));
          }
          if (restoredVaults) {
            localStorage.setItem('lamsa_vaults_v2', JSON.stringify(restoredVaults));
          }
          if (restoredWithdrawals) {
            localStorage.setItem('lamsa_withdrawals_v2', JSON.stringify(restoredWithdrawals));
          }

          soundAlertService.playGoalChime();
          setToastMessage('✅ تم استعادة قاعدة البيانات المحلية بالكامل وتحديث النظام بنجاح!');
          setIsSavedToast(true);

          setTimeout(() => {
            window.location.reload();
          }, 1200);
        }
      } catch (err) {
        console.error('Failed to parse backup JSON:', err);
        alert('حدث خطأ أثناء قراءة ملف النسخة الاحتياطية. يرجى التأكد من اختيار ملف JSON صحيح.');
      }
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    };

    reader.readAsText(file);
  };

  // Export JSON Backup file
  const handleExportBackup = () => {
    const backupData = {
      version: '2.5',
      exportDate: new Date().toISOString(),
      storeName: localSettings.storeName,
      settings: localSettings,
      bottleSizes,
      productsCount: products.length,
      salesCount: sales.length,
      expensesCount: expenses.length,
      products,
      sales,
      expenses,
      vaults,
      withdrawals
    };

    const blob = new Blob([JSON.stringify(backupData, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `lamsa_backup_${new Date().toISOString().slice(0, 10)}.json`;
    link.click();
    URL.revokeObjectURL(url);

    setToastMessage('تم تنزيل النسخة الاحتياطية الشاملة بصيغة JSON.');
    setIsSavedToast(true);
    setTimeout(() => setIsSavedToast(false), 2500);
  };

  return (
    <div className="p-3 sm:p-6 lg:p-8 max-w-7xl mx-auto space-y-6 pb-12 animate-in fade-in duration-200">
      
      {/* ======================================================== */}
      {/* 1. TOP HEADER & INSTANT SAVE BAR                         */}
      {/* ======================================================== */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-4 border-b border-black/[0.06]">
        <div>
          <div className="flex items-center gap-2">
            <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 animate-pulse"></span>
            <span className="text-xs font-bold text-emerald-800 bg-emerald-50 px-2.5 py-0.5 rounded-full border border-emerald-200">
              مركز التحكم والإعدادات الشاملة (Unified Control Hub)
            </span>
          </div>
          <h1 className="text-2xl sm:text-3xl font-black text-[#1D1D1F] tracking-tight mt-1">
            إعدادات النظام والتحكم المؤسسي
          </h1>
          <p className="text-xs sm:text-sm text-[#86868B] mt-0.5">
            فهرس موحد لإدارة هوية المتجر، التسعير، الخزائن، موازنة الـ 15,000 ج.م، صلاحيات الموظفين، وسرية الإدارة.
          </p>
        </div>

        <div className="flex items-center gap-2.5">
          <span className="px-3 py-1.5 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-800 text-[11px] font-black flex items-center gap-1.5">
            <CheckCircle2 size={14} className="text-emerald-600" />
            <span>حفظ ذكي تلقائي نشط ✓</span>
          </span>

          <button
            type="button"
            onClick={handleResetDefaults}
            className="apple-btn flex items-center gap-1.5 px-3 py-2 rounded-xl bg-white border border-black/[0.08] text-xs font-semibold text-[#86868B] hover:text-[#1D1D1F] shadow-apple-sm transition-all"
            title="استعادة القيم الافتراضية"
          >
            <RotateCcw size={14} />
            <span>الافتراضيات</span>
          </button>

          <button
            type="button"
            onClick={() => handleSaveSettings()}
            className="apple-btn flex items-center gap-2 px-5 py-2.5 rounded-2xl bg-[#0071E3] hover:bg-[#0077ED] text-white text-xs font-bold shadow-apple-sm transition-all"
          >
            <Save size={15} />
            <span>تأكيد وتوثيق الآن</span>
          </button>
        </div>
      </div>

      {isSavedToast && (
        <div className="apple-glass rounded-2xl p-4 border border-emerald-300 bg-emerald-50 flex items-center gap-3 text-emerald-900 text-xs font-bold shadow-xs animate-in fade-in duration-200">
          <CheckCircle2 size={18} className="text-emerald-600 shrink-0" />
          <span>{toastMessage}</span>
        </div>
      )}

      {/* ======================================================== */}
      {/* 2. REAL OPERATIONAL KPIS & NUMBERS STRIP                */}
      {/* ======================================================== */}
      <div className="apple-glass rounded-3xl p-3.5 sm:p-4 border border-black/[0.08] shadow-apple-sm bg-gradient-to-r from-amber-500/5 via-white to-blue-500/5 space-y-2.5">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-2 border-b border-black/[0.06]">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-xl bg-amber-500/15 text-amber-700 flex items-center justify-center font-bold">
              <Crown size={16} />
            </div>
            <div>
              <h2 className="text-xs sm:text-sm font-black text-[#1D1D1F] flex items-center gap-2">
                <span>المؤشرات والأرقام التشغيلية المعتمدة لمتجر «لمسة عطر»</span>
                <span className="text-[10px] px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-800 font-bold font-mono">
                  معتمدة لحظياً
                </span>
              </h2>
              <span className="text-[11px] text-[#86868B]">
                {isOwner ? '👤 الحساب الحالي: د. محمد (المالك والمدير العام)' : '👤 الحساب الحالي: الكاشير ومسؤول التشغيل'}
              </span>
            </div>
          </div>
          <div className="text-[11px] text-gray-500 font-medium text-right sm:text-left">
            التعديل المباشر ينعكس تلقائياً على منظومة الكاشير والفواتير وحسابات الأرباح
          </div>
        </div>

        {/* 6 Real Numbers KPI Cards */}
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2 text-right">
          {/* Card 1 */}
          <div className="p-2.5 rounded-2xl bg-white border border-black/[0.06] shadow-2xs">
            <span className="text-[10.5px] text-[#86868B] block font-bold">🧴 زيت عادي:</span>
            <div className="font-mono text-sm sm:text-base font-black text-[#0071E3] mt-0.5">
              {localSettings.priceEssenceNormal} <span className="text-[10px] text-gray-500 font-sans font-normal">ج/جم</span>
            </div>
            <span className="text-[9.5px] text-gray-400 block mt-0.5">تكلفة الجرام</span>
          </div>

          {/* Card 2 */}
          <div className="p-2.5 rounded-2xl bg-white border border-teal-200/80 shadow-2xs">
            <span className="text-[10.5px] text-teal-800 block font-bold">🌿 زيت النيش:</span>
            <div className="font-mono text-sm sm:text-base font-black text-teal-700 mt-0.5">
              {localSettings.priceEssenceNiche ?? 15} <span className="text-[10px] text-gray-500 font-sans font-normal">ج/جم</span>
            </div>
            <span className="text-[9.5px] text-teal-600 block mt-0.5">+5ج عن العادي</span>
          </div>

          {/* Card 3 */}
          <div className="p-2.5 rounded-2xl bg-white border border-amber-200/80 shadow-2xs">
            <span className="text-[10.5px] text-amber-800 block font-bold">🟤 عود ومسك:</span>
            <div className="font-mono text-sm sm:text-base font-black text-amber-700 mt-0.5">
              {localSettings.priceEssenceSpecial ?? 20} <span className="text-[10px] text-gray-500 font-sans font-normal">ج/جم</span>
            </div>
            <span className="text-[9.5px] text-amber-600 block mt-0.5">+10ج عن العادي</span>
          </div>

          {/* Card 4 */}
          <div className="p-2.5 rounded-2xl bg-white border border-emerald-200/80 shadow-2xs">
            <span className="text-[10.5px] text-emerald-800 block font-bold">💰 عمولة الكادر:</span>
            <div className="font-mono text-sm sm:text-base font-black text-emerald-700 mt-0.5">
              {(localSettings.commissionRate * 100).toFixed(0)}% <span className="text-[10px] text-emerald-600 font-sans font-bold">/ {(localSettings.tieredCommissionRate * 100).toFixed(0)}%</span>
            </div>
            <span className="text-[9.5px] text-emerald-600 block mt-0.5">أساسي / فائض</span>
          </div>

          {/* Card 5 */}
          <div className="p-2.5 rounded-2xl bg-white border border-blue-200/80 shadow-2xs">
            <span className="text-[10.5px] text-blue-800 block font-bold">🎯 موازنة 15k:</span>
            <div className="font-mono text-sm sm:text-base font-black text-[#0071E3] mt-0.5">
              {localSettings.monthlyFixedBudget?.toLocaleString('ar-EG')} <span className="text-[10px] text-gray-500 font-sans font-normal">ج</span>
            </div>
            <span className="text-[9.5px] text-blue-600 block mt-0.5">شهري معتمد</span>
          </div>

          {/* Card 6 */}
          <div className="p-2.5 rounded-2xl bg-white border border-purple-200/80 shadow-2xs">
            <span className="text-[10.5px] text-purple-800 block font-bold">📈 تارجت يومي:</span>
            <div className="font-mono text-sm sm:text-base font-black text-purple-700 mt-0.5">
              {localSettings.dailyTargetProfit?.toLocaleString('ar-EG')} <span className="text-[10px] text-gray-500 font-sans font-normal">ج</span>
            </div>
            <span className="text-[9.5px] text-purple-600 block mt-0.5">مرحلة 600ج</span>
          </div>
        </div>
      </div>

      {/* ======================================================== */}
      {/* 3. MASTER HORIZONTAL SEGMENTED NAVIGATION DOCK           */}
      {/* ======================================================== */}
      <div className="apple-glass rounded-2xl p-1.5 border border-black/[0.08] shadow-apple-xs">
        <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar scroll-smooth">
          {[
            { id: 'pricing', label: '🏷️ التسعير وتكلفة الخامات والعبوات', badge: 'أسعار', icon: DollarSign },
            { id: 'commission_policies', label: '💰 سياسات العمولات والحوافز والتارجت', badge: '5% - 7%', icon: Award },
            { id: 'budget_management', label: '🎯 الموازنة المعتمدة (15,000 ج) والخزائن', badge: '15k', icon: Target },
            { id: 'system_settings', label: '🏬 الهوية والفواتير والطباعة', badge: 'النظام', icon: Sliders },
            { id: 'staff_management', label: '👥 إدارة الموظفين والصلاحيات (RBAC)', badge: 'الكادر', icon: Users },
            { id: 'audit_log', label: '📜 سجل التدقيق والرقابة وتتبع الأسعار', badge: 'الأمان', icon: History },
          ].map((tab) => {
            const Icon = tab.icon;
            const isTabActive = 
              activeSection === tab.id ||
              (tab.id === 'budget_management' && (activeSection === 'budget' || activeSection === 'vaults')) ||
              (tab.id === 'system_settings' && ['identity', 'privacy', 'pos_receipts', 'inventory', 'security_backup', 'themes', 'dashboard_layout', 'loyalty_ai'].includes(activeSection));

            return (
              <button
                key={tab.id}
                type="button"
                onClick={() => setActiveSection(tab.id as SettingsSection)}
                className={`px-3.5 py-2.5 rounded-xl text-xs font-black whitespace-nowrap flex items-center gap-2 transition-all cursor-pointer shrink-0 ${
                  isTabActive
                    ? 'bg-[#1D1D1F] text-white shadow-apple-sm scale-[1.01]'
                    : 'text-[#505055] hover:text-[#1D1D1F] hover:bg-black/[0.04]'
                }`}
              >
                <Icon size={14} className={isTabActive ? 'text-amber-400' : 'text-[#86868B]'} />
                <span>{tab.label}</span>
                <span className={`text-[10px] px-1.5 py-0.2 rounded-full font-mono ${
                  isTabActive ? 'bg-white/20 text-white' : 'bg-black/[0.05] text-gray-600'
                }`}>
                  {tab.badge}
                </span>
              </button>
            );
          })}
        </div>
      </div>

      {/* ======================================================== */}
      {/* 4. ACTIVE SETTINGS VIEWPORT (FULL-WIDTH COMFORT)          */}
      {/* ======================================================== */}
      <div className="space-y-6 w-full" data-active-section="true">

          {/* ======================================================== */}
          {/* SECTION 1: STAFF MANAGEMENT & RBAC PERMISSIONS           */}
          {/* ======================================================== */}
          {activeSection === 'staff_management' && (
            <div className="space-y-5 animate-in fade-in duration-150">
              <UsersManagement
                users={users}
                currentUser={currentUser || null}
                onSaveUser={onSaveAppUser || (() => {})}
                onAddAuditLog={onAddAuditLog || (() => {})}
                onPreviewUserPermissions={onPreviewUserPermissions}
              />
            </div>
          )}

          {/* ======================================================== */}
          {/* SECTION 2: COMMISSION POLICIES & STAFF INCENTIVES        */}
          {/* ======================================================== */}
          {activeSection === 'commission_policies' && (
            <div className="apple-glass rounded-3xl p-5 sm:p-7 border border-black/[0.06] shadow-apple-card space-y-6 animate-in fade-in duration-150">
              <div className="pb-4 border-b border-black/[0.06] flex items-center justify-between">
                <div>
                  <h2 className="text-lg font-black text-[#1D1D1F] flex items-center gap-2">
                    <span>سياسات العمولات والحوافز وربط المبيعات</span>
                    <span className="text-[10px] px-2.5 py-0.5 rounded-full bg-emerald-500/10 text-emerald-800 border border-emerald-500/20 font-bold">
                      حوكمة الأداء المالي
                    </span>
                  </h2>
                  <p className="text-xs text-[#86868B] mt-0.5">
                    حوكمة عمولة الـ 5% الأساسية لكادر العمل، والـ 7% لشريحة الفائض بعد التارجت، واحتياطي الحوافز (500 ج.م).
                  </p>
                </div>
                <div className="w-10 h-10 rounded-2xl bg-emerald-500/10 text-emerald-700 flex items-center justify-center font-bold">
                  <Award size={20} />
                </div>
              </div>

              {/* 4 Core Configuration Cards */}
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 text-xs">
                {/* 1. Base Commission Rate */}
                <div className="p-4 rounded-2xl bg-white border border-black/[0.08] space-y-2 text-right">
                  <span className="text-[#86868B] text-[11px] block font-bold">نسبة العمولة الأساسية:</span>
                  <div className="flex items-center gap-1.5">
                    <input
                      type="number"
                      step="0.01"
                      value={localSettings.commissionRate}
                      onChange={(e) => setLocalSettings({ ...localSettings, commissionRate: Number(e.target.value) || 0 })}
                      className="w-full h-9 px-2 rounded-xl bg-black/[0.02] border border-black/[0.08] font-mono text-sm font-bold text-center outline-none"
                    />
                    <span className="font-bold text-[#1D1D1F]">%</span>
                  </div>
                  <div className="flex items-center gap-1 justify-center pt-0.5">
                    {[0.03, 0.05, 0.07, 0.10].map(rate => (
                      <button
                        key={rate}
                        type="button"
                        onClick={() => setLocalSettings({ ...localSettings, commissionRate: rate })}
                        className={`px-1.5 py-0.5 rounded text-[10px] font-bold ${
                          localSettings.commissionRate === rate
                            ? 'bg-emerald-600 text-white'
                            : 'bg-black/[0.04] text-[#86868B] hover:text-[#1D1D1F]'
                        }`}
                      >
                        {rate * 100}%
                      </button>
                    ))}
                  </div>
                  <span className="text-[10px] text-emerald-800 font-bold block text-center">
                    تطبق على كافة المبيعات اليومية
                  </span>
                </div>

                {/* 2. Tiered Surplus Rate */}
                <div className="p-4 rounded-2xl bg-white border border-black/[0.08] space-y-2 text-right">
                  <span className="text-[#86868B] text-[11px] block font-bold">نسبة شريحة الفائض:</span>
                  <div className="flex items-center gap-1.5">
                    <input
                      type="number"
                      step="0.01"
                      value={localSettings.tieredCommissionRate}
                      onChange={(e) => setLocalSettings({ ...localSettings, tieredCommissionRate: Number(e.target.value) || 0 })}
                      className="w-full h-9 px-2 rounded-xl bg-black/[0.02] border border-black/[0.08] font-mono text-sm font-bold text-center outline-none"
                    />
                    <span className="font-bold text-[#1D1D1F]">%</span>
                  </div>
                  <div className="flex items-center gap-1 justify-center pt-0.5">
                    {[0.05, 0.07, 0.08, 0.10].map(rate => (
                      <button
                        key={rate}
                        type="button"
                        onClick={() => setLocalSettings({ ...localSettings, tieredCommissionRate: rate })}
                        className={`px-1.5 py-0.5 rounded text-[10px] font-bold ${
                          localSettings.tieredCommissionRate === rate
                            ? 'bg-emerald-600 text-white'
                            : 'bg-black/[0.04] text-[#86868B] hover:text-[#1D1D1F]'
                        }`}
                      >
                        {rate * 100}%
                      </button>
                    ))}
                  </div>
                  <span className="text-[10px] text-blue-800 font-bold block text-center">
                    تطبق على ما بعد الـ 10 عبوات
                  </span>
                </div>

                {/* 3. Bottle Target Threshold */}
                <div className="p-4 rounded-2xl bg-white border border-black/[0.08] space-y-2 text-right">
                  <span className="text-[#86868B] text-[11px] block font-bold">شريحة العبوات المستهدفة:</span>
                  <div className="flex items-center gap-1.5">
                    <input
                      type="number"
                      value={localSettings.targetBottlesPerDay || 10}
                      onChange={(e) => setLocalSettings({ ...localSettings, targetBottlesPerDay: Number(e.target.value) || 10 })}
                      className="w-full h-9 px-2 rounded-xl bg-black/[0.02] border border-black/[0.08] font-mono text-sm font-bold text-center outline-none"
                    />
                    <span className="font-bold text-[#1D1D1F]">عبوة/يوم</span>
                  </div>
                  <span className="text-[10px] text-purple-800 font-bold block text-center pt-1">
                    تفعيل نسبة الـ 7% التلقائية
                  </span>
                </div>

                {/* 4. Incentive Reserve */}
                <div className="p-4 rounded-2xl bg-white border border-black/[0.08] space-y-2 text-right">
                  <span className="text-[#86868B] text-[11px] block font-bold">احتياطي الحوافز المعتمد:</span>
                  <div className="flex items-center gap-1.5">
                    <input
                      type="number"
                      value={localSettings.bonusPoolMonthlyReserve || 500}
                      onChange={(e) => setLocalSettings({ ...localSettings, bonusPoolMonthlyReserve: Number(e.target.value) || 500 })}
                      className="w-full h-9 px-2 rounded-xl bg-black/[0.02] border border-black/[0.08] font-mono text-sm font-bold text-center outline-none"
                    />
                    <span className="font-bold text-[#1D1D1F]">ج.م</span>
                  </div>
                  <span className="text-[10px] text-amber-800 font-bold block text-center pt-1">
                    مخصص أمان تشغيلي وحوافز
                  </span>
                </div>
              </div>

              {/* Live Interactive Commission Simulator */}
              <div className="p-4 sm:p-5 rounded-2xl bg-gradient-to-br from-emerald-500/10 via-emerald-500/5 to-transparent border border-emerald-500/20 space-y-4">
                <div className="flex items-center justify-between pb-2 border-b border-emerald-500/15">
                  <div className="flex items-center gap-2">
                    <Zap size={16} className="text-emerald-600" />
                    <span className="font-black text-xs text-emerald-950">
                      محاكي واختبار حساب العمولات التفاعلي المباشر:
                    </span>
                  </div>
                  <span className="text-[10.5px] font-bold text-emerald-700">نتائج فورية وفق مدخلاتك الحالية</span>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs">
                  <div className="space-y-1">
                    <label className="text-[11px] font-bold text-[#48484A] block">عدد العبوات المباعة للتجربة ({simSoldBottles} عبوة):</label>
                    <input
                      type="range"
                      min={1}
                      max={30}
                      value={simSoldBottles}
                      onChange={(e) => setSimSoldBottles(Number(e.target.value))}
                      className="w-full accent-emerald-600 cursor-pointer"
                    />
                    <div className="flex justify-between text-[10px] text-gray-500 font-mono">
                      <span>1 عبوة</span>
                      <span className="font-bold text-emerald-700">الهدف: {localSettings.targetBottlesPerDay || 10}</span>
                      <span>30 عبوة</span>
                    </div>
                  </div>

                  <div className="space-y-1">
                    <label className="text-[11px] font-bold text-[#48484A] block">متوسط سعر بيع العبوة ({simAvgBottlePrice} ج):</label>
                    <input
                      type="range"
                      min={50}
                      max={350}
                      step={10}
                      value={simAvgBottlePrice}
                      onChange={(e) => setSimAvgBottlePrice(Number(e.target.value))}
                      className="w-full accent-emerald-600 cursor-pointer"
                    />
                    <div className="flex justify-between text-[10px] text-gray-500 font-mono">
                      <span>50 ج</span>
                      <span>200 ج</span>
                      <span>350 ج</span>
                    </div>
                  </div>
                </div>

                {/* Calculation Output Cards */}
                {(() => {
                  const targetBottles = localSettings.targetBottlesPerDay || 10;
                  const baseRate = localSettings.commissionRate || 0.05;
                  const surplusRate = localSettings.tieredCommissionRate || 0.07;
                  const totalSimRevenue = simSoldBottles * simAvgBottlePrice;
                  
                  const baseBottles = Math.min(simSoldBottles, targetBottles);
                  const surplusBottles = Math.max(0, simSoldBottles - targetBottles);
                  
                  const baseCommission = Math.round(baseBottles * simAvgBottlePrice * baseRate);
                  const surplusCommission = Math.round(surplusBottles * simAvgBottlePrice * surplusRate);
                  const totalCommission = baseCommission + surplusCommission;
                  const netStoreShare = totalSimRevenue - totalCommission;

                  return (
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 pt-1 text-center">
                      <div className="p-3 rounded-xl bg-white border border-black/[0.06] shadow-2xs">
                        <span className="text-[10px] text-gray-500 block font-bold">إجمالي المبيعات</span>
                        <span className="text-sm font-black font-mono text-[#1D1D1F] block mt-0.5">
                          {totalSimRevenue.toLocaleString('ar-EG')} ج
                        </span>
                        <span className="text-[9.5px] text-gray-400 font-mono">{simSoldBottles} عبوة</span>
                      </div>

                      <div className="p-3 rounded-xl bg-white border border-black/[0.06] shadow-2xs">
                        <span className="text-[10px] text-emerald-700 block font-bold">عمولة الأساس ({baseRate * 100}%)</span>
                        <span className="text-sm font-black font-mono text-emerald-700 block mt-0.5">
                          {baseCommission.toLocaleString('ar-EG')} ج
                        </span>
                        <span className="text-[9.5px] text-gray-400 font-mono">على أول {baseBottles} عبوة</span>
                      </div>

                      <div className="p-3 rounded-xl bg-white border border-black/[0.06] shadow-2xs">
                        <span className="text-[10px] text-blue-700 block font-bold">عمولة الفائض ({surplusRate * 100}%)</span>
                        <span className="text-sm font-black font-mono text-blue-700 block mt-0.5">
                          {surplusCommission.toLocaleString('ar-EG')} ج
                        </span>
                        <span className="text-[9.5px] text-gray-400 font-mono">على {surplusBottles} عبوة إضافية</span>
                      </div>

                      <div className="p-3 rounded-xl bg-emerald-600 text-white shadow-2xs">
                        <span className="text-[10px] text-emerald-100 block font-bold">مستحق الكادر الإجمالي</span>
                        <span className="text-sm font-black font-mono text-white block mt-0.5">
                          {totalCommission.toLocaleString('ar-EG')} ج
                        </span>
                        <span className="text-[9.5px] text-emerald-200 font-mono">صافي المتجر: {netStoreShare.toLocaleString('ar-EG')} ج</span>
                      </div>
                    </div>
                  );
                })()}
              </div>

              {/* Action Bar */}
              <div className="flex items-center justify-between pt-2 border-t border-black/[0.06]">
                <span className="text-[11px] text-[#86868B]">
                  يتم حفظ هذه السياسات وتطبيقها فوراً على حسابات الكاشير ومسير عمولات طارق
                </span>
                <button
                  type="button"
                  onClick={() => {
                    handleSaveSettings();
                    if (onAddAuditLog) {
                      onAddAuditLog({
                        id: `audit-comm-${Date.now()}`,
                        timestamp: new Date().toISOString(),
                        user: currentUser?.displayName || 'المدير العام',
                        action: 'تحديث سياسات العمولات',
                        entityType: 'setting',
                        entityId: 'commission_policies',
                        entityName: 'نسب العمولات والتارجت',
                        oldValue: { commissionRate: settings.commissionRate, tieredCommissionRate: settings.tieredCommissionRate },
                        newValue: { commissionRate: localSettings.commissionRate, tieredCommissionRate: localSettings.tieredCommissionRate },
                        reason: 'تحديث معتمد لسياسة العمولات والحوافز'
                      });
                    }
                  }}
                  className="apple-btn flex items-center gap-2 px-5 py-2.5 rounded-2xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold shadow-apple-xs transition-all cursor-pointer"
                >
                  <Check size={14} />
                  <span>تأكيد وحفظ سياسات العمولات</span>
                </button>
              </div>
            </div>
          )}

          {/* ======================================================== */}
          {/* SECTION 5: AUDIT LOG & OPERATION TRACKING                */}
          {/* ======================================================== */}
          {activeSection === 'audit_log' && (
            <div className="space-y-5 animate-in fade-in duration-150">
              <AuditLogViewer
                logs={auditLogs}
                sales={sales}
                products={products}
                bottleSizes={bottleSizes}
                settings={localSettings}
                currentUser={currentUser}
                onUpdateSale={onUpdateSale}
                onAddAuditLog={onAddAuditLog}
              />
            </div>
          )}

          {/* ======================================================== */}
          {/* SYSTEM SETTINGS SUB-TABS NAVIGATION BAR                  */}
          {/* ======================================================== */}
          {(activeSection === 'system_settings' || ['identity', 'pricing', 'privacy', 'pos_receipts', 'inventory', 'security_backup', 'themes', 'dashboard_layout', 'loyalty_ai'].includes(activeSection)) && (
            <div className="apple-glass rounded-2xl p-2 border border-black/[0.06] shadow-apple-xs">
              <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar scroll-smooth">
                {[
                  { id: 'identity', label: '🏬 الهوية والفرع', icon: Store },
                  { id: 'pos_receipts', label: '🧾 الفواتير والطباعة', icon: Receipt },
                  { id: 'pricing', label: '🏷️ التسعير والعبوات', icon: DollarSign },
                  { id: 'inventory', label: '🧪 تكلفة الخامات', icon: Package },
                  { id: 'security_backup', label: '🔒 الأمان والنسخ', icon: Lock },
                  { id: 'themes', label: '🎨 استوديو الثيمات', icon: Palette },
                  { id: 'loyalty_ai', label: '🤖 محرك الولاء والذكاء', icon: Sparkles },
                  { id: 'dashboard_layout', label: '📊 تخصيص لوحة القيادة', icon: Sliders },
                ].map(sub => {
                  const SubIcon = sub.icon;
                  const isSubActive = systemSubTab === sub.id || activeSection === sub.id;
                  return (
                    <button
                      key={sub.id}
                      type="button"
                      onClick={() => {
                        setActiveSection('system_settings');
                        setSystemSubTab(sub.id as any);
                      }}
                      className={`px-3 py-2 rounded-xl text-xs font-bold whitespace-nowrap flex items-center gap-1.5 transition-all cursor-pointer shrink-0 ${
                        isSubActive
                          ? 'bg-[#1D1D1F] text-white shadow-apple-xs'
                          : 'text-[#636366] hover:bg-black/[0.04] hover:text-[#1D1D1F]'
                      }`}
                    >
                      <SubIcon size={13} />
                      <span>{sub.label}</span>
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {/* ======================================================== */}
          {/* SECTION: OWNER DASHBOARD CARDS & REPORTS CUSTOMIZATION   */}
          {/* ======================================================== */}
          {((activeSection === 'system_settings' && systemSubTab === 'dashboard_layout') || activeSection === 'dashboard_layout') && (
            <div className="animate-in fade-in duration-150">
              <DashboardLayoutStudioPanel
                settings={localSettings}
                currentUser={currentUser}
                onUpdateSettings={(updater) => {
                  setLocalSettings((prev) => {
                    const next = updater(prev);
                    setSettings(next);
                    return next;
                  });
                }}
                onNotify={(msg) => {
                  setToastMessage(`📊 ${msg}`);
                  setIsSavedToast(true);
                  setTimeout(() => setIsSavedToast(false), 3000);
                }}
                onNavigateToDashboard={
                  onNavigate ? () => onNavigate(View.DASHBOARD) : undefined
                }
              />
            </div>
          )}

          {/* ======================================================== */}
          {/* SECTION: APPLE DYNAMIC THEMES & ATMOSPHERE STUDIO        */}
          {/* ======================================================== */}
          {((activeSection === 'system_settings' && systemSubTab === 'themes') || activeSection === 'themes') && (
            <div className="apple-glass rounded-3xl p-5 sm:p-7 border border-black/[0.06] shadow-apple-card animate-in fade-in duration-150">
              <AppleThemeStudioPanel
                settings={localSettings}
                onUpdateSettings={(updater) => {
                  setLocalSettings((prev) => {
                    const next = updater(prev);
                    setSettings(next);
                    return next;
                  });
                }}
                onNotify={(title) => {
                  setToastMessage(`🎨 ${title}`);
                  setIsSavedToast(true);
                  setTimeout(() => setIsSavedToast(false), 3000);
                }}
              />
            </div>
          )}

          {/* ======================================================== */}
          {/* SECTION 0: SMART LOYALTY ENGINE & AI PROFIT GOVERNANCE   */}
          {/* ======================================================== */}
          {((activeSection === 'system_settings' && systemSubTab === 'loyalty_ai') || activeSection === 'loyalty_ai') && (
            <div className="space-y-5 animate-in fade-in duration-150">
              {/* 1. Master Loyalty Engine Control & AI Autopilot Card */}
              <div className="apple-glass rounded-3xl p-5 sm:p-7 border border-black/[0.06] shadow-apple-card space-y-5">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-black/[0.06]">
                  <div className="flex items-start gap-3.5">
                    <div className={`w-12 h-12 rounded-2xl flex items-center justify-center shrink-0 shadow-sm ${
                      localSettings.loyaltyEnabled !== false
                        ? 'bg-gradient-to-tr from-[#1D1D1F] to-[#3A3A3C] text-amber-400'
                        : 'bg-black/[0.06] text-[#86868B]'
                    }`}>
                      <Crown size={24} className={localSettings.loyaltyEnabled !== false ? 'fill-amber-400/20' : ''} />
                    </div>
                    <div>
                      <div className="flex flex-wrap items-center gap-2">
                        <h2 className="text-lg sm:text-xl font-black text-[#1D1D1F]">
                          محرك نقاط الولاء والإدارة الذكية بالذكاء الاصطناعي
                        </h2>
                        <span className={`text-[11px] font-bold px-2.5 py-0.5 rounded-full ${
                          localSettings.loyaltyEnabled !== false
                            ? 'bg-emerald-100 text-emerald-800'
                            : 'bg-rose-100 text-rose-800'
                        }`}>
                          {localSettings.loyaltyEnabled !== false ? '● مفعّل ونشط في الكاشير' : '○ متوقف مؤقتاً'}
                        </span>
                      </div>
                      <p className="text-xs text-[#86868B] mt-1 leading-relaxed">
                        تحكم كامل في تفعيل أو إيقاف نقاط الولاء، مع معادلة حماية صارمة تضمن عدم تأثر صافي ربح المتجر أو نقطة التعادل اليومية (600 ج.م) على حساب إرضاء العميل.
                      </p>
                    </div>
                  </div>

                  {/* Instant Master Toggle Button */}
                  <button
                    type="button"
                    onClick={() => {
                      const nextEnabled = localSettings.loyaltyEnabled === false ? true : false;
                      const updated = { ...localSettings, loyaltyEnabled: nextEnabled };
                      setLocalSettings(updated);
                      setSettings(updated);
                      setToastMessage(
                        nextEnabled
                          ? '✅ تم تفعيل محرك نقاط الولاء في الكاشير وسجل العملاء فوراً'
                          : '⏸️ تم إيقاف احتساب واستبدال نقاط الولاء مؤقتاً'
                      );
                      setIsSavedToast(true);
                      setTimeout(() => setIsSavedToast(false), 3000);
                    }}
                    className={`apple-btn px-4 py-2.5 rounded-2xl text-xs font-black flex items-center gap-2 shrink-0 shadow-xs transition-all cursor-pointer ${
                      localSettings.loyaltyEnabled !== false
                        ? 'bg-emerald-600 hover:bg-emerald-700 text-white'
                        : 'bg-rose-600 hover:bg-rose-700 text-white'
                    }`}
                  >
                    <Power size={15} />
                    <span>{localSettings.loyaltyEnabled !== false ? 'مفعّل — اضغط للإيقاف المؤقت' : 'متوقف — اضغط لتفعيل النظام'}</span>
                  </button>
                </div>

                {/* Master Smart Switches Row */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
                  {/* Switch 1: AI Autopilot */}
                  <div className="p-4 rounded-2xl bg-gradient-to-br from-amber-50/70 via-white to-blue-50/40 border border-amber-300/60 flex items-center justify-between gap-3">
                    <div className="space-y-0.5">
                      <div className="flex items-center gap-1.5 font-black text-[#1D1D1F]">
                        <Sparkles size={14} className="text-[#0071E3]" />
                        <span>الإدارة الذكية الكاملة بالذكاء الاصطناعي (AI Autopilot)</span>
                      </div>
                      <p className="text-[11px] text-[#636366] leading-relaxed">
                        يضبط سقف استبدال النقاط تلقائياً حسب مبيعات اليوم وحالة المتجر لحماية صافي الربح.
                      </p>
                    </div>
                    <label className="relative inline-flex items-center cursor-pointer shrink-0">
                      <input
                        type="checkbox"
                        checked={localSettings.loyaltyAutoAI !== false}
                        onChange={(e) => {
                          const updated = { ...localSettings, loyaltyAutoAI: e.target.checked };
                          setLocalSettings(updated);
                          setSettings(updated);
                        }}
                        className="sr-only peer"
                      />
                      <div className="w-11 h-6 bg-gray-200 rounded-full peer peer-checked:after:translate-x-full rtl:peer-checked:after:-translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:start-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-[#0071E3]"></div>
                    </label>
                  </div>

                  {/* Switch 2: Break-Even 600 EGP Protection */}
                  <div className="p-4 rounded-2xl bg-white border border-black/[0.08] flex items-center justify-between gap-3">
                    <div className="space-y-0.5">
                      <div className="flex items-center gap-1.5 font-black text-[#1D1D1F]">
                        <ShieldCheck size={14} className="text-emerald-600" />
                        <span>درع حماية نقطة التعادل اليومية (600 ج.م)</span>
                      </div>
                      <p className="text-[11px] text-[#636366] leading-relaxed">
                        يمنع الخصومات الكبيرة بالنقاط قبل تغطية مصاريف اليوم الثابتة (600 ج.م) لضمان عدم تضرر المتجر.
                      </p>
                    </div>
                    <label className="relative inline-flex items-center cursor-pointer shrink-0">
                      <input
                        type="checkbox"
                        checked={localSettings.loyaltyProtectBreakEven !== false}
                        onChange={(e) => {
                          const updated = { ...localSettings, loyaltyProtectBreakEven: e.target.checked };
                          setLocalSettings(updated);
                          setSettings(updated);
                        }}
                        className="sr-only peer"
                      />
                      <div className="w-11 h-6 bg-gray-200 rounded-full peer peer-checked:after:translate-x-full rtl:peer-checked:after:-translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:start-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-emerald-600"></div>
                    </label>
                  </div>
                </div>
              </div>

              {/* 2. AI Smart Analysis & Store Profit Alignment Panel */}
              <div className="rounded-3xl p-5 sm:p-7 bg-gradient-to-br from-[#1D1D1F] via-[#25221B] to-[#1D1D1F] text-white border border-[#C49746]/40 shadow-apple-lg space-y-5">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-4 border-b border-white/10">
                  <div className="flex items-center gap-3">
                    <div className="w-11 h-11 rounded-2xl bg-gradient-to-tr from-[#C49746] to-amber-300 text-[#1D1D1F] flex items-center justify-center font-black shadow-sm shrink-0">
                      <Sparkles size={20} />
                    </div>
                    <div>
                      <div className="flex flex-wrap items-center gap-2">
                        <h3 className="text-sm sm:text-base font-black text-white">
                          التحليل الذكي بالذكاء الاصطناعي وتوافق ربحية المتجر
                        </h3>
                        <span className="text-[11px] font-mono font-bold text-amber-300">
                          · Gemini 3.8 Flash
                        </span>
                      </div>
                      <p className="text-[11px] text-zinc-300 mt-0.5">
                        دراسة لحظية لبيانات المبيعات، هوامش الربح، وأرصدة نقاط العملاء لمنع أي تآكل في الأرباح
                      </p>
                    </div>
                  </div>

                  <div className="flex items-center gap-2 self-end sm:self-auto">
                    {loyaltyAiReport && (
                      <div className="px-3 py-1.5 rounded-xl bg-emerald-500/20 border border-emerald-400/30 text-emerald-300 text-xs font-black">
                        مؤشر الأمان الربحي: {loyaltyAiReport.healthScore}%
                      </div>
                    )}
                    <button
                      type="button"
                      onClick={() => runLoyaltyAiAnalysis()}
                      disabled={isAnalyzingLoyaltyAi}
                      className="apple-btn p-2.5 rounded-xl bg-white/10 hover:bg-white/20 text-white border border-white/10 cursor-pointer"
                      title="إعادة فحص وتحليل بيانات المبيعات والولاء"
                    >
                      <RefreshCw size={15} className={isAnalyzingLoyaltyAi ? 'animate-spin text-amber-400' : ''} />
                    </button>
                  </div>
                </div>

                {/* Live Financial Alignment Telemetry */}
                {loyaltyAiReport && (
                  <>
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
                      <div className="p-3.5 rounded-2xl bg-white/[0.06] border border-white/10 space-y-1">
                        <span className="text-[10px] text-zinc-400 block">نسبة خصم الولاء من مجمل الربح</span>
                        <span className="text-xl font-black font-mono text-emerald-400 block">
                          {loyaltyAiReport.metrics.discountToGrossProfitRatioPercent}%
                        </span>
                        <span className="text-[10px] text-zinc-300 block">
                          إجمالي خصومات الولاء: {loyaltyAiReport.metrics.totalLoyaltyDiscountsGrantedEgp} ج
                        </span>
                      </div>

                      <div className="p-3.5 rounded-2xl bg-white/[0.06] border border-white/10 space-y-1">
                        <span className="text-[10px] text-zinc-400 block">الرصيد المتاح في محافظ العملاء</span>
                        <span className="text-xl font-black font-mono text-amber-300 block">
                          {loyaltyAiReport.metrics.unredeemedPointsBalance} نقطة
                        </span>
                        <span className="text-[10px] text-zinc-300 block">
                          قيمتها النقدية: {loyaltyAiReport.metrics.unredeemedCashLiabilityEgp} ج.م
                        </span>
                      </div>

                      <div className="p-3.5 rounded-2xl bg-white/[0.06] border border-white/10 space-y-1">
                        <span className="text-[10px] text-zinc-400 block">متوسط فاتورة عميل الولاء</span>
                        <span className="text-xl font-black font-mono text-white block">
                          {loyaltyAiReport.metrics.loyaltyAvgBasketEgp} ج.م
                        </span>
                        <span className="text-[10px] text-emerald-400 font-bold block">
                          +{loyaltyAiReport.metrics.basketUpliftPercent}% أعلى من العميل العابر
                        </span>
                      </div>

                      <div className="p-3.5 rounded-2xl bg-white/[0.06] border border-white/10 space-y-1">
                        <span className="text-[10px] text-zinc-400 block">حالة تعادل اليوم (600 ج.م)</span>
                        <span className={`text-base font-black block ${todayNetContribution >= 600 ? 'text-emerald-400' : 'text-amber-300'}`}>
                          {todayNetContribution >= 600 ? 'مغطى بالكامل ✓' : `محقق ${Math.round(todayNetContribution)} / 600 ج`}
                        </span>
                        <span className="text-[10px] text-zinc-300 block">
                          {todayNetContribution >= 600 ? 'يسمح بالمرونة الكاملة' : 'درع حماية الهامش نشط'}
                        </span>
                      </div>
                    </div>

                    {/* Executive AI Verdict & Profit Protection Report */}
                    <div className="p-4 rounded-2xl bg-white/[0.05] border border-white/10 space-y-2">
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-xs sm:text-sm font-black text-amber-300">
                          {loyaltyAiReport.statusTitle}
                        </span>
                        <span className="text-[10px] text-emerald-300 font-bold">
                          {loyaltyAiReport.profitSafetyStatus}
                        </span>
                      </div>
                      <p className="text-xs text-zinc-200 leading-relaxed">
                        {loyaltyAiReport.executiveSummary}
                      </p>
                      <div className="pt-2 border-t border-white/10 flex items-center gap-2 text-[11px] text-emerald-300 font-bold">
                        <ShieldCheck size={14} className="shrink-0" />
                        <span>{loyaltyAiReport.profitAlignmentReport}</span>
                      </div>
                    </div>

                    {/* 4 Studied AI Tactical Recommendations */}
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      {loyaltyAiReport.tacticalSuggestions.map((sug, i) => (
                        <div key={i} className="p-3.5 rounded-2xl bg-white/[0.04] border border-white/10 space-y-1.5">
                          <div className="flex items-center justify-between gap-2">
                            <span className="text-xs font-black text-white">{i + 1}. {sug.title}</span>
                          </div>
                          <p className="text-[11px] text-zinc-300 leading-relaxed">{sug.detail}</p>
                          <div className="text-[10px] font-bold text-amber-300 pt-0.5">
                            الأثر المتوقع: {sug.impact}
                          </div>
                        </div>
                      ))}
                    </div>

                    {/* One-Click Apply AI Optimal Settings Bar */}
                    <div className="p-4 rounded-2xl bg-gradient-to-r from-amber-500/20 via-[#C49746]/25 to-emerald-500/20 border border-amber-400/40 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                      <div className="space-y-0.5">
                        <span className="text-xs font-black text-amber-200 block">
                          توصية الذكاء الاصطناعي للإعدادات المثالية الآن:
                        </span>
                        <p className="text-[11px] text-zinc-200">
                          {loyaltyAiReport.recommendedSettings.reasoning}
                        </p>
                      </div>
                      <button
                        type="button"
                        onClick={handleApplyAiLoyaltyRecommendation}
                        className="apple-btn px-4 py-2.5 rounded-xl bg-gradient-to-r from-amber-400 to-[#C49746] hover:brightness-110 text-[#1D1D1F] text-xs font-black flex items-center justify-center gap-1.5 shrink-0 shadow-sm cursor-pointer"
                      >
                        <Sparkles size={14} />
                        <span>تطبيق الضبط الذكي الموصى به بضغطة زر</span>
                      </button>
                    </div>
                  </>
                )}
              </div>

              {/* 3. Three Studied AI Strategy Modes (One-Click Presets) */}
              <div className="apple-glass rounded-3xl p-5 sm:p-7 border border-black/[0.06] shadow-apple-card space-y-4">
                <div className="flex items-center justify-between">
                  <div>
                    <h3 className="text-base font-black text-[#1D1D1F]">
                      أوضاع السياسة الذكية لنقاط الولاء (اختر الوضع المناسب لحالة المتجر)
                    </h3>
                    <p className="text-xs text-[#86868B]">
                      كل وضع مضبوط رياضياً ليحقق التوازن بين إرضاء الزبون وحماية ربح المتجر وموازنة الـ 15,000 ج.م.
                    </p>
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs">
                  {/* Mode 1: Profit Shield */}
                  <button
                    type="button"
                    onClick={() => handleSelectLoyaltyStrategyPreset('profit_shield')}
                    className={`p-4 rounded-2xl border text-right transition-all space-y-2 cursor-pointer ${
                      localSettings.loyaltyStrategyMode === 'profit_shield'
                        ? 'bg-[#1D1D1F] text-white border-[#1D1D1F] shadow-md'
                        : 'bg-white hover:bg-black/[0.02] text-[#1D1D1F] border-black/[0.08]'
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <span className="font-black text-xs">🛡️ درع حماية الربح الصارم</span>
                      {localSettings.loyaltyStrategyMode === 'profit_shield' && (
                        <CheckCircle2 size={15} className="text-emerald-400" />
                      )}
                    </div>
                    <p className={`text-[11px] leading-relaxed ${
                      localSettings.loyaltyStrategyMode === 'profit_shield' ? 'text-zinc-300' : 'text-[#86868B]'
                    }`}>
                      مثالي قبل الوصول لنقطة التعادل (600 ج.م)؛ يمنح النقطة قيمة 0.50 ج.م ويحمي هامش ربح لا يقل عن 22 ج.م لكل فاتورة.
                    </p>
                    <div className={`text-[10px] font-mono font-bold pt-1 ${
                      localSettings.loyaltyStrategyMode === 'profit_shield' ? 'text-amber-300' : 'text-[#0071E3]'
                    }`}>
                      أقصى خصم: 18% · هامش محمي: +22 ج
                    </div>
                  </button>

                  {/* Mode 2: Smart Balanced (Recommended) */}
                  <button
                    type="button"
                    onClick={() => handleSelectLoyaltyStrategyPreset('balanced')}
                    className={`p-4 rounded-2xl border text-right transition-all space-y-2 cursor-pointer ${
                      (localSettings.loyaltyStrategyMode || 'balanced') === 'balanced'
                        ? 'bg-[#1D1D1F] text-white border-[#1D1D1F] shadow-md'
                        : 'bg-white hover:bg-black/[0.02] text-[#1D1D1F] border-black/[0.08]'
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <span className="font-black text-xs">⚖️ التوازن الذكي المعتمد</span>
                      {(localSettings.loyaltyStrategyMode || 'balanced') === 'balanced' && (
                        <CheckCircle2 size={15} className="text-emerald-400" />
                      )}
                    </div>
                    <p className={`text-[11px] leading-relaxed ${
                      (localSettings.loyaltyStrategyMode || 'balanced') === 'balanced' ? 'text-zinc-300' : 'text-[#86868B]'
                    }`}>
                      القاعدة المعتمدة (§47): كل 10 جنيه = 1 نقطة، و100 نقطة = 10 جنيه خصم (1% استرجاع) مع حماية حد المساهمة 10 ج.
                    </p>
                    <div className={`text-[10px] font-mono font-bold pt-1 ${
                      (localSettings.loyaltyStrategyMode || 'balanced') === 'balanced' ? 'text-amber-300' : 'text-[#0071E3]'
                    }`}>
                      100 نقطة = 10 ج · حد المساهمة: +10 ج
                    </div>
                  </button>

                  {/* Mode 3: VIP Growth */}
                  <button
                    type="button"
                    onClick={() => handleSelectLoyaltyStrategyPreset('growth_vip')}
                    className={`p-4 rounded-2xl border text-right transition-all space-y-2 cursor-pointer ${
                      localSettings.loyaltyStrategyMode === 'growth_vip'
                        ? 'bg-[#1D1D1F] text-white border-[#1D1D1F] shadow-md'
                        : 'bg-white hover:bg-black/[0.02] text-[#1D1D1F] border-black/[0.08]'
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <span className="font-black text-xs">🚀 تنشيط المبيعات وVIP</span>
                      {localSettings.loyaltyStrategyMode === 'growth_vip' && (
                        <CheckCircle2 size={15} className="text-emerald-400" />
                      )}
                    </div>
                    <p className={`text-[11px] leading-relaxed ${
                      localSettings.loyaltyStrategyMode === 'growth_vip' ? 'text-zinc-300' : 'text-[#86868B]'
                    }`}>
                      مثالي أيام الذروة وبعد تخطي التارجت لتحفيز شراء العبوات الكبيرة 50 مل و100 مل مع بقاء التكلفة والهامش محميين.
                    </p>
                    <div className={`text-[10px] font-mono font-bold pt-1 ${
                      localSettings.loyaltyStrategyMode === 'growth_vip' ? 'text-amber-300' : 'text-[#0071E3]'
                    }`}>
                      أقصى خصم: 30% · هامش محمي: +15 ج
                    </div>
                  </button>
                </div>
              </div>

              {/* 4. Granular Loyalty Parameters & Rules */}
              <div className="apple-glass rounded-3xl p-5 sm:p-7 border border-black/[0.06] shadow-apple-card space-y-5">
                <div className="flex items-center justify-between pb-3 border-b border-black/[0.06]">
                  <div>
                    <h3 className="text-base font-black text-[#1D1D1F]">
                      الضبط الدقيق لمعادلات اكتساب واستبدال النقاط وحماية الهامش
                    </h3>
                    <p className="text-xs text-[#86868B]">
                      تُطبق هذه المعادلات فوراً في شاشة الكاشير (`POS`) وسجل العملاء (`CRM`) والفواتير.
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => handleSaveSettings()}
                    className="apple-btn px-4 py-2 rounded-xl bg-[#0071E3] hover:bg-[#0077ED] text-white text-xs font-bold flex items-center gap-1.5 shadow-xs cursor-pointer"
                  >
                    <Save size={14} />
                    <span>اعتماد المعادلات</span>
                  </button>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3.5 text-xs">
                  {/* Parameter 1 */}
                  <div className="p-3.5 rounded-2xl bg-white border border-black/[0.08] space-y-1.5">
                    <label className="font-bold text-[#1D1D1F] block">معدل كسب النقاط من المبيعات:</label>
                    <div className="flex items-center gap-1.5">
                      <span className="text-[11px] text-[#86868B] shrink-0">1 نقطة لكل</span>
                      <input
                        type="number"
                        min={1}
                        value={localSettings.loyaltyPointsPerSpendEgp ?? 10}
                        onChange={(e) => setLocalSettings({ ...localSettings, loyaltyPointsPerSpendEgp: Math.max(1, Number(e.target.value) || 10) })}
                        className="w-full h-9 px-2 rounded-xl bg-[#F5F5F7] border border-black/[0.08] font-mono text-sm font-black text-center outline-none focus:border-[#0071E3]"
                      />
                      <span className="font-bold text-[#1D1D1F]">ج.م</span>
                    </div>
                    <span className="text-[10px] text-[#86868B] block">الموصى به: 1 نقطة لكل 10 ج.م</span>
                  </div>

                  {/* Parameter 2 */}
                  <div className="p-3.5 rounded-2xl bg-white border border-black/[0.08] space-y-1.5">
                    <label className="font-bold text-[#1D1D1F] block">مكافأة الزيارة / الفاتورة:</label>
                    <div className="flex items-center gap-1.5">
                      <input
                        type="number"
                        min={0}
                        value={localSettings.loyaltyPointsPerVisit ?? 0}
                        onChange={(e) => setLocalSettings({ ...localSettings, loyaltyPointsPerVisit: Math.max(0, Number(e.target.value) || 0) })}
                        className="w-full h-9 px-2 rounded-xl bg-[#F5F5F7] border border-black/[0.08] font-mono text-sm font-black text-center outline-none focus:border-[#0071E3]"
                      />
                      <span className="font-bold text-[#1D1D1F] shrink-0">نقطة / فاتورة</span>
                    </div>
                    <span className="text-[10px] text-[#86868B] block">المعتمد: 0 نقطة (النقاط على صافي المبيعات)</span>
                  </div>

                  {/* Parameter 3 */}
                  <div className="p-3.5 rounded-2xl bg-white border border-black/[0.08] space-y-1.5">
                    <label className="font-bold text-[#1D1D1F] block">قيمة النقطة عند الخصم النقدي:</label>
                    <div className="flex items-center gap-1.5">
                      <input
                        type="number"
                        step="0.05"
                        min={0.05}
                        max={5}
                        value={localSettings.loyaltyCashPerPointEgp ?? 0.10}
                        onChange={(e) => setLocalSettings({ ...localSettings, loyaltyCashPerPointEgp: Math.max(0.05, Number(e.target.value) || 0.10) })}
                        className="w-full h-9 px-2 rounded-xl bg-[#F5F5F7] border border-black/[0.08] font-mono text-sm font-black text-center text-[#0071E3] outline-none focus:border-[#0071E3]"
                      />
                      <span className="font-bold text-[#1D1D1F] shrink-0">ج.م / نقطة</span>
                    </div>
                    <span className="text-[10px] text-[#86868B] block">المعتمد: 0.10 ج.م (100 نقطة = 10 ج.م خصم)</span>
                  </div>

                  {/* Parameter 4 */}
                  <div className="p-3.5 rounded-2xl bg-emerald-50/50 border border-emerald-200 space-y-1.5">
                    <label className="font-black text-emerald-950 block">🛡️ الحد الأدنى المحمي للمساهمة:</label>
                    <div className="flex items-center gap-1.5">
                      <input
                        type="number"
                        min={5}
                        value={localSettings.loyaltyMinSafeMarginEgp ?? 10}
                        onChange={(e) => setLocalSettings({ ...localSettings, loyaltyMinSafeMarginEgp: Math.max(5, Number(e.target.value) || 10) })}
                        className="w-full h-9 px-2 rounded-xl bg-white border border-emerald-300 font-mono text-sm font-black text-center text-emerald-800 outline-none focus:border-emerald-600"
                      />
                      <span className="font-bold text-emerald-950 shrink-0">ج.م مساهمة</span>
                    </div>
                    <span className="text-[10px] text-emerald-800 font-medium block">
                      الحد الأدنى للمساهمة بعد الخصم والعمولة (10 ج)
                    </span>
                  </div>

                  {/* Parameter 5 */}
                  <div className="p-3.5 rounded-2xl bg-white border border-black/[0.08] space-y-1.5">
                    <label className="font-bold text-[#1D1D1F] block">أقصى نسبة خصم من الفاتورة:</label>
                    <div className="flex items-center gap-1.5">
                      <input
                        type="number"
                        min={5}
                        max={60}
                        value={localSettings.loyaltyMaxBillDiscountPercent ?? 25}
                        onChange={(e) => setLocalSettings({ ...localSettings, loyaltyMaxBillDiscountPercent: Math.min(60, Math.max(5, Number(e.target.value) || 25)) })}
                        className="w-full h-9 px-2 rounded-xl bg-[#F5F5F7] border border-black/[0.08] font-mono text-sm font-black text-center outline-none focus:border-[#0071E3]"
                      />
                      <span className="font-bold text-[#1D1D1F] shrink-0">% من الفاتورة</span>
                    </div>
                    <span className="text-[10px] text-[#86868B] block">الموصى به: 25% كحد أقصى</span>
                  </div>

                  {/* Parameter 6 */}
                  <div className="p-3.5 rounded-2xl bg-white border border-black/[0.08] space-y-1.5">
                    <label className="font-bold text-[#1D1D1F] block">الحد الأدنى لاستبدال النقاط:</label>
                    <div className="flex items-center gap-1.5">
                      <input
                        type="number"
                        min={5}
                        value={localSettings.loyaltyMinRedeemPoints ?? 10}
                        onChange={(e) => setLocalSettings({ ...localSettings, loyaltyMinRedeemPoints: Math.max(1, Number(e.target.value) || 10) })}
                        className="w-full h-9 px-2 rounded-xl bg-[#F5F5F7] border border-black/[0.08] font-mono text-sm font-black text-center outline-none focus:border-[#0071E3]"
                      />
                      <span className="font-bold text-[#1D1D1F] shrink-0">نقطة فأكثر</span>
                    </div>
                    <span className="text-[10px] text-[#86868B] block">الموصى به: 10 أو 15 نقطة</span>
                  </div>
                </div>
              </div>

              {/* 5. Interactive Live Invoice & Profit-Guard Simulator */}
              <div className="apple-glass rounded-3xl p-5 sm:p-7 border border-black/[0.06] shadow-apple-card space-y-4">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-3 border-b border-black/[0.06]">
                  <div className="flex items-center gap-2">
                    <Calculator size={18} className="text-[#0071E3]" />
                    <div>
                      <h3 className="text-sm sm:text-base font-black text-[#1D1D1F]">
                        محاكي الفاتورة واختبار صمام حماية ربح المتجر (Live Simulator)
                      </h3>
                      <p className="text-[11px] text-[#86868B]">
                        اختبر أي حجم زجاجة ورصيد نقاط لترى كيف يحمي النظام تكلفة الخام والعمولة وربح المتجر قبل منح الخصم.
                      </p>
                    </div>
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    {[
                      { label: '50 مل عادي (230ج)', price: 230, cost: 180 },
                      { label: '30 مل عادي (170ج)', price: 170, cost: 115 },
                      { label: '100 مل عادي (550ج)', price: 550, cost: 340 },
                      { label: '50 مل عود/خاص (450ج)', price: 450, cost: 320 },
                    ].map((preset, idx) => (
                      <button
                        key={idx}
                        type="button"
                        onClick={() => {
                          setSimBottlePrice(preset.price);
                          setSimBottleCost(preset.cost);
                        }}
                        className={`px-2.5 py-1 rounded-xl text-[10px] font-bold border transition-all cursor-pointer ${
                          simBottlePrice === preset.price && simBottleCost === preset.cost
                            ? 'bg-[#1D1D1F] text-white border-[#1D1D1F]'
                            : 'bg-white text-[#1D1D1F] border-black/[0.08] hover:bg-black/[0.03]'
                        }`}
                      >
                        {preset.label}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs">
                  <div className="p-3 rounded-2xl bg-[#F5F5F7] border border-black/[0.06] space-y-1">
                    <span className="text-[11px] font-bold text-[#86868B] block">سعر الفاتورة الأصلي (ج.م):</span>
                    <input
                      type="number"
                      value={simBottlePrice}
                      onChange={(e) => setSimBottlePrice(Math.max(0, Number(e.target.value) || 0))}
                      className="w-full h-9 px-2 rounded-xl bg-white border border-black/[0.08] font-mono text-sm font-black text-center"
                    />
                  </div>
                  <div className="p-3 rounded-2xl bg-[#F5F5F7] border border-black/[0.06] space-y-1">
                    <span className="text-[11px] font-bold text-[#86868B] block">تكلفة الخام والزجاجة (ج.م):</span>
                    <input
                      type="number"
                      value={simBottleCost}
                      onChange={(e) => setSimBottleCost(Math.max(0, Number(e.target.value) || 0))}
                      className="w-full h-9 px-2 rounded-xl bg-white border border-black/[0.08] font-mono text-sm font-black text-center text-rose-600"
                    />
                  </div>
                  <div className="p-3 rounded-2xl bg-[#F5F5F7] border border-black/[0.06] space-y-1">
                    <span className="text-[11px] font-bold text-[#86868B] block">رصيد نقاط العميل المتاح:</span>
                    <input
                      type="number"
                      value={simCustomerPoints}
                      onChange={(e) => setSimCustomerPoints(Math.max(0, Number(e.target.value) || 0))}
                      className="w-full h-9 px-2 rounded-xl bg-white border border-black/[0.08] font-mono text-sm font-black text-center text-amber-700"
                    />
                  </div>
                </div>

                {/* Simulation Output Breakdown */}
                <div className="p-4 rounded-2xl bg-gradient-to-r from-emerald-50/90 via-white to-blue-50/70 border border-emerald-200 grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
                  <div>
                    <span className="text-[10px] text-[#86868B] block font-bold">أقصى خصم ولاء مسموح آلياً</span>
                    <span className="text-lg font-black font-mono text-[#0071E3]">
                      -{simResult.maxSafeLoyaltyDiscountEgp} {settings.currency}
                    </span>
                    <span className="text-[10px] text-[#636366] block">
                      مقابل استبدال {simResult.maxRedeemablePoints} نقطة
                    </span>
                  </div>

                  <div>
                    <span className="text-[10px] text-[#86868B] block font-bold">الصافي المطلوب من العميل</span>
                    <span className="text-lg font-black font-mono text-[#1D1D1F]">
                      {simResult.netPriceAfterMaxDiscount} {settings.currency}
                    </span>
                    <span className="text-[10px] text-[#636366] block">
                      بعد خصم النقاط الفوري
                    </span>
                  </div>

                  <div>
                    <span className="text-[10px] text-emerald-800 block font-bold">صافي ربح المتجر المضمون</span>
                    <span className="text-lg font-black font-mono text-emerald-700">
                      +{simResult.guaranteedStoreNetProfit} {settings.currency}
                    </span>
                    <span className="text-[10px] text-emerald-800 font-semibold block">
                      بعد استرداد الخام ({simBottleCost}ج) والعمولة ({simResult.commissionAfterDiscount}ج)
                    </span>
                  </div>

                  <div>
                    <span className="text-[10px] text-[#86868B] block font-bold">نقاط جديدة يكسبها العميل</span>
                    <span className="text-lg font-black font-mono text-amber-700">
                      +{simResult.newPointsEarned} نقطة
                    </span>
                    <span className="text-[10px] text-[#636366] block">
                      تضاف لسجله تلقائياً عند البيع
                    </span>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* ======================================================== */}
          {/* SECTION 1: STORE IDENTITY & GENERAL INFO                 */}
          {/* ======================================================== */}
          {((activeSection === 'system_settings' && systemSubTab === 'identity') || activeSection === 'identity') && (
            <div className="apple-glass rounded-3xl p-5 sm:p-7 border border-black/[0.06] shadow-apple-card space-y-6 animate-in fade-in duration-150">
              <div className="pb-3 border-b border-black/[0.06] flex items-center justify-between">
                <div>
                  <h2 className="text-lg font-black text-[#1D1D1F]">الهوية التجارية وبيانات المتجر العامة</h2>
                  <p className="text-xs text-[#86868B]">تظهر هذه البيانات في ترويسة الفواتير، التقارير، والرسائل الرسمية للزبائن.</p>
                </div>
                <div className="w-10 h-10 rounded-2xl bg-[#0071E3]/10 text-[#0071E3] flex items-center justify-center font-bold">
                  <Store size={20} />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs">
                <div className="space-y-1.5">
                  <label className="font-bold text-[#1D1D1F] block text-right">اسم المتجر / العلامة التجارية:</label>
                  <input
                    type="text"
                    value={localSettings.storeName}
                    onChange={(e) => setLocalSettings({ ...localSettings, storeName: e.target.value })}
                    className="w-full h-11 px-3.5 rounded-xl bg-white border border-black/[0.08] text-xs font-bold outline-none focus:border-[#0071E3] text-right"
                  />
                </div>

                <div className="space-y-1.5">
                  <label className="font-bold text-[#1D1D1F] block text-right">الشعار اللفظي (Slogan):</label>
                  <input
                    type="text"
                    value={localSettings.storeSlogan || ''}
                    onChange={(e) => setLocalSettings({ ...localSettings, storeSlogan: e.target.value })}
                    placeholder="مثال: أثر يبقى وذكرى تدوم"
                    className="w-full h-11 px-3.5 rounded-xl bg-white border border-black/[0.08] text-xs font-medium outline-none focus:border-[#0071E3] text-right"
                  />
                </div>

                <div className="space-y-1.5">
                  <label className="font-bold text-[#1D1D1F] block text-right">رقم الهاتف / الواتساب الرسمي:</label>
                  <input
                    type="tel"
                    value={localSettings.storePhone || ''}
                    onChange={(e) => setLocalSettings({ ...localSettings, storePhone: e.target.value })}
                    placeholder="مثال: 01000000000"
                    className="w-full h-11 px-3.5 rounded-xl bg-white border border-black/[0.08] text-xs font-mono font-medium outline-none focus:border-[#0071E3] text-right"
                  />
                </div>

                <div className="space-y-1.5">
                  <label className="font-bold text-[#1D1D1F] block text-right">العملة المعتمدة:</label>
                  <input
                    type="text"
                    value={localSettings.currency}
                    onChange={(e) => setLocalSettings({ ...localSettings, currency: e.target.value })}
                    className="w-full h-11 px-3.5 rounded-xl bg-white border border-black/[0.08] text-xs font-bold outline-none focus:border-[#0071E3] text-right"
                  />
                </div>

                <div className="space-y-1.5 sm:col-span-2">
                  <label className="font-bold text-[#1D1D1F] block text-right">العنوان والمعرض:</label>
                  <input
                    type="text"
                    value={localSettings.storeAddress || ''}
                    onChange={(e) => setLocalSettings({ ...localSettings, storeAddress: e.target.value })}
                    placeholder="عنوان المعرض والفرع..."
                    className="w-full h-11 px-3.5 rounded-xl bg-white border border-black/[0.08] text-xs font-medium outline-none focus:border-[#0071E3] text-right"
                  />
                </div>

                <div className="space-y-1.5 sm:col-span-2">
                  <label className="font-bold text-[#1D1D1F] block text-right">رابط شعار المتجر (Logo URL):</label>
                  <div className="flex items-center gap-3">
                    <input
                      type="url"
                      value={localSettings.logoUrl || ''}
                      onChange={(e) => setLocalSettings({ ...localSettings, logoUrl: e.target.value })}
                      placeholder="https://..."
                      className="flex-1 h-11 px-3.5 rounded-xl bg-white border border-black/[0.08] text-xs font-mono outline-none focus:border-[#0071E3] text-left"
                    />
                    <img 
                      src={localSettings.logoUrl || "https://l.top4top.io/p_31142jfec0.png"} 
                      alt="Logo preview" 
                      onError={(e) => {
                        e.currentTarget.style.display = 'none';
                      }}
                      className="w-11 h-11 max-w-[44px] max-h-[44px] object-contain bg-white rounded-xl p-1 border border-black/[0.08] shadow-apple-xs shrink-0 block" 
                    />
                  </div>
                </div>

                <div className="space-y-1.5">
                  <label className="font-bold text-[#1D1D1F] block text-right">الرقم الضريبي / السجل التجاري (إن وجد):</label>
                  <input
                    type="text"
                    value={localSettings.storeTaxNumber || ''}
                    onChange={(e) => setLocalSettings({ ...localSettings, storeTaxNumber: e.target.value })}
                    placeholder="اختياري للفواتير الضريبية"
                    className="w-full h-11 px-3.5 rounded-xl bg-white border border-black/[0.08] text-xs font-mono outline-none focus:border-[#0071E3] text-right"
                  />
                </div>
              </div>

              
                            
              {/* Telegram Bot & Channel Notifications Studio (إعدادات بوت التليجرام والتنبيهات المباشرة) */}
              <div className="p-4 sm:p-6 rounded-3xl bg-gradient-to-br from-sky-950 via-slate-900 to-indigo-950 text-white border border-sky-500/30 shadow-2xl space-y-5">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-white/10">
                  <div className="flex items-start gap-3">
                    <div className="w-11 h-11 rounded-2xl bg-gradient-to-br from-sky-500 to-blue-600 text-white flex items-center justify-center shrink-0 shadow-lg">
                      <Send size={22} className="animate-pulse" />
                    </div>
                    <div>
                      <div className="flex items-center gap-2 flex-wrap">
                        <h3 className="text-base font-black text-white">إرسال تنبيهات المبيعات والمخزون المباشرة عبر تليجرام</h3>
                        <span className="text-[10px] px-2.5 py-0.5 rounded-full bg-sky-500 text-white font-black tracking-wide">بديل الواتساب المباشر ⚡</span>
                      </div>
                      <p className="text-xs text-slate-300 mt-1 leading-relaxed">
                        يرسل تنبيهات فوتوغرافية ومفصلة بالفواتير، نواقص المخزون الحرج، والمصروفات مباشرة إلى قناتك أو البوت الخاص بك فور حدوثها.
                      </p>
                    </div>
                  </div>

                  <button
                    type="button"
                    onClick={() => {
                      const nextState = !telegramConfig.enabled;
                      const updated = { ...telegramConfig, enabled: nextState };
                      setTelegramConfig(updated);
                      saveTelegramSettings(updated);
                      setToastMessage(nextState ? 'تم تفعيل تنبيهات التليجرام المباشرة 📲' : 'تم إيقاف تنبيهات التليجرام 🔕');
                      setIsSavedToast(true);
                      setTimeout(() => setIsSavedToast(false), 2000);
                    }}
                    className={`px-5 py-3 rounded-2xl text-xs font-black transition-all cursor-pointer flex items-center justify-center gap-2 shrink-0 ${
                      telegramConfig.enabled
                        ? 'bg-gradient-to-r from-sky-500 via-blue-600 to-sky-600 text-white shadow-lg shadow-sky-950/40'
                        : 'bg-white/10 text-slate-300 hover:bg-white/20 border border-white/10'
                    }`}
                  >
                    {telegramConfig.enabled ? (
                      <>
                        <CheckCircle2 size={18} />
                        <span>التنبيهات مفعّلة (نشطة)</span>
                      </>
                    ) : (
                      <>
                        <X size={18} />
                        <span>التنبيهات معطلة</span>
                      </>
                    )}
                  </button>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs">
                  <div className="space-y-2">
                    <label className="font-bold text-slate-200 block text-right">رمز البوت الخاص (Bot Token):</label>
                    <input
                      type="password"
                      placeholder="مثال: 123456789:ABCdefGhIJKlmNoPQ..."
                      value={telegramConfig.botToken}
                      onChange={(e) => {
                        const updated = { ...telegramConfig, botToken: e.target.value };
                        setTelegramConfig(updated);
                        saveTelegramSettings(updated);
                      }}
                      className="w-full h-11 px-3.5 rounded-xl bg-white/10 border border-white/15 text-white font-mono text-xs outline-none focus:border-sky-400 text-left"
                    />
                    <span className="text-[10px] text-slate-400 block text-right">يمكنك إنشاؤه في ثوانٍ عبر التواصل مع @BotFather في تليجرام</span>
                  </div>

                  <div className="space-y-2">
                    <label className="font-bold text-slate-200 block text-right">معرف القناة أو الشات (Chat ID):</label>
                    <input
                      type="text"
                      placeholder="مثال: @my_store_channel أو -100123456789 أو 987654321"
                      value={telegramConfig.chatId}
                      onChange={(e) => {
                        const updated = { ...telegramConfig, chatId: e.target.value };
                        setTelegramConfig(updated);
                        saveTelegramSettings(updated);
                      }}
                      className="w-full h-11 px-3.5 rounded-xl bg-white/10 border border-white/15 text-white font-mono text-xs outline-none focus:border-sky-400 text-left"
                    />
                    <span className="text-[10px] text-slate-400 block text-right">معرف شات المالك أو معرف القناة الخاصة بعد إضافة البوت مشرفاً فيها</span>
                  </div>
                </div>

                <div className="pt-2 border-t border-white/10 space-y-3">
                  <span className="text-xs font-bold text-slate-200 block text-right">تحديد التنبيهات المراد استلامها فورياً:</span>
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
                    {[
                      { key: 'notifySales', label: '🛍️ المبيعات والفواتير' },
                      { key: 'notifyLowStock', label: '🚨 نواقص المخزون الحرج' },
                      { key: 'notifyExpenses', label: '💸 المصروفات المسجلة' },
                      { key: 'notifyDailySummary', label: '📊 الملخص اليومي' },
                    ].map((item) => {
                      const isChecked = (telegramConfig as any)[item.key] !== false;
                      return (
                        <button
                          key={item.key}
                          type="button"
                          onClick={() => {
                            const updated = { ...telegramConfig, [item.key]: !isChecked };
                            setTelegramConfig(updated);
                            saveTelegramSettings(updated);
                          }}
                          className={`p-3 rounded-2xl border text-xs font-bold transition-all cursor-pointer flex items-center justify-between ${
                            isChecked
                              ? 'bg-sky-500/20 border-sky-400/50 text-white'
                              : 'bg-white/5 border-white/10 text-slate-400 hover:bg-white/10'
                          }`}
                        >
                          <span>{item.label}</span>
                          <span className={`w-3.5 h-3.5 rounded-full border flex items-center justify-center text-[9px] ${
                            isChecked ? 'bg-sky-500 border-sky-400 text-white' : 'border-slate-500'
                          }`}>
                            {isChecked && '✓'}
                          </span>
                        </button>
                      );
                    })}
                  </div>
                </div>

                <div className="flex flex-col sm:flex-row items-center justify-between gap-3 pt-2">
                  <button
                    type="button"
                    disabled={telegramTesting || !telegramConfig.botToken || !telegramConfig.chatId}
                    onClick={async () => {
                      setTelegramTesting(true);
                      setTelegramStatusMsg(null);
                      const res = await testTelegramConnection(
                        telegramConfig.botToken,
                        telegramConfig.chatId,
                        localSettings.storeName
                      );
                      setTelegramTesting(false);
                      if (res.success) {
                        setTelegramStatusMsg({ type: 'success', text: 'تم إرسال الرسالة التجريبية بنجاح إلى تليجرام! 🚀' });
                      } else {
                        setTelegramStatusMsg({ type: 'error', text: `تعذر الإرسال: ${res.error || 'خطأ بالاتصال'}` });
                      }
                    }}
                    className="apple-btn px-5 py-2.5 rounded-2xl bg-sky-500 hover:bg-sky-400 text-white font-black text-xs transition-all cursor-pointer disabled:opacity-50 flex items-center gap-2 shadow-lg shadow-sky-950/30"
                  >
                    <Send size={15} className={telegramTesting ? 'animate-spin' : ''} />
                    <span>{telegramTesting ? 'جاري اختبار الاتصال...' : 'اختبار إرسال رسالة تجريبية للتليجرام 📡'}</span>
                  </button>

                  {telegramStatusMsg && (
                    <span className={`text-xs font-bold px-3.5 py-2 rounded-xl border ${
                      telegramStatusMsg.type === 'success'
                        ? 'bg-emerald-500/20 border-emerald-400/40 text-emerald-300'
                        : 'bg-rose-500/20 border-rose-400/40 text-rose-300'
                    }`}>
                      {telegramStatusMsg.text}
                    </span>
                  )}
                </div>
              </div>


              {/* Intelligent Acoustics & Custom Sound Alerts Studio (استوديو النغمات والأصوات التفاعلية المخصصة) */}
              <div className="p-4 sm:p-6 rounded-3xl bg-gradient-to-br from-indigo-950 via-slate-900 to-purple-950 text-white border border-indigo-500/30 shadow-2xl space-y-5">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-white/10">
                  <div className="flex items-start gap-3">
                    <div className="w-11 h-11 rounded-2xl bg-gradient-to-br from-indigo-500 to-purple-600 text-white flex items-center justify-center shrink-0 shadow-lg">
                      <Zap size={22} className="animate-pulse" />
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        <h3 className="text-base font-black text-white">استوديو المؤثرات الصوتية والتنبيهات المخصصة</h3>
                        <span className="text-[10px] px-2.5 py-0.5 rounded-full bg-indigo-500 text-white font-black tracking-wide">أصوات مخصصة 100%</span>
                      </div>
                      <p className="text-xs text-slate-300 mt-1 leading-relaxed">
                        صُممت الأصوات بنظام Web Audio API النقي بدون أي ملفات خارجية. صوت مخصص لكل عملية (بيع، مصروفات، تحذير مخزون، وتحقيق أهداف).
                      </p>
                    </div>
                  </div>

                  <button
                    type="button"
                    onClick={() => {
                      const nextState = !soundAlertService.isEnabled();
                      soundAlertService.setEnabled(nextState);
                      setToastMessage(nextState ? "تم تفعيل التنبيهات الصوتية 🔊" : "تم كتم التنبيهات الصوتية 🔇");
                      setIsSavedToast(true);
                      setTimeout(() => setIsSavedToast(false), 2000);
                    }}
                    className={`px-5 py-3 rounded-2xl text-xs font-black transition-all cursor-pointer flex items-center justify-center gap-2 shrink-0 ${
                      soundAlertService.isEnabled()
                        ? "bg-gradient-to-r from-emerald-500 via-teal-600 to-emerald-600 text-white shadow-lg"
                        : "bg-white/10 text-slate-300 hover:bg-white/20 border border-white/10"
                    }`}
                  >
                    {soundAlertService.isEnabled() ? (
                      <>
                        <CheckCircle2 size={18} />
                        <span>الأصوات مفعّلة (شغالة)</span>
                      </>
                    ) : (
                      <>
                        <X size={18} />
                        <span>الأصوات مكتومة</span>
                      </>
                    )}
                  </button>
                </div>

                {/* Sound Controls & Preview Matrix */}
                <div className="space-y-4">
                  {/* Master Volume & Profile Selector */}
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {/* Volume Slider */}
                    <div className="p-3.5 rounded-2xl bg-white/5 border border-white/10 space-y-2">
                      <div className="flex items-center justify-between text-xs font-bold text-slate-200">
                        <span>شدة الصوت العامة (Master Volume):</span>
                        <span className="font-mono font-black text-indigo-300">
                          {Math.round(soundAlertService.getVolume() * 100)}%
                        </span>
                      </div>
                      <input
                        type="range"
                        min="0"
                        max="1"
                        step="0.05"
                        value={soundAlertService.getVolume()}
                        onChange={(e) => {
                          const v = parseFloat(e.target.value);
                          soundAlertService.setVolume(v);
                          soundAlertService.playHapticClick();
                        }}
                        className="w-full accent-indigo-400 cursor-pointer"
                      />
                    </div>

                    {/* Acoustic Profile */}
                    <div className="p-3.5 rounded-2xl bg-white/5 border border-white/10 space-y-2">
                      <span className="text-xs font-bold text-slate-200 block text-right">نمط الطابع الصوتي (Sound Theme Profile):</span>
                      <div className="grid grid-cols-3 gap-1.5">
                        {[
                          { id: "modern_luxury", label: "فخامة دافئة" },
                          { id: "apple_acoustic", label: "Apple Acoustic" },
                          { id: "minimal_haptic", label: "نقرات سريعة" },
                        ].map((p) => {
                          const isSel = soundAlertService.getProfile() === p.id;
                          return (
                            <button
                              key={p.id}
                              type="button"
                              onClick={() => {
                                soundAlertService.setProfile(p.id as any);
                                soundAlertService.playSaleChime();
                              }}
                              className={`py-2 px-2 rounded-xl text-[11px] font-bold transition-all cursor-pointer ${
                                isSel
                                  ? "bg-indigo-500 text-white shadow-md"
                                  : "bg-white/5 text-slate-300 hover:bg-white/10"
                              }`}
                            >
                              {p.label}
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  </div>

                  {/* Custom Distinct Sound Alert Testers */}
                  <div className="pt-2">
                    <label className="text-xs font-bold text-slate-200 block mb-2 text-right">
                      🎧 اختبر واستمع للأصوات المخصصة لكل إجراء في المتجر:
                    </label>
                    <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-2.5">
                      {[
                        { key: "sale", label: "🔔 بيع وتحصيل", color: "from-emerald-600 to-teal-700" },
                        { key: "expense", label: "💸 تسجيل مصروف", color: "from-blue-600 to-indigo-700" },
                        { key: "stock_warning", label: "🚨 تحذير المخزون", color: "from-rose-600 to-red-700" },
                        { key: "goal", label: "🎯 إنجاز التارجت", color: "from-amber-500 to-yellow-600" },
                        { key: "register", label: "👤 دخول وتوثيق", color: "from-purple-600 to-violet-700" },
                        { key: "add_item", label: "🛒 إضافة للسلة", color: "from-cyan-600 to-blue-600" },
                        { key: "notification", label: "💬 إشعار ذكي", color: "from-slate-700 to-slate-800" },
                        { key: "delete", label: "🗑️ حذف وتلغيم", color: "from-zinc-700 to-neutral-800" },
                      ].map((item) => (
                        <button
                          key={item.key}
                          type="button"
                          onClick={() => soundAlertService.previewSound(item.key as any)}
                          className={`p-3 rounded-2xl bg-gradient-to-br ${item.color} text-white text-xs font-black hover:scale-[1.02] active:scale-[0.98] transition-all cursor-pointer shadow-md flex items-center justify-between border border-white/20`}
                        >
                          <span>{item.label}</span>
                          <Zap size={14} className="opacity-80 shrink-0" />
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
              </div>

              {/* Broadcast News Ticker Advanced Control Studio (إدارة شريط الأخبار والسرعة والمواضيع) */}
              <div className="p-4 sm:p-6 rounded-3xl bg-gradient-to-br from-slate-950 via-zinc-900 to-slate-900 text-white border border-white/10 shadow-2xl space-y-5">
                {/* Header & Main Toggle */}
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-white/10">
                  <div className="flex items-start gap-3">
                    <div className="w-11 h-11 rounded-2xl bg-gradient-to-br from-red-600 to-rose-700 text-white border border-red-400/40 flex items-center justify-center shrink-0 shadow-lg">
                      <Radio size={22} className="animate-pulse" />
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        <h3 className="text-base font-black text-white">استوديو التحكم لشريط الأخبار والأنباء العاجلة</h3>
                        <span className="text-[10px] px-2.5 py-0.5 rounded-full bg-red-600 text-white font-black tracking-wide shadow-xs">بث مباشر</span>
                      </div>
                      <p className="text-xs text-slate-300 mt-1 leading-relaxed">
                        تتيح لك هذه الشاشة إظهار أو إخفاء شريط الشريط العلوي، ضبط سرعة الانسياب الحركي، وتخصيص الأخبار والمواضيع المعروضة للكاشير والمالك.
                      </p>
                    </div>
                  </div>

                  <button
                    type="button"
                    onClick={() => {
                      const nextVal = !(localSettings.showNewsTickerBar !== false);
                      const updated = { ...localSettings, showNewsTickerBar: nextVal };
                      setLocalSettings(updated);
                      setSettings(updated);
                      setToastMessage(nextVal ? 'تم إظهار شريط الأخبار المباشر 📡' : 'تم إخفاء شريط الأخبار 🚫');
                      setIsSavedToast(true);
                      setTimeout(() => setIsSavedToast(false), 2500);
                    }}
                    className={`px-5 py-3 rounded-2xl text-xs font-black transition-all cursor-pointer flex items-center justify-center gap-2 shrink-0 ${
                      localSettings.showNewsTickerBar !== false
                        ? 'bg-gradient-to-r from-emerald-500 via-teal-600 to-emerald-600 text-white shadow-lg shadow-emerald-950/40'
                        : 'bg-white/10 text-slate-300 hover:bg-white/20 border border-white/10'
                    }`}
                  >
                    {localSettings.showNewsTickerBar !== false ? (
                      <>
                        <CheckCircle2 size={18} />
                        <span>الشريط مفعّل (ظاهر)</span>
                      </>
                    ) : (
                      <>
                        <EyeOff size={18} />
                        <span>الشريط موقف (مخفي)</span>
                      </>
                    )}
                  </button>
                </div>

                {/* Sub-controls: Ticker Speed & Topic Checkboxes */}
                {localSettings.showNewsTickerBar !== false && (
                  <div className="space-y-4 pt-1 animate-in fade-in duration-200">
                    {/* Speed Selector */}
                    <div>
                      <label className="text-xs font-bold text-slate-200 block mb-2 flex items-center gap-1.5">
                        <Gauge size={15} className="text-amber-400" />
                        <span>سرعة حركة انسياب الشريط الإخباري:</span>
                      </label>
                      <div className="grid grid-cols-3 gap-2.5">
                        {[
                          { id: 'slow', label: 'هادئة (بطيئة)', desc: 'حرية قراءة متأنية' },
                          { id: 'medium', label: 'متزنة (متوسطة)', desc: 'السرعة القياسية' },
                          { id: 'fast', label: 'حماسية (سريعة)', desc: 'تحديث ديناميكي سريع' },
                        ].map((speed) => {
                          const currentSpeed = localSettings.newsTickerSpeed || 'medium';
                          const isSelected = currentSpeed === speed.id;
                          return (
                            <button
                              key={speed.id}
                              type="button"
                              onClick={() => {
                                const updated = { ...localSettings, newsTickerSpeed: speed.id as any };
                                setLocalSettings(updated);
                                setSettings(updated);
                                setToastMessage(`تم تغيير سرعة الشريط إلى: ${speed.label} ⚡`);
                                setIsSavedToast(true);
                                setTimeout(() => setIsSavedToast(false), 2000);
                              }}
                              className={`p-3 rounded-xl border text-right transition-all cursor-pointer ${
                                isSelected
                                  ? 'bg-gradient-to-r from-amber-500/20 via-yellow-500/15 to-amber-500/10 border-amber-400/60 text-amber-200 shadow-md ring-1 ring-amber-400/30'
                                  : 'bg-white/5 border-white/10 text-slate-300 hover:bg-white/10'
                              }`}
                            >
                              <div className="flex items-center justify-between">
                                <span className="text-xs font-black">{speed.label}</span>
                                {isSelected && <Check size={14} className="text-amber-400 shrink-0" />}
                              </div>
                              <span className="text-[10px] text-slate-400 block mt-0.5">{speed.desc}</span>
                            </button>
                          );
                        })}
                      </div>
                    </div>

                    {/* Topics Selector Checkboxes */}
                    <div className="pt-2">
                      <label className="text-xs font-bold text-slate-200 block mb-2 flex items-center gap-1.5">
                        <Sparkles size={15} className="text-rose-400" />
                        <span>تحديد القطاعات والمواضيع الظاهرة بالشريط:</span>
                      </label>
                      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2.5">
                        {[
                          { key: 'sales', label: '🎯 المبيعات والتارجت اليومي', desc: 'عدد الفواتير وقيمتها والمسافة للتعادل' },
                          { key: 'commission', label: '💰 العمولة والأرباح اليومية', desc: 'حساب العمولة المتدرجة لمبيعات اليوم' },
                          { key: 'inventory', label: '📦 تنبيهات المخزون والعبوات', desc: 'تفقد الزيوت والعبوات وعدد المنتجات' },
                          { key: 'prayers', label: '🕌 الأدعية والذكر والصلاة على النبي', desc: 'تذكير بالصلاة على النبي وإخلاص النية' },
                          { key: 'salesTips', label: '💡 أفكار وتنشيط المبيعات', desc: 'نصائح لرفع متوسط الفاتورة وإرضاء الزائر' },
                          { key: 'storeCleanliness', label: '✨ تنظيم ونظافة المتجر', desc: 'تلميع الواجهات وترتيب وتطبيب الجو' },
                        ].map((topic) => {
                          const topicsObj = localSettings.newsTickerTopics || {
                            sales: true,
                            inventory: true,
                            prayers: true,
                            salesTips: true,
                            storeCleanliness: true,
                            commission: true,
                          };
                          const isChecked = topicsObj[topic.key as keyof typeof topicsObj] !== false;
                          return (
                            <button
                              key={topic.key}
                              type="button"
                              onClick={() => {
                                const nextTopics = { ...topicsObj, [topic.key]: !isChecked };
                                const updated = { ...localSettings, newsTickerTopics: nextTopics };
                                setLocalSettings(updated);
                                setSettings(updated);
                                setToastMessage(!isChecked ? `تم تفعيل: ${topic.label}` : `تم إيقاف: ${topic.label}`);
                                setIsSavedToast(true);
                                setTimeout(() => setIsSavedToast(false), 2000);
                              }}
                              className={`p-3 rounded-2xl border text-right transition-all cursor-pointer flex items-start gap-2.5 ${
                                isChecked
                                  ? 'bg-white/10 border-emerald-500/50 text-white shadow-xs'
                                  : 'bg-white/5 border-white/5 text-slate-400 hover:bg-white/[0.07]'
                              }`}
                            >
                              <div className={`w-5 h-5 rounded-md flex items-center justify-center shrink-0 mt-0.5 transition-colors ${
                                isChecked ? 'bg-emerald-500 text-slate-950 font-bold' : 'bg-white/10 text-transparent border border-white/20'
                              }`}>
                                <Check size={12} strokeWidth={3} />
                              </div>
                              <div>
                                <span className="text-xs font-bold block text-slate-100">{topic.label}</span>
                                <span className="text-[10px] text-slate-400 leading-tight block mt-0.5">{topic.desc}</span>
                              </div>
                            </button>
                          );
                        })}
                      </div>
                    </div>

                    {/* News Item Frequencies Selector (تواتر ظهور أنواع الأخبار) */}
                    <div className="pt-3 border-t border-white/10">
                      <label className="text-xs font-bold text-slate-200 block mb-2 flex items-center gap-1.5">
                        <Clock size={15} className="text-cyan-400" />
                        <span>ضبط تواتر ونظام تكرار ظهور كل نوع من الأخبار:</span>
                      </label>
                      <p className="text-[11px] text-slate-400 mb-3">
                        حدد الفاصل الزمني المطلوب بين كل ظهور لضمان الموازنة وعدم إزعاج المستخدم (مثل: الأدعية كل 10 دقائق، تنبيهات المخزون فورية).
                      </p>
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                        {[
                          {
                            key: 'prayers',
                            label: '🕌 الأدعية والذكر والصلاة على النبي',
                            defaultFreq: 'every_10m',
                            options: [
                              { value: 'every_3m', label: 'كل 3 دقائق' },
                              { value: 'every_5m', label: 'كل 5 دقائق' },
                              { value: 'every_10m', label: 'كل 10 دقائق (الموصى به)' },
                              { value: 'every_15m', label: 'كل 15 دقيقة' },
                              { value: 'every_30m', label: 'كل 30 دقيقة' },
                            ],
                          },
                          {
                            key: 'inventory',
                            label: '🚨 تنبيهات النواقص والمخزون',
                            defaultFreq: 'instant',
                            options: [
                              { value: 'instant', label: 'فورية ودورية (الموصى به)' },
                              { value: 'every_5m', label: 'كل 5 دقائق' },
                              { value: 'every_10m', label: 'كل 10 دقائق' },
                              { value: 'every_15m', label: 'كل 15 دقيقة' },
                            ],
                          },
                          {
                            key: 'salesTips',
                            label: '💡 نصائح وأفكار تنشيط المبيعات',
                            defaultFreq: 'every_5m',
                            options: [
                              { value: 'every_3m', label: 'كل 3 دقائق' },
                              { value: 'every_5m', label: 'كل 5 دقائق (الموصى به)' },
                              { value: 'every_10m', label: 'كل 10 دقائق' },
                              { value: 'every_15m', label: 'كل 15 دقيقة' },
                            ],
                          },
                          {
                            key: 'profitSummary',
                            label: '📈 ملخص الأرباح والمبيعات اليومية',
                            defaultFreq: 'every_15m',
                            options: [
                              { value: 'every_5m', label: 'كل 5 دقائق' },
                              { value: 'every_10m', label: 'كل 10 دقائق' },
                              { value: 'every_15m', label: 'كل 15 دقيقة (الموصى به)' },
                              { value: 'every_30m', label: 'كل 30 دقيقة' },
                              { value: 'hourly', label: 'مرة كل ساعة' },
                            ],
                          },
                          {
                            key: 'commission',
                            label: '💰 العمولة ومستحقات اليوم',
                            defaultFreq: 'every_10m',
                            options: [
                              { value: 'every_5m', label: 'كل 5 دقائق' },
                              { value: 'every_10m', label: 'كل 10 دقائق (الموصى به)' },
                              { value: 'every_15m', label: 'كل 15 دقيقة' },
                              { value: 'every_30m', label: 'كل 30 دقيقة' },
                            ],
                          },
                          {
                            key: 'storeCleanliness',
                            label: '✨ تنظيم ونظافة ورونق المتجر',
                            defaultFreq: 'every_30m',
                            options: [
                              { value: 'every_15m', label: 'كل 15 دقيقة' },
                              { value: 'every_30m', label: 'كل 30 دقيقة (الموصى به)' },
                              { value: 'hourly', label: 'مرة كل ساعة' },
                            ],
                          },
                        ].map((freqItem) => {
                          const freqsObj = localSettings.newsTickerFrequencies || {};
                          const currentVal = freqsObj[freqItem.key as keyof typeof freqsObj] || freqItem.defaultFreq;
                          return (
                            <div key={freqItem.key} className="p-3 rounded-2xl bg-white/5 border border-white/10 space-y-1.5">
                              <label className="text-xs font-bold text-slate-200 block text-right">{freqItem.label}</label>
                              <select
                                value={currentVal}
                                onChange={(e) => {
                                  const nextFreqs = { ...freqsObj, [freqItem.key]: e.target.value as any };
                                  const updated = { ...localSettings, newsTickerFrequencies: nextFreqs };
                                  setLocalSettings(updated);
                                  setSettings(updated);
                                  setToastMessage(`تم تعديل تواتر ${freqItem.label}`);
                                  setIsSavedToast(true);
                                  setTimeout(() => setIsSavedToast(false), 2000);
                                }}
                                className="w-full h-9 px-3 rounded-xl bg-slate-900 border border-white/20 text-xs font-bold text-cyan-300 outline-none focus:border-cyan-400 dir-rtl cursor-pointer"
                              >
                                {freqItem.options.map((opt) => (
                                  <option key={opt.value} value={opt.value} className="bg-slate-900 text-white">
                                    {opt.label}
                                  </option>
                                ))}
                              </select>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  </div>
                )}
              </div>

              {/* Owner Quick Access to Dashboard Cards Customization inside Store Identity Settings */}
              {isOwner && (
                <div className="pt-4 border-t border-black/[0.06]">
                  <div className="p-4 sm:p-5 rounded-2xl bg-gradient-to-r from-[#1D1D1F] via-[#252528] to-[#1D1D1F] text-white flex flex-col sm:flex-row sm:items-center justify-between gap-4 border border-white/10">
                    <div className="flex items-start gap-3">
                      <div className="w-10 h-10 rounded-xl bg-amber-400/20 border border-amber-400/40 text-amber-300 flex items-center justify-center shrink-0">
                        <Layout size={19} />
                      </div>
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="text-xs sm:text-sm font-black text-white">
                            تخصيص وترتيب البطاقات الظاهرة في شاشة Dashboard
                          </span>
                          <span className="px-2 py-0.5 rounded-full text-[10px] font-black bg-amber-400 text-black">
                            للمالك فقط
                          </span>
                        </div>
                        <p className="text-[11px] text-gray-300 mt-0.5">
                          رتّب أهم التقارير المالية والتشغيلية الـ 12 والأقسام الرئيسية في شاشة Dashboard حسب أولوياتك.
                        </p>
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => setActiveSection('dashboard_layout')}
                      className="apple-btn px-4 py-2.5 rounded-xl bg-amber-400 hover:bg-amber-300 text-black text-xs font-black shrink-0 flex items-center justify-center gap-1.5 cursor-pointer"
                    >
                      <Sliders size={14} />
                      <span>فتح استوديو تخصيص وترتيب البطاقات</span>
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* ======================================================== */}
          {/* SECTION 2: PRICING, ESSENCE OILS & BOTTLE SIZES          */}
          {/* ======================================================== */}
          {((activeSection === 'system_settings' && systemSubTab === 'pricing') || activeSection === 'pricing') && (
            <div className="apple-glass rounded-3xl p-5 sm:p-7 border border-black/[0.06] shadow-apple-card space-y-6 animate-in fade-in duration-150">
              <div className="pb-3 border-b border-black/[0.06] flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div>
                  <div className="flex items-center gap-2 flex-wrap">
                    <h2 className="text-lg font-black text-[#1D1D1F]">🔻 المرجع التجاري والمالي للمنتجات — متجر «لَمْسَةُ عِطْر»</h2>
                    <span className="px-2.5 py-0.5 rounded-full bg-emerald-100 text-emerald-900 text-[10px] font-black">
                      أثر يبقى وذكرى تدوم
                    </span>
                  </div>
                  <p className="text-xs text-[#86868B] mt-0.5">
                    هذه البيانات هي المرجع الحالي للنظام. أي تغيير لاحق لا يتم إلا من لوحة المالك، مع تسجيل القيمة القديمة والجديدة وتاريخ التغيير وسببه.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => handleOpenBottleModal()}
                  className="apple-btn flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-[#0071E3] hover:bg-[#0077ED] text-white text-xs font-bold shadow-xs shrink-0"
                >
                  <Plus size={14} />
                  <span>إضافة حجم زجاجة</span>
                </button>
              </div>

              {/* Mandatory Owner Audit Reason Box */}
              <div className="p-3.5 rounded-2xl bg-[#FFF8EB] border border-[#C49746]/35 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs">
                <div className="flex items-center gap-2">
                  <ShieldCheck size={16} className="text-[#9A6E23] shrink-0" />
                  <span className="font-black text-[#9A6E23]">سبب التغيير لتوثيقه في سجل الرقابة مع القيمة القديمة والجديدة:</span>
                </div>
                <input
                  type="text"
                  value={ownerAuditReason}
                  onChange={(e) => setOwnerAuditReason(e.target.value)}
                  placeholder="اكتب سبب التعديل لاعتماده في سجل التدقيق..."
                  className="flex-1 h-9 px-3 rounded-xl bg-white border border-[#C49746]/40 text-xs font-bold text-[#1D1D1F] outline-none"
                />
              </div>

              {/* Section 3 of Reference: Approved Gram Costs (عادي 10ج / نيش 15ج / عود 20ج / مسك 20ج) */}
              <div className="space-y-2">
                <h3 className="text-xs font-black text-[#1D1D1F]">🧪 ثالثًا: تكلفة الجرام المعتمدة حسب نوع الزيت الخام</h3>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs">
                  <div className="p-3.5 rounded-2xl bg-white border border-black/[0.08] space-y-1.5 text-right">
                    <span className="text-[#0071E3] text-[11px] block font-black">🧴 الزيت العادي (جنيه/جرام):</span>
                    <div className="flex items-center gap-1">
                      <input
                        type="number"
                        value={localSettings.priceEssenceNormal}
                        onChange={(e) => setLocalSettings({ ...localSettings, priceEssenceNormal: Number(e.target.value) || 0 })}
                        className="w-full h-9 px-2 rounded-lg bg-black/[0.02] border border-black/[0.08] font-mono text-sm font-bold text-center outline-none"
                      />
                      <span className="font-bold text-[#1D1D1F]">ج/جم</span>
                    </div>
                    <span className="text-[10px] text-[#86868B] block">المعيار المعتمد: 10 جنيه/جرام</span>
                  </div>

                  <div className="p-3.5 rounded-2xl bg-white border border-teal-200 space-y-1.5 text-right">
                    <span className="text-teal-800 text-[11px] block font-black">🌿 زيت النيش (جنيه/جرام):</span>
                    <div className="flex items-center gap-1">
                      <input
                        type="number"
                        value={localSettings.priceEssenceNiche ?? 15}
                        onChange={(e) => setLocalSettings({ ...localSettings, priceEssenceNiche: Number(e.target.value) || 0 })}
                        className="w-full h-9 px-2 rounded-lg bg-teal-50/40 border border-teal-200 font-mono text-sm font-bold text-center outline-none text-teal-900"
                      />
                      <span className="font-bold text-[#1D1D1F]">ج/جم</span>
                    </div>
                    <span className="text-[10px] text-teal-700 font-bold block">المعيار المعتمد: 15 جنيه/جرام (+5ج/جم عن العادي)</span>
                  </div>

                  <div className="p-3.5 rounded-2xl bg-white border border-amber-200 space-y-1.5 text-right">
                    <span className="text-amber-800 text-[11px] block font-black">🟤 العود والمسك (جنيه/جرام):</span>
                    <div className="flex items-center gap-1">
                      <input
                        type="number"
                        value={localSettings.priceEssenceSpecial}
                        onChange={(e) => setLocalSettings({ ...localSettings, priceEssenceSpecial: Number(e.target.value) || 0 })}
                        className="w-full h-9 px-2 rounded-lg bg-amber-50/40 border border-amber-200 font-mono text-sm font-bold text-center outline-none text-amber-900"
                      />
                      <span className="font-bold text-[#1D1D1F]">ج/جم</span>
                    </div>
                    <span className="text-[10px] text-amber-800 font-bold block">المعيار المعتمد: 20 جنيه/جرام (+10ج/جم عن العادي)</span>
                  </div>
                </div>
              </div>

              {/* Section 7 & 8 of Reference: Colored Bottle & Packaging Costs */}
              <div className="space-y-2">
                <h3 className="text-xs font-black text-[#1D1D1F]">🎁 سابعًا وثامنًا: تكاليف العبوة العادية والملونة والتغليف</h3>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
                  <div className="p-3 rounded-2xl bg-white border border-black/[0.08] space-y-1 text-right">
                    <span className="text-[#86868B] text-[10px] block font-bold">العبوة العادية + البخاخ:</span>
                    <div className="flex items-center gap-1">
                      <input
                        type="number"
                        value={localSettings.standardBottleAndSprayCost ?? 15}
                        onChange={(e) => setLocalSettings({ ...localSettings, standardBottleAndSprayCost: Number(e.target.value) || 0 })}
                        className="w-full h-8 px-2 rounded-lg bg-black/[0.02] border border-black/[0.08] font-mono text-xs font-bold text-center outline-none"
                      />
                      <span className="font-bold">ج</span>
                    </div>
                    <span className="text-[9px] text-[#86868B] block">معتمد: 15 جنيه</span>
                  </div>

                  <div className="p-3 rounded-2xl bg-amber-50/50 border border-amber-200 space-y-1 text-right">
                    <span className="text-amber-900 text-[10px] block font-bold">العبوة الملونة (فرق +35ج):</span>
                    <div className="flex items-center gap-1">
                      <input
                        type="number"
                        value={localSettings.coloredBottleCost ?? 50}
                        onChange={(e) => setLocalSettings({ ...localSettings, coloredBottleCost: Number(e.target.value) || 0 })}
                        className="w-full h-8 px-2 rounded-lg bg-white border border-amber-200 font-mono text-xs font-bold text-center outline-none text-amber-900"
                      />
                      <span className="font-bold">ج</span>
                    </div>
                    <span className="text-[9px] text-amber-800 block">معتمد: 50 جنيه (فرق 35ج)</span>
                  </div>

                  <div className="p-3 rounded-2xl bg-white border border-black/[0.08] space-y-1 text-right">
                    <span className="text-[#86868B] text-[10px] block font-bold">الاستيكر:</span>
                    <div className="flex items-center gap-1">
                      <input
                        type="number"
                        value={localSettings.stickerCost ?? 1}
                        onChange={(e) => setLocalSettings({ ...localSettings, stickerCost: Number(e.target.value) || 0 })}
                        className="w-full h-8 px-2 rounded-lg bg-black/[0.02] border border-black/[0.08] font-mono text-xs font-bold text-center outline-none"
                      />
                      <span className="font-bold">ج</span>
                    </div>
                    <span className="text-[9px] text-[#86868B] block">معتمد: 1 جنيه</span>
                  </div>

                  <div className="p-3 rounded-2xl bg-white border border-black/[0.08] space-y-1 text-right">
                    <span className="text-[#86868B] text-[10px] block font-bold">الكيس البلاستيك الأساسي:</span>
                    <div className="flex items-center gap-1">
                      <input
                        type="number"
                        value={localSettings.basicPlasticBagCost ?? 1}
                        onChange={(e) => setLocalSettings({ ...localSettings, basicPlasticBagCost: Number(e.target.value) || 0 })}
                        className="w-full h-8 px-2 rounded-lg bg-black/[0.02] border border-black/[0.08] font-mono text-xs font-bold text-center outline-none"
                      />
                      <span className="font-bold">ج</span>
                    </div>
                    <span className="text-[9px] text-emerald-700 font-bold block">1 جنيه (إلزامي لكل عملية بيع)</span>
                  </div>
                </div>
              </div>

              {/* Complete Commercial & Financial Reference Table */}
              <div className="space-y-3">
                <div className="flex items-center justify-between flex-wrap gap-2">
                  <h3 className="text-xs font-black text-[#1D1D1F] flex items-center gap-1.5">
                    <Sliders size={14} className="text-[#0071E3]" />
                    <span>مصفوفة الأحجام والوصفات والتكاليف المشتقة وصافي المساهمة ({bottleSizes.length} أحجام معتمدة):</span>
                  </h3>
                  <span className="text-[11px] text-amber-800 font-bold">
                    🔒 لا ينشئ النظام سعرًا ملونًا للعود أو المسك أو النيش تلقائيًا إلا باعتماد المالك
                  </span>
                </div>

                <div className="overflow-x-auto rounded-2xl border border-black/[0.08] bg-white">
                  <table className="w-full text-xs text-right">
                    <thead className="bg-black/[0.03] text-[#86868B] font-bold text-[11px] border-b border-black/[0.06]">
                      <tr>
                        <th className="p-2.5">الحجم والوصفة التشغيلية</th>
                        <th className="p-2.5">العادي (سعر / تكلفة / مساهمة)</th>
                        <th className="p-2.5 text-amber-800">🎁 العبوة الملونة (عادي)</th>
                        <th className="p-2.5">سعر النيش/العود/المسك</th>
                        <th className="p-2.5 text-teal-800">🌿 النيش (تكلفة / مساهمة)</th>
                        <th className="p-2.5 text-amber-900">🟤 العود والمسك (تكلفة / مساهمة)</th>
                        <th className="p-2.5 text-center">إجراءات المالك</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-black/[0.04]">
                      {bottleSizes.map(b => {
                        const row = buildCommercialReferenceRow(b, localSettings);
                        return (
                          <tr key={b.id} className="hover:bg-black/[0.01] transition-colors">
                            <td className="p-2.5">
                              <div className="font-mono font-black text-[#1D1D1F] flex items-center gap-1.5">
                                <span>{b.sizeMl} مل</span>
                                <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-sans font-bold ${
                                  b.isRollOn ? 'bg-purple-100 text-purple-900' : 'bg-blue-50 text-blue-800'
                                }`}>
                                  {b.isRollOn ? 'رول' : 'بخاخ'}
                                </span>
                                {b.isActive === false ? (
                                  <span className="text-[10px] px-1.5 py-0.5 rounded-full font-sans font-bold bg-rose-100 text-rose-700">
                                    غير نشط (محفوظ تاريخياً)
                                  </span>
                                ) : (
                                  <span className="text-[10px] px-1.5 py-0.5 rounded-full font-sans font-bold bg-emerald-100 text-emerald-700">
                                    نشط
                                  </span>
                                )}
                              </div>
                              <span className="text-[10px] text-[#86868B] font-mono block">
                                {b.isRollOn ? `${b.essenceGrams} جم زيت خام بدون كحول` : `${b.essenceGrams} جم زيت + 1 جم مثبت + كحول`}
                              </span>
                            </td>
                            <td className="p-2.5 font-mono text-[11px]">
                              <div>بيع: <strong className="text-[#0071E3]">{row.normalPrice}ج</strong> · تكلفة: <strong>{row.normalCost}ج</strong></div>
                              <div className="text-emerald-700 font-black">عمولة {row.normalComm5}ج ⬅ +{row.normalContrib5}ج مساهمة</div>
                            </td>
                            <td className="p-2.5 font-mono text-[11px]">
                              {row.coloredNormalPrice ? (
                                <div>
                                  <div>بيع: <strong className="text-amber-800">{row.coloredNormalPrice}ج</strong> · تكلفة: <strong>{row.coloredNormalCost}ج</strong></div>
                                  <div className="text-amber-700 font-black">عمولة {row.coloredNormalComm5}ج ⬅ +{row.coloredNormalContrib5}ج</div>
                                </div>
                              ) : (
                                <span className="text-[10px] text-[#86868B] font-sans">—</span>
                              )}
                            </td>
                            <td className="p-2.5 font-mono font-bold text-[#1D1D1F]">
                              {row.specialPrice} ج
                              <span className="block text-[10px] text-[#86868B] font-normal">عمولة: {row.nicheComm5}ج</span>
                            </td>
                            <td className="p-2.5 font-mono text-[11px] bg-teal-50/30">
                              <div>تكلفة مشتقة: <strong>{row.nicheCost}ج</strong></div>
                              <div className="text-teal-800 font-black">+{row.nicheContrib5}ج مساهمة</div>
                            </td>
                            <td className="p-2.5 font-mono text-[11px] bg-amber-50/30">
                              <div>تكلفة مشتقة: <strong>{row.oudMuskCost}ج</strong></div>
                              <div className={`font-black ${b.sizeMl === 100 && !b.isRollOn ? 'text-rose-600' : 'text-amber-900'}`}>
                                +{row.oudMuskContrib5}ج مساهمة
                              </div>
                            </td>
                            <td className="p-2.5 text-center">
                              <div className="flex items-center justify-center gap-1.5">
                                <button
                                  type="button"
                                  onClick={() => handleOpenBottleModal(b)}
                                  className="w-7 h-7 rounded-lg bg-black/[0.04] hover:bg-[#0071E3] hover:text-white flex items-center justify-center text-[#1D1D1F] transition-colors cursor-pointer"
                                  title="تعديل الحجم والأسعار مع التوثيق الرقابي"
                                >
                                  <Edit3 size={13} />
                                </button>
                                <button
                                  type="button"
                                  onClick={() => handleDeleteBottleSize(b.id)}
                                  className={`px-2 h-7 rounded-lg text-[10px] font-bold flex items-center justify-center transition-colors cursor-pointer ${
                                    b.isActive === false
                                      ? 'bg-emerald-50 hover:bg-emerald-600 hover:text-white text-emerald-700'
                                      : 'bg-rose-50 hover:bg-rose-600 hover:text-white text-rose-700'
                                  }`}
                                  title={b.isActive === false ? 'إعادة تفعيل الحجم' : 'إيقاف الحجم وتحويله إلى غير نشط مع بقاء السجلات التاريخية محفوظة'}
                                >
                                  {b.isActive === false ? 'تفعيل' : 'إيقاف'}
                                </button>
                              </div>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}

          {/* ======================================================== */}
          {/* SECTION 3: BUDGET MANAGEMENT & FINANCIAL VAULTS          */}
          {/* ======================================================== */}
          {(activeSection === 'budget_management' || activeSection === 'budget' || activeSection === 'vaults') && (
            <div className="space-y-4 animate-in fade-in duration-150">
              {/* Budget Sub-Tabs Switcher */}
              <div className="apple-glass rounded-2xl p-2 border border-black/[0.06] shadow-apple-xs flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setBudgetSubTab('budget_target')}
                  className={`flex-1 py-2.5 px-3 rounded-xl text-xs font-bold transition-all flex items-center justify-center gap-2 cursor-pointer ${
                    budgetSubTab === 'budget_target'
                      ? 'bg-[#1D1D1F] text-white shadow-apple-xs'
                      : 'text-[#86868B] hover:text-[#1D1D1F] hover:bg-black/[0.04]'
                  }`}
                >
                  <Target size={15} className={budgetSubTab === 'budget_target' ? 'text-amber-400' : 'text-blue-600'} />
                  <span>1. الموازنة الشهرية المعتمدة (15,000 ج) والتارجت والرواتب</span>
                </button>
                <button
                  type="button"
                  onClick={() => setBudgetSubTab('vaults')}
                  className={`flex-1 py-2.5 px-3 rounded-xl text-xs font-bold transition-all flex items-center justify-center gap-2 cursor-pointer ${
                    budgetSubTab === 'vaults'
                      ? 'bg-[#1D1D1F] text-white shadow-apple-xs'
                      : 'text-[#86868B] hover:text-[#1D1D1F] hover:bg-black/[0.04]'
                  }`}
                >
                  <Wallet size={15} className={budgetSubTab === 'vaults' ? 'text-amber-400' : 'text-amber-600'} />
                  <span>2. منظومة الخزائن المالية والمسحوبات المصنفة</span>
                </button>
              </div>

              {/* SubTab 1: Interactive Real-time Editable Fixed Budget & Targets */}
              {budgetSubTab === 'budget_target' && (
                <div className="apple-glass rounded-3xl p-5 sm:p-7 border border-black/[0.06] shadow-apple-card space-y-6">
                  {/* Executive Header */}
                  <div className="pb-4 border-b border-black/[0.06] flex flex-col md:flex-row md:items-center justify-between gap-3">
                    <div>
                      <div className="flex items-center gap-2 flex-wrap">
                        <h2 className="text-lg font-black text-[#1D1D1F]">الموازنة الشهرية المعتمدة والتارجت ومسير الرواتب</h2>
                        <span className="text-[10px] font-black px-2.5 py-0.5 rounded-full bg-emerald-500/15 text-emerald-800 border border-emerald-500/30 flex items-center gap-1">
                          <span className="w-1.5 h-1.5 rounded-full bg-emerald-600 animate-pulse" />
                          <span>حفظ تلقائي فوري ومزامنة سحابية</span>
                        </span>
                      </div>
                      <p className="text-xs text-[#86868B] mt-1">
                        تعديل فوري لأي بند في الميزانية مع حسابات تلقائية في الوقت الفعلي وحفظ فوري في الذاكرة وقاعدة البيانات.
                      </p>
                    </div>

                    <div className="flex items-center gap-2 flex-wrap">
                      <button
                        type="button"
                        onClick={() => setShowAddBudgetItemModal(true)}
                        className="px-3.5 py-2 rounded-xl text-xs font-bold bg-[#0071E3] text-white hover:bg-[#0077ED] transition-all flex items-center gap-1.5 shadow-apple-xs cursor-pointer"
                      >
                        <Plus size={14} />
                        <span>إضافة بند موازنة جديد</span>
                      </button>

                      <button
                        type="button"
                        onClick={handleResetBudgetDefaults}
                        title="استعادة موازنة الـ 15,000 ج المعتمدة رسمياً"
                        className="px-3 py-2 rounded-xl text-xs font-bold bg-black/[0.04] text-[#1D1D1F] hover:bg-black/[0.08] transition-all flex items-center gap-1.5 border border-black/[0.06] cursor-pointer"
                      >
                        <RotateCcw size={13} />
                        <span>استعادة المعتمد (15,000 ج)</span>
                      </button>
                    </div>
                  </div>

                  {/* Real-time Summary Stats Cards */}
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs">
                    {/* Card 1: Total Budget */}
                    <div className="p-4 rounded-2xl bg-white border border-black/[0.08] shadow-apple-xs space-y-2">
                      <div className="flex items-center justify-between">
                        <span className="text-[#86868B] text-[11px] font-bold">إجمالي الموازنة الشهرية المخططة:</span>
                        <span className="text-[10px] font-mono font-bold text-amber-700 bg-amber-50 px-2 py-0.5 rounded-md border border-amber-200">
                          محسوب تلقائياً
                        </span>
                      </div>
                      <SmoothNumberInput
                        value={computedTotalBudget}
                        onChange={(val) => {
                          setLocalSettings((prev) => ({
                            ...prev,
                            monthlyFixedBudget: val,
                          }));
                        }}
                        quickDeltas={[500, 1000, 2000]}
                        suffix="ج.م/شهر"
                        size="md"
                        showQuickButtons={false}
                      />
                      <span className="text-[10px] text-gray-500 font-bold block">
                        مجموع الـ {currentBudgetItems.length} بنود تشغيلية وإدارية
                      </span>
                    </div>

                    {/* Card 2: Work Days */}
                    <div className="p-4 rounded-2xl bg-white border border-black/[0.08] shadow-apple-xs space-y-2">
                      <div className="flex items-center justify-between">
                        <span className="text-[#86868B] text-[11px] font-bold">أيام العمل التخطيطية بالشهر:</span>
                        <span className="text-[10px] font-mono font-bold text-blue-700 bg-blue-50 px-2 py-0.5 rounded-md border border-blue-200">
                          {computedDailyShare} ج/يوم
                        </span>
                      </div>
                      <SmoothNumberInput
                        value={localSettings.monthlyWorkDays || 25}
                        onChange={(val) => {
                          const cleanDays = Math.max(1, Math.min(31, val));
                          setLocalSettings((prev) => ({
                            ...prev,
                            monthlyWorkDays: cleanDays,
                          }));
                        }}
                        min={1}
                        max={31}
                        quickDeltas={[1, 5]}
                        suffix="يوم عمل"
                        size="md"
                        showQuickButtons={false}
                      />
                      <span className="text-[10px] text-blue-800 font-bold block">
                        نصيب اليوم لتغطية الموازنة: {computedDailyShare} ج.م
                      </span>
                    </div>

                    {/* Card 3: Target Profit */}
                    <div className="p-4 rounded-2xl bg-white border border-black/[0.08] shadow-apple-xs space-y-2">
                      <div className="flex items-center justify-between">
                        <span className="text-[#86868B] text-[11px] font-bold">التارجت اليومي المستهدف:</span>
                        <span className="text-[10px] font-mono font-bold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-md border border-emerald-200">
                          نقطة التعادل
                        </span>
                      </div>
                      <SmoothNumberInput
                        value={localSettings.dailyTargetProfit || 600}
                        onChange={(val) => {
                          setLocalSettings((prev) => ({
                            ...prev,
                            dailyTargetProfit: val,
                          }));
                        }}
                        quickDeltas={[100, 200, 400]}
                        suffix="ج.م/يوم"
                        size="md"
                        showQuickButtons={false}
                      />
                      <span className="text-[10px] text-emerald-800 font-bold block">
                        المرحلة الأولى: 600ج / الثانية: 1000ج مساهمة يومية
                      </span>
                    </div>
                  </div>

                  {/* Payroll & Salaries - Real-time Smooth Editing */}
                  <div className="p-4 rounded-2xl bg-black/[0.02] border border-black/[0.06] space-y-3">
                    <div className="flex items-center justify-between">
                      <h3 className="text-xs font-black text-[#1D1D1F] flex items-center gap-1.5">
                        <Users size={14} className="text-[#0071E3]" />
                        <span>مسير الرواتب المعتمد ضمن الموازنة (11,500 ج.م إجمالي):</span>
                      </h3>
                      <span className="text-[10px] font-bold text-purple-800 bg-purple-50 px-2.5 py-0.5 rounded-full border border-purple-200">
                        المدير: {localSettings.ownerSalary || 10500} ج + طارق: {localSettings.employeeBaseSalary || 1000} ج
                      </span>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
                      {/* Owner Salary */}
                      <div className="p-3.5 bg-white rounded-xl border border-black/[0.06] shadow-apple-xs space-y-2">
                        <div className="flex items-center justify-between">
                          <span className="text-[#86868B] text-[11px] font-bold">راتب الإدارة (د. محمد مهران):</span>
                          <span className="text-[10px] font-mono font-bold text-emerald-700">
                            {Math.round((localSettings.ownerSalary || 10500) / (localSettings.monthlyWorkDays || 25))} ج/يوم
                          </span>
                        </div>
                        <SmoothNumberInput
                          value={localSettings.ownerSalary || 10500}
                          onChange={(val) => {
                            handleUpdateBudgetItemAmount('salary_owner', val);
                          }}
                          quickDeltas={[500, 1000]}
                          suffix="ج.م/شهر"
                          size="md"
                        />
                        <span className="text-[10px] text-gray-500 block">
                          مخصص الإدارة والإشراف العام (10,500 ج معتمد رسمياً)
                        </span>
                      </div>

                      {/* Employee Salary */}
                      <div className="p-3.5 bg-white rounded-xl border border-black/[0.06] shadow-apple-xs space-y-2">
                        <div className="flex items-center justify-between">
                          <span className="text-[#86868B] text-[11px] font-bold">الراتب الأساسي لطارق (المبيعات):</span>
                          <span className="text-[10px] font-mono font-bold text-amber-700">
                            {Math.round((localSettings.employeeBaseSalary || 1000) / (localSettings.monthlyWorkDays || 25))} ج/يوم
                          </span>
                        </div>
                        <SmoothNumberInput
                          value={localSettings.employeeBaseSalary || 1000}
                          onChange={(val) => {
                            handleUpdateBudgetItemAmount('salary_tarek', val);
                          }}
                          quickDeltas={[100, 200, 500]}
                          suffix="ج.م/شهر"
                          size="md"
                        />
                        <span className="text-[10px] text-purple-800 font-bold block">
                          🔒 الراتب الأساسي لطارق 1,000 ج.م + العمولات المتدرجة الفورية (5% - 7%)
                        </span>
                      </div>
                    </div>
                  </div>

                  {/* Interactive Full Budget Table with Real-time Inline Inputs */}
                  <div className="p-4 rounded-2xl bg-white border border-black/[0.08] shadow-apple-xs space-y-3">
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-2 border-b border-black/[0.06]">
                      <div>
                        <span className="font-black text-xs text-[#1D1D1F]">
                          تفصيل وتعديل بنود الموازنة الشهرية ({computedTotalBudget.toLocaleString('ar-EG')} ج.م / شهر):
                        </span>
                        <p className="text-[11px] text-gray-500 mt-0.5">
                          يمكنك تعديل أي رقم مباشرة وسيتولى النظام إعادة الحساب والحفظ التلقائي فوراً.
                        </p>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="text-[10px] font-bold text-amber-800 bg-amber-50 px-2 py-0.5 rounded-full border border-amber-200">
                          نصيب اليوم: {computedDailyShare} ج على {localSettings.monthlyWorkDays || 25} يوم
                        </span>
                      </div>
                    </div>

                    <div className="overflow-x-auto">
                      <table className="w-full text-right text-xs">
                        <thead>
                          <tr className="border-b border-black/[0.06] text-[#86868B] text-[11px]">
                            <th className="py-2.5 font-bold">البند التشغيلي</th>
                            <th className="py-2.5 font-bold text-center">التصنيف</th>
                            <th className="py-2.5 font-bold text-center min-w-[200px]">المخصص الشهري (تعديل مباشر)</th>
                            <th className="py-2.5 font-bold text-center">المعدل اليومي</th>
                            <th className="py-2.5 font-bold text-center">النسبة من الموازنة</th>
                            <th className="py-2.5 font-bold text-center">إجراءات</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-black/[0.04]">
                          {currentBudgetItems.map((item) => {
                            const pct = computedTotalBudget > 0 ? Math.round((item.monthlyAmount / computedTotalBudget) * 100) : 0;
                            const isCoreSalary = item.id === 'salary_owner' || item.id === 'salary_tarek';

                            return (
                              <tr key={item.id} className="hover:bg-black/[0.02] transition-colors">
                                <td className="py-2 font-bold text-[#1D1D1F]">
                                  <div className="flex items-center gap-1.5">
                                    <span>{item.name}</span>
                                    {isCoreSalary && (
                                      <span className="text-[9.5px] font-bold text-purple-700 bg-purple-50 px-1.5 py-0.2 rounded border border-purple-200">
                                        أساسي
                                      </span>
                                    )}
                                  </div>
                                </td>
                                <td className="py-2 text-center text-[10px] text-gray-500 font-bold">
                                  {item.category === 'rent'
                                    ? 'إيجار ثابت'
                                    : item.category === 'salaries'
                                    ? 'رواتب كادر'
                                    : item.category === 'contingency'
                                    ? 'طوارئ وهالك'
                                    : 'مرافق وتشغيل'}
                                </td>
                                <td className="py-2 text-center">
                                  <div className="max-w-[220px] mx-auto">
                                    <SmoothNumberInput
                                      value={item.monthlyAmount}
                                      onChange={(val) => handleUpdateBudgetItemAmount(item.id, val)}
                                      quickDeltas={[100, 500]}
                                      suffix="ج"
                                      size="sm"
                                    />
                                  </div>
                                </td>
                                <td className="py-2 font-mono font-bold text-center text-emerald-700">
                                  {Math.round(item.monthlyAmount / (localSettings.monthlyWorkDays || 25)).toLocaleString('ar-EG')} ج/يوم
                                </td>
                                <td className="py-2 font-mono font-bold text-center text-slate-600">
                                  <span className="px-2 py-0.5 rounded-full bg-slate-100 text-[10px]">
                                    {pct}%
                                  </span>
                                </td>
                                <td className="py-2 text-center">
                                  {!isCoreSalary ? (
                                    <button
                                      type="button"
                                      onClick={() => handleRemoveBudgetItem(item.id)}
                                      className="p-1 text-gray-400 hover:text-red-500 transition-colors"
                                      title="حذف هذا البند"
                                    >
                                      <Trash2 size={14} />
                                    </button>
                                  ) : (
                                    <span className="text-[10px] text-gray-400">—</span>
                                  )}
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                        <tfoot>
                          <tr className="border-t-2 border-black/[0.1] bg-black/[0.02] font-black">
                            <td className="py-3 px-2 text-[#1D1D1F]">الإجمالي الكلي للموازنة:</td>
                            <td className="py-3 text-center text-gray-500">{currentBudgetItems.length} بنود</td>
                            <td className="py-3 font-mono text-center text-base text-[#0071E3]">
                              {computedTotalBudget.toLocaleString('ar-EG')} ج.م
                            </td>
                            <td className="py-3 font-mono text-center text-emerald-700">
                              {computedDailyShare.toLocaleString('ar-EG')} ج.م/يوم
                            </td>
                            <td className="py-3 text-center text-slate-900">100%</td>
                            <td className="py-3 text-center">
                              <span className="text-[10px] text-emerald-700 font-bold">✓ متطابق</span>
                            </td>
                          </tr>
                        </tfoot>
                      </table>
                    </div>
                  </div>

                  {/* Auto-Save & Manual Confirm Banner */}
                  <div className="flex flex-col sm:flex-row items-center justify-between gap-3 pt-2 border-t border-black/[0.06]">
                    <div className="flex items-center gap-2 text-xs text-emerald-700 font-bold">
                      <CheckCircle2 size={16} className="text-emerald-600 shrink-0" />
                      <span>جميع الأرقام تُحفظ تلقائياً في الذاكرة المحلية وتُزامن فوراً مع قاعدة البيانات السحابية.</span>
                    </div>

                    <button
                      type="button"
                      onClick={() => handleSaveSettings()}
                      className="apple-btn flex items-center gap-2 px-5 py-2.5 rounded-2xl bg-[#0071E3] hover:bg-[#0077ED] text-white text-xs font-bold shadow-apple-xs transition-all cursor-pointer"
                    >
                      <Save size={14} />
                      <span>تأكيد الحفظ والمزامنة السحابية فوراً</span>
                    </button>
                  </div>
                </div>
              )}

              {/* Add Custom Budget Item Modal */}
              {showAddBudgetItemModal && (
                <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs">
                  <div className="relative w-full max-w-md rounded-3xl bg-white border border-black/[0.1] p-5 shadow-2xl space-y-4">
                    <div className="flex items-center justify-between border-b border-black/[0.06] pb-3">
                      <h3 className="text-sm font-black text-[#1D1D1F] flex items-center gap-2">
                        <Plus size={16} className="text-[#0071E3]" />
                        <span>إضافة بند موازنة تشغيلي جديد</span>
                      </h3>
                      <button
                        type="button"
                        onClick={() => setShowAddBudgetItemModal(false)}
                        className="p-1 text-gray-400 hover:text-black"
                      >
                        <X size={18} />
                      </button>
                    </div>

                    <form onSubmit={handleAddBudgetItem} className="space-y-3.5 text-xs">
                      <div>
                        <label className="font-bold block mb-1">اسم البند التشغيلي:</label>
                        <input
                          type="text"
                          required
                          placeholder="مثال: دعاية وتسويق، صيانة دورية، مستلزمات تغليف"
                          value={newBudgetItemName}
                          onChange={(e) => setNewBudgetItemName(e.target.value)}
                          className="w-full h-10 px-3 rounded-xl border border-black/[0.1] text-xs font-bold outline-none focus:border-[#0071E3]"
                        />
                      </div>

                      <div>
                        <label className="font-bold block mb-1">تصنيف البند:</label>
                        <select
                          value={newBudgetItemCategory}
                          onChange={(e) => setNewBudgetItemCategory(e.target.value)}
                          className="w-full h-10 px-3 rounded-xl border border-black/[0.1] text-xs font-bold outline-none focus:border-[#0071E3] bg-white"
                        >
                          <option value="utilities">مرافق وتشغيل</option>
                          <option value="rent">إيجارات ومقرات</option>
                          <option value="salaries">رواتب وأجور</option>
                          <option value="contingency">طوارئ وهالك واحتياطي</option>
                        </select>
                      </div>

                      <div>
                        <label className="font-bold block mb-1">المبلغ المخصص شهرياً (ج.م):</label>
                        <SmoothNumberInput
                          value={newBudgetItemAmount}
                          onChange={setNewBudgetItemAmount}
                          quickDeltas={[100, 200, 500, 1000]}
                          suffix="ج.م/شهر"
                          size="md"
                        />
                      </div>

                      <div className="pt-2 flex justify-end gap-2 border-t border-black/[0.06]">
                        <button
                          type="button"
                          onClick={() => setShowAddBudgetItemModal(false)}
                          className="px-4 py-2 rounded-xl bg-gray-100 font-bold"
                        >
                          إلغاء
                        </button>
                        <button
                          type="submit"
                          className="px-5 py-2 rounded-xl bg-[#0071E3] text-white font-bold shadow-apple-xs cursor-pointer"
                        >
                          إضافة البند للموازنة ✓
                        </button>
                      </div>
                    </form>
                  </div>
                </div>
              )}

              {/* SubTab 2: Financial Vaults Full Management */}
              {budgetSubTab === 'vaults' && (
                <div className="space-y-4">
                  <FinancialVaults
                    vaults={vaults}
                    withdrawals={withdrawals}
                    sales={sales}
                    expenses={expenses}
                    settings={localSettings}
                    onAddWithdrawal={onAddWithdrawal || (() => {})}
                  />
                </div>
              )}
            </div>
          )}

          {/* ======================================================== */}
          {/* SECTION 5: PRIVACY & ADMINISTRATIVE SECRETS              */}
          {/* ======================================================== */}
          {((activeSection === 'system_settings' && systemSubTab === 'security_backup') || activeSection === 'privacy') && (
            <div className="apple-glass rounded-3xl p-5 sm:p-7 border border-black/[0.06] shadow-apple-card space-y-6 animate-in fade-in duration-150">
              <div className="pb-3 border-b border-black/[0.06] flex items-center justify-between">
                <div>
                  <h2 className="text-lg font-black text-[#1D1D1F]">السرية المؤسسية وحماية أسرار الإدارة</h2>
                  <p className="text-xs text-[#86868B]">ضبط عزل البيانات المالية والتكاليف وهوامش الربح وفق أعلى معايير أمن المعلومات.</p>
                </div>
                <div className="w-10 h-10 rounded-2xl bg-purple-500/10 text-purple-700 flex items-center justify-center font-bold">
                  <ShieldCheck size={20} />
                </div>
              </div>

              <div className="space-y-3">
                <div className="p-4 rounded-2xl bg-white border border-black/[0.08] space-y-3">
                  <div className="flex items-center justify-between">
                    <div>
                      <h4 className="font-bold text-xs text-[#1D1D1F]">حجب هوامش وصافي الأرباح عن الكاشير والموظفين</h4>
                      <p className="text-[11px] text-[#86868B]">
                        الكاشير يشاهد فقط سعر البيع للزبون، العبوات، والكميات، دون إظهار ربح القطعة أو صافي دخل المتجر.
                      </p>
                    </div>
                    <span className="px-2.5 py-1 rounded-full bg-emerald-100 text-emerald-900 text-[10px] font-bold">
                      مفعل ومحمٍ دائماً
                    </span>
                  </div>
                </div>

                <div className="p-4 rounded-2xl bg-white border border-black/[0.08] space-y-3">
                  <div className="flex items-center justify-between">
                    <div>
                      <h4 className="font-bold text-xs text-[#1D1D1F]">حجب تكاليف الخامات وأسعار الجملة عن غير الإدارة</h4>
                      <p className="text-[11px] text-[#86868B]">
                        أسعار شراء الزيوت من الموردين وتكلفة الزجاجة الخام تعتبر أسراراً تجارية مقفلة على الإدارة.
                      </p>
                    </div>
                    <span className="px-2.5 py-1 rounded-full bg-emerald-100 text-emerald-900 text-[10px] font-bold">
                      مفعل ومحمٍ دائماً
                    </span>
                  </div>
                </div>

                <div className="p-4 rounded-2xl bg-white border border-black/[0.08] space-y-3">
                  <div className="flex items-center justify-between">
                    <div>
                      <h4 className="font-bold text-xs text-[#1D1D1F]">عزل الخزائن ومسير الرواتب والموازنة</h4>
                      <p className="text-[11px] text-[#86868B]">
                        لا تظهر أقسام الخزائن ومسير الرواتب إلا للمدير العام صاحب الصلاحية الشاملة.
                      </p>
                    </div>
                    <span className="px-2.5 py-1 rounded-full bg-emerald-100 text-emerald-900 text-[10px] font-bold">
                      مفعل ومحمٍ دائماً
                    </span>
                  </div>
                </div>

                {onNavigate && (
                  <div className="pt-2">
                    <button
                      type="button"
                      onClick={() => onNavigate(View.USERS_MANAGEMENT)}
                      className="apple-btn w-full p-3.5 rounded-2xl bg-[#1D1D1F] hover:bg-black text-white text-xs font-bold flex items-center justify-between"
                    >
                      <div className="flex items-center gap-2">
                        <Users size={16} className="text-[#C49746]" />
                        <span>فتح لوحة إدارة المستخدمين وضبط صلاحيات كل موظف بالتفصيل</span>
                      </div>
                      <ArrowRight size={15} />
                    </button>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* ======================================================== */}
          {/* SECTION 6: COMPREHENSIVE RECEIPT & PRINT STUDIO          */}
          {/* ======================================================== */}
          {((activeSection === 'system_settings' && systemSubTab === 'pos_receipts') || activeSection === 'pos_receipts') && (
            <div className="apple-glass rounded-3xl p-5 sm:p-7 border border-black/[0.06] shadow-apple-card space-y-6 animate-in fade-in duration-150">
              {/* Top Header & Quick Global Presets */}
              <div className="pb-4 border-b border-black/[0.06] flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div className="flex items-center gap-3">
                  <div className="w-11 h-11 rounded-2xl bg-[#0071E3] text-white flex items-center justify-center font-bold shadow-xs shrink-0">
                    <Receipt size={22} />
                  </div>
                  <div>
                    <h2 className="text-lg font-black text-[#1D1D1F]">
                      استوديو التحكم الشامل في الفواتير والطباعة (معاينة فورية)
                    </h2>
                    <p className="text-xs text-[#86868B]">
                      تحكم كامل في إظهار أو إخفاء كل عنصر، نوع وحجم وسُمك ولون الخط، مقاس الورق، والهوية مع معاينة حية قبل الاعتماد.
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-2 self-end sm:self-auto">
                  <button
                    type="button"
                    onClick={handleRestoreDefaultReceiptStudio}
                    className="apple-btn px-3 py-2 rounded-xl bg-black/[0.05] hover:bg-black/[0.1] text-xs font-bold text-[#1D1D1F] flex items-center gap-1.5 cursor-pointer"
                  >
                    <RotateCcw size={13} />
                    <span>استعادة الافتراضي</span>
                  </button>
                  <button
                    type="button"
                    onClick={handleApproveReceiptStudio}
                    className="apple-btn px-4 py-2 rounded-xl bg-[#0071E3] hover:bg-[#0077ED] text-white text-xs font-black flex items-center gap-1.5 shadow-xs cursor-pointer"
                  >
                    <Check size={14} />
                    <span>اعتماد وتطبيق التصميم</span>
                  </button>
                </div>
              </div>

              {/* 3 One-Click Global Templates */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5 text-xs">
                <button
                  type="button"
                  onClick={() =>
                    setDraftReceiptDesign({
                      ...DEFAULT_RECEIPT_DESIGN,
                      paperWidth: '80mm',
                      highContrastThermal: true,
                      fontFamily: 'cairo',
                      baseFontSizePx: 11,
                      headerTitleSizePx: 15,
                      fontWeight: 'bold',
                    })
                  }
                  className="p-3 rounded-2xl bg-white hover:bg-black/[0.02] border border-black/[0.08] text-right space-y-1 transition-all cursor-pointer"
                >
                  <div className="font-black text-[#1D1D1F] flex items-center justify-between">
                    <span>🎯 الكاشير الحراري القياسي (80mm)</span>
                    <span className="text-[10px] font-mono text-[#0071E3]">موصى به</span>
                  </div>
                  <p className="text-[10px] text-[#86868B]">
                    تباين أسود فائق الوضوح مع كافة تفاصيل العبوات والضمان ونصيحة الثبات.
                  </p>
                </button>

                <button
                  type="button"
                  onClick={() =>
                    setDraftReceiptDesign({
                      ...DEFAULT_RECEIPT_DESIGN,
                      paperWidth: '80mm',
                      highContrastThermal: false,
                      primaryTextColor: '#1D1D1F',
                      accentColor: '#C49746',
                      fontFamily: 'amiri',
                      baseFontSizePx: 12,
                      headerTitleSizePx: 18,
                      borderStyle: 'double',
                    })
                  }
                  className="p-3 rounded-2xl bg-white hover:bg-black/[0.02] border border-black/[0.08] text-right space-y-1 transition-all cursor-pointer"
                >
                  <div className="font-black text-[#1D1D1F] flex items-center justify-between">
                    <span>✨ لمسة عطر الملكي الفاخر</span>
                    <span className="text-[10px] font-bold text-[#C49746]">ذهبي وكربوني</span>
                  </div>
                  <p className="text-[10px] text-[#86868B]">
                    خط Amiri كلاسيكي فاخر مع فواصل مزدوجة ولون ذهبي ملكي للهوية.
                  </p>
                </button>

                <button
                  type="button"
                  onClick={() =>
                    setDraftReceiptDesign({
                      ...DEFAULT_RECEIPT_DESIGN,
                      paperWidth: '58mm',
                      paddingMm: 2,
                      baseFontSizePx: 10,
                      headerTitleSizePx: 13,
                      totalFontSizePx: 12,
                      lineSpacing: 'compact',
                      showLogo: false,
                      showStoreAddress: false,
                      showPerfumeCareTip: false,
                      showReturnPolicy: false,
                      showQrCode: false,
                    })
                  }
                  className="p-3 rounded-2xl bg-white hover:bg-black/[0.02] border border-black/[0.08] text-right space-y-1 transition-all cursor-pointer"
                >
                  <div className="font-black text-[#1D1D1F] flex items-center justify-between">
                    <span>⚡ إيصال سريع مدمج (58mm)</span>
                    <span className="text-[10px] font-mono text-emerald-700">توفير الورق</span>
                  </div>
                  <p className="text-[10px] text-[#86868B]">
                    مصمم للطابعات الصغيرة 58mm مع اختصار الهوامش وتوفير طول الورقة.
                  </p>
                </button>
              </div>

              {/* Side-by-Side Studio: Controls + Instant Live Preview */}
              <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 items-start">
                {/* Controls Column (7 cols) */}
                <div className="lg:col-span-7 space-y-4">
                  {/* Segmented Studio Sub-Tabs */}
                  <div className="grid grid-cols-4 gap-1 bg-[#F2F2F7] p-1 rounded-2xl border border-black/[0.05]">
                    {[
                      { id: 'elements', label: 'العناصر (18)', icon: Eye },
                      { id: 'typography', label: 'الخط واللون', icon: Type },
                      { id: 'layout', label: 'الورق والإطار', icon: Layout },
                      { id: 'branding', label: 'النصوص والهوية', icon: Store },
                    ].map((t) => {
                      const Icon = t.icon;
                      const active = receiptStudioTab === t.id;
                      return (
                        <button
                          key={t.id}
                          type="button"
                          onClick={() => setReceiptStudioTab(t.id as any)}
                          className={`py-2 px-2 rounded-xl text-[11px] font-black flex items-center justify-center gap-1.5 transition-all cursor-pointer ${
                            active
                              ? 'bg-white text-[#1D1D1F] shadow-xs'
                              : 'text-[#86868B] hover:text-[#1D1D1F]'
                          }`}
                        >
                          <Icon size={13} className={active ? 'text-[#0071E3]' : ''} />
                          <span className="truncate">{t.label}</span>
                        </button>
                      );
                    })}
                  </div>

                  {/* Sub-Tab 1: 18 Element Visibility Toggles */}
                  {receiptStudioTab === 'elements' && (
                    <div className="space-y-3">
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-bold text-[#86868B]">
                          تحكم في إظهار أو إخفاء كل عنصر في الفاتورة:
                        </span>
                        <div className="flex items-center gap-1.5">
                          <button
                            type="button"
                            onClick={() =>
                              setDraftReceiptDesign((prev) => ({
                                ...prev,
                                showLogo: true,
                                showStoreName: true,
                                showStoreSlogan: true,
                                showStoreAddress: true,
                                showStorePhone: true,
                                showTaxNumber: true,
                                showInvoiceNumber: true,
                                showDateTime: true,
                                showCashierName: true,
                                showCustomerInfo: true,
                                showBottleSizeAndGrams: true,
                                showPerfumeCategory: true,
                                showUnitPriceBreakdown: true,
                                showDiscountRow: true,
                                showPaymentMethod: true,
                                showItemsCountSummary: true,
                                showPerfumeCareTip: true,
                                showReturnPolicy: true,
                                showFooterMessage: true,
                                showQrCode: true,
                              }))
                            }
                            className="px-2.5 py-1 rounded-lg bg-[#0071E3]/10 text-[#0071E3] text-[10px] font-bold cursor-pointer"
                          >
                            إظهار كافة العناصر
                          </button>
                          <button
                            type="button"
                            onClick={() =>
                              setDraftReceiptDesign((prev) => ({
                                ...prev,
                                showLogo: false,
                                showStoreName: true,
                                showStoreSlogan: false,
                                showStoreAddress: false,
                                showStorePhone: true,
                                showTaxNumber: false,
                                showInvoiceNumber: true,
                                showDateTime: true,
                                showCashierName: false,
                                showCustomerInfo: false,
                                showBottleSizeAndGrams: true,
                                showPerfumeCategory: false,
                                showUnitPriceBreakdown: false,
                                showDiscountRow: true,
                                showPaymentMethod: true,
                                showItemsCountSummary: false,
                                showPerfumeCareTip: false,
                                showReturnPolicy: false,
                                showFooterMessage: true,
                                showQrCode: false,
                              }))
                            }
                            className="px-2.5 py-1 rounded-lg bg-black/[0.05] text-[#1D1D1F] text-[10px] font-bold cursor-pointer"
                          >
                            إيصال مختصر
                          </button>
                        </div>
                      </div>

                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs">
                        {[
                          { key: 'showLogo', label: 'شعار المتجر (Logo)' },
                          { key: 'showStoreName', label: 'اسم المتجر الرئيسي' },
                          { key: 'showStoreSlogan', label: 'الشعار اللفظي (السلوجان)' },
                          { key: 'showStoreAddress', label: 'عنوان المعرض' },
                          { key: 'showStorePhone', label: 'رقم الهاتف والواتساب' },
                          { key: 'showTaxNumber', label: 'الرقم الضريبي / السجل التجاري' },
                          { key: 'showInvoiceNumber', label: 'رقم الفاتورة التسلسلي' },
                          { key: 'showDateTime', label: 'التاريخ والوقت الدقيق' },
                          { key: 'showCashierName', label: 'اسم مسؤول المبيعات' },
                          { key: 'showCustomerInfo', label: 'اسم ورقم هاتف العميل' },
                          { key: 'showBottleSizeAndGrams', label: 'حجم العبوة وجرامات الزيت' },
                          { key: 'showPerfumeCategory', label: 'تصنيف العطر (عادي / مسك / عود)' },
                          { key: 'showUnitPriceBreakdown', label: 'تفصيل (الكمية × سعر الوحدة)' },
                          { key: 'showItemsCountSummary', label: 'إجمالي عدد العبوات والأصناف' },
                          { key: 'showDiscountRow', label: 'سطر الخصم الممنوح' },
                          { key: 'showPaymentMethod', label: 'طريقة السداد (نقدي/بطاقة/محفظة)' },
                          { key: 'showPerfumeCareTip', label: 'نصيحة ثبات وفوحان العطر' },
                          { key: 'showReturnPolicy', label: 'عبارة ضمان الثبات والاستبدال' },
                          { key: 'showFooterMessage', label: 'رسالة الشكر الختامية' },
                          { key: 'showQrCode', label: 'رمز QR السريع أسفل الفاتورة' },
                        ].map((item) => {
                          const checked = Boolean((draftReceiptDesign as any)[item.key]);
                          return (
                            <label
                              key={item.key}
                              className={`p-3 rounded-2xl border flex items-center justify-between gap-2 cursor-pointer transition-all ${
                                checked
                                  ? 'bg-white border-[#0071E3]/40 shadow-2xs'
                                  : 'bg-black/[0.02] border-black/[0.06] opacity-70'
                              }`}
                            >
                              <span className="text-xs font-bold text-[#1D1D1F]">{item.label}</span>
                              <input
                                type="checkbox"
                                checked={checked}
                                onChange={(e) =>
                                  setDraftReceiptDesign((prev) => ({
                                    ...prev,
                                    [item.key]: e.target.checked,
                                  }))
                                }
                                className="w-4 h-4 accent-[#0071E3] rounded cursor-pointer shrink-0"
                              />
                            </label>
                          );
                        })}
                      </div>
                    </div>
                  )}

                  {/* Sub-Tab 2: Typography, Font Size, Weight & Color */}
                  {receiptStudioTab === 'typography' && (
                    <div className="space-y-3 text-xs">
                      <div className="p-3.5 rounded-2xl bg-white border border-black/[0.08] space-y-2">
                        <label className="font-black text-[#1D1D1F] block">
                          نوع الخط المطبوع (Font Family):
                        </label>
                        <div className="grid grid-cols-2 sm:grid-cols-5 gap-1.5">
                          {[
                            { id: 'cairo', label: 'Cairo عصري' },
                            { id: 'tajawal', label: 'Tajawal ناعم' },
                            { id: 'monospace', label: 'حراري رقمي' },
                            { id: 'amiri', label: 'Amiri ملكي' },
                            { id: 'system', label: 'Apple قياسي' },
                          ].map((f) => (
                            <button
                              key={f.id}
                              type="button"
                              onClick={() =>
                                setDraftReceiptDesign((prev) => ({
                                  ...prev,
                                  fontFamily: f.id as ReceiptDesignConfig['fontFamily'],
                                }))
                              }
                              className={`py-2 px-2 rounded-xl text-[11px] font-bold border transition-all cursor-pointer ${
                                draftReceiptDesign.fontFamily === f.id
                                  ? 'bg-[#1D1D1F] text-white border-[#1D1D1F]'
                                  : 'bg-[#F5F5F7] text-[#1D1D1F] border-transparent hover:bg-black/[0.06]'
                              }`}
                            >
                              {f.label}
                            </button>
                          ))}
                        </div>
                      </div>

                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        <div className="p-3.5 rounded-2xl bg-white border border-black/[0.08] space-y-1.5">
                          <div className="flex justify-between">
                            <span className="font-bold text-[#1D1D1F]">حجم الخط الأساسي:</span>
                            <span className="font-mono font-black text-[#0071E3]">
                              {draftReceiptDesign.baseFontSizePx}px
                            </span>
                          </div>
                          <input
                            type="range"
                            min={9}
                            max={16}
                            step={1}
                            value={draftReceiptDesign.baseFontSizePx}
                            onChange={(e) =>
                              setDraftReceiptDesign((prev) => ({
                                ...prev,
                                baseFontSizePx: Number(e.target.value),
                              }))
                            }
                            className="w-full accent-[#0071E3] cursor-pointer"
                          />
                        </div>

                        <div className="p-3.5 rounded-2xl bg-white border border-black/[0.08] space-y-1.5">
                          <div className="flex justify-between">
                            <span className="font-bold text-[#1D1D1F]">حجم عنوان المتجر:</span>
                            <span className="font-mono font-black text-[#0071E3]">
                              {draftReceiptDesign.headerTitleSizePx}px
                            </span>
                          </div>
                          <input
                            type="range"
                            min={12}
                            max={24}
                            step={1}
                            value={draftReceiptDesign.headerTitleSizePx}
                            onChange={(e) =>
                              setDraftReceiptDesign((prev) => ({
                                ...prev,
                                headerTitleSizePx: Number(e.target.value),
                              }))
                            }
                            className="w-full accent-[#0071E3] cursor-pointer"
                          />
                        </div>

                        <div className="p-3.5 rounded-2xl bg-white border border-black/[0.08] space-y-1.5">
                          <div className="flex justify-between">
                            <span className="font-bold text-[#1D1D1F]">حجم خط الإجمالي النهائي:</span>
                            <span className="font-mono font-black text-[#0071E3]">
                              {draftReceiptDesign.totalFontSizePx}px
                            </span>
                          </div>
                          <input
                            type="range"
                            min={12}
                            max={22}
                            step={1}
                            value={draftReceiptDesign.totalFontSizePx}
                            onChange={(e) =>
                              setDraftReceiptDesign((prev) => ({
                                ...prev,
                                totalFontSizePx: Number(e.target.value),
                              }))
                            }
                            className="w-full accent-[#0071E3] cursor-pointer"
                          />
                        </div>

                        <div className="p-3.5 rounded-2xl bg-white border border-black/[0.08] space-y-1.5">
                          <div className="flex justify-between">
                            <span className="font-bold text-[#1D1D1F]">حجم الشعار (Logo):</span>
                            <span className="font-mono font-black text-[#0071E3]">
                              {draftReceiptDesign.logoSizePx}px
                            </span>
                          </div>
                          <input
                            type="range"
                            min={28}
                            max={80}
                            step={2}
                            value={draftReceiptDesign.logoSizePx}
                            onChange={(e) =>
                              setDraftReceiptDesign((prev) => ({
                                ...prev,
                                logoSizePx: Number(e.target.value),
                              }))
                            }
                            className="w-full accent-[#0071E3] cursor-pointer"
                          />
                        </div>
                      </div>

                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        <div className="p-3.5 rounded-2xl bg-white border border-black/[0.08] space-y-2">
                          <span className="font-bold text-[#1D1D1F] block">سُمك الخط (Font Weight):</span>
                          <div className="grid grid-cols-4 gap-1">
                            {[
                              { id: 'normal', label: 'عادي' },
                              { id: 'medium', label: 'متوسط' },
                              { id: 'bold', label: 'عريض' },
                              { id: 'black', label: 'فائق' },
                            ].map((w) => (
                              <button
                                key={w.id}
                                type="button"
                                onClick={() =>
                                  setDraftReceiptDesign((prev) => ({
                                    ...prev,
                                    fontWeight: w.id as ReceiptDesignConfig['fontWeight'],
                                  }))
                                }
                                className={`py-1.5 rounded-lg text-[11px] font-bold cursor-pointer ${
                                  draftReceiptDesign.fontWeight === w.id
                                    ? 'bg-[#0071E3] text-white'
                                    : 'bg-[#F5F5F7] text-[#1D1D1F]'
                                }`}
                              >
                                {w.label}
                              </button>
                            ))}
                          </div>
                        </div>

                        <div className="p-3.5 rounded-2xl bg-white border border-black/[0.08] space-y-2">
                          <span className="font-bold text-[#1D1D1F] block">تباعد الأسطر:</span>
                          <div className="grid grid-cols-3 gap-1">
                            {[
                              { id: 'compact', label: 'مدمج' },
                              { id: 'normal', label: 'قياسي' },
                              { id: 'relaxed', label: 'مريح' },
                            ].map((ls) => (
                              <button
                                key={ls.id}
                                type="button"
                                onClick={() =>
                                  setDraftReceiptDesign((prev) => ({
                                    ...prev,
                                    lineSpacing: ls.id as ReceiptDesignConfig['lineSpacing'],
                                  }))
                                }
                                className={`py-1.5 rounded-lg text-[11px] font-bold cursor-pointer ${
                                  draftReceiptDesign.lineSpacing === ls.id
                                    ? 'bg-[#0071E3] text-white'
                                    : 'bg-[#F5F5F7] text-[#1D1D1F]'
                                }`}
                              >
                                {ls.label}
                              </button>
                            ))}
                          </div>
                        </div>
                      </div>

                      {/* Colors & Thermal High Contrast */}
                      <div className="p-3.5 rounded-2xl bg-white border border-black/[0.08] space-y-3">
                        <div className="flex items-center justify-between">
                          <div>
                            <span className="font-bold text-[#1D1D1F] block">
                              تحسين التباين العالي للطابعات الحرارية (High-Contrast Black):
                            </span>
                            <span className="text-[10px] text-[#86868B]">
                              يجعل جميع النصوص باللون الأسود الداكن #000000 لطباعة حرارية واضحة جداً
                            </span>
                          </div>
                          <input
                            type="checkbox"
                            checked={draftReceiptDesign.highContrastThermal}
                            onChange={(e) =>
                              setDraftReceiptDesign((prev) => ({
                                ...prev,
                                highContrastThermal: e.target.checked,
                              }))
                            }
                            className="w-4 h-4 accent-[#0071E3] rounded cursor-pointer"
                          />
                        </div>

                        {!draftReceiptDesign.highContrastThermal && (
                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-2 border-t border-black/[0.06]">
                            <div className="flex items-center justify-between">
                              <span className="font-bold text-[#1D1D1F]">لون النص الأساسي:</span>
                              <div className="flex items-center gap-1.5">
                                {['#000000', '#1D1D1F', '#1E293B', '#14532D'].map((c) => (
                                  <button
                                    key={c}
                                    type="button"
                                    onClick={() =>
                                      setDraftReceiptDesign((prev) => ({
                                        ...prev,
                                        primaryTextColor: c,
                                      }))
                                    }
                                    style={{ backgroundColor: c }}
                                    className={`w-5 h-5 rounded-full border ${
                                      draftReceiptDesign.primaryTextColor === c
                                        ? 'ring-2 ring-[#0071E3] ring-offset-1'
                                        : 'border-black/20'
                                    }`}
                                  />
                                ))}
                                <input
                                  type="color"
                                  value={draftReceiptDesign.primaryTextColor}
                                  onChange={(e) =>
                                    setDraftReceiptDesign((prev) => ({
                                      ...prev,
                                      primaryTextColor: e.target.value,
                                    }))
                                  }
                                  className="w-6 h-6 rounded border-0 cursor-pointer"
                                />
                              </div>
                            </div>

                            <div className="flex items-center justify-between">
                              <span className="font-bold text-[#1D1D1F]">لون التمييز والإجمالي:</span>
                              <div className="flex items-center gap-1.5">
                                {['#C49746', '#0071E3', '#059669', '#000000'].map((c) => (
                                  <button
                                    key={c}
                                    type="button"
                                    onClick={() =>
                                      setDraftReceiptDesign((prev) => ({
                                        ...prev,
                                        accentColor: c,
                                      }))
                                    }
                                    style={{ backgroundColor: c }}
                                    className={`w-5 h-5 rounded-full border ${
                                      draftReceiptDesign.accentColor === c
                                        ? 'ring-2 ring-[#0071E3] ring-offset-1'
                                        : 'border-black/20'
                                    }`}
                                  />
                                ))}
                                <input
                                  type="color"
                                  value={draftReceiptDesign.accentColor}
                                  onChange={(e) =>
                                    setDraftReceiptDesign((prev) => ({
                                      ...prev,
                                      accentColor: e.target.value,
                                    }))
                                  }
                                  className="w-6 h-6 rounded border-0 cursor-pointer"
                                />
                              </div>
                            </div>
                          </div>
                        )}
                      </div>
                    </div>
                  )}

                  {/* Sub-Tab 3: Paper Size, Padding, Borders & Alignment */}
                  {receiptStudioTab === 'layout' && (
                    <div className="space-y-3 text-xs">
                      <div className="p-3.5 rounded-2xl bg-white border border-black/[0.08] space-y-2">
                        <span className="font-bold text-[#1D1D1F] block">مقاس ورق الطابعة وتوافق البلوتوث (Paper Size & Bluetooth):</span>
                        <div className="grid grid-cols-3 gap-2">
                          {[
                            { id: '58mm', label: '58mm (تذاكر مدمجة وبلوتوث)' },
                            { id: '80mm', label: '80mm (حراري قياسي للكاشير)' },
                            { id: 'A4', label: 'A4 (فاتورة كاملة رسمية)' },
                          ].map((pw) => (
                            <button
                              key={pw.id}
                              type="button"
                              onClick={() =>
                                setDraftReceiptDesign((prev) => ({
                                  ...prev,
                                  paperWidth: pw.id as ReceiptDesignConfig['paperWidth'],
                                }))
                              }
                              className={`py-2 px-1 text-[11px] rounded-xl font-bold cursor-pointer text-center ${
                                draftReceiptDesign.paperWidth === pw.id
                                  ? 'bg-[#1D1D1F] text-white'
                                  : 'bg-[#F5F5F7] text-[#1D1D1F]'
                              }`}
                            >
                              {pw.label}
                            </button>
                          ))}
                        </div>
                        <div className="p-2.5 rounded-xl bg-blue-50/70 border border-blue-200/80 text-[11px] text-blue-900 leading-relaxed">
                          💡 <strong>دعم طابعات البلوتوث والتذاكر الصغيرة:</strong> النظام مهيأ بتنسيق حراري مخصص بدون هوامش يناسب بكرات الورق الحراري المتصلة (Continuous Roll)، ويدعم الاتصال المباشر بطابعات البلوتوث المحمولة (Web Bluetooth ESC/POS) وتطبيق RawBT على أندرويد.
                        </div>
                      </div>

                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        <div className="p-3.5 rounded-2xl bg-white border border-black/[0.08] space-y-2">
                          <span className="font-bold text-[#1D1D1F] block">نمط الفواصل والحدود:</span>
                          <div className="grid grid-cols-5 gap-1">
                            {[
                              { id: 'dashed', label: 'متقطع' },
                              { id: 'solid', label: 'متصل' },
                              { id: 'dotted', label: 'منقط' },
                              { id: 'double', label: 'مزدوج' },
                              { id: 'none', label: 'بدون' },
                            ].map((b) => (
                              <button
                                key={b.id}
                                type="button"
                                onClick={() =>
                                  setDraftReceiptDesign((prev) => ({
                                    ...prev,
                                    borderStyle: b.id as ReceiptDesignConfig['borderStyle'],
                                  }))
                                }
                                className={`py-1.5 rounded-lg text-[10px] font-bold cursor-pointer ${
                                  draftReceiptDesign.borderStyle === b.id
                                    ? 'bg-[#0071E3] text-white'
                                    : 'bg-[#F5F5F7] text-[#1D1D1F]'
                                }`}
                              >
                                {b.label}
                              </button>
                            ))}
                          </div>
                        </div>

                        <div className="p-3.5 rounded-2xl bg-white border border-black/[0.08] space-y-2">
                          <span className="font-bold text-[#1D1D1F] block">محاذاة الترويسة والشعار:</span>
                          <div className="grid grid-cols-3 gap-1.5">
                            {[
                              { id: 'center', label: 'توسيط', icon: AlignCenter },
                              { id: 'right', label: 'يمين', icon: AlignRight },
                              { id: 'left', label: 'يسار', icon: AlignLeft },
                            ].map((al) => {
                              const Icon = al.icon;
                              return (
                                <button
                                  key={al.id}
                                  type="button"
                                  onClick={() =>
                                    setDraftReceiptDesign((prev) => ({
                                      ...prev,
                                      headerAlignment: al.id as ReceiptDesignConfig['headerAlignment'],
                                    }))
                                  }
                                  className={`py-1.5 rounded-lg text-[10px] font-bold flex items-center justify-center gap-1 cursor-pointer ${
                                    draftReceiptDesign.headerAlignment === al.id
                                      ? 'bg-[#0071E3] text-white'
                                      : 'bg-[#F5F5F7] text-[#1D1D1F]'
                                  }`}
                                >
                                  <Icon size={12} />
                                  <span>{al.label}</span>
                                </button>
                              );
                            })}
                          </div>
                        </div>
                      </div>

                      <div className="p-3.5 rounded-2xl bg-white border border-black/[0.08] space-y-1.5">
                        <div className="flex justify-between">
                          <span className="font-bold text-[#1D1D1F]">الهامش الداخلي للورقة (Padding):</span>
                          <span className="font-mono font-black text-[#0071E3]">
                            {draftReceiptDesign.paddingMm} ملم
                          </span>
                        </div>
                        <input
                          type="range"
                          min={2}
                          max={10}
                          step={1}
                          value={draftReceiptDesign.paddingMm}
                          onChange={(e) =>
                            setDraftReceiptDesign((prev) => ({
                              ...prev,
                              paddingMm: Number(e.target.value),
                            }))
                          }
                          className="w-full accent-[#0071E3] cursor-pointer"
                        />
                      </div>

                      <div className="p-3.5 rounded-2xl bg-white border border-black/[0.08] flex items-center justify-between">
                        <div>
                          <span className="font-bold text-[#1D1D1F] block">
                            الطباعة التلقائية الفورية بعد إتمام البيع:
                          </span>
                          <span className="text-[10px] text-[#86868B]">
                            إرسال أمر الطباعة تلقائياً للطابعة الحرارية فور حفظ الفاتورة بالكاشير
                          </span>
                        </div>
                        <input
                          type="checkbox"
                          checked={draftReceiptDesign.autoPrintOnSale}
                          onChange={(e) =>
                            setDraftReceiptDesign((prev) => ({
                              ...prev,
                              autoPrintOnSale: e.target.checked,
                            }))
                          }
                          className="w-4 h-4 accent-[#0071E3] rounded cursor-pointer"
                        />
                      </div>
                    </div>
                  )}

                  {/* Sub-Tab 4: Custom Texts & Store Branding */}
                  {receiptStudioTab === 'branding' && (
                    <div className="space-y-3 text-xs">
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        <div>
                          <label className="font-bold text-[#1D1D1F] block mb-1">اسم المتجر المطبوع:</label>
                          <input
                            type="text"
                            value={localSettings.storeName}
                            onChange={(e) =>
                              setLocalSettings({ ...localSettings, storeName: e.target.value })
                            }
                            className="w-full h-10 px-3 rounded-xl bg-white border border-black/[0.08] font-bold"
                          />
                        </div>
                        <div>
                          <label className="font-bold text-[#1D1D1F] block mb-1">الشعار اللفظي (السلوجان):</label>
                          <input
                            type="text"
                            value={localSettings.storeSlogan || ''}
                            onChange={(e) =>
                              setLocalSettings({ ...localSettings, storeSlogan: e.target.value })
                            }
                            className="w-full h-10 px-3 rounded-xl bg-white border border-black/[0.08] font-bold text-[#C49746]"
                          />
                        </div>
                      </div>

                      <div>
                        <label className="font-bold text-[#1D1D1F] block mb-1">
                          نصيحة ثبات وفوحان العطر المطبوعة للعميل:
                        </label>
                        <input
                          type="text"
                          value={draftReceiptDesign.perfumeCareTipText}
                          onChange={(e) =>
                            setDraftReceiptDesign((prev) => ({
                              ...prev,
                              perfumeCareTipText: e.target.value,
                            }))
                          }
                          className="w-full h-10 px-3 rounded-xl bg-white border border-black/[0.08]"
                        />
                      </div>

                      <div>
                        <label className="font-bold text-[#1D1D1F] block mb-1">
                          عبارة ضمان الثبات وسياسة المتجر:
                        </label>
                        <input
                          type="text"
                          value={draftReceiptDesign.returnPolicyText}
                          onChange={(e) =>
                            setDraftReceiptDesign((prev) => ({
                              ...prev,
                              returnPolicyText: e.target.value,
                            }))
                          }
                          className="w-full h-10 px-3 rounded-xl bg-white border border-black/[0.08]"
                        />
                      </div>

                      <div>
                        <label className="font-bold text-[#1D1D1F] block mb-1">
                          رسالة الشكر الختامية (Receipt Footer):
                        </label>
                        <textarea
                          rows={2}
                          value={localSettings.receiptFooterMessage || ''}
                          onChange={(e) =>
                            setLocalSettings({
                              ...localSettings,
                              receiptFooterMessage: e.target.value,
                            })
                          }
                          className="w-full p-3 rounded-xl bg-white border border-black/[0.08] resize-none"
                        />
                      </div>
                    </div>
                  )}
                </div>

                {/* Live Interactive Preview Column (5 cols) */}
                <div className="lg:col-span-5 rounded-3xl bg-[#F2F2F7] p-4 border border-black/[0.08] space-y-3 sticky top-4">
                  <div className="flex items-center justify-between pb-2 border-b border-black/[0.06]">
                    <div className="flex items-center gap-1.5">
                      <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
                      <span className="text-xs font-black text-[#1D1D1F]">
                        المعاينة الفورية الحية ({draftReceiptDesign.paperWidth})
                      </span>
                    </div>
                    <button
                      type="button"
                      onClick={() => window.print()}
                      className="px-2.5 py-1 rounded-xl bg-[#1D1D1F] text-white text-[10px] font-bold flex items-center gap-1 cursor-pointer"
                    >
                      <Printer size={12} />
                      <span>طباعة تجريبية</span>
                    </button>
                  </div>

                  <div className="py-1 flex items-center justify-center">
                    <ThermalReceiptLiveView
                      sale={samplePreviewSale}
                      design={draftReceiptDesign}
                      branding={{
                        storeName: localSettings.storeName,
                        storeSlogan: localSettings.storeSlogan || '',
                        storePhone: localSettings.storePhone || '',
                        storeAddress: localSettings.storeAddress || '',
                        storeTaxNumber: localSettings.storeTaxNumber || '',
                        receiptFooterMessage: localSettings.receiptFooterMessage || '',
                        logoUrl: localSettings.logoUrl || '',
                        currency: localSettings.currency,
                      }}
                      idAttribute="settings-thermal-receipt-preview"
                    />
                  </div>

                  <p className="text-[10px] text-center text-[#86868B]">
                    أي تغيير في العناصر أو الخطوط أو الألوان يظهر هنا فوراً قبل الضغط على «اعتماد وتطبيق التصميم».
                  </p>
                </div>
              </div>
            </div>
          )}

          {/* ======================================================== */}
          {/* SECTION 7: INVENTORY INTELLIGENCE & THRESHOLDS           */}
          {/* ======================================================== */}
          {((activeSection === 'system_settings' && systemSubTab === 'inventory') || activeSection === 'inventory') && (
            <div className="apple-glass rounded-3xl p-5 sm:p-7 border border-black/[0.06] shadow-apple-card space-y-6 animate-in fade-in duration-150">
              <div className="pb-3 border-b border-black/[0.06] flex items-center justify-between">
                <div>
                  <h2 className="text-lg font-black text-[#1D1D1F]">إعدادات المخزون والتنبيهات الذكية</h2>
                  <p className="text-xs text-[#86868B]">مراقبة رصيد الزيوت بالجرام والتنبيه المبكر قبل نفاد الخامات.</p>
                </div>
                <div className="w-10 h-10 rounded-2xl bg-emerald-500/10 text-emerald-700 flex items-center justify-center font-bold">
                  <Package size={20} />
                </div>
              </div>

              <div className="space-y-5 text-xs">
                {/* 1. خط الخطر الحرج (Red Danger Line) */}
                <div className="p-4 sm:p-5 rounded-2xl bg-white border border-rose-200/80 dark:border-rose-900/40 shadow-xs space-y-3">
                  <div className="flex items-center justify-between flex-wrap gap-2">
                    <div className="flex items-center gap-2">
                      <span className="w-3 h-3 rounded-full bg-rose-500 animate-ping shrink-0" />
                      <div>
                        <strong className="text-sm font-black text-rose-700 dark:text-rose-400 block">
                          خط الخطر الحرج للمخزون (يلون باللون الأحمر 🚨):
                        </strong>
                        <span className="text-[11px] text-[#86868B]">
                          عند وصول رصيد أي عطر لهذا الرقم أو أقل، يتلون العطر بالأحمر الحرج ويُدرج فوراً في تنبيهات النواقص القصوى.
                        </span>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <input
                        type="number"
                        min="10"
                        max="500"
                        step="5"
                        value={settings.criticalStockThresholdGrams ?? 80}
                        onChange={(e) => {
                          const val = Math.max(5, Number(e.target.value) || 80);
                          setSettings((prev) => ({ ...prev, criticalStockThresholdGrams: val }));
                        }}
                        className="w-24 px-3 py-1.5 rounded-xl border border-rose-300 text-center font-mono font-bold text-base text-rose-600 focus:outline-none focus:ring-2 focus:ring-rose-500 bg-rose-50/50"
                      />
                      <span className="font-bold text-[#86868B]">جم</span>
                    </div>
                  </div>

                  {/* Slider & Quick Presets */}
                  <div className="space-y-2 pt-2 border-t border-rose-100 dark:border-rose-950/40">
                    <input
                      type="range"
                      min="20"
                      max="300"
                      step="5"
                      value={settings.criticalStockThresholdGrams ?? 80}
                      onChange={(e) => {
                        const val = Number(e.target.value);
                        setSettings((prev) => ({ ...prev, criticalStockThresholdGrams: val }));
                      }}
                      className="w-full accent-rose-600 cursor-pointer"
                    />
                    <div className="flex items-center justify-between text-[11px] text-[#86868B]">
                      <span>اختيارات سريعة لخط الخطر:</span>
                      <div className="flex items-center gap-1.5">
                        {[50, 80, 100, 150].map((preset) => (
                          <button
                            key={preset}
                            type="button"
                            onClick={() => setSettings((prev) => ({ ...prev, criticalStockThresholdGrams: preset }))}
                            className={`px-2.5 py-0.5 rounded-lg font-bold font-mono transition-colors cursor-pointer ${
                              (settings.criticalStockThresholdGrams ?? 80) === preset
                                ? 'bg-rose-600 text-white'
                                : 'bg-rose-50 text-rose-700 hover:bg-rose-100'
                            }`}
                          >
                            {preset} جم
                          </button>
                        ))}
                      </div>
                    </div>
                  </div>
                </div>

                {/* 2. عتبة اقتراب المخزون من النفاد (Yellow Warning Line) */}
                <div className="p-4 sm:p-5 rounded-2xl bg-white border border-amber-200/80 dark:border-amber-900/40 shadow-xs space-y-3">
                  <div className="flex items-center justify-between flex-wrap gap-2">
                    <div className="flex items-center gap-2">
                      <span className="w-3 h-3 rounded-full bg-amber-500 ring-2 ring-amber-400/50 shrink-0" />
                      <div>
                        <strong className="text-sm font-black text-amber-800 dark:text-amber-400 block">
                          عتبة اقتراب المخزون من النفاد (يلون باللون الأصفر ⚠️):
                        </strong>
                        <span className="text-[11px] text-[#86868B]">
                          عند هبوط رصيد العطر لما دون هذا الحد وحتى خط الخطر، يتلون بالأصفر التنبيهي لإشعار الكاشير والمالك بالطلب المبكر.
                        </span>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <input
                        type="number"
                        min="50"
                        max="1000"
                        step="10"
                        value={settings.lowStockThresholdGrams ?? 200}
                        onChange={(e) => {
                          const val = Math.max(20, Number(e.target.value) || 200);
                          setSettings((prev) => ({ ...prev, lowStockThresholdGrams: val }));
                        }}
                        className="w-24 px-3 py-1.5 rounded-xl border border-amber-300 text-center font-mono font-bold text-base text-amber-700 focus:outline-none focus:ring-2 focus:ring-amber-500 bg-amber-50/50"
                      />
                      <span className="font-bold text-[#86868B]">جم</span>
                    </div>
                  </div>

                  {/* Slider & Quick Presets */}
                  <div className="space-y-2 pt-2 border-t border-amber-100 dark:border-amber-950/40">
                    <input
                      type="range"
                      min="80"
                      max="600"
                      step="10"
                      value={settings.lowStockThresholdGrams ?? 200}
                      onChange={(e) => {
                        const val = Number(e.target.value);
                        setSettings((prev) => ({ ...prev, lowStockThresholdGrams: val }));
                      }}
                      className="w-full accent-amber-500 cursor-pointer"
                    />
                    <div className="flex items-center justify-between text-[11px] text-[#86868B]">
                      <span>اختيارات سريعة للتحذير الأصفر:</span>
                      <div className="flex items-center gap-1.5">
                        {[150, 200, 250, 300].map((preset) => (
                          <button
                            key={preset}
                            type="button"
                            onClick={() => setSettings((prev) => ({ ...prev, lowStockThresholdGrams: preset }))}
                            className={`px-2.5 py-0.5 rounded-lg font-bold font-mono transition-colors cursor-pointer ${
                              (settings.lowStockThresholdGrams ?? 200) === preset
                                ? 'bg-amber-500 text-slate-950'
                                : 'bg-amber-50 text-amber-800 hover:bg-amber-100'
                            }`}
                          >
                            {preset} جم
                          </button>
                        ))}
                      </div>
                    </div>
                  </div>
                </div>

                {/* 3. Live Visual Indicator Preview Card */}
                <div className="p-4 rounded-2xl bg-slate-50 dark:bg-slate-900/40 border border-slate-200 space-y-2.5">
                  <strong className="text-xs font-black text-slate-800 dark:text-slate-200 block">
                    معاينة حية لشكل المنتجات في شاشة المخزون حسب الألوان:
                  </strong>
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
                    {/* Sample Red */}
                    <div className="p-3 rounded-xl border-2 border-rose-500/50 bg-rose-500/[0.06] space-y-1">
                      <div className="flex items-center justify-between">
                        <strong className="font-bold text-rose-700 text-xs">عطر توت بري نيش</strong>
                        <span className="font-mono font-black text-rose-600 text-xs">{settings.criticalStockThresholdGrams ?? 80} جم</span>
                      </div>
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-rose-500/15 text-rose-700 border border-rose-500/30">
                        <span className="w-1.5 h-1.5 rounded-full bg-rose-500 animate-ping" />
                        <span>🚨 خط الخطر (أحمر)</span>
                      </span>
                    </div>

                    {/* Sample Yellow */}
                    <div className="p-3 rounded-xl border-2 border-amber-500/50 bg-amber-500/[0.06] space-y-1">
                      <div className="flex items-center justify-between">
                        <strong className="font-bold text-amber-900 text-xs">عطر سوفاج ديور</strong>
                        <span className="font-mono font-black text-amber-600 text-xs">{settings.lowStockThresholdGrams ?? 200} جم</span>
                      </div>
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-500/15 text-amber-800 border border-amber-500/30">
                        <span className="w-1.5 h-1.5 rounded-full bg-amber-500 ring-1 ring-amber-400" />
                        <span>⚠️ اقترب من النفاد (أصفر)</span>
                      </span>
                    </div>

                    {/* Sample Green */}
                    <div className="p-3 rounded-xl border border-black/[0.08] bg-white space-y-1">
                      <div className="flex items-center justify-between">
                        <strong className="font-bold text-[#1D1D1F] text-xs">عطر عود ملكي خاص</strong>
                        <span className="font-mono font-black text-emerald-600 text-xs">850 جم</span>
                      </div>
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-500/15 text-emerald-800 border border-emerald-500/30">
                        <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                        <span>✅ مخزون كافٍ (أخضر)</span>
                      </span>
                    </div>
                  </div>
                </div>

                <div className="p-4 rounded-2xl bg-white border border-black/[0.08] flex items-center justify-between">
                  <div>
                    <span className="font-bold text-[#1D1D1F] block">عدد العطور المسجلة في النظام حالياً:</span>
                    <span className="text-[10px] text-[#86868B]">الزيوت العطرية العادية والعود والمسك</span>
                  </div>
                  <span className="font-mono font-bold text-base text-[#0071E3]">
                    {products.length} عطر
                  </span>
                </div>

                {onNavigate && (
                  <button
                    type="button"
                    onClick={() => onNavigate(View.INVENTORY_INTELLIGENCE)}
                    className="apple-btn w-full p-3.5 rounded-2xl bg-white border border-black/[0.08] hover:bg-black/[0.02] text-xs font-bold flex items-center justify-between"
                  >
                    <span>فتح شاشة ذكاء المخزون والنواقص والجرد الفعلي</span>
                    <ArrowRight size={15} className="text-[#86868B]" />
                  </button>
                )}
              </div>
            </div>
          )}

          {/* ======================================================== */}
          {/* SECTION 8: SECURITY, PASSWORD & CLOUD BACKUP            */}
          {/* ======================================================== */}
          {activeSection === 'security_backup' && (
            <div className="apple-glass rounded-3xl p-5 sm:p-7 border border-black/[0.06] shadow-apple-card space-y-6 animate-in fade-in duration-150">
              <div className="pb-3 border-b border-black/[0.06] flex items-center justify-between">
                <div>
                  <h2 className="text-lg font-black text-[#1D1D1F]">الأمان، كلمات المرور، والنسخ الاحتياطي</h2>
                  <p className="text-xs text-[#86868B]">تشفير بيانات الدخول وتصدير نسخ احتياطية شاملة بصيغة JSON.</p>
                </div>
                <div className="w-10 h-10 rounded-2xl bg-amber-500/10 text-amber-700 flex items-center justify-center font-bold">
                  <KeyRound size={20} />
                </div>
              </div>

              {/* Password Change Form */}
              <div className="p-4 rounded-2xl bg-white border border-black/[0.08] space-y-4">
                <div className="flex items-center gap-2">
                  <KeyRound size={16} className="text-[#0071E3]" />
                  <h3 className="font-bold text-xs text-[#1D1D1F]">تغيير كلمة المرور الخاصة بحسابك:</h3>
                </div>

                {passwordError && (
                  <div className="p-3 rounded-xl bg-rose-50 border border-rose-200 text-rose-700 text-xs font-bold">
                    {passwordError}
                  </div>
                )}

                {passwordSuccess && (
                  <div className="p-3 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs font-bold">
                    {passwordSuccess}
                  </div>
                )}

                <form onSubmit={handleChangePassword} className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
                  <div className="space-y-1">
                    <label className="text-[11px] font-bold text-[#86868B] block text-right">كلمة المرور الجديدة:</label>
                    <input
                      type="password"
                      value={newPassword}
                      onChange={(e) => setNewPassword(e.target.value)}
                      placeholder="أدخل كلمة مرور جديدة..."
                      className="w-full h-10 px-3 rounded-xl bg-white border border-black/[0.08] font-mono text-xs outline-none focus:border-[#0071E3] text-right"
                      required
                    />
                  </div>

                  <div className="space-y-1">
                    <label className="text-[11px] font-bold text-[#86868B] block text-right">تأكيد كلمة المرور:</label>
                    <input
                      type="password"
                      value={confirmPassword}
                      onChange={(e) => setConfirmPassword(e.target.value)}
                      placeholder="أعد إدخال كلمة المرور..."
                      className="w-full h-10 px-3 rounded-xl bg-white border border-black/[0.08] font-mono text-xs outline-none focus:border-[#0071E3] text-right"
                      required
                    />
                  </div>

                  <div className="sm:col-span-2 pt-1">
                    <button
                      type="submit"
                      className="apple-btn px-4 py-2 rounded-xl bg-[#0071E3] hover:bg-[#0077ED] text-white text-xs font-bold"
                    >
                      تحديث كلمة المرور
                    </button>
                  </div>
                </form>
              </div>

              {/* Backup & Export / Import Restore */}
              <div className="p-4 sm:p-5 rounded-2xl bg-white border border-black/[0.08] space-y-4">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-black/[0.06]">
                  <div>
                    <h3 className="font-bold text-xs sm:text-sm text-[#1D1D1F] flex items-center gap-2">
                      <Download size={16} className="text-[#0071E3]" />
                      <span>تنزيل نسخة احتياطية كاملة (Full JSON Backup):</span>
                    </h3>
                    <p className="text-[11px] text-[#86868B] mt-0.5">
                      تصدير كافة الأصناف، الفواتير، المصروفات، الخزائن، وسجلات النظام في ملف JSON شامل لاسترجاعه عند الحاجة.
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={handleExportBackup}
                    className="apple-btn flex items-center gap-1.5 px-4 py-2.5 rounded-xl bg-[#1D1D1F] hover:bg-black text-white text-xs font-bold transition-all shrink-0 cursor-pointer shadow-xs"
                  >
                    <Download size={14} />
                    <span>تنزيل نسخة JSON الحالية</span>
                  </button>
                </div>

                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pt-1">
                  <div>
                    <h3 className="font-bold text-xs sm:text-sm text-[#1D1D1F] flex items-center gap-2">
                      <Upload size={16} className="text-amber-600" />
                      <span>استعادة قاعدة البيانات المحلية من ملف (Restore Database):</span>
                    </h3>
                    <p className="text-[11px] text-[#86868B] mt-0.5">
                      استرجاع كافة المنتجات والمبيعات والمصروفات والإعدادات من ملف نسخة احتياطية JSON سابق.
                    </p>
                  </div>
                  <div className="shrink-0">
                    <input
                      type="file"
                      ref={fileInputRef}
                      accept=".json"
                      onChange={handleImportRestoreBackup}
                      className="hidden"
                    />
                    <button
                      type="button"
                      onClick={() => fileInputRef.current?.click()}
                      className="apple-btn flex items-center gap-1.5 px-4 py-2.5 rounded-xl bg-amber-500 hover:bg-amber-600 text-slate-950 text-xs font-black transition-all cursor-pointer shadow-xs"
                    >
                      <Upload size={14} />
                      <span>استعادة البيانات من ملف JSON</span>
                    </button>
                  </div>
                </div>
              </div>
            </div>
          )}

        </div>

      {/* ======================================================== */}
      {/* 3. BOTTLE SIZE ADD / EDIT MODAL                          */}
      {/* ======================================================== */}
      {isBottleModalOpen && (
        <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-xs flex items-center justify-center p-3 animate-in fade-in duration-150">
          <div className="apple-glass rounded-3xl p-5 sm:p-6 w-full max-w-md border border-white/60 shadow-2xl space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-black/[0.06]">
              <h3 className="text-base font-black text-[#1D1D1F]">
                {editingBottle ? `تعديل حجم ${editingBottle.sizeMl} مل` : 'إضافة حجم زجاجة جديد'}
              </h3>
              <button
                onClick={() => setIsBottleModalOpen(false)}
                className="w-8 h-8 rounded-full bg-black/[0.05] hover:bg-black/[0.1] flex items-center justify-center text-[#86868B]"
              >
                ✕
              </button>
            </div>

            <div className="space-y-3 text-xs">
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <label className="font-bold text-[#1D1D1F] block text-right">حجم الزجاجة (مل):</label>
                  <input
                    type="number"
                    value={bottleFormData.sizeMl || ''}
                    onChange={(e) => setBottleFormData({ ...bottleFormData, sizeMl: Number(e.target.value) || 0 })}
                    placeholder="مثال: 50"
                    className="w-full h-10 px-3 rounded-xl bg-white border border-black/[0.08] font-mono text-center font-bold"
                  />
                </div>

                <div className="space-y-1">
                  <label className="font-bold text-[#1D1D1F] block text-right">جرامات الزيت القياسية:</label>
                  <input
                    type="number"
                    value={bottleFormData.essenceGrams || ''}
                    onChange={(e) => setBottleFormData({ ...bottleFormData, essenceGrams: Number(e.target.value) || 0 })}
                    placeholder="مثال: 15"
                    className="w-full h-10 px-3 rounded-xl bg-white border border-black/[0.08] font-mono text-center font-bold"
                  />
                </div>

                <div className="space-y-1">
                  <label className="font-bold text-[#1D1D1F] block text-right">سعر بيع العادي (جنيه):</label>
                  <input
                    type="number"
                    value={bottleFormData.normalPrice || ''}
                    onChange={(e) => setBottleFormData({ ...bottleFormData, normalPrice: Number(e.target.value) || 0 })}
                    placeholder="مثال: 230"
                    className="w-full h-10 px-3 rounded-xl bg-white border border-black/[0.08] font-mono text-center font-bold text-[#0071E3]"
                  />
                </div>

                <div className="space-y-1">
                  <label className="font-bold text-amber-900 block text-right">سعر العبوة الملونة (عادي - اختياري):</label>
                  <input
                    type="number"
                    value={bottleFormData.coloredNormalPrice || ''}
                    onChange={(e) => setBottleFormData({ ...bottleFormData, coloredNormalPrice: e.target.value === '' ? undefined : Number(e.target.value) })}
                    placeholder="مثال: 600 / 300 / 250"
                    className="w-full h-10 px-3 rounded-xl bg-amber-50/40 border border-amber-200 font-mono text-center font-bold text-amber-900"
                  />
                </div>

                <div className="space-y-1">
                  <label className="font-bold text-[#1D1D1F] block text-right">سعر النيش/العود/المسك (جنيه):</label>
                  <input
                    type="number"
                    value={bottleFormData.specialPrice || ''}
                    onChange={(e) => setBottleFormData({ ...bottleFormData, specialPrice: Number(e.target.value) || 0 })}
                    placeholder="مثال: 450"
                    className="w-full h-10 px-3 rounded-xl bg-white border border-black/[0.08] font-mono text-center font-bold text-amber-700"
                  />
                </div>

                <div className="space-y-1">
                  <label className="font-bold text-[#1D1D1F] block text-right">التكلفة المعيارية المعتمدة (عادي):</label>
                  <input
                    type="number"
                    value={bottleFormData.officialCost || ''}
                    onChange={(e) => setBottleFormData({ ...bottleFormData, officialCost: Number(e.target.value) || 0 })}
                    placeholder="مثال: 180"
                    className="w-full h-10 px-3 rounded-xl bg-white border border-black/[0.08] font-mono text-center font-bold text-rose-700"
                  />
                </div>

                <div className="space-y-1">
                  <label className="font-bold text-[#1D1D1F] block text-right">نوع العبوة:</label>
                  <select
                    value={bottleFormData.isRollOn ? 'roll' : 'spray'}
                    onChange={(e) => setBottleFormData({ ...bottleFormData, isRollOn: e.target.value === 'roll' })}
                    className="w-full h-10 px-3 rounded-xl bg-white border border-black/[0.08] font-bold"
                  >
                    <option value="spray">بخاخ مع كحول طبي</option>
                    <option value="roll">رول أون (زيت خام بيور)</option>
                  </select>
                </div>

                <div className="space-y-1">
                  <label className="font-bold text-purple-900 block text-right">سعر ملون خاص معتمد (نيش/عود):</label>
                  <input
                    type="number"
                    value={bottleFormData.coloredSpecialPrice || ''}
                    onChange={(e) => setBottleFormData({ ...bottleFormData, coloredSpecialPrice: e.target.value === '' ? undefined : Number(e.target.value) })}
                    placeholder="اتركه فارغاً لمنع التوليد التلقائي"
                    className="w-full h-10 px-3 rounded-xl bg-purple-50/40 border border-purple-200 font-mono text-center font-bold text-purple-900"
                  />
                </div>
              </div>

              <div className="space-y-1 pt-1">
                <label className="font-bold text-[#9A6E23] block text-right">سبب التعديل لسجل الرقابة (إلزامي):</label>
                <input
                  type="text"
                  value={ownerAuditReason}
                  onChange={(e) => setOwnerAuditReason(e.target.value)}
                  placeholder="اكتب سبب التعديل..."
                  className="w-full h-9 px-3 rounded-xl bg-[#FFF8EB] border border-[#C49746]/40 text-xs font-bold"
                />
              </div>

              <div className="flex items-center gap-2 pt-3 border-t border-black/[0.06]">
                <button
                  type="button"
                  onClick={() => setIsBottleModalOpen(false)}
                  className="flex-1 py-2.5 rounded-xl border border-black/[0.08] text-xs font-bold text-[#1D1D1F]"
                >
                  إلغاء
                </button>
                <button
                  type="button"
                  onClick={handleSaveBottleForm}
                  className="flex-2 py-2.5 rounded-xl bg-[#0071E3] text-white text-xs font-bold shadow-xs"
                >
                  حفظ الحجم
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ======================================================== */}
      {/* 4. OWNER WITHDRAWAL FAST ACTION MODAL                    */}
      {/* ======================================================== */}
      {isWithdrawModalOpen && (
        <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-xs flex items-center justify-center p-3 animate-in fade-in duration-150">
          <div className="apple-glass rounded-3xl p-5 sm:p-6 w-full max-w-md border border-white/60 shadow-2xl space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-black/[0.06]">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-xl bg-amber-600 text-white flex items-center justify-center font-bold">
                  <ArrowDownRight size={16} />
                </div>
                <h3 className="text-base font-black text-[#1D1D1F]">تسجيل مسحوب مصنف لصاحب المتجر</h3>
              </div>
              <button
                onClick={() => setIsWithdrawModalOpen(false)}
                className="w-8 h-8 rounded-full bg-black/[0.05] flex items-center justify-center text-[#86868B]"
              >
                ✕
              </button>
            </div>

            <div className="space-y-3 text-xs">
              <div className="space-y-1">
                <label className="font-bold text-[#1D1D1F] block text-right">تصنيف المعاملة المالية (إلزامي لمنع الهدر):</label>
                <select
                  value={withdrawType}
                  onChange={(e) => {
                    const val = e.target.value as any;
                    setWithdrawType(val);
                    if (val === 'owner_salary') setWithdrawReason('صرف جزء من مخصص راتب الإدارة المعتمد');
                    else if (val === 'owner_profit') setWithdrawReason('سحب أرباح صافية محققة بعد الموازنة');
                    else if (val === 'restock') setWithdrawReason('شراء زيوت عطرية وخامات جديدة للمخزون');
                    else if (val === 'utilities') setWithdrawReason('سداد مصروفات تشغيل أو فواتير');
                    else if (val === 'capital') setWithdrawReason('ضخ رأس مال / تمويل نقدي رسمي');
                  }}
                  className="w-full h-10 px-3 rounded-xl bg-white border border-black/[0.08] font-bold"
                >
                  <option value="owner_salary">1. راتب مالك (من مخصص الـ 10,000 ج)</option>
                  <option value="owner_profit">2. أرباح مسحوبة (بعد اكتمال الـ 15k)</option>
                  <option value="restock">3. شراء مخزون وخامات (تعويض رأس المال)</option>
                  <option value="utilities">4. مصروف تشغيلي / فواتير</option>
                  <option value="capital">5. ضخ تمويل / رأس مال جديد للمتجر</option>
                </select>
              </div>

              <div className="space-y-1">
                <label className="font-bold text-[#1D1D1F] block text-right">المبلغ ({settings.currency}):</label>
                <input
                  type="number"
                  value={withdrawAmount}
                  onChange={(e) => setWithdrawAmount(e.target.value === '' ? '' : Number(e.target.value))}
                  placeholder="أدخل المبلغ بالجنيه..."
                  className="w-full h-10 px-3 rounded-xl bg-white border border-black/[0.08] font-mono text-center text-sm font-bold"
                />
              </div>

              <div className="space-y-1">
                <label className="font-bold text-[#1D1D1F] block text-right">البيان والسبب:</label>
                <input
                  type="text"
                  value={withdrawReason}
                  onChange={(e) => setWithdrawReason(e.target.value)}
                  className="w-full h-10 px-3 rounded-xl bg-white border border-black/[0.08] font-medium text-right"
                />
              </div>

              <div className="space-y-1">
                <label className="font-bold text-[#1D1D1F] block text-right">رقم الفاتورة / المرجع (اختياري):</label>
                <input
                  type="text"
                  value={withdrawRef}
                  onChange={(e) => setWithdrawRef(e.target.value)}
                  placeholder="مثال: فاتورة زيت #412"
                  className="w-full h-10 px-3 rounded-xl bg-white border border-black/[0.08] font-mono text-right"
                />
              </div>

              <div className="flex items-center gap-2 pt-3 border-t border-black/[0.06]">
                <button
                  type="button"
                  onClick={() => setIsWithdrawModalOpen(false)}
                  className="flex-1 py-2.5 rounded-xl border border-black/[0.08] text-xs font-bold text-[#1D1D1F]"
                >
                  إلغاء
                </button>
                <button
                  type="button"
                  onClick={handleExecuteWithdrawal}
                  className="flex-2 py-2.5 rounded-xl bg-amber-700 hover:bg-amber-800 text-white text-xs font-bold shadow-xs"
                >
                  اعتماد وترحيل المعاملة
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

    </div>
  );
};

export default Settings;
