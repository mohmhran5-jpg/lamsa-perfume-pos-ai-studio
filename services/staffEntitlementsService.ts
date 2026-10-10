/**
 * Staff Entitlements, Commissions, Salaries & Financial Settlements Engine
 * Lamsa Etr Perfume POS - Executive Accounting System
 */

import {
  Sale,
  PerfumeType,
  FinancialVault,
  CommissionPolicy,
  StaffBaseSalaryConfig,
  StaffIncentive,
  StaffDeduction,
  StaffAdvance,
  StaffSettlementTransaction,
  DailyCommissionAuditRecord,
  CommissionAuditLog,
  StaffMemberEntitlementSummary,
  isLiveProductionSale,
  isTestOrExampleRecord
} from '../types';
import { loadDataSync, persistDataDurable } from './persistenceService';

// Default Commission Policy
export const DEFAULT_COMMISSION_POLICY: CommissionPolicy = {
  id: 'policy-std-2026',
  policyName: 'سياسة العمولات المتدرجة المعتمدة (5% أول 10 عبوات - 7% العبوات الزائدة)',
  baseRate: 0.05,
  tieredRate: 0.07,
  tierThresholdBottles: 10,
  eligibleTypes: ['عادي', 'نيش', 'مسك', 'عود'],
  isRollOnEligible: false,
  effectiveStartDate: '2026-01-01',
  approvedBy: 'د. محمد',
  approvedAt: '2026-01-01T00:00:00.000Z',
  reason: 'السياسة التشغيلية المعتمدة لمتجر لمسة عطر',
  isActive: true,
};

// Default Staff Salary Configs
export const DEFAULT_STAFF_SALARY_CONFIGS: StaffBaseSalaryConfig[] = [
  {
    id: 'sal-cfg-tarek',
    employeeId: 'user-tarek',
    employeeName: 'طارق',
    monthlySalaryEgp: 1000,
    effectiveStartDate: '2026-01-01',
    payPeriodFrequency: 'monthly',
    approvedBy: 'د. محمد',
    notes: 'الراتب الثابت الشهري المعتمد (1,000 ج.م)',
  },
];

// Persistence Keys
const KEYS = {
  POLICIES: 'lamsa_commission_policies_v1',
  SALARIES: 'lamsa_staff_salaries_v1',
  INCENTIVES: 'lamsa_staff_incentives_v1',
  DEDUCTIONS: 'lamsa_staff_deductions_v1',
  ADVANCES: 'lamsa_staff_advances_v1',
  SETTLEMENTS: 'lamsa_staff_settlements_v1',
  AUDIT_LOGS: 'lamsa_commission_audit_logs_v1',
  DAILY_RECORDS: 'lamsa_daily_commission_records_v1',
};

// ========================================================
// 1. DATA STORAGE LOADERS & PERSISTENCE
// ========================================================

export function loadCommissionPolicies(): CommissionPolicy[] {
  return loadDataSync<CommissionPolicy[]>(KEYS.POLICIES, [DEFAULT_COMMISSION_POLICY]);
}

export function saveCommissionPolicies(policies: CommissionPolicy[]): void {
  persistDataDurable(KEYS.POLICIES, policies);
}

export function loadStaffSalaryConfigs(): StaffBaseSalaryConfig[] {
  return loadDataSync<StaffBaseSalaryConfig[]>(KEYS.SALARIES, DEFAULT_STAFF_SALARY_CONFIGS);
}

export function saveStaffSalaryConfigs(configs: StaffBaseSalaryConfig[]): void {
  persistDataDurable(KEYS.SALARIES, configs);
}

export function loadStaffIncentives(): StaffIncentive[] {
  return loadDataSync<StaffIncentive[]>(KEYS.INCENTIVES, []);
}

export function saveStaffIncentives(list: StaffIncentive[]): void {
  persistDataDurable(KEYS.INCENTIVES, list);
}

export function loadStaffDeductions(): StaffDeduction[] {
  return loadDataSync<StaffDeduction[]>(KEYS.DEDUCTIONS, []);
}

export function saveStaffDeductions(list: StaffDeduction[]): void {
  persistDataDurable(KEYS.DEDUCTIONS, list);
}

export function loadStaffAdvances(): StaffAdvance[] {
  return loadDataSync<StaffAdvance[]>(KEYS.ADVANCES, []);
}

