import React, { useEffect, useState } from 'react';
import {
  AlertCircle,
  CheckCircle2,
  Clock,
  CloudOff,
  Crown,
  LoaderCircle,
  Lock,
  LogIn,
  LogOut,
  Send,
  ShieldCheck,
  Sparkles,
} from 'lucide-react';

export type StoreAuthStatus = 'checking' | 'signed_out' | 'unauthorized' | 'error' | 'ready';
export type AccessRequestStatus = 'none' | 'pending' | 'approved' | 'dismissed';

interface AppleWelcomeLockScreenProps {
  authStatus: StoreAuthStatus;
  authEmail: string | null;
  authError: string | null;
  isSigningIn: boolean;
  isCloudConnected: boolean;
  cloudMessage: string;
  accessRequestStatus: AccessRequestStatus;
  isSubmittingAccessRequest: boolean;
  isCheckingAccessRequest: boolean;
  onGoogleSignIn: () => void;
  onRequestAccess: () => void;
  onCheckAccess: () => void;
  onLogout: () => void;
  onUnlock: () => void;
  storeName?: string;
  storeSlogan?: string;
}

export const AppleWelcomeLockScreen: React.FC<AppleWelcomeLockScreenProps> = ({
  authStatus,
  authEmail,
  authError,
  isSigningIn,
  isCloudConnected,
  cloudMessage,
  accessRequestStatus,
  isSubmittingAccessRequest,
  isCheckingAccessRequest,
  onGoogleSignIn,
  onRequestAccess,
  onCheckAccess,
  onLogout,
  onUnlock,
  storeName = 'لَمْسَةُ عِطْر',
  storeSlogan = 'فخامة العطور الشرقية والفرنسية',
}) => {
  const [currentTime, setCurrentTime] = useState<Date>(new Date());
  useEffect(() => {
    const timer = window.setInterval(() => setCurrentTime(new Date()), 1000);
    return () => window.clearInterval(timer);
  }, []);

  const authenticated = authStatus === 'ready' && Boolean(authEmail);
  const timeFormatted = currentTime.toLocaleTimeString('ar-EG', {
    hour: '2-digit', minute: '2-digit', hour12: true,
  });
  const dateFormatted = currentTime.toLocaleDateString('ar-EG', {
    weekday: 'long', day: 'numeric', month: 'long', year: 'numeric',
  });

  return (
    <div dir="rtl" className="fixed inset-0 z-[120] min-h-screen overflow-y-auto bg-[#0B0D17] text-white flex flex-col justify-between">
      <div className="fixed inset-0 pointer-events-none overflow-hidden" aria-hidden="true">
        <div className="absolute -top-[25%] -right-[15%] w-[600px] h-[600px] bg-gradient-to-br from-amber-500/15 via-[#C49746]/10 to-transparent rounded-full blur-[130px]" />
        <div className="absolute -bottom-[20%] -left-[15%] w-[600px] h-[600px] bg-gradient-to-tr from-blue-600/15 via-indigo-500/10 to-transparent rounded-full blur-[140px]" />
      </div>

      <header className="relative z-10 w-full px-6 py-4 flex items-center justify-between border-b border-white/[0.06] backdrop-blur-xl bg-black/20">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-2xl bg-gradient-to-tr from-amber-500 to-[#C49746] flex items-center justify-center text-slate-950">
            <Sparkles size={18} />
          </div>
          <div>
            <h1 className="text-sm font-black tracking-tight">{storeName}</h1>
            <p className="text-[10px] text-zinc-400">{storeSlogan}</p>
          </div>
        </div>
        <div className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-white/[0.05] border border-white/[0.08] text-[11px] text-zinc-300">
          <Lock size={13} className="text-amber-400" />
          <span>{authenticated ? 'قفل محلي للخصوصية' : 'يتطلب التحقق من الهوية'}</span>
        </div>
      </header>

      <main className="relative z-10 flex-1 flex flex-col items-center justify-center px-4 py-8 max-w-xl mx-auto w-full">
        <div className="text-center mb-8 space-y-1">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-white/[0.06] border border-white/[0.1] text-xs font-semibold text-amber-300/90 mb-2">
            <Crown size={14} />
            <span>بوابة الدخول الآمن</span>
          </div>
          <div className="text-5xl sm:text-7xl font-extralight tracking-tight text-white/95">{timeFormatted}</div>
          <div className="text-xs sm:text-sm text-zinc-400 font-medium">{dateFormatted}</div>
        </div>

        <section className="w-full rounded-3xl bg-zinc-900/70 backdrop-blur-2xl border border-white/[0.12] p-6 sm:p-8 shadow-2xl shadow-black/80 space-y-5">
          <div className="text-center space-y-2">
            <div className="w-14 h-14 rounded-2xl bg-white/[0.06] border border-white/[0.1] flex items-center justify-center mx-auto">
              {authenticated ? <ShieldCheck size={27} className="text-emerald-400" /> : <Lock size={25} className="text-amber-400" />}
            </div>
            <h2 className="text-lg font-black">
              {authenticated
                ? 'تم التحقق من حساب Google'
                : authStatus === 'unauthorized' && authEmail
                ? 'الحساب موثّق لكنه غير ممنوح'
                : 'تسجيل الدخول مطلوب'}
            </h2>
            <p className="text-xs text-zinc-400 leading-relaxed">
              {authenticated
                ? 'تم فتح الجلسة باستخدام هوية Firebase الموثقة. القفل هنا حاجب محلي للواجهة فقط، وليس وسيلة مصادقة.'
                : authStatus === 'unauthorized' && authEmail
                ? 'لا توجد صلاحية تشغيلية لهذا البريد الآن. يمكنك إرسال طلب للمالك؛ لن يمنح الطلب أي دور تلقائياً، ولن تظهر بيانات المتجر قبل موافقته.'
                : 'الدخول متاح للمالك أو لأي بريد Google موثّق يمنحه المالك مساحة التشغيل. لا تمنح الأدوار المحلية أو بيانات الجلسة صلاحية.'}
            </p>
          </div>

          {(authenticated || authStatus === 'unauthorized') && authEmail && (
            <div className={`rounded-2xl border px-4 py-3 text-center ${authenticated ? 'border-emerald-400/20 bg-emerald-400/[0.06]' : 'border-amber-400/20 bg-amber-400/[0.06]'}`}>
              <div className="text-[10px] text-zinc-400 mb-1">هوية Firebase الحالية</div>
              <div dir="ltr" className={`text-sm font-bold ${authenticated ? 'text-emerald-200' : 'text-amber-200'}`}>{authEmail}</div>
            </div>
          )}

          {authStatus === 'checking' && !authenticated && (
            <div role="status" className="flex items-center justify-center gap-2 text-xs text-zinc-300">
              <LoaderCircle size={16} className="animate-spin text-amber-400" />
              <span>جارٍ التحقق من جلسة Firebase…</span>
            </div>
          )}

          {authError && !authenticated && (
            <div role="alert" className="p-3 rounded-2xl bg-rose-500/10 border border-rose-500/30 text-rose-200 text-xs flex items-start gap-2">
              <AlertCircle size={16} className="shrink-0 mt-0.5" />
              <span>{authError}</span>
            </div>
          )}

          {authenticated ? (
            <button
              type="button"
              onClick={onUnlock}
              className="w-full h-12 rounded-2xl bg-gradient-to-r from-amber-500 via-[#C49746] to-amber-600 hover:from-amber-400 hover:to-amber-500 text-slate-950 font-black text-sm shadow-xl shadow-amber-500/20 transition-all flex items-center justify-center gap-2"
            >
              <ShieldCheck size={17} />
              <span>استئناف الجلسة على هذا الجهاز</span>
            </button>
          ) : authStatus === 'unauthorized' && authEmail ? (
            <div className="space-y-3">
              {accessRequestStatus === 'pending' && (
                <div className="rounded-2xl border border-amber-400/25 bg-amber-400/[0.07] p-4 text-center">
                  <div className="flex items-center justify-center gap-2 text-sm font-black text-amber-200">
                    <Clock size={16} /> طلب الوصول قيد مراجعة المالك
                  </div>
                  <p className="mt-2 text-xs leading-5 text-zinc-400">لن تتاح واجهة التشغيل حتى يختار المالك دوراً ويعتمده.</p>
                  <button
                    type="button"
                    onClick={onCheckAccess}
                    disabled={isCheckingAccessRequest}
                    className="mt-3 inline-flex h-10 items-center justify-center gap-2 rounded-xl bg-amber-400 px-4 text-xs font-black text-slate-950 disabled:opacity-50"
                  >
                    {isCheckingAccessRequest ? <LoaderCircle size={15} className="animate-spin" /> : <ShieldCheck size={15} />}
                    تحقق من الموافقة
                  </button>
                </div>
              )}
              {accessRequestStatus === 'approved' && (
                <div className="rounded-2xl border border-emerald-400/25 bg-emerald-400/[0.07] p-4 text-center text-xs text-emerald-200">
                  تمت مراجعة الطلب؛ اضغط للتحقق من المنحة النشطة.
                  <button type="button" onClick={onCheckAccess} disabled={isCheckingAccessRequest} className="mt-3 flex h-10 w-full items-center justify-center gap-2 rounded-xl bg-emerald-400 px-4 font-black text-slate-950 disabled:opacity-50">
                    {isCheckingAccessRequest ? <LoaderCircle size={15} className="animate-spin" /> : <ShieldCheck size={15} />}
                    فتح الجلسة بعد التحقق
                  </button>
                </div>
              )}
              {accessRequestStatus === 'dismissed' && (
                <p className="rounded-xl border border-white/10 bg-white/[0.04] p-3 text-center text-xs text-zinc-300">أُغلق الطلب السابق دون منح صلاحية. يمكنك إرسال طلب جديد.</p>
              )}
              {(accessRequestStatus === 'none' || accessRequestStatus === 'dismissed') && (
                <button
                  type="button"
                  onClick={onRequestAccess}
                  disabled={isSubmittingAccessRequest}
                  className="w-full h-12 rounded-2xl bg-gradient-to-r from-amber-500 via-[#C49746] to-amber-600 text-slate-950 font-black text-sm disabled:opacity-50 flex items-center justify-center gap-2"
                >
                  {isSubmittingAccessRequest ? <LoaderCircle size={17} className="animate-spin" /> : <Send size={16} />}
                  {isSubmittingAccessRequest ? 'جارٍ إرسال الطلب…' : 'طلب صلاحية من المالك'}
                </button>
              )}
              <button type="button" onClick={onLogout} className="w-full rounded-xl border border-white/10 px-4 py-2.5 text-xs font-bold text-zinc-300 hover:bg-white/[0.05] flex items-center justify-center gap-2">
                <LogOut size={14} /> تبديل حساب Google
              </button>
            </div>
          ) : (
            <button
              type="button"
              onClick={onGoogleSignIn}
              disabled={isSigningIn}
              className="w-full h-12 rounded-2xl bg-white hover:bg-zinc-100 disabled:opacity-50 text-[#1D1D1F] font-black text-sm transition-all flex items-center justify-center gap-2"
            >
              {isSigningIn ? <LoaderCircle size={17} className="animate-spin" /> : <LogIn size={17} />}
              <span>{isSigningIn ? 'جارٍ فتح تسجيل Google…' : 'المتابعة باستخدام Google'}</span>
            </button>
          )}

          <div className="pt-3 border-t border-white/[0.07] text-[11px] text-zinc-400 space-y-2">
            <div className="flex items-center justify-center gap-2">
              {isCloudConnected ? <CheckCircle2 size={14} className="text-emerald-400" /> : <CloudOff size={14} className="text-amber-400" />}
              <span className={isCloudConnected ? 'text-emerald-300' : 'text-amber-200'}>{cloudMessage}</span>
            </div>
            <p className="text-center text-[10px] text-zinc-500 leading-relaxed">
              {isCloudConnected
                ? 'تم تأكيد الاتصال السحابي حالياً.'
                : 'لا تُعد البيانات المحلية مزامنة سحابية مؤكدة؛ عند رفض Firestore ستظل العملية محلية فقط.'}
            </p>
          </div>
        </section>

        <div className="mt-5 flex items-center gap-2 text-[11px] text-zinc-500">
          <Clock size={13} />
              <span>مصادقة الأدوار المعتمدة: Firebase Authentication · Google · بريد موثّق</span>
        </div>
      </main>

      <footer className="relative z-10 w-full px-6 py-3.5 border-t border-white/[0.06] bg-black/25 backdrop-blur-xl text-center text-[10px] text-zinc-500">
        «لَمْسَةُ عِطْر» · الدخول المحلي لا يمنح صلاحية سحابية
      </footer>
    </div>
  );
};

export default AppleWelcomeLockScreen;
