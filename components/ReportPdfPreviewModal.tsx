import React, { useState, useRef, useMemo } from 'react';
import { 
  X, 
  Download, 
  Printer, 
  FileText, 
  TrendingUp, 
  Package, 
  CheckCircle2, 
  Loader2, 
  ZoomIn, 
  ZoomOut, 
  Eye, 
  Calendar,
  Filter,
  Sparkles,
  ShieldCheck
} from 'lucide-react';
import { Product, Sale, StoreSettings, AppUser, DEFAULT_SETTINGS } from '../types';
import { 
  buildProfitReportHtml, 
  buildInventoryReportHtml, 
  exportElementToPdf, 
  printReportHtmlDirectly 
} from '../services/pdfExportService';

export type ReportType = 'profit' | 'inventory';

interface ReportPdfPreviewModalProps {
  isOpen: boolean;
  onClose: () => void;
  initialReportType?: ReportType;
  sales: Sale[];
  products: Product[];
  settings?: StoreSettings;
  currentUser?: AppUser | null;
  selectedPeriodLabel?: string;
}

export const ReportPdfPreviewModal: React.FC<ReportPdfPreviewModalProps> = ({
  isOpen,
  onClose,
  initialReportType = 'profit',
  sales,
  products,
  settings = DEFAULT_SETTINGS,
  currentUser,
  selectedPeriodLabel = 'الفترة المحددة',
}) => {
  const [reportType, setReportType] = useState<ReportType>(initialReportType);
  const [isExporting, setIsExporting] = useState<boolean>(false);
  const [exportSuccess, setExportSuccess] = useState<boolean>(false);
  const [includeCostsAndProfits, setIncludeCostsAndProfits] = useState<boolean>(true);
  const [inventoryFilter, setInventoryFilter] = useState<string>('all');
  const [lowStockOnly, setLowStockOnly] = useState<boolean>(false);
  const [zoomLevel, setZoomLevel] = useState<number>(100);

  // Time filter for profit report inside modal
  const [profitTimeFilter, setProfitTimeFilter] = useState<'current_view' | 'today' | 'yesterday' | 'week' | 'month' | 'all'>('current_view');

  const reportContainerRef = useRef<HTMLDivElement>(null);

  // Filter sales based on chosen filter
  const filteredSalesForReport = useMemo(() => {
    if (profitTimeFilter === 'current_view') {
      return sales;
    }
    const now = new Date();
    const todayStr = now.toISOString().slice(0, 10);
    const yesterdayDate = new Date(now);
    yesterdayDate.setDate(now.getDate() - 1);
    const yesterdayStr = yesterdayDate.toISOString().slice(0, 10);
    const monthStr = now.toISOString().slice(0, 7);

    return sales.filter(s => {
      if (s.isReversed) return false;
      if (profitTimeFilter === 'today') return s.date.startsWith(todayStr);
      if (profitTimeFilter === 'yesterday') return s.date.startsWith(yesterdayStr);
      if (profitTimeFilter === 'month') return s.date.startsWith(monthStr);
      if (profitTimeFilter === 'week') {
        const sDate = new Date(s.date);
        const diffDays = Math.ceil(Math.abs(now.getTime() - sDate.getTime()) / (1000 * 60 * 60 * 24));
        return diffDays <= 7;
      }
      return true;
    });
  }, [sales, profitTimeFilter]);

  const activePeriodLabel = useMemo(() => {
    switch (profitTimeFilter) {
      case 'today': return 'مبيعات اليوم';
      case 'yesterday': return 'مبيعات يوم أمس';
      case 'week': return 'آخر 7 أيام';
      case 'month': return 'الشهر الحالي';
      case 'all': return 'كافة السجلات التاريخية';
      default: return selectedPeriodLabel;
    }
  }, [profitTimeFilter, selectedPeriodLabel]);

  // توليد HTML التقرير النشط
  const reportHtml = useMemo(() => {
    if (reportType === 'profit') {
      return buildProfitReportHtml({
        sales: filteredSalesForReport,
        periodLabel: activePeriodLabel,
        settings,
        currentUser,
        includeCostsAndProfits
      });
    } else {
      return buildInventoryReportHtml({
        products,
        settings,
        currentUser,
        filterType: inventoryFilter,
        lowStockOnly
      });
    }
  }, [
    reportType, 
    filteredSalesForReport, 
    activePeriodLabel, 
    settings, 
    currentUser, 
    includeCostsAndProfits, 
    products, 
    inventoryFilter, 
    lowStockOnly
  ]);

  if (!isOpen) return null;

  // تنزيل ملف PDF
  const handleDownloadPdf = async () => {
    if (!reportContainerRef.current) return;
    setIsExporting(true);
    setExportSuccess(false);

    try {
      const todayStr = new Date().toISOString().slice(0, 10);
      const filename = reportType === 'profit'
        ? `تقرير_الأرباح_والمبيعات_لمسة_عطر_${todayStr}.pdf`
        : `تقرير_جرد_المخزون_لمسة_عطر_${todayStr}.pdf`;

      await exportElementToPdf(reportContainerRef.current, filename);
      setExportSuccess(true);
      setTimeout(() => setExportSuccess(false), 3500);
    } catch (err) {
      console.error('Failed to export PDF:', err);
    } finally {
      setIsExporting(false);
    }
  };

  // طباعة مباشرة
  const handlePrint = () => {
    const title = reportType === 'profit' ? 'تقرير الأرباح - لمسة عطر' : 'تقرير المخزون - لمسة عطر';
    printReportHtmlDirectly(reportHtml, title);
  };

  return (
    <div 
      className="fixed inset-0 z-[120] flex items-center justify-center bg-black/60 backdrop-blur-xs p-2 sm:p-4 overflow-y-auto"
      dir="rtl"
    >
      <div 
        className="bg-white rounded-3xl w-full max-w-5xl max-h-[96vh] flex flex-col shadow-2xl border border-[#C49746]/40 overflow-hidden"
        style={{ color: '#000000' }}
      >
        
        {/* MODAL HEADER CONTROLS */}
        <div className="p-4 sm:p-5 border-b border-[#C49746]/30 bg-[#FFFDF9] flex flex-col md:flex-row items-stretch md:items-center justify-between gap-3">
          
          {/* Report Type Switcher */}
          <div className="flex items-center gap-2 flex-wrap">
            <div className="flex bg-white p-1 rounded-2xl border border-[#C49746]/50 shadow-2xs">
              <button
                type="button"
                onClick={() => setReportType('profit')}
                className={`flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl text-xs font-black transition-all cursor-pointer ${
                  reportType === 'profit'
                    ? 'bg-[#C49746] text-white shadow-xs'
                    : 'text-[#000000] hover:bg-[#FBF8F2]'
                }`}
              >
                <TrendingUp size={15} />
                <span>تقرير الأرباح والمبيعات</span>
              </button>

              <button
                type="button"
                onClick={() => setReportType('inventory')}
                className={`flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl text-xs font-black transition-all cursor-pointer ${
                  reportType === 'inventory'
                    ? 'bg-[#C49746] text-white shadow-xs'
                    : 'text-[#000000] hover:bg-[#FBF8F2]'
                }`}
              >
                <Package size={15} />
                <span>تقرير المخزون والجرد</span>
              </button>
            </div>

            {/* Zoom Controls */}
            <div className="flex items-center bg-white border border-[#C49746]/30 rounded-xl px-2 py-1 gap-1">
              <button
                type="button"
                onClick={() => setZoomLevel(prev => Math.max(60, prev - 15))}
                className="p-1 text-[#000000] hover:text-[#78350F] cursor-pointer"
                title="تصغير"
              >
                <ZoomOut size={14} />
              </button>
              <span className="text-[11px] font-black text-[#000000] px-1">{zoomLevel}%</span>
              <button
                type="button"
                onClick={() => setZoomLevel(prev => Math.min(140, prev + 15))}
                className="p-1 text-[#000000] hover:text-[#78350F] cursor-pointer"
                title="تكبير"
              >
                <ZoomIn size={14} />
              </button>
            </div>
          </div>

          {/* Action Buttons */}
          <div className="flex items-center gap-2 self-end md:self-auto">
            {/* Primary Download PDF Button */}
            <button
              type="button"
              onClick={handleDownloadPdf}
              disabled={isExporting}
              className="flex items-center gap-2 px-4 py-2.5 rounded-2xl bg-[#C49746] hover:bg-[#B38536] text-white text-xs font-black shadow-md transition-all cursor-pointer disabled:opacity-50"
            >
              {isExporting ? (
                <>
                  <Loader2 size={16} className="animate-spin text-white" />
                  <span>جاري إنشاء ملف PDF...</span>
                </>
              ) : exportSuccess ? (
                <>
                  <CheckCircle2 size={16} className="text-white" />
                  <span>تم تنزيل ملف PDF ✓</span>
                </>
              ) : (
                <>
                  <Download size={16} />
                  <span>تحميل ملف PDF (A4) 📄</span>
                </>
              )}
            </button>

            {/* Direct Print Button */}
            <button
              type="button"
              onClick={handlePrint}
              className="flex items-center gap-1.5 px-3.5 py-2.5 rounded-2xl bg-white border border-[#C49746] hover:bg-[#FFFDF9] text-[#000000] text-xs font-black shadow-2xs transition-all cursor-pointer"
              title="طباعة مباشرة"
            >
              <Printer size={15} className="text-[#78350F]" />
              <span>طباعة فورية</span>
            </button>

            {/* Close Button */}
            <button
              type="button"
              onClick={onClose}
              className="p-2 rounded-2xl bg-white border border-black/10 hover:bg-black/5 text-[#000000] transition-colors cursor-pointer"
              title="إغلاق المعاينة"
            >
              <X size={18} />
            </button>
          </div>
        </div>

        {/* SECONDARY FILTER & CUSTOMIZATION BAR */}
        <div className="px-4 py-2.5 bg-white border-b border-[#C49746]/20 flex flex-wrap items-center justify-between gap-3 text-xs">
          
          {reportType === 'profit' ? (
            <div className="flex items-center gap-3 flex-wrap">
              <span className="font-black text-[#000000] flex items-center gap-1">
                <Calendar size={13} className="text-[#78350F]" />
                <span>فترة التقرير:</span>
              </span>
              <div className="flex items-center gap-1">
                {[
                  { id: 'current_view', label: 'المعروض حالياً' },
                  { id: 'today', label: 'اليوم' },
                  { id: 'yesterday', label: 'أمس' },
                  { id: 'week', label: 'آخر 7 أيام' },
                  { id: 'month', label: 'هذا الشهر' },
                  { id: 'all', label: 'الكل' }
                ].map(opt => (
                  <button
                    key={opt.id}
                    type="button"
                    onClick={() => setProfitTimeFilter(opt.id as any)}
                    className={`px-2.5 py-1 rounded-lg font-black text-[11px] transition-all cursor-pointer ${
                      profitTimeFilter === opt.id
                        ? 'bg-[#C49746] text-white'
                        : 'bg-white border border-[#C49746]/30 text-[#000000] hover:bg-[#FFFDF9]'
                    }`}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>

              {/* Toggle Cost & Profit Columns */}
              <label className="flex items-center gap-1.5 cursor-pointer mr-3 select-none">
                <input
                  type="checkbox"
                  checked={includeCostsAndProfits}
                  onChange={(e) => setIncludeCostsAndProfits(e.target.checked)}
                  className="rounded border-[#C49746] text-[#C49746] focus:ring-0 cursor-pointer"
                />
                <span className="font-bold text-[#000000]">إظهار أعمدة التكلفة وصافي الأرباح</span>
              </label>
            </div>
          ) : (
            <div className="flex items-center gap-3 flex-wrap">
              <span className="font-black text-[#000000] flex items-center gap-1">
                <Filter size={13} className="text-[#78350F]" />
                <span>فئة العطور:</span>
              </span>
              <div className="flex items-center gap-1">
                {[
                  { id: 'all', label: 'كافة الفئات' },
                  { id: 'عادي', label: 'عادي' },
                  { id: 'نيش', label: 'نيش' },
                  { id: 'مسك', label: 'مسك' },
                  { id: 'عود', label: 'عود' }
                ].map(opt => (
                  <button
                    key={opt.id}
                    type="button"
                    onClick={() => setInventoryFilter(opt.id)}
                    className={`px-2.5 py-1 rounded-lg font-black text-[11px] transition-all cursor-pointer ${
                      inventoryFilter === opt.id
                        ? 'bg-[#C49746] text-white'
                        : 'bg-white border border-[#C49746]/30 text-[#000000] hover:bg-[#FFFDF9]'
                    }`}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>

              {/* Low Stock Only Filter */}
              <label className="flex items-center gap-1.5 cursor-pointer mr-3 select-none">
                <input
                  type="checkbox"
                  checked={lowStockOnly}
                  onChange={(e) => setLowStockOnly(e.target.checked)}
                  className="rounded border-[#C49746] text-[#C49746] focus:ring-0 cursor-pointer"
                />
                <span className="font-bold text-[#000000]">عرض النواقص والمخزون الحرج فقط</span>
              </label>
            </div>
          )}

          <div className="font-bold text-[#78350F] text-[11px]">
            ورق قياسي A4 جاهز للطباعة والتحميل الفوري
          </div>
        </div>

        {/* PREVIEW CONTAINER */}
        <div className="flex-1 overflow-auto p-4 sm:p-6 bg-[#F8F6F0] flex justify-center">
          <div 
            style={{ 
              transform: `scale(${zoomLevel / 100})`, 
              transformOrigin: 'top center',
              transition: 'transform 0.15s ease-out'
            }}
            className="w-full max-w-[210mm] shadow-xl rounded-md bg-white border border-[#C49746]/40"
          >
            {/* The actual HTML report rendered live for preview and PDF export */}
            <div 
              ref={reportContainerRef}
              dangerouslySetInnerHTML={{ __html: reportHtml }} 
              className="bg-white"
            />
          </div>
        </div>

        {/* MODAL FOOTER */}
        {/* ======================================================== */}
        <div className="p-3 sm:p-4 border-t border-[#C49746]/30 bg-white flex items-center justify-between text-xs">
          <div className="flex items-center gap-2 text-[#000000] font-bold">
            <ShieldCheck size={16} className="text-[#C49746]" />
            <span>نظام تصدير تقارير لمسة عطر الرسمي المعتمد • متوافق مع الحسابات والجرد الميداني</span>
          </div>

          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={handleDownloadPdf}
              disabled={isExporting}
              className="px-4 py-2 rounded-xl bg-[#C49746] hover:bg-[#B38536] text-white font-black flex items-center gap-1.5 cursor-pointer"
            >
              <Download size={14} />
              <span>تحميل التقرير (PDF)</span>
            </button>
            <button
              type="button"
              onClick={onClose}
              className="px-3.5 py-2 rounded-xl bg-white border border-black/15 text-[#000000] font-black hover:bg-black/5 cursor-pointer"
            >
              إغلاق
            </button>
          </div>
        </div>

      </div>
    </div>
  );
};

export default ReportPdfPreviewModal;
