import React, { useState, useMemo, useEffect, useRef } from 'react';
import { 
  AppUser, 
  Sale, 
  Expense, 
  StoreSettings, 
  Product, 
  DailyClosure, 
  View, 
  resolveActiveAppTheme, 
  isActualPaidOperationalExpense,
} from '../types';
import { AppleNotificationItem } from './AppleTopNotificationBanner';
import SmartFragranceSearchModal from './SmartFragranceSearchModal';
import { 
  Crown, 
  Lock, 
  X, 
  CheckCircle2, 
  FileText, 
  Download, 
  Bell, 
  Copy, 
  Check, 
  ShoppingBag, 
  Wallet, 
  AlertCircle, 
  Info, 
  Palette, 
  Radio,
  Award,
  Search,
  Clock,
  ChevronDown,
  Layers,
  Sparkles,
  LogOut,
  Sliders,
  Store,
  Calendar,
  Flame,
  ChevronLeft,
  ChevronRight,
  Play,
  Pause,
  Target,
  TrendingUp
} from 'lucide-react';
import { canAccessView } from '../services/authService';
import type { DashboardDataSourceHealthMap } from '../services/dashboardDataTypes';

const headerLocalDateKey = (date: Date): string =>
  `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;

const headerRecordDateKey = (value: string): string => {
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) return value;
  const parsed = new Date(value);
  return Number.isFinite(parsed.getTime()) ? headerLocalDateKey(parsed) : '';
};

const finiteHeaderNumber = (value: unknown): value is number =>
  typeof value === 'number' && Number.isFinite(value);

export type TickerNotificationKind = 'error' | 'success' | 'info';

export interface SmartTopTickerMessage {
  id: string;
  type: TickerNotificationKind;
  tag: string;
  text: string;
}

export const getTickerNotificationTheme = (type: TickerNotificationKind) => {
  switch (type) {
    case 'error':
      return {
        containerBg: 'bg-rose-500/10 border-rose-500/25 hover:bg-rose-500/15',
        badgeBg: 'bg-[#FF3B30] text-white',
        textColor: 'text-rose-800 font-bold',
        dotColor: 'bg-[#FF3B30]',
        icon: <AlertCircle size={12} className="text-[#FF3B30] shrink-0" />,
      };
    case 'success':
      return {
        containerBg: 'bg-emerald-500/10 border-emerald-500/25 hover:bg-emerald-500/15',
        badgeBg: 'bg-[#248A3D] text-white',
        textColor: 'text-emerald-900 font-bold',
        dotColor: 'bg-[#34C759]',
        icon: <CheckCircle2 size={12} className="text-[#248A3D] shrink-0" />,
      };
    case 'info':
    default:
      return {
        containerBg: 'bg-[#0071E3]/10 border-[#0071E3]/20 hover:bg-[#0071E3]/15',
        badgeBg: 'bg-[#0071E3] text-white',
        textColor: 'text-[#0051A8] font-semibold',
        dotColor: 'bg-[#0071E3]',
        icon: <Info size={12} className="text-[#0071E3] shrink-0" />,
      };
  }
};

interface ExecutiveHeaderBarProps {
  currentUser: AppUser | null;
  onOpenAuthModal: () => void;
  onOpenDayOperations: () => void;
  onLockScreen?: () => void;
  sales?: Sale[];
  expenses?: Expense[];
  settings?: StoreSettings;
  confirmedSettings?: Partial<StoreSettings> | null;
  dataSourceHealth?: DashboardDataSourceHealthMap;
  hasPendingLocalSales?: boolean;
  products?: Product[];
  currentClosure?: DailyClosure | null;
  topNotifications?: AppleNotificationItem[];
  currentView?: View;
  onNavigate?: (view: View) => void;
  onSendSmartNotification?: (title: string, subtitle?: string, badgeText?: string) => void;
  onOpenDailyReportAutomation?: () => void;
  onOpenThemeStudio?: () => void;
  onOpenLiveAlertsRadar?: () => void;
  onOpenPWAInstall?: () => void;
  connectedDevicesCount?: number | null;
  onOpenConnectedDevices?: () => void;
  onUpdateSettings?: React.Dispatch<React.SetStateAction<StoreSettings>>;
}

export const ExecutiveHeaderBar: React.FC<ExecutiveHeaderBarProps> = React.memo(({
  currentUser,
  onOpenAuthModal,
  onOpenDayOperations,
  onLockScreen,
  sales = [],
  expenses = [],
  settings,
  confirmedSettings = null,
  dataSourceHealth,
  hasPendingLocalSales = false,
  products = [],
  currentClosure,
  topNotifications = [],
  currentView,
  onNavigate,
  onSendSmartNotification,
  onOpenDailyReportAutomation,
  onOpenThemeStudio,
  onOpenLiveAlertsRadar,
  onOpenPWAInstall,
  connectedDevicesCount = null,
  onOpenConnectedDevices,
  onUpdateSettings,
}) => {
  const isOwner = currentUser?.role === 'OWNER';

  const popoverRef = useRef<HTMLDivElement | null>(null);
  const toolsMenuRef = useRef<HTMLDivElement | null>(null);

  // Modal & Menu States
  const [isProfilePopoverOpen, setIsProfilePopoverOpen] = useState(false);
  const [isToolsMenuOpen, setIsToolsMenuOpen] = useState(false);
  const [isSearchModalOpen, setIsSearchModalOpen] = useState(false);

  // Daily Report Modal
  const [showDailyReportModal, setShowDailyReportModal] = useState(false);
  const [copiedReport, setCopiedReport] = useState(false);

  const currency = confirmedSettings?.currency || '—';
  const storeName = confirmedSettings?.storeName || 'اسم المتجر غير مؤكد';
  const logoUrl = confirmedSettings?.logoUrl?.trim() || null;

  const headerNonTestSales = sales.filter((sale) =>
    !sale.isReversed && !sale.isTestData && sale.dataClassification !== 'TEST' && sale.dataClassification !== 'DOC_EXAMPLE'
  );
  const headerProductionSales = headerNonTestSales.filter((sale) => sale.dataClassification === 'PRODUCTION');
  const headerNonTestExpenses = expenses.filter((expense) =>
    !expense.isTestData && expense.dataClassification !== 'TEST' && expense.dataClassification !== 'DOC_EXAMPLE'
  );
  const headerSettingsComplete = Boolean(confirmedSettings)
    && typeof confirmedSettings?.currency === 'string'
    && confirmedSettings.currency.trim().length > 0
    && finiteHeaderNumber(confirmedSettings?.monthlyFixedBudget)
    && Number(confirmedSettings?.monthlyFixedBudget) >= 0
    && finiteHeaderNumber(confirmedSettings?.monthlyWorkDays)
    && Number(confirmedSettings?.monthlyWorkDays) > 0
    && finiteHeaderNumber(confirmedSettings?.dailyTargetProfit)
    && Number(confirmedSettings?.dailyTargetProfit) > 0
    && finiteHeaderNumber(confirmedSettings?.priceEssenceNormal)
    && Number(confirmedSettings?.priceEssenceNormal) >= 0
    && finiteHeaderNumber(confirmedSettings?.priceEssenceNiche)
    && Number(confirmedSettings?.priceEssenceNiche) >= 0
    && finiteHeaderNumber(confirmedSettings?.priceEssenceSpecial)
    && Number(confirmedSettings?.priceEssenceSpecial) >= 0
    && finiteHeaderNumber(confirmedSettings?.lowStockThresholdGrams)
    && Number(confirmedSettings?.lowStockThresholdGrams) >= 0;
  const headerSalesComplete = headerNonTestSales.every((sale) =>
    sale.dataClassification === 'PRODUCTION'
    && finiteHeaderNumber(sale.totalPrice)
    && finiteHeaderNumber(sale.totalCost)
    && finiteHeaderNumber(sale.totalProfit)
    && finiteHeaderNumber(sale.commissionAmount ?? sale.totalCommission)
    && typeof sale.date === 'string'
    && Boolean(headerRecordDateKey(sale.date))
    && ['نقدي', 'بطاقة', 'محفظة إلكترونية', 'تحويل بنكي'].includes(String(sale.paymentMethod))
    && Array.isArray(sale.items)
    && sale.items.every((item) => finiteHeaderNumber(item.quantity) && item.quantity > 0 && finiteHeaderNumber(item.essenceGrams) && finiteHeaderNumber(item.sellingPrice))
  );
  const headerExpensesComplete = headerNonTestExpenses.every((expense) =>
    expense.dataClassification === 'PRODUCTION'
    && finiteHeaderNumber(expense.amount)
    && typeof expense.date === 'string'
    && Boolean(headerRecordDateKey(expense.date))
  );
  const headerProductsComplete = products.every((product) =>
    finiteHeaderNumber(product.stock_grams)
    && product.stock_grams >= 0
    && ['عادي', 'نيش', 'مسك', 'عود'].includes(String(product.type))
  );
  const headerRequiredSources = ['sales', 'products', 'expenses', 'settings'] as const;
  const headerSourcesLive = Boolean(dataSourceHealth)
    && headerRequiredSources.every((key) => dataSourceHealth?.[key]?.state === 'live');
  const financialDataReady = headerSourcesLive
    && headerSettingsComplete
    && headerSalesComplete
    && headerExpensesComplete
    && headerProductsComplete
    && !hasPendingLocalSales;

  // Close menus when clicking outside (mouse and touch gestures)
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent | TouchEvent) => {
      if (popoverRef.current && !popoverRef.current.contains(e.target as Node)) {
        setIsProfilePopoverOpen(false);
      }
      if (toolsMenuRef.current && !toolsMenuRef.current.contains(e.target as Node)) {
        setIsToolsMenuOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    document.addEventListener('touchstart', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('touchstart', handleClickOutside);
    };
  }, []);

  // Compute today's report from server-confirmed, explicitly classified records only.
  const todayKeyForMemo = headerLocalDateKey(new Date());
  const todayReportData = useMemo(() => {
    const todayStr = todayKeyForMemo;
    const now = new Date();
    const dateArabic = now.toLocaleDateString('ar-EG', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
    const timeArabic = now.toLocaleTimeString('ar-EG', { hour: '2-digit', minute: '2-digit' });
    const todaysSales = headerProductionSales.filter((sale) => headerRecordDateKey(sale.date) === todayStr);
    const todaysExpenses = headerNonTestExpenses.filter((expense) =>
      expense.dataClassification === 'PRODUCTION'
      && headerRecordDateKey(expense.date) === todayStr
      && isActualPaidOperationalExpense(expense)
    );

    const totalSalesRevenue = todaysSales.reduce((sum, sale) => sum + sale.totalPrice, 0);
    const totalRawMaterialCost = todaysSales.reduce((sum, sale) => sum + sale.totalCost, 0);
    const totalCommissions = todaysSales.reduce((sum, sale) => sum + Number(sale.commissionAmount ?? sale.totalCommission), 0);
    const cashSales = todaysSales.filter((sale) => sale.paymentMethod === 'نقدي').reduce((sum, sale) => sum + sale.totalPrice, 0);
    const cardSales = todaysSales.filter((sale) => sale.paymentMethod === 'بطاقة').reduce((sum, sale) => sum + sale.totalPrice, 0);
    const walletSales = todaysSales.filter((sale) => sale.paymentMethod === 'محفظة إلكترونية' || sale.paymentMethod === 'تحويل بنكي')
      .reduce((sum, sale) => sum + sale.totalPrice, 0);
    const directTodayExpenses = todaysExpenses.reduce((sum, expense) => sum + expense.amount, 0);
    const monthlyBudget = Number(confirmedSettings?.monthlyFixedBudget ?? 0);
    const monthlyWorkDays = Number(confirmedSettings?.monthlyWorkDays ?? 0);
    const dailyFixedShare = monthlyWorkDays > 0 ? monthlyBudget / monthlyWorkDays : 0;
    const grossOperatingProfit = totalSalesRevenue - totalRawMaterialCost - totalCommissions;
    const netFinalProfit = grossOperatingProfit - dailyFixedShare;

    let totalBottles = 0;
    let totalGrams = 0;
    const productCountMap = new Map<string, { qty: number; revenue: number }>();
    todaysSales.forEach((sale) => sale.items.forEach((item) => {
      const quantity = Number(item.quantity);
      totalBottles += quantity;
      totalGrams += Number(item.essenceGrams) * quantity;
      const productName = item.productName || 'منتج غير مسمى في السجل';
      const previous = productCountMap.get(productName) || { qty: 0, revenue: 0 };
      productCountMap.set(productName, { qty: previous.qty + quantity, revenue: previous.revenue + item.sellingPrice * quantity });
    }));

    const topPerfumes = Array.from(productCountMap.entries()).sort((a, b) => b[1].revenue - a[1].revenue).slice(0, 5);
    const stockThreshold = Number(confirmedSettings?.lowStockThresholdGrams);
    const lowStockProducts = finiteHeaderNumber(stockThreshold)
      ? products.filter((product) => product.stock_grams < stockThreshold)
      : [];

    const lines: string[] = !financialDataReady
      ? ['لم يُنشأ هذا التقرير: لم تُؤكد جميع مصادر Firestore أو لم تكتمل الحقول المطلوبة.']
      : [
          `================================================================`,
          `تقرير يومي من سجلات الخادم المؤكدة — ${storeName}`,
          `التاريخ: ${dateArabic} (${todayStr}) · وقت الإعداد: ${timeArabic}`,
          `المسؤول الحالي: ${currentUser?.displayName || 'غير محدد'}`,
          `الأرقام تجمع سجلات الإنتاج المؤكدة ولا تمثل جردًا ميدانيًا أو تدقيقًا محاسبيًا.`,
          `عدد الفواتير: ${todaysSales.length}`,
          `عدد العبوات المسجل: ${totalBottles} · جرامات الزيت المسجلة: ${totalGrams}`,
          `إيراد الفواتير: ${totalSalesRevenue.toLocaleString('ar-EG')} ${currency}`,
          `مبيعات نقدية مسجلة: ${cashSales.toLocaleString('ar-EG')} ${currency}`,
          `مبيعات بطاقة مسجلة: ${cardSales.toLocaleString('ar-EG')} ${currency}`,
          `محفظة/تحويل مسجل: ${walletSales.toLocaleString('ar-EG')} ${currency}`,
          `تكلفة مسجلة على الفواتير: ${totalRawMaterialCost.toLocaleString('ar-EG', { maximumFractionDigits: 2 })} ${currency}`,
          `عمولات مخزنة على الفواتير: ${totalCommissions.toLocaleString('ar-EG', { maximumFractionDigits: 2 })} ${currency}`,
          `مساهمة محسوبة من حقول الفواتير: ${grossOperatingProfit.toLocaleString('ar-EG', { maximumFractionDigits: 2 })} ${currency}`,
          `مصروفات تشغيلية مسجلة (لا تثبت الدفع): ${directTodayExpenses.toLocaleString('ar-EG')} ${currency}`,
          `نتيجة حسابية بعد طرح الحصة اليومية المحسوبة من الموازنة الشهرية (${dailyFixedShare.toLocaleString('ar-EG', { maximumFractionDigits: 2 })} ${currency}): ${netFinalProfit.toLocaleString('ar-EG', { maximumFractionDigits: 2 })} ${currency}`,
          `المنتجات الأعلى إيرادًا في فواتير اليوم (ترتيب حسب إيراد السجلات):`,
          ...(topPerfumes.length > 0
            ? topPerfumes.map((product, index) => `${index + 1}. ${product[0]}: ${product[1].qty} عبوة (${product[1].revenue.toLocaleString('ar-EG')} ${currency})`)
            : ['لا توجد فواتير إنتاج مسجلة لهذا اليوم وفق اللقطة المؤكدة.']),
          `منتجات في سجل النظام دون عتبة المخزون المحفوظة (${stockThreshold} جم):`,
          ...(products.length === 0
            ? ['لا توجد سجلات منتجات في لقطة الخادم المؤكدة.']
            : lowStockProducts.length > 0
            ? lowStockProducts.map((product) => `${product.name}: ${product.stock_grams} جم مسجلة`)
            : ['لا توجد سجلات منتجات تحت العتبة المسجلة؛ هذا لا يثبت جردًا ميدانيًا.']),
          `================================================================`,
        ];

    return {
      todayStr, dateArabic, timeArabic,
      todaysSalesCount: todaysSales.length,
      totalSalesRevenue, totalRawMaterialCost, totalCommissions,
      cashSales, cardSales, walletSales, directTodayExpenses,
      grossOperatingProfit, netFinalProfit, totalBottles, totalGrams,
      topPerfumes, lowStockCount: lowStockProducts.length,
      reportTextContent: lines.join('\n'),
    };
  }, [headerProductionSales, headerNonTestExpenses, products, storeName, currentUser, currency, confirmedSettings, financialDataReady, todayKeyForMemo]);

  // Export Daily Report (.TXT)
  const handleDownloadTxtReport = () => {
    const blob = new Blob([todayReportData.reportTextContent], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `تقرير_لمسة_عطر_اليومي_${todayReportData.todayStr}.txt`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  const handleCopyReportToClipboard = () => {
    navigator.clipboard.writeText(todayReportData.reportTextContent);
    setCopiedReport(true);
    setTimeout(() => setCopiedReport(false), 2500);
    if (onSendSmartNotification) {
      onSendSmartNotification(
        'تم نسخ تقرير اليوم للحافظة',
        'يمكنك الآن لصق التقرير المنظم مباشرة في واتساب أو الملاحظات الإدارية',
        'تم النسخ'
      );
    }
  };

  // ----------------------------------------------------
  // REAL-TIME CLOCK & DUAL CALENDAR (HIJRI + GREGORIAN)
  // ----------------------------------------------------
  const [liveNow, setLiveNow] = useState<Date>(new Date());
  useEffect(() => {
    const clockTimer = setInterval(() => {
      setLiveNow(new Date());
    }, 1000);
    return () => clearInterval(clockTimer);
  }, []);

  const formattedDateAndClock = useMemo(() => {
    const dayName = liveNow.toLocaleDateString('ar-EG', { weekday: 'long' });
    const gregorianDate = liveNow.toLocaleDateString('ar-EG', { day: 'numeric', month: 'long', year: 'numeric' });
    const timeFormatted = liveNow.toLocaleTimeString('ar-EG', { hour: '2-digit', minute: '2-digit', hour12: true });

    let hijriDate = '';
    try {
      hijriDate = new Intl.DateTimeFormat('ar-SA-u-ca-islamic-uma', {
        day: 'numeric',
        month: 'long',
        year: 'numeric'
      }).format(liveNow);
    } catch {
      try {
        hijriDate = new Intl.DateTimeFormat('ar-SA-u-ca-islamic', {
          day: 'numeric',
          month: 'long',
          year: 'numeric'
        }).format(liveNow);
      } catch {
        hijriDate = '';
      }
    }

    return {
      dayName,
      gregorianDate,
      hijriDate,
      timeFormatted,
      fullDateLabel: `${dayName}، ${gregorianDate} ${hijriDate ? `· ${hijriDate}` : ''}`
    };
  }, [liveNow]);

  // ----------------------------------------------------
  // DYNAMIC ANIMATED TICKER TAPE MESSAGES CAROUSEL
  // ----------------------------------------------------
  const [tickerIndex, setTickerIndex] = useState(0);
  const [isTickerPaused, setIsTickerPaused] = useState(false);
  const [tickerMode, setTickerMode] = useState<'marquee' | 'slide'>('marquee');

  const tickerItems = useMemo(() => {
    const dailyTarget = Number(confirmedSettings?.dailyTargetProfit ?? 0);
    const contributionVariance = todayReportData.grossOperatingProfit - dailyTarget;
    const salesCount = todayReportData.todaysSalesCount;
    const totalRev = todayReportData.totalSalesRevenue;
    const bottles = todayReportData.totalBottles;

    const baseItems = [
      {
        id: 'daily_profit_summary',
        category: 'profitSummary',
        badge: '📈 ملخص المساهمة والمبيعات اليوم',
        text: !financialDataReady
          ? 'ملخص المبيعات محجوب إلى أن تؤكد Firestore المصادر والحقول المطلوبة.'
          : salesCount > 0
          ? `وفق الفواتير المؤكدة: ${salesCount} فاتورة بإيراد ${totalRev.toLocaleString('ar-EG')} ${currency} ومساهمة محسوبة ${todayReportData.grossOperatingProfit.toLocaleString('ar-EG')} ${currency}.`
          : 'لقطة Firestore المؤكدة لا تحتوي فواتير إنتاج لهذا اليوم.',
        cardStyle: 'bg-gradient-to-r from-emerald-100 via-teal-50 to-emerald-100 dark:from-emerald-950/70 dark:via-teal-950/50 dark:to-emerald-950/70 border-emerald-400 dark:border-emerald-600 shadow-xs',
        badgeBg: 'bg-gradient-to-r from-emerald-700 to-teal-700 text-white border border-emerald-600 font-black shadow-xs apple-soft-pulse-badge',
        iconColor: 'text-emerald-700 dark:text-emerald-300',
        textColor: 'text-emerald-950 dark:text-emerald-50 font-black',
        icon: TrendingUp
      },
      {
        id: 'salawat_prayer',
        category: 'prayer',
        badge: '🕌 الصلاة على النبي',
        text: 'اللَّهُمَّ صَلِّ وَسَلِّمْ وَبَارِكْ عَلَى سَيِّدِنَا مُحَمَّدٍ وَعَلَى آلِهِ وَصَحْبِهِ أَجْمَعِينَ · أكثر من الصلاة على النبي يفتح الله لك أبواب الرزق والتوفيق.',
        cardStyle: 'bg-gradient-to-r from-emerald-50 via-teal-50/80 to-emerald-50 dark:from-emerald-950/40 dark:via-teal-950/30 dark:to-emerald-950/40 border-emerald-300/80 dark:border-emerald-700/50',
        badgeBg: 'bg-emerald-600 text-white border border-emerald-500/80 font-black shadow-xs apple-soft-pulse-badge',
        iconColor: 'text-emerald-600 dark:text-emerald-400',
        textColor: 'text-emerald-950 dark:text-emerald-100 font-bold',
        icon: Sparkles
      },
      {
        id: 'sales_achievement',
        category: 'sales',
        badge: '🎯 موقف المبيعات اليوم',
        text: !financialDataReady
          ? 'حالة المبيعات غير مؤكدة حاليًا؛ لا تُعرض أرقام أو مقارنة بمستهدف.'
          : salesCount > 0
          ? `تُظهر اللقطة المؤكدة ${salesCount} فاتورة بإيراد مسجل ${totalRev.toLocaleString('ar-EG')} ${currency}.`
          : 'لا تظهر فواتير إنتاج لهذا اليوم في لقطة الخادم المؤكدة.',
        cardStyle: 'bg-gradient-to-r from-blue-50 via-indigo-50/80 to-blue-50 dark:from-blue-950/40 dark:via-indigo-950/30 dark:to-blue-950/40 border-blue-300/80 dark:border-blue-700/50',
        badgeBg: 'bg-blue-600 text-white border border-blue-500/80 font-black shadow-xs',
        iconColor: 'text-blue-600 dark:text-blue-400',
        textColor: 'text-blue-950 dark:text-blue-100 font-bold',
        icon: Target
      },
      {
        id: 'commission_earnings',
        category: 'commission',
        badge: '💰 العمولات المسجلة اليوم',
        text: financialDataReady
          ? `مجموع العمولات المسجلة على فواتير اليوم: ${todayReportData.totalCommissions.toLocaleString('ar-EG')} ${currency}.`
          : 'مؤشر العمولات محجوب حتى تأكيد حقول الفواتير من Firestore.',
        cardStyle: 'bg-gradient-to-r from-amber-50 via-yellow-50/90 to-amber-50 dark:from-amber-950/40 dark:via-yellow-950/30 dark:to-amber-950/40 border-amber-300/90 dark:border-amber-700/50',
        badgeBg: 'bg-amber-500 text-amber-950 border border-amber-400/80 font-black shadow-xs',
        iconColor: 'text-amber-700 dark:text-amber-300',
        textColor: 'text-amber-950 dark:text-amber-100 font-extrabold',
        icon: Award
      },
      {
        id: 'bottles_summary',
        category: 'inventory',
        badge: '🧴 إجمالي العبوات اليوم',
        text: financialDataReady
          ? `عدد العبوات المسجل في بنود فواتير اليوم: ${bottles}.`
          : 'عدد العبوات غير متاح قبل تأكيد الفواتير واكتمال حقولها.',
        cardStyle: 'bg-gradient-to-r from-sky-50 via-cyan-50/80 to-sky-50 dark:from-sky-950/40 dark:via-cyan-950/30 dark:to-sky-950/40 border-sky-300/80 dark:border-sky-700/50',
        badgeBg: 'bg-sky-600 text-white border border-sky-500/80 font-black shadow-xs',
        iconColor: 'text-sky-600 dark:text-sky-400',
        textColor: 'text-sky-950 dark:text-sky-100 font-bold',
        icon: Layers
      },
      {
        id: 'breakeven_gap',
        category: 'sales',
        badge: '📊 مقارنة بالمستهدف المسجل',
        text: !financialDataReady
          ? 'المقارنة بالمستهدف غير متاحة حتى اكتمال التحقق.'
          : `المساهمة المحسوبة ${todayReportData.grossOperatingProfit.toLocaleString('ar-EG')} ${currency} مقابل المستهدف اليومي المسجل ${dailyTarget.toLocaleString('ar-EG')} ${currency}; الفرق (المساهمة ناقص المستهدف) ${contributionVariance.toLocaleString('ar-EG')} ${currency}.`,
        cardStyle: 'bg-gradient-to-r from-teal-50 via-emerald-50/80 to-teal-50 dark:from-teal-950/40 dark:via-emerald-950/30 dark:to-teal-950/40 border-teal-300/80 dark:border-teal-700/50',
        badgeBg: 'bg-teal-700 text-white border border-teal-600/80 font-black shadow-xs',
        iconColor: 'text-teal-700 dark:text-teal-300',
        textColor: 'text-teal-950 dark:text-teal-100 font-bold',
        icon: Target
      },
      {
        id: 'dhikr_intention',
        category: 'prayer',
        badge: '✨ إخلاص النية وذكر الله',
        text: 'جدّد نيتك لإتقان العمل وإسعاد العملاء: "إن الله يحب إذا عمل أحدكم عملاً أن يتقنه" · سبحان الله وبحمده، سبحان الله العظيم 🤲',
        cardStyle: 'bg-gradient-to-r from-purple-50 via-fuchsia-50/80 to-purple-50 dark:from-purple-950/40 dark:via-fuchsia-950/30 dark:to-purple-950/40 border-purple-300/80 dark:border-purple-700/50',
        badgeBg: 'bg-purple-600 text-white border border-purple-500/80 font-black shadow-xs',
        iconColor: 'text-purple-600 dark:text-purple-400',
        textColor: 'text-purple-950 dark:text-purple-100 font-bold',
        icon: Crown
      },
      {
        id: 'inventory_alert',
        category: 'inventory',
        badge: '🚨 تنبيه هام للمخزون',
        text: 'تذكير عام: راجع أرصدة المنتجات المسجلة والعتبة المحفوظة؛ الأرقام البرمجية لا تثبت وجودًا فعليًا على الرف.',
        cardStyle: 'bg-gradient-to-r from-rose-50 via-red-50/90 to-rose-50 dark:from-rose-950/50 dark:via-red-950/40 dark:to-rose-950/50 border-rose-300/90 dark:border-rose-700/60 shadow-2xs',
        badgeBg: 'bg-rose-600 text-white border border-rose-500 font-black shadow-xs animate-pulse',
        iconColor: 'text-rose-600 dark:text-rose-400',
        textColor: 'text-rose-950 dark:text-rose-100 font-black',
        icon: AlertCircle
      },
      {
        id: 'sales_boost_ideas',
        category: 'tips',
        badge: '💡 أفكار وتنشيط المبيعات',
        text: 'اقتراح عام غير مبني على قياس أداء: إتاحة تجربة العطر قد تساعد العميل على اختيار الرائحة المناسبة؛ لا توجد هنا نسبة أثر مؤكدة.',
        cardStyle: 'bg-gradient-to-r from-fuchsia-50 via-pink-50/80 to-fuchsia-50 dark:from-fuchsia-950/40 dark:via-pink-950/30 dark:to-fuchsia-950/40 border-fuchsia-300/80 dark:border-fuchsia-700/50',
        badgeBg: 'bg-fuchsia-600 text-white border border-fuchsia-500/80 font-black shadow-xs',
        iconColor: 'text-fuchsia-600 dark:text-fuchsia-400',
        textColor: 'text-fuchsia-950 dark:text-fuchsia-100 font-bold',
        icon: Sparkles
      },
      {
        id: 'store_cleanliness',
        category: 'cleanliness',
        badge: '✨ تنظيم ونظافة المتجر',
        text: 'تذكير عام: راجع قائمة العمل الداخلية لتنظيم ونظافة المتجر.',
        cardStyle: 'bg-gradient-to-r from-indigo-50 via-slate-50/80 to-indigo-50 dark:from-indigo-950/40 dark:via-slate-900/30 dark:to-indigo-950/40 border-indigo-300/80 dark:border-indigo-700/50',
        badgeBg: 'bg-indigo-600 text-white border border-indigo-500/80 font-black shadow-xs',
        iconColor: 'text-indigo-600 dark:text-indigo-400',
        textColor: 'text-indigo-950 dark:text-indigo-100 font-bold',
        icon: Store
      },
      {
        id: 'store_royal_welcome',
        category: 'welcome',
        badge: `👑 متجر ${storeName}`,
        text: `أهلاً بك في نظام التشغيل لمتجر «${storeName}».`,
        cardStyle: 'bg-gradient-to-r from-amber-100/90 via-yellow-50 to-amber-100/90 dark:from-amber-950/60 dark:via-yellow-950/40 dark:to-amber-950/60 border-amber-400/90 dark:border-amber-600/70 shadow-2xs',
        badgeBg: 'bg-gradient-to-r from-amber-600 to-yellow-600 text-white border border-amber-500 font-black shadow-xs',
        iconColor: 'text-amber-700 dark:text-amber-300',
        textColor: 'text-amber-950 dark:text-amber-100 font-black',
        icon: Crown
      }
    ];

    return baseItems;
  }, [todayReportData, settings, confirmedSettings, financialDataReady, currency, storeName]);

  const filteredTickerItems = useMemo(() => {
    const topics = settings?.newsTickerTopics || {};
    const filtered = tickerItems.filter(item => {
      if (item.id === 'sales_achievement' || item.id === 'breakeven_gap' || item.id === 'daily_profit_summary') return topics.sales !== false;
      if (item.id === 'commission_earnings') return topics.commission !== false;
      if (item.id === 'inventory_alert' || item.id === 'bottles_summary') return topics.inventory !== false;
      if (item.id === 'salawat_prayer' || item.id === 'dhikr_intention') return topics.prayers !== false;
      if (item.id === 'sales_boost_ideas' || item.id.startsWith('low_sales_motivation')) return topics.salesTips !== false;
      if (item.id === 'store_cleanliness') return topics.storeCleanliness !== false;
      return true;
    });

    const baseList = filtered.length > 0 ? filtered : tickerItems;

    // Smart non-consecutive category interleaving algorithm
    // Guarantees no two adjacent items ever share the same category
    const pool = [...baseList];
    const interleaved: typeof baseList = [];
    let lastCategory = '';

    while (pool.length > 0) {
      let candidates = pool.filter(item => item.category !== lastCategory);
      if (candidates.length === 0) {
        candidates = pool;
      }

      // Sort by remaining category count in pool (highest first) to avoid trapped duplicate trailing items
      const catCounts = new Map<string, number>();
      pool.forEach(p => catCounts.set(p.category, (catCounts.get(p.category) || 0) + 1));
      candidates.sort((a, b) => (catCounts.get(b.category) || 0) - (catCounts.get(a.category) || 0));

      const selected = candidates[0];
      interleaved.push(selected);
      lastCategory = selected.category;

      const idx = pool.indexOf(selected);
      if (idx !== -1) pool.splice(idx, 1);
    }

    return interleaved;
  }, [tickerItems, settings?.newsTickerTopics]);

  const tickerSpeedSeconds = useMemo(() => {
    const speed = settings?.newsTickerSpeed || 'medium';
    const count = filteredTickerItems.length || 1;
    // Ultra-calm, unhurried reading speed for supreme comfort (further slowed):
    if (speed === 'slow') return Math.max(380, count * 38);
    if (speed === 'fast') return Math.max(160, count * 16);
    return Math.max(280, count * 28); // medium default (ultra-slow & perfectly readable)
  }, [settings?.newsTickerSpeed, filteredTickerItems.length]);

  // Auto-advance ticker every 4.5 seconds unless paused
  useEffect(() => {
    if (isTickerPaused || tickerItems.length === 0) return;
    const interval = setInterval(() => {
      setTickerIndex(prev => (prev + 1) % tickerItems.length);
    }, 4500);
    return () => clearInterval(interval);
  }, [isTickerPaused, tickerItems.length]);

  // Single quiet current status headline for Dynamic Island
  const currentStatusHeadline = useMemo(() => {
    if (!financialDataReady) {
      return { text: 'حالة المؤشرات غير مؤكدة؛ لم تُعرض أرقام من نسخة مخبأة أو محلية.', type: 'info' as const };
    }
    if (!currentClosure) {
      return {
        text: 'لا يوجد سجل وردية مصنف كإنتاج لهذا اليوم في لقطة Firestore المؤكدة.',
        type: 'info' as const,
      };
    }
    if (currentClosure.status === 'مغلق') {
      return { text: 'سجل Firestore المؤكد يصف وردية اليوم بأنها مغلقة.', type: 'info' as const };
    }
    if (currentClosure.status !== 'مفتوح') {
      return { text: 'يوجد سجل وردية، لكن حالته المسجلة غير معروفة؛ لم أستنتج أنها مفتوحة أو مغلقة.', type: 'info' as const };
    }
    if (todayReportData.todaysSalesCount > 0) {
      return {
        text: `تم تسجيل ${todayReportData.todaysSalesCount} فاتورة اليوم بإجمالي ${todayReportData.totalSalesRevenue.toLocaleString('ar-EG')} ${currency}`,
        type: 'success' as const,
      };
    }
    return {
      text: 'سجل Firestore يؤكد أن الوردية مفتوحة؛ لا توجد فواتير إنتاج مسجلة اليوم في اللقطة المؤكدة.',
      type: 'info' as const,
    };
  }, [financialDataReady, currentClosure, todayReportData.todaysSalesCount, todayReportData.totalSalesRevenue, currency]);

  // Main accessible views list for the Segmented Navigation Dock
  const navItems = useMemo(() => {
    return ([
      { id: View.POS, label: 'الكاشير', icon: ShoppingBag, badge: financialDataReady && todayReportData.todaysSalesCount > 0 ? `${todayReportData.todaysSalesCount}` : null },
      { id: View.DASHBOARD, label: 'لوحة القيادة', icon: Sparkles, badge: null },
      { id: View.INVENTORY, label: 'المخزون الخام', icon: Layers, badge: dataSourceHealth?.products.state === 'live' && products.length > 0 ? `${products.length}` : null },
      { id: View.REPORTS, label: 'سجل الفواتير', icon: Clock, badge: null },
      { id: View.CUSTOMERS_LOYALTY, label: 'العملاء والولاء', icon: Crown, badge: null },
      { id: View.FORMULATION_ENGINE, label: 'محرك التركيب', icon: Sliders, badge: null },
      { id: View.EXPENSES, label: 'المصاريف', icon: Wallet, badge: null },
      { id: View.SETTINGS, label: 'الإعدادات والتحكم', icon: Sliders, badge: null },
    ] as const).filter(item => canAccessView(currentUser, item.id));
  }, [currentUser, todayReportData.todaysSalesCount, products.length, financialDataReady, dataSourceHealth]);

  return (
    <>
      {/* ======================================================== */}
      {/* PURE APPLE GLASS TOP BAR (ORGANIZED CAPSULES & SMART MENUS)*/}
      {/* ======================================================== */}
      <header
        aria-label="شريط التحكم العلوي"
        className="mx-2.5 sm:mx-4 lg:mx-6 mb-3 select-none"
      >
        <div className="apple-glass-halo rounded-[28px] p-2.5 sm:p-3 space-y-2.5">
          {/* ---------------------------------------------------- */}
          {/* ROW 1: BRAND LOGO + PROFILE CAPSULE + LABELED BUTTONS*/}
          {/* ---------------------------------------------------- */}
          <div className="flex items-center justify-between gap-2">
            {/* RIGHT SIDE: Avatar Badge & Profile Capsule Pill */}
            <div className="flex items-center gap-2 shrink-0 relative" ref={popoverRef}>
              {/* Circular Logo Badge */}
              <div 
                className="w-11 h-11 sm:w-12 sm:h-12 rounded-full bg-white border border-black/[0.07] shadow-apple-xs flex items-center justify-center p-1.5 shrink-0 select-none hover:scale-105 transition-transform"
                title={storeName}
              >
                {logoUrl ? (
                  <img
                    src={logoUrl}
                    alt={storeName}
                    onError={(e) => { (e.target as HTMLElement).style.display = 'none'; }}
                    className="w-full h-full object-contain rounded-full"
                  />
                ) : (
                  <Store size={20} className="text-slate-500" aria-label="لا يوجد شعار مسجل" />
                )}
              </div>

              {/* Signature Profile Capsule Pill */}
              <button
                type="button"
                onClick={() => setIsProfilePopoverOpen(!isProfilePopoverOpen)}
                className="apple-pill-btn halo-gold h-10 sm:h-12 px-2 sm:px-3.5 min-w-0 max-w-[110px] sm:max-w-[160px] md:max-w-none justify-between group cursor-pointer"
                title="إدارة الحساب وتبديل المستخدم"
              >
                <div className="text-right min-w-0">
                  <div className={`text-xs sm:text-[13px] font-black truncate leading-tight ${isOwner ? 'text-[#C49746]' : 'text-[#0071E3]'}`}>
                    {isOwner ? 'أهلاً د. محمد' : 'أهلاً طارق'}
                  </div>
                  <div className="text-[10px] text-[#86868B] font-medium truncate mt-0.5 leading-none">
                    {isOwner ? 'الإدارة العامة' : (currentUser?.phone || 'كاشير ومبيعات')}
                  </div>
                </div>
                <ChevronDown 
                  size={13} 
                  className={`text-[#86868B] group-hover:text-[#1D1D1F] shrink-0 transition-transform duration-200 mr-1 ${isProfilePopoverOpen ? 'rotate-180 text-[#0071E3]' : ''}`} 
                />
              </button>

              {/* ------------------------------------------------ */}
              {/* APPLE PROFILE & USER SWITCHER CONTROL POPOVER    */}
              {/* ------------------------------------------------ */}
              {isProfilePopoverOpen && (
                <>
                  <div 
                    className="fixed inset-0 z-40 bg-black/10 backdrop-blur-[1px] transition-opacity" 
                    onClick={() => setIsProfilePopoverOpen(false)} 
                  />
                  <div 
                    className="absolute top-full mt-2.5 right-0 z-50 w-72 sm:w-80 max-w-[calc(100vw-1.5rem)] rounded-3xl bg-white/98 backdrop-blur-2xl border border-black/[0.1] shadow-2xl p-3.5 space-y-3 animate-in fade-in zoom-in-95 duration-150"
                    dir="rtl"
                  >
                    {/* Current Active Account Header */}
                    <div className="flex items-center gap-3 pb-3 border-b border-black/[0.06]">
                      <div className={`w-11 h-11 rounded-full flex items-center justify-center font-black text-sm text-white shadow-apple-xs ${isOwner ? 'bg-[#1D1D1F] border border-[#C49746]/50' : 'bg-[#0071E3]'}`}>
                        {isOwner ? <Crown size={18} className="text-[#C49746] fill-[#C49746]" /> : 'ط'}
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-1.5">
                          <strong className="text-xs font-black text-[#1D1D1F] truncate block">
                            {currentUser?.displayName || 'المستخدم'}
                          </strong>
                          <span className="w-1.5 h-1.5 rounded-full bg-[#34C759] shrink-0" />
                        </div>
                        <span className="text-[11px] text-[#86868B] block truncate">
                          {isOwner ? 'كامل صلاحيات الإدارة العامة' : 'مسؤول المبيعات وتشغيل الكاشير'}
                        </span>
                      </div>
                    </div>

                    {/* No local role switching in phase 1 */}
                    <div className="rounded-2xl bg-emerald-50 border border-emerald-200/70 px-3 py-2.5 text-[10px] leading-relaxed text-emerald-900">
                      <span className="block font-black">الجلسة الحالية موثّقة عبر Firebase Authentication</span>
                      <span className="block mt-0.5">دخول الموظفين أو محاكاة دور طارق غير مفعّل في هذه المرحلة.</span>
                    </div>

                    {/* Quick Controls Grid */}
                    <div className="grid grid-cols-2 gap-2 pt-1 border-t border-black/[0.05]">
                      {onLockScreen && (
                        <button
                          type="button"
                          onClick={() => {
                            setIsProfilePopoverOpen(false);
                            onLockScreen();
                          }}
                          className="p-2 rounded-xl bg-black/[0.04] hover:bg-black/[0.08] text-[#1D1D1F] text-[11px] font-bold flex items-center justify-center gap-1.5 transition-all cursor-pointer"
                        >
                          <Lock size={12} className="text-amber-600" />
                          <span>قفل الشاشة</span>
                        </button>
                      )}

                      {onUpdateSettings && (
                        <button
                          type="button"
                          onClick={() => {
                            const nextNumeral = settings?.siteNumeralSystem === 'ar' ? 'en' : 'ar';
                            onUpdateSettings(prev => ({ ...prev, siteNumeralSystem: nextNumeral }));
                            setIsProfilePopoverOpen(false);
                          }}
                          className="p-2 rounded-xl bg-black/[0.04] hover:bg-black/[0.08] text-[#1D1D1F] text-[11px] font-bold flex items-center justify-center gap-1.5 transition-all cursor-pointer font-mono"
                        >
                          <span>{settings?.siteNumeralSystem === 'ar' ? 'الأرقام: ١٢٣' : 'Numbers: 123'}</span>
                        </button>
                      )}
                    </div>

                    {/* General Auth Modal / User Switch */}
                    <div className="pt-2 border-t border-black/[0.05]">
                      <button
                        type="button"
                        onClick={() => {
                          setIsProfilePopoverOpen(false);
                          onOpenAuthModal();
                        }}
                        className="w-full py-2 rounded-xl text-rose-600 hover:bg-rose-50 text-[11px] font-bold flex items-center justify-center gap-1.5 transition-colors cursor-pointer"
                      >
                        <LogOut size={13} />
                        <span>إدارة جلسة Google وتسجيل الخروج</span>
                      </button>
                    </div>
                  </div>
                </>
              )}
            </div>

            {/* LEFT SIDE: Labeled Capsule Buttons with Soft Chromatic Halos */}
            <div className="flex items-center gap-1 sm:gap-1.5 shrink-0 justify-end">
              {/* 1. Labeled Search Capsule */}
              <button
                type="button"
                onClick={() => setIsSearchModalOpen(true)}
                className="apple-pill-btn halo-gold h-10 sm:h-11 px-2.5 sm:px-3 text-xs font-bold text-[#1D1D1F] cursor-pointer"
                title="بحث ذكي في العطور والتركيبات"
              >
                <Search size={15} className="text-[#C49746] shrink-0" strokeWidth={2} />
                <span className="hidden sm:inline">بحث العطور</span>
              </button>

              {/* 2. Labeled Cart / POS Capsule */}
              <button
                type="button"
                onClick={() => onNavigate?.(View.POS)}
                className={`apple-pill-btn halo-blue h-10 sm:h-11 px-2.5 sm:px-3.5 text-xs font-bold relative cursor-pointer ${currentView === View.POS ? 'bg-[#0071E3] text-white shadow-apple-xs' : 'text-[#1D1D1F]'}`}
                title="الكاشير والمبيعات"
              >
                <ShoppingBag size={15} className={currentView === View.POS ? 'text-white shrink-0' : 'text-[#0071E3] shrink-0'} strokeWidth={2} />
                <span className="hidden xs:inline">الكاشير</span>
                {financialDataReady && todayReportData.todaysSalesCount > 0 && (
                  <span className={`min-w-[18px] h-[18px] px-1 rounded-full text-[9.5px] font-mono font-black flex items-center justify-center ${currentView === View.POS ? 'bg-white text-[#0071E3]' : 'bg-[#0071E3] text-white shadow-2xs'}`}>
                    {todayReportData.todaysSalesCount}
                  </span>
                )}
              </button>

              {/* 3. Labeled Notifications Capsule (رادار المالك للمالك - وقسم العمولات لطارق) */}
              {isOwner ? (
                <button
                  type="button"
                  onClick={onOpenLiveAlertsRadar}
                  className="apple-pill-btn halo-emerald h-10 sm:h-11 px-2.5 sm:px-3 text-xs font-bold text-[#1D1D1F] relative cursor-pointer"
                  title="رادار التنبيهات والتزامن الحي لمدير النظام د. محمد"
                >
                  <Bell size={15} className="text-[#34C759] shrink-0" strokeWidth={2} />
                  <span className="hidden md:inline">الرادار</span>
                  <span className="w-2 h-2 rounded-full bg-[#34C759] ring-2 ring-white animate-pulse shrink-0" />
                </button>
              ) : (
                <button
                  type="button"
                  onClick={() => onNavigate && onNavigate(View.STAFF_ENTITLEMENTS)}
                  className="apple-pill-btn halo-blue h-10 sm:h-11 px-2.5 sm:px-3 text-xs font-bold text-[#1D1D1F] relative cursor-pointer"
                  title="قسم مستحقات طارق وعمولات اليوم وتوجيهات العمل"
                >
                  <Award size={15} className="text-[#0071E3] shrink-0" strokeWidth={2} />
                  <span className="hidden md:inline">مستحقاتي</span>
                  <span className="w-2 h-2 rounded-full bg-[#0071E3] ring-2 ring-white animate-pulse shrink-0" />
                </button>
              )}

              {/* 4. Settings & Control Hub Capsule - Strictly hidden if unauthorized */}
              {canAccessView(currentUser, View.SETTINGS) && (
                <button
                  type="button"
                  onClick={() => onNavigate?.(View.SETTINGS)}
                  className={`apple-pill-btn halo-amber h-10 sm:h-11 px-2.5 sm:px-3.5 text-xs font-bold relative cursor-pointer transition-all ${
                    currentView === View.SETTINGS 
                      ? 'bg-[#1D1D1F] text-amber-300 shadow-apple-xs ring-1 ring-amber-400/40' 
                      : 'text-[#1D1D1F] hover:bg-amber-500/10'
                  }`}
                  title="مركز التحكم والإعدادات الإدارية"
                >
                  <Sliders size={15} className={currentView === View.SETTINGS ? 'text-amber-400 shrink-0' : 'text-amber-600 shrink-0'} strokeWidth={2} />
                  <span className="hidden sm:inline">الإعدادات</span>
                </button>
              )}

              {/* 5. CONSOLIDATED TOOLS MENU CAPSULE */}
              <div className="relative" ref={toolsMenuRef}>
                <button
                  type="button"
                  onClick={() => setIsToolsMenuOpen(!isToolsMenuOpen)}
                  className="apple-pill-btn halo-purple h-10 sm:h-11 px-2.5 sm:px-3 text-xs font-bold text-[#1D1D1F] group cursor-pointer"
                  title="قائمة الأدوات السريعة للمتجر"
                >
                  <Sparkles size={14} className="text-purple-600 shrink-0" />
                  <span className="hidden md:inline">الأدوات</span>
                  <ChevronDown size={13} className={`text-[#86868B] group-hover:text-[#1D1D1F] shrink-0 transition-transform ${isToolsMenuOpen ? 'rotate-180' : ''}`} />
                </button>

                {/* Dropdown Tools Sheet */}
                {isToolsMenuOpen && (
                  <>
                    <div 
                      className="fixed inset-0 z-40 bg-black/10 backdrop-blur-[1px] transition-opacity" 
                      onClick={() => setIsToolsMenuOpen(false)} 
                    />
                    <div 
                      className="absolute top-full mt-2.5 left-0 z-50 w-72 sm:w-80 max-w-[calc(100vw-1.5rem)] rounded-3xl bg-white/98 backdrop-blur-2xl border border-black/[0.1] shadow-2xl p-2.5 space-y-1.5 animate-in fade-in zoom-in-95 duration-150"
                      dir="rtl"
                    >
                      <div className="flex items-center justify-between px-2.5 py-1 border-b border-black/[0.05] mb-1">
                        <span className="text-[11px] font-black text-[#1D1D1F]">الأدوات والإعدادات المدمجة:</span>
                        <span className="text-[9.5px] font-bold text-[#86868B]">وصول مباشر</span>
                      </div>

                      {/* Control Hub Direct Link in Menu */}
                      {canAccessView(currentUser, View.SETTINGS) && onNavigate && (
                        <button
                          type="button"
                          onClick={() => {
                            setIsToolsMenuOpen(false);
                            onNavigate(View.SETTINGS);
                          }}
                          className="w-full px-3 py-2 rounded-2xl hover:bg-amber-50 text-[#1D1D1F] hover:text-amber-900 text-xs font-bold flex items-center gap-2.5 transition-colors cursor-pointer border border-amber-200/50 bg-amber-50/30"
                        >
                          <div className="w-7 h-7 rounded-xl bg-amber-500/20 text-amber-700 flex items-center justify-center shrink-0">
                            <Sliders size={14} />
                          </div>
                          <div className="text-right">
                            <span className="block font-black">⚙️ مركز التحكم والإعدادات</span>
                            <span className="text-[9.5px] text-[#86868B]">الموظفين، العمولات، الموازنة، والهوية</span>
                          </div>
                        </button>
                      )}

                      {/* Theme Studio */}
                      {onOpenThemeStudio && (
                        <button
                          type="button"
                          onClick={() => {
                            setIsToolsMenuOpen(false);
                            onOpenThemeStudio();
                          }}
                          className="w-full px-3 py-2 rounded-2xl hover:bg-purple-50 text-[#1D1D1F] hover:text-purple-900 text-xs font-bold flex items-center gap-2.5 transition-colors cursor-pointer"
                        >
                          <div className="w-7 h-7 rounded-xl bg-purple-100 text-purple-700 flex items-center justify-center shrink-0">
                            <Palette size={14} />
                          </div>
                          <div className="text-right">
                            <span className="block">استوديو الثيمات والخطوط</span>
                            <span className="text-[9.5px] text-[#86868B]">تخصيص الألوان والمظهر</span>
                          </div>
                        </button>
                      )}

                      {/* Connected Devices (خاص بالمالك د. محمد فقط) */}
                      {isOwner && onOpenConnectedDevices && (
                        <button
                          type="button"
                          onClick={() => {
                            setIsToolsMenuOpen(false);
                            onOpenConnectedDevices();
                          }}
                          className="w-full px-3 py-2 rounded-2xl hover:bg-emerald-50 text-[#1D1D1F] hover:text-emerald-900 text-xs font-bold flex items-center gap-2.5 transition-colors cursor-pointer"
                        >
                          <div className="w-7 h-7 rounded-xl bg-emerald-100 text-emerald-700 flex items-center justify-center shrink-0">
                            <Radio size={14} />
                          </div>
                          <div className="text-right">
                            <span className="block">أجهزة ذات نبضة حديثة ({connectedDevicesCount === null ? 'غير مؤكّد' : connectedDevicesCount})</span>
                            <span className="text-[9.5px] text-[#86868B]">آخر نبضة وحالة تأكيد Firestore</span>
                          </div>
                        </button>
                      )}

                      {/* Daily Report TXT */}
                      {isOwner && (
                        <button
                          type="button"
                          disabled={!financialDataReady}
                          onClick={() => {
                            setIsToolsMenuOpen(false);
                            if (onOpenDailyReportAutomation) onOpenDailyReportAutomation();
                            else setShowDailyReportModal(true);
                          }}
                          title={financialDataReady ? 'تقرير من لقطات خادمية مؤكدة' : 'التقرير محجوب حتى تأكيد مصادر البيانات'}
                          className="w-full px-3 py-2 rounded-2xl hover:bg-blue-50 disabled:opacity-50 disabled:cursor-not-allowed text-[#1D1D1F] hover:text-blue-900 text-xs font-bold flex items-center gap-2.5 transition-colors cursor-pointer"
                        >
                          <div className="w-7 h-7 rounded-xl bg-blue-100 text-blue-700 flex items-center justify-center shrink-0">
                            <FileText size={14} />
                          </div>
                          <div className="text-right">
                            <span className="block">تصدير تقرير اليوم (.TXT)</span>
                            <span className="text-[9.5px] text-[#86868B]">ملخص المبيعات والمساهمة المحسوبة</span>
                          </div>
                        </button>
                      )}

                      {/* PWA Install */}
                      {onOpenPWAInstall && (
                        <button
                          type="button"
                          onClick={() => {
                            setIsToolsMenuOpen(false);
                            onOpenPWAInstall();
                          }}
                          className="w-full px-3 py-2 rounded-2xl hover:bg-amber-50 text-[#1D1D1F] hover:text-amber-900 text-xs font-bold flex items-center gap-2.5 transition-colors cursor-pointer"
                        >
                          <div className="w-7 h-7 rounded-xl bg-amber-100 text-amber-700 flex items-center justify-center shrink-0">
                            <Download size={14} />
                          </div>
                          <div className="text-right">
                            <span className="block">تثبيت التطبيق على الجهاز</span>
                            <span className="text-[9.5px] text-[#86868B]">نسخة سطح المكتب والموبايل</span>
                          </div>
                        </button>
                      )}

                      {/* Screen Lock */}
                      {onLockScreen && (
                        <button
                          type="button"
                          onClick={() => {
                            setIsToolsMenuOpen(false);
                            onLockScreen();
                          }}
                          className="w-full px-3 py-2 rounded-2xl hover:bg-slate-100 text-[#1D1D1F] text-xs font-bold flex items-center gap-2.5 transition-colors cursor-pointer border-t border-black/[0.04] mt-1 pt-2"
                        >
                          <div className="w-7 h-7 rounded-xl bg-slate-100 text-slate-700 flex items-center justify-center shrink-0">
                            <Lock size={14} />
                          </div>
                          <div className="text-right">
                            <span className="block">قفل الشاشة السريع</span>
                            <span className="text-[9.5px] text-[#86868B]">حماية الخصوصية</span>
                          </div>
                        </button>
                      )}
                    </div>
                  </>
                )}
              </div>
            </div>
          </div>

          {/* ---------------------------------------------------- */}
          {/* ROW 2: STORE SHIFT CAPSULE + LIVE CLOCK & DATE + INVOICES LOG BUTTON */}
          {/* ---------------------------------------------------- */}
          <div 
            className="flex flex-wrap items-center justify-between gap-2 pt-1 border-t border-black/[0.04] rounded-2xl p-1.5"
            style={{ backgroundColor: '#f7bfc5' }}
          >
            {/* RIGHT SIDE: Store Branch & Shift Capsule */}
            <button
              type="button"
              onClick={onOpenDayOperations}
              className="apple-pill-btn halo-emerald h-9 px-3.5 text-xs font-bold text-[#1D1D1F] max-w-[50%] sm:max-w-none shrink-0"
              title="فتح وإغلاق اليوم والدرج"
            >
              <Store size={13} className="text-emerald-600 shrink-0" />
              <span className={`w-2 h-2 rounded-full shrink-0 ${!financialDataReady ? 'bg-slate-400' : currentClosure?.status === 'مفتوح' ? 'bg-[#34C759] animate-pulse' : currentClosure?.status === 'مغلق' ? 'bg-rose-500' : 'bg-amber-500'}`} />
              <span className="truncate text-[11px] sm:text-xs">
                {!financialDataReady
                  ? `${storeName} · حالة الوردية غير مؤكدة`
                  : !currentClosure
                  ? `${storeName} · لا يوجد سجل وردية لليوم`
                  : currentClosure.status === 'مفتوح'
                  ? `${storeName} · سجل Firestore يؤكد فتح الوردية`
                  : currentClosure.status === 'مغلق'
                  ? `${storeName} · سجل Firestore يؤكد إغلاق الوردية`
                  : `${storeName} · حالة سجل الوردية غير معروفة`}
              </span>
              <ChevronDown size={12} className="text-[#86868B] shrink-0" />
            </button>

            {/* CENTER / ELEGANT APPLE CLOCK & CALENDAR WIDGET */}
            <div className="px-3.5 py-1.5 rounded-full bg-[#1D1D1F] text-white border border-white/10 shadow-sm flex items-center gap-2 text-xs sm:text-sm font-mono font-bold dir-rtl shrink-0 mx-auto sm:mx-0">
              <span className="relative flex h-2 w-2 shrink-0">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-400"></span>
              </span>
              <Clock size={13} className="text-amber-400 shrink-0" />
              <span className="text-amber-300 font-extrabold tracking-tight">{formattedDateAndClock.timeFormatted}</span>
              <span className="text-white/30">|</span>
              <span className="text-zinc-200 text-[11px] sm:text-xs font-sans font-bold">{formattedDateAndClock.dayName}</span>
              <span className="text-white/30">·</span>
              <span className="text-zinc-300 text-[11px] sm:text-xs font-sans font-medium">{formattedDateAndClock.gregorianDate}</span>
            </div>

            {/* LEFT SIDE: Invoices Log Capsule */}
            <button
              type="button"
              onClick={() => onNavigate?.(View.REPORTS)}
              className={`apple-pill-btn halo-blue h-9 px-3 sm:px-3.5 text-xs font-bold shrink-0 ${currentView === View.REPORTS ? 'bg-[#0071E3] text-white shadow-apple-xs' : 'text-[#1D1D1F]'}`}
              title="سجل الفواتير والعمليات المعتمدة"
            >
              <FileText size={14} className={currentView === View.REPORTS ? 'text-white shrink-0' : 'text-[#0071E3] shrink-0'} strokeWidth={2} />
              <span>سجل الفواتير</span>
            </button>
          </div>

          {/* ---------------------------------------------------- */}
          {/* ROW 3: ULTRA-CLEAN APPLE SEGMENTED NAVIGATION DOCK   */}
          {/* ---------------------------------------------------- */}
          {onNavigate && (
            <div className="pt-1 border-t border-black/[0.04]">
              <nav 
                aria-label="التنقل السريع"
                className="flex items-center gap-1.5 p-1 rounded-full bg-black/[0.03] overflow-x-auto no-scrollbar scroll-smooth"
              >
                {navItems.map((item) => {
                  const isActive = currentView === item.id;
                  const Icon = item.icon;
                  return (
                    <button
                      key={item.id}
                      type="button"
                      onClick={() => onNavigate(item.id)}
                      className={`px-3 sm:px-4 py-1.5 rounded-full text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer whitespace-nowrap shrink-0 active:scale-98 ${
                        isActive
                          ? 'bg-[#1D1D1F] text-white shadow-apple-xs'
                          : 'text-[#636366] hover:text-[#1D1D1F] hover:bg-white/60'
                      }`}
                    >
                      <Icon size={13} strokeWidth={isActive ? 2.2 : 1.8} />
                      <span>{item.label}</span>
                      {item.badge && (
                        <span className={`font-mono text-[9.5px] px-1.5 py-0.2 rounded-full font-black ${isActive ? 'bg-white/20 text-white' : 'bg-black/[0.06] text-[#86868B]'}`}>
                          {item.badge}
                        </span>
                      )}
                    </button>
                  );
                })}
              </nav>
            </div>
          )}

          {/* ---------------------------------------------------- */}
          {/* ROW 4: APPLE LIQUID GLASS LIVE BROADCAST STREAM      */}
          {/* ---------------------------------------------------- */}
          {settings?.showNewsTickerBar !== false && (
            <div 
              className="relative rounded-2xl apple-ticker-glass-glow border border-amber-300/40 dark:border-amber-500/30 shadow-md flex items-center overflow-hidden h-10 sm:h-11 my-1 transition-all duration-500 hover:border-amber-400/60"
              onMouseEnter={() => setIsTickerPaused(true)}
              onMouseLeave={() => setIsTickerPaused(false)}
            >
              {/* Apple Ambient Iridescent Accent Line */}
              <div className="absolute bottom-0 left-0 right-0 h-[2px] bg-gradient-to-r from-amber-500 via-emerald-500 to-blue-500 opacity-60 z-20" />

              {/* Subtle Edge Vignette Fade Effects for Apple Aesthetic */}
              <div className="absolute left-0 top-0 bottom-0 w-8 z-20 pointer-events-none bg-gradient-to-r from-white via-white/80 to-transparent dark:from-zinc-900 dark:via-zinc-900/80" />
              <div className="absolute right-0 top-0 bottom-0 w-8 z-20 pointer-events-none bg-gradient-to-l from-white via-white/80 to-transparent dark:from-zinc-900 dark:via-zinc-900/80" />

              {/* Continuous Smooth Broadcast Ticker Stream (Apple Liquid Glass Marquee) */}
              <div className="apple-ticker-mask w-full overflow-hidden relative py-0.5 px-3">
                <div 
                  className={`apple-ticker-track-right flex items-center gap-4 sm:gap-5 ${isTickerPaused ? 'apple-ticker-paused' : ''}`}
                  style={{ animationDuration: `${tickerSpeedSeconds}s` }}
                >
                  {[...filteredTickerItems, ...filteredTickerItems, ...filteredTickerItems, ...filteredTickerItems].map((item, idx) => {
                    const ItemIcon = item.icon;
                    return (
                      <div
                        key={`${item.id}-broadcast-${idx}`}
                        className={`flex items-center gap-2.5 shrink-0 whitespace-nowrap text-xs sm:text-[13px] font-bold dir-rtl px-3 py-1 rounded-xl border shadow-2xs transition-all duration-300 ${item.cardStyle || 'bg-slate-50 dark:bg-zinc-800/80 border-slate-200/90 dark:border-white/10'}`}
                      >
                        <span className={`px-2.5 py-0.5 rounded-lg text-[11px] font-black shrink-0 ${item.badgeBg || 'bg-slate-100 text-slate-800 border border-slate-200'}`}>
                          {item.badge}
                        </span>
                        <ItemIcon size={15} className={`shrink-0 ${item.iconColor || 'text-amber-500'}`} />
                        <span className={`font-extrabold tracking-tight ${item.textColor || 'text-slate-900 dark:text-zinc-100'}`}>
                          {item.text}
                        </span>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          )}
        </div>
      </header>

      {/* ======================================================== */}
      {/* INTEGRATED SMART SEARCH MODAL (SEARCH CIRCLE BUTTON)     */}
      {/* ======================================================== */}
      {isSearchModalOpen && (
        <SmartFragranceSearchModal
          isOpen={isSearchModalOpen}
          onClose={() => setIsSearchModalOpen(false)}
          products={products}
          onAddToCart={() => {
            setIsSearchModalOpen(false);
            if (onNavigate) onNavigate(View.POS);
          }}
        />
      )}

      {/* ======================================================== */}
      {/* DAILY REPORT EXPORT MODAL (.TXT)                         */}
      {/* ======================================================== */}
      {showDailyReportModal && financialDataReady && (
        <div className="fixed inset-0 z-[120] bg-black/50 backdrop-blur-md flex items-center justify-center p-4 animate-in fade-in duration-150">
          <div className="apple-glass rounded-[28px] p-5 sm:p-6 w-full max-w-lg border border-black/[0.1] shadow-apple-lg space-y-4 bg-white/95 max-h-[90vh] flex flex-col">
            <div className="flex items-center justify-between pb-3 border-b border-black/[0.06] shrink-0">
              <div className="flex items-center gap-2.5">
                <div className="w-10 h-10 rounded-2xl bg-[#0071E3] text-white flex items-center justify-center shadow-xs">
                  <FileText size={19} />
                </div>
                <div>
                  <h3 className="font-black text-sm sm:text-base text-[#1D1D1F]">تصدير تقرير الأداء اليومي المنظم</h3>
                  <span className="text-[11px] text-[#86868B]">
                    ملخص حقول الفواتير والمصروفات المسجلة ليوم {todayReportData.todayStr} — ليس تدقيقًا محاسبيًا
                  </span>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setShowDailyReportModal(false)}
                className="w-8 h-8 rounded-full bg-black/[0.05] hover:bg-black/[0.1] flex items-center justify-center text-[#86868B] cursor-pointer"
              >
                <X size={16} />
              </button>
            </div>

            <div className="grid grid-cols-3 gap-2.5 shrink-0">
              <div className="p-3 rounded-2xl bg-blue-50/70 border border-blue-200/60 text-right">
                <span className="text-[10px] font-bold text-[#0071E3] flex items-center gap-1">
                  <ShoppingBag size={11} />
                  إجمالي المبيعات
                </span>
                <span className="text-sm sm:text-base font-black font-mono text-[#1D1D1F] block mt-1">
                  {todayReportData.totalSalesRevenue.toLocaleString('ar-EG')} {currency}
                </span>
              </div>

              <div className="p-3 rounded-2xl bg-amber-50/70 border border-amber-200/60 text-right">
                <span className="text-[10px] font-bold text-[#9A6E23] flex items-center gap-1">
                  <Wallet size={11} />
                  تكلفة الفواتير + مصروفات مسجلة
                </span>
                <span className="text-sm sm:text-base font-black font-mono text-[#1D1D1F] block mt-1">
                  {(todayReportData.totalRawMaterialCost + todayReportData.directTodayExpenses).toLocaleString('ar-EG', { maximumFractionDigits: 2 })} {currency}
                </span>
              </div>

              <div className="p-3 rounded-2xl bg-emerald-50/70 border border-emerald-200/60 text-right">
                <span className="text-[10px] font-bold text-[#248A3D] flex items-center gap-1">
                  <Crown size={11} />
                  المساهمة المحسوبة
                </span>
                <span className="text-sm sm:text-base font-black font-mono text-[#248A3D] block mt-1">
                  {todayReportData.grossOperatingProfit.toLocaleString('ar-EG', { maximumFractionDigits: 2 })} {currency}
                </span>
              </div>
            </div>

            <div className="flex-1 min-h-[180px] rounded-2xl bg-[#1D1D1F] text-zinc-100 p-3.5 font-mono text-[11px] overflow-y-auto leading-relaxed select-all" dir="rtl">
              <pre className="whitespace-pre-wrap font-sans">{todayReportData.reportTextContent}</pre>
            </div>

            <div className="flex items-center justify-end gap-2.5 pt-2 border-t border-black/[0.06] shrink-0">
              <button
                type="button"
                onClick={handleCopyReportToClipboard}
                className="apple-btn px-4 py-2.5 rounded-xl bg-black/[0.05] hover:bg-black/[0.1] text-[#1D1D1F] text-xs font-bold flex items-center gap-1.5 cursor-pointer"
              >
                {copiedReport ? <Check size={14} className="text-[#34C759]" /> : <Copy size={14} />}
                <span>{copiedReport ? 'تم النسخ للحافظة ✓' : 'نسخ النص'}</span>
              </button>

              <button
                type="button"
                onClick={handleDownloadTxtReport}
                className="apple-btn px-5 py-2.5 rounded-xl bg-[#0071E3] hover:bg-[#0077ED] text-white text-xs font-black flex items-center gap-1.5 shadow-sm cursor-pointer"
              >
                <Download size={14} />
                <span>تحميل ملف نصي (.TXT)</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
});

export default ExecutiveHeaderBar;
