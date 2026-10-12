import React, { useState, useMemo } from 'react';
import { 
  Product, 
  Sale, 
  PurchaseRequest, 
  CustomerRequest, 
  StockCheckRecord, 
  AppUser, 
  AuditLogRecord,
  StoreSettings,
  StrategicReplenishmentOrder,
  getApprovedOilGramCost,
  isLiveProductionSale
} from '../types';
import StrategicReplenishmentModal from './StrategicReplenishmentModal';
import { generateStrategicReplenishmentOrder, DEFAULT_STRATEGIC_THRESHOLD_GRAMS } from '../services/strategicOrderService';
import { 
  Box, 
  AlertTriangle, 
  TrendingDown, 
  TrendingUp,
  ShoppingCart, 
  ClipboardList, 
  UserPlus, 
  Search, 
  Plus, 
  CheckCircle2, 
  Clock, 
  DollarSign,
  Package,
  Layers,
  ChevronRight,
  Filter,
  Check,
  X,
  Sparkles,
  Calendar,
  CalendarDays,
  Download,
  SlidersHorizontal,
  ArrowUpRight,
  ArrowDownRight,
  Info,
  ShieldAlert,
  Zap
} from 'lucide-react';

export type RiskLevel = 'critical' | 'high' | 'medium' | 'safe' | 'stagnant';

export interface ForecastItem {
  product: Product;
  currentStock: number;
  oilCostPerGram: number;
  totalGramsSoldPeriod: number;
  dailyVelocityGrams: number;
  weeklyVelocityGrams: number;
  monthlyVelocityGrams: number;
  salesCountPeriod: number;
  trend: 'surging' | 'stable' | 'slowing' | 'stagnant';
  trendPercent: number;
  daysOfStockLeft: number;
  depletionDate: string | null;
  depletionDaysText: string;
  riskLevel: RiskLevel;
  safetyStockGrams: number;
  suggestedPurchaseGrams: number;
  suggestedBatchGrams: number;
  estimatedPurchaseCost: number;
  reorderReason: string;
}

interface InventoryIntelligenceProps {
  products: Product[];
  setProducts: React.Dispatch<React.SetStateAction<Product[]>>;
  sales: Sale[];
  purchaseRequests: PurchaseRequest[];
  onSavePurchaseRequest: (req: PurchaseRequest) => void;
  customerRequests: CustomerRequest[];
  onSaveCustomerRequest: (req: CustomerRequest) => void;
  stockChecks: StockCheckRecord[];
  onSaveStockCheck: (check: StockCheckRecord) => void;
  currentUser: AppUser | null;
  settings: StoreSettings;
  onAddAuditLog: (log: AuditLogRecord) => void;
  strategicOrders?: StrategicReplenishmentOrder[];
  onSaveStrategicOrder?: (order: StrategicReplenishmentOrder) => void;
}

type TabType = 'overview' | 'forecasting' | 'shortages' | 'purchase_requests' | 'customer_requests' | 'stock_check';

