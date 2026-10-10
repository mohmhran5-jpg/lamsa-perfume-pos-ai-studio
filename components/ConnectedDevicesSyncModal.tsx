import React from 'react';
import { Clock3, Monitor, Smartphone, Tablet, X } from 'lucide-react';
import type { ConnectedDeviceRecord } from '../types';

interface ConnectedDevicesSyncModalProps {
  isOpen: boolean;
  onClose: () => void;
  devices: ConnectedDeviceRecord[];
  isOwner?: boolean;
}

const formatLastSeen = (timestamp: number) => {
  const diff = Math.max(0, Date.now() - timestamp);
  if (diff < 60_000) return 'الآن';
  if (diff < 60 * 60_000) return `منذ ${Math.floor(diff / 60_000)} دقيقة`;
  if (diff < 24 * 60 * 60_000) return `منذ ${Math.floor(diff / (60 * 60_000))} ساعة`;
  return new Date(timestamp).toLocaleString('ar-EG');
};

const DeviceIcon: React.FC<{ type: ConnectedDeviceRecord['deviceType'] }> = ({ type }) => {
  if (type === 'mobile') return <Smartphone size={18} />;
  if (type === 'tablet') return <Tablet size={18} />;
  return <Monitor size={18} />;
};

const ConnectedDevicesSyncModal: React.FC<ConnectedDevicesSyncModalProps> = ({
  isOpen,
  onClose,
  devices,
  isOwner = false,
}) => {
  if (!isOpen) return null;

  const sortedDevices = [...devices].sort((a, b) => b.lastSeenMs - a.lastSeenMs);

  return (
    <div className="fixed inset-0 z-[250] flex items-center justify-center bg-black/55 p-4 backdrop-blur-sm" dir="rtl">
      <section role="dialog" aria-modal="true" aria-labelledby="connected-devices-title" className="w-full max-w-xl overflow-hidden rounded-3xl border border-white/15 bg-[#15171b] text-white shadow-2xl">
        <header className="flex items-start justify-between gap-4 border-b border-white/10 p-5">
          <div>
            <h2 id="connected-devices-title" className="text-lg font-black">حضور الأجهزة</h2>
            <p className="mt-1 text-xs leading-6 text-white/65">المعروض هو نوع الجهاز ووقت آخر ظهور فقط.</p>
          </div>
          <button type="button" onClick={onClose} aria-label="إغلاق" className="rounded-full p-2 text-white/70 hover:bg-white/10 hover:text-white">
            <X size={18} />
          </button>
        </header>

        {!isOwner ? (
          <div className="p-6 text-center text-sm text-white/70">قائمة الأجهزة متاحة للمالك فقط.</div>
        ) : (
          <div className="max-h-[65vh] space-y-3 overflow-y-auto p-5">
            {sortedDevices.length === 0 ? (
              <div className="rounded-2xl border border-white/10 bg-white/[0.04] p-6 text-center text-sm text-white/65">
                لا توجد جلسات لها حضور حديث.
              </div>
            ) : sortedDevices.map((device) => (
              <article key={device.id || device.deviceId} className="flex items-center gap-3 rounded-2xl border border-white/10 bg-white/[0.04] p-4">
                <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-white/10 text-sky-300">
                  <DeviceIcon type={device.deviceType} />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <h3 className="truncate text-sm font-bold">{device.deviceName}</h3>
                    <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${device.isOnline ? 'bg-emerald-400/15 text-emerald-300' : 'bg-white/10 text-white/55'}`}>
                      {device.isOnline ? 'نشط الآن' : 'غير نشط'}
                    </span>
                  </div>
                  <p className="mt-1 truncate text-xs text-white/65">{device.userName}</p>
                  <p className="mt-2 flex items-center gap-1.5 text-[11px] text-white/50">
                    <Clock3 size={12} /> آخر ظهور: {formatLastSeen(device.lastSeenMs)}
                  </p>
                </div>
              </article>
            ))}
          </div>
        )}

        <footer className="border-t border-white/10 px-5 py-4 text-[11px] leading-5 text-white/45">
          لا تُسجَّل الشاشة أو عنوان IP أو اسم المتصفح، ولا تتضمن هذه النافذة إجراءً لقطع جلسة جهاز.
        </footer>
      </section>
    </div>
  );
};

export default ConnectedDevicesSyncModal;
