import type {
  BottleSize,
  MixComponent,
  Product,
  Sale,
  SaleItem,
  SavedMixFormula,
  StoreSettings,
} from '../types';

/**
 * New, versioned document paths for a future cut-over. Legacy `products`,
 * `sales`, and `settings` documents are deliberately not transformed in place.
 */
export const SEPARATED_COLLECTIONS = {
  productOperations: 'product_operations',
  productCosts: 'product_costs',
  tarekOperationalCosts: 'tarek_operational_costs',
  tarekOperationalCostsMeta: 'tarek_operational_costs_meta',
  tarekSavedMixes: 'tarek_saved_mixes',
  tarekProducts: 'tarek_products',
  mixOperations: 'mix_operations',
  mixCosts: 'mix_costs',
  saleOperations: 'sale_operations',
  saleCosts: 'sale_costs',
  saleFinancials: 'sale_financials',
  operationalSettings: 'operational_settings',
  costCatalog: 'cost_catalog',
  financialAdmin: 'financial_admin',
  tarekSaleProducts: 'tarek_sale_products',
  tarekSaleBottleSizes: 'tarek_sale_bottle_sizes',
} as const;

export interface OperationalMixComponent {
  productId: number | string;
  productName: string;
  brand: string;
  productType: Product['type'];
  grams: number;
  percentage?: number;
  availableStockGrams?: number;
}

/** Operational catalogue data only: no purchase cost, margin, or profit fields. */
export interface OperationalProduct {
  schemaVersion: 1;
  id: string;
  name: string;
  brand: string;
  origin: string;
  gender: Product['gender'];
  season: Product['season'];
  timeOfDay?: Product['timeOfDay'];
  type: Product['type'];
  stock_grams: number;
  min_threshold_grams?: number;
  customSellingPriceOverride?: number;
  analysis?: Product['analysis'];
  strategicThresholdGrams?: number;
  occasions?: string[];
  fragranceProfileId?: string;
  isSavedMixRecipe?: boolean;
  savedMixComponents?: OperationalMixComponent[];
  updatedAt?: string;
}

/** Product-linked cost data. Absent values stay absent; no costs are invented. */
export interface ProductCostRecord {
  schemaVersion: 1;
  productId: string;
  customGramCostEgp?: number;
  updatedAt?: string;
}

/** Tarek's read-only catalogue: deliberately excludes every selling-price field. */
export interface TarekOperationalProduct {
  schemaVersion: 1;
  id: string;
  name: string;
  brand: string;
  origin: string;
  gender: Product['gender'];
  season: Product['season'];
  type: Product['type'];
  stock_grams: number;
  min_threshold_grams?: number;
  updatedAt?: string;
}

/** Read-only product identity for the restricted POS; never contains cost or financial totals. */
export interface TarekSaleProduct {
  schemaVersion: 1;
  id: string;
  name: string;
  brand: string;
  type: Product['type'];
  isActive?: boolean;
  updatedAt?: string;
}

/** Owner-authored sale prices only; cost, margin, and commission inputs are intentionally absent. */
export interface TarekSaleBottleSize extends OperationalBottleSize {
  schemaVersion: 1;
}

export interface OperationalSavedMixFormula {
  schemaVersion: 1;
  id: string;
  name: string;
  bottleSizeMl: number;
  isRollOn?: boolean;
  isColoredBottle?: boolean;
  components: OperationalMixComponent[];
  totalEssenceGrams: number;
  sellingPrice: number;
  notes?: string;
  createdAt: string;
  updatedAt: string;
  createdBy?: string;
  isOwnerApproved?: boolean;
  approvedBy?: string;
  mixGoal?: SavedMixFormula['mixGoal'];
  customerRating?: number;
  testResult?: SavedMixFormula['testResult'];
  longevityNotes?: string;
  sillageNotes?: string;
  balanceNotes?: string;
  timesSold?: number;
  repurchaseRatePercent?: number;
}

