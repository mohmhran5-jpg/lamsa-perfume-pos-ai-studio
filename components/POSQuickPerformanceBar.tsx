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
      className="rounded-2xl border border-slate-200/90 bg-white px-4 py-2.5 shadow-2xs transition-all duration-150"
    >
      <div className="flex flex-wrap items-center justify-between gap-3">
        {/* Right: Clean Live Cashier Telemetry (Tabular Numerals, Unboxed Separators) */}
        <div className="flex flex-wrap items-center gap-3 sm:gap-5 text-xs">
          {/* 1. Today's Sales Metric */}
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 rounded-lg bg-[#0071E3]/10 text-[#0071E3] flex items-center justify-center shrink-0">
              <ShoppingBag size={14} />
            </div>
            <div className="flex items-baseline gap-1.5">
              <span className="text-slate-500 font-semibold">مبيعات اليوم:</span>
              <strong className="font-mono tabular-nums font-black text-sm text-slate-900">
                {todaysRevenue.toLocaleString('ar-EG')} {settings.currency}
              </strong>
              <span aria-hidden="true" className="text-slate-300">·</span>
              <span className="text-[11px] font-mono tabular-nums text-slate-500">
                {todaysSalesList.length} فاتورة / {todaysBottles} عبوة
              </span>
            </div>
          </div>

          <div className="h-4 w-px bg-slate-200 hidden sm:block" />

          {/* 2. Break-Even Metric: المتبقي للتعادل (استبعاد أي قيم صفرية غير منطقية) */}
          <div className="flex items-center gap-2">
            <div
              className={`w-7 h-7 rounded-lg flex items-center justify-center shrink-0 ${
                isBreakEvenCovered
                  ? 'bg-emerald-500/10 text-emerald-700'
                  : 'bg-amber-500/15 text-amber-700'
              }`}
            >
              {isBreakEvenCovered ? <CheckCircle2 size={14} /> : <Target size={14} />}
            </div>
            <div className="flex items-baseline gap-1.5">
              <span className="text-slate-500 font-semibold">نقطة التعادل:</span>
              <strong className={`font-mono tabular-nums font-black text-sm ${
                isBreakEvenCovered ? 'text-emerald-700' : 'text-amber-800'
              }`}>
                {isBreakEvenCovered
                  ? `✓ تم تأمين التعادل`
                  : (todaysSalesList.length === 0
                      ? `المستهدف ${breakEvenTarget} ج`
                      : `متبقي ${Math.max(1, Math.ceil(remainingForBreakEven))} ج`)}
              </strong>
              <span aria-hidden="true" className="text-slate-300">·</span>
              <span className="text-[11px] font-mono tabular-nums text-slate-500">
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

          <div className="h-4 w-px bg-slate-200 hidden md:block" />

          {/* 3. Cashier Entitlements Metric: قاعدة الحساب (إجمالي المستحقات - إجمالي المصروف) */}
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 rounded-lg bg-purple-500/10 text-purple-700 flex items-center justify-center shrink-0">
              <Wallet size={14} />
            </div>
            <div className="flex items-baseline gap-1.5">
              <span className="text-slate-500 font-semibold">مستحقات الكاشير:</span>
              <strong className="font-mono tabular-nums font-black text-sm text-purple-800">
                {remainingCashierDue > 0
                  ? `+${remainingCashierDue} ${settings.currency}`
                  : remainingCashierDue === 0
                  ? (totalCashierEntitlements > 0 ? 'مسواة بالكامل' : `${dailyBaseSalary} ${settings.currency}`)
                  : `${remainingCashierDue} ${settings.currency}`}
              </strong>
              <span aria-hidden="true" className="text-slate-300">·</span>
              <span className="text-[11px] font-mono tabular-nums text-slate-500" title="المعادلة: إجمالي المستحقات (الراتب + العمولة) - إجمالي المصروف">
                مستحق: {totalCashierEntitlements} ج | مصروف: {totalCashierExpenses} ج
              </span>
              {onOpenStaffEntitlements && (
                <button
                  type="button"
                  onClick={onOpenStaffEntitlements}
                  className="mr-1 px-2 py-0.5 rounded-md bg-purple-50 hover:bg-purple-100 text-purple-800 border border-purple-200 text-[10px] font-black transition-colors cursor-pointer"
                  title="فتح شاشة مستحقات العاملين، العمولات والتسويات"
                >
                  المستحقات والتسوية ←
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
              className="px-3 py-1.5 rounded-xl bg-amber-50 hover:bg-amber-100/80 text-amber-800 border border-amber-200/80 text-xs font-bold flex items-center gap-1.5 transition-colors cursor-pointer whitespace-nowrap"
              title="عرض الأصناف التي وصلت للحد الحرج في المخزون"
            >
              <AlertTriangle size={13} className="text-amber-600 shrink-0" />
              <span className="tabular-nums">نواقص المخزون ({todayShortageCount})</span>
            </button>
          )}

          <button
            type="button"
            onClick={onOpenSmartSearch}
            className="px-3 py-1.5 rounded-xl bg-slate-100 hover:bg-slate-200/80 text-slate-800 text-xs font-bold flex items-center gap-1.5 transition-colors cursor-pointer whitespace-nowrap"
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
                ? 'bg-slate-900 text-white border-slate-900'
                : 'bg-white hover:bg-slate-50 text-slate-800 border-slate-200'
            }`}
          >
            <BookOpen size={13} className={showSellingPriceStrip ? 'text-amber-300' : 'text-[#0071E3]'} />
            <span>جدول أسعار العبوات</span>
            {showSellingPriceStrip ? <ChevronUp size={13} /> : <ChevronDown size={13} />}
          </button>
        </div>
      </div>

      {/* Expandable Customer-Safe Selling Price Strip */}
      {showSellingPriceStrip && (
        <div className="mt-3 pt-3 border-t border-slate-100 animate-in fade-in duration-150">
          <div className="flex items-center justify-between mb-2.5 text-[11px]">
            <span className="font-black text-slate-900 flex items-center gap-1.5">
              <Sparkles size={12} className="text-[#C49746]" />
              <span>قائمة أسعار البيع المعتمدة للجمهور (آمنة للعرض أمام العميل):</span>
            </span>
            <span className="text-[11px] text-slate-500">
              تشمل العبوة العادية · العود والمسك والنيش · العبوة الملونة الفاخرة
            </span>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-2">
            {DEFAULT_BOTTLE_SIZES.map((b) => (
              <div
                key={b.id}
                className="p-2.5 rounded-xl bg-slate-50/80 border border-slate-200/70 text-right space-y-1"
              >
                <div className="flex items-center justify-between border-b border-slate-200/60 pb-1">
                  <span className="font-mono tabular-nums font-black text-xs text-[#0071E3]">
                    {b.sizeMl} مل {b.isRollOn ? '(رول)' : ''}
                  </span>
                  <span className="text-[10px] font-mono tabular-nums text-slate-500">{b.essenceGrams} جم</span>
                </div>
                <div className="flex justify-between text-[11px]">
                  <span className="text-slate-600">فرنسي عادي:</span>
                  <strong className="font-mono tabular-nums text-slate-900">{b.normalPrice} ج</strong>
                </div>
                <div className="flex justify-between text-[11px]">
                  <span className="text-[#9A6E23]">عود / مسك:</span>
                  <strong className="font-mono tabular-nums text-[#9A6E23]">{b.specialPrice} ج</strong>
                </div>
                {b.coloredNormalPrice && (
                  <div className="flex justify-between text-[10px] pt-0.5 border-t border-dashed border-slate-200">
                    <span className="text-amber-700">عبوة ملونة:</span>
                    <strong className="font-mono tabular-nums text-amber-800">{b.coloredNormalPrice} ج</strong>
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
