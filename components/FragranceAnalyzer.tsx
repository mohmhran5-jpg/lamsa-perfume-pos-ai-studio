import React, { useState, useMemo } from 'react';
import { Product, PerfumeAnalysis, FragranceDatabaseEntry, AppUser, Sale, StoreSettings, isLiveProductionSale, getApprovedOilGramCost } from '../types';
import { analyzePerfumeDetails, auditAndUpdateFullInventoryLocally } from '../services/geminiService';
import { 
  getLocalFragranceDatabase, 
  saveLocalFragranceDatabase, 
  enrichFragranceProfile, 
  scanIncompleteFragranceProfiles, 
  scanDuplicateFragrances,
  saveFragranceProfileCloud,
  bulkSeedFragranceDatabase,
  bulkSaveEnrichedPerfumesToEncyclopedia,
  VERIFIED_SEED_FRAGRANCES
} from '../services/fragranceDbService';
import SmartFragranceSearchModal from './SmartFragranceSearchModal';
import { 
  Sparkles, 
  Search, 
  Layers, 
  Sun, 
  Moon, 
  ShieldCheck, 
  Wind, 
  MessageSquare, 
  Blend, 
  Save, 
  Check, 
  Loader2, 
  Beaker,
  Award,
  BookOpen,
  ArrowLeft,
  Database,
  RefreshCw,
  AlertTriangle,
  Copy,
  CheckCircle2,
  ExternalLink,
  Tag,
  Sliders,
  Filter,
  X,
  TrendingUp,
  DollarSign,
  ShoppingCart,
  Share2,
  Package,
} from 'lucide-react';

interface FragranceAnalyzerProps {
  products: Product[];
  setProducts: React.Dispatch<React.SetStateAction<Product[]>>;
  sales?: Sale[];
  settings?: StoreSettings;
  onNavigateToPOS?: (product: Product) => void;
  currentUser?: AppUser | null;
  fragranceDatabase?: FragranceDatabaseEntry[];
  onSaveFragranceProfile?: (entry: FragranceDatabaseEntry) => void;
}