/** Tarek-safe approved recipe: no prices, costs, notes, ratings, or sales statistics. */
export interface TarekSavedMixComponent {
  productId: string;
  grams: number;
}

export interface TarekSavedMixFormula {
  schemaVersion: 1;
  id: string;
  name: string;
  bottleSizeMl: number;
  totalEssenceGrams: number;
  components: TarekSavedMixComponent[];
  isOwnerApproved: true;
  updatedAt: string;
  isRollOn?: boolean;
  isColoredBottle?: boolean;
}

function normalizeTarekSavedMix(
  value: Record<string, unknown>,
  fallbackId: string,
  requireSchemaVersion: boolean,
): TarekSavedMixFormula | null {
  if (requireSchemaVersion && value.schemaVersion !== 1) return null;
  const id = typeof value.id === 'string' ? value.id.trim() : fallbackId.trim();
  const name = typeof value.name === 'string' ? value.name.trim() : '';
  const bottleSizeMl = value.bottleSizeMl;
  const totalEssenceGrams = value.totalEssenceGrams;
  const updatedAt = typeof value.updatedAt === 'string' ? value.updatedAt.trim() : '';
  if (!id || id.length > 1500 || id.includes('/') || (fallbackId && id !== fallbackId)) return null;
  if (!name || name.length > 120) return null;
  if (!Number.isSafeInteger(bottleSizeMl) || Number(bottleSizeMl) <= 0) return null;
  if (!Number.isSafeInteger(totalEssenceGrams) || Number(totalEssenceGrams) <= 0) return null;
  if (value.isOwnerApproved !== true) return null;
  if (!updatedAt || updatedAt.length > 64) return null;
  if (value.isRollOn !== undefined && typeof value.isRollOn !== 'boolean') return null;
  if (value.isColoredBottle !== undefined && typeof value.isColoredBottle !== 'boolean') return null;
  if (!Array.isArray(value.components) || value.components.length < 2 || value.components.length > 3) return null;

  const components: TarekSavedMixComponent[] = [];
  for (const componentValue of value.components) {
    if (!componentValue || typeof componentValue !== 'object') return null;
    const component = componentValue as Record<string, unknown>;
    const rawProductId = component.productId;
    const productId = typeof rawProductId === 'string'
      ? rawProductId.trim()
      : typeof rawProductId === 'number' && Number.isSafeInteger(rawProductId)
        ? String(rawProductId)
        : '';
    const grams = component.grams;
    if (!productId || productId.length > 1500 || productId.includes('/')) return null;
    if (!Number.isSafeInteger(grams) || Number(grams) <= 0) return null;
    components.push({ productId, grams: Number(grams) });
  }

  if (new Set(components.map((component) => component.productId)).size !== components.length) return null;
  if (components.reduce((sum, component) => sum + component.grams, 0) !== totalEssenceGrams) return null;

  return {
    schemaVersion: 1,
    id,
    name,
    bottleSizeMl: Number(bottleSizeMl),
    totalEssenceGrams: Number(totalEssenceGrams),
    components,
    isOwnerApproved: true,
    updatedAt,
    ...(typeof value.isRollOn === 'boolean' ? { isRollOn: value.isRollOn } : {}),
    ...(typeof value.isColoredBottle === 'boolean' ? { isColoredBottle: value.isColoredBottle } : {}),
  };
}

export function projectTarekSavedMix(formula: SavedMixFormula): TarekSavedMixFormula | null {
  return normalizeTarekSavedMix(
    formula as unknown as Record<string, unknown>,
    String(formula.id),
    false,
  );
}

/** Validate and re-project a Firestore DTO; unexpected fields are never returned to the UI. */
export function projectTarekSavedMixDTO(
  value: Record<string, unknown>,
  fallbackId: string,
): TarekSavedMixFormula | null {
  return normalizeTarekSavedMix(value, fallbackId, true);
}