export function saveStaffAdvances(list: StaffAdvance[]): void {
  persistDataDurable(KEYS.ADVANCES, list);
}

export function loadStaffSettlementTransactions(): StaffSettlementTransaction[] {
  return loadDataSync<StaffSettlementTransaction[]>(KEYS.SETTLEMENTS, []);
}

export function saveStaffSettlementTransactions(list: StaffSettlementTransaction[]): void {
  persistDataDurable(KEYS.SETTLEMENTS, list);
}

export function loadCommissionAuditLogs(): CommissionAuditLog[] {
  return loadDataSync<CommissionAuditLog[]>(KEYS.AUDIT_LOGS, []);
}

export function saveCommissionAuditLogs(logs: CommissionAuditLog[]): void {
  persistDataDurable(KEYS.AUDIT_LOGS, logs);
}

export function loadDailyCommissionAuditRecords(): DailyCommissionAuditRecord[] {
  return loadDataSync<DailyCommissionAuditRecord[]>(KEYS.DAILY_RECORDS, []);
}

export function saveDailyCommissionAuditRecords(records: DailyCommissionAuditRecord[]): void {
  persistDataDurable(KEYS.DAILY_RECORDS, records);
}

// Helper: match active commission policy for a specific date
export function getActivePolicyForDate(dateIso: string, policies: CommissionPolicy[]): CommissionPolicy {
  const targetDate = dateIso.slice(0, 10);
  const active = policies.filter(p => p.isActive);
  for (const policy of active) {
    if (policy.effectiveStartDate <= targetDate) {
      if (!policy.effectiveEndDate || policy.effectiveEndDate >= targetDate) {
        return policy;
      }
    }
  }
  return policies[0] || DEFAULT_COMMISSION_POLICY;
}

// Helper: normalize employee name for exact matching
export function normalizeEmployeeName(name?: string): string {
  if (!name) return 'طارق';
  const cleaned = name.replace(/\(.*?\)/g, '').trim();
  if (cleaned.includes('طارق')) return 'طارق';
  if (cleaned.includes('محمد') || cleaned.includes('مالك') || cleaned.includes('إدارة')) return 'د. محمد';
  return cleaned || 'طارق';
}

// Check if user is owner/admin (should NOT earn commission)
export function isOwnerOrAdminUser(nameStr?: string): boolean {
  const norm = normalizeEmployeeName(nameStr);
  return norm === 'د. محمد' || norm.includes('محمد');
}

// ========================================================
// 2. DAILY COMMISSION CALCULATION ENGINE
// ========================================================

export interface BottleCommissionDetail {
  bottleNumberToday: number;
  saleId: string;
  saleTime: string;
  productName: string;
  productType: PerfumeType;
  bottleSize: number;
  isRollOn: boolean;
  rawPrice: number;
  discountPortion: number;
  netEligiblePrice: number;
  appliedRate: number;
  commissionEgp: number;
  tierLabel: string;
}

export interface DetailedDailyCommissionCalculation {
  dateIso: string;
  employeeName: string;
  policyUsed: CommissionPolicy;
  totalSalesCount: number;
  eligibleSalesCount: number;
  totalSprayBottlesCount: number;
  totalRollOnBottlesCount: number;
  bottlesAt5PercentCount: number;
  bottlesAt7PercentCount: number;
  tier1CommissionEgp: number; // 5% tier sum
  tier2CommissionEgp: number; // 7% tier sum
  totalCommissionEgp: number;
  eligibleNetRevenueEgp: number;
  bottleDetails: BottleCommissionDetail[];
}

/**
 * Calculates exact daily commission for an employee on a given date (YYYY-MM-DD).
 * Accounts for:
 * - Chronological order of sales on that day
 * - First 10 spray bottles = 5%, 11+ spray bottles = 7%
 * - Roll-on = 0%
 * - Cancelled/Reversed/Gifts/Samples = 0%
 * - Proportional discount distribution per line item
 * - 2 decimal places currency precision
 */
