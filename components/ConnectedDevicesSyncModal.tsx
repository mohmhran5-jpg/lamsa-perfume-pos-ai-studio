import React, { useEffect, useState } from 'react';
import {
  X,
  Smartphone,
  Laptop,
  Tablet,
  Wifi,
  Sparkles,
  CheckCircle2,
  RefreshCw,
  Clock3,
  ShieldCheck,
  Zap,
  Radio,
  MonitorCheck,
  Activity,
  Layers,
} from 'lucide-react';
import { ConnectedDeviceRecord, APP_SYSTEM_VERSION, APP_BUILD_DATE } from '../types';
import { getLocalDeviceId } from '../services/firebase';
import { soundAlertService } from '../services/soundAlertService';

type DeviceFeedStatus = 'connecting' | 'live' | 'cached' | 'error';

interface ConnectedDevicesSyncModalProps {
  isOpen: boolean;
  onClose: () => void;
  devices: ConnectedDeviceRecord[];
  deviceFeedStatus?: DeviceFeedStatus;
  deviceFeedLastServerUpdate?: number | null;
  isOwner?: boolean;
  onTriggerInstantSync?: () => Promise<number | void> | number | void;
}

export const ConnectedDevicesSyncModal: React.FC<ConnectedDevicesSyncModalProps> = ({
  isOpen,
  onClose,
  devices = [],
  deviceFeedStatus = 'connecting',
  deviceFeedLastServerUpdate = null,
  isOwner = true,
  onTriggerInstantSync,
}) => {
  const [isSyncing, setIsSyncing] = useState(false);
  const [lastSyncResult, setLastSyncResult] = useState<{ latencyMs: number; time: string } | null>(null);
  const [syncError, setSyncError] = useState('');
  const [now, setNow] = useState(Date.now());

  useEffect(() => {
    if (!isOpen) return;
    const timer = window.setInterval(() => setNow(Date.now()), 5000);
    return () => window.clearInterval(timer);
  }, [isOpen]);

  if (!isOpen) return null;

  const currentDeviceId = getLocalDeviceId();

  const handleInstantTurboSync = async () => {
    if (!isOwner || !onTriggerInstantSync) return;
    setIsSyncing(true);
    setSyncError('');
    soundAlertService.playActionChime();
    try {
      const latency = await onTriggerInstantSync();
      if (typeof latency !== 'number' || !Number.isFinite(latency)) throw new Error('heartbeat-not-confirmed');
      setLastSyncResult({
        latencyMs: latency,
        time: new Date().toLocaleTimeString('ar-EG', { hour: '2-digit', minute: '2-digit', second: '2-digit' }),
      });
      soundAlertService.playSaleChime();
    } catch {
      setSyncError('لم يتأكد إرسال نبضة الجهاز إلى Firestore؛ لم تُسجّل العملية كنجاح.');
    } finally {
      setIsSyncing(false);
    }
  };

  const getDeviceIcon = (type: string) => {
    switch (type) {
      case 'mobile':
        return <Smartphone size={18} className="text-[#0071E3]" />;
      case 'tablet':
        return <Tablet size={18} className="text-amber-500" />;
      default:
        return <Laptop size={18} className="text-emerald-600" />;
    }
  };

  const formatLastSeen = (lastSeenMs: number) => {
    if (!Number.isFinite(lastSeenMs) || lastSeenMs <= 0) return 'وقت النبضة غير متاح';
    const diffSec = Math.max(0, Math.floor((now - lastSeenMs) / 1000));
    if (diffSec < 5) return 'منذ ثوانٍ قليلة';
    if (diffSec < 60) return `منذ ${diffSec} ثانية`;
    const diffMin = Math.floor(diffSec / 60);
    return `منذ ${diffMin} دقيقة`;
  };

  const feedLabel = {
    connecting: 'جارٍ التحقق من مستمع الحضور…',
    live: 'لقطة الأجهزة مؤكدة من Firestore الآن.',
    cached: 'المعروض من ذاكرة الجهاز المحلية؛ لم يصل تأكيد حديث من الخادم.',
    error: 'تعذر تشغيل مستمع الأجهزة؛ لا يمكن اعتبار القائمة الحالية مكتملة.',
  }[deviceFeedStatus];
  const feedTone = deviceFeedStatus === 'live'
    ? 'bg-emerald-500/10 text-emerald-800 dark:text-emerald-300 border-emerald-500/25'
    : deviceFeedStatus === 'error'
      ? 'bg-rose-500/10 text-rose-800 dark:text-rose-300 border-rose-500/25'
      : 'bg-amber-500/10 text-amber-800 dark:text-amber-300 border-amber-500/25';

  return (
    <div
      className="fixed inset-0 z-[160] bg-black/50 backdrop-blur-md flex items-center justify-center p-3 sm:p-4 animate-in fade-in duration-200"
      onClick={onClose}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="apple-glass rounded-[28px] w-full max-w-2xl border border-black/[0.12] dark:border-white/[0.15] shadow-2xl bg-white/95 dark:bg-[#121622]/95 overflow-hidden flex flex-col max-h-[90vh] relative text-[#0F172A] dark:text-slate-100"
      >
        {/* Ambient Top Glow */}
        <div className="absolute top-0 right-1/4 w-80 h-32 bg-gradient-to-br from-emerald-500/15 via-[#0071E3]/15 to-transparent blur-3xl pointer-events-none" />

        {/* Modal Header */}
        <div className="p-4 sm:p-5 border-b border-black/[0.06] dark:border-white/[0.08] flex items-center justify-between gap-3 relative z-10">
          <div className="flex items-center gap-3">
            <div className="w-11 h-11 rounded-2xl bg-emerald-500/15 text-emerald-700 dark:text-emerald-400 border border-emerald-500/30 flex items-center justify-center shadow-xs">
              <Radio size={22} className={deviceFeedStatus === 'live' ? 'animate-pulse' : ''} />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-base sm:text-lg font-black tracking-tight text-[#0F172A] dark:text-white">
                  رادار الأجهزة المتصلة والتزامن اللحظي
                </h3>
                <span className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-bold ${feedTone}`}>
                  <span className={`h-1.5 w-1.5 rounded-full ${deviceFeedStatus === 'live' ? 'bg-emerald-500' : deviceFeedStatus === 'error' ? 'bg-rose-500' : 'bg-amber-500'}`} />
                  <span>{deviceFeedStatus === 'live' ? 'مؤكد من الخادم' : deviceFeedStatus === 'cached' ? 'غير مؤكد' : deviceFeedStatus === 'error' ? 'غير متاح' : 'جارٍ الاتصال'}</span>
                </span>
              </div>
              <p className="mt-0.5 text-xs font-medium text-slate-500 dark:text-slate-400">{feedLabel}</p>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="w-8 h-8 rounded-full bg-black/[0.05] dark:bg-white/[0.1] hover:bg-black/[0.1] dark:hover:bg-white/[0.2] flex items-center justify-center text-slate-500 dark:text-slate-300 transition-colors cursor-pointer shrink-0"
            aria-label="إغلاق"
          >
            <X size={16} />
          </button>
        </div>

        {/* Modal Body */}
        <div className="p-4 sm:p-6 overflow-y-auto space-y-5 relative z-10 flex-1">
          {/* Quick Metrics Bar */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div className="p-3.5 rounded-2xl bg-slate-50 dark:bg-white/[0.04] border border-black/[0.06] dark:border-white/[0.08] flex items-center gap-3">
              <div className="w-9 h-9 rounded-xl bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 flex items-center justify-center shrink-0">
                <Activity size={18} />
              </div>
              <div>
                <span className="text-[10px] text-slate-500 dark:text-slate-400 block font-bold">حالة مستمع الأجهزة</span>
                <span className={`text-xs font-black ${deviceFeedStatus === 'live' ? 'text-emerald-700 dark:text-emerald-400' : 'text-amber-700 dark:text-amber-300'}`}>{deviceFeedStatus === 'live' ? 'لقطة خادمية مؤكدة' : deviceFeedStatus === 'cached' ? 'ذاكرة محلية فقط' : deviceFeedStatus === 'error' ? 'غير متاح' : 'جارٍ التحقق'}</span>
              </div>
            </div>

            <div className="p-3.5 rounded-2xl bg-slate-50 dark:bg-white/[0.04] border border-black/[0.06] dark:border-white/[0.08] flex items-center gap-3">
              <div className="w-9 h-9 rounded-xl bg-[#0071E3]/10 text-[#0071E3] flex items-center justify-center shrink-0">
                <Zap size={18} />
              </div>
              <div>
                <span className="text-[10px] text-slate-500 dark:text-slate-400 block font-bold">زمن تأكيد النبضة</span>
                <span className="text-xs font-black font-mono text-[#0071E3]">
                  {lastSyncResult ? `${lastSyncResult.latencyMs}ms` : 'لم يُقَس بعد'}
                </span>
              </div>
            </div>

            <div className="p-3.5 rounded-2xl bg-slate-50 dark:bg-white/[0.04] border border-black/[0.06] dark:border-white/[0.08] flex items-center gap-3">
              <div className="w-9 h-9 rounded-xl bg-amber-500/10 text-amber-600 flex items-center justify-center shrink-0">
                <ShieldCheck size={18} />
              </div>
              <div>
                <span className="text-[10px] text-slate-500 dark:text-slate-400 block font-bold">إصدار النظام</span>
                <span className="text-xs font-mono font-black text-[#0F172A] dark:text-slate-200">
                  {APP_SYSTEM_VERSION}
                </span>
              </div>
            </div>
          </div>

          {/* Manual device-presence heartbeat; live data subscriptions remain automatic. */}
          <div className="p-4 rounded-2xl bg-gradient-to-r from-emerald-500/10 via-sky-500/10 to-transparent border border-emerald-500/25 flex flex-col sm:flex-row items-center justify-between gap-3">
            <div className="space-y-0.5 text-center sm:text-right">
              <div className="flex items-center justify-center sm:justify-start gap-1.5">
                <Sparkles size={14} className="text-emerald-600" />
                <span className="text-xs font-black text-slate-900 dark:text-white">نبضة اتصال لهذا الجهاز فقط</span>
              </div>
              <p className="text-[11px] text-slate-600 dark:text-slate-300">
                تحديث قائمة الحضور يتم تلقائيًا عبر مستمع Firestore. هذا الزر يكتب نبضة واحدة للجهاز الحالي ولا يفرض مزامنة محتوى الأجهزة الأخرى.
              </p>
            </div>

            <button
              type="button"
              disabled={isSyncing || !isOwner || !onTriggerInstantSync}
              onClick={handleInstantTurboSync}
              className="apple-btn px-4 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-black text-xs flex items-center gap-2 shadow-xs cursor-pointer shrink-0 disabled:opacity-50"
            >
              <RefreshCw size={14} className={isSyncing ? 'animate-spin' : ''} />
              <span>{isSyncing ? 'جارٍ إرسال النبضة…' : 'تحديث نبضة هذا الجهاز'}</span>
            </button>
          </div>

          {syncError && <div role="status" className="p-3 rounded-xl bg-rose-500/10 border border-rose-500/25 text-rose-800 dark:text-rose-300 text-xs font-bold">{syncError}</div>}
          {lastSyncResult && !syncError && (
            <div className="p-2.5 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-800 dark:text-emerald-300 text-xs font-bold flex items-center justify-between gap-2">
              <div className="flex items-center gap-1.5">
                <CheckCircle2 size={14} className="text-emerald-600" />
                <span>تأكدت كتابة نبضة الجهاز الحالي فقط؛ ليست تأكيدًا لمزامنة بقية البيانات.</span>
              </div>
              <span className="text-[10px] font-mono opacity-75">{lastSyncResult.time}</span>
            </div>
          )}

          {/* Active Devices List */}
          <div className="space-y-2.5">
            <div className="flex items-center justify-between">
              <h4 className="text-xs font-black text-slate-700 dark:text-slate-300 uppercase tracking-wider flex items-center gap-1.5">
                <Layers size={13} className="text-[#0071E3]" />
                <span>الأجهزة ذات النبضات الحديثة ({devices.length})</span>
              </h4>
              <span className="text-[11px] text-slate-400 font-medium">نافذة الحضور: آخر 3 دقائق</span>
            </div>

            <div className="space-y-2">
              {devices.length === 0 ? (
                <div className="p-6 rounded-2xl bg-slate-50 dark:bg-white/[0.03] border border-dashed border-slate-300 text-center space-y-1">
                  <MonitorCheck size={28} className="mx-auto text-slate-400" />
                  <p className="text-xs font-bold text-slate-600 dark:text-slate-300">{deviceFeedStatus === 'live' ? 'لا توجد نبضات حديثة مؤكدة.' : deviceFeedStatus === 'cached' ? 'لا يمكن تأكيد حالة الأجهزة من البيانات المخبأة وحدها.' : deviceFeedStatus === 'error' ? 'تعذر تحميل قائمة الأجهزة من الخادم.' : 'بانتظار أول لقطة من الخادم…'}</p>
                  <p className="text-[10px] text-slate-400">القائمة تشمل الأجهزة التي نجحت في نشر نبضة ضمن الصلاحيات الحالية.</p>
                </div>
              ) : (
                devices.map((device, idx) => {
                  const isCurrent = device.deviceId === currentDeviceId;
                  return (
                    <div
                      key={device.deviceId || idx}
                      className={`p-3.5 rounded-2xl border transition-all flex flex-col sm:flex-row sm:items-center justify-between gap-3 ${
                        isCurrent
                          ? 'bg-[#0071E3]/[0.06] border-[#0071E3]/30 shadow-2xs'
                          : 'bg-white dark:bg-white/[0.04] border-black/[0.06] dark:border-white/[0.08] hover:border-black/[0.12]'
                      }`}
                    >
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-xl bg-slate-100 dark:bg-white/[0.08] border border-black/[0.06] dark:border-white/[0.1] flex items-center justify-center shrink-0">
                          {getDeviceIcon(device.deviceType)}
                        </div>
                        <div className="space-y-0.5">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="text-xs font-black text-[#0F172A] dark:text-white">
                              {device.deviceName}
                            </span>
                            {isCurrent && (
                              <span className="px-2 py-0.5 rounded-md bg-[#0071E3] text-white text-[9.5px] font-black">
                                هذا الجهاز الحالي
                              </span>
                            )}
                          </div>
                          <div className="flex items-center gap-2 text-[11px] text-slate-500 dark:text-slate-400">
                            <span className="font-bold text-[#0F172A] dark:text-slate-200">
                              المستخدم: {device.userName || 'غير محدد'}
                            </span>
                          </div>
                        </div>
                      </div>

                      <div className="flex items-center gap-2.5 sm:self-center mr-auto sm:mr-0">
                        <div className="text-left sm:text-right">
                          <div className="inline-flex items-center gap-1.5 text-xs font-bold text-emerald-700 dark:text-emerald-400">
                            <span className="w-2 h-2 rounded-full bg-emerald-500" />
                            <span>آخر نبضة</span>
                          </div>
                          <span className="block text-[10px] text-slate-500 dark:text-slate-400">
                            {formatLastSeen(device.lastSeenMs)}
                          </span>
                          <span className="block text-[9px] text-slate-400 font-mono">{device.lastSeenMs ? new Date(device.lastSeenMs).toLocaleTimeString('ar-EG', { hour: '2-digit', minute: '2-digit', second: '2-digit' }) : 'وقت غير متاح'}</span>
                        </div>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </div>

          {/* Explain the scope of presence and live data without overstating delivery guarantees. */}
          <div className="p-3.5 rounded-2xl bg-slate-100/70 dark:bg-white/[0.03] border border-black/[0.05] dark:border-white/[0.06] space-y-1.5 text-xs text-slate-600 dark:text-slate-300">
            <div className="flex items-center gap-1.5 font-bold text-[#0F172A] dark:text-white">
              <ShieldCheck size={14} className="text-emerald-600" />
              <span>حدود التأكيد والخصوصية:</span>
            </div>
            <ul className="list-disc list-inside space-y-1 text-[11px] text-slate-500 dark:text-slate-400 mr-2 leading-relaxed">
              <li>
                لقطة مستمع الأجهزة من Firestore تؤكد اتصال هذا المستمع فقط؛ والنبضة تؤكد كتابة حضور الجهاز الذي أرسلها فقط.
              </li>
              <li>
                تأكيد مزامنة المبيعات أو المخزون يتطلب نجاح العملية السحابية نفسها؛ لا يستنتج الرادار تطابق كل الأجهزة.
              </li>
              <li>
                لا تُرسل أسماء الشاشات في النبضات الجديدة، ولا يُجمع GPS أو عنوان IP أو محتوى الشاشة، ولا يوجد تحكم عن بُعد.
              </li>
            </ul>
          </div>
        </div>

        {/* Modal Footer */}
        <div className="p-3.5 sm:p-4 border-t border-black/[0.06] dark:border-white/[0.08] flex items-center justify-between gap-3 bg-slate-50/80 dark:bg-white/[0.02]">
          <div className="flex items-center gap-2 text-[11px] text-slate-500 font-mono">
            <Clock3 size={12} />
            <span>آخر تأكيد خادمي: {deviceFeedLastServerUpdate ? new Date(deviceFeedLastServerUpdate).toLocaleTimeString('ar-EG', { hour: '2-digit', minute: '2-digit', second: '2-digit' }) : 'غير متاح'}</span>
            <span>·</span>
            <span>{APP_BUILD_DATE}</span>
            <span>·</span>
            <span>{APP_SYSTEM_VERSION}</span>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="apple-btn px-4 py-2 rounded-xl bg-[#0071E3] hover:bg-[#0077ED] text-white text-xs font-black shadow-xs cursor-pointer"
          >
            إغلاق النافذة
          </button>
        </div>
      </div>
    </div>
  );
};

export default ConnectedDevicesSyncModal;
