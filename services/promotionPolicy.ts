export type PromotionDiscountType = 'percent' | 'fixed';

export interface PromotionTotals {
  originalTotal: number;
  finalTotal: number;
  savedAmount: number;
  savingsPercent: number;
}

/** Shared deterministic calculation used by the preset and custom bundle UI. */
export function calculatePromotionTotals(
  originalTotal: number,
  discountType: PromotionDiscountType,
  discountValue: number,
): PromotionTotals {
  const savedAmount = discountType === 'percent'
    ? Math.round((originalTotal * discountValue) / 100)
    : Math.min(originalTotal, discountValue);
  const finalTotal = Math.max(0, originalTotal - savedAmount);
  const savingsPercent = originalTotal > 0 ? Math.round((savedAmount / originalTotal) * 100) : 0;
  return { originalTotal, finalTotal, savedAmount, savingsPercent };
}
