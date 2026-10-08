import React, { useState, useMemo, useEffect, useRef } from 'react';
import { AppUser, Sale, Expense, StoreSettings, Product, DailyClosure, View, DEFAULT_USERS, OWNER_FULL_PERMISSIONS, TAREK_OPERATIONAL_PERMISSIONS, resolveActiveAppTheme, isActualPaidOperationalExpense, isLiveProductionSale, calculateDailyAccountingSeparation } from '../types';
import { AppleNotificationItem } from './AppleTopNotificationBanner';
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
  BellRing,
  Copy,
  Check,
  Eye,
  EyeOff,
  Delete,
  TrendingUp,
  ShoppingBag,
  Wallet,
  Pause,
  Play,
  AlertCircle,
  Info,
  Palette,
  Radio
} from 'lucide-react';
import { verifyPassword, normalizePasswordInput, canAccessView } from '../services/authService';

export type TickerNotificationKind = 'error' | 'success' | 'info';

export interface SmartTopTickerMessage {
  id: string;
  type: TickerNotificationKind;
  tag: string;
  text: string;
}

/**
 * Automatically selects text, background, border, and badge colors based on notification type:
 * - 'error'   -> Red (أحمر للأخطاء والتنبيهات الحرجة)
 * - 'success' -> Green (أخضر للنجاح والإنجازات)
 * - 'info'    -> Blue (أزرق للمعلومات والتوجيهات)
 */
