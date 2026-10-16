const SCHEMA_V2 = 'lamsa.sale-intent/v2';
const SCHEMA_V3 = 'lamsa.sale-intent/v3';
const TOP_LEVEL_KEYS_V2 = new Set([
  'schema', 'saleId', 'lines', 'manualDiscountEgp', 'promotionId', 'previewTotalPriceEgp', 'previewTotalCostEgp',
  'previewTotalProfitEgp', 'previewCommissionEgp', 'loyaltyPointsToRedeem',
  'customerName', 'customerPhone', 'paymentMethod', 'packagingOptionId', 'packagingPaid',
]);
const LINE_KEYS_V2 = new Set([
  'lineId', 'productId', 'bottleSizeId', 'bottleSizeMl', 'quantity',
  'essenceGramsPerBottle', 'isColoredBottle', 'requestedUnitPriceEgp', 'previewUnitCostEgp',
  'customFormulaName', 'mixComponents', 'promotionId',
]);
const TOP_LEVEL_KEYS_V3 = new Set([
  'schema', 'saleId', 'quoteId', 'lines', 'manualDiscountEgp', 'promotionId',
  'customerName', 'customerPhone', 'paymentMethod', 'packagingOptionId', 'packagingPaid',
]);
const LINE_KEYS_V3 = new Set([
  'lineId', 'productId', 'bottleSizeId', 'bottleSizeMl', 'quantity',
  'essenceGramsPerBottle', 'isColoredBottle', 'customFormulaName', 'mixComponents', 'promotionId',
]);
const COMPONENT_KEYS = new Set(['productId', 'gramsPerBottle']);
const PAYMENT_METHODS = new Set(['نقدي', 'بطاقة', 'محفظة إلكترونية', 'تحويل بنكي']);
const PACKAGING_OPTIONS = new Set(['basic_bag', 'luxury_box', 'luxury_bag', 'luxury_both']);
const MAX_STOCK_DOCUMENTS = 240;

export class LamsaContractError extends Error {
  constructor(code) {
    super(code);
    this.code = code;
  }
}

function exactKeys(value, allowed, code) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new LamsaContractError(code);
  for (const key of Object.keys(value)) if (!allowed.has(key)) throw new LamsaContractError('sale/unexpected-field');
}

function safeId(value, code) {
  if (typeof value !== 'string' || !value.trim() || value.length > 1500
      || value.includes('/') || value === '.' || value === '..') {
    throw new LamsaContractError(code);
  }
  return value.trim();
}

function safeText(value, code, maxLength) {
  if (typeof value !== 'string' || value.length > maxLength) throw new LamsaContractError(code);
  return value.trim();
}

function finiteNonNegative(value, code, allowZero = true) {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0 || (!allowZero && value === 0)) {
    throw new LamsaContractError(code);
  }
  return value;
}