const InventoryIntelligence: React.FC<InventoryIntelligenceProps> = ({
  products,
  setProducts,
  sales,
  purchaseRequests,
  onSavePurchaseRequest,
  customerRequests,
  onSaveCustomerRequest,
  stockChecks,
  onSaveStockCheck,
  currentUser,
  settings,
  onAddAuditLog,
  strategicOrders = [],
  onSaveStrategicOrder
}) => {
  const [activeTab, setActiveTab] = useState<TabType>('overview');
  const [searchQuery, setSearchQuery] = useState('');

  // Smart Inventory Forecasting State
  const [forecastAnalysisDays, setForecastAnalysisDays] = useState<number>(30);
  const [forecastCoverageDays, setForecastCoverageDays] = useState<number>(30);
  const [leadTimeDays, setLeadTimeDays] = useState<number>(3);
  const [forecastRiskFilter, setForecastRiskFilter] = useState<'all' | RiskLevel>('all');
  const [forecastTypeFilter, setForecastTypeFilter] = useState<string>('all');
  const [forecastSortBy, setForecastSortBy] = useState<'daysLeft' | 'velocity' | 'suggestedCost' | 'stock'>('daysLeft');
  const [forecastSortOrder, setForecastSortOrder] = useState<'asc' | 'desc'>('asc');
  const [forecastSearchQuery, setForecastSearchQuery] = useState('');
  const [batchOrderSuccessMessage, setBatchOrderSuccessMessage] = useState<string | null>(null);

  // WhatsApp Quick Supplier Order Modal State
  const [showWhatsAppSupplierModal, setShowWhatsAppSupplierModal] = useState(false);
  const [whatsAppTargetProduct, setWhatsAppTargetProduct] = useState<Product | null>(null);
  const [whatsAppOrderGrams, setWhatsAppOrderGrams] = useState<number>(500);
  const [supplierPhone, setSupplierPhone] = useState<string>('201000000000');
  const [supplierName, setSupplierName] = useState<string>('مورد الزيوت العطرية');

  const handleOpenWhatsAppModalForProduct = (product: Product, suggestedGrams: number = 500) => {
    setWhatsAppTargetProduct(product);
    setWhatsAppOrderGrams(suggestedGrams > 0 ? suggestedGrams : 500);
    setShowWhatsAppSupplierModal(true);
  };

  const handleSendWhatsAppSupplierOrder = () => {
    if (!whatsAppTargetProduct) return;
    const cleanPhone = supplierPhone.replace(/[^\d]/g, '');
    const storeNameStr = settings?.storeName || 'متجر لمسة عطر';

    const msgText = 
      `السلام عليكم ورحمة الله وبركاته 🌸\n` +
      `طلب توريد زيت عطري عاجل - ${storeNameStr}\n\n` +
      `📌 اسم الزيت: ${whatsAppTargetProduct.name} (${whatsAppTargetProduct.brand || 'فرنسي'})\n` +
      `💧 المخزون الفعلي المتبقي بالمحل: ${whatsAppTargetProduct.stock_grams} جرام\n` +
      `📦 الكمية المطلوبة للشراء: ${whatsAppOrderGrams} جرام\n` +
      `⚡ الأولوية: عاجل جداً (نواقص حرج)\n\n` +
      `يرجى تأكيد التوافر وإعادة تأكيد السعر الإجمالي للتسليم العاجل. وشكراً لكم.`;

    const encodedMsg = encodeURIComponent(msgText);
    const waUrl = `https://wa.me/${cleanPhone || '201000000000'}?text=${encodedMsg}`;

    window.open(waUrl, '_blank');

    // Automatically create a purchase request in system
    const newReq: PurchaseRequest = {
      id: `purch-wa-${Date.now()}`,
      date: new Date().toISOString().slice(0, 10),
      requestedBy: currentUser?.displayName || 'طلب واتساب عاجل',
      productName: whatsAppTargetProduct.name,
      brand: whatsAppTargetProduct.brand,
      requestedGrams: whatsAppOrderGrams,
      estimatedCost: whatsAppOrderGrams * getApprovedOilGramCost(whatsAppTargetProduct.type, settings),
      priority: 'عاجل (نفد)',
      status: 'قيد الانتظار',
      notes: `تم إرسال طلبيّة عاجلة للمورد عبر واتساب (${supplierPhone})`,
    };
    onSavePurchaseRequest(newReq);

    setShowWhatsAppSupplierModal(false);
  };

  // Modals state
  const [showNewPurchaseModal, setShowNewPurchaseModal] = useState(false);
  const [showNewCustomerReqModal, setShowNewCustomerReqModal] = useState(false);
  const [showNewStockCheckModal, setShowNewStockCheckModal] = useState(false);
  const [showStrategicReplenishmentModal, setShowStrategicReplenishmentModal] = useState(false);
  const [activeReplenishmentOrder, setActiveReplenishmentOrder] = useState<StrategicReplenishmentOrder | null>(null);

  // New Purchase Request Form State
  const [selectedProductForPurchase, setSelectedProductForPurchase] = useState<Product | null>(null);
  const [purchaseGramsInput, setPurchaseGramsInput] = useState<number>(500);
  const [purchasePriority, setPurchasePriority] = useState<PurchaseRequest['priority']>('عاجل (نفد)');
  const [purchaseNotes, setPurchaseNotes] = useState('');

  // New Customer Request Form State
  const [custName, setCustName] = useState('');
  const [custPhone, setCustPhone] = useState('');
  const [custPerfume, setCustPerfume] = useState('');
  const [custSize, setCustSize] = useState<number>(50);
  const [custNotes, setCustNotes] = useState('');

  // Stock Check Form State
  const [stockCheckProduct, setStockCheckProduct] = useState<Product | null>(null);
  const [actualGramsInput, setActualGramsInput] = useState<number | ''>('');
  const [stockCheckReason, setStockCheckReason] = useState('');

  // Reorder threshold
  const REORDER_THRESHOLD_GRAMS = 150;

  // Inventory Calculations
  const totalStockGrams = useMemo(() => {
    return products.reduce((sum, p) => sum + p.stock_grams, 0);
  }, [products]);

  // Inventory Cost Value (Normal @ 10 EGP/g, Niche @ 15 EGP/g, Oud/Musk @ 20 EGP/g)
  const totalInventoryCostValue = useMemo(() => {
    return products.reduce((sum, p) => {
      const rate = getApprovedOilGramCost(p.type, settings);
      return sum + (p.stock_grams * rate);
    }, 0);
  }, [products, settings]);

  // Shortages (stock < 150g)
  const lowStockProducts = useMemo(() => {
    return products.filter(p => p.stock_grams < REORDER_THRESHOLD_GRAMS);
  }, [products]);

  // Stagnant Products (no sales in last 30 days)
  const thirtyDaysAgo = new Date();
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
  const thirtyDaysAgoStr = thirtyDaysAgo.toISOString();

  const stagnantProducts = useMemo(() => {
    const soldProductIds = new Set<string | number>();
    sales.forEach(sale => {
      if (sale.date >= thirtyDaysAgoStr && isLiveProductionSale(sale)) {
        sale.items.forEach(it => soldProductIds.add(it.productId));
      }
    });
    return products.filter(p => !soldProductIds.has(p.id) && p.stock_grams > 0);
  }, [products, sales, thirtyDaysAgoStr]);

  // Total Grams Consumed (Sales)
  const totalGramsConsumed = useMemo(() => {
    let grams = 0;
    sales.forEach(s => {
      if (isLiveProductionSale(s)) {
        s.items.forEach(it => {
          grams += it.essenceGrams || 0;
        });
      }
    });
    return grams;
  }, [sales]);

  // Unique Fragrance Types for Filter
  const uniqueFragranceTypes = useMemo(() => {
    const types = new Set<string>();
    products.forEach(p => {
      if (p.type) types.add(p.type);
    });
    return Array.from(types);
  }, [products]);

  // Smart Inventory Forecasting Analytics
  const allForecastItems = useMemo<ForecastItem[]>(() => {
    const now = new Date();
    const periodStart = new Date(now.getTime() - forecastAnalysisDays * 24 * 60 * 60 * 1000);
    const periodStartIso = periodStart.toISOString();

    const prevPeriodStart = new Date(now.getTime() - (forecastAnalysisDays * 2) * 24 * 60 * 60 * 1000);
    const prevPeriodStartIso = prevPeriodStart.toISOString();

    // Map sales by productId
    const periodSalesMap = new Map<string | number, { totalGrams: number; count: number }>();
    const prevSalesMap = new Map<string | number, { totalGrams: number }>();

    sales.forEach(sale => {
      if (!isLiveProductionSale(sale)) return;
      const saleDate = sale.date;

      if (saleDate >= periodStartIso) {
        sale.items.forEach(it => {
          if (!it.productId) return;
          const current = periodSalesMap.get(it.productId) || { totalGrams: 0, count: 0 };
          current.totalGrams += (it.essenceGrams || 0);
          current.count += (it.quantity || 1);
          periodSalesMap.set(it.productId, current);
        });
      } else if (saleDate >= prevPeriodStartIso && saleDate < periodStartIso) {
        sale.items.forEach(it => {
          if (!it.productId) return;
          const current = prevSalesMap.get(it.productId) || { totalGrams: 0 };
          current.totalGrams += (it.essenceGrams || 0);
          prevSalesMap.set(it.productId, current);
        });
      }
    });

    return products.map(product => {
      const stock = Number(product.stock_grams) || 0;
      const oilCostPerGram = getApprovedOilGramCost(product.type, settings);

      const periodData = periodSalesMap.get(product.id) || { totalGrams: 0, count: 0 };
      const prevData = prevSalesMap.get(product.id) || { totalGrams: 0 };

      const totalGramsSoldPeriod = periodData.totalGrams;
      const salesCountPeriod = periodData.count;

      const dailyVelocityGrams = totalGramsSoldPeriod / forecastAnalysisDays;
      const weeklyVelocityGrams = dailyVelocityGrams * 7;
      const monthlyVelocityGrams = dailyVelocityGrams * 30;

      const prevDailyVelocity = prevData.totalGrams / forecastAnalysisDays;
      let trendPercent = 0;
      if (prevDailyVelocity > 0) {
        trendPercent = Math.round(((dailyVelocityGrams - prevDailyVelocity) / prevDailyVelocity) * 100);
      } else if (dailyVelocityGrams > 0) {
        trendPercent = 100;
      }

      let trend: ForecastItem['trend'] = 'stable';
      if (dailyVelocityGrams === 0) {
        trend = 'stagnant';
      } else if (trendPercent >= 15) {
        trend = 'surging';
      } else if (trendPercent <= -15) {
        trend = 'slowing';
      }

      // Dynamic Safety Stock calculation
      const isPreciousOil = ['عود', 'مسك', 'نيش'].includes(product.type);
      const minBufferGrams = isPreciousOil ? 50 : 100;
      const leadTimeCushion = Math.ceil(dailyVelocityGrams * (leadTimeDays + 2));
      const strategicMin = product.strategicThresholdGrams || DEFAULT_STRATEGIC_THRESHOLD_GRAMS;
      const safetyStockGrams = Math.max(strategicMin, leadTimeCushion + minBufferGrams);

      // Days of Inventory Remaining (DIO)
      let daysOfStockLeft = 999;
      if (stock <= 0) {
        daysOfStockLeft = 0;
      } else if (dailyVelocityGrams > 0) {
        daysOfStockLeft = Math.round((stock / dailyVelocityGrams) * 10) / 10;
      }

      // Depletion Date Formatting
      let depletionDate: string | null = null;
      let depletionDaysText = 'مستقر وآمن (+سنة)';
      if (stock <= 0) {
        depletionDate = 'نافد اليوم (0 جم)';
        depletionDaysText = 'منعدم تماماً';
      } else if (daysOfStockLeft < 365) {
        const depDate = new Date(now.getTime() + daysOfStockLeft * 24 * 60 * 60 * 1000);
        depletionDate = depDate.toLocaleDateString('ar-EG', {
          day: 'numeric',
          month: 'long',
          year: 'numeric'
        });
        depletionDaysText = daysOfStockLeft < 1 
          ? 'أقل من 24 ساعة' 
          : `خلال ${Math.round(daysOfStockLeft)} يوم`;
      }

      // Risk Level Classification
      let riskLevel: RiskLevel = 'safe';
      if (stock <= 0 || daysOfStockLeft <= (leadTimeDays + 1)) {
        riskLevel = 'critical';
      } else if (daysOfStockLeft <= 7 || stock < safetyStockGrams) {
        riskLevel = 'high';
      } else if (daysOfStockLeft <= 14) {
        riskLevel = 'medium';
      } else if (dailyVelocityGrams === 0 && stock > 0) {
        riskLevel = 'stagnant';
      } else {
        riskLevel = 'safe';
      }

      // Suggested Purchase Quantity
      const plannedDemand = dailyVelocityGrams * forecastCoverageDays;
      const targetStockNeeded = plannedDemand + safetyStockGrams;
      const netDeficit = Math.max(0, targetStockNeeded - stock);

      let suggestedPurchaseGrams = 0;
      let suggestedBatchGrams = 0;

      if (netDeficit > 0 || stock <= 0 || riskLevel === 'critical') {
        suggestedPurchaseGrams = Math.ceil(netDeficit);
        if (isPreciousOil) {
          if (suggestedPurchaseGrams <= 100) suggestedBatchGrams = 100;
          else if (suggestedPurchaseGrams <= 250) suggestedBatchGrams = 250;
          else suggestedBatchGrams = Math.ceil(suggestedPurchaseGrams / 250) * 250;
        } else {
          if (suggestedPurchaseGrams <= 250) suggestedBatchGrams = 250;
          else if (suggestedPurchaseGrams <= 500) suggestedBatchGrams = 500;
          else suggestedBatchGrams = Math.ceil(suggestedPurchaseGrams / 500) * 500;
        }
      }

      if ((stock <= 0 || riskLevel === 'critical') && suggestedBatchGrams < (isPreciousOil ? 250 : 500)) {
        suggestedBatchGrams = isPreciousOil ? 250 : 500;
      }

      const estimatedPurchaseCost = Math.round(suggestedBatchGrams * oilCostPerGram);

      // Reorder Reason formulation
      let reorderReason = '';
      if (stock <= 0) {
        reorderReason = '🚨 المخزون منعدم تماماً (0 جم)؛ يتطلب توريداً استباقياً عاجلاً لمنع ضياع المبيعات.';
      } else if (riskLevel === 'critical') {
        reorderReason = `🚨 رصيد حرج (${stock} جم) سينفد في غضون ${depletionDaysText} قبل وصول شحنة المورد (${leadTimeDays} أيام مهلة).`;
      } else if (riskLevel === 'high') {
        reorderReason = `⚠️ معدل سحب نشط (${dailyVelocityGrams.toFixed(1)} جم/يوم) والرصيد أقل من حد الأمان (${safetyStockGrams} جم). ينفد في ${depletionDaysText}.`;
      } else if (riskLevel === 'medium') {
        reorderReason = `⚡ الرصيد كافٍ لـ ${Math.round(daysOfStockLeft)} يوماً؛ يوصى بطلب ${suggestedBatchGrams} جم لتأمين تغطية ${forecastCoverageDays} يوماً قادمة.`;
      } else if (riskLevel === 'stagnant') {
        reorderReason = `💤 صنف راكد لم يسجل مبيعات خلال آخر ${forecastAnalysisDays} يوماً؛ الرصيد الحالي (${stock} جم) كافٍ ولا ينصح بطلبه حالياً.`;
      } else {
        reorderReason = `✅ الرصيد آمن ومستقر (${stock} جم) ويكفي لأكثر من ${Math.round(daysOfStockLeft)} يوماً دون حاجة للشراء الآن.`;
      }

      return {
        product,
        currentStock: stock,
        oilCostPerGram,
        totalGramsSoldPeriod,
        dailyVelocityGrams,
        weeklyVelocityGrams,
        monthlyVelocityGrams,
        salesCountPeriod,
        trend,
        trendPercent,
        daysOfStockLeft,
        depletionDate,
        depletionDaysText,
        riskLevel,
        safetyStockGrams,
        suggestedPurchaseGrams,
        suggestedBatchGrams,
        estimatedPurchaseCost,
        reorderReason
      };
    });
  }, [products, sales, settings, forecastAnalysisDays, forecastCoverageDays, leadTimeDays]);

  // Filtered & Sorted Forecast Items
  const filteredForecastItems = useMemo(() => {
    return allForecastItems
      .filter(item => {
        if (forecastRiskFilter !== 'all' && item.riskLevel !== forecastRiskFilter) {
          return false;
        }
        if (forecastTypeFilter !== 'all' && item.product.type !== forecastTypeFilter) {
          return false;
        }
        if (forecastSearchQuery.trim()) {
          const q = forecastSearchQuery.trim().toLowerCase();
          const matchName = item.product.name.toLowerCase().includes(q);
          const matchBrand = (item.product.brand || '').toLowerCase().includes(q);
          const matchType = (item.product.type || '').toLowerCase().includes(q);
          if (!matchName && !matchBrand && !matchType) return false;
        }
        return true;
      })
      .sort((a, b) => {
        let diff = 0;
        if (forecastSortBy === 'daysLeft') {
          diff = a.daysOfStockLeft - b.daysOfStockLeft;
        } else if (forecastSortBy === 'velocity') {
          diff = b.dailyVelocityGrams - a.dailyVelocityGrams;
        } else if (forecastSortBy === 'suggestedCost') {
          diff = b.estimatedPurchaseCost - a.estimatedPurchaseCost;
        } else if (forecastSortBy === 'stock') {
          diff = a.currentStock - b.currentStock;
        }
        return forecastSortOrder === 'asc' ? diff : -diff;
      });
  }, [allForecastItems, forecastRiskFilter, forecastTypeFilter, forecastSearchQuery, forecastSortBy, forecastSortOrder]);

  // Forecast KPIs Aggregates
  const forecastKPIs = useMemo(() => {
    const criticalItems = allForecastItems.filter(i => i.riskLevel === 'critical' || i.riskLevel === 'high');
    const totalSuggestedBudget = criticalItems.reduce((sum, i) => sum + i.estimatedPurchaseCost, 0);
    const totalDailyOilConsumption = allForecastItems.reduce((sum, i) => sum + i.dailyVelocityGrams, 0);
    
    const sortedByVelocity = [...allForecastItems].sort((a, b) => b.dailyVelocityGrams - a.dailyVelocityGrams);
    const topFastMover = sortedByVelocity[0] && sortedByVelocity[0].dailyVelocityGrams > 0 ? sortedByVelocity[0] : null;

    return {
      criticalCount: criticalItems.length,
      totalSuggestedBudget,
      totalDailyOilConsumption,
      topFastMover
    };
  }, [allForecastItems]);

  // Handle Bulk Purchase Request Generation from Forecast
  const handleCreateBatchForecastPurchaseRequests = () => {
    const itemsToOrder = allForecastItems.filter(i => 
      (i.riskLevel === 'critical' || i.riskLevel === 'high') && i.suggestedBatchGrams > 0
    );

    if (itemsToOrder.length === 0) return;

    let totalCost = 0;
    itemsToOrder.forEach((item, idx) => {
      totalCost += item.estimatedPurchaseCost;
      const newReq: PurchaseRequest = {
        id: `purch-auto-${Date.now()}-${idx}`,
        date: new Date().toISOString().slice(0, 10),
        requestedBy: currentUser?.displayName || 'نظام التوقعات الذكية',
        productName: item.product.name,
        brand: item.product.brand,
        requestedGrams: item.suggestedBatchGrams,
        estimatedCost: item.estimatedPurchaseCost,
        priority: item.riskLevel === 'critical' ? 'عاجل (نفد)' : 'متوسط (قارب النفاذ)',
        status: 'قيد الانتظار',
        notes: `توقع استباقي: سحب ${item.dailyVelocityGrams.toFixed(1)} جم/يوم · ينفد في ${item.depletionDaysText} · لتأمين تغطية ${forecastCoverageDays} يوماً.`
      };
      onSavePurchaseRequest(newReq);
    });

    onAddAuditLog({
      id: `audit-batch-purch-${Date.now()}`,
      timestamp: new Date().toISOString(),
      user: currentUser?.displayName || 'المستخدم',
      action: 'تعديل مخزون',
      entityType: 'product',
      entityId: 'batch-forecast',
      entityName: 'توليد أوامر شراء ذكية مجمعة',
      oldValue: null,
      newValue: `تم إنشاء ${itemsToOrder.length} أمر شراء بتكلفة إجمالية ${totalCost.toLocaleString('ar-EG')} ج`,
      reason: `تأمين دورة تشغيل ${forecastCoverageDays} يوماً استناداً لمعدلات السحب التاريخية`,
      category: 'مخزون'
    });

    setBatchOrderSuccessMessage(
      `تم إنشاء (${itemsToOrder.length}) أمر شراء للنواقص الحرجة بنجاح بإجمالي ميزانية (${totalCost.toLocaleString('ar-EG')} ج)! يمكنك مراجعتها واعتمادها من تبويب "أوامر وطلبات الشراء".`
    );

    setTimeout(() => {
      setBatchOrderSuccessMessage(null);
    }, 8000);
  };

  // Export Forecast to CSV
  const handleExportForecastCsv = () => {
    const header = 'اسم العطر,الماركة,النوع,الرصيد الفعلي (جم),معدل السحب اليومي (جم/يوم),معدل السحب الشهري (جم/شهر),الأيام المتبقية حتى النفاد,تاريخ النفاد المتوقع,مستوى الخطورة,حد الأمان (جم),الكمية المقترحة للشراء (جم),التكلفة التقديرية (ج),سبب وتبرير الاقتراح\n';
    const rows = filteredForecastItems.map(item => {
      const daysText = item.daysOfStockLeft === 999 ? 'مستقر' : item.daysOfStockLeft.toFixed(1);
      const safeReason = item.reorderReason.replace(/"/g, '""');
      return `"${item.product.name}","${item.product.brand}","${item.product.type}",${item.currentStock},${item.dailyVelocityGrams.toFixed(1)},${item.monthlyVelocityGrams.toFixed(1)},"${daysText}","${item.depletionDate || ''}","${item.riskLevel}",${item.safetyStockGrams},${item.suggestedBatchGrams},${item.estimatedPurchaseCost},"${safeReason}"`;
    }).join('\n');

    const blob = new Blob(['\uFEFF' + header + rows], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `توقعات-المخزون-والشراء-لمسة-عطر-${new Date().toISOString().slice(0, 10)}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  // Handle Save Purchase Request
  const handleCreatePurchaseRequest = (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedProductForPurchase) return;

    const costPerGram = getApprovedOilGramCost(selectedProductForPurchase.type, settings);
    const estimatedCost = purchaseGramsInput * costPerGram;

    const newReq: PurchaseRequest = {
      id: `purch-${Date.now()}`,
      date: new Date().toISOString().slice(0, 10),
      requestedBy: currentUser?.displayName || 'مسؤول التشغيل',
      productName: selectedProductForPurchase.name,
      brand: selectedProductForPurchase.brand,
      requestedGrams: purchaseGramsInput,
      estimatedCost,
      priority: purchasePriority,
      status: 'قيد الانتظار',
      notes: purchaseNotes,
    };

    onSavePurchaseRequest(newReq);

    onAddAuditLog({
      id: `audit-purch-${Date.now()}`,
      timestamp: new Date().toISOString(),
      user: currentUser?.displayName || 'المستخدم',
      action: 'تعديل مخزون',
      entityType: 'product',
      entityId: selectedProductForPurchase.id,
      entityName: selectedProductForPurchase.name,
      oldValue: null,
      newValue: `طلب شراء ${purchaseGramsInput} جم بتكلفة تقديرية ${estimatedCost} ج`,
      reason: purchaseNotes || 'طلب توريد خامات وشراء مخزون',
      category: 'مخزون'
    });

    setShowNewPurchaseModal(false);
    setSelectedProductForPurchase(null);
  };

  // Handle Save Customer Missing Fragrance Request
  const handleCreateCustomerRequest = (e: React.FormEvent) => {
    e.preventDefault();
    if (!custName.trim() || !custPerfume.trim()) return;

    const newReq: CustomerRequest = {
      id: `cust-req-${Date.now()}`,
      date: new Date().toISOString().slice(0, 10),
      recordedBy: currentUser?.displayName || 'المسؤول',
      customerName: custName.trim(),
      customerPhone: custPhone.trim(),
      requestedPerfume: custPerfume.trim(),
      preferredSizeMl: custSize,
      status: 'جديد',
      notes: custNotes,
    };

    onSaveCustomerRequest(newReq);

    setShowNewCustomerReqModal(false);
    setCustName('');
    setCustPhone('');
    setCustPerfume('');
  };

  // Handle Stocktaking Check Record
  const handleCreateStockCheck = (e: React.FormEvent) => {
    e.preventDefault();
    if (!stockCheckProduct || actualGramsInput === '') return;

    const actual = Number(actualGramsInput);
    const diff = actual - stockCheckProduct.stock_grams;
    const rate = getApprovedOilGramCost(stockCheckProduct.type, settings);
    const varianceCost = Math.round(diff * rate);

    const checkRecord: StockCheckRecord = {
      id: `check-${Date.now()}`,
      date: new Date().toISOString().slice(0, 10),
      performedBy: currentUser?.displayName || 'مسؤول الجرد',
      productId: stockCheckProduct.id,
      productName: stockCheckProduct.name,
      systemGrams: stockCheckProduct.stock_grams,
      actualGrams: actual,
      differenceGrams: diff,
      varianceCost,
      justification: stockCheckReason,
      status: 'مسجل',
    };

    onSaveStockCheck(checkRecord);

    // If difference exists, optionally update product stock and log audit
    if (diff !== 0) {
      setProducts(prev => prev.map(p => {
        if (p.id === stockCheckProduct.id) {
          return { ...p, stock_grams: actual };
        }
        return p;
      }));

      onAddAuditLog({
        id: `audit-stockcheck-${Date.now()}`,
        timestamp: new Date().toISOString(),
        user: currentUser?.displayName || 'مسؤول الجرد',
        action: 'تعديل مخزون',
        entityType: 'product',
        entityId: stockCheckProduct.id,
        entityName: stockCheckProduct.name,
        oldValue: `${stockCheckProduct.stock_grams} جم`,
        newValue: `${actual} جم (فرق: ${diff} جم / ${varianceCost} ج)`,
        reason: stockCheckReason || 'تسجيل نتيجة جرد وتحديث الرصيد الفعلي',
        category: 'مخزون'
      });
    }

    setShowNewStockCheckModal(false);
    setStockCheckProduct(null);
    setActualGramsInput('');
    setStockCheckReason('');
  };

  const isOwner = currentUser?.role === 'OWNER';

  return (
    <div className="space-y-6 pb-20 p-4 sm:p-6 max-w-6xl mx-auto">
      
      {/* Header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 pb-4 border-b border-black/[0.06]">
        <div className="flex items-center gap-3">
          <div className="w-11 h-11 rounded-2xl bg-amber-500/10 text-amber-600 flex items-center justify-center font-bold">
            <Box size={22} />
          </div>
          <div>
            <h1 className="text-xl font-black text-[#1D1D1F]">لوحة المخزون والاحتياجات والخامات</h1>
            <p className="text-xs text-[#86868B]">
              إدارة الأرصدة، حدود إعادة الطلب، النواقص، طلبات الشراء، وحركة الجرد
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {/* Strategic Replenishment Button */}
          <button
            type="button"
            onClick={() => {
              const ord = generateStrategicReplenishmentOrder(products, sales, settings, strategicOrders[0] || null);
              setActiveReplenishmentOrder(ord);
              setShowStrategicReplenishmentModal(true);
            }}
            className="apple-btn flex items-center gap-2 px-3.5 py-2 rounded-xl bg-gradient-to-r from-amber-500 to-rose-600 hover:from-amber-600 hover:to-rose-700 text-white text-xs font-black shadow-sm transition-all"
          >
            <Package size={15} />
            <span>فاتورة النواقص الاستراتيجية</span>
            {lowStockProducts.length > 0 && (
              <span className="px-1.5 py-0.5 rounded-full bg-white text-rose-700 font-mono text-[10px]">
                {lowStockProducts.length}
              </span>
            )}
          </button>

          <button
            type="button"
            onClick={() => setShowNewCustomerReqModal(true)}
            className="apple-btn flex items-center gap-1.5 px-3 py-2 rounded-xl bg-purple-50 hover:bg-purple-100 text-purple-700 text-xs font-bold transition-all border border-purple-200"
          >
            <UserPlus size={14} />
            <span>طلب عطر غير متوفر</span>
          </button>

          <button
            type="button"
            onClick={() => setShowNewPurchaseModal(true)}
            className="apple-btn flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-[#0071E3] hover:bg-[#0077ED] text-white text-xs font-bold shadow-sm transition-all"
          >
            <ShoppingCart size={14} />
            <span>إنشاء طلب شراء</span>
          </button>
        </div>
      </div>

      {/* KPI Cards Row */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
        <div className="p-4 rounded-3xl bg-white border border-black/[0.06] shadow-apple space-y-1">
          <span className="text-[11px] font-bold text-[#86868B] block">إجمالي الرصيد الفعلي:</span>
          <div className="flex items-baseline gap-1 font-mono">
            <span className="text-2xl font-black text-[#1D1D1F]">{totalStockGrams.toLocaleString('ar-EG')}</span>
            <span className="text-xs text-[#86868B]">جم زيت</span>
          </div>
          <span className="text-[10px] text-emerald-700 font-bold block pt-0.5">
            يعادل ~ {Math.round(totalStockGrams / 15)} عبوة 50 مل
          </span>
        </div>

        <div className="p-4 rounded-3xl bg-white border border-black/[0.06] shadow-apple space-y-1">
          <span className="text-[11px] font-bold text-[#86868B] block">قيمة المخزون بسعر التكلفة:</span>
          <div className="flex items-baseline gap-1 font-mono">
            <span className="text-2xl font-black text-[#0071E3]">{totalInventoryCostValue.toLocaleString('ar-EG')}</span>
            <span className="text-xs text-[#86868B]">{settings.currency}</span>
          </div>
          <span className="text-[10px] text-[#86868B] block pt-0.5">
            رأس مال الزيوت المحجوز في المتجر
          </span>
        </div>

        <div className="p-4 rounded-3xl bg-white border border-black/[0.06] shadow-apple space-y-1">
          <span className="text-[11px] font-bold text-[#86868B] block">عطور شارفت على النفاد:</span>
          <div className="flex items-baseline gap-1 font-mono">
            <span className={`text-2xl font-black ${lowStockProducts.length > 0 ? 'text-rose-600' : 'text-emerald-600'}`}>
              {lowStockProducts.length}
            </span>
            <span className="text-xs text-[#86868B]">عطر</span>
          </div>
          <span className="text-[10px] text-rose-700 font-bold block pt-0.5">
            أقل من حد إعادة الطلب ({REORDER_THRESHOLD_GRAMS} جم)
          </span>
        </div>

        <div className="p-4 rounded-3xl bg-white border border-black/[0.06] shadow-apple space-y-1">
          <span className="text-[11px] font-bold text-[#86868B] block">العناصر الراكدة (+30 يوم):</span>
          <div className="flex items-baseline gap-1 font-mono">
            <span className="text-2xl font-black text-amber-600">{stagnantProducts.length}</span>
            <span className="text-xs text-[#86868B]">عطر</span>
          </div>
          <span className="text-[10px] text-amber-800 font-bold block pt-0.5">
            تحتاج لتنشيط أو عروض تسويقية
          </span>
        </div>
      </div>

      {/* Smart Low Essential Oil Alert Banner */}
      {lowStockProducts.length > 0 && (
        <div className="p-4 sm:p-5 rounded-3xl bg-gradient-to-r from-rose-950 via-slate-900 to-amber-950 border border-rose-500/40 text-white shadow-xl space-y-3 animate-in fade-in duration-200">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-white/10">
            <div className="flex items-center gap-2.5">
              <div className="w-10 h-10 rounded-2xl bg-rose-500/20 text-rose-400 flex items-center justify-center border border-rose-500/30">
                <AlertTriangle size={20} className="animate-pulse" />
              </div>
              <div>
                <h3 className="text-sm font-black text-white flex items-center gap-2">
                  <span>تنبيه الموردين الذكي: زيوت عطرية شارفت على النفاد</span>
                  <span className="px-2 py-0.5 rounded-full bg-rose-500/30 text-rose-300 text-[10px] font-bold border border-rose-500/40">
                    {lowStockProducts.length} صنف حرج
                  </span>
                </h3>
                <p className="text-xs text-slate-300">
                  اضغط على زر "طلب سريع عبر واتساب" لإرسال طلبيّة توريد فورية مجهزة للمورد مباشرةً
                </p>
              </div>
            </div>
            <button
              type="button"
              onClick={() => setActiveTab('shortages')}
              className="apple-btn px-3 py-1.5 rounded-xl bg-white/10 hover:bg-white/20 text-white text-xs font-bold border border-white/15 w-fit cursor-pointer"
            >
              عرض كشف النواقص الكامل
            </button>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {lowStockProducts.slice(0, 3).map((product) => (
              <div key={product.id} className="p-3 rounded-2xl bg-white/5 border border-white/10 flex items-center justify-between gap-2">
                <div className="min-w-0">
                  <span className="text-xs font-black text-white block truncate">{product.name}</span>
                  <span className="text-[10px] text-slate-300">{product.brand} · الرصيد: <strong className="text-rose-400 font-mono">{product.stock_grams} جم</strong></span>
                </div>
                <button
                  type="button"
                  onClick={() => handleOpenWhatsAppModalForProduct(product, 500)}
                  className="apple-btn px-3 py-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-[11px] font-black flex items-center gap-1 shrink-0 shadow-md cursor-pointer"
                >
                  <span>💬 طلب واتساب</span>
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Tabs */}
      <div className="flex items-center gap-2 border-b border-black/[0.06] pb-2 overflow-x-auto text-xs font-bold">
        <button
          onClick={() => setActiveTab('overview')}
          className={`px-4 py-2 rounded-xl transition-all ${
            activeTab === 'overview'
              ? 'bg-[#1D1D1F] text-white shadow-sm'
              : 'text-[#86868B] hover:bg-black/[0.04]'
          }`}
        >
          نظرة عامة والكتالوج ({products.length})
        </button>

        <button
          onClick={() => setActiveTab('forecasting')}
          className={`px-4 py-2 rounded-xl transition-all flex items-center gap-1.5 ${
            activeTab === 'forecasting'
              ? 'bg-gradient-to-r from-amber-600 via-rose-600 to-indigo-600 text-white shadow-md'
              : 'text-[#1D1D1F] hover:bg-black/[0.04]'
          }`}
        >
          <Sparkles size={14} className={activeTab === 'forecasting' ? 'text-amber-200 animate-pulse' : 'text-amber-600'} />
          <span>توقعات المخزون الذكية</span>
          {forecastKPIs.criticalCount > 0 ? (
            <span className={`px-1.5 py-0.2 rounded-full text-[10px] font-bold ${
              activeTab === 'forecasting' ? 'bg-white text-rose-700' : 'bg-rose-500 text-white'
            }`}>
              {forecastKPIs.criticalCount}
            </span>
          ) : (
            <span className="px-1.5 py-0.2 rounded-full bg-emerald-100 text-emerald-800 text-[9px] font-bold">
              مستقر
            </span>
          )}
        </button>

        <button
          onClick={() => setActiveTab('shortages')}
          className={`px-4 py-2 rounded-xl transition-all flex items-center gap-1.5 ${
            activeTab === 'shortages'
              ? 'bg-[#1D1D1F] text-white shadow-sm'
              : 'text-[#86868B] hover:bg-black/[0.04]'
          }`}
        >
          <span>النواقص والتنبيهات</span>
          {lowStockProducts.length > 0 && (
            <span className="px-1.5 py-0.2 rounded-full bg-rose-500 text-white text-[10px]">
              {lowStockProducts.length}
            </span>
          )}
        </button>

        <button
          onClick={() => setActiveTab('purchase_requests')}
          className={`px-4 py-2 rounded-xl transition-all flex items-center gap-1.5 ${
            activeTab === 'purchase_requests'
              ? 'bg-[#1D1D1F] text-white shadow-sm'
              : 'text-[#86868B] hover:bg-black/[0.04]'
          }`}
        >
          <span>أوامر وطلبات الشراء</span>
          {purchaseRequests.length > 0 && (
            <span className="px-1.5 py-0.2 rounded-full bg-blue-500 text-white text-[10px]">
              {purchaseRequests.length}
            </span>
          )}
        </button>

        <button
          onClick={() => setActiveTab('customer_requests')}
          className={`px-4 py-2 rounded-xl transition-all flex items-center gap-1.5 ${
            activeTab === 'customer_requests'
              ? 'bg-[#1D1D1F] text-white shadow-sm'
              : 'text-[#86868B] hover:bg-black/[0.04]'
          }`}
        >
          <span>طلبات العملاء غير المتوفرة</span>
          {customerRequests.length > 0 && (
            <span className="px-1.5 py-0.2 rounded-full bg-purple-500 text-white text-[10px]">
              {customerRequests.length}
            </span>
          )}
        </button>

        <button
          onClick={() => setActiveTab('stock_check')}
          className={`px-4 py-2 rounded-xl transition-all flex items-center gap-1.5 ${
            activeTab === 'stock_check'
              ? 'bg-[#1D1D1F] text-white shadow-sm'
              : 'text-[#86868B] hover:bg-black/[0.04]'
          }`}
        >
          <ClipboardList size={13} />
          <span>سجل الجرد الفعلي</span>
        </button>
      </div>

      {/* TAB 1: OVERVIEW & SEARCH */}
      {activeTab === 'overview' && (
        <div className="space-y-4">
          <div className="relative">
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="ابحث عن عطر، ماركة، أو نوع..."
              className="w-full h-11 px-4 pr-10 rounded-2xl bg-white border border-black/[0.08] text-xs outline-none text-right"
            />
            <Search size={16} className="absolute right-3.5 top-1/2 -translate-y-1/2 text-[#86868B]" />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
            {products
              .filter(p => p.name.includes(searchQuery) || p.brand.includes(searchQuery))
              .map(prod => {
                const isSpec = ['عود', 'مسك'].includes(prod.type);
                const rate = isSpec ? settings.priceEssenceSpecial : settings.priceEssenceNormal;
                const costVal = prod.stock_grams * rate;
                const isLow = prod.stock_grams < REORDER_THRESHOLD_GRAMS;

                return (
                  <div 
                    key={prod.id}
                    className={`p-4 rounded-2xl border transition-all ${
                      isLow 
                        ? 'bg-rose-50/50 border-rose-200 shadow-2xs' 
                        : 'bg-white border-black/[0.06] shadow-2xs'
                    }`}
                  >
                    <div className="flex items-start justify-between pb-2 border-b border-black/[0.04]">
                      <div>
                        <h4 className="text-sm font-black text-[#1D1D1F]">{prod.name}</h4>
                        <span className="text-[11px] text-[#86868B]">{prod.brand} · {prod.type}</span>
                      </div>
                      <span className={`text-[10px] px-2 py-0.5 rounded-full font-bold font-mono ${
                        isLow ? 'bg-rose-100 text-rose-800' : 'bg-emerald-100 text-emerald-800'
                      }`}>
                        {prod.stock_grams} جم
                      </span>
                    </div>

                    <div className="pt-2 flex items-center justify-between text-[11px] text-[#86868B]">
                      <span>قيمة المخزون: <strong className="text-[#1D1D1F] font-mono">{costVal} {settings.currency}</strong></span>
                      <button
                        type="button"
                        onClick={() => {
                          setStockCheckProduct(prod);
                          setActualGramsInput(prod.stock_grams);
                          setShowNewStockCheckModal(true);
                        }}
                        className="text-[#0071E3] font-bold hover:underline"
                      >
                        جرد
                      </button>
                    </div>
                  </div>
                );
              })}
          </div>
        </div>
      )}

      {/* TAB: SMART INVENTORY FORECASTING (AI & HISTORICAL VELOCITY ENGINE) */}
      {activeTab === 'forecasting' && (
        <div className="space-y-5 animate-in fade-in duration-200">
          
          {/* Success Banner if Bulk PO was generated */}
          {batchOrderSuccessMessage && (
            <div className="p-4 rounded-2xl bg-emerald-50 border border-emerald-200 text-emerald-950 flex items-center justify-between gap-3 shadow-sm animate-in fade-in slide-in-from-top-1">
              <div className="flex items-center gap-2.5">
                <CheckCircle2 size={20} className="text-emerald-600 shrink-0" />
                <p className="text-xs font-bold leading-relaxed">{batchOrderSuccessMessage}</p>
              </div>
              <button
                type="button"
                onClick={() => setBatchOrderSuccessMessage(null)}
                className="text-emerald-700 hover:text-emerald-900 p-1 rounded-lg"
              >
                <X size={16} />
              </button>
            </div>
          )}

          {/* Forecast Engine Simulation & Control Card */}
          <div className="p-4 sm:p-5 rounded-3xl bg-gradient-to-br from-white via-amber-50/20 to-indigo-50/20 border border-black/[0.08] shadow-apple space-y-4">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 pb-3 border-b border-black/[0.06]">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-2xl bg-gradient-to-tr from-amber-500 to-indigo-600 text-white flex items-center justify-center shadow-sm">
                  <Sparkles size={20} />
                </div>
                <div>
                  <h2 className="text-base font-black text-[#1D1D1F] flex items-center gap-2">
                    <span>محرك التوقعات الاستباقية للزيوت العطرية</span>
                    <span className="text-[10px] px-2 py-0.5 rounded-full bg-amber-100 text-amber-900 font-bold">
                      خوارزمية تحليل الاستهلاك
                    </span>
                  </h2>
                  <p className="text-xs text-[#86868B]">
                    تحليل معدلات السحب اليومية الفعلية، احتساب تواريخ النفاد المقدرة، واقتراح كميات الشراء لتأمين المخزون
                  </p>
                </div>
              </div>

              {/* Action Buttons: Batch PO & CSV */}
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={handleExportForecastCsv}
                  className="apple-btn flex items-center gap-1.5 px-3 py-2 rounded-xl bg-white hover:bg-black/[0.04] text-[#1D1D1F] text-xs font-bold border border-black/[0.08] shadow-2xs transition-all"
                  title="تصدير التوقعات الذكية إلى ملف Excel/CSV"
                >
                  <Download size={14} className="text-[#86868B]" />
                  <span>تصدير كشف (CSV)</span>
                </button>

                <button
                  type="button"
                  disabled={forecastKPIs.criticalCount === 0}
                  onClick={handleCreateBatchForecastPurchaseRequests}
                  className={`apple-btn flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-black shadow-sm transition-all ${
                    forecastKPIs.criticalCount > 0
                      ? 'bg-gradient-to-r from-rose-600 to-amber-600 hover:from-rose-700 hover:to-amber-700 text-white'
                      : 'bg-black/[0.05] text-[#86868B] cursor-not-allowed'
                  }`}
                  title="إنشاء أوامر شراء دفعة واحدة لجميع النواقص الحرجة والعاجلة"
                >
                  <Zap size={14} />
                  <span>توليد أوامر شراء للنواقص ({forecastKPIs.criticalCount})</span>
                </button>
              </div>
            </div>

            {/* Simulation Parameters Grid */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3 pt-1">
              {/* Parameter 1: Analysis Period */}
              <div className="p-3 rounded-2xl bg-white/80 border border-black/[0.05] space-y-1.5">
                <div className="flex items-center justify-between text-[11px] font-bold text-[#86868B]">
                  <span className="flex items-center gap-1">
                    <Calendar size={13} className="text-amber-600" />
                    <span>نافذة التحليل التاريخي:</span>
                  </span>
                  <span className="font-mono text-[#1D1D1F]">{forecastAnalysisDays} يوماً</span>
                </div>
                <div className="grid grid-cols-4 gap-1">
                  {[14, 30, 60, 90].map(days => (
                    <button
                      key={days}
                      type="button"
                      onClick={() => setForecastAnalysisDays(days)}
                      className={`py-1 text-[11px] font-bold rounded-lg transition-all ${
                        forecastAnalysisDays === days
                          ? 'bg-[#1D1D1F] text-white shadow-2xs'
                          : 'bg-black/[0.03] text-[#86868B] hover:bg-black/[0.06]'
                      }`}
                    >
                      {days} يوم
                    </button>
                  ))}
                </div>
              </div>

              {/* Parameter 2: Supplier Lead Time */}
              <div className="p-3 rounded-2xl bg-white/80 border border-black/[0.05] space-y-1.5">
                <div className="flex items-center justify-between text-[11px] font-bold text-[#86868B]">
                  <span className="flex items-center gap-1">
                    <Clock size={13} className="text-indigo-600" />
                    <span>مهلة وصول شحنة المورد:</span>
                  </span>
                  <span className="font-mono text-[#1D1D1F]">{leadTimeDays} أيام</span>
                </div>
                <div className="grid grid-cols-4 gap-1">
                  {[2, 3, 5, 7].map(days => (
                    <button
                      key={days}
                      type="button"
                      onClick={() => setLeadTimeDays(days)}
                      className={`py-1 text-[11px] font-bold rounded-lg transition-all ${
                        leadTimeDays === days
                          ? 'bg-indigo-600 text-white shadow-2xs'
                          : 'bg-black/[0.03] text-[#86868B] hover:bg-black/[0.06]'
                      }`}
                    >
                      {days} {days === 2 ? 'يومان' : 'أيام'}
                    </button>
                  ))}
                </div>
              </div>

              {/* Parameter 3: Target Coverage Horizon */}
              <div className="p-3 rounded-2xl bg-white/80 border border-black/[0.05] space-y-1.5">
                <div className="flex items-center justify-between text-[11px] font-bold text-[#86868B]">
                  <span className="flex items-center gap-1">
                    <Layers size={13} className="text-emerald-600" />
                    <span>فترة التغطية المستهدفة بالشراء:</span>
                  </span>
                  <span className="font-mono text-[#1D1D1F]">{forecastCoverageDays} يوماً</span>
                </div>
                <div className="grid grid-cols-4 gap-1">
                  {[15, 30, 45, 60].map(days => (
                    <button
                      key={days}
                      type="button"
                      onClick={() => setForecastCoverageDays(days)}
                      className={`py-1 text-[11px] font-bold rounded-lg transition-all ${
                        forecastCoverageDays === days
                          ? 'bg-emerald-600 text-white shadow-2xs'
                          : 'bg-black/[0.03] text-[#86868B] hover:bg-black/[0.06]'
                      }`}
                    >
                      {days} يوم
                    </button>
                  ))}
                </div>
              </div>
            </div>
          </div>

          {/* Forecast Executive KPI Badges */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
            <div className="p-4 rounded-3xl bg-white border border-black/[0.06] shadow-apple space-y-1">
              <span className="text-[11px] font-bold text-[#86868B] block">زيوت معرضة للنفاد الوشيك:</span>
              <div className="flex items-baseline gap-1 font-mono">
                <span className={`text-2xl font-black ${forecastKPIs.criticalCount > 0 ? 'text-rose-600' : 'text-emerald-600'}`}>
                  {forecastKPIs.criticalCount}
                </span>
                <span className="text-xs text-[#86868B]">صنف عطر</span>
              </div>
              <span className="text-[10px] text-rose-700 font-bold block pt-0.5">
                تنفد خلال أقل من أسبوع أو انعدم رصيدها
              </span>
            </div>

            <div className="p-4 rounded-3xl bg-white border border-black/[0.06] shadow-apple space-y-1">
              <span className="text-[11px] font-bold text-[#86868B] block">ميزانية التوريد المقترحة ({forecastCoverageDays} يوماً):</span>
              <div className="flex items-baseline gap-1 font-mono">
                <span className="text-2xl font-black text-indigo-600">
                  {forecastKPIs.totalSuggestedBudget.toLocaleString('ar-EG')}
                </span>
                <span className="text-xs text-[#86868B]">{settings.currency}</span>
              </div>
              <span className="text-[10px] text-[#86868B] block pt-0.5">
                لتغطية النواقص والحدود الحرجة بالأسعار المعتمدة
              </span>
            </div>

            <div className="p-4 rounded-3xl bg-white border border-black/[0.06] shadow-apple space-y-1">
              <span className="text-[11px] font-bold text-[#86868B] block">معدل سحب الزيوت اليومي في الفرع:</span>
              <div className="flex items-baseline gap-1 font-mono">
                <span className="text-2xl font-black text-[#1D1D1F]">
                  {forecastKPIs.totalDailyOilConsumption.toFixed(1)}
                </span>
                <span className="text-xs text-[#86868B]">جم/يوم</span>
              </div>
              <span className="text-[10px] text-emerald-700 font-bold block pt-0.5">
                ~ {(forecastKPIs.totalDailyOilConsumption * 30).toFixed(0)} جم شهرياً للمبيعات
              </span>
            </div>

            <div className="p-4 rounded-3xl bg-white border border-black/[0.06] shadow-apple space-y-1">
              <span className="text-[11px] font-bold text-[#86868B] block">العطر الأكثر سحباً وطلباً:</span>
              <div className="truncate font-black text-sm text-[#1D1D1F] pt-1">
                {forecastKPIs.topFastMover?.product.name || 'لا توجد مبيعات'}
              </div>
              <span className="text-[10px] text-purple-700 font-bold block truncate">
                {forecastKPIs.topFastMover 
                  ? `معدل سحب ${forecastKPIs.topFastMover.dailyVelocityGrams.toFixed(1)} جم/يوم (${forecastKPIs.topFastMover.weeklyVelocityGrams.toFixed(0)} جم/أسبوع)`
                  : 'في نافذة التحليل الحالية'}
              </span>
            </div>
          </div>

          {/* Filtering & Sorting Controls Bar */}
          <div className="p-3 sm:p-4 rounded-3xl bg-white border border-black/[0.06] shadow-apple space-y-3">
            {/* Risk Category Tabs */}
            <div className="flex items-center gap-1.5 overflow-x-auto pb-1 text-xs font-bold scrollbar-none">
              <button
                type="button"
                onClick={() => setForecastRiskFilter('all')}
                className={`px-3 py-1.5 rounded-xl transition-all shrink-0 ${
                  forecastRiskFilter === 'all'
                    ? 'bg-[#1D1D1F] text-white shadow-2xs'
                    : 'bg-black/[0.03] text-[#86868B] hover:bg-black/[0.06]'
                }`}
              >
                الكل ({allForecastItems.length})
              </button>

              <button
                type="button"
                onClick={() => setForecastRiskFilter('critical')}
                className={`px-3 py-1.5 rounded-xl transition-all shrink-0 flex items-center gap-1 ${
                  forecastRiskFilter === 'critical'
                    ? 'bg-rose-600 text-white shadow-2xs'
                    : 'bg-rose-50 text-rose-800 hover:bg-rose-100'
                }`}
              >
                <span>🚨 حرج (نفد أو &le; {leadTimeDays + 1} أيام)</span>
                <span className="font-mono text-[10px] px-1.5 py-0.2 rounded-full bg-rose-200/60">
                  {allForecastItems.filter(i => i.riskLevel === 'critical').length}
                </span>
              </button>

              <button
                type="button"
                onClick={() => setForecastRiskFilter('high')}
                className={`px-3 py-1.5 rounded-xl transition-all shrink-0 flex items-center gap-1 ${
                  forecastRiskFilter === 'high'
                    ? 'bg-amber-600 text-white shadow-2xs'
                    : 'bg-amber-50 text-amber-900 hover:bg-amber-100'
                }`}
              >
                <span>⚠️ عالي الخطورة (&le; 7 أيام)</span>
                <span className="font-mono text-[10px] px-1.5 py-0.2 rounded-full bg-amber-200/60">
                  {allForecastItems.filter(i => i.riskLevel === 'high').length}
                </span>
              </button>

              <button
                type="button"
                onClick={() => setForecastRiskFilter('medium')}
                className={`px-3 py-1.5 rounded-xl transition-all shrink-0 flex items-center gap-1 ${
                  forecastRiskFilter === 'medium'
                    ? 'bg-blue-600 text-white shadow-2xs'
                    : 'bg-blue-50 text-blue-900 hover:bg-blue-100'
                }`}
              >
                <span>⚡ متوسط (&le; 14 يوماً)</span>
                <span className="font-mono text-[10px] px-1.5 py-0.2 rounded-full bg-blue-200/60">
                  {allForecastItems.filter(i => i.riskLevel === 'medium').length}
                </span>
              </button>

              <button
                type="button"
                onClick={() => setForecastRiskFilter('safe')}
                className={`px-3 py-1.5 rounded-xl transition-all shrink-0 flex items-center gap-1 ${
                  forecastRiskFilter === 'safe'
                    ? 'bg-emerald-600 text-white shadow-2xs'
                    : 'bg-emerald-50 text-emerald-900 hover:bg-emerald-100'
                }`}
              >
                <span>✅ آمن (+15 يوماً)</span>
                <span className="font-mono text-[10px] px-1.5 py-0.2 rounded-full bg-emerald-200/60">
                  {allForecastItems.filter(i => i.riskLevel === 'safe').length}
                </span>
              </button>

              <button
                type="button"
                onClick={() => setForecastRiskFilter('stagnant')}
                className={`px-3 py-1.5 rounded-xl transition-all shrink-0 flex items-center gap-1 ${
                  forecastRiskFilter === 'stagnant'
                    ? 'bg-gray-700 text-white shadow-2xs'
                    : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                }`}
              >
                <span>💤 راكد (0 سحب)</span>
                <span className="font-mono text-[10px] px-1.5 py-0.2 rounded-full bg-gray-300/60">
                  {allForecastItems.filter(i => i.riskLevel === 'stagnant').length}
                </span>
              </button>
            </div>

            {/* Search and Dropdowns Row */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5 pt-1 text-xs">
              {/* Search */}
              <div className="relative">
                <input
                  type="text"
                  value={forecastSearchQuery}
                  onChange={(e) => setForecastSearchQuery(e.target.value)}
                  placeholder="ابحث باسم العطر أو الماركة..."
                  className="w-full h-10 px-3 pr-9 rounded-xl bg-black/[0.02] border border-black/[0.08] text-xs outline-none text-right font-medium"
                />
                <Search size={15} className="absolute right-3 top-1/2 -translate-y-1/2 text-[#86868B]" />
                {forecastSearchQuery && (
                  <button
                    onClick={() => setForecastSearchQuery('')}
                    className="absolute left-2.5 top-1/2 -translate-y-1/2 text-[#86868B] hover:text-[#1D1D1F]"
                  >
                    <X size={14} />
                  </button>
                )}
              </div>

              {/* Fragrance Type Filter */}
              <div className="flex items-center gap-1.5">
                <Filter size={14} className="text-[#86868B] shrink-0" />
                <select
                  value={forecastTypeFilter}
                  onChange={(e) => setForecastTypeFilter(e.target.value)}
                  className="w-full h-10 px-3 rounded-xl bg-black/[0.02] border border-black/[0.08] text-xs text-right font-bold outline-none"
                >
                  <option value="all">جميع الفئات والأنواع ({products.length})</option>
                  {uniqueFragranceTypes.map(t => (
                    <option key={t} value={t}>نوع: {t}</option>
                  ))}
                </select>
              </div>

              {/* Sort selector */}
              <div className="flex items-center gap-1.5">
                <SlidersHorizontal size={14} className="text-[#86868B] shrink-0" />
                <select
                  value={`${forecastSortBy}-${forecastSortOrder}`}
                  onChange={(e) => {
                    const [by, order] = e.target.value.split('-') as [any, any];
                    setForecastSortBy(by);
                    setForecastSortOrder(order);
                  }}
                  className="w-full h-10 px-3 rounded-xl bg-black/[0.02] border border-black/[0.08] text-xs text-right font-bold outline-none"
                >
                  <option value="daysLeft-asc">الأقرب للنفاد (الأيام المتبقية تصاعدياً)</option>
                  <option value="velocity-desc">الأعلى سحب واستهلاك يومي</option>
                  <option value="suggestedCost-desc">الأعلى تكلفة شراء مقترحة</option>
                  <option value="stock-asc">الأقل رصيداً بالمخزون حالياً</option>
                </select>
              </div>
            </div>
          </div>

          {/* Forecast Items List */}
          {filteredForecastItems.length === 0 ? (
            <div className="p-12 rounded-3xl bg-white text-center space-y-3 border border-black/[0.06] shadow-apple">
              <CheckCircle2 size={36} className="text-emerald-500 mx-auto" />
              <h3 className="text-base font-black text-[#1D1D1F]">لا توجد أصناف تطابق الفلتر المحدد</h3>
              <p className="text-xs text-[#86868B] max-w-md mx-auto">
                جميع العطور في هذا التصنيف ضمن النطاق الآمن أو لا توجد نتائج تطابق معايير البحث الحالية.
              </p>
              <button
                type="button"
                onClick={() => {
                  setForecastRiskFilter('all');
                  setForecastTypeFilter('all');
                  setForecastSearchQuery('');
                }}
                className="px-4 py-2 rounded-xl bg-black/[0.05] hover:bg-black/[0.08] text-xs font-bold text-[#1D1D1F]"
              >
                إعادة ضبط الفلاتر
              </button>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {filteredForecastItems.map(item => {
                const stockRatio = item.safetyStockGrams > 0
                  ? Math.min(100, Math.round((item.currentStock / item.safetyStockGrams) * 100))
                  : 100;

                return (
                  <div
                    key={item.product.id}
                    className={`p-4 sm:p-5 rounded-3xl border transition-all space-y-3 shadow-apple ${
                      item.riskLevel === 'critical'
                        ? 'bg-rose-50/40 border-rose-300 ring-1 ring-rose-200/60'
                        : item.riskLevel === 'high'
                        ? 'bg-amber-50/30 border-amber-300 ring-1 ring-amber-200/50'
                        : item.riskLevel === 'medium'
                        ? 'bg-blue-50/20 border-blue-200'
                        : item.riskLevel === 'stagnant'
                        ? 'bg-gray-50/60 border-black/[0.06]'
                        : 'bg-white border-black/[0.06]'
                    }`}
                  >
                    {/* Header Row: Title, Category, Risk Badge */}
                    <div className="flex items-start justify-between gap-2 pb-2.5 border-b border-black/[0.05]">
                      <div>
                        <div className="flex items-center gap-2">
                          <h3 className="text-base font-black text-[#1D1D1F] leading-tight">
                            {item.product.name}
                          </h3>
                          {/* Sales Trend Badge */}
                          {item.trend === 'surging' && (
                            <span className="inline-flex items-center gap-0.5 text-[10px] px-1.5 py-0.2 rounded-full bg-emerald-100 text-emerald-800 font-bold" title="معدل المبيعات متصاعد مقارنة بالفترة السابقة">
                              <ArrowUpRight size={11} />
                              <span>متصاعد (+{item.trendPercent}%)</span>
                            </span>
                          )}
                          {item.trend === 'slowing' && (
                            <span className="inline-flex items-center gap-0.5 text-[10px] px-1.5 py-0.2 rounded-full bg-amber-100 text-amber-800 font-bold" title="معدل المبيعات متباطئ">
                              <ArrowDownRight size={11} />
                              <span>متباطئ ({item.trendPercent}%)</span>
                            </span>
                          )}
                        </div>
                        <div className="flex items-center gap-1.5 text-xs text-[#86868B] pt-0.5 font-medium">
                          <span>{item.product.brand || 'ماركة أصلية'}</span>
                          <span>•</span>
                          <span className="px-1.5 py-0.2 rounded-md bg-black/[0.04] text-[#1D1D1F] font-bold text-[10px]">
                            {item.product.type}
                          </span>
                          <span>•</span>
                          <span>سعر التكلفة: {item.oilCostPerGram} {settings.currency}/جم</span>
                        </div>
                      </div>

                      {/* Risk Level Badge */}
                      <div className="shrink-0 text-left">
                        {item.riskLevel === 'critical' && (
                          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-xl bg-rose-600 text-white text-[11px] font-black shadow-2xs animate-pulse">
                            <AlertTriangle size={12} />
                            <span>نفاد حرج</span>
                          </span>
                        )}
                        {item.riskLevel === 'high' && (
                          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-xl bg-amber-600 text-white text-[11px] font-bold shadow-2xs">
                            <Clock size={12} />
                            <span>عالي الخطورة</span>
                          </span>
                        )}
                        {item.riskLevel === 'medium' && (
                          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-xl bg-blue-100 text-blue-800 text-[11px] font-bold">
                            <Info size={12} />
                            <span>طلب متوسط</span>
                          </span>
                        )}
                        {item.riskLevel === 'safe' && (
                          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-xl bg-emerald-100 text-emerald-800 text-[11px] font-bold">
                            <CheckCircle2 size={12} />
                            <span>مخزون آمن</span>
                          </span>
                        )}
                        {item.riskLevel === 'stagnant' && (
                          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-xl bg-gray-200 text-gray-700 text-[11px] font-bold">
                            <Package size={12} />
                            <span>صنف راكد</span>
                          </span>
                        )}
                      </div>
                    </div>

                    {/* Operational Velocity & Depletion Metrics Grid */}
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs">
                      {/* Current Stock */}
                      <div className="p-2.5 rounded-2xl bg-white border border-black/[0.04] space-y-0.5">
                        <span className="text-[10px] font-bold text-[#86868B] block">الرصيد الفعلي بالمحل:</span>
                        <div className="font-mono text-sm font-black text-[#1D1D1F]">
                          <span className={item.currentStock <= 0 ? 'text-rose-600' : ''}>
                            {item.currentStock}
                          </span>
                          <span className="text-[10px] text-[#86868B] mr-0.5 font-normal">جم</span>
                        </div>
                        <span className="text-[9px] text-[#86868B] block">
                          حد الأمان: {item.safetyStockGrams} جم
                        </span>
                      </div>

                      {/* Daily Velocity */}
                      <div className="p-2.5 rounded-2xl bg-white border border-black/[0.04] space-y-0.5">
                        <span className="text-[10px] font-bold text-[#86868B] block">معدل السحب اليومي:</span>
                        <div className="font-mono text-sm font-black text-[#1D1D1F]">
                          {item.dailyVelocityGrams.toFixed(1)}
                          <span className="text-[10px] text-[#86868B] mr-0.5 font-normal">جم/يوم</span>
                        </div>
                        <span className="text-[9px] text-indigo-700 font-bold block">
                          ~ {item.weeklyVelocityGrams.toFixed(0)} جم/أسبوع
                        </span>
                      </div>

                      {/* Estimated Runout Days */}
                      <div className="p-2.5 rounded-2xl bg-white border border-black/[0.04] space-y-0.5">
                        <span className="text-[10px] font-bold text-[#86868B] block">الأيام حتى النفاد:</span>
                        <div className="font-mono text-sm font-black">
                          {item.daysOfStockLeft === 999 ? (
                            <span className="text-emerald-700 font-bold text-xs">مستقر (&gt;1سنة)</span>
                          ) : item.daysOfStockLeft <= 0 ? (
                            <span className="text-rose-600 font-bold">منعدم (0 يوم)</span>
                          ) : (
                            <span className={item.daysOfStockLeft <= leadTimeDays + 1 ? 'text-rose-600' : item.daysOfStockLeft <= 7 ? 'text-amber-600' : 'text-[#1D1D1F]'}>
                              {item.daysOfStockLeft.toFixed(1)} <span className="text-[10px] text-[#86868B] font-normal">يوم</span>
                            </span>
                          )}
                        </div>
                        <span className="text-[9px] text-[#86868B] block truncate" title={item.depletionDaysText}>
                          {item.depletionDaysText}
                        </span>
                      </div>

                      {/* Estimated Depletion Date */}
                      <div className="p-2.5 rounded-2xl bg-white border border-black/[0.04] space-y-0.5">
                        <span className="text-[10px] font-bold text-[#86868B] block">تاريخ النفاد المتوقع:</span>
                        <div className="text-[11px] font-black text-[#1D1D1F] truncate" title={item.depletionDate || ''}>
                          {item.depletionDate || 'غير محدد'}
                        </div>
                        <span className="text-[9px] text-amber-800 font-bold block">
                          مهلة المورد: {leadTimeDays} أيام
                        </span>
                      </div>
                    </div>

                    {/* Stock Cover Progress Bar */}
                    <div className="space-y-1">
                      <div className="flex items-center justify-between text-[10px] text-[#86868B]">
                        <span>تغطية الرصيد لحد الأمان:</span>
                        <span className="font-mono font-bold text-[#1D1D1F]">{stockRatio}%</span>
                      </div>
                      <div className="w-full h-1.5 rounded-full bg-black/[0.05] overflow-hidden">
                        <div
                          className={`h-full rounded-full transition-all duration-300 ${
                            stockRatio < 40 
                              ? 'bg-rose-500' 
                              : stockRatio < 90 
                              ? 'bg-amber-500' 
                              : 'bg-emerald-500'
                          }`}
                          style={{ width: `${Math.max(4, stockRatio)}%` }}
                        />
                      </div>
                    </div>

                    {/* Smart Purchasing Recommendation Box */}
                    <div className="p-3 rounded-2xl bg-white border border-black/[0.06] flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs">
                      <div className="space-y-1 flex-1">
                        <div className="flex items-center gap-1.5">
                          <span className="text-[10px] font-bold text-[#86868B]">الكمية المقترحة للشراء:</span>
                          {item.suggestedBatchGrams > 0 ? (
                            <span className="font-mono font-black text-sm text-[#0071E3] bg-blue-50 px-2 py-0.5 rounded-lg border border-blue-200">
                              {item.suggestedBatchGrams} جم زيت
                            </span>
                          ) : (
                            <span className="text-[11px] font-bold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-lg">
                              الرصيد كافٍ ولا يتطلب شراء
                            </span>
                          )}
                          {item.suggestedBatchGrams > 0 && (
                            <span className="text-[11px] text-[#86868B] font-mono font-bold">
                              (~ {item.estimatedPurchaseCost.toLocaleString('ar-EG')} {settings.currency})
                            </span>
                          )}
                        </div>
                        <p className="text-[11px] text-[#86868B] leading-relaxed">
                          {item.reorderReason}
                        </p>
                      </div>

                      {/* Action Buttons */}
                      <div className="flex items-center gap-2 shrink-0">
                        <button
                          type="button"
                          onClick={() => handleOpenWhatsAppModalForProduct(item.product, item.suggestedBatchGrams || 500)}
                          className="apple-btn flex items-center gap-1 px-3 py-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-black shadow-2xs transition-all cursor-pointer"
                        >
                          <span>💬 طلب واتساب المورد</span>
                        </button>

                        {item.suggestedBatchGrams > 0 && (
                          <button
                            type="button"
                            onClick={() => {
                              setSelectedProductForPurchase(item.product);
                              setPurchaseGramsInput(item.suggestedBatchGrams);
                              setPurchasePriority(
                                item.riskLevel === 'critical' ? 'عاجل (نفد)' : 'متوسط (قارب النفاذ)'
                              );
                              setPurchaseNotes(
                                `اقتراح ذكي لتأمين دورة ${forecastCoverageDays} يوم (سحب يومي: ${item.dailyVelocityGrams.toFixed(1)} جم/يوم، ينفد في ${item.depletionDaysText})`
                              );
                              setShowNewPurchaseModal(true);
                            }}
                            className="apple-btn flex items-center gap-1 px-3 py-1.5 rounded-xl bg-[#0071E3] hover:bg-[#0077ED] text-white text-xs font-bold shadow-2xs transition-all cursor-pointer"
                          >
                            <ShoppingCart size={13} />
                            <span>طلب شراء بالنظام</span>
                          </button>
                        )}

                        <button
                          type="button"
                          onClick={() => {
                            setStockCheckProduct(item.product);
                            setActualGramsInput(item.product.stock_grams);
                            setShowNewStockCheckModal(true);
                          }}
                          className="apple-btn flex items-center gap-1 px-2.5 py-1.5 rounded-xl bg-black/[0.04] hover:bg-black/[0.08] text-[#1D1D1F] text-xs font-bold transition-all"
                        >
                          <ClipboardList size={13} className="text-[#86868B]" />
                          <span>جرد</span>
                        </button>
                      </div>
                    </div>

                  </div>
                );
              })}
            </div>
          )}

        </div>
      )}
      {activeTab === 'shortages' && (
        <div className="space-y-4">
          {lowStockProducts.length === 0 ? (
            <div className="p-8 rounded-3xl bg-white text-center space-y-2 border border-black/[0.06]">
              <CheckCircle2 size={32} className="text-emerald-500 mx-auto" />
              <h3 className="text-sm font-black text-[#1D1D1F]">المخزون في وضع آمن ومكتمل</h3>
              <p className="text-xs text-[#86868B]">لا توجد عطور تجاوزت حد إعادة الطلب ({REORDER_THRESHOLD_GRAMS} جم).</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {lowStockProducts.map(p => (
                <div key={p.id} className="p-4 rounded-2xl bg-white border border-rose-200 shadow-sm flex items-center justify-between">
                  <div className="space-y-1">
                    <div className="flex items-center gap-1.5">
                      <AlertTriangle size={15} className="text-rose-600 shrink-0" />
                      <h4 className="text-sm font-black text-[#1D1D1F]">{p.name}</h4>
                    </div>
                    <span className="text-[11px] text-[#86868B] block">الماركة: {p.brand} · الرصيد الحالي: <strong className="text-rose-600 font-mono">{p.stock_grams} جم</strong></span>
                  </div>

                  <button
                    type="button"
                    onClick={() => {
                      setSelectedProductForPurchase(p);
                      setShowNewPurchaseModal(true);
                    }}
                    className="apple-btn px-3 py-1.5 rounded-xl bg-rose-600 text-white text-xs font-bold shadow-2xs hover:bg-rose-700"
                  >
                    طلب شراء
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* TAB 3: PURCHASE REQUESTS */}
      {activeTab === 'purchase_requests' && (
        <div className="space-y-4">
          <div className="flex justify-end">
            <button
              type="button"
              onClick={() => setShowNewPurchaseModal(true)}
              className="apple-btn flex items-center gap-1.5 px-3 py-2 rounded-xl bg-[#0071E3] text-white text-xs font-bold shadow-2xs"
            >
              <Plus size={14} />
              <span>إضافة أمر شراء</span>
            </button>
          </div>

          {purchaseRequests.length === 0 ? (
            <div className="p-8 rounded-3xl bg-white text-center space-y-2 border border-black/[0.06]">
              <Package size={32} className="text-[#86868B] mx-auto" />
              <h3 className="text-sm font-black text-[#1D1D1F]">لا توجد طلبات شراء مسجلة</h3>
              <p className="text-xs text-[#86868B]">يمكن إنشاء طلبات الشراء لاعتمادها من الإدارة قبل التوريد.</p>
            </div>
          ) : (
            <div className="space-y-3">
              {purchaseRequests.map(req => (
                <div key={req.id} className="p-4 rounded-2xl bg-white border border-black/[0.06] shadow-apple flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs">
                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      <h4 className="text-sm font-black text-[#1D1D1F]">{req.productName}</h4>
                      <span className="text-[10px] px-2 py-0.5 rounded-full bg-amber-100 text-amber-900 font-bold">
                        {req.priority}
                      </span>
                    </div>
                    <p className="text-[11px] text-[#86868B]">
                      طلب {req.requestedGrams} جم · تكلفة تقديرية: <strong className="font-mono text-[#1D1D1F]">{req.estimatedCost} {settings.currency}</strong> · بواسطة: {req.requestedBy} ({req.date})
                    </p>
                  </div>

                  <div className="flex items-center gap-2">
                    <span className="text-xs font-bold text-blue-700 bg-blue-50 px-2.5 py-1 rounded-xl">
                      {req.status}
                    </span>
                    {isOwner && req.status === 'قيد الانتظار' && (
                      <button
                        type="button"
                        onClick={() => {
                          const updated: PurchaseRequest = {
                            ...req,
                            status: 'معتمد من د. محمد',
                            approvedBy: currentUser?.displayName,
                            approvedAt: new Date().toISOString()
                          };
                          onSavePurchaseRequest(updated);
                        }}
                        className="px-3 py-1.5 rounded-xl bg-emerald-600 text-white font-bold hover:bg-emerald-700 shadow-2xs"
                      >
                        اعتماد
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* TAB 4: CUSTOMER REQUESTS */}
      {activeTab === 'customer_requests' && (
        <div className="space-y-4">
          <div className="flex justify-end">
            <button
              type="button"
              onClick={() => setShowNewCustomerReqModal(true)}
              className="apple-btn flex items-center gap-1.5 px-3 py-2 rounded-xl bg-purple-600 text-white text-xs font-bold shadow-2xs"
            >
              <Plus size={14} />
              <span>تسجيل طلب عميل</span>
            </button>
          </div>

          {customerRequests.length === 0 ? (
            <div className="p-8 rounded-3xl bg-white text-center space-y-2 border border-black/[0.06]">
              <UserPlus size={32} className="text-purple-400 mx-auto" />
              <h3 className="text-sm font-black text-[#1D1D1F]">لا توجد طلبات عملاء معلقة</h3>
              <p className="text-xs text-[#86868B]">سجل أي عطر يطلبه عميل وغير متوفر بالمحل لمتابعته فور توفره.</p>
            </div>
          ) : (
            <div className="space-y-3">
              {customerRequests.map(req => (
                <div key={req.id} className="p-4 rounded-2xl bg-white border border-black/[0.06] shadow-apple flex items-center justify-between text-xs">
                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      <h4 className="text-sm font-black text-[#1D1D1F]">{req.requestedPerfume}</h4>
                      <span className="text-[10px] px-2 py-0.5 rounded-full bg-purple-100 text-purple-800 font-bold">
                        {req.preferredSizeMl} مل
                      </span>
                    </div>
                    <span className="text-[11px] text-[#86868B] block">
                      العميل: <strong className="text-[#1D1D1F]">{req.customerName}</strong> · هاتف: <span className="font-mono">{req.customerPhone}</span>
                    </span>
                  </div>

                  <span className="text-xs font-bold text-purple-700 bg-purple-50 px-2.5 py-1 rounded-xl">
                    {req.status}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* TAB 5: STOCK CHECK RECORDS */}
      {activeTab === 'stock_check' && (
        <div className="space-y-4">
          {stockChecks.length === 0 ? (
            <div className="p-8 rounded-3xl bg-white text-center space-y-2 border border-black/[0.06]">
              <ClipboardList size={32} className="text-[#86868B] mx-auto" />
              <h3 className="text-sm font-black text-[#1D1D1F]">لا توجد عمليات جرد مسجلة</h3>
              <p className="text-xs text-[#86868B]">يمكن تسجيل جرد فعلي لأي عطر ومقارنته بالرصيد الدفتري.</p>
            </div>
          ) : (
            <div className="space-y-3">
              {stockChecks.map(check => (
                <div key={check.id} className="p-4 rounded-2xl bg-white border border-black/[0.06] shadow-apple flex items-center justify-between text-xs">
                  <div className="space-y-1">
                    <h4 className="text-sm font-black text-[#1D1D1F]">{check.productName}</h4>
                    <span className="text-[11px] text-[#86868B] block">
                      دفتري: {check.systemGrams} جم · فعلي: <strong className="text-[#1D1D1F] font-mono">{check.actualGrams} جم</strong> · الفارق: <strong className={check.differenceGrams < 0 ? 'text-rose-600' : 'text-emerald-600'}>{check.differenceGrams} جم ({check.varianceCost} ج)</strong>
                    </span>
                    <span className="text-[10px] text-[#86868B] block">الجرد بواسطة: {check.performedBy} ({check.date})</span>
                  </div>

                  <span className="text-xs font-bold text-emerald-700 bg-emerald-50 px-2.5 py-1 rounded-xl">
                    {check.status}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* MODAL: CREATE PURCHASE REQUEST */}
      {showNewPurchaseModal && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4 animate-in fade-in duration-150">
          <div className="apple-glass rounded-3xl p-6 w-full max-w-md border border-white/60 shadow-2xl space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-black/[0.06]">
              <h3 className="text-base font-black text-[#1D1D1F]">إنشاء طلب شراء وتوريد خامات</h3>
              <button onClick={() => setShowNewPurchaseModal(false)} className="w-8 h-8 rounded-full bg-black/[0.05] flex items-center justify-center text-[#86868B]">
                <X size={16} />
              </button>
            </div>

            <form onSubmit={handleCreatePurchaseRequest} className="space-y-3 text-xs">
              <div className="space-y-1">
                <label className="font-bold text-[#1D1D1F] block text-right">اختر العطر المطلوب شراؤه:</label>
                <select
                  value={selectedProductForPurchase?.id || ''}
                  onChange={(e) => {
                    const prod = products.find(p => p.id.toString() === e.target.value);
                    setSelectedProductForPurchase(prod || null);
                  }}
                  className="w-full h-10 px-3 rounded-xl bg-white border border-black/[0.08] text-right font-bold outline-none"
                  required
                >
                  <option value="">-- اختر من الكتالوج --</option>
                  {products.map(p => (
                    <option key={p.id} value={p.id}>{p.name} ({p.brand}) - الرصيد: {p.stock_grams} جم</option>
                  ))}
                </select>
              </div>

              <div className="space-y-1">
                <label className="font-bold text-[#1D1D1F] block text-right">الكمية المطلوبة (بالجرام):</label>
                <input
                  type="number"
                  value={purchaseGramsInput}
                  onChange={(e) => setPurchaseGramsInput(Number(e.target.value))}
                  placeholder="500"
                  className="w-full h-10 px-3 rounded-xl bg-white border border-black/[0.08] font-mono text-right font-bold outline-none"
                  required
                />
              </div>

              <div className="space-y-1">
                <label className="font-bold text-[#1D1D1F] block text-right">درجة الأهمية:</label>
                <select
                  value={purchasePriority}
                  onChange={(e) => setPurchasePriority(e.target.value as any)}
                  className="w-full h-10 px-3 rounded-xl bg-white border border-black/[0.08] text-right font-bold outline-none"
                >
                  <option value="عاجل (نفد)">عاجل (نفد المخزون تماماً)</option>
                  <option value="متوسط (قارب النفاذ)">متوسط (قارب على النفاذ)</option>
                  <option value="روتيني">روتيني وتجديد</option>
                </select>
              </div>

              <div className="space-y-1">
                <label className="font-bold text-[#86868B] block text-right">ملاحظات أو مورد مقترح:</label>
                <input
                  type="text"
                  value={purchaseNotes}
                  onChange={(e) => setPurchaseNotes(e.target.value)}
                  placeholder="مثال: جودة فرنسية لوزي أو جيفودان..."
                  className="w-full h-10 px-3 rounded-xl bg-white border border-black/[0.08] text-right outline-none"
                />
              </div>

              <div className="flex items-center gap-2 pt-3 border-t border-black/[0.06]">
                <button
                  type="button"
                  onClick={() => setShowNewPurchaseModal(false)}
                  className="flex-1 py-2.5 rounded-xl border border-black/[0.08] text-xs font-bold text-[#1D1D1F]"
                >
                  إلغاء
                </button>
                <button
                  type="submit"
                  className="flex-2 py-2.5 rounded-xl bg-[#0071E3] hover:bg-[#0077ED] text-white text-xs font-bold shadow-sm"
                >
                  حفظ طلب الشراء
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL: CREATE CUSTOMER MISSING REQUEST */}
      {showNewCustomerReqModal && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4 animate-in fade-in duration-150">
          <div className="apple-glass rounded-3xl p-6 w-full max-w-md border border-white/60 shadow-2xl space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-black/[0.06]">
              <h3 className="text-base font-black text-[#1D1D1F]">تسجيل طلب عميل لعطر غير متوفر</h3>
              <button onClick={() => setShowNewCustomerReqModal(false)} className="w-8 h-8 rounded-full bg-black/[0.05] flex items-center justify-center text-[#86868B]">
                <X size={16} />
              </button>
            </div>

            <form onSubmit={handleCreateCustomerRequest} className="space-y-3 text-xs">
              <div className="space-y-1">
                <label className="font-bold text-[#1D1D1F] block text-right">اسم العطر المطلوب:</label>
                <input
                  type="text"
                  value={custPerfume}
                  onChange={(e) => setCustPerfume(e.target.value)}
                  placeholder="مثال: ديور هوم إنتنس..."
                  className="w-full h-10 px-3 rounded-xl bg-white border border-black/[0.08] text-right font-bold outline-none"
                  required
                />
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div className="space-y-1">
                  <label className="font-bold text-[#1D1D1F] block text-right">اسم العميل:</label>
                  <input
                    type="text"
                    value={custName}
                    onChange={(e) => setCustName(e.target.value)}
                    placeholder="اسم العميل..."
                    className="w-full h-10 px-3 rounded-xl bg-white border border-black/[0.08] text-right outline-none"
                    required
                  />
                </div>
                <div className="space-y-1">
                  <label className="font-bold text-[#1D1D1F] block text-right">رقم الهاتف/واتساب:</label>
                  <input
                    type="text"
                    value={custPhone}
                    onChange={(e) => setCustPhone(e.target.value)}
                    placeholder="01xxxxxxxxx"
                    className="w-full h-10 px-3 rounded-xl bg-white border border-black/[0.08] text-right font-mono outline-none"
                    required
                  />
                </div>
              </div>

              <div className="space-y-1">
                <label className="font-bold text-[#1D1D1F] block text-right">الحجم المرغوب:</label>
                <select
                  value={custSize}
                  onChange={(e) => setCustSize(Number(e.target.value))}
                  className="w-full h-10 px-3 rounded-xl bg-white border border-black/[0.08] text-right font-bold outline-none"
                >
                  <option value={100}>100 مل</option>
                  <option value={50}>50 مل</option>
                  <option value={30}>30 مل</option>
                  <option value={25}>25 مل</option>
                  <option value={20}>20 مل</option>
                  <option value={10}>10 مل</option>
                </select>
              </div>

              <div className="flex items-center gap-2 pt-3 border-t border-black/[0.06]">
                <button
                  type="button"
                  onClick={() => setShowNewCustomerReqModal(false)}
                  className="flex-1 py-2.5 rounded-xl border border-black/[0.08] text-xs font-bold text-[#1D1D1F]"
                >
                  إلغاء
                </button>
                <button
                  type="submit"
                  className="flex-2 py-2.5 rounded-xl bg-purple-600 hover:bg-purple-700 text-white text-xs font-bold shadow-sm"
                >
                  حفظ ومتابعة الطلب
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL: STOCKTAKING CHECK */}
      {showNewStockCheckModal && stockCheckProduct && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4 animate-in fade-in duration-150">
          <div className="apple-glass rounded-3xl p-6 w-full max-w-md border border-white/60 shadow-2xl space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-black/[0.06]">
              <h3 className="text-base font-black text-[#1D1D1F]">تسجيل جرد فعلي لـ ({stockCheckProduct.name})</h3>
              <button onClick={() => setShowNewStockCheckModal(false)} className="w-8 h-8 rounded-full bg-black/[0.05] flex items-center justify-center text-[#86868B]">
                <X size={16} />
              </button>
            </div>

            <form onSubmit={handleCreateStockCheck} className="space-y-3 text-xs">
              <div className="p-3 rounded-xl bg-black/[0.03] flex justify-between">
                <span>الرصيد الدفتري المسجل:</span>
                <strong className="font-mono text-sm">{stockCheckProduct.stock_grams} جم</strong>
              </div>

              <div className="space-y-1">
                <label className="font-bold text-[#1D1D1F] block text-right">الوزن الفعلي بالميزان (جم):</label>
                <input
                  type="number"
                  value={actualGramsInput}
                  onChange={(e) => setActualGramsInput(e.target.value === '' ? '' : Number(e.target.value))}
                  placeholder={`${stockCheckProduct.stock_grams}`}
                  className="w-full h-11 px-3 rounded-xl bg-white border border-black/[0.08] font-mono text-sm font-black text-right outline-none"
                  required
                />
              </div>

              {actualGramsInput !== '' && (
                <div className={`p-2.5 rounded-xl font-bold flex justify-between ${
                  Number(actualGramsInput) - stockCheckProduct.stock_grams === 0
                    ? 'bg-emerald-100 text-emerald-900'
                    : 'bg-rose-100 text-rose-900'
                }`}>
                  <span>الفارق الفعلي:</span>
                  <span className="font-mono">
                    {Number(actualGramsInput) - stockCheckProduct.stock_grams} جم
                  </span>
                </div>
              )}

              <div className="space-y-1">
                <label className="font-bold text-[#86868B] block text-right">مبرر الفارق / ملاحظات:</label>
                <input
                  type="text"
                  value={stockCheckReason}
                  onChange={(e) => setStockCheckReason(e.target.value)}
                  placeholder="مثال: هالك تبخير أو قطرات أثناء التحضير..."
                  className="w-full h-10 px-3 rounded-xl bg-white border border-black/[0.08] text-right outline-none"
                />
              </div>

              <div className="flex items-center gap-2 pt-3 border-t border-black/[0.06]">
                <button
                  type="button"
                  onClick={() => setShowNewStockCheckModal(false)}
                  className="flex-1 py-2.5 rounded-xl border border-black/[0.08] text-xs font-bold text-[#1D1D1F]"
                >
                  إلغاء
                </button>
                <button
                  type="submit"
                  className="flex-2 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold shadow-sm"
                >
                  اعتماد وتحديث الرصيد الفعلي
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Strategic Replenishment Order Modal */}
      {activeReplenishmentOrder && (
        <StrategicReplenishmentModal
          isOpen={showStrategicReplenishmentModal}
          onClose={() => setShowStrategicReplenishmentModal(false)}
          order={activeReplenishmentOrder}
          onUpdateOrder={(updated) => {
            setActiveReplenishmentOrder(updated);
            if (onSaveStrategicOrder) onSaveStrategicOrder(updated);
          }}
          allProducts={products}
          settings={settings}
          currentUser={currentUser}
          onAddAuditLog={onAddAuditLog}
        />
      )}

      {/* MODAL: WHATSAPP SUPPLIER QUICK ORDER */}
      {showWhatsAppSupplierModal && whatsAppTargetProduct && (
        <div className="fixed inset-0 z-[120] bg-black/65 backdrop-blur-md flex items-center justify-center p-3 sm:p-6 pb-24 sm:pb-8 animate-in fade-in duration-150">
          <div className="apple-glass rounded-[28px] w-full max-w-lg border border-emerald-500/30 shadow-2xl bg-slate-900 text-white flex flex-col max-h-[85vh] overflow-hidden">
            {/* Header */}
            <div className="p-4 sm:p-5 border-b border-slate-800 bg-gradient-to-r from-emerald-950 via-slate-900 to-slate-900 flex items-center justify-between shrink-0">
              <div className="flex items-center gap-2.5">
                <div className="w-10 h-10 rounded-2xl bg-emerald-500/20 text-emerald-400 flex items-center justify-center border border-emerald-500/30 font-bold text-lg">
                  💬
                </div>
                <div>
                  <h3 className="text-base font-black text-white">طلب كمية عاجلة عبر واتساب المورد</h3>
                  <p className="text-xs text-emerald-300/80">
                    إرسال الطلبيّة مباشرةً لمورد زيت ({whatsAppTargetProduct.name})
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setShowWhatsAppSupplierModal(false)}
                className="w-8 h-8 rounded-full bg-white/10 hover:bg-white/20 flex items-center justify-center text-slate-300"
              >
                <X size={16} />
              </button>
            </div>

            {/* Modal Body */}
            <div className="p-4 sm:p-6 space-y-4 flex-1 overflow-y-auto text-xs">
              {/* Target Oil Card */}
              <div className="p-3.5 rounded-2xl bg-slate-800/80 border border-slate-700/80 flex items-center justify-between">
                <div>
                  <span className="text-[10px] text-emerald-400 font-bold block">الزيت المطلوبة كميته:</span>
                  <span className="text-sm font-black text-white block">{whatsAppTargetProduct.name}</span>
                  <span className="text-[10px] text-slate-400">{whatsAppTargetProduct.brand} · النوع: {whatsAppTargetProduct.type}</span>
                </div>
                <div className="text-left font-mono">
                  <span className="text-xs text-rose-400 font-black block">الرصيد الحرج: {whatsAppTargetProduct.stock_grams} جم</span>
                  <span className="text-[10px] text-slate-400">سعر الجرام: {getApprovedOilGramCost(whatsAppTargetProduct.type, settings)} ج</span>
                </div>
              </div>

              {/* Inputs */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="space-y-1">
                  <label className="font-bold text-slate-300 block">رقم واتساب المورد:</label>
                  <input
                    type="text"
                    value={supplierPhone}
                    onChange={(e) => setSupplierPhone(e.target.value)}
                    placeholder="201000000000"
                    className="w-full h-10 px-3 rounded-xl bg-slate-800 border border-slate-700 font-mono text-white text-left text-xs font-bold outline-none focus:border-emerald-500"
                    dir="ltr"
                  />
                </div>
                <div className="space-y-1">
                  <label className="font-bold text-slate-300 block">الكمية المطلوبة (جرام):</label>
                  <select
                    value={whatsAppOrderGrams}
                    onChange={(e) => setWhatsAppOrderGrams(Number(e.target.value))}
                    className="w-full h-10 px-3 rounded-xl bg-slate-800 border border-slate-700 text-white text-xs font-bold outline-none focus:border-emerald-500"
                  >
                    <option value={250}>250 جرام (ربع كيلو)</option>
                    <option value={500}>500 جرام (نصف كيلو)</option>
                    <option value={1000}>1000 جرام (1 كيلو)</option>
                    <option value={2000}>2000 جرام (2 كيلو)</option>
                    <option value={5000}>5000 جرام (5 كيلو عبوة مصنع)</option>
                  </select>
                </div>
              </div>

              {/* Message Preview */}
              <div className="space-y-1">
                <span className="font-bold text-slate-300 block">معاينة نص الرسالة المجهزة:</span>
                <div className="p-3.5 rounded-2xl bg-emerald-950/40 border border-emerald-800/40 text-[11px] font-sans text-emerald-100 whitespace-pre-line leading-relaxed">
                  {`السلام عليكم ورحمة الله وبركاته 🌸\n` +
                  `طلب توريد زيت عطري عاجل - ${settings?.storeName || 'متجر لمسة عطر'}\n\n` +
                  `📌 اسم الزيت: ${whatsAppTargetProduct.name} (${whatsAppTargetProduct.brand || 'فرنسي'})\n` +
                  `💧 المخزون الفعلي المتبقي بالمحل: ${whatsAppTargetProduct.stock_grams} جرام\n` +
                  `📦 الكمية المطلوبة للشراء: ${whatsAppOrderGrams} جرام\n` +
                  `⚡ الأولوية: عاجل جداً (نواقص حرج)`}
                </div>
              </div>
            </div>

            {/* Modal Footer (Sticky, Always Visible) */}
            <div className="p-4 border-t border-slate-800 bg-slate-900/95 sticky bottom-0 z-20 flex items-center justify-between gap-3 shrink-0">
              <button
                type="button"
                onClick={() => setShowWhatsAppSupplierModal(false)}
                className="px-4 py-2.5 rounded-xl border border-slate-700 text-xs font-bold text-slate-300 hover:bg-slate-800"
              >
                إلغاء
              </button>
              <button
                type="button"
                onClick={handleSendWhatsAppSupplierOrder}
                className="flex-1 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-black flex items-center justify-center gap-2 shadow-lg cursor-pointer"
              >
                <span>📱 إرسال الطلب فوراً عبر واتساب المورد</span>
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
};

export default InventoryIntelligence;
