import type { Sale, SaleItem } from '../types';

export const LAMSA_SALE_INTENT_V2 = 'lamsa.sale-intent/v2' as const;
export const LAMSA_TAREK_SALE_INTENT_V3 = 'lamsa.sale-intent/v3' as const;
const MAX_SALE_LINES = 100;
const MAX_COMPONENTS_PER_LINE = 20;
const MAX_TOTAL_COMPONENTS = 400;
const MAX_STOCK_DOCUMENTS = 240;
const MAX_QUANTITY_PER_LINE = 100;

export interface WorkerSaleIntentComponentV2 {
  productId: string;
  gramsPerBottle: number;
}

export interface WorkerSaleIntentLineV2 {
  lineId: string;
  productId?: string;
  bottleSizeId: string;
  bottleSizeMl: number;
  quantity: number;
  essenceGramsPerBottle: number;
  isColoredBottle: boolean;
  /** سعر مطلوب فقط؛ يعيد Worker التحقق من السعر المعتمد والهامش والصلاحية. */
  requestedUnitPriceEgp: number;
  /** معاينة لا تُخزَّن ولا تُستخدم في الحساب؛ يرفض Worker الفاتورة إذا خالفت التكلفة الموثوقة. */
  previewUnitCostEgp: number;
  promotionId?: string;
  customFormulaName?: string;
  mixComponents?: WorkerSaleIntentComponentV2[];
}

/**
 * نية بيع غير موثوقة. السعر والخصم مجرد طلب تجاري؛ يقرأ Worker الأسعار
 * والتكاليف والعمولة والمخزون والخزائن من مراجع موثوقة ويعيد حساب كل ناتج.
 */
export interface WorkerSaleIntentV2 {
  schema: typeof LAMSA_SALE_INTENT_V2;
  saleId: string;
  lines: WorkerSaleIntentLineV2[];
  manualDiscountEgp: number;
  promotionId?: string;
  previewTotalPriceEgp: number;
  previewTotalCostEgp: number;
  previewTotalProfitEgp: number;
  previewCommissionEgp: number;
  loyaltyPointsToRedeem: number;
  customerName?: string;
  customerPhone?: string;
  paymentMethod: 'نقدي' | 'بطاقة' | 'محفظة إلكترونية' | 'تحويل بنكي';
  packagingOptionId?: 'basic_bag' | 'luxury_box' | 'luxury_bag' | 'luxury_both';
  packagingPaid: boolean;
}

export interface TarekSaleLineDraft {
  lineId: string;
  productId?: string;
  bottleSizeId: string;
  bottleSizeMl: number;
  quantity: number;
  essenceGramsPerBottle: number;
  isColoredBottle: boolean;
  promotionId?: string;
  customFormulaName?: string;
  mixComponents?: WorkerSaleIntentComponentV2[];
}

/** بيانات إدخال تشغيلية فقط؛ لا تسمح بتمرير سعر أو تكلفة أو ربح أو عمولة من واجهة الموظف. */
export interface TarekSafeSaleDraft {
  saleId: string;
  quoteId?: string;
  lines: TarekSaleLineDraft[];
  manualDiscountEgp: number;
  promotionId?: string;
  customerName?: string;
  customerPhone?: string;
  paymentMethod: 'نقدي' | 'بطاقة' | 'محفظة إلكترونية' | 'تحويل بنكي';
  packagingOptionId?: 'basic_bag' | 'luxury_box' | 'luxury_bag' | 'luxury_both';
  packagingPaid: boolean;
}

export interface WorkerSaleIntentV3 extends TarekSafeSaleDraft {
  schema: typeof LAMSA_TAREK_SALE_INTENT_V3;
}

function finiteNonNegative(value: unknown, label: string): number {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0) {
    throw new Error(`worker-sale/invalid-${label}`);
  }
  return value;
}

function safeDocumentId(value: unknown, label: string): string {
  const id = String(value ?? '').trim();
  if (!id || id.length > 1500 || id.includes('/') || id === '.' || id === '..') {
    throw new Error(`worker-sale/invalid-${label}`);
  }
  return id;
}