export const getTickerNotificationTheme = (type: TickerNotificationKind) => {
  switch (type) {
    case 'error':
      return {
        containerBg: 'bg-rose-500/12 border-rose-500/30 hover:bg-rose-500/18',
        badgeBg: 'bg-[#FF3B30] text-white',
        textColor: 'text-rose-800 font-bold',
        dotColor: 'bg-[#FF3B30]',
        icon: <AlertCircle size={12} className="text-[#FF3B30] shrink-0" />,
      };
    case 'success':
      return {
        containerBg: 'bg-emerald-500/12 border-emerald-500/30 hover:bg-emerald-500/18',
        badgeBg: 'bg-[#248A3D] text-white',
        textColor: 'text-emerald-900 font-bold',
        dotColor: 'bg-[#34C759]',
        icon: <CheckCircle2 size={12} className="text-[#248A3D] shrink-0" />,
      };
    case 'info':
    default:
      return {
        containerBg: 'bg-[#0071E3]/10 border-[#0071E3]/25 hover:bg-[#0071E3]/15',
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
  const activeTheme = useMemo(() => resolveActiveAppTheme(settings), [settings]);
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

  const [isTickerPaused, setIsTickerPaused] = useState(false);
  const [showPasswordPrompt, setShowPasswordPrompt] = useState(false);
  const [passwordInput, setPasswordInput] = useState('');
  const [showPinText, setShowPinText] = useState(false);
  const [passwordError, setPasswordError] = useState<string | null>(null);
  const [isVerifying, setIsVerifying] = useState(false);

  // Daily Report Modal & Copy state
  const [showDailyReportModal, setShowDailyReportModal] = useState(false);
  const [copiedReport, setCopiedReport] = useState(false);

  const currency = settings?.currency || 'ج.م';
  const storeName = settings?.storeName || 'لَمْسَةُ عِطْر';

  // Compute today's financial & operational metrics for the Daily Report
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
    // §1, §2, §36, §93: فقط المصروفات النقدية اليومية المدفوعة فعلياً من الدرج (دون خلط موازنة الـ 15,000 الشهرية أبداً)
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
    const totalExpensesToday = directTodayExpenses;
    // لا تظهر نتائج مالية إلا من البيانات الفعلية المسجلة
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

    // Build structured, clean Arabic text file content
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
      `  - مبيعات محفظة إلكترونية   : ${walletSales.toLocaleString('ar-EG')} ${currency}`,
      `----------------------------------------------------------------`,
      `ثانياً: ملخص التكاليف والمصروفات والمخصص التخطيطي (§37 & §93)`,
      `----------------------------------------------------------------`,
      `• تكلفة الخامات والزجاجات    : ${Math.round(totalRawMaterialCost).toLocaleString('ar-EG')} ${currency}`,
      `• عمولات المبيعات المستحقة   : ${Math.round(totalCommissions).toLocaleString('ar-EG')} ${currency}`,
      `• مصروفات نقدية بالدرج اليوم : ${directTodayExpenses.toLocaleString('ar-EG')} ${currency} (${todaysExpenses.length} حركة)`,
      `• المخصص التخطيطي لليوم      : ${dailyFixedShare.toLocaleString('ar-EG')} ${currency} (من موازنة 15,000 الشهرية / 25 يوم)`,
      `• المبلغ الممول فعلياً اليوم : ${dailyAccounting.fundedAllocationToday.toLocaleString('ar-EG')} ${currency}`,
      `• عجز تمويل مخصص اليوم       : ${dailyAccounting.unfundedAllocationDeficitToday.toLocaleString('ar-EG')} ${currency}`,
      `----------------------------------------------------------------`,
      `ثالثاً: المساهمة ونتيجة التشغيل وفق الموازنة`,
      `----------------------------------------------------------------`,
      ...(todaysSales.length === 0
        ? [
            `• الحالة اليومية              : لا توجد بيانات مبيعات فعلية مسجلة لهذا اليوم`,
            `• ملاحظة محاسبية              : المخصص التخطيطي اليومي (600 ج) ليس مصروفاً نقدياً يومياً ولا يسجل عجزاً دون معاملات فعلية.`,
          ]
        : [
            `• المساهمة (المبيعات ← التكلفة ← العمولة) : ${Math.round(grossOperatingProfit).toLocaleString('ar-EG')} ${currency}`,
            `• نتيجة التشغيل وفق الموازنة   : ${netFinalProfit >= 0 ? '+' : ''}${Math.round(netFinalProfit).toLocaleString('ar-EG')} ${currency} (${dailyAccounting.resultStatusBadgeAr})`,
            `• نسبة المساهمة للمبيعات     : ${totalSalesRevenue > 0 ? Math.round((grossOperatingProfit / totalSalesRevenue) * 100) : 0}%`,
          ]),
      `----------------------------------------------------------------`,
      `رابعاً: أكثر العطور مبيعاً اليوم`,
      `----------------------------------------------------------------`,
      ...(topPerfumes.length > 0
        ? topPerfumes.map(([name, info], i) => `${i + 1}. ${name} — ${info.qty} عبوة (${info.revenue.toLocaleString('ar-EG')} ${currency})`)
        : ['• لم يتم تسجيل مبيعات أصناف حتى الآن اليوم.']),
      `----------------------------------------------------------------`,
      `خامساً: تنبيهات المخزون والنواقص الحرجة (${lowStockProducts.length} صنف)`,
      `----------------------------------------------------------------`,
      ...(lowStockProducts.length > 0
        ? lowStockProducts.slice(0, 8).map(p => `• ${p.name} (${p.type}): المتبقي ${p.stock_grams} جم`)
        : ['• جميع الزيوت العطرية في مستوى آمن ومستقر.']),
      `================================================================`,
      `   تم إنشاء هذا التقرير آلياً عبر نظام ${storeName} الذكي   `,
      `================================================================`,
    ];

    return {
      todayStr,
      todaysSalesCount: todaysSales.length,
      totalBottles,
      totalSalesRevenue,
      totalRawMaterialCost,
      directTodayExpenses,
      totalExpensesToday,
      grossOperatingProfit,
      netFinalProfit,
      cashSales,
      cardSales,
      walletSales,
      lowStockCount: lowStockProducts.length,
      reportText: lines.join('\n'),
    };
  }, [sales, expenses, settings, products, currentUser, currency, storeName]);

  // Download .TXT file helper
  const handleDownloadTxtReport = () => {
    const blob = new Blob(['\uFEFF' + todayReportData.reportText], {
      type: 'text/plain;charset=utf-8;'
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `تقرير-اليوم-${todayReportData.todayStr}.txt`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);

    if (onSendSmartNotification) {
      onSendSmartNotification(
        `تم تحميل تقرير اليوم (${todayReportData.todayStr})`,
        `المبيعات: ${todayReportData.totalSalesRevenue.toLocaleString('ar-EG')} ${currency} · المصروفات: ${todayReportData.directTodayExpenses.toLocaleString('ar-EG')} ${currency} · الصافي: +${Math.round(todayReportData.netFinalProfit).toLocaleString('ar-EG')} ${currency}`,
        'تقرير نصي .TXT'
      );
    }
  };

  // Send as Smart Top Notification immediately
  const handleSendSmartReportNotification = () => {
    if (onSendSmartNotification) {
      onSendSmartNotification(
        `ملخص تقرير اليوم (${todayReportData.todaysSalesCount} فاتورة)`,
        `إجمالي المبيعات: ${todayReportData.totalSalesRevenue.toLocaleString('ar-EG')} ${currency} | المصروفات: ${todayReportData.directTodayExpenses.toLocaleString('ar-EG')} ${currency} | صافي الربح: +${Math.round(todayReportData.netFinalProfit).toLocaleString('ar-EG')} ${currency}`,
        'إشعار إداري ذكي'
      );
    }
    setShowDailyReportModal(false);
  };

  // Copy Report Text
  const handleCopyReportText = () => {
    navigator.clipboard.writeText(todayReportData.reportText);
    setCopiedReport(true);
    setTimeout(() => setCopiedReport(false), 2000);
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
    if (tarekUser) {
      onSwitchUser({ ...tarekUser, requiresPasswordChange: false });
    } else {
      onOpenAuthModal();
    }
  };

  // Open Owner switch modal
  const handleSwitchToOwnerClick = () => {
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

  // Background verification without exposing the password on UI
  const handleInputChange = async (rawVal: string) => {
    setPasswordInput(rawVal);
    setPasswordError(null);
    const normalized = normalizePasswordInput(rawVal);
    const digitsOnly = normalized.replace(/\D/g, '');
    // Secret background auto-unlock when owner PIN is typed
    if (normalized === '5188' || digitsOnly === '5188') {
      executeOwnerUnlock();
    }
  };

  // Global keyboard listener when showPasswordPrompt is active so typing 5188 works even without input focus
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
    } catch (err) {
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

  // Build real-time semantic notifications for the unified top ticker across all pages
  const smartTickerMessages = useMemo<SmartTopTickerMessage[]>(() => {
    const list: SmartTopTickerMessage[] = [];

    // 1. Include any active/recent top notifications mapped to semantic (error | success | info)
    topNotifications.forEach((n) => {
      const mappedType: TickerNotificationKind =
        n.type === 'stock' || n.type === 'warning'
          ? 'error'
          : n.type === 'sale' || n.type === 'auth'
          ? 'success'
          : 'info';
      list.push({
        id: `live-notif-${n.id}`,
        type: mappedType,
        tag: n.badgeText || (mappedType === 'error' ? 'تنبيه' : mappedType === 'success' ? 'نجاح' : 'معلومة'),
        text: n.subtitle ? `${n.title} — ${n.subtitle}` : n.title,
      });
    });

    // 2. Shift & Daily Closure Status
    const isShiftOpen = currentClosure?.status === 'مفتوح';
    if (!isShiftOpen) {
      list.push({
        id: 'shift-closed-error',
        type: 'error',
        tag: 'تنبيه الوردية',
        text: 'يوم التشغيل مغلق حالياً — اضغط «الدرج» لفتح الوردية وتفعيل تسجيل المبيعات.',
      });
    } else {
      list.push({
        id: 'shift-open-success',
        type: 'success',
        tag: 'الوردية نشطة',
        text: 'الوردية مفتوحة ومتصلة بالسحابة — يتم حفظ الفواتير وحركة الجرامات لحظياً.',
      });
    }

    // 3. Today's Sales Achievement (Profit shown only to Owner)
    if (todayReportData.todaysSalesCount > 0) {
      list.push({
        id: 'sales-today-success',
        type: 'success',
        tag: 'إنجاز اليوم',
        text: isOwner
          ? `تم إصدار (${todayReportData.todaysSalesCount}) فاتورة اليوم بإجمالي ${todayReportData.totalSalesRevenue.toLocaleString('ar-EG')} ${currency} وصافي ربح +${Math.round(todayReportData.netFinalProfit).toLocaleString('ar-EG')} ${currency}.`
          : `تم إصدار (${todayReportData.todaysSalesCount}) فاتورة اليوم (${todayReportData.totalBottles} عبوة) بإجمالي مبيعات ${todayReportData.totalSalesRevenue.toLocaleString('ar-EG')} ${currency}.`,
      });
    } else {
      list.push({
        id: 'sales-start-info',
        type: 'info',
        tag: 'معلومة الكاشير',
        text: 'لإصدار فاتورة سريعة: اختر العطر وحدد الحجم المطلوب بحرية تامة أو خصص الجرامات والتركيز.',
      });
    }

    // 4. Stock & Shortages Alert
    if (todayReportData.lowStockCount > 0) {
      list.push({
        id: 'stock-shortage-error',
        type: 'error',
        tag: 'نواقص المخزون',
        text: `تنبيه مخزون: يوجد (${todayReportData.lowStockCount}) صنف عطري وصل للحد الحرج ويحتاج لمراجعة وطلب توريد.`,
      });
    } else {
      list.push({
        id: 'stock-safe-success',
        type: 'success',
        tag: 'استقرار المخزون',
        text: 'جميع الزيوت العطرية الأساسية متوفرة بمستويات آمنة ومستقرة في المخزون.',
      });
    }

    // 5. Smart Target & Sales Motivation Info
    const todayNetContrib = Math.max(0, todayReportData.grossOperatingProfit - todayReportData.totalCommissions);
    list.push({
      id: 'target-contrib-info',
      type: todayNetContrib >= 600 ? 'success' : 'info',
      tag: 'تحفيز المبيعات',
      text: isOwner
        ? `مساهمة اليوم المحققة: ${Math.round(todayNetContrib).toLocaleString('ar-EG')} ${currency} من تارجت 600 ${currency} (الهدف التطويري 1,000 ${currency}).`
        : `عبوات اليوم المباعة: (${todayReportData.totalBottles}) عبوة — بيع أكثر من 10 عبوات يرفع عمولتك الفورية من 5% إلى 7% على كافة المبيعات.`,
    });

    if (isOwner) {
      list.push({
        id: 'daily-report-info',
        type: 'info',
        tag: 'إدارة ذكية',
        text: 'يمكنك تصدير ملخص المبيعات والأرباح اليومي كملف نصي (.TXT) في أي لحظة من زر «تقرير اليوم» بالأعلى.',
      });
    }

    if (connectedDevicesCount > 0) {
      list.push({
        id: 'connected-devices-sync-live',
        type: 'success',
        tag: 'تزامن حي 100%',
        text: `⚡ متصل الآن (${connectedDevicesCount}) أجهزة في الوقت الفعلي مع تحديث فوري لكافة المبيعات والمخزون والخزائن.`,
      });
    }

    return list;
  }, [topNotifications, currentClosure?.status, todayReportData, currency, settings?.loyaltyEnabled, isOwner, connectedDevicesCount]);

  const marqueeLoopMessages = useMemo(
    () => [...smartTickerMessages, ...smartTickerMessages],
    [smartTickerMessages]
  );

  return (
    <>
      {/* ======================================================== */}
      {/* UNIFIED SLEEK TOP BAR + SMART COLOR-CODED TICKER         */}
      {/* (Sits cleanly at the top of ALL pages without bloat)     */}
      {/* ======================================================== */}
      <aside
        aria-label="الشريط العلوي الموحد والإشعارات الذكية"
        className="mx-3 sm:mx-5 lg:mx-6 mb-2.5 animate-in fade-in duration-200"
      >
        <div className="apple-glass rounded-2xl border border-black/[0.07] px-2.5 py-1.5 shadow-apple-xs flex flex-wrap lg:flex-nowrap items-center justify-between gap-2 overflow-hidden">
          {/* Right: Compact Identity Chip (No bulky privilege explanation) + Ticker Pause/Play */}
          <div className="flex items-center gap-1.5 shrink-0 z-10">
            {isOwner ? (
              <div
                className="px-2.5 py-1 rounded-xl bg-[#1D1D1F] text-white border border-[#C49746]/40 flex items-center gap-1.5 shadow-2xs"
                title="المدير العام"
              >
                <Crown size={13} className="text-[#C49746] fill-[#C49746] shrink-0" />
                <span className="text-[11px] font-black tracking-tight text-amber-300 whitespace-nowrap">
                  {currentUser?.displayName?.replace(/\(.*?\)/g, '').trim() || 'د. محمد'}
                </span>
                <span className="w-1.5 h-1.5 rounded-full bg-[#34C759] shrink-0" />
              </div>
            ) : (
              <div
                className="px-2.5 py-1 rounded-xl bg-[#0071E3]/10 text-[#0071E3] border border-[#0071E3]/25 flex items-center gap-1.5"
                title="مدير المبيعات"
              >
                <span className="text-xs leading-none shrink-0">💼</span>
                <span className="text-[11px] font-black tracking-tight text-[#1D1D1F] whitespace-nowrap">
                  {currentUser?.displayName?.replace(/\(.*?\)/g, '').trim() || 'طارق'}
                </span>
                <span className="w-1.5 h-1.5 rounded-full bg-[#0071E3] shrink-0" />
              </div>
            )}

            <button
              type="button"
              onClick={() => setIsTickerPaused(!isTickerPaused)}
              className="w-6 h-6 rounded-lg bg-black/[0.04] hover:bg-black/[0.08] text-[#636366] hover:text-[#1D1D1F] flex items-center justify-center transition-colors cursor-pointer shrink-0"
              title={isTickerPaused ? 'تشغيل حركة شريط الإشعارات' : 'إيقاف مؤقت للقراءة'}
            >
              {isTickerPaused ? <Play size={11} className="fill-current" /> : <Pause size={11} />}
            </button>
          </div>

          {/* Center: Smart Notification Ticker (.apple-ticker-track-right) with Automatic Semantic Colors */}
          <div
            dir="ltr"
            className="order-3 lg:order-2 w-full lg:w-auto lg:flex-1 min-w-0 overflow-hidden relative apple-ticker-mask py-0.5 select-none border-t lg:border-t-0 border-black/[0.04] pt-1.5 lg:pt-0"
          >
            <div className={`apple-ticker-track-right items-center ${isTickerPaused ? 'apple-ticker-paused' : ''}`}>
              {[0, 1].map((loopIdx) => (
                <div
                  key={loopIdx}
                  className="flex items-center shrink-0"
                  aria-hidden={loopIdx === 1}
                >
                  {smartTickerMessages.map((msg) => {
                    const theme = getTickerNotificationTheme(msg.type);
                    return (
                      <div
                        key={`${loopIdx}-${msg.id}`}
                        dir="rtl"
                        className={`inline-flex items-center gap-1.5 px-2.5 py-1 mx-1.5 rounded-xl border transition-colors shrink-0 ${theme.containerBg}`}
                      >
                        {theme.icon}
                        <span className={`px-1.5 py-0.5 rounded-md text-[10px] font-black whitespace-nowrap ${theme.badgeBg}`}>
                          {msg.tag}
                        </span>
                        <span className={`text-[11px] whitespace-nowrap tracking-tight ${theme.textColor}`}>
                          {msg.text}
                        </span>
                      </div>
                    );
                  })}
                </div>
              ))}
            </div>
          </div>

          {/* Left: Sleek Compact Quick Controls */}
          <div className="order-2 lg:order-3 flex items-center gap-1.5 shrink-0 z-10">
            {onUpdateSettings && (
              <button
                type="button"
                data-keep-numerals="true"
                onClick={() => {
                  const nextNumeral = settings?.siteNumeralSystem === 'ar' ? 'en' : 'ar';
                  onUpdateSettings((prev) => ({
                    ...prev,
                    siteNumeralSystem: nextNumeral,
                  }));
                  if (onSendSmartNotification) {
                    onSendSmartNotification(
                      nextNumeral === 'ar'
                        ? 'تم تفعيل الأرقام العربية (٠١٢٣٤٥٦٧٨٩) في كامل الموقع'
                        : 'تم تفعيل الأرقام الإنجليزية (0123456789) في كامل الموقع',
                      'يمكنك التبديل في أي لحظة أو تخصيص الخطوط والألوان من استوديو الثيمات',
                      nextNumeral === 'ar' ? '١٢٣ عربي' : '123 EN'
                    );
                  }
                }}
                className="apple-btn px-2 py-1 rounded-xl bg-black/[0.04] hover:bg-black/[0.08] text-[#1D1D1F] border border-black/[0.08] text-[10px] font-mono font-black flex items-center gap-1 transition-all cursor-pointer whitespace-nowrap"
                title="تبديل فوري للغة الأرقام في كامل الموقع (عربية ٠١٢٣ / إنجليزية 0123)"
              >
                <span className={settings?.siteNumeralSystem === 'ar' ? 'text-[#0071E3]' : 'opacity-50'}>
                  ١٢٣
                </span>
                <span className="opacity-30">/</span>
                <span className={settings?.siteNumeralSystem !== 'ar' ? 'text-[#0071E3]' : 'opacity-50'}>
                  123
                </span>
              </button>
            )}

            {onOpenThemeStudio && (
              <button
                type="button"
                onClick={onOpenThemeStudio}
                className="apple-btn px-2.5 py-1 rounded-xl bg-black/[0.04] hover:bg-black/[0.08] text-[#1D1D1F] border border-black/[0.08] text-[11px] font-black flex items-center gap-1.5 transition-all cursor-pointer whitespace-nowrap"
                title={`تحكم في الخطوط والألوان وحجم الخط والثيمات — النشط حالياً: ${activeTheme.nameAr}`}
              >
                <span
                  className="w-2.5 h-2.5 rounded-full shrink-0 border border-white/60 shadow-2xs"
                  style={{ backgroundColor: activeTheme.colors.primaryAccent }}
                />
                <Palette size={12} style={{ color: activeTheme.colors.primaryAccent }} />
                <span>الخطوط والثيمات</span>
              </button>
            )}

            {onOpenLiveAlertsRadar && (
              <button
                type="button"
                onClick={onOpenLiveAlertsRadar}
                className="apple-btn px-2.5 py-1 rounded-xl bg-amber-500/12 hover:bg-amber-500/22 text-amber-950 border border-amber-500/35 text-[11px] font-black flex items-center gap-1.5 transition-all cursor-pointer whitespace-nowrap shadow-2xs"
                title="رادار تنبيهات المالك المباشرة (تزامن المبيعات في الوقت الفعلي مع اللاب توب والموبايل)"
              >
                <Bell size={12} className="text-amber-600 fill-amber-500 animate-pulse" />
                <span className="hidden sm:inline">رادار التنبيهات</span>
                <span className="text-[10px] px-1 py-0.2 rounded bg-emerald-500/20 text-emerald-800 font-mono font-bold">LIVE</span>
              </button>
            )}

            {onOpenConnectedDevices && (
              <button
                type="button"
                onClick={onOpenConnectedDevices}
                className="apple-btn px-2.5 py-1 rounded-xl bg-emerald-500/12 hover:bg-emerald-500/22 text-emerald-950 border border-emerald-500/35 text-[11px] font-black flex items-center gap-1.5 transition-all cursor-pointer whitespace-nowrap shadow-2xs"
                title="رادار الأجهزة المتصلة والتزامن اللحظي المباشر بين الهواتف والكمبيوتر"
              >
                <Radio size={12} className="text-emerald-600 animate-pulse" />
                <span className="hidden sm:inline">الأجهزة المتصلة</span>
                <span className="text-[10px] px-1.5 py-0.2 rounded bg-emerald-500/20 text-emerald-800 font-mono font-bold flex items-center gap-1">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-ping" />
                  <span>{connectedDevicesCount}</span>
                </span>
              </button>
            )}

            {onOpenPWAInstall && (
              <button
                type="button"
                onClick={onOpenPWAInstall}
                className="apple-btn px-2.5 py-1 rounded-xl bg-blue-500/12 hover:bg-blue-500/22 text-blue-950 border border-blue-500/35 text-[11px] font-black flex items-center gap-1.5 transition-all cursor-pointer whitespace-nowrap shadow-2xs"
                title="تثبيت لمسة عطر كتطبيق مستقل على الموبايل واللاب توب والكمبيوتر"
              >
                <Download size={12} className="text-blue-600" />
                <span className="hidden sm:inline">تثبيت التطبيق</span>
                <span className="text-[10px] px-1 py-0.2 rounded bg-blue-500/20 text-blue-800 font-mono font-bold">APP</span>
              </button>
            )}

            {isOwner && (
              <button
                type="button"
                onClick={() => {
                  if (onOpenDailyReportAutomation) {
                    onOpenDailyReportAutomation();
                  } else {
                    setShowDailyReportModal(true);
                  }
                }}
                className="apple-btn px-2.5 py-1 rounded-xl bg-emerald-500/12 hover:bg-emerald-500/20 text-emerald-800 border border-emerald-500/25 text-[11px] font-black flex items-center gap-1 transition-all cursor-pointer whitespace-nowrap"
                title="أتمتة تقرير إغلاق اليوم (12 منتصف الليل) وإرساله عبر Gmail و Google Forms"
              >
                <FileText size={12} className="text-emerald-700" />
                <span className="hidden sm:inline">أتمتة تقرير اليوم</span>
              </button>
            )}

            <button
              type="button"
              onClick={onOpenDayOperations}
              className="apple-btn px-2.5 py-1 rounded-xl bg-black/[0.04] hover:bg-black/[0.08] text-[#1D1D1F] border border-black/[0.06] text-[11px] font-bold flex items-center gap-1 transition-all cursor-pointer whitespace-nowrap"
              title="فتح وإغلاق اليوم والدرج"
            >
              {currentClosure?.status === 'مفتوح' ? (
                <Unlock size={12} className="text-emerald-600" />
              ) : (
                <Lock size={12} className="text-rose-600" />
              )}
              <span>الدرج</span>
            </button>

            {onLockScreen && (
              <button
                type="button"
                onClick={onLockScreen}
                className="apple-btn px-2 py-1 rounded-xl bg-black/[0.04] hover:bg-black/[0.08] text-[#1D1D1F] border border-black/[0.06] text-[11px] font-bold flex items-center gap-1 transition-all cursor-pointer whitespace-nowrap"
                title="قفل الشاشة فوراً"
              >
                <Lock size={12} className="text-amber-500" />
                <span className="hidden sm:inline">قفل</span>
              </button>
            )}

            {isOwner ? (
              <button
                type="button"
                onClick={handleQuickSwitchToTarek}
                className="apple-btn px-2.5 py-1 rounded-xl bg-[#C49746]/20 hover:bg-[#C49746]/30 text-[#6E470B] border border-[#C49746]/35 text-[11px] font-black flex items-center gap-1 transition-all cursor-pointer whitespace-nowrap"
                title="تحويل سريع لحساب طارق"
              >
                <ArrowLeftRight size={11} strokeWidth={2.5} />
                <span>حساب طارق</span>
              </button>
            ) : (
              <button
                type="button"
                onClick={handleSwitchToOwnerClick}
                className="apple-btn px-2.5 py-1 rounded-xl bg-[#1D1D1F] hover:bg-black text-amber-300 text-[11px] font-black flex items-center gap-1 shadow-2xs transition-all cursor-pointer whitespace-nowrap"
                title="دخول المدير العام (د. محمد)"
              >
                <Crown size={12} className="text-[#C49746] fill-[#C49746]" />
                <span>د. محمد</span>
              </button>
            )}
          </div>
        </div>

        {/* Store Manager Quick Workspace Navigation Dock (1-Click Access Across All Core Operations) */}
        {onNavigate && (
          <div className="mt-2 px-2.5 py-1.5 rounded-2xl bg-white/95 border border-slate-200/85 shadow-2xs flex items-center justify-between gap-2 overflow-x-auto scrollbar-none">
            <div className="flex items-center gap-1.5 shrink-0">
              {([
                { id: View.POS, label: '🛒 الكاشير والمبيعات', badge: `${todayReportData.todaysSalesCount} فاتورة` },
                { id: View.DASHBOARD, label: '📊 لوحة القيادة', badge: null },
                { id: View.INVENTORY, label: '📦 المخزون الخام', badge: `${products.length} صنف` },
                { id: View.REPORTS, label: '🧾 سجل الفواتير', badge: null },
                { id: View.CUSTOMERS_LOYALTY, label: '👥 العملاء والولاء', badge: null },
                { id: View.FORMULATION_ENGINE, label: '🧪 محرك التركيب', badge: null },
                { id: View.EXPENSES, label: '💸 المصاريف', badge: null },
              ] as const)
                .filter((navItem) => canAccessView(currentUser, navItem.id))
                .map((navItem) => {
                  const isActive = currentView === navItem.id;
                  return (
                    <button
                      key={navItem.id}
                      type="button"
                      onClick={() => onNavigate(navItem.id)}
                      className={`px-3 py-1.5 rounded-xl text-[11px] font-bold transition-all flex items-center gap-1.5 cursor-pointer whitespace-nowrap shrink-0 ${
                        isActive
                          ? 'bg-slate-900 text-white shadow-2xs'
                          : 'bg-slate-50 hover:bg-slate-100 text-slate-700 border border-slate-200/70'
                      }`}
                    >
                      <span>{navItem.label}</span>
                      {navItem.badge && (
                        <span
                          className={`font-mono text-[9.5px] px-1.5 py-0.2 rounded-md font-black ${
                            isActive ? 'bg-white/15 text-amber-300' : 'bg-slate-200/70 text-slate-600'
                          }`}
                        >
                          {navItem.badge}
                        </span>
                      )}
                    </button>
                  );
                })}
            </div>

            <div className="hidden xl:flex items-center gap-2 text-[11px] font-mono text-slate-500 shrink-0 pl-1">
              <span>
                مبيعات اليوم: <strong className="text-slate-900">{todayReportData.totalSalesRevenue.toLocaleString('ar-EG')} {currency}</strong>
              </span>
              <span>·</span>
              <span>
                العبوات: <strong className="text-[#0071E3]">{todayReportData.totalBottles}</strong>
              </span>
            </div>
          </div>
        )}
      </aside>

      {/* ======================================================== */}
      {/* DAILY REPORT EXPORT & SMART NOTIFICATION MODAL           */}
      {/* ======================================================== */}
      {showDailyReportModal && (
        <div className="fixed inset-0 z-[120] bg-black/50 backdrop-blur-md flex items-center justify-center p-4 animate-in fade-in duration-150">
          <div className="apple-glass rounded-[28px] p-5 sm:p-6 w-full max-w-lg border border-black/[0.1] shadow-apple-lg space-y-4 bg-white/95 max-h-[90vh] flex flex-col">
            {/* Header */}
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

            {/* Quick Executive KPI Cards */}
            <div className="grid grid-cols-3 gap-2.5 shrink-0">
              <div className="p-3 rounded-2xl bg-blue-50/70 border border-blue-200/60 text-right">
                <span className="text-[10px] font-bold text-[#0071E3] flex items-center gap-1">
                  <ShoppingBag size={11} />
                  إجمالي المبيعات
                </span>
                <span className="text-sm sm:text-base font-black font-mono text-[#1D1D1F] block mt-1">
                  {todayReportData.totalSalesRevenue.toLocaleString('ar-EG')} {currency}
                </span>
                <span className="text-[10px] text-[#86868B] font-mono">
                  {todayReportData.todaysSalesCount} فاتورة · {todayReportData.totalBottles} عبوة
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
                <span className="text-[10px] text-[#86868B] font-mono">
                  خامات + مصاريف اليوم
                </span>
              </div>

              <div className="p-3 rounded-2xl bg-emerald-50/80 border border-emerald-200/60 text-right">
                <span className="text-[10px] font-bold text-[#248A3D] flex items-center gap-1">
                  <TrendingUp size={11} />
                  المساهمة / نتيجة التشغيل وفق الموازنة
                </span>
                {todayReportData.todaysSalesCount === 0 ? (
                  <>
                    <span className="text-xs font-black text-[#1D1D1F] block mt-1">
                      لا توجد بيانات مبيعات فعلية مسجلة لهذا اليوم
                    </span>
                    <span className="text-[10px] text-[#86868B] font-mono">
                      المخصص التخطيطي: 600 {currency}
                    </span>
                  </>
                ) : (
                  <>
                    <span className="text-sm sm:text-base font-black font-mono text-[#248A3D] block mt-1">
                      المساهمة: {Math.round(todayReportData.grossOperatingProfit).toLocaleString('ar-EG')} {currency}
                    </span>
                    <span className="text-[10px] text-[#248A3D]/80 font-mono">
                      نتيجة التشغيل وفق الموازنة: {todayReportData.netFinalProfit >= 0 ? '+' : ''}{Math.round(todayReportData.netFinalProfit).toLocaleString('ar-EG')} {currency}
                    </span>
                  </>
                )}
              </div>
            </div>

            {/* Live Formatted Text Report Preview */}
            <div className="flex-1 min-h-0 overflow-y-auto rounded-2xl bg-[#1D1D1F] text-zinc-100 p-3.5 font-mono text-[11px] leading-relaxed border border-black/10 select-all">
              <pre className="whitespace-pre-wrap break-words font-mono text-[11px] text-emerald-50/95">
                {todayReportData.reportText}
              </pre>
            </div>

            {/* Export & Smart Notification Actions */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 pt-1 shrink-0">
              <button
                type="button"
                onClick={handleDownloadTxtReport}
                className="apple-btn py-2.5 px-3 rounded-2xl bg-[#0071E3] hover:bg-[#0077ED] text-white text-xs font-black flex items-center justify-center gap-1.5 shadow-sm cursor-pointer"
              >
                <Download size={14} />
                <span>تحميل ملف نصي (.TXT)</span>
              </button>

              <button
                type="button"
                onClick={handleSendSmartReportNotification}
                className="apple-btn py-2.5 px-3 rounded-2xl bg-[#1D1D1F] hover:bg-black text-white text-xs font-black flex items-center justify-center gap-1.5 shadow-sm cursor-pointer"
              >
                <BellRing size={14} className="text-[#34C759]" />
                <span>إرسال كإشعار ذكي</span>
              </button>

              <button
                type="button"
                onClick={handleCopyReportText}
                className="apple-btn py-2.5 px-3 rounded-2xl bg-[#F5F5F7] hover:bg-black/[0.08] text-[#1D1D1F] border border-black/[0.08] text-xs font-bold flex items-center justify-center gap-1.5 cursor-pointer"
              >
                {copiedReport ? <Check size={14} className="text-[#34C759]" /> : <Copy size={14} />}
                <span>{copiedReport ? 'تم نسخ التقرير!' : 'نسخ التقرير النصي'}</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ======================================================== */}
      {/* PASSWORD PROMPT MODAL FOR SWITCHING TO DIRECTOR          */}
      {/* (Password is hidden in background; Numpad is strictly LTR)*/}
      {/* ======================================================== */}
      {showPasswordPrompt && (
        <div className="fixed inset-0 z-[110] bg-black/50 backdrop-blur-md flex items-center justify-center p-4 animate-in fade-in duration-150">
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

              {/* Properly Ordered Left-to-Right Numeric Keypad (1 2 3 / 4 5 6 / 7 8 9 / C 0 ⌫) */}
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