export interface SavedMixCostRecord {
  schemaVersion: 1;
  mixId: string;
  totalCostEgp: number;
  components: SaleCostComponent[];
}

export interface OperationalSaleItem {
  id: string;
  compositionType?: SaleItem['compositionType'];
  isMix?: boolean;
  mixComponents?: OperationalMixComponent[];
  customFormulaName?: string;
  productId: number | string;
  productName: string;
  productType: SaleItem['productType'];
  bottleSize: number;
  essenceGrams: number;
  sellingPrice: number;
  quantity?: number;
  isColoredBottle?: boolean;
  isRollOn?: boolean;
  alcoholMl?: number;
  fixativeGrams?: number;
}

/** Sale receipt and fulfilment fields only. Financial totals are not in this document. */
export interface OperationalSaleRecord {
  schemaVersion: 1;
  id: string;
  items: OperationalSaleItem[];
  totalPrice: number;
  date: string;
  customerName?: string;
  customerPhone?: string;
  paymentMethod?: Sale['paymentMethod'];
  transactionType?: Sale['transactionType'];
  exceptionReason?: string;
  discount?: number;
  loyaltyPointsRedeemed?: number;
  loyaltyDiscountAmount?: number;
  loyaltyPointsEarned?: number;
  customerLoyaltyBalanceAfter?: number;
  packagingOptionId?: Sale['packagingOptionId'];
  packagingRevenueEgp?: number;
  isBasicBagReplacedByLuxury?: boolean;
  promotionalSavings?: Sale['promotionalSavings'];
  employeeName?: string;
  source?: Sale['source'];
  timestamp?: string;
  transactionId?: string;
  deviceTimestamp?: string;
  serverTimestamp?: string;
  isOfflineCreated?: boolean;
  isReversed?: boolean;
  originalSaleId?: string;
  reversalReason?: string;
  reversedBy?: string;
  reversedAt?: string;
  dataClassification?: Sale['dataClassification'];
  isTestData?: boolean;
  testClassificationNote?: string;
  recordedAt?: string;
  recordedBy?: string;
  isBackdated?: boolean;
  saleDateNote?: string;
  duplicateCheckHash?: string;
}

export interface SaleCostComponent {
  productId: number | string;
  grams: number;
  oilGramCostEgp: number;
  componentOilCostEgp: number;
}

export interface SaleItemCostRecord {
  itemId: string;
  quantity: number;
  unitCostEgp: number;
  components: SaleCostComponent[];
}

/** Actual product cost only. No selling price, commission, profit, or margin. */
export interface SaleCostRecord {
  schemaVersion: 1;
  saleId: string;
  items: SaleItemCostRecord[];
  totalCostEgp: number;
  packagingCostEgp?: number;
}

export interface SaleFinancialRecord {
  schemaVersion: 1;
  saleId: string;
  itemProfits: Array<{ itemId: string; profitEgp: number }>;
  totalProfitEgp: number;
  commissionEgp?: number;
  profitMarginPercent?: number;
}

export interface OperationalBottleSize {
  id: string;
  name?: string;
  sizeMl: number;
  essenceGrams: number;
  normalPrice: number;
  coloredNormalPrice?: number;
  specialPrice: number;
  coloredSpecialPrice?: number;
  isRollOn?: boolean;
  isActive?: boolean;
}

export interface BottleSizeCostRecord {
  id: string;
  sizeMl: number;
  bottleCostEgp: number;
  alcoholCostEgp?: number;
  officialCostEgp: number;
}

export interface BottleSizeFinancialRecord {
  id: string;
  suggestedMarginEgp?: number;
}

export interface OperationalStoreSettings {
  schemaVersion: 1;
  storeName: string;
  currency: string;
  storePhone?: string;
  storeSlogan?: string;
  bottleSizes: OperationalBottleSize[];
}

