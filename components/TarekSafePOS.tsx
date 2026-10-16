import { useEffect, useMemo, useState } from 'react';
import { AlertCircle, CheckCircle2, CircleDollarSign, LoaderCircle, PackagePlus, RefreshCw, ShieldCheck, ShoppingBag, Trash2 } from 'lucide-react';
import { auth } from '../services/firebase';
import {
  LOCAL_LAMSA_SALE_ENDPOINT,
  quoteTarekSaleToLocalEmulatorWorker,
  submitTarekSaleIntentToLocalEmulatorWorker,
  type TarekSaleQuoteResult,
} from '../services/workerSaleClient';
import {
  enqueueTarekSale,
  flushTarekSaleOutbox,
  getTarekSaleOutbox,
  replaceTarekSaleQuote,
  subscribeToTarekSaleOutbox,
  type TarekSaleOutboxEntry,
} from '../services/tarekSaleOutbox';
import type { TarekOperationalProduct, TarekSaleBottleSize, TarekSaleProduct } from '../services/separatedDataModel';
import type { TarekSafeSaleDraft } from '../services/workerSaleContract';
import { TAREK_SALE_PRESET_OFFERS } from '../services/tarekSalePresets';

type CartLine = {
  lineId: string;
  productId: string;
  bottleSizeId: string;
  bottleSizeMl: number;
  quantity: number;
  essenceGramsPerBottle: number;
  isColoredBottle: boolean;
};

type Props = {
  canCreateSales: boolean;
  catalogReady: boolean;
  products: TarekSaleProduct[];
  bottleSizes: TarekSaleBottleSize[];
  stockProducts: TarekOperationalProduct[];
};

function newId(prefix: string): string {
  const random = globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  return `${prefix}-${random}`;
}

function formatEgp(value: number): string {
  return `${value.toLocaleString('ar-EG')} ج.م`;
}

