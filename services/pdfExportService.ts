/**
 * خدمة تصدير وطباعة تقارير لمسة عطر الرسمية بصيغة PDF
 * متوافقة 100% مع الهوية الملكية لـ "لمسة عطر"
 * 
 * ضوابط التصميم الصارمة:
 * 1. لا بطاقات بلون غامق مطلقاً (خلفيات بيضاء ناصعة وعاجية نقية مع أطر ذهبية ملكية فاخرة #C49746).
 * 2. لا ألوان نصوص رمادية مطلقاً (كل النصوص والأرقام بحبر أسود داكن فاحم #000000 أو ذهبي برونزي داكن #78350F).
 * 3. طباعة وجرد احترافي A4 يدعم الترقيم والترويسة والختم الرسمي.
 */

import jsPDF from 'jspdf';
import html2canvas from 'html2canvas';
import { Product, Sale, StoreSettings, AppUser, DEFAULT_SETTINGS } from '../types';

export interface ProfitReportExportData {
  sales: Sale[];
  periodLabel: string;
  startDate?: string;
  endDate?: string;
  settings?: StoreSettings;
  currentUser?: AppUser | null;
  includeCostsAndProfits?: boolean;
}

export interface InventoryReportExportData {
  products: Product[];
  settings?: StoreSettings;
  currentUser?: AppUser | null;
  filterType?: string;
  lowStockOnly?: boolean;
}

/**
 * دالة مساعدة لتنسيق المبالغ المالية
 */
const fmtMoney = (val: number, currency: string = 'ج.م'): string => {
  return `${(val || 0).toLocaleString('ar-EG', { minimumFractionDigits: 0, maximumFractionDigits: 2 })} ${currency}`;
};

/**
 * دالة مساعدة لتنسيق الأرقام والكميات
 */
const fmtNum = (val: number): string => {
  return (val || 0).toLocaleString('ar-EG');
};

/**
 * دالة مساعدة لتنسيق التاريخ والوقت العربي
 */
const fmtDate = (dateStr?: string): string => {
  if (!dateStr) return new Date().toLocaleDateString('ar-EG');
  const d = new Date(dateStr);
  return isNaN(d.getTime()) ? dateStr : d.toLocaleDateString('ar-EG', { year: 'numeric', month: 'long', day: 'numeric' });
};

const fmtDateTime = (dateStr?: string): string => {
  if (!dateStr) return new Date().toLocaleString('ar-EG');
  const d = new Date(dateStr);
  return isNaN(d.getTime()) ? dateStr : d.toLocaleString('ar-EG');
};

/**
 * توليد شفرة HTML لتقرير الأرباح والمبيعات الشامل
 * تصميم فاخر، بطاقات بيضاء ناصعة بأطر ذهبية، نصوص سوداء داكنة تماماً
 */