export function calculateExactDailyCommission(
  sales: Sale[],
  employeeName: string,
  dateIsoStr: string,
  policy: CommissionPolicy
): DetailedDailyCommissionCalculation {
  const targetDate = dateIsoStr.slice(0, 10);
  const targetEmployee = normalizeEmployeeName(employeeName);

  // If employee is Owner (Mohamed), owner gets 0 commission
  if (isOwnerOrAdminUser(targetEmployee)) {
    return {
      dateIso: targetDate,
      employeeName: targetEmployee,
      policyUsed: policy,
      totalSalesCount: 0,
      eligibleSalesCount: 0,
      totalSprayBottlesCount: 0,
      totalRollOnBottlesCount: 0,
      bottlesAt5PercentCount: 0,
      bottlesAt7PercentCount: 0,
      tier1CommissionEgp: 0,
      tier2CommissionEgp: 0,
      totalCommissionEgp: 0,
      eligibleNetRevenueEgp: 0,
      bottleDetails: [],
    };
  }

  // Filter sales for target date & employee
  const daySales = sales
    .filter((s) => {
      if (isTestOrExampleRecord(s)) return false;
      if (!s.date.startsWith(targetDate)) return false;
      const emp = normalizeEmployeeName(s.employeeName);
      return emp === targetEmployee;
    })
    .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());

  let totalSalesCount = daySales.length;
  let eligibleSalesCount = 0;
  let runningSprayIndex = 0;
  let totalSprayBottlesCount = 0;
  let totalRollOnBottlesCount = 0;
  let bottlesAt5PercentCount = 0;
  let bottlesAt7PercentCount = 0;
  let tier1CommissionEgp = 0;
  let tier2CommissionEgp = 0;
  let eligibleNetRevenueEgp = 0;
  const bottleDetails: BottleCommissionDetail[] = [];

  for (const sale of daySales) {
    // Exclude reversed, cancelled, or non-live production sales
    if (sale.isReversed || !isLiveProductionSale(sale)) {
      continue;
    }

    eligibleSalesCount += 1;

    // Calculate invoice discount proportion
    const grossTotal = (sale.items || []).reduce(
      (acc, item) => acc + (item.sellingPrice || 0) * (item.quantity || 1),
      0
    );
    const netTotal = sale.totalPrice || grossTotal;
    const discountRatio = grossTotal > 0 ? netTotal / grossTotal : 1;

    for (const item of sale.items || []) {
      const qty = Math.max(1, Math.floor(item.quantity || 1));
      const rawUnitPrice = item.sellingPrice || 0;
      const netUnitPrice = Math.round(rawUnitPrice * discountRatio);
      const discountPortion = Math.round(rawUnitPrice - netUnitPrice);
      const isRoll = Boolean(item.isRollOn || item.productType === 'مسك' && item.bottleSize <= 12);

      for (let q = 0; q < qty; q++) {
        if (isRoll) {
          totalRollOnBottlesCount += 1;
          bottleDetails.push({
            bottleNumberToday: 0,
            saleId: sale.id,
            saleTime: sale.date,
            productName: item.productName || 'عبوة رول',
            productType: item.productType || 'مسك',
            bottleSize: item.bottleSize || 10,
            isRollOn: true,
            rawPrice: rawUnitPrice,
            discountPortion,
            netEligiblePrice: netUnitPrice,
            appliedRate: 0,
            commissionEgp: 0,
            tierLabel: 'رول (0%)',
          });
        } else {
          runningSprayIndex += 1;
          totalSprayBottlesCount += 1;
          eligibleNetRevenueEgp += netUnitPrice;

          const isTier1 = runningSprayIndex <= policy.tierThresholdBottles;
          const rate = isTier1 ? policy.baseRate : policy.tieredRate;
          const comm = Math.round(netUnitPrice * rate);

          if (isTier1) {
            bottlesAt5PercentCount += 1;
            tier1CommissionEgp += comm;
          } else {
            bottlesAt7PercentCount += 1;
            tier2CommissionEgp += comm;
          }

          bottleDetails.push({
            bottleNumberToday: runningSprayIndex,
            saleId: sale.id,
            saleTime: sale.date,
            productName: item.productName || 'زجاجة عطر بخاخ',
            productType: item.productType || 'عادي',
            bottleSize: item.bottleSize || 50,
            isRollOn: false,
            rawPrice: rawUnitPrice,
            discountPortion,
            netEligiblePrice: netUnitPrice,
            appliedRate: rate,
            commissionEgp: comm,
            tierLabel: isTier1 ? `الشريحة الأولى (${policy.baseRate * 100}%)` : `الشريحة الثانية (${policy.tieredRate * 100}%)`,
          });
        }
      }
    }
  }

  tier1CommissionEgp = Math.round(tier1CommissionEgp);
  tier2CommissionEgp = Math.round(tier2CommissionEgp);
  const totalCommissionEgp = Math.round(tier1CommissionEgp + tier2CommissionEgp);
  eligibleNetRevenueEgp = Math.round(eligibleNetRevenueEgp);

  return {
    dateIso: targetDate,
    employeeName: targetEmployee,
    policyUsed: policy,
    totalSalesCount,
    eligibleSalesCount,
    totalSprayBottlesCount,
    totalRollOnBottlesCount,
    bottlesAt5PercentCount,
    bottlesAt7PercentCount,
    tier1CommissionEgp,
    tier2CommissionEgp,
    totalCommissionEgp,
    eligibleNetRevenueEgp,
    bottleDetails,
  };
}

