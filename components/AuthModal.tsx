import React from 'react';
import { LogOut, ShieldCheck, X } from 'lucide-react';

interface AuthModalProps {
  email: string | null;
  onSignOut: () => void;
  onClose: () => void;
}

const AuthModal: React.FC<AuthModalProps> = ({ email, onSignOut, onClose }) => (
  <div className="fixed inset-0 z-[115] bg-black/50 backdrop-blur-md flex items-center justify-center p-4" dir="rtl">
    <section role="dialog" aria-modal="true" aria-labelledby="auth-modal-title" className="apple-glass rounded-[28px] p-6 sm:p-7 w-full max-w-md border border-black/[0.1] shadow-2xl space-y-5 bg-white/95">
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="w-11 h-11 rounded-2xl bg-[#1D1D1F] text-[#C49746] flex items-center justify-center">
            <ShieldCheck size={21} />
          </div>
          <div>
            <h2 id="auth-modal-title" className="text-base font-black text-[#1D1D1F]">جلسة Google معتمدة</h2>
            <p className="text-xs text-[#86868B]">الهوية والصلاحية مصدرهما حساب Google الموثق</p>
          </div>
        </div>
        <button type="button" onClick={onClose} aria-label="إغلاق" className="w-8 h-8 rounded-full hover:bg-black/[0.06] flex items-center justify-center text-[#86868B]">
          <X size={17} />
        </button>
      </div>

      <div className="rounded-2xl bg-[#F5F5F7] border border-black/[0.06] p-4 space-y-1">
        <div className="text-[10px] text-[#86868B]">الحساب المتحقق منه</div>
        <div dir="ltr" className="text-sm font-bold text-[#1D1D1F] text-right">{email || 'لا توجد جلسة موثقة'}</div>
      </div>

      <p className="text-xs text-[#6E6E73] leading-relaxed">
        لا يمكن تبديل الدور أو منحه بملف محلي أو رمز PIN؛ وصول التشغيل يحتاج منحة نشطة من المالك مرتبطة ببريد Google موثّق ومتحقق منها بقواعد Firestore. سيؤدي تسجيل الخروج إلى إيقاف الوصول السحابي حتى تسجيل الدخول مجدداً.
      </p>

      <div className="flex items-center gap-2">
        <button type="button" onClick={onClose} className="flex-1 h-11 rounded-2xl border border-black/[0.08] text-xs font-bold text-[#1D1D1F] hover:bg-black/[0.04]">
          إغلاق
        </button>
        <button type="button" onClick={onSignOut} className="flex-1 h-11 rounded-2xl bg-rose-600 hover:bg-rose-700 text-white text-xs font-black flex items-center justify-center gap-2">
          <LogOut size={15} />
          <span>تسجيل الخروج</span>
        </button>
      </div>
    </section>
  </div>
);

export default AuthModal;
