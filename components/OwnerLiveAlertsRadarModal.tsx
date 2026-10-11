import React, { useState, useEffect, useMemo } from 'react';
import { 
  X, 
  Bell, 
  Volume2, 
  VolumeX, 
  Smartphone, 
  Laptop, 
  Wifi, 
  Sparkles, 
  CheckCircle2, 
  Clock, 
  ShieldCheck, 
  Play,
  Send,
  MessageSquare,
  AlertCircle,
  Target,
  Award,
  ListCheck,
  UserCheck,
  Radio,
  Star,
  Sliders,
  Calendar,
  Hourglass,
  Search,
  Copy,
  Check,
  Lock,
  ChevronDown,
  Filter,
  RotateCcw,
  Repeat
} from 'lucide-react';
import { soundAlertService } from '../services/soundAlertService';
import { browserNotificationService } from '../services/browserNotificationService';
import { Sale, OwnerStaffBroadcast, AppUser } from '../types';

interface OwnerLiveAlertsRadarModalProps {
  isOpen: boolean;
  onClose: () => void;
  recentSales: Sale[];
  currency?: string;
  isCloudConnected?: boolean;
  onTriggerTestAlert?: () => void;
  isOwner?: boolean;
  broadcasts?: OwnerStaffBroadcast[];
  onSendBroadcast?: (broadcast: OwnerStaffBroadcast) => Promise<void> | void;
  onAcknowledgeBroadcast?: (broadcastId: string) => Promise<void> | void;
  currentUser?: AppUser | null;
}

// Duration options in hours
const DURATION_PRESETS = [
  { value: 1, label: 'ساعة واحدة', category: 'hours', badge: '1 ساعة' },
  { value: 4, label: '4 ساعات', category: 'hours', badge: '4 ساعات' },
  { value: 8, label: '8 ساعات (الافتراضي)', category: 'hours', badge: '8 ساعات (افتراضي)' },
  { value: 24, label: '24 ساعة (يوم)', category: 'days', badge: 'يوم كامل' },
  { value: 72, label: '3 أيام', category: 'days', badge: '3 أيام' },
  { value: 168, label: 'أسبوع كامل', category: 'days', badge: 'أسبوع' },
  { value: 720, label: 'شهر كامل', category: 'months', badge: 'شهر وأكثر' },
  { value: 0, label: 'دائم وثابت', category: 'permanent', badge: 'دائم ومثبت' },
] as const;

