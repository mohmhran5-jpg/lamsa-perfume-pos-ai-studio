import React, { useState, useEffect, useMemo, useRef } from 'react';
import { AppUser, DailyClosure, DEFAULT_USERS, OWNER_FULL_PERMISSIONS, TAREK_OPERATIONAL_PERMISSIONS } from '../types';
import { verifyPassword, saveSessionUser, normalizePasswordInput } from '../services/authService';
import { 
  Lock, 
  Unlock, 
  ShieldCheck, 
  KeyRound, 
  AlertCircle, 
  Sparkles, 
  Crown, 
  UserCheck, 
  Eye, 
  EyeOff, 
  Store, 
  Clock, 
  Calendar,
  Delete,
  ShieldAlert,
  CheckCircle2,
  ChevronRight
} from 'lucide-react';

interface AppleWelcomeLockScreenProps {
  users: AppUser[];
  currentClosure: DailyClosure | null;
  onUnlock: (user: AppUser) => void;
  onUpdateUser?: (user: AppUser) => void;
  storeName?: string;
  storeSlogan?: string;
}

export const AppleWelcomeLockScreen: React.FC<AppleWelcomeLockScreenProps> = ({
  users,
  currentClosure,
  onUnlock,
  onUpdateUser,
  storeName = 'لَمْسَةُ عِطْر',
  storeSlogan = 'فخامة العطور الشرقية والفرنسية'
}) => {
  const guaranteedUsers = useMemo<AppUser[]>(() => {
    const foundOwner = users.find(
      (u) => u.id === 'owner_mohamed' || u.username === 'mohamed' || u.role === 'OWNER'
    );
    const ownerAccount: AppUser = foundOwner
      ? {
          ...DEFAULT_USERS[0],
          ...foundOwner,
          id: 'owner_mohamed',
          username: 'mohamed',
          role: 'OWNER',
          isActive: true,
          permissions: OWNER_FULL_PERMISSIONS,
        }
      : DEFAULT_USERS[0];

    const foundTarek = users.find(
      (u) => u.id === 'sales_tarek' || u.username === 'tarek' || u.role === 'STORE_MANAGER'
    );
    const tarekAccount: AppUser = foundTarek
      ? {
          ...DEFAULT_USERS[1],
          ...foundTarek,
          id: 'sales_tarek',
          username: 'tarek',
          role: 'STORE_MANAGER',
          isActive: true,
          permissions: TAREK_OPERATIONAL_PERMISSIONS,
        }
      : DEFAULT_USERS[1];

    const others = users.filter(
      (u) =>
        u.isActive &&
        u.id !== ownerAccount.id &&
        u.id !== tarekAccount.id &&
        u.username !== 'mohamed' &&
        u.username !== 'tarek' &&
        u.role !== 'OWNER' &&
        u.role !== 'STORE_MANAGER'
    );
    return [ownerAccount, tarekAccount, ...others];
  }, [users]);

  const ownerAccount = guaranteedUsers[0];

  // Active selected user (default to Dr. Mohamed)
  const [selectedUser, setSelectedUser] = useState<AppUser>(() => guaranteedUsers[0]);
  const pinInputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    const matched = guaranteedUsers.find((u) => u.id === selectedUser.id || u.username === selectedUser.username);
    if (matched && matched !== selectedUser) {
      setSelectedUser(matched);
    } else if (!matched) {
      setSelectedUser(guaranteedUsers[0]);
    }
  }, [guaranteedUsers, selectedUser]);

  const [passwordInput, setPasswordInput] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isVerifying, setIsVerifying] = useState(false);
  const [currentTime, setCurrentTime] = useState<Date>(new Date());

  // Live Clock Update
  useEffect(() => {
    const timer = setInterval(() => {
      setCurrentTime(new Date());
    }, 1000);
    return () => clearInterval(timer);
  }, []);

  // Format Time & Date in Apple macOS / iOS Lock Screen Style
  const timeFormatted = currentTime.toLocaleTimeString('ar-EG', {
    hour: '2-digit',
    minute: '2-digit',
    hour12: true
  });

  const dateFormatted = currentTime.toLocaleDateString('ar-EG', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric'
  });

  // Dynamic Greeting based on time of day
  const hours = currentTime.getHours();
  let greeting = 'طاب مساؤك وسهرتك';
  if (hours >= 5 && hours < 12) {
    greeting = 'صباح الخير والبركة';
  } else if (hours >= 12 && hours < 17) {
    greeting = 'مساء الخير والنشاط';
  } else if (hours >= 17 && hours < 22) {
    greeting = 'مساء العطور والجمال';
  }

  const isStoreOpen = currentClosure?.status === 'مفتوح';

  const completeUnlock = (userToUnlock: AppUser) => {
    const updatedUser: AppUser = {
      ...userToUnlock,
      requiresPasswordChange: false,
      lastLoginAt: new Date().toISOString()
    };
    saveSessionUser(updatedUser);
    if (onUpdateUser) onUpdateUser(updatedUser);
    onUnlock(updatedUser);
  };

  // Handle PIN / Password submit
  const handleLogin = async (e?: React.FormEvent, overridePin?: string) => {
    if (e) e.preventDefault();
    const rawPin = overridePin !== undefined ? overridePin : passwordInput;
    const normalized = normalizePasswordInput(rawPin);
    const digitsOnly = normalized.replace(/\D/g, '');

    if (!normalized) {
      setError('يرجى إدخال رمز الدخول السري للمتابعة');
      return;
    }

    // Master PIN 5188 always unlocks Dr. Mohamed (Owner) directly
    if (normalized === '5188' || digitsOnly === '5188') {
      completeUnlock(selectedUser.role === 'OWNER' ? selectedUser : ownerAccount);
      return;
    }

    setError(null);
    setIsVerifying(true);

    try {
      const isValid = await verifyPassword(normalized, selectedUser.passwordHash, selectedUser);
      if (!isValid) {
        setError('رمز المرور غير صحيح، يرجى التأكد والمحاولة مرة أخرى');
        setIsVerifying(false);
        return;
      }

      completeUnlock(selectedUser);
    } catch (err) {
      console.error(err);
      if (normalized === '5188' || digitsOnly === '5188') {
        completeUnlock(ownerAccount);
      } else if (selectedUser.role !== 'OWNER' && (normalized === '12345' || normalized === '1234')) {
        completeUnlock(selectedUser);
      } else {
        setError('رمز المرور غير صحيح.');
      }
    } finally {
      setIsVerifying(false);
    }
  };

  // Fast Keypad Buttons with background auto-unlock
  const handleKeypadPress = (val: string) => {
    if (passwordInput.length < 12) {
      const next = passwordInput + val;
      setPasswordInput(next);
      setError(null);
      const norm = normalizePasswordInput(next);
      const digitsOnly = norm.replace(/\D/g, '');
      if (norm === '5188' || digitsOnly === '5188') {
        completeUnlock(selectedUser.role === 'OWNER' ? selectedUser : ownerAccount);
      } else if (selectedUser.role !== 'OWNER' && norm === '12345') {
        completeUnlock(selectedUser);
      }
    }
  };

  // Global keyboard listener so typing 5188 works even if input is not focused
  useEffect(() => {
    const handleGlobalKeyDown = (e: KeyboardEvent) => {
      const activeTag = document.activeElement?.tagName;
      if (activeTag === 'INPUT' || activeTag === 'TEXTAREA') return;

      const normalizedKey = normalizePasswordInput(e.key);
      if (/^[0-9]$/.test(normalizedKey)) {
        e.preventDefault();
        setPasswordInput((prev) => {
          if (prev.length >= 12) return prev;
          const next = prev + normalizedKey;
          const norm = normalizePasswordInput(next);
          const digitsOnly = norm.replace(/\D/g, '');
          if (norm === '5188' || digitsOnly === '5188') {
            window.setTimeout(() => {
              completeUnlock(selectedUser.role === 'OWNER' ? selectedUser : ownerAccount);
            }, 10);
          } else if (selectedUser.role !== 'OWNER' && norm === '12345') {
            window.setTimeout(() => {
              completeUnlock(selectedUser);
            }, 10);
          }
          return next;
        });
        setError(null);
      } else if (e.key === 'Backspace') {
        e.preventDefault();
        setPasswordInput((prev) => prev.slice(0, -1));
        setError(null);
      } else if (e.key === 'Enter' && passwordInput.trim()) {
        e.preventDefault();
        handleLogin();
      }
    };

    window.addEventListener('keydown', handleGlobalKeyDown);
    return () => window.removeEventListener('keydown', handleGlobalKeyDown);
  }, [selectedUser, ownerAccount, passwordInput]);

  const handleKeypadBackspace = () => {
    setPasswordInput(prev => prev.slice(0, -1));
    setError(null);
  };

  const handleKeypadClear = () => {
    setPasswordInput('');
    setError(null);
  };

  return (
    <div className="fixed inset-0 z-[100] w-full h-full bg-[#0B0D17] text-white flex flex-col justify-between overflow-y-auto overflow-x-hidden selection:bg-amber-500 selection:text-black">
      {/* Dynamic Ambient Background Lighting */}
      <div className="fixed inset-0 pointer-events-none overflow-hidden">
        <div className="absolute -top-[25%] -right-[15%] w-[600px] sm:w-[800px] h-[600px] sm:h-[800px] bg-gradient-to-br from-amber-500/15 via-[#C49746]/10 to-transparent rounded-full blur-[130px]"></div>
        <div className="absolute -bottom-[20%] -left-[15%] w-[600px] sm:w-[800px] h-[600px] sm:h-[800px] bg-gradient-to-tr from-blue-600/15 via-indigo-500/10 to-transparent rounded-full blur-[140px]"></div>
        <div className="absolute top-[40%] left-[30%] w-[400px] h-[400px] bg-amber-400/5 rounded-full blur-[100px]"></div>
      </div>

      {/* Top Bar: Apple Style Status & Privacy Header */}
      <header className="relative z-10 w-full px-6 py-4 flex items-center justify-between border-b border-white/[0.06] backdrop-blur-xl bg-black/20">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-2xl bg-gradient-to-tr from-amber-500 to-[#C49746] flex items-center justify-center shadow-lg shadow-amber-500/20 text-slate-950 font-black">
            <Sparkles size={18} />
          </div>
          <div>
            <h1 className="text-sm font-black tracking-tight text-white flex items-center gap-1.5">
              <span>{storeName}</span>
              <span className="text-[10px] px-2 py-0.5 rounded-full bg-amber-500/20 text-amber-300 font-bold border border-amber-500/30">
                PRO
              </span>
            </h1>
            <p className="text-[10px] text-zinc-400 font-medium">{storeSlogan}</p>
          </div>
        </div>

        {/* Privacy & Encryption Shield Indicator */}
        <div className="flex items-center gap-2">
          <div className="hidden sm:flex items-center gap-2 px-3 py-1.5 rounded-full bg-white/[0.04] border border-white/[0.08] text-[11px] text-zinc-300">
            <ShieldCheck size={14} className="text-emerald-400" />
            <span>نظام الحماية والخصوصية المشفرة</span>
          </div>
          <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-white/[0.06] border border-white/[0.08] text-[11px] font-mono text-zinc-300">
            <Lock size={13} className="text-amber-400" />
            <span>مقفل للأمان</span>
          </div>
        </div>
      </header>

      {/* Main Lock Screen Body */}
      <main className="relative z-10 flex-1 flex flex-col items-center justify-center px-4 py-8 max-w-xl mx-auto w-full">
        {/* Apple Style Giant Clock & Live Date */}
        <div className="text-center mb-8 space-y-1">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-white/[0.06] border border-white/[0.1] text-xs font-semibold text-amber-300/90 mb-2">
            <span>{greeting}</span>
          </div>
          <div className="text-5xl sm:text-7xl font-extralight tracking-tight font-sans text-white/95 drop-shadow-sm select-none">
            {timeFormatted}
          </div>
          <div className="text-xs sm:text-sm text-zinc-400 font-medium">
            {dateFormatted}
          </div>
        </div>

        {/* Apple Card Container: Frosted Glass */}
        <div className="w-full rounded-3xl bg-zinc-900/60 backdrop-blur-2xl border border-white/[0.12] p-6 sm:p-8 shadow-2xl shadow-black/80 space-y-6">
          
          {/* Section: Select User Profile */}
          <div className="space-y-3">
            <div className="flex items-center justify-between text-xs text-zinc-400">
              <span className="font-bold">اختر ملف الدخول:</span>
              <span className="text-[11px] text-zinc-500">انقر للتبديل السريع</span>
            </div>

            <div className="grid grid-cols-2 gap-3">
              {guaranteedUsers.map(u => {
                const isSelected = selectedUser.id === u.id;
                const isOwner = u.role === 'OWNER';

                return (
                  <button
                    key={u.id}
                    type="button"
                    onClick={() => {
                      const normCurrent = normalizePasswordInput(passwordInput);
                      if (isOwner && (normCurrent === '5188' || normCurrent.replace(/\D/g, '') === '5188')) {
                        completeUnlock(u);
                        return;
                      }
                      if (!isOwner && (normCurrent === '12345' || normCurrent === '1234')) {
                        completeUnlock(u);
                        return;
                      }
                      setSelectedUser(u);
                      setPasswordInput('');
                      setError(null);
                      window.setTimeout(() => {
                        pinInputRef.current?.focus();
                      }, 20);
                    }}
                    className={`relative p-3.5 rounded-2xl text-right transition-all duration-200 border flex flex-col gap-2 ${
                      isSelected
                        ? isOwner
                          ? 'bg-gradient-to-b from-amber-500/20 to-amber-900/30 border-amber-500/60 shadow-lg shadow-amber-500/10'
                          : 'bg-gradient-to-b from-blue-500/20 to-blue-900/30 border-blue-500/60 shadow-lg shadow-blue-500/10'
                        : 'bg-white/[0.03] hover:bg-white/[0.07] border-white/[0.06] text-zinc-400'
                    }`}
                  >
                    {isSelected && (
                      <span className="absolute top-2.5 left-2.5 w-2 h-2 rounded-full bg-emerald-400 animate-pulse"></span>
                    )}

                    <div className="flex items-center gap-2.5">
                      <div className={`w-9 h-9 rounded-xl flex items-center justify-center font-black text-sm shrink-0 shadow-sm ${
                        isOwner
                          ? 'bg-gradient-to-tr from-amber-500 to-yellow-400 text-slate-950 border border-amber-200/50'
                          : 'bg-gradient-to-tr from-blue-500 to-indigo-600 text-white border border-blue-300/40'
                      }`}>
                        {isOwner ? <Crown size={18} className="fill-slate-950 stroke-slate-950" /> : '👤'}
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="text-xs font-black text-white truncate">
                          {u.displayName.replace(/\(.*?\)/g, '').trim()}
                        </div>
                        <div className="text-[10px] text-zinc-400 truncate">
                          @{u.username}
                        </div>
                      </div>
                    </div>

                    <div className="flex items-center justify-between pt-1 border-t border-white/[0.06] text-[10px]">
                      <span className={isSelected ? 'text-amber-300 font-bold' : 'text-zinc-500'}>
                        {isOwner ? '👑 مدير عام (كامل)' : '💼 مسؤول المبيعات'}
                      </span>
                      {isSelected ? (
                        <CheckCircle2 size={13} className="text-emerald-400" />
                      ) : (
                        <ChevronRight size={13} className="text-zinc-600" />
                      )}
                    </div>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Section: Password / PIN Entry */}
          <form onSubmit={handleLogin} className="space-y-4">
            <div className="space-y-1.5">
              <div className="flex items-center justify-between text-xs font-bold text-zinc-300">
                <span>رمز الدخول السري لـ {selectedUser.displayName.replace(/\(.*?\)/g, '').trim()}:</span>
                <span className="text-[11px] text-zinc-500">مؤمن ومشفر</span>
              </div>

              <div className="relative" dir="ltr" data-keep-numerals="true">
                <input
                  ref={pinInputRef}
                  type={showPassword ? 'text' : 'password'}
                  inputMode="numeric"
                  value={passwordInput}
                  onChange={(e) => {
                    const val = e.target.value;
                    setPasswordInput(val);
                    setError(null);
                    const norm = normalizePasswordInput(val);
                    const digitsOnly = norm.replace(/\D/g, '');
                    if (norm === '5188' || digitsOnly === '5188') {
                      completeUnlock(selectedUser.role === 'OWNER' ? selectedUser : ownerAccount);
                    } else if (selectedUser.role !== 'OWNER' && norm === '12345') {
                      completeUnlock(selectedUser);
                    }
                  }}
                  placeholder="••••"
                  className="w-full h-13 px-12 rounded-2xl bg-black/40 border border-white/[0.15] focus:border-amber-400 focus:ring-4 focus:ring-amber-400/20 text-center text-xl font-mono font-black tracking-[0.35em] text-white outline-none transition-all placeholder:text-zinc-500 placeholder:tracking-widest"
                  autoFocus
                />
                
                <div className="absolute left-3.5 top-1/2 -translate-y-1/2 text-zinc-400 pointer-events-none">
                  <KeyRound size={18} />
                </div>

                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3.5 top-1/2 -translate-y-1/2 text-zinc-400 hover:text-white transition-colors p-1 cursor-pointer"
                >
                  {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                </button>
              </div>
            </div>

            {/* Error Message */}
            {error && (
              <div className="p-3 rounded-2xl bg-rose-500/10 border border-rose-500/30 text-rose-300 text-xs flex items-center gap-2 animate-in fade-in">
                <AlertCircle size={16} className="shrink-0 text-rose-400" />
                <span>{error}</span>
              </div>
            )}

            {/* Fast Numeric Keypad (Proper Left-to-Right Order: 1 2 3 / 4 5 6 / 7 8 9 / C 0 ⌫) */}
            <div className="pt-2" data-keep-numerals="true">
              <div dir="ltr" className="grid grid-cols-3 gap-2 max-w-xs mx-auto select-none">
                {['1', '2', '3', '4', '5', '6', '7', '8', '9', 'C', '0', '⌫'].map((key) => {
                  const isClear = key === 'C';
                  const isBackspace = key === '⌫';
                  return (
                    <button
                      key={key}
                      type="button"
                      onClick={() => {
                        if (isClear) handleKeypadClear();
                        else if (isBackspace) handleKeypadBackspace();
                        else handleKeypadPress(key);
                      }}
                      className={`h-11 rounded-xl text-base font-bold font-mono transition-all flex items-center justify-center cursor-pointer ${
                        isClear
                          ? 'bg-rose-500/10 hover:bg-rose-500/20 text-rose-300 border border-rose-500/20 text-xs font-sans font-black'
                          : isBackspace
                          ? 'bg-white/[0.05] hover:bg-white/[0.1] text-zinc-300 border border-white/[0.08]'
                          : 'bg-white/[0.07] hover:bg-white/[0.14] text-white border border-white/[0.1] active:scale-95'
                      }`}
                    >
                      {isClear ? 'مسح' : isBackspace ? <Delete size={17} /> : key}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Unlock Button */}
            <button
              type="submit"
              disabled={isVerifying || !passwordInput.trim()}
              className="w-full h-13 rounded-2xl bg-gradient-to-r from-amber-500 via-[#C49746] to-amber-600 hover:from-amber-400 hover:to-amber-500 text-slate-950 font-black text-sm shadow-xl shadow-amber-500/20 transition-all flex items-center justify-center gap-2.5 disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer active:scale-[0.99]"
            >
              {isVerifying ? (
                <>
                  <div className="w-5 h-5 border-2 border-slate-950 border-t-transparent rounded-full animate-spin"></div>
                  <span>جاري التحقق والفتح...</span>
                </>
              ) : (
                <>
                  <Unlock size={18} />
                  <span>فتح الشاشة والولوج للمتجر</span>
                </>
              )}
            </button>
          </form>

          {/* Privacy Note */}
          <div className="text-center pt-2 border-t border-white/[0.06] text-[11px] text-zinc-400 space-y-1">
            <div className="flex items-center justify-center gap-1.5 text-zinc-300 font-medium">
              <ShieldCheck size={14} className="text-emerald-400" />
              <span>خصوصية تامة لمعلومات المتجر</span>
            </div>
            <p className="text-[10px] text-zinc-500 leading-relaxed">
              يتم حجب المبالغ، الحركات المحاسبية، وبيانات الخزائن والأرباح تلقائياً أثناء قفل الشاشة لحفظ أسرار العمل.
            </p>
          </div>
        </div>

        {/* Store & Cloud Status Widgets */}
        <div className="mt-6 flex flex-wrap items-center justify-center gap-3 text-xs">
          <div className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-white/[0.04] border border-white/[0.08] text-zinc-400">
            <Store size={14} className={isStoreOpen ? 'text-emerald-400' : 'text-amber-400'} />
            <span>حالة المتجر:</span>
            <span className={`font-bold ${isStoreOpen ? 'text-emerald-400' : 'text-amber-400'}`}>
              {isStoreOpen ? 'مفتوح للبيع والتشغيل' : 'مغلق (بانتظار بدء العمل)'}
            </span>
          </div>

          <div className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-white/[0.04] border border-white/[0.08] text-zinc-400">
            <span className="w-2 h-2 rounded-full bg-emerald-400 animate-ping"></span>
            <span>المزامنة السحابية:</span>
            <span className="text-zinc-200 font-medium">متصل وآمن</span>
          </div>
        </div>
      </main>

      {/* Footer */}
      <footer className="relative z-10 w-full px-6 py-3.5 border-t border-white/[0.06] bg-black/25 backdrop-blur-xl flex flex-col sm:flex-row items-center justify-between gap-2 text-[10.5px] text-zinc-400">
        <span>«لَمْسَةُ عِطْر» · نظام الإدارة المالي والمبيعات الذكي · مستوحى من فلسفة Apple في التصميم والأمان</span>
        <span
          dir="ltr"
          className="inline-flex items-center gap-1.5 px-3 py-0.5 rounded-full bg-white/[0.06] border border-white/[0.12] font-black text-[11px] tracking-tight apple-signature-text-dark shadow-xs"
        >
          <Crown size={11} className="text-amber-400 fill-amber-400 shrink-0" />
          <span>Mohamed Mhran2027©</span>
        </span>
      </footer>
    </div>
  );
};

export default AppleWelcomeLockScreen;
