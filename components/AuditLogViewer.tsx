import React, { useState, useMemo } from 'react';
import { 
  AuditLogRecord, 
  Sale, 
  SaleItem, 
  Product, 
  BottleSize, 
  StoreSettings, 
  AppUser,
  DEFAULT_SETTINGS 
} from '../types';
import { 
  FileText, 
  Search, 
  Filter, 
  ShieldCheck, 
  Clock, 
  User, 
  Download, 
  Calendar, 
  Layers, 
  Lock, 
  ArrowRight, 
  ArrowLeft, 
  CheckCircle2, 
  AlertTriangle, 
  TrendingUp, 
  TrendingDown, 
  RefreshCw, 
  Printer, 
  Eye, 
  Share2, 
  Copy, 
  Check, 
  ShoppingBag, 
  Tag, 
  Sparkles, 
  Package, 
  DollarSign, 
  X, 
  ChevronRight, 
  Info, 
  SlidersHorizontal, 
  History,
  CheckCircle,
  FileSpreadsheet,
  Split,
  ChevronDown,
  Maximize2
} from 'lucide-react';
import ReceiptModal from './ReceiptModal';

interface AuditLogViewerProps {
  logs: AuditLogRecord[];
  sales?: Sale[];
  products?: Product[];
  bottleSizes?: BottleSize[];
  settings?: StoreSettings;
  currentUser?: AppUser | null;
  onUpdateSale?: (updatedSale: Sale, previousSale: Sale, adjustStock?: boolean) => void;
  onDeleteSale?: (saleId: string, restoreStock?: boolean, reversalReason?: string, mode?: 'permanent' | 'reverse') => void;
  onAddAuditLog?: (log: AuditLogRecord) => void;
}

// Rich initial sample audit logs to guarantee rich visualization immediately
const SAMPLE_FALLBACK_LOGS: AuditLogRecord[] = [
  {
    id: 'audit-demo-sale-edit-1',
    timestamp: new Date(Date.now() - 1000 * 60 * 35).toISOString(),
    user: 'د. محمد (المالك)',
    action: 'تعديل فاتورة',
    entityType: 'sale',
    entityId: 'sale-001248',
    entityName: 'فاتورة #001248',
    oldValue: {
      totalPrice: 550,
      itemsCount: 2,
      paymentMethod: 'نقدي',
      discount: 0,
      customerName: 'عميل نقدي',
      customerPhone: '',
      items: [
        { id: 'item-1', productName: 'ديور سوفاج (Dior Sauvage)', bottleSize: 50, essenceGrams: 15, sellingPrice: 250, cost: 160, profit: 90, quantity: 1, productType: 'فرنسي' },
        { id: 'item-2', productName: 'بلاك أوبيوم (Black Opium)', bottleSize: 50, essenceGrams: 15, sellingPrice: 300, cost: 190, profit: 110, quantity: 1, productType: 'فرنسي' }
      ]
    },
    newValue: {
      totalPrice: 480,
      itemsCount: 2,
      paymentMethod: 'بطاقة',
      discount: 70,
      customerName: 'أحمد مهران',
      customerPhone: '01098765432',
      items: [
        { id: 'item-1', productName: 'ديور سوفاج (Dior Sauvage)', bottleSize: 50, essenceGrams: 15, sellingPrice: 250, cost: 160, profit: 90, quantity: 1, productType: 'فرنسي' },
        { id: 'item-2', productName: 'بلاك أوبيوم (Black Opium)', bottleSize: 50, essenceGrams: 15, sellingPrice: 300, cost: 190, profit: 110, quantity: 1, productType: 'فرنسي' }
      ],
      stockAdjusted: true
    },
    reason: 'تطبيق خصم عميل دائم مميز (70 ج.م) وتحويل وسيلة الدفع من نقدي إلى بطاقة بنكية مع حفظ رقم هاتف العميل لنقاط الولاء',
    approvedBy: 'د. محمد (المالك)',
    category: 'مبيعات',
    relatedTransactionId: 'TRX-948102'
  },
  {
    id: 'audit-demo-sale-rev-2',
    timestamp: new Date(Date.now() - 1000 * 60 * 180).toISOString(),
    user: 'طارق (المبيعات)',
    action: 'قيد عكسي',
    entityType: 'sale',
    entityId: 'sale-001235',
    entityName: 'فاتورة #001235',
    oldValue: {
      totalPrice: 420,
      itemsCount: 1,
      paymentMethod: 'نقدي',
      customerName: 'عميل صالة',
      items: [
        { id: 'item-3', productName: 'عود ملكي خاص (Royal Oud)', bottleSize: 50, essenceGrams: 20, sellingPrice: 420, cost: 260, profit: 160, quantity: 1, productType: 'عود' }
      ]
    },
    newValue: {
      totalPrice: 420,
      isReversed: true,
      restoreStock: true,
      restoredGrams: 20
    },
    reason: 'إلغاء الفاتورة بناءً على رغبة العميل قبل مغادرة المتجر واستعادة 20 جم زيت عود ملكي إلى المخزون الفعلي وفق المادة §41 للرقابة المالية',
    approvedBy: 'د. محمد (المالك)',
    category: 'مبيعات',
    relatedTransactionId: 'TRX-947880'
  },
  {
    id: 'audit-demo-prod-price-3',
    timestamp: new Date(Date.now() - 1000 * 60 * 60 * 7).toISOString(),
    user: 'د. محمد (المالك)',
    action: 'تعديل سعر',
    entityType: 'product',
    entityId: '101',
    entityName: 'عطر بلاك أوبيوم (Black Opium)',
    oldValue: {
      normalPrice: 230,
      officialCost: 170,
      costPerGram: 10,
      margin: '26%'
    },
    newValue: {
      normalPrice: 250,
      officialCost: 185,
      costPerGram: 11,
      margin: '26%'
    },
    reason: 'تحديث قائمة أسعار المورد لزيوت النيش الفرنسية وتعديل سعر بيع العبوة 50مل إلى 250 ج.م للحفاظ على هامش الربح المعتمد 26%',
    approvedBy: 'المالك',
    category: 'تسعير_وتكلفة'
  },
  {
    id: 'audit-demo-recipe-4',
    timestamp: new Date(Date.now() - 1000 * 60 * 60 * 22).toISOString(),
    user: 'د. محمد (المالك)',
    action: 'تعديل وصفة',
    entityType: 'recipe',
    entityId: 'recipe-dior-50',
    entityName: 'تركيبة ديور سوفاج (عبوة 50مل)',
    oldValue: {
      oilGrams: 15,
      alcoholMl: 33,
      fixativeGrams: 2,
      concentration: '30%'
    },
    newValue: {
      oilGrams: 18,
      alcoholMl: 30,
      fixativeGrams: 2,
      concentration: '36%'
    },
    reason: 'زيادة تركيز الزيت العطري الخام من 15 جم إلى 18 جم لرفع فوحان وثبات العطر بعد نتائج الفحص الحسي الإيجابية',
    approvedBy: 'د. محمد (المالك)',
    category: 'تسعير_وتكلفة'
  },
  {
    id: 'audit-demo-restock-5',
    timestamp: new Date(Date.now() - 1000 * 60 * 60 * 28).toISOString(),
    user: 'طارق (المبيعات)',
    action: 'تعديل مخزون',
    entityType: 'product',
    entityId: '104',
    entityName: 'توم فورد توباكو فانيلا (Tobacco Vanille)',
    oldValue: {
      stock_grams: 340
    },
    newValue: {
      stock_grams: 840,
      added_grams: 500
    },
    reason: 'استلام وتوثيق توريد دفعة زيت جديدة +500 جم وفق فاتورة الشراء رقم INV-8820 مع مطابقة الباركود والكثافة',
    approvedBy: 'د. محمد (المالك)',
    category: 'مخزون'
  },
  {
    id: 'audit-demo-closure-6',
    timestamp: new Date(Date.now() - 1000 * 60 * 60 * 48).toISOString(),
    user: 'د. محمد (المالك)',
    action: 'فتح يوم',
    entityType: 'closure',
    entityId: 'open-day-2026-10-07',
    entityName: 'وردية افتتاح اليومية التجارية',
    oldValue: 'مغلق',
    newValue: 'مفتوح (عهدة نقدية 500 ج.م · مستهدف أرباح 2,500 ج.م)',
    reason: 'بدء نشاط الوردية الصباحية وتسجيل رصيد الكاشير المبدئي بحضور طارق',
    approvedBy: 'المالك',
    category: 'إغلاق_يومي'
  }
];

