import { useEffect, useState } from 'react';
import { auth } from '../services/firebase';
import {
  bootstrapCommissionCounterOnConfiguredWorker,
  fetchTrustedServerTimeFromConfiguredWorker,
  type CommissionCounterBootstrapResult,
} from '../services/workerSaleClient';
import { getCommissionCounterBootstrapPlan } from '../services/commissionCounterSchedule';
import { getTrustedServerTimeEstimate, recordTrustedServerTimeSample } from '../services/commissionTimeEvidence';

const OWNER_EMAIL = 'moh.mhran@gmail.com';

let inFlightBootstrap: Promise<CommissionCounterBootstrapResult> | null = null;

function ensureConfiguredBootstrap(getIdToken: () => Promise<string>): Promise<CommissionCounterBootstrapResult> {
  if (!inFlightBootstrap) {
    inFlightBootstrap = bootstrapCommissionCounterOnConfiguredWorker(getIdToken)
      .finally(() => { inFlightBootstrap = null; });
  }
  return inFlightBootstrap;
}

export default function OwnerCommissionCounterBootstrap() {
  const env = (import.meta as ImportMeta & { env?: Record<string, unknown> }).env;
  const productionEnabled = env?.PROD === true
    && env.VITE_LAMSA_SALE_WORKER_ENABLED === 'true';
  const previewEnabled = env?.DEV === true && env.VITE_PREVIEW_SAFE_MODE === 'true';
  const enabled = productionEnabled || previewEnabled;
  const [attempt, setAttempt] = useState(0);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    if (!enabled) return undefined;
    let cancelled = false;
    let running = false;
    let readyDateKey = '';
    let timer: number | undefined;

    const scheduleRun = (delayMs: number) => {
      if (timer !== undefined) window.clearTimeout(timer);
      timer = window.setTimeout(() => { void run(); }, Math.max(500, delayMs));
    };

    const run = async () => {
      if (cancelled || running) return;
      running = true;
      setBusy(true);
      try {
        const user = auth.currentUser;
        if (!user) throw new Error('auth/owner-google-session-required');
        if (productionEnabled && (user.email?.trim().toLowerCase() !== OWNER_EMAIL
            || user.emailVerified !== true
            || !user.providerData.some((provider) => provider.providerId === 'google.com'))) {
          throw new Error('role/owner-required');
        }
        const serverTime = await fetchTrustedServerTimeFromConfiguredWorker(() => {
          const currentUser = auth.currentUser;
          if (!currentUser) throw new Error('worker-sale/firebase-id-token-required');
          if (productionEnabled && (currentUser.email?.trim().toLowerCase() !== OWNER_EMAIL
              || currentUser.emailVerified !== true
              || !currentUser.providerData.some((provider) => provider.providerId === 'google.com'))) {
            throw new Error('role/owner-required');
          }
          return currentUser.getIdToken();
        });
        if (!recordTrustedServerTimeSample(serverTime)) throw new Error('worker-sale/invalid-server-time-response');
        const timeEstimate = getTrustedServerTimeEstimate();
        if (!timeEstimate) throw new Error('worker-sale/stale-server-time-sample');
        const plan = getCommissionCounterBootstrapPlan(
          new Date(timeEstimate.serverNowMs), enabled, productionEnabled, readyDateKey,
        );
        if (plan.action === 'disabled') return;
        if (plan.action === 'invalid-clock') throw new Error('worker-sale/invalid-server-clock');
        if (plan.action === 'wait-for-cutover') {
          setFailed(false);
          setMessage('وقت الخادم موثوق. سيُهيّأ العداد تلقائياً عند 17 أكتوبر 2026، 03:00 القاهرة (00:00 UTC)، دون الاعتماد على ساعة الجهاز.');
          scheduleRun(plan.delayMs);
          return;
        }
        if (plan.action === 'already-ready-today') {
          setFailed(false);
          setMessage(`وقت الخادم مؤكد والعداد جاهز ليوم ${plan.dateKey}.`);
          scheduleRun(plan.delayMs);
          return;
        }
        setFailed(false);
        setMessage(productionEnabled
          ? 'جارٍ التحقق من عداد اليوم على Worker؛ لا تُحفظ مبيعات بهذه الخطوة.'
          : 'جارٍ التحقق من عداد اليوم على المحاكي المحلي…');
        const result = await ensureConfiguredBootstrap(() => {
          const currentUser = auth.currentUser;
          if (!currentUser) throw new Error('worker-sale/firebase-id-token-required');
          if (productionEnabled && (currentUser.email?.trim().toLowerCase() !== OWNER_EMAIL
              || currentUser.emailVerified !== true
              || !currentUser.providerData.some((provider) => provider.providerId === 'google.com'))) {
            throw new Error('role/owner-required');
          }
          return currentUser.getIdToken();
        });
        if (cancelled) return;
        readyDateKey = result.dateKey;
        setMessage(result.historyScanned
          ? `تمت تهيئة عداد ${result.dateKey}: ${result.sprayBottlesSold} عبوة رش بعد فحص ${result.historicalSaleIdsScanned ?? 0} فاتورة.`
          : `العداد جاهز مسبقاً ليوم ${result.dateKey}: ${result.sprayBottlesSold} عبوة رش.`);
        if (productionEnabled) {
          const currentEstimate = getTrustedServerTimeEstimate();
          if (currentEstimate) {
            const nextMidnight = Date.UTC(new Date(currentEstimate.serverNowMs).getUTCFullYear(),
              new Date(currentEstimate.serverNowMs).getUTCMonth(), new Date(currentEstimate.serverNowMs).getUTCDate() + 1, 0, 0, 2);
            scheduleRun(Math.max(1000, nextMidnight - currentEstimate.serverNowMs));
          }
        }
      } catch (error: unknown) {
        if (cancelled) return;
        const code = error instanceof Error ? error.message : 'bootstrap-failed';
        setFailed(true);
        setMessage(`تعذر التحقق من وقت الخادم أو تهيئة العداد. لن تُعتمد العمولة آلياً حتى عودة التحقق. (${code})`);
        if (productionEnabled) scheduleRun(60_000);
      } finally {
        running = false;
        if (!cancelled) setBusy(false);
      }
    };

    const onVisibilityChange = () => {
      if (!productionEnabled || document.visibilityState !== 'visible') return;
      if (timer !== undefined) window.clearTimeout(timer);
      void run();
    };

    document.addEventListener('visibilitychange', onVisibilityChange);
    void run();
    return () => {
      cancelled = true;
      if (timer !== undefined) window.clearTimeout(timer);
      document.removeEventListener('visibilitychange', onVisibilityChange);
    };
  }, [attempt, enabled, productionEnabled]);

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
          <strong>{productionEnabled ? 'عداد العمولة اليومي — تهيئة مالك آمنة' : 'عداد العمولة اليومي — محاكي محلي فقط'}</strong>
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
      <p className="mt-1 opacity-80">وقت اليوم يُقدّر من Worker موثوق؛ قراءة التاريخ لا تُجرى إلا عند غياب العداد وبحد أعلى ٥٬٠٠٠ سجل لكل مجموعة (`sales` و`sale_operations`). لا تُسجّل هذه الخطوة بيعاً ولا تمسح طابور المبيعات القديم.</p>
    </section>
  );
}
