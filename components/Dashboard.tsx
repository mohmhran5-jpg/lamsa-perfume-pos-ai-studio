import React, { useEffect, useState, useMemo } from 'react';
import { 
  Sale, 
  Product, 
  View, 
  StoreSettings, 
  DEFAULT_SETTINGS, 
  Expense,
  FinancialVault,
  WithdrawalTransaction,
  DailyClosure,
  AppUser,
  CalculationBreakdown,
  CustomCustomerRecord,
  DashboardKpiCardId,
  DashboardSectionId,
  resolveDashboardLayoutConfig,
  isActualPaidOperationalExpense,
  getApprovedOilGramCost,
  ConnectedDeviceRecord
} from '../types';
import type { DashboardDataSourceHealthMap, DashboardDataSourceKey } from '../services/dashboardDataTypes';
import { canViewProfits, canViewCosts, canViewVaults, canAccessView } from '../services/authService';
import CalculationBreakdownModal from './CalculationBreakdownModal';
import DevicePresenceRadar from './DevicePresenceRadar';
import type { StoreAIInsight } from '../services/geminiService';
import { 
  TrendingUp, 
  Target, 
  Coins, 
  AlertOctagon, 
  ArrowUpRight, 
  Clock, 
  Calendar, 
  ShoppingBag, 
  Plus, 
  Sparkles, 
  Package, 
  Layers,
  FileText, 
  CheckCircle2,
  ChevronLeft,
  DollarSign,
  Scale,
  Zap,
  Building,
  Store,
  Users,
  Compass,
  ArrowRight,
  ShieldAlert,
  Flame,
  Lightbulb,
  RefreshCw,
  BellRing,
  HelpCircle,
  TrendingDown,
  Wallet,
  Calculator,
  Lock,
  Unlock,
  AlertTriangle,
  Info,
  ArrowLeft,
  Award,
  Crown,
  Sliders,
  ShieldCheck,
  Power,
  Layout,
  ArrowUp,
  ArrowDown,
  EyeOff,
  Radio,
} from 'lucide-react';

const localDateKey = (date: Date): string => {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

const recordDateKey = (value: string): string => {
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) return value;
  const parsed = new Date(value);
  return Number.isFinite(parsed.getTime()) ? localDateKey(parsed) : '';
};

const isFiniteNumber = (value: unknown): value is number =>
  typeof value === 'number' && Number.isFinite(value);

const formatMetricNumber = (value: number): string =>
  value.toLocaleString('ar-EG', { maximumFractionDigits: 2 });

const formatConservativePercent = (value: number): string =>
  `${(Math.floor(value * 10) / 10).toLocaleString('ar-EG', { maximumFractionDigits: 1 })}%`;

const formatRecordedSaleTime = (sale: Sale): string => {
  if (sale.isBackdated) return 'وقت البيع غير مسجل';
  const rawTimestamp = sale.serverTimestamp || sale.timestamp || sale.date;
  if (typeof rawTimestamp !== 'string' || !/(?:T|\s)\d{2}:\d{2}/.test(rawTimestamp)) return 'الوقت غير مسجل';
  const parsed = new Date(rawTimestamp);
  return Number.isFinite(parsed.getTime())
    ? parsed.toLocaleTimeString('ar-EG', { hour: '2-digit', minute: '2-digit' })
    : 'الوقت غير مسجل';
};

interface DashboardProps {
  sales: Sale[];
  products: Product[];
  expenses?: Expense[];
  settings?: StoreSettings;
  vaults?: FinancialVault[];
  withdrawals?: WithdrawalTransaction[];
  currentClosure?: DailyClosure | null;
  currentUser?: AppUser | null;
  customCustomers?: CustomCustomerRecord[];
  connectedDevices?: ConnectedDeviceRecord[];
  deviceFeedStatus?: 'connecting' | 'live' | 'cached' | 'error';
  deviceFeedLastServerUpdate?: number | null;
  dataSourceHealth?: DashboardDataSourceHealthMap;
  confirmedSettings?: Partial<StoreSettings> | null;
  dataQualityNotes?: string[];
  hasPendingLocalSales?: boolean;
  isCloudConnected?: boolean;
  onOpenConnectedDevices?: () => void;
  onNavigate?: (view: View) => void;
  onOpenDayOperations?: () => void;
  onOpenLoyaltySettings?: () => void;
  onUpdateSettings?: (newSettings: StoreSettings) => void;
}

