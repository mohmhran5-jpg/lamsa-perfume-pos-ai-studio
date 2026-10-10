import React, { useEffect, useState } from 'react';
import { AppUser, DailyClosure } from '../types';
import { getGoogleSignInErrorMessage, signInWithGoogleAndLoadAppUser } from '../services/firebase';
import { AlertCircle, CheckCircle2, Clock3, LockKeyhole, ShieldCheck, Sparkles, Store, WifiOff } from 'lucide-react';

interface AppleWelcomeLockScreenProps {
  users: AppUser[];
  currentClosure: DailyClosure | null;
  onUnlock: (user: AppUser) => void;
  onUpdateUser?: (user: AppUser) => void;
  savedSessionUser?: AppUser | null;
  isCheckingSavedSession?: boolean;
  authRestoreError?: string | null;
  onResumeSavedSession?: () => void;
  activeThemeId?: string;
  storeName?: string;
  storeSlogan?: string;
}

export const AppleWelcomeLockScreen: React.FC<AppleWelcomeLockScreenProps> = ({
  currentClosure,
  onUnlock,
  savedSessionUser = null,
  isCheckingSavedSession = false,
  authRestoreError = null,
  onResumeSavedSession,
  activeThemeId = 'neo_precision_2027',
  storeName = 'لَمْسَةُ عِطْر',
  storeSlogan = 'فخامة العطور الشرقية والفرنسية',
}) => {
  const [currentTime, setCurrentTime] = useState(new Date());
  const [error, setError] = useState<string | null>(null);
  const [isSigningIn, setIsSigningIn] = useState(false);
  const [isOnline, setIsOnline] = useState(() => typeof navigator === 'undefined' || navigator.onLine);

  useEffect(() => {
    const timer = window.setInterval(() => setCurrentTime(new Date()), 1000);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    const updateOnlineStatus = () => setIsOnline(navigator.onLine);
    window.addEventListener('online', updateOnlineStatus);
    window.addEventListener('offline', updateOnlineStatus);
    return () => {
      window.removeEventListener('online', updateOnlineStatus);
      window.removeEventListener('offline', updateOnlineStatus);
    };
  }, []);

  const timeFormatted = currentTime.toLocaleTimeString('ar-EG', { hour: '2-digit', minute: '2-digit', hour12: true });
  const dateFormatted = currentTime.toLocaleDateString('ar-EG', {
    weekday: 'long', day: 'numeric', month: 'long', year: 'numeric',
  });
  const hours = currentTime.getHours();
  const greeting = hours >= 5 && hours < 12
    ? 'صباح الخير والبركة'
    : hours >= 12 && hours < 17
      ? 'مساء الخير والنشاط'
      : hours >= 17 && hours < 22
        ? 'مساء العطور والجمال'
        : 'أهلاً بك في لَمْسَةُ عِطْر';

  const handleGoogleSignIn = async () => {
    setError(null);
    setIsSigningIn(true);
    try {
      const user = await signInWithGoogleAndLoadAppUser();
      if (user) onUnlock({ ...user, lastLoginAt: new Date().toISOString() });
    } catch (err) {
      setError(getGoogleSignInErrorMessage(err));
    } finally {
      setIsSigningIn(false);
    }
  };

  return (
    <div data-welcome-theme={activeThemeId} className="welcome-login-shell fixed inset-0 z-[100] min-h-screen text-white flex flex-col overflow-y-auto" dir="rtl">
      <div className="welcome-login-ambience fixed inset-0 pointer-events-none overflow-hidden" aria-hidden="true">
        <div className="welcome-login-orb welcome-login-orb--gold absolute -top-[25%] -right-[15%] w-[700px] h-[700px] rounded-full blur-[130px]" />
        <div className="welcome-login-orb welcome-login-orb--blue absolute -bottom-[20%] -left-[15%] w-[650px] h-[650px] rounded-full blur-[140px]" />
        <div className="welcome-login-grid absolute inset-0 opacity-30" />
      </div>

      <header className="welcome-login-header relative z-10 px-5 sm:px-8 py-4 flex items-center justify-between border-b border-white/[0.08] bg-black/20 backdrop-blur-xl">
        <div className="flex items-center gap-3">
          <div className="welcome-brand-mark w-10 h-10 rounded-2xl text-slate-950 flex items-center justify-center shadow-lg">
            <Sparkles size={19} />
          </div>
          <div>
            <h1 className="text-sm font-black tracking-tight">{storeName}</h1>
            <p className="text-[10px] text-zinc-400">{storeSlogan}</p>
          </div>
        </div>
        <div className="welcome-security-pill hidden sm:flex items-center gap-2 px-3 py-1.5 rounded-full bg-white/[0.05] border border-white/[0.08] text-[11px] text-zinc-300">
          <ShieldCheck size={14} />
          <span>حساب Google معتمد</span>
        </div>
      </header>

      <main className="relative z-10 flex-1 flex flex-col items-center justify-center px-4 py-8 w-full max-w-xl mx-auto">
        <div className="text-center mb-6 space-y-2">
          <div className="welcome-greeting-pill inline-flex items-center gap-2 px-3 py-1 rounded-full border text-xs font-semibold">
            <span>{greeting}</span>
          </div>
          <div className="text-5xl sm:text-7xl font-extralight tracking-tight text-white/95">{timeFormatted}</div>
          <div className="text-xs sm:text-sm text-zinc-400">{dateFormatted}</div>
        </div>

        <section className="welcome-auth-card w-full rounded-3xl backdrop-blur-2xl border p-6 sm:p-8 shadow-2xl space-y-4" aria-labelledby="welcome-auth-title">
          <div className="flex items-center gap-3">
            <div className="welcome-auth-lock w-11 h-11 rounded-2xl border flex items-center justify-center">
              <LockKeyhole size={20} />
            </div>
            <div>
              <h2 id="welcome-auth-title" className="text-base font-black">أهلاً بك في {storeName}</h2>
              <p className="text-xs text-zinc-400 mt-1">دخول سريع بحساب Google المعتمد</p>
            </div>
          </div>

          {isCheckingSavedSession && !savedSessionUser && (
            <div role="status" aria-live="polite" className="welcome-loading rounded-2xl border p-3 text-xs flex items-center gap-3">
              <span className="welcome-loading-spinner h-5 w-5 rounded-full border-2 border-t-transparent animate-spin" />
              <span className="flex-1">جارٍ تجهيز جلسة الدخول المحفوظة…</span>
              <CheckCircle2 size={15} className="opacity-70" />
            </div>
          )}

          {savedSessionUser && (
            <button
              type="button"
              onClick={onResumeSavedSession}
              disabled={isCheckingSavedSession}
              className="welcome-resume-button w-full min-h-14 rounded-2xl border font-black text-sm transition-all disabled:opacity-50 flex items-center justify-center gap-2"
            >
              <CheckCircle2 size={18} />
              <span>متابعة باسم {savedSessionUser.displayName}</span>
            </button>
          )}

          {currentClosure && (
            <div className="flex items-center gap-2 text-[11px] text-zinc-400">
              <Clock3 size={14} />
              <span>حالة الوردية: {currentClosure.status}</span>
            </div>
          )}

          {!isOnline && (
            <div role="status" className="rounded-2xl bg-amber-500/10 border border-amber-400/25 p-3 text-xs text-amber-100 leading-6 flex gap-2.5">
              <WifiOff size={16} className="text-amber-300 shrink-0 mt-1" />
              <span>لا يوجد اتصال. يمكن متابعة جلسة سبق التحقق منها على هذا الجهاز؛ أول تسجيل دخول يحتاج إلى الإنترنت.</span>
            </div>
          )}

          {(error || authRestoreError) && (
            <div role="alert" className="rounded-2xl bg-rose-500/10 border border-rose-500/30 p-3 text-xs text-rose-200 flex items-start gap-2">
              <AlertCircle size={16} className="shrink-0 mt-0.5" />
              <span>{error || authRestoreError}</span>
            </div>
          )}

          <button
            type="button"
            onClick={handleGoogleSignIn}
            disabled={isSigningIn || !isOnline}
            className="welcome-google-button w-full min-h-14 rounded-2xl font-black text-sm shadow-xl transition-all flex items-center justify-center gap-2.5 disabled:opacity-50 disabled:cursor-wait"
          >
            {isSigningIn ? (
              <><span className="welcome-loading-spinner h-5 w-5 rounded-full border-2 border-t-transparent animate-spin" /><span>جارٍ التحقق من الحساب…</span></>
            ) : (
              <><span className="w-7 h-7 rounded-lg bg-white flex items-center justify-center text-base font-black text-[#4285F4]">G</span><span>{savedSessionUser ? 'اختيار حساب Google آخر' : 'متابعة باستخدام Google'}</span></>
            )}
          </button>

          <div className="welcome-login-note rounded-2xl border p-3 text-xs leading-6 flex items-start gap-2.5">
            <Store size={16} className="welcome-note-icon shrink-0 mt-1" />
            <span>لا حاجة إلى PIN محلي: يتحقق Google من هويتك، ويقبل التطبيق الحسابات التي أضافها المالك فقط.</span>
          </div>
        </section>
      </main>

      <footer className="relative z-10 px-5 py-3 text-center text-[10px] text-zinc-500">
        {isCheckingSavedSession ? 'جارٍ التحميل والتحقق بأمان…' : 'دخول آمن، سريع، وصلاحيات محددة لكل حساب'}
      </footer>
    </div>
  );
};
