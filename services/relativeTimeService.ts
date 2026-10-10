// ========================================================
// RELATIVE TIME SALE TRACKER SERVICE (محرك تتبع وقت بيع الفواتير الحي)
// يظهر بدقة: الآن (منذ لحظات)، منذ دقيقة، منذ ساعة، أمس، منذ يومين، إلخ
// ========================================================

export interface FormattedSaleRelativeTime {
  label: string;
  formattedDate: string;
  formattedTime: string;
  badgeClass: string;
  isRecent: boolean;
  isToday: boolean;
  isYesterday: boolean;
  iconType: 'zap' | 'timer' | 'clock' | 'history' | 'calendar';
}

export const getSaleRelativeTime = (dateStr: string): FormattedSaleRelativeTime => {
  const saleDate = new Date(dateStr);
  if (isNaN(saleDate.getTime())) {
    return {
      label: 'غير محدد',
      formattedDate: dateStr,
      formattedTime: '',
      badgeClass: 'bg-slate-100 dark:bg-white/10 text-slate-600 dark:text-slate-300 border-slate-200',
      isRecent: false,
      isToday: false,
      isYesterday: false,
      iconType: 'calendar',
    };
  }

  const now = new Date();
  const diffMs = now.getTime() - saleDate.getTime();
  const diffSec = Math.max(0, Math.floor(diffMs / 1000));
  const diffMin = Math.floor(diffSec / 60);
  const diffHours = Math.floor(diffMin / 60);
  const diffDays = Math.floor(diffHours / 24);

  const formattedDate = saleDate.toLocaleDateString('ar-EG', { year: 'numeric', month: 'numeric', day: 'numeric' });
  const formattedTime = saleDate.toLocaleTimeString('ar-EG', { hour: '2-digit', minute: '2-digit', hour12: true });

  const todayStr = now.toISOString().slice(0, 10);
  const yesterdayDate = new Date(now);
  yesterdayDate.setDate(now.getDate() - 1);
  const yesterdayStr = yesterdayDate.toISOString().slice(0, 10);
  const saleIso = dateStr.slice(0, 10);

  const isToday = saleIso === todayStr;
  const isYesterday = saleIso === yesterdayStr;

  // 1. Right now (< 60s)
  if (diffSec < 60) {
    return {
      label: 'الآن (منذ لحظات)',
      formattedDate,
      formattedTime,
      badgeClass: 'bg-emerald-500/15 text-emerald-800 dark:text-emerald-300 border-emerald-400/40 animate-pulse font-black shadow-xs',
      isRecent: true,
      isToday: true,
      isYesterday: false,
      iconType: 'zap',
    };
  }

  // 2. Minutes ago (< 60m)
  if (diffMin < 60) {
    let text = `منذ ${diffMin} دقيقة`;
    if (diffMin === 1) text = 'منذ دقيقة واحدة';
    else if (diffMin === 2) text = 'منذ دقيقتين';
    else if (diffMin <= 10) text = `منذ ${diffMin} دقائق`;

    return {
      label: text,
      formattedDate,
      formattedTime,
      badgeClass: 'bg-sky-500/15 text-sky-800 dark:text-sky-300 border-sky-400/40 font-black',
      isRecent: true,
      isToday: true,
      isYesterday: false,
      iconType: 'timer',
    };
  }

  // 3. Hours ago today
  if (isToday) {
    let text = `منذ ${diffHours} ساعة`;
    if (diffHours === 1) text = 'منذ ساعة واحدة';
    else if (diffHours === 2) text = 'منذ ساعتين';
    else if (diffHours <= 10) text = `منذ ${diffHours} ساعات`;

    return {
      label: text,
      formattedDate,
      formattedTime,
      badgeClass: 'bg-blue-500/15 text-blue-900 dark:text-blue-200 border-blue-400/35 font-bold',
      isRecent: false,
      isToday: true,
      isYesterday: false,
      iconType: 'clock',
    };
  }

  // 4. Yesterday
  if (isYesterday) {
    return {
      label: `أمس (${formattedTime})`,
      formattedDate,
      formattedTime,
      badgeClass: 'bg-amber-500/15 text-amber-900 dark:text-amber-200 border-amber-400/40 font-bold',
      isRecent: false,
      isToday: false,
      isYesterday: true,
      iconType: 'history',
    };
  }

  // 5. Days ago
  if (diffDays === 2) {
    return {
      label: `منذ يومين (${formattedTime})`,
      formattedDate,
      formattedTime,
      badgeClass: 'bg-purple-500/10 text-purple-900 dark:text-purple-300 border-purple-400/30 font-bold',
      isRecent: false,
      isToday: false,
      isYesterday: false,
      iconType: 'calendar',
    };
  }

  if (diffDays <= 7) {
    return {
      label: `منذ ${diffDays} أيام (${formattedDate})`,
      formattedDate,
      formattedTime,
      badgeClass: 'bg-slate-100 dark:bg-white/10 text-slate-700 dark:text-slate-300 border-slate-200 dark:border-white/10 font-bold',
      isRecent: false,
      isToday: false,
      isYesterday: false,
      iconType: 'calendar',
    };
  }

  if (diffDays <= 14) {
    return {
      label: `منذ أسبوع (${formattedDate})`,
      formattedDate,
      formattedTime,
      badgeClass: 'bg-slate-100 dark:bg-white/10 text-slate-700 dark:text-slate-300 border-slate-200 dark:border-white/10 font-bold',
      isRecent: false,
      isToday: false,
      isYesterday: false,
      iconType: 'calendar',
    };
  }

  if (diffDays <= 30) {
    const weeks = Math.floor(diffDays / 7);
    return {
      label: `منذ ${weeks} أسابيع (${formattedDate})`,
      formattedDate,
      formattedTime,
      badgeClass: 'bg-slate-100 dark:bg-white/10 text-slate-700 dark:text-slate-300 border-slate-200 dark:border-white/10 font-bold',
      isRecent: false,
      isToday: false,
      isYesterday: false,
      iconType: 'calendar',
    };
  }

  const months = Math.floor(diffDays / 30);
  if (months === 1) {
    return {
      label: `منذ شهر (${formattedDate})`,
      formattedDate,
      formattedTime,
      badgeClass: 'bg-slate-100 dark:bg-white/10 text-slate-700 dark:text-slate-300 border-slate-200 dark:border-white/10 font-bold',
      isRecent: false,
      isToday: false,
      isYesterday: false,
      iconType: 'calendar',
    };
  }

  if (months <= 12) {
    return {
      label: `منذ ${months} أشهر (${formattedDate})`,
      formattedDate,
      formattedTime,
      badgeClass: 'bg-slate-100 dark:bg-white/10 text-slate-700 dark:text-slate-300 border-slate-200 dark:border-white/10 font-bold',
      isRecent: false,
      isToday: false,
      isYesterday: false,
      iconType: 'calendar',
    };
  }

  return {
    label: formattedDate,
    formattedDate,
    formattedTime,
    badgeClass: 'bg-slate-100 dark:bg-white/10 text-slate-700 dark:text-slate-300 border-slate-200 dark:border-white/10 font-bold',
    isRecent: false,
    isToday: false,
    isYesterday: false,
    iconType: 'calendar',
  };
};