function formatTime(value: number): string {
  const seconds = Math.max(0, Math.ceil((value - Date.now()) / 1000));
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`;
}

function draftFromEntry(entry: TarekSaleOutboxEntry, quoteId: string): TarekSafeSaleDraft {
  const { schema: _schema, quoteId: _oldQuoteId, ...draft } = entry.intent;
  return { ...draft, quoteId };
}

function amount(value: string): number {
  if (value.trim() === '') return 0;
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : Number.NaN;
}

export default function TarekSafePOS({ canCreateSales, catalogReady, products, bottleSizes, stockProducts }: Props) {
  const [saleId, setSaleId] = useState(() => newId('tarek-sale'));
  const [cart, setCart] = useState<CartLine[]>([]);
  const [selectedProductId, setSelectedProductId] = useState('');
  const [selectedBottleId, setSelectedBottleId] = useState('');
  const [quantity, setQuantity] = useState('1');
  const [colored, setColored] = useState(false);
  const [manualDiscountText, setManualDiscountText] = useState('0');
  const [promotionId, setPromotionId] = useState('');
  const [paymentMethod, setPaymentMethod] = useState<TarekSafeSaleDraft['paymentMethod']>('نقدي');
  const [quote, setQuote] = useState<(TarekSaleQuoteResult & { draft: TarekSafeSaleDraft }) | null>(null);
  const [quoteBusy, setQuoteBusy] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [outbox, setOutbox] = useState<TarekSaleOutboxEntry[]>([]);
  const [isOnline, setIsOnline] = useState(() => typeof navigator !== 'undefined' && navigator.onLine);
  const [requote, setRequote] = useState<{
    entryId: string;
    saleId: string;
    draft: TarekSafeSaleDraft;
    quote: TarekSaleQuoteResult;
  } | null>(null);

  const localPreviewEnabled = import.meta.env.DEV && import.meta.env.VITE_PREVIEW_SAFE_MODE === 'true';
  const stockByProduct = useMemo(() => new Map(stockProducts.map((product) => [String(product.id), product.stock_grams])), [stockProducts]);
  const activeProducts = useMemo(
    () => products.filter((product) => product.isActive !== false).sort((a, b) => a.name.localeCompare(b.name, 'ar')),
    [products],
  );
  const activeBottleSizes = useMemo(
    () => bottleSizes.filter((bottle) => bottle.isActive !== false).sort((a, b) => a.sizeMl - b.sizeMl),
    [bottleSizes],
  );
  const selectedBottle = activeBottleSizes.find((bottle) => bottle.id === selectedBottleId);
  const selectedProduct = activeProducts.find((product) => product.id === selectedProductId);
  const selectedOffer = TAREK_SALE_PRESET_OFFERS.find((offer) => offer.id === promotionId);
  const cartOfferQuantity = cart.reduce((sum, line) => sum + line.quantity, 0);
  const offerMatches = !selectedOffer || (cart.length > 0
    && cart.every((line) => line.bottleSizeMl === selectedOffer.sizeMl && !line.isColoredBottle
      && !activeBottleSizes.find((bottle) => bottle.id === line.bottleSizeId)?.isRollOn)
    && cartOfferQuantity === selectedOffer.quantity);
  const discountAmount = amount(manualDiscountText);
  const cartHasQueuedSale = outbox.some((entry) => entry.saleId === saleId);
  const localWorkerUsable = localPreviewEnabled && Boolean(auth.currentUser) && isOnline;

  useEffect(() => {
    const refresh = () => setOutbox(getTarekSaleOutbox());
    refresh();
    return subscribeToTarekSaleOutbox(refresh);
  }, []);

  useEffect(() => {
    const updateOnlineState = () => setIsOnline(typeof navigator !== 'undefined' && navigator.onLine);
    window.addEventListener('online', updateOnlineState);
    window.addEventListener('offline', updateOnlineState);
    updateOnlineState();
    return () => {
      window.removeEventListener('online', updateOnlineState);
      window.removeEventListener('offline', updateOnlineState);
    };
  }, []);

  useEffect(() => {
    if (!selectedProductId && activeProducts[0]) setSelectedProductId(activeProducts[0].id);
    if (!selectedBottleId && activeBottleSizes[0]) setSelectedBottleId(activeBottleSizes[0].id);
  }, [activeProducts, activeBottleSizes, selectedProductId, selectedBottleId]);

  useEffect(() => {
    const flush = () => {
      if (!localWorkerUsable || getTarekSaleOutbox().length === 0) return;
      void flushTarekSaleOutbox((intent) => submitTarekSaleIntentToLocalEmulatorWorker(
        intent,
        LOCAL_LAMSA_SALE_ENDPOINT,
        async () => {
          const currentUser = auth.currentUser;
          if (!currentUser) throw new Error('worker-sale/firebase-id-token-required');
          return currentUser.getIdToken();
        },
      )).then(() => setOutbox(getTarekSaleOutbox())).catch(() => setOutbox(getTarekSaleOutbox()));
    };
    window.addEventListener('online', flush);
    const timer = window.setInterval(flush, 30_000);
    if (localWorkerUsable && getTarekSaleOutbox().length > 0) flush();
    return () => {
      window.removeEventListener('online', flush);
      window.clearInterval(timer);
    };
  }, [localWorkerUsable]);

  function invalidateQuote(nextCart?: CartLine[]) {
    if (cartHasQueuedSale) return;
    if (nextCart) setCart(nextCart);
    setSaleId(newId('tarek-sale'));
    setQuote(null);
    setError(null);
    setNotice(null);
  }

  function addSelectedLine() {
    if (!selectedProduct || !selectedBottle) return;
    const count = Number(quantity);
    if (!Number.isSafeInteger(count) || count < 1 || count > 100) {
      setError('أدخل كمية صحيحة من 1 إلى 100.');
      return;
    }
    if (!Number.isSafeInteger(selectedBottle.essenceGrams) || selectedBottle.essenceGrams <= 0) {
      setError('لا يمكن بيع هذه العبوة قبل أن يضبط المالك كمية الزيت المرجعية لها.');
      return;
    }
    const currentStock = stockByProduct.get(selectedProduct.id);
    const alreadyUsed = cart.filter((line) => line.productId === selectedProduct.id)
      .reduce((sum, line) => sum + line.essenceGramsPerBottle * line.quantity, 0);
    if (currentStock !== undefined && alreadyUsed + selectedBottle.essenceGrams * count > currentStock) {
      setError('الكمية تتجاوز المخزون الظاهر؛ سيظل العامل يعيد التحقق من المخزون عند الاعتماد.');
      return;
    }
    const next = [...cart, {
      lineId: newId('line'),
      productId: selectedProduct.id,
      bottleSizeId: selectedBottle.id,
      bottleSizeMl: selectedBottle.sizeMl,
      quantity: count,
      essenceGramsPerBottle: selectedBottle.essenceGrams,
      isColoredBottle: colored,
    }];
    invalidateQuote(next);
  }

  function updateLine(lineId: string, delta: number) {
    const next = cart.flatMap((line) => {
      if (line.lineId !== lineId) return [line];
      const newQuantity = line.quantity + delta;
      return newQuantity > 0 ? [{ ...line, quantity: newQuantity }] : [];
    });
    invalidateQuote(next);
  }

  function buildDraft(quoteId: string): TarekSafeSaleDraft {
    if (!Number.isFinite(discountAmount)) throw new Error('قيمة الخصم غير صالحة.');
    return {
      saleId,
      quoteId,
      lines: cart.map((line) => ({
        ...line,
        ...(promotionId ? { promotionId } : {}),
      })),
      manualDiscountEgp: discountAmount,
      ...(promotionId ? { promotionId } : {}),
      paymentMethod,
      packagingPaid: false,
    };
  }

  async function requestQuote() {
    setError(null);
    setNotice(null);
    if (!canCreateSales || !catalogReady) {
      setError('صلاحية البيع أو كتالوج الأسعار غير جاهز؛ لا يمكن المتابعة.');
      return;
    }
    if (!localPreviewEnabled) {
      setError('المبيعات غير متصلة بأي Worker إنتاجي. هذه النسخة تسمح فقط بمعاينة التطوير المحلية الآمنة.');
      return;
    }
    if (!isOnline || typeof navigator === 'undefined' || !navigator.onLine) {
      setError('لا يوجد اتصال؛ لم يُسجل بيع ولم يُرسل أي شيء.');
      return;
    }
    if (!auth.currentUser) {
      setError('لا توجد جلسة Firebase صالحة في بيئة المعاينة المحلية.');
      return;
    }
    if (cart.length === 0) {
      setError('أضف منتجاً واحداً على الأقل.');
      return;
    }
    if (!offerMatches) {
      setError('كميات أو أحجام السلة لا تطابق شروط العرض الجاهز؛ عدّلها أو أزل العرض.');
      return;
    }
    const quoteId = newId('quote');
    let draft: TarekSafeSaleDraft;
    try { draft = buildDraft(quoteId); }
    catch (reason) { setError(reason instanceof Error ? reason.message : 'بيانات البيع غير صالحة.'); return; }
    setQuoteBusy(true);
    try {
      const result = await quoteTarekSaleToLocalEmulatorWorker(
        draft,
        LOCAL_LAMSA_SALE_ENDPOINT,
        async () => {
          const currentUser = auth.currentUser;
          if (!currentUser) throw new Error('worker-sale/firebase-id-token-required');
          return currentUser.getIdToken();
        },
      );
      setQuote({ ...result, draft });
      setNotice('تم جلب السعر المرجعي من العامل المحلي. راجع الإجمالي قبل اعتماد البيع.');
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'تعذّر حساب السعر المرجعي.');
    } finally {
      setQuoteBusy(false);
    }
  }

  async function flushOutboxNow(saleToWatch?: string) {
    if (!localWorkerUsable || typeof navigator === 'undefined' || !navigator.onLine) {
      setError('العامل المحلي أو جلسة الاختبار غير متاحين؛ بقيت الفاتورة في هذا المتصفح فقط.');
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const result = await flushTarekSaleOutbox((intent) => submitTarekSaleIntentToLocalEmulatorWorker(
        intent,
        LOCAL_LAMSA_SALE_ENDPOINT,
        async () => {
          const currentUser = auth.currentUser;
          if (!currentUser) throw new Error('worker-sale/firebase-id-token-required');
          return currentUser.getIdToken();
        },
      ));
      setOutbox(getTarekSaleOutbox());
      if (saleToWatch && result.syncedSaleIds.includes(saleToWatch)) {
        setCart([]);
        setSaleId(newId('tarek-sale'));
        setQuote(null);
        setManualDiscountText('0');
        setPromotionId('');
        setNotice('أقرّ العامل المحلي اعتماد الفاتورة؛ سيصل سجلها للأجهزة المشتركة فقط عند وجود اتصال مشترك فعلي.');
      } else if (result.failed > 0) {
        setNotice('لم يؤكد العامل إتمام كل الفواتير؛ بقيت العناصر في الطابور للمراجعة أو إعادة المحاولة.');
      }
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'تعذرت مزامنة الطابور.');
    } finally {
      setBusy(false);
    }
  }

  async function approveQuotedSale() {
    if (!quote || quote.sale.id !== saleId || Date.now() >= quote.expiresAt) {
      setError('انتهت صلاحية عرض السعر؛ أعد الحساب قبل الاعتماد.');
      setQuote(null);
      return;
    }
    if (!localWorkerUsable || typeof navigator === 'undefined' || !navigator.onLine) {
      setError('العامل المحلي غير متاح؛ لن يُعلن البيع مكتملاً.');
      return;
    }
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      await enqueueTarekSale(quote.draft);
      setOutbox(getTarekSaleOutbox());
      await flushOutboxNow(saleId);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'تعذّر حفظ الفاتورة في الطابور المحلي.');
    } finally {
      setBusy(false);
    }
  }

  async function requestRequote(entry: TarekSaleOutboxEntry) {
    if (!localWorkerUsable) {
      setError('لا يمكن تحديث السعر دون العامل المحلي وجلسة الاختبار.');
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const draft = draftFromEntry(entry, newId('quote'));
      const result = await quoteTarekSaleToLocalEmulatorWorker(
        draft,
        LOCAL_LAMSA_SALE_ENDPOINT,
        async () => {
          const currentUser = auth.currentUser;
          if (!currentUser) throw new Error('worker-sale/firebase-id-token-required');
          return currentUser.getIdToken();
        },
      );
      setRequote({ entryId: entry.id, saleId: entry.saleId, draft, quote: result });
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'تعذّر تحديث عرض السعر.');
    } finally {
      setBusy(false);
    }
  }

  async function approveRequote() {
    if (!requote || Date.now() >= requote.quote.expiresAt) {
      setError('انتهى عرض السعر الجديد؛ أعد طلبه قبل الموافقة.');
      setRequote(null);
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await replaceTarekSaleQuote(requote.saleId, requote.draft);
      setRequote(null);
      await flushOutboxNow(requote.saleId);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'تعذّر حفظ السعر الجديد.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="overflow-hidden rounded-3xl border border-emerald-200 bg-white shadow-sm">
      <header className="flex flex-wrap items-start justify-between gap-4 border-b border-emerald-100 bg-emerald-50/70 p-5">
        <div className="flex items-start gap-3">
          <ShoppingBag className="mt-0.5 text-emerald-800" size={22} />
          <div>
            <h2 className="font-black">نقطة بيع آمنة لطارق</h2>
            <p className="mt-1 text-xs leading-5 text-[#555]">
              لا يوجد حقل لسعر البيع أو التكلفة أو الربح أو العمولة. العامل يعيد حساب السعر والخصم والمخزون قبل الحفظ.
            </p>
          </div>
        </div>
        <span className={`rounded-full px-3 py-1 text-xs font-bold ${localPreviewEnabled ? 'bg-amber-100 text-amber-900' : 'bg-rose-100 text-rose-900'}`}>
          {localPreviewEnabled ? 'محاكي محلي فقط' : 'لا يوجد اتصال إنتاجي'}
        </span>
      </header>

      <div className="space-y-5 p-5">
        <div role="note" className="flex gap-3 rounded-2xl border border-amber-300 bg-amber-50 p-4 text-xs leading-5 text-amber-950">
          <ShieldCheck className="mt-0.5 shrink-0" size={18} />
          <p>
            هذا مسار تطوير محلي فقط؛ لا يزامن بين الأجهزة ولا يتصل بـFirebase أو Worker إنتاجي. طابور المبيعات محفوظ على هذا المتصفح فقط، ولا يُحذف إلا بعد إقرار مطابق من العامل المحلي. إعادة محاولة الشبكة تستخدم معرّف الفاتورة نفسه لمنع التكرار.
          </p>
        </div>

        {!canCreateSales && <div className="rounded-xl bg-rose-50 p-3 text-sm font-semibold text-rose-900">لا يوجد منح STORE_MANAGER نشط من المالك؛ نقطة البيع مقفلة.</div>}
        {canCreateSales && !catalogReady && <div className="rounded-xl bg-amber-50 p-3 text-sm text-amber-950">كتالوج البيع الآمن لم يكتمل بعد. يهيئه المالك من إسقاطات المنتجات وأسعار العبوات المعتمدة.</div>}
        {canCreateSales && catalogReady && activeProducts.length === 0 && <div className="rounded-xl bg-amber-50 p-3 text-sm text-amber-950">لا توجد منتجات نشطة للبيع في الإسقاط الآمن.</div>}

        <div className="grid gap-3 md:grid-cols-4">
          <label className="space-y-1 text-sm font-semibold">
            المنتج
            <select value={selectedProductId} onChange={(event) => setSelectedProductId(event.target.value)} disabled={!canCreateSales || cartHasQueuedSale} className="w-full rounded-xl border border-black/15 bg-white px-3 py-2">
              {activeProducts.map((product) => <option value={product.id} key={product.id}>{product.name}</option>)}
            </select>
          </label>
          <label className="space-y-1 text-sm font-semibold">
            العبوة
            <select value={selectedBottleId} onChange={(event) => setSelectedBottleId(event.target.value)} disabled={!canCreateSales || cartHasQueuedSale} className="w-full rounded-xl border border-black/15 bg-white px-3 py-2">
              {activeBottleSizes.map((bottle) => <option value={bottle.id} key={bottle.id}>{bottle.name || `عبوة ${bottle.sizeMl} مل`}</option>)}
            </select>
          </label>
          <label className="space-y-1 text-sm font-semibold">
            الكمية
            <input value={quantity} onChange={(event) => setQuantity(event.target.value)} min={1} max={100} type="number" disabled={cartHasQueuedSale} className="w-full rounded-xl border border-black/15 px-3 py-2" />
          </label>
          <div className="flex items-end gap-2">
            <label className="flex min-h-10 flex-1 items-center gap-2 rounded-xl border border-black/15 px-3 text-sm">
              <input type="checkbox" checked={colored} onChange={(event) => setColored(event.target.checked)} disabled={cartHasQueuedSale || !selectedBottle || (selectedBottle.coloredNormalPrice === undefined && selectedBottle.coloredSpecialPrice === undefined)} />
              عبوة ملوّنة
            </label>
            <button type="button" onClick={addSelectedLine} disabled={!canCreateSales || !catalogReady || !selectedProduct || !selectedBottle || cartHasQueuedSale} className="inline-flex min-h-10 items-center gap-2 rounded-xl bg-[#1D1D1F] px-4 text-sm font-bold text-white disabled:opacity-40">
              <PackagePlus size={16} /> إضافة
            </button>
          </div>
        </div>

        {selectedProduct && selectedBottle && <p className="text-xs text-[#6E6E73]">
          {selectedProduct.name} · {selectedBottle.sizeMl} مل · المخزون التشغيلي الظاهر: {stockByProduct.get(selectedProduct.id)?.toLocaleString('ar-EG') ?? 'غير متاح'} جم. لا تُعرض أسعار المنتجات هنا؛ السعر يظهر فقط بعد رد العامل.
        </p>}

        {cart.length > 0 ? <div className="overflow-hidden rounded-2xl border border-black/10">
          <div className="divide-y divide-black/[0.06]">
            {cart.map((line) => {
              const product = activeProducts.find((item) => item.id === line.productId);
              return <div key={line.lineId} className="flex flex-wrap items-center justify-between gap-3 p-3 text-sm">
                <div className="min-w-0">
                  <strong>{product?.name || line.productId}</strong>
                  <span className="mr-2 text-xs text-[#6E6E73]">{line.bottleSizeMl} مل{line.isColoredBottle ? ' · ملوّنة' : ''}</span>
                </div>
                <div className="flex items-center gap-2">
                  <button type="button" onClick={() => updateLine(line.lineId, -1)} disabled={cartHasQueuedSale} aria-label="تقليل الكمية" className="h-8 w-8 rounded-full border border-black/15">−</button>
                  <span className="min-w-7 text-center font-bold">{line.quantity}</span>
                  <button type="button" onClick={() => updateLine(line.lineId, 1)} disabled={cartHasQueuedSale} aria-label="زيادة الكمية" className="h-8 w-8 rounded-full border border-black/15">+</button>
                  <button type="button" onClick={() => invalidateQuote(cart.filter((item) => item.lineId !== line.lineId))} disabled={cartHasQueuedSale} aria-label="حذف السطر" className="mr-1 rounded-lg p-2 text-rose-700 hover:bg-rose-50"><Trash2 size={16} /></button>
                </div>
              </div>;
            })}
          </div>
        </div> : <p className="rounded-2xl bg-[#F5F5F7] p-4 text-sm text-[#6E6E73]">السلة فارغة. سيُعاد احتساب السعر من مصادر المالك عند طلب العرض.</p>}

        <div className="grid gap-3 md:grid-cols-3">
          <label className="space-y-1 text-sm font-semibold">
            عرض جاهز (اختياري)
            <select value={promotionId} onChange={(event) => { setPromotionId(event.target.value); setSaleId(newId('tarek-sale')); setQuote(null); }} disabled={cartHasQueuedSale} className="w-full rounded-xl border border-black/15 bg-white px-3 py-2">
              <option value="">بدون عرض جاهز</option>
              {TAREK_SALE_PRESET_OFFERS.map((offer) => <option value={offer.id} key={offer.id}>{offer.name}</option>)}
            </select>
          </label>
          <label className="space-y-1 text-sm font-semibold">
            خصم يدوي بالجنيه
            <input type="number" min={0} step="0.01" value={manualDiscountText} onChange={(event) => { setManualDiscountText(event.target.value); setSaleId(newId('tarek-sale')); setQuote(null); }} disabled={cartHasQueuedSale} className="w-full rounded-xl border border-black/15 px-3 py-2" />
          </label>
          <label className="space-y-1 text-sm font-semibold">
            طريقة الدفع
            <select value={paymentMethod} onChange={(event) => { setPaymentMethod(event.target.value as TarekSafeSaleDraft['paymentMethod']); setSaleId(newId('tarek-sale')); setQuote(null); }} disabled={cartHasQueuedSale} className="w-full rounded-xl border border-black/15 bg-white px-3 py-2">
              <option>نقدي</option><option>بطاقة</option><option>محفظة إلكترونية</option><option>تحويل بنكي</option>
            </select>
          </label>
        </div>
        {selectedOffer && !offerMatches && <p className="rounded-xl bg-amber-50 p-3 text-xs text-amber-950">شروط العرض {selectedOffer.name}: {selectedOffer.quantity} عبوة غير ملوّنة مقاس {selectedOffer.sizeMl} مل بالضبط. لن يُقبل عرض غير مطابق.</p>}
        <p className="text-xs text-[#6E6E73]">سقف الخصم يحدده العامل بحسب التكلفة والعمولة والهامش المحمي؛ إدخال الخصم لا يضمن قبوله. العروض المخصصة، واستبدال نقاط الولاء، ودفتر CRM، والخلطات المحفوظة وإحصاءات إعادة شرائها غير مفعّلة في هذا المسار.</p>

        <div className="flex flex-wrap gap-3">
          <button type="button" onClick={() => void requestQuote()} disabled={!canCreateSales || !catalogReady || !localPreviewEnabled || quoteBusy || busy || cart.length === 0 || cartHasQueuedSale || !offerMatches || !Number.isFinite(discountAmount)} className="inline-flex items-center gap-2 rounded-xl border border-emerald-800 px-4 py-2 text-sm font-bold text-emerald-900 disabled:opacity-40">
            {quoteBusy ? <LoaderCircle className="animate-spin" size={16} /> : <CircleDollarSign size={16} />} حساب السعر المعتمد
          </button>
          {quote && <button type="button" onClick={() => void approveQuotedSale()} disabled={busy || !localWorkerUsable || Date.now() >= quote.expiresAt || cartHasQueuedSale} className="inline-flex items-center gap-2 rounded-xl bg-emerald-800 px-4 py-2 text-sm font-bold text-white disabled:opacity-40">
            {busy ? <LoaderCircle className="animate-spin" size={16} /> : <CheckCircle2 size={16} />} اعتماد البيع ({formatEgp(quote.sale.totalPrice)})
          </button>}
          {outbox.some((entry) => entry.status === 'فشل' || entry.status === 'معلق' || entry.status === 'جاري المزامنة') && <button type="button" onClick={() => void flushOutboxNow()} disabled={busy || !localWorkerUsable} className="inline-flex items-center gap-2 rounded-xl border border-black/15 px-4 py-2 text-sm font-bold disabled:opacity-40"><RefreshCw size={15} /> مزامنة الآن</button>}
        </div>

        {quote && <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-4" aria-live="polite">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div><p className="text-xs text-emerald-900">إجمالي السعر المعتمد من العامل — صالح {formatTime(quote.expiresAt)}</p><strong className="mt-1 block text-2xl tabular-nums">{formatEgp(quote.sale.totalPrice)}</strong></div>
            <p className="text-sm">الخصم المطبق: {formatEgp(quote.sale.discount)}</p>
          </div>
          <ul className="mt-3 divide-y divide-emerald-900/10 text-sm">
            {quote.sale.items.map((item) => <li key={item.id} className="flex justify-between gap-3 py-2"><span>{item.productName} · {item.bottleSize} مل × {item.quantity}</span><strong>{formatEgp(item.sellingPrice)} للسطر قبل الخصم</strong></li>)}
          </ul>
          <p className="mt-2 text-xs text-emerald-900">لن يُحفظ شيء حتى تضغط اعتماد البيع. التكلفة والأرباح والعمولة غير معروضة.</p>
        </div>}

        {outbox.length > 0 && <section className="rounded-2xl border border-black/10 p-4">
          <h3 className="font-bold">طابور هذا المتصفح ({outbox.length})</h3>
          <div className="mt-3 space-y-3">
            {outbox.map((entry) => <article key={entry.id} className="rounded-xl bg-[#F5F5F7] p-3 text-sm">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div><strong>فاتورة {entry.saleId.slice(-10)}</strong><span className="mr-2 text-xs text-[#6E6E73]">{entry.status}</span></div>
                <span className="text-xs text-[#6E6E73]">محاولات: {entry.retryCount}</span>
              </div>
              {entry.errorCode && <p className="mt-1 break-all text-xs text-rose-800">{entry.errorCode}</p>}
              {entry.status === 'يحتاج تحديث السعر' && <button type="button" onClick={() => void requestRequote(entry)} disabled={busy || !localWorkerUsable} className="mt-2 rounded-lg border border-amber-700 px-3 py-1.5 text-xs font-bold text-amber-900 disabled:opacity-40">إعادة التسعير</button>}
            </article>)}
          </div>
        </section>}

        {requote && <div className="rounded-2xl border border-amber-300 bg-amber-50 p-4" aria-live="polite">
          <p className="text-xs font-bold text-amber-950">السعر الجديد للفاتورة {requote.saleId.slice(-10)} (لم يتم الاعتماد بعد)</p>
          <strong className="mt-1 block text-2xl">{formatEgp(requote.quote.sale.totalPrice)}</strong>
          <p className="mt-1 text-sm">الخصم: {formatEgp(requote.quote.sale.discount)} · صلاحية العرض {formatTime(requote.quote.expiresAt)}</p>
          <button type="button" onClick={() => void approveRequote()} disabled={busy || Date.now() >= requote.quote.expiresAt} className="mt-3 rounded-xl bg-amber-800 px-4 py-2 text-sm font-bold text-white disabled:opacity-40">أوافق على السعر الجديد وأعد المحاولة</button>
        </div>}

        {notice && <p role="status" className="flex items-start gap-2 rounded-xl bg-emerald-50 p-3 text-sm text-emerald-900"><CheckCircle2 size={17} className="mt-0.5 shrink-0" />{notice}</p>}
        {error && <p role="alert" className="flex items-start gap-2 rounded-xl bg-rose-50 p-3 text-sm text-rose-900"><AlertCircle size={17} className="mt-0.5 shrink-0" />{error}</p>}
      </div>
    </section>
  );
}
