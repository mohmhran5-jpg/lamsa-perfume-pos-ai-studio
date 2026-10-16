export interface TarekSalePresetOffer {
  id: string;
  name: string;
  sizeMl: number;
  quantity: number;
  discountType: 'percent' | 'fixed';
  discountValue: number;
}

/** Must stay in sync with the server-authoritative PRESET_PROMOTIONS in the local Worker. */
export const TAREK_SALE_PRESET_OFFERS: readonly TarekSalePresetOffer[] = [
  { id: 'duo-50ml', name: 'عرض الثنائية الأنيقة (2 × 50 مل)', sizeMl: 50, quantity: 2, discountType: 'percent', discountValue: 10 },
  { id: 'trio-royal', name: 'باقة الثلاثية الملكية (3 × 50 مل)', sizeMl: 50, quantity: 3, discountType: 'percent', discountValue: 15 },
  { id: 'diamond-100ml', name: 'العرض الماسي المباشر (2 × 100 مل)', sizeMl: 100, quantity: 2, discountType: 'percent', discountValue: 20 },
  { id: 'duo-30ml', name: 'عرض الدوام المزدوج (2 × 30 مل)', sizeMl: 30, quantity: 2, discountType: 'fixed', discountValue: 50 },
] as const;