function roundMoney(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

function lineIsMix(item: SaleItem): boolean {
  return item.isMix === true || item.compositionType === 'mix' || item.compositionType === 'ميكس'
    || Boolean(item.mixComponents?.length);
}

function buildLine(item: SaleItem, index: number): WorkerSaleIntentLineV2 {
  const quantity = item.quantity ?? 1;
  if (!Number.isSafeInteger(quantity) || quantity < 1 || quantity > MAX_QUANTITY_PER_LINE) {
    throw new Error('worker-sale/invalid-quantity');
  }
  const bottleSizeMl = finiteNonNegative(item.bottleSize, 'bottle-size');
  if (bottleSizeMl <= 0 || bottleSizeMl > 1000) throw new Error('worker-sale/invalid-bottle-size');
  const totalEssenceGrams = finiteNonNegative(item.essenceGrams, 'essence-grams');
  const essenceGramsPerBottle = totalEssenceGrams / quantity;
  if (!Number.isSafeInteger(essenceGramsPerBottle) || essenceGramsPerBottle <= 0) {
    throw new Error('worker-sale/invalid-essence-grams');
  }
  const requestedLinePrice = finiteNonNegative(item.sellingPrice, 'requested-price');
  const requestedUnitPriceEgp = roundMoney(requestedLinePrice / quantity);
  if (requestedUnitPriceEgp <= 0) throw new Error('worker-sale/invalid-requested-price');
  const totalCost = finiteNonNegative(item.cost, 'preview-cost');
  const previewUnitCostEgp = roundMoney(totalCost / quantity);
  const rawLineId = String(item.id ?? `line-${index + 1}`).trim();
  const lineId = rawLineId && rawLineId.length <= 120 && !rawLineId.includes('/')
    ? rawLineId
    : `line-${index + 1}`;

  const line: WorkerSaleIntentLineV2 = {
    lineId,
    bottleSizeId: safeDocumentId(item.bottleSizeId, 'bottle-size-id'),
    bottleSizeMl,
    quantity,
    essenceGramsPerBottle,
    isColoredBottle: item.isColoredBottle === true,
    requestedUnitPriceEgp,
    previewUnitCostEgp,
    ...(item.promotionId ? { promotionId: safeDocumentId(item.promotionId, 'promotion-id') } : {}),
  };
  if (item.customFormulaName) line.customFormulaName = item.customFormulaName.trim().slice(0, 120);

  if (lineIsMix(item)) {
    const components = item.mixComponents || [];
    if (components.length < 1 || components.length > MAX_COMPONENTS_PER_LINE) {
      throw new Error('worker-sale/invalid-mix-component-count');
    }
    line.mixComponents = components.map((component) => ({
      productId: safeDocumentId(component.productId, 'component-product-id'),
      gramsPerBottle: finiteNonNegative(component.grams, 'component-grams'),
    }));
    if (line.mixComponents.some((component) => !Number.isSafeInteger(component.gramsPerBottle) || component.gramsPerBottle <= 0)) {
      throw new Error('worker-sale/invalid-component-grams');
    }
    if (line.mixComponents.reduce((sum, component) => sum + component.gramsPerBottle, 0) !== essenceGramsPerBottle) {
      throw new Error('worker-sale/mix-essence-mismatch');
    }
  } else {
    line.productId = safeDocumentId(item.productId, 'product-id');
  }
  return line;
}

/** يحول Sale إلى نية مُقيدة؛ لا ينقل الربح/التكلفة/العمولة/الأرصدة/المخزون كحقائق. */
export function toWorkerSaleIntent(sale: Sale): WorkerSaleIntentV2 {
  if (!sale || typeof sale !== 'object' || !Array.isArray(sale.items)) {
    throw new Error('worker-sale/invalid-sale');
  }
  if (sale.transactionType && sale.transactionType !== 'بيع_طبيعي') {
    throw new Error('worker-sale/owner-approval-required');
  }
  if (sale.isBackdated || sale.isReversed || sale.exceptionApprovedBy || sale.exceptionReason) {
    throw new Error('worker-sale/unsupported-sale-state');
  }
  // Only the stable promotion ID is sent to the server. An ad-hoc/custom label
  // is intentionally omitted; its requested amount remains an ordinary safe discount.
  const promotionId = sale.promotionId ?? sale.promotionalSavings?.promotionId;
  if (promotionId != null && (typeof promotionId !== 'string' || !promotionId.trim())) {
    throw new Error('worker-sale/invalid-promotion-id');
  }
  const saleId = safeDocumentId(sale.id, 'sale-id');
  if (!/^[A-Za-z0-9_-]{4,120}$/.test(saleId)) throw new Error('worker-sale/invalid-sale-id');
  if (sale.items.length < 1 || sale.items.length > MAX_SALE_LINES) {
    throw new Error('worker-sale/invalid-line-count');
  }
  const lines = sale.items.map(buildLine);
  if (new Set(lines.map((line) => line.lineId)).size !== lines.length) {
    throw new Error('worker-sale/duplicate-line-id');
  }
  const componentUses = lines.reduce((count, line) => count + (line.mixComponents?.length || 0) * line.quantity, 0);
  if (componentUses > MAX_TOTAL_COMPONENTS) throw new Error('worker-sale/too-many-components');
  const stockProductIds = new Set(lines.flatMap((line) => line.mixComponents
    ? line.mixComponents.map((component) => component.productId) : [line.productId!]));
  if (stockProductIds.size > MAX_STOCK_DOCUMENTS) throw new Error('worker-sale/too-many-stock-documents');

  const totalDiscount = finiteNonNegative(sale.discount ?? 0, 'discount');
  const loyaltyDiscount = finiteNonNegative(sale.loyaltyDiscountAmount ?? 0, 'loyalty-discount');
  if ((sale.loyaltyPointsRedeemed ?? 0) > 0 || loyaltyDiscount > 0) {
    throw new Error('worker-sale/loyalty-authority-required');
  }
  if (loyaltyDiscount > totalDiscount + 0.01) throw new Error('worker-sale/inconsistent-discount');
  const claimedPresetDiscount = promotionId && sale.promotionalSavings?.promotionId === promotionId
    ? finiteNonNegative(sale.promotionalSavings.savedAmount, 'promotion-discount') : 0;
  if (claimedPresetDiscount + loyaltyDiscount > totalDiscount + 0.01) {
    throw new Error('worker-sale/inconsistent-discount');
  }
  // The server independently recalculates a fixed preset. For custom bundles,
  // no campaign metadata crosses this boundary and the full amount is a safe manual discount.
  const manualDiscountEgp = roundMoney(Math.max(0, totalDiscount - loyaltyDiscount - claimedPresetDiscount));
  const previewTotalPriceEgp = finiteNonNegative(sale.totalPrice, 'preview-total-price');
  const previewTotalCostEgp = finiteNonNegative(sale.totalCost, 'preview-total-cost');
  const previewTotalProfitEgp = finiteNonNegative(sale.totalProfit, 'preview-total-profit');
  const previewCommissionEgp = finiteNonNegative(sale.totalCommission ?? sale.commissionAmount, 'preview-commission');
  const loyaltyPointsToRedeem = sale.loyaltyPointsRedeemed ?? 0;
  if (!Number.isSafeInteger(loyaltyPointsToRedeem) || loyaltyPointsToRedeem < 0) {
    throw new Error('worker-sale/invalid-loyalty-points');
  }
  if (loyaltyPointsToRedeem > 0) throw new Error('worker-sale/loyalty-authority-required');
  const paymentMethod = sale.paymentMethod || 'نقدي';
  if (!['نقدي', 'بطاقة', 'محفظة إلكترونية', 'تحويل بنكي'].includes(paymentMethod)) {
    throw new Error('worker-sale/invalid-payment-method');
  }
  const packagingOptionId = sale.packagingOptionId;
  const packagePrices: Record<string, number> = { basic_bag: 0, luxury_box: 10, luxury_bag: 10, luxury_both: 20 };
  if (packagingOptionId && !(packagingOptionId in packagePrices)) {
    throw new Error('worker-sale/invalid-packaging-option');
  }
  const packagingRevenue = finiteNonNegative(sale.packagingRevenueEgp ?? 0, 'packaging-revenue');
  const packagingPaid = packagingRevenue > 0;
  if (packagingPaid && !packagingOptionId) throw new Error('worker-sale/packaging-option-required');
  if (packagingOptionId && packagingRevenue !== (packagingPaid ? packagePrices[packagingOptionId] : 0)) {
    throw new Error('worker-sale/packaging-preview-mismatch');
  }

  const intent: WorkerSaleIntentV2 = {
    schema: LAMSA_SALE_INTENT_V2,
    saleId,
    lines,
    manualDiscountEgp,
    previewTotalPriceEgp,
    previewTotalCostEgp,
    previewTotalProfitEgp,
    previewCommissionEgp,
    loyaltyPointsToRedeem,
    ...(promotionId ? { promotionId: safeDocumentId(promotionId, 'promotion-id') } : {}),
    paymentMethod,
    packagingPaid,
  };
  const customerName = typeof sale.customerName === 'string' ? sale.customerName.trim().slice(0, 120) : '';
  const customerPhone = typeof sale.customerPhone === 'string' ? sale.customerPhone.trim().slice(0, 40) : '';
  if (customerName) intent.customerName = customerName;
  if (customerPhone) intent.customerPhone = customerPhone;
  if (packagingOptionId) intent.packagingOptionId = packagingOptionId;
  return intent;
}

function assertDraftKeys(value: unknown, allowed: readonly string[], label: string): asserts value is Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error(`worker-sale/invalid-${label}`);
  if (Object.keys(value).some((key) => !allowed.includes(key))) throw new Error('worker-sale/unexpected-financial-input');
}