// ========================================================
// 3. HISTORICAL AUDIT & RECALCULATION ENGINE
// ========================================================

/**
 * Scans a date range, audits all historical sales against expected tiered commission,
 * compares with recorded entitlements and payouts, and identifies missing or mismatched days.
 */
export function auditHistoricalCommissionsPeriod(
  sales: Sale[],
  employeeName: string,
  startDateIso: string,
  endDateIso: string,
  policies: CommissionPolicy[],
  existingRecords: DailyCommissionAuditRecord[],
  settlements: StaffSettlementTransaction[]
): DailyCommissionAuditRecord[] {
  const targetEmployee = normalizeEmployeeName(employeeName);
  const start = startDateIso.slice(0, 10);
  const end = endDateIso.slice(0, 10);

  const resultMap = new Map<string, DailyCommissionAuditRecord>();

  // Collect all distinct dates in range or dates with sales
  const datesSet = new Set<string>();
  const curr = new Date(start);
  const last = new Date(end);

  while (curr <= last) {
    datesSet.add(curr.toISOString().slice(0, 10));
    curr.setDate(curr.getDate() + 1);
  }

  sales.forEach((s) => {
    if (isTestOrExampleRecord(s)) return;
    const iso = s.date.slice(0, 10);
    const emp = normalizeEmployeeName(s.employeeName);
    if (emp === targetEmployee && iso >= start && iso <= end) {
      datesSet.add(iso);
    }
  });

  const sortedDates = Array.from(datesSet).sort();

  for (const dateIso of sortedDates) {
    const policy = getActivePolicyForDate(dateIso, policies);
    const calc = calculateExactDailyCommission(sales, targetEmployee, dateIso, policy);

    // Check existing recorded audit
    const recordId = `comm-audit-${targetEmployee}-${dateIso}`;
    const existing = existingRecords.find((r) => r.id === recordId || (r.date === dateIso && r.employeeName === targetEmployee));

    // Calculate payouts already executed for this date if tracked
    const paidForDate = (settlements || [])
      .filter((s) => s.employeeName === targetEmployee && s.status === 'تم_الصرف' && s.date.startsWith(dateIso))
      .reduce((sum, s) => sum + (s.breakdown.commissionEgp || 0), 0);

    const recordedVal = existing ? existing.recordedInEntitlementsEgp : (existing ? existing.calculatedCommissionEgp : calc.totalCommissionEgp);
    const delta = Math.round(calc.totalCommissionEgp - recordedVal);

    let auditState: 'معتمدة' | 'تحتاج_مراجعة' | 'فرق_غير_معتمد' | 'لم_تُحتسب_بعد' = 'لم_تُحتسب_بعد';
    if (existing) {
      if (Math.abs(delta) < 1) {
        auditState = 'معتمدة';
      } else {
        auditState = 'فرق_غير_معتمد';
      }
    } else if (calc.eligibleSalesCount > 0) {
      auditState = 'تحتاج_مراجعة';
    } else {
      auditState = 'معتمدة';
    }

    const auditRecord: DailyCommissionAuditRecord = {
      id: recordId,
      date: dateIso,
      employeeId: targetEmployee === 'طارق' ? 'user-tarek' : 'user-custom',
      employeeName: targetEmployee,
      eligibleSalesCount: calc.eligibleSalesCount,
      sprayBottlesCount: calc.totalSprayBottlesCount,
      rollOnBottlesCount: calc.totalRollOnBottlesCount,
      bottlesAt5Percent: calc.bottlesAt5PercentCount,
      bottlesAt7Percent: calc.bottlesAt7PercentCount,
      eligibleNetRevenueEgp: calc.eligibleNetRevenueEgp,
      calculatedCommissionEgp: calc.totalCommissionEgp,
      tier1CommissionEgp: calc.tier1CommissionEgp,
      tier2CommissionEgp: calc.tier2CommissionEgp,
      adjustmentsAndReturnsEgp: 0,
      policyIdUsed: policy.id,
      recordedInEntitlementsEgp: recordedVal,
      alreadyPaidEgp: paidForDate,
      remainingDueEgp: Math.max(0, Math.round(calc.totalCommissionEgp - paidForDate)),
      auditState,
      discrepancyDeltaEgp: delta,
      lastCalculatedAt: new Date().toISOString(),
      lastApprovedBy: existing?.lastApprovedBy,
      notes: calc.eligibleSalesCount === 0 ? 'لا توجد مبيعات في هذا اليوم' : `حُسبت وفق ${policy.policyName}`,
    };

    resultMap.set(dateIso, auditRecord);
  }

  return Array.from(resultMap.values());
}

