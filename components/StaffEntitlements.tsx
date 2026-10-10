import React, { useState, useMemo } from 'react';
import {
  Sale,
  FinancialVault,
  AppUser,
  StoreSettings,
  CommissionPolicy,
  StaffBaseSalaryConfig,
  StaffIncentive,
  StaffDeduction,
  StaffAdvance,
  StaffSettlementTransaction,
  DailyCommissionAuditRecord,
  CommissionAuditLog,
  DEFAULT_SETTINGS
} from '../types';
import {
  DEFAULT_COMMISSION_POLICY,
  loadCommissionPolicies,
  saveCommissionPolicies,
  loadStaffSalaryConfigs,
  saveStaffSalaryConfigs,
  loadStaffIncentives,
  saveStaffIncentives,
  loadStaffDeductions,
  saveStaffDeductions,
  loadStaffAdvances,
  saveStaffAdvances,
  loadStaffSettlementTransactions,
  loadCommissionAuditLogs,
  loadDailyCommissionAuditRecords,
  calculateExactDailyCommission,
  auditHistoricalCommissionsPeriod,
  approveAndCommitCommissionAuditRecords,
  computeStaffMemberEntitlementSummary,
  executeStaffPayoutSettlement,
  normalizeEmployeeName,
  isOwnerOrAdminUser,
  calculateIncentiveReserveLedger
} from '../services/staffEntitlementsService';
import {
  Wallet,
  DollarSign,
  Award,
  TrendingUp,
  Clock,
  Calendar,
  Search,
  CheckCircle2,
  AlertTriangle,
  FileText,
  Printer,
  Plus,
  X,
  User,
  ShieldCheck,
  RotateCcw,
  Check,
  Sliders,
  Sparkles,
  ChevronRight,
  Info,
  Layers,
  ArrowRight,
  ArrowLeft,
  Building,
  CreditCard,
  Receipt,
  UserCheck,
  Zap,
  Filter,
  Flame,
  MinusCircle,
  PlusCircle,
  HelpCircle,
  Copy,
  Lock,
  Edit3
} from 'lucide-react';

interface StaffEntitlementsProps {
  sales: Sale[];
  vaults: FinancialVault[];
  currentUser?: AppUser | null;
  users?: AppUser[];
  settings?: StoreSettings;
  onUpdateVaults: (vaults: FinancialVault[]) => void;
  onAddExpense?: (expense: any) => void;
}