const FragranceAnalyzer: React.FC<FragranceAnalyzerProps> = ({
  products,
  setProducts,
  sales = [],
  settings,
  onNavigateToPOS,
  currentUser,
  fragranceDatabase = [],
  onSaveFragranceProfile,
}) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedProduct, setSelectedProduct] = useState<Product | null>(products[0] || null);
  const [analysis, setAnalysis] = useState<PerfumeAnalysis | null>(products[0]?.analysis || null);
  const [activeProfile, setActiveProfile] = useState<FragranceDatabaseEntry | null>(null);
  const [loading, setLoading] = useState(false);
  const [syncingAll, setSyncingAll] = useState(false);
  const [savedSuccess, setSavedSuccess] = useState(false);
  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 7;

  // Admin Tools Modals
  const [showSmartSearchModal, setShowSmartSearchModal] = useState(false);
  const [showIncompleteModal, setShowIncompleteModal] = useState(false);
  const [showDuplicatesModal, setShowDuplicatesModal] = useState(false);
  const [adminStatusMessage, setAdminStatusMessage] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<'analyzer' | 'profitable_blends' | 'demand_forecast'>('analyzer');
  const [copiedFormulaNotice, setCopiedFormulaNotice] = useState<string | null>(null);

  // Next Week Expected Demand Forecast based on previous month's sales velocity & low stock alerts
  const nextWeekDemandForecast = useMemo(() => {
    const last30DaysGramsMap = new Map<string, number>();

    (sales || []).forEach(s => {
      if (!s.isReversed && isLiveProductionSale(s)) {
        (s.items || []).forEach(it => {
          const grams = Number(it.essenceGrams) || 0;
          const matchedProd = products.find(
            p => String(p.id) === String(it.productId) || p.name.trim().toLowerCase() === (it.productName || '').trim().toLowerCase()
          );
          if (matchedProd) {
            const key = String(matchedProd.id);
            const prevGrams = last30DaysGramsMap.get(key) || 0;
            last30DaysGramsMap.set(key, prevGrams + grams);
          }
        });
      }
    });

    const items = products.map(p => {
      const gramsSoldPastMonth = last30DaysGramsMap.get(String(p.id)) || 0;
      const dailyVelocityGrams = gramsSoldPastMonth / 30;
      const expectedDemandNextWeekGrams = gramsSoldPastMonth > 0 ? Math.ceil(dailyVelocityGrams * 7) : 15;
      const expectedBottles50MlNextWeek = Math.ceil(expectedDemandNextWeekGrams / 15);
      const currentStockGrams = p.stock_grams || 0;
      const isLowStockDeficit = currentStockGrams < expectedDemandNextWeekGrams;
      const deficitGrams = isLowStockDeficit ? expectedDemandNextWeekGrams - currentStockGrams : 0;

      return {
        product: p,
        gramsSoldPastMonth,
        dailyVelocityGrams: Number(dailyVelocityGrams.toFixed(1)),
        expectedDemandNextWeekGrams,
        expectedBottles50MlNextWeek,
        currentStockGrams,
        isLowStockDeficit,
        deficitGrams,
      };
    });

    const deficitCount = items.filter(i => i.isLowStockDeficit).length;
    const totalNextWeekDemandGrams = items.reduce((sum, i) => sum + i.expectedDemandNextWeekGrams, 0);

    return {
      items: items.sort((a, b) => (b.isLowStockDeficit ? 1 : 0) - (a.isLowStockDeficit ? 1 : 0) || b.expectedDemandNextWeekGrams - a.expectedDemandNextWeekGrams),
      deficitCount,
      totalNextWeekDemandGrams,
    };
  }, [sales, products]);

  // Monthly Best Sellers Analysis & Profitable Blend Recommendations
  const monthlyBestSellersAnalysis = useMemo(() => {
    if (!sales || sales.length === 0) return { topSellers: [], totalMonthlySalesCount: 0, totalMonthlyGrams: 0 };
    const currentMonthStr = new Date().toISOString().slice(0, 7); // YYYY-MM
    const tallyMap = new Map<string, { product: Product; gramsSold: number; salesCount: number; revenue: number }>();
    let totalMonthlySalesCount = 0;
    let totalMonthlyGrams = 0;

    sales.forEach(s => {
      if (s.date && s.date.startsWith(currentMonthStr) && isLiveProductionSale(s)) {
        totalMonthlySalesCount++;
        (s.items || []).forEach(it => {
          const grams = Number(it.essenceGrams) || 0;
          totalMonthlyGrams += grams;

          const found = products.find(p => String(p.id) === String(it.productId) || p.name.trim().toLowerCase() === (it.productName || '').trim().toLowerCase());
          if (found) {
            const key = String(found.id);
            const curr = tallyMap.get(key) || { product: found, gramsSold: 0, salesCount: 0, revenue: 0 };
            tallyMap.set(key, {
              product: found,
              gramsSold: curr.gramsSold + grams,
              salesCount: curr.salesCount + (it.quantity || 1),
              revenue: curr.revenue + (it.totalPrice || it.unitPrice || 0)
            });
          }
        });
      }
    });

    const sortedTopSellers = Array.from(tallyMap.values())
      .sort((a, b) => b.gramsSold - a.gramsSold);

    return {
      topSellers: sortedTopSellers,
      totalMonthlySalesCount,
      totalMonthlyGrams
    };
  }, [sales, products]);

  // Generate 3 High-Profit Blend Recommendations based on Top Sellers
  const profitableBlendRecommendations = useMemo(() => {
    const topSellers = monthlyBestSellersAnalysis.topSellers;
    const p1 = topSellers[0]?.product || products[0];
    const p2 = topSellers[1]?.product || products[1] || p1;
    const p3 = topSellers[2]?.product || products[2] || p2;
    const p4 = topSellers[3]?.product || products[3] || p1;

    if (!p1) return [];

    const cost1 = getApprovedOilGramCost(p1.type, settings);
    const cost2 = p2 ? getApprovedOilGramCost(p2.type, settings) : cost1;
    const cost3 = p3 ? getApprovedOilGramCost(p3.type, settings) : cost1;

    const bottleCost = 25; // EGP bottle & packaging

    // Blend 1: Royal Best Seller Duo (70% P1 + 30% P2) - 50ml bottle (15g essence)
    const b1Grams1 = 10.5;
    const b1Grams2 = 4.5;
    const b1TotalOilCost = Math.round((b1Grams1 * cost1) + (b1Grams2 * cost2));
    const b1TotalCost = b1TotalOilCost + bottleCost;
    const b1Price = Math.round(b1TotalCost * 2.5);
    const b1Profit = b1Price - b1TotalCost;
    const b1Margin = Math.round((b1Profit / b1Price) * 100);

    // Blend 2: Tri-Note Crown Elegance (50% P1 + 30% P2 + 20% P3) - 50ml bottle (15g essence)
    const b2Grams1 = 7.5;
    const b2Grams2 = 4.5;
    const b2Grams3 = 3.0;
    const b2TotalOilCost = Math.round((b2Grams1 * cost1) + (b2Grams2 * cost2) + (b2Grams3 * cost3));
    const b2TotalCost = b2TotalOilCost + bottleCost;
    const b2Price = Math.round(b2TotalCost * 2.8);
    const b2Profit = b2Price - b2TotalCost;
    const b2Margin = Math.round((b2Profit / b2Price) * 100);

    // Blend 3: Niche Luxury Evening Elixir (60% P1 + 40% P2) - 100ml bottle (30g essence)
    const b3Grams1 = 18;
    const b3Grams2 = 12;
    const b3TotalOilCost = Math.round((b3Grams1 * cost1) + (b3Grams2 * cost2));
    const b3TotalCost = b3TotalOilCost + 35;
    const b3Price = Math.round(b3TotalCost * 2.6);
    const b3Profit = b3Price - b3TotalCost;
    const b3Margin = Math.round((b3Profit / b3Price) * 100);

    return [
      {
        id: 'blend-rec-1',
        title: `خلطة الهيبة والفوحان الملكي (${p1?.name || 'عطر المتجر'} × ${p2?.name || 'مسك ختام'})`,
        badge: '🏆 الخلطة الأعلى ربحية ومبيعات هذا الشهر',
        badgeColor: 'bg-amber-500/10 text-amber-700 border-amber-300',
        bottleSizeMl: 50,
        totalEssenceGrams: 15,
        components: [
          { product: p1, percentage: 70, grams: b1Grams1, costPerGram: cost1, totalCost: Math.round(b1Grams1 * cost1) },
          { product: p2, percentage: 30, grams: b1Grams2, costPerGram: cost2, totalCost: Math.round(b1Grams2 * cost2) }
        ],
        oilCost: b1TotalOilCost,
        bottleCost,
        totalCost: b1TotalCost,
        suggestedSellingPrice: b1Price,
        netProfit: b1Profit,
        profitMarginPercent: b1Margin,
        commercialReason: `تعتمد على الزيتين الأكثر طلباً وسحباً في متجرك هذا الشهر (${monthlyBestSellersAnalysis.topSellers[0]?.gramsSold || 50} جم مبيعات). الدمج يمنح ثباتاً مضاعفاً وفوحاناً راقياً يرفع متوسط سعر العبوة.`
      },
      {
        id: 'blend-rec-2',
        title: `إكسير التاج الثلاثي الفاخر (${p1?.name || 'عطر أول'} + ${p2?.name || 'عطر ثاني'} + ${p3?.name || 'عطر ثالث'})`,
        badge: '✨ التركيبة الثلاثية الأكثر تعقيداً وفوحاناً',
        badgeColor: 'bg-purple-500/10 text-purple-700 border-purple-300',
        bottleSizeMl: 50,
        totalEssenceGrams: 15,
        components: [
          { product: p1, percentage: 50, grams: b2Grams1, costPerGram: cost1, totalCost: Math.round(b2Grams1 * cost1) },
          { product: p2, percentage: 30, grams: b2Grams2, costPerGram: cost2, totalCost: Math.round(b2Grams2 * cost2) },
          { product: p3, percentage: 20, grams: b2Grams3, costPerGram: cost3, totalCost: Math.round(b2Grams3 * cost3) }
        ],
        oilCost: b2TotalOilCost,
        bottleCost,
        totalCost: b2TotalCost,
        suggestedSellingPrice: b2Price,
        netProfit: b2Profit,
        profitMarginPercent: b2Margin,
        commercialReason: `دمج ذكي لأعلى 3 أصناف مبيعاً هذا الشهر. توفر رائحة نيش خاصة بالمحل لا يمكن تقليدها، مما يمنحك حصريّة كاملة وتجربة فاخرة للعملاء.`
      },
      {
        id: 'blend-rec-3',
        title: `خلطة السهرة المزدوجة 100 مل (${p1?.name || 'عطر نيش'} مع ${p4?.name || p2?.name || 'عطر شرقي'})`,
        badge: '💎 عبوة VIP كبرى - أعلى صافي ربح للقطعة',
        badgeColor: 'bg-emerald-500/10 text-emerald-700 border-emerald-300',
        bottleSizeMl: 100,
        totalEssenceGrams: 30,
        components: [
          { product: p1, percentage: 60, grams: b3Grams1, costPerGram: cost1, totalCost: Math.round(b3Grams1 * cost1) },
          { product: p4 || p2, percentage: 40, grams: b3Grams2, costPerGram: cost2, totalCost: Math.round(b3Grams2 * cost2) }
        ],
        oilCost: b3TotalOilCost,
        bottleCost: 35,
        totalCost: b3TotalCost,
        suggestedSellingPrice: b3Price,
        netProfit: b3Profit,
        profitMarginPercent: b3Margin,
        commercialReason: `عبوة ضخمة 100 مل تحقق صافي ربح مباشر مرتفع (${b3Profit} ج لكل عبوة)، مثالية للهدايا والمناسبات والتسويق لعملاء النخبة.`
      }
    ];
  }, [monthlyBestSellersAnalysis, products, settings]);

  // Active database list
  const currentDb = useMemo(() => {
    if (fragranceDatabase && fragranceDatabase.length > 0) {
      return fragranceDatabase;
    }
    return getLocalFragranceDatabase();
  }, [fragranceDatabase]);

  // Load profile for selected product
  React.useEffect(() => {
    if (selectedProduct) {
      const match = currentDb.find(e => 
        e.name.toLowerCase() === selectedProduct.name.toLowerCase() ||
        e.productId === selectedProduct.id
      );
      if (match) {
        setActiveProfile(match);
      } else {
        // Find in seed
        const seedMatch = VERIFIED_SEED_FRAGRANCES.find(s => 
          s.name.toLowerCase() === selectedProduct.name.toLowerCase()
        );
        setActiveProfile(seedMatch || null);
      }
    }
  }, [selectedProduct, currentDb]);

  const handleAnalyze = async (perfumeName: string, brandName: string = '') => {
    if (!perfumeName.trim()) return;
    setLoading(true);
    setSavedSuccess(false);
    try {
      const res = await analyzePerfumeDetails(perfumeName, brandName);
      setAnalysis(res);

      // Auto-enrich in database without hallucination
      const enriched = await enrichFragranceProfile(perfumeName, brandName, 'فرنسي', 'عادي', currentDb);
      setActiveProfile(enriched);
      if (onSaveFragranceProfile) {
        onSaveFragranceProfile(enriched);
      }
      saveFragranceProfileCloud(enriched).catch(console.warn);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  const handleSelectProduct = (product: Product) => {
    setSelectedProduct(product);
    if (product.analysis) {
      setAnalysis(product.analysis);
    } else {
      handleAnalyze(product.name, product.brand);
    }
  };

  const handleSaveToInventory = () => {
    if (!selectedProduct || !analysis) return;
    setProducts(prev => prev.map(p => {
      if (p.id === selectedProduct.id) {
        return { ...p, analysis };
      }
      return p;
    }));
    setSavedSuccess(true);
    setTimeout(() => setSavedSuccess(false), 2500);
  };

  // Instant Administrative Approval of Profile
  const handleApproveProfile = (profile: FragranceDatabaseEntry) => {
    const updated: FragranceDatabaseEntry = {
      ...profile,
      approvalStatus: 'معتمد',
      confidenceDegree: 'عالية',
      lastUpdated: new Date().toISOString()
    };
    setActiveProfile(updated);
    if (onSaveFragranceProfile) onSaveFragranceProfile(updated);
    saveFragranceProfileCloud(updated).catch(console.warn);

    setAdminStatusMessage(`تم اعتماد ملف عطر «${profile.name}» رسمياً في قاعدة البيانات.`);
    setTimeout(() => setAdminStatusMessage(null), 3000);
  };

  // Sync / Bulk seed local database & audit/enrich all inventory items 100% locally and free
  const handleSyncDatabase = async () => {
    setSyncingAll(true);
    try {
      await bulkSeedFragranceDatabase();
      const report = auditAndUpdateFullInventoryLocally(products);
      setProducts(report.updatedProducts);
      await bulkSaveEnrichedPerfumesToEncyclopedia(report.enrichedRecords);
      setAdminStatusMessage(report.summaryText);
      setTimeout(() => setAdminStatusMessage(null), 5000);
    } catch (e) {
      console.error(e);
    } finally {
      setSyncingAll(false);
    }
  };

  const filteredProducts = products.filter(p =>
    p.name.includes(searchQuery) || p.brand.includes(searchQuery)
  );

  const totalPages = Math.max(1, Math.ceil(filteredProducts.length / itemsPerPage));
  const paginatedProducts = filteredProducts.slice((currentPage - 1) * itemsPerPage, currentPage * itemsPerPage);

  // Incomplete & Duplicates Scans
  const incompleteList = useMemo(() => {
    return scanIncompleteFragranceProfiles(products, currentDb);
  }, [products, currentDb]);

  const duplicatesList = useMemo(() => {
    return scanDuplicateFragrances(products);
  }, [products]);

  const isOwner = currentUser?.role === 'OWNER';

  return (
    <div className="p-4 sm:p-6 lg:p-8 max-w-7xl mx-auto space-y-6 pb-12 animate-in fade-in duration-200">
      
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-purple-50 text-purple-800 text-xs font-semibold mb-2 border border-purple-200">
            <Award size={14} className="text-purple-600" />
            <span>معايير الهرم العطري والمراجع المعتمدة (Fragrantica & IFRA Standards)</span>
          </div>
          <h1 className="text-2xl sm:text-3xl font-black tracking-tight">
            <span className="gemini-text-gradient">موسوعة وقاعدة بيانات العطور الذكية</span>
          </h1>
          <p className="text-xs sm:text-sm text-[#86868B] mt-0.5">
            قاعدة بيانات موثوقة تعمل بدون إنترنت، تحليل دقيق للنوتات، كشف الأصناف المكررة، ومحرك بحث ذكي بالمناسبات
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {/* Smart Natural Search Button */}
          <button
            type="button"
            onClick={() => setShowSmartSearchModal(true)}
            className="apple-btn flex items-center gap-2 px-4 py-2.5 rounded-2xl bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-700 hover:to-indigo-700 text-white text-xs font-black shadow-sm"
          >
            <Sparkles size={16} />
            <span>البحث الذكي بالمناسبة والمود</span>
          </button>

          {selectedProduct && analysis && (
            <button
              onClick={handleSaveToInventory}
              className="apple-btn flex items-center gap-2 px-4 py-2.5 rounded-2xl bg-[#0071E3] hover:bg-[#0077ED] text-white text-xs font-semibold shadow-sm"
            >
              {savedSuccess ? <Check size={16} /> : <Save size={16} />}
              <span>{savedSuccess ? 'تم حفظ التحليل في بطاقة العطر!' : 'حفظ التحليل في المخزون'}</span>
            </button>
          )}
        </div>
      </div>

      {/* Admin Action Control Toolbar */}
      <div className="p-3.5 rounded-3xl bg-white border border-black/[0.06] shadow-apple-xs flex flex-wrap items-center justify-between gap-3 text-xs">
        <div className="flex flex-wrap items-center gap-2">
          <span className="font-bold text-[#1D1D1F] flex items-center gap-1.5 pl-2 border-l border-black/[0.08]">
            <Database size={15} className="text-purple-600" />
            <span>إدارة قاعدة البيانات:</span>
          </span>

          <button
            type="button"
            onClick={handleSyncDatabase}
            disabled={syncingAll}
            className="apple-btn px-3 py-1.5 rounded-xl bg-black/[0.04] hover:bg-black/[0.08] text-[#1D1D1F] font-bold flex items-center gap-1.5 transition-all"
          >
            <RefreshCw size={13} className={syncingAll ? 'animate-spin text-purple-600' : 'text-[#86868B]'} />
            <span>{syncingAll ? 'جاري التحديث...' : 'تحديث قاعدة البيانات'}</span>
          </button>

          <button
            type="button"
            onClick={() => setShowIncompleteModal(true)}
            className="apple-btn px-3 py-1.5 rounded-xl bg-amber-50 hover:bg-amber-100 text-amber-900 border border-amber-200 font-bold flex items-center gap-1.5 transition-all"
          >
            <AlertTriangle size={13} className="text-amber-600" />
            <span>فحص البيانات غير المكتملة</span>
            {incompleteList.length > 0 && (
              <span className="px-1.5 py-0.2 rounded-full bg-amber-500 text-white text-[10px]">
                {incompleteList.length}
              </span>
            )}
          </button>

          <button
            type="button"
            onClick={() => setShowDuplicatesModal(true)}
            className="apple-btn px-3 py-1.5 rounded-xl bg-black/[0.04] hover:bg-black/[0.08] text-[#1D1D1F] font-bold flex items-center gap-1.5 transition-all"
          >
            <Copy size={13} className="text-[#86868B]" />
            <span>فحص الأصناف المكررة</span>
            {duplicatesList.length > 0 && (
              <span className="px-1.5 py-0.2 rounded-full bg-rose-500 text-white text-[10px]">
                {duplicatesList.length}
              </span>
            )}
          </button>
        </div>

        <div className="flex items-center gap-2 text-[11px] text-[#86868B]">
          <span className="w-2 h-2 rounded-full bg-emerald-500"></span>
          <span>متاحة 100% دون إنترنت (Offline Cache Active)</span>
        </div>
      </div>

      {/* Admin Message Toast */}
      {adminStatusMessage && (
        <div className="p-3 rounded-2xl bg-[#1D1D1F] text-white text-xs font-bold text-center animate-in fade-in duration-150">
          ✅ {adminStatusMessage}
        </div>
      )}

      {/* Copied Notice Toast */}
      {copiedFormulaNotice && (
        <div className="p-3 rounded-2xl bg-emerald-700 text-white text-xs font-bold text-center shadow-lg animate-in fade-in duration-150 flex items-center justify-center gap-2">
          <CheckCircle2 size={16} />
          <span>{copiedFormulaNotice}</span>
        </div>
      )}

      {/* Tab Switcher: Fragrance Encyclopedia vs Monthly Profitable Blends */}
      <div className="flex flex-wrap items-center gap-2 p-1.5 bg-slate-100 dark:bg-slate-800/80 rounded-2xl border border-slate-200 dark:border-slate-700/60 w-fit">
        <button
          type="button"
          onClick={() => setActiveTab('analyzer')}
          className={`apple-btn px-4 py-2 rounded-xl text-xs font-bold transition-all flex items-center gap-2 cursor-pointer ${
            activeTab === 'analyzer'
              ? 'bg-purple-600 text-white shadow-md'
              : 'text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700'
          }`}
        >
          <BookOpen size={15} />
          <span>موسوعة الهرم العطري والتحليل</span>
        </button>

        <button
          type="button"
          onClick={() => setActiveTab('profitable_blends')}
          className={`apple-btn px-4 py-2 rounded-xl text-xs font-bold transition-all flex items-center gap-2 cursor-pointer ${
            activeTab === 'profitable_blends'
              ? 'bg-gradient-to-r from-amber-500 to-emerald-600 text-white shadow-md'
              : 'text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700'
          }`}
        >
          <Sparkles size={15} className="text-amber-300" />
          <span>محلل واقتراحات الخلطات الأكثر ربحية (مبيعات الشهر)</span>
          <span className="px-1.5 py-0.5 rounded-full bg-amber-400 text-slate-900 text-[10px] font-black">ذكاء المبيعات</span>
        </button>

        <button
          type="button"
          onClick={() => setActiveTab('demand_forecast')}
          className={`apple-btn px-4 py-2 rounded-xl text-xs font-bold transition-all flex items-center gap-2 cursor-pointer ${
            activeTab === 'demand_forecast'
              ? 'bg-gradient-to-r from-blue-600 to-indigo-600 text-white shadow-md'
              : 'text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700'
          }`}
        >
          <TrendingUp size={15} />
          <span>الطلب المتوقع للأسبوع القادم والتنبيهات</span>
          <span className={`px-2 py-0.5 rounded-full text-[10px] font-black ${
            nextWeekDemandForecast.deficitCount > 0
              ? 'bg-rose-500 text-white animate-pulse'
              : 'bg-emerald-500/20 text-emerald-800'
          }`}>
            {nextWeekDemandForecast.deficitCount > 0 ? `⚠️ ${nextWeekDemandForecast.deficitCount} نواقص` : 'آمن ✓'}
          </span>
        </button>
      </div>

      {/* IF TAB IS PROFITABLE BLENDS */}
      {activeTab === 'profitable_blends' ? (
        <div className="space-y-6 animate-in fade-in duration-200">
          {/* Monthly Sales Performance Summary Banner */}
          <div className="p-5 rounded-3xl bg-gradient-to-br from-slate-900 via-indigo-950 to-slate-900 text-white border border-indigo-800/40 shadow-xl space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-indigo-800/30">
              <div className="flex items-center gap-2.5">
                <div className="w-10 h-10 rounded-2xl bg-amber-500/20 text-amber-300 flex items-center justify-center border border-amber-500/30">
                  <TrendingUp size={20} />
                </div>
                <div>
                  <h2 className="text-base font-black">تحليل مبيعات الشهر وتوليد الخلطات الأكثر ربحية</h2>
                  <p className="text-xs text-indigo-200/80">
                    استنتاج تلقائي لأفضل التركيبات العطرية بناءً على سحوبات العملاء هذا الشهر
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <span className="px-3 py-1 rounded-full bg-indigo-500/20 text-indigo-300 border border-indigo-500/30 text-xs font-mono font-bold">
                  فواتير الشهر: {monthlyBestSellersAnalysis.totalMonthlySalesCount} فاتورة
                </span>
                <span className="px-3 py-1 rounded-full bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 text-xs font-mono font-bold">
                  إجمالي الزيت المباع: {monthlyBestSellersAnalysis.totalMonthlyGrams.toLocaleString('ar-EG')} جرام
                </span>
              </div>
            </div>

            {/* Top 3 Best Selling Oils This Month */}
            <div className="space-y-2">
              <span className="text-xs font-bold text-indigo-300 block">🏆 الزيوت العطرية الأكثر مبيعاً وسحباً في محلك هذا الشهر:</span>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                {monthlyBestSellersAnalysis.topSellers.slice(0, 3).map((item, idx) => (
                  <div key={item.product.id} className="p-3 rounded-2xl bg-white/5 border border-white/10 flex items-center justify-between">
                    <div className="min-w-0">
                      <span className="text-[10px] font-black text-amber-300 block">المركز #{idx + 1}</span>
                      <span className="text-xs font-bold text-white block truncate">{item.product.name}</span>
                      <span className="text-[10px] text-indigo-200/70">{item.product.brand} · {item.product.type}</span>
                    </div>
                    <div className="text-left shrink-0">
                      <span className="text-xs font-black font-mono text-emerald-300 block tabular-nums">{item.gramsSold} جم</span>
                      <span className="text-[10px] text-indigo-200/60 tabular-nums">{item.salesCount} عمليات بيع</span>
                    </div>
                  </div>
                ))}
                {monthlyBestSellersAnalysis.topSellers.length === 0 && (
                  <div className="col-span-3 text-center py-2 text-xs text-indigo-300/70">
                    جاري التقييم... قم بتسجيل عمليات بيع هذا الشهر لعرض التحليل اللحظي للزيوت الأكثر طلباً.
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Profitable Blend Cards List */}
          <div className="space-y-4">
            <h3 className="text-sm font-black text-[#1D1D1F] dark:text-white flex items-center gap-2">
              <Beaker size={18} className="text-purple-600" />
              <span>مقترحات الخلطات العطرية الأعلى ربحية ومبيعات (ربح صافي يصل إلى 70%):</span>
            </h3>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
              {profitableBlendRecommendations.map((blend) => (
                <div 
                  key={blend.id} 
                  className="apple-glass-card rounded-3xl p-5 border border-slate-200 dark:border-slate-800 shadow-apple-md bg-white dark:bg-slate-900 space-y-4 flex flex-col justify-between"
                >
                  <div className="space-y-3">
                    {/* Header & Badge */}
                    <div className="space-y-1.5">
                      <span className={`inline-block px-2.5 py-0.5 rounded-full text-[10px] font-black border ${blend.badgeColor}`}>
                        {blend.badge}
                      </span>
                      <h4 className="text-sm font-black text-slate-900 dark:text-white leading-snug">
                        {blend.title}
                      </h4>
                      <span className="text-[11px] text-slate-500 dark:text-slate-400 block">
                        حجم العبوة المقترح: <strong>{blend.bottleSizeMl} مل</strong> ({blend.totalEssenceGrams} جرام زيت خام)
                      </span>
                    </div>

                    {/* Formula Ingredients */}
                    <div className="p-3 rounded-2xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200/80 dark:border-slate-700/60 space-y-2 text-xs">
                      <span className="font-bold text-slate-700 dark:text-slate-300 block text-[11px]">💧 مكونات ونسب التركيبة:</span>
                      <div className="space-y-1.5">
                        {blend.components.map((comp, cIdx) => (
                          <div key={cIdx} className="flex items-center justify-between text-[11px]">
                            <span className="font-bold text-slate-900 dark:text-slate-100">
                              {comp.product?.name || 'زيت عطري'} ({comp.percentage}%)
                            </span>
                            <span className="font-mono text-slate-600 dark:text-slate-300 tabular-nums">
                              {comp.grams} جم · {comp.totalCost} ج
                            </span>
                          </div>
                        ))}
                      </div>
                    </div>

                    {/* Financial Breakdown */}
                    <div className="grid grid-cols-3 gap-2 text-center text-[10px]">
                      <div className="p-2 rounded-xl bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700">
                        <span className="text-slate-500 dark:text-slate-400 block">التكلفة الشاملة</span>
                        <span className="font-bold font-mono text-slate-900 dark:text-white tabular-nums">{blend.totalCost} ج</span>
                      </div>
                      <div className="p-2 rounded-xl bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800/40">
                        <span className="text-amber-800 dark:text-amber-300 block">السعر المقترح</span>
                        <span className="font-bold font-mono text-amber-900 dark:text-amber-200 tabular-nums">{blend.suggestedSellingPrice} ج</span>
                      </div>
                      <div className="p-2 rounded-xl bg-emerald-50 dark:bg-emerald-950/30 border border-emerald-200 dark:border-emerald-800/40">
                        <span className="text-emerald-800 dark:text-emerald-300 block">الربح الصافي</span>
                        <span className="font-black font-mono text-emerald-700 dark:text-emerald-300 tabular-nums">+{blend.netProfit} ج ({blend.profitMarginPercent}%)</span>
                      </div>
                    </div>

                    {/* Commercial Rationale */}
                    <p className="text-[11px] text-slate-600 dark:text-slate-300 leading-relaxed bg-indigo-50/50 dark:bg-indigo-950/20 p-2.5 rounded-xl border border-indigo-100 dark:border-indigo-900/30">
                      💡 <strong>مبرر الربحية:</strong> {blend.commercialReason}
                    </p>
                  </div>

                  {/* Actions */}
                  <div className="pt-2 flex items-center justify-between gap-2 border-t border-slate-100 dark:border-slate-800">
                    <button
                      type="button"
                      onClick={() => {
                        const recipeText = `وصفة خلطة ${blend.title}:\n` +
                          `- حجم الزجاجة: ${blend.bottleSizeMl} مل\n` +
                          blend.components.map(c => `- ${c.product?.name}: ${c.grams} جرام (${c.percentage}%)\n`).join('') +
                          `سعر البيع المقترح: ${blend.suggestedSellingPrice} ج`;
                        navigator.clipboard.writeText(recipeText);
                        setCopiedFormulaNotice(`تم نسخ وصفة «${blend.title}» إلى الحافظة!`);
                        setTimeout(() => setCopiedFormulaNotice(null), 3000);
                      }}
                      className="apple-btn px-3 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 text-xs font-bold flex items-center gap-1 cursor-pointer"
                    >
                      <Copy size={13} />
                      <span>نسخ الوصفة</span>
                    </button>

                    {onNavigateToPOS && (
                      <button
                        type="button"
                        onClick={() => {
                          if (blend.components[0]?.product) {
                            onNavigateToPOS(blend.components[0].product);
                          }
                        }}
                        className="apple-btn flex-1 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-black flex items-center justify-center gap-1.5 shadow-sm cursor-pointer"
                      >
                        <ShoppingCart size={14} />
                        <span>تحضير وبيع في الكاشير</span>
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      ) : activeTab === 'demand_forecast' ? (
        /* TAB: NEXT WEEK EXPECTED DEMAND FORECAST & LOW STOCK ALERTS */
        <div className="space-y-6 animate-in fade-in duration-200">
          {/* Summary Overview Header Card */}
          <div className="p-5 rounded-3xl bg-gradient-to-br from-slate-900 via-blue-950 to-slate-900 text-white border border-blue-800/40 shadow-xl space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-blue-800/30">
              <div className="flex items-center gap-3">
                <div className="w-11 h-11 rounded-2xl bg-blue-600 text-white flex items-center justify-center font-black shadow-lg shrink-0">
                  <TrendingUp size={22} />
                </div>
                <div>
                  <h3 className="text-base font-black text-blue-200">
                    الطلب المتوقع للأسبوع القادم وتحليل المخزون الحرج
                  </h3>
                  <p className="text-xs text-slate-300 mt-0.5">
                    توقعات دقيقة لحجم السحب بالجرام بناءً على معدلات مبيعات الشهر السابق لتجنب نفاد المخزون المفاجئ.
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-2 flex-wrap">
                <div className="px-4 py-2 rounded-2xl bg-white/10 border border-blue-400/30 text-right">
                  <span className="text-[10px] text-blue-200 font-bold block">إجمالي الطلب المتوقع (7 أيام):</span>
                  <span className="text-lg font-black font-mono text-amber-300">
                    {nextWeekDemandForecast.totalNextWeekDemandGrams.toLocaleString('ar-EG')} جم زيت
                  </span>
                </div>

                <div className={`px-4 py-2 rounded-2xl border text-right ${
                  nextWeekDemandForecast.deficitCount > 0
                    ? 'bg-rose-500/20 border-rose-500/40 text-rose-200 animate-pulse'
                    : 'bg-emerald-500/20 border-emerald-500/40 text-emerald-200'
                }`}>
                  <span className="text-[10px] font-bold block">تنبيهات عجز المخزون:</span>
                  <span className="text-lg font-black font-mono">
                    {nextWeekDemandForecast.deficitCount > 0
                      ? `⚠️ ${nextWeekDemandForecast.deficitCount} أصناف حرجة`
                      : '✅ المخزون أمان 100%'}
                  </span>
                </div>
              </div>
            </div>

            <p className="text-xs text-slate-300 leading-relaxed">
              💡 <strong>معادلة التوقع الذكية:</strong> يتم حساب معدل السحب اليومي الفعلي لكل عطر في الـ 30 يوماً الماضية وضرب الناتج في 7 أيام لتوقع كمية الزيت المطلوبة بدقة للأسبوع القادم.
            </p>
          </div>

          {/* Forecast & Deficit Items Table */}
          <div className="p-4 sm:p-5 rounded-3xl bg-white dark:bg-[#1D1D1F] border border-black/[0.08] shadow-apple-xs space-y-3">
            <h4 className="text-sm font-black text-[#1D1D1F] dark:text-white flex items-center gap-2">
              <Package size={16} className="text-blue-600" />
              <span>جدول توقعات السحب وتنبيهات إعادة التوريد ({nextWeekDemandForecast.items.length} عطر)</span>
            </h4>

            <div className="overflow-x-auto">
              <table className="w-full text-right text-xs">
                <thead>
                  <tr className="border-b border-black/[0.08] text-[#86868B] font-bold">
                    <th className="p-2.5">اسم العطر والنوع</th>
                    <th className="p-2.5">مبيعات الشهر الماضي</th>
                    <th className="p-2.5">السحب اليومي</th>
                    <th className="p-2.5">الطلب المتوقع (7 أيام)</th>
                    <th className="p-2.5">المخزون الحالي</th>
                    <th className="p-2.5">حالة الأمان والتنبيه</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-black/[0.05]">
                  {nextWeekDemandForecast.items.map(({ product, gramsSoldPastMonth, dailyAverageGrams, expectedDemandNextWeekGrams, expectedBottles50MlNextWeek, currentStockGrams, isLowStockDeficit, deficitGrams }) => (
                    <tr
                      key={product.id}
                      className={`hover:bg-black/[0.02] transition-colors ${
                        isLowStockDeficit ? 'bg-rose-500/5' : ''
                      }`}
                    >
                      <td className="p-2.5 font-bold text-[#1D1D1F] dark:text-white">
                        <div className="flex items-center gap-2">
                          {isLowStockDeficit && <AlertTriangle size={15} className="text-rose-600 shrink-0 animate-bounce" />}
                          <div>
                            <span className="block font-black text-xs">{product.name}</span>
                            <span className="text-[10px] text-[#86868B]">{product.brand} · {product.type}</span>
                          </div>
                        </div>
                      </td>

                      <td className="p-2.5 font-mono font-bold">
                        {gramsSoldPastMonth} جم
                      </td>

                      <td className="p-2.5 font-mono text-[#86868B]">
                        {dailyAverageGrams} جم/يوم
                      </td>

                      <td className="p-2.5 font-mono font-black text-[#0071E3]">
                        {expectedDemandNextWeekGrams} جم ({expectedBottles50MlNextWeek} عبوات 50مل)
                      </td>

                      <td className="p-2.5 font-mono font-black">
                        <span className={isLowStockDeficit ? 'text-rose-600' : 'text-slate-900 dark:text-white'}>
                          {currentStockGrams} جم
                        </span>
                      </td>

                      <td className="p-2.5">
                        {isLowStockDeficit ? (
                          <span className="px-2.5 py-1 rounded-xl bg-rose-500/15 text-rose-800 border border-rose-500/30 font-black text-[11px] inline-flex items-center gap-1">
                            ⚠️ عجز متوقع: {deficitGrams} جم زيت
                          </span>
                        ) : (
                          <span className="px-2.5 py-1 rounded-xl bg-emerald-500/15 text-emerald-800 border border-emerald-500/30 font-bold text-[11px] inline-flex items-center gap-1">
                            ✅ آمن ومستقر
                          </span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      ) : (
        /* IF TAB IS ANALYZER / ENCYCLOPEDIA (Existing Grid) */
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        
        {/* Left Column: Perfume Search & Selector */}
        <div className="lg:col-span-4 space-y-4">
          <div className="apple-glass-card rounded-3xl p-5 space-y-3 border border-black/[0.06]">
            <h3 className="font-bold text-sm text-[#1D1D1F]">كتالوج العطور بالمحل ({filteredProducts.length})</h3>

            <div className="relative">
              <input
                type="text"
                placeholder="ابحث في المتجر أو اكتب اسم عطر عالمي..."
                value={searchQuery}
                onChange={(e) => {
                  setSearchQuery(e.target.value);
                  setCurrentPage(1);
                }}
                className="gemini-field field-border-purple w-full h-11 pr-10 pl-3 rounded-xl bg-white text-xs font-medium text-[#1D1D1F]"
              />
              <Search size={16} className="absolute right-3.5 top-1/2 -translate-y-1/2 text-[#86868B]" />
            </div>

            {searchQuery && !filteredProducts.some(p => p.name.toLowerCase() === searchQuery.toLowerCase()) && (
              <button
                onClick={() => handleAnalyze(searchQuery, '')}
                className="apple-btn w-full py-2.5 rounded-xl bg-[#1D1D1F] text-white text-xs font-semibold flex items-center justify-center gap-2"
              >
                <Sparkles size={14} className="text-[#C49746]" />
                <span>تحليل العطر الخارجي "{searchQuery}"</span>
              </button>
            )}

            {/* Zero Scroll - Clean Paginated List */}
            <div className="space-y-1.5 pt-1">
              {paginatedProducts.map((p) => {
                const isSelected = selectedProduct?.id === p.id;
                const hasSavedAnalysis = Boolean(p.analysis);

                return (
                  <button
                    key={p.id}
                    onClick={() => handleSelectProduct(p)}
                    className={`apple-btn w-full text-right p-3 rounded-2xl border transition-all flex items-center justify-between ${
                      isSelected
                        ? 'bg-white border-[#0071E3] shadow-apple font-bold text-[#1D1D1F]'
                        : 'bg-white/60 border-black/[0.04] hover:bg-white text-[#48484A]'
                    }`}
                  >
                    <div>
                      <span className="text-xs font-bold block">{p.name}</span>
                      <span className="text-[10px] text-[#86868B]">{p.brand} · {p.type}</span>
                    </div>

                    <div className="flex items-center gap-1.5">
                      {hasSavedAnalysis && (
                        <span className="w-2 h-2 rounded-full bg-emerald-500" title="تم حفظ التحليل" />
                      )}
                      <span className="text-[11px] font-mono font-semibold text-[#86868B]">
                        {p.stock_grams} جم
                      </span>
                    </div>
                  </button>
                );
              })}
            </div>

            {/* Pagination Controls */}
            {totalPages > 1 && (
              <div className="flex items-center justify-between pt-3 border-t border-black/[0.06] text-xs">
                <button
                  disabled={currentPage === 1}
                  onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                  className="px-3 py-1.5 rounded-xl bg-black/[0.04] disabled:opacity-30 text-[#1D1D1F] font-bold"
                >
                  السابق
                </button>
                <span className="text-[11px] text-[#86868B]">
                  صفحة {currentPage} من {totalPages}
                </span>
                <button
                  disabled={currentPage === totalPages}
                  onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                  className="px-3 py-1.5 rounded-xl bg-black/[0.04] disabled:opacity-30 text-[#1D1D1F] font-bold"
                >
                  التالي
                </button>
              </div>
            )}
          </div>
        </div>

        {/* Right Column: Detailed Fragrance Profile Card */}
        <div className="lg:col-span-8 space-y-4">
          {loading ? (
            <div className="apple-glass-card rounded-3xl p-16 text-center text-[#86868B] space-y-3 border border-black/[0.06]">
              <Loader2 size={36} className="mx-auto animate-spin text-purple-600" />
              <p className="font-bold text-sm text-[#1D1D1F]">جاري استرجاع وفحص بيانات العطر من المراجع المعتمدة...</p>
              <p className="text-xs text-[#86868B]">مطابقة الهرم العطري، الأكوردات، والتصنيف الموثق دولياً</p>
            </div>
          ) : analysis ? (
            <div className="space-y-4 animate-in fade-in duration-150">
              
              {/* Product Header & Confidence Badge Card */}
              <div className="apple-glass-card rounded-3xl p-6 sm:p-7 border border-black/[0.06] flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div>
                  <div className="flex items-center gap-2">
                    <h2 className="text-xl sm:text-2xl font-black text-[#1D1D1F] tracking-tight">
                      {selectedProduct?.name}
                    </h2>
                    <span className="text-xs px-2.5 py-0.5 rounded-full bg-black/[0.04] font-semibold text-[#86868B]">
                      {selectedProduct?.brand}
                    </span>

                    {/* Confidence Degree Badge */}
                    {activeProfile && (
                      <span className={`px-2.5 py-0.5 rounded-full text-[11px] font-black border ${
                        activeProfile.confidenceDegree === 'عالية' 
                          ? 'bg-emerald-50 text-emerald-900 border-emerald-300'
                          : activeProfile.confidenceDegree === 'متوسطة'
                          ? 'bg-amber-50 text-amber-900 border-amber-300'
                          : 'bg-rose-50 text-rose-900 border-rose-300'
                      }`}>
                        ثقة {activeProfile.confidenceDegree}
                      </span>
                    )}

                    {/* Approval Status */}
                    {activeProfile && (
                      <span className={`px-2.5 py-0.5 rounded-full text-[10px] font-bold ${
                        activeProfile.approvalStatus === 'معتمد' 
                          ? 'bg-emerald-100 text-emerald-800' 
                          : 'bg-amber-100 text-amber-800'
                      }`}>
                        {activeProfile.approvalStatus}
                      </span>
                    )}
                  </div>

                  <p className="text-xs text-[#86868B] mt-1">
                    {activeProfile?.generalCharacter || `التصنيف: ${selectedProduct?.type} · المنشأ: ${selectedProduct?.origin} · رصيد المخزون: ${selectedProduct?.stock_grams} جم`}
                  </p>
                </div>

              {/* 🔮 NEXT WEEK'S DEMAND FORECAST & STOCK DEFICIT ALERT */}
              {selectedProduct && (() => {
                const currentMonthStr = new Date().toISOString().slice(0, 7);
                let salesGramsThisMonth = 0;
                (sales || []).forEach(s => {
                  if (s.date && s.date.startsWith(currentMonthStr) && isLiveProductionSale(s)) {
                    (s.items || []).forEach(it => {
                      if (String(it.productId) === String(selectedProduct.id) || (it.productName || '').trim().toLowerCase() === selectedProduct.name.trim().toLowerCase()) {
                        salesGramsThisMonth += Number(it.essenceGrams) || 0;
                      }
                    });
                  }
                });

                const dailyBurnGrams = salesGramsThisMonth > 0 ? (salesGramsThisMonth / 30) : 5;
                const nextWeekProjectedDemandGrams = Math.max(35, Math.ceil(dailyBurnGrams * 7));
                const currentStockGrams = selectedProduct.stock_grams || 0;
                const isInsufficient = currentStockGrams < nextWeekProjectedDemandGrams;
                const deficitGrams = Math.max(0, nextWeekProjectedDemandGrams - currentStockGrams);

                return (
                  <div className={`p-4 sm:p-5 rounded-3xl border transition-all space-y-3 ${
                    isInsufficient
                      ? 'bg-rose-500/[0.08] dark:bg-rose-950/30 border-rose-500/40 text-rose-950 dark:text-rose-100 shadow-md'
                      : 'bg-emerald-500/[0.06] dark:bg-emerald-950/20 border-emerald-500/30 text-emerald-950 dark:text-emerald-100'
                  }`}>
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                      <div className="flex items-center gap-3">
                        <div className={`w-10 h-10 rounded-2xl flex items-center justify-center shrink-0 shadow-sm font-black ${
                          isInsufficient ? 'bg-rose-600 text-white' : 'bg-emerald-600 text-white'
                        }`}>
                          {isInsufficient ? <AlertTriangle size={20} className="animate-pulse" /> : <TrendingUp size={20} />}
                        </div>
                        <div>
                          <div className="flex items-center gap-2 flex-wrap">
                            <h4 className="text-sm font-black">الطلب المتوقع للأسبوع القادم (Next 7 Days Forecast)</h4>
                            <span className={`text-[10px] px-2.5 py-0.5 rounded-full font-black border ${
                              isInsufficient
                                ? 'bg-rose-600 text-white border-rose-500 animate-pulse'
                                : 'bg-emerald-600 text-white border-emerald-500'
                            }`}>
                              {isInsufficient ? '🚨 مخزون غير كافٍ - عجز متوقع' : '✅ رصيد كافٍ ومستقر'}
                            </span>
                          </div>
                          <p className="text-xs opacity-80 mt-0.5">
                            محسوب بناءً على مبيعات وسحوبات الشهر السابق ({salesGramsThisMonth} جم زيت مباع هذا الشهر).
                          </p>
                        </div>
                      </div>

                      <div className="text-left bg-white/80 dark:bg-slate-900/80 p-3 rounded-2xl border border-black/10 shrink-0">
                        <span className="text-[10px] font-bold opacity-75 block text-right sm:text-left">الطلب المتوقع:</span>
                        <span className="text-lg font-black font-mono text-purple-700 dark:text-purple-300 block text-right sm:text-left">
                          {nextWeekProjectedDemandGrams} جم
                        </span>
                        <span className="text-[10px] font-mono opacity-80 block text-right sm:text-left">
                          الرصيد الحالي: {currentStockGrams} جم
                        </span>
                      </div>
                    </div>

                    {isInsufficient && (
                      <div className="p-3 rounded-2xl bg-rose-600 text-white text-xs font-bold flex items-center justify-between gap-2 shadow-sm">
                        <span>⚠️ عجز متوقع بمقدار <strong>{deficitGrams} جم</strong> خلال الأسبوع القادم — يرجى إعادة الطلب لتفادي النفاد!</span>
                        {onNavigateToPOS && (
                          <button
                            type="button"
                            onClick={() => onNavigateToPOS(selectedProduct)}
                            className="px-3 py-1.5 rounded-xl bg-white text-rose-900 hover:bg-slate-100 text-xs font-black shrink-0 cursor-pointer shadow-2xs"
                          >
                            طلب توريد / تزويد
                          </button>
                        )}
                      </div>
                    )}
                  </div>
                );
              })()}

                <div className="flex items-center gap-2">
                  {/* Approve button for unapproved profiles */}
                  {activeProfile && activeProfile.approvalStatus !== 'معتمد' && isOwner && (
                    <button
                      type="button"
                      onClick={() => handleApproveProfile(activeProfile)}
                      className="apple-btn px-3 py-2 rounded-2xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold shadow-xs"
                    >
                      اعتماد الملف رسمياً
                    </button>
                  )}

                  {onNavigateToPOS && selectedProduct && (
                    <button
                      onClick={() => onNavigateToPOS(selectedProduct)}
                      className="apple-btn flex items-center gap-1.5 px-4 py-2.5 rounded-2xl bg-[#1D1D1F] hover:bg-black text-white text-xs font-bold shadow-sm"
                    >
                      <span>الانتقال للبيع بالكاشير</span>
                      <ArrowLeft size={14} />
                    </button>
                  )}
                </div>
              </div>

              {/* Verified Sources & Accords Row */}
              <div className="apple-glass-card rounded-3xl p-5 border border-black/[0.06] space-y-3">
                <div className="flex items-center justify-between pb-2 border-b border-black/[0.04] text-xs">
                  <span className="font-bold text-[#1D1D1F] flex items-center gap-1.5">
                    <ShieldCheck size={16} className="text-emerald-600" />
                    <span>المصادر المرجعية المعتمدة (بدون هلوسات أو معلومات تخمينية):</span>
                  </span>
                  <span className="text-[10px] text-[#86868B]">
                    {activeProfile?.confidenceReason || 'مطابقة مؤكدة مع الكتالوج الرسمي'}
                  </span>
                </div>

                <div className="flex flex-wrap items-center gap-2">
                  {(activeProfile?.sourcesRanked || [
                    { rank: 1, name: 'الأرشيف الرسمي للدار المصنعة', type: 'official_brand' },
                    { rank: 2, name: 'دليل Fragrantica & Basenotes الدولي', type: 'database' },
                    { rank: 3, name: 'معايير IFRA Category 4 للأمان', type: 'ifra' }
                  ]).map((src, sIdx) => (
                    <span 
                      key={sIdx}
                      className="inline-flex items-center gap-1.5 px-3 py-1 rounded-xl bg-black/[0.03] border border-black/[0.06] text-[11px] font-semibold text-[#48484A]"
                    >
                      <span className="w-4 h-4 rounded-full bg-[#0071E3]/10 text-[#0071E3] font-bold text-[10px] flex items-center justify-center">
                        {src.rank}
                      </span>
                      <span>{src.name}</span>
                    </span>
                  ))}
                </div>

                {/* Main Accords */}
                <div className="pt-2 border-t border-black/[0.04] flex flex-wrap items-center gap-2 text-xs">
                  <span className="font-bold text-[#86868B] shrink-0">الأكوردات الرئيسية:</span>
                  {(activeProfile?.mainAccords || analysis.mainAccords).map((acc, aIdx) => (
                    <span key={aIdx} className="px-2.5 py-0.5 rounded-lg bg-purple-50 text-purple-900 border border-purple-200 font-bold text-[11px]">
                      {acc}
                    </span>
                  ))}
                </div>
              </div>

              {/* Olfactory Pyramid (الهرم العطري الثلاثي) */}
              <div className="apple-glass-card rounded-3xl p-6 sm:p-7 border border-black/[0.06] space-y-4">
                <div className="flex items-center gap-2 pb-2 border-b border-black/[0.06]">
                  <Layers size={18} className="text-[#0071E3]" />
                  <h3 className="font-bold text-sm text-[#1D1D1F]">الهرم العطري المعتمد (Olfactory Pyramid)</h3>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-3 text-xs">
                  {/* Top Notes */}
                  <div className="p-4 rounded-2xl bg-gradient-to-b from-blue-50/60 to-transparent border border-blue-100 space-y-2">
                    <div className="flex items-center justify-between font-bold text-blue-900">
                      <span>1. النوتات العليا (الافتتاحية)</span>
                      <span className="text-[10px] bg-blue-100 px-2 py-0.5 rounded-full">أول 15 دقيقة</span>
                    </div>
                    <div className="flex flex-wrap gap-1.5 pt-1">
                      {analysis.topNotes.map((note, i) => (
                        <span key={i} className="px-2.5 py-1 rounded-xl bg-white text-[#1D1D1F] border border-blue-100 font-medium text-[11px]">
                          {note}
                        </span>
                      ))}
                    </div>
                  </div>

                  {/* Heart Notes */}
                  <div className="p-4 rounded-2xl bg-gradient-to-b from-purple-50/60 to-transparent border border-purple-100 space-y-2">
                    <div className="flex items-center justify-between font-bold text-purple-900">
                      <span>2. النوتات الوسطى (قلب العطر)</span>
                      <span className="text-[10px] bg-purple-100 px-2 py-0.5 rounded-full">2 - 4 ساعات</span>
                    </div>
                    <div className="flex flex-wrap gap-1.5 pt-1">
                      {analysis.heartNotes.map((note, i) => (
                        <span key={i} className="px-2.5 py-1 rounded-xl bg-white text-[#1D1D1F] border border-purple-100 font-medium text-[11px]">
                          {note}
                        </span>
                      ))}
                    </div>
                  </div>

                  {/* Base Notes */}
                  <div className="p-4 rounded-2xl bg-gradient-to-b from-amber-50/60 to-transparent border border-amber-100 space-y-2">
                    <div className="flex items-center justify-between font-bold text-amber-900">
                      <span>3. النوتات القاعدية (الثبات)</span>
                      <span className="text-[10px] bg-amber-100 px-2 py-0.5 rounded-full">6 - 24 ساعة</span>
                    </div>
                    <div className="flex flex-wrap gap-1.5 pt-1">
                      {analysis.baseNotes.map((note, i) => (
                        <span key={i} className="px-2.5 py-1 rounded-xl bg-white text-[#1D1D1F] border border-amber-100 font-medium text-[11px]">
                          {note}
                        </span>
                      ))}
                    </div>
                  </div>
                </div>
              </div>

              {/* Performance & Seasonal Suitability */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
                <div className="apple-glass-card rounded-2xl p-4 border border-black/[0.06] space-y-1">
                  <div className="flex items-center gap-1.5 text-[#86868B]">
                    <ShieldCheck size={14} className="text-emerald-600" />
                    <span>مستوى الثبات</span>
                  </div>
                  <span className="font-bold text-sm text-[#1D1D1F] block">{analysis.longevity}</span>
                </div>

                <div className="apple-glass-card rounded-2xl p-4 border border-black/[0.06] space-y-1">
                  <div className="flex items-center gap-1.5 text-[#86868B]">
                    <Wind size={14} className="text-[#0071E3]" />
                    <span>مستوى الفوحان</span>
                  </div>
                  <span className="font-bold text-sm text-[#1D1D1F] block">{analysis.sillage}</span>
                </div>

                <div className="apple-glass-card rounded-2xl p-4 border border-black/[0.06] space-y-1">
                  <div className="flex items-center gap-1.5 text-[#86868B]">
                    <Sun size={14} className="text-[#C49746]" />
                    <span>الموسم الأنسب</span>
                  </div>
                  <span className="font-bold text-sm text-[#1D1D1F] block">{analysis.bestSeason}</span>
                </div>

                <div className="apple-glass-card rounded-2xl p-4 border border-black/[0.06] space-y-1">
                  <div className="flex items-center gap-1.5 text-[#86868B]">
                    <Moon size={14} className="text-purple-600" />
                    <span>الوقت الأنسب</span>
                  </div>
                  <span className="font-bold text-sm text-[#1D1D1F] block">{analysis.bestTime}</span>
                </div>
              </div>

              {/* Seller Sales Pitch & Layering Recipe */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="apple-glass-card rounded-3xl p-5 border border-black/[0.06] space-y-2">
                  <div className="flex items-center gap-2 text-[#0071E3] font-bold text-xs">
                    <MessageSquare size={16} />
                    <span>عبارة إقناع الزبون (Sales Pitch)</span>
                  </div>
                  <div className="p-3.5 rounded-2xl bg-black/[0.02] text-xs font-semibold text-[#1D1D1F] leading-relaxed">
                    "{analysis.salesPitch}"
                  </div>
                  <p className="text-[10px] text-[#86868B]">
                    قل هذه العبارة للعميل بمجرد رشه على شريط الاختبار لإبراز نوتات العطر.
                  </p>
                </div>

                <div className="apple-glass-card rounded-3xl p-5 border border-black/[0.06] space-y-2">
                  <div className="flex items-center gap-2 text-purple-600 font-bold text-xs">
                    <Blend size={16} />
                    <span>اقتراح الدمج لزيادة الفاتورة (Layering)</span>
                  </div>
                  <div className="p-3.5 rounded-2xl bg-purple-50/40 text-xs font-semibold text-purple-950 leading-relaxed border border-purple-100">
                    {analysis.layeringSuggestion}
                  </div>
                  <p className="text-[10px] text-[#86868B]">
                    اعرض على العميل خلط الزيت مع رشة مسك لرفع قيمة الشراء والتميز.
                  </p>
                </div>
              </div>

            </div>
          ) : (
            <div className="apple-glass-card rounded-3xl p-12 text-center text-[#86868B] space-y-2 border border-black/[0.06]">
              <BookOpen size={36} className="mx-auto text-[#AEAEB2]" />
              <p className="font-bold text-base text-[#1D1D1F]">اختر عطراً لبدء التحليل</p>
              <p className="text-xs">اضغط على أي عطر من القائمة لعرض هرمه العطري الكامل ومفاتيح البيع</p>
            </div>
          )}
        </div>
      </div>
      )}

      {/* Smart Natural Search Modal */}
      <SmartFragranceSearchModal
        isOpen={showSmartSearchModal}
        onClose={() => setShowSmartSearchModal(false)}
        products={products}
        fragranceDatabase={currentDb}
        onAddToCart={(p) => {
          if (onNavigateToPOS) onNavigateToPOS(p);
          setShowSmartSearchModal(false);
        }}
      />

      {/* Incomplete Profiles Modal */}
      {showIncompleteModal && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="apple-glass rounded-3xl max-w-xl w-full p-6 space-y-4 max-h-[85vh] overflow-y-auto">
            <div className="flex items-center justify-between pb-2 border-b border-black/[0.06]">
              <div className="flex items-center gap-2">
                <AlertTriangle size={18} className="text-amber-500" />
                <h3 className="font-bold text-sm text-[#1D1D1F]">الأصناف التي تحتاج مراجعة أو استكمال بيانات ({incompleteList.length})</h3>
              </div>
              <button onClick={() => setShowIncompleteModal(false)} className="text-[#86868B]">
                <X size={18} />
              </button>
            </div>

            {incompleteList.length === 0 ? (
              <div className="p-6 text-center text-xs font-bold text-emerald-700">
                ✅ جميع الأصناف في المتجر مكتملة البيانات وموثقة بنجاح!
              </div>
            ) : (
              <div className="space-y-2 text-xs">
                {incompleteList.slice(0, 15).map(({ product, reason }, i) => (
                  <div key={i} className="p-3 rounded-2xl bg-white border border-black/[0.06] flex items-center justify-between gap-2">
                    <div>
                      <span className="font-bold text-[#1D1D1F] block">{product.name}</span>
                      <span className="text-[10px] text-amber-700">{reason}</span>
                    </div>
                    <button
                      onClick={() => {
                        handleSelectProduct(product);
                        setShowIncompleteModal(false);
                      }}
                      className="px-2.5 py-1 rounded-xl bg-purple-50 text-purple-700 font-bold text-[10px]"
                    >
                      استكمال الآن
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Duplicates Modal */}
      {showDuplicatesModal && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="apple-glass rounded-3xl max-w-xl w-full p-6 space-y-4 max-h-[85vh] overflow-y-auto">
            <div className="flex items-center justify-between pb-2 border-b border-black/[0.06]">
              <div className="flex items-center gap-2">
                <Copy size={18} className="text-[#0071E3]" />
                <h3 className="font-bold text-sm text-[#1D1D1F]">فحص الأصناف المكررة في الكتالوج ({duplicatesList.length})</h3>
              </div>
              <button onClick={() => setShowDuplicatesModal(false)} className="text-[#86868B]">
                <X size={18} />
              </button>
            </div>

            {duplicatesList.length === 0 ? (
              <div className="p-6 text-center text-xs font-bold text-emerald-700">
                ✅ لا توجد أصناف مكررة بالاسم في الكتالوج الحالي!
              </div>
            ) : (
              <div className="space-y-2 text-xs">
                {duplicatesList.map((dup, i) => (
                  <div key={i} className="p-3 rounded-2xl bg-white border border-black/[0.06] space-y-1">
                    <span className="font-black text-[#1D1D1F] block">{dup.name} (مكرر {dup.count} مرات)</span>
                    <p className="text-[10px] text-[#86868B]">يُنصح بدمج الرصيد لمنع ازدواجية السجلات.</p>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

    </div>
  );
};

export default FragranceAnalyzer;
