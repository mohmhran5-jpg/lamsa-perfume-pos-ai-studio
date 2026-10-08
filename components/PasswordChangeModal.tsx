import React, { useState } from 'react';
import { AppUser } from '../types';
import { hashPassword } from '../services/authService';
import { Lock, ShieldCheck, AlertCircle, Eye, EyeOff } from 'lucide-react';

interface PasswordChangeModalProps {
  user: AppUser;
  onSuccess: (updatedUser: AppUser) => void;
  onCancel?: () => void;
  isForcedFirstChange?: boolean;
}

const PasswordChangeModal: React.FC<PasswordChangeModalProps> = ({
  user,
  onSuccess,
  onCancel,
  isForcedFirstChange = false
}) => {
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (newPassword.length < 4) {
      setError('كلمة المرور يجب أن لا تقل عن 4 خانات');
      return;
    }

    if (newPassword !== confirmPassword) {
      setError('كلمتا المرور غير متطابقتين');
      return;
    }

    setIsSubmitting(true);
    try {
      const hashed = await hashPassword(newPassword);
      const updated: AppUser = {
        ...user,
        passwordHash: hashed,
        requiresPasswordChange: false, // Flag cleared
      };
      onSuccess(updated);
    } catch (err) {
      console.error(err);
      setError('حدث خطأ أثناء تشفير كلمة المرور، حاول مجدداً');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4 animate-in fade-in duration-200">
      <div className="apple-glass rounded-3xl p-6 sm:p-8 w-full max-w-md border border-white/40 shadow-2xl space-y-6">
        <div className="text-center space-y-2">
          <div className="w-14 h-14 rounded-2xl bg-amber-500/10 border border-amber-500/20 text-amber-600 flex items-center justify-center mx-auto shadow-sm">
            <Lock size={28} />
          </div>
          <h2 className="text-xl font-black text-[#1D1D1F]">
            {isForcedFirstChange ? 'تغيير كلمة المرور الأولية (إلزامي للأمان)' : 'تغيير كلمة المرور'}
          </h2>
          <p className="text-xs text-[#86868B] leading-relaxed">
            {isForcedFirstChange 
              ? `أهلاً بك ${user.displayName}. لحماية الحساب ومطابقة معايير الأمان، يُشترط استبدال الرمز الافتراضي بكلمة مرور سرية جديدة قبل المتابعة.`
              : `تغيير كلمة المرور الخاصة بحساب ${user.displayName}. يتم التشفير التلقائي ولا تُحفظ كنص صريح.`}
          </p>
        </div>

        {error && (
          <div className="p-3 rounded-2xl bg-red-50 border border-red-200 text-red-700 text-xs flex items-center gap-2">
            <AlertCircle size={16} className="shrink-0" />
            <span>{error}</span>
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-1.5">
            <label className="text-xs font-bold text-[#1D1D1F] block text-right">
              كلمة المرور الجديدة:
            </label>
            <div className="relative">
              <input
                type={showPassword ? 'text' : 'password'}
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                placeholder="أدخل كلمة المرور الجديدة..."
                className="w-full h-11 px-4 pr-4 pl-10 rounded-xl bg-white border border-black/[0.08] focus:border-[#0071E3] focus:ring-2 focus:ring-[#0071E3]/20 text-sm font-mono outline-none transition-all text-right"
                autoFocus
                required
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                className="absolute left-3 top-1/2 -translate-y-1/2 text-[#86868B] hover:text-[#1D1D1F]"
              >
                {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
              </button>
            </div>
          </div>

          <div className="space-y-1.5">
            <label className="text-xs font-bold text-[#1D1D1F] block text-right">
              تأكيد كلمة المرور:
            </label>
            <input
              type={showPassword ? 'text' : 'password'}
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              placeholder="أعد إدخال كلمة المرور..."
              className="w-full h-11 px-4 rounded-xl bg-white border border-black/[0.08] focus:border-[#0071E3] focus:ring-2 focus:ring-[#0071E3]/20 text-sm font-mono outline-none transition-all text-right"
              required
            />
          </div>

          <div className="pt-2 flex items-center gap-2">
            {!isForcedFirstChange && onCancel && (
              <button
                type="button"
                onClick={onCancel}
                className="flex-1 h-11 rounded-xl border border-black/[0.08] text-xs font-bold text-[#1D1D1F] hover:bg-black/[0.04]"
              >
                إلغاء
              </button>
            )}
            <button
              type="submit"
              disabled={isSubmitting}
              className="flex-2 h-11 rounded-xl bg-[#0071E3] hover:bg-[#0077ED] text-white text-xs font-bold shadow-sm transition-all flex items-center justify-center gap-2 disabled:opacity-50"
            >
              <ShieldCheck size={16} />
              <span>{isSubmitting ? 'جاري التشفير والحفظ...' : 'حفظ كلمة المرور الجديدة'}</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default PasswordChangeModal;
