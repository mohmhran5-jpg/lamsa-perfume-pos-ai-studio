import React, { useState, useMemo, useEffect, useRef } from 'react';
import { 
  AppUser, 
  Sale, 
  Expense, 
  StoreSettings, 
  Product, 
  DailyClosure, 
  View, 
  DEFAULT_USERS, 
  OWNER_FULL_PERMISSIONS, 
  TAREK_OPERATIONAL_PERMISSIONS, 
  resolveActiveAppTheme, 
  isActualPaidOperationalExpense, 
  isLiveProductionSale, 
  calculateDailyAccountingSeparation 
} from '../types';
import { AppleNotificationItem } from './AppleTopNotificationBanner';
import SmartFragranceSearchModal from './SmartFragranceSearchModal';
import { 
  Crown, 
  ArrowLeftRight, 
  Lock, 
  Unlock,
  KeyRound, 
  X, 
  CheckCircle2, 
  FileText, 
  Download, 
  Bell, 
  Copy, 
  Check, 
  Eye, 
  EyeOff, 
  Delete, 
  ShoppingBag, 
  Wallet, 
  AlertCircle, 
  Info, 
  Palette, 
  Radio,
  Search,
  Clock,
  ChevronDown,
  Layers,
  Sparkles,
  LogOut,
  Sliders
} from 'lucide-react';
import { verifyPassword, normalizePasswordInput, canAccessView } from '../services/authService';

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
  users: AppUser[];
  onSwitchUser: (user: AppUser) => void;
  onOpenAuthModal: () => void;
  onOpenDayOperations: () => void;
  onLockScreen?: () => void;
  sales?: Sale[];
  expenses?: Expense[];
  settings?: StoreSettings;
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
  connectedDevicesCount?: number;
  onOpenConnectedDevices?: () => void;
  onUpdateSettings?: React.Dispatch<React.SetStateAction<StoreSettings>>;
}