/**
 * Builds the employee-safe v3 payload from an operational draft. It intentionally
 * has no price, cost, profit, commission, loyalty balance, or client totals.
 */
export function toTarekWorkerSaleIntentV3(draft: TarekSafeSaleDraft): WorkerSaleIntentV3 {
  const topKeys = ['saleId', 'quoteId', 'lines', 'manualDiscountEgp', 'promotionId', 'customerName', 'customerPhone',
    'paymentMethod', 'packagingOptionId', 'packagingPaid'];
  assertDraftKeys(draft, topKeys, 'sale-draft');
  const saleId = safeDocumentId(draft.saleId, 'sale-id');
  if (!/^[A-Za-z0-9_-]{4,120}$/.test(saleId)) throw new Error('worker-sale/invalid-sale-id');
  const quoteId = draft.quoteId === undefined ? undefined : safeDocumentId(draft.quoteId, 'quote-id');
  if (quoteId && !/^[A-Za-z0-9_-]{8,120}$/.test(quoteId)) throw new Error('worker-sale/invalid-quote-id');
  if (!Array.isArray(draft.lines) || draft.lines.length < 1 || draft.lines.length > MAX_SALE_LINES) {
    throw new Error('worker-sale/invalid-line-count');
  }
  const lineKeys = ['lineId', 'productId', 'bottleSizeId', 'bottleSizeMl', 'quantity', 'essenceGramsPerBottle',
    'isColoredBottle', 'promotionId', 'customFormulaName', 'mixComponents'];
  let componentUses = 0;
  const stockProductIds = new Set<string>();
  const lines = draft.lines.map((line) => {
    assertDraftKeys(line, lineKeys, 'sale-line');
    const lineId = safeDocumentId(line.lineId, 'line-id');
    if (lineId.length > 120) throw new Error('worker-sale/invalid-line-id');
    if (!Number.isSafeInteger(line.quantity) || line.quantity < 1 || line.quantity > MAX_QUANTITY_PER_LINE) {
      throw new Error('worker-sale/invalid-quantity');
    }
    const bottleSizeMl = finiteNonNegative(line.bottleSizeMl, 'bottle-size');
    const essenceGramsPerBottle = finiteNonNegative(line.essenceGramsPerBottle, 'essence-grams');
    if (bottleSizeMl <= 0 || bottleSizeMl > 1000) throw new Error('worker-sale/invalid-bottle-size');
    if (!Number.isSafeInteger(essenceGramsPerBottle) || essenceGramsPerBottle <= 0) {
      throw new Error('worker-sale/invalid-essence-grams');
    }
    if (typeof line.isColoredBottle !== 'boolean') throw new Error('worker-sale/invalid-color-choice');
    const safeLine: TarekSaleLineDraft = {
      lineId,
      bottleSizeId: safeDocumentId(line.bottleSizeId, 'bottle-size-id'),
      bottleSizeMl,
      quantity: line.quantity,
      essenceGramsPerBottle,
      isColoredBottle: line.isColoredBottle,
    };
    if (line.promotionId !== undefined) safeLine.promotionId = safeDocumentId(line.promotionId, 'promotion-id');
    if (line.customFormulaName !== undefined) {
      if (typeof line.customFormulaName !== 'string' || line.customFormulaName.length > 120) {
        throw new Error('worker-sale/invalid-formula-name');
      }
      safeLine.customFormulaName = line.customFormulaName.trim();
    }
    if (line.mixComponents !== undefined) {
      if (!Array.isArray(line.mixComponents) || line.mixComponents.length < 1
          || line.mixComponents.length > MAX_COMPONENTS_PER_LINE || line.productId !== undefined) {
        throw new Error('worker-sale/invalid-mix-component-count');
      }
      safeLine.mixComponents = line.mixComponents.map((component) => {
        assertDraftKeys(component, ['productId', 'gramsPerBottle'], 'mix-component');
        const gramsPerBottle = finiteNonNegative(component.gramsPerBottle, 'component-grams');
        if (!Number.isSafeInteger(gramsPerBottle) || gramsPerBottle <= 0) throw new Error('worker-sale/invalid-component-grams');
        const productId = safeDocumentId(component.productId, 'component-product-id');
        stockProductIds.add(productId);
        return { productId, gramsPerBottle };
      });
      if (safeLine.mixComponents.reduce((sum, component) => sum + component.gramsPerBottle, 0) !== essenceGramsPerBottle) {
        throw new Error('worker-sale/mix-essence-mismatch');
      }
      componentUses += safeLine.mixComponents.length * line.quantity;
    } else {
      safeLine.productId = safeDocumentId(line.productId, 'product-id');
      stockProductIds.add(safeLine.productId);
    }
    if (line.promotionId) safeLine.promotionId = safeDocumentId(line.promotionId, 'promotion-id');
    return safeLine;
  });
  if (new Set(lines.map((line) => line.lineId)).size !== lines.length) throw new Error('worker-sale/duplicate-line-id');
  if (componentUses > MAX_TOTAL_COMPONENTS) throw new Error('worker-sale/too-many-components');
  if (stockProductIds.size > MAX_STOCK_DOCUMENTS) throw new Error('worker-sale/too-many-stock-documents');

  const manualDiscountEgp = finiteNonNegative(draft.manualDiscountEgp, 'discount');
  const paymentMethod = draft.paymentMethod;
  if (!['نقدي', 'بطاقة', 'محفظة إلكترونية', 'تحويل بنكي'].includes(paymentMethod)) {
    throw new Error('worker-sale/invalid-payment-method');
  }
  if (typeof draft.packagingPaid !== 'boolean') throw new Error('worker-sale/invalid-packaging-paid');
  const allowedPackaging = ['basic_bag', 'luxury_box', 'luxury_bag', 'luxury_both'];
  if (draft.packagingOptionId !== undefined && !allowedPackaging.includes(draft.packagingOptionId)) {
    throw new Error('worker-sale/invalid-packaging-option');
  }
  if (draft.packagingPaid && !draft.packagingOptionId) throw new Error('worker-sale/packaging-option-required');
  if (draft.promotionId !== undefined) safeDocumentId(draft.promotionId, 'promotion-id');
  for (const [field, maxLength] of [['customerName', 120], ['customerPhone', 40]] as const) {
    const value = draft[field];
    if (value !== undefined && (typeof value !== 'string' || value.length > maxLength)) {
      throw new Error(`worker-sale/invalid-${field}`);
    }
  }

  return {
    schema: LAMSA_TAREK_SALE_INTENT_V3,
    saleId,
    ...(quoteId ? { quoteId } : {}),
    lines,
    manualDiscountEgp,
    ...(draft.promotionId ? { promotionId: safeDocumentId(draft.promotionId, 'promotion-id') } : {}),
    ...(draft.customerName?.trim() ? { customerName: draft.customerName.trim() } : {}),
    ...(draft.customerPhone?.trim() ? { customerPhone: draft.customerPhone.trim() } : {}),
    paymentMethod,
    ...(draft.packagingOptionId ? { packagingOptionId: draft.packagingOptionId } : {}),
    packagingPaid: draft.packagingPaid,
  };
}

/** السعر الخاص لا يسمح به إلا لحساب المالك بعد إعادة الحساب والتحقق من هامش الأمان في Worker. */
export function getAuthorizedSalePrice(
  isOwner: boolean,
  approvedPrice: number,
  requestedPrice?: number | '' | null,
): number {
  if (!Number.isFinite(approvedPrice) || approvedPrice < 0) {
    throw new Error('sale/invalid-approved-price');
  }
  if (!isOwner || requestedPrice === '' || requestedPrice == null) return approvedPrice;
  const requested = Number(requestedPrice);
  return Number.isFinite(requested) && requested >= 0 ? requested : approvedPrice;
}