/**
 * Approve and commit historical recalculation delta for a date range without duplicate entries.
 */
export function approveAndCommitCommissionAuditRecords(
  recordsToApprove: DailyCommissionAuditRecord[],
  approvingUser: string,
  reason: string
): {
  updatedAuditRecords: DailyCommissionAuditRecord[];
  newLogs: CommissionAuditLog[];
} {
  const existingAuditRecords = loadDailyCommissionAuditRecords();
  const existingLogs = loadCommissionAuditLogs();

  const nextRecords = [...existingAuditRecords];
  const newLogs: CommissionAuditLog[] = [];

  for (const rec of recordsToApprove) {
    const idx = nextRecords.findIndex((r) => r.id === rec.id || (r.date === rec.date && r.employeeName === rec.employeeName));

    const prevVal = idx >= 0 ? nextRecords[idx].recordedInEntitlementsEgp : 0;
    const newVal = rec.calculatedCommissionEgp;
    const delta = Math.round(newVal - prevVal);

    const updatedRec: DailyCommissionAuditRecord = {
      ...rec,
      recordedInEntitlementsEgp: newVal,
      remainingDueEgp: Math.max(0, Math.round(newVal - rec.alreadyPaidEgp)),
      auditState: 'معتمدة',
      discrepancyDeltaEgp: 0,
      lastCalculatedAt: new Date().toISOString(),
      lastApprovedBy: approvingUser,
      notes: `تم الاعتماد والتسوية التاريخية بواسطة ${approvingUser} - ${reason}`,
    };

    if (idx >= 0) {
      nextRecords[idx] = updatedRec;
    } else {
      nextRecords.push(updatedRec);
    }

    if (Math.abs(delta) >= 1) {
      newLogs.push({
        id: `log-comm-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
        date: rec.date,
        employeeName: rec.employeeName,
        previousCommissionEgp: prevVal,
        newCorrectCommissionEgp: newVal,
        differenceDeltaEgp: delta,
        reason: reason || 'مراجعة وتعديل أخطاء العمولات التاريخية',
        approvedBy: approvingUser,
        approvedAt: new Date().toISOString(),
      });
    }
  }

  saveDailyCommissionAuditRecords(nextRecords);

  if (newLogs.length > 0) {
    const mergedLogs = [...newLogs, ...existingLogs];
    saveCommissionAuditLogs(mergedLogs);
  }

  return {
    updatedAuditRecords: nextRecords,
    newLogs,
  };
}

// ========================================================
// 4. ENTITLEMENTS LEDGER AGGREGATION & SUMMARY
// ========================================================

/**
 * Computes complete financial summary for a staff member across salary, commissions,
 * incentives, deductions, advances, and settlements for a selected period.
 */
export function computeStaffMemberEntitlementSummary(
  employeeName: string,
  periodYearMonth: string, // YYYY-MM or 'ALL'
  sales: Sale[],
  policies: CommissionPolicy[],
  salaryConfigs: StaffBaseSalaryConfig[],
  incentives: StaffIncentive[],
  deductions: StaffDeduction[],
  advances: StaffAdvance[],
  settlements: StaffSettlementTransaction[],
  auditRecords: DailyCommissionAuditRecord[]
): StaffMemberEntitlementSummary {
  const normName = normalizeEmployeeName(employeeName);

  // 1. Base Salary calculation
  const salConfig = salaryConfigs.find((c) => normalizeEmployeeName(c.employeeName) === normName) || {
    monthlySalaryEgp: normName === 'طارق' ? 1000 : 0,
  };

  const monthlyBaseSalaryEgp = salConfig.monthlySalaryEgp;
  const dailySalaryRateEgp = Math.round(monthlyBaseSalaryEgp / 25);
  let earnedSalaryPeriodEgp = monthlyBaseSalaryEgp;
  let elapsedWorkDaysPeriod = 25;
  let isCurrentOngoingPeriod = false;

  const now = new Date();
  const currentYearMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  const currentDay = now.getDate();

  if (periodYearMonth === 'ALL') {
    // Count distinct active months in sales history
    const monthsSet = new Set<string>();
    sales.forEach((s) => {
      if (s.date && normalizeEmployeeName(s.employeeName) === normName) {
        monthsSet.add(s.date.slice(0, 7));
      }
    });
    const monthsCount = Math.max(1, monthsSet.size);
    earnedSalaryPeriodEgp = monthlyBaseSalaryEgp * monthsCount;
    elapsedWorkDaysPeriod = 25 * monthsCount;
  } else if (periodYearMonth === currentYearMonth) {
    // Current ongoing month: Prorated daily accrual based on 25 working days
    isCurrentOngoingPeriod = true;
    elapsedWorkDaysPeriod = Math.min(25, Math.max(1, currentDay));
    earnedSalaryPeriodEgp = Math.min(monthlyBaseSalaryEgp, Math.round(dailySalaryRateEgp * elapsedWorkDaysPeriod));
  } else {
    // Historical completed month: Full monthly base salary earned 100%
    earnedSalaryPeriodEgp = monthlyBaseSalaryEgp;
    elapsedWorkDaysPeriod = 25;
  }

  // 2. Earned Commissions in period
  let earnedCommissionsPeriodEgp = 0;
  const filteredAuditRecords = auditRecords.filter((r) => {
    if (normalizeEmployeeName(r.employeeName) !== normName) return false;
    if (periodYearMonth !== 'ALL' && !r.date.startsWith(periodYearMonth)) return false;
    return true;
  });

  if (filteredAuditRecords.length > 0) {
    earnedCommissionsPeriodEgp = filteredAuditRecords.reduce((sum, r) => sum + r.calculatedCommissionEgp, 0);
  } else {
    // Fallback: calculate directly from sales
    const relevantSalesDates = new Set<string>();
    sales.forEach((s) => {
      if (isTestOrExampleRecord(s)) return;
      if (normalizeEmployeeName(s.employeeName) === normName) {
        const iso = s.date.slice(0, 10);
        if (periodYearMonth === 'ALL' || iso.startsWith(periodYearMonth)) {
          relevantSalesDates.add(iso);
        }
      }
    });

    for (const d of relevantSalesDates) {
      const pol = getActivePolicyForDate(d, policies);
      const calc = calculateExactDailyCommission(sales, normName, d, pol);
      earnedCommissionsPeriodEgp += calc.totalCommissionEgp;
    }
  }

  earnedCommissionsPeriodEgp = Math.round(earnedCommissionsPeriodEgp);

  // 3. Approved Incentives in period
  const activeIncentives = incentives.filter((inc) => {
    if (normalizeEmployeeName(inc.employeeName) !== normName) return false;
    if (inc.status === 'ملغى') return false;
    if (periodYearMonth !== 'ALL' && inc.relevantPeriodStr !== periodYearMonth && !inc.date.startsWith(periodYearMonth)) return false;
    return true;
  });
  const approvedIncentivesPeriodEgp = activeIncentives.reduce((sum, i) => sum + i.amountEgp, 0);

  // 4. Approved Deductions in period
  const activeDeductions = deductions.filter((d) => {
    if (normalizeEmployeeName(d.employeeName) !== normName) return false;
    if (d.status === 'ملغى') return false;
    if (periodYearMonth !== 'ALL' && d.relevantPeriodStr !== periodYearMonth && !d.date.startsWith(periodYearMonth)) return false;
    return true;
  });
  const approvedDeductionsEgp = activeDeductions.reduce((sum, d) => sum + d.amountEgp, 0);

  // 5. Active Advances (Outstanding)
  const activeAdvances = advances.filter((adv) => {
    if (normalizeEmployeeName(adv.employeeName) !== normName) return false;
    if (adv.status === 'ملغاة') return false;
    return true;
  });
  const outstandingAdvancesEgp = activeAdvances.reduce((sum, a) => sum + a.remainingAmountEgp, 0);

  // 6. Paid / Settled Transactions
  const activeSettlements = settlements.filter((set) => {
    if (normalizeEmployeeName(set.employeeName) !== normName) return false;
    if (set.status !== 'تم_الصرف') return false;
    if (periodYearMonth !== 'ALL' && !set.date.startsWith(periodYearMonth)) return false;
    return true;
  });
  const totalPreviouslyPaidEgp = activeSettlements.reduce((sum, s) => sum + s.totalAmountEgp, 0);

  // Gross Entitlements before deductions
  const totalEntitlementsGrossEgp = earnedSalaryPeriodEgp + earnedCommissionsPeriodEgp + approvedIncentivesPeriodEgp;
  const netRemainingBalanceDueEgp = Math.max(
    0,
    Math.round(totalEntitlementsGrossEgp - approvedDeductionsEgp - totalPreviouslyPaidEgp)
  );

  const pendingApprovalsCount = incentives.filter((i) => i.status === 'مسودة').length + settlements.filter((s) => s.status === 'بانتظار_الاعتماد').length;
  const discrepanciesAlertCount = filteredAuditRecords.filter((r) => r.auditState === 'فرق_غير_معتمد' || r.auditState === 'تحتاج_مراجعة').length;

  return {
    employeeId: normName === 'طارق' ? 'user-tarek' : 'user-custom',
    employeeName: normName,
    monthlyBaseSalaryEgp,
    dailySalaryRateEgp,
    elapsedWorkDaysPeriod,
    isCurrentOngoingPeriod,
    earnedSalaryPeriodEgp,
    earnedCommissionsPeriodEgp,
    approvedIncentivesPeriodEgp,
    approvedAdditionsEgp: 0,
    outstandingAdvancesEgp,
    approvedDeductionsEgp,
    totalPreviouslyPaidEgp,
    totalEntitlementsGrossEgp,
    netRemainingBalanceDueEgp,
    pendingApprovalsCount,
    discrepanciesAlertCount,
  };
}

// ========================================================
// 5. PAYOUTS & VAULT INTEGRATION
// ========================================================

export function executeStaffPayoutSettlement(params: {
  employeeName: string;
  transactionType: 'سحب_من_المستحقات' | 'سلفة' | 'صرف_راتب' | 'صرف_عمولة' | 'صرف_حافز' | 'تسوية_شاملة';
  totalAmountEgp: number;
  breakdown: {
    commissionEgp?: number;
    salaryEgp?: number;
    incentiveEgp?: number;
    advanceEgp?: number;
    deductionEgp?: number;
  };
  paymentMethod: 'نقدي' | 'محفظة إلكترونية' | 'تحويل بنكي';
  executedBy: string;
  approvedBy: string;
  reason: string;
  notes?: string;
  vaults: FinancialVault[];
  onUpdateVaults: (updatedVaults: FinancialVault[]) => void;
  onAddExpense?: (expense: any) => void;
}): StaffSettlementTransaction {
  const normName = normalizeEmployeeName(params.employeeName);
  const nowIso = new Date().toISOString();
  const txId = `settle-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;

  const settlementTx: StaffSettlementTransaction = {
    id: txId,
    employeeId: normName === 'طارق' ? 'user-tarek' : 'user-custom',
    employeeName: normName,
    date: nowIso,
    transactionType: params.transactionType,
    totalAmountEgp: params.totalAmountEgp,
    breakdown: params.breakdown,
    paymentMethod: params.paymentMethod,
    vaultId: params.paymentMethod === 'نقدي' ? 'commissions' : undefined,
    executedBy: params.executedBy,
    approvedBy: params.approvedBy,
    reason: params.reason,
    notes: params.notes,
    status: 'تم_الصرف',
    receiptReference: `RCP-PAY-${Date.now().toString().slice(-6)}`,
  };

  // 1. Save settlement transaction
  const existingSettlements = loadStaffSettlementTransactions();
  saveStaffSettlementTransactions([settlementTx, ...existingSettlements]);

  // 2. If payout is Cash, reduce Cash Vault balance
  if (params.paymentMethod === 'نقدي' && params.vaults && params.vaults.length > 0) {
    const updatedVaults = params.vaults.map((v) => {
      // Impact commissions vault or salaries vault depending on breakdown
      if (v.id === 'commissions' || v.id === 'salaries') {
        return {
          ...v,
          currentBalance: Math.max(0, v.currentBalance - params.totalAmountEgp),
          totalWithdrawn: v.totalWithdrawn + params.totalAmountEgp,
        };
      }
      return v;
    });
    params.onUpdateVaults(updatedVaults);
  }

  // 3. Log as expense if provided callback
  if (params.onAddExpense) {
    params.onAddExpense({
      id: `exp-sal-${Date.now()}`,
      title: `صرف ${params.transactionType.replace(/_/g, ' ')} - ${normName}`,
      amount: params.totalAmountEgp,
      category: 'رواتب وعمولات',
      date: nowIso.slice(0, 10),
      isRecurringMonthly: false,
      notes: `${params.reason} (${params.paymentMethod}) - معتمد بواسطة ${params.approvedBy}`,
    });
  }

  return settlementTx;
}

export interface IncentiveReserveLedgerSummary {
  openingBalanceEgp: number; // الرصيد الافتتاحي
  monthlyAllocationEgp: number; // المخصص الشهري = 500 ج.م
  approvedAdjustmentsEgp: number; // أي تعديلات معتمدة على المخصص
  proposedIncentivesEgp: number; // الحوافز المقترحة
  approvedUnpaidIncentivesEgp: number; // الحوافز المعتمدة غير المدفوعة
  actuallyPaidIncentivesEgp: number; // الحوافز المدفوعة فعلياً
  availableForApprovalEgp: number; // الرصيد المتاح للاعتماد
  remainingBalanceAfterPayoutEgp: number; // الرصيد المتبقي بعد الصرف
}

/**
  * §3: حساب سجل وسلسلة حركة بند احتياطي حوافز ومكافآت الموظفين
  */
export function calculateIncentiveReserveLedger(
  incentives: StaffIncentive[],
  settlements: StaffSettlementTransaction[],
  monthlyAllocationEgp = 500,
  openingBalanceEgp = 0,
  approvedAdjustmentsEgp = 0
): IncentiveReserveLedgerSummary {
  let proposedIncentivesEgp = 0;
  let approvedUnpaidIncentivesEgp = 0;
  let actuallyPaidIncentivesEgp = 0;

  incentives.forEach((inc) => {
    const amount = Math.round(inc.amountEgp || 0);
    if (inc.status === 'مسودة') {
      proposedIncentivesEgp += amount;
    } else if (inc.status === 'معتمد') {
      approvedUnpaidIncentivesEgp += amount;
    } else if (inc.status === 'مصروف') {
      actuallyPaidIncentivesEgp += amount;
    }
  });

  // Calculate available balance for approval
  // Available = Allocation + Opening + Adjustments - (Approved Unpaid + Actually Paid)
  const totalFund = monthlyAllocationEgp + openingBalanceEgp + approvedAdjustmentsEgp;
  const committedTotal = approvedUnpaidIncentivesEgp + actuallyPaidIncentivesEgp;
  const availableForApprovalEgp = Math.max(0, totalFund - committedTotal);
  const remainingBalanceAfterPayoutEgp = Math.max(0, totalFund - actuallyPaidIncentivesEgp);

  return {
    openingBalanceEgp,
    monthlyAllocationEgp,
    approvedAdjustmentsEgp,
    proposedIncentivesEgp,
    approvedUnpaidIncentivesEgp,
    actuallyPaidIncentivesEgp,
    availableForApprovalEgp,
    remainingBalanceAfterPayoutEgp,
  };
}