export type CostPolicySettings = Pick<StoreSettings,
  | 'priceEssenceNormal'
  | 'priceEssenceNiche'
  | 'priceEssenceSpecial'
  | 'defaultBottleCost'
  | 'standardBottleAndSprayCost'
  | 'coloredBottleCost'
  | 'coloredBottleExtraCost'
  | 'stickerCost'
  | 'basicBagCost'
  | 'basicPlasticBagCost'
>;

export type FinancialAdminSettings = Pick<StoreSettings,
  | 'defaultMargin'
  | 'dailyTargetProfit'
  | 'monthlyTargetRevenue'
  | 'monthlyFixedBudget'
  | 'monthlyWorkDays'
  | 'employeeBaseSalary'
  | 'ownerSalary'
  | 'commissionRate'
  | 'tieredCommissionRate'
  | 'tieredThresholdBottles'
  | 'customBudgetItems'
  | 'tieredCommissionBottleThreshold'
  | 'loyaltyMinSafeMarginEgp'
>;

const copyDefined = <T extends object, K extends keyof T>(
  source: T,
  keys: readonly K[],
): Pick<T, K> => {
  const result: Partial<Record<K, T[K]>> = {};
  for (const key of keys) {
    const value = source[key];
    if (value !== undefined) result[key] = value;
  }
  return result as Pick<T, K>;
};

const operationalMixFields = [
  'productId',
  'productName',
  'brand',
  'productType',
  'grams',
  'percentage',
  'availableStockGrams',
] as const satisfies readonly (keyof MixComponent)[];

function projectOperationalMixComponent(component: MixComponent): OperationalMixComponent {
  return copyDefined(component, operationalMixFields) as OperationalMixComponent;
}

export function projectOperationalProduct(product: Product): OperationalProduct {
  return {
    schemaVersion: 1,
    id: String(product.id),
    ...copyDefined(product, [
      'name',
      'brand',
      'origin',
      'gender',
      'season',
      'timeOfDay',
      'type',
      'stock_grams',
      'min_threshold_grams',
      'customSellingPriceOverride',
      'analysis',
      'strategicThresholdGrams',
      'occasions',
      'fragranceProfileId',
      'isSavedMixRecipe',
      'updatedAt',
    ]),
    ...(product.savedMixComponents
      ? { savedMixComponents: product.savedMixComponents.map(projectOperationalMixComponent) }
      : {}),
  };
}

export function projectProductCost(product: Product): ProductCostRecord {
  return {
    schemaVersion: 1,
    productId: String(product.id),
    ...copyDefined(product, ['customGramCostEgp', 'updatedAt']),
  };
}

/** Tarek API DTO: only the explicitly permitted per-gram product cost is returned. */
export function projectTarekProductCostDTO(
  value: Record<string, unknown>,
  fallbackProductId: string,
): ProductCostRecord | null {
  const productId = typeof value.productId === 'string' && value.productId.trim()
    ? value.productId.trim()
    : fallbackProductId;
  if (!productId) return null;
  const unitCost = value.customGramCostEgp;
  return {
    schemaVersion: 1,
    productId,
    ...(typeof unitCost === 'number' && Number.isFinite(unitCost) && unitCost >= 0
      ? { customGramCostEgp: unitCost }
      : {}),
    ...(typeof value.updatedAt === 'string' ? { updatedAt: value.updatedAt } : {}),
  };
}

export function projectTarekProduct(product: Product): TarekOperationalProduct {
  return {
    schemaVersion: 1,
    id: String(product.id),
    ...copyDefined(product, [
      'name',
      'brand',
      'origin',
      'gender',
      'season',
      'type',
      'stock_grams',
      'min_threshold_grams',
      'updatedAt',
    ]),
  } as TarekOperationalProduct;
}

export function projectTarekSaleProduct(product: Product): TarekSaleProduct {
  const isActive = (product as Product & { isActive?: unknown }).isActive;
  return {
    schemaVersion: 1,
    id: String(product.id),
    ...copyDefined(product, ['name', 'brand', 'type', 'updatedAt']),
    ...(typeof isActive === 'boolean' ? { isActive } : {}),
  } as TarekSaleProduct;
}

