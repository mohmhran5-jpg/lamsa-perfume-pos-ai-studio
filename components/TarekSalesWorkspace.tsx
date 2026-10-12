import React, { useState, useMemo } from 'react';
import {
  Sale,
  Product,
  StoreSettings,
  AppUser,
  CustomCustomerRecord,
  CustomerRequest,
  CommissionPolicy,
  CustomerFollowUpTask,
  StagnantPerfumeItem,
  MarketingPostIdea
} from '../types';
import { calculateExactDailyCommission, loadCommissionPolicies } from '../services/staffEntitlementsService';
import {
  Target,
  ShoppingBag,
  TrendingUp,
  Award,
  Users,
  Box,
  FileText,
  Calendar,
  CheckCircle2,
  Clock,
  Sparkles,
  ArrowRight,
  Flame,
  Check,
  X,
  Phone,
  MessageCircle,
  Copy,
  ChevronRight,
  Layers,
  Zap,
  HelpCircle,
  AlertTriangle,
  RotateCcw,
  Plus,
  Send,
  ExternalLink,
  ShieldCheck,
  Filter
} from 'lucide-react';

interface TarekSalesWorkspaceProps {
  sales: Sale[];
  products: Product[];
  settings: StoreSettings;
  currentUser: AppUser | null;
  customCustomers?: CustomCustomerRecord[];
  customerRequests?: CustomerRequest[];
  dailyCoveredExpense?: number;
  onNavigateToPOS: () => void;
  onNavigateToCustomers: () => void;
  onNavigateToInvoices: () => void;
  onNavigateToInventory: () => void;
  onNavigateToEntitlements: () => void;
  onCompleteSale?: (sale: Sale) => void;
  onSaveCustomCustomer?: (cust: CustomCustomerRecord) => void;
}

