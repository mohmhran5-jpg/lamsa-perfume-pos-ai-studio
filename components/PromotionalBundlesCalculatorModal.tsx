import React, { useState, useMemo } from 'react';
import { Product, BottleSize, StoreSettings, DEFAULT_BOTTLE_SIZES } from '../types';
import { X, Sparkles, Gift, Percent, Tag, ShoppingBag, Check, Calculator, Plus, Trash2, Printer } from 'lucide-react';
import { soundAlertService } from '../services/soundAlertService';

export interface PromotionalBundleOffer {
  id: string;
  name: string;
  description: string;
  badge: string;
  badgeColor: string;
  presetItems: Array<{ bottleSizeMl: number; quantity: number }>;
  discountType: 'percent' | 'fixed';
  discountValue: number;
}

const PRESET_BUNDLE_OFFERS: PromotionalBundleOffer[] = [
  {
    id: 'duo-50ml',
    name: 'عرض الثنائية الأنيقة (2× 50مل)',
    description: 'شراء زجاجتين سعة 50 مل مع خصم 10% وتوفير مباشر للعميل',
    badge: 'الأكثر طلباً 🔥',
    badgeColor: 'bg-amber-500/15 text-amber-800 dark:text-amber-300 border-amber-500/30',
    presetItems: [{ bottleSizeMl: 50, quantity: 2 }],
    discountType: 'percent',
    discountValue: 10,
  },
  {
    id: 'trio-royal',
    name: 'باقة الثلاثية الملكية (3× 50مل)',
    description: 'شراء 3 زجاجات 50 مل مع خصم 15% وفك هدايا فاخرة',
    badge: 'باقة التوفير الملكي 👑',
    badgeColor: 'bg-purple-500/15 text-purple-800 dark:text-purple-300 border-purple-500/30',
    presetItems: [{ bottleSizeMl: 50, quantity: 3 }],
    discountType: 'percent',
    discountValue: 15,
  },
  {
    id: 'diamond-100ml',
    name: 'العرض الماسي المباشر (2× 100مل)',
    description: 'خصم 20% كامل على المجموعات العطرية الكبرى لعملاء VIP',
    badge: 'خصم VIP الماسي 💎',
    badgeColor: 'bg-sky-500/15 text-sky-800 dark:text-sky-300 border-sky-500/30',
    presetItems: [{ bottleSizeMl: 100, quantity: 2 }],
    discountType: 'percent',
    discountValue: 20,
  },
  {
    id: 'duo-30ml',
    name: 'عرض الدوام المزدوج (2× 30مل)',
    description: 'خصم 50 ج.م مباشر عند شراء عبوتين حجم 30 مل',
    badge: 'توفير يومي ☀️',
    badgeColor: 'bg-emerald-500/15 text-emerald-800 dark:text-emerald-300 border-emerald-500/30',
    presetItems: [{ bottleSizeMl: 30, quantity: 2 }],
    discountType: 'fixed',
    discountValue: 50,
  },
];

export interface CustomBundleItem {
  productId: number | string;
  bottleSizeMl: number;
  quantity: number;
}

interface PromotionalBundlesCalculatorModalProps {
  isOpen: boolean;
  onClose: () => void;
  products: Product[];
  bottleSizes?: BottleSize[];
  settings?: StoreSettings;
  onApplyBundleOfferToCart: (bundleData: {
    offerName: string;
    items: Array<{ product: Product; bottle: BottleSize; quantity: number }>;
    originalTotal: number;
    finalTotal: number;
    savedAmount: number;
    savingsPercent: number;
  }) => void;
}

