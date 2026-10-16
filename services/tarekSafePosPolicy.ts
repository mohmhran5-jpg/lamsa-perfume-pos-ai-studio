import type { WorkerSaleIntentComponentV2 } from './workerSaleContract';

/** Client-visible labels and customer prices only; packaging costs remain server-side. */
export const TAREK_SAFE_PACKAGING_OPTIONS = [
  { id: 'basic_bag', label: 'كيس بلاستيكي أساسي (مشمول)', customerPriceEgp: 0, type: 'basic' },
  { id: 'luxury_box', label: 'العلبة الفاخرة فقط', customerPriceEgp: 10, type: 'luxury' },
  { id: 'luxury_bag', label: 'الكيس الفاخر', customerPriceEgp: 10, type: 'luxury' },
  { id: 'luxury_both', label: 'العلبة + الكيس الفاخر', customerPriceEgp: 20, type: 'luxury' },
] as const;

export type TarekSafePackagingOptionId = typeof TAREK_SAFE_PACKAGING_OPTIONS[number]['id'];

/** Validate an operator-entered mix without accepting or returning any financial fields. */
export function normalizeTarekMixComponents(
  targetGrams: number,
  components: Array<{ productId: string; gramsPerBottle: number }>,
): WorkerSaleIntentComponentV2[] {
  if (!Number.isSafeInteger(targetGrams) || targetGrams <= 0) {
    throw new Error('يجب أن يحدد المالك كمية زيت صحيحة لهذه العبوة أولاً.');
  }
  if (!Array.isArray(components) || components.length < 2 || components.length > 3) {
    throw new Error('يجب اختيار مكوّنين أو ثلاثة مكوّنات فقط للميكس.');
  }

  const normalized = components.map(({ productId, gramsPerBottle }) => {
    const id = String(productId ?? '').trim();
    if (!id || id.length > 1500 || id.includes('/') || id === '.' || id === '..') {
      throw new Error('اختر منتجاً صالحاً لكل مكوّن ميكس.');
    }
    if (!Number.isSafeInteger(gramsPerBottle) || gramsPerBottle <= 0) {
      throw new Error('أدخل غرامات صحيحة موجبة لكل مكوّن.');
    }
    return { productId: id, gramsPerBottle };
  });

  if (new Set(normalized.map((component) => component.productId)).size !== normalized.length) {
    throw new Error('لا يمكن تكرار المنتج نفسه في مكوّنات الميكس.');
  }
  if (normalized.reduce((sum, component) => sum + component.gramsPerBottle, 0) !== targetGrams) {
    throw new Error(`يجب أن يساوي مجموع المكونات ${targetGrams} جم بالضبط.`);
  }
  return normalized;
}
