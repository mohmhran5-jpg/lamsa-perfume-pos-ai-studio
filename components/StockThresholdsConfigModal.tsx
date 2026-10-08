import React, { useState } from 'react';
import { StoreSettings, Product, getProductStockHealth } from '../types';
import { AlertTriangle, ShieldAlert, CheckCircle2, Sliders, X, Save, RotateCcw } from 'lucide-react';

interface StockThresholdsConfigModalProps {
  isOpen: boolean;
  onClose: () => void;
  settings: StoreSettings;
  products: Product[];
  onSaveSettings: (updated: Partial<StoreSettings>) => void;
}

export const StockThresholdsConfigModal: React.FC<StockThresholdsConfigModalProps> = ({
  isOpen,
  onClose,
  settings,
  products,
  onSaveSettings,
}) => {
  if (!isOpen) return null;

  const [criticalThreshold, setCriticalThreshold] = useState<number>(
    settings.criticalStockThresholdGrams ?? 80
  );
  const [lowThreshold, setLowThreshold] = useState<number>(
    settings.lowStockThresholdGrams ?? 200
  );

  // Live preview metrics based on current slider values
  const previewSettings: StoreSettings = {
    ...settings,
    criticalStockThresholdGrams: criticalThreshold,
    lowStockThresholdGrams: lowThreshold,
  };

  const criticalCount = products.filter((p) => {
    const h = getProductStockHealth(p, previewSettings);
    return h.isCritical;
  }).length;

  const lowCount = products.filter((p) => {
    const h = getProductStockHealth(p, previewSettings);
    return h.isLow;
  }).length;

  const healthyCount = products.length - criticalCount - lowCount;

  const handleSave = () => {
    onSaveSettings({
      criticalStockThresholdGrams: criticalThreshold,
      lowStockThresholdGrams: lowThreshold,
    });
    onClose();
  };

  const handleResetDefaults = () => {
    setCriticalThreshold(80);
    setLowThreshold(200);
  };

  return (
    <div
      className="fixed inset-0 z-[140] bg-black/50 backdrop-blur-md flex items-center justify-center p-3 sm:p-4 animate-in fade-in duration-200"
      dir="rtl"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="smart-modal-window apple-glass rounded-[28px] w-full max-w-lg border border-black/[0.1] shadow-2xl bg-white/95 flex flex-col overflow-hidden max-h-[92dvh]">
        {/* Header */}
        <div className="px-5 py-4 border-b border-black/[0.07] flex items-center justify-between shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-gradient-to-tr from-rose-500 to-amber-500 text-white flex items-center justify-center shadow-sm">
              <Sliders size={20} />
            </div>
            <div>
              <h2 className="text-base sm:text-lg font-black text-[#1D1D1F] tracking-tight">
                ضبط خطوط الخطر والتنبيهات المرئية للمخزون
              </h2>
              <p className="text-[11px] text-[#86868B]">
                تخصيص جرامات تلوين المنتجات بالأحمر والأصفر لمراقبة المخزون بدقة فائقة
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="w-8 h-8 rounded-full bg-black/[0.06] hover:bg-black/[0.12] flex items-center justify-center text-[#1D1D1F] transition-colors cursor-pointer"
            title="إغلاق"
          >
            <X size={16} />
          </button>
        </div>

        {/* Content */}
        <div className="p-5 space-y-5 overflow-y-auto flex-1">
          {/* Live Preview Summary Bar */}
          <div className="p-4 rounded-2xl bg-slate-50 border border-slate-200/80 space-y-2">
            <span className="text-xs font-bold text-slate-700 block">
              المعاينة الفورية لتصنيف المخزون ({products.length} صنف):
            </span>
            <div className="grid grid-cols-3 gap-2">
              <div className="p-2.5 rounded-xl bg-rose-50 border border-rose-200/70 text-center">
                <span className="text-[10px] font-bold text-rose-700 block">🚨 خط الخطر (أحمر)</span>
                <span className="font-mono text-lg font-black text-rose-600">{criticalCount}</span>
                <span className="text-[9px] text-rose-500 block">≤ {criticalThreshold} جم</span>
              </div>
              <div className="p-2.5 rounded-xl bg-amber-50 border border-amber-200/70 text-center">
                <span className="text-[10px] font-bold text-amber-800 block">⚠️ اقترب من النفاد</span>
                <span className="font-mono text-lg font-black text-amber-600">{lowCount}</span>
                <span className="text-[9px] text-amber-600 block">≤ {lowThreshold} جم</span>
              </div>
              <div className="p-2.5 rounded-xl bg-emerald-50 border border-emerald-200/70 text-center">
                <span className="text-[10px] font-bold text-emerald-800 block">✅ مخزون كافٍ</span>
                <span className="font-mono text-lg font-black text-emerald-600">{healthyCount}</span>
                <span className="text-[9px] text-emerald-600 block">&gt; {lowThreshold} جم</span>
              </div>
            </div>
          </div>

          {/* Slider 1: Critical Danger Line (Red) */}
          <div className="p-4 rounded-2xl border-2 border-rose-500/30 bg-rose-500/[0.03] space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="w-3 h-3 rounded-full bg-rose-500 animate-pulse ring-2 ring-rose-400/40"></span>
                <label className="text-xs font-black text-rose-950">
                  خط الخطر الحرج (يتلون بالأحمر فوراً)
                </label>
              </div>
              <div className="flex items-center gap-1 bg-white px-2.5 py-1 rounded-lg border border-rose-200 shadow-2xs">
                <input
                  type="number"
                  min="10"
                  max="500"
                  step="10"
                  value={criticalThreshold}
                  onChange={(e) => {
                    const val = Math.max(10, Math.min(1000, Number(e.target.value) || 10));
                    setCriticalThreshold(val);
                    if (val >= lowThreshold) setLowThreshold(val + 50);
                  }}
                  className="w-14 text-center font-mono font-black text-sm text-rose-600 outline-none"
                />
                <span className="text-[11px] font-bold text-slate-500">جم</span>
              </div>
            </div>

            <p className="text-[11px] text-rose-900/80 leading-relaxed">
              أي عطر يصل رصيده بالمخزون إلى هذا الحد أو أقل سيتلون باللون الأحمر الحرج مع إشارة وميض مستمرة وزر توريد عاجل.
            </p>

            <input
              type="range"
              min="20"
              max="400"
              step="10"
              value={criticalThreshold}
              onChange={(e) => {
                const val = Number(e.target.value);
                setCriticalThreshold(val);
                if (val >= lowThreshold) setLowThreshold(val + 30);
              }}
              className="w-full accent-rose-600 cursor-pointer h-2 bg-rose-200 rounded-lg"
            />
          </div>

          {/* Slider 2: Low Stock Warning Line (Yellow / Amber) */}
          <div className="p-4 rounded-2xl border-2 border-amber-500/30 bg-amber-500/[0.03] space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="w-3 h-3 rounded-full bg-amber-500 ring-2 ring-amber-400/40"></span>
                <label className="text-xs font-black text-amber-950">
                  عتبة اقتراب المخزون من النفاد (يتلون بالأصفر)
                </label>
              </div>
              <div className="flex items-center gap-1 bg-white px-2.5 py-1 rounded-lg border border-amber-200 shadow-2xs">
                <input
                  type="number"
                  min={criticalThreshold + 10}
                  max="1500"
                  step="20"
                  value={lowThreshold}
                  onChange={(e) => {
                    const val = Math.max(criticalThreshold + 10, Number(e.target.value) || 200);
                    setLowThreshold(val);
                  }}
                  className="w-14 text-center font-mono font-black text-sm text-amber-600 outline-none"
                />
                <span className="text-[11px] font-bold text-slate-500">جم</span>
              </div>
            </div>

            <p className="text-[11px] text-amber-900/80 leading-relaxed">
              أي عطر يكون رصيده بين خط الخطر الحرج وهذه العتبة سيتلون باللون الأصفر للتحذير الاستباقي قبل نفاد المخزون.
            </p>

            <input
              type="range"
              min="50"
              max="800"
              step="20"
              value={lowThreshold}
              onChange={(e) => {
                const val = Math.max(criticalThreshold + 10, Number(e.target.value));
                setLowThreshold(val);
              }}
              className="w-full accent-amber-600 cursor-pointer h-2 bg-amber-200 rounded-lg"
            />
          </div>
        </div>

        {/* Footer Actions */}
        <div className="p-4 border-t border-black/[0.07] bg-black/[0.02] flex items-center justify-between gap-3 shrink-0">
          <button
            type="button"
            onClick={handleResetDefaults}
            className="apple-btn px-3 py-2 rounded-xl text-xs font-bold text-slate-600 hover:text-slate-900 hover:bg-black/[0.04] flex items-center gap-1.5 cursor-pointer"
          >
            <RotateCcw size={13} />
            <span>القيم الافتراضية (80 / 200 جم)</span>
          </button>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onClose}
              className="apple-btn px-4 py-2 rounded-xl text-xs font-bold bg-slate-200 hover:bg-slate-300 text-slate-800 cursor-pointer"
            >
              إلغاء
            </button>
            <button
              type="button"
              onClick={handleSave}
              className="apple-btn px-5 py-2 rounded-xl text-xs font-black bg-[#1D1D1F] hover:bg-black text-white flex items-center gap-1.5 cursor-pointer shadow-sm"
            >
              <Save size={14} />
              <span>حفظ وتطبيق فوراً</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
