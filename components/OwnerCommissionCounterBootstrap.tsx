import { useEffect, useState } from 'react';
import { auth } from '../services/firebase';
import {
  bootstrapCommissionCounterOnLocalEmulatorWorker,
  LOCAL_LAMSA_COMMISSION_COUNTER_BOOTSTRAP_ENDPOINT,
  type CommissionCounterBootstrapResult,
} from '../services/workerSaleClient';

let inFlightBootstrap: Promise<CommissionCounterBootstrapResult> | null = null;

function ensureLocalBootstrap(getIdToken: () => Promise<string>): Promise<CommissionCounterBootstrapResult> {
  if (!inFlightBootstrap) {
    inFlightBootstrap = bootstrapCommissionCounterOnLocalEmulatorWorker(
      LOCAL_LAMSA_COMMISSION_COUNTER_BOOTSTRAP_ENDPOINT,
      getIdToken,
    ).finally(() => { inFlightBootstrap = null; });
  }
  return inFlightBootstrap;
}

export default function OwnerCommissionCounterBootstrap() {
  const enabled = import.meta.env.DEV && import.meta.env.VITE_PREVIEW_SAFE_MODE === 'true';
  const [attempt, setAttempt] = useState(0);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    if (!enabled) return;
    let cancelled = false;
    const user = auth.currentUser;
    if (!user) {
      setFailed(true);
      setMessage('لم تتوفر جلسة Google موثّقة؛ لا يمكن تهيئة العداد.');
      return;
    }
    setBusy(true);
    setFailed(false);
    setMessage('جارٍ التحقق من عداد عمولة اليوم على المحاكي المحلي…');
    void ensureLocalBootstrap(() => {
      const currentUser = auth.currentUser;
      if (!currentUser) throw new Error('worker-sale/firebase-id-token-required');
      return currentUser.getIdToken();
    }).then((result) => {
      if (cancelled) return;
      setMessage(result.historyScanned
        ? `تمت تهيئة عداد ${result.dateKey}: ${result.sprayBottlesSold} عبوة رش بعد فحص ${result.historicalSaleIdsScanned ?? 0} فاتورة تاريخية.`
        : `العداد جاهز مسبقاً ليوم ${result.dateKey}: ${result.sprayBottlesSold} عبوة رش.`);
    }).catch((error: unknown) => {
      if (cancelled) return;
      const code = error instanceof Error ? error.message : 'bootstrap-failed';
      setFailed(true);
      setMessage(`تعذر تهيئة العداد؛ البيع/الاقتباس سيظلان مغلقين حتى الإصلاح. (${code})`);
    }).finally(() => {
      if (!cancelled) setBusy(false);
    });
    return () => { cancelled = true; };
  }, [attempt, enabled]);

  if (!enabled) return null;
  return (
    <section
      role={failed ? 'alert' : 'status'}
      aria-live="polite"
      className={`mx-4 sm:mx-6 mt-3 rounded-2xl border px-4 py-3 text-xs ${failed
        ? 'border-rose-500/35 bg-rose-50 text-rose-950'
        : 'border-sky-500/30 bg-sky-50 text-sky-950'}`}
    >
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <strong>عداد العمولة اليومي — محاكي محلي فقط</strong>
          <p className="mt-1 font-medium">{message || 'بانتظار حالة العداد…'}</p>
        </div>
        {failed && (
          <button
            type="button"
            disabled={busy}
            onClick={() => setAttempt((current) => current + 1)}
            className="rounded-xl bg-rose-800 px-3 py-2 font-black text-white disabled:opacity-50"
          >
            {busy ? 'جارٍ التحقق…' : 'إعادة المحاولة'}
          </button>
        )}
      </div>
      <p className="mt-1 opacity-80">تُجرى قراءة التاريخ مرة واحدة عند غياب العداد، وبحد أعلى ٥٬٠٠٠ سجل لكل مجموعة (`sales` و`sale_operations`)؛ لا يُستدعى هذا المسار من النسخة الإنتاجية.</p>
    </section>
  );
}