export function projectOperationalSavedMix(formula: SavedMixFormula): OperationalSavedMixFormula {
  return {
    schemaVersion: 1,
    ...copyDefined(formula, [
      'id',
      'name',
      'bottleSizeMl',
      'isRollOn',
      'isColoredBottle',
      'totalEssenceGrams',
      'sellingPrice',
      'notes',
      'createdAt',
      'updatedAt',
      'createdBy',
      'isOwnerApproved',
      'approvedBy',
      'mixGoal',
      'customerRating',
      'testResult',
      'longevityNotes',
      'sillageNotes',
      'balanceNotes',
      'timesSold',
      'repurchaseRatePercent',
    ]),
    components: formula.components.map(projectOperationalMixComponent),
  } as OperationalSavedMixFormula;
}

export function projectSavedMixCosts(formula: SavedMixFormula): SavedMixCostRecord {
  return {
    schemaVersion: 1,
    mixId: String(formula.id),
    totalCostEgp: formula.totalCost,
    components: formula.components.map((component) => ({
      productId: component.productId,
      grams: component.grams,
      oilGramCostEgp: component.oilGramCost,
      componentOilCostEgp: component.componentOilCost,
    })),
  };
}

function projectOperationalSaleItem(item: SaleItem): OperationalSaleItem {
  return {
    ...copyDefined(item, [
      'id',
      'compositionType',
      'isMix',
      'customFormulaName',
      'productId',
      'productName',
      'productType',
      'bottleSize',
      'essenceGrams',
      'sellingPrice',
      'quantity',
      'isColoredBottle',
      'isRollOn',
      'alcoholMl',
      'fixativeGrams',
    ]),
    ...(item.mixComponents
      ? { mixComponents: item.mixComponents.map(projectOperationalMixComponent) }
      : {}),
  } as OperationalSaleItem;
}

const operationalSaleFields = [
  'totalPrice',
  'date',
  'customerName',
  'customerPhone',
  'paymentMethod',
  'transactionType',
  'exceptionReason',
  'discount',
  'loyaltyPointsRedeemed',
  'loyaltyDiscountAmount',
  'loyaltyPointsEarned',
  'customerLoyaltyBalanceAfter',
  'packagingOptionId',
  'packagingRevenueEgp',
  'isBasicBagReplacedByLuxury',
  'promotionalSavings',
  'employeeName',
  'source',
  'timestamp',
  'transactionId',
  'deviceTimestamp',
  'serverTimestamp',
  'isOfflineCreated',
  'isReversed',
  'originalSaleId',
  'reversalReason',
  'reversedBy',
  'reversedAt',
  'dataClassification',
  'isTestData',
  'testClassificationNote',
  'recordedAt',
  'recordedBy',
  'isBackdated',
  'saleDateNote',
  'duplicateCheckHash',
] as const satisfies readonly (keyof Sale)[];

export function projectOperationalSale(sale: Sale): OperationalSaleRecord {
  return {
    schemaVersion: 1,
    id: String(sale.id),
    items: sale.items.map(projectOperationalSaleItem),
    ...copyDefined(sale, operationalSaleFields),
  } as OperationalSaleRecord;
}

export function projectSaleCosts(sale: Sale): SaleCostRecord {
  return {
    schemaVersion: 1,
    saleId: String(sale.id),
    items: sale.items.map((item) => ({
      itemId: item.id,
      quantity: item.quantity ?? 1,
      unitCostEgp: item.cost,
      components: (item.mixComponents ?? []).map((component) => ({
        productId: component.productId,
        grams: component.grams,
        oilGramCostEgp: component.oilGramCost,
        componentOilCostEgp: component.componentOilCost,
      })),
    })),
    totalCostEgp: sale.totalCost,
    ...copyDefined(sale, ['packagingCostEgp']),
  } as SaleCostRecord;
}