export const OwnerLiveAlertsRadarModal: React.FC<OwnerLiveAlertsRadarModalProps> = ({
  isOpen,
  onClose,
  recentSales,
  currency = 'ج.م',
  isCloudConnected = true,
  onTriggerTestAlert,
  isOwner = true,
  broadcasts = [],
  onSendBroadcast,
  onAcknowledgeBroadcast,
  currentUser,
}) => {
  // Navigation tabs
  const [activeTab, setActiveTab] = useState<'today' | 'important' | 'broadcast' | 'radar' | 'history'>('today');
  
  // Audio & Notification permissions
  const [soundEnabled, setSoundEnabled] = useState<boolean>(soundAlertService.isEnabled());
  const [notificationPermission, setNotificationPermission] = useState<NotificationPermission>(
    browserNotificationService.getPermission()
  );
  const [isTesting, setIsTesting] = useState(false);
  const [copiedId, setCopiedId] = useState<string | null>(null);

  // Administration authorization check
  const isAdmin = useMemo(() => {
    if (isOwner) return true;
    const role = currentUser?.role;
    return role === 'OWNER' || role === 'STORE_MANAGER' || (currentUser as any)?.role === 'admin';
  }, [isOwner, currentUser]);

  // Composer Form States
  const [broadcastTitle, setBroadcastTitle] = useState('');
  const [broadcastMessage, setBroadcastMessage] = useState('');
  const [broadcastCategory, setBroadcastCategory] = useState<'urgent' | 'target' | 'instruction' | 'reward'>('urgent');
  const [targetEmployee, setTargetEmployee] = useState('all');
  const [requiresAcknowledgement, setRequiresAcknowledgement] = useState(true);
  
  // Advanced Settings State (Default duration: 8 hours!)
  const [showAdvancedSettings, setShowAdvancedSettings] = useState(true);
  const [durationHours, setDurationHours] = useState<number>(8); // Default 8 hours
  const [isImportant, setIsImportant] = useState<boolean>(false);
  const [soundType, setSoundType] = useState<'chime' | 'warning' | 'peaceful' | 'silent'>('chime');
  const [customHoursInput, setCustomHoursInput] = useState<string>('');
  const [isCustomDuration, setIsCustomDuration] = useState<boolean>(false);

  // Recurrence & Scheduling State (إعادة التنبيه كل يوم أو كل أسبوع مع تحديد اليوم والتاريخ ومدة التكرار)
  const [repeatMode, setRepeatMode] = useState<'none' | 'daily' | 'weekly'>('none');
  const [repeatDayOfWeek, setRepeatDayOfWeek] = useState<number>(() => new Date().getDay());
  const [repeatStartDate, setRepeatStartDate] = useState<string>(() => new Date().toISOString().slice(0, 10));
  const [repeatTime, setRepeatTime] = useState<string>('09:00');
  const [repeatDurationWeeks, setRepeatDurationWeeks] = useState<number>(4); // Default 4 weeks (1 month)

  // Filter & Search states for Important tab
  const [importantFilter, setImportantFilter] = useState<'all' | 'hours' | 'days' | 'months' | 'permanent'>('all');
  const [searchQuery, setSearchQuery] = useState('');

  // Async dispatch state
  const [isSending, setIsSending] = useState(false);
  const [sendSuccessMessage, setSendSuccessMessage] = useState<string | null>(null);

  useEffect(() => {
    if (isOpen) {
      setSoundEnabled(soundAlertService.isEnabled());
      setNotificationPermission(browserNotificationService.getPermission());
    }
  }, [isOpen]);

  // Helper: check if a broadcast was created today
  const isCreatedToday = (isoString?: string): boolean => {
    if (!isoString) return false;
    const date = new Date(isoString);
    const today = new Date();
    return (
      date.getFullYear() === today.getFullYear() &&
      date.getMonth() === today.getMonth() &&
      date.getDate() === today.getDate()
    );
  };

  // Helper: check if a broadcast has expired (default: 8 hours if not set and not important)
  const checkIsExpired = (b: OwnerStaffBroadcast): boolean => {
    if (b.isArchived) return true;
    const now = Date.now();
    if (b.expiresAt) {
      return new Date(b.expiresAt).getTime() <= now;
    }
    // Fallback for alerts without explicit expiresAt:
    if (!b.isImportant && b.createdAt) {
      const age = now - new Date(b.createdAt).getTime();
      return age > 8 * 3600 * 1000;
    }
    return false;
  };

  // Helper: format remaining validity or time display
  const formatRemainingDuration = (b: OwnerStaffBroadcast): string => {
    if (b.isImportant && (!b.expiresAt || b.durationHours === 0)) {
      return '♾️ دائم ومثبت للرجوع إليه';
    }
    const expiry = b.expiresAt 
      ? new Date(b.expiresAt).getTime() 
      : (b.createdAt ? new Date(b.createdAt).getTime() + (b.durationHours || 8) * 3600 * 1000 : null);
    
    if (!expiry) return '♾️ دائم';
    const remainingMs = expiry - Date.now();
    if (remainingMs <= 0) return '⚠️ انتهت الصلاحية التلقائية';

    const totalMinutes = Math.floor(remainingMs / (60 * 1000));
    const hours = Math.floor(totalMinutes / 60);
    const minutes = totalMinutes % 60;
    const days = Math.floor(hours / 24);

    if (days > 0) return `⏳ متبقي: ${days} يوم و ${hours % 24} س`;
    if (hours > 0) return `⏳ متبقي: ${hours} س و ${minutes} د`;
    return `⏳ متبقي: ${minutes} دقيقة`;
  };

  // Helper: format recurrence details badge (تكرار التنبيه كل يوم أو كل أسبوع)
  const formatRecurrenceBadge = (b: OwnerStaffBroadcast): string | null => {
    if (!b.repeatMode || b.repeatMode === 'none') return null;
    const daysMap = ['الأحد', 'الإثنين', 'الثلاثاء', 'الأربعاء', 'الخميس', 'الجمعة', 'السبت'];
    const dayName = b.repeatDayOfWeek !== undefined ? daysMap[b.repeatDayOfWeek] : '';
    const timeStr = b.repeatTime ? ` الساعة ${b.repeatTime}` : '';
    if (b.repeatMode === 'daily') {
      return `🔄 يتكرر يومياً${timeStr}`;
    }
    if (b.repeatMode === 'weekly') {
      return `🔄 يتكرر أسبوعياً (كل ${dayName})${timeStr}`;
    }
    return null;
  };

  // Helper: copy message text
  const handleCopyText = (text: string, id: string) => {
    navigator.clipboard?.writeText?.(text);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 1500);
  };

  // Categorized broadcast collections
  const todayBroadcasts = useMemo(() => {
    return broadcasts.filter((b) => isCreatedToday(b.createdAt));
  }, [broadcasts]);

  const importantBroadcasts = useMemo(() => {
    return broadcasts.filter((b) => {
      if (!b.isImportant && b.category !== 'urgent') return false;
      
      // Filter by duration category if specified
      if (importantFilter !== 'all') {
        const cat = b.importanceCategory;
        const dur = b.durationHours ?? 8;
        if (importantFilter === 'hours') {
          if (cat !== 'hours' && !(dur > 0 && dur <= 24)) return false;
        } else if (importantFilter === 'days') {
          if (cat !== 'days' && !(dur > 24 && dur <= 168)) return false;
        } else if (importantFilter === 'months') {
          if (cat !== 'months' && !(dur > 168)) return false;
        } else if (importantFilter === 'permanent') {
          if (cat !== 'permanent' && dur !== 0 && b.expiresAt !== undefined) return false;
        }
      }

      // Search query filter
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        const matchesTitle = b.title?.toLowerCase().includes(q);
        const matchesMsg = b.message?.toLowerCase().includes(q);
        const matchesSender = b.senderName?.toLowerCase().includes(q);
        if (!matchesTitle && !matchesMsg && !matchesSender) return false;
      }

      return true;
    });
  }, [broadcasts, importantFilter, searchQuery]);

  const activeImportantCount = useMemo(() => {
    return broadcasts.filter((b) => b.isImportant).length;
  }, [broadcasts]);

  if (!isOpen || !isOwner) return null;

  const handleToggleSound = () => {
    const next = !soundEnabled;
    soundAlertService.setEnabled(next);
    setSoundEnabled(next);
    if (next) {
      soundAlertService.playActionChime();
    }
  };

  const handleRequestPushPermission = async () => {
    const granted = await browserNotificationService.requestPermission();
    setNotificationPermission(browserNotificationService.getPermission());
    if (granted) {
      browserNotificationService.sendNotification({
        title: '✨ تم تفعيل إشعارات لمسة عطر بنجاح',
        body: 'ستصلك الآن تنبيهات حية فورية عند أي عملية بيع أو توجيه إداري من أي جهاز.',
        tag: 'test-perm',
      });
      soundAlertService.playSaleChime();
    }
  };

  const handleTestAlert = () => {
    setIsTesting(true);
    soundAlertService.playSaleChime();
    browserNotificationService.sendNotification({
      title: `🛒 تجربة رادار البيع والتزامن: 450 ${currency}`,
      body: 'الكاشير: طارق · العميل: عميل مميز · 2 عبوة (مزامنة حية لحظية)',
      tag: `test-sale-${Date.now()}`,
    });
    if (onTriggerTestAlert) {
      onTriggerTestAlert();
    }
    setTimeout(() => setIsTesting(false), 1200);
  };

  const handleDispatchBroadcast = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!isAdmin) return;
    if (!broadcastTitle.trim() || !broadcastMessage.trim()) return;

    setIsSending(true);
    try {
      const finalDuration = isCustomDuration && customHoursInput 
        ? Math.max(1, parseInt(customHoursInput, 10) || 8)
        : durationHours;

      // Calculate auto-expiration time (default 8 hours)
      const expiresAt = finalDuration > 0 
        ? new Date(Date.now() + finalDuration * 3600 * 1000).toISOString()
        : undefined;

      // Determine importance category for time-based filtering
      let importanceCategory: 'hours' | 'days' | 'months' | 'permanent' = 'hours';
      if (finalDuration === 0) {
        importanceCategory = 'permanent';
      } else if (finalDuration > 168) {
        importanceCategory = 'months';
      } else if (finalDuration > 24) {
        importanceCategory = 'days';
      } else {
        importanceCategory = 'hours';
      }

      let repeatEndDate: string | undefined = undefined;
      if (repeatMode !== 'none' && repeatDurationWeeks > 0) {
        const startMs = new Date(repeatStartDate || new Date().toISOString().slice(0, 10)).getTime();
        repeatEndDate = new Date(startMs + repeatDurationWeeks * 7 * 86400000).toISOString().slice(0, 10);
      }

      const newBroadcast: OwnerStaffBroadcast = {
        id: `ob-${Date.now()}`,
        title: broadcastTitle.trim(),
        message: broadcastMessage.trim(),
        category: broadcastCategory,
        senderName: currentUser?.name || 'الإدارة العامة',
        targetEmployee,
        createdAt: new Date().toISOString(),
        expiresAt,
        durationHours: finalDuration,
        isImportant,
        importanceCategory,
        soundType,
        requiresAcknowledgement,
        acknowledgedBy: [],
        repeatMode,
        repeatDayOfWeek: repeatMode === 'weekly' ? repeatDayOfWeek : undefined,
        repeatStartDate: repeatMode !== 'none' ? repeatStartDate : undefined,
        repeatEndDate: repeatMode !== 'none' ? repeatEndDate : undefined,
        repeatTime: repeatMode !== 'none' ? repeatTime : undefined,
        repeatDurationWeeks: repeatMode !== 'none' ? repeatDurationWeeks : undefined,
      };

      if (onSendBroadcast) {
        await onSendBroadcast(newBroadcast);
      }

      // Play local sound chime based on soundType
      if (soundType === 'warning') {
        soundAlertService.playNotificationChime('warning');
      } else if (soundType === 'peaceful') {
        soundAlertService.playActionChime();
      } else if (soundType === 'chime') {
        soundAlertService.playAlertChime();
      }

      // Native push notification
      await browserNotificationService.sendNotification({
        title: `📢 ${newBroadcast.title}`,
        body: newBroadcast.message,
        soundType: newBroadcast.category === 'urgent' ? 'warning' : 'notification',
        requireInteraction: newBroadcast.isImportant || newBroadcast.category === 'urgent',
        vibrate: [250, 100, 250, 100, 250],
      });

      setSendSuccessMessage('تم إرسال التنبيه ودفع الإشعار للموظفين بنجاح وتوثيق مدة الصلاحية!');
      setBroadcastTitle('');
      setBroadcastMessage('');
      
      setTimeout(() => {
        setSendSuccessMessage(null);
        setActiveTab(isImportant ? 'important' : 'today');
      }, 1400);
    } catch (err) {
      console.error('Failed to dispatch broadcast:', err);
    } finally {
      setIsSending(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-5 bg-black/65 backdrop-blur-md animate-in fade-in duration-200">
      <div 
        dir="rtl"
        className="relative w-full max-w-2xl rounded-3xl bg-white/95 dark:bg-[#1A1A1E]/95 border border-[#C49746]/40 shadow-2xl p-4 sm:p-6 space-y-4 apple-glass overflow-hidden max-h-[92vh] flex flex-col"
      >
        {/* Top Header Bar */}
        <div className="flex items-center justify-between pb-3 border-b border-slate-200/80 dark:border-white/10 shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-11 h-11 rounded-2xl bg-gradient-to-tr from-amber-500 via-[#C49746] to-yellow-400 text-slate-950 flex items-center justify-center shadow-md shadow-amber-500/25">
              <Radio size={22} className="animate-pulse" />
            </div>
            <div>
              <h2 className="text-base sm:text-lg font-black text-slate-900 dark:text-white flex items-center gap-2">
                <span>رادار التنبيهات والتزامن الفوري</span>
                <span className="text-[10px] px-2.5 py-0.5 rounded-full bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 border border-emerald-500/30 font-mono font-bold">
                  LIVE 24/7
                </span>
              </h2>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                منظومة الإشعارات الحية، التوجيه الإداري الذكي، وضبط مدد انتهاء التنبيهات
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="w-9 h-9 rounded-full bg-slate-100 hover:bg-slate-200 dark:bg-white/10 dark:hover:bg-white/20 text-slate-600 dark:text-slate-200 flex items-center justify-center transition-colors cursor-pointer"
            title="إغلاق النافذة"
          >
            <X size={18} />
          </button>
        </div>

        {/* Navigation Tabs (Apple Glass Pill Bar) */}
        <div className="flex items-center gap-1.5 p-1 rounded-2xl bg-slate-100/90 dark:bg-white/5 border border-slate-200/80 dark:border-white/10 shrink-0 overflow-x-auto scrollbar-none">
          {/* Tab 1: Today's Notifications */}
          <button
            type="button"
            onClick={() => setActiveTab('today')}
            className={`py-2 px-3 rounded-xl text-xs font-bold transition-all flex items-center justify-center gap-1.5 cursor-pointer shrink-0 ${
              activeTab === 'today'
                ? 'bg-white dark:bg-white/15 text-slate-950 dark:text-white shadow-xs font-black'
                : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
            }`}
          >
            <Clock size={14} className={activeTab === 'today' ? 'text-amber-500' : ''} />
            <span>إشعارات اليوم</span>
            <span className="text-[10px] px-1.5 py-0.2 rounded-full bg-amber-500/20 text-amber-800 dark:text-amber-300 font-mono">
              {todayBroadcasts.length}
            </span>
          </button>

          {/* Tab 2: Important Directives Archive */}
          <button
            type="button"
            onClick={() => setActiveTab('important')}
            className={`py-2 px-3 rounded-xl text-xs font-bold transition-all flex items-center justify-center gap-1.5 cursor-pointer shrink-0 ${
              activeTab === 'important'
                ? 'bg-amber-500 text-slate-950 shadow-xs font-black'
                : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
            }`}
          >
            <Star size={14} className={activeTab === 'important' ? 'fill-current' : 'text-amber-500'} />
            <span>التنبيهات الهامة والمثبتة</span>
            <span className="text-[10px] px-1.5 py-0.2 rounded-full bg-black/15 font-mono">
              {activeImportantCount}
            </span>
          </button>

          {/* Tab 3: Dispatch Broadcast (Admin Only) */}
          <button
            type="button"
            onClick={() => setActiveTab('broadcast')}
            className={`py-2 px-3 rounded-xl text-xs font-bold transition-all flex items-center justify-center gap-1.5 cursor-pointer shrink-0 ${
              activeTab === 'broadcast'
                ? 'bg-slate-900 dark:bg-white text-white dark:text-slate-950 shadow-xs font-black'
                : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
            }`}
          >
            {isAdmin ? <Send size={13} /> : <Lock size={13} className="text-amber-600" />}
            <span>إرسال تنبيه</span>
            {isAdmin && <span className="text-[10px] text-amber-400">⚡</span>}
          </button>

          {/* Tab 4: Live Radar & Sync */}
          <button
            type="button"
            onClick={() => setActiveTab('radar')}
            className={`py-2 px-3 rounded-xl text-xs font-bold transition-all flex items-center justify-center gap-1.5 cursor-pointer shrink-0 ${
              activeTab === 'radar'
                ? 'bg-white dark:bg-white/15 text-slate-950 dark:text-white shadow-xs font-black'
                : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
            }`}
          >
            <Wifi size={14} className={activeTab === 'radar' ? 'text-emerald-500' : ''} />
            <span>رادار الأجهزة</span>
          </button>

          {/* Tab 5: All History */}
          <button
            type="button"
            onClick={() => setActiveTab('history')}
            className={`py-2 px-3 rounded-xl text-xs font-bold transition-all flex items-center justify-center gap-1.5 cursor-pointer shrink-0 ${
              activeTab === 'history'
                ? 'bg-white dark:bg-white/15 text-slate-950 dark:text-white shadow-xs font-black'
                : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
            }`}
          >
            <ListCheck size={14} />
            <span>الأرشيف ({broadcasts.length})</span>
          </button>
        </div>

        {/* ======================================================== */}
        {/* TAB 1: TODAY'S NOTIFICATIONS (إشعارات اليوم)             */}
        {/* ======================================================== */}
        {activeTab === 'today' && (
          <div className="space-y-3 overflow-y-auto pr-1 flex-1">
            <div className="flex items-center justify-between text-xs font-bold text-slate-700 dark:text-slate-300 pb-1">
              <span className="flex items-center gap-1.5">
                <Clock size={14} className="text-amber-500" />
                <span>إشعارات وتوجيهات اليوم (تظل محفوظة هنا حتى بعد الإغلاق):</span>
              </span>
              <span className="text-[11px] font-mono px-2 py-0.5 rounded-full bg-slate-100 dark:bg-white/10">
                اليوم: {todayBroadcasts.length}
              </span>
            </div>

            {todayBroadcasts.length === 0 ? (
              <div className="p-8 rounded-3xl bg-slate-50 dark:bg-white/5 border border-slate-200/80 dark:border-white/10 text-center space-y-2.5">
                <Bell size={28} className="mx-auto text-slate-400 opacity-60" />
                <h4 className="text-sm font-bold text-slate-800 dark:text-slate-200">لا توجد تنبيهات جديدة مسجلة اليوم</h4>
                <p className="text-xs text-slate-500 dark:text-slate-400 max-w-sm mx-auto">
                  جميع الإشعارات والتوجيهات الصادرة اليوم تظهر هنا تلقائياً، وتستمر محفوظة للرجوع إليها حتى بعد تأكيد القراءة أو تحديث الصفحة.
                </p>
                {isAdmin && (
                  <button
                    type="button"
                    onClick={() => setActiveTab('broadcast')}
                    className="mt-2 px-4 py-2 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 font-black text-xs inline-flex items-center gap-1.5 shadow-md cursor-pointer"
                  >
                    <Send size={13} />
                    <span>إرسال أول تنبيه لليوم</span>
                  </button>
                )}
              </div>
            ) : (
              <div className="space-y-3">
                {todayBroadcasts.map((b) => {
                  const isExpired = checkIsExpired(b);
                  const isUserAck = b.acknowledgedBy?.some((a) => a.employeeName === (currentUser?.name || 'طارق'));

                  return (
                    <div
                      key={b.id}
                      className={`p-4 rounded-2xl border transition-all space-y-2.5 ${
                        b.isImportant
                          ? 'bg-amber-50/60 dark:bg-amber-950/20 border-amber-400/50 shadow-sm'
                          : 'bg-white dark:bg-white/5 border-slate-200/90 dark:border-white/10 shadow-xs'
                      }`}
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div className="space-y-1">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span
                              className={`text-[10px] font-black px-2.5 py-0.5 rounded-full border ${
                                b.category === 'urgent'
                                  ? 'bg-rose-500/15 text-rose-700 dark:text-rose-300 border-rose-500/30'
                                  : b.category === 'target'
                                  ? 'bg-amber-500/15 text-amber-800 dark:text-amber-300 border-amber-500/30'
                                  : b.category === 'reward'
                                  ? 'bg-purple-500/15 text-purple-700 dark:text-purple-300 border-purple-500/30'
                                  : 'bg-blue-500/15 text-blue-700 dark:text-blue-300 border-blue-500/30'
                              }`}
                            >
                              {b.category === 'urgent' ? '🚨 عاجل وهام' : b.category === 'target' ? '🎯 تارجت ومبيعات' : b.category === 'reward' ? '🎁 مكافأة وتقدير' : '📋 تعليمات'}
                            </span>

                            {b.isImportant && (
                              <span className="text-[10px] font-black px-2 py-0.5 rounded-full bg-amber-500 text-slate-950 flex items-center gap-1 shadow-2xs">
                                <Star size={10} className="fill-current" />
                                <span>هام ومثبت</span>
                              </span>
                            )}

                            <span className="text-[10px] font-mono text-slate-500 dark:text-slate-400">
                              {b.createdAt ? new Date(b.createdAt).toLocaleTimeString('ar-EG', { hour: '2-digit', minute: '2-digit' }) : 'الآن'}
                            </span>

                            <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
                              isExpired 
                                ? 'bg-slate-100 dark:bg-white/10 text-slate-500' 
                                : 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 border border-emerald-500/20'
                            }`}>
                              {formatRemainingDuration(b)}
                            </span>

                            {/* Recurrence Badge (تكرار التنبيه) */}
                            {formatRecurrenceBadge(b) && (
                              <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-blue-50 dark:bg-blue-950/40 text-[#0071E3] dark:text-blue-300 border border-blue-200 dark:border-blue-700/50 flex items-center gap-1 font-mono">
                                <Repeat size={10} className="text-[#0071E3]" />
                                <span>{formatRecurrenceBadge(b)}</span>
                              </span>
                            )}
                          </div>

                          <h4 className="text-sm font-black text-slate-900 dark:text-white pt-0.5">{b.title}</h4>
                        </div>

                        <button
                          type="button"
                          onClick={() => handleCopyText(`${b.title}\n${b.message}`, b.id)}
                          className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 transition-colors"
                          title="نسخ نص التنبيه"
                        >
                          {copiedId === b.id ? <Check size={14} className="text-emerald-600" /> : <Copy size={14} />}
                        </button>
                      </div>

                      <p className="text-xs text-slate-700 dark:text-slate-300 leading-relaxed bg-slate-50 dark:bg-white/5 p-3 rounded-xl border border-slate-100 dark:border-white/5 font-medium">
                        {b.message}
                      </p>

                      <div className="flex items-center justify-between text-[11px] pt-1 flex-wrap gap-2 text-slate-500 dark:text-slate-400">
                        <span>
                          {b.targetEmployee && b.targetEmployee !== 'all' ? (
                            <span>موجه إلى: <strong className="text-amber-600">{b.targetEmployee}</strong></span>
                          ) : (
                            <span className="text-[10.5px] text-slate-400 font-medium">عام لجميع الكاشيرات</span>
                          )}
                        </span>

                        <div className="flex items-center gap-2">
                          {b.requiresAcknowledgement && (
                            isUserAck ? (
                              <span className="text-[10px] font-bold text-emerald-700 dark:text-emerald-300 bg-emerald-500/15 px-2.5 py-1 rounded-lg border border-emerald-500/30 flex items-center gap-1">
                                <CheckCircle2 size={12} />
                                <span>تم تأكيد قراءتك ✓</span>
                              </span>
                            ) : (
                              onAcknowledgeBroadcast && (
                                <button
                                  type="button"
                                  onClick={() => onAcknowledgeBroadcast(b.id)}
                                  className="text-[10px] font-black text-slate-900 bg-amber-400 hover:bg-amber-300 px-3 py-1 rounded-lg shadow-xs cursor-pointer flex items-center gap-1 transition-transform active:scale-95"
                                >
                                  <CheckCircle2 size={12} />
                                  <span>تأكيد الاطلاع والاستلام</span>
                                </button>
                              )
                            )
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {/* ======================================================== */}
        {/* TAB 2: IMPORTANT & PINNED DIRECTIVES (التنبيهات الهامة)  */}
        {/* ======================================================== */}
        {activeTab === 'important' && (
          <div className="space-y-3.5 overflow-y-auto pr-1 flex-1">
            {/* Header info */}
            <div className="p-3.5 rounded-2xl bg-gradient-to-r from-amber-500/15 via-[#C49746]/10 to-yellow-500/15 border border-[#C49746]/40 flex flex-col sm:flex-row sm:items-center justify-between gap-2.5">
              <div>
                <h3 className="text-xs font-black text-slate-900 dark:text-white flex items-center gap-1.5">
                  <Star size={14} className="text-amber-500 fill-current" />
                  <span>قسم الإشعارات والتنبيهات الهامة والمثبتة للرجوع إليها</span>
                </h3>
                <span className="text-[11px] text-slate-600 dark:text-slate-300 block">
                  تبقى التنبيهات هنا ثابتة ومصنفة بحسب المدة الزمنية المحددة عند الإنشاء
                </span>
              </div>
              <span className="text-xs font-mono font-black px-2.5 py-1 rounded-xl bg-amber-500 text-slate-950 shrink-0">
                {activeImportantCount} تنبيه مثبت
              </span>
            </div>

            {/* Time Category Filter Buttons */}
            <div className="flex items-center gap-1.5 overflow-x-auto scrollbar-none pb-1">
              {[
                { id: 'all', label: 'الكل' },
                { id: 'hours', label: '⏱️ من ساعة وأكثر (1 - 24س)' },
                { id: 'days', label: '📅 يوم وأكثر (1 - 7 أيام)' },
                { id: 'months', label: '🗓️ شهر وأكثر (30 يوم+)' },
                { id: 'permanent', label: '♾️ دائم وثابت' },
              ].map((f) => (
                <button
                  key={f.id}
                  type="button"
                  onClick={() => setImportantFilter(f.id as any)}
                  className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all shrink-0 cursor-pointer ${
                    importantFilter === f.id
                      ? 'bg-[#1D1D1F] dark:bg-amber-400 text-amber-300 dark:text-slate-950 font-black shadow-xs'
                      : 'bg-slate-100 dark:bg-white/5 text-slate-600 dark:text-slate-400 hover:bg-slate-200'
                  }`}
                >
                  {f.label}
                </button>
              ))}
            </div>

            {/* Quick Search inside Important Archive */}
            <div className="relative">
              <Search size={14} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="ابحث في نص التنبيهات الهامة أو العنوان..."
                className="w-full pr-9 pl-3 py-2 rounded-xl text-xs bg-slate-50 dark:bg-white/5 border border-slate-200 dark:border-white/10 text-slate-800 dark:text-white focus:outline-none focus:ring-2 focus:ring-amber-500"
              />
              {searchQuery && (
                <button
                  type="button"
                  onClick={() => setSearchQuery('')}
                  className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 text-xs"
                >
                  مسح
                </button>
              )}
            </div>

            {/* List of Important Broadcasts */}
            {importantBroadcasts.length === 0 ? (
              <div className="p-8 rounded-3xl bg-slate-50 dark:bg-white/5 border border-slate-200/80 dark:border-white/10 text-center space-y-2">
                <Star size={24} className="mx-auto text-slate-400 opacity-50" />
                <p className="text-xs font-bold text-slate-700 dark:text-slate-300">
                  لا توجد تنبيهات تطابق هذا التصنيف الزمني حالياً.
                </p>
                <p className="text-[11px] text-slate-500">
                  عند إنشاء أي تنبيه واختيار «تحديد كتنبيه هام وثابت»، سيظهر ويبقى هنا للرجوع إليه دائماً.
                </p>
              </div>
            ) : (
              <div className="space-y-3">
                {importantBroadcasts.map((b) => (
                  <div
                    key={b.id}
                    className="p-4 rounded-2xl bg-white dark:bg-white/5 border border-amber-400/40 shadow-xs space-y-2.5"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <div className="flex items-center gap-2 flex-wrap mb-1">
                          <span className="text-[10px] font-black px-2.5 py-0.5 rounded-full bg-amber-500 text-slate-950 flex items-center gap-1 shadow-2xs">
                            <Star size={10} className="fill-current" />
                            <span>هام ومثبت</span>
                          </span>

                          <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-slate-100 dark:bg-white/10 text-slate-600 dark:text-slate-300">
                            {formatRemainingDuration(b)}
                          </span>

                          {formatRecurrenceBadge(b) && (
                            <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-blue-50 dark:bg-blue-950/40 text-[#0071E3] dark:text-blue-300 border border-blue-200 dark:border-blue-700/50 flex items-center gap-1 font-mono">
                              <Repeat size={10} className="text-[#0071E3]" />
                              <span>{formatRecurrenceBadge(b)}</span>
                            </span>
                          )}

                          <span className="text-[10px] font-mono text-slate-400">
                            {b.createdAt ? new Date(b.createdAt).toLocaleDateString('ar-EG', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }) : 'سابق'}
                          </span>
                        </div>

                        <h4 className="text-sm font-black text-slate-900 dark:text-white">{b.title}</h4>
                      </div>

                      <button
                        type="button"
                        onClick={() => handleCopyText(`${b.title}\n${b.message}`, b.id)}
                        className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 transition-colors"
                        title="نسخ"
                      >
                        {copiedId === b.id ? <Check size={14} className="text-emerald-600" /> : <Copy size={14} />}
                      </button>
                    </div>

                    <p className="text-xs text-slate-700 dark:text-slate-300 leading-relaxed bg-amber-50/40 dark:bg-white/5 p-3 rounded-xl border border-amber-200/50 dark:border-white/5">
                      {b.message}
                    </p>

                    <div className="flex items-center justify-between text-[11px] pt-1 text-slate-500 dark:text-slate-400 flex-wrap gap-2">
                      <span className="text-[10.5px] text-slate-400">
                        {b.targetEmployee && b.targetEmployee !== 'all' ? `موجه إلى: ${b.targetEmployee}` : 'موجه لكافة الكاشيرات'}
                      </span>
                      {b.acknowledgedBy && b.acknowledgedBy.length > 0 && (
                        <span className="text-[10px] font-bold text-emerald-700 dark:text-emerald-300 bg-emerald-500/10 px-2 py-0.5 rounded-lg">
                          اطلع عليه: {b.acknowledgedBy.map((a) => a.employeeName).join(', ')}
                        </span>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* ======================================================== */}
        {/* TAB 3: BROADCAST COMPOSER (Admin Only Restricted)       */}
        {/* ======================================================== */}
        {activeTab === 'broadcast' && (
          <div className="overflow-y-auto pr-1 flex-1">
            {!isAdmin ? (
              /* Non-Admin Restriction Card */
              <div className="p-8 rounded-3xl bg-slate-50 dark:bg-white/5 border border-amber-400/30 text-center space-y-4 my-4">
                <div className="w-14 h-14 rounded-2xl bg-amber-500/15 text-amber-700 dark:text-amber-400 flex items-center justify-center mx-auto">
                  <Lock size={28} />
                </div>
                <div className="space-y-1.5">
                  <h3 className="text-base font-black text-slate-900 dark:text-white">
                    صلاحية إرسال التنبيهات مخصصة للحسابات المصرح لها
                  </h3>
                  <p className="text-xs text-slate-500 dark:text-slate-400 max-w-md mx-auto leading-relaxed">
                    تم قفل خاصية إرسال الإشعارات للحفاظ على هدوء وانضباط سير العمل. يمكنك استعراض التنبيهات الموجهة إليك وتأكيد استلامها فوراً من تبويب «إشعارات اليوم» أو «التنبيهات الهامة».
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setActiveTab('today')}
                  className="px-5 py-2.5 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 font-black text-xs shadow-md cursor-pointer transition-transform active:scale-95"
                >
                  الانتقال إلى إشعارات اليوم
                </button>
              </div>
            ) : (
              /* Admin Broadcast Composer Form */
              <form onSubmit={handleDispatchBroadcast} className="space-y-4">
                {sendSuccessMessage && (
                  <div className="p-3.5 rounded-2xl bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-400 text-emerald-900 dark:text-emerald-200 text-xs font-bold flex items-center gap-2">
                    <CheckCircle2 size={16} className="text-emerald-600 shrink-0" />
                    <span>{sendSuccessMessage}</span>
                  </div>
                )}

                {/* Broadcast Category Selection */}
                <div className="space-y-1.5">
                  <label className="text-xs font-black text-slate-800 dark:text-slate-200 block">
                    تصنيف التنبيه / الإشعار:
                  </label>
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                    {[
                      { id: 'urgent', label: '🚨 عاجل وهام', color: 'border-rose-500 text-rose-700 dark:text-rose-300 bg-rose-50 dark:bg-rose-950/20' },
                      { id: 'target', label: '🎯 تارجت ومبيعات', color: 'border-amber-500 text-amber-800 dark:text-amber-300 bg-amber-50 dark:bg-amber-950/20' },
                      { id: 'instruction', label: '📋 تعليمات تشغيلية', color: 'border-blue-500 text-blue-700 dark:text-blue-300 bg-blue-50 dark:bg-blue-950/20' },
                      { id: 'reward', label: '🎁 مكافأة وتقدير', color: 'border-purple-500 text-purple-700 dark:text-purple-300 bg-purple-50 dark:bg-purple-950/20' },
                    ].map((cat) => (
                      <button
                        key={cat.id}
                        type="button"
                        onClick={() => setBroadcastCategory(cat.id as any)}
                        className={`p-2.5 rounded-xl text-xs font-bold border transition-all text-center cursor-pointer ${
                          broadcastCategory === cat.id
                            ? `${cat.color} ring-2 ring-amber-400 font-black shadow-xs`
                            : 'border-slate-200 dark:border-white/10 bg-white dark:bg-white/5 text-slate-600 dark:text-slate-300 hover:bg-slate-50'
                        }`}
                      >
                        {cat.label}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Target Recipient Selection */}
                <div className="space-y-1.5">
                  <label className="text-xs font-black text-slate-800 dark:text-slate-200 block">
                    المستهدف بالتنبيه:
                  </label>
                  <select
                    value={targetEmployee}
                    onChange={(e) => setTargetEmployee(e.target.value)}
                    className="w-full p-2.5 rounded-xl border border-slate-300 dark:border-white/15 text-xs font-bold text-slate-800 dark:text-white bg-white dark:bg-[#1D1D1F] focus:outline-none focus:ring-2 focus:ring-amber-500"
                  >
                    <option value="all">📢 جميع الموظفين والفروع والكاشيرات (الكل)</option>
                    <option value="طارق">👤 طارق (كاشير ومسؤول الوردية)</option>
                    <option value="أحمد">👤 أحمد (موظف مبيعات)</option>
                  </select>
                </div>

                {/* Directive Title */}
                <div className="space-y-1.5">
                  <label className="text-xs font-black text-slate-800 dark:text-slate-200 block">
                    عنوان التنبيه:
                  </label>
                  <input
                    type="text"
                    required
                    value={broadcastTitle}
                    onChange={(e) => setBroadcastTitle(e.target.value)}
                    placeholder="مثال: تنبيه بخصوص عطور النيش / تعديل أسعار تركيبات التعتيق"
                    className="w-full p-2.5 rounded-xl border border-slate-300 dark:border-white/15 text-xs font-semibold text-slate-800 dark:text-white bg-white dark:bg-[#1D1D1F] focus:outline-none focus:ring-2 focus:ring-amber-500"
                  />
                </div>

                {/* Directive Message Text */}
                <div className="space-y-1.5">
                  <label className="text-xs font-black text-slate-800 dark:text-slate-200 block">
                    نص التنبيه أو التوجيه:
                  </label>
                  <textarea
                    required
                    rows={3}
                    value={broadcastMessage}
                    onChange={(e) => setBroadcastMessage(e.target.value)}
                    placeholder="اكتب التنبيه بوضوح... سيظهر للموظف في شاشة الكاشير فوراً مع إشعار وتنبيه صوتي."
                    className="w-full p-2.5 rounded-xl border border-slate-300 dark:border-white/15 text-xs text-slate-800 dark:text-white bg-white dark:bg-[#1D1D1F] focus:outline-none focus:ring-2 focus:ring-amber-500 leading-relaxed"
                  />
                </div>

                {/* ======================================================== */}
                {/* ADVANCED SETTINGS PANEL (لوحة الإعدادات المتقدمة)        */}
                {/* ======================================================== */}
                <div className="rounded-2xl border border-amber-400/40 bg-amber-50/30 dark:bg-white/5 p-3.5 space-y-3.5">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-black text-slate-900 dark:text-white flex items-center gap-1.5">
                      <Sliders size={14} className="text-amber-500" />
                      <span>لوحة الإعدادات المتقدمة (مدة الصلاحية والتثبيت الهام)</span>
                    </span>
                    <span className="text-[10px] text-amber-700 dark:text-amber-300 font-bold bg-amber-500/15 px-2 py-0.5 rounded-md">
                      الافتراضي: 8 ساعات
                    </span>
                  </div>

                  {/* 1. Toggle Important / Pinned */}
                  <label className="flex items-start gap-2.5 p-2.5 rounded-xl bg-white dark:bg-white/5 border border-amber-300 dark:border-white/10 cursor-pointer text-xs">
                    <input
                      type="checkbox"
                      checked={isImportant}
                      onChange={(e) => setIsImportant(e.target.checked)}
                      className="mt-0.5 w-4 h-4 rounded text-amber-600 focus:ring-amber-500"
                    />
                    <div>
                      <strong className="text-slate-900 dark:text-white block font-bold flex items-center gap-1">
                        <span>تحديد كتنبيه هام وثابت للرجوع إليه</span>
                        <Star size={12} className="text-amber-500 fill-current" />
                      </strong>
                      <span className="text-[11px] text-slate-500 dark:text-slate-400">
                        سيظهر ويبقى ثابتاً في «قسم الإشعارات والتنبيهات الهامة» للرجوع إليه دائماً.
                      </span>
                    </div>
                  </label>

                  {/* 2. Duration Selector (Default: 8 hours) */}
                  <div className="space-y-2">
                    <div className="flex items-center justify-between text-xs">
                      <span className="font-bold text-slate-800 dark:text-slate-200 flex items-center gap-1">
                        <Hourglass size={13} className="text-amber-500" />
                        <span>مدة انتهاء وإغلاق التنبيه تلقائياً:</span>
                      </span>
                      <span className="text-[11px] font-mono font-bold text-amber-700 dark:text-amber-400">
                        {durationHours === 0 ? 'دائم وثابت' : `${durationHours} ساعة`}
                      </span>
                    </div>

                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-1.5">
                      {DURATION_PRESETS.map((dp) => (
                        <button
                          key={dp.value}
                          type="button"
                          onClick={() => {
                            setDurationHours(dp.value);
                            setIsCustomDuration(false);
                          }}
                          className={`p-2 rounded-xl text-xs font-bold border transition-all text-center cursor-pointer ${
                            !isCustomDuration && durationHours === dp.value
                              ? 'bg-amber-500 text-slate-950 border-amber-500 font-black shadow-xs'
                              : 'bg-white dark:bg-white/5 text-slate-700 dark:text-slate-300 border-slate-200 dark:border-white/10 hover:border-amber-400'
                          }`}
                        >
                          {dp.badge}
                        </button>
                      ))}
                    </div>

                    {/* Custom Hours Toggle */}
                    <div className="pt-1 flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => setIsCustomDuration(!isCustomDuration)}
                        className="text-[11px] text-amber-700 dark:text-amber-400 font-bold hover:underline"
                      >
                        {isCustomDuration ? '← العودة للخيارات السريعة' : '+ تحديد عدد ساعات مخصص'}
                      </button>

                      {isCustomDuration && (
                        <input
                          type="number"
                          min="1"
                          max="8760"
                          value={customHoursInput}
                          onChange={(e) => setCustomHoursInput(e.target.value)}
                          placeholder="عدد الساعات..."
                          className="w-28 p-1.5 rounded-lg border border-slate-300 dark:border-white/20 text-xs font-bold text-slate-800 dark:text-white bg-white dark:bg-black/40 focus:ring-2 focus:ring-amber-500"
                        />
                      )}
                    </div>
                  </div>

                  {/* 3. Recurrence & Scheduling Section (إعادة التنبيه كل يوم أو كل أسبوع مع تحديد اليوم والتاريخ ومدة التكرار) */}
                  <div className="p-3 rounded-2xl bg-slate-50 dark:bg-white/5 border border-slate-200/80 dark:border-white/10 space-y-2.5">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-black text-slate-900 dark:text-white flex items-center gap-1.5">
                        <RotateCcw size={13} className="text-amber-500" />
                        <span>جدولة وإعادة تكرار التنبيه:</span>
                      </span>
                      <span className="text-[10px] font-bold text-amber-600 bg-amber-50 dark:bg-amber-950/40 px-2.5 py-0.5 rounded-full border border-amber-300 dark:border-amber-700/50">
                        {repeatMode === 'none' ? 'مرة واحدة فقط' : repeatMode === 'daily' ? '🔄 يتكرر يومياً' : '📅 يتكرر أسبوعياً'}
                      </span>
                    </div>

                    {/* Recurrence Mode Selector */}
                    <div className="grid grid-cols-3 gap-1.5">
                      {[
                        { id: 'none', label: 'بدون تكرار' },
                        { id: 'daily', label: '🔄 كل يوم (يومي)' },
                        { id: 'weekly', label: '📅 كل أسبوع (أسبوعي)' },
                      ].map((m) => (
                        <button
                          key={m.id}
                          type="button"
                          onClick={() => setRepeatMode(m.id as any)}
                          className={`p-2 rounded-xl text-xs font-bold border transition-all text-center cursor-pointer ${
                            repeatMode === m.id
                              ? 'bg-amber-500 text-slate-950 border-amber-500 font-black shadow-xs'
                              : 'bg-white dark:bg-white/5 text-slate-700 dark:text-slate-300 border-slate-200 dark:border-white/10 hover:border-amber-400'
                          }`}
                        >
                          {m.label}
                        </button>
                      ))}
                    </div>

                    {/* Day of Week Selector when Weekly is selected */}
                    {repeatMode === 'weekly' && (
                      <div className="space-y-1 pt-1 animate-in fade-in duration-150">
                        <label className="text-[11px] font-bold text-slate-700 dark:text-slate-300 block">
                          تحديد يوم التكرار في الأسبوع:
                        </label>
                        <div className="grid grid-cols-4 sm:grid-cols-7 gap-1">
                          {[
                            { day: 6, label: 'السبت' },
                            { day: 0, label: 'الأحد' },
                            { day: 1, label: 'الإثنين' },
                            { day: 2, label: 'الثلاثاء' },
                            { day: 3, label: 'الأربعاء' },
                            { day: 4, label: 'الخميس' },
                            { day: 5, label: 'الجمعة' },
                          ].map((d) => (
                            <button
                              key={d.day}
                              type="button"
                              onClick={() => setRepeatDayOfWeek(d.day)}
                              className={`py-1.5 px-1 rounded-lg text-[11px] font-bold transition-all text-center cursor-pointer ${
                                repeatDayOfWeek === d.day
                                  ? 'bg-slate-900 dark:bg-white text-white dark:text-slate-950 font-black shadow-xs'
                                  : 'bg-white dark:bg-white/5 text-slate-600 dark:text-slate-400 border border-slate-200 dark:border-white/10 hover:border-amber-400'
                              }`}
                            >
                              {d.label}
                            </button>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* Start Date & Time + Duration Controls (when recurring) */}
                    {repeatMode !== 'none' && (
                      <div className="space-y-2 pt-1 animate-in fade-in duration-150 border-t border-slate-200/60 dark:border-white/10">
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs">
                          <div>
                            <label className="text-[11px] font-bold text-slate-700 dark:text-slate-300 block mb-1">
                              تاريخ بدء التكرار:
                            </label>
                            <input
                              type="date"
                              value={repeatStartDate}
                              onChange={(e) => setRepeatStartDate(e.target.value)}
                              className="w-full p-2 rounded-xl border border-slate-300 dark:border-white/20 text-xs font-bold font-mono text-slate-800 dark:text-white bg-white dark:bg-black/40 focus:ring-2 focus:ring-amber-500"
                            />
                          </div>
                          <div>
                            <label className="text-[11px] font-bold text-slate-700 dark:text-slate-300 block mb-1">
                              توقيت إظهار التنبيه:
                            </label>
                            <input
                              type="time"
                              value={repeatTime}
                              onChange={(e) => setRepeatTime(e.target.value)}
                              className="w-full p-2 rounded-xl border border-slate-300 dark:border-white/20 text-xs font-bold font-mono text-slate-800 dark:text-white bg-white dark:bg-black/40 focus:ring-2 focus:ring-amber-500"
                            />
                          </div>
                        </div>

                        <div>
                          <label className="text-[11px] font-bold text-slate-700 dark:text-slate-300 block mb-1">
                            مدة استمرار التكرار:
                          </label>
                          <div className="grid grid-cols-2 sm:grid-cols-5 gap-1 text-[10.5px]">
                            {[
                              { weeks: 1, label: 'أسبوع (7 أيام)' },
                              { weeks: 2, label: 'أسبوعين' },
                              { weeks: 4, label: 'شهر (4 أسابيع)' },
                              { weeks: 12, label: '3 أشهر (موسمي)' },
                              { weeks: 0, label: 'دائم ومستمر' },
                            ].map((w) => (
                              <button
                                key={w.weeks}
                                type="button"
                                onClick={() => setRepeatDurationWeeks(w.weeks)}
                                className={`p-1.5 rounded-lg font-bold border transition-all text-center cursor-pointer ${
                                  repeatDurationWeeks === w.weeks
                                    ? 'bg-amber-500 text-slate-950 border-amber-500 font-black'
                                    : 'bg-white dark:bg-white/5 text-slate-600 dark:text-slate-400 border-slate-200 dark:border-white/10 hover:border-amber-400'
                                }`}
                              >
                                {w.label}
                              </button>
                            ))}
                          </div>
                        </div>
                      </div>
                    )}
                  </div>

                  {/* 3. Sound Effect Selector */}
                  <div className="space-y-1.5">
                    <label className="text-xs font-bold text-slate-800 dark:text-slate-200 block">
                      التأثير الصوتي عند وصول التنبيه:
                    </label>
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-1.5">
                      {[
                        { id: 'chime', label: '🔔 رنين ذهبي' },
                        { id: 'warning', label: '🚨 إنذار عاجل' },
                        { id: 'peaceful', label: '🕊️ تنبيه هادئ' },
                        { id: 'silent', label: '🔇 صامت' },
                      ].map((snd) => (
                        <button
                          key={snd.id}
                          type="button"
                          onClick={() => setSoundType(snd.id as any)}
                          className={`p-2 rounded-xl text-xs font-bold border transition-all text-center cursor-pointer ${
                            soundType === snd.id
                              ? 'bg-slate-900 dark:bg-white text-white dark:text-slate-950 border-slate-900 font-black'
                              : 'bg-white dark:bg-white/5 text-slate-600 dark:text-slate-300 border-slate-200 dark:border-white/10'
                          }`}
                        >
                          {snd.label}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* 4. Acknowledgment Checkbox */}
                  <label className="flex items-center gap-2 p-2.5 rounded-xl bg-white dark:bg-white/5 border border-slate-200 dark:border-white/10 cursor-pointer text-xs">
                    <input
                      type="checkbox"
                      checked={requiresAcknowledgement}
                      onChange={(e) => setRequiresAcknowledgement(e.target.checked)}
                      className="w-4 h-4 rounded text-amber-600 focus:ring-amber-500"
                    />
                    <span className="font-bold text-slate-800 dark:text-slate-200">
                      إلزام الموظف بالضغط على «تأكيد الاطلاع والاستلام» لتوثيق قراءته للتنبيه
                    </span>
                  </label>
                </div>

                {/* Submit Dispatch Button */}
                <button
                  type="submit"
                  disabled={isSending || !broadcastTitle.trim() || !broadcastMessage.trim()}
                  className="w-full py-3.5 px-4 rounded-2xl bg-gradient-to-r from-amber-500 via-[#C49746] to-yellow-400 hover:from-amber-600 hover:to-yellow-500 text-slate-950 font-black text-xs transition-all shadow-lg flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50"
                >
                  <Send size={15} />
                  <span>
                    {isSending
                      ? 'جاري إرسال التنبيه ودفع الإشعارات...'
                      : `إرسال التنبيه الآن (${durationHours === 0 ? 'دائم' : `صلاحية ${durationHours}س`}) 🚀`}
                  </span>
                </button>
              </form>
            )}
          </div>
        )}

        {/* ======================================================== */}
        {/* TAB 4: LIVE RADAR & PRESENCE (رادار الأجهزة)             */}
        {/* ======================================================== */}
        {activeTab === 'radar' && (
          <div className="space-y-4 overflow-y-auto pr-1 flex-1">
            {/* Real-Time Sync Status Card */}
            <div className="p-3.5 rounded-2xl bg-slate-50 dark:bg-white/5 border border-slate-200/90 dark:border-white/10 space-y-2.5">
              <div className="flex items-center justify-between">
                <span className="text-xs font-black text-slate-800 dark:text-slate-200 flex items-center gap-1.5">
                  <Wifi size={14} className={isCloudConnected ? 'text-emerald-600' : 'text-amber-600'} />
                  <span>حالة التزامن السحابي الحي (Multi-Device Engine)</span>
                </span>
                <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
                  isCloudConnected ? 'bg-emerald-500/15 text-emerald-800 dark:text-emerald-300 border border-emerald-500/30' : 'bg-amber-100 text-amber-800'
                }`}>
                  {isCloudConnected ? 'متزامن سحابياً ✓' : 'جاري التحقق...'}
                </span>
              </div>

              <div className="grid grid-cols-2 gap-2 text-xs">
                <div className="p-2 rounded-xl bg-white dark:bg-white/5 border border-slate-200 dark:border-white/10 flex items-center gap-2">
                  <Laptop size={16} className="text-[#0071E3] shrink-0" />
                  <div className="min-w-0">
                    <span className="text-[10px] text-slate-400 block font-bold">اللاب توب والكمبيوتر</span>
                    <strong className="text-[11px] text-slate-900 dark:text-white truncate block">شاشة كاشير وإدارة كاملة</strong>
                  </div>
                </div>

                <div className="p-2 rounded-xl bg-white dark:bg-white/5 border border-slate-200 dark:border-white/10 flex items-center gap-2">
                  <Smartphone size={16} className="text-emerald-600 shrink-0" />
                  <div className="min-w-0">
                    <span className="text-[10px] text-slate-400 block font-bold">الموبايل والآيباد</span>
                    <strong className="text-[11px] text-slate-900 dark:text-white truncate block">كاشير متجول + تنبيهات الإدارة</strong>
                  </div>
                </div>
              </div>
            </div>

            {/* Notification & Sound Controls */}
            <div className="space-y-2.5">
              <h3 className="text-xs font-black text-slate-900 dark:text-white flex items-center gap-1.5">
                <Sparkles size={13} className="text-amber-500" />
                <span>خيارات التنبيه الصوتي ودفع الإشعارات</span>
              </h3>

              {/* Sound Toggle */}
              <div className="p-3 rounded-2xl bg-white dark:bg-white/5 border border-slate-200/90 dark:border-white/10 flex items-center justify-between gap-3 shadow-2xs">
                <div className="flex items-center gap-2.5">
                  <div className={`w-8 h-8 rounded-xl flex items-center justify-center ${
                    soundEnabled ? 'bg-amber-500/10 text-amber-700 dark:text-amber-400' : 'bg-slate-100 text-slate-400'
                  }`}>
                    {soundEnabled ? <Volume2 size={16} /> : <VolumeX size={16} />}
                  </div>
                  <div>
                    <strong className="text-xs text-slate-900 dark:text-white block">صوت الرنين الفاخر (Acoustic Chime)</strong>
                    <span className="text-[10px] text-slate-500 dark:text-slate-400">نغمة كريستالية راقية عند البيع وتنبيهات الإدارة</span>
                  </div>
                </div>

                <button
                  type="button"
                  onClick={handleToggleSound}
                  className={`px-3 py-1.5 rounded-xl text-xs font-black transition-colors cursor-pointer shrink-0 ${
                    soundEnabled 
                      ? 'bg-amber-500 text-slate-950 hover:bg-amber-400' 
                      : 'bg-slate-200 dark:bg-white/10 text-slate-700 dark:text-slate-300'
                  }`}
                >
                  {soundEnabled ? 'مفعّل ✓' : 'معطل'}
                </button>
              </div>

              {/* Push Notification Toggle */}
              <div className="p-3 rounded-2xl bg-white dark:bg-white/5 border border-slate-200/90 dark:border-white/10 flex items-center justify-between gap-3 shadow-2xs">
                <div className="flex items-center gap-2.5">
                  <div className={`w-8 h-8 rounded-xl flex items-center justify-center ${
                    notificationPermission === 'granted' ? 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-400' : 'bg-slate-100 text-slate-400'
                  }`}>
                    <Bell size={16} />
                  </div>
                  <div>
                    <strong className="text-xs text-slate-900 dark:text-white block">إشعارات المتصفح والموبايل (Push Notifications)</strong>
                    <span className="text-[10px] text-slate-500 dark:text-slate-400">
                      {notificationPermission === 'granted'
                        ? 'مفعلة وتصلك على هاتفك وحاسوبك فوراً'
                        : 'انقر لتفعيل وصول الإشعارات إلى هاتفك وجهازك'}
                    </span>
                  </div>
                </div>

                {notificationPermission === 'granted' ? (
                  <span className="text-[11px] font-black text-emerald-700 dark:text-emerald-300 px-2.5 py-1 rounded-xl bg-emerald-50 dark:bg-emerald-950/30 border border-emerald-200 shrink-0">
                    مفعلة ✓
                  </span>
                ) : (
                  <button
                    type="button"
                    onClick={handleRequestPushPermission}
                    className="px-3 py-1.5 rounded-xl bg-[#0071E3] hover:bg-[#0077ED] text-white text-xs font-black transition-colors cursor-pointer shrink-0"
                  >
                    تفعيل الإذن
                  </button>
                )}
              </div>
            </div>

            {/* Test Push Button */}
            <div className="p-3.5 rounded-2xl bg-gradient-to-r from-amber-500/15 via-emerald-500/15 to-blue-500/15 border border-amber-400/40 flex flex-col sm:flex-row sm:items-center justify-between gap-2.5">
              <div className="text-xs text-slate-900 dark:text-white">
                <strong>فحص استقبال الرنين والإشعار على هذا الجهاز:</strong>
                <span className="text-[11px] text-slate-600 dark:text-slate-300 block">تأكد أن حاسوبك أو هاتفك يُطلق الصوت والإشعار بنجاح</span>
              </div>

              <button
                type="button"
                onClick={handleTestAlert}
                disabled={isTesting}
                className="px-4 py-2 rounded-xl bg-[#1D1D1F] dark:bg-white hover:bg-black dark:hover:bg-slate-200 text-amber-300 dark:text-slate-950 font-black text-xs transition-transform active:scale-95 flex items-center justify-center gap-1.5 shadow-md cursor-pointer shrink-0"
              >
                <Play size={13} className="fill-current text-amber-300 dark:text-slate-950" />
                <span>{isTesting ? 'جاري الرنين...' : 'اختبار الرنين والإشعار 🔔'}</span>
              </button>
            </div>

            {/* Recent Live Sales Stream */}
            <div className="space-y-2">
              <div className="flex items-center justify-between text-xs font-bold text-slate-700 dark:text-slate-300">
                <span className="flex items-center gap-1">
                  <Clock size={13} className="text-slate-400" />
                  <span>آخر المبيعات المستلمة لحظياً من الأجهزة:</span>
                </span>
                <span className="text-[10px] text-slate-400 font-mono">اليوم ({recentSales.length})</span>
              </div>

              {recentSales.length === 0 ? (
                <div className="p-3 rounded-xl bg-slate-50 dark:bg-white/5 border border-slate-200 dark:border-white/10 text-center text-xs text-slate-500">
                  بانتظار تسجيل أول عملية بيع اليوم عبر أي جهاز...
                </div>
              ) : (
                <div className="space-y-1.5 max-h-36 overflow-y-auto pr-0.5">
                  {recentSales.slice(0, 4).map((s) => (
                    <div 
                      key={s.id}
                      className="p-2 rounded-xl bg-white dark:bg-white/5 border border-slate-200/70 dark:border-white/10 flex items-center justify-between gap-2 text-xs"
                    >
                      <div className="flex items-center gap-2 min-w-0">
                        <span className="w-2 h-2 rounded-full bg-emerald-500 shrink-0" />
                        <strong className="text-slate-900 dark:text-white truncate">
                          {s.totalPrice ?? (s as any).total ?? 0} {currency}
                        </strong>
                        <span className="text-[10px] text-slate-500 dark:text-slate-400 truncate">
                          · {s.employeeName || (s as any).cashierName || 'المتجر'} ({s.customerName || 'نقدي'})
                        </span>
                      </div>
                      <span className="text-[10px] font-mono text-slate-400 shrink-0">
                        {(s as any).time || s.date?.slice(11, 16) || 'الآن'}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}

        {/* ======================================================== */}
        {/* TAB 5: GENERAL ARCHIVE (سجل كل التنبيهات)                */}
        {/* ======================================================== */}
        {activeTab === 'history' && (
          <div className="space-y-3 overflow-y-auto pr-1 flex-1">
            <div className="flex items-center justify-between text-xs font-bold text-slate-700 dark:text-slate-300">
              <span>أرشيف التنبيهات والتوجيهات السابقة:</span>
              <span className="text-[10px] text-slate-500 font-mono">إجمالي: {broadcasts.length}</span>
            </div>

            {broadcasts.length === 0 ? (
              <div className="p-8 rounded-2xl bg-slate-50 dark:bg-white/5 border border-slate-200 text-center text-xs text-slate-500 space-y-2">
                <MessageSquare size={24} className="mx-auto text-slate-400 opacity-60" />
                <p>لم يتم تسجيل أي تنبيهات سابقة.</p>
              </div>
            ) : (
              <div className="space-y-2.5">
                {broadcasts.map((b) => (
                  <div
                    key={b.id}
                    className="p-3.5 rounded-2xl bg-white dark:bg-white/5 border border-slate-200/90 dark:border-white/10 shadow-2xs space-y-2 text-xs"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <div className="flex items-center gap-2 flex-wrap mb-1">
                          <span
                            className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${
                              b.category === 'urgent'
                                ? 'bg-rose-50 text-rose-700 border-rose-300'
                                : b.category === 'target'
                                ? 'bg-amber-50 text-amber-800 border-amber-300'
                                : b.category === 'reward'
                                ? 'bg-purple-50 text-purple-700 border-purple-300'
                                : 'bg-blue-50 text-blue-700 border-blue-300'
                            }`}
                          >
                            {b.category === 'urgent' ? '🚨 عاجل وهام' : b.category === 'target' ? '🎯 تارجت' : b.category === 'reward' ? '🎁 مكافأة' : '📋 تعليمات'}
                          </span>
                          {b.isImportant && (
                            <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-amber-500 text-slate-950 flex items-center gap-1">
                              <Star size={9} className="fill-current" />
                              <span>هام</span>
                            </span>
                          )}
                          <span className="text-[10px] text-slate-400 font-mono">
                            {formatRemainingDuration(b)}
                          </span>
                        </div>
                        <strong className="text-sm font-bold text-slate-900 dark:text-white block">{b.title}</strong>
                      </div>
                      <span className="text-[10px] font-mono text-slate-400 shrink-0">
                        {b.createdAt ? new Date(b.createdAt).toLocaleDateString('ar-EG', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }) : 'سابق'}
                      </span>
                    </div>

                    <p className="text-slate-700 dark:text-slate-300 text-xs leading-relaxed bg-slate-50 dark:bg-white/5 p-2.5 rounded-xl border border-slate-100 dark:border-white/5">
                      {b.message}
                    </p>

                    <div className="flex items-center justify-between text-[11px] pt-1 text-slate-500 dark:text-slate-400 flex-wrap gap-2">
                      <span className="text-[10.5px] text-slate-400 font-mono">
                        {b.durationHours === 0 ? 'صلاحية دائمة' : `صلاحية: ${b.durationHours || 8}س`}
                      </span>
                      {b.acknowledgedBy && b.acknowledgedBy.length > 0 ? (
                        <span className="text-emerald-700 dark:text-emerald-300 font-bold inline-flex items-center gap-1 bg-emerald-50 dark:bg-emerald-950/20 px-2 py-0.5 rounded-lg">
                          <UserCheck size={12} />
                          <span>تم الاطلاع بواسطة: {b.acknowledgedBy.map((a) => a.employeeName).join(', ')}</span>
                        </span>
                      ) : (
                        <span className="text-slate-400">بانتظار الاطلاع</span>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Footer */}
        <div className="pt-2 border-t border-slate-200/80 dark:border-white/10 flex items-center justify-between text-[11px] text-slate-500 dark:text-slate-400 shrink-0">
          <span className="flex items-center gap-1">
            <ShieldCheck size={13} className="text-emerald-600" />
            <span>نظام التنبيهات والتزامن السحابي الآمن · لمسة عطر</span>
          </span>
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-1.5 rounded-xl bg-slate-100 hover:bg-slate-200 dark:bg-white/10 dark:hover:bg-white/20 text-slate-800 dark:text-white font-bold text-xs transition-colors cursor-pointer"
          >
            إغلاق
          </button>
        </div>
      </div>
    </div>
  );
};

export default OwnerLiveAlertsRadarModal;