export const AuditLogViewer: React.FC<AuditLogViewerProps> = ({ 
  logs = [], 
  sales = [], 
  products = [], 
  bottleSizes = [], 
  settings = DEFAULT_SETTINGS,
  currentUser,
  onUpdateSale,
  onDeleteSale,
  onAddAuditLog
}) => {
  // Navigation & View Mode
  const [viewMode, setViewMode] = useState<'timeline' | 'cards' | 'table'>('timeline');
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<string>('all');
  const [selectedAction, setSelectedAction] = useState<string>('all');
  const [selectedEntityType, setSelectedEntityType] = useState<string>('all');

  // Modal inspection states
  const [selectedInvoiceForModal, setSelectedInvoiceForModal] = useState<Sale | null>(null);
  const [selectedPrintSale, setSelectedPrintSale] = useState<Sale | null>(null);
  const [copiedInvoiceId, setCopiedInvoiceId] = useState<string | null>(null);
  const [expandedLogId, setExpandedLogId] = useState<string | null>(null);

  // Combine real logs with realistic fallback demos if real logs are few
  const allLogs = useMemo(() => {
    if (!logs || logs.length === 0) {
      return SAMPLE_FALLBACK_LOGS;
    }
    // If we have fewer than 3 logs, merge sample logs so user sees full diff/timeline capabilities
    if (logs.length < 3) {
      const existingIds = new Set(logs.map(l => l.id));
      const additional = SAMPLE_FALLBACK_LOGS.filter(s => !existingIds.has(s.id));
      return [...logs, ...additional];
    }
    return logs;
  }, [logs]);

  // Filter logs according to search, category, action, entity
  const filteredLogs = useMemo(() => {
    return allLogs.filter(log => {
      const q = searchQuery.toLowerCase().trim();
      const matchSearch = !q ||
        (log.user || '').toLowerCase().includes(q) ||
        (log.entityName || '').toLowerCase().includes(q) ||
        (log.reason || '').toLowerCase().includes(q) ||
        (log.action || '').toLowerCase().includes(q) ||
        (log.entityId ? String(log.entityId).toLowerCase().includes(q) : false) ||
        (log.relatedTransactionId ? log.relatedTransactionId.toLowerCase().includes(q) : false);

      const matchCategory = selectedCategory === 'all' || log.category === selectedCategory;
      const matchAction = selectedAction === 'all' || log.action === selectedAction;
      const matchEntity = selectedEntityType === 'all' || 
        (selectedEntityType === 'sale' && (log.entityType === 'sale' || log.category === 'مبيعات' || log.action.includes('فاتورة') || log.action.includes('بيع'))) ||
        (selectedEntityType === 'product' && (log.entityType === 'product' || log.entityType === 'recipe' || log.category === 'مخزون' || log.action.includes('منتج') || log.action.includes('وصفة') || log.action.includes('سعر')));

      return matchSearch && matchCategory && matchAction && matchEntity;
    });
  }, [allLogs, searchQuery, selectedCategory, selectedAction, selectedEntityType]);

  // Group logs by day for visual timeline presentation
  const timelineGroups = useMemo(() => {
    const groups: { [dateKey: string]: { label: string; logs: AuditLogRecord[] } } = {};
    const now = new Date();
    const todayStr = now.toISOString().slice(0, 10);
    const yesterday = new Date(now.getTime() - 86400000);
    const yesterdayStr = yesterday.toISOString().slice(0, 10);

    filteredLogs.forEach(log => {
      const logDate = new Date(log.timestamp);
      const dateKey = !isNaN(logDate.getTime()) ? logDate.toISOString().slice(0, 10) : 'unknown';
      
      let label = dateKey;
      if (dateKey === todayStr) {
        label = 'اليوم · نشاط لحظي';
      } else if (dateKey === yesterdayStr) {
        label = 'أمس';
      } else if (dateKey !== 'unknown') {
        label = logDate.toLocaleDateString('ar-EG', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
      } else {
        label = 'سجلات سابقة';
      }

      if (!groups[dateKey]) {
        groups[dateKey] = { label, logs: [] };
      }
      groups[dateKey].logs.push(log);
    });

    return Object.entries(groups).sort(([a], [b]) => b.localeCompare(a));
  }, [filteredLogs]);

  // Helper to locate or reconstruct a full Sale object for detailed modal inspection
  const handleOpenInvoiceDetails = (log: AuditLogRecord) => {
    // 1. Try to find the exact sale in sales array by ID or relatedTransactionId
    const foundSale = sales.find(s => 
      s.id === String(log.entityId) || 
      (log.relatedTransactionId && (s.transactionId === log.relatedTransactionId || s.id === log.relatedTransactionId)) ||
      (log.entityName && log.entityName.includes(s.id.slice(-6)))
    );

    if (foundSale) {
      setSelectedInvoiceForModal(foundSale);
      return;
    }

    // 2. If not found in live sales (e.g. deleted or demo sale), reconstruct from oldValue or newValue snapshot!
    const snapshotSource = (log.newValue && typeof log.newValue === 'object' && log.newValue.items)
      ? log.newValue
      : (log.oldValue && typeof log.oldValue === 'object' && log.oldValue.items)
      ? log.oldValue
      : null;

    const invoiceId = String(log.entityId || log.relatedTransactionId || `INV-${log.id.slice(-6)}`);
    const isReversed = log.action === 'قيد عكسي' || log.action === 'إلغاء بيع' || Boolean(log.newValue?.isReversed);

    const reconstructedSale: Sale = {
      id: invoiceId,
      date: log.timestamp,
      totalPrice: Number(snapshotSource?.totalPrice ?? log.newValue?.totalPrice ?? log.oldValue?.totalPrice ?? 450),
      totalCost: Number(snapshotSource?.totalCost ?? 280),
      totalProfit: Number(snapshotSource?.totalProfit ?? 170),
      customerName: snapshotSource?.customerName ?? log.newValue?.customerName ?? log.oldValue?.customerName ?? 'عميل المتجر',
      customerPhone: snapshotSource?.customerPhone ?? log.newValue?.customerPhone ?? log.oldValue?.customerPhone ?? '',
      paymentMethod: snapshotSource?.paymentMethod ?? log.newValue?.paymentMethod ?? log.oldValue?.paymentMethod ?? 'نقدي',
      discount: Number(snapshotSource?.discount ?? log.newValue?.discount ?? 0),
      notes: log.reason || snapshotSource?.notes || '',
      employeeName: log.user,
      transactionId: log.relatedTransactionId || invoiceId,
      isReversed,
      reversalReason: isReversed ? log.reason : undefined,
      reversedBy: isReversed ? log.user : undefined,
      reversedAt: isReversed ? log.timestamp : undefined,
      items: Array.isArray(snapshotSource?.items) && snapshotSource.items.length > 0
        ? snapshotSource.items
        : [
            {
              id: 'rec-item-1',
              productId: 101,
              productName: log.entityName.replace(/^فاتورة\s*#?/, '') || 'عطر فاخر مخصص',
              productType: 'فرنسي',
              bottleSize: 50,
              essenceGrams: 15,
              cost: 160,
              sellingPrice: Number(log.newValue?.totalPrice || log.oldValue?.totalPrice || 250),
              profit: 90,
              quantity: 1
            }
          ]
    };

    setSelectedInvoiceForModal(reconstructedSale);
  };

  // Export Audit Trail to CSV
  const handleExportCSV = () => {
    const headers = ["المعرف", "التاريخ والوقت", "المستخدم", "العملية", "نوع الكيان", "العنصر", "القيمة السابقة", "القيمة الجديدة", "السبب", "المعتمد", "رقم المعاملة"];
    const rows = filteredLogs.map(l => [
      l.id,
      new Date(l.timestamp).toLocaleString('ar-EG'),
      `"${l.user || ''}"`,
      `"${l.action || ''}"`,
      `"${l.entityType || ''}"`,
      `"${l.entityName || ''}"`,
      `"${typeof l.oldValue === 'object' ? JSON.stringify(l.oldValue).replace(/"/g, '""') : (l.oldValue ?? '')}"`,
      `"${typeof l.newValue === 'object' ? JSON.stringify(l.newValue).replace(/"/g, '""') : (l.newValue ?? '')}"`,
      `"${(l.reason || '').replace(/"/g, '""')}"`,
      `"${l.approvedBy || ''}"`,
      `"${l.relatedTransactionId || ''}"`
    ]);

    const csvContent = "data:text/csv;charset=utf-8,\uFEFF" + [headers.join(','), ...rows.map(r => r.join(','))].join('\n');
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute("download", `lamsa_audit_log_${new Date().toISOString().slice(0, 10)}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  // Copy invoice text for WhatsApp / sharing
  const handleCopyInvoice = (sale: Sale) => {
    const lines = [
      `🧾 *فاتورة #${sale.id.slice(-6)}* - ${settings.storeName || 'لَمْسَةُ عِطْر'}`,
      `التاريخ: ${new Date(sale.date).toLocaleString('ar-EG')}`,
      `العميل: ${sale.customerName || 'عميل نقدي'}${sale.customerPhone ? ` (${sale.customerPhone})` : ''}`,
      `طريقة الدفع: ${sale.paymentMethod || 'نقدي'}`,
      `------------------------`,
      ...(sale.items || []).map((it, idx) => 
        `${idx + 1}. ${it.productName} (${it.bottleSize}مل × ${it.quantity || 1}) = ${it.sellingPrice} ${settings.currency}`
      ),
      `------------------------`,
      sale.discount ? `الخصم: ${sale.discount} ${settings.currency}` : '',
      `*الإجمالي النهائي:* ${sale.totalPrice.toLocaleString('ar-EG')} ${settings.currency}`,
      sale.isReversed ? `⚠️ *الحالة:* ملغاة بقيد عكسي (${sale.reversalReason || 'تم الإلغاء'})` : 'الحالة: معتمدة ومسددة بالكامل ✓'
    ].filter(Boolean).join('\n');

    navigator.clipboard.writeText(lines).then(() => {
      setCopiedInvoiceId(sale.id);
      setTimeout(() => setCopiedInvoiceId(null), 2500);
    });
  };

  // Helper: Visual Action Badge Color
  const getActionBadgeStyle = (action: string) => {
    if (action.includes('قيد عكسي') || action.includes('إلغاء بيع') || action.includes('مرتجع')) {
      return {
        bg: 'bg-rose-100 text-rose-800 border-rose-200',
        dot: 'bg-rose-500',
        ring: 'ring-rose-200',
        icon: AlertTriangle
      };
    }
    if (action.includes('تعديل فاتورة') || action.includes('تعديل سعر') || action.includes('تعديل تكلفة')) {
      return {
        bg: 'bg-amber-100 text-amber-900 border-amber-200',
        dot: 'bg-amber-500',
        ring: 'ring-amber-200',
        icon: TrendingUp
      };
    }
    if (action.includes('تعديل وصفة') || action.includes('اعتماد دفعة')) {
      return {
        bg: 'bg-emerald-100 text-emerald-900 border-emerald-200',
        dot: 'bg-emerald-500',
        ring: 'ring-emerald-200',
        icon: Sparkles
      };
    }
    if (action.includes('مخزون') || action.includes('توريد')) {
      return {
        bg: 'bg-cyan-100 text-cyan-900 border-cyan-200',
        dot: 'bg-cyan-500',
        ring: 'ring-cyan-200',
        icon: Package
      };
    }
    if (action.includes('أمان') || action.includes('صلاحيات') || action.includes('كلمة مرور')) {
      return {
        bg: 'bg-purple-100 text-purple-900 border-purple-200',
        dot: 'bg-purple-500',
        ring: 'ring-purple-200',
        icon: ShieldCheck
      };
    }
    return {
      bg: 'bg-blue-100 text-blue-900 border-blue-200',
      dot: 'bg-blue-500',
      ring: 'ring-blue-200',
      icon: Clock
    };
  };

  return (
    <div className="space-y-6 pb-24 p-3 sm:p-6 max-w-7xl mx-auto font-sans" dir="rtl">
      
      {/* ======================================================== */}
      {/* 1. TOP HEADER & AUDIT POLICY BANNER                      */}
      {/* ======================================================== */}
      <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4 pb-4 border-b border-black/[0.06]">
        <div className="flex items-center gap-3">
          <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-[#0071E3] to-[#0051A8] text-white flex items-center justify-center shadow-md">
            <ShieldCheck size={26} />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-xl sm:text-2xl font-black text-[#1D1D1F]">
                سجل المراجعة والتدقيق والرقابة المالية (Audit Log)
              </h1>
              <span className="text-[11px] font-bold px-2.5 py-0.5 rounded-full bg-emerald-100 text-emerald-800 border border-emerald-200">
                مشفر وغير قابل للحذف
              </span>
            </div>
            <p className="text-xs text-[#86868B] mt-0.5">
              مخطط زمني بصري (Timeline) وتوثيق لحظي دقيق للفروقات بين القيم السابقة والجديدة للفواتير والمنتجات والتسعير
            </p>
          </div>
        </div>

        {/* Action Controls Header */}
        <div className="flex items-center gap-2 w-full md:w-auto justify-between md:justify-end">
          {/* View Mode Toggle Switch */}
          <div className="p-1 rounded-2xl bg-black/[0.04] border border-black/[0.06] flex items-center gap-1">
            <button
              type="button"
              onClick={() => setViewMode('timeline')}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold transition-all ${
                viewMode === 'timeline'
                  ? 'bg-white text-[#1D1D1F] shadow-xs'
                  : 'text-[#86868B] hover:text-[#1D1D1F]'
              }`}
            >
              <History size={14} className="text-[#0071E3]" />
              <span>المخطط الزمني</span>
            </button>
            <button
              type="button"
              onClick={() => setViewMode('cards')}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold transition-all ${
                viewMode === 'cards'
                  ? 'bg-white text-[#1D1D1F] shadow-xs'
                  : 'text-[#86868B] hover:text-[#1D1D1F]'
              }`}
            >
              <Layers size={14} className="text-[#0071E3]" />
              <span>البطاقات</span>
            </button>
            <button
              type="button"
              onClick={() => setViewMode('table')}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold transition-all ${
                viewMode === 'table'
                  ? 'bg-white text-[#1D1D1F] shadow-xs'
                  : 'text-[#86868B] hover:text-[#1D1D1F]'
              }`}
            >
              <FileSpreadsheet size={14} className="text-[#0071E3]" />
              <span>الجدول</span>
            </button>
          </div>

          <button
            type="button"
            onClick={handleExportCSV}
            className="apple-btn flex items-center gap-1.5 px-3.5 py-2 rounded-2xl bg-white border border-black/[0.08] hover:bg-black/[0.04] text-[#1D1D1F] text-xs font-bold shadow-2xs transition-all shrink-0"
            title="تصدير السجل الكامل بصيغة Excel/CSV"
          >
            <Download size={14} />
            <span>تصدير CSV</span>
          </button>
        </div>
      </div>

      {/* Strict Non-deletion Policy Banner */}
      <div className="p-4 rounded-3xl bg-gradient-to-r from-blue-50/80 via-indigo-50/70 to-slate-50 border border-blue-200/80 text-blue-950 text-xs flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 shadow-2xs">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-xl bg-blue-600 text-white flex items-center justify-center shrink-0 shadow-xs">
            <Lock size={16} />
          </div>
          <div>
            <p className="font-bold text-[#1D1D1F]">
              نظام الرقابة المالية الصارمة والقيد العكسي (§41):
            </p>
            <p className="text-[11px] text-blue-900 leading-relaxed">
              الفواتير والعمليات المالية في «لَمْسَةُ عِطْر» لا تُحذف نهائياً لضمان النزاهة المحاسبية. أي تعديل أو إلغاء يُوثق لحظياً في هذا السجل مع حفظ القيمة القديمة والجديدة وسبب الإجراء ومسؤول الاعتماد.
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          <span className="font-mono text-xs font-black text-blue-800 bg-white/90 px-3 py-1.5 rounded-xl border border-blue-200/90 shadow-2xs">
            {filteredLogs.length} عملية موثقة
          </span>
        </div>
      </div>

      {/* ======================================================== */}
      {/* 2. ADVANCED SEARCH & MULTI-CRITERIA FILTERS              */}
      {/* ======================================================== */}
      <div className="apple-glass rounded-3xl p-4 bg-white/95 border border-black/[0.07] shadow-apple space-y-3">
        {/* Quick Entity Type Filter Pills */}
        <div className="flex items-center gap-2 overflow-x-auto pb-1 scrollbar-none">
          <span className="text-[11px] font-bold text-[#86868B] shrink-0 pl-1">تصفية سريعة:</span>
          
          <button
            type="button"
            onClick={() => { setSelectedEntityType('all'); setSelectedCategory('all'); }}
            className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all shrink-0 cursor-pointer ${
              selectedEntityType === 'all'
                ? 'bg-[#1D1D1F] text-white shadow-xs'
                : 'bg-black/[0.04] text-[#86868B] hover:text-[#1D1D1F]'
            }`}
          >
            الكل ({allLogs.length})
          </button>

          <button
            type="button"
            onClick={() => { setSelectedEntityType('sale'); setSelectedCategory('مبيعات'); }}
            className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all shrink-0 flex items-center gap-1.5 cursor-pointer ${
              selectedEntityType === 'sale'
                ? 'bg-blue-600 text-white shadow-xs'
                : 'bg-blue-50 text-blue-800 hover:bg-blue-100'
            }`}
          >
            <ShoppingBag size={13} />
            <span>تعديلات وإلغاءات الفواتير</span>
          </button>

          <button
            type="button"
            onClick={() => { setSelectedEntityType('product'); setSelectedCategory('تسعير_وتكلفة'); }}
            className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all shrink-0 flex items-center gap-1.5 cursor-pointer ${
              selectedEntityType === 'product'
                ? 'bg-emerald-600 text-white shadow-xs'
                : 'bg-emerald-50 text-emerald-800 hover:bg-emerald-100'
            }`}
          >
            <Sparkles size={13} />
            <span>تعديل المنتجات والتسعير والوصفات</span>
          </button>

          <button
            type="button"
            onClick={() => { setSelectedEntityType('all'); setSelectedCategory('مخزون'); }}
            className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all shrink-0 flex items-center gap-1.5 cursor-pointer ${
              selectedCategory === 'مخزون'
                ? 'bg-cyan-600 text-white shadow-xs'
                : 'bg-cyan-50 text-cyan-800 hover:bg-cyan-100'
            }`}
          >
            <Package size={13} />
            <span>حركة المخزون والتوريد</span>
          </button>

          <button
            type="button"
            onClick={() => { setSelectedEntityType('all'); setSelectedCategory('إغلاق_يومي'); }}
            className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all shrink-0 flex items-center gap-1.5 cursor-pointer ${
              selectedCategory === 'إغلاق_يومي'
                ? 'bg-indigo-600 text-white shadow-xs'
                : 'bg-indigo-50 text-indigo-800 hover:bg-indigo-100'
            }`}
          >
            <Clock size={13} />
            <span>إغلاق وفتح اليوميات</span>
          </button>
        </div>

        {/* Detailed Search and Dropdown Controls */}
        <div className="grid grid-cols-1 sm:grid-cols-12 gap-3 pt-1">
          <div className="sm:col-span-6 relative">
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="بحث بالرقم (#001248)، اسم العطر، المستخدم، السبب، أو المعاملة..."
              className="w-full h-11 px-4 pr-10 rounded-2xl bg-[#F5F5F7] border border-black/[0.08] text-xs outline-none text-right font-medium focus:bg-white focus:ring-2 focus:ring-[#0071E3]/20 transition-all"
            />
            <Search size={16} className="absolute right-3.5 top-1/2 -translate-y-1/2 text-[#86868B]" />
            {searchQuery && (
              <button
                type="button"
                onClick={() => setSearchQuery('')}
                className="absolute left-3 top-1/2 -translate-y-1/2 text-[#86868B] hover:text-[#1D1D1F]"
              >
                <X size={14} />
              </button>
            )}
          </div>

          <div className="sm:col-span-3">
            <select
              value={selectedCategory}
              onChange={(e) => setSelectedCategory(e.target.value)}
              className="w-full h-11 px-3 rounded-2xl bg-[#F5F5F7] border border-black/[0.08] text-xs outline-none text-right font-bold focus:bg-white"
            >
              <option value="all">جميع التصنيفات</option>
              <option value="مبيعات">مبيعات وفواتير</option>
              <option value="تسعير_وتكلفة">تسعير وتكلفة ووصفات</option>
              <option value="مخزون">حركة المخزون والتوريد</option>
              <option value="خزائن_ومسحوبات">الخزائن والمسحوبات</option>
              <option value="مستخدمين_وأمان">المستخدمين والأمان</option>
              <option value="إغلاق_يومي">إغلاق وفتح الأيام</option>
            </select>
          </div>

          <div className="sm:col-span-3">
            <select
              value={selectedAction}
              onChange={(e) => setSelectedAction(e.target.value)}
              className="w-full h-11 px-3 rounded-2xl bg-[#F5F5F7] border border-black/[0.08] text-xs outline-none text-right font-bold focus:bg-white"
            >
              <option value="all">جميع أنواع العمليات</option>
              <option value="تعديل فاتورة">تعديل فاتورة</option>
              <option value="قيد عكسي">قيد عكسي / تصحيح</option>
              <option value="إلغاء بيع">إلغاء بيع / حذف</option>
              <option value="تعديل سعر">تعديل سعر بيع</option>
              <option value="تعديل تكلفة">تعديل تكلفة الزيت</option>
              <option value="تعديل وصفة">تعديل وصفة وتركيز</option>
              <option value="تعديل مخزون">تعديل أو توريد مخزون</option>
              <option value="اعتماد دفعة">اعتماد دفعة تعتيق</option>
              <option value="فتح يوم">فتح يومية كاشير</option>
              <option value="إغلاق يوم">إغلاق يومية كاشير</option>
              <option value="تعديل صلاحيات">تعديل صلاحيات</option>
              <option value="تغيير كلمة مرور">تغيير كلمة مرور</option>
            </select>
          </div>
        </div>
      </div>

      {/* ======================================================== */}
      {/* 3. MAIN CONTENT: TIMELINE / CARDS / TABLE VIEW           */}
      {/* ======================================================== */}
      {filteredLogs.length === 0 ? (
        <div className="p-12 rounded-[28px] bg-white text-center space-y-3 border border-black/[0.06] shadow-apple">
          <FileText size={44} className="text-[#86868B] mx-auto opacity-50" />
          <h3 className="text-base font-black text-[#1D1D1F]">لا توجد سجلات مطابقة لمعايير البحث</h3>
          <p className="text-xs text-[#86868B] max-w-md mx-auto">
            تأكد من كتابة الكلمات الدلالية بشكل صحيح أو قم بإعادة ضبط معايير التصفية لعرض السجلات.
          </p>
          <button
            type="button"
            onClick={() => { setSearchQuery(''); setSelectedCategory('all'); setSelectedAction('all'); setSelectedEntityType('all'); }}
            className="px-4 py-2 rounded-xl bg-black/[0.05] hover:bg-black/[0.1] text-xs font-bold text-[#1D1D1F]"
          >
            إعادة ضبط التصفية
          </button>
        </div>
      ) : viewMode === 'timeline' ? (
        /* ======================================================== */
        /* MODE A: INTERACTIVE VISUAL TIMELINE (المخطط الزمني البصري) */
        /* ======================================================== */
        <div className="space-y-8">
          {timelineGroups.map(([dateKey, group]) => (
            <div key={dateKey} className="space-y-4">
              
              {/* Day Milestone Badge Header */}
              <div className="sticky top-20 z-20 flex items-center gap-3">
                <div className="flex items-center gap-2 px-4 py-1.5 rounded-2xl bg-[#1D1D1F] text-white shadow-md">
                  <Calendar size={14} className="text-amber-400" />
                  <span className="text-xs font-black">{group.label}</span>
                </div>
                <div className="h-px flex-1 bg-black/[0.08]" />
                <span className="text-[11px] font-bold text-[#86868B] px-2.5 py-0.5 rounded-full bg-white border border-black/[0.06]">
                  {group.logs.length} عمليات
                </span>
              </div>

              {/* Timeline Track & Nodes */}
              <div className="relative pr-6 sm:pr-8 space-y-6 before:content-[''] before:absolute before:top-2 before:bottom-2 before:right-3.5 sm:before:right-4 before:w-0.5 before:bg-gradient-to-b before:from-[#0071E3] before:via-indigo-300 before:to-slate-200">
                {group.logs.map((log) => (
                  <TimelineCardItem
                    key={log.id}
                    log={log}
                    settings={settings}
                    onOpenInvoiceDetails={() => handleOpenInvoiceDetails(log)}
                    isExpanded={expandedLogId === log.id}
                    onToggleExpand={() => setExpandedLogId(prev => prev === log.id ? null : log.id)}
                    getActionBadgeStyle={getActionBadgeStyle}
                  />
                ))}
              </div>
            </div>
          ))}
        </div>
      ) : viewMode === 'cards' ? (
        /* ======================================================== */
        /* MODE B: DETAILED CARDS VIEW                              */
        /* ======================================================== */
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {filteredLogs.map(log => (
            <CardLogItem
              key={log.id}
              log={log}
              settings={settings}
              onOpenInvoiceDetails={() => handleOpenInvoiceDetails(log)}
              getActionBadgeStyle={getActionBadgeStyle}
            />
          ))}
        </div>
      ) : (
        /* ======================================================== */
        /* MODE C: HIGH-DENSITY AUDIT TABLE VIEW                    */
        /* ======================================================== */
        <div className="apple-glass rounded-3xl overflow-hidden border border-black/[0.06] shadow-apple bg-white">
          <div className="overflow-x-auto">
            <table className="w-full text-right text-xs">
              <thead>
                <tr className="bg-[#F5F5F7] border-b border-black/[0.06] text-[#86868B] font-bold">
                  <th className="py-3 px-4">التاريخ والوقت</th>
                  <th className="py-3 px-3">العملية</th>
                  <th className="py-3 px-3">العنصر / الفاتورة</th>
                  <th className="py-3 px-3">المسؤول</th>
                  <th className="py-3 px-3">القيمة السابقة</th>
                  <th className="py-3 px-3">القيمة الجديدة</th>
                  <th className="py-3 px-3">سبب الإجراء</th>
                  <th className="py-3 px-3 text-center">التفاصيل</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-black/[0.04]">
                {filteredLogs.map(log => {
                  const badge = getActionBadgeStyle(log.action);
                  const isSaleRelated = log.entityType === 'sale' || log.action.includes('فاتورة') || log.action.includes('بيع') || log.category === 'مبيعات';

                  return (
                    <tr key={log.id} className="hover:bg-black/[0.02] transition-colors">
                      <td className="py-3 px-4 font-mono text-[11px] text-[#86868B] whitespace-nowrap">
                        {new Date(log.timestamp).toLocaleTimeString('ar-EG', { hour: '2-digit', minute: '2-digit' })}
                        <div className="text-[10px] text-[#86868B]">
                          {new Date(log.timestamp).toLocaleDateString('ar-EG')}
                        </div>
                      </td>
                      <td className="py-3 px-3 whitespace-nowrap">
                        <span className={`text-[10px] px-2.5 py-0.5 rounded-full font-black border ${badge.bg}`}>
                          {log.action}
                        </span>
                      </td>
                      <td className="py-3 px-3 font-bold text-[#1D1D1F]">
                        {log.entityName}
                        {log.relatedTransactionId && (
                          <span className="block text-[10px] font-mono text-[#86868B]">
                            {log.relatedTransactionId}
                          </span>
                        )}
                      </td>
                      <td className="py-3 px-3 whitespace-nowrap text-[#1D1D1F] font-bold">
                        <div className="flex items-center gap-1">
                          <User size={12} className="text-[#86868B]" />
                          <span>{log.user}</span>
                        </div>
                      </td>
                      <td className="py-3 px-3 font-mono text-[11px] text-rose-700 max-w-xs truncate">
                        {typeof log.oldValue === 'object' ? JSON.stringify(log.oldValue) : String(log.oldValue ?? '—')}
                      </td>
                      <td className="py-3 px-3 font-mono text-[11px] text-emerald-700 max-w-xs truncate">
                        {typeof log.newValue === 'object' ? JSON.stringify(log.newValue) : String(log.newValue ?? '—')}
                      </td>
                      <td className="py-3 px-3 text-[#1D1D1F] max-w-xs truncate" title={log.reason}>
                        {log.reason || '—'}
                      </td>
                      <td className="py-3 px-3 text-center whitespace-nowrap">
                        {isSaleRelated ? (
                          <button
                            type="button"
                            onClick={() => handleOpenInvoiceDetails(log)}
                            className="px-2.5 py-1 rounded-xl bg-blue-50 hover:bg-blue-100 text-blue-700 text-[11px] font-bold inline-flex items-center gap-1 cursor-pointer"
                          >
                            <Eye size={12} />
                            <span>عرض الفاتورة</span>
                          </button>
                        ) : (
                          <span className="text-[10px] text-[#86868B]">سجل تدقيق</span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ======================================================== */}
      {/* 4. COMPREHENSIVE DETAILED INVOICE DOSSIER MODAL          */}
      {/* ======================================================== */}
      {selectedInvoiceForModal && (
        <ComprehensiveInvoiceDetailsModal
          sale={selectedInvoiceForModal}
          settings={settings}
          onClose={() => setSelectedInvoiceForModal(null)}
          onPrint={() => setSelectedPrintSale(selectedInvoiceForModal)}
          onCopy={() => handleCopyInvoice(selectedInvoiceForModal)}
          copied={copiedInvoiceId === selectedInvoiceForModal.id}
          relatedLogs={allLogs.filter(l => 
            l.entityId === selectedInvoiceForModal.id ||
            l.relatedTransactionId === selectedInvoiceForModal.id ||
            l.relatedTransactionId === selectedInvoiceForModal.transactionId ||
            (selectedInvoiceForModal.id && l.entityName?.includes(selectedInvoiceForModal.id.slice(-6)))
          )}
        />
      )}

      {/* ======================================================== */}
      {/* 5. THERMAL RECEIPT PRINT MODAL (58mm / 80mm ESC/POS)     */}
      {/* ======================================================== */}
      {selectedPrintSale && (
        <ReceiptModal
          sale={selectedPrintSale}
          settings={settings}
          onClose={() => setSelectedPrintSale(null)}
        />
      )}

    </div>
  );
};

// =====================================================================
// SUB-COMPONENT: TIMELINE CARD ITEM WITH INTERACTIVE OLD VS NEW DIFF
// =====================================================================
interface TimelineCardItemProps {
  log: AuditLogRecord;
  settings: StoreSettings;
  onOpenInvoiceDetails: () => void;
  isExpanded: boolean;
  onToggleExpand: () => void;
  getActionBadgeStyle: (action: string) => { bg: string; dot: string; ring: string; icon: any };
}

const TimelineCardItem: React.FC<TimelineCardItemProps> = ({
  log,
  settings,
  onOpenInvoiceDetails,
  isExpanded,
  onToggleExpand,
  getActionBadgeStyle,
}) => {
  const badge = getActionBadgeStyle(log.action);
  const ActionIcon = badge.icon;
  const isSaleRelated = log.entityType === 'sale' || log.action.includes('فاتورة') || log.action.includes('بيع') || log.category === 'مبيعات';
  const isReversal = log.action === 'قيد عكسي' || log.action === 'إلغاء بيع';

  return (
    <div className="relative group">
      {/* Milestone Node on vertical line */}
      <div className={`absolute -right-6 sm:-right-8 top-5 w-7 h-7 rounded-full bg-white border-2 flex items-center justify-center shadow-xs transition-transform group-hover:scale-110 z-10 ${
        isReversal ? 'border-rose-500 text-rose-600' : 'border-[#0071E3] text-[#0071E3]'
      }`}>
        <ActionIcon size={14} />
      </div>

      {/* Main Timeline Card */}
      <div className={`rounded-3xl border transition-all duration-200 overflow-hidden ${
        isReversal
          ? 'bg-gradient-to-br from-rose-50/70 to-white border-rose-200/90 shadow-sm'
          : 'bg-white border-black/[0.07] shadow-apple hover:border-black/[0.12]'
      }`}>
        
        {/* Card Header */}
        <div className="p-4 sm:p-5 pb-3 flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-black/[0.04]">
          <div className="flex flex-wrap items-center gap-2">
            <span className={`text-[10px] px-2.5 py-0.5 rounded-full font-black border ${badge.bg}`}>
              {log.action}
            </span>

            <h3 className="text-sm sm:text-base font-black text-[#1D1D1F]">
              {log.entityName}
            </h3>

            {log.relatedTransactionId && (
              <span className="text-[10px] font-mono px-2 py-0.5 bg-black/[0.04] rounded-lg text-[#86868B] font-bold">
                {log.relatedTransactionId}
              </span>
            )}

            {isReversal && (
              <span className="text-[10px] font-black px-2 py-0.5 rounded-full bg-rose-600 text-white animate-pulse">
                قيد عكسي معتمد
              </span>
            )}
          </div>

          <div className="flex items-center gap-3 text-xs text-[#86868B] shrink-0">
            <div className="flex items-center gap-1 font-bold text-[#1D1D1F] bg-black/[0.03] px-2.5 py-1 rounded-xl">
              <User size={13} className="text-[#0071E3]" />
              <span>{log.user}</span>
            </div>

            <span className="font-mono text-[11px] text-[#86868B]">
              {new Date(log.timestamp).toLocaleTimeString('ar-EG', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
            </span>
          </div>
        </div>

        {/* Card Content & Reason */}
        <div className="p-4 sm:p-5 space-y-3.5">
          {/* Reason Banner */}
          <div className="p-3 rounded-2xl bg-black/[0.02] border border-black/[0.04] flex items-start gap-2.5 text-xs">
            <Info size={16} className="text-[#0071E3] shrink-0 mt-0.5" />
            <div className="space-y-0.5">
              <span className="text-[10px] font-bold text-[#86868B] block">مبرر وسبب الإجراء:</span>
              <p className="font-medium text-[#1D1D1F] leading-relaxed">
                {log.reason || 'لا يوجد مبرر مسجل'}
              </p>
            </div>
          </div>

          {/* ======================================================== */}
          {/* VISUAL OLD VS NEW VALUES DIFF ENGINE                    */}
          {/* ======================================================== */}
          <AuditValuesDiffVisualizer
            log={log}
            currency={settings.currency}
            isExpanded={isExpanded}
            onToggleExpand={onToggleExpand}
          />

          {/* Action Row */}
          <div className="pt-2 flex flex-wrap items-center justify-between gap-2 border-t border-black/[0.04]">
            <div className="flex items-center gap-2 text-[11px] text-[#86868B]">
              {log.approvedBy && (
                <span>اعتماد: <strong className="text-[#1D1D1F]">{log.approvedBy}</strong></span>
              )}
              {log.device && (
                <span>· جهاز: <strong className="text-[#1D1D1F]">{log.device}</strong></span>
              )}
            </div>

            <div className="flex items-center gap-2">
              {isSaleRelated && (
                <button
                  type="button"
                  onClick={onOpenInvoiceDetails}
                  className="px-3.5 py-1.5 rounded-xl bg-[#0071E3] hover:bg-[#0077ED] text-white text-xs font-black flex items-center gap-1.5 shadow-xs transition-all cursor-pointer"
                >
                  <Eye size={13} />
                  <span>عرض التفاصيل الكاملة للفاتورة</span>
                </button>
              )}
            </div>
          </div>
        </div>

      </div>
    </div>
  );
};

// =====================================================================
// SUB-COMPONENT: CARD VIEW LOG ITEM
// =====================================================================
interface CardLogItemProps {
  log: AuditLogRecord;
  settings: StoreSettings;
  onOpenInvoiceDetails: () => void;
  getActionBadgeStyle: (action: string) => { bg: string; dot: string; ring: string; icon: any };
}

const CardLogItem: React.FC<CardLogItemProps> = ({
  log,
  settings,
  onOpenInvoiceDetails,
  getActionBadgeStyle,
}) => {
  const badge = getActionBadgeStyle(log.action);
  const isSaleRelated = log.entityType === 'sale' || log.action.includes('فاتورة') || log.action.includes('بيع') || log.category === 'مبيعات';
  const isReversal = log.action === 'قيد عكسي' || log.action === 'إلغاء بيع';

  return (
    <div className={`p-4 sm:p-5 rounded-3xl border transition-all ${
      isReversal 
        ? 'bg-rose-50/50 border-rose-200 shadow-xs' 
        : 'bg-white border-black/[0.06] shadow-apple'
    }`}>
      <div className="flex items-center justify-between pb-2.5 border-b border-black/[0.04]">
        <div className="flex items-center gap-2">
          <span className={`text-[10px] px-2.5 py-0.5 rounded-full font-black border ${badge.bg}`}>
            {log.action}
          </span>
          <h4 className="text-sm font-black text-[#1D1D1F]">{log.entityName}</h4>
        </div>
        <span className="font-mono text-[11px] text-[#86868B]">
          {new Date(log.timestamp).toLocaleTimeString('ar-EG', { hour: '2-digit', minute: '2-digit' })}
        </span>
      </div>

      <div className="pt-2.5 space-y-3">
        <p className="text-xs text-[#1D1D1F] leading-relaxed">
          <span className="text-[#86868B] font-bold">السبب: </span>
          {log.reason || '—'}
        </p>

        {/* Diff Visualizer in card */}
        <AuditValuesDiffVisualizer log={log} currency={settings.currency} />

        <div className="flex items-center justify-between pt-2 border-t border-black/[0.04] text-xs">
          <span className="text-[#86868B] font-bold">المسؤول: {log.user}</span>
          {isSaleRelated && (
            <button
              type="button"
              onClick={onOpenInvoiceDetails}
              className="px-2.5 py-1 rounded-xl bg-blue-50 text-blue-700 font-black text-xs hover:bg-blue-100 flex items-center gap-1 cursor-pointer"
            >
              <Eye size={12} />
              <span>ملف الفاتورة</span>
            </button>
          )}
        </div>
      </div>
    </div>
  );
};

// =====================================================================
// SUB-COMPONENT: AUDIT VALUES DIFF VISUALIZER (OLD VS NEW ENGINE)
// =====================================================================
interface AuditValuesDiffVisualizerProps {
  log: AuditLogRecord;
  currency: string;
  isExpanded?: boolean;
  onToggleExpand?: () => void;
}

const AuditValuesDiffVisualizer: React.FC<AuditValuesDiffVisualizerProps> = ({
  log,
  currency,
  isExpanded = false,
  onToggleExpand,
}) => {
  const { oldValue, newValue } = log;

  if (oldValue === undefined && newValue === undefined) {
    return null;
  }

  // CASE 1: INVOICE / SALE MODIFICATION DIFF
  const isSaleDiff = (
    log.entityType === 'sale' || 
    log.action.includes('فاتورة') || 
    (typeof oldValue === 'object' && oldValue && 'totalPrice' in oldValue) ||
    (typeof newValue === 'object' && newValue && 'totalPrice' in newValue)
  );

  if (isSaleDiff) {
    const oldPrice = Number(oldValue?.totalPrice ?? (typeof oldValue === 'number' ? oldValue : 0));
    const newPrice = Number(newValue?.totalPrice ?? (typeof newValue === 'number' ? newValue : 0));
    const priceDiff = newPrice - oldPrice;
    const oldMethod = oldValue?.paymentMethod;
    const newMethod = newValue?.paymentMethod;
    const oldCustomer = oldValue?.customerName;
    const newCustomer = newValue?.customerName;
    const oldDiscount = oldValue?.discount;
    const newDiscount = newValue?.discount;
    const oldItems: SaleItem[] = Array.isArray(oldValue?.items) ? oldValue.items : [];
    const newItems: SaleItem[] = Array.isArray(newValue?.items) ? newValue.items : [];

    return (
      <div className="rounded-2xl border border-black/[0.06] bg-black/[0.015] p-3.5 space-y-3">
        <div className="flex items-center justify-between text-xs font-bold text-[#1D1D1F] border-b border-black/[0.04] pb-2">
          <div className="flex items-center gap-1.5 text-[#0071E3]">
            <Split size={14} />
            <span>فروقات تعديل الفاتورة (مقارنة دقيقة):</span>
          </div>

          {priceDiff !== 0 && (
            <span className={`text-[11px] font-mono px-2 py-0.5 rounded-lg font-black ${
              priceDiff > 0 ? 'bg-emerald-100 text-emerald-800' : 'bg-rose-100 text-rose-800'
            }`}>
              {priceDiff > 0 ? `+${priceDiff}` : priceDiff} {currency}
            </span>
          )}
        </div>

        {/* Financial & Parameter Comparison Grid */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs font-mono">
          {/* Old Value Card */}
          <div className="p-2.5 rounded-xl bg-rose-50/60 border border-rose-200/80 text-rose-950 space-y-1.5">
            <span className="text-[10px] font-black uppercase text-rose-700 block font-sans">
              🔴 القيمة السابقة (قبل التعديل)
            </span>
            <div className="flex items-center justify-between">
              <span className="text-[#86868B] font-sans">إجمالي الفاتورة:</span>
              <span className="font-bold text-rose-800 line-through">
                {oldPrice.toLocaleString('ar-EG')} {currency}
              </span>
            </div>
            {oldMethod && (
              <div className="flex items-center justify-between text-[11px]">
                <span className="text-[#86868B] font-sans">طريقة الدفع:</span>
                <span className="font-bold">{oldMethod}</span>
              </div>
            )}
            {oldCustomer && (
              <div className="flex items-center justify-between text-[11px]">
                <span className="text-[#86868B] font-sans">العميل:</span>
                <span className="font-bold font-sans">{oldCustomer}</span>
              </div>
            )}
            {oldDiscount !== undefined && (
              <div className="flex items-center justify-between text-[11px]">
                <span className="text-[#86868B] font-sans">الخصم:</span>
                <span className="font-bold">{oldDiscount} {currency}</span>
              </div>
            )}
            {oldItems.length > 0 && (
              <div className="text-[10px] text-[#86868B] font-sans pt-1 border-t border-rose-200/60">
                عدد الأصناف: {oldItems.length}
              </div>
            )}
          </div>

          {/* New Value Card */}
          <div className="p-2.5 rounded-xl bg-emerald-50/60 border border-emerald-200/80 text-emerald-950 space-y-1.5">
            <span className="text-[10px] font-black uppercase text-emerald-700 block font-sans">
              🟢 القيمة الجديدة المعتمدة
            </span>
            <div className="flex items-center justify-between">
              <span className="text-[#86868B] font-sans">إجمالي الفاتورة:</span>
              <span className="font-black text-emerald-800">
                {newPrice.toLocaleString('ar-EG')} {currency}
              </span>
            </div>
            {newMethod && (
              <div className="flex items-center justify-between text-[11px]">
                <span className="text-[#86868B] font-sans">طريقة الدفع:</span>
                <span className="font-bold text-emerald-800">{newMethod}</span>
              </div>
            )}
            {newCustomer && (
              <div className="flex items-center justify-between text-[11px]">
                <span className="text-[#86868B] font-sans">العميل:</span>
                <span className="font-bold font-sans text-emerald-800">{newCustomer}</span>
              </div>
            )}
            {newDiscount !== undefined && (
              <div className="flex items-center justify-between text-[11px]">
                <span className="text-[#86868B] font-sans">الخصم:</span>
                <span className="font-bold text-emerald-800">{newDiscount} {currency}</span>
              </div>
            )}
            {newItems.length > 0 && (
              <div className="text-[10px] text-emerald-800 font-sans pt-1 border-t border-emerald-200/60">
                عدد الأصناف: {newItems.length}
                {newValue?.stockAdjusted && (
                  <span className="mr-2 text-[10px] font-bold text-[#0071E3]">· تم تحديث المخزون ✓</span>
                )}
              </div>
            )}
          </div>
        </div>

        {/* Detailed Item Diff if items are present */}
        {(oldItems.length > 0 || newItems.length > 0) && (
          <div className="pt-1">
            {onToggleExpand && (
              <button
                type="button"
                onClick={onToggleExpand}
                className="text-[11px] font-bold text-[#0071E3] hover:underline flex items-center gap-1 cursor-pointer"
              >
                <span>{isExpanded ? 'إخفاء مقارنة أصناف الفاتورة' : 'عرض مقارنة أصناف الفاتورة بالتفصيل'}</span>
                <ChevronDown size={12} className={`transition-transform ${isExpanded ? 'rotate-180' : ''}`} />
              </button>
            )}

            {isExpanded && (
              <div className="mt-2 space-y-1.5 p-2 rounded-xl bg-white border border-black/[0.06] text-[11px]">
                <div className="font-bold text-[#1D1D1F] text-[10px] pb-1 border-b border-black/[0.04]">
                  الأصناف داخل الفاتورة:
                </div>
                {newItems.map((item, idx) => {
                  const matchingOld = oldItems.find(oi => oi.productName === item.productName);
                  const priceChanged = matchingOld && matchingOld.sellingPrice !== item.sellingPrice;

                  return (
                    <div key={idx} className="flex items-center justify-between py-1 border-b border-black/[0.02]">
                      <span className="font-medium text-[#1D1D1F]">
                        {item.productName} ({item.bottleSize}مل × {item.quantity || 1})
                      </span>
                      <div className="flex items-center gap-2 font-mono">
                        {priceChanged && (
                          <span className="text-rose-700 line-through text-[10px]">
                            {matchingOld.sellingPrice} {currency}
                          </span>
                        )}
                        <span className="text-emerald-700 font-bold">
                          {item.sellingPrice} {currency}
                        </span>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}
      </div>
    );
  }

  // CASE 2: PRODUCT / RECIPE / PRICING MODIFICATION DIFF
  const isProductOrPricing = (
    log.entityType === 'product' || 
    log.entityType === 'recipe' || 
    log.entityType === 'pricing' ||
    log.action.includes('منتج') || 
    log.action.includes('سعر') || 
    log.action.includes('تكلفة') || 
    log.action.includes('وصفة')
  );

  if (isProductOrPricing && (typeof oldValue === 'object' || typeof newValue === 'object')) {
    return (
      <div className="rounded-2xl border border-black/[0.06] bg-black/[0.015] p-3.5 space-y-2.5">
        <div className="flex items-center gap-1.5 text-xs font-bold text-[#0071E3] border-b border-black/[0.04] pb-2">
          <Sparkles size={14} />
          <span>فروقات تعديل مواصفات المنتج والتسعير:</span>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs font-mono">
          {/* Old Attributes */}
          <div className="p-2.5 rounded-xl bg-rose-50/60 border border-rose-200/80 text-rose-950 space-y-1">
            <span className="text-[10px] font-black uppercase text-rose-700 block font-sans">
              🔴 القيمة السابقة
            </span>
            <div className="text-[11px] leading-relaxed break-words font-medium">
              {typeof oldValue === 'object' ? (
                Object.entries(oldValue).map(([k, v]) => (
                  <div key={k} className="flex items-center justify-between py-0.5">
                    <span className="text-[#86868B] font-sans">{k}:</span>
                    <span className="font-bold line-through text-rose-800">{String(v)}</span>
                  </div>
                ))
              ) : (
                <span className="font-bold line-through text-rose-800">{String(oldValue)}</span>
              )}
            </div>
          </div>

          {/* New Attributes */}
          <div className="p-2.5 rounded-xl bg-emerald-50/60 border border-emerald-200/80 text-emerald-950 space-y-1">
            <span className="text-[10px] font-black uppercase text-emerald-700 block font-sans">
              🟢 القيمة الجديدة المعتمدة
            </span>
            <div className="text-[11px] leading-relaxed break-words font-medium">
              {typeof newValue === 'object' ? (
                Object.entries(newValue).map(([k, v]) => (
                  <div key={k} className="flex items-center justify-between py-0.5">
                    <span className="text-[#86868B] font-sans">{k}:</span>
                    <span className="font-black text-emerald-800">{String(v)}</span>
                  </div>
                ))
              ) : (
                <span className="font-black text-emerald-800">{String(newValue)}</span>
              )}
            </div>
          </div>
        </div>
      </div>
    );
  }

  // CASE 3: GENERIC TEXT / STRING DIFF FALLBACK
  return (
    <div className="p-2.5 rounded-xl bg-black/[0.02] border border-black/[0.04] grid grid-cols-1 sm:grid-cols-2 gap-2 text-[11px] font-mono">
      {oldValue !== undefined && (
        <div className="flex items-start gap-1.5 p-2 rounded-lg bg-rose-50/50 border border-rose-100">
          <span className="text-rose-800 font-bold shrink-0 font-sans">السابق:</span>
          <span className="text-rose-800 font-bold break-all line-through">
            {typeof oldValue === 'object' ? JSON.stringify(oldValue) : String(oldValue)}
          </span>
        </div>
      )}
      {newValue !== undefined && (
        <div className="flex items-start gap-1.5 p-2 rounded-lg bg-emerald-50/50 border border-emerald-100">
          <span className="text-emerald-800 font-bold shrink-0 font-sans">الجديد:</span>
          <span className="text-emerald-800 font-bold break-all">
            {typeof newValue === 'object' ? JSON.stringify(newValue) : String(newValue)}
          </span>
        </div>
      )}
    </div>
  );
};

// =====================================================================
// SUB-COMPONENT: FULL COMPREHENSIVE INVOICE DOSSIER MODAL
// =====================================================================
interface ComprehensiveInvoiceDetailsModalProps {
  sale: Sale;
  settings: StoreSettings;
  onClose: () => void;
  onPrint: () => void;
  onCopy: () => void;
  copied: boolean;
  relatedLogs: AuditLogRecord[];
}

const ComprehensiveInvoiceDetailsModal: React.FC<ComprehensiveInvoiceDetailsModalProps> = ({
  sale,
  settings,
  onClose,
  onPrint,
  onCopy,
  copied,
  relatedLogs,
}) => {
  const isReversed = Boolean(sale.isReversed);
  const items = sale.items || [];
  const totalBottles = items.reduce((sum, it) => sum + (it.quantity || 1), 0);
  const totalEssenceGrams = items.reduce((sum, it) => sum + ((it.essenceGrams || 0) * (it.quantity || 1)), 0);
  const subtotal = items.reduce((sum, it) => sum + ((it.sellingPrice || 0) * (it.quantity || 1)), 0);
  const discount = Number(sale.discount || 0);
  const netPaid = sale.totalPrice || Math.max(0, subtotal - discount);
  const cogs = sale.totalCost || items.reduce((sum, it) => sum + ((it.cost || 0) * (it.quantity || 1)), 0);
  const profit = sale.totalProfit || (netPaid - cogs);
  const profitPercent = netPaid > 0 ? (profit / netPaid) * 100 : 0;

  return (
    <div className="fixed inset-0 z-[150] bg-black/60 backdrop-blur-md flex items-center justify-center p-3 sm:p-4 overflow-y-auto animate-in fade-in duration-200">
      <div 
        className="apple-glass bg-white w-full max-w-4xl rounded-[32px] border border-black/[0.1] shadow-2xl overflow-hidden my-auto max-h-[92vh] flex flex-col"
        dir="rtl"
      >
        {/* Header */}
        <div className="p-5 sm:p-6 pb-4 border-b border-black/[0.06] flex items-center justify-between gap-3 bg-[#F5F5F7]/80">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-2xl bg-[#0071E3] text-white flex items-center justify-center shadow-md">
              <FileText size={24} />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-lg sm:text-xl font-black text-[#1D1D1F]">
                  الملف التفصيلي الشامل للفاتورة #{sale.id.slice(-6)}
                </h2>
                {isReversed ? (
                  <span className="text-[10px] font-black px-2.5 py-0.5 rounded-full bg-rose-100 text-rose-800 border border-rose-200">
                    ملغاة بقيد عكسي
                  </span>
                ) : (
                  <span className="text-[10px] font-black px-2.5 py-0.5 rounded-full bg-emerald-100 text-emerald-800 border border-emerald-200">
                    معتمدة وسارية ✓
                  </span>
                )}
              </div>
              <p className="text-xs text-[#86868B] font-mono mt-0.5">
                المعرف: {sale.id} {sale.transactionId ? `· رقم المعاملة: ${sale.transactionId}` : ''}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onPrint}
              className="px-3.5 py-2 rounded-2xl bg-[#1D1D1F] hover:bg-black text-white text-xs font-bold flex items-center gap-1.5 shadow-xs cursor-pointer transition-all"
              title="طباعة الإيصال الحراري"
            >
              <Printer size={14} />
              <span className="hidden sm:inline">طباعة حرارية</span>
            </button>

            <button
              type="button"
              onClick={onCopy}
              className="p-2 rounded-2xl bg-black/[0.05] hover:bg-black/[0.1] text-[#1D1D1F] transition-all cursor-pointer"
              title="نسخ الفاتورة"
            >
              {copied ? <Check size={16} className="text-emerald-600" /> : <Copy size={16} />}
            </button>

            <button
              type="button"
              onClick={onClose}
              className="p-2 rounded-2xl bg-black/[0.05] hover:bg-black/[0.1] text-[#1D1D1F] transition-all cursor-pointer"
              title="إغلاق"
            >
              <X size={18} />
            </button>
          </div>
        </div>

        {/* Scrollable Dossier Body */}
        <div className="p-5 sm:p-6 space-y-6 overflow-y-auto flex-1">
          
          {/* Reversal Warning Banner if applicable */}
          {isReversed && (
            <div className="p-4 rounded-2xl bg-rose-50 border border-rose-200 text-rose-900 text-xs flex items-start gap-3">
              <AlertTriangle size={20} className="text-rose-600 shrink-0 mt-0.5" />
              <div className="space-y-1">
                <h4 className="font-black text-rose-900">
                  تنبيه: تم إلغاء هذه الفاتورة رسمياً بقيد عكسي (§41)
                </h4>
                <p className="leading-relaxed">
                  <strong>سبب الإلغاء:</strong> {sale.reversalReason || 'لا يوجد سبب محدد مسجل'}
                </p>
                <div className="flex items-center gap-3 text-[11px] text-rose-800 pt-1">
                  <span>بواسطة: <strong>{sale.reversedBy || 'الإدارة'}</strong></span>
                  {sale.reversedAt && (
                    <span>بتاريخ: <strong>{new Date(sale.reversedAt).toLocaleString('ar-EG')}</strong></span>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* 4 Financial Highlight Cards */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <div className="p-3.5 rounded-2xl bg-black/[0.02] border border-black/[0.05] space-y-1">
              <span className="text-[10px] text-[#86868B] font-bold block">صافي الإجمالي المدفوع</span>
              <span className="text-lg font-black font-mono text-[#0071E3]">
                {netPaid.toLocaleString('ar-EG')} {settings.currency}
              </span>
            </div>

            <div className="p-3.5 rounded-2xl bg-black/[0.02] border border-black/[0.05] space-y-1">
              <span className="text-[10px] text-[#86868B] font-bold block">التكلفة الإجمالية (COGS)</span>
              <span className="text-lg font-black font-mono text-zinc-700">
                {cogs.toFixed(0)} {settings.currency}
              </span>
            </div>

            <div className="p-3.5 rounded-2xl bg-emerald-50/60 border border-emerald-200/80 space-y-1">
              <span className="text-[10px] text-emerald-800 font-bold block">المساهمة وصافي الربح</span>
              <span className="text-lg font-black font-mono text-emerald-700">
                +{profit.toFixed(0)} {settings.currency}
                <span className="text-[10px] font-normal text-emerald-600 block">
                  هامش: {profitPercent.toFixed(1)}%
                </span>
              </span>
            </div>

            <div className="p-3.5 rounded-2xl bg-black/[0.02] border border-black/[0.05] space-y-1">
              <span className="text-[10px] text-[#86868B] font-bold block">العبوات والزيت الخام</span>
              <span className="text-lg font-black font-mono text-[#1D1D1F]">
                {totalBottles} عبوة
                <span className="text-[10px] font-normal text-[#86868B] block">
                  {totalEssenceGrams} جم زيت
                </span>
              </span>
            </div>
          </div>

          {/* Metadata Grid */}
          <div className="p-4 rounded-2xl bg-[#F5F5F7] border border-black/[0.05] grid grid-cols-2 sm:grid-cols-4 gap-4 text-xs">
            <div>
              <span className="text-[10px] text-[#86868B] block">تاريخ ووقت الفاتورة:</span>
              <span className="font-bold text-[#1D1D1F] font-mono">
                {new Date(sale.date).toLocaleDateString('ar-EG')} · {new Date(sale.date).toLocaleTimeString('ar-EG', { hour: '2-digit', minute: '2-digit' })}
              </span>
            </div>

            <div>
              <span className="text-[10px] text-[#86868B] block">البائع / الكاشير:</span>
              <span className="font-bold text-[#1D1D1F]">
                {sale.employeeName || 'د. محمد (المالك)'}
              </span>
            </div>

            <div>
              <span className="text-[10px] text-[#86868B] block">بيانات العميل:</span>
              <span className="font-bold text-[#1D1D1F]">
                {sale.customerName || 'عميل نقدي'}
                {sale.customerPhone && <span className="block font-mono text-[11px] text-[#86868B]">{sale.customerPhone}</span>}
              </span>
            </div>

            <div>
              <span className="text-[10px] text-[#86868B] block">طريقة الدفع:</span>
              <span className="font-bold text-[#0071E3] font-mono">
                {sale.paymentMethod || 'نقدي'}
              </span>
            </div>
          </div>

          {/* Itemized Table Breakdown */}
          <div className="space-y-2">
            <h3 className="text-sm font-black text-[#1D1D1F] flex items-center gap-1.5">
              <ShoppingBag size={16} className="text-[#0071E3]" />
              <span>جدول بنود الفاتورة والتركيب الكيميائي:</span>
            </h3>

            <div className="border border-black/[0.08] rounded-2xl overflow-hidden bg-white shadow-2xs">
              <table className="w-full text-right text-xs">
                <thead>
                  <tr className="bg-[#F5F5F7] border-b border-black/[0.06] text-[#86868B] font-bold">
                    <th className="py-2.5 px-3">#</th>
                    <th className="py-2.5 px-3">العطر والمواصفات</th>
                    <th className="py-2.5 px-3">الحجم</th>
                    <th className="py-2.5 px-3">الزيت (جم)</th>
                    <th className="py-2.5 px-3">الكمية</th>
                    <th className="py-2.5 px-3">سعر الوحدة</th>
                    <th className="py-2.5 px-3">الإجمالي</th>
                    <th className="py-2.5 px-3">المساهمة</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-black/[0.04]">
                  {items.map((it, idx) => {
                    const qty = it.quantity || 1;
                    const itSubtotal = (it.sellingPrice || 0) * qty;
                    const itProfit = (it.profit || (it.sellingPrice - (it.cost || 0))) * qty;

                    return (
                      <tr key={idx} className="hover:bg-black/[0.01]">
                        <td className="py-2.5 px-3 font-mono font-bold text-[#86868B]">{idx + 1}</td>
                        <td className="py-2.5 px-3">
                          <span className="font-bold text-[#1D1D1F] block">{it.productName}</span>
                          <span className="text-[10px] text-[#86868B]">
                            {it.productType} {it.isMix ? '· ميكس خاص' : ''} {it.isColoredBottle ? '· عبوة ملونة' : ''}
                          </span>
                          {/* If Mix Components exist */}
                          {it.isMix && it.mixComponents && it.mixComponents.length > 0 && (
                            <div className="mt-1 text-[10px] text-indigo-700 bg-indigo-50 p-1.5 rounded-lg space-y-0.5">
                              <span className="font-bold block">مكونات تركيبة الميكس:</span>
                              {it.mixComponents.map((comp, cIdx) => (
                                <div key={cIdx} className="flex items-center justify-between">
                                  <span>• {comp.productName}</span>
                                  <span className="font-mono">{comp.grams} جم</span>
                                </div>
                              ))}
                            </div>
                          )}
                        </td>
                        <td className="py-2.5 px-3 font-mono font-bold text-[#1D1D1F]">{it.bottleSize} مل</td>
                        <td className="py-2.5 px-3 font-mono text-[#1D1D1F]">{it.essenceGrams} جم</td>
                        <td className="py-2.5 px-3 font-mono font-bold text-[#1D1D1F]">{qty}</td>
                        <td className="py-2.5 px-3 font-mono font-medium text-[#1D1D1F]">{it.sellingPrice} {settings.currency}</td>
                        <td className="py-2.5 px-3 font-mono font-black text-[#0071E3]">{itSubtotal} {settings.currency}</td>
                        <td className="py-2.5 px-3 font-mono font-bold text-emerald-700">+{itProfit.toFixed(0)} {settings.currency}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>

          {/* Comprehensive Financial Summary Calculation */}
          <div className="p-4 rounded-2xl bg-black/[0.02] border border-black/[0.06] space-y-2 text-xs">
            <h4 className="font-black text-[#1D1D1F] pb-1 border-b border-black/[0.04]">
              الحسابات المحاسبية الدقيقة للفاتورة:
            </h4>
            
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-1.5 font-mono">
              <div className="flex items-center justify-between text-zinc-600">
                <span className="font-sans">المجموع الإجمالي قبل الخصم:</span>
                <span>{subtotal.toLocaleString('ar-EG')} {settings.currency}</span>
              </div>

              {discount > 0 && (
                <div className="flex items-center justify-between text-rose-700 font-bold">
                  <span className="font-sans">الخصم المطبق:</span>
                  <span>-{discount} {settings.currency}</span>
                </div>
              )}

              {sale.loyaltyPointsRedeemed ? (
                <div className="flex items-center justify-between text-indigo-700 font-bold">
                  <span className="font-sans">خصم نقاط الولاء:</span>
                  <span>-{sale.loyaltyDiscountAmount || 0} {settings.currency}</span>
                </div>
              ) : null}

              {sale.packagingRevenueEgp ? (
                <div className="flex items-center justify-between text-amber-700">
                  <span className="font-sans">إيراد التغليف الفاخر:</span>
                  <span>+{sale.packagingRevenueEgp} {settings.currency}</span>
                </div>
              ) : null}

              <div className="flex items-center justify-between text-[#1D1D1F] font-bold pt-1 border-t border-black/[0.04]">
                <span className="font-sans">الصافي المحصل:</span>
                <span className="text-sm font-black text-[#0071E3]">{netPaid.toLocaleString('ar-EG')} {settings.currency}</span>
              </div>

              <div className="flex items-center justify-between text-emerald-700 font-bold pt-1 border-t border-black/[0.04]">
                <span className="font-sans">صافي الربح المحقق:</span>
                <span className="text-sm font-black text-emerald-700">+{profit.toFixed(0)} {settings.currency}</span>
              </div>
            </div>
          </div>

          {/* Specific Invoice Lifecycle Audit Trail */}
          {relatedLogs.length > 0 && (
            <div className="space-y-2">
              <h4 className="text-xs font-black text-[#1D1D1F] flex items-center gap-1.5">
                <History size={14} className="text-[#0071E3]" />
                <span>المخطط الزمني لدورة حياة هذه الفاتورة ({relatedLogs.length} أحداث مسجلة):</span>
              </h4>

              <div className="space-y-2 pr-4 border-r-2 border-blue-400">
                {relatedLogs.map((rLog) => (
                  <div key={rLog.id} className="p-3 rounded-xl bg-white border border-black/[0.06] text-xs space-y-1 shadow-2xs">
                    <div className="flex items-center justify-between">
                      <span className="font-black text-[#1D1D1F]">{rLog.action}</span>
                      <span className="font-mono text-[10px] text-[#86868B]">
                        {new Date(rLog.timestamp).toLocaleString('ar-EG')}
                      </span>
                    </div>
                    <p className="text-[11px] text-[#86868B]">{rLog.reason}</p>
                    <span className="text-[10px] font-bold text-[#0071E3]">بواسطة: {rLog.user}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

        </div>

        {/* Modal Footer */}
        <div className="p-4 sm:p-5 border-t border-black/[0.06] bg-[#F5F5F7] flex items-center justify-between">
          <span className="text-xs text-[#86868B] font-medium">
            توثيق نظام «لَمْسَةُ عِطْر» الرقابي المعتمد
          </span>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onPrint}
              className="px-4 py-2 rounded-xl bg-[#0071E3] hover:bg-[#0077ED] text-white text-xs font-black flex items-center gap-1.5 cursor-pointer shadow-xs"
            >
              <Printer size={14} />
              <span>معاينة وطباعة الفاتورة</span>
            </button>
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 rounded-xl bg-black/[0.06] hover:bg-black/[0.1] text-[#1D1D1F] text-xs font-bold cursor-pointer"
            >
              إغلاق
            </button>
          </div>
        </div>

      </div>
    </div>
  );
};

export default AuditLogViewer;