export const ExecutiveHeaderBar: React.FC<ExecutiveHeaderBarProps> = React.memo(({
  currentUser,
  users,
  onSwitchUser,
  onOpenAuthModal,
  onOpenDayOperations,
  onLockScreen,
  sales = [],
  expenses = [],
  settings,
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
  connectedDevicesCount = 1,
  onOpenConnectedDevices,
  onUpdateSettings,
}) => {
  const isOwner = currentUser?.role === 'OWNER' || currentUser?.username === 'mohamed' || currentUser?.id === 'owner_mohamed';
  const tarekUser = useMemo(() => {
    const found = users.find(u => u.username === 'tarek' || u.id === 'sales_tarek' || u.role === 'STORE_MANAGER');
    return found
      ? { ...DEFAULT_USERS[1], ...found, role: 'STORE_MANAGER' as const, isActive: true, permissions: TAREK_OPERATIONAL_PERMISSIONS }
      : DEFAULT_USERS[1];
  }, [users]);
  const ownerUser = useMemo(() => {
    const found = users.find(u => u.role === 'OWNER' || u.username === 'mohamed' || u.id === 'owner_mohamed');
    return found
      ? { ...DEFAULT_USERS[0], ...found, role: 'OWNER' as const, isActive: true, permissions: OWNER_FULL_PERMISSIONS }
      : DEFAULT_USERS[0];
  }, [users]);

  const pinInputRef = useRef<HTMLInputElement | null>(null);
  const popoverRef = useRef<HTMLDivElement | null>(null);

  // Modal & Popover States
  const [isProfilePopoverOpen, setIsProfilePopoverOpen] = useState(false);
  const [isSearchModalOpen, setIsSearchModalOpen] = useState(false);
  const [showPasswordPrompt, setShowPasswordPrompt] = useState(false);
  const [passwordInput, setPasswordInput] = useState('');
  const [showPinText, setShowPinText] = useState(false);
  const [passwordError, setPasswordError] = useState<string | null>(null);
  const [isVerifying, setIsVerifying] = useState(false);

  // Daily Report Modal
  const [showDailyReportModal, setShowDailyReportModal] = useState(false);
  const [copiedReport, setCopiedReport] = useState(false);

  const currency = settings?.currency || 'ج.م';
  const storeName = settings?.storeName || 'لمسة عطر';
  const logoUrl = settings?.logoUrl || 'https://l.top4top.io/p_31142jfec0.png';

  // Close profile popover when clicking outside
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (popoverRef.current && !popoverRef.current.contains(e.target as Node)) {
        setIsProfilePopoverOpen(false);
      }
    };
    if (isProfilePopoverOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [isProfilePopoverOpen]);

  // Compute today's financial & operational metrics
  const todayReportData = useMemo(() => {
    const todayStr = new Date().toISOString().slice(0, 10);
    const dateArabic = new Date().toLocaleDateString('ar-EG', {
      weekday: 'long',
      year: 'numeric',
      month: 'long',
      day: 'numeric'
    });
    const timeArabic = new Date().toLocaleTimeString('ar-EG', {
      hour: '2-digit',
      minute: '2-digit'
    });

    const todaysSales = sales.filter(s => s.date && s.date.startsWith(todayStr) && isLiveProductionSale(s));
    const todaysExpenses = expenses.filter(
      e => e.date && e.date.startsWith(todayStr) && isActualPaidOperationalExpense(e)
    );

    const totalSalesRevenue = todaysSales.reduce((sum, s) => sum + (s.totalPrice || 0), 0);
    const totalRawMaterialCost = todaysSales.reduce((sum, s) => sum + (s.totalCost || 0), 0);
    const totalCommissions = todaysSales.reduce(
      (sum, s) => sum + (s.commissionAmount ?? Math.round((s.totalPrice || 0) * 0.05)),
      0
    );

    const cashSales = todaysSales
      .filter(s => !s.paymentMethod || s.paymentMethod === 'نقدي')
      .reduce((sum, s) => sum + (s.totalPrice || 0), 0);
    const cardSales = todaysSales
      .filter(s => s.paymentMethod === 'بطاقة')
      .reduce((sum, s) => sum + (s.totalPrice || 0), 0);
    const walletSales = todaysSales
      .filter(s => s.paymentMethod === 'محفظة إلكترونية' || s.paymentMethod === 'تحويل بنكي')
      .reduce((sum, s) => sum + (s.totalPrice || 0), 0);

    const directTodayExpenses = todaysExpenses.reduce((sum, e) => sum + (e.amount || 0), 0);
    const dailyFixedShare = 600;

    const dailyAccounting = calculateDailyAccountingSeparation({
      netSales: totalSalesRevenue,
      productCost: totalRawMaterialCost,
      commissions: totalCommissions,
      plannedDailyAllocation: dailyFixedShare,
      actualCashExpensesPaidToday: directTodayExpenses,
    });

    const grossOperatingProfit = dailyAccounting.contribution;
    const netFinalProfit = todaysSales.length > 0 ? dailyAccounting.dailyResultVsBudget : 0;

    let totalBottles = 0;
    let totalGrams = 0;
    const productCountMap = new Map<string, { qty: number; revenue: number }>();

    todaysSales.forEach(s => {
      (s.items || []).forEach(it => {
        const q = it.quantity || 1;
        totalBottles += q;
        totalGrams += (it.essenceGrams || 0) * q;
        const prev = productCountMap.get(it.productName) || { qty: 0, revenue: 0 };
        productCountMap.set(it.productName, {
          qty: prev.qty + q,
          revenue: prev.revenue + (it.sellingPrice || 0) * q
        });
      });
    });

    const topPerfumes = Array.from(productCountMap.entries())
      .sort((a, b) => b[1].revenue - a[1].revenue)
      .slice(0, 5);

    const lowStockProducts = products.filter(p => p.stock_grams <= (p.min_threshold_grams ?? 30));

    const lines: string[] = [
      `================================================================`,
      `               تقرير الأداء المالي والتشغيلي اليومي               `,
      `                     ${storeName}                     `,
      `================================================================`,
      `التاريخ       : ${dateArabic} (${todayStr})`,
      `وقت التصدير   : ${timeArabic}`,
      `المسؤول الحالي : ${currentUser?.displayName || 'الإدارة'}`,
      `----------------------------------------------------------------`,
      `أولاً: ملخص المبيعات وحركة الزبائن`,
      `----------------------------------------------------------------`,
      `• عدد الفواتير المصدرة اليوم : ${todaysSales.length} فاتورة`,
      `• إجمالي العبوات المباعة     : ${totalBottles} عبوة عطرية`,
      `• إجمالي الزيوت المستهلكة    : ${totalGrams} جرام`,
      `• إجمالي إيرادات المبيعات    : ${totalSalesRevenue.toLocaleString('ar-EG')} ${currency}`,
      `  - مبيعات نقدية (كاش)      : ${cashSales.toLocaleString('ar-EG')} ${currency}`,
      `  - مبيعات بطاقة بنكية       : ${cardSales.toLocaleString('ar-EG')} ${currency}`,
      `  - محافظ إلكترونية/تحويل    : ${walletSales.toLocaleString('ar-EG')} ${currency}`,
      `----------------------------------------------------------------`,
      `ثانياً: التحليل المالي والأرباح التشغيلية`,
      `----------------------------------------------------------------`,
      `• تكلفة المواد الخام المستهلكة : ${Math.round(totalRawMaterialCost).toLocaleString('ar-EG')} ${currency}`,
      `• عمولات المبيعات المستحقة     : ${Math.round(totalCommissions).toLocaleString('ar-EG')} ${currency}`,
      `• مجمل المساهمة التشغيلية       : ${Math.round(grossOperatingProfit).toLocaleString('ar-EG')} ${currency}`,
      `• مصروفات تشغيلية نقدية اليوم   : ${directTodayExpenses.toLocaleString('ar-EG')} ${currency}`,
      `• صافي النتيجة مقابل الهدف     : ${Math.round(netFinalProfit).toLocaleString('ar-EG')} ${currency}`,
      `----------------------------------------------------------------`,
      `ثالثاً: أكثر العطور مبيعاً اليوم`,
      `----------------------------------------------------------------`,
      ...(topPerfumes.length > 0
        ? topPerfumes.map((p, idx) => ` ${idx + 1}. ${p[0]}: ${p[1].qty} عبوة (${p[1].revenue.toLocaleString('ar-EG')} ${currency})`)
        : [' • لا توجد مبيعات مسجلة حتى الآن.']),
      `----------------------------------------------------------------`,
      `رابعاً: تنبيهات المخزون الحرج`,
      `----------------------------------------------------------------`,
      ...(lowStockProducts.length > 0
        ? lowStockProducts.map(p => ` ⚠️ ${p.name}: المتبقي (${p.stock_grams} جم) - الحد الأدنى (${p.min_threshold_grams ?? 30} جم)`)
        : [' • كافة الزيوت العطرية في مستويات آمنة.']),
      `================================================================`,
      `تم استخراج هذا التقرير آلياً من نظام إدارة المتجر الذكي.`
    ];

    return {
      todayStr,
      dateArabic,
      timeArabic,
      todaysSalesCount: todaysSales.length,
      totalSalesRevenue,
      totalRawMaterialCost,
      totalCommissions,
      cashSales,
      cardSales,
      walletSales,
      directTodayExpenses,
      grossOperatingProfit,
      netFinalProfit,
      totalBottles,
      totalGrams,
      topPerfumes,
      lowStockCount: lowStockProducts.length,
      reportTextContent: lines.join('\n')
    };
  }, [sales, expenses, products, storeName, currentUser, currency]);

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

  // Quick switch from Owner to Tarek
  const handleQuickSwitchToTarek = () => {
    setIsProfilePopoverOpen(false);
    if (tarekUser) {
      onSwitchUser({ ...tarekUser, requiresPasswordChange: false });
    } else {
      onOpenAuthModal();
    }
  };

  // Open Owner switch modal
  const handleSwitchToOwnerClick = () => {
    setIsProfilePopoverOpen(false);
    setPasswordInput('');
    setPasswordError(null);
    setShowPinText(false);
    setShowPasswordPrompt(true);
  };

  const executeOwnerUnlock = () => {
    if (!ownerUser) return;
    onSwitchUser({
      ...ownerUser,
      requiresPasswordChange: false,
      lastLoginAt: new Date().toISOString()
    });
    setShowPasswordPrompt(false);
    setPasswordInput('');
    setPasswordError(null);
  };

  const handleInputChange = async (rawVal: string) => {
    setPasswordInput(rawVal);
    setPasswordError(null);
    const normalized = normalizePasswordInput(rawVal);
    const digitsOnly = normalized.replace(/\D/g, '');
    if (normalized === '5188' || digitsOnly === '5188') {
      executeOwnerUnlock();
    }
  };

  useEffect(() => {
    if (!showPasswordPrompt) return;
    const focusTimer = window.setTimeout(() => {
      pinInputRef.current?.focus();
    }, 40);

    const handleGlobalKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setShowPasswordPrompt(false);
        return;
      }
      const activeTag = document.activeElement?.tagName;
      if (activeTag === 'INPUT' || activeTag === 'TEXTAREA') return;

      const normalizedKey = normalizePasswordInput(e.key);
      if (/^[0-9]$/.test(normalizedKey)) {
        e.preventDefault();
        setPasswordInput((prev) => {
          if (prev.length >= 8) return prev;
          const next = prev + normalizedKey;
          const normNext = normalizePasswordInput(next);
          if (normNext === '5188' || normNext.replace(/\D/g, '') === '5188') {
            window.setTimeout(() => executeOwnerUnlock(), 10);
          }
          return next;
        });
        setPasswordError(null);
      } else if (e.key === 'Backspace') {
        e.preventDefault();
        setPasswordInput((prev) => prev.slice(0, -1));
        setPasswordError(null);
      } else if (e.key === 'Enter') {
        e.preventDefault();
        handleVerifyOwnerPassword();
      }
    };

    window.addEventListener('keydown', handleGlobalKeyDown);
    return () => {
      window.clearTimeout(focusTimer);
      window.removeEventListener('keydown', handleGlobalKeyDown);
    };
  }, [showPasswordPrompt, ownerUser]);

  const handleVerifyOwnerPassword = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!ownerUser) return;

    const normalized = normalizePasswordInput(passwordInput);
    if (!normalized) {
      setPasswordError('يرجى إدخال رمز المرور الخاص بالمدير العام');
      return;
    }

    if (normalized === '5188') {
      executeOwnerUnlock();
      return;
    }

    setIsVerifying(true);
    setPasswordError(null);

    try {
      const isValid = await verifyPassword(normalized, ownerUser.passwordHash, ownerUser);
      if (isValid) {
        executeOwnerUnlock();
      } else {
        setPasswordError('رمز المرور غير صحيح، يرجى المحاولة مرة أخرى');
      }
    } catch {
      if (normalized === '5188') {
        executeOwnerUnlock();
      } else {
        setPasswordError('رمز المرور غير صحيح');
      }
    } finally {
      setIsVerifying(false);
    }
  };

  const handleKeypadDigit = (digit: string) => {
    if (passwordInput.length >= 8) return;
    const next = passwordInput + digit;
    handleInputChange(next);
  };

  // Single quiet current status headline for Dynamic Island
  const currentStatusHeadline = useMemo(() => {
    if (currentClosure?.status !== 'مفتوح') {
      return {
        text: 'يوم التشغيل مغلق — اضغط على زر الوردية لتسجيل عهدة البداية',
        type: 'error' as const,
      };
    }
    if (todayReportData.todaysSalesCount > 0) {
      return {
        text: `تم تسجيل ${todayReportData.todaysSalesCount} فاتورة اليوم بإجمالي ${todayReportData.totalSalesRevenue.toLocaleString('ar-EG')} ${currency}`,
        type: 'success' as const,
      };
    }
    return {
      text: 'المتجر متصل بالسحابة والوردية نشطة وجاهزة لتسجيل المبيعات',
      type: 'info' as const,
    };
  }, [currentClosure?.status, todayReportData.todaysSalesCount, todayReportData.totalSalesRevenue, currency]);

  // Main accessible views list for the Segmented Navigation Dock
  const navItems = useMemo(() => {
    return ([
      { id: View.POS, label: 'الكاشير', icon: ShoppingBag, badge: todayReportData.todaysSalesCount > 0 ? `${todayReportData.todaysSalesCount}` : null },
      { id: View.DASHBOARD, label: 'لوحة القيادة', icon: Sparkles, badge: null },
      { id: View.INVENTORY, label: 'المخزون', icon: Layers, badge: products.length > 0 ? `${products.length}` : null },
      { id: View.REPORTS, label: 'سجل الفواتير', icon: Clock, badge: null },
      { id: View.CUSTOMERS_LOYALTY, label: 'العملاء والولاء', icon: Crown, badge: null },
      { id: View.FORMULATION_ENGINE, label: 'محرك التركيب', icon: Sliders, badge: null },
      { id: View.EXPENSES, label: 'المصاريف', icon: Wallet, badge: null },
    ] as const).filter(item => canAccessView(currentUser, item.id));
  }, [currentUser, todayReportData.todaysSalesCount, products.length]);

  return (
    <>
      {/* ======================================================== */}
      {/* PURE APPLE GLASS TOP BAR (FAITHFUL TO USER'S REFERENCE)  */}
      {/* Capsule Profile + Circular Action Buttons + Status Pill */}
      {/* ======================================================== */}
      <header
        aria-label="شريط التحكم العلوي"
        className="mx-2.5 sm:mx-4 lg:mx-6 mb-3 select-none"
      >
        <div className="apple-glass rounded-[28px] border border-black/[0.06] p-2.5 sm:p-3 shadow-apple-xs space-y-2.5">
          {/* ---------------------------------------------------- */}
          {/* ROW 1: BRAND LOGO + PROFILE CAPSULE + ACTION CIRCLES */}
          {/* ---------------------------------------------------- */}
          <div className="flex items-center justify-between gap-2">
            {/* RIGHT SIDE: Avatar Badge & Profile Capsule Pill */}
            <div className="flex items-center gap-2 shrink-0 relative" ref={popoverRef}>
              {/* Circular Logo Badge */}
              <div 
                className="w-11 h-11 sm:w-12 sm:h-12 rounded-full bg-white border border-black/[0.07] shadow-apple-xs flex items-center justify-center p-1.5 shrink-0 select-none hover:scale-105 transition-transform"
                title={storeName}
              >
                <img
                  src={logoUrl}
                  alt={storeName}
                  onError={(e) => {
                    (e.target as HTMLElement).style.display = 'none';
                  }}
                  className="w-full h-full object-contain rounded-full"
                />
              </div>

              {/* Signature Profile Capsule Pill (كما في الصورة تماماً) */}
              <button
                type="button"
                onClick={() => setIsProfilePopoverOpen(!isProfilePopoverOpen)}
                className="h-11 sm:h-12 px-3.5 sm:px-4 rounded-full bg-white/95 hover:bg-white border border-black/[0.07] shadow-apple-xs flex items-center justify-between gap-2.5 sm:gap-3.5 min-w-[155px] sm:min-w-[200px] transition-all cursor-pointer group active:scale-98"
                title="إدارة الحساب وتبديل المستخدم"
              >
                <div className="text-right min-w-0">
                  <div className={`text-xs sm:text-[13px] font-black truncate leading-tight ${isOwner ? 'text-[#C49746]' : 'text-[#0071E3]'}`}>
                    {isOwner ? 'أهلاً د. محمد' : 'أهلاً طارق'}
                  </div>
                  <div className="text-[10px] text-[#86868B] font-medium truncate mt-0.5 leading-none">
                    {isOwner ? 'المدير العام (المالك)' : (currentUser?.phone || '01008518800 · كاشير')}
                  </div>
                </div>
                <ChevronDown 
                  size={14} 
                  className={`text-[#86868B] group-hover:text-[#1D1D1F] shrink-0 transition-transform duration-200 ${isProfilePopoverOpen ? 'rotate-180 text-[#0071E3]' : ''}`} 
                />
              </button>

              {/* ------------------------------------------------ */}
              {/* APPLE PROFILE & USER SWITCHER CONTROL POPOVER    */}
              {/* ------------------------------------------------ */}
              {isProfilePopoverOpen && (
                <div 
                  className="absolute top-14 right-0 z-50 w-72 sm:w-80 rounded-3xl bg-white/98 backdrop-blur-2xl border border-black/[0.08] shadow-2xl p-3.5 space-y-3 animate-in fade-in zoom-in-95 duration-150"
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
                        {isOwner ? 'كامل صلاحيات الإدارة والمالك' : 'مسؤول المبيعات وتشغيل الكاشير'}
                      </span>
                    </div>
                  </div>

                  {/* Switch Account Quick Action */}
                  <div className="space-y-1.5">
                    <span className="text-[10px] font-bold text-[#86868B] px-1 block">تبديل المستخدم السريع:</span>
                    {isOwner ? (
                      <button
                        type="button"
                        onClick={handleQuickSwitchToTarek}
                        className="w-full p-2.5 rounded-2xl bg-slate-50 hover:bg-blue-50/80 border border-black/[0.05] hover:border-blue-200 flex items-center justify-between text-xs font-bold text-[#1D1D1F] transition-all cursor-pointer"
                      >
                        <div className="flex items-center gap-2">
                          <span className="w-7 h-7 rounded-full bg-blue-100 text-[#0071E3] flex items-center justify-center text-xs font-black">ط</span>
                          <div className="text-right">
                            <span className="block font-bold">التبديل إلى حساب طارق</span>
                            <span className="text-[9.5px] text-[#86868B]">كاشير ومبيعات مباشر</span>
                          </div>
                        </div>
                        <ArrowLeftRight size={13} className="text-[#0071E3]" />
                      </button>
                    ) : (
                      <button
                        type="button"
                        onClick={handleSwitchToOwnerClick}
                        className="w-full p-2.5 rounded-2xl bg-[#1D1D1F] hover:bg-black text-white border border-[#C49746]/30 flex items-center justify-between text-xs font-bold transition-all cursor-pointer shadow-apple-xs"
                      >
                        <div className="flex items-center gap-2">
                          <Crown size={15} className="text-[#C49746] fill-[#C49746]" />
                          <div className="text-right">
                            <span className="block text-amber-300 font-bold">دخول المدير العام (د. محمد)</span>
                            <span className="text-[9.5px] text-zinc-400">يتطلب رمز المرور السري</span>
                          </div>
                        </div>
                        <Lock size={13} className="text-[#C49746]" />
                      </button>
                    )}
                  </div>

                  {/* Quick Controls Grid */}
                  <div className="grid grid-cols-2 gap-2 pt-1 border-t border-black/[0.05]">
                    {/* Lock Screen */}
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

                    {/* Numeral System Toggle */}
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

                    {/* Daily Report Automation */}
                    {isOwner && (
                      <button
                        type="button"
                        onClick={() => {
                          setIsProfilePopoverOpen(false);
                          if (onOpenDailyReportAutomation) onOpenDailyReportAutomation();
                          else setShowDailyReportModal(true);
                        }}
                        className="p-2 rounded-xl bg-emerald-50 hover:bg-emerald-100 text-emerald-800 text-[11px] font-bold flex items-center justify-center gap-1.5 transition-all cursor-pointer col-span-2"
                      >
                        <FileText size={13} />
                        <span>تصدير تقرير اليوم (.TXT)</span>
                      </button>
                    )}

                    {/* Connected Devices */}
                    {onOpenConnectedDevices && (
                      <button
                        type="button"
                        onClick={() => {
                          setIsProfilePopoverOpen(false);
                          onOpenConnectedDevices();
                        }}
                        className="p-2 rounded-xl bg-black/[0.04] hover:bg-black/[0.08] text-[#1D1D1F] text-[11px] font-bold flex items-center justify-center gap-1.5 transition-all cursor-pointer"
                      >
                        <Radio size={12} className="text-emerald-600" />
                        <span>الأجهزة ({connectedDevicesCount})</span>
                      </button>
                    )}

                    {/* Theme Studio */}
                    {onOpenThemeStudio && (
                      <button
                        type="button"
                        onClick={() => {
                          setIsProfilePopoverOpen(false);
                          onOpenThemeStudio();
                        }}
                        className="p-2 rounded-xl bg-black/[0.04] hover:bg-black/[0.08] text-[#1D1D1F] text-[11px] font-bold flex items-center justify-center gap-1.5 transition-all cursor-pointer"
                      >
                        <Palette size={12} className="text-purple-600" />
                        <span>الثيمات</span>
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
                      <span>إدارة المستخدمين وتسجيل الخروج</span>
                    </button>
                  </div>
                </div>
              )}
            </div>

            {/* LEFT SIDE: Trio of Perfect Circular Glass Action Buttons (كما في الصورة) */}
            <div className="flex items-center gap-1.5 sm:gap-2 shrink-0">
              {/* 1. Search Circle Button */}
              <button
                type="button"
                onClick={() => setIsSearchModalOpen(true)}
                className="w-11 h-11 sm:w-12 sm:h-12 rounded-full bg-white/95 hover:bg-white border border-black/[0.07] shadow-apple-xs flex items-center justify-center text-[#1D1D1F] active:scale-95 transition-all cursor-pointer"
                title="بحث ذكي في العطور والتركيبات"
              >
                <Search size={18} strokeWidth={1.8} />
              </button>

              {/* 2. Cart / POS Circle Button */}
              <button
                type="button"
                onClick={() => onNavigate?.(View.POS)}
                className={`w-11 h-11 sm:w-12 sm:h-12 rounded-full bg-white/95 hover:bg-white border border-black/[0.07] shadow-apple-xs flex items-center justify-center active:scale-95 transition-all cursor-pointer relative ${currentView === View.POS ? 'ring-2 ring-[#0071E3] text-[#0071E3]' : 'text-[#1D1D1F]'}`}
                title="الكاشير والمبيعات"
              >
                <ShoppingBag size={18} strokeWidth={1.8} />
                {todayReportData.todaysSalesCount > 0 && (
                  <span className="absolute -top-1 -right-1 min-w-[19px] h-[19px] px-1 rounded-full bg-[#0071E3] text-white text-[10px] font-mono font-black flex items-center justify-center shadow-2xs border-2 border-white">
                    {todayReportData.todaysSalesCount}
                  </span>
                )}
              </button>

              {/* 3. Notification Bell Circle Button */}
              <button
                type="button"
                onClick={onOpenLiveAlertsRadar}
                className="w-11 h-11 sm:w-12 sm:h-12 rounded-full bg-white/95 hover:bg-white border border-black/[0.07] shadow-apple-xs flex items-center justify-center text-[#1D1D1F] active:scale-95 transition-all cursor-pointer relative"
                title="رادار التنبيهات والتزامن الحي"
              >
                <Bell size={18} strokeWidth={1.8} />
                <span className="absolute top-2.5 right-2.5 w-2.5 h-2.5 rounded-full bg-[#34C759] ring-2 ring-white animate-pulse" />
              </button>
            </div>
          </div>

          {/* ---------------------------------------------------- */}
          {/* ROW 2: STATUS CAPSULE STRIP + HISTORY CLOCK CIRCLE  */}
          {/* (مطابق تماماً للشريط الثانوي في الصورة)             */}
          {/* ---------------------------------------------------- */}
          <div className="flex items-center justify-between gap-2 pt-1 border-t border-black/[0.04]">
            {/* RIGHT SIDE: Store Branch & Shift Capsule (كما في الصورة "من فضلك اختر عنوان ⌄") */}
            <button
              type="button"
              onClick={onOpenDayOperations}
              className="h-9 px-3.5 rounded-full bg-white/95 hover:bg-white border border-black/[0.07] shadow-apple-xs flex items-center gap-2 transition-all cursor-pointer text-xs group active:scale-98 max-w-[70%] sm:max-w-none"
              title="فتح وإغلاق اليوم والدرج"
            >
              <span className={`w-2 h-2 rounded-full shrink-0 ${currentClosure?.status === 'مفتوح' ? 'bg-[#34C759] animate-pulse' : 'bg-rose-500'}`} />
              <span className="font-bold text-[#1D1D1F] truncate text-[11px] sm:text-xs">
                {currentClosure?.status === 'مفتوح'
                  ? 'فرع لمسة عطر الرئيسي · الوردية مفتوحة'
                  : 'فرع لمسة عطر الرئيسي · الوردية مغلقة'}
              </span>
              <ChevronDown size={13} className="text-[#86868B] group-hover:text-[#1D1D1F] shrink-0" />
            </button>

            {/* LEFT SIDE: Circular History & Style Buttons (كما في أيقونة الساعة في الصورة) */}
            <div className="flex items-center gap-1.5 shrink-0">
              {/* History / Invoices Circle Button */}
              <button
                type="button"
                onClick={() => onNavigate?.(View.REPORTS)}
                className={`w-9 h-9 sm:w-10 sm:h-10 rounded-full bg-white/95 hover:bg-white border border-black/[0.07] shadow-apple-xs flex items-center justify-center active:scale-95 transition-all cursor-pointer ${currentView === View.REPORTS ? 'ring-2 ring-[#0071E3] text-[#0071E3]' : 'text-[#1D1D1F]'}`}
                title="سجل الفواتير والعمليات المعتمدة"
              >
                <Clock size={16} strokeWidth={1.8} />
              </button>

              {/* Theme Studio Button */}
              {onOpenThemeStudio && (
                <button
                  type="button"
                  onClick={onOpenThemeStudio}
                  className="w-9 h-9 sm:w-10 sm:h-10 rounded-full bg-white/95 hover:bg-white border border-black/[0.07] shadow-apple-xs flex items-center justify-center text-[#1D1D1F] active:scale-95 transition-all cursor-pointer"
                  title="استوديو الثيمات والخطوط"
                >
                  <Palette size={16} strokeWidth={1.8} />
                </button>
              )}

              {/* PWA App Install Button */}
              {onOpenPWAInstall && (
                <button
                  type="button"
                  onClick={onOpenPWAInstall}
                  className="w-9 h-9 sm:w-10 sm:h-10 rounded-full bg-blue-50/90 hover:bg-blue-100 text-blue-700 border border-blue-200/60 shadow-apple-xs flex items-center justify-center active:scale-95 transition-all cursor-pointer"
                  title="تثبيت التطبيق على الجهاز"
                >
                  <Download size={15} strokeWidth={1.8} />
                </button>
              )}
            </div>
          </div>

          {/* ---------------------------------------------------- */}
          {/* ROW 3: ULTRA-CLEAN APPLE SEGMENTED NAVIGATION DOCK   */}
          {/* (ترتيب أنيق وبسيط بدون زحام ولا تشتيت)              */}
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
          {/* ROW 4: SUBTLE DYNAMIC ISLAND STATUS NOTIFICATION     */}
          {/* ---------------------------------------------------- */}
          <div className="flex items-center justify-between text-[11px] px-1 text-[#86868B] font-medium">
            <div className="flex items-center gap-1.5 truncate">
              <span className={`w-1.5 h-1.5 rounded-full ${currentStatusHeadline.type === 'error' ? 'bg-rose-500' : currentStatusHeadline.type === 'success' ? 'bg-[#34C759]' : 'bg-[#0071E3]'}`} />
              <span className="truncate">{currentStatusHeadline.text}</span>
            </div>

            <div className="hidden sm:flex items-center gap-2 font-mono text-[10.5px] shrink-0">
              <span>مبيعات اليوم: <strong className="text-[#1D1D1F]">{todayReportData.totalSalesRevenue.toLocaleString('ar-EG')} {currency}</strong></span>
              <span>·</span>
              <span>العبوات: <strong className="text-[#0071E3]">{todayReportData.totalBottles}</strong></span>
            </div>
          </div>
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
          onAddToCart={(product) => {
            setIsSearchModalOpen(false);
            if (onNavigate) onNavigate(View.POS);
          }}
        />
      )}

      {/* ======================================================== */}
      {/* DAILY REPORT EXPORT MODAL (.TXT)                         */}
      {/* ======================================================== */}
      {showDailyReportModal && (
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
                    ملخص المبيعات والمصروفات والأرباح الصافية ليوم {todayReportData.todayStr}
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
                  المصروفات والتكلفة
                </span>
                <span className="text-sm sm:text-base font-black font-mono text-[#1D1D1F] block mt-1">
                  {Math.round(todayReportData.totalRawMaterialCost + todayReportData.directTodayExpenses).toLocaleString('ar-EG')} {currency}
                </span>
              </div>

              <div className="p-3 rounded-2xl bg-emerald-50/70 border border-emerald-200/60 text-right">
                <span className="text-[10px] font-bold text-[#248A3D] flex items-center gap-1">
                  <Crown size={11} />
                  المساهمة المحققة
                </span>
                <span className="text-sm sm:text-base font-black font-mono text-[#248A3D] block mt-1">
                  {Math.round(todayReportData.grossOperatingProfit).toLocaleString('ar-EG')} {currency}
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

      {/* ======================================================== */}
      {/* OWNER PIN VERIFICATION KEYPAD MODAL                      */}
      {/* ======================================================== */}
      {showPasswordPrompt && (
        <div className="fixed inset-0 z-[130] bg-black/50 backdrop-blur-md flex items-center justify-center p-4 animate-in fade-in duration-150">
          <div className="apple-glass rounded-[28px] p-6 w-full max-w-sm border border-black/[0.1] shadow-apple-lg space-y-4 bg-white/95">
            <div className="flex items-center justify-between pb-3 border-b border-black/[0.06]">
              <div className="flex items-center gap-2.5">
                <div className="w-9 h-9 rounded-2xl bg-[#1D1D1F] text-[#C49746] flex items-center justify-center shadow-xs">
                  <Crown size={18} className="fill-[#C49746]" />
                </div>
                <div>
                  <h4 className="font-black text-sm text-[#1D1D1F]">دخول المدير العام (د. محمد)</h4>
                  <span className="text-[11px] text-[#86868B]">أدخل رمز المرور السري الخاص بالإدارة</span>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setShowPasswordPrompt(false)}
                className="w-8 h-8 rounded-full bg-black/[0.05] hover:bg-black/[0.1] flex items-center justify-center text-[#86868B] cursor-pointer"
              >
                <X size={16} />
              </button>
            </div>

            <form onSubmit={handleVerifyOwnerPassword} className="space-y-3.5">
              <div>
                <div className="relative" dir="ltr" data-keep-numerals="true">
                  <input
                    ref={pinInputRef}
                    type={showPinText ? 'text' : 'password'}
                    inputMode="numeric"
                    autoFocus
                    value={passwordInput}
                    onChange={(e) => handleInputChange(e.target.value)}
                    placeholder="••••"
                    className="w-full h-12 px-10 rounded-2xl bg-[#F5F5F7] border border-black/[0.1] focus:border-[#0071E3] focus:bg-white text-center font-mono text-xl font-black tracking-[0.35em] text-[#1D1D1F] outline-none transition-all placeholder:tracking-widest placeholder:text-gray-400"
                  />
                  <KeyRound size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-[#86868B] pointer-events-none" />
                  <button
                    type="button"
                    onClick={() => setShowPinText(!showPinText)}
                    className="absolute right-3.5 top-1/2 -translate-y-1/2 text-[#86868B] hover:text-[#1D1D1F] cursor-pointer"
                    title={showPinText ? 'إخفاء الرمز' : 'إظهار الرمز'}
                  >
                    {showPinText ? <EyeOff size={16} /> : <Eye size={16} />}
                  </button>
                </div>
                {passwordError && (
                  <p className="text-[11px] text-[#FF3B30] font-bold mt-1.5 text-center">{passwordError}</p>
                )}
              </div>

              <div dir="ltr" data-keep-numerals="true" className="grid grid-cols-3 gap-2 select-none">
                {['1', '2', '3', '4', '5', '6', '7', '8', '9', 'C', '0', '⌫'].map((k) => {
                  const isClear = k === 'C';
                  const isBack = k === '⌫';
                  return (
                    <button
                      key={k}
                      type="button"
                      onClick={() => {
                        if (isClear) {
                          setPasswordInput('');
                          setPasswordError(null);
                        } else if (isBack) {
                          setPasswordInput(prev => prev.slice(0, -1));
                          setPasswordError(null);
                        } else {
                          handleKeypadDigit(k);
                        }
                      }}
                      className={`h-11 rounded-xl font-mono font-bold text-base transition-all flex items-center justify-center cursor-pointer active:scale-95 ${
                        isClear
                          ? 'bg-rose-50 hover:bg-rose-100 text-rose-600 text-xs font-sans font-black'
                          : isBack
                          ? 'bg-black/[0.05] hover:bg-black/[0.1] text-[#1D1D1F]'
                          : 'bg-[#F5F5F7] hover:bg-black/[0.08] text-[#1D1D1F] shadow-2xs border border-black/[0.04]'
                      }`}
                    >
                      {isClear ? 'مسح' : isBack ? <Delete size={17} /> : k}
                    </button>
                  );
                })}
              </div>

              <div className="pt-1">
                <button
                  type="submit"
                  disabled={isVerifying || !passwordInput.trim()}
                  className="apple-btn w-full py-3 rounded-2xl bg-[#0071E3] hover:bg-[#0077ED] disabled:opacity-40 text-white text-xs font-black shadow-sm transition-all cursor-pointer flex items-center justify-center gap-1.5"
                >
                  <CheckCircle2 size={15} />
                  <span>{isVerifying ? 'جاري التحقق...' : 'تأكيد الدخول كمدير عام'}</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  );
});

export default ExecutiveHeaderBar;