export const buildProfitReportHtml = (data: ProfitReportExportData): string => {
  const {
    sales = [],
    periodLabel = 'الفترة المحددة',
    settings = DEFAULT_SETTINGS,
    currentUser,
    includeCostsAndProfits = true
  } = data;

  const validSales = sales.filter(s => !s.isReversed);
  const currency = settings.currency || 'ج.م';
  const storeName = settings.storeName || 'لمسة عطر';
  const slogan = settings.storeSlogan || 'أثر يبقى وذكرى تدوم';
  const phone = settings.storePhone || settings.storeWhatsAppPrimary || '01123376728';
  const cashierName = currentUser?.displayName || 'طارق - كاشير المتجر';

  // حساب الإجماليات
  const totalRevenue = validSales.reduce((acc, s) => acc + (s.totalPrice || 0), 0);
  const totalCost = validSales.reduce((acc, s) => acc + (s.totalCost || 0), 0);
  const totalProfit = validSales.reduce((acc, s) => acc + (s.totalProfit || 0), 0);
  const totalInvoices = validSales.length;
  const profitMarginPercent = totalRevenue > 0 ? ((totalProfit / totalRevenue) * 100).toFixed(1) : '0';
  const avgTicket = totalInvoices > 0 ? (totalRevenue / totalInvoices).toFixed(1) : '0';

  const totalBottles = validSales.reduce((acc, s) => {
    return acc + (s.items || []).reduce((sum, it) => sum + (it.quantity || 1), 0);
  }, 0);

  const totalGrams = validSales.reduce((acc, s) => {
    return acc + (s.items || []).reduce((sum, it) => sum + (it.essenceGrams || 0), 0);
  }, 0);

  // توزيع طرق الدفع
  const paymentBreakdown: Record<string, number> = { 'نقدي': 0, 'بطاقة': 0, 'محفظة إلكترونية': 0 };
  validSales.forEach(s => {
    const m = s.paymentMethod || 'نقدي';
    paymentBreakdown[m] = (paymentBreakdown[m] || 0) + (s.totalPrice || 0);
  });

  // توزيع المبيعات حسب البائع
  const employeeBreakdown: Record<string, { count: number; total: number; profit: number }> = {};
  validSales.forEach(s => {
    const emp = s.employeeName?.replace(/\(.*?\)/g, '').trim() || 'طارق';
    if (!employeeBreakdown[emp]) employeeBreakdown[emp] = { count: 0, total: 0, profit: 0 };
    employeeBreakdown[emp].count += 1;
    employeeBreakdown[emp].total += s.totalPrice || 0;
    employeeBreakdown[emp].profit += s.totalProfit || 0;
  });

  return `
    <div style="font-family: 'Readex Pro', 'Cairo', 'Tajawal', sans-serif; direction: rtl; text-align: right; background-color: #FFFFFF; color: #000000; width: 100%; max-width: 210mm; margin: 0 auto; padding: 22px 26px; box-sizing: border-box; line-height: 1.45;">
      
      <!-- ========================================== -->
      <!-- OFFICIAL HEADER (ترويسة التقرير الرسمية)   -->
      <!-- ========================================== -->
      <div style="display: flex; justify-content: space-between; align-items: center; border-bottom: 2.5px solid #C49746; padding-bottom: 14px; margin-bottom: 16px;">
        <!-- Right: Store Info -->
        <div>
          <div style="font-size: 24px; font-weight: 900; color: #000000; letter-spacing: -0.5px;">${storeName}</div>
          <div style="font-size: 13px; font-weight: 800; color: #78350F; margin-top: 2px;">${slogan}</div>
          <div style="font-size: 11px; font-weight: 800; color: #000000; margin-top: 4px;">هاتف المتجر: ${phone} | المنظومة المالية الرسمية</div>
        </div>

        <!-- Center: Badge -->
        <div style="border: 2px solid #C49746; background-color: #FFFFFF; padding: 8px 18px; border-radius: 12px; text-align: center;">
          <div style="font-size: 15px; font-weight: 900; color: #000000;">تقرير الأرباح والمبيعات المالي الشامل</div>
          <div style="font-size: 11px; font-weight: 800; color: #78350F; margin-top: 2px;">نطاق التقرير: ${periodLabel}</div>
        </div>

        <!-- Left: Metadata -->
        <div style="text-align: left; font-size: 11px; font-weight: 800; color: #000000;">
          <div>تاريخ الإصدار: ${fmtDate()}</div>
          <div style="margin-top: 3px;">وقت الطباعة: ${new Date().toLocaleTimeString('ar-EG', { hour: '2-digit', minute: '2-digit' })}</div>
          <div style="margin-top: 3px;">المسؤول: ${cashierName}</div>
        </div>
      </div>

      <!-- ========================================== -->
      <!-- KPI CARDS GRID (بطاقات بيضاء ناصعة بأطر ذهبية) -->
      <!-- لا بطاقات بلون غامق - لا نصوص رمادية        -->
      <!-- ========================================== -->
      <div style="display: grid; grid-template-columns: repeat(4, 1fr); gap: 10px; margin-bottom: 16px;">
        
        <!-- Card 1: Revenue -->
        <div style="background-color: #FFFFFF; border: 1.5px solid #C49746; border-radius: 10px; padding: 10px 12px; box-shadow: 0 1px 3px rgba(0,0,0,0.04);">
          <div style="font-size: 11px; font-weight: 900; color: #78350F;">إجمالي المبيعات (الإيراد)</div>
          <div style="font-size: 17px; font-weight: 900; color: #000000; margin-top: 4px;">${fmtMoney(totalRevenue, currency)}</div>
          <div style="font-size: 10px; font-weight: 800; color: #000000; margin-top: 2px;">عدد الفواتير: ${fmtNum(totalInvoices)} فاتورة</div>
        </div>

        ${includeCostsAndProfits ? `
        <!-- Card 2: Cost -->
        <div style="background-color: #FFFFFF; border: 1.5px solid #C49746; border-radius: 10px; padding: 10px 12px; box-shadow: 0 1px 3px rgba(0,0,0,0.04);">
          <div style="font-size: 11px; font-weight: 900; color: #78350F;">تكلفة البضاعة المباعة</div>
          <div style="font-size: 17px; font-weight: 900; color: #000000; margin-top: 4px;">${fmtMoney(totalCost, currency)}</div>
          <div style="font-size: 10px; font-weight: 800; color: #000000; margin-top: 2px;">تكلفة الزيوت والعبوات والتغليف</div>
        </div>

        <!-- Card 3: Net Profit -->
        <div style="background-color: #FFFFFF; border: 2px solid #047857; border-radius: 10px; padding: 10px 12px; box-shadow: 0 1px 3px rgba(0,0,0,0.04);">
          <div style="font-size: 11px; font-weight: 900; color: #047857;">صافي الأرباح المحققة</div>
          <div style="font-size: 18px; font-weight: 900; color: #047857; margin-top: 4px;">${fmtMoney(totalProfit, currency)}</div>
          <div style="font-size: 10px; font-weight: 900; color: #047857; margin-top: 2px;">هامش ربح: ${profitMarginPercent}%</div>
        </div>
        ` : `
        <!-- Card 2: Avg Ticket -->
        <div style="background-color: #FFFFFF; border: 1.5px solid #C49746; border-radius: 10px; padding: 10px 12px; box-shadow: 0 1px 3px rgba(0,0,0,0.04);">
          <div style="font-size: 11px; font-weight: 900; color: #78350F;">متوسط قيمة الفاتورة</div>
          <div style="font-size: 17px; font-weight: 900; color: #000000; margin-top: 4px;">${fmtMoney(Number(avgTicket), currency)}</div>
          <div style="font-size: 10px; font-weight: 800; color: #000000; margin-top: 2px;">متوسط مشتريات العميل</div>
        </div>
        `}

        <!-- Card 4: Quantities -->
        <div style="background-color: #FFFFFF; border: 1.5px solid #C49746; border-radius: 10px; padding: 10px 12px; box-shadow: 0 1px 3px rgba(0,0,0,0.04);">
          <div style="font-size: 11px; font-weight: 900; color: #78350F;">الكميات والمخرجات</div>
          <div style="font-size: 17px; font-weight: 900; color: #000000; margin-top: 4px;">${fmtNum(totalBottles)} عبوة</div>
          <div style="font-size: 10px; font-weight: 800; color: #000000; margin-top: 2px;">زيت عطور: ${fmtNum(totalGrams)} جم مستهلك</div>
        </div>
      </div>

      <!-- ========================================== -->
      <!-- PAYMENT & CASHIER BREAKDOWN MINI PANELS   -->
      <!-- ========================================== -->
      <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 10px; margin-bottom: 16px;">
        
        <!-- Payment Methods -->
        <div style="background-color: #FFFFFF; border: 1px solid #C49746; border-radius: 10px; padding: 10px 14px;">
          <div style="font-size: 12px; font-weight: 900; color: #000000; border-bottom: 1.5px solid #C49746; padding-bottom: 4px; margin-bottom: 6px;">
            توزيع الإيراد بحسب طريقة الدفع
          </div>
          <div style="display: flex; justify-content: space-between; font-size: 11px; font-weight: 800; color: #000000; padding: 3px 0;">
            <span>نقدي (كاش):</span>
            <span style="font-weight: 900;">${fmtMoney(paymentBreakdown['نقدي'] || 0, currency)}</span>
          </div>
          <div style="display: flex; justify-content: space-between; font-size: 11px; font-weight: 800; color: #000000; padding: 3px 0;">
            <span>دفع إلكتروني (بطاقة):</span>
            <span style="font-weight: 900;">${fmtMoney(paymentBreakdown['بطاقة'] || 0, currency)}</span>
          </div>
          <div style="display: flex; justify-content: space-between; font-size: 11px; font-weight: 800; color: #000000; padding: 3px 0;">
            <span>محافظ إلكترونية (فودافون كاش / إنستاباي):</span>
            <span style="font-weight: 900;">${fmtMoney(paymentBreakdown['محفظة إلكترونية'] || 0, currency)}</span>
          </div>
        </div>

        <!-- Cashier Performance -->
        <div style="background-color: #FFFFFF; border: 1px solid #C49746; border-radius: 10px; padding: 10px 14px;">
          <div style="font-size: 12px; font-weight: 900; color: #000000; border-bottom: 1.5px solid #C49746; padding-bottom: 4px; margin-bottom: 6px;">
            مبيعات طاقم العمل والكاشير
          </div>
          ${Object.entries(employeeBreakdown).map(([emp, stats]) => `
            <div style="display: flex; justify-content: space-between; font-size: 11px; font-weight: 800; color: #000000; padding: 3px 0;">
              <span>الموظف: ${emp} (${stats.count} فاتورة)</span>
              <span style="font-weight: 900;">${fmtMoney(stats.total, currency)}</span>
            </div>
          `).join('')}
        </div>
      </div>

      <!-- ========================================== -->
      <!-- DETAILED INVOICES TABLE (جدول الفواتير التفصيلي) -->
      <!-- خلفية بيضاء - حدود ذهبية - نصوص سوداء نقية -->
      <!-- ========================================== -->
      <div style="margin-bottom: 16px;">
        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 6px;">
          <div style="font-size: 13px; font-weight: 900; color: #000000;">سجل العمليات والفواتير التفصيلية (${fmtNum(validSales.length)} عملية)</div>
          <div style="font-size: 11px; font-weight: 800; color: #78350F;">جميع المبالغ مسجلة بالـ ${currency}</div>
        </div>

        <table style="width: 100%; border-collapse: collapse; font-size: 10px; text-align: right; background-color: #FFFFFF; border: 1.5px solid #C49746;">
          <thead>
            <tr style="background-color: #FFFDF9; border-bottom: 2px solid #C49746; color: #000000; font-weight: 900;">
              <th style="padding: 7px 6px; border-left: 1px solid #E5D5B8; text-align: center; width: 30px;">م</th>
              <th style="padding: 7px 6px; border-left: 1px solid #E5D5B8; text-align: center; width: 65px;">رقم الفاتورة</th>
              <th style="padding: 7px 6px; border-left: 1px solid #E5D5B8; width: 85px;">التاريخ والوقت</th>
              <th style="padding: 7px 6px; border-left: 1px solid #E5D5B8; width: 75px;">العميل</th>
              <th style="padding: 7px 6px; border-left: 1px solid #E5D5B8;">الأصناف والتركيبات المباعة</th>
              <th style="padding: 7px 6px; border-left: 1px solid #E5D5B8; text-align: center; width: 45px;">عبوة</th>
              <th style="padding: 7px 6px; border-left: 1px solid #E5D5B8; text-align: center; width: 45px;">زيت(جم)</th>
              <th style="padding: 7px 6px; border-left: 1px solid #E5D5B8; text-align: center; width: 65px;">المبيعات</th>
              ${includeCostsAndProfits ? `
              <th style="padding: 7px 6px; border-left: 1px solid #E5D5B8; text-align: center; width: 60px;">التكلفة</th>
              <th style="padding: 7px 6px; border-left: 1px solid #E5D5B8; text-align: center; width: 60px;">الربح</th>
              ` : ''}
              <th style="padding: 7px 6px; border-left: 1px solid #E5D5B8; text-align: center; width: 55px;">الدفع</th>
              <th style="padding: 7px 6px; text-align: center; width: 55px;">البائع</th>
            </tr>
          </thead>
          <tbody>
            ${validSales.map((sale, idx) => {
              const itemsText = (sale.items || [])
                .map(it => `${it.productName} (${it.bottleSize || 50}مل×${it.quantity || 1})`)
                .join(' + ');
              const bottles = (sale.items || []).reduce((s, it) => s + (it.quantity || 1), 0);
              const grams = (sale.items || []).reduce((s, it) => s + (it.essenceGrams || 0), 0);
              const invoiceNum = sale.id.startsWith('sale-') ? `#${sale.id.slice(-6)}` : `#${sale.id.slice(0, 8)}`;
              const bgRow = idx % 2 === 0 ? '#FFFFFF' : '#FFFDF9';

              return `
                <tr style="background-color: ${bgRow}; border-bottom: 1px solid #E5D5B8; color: #000000; font-weight: 800;">
                  <td style="padding: 6px 5px; border-left: 1px solid #E5D5B8; text-align: center;">${idx + 1}</td>
                  <td style="padding: 6px 5px; border-left: 1px solid #E5D5B8; text-align: center; font-weight: 900; color: #000000;">${invoiceNum}</td>
                  <td style="padding: 6px 5px; border-left: 1px solid #E5D5B8;">${new Date(sale.date).toLocaleDateString('ar-EG', { month: 'numeric', day: 'numeric' })} ${new Date(sale.date).toLocaleTimeString('ar-EG', { hour: '2-digit', minute: '2-digit' })}</td>
                  <td style="padding: 6px 5px; border-left: 1px solid #E5D5B8; font-weight: 800;">${sale.customerName || 'عميل نقدي'}</td>
                  <td style="padding: 6px 5px; border-left: 1px solid #E5D5B8; font-size: 9.5px; line-height: 1.3;">${itemsText || 'عطر مركب'}</td>
                  <td style="padding: 6px 5px; border-left: 1px solid #E5D5B8; text-align: center;">${bottles}</td>
                  <td style="padding: 6px 5px; border-left: 1px solid #E5D5B8; text-align: center;">${grams}</td>
                  <td style="padding: 6px 5px; border-left: 1px solid #E5D5B8; text-align: center; font-weight: 900; color: #000000;">${sale.totalPrice || 0}</td>
                  ${includeCostsAndProfits ? `
                  <td style="padding: 6px 5px; border-left: 1px solid #E5D5B8; text-align: center; color: #000000;">${sale.totalCost || 0}</td>
                  <td style="padding: 6px 5px; border-left: 1px solid #E5D5B8; text-align: center; font-weight: 900; color: #047857;">${sale.totalProfit || 0}</td>
                  ` : ''}
                  <td style="padding: 6px 5px; border-left: 1px solid #E5D5B8; text-align: center;">${sale.paymentMethod || 'نقدي'}</td>
                  <td style="padding: 6px 5px; text-align: center;">${sale.employeeName?.replace(/\(.*?\)/g, '').trim() || 'طارق'}</td>
                </tr>
              `;
            }).join('')}
          </tbody>
          <tfoot>
            <tr style="background-color: #FFFDF9; border-top: 2px solid #C49746; font-weight: 900; color: #000000;">
              <td colspan="5" style="padding: 8px 6px; border-left: 1px solid #E5D5B8; text-align: center; font-size: 11px;">
                الإجمالي العام للفترة المحددة (${fmtNum(totalInvoices)} عملية بيع)
              </td>
              <td style="padding: 8px 6px; border-left: 1px solid #E5D5B8; text-align: center; font-size: 11px;">${fmtNum(totalBottles)}</td>
              <td style="padding: 8px 6px; border-left: 1px solid #E5D5B8; text-align: center; font-size: 11px;">${fmtNum(totalGrams)} جم</td>
              <td style="padding: 8px 6px; border-left: 1px solid #E5D5B8; text-align: center; font-size: 12px; font-weight: 900; color: #000000;">
                ${fmtMoney(totalRevenue, currency)}
              </td>
              ${includeCostsAndProfits ? `
              <td style="padding: 8px 6px; border-left: 1px solid #E5D5B8; text-align: center; font-size: 11px; color: #000000;">
                ${fmtMoney(totalCost, currency)}
              </td>
              <td style="padding: 8px 6px; border-left: 1px solid #E5D5B8; text-align: center; font-size: 12px; font-weight: 900; color: #047857;">
                ${fmtMoney(totalProfit, currency)}
              </td>
              ` : ''}
              <td colspan="2" style="padding: 8px 6px; text-align: center; font-size: 10px; color: #78350F;">
                هامش الربح: ${profitMarginPercent}%
              </td>
            </tr>
          </tfoot>
        </table>
      </div>

      <!-- ========================================== -->
      <!-- OFFICIAL SIGNATURES & STORE STAMP BOX     -->
      <!-- ========================================== -->
      <div style="display: flex; justify-content: space-between; align-items: flex-end; border-top: 2px solid #C49746; padding-top: 14px; margin-top: 16px;">
        <!-- Signatures -->
        <div style="display: flex; gap: 40px; font-size: 11px; font-weight: 900; color: #000000;">
          <div>
            <div>مسؤول المبيعات والكاشير:</div>
            <div style="margin-top: 26px; border-bottom: 1.5px dotted #000000; width: 140px; text-align: center; padding-bottom: 2px;">
              ${cashierName}
            </div>
          </div>
          <div>
            <div>المدير المالي والتشغيلي:</div>
            <div style="margin-top: 26px; border-bottom: 1.5px dotted #000000; width: 140px; text-align: center; padding-bottom: 2px;">
              يعتمد / الإدارة المالية
            </div>
          </div>
        </div>

        <!-- Official Seal / Stamp -->
        <div style="border: 2px solid #C49746; border-radius: 50%; width: 95px; height: 95px; display: flex; flex-direction: column; align-items: center; justify-content: center; text-align: center; padding: 4px; box-sizing: border-box; background-color: #FFFFFF;">
          <div style="font-size: 10px; font-weight: 900; color: #C49746;">متجر لمسة عطر</div>
          <div style="font-size: 9px; font-weight: 900; color: #000000; margin: 2px 0;">معتمد ورسمي</div>
          <div style="font-size: 8px; font-weight: 800; color: #78350F;">أثر يبقى وذكرى تدوم</div>
          <div style="font-size: 7.5px; font-weight: 900; color: #000000;">${new Date().getFullYear()}م</div>
        </div>
      </div>

      <!-- ========================================== -->
      <!-- FOOTER NOTE                                -->
      <!-- ========================================== -->
      <div style="text-align: center; font-size: 9.5px; font-weight: 800; color: #000000; border-top: 1px solid #E5D5B8; margin-top: 14px; padding-top: 8px;">
        ${storeName} | ${slogan} — تم استخراج هذا التقرير آلياً عبر نظام إدارة نقاط البيع والمحاسبة الذكي المعتمد.
      </div>

    </div>
  `;
};

/**
 * توليد شفرة HTML لتقرير المخزون وجرد الزيوت العطرية
 * تصميم فاخر، بطاقات بيضاء ناصعة بأطر ذهبية، نصوص سوداء داكنة تماماً
 */
export const buildInventoryReportHtml = (data: InventoryReportExportData): string => {
  const {
    products = [],
    settings = DEFAULT_SETTINGS,
    currentUser,
    filterType = 'all',
    lowStockOnly = false
  } = data;

  const currency = settings.currency || 'ج.م';
  const storeName = settings.storeName || 'لمسة عطر';
  const slogan = settings.storeSlogan || 'أثر يبقى وذكرى تدوم';
  const phone = settings.storePhone || settings.storeWhatsAppPrimary || '01123376728';
  const managerName = currentUser?.displayName || 'مدير المخزون والمتجر';

  // تصفية العطور حسب المعايير المحددة
  let filteredProducts = products.filter(p => !p.isSavedMixRecipe);

  if (filterType !== 'all') {
    filteredProducts = filteredProducts.filter(p => p.type === filterType);
  }

  if (lowStockOnly) {
    filteredProducts = filteredProducts.filter(p => (p.stock_grams || 0) <= (p.min_threshold_grams ?? 30));
  }

  // حساب أسعار وتكاليف الجرام المعيارية
  const priceEssenceNormal = settings.priceEssenceNormal || 10;
  const priceEssenceNiche = settings.priceEssenceNiche || 15;
  const priceEssenceSpecial = settings.priceEssenceSpecial || 20;

  const getGramCost = (product: Product): number => {
    if (product.customGramCostEgp && product.customGramCostEgp > 0) return product.customGramCostEgp;
    switch (product.type) {
      case 'نيش': return priceEssenceNiche;
      case 'مسك':
      case 'عود': return priceEssenceSpecial;
      default: return priceEssenceNormal;
    }
  };

  const getRetailGramPrice = (product: Product): number => {
    // سعر البيع بالجرام التقريبي بناء على سعر بيع 50 مل (10 جم زيت)
    const cost = getGramCost(product);
    return Math.round(cost * 2.2); // هامش تجزئة معتاد
  };

  // إجماليات المخزون
  const totalItemsCount = filteredProducts.length;
  const totalGrams = filteredProducts.reduce((acc, p) => acc + (p.stock_grams || 0), 0);
  
  const totalCostValuation = filteredProducts.reduce((acc, p) => {
    const costPerGram = getGramCost(p);
    return acc + ((p.stock_grams || 0) * costPerGram);
  }, 0);

  const totalRetailValuation = filteredProducts.reduce((acc, p) => {
    const retailPerGram = getRetailGramPrice(p);
    return acc + ((p.stock_grams || 0) * retailPerGram);
  }, 0);

  const potentialUnrealizedProfit = totalRetailValuation - totalCostValuation;

  const lowStockProducts = filteredProducts.filter(p => (p.stock_grams || 0) <= (p.min_threshold_grams ?? 30));
  const depletedProducts = filteredProducts.filter(p => (p.stock_grams || 0) <= 0);

  // تصنيف العطور
  const typeCounts: Record<string, { count: number; grams: number; costVal: number }> = {};
  filteredProducts.forEach(p => {
    const t = p.type || 'عادي';
    if (!typeCounts[t]) typeCounts[t] = { count: 0, grams: 0, costVal: 0 };
    typeCounts[t].count += 1;
    typeCounts[t].grams += p.stock_grams || 0;
    typeCounts[t].costVal += (p.stock_grams || 0) * getGramCost(p);
  });

  return `
    <div style="font-family: 'Readex Pro', 'Cairo', 'Tajawal', sans-serif; direction: rtl; text-align: right; background-color: #FFFFFF; color: #000000; width: 100%; max-width: 210mm; margin: 0 auto; padding: 22px 26px; box-sizing: border-box; line-height: 1.45;">
      
      <!-- ========================================== -->
      <!-- OFFICIAL HEADER (ترويسة التقرير الرسمية)   -->
      <!-- ========================================== -->
      <div style="display: flex; justify-content: space-between; align-items: center; border-bottom: 2.5px solid #C49746; padding-bottom: 14px; margin-bottom: 16px;">
        <!-- Right: Store Info -->
        <div>
          <div style="font-size: 24px; font-weight: 900; color: #000000; letter-spacing: -0.5px;">${storeName}</div>
          <div style="font-size: 13px; font-weight: 800; color: #78350F; margin-top: 2px;">${slogan}</div>
          <div style="font-size: 11px; font-weight: 800; color: #000000; margin-top: 4px;">هاتف المتجر: ${phone} | وثيقة جرد المخزون الرسمية</div>
        </div>

        <!-- Center: Badge -->
        <div style="border: 2px solid #C49746; background-color: #FFFFFF; padding: 8px 18px; border-radius: 12px; text-align: center;">
          <div style="font-size: 15px; font-weight: 900; color: #000000;">تقرير جرد وتقييم المخزون وحركة الزيوت</div>
          <div style="font-size: 11px; font-weight: 800; color: #78350F; margin-top: 2px;">
            ${lowStockOnly ? 'حالة التقرير: النواقص والمخزون الحرج فقط' : filterType === 'all' ? 'جرد شامل لكافة أصناف العطور والزيوت' : `أصناف فئة: عطور ${filterType}`}
          </div>
        </div>

        <!-- Left: Metadata -->
        <div style="text-align: left; font-size: 11px; font-weight: 800; color: #000000;">
          <div>تاريخ الجرد: ${fmtDate()}</div>
          <div style="margin-top: 3px;">وقت الطباعة: ${new Date().toLocaleTimeString('ar-EG', { hour: '2-digit', minute: '2-digit' })}</div>
          <div style="margin-top: 3px;">المسؤول: ${managerName}</div>
        </div>
      </div>

      <!-- ========================================== -->
      <!-- KPI CARDS GRID (بطاقات بيضاء ناصعة بأطر ذهبية) -->
      <!-- لا بطاقات بلون غامق - لا نصوص رمادية        -->
      <!-- ========================================== -->
      <div style="display: grid; grid-template-columns: repeat(4, 1fr); gap: 10px; margin-bottom: 16px;">
        
        <!-- Card 1: Cost Valuation -->
        <div style="background-color: #FFFFFF; border: 1.5px solid #C49746; border-radius: 10px; padding: 10px 12px; box-shadow: 0 1px 3px rgba(0,0,0,0.04);">
          <div style="font-size: 11px; font-weight: 900; color: #78350F;">القيمة الإجمالية بسعر التكلفة</div>
          <div style="font-size: 17px; font-weight: 900; color: #000000; margin-top: 4px;">${fmtMoney(totalCostValuation, currency)}</div>
          <div style="font-size: 10px; font-weight: 800; color: #000000; margin-top: 2px;">رأس المال المستثمر بالزيوت</div>
        </div>

        <!-- Card 2: Retail Valuation -->
        <div style="background-color: #FFFFFF; border: 1.5px solid #C49746; border-radius: 10px; padding: 10px 12px; box-shadow: 0 1px 3px rgba(0,0,0,0.04);">
          <div style="font-size: 11px; font-weight: 900; color: #78350F;">القيمة التقديرية بسعر البيع</div>
          <div style="font-size: 17px; font-weight: 900; color: #000000; margin-top: 4px;">${fmtMoney(totalRetailValuation, currency)}</div>
          <div style="font-size: 10px; font-weight: 800; color: #047857; margin-top: 2px;">أرباح متوقعة: ${fmtMoney(potentialUnrealizedProfit, currency)}</div>
        </div>

        <!-- Card 3: Total Stock Grams -->
        <div style="background-color: #FFFFFF; border: 1.5px solid #C49746; border-radius: 10px; padding: 10px 12px; box-shadow: 0 1px 3px rgba(0,0,0,0.04);">
          <div style="font-size: 11px; font-weight: 900; color: #78350F;">إجمالي رصيد الزيوت بالمستودع</div>
          <div style="font-size: 17px; font-weight: 900; color: #000000; margin-top: 4px;">${fmtNum(totalGrams)} جم</div>
          <div style="font-size: 10px; font-weight: 800; color: #000000; margin-top: 2px;">عدد الأصناف: ${fmtNum(totalItemsCount)} عطر</div>
        </div>

        <!-- Card 4: Critical Items -->
        <div style="background-color: #FFFFFF; border: 1.5px solid ${lowStockProducts.length > 0 ? '#B91C1C' : '#C49746'}; border-radius: 10px; padding: 10px 12px; box-shadow: 0 1px 3px rgba(0,0,0,0.04);">
          <div style="font-size: 11px; font-weight: 900; color: ${lowStockProducts.length > 0 ? '#B91C1C' : '#78350F'};">حالة النواقص والمخزون الحرج</div>
          <div style="font-size: 17px; font-weight: 900; color: ${lowStockProducts.length > 0 ? '#B91C1C' : '#000000'}; margin-top: 4px;">
            ${fmtNum(lowStockProducts.length)} صنف
          </div>
          <div style="font-size: 10px; font-weight: 800; color: #000000; margin-top: 2px;">
            منها ${fmtNum(depletedProducts.length)} صنف رصيده صفر
          </div>
        </div>
      </div>

      <!-- ========================================== -->
      <!-- CATEGORY DISTRIBUTION MINI PANEL          -->
      <!-- ========================================== -->
      <div style="background-color: #FFFFFF; border: 1px solid #C49746; border-radius: 10px; padding: 10px 14px; margin-bottom: 16px;">
        <div style="font-size: 12px; font-weight: 900; color: #000000; border-bottom: 1.5px solid #C49746; padding-bottom: 4px; margin-bottom: 8px;">
          توزيع المخزون ورأس المال المستثمر حسب الفئات العطرية
        </div>
        <div style="display: grid; grid-template-columns: repeat(4, 1fr); gap: 10px;">
          ${['عادي', 'نيش', 'مسك', 'عود'].map(t => {
            const st = typeCounts[t] || { count: 0, grams: 0, costVal: 0 };
            return `
              <div style="border-left: 1px solid #E5D5B8; padding-left: 8px;">
                <div style="font-size: 11px; font-weight: 900; color: #78350F;">عطور ${t}</div>
                <div style="font-size: 12px; font-weight: 900; color: #000000; margin-top: 2px;">${fmtNum(st.grams)} جم (${st.count} صنف)</div>
                <div style="font-size: 10px; font-weight: 800; color: #000000; margin-top: 1px;">قيمة: ${fmtMoney(st.costVal, currency)}</div>
              </div>
            `;
          }).join('')}
        </div>
      </div>

      <!-- ========================================== -->
      <!-- DETAILED INVENTORY TABLE (جدول جرد الأصناف) -->
      <!-- خلفية بيضاء - حدود ذهبية - نصوص سوداء نقية -->
      <!-- ========================================== -->
      <div style="margin-bottom: 16px;">
        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 6px;">
          <div style="font-size: 13px; font-weight: 900; color: #000000;">سجل جرد العطور وأرصدة الزيوت (${fmtNum(totalItemsCount)} صنف)</div>
          <div style="font-size: 11px; font-weight: 800; color: #78350F;">الأرصدة بالجرام الصافي (جم) والأسعار بالـ ${currency}</div>
        </div>

        <table style="width: 100%; border-collapse: collapse; font-size: 10px; text-align: right; background-color: #FFFFFF; border: 1.5px solid #C49746;">
          <thead>
            <tr style="background-color: #FFFDF9; border-bottom: 2px solid #C49746; color: #000000; font-weight: 900;">
              <th style="padding: 7px 6px; border-left: 1px solid #E5D5B8; text-align: center; width: 30px;">م</th>
              <th style="padding: 7px 6px; border-left: 1px solid #E5D5B8;">اسم العطر / الصنف</th>
              <th style="padding: 7px 6px; border-left: 1px solid #E5D5B8; width: 75px;">الماركة</th>
              <th style="padding: 7px 6px; border-left: 1px solid #E5D5B8; text-align: center; width: 55px;">النوع</th>
              <th style="padding: 7px 6px; border-left: 1px solid #E5D5B8; text-align: center; width: 55px;">الفئة</th>
              <th style="padding: 7px 6px; border-left: 1px solid #E5D5B8; text-align: center; width: 65px;">الرصيد(جم)</th>
              <th style="padding: 7px 6px; border-left: 1px solid #E5D5B8; text-align: center; width: 60px;">تكلفة/جم</th>
              <th style="padding: 7px 6px; border-left: 1px solid #E5D5B8; text-align: center; width: 75px;">قيمة التكلفة</th>
              <th style="padding: 7px 6px; border-left: 1px solid #E5D5B8; text-align: center; width: 75px;">قيمة البيع</th>
              <th style="padding: 7px 6px; border-left: 1px solid #E5D5B8; text-align: center; width: 55px;">حد الطلب</th>
              <th style="padding: 7px 6px; text-align: center; width: 65px;">حالة الرصيد</th>
            </tr>
          </thead>
          <tbody>
            ${filteredProducts.map((p, idx) => {
              const costPerG = getGramCost(p);
              const retailPerG = getRetailGramPrice(p);
              const stock = p.stock_grams || 0;
              const costTotal = stock * costPerG;
              const retailTotal = stock * retailPerG;
              const minThreshold = p.min_threshold_grams ?? 30;

              let statusLabel = 'متوفر وآمن';
              let statusColor = '#047857';
              if (stock <= 0) {
                statusLabel = 'نفد بالكامل';
                statusColor = '#B91C1C';
              } else if (stock <= minThreshold) {
                statusLabel = 'رصيد منخفض';
                statusColor = '#B45309';
              }

              const bgRow = idx % 2 === 0 ? '#FFFFFF' : '#FFFDF9';

              return `
                <tr style="background-color: ${bgRow}; border-bottom: 1px solid #E5D5B8; color: #000000; font-weight: 800;">
                  <td style="padding: 6px 5px; border-left: 1px solid #E5D5B8; text-align: center;">${idx + 1}</td>
                  <td style="padding: 6px 5px; border-left: 1px solid #E5D5B8; font-weight: 900; color: #000000;">${p.name}</td>
                  <td style="padding: 6px 5px; border-left: 1px solid #E5D5B8;">${p.brand || 'عام'}</td>
                  <td style="padding: 6px 5px; border-left: 1px solid #E5D5B8; text-align: center;">${p.type || 'عادي'}</td>
                  <td style="padding: 6px 5px; border-left: 1px solid #E5D5B8; text-align: center;">${p.gender || 'مشترك'}</td>
                  <td style="padding: 6px 5px; border-left: 1px solid #E5D5B8; text-align: center; font-weight: 900; color: #000000;">${fmtNum(stock)}</td>
                  <td style="padding: 6px 5px; border-left: 1px solid #E5D5B8; text-align: center;">${costPerG}</td>
                  <td style="padding: 6px 5px; border-left: 1px solid #E5D5B8; text-align: center; font-weight: 900; color: #000000;">${costTotal.toLocaleString('ar-EG')}</td>
                  <td style="padding: 6px 5px; border-left: 1px solid #E5D5B8; text-align: center; color: #047857; font-weight: 900;">${retailTotal.toLocaleString('ar-EG')}</td>
                  <td style="padding: 6px 5px; border-left: 1px solid #E5D5B8; text-align: center;">${minThreshold} جم</td>
                  <td style="padding: 6px 5px; text-align: center; font-weight: 900; color: ${statusColor};">${statusLabel}</td>
                </tr>
              `;
            }).join('')}
          </tbody>
          <tfoot>
            <tr style="background-color: #FFFDF9; border-top: 2px solid #C49746; font-weight: 900; color: #000000;">
              <td colspan="5" style="padding: 8px 6px; border-left: 1px solid #E5D5B8; text-align: center; font-size: 11px;">
                الإجمالي العام للمخزون (${fmtNum(totalItemsCount)} صنف)
              </td>
              <td style="padding: 8px 6px; border-left: 1px solid #E5D5B8; text-align: center; font-size: 11px; font-weight: 900; color: #000000;">
                ${fmtNum(totalGrams)} جم
              </td>
              <td style="padding: 8px 6px; border-left: 1px solid #E5D5B8; text-align: center; font-size: 10px; color: #78350F;">
                -
              </td>
              <td style="padding: 8px 6px; border-left: 1px solid #E5D5B8; text-align: center; font-size: 12px; font-weight: 900; color: #000000;">
                ${fmtMoney(totalCostValuation, currency)}
              </td>
              <td style="padding: 8px 6px; border-left: 1px solid #E5D5B8; text-align: center; font-size: 12px; font-weight: 900; color: #047857;">
                ${fmtMoney(totalRetailValuation, currency)}
              </td>
              <td colspan="2" style="padding: 8px 6px; text-align: center; font-size: 10px; color: #78350F;">
                أرباح كامنة: ${fmtMoney(potentialUnrealizedProfit, currency)}
              </td>
            </tr>
          </tfoot>
        </table>
      </div>

      <!-- ========================================== -->
      <!-- OFFICIAL SIGNATURES & STORE STAMP BOX     -->
      <!-- ========================================== -->
      <div style="display: flex; justify-content: space-between; align-items: flex-end; border-top: 2px solid #C49746; padding-top: 14px; margin-top: 16px;">
        <!-- Signatures -->
        <div style="display: flex; gap: 40px; font-size: 11px; font-weight: 900; color: #000000;">
          <div>
            <div>أمين المخزن والمستودع:</div>
            <div style="margin-top: 26px; border-bottom: 1.5px dotted #000000; width: 140px; text-align: center; padding-bottom: 2px;">
              ${managerName}
            </div>
          </div>
          <div>
            <div>المشرف العام / مدير المتجر:</div>
            <div style="margin-top: 26px; border-bottom: 1.5px dotted #000000; width: 140px; text-align: center; padding-bottom: 2px;">
              يعتمد / الإدارة العامة
            </div>
          </div>
        </div>

        <!-- Official Seal / Stamp -->
        <div style="border: 2px solid #C49746; border-radius: 50%; width: 95px; height: 95px; display: flex; flex-direction: column; align-items: center; justify-content: center; text-align: center; padding: 4px; box-sizing: border-box; background-color: #FFFFFF;">
          <div style="font-size: 10px; font-weight: 900; color: #C49746;">متجر لمسة عطر</div>
          <div style="font-size: 9px; font-weight: 900; color: #000000; margin: 2px 0;">جرد رسمي معتمد</div>
          <div style="font-size: 8px; font-weight: 800; color: #78350F;">أثر يبقى وذكرى تدوم</div>
          <div style="font-size: 7.5px; font-weight: 900; color: #000000;">${new Date().getFullYear()}م</div>
        </div>
      </div>

      <!-- ========================================== -->
      <!-- FOOTER NOTE                                -->
      <!-- ========================================== -->
      <div style="text-align: center; font-size: 9.5px; font-weight: 800; color: #000000; border-top: 1px solid #E5D5B8; margin-top: 14px; padding-top: 8px;">
        ${storeName} | ${slogan} — تم استخراج وثيقة الجرد والتقييم آلياً عبر نظام إدارة المخزون ونقاط البيع السحابي.
      </div>

    </div>
  `;
};

/**
 * دالة تصدير عنصر HTML وتحويله إلى ملف PDF متعدد الصفحات A4 بدقة عالية
 */
export const exportElementToPdf = async (
  element: HTMLElement,
  filename: string
): Promise<void> => {
  // إنشاء canvas بدقة عالية (scale: 2) لخلو النصوص من أي تشويش
  const canvas = await html2canvas(element, {
    scale: 2,
    useCORS: true,
    logging: false,
    backgroundColor: '#FFFFFF',
    windowWidth: 1200,
  });

  const imgData = canvas.toDataURL('image/png');
  const pdf = new jsPDF('p', 'mm', 'a4');
  
  const pageWidth = 210; // A4 mm
  const pageHeight = 297; // A4 mm
  const imgWidth = pageWidth;
  const imgHeight = (canvas.height * imgWidth) / canvas.width;

  let heightLeft = imgHeight;
  let position = 0;

  // إضافة الصفحة الأولى
  pdf.addImage(imgData, 'PNG', 0, position, imgWidth, imgHeight, undefined, 'FAST');
  heightLeft -= pageHeight;

  // صفحات إضافية في حال كان التقرير طويلاً
  while (heightLeft > 0) {
    position = heightLeft - imgHeight;
    pdf.addPage();
    pdf.addImage(imgData, 'PNG', 0, position, imgWidth, imgHeight, undefined, 'FAST');
    heightLeft -= pageHeight;
  }

  pdf.save(filename);
};

/**
 * دالة سريعة ومباشرة لتنزيل تقرير الأرباح والمبيعات بصيغة PDF
 */
export const downloadProfitReportPdf = async (
  data: ProfitReportExportData,
  customFilename?: string
): Promise<void> => {
  const htmlContent = buildProfitReportHtml(data);
  const container = document.createElement('div');
  
  // ضبط الحاوية خارج مجال الرؤية المباشر لعدم التأثير على تجربة المستخدم
  container.style.position = 'fixed';
  container.style.left = '-9999px';
  container.style.top = '0';
  container.style.width = '210mm';
  container.style.backgroundColor = '#FFFFFF';
  container.innerHTML = htmlContent;
  document.body.appendChild(container);

  try {
    const filename = customFilename || `تقرير_الأرباح_لمسة_عطر_${new Date().toISOString().slice(0, 10)}.pdf`;
    await exportElementToPdf(container, filename);
  } finally {
    document.body.removeChild(container);
  }
};

/**
 * دالة سريعة ومباشرة لتنزيل تقرير المخزون وجرد الزيوت بصيغة PDF
 */
export const downloadInventoryReportPdf = async (
  data: InventoryReportExportData,
  customFilename?: string
): Promise<void> => {
  const htmlContent = buildInventoryReportHtml(data);
  const container = document.createElement('div');

  container.style.position = 'fixed';
  container.style.left = '-9999px';
  container.style.top = '0';
  container.style.width = '210mm';
  container.style.backgroundColor = '#FFFFFF';
  container.innerHTML = htmlContent;
  document.body.appendChild(container);

  try {
    const filename = customFilename || `تقرير_جرد_المخزون_لمسة_عطر_${new Date().toISOString().slice(0, 10)}.pdf`;
    await exportElementToPdf(container, filename);
  } finally {
    document.body.removeChild(container);
  }
};

/**
 * دالة طباعة مباشرة باستخدام نافذة طباعة آمنة
 */
export const printReportHtmlDirectly = (htmlContent: string, title: string = 'طباعة تقرير لمسة عطر'): void => {
  const printFrame = document.createElement('iframe');
  printFrame.style.position = 'fixed';
  printFrame.style.right = '0';
  printFrame.style.bottom = '0';
  printFrame.style.width = '0';
  printFrame.style.height = '0';
  printFrame.style.border = '0';
  
  document.body.appendChild(printFrame);

  const doc = printFrame.contentWindow?.document;
  if (!doc) return;

  doc.open();
  doc.write(`
    <!DOCTYPE html>
    <html lang="ar" dir="rtl">
      <head>
        <meta charset="utf-8" />
        <title>${title}</title>
        <link href="https://fonts.googleapis.com/css2?family=Readex+Pro:wght@400;600;700;800;900&display=swap" rel="stylesheet" />
        <style>
          @page {
            size: A4;
            margin: 8mm 10mm;
          }
          body {
            margin: 0;
            padding: 0;
            background-color: #FFFFFF !important;
            color: #000000 !important;
            font-family: 'Readex Pro', 'Cairo', sans-serif;
            -webkit-print-color-adjust: exact !important;
            print-color-adjust: exact !important;
          }
          * {
            box-sizing: border-box;
          }
          table {
            page-break-inside: auto;
          }
          tr {
            page-break-inside: avoid;
            page-break-after: auto;
          }
          thead {
            display: table-header-group;
          }
          tfoot {
            display: table-footer-group;
          }
        </style>
      </head>
      <body>
        ${htmlContent}
      </body>
    </html>
  `);
  doc.close();

  // تأخير بسيط لتحميل الخطوط ثم تشغيل الطباعة
  setTimeout(() => {
    try {
      printFrame.contentWindow?.focus();
      printFrame.contentWindow?.print();
    } catch (err) {
      console.warn('IFrame print fallback:', err);
    } finally {
      setTimeout(() => {
        if (document.body.contains(printFrame)) {
          document.body.removeChild(printFrame);
        }
      }, 3000);
    }
  }, 500);
};
