import { useEffect, useMemo, useState } from 'react';
import { LogOut, PackageSearch, ReceiptText, ShieldCheck, TriangleAlert } from 'lucide-react';
import {
  subscribeToTarekWorkspace,
  type TarekWorkspaceData,
} from '../services/tarekWorkspaceService';
import type { TarekOperationalProduct } from '../services/separatedDataModel';
import TarekSafePOS from './TarekSafePOS';

type Props = {
  onLogout: () => void;
};

const INITIAL_DATA: TarekWorkspaceData = {
  products: [],
  productCosts: [],
  costCatalog: null,
  sales: [],
  saleProducts: [],
  saleBottleSizes: [],
  saleCatalogReady: false,
  permissions: { canViewStock: false, canViewOperationalCosts: false, canViewOperationalSales: false, canCreateSales: false },
};

function formatEgp(value: number | undefined): string {
  if (value === undefined || !Number.isFinite(value)) return 'غير متاح';
  return `${value.toLocaleString('ar-EG')} ج.م`;
}

function formatSaleDate(value: string): string {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? 'تاريخ غير متاح' : date.toLocaleString('ar-EG');
}

function getTypeGramCost(product: TarekOperationalProduct, data: TarekWorkspaceData): number | undefined {
  const explicit = data.productCosts.find((record) => record.productId === product.id)?.customGramCostEgp;
  if (explicit !== undefined && Number.isFinite(explicit)) return explicit;
  const policy = data.costCatalog?.costPolicy;
  if (product.type === 'نيش') return policy?.priceEssenceNiche;
  if (product.type === 'عود' || product.type === 'مسك') return policy?.priceEssenceSpecial;
  return policy?.priceEssenceNormal;
}

