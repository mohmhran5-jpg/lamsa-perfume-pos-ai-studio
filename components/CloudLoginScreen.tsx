import React, { useState } from 'react';
import { signInWithGoogle, logout, AUTHORIZED_OWNER_EMAILS } from '../services/firebase';
import { ShieldCheck, Sparkles, LogIn, LogOut, AlertCircle, Crown, Lock, UserX } from 'lucide-react';
import { auth } from '../services/firebase';

interface CloudLoginScreenProps {
  onSuccess: () => void;
}

export const CloudLoginScreen: React.FC<CloudLoginScreenProps> = ({ onSuccess }) => {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const currentFirebaseUser = auth.currentUser;

  const handleGoogleLogin = async () => {
    setLoading(true);
    setError(null);
    try {
      const user = await signInWithGoogle();
      if (user.email && AUTHORIZED_OWNER_EMAILS.includes(user.email.toLowerCase())) {
        onSuccess();
      } else {
        setError('عذراً، هذا الحساب غير مصرح له بالوصول إلى بيانات الإدارة السحابية في هذه المرحلة.');
      }
    } catch (err: any) {
      if (err.code === 'auth/popup-closed-by-user') {
        setError('تم إغلاق نافذة تسجيل الدخول قبل إتمام العملية.');
      } else {
        setError('حدث خطأ أثناء تسجيل الدخول. يرجى المحاولة مرة أخرى.');
      }
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const handleLogout = async () => {
    setLoading(true);
    try {
      await logout();
      setError(null);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[200] bg-[#0B0D17] text-white flex flex-col items-center justify-center p-4">
      {/* Background Image with Overlay */}
      <div className="fixed inset-0 pointer-events-none">
        <img 
          src="https://images.unsplash.com/photo-1541643600914-78b084683601?auto=format&fit=crop&q=80&w=1920" 
          alt="Background" 
          className="w-full h-full object-cover opacity-40 scale-105 animate-pulse-slow"
        />
        <div className="absolute inset-0 bg-gradient-to-b from-[#0B0D17]/60 via-[#0B0D17]/80 to-[#0B0D17]"></div>
      </div>

      <div className="relative z-10 w-full max-w-md apple-glass rounded-[32px] p-8 border border-white/10 shadow-[0_32px_64px_-16px_rgba(0,0,0,0.6)] space-y-8 text-center bg-white/[0.03] backdrop-blur-[40px]">
        <div className="space-y-6">
          <div className="relative inline-block">
            <div className="absolute inset-0 bg-amber-500/20 blur-2xl rounded-full"></div>
            <img 
              src="/store-logo.png" 
              alt="Lamsat Etr Logo" 
              className="w-24 h-24 relative z-10 mx-auto drop-shadow-2xl"
              onError={(e) => {
                // Fallback if logo is missing
                e.currentTarget.style.display = 'none';
                const parent = e.currentTarget.parentElement;
                if (parent) {
                  const div = document.createElement('div');
                  div.className = "w-20 h-20 rounded-3xl bg-gradient-to-tr from-amber-500 to-[#C49746] flex items-center justify-center mx-auto shadow-xl shadow-amber-500/20";
                  div.innerHTML = '<svg xmlns="http://www.w3.org/2000/svg" width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="text-slate-950"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10"/></svg>';
                  parent.appendChild(div);
                }
              }}
            />
          </div>
          <div className="space-y-2">
            <h1 className="text-3xl font-black tracking-tight bg-gradient-to-b from-white to-white/60 bg-clip-text text-transparent">
              لمسة عطر
            </h1>
            <p className="text-zinc-400 text-sm font-medium">
              الولوج السحابي الآمن لمنصة الإدارة
            </p>
          </div>
        </div>

        {error && (
          <div className="p-4 rounded-2xl bg-rose-500/10 border border-rose-500/20 text-rose-300 text-xs flex items-center gap-3 animate-in fade-in zoom-in-95">
            <AlertCircle size={18} className="shrink-0 text-rose-400" />
            <div className="text-right space-y-2">
               <p className="leading-relaxed font-bold">{error}</p>
               {currentFirebaseUser && (
                 <p className="text-[10px] opacity-80">أنت مسجل حالياً كـ: {currentFirebaseUser.email}</p>
               )}
            </div>
          </div>
        )}

        <div className="space-y-4">
          {!currentFirebaseUser || error ? (
            <button
              onClick={handleGoogleLogin}
              disabled={loading}
              className="w-full h-14 rounded-2xl bg-white text-black font-black text-sm flex items-center justify-center gap-3 hover:bg-zinc-100 transition-all active:scale-[0.98] disabled:opacity-50 disabled:cursor-not-allowed shadow-lg"
            >
              {loading ? (
                <div className="w-5 h-5 border-2 border-black border-t-transparent rounded-full animate-spin"></div>
              ) : (
                <>
                  <LogIn size={20} />
                  <span>{currentFirebaseUser ? 'تبديل الحساب' : 'تسجيل الدخول عبر Google'}</span>
                </>
              )}
            </button>
          ) : (
            <div className="p-4 rounded-2xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-300 text-xs flex items-center justify-between gap-3">
               <div className="flex items-center gap-2">
                  <ShieldCheck size={16} />
                  <span>متصل كـ: {currentFirebaseUser.email}</span>
               </div>
               <button onClick={handleLogout} className="p-2 hover:bg-white/10 rounded-lg transition-colors">
                  <LogOut size={16} />
               </button>
            </div>
          )}

          {currentFirebaseUser && error && (
            <button
              onClick={handleLogout}
              disabled={loading}
              className="w-full h-12 rounded-2xl border border-white/10 text-white font-bold text-xs flex items-center justify-center gap-2 hover:bg-white/5 transition-all"
            >
              <LogOut size={16} />
              <span>تسجيل الخروج والتبديل</span>
            </button>
          )}

          <div className="pt-4 flex flex-col gap-2">
            <div className="flex items-center justify-center gap-2 text-[11px] text-zinc-500">
              <Lock size={12} />
              <span>اتصال مشفر وآمن 256-bit</span>
            </div>
            <p className="text-[10px] text-zinc-600 px-4 leading-relaxed">
              هذه الخطوة تضمن حماية البيانات المالية والتشغيلية من الوصول غير المصرح به حتى في حال فقدان الجهاز.
            </p>
          </div>
        </div>

        <div className="pt-6 border-t border-white/5 flex items-center justify-center gap-2 opacity-50">
           <Crown size={14} className="text-amber-500" />
           <span className="text-[10px] font-bold tracking-widest uppercase">Lamsat Etr Secure Cloud</span>
        </div>
      </div>
    </div>
  );
};
