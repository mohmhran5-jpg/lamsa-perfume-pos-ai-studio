import { useEffect, useState } from 'react';
import { auth } from '../services/firebase';
import {
  bootstrapCommissionCounterOnConfiguredWorker,
  type CommissionCounterBootstrapResult,
} from '../services/workerSaleClient';

const CUTOVER_DATE_KEY = '2026-10-17';
const CUTOVER_AT_UTC_MS = Date.UTC(2026, 9, 17, 0, 0, 0);
const OWNER_EMAIL = 'moh.mhran@gmail.com';

let inFlightBootstrap: Promise<CommissionCounterBootstrapResult> | null = null;

function ensureConfiguredBootstrap(getIdToken: () => Promise<string>): Promise<CommissionCounterBootstrapResult> {
  if (!inFlightBootstrap) {
    inFlightBootstrap = bootstrapCommissionCounterOnConfiguredWorker(getIdToken)
      .finally(() => { inFlightBootstrap = null; });
  }
  return inFlightBootstrap;
}

function utcDateKey(now: Date): string {
  return now.toISOString().slice(0, 10);
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

    const scheduleNextUtcDay = () => {
      const now = new Date();
      const nextUtcMidnight = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 1, 0, 0, 2);
      scheduleRun(nextUtcMidnight - now.getTime());
    };

    const run = async () => {
      if (cancelled || running) return;
      const now = new Date();
      const dateKey = utcDateKey(now);
      if (productionEnabled && dateKey < CUTOVER_DATE_KEY) {
        setFailed(false);
        setBusy(false);
        setMessage('سيُهيّأ العداد تلقائياً بعد بدء 17 أكتوبر 2026، الساعة 03:00 بتوقيت القاهرة؛ البيع يبقى مغلقاً حتى ذلك الموعد.');
        scheduleRun(CUTOVER_AT_UTC_MS - now.getTime() + 1000);
        return;
      }
      if (productionEnabled && dateKey === readyDateKey) {
        scheduleNextUtcDay();
        return;
      }

      const user = auth.currentUser;
      if (!user) {
        setFailed(true);
        setMessage('لم تتوفر جلسة Google للمالك؛ سيظل البيع مغلقاً حتى التحقق.');
        return;
      }
      if (productionEnabled && (user.email?.trim().toLowerCase() !== OWNER_EMAIL
          || user.emailVerified !== true
          || !user.providerData.some((provider) => provider.providerId === 'google.com'))) {
        setFailed(true);
        setMessage('يلزم تسجيل دخول Google موثّق بحساب المالك لتهيئة عداد اليوم.');
        return;
      }

      running = true;
      setBusy(true);
      setFailed(false);
      setMessage(productionEnabled
        ? 'جارٍ التحقق من عداد اليوم على Worker؛ لا تُحفظ مبيعات بهذه الخطوة.'
        : 'جارٍ التحقق من عداد اليوم على المحاكي المحلي…');
      try {
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
        if (productionEnabled) scheduleNextUtcDay();
      } catch (error: unknown) {
        if (cancelled) return;
        const code = error instanceof Error ? error.message : 'bootstrap-failed';
        setFailed(true);
        setMessage(`تعذر تهيئة العداد؛ البيع/الاقتباس سيظلان مغلقين حتى الإصلاح. (${code})`);
        if (productionEnabled && code === 'sale/cutover-not-started') scheduleRun(15_000);
      } finally {
        running = false;
        if (!cancelled) setBusy(false);
      }
    };

    const onVisibilityChange = () => {
      if (!productionEnabled || document.visibilityState !== 'visible') return;
      const dateKey = utcDateKey(new Date());
      if (dateKey >= CUTOVER_DATE_KEY && dateKey !== readyDateKey) {
        if (timer !== undefined) window.clearTimeout(timer);
        void run();
      }
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
      <p className="mt-1 opacity-80">تُجرى قراءة التاريخ فقط عند غياب عداد اليوم، وبحد أعلى ٥٬٠٠٠ سجل لكل مجموعة (`sales` و`sale_operations`). لا تُسجّل هذه الخطوة بيعاً ولا تمسح طابور المبيعات القديم؛ يرفض الخادم البيع قبل موعد القطع وبعده إذا لم يكن العداد جاهزاً.</p>
    </section>
  );
}
