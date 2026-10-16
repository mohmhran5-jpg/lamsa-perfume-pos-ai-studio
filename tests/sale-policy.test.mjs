import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import ts from 'typescript';
import { calculatePromotionTotals } from '../services/promotionPolicy.ts';

// Node's --experimental-strip-types cannot erase TypeScript enums. Compile this
// standalone model module in memory; no project file or generated artifact changes.
const typesSource = await readFile(new URL('../types.ts', import.meta.url), 'utf8');
const typesJavaScript = ts.transpileModule(typesSource, {
  compilerOptions: {
    module: ts.ModuleKind.ESNext,
    target: ts.ScriptTarget.ES2022,
  },
}).outputText;
const {
  DEFAULT_BOTTLE_SIZES,
  DEFAULT_SETTINGS,
  calculateMaxSafeDiscount,
  calculateMixBottleAccounting,
  calculateNonRetroactiveTieredCommission,
  calculateSafeLoyaltyRedemption,
  validateStrictSaleSafety,
} = await import(`data:text/javascript;base64,${Buffer.from(typesJavaScript).toString('base64')}`);

test('mix accounting remains available and approves a valid, in-stock formula', () => {
  const bottle = DEFAULT_BOTTLE_SIZES.find((item) => item.sizeMl === 30) || DEFAULT_BOTTLE_SIZES[0];
  assert.ok(bottle, 'default bottle sizes should be configured');
  const result = calculateMixBottleAccounting({
    bottle,
    components: [{
      productId: 'oil-one',
      productName: 'Oil One',
      productType: 'عادي',
      grams: bottle.essenceGrams,
      availableStockGrams: bottle.essenceGrams + 20,
    }],
    settings: DEFAULT_SETTINGS,
  });
  assert.equal(result.totalEssenceGrams, bottle.essenceGrams);
  assert.equal(result.hasStockShortage, false);
  assert.equal(result.canApproveMix, true);
  assert.ok(result.finalSellingPriceEgp >= result.minSafeSellingPriceEgp);
  assert.equal(result.enrichedComponents.length, 1);
});

test('safe discount boundary is allowed and one additional pound is rejected', () => {
  const grossPrice = 120;
  const productCost = 40;
  const maxDiscount = calculateMaxSafeDiscount(grossPrice, productCost, 10, 0.05);
  const finalPrice = grossPrice - maxDiscount;
  const allowed = validateStrictSaleSafety({
    grossPrice,
    discountAmount: maxDiscount,
    productCost,
    commissionAmount: Math.round(finalPrice * 0.05),
    commissionRateForMinCalc: 0.05,
  });
  assert.equal(allowed.isAllowed, true);
  assert.ok(allowed.netContribution >= 10);

  const rejected = validateStrictSaleSafety({
    grossPrice,
    discountAmount: maxDiscount + 1,
    productCost,
    commissionAmount: Math.round((finalPrice - 1) * 0.05),
    commissionRateForMinCalc: 0.05,
  });
  assert.equal(rejected.isAllowed, false);
  assert.ok(rejected.netContribution < 10);
});

test('loyalty redemption stays inside the remaining safe-discount budget', () => {
  const settings = {
    ...DEFAULT_SETTINGS,
    loyaltyEnabled: true,
    loyaltyCashPerPointEgp: 1,
    loyaltyMinRedeemPoints: 1,
    loyaltyMaxBillDiscountPercent: 50,
    loyaltyMinSafeMarginEgp: 10,
    loyaltyProtectBreakEven: false,
    loyaltyAutoAI: false,
    loyaltyStrategyMode: 'growth_vip',
    dailyTargetProfit: 100,
  };
  const loyalty = calculateSafeLoyaltyRedemption({
    billSubtotal: 120,
    billTotalCost: 40,
    commissionRate: 0.05,
    manualDiscount: 20,
    customerAvailablePoints: 1000,
    settings,
    todayNetContribution: 1000,
    dailyBreakEvenTarget: 100,
  });
  assert.ok(loyalty.maxSafeLoyaltyDiscountEgp > 0);
  const totalDiscount = 20 + loyalty.maxSafeLoyaltyDiscountEgp;
  const netPrice = 120 - totalDiscount;
  const safety = validateStrictSaleSafety({
    grossPrice: 120,
    discountAmount: 20,
    loyaltyDiscountAmount: loyalty.maxSafeLoyaltyDiscountEgp,
    productCost: 40,
    commissionAmount: Math.round(netPrice * 0.05),
    commissionRateForMinCalc: 0.05,
  });
  assert.equal(safety.isAllowed, true);
  assert.ok(totalDiscount <= calculateMaxSafeDiscount(120, 40, 10, 0.05));
});

test('tiered commission applies the higher rate only after the threshold, without retroactive repricing', () => {
  const commission = calculateNonRetroactiveTieredCommission({
    items: [{ netUnitSellingPrice: 100, quantity: 4 }],
    priorSprayBottlesSoldToday: 8,
    baseRate: 0.05,
    tieredRate: 0.07,
    tierThreshold: 10,
  });
  assert.equal(commission.bottlesAt5Percent, 2);
  assert.equal(commission.bottlesAt7Percent, 2);
  assert.equal(commission.totalCommissionEgp, 24);
  assert.deepEqual(commission.perBottleBreakdown.map((item) => item.appliedRate), [0.05, 0.05, 0.07, 0.07]);
});

test('promotion totals preserve preset/custom arithmetic and never create a negative total', () => {
  assert.deepEqual(calculatePromotionTotals(200, 'percent', 20), {
    originalTotal: 200,
    finalTotal: 160,
    savedAmount: 40,
    savingsPercent: 20,
  });
  assert.deepEqual(calculatePromotionTotals(200, 'fixed', 300), {
    originalTotal: 200,
    finalTotal: 0,
    savedAmount: 200,
    savingsPercent: 100,
  });
});