export default function TarekReadOnlyWorkspace({ onLogout }: Props) {
  const [data, setData] = useState<TarekWorkspaceData>(INITIAL_DATA);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let disposed = false;
    let stop: (() => void) | undefined;
    setIsLoading(true);
    void subscribeToTarekWorkspace(
      (next) => {
        if (disposed) return;
        setData(next);
        setIsLoading(false);
        setError(null);
      },
      (reason) => {
        if (disposed) return;
        setError(reason.message || 'تعذّر تحميل البيانات التشغيلية.');
        setIsLoading(false);
      },
    ).then((unsubscribe) => {
      if (disposed) unsubscribe();
      else stop = unsubscribe;
    }).catch((reason: unknown) => {
      if (disposed) return;
      setError(reason instanceof Error ? reason.message : 'تعذّر التحقق من صلاحية القراءة.');
      setIsLoading(false);
    });
    return () => {
      disposed = true;
      stop?.();
    };
  }, []);

  const productCosts = useMemo(
    () => new Map(data.productCosts.map((record) => [record.productId, record])),
    [data.productCosts],
  );
  const bottleCosts = data.costCatalog?.bottleSizes ?? [];
  const hasAnyProjection = data.products.length > 0 || data.costCatalog !== null || data.sales.length > 0
    || data.saleProducts.length > 0 || data.saleBottleSizes.length > 0;

  return (
    <main dir="rtl" lang="ar" className="min-h-screen bg-[#F5F5F7] px-4 py-6 text-[#1D1D1F] sm:px-8">
      <div className="mx-auto max-w-6xl space-y-6">
        <header className="flex flex-wrap items-center justify-between gap-4 rounded-3xl border border-black/[0.06] bg-white p-5 shadow-sm">
          <div>
            <p className="text-xs font-bold text-[#6E6E73]">لَمْسَةُ عِطْر · صلاحيات تشغيلية محدودة</p>
            <h1 className="mt-1 text-2xl font-black">مساحة التشغيل</h1>
            <p className="mt-1 text-sm text-[#6E6E73]">
              {data.permissions.canCreateSales
                ? 'المخزون والتكلفة التشغيلية وصلاحية بيع محدودة'
                : data.permissions.canViewOperationalCosts ? 'المخزون وتكاليف مدخلات التشغيل فقط' : 'المخزون فقط · قراءة فقط'}
            </p>
          </div>
          <button
            type="button"
            onClick={onLogout}
            className="inline-flex items-center gap-2 rounded-xl border border-black/10 px-4 py-2 text-sm font-bold hover:bg-black/[0.04]"
          >
            <LogOut size={16} /> تسجيل الخروج
          </button>
        </header>

        {!data.permissions.canCreateSales && <section className="flex gap-3 rounded-2xl border border-amber-300 bg-amber-50 p-4 text-sm text-amber-950" role="status">
          <TriangleAlert size={19} className="mt-0.5 shrink-0" />
          <p>
            هذه الشاشة للقراءة فقط. لا تعرض أسعار البيع أو الأرباح أو العمولات، ولا تسمح بتسجيل عملية بيع أو خصم.
            وفق القيود الحالية (واجهة عميل وقواعد Firestore فقط)، لا يمكن فرض حساب الخصم والمخزون متعدد الأصناف بأمان؛ لذلك يظل البيع محجوبًا بدل الاعتماد على تحقق الواجهة.
          </p>
        </section>}

        {data.permissions.canCreateSales && <TarekSafePOS
          canCreateSales={data.permissions.canCreateSales}
          catalogReady={data.saleCatalogReady}
          products={data.saleProducts}
          bottleSizes={data.saleBottleSizes}
          stockProducts={data.products}
        />}

        {error && (
          <section role="alert" className="rounded-2xl border border-rose-300 bg-rose-50 p-4 text-sm font-semibold text-rose-900">
            تعذّر تحميل البيانات التشغيلية المحمية. رمز/تفصيل الخطأ: {error}
          </section>
        )}

        {data.permissions.canViewStock && <section className="overflow-hidden rounded-3xl border border-black/[0.06] bg-white shadow-sm">
          <div className="flex items-center gap-3 border-b border-black/[0.06] p-5">
            <PackageSearch className="text-[#C49746]" size={21} />
            <div>
              <h2 className="font-black">{data.permissions.canViewOperationalCosts ? 'كتالوج المخزون والتكلفة' : 'كتالوج المخزون'}</h2>
              <p className="text-xs text-[#6E6E73]">
                {data.permissions.canViewOperationalCosts
                  ? 'لا يحتوي الإسقاط المقروء على سعر بيع أو هامش أو عمولة.'
                  : 'لا يحتوي هذا الدور على بيانات التكلفة أو سعر البيع أو الهامش أو العمولة.'}
              </p>
            </div>
          </div>
          {isLoading ? (
            <p className="p-6 text-sm text-[#6E6E73]">جارٍ التحقق وتحميل الإسقاطات الآمنة…</p>
          ) : data.products.length > 0 ? (
            <div className="divide-y divide-black/[0.05]">
              {data.products.map((product) => {
                const costPerGram = getTypeGramCost(product, data);
                const customCost = productCosts.get(product.id)?.customGramCostEgp;
                const low = product.min_threshold_grams !== undefined && product.stock_grams <= product.min_threshold_grams;
                return (
                  <article key={product.id} className={`grid gap-3 p-4 sm:items-center sm:p-5 ${data.permissions.canViewOperationalCosts ? 'sm:grid-cols-[minmax(0,1fr)_auto_auto]' : 'sm:grid-cols-[minmax(0,1fr)_auto]'}`}>
                    <div className="min-w-0">
                      <h3 className="truncate font-bold">{product.name}</h3>
                      <p className="mt-1 text-xs text-[#6E6E73]">
                        {[product.brand, product.origin, product.type].filter(Boolean).join(' · ') || 'بيانات تعريفية غير مكتملة'}
                      </p>
                    </div>
                    <div className="text-sm">
                      <span className="block text-xs text-[#6E6E73]">المخزون</span>
                      <strong className={low ? 'text-amber-800' : ''}>
                        {product.stock_grams.toLocaleString('ar-EG')} جم{low ? ' · عند حدّ إعادة الطلب' : ''}
                      </strong>
                    </div>
                    {data.permissions.canViewOperationalCosts && <div className="text-sm">
                      <span className="block text-xs text-[#6E6E73]">تكلفة الزيت / جم</span>
                      <strong>{formatEgp(costPerGram)}</strong>
                      {customCost !== undefined && <span className="mr-2 text-[11px] text-[#6E6E73]">تكلفة مخصصة</span>}
                    </div>}
                  </article>
                );
              })}
            </div>
          ) : (
            <div className="p-6 text-sm text-[#6E6E73]">
              {hasAnyProjection
                ? 'لا توجد منتجات في الإسقاط الآمن حالياً.'
                : 'لم يُهيّئ المالك بعد إسقاطات الكتالوج التشغيلية. لا يتم فتح بيانات المنتجات المختلطة لهذا الدور.'}
            </div>
          )}
        </section>}

        {data.permissions.canViewOperationalCosts && <section className="rounded-3xl border border-black/[0.06] bg-white p-5 shadow-sm">
          <div className="flex items-center gap-3">
            <ShieldCheck size={20} className="text-emerald-700" />
            <h2 className="font-black">تكاليف العبوات ومدخلات التشغيل</h2>
          </div>
          {bottleCosts.length > 0 ? (
            <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {bottleCosts.map((bottle) => (
                <div key={bottle.id} className="rounded-2xl bg-[#F5F5F7] p-4 text-sm">
                  <p className="font-bold">عبوة {bottle.sizeMl} مل</p>
                  <p className="mt-2 text-[#6E6E73]">تكلفة الوحدة الأساسية: <strong className="text-[#1D1D1F]">{formatEgp(bottle.officialCostEgp)}</strong></p>
                  {bottle.bottleCostEgp !== undefined && <p className="mt-1 text-[#6E6E73]">العبوة والبخاخ: <strong className="text-[#1D1D1F]">{formatEgp(bottle.bottleCostEgp)}</strong></p>}
                  {bottle.alcoholCostEgp !== undefined && <p className="mt-1 text-[#6E6E73]">الكحول: <strong className="text-[#1D1D1F]">{formatEgp(bottle.alcoholCostEgp)}</strong></p>}
                </div>
              ))}
            </div>
          ) : (
            <p className="mt-3 text-sm text-[#6E6E73]">لم تُجهّز تكاليف العبوات بعد.</p>
          )}
        </section>}

        {data.permissions.canViewOperationalSales && <section className="overflow-hidden rounded-3xl border border-black/[0.06] bg-white shadow-sm">
          <div className="flex items-center gap-3 border-b border-black/[0.06] p-5">
            <ReceiptText className="text-[#C49746]" size={21} />
            <div>
              <h2 className="font-black">سجل الفواتير التشغيلي</h2>
              <p className="text-xs text-[#6E6E73]">آخر 50 فاتورة · مزامنة لحظية · لا يعرض التكلفة أو الربح أو العمولة</p>
            </div>
          </div>
          {isLoading ? (
            <p className="p-6 text-sm text-[#6E6E73]">جارٍ تحميل سجل الفواتير…</p>
          ) : data.sales.length > 0 ? (
            <div className="divide-y divide-black/[0.05]">
              {data.sales.map((sale) => (
                <article key={sale.id} className="grid gap-4 p-4 sm:grid-cols-[minmax(0,1fr)_auto] sm:p-5">
                  <div className="min-w-0 space-y-2">
                    <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                      <h3 className="font-bold">{sale.customerName || 'عميل مباشر'}</h3>
                      <span className="text-xs text-[#6E6E73]">{formatSaleDate(sale.date)}</span>
                      {sale.isReversed && <span className="rounded-full bg-rose-100 px-2 py-0.5 text-xs font-bold text-rose-800">معكوسة</span>}
                    </div>
                    {sale.customerPhone && <p className="text-xs text-[#6E6E73]">{sale.customerPhone}</p>}
                    <ul className="space-y-1 text-sm">
                      {sale.items.map((item) => (
                        <li key={item.id} className="flex flex-wrap justify-between gap-x-4 text-[#424245]">
                          <span>{item.productName} · {item.bottleSize} مل × {item.quantity || 1}</span>
                          <span className="tabular-nums">{formatEgp(item.sellingPrice)}</span>
                        </li>
                      ))}
                    </ul>
                    <p className="text-xs text-[#6E6E73]">
                      {sale.paymentMethod || 'طريقة الدفع غير مسجلة'}{sale.employeeName ? ` · ${sale.employeeName}` : ''}
                      {sale.discount ? ` · خصم ${formatEgp(sale.discount)}` : ''}
                    </p>
                  </div>
                  <div className="self-start rounded-2xl bg-[#F5F5F7] px-4 py-3 text-left sm:min-w-36">
                    <span className="block text-xs text-[#6E6E73]">إجمالي الفاتورة</span>
                    <strong className="mt-1 block text-lg tabular-nums">{formatEgp(sale.totalPrice)}</strong>
                  </div>
                </article>
              ))}
            </div>
          ) : (
            <p className="p-6 text-sm text-[#6E6E73]">لا توجد فواتير تشغيلية في الإسقاط الآمن حالياً.</p>
          )}
        </section>}

        <p className="px-1 text-xs leading-6 text-[#6E6E73]">
          {data.permissions.canCreateSales
            ? 'واجهة البيع المقيدة معروضة محلياً فقط؛ لم تُنشر خدمة خادمية ولم تُختبر مزامنة طارق الحية أو بين الأجهزة. الأسعار لا يحررها الموظف، والخصم يُقبل فقط بعد تحقق العامل.'
            : data.permissions.canViewOperationalCosts
            ? 'سجل الإيصالات منفصل عن سجلات التكلفة والأرباح والعمولات؛ ولا تمنح هذه المساحة صلاحية تسجيل بيع أو تعديل فاتورة.'
            : 'هذا الدور يرى المخزون والإيصالات التشغيلية فقط؛ ولا يتلقى مستندات التكلفة أو الربح أو العمولة.'}
        </p>
      </div>
    </main>
  );
}
