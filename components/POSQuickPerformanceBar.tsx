import React, { useState } from 'react';
import {
  Sale,
  StoreSettings,
  AppUser,
  StaffAttendanceRecord,
  DEFAULT_BOTTLE_SIZES,
} from '../types';
import {
  Sparkles,
  Award,
  AlertTriangle,
  BookOpen,
  ChevronDown,
  ChevronUp,
  ShoppingBag,
  Flame,
  Target,
  CheckCircle2,
  Wallet,
  Gift,
} from 'lucide-react';

interface POSQuickPerformanceBarProps {
  todaysSalesList: Sale[];
  todaysGrossProfit: number;
  dailyCoveredExpense: number;
  settings: StoreSettings;
  currentUser?: AppUser | null;
  isShiftReady: boolean;
  todayEmployeeAttendance?: StaffAttendanceRecord;
  dailyBaseSalary: number;
  todaysEarnedCommission: number;
  todaysExpensesTotal?: number;
  todayShortageCount: number;
  onStartWork: () => void;
  onOpenShortages: () => void;
  onOpenSmartSearch: () => void;
  onOpenPromotionalCalculator?: () => void;
  onOpenStaffEntitlements?: () => void;
}

export const POSQuickPerformanceBar: React.FC<POSQuickPerformanceBarProps> = ({
  todaysSalesList,
  todaysGrossProfit,
  dailyCoveredExpense,
  settings,
  dailyBaseSalary,
  todaysEarnedCommission,
  todaysExpensesTotal = 0,
  todayShortageCount,
  onOpenShortages,
  onOpenSmartSearch,
  onOpenPromotionalCalculator,
  onOpenStaffEntitlements,
}) => {
  const [showSellingPriceStrip, setShowSellingPriceStrip] = useState(false);

  const todaysRevenue = todaysSalesList.reduce((sum, s) => sum + s.totalPrice, 0);
  const todaysBottles = todaysSalesList.reduce(
    (sum, s) => sum + s.items.reduce((acc, it) => acc + (it.quantity || 1), 0),
    0
  );
  const isBonusTier7 = todaysBottles > 10;

  // 1. Break-Even Telemetry (المتبقي للتعادل)
  const breakEvenTarget = dailyCoveredExpense || 600;
  const isBreakEvenCovered = todaysSalesList.length > 0 && todaysGrossProfit >= breakEvenTarget;
  const remainingForBreakEven = Math.max(0, breakEvenTarget - todaysGrossProfit);

  // 2. Cashier Entitlements vs Expenses (إجمالي المستحقات - إجمالي المصروف)
  // إجمالي المستحقات: راتب الحضور المكتسب اليوم + عمولات المبيعات
  const totalCashierEntitlements = Math.round(dailyBaseSalary + todaysEarnedCommission);
  // إجمالي المصروف: المصروفات والمسحوبات المنصرفة من الدرج اليوم
  const totalCashierExpenses = Math.round(todaysExpensesTotal);
  // المتبقي الصافي: (إجمالي المستحقات - إجمالي المصروف)
  const remainingCashierDue = totalCashierEntitlements - totalCashierExpenses;

  return (
    <section
      aria-label="شريط متابعة المبيعات السريع وأسعار العبوات"
      className="rounded-2xl border border-white/10 bg-slate-900/85 backdrop-blur-xl p-3 sm:px-4 sm:py-3 shadow-xl transition-all duration-150 text-slate-100"
    >
      <div className="flex flex-wrap items-center justify-between gap-3">
        {/* Right: Clean Live Cashier Telemetry (Tabular Numerals, High-Contrast Glowing Separators) */}
        <div className="flex flex-wrap items-center gap-3 sm:gap-5 text-xs">
          {/* 1. Today's Sales Metric */}
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-xl bg-blue-500/20 text-blue-400 border border-blue-500/30 flex items-center justify-center shrink-0 shadow-xs">
              <ShoppingBag size={15} />
            </div>
            <div className="flex items-baseline gap-1.5">
              <span className="text-slate-400 font-semibold">مبيعات اليوم:</span>
              <strong className="font-mono tabular-nums font-black text-sm sm:text-base text-white tracking-tight">
                {todaysRevenue.toLocaleString('ar-EG')} {settings.currency}
              </strong>
              <span aria-hidden="true" className="text-slate-600">·</span>
              <span className="text-[11px] font-mono tabular-nums text-slate-400">
                {todaysSalesList.length} فاتورة / {todaysBottles} عبوة
              </span>
            </div>
          </div>

          <div className="h-4 w-px bg-slate-700/80 hidden sm:block" />

          {/* 2. Break-Even Metric: المتبقي للتعادل */}
          <div className="flex items-center gap-2">
            <div
              className={`w-8 h-8 rounded-xl flex items-center justify-center shrink-0 border ${
                isBreakEvenCovered
                  ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40'
                  : 'bg-amber-500/20 text-amber-300 border-amber-500/40'
              }`}
            >
              {isBreakEvenCovered ? <CheckCircle2 size={15} /> : <Target size={15} />}
            </div>
            <div className="flex items-baseline gap-1.5">
              <span className="text-slate-400 font-semibold">نقطة التعادل:</span>
              <strong className={`font-mono tabular-nums font-black text-sm ${
                isBreakEvenCovered ? 'text-emerald-400' : 'text-amber-300'
              }`}>
                {isBreakEvenCovered
                  ? `✓ تم تأمين التعادل`
                  : (todaysSalesList.length === 0
                      ? `المستهدف ${breakEvenTarget} ج`
                      : `متبقي ${Math.max(1, Math.ceil(remainingForBreakEven))} ج`)}
              </strong>
              <span aria-hidden="true" className="text-slate-600">·</span>
              <span className="text-[11px] font-mono tabular-nums text-slate-400">
                {isBreakEvenCovered
                  ? (todaysGrossProfit > breakEvenTarget
                      ? `+${Math.round(todaysGrossProfit - breakEvenTarget)} ج أرباح`
                      : 'تغطية تامة')
                  : (todaysSalesList.length === 0
                      ? 'بدء الوردية'
                      : `مساهمة: ${Math.round(todaysGrossProfit)} ج`)}
              </span>
            </div>
          </div>

          <div className="h-4 w-px bg-slate-700/80 hidden md:block" />

          {/* 3. Cashier Entitlements Metric */}
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-xl bg-purple-500/20 text-purple-300 border border-purple-500/40 flex items-center justify-center shrink-0">
              <Wallet size={15} />
            </div>
            <div className="flex items-baseline gap-1.5">
              <span className="text-slate-400 font-semibold">مستحقات الكاشير:</span>
              <strong className="font-mono tabular-nums font-black text-sm text-purple-300">
                {remainingCashierDue > 0
                  ? `+${remainingCashierDue} ${settings.currency}`
                  : remainingCashierDue === 0
                  ? (totalCashierEntitlements > 0 ? 'مسواة بالكامل' : `${dailyBaseSalary} ${settings.currency}`)
                  : `${remainingCashierDue} ${settings.currency}`}
              </strong>
              <span aria-hidden="true" className="text-slate-600">·</span>
              <span className="text-[11px] font-mono tabular-nums text-slate-400" title="المعادلة: إجمالي المستحقات (الراتب + العمولة) - إجمالي المصروف">
                مستحق: {totalCashierEntitlements} ج | مصروف: {totalCashierExpenses} ج
              </span>
              {onOpenStaffEntitlements && (
                <button
                  type="button"
                  onClick={onOpenStaffEntitlements}
                  className="mr-1 px-2 py-0.5 rounded-lg bg-purple-500/20 hover:bg-purple-500/30 text-purple-200 border border-purple-400/30 text-[10px] font-black transition-colors cursor-pointer"
                  title="فتح شاشة مستحقات العاملين، العمولات والتسويات"
                >
                  المستحقات ←
                </button>
              )}
            </div>
          </div>
        </div>

        {/* Left: Interactive Action Controls */}
        <div className="flex items-center gap-2">
          {todayShortageCount > 0 && (
            <button
              type="button"
              onClick={onOpenShortages}
              className="px-3 py-1.5 rounded-xl bg-amber-500/15 hover:bg-amber-500/25 text-amber-300 border border-amber-500/30 text-xs font-bold flex items-center gap-1.5 transition-colors cursor-pointer whitespace-nowrap"
              title="عرض الأصناف التي وصلت للحد الحرج في المخزون"
            >
              <AlertTriangle size={13} className="text-amber-400 shrink-0" />
              <span className="tabular-nums">نواقص المخزون ({todayShortageCount})</span>
            </button>
          )}

          {onOpenPromotionalCalculator && (
            <button
              type="button"
              onClick={onOpenPromotionalCalculator}
              className="px-3 py-1.5 rounded-xl bg-gradient-to-r from-amber-500/20 to-purple-500/20 hover:from-amber-500/30 hover:to-purple-500/30 text-amber-300 border border-amber-500/40 text-xs font-black flex items-center gap-1.5 transition-colors cursor-pointer whitespace-nowrap shadow-xs"
              title="حاسبة العروض والخصومات الترويجية وتوفير العميل"
            >
              <Gift size={13} className="text-amber-400 shrink-0" />
              <span>حاسبة العروض والخصومات 🎁</span>
            </button>
          )}

          <button
            type="button"
            onClick={onOpenSmartSearch}
            className="px-3 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 text-xs font-bold flex items-center gap-1.5 transition-colors cursor-pointer whitespace-nowrap"
            title="مستشار ترشيح العطور الذكي حسب المناسبة والموسم"
          >
            <Sparkles size={13} className="text-[#C49746] shrink-0" />
            <span>مستشار العطور</span>
          </button>

          <button
            type="button"
            onClick={() => setShowSellingPriceStrip(!showSellingPriceStrip)}
            className={`px-3 py-1.5 rounded-xl text-xs font-bold flex items-center gap-1.5 transition-colors border cursor-pointer whitespace-nowrap ${
              showSellingPriceStrip
                ? 'bg-blue-600 text-white border-blue-500 shadow-sm'
                : 'bg-slate-800 hover:bg-slate-700 text-slate-200 border-slate-700'
            }`}
          >
            <BookOpen size={13} className={showSellingPriceStrip ? 'text-white' : 'text-blue-400'} />
            <span>جدول أسعار العبوات</span>
            {showSellingPriceStrip ? <ChevronUp size={13} /> : <ChevronDown size={13} />}
          </button>
        </div>
      </div>

      {/* Expandable Customer-Safe Selling Price Strip */}
      {showSellingPriceStrip && (
        <div className="mt-3 pt-3 border-t border-slate-800 animate-in fade-in duration-150">
          <div className="flex items-center justify-between mb-2.5 text-[11px]">
            <span className="font-black text-amber-400 flex items-center gap-1.5">
              <Sparkles size={12} className="text-amber-400" />
              <span>قائمة أسعار البيع المعتمدة للجمهور (آمنة للعرض أمام العميل):</span>
            </span>
            <span className="text-[11px] text-slate-400">
              تشمل العبوة العادية · العود والمسك والنيش · العبوة الملونة الفاخرة
            </span>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-2">
            {DEFAULT_BOTTLE_SIZES.map((b) => (
              <div
                key={b.id}
                className="p-2.5 rounded-xl bg-slate-950/70 border border-slate-800 text-right space-y-1"
              >
                <div className="flex items-center justify-between border-b border-slate-800/80 pb-1">
                  <span className="font-mono tabular-nums font-black text-xs text-blue-400">
                    {b.sizeMl} مل {b.isRollOn ? '(رول)' : ''}
                  </span>
                  <span className="text-[10px] font-mono tabular-nums text-slate-400">{b.essenceGrams} جم</span>
                </div>
                <div className="flex justify-between text-[11px]">
                  <span className="text-slate-400">فرنسي عادي:</span>
                  <strong className="font-mono tabular-nums text-white">{b.normalPrice} ج</strong>
                </div>
                <div className="flex justify-between text-[11px]">
                  <span className="text-amber-400">عود / مسك:</span>
                  <strong className="font-mono tabular-nums text-amber-300">{b.specialPrice} ج</strong>
                </div>
                {b.coloredNormalPrice && (
                  <div className="flex justify-between text-[10px] pt-0.5 border-t border-dashed border-slate-800">
                    <span className="text-purple-300">عبوة ملونة:</span>
                    <strong className="font-mono tabular-nums text-purple-200">{b.coloredNormalPrice} ج</strong>
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}
    </section>
  );
};

export default POSQuickPerformanceBar;