const Dashboard: React.FC<DashboardProps> = ({ 
  sales, 
  products, 
  expenses = [],
  settings = DEFAULT_SETTINGS, 
  vaults = [],
  withdrawals = [],
  currentClosure,
  currentUser,
  connectedDevices = [],
  deviceFeedStatus = 'connecting',
  deviceFeedLastServerUpdate = null,
  dataSourceHealth,
  confirmedSettings = null,
  dataQualityNotes = [],
  hasPendingLocalSales = false,
  isCloudConnected = false,
  onOpenConnectedDevices,
  onNavigate,
  onOpenDayOperations,
  onUpdateSettings
}) => {
  const [time, setTime] = useState(new Date());
  const [aiInsight, setAiInsight] = useState<StoreAIInsight | null>(null);
  const [loadingAi, setLoadingAi] = useState<boolean>(false);
  const [calculationModal, setCalculationModal] = useState<CalculationBreakdown | null>(null);
  const [isQuickReorderOpen, setIsQuickReorderOpen] = useState<boolean>(false);

  const isOwner = !currentUser || currentUser.role === 'OWNER';
  const dashboardLayout = useMemo(() => resolveDashboardLayoutConfig(settings), [settings]);

  const nonTestSales = sales.filter((sale) =>
    !sale.isReversed && !sale.isTestData && sale.dataClassification !== 'TEST' && sale.dataClassification !== 'DOC_EXAMPLE'
  );
  const productionSales = nonTestSales.filter((sale) => sale.dataClassification === 'PRODUCTION');
  const nonTestExpenses = expenses.filter((expense) =>
    !expense.isTestData && expense.dataClassification !== 'TEST' && expense.dataClassification !== 'DOC_EXAMPLE'
  );
  const productionExpenses = nonTestExpenses.filter((expense) => expense.dataClassification === 'PRODUCTION');
  const hasUnclassifiedSales = nonTestSales.some((sale) => sale.dataClassification !== 'PRODUCTION');
  const hasUnclassifiedExpenses = nonTestExpenses.some((expense) => expense.dataClassification !== 'PRODUCTION');
  const salesFieldsComplete = productionSales.every((sale) =>
    isFiniteNumber(sale.totalPrice)
    && isFiniteNumber(sale.totalCost)
    && isFiniteNumber(sale.totalProfit)
    && isFiniteNumber(sale.commissionAmount ?? sale.totalCommission)
    && ['نقدي', 'بطاقة', 'محفظة إلكترونية', 'تحويل بنكي'].includes(String(sale.paymentMethod))
    && typeof sale.date === 'string'
    && Boolean(recordDateKey(sale.date))
    && Array.isArray(sale.items)
    && sale.items.every((item) =>
      isFiniteNumber(item.quantity)
      && item.quantity > 0
      && isFiniteNumber(item.essenceGrams)
      && isFiniteNumber(item.sellingPrice)
    )
  );
  const expensesFieldsComplete = productionExpenses.every((expense) =>
    isFiniteNumber(expense.amount)
    && typeof expense.date === 'string'
    && Boolean(recordDateKey(expense.date))
  );
  const productsFieldsComplete = products.every((product) =>
    isFiniteNumber(product.stock_grams)
    && product.stock_grams >= 0
    && ['عادي', 'نيش', 'مسك', 'عود'].includes(String(product.type))
  );
  const vaultFieldsComplete = vaults.every((vault) => isFiniteNumber(vault.currentBalance));
  const financeSettingsComplete = Boolean(confirmedSettings)
      && typeof confirmedSettings?.currency === 'string'
      && confirmedSettings.currency.trim().length > 0
    && isFiniteNumber(confirmedSettings?.monthlyFixedBudget)
    && Number(confirmedSettings?.monthlyFixedBudget) >= 0
    && isFiniteNumber(confirmedSettings?.monthlyWorkDays)
    && Number(confirmedSettings?.monthlyWorkDays) > 0
    && isFiniteNumber(confirmedSettings?.dailyTargetProfit)
    && Number(confirmedSettings?.dailyTargetProfit) > 0
    && isFiniteNumber(confirmedSettings?.priceEssenceNormal)
    && Number(confirmedSettings?.priceEssenceNormal) >= 0
    && isFiniteNumber(confirmedSettings?.priceEssenceNiche)
    && Number(confirmedSettings?.priceEssenceNiche) >= 0
    && isFiniteNumber(confirmedSettings?.priceEssenceSpecial)
    && Number(confirmedSettings?.priceEssenceSpecial) >= 0
    && isFiniteNumber(confirmedSettings?.lowStockThresholdGrams)
    && Number(confirmedSettings?.lowStockThresholdGrams) >= 0;
  const nonTestWithdrawals = withdrawals.filter((withdrawal) =>
    !withdrawal.isTestData && withdrawal.dataClassification !== 'TEST' && withdrawal.dataClassification !== 'DOC_EXAMPLE'
  );
  const hasUnclassifiedWithdrawals = nonTestWithdrawals.some((withdrawal) => withdrawal.dataClassification !== 'PRODUCTION');
  const dashboardRequiredSources = ['sales', 'products', 'expenses', 'settings', 'vaults', 'withdrawals', 'closures'] as const;
  const allDashboardSourcesLive = Boolean(dataSourceHealth)
    && dashboardRequiredSources.every((key) => dataSourceHealth?.[key]?.state === 'live');
  const dashboardDataIssues = [
    ...dataQualityNotes,
    ...(hasUnclassifiedSales ? ['توجد فواتير غير مصنّفة إنتاجًا؛ لن تدخل في المؤشرات.'] : []),
    ...(hasUnclassifiedExpenses ? ['توجد مصروفات غير مصنّفة إنتاجًا؛ لن تدخل في المؤشرات.'] : []),
    ...(!salesFieldsComplete ? ['بعض حقول الفواتير اللازمة للحساب غير متاحة.'] : []),
    ...(!expensesFieldsComplete ? ['بعض حقول المصروفات المسجلة غير مكتملة.'] : []),
    ...(!productsFieldsComplete ? ['بعض أرصدة المنتجات غير صالحة أو فئة العطر غير معروفة؛ لا يمكن تأكيد حساب قيمة المخزون.'] : []),
    ...(!vaultFieldsComplete ? ['بعض أرصدة الخزائن المسجلة غير متاحة.'] : []),
    ...(!['restock', 'owner_profit'].every((id) => vaults.some((vault) => vault.id === id)) ? ['سجلات خزائن إعادة التوريد أو رصيد المالك غير مكتملة.'] : []),
    ...(hasUnclassifiedWithdrawals ? ['توجد سحوبات غير مصنّفة إنتاجًا؛ لن تدخل في المؤشر.'] : []),
    ...(!financeSettingsComplete ? ['إعدادات العملة أو الميزانية أو التكلفة أو المستهدف غير مكتملة في سجل الإعدادات المؤكد.'] : []),
    ...(hasPendingLocalSales ? ['توجد فواتير محفوظة محليًا لم يؤكد Firestore مزامنتها.'] : []),
  ];
  const dashboardMetricsReady = allDashboardSourcesLive
    && financeSettingsComplete
    && salesFieldsComplete
    && expensesFieldsComplete
    && productsFieldsComplete
    && vaultFieldsComplete
    && ['restock', 'owner_profit'].every((id) => vaults.some((vault) => vault.id === id))
    && !hasUnclassifiedSales
    && !hasUnclassifiedExpenses
    && !hasUnclassifiedWithdrawals
    && !hasPendingLocalSales;

  const getSectionOrderClass = (sectionId: DashboardSectionId): string => {
    const order = dashboardLayout.sections.find((s) => s.id === sectionId)?.order || 1;
    const orderClasses: Record<number, string> = {
      1: 'order-1',
      2: 'order-2',
      3: 'order-3',
      4: 'order-4',
      5: 'order-5',
    };
    return orderClasses[order] || 'order-1';
  };

  const isSectionVisible = (sectionId: DashboardSectionId): boolean => {
    if (!isOwner) return true;
    return dashboardLayout.sections.find((s) => s.id === sectionId)?.visible !== false;
  };

  const handleOpenDashboardCustomizationInSettings = () => {
    try {
      sessionStorage.setItem('lamsa_open_settings_section', 'dashboard_layout');
    } catch {
      // ignore storage error
    }
    if (onNavigate) {
      onNavigate(View.SETTINGS);
    }
  };

  const handleQuickMoveKpiCard = (cardId: DashboardKpiCardId, direction: 'prev' | 'next') => {
    if (!onUpdateSettings || !isOwner) return;
    const visibleCards = dashboardLayout.kpiCards.filter((c) => c.visible);
    const visIdx = visibleCards.findIndex((c) => c.id === cardId);
    if (visIdx === -1) return;
    const swapVisIdx = direction === 'prev' ? visIdx - 1 : visIdx + 1;
    if (swapVisIdx < 0 || swapVisIdx >= visibleCards.length) return;

    const targetSwapId = visibleCards[swapVisIdx].id;
    const fullList = [...dashboardLayout.kpiCards];
    const idxA = fullList.findIndex((c) => c.id === cardId);
    const idxB = fullList.findIndex((c) => c.id === targetSwapId);
    if (idxA === -1 || idxB === -1) return;

    const temp = fullList[idxA];
    fullList[idxA] = fullList[idxB];
    fullList[idxB] = temp;

    const updatedCards = fullList.map((item, index) => ({
      ...item,
      order: index + 1,
    }));

    onUpdateSettings({
      ...settings,
      dashboardLayout: {
        ...dashboardLayout,
        presetName: 'custom',
        kpiCards: updatedCards,
      },
    });
  };

  const handleQuickHideKpiCard = (cardId: DashboardKpiCardId) => {
    if (!onUpdateSettings || !isOwner) return;
    const visibleCount = dashboardLayout.kpiCards.filter((c) => c.visible).length;
    if (visibleCount <= 1) return;

    const updatedCards = dashboardLayout.kpiCards.map((item, idx) => ({
      ...item,
      visible: item.id === cardId ? false : item.visible,
      order: idx + 1,
    }));

    onUpdateSettings({
      ...settings,
      dashboardLayout: {
        ...dashboardLayout,
        presetName: 'custom',
        kpiCards: updatedCards,
      },
    });
  };

  useEffect(() => {
    const timer = setInterval(() => setTime(new Date()), 60000);
    return () => clearInterval(timer);
  }, []);

  // Only explicit production records from the confirmed Firestore snapshots feed these calculations.
  const todayStr = localDateKey(new Date());
  const currentMonthStr = todayStr.slice(0, 7);
  const todaysSales = useMemo(
    () => productionSales.filter((sale) => recordDateKey(sale.date) === todayStr),
    [productionSales, todayStr]
  );
  const totalRevenue = useMemo(() => todaysSales.reduce((acc, sale) => acc + sale.totalPrice, 0), [todaysSales]);
  const totalCost = useMemo(() => todaysSales.reduce((acc, sale) => acc + sale.totalCost, 0), [todaysSales]);

  const fixedMonthlyBudget = Number(confirmedSettings?.monthlyFixedBudget ?? 0);
  const workDays = Number(confirmedSettings?.monthlyWorkDays ?? 0);

  // Commission values are read from each recorded sale; no percentage is invented when absent.
  const todaysCommission = useMemo(() => {
    return todaysSales.reduce((acc, sale) => acc + Number(sale.commissionAmount ?? sale.totalCommission), 0);
  }, [todaysSales]);

  const netContributionToday = totalRevenue - totalCost - todaysCommission;
  const dailyBudgetShare = workDays > 0 ? fixedMonthlyBudget / workDays : null;
  const contributionAfterDailyBudgetShare = dailyBudgetShare === null
    ? null
    : netContributionToday - dailyBudgetShare;

  // The sole daily target is the value explicitly stored in the confirmed settings document.
  const targetPhase1 = Number(confirmedSettings?.dailyTargetProfit ?? 0);
  const isBreakEvenCovered = todaysSales.length > 0 && netContributionToday >= targetPhase1;
  const isTargetAchieved = isBreakEvenCovered;
  const progressPhase1 = targetPhase1 > 0 ? Math.min(Math.max(0, (netContributionToday / targetPhase1) * 100), 100) : 0;

  const remainingToBreakEven = Math.max(0, targetPhase1 - netContributionToday);
  const hasPositiveContribution = todaysSales.length > 0 && netContributionToday > 0;

  // Essence consumed today
  const todaysEssenceGrams = useMemo(() => {
    return todaysSales.reduce((sum, s) => {
      return sum + s.items.reduce((itemSum, item) => itemSum + item.essenceGrams * item.quantity, 0);
    }, 0);
  }, [todaysSales]);

  // Today's total bottles count & average bill
  const todaysBottlesCount = useMemo(() => {
    return todaysSales.reduce((sum, s) => {
      return sum + s.items.reduce((itemSum, it) => itemSum + Number(it.quantity), 0);
    }, 0);
  }, [todaysSales]);

  const averageBill = useMemo<number | null>(() => {
    if (todaysSales.length === 0) return null;
    return totalRevenue / todaysSales.length;
  }, [totalRevenue, todaysSales.length]);

  // Monthly aggregates use the same explicit production classification as the daily report.
  const monthSales = useMemo(
    () => productionSales.filter((sale) => recordDateKey(sale.date).startsWith(currentMonthStr)),
    [productionSales, currentMonthStr]
  );
  const monthRevenue = useMemo(() => monthSales.reduce((acc, s) => acc + s.totalPrice, 0), [monthSales]);
  const monthCost = useMemo(() => monthSales.reduce((acc, s) => acc + s.totalCost, 0), [monthSales]);
  const monthCommissions = useMemo(() => {
    return monthSales.reduce((acc, sale) => acc + Number(sale.commissionAmount ?? sale.totalCommission), 0);
  }, [monthSales]);
  const monthNetContribution = useMemo(() => {
    return monthRevenue - monthCost - monthCommissions;
  }, [monthRevenue, monthCost, monthCommissions]);

  const monthTargetContribution = workDays * targetPhase1;

  // This is the sum of explicitly classified, recorded operational expenses; it is not proof of payment.
  const monthExpenses = useMemo(
    () => productionExpenses.filter((expense) =>
      recordDateKey(expense.date).startsWith(currentMonthStr) && isActualPaidOperationalExpense(expense)
    ),
    [productionExpenses, currentMonthStr]
  );
  const monthRecordedExpensesTotal = useMemo(() => monthExpenses.reduce((acc, e) => acc + e.amount, 0), [monthExpenses]);
  const budgetContributionCoverage = monthSales.length > 0 ? Math.min(fixedMonthlyBudget, Math.max(0, monthNetContribution)) : 0;
  const budgetRemainingAfterRecordedExpenses = fixedMonthlyBudget - monthRecordedExpensesTotal;

  // Gap against the target on dates that have recorded production sales (not a full workday deficit).
  const activeOperationalDaysCount = useMemo(() => {
    return new Set(monthSales.map((sale) => recordDateKey(sale.date))).size;
  }, [monthSales]);
  const elapsedWorkDays = Math.min(workDays, activeOperationalDaysCount);
  const requiredTargetToDate = elapsedWorkDays * targetPhase1;
  const accumulatedDeficit = monthSales.length > 0 ? Math.max(0, requiredTargetToDate - monthNetContribution) : 0;

  // Book value from confirmed system balances; it is not a physical stocktake.
  const restockVaultBalance = vaults.find((vault) => vault.id === 'restock')?.currentBalance ?? 0;
  const rawStockValue = useMemo(() => {
    return products.reduce((sum, p) => {
      const rate = getApprovedOilGramCost(p.type, confirmedSettings || {});
      return sum + (p.stock_grams * rate);
    }, 0);
  }, [products, confirmedSettings]);
  const totalReservedStockCost = restockVaultBalance + rawStockValue;

  // Cash in Drawer vs Electronic
  const todaysCashSales = useMemo(() => {
    return todaysSales
      .filter(s => s.paymentMethod === 'نقدي')
      .reduce((sum, s) => sum + s.totalPrice, 0);
  }, [todaysSales]);

  const todaysElectronicSales = useMemo(() => {
    return todaysSales
      .filter(s => s.paymentMethod === 'بطاقة' || s.paymentMethod === 'محفظة إلكترونية' || s.paymentMethod === 'تحويل بنكي')
      .reduce((sum, s) => sum + s.totalPrice, 0);
  }, [todaysSales]);

  // Cash in drawer is shown only when a physical count was explicitly recorded in today's confirmed closure.
  const actualCashInDrawer = isFiniteNumber(currentClosure?.actualCashInDrawer)
    ? currentClosure.actualCashInDrawer
    : undefined;

  // Only a recorded owner-profit vault balance is a distributable balance; no modeled fallback.
  const ownerProfitVault = vaults.find((v) => v.id === 'owner_profit');
  const distributableProfit = ownerProfitVault?.currentBalance ?? 0;

  const stockAlertThreshold = Number(confirmedSettings?.lowStockThresholdGrams);
  const lowStock = useMemo(() => products.filter((p) => p.stock_grams < stockAlertThreshold), [products, stockAlertThreshold]);

  // Active Warnings & Alerts List
  const activeAlerts = useMemo(() => {
    const list: { title: string; type: 'danger' | 'warning' | 'info'; actionView?: View }[] = [];
    if (lowStock.length > 0) {
      list.push({ title: `${lowStock.length} سجل منتج دون عتبة المخزون المسجلة (${stockAlertThreshold} جم).`, type: 'warning', actionView: View.INVENTORY });
    }
    if (accumulatedDeficit > 0) {
      list.push({ title: `فجوة حسابية عن مستهدف المساهمة التراكمي: ${accumulatedDeficit.toLocaleString('ar-EG')} ${confirmedSettings?.currency}.`, type: 'warning', actionView: View.OPERATIONS_SYSTEM });
    }
    if (!currentClosure) {
      list.push({ title: 'لا يوجد سجل إغلاق/وردية مؤكد لليوم في Firestore.', type: 'info' });
    } else if (currentClosure.status === 'مغلق') {
      list.push({ title: 'سجل Firestore المؤكد يصف وردية اليوم بأنها مغلقة.', type: 'info' });
    }
    return list;
  }, [lowStock.length, accumulatedDeficit, currentClosure]);

  // Transparent calculation breakdown modal openers
  const openDistributableProfitBreakdown = () => {
    setCalculationModal({
      title: 'رصيد خزينة المالك المسجل',
      description: 'رصيد دفتر الخزائن كما ورد من Firestore؛ ليس تدقيقًا لصافي الربح أو مبلغًا معتمدًا للتوزيع.',
      finalValue: distributableProfit,
      unit: confirmedSettings?.currency || '—',
      steps: [
        { label: 'رصيد خزينة المالك', formula: 'currentBalance كما ورد من سجل الخزينة المؤكد', value: distributableProfit, sign: '=' }
      ]
    });
  };

  const openNetContributionBreakdown = () => {
    setCalculationModal({
      title: 'المساهمة الصافية لليوم',
      description: 'حساب مشتق من السعر والتكلفة والعمولة المسجلة في فواتير الإنتاج المؤكدة؛ لا يمثل تدقيقًا محاسبيًا.',
      finalValue: netContributionToday,
      unit: confirmedSettings?.currency || '—',
      steps: [
        { label: 'مبيعات اليوم', formula: `${todaysSales.length} فاتورة مسجلة`, value: totalRevenue, sign: '+' },
        { label: 'التكلفة المسجلة على الفواتير', formula: 'totalCost من سجلات الإنتاج', value: -totalCost, sign: '-' },
        { label: 'عمولات اليوم المسجلة على الفواتير', formula: 'حقول العمولات المحفوظة', value: -todaysCommission, sign: '-' },
        { label: 'المساهمة المحسوبة من حقول الفواتير', formula: 'الإيراد − التكلفة − العمولات المسجلة', value: netContributionToday, sign: '=' }
      ]
    });
  };

  const openDailyBudgetShareBreakdown = () => {
    if (dailyBudgetShare === null || contributionAfterDailyBudgetShare === null) return;
    setCalculationModal({
      title: 'نتيجة حسابية بعد حصة الموازنة اليومية',
      description: 'عملية طرح من بيانات مؤكدة؛ لا تمثل صافي ربح أو خسارة فعلية ولا مصروفًا يوميًا مدفوعًا.',
      finalValue: contributionAfterDailyBudgetShare,
      unit: confirmedSettings?.currency || '—',
      steps: [
        { label: 'المساهمة المحسوبة من فواتير اليوم', formula: 'الإيراد − التكلفة − العمولات المسجلة', value: netContributionToday, sign: '+' },
        { label: 'حصة الموازنة اليومية المحسوبة', formula: 'الموازنة الشهرية المسجلة ÷ أيام العمل المسجلة', value: -dailyBudgetShare, sign: '-' },
        { label: 'النتيجة الحسابية', formula: 'لا تثبت صافي ربح أو مصروفًا نقديًا', value: contributionAfterDailyBudgetShare, sign: '=' }
      ]
    });
  };

  const openBudgetBreakdown = () => {
    setCalculationModal({
      title: 'الموازنة الشهرية المحفوظة',
      description: 'قيم الميزانية وأيام العمل والهدف كما وردت في إعدادات Firestore المؤكدة.',
      finalValue: fixedMonthlyBudget,
      unit: confirmedSettings?.currency || '—',
      steps: [
        { label: 'إجمالي الموازنة الشهرية', formula: 'monthlyFixedBudget من إعدادات Firestore', value: fixedMonthlyBudget, sign: '=' },
        { label: 'أيام العمل الشهرية المسجلة', formula: 'monthlyWorkDays من إعدادات Firestore', value: workDays, sign: '=' },
        { label: 'المستهدف اليومي المسجل', formula: 'dailyTargetProfit من إعدادات Firestore', value: targetPhase1, sign: '=' }
      ]
    });
  };

  const openDeficitBreakdown = () => {
    setCalculationModal({
      title: 'فجوة مستهدف المساهمة حتى اليوم',
      description: 'فارق حسابي بين أيام لها فواتير إنتاج مسجلة × المستهدف اليومي المحفوظ، وبين المساهمة المحسوبة من سجلات الشهر؛ لا يثبت خسارة محاسبية.',
      finalValue: accumulatedDeficit,
      unit: confirmedSettings?.currency || '—',
      steps: [
        { label: 'المستهدف التراكمي المحسوب', formula: `${elapsedWorkDays} أيام لها فواتير إنتاج × المستهدف اليومي المسجل`, value: requiredTargetToDate, sign: '+' },
        { label: 'المساهمة المحسوبة من سجلات الشهر', formula: 'إيراد − تكلفة − عمولات مسجلة', value: -monthNetContribution, sign: '-' },
        { label: 'فجوة المستهدف التراكمي المحسوبة', formula: 'لا تمثل عجزًا نقديًا أو خسارة محاسبية', value: accumulatedDeficit, sign: '=' }
      ]
    });
  };

  const openReservedStockBreakdown = () => {
    setCalculationModal({
      title: 'القيمة الدفترية للمخزون المسجل',
      description: 'رصيد محفظة إعادة التوريد المسجل مضافًا إلى تقدير تكلفة الرصيد المخزني المسجل؛ ليس جردًا ميدانيًا.',
      finalValue: totalReservedStockCost,
      unit: confirmedSettings?.currency || '—',
      steps: [
        { label: 'رصيد محفظة إعادة التوريد', formula: 'currentBalance من سجل الخزينة', value: restockVaultBalance, sign: '+' },
        { label: 'تكلفة المخزون بحسب السجلات', formula: 'جرامات مسجلة × تكلفة الجرام المحفوظة', value: rawStockValue, sign: '+' },
        { label: 'المجموع الدفتري المحسوب', formula: 'لا يثبت كمية فعلية على الرف', value: totalReservedStockCost, sign: '=' }
      ]
    });
  };

  const openCashBreakdown = () => {
    setCalculationModal({
      title: 'مبيعات اليوم حسب طريقة الدفع المسجلة',
      description: 'هذه مجموعات من الفواتير ولا تطابق جرد الدرج المسجل في إغلاق اليوم.',
      finalValue: totalRevenue,
      unit: confirmedSettings?.currency || '—',
      steps: [
        { label: 'فواتير مصنفة نقدًا', formula: 'paymentMethod = نقدي', value: todaysCashSales, sign: '+' },
        { label: 'فواتير إلكترونية/بطاقة/تحويل', formula: 'طرق الدفع المسجلة في الفاتورة', value: todaysElectronicSales, sign: '+' },
        { label: 'إجمالي مبيعات اليوم', formula: 'مجموع طرق الدفع المسجلة في الفواتير', value: totalRevenue, sign: '=' }
      ]
    });
  };

  const openCashDrawerBreakdown = () => {
    if (actualCashInDrawer === undefined) return;
    setCalculationModal({
      title: 'جرد درج اليوم المسجل',
      description: 'القيمة كما وردت في سجل إغلاق اليوم المؤكد؛ لا تُجمع مع مبيعات الفواتير ولا تثبت مطابقتها لها.',
      finalValue: actualCashInDrawer,
      unit: confirmedSettings?.currency || '—',
      steps: [{ label: 'actualCashInDrawer', formula: 'القيمة المسجلة في سجل الإغلاق', value: actualCashInDrawer, sign: '=' }]
    });
  };

  // Date and Time details in Arabic
  const arabicDayName = useMemo(() => {
    return time.toLocaleDateString('ar-EG', { weekday: 'long' });
  }, [time]);

  const arabicDateStr = useMemo(() => {
    return time.toLocaleDateString('ar-EG', { 
      day: 'numeric', 
      month: 'long', 
      year: 'numeric' 
    });
  }, [time]);

  const arabicTimeFormatted = useMemo(() => {
    return time.toLocaleTimeString('ar-EG', { 
      hour: '2-digit', 
      minute: '2-digit', 
      second: '2-digit',
      hour12: true 
    });
  }, [time]);

  // Dynamic greeting based on time of day
  const dynamicGreeting = useMemo(() => {
    const hours = time.getHours();
    if (hours >= 5 && hours < 12) {
      return {
        salute: 'صباح الخير والبركة ☀️',
        periodText: 'فترة الصباح والافتتاح',
        subtext: 'تذكير عام: يمكن مراجعة الفواتير المسجلة قبل اتخاذ قرار تشغيلي.'
      };
    } else if (hours >= 12 && hours < 17) {
      return {
        salute: 'طاب يومك بكل خير ⛅',
        periodText: 'فترة الظهيرة وما بعد الظهر',
        subtext: 'تذكير عام: يمكن مراجعة بيانات الفواتير المسجلة قبل اتخاذ قرار تشغيلي.'
      };
    } else if (hours >= 17 && hours < 22) {
      return {
        salute: 'مساء العطور الفاخرة والأنوار 🌙',
        periodText: 'فترة المساء',
        subtext: 'تذكير عام: راجع المخزون والفواتير المؤكدة قبل التخطيط للمبيعات.'
      };
    } else {
      return {
        salute: 'أهلاً بك في لمسة عطر ✨',
        periodText: 'الفترة الليلية الهادئة',
        subtext: 'تذكير عام: تأكد من تسجيل البيانات اللازمة قبل إغلاق الوردية.'
      };
    }
  }, [time]);

  // Trigger AI Smart Insight
  const refreshAiAdvisor = async () => {
    if (!dashboardMetricsReady) {
      setAiInsight(null);
      return;
    }
    setLoadingAi(true);
    try {
      const remaining = Math.max(0, targetPhase1 - netContributionToday);
      setAiInsight(todaysSales.length === 0
        ? {
            statusTitle: 'لا توجد فواتير إنتاج لليوم في لقطة الخادم المؤكدة.',
            statusBadge: 'لا توجد مبيعات مسجلة',
            alertType: 'warning',
            mainMessage: 'لا يمكن تقييم المساهمة اليومية أو توقع مبيعات مستقبلية دون فواتير إنتاج مؤكدة.',
            actionAdvice: [],
            tacticalPrompt: 'لا تعرض هذه اللوحة تقديرًا لعدد العبوات اللازمة؛ هامش كل منتج يختلف.',
          }
        : netContributionToday < targetPhase1
        ? {
            statusTitle: 'المساهمة المسجلة أقل من المستهدف اليومي المحفوظ.',
            statusBadge: 'دون المستهدف المسجل',
            alertType: 'warning',
            mainMessage: `المساهمة المحسوبة من الفواتير المؤكدة ${netContributionToday.toLocaleString('ar-EG')} ${confirmedSettings?.currency}; المتبقي حسابيًا للوصول إلى المستهدف المحفوظ ${remaining.toLocaleString('ar-EG')} ${confirmedSettings?.currency}. هذه ليست نتيجة تدقيق محاسبي.`,
            actionAdvice: [],
            tacticalPrompt: 'لا يمكن استنتاج عدد مبيعات إضافية أو أرباح مستقبلية من البيانات الحالية.',
          }
        : {
            statusTitle: 'المساهمة المحسوبة بلغت المستهدف اليومي المحفوظ.',
            statusBadge: 'بلغ المستهدف المسجل',
            alertType: 'success',
            mainMessage: `المساهمة المحسوبة من الفواتير المؤكدة ${netContributionToday.toLocaleString('ar-EG')} ${confirmedSettings?.currency}، والمستهدف المحفوظ ${targetPhase1.toLocaleString('ar-EG')} ${confirmedSettings?.currency}. لا يعني ذلك تدقيقًا لصافي الربح أو رصيد النقدية.`,
            actionAdvice: [],
            tacticalPrompt: 'هذا ملخص حسابي للسجلات المؤكدة وليس توقعًا للأداء المستقبلي.',
          });
    } finally {
      setLoadingAi(false);
    }
  };

  useEffect(() => {
    void refreshAiAdvisor();
  }, [dashboardMetricsReady, todaysSales.length, totalRevenue, netContributionToday, targetPhase1, confirmedSettings?.currency]);

  return (
    <div className="px-3 sm:px-5 lg:px-6 pt-1 max-w-[1480px] mx-auto flex flex-col gap-4 pb-14 animate-in fade-in duration-200">
      {!dashboardMetricsReady ? (
        <>
          {isOwner && (
            <DevicePresenceRadar
              devices={connectedDevices}
              feedStatus={deviceFeedStatus}
              lastServerUpdate={deviceFeedLastServerUpdate}
              isCloudConnected={isCloudConnected}
              onOpen={onOpenConnectedDevices}
            />
          )}
          <section className="rounded-2xl border border-amber-300 bg-amber-50 p-4 sm:p-5 text-slate-800">
            <div className="flex items-start gap-3">
              <ShieldAlert className="text-amber-700 mt-0.5 shrink-0" size={20} />
              <div className="min-w-0">
                <h2 className="font-black text-base">مؤشرات لوحة التحكم محجوبة حتى اكتمال التحقق</h2>
                <p className="mt-1 text-sm leading-6">
                  لا نعرض أرقامًا محلية أو مخبأة على أنها مؤكدة. تُعرض المؤشرات فقط بعد تأكيد الخادم لجميع المصادر المطلوبة واكتمال الحقول الأساسية.
                </p>
              </div>
            </div>
            <div className="mt-4 grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
              {(Object.entries(dataSourceHealth || {}) as [DashboardDataSourceKey, DashboardDataSourceHealthMap[DashboardDataSourceKey]][]).map(([key, source]) => {
                const stateText: Record<string, string> = {
                  connecting: 'جارٍ التحقق',
                  live: 'لقطة خادمية مؤكدة',
                  cached: 'مخبأة — غير معتمدة',
                  pending: 'كتابة معلقة',
                  error: 'تعذر تأكيد المصدر',
                  missing: 'المستند غير موجود',
                  restricted: 'غير متاح لهذا الحساب',
                };
                const names: Record<string, string> = {
                  sales: 'المبيعات', products: 'المنتجات', expenses: 'المصروفات', settings: 'الإعدادات',
                  vaults: 'الخزائن', withdrawals: 'السحوبات', closures: 'الإغلاقات', customers: 'العملاء',
                };
                return (
                  <div key={key} className="rounded-xl border border-slate-200 bg-white p-3 text-xs">
                    <div className="font-bold">{names[key] || key}</div>
                    <div className={source.state === 'live' ? 'mt-1 text-emerald-700' : 'mt-1 text-amber-800'}>
                      {stateText[source.state] || 'الحالة غير معروفة'}
                    </div>
                    {source.lastConfirmedAt && (
                      <div className="mt-1 text-[10px] text-slate-500">
                        آخر لقطة مؤكدة استلمها هذا الجهاز: {new Intl.DateTimeFormat('ar-EG', { dateStyle: 'short', timeStyle: 'short' }).format(new Date(source.lastConfirmedAt))}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
            {dashboardDataIssues.length > 0 && (
              <ul className="mt-4 list-disc space-y-1 pr-5 text-xs leading-5 text-slate-700">
                {Array.from(new Set(dashboardDataIssues)).map((issue) => <li key={issue}>{issue}</li>)}
              </ul>
            )}
          </section>
        </>
      ) : (
      <>
      {/* ======================================================== */}
      {/* 1. WAREDPOS × APPLE × WINDOWS 13 EXECUTIVE WELCOME BAR   */}
      {/* (Clean single-deck identity + quick actions, zero duplication) */}
      {/* ======================================================== */}
      <div className="order-none relative overflow-hidden rounded-[22px] apple-bento-card p-3.5 sm:p-4 bg-white/95 border border-slate-200/90 shadow-2xs">
        <div className="relative z-10 flex flex-col xl:flex-row xl:items-center justify-between gap-3.5">
          <div className="flex items-center gap-3">
            <div className="relative shrink-0 w-11 h-11 sm:w-12 sm:h-12">
              {confirmedSettings?.logoUrl ? (
                <img
                  src={confirmedSettings.logoUrl}
                  alt={confirmedSettings.storeName?.trim() || 'شعار المتجر المسجل'}
                  onError={(e) => { e.currentTarget.style.display = 'none'; }}
                  className="w-11 h-11 sm:w-12 sm:h-12 max-w-[48px] max-h-[48px] object-contain bg-white rounded-2xl p-1 shadow-2xs border border-slate-200/80 block"
                />
              ) : (
                <div className="w-11 h-11 sm:w-12 sm:h-12 rounded-2xl bg-slate-100 border border-slate-200/80 flex items-center justify-center text-slate-500" aria-label="لا يوجد شعار مسجل">
                  <Store size={20} />
                </div>
              )}
              <span className="absolute -bottom-1 -left-1 w-4 h-4 rounded-full bg-[#0F172A] text-amber-400 flex items-center justify-center border border-white">
                <Sparkles size={9} />
              </span>
            </div>
            <div className="space-y-0.5">
              <div className="flex flex-wrap items-center gap-1.5">
                <span className="text-[10px] font-black text-[#0067C0] bg-[#0067C0]/[0.08] px-2 py-0.5 rounded-md border border-[#0067C0]/20">
                  {dynamicGreeting.periodText}
                </span>
                <span className="text-[11px] font-semibold text-slate-500">{dynamicGreeting.salute}</span>
                <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-black border ${
                  isBreakEvenCovered
                    ? 'bg-emerald-500/10 text-emerald-800 border-emerald-500/25'
                    : 'bg-amber-500/10 text-amber-900 border-amber-500/25'
                }`}>
                  <span className={`w-1.5 h-1.5 rounded-full ${isBreakEvenCovered ? 'bg-emerald-500' : 'bg-amber-500'}`} />
                  <span>
                    {isBreakEvenCovered
                      ? (netContributionToday > targetPhase1
                          ? `المساهمة أعلى من المستهدف المسجل بـ ${formatMetricNumber(netContributionToday - targetPhase1)} ${confirmedSettings?.currency}`
                          : 'بلغت المساهمة المستهدف اليومي المسجل')
                      : (todaysSales.length === 0
                          ? 'لا توجد فواتير إنتاج مؤكدة لهذا اليوم'
                          : `المتبقي حسابيًا للمستهدف ${formatMetricNumber(remainingToBreakEven)} ${confirmedSettings?.currency}`)}
                  </span>
                </span>

                {/* Real-time Multi-Device Sync Badge in Owner's Dashboard (خاص بالمالك د. محمد فقط) */}
                {isOwner && (
                  <button
                    type="button"
                    onClick={onOpenConnectedDevices}
                    className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-md text-[10px] font-black border bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-800 border-emerald-500/30 transition-all cursor-pointer shadow-2xs"
                    title="عرض الأجهزة التي أرسلت نبضة حضور حديثة وحالة تأكيد Firestore"
                  >
                    <span className={`h-1.5 w-1.5 rounded-full ${deviceFeedStatus === 'live' ? 'animate-ping bg-emerald-500' : 'bg-amber-500'}`} />
                    <Radio size={11} className={deviceFeedStatus === 'live' ? 'text-emerald-600 animate-pulse' : 'text-amber-600'} />
                    <span>{deviceFeedStatus === 'live' ? `${connectedDevices.length} جهاز ذو نبضة حديثة` : 'عدد الأجهزة غير مؤكد'}</span>
                  </button>
                )}
              </div>
              <h1 className="text-lg sm:text-xl font-black tracking-tight text-[#0F172A] leading-tight">
                متجر <span className="text-[#0067C0]">{confirmedSettings?.storeName?.trim() || 'اسم المتجر غير مؤكد'}</span>
                <span className="text-xs font-bold text-[#9A6E23] mr-2 inline-block">
                  — {confirmedSettings?.storeSlogan?.trim() || 'لا يوجد شعار مسجل'}
                </span>
              </h1>
            </div>
          </div>

          {/* Sleek WaredPOS × Windows 13 Segmented Action Dock */}
          {onNavigate && (
            <div className="flex flex-wrap items-center gap-1.5 bg-slate-100/90 p-1.5 rounded-2xl border border-slate-200/80">
              <button
                type="button"
                onClick={() => onNavigate(View.POS)}
                className="apple-btn flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-[#0067C0] hover:bg-[#005A9E] text-white font-black text-xs shadow-2xs cursor-pointer"
              >
                <Plus size={14} strokeWidth={2.6} />
                <span>نقطة البيع (الكاشير)</span>
              </button>

              <button
                type="button"
                onClick={() => onNavigate(View.OPERATIONS_SYSTEM)}
                className="apple-btn flex items-center gap-1.5 px-3 py-2 rounded-xl bg-[#0F172A] hover:bg-slate-800 text-amber-300 font-black text-xs shadow-2xs cursor-pointer"
              >
                <Target size={13} className="text-amber-300" />
                <span>التارجت والحوافز</span>
              </button>

              {canAccessView(currentUser ?? null, View.REPORTS) && (
                <button
                  type="button"
                  onClick={() => onNavigate(View.REPORTS)}
                  className="apple-btn flex items-center gap-1.5 px-3 py-2 rounded-xl bg-white hover:bg-slate-50 text-[#0F172A] font-bold text-xs border border-slate-200/90 shadow-2xs cursor-pointer"
                >
                  <FileText size={13} className="text-[#0067C0]" />
                  <span>الفواتير</span>
                </button>
              )}

              {canAccessView(currentUser ?? null, View.INVENTORY) && (
                <button
                  type="button"
                  onClick={() => onNavigate(View.INVENTORY)}
                  className="apple-btn flex items-center gap-1.5 px-3 py-2 rounded-xl bg-white hover:bg-slate-50 text-[#0F172A] font-bold text-xs border border-slate-200/90 shadow-2xs cursor-pointer"
                >
                  <Package size={13} className="text-emerald-600" />
                  <span>المخزون</span>
                </button>
              )}

              {canAccessView(currentUser ?? null, View.FINANCIAL_VAULTS) && (
                <button
                  type="button"
                  onClick={() => onNavigate(View.FINANCIAL_VAULTS)}
                  className="apple-btn flex items-center gap-1.5 px-3 py-2 rounded-xl bg-white hover:bg-slate-50 text-[#0F172A] font-bold text-xs border border-slate-200/90 shadow-2xs cursor-pointer"
                >
                  <Wallet size={13} className="text-[#9A6E23]" />
                  <span>الخزائن</span>
                </button>
              )}

              {isOwner && (
                <button
                  type="button"
                  onClick={handleOpenDashboardCustomizationInSettings}
                  className="apple-btn flex items-center gap-1.5 px-2.5 py-2 rounded-xl bg-white hover:bg-slate-50 text-slate-700 font-black text-xs border border-slate-200/90 shadow-2xs cursor-pointer"
                  title="تخصيص وترتيب البطاقات"
                >
                  <Sliders size={13} className="text-[#0067C0]" />
                  <span className="hidden sm:inline">تخصيص</span>
                </button>
              )}
            </div>
          )}
        </div>
      </div>

            {/* ======================================================== */}
      {/* RECORDED COST OF GOODS SOLD — NOT CASH ON HAND */}
      {/* ======================================================== */}
      <div className="order-none rounded-[22px] p-4 sm:p-5 bg-gradient-to-r from-amber-950 via-slate-900 to-slate-950 text-white border-2 border-amber-500/40 shadow-xl space-y-3">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-white/10">
          <div className="flex items-center gap-3">
            <div className="w-11 h-11 rounded-2xl bg-amber-500 text-slate-950 flex items-center justify-center shrink-0 shadow-lg font-black">
              <Lock size={22} />
            </div>
            <div>
              <div className="flex items-center gap-2 flex-wrap">
                <h3 className="text-sm sm:text-base font-black text-amber-300">
                  تكلفة المنتجات المسجلة في فواتير اليوم
                </h3>
                <span className="px-2.5 py-0.5 rounded-full bg-amber-500/20 text-amber-200 border border-amber-400/40 text-[10px] font-black">
                  حقل تكلفة مسجل
                </span>
              </div>
              <p className="text-xs text-slate-300 mt-0.5">
                مجموع التكلفة المسجلة على فواتير الإنتاج المؤكدة اليوم؛ لا يثبت وجود نقدية في الدرج أو عزلها.
              </p>
            </div>
          </div>

          <div className="text-left bg-white/10 px-4 py-2.5 rounded-2xl border border-amber-400/30 shrink-0">
            <span className="text-[10px] font-bold text-amber-200 block text-right sm:text-left">تكلفة الفواتير المسجلة اليوم:</span>
            <div className="text-2xl font-black font-mono text-amber-400 text-right sm:text-left">
              {totalCost.toLocaleString('ar-EG')} <span className="text-xs font-bold text-white">{confirmedSettings?.currency}</span>
            </div>
            <span className="text-[10px] text-slate-300 block text-right sm:text-left font-mono">
              عن بيع {todaysSales.length} فاتورة ({todaysEssenceGrams} جم زيت)
            </span>
          </div>
        </div>

        <div className="p-3 rounded-xl bg-amber-500/10 border border-amber-500/20 flex items-start gap-2 text-xs text-amber-100 leading-relaxed">
          <ShieldAlert size={18} className="text-amber-400 shrink-0 mt-0.5" />
          <div>
            <strong className="text-amber-300 font-bold block mb-0.5">حدود هذا المؤشر:</strong>
            <span>
              <strong className="font-mono text-amber-300 text-sm px-1 font-black">{totalCost.toLocaleString('ar-EG')} {confirmedSettings?.currency}</strong> قيمة محاسبية مشتقة من حقول الفواتير المؤكدة فقط؛ ليست رصيدًا نقديًا ولا إثباتًا بأن المبلغ عُزل أو رُحّل.
            </span>
          </div>
        </div>
      </div>

      {isOwner && (
        <DevicePresenceRadar
          devices={connectedDevices}
          feedStatus={deviceFeedStatus}
          lastServerUpdate={deviceFeedLastServerUpdate}
          isCloudConnected={isCloudConnected}
          onOpen={onOpenConnectedDevices}
        />
      )}

      {/* ======================================================== */}
      {/* 2. APPLE INTELLIGENCE BENTO ROW: ADVISOR + TARGET ENGINE */}
      {/* ======================================================== */}
      {isSectionVisible('ai_advisor_and_target') && (
      <div className={`${getSectionOrderClass('ai_advisor_and_target')} grid grid-cols-1 lg:grid-cols-12 gap-4 items-stretch`}>
        {/* Right 7 Cols: Deterministic confirmed-data summary */}
        <div className="lg:col-span-7 apple-bento-card rounded-[22px] p-4 sm:p-5 flex flex-col justify-between border border-slate-200/90 bg-white/95 shadow-2xs">
          <div>
            <div className="flex flex-wrap items-center justify-between gap-2 pb-3.5 border-b border-black/[0.06]">
              <div className="flex items-center gap-2.5">
                <div className={`w-10 h-10 rounded-2xl flex items-center justify-center font-bold shadow-xs ${
                  !hasPositiveContribution ? 'bg-rose-600 text-white' : 'bg-[#0071E3] text-white'
                }`}>
                  {!hasPositiveContribution ? <ShieldAlert size={19} /> : <Sparkles size={19} />}
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <span className="text-xs sm:text-sm font-black text-[#1D1D1F]">
                      ملخص حسابي من البيانات المؤكدة
                    </span>
                    <span className="text-[10px] font-mono font-bold px-2 py-0.5 rounded-full bg-[#0071E3]/10 text-[#0071E3]">
                      محسوب من لقطات الخادم المؤكدة
                    </span>
                  </div>
                  <span className="text-[11px] text-[#86868B] block font-medium">
                    مؤشرات حسابية من سجلات الإنتاج وإعدادات الهدف المحفوظة
                  </span>
                </div>
              </div>

              <div className="flex items-center gap-2">
                <span className={`text-[11px] font-bold px-3 py-1 rounded-xl ${
                  aiInsight?.alertType === 'danger'
                    ? 'bg-rose-100 text-rose-800'
                    : aiInsight?.alertType === 'warning'
                    ? 'bg-amber-100 text-amber-900'
                    : 'bg-emerald-100 text-emerald-800'
                }`}>
                  {aiInsight?.statusBadge || (todaysSales.length === 0 ? 'لا توجد فواتير إنتاج اليوم' : isBreakEvenCovered ? 'بلغ المستهدف المسجل' : 'دون المستهدف المسجل')}
                </span>

                <button
                  type="button"
                  onClick={refreshAiAdvisor}
                  disabled={loadingAi}
                  className="apple-btn p-2 rounded-xl bg-white border border-black/[0.08] text-[#1D1D1F] hover:bg-black/[0.03] cursor-pointer"
                  title="إعادة حساب الملخص من اللقطات المؤكدة"
                >
                  <RefreshCw size={14} className={loadingAi ? 'animate-spin text-[#0071E3]' : ''} />
                </button>
              </div>
            </div>

            <div className="pt-4 space-y-3.5">
              <div className="space-y-1">
                <h3 className={`text-sm sm:text-base font-black ${
                  !isBreakEvenCovered ? 'text-rose-700' : 'text-emerald-800'
                }`}>
                    {aiInsight?.statusTitle || (todaysSales.length === 0
                    ? 'لا توجد فواتير إنتاج مؤكدة لهذا اليوم.'
                    : isBreakEvenCovered
                    ? 'المساهمة المحسوبة بلغت المستهدف اليومي المحفوظ.'
                    : 'المساهمة المحسوبة أقل من المستهدف اليومي المحفوظ.')}
                </h3>
                <p className="text-xs text-[#3A3A3C] leading-relaxed font-medium">
                  {aiInsight?.mainMessage || (todaysSales.length === 0
                    ? 'لا يمكن استنتاج عجز أو ربح عند عدم وجود فواتير إنتاج مؤكدة.'
                    : `المساهمة المحسوبة ${netContributionToday.toLocaleString('ar-EG')} ${confirmedSettings?.currency}; المستهدف المسجل ${targetPhase1.toLocaleString('ar-EG')} ${confirmedSettings?.currency}. لا يُعرض تقدير لعدد العبوات أو الربح المستقبلي.`)}
                </p>
              </div>

              {aiInsight?.actionAdvice && aiInsight.actionAdvice.length > 0 && (
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
                  {aiInsight.actionAdvice.map((advice, idx) => (
                    <div key={idx} className="p-3 rounded-2xl bg-white/90 border border-black/[0.06] space-y-1 shadow-2xs">
                      <div className="flex items-center gap-1.5 text-[11px] font-black text-[#0071E3]">
                        <Lightbulb size={13} className="text-amber-500 shrink-0" />
                        <span>خطة مبيعات {idx + 1}</span>
                      </div>
                      <p className="text-[11px] text-[#3A3A3C] leading-relaxed">{advice}</p>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* Bottom Tactical Strip */}
          <div className="mt-4 pt-3 border-t border-black/[0.05] flex flex-wrap items-center justify-between gap-2 text-xs">
            <div className="flex items-center gap-2 text-amber-900 font-semibold">
              <Flame size={15} className="text-amber-600 shrink-0" />
              <span className="text-[11px]">
                {aiInsight?.tacticalPrompt || 'الاقتراحات التجارية غير محسوبة من بيانات الأداء ولا تُعرض هنا كحقائق.'}
              </span>
            </div>
            {activeAlerts.length > 0 && activeAlerts[0].actionView && onNavigate && (
              <button
                type="button"
                onClick={() => onNavigate(activeAlerts[0].actionView!)}
                className="px-2.5 py-1 rounded-lg bg-amber-500/15 text-amber-900 text-[11px] font-bold hover:bg-amber-500/25 cursor-pointer"
              >
                تنبيه: {activeAlerts[0].title}
              </button>
            )}
          </div>
        </div>

        {/* Left 5 Cols: Sales Contribution, Target & Store Management Motivation Hub */}
        <div 
          className="lg:col-span-5 light-surface rounded-[26px] p-5 sm:p-6 bg-[#e6e5ef] text-[#0F172A] flex flex-col justify-between border border-[#c5b5d8] shadow-sm transition-all duration-300"
          data-surface="light"
        >
          <div className="space-y-4">
            {/* Header & Commission Tier Indicator */}
            <div className="flex items-start justify-between gap-3 pb-3.5 border-b border-[#d8cce8]">
              <div className="flex items-center gap-2.5">
                <div className="w-10 h-10 rounded-2xl flex items-center justify-center border bg-emerald-100 border-emerald-300 text-emerald-800 shadow-2xs">
                  <Target size={20} />
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <h3 className="text-xs sm:text-sm font-black text-[#0F172A]">
                      مركز المساهمة والتارجت وتشجيع المبيعات
                    </h3>
                  </div>
                  <p className="text-[11px] text-[#4A3E56] mt-0.5 font-bold">
                    متابعة لحظية للمبيعات والمساهمة وحافز إدارة المتجر (طارق)
                  </p>
                </div>
              </div>

              <span className="px-2.5 py-1 rounded-xl text-[10px] font-black border shrink-0 bg-blue-100 text-blue-900 border-blue-300">
                العمولة من حقول الفواتير المؤكدة
              </span>
            </div>

            {/* 3 Mini Bento Pills inside Target & Contribution Card */}
            <div className="grid grid-cols-3 gap-2 text-center">
              <div className="p-2.5 rounded-2xl bg-white/95 border border-[#d8cce8] shadow-2xs">
                <span className="text-[10px] text-[#2D2438] font-black block">مساهمة اليوم الصافية</span>
                <span className="text-base sm:text-lg font-black font-mono text-emerald-800 mt-0.5 block">
                  {formatMetricNumber(netContributionToday)}
                </span>
                <span className="text-[10px] text-[#5C4D6E] font-mono font-bold">
                  من المستهدف المسجل {targetPhase1.toLocaleString('ar-EG')} {confirmedSettings?.currency}
                </span>
              </div>

              <div className="p-2.5 rounded-2xl bg-white/95 border border-[#d8cce8] shadow-2xs">
                <span className="text-[10px] text-[#2D2438] font-black block">مبيعات وعبوات اليوم</span>
                <span className="text-base sm:text-lg font-black font-mono text-amber-900 mt-0.5 block">
                  {totalRevenue.toLocaleString('ar-EG')}
                </span>
                <span className="text-[10px] text-[#5C4D6E] font-mono font-bold">
                  {todaysBottlesCount} عبوة · {todaysSales.length} فاتورة
                </span>
              </div>

              <div className="p-2.5 rounded-2xl bg-white/95 border border-[#d8cce8] shadow-2xs">
                <span className="text-[10px] text-[#2D2438] font-black block">عمولات الفواتير</span>
                <span className="text-base sm:text-lg font-black font-mono text-blue-800 mt-0.5 block">
                  {formatMetricNumber(todaysCommission)} {confirmedSettings?.currency}
                </span>
                <span className="text-[10px] text-[#5C4D6E] font-bold">
                  اليوم: {formatMetricNumber(todaysCommission)} · الشهر: {formatMetricNumber(monthCommissions)} {confirmedSettings?.currency}
                </span>
              </div>
            </div>

            {/* Live Target Progress & Motivation Strip */}
            <div className="p-3 rounded-2xl bg-white/95 border border-[#d8cce8] space-y-2 text-[11px] shadow-2xs">
              <div className="flex items-center justify-between">
                <span className="text-[#0F172A] font-black">
                  {todaysSales.length === 0
                    ? 'لا توجد فواتير إنتاج مؤكدة لهذا اليوم.'
                    : isBreakEvenCovered
                    ? `بلغت المساهمة المحسوبة المستهدف اليومي المسجل (${targetPhase1.toLocaleString('ar-EG')} ${confirmedSettings?.currency}).`
                    : `المتبقي حسابيًا للوصول إلى المستهدف اليومي المسجل: ${formatMetricNumber(remainingToBreakEven)} ${confirmedSettings?.currency}.`}
                </span>
                <span className="font-mono font-black text-emerald-800">
                  {formatConservativePercent(progressPhase1)}
                </span>
              </div>
              <div className="w-full h-2 rounded-full bg-purple-100/80 overflow-hidden border border-purple-200">
                <div
                  className="h-full bg-gradient-to-r from-[#0067C0] via-emerald-600 to-amber-600 rounded-full transition-all duration-500"
                  style={{ width: `${progressPhase1}%` }}
                />
              </div>
              <div className="flex items-center justify-between text-[10px] text-[#4A3E56] pt-0.5">
                <span className="font-bold text-[#2D2438]">
                  العمولة المعروضة هي مجموع قيم الفواتير المحفوظة؛ لا يُستنتج معدل من عدد العبوات.
                </span>
                <span className="font-mono text-[#4A3E56] font-bold">
                  مساهمة الشهر: {formatMetricNumber(monthNetContribution)} / هدف الإعدادات: {formatMetricNumber(monthTargetContribution)} {confirmedSettings?.currency}
                </span>
              </div>
            </div>
          </div>

          {/* Bottom Action Buttons */}
          <div className="pt-3.5 mt-3 border-t border-[#d8cce8] grid grid-cols-2 gap-2">
            {onNavigate && (
              <button
                type="button"
                onClick={() => onNavigate(View.OPERATIONS_SYSTEM)}
                className="apple-btn py-2.5 px-3 rounded-xl bg-gradient-to-r from-[#C49746] to-[#B38332] hover:opacity-95 text-white text-xs font-black flex items-center justify-center gap-1.5 shadow-sm cursor-pointer"
              >
                <Target size={14} />
                <span>خطة التارجت والمساهمة</span>
              </button>
            )}
            {onNavigate && (
              <button
                type="button"
                onClick={() => onNavigate(View.POS)}
                className="apple-btn py-2.5 px-3 rounded-xl bg-white hover:bg-amber-50/50 text-[#0F172A] text-xs font-black flex items-center justify-center gap-1.5 border border-[#c5b5d8] shadow-2xs cursor-pointer"
              >
                <ShoppingBag size={14} className="text-emerald-700" />
                <span>تنشيط المبيعات بالكاشير</span>
              </button>
            )}
          </div>
        </div>
      </div>
      )}

      {/* ======================================================== */}
      {/* 👑 لوحة د. محمد: المؤشرات التنفيذية الرئيسية والشفافية    */}
      {/* (تعرض للمالك فقط، أما الموظفون فيرون مؤشرات التشغيل المخصصة) */}
      {/* ======================================================== */}
      {canViewProfits(currentUser ?? null) ? (
        <>
          {isSectionVisible('kpi_executive_cards') && (
            <div className={`${getSectionOrderClass('kpi_executive_cards')} space-y-3`}>
              <div className="flex flex-wrap items-center justify-between gap-2 px-1">
                <div className="flex items-center gap-2">
                  <Calculator size={18} className="text-[#0071E3]" />
                  <h2 className="text-sm font-black text-[#1D1D1F]">
                    لوحة المؤشرات والتقارير المالية والتشغيلية (اضغط على أي بطاقة لعرض الاحتساب)
                  </h2>
                </div>

                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-[11px] text-[#86868B] font-medium hidden xl:inline">
                    سلسلة الحساب: المبيعات ← التكلفة ← العمولات ← حصة الموازنة = نتيجة حسابية
                  </span>

                  {isOwner && (
                    <>
                      <button
                        type="button"
                        onClick={() => setIsQuickReorderOpen((prev) => !prev)}
                        className={`apple-btn px-3 py-1.5 rounded-xl text-[11px] font-bold border flex items-center gap-1.5 transition-all cursor-pointer ${
                          isQuickReorderOpen
                            ? 'bg-[#1D1D1F] text-amber-300 border-[#1D1D1F]'
                            : 'bg-white text-[#1D1D1F] border-black/[0.08] hover:bg-black/[0.03]'
                        }`}
                      >
                        <Layout size={13} />
                        <span>{isQuickReorderOpen ? 'إنهاء الترتيب السريع' : 'ترتيب سريع للبطاقات'}</span>
                      </button>

                      <button
                        type="button"
                        onClick={handleOpenDashboardCustomizationInSettings}
                        className="apple-btn px-3 py-1.5 rounded-xl bg-[#0071E3]/10 hover:bg-[#0071E3]/20 text-[#0071E3] text-[11px] font-black border border-[#0071E3]/25 flex items-center gap-1.5 transition-all cursor-pointer"
                      >
                        <Sliders size={13} />
                        <span>تخصيص البطاقات في إعدادات المتجر</span>
                      </button>
                    </>
                  )}
                </div>
              </div>

              {/* Dynamic Customizable 12 Metric Cards Grid */}
              <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
                {dashboardLayout.kpiCards
                  .filter((c) => c.visible)
                  .sort((a, b) => a.order - b.order)
                  .map((cardItem, visIndex, visArr) => {
                    const renderReorderStrip = () => {
                      if (!isQuickReorderOpen || !isOwner) return null;
                      return (
                        <div
                          onClick={(e) => e.stopPropagation()}
                          className="mb-2.5 pb-2 border-b border-black/[0.06] flex items-center justify-between gap-1 bg-black/[0.03] -mx-2 px-2.5 py-1.5 rounded-xl"
                        >
                          <span className="text-[10px] font-mono font-black px-1.5 py-0.5 rounded bg-[#1D1D1F] text-amber-300">
                            #{visIndex + 1}
                          </span>
                          <div className="flex items-center gap-1">
                            <button
                              type="button"
                              disabled={visIndex === 0}
                              onClick={() => handleQuickMoveKpiCard(cardItem.id, 'prev')}
                              className="p-1 rounded-lg bg-white border border-black/[0.08] text-[#1D1D1F] disabled:opacity-30 hover:bg-black/[0.05] cursor-pointer"
                              title="تقديم البطاقة"
                            >
                              <ArrowUp size={12} />
                            </button>
                            <button
                              type="button"
                              disabled={visIndex === visArr.length - 1}
                              onClick={() => handleQuickMoveKpiCard(cardItem.id, 'next')}
                              className="p-1 rounded-lg bg-white border border-black/[0.08] text-[#1D1D1F] disabled:opacity-30 hover:bg-black/[0.05] cursor-pointer"
                              title="تأخير البطاقة"
                            >
                              <ArrowDown size={12} />
                            </button>
                            <button
                              type="button"
                              onClick={() => handleQuickHideKpiCard(cardItem.id)}
                              className="p-1 rounded-lg bg-rose-50 border border-rose-200 text-rose-700 hover:bg-rose-100 cursor-pointer"
                              title="إخفاء هذه البطاقة"
                            >
                              <EyeOff size={12} />
                            </button>
                          </div>
                        </div>
                      );
                    };

                    switch (cardItem.id) {
                      case 'today_revenue':
                        return (
                          <div
                            key={cardItem.id}
                            onClick={openCashBreakdown}
                            className="apple-glass-card rounded-2xl p-4 sm:p-5 border border-slate-200/90 bg-white/95 flex flex-col justify-between cursor-pointer hover:border-[#0067C0]/45 hover:shadow-md transition-all group"
                          >
                            <div>
                              {renderReorderStrip()}
                              <div className="flex items-center justify-between mb-2">
                                <span className="text-xs font-bold text-slate-600 group-hover:text-[#0067C0] transition-colors">
                                  مبيعات اليوم
                                </span>
                                <div className="w-8 h-8 rounded-xl bg-[#0067C0]/10 text-[#0067C0] flex items-center justify-center">
                                  <DollarSign size={16} />
                                </div>
                              </div>
                              <div className="text-2xl sm:text-3xl font-black text-[#0F172A] font-mono">
                                {totalRevenue.toLocaleString('ar-EG')}{' '}
                                <span className="text-xs font-normal text-slate-400">{confirmedSettings?.currency}</span>
                              </div>
                              <p className="text-[10px] text-slate-500 mt-1 font-medium">
                                {todaysSales.length} فواتير · {todaysBottlesCount} عبوة · متوسط {averageBill === null ? 'غير متاح' : `${averageBill.toLocaleString('ar-EG')} ${confirmedSettings?.currency}`}
                              </p>
                            </div>
                            <div className="mt-2.5 pt-2 border-t border-slate-100 flex items-center justify-between text-[10px] text-[#0067C0] font-bold">
                              <span>عرض تفصيل النقدية والإلكتروني</span>
                              <Info size={12} />
                            </div>
                          </div>
                        );

                      case 'today_cogs':
                        return (
                          <div
                            key={cardItem.id}
                            onClick={openNetContributionBreakdown}
                            className="apple-glass-card rounded-2xl p-4 sm:p-5 border border-slate-200/90 bg-white/95 flex flex-col justify-between cursor-pointer hover:border-[#0067C0]/45 hover:shadow-md transition-all group"
                          >
                            <div>
                              {renderReorderStrip()}
                              <div className="flex items-center justify-between mb-2">
                                <span className="text-xs font-bold text-slate-600 group-hover:text-slate-900 transition-colors">
                                  التكلفة المسجلة على فواتير اليوم
                                </span>
                                <div className="w-8 h-8 rounded-xl bg-slate-100 text-slate-700 flex items-center justify-center">
                                  <Scale size={16} />
                                </div>
                              </div>
                              <div className="text-2xl sm:text-3xl font-black text-[#0F172A] font-mono">
                                {totalCost.toLocaleString('ar-EG')}{' '}
                                <span className="text-xs font-normal text-slate-400">{confirmedSettings?.currency}</span>
                              </div>
                              <p className="text-[10px] text-slate-500 mt-1 font-medium">
                                {todaysEssenceGrams.toLocaleString('ar-EG')} جم محسوبة من بنود الفواتير
                              </p>
                            </div>
                            <div className="mt-2.5 pt-2 border-t border-slate-100 flex items-center justify-between text-[10px] text-slate-600 font-bold">
                              <span>تفصيل تكلفة المبيعات والمساهمة</span>
                              <Info size={12} />
                            </div>
                          </div>
                        );

                      case 'today_net_contribution':
                        return (
                          <div
                            key={cardItem.id}
                            onClick={openNetContributionBreakdown}
                            className="apple-glass-card rounded-2xl p-4 sm:p-5 border border-slate-200/90 bg-white/95 flex flex-col justify-between cursor-pointer hover:border-[#0067C0]/45 hover:shadow-md transition-all group"
                          >
                            <div>
                              {renderReorderStrip()}
                              <div className="flex items-center justify-between mb-2">
                                <span className="text-xs font-bold text-slate-600 group-hover:text-[#0067C0] transition-colors">
                                  المساهمة المحسوبة اليوم
                                </span>
                                <div className="w-8 h-8 rounded-xl bg-[#0067C0]/10 text-[#0067C0] flex items-center justify-center">
                                  <TrendingUp size={16} />
                                </div>
                              </div>
                              <div className="text-2xl sm:text-3xl font-black text-[#0067C0] font-mono">
                                {netContributionToday.toLocaleString('ar-EG')}{' '}
                                <span className="text-xs font-normal text-slate-400">{confirmedSettings?.currency}</span>
                              </div>
                              <p className="text-[10px] text-slate-500 mt-1 font-medium">
                                الإيراد ناقص التكلفة والعمولات المخزنة ({todaysCommission.toLocaleString('ar-EG')} {confirmedSettings?.currency})
                              </p>
                            </div>
                            <div className="mt-2.5 pt-2 border-t border-slate-100 flex items-center justify-between text-[10px] text-[#0067C0] font-bold">
                              <span>عرض معادلة المساهمة</span>
                              <Info size={12} />
                            </div>
                          </div>
                        );

                      case 'real_net_profit':
                        return (
                          <div
                            key={cardItem.id}
                            onClick={contributionAfterDailyBudgetShare === null ? undefined : openDailyBudgetShareBreakdown}
                            className="apple-glass-card rounded-2xl p-4 sm:p-5 border border-slate-200/90 bg-white/95 flex flex-col justify-between cursor-pointer hover:border-[#0067C0]/45 hover:shadow-md transition-all group"
                          >
                            <div>
                              {renderReorderStrip()}
                              <div className="flex items-center justify-between mb-2">
                                <span className="text-xs font-bold text-slate-600 group-hover:text-[#0067C0]">نتيجة حسابية بعد الحصة اليومية</span>
                                <div className="w-8 h-8 rounded-xl bg-[#0067C0]/10 text-[#0067C0] flex items-center justify-center"><Wallet size={16} /></div>
                              </div>
                              <div className="text-2xl sm:text-3xl font-black text-[#0F172A] font-mono">
                                {contributionAfterDailyBudgetShare === null ? 'غير متاح' : formatMetricNumber(contributionAfterDailyBudgetShare)} <span className="text-xs font-normal text-slate-400">{confirmedSettings?.currency}</span>
                              </div>
                              <p className="text-[10px] text-slate-500 mt-1 font-medium">المساهمة المسجلة ناقص حصة الميزانية المحسوبة؛ لا يثبت ربحًا أو خسارة فعلية.</p>
                            </div>
                            <div className="mt-2.5 pt-2 border-t border-slate-100 flex items-center justify-between text-[10px] text-[#0067C0] font-bold">
                              <span>عرض معادلة الحصة اليومية</span>
                              <Info size={12} />
                            </div>
                          </div>
                        );

                      case 'today_target':
                        return (
                          <div
                            key={cardItem.id}
                            onClick={() => onNavigate && onNavigate(View.OPERATIONS_SYSTEM)}
                            className="apple-glass-card rounded-2xl p-4 sm:p-5 border border-slate-200/90 bg-white/95 flex flex-col justify-between cursor-pointer hover:border-[#C49746]/50 hover:shadow-md transition-all"
                          >
                            <div>
                              {renderReorderStrip()}
                              <div className="flex items-center justify-between mb-2">
                                <span className="text-xs font-bold text-slate-600">المستهدف اليومي المسجل</span>
                                <div className="w-8 h-8 rounded-xl bg-[#C49746]/15 text-[#9A6E23] flex items-center justify-center">
                                  <Target size={16} />
                                </div>
                              </div>
                              <div className="text-2xl sm:text-3xl font-black text-[#0F172A] font-mono">
                                {formatMetricNumber(targetPhase1)}{' '}
                                <span className="text-xs font-normal text-slate-400">{confirmedSettings?.currency}</span>
                              </div>
                              <p className="text-[10px] text-slate-500 mt-1 font-medium">
                                المساهمة المحسوبة اليوم: {formatMetricNumber(netContributionToday)} {confirmedSettings?.currency}
                              </p>
                            </div>
                            <div className="mt-2.5 pt-2 border-t border-slate-100 flex items-center justify-between text-[10px] text-[#9A6E23] font-bold">
                              <span>فتح نظام التشغيل والتارجت</span>
                              <ArrowLeft size={12} />
                            </div>
                          </div>
                        );

                      case 'accumulated_deficit':
                        return (
                          <div
                            key={cardItem.id}
                            onClick={openDeficitBreakdown}
                            className="apple-glass-card rounded-2xl p-4 sm:p-5 border border-slate-200/90 bg-white/95 flex flex-col justify-between cursor-pointer hover:border-rose-400 hover:shadow-md transition-all group"
                          >
                            <div>
                              {renderReorderStrip()}
                              <div className="flex items-center justify-between mb-2">
                                <span className="text-xs font-bold text-slate-600 group-hover:text-rose-700 transition-colors">
                                  فجوة مستهدف المساهمة للشهر
                                </span>
                                <div className="w-8 h-8 rounded-xl bg-rose-500/10 text-rose-700 flex items-center justify-center">
                                  <ShieldAlert size={16} />
                                </div>
                              </div>
                              <div className="text-2xl sm:text-3xl font-black text-[#0F172A] font-mono">
                                {activeOperationalDaysCount === 0 ? 'غير متاح' : accumulatedDeficit.toLocaleString('ar-EG')}{' '}
                                <span className="text-xs font-normal text-slate-400">{confirmedSettings?.currency}</span>
                              </div>
                              <p className="text-[10px] text-slate-500 mt-1 font-medium">
                                {activeOperationalDaysCount === 0
                                  ? 'لا توجد أيام بفواتير إنتاج مؤكدة لحساب الفجوة.'
                                  : accumulatedDeficit > 0
                                  ? 'فارق حسابي عن الهدف المحفوظ؛ لا يثبت خسارة نقدية.'
                                  : 'لا توجد فجوة عن الهدف التراكمي المحسوب.'}
                              </p>
                            </div>
                            <div className="mt-2.5 pt-2 border-t border-slate-100 flex items-center justify-between text-[10px] text-slate-600 font-bold">
                              <span>عرض تفصيل العجز التراكمي</span>
                              <Info size={12} />
                            </div>
                          </div>
                        );

                      case 'monthly_budget_15k':
                        return (
                          <div
                            key={cardItem.id}
                            onClick={openBudgetBreakdown}
                            className="apple-glass-card rounded-2xl p-4 sm:p-5 border border-slate-200/90 bg-white/95 flex flex-col justify-between cursor-pointer hover:border-[#0067C0]/45 hover:shadow-md transition-all group"
                          >
                            <div>
                              {renderReorderStrip()}
                              <div className="flex items-center justify-between mb-2">
                                <span className="text-xs font-bold text-slate-600 group-hover:text-[#0067C0] transition-colors">
                                  تغطية الموازنة بالمساهمة المحسوبة
                                </span>
                                <div className="w-8 h-8 rounded-xl bg-slate-100 text-slate-700 flex items-center justify-center">
                                  <Building size={16} />
                                </div>
                              </div>
                              <div className="text-2xl sm:text-3xl font-black text-[#0F172A] font-mono">
                                {budgetContributionCoverage.toLocaleString('ar-EG')}{' '}
                                <span className="text-xs font-normal text-slate-400">/ {fixedMonthlyBudget.toLocaleString('ar-EG')}</span>
                              </div>
                              <p className="text-[10px] text-slate-500 mt-1 font-medium">
                                التغطية = مساهمة الفواتير غير السالبة حتى سقف الموازنة؛ ليست مصروفًا. مصروفات مسجلة (لا تثبت الدفع): {monthRecordedExpensesTotal.toLocaleString('ar-EG')} {confirmedSettings?.currency} · الموازنة ناقص المسجل: {budgetRemainingAfterRecordedExpenses.toLocaleString('ar-EG')} {confirmedSettings?.currency}
                              </p>
                            </div>
                            <div className="mt-2.5 pt-2 border-t border-slate-100 flex items-center justify-between text-[10px] text-[#0067C0] font-bold">
                              <span>عرض قيم الميزانية المحفوظة</span>
                              <Info size={12} />
                            </div>
                          </div>
                        );

                      case 'distributable_profit':
                        return (
                          <div
                            key={cardItem.id}
                            onClick={openDistributableProfitBreakdown}
                            className="apple-glass-card rounded-2xl p-4 sm:p-5 border border-slate-200/90 bg-white/95 flex flex-col justify-between cursor-pointer hover:border-emerald-500/50 hover:shadow-md transition-all group"
                          >
                            <div>
                              {renderReorderStrip()}
                              <div className="flex items-center justify-between mb-2">
                                <span className="text-xs font-bold text-slate-600">رصيد خزينة المالك المسجل</span>
                                <div className="w-8 h-8 rounded-xl bg-emerald-500/12 text-emerald-700 flex items-center justify-center">
                                  <Coins size={16} />
                                </div>
                              </div>
                              <div className="text-2xl sm:text-3xl font-black text-emerald-700 font-mono">
                                {distributableProfit.toLocaleString('ar-EG')}{' '}
                                <span className="text-xs font-normal text-slate-400">{confirmedSettings?.currency}</span>
                              </div>
                              <p className="text-[10px] text-slate-500 mt-1 font-bold">
                                رصيد دفتر الخزائن؛ ليس صافي ربح مدققًا
                              </p>
                            </div>
                            <div className="mt-2.5 pt-2 border-t border-slate-100 flex items-center justify-between text-[10px] text-emerald-700 font-bold">
                              <span>عرض رصيد دفتر الخزائن</span>
                              <Info size={12} />
                            </div>
                          </div>
                        );

                      case 'cash_in_drawer':
                        return (
                          <div
                            key={cardItem.id}
                            onClick={actualCashInDrawer === undefined ? undefined : openCashDrawerBreakdown}
                            className={`apple-glass-card rounded-2xl p-4 sm:p-5 border border-slate-200/90 bg-white/95 flex flex-col justify-between transition-all group ${actualCashInDrawer === undefined ? '' : 'cursor-pointer hover:border-[#0067C0]/45 hover:shadow-md'}`}
                          >
                            <div>
                              {renderReorderStrip()}
                              <div className="flex items-center justify-between mb-2">
                                <span className="text-xs font-bold text-slate-600 group-hover:text-[#0067C0] transition-colors">
                                  جرد درج اليوم المسجل
                                </span>
                                <div className="w-8 h-8 rounded-xl bg-emerald-500/12 text-emerald-700 flex items-center justify-center">
                                  <Wallet size={16} />
                                </div>
                              </div>
                              <div className="text-2xl sm:text-3xl font-black text-[#0F172A] font-mono">
                                {actualCashInDrawer === undefined ? 'غير مسجل' : actualCashInDrawer.toLocaleString('ar-EG')}{' '}
                                <span className="text-xs font-normal text-slate-400">{confirmedSettings?.currency}</span>
                              </div>
                              <p className="text-[10px] text-slate-500 mt-1 font-medium">
                                {actualCashInDrawer === undefined
                                  ? 'لا يوجد جرد درج مسجل في إغلاق اليوم.'
                                  : 'المبلغ مأخوذ من حقل الجرد في سجل الإغلاق؛ وليس مجموع فواتير النقد.'}
                              </p>
                            </div>
                            <div className="mt-2.5 pt-2 border-t border-slate-100 flex items-center justify-between text-[10px] text-[#0067C0] font-bold">
                              <span>{actualCashInDrawer === undefined ? 'لا يوجد تفصيل جرد متاح' : 'عرض حقل الجرد المسجل'}</span>
                              <Info size={12} />
                            </div>
                          </div>
                        );

                      case 'bottles_and_essence':
                        return (
                          <div
                            key={cardItem.id}
                            onClick={() => onNavigate && onNavigate(View.INVENTORY)}
                            className="apple-glass-card rounded-2xl p-4 sm:p-5 border border-slate-200/90 bg-white/95 flex flex-col justify-between cursor-pointer hover:border-[#C49746]/50 hover:shadow-md transition-all group"
                          >
                            <div>
                              {renderReorderStrip()}
                              <div className="flex items-center justify-between mb-2">
                                <span className="text-xs font-bold text-slate-600 group-hover:text-[#9A6E23] transition-colors">
                                  العبوات والجرامات المسجلة في الفواتير
                                </span>
                                <div className="w-8 h-8 rounded-xl bg-[#C49746]/15 text-[#9A6E23] flex items-center justify-center">
                                  <Package size={16} />
                                </div>
                              </div>
                              <div className="text-2xl sm:text-3xl font-black text-[#0F172A] font-mono">
                                {todaysBottlesCount}{' '}
                                <span className="text-xs font-normal text-slate-400">عبوة</span>
                              </div>
                              <p className="text-[10px] text-slate-500 mt-1 font-medium">
                                {todaysEssenceGrams.toLocaleString('ar-EG')} جم محسوبة من بنود الفواتير؛ لا تمثل جردًا ميدانيًا.
                              </p>
                            </div>
                            <div className="mt-2.5 pt-2 border-t border-slate-100 flex items-center justify-between text-[10px] text-[#9A6E23] font-bold">
                              <span>فتح سجل المخزون</span>
                              <ArrowLeft size={12} />
                            </div>
                          </div>
                        );

                      case 'reserved_inventory_capital':
                        return (
                          <div
                            key={cardItem.id}
                            onClick={openReservedStockBreakdown}
                            className="apple-glass-card rounded-2xl p-4 sm:p-5 border border-slate-200/90 bg-white/95 flex flex-col justify-between cursor-pointer hover:border-[#0067C0]/45 hover:shadow-md transition-all group"
                          >
                            <div>
                              {renderReorderStrip()}
                              <div className="flex items-center justify-between mb-2">
                                <span className="text-xs font-bold text-slate-600 group-hover:text-[#0067C0] transition-colors">
                                  رأس مال المخزون المحجوز
                                </span>
                                <div className="w-8 h-8 rounded-xl bg-[#0067C0]/10 text-[#0067C0] flex items-center justify-center">
                                  <Layers size={16} />
                                </div>
                              </div>
                              <div className="text-2xl sm:text-3xl font-black text-[#0F172A] font-mono">
                                {formatMetricNumber(totalReservedStockCost)}{' '}
                                <span className="text-xs font-normal text-slate-400">{confirmedSettings?.currency}</span>
                              </div>
                              <p className="text-[10px] text-slate-500 mt-1 font-medium">
                                رصيد محفظة إعادة التوريد: {restockVaultBalance.toLocaleString('ar-EG')} {confirmedSettings?.currency} · تكلفة الرصيد المخزني المسجل: {rawStockValue.toLocaleString('ar-EG')} {confirmedSettings?.currency}
                              </p>
                            </div>
                            <div className="mt-2.5 pt-2 border-t border-slate-100 flex items-center justify-between text-[10px] text-[#0067C0] font-bold">
                              <span>تفصيل رأس مال البضاعة</span>
                              <Info size={12} />
                            </div>
                          </div>
                        );

                      case 'commissions_and_incentives':
                        return (
                          <div
                            key={cardItem.id}
                            onClick={() => onNavigate && onNavigate(View.OPERATIONS_SYSTEM)}
                            className="apple-glass-card rounded-2xl p-4 sm:p-5 border border-slate-200/90 bg-white/95 flex flex-col justify-between cursor-pointer hover:border-[#0067C0]/45 hover:shadow-md transition-all group"
                          >
                            <div>
                              {renderReorderStrip()}
                              <div className="flex items-center justify-between mb-2">
                                <span className="text-xs font-bold text-slate-600 group-hover:text-[#0067C0] transition-colors">
                                  العمولات المسجلة على الفواتير
                                </span>
                                <div className="w-8 h-8 rounded-xl bg-[#C49746]/15 text-[#9A6E23] flex items-center justify-center">
                                  <Award size={16} />
                                </div>
                              </div>
                              <div className="text-2xl sm:text-3xl font-black text-[#0F172A] font-mono">
                                {formatMetricNumber(todaysCommission)}{' '}
                                <span className="text-xs font-normal text-slate-400">{confirmedSettings?.currency} اليوم</span>
                              </div>
                              <p className="text-[10px] text-slate-500 mt-1 font-medium">
                                إجمالي العمولات المخزنة في فواتير الشهر: {formatMetricNumber(monthCommissions)} {confirmedSettings?.currency}
                              </p>
                            </div>
                            <div className="mt-2.5 pt-2 border-t border-slate-100 flex items-center justify-between text-[10px] text-[#0067C0] font-bold">
                              <span>فتح نظام العمولات والحوافز</span>
                              <ArrowLeft size={12} />
                            </div>
                          </div>
                        );

                      default:
                        return null;
                    }
                  })}
              </div>
            </div>
          )}


      {/* ======================================================== */}
      {/* LOSS WARNING & MOTIVATIONAL STORE ACTIVATION BANNER     */}
      {/* Displayed strictly when actual sales exist and daily break-even is not reached */}
      {/* ======================================================== */}
      {todaysSales.length > 0 && !isBreakEvenCovered && isSectionVisible('loss_warning_banner') && (
        <div className={`${getSectionOrderClass('loss_warning_banner')} rounded-3xl p-5 sm:p-6 bg-gradient-to-r from-rose-900 via-[#1D1D1F] to-slate-900 text-white shadow-apple-lg border border-rose-500/30 space-y-4`}>
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div className="flex items-start gap-3">
              <div className="w-11 h-11 rounded-2xl bg-rose-500/20 border border-rose-500/40 text-rose-400 flex items-center justify-center shrink-0">
                <Flame size={24} className="animate-pulse" />
              </div>
              <div className="space-y-1">
                <div className="flex items-center gap-2">
                  <span className="px-2.5 py-0.5 rounded-full bg-rose-500 text-white font-black text-[10px]">
                    فجوة حسابية عن المستهدف
                  </span>
                  <span className="text-xs text-rose-300 font-bold">
                    المستهدف اليومي المحفوظ: {targetPhase1.toLocaleString('ar-EG')} {confirmedSettings?.currency}
                  </span>
                </div>
                <h3 className="text-base sm:text-lg font-black text-white">
                  المساهمة المحسوبة من الفواتير المؤكدة أقل من المستهدف اليومي المسجل.
                </h3>
                <p className="text-xs text-gray-300 max-w-2xl leading-relaxed">
                  الفارق الحسابي الحالي عن المستهدف هو {formatMetricNumber(remainingToBreakEven)} {confirmedSettings?.currency}. لا يثبت هذا الفارق خسارة محاسبية أو نقدية، ولا تتنبأ اللوحة بعدد مبيعات لازمة للوصول إليه.
                </p>
              </div>
            </div>

            <div className="flex flex-col items-center sm:items-end gap-2 shrink-0">
              <div className="text-center sm:text-left bg-white/10 p-3 rounded-2xl border border-white/10">
                <span className="text-[10px] text-gray-400 block font-sans">المتبقي حسابيًا للمستهدف:</span>
                <span className="font-mono font-black text-2xl text-rose-400">{remainingToBreakEven.toLocaleString('ar-EG', { maximumFractionDigits: 2 })} {confirmedSettings?.currency}</span>
                <span className="text-[10px] text-amber-300 block font-semibold">قيمة حسابية من سجلات اليوم</span>
              </div>

              {onNavigate && (
                <button
                  onClick={() => onNavigate(View.POS)}
                  className="apple-btn w-full sm:w-auto px-5 py-2.5 rounded-xl bg-rose-600 hover:bg-rose-700 text-white text-xs font-bold flex items-center justify-center gap-2 shadow-sm"
                >
                  <Plus size={15} />
                  <span>فتح شاشة المبيعات</span>
                </button>
              )}
            </div>
          </div>

          <p className="pt-2 border-t border-white/10 text-xs text-gray-300">لا تُعرض تركيبات أو أرباح مستقبلية افتراضية؛ مساهمة كل طلب تعتمد على بنوده المسجلة.</p>
        </div>
      )}
        </>
      ) : (
        /* Staff Operational Metrics (Zero Confidential Data) */
        <div className="space-y-4">
          <div className="flex items-center justify-between px-1">
            <div className="flex items-center gap-2">
              <ShoppingBag size={18} className="text-[#0071E3]" />
              <h2 className="text-sm font-black text-[#1D1D1F]">
                مؤشرات التشغيل والمبيعات اليومية للوردية
              </h2>
            </div>
            <span className="text-[11px] text-[#86868B] font-medium hidden sm:inline">
              متابعة الفواتير المسجلة وطرق الدفع المخزنة
            </span>
          </div>

          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
            {/* 1. Daily Sales */}
            <div className="apple-glass-card rounded-3xl p-5 border border-[#0071E3]/25 bg-gradient-to-br from-white via-[#0071E3]/[0.06] to-sky-500/[0.12] flex flex-col justify-between">
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs font-bold text-[#86868B]">مبيعات اليوم المسجلة</span>
                <div className="w-8 h-8 rounded-xl bg-[#0071E3]/10 text-[#0071E3] flex items-center justify-center">
                  <DollarSign size={16} />
                </div>
              </div>
              <div>
                <div className="text-2xl sm:text-3xl font-black text-[#1D1D1F] font-mono">
                  {totalRevenue.toLocaleString('ar-EG')}{' '}
                  <span className="text-xs font-normal text-[#86868B]">{confirmedSettings?.currency}</span>
                </div>
                <p className="text-[10px] text-[#86868B] mt-1 font-medium">
                  من {todaysSales.length} فاتورة إنتاج مؤكدة
                </p>
              </div>
            </div>

            {/* 2. Bottles Count */}
            <div className="apple-glass-card rounded-3xl p-5 border border-purple-300/60 bg-gradient-to-br from-white via-purple-500/[0.06] to-indigo-500/[0.12] flex flex-col justify-between">
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs font-bold text-[#86868B]">العبوات المسجلة في الفواتير</span>
                <div className="w-8 h-8 rounded-xl bg-purple-50 text-purple-700 flex items-center justify-center">
                  <Package size={16} />
                </div>
              </div>
              <div>
                <div className="text-2xl sm:text-3xl font-black text-purple-700 font-mono">
                  {todaysBottlesCount}{' '}
                  <span className="text-xs font-normal text-[#86868B]">عبوة</span>
                </div>
                <p className="text-[10px] text-[#86868B] mt-1 font-medium">
                  متوسط الفاتورة: {averageBill === null ? 'غير متاح' : `${averageBill.toLocaleString('ar-EG')} ${confirmedSettings?.currency}`}
                </p>
              </div>
            </div>

            {/* 3. Essence Consumed */}
            <div className="apple-glass-card rounded-3xl p-5 border border-amber-300/60 bg-gradient-to-br from-white via-amber-500/[0.06] to-[#C49746]/[0.14] flex flex-col justify-between">
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs font-bold text-[#86868B]">جرامات الزيت المسجلة في الفواتير</span>
                <div className="w-8 h-8 rounded-xl bg-amber-50 text-[#C49746] flex items-center justify-center">
                  <Layers size={16} />
                </div>
              </div>
              <div>
                <div className="text-2xl sm:text-3xl font-black text-amber-800 font-mono">
                  {todaysEssenceGrams}{' '}
                  <span className="text-xs font-normal text-[#86868B]">جرام</span>
                </div>
                <p className="text-[10px] text-[#86868B] mt-1 font-medium">
                  مجموع الجرامات المحسوب من بنود الفواتير، وليس قياس صرف فعلي.
                </p>
              </div>
            </div>

            {/* 4. Cash In Drawer */}
            <div className="apple-glass-card rounded-3xl p-5 border border-emerald-300/60 bg-gradient-to-br from-white via-emerald-500/[0.07] to-teal-500/[0.13] flex flex-col justify-between">
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs font-bold text-[#86868B]">المبيعات المصنفة نقدًا في الفواتير</span>
                <div className="w-8 h-8 rounded-xl bg-emerald-50 text-emerald-700 flex items-center justify-center">
                  <Coins size={16} />
                </div>
              </div>
              <div>
                <div className="text-2xl sm:text-3xl font-black text-emerald-700 font-mono">
                  {todaysCashSales.toLocaleString('ar-EG')}{' '}
                  <span className="text-xs font-normal text-[#86868B]">{confirmedSettings?.currency}</span>
                </div>
                <p className="text-[10px] text-[#86868B] mt-1 font-medium">
                  إلكتروني/بطاقة/تحويل مسجل: {todaysElectronicSales.toLocaleString('ar-EG')} {confirmedSettings?.currency}
                </p>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ======================================================== */}
      {/* GOAL DISTRIBUTION & BREAK-EVEN PROGRESS                  */}
      {/* ======================================================== */}
      {isSectionVisible('goal_and_low_stock') && (
      <div className={`${getSectionOrderClass('goal_and_low_stock')} grid grid-cols-1 lg:grid-cols-12 gap-5 sm:gap-6`}>
        {/* Goal Card (Executive) OR Sales Guidance Card (Staff) */}
        {canViewProfits(currentUser ?? null) ? (
          <div className="lg:col-span-7 apple-glass-dark text-white rounded-3xl p-6 sm:p-7 space-y-5 shadow-apple-lg border border-white/10 flex flex-col justify-between">
            <div>
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-2">
                  <Target size={18} className="text-[#C49746]" />
                  <h3 className="font-bold text-sm text-white">توزيع مبيعات اليوم على الهدف المطلوب</h3>
                </div>
                <span className={`text-[10px] font-bold px-2.5 py-0.5 rounded-full ${
                  isTargetAchieved 
                    ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30' 
                    : isBreakEvenCovered 
                    ? 'bg-blue-500/20 text-blue-300 border border-blue-500/30' 
                    : 'bg-rose-500/20 text-rose-300 border border-rose-500/30 animate-pulse'
                }`}>
                  {todaysSales.length === 0 ? 'لا توجد فواتير إنتاج مؤكدة اليوم' : isTargetAchieved ? 'بلغت المساهمة المستهدف المسجل' : 'المساهمة دون المستهدف المسجل'}
                </span>
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 text-xs mb-5">
                <div className="p-3 rounded-2xl bg-white/5 border border-white/10 space-y-0.5">
                  <span className="text-gray-400 text-[11px] block">المستهدف اليومي المسجل</span>
                  <span className="font-mono font-bold text-base text-amber-400">{targetPhase1.toLocaleString('ar-EG')} {confirmedSettings?.currency}</span>
                  <span className="text-[10px] text-gray-500 block">من إعدادات Firestore المؤكدة</span>
                </div>

                <div className="p-3 rounded-2xl bg-white/5 border border-white/10 space-y-0.5">
                  <span className="text-gray-400 text-[11px] block">الموازنة الشهرية المسجلة</span>
                  <span className="font-mono font-bold text-base text-[#34C759]">{fixedMonthlyBudget.toLocaleString('ar-EG')} {confirmedSettings?.currency}</span>
                  <span className="text-[10px] text-gray-500 block">قيمة إعدادات Firestore؛ ليست قياسًا للمصروف الفعلي</span>
                </div>

                <div className="p-3 rounded-2xl bg-white/5 border border-white/10 space-y-0.5 col-span-2 sm:col-span-1">
                  <span className="text-gray-400 text-[11px] block">المساهمة المحسوبة من الفواتير</span>
                  <span className="font-mono font-bold text-base text-white">{netContributionToday.toLocaleString('ar-EG')} {confirmedSettings?.currency}</span>
                  <span className="text-[10px] text-gray-500 block">الإيراد ناقص التكلفة والعمولات المسجلة؛ ليس صافي ربح مدققًا</span>
                </div>
              </div>

              {/* Progress against the single stored daily target */}
              <div className="space-y-3">
                <div>
                  <div className="flex justify-between text-xs font-semibold mb-1">
                    <span className="text-gray-300">نسبة المساهمة المحسوبة من المستهدف اليومي المحفوظ:</span>
                    <span className="font-mono text-amber-400 font-bold">{formatConservativePercent(progressPhase1)}</span>
                  </div>
                  <div className="w-full h-2.5 bg-white/10 rounded-full overflow-hidden p-0.5">
                    <div
                      className="h-full bg-gradient-to-r from-amber-500 to-emerald-400 rounded-full transition-all duration-700"
                      style={{ width: `${progressPhase1}%` }}
                    ></div>
                  </div>
                </div>

              </div>
            </div>

            <div className="pt-3 border-t border-white/10 flex flex-col sm:flex-row sm:items-center justify-between text-xs text-gray-400 gap-2">
              <span>
                {todaysSales.length === 0
                  ? 'لا توجد فواتير إنتاج مؤكدة اليوم؛ لا يُستنتج ربح أو عجز.'
                  : isBreakEvenCovered
                  ? `بلغت المساهمة المحسوبة المستهدف المحفوظ؛ لا يمثل ذلك تدقيقًا لصافي الربح. الفائض الحسابي: ${(netContributionToday - targetPhase1).toLocaleString('ar-EG')} ${confirmedSettings?.currency}.`
                  : `الفارق الحسابي للوصول إلى المستهدف المحفوظ: ${remainingToBreakEven.toLocaleString('ar-EG')} ${confirmedSettings?.currency}. لا يمكن اشتقاق عدد عبوات مستقبلية من هذا الرقم.`}
              </span>
              {onNavigate && canAccessView(currentUser ?? null, View.OPERATIONS_SYSTEM) && (
                <button
                  onClick={() => onNavigate(View.OPERATIONS_SYSTEM)}
                  className="text-amber-400 hover:text-white font-semibold text-left inline-flex items-center gap-1 shrink-0"
                >
                  <span>شاشة نظام التشغيل المعتمد</span>
                  <ArrowRight size={14} />
                </button>
              )}
            </div>
          </div>
        ) : (
          <div className="lg:col-span-7 apple-glass-card rounded-3xl p-6 sm:p-7 space-y-5 border border-black/[0.06] flex flex-col justify-between">
            <div className="space-y-4">
              <div className="flex items-center justify-between pb-3 border-b border-black/[0.06]">
                <div className="flex items-center gap-2">
                  <Sparkles size={18} className="text-[#0071E3]" />
                  <h3 className="font-bold text-sm text-[#1D1D1F]">دليل تسريع البيع وخدمة العملاء</h3>
                </div>
                <span className="text-[11px] font-bold text-[#0071E3] bg-[#0071E3]/10 px-2.5 py-0.5 rounded-full">
                  إرشادات الوردية
                </span>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
                <div className="p-3.5 rounded-2xl bg-amber-50/70 border border-amber-200/60 space-y-1">
                  <span className="font-bold text-amber-950 block">✨ قاعدة إقناع الزبون الذهبية:</span>
                  <p className="text-[11px] text-amber-900 leading-relaxed">
                    اسأل العميل عن تفضيلاته وقدّم معلومات المنتج المسجلة؛ لا تدّعِ أفضلية حجم أو نتيجة غير موثقة.
                  </p>
                </div>

                <div className="p-3.5 rounded-2xl bg-blue-50/70 border border-blue-200/60 space-y-1">
                  <span className="font-bold text-blue-950 block">🧴 دقة المعايير والجودة:</span>
                  <p className="text-[11px] text-blue-900 leading-relaxed">
                    اعتمد تفاصيل التركيبة والجرامات المحفوظة في سجل الطلب؛ لا تستنتج جرعة من حجم العبوة وحده.
                  </p>
                </div>
              </div>

              <div className="p-4 rounded-2xl bg-black/[0.02] border border-black/[0.04] space-y-2">
                <span className="text-xs font-black text-[#1D1D1F] block">أمثلة من كتالوج المنتجات (ليست ترتيبًا للطلب):</span>
                <div className="flex flex-wrap gap-2">
                  {products.slice(0, 5).map(p => (
                    <span key={p.id} className="px-2.5 py-1 rounded-xl bg-white border border-black/[0.06] text-xs font-semibold text-[#1D1D1F]">
                      {p.name} ({p.gender})
                    </span>
                  ))}
                </div>
              </div>
            </div>

            <div className="pt-3 border-t border-black/[0.06] flex items-center justify-between text-xs">
              <span className="text-[#86868B]">نسعد بخدمة كل زبون وتقديم العطر الأنسب لذوقه ✨</span>
              {onNavigate && (
                <button
                  onClick={() => onNavigate(View.POS)}
                  className="apple-btn px-4 py-2 rounded-xl bg-[#0071E3] hover:bg-[#0077ED] text-white text-xs font-bold shadow-sm"
                >
                  فتح الكاشير
                </button>
              )}
            </div>
          </div>
        )}

        {/* Low Stock Alerts Widget (lg:col-span-5) */}
        <div className="lg:col-span-5 apple-glass-card rounded-3xl p-6 sm:p-7 flex flex-col justify-between border border-rose-300/50 bg-gradient-to-br from-white via-rose-500/[0.05] to-amber-500/[0.10] space-y-4">
          <div>
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <AlertOctagon size={18} className="text-red-500" />
                <h3 className="font-bold text-sm text-[#1D1D1F]">سجلات المخزون دون العتبة المحفوظة ({stockAlertThreshold} جم)</h3>
              </div>
              <span className={`text-[10px] font-bold px-2.5 py-0.5 rounded-full ${
                lowStock.length > 0 ? 'bg-red-100 text-red-700' : 'bg-emerald-100 text-emerald-800'
              }`}>
                {lowStock.length} سجلات
              </span>
            </div>

            {lowStock.length === 0 ? (
              <div className="py-8 text-center text-[#86868B] space-y-1">
                <CheckCircle2 size={28} className="mx-auto text-slate-400" />
                <p className="font-bold text-xs text-[#1D1D1F]">{products.length === 0 ? 'لقطة الخادم لا تحتوي سجلات منتجات.' : `لا توجد سجلات منتجات دون ${stockAlertThreshold} جم في اللقطة المؤكدة.`}</p>
                <p className="text-[11px]">الأرصدة تعكس السجلات البرمجية ولا تثبت جردًا ميدانيًا.</p>
              </div>
            ) : (
              <div className="space-y-2 max-h-48 overflow-y-auto pr-1">
                {lowStock.slice(0, 5).map((p) => (
                  <div
                    key={p.id}
                    className="p-3 rounded-2xl bg-black/[0.02] border border-black/[0.04] flex items-center justify-between text-xs"
                  >
                    <div>
                      <span className="font-bold text-[#1D1D1F] block">{p.name}</span>
                      <span className="text-[10px] text-[#86868B]">{p.brand} · {p.type}</span>
                    </div>
                    <span className="font-mono font-black text-red-600 bg-red-50 px-2.5 py-1 rounded-xl">
                      {p.stock_grams} جم
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>

          {onNavigate && (
            <button
              onClick={() => onNavigate(View.INVENTORY)}
              className="apple-btn w-full py-2.5 rounded-xl bg-black/[0.04] hover:bg-black/[0.08] text-xs font-semibold text-[#1D1D1F] flex items-center justify-center gap-1.5"
            >
              <span>فتح إدارة المخزون والتزويد السريع</span>
              <ChevronLeft size={14} />
            </button>
          )}
        </div>
      </div>
      )}

      {/* ======================================================== */}
      {/* TODAY'S RECENT SALES LIST                                */}
      {/* ======================================================== */}
      {isSectionVisible('today_sales_register') && (
      <div className={`${getSectionOrderClass('today_sales_register')} apple-glass-card rounded-3xl p-6 sm:p-7 border border-[#0071E3]/25 bg-gradient-to-br from-white via-[#0071E3]/[0.05] to-emerald-500/[0.08] space-y-4`}>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <ShoppingBag size={18} className="text-[#0071E3]" />
            <h3 className="font-bold text-sm text-[#1D1D1F]">مبيعات اليوم المسجلة</h3>
          </div>
          <span className="text-xs font-medium text-[#86868B]">
            {todaysSales.length} فاتورة إنتاج مؤكدة
          </span>
        </div>

        {todaysSales.length === 0 ? (
          <div className="py-12 text-center text-[#86868B] space-y-2">
            <Coins size={36} className="mx-auto text-gray-300" />
            <p className="font-black text-sm text-[#1D1D1F]">لا توجد فواتير إنتاج مؤكدة مسجلة لهذا اليوم</p>
            <p className="text-[11px]">يعرض النظام السجلات المؤكدة فقط، ولا يملأ أرقامًا افتراضية أو أمثلة.</p>
          </div>
        ) : (
          <>
            {/* Mobile View: Clean Card List (Zero Horizontal Scroll) */}
            <div className="md:hidden space-y-2.5">
              {todaysSales.map((sale) => {
                const saleItemsSummary = sale.items.map((item) => `${item.productName} × ${item.quantity}`).join('، ');
                const saleItemDetails = sale.items.map((item) => `${item.bottleSize} مل × ${item.quantity} (${item.essenceGrams} جم/عبوة)`).join(' · ');
                const saleContribution = sale.totalPrice - sale.totalCost - Number(sale.commissionAmount ?? sale.totalCommission);
                return (
                  <div key={sale.id} className="p-3 rounded-2xl bg-[#F5F5F7] border border-black/[0.04] space-y-1.5">
                    <div className="flex items-center justify-between text-xs">
                      <div className="flex items-center gap-2">
                        <span className="font-mono text-[#86868B] text-[11px]">
                          {formatRecordedSaleTime(sale)}
                        </span>
                        <span className="font-bold text-[#1D1D1F]">{saleItemsSummary || 'بنود غير متاحة'}</span>
                      </div>
                      <span className="font-mono font-black text-sm text-[#1D1D1F]">
                        {sale.totalPrice.toLocaleString('ar-EG')} {confirmedSettings?.currency}
                      </span>
                    </div>

                    <div className="flex items-center justify-between text-[11px] text-[#86868B]">
                      <span>{saleItemDetails}</span>
                      <div className="flex items-center gap-2">
                        {canViewProfits(currentUser ?? null) && (
                          <span className="text-emerald-700 font-bold">مساهمة محسوبة: {saleContribution.toLocaleString('ar-EG')} {confirmedSettings?.currency}</span>
                        )}
                        <span className="px-1.5 py-0.5 rounded bg-white text-[10px] text-[#1D1D1F] border border-black/[0.04]">
                          {sale.paymentMethod}
                        </span>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Desktop Table View */}
            <div className="hidden md:block overflow-hidden rounded-2xl border border-black/[0.06]">
              <table className="w-full text-right text-xs">
                <thead>
                  <tr className="bg-black/[0.02] border-b border-black/[0.06] text-[#86868B]">
                    <th className="py-2.5 px-3 font-medium">الوقت</th>
                    <th className="py-2.5 px-3 font-medium">الصنف</th>
                    <th className="py-2.5 px-3 font-medium">الحجم</th>
                    <th className="py-2.5 px-3 font-medium">الزيت</th>
                    <th className="py-2.5 px-3 font-medium">السعر</th>
                    {canViewCosts(currentUser ?? null) && (
                      <th className="py-2.5 px-3 font-medium">التكلفة</th>
                    )}
                    {canViewProfits(currentUser ?? null) && (
                      <th className="py-2.5 px-3 font-medium">المساهمة</th>
                    )}
                    <th className="py-2.5 px-3 font-medium">طريقة السداد</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-black/[0.04]">
                  {todaysSales.map((sale) => {
                    const saleItemsSummary = sale.items.map((item) => `${item.productName} × ${item.quantity}`).join('، ');
                    const saleSizesSummary = sale.items.map((item) => `${item.bottleSize} مل × ${item.quantity}`).join(' · ');
                    const saleGramsTotal = sale.items.reduce((sum, item) => sum + item.essenceGrams * item.quantity, 0);
                    const saleContribution = sale.totalPrice - sale.totalCost - Number(sale.commissionAmount ?? sale.totalCommission);
                    return (
                      <tr key={sale.id} className="hover:bg-black/[0.02] transition-colors">
                        <td className="py-3 px-3 text-[#86868B] font-mono">
                          {formatRecordedSaleTime(sale)}
                        </td>
                        <td className="py-3 px-3 font-bold text-[#1D1D1F]">{saleItemsSummary}</td>
                        <td className="py-3 px-3 font-mono">{saleSizesSummary}</td>
                        <td className="py-3 px-3 font-mono">{saleGramsTotal.toLocaleString('ar-EG')} جم إجماليًا</td>
                        <td className="py-3 px-3 font-mono font-bold text-[#1D1D1F]">{sale.totalPrice.toLocaleString('ar-EG')} {confirmedSettings?.currency}</td>
                        {canViewCosts(currentUser ?? null) && (
                          <td className="py-3 px-3 font-mono text-red-600">{sale.totalCost.toLocaleString('ar-EG')} {confirmedSettings?.currency}</td>
                        )}
                        {canViewProfits(currentUser ?? null) && (
                          <td className="py-3 px-3 font-mono font-bold text-emerald-600">{saleContribution.toLocaleString('ar-EG')} {confirmedSettings?.currency}</td>
                        )}
                        <td className="py-3 px-3">
                          <span className="px-2 py-0.5 rounded-full bg-black/[0.04] text-[10px] font-medium text-[#1D1D1F]">
                            {sale.paymentMethod}
                          </span>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </>
        )}
      </div>
      )}
      </>
      )}

      {/* Transparent Calculation Breakdown Modal */}
      {dashboardMetricsReady && calculationModal && (
        <CalculationBreakdownModal
          breakdown={calculationModal}
          onClose={() => setCalculationModal(null)}
          currency={confirmedSettings?.currency || '—'}
        />
      )}
    </div>
  );
};

export default Dashboard;