export const StaffEntitlements: React.FC<StaffEntitlementsProps> = ({
  sales,
  vaults,
  currentUser,
  users = [],
  settings = DEFAULT_SETTINGS,
  onUpdateVaults,
  onAddExpense
}) => {
  // Navigation & Selection State
  const [selectedEmployeeName, setSelectedEmployeeName] = useState<string>('طارق');
  const [selectedPeriod, setSelectedPeriod] = useState<string>(() => new Date().toISOString().slice(0, 7)); // YYYY-MM
  const [activeSubTab, setActiveSubTab] = useState<
    'overview' | 'daily_commissions' | 'monthly_commissions' | 'salaries' | 'settlements' | 'advances' | 'incentives' | 'deductions' | 'vouchers' | 'statement'
  >('overview');

  // Loaded Entitlements Data State
  const [policies, setPolicies] = useState<CommissionPolicy[]>(() => loadCommissionPolicies());
  const [salaryConfigs, setSalaryConfigs] = useState<StaffBaseSalaryConfig[]>(() => loadStaffSalaryConfigs());
  const [incentives, setIncentives] = useState<StaffIncentive[]>(() => loadStaffIncentives());
  const [deductions, setDeductions] = useState<StaffDeduction[]>(() => loadStaffDeductions());
  const [advances, setAdvances] = useState<StaffAdvance[]>(() => loadStaffAdvances());
  const [settlements, setSettlements] = useState<StaffSettlementTransaction[]>(() => loadStaffSettlementTransactions());
  const [auditLogs, setAuditLogs] = useState<CommissionAuditLog[]>(() => loadCommissionAuditLogs());
  const [auditRecords, setAuditRecords] = useState<DailyCommissionAuditRecord[]>(() => loadDailyCommissionAuditRecords());

  // Search & Filter State
  const [searchQuery, setSearchQuery] = useState('');
  const [auditDateStart, setAuditDateStart] = useState<string>(() => {
    const d = new Date();
    d.setDate(1); // First day of current month
    return d.toISOString().slice(0, 10);
  });
  const [auditDateEnd, setAuditDateEnd] = useState<string>(() => new Date().toISOString().slice(0, 10));
  const [showAuditPanel, setShowAuditPanel] = useState(false);

  // Modals State
  const [showPayoutModal, setShowPayoutModal] = useState(false);
  const [payoutType, setPayoutType] = useState<'سحب_من_المستحقات' | 'سلفة' | 'صرف_راتب' | 'صرف_عمولة' | 'صرف_حافز' | 'تسوية_شاملة'>('سحب_من_المستحقات');
  const [payoutAmount, setPayoutAmount] = useState<number>(0);
  const [payoutMethod, setPayoutMethod] = useState<'نقدي' | 'محفظة إلكترونية' | 'تحويل بنكي'>('نقدي');
  const [payoutReason, setPayoutReason] = useState('صرف مستحقات عمولات وراتب');
  const [payoutNotes, setPayoutNotes] = useState('');

  // Incentive Modal State
  const [showIncentiveModal, setShowIncentiveModal] = useState(false);
  const [incentiveAmount, setIncentiveAmount] = useState<number>(100);
  const [incentiveType, setIncentiveType] = useState<'حافز أداء' | 'مكافأة' | 'مبلغ تشجيعي' | 'بدل إضافي' | 'أخرى'>('حافز أداء');
  const [incentiveReason, setIncentiveReason] = useState('تميز في مبيعات العطور والخدمة الممتازة');

  // Advance Modal State
  const [showAdvanceModal, setShowAdvanceModal] = useState(false);
  const [advanceAmount, setAdvanceAmount] = useState<number>(300);
  const [advanceReason, setAdvanceReason] = useState('سلفة شخصية طارئة');
  const [advanceRepaymentPlan, setAdvanceRepaymentPlan] = useState('خصم من راتب نهاية الشهر');

  // Deduction Modal State
  const [showDeductionModal, setShowDeductionModal] = useState(false);
  const [deductionAmount, setDeductionAmount] = useState<number>(50);
  const [deductionType, setDeductionType] = useState<'خصم تأخير' | 'خصم غياب' | 'جزاء إداري' | 'تسوية عجز' | 'أخرى'>('خصم تأخير');
  const [deductionReason, setDeductionReason] = useState('تأخير في فتح المحل وتجهيز الشيفت');

  // Salary Edit Modal State
  const [showSalaryModal, setShowSalaryModal] = useState(false);
  const [editSalaryAmount, setEditSalaryAmount] = useState<number>(1000);

  // Bottle Breakdown Modal State
  const [selectedBottleDetailDate, setSelectedBottleDetailDate] = useState<string | null>(null);

  // Printable Voucher Modal State
  const [viewingVoucher, setViewingVoucher] = useState<StaffSettlementTransaction | null>(null);

  // Success / Status Toast
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  const isOwner = currentUser?.role === 'OWNER' || currentUser?.displayName?.includes('محمد');

  const showNotification = (msg: string) => {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(null), 3000);
  };

  // 1. Compute Historical Audit Records on the fly for range
  const currentAuditRun = useMemo(() => {
    return auditHistoricalCommissionsPeriod(
      sales,
      selectedEmployeeName,
      auditDateStart,
      auditDateEnd,
      policies,
      auditRecords,
      settlements
    );
  }, [sales, selectedEmployeeName, auditDateStart, auditDateEnd, policies, auditRecords, settlements]);

  // 2. Compute Entitlements Summary
  const entitlementSummary = useMemo(() => {
    return computeStaffMemberEntitlementSummary(
      selectedEmployeeName,
      selectedPeriod,
      sales,
      policies,
      salaryConfigs,
      incentives,
      deductions,
      advances,
      settlements,
      auditRecords
    );
  }, [selectedEmployeeName, selectedPeriod, sales, policies, salaryConfigs, incentives, deductions, advances, settlements, auditRecords]);

  // Handle Commit & Approval of Audit
  const handleApproveHistoricalAudit = () => {
    if (!isOwner) {
      alert('عفواً، اعتماد التسويات والتعديلات التاريخية من صلاحية المالك (د. محمد) فقط.');
      return;
    }
    const result = approveAndCommitCommissionAuditRecords(
      currentAuditRun,
      currentUser?.displayName || 'د. محمد',
      `اعتماد ومطابقة عمولات الفترة من ${auditDateStart} إلى ${auditDateEnd}`
    );
    setAuditRecords(result.updatedAuditRecords);
    setAuditLogs(loadCommissionAuditLogs());
    showNotification('تم اعتماد وتثبيت الفروق التاريخية وحفظ القيود المحاسبية بنجاح ✓');
  };

  // Handle Payout Execution
  const handleExecutePayout = (e: React.FormEvent) => {
    e.preventDefault();
    if (payoutAmount <= 0) {
      alert('يرجى إدخال مبلغ صحيح للصرف.');
      return;
    }

    if (payoutAmount > entitlementSummary.netRemainingBalanceDueEgp && payoutType !== 'سلفة') {
      const confirmOver = window.confirm(
        `المبلغ المطلوب (${payoutAmount} ج) يتجاوز صافي المستحق الحالي (${entitlementSummary.netRemainingBalanceDueEgp} ج). هل تريد اعتماد المبلغ المتبقي كسلفة مالية؟`
      );
      if (!confirmOver) return;
    }

    const tx = executeStaffPayoutSettlement({
      employeeName: selectedEmployeeName,
      transactionType: payoutType,
      totalAmountEgp: payoutAmount,
      breakdown: {
        commissionEgp: Math.min(payoutAmount, entitlementSummary.earnedCommissionsPeriodEgp),
        salaryEgp: Math.max(0, payoutAmount - entitlementSummary.earnedCommissionsPeriodEgp),
      },
      paymentMethod: payoutMethod,
      executedBy: currentUser?.displayName || 'المستخدم الحالي',
      approvedBy: isOwner ? (currentUser?.displayName || 'د. محمد') : 'بانتظار اعتماد المالك',
      reason: payoutReason,
      notes: payoutNotes,
      vaults,
      onUpdateVaults,
      onAddExpense
    });

    setSettlements(loadStaffSettlementTransactions());
    setShowPayoutModal(false);
    setViewingVoucher(tx);
    showNotification(`تم تسجيل إيصال صرف وتحديث الخزنة بنجاح برقم: ${tx.receiptReference}`);
  };

  const incentiveReserveLedger = useMemo(() => {
    return calculateIncentiveReserveLedger(incentives, settlements, 500, 0, 0);
  }, [incentives, settlements]);

  // Handle Adding Incentive
  const handleAddIncentive = (e: React.FormEvent) => {
    e.preventDefault();
    if (!isOwner) {
      alert('إضافة الحوافز والمكافآت من صلاحية د. محمد (المالك) فقط.');
      return;
    }
    if (incentiveAmount > incentiveReserveLedger.availableForApprovalEgp) {
      const confirmExceed = window.confirm(
        `⚠️ المخصص المتاح للاعتماد في بند احتياطي الحوافز هو ${incentiveReserveLedger.availableForApprovalEgp} ج.م.\n\nالمبلغ المطلوب (${incentiveAmount} ج.م) يتجاوز الرصيد المتاح من مخصص الـ 500 ج.م المعتمدة شهرياً.\nهل تؤكد اعتماد هذا الحافز بقرار استثنائي موثق من المالك د. محمد؟`
      );
      if (!confirmExceed) return;
    }
    const newInc: StaffIncentive = {
      id: `inc-${Date.now()}`,
      employeeId: selectedEmployeeName === 'طارق' ? 'user-tarek' : 'user-custom',
      employeeName: selectedEmployeeName,
      amountEgp: incentiveAmount,
      incentiveType,
      date: new Date().toISOString().slice(0, 10),
      relevantPeriodStr: selectedPeriod === 'ALL' ? new Date().toISOString().slice(0, 7) : selectedPeriod,
      reason: incentiveReason,
      approvedBy: currentUser?.displayName || 'د. محمد',
      status: 'معتمد',
      createdAt: new Date().toISOString(),
    };
    const next = [newInc, ...incentives];
    setIncentives(next);
    saveStaffIncentives(next);
    setShowIncentiveModal(false);
    showNotification(`تمت إضافة ${incentiveType} بقيمة ${incentiveAmount} ج.م للموظف ${selectedEmployeeName}`);
  };

  // Handle Adding Advance
  const handleAddAdvance = (e: React.FormEvent) => {
    e.preventDefault();
    const newAdv: StaffAdvance = {
      id: `adv-${Date.now()}`,
      employeeId: selectedEmployeeName === 'طارق' ? 'user-tarek' : 'user-custom',
      employeeName: selectedEmployeeName,
      amountEgp: advanceAmount,
      date: new Date().toISOString().slice(0, 10),
      reason: advanceReason,
      paymentMethod: 'نقدي',
      approvedBy: currentUser?.displayName || 'د. محمد',
      repaymentPlan: advanceRepaymentPlan,
      settledAmountEgp: 0,
      remainingAmountEgp: advanceAmount,
      status: 'نشطة',
      createdAt: new Date().toISOString(),
    };
    const next = [newAdv, ...advances];
    setAdvances(next);
    saveStaffAdvances(next);
    setShowAdvanceModal(false);
    showNotification(`تم تسجيل سلفة مالية جديدة بقيمة ${advanceAmount} ج.م للموظف ${selectedEmployeeName}`);
  };

  // Handle Adding Deduction
  const handleAddDeduction = (e: React.FormEvent) => {
    e.preventDefault();
    if (!isOwner) {
      alert('تسجيل الخصومات والجزاءات الإدارية من صلاحية د. محمد (المالك) فقط.');
      return;
    }
    const newDed: StaffDeduction = {
      id: `ded-${Date.now()}`,
      employeeId: selectedEmployeeName === 'طارق' ? 'user-tarek' : 'user-custom',
      employeeName: selectedEmployeeName,
      amountEgp: deductionAmount,
      deductionType,
      date: new Date().toISOString().slice(0, 10),
      relevantPeriodStr: selectedPeriod === 'ALL' ? new Date().toISOString().slice(0, 7) : selectedPeriod,
      reason: deductionReason,
      approvedBy: currentUser?.displayName || 'د. محمد',
      status: 'معتمد',
      createdAt: new Date().toISOString(),
    };
    const next = [newDed, ...deductions];
    setDeductions(next);
    saveStaffDeductions(next);
    setShowDeductionModal(false);
    showNotification(`تم تسجيل الخصم الإداري بقيمة ${deductionAmount} ج.م`);
  };

  // Handle Salary Update
  const handleUpdateSalary = (e: React.FormEvent) => {
    e.preventDefault();
    if (!isOwner) {
      alert('تعديل الراتب الأساسي من صلاحية د. محمد فقط.');
      return;
    }
    const next = salaryConfigs.map((c) => {
      if (normalizeEmployeeName(c.employeeName) === normalizeEmployeeName(selectedEmployeeName)) {
        return {
          ...c,
          monthlySalaryEgp: editSalaryAmount,
          approvedBy: currentUser?.displayName || 'د. محمد',
        };
      }
      return c;
    });
    setSalaryConfigs(next);
    saveStaffSalaryConfigs(next);
    setShowSalaryModal(false);
    showNotification(`تم تعديل الراتب الأساسي لـ ${selectedEmployeeName} إلى ${editSalaryAmount} ج.م/شهرياً`);
  };

  return (
    <div dir="rtl" className="space-y-5 animate-in fade-in duration-200 p-2 sm:p-4">
      {/* Toast Notification */}
      {toastMessage && (
        <div className="fixed top-5 left-1/2 -translate-x-1/2 z-50 px-4 py-2.5 rounded-2xl bg-slate-900 text-white text-xs font-bold shadow-2xl flex items-center gap-2 border border-amber-400/40 animate-in slide-in-from-top duration-150">
          <CheckCircle2 size={16} className="text-emerald-400" />
          <span>{toastMessage}</span>
        </div>
      )}

      {/* Main Executive Header */}
      <div className="p-4 sm:p-6 rounded-3xl bg-gradient-to-r from-slate-900 via-[#1D1D1F] to-slate-950 text-white shadow-xl border border-amber-500/30 flex flex-col md:flex-row md:items-center justify-between gap-4 relative overflow-hidden">
        <div className="absolute top-0 left-0 w-64 h-64 bg-amber-500/10 rounded-full blur-3xl pointer-events-none" />
        <div className="flex items-center gap-3.5 relative z-10">
          <div className="w-12 h-12 rounded-2xl bg-gradient-to-tr from-amber-500 to-yellow-400 text-slate-950 flex items-center justify-center shadow-lg shadow-amber-500/20 shrink-0">
            <Award size={24} />
          </div>
          <div>
            <div className="flex items-center gap-2 flex-wrap">
              <h1 className="text-lg sm:text-xl font-black tracking-tight text-white">
                منظومة مستحقات العاملين، العمولات والتسويات المالية
              </h1>
              <span className="text-[10px] font-black px-2.5 py-0.5 rounded-full bg-amber-500/20 text-amber-300 border border-amber-400/40">
                المحاسبة المعتمدة 2026
              </span>
            </div>
            <p className="text-xs text-slate-300 mt-0.5">
              حساب العمولات المتدرجة الفورية والتاريخية، إدارة الرواتب، الحوافز، السلف والتسويات النقدية بالربط مع الخزنة
            </p>
          </div>
        </div>

        {/* Global Controls & Actions */}
        <div className="flex items-center gap-2 flex-wrap relative z-10">
          {isOwner && (
            <button
              type="button"
              onClick={() => setShowAuditPanel(!showAuditPanel)}
              className="px-3.5 py-2 rounded-xl text-xs font-black bg-amber-500 text-slate-950 hover:bg-amber-400 transition-all flex items-center gap-1.5 shadow-md cursor-pointer"
            >
              <RotateCcw size={15} />
              <span>{showAuditPanel ? 'إخفاء مراجعة الأيام السابقة' : 'مراجعة وإعادة احتساب العمولات التاريخية'}</span>
            </button>
          )}

          <button
            type="button"
            onClick={() => {
              setPayoutAmount(entitlementSummary.netRemainingBalanceDueEgp);
              setShowPayoutModal(true);
            }}
            className="px-3.5 py-2 rounded-xl text-xs font-black bg-emerald-600 hover:bg-emerald-500 text-white transition-all flex items-center gap-1.5 shadow-md cursor-pointer"
          >
            <Wallet size={15} />
            <span>تسجيل صرف وسحب مستحقات</span>
          </button>
        </div>
      </div>

      {/* Staff Selector & Period Switcher */}
      <div className="p-3.5 rounded-2xl bg-white dark:bg-[#1D1D1F] border border-slate-200 dark:border-white/10 shadow-2xs flex flex-col md:flex-row md:items-center justify-between gap-3">
        {/* Employees Tabs */}
        <div className="flex items-center gap-1.5 overflow-x-auto scrollbar-none">
          <span className="text-xs font-bold text-slate-500 dark:text-slate-400 ml-1">الموظف:</span>
          {['طارق'].map((emp) => (
            <button
              key={emp}
              type="button"
              onClick={() => setSelectedEmployeeName(emp)}
              className={`px-3.5 py-1.5 rounded-xl text-xs font-black transition-all flex items-center gap-1.5 cursor-pointer shrink-0 ${
                selectedEmployeeName === emp
                  ? 'bg-amber-500 text-slate-950 shadow-xs'
                  : 'bg-slate-100 dark:bg-white/5 text-slate-700 dark:text-slate-300 hover:bg-slate-200'
              }`}
            >
              <User size={13} />
              <span>{emp}</span>
              <span className="text-[9.5px] px-1.5 py-0.2 rounded-md bg-black/15 font-mono">الكاشير والمبيعات الرئيسي</span>
            </button>
          ))}
        </div>

        {/* Period Switcher */}
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-xs font-bold text-slate-500 dark:text-slate-400">الفترة المالية:</span>
          <input
            type="month"
            value={selectedPeriod === 'ALL' ? '' : selectedPeriod}
            onChange={(e) => setSelectedPeriod(e.target.value || 'ALL')}
            className="p-1.5 rounded-xl text-xs font-mono font-bold border border-slate-300 dark:border-white/20 bg-slate-50 dark:bg-black/30 text-slate-900 dark:text-white"
          />
          <button
            type="button"
            onClick={() => setSelectedPeriod('ALL')}
            className={`px-2.5 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer ${
              selectedPeriod === 'ALL'
                ? 'bg-slate-900 dark:bg-white text-white dark:text-slate-950 font-black'
                : 'bg-slate-100 dark:bg-white/5 text-slate-600 dark:text-slate-300'
            }`}
          >
            جميع الفترات (شامل)
          </button>
        </div>
      </div>

      {/* Historical Commission Recalculation & Audit Tool (المراجعة التاريخية) */}
      {showAuditPanel && isOwner && (
        <div className="p-4 rounded-3xl bg-amber-50/80 dark:bg-amber-950/20 border-2 border-amber-400/60 shadow-lg space-y-4 animate-in slide-in-from-top duration-200">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-amber-200 dark:border-amber-900/40 pb-3">
            <div>
              <h3 className="text-sm font-black text-slate-900 dark:text-white flex items-center gap-2">
                <RotateCcw size={16} className="text-amber-600 animate-spin-slow" />
                <span>أداة مراجعة وإعادة احتساب العمولات التاريخية (معالجة عدم الاحتساب والمطابقة)</span>
              </h3>
              <p className="text-xs text-slate-600 dark:text-slate-300 mt-0.5">
                تتيح فحص المبيعات الأصلية لأي فترة سابقة، اكتشاف الأيام التي تحتوي على مبيعات ولم تُحتسب عمولتها، واعتماد الفروق المحاسبية.
              </p>
            </div>
            <button
              type="button"
              onClick={handleApproveHistoricalAudit}
              className="px-4 py-2 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 font-black text-xs shadow-md transition-all flex items-center gap-1.5 cursor-pointer shrink-0"
            >
              <CheckCircle2 size={15} />
              <span>اعتماد وتثبيت الفروق التاريخية بالفترة</span>
            </button>
          </div>

          {/* Date Selector for Audit */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs">
            <div>
              <label className="font-bold text-slate-800 dark:text-slate-200 block mb-1">من تاريخ:</label>
              <input
                type="date"
                value={auditDateStart}
                onChange={(e) => setAuditDateStart(e.target.value)}
                className="w-full p-2 rounded-xl border border-slate-300 dark:border-white/20 font-mono font-bold bg-white dark:bg-black/40 text-slate-900 dark:text-white"
              />
            </div>
            <div>
              <label className="font-bold text-slate-800 dark:text-slate-200 block mb-1">إلى تاريخ:</label>
              <input
                type="date"
                value={auditDateEnd}
                onChange={(e) => setAuditDateEnd(e.target.value)}
                className="w-full p-2 rounded-xl border border-slate-300 dark:border-white/20 font-mono font-bold bg-white dark:bg-black/40 text-slate-900 dark:text-white"
              />
            </div>
            <div className="flex items-end">
              <div className="p-2 rounded-xl bg-amber-500/15 border border-amber-400/40 text-[11px] text-amber-950 dark:text-amber-200 w-full font-bold">
                سياسة العمولات المطبقة: 5% أول 10 عبوات - 7% الزائدة - 0% رول
              </div>
            </div>
          </div>

          {/* Audit Results Table */}
          <div className="overflow-x-auto rounded-2xl border border-amber-300 dark:border-white/10 bg-white dark:bg-[#1D1D1F]">
            <table className="w-full text-right text-xs">
              <thead className="bg-amber-100/70 dark:bg-white/5 text-slate-800 dark:text-slate-200 font-black border-b border-amber-200 dark:border-white/10">
                <tr>
                  <th className="py-2.5 px-3">التاريخ</th>
                  <th className="py-2.5 px-3">المبيعات المؤهلة</th>
                  <th className="py-2.5 px-3">العبوات (بخاخ/رول)</th>
                  <th className="py-2.5 px-3">الصافي المؤهل</th>
                  <th className="py-2.5 px-3">العمولة المستحقة (5%/7%)</th>
                  <th className="py-2.5 px-3">المثبت بالسجل</th>
                  <th className="py-2.5 px-3">الفرق المحاسبي</th>
                  <th className="py-2.5 px-3">حالة المطابقة</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-white/5">
                {currentAuditRun.map((rec) => (
                  <tr key={rec.id} className="hover:bg-amber-50/50 dark:hover:bg-white/5 transition-colors">
                    <td className="py-2.5 px-3 font-mono font-bold text-slate-900 dark:text-white">{rec.date}</td>
                    <td className="py-2.5 px-3 font-mono">{rec.eligibleSalesCount} عملية بيع</td>
                    <td className="py-2.5 px-3 font-mono">
                      <span className="text-amber-700 font-bold">{rec.sprayBottlesCount} بخاخ</span>
                      {rec.rollOnBottlesCount > 0 && <span className="text-slate-400 text-[10px]"> (+{rec.rollOnBottlesCount} رول)</span>}
                    </td>
                    <td className="py-2.5 px-3 font-mono font-bold">{rec.eligibleNetRevenueEgp.toLocaleString('ar-EG')} ج</td>
                    <td className="py-2.5 px-3 font-mono font-black text-emerald-700 dark:text-emerald-400">
                      +{rec.calculatedCommissionEgp.toLocaleString('ar-EG')} ج
                    </td>
                    <td className="py-2.5 px-3 font-mono text-slate-600 dark:text-slate-300">
                      {rec.recordedInEntitlementsEgp.toLocaleString('ar-EG')} ج
                    </td>
                    <td className="py-2.5 px-3 font-mono font-black">
                      {rec.discrepancyDeltaEgp > 0 ? (
                        <span className="text-emerald-600">+{rec.discrepancyDeltaEgp} ج (نقص)</span>
                      ) : rec.discrepancyDeltaEgp < 0 ? (
                        <span className="text-rose-600">{rec.discrepancyDeltaEgp} ج (زيادة)</span>
                      ) : (
                        <span className="text-slate-400">0 ج (متطابق)</span>
                      )}
                    </td>
                    <td className="py-2.5 px-3">
                      {rec.auditState === 'معتمدة' && (
                        <span className="px-2 py-0.5 rounded-full text-[10px] font-black bg-emerald-500/15 text-emerald-700 border border-emerald-500/30">
                          معتمدة ومطابقة ✓
                        </span>
                      )}
                      {rec.auditState === 'تحتاج_مراجعة' && (
                        <span className="px-2 py-0.5 rounded-full text-[10px] font-black bg-amber-500/15 text-amber-800 border border-amber-500/30 animate-pulse">
                          ⚠️ تحتاج اعتماد لم تُحسب
                        </span>
                      )}
                      {rec.auditState === 'فرق_غير_معتمد' && (
                        <span className="px-2 py-0.5 rounded-full text-[10px] font-black bg-rose-500/15 text-rose-700 border border-rose-500/30">
                          ❌ يوجد فرق غير معتمد
                        </span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Top Executive Overview KPI Summary Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
        {/* Card 1: Base Salary */}
        <div className="p-3.5 rounded-2xl bg-white dark:bg-[#1D1D1F] border border-slate-200 dark:border-white/10 shadow-2xs space-y-1">
          <span className="text-[11px] font-bold text-slate-500 dark:text-slate-400 block">الراتب الثابت المستحق</span>
          <strong className="text-base font-black font-mono text-slate-900 dark:text-white block">
            {entitlementSummary.earnedSalaryPeriodEgp.toLocaleString('ar-EG')} ج.م
          </strong>
          <span className="text-[10px] text-slate-400 block font-mono">الأساسي: {entitlementSummary.monthlyBaseSalaryEgp} ج/شهر</span>
        </div>

        {/* Card 2: Earned Commissions */}
        <div className="p-3.5 rounded-2xl bg-emerald-50/70 dark:bg-emerald-950/20 border border-emerald-200/80 dark:border-emerald-900/40 shadow-2xs space-y-1">
          <span className="text-[11px] font-bold text-emerald-800 dark:text-emerald-300 block">إجمالي العمولات المكتسبة</span>
          <strong className="text-base font-black font-mono text-emerald-700 dark:text-emerald-400 block">
            +{entitlementSummary.earnedCommissionsPeriodEgp.toLocaleString('ar-EG')} ج.م
          </strong>
          <span className="text-[10px] text-emerald-600 block font-mono">5% أول 10 - 7% الزائدة</span>
        </div>

        {/* Card 3: Incentives & Bonuses */}
        <div className="p-3.5 rounded-2xl bg-blue-50/70 dark:bg-blue-950/20 border border-blue-200/80 dark:border-blue-900/40 shadow-2xs space-y-1">
          <span className="text-[11px] font-bold text-blue-800 dark:text-blue-300 block">الحوافز والمكافآت المعتمدة</span>
          <strong className="text-base font-black font-mono text-blue-700 dark:text-blue-400 block">
            +{entitlementSummary.approvedIncentivesPeriodEgp.toLocaleString('ar-EG')} ج.م
          </strong>
          <span className="text-[10px] text-blue-600 block font-mono">مكافآت أداء وتقييم</span>
        </div>

        {/* Card 4: Deductions & Advances */}
        <div className="p-3.5 rounded-2xl bg-rose-50/70 dark:bg-rose-950/20 border border-rose-200/80 dark:border-rose-900/40 shadow-2xs space-y-1">
          <span className="text-[11px] font-bold text-rose-800 dark:text-rose-300 block">الخصومات والسلف القائمة</span>
          <strong className="text-base font-black font-mono text-rose-700 dark:text-rose-400 block">
            -{(entitlementSummary.approvedDeductionsEgp + entitlementSummary.outstandingAdvancesEgp).toLocaleString('ar-EG')} ج.م
          </strong>
          <span className="text-[10px] text-rose-600 block font-mono">سلف: {entitlementSummary.outstandingAdvancesEgp} ج | خصم: {entitlementSummary.approvedDeductionsEgp} ج</span>
        </div>

        {/* Card 5: Total Paid / Settled */}
        <div className="p-3.5 rounded-2xl bg-purple-50/70 dark:bg-purple-950/20 border border-purple-200/80 dark:border-purple-900/40 shadow-2xs space-y-1">
          <span className="text-[11px] font-bold text-purple-800 dark:text-purple-300 block">المبالغ المصروفة والمسواة</span>
          <strong className="text-base font-black font-mono text-purple-700 dark:text-purple-400 block">
            {entitlementSummary.totalPreviouslyPaidEgp.toLocaleString('ar-EG')} ج.م
          </strong>
          <span className="text-[10px] text-purple-600 block font-mono">تم الصرف وإيصالات الخزنة</span>
        </div>

        {/* Card 6: Net Remaining Due */}
        <div className="p-3.5 rounded-2xl bg-amber-500 text-slate-950 shadow-md space-y-1 border border-amber-400">
          <span className="text-[11px] font-black block">الرصيد المتبقي المستحق</span>
          <strong className="text-lg font-black font-mono block">
            {entitlementSummary.netRemainingBalanceDueEgp.toLocaleString('ar-EG')} ج.م
          </strong>
          <span className="text-[10px] font-bold block opacity-90">جاهز للصرف المعتمد</span>
        </div>
      </div>

      {/* Employee Detail File Navigation Sub-tabs (10 Sub-tabs as required) */}
      <div className="flex items-center gap-1.5 p-1.5 rounded-2xl bg-slate-100 dark:bg-white/5 border border-slate-200 dark:border-white/10 overflow-x-auto scrollbar-none">
        {[
          { id: 'overview', label: 'ملخص المستحقات', icon: Layers },
          { id: 'daily_commissions', label: 'العمولات اليومية', icon: Award },
          { id: 'monthly_commissions', label: 'العمولات الشهرية', icon: TrendingUp },
          { id: 'salaries', label: 'الرواتب والأجور', icon: Wallet },
          { id: 'settlements', label: 'السحب والتسويات', icon: CreditCard },
          { id: 'advances', label: 'السلف المالية', icon: DollarSign },
          { id: 'incentives', label: 'الحوافز والمكافآت', icon: Sparkles },
          ...(isOwner ? [{ id: 'incentive_reserve', label: 'ميزانية احتياطي الحوافز (500 ج)', icon: Award }] : []),
          { id: 'deductions', label: 'الخصومات والتعديلات', icon: MinusCircle },
          { id: 'vouchers', label: 'سجل المدفوعات والإيصالات', icon: Receipt },
          { id: 'statement', label: 'كشف حساب تفصيلي', icon: FileText },
        ].map((tab) => {
          const Icon = tab.icon;
          return (
            <button
              key={tab.id}
              type="button"
              onClick={() => setActiveSubTab(tab.id as any)}
              className={`px-3 py-2 rounded-xl text-xs font-black transition-all flex items-center gap-1.5 cursor-pointer shrink-0 ${
                activeSubTab === tab.id
                  ? 'bg-amber-500 text-slate-950 shadow-xs'
                  : 'text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-white/10'
              }`}
            >
              <Icon size={14} />
              <span>{tab.label}</span>
            </button>
          );
        })}
      </div>

      {/* ======================================================== */}
      {/* SUB-TAB 1: OVERVIEW & ENTITLEMENTS BREAKDOWN             */}
      {/* ======================================================== */}
      {activeSubTab === 'overview' && (
        <div className="space-y-4">
          <div className="p-4 rounded-3xl bg-white dark:bg-[#1D1D1F] border border-slate-200 dark:border-white/10 shadow-2xs space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-black text-slate-900 dark:text-white flex items-center gap-2">
                <Layers size={16} className="text-amber-500" />
                <span>جدول بيان تفاصيل مستحقات الموظف ({selectedEmployeeName})</span>
              </h3>
              <div className="flex items-center gap-2">
                {isOwner && (
                  <>
                    <button
                      type="button"
                      onClick={() => setShowIncentiveModal(true)}
                      className="px-3 py-1.5 rounded-xl bg-blue-500/15 text-blue-700 dark:text-blue-300 hover:bg-blue-500/25 text-xs font-bold transition-all flex items-center gap-1 cursor-pointer"
                    >
                      <Sparkles size={13} />
                      <span>+ إضافة حافز/مكافأة</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => setShowDeductionModal(true)}
                      className="px-3 py-1.5 rounded-xl bg-rose-500/15 text-rose-700 dark:text-rose-300 hover:bg-rose-500/25 text-xs font-bold transition-all flex items-center gap-1 cursor-pointer"
                    >
                      <MinusCircle size={13} />
                      <span>+ تسجيل خصم إداري</span>
                    </button>
                  </>
                )}
                <button
                  type="button"
                  onClick={() => setShowAdvanceModal(true)}
                  className="px-3 py-1.5 rounded-xl bg-purple-500/15 text-purple-700 dark:text-purple-300 hover:bg-purple-500/25 text-xs font-bold transition-all flex items-center gap-1 cursor-pointer"
                >
                  <DollarSign size={13} />
                  <span>+ تسجيل سلفة</span>
                </button>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs">
              {/* Entitlements Additions (+) */}
              <div className="p-4 rounded-2xl bg-emerald-50/50 dark:bg-emerald-950/10 border border-emerald-200 dark:border-emerald-900/30 space-y-2.5">
                <h4 className="font-black text-emerald-900 dark:text-emerald-300 flex items-center gap-1.5 text-xs">
                  <PlusCircle size={15} className="text-emerald-600" />
                  <span>بند المستحقات والإضافات المكتسبة (+):</span>
                </h4>
                <div className="space-y-2 text-slate-800 dark:text-slate-200">
                  <div className="py-1 border-b border-emerald-200/50 dark:border-emerald-900/20 space-y-1">
                    <div className="flex justify-between font-bold">
                      <span>1. الراتب الشهري الأساسي الكامل:</span>
                      <strong className="font-mono">{entitlementSummary.monthlyBaseSalaryEgp.toLocaleString('ar-EG')} ج.م</strong>
                    </div>
                    {entitlementSummary.isCurrentOngoingPeriod ? (
                      <div className="flex justify-between text-[11px] text-emerald-800 dark:text-emerald-300 font-medium bg-emerald-100/50 dark:bg-emerald-900/20 px-2 py-1 rounded-lg">
                        <span>• التراكمي المكتسب اليومي حتى اليوم ({entitlementSummary.elapsedWorkDaysPeriod} يوم × {entitlementSummary.dailySalaryRateEgp} ج/يوم):</span>
                        <strong className="font-mono font-bold text-emerald-700 dark:text-emerald-300">+{entitlementSummary.earnedSalaryPeriodEgp.toLocaleString('ar-EG')} ج.م</strong>
                      </div>
                    ) : (
                      <div className="flex justify-between text-[11px] text-slate-500 font-medium">
                        <span>• المستحق المكتسب عن الفترة الكاملة:</span>
                        <strong className="font-mono font-bold">{entitlementSummary.earnedSalaryPeriodEgp.toLocaleString('ar-EG')} ج.م</strong>
                      </div>
                    )}
                  </div>
                  <div className="flex justify-between py-1 border-b border-emerald-200/50 dark:border-emerald-900/20">
                    <span>2. إجمالي العمولات المكتسبة على المبيعات:</span>
                    <strong className="font-mono text-emerald-700">+{entitlementSummary.earnedCommissionsPeriodEgp.toLocaleString('ar-EG')} ج.م</strong>
                  </div>
                  <div className="flex justify-between py-1 border-b border-emerald-200/50 dark:border-emerald-900/20">
                    <span>3. الحوافز والمكافآت المعتمدة:</span>
                    <strong className="font-mono text-blue-700">+{entitlementSummary.approvedIncentivesPeriodEgp.toLocaleString('ar-EG')} ج.م</strong>
                  </div>
                  <div className="flex justify-between py-1.5 font-black text-emerald-900 dark:text-emerald-300 text-sm pt-2">
                    <span>إجمالي الإضافات المكتسبة:</span>
                    <strong className="font-mono">{entitlementSummary.totalEntitlementsGrossEgp.toLocaleString('ar-EG')} ج.م</strong>
                  </div>
                </div>
              </div>

              {/* Deductions & Settlements (-) */}
              <div className="p-4 rounded-2xl bg-rose-50/50 dark:bg-rose-950/10 border border-rose-200 dark:border-rose-900/30 space-y-2.5">
                <h4 className="font-black text-rose-900 dark:text-rose-300 flex items-center gap-1.5 text-xs">
                  <MinusCircle size={15} className="text-rose-600" />
                  <span>بند الاستقطاعات والمسحوبات (-):</span>
                </h4>
                <div className="space-y-2 text-slate-800 dark:text-slate-200">
                  <div className="flex justify-between py-1 border-b border-rose-200/50 dark:border-rose-900/20">
                    <span>1. الخصومات والجزاءات المعتمدة:</span>
                    <strong className="font-mono text-rose-700">-{entitlementSummary.approvedDeductionsEgp.toLocaleString('ar-EG')} ج.م</strong>
                  </div>
                  <div className="flex justify-between py-1 border-b border-rose-200/50 dark:border-rose-900/20">
                    <span>2. السلف المالية القائمة:</span>
                    <strong className="font-mono text-purple-700">-{entitlementSummary.outstandingAdvancesEgp.toLocaleString('ar-EG')} ج.م</strong>
                  </div>
                  <div className="flex justify-between py-1 border-b border-rose-200/50 dark:border-rose-900/20">
                    <span>3. المبالغ المصروفة السابقة (إيصالات):</span>
                    <strong className="font-mono text-purple-700">-{entitlementSummary.totalPreviouslyPaidEgp.toLocaleString('ar-EG')} ج.م</strong>
                  </div>
                  <div className="flex justify-between py-1.5 font-black text-amber-900 dark:text-amber-300 text-sm pt-2">
                    <span>الرصيد المتبقي الصافي المستحق:</span>
                    <strong className="font-mono text-amber-600">{entitlementSummary.netRemainingBalanceDueEgp.toLocaleString('ar-EG')} ج.م</strong>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ======================================================== */}
      {/* SUB-TAB 2: DAILY COMMISSIONS LEDGER                     */}
      {/* ======================================================== */}
      {activeSubTab === 'daily_commissions' && (
        <div className="space-y-3">
          <div className="p-3.5 rounded-2xl bg-white dark:bg-[#1D1D1F] border border-slate-200 dark:border-white/10 shadow-2xs flex items-center justify-between gap-2">
            <h3 className="text-sm font-black text-slate-900 dark:text-white flex items-center gap-2">
              <Award size={16} className="text-amber-500" />
              <span>سجل العمولات اليومية وتفاصيل الشرائح ({selectedEmployeeName})</span>
            </h3>
            <span className="text-xs font-mono font-black text-emerald-700 dark:text-emerald-400 bg-emerald-500/15 px-2.5 py-1 rounded-xl">
              إجمالي عمولات الفترة: {entitlementSummary.earnedCommissionsPeriodEgp.toLocaleString('ar-EG')} ج.م
            </span>
          </div>

          <div className="overflow-x-auto rounded-2xl border border-slate-200 dark:border-white/10 bg-white dark:bg-[#1D1D1F]">
            <table className="w-full text-right text-xs">
              <thead className="bg-slate-50 dark:bg-white/5 text-slate-800 dark:text-slate-200 font-black border-b border-slate-200 dark:border-white/10">
                <tr>
                  <th className="py-2.5 px-3">اليوم والتاريخ</th>
                  <th className="py-2.5 px-3">عدد الفواتير</th>
                  <th className="py-2.5 px-3">العبوات (بخاخ / رول)</th>
                  <th className="py-2.5 px-3">شريحة 5% (أول 10)</th>
                  <th className="py-2.5 px-3">شريحة 7% (الزائدة)</th>
                  <th className="py-2.5 px-3">العمولة المستحقة</th>
                  <th className="py-2.5 px-3">تفاصيل العبوات</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-white/5">
                {currentAuditRun.map((rec) => (
                  <tr key={rec.id} className="hover:bg-slate-50 dark:hover:bg-white/5 transition-colors">
                    <td className="py-2.5 px-3 font-mono font-bold text-slate-900 dark:text-white">{rec.date}</td>
                    <td className="py-2.5 px-3 font-mono">{rec.eligibleSalesCount} عملية</td>
                    <td className="py-2.5 px-3 font-mono">
                      <span className="font-bold text-amber-700">{rec.sprayBottlesCount} بخاخ</span>
                      {rec.rollOnBottlesCount > 0 && <span className="text-slate-400 text-[10px]"> (+{rec.rollOnBottlesCount} رول)</span>}
                    </td>
                    <td className="py-2.5 px-3 font-mono text-slate-700 dark:text-slate-300">
                      {rec.bottlesAt5Percent} عبوة ({rec.tier1CommissionEgp} ج)
                    </td>
                    <td className="py-2.5 px-3 font-mono text-slate-700 dark:text-slate-300">
                      {rec.bottlesAt7Percent > 0 ? (
                        <span className="font-bold text-amber-600">{rec.bottlesAt7Percent} عبوة ({rec.tier2CommissionEgp} ج)</span>
                      ) : (
                        <span className="text-slate-400">0</span>
                      )}
                    </td>
                    <td className="py-2.5 px-3 font-mono font-black text-emerald-700 dark:text-emerald-400 text-sm">
                      +{rec.calculatedCommissionEgp.toLocaleString('ar-EG')} ج.م
                    </td>
                    <td className="py-2.5 px-3">
                      <button
                        type="button"
                        onClick={() => setSelectedBottleDetailDate(rec.date)}
                        className="px-2.5 py-1 rounded-lg bg-amber-500/15 hover:bg-amber-500/25 text-amber-800 dark:text-amber-300 text-[11px] font-bold transition-all flex items-center gap-1 cursor-pointer"
                      >
                        <Info size={12} />
                        <span>عرض تفاصيل العبوات</span>
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ======================================================== */}
      {/* SUB-TAB 5: WITHDRAWALS & SETTLEMENTS HISTORY             */}
      {/* ======================================================== */}
      {activeSubTab === 'settlements' && (
        <div className="space-y-3">
          <div className="p-3.5 rounded-2xl bg-white dark:bg-[#1D1D1F] border border-slate-200 dark:border-white/10 shadow-2xs flex items-center justify-between gap-2">
            <h3 className="text-sm font-black text-slate-900 dark:text-white flex items-center gap-2">
              <CreditCard size={16} className="text-amber-500" />
              <span>سجل حركات السحب والصرف والتسويات النقدية ({selectedEmployeeName})</span>
            </h3>
            <button
              type="button"
              onClick={() => {
                setPayoutAmount(entitlementSummary.netRemainingBalanceDueEgp);
                setShowPayoutModal(true);
              }}
              className="px-3 py-1.5 rounded-xl bg-emerald-600 text-white font-bold text-xs hover:bg-emerald-500 transition-all flex items-center gap-1 cursor-pointer"
            >
              <Plus size={14} />
              <span>تسجيل حركة صرف جديدة</span>
            </button>
          </div>

          <div className="overflow-x-auto rounded-2xl border border-slate-200 dark:border-white/10 bg-white dark:bg-[#1D1D1F]">
            <table className="w-full text-right text-xs">
              <thead className="bg-slate-50 dark:bg-white/5 text-slate-800 dark:text-slate-200 font-black border-b border-slate-200 dark:border-white/10">
                <tr>
                  <th className="py-2.5 px-3">رقم الإيصال والتاريخ</th>
                  <th className="py-2.5 px-3">نوع الحركة</th>
                  <th className="py-2.5 px-3">المبلغ المصروف</th>
                  <th className="py-2.5 px-3">طريقة الدفع والخزنة</th>
                  <th className="py-2.5 px-3">السبب والبيان</th>
                  <th className="py-2.5 px-3">المعتمد والمنفذ</th>
                  <th className="py-2.5 px-3">الإيصال والطباعة</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-white/5">
                {settlements
                  .filter((s) => normalizeEmployeeName(s.employeeName) === normalizeEmployeeName(selectedEmployeeName))
                  .map((set) => (
                    <tr key={set.id} className="hover:bg-slate-50 dark:hover:bg-white/5 transition-colors">
                      <td className="py-2.5 px-3 font-mono font-bold text-slate-900 dark:text-white">
                        <div>{set.receiptReference || set.id.slice(-8)}</div>
                        <div className="text-[10px] text-slate-400 font-normal">{new Date(set.date).toLocaleString('ar-EG')}</div>
                      </td>
                      <td className="py-2.5 px-3">
                        <span className="px-2 py-0.5 rounded-md bg-amber-500/15 text-amber-900 dark:text-amber-200 font-bold text-[10.5px]">
                          {set.transactionType.replace(/_/g, ' ')}
                        </span>
                      </td>
                      <td className="py-2.5 px-3 font-mono font-black text-purple-700 dark:text-purple-300 text-sm">
                        {set.totalAmountEgp.toLocaleString('ar-EG')} ج.م
                      </td>
                      <td className="py-2.5 px-3 font-bold">
                        <span>{set.paymentMethod}</span>
                        {set.paymentMethod === 'نقدي' && <span className="text-[10px] text-emerald-600 block">خصم من درج الكاشير/الخزنة ✓</span>}
                      </td>
                      <td className="py-2.5 px-3 text-slate-700 dark:text-slate-300 max-w-xs truncate">{set.reason}</td>
                      <td className="py-2.5 px-3 font-mono text-[11px]">
                        <div>المنفذ: {set.executedBy}</div>
                        <div className="text-amber-600 font-bold">المعتمد: {set.approvedBy}</div>
                      </td>
                      <td className="py-2.5 px-3">
                        <button
                          type="button"
                          onClick={() => setViewingVoucher(set)}
                          className="px-2.5 py-1 rounded-lg bg-slate-100 dark:bg-white/10 hover:bg-slate-200 text-slate-800 dark:text-white text-[11px] font-bold transition-all flex items-center gap-1 cursor-pointer"
                        >
                          <Printer size={12} />
                          <span>عرض وتوثيق الإيصال</span>
                        </button>
                      </td>
                    </tr>
                  ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ======================================================== */}
      {/* SUB-TAB 6: ADVANCES LEDGER                               */}
      {/* ======================================================== */}
      {activeSubTab === 'advances' && (
        <div className="space-y-3">
          <div className="p-3.5 rounded-2xl bg-white dark:bg-[#1D1D1F] border border-slate-200 dark:border-white/10 shadow-2xs flex items-center justify-between gap-2">
            <h3 className="text-sm font-black text-slate-900 dark:text-white flex items-center gap-2">
              <DollarSign size={16} className="text-amber-500" />
              <span>سجل السلف المالية القائمة والتسويات ({selectedEmployeeName})</span>
            </h3>
            <button
              type="button"
              onClick={() => setShowAdvanceModal(true)}
              className="px-3 py-1.5 rounded-xl bg-purple-600 text-white font-bold text-xs hover:bg-purple-500 transition-all flex items-center gap-1 cursor-pointer"
            >
              <Plus size={14} />
              <span>تسجيل سلفة مالية جديدة</span>
            </button>
          </div>

          <div className="overflow-x-auto rounded-2xl border border-slate-200 dark:border-white/10 bg-white dark:bg-[#1D1D1F]">
            <table className="w-full text-right text-xs">
              <thead className="bg-slate-50 dark:bg-white/5 text-slate-800 dark:text-slate-200 font-black border-b border-slate-200 dark:border-white/10">
                <tr>
                  <th className="py-2.5 px-3">التاريخ</th>
                  <th className="py-2.5 px-3">قيمة السلفة الأصلي</th>
                  <th className="py-2.5 px-3">المبلغ المسوى</th>
                  <th className="py-2.5 px-3">الرصيد المتبقي</th>
                  <th className="py-2.5 px-3">السبب وخطة السداد</th>
                  <th className="py-2.5 px-3">المعتمد</th>
                  <th className="py-2.5 px-3">الحالة</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-white/5">
                {advances
                  .filter((a) => normalizeEmployeeName(a.employeeName) === normalizeEmployeeName(selectedEmployeeName))
                  .map((adv) => (
                    <tr key={adv.id} className="hover:bg-slate-50 dark:hover:bg-white/5 transition-colors">
                      <td className="py-2.5 px-3 font-mono font-bold text-slate-900 dark:text-white">{adv.date}</td>
                      <td className="py-2.5 px-3 font-mono font-bold">{adv.amountEgp.toLocaleString('ar-EG')} ج.م</td>
                      <td className="py-2.5 px-3 font-mono text-emerald-600">{adv.settledAmountEgp.toLocaleString('ar-EG')} ج.م</td>
                      <td className="py-2.5 px-3 font-mono font-black text-purple-700 dark:text-purple-300">{adv.remainingAmountEgp.toLocaleString('ar-EG')} ج.م</td>
                      <td className="py-2.5 px-3 text-slate-700 dark:text-slate-300">
                        <div>{adv.reason}</div>
                        <div className="text-[10px] text-slate-400 font-mono">خطة: {adv.repaymentPlan}</div>
                      </td>
                      <td className="py-2.5 px-3 font-mono">{adv.approvedBy}</td>
                      <td className="py-2.5 px-3">
                        <span className="px-2 py-0.5 rounded-full text-[10px] font-black bg-purple-500/15 text-purple-700 border border-purple-500/30">
                          {adv.status}
                        </span>
                      </td>
                    </tr>
                  ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ======================================================== */}
      {/* SUB-TAB 10: PRINTABLE STATEMENT OF ACCOUNT (كشف الحساب)  */}
      {/* ======================================================== */}
      {(activeSubTab === 'statement' || activeSubTab === 'monthly_commissions' || activeSubTab === 'salaries' || activeSubTab === 'incentives' || activeSubTab === 'deductions' || activeSubTab === 'vouchers') && (
        <div className="p-4 sm:p-6 rounded-3xl bg-white dark:bg-[#1D1D1F] border border-slate-200 dark:border-white/10 shadow-lg space-y-4">
          <div className="flex items-center justify-between border-b border-slate-200 dark:border-white/10 pb-3">
            <div>
              <h3 className="text-base font-black text-slate-900 dark:text-white flex items-center gap-2">
                <FileText size={18} className="text-amber-500" />
                <span>كشف حساب وسجل مستحقات تفصيلي شامل للموظف ({selectedEmployeeName})</span>
              </h3>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                بيان حركة الاستحقاقات والرواتب والعمولات والسلف والخصومات والصرف
              </p>
            </div>
            <button
              type="button"
              onClick={() => window.print()}
              className="px-3.5 py-2 rounded-xl bg-slate-900 text-white dark:bg-white dark:text-slate-900 font-black text-xs hover:opacity-90 transition-all flex items-center gap-1.5 cursor-pointer"
            >
              <Printer size={15} />
              <span>طباعة كشف الحساب الرسمية</span>
            </button>
          </div>

          <div className="p-4 rounded-2xl bg-slate-50 dark:bg-white/5 border border-slate-200 dark:border-white/10 space-y-2 text-xs">
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 font-mono font-bold">
              <div>اسم الموظف: <strong className="text-amber-600">{selectedEmployeeName}</strong></div>
              <div>الفترة: <strong className="text-amber-600">{selectedPeriod}</strong></div>
              <div>الرصيد الافتتاحي: <strong>0.00 ج.م</strong></div>
              <div>الرصيد الختامي الصافي: <strong className="text-emerald-600">{entitlementSummary.netRemainingBalanceDueEgp.toLocaleString('ar-EG')} ج.م</strong></div>
            </div>
          </div>

          <div className="overflow-x-auto rounded-2xl border border-slate-200 dark:border-white/10">
            <table className="w-full text-right text-xs">
              <thead className="bg-slate-100 dark:bg-white/10 text-slate-800 dark:text-slate-200 font-black">
                <tr>
                  <th className="py-2.5 px-3">التاريخ</th>
                  <th className="py-2.5 px-3">نوع الحركة / البند</th>
                  <th className="py-2.5 px-3">الوصف والتفاصيل</th>
                  <th className="py-2.5 px-3">المستحق له (+)</th>
                  <th className="py-2.5 px-3">المصروف / الخصم (-)</th>
                  <th className="py-2.5 px-3">الرصيد التراكمي</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-white/5 font-mono">
                {/* Salary Item */}
                <tr>
                  <td className="py-2.5 px-3 font-bold">{selectedPeriod}-01</td>
                  <td className="py-2.5 px-3 font-bold text-blue-600">راتب أساسي شهري</td>
                  <td className="py-2.5 px-3 text-slate-600">استحقاق الأجر الأساسي المعتمد</td>
                  <td className="py-2.5 px-3 font-black text-emerald-600">+{entitlementSummary.earnedSalaryPeriodEgp} ج</td>
                  <td className="py-2.5 px-3 text-slate-400">-</td>
                  <td className="py-2.5 px-3 font-black">{entitlementSummary.earnedSalaryPeriodEgp} ج</td>
                </tr>

                {/* Commissions Item */}
                <tr>
                  <td className="py-2.5 px-3 font-bold">{selectedPeriod}-28</td>
                  <td className="py-2.5 px-3 font-bold text-amber-600">عمولات المبيعات المكتسبة</td>
                  <td className="py-2.5 px-3 text-slate-600">عمولات المبيعات المعتمدة للفترة (5% و 7%)</td>
                  <td className="py-2.5 px-3 font-black text-emerald-600">+{entitlementSummary.earnedCommissionsPeriodEgp} ج</td>
                  <td className="py-2.5 px-3 text-slate-400">-</td>
                  <td className="py-2.5 px-3 font-black">{(entitlementSummary.earnedSalaryPeriodEgp + entitlementSummary.earnedCommissionsPeriodEgp)} ج</td>
                </tr>

                {/* Incentives */}
                {incentives.map((i) => (
                  <tr key={i.id}>
                    <td className="py-2.5 px-3 font-bold">{i.date}</td>
                    <td className="py-2.5 px-3 font-bold text-purple-600">{i.incentiveType}</td>
                    <td className="py-2.5 px-3 text-slate-600">{i.reason}</td>
                    <td className="py-2.5 px-3 font-black text-emerald-600">+{i.amountEgp} ج</td>
                    <td className="py-2.5 px-3 text-slate-400">-</td>
                    <td className="py-2.5 px-3 font-black">--</td>
                  </tr>
                ))}

                {/* Settlements / Payouts */}
                {settlements.map((s) => (
                  <tr key={s.id}>
                    <td className="py-2.5 px-3 font-bold">{s.date.slice(0, 10)}</td>
                    <td className="py-2.5 px-3 font-bold text-rose-600">{s.transactionType.replace(/_/g, ' ')}</td>
                    <td className="py-2.5 px-3 text-slate-600">{s.reason} ({s.paymentMethod})</td>
                    <td className="py-2.5 px-3 text-slate-400">-</td>
                    <td className="py-2.5 px-3 font-black text-rose-600">-{s.totalAmountEgp} ج</td>
                    <td className="py-2.5 px-3 font-black">--</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ======================================================== */}
      {/* SUB-TAB: INCENTIVE RESERVE LEDGER & BUDGET               */}
      {/* ======================================================== */}
      {activeSubTab === 'incentive_reserve' && (
        <div className="space-y-4">
          <div className="p-4 rounded-3xl bg-white dark:bg-[#1D1D1F] border border-slate-200 dark:border-white/10 shadow-2xs space-y-3">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-slate-200 dark:border-white/10 pb-3">
              <div>
                <h3 className="text-sm font-black text-slate-900 dark:text-white flex items-center gap-2">
                  <Award size={18} className="text-amber-500" />
                  <span>سجل وسلسلة حركة بند احتياطي حوافز ومكافآت الموظفين (500 ج.م/شهرياً)</span>
                </h3>
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                  بند مستحدث بمخصص شهري ثابت (500 ج.م) معاد تخصيصه من بند راتب طارق السابق، مع مراعاة ثبات إجمالي الموازنة 15,000 ج.م.
                </p>
              </div>
              {isOwner && (
                <button
                  type="button"
                  onClick={() => setShowIncentiveModal(true)}
                  className="px-3.5 py-2 rounded-xl bg-blue-600 hover:bg-blue-500 text-white font-black text-xs shadow-md transition-all flex items-center gap-1.5 cursor-pointer shrink-0"
                >
                  <Sparkles size={14} />
                  <span>+ اعتماد حافز جديد</span>
                </button>
              )}
            </div>

            {/* 8-Point Metric Grid */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 text-xs">
              <div className="p-3 rounded-2xl bg-slate-50 dark:bg-white/5 border border-slate-200 dark:border-white/10">
                <span className="text-slate-500 block text-[11px]">1. الرصيد الافتتاحي:</span>
                <strong className="font-mono text-sm font-black text-slate-900 dark:text-white">{incentiveReserveLedger.openingBalanceEgp} ج.م</strong>
              </div>
              <div className="p-3 rounded-2xl bg-blue-50 dark:bg-blue-950/20 border border-blue-200 dark:border-blue-900/40">
                <span className="text-blue-800 dark:text-blue-300 block text-[11px]">2. المخصص الشهري:</span>
                <strong className="font-mono text-sm font-black text-blue-700 dark:text-blue-200">+{incentiveReserveLedger.monthlyAllocationEgp} ج.م</strong>
              </div>
              <div className="p-3 rounded-2xl bg-slate-50 dark:bg-white/5 border border-slate-200 dark:border-white/10">
                <span className="text-slate-500 block text-[11px]">3. التعديلات المعتمدة:</span>
                <strong className="font-mono text-sm font-black text-slate-900 dark:text-white">{incentiveReserveLedger.approvedAdjustmentsEgp} ج.م</strong>
              </div>
              <div className="p-3 rounded-2xl bg-amber-50 dark:bg-amber-950/20 border border-amber-200 dark:border-amber-900/40">
                <span className="text-amber-800 dark:text-amber-300 block text-[11px]">4. الحوافز المقترحة (مسودة):</span>
                <strong className="font-mono text-sm font-black text-amber-700 dark:text-amber-200">{incentiveReserveLedger.proposedIncentivesEgp} ج.م</strong>
              </div>
              <div className="p-3 rounded-2xl bg-purple-50 dark:bg-purple-950/20 border border-purple-200 dark:border-purple-900/40">
                <span className="text-purple-800 dark:text-purple-300 block text-[11px]">5. المعتمدة غير المدفوعة:</span>
                <strong className="font-mono text-sm font-black text-purple-700 dark:text-purple-200">{incentiveReserveLedger.approvedUnpaidIncentivesEgp} ج.م</strong>
              </div>
              <div className="p-3 rounded-2xl bg-emerald-50 dark:bg-emerald-950/20 border border-emerald-200 dark:border-emerald-900/40">
                <span className="text-emerald-800 dark:text-emerald-300 block text-[11px]">6. المدفوعة فعلياً:</span>
                <strong className="font-mono text-sm font-black text-emerald-700 dark:text-emerald-200">-{incentiveReserveLedger.actuallyPaidIncentivesEgp} ج.م</strong>
              </div>
              <div className="p-3 rounded-2xl bg-teal-50 dark:bg-teal-950/20 border border-teal-200 dark:border-teal-900/40 col-span-2 sm:col-span-1">
                <span className="text-teal-800 dark:text-teal-300 block text-[11px]">7. المتاح للاعتماد:</span>
                <strong className="font-mono text-sm font-black text-teal-700 dark:text-teal-200">{incentiveReserveLedger.availableForApprovalEgp} ج.م</strong>
              </div>
              <div className="p-3 rounded-2xl bg-indigo-50 dark:bg-indigo-950/20 border border-indigo-200 dark:border-indigo-900/40 col-span-2 sm:col-span-1">
                <span className="text-indigo-800 dark:text-indigo-300 block text-[11px]">8. المتبقي بعد الصرف:</span>
                <strong className="font-mono text-sm font-black text-indigo-700 dark:text-indigo-200">{incentiveReserveLedger.remainingBalanceAfterPayoutEgp} ج.م</strong>
              </div>
            </div>
          </div>

          {/* Detailed Incentives List */}
          <div className="p-4 rounded-3xl bg-white dark:bg-[#1D1D1F] border border-slate-200 dark:border-white/10 space-y-3">
            <h4 className="font-black text-xs text-slate-800 dark:text-slate-200 flex items-center gap-1.5">
              <FileText size={15} className="text-blue-600" />
              <span>سجل الحوافز والمكافآت المسجلة بالنظام ({incentives.length})</span>
            </h4>
            {incentives.length === 0 ? (
              <div className="p-6 text-center text-slate-500 text-xs font-bold">لا توجد حوافز مسجلة في هذا البند حتى الآن.</div>
            ) : (
              <div className="overflow-x-auto rounded-2xl border border-slate-200 dark:border-white/10">
                <table className="w-full text-right text-xs">
                  <thead className="bg-slate-50 dark:bg-white/5 font-black text-slate-800 dark:text-slate-200">
                    <tr>
                      <th className="py-2.5 px-3">التاريخ</th>
                      <th className="py-2.5 px-3">الموظف</th>
                      <th className="py-2.5 px-3">نوع الإضافة</th>
                      <th className="py-2.5 px-3">السبب المعتمد</th>
                      <th className="py-2.5 px-3">المبلغ</th>
                      <th className="py-2.5 px-3">الاعتماد</th>
                      <th className="py-2.5 px-3">الحالة</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-200 dark:divide-white/10 font-bold">
                    {incentives.map((inc) => (
                      <tr key={inc.id} className="hover:bg-slate-50 dark:hover:bg-white/5">
                        <td className="py-2.5 px-3 font-mono">{inc.date}</td>
                        <td className="py-2.5 px-3 text-slate-900 dark:text-white">{inc.employeeName}</td>
                        <td className="py-2.5 px-3 text-purple-600">{inc.incentiveType}</td>
                        <td className="py-2.5 px-3 text-slate-600 dark:text-slate-300">{inc.reason}</td>
                        <td className="py-2.5 px-3 font-mono font-black text-emerald-600">{inc.amountEgp} ج.م</td>
                        <td className="py-2.5 px-3 text-slate-500">{inc.approvedBy}</td>
                        <td className="py-2.5 px-3">
                          <span className={`px-2 py-0.5 rounded-lg text-[10px] font-black ${
                            inc.status === 'مصروف' ? 'bg-emerald-100 text-emerald-800' :
                            inc.status === 'معتمد' ? 'bg-blue-100 text-blue-800' :
                            'bg-amber-100 text-amber-800'
                          }`}>
                            {inc.status}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ======================================================== */}
      {/* MODAL 1: PAYOUT & SETTLEMENT MODAL                      */}
      {/* ======================================================== */}
      {showPayoutModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs animate-in fade-in duration-150">
          <div className="relative w-full max-w-lg rounded-3xl bg-white dark:bg-[#1A1A1E] border border-amber-400/40 p-5 shadow-2xl space-y-4">
            <div className="flex items-center justify-between border-b border-slate-200 dark:border-white/10 pb-3">
              <h3 className="text-sm font-black text-slate-900 dark:text-white flex items-center gap-2">
                <Wallet size={16} className="text-emerald-600" />
                <span>تسجيل حركة صرف وتسوية مستحقات ({selectedEmployeeName})</span>
              </h3>
              <button type="button" onClick={() => setShowPayoutModal(false)} className="p-1 text-slate-400 hover:text-slate-600">
                <X size={18} />
              </button>
            </div>

            <form onSubmit={handleExecutePayout} className="space-y-3 text-xs">
              <div className="p-3.5 rounded-2xl bg-emerald-50 dark:bg-emerald-950/20 border border-emerald-200 dark:border-emerald-900/40 text-xs space-y-1.5">
                <div className="flex justify-between font-bold text-emerald-950 dark:text-emerald-200">
                  <span>الرصيد المتاح للسحب الفوري المكتسب حتى اليوم:</span>
                  <strong className="font-mono text-sm text-emerald-700 dark:text-emerald-300">{entitlementSummary.netRemainingBalanceDueEgp.toLocaleString('ar-EG')} ج.م</strong>
                </div>
                {entitlementSummary.isCurrentOngoingPeriod && (
                  <p className="text-[11px] text-emerald-800 dark:text-emerald-300 leading-relaxed">
                    💡 يحسب النظام التراكمي المكتسب اليومي للراتب ({entitlementSummary.elapsedWorkDaysPeriod} يوم عمل × {entitlementSummary.dailySalaryRateEgp} ج/يوم = {entitlementSummary.earnedSalaryPeriodEgp} ج.م) بالإضافة للعمولات المكتسبة والحوافز المعتمدة. يمكنك سحب أي مبلغ ضمن هذا الرصيد المتاح فوراً وبدون أي مشاكل.
                  </p>
                )}
              </div>

              <div>
                <label className="font-bold text-slate-800 dark:text-slate-200 block mb-1">نوع حركة الصرف:</label>
                <select
                  value={payoutType}
                  onChange={(e) => setPayoutType(e.target.value as any)}
                  className="w-full p-2.5 rounded-xl border border-slate-300 dark:border-white/20 font-bold bg-white dark:bg-black/40 text-slate-900 dark:text-white"
                >
                  <option value="سحب_من_المستحقات">سحب جزئي من المستحقات المكتسبة</option>
                  <option value="صرف_عمولة">صرف عمولة مبيعات فقط</option>
                  <option value="صرف_راتب">صرف راتب أساسي فقط</option>
                  <option value="صرف_حافز">صرف حافز ومكافأة فقط</option>
                  <option value="تسوية_شاملة">تسوية وصرف شامل لكل المستحقات</option>
                  <option value="سلفة">تسجيل سلفة مالية مقدمة</option>
                </select>
              </div>

              <div>
                <label className="font-bold text-slate-800 dark:text-slate-200 block mb-1">المبلغ المراد صرفه (ج.م):</label>
                <input
                  type="number"
                  required
                  min="1"
                  value={payoutAmount}
                  onChange={(e) => setPayoutAmount(Number(e.target.value))}
                  className="w-full p-2.5 rounded-xl border border-slate-300 dark:border-white/20 font-mono font-black text-sm bg-white dark:bg-black/40 text-slate-900 dark:text-white"
                />
              </div>

              <div>
                <label className="font-bold text-slate-800 dark:text-slate-200 block mb-1">وسيلة الدفع والصرف:</label>
                <div className="grid grid-cols-3 gap-2">
                  {[
                    { id: 'نقدي', label: '💵 نقدي (الكاشير)' },
                    { id: 'محفظة إلكترونية', label: '📱 محفظة إلكترونية' },
                    { id: 'تحويل بنكي', label: '🏛️ تحويل بنكي' },
                  ].map((m) => (
                    <button
                      key={m.id}
                      type="button"
                      onClick={() => setPayoutMethod(m.id as any)}
                      className={`p-2 rounded-xl text-xs font-bold border transition-all text-center cursor-pointer ${
                        payoutMethod === m.id
                          ? 'bg-emerald-600 text-white border-emerald-600 font-black shadow-xs'
                          : 'bg-slate-50 dark:bg-white/5 border-slate-200 dark:border-white/10 text-slate-700 dark:text-slate-300'
                      }`}
                    >
                      {m.label}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <label className="font-bold text-slate-800 dark:text-slate-200 block mb-1">السبب والبيان:</label>
                <input
                  type="text"
                  required
                  value={payoutReason}
                  onChange={(e) => setPayoutReason(e.target.value)}
                  className="w-full p-2.5 rounded-xl border border-slate-300 dark:border-white/20 bg-white dark:bg-black/40 text-slate-900 dark:text-white"
                />
              </div>

              <div>
                <label className="font-bold text-slate-800 dark:text-slate-200 block mb-1">ملاحظات اختيارية:</label>
                <input
                  type="text"
                  value={payoutNotes}
                  onChange={(e) => setPayoutNotes(e.target.value)}
                  placeholder="ملاحظة إضافية للتوثيق..."
                  className="w-full p-2.5 rounded-xl border border-slate-300 dark:border-white/20 bg-white dark:bg-black/40 text-slate-900 dark:text-white"
                />
              </div>

              <div className="pt-2 flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setShowPayoutModal(false)}
                  className="px-4 py-2 rounded-xl bg-slate-100 dark:bg-white/10 text-slate-700 dark:text-slate-300 font-bold"
                >
                  إلغاء
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-black shadow-md cursor-pointer"
                >
                  تأكيد وتنفيذ الصرف ✓
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ======================================================== */}
      {/* MODAL 2: INCENTIVE MODAL                                */}
      {/* ======================================================== */}
      {showIncentiveModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs">
          <div className="relative w-full max-w-md rounded-3xl bg-white dark:bg-[#1A1A1E] border border-blue-400/40 p-5 shadow-2xl space-y-3">
            <div className="flex items-center justify-between border-b border-slate-200 dark:border-white/10 pb-2.5">
              <h3 className="text-sm font-black text-slate-900 dark:text-white flex items-center gap-1.5">
                <Sparkles size={16} className="text-blue-600" />
                <span>إضافة حافز أو مكافأة أداء ({selectedEmployeeName})</span>
              </h3>
              <button type="button" onClick={() => setShowIncentiveModal(false)} className="p-1 text-slate-400">
                <X size={18} />
              </button>
            </div>

            <div className="p-3 rounded-2xl bg-blue-50 dark:bg-blue-950/30 border border-blue-200 dark:border-blue-900/40 text-xs space-y-1">
              <div className="flex justify-between font-bold text-blue-900 dark:text-blue-200">
                <span>مخصص بند الحوافز المعتمد:</span>
                <span className="font-mono">{incentiveReserveLedger.monthlyAllocationEgp} ج.م / شهرياً</span>
              </div>
              <div className="flex justify-between text-slate-700 dark:text-slate-300">
                <span>الرصيد المتاح للاعتماد حالياً:</span>
                <strong className="font-mono text-emerald-600 dark:text-emerald-400">{incentiveReserveLedger.availableForApprovalEgp} ج.م</strong>
              </div>
              <div className="flex justify-between text-slate-700 dark:text-slate-300">
                <span>المصروف فعلياً هذا الشهر:</span>
                <span className="font-mono font-bold text-blue-600 dark:text-blue-400">{incentiveReserveLedger.actuallyPaidIncentivesEgp} ج.م</span>
              </div>
            </div>

            <form onSubmit={handleAddIncentive} className="space-y-3 text-xs">
              <div>
                <label className="font-bold block mb-1">نوع الإضافة:</label>
                <select
                  value={incentiveType}
                  onChange={(e) => setIncentiveType(e.target.value as any)}
                  className="w-full p-2.5 rounded-xl border border-slate-300 dark:border-white/20 font-bold bg-white dark:bg-black/40"
                >
                  <option value="حافز أداء">حافز أداء ومبيعات ممتاز</option>
                  <option value="مكافأة">مكافأة تميز وإخلاص</option>
                  <option value="مبلغ تشجيعي">مبلغ تشجيعي</option>
                  <option value="بدل إضافي">بدل ساعات عمل إضافية</option>
                </select>
              </div>

              <div>
                <label className="font-bold block mb-1">مبلغ الحافز (ج.م):</label>
                <input
                  type="number"
                  required
                  min="1"
                  value={incentiveAmount}
                  onChange={(e) => setIncentiveAmount(Number(e.target.value))}
                  className="w-full p-2.5 rounded-xl border border-slate-300 font-mono font-black text-sm"
                />
              </div>

              <div>
                <label className="font-bold block mb-1">السبب المعتمد:</label>
                <input
                  type="text"
                  required
                  value={incentiveReason}
                  onChange={(e) => setIncentiveReason(e.target.value)}
                  className="w-full p-2.5 rounded-xl border border-slate-300"
                />
              </div>

              <div className="pt-2 flex justify-end gap-2">
                <button type="button" onClick={() => setShowIncentiveModal(false)} className="px-4 py-2 rounded-xl bg-slate-100 font-bold">
                  إلغاء
                </button>
                <button type="submit" className="px-5 py-2 rounded-xl bg-blue-600 text-white font-black shadow-md cursor-pointer">
                  اعتماد وإضافة الحافز ✓
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ======================================================== */}
      {/* MODAL 3: BOTTLE-BY-BOTTLE COMMISSION DETAILS            */}
      {/* ======================================================== */}
      {selectedBottleDetailDate && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs">
          <div className="relative w-full max-w-2xl rounded-3xl bg-white dark:bg-[#1A1A1E] border border-amber-400/40 p-5 shadow-2xl space-y-3.5 max-h-[90vh] flex flex-col">
            <div className="flex items-center justify-between border-b border-slate-200 dark:border-white/10 pb-3 shrink-0">
              <h3 className="text-sm font-black text-slate-900 dark:text-white flex items-center gap-2">
                <Info size={16} className="text-amber-500" />
                <span>بيان وتوزيع شرائح العمولات لكل زجاجة بيعت يوم ({selectedBottleDetailDate})</span>
              </h3>
              <button type="button" onClick={() => setSelectedBottleDetailDate(null)} className="p-1 text-slate-400">
                <X size={18} />
              </button>
            </div>

            <div className="overflow-y-auto pr-1 space-y-2 flex-1 text-xs">
              {(() => {
                const calc = calculateExactDailyCommission(sales, selectedEmployeeName, selectedBottleDetailDate, policies[0] || DEFAULT_COMMISSION_POLICY);
                if (calc.bottleDetails.length === 0) {
                  return <div className="p-6 text-center text-slate-500 font-bold">لا توجد مبيعات لهذا الموظف في هذا اليوم.</div>;
                }
                return (
                  <div className="space-y-2">
                    <div className="grid grid-cols-3 gap-2 p-3 rounded-2xl bg-amber-500/10 border border-amber-400/30 text-[11px] font-bold">
                      <div>إجمالي البخاخ: <span className="font-mono">{calc.totalSprayBottlesCount}</span></div>
                      <div>شريحة 5%: <span className="font-mono text-emerald-600">{calc.bottlesAt5PercentCount}</span></div>
                      <div>شريحة 7%: <span className="font-mono text-amber-600">{calc.bottlesAt7PercentCount}</span></div>
                    </div>

                    <div className="overflow-x-auto rounded-2xl border border-slate-200 dark:border-white/10">
                      <table className="w-full text-right text-xs">
                        <thead className="bg-slate-100 dark:bg-white/5 font-black text-slate-800 dark:text-slate-200">
                          <tr>
                            <th className="py-2 px-2.5">رقم العبوة</th>
                            <th className="py-2 px-2.5">اسم العطر والعبوة</th>
                            <th className="py-2 px-2.5">الصافي بعد الخصم</th>
                            <th className="py-2 px-2.5">الشريحة المطبقة</th>
                            <th className="py-2 px-2.5">العمولة المحسوبة</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100 dark:divide-white/5 font-mono">
                          {calc.bottleDetails.map((b, idx) => (
                            <tr key={idx} className="hover:bg-slate-50 dark:hover:bg-white/5">
                              <td className="py-2 px-2.5 font-black">
                                {b.isRollOn ? 'رول' : `#${b.bottleNumberToday}`}
                              </td>
                              <td className="py-2 px-2.5">
                                <div className="font-bold">{b.productName}</div>
                                <div className="text-[10px] text-slate-400">{b.bottleSize}مل ({b.productType})</div>
                              </td>
                              <td className="py-2 px-2.5 font-bold">{b.netEligiblePrice} ج</td>
                              <td className="py-2 px-2.5">
                                <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                                  b.appliedRate === 0.07 ? 'bg-amber-500/15 text-amber-800' : 'bg-emerald-500/15 text-emerald-800'
                                }`}>
                                  {b.tierLabel}
                                </span>
                              </td>
                              <td className="py-2 px-2.5 font-black text-emerald-600">
                                +{b.commissionEgp} ج.م
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                );
              })()}
            </div>
          </div>
        </div>
      )}

      {/* ======================================================== */}
      {/* MODAL 4: PRINTABLE PAYOUT VOUCHER MODAL                 */}
      {/* ======================================================== */}
      {viewingVoucher && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs">
          <div className="relative w-full max-w-md rounded-3xl bg-white dark:bg-[#1A1A1E] border border-amber-400/40 p-5 shadow-2xl space-y-4">
            <div className="flex items-center justify-between border-b border-slate-200 dark:border-white/10 pb-3">
              <h3 className="text-sm font-black text-slate-900 dark:text-white flex items-center gap-1.5">
                <Receipt size={16} className="text-amber-500" />
                <span>إيصال صرف نقدية ومستحقات لمسة عطر</span>
              </h3>
              <button type="button" onClick={() => setViewingVoucher(null)} className="p-1 text-slate-400">
                <X size={18} />
              </button>
            </div>

            {/* Thermal Voucher Printable Area */}
            <div id="payout-voucher-printable" className="p-4 rounded-2xl bg-amber-50/50 dark:bg-white/5 border border-amber-300 dark:border-white/10 space-y-3 text-xs">
              <div className="text-center space-y-0.5 border-b border-amber-200 dark:border-white/10 pb-2">
                <h4 className="font-black text-sm text-slate-900 dark:text-white">متجر لمسة عطر Lamsa Etr</h4>
                <p className="text-[10px] text-slate-500">إيصال سند صرف مستحقات عاملين وصندوق</p>
                <strong className="font-mono text-xs text-amber-600 block">{viewingVoucher.receiptReference}</strong>
              </div>

              <div className="space-y-1.5 text-slate-800 dark:text-slate-200">
                <div className="flex justify-between"><span>المستلم (الموظف):</span><strong className="font-bold">{viewingVoucher.employeeName}</strong></div>
                <div className="flex justify-between"><span>التاريخ والتوقيت:</span><strong className="font-mono">{new Date(viewingVoucher.date).toLocaleString('ar-EG')}</strong></div>
                <div className="flex justify-between"><span>نوع المستحق:</span><strong className="font-bold">{viewingVoucher.transactionType.replace(/_/g, ' ')}</strong></div>
                <div className="flex justify-between"><span>وسيلة الدفع:</span><strong className="font-bold text-emerald-600">{viewingVoucher.paymentMethod}</strong></div>
                <div className="flex justify-between border-t border-amber-200 pt-1"><span>المبلغ المصروف:</span><strong className="font-mono font-black text-base text-slate-900 dark:text-white">{viewingVoucher.totalAmountEgp.toLocaleString('ar-EG')} ج.م</strong></div>
                <div className="flex justify-between text-[11px] text-slate-500"><span>البيان والسبب:</span><span>{viewingVoucher.reason}</span></div>
              </div>

              <div className="pt-3 border-t border-dashed border-amber-300 flex justify-between text-[10.5px] font-bold text-slate-600">
                <div>توقيع المستلم: ....................</div>
                <div>اعتماد الإدارة: {viewingVoucher.approvedBy}</div>
              </div>
            </div>

            <div className="flex justify-end gap-2">
              <button type="button" onClick={() => setViewingVoucher(null)} className="px-4 py-2 rounded-xl bg-slate-100 font-bold text-xs">
                إغلاق
              </button>
              <button
                type="button"
                onClick={() => window.print()}
                className="px-5 py-2 rounded-xl bg-slate-900 text-white font-black text-xs shadow-md flex items-center gap-1.5 cursor-pointer"
              >
                <Printer size={14} />
                <span>طباعة الإيصال الرسمية</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default StaffEntitlements;