export function projectSaleFinancials(sale: Sale): SaleFinancialRecord {
  return {
    schemaVersion: 1,
    saleId: String(sale.id),
    itemProfits: sale.items.map((item) => ({ itemId: item.id, profitEgp: item.profit })),
    totalProfitEgp: sale.totalProfit,
    ...(sale.totalCommission !== undefined || sale.commissionAmount !== undefined
      ? { commissionEgp: sale.totalCommission ?? sale.commissionAmount }
      : {}),
    ...(sale.totalPrice > 0
      ? { profitMarginPercent: (sale.totalProfit / sale.totalPrice) * 100 }
      : {}),
  };
}

export function projectOperationalBottleSize(bottle: BottleSize): OperationalBottleSize {
  return copyDefined(bottle, [
    'id',
    'name',
    'sizeMl',
    'essenceGrams',
    'normalPrice',
    'coloredNormalPrice',
    'specialPrice',
    'coloredSpecialPrice',
    'isRollOn',
    'isActive',
  ]) as OperationalBottleSize;
}

export function projectTarekSaleBottleSize(bottle: BottleSize): TarekSaleBottleSize {
  return {
    schemaVersion: 1,
    ...projectOperationalBottleSize(bottle),
  };
}

export function projectBottleSizeCosts(bottle: BottleSize): BottleSizeCostRecord {
  const optionalCosts = copyDefined(bottle, ['alcoholCost']);
  return {
    id: bottle.id,
    sizeMl: bottle.sizeMl,
    bottleCostEgp: bottle.bottleCost,
    officialCostEgp: bottle.officialCost,
    ...(optionalCosts.alcoholCost === undefined ? {} : { alcoholCostEgp: optionalCosts.alcoholCost }),
  } as BottleSizeCostRecord;
}

export function projectBottleSizeFinancials(bottle: BottleSize): BottleSizeFinancialRecord {
  const margin = copyDefined(bottle, ['suggestedMargin']);
  return {
    id: bottle.id,
    ...(margin.suggestedMargin === undefined ? {} : { suggestedMarginEgp: margin.suggestedMargin }),
  } as BottleSizeFinancialRecord;
}

const costPolicyFields = [
  'priceEssenceNormal',
  'priceEssenceNiche',
  'priceEssenceSpecial',
  'defaultBottleCost',
  'standardBottleAndSprayCost',
  'coloredBottleCost',
  'coloredBottleExtraCost',
  'stickerCost',
  'basicBagCost',
  'basicPlasticBagCost',
] as const satisfies readonly (keyof StoreSettings)[];

export function projectCostPolicySettings(settings: StoreSettings): CostPolicySettings {
  return copyDefined(settings, costPolicyFields) as CostPolicySettings;
}

const financialSettingFields = [
  'defaultMargin',
  'dailyTargetProfit',
  'monthlyTargetRevenue',
  'monthlyFixedBudget',
  'monthlyWorkDays',
  'employeeBaseSalary',
  'ownerSalary',
  'commissionRate',
  'tieredCommissionRate',
  'tieredThresholdBottles',
  'customBudgetItems',
  'tieredCommissionBottleThreshold',
  'loyaltyMinSafeMarginEgp',
] as const satisfies readonly (keyof StoreSettings)[];

export function projectFinancialAdminSettings(settings: StoreSettings): FinancialAdminSettings {
  return copyDefined(settings, financialSettingFields) as FinancialAdminSettings;
}

export function projectOperationalStoreSettings(settings: StoreSettings): OperationalStoreSettings {
  return {
    schemaVersion: 1,
    ...copyDefined(settings, ['storeName', 'currency', 'storePhone', 'storeSlogan']),
    bottleSizes: (settings.bottleSizes ?? []).map(projectOperationalBottleSize),
  };
}