export const TarekSalesWorkspace: React.FC<TarekSalesWorkspaceProps> = ({
  sales,
  products,
  settings,
  currentUser,
  customCustomers = [],
  customerRequests = [],
  dailyCoveredExpense = 600,
  onNavigateToPOS,
  onNavigateToCustomers,
  onNavigateToInvoices,
  onNavigateToInventory,
  onNavigateToEntitlements,
  onSaveCustomCustomer,
}) => {
  const isOwner = currentUser?.role === 'OWNER';
  const todayKey = useMemo(() => new Date().toISOString().slice(0, 10), []);

  // Workspace sub-tabs
  const [activeTab, setActiveTab] = useState<
    'performance' | 'activation_tasks' | 'customers_crm' | 'stagnant_perfumes' | 'marketing_studio' | 'paper_book_ledger'
  >('performance');

  // Copied feedback flash
  const [copiedKey, setCopiedKey] = useState<string | null>(null);
  const handleCopy = (text: string, key: string) => {
    navigator.clipboard.writeText(text);
    setCopiedKey(key);
    setTimeout(() => setCopiedKey(null), 2500);
  };

  // Follow-up interaction outcome modal / state
  const [selectedTaskForOutcome, setSelectedTaskForOutcome] = useState<CustomerFollowUpTask | null>(null);
  const [taskOutcomeType, setTaskOutcomeType] = useState<CustomerFollowUpTask['status']>('completed');
  const [taskOutcomeNote, setTaskOutcomeNote] = useState('');
  const [taskLinkedSaleId, setTaskLinkedSaleId] = useState('');
  const [completedTaskIds, setCompletedTaskIds] = useState<Record<string, { status: string; note: string }>>({});

  // Marketing campaign interaction logging
  const [campaignInteractions, setCampaignInteractions] = useState<Record<string, { interactions: number; sales: number }>>({});

  // ========================================================
  // 1. TODAY'S SALES & PERFORMANCE COMPUTATIONS (REAL-TIME)
  // ========================================================
  const todaySales = useMemo(() => {
    return sales.filter(s => !s.isReversed && s.date.slice(0, 10) === todayKey);
  }, [sales, todayKey]);

  const todayGrossSales = useMemo(() => {
    return todaySales.reduce((sum, s) => sum + (s.totalPrice || 0), 0);
  }, [todaySales]);

  const todayCost = useMemo(() => {
    return todaySales.reduce((sum, s) => sum + (s.totalCost || 0), 0);
  }, [todaySales]);

  // Net Contribution (المساهمة المحققة = المبيعات - تكلفة الخامات المباشرة)
  const todayContribution = Math.max(0, todayGrossSales - todayCost);

  // Targets from settings / approved financial plan
  const dailyTargetRevenue = settings.dailySalesTarget || 2000;
  const targetContribution = settings.dailyTargetProfit || 600;
  const breakEvenFixedExpense = dailyCoveredExpense || 600;

  // Bottle breakdown for today
  const bottleBreakdown = useMemo(() => {
    let sprayCount = 0;
    let rollOnCount = 0;
    let size50 = 0;
    let size30 = 0;
    let size100 = 0;
    let sizeOther = 0;

    todaySales.forEach(s => {
      (s.items || []).forEach(it => {
        const qty = it.quantity || 1;
        if (it.isRollOn) {
          rollOnCount += qty;
        } else {
          sprayCount += qty;
        }

        const size = Number(it.bottleSize?.sizeMl || 0);
        if (size === 50) size50 += qty;
        else if (size === 30) size30 += qty;
        else if (size === 100) size100 += qty;
        else sizeOther += qty;
      });
    });

    return {
      totalBottles: sprayCount + rollOnCount,
      sprayCount,
      rollOnCount,
      size50,
      size30,
      size100,
      sizeOther
    };
  }, [todaySales]);

  // Exact live commission for Tarek today using official calculation engine
  const todayCommission = useMemo(() => {
    const policies = loadCommissionPolicies();
    return calculateExactDailyCommission(sales, 'طارق', todayKey, policies[0]);
  }, [todayKey, sales]);

  // Achievement percentages and remaining gaps
  const revenueProgressPct = Math.min(100, Math.round((todayGrossSales / dailyTargetRevenue) * 100));
  const remainingRevenue = Math.max(0, dailyTargetRevenue - todayGrossSales);

  const contributionProgressPct = Math.min(100, Math.round((todayContribution / targetContribution) * 100));
  const remainingContribution = Math.max(0, targetContribution - todayContribution);

  // Remaining bottles calculation:
  // Average contribution per spray bottle is ~70 EGP (mix of 50ml @ 82 EGP and 30ml @ 51 EGP)
  const avgBottleContribution = 70;
  const remainingBottlesEst = Math.ceil(remainingContribution / avgBottleContribution);
  const remainingBottles50Ml = Math.ceil(remainingContribution / 82);
  const remainingBottles30Ml = Math.ceil(remainingContribution / 51);

  // Break-even fixed expense coverage
  const fixedExpenseCoveredPct = Math.min(100, Math.round((todayContribution / breakEvenFixedExpense) * 100));
  const remainingFixedExpense = Math.max(0, breakEvenFixedExpense - todayContribution);

  // Performance pace determination
  const paceStatus: 'behind' | 'on_track' | 'ahead' = useMemo(() => {
    if (revenueProgressPct >= 100) return 'ahead';
    const currentHour = new Date().getHours();
    // Expected progress based on store day (12 PM to 11 PM)
    if (currentHour >= 18 && revenueProgressPct < 50) return 'behind';
    if (currentHour >= 21 && revenueProgressPct < 80) return 'behind';
    return 'on_track';
  }, [revenueProgressPct]);

  // ========================================================
  // 2. STAGNANT PERFUMES RADAR (العطور الراكدة وتنشيط المخزون)
  // ========================================================
  const stagnantPerfumes = useMemo<StagnantPerfumeItem[]>(() => {
    const list: StagnantPerfumeItem[] = [];
    const now = Date.now();

    products.forEach(p => {
      // Find latest sale containing this product
      let latestSaleTimestamp = 0;
      sales.forEach(s => {
        if (s.isReversed) return;
        const hasProd = (s.items || []).some(
          it => String(it.productId) === String(p.id) || it.productName.trim() === p.name.trim()
        );
        if (hasProd) {
          const t = new Date(s.date).getTime();
          if (t > latestSaleTimestamp) latestSaleTimestamp = t;
        }
      });

      const daysWithoutSale = latestSaleTimestamp === 0
        ? 60 // No sales recorded yet
        : Math.floor((now - latestSaleTimestamp) / (1000 * 60 * 60 * 24));

      // Consider stagnant if not sold in 10+ days and has stock >= 15g
      if (daysWithoutSale >= 10 && p.stock_grams >= 15) {
        const approxBottles = Math.round(p.stock_grams / 15);
        const stdPrice = p.product_type === 'نيش' ? 300 : p.product_type === 'عود' ? 350 : 200;
        const contrib = Math.round(stdPrice * 0.45);

        // Curate pairing and audience advice
        const targetAudience = p.product_type === 'عود'
          ? 'محبو الفخامة الشرقية واللقاءات الرسمية والمناسبات'
          : p.product_type === 'نيش'
          ? 'عشاق التميز والانفراد بروائح غير مكررة'
          : 'الاستخدام اليومي الراقي للموظفين وشباب الجامعة';

        const pairing = [
          `توليفة مع مسك الطهارة أو الفانيليا لكسر الحدة وتعزيز الفوحان`,
          `ميكس مع عطر حمضي منعش لإضفاء لمسة شبابية عصرية`
        ];

        const inStoreTip = `رش العطر على شريط اختبار (تيستر) في الصباح وتقديمه كـ «رائحة اليوم الحصرية» للزبائن عند الدخول.`;

        const postCopy = `هل تبحث عن حضور يسبقك؟ اكتشف سحر «${p.name}» في لمسة عطر بتركيز زيت عطري نقي يدوم لساعات طويلة. متوفر بعبوة 50 مل بالسعر المعتمد. أثر يبقى وذكرى تدوم.`;

        const microTest = `عرض تجربة بخة مجانية واحدة على المعصم لكل عميل يشتري عبوة 50 مل اليوم.`;

        list.push({
          productId: String(p.id),
          productName: p.name,
          productType: p.product_type || 'عادي',
          currentStockGrams: p.stock_grams,
          approxBottles,
          lastSaleDate: latestSaleTimestamp > 0 ? new Date(latestSaleTimestamp).toISOString().slice(0, 10) : null,
          daysWithoutSale,
          standardPriceEgp: stdPrice,
          contributionMarginEgp: contrib,
          targetAudienceAr: targetAudience,
          pairingSuggestionsAr: pairing,
          inStoreDisplayTipAr: inStoreTip,
          postCopyAr: postCopy,
          microTestIdeaAr: microTest
        });
      }
    });

    // Sort by longest days without sale descending
    return list.sort((a, b) => b.daysWithoutSale - a.daysWithoutSale).slice(0, 8);
  }, [products, sales]);

  // ========================================================
  // 3. DAILY ACTIVATION & FOLLOW-UP TASKS (مهام تنشيط العملاء)
  // ========================================================
  const activationTasks = useMemo<CustomerFollowUpTask[]>(() => {
    const tasks: CustomerFollowUpTask[] = [];
    const now = Date.now();

    // A) Customers whose perfume bottle is likely running low (30 - 45 days since last purchase)
    customCustomers.forEach(c => {
      const custSales = sales.filter(s => !s.isReversed && (s.customerPhone === c.phone || s.customerName === c.name));
      if (custSales.length > 0) {
        const sorted = [...custSales].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
        const lastSale = sorted[0];
        const daysSince = Math.floor((now - new Date(lastSale.date).getTime()) / (1000 * 60 * 60 * 24));

        const purchasedNames = (lastSale.items || []).map(it => it.productName);

        if (daysSince >= 30 && daysSince <= 60) {
          tasks.push({
            id: `task-replenish-${c.phone || c.name}`,
            customerName: c.name,
            customerPhone: c.phone,
            lastPurchaseDate: lastSale.date.slice(0, 10),
            lastPurchasedFragrances: purchasedNames,
            suggestedAction: `متابعة تجديد العطر (مرت ${daysSince} يوماً على آخر شراء - العبوة تقترب من النفاد)`,
            suggestedFragrance: purchasedNames[0] || 'عطر الدوام المفضل',
            priority: 'high',
            category: 'replenishment',
            dueDate: todayKey,
            status: completedTaskIds[`task-replenish-${c.phone || c.name}`]?.status as any || 'pending',
            resultNote: completedTaskIds[`task-replenish-${c.phone || c.name}`]?.note
          });
        } else if (daysSince > 60) {
          // B) Inactive customers needing warm reactivation
          tasks.push({
            id: `task-inactive-${c.phone || c.name}`,
            customerName: c.name,
            customerPhone: c.phone,
            lastPurchaseDate: lastSale.date.slice(0, 10),
            lastPurchasedFragrances: purchasedNames,
            suggestedAction: `إعادة تنشيط عميل غير نشط منذ ${daysSince} يوماً بعرض عطر جديد يناسب ذوقه`,
            suggestedFragrance: c.favoriteStyle === 'عود' ? 'عطر عود ملكي خاص' : 'تشكيلة صيفية جديدة',
            priority: 'medium',
            category: 'inactive_reactivation',
            dueDate: todayKey,
            status: completedTaskIds[`task-inactive-${c.phone || c.name}`]?.status as any || 'pending',
            resultNote: completedTaskIds[`task-inactive-${c.phone || c.name}`]?.note
          });
        }
      }
    });

    // C) Pending customer wishlist requests
    customerRequests.forEach(req => {
      if (req.status === 'جديد') {
        tasks.push({
          id: `task-req-${req.id}`,
          customerName: req.customerName,
          customerPhone: req.customerPhone,
          lastPurchaseDate: req.date ? req.date.slice(0, 10) : todayKey,
          lastPurchasedFragrances: [req.requestedPerfume || req.perfumeName || 'طلب خاص'],
          suggestedAction: `متابعة استفسار العميل عن توفر: ${req.requestedPerfume || req.perfumeName || 'عطر خاص'}`,
          suggestedFragrance: req.requestedPerfume || req.perfumeName || 'عطر مطلوب',
          priority: 'high',
          category: 'request_followup',
          dueDate: todayKey,
          status: completedTaskIds[`task-req-${req.id}`]?.status as any || 'pending',
          resultNote: completedTaskIds[`task-req-${req.id}`]?.note
        });
      }
    });

    // D) Stagnant perfume activation task for today
    if (stagnantPerfumes.length > 0) {
      const topStagnant = stagnantPerfumes[0];
      tasks.push({
        id: `task-stagnant-${topStagnant.productId}`,
        customerName: 'زبائن المتجر اليوميون',
        customerPhone: '',
        lastPurchaseDate: topStagnant.lastSaleDate || 'غير مسجل',
        lastPurchasedFragrances: [topStagnant.productName],
        suggestedAction: `تنشيط مبيعات عطر «${topStagnant.productName}» الراكد منذ ${topStagnant.daysWithoutSale} يوماً عبر التيستر`,
        suggestedFragrance: topStagnant.productName,
        priority: 'medium',
        category: 'cross_sell',
        dueDate: todayKey,
        status: completedTaskIds[`task-stagnant-${topStagnant.productId}`]?.status as any || 'pending',
        resultNote: completedTaskIds[`task-stagnant-${topStagnant.productId}`]?.note
      });
    }

    return tasks.slice(0, 12);
  }, [customCustomers, sales, customerRequests, stagnantPerfumes, todayKey, completedTaskIds]);

  // Conversion rate metric:
  const completedTasksCount = Object.keys(completedTaskIds).length;
  const convertedToSaleCount = Object.values(completedTaskIds).filter((v: { status: string; note: string }) => v.status === 'converted_to_sale').length;
  const taskConversionRate = completedTasksCount > 0
    ? Math.round((convertedToSaleCount / completedTasksCount) * 100)
    : 0;

  // ========================================================
  // 4. MARKETING CONTENT & CAMPAIGN IDEAS (فيسبوك وواتساب)
  // ========================================================
  const marketingIdeas: MarketingPostIdea[] = [
    {
      id: 'fb-post-1',
      channel: 'facebook',
      title: 'منشور الثبات والأثر الدائم (الهوية العطرية)',
      goal: 'تعزيز وعي الزبائن بجودة وثبات الزيوت النقية في لمسة عطر',
      targetAudience: 'عشاق العطور الثابتة والفخمة',
      featuredPerfume: 'توليفة الثبات والدوام',
      postText: `سر العطر الحقيقي ليس في الرائحة لحظة رشها، بل في «الأثر الذي يبقى والذكرى التي تدوم»... 🌿✨\nفي «لمسة عطر»، نختار زيوتنا العطرية بأعلى درجات النقاء، لتمنحك حضوراً واثقاً يرافقك طوال يومك دون بهتان.\nمتوفر بعبوات 50 مل و 30 مل بالسعر المعتمد.\n📍 شرفنا بزيارتك واكتشف توقيعك العطري الخاص.`,
      callToAction: 'تفضل بزيارتنا في المتجر أو راسلنا عبر واتساب لمعرفة أقرب عطر لذوقك',
      suggestedTiming: 'الساعة 6:00 مساءً (ذروة تصفح فيسبوك)'
    },
    {
      id: 'fb-post-2',
      channel: 'facebook',
      title: 'منشور الانتعاش الصباحي وعطور الدوام',
      goal: 'تنشيط مبيعات العطور الهادئة المنعشة للموظفين والطلاب',
      targetAudience: 'الموظفون، طلاب الجامعة، أصحاب الأعمال',
      featuredPerfume: 'العطور الحمضية والزهرية الهادئة',
      postText: `صباحك يبدأ بلمسة مختلفة... ☀️\nتوليفاتنا الصباحية المنعشة تجمع بين نضارة البرغموت ونقاء المسك الأبيض، لتمنحك طاقة إيجابية وهدوءاً طوال ساعات العمل.\nعبوة 50 مل عملية وأنيقة، مصممة لترافق حقيبتك ومكتبك.\n«لمسة عطر - أثر يبقى وذكرى تدوم»`,
      callToAction: 'احصل على عطرك الصباحي اليوم من المتجر مباشرة',
      suggestedTiming: 'الساعة 9:00 صباحاً'
    },
    {
      id: 'fb-post-3',
      channel: 'facebook',
      title: 'منشور فن الطبقات العطرية والميكس الحصري (Layering)',
      goal: 'زيادة الإقبال على خلطات الميكس ورفع متوسط الفاتورة',
      targetAudience: 'الباحثون عن التميز وتصميم عطر شخصي',
      featuredPerfume: 'ميكس شرقي فرنسي حصري',
      postText: `هل جربت أن ترتدي عطراً صُمم خصيصاً لك وحدك؟ 🧪👑\nنقدم لك تجربة «الميكس العطري»، حيث ندمج بنسب دقيقة بين دفء العود الفرنسي وانتعاش الفانيليا والزهور.\nتحصل على زجاجة واحدة تجمع أفضل عالمين، بتركيز متوازن يمنحك بصمة لا تتكرر.\nزورنا لتجربة تركيبتك الحصرية الآن!`,
      callToAction: 'اسأل عن خدمة الميكس المخصص عند زيارتك للمتجر',
      suggestedTiming: 'الساعة 8:00 مساءً في عطلة نهاية الأسبوع'
    },
    {
      id: 'wa-template-1',
      channel: 'whatsapp',
      title: 'رسالة متابعة وتجديد العطر (ودية ومحترفة)',
      goal: 'تشجيع العميل على إعادة الشراء في توقيت نفاد العبوة',
      targetAudience: 'العملاء الذين اشتروا منذ 30-45 يوماً',
      featuredPerfume: 'العطر السابق للعميل',
      postText: `أهلاً بحضرتك يا فندم 🌹\nمعاك طارق من متجر «لمسة عطر».\nنتمنى تكون بخير، وحبينا نطمن على تجربتك مع عطرنا الأخير، وهل الثبات والفوحان نالوا إعجابك؟\nلو زجاجتك قاربت على الانتهاء، نقدر نجهز لحضرتك نفس التركيبة أو نرشحلك عطر جديد يليق بذوقك الرفيع في أي وقت تشرفنا فيه.\nيومك سعيد وأهلاً بيك دائماً! 🌿`,
      callToAction: 'إرسال مباشر عبر واتساب العميل بنقرة واحدة',
      suggestedTiming: 'بين الساعة 4:00 عصراً و 8:00 مساءً'
    },
    {
      id: 'wa-template-2',
      channel: 'whatsapp',
      title: 'رسالة إعادة التواصل والترحيب بالعملاء القدامى',
      goal: 'إعادة تفعيل علاقة المتجر بالعملاء المنقطعين منذ فترة',
      targetAudience: 'العملاء المنقطعون منذ 60+ يوماً',
      featuredPerfume: 'تشكيلة الزيوت الجديدة',
      postText: `مرحباً بحضرتك يا فندم 🌿\nاشتقنا لتشريفك في متجر «لمسة عطر»!\nحبينا نسلم على حضرتك ونبلغك بوصول تشكيلة زيوت عطرية نقية جديدة مميزة جداً، ونعتقد أنها هتلاقي قبول كبير من ذوقك.\nيسعدنا مرورك في أي وقت لتجربتها على التيستر بنفسك.\nدمت بكل خير! ✨`,
      callToAction: 'إرسال عبر واتساب',
      suggestedTiming: 'أيام الخميس والجمعة'
    }
  ];

  // ========================================================
  // 5. TAREK'S HISTORICAL / PAPER BOOK SALES LEDGER
  // ========================================================
  const tarekSales = useMemo(() => {
    return sales.filter(s => {
      const emp = s.employeeName?.trim() || '';
      return emp === 'طارق' || emp.includes('طارق') || !emp;
    });
  }, [sales]);

  const backdatedSalesCount = useMemo(() => {
    return tarekSales.filter(s => s.isBackdated).length;
  }, [tarekSales]);

  // Handle saving task outcome
  const handleSaveTaskOutcome = () => {
    if (!selectedTaskForOutcome) return;
    setCompletedTaskIds(prev => ({
      ...prev,
      [selectedTaskForOutcome.id]: {
        status: taskOutcomeType,
        note: taskOutcomeNote.trim() || 'تم تنفيذ الإجراء'
      }
    }));
    setSelectedTaskForOutcome(null);
    setTaskOutcomeNote('');
    setTaskLinkedSaleId('');
  };

  return (
    <div className="space-y-5 animate-in fade-in duration-300 pb-16" dir="rtl">
      {/* ======================================================== */}
      {/* HEADER BAR: GREETING & APPLE LIQUID GLASS WORKSPACE       */}
      {/* ======================================================== */}
      <div className="p-4 sm:p-5 rounded-[28px] bg-white/80 dark:bg-[#1D1D1F]/80 backdrop-blur-2xl border border-white/50 dark:border-white/10 shadow-[0_8px_30px_rgb(0,0,0,0.06)] flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="space-y-1">
          <div className="flex items-center gap-2.5 flex-wrap">
            <span className="w-10 h-10 rounded-2xl bg-gradient-to-br from-amber-400 to-amber-600 text-slate-950 flex items-center justify-center font-black shadow-md shadow-amber-500/20">
              <Target size={20} />
            </span>
            <div>
              <h1 className="text-lg sm:text-xl font-black text-slate-900 dark:text-white flex items-center gap-2">
                <span>مرحباً يا {currentUser?.displayName || 'طارق'} 👋</span>
                <span className="text-[11px] px-3 py-0.5 rounded-full bg-amber-500/15 text-amber-900 dark:text-amber-200 font-bold border border-amber-500/30">
                  مساحة التشغيل والمبيعات
                </span>
              </h1>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                مركز المبيعات والتنشيط البيعي ومتابعة الأهداف اليومية · متجر «{settings.storeName || 'لمسة عطر'}»
              </p>
            </div>
          </div>
        </div>

        {/* Quick Launch Buttons */}
        <div className="flex items-center gap-2 flex-wrap">
          <button
            type="button"
            onClick={onNavigateToPOS}
            className="px-4 py-2.5 rounded-2xl bg-[#0071E3] hover:bg-[#0077ED] text-white font-black text-xs shadow-md shadow-[#0071E3]/20 transition-all flex items-center gap-2 cursor-pointer active:scale-98"
          >
            <ShoppingBag size={16} />
            <span>تسجيل بيع جديد (الكاشير)</span>
          </button>
          <button
            type="button"
            onClick={onNavigateToEntitlements}
            className="px-3.5 py-2.5 rounded-2xl bg-amber-500/15 hover:bg-amber-500/25 text-amber-900 dark:text-amber-300 border border-amber-500/30 font-bold text-xs transition-all flex items-center gap-1.5 cursor-pointer"
          >
            <Award size={15} />
            <span>عمولاتي ومستحقاتي</span>
          </button>
        </div>
      </div>

      {/* ======================================================== */}
      {/* WORKSPACE NAVIGATION TABS (Apple Segmented Glass Control) */}
      {/* ======================================================== */}
      <div className="flex items-center gap-1.5 overflow-x-auto scrollbar-none p-1.5 rounded-2xl bg-slate-200/60 dark:bg-white/5 backdrop-blur-xl border border-white/40 dark:border-white/10">
        {[
          { id: 'performance', label: '📊 موقف اليوم والهدف', icon: Target },
          { id: 'activation_tasks', label: `📋 مهام التنشيط (${activationTasks.length})`, icon: CheckCircle2 },
          { id: 'customers_crm', label: '👥 متابعة العملاء (CRM)', icon: Users },
          { id: 'stagnant_perfumes', label: `🧴 العطور الراكدة (${stagnantPerfumes.length})`, icon: Box },
          { id: 'marketing_studio', label: '📱 أفكار فيسبوك وواتساب', icon: Sparkles },
          { id: 'paper_book_ledger', label: `📜 فواتير الدفتر الورقي (${backdatedSalesCount})`, icon: FileText },
        ].map(tab => {
          const Icon = tab.icon;
          const isActive = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              type="button"
              onClick={() => setActiveTab(tab.id as any)}
              className={`px-3.5 py-2 rounded-xl text-xs font-black transition-all flex items-center gap-1.5 shrink-0 cursor-pointer ${
                isActive
                  ? 'bg-amber-500 text-slate-950 shadow-md shadow-amber-500/25 ring-1 ring-amber-400/40'
                  : 'text-slate-700 dark:text-slate-300 hover:bg-white/60 dark:hover:bg-white/10'
              }`}
            >
              <Icon size={14} />
              <span>{tab.label}</span>
            </button>
          );
        })}
      </div>

      {/* ======================================================== */}
      {/* TAB 1: DAILY TARGET & PERFORMANCE COCKPIT                 */}
      {/* ======================================================== */}
      {activeTab === 'performance' && (
        <div className="space-y-4">
                    {/* 🔒 RAW MATERIAL COST ISOLATION & RESTOCK GUARD CARD FOR TAREK */}
          <div className="rounded-3xl p-4 sm:p-5 bg-gradient-to-r from-amber-950 via-slate-900 to-slate-950 text-white border-2 border-amber-500/40 shadow-xl space-y-3">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-white/10">
              <div className="flex items-center gap-3">
                <div className="w-11 h-11 rounded-2xl bg-amber-500 text-slate-950 flex items-center justify-center shrink-0 shadow-lg font-black">
                  <ShieldCheck size={22} />
                </div>
                <div>
                  <div className="flex items-center gap-2 flex-wrap">
                    <h3 className="text-sm sm:text-base font-black text-amber-300">
                      🔒 المبلغ المفترض عزله بالدرج لحماية تكلفة خامات العطور (خاص بطارق والكاشير)
                    </h3>
                    <span className="px-2.5 py-0.5 rounded-full bg-amber-500/20 text-amber-200 border border-amber-400/40 text-[10px] font-black">
                      ممنوع السحب أو الصرف ⚠️
                    </span>
                  </div>
                  <p className="text-xs text-slate-300 mt-0.5">
                    القيمة الفعلية لتكلفة شراء وتوريد الزيوت العطرية والعبوات المباعة اليوم والتي يجب حجزها لإعادة التوريد.
                  </p>
                </div>
              </div>

              <div className="text-left bg-white/10 px-4 py-2.5 rounded-2xl border border-amber-400/30 shrink-0">
                <span className="text-[10px] font-bold text-amber-200 block text-right sm:text-left">المبلغ المفترض عزله بالدرج اليوم:</span>
                <div className="text-2xl font-black font-mono text-amber-400 text-right sm:text-left">
                  {todayCost.toLocaleString("ar-EG")} <span className="text-xs font-bold text-white">{settings.currency}</span>
                </div>
                <span className="text-[10px] text-slate-300 block text-right sm:text-left font-mono">
                  عن بيع {todaySales.length} فاتورة اليوم
                </span>
              </div>
            </div>

            <div className="p-3 rounded-2xl bg-amber-500/10 border border-amber-500/20 flex items-start gap-2 text-xs text-amber-100 leading-relaxed">
              <AlertTriangle size={18} className="text-amber-400 shrink-0 mt-0.5" />
              <div>
                <strong className="text-amber-300 font-bold block mb-0.5">تنبيه ذكي وواضح لطارق:</strong>
                <span>
                  يا طارق، مبلغ الـ <strong className="font-mono text-amber-300 text-sm px-1 font-black">{todayCost.toLocaleString("ar-EG")} {settings.currency}</strong> هو التكلفة المباشرة للزيوت العطرية والعبوات التي بيعت اليوم. **يُمنع بتاتاً سحب هذا المبلغ أو صرفه لأي بند مصروفات أو نثريات أو رواتب**، حيث يُعزل بالدرج ويُرحل لحساب توريد المخزون حتى لا يحدث عجز في مشتريات الزيوت العادلة!
                </span>
              </div>
            </div>
          </div>

          {/* Top Performance Cards Grid */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3.5">
            {/* Card 1: Today Sales Revenue & Target */}
            <div className="p-4 rounded-3xl bg-white dark:bg-[#1D1D1F] border border-slate-200 dark:border-white/10 shadow-2xs space-y-2">
              <div className="flex items-center justify-between text-xs text-slate-500 dark:text-slate-400">
                <span className="font-bold flex items-center gap-1.5">
                  <TrendingUp size={15} className="text-[#0071E3]" />
                  <span>مبيعات اليوم المحققة</span>
                </span>
                <span className="font-mono font-bold text-slate-700 dark:text-slate-300">
                  الهدف: {dailyTargetRevenue.toLocaleString('ar-EG')} ج.م
                </span>
              </div>
              <div className="flex items-baseline justify-between">
                <span className="text-2xl font-black font-mono tabular-nums text-slate-950 dark:text-white">
                  {todayGrossSales.toLocaleString('ar-EG')}
                </span>
                <span className="text-xs font-bold text-slate-400">{settings.currency}</span>
              </div>
              {/* Progress Bar */}
              <div className="space-y-1">
                <div className="w-full h-2 rounded-full bg-slate-100 dark:bg-white/10 overflow-hidden">
                  <div
                    className={`h-full transition-all duration-500 ${
                      revenueProgressPct >= 100
                        ? 'bg-gradient-to-r from-emerald-500 to-teal-400'
                        : 'bg-gradient-to-r from-blue-600 to-indigo-600'
                    }`}
                    style={{ width: `${revenueProgressPct}%` }}
                  />
                </div>
                <div className="flex justify-between text-[10.5px] font-bold text-slate-500">
                  <span>تم إنجاز {revenueProgressPct}%</span>
                  <span>المتبقي: {remainingRevenue.toLocaleString('ar-EG')} ج.م</span>
                </div>
              </div>
            </div>

            {/* Card 2: Bottles Sold Today Breakdown */}
            <div className="p-4 rounded-3xl bg-white dark:bg-[#1D1D1F] border border-slate-200 dark:border-white/10 shadow-2xs space-y-2">
              <div className="flex items-center justify-between text-xs text-slate-500 dark:text-slate-400">
                <span className="font-bold flex items-center gap-1.5">
                  <ShoppingBag size={15} className="text-emerald-600" />
                  <span>العبوات المباعة اليوم</span>
                </span>
                <span className="font-mono text-emerald-600 dark:text-emerald-400 font-bold">
                  {todaySales.length} عملية بيع
                </span>
              </div>
              <div className="flex items-baseline justify-between">
                <span className="text-2xl font-black font-mono tabular-nums text-emerald-600 dark:text-emerald-400">
                  {bottleBreakdown.totalBottles}
                </span>
                <span className="text-xs font-bold text-slate-400">عبوة عطر</span>
              </div>
              <div className="flex items-center justify-between text-[10.5px] font-bold text-slate-600 dark:text-slate-300 pt-1 border-t border-slate-100 dark:border-white/5">
                <span>50مل: <strong className="font-mono text-slate-900 dark:text-white">{bottleBreakdown.size50}</strong></span>
                <span>30مل: <strong className="font-mono text-slate-900 dark:text-white">{bottleBreakdown.size30}</strong></span>
                <span>100مل: <strong className="font-mono text-slate-900 dark:text-white">{bottleBreakdown.size100}</strong></span>
                <span>رول: <strong className="font-mono text-slate-900 dark:text-white">{bottleBreakdown.rollOnCount}</strong></span>
              </div>
            </div>

            {/* Card 3: Net Contribution vs Target (المساهمة المحققة) */}
            <div className="p-4 rounded-3xl bg-white dark:bg-[#1D1D1F] border border-slate-200 dark:border-white/10 shadow-2xs space-y-2">
              <div className="flex items-center justify-between text-xs text-slate-500 dark:text-slate-400">
                <span className="font-bold flex items-center gap-1.5">
                  <Layers size={15} className="text-amber-500" />
                  <span>مساهمة المبيعات المحققة</span>
                </span>
                <span className="font-mono font-bold text-amber-600 dark:text-amber-400">
                  الهدف: {targetContribution.toLocaleString('ar-EG')} ج.م
                </span>
              </div>
              <div className="flex items-baseline justify-between">
                <span className="text-2xl font-black font-mono tabular-nums text-amber-600 dark:text-amber-400">
                  {todayContribution.toLocaleString('ar-EG')}
                </span>
                <span className="text-xs font-bold text-slate-400">{settings.currency}</span>
              </div>
              <div className="space-y-1">
                <div className="w-full h-2 rounded-full bg-slate-100 dark:bg-white/10 overflow-hidden">
                  <div
                    className="h-full bg-gradient-to-r from-amber-500 to-orange-500 transition-all duration-500"
                    style={{ width: `${contributionProgressPct}%` }}
                  />
                </div>
                <div className="flex justify-between text-[10.5px] font-bold text-slate-500">
                  <span>تغطية: {contributionProgressPct}%</span>
                  <span>المتبقي للمساهمة: {remainingContribution.toLocaleString('ar-EG')} ج.م</span>
                </div>
              </div>
            </div>

            {/* Card 4: Tarek's Live Commission Today */}
            <div className="p-4 rounded-3xl bg-white dark:bg-[#1D1D1F] border border-amber-400/40 dark:border-amber-500/30 shadow-2xs space-y-2 bg-gradient-to-br from-amber-500/5 to-transparent">
              <div className="flex items-center justify-between text-xs text-slate-500 dark:text-slate-400">
                <span className="font-bold flex items-center gap-1.5 text-amber-800 dark:text-amber-300">
                  <Award size={15} className="text-amber-500" />
                  <span>عمولتي المستحقة اليوم</span>
                </span>
                <span className="text-[10px] font-mono font-bold px-2 py-0.5 rounded-full bg-amber-500/15 text-amber-800 dark:text-amber-300 border border-amber-500/30">
                  شريحة {todayCommission.policyUsed.commissionRateTier1 * 100}%
                  {bottleBreakdown.sprayCount >= 10 && ` ← ${todayCommission.policyUsed.commissionRateTier2 * 100}%`}
                </span>
              </div>
              <div className="flex items-baseline justify-between">
                <span className="text-2xl font-black font-mono tabular-nums text-amber-600 dark:text-amber-400">
                  {Number(todayCommission.calculatedCommissionEgp ?? todayCommission.totalCommissionEgp ?? 0).toLocaleString('ar-EG')}
                </span>
                <span className="text-xs font-bold text-slate-400">{settings.currency}</span>
              </div>
              <div className="p-2 rounded-xl bg-amber-500/10 border border-amber-500/20 text-[10.5px] space-y-1">
                <div className="flex justify-between font-bold text-amber-900 dark:text-amber-200">
                  <span>مؤشر شريحة الـ 7% (10 عبوات بخاخ):</span>
                  <span className="font-mono">{bottleBreakdown.sprayCount} من 10</span>
                </div>
                <div className="w-full h-1.5 rounded-full bg-black/20 overflow-hidden">
                  <div
                    className="h-full bg-amber-500 transition-all duration-500"
                    style={{ width: `${Math.min(100, (bottleBreakdown.sprayCount / 10) * 100)}%` }}
                  />
                </div>
              </div>
            </div>
          </div>

          {/* Performance Guidance: Pace, Break-even & Actionable Bottles Needed */}
          <div className="p-4 sm:p-5 rounded-3xl bg-white dark:bg-[#1D1D1F] border border-slate-200 dark:border-white/10 shadow-2xs space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-100 dark:border-white/10 pb-3">
              <div className="flex items-center gap-2">
                <span className="w-8 h-8 rounded-xl bg-amber-500/15 text-amber-600 flex items-center justify-center font-bold">
                  <Zap size={18} />
                </span>
                <div>
                  <h3 className="text-sm font-black text-slate-900 dark:text-white">
                    تحليل الموقف البيعي ومسار التعادل
                  </h3>
                  <p className="text-xs text-slate-500">
                    التمييز الدقيق بين مبيعات اليوم، التكلفة، المساهمة، تغطية المصاريف الثابتة، والربح
                  </p>
                </div>
              </div>

              {/* Status Badge */}
              <div className="flex items-center gap-2">
                <span className={`px-3 py-1.5 rounded-xl text-xs font-black flex items-center gap-1.5 ${
                  paceStatus === 'ahead'
                    ? 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 border border-emerald-500/30'
                    : paceStatus === 'on_track'
                    ? 'bg-blue-500/15 text-blue-700 dark:text-blue-300 border border-blue-500/30'
                    : 'bg-rose-500/15 text-rose-700 dark:text-rose-300 border border-rose-500/30 animate-pulse'
                }`}>
                  <Flame size={14} />
                  <span>
                    {paceStatus === 'ahead' ? '🌟 متجاوز للهدف اليومي' : paceStatus === 'on_track' ? '🟢 على المسار المستهدف' : '⚠️ أقل من المسار المطلوب (نشّط المبيعات)'}
                  </span>
                </span>
              </div>
            </div>

            {/* Financial Distinctions Grid */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3 text-xs">
              {/* Box 1: Fixed Expense Coverage */}
              <div className="p-3.5 rounded-2xl bg-slate-50 dark:bg-white/5 border border-slate-200 dark:border-white/10 space-y-2">
                <div className="flex justify-between items-center text-slate-600 dark:text-slate-300">
                  <span className="font-bold">1. تغطية المصروفات الثابتة:</span>
                  <span className="font-mono font-bold">{fixedExpenseCoveredPct}%</span>
                </div>
                <p className="text-[11px] text-slate-500">
                  المصروف الثابت المحمل على اليوم: <strong>{breakEvenFixedExpense} ج.م</strong>.
                  {todayContribution >= breakEvenFixedExpense ? (
                    <span className="text-emerald-600 dark:text-emerald-400 font-bold block pt-1">
                      ✓ تم تغطية كامل المصروف الثابت وتحقيق فائض مساهمة!
                    </span>
                  ) : (
                    <span className="text-amber-600 dark:text-amber-400 font-bold block pt-1">
                      متبقي لتغطية الثابت: {remainingFixedExpense} ج.م مساهمة.
                    </span>
                  )}
                </p>
              </div>

              {/* Box 2: Target Contribution */}
              <div className="p-3.5 rounded-2xl bg-slate-50 dark:bg-white/5 border border-slate-200 dark:border-white/10 space-y-2">
                <div className="flex justify-between items-center text-slate-600 dark:text-slate-300">
                  <span className="font-bold">2. مساهمة التعادل المستهدفة:</span>
                  <span className="font-mono font-bold">{targetContribution} ج.م</span>
                </div>
                <p className="text-[11px] text-slate-500">
                  تحققت مساهمة فعلية: <strong>{todayContribution} ج.م</strong>.
                  المساهمة = (إجمالي المبيعات {todayGrossSales} ج.م) ناقص (تكلفة الخامات المباشرة {todayCost} ج.م).
                </p>
              </div>

              {/* Box 3: Actionable Bottles Needed */}
              <div className="p-3.5 rounded-2xl bg-blue-50/70 dark:bg-blue-950/20 border border-blue-200 dark:border-blue-900/40 space-y-2">
                <div className="flex justify-between items-center text-blue-900 dark:text-blue-200">
                  <span className="font-bold">3. العبوات المطلوبة للهدف:</span>
                  <span className="font-mono font-bold">~{remainingBottlesEst} عبوة</span>
                </div>
                <p className="text-[11px] text-blue-800 dark:text-blue-300 leading-relaxed">
                  {remainingContribution === 0 ? (
                    <span className="text-emerald-700 dark:text-emerald-300 font-bold">
                      🎉 تم تحقيق كامل المستهدف لليوم بنجاح!
                    </span>
                  ) : (
                    <>
                      تحتاج تقريباً <strong>{remainingBottles50Ml} عبوات 50 مل</strong> (مساهمة 82 ج/عبوة) أو <strong>{remainingBottles30Ml} عبوات 30 مل</strong> (مساهمة 51 ج/عبوة).
                    </>
                  )}
                </p>
              </div>
            </div>

            {/* ADAPTIVE ACTION TRIGGER (إذا كانت المبيعات أقل من المسار) */}
            {paceStatus === 'behind' && (
              <div className="p-4 rounded-2xl bg-amber-500/10 border-2 border-amber-500/40 text-amber-950 dark:text-amber-200 space-y-2 animate-in slide-in-from-top-2">
                <h4 className="text-xs font-black flex items-center gap-2 text-amber-900 dark:text-amber-300">
                  <AlertTriangle size={16} className="text-amber-600" />
                  <span>خطة التحرك الفوري لسد الفجوة البيعية اليوم:</span>
                </h4>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5 text-xs">
                  <div className="p-2.5 rounded-xl bg-white/70 dark:bg-black/40 border border-amber-500/20 space-y-1">
                    <span className="font-bold text-amber-900 dark:text-amber-300 block">1. تواصل مع 3 عملاء:</span>
                    <p className="text-[11px] text-slate-600 dark:text-slate-400">
                      راجع قائمة المتابعة المستحقة اليوم وأرسل رسالة ترحيبية أو إشعار تجديد العطر.
                    </p>
                  </div>
                  <div className="p-2.5 rounded-xl bg-white/70 dark:bg-black/40 border border-amber-500/20 space-y-1">
                    <span className="font-bold text-amber-900 dark:text-amber-300 block">2. رشح عطر 50 مل:</span>
                    <p className="text-[11px] text-slate-600 dark:text-slate-400">
                      عبوة 50 مل تقدم أفضل قيمة للعميل (200 ج) وتساهم بـ 82 ج.م في سد فجوة الهدف بسرعة.
                    </p>
                  </div>
                  <div className="p-2.5 rounded-xl bg-white/70 dark:bg-black/40 border border-amber-500/20 space-y-1">
                    <span className="font-bold text-amber-900 dark:text-amber-300 block">3. تجربة التيستر للعطور الراكدة:</span>
                    <p className="text-[11px] text-slate-600 dark:text-slate-400">
                      قدم بخة تجربة مجانية لعطر راكد كـ «رائحة اليوم الحصرية» لكل عميل يدخل المتجر.
                    </p>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ======================================================== */}
      {/* TAB 2: DAILY ACTIVATION TASKS                            */}
      {/* ======================================================== */}
      {activeTab === 'activation_tasks' && (
        <div className="space-y-4">
          <div className="p-4 rounded-3xl bg-white dark:bg-[#1D1D1F] border border-slate-200 dark:border-white/10 shadow-2xs space-y-3">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-slate-100 dark:border-white/10 pb-3">
              <div>
                <h3 className="text-sm font-black text-slate-900 dark:text-white flex items-center gap-2">
                  <CheckCircle2 size={16} className="text-amber-500" />
                  <span>قائمة المهام اليومية لتنشيط المبيعات ({activationTasks.length} مهمة)</span>
                </h3>
                <p className="text-xs text-slate-500 mt-0.5">
                  مهام موجهة ومرتبة بالأولوية لزيادة المبيعات والمساهمة مع تسجيل النتائج ومعدل التحويل
                </p>
              </div>

              {/* Conversion Score */}
              <div className="flex items-center gap-2">
                <span className="text-xs font-mono font-bold px-3 py-1 rounded-xl bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 border border-emerald-500/30">
                  معدل تحويل التواصل لبيع: {taskConversionRate}% ({convertedToSaleCount} من {completedTasksCount})
                </span>
              </div>
            </div>

            {/* Tasks List */}
            <div className="space-y-2.5">
              {activationTasks.map(task => {
                const isCompleted = task.status === 'completed' || task.status === 'converted_to_sale';
                return (
                  <div
                    key={task.id}
                    className={`p-3.5 rounded-2xl border transition-all flex flex-col md:flex-row md:items-center justify-between gap-3 ${
                      isCompleted
                        ? 'bg-emerald-500/5 border-emerald-500/30 text-slate-500'
                        : task.priority === 'high'
                        ? 'bg-white dark:bg-[#1A1A1E] border-amber-500/40 shadow-xs'
                        : 'bg-white dark:bg-[#1A1A1E] border-slate-200 dark:border-white/10'
                    }`}
                  >
                    <div className="space-y-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className={`text-[10px] font-bold px-2 py-0.5 rounded-md ${
                          task.priority === 'high'
                            ? 'bg-rose-500/15 text-rose-700 dark:text-rose-300 font-mono'
                            : 'bg-slate-100 dark:bg-white/10 text-slate-600 dark:text-slate-300'
                        }`}>
                          {task.priority === 'high' ? 'أولوية عاجلة' : 'أولوية عادية'}
                        </span>
                        <span className="text-[10.5px] font-mono text-slate-400">
                          {task.category === 'replenishment' ? 'تجديد عطر' : task.category === 'inactive_reactivation' ? 'إعادة تنشيط' : task.category === 'request_followup' ? 'طلب مسجل' : 'تنشيط راكد'}
                        </span>
                        <strong className="text-xs font-bold text-slate-900 dark:text-white">
                          {task.customerName}
                        </strong>
                        {task.customerPhone && (
                          <span className="text-[10px] font-mono text-slate-400">({task.customerPhone})</span>
                        )}
                      </div>

                      <p className="text-xs font-bold text-slate-700 dark:text-slate-300">
                        {task.suggestedAction}
                      </p>

                      <div className="text-[11px] text-slate-500 flex items-center gap-2 flex-wrap">
                        <span>العطر المقترح: <strong className="text-amber-600 dark:text-amber-400">{task.suggestedFragrance}</strong></span>
                        {task.lastPurchaseDate && (
                          <span>· آخر شراء: {task.lastPurchaseDate}</span>
                        )}
                        {task.resultNote && (
                          <span className="text-emerald-600 dark:text-emerald-400 font-bold">
                            · النتيجة: {task.resultNote}
                          </span>
                        )}
                      </div>
                    </div>

                    {/* Action Controls */}
                    <div className="flex items-center gap-2 shrink-0">
                      {task.customerPhone && (
                        <a
                          href={`https://wa.me/20${task.customerPhone.replace(/[^0-9]/g, '').replace(/^0+/, '')}?text=${encodeURIComponent(`أهلاً بحضرتك يا فندم من «لمسة عطر» 🌹 نأمل أن تكون بخير! تواصلنا معك للاطمئنان على تجربتك مع عطرنا المميز.`)}`}
                          target="_blank"
                          rel="noreferrer"
                          className="px-3 py-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs flex items-center gap-1 shadow-xs transition-all"
                        >
                          <MessageCircle size={14} />
                          <span>واتساب</span>
                        </a>
                      )}

                      <button
                        type="button"
                        onClick={() => {
                          setSelectedTaskForOutcome(task);
                          setTaskOutcomeType('completed');
                          setTaskOutcomeNote('');
                        }}
                        className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all flex items-center gap-1 cursor-pointer ${
                          isCompleted
                            ? 'bg-emerald-500/20 text-emerald-800 dark:text-emerald-300'
                            : 'bg-amber-500 hover:bg-amber-400 text-slate-950 font-black shadow-xs'
                        }`}
                      >
                        <Check size={14} />
                        <span>{isCompleted ? 'تعديل النتيجة' : 'تسجيل النتيجة'}</span>
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {/* ======================================================== */}
      {/* TAB 3: CUSTOMERS CRM & SMART FOLLOW-UP                   */}
      {/* ======================================================== */}
      {activeTab === 'customers_crm' && (
        <div className="space-y-4">
          <div className="p-4 rounded-3xl bg-white dark:bg-[#1D1D1F] border border-slate-200 dark:border-white/10 shadow-2xs space-y-3">
            <div className="flex items-center justify-between border-b border-slate-100 dark:border-white/10 pb-3">
              <div>
                <h3 className="text-sm font-black text-slate-900 dark:text-white flex items-center gap-2">
                  <Users size={16} className="text-blue-600" />
                  <span>نظام متابعة العملاء المخصص لطارق ({customCustomers.length} عميل)</span>
                </h3>
                <p className="text-xs text-slate-500 mt-0.5">
                  بيانات التواصل المصرح بها، العطور المفضلة، وسجل التنشيط مع احترام الخصوصية
                </p>
              </div>
              <button
                type="button"
                onClick={onNavigateToCustomers}
                className="px-3 py-1.5 rounded-xl bg-slate-100 dark:bg-white/10 text-slate-700 dark:text-slate-300 font-bold text-xs hover:bg-slate-200 transition-all flex items-center gap-1"
              >
                <span>فتح CRM الشامل</span>
                <ChevronRight size={14} />
              </button>
            </div>

            {/* Customers Cards Table */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {customCustomers.slice(0, 10).map((c, idx) => {
                const custSales = sales.filter(s => !s.isReversed && (s.customerPhone === c.phone || s.customerName === c.name));
                const totalSpent = custSales.reduce((sum, s) => sum + s.totalPrice, 0);

                return (
                  <div key={c.phone || idx} className="p-3.5 rounded-2xl bg-slate-50 dark:bg-white/5 border border-slate-200 dark:border-white/10 space-y-2">
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <strong className="text-xs font-black text-slate-900 dark:text-white block">
                          {c.name}
                        </strong>
                        <span className="text-[11px] font-mono text-slate-500 block">
                          {c.phone || 'بدون هاتف'}
                        </span>
                      </div>
                      <span className="text-[10px] font-mono font-bold px-2 py-0.5 rounded-md bg-amber-500/15 text-amber-700 dark:text-amber-300">
                        {custSales.length} مشتريات ({totalSpent.toLocaleString('ar-EG')} ج)
                      </span>
                    </div>

                    <div className="text-[11px] text-slate-600 dark:text-slate-400 space-y-1">
                      <div>الذوق المفضل: <strong>{c.favoriteStyle || 'متنوع'}</strong></div>
                      {c.notes && <div className="text-gray-500 italic">ملاحظة: {c.notes}</div>}
                    </div>

                    <div className="pt-2 border-t border-slate-200 dark:border-white/10 flex items-center justify-between gap-2">
                      {c.phone && (
                        <a
                          href={`https://wa.me/20${c.phone.replace(/[^0-9]/g, '').replace(/^0+/, '')}?text=${encodeURIComponent(`أهلاً بحضرتك يا أستاذ ${c.name} من «لمسة عطر» 🌹 نأمل أن تكون بخير دائماً.`)}`}
                          target="_blank"
                          rel="noreferrer"
                          className="px-2.5 py-1 rounded-xl bg-emerald-600 text-white text-[11px] font-bold flex items-center gap-1 shadow-xs"
                        >
                          <MessageCircle size={13} />
                          <span>تواصل واتساب</span>
                        </a>
                      )}
                      <button
                        type="button"
                        onClick={onNavigateToPOS}
                        className="px-2.5 py-1 rounded-xl bg-blue-600 text-white text-[11px] font-bold flex items-center gap-1"
                      >
                        <ShoppingBag size={13} />
                        <span>تسجيل بيع للعميل</span>
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {/* ======================================================== */}
      {/* TAB 4: STAGNANT PERFUMES RADAR (العطور الراكدة)           */}
      {/* ======================================================== */}
      {activeTab === 'stagnant_perfumes' && (
        <div className="space-y-4">
          <div className="p-4 rounded-3xl bg-white dark:bg-[#1D1D1F] border border-slate-200 dark:border-white/10 shadow-2xs space-y-3">
            <div className="border-b border-slate-100 dark:border-white/10 pb-3">
              <h3 className="text-sm font-black text-slate-900 dark:text-white flex items-center gap-2">
                <Box size={16} className="text-amber-500" />
                <span>تحليل العطور الراكدة وخطط التنشيط العملية ({stagnantPerfumes.length} عطر)</span>
              </h3>
              <p className="text-xs text-slate-500 mt-0.5">
                اكتشاف العطور بطيئة الحركة وتوجيه طارق لكيفية عرضها وتوليفها دون حرق الأسعار أو المساس بالقواعد المالية
              </p>
            </div>

            {stagnantPerfumes.length === 0 ? (
              <div className="p-8 text-center text-xs text-slate-500">
                🎉 لا توجد عطور راكدة حالياً! حركة المبيعات والمخزون متوازنة.
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5">
                {stagnantPerfumes.map(item => (
                  <div
                    key={item.productId}
                    className="p-4 rounded-2xl bg-white dark:bg-[#1A1A1E] border border-slate-200 dark:border-white/10 shadow-sm space-y-3"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <div className="flex items-center gap-2">
                          <strong className="text-sm font-black text-slate-900 dark:text-white">
                            {item.productName}
                          </strong>
                          <span className="text-[10px] font-mono px-2 py-0.5 rounded-md bg-amber-500/15 text-amber-700 dark:text-amber-300 font-bold">
                            {item.productType}
                          </span>
                        </div>
                        <span className="text-xs font-mono text-rose-500 font-bold block mt-0.5">
                          لم يباع منذ {item.daysWithoutSale} يوماً · الرصيد: {item.currentStockGrams} جم (~{item.approxBottles} عبوة)
                        </span>
                      </div>

                      <div className="text-left font-mono">
                        <span className="text-xs font-bold text-slate-400 block">سعر 50مل:</span>
                        <span className="text-sm font-black text-slate-900 dark:text-white">{item.standardPriceEgp} ج.م</span>
                      </div>
                    </div>

                    {/* Operational Activation Plan */}
                    <div className="p-3 rounded-xl bg-slate-50 dark:bg-white/5 border border-slate-200 dark:border-white/10 space-y-1.5 text-xs">
                      <div className="text-slate-700 dark:text-slate-300">
                        🎯 الجمهور المستهدف: <strong>{item.targetAudienceAr}</strong>
                      </div>
                      <div className="text-slate-700 dark:text-slate-300">
                        💡 طريقة العرض بالمتجر: <strong>{item.inStoreDisplayTipAr}</strong>
                      </div>
                      <div className="text-blue-700 dark:text-blue-300 font-bold">
                        🧪 توليفة مقترحة: {item.pairingSuggestionsAr[0]}
                      </div>
                    </div>

                    {/* Copy Promo Post Button */}
                    <div className="flex items-center justify-between gap-2 pt-1 border-t border-slate-100 dark:border-white/5 text-xs">
                      <span className="text-[10.5px] text-gray-400">
                        تجربة صغيرة: {item.microTestIdeaAr}
                      </span>
                      <button
                        type="button"
                        onClick={() => handleCopy(item.postCopyAr, item.productId)}
                        className="px-3 py-1.5 rounded-xl bg-slate-100 dark:bg-white/10 hover:bg-slate-200 text-slate-800 dark:text-slate-200 font-bold flex items-center gap-1.5 cursor-pointer shrink-0"
                      >
                        {copiedKey === item.productId ? <Check size={14} className="text-emerald-500" /> : <Copy size={14} />}
                        <span>{copiedKey === item.productId ? 'تم النسخ' : 'نسخ نص للترويج'}</span>
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* ======================================================== */}
      {/* TAB 5: MARKETING & CONTENT STUDIO (فيسبوك وواتساب)        */}
      {/* ======================================================== */}
      {activeTab === 'marketing_studio' && (
        <div className="space-y-4">
          <div className="p-4 rounded-3xl bg-white dark:bg-[#1D1D1F] border border-slate-200 dark:border-white/10 shadow-2xs space-y-3">
            <div className="border-b border-slate-100 dark:border-white/10 pb-3">
              <h3 className="text-sm font-black text-slate-900 dark:text-white flex items-center gap-2">
                <Sparkles size={16} className="text-amber-500" />
                <span>أفكار التسويق والمحتوى وحملات واتساب وفيسبوك</span>
              </h3>
              <p className="text-xs text-slate-500 mt-0.5">
                نصوص احترافية جاهزة للنشر والتواصل تعبر عن هوية «لمسة عطر» مع قياس تفاعل ومبيعات كل حملة
              </p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5">
              {marketingIdeas.map(idea => (
                <div
                  key={idea.id}
                  className="p-4 rounded-2xl bg-white dark:bg-[#1A1A1E] border border-slate-200 dark:border-white/10 shadow-sm space-y-3 flex flex-col justify-between"
                >
                  <div className="space-y-2">
                    <div className="flex items-center justify-between gap-2">
                      <span className={`text-[10px] font-bold px-2.5 py-0.5 rounded-full ${
                        idea.channel === 'facebook'
                          ? 'bg-blue-600 text-white'
                          : 'bg-emerald-600 text-white'
                      }`}>
                        {idea.channel === 'facebook' ? 'صفحة فيسبوك' : 'رسائل واتساب'}
                      </span>
                      <span className="text-[10.5px] font-mono text-slate-400">{idea.suggestedTiming}</span>
                    </div>

                    <h4 className="text-xs font-black text-slate-900 dark:text-white">
                      {idea.title}
                    </h4>

                    <div className="p-3 rounded-xl bg-slate-50 dark:bg-black/30 border border-slate-200 dark:border-white/10 text-xs font-sans text-slate-700 dark:text-slate-300 whitespace-pre-line leading-relaxed">
                      {idea.postText}
                    </div>

                    <div className="text-[11px] text-slate-500">
                      🎯 الهدف: <strong>{idea.goal}</strong> · الجمهور: {idea.targetAudience}
                    </div>
                  </div>

                  <div className="pt-2 border-t border-slate-100 dark:border-white/5 flex items-center justify-between gap-2">
                    <span className="text-[10.5px] text-amber-600 dark:text-amber-400 font-bold">
                      {idea.callToAction}
                    </span>
                    <button
                      type="button"
                      onClick={() => handleCopy(idea.postText, idea.id)}
                      className="px-3.5 py-1.5 rounded-xl bg-slate-900 dark:bg-white text-white dark:text-slate-950 font-bold text-xs flex items-center gap-1.5 cursor-pointer shadow-xs"
                    >
                      {copiedKey === idea.id ? <Check size={14} className="text-emerald-400" /> : <Copy size={14} />}
                      <span>{copiedKey === idea.id ? 'تم النسخ بنجاح' : 'نسخ النص كاملاً'}</span>
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* ======================================================== */}
      {/* TAB 6: PAPER BOOK & HISTORICAL SALES LEDGER              */}
      {/* ======================================================== */}
      {activeTab === 'paper_book_ledger' && (
        <div className="space-y-4">
          <div className="p-4 rounded-3xl bg-white dark:bg-[#1D1D1F] border border-slate-200 dark:border-white/10 shadow-2xs space-y-3">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-slate-100 dark:border-white/10 pb-3">
              <div>
                <h3 className="text-sm font-black text-slate-900 dark:text-white flex items-center gap-2">
                  <FileText size={16} className="text-amber-500" />
                  <span>سجل مبيعات طارق وتتبع إدخالات الدفتر الورقي</span>
                </h3>
                <p className="text-xs text-slate-500 mt-0.5">
                  فصل دقيق بين تاريخ حدوث البيع الفعلي وتاريخ الإدخال بالنظام لمنع التكرار والحفاظ على الدقة
                </p>
              </div>
              <button
                type="button"
                onClick={onNavigateToPOS}
                className="px-3 py-1.5 rounded-xl bg-[#0071E3] hover:bg-[#0077ED] text-white font-bold text-xs flex items-center gap-1"
              >
                <Plus size={14} />
                <span>إضافة فاتورة بأثر رجعي بالكاشير</span>
              </button>
            </div>

            {/* Sales Table */}
            <div className="overflow-x-auto">
              <table className="w-full text-xs text-right">
                <thead>
                  <tr className="border-b border-slate-200 dark:border-white/10 text-slate-400 font-bold">
                    <th className="py-2.5 px-3">رقم الفاتورة</th>
                    <th className="py-2.5 px-3">تاريخ البيع الفعلي</th>
                    <th className="py-2.5 px-3">توقيت التسجيل</th>
                    <th className="py-2.5 px-3">النوع</th>
                    <th className="py-2.5 px-3">العميل</th>
                    <th className="py-2.5 px-3">الأصناف</th>
                    <th className="py-2.5 px-3">القيمة</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-white/5">
                  {tarekSales.slice(0, 15).map(sale => {
                    const isBackdated = sale.isBackdated || (sale.recordedAt && sale.date.slice(0, 10) !== sale.recordedAt.slice(0, 10));
                    return (
                      <tr key={sale.id} className="hover:bg-slate-50 dark:hover:bg-white/5">
                        <td className="py-2.5 px-3 font-mono font-bold text-slate-900 dark:text-white">
                          #{sale.id.slice(-6)}
                        </td>
                        <td className="py-2.5 px-3 font-mono font-bold text-blue-600 dark:text-blue-400">
                          {sale.date.slice(0, 10)}
                        </td>
                        <td className="py-2.5 px-3 font-mono text-slate-500 text-[11px]">
                          {sale.recordedAt ? sale.recordedAt.slice(0, 16).replace('T', ' ') : sale.date.slice(0, 16).replace('T', ' ')}
                        </td>
                        <td className="py-2.5 px-3">
                          {isBackdated ? (
                            <span className="text-[10px] font-mono font-bold px-2 py-0.5 rounded-md bg-amber-500/15 text-amber-700 dark:text-amber-300 border border-amber-500/30">
                              📜 دفتر ورقي
                            </span>
                          ) : (
                            <span className="text-[10px] font-mono font-bold px-2 py-0.5 rounded-md bg-emerald-500/15 text-emerald-700 dark:text-emerald-300">
                              فوري مباشر
                            </span>
                          )}
                        </td>
                        <td className="py-2.5 px-3 text-slate-700 dark:text-slate-300">
                          {sale.customerName || 'عميل نقدي'}
                        </td>
                        <td className="py-2.5 px-3 font-mono text-slate-600 dark:text-slate-400">
                          {sale.items.length} صنف ({sale.items.reduce((s, it) => s + (it.quantity || 1), 0)} عبوة)
                        </td>
                        <td className="py-2.5 px-3 font-mono font-black text-slate-950 dark:text-white">
                          {sale.totalPrice.toLocaleString('ar-EG')} {settings.currency}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* ======================================================== */}
      {/* MODAL: TASK OUTCOME RECORDING DIALOG                     */}
      {/* ======================================================== */}
      {selectedTaskForOutcome && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs">
          <div className="relative w-full max-w-md rounded-3xl bg-white dark:bg-[#1D1D1F] border border-amber-500/40 p-5 shadow-2xl space-y-4">
            <div className="flex items-center justify-between border-b border-slate-100 dark:border-white/10 pb-3">
              <h3 className="text-sm font-black text-slate-900 dark:text-white flex items-center gap-2">
                <CheckCircle2 size={16} className="text-amber-500" />
                <span>تسجيل نتيجة التواصل: {selectedTaskForOutcome.customerName}</span>
              </h3>
              <button
                type="button"
                onClick={() => setSelectedTaskForOutcome(null)}
                className="p-1 text-slate-400 hover:text-slate-600"
              >
                <X size={18} />
              </button>
            </div>

            <div className="space-y-3 text-xs">
              <div>
                <label className="font-bold text-slate-700 dark:text-slate-300 block mb-1">
                  ما هي نتيجة التواصل الفعلي؟
                </label>
                <select
                  value={taskOutcomeType}
                  onChange={(e) => setTaskOutcomeType(e.target.value as any)}
                  className="w-full h-10 px-3 rounded-xl border border-slate-300 dark:border-white/20 bg-slate-50 dark:bg-black/30 font-bold"
                >
                  <option value="completed">✓ تم التواصل والاطمئنان على العميل</option>
                  <option value="converted_to_sale">💰 تم إتمام عملية بيع جديدة بنجاح!</option>
                  <option value="in_progress">⏳ لم يرد / المتابعة لاحقاً</option>
                  <option value="declined">🚫 لا يرغب بتلقي رسائل متابعة حالياً</option>
                </select>
              </div>

              <div>
                <label className="font-bold text-slate-700 dark:text-slate-300 block mb-1">
                  ملاحظات طارق حول نتيجة التواصل:
                </label>
                <textarea
                  rows={2}
                  value={taskOutcomeNote}
                  onChange={(e) => setTaskOutcomeNote(e.target.value)}
                  placeholder="مثال: مهتم بعطر 50 مل وسيحضر غداً للاستلام، أو اشترى زجاجة جديدة..."
                  className="w-full p-2.5 rounded-xl border border-slate-300 dark:border-white/20 bg-slate-50 dark:bg-black/30 font-bold resize-none"
                />
              </div>

              {taskOutcomeType === 'converted_to_sale' && (
                <div className="p-3 rounded-xl bg-emerald-500/10 border border-emerald-500/30 text-emerald-800 dark:text-emerald-300 space-y-1">
                  <span className="font-bold block">🎉 رائع! سيتم احتساب هذا التحويل ضمن معدل نجاح التنشيط</span>
                  <p className="text-[11px]">يمكنك الانتقال فوراً للكاشير لإصدار الفاتورة للعميل.</p>
                </div>
              )}

              <div className="flex items-center justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setSelectedTaskForOutcome(null)}
                  className="px-4 py-2 rounded-xl text-slate-600 dark:text-slate-300 font-bold"
                >
                  إلغاء
                </button>
                <button
                  type="button"
                  onClick={handleSaveTaskOutcome}
                  className="px-5 py-2 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 font-black shadow-md cursor-pointer"
                >
                  حفظ واعتماد النتيجة
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
