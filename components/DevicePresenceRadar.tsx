import React, { useEffect, useMemo, useState } from 'react';
import {
  Activity,
  Clock3,
  Laptop,
  Radio,
  RefreshCw,
  Smartphone,
  Tablet,
  Wifi,
} from 'lucide-react';
import { ConnectedDeviceRecord } from '../types';
import { getLocalDeviceId } from '../services/firebase';

type DeviceFeedStatus = 'connecting' | 'live' | 'cached' | 'error';

interface DevicePresenceRadarProps {
  devices: ConnectedDeviceRecord[];
  feedStatus: DeviceFeedStatus;
  lastServerUpdate: number | null;
  isCloudConnected: boolean;
  onOpen?: () => void;
}

const relativeAge = (timestamp: number, now: number) => {
  if (!Number.isFinite(timestamp) || timestamp <= 0) return 'وقت غير متاح';
  const seconds = Math.max(0, Math.floor((now - timestamp) / 1000));
  if (seconds < 5) return 'منذ ثوانٍ قليلة';
  if (seconds < 60) return `منذ ${seconds} ثانية`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `منذ ${minutes} دقيقة`;
  return `منذ ${Math.floor(minutes / 60)} ساعة`;
};

const DevicePresenceRadar: React.FC<DevicePresenceRadarProps> = ({
  devices,
  feedStatus,
  lastServerUpdate,
  isCloudConnected,
  onOpen,
}) => {
  const [now, setNow] = useState(Date.now());
  const localDeviceId = useMemo(() => getLocalDeviceId(), []);

  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 5000);
    return () => window.clearInterval(timer);
  }, []);

  const feedLabel = {
    connecting: 'جارٍ التحقق من مستمع الأجهزة',
    live: 'مستمع الأجهزة تلقّى لقطة مؤكدة من الخادم',
    cached: 'البيانات من الذاكرة المحلية؛ اتصال الخادم غير مؤكد',
    error: 'تعذّر اتصال مستمع الأجهزة بالخادم',
  }[feedStatus];
  const feedTone = feedStatus === 'live'
    ? 'text-emerald-700 bg-emerald-500/10 border-emerald-500/25'
    : feedStatus === 'error'
      ? 'text-rose-700 bg-rose-500/10 border-rose-500/25'
      : 'text-amber-800 bg-amber-500/10 border-amber-500/25';

  const deviceIcon = (type: ConnectedDeviceRecord['deviceType']) => {
    if (type === 'mobile') return <Smartphone size={16} className="text-[#0071E3]" />;
    if (type === 'tablet') return <Tablet size={16} className="text-amber-600" />;
    return <Laptop size={16} className="text-emerald-700" />;
  };

  return (
    <section className="order-none rounded-2xl border border-emerald-500/25 bg-white/95 p-3.5 shadow-2xs dark:bg-[#111827]" aria-label="رادار الأجهزة المتصلة">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex min-w-0 items-center gap-3">
          <div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border ${feedStatus === 'live' ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-700' : 'border-slate-300 bg-slate-100 text-slate-500'}`}>
            <Radio size={19} className={feedStatus === 'live' ? 'animate-pulse' : ''} />
          </div>
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="text-sm font-black text-slate-900 dark:text-white">رادار الأجهزة والاتصال اللحظي</h2>
              <span className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-bold ${feedTone}`}>
                <span className={`h-1.5 w-1.5 rounded-full ${feedStatus === 'live' ? 'bg-emerald-500' : feedStatus === 'error' ? 'bg-rose-500' : 'bg-amber-500'}`} />
                {feedStatus === 'live' ? 'مؤكد من الخادم' : feedStatus === 'cached' ? 'غير مؤكد' : feedStatus === 'error' ? 'غير متاح' : 'جارٍ الاتصال'}
              </span>
            </div>
            <p className="mt-0.5 text-[11px] text-slate-600 dark:text-slate-400">{feedLabel}</p>
          </div>
        </div>
        <button
          type="button"
          onClick={onOpen}
          disabled={!onOpen}
          className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-black text-slate-800 shadow-2xs transition hover:bg-slate-50 disabled:cursor-default dark:border-white/15 dark:bg-white/5 dark:text-white"
        >
          <Activity size={14} className="text-[#0071E3]" />
          <span>تفاصيل الرادار</span>
        </button>
      </div>

      <div className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-3">
        <div className="rounded-xl bg-slate-50 px-3 py-2 dark:bg-white/[0.04]">
          <span className="block text-[10px] font-bold text-slate-500 dark:text-slate-400">نبضات حديثة (آخر 3 دقائق)</span>
          <span className="mt-0.5 block text-sm font-black text-slate-900 dark:text-white">{devices.length} جهاز</span>
        </div>
        <div className="rounded-xl bg-slate-50 px-3 py-2 dark:bg-white/[0.04]">
          <span className="block text-[10px] font-bold text-slate-500 dark:text-slate-400">نتيجة آخر فحص قراءة Firestore</span>
          <span className={`mt-0.5 block text-xs font-black ${isCloudConnected ? 'text-emerald-700 dark:text-emerald-400' : 'text-amber-700 dark:text-amber-300'}`}>
            {isCloudConnected ? 'نجح' : 'لم ينجح أو لم يكتمل'}
          </span>
        </div>
        <div className="rounded-xl bg-slate-50 px-3 py-2 dark:bg-white/[0.04]">
          <span className="block text-[10px] font-bold text-slate-500 dark:text-slate-400">آخر لقطة من الخادم</span>
          <span className="mt-0.5 block text-xs font-black text-slate-800 dark:text-slate-200">
            {lastServerUpdate
              ? `${relativeAge(lastServerUpdate, now)} · ${new Date(lastServerUpdate).toLocaleTimeString('ar-EG', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}`
              : 'لم يصل تأكيد خادمي بعد'}
          </span>
        </div>
      </div>

      {devices.length > 0 ? (
        <div className="mt-3 grid grid-cols-1 gap-2 lg:grid-cols-2">
          {devices.slice(0, 4).map((device) => {
            const isCurrent = device.deviceId === localDeviceId;
            return (
              <div key={device.deviceId} className="flex min-w-0 items-center justify-between gap-3 rounded-xl border border-slate-200/80 bg-white px-3 py-2 dark:border-white/10 dark:bg-white/[0.03]">
                <div className="flex min-w-0 items-center gap-2.5">
                  <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-slate-100 dark:bg-white/10">{deviceIcon(device.deviceType)}</div>
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-1.5">
                      <span className="truncate text-xs font-black text-slate-900 dark:text-white">{device.deviceName || 'جهاز مسجل'}</span>
                      {isCurrent && <span className="rounded bg-[#0071E3]/10 px-1.5 py-0.5 text-[9px] font-bold text-[#0067C0]">هذا الجهاز</span>}
                    </div>
                    <span className="block truncate text-[10px] text-slate-500 dark:text-slate-400">{device.userName || 'مستخدم غير محدد'}</span>
                  </div>
                </div>
                <div className="shrink-0 text-left">
                  <div className="flex items-center justify-end gap-1 text-[10px] font-bold text-slate-700 dark:text-slate-200">
                    <Clock3 size={11} />
                    <span>{relativeAge(device.lastSeenMs, now)}</span>
                  </div>
                  <span className="mt-0.5 block text-[9px] text-slate-500 dark:text-slate-400">
                    {device.lastSeenMs ? new Date(device.lastSeenMs).toLocaleTimeString('ar-EG', { hour: '2-digit', minute: '2-digit', second: '2-digit' }) : 'وقت غير متاح'}
                  </span>
                </div>
              </div>
            );
          })}
          {devices.length > 4 && <p className="text-[10px] text-slate-500 lg:col-span-2">تظهر أول 4 أجهزة هنا؛ افتح التفاصيل لعرض {devices.length - 4} أجهزة أخرى.</p>}
        </div>
      ) : (
        <div className="mt-3 flex items-center gap-2 rounded-xl border border-dashed border-slate-300 px-3 py-3 text-[11px] text-slate-600 dark:border-white/15 dark:text-slate-400">
          {feedStatus === 'error' ? <Wifi size={15} className="text-rose-500" /> : <RefreshCw size={14} className={feedStatus === 'connecting' ? 'animate-spin' : ''} />}
          <span>{feedStatus === 'error' ? 'لا يمكن تأكيد الأجهزة الآن؛ لا تعتبر القائمة الفارغة دليلًا على عدم وجود أجهزة.' : feedStatus === 'live' ? 'لا توجد أجهزة أرسلت نبضة حديثة ضمن نافذة الرصد.' : 'بانتظار تأكيد اتصال الخادم؛ الأجهزة المخزنة محليًا لا تُعرض كأجهزة متصلة مؤكدة.'}</span>
        </div>
      )}

      <p className="mt-3 border-t border-slate-200 pt-2 text-[10px] leading-5 text-slate-500 dark:border-white/10 dark:text-slate-400">
        النبضة تعني أن الجهاز كتب حضورًا خلال آخر 3 دقائق فقط؛ لا تثبت مزامنة كل السجلات. لا يُجمع موقع GPS أو عنوان IP أو محتوى الشاشة، ولا يوجد تحكم عن بُعد.
      </p>
    </section>
  );
};

export default DevicePresenceRadar;