export const PromotionalBundlesCalculatorModal: React.FC<PromotionalBundlesCalculatorModalProps> = ({
  isOpen,
  onClose,
  products,
  bottleSizes = DEFAULT_BOTTLE_SIZES,
  settings,
  onApplyBundleOfferToCart,
}) => {
  const [selectedOfferId, setSelectedOfferId] = useState<string>('duo-50ml');
  const [activeTabMode, setActiveTabMode] = useState<'presets' | 'multi_custom'>('presets');

  // Single target perfume for presets
  const [selectedPerfumeId, setSelectedPerfumeId] = useState<number | string>(products[0]?.id || '');

  // Multi-item custom bundle selector state
  const [customBundleItems, setCustomBundleItems] = useState<CustomBundleItem[]>(() => [
    { productId: products[0]?.id || '', bottleSizeMl: 50, quantity: 1 },
    { productId: products[1]?.id || products[0]?.id || '', bottleSizeMl: 50, quantity: 1 },
  ]);

  const [customDiscountType, setCustomDiscountType] = useState<'percent' | 'fixed'>('percent');
  const [customDiscountValue, setCustomDiscountValue] = useState<number>(15);
  const [customOfferTitle, setCustomOfferTitle] = useState<string>('عرض الخصم الخاص على العطور المختارة');

  const currency = settings?.currency || 'ج.م';
  const activePreset = PRESET_BUNDLE_OFFERS.find((o) => o.id === selectedOfferId) || PRESET_BUNDLE_OFFERS[0];
  const targetPerfume = products.find((p) => String(p.id) === String(selectedPerfumeId)) || products[0];

  // Calculations engine
  const calculationResults = useMemo(() => {
    if (activeTabMode === 'presets') {
      if (!targetPerfume) {
        return {
          originalTotal: 0,
          finalTotal: 0,
          savedAmount: 0,
          savingsPercent: 0,
          itemsToCart: [],
          offerName: '',
        };
      }

      let originalTotal = 0;
      const itemsToCart: Array<{ product: Product; bottle: BottleSize; quantity: number }> = [];

      activePreset.presetItems.forEach((pItem) => {
        const matchingBottle =
          bottleSizes.find((b) => b.sizeMl === pItem.bottleSizeMl && !b.isRollOn) ||
          bottleSizes[0] ||
          DEFAULT_BOTTLE_SIZES[0];

        const unitPrice =
          targetPerfume.type === 'نيش' || targetPerfume.type === 'عود'
            ? matchingBottle.specialPrice
            : matchingBottle.normalPrice;

        const lineTotal = unitPrice * pItem.quantity;
        originalTotal += lineTotal;

        itemsToCart.push({
          product: targetPerfume,
          bottle: matchingBottle,
          quantity: pItem.quantity,
        });
      });

      let savedAmount = 0;
      if (activePreset.discountType === 'percent') {
        savedAmount = Math.round((originalTotal * activePreset.discountValue) / 100);
      } else {
        savedAmount = Math.min(originalTotal, activePreset.discountValue);
      }

      const finalTotal = Math.max(0, originalTotal - savedAmount);
      const savingsPercent = originalTotal > 0 ? Math.round((savedAmount / originalTotal) * 100) : 0;

      return {
        originalTotal,
        finalTotal,
        savedAmount,
        savingsPercent,
        itemsToCart,
        offerName: `${activePreset.name} — ${targetPerfume.name}`,
      };
    } else {
      // Multi-custom bundle calculation across selected products
      let originalTotal = 0;
      const itemsToCart: Array<{ product: Product; bottle: BottleSize; quantity: number }> = [];

      customBundleItems.forEach((cItem) => {
        const prod = products.find((p) => String(p.id) === String(cItem.productId));
        if (!prod) return;

        const matchingBottle =
          bottleSizes.find((b) => b.sizeMl === cItem.bottleSizeMl && !b.isRollOn) ||
          bottleSizes[0] ||
          DEFAULT_BOTTLE_SIZES[0];

        const unitPrice =
          prod.type === 'نيش' || prod.type === 'عود'
            ? matchingBottle.specialPrice
            : matchingBottle.normalPrice;

        const lineTotal = unitPrice * cItem.quantity;
        originalTotal += lineTotal;

        itemsToCart.push({
          product: prod,
          bottle: matchingBottle,
          quantity: cItem.quantity,
        });
      });

      let savedAmount = 0;
      if (customDiscountType === 'percent') {
        savedAmount = Math.round((originalTotal * customDiscountValue) / 100);
      } else {
        savedAmount = Math.min(originalTotal, customDiscountValue);
      }

      const finalTotal = Math.max(0, originalTotal - savedAmount);
      const savingsPercent = originalTotal > 0 ? Math.round((savedAmount / originalTotal) * 100) : 0;

      const title = customOfferTitle.trim() || `عرض العطور المتنوعة (خصم ${savedAmount} ${currency})`;

      return {
        originalTotal,
        finalTotal,
        savedAmount,
        savingsPercent,
        itemsToCart,
        offerName: title,
      };
    }
  }, [
    activeTabMode,
    activePreset,
    targetPerfume,
    bottleSizes,
    customBundleItems,
    customDiscountType,
    customDiscountValue,
    customOfferTitle,
    currency,
    products,
  ]);

  const handleAddCustomBundleRow = () => {
    const nextProd = products[customBundleItems.length % products.length] || products[0];
    setCustomBundleItems((prev) => [
      ...prev,
      { productId: nextProd.id, bottleSizeMl: 50, quantity: 1 },
    ]);
  };

  const handleRemoveCustomBundleRow = (index: number) => {
    if (customBundleItems.length <= 1) return;
    setCustomBundleItems((prev) => prev.filter((_, i) => i !== index));
  };

  const handleUpdateCustomBundleRow = (
    index: number,
    field: keyof CustomBundleItem,
    val: any
  ) => {
    setCustomBundleItems((prev) =>
      prev.map((item, i) => (i === index ? { ...item, [field]: val } : item))
    );
  };

  const handleApplyOffer = () => {
    if (calculationResults.itemsToCart.length === 0) return;

    soundAlertService.playSaleChime();
    onApplyBundleOfferToCart({
      offerName: calculationResults.offerName,
      items: calculationResults.itemsToCart,
      originalTotal: calculationResults.originalTotal,
      finalTotal: calculationResults.finalTotal,
      savedAmount: calculationResults.savedAmount,
      savingsPercent: calculationResults.savingsPercent,
    });
    onClose();
  };

  if (!isOpen) return null;

  return (
    <div
      dir="rtl"
      className="fixed inset-0 z-[140] bg-black/60 backdrop-blur-xl flex items-center justify-center p-3 sm:p-5 animate-in fade-in duration-200"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="smart-modal-window bg-white/98 dark:bg-[#1C1C1E]/98 dark:text-white rounded-[28px] w-full max-w-2xl border border-black/[0.08] dark:border-white/10 shadow-2xl flex flex-col max-h-[92dvh] overflow-hidden">
        {/* Modal Header */}
        <div className="px-5 py-4 border-b border-black/[0.07] dark:border-white/10 flex items-center justify-between shrink-0 bg-gradient-to-r from-amber-500/10 via-purple-500/10 to-transparent">
          <div className="flex items-center gap-3">
            <div className="w-11 h-11 rounded-2xl bg-gradient-to-tr from-amber-500 via-purple-600 to-pink-500 text-white flex items-center justify-center shadow-md shrink-0 font-black">
              <Gift size={22} />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-base sm:text-lg font-black text-[#1D1D1F] dark:text-white tracking-tight">
                  حاسبة العروض والخصومات الترويجية
                </h2>
                <span className="px-2.5 py-0.5 rounded-full text-[10px] font-black bg-amber-500/15 text-amber-900 dark:text-amber-300 border border-amber-500/30">
                  حساب التوفير المباشر ✨
                </span>
              </div>
              <p className="text-[11px] text-[#86868B] dark:text-slate-400 mt-0.5">
                اختر منتجين أو أكثر لتطبيق خصم مئوي أو نقدي مباشر واطبع مبلغ التوفير بالإيصال
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="w-8 h-8 rounded-full bg-black/[0.06] dark:bg-white/10 hover:bg-black/[0.12] flex items-center justify-center text-[#1D1D1F] dark:text-white transition-colors cursor-pointer"
          >
            <X size={16} />
          </button>
        </div>

        {/* Modal Content */}
        <div className="p-4 sm:p-5 overflow-y-auto flex-1 space-y-4 modal-scroll-area">
          {/* Mode Switcher Tabs */}
          <div className="grid grid-cols-2 gap-2 bg-[#F2F2F7] dark:bg-white/5 p-1 rounded-2xl border border-black/[0.06] dark:border-white/10">
            <button
              type="button"
              onClick={() => setActiveTabMode('presets')}
              className={`py-2 px-3 rounded-xl text-xs font-black transition-all cursor-pointer flex items-center justify-center gap-2 ${
                activeTabMode === 'presets'
                  ? 'bg-white dark:bg-[#1D1D1F] text-[#1D1D1F] dark:text-white shadow-xs'
                  : 'text-[#86868B] hover:text-[#1D1D1F] dark:hover:text-white'
              }`}
            >
              <Sparkles size={15} className="text-amber-500" />
              <span>العروض الجاهزة المعتمدة ({PRESET_BUNDLE_OFFERS.length})</span>
            </button>

            <button
              type="button"
              onClick={() => setActiveTabMode('multi_custom')}
              className={`py-2 px-3 rounded-xl text-xs font-black transition-all cursor-pointer flex items-center justify-center gap-2 ${
                activeTabMode === 'multi_custom'
                  ? 'bg-white dark:bg-[#1D1D1F] text-[#1D1D1F] dark:text-white shadow-xs'
                  : 'text-[#86868B] hover:text-[#1D1D1F] dark:hover:text-white'
              }`}
            >
              <Calculator size={15} className="text-[#0071E3]" />
              <span>تكوين عرض مخصص (اختيار عطرين+)</span>
            </button>
          </div>

          {/* MODE 1: PRESETS */}
          {activeTabMode === 'presets' && (
            <div className="space-y-3">
              {/* Target Perfume Selector */}
              <div className="p-3.5 rounded-2xl bg-black/[0.03] dark:bg-white/5 border border-black/[0.06] dark:border-white/10 space-y-1.5">
                <label className="text-xs font-black text-[#1D1D1F] dark:text-white block">
                  ١. اختر العطر للخصم الترويجي:
                </label>
                <select
                  value={selectedPerfumeId}
                  onChange={(e) => setSelectedPerfumeId(e.target.value)}
                  className="w-full h-10 px-3 rounded-xl bg-white dark:bg-[#1C1C1E] border border-black/[0.1] dark:border-white/15 font-bold text-xs outline-none cursor-pointer"
                >
                  {products.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name} ({p.brand}) · الفئة: {p.type} · المخزون: {p.stock_grams} جم
                    </option>
                  ))}
                </select>
              </div>

              {/* Preset Cards */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                {PRESET_BUNDLE_OFFERS.map((offer) => {
                  const isSelected = selectedOfferId === offer.id;
                  return (
                    <button
                      key={offer.id}
                      type="button"
                      onClick={() => setSelectedOfferId(offer.id)}
                      className={`p-3.5 rounded-2xl border text-right transition-all cursor-pointer flex flex-col justify-between gap-2 ${
                        isSelected
                          ? 'bg-[#0071E3]/10 dark:bg-[#0071E3]/20 border-[#0071E3] ring-2 ring-[#0071E3]/20 shadow-xs'
                          : 'bg-white dark:bg-white/5 border-black/[0.08] dark:border-white/10 hover:border-[#0071E3]/40'
                      }`}
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span className={`text-[10px] font-black px-2.5 py-0.5 rounded-full border ${offer.badgeColor}`}>
                          {offer.badge}
                        </span>
                        {isSelected && <Check size={16} className="text-[#0071E3]" />}
                      </div>

                      <div>
                        <h4 className="text-xs font-black text-[#1D1D1F] dark:text-white">{offer.name}</h4>
                        <p className="text-[11px] text-[#86868B] dark:text-slate-400 leading-snug mt-0.5">{offer.description}</p>
                      </div>

                      <div className="text-[11px] font-mono font-bold text-[#0071E3] pt-1.5 border-t border-black/[0.05] dark:border-white/10">
                        خصم العرض: {offer.discountValue}
                        {offer.discountType === 'percent' ? '%' : ` ${currency}`}
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {/* MODE 2: MULTI-CUSTOM BUNDLE (اختيار عطرين أو أكثر) */}
          {activeTabMode === 'multi_custom' && (
            <div className="p-4 rounded-2xl bg-slate-50 dark:bg-white/5 border border-black/[0.08] dark:border-white/10 space-y-3.5 text-xs">
              <div className="flex items-center justify-between pb-2 border-b border-black/[0.06] dark:border-white/10">
                <span className="font-black text-[#1D1D1F] dark:text-white flex items-center gap-1.5">
                  <Tag size={15} className="text-[#0071E3]" />
                  <span>تخصيص أصناف المجموعة العطرية (اختيار عطرين أو أكثر):</span>
                </span>

                <button
                  type="button"
                  onClick={handleAddCustomBundleRow}
                  className="px-3 py-1.5 rounded-xl bg-[#0071E3] hover:bg-[#0077ED] text-white text-[11px] font-black flex items-center gap-1 shadow-2xs cursor-pointer"
                >
                  <Plus size={13} />
                  <span>+ إضافة عطر إضافي</span>
                </button>
              </div>

              {/* Offer Name Title */}
              <div>
                <label className="font-bold text-[#86868B] dark:text-slate-400 block mb-1">اسم العرض المخصص:</label>
                <input
                  type="text"
                  value={customOfferTitle}
                  onChange={(e) => setCustomOfferTitle(e.target.value)}
                  placeholder="مثال: عرض عطرين نيش وتوفير 15%"
                  className="w-full h-10 px-3 rounded-xl bg-white dark:bg-[#1C1C1E] border border-black/[0.08] dark:border-white/15 font-bold outline-none"
                />
              </div>

              {/* Items List */}
              <div className="space-y-2">
                {customBundleItems.map((item, idx) => {
                  return (
                    <div
                      key={idx}
                      className="p-2.5 rounded-xl bg-white dark:bg-[#1C1C1E] border border-black/[0.08] dark:border-white/10 grid grid-cols-12 gap-2 items-center"
                    >
                      <div className="col-span-6 sm:col-span-5">
                        <label className="text-[10px] text-[#86868B] dark:text-slate-400 block mb-0.5">العطر {idx + 1}:</label>
                        <select
                          value={item.productId}
                          onChange={(e) => handleUpdateCustomBundleRow(idx, 'productId', e.target.value)}
                          className="w-full h-9 px-2 rounded-lg bg-[#F5F5F7] dark:bg-white/5 border border-black/[0.08] dark:border-white/10 font-bold text-xs outline-none cursor-pointer"
                        >
                          {products.map((p) => (
                            <option key={p.id} value={p.id}>
                              {p.name} ({p.type})
                            </option>
                          ))}
                        </select>
                      </div>

                      <div className="col-span-3 sm:col-span-3">
                        <label className="text-[10px] text-[#86868B] dark:text-slate-400 block mb-0.5">الحجم:</label>
                        <select
                          value={item.bottleSizeMl}
                          onChange={(e) => handleUpdateCustomBundleRow(idx, 'bottleSizeMl', Number(e.target.value))}
                          className="w-full h-9 px-2 rounded-lg bg-[#F5F5F7] dark:bg-white/5 border border-black/[0.08] dark:border-white/10 font-bold text-xs outline-none cursor-pointer"
                        >
                          <option value={30}>30 مل</option>
                          <option value={50}>50 مل</option>
                          <option value={100}>100 مل</option>
                        </select>
                      </div>

                      <div className="col-span-2 sm:col-span-3">
                        <label className="text-[10px] text-[#86868B] dark:text-slate-400 block mb-0.5">العدد:</label>
                        <input
                          type="number"
                          min="1"
                          max="10"
                          value={item.quantity}
                          onChange={(e) => handleUpdateCustomBundleRow(idx, 'quantity', Math.max(1, Number(e.target.value)))}
                          className="w-full h-9 px-2 rounded-lg bg-[#F5F5F7] dark:bg-white/5 border border-black/[0.08] dark:border-white/10 font-mono font-bold outline-none text-center"
                        />
                      </div>

                      <div className="col-span-1 flex justify-center pt-3">
                        <button
                          type="button"
                          disabled={customBundleItems.length <= 1}
                          onClick={() => handleRemoveCustomBundleRow(idx)}
                          className="w-7 h-7 rounded-lg text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/40 disabled:opacity-30 flex items-center justify-center transition-colors cursor-pointer"
                        >
                          <Trash2 size={14} />
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* Discount Settings */}
              <div className="grid grid-cols-2 gap-3 pt-2 border-t border-black/[0.06] dark:border-white/10">
                <div>
                  <label className="font-bold text-[#1D1D1F] dark:text-white block mb-1">نوع الخصم الترويجي:</label>
                  <select
                    value={customDiscountType}
                    onChange={(e) => setCustomDiscountType(e.target.value as any)}
                    className="w-full h-10 px-3 rounded-xl bg-white dark:bg-[#1C1C1E] border border-black/[0.08] dark:border-white/15 font-bold outline-none cursor-pointer"
                  >
                    <option value="percent">خصم مئوي (%)</option>
                    <option value="fixed">خصم نقدي ثابت ({currency})</option>
                  </select>
                </div>

                <div>
                  <label className="font-bold text-[#1D1D1F] dark:text-white block mb-1">قيمة الخصم المطلوبة:</label>
                  <input
                    type="number"
                    min="1"
                    value={customDiscountValue}
                    onChange={(e) => setCustomDiscountValue(Math.max(0, Number(e.target.value)))}
                    className="w-full h-10 px-3 rounded-xl bg-white dark:bg-[#1C1C1E] border border-black/[0.08] dark:border-white/15 font-mono font-bold outline-none"
                  />
                </div>
              </div>
            </div>
          )}

          {/* Results Summary Box (Apple Glass Financial Breakdown Card) */}
          <div className="p-4 rounded-2xl bg-gradient-to-br from-amber-500/15 via-purple-500/10 to-slate-900 text-[#1D1D1F] dark:text-white border border-amber-500/30 space-y-3 shadow-md">
            <div className="flex items-center justify-between pb-2 border-b border-black/10 dark:border-white/10">
              <span className="text-xs font-black flex items-center gap-1.5 text-amber-900 dark:text-amber-300">
                <Tag size={15} className="text-amber-600" />
                <span>تحليل وتوقعات التوفير للعميل:</span>
              </span>
              <span className="text-[10px] font-bold px-2.5 py-0.5 rounded-full bg-amber-500/20 text-amber-900 dark:text-amber-200 border border-amber-500/30 truncate max-w-[200px]">
                {calculationResults.offerName}
              </span>
            </div>

            <div className="grid grid-cols-3 gap-2 text-center">
              <div className="p-2.5 rounded-xl bg-white/80 dark:bg-black/40 border border-black/5 dark:border-white/10">
                <span className="text-[10px] text-[#86868B] dark:text-slate-400 block">السعر الأصلي:</span>
                <span className="text-sm font-black font-mono line-through text-slate-400">
                  {calculationResults.originalTotal} {currency}
                </span>
              </div>

              <div className="p-2.5 rounded-xl bg-emerald-500/15 border border-emerald-500/30">
                <span className="text-[10px] text-emerald-900 dark:text-emerald-300 font-bold block">سعر العرض النهائي:</span>
                <span className="text-base font-black font-mono text-emerald-700 dark:text-emerald-300">
                  {calculationResults.finalTotal} {currency}
                </span>
              </div>

              <div className="p-2.5 rounded-xl bg-amber-500/20 border border-amber-500/40">
                <span className="text-[10px] text-amber-900 dark:text-amber-200 font-bold block">وفر العميل بالجنيه:</span>
                <span className="text-base font-black font-mono text-amber-900 dark:text-amber-200 underline">
                  {calculationResults.savedAmount} {currency} ({calculationResults.savingsPercent}%)
                </span>
              </div>
            </div>
          </div>
        </div>

        {/* Modal Footer */}
        <div className="px-5 py-3 border-t border-black/[0.07] dark:border-white/10 bg-black/[0.02] dark:bg-white/5 flex items-center justify-between shrink-0">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 rounded-xl bg-black/[0.06] dark:bg-white/10 hover:bg-black/[0.12] text-[#1D1D1F] dark:text-white text-xs font-bold transition-colors cursor-pointer"
          >
            إلغاء
          </button>

          <button
            type="button"
            onClick={handleApplyOffer}
            className="apple-btn px-6 py-2.5 rounded-xl bg-[#0071E3] hover:bg-[#0077ED] text-white text-xs font-black shadow-md flex items-center gap-2 cursor-pointer"
          >
            <ShoppingBag size={16} />
            <span>تطبيق العرض فوراً على السلة والتنفيذ 🛒</span>
          </button>
        </div>
      </div>
    </div>
  );
};

export default PromotionalBundlesCalculatorModal;