export function normalizeLamsaSaleIntent(body) {
  const schema = body?.schema;
  const isV2 = schema === SCHEMA_V2;
  const isV3 = schema === SCHEMA_V3;
  if (!isV2 && !isV3) throw new LamsaContractError('sale/unsupported-contract');
  exactKeys(body, isV2 ? TOP_LEVEL_KEYS_V2 : TOP_LEVEL_KEYS_V3, 'sale/invalid-intent');
  const saleId = safeId(body.saleId, 'sale/invalid-id');
  if (!/^[A-Za-z0-9_-]{4,120}$/.test(saleId)) throw new LamsaContractError('sale/invalid-id');
  const quoteId = isV3 && body.quoteId !== undefined
    ? safeId(body.quoteId, 'sale/invalid-quote-id')
    : undefined;
  if (quoteId && !/^[A-Za-z0-9_-]{8,120}$/.test(quoteId)) throw new LamsaContractError('sale/invalid-quote-id');
  if (!Array.isArray(body.lines) || body.lines.length < 1 || body.lines.length > 100) {
    throw new LamsaContractError('sale/invalid-line-count');
  }

  let componentUses = 0;
  const lines = body.lines.map((line) => {
    exactKeys(line, isV2 ? LINE_KEYS_V2 : LINE_KEYS_V3, 'sale/invalid-line');
    const lineId = safeId(line.lineId, 'sale/invalid-line-id');
    if (lineId.length > 120) throw new LamsaContractError('sale/invalid-line-id');
    const quantity = line.quantity;
    if (!Number.isSafeInteger(quantity) || quantity < 1 || quantity > 100) {
      throw new LamsaContractError('sale/invalid-quantity');
    }
    const bottleSizeMl = finiteNonNegative(line.bottleSizeMl, 'sale/invalid-bottle-size', false);
    if (bottleSizeMl > 1000) throw new LamsaContractError('sale/invalid-bottle-size');
    const essenceGramsPerBottle = finiteNonNegative(line.essenceGramsPerBottle, 'sale/invalid-essence', false);
    if (!Number.isSafeInteger(essenceGramsPerBottle)) throw new LamsaContractError('sale/invalid-essence');
    if (typeof line.isColoredBottle !== 'boolean') throw new LamsaContractError('sale/invalid-color-choice');
    const refs = {
      ...(line.promotionId === undefined ? {} : { promotionId: safeId(line.promotionId, 'sale/invalid-promotion-id') }),
    };
    const ownerComparisonFields = isV2 ? {
      requestedUnitPriceEgp: finiteNonNegative(line.requestedUnitPriceEgp, 'sale/invalid-requested-price', false),
      previewUnitCostEgp: finiteNonNegative(line.previewUnitCostEgp, 'sale/invalid-preview-cost'),
    } : {};

    const hasMix = Array.isArray(line.mixComponents);
    if (hasMix) {
      if ('productId' in line) throw new LamsaContractError('sale/mix-line-has-product-id');
      if (line.mixComponents.length < 1 || line.mixComponents.length > 20) {
        throw new LamsaContractError('sale/invalid-mix-component-count');
      }
      const mixComponents = line.mixComponents.map((component) => {
        exactKeys(component, COMPONENT_KEYS, 'sale/invalid-component');
        const gramsPerBottle = finiteNonNegative(component.gramsPerBottle, 'sale/invalid-component-grams', false);
        if (!Number.isSafeInteger(gramsPerBottle)) throw new LamsaContractError('sale/invalid-component-grams');
        return { productId: safeId(component.productId, 'sale/invalid-component-product-id'), gramsPerBottle };
      });
      if (mixComponents.reduce((sum, component) => sum + component.gramsPerBottle, 0) !== essenceGramsPerBottle) {
        throw new LamsaContractError('sale/mix-essence-mismatch');
      }
      componentUses += mixComponents.length * quantity;
      return {
        lineId, bottleSizeId: safeId(line.bottleSizeId, 'sale/invalid-bottle-size-id'),
        bottleSizeMl, quantity, essenceGramsPerBottle, isColoredBottle: line.isColoredBottle,
        ...ownerComparisonFields, ...refs,
        ...(line.customFormulaName === undefined ? {} : { customFormulaName: safeText(line.customFormulaName, 'sale/invalid-formula-name', 120) }),
        mixComponents,
      };
    }

    return {
      lineId,
      productId: safeId(line.productId, 'sale/invalid-product-id'),
      bottleSizeId: safeId(line.bottleSizeId, 'sale/invalid-bottle-size-id'),
      bottleSizeMl, quantity, essenceGramsPerBottle, isColoredBottle: line.isColoredBottle,
      ...ownerComparisonFields, ...refs,
    };
  });
  if (componentUses > 400) throw new LamsaContractError('sale/too-many-components');
  const stockProductIds = new Set(lines.flatMap((line) => line.mixComponents
    ? line.mixComponents.map((component) => component.productId) : [line.productId]));
  if (stockProductIds.size > MAX_STOCK_DOCUMENTS) throw new LamsaContractError('sale/too-many-stock-documents');

  const manualDiscountEgp = finiteNonNegative(body.manualDiscountEgp, 'sale/invalid-discount');
  const loyaltyPointsToRedeem = isV2 ? body.loyaltyPointsToRedeem : 0;
  if (!Number.isSafeInteger(loyaltyPointsToRedeem) || loyaltyPointsToRedeem < 0) {
    throw new LamsaContractError('sale/invalid-loyalty-points');
  }
  if (!PAYMENT_METHODS.has(body.paymentMethod)) throw new LamsaContractError('sale/invalid-payment-method');
  if (typeof body.packagingPaid !== 'boolean') throw new LamsaContractError('sale/invalid-packaging-paid');
  if (body.packagingOptionId != null && !PACKAGING_OPTIONS.has(body.packagingOptionId)) {
    throw new LamsaContractError('sale/invalid-packaging-option');
  }
  if (body.packagingPaid && body.packagingOptionId == null) throw new LamsaContractError('sale/packaging-option-required');

  const result = { schema, saleId, lines, manualDiscountEgp, loyaltyPointsToRedeem,
    paymentMethod: body.paymentMethod, packagingPaid: body.packagingPaid };
  if (quoteId) result.quoteId = quoteId;
  if (isV2) {
    result.previewTotalPriceEgp = finiteNonNegative(body.previewTotalPriceEgp, 'sale/invalid-preview-total-price');
    result.previewTotalCostEgp = finiteNonNegative(body.previewTotalCostEgp, 'sale/invalid-preview-total-cost');
    result.previewTotalProfitEgp = finiteNonNegative(body.previewTotalProfitEgp, 'sale/invalid-preview-total-profit');
    result.previewCommissionEgp = finiteNonNegative(body.previewCommissionEgp, 'sale/invalid-preview-commission');
  }
  if (body.promotionId != null) result.promotionId = safeId(body.promotionId, 'sale/invalid-promotion-id');
  if (loyaltyPointsToRedeem > 0) throw new LamsaContractError('sale/loyalty-authority-required');
  if (body.customerName != null) {
    if (typeof body.customerName !== 'string' || body.customerName.length > 120) throw new LamsaContractError('sale/invalid-customer-name');
    if (body.customerName) result.customerName = body.customerName.trim();
  }
  if (body.customerPhone != null) {
    if (typeof body.customerPhone !== 'string' || body.customerPhone.length > 40) throw new LamsaContractError('sale/invalid-customer-phone');
    if (body.customerPhone) result.customerPhone = body.customerPhone.trim();
  }
  if (body.packagingOptionId != null) result.packagingOptionId = body.packagingOptionId;
  return { intent: result, componentUses, stockProductCount: stockProductIds.size };
}
