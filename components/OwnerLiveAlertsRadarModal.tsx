import React, { useState, useEffect } from 'react';
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
  Radio
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
  const [activeTab, setActiveTab] = useState<'radar' | 'broadcast' | 'history'>('radar');
  const [soundEnabled, setSoundEnabled] = useState<boolean>(soundAlertService.isEnabled());
  const [notificationPermission, setNotificationPermission] = useState<NotificationPermission>(
    browserNotificationService.getPermission()
  );
  const [isTesting, setIsTesting] = useState(false);

  // Broadcast Composer State
  const [broadcastTitle, setBroadcastTitle] = useState('');
  const [broadcastMessage, setBroadcastMessage] = useState('');
  const [broadcastCategory, setBroadcastCategory] = useState<'urgent' | 'target' | 'instruction' | 'reward'>('urgent');
  const [targetEmployee, setTargetEmployee] = useState('all');
  const [requiresAcknowledgement, setRequiresAcknowledgement] = useState(true);
  const [isSending, setIsSending] = useState(false);
  const [sendSuccessMessage, setSendSuccessMessage] = useState<string | null>(null);

  useEffect(() => {
    setSoundEnabled(soundAlertService.isEnabled());
    setNotificationPermission(browserNotificationService.getPermission());
  }, [isOpen]);

  if (!isOpen) return null;

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
        body: 'ستصلك الآن تنبيهات حية فورية عند أي عملية بيع أو توجيه للموظفين من أي جهاز.',
        tag: 'test-perm',
      });
      soundAlertService.playSaleChime();
    }
  };

  const handleTestAlert = () => {
    setIsTesting(true);
    soundAlertService.playSaleChime();
    browserNotificationService.sendNotification({
      title: `🛒 تجربة بيع ناجحة: 450 ${currency}`,
      body: 'الكاشير: طارق · العميل: عميل مميز · 2 عبوة (مزامنة حية من هاتف ذكي)',
      tag: `test-sale-${Date.now()}`,
    });
    if (onTriggerTestAlert) {
      onTriggerTestAlert();
    }
    setTimeout(() => setIsTesting(false), 1200);
  };

  const handleDispatchBroadcast = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!broadcastTitle.trim() || !broadcastMessage.trim()) return;

    setIsSending(true);
    try {
      const newBroadcast: OwnerStaffBroadcast = {
        id: `ob-${Date.now()}`,
        title: broadcastTitle.trim(),
        message: broadcastMessage.trim(),
        category: broadcastCategory,
        senderName: currentUser?.name || 'د. محمد (المالك)',
        targetEmployee,
        createdAt: new Date().toISOString(),
        requiresAcknowledgement,
        acknowledgedBy: [],
      };

      if (onSendBroadcast) {
        await onSendBroadcast(newBroadcast);
      }

      // Also dispatch native mobile/browser push notification
      await browserNotificationService.sendNotification({
        title: `📢 ${newBroadcast.title}`,
        body: newBroadcast.message,
        soundType: newBroadcast.category === 'urgent' ? 'warning' : 'notification',
        requireInteraction: newBroadcast.category === 'urgent',
        vibrate: [250, 100, 250, 100, 250],
      });

      soundAlertService.playAlertChime();
      setSendSuccessMessage('تم إرسال التوجيه ودفع الإشعار للموظفين بنجاح!');
      setBroadcastTitle('');
      setBroadcastMessage('');
      setTimeout(() => {
        setSendSuccessMessage(null);
        setActiveTab('history');
      }, 1500);
    } catch (err) {
      console.error('Failed to dispatch broadcast:', err);
    } finally {
      setIsSending(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-black/60 backdrop-blur-md animate-in fade-in duration-200">
      <div 
        dir="rtl"
        className="relative w-full max-w-xl rounded-3xl bg-white border border-[#C49746]/40 shadow-2xl p-5 sm:p-6 space-y-4 apple-glass overflow-hidden max-h-[92vh] flex flex-col"
      >
        {/* Top Header */}
        <div className="flex items-center justify-between pb-3 border-b border-slate-200/80 shrink-0">
          <div className="flex items-center gap-2.5">
            <div className="w-10 h-10 rounded-2xl bg-gradient-to-tr from-amber-500 to-yellow-400 text-slate-950 flex items-center justify-center shadow-md shadow-amber-500/25">
              <Radio size={20} className="animate-pulse" />
            </div>
            <div>
              <h2 className="text-base sm:text-lg font-black text-slate-900 flex items-center gap-2">
                <span>رادار التنبيهات والتزامن الفوري</span>
                <span className="text-[10px] px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-800 border border-emerald-300 font-mono">
                  LIVE 24/7
                </span>
              </h2>
              <p className="text-xs text-slate-500">
                إشعارات الموبايل الحية والتواصل الذكي الفوري مع فريق العمل
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="w-8 h-8 rounded-full bg-slate-100 hover:bg-slate-200 text-slate-600 flex items-center justify-center transition-colors cursor-pointer"
          >
            <X size={16} />
          </button>
        </div>

        {/* Navigation Tabs */}
        <div className="flex items-center gap-1.5 p-1 rounded-2xl bg-slate-100 border border-slate-200/80 shrink-0">
          <button
            type="button"
            onClick={() => setActiveTab('radar')}
            className={`flex-1 py-2 px-3 rounded-xl text-xs font-bold transition-all flex items-center justify-center gap-1.5 cursor-pointer ${
              activeTab === 'radar'
                ? 'bg-white text-slate-900 shadow-xs'
                : 'text-slate-500 hover:text-slate-900'
            }`}
          >
            <Bell size={14} className={activeTab === 'radar' ? 'text-amber-500' : ''} />
            <span>رادار الأجهزة والإشعارات</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('broadcast')}
            className={`flex-1 py-2 px-3 rounded-xl text-xs font-bold transition-all flex items-center justify-center gap-1.5 cursor-pointer ${
              activeTab === 'broadcast'
                ? 'bg-amber-500 text-slate-950 shadow-xs'
                : 'text-slate-500 hover:text-slate-900'
            }`}
          >
            <Send size={14} />
            <span>إرسال توجيه للموظفين 📢</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('history')}
            className={`flex-1 py-2 px-3 rounded-xl text-xs font-bold transition-all flex items-center justify-center gap-1.5 cursor-pointer ${
              activeTab === 'history'
                ? 'bg-white text-slate-900 shadow-xs'
                : 'text-slate-500 hover:text-slate-900'
            }`}
          >
            <ListCheck size={14} />
            <span>سجل التوجيهات ({broadcasts.length})</span>
          </button>
        </div>

        {/* Tab 1: Radar & Device Notifications */}
        {activeTab === 'radar' && (
          <div className="space-y-4 overflow-y-auto pr-1 flex-1">
            {/* Real-Time Sync Status Card */}
            <div className="p-3.5 rounded-2xl bg-slate-50 border border-slate-200/90 space-y-2.5">
              <div className="flex items-center justify-between">
                <span className="text-xs font-black text-slate-800 flex items-center gap-1.5">
                  <Wifi size={14} className={isCloudConnected ? 'text-emerald-600' : 'text-amber-600'} />
                  <span>حالة التزامن السحابي الحي (Multi-Device Engine)</span>
                </span>
                <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
                  isCloudConnected ? 'bg-emerald-100 text-emerald-800 border border-emerald-200' : 'bg-amber-100 text-amber-800'
                }`}>
                  {isCloudConnected ? 'متزامن سحابياً ✓' : 'جاري التحقق...'}
                </span>
              </div>

              <div className="grid grid-cols-2 gap-2 text-xs">
                <div className="p-2 rounded-xl bg-white border border-slate-200 flex items-center gap-2">
                  <Laptop size={16} className="text-[#0071E3] shrink-0" />
                  <div className="min-w-0">
                    <span className="text-[10px] text-slate-400 block font-bold">اللاب توب والكمبيوتر</span>
                    <strong className="text-[11px] text-slate-900 truncate block">شاشة كاشير وإدارة كاملة</strong>
                  </div>
                </div>

                <div className="p-2 rounded-xl bg-white border border-slate-200 flex items-center gap-2">
                  <Smartphone size={16} className="text-emerald-600 shrink-0" />
                  <div className="min-w-0">
                    <span className="text-[10px] text-slate-400 block font-bold">الموبايل والآيباد</span>
                    <strong className="text-[11px] text-slate-900 truncate block">كاشير متجول + تنبيهات المالك</strong>
                  </div>
                </div>
              </div>
            </div>

            {/* Notification & Sound Controls */}
            <div className="space-y-2.5">
              <h3 className="text-xs font-black text-slate-900 flex items-center gap-1.5">
                <Sparkles size={13} className="text-amber-600" />
                <span>خيارات التنبيه الصوتي ودفع الإشعارات</span>
              </h3>

              {/* Sound Toggle */}
              <div className="p-3 rounded-2xl bg-white border border-slate-200/90 flex items-center justify-between gap-3 shadow-2xs">
                <div className="flex items-center gap-2.5">
                  <div className={`w-8 h-8 rounded-xl flex items-center justify-center ${
                    soundEnabled ? 'bg-amber-500/10 text-amber-700' : 'bg-slate-100 text-slate-400'
                  }`}>
                    {soundEnabled ? <Volume2 size={16} /> : <VolumeX size={16} />}
                  </div>
                  <div>
                    <strong className="text-xs text-slate-900 block">صوت الرنين الفاخر (Acoustic Chime)</strong>
                    <span className="text-[10px] text-slate-500">نغمة كريستالية راقية عند البيع وتنبيهات الخطر</span>
                  </div>
                </div>

                <button
                  type="button"
                  onClick={handleToggleSound}
                  className={`px-3 py-1.5 rounded-xl text-xs font-black transition-colors cursor-pointer shrink-0 ${
                    soundEnabled 
                      ? 'bg-amber-500 text-slate-950 hover:bg-amber-400' 
                      : 'bg-slate-200 text-slate-700 hover:bg-slate-300'
                  }`}
                >
                  {soundEnabled ? 'مفعّل ✓' : 'معطل'}
                </button>
              </div>

              {/* Push Notification Toggle */}
              <div className="p-3 rounded-2xl bg-white border border-slate-200/90 flex items-center justify-between gap-3 shadow-2xs">
                <div className="flex items-center gap-2.5">
                  <div className={`w-8 h-8 rounded-xl flex items-center justify-center ${
                    notificationPermission === 'granted' ? 'bg-emerald-500/10 text-emerald-700' : 'bg-slate-100 text-slate-400'
                  }`}>
                    <Bell size={16} />
                  </div>
                  <div>
                    <strong className="text-xs text-slate-900 block">إشعارات المتصفح والموبايل (Push Notifications)</strong>
                    <span className="text-[10px] text-slate-500">
                      {notificationPermission === 'granted'
                        ? 'مفعلة وتصلك على هاتفك وحاسوبك فوراً'
                        : 'انقر لتفعيل وصول الإشعارات إلى هاتفك وجهازك'}
                    </span>
                  </div>
                </div>

                {notificationPermission === 'granted' ? (
                  <span className="text-[11px] font-black text-emerald-700 px-2.5 py-1 rounded-xl bg-emerald-50 border border-emerald-200 shrink-0">
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
              <div className="text-xs text-slate-900">
                <strong>فحص استقبال الرنين والإشعار على هذا الجهاز:</strong>
                <span className="text-[11px] text-slate-700 block">تأكد أن حاسوبك أو هاتفك يُطلق الصوت والإشعار بنجاح</span>
              </div>

              <button
                type="button"
                onClick={handleTestAlert}
                disabled={isTesting}
                className="px-4 py-2 rounded-xl bg-[#1D1D1F] hover:bg-black text-amber-300 font-black text-xs transition-transform active:scale-95 flex items-center justify-center gap-1.5 shadow-md cursor-pointer shrink-0"
              >
                <Play size={13} className="fill-current text-amber-300" />
                <span>{isTesting ? 'جاري الرنين...' : 'اختبار الرنين والإشعار 🔔'}</span>
              </button>
            </div>

            {/* Recent Live Sales Stream */}
            <div className="space-y-2">
              <div className="flex items-center justify-between text-xs font-bold text-slate-700">
                <span className="flex items-center gap-1">
                  <Clock size={13} className="text-slate-400" />
                  <span>آخر المبيعات المستلمة لحظياً من الأجهزة:</span>
                </span>
                <span className="text-[10px] text-slate-400 font-mono">اليوم ({recentSales.length})</span>
              </div>

              {recentSales.length === 0 ? (
                <div className="p-3 rounded-xl bg-slate-50 border border-slate-200 text-center text-xs text-slate-500">
                  بانتظار تسجيل أول عملية بيع اليوم عبر أي جهاز...
                </div>
              ) : (
                <div className="space-y-1.5 max-h-36 overflow-y-auto pr-0.5">
                  {recentSales.slice(0, 4).map((s) => (
                    <div 
                      key={s.id}
                      className="p-2 rounded-xl bg-white border border-slate-200/70 flex items-center justify-between gap-2 text-xs"
                    >
                      <div className="flex items-center gap-2 min-w-0">
                        <span className="w-2 h-2 rounded-full bg-emerald-500 shrink-0" />
                        <strong className="text-slate-900 truncate">
                          {s.totalPrice ?? (s as any).total ?? 0} {currency}
                        </strong>
                        <span className="text-[10px] text-slate-500 truncate">
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

        {/* Tab 2: Owner Direct Broadcast Composer */}
        {activeTab === 'broadcast' && (
          <form onSubmit={handleDispatchBroadcast} className="space-y-3.5 overflow-y-auto pr-1 flex-1">
            {sendSuccessMessage && (
              <div className="p-3 rounded-2xl bg-emerald-50 border border-emerald-300 text-emerald-900 text-xs font-bold flex items-center gap-2">
                <CheckCircle2 size={16} className="text-emerald-600 shrink-0" />
                <span>{sendSuccessMessage}</span>
              </div>
            )}

            {/* Broadcast Category Selection */}
            <div className="space-y-1.5">
              <label className="text-xs font-black text-slate-800 block">
                تصنيف التوجيه / التنبيه:
              </label>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                {[
                  { id: 'urgent', label: '🚨 عاجل وهام', color: 'border-rose-500 text-rose-700 bg-rose-50' },
                  { id: 'target', label: '🎯 تارجت ومبيعات', color: 'border-amber-500 text-amber-800 bg-amber-50' },
                  { id: 'instruction', label: '📋 تعليمات تشغيلية', color: 'border-blue-500 text-blue-700 bg-blue-50' },
                  { id: 'reward', label: '🎁 مكافأة وتقدير', color: 'border-purple-500 text-purple-700 bg-purple-50' },
                ].map((cat) => (
                  <button
                    key={cat.id}
                    type="button"
                    onClick={() => setBroadcastCategory(cat.id as any)}
                    className={`p-2 rounded-xl text-xs font-bold border transition-all text-center cursor-pointer ${
                      broadcastCategory === cat.id
                        ? `${cat.color} ring-2 ring-amber-400 font-black shadow-xs`
                        : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50'
                    }`}
                  >
                    {cat.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Target Employee */}
            <div className="space-y-1.5">
              <label className="text-xs font-black text-slate-800 block">
                الموظف المستهدف بالتوجيه:
              </label>
              <select
                value={targetEmployee}
                onChange={(e) => setTargetEmployee(e.target.value)}
                className="w-full p-2.5 rounded-xl border border-slate-300 text-xs font-bold text-slate-800 bg-white focus:outline-none focus:ring-2 focus:ring-amber-500"
              >
                <option value="all">📢 جميع موظفي الوردية (الكل)</option>
                <option value="طارق">👤 طارق (كاشير ومسؤول الوردية)</option>
                <option value="أحمد">👤 أحمد (موظف)</option>
              </select>
            </div>

            {/* Directive Title */}
            <div className="space-y-1.5">
              <label className="text-xs font-black text-slate-800 block">
                عنوان التنبيه أو التوجيه:
              </label>
              <input
                type="text"
                required
                value={broadcastTitle}
                onChange={(e) => setBroadcastTitle(e.target.value)}
                placeholder="مثال: التركيز على عطور النيش اليوم / تنبيه بشأن العبوات الملونة"
                className="w-full p-2.5 rounded-xl border border-slate-300 text-xs font-semibold text-slate-800 focus:outline-none focus:ring-2 focus:ring-amber-500"
              />
            </div>

            {/* Directive Message Text */}
            <div className="space-y-1.5">
              <label className="text-xs font-black text-slate-800 block">
                نص التوجيه الموجه لشاشة الموظف:
              </label>
              <textarea
                required
                rows={3}
                value={broadcastMessage}
                onChange={(e) => setBroadcastMessage(e.target.value)}
                placeholder="اكتب التوجيه بوضوح... سيظهر للموظف في شاشة الكاشير فوراً مع إشعار وتنبيه صوتي."
                className="w-full p-2.5 rounded-xl border border-slate-300 text-xs text-slate-800 focus:outline-none focus:ring-2 focus:ring-amber-500 leading-relaxed"
              />
            </div>

            {/* Acknowledgement Checkbox */}
            <label className="flex items-center gap-2 p-3 rounded-xl bg-amber-50/70 border border-amber-200 cursor-pointer text-xs">
              <input
                type="checkbox"
                checked={requiresAcknowledgement}
                onChange={(e) => setRequiresAcknowledgement(e.target.checked)}
                className="w-4 h-4 rounded text-amber-600 focus:ring-amber-500"
              />
              <span className="font-bold text-amber-950">
                إلزام الموظف بالضغط على «تأكيد الاطلاع والاستلام» (Acknowledge) لتوثيق قراءته للتوجيه
              </span>
            </label>

            {/* Send Button */}
            <button
              type="submit"
              disabled={isSending || !broadcastTitle.trim() || !broadcastMessage.trim()}
              className="w-full py-3 px-4 rounded-2xl bg-gradient-to-r from-amber-500 to-yellow-500 hover:from-amber-600 hover:to-yellow-600 text-slate-950 font-black text-xs transition-all shadow-md flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50"
            >
              <Send size={15} />
              <span>{isSending ? 'جاري الإرسال والدفع...' : 'إرسال التوجيه ودفع الإشعار للموظفين الآن 🚀'}</span>
            </button>
          </form>
        )}

        {/* Tab 3: Broadcast History & Acknowledgements */}
        {activeTab === 'history' && (
          <div className="space-y-3 overflow-y-auto pr-1 flex-1">
            <div className="flex items-center justify-between text-xs font-bold text-slate-700">
              <span>التوجيهات والتنبيهات الصادرة للموظفين:</span>
              <span className="text-[10px] text-slate-500">إجمالي: {broadcasts.length}</span>
            </div>

            {broadcasts.length === 0 ? (
              <div className="p-8 rounded-2xl bg-slate-50 border border-slate-200 text-center text-xs text-slate-500 space-y-2">
                <MessageSquare size={24} className="mx-auto text-slate-400 opacity-60" />
                <p>لم يتم إرسال أي توجيهات للموظفين بعد.</p>
                <button
                  type="button"
                  onClick={() => setActiveTab('broadcast')}
                  className="px-3 py-1.5 rounded-xl bg-amber-500 text-slate-950 font-bold text-xs"
                >
                  إرسال أول توجيه الآن
                </button>
              </div>
            ) : (
              <div className="space-y-2.5">
                {broadcasts.map((b) => {
                  const ackCount = b.acknowledgedBy?.length || 0;
                  return (
                    <div
                      key={b.id}
                      className="p-3.5 rounded-2xl bg-white border border-slate-200/90 shadow-2xs space-y-2 text-xs"
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
                              {b.category === 'urgent'
                                ? '🚨 عاجل وهام'
                                : b.category === 'target'
                                ? '🎯 تارجت ومبيعات'
                                : b.category === 'reward'
                                ? '🎁 مكافأة وتقدير'
                                : '📋 تعليمات'}
                            </span>
                            <span className="text-[10px] text-slate-400">
                              موجه إلى: {b.targetEmployee === 'all' ? 'جميع الموظفين' : b.targetEmployee}
                            </span>
                          </div>
                          <strong className="text-sm font-bold text-slate-900 block">{b.title}</strong>
                        </div>
                        <span className="text-[10px] font-mono text-slate-400 shrink-0">
                          {b.createdAt ? new Date(b.createdAt).toLocaleTimeString('ar-EG', { hour: '2-digit', minute: '2-digit' }) : 'الآن'}
                        </span>
                      </div>

                      <p className="text-slate-700 text-xs leading-relaxed bg-slate-50 p-2.5 rounded-xl border border-slate-100">
                        {b.message}
                      </p>

                      {/* Acknowledgements Status */}
                      <div className="flex items-center justify-between text-[11px] pt-1 border-t border-slate-100 flex-wrap gap-2">
                        <span className="text-slate-500">
                          المرسل: <strong>{b.senderName}</strong>
                        </span>

                        {b.requiresAcknowledgement ? (
                          ackCount > 0 ? (
                            <span className="text-emerald-700 font-bold inline-flex items-center gap-1 bg-emerald-50 px-2 py-0.5 rounded-lg border border-emerald-200">
                              <UserCheck size={12} />
                              <span>تم الاطلاع والتأكيد بواسطة: {b.acknowledgedBy?.map(a => a.employeeName).join(', ')}</span>
                            </span>
                          ) : (
                            <span className="text-amber-700 font-bold inline-flex items-center gap-1 bg-amber-50 px-2 py-0.5 rounded-lg border border-amber-200">
                              <Clock size={12} />
                              <span>بانتظار تأكيد قراءة الموظف...</span>
                            </span>
                          )
                        ) : (
                          <span className="text-slate-400">للعلم والإحاطة</span>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {/* Footer */}
        <div className="pt-2 border-t border-slate-200 flex items-center justify-between text-[11px] text-slate-500 shrink-0">
          <span className="flex items-center gap-1">
            <ShieldCheck size={13} className="text-emerald-600" />
            <span>نظام لمسة عطر السحابي الآمن</span>
          </span>
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-1.5 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-800 font-bold text-xs transition-colors cursor-pointer"
          >
            إغلاق
          </button>
        </div>
      </div>
    </div>
  );
};

export default OwnerLiveAlertsRadarModal;
