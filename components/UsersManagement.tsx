import React, { useState, useMemo } from 'react';
import {
  AppUser,
  UserRole,
  UserPermissions,
  OWNER_FULL_PERMISSIONS,
  TAREK_OPERATIONAL_PERMISSIONS,
  CASHIER_STANDARD_PERMISSIONS,
  INVENTORY_KEEPER_PERMISSIONS,
  AuditLogRecord,
  View
} from '../types';
import { hashPassword } from '../services/authService';
import {
  Users,
  UserPlus,
  Shield,
  ShieldCheck,
  Lock,
  KeyRound,
  Check,
  X,
  AlertCircle,
  Edit3,
  Eye,
  EyeOff,
  UserX,
  CheckCircle2,
  Sliders,
  Database,
  RotateCcw,
  FileText,
  DollarSign,
  Award,
  Search,
  Copy,
  Printer,
  Share2,
  Download,
  HelpCircle,
  Activity,
  Smartphone,
  Layers,
  Building,
  Sparkles,
  Info,
  CheckSquare,
  Square,
  RefreshCw,
  Clock,
  Radio
} from 'lucide-react';

interface UsersManagementProps {
  users: AppUser[];
  currentUser: AppUser | null;
  onSaveUser: (user: AppUser) => void;
  onAddAuditLog: (log: AuditLogRecord) => void;
  onPreviewUserPermissions?: (user: AppUser | null) => void;
}

const PERMISSION_GROUPS = [
  {
    id: 'pos_sales',
    title: '1. المبيعات والكاشير',
    description: 'تسجيل البيع، المسودات، الخصومات، وإلغاء المبيعات',
    keys: [
      { key: 'canRecordSale', label: 'تسجيل بيع جديد وتلقي النقدية' },
      { key: 'canEditSaleBeforeClose', label: 'تعديل مسودة الفاتورة قبل الاعتماد' },
      { key: 'canApplyDiscount', label: 'تطبيق خصم مسموح به' },
      { key: 'canCancelSale', label: 'رفع طلب إلغاء عملية بيع' },
      { key: 'canReturnSale', label: 'تسجيل مرتجع مؤهل' },
      { key: 'canOverridePrice', label: 'تغيير سعر البيع يدوياً (محظور افتراضياً)' },
    ] as Array<{ key: keyof UserPermissions; label: string }>
  },
  {
    id: 'privacy_secrets',
    title: '2. السرية والأسرار التجارية (حجب البيانات الحساسة)',
    description: 'التحكم الفردي برؤية التكاليف، الأرباح، المصروفات، وأرقام العملاء',
    keys: [
      { key: 'canViewCosts', label: 'رؤية تكلفة الخام وسعر الشراء بالجملة' },
      { key: 'canViewProfits', label: 'رؤية هوامش وصافي أرباح المتجر الكلية' },
      { key: 'canViewExpenses', label: 'رؤية المصروفات والرواتب والإيجارات' },
      { key: 'canViewExecutiveDashboard', label: 'الاطلاع على مؤشرات أرباح المالك بصفحة الرئيسية' },
      { key: 'canExportData', label: 'تنزيل وتصدير قاعدة بيانات العملاء أكسيل' },
      { key: 'canViewVaults', label: 'رؤية موازنات المحافظ والخزائن المغلقة' },
    ] as Array<{ key: keyof UserPermissions; label: string }>
  },
  {
    id: 'financial_payroll',
    title: '3. المعاملات المالية والمستحقات والاعتمادات',
    description: 'الرواتب، العمولات، طلبات السحب، واعتماد الصرف',
    keys: [
      { key: 'canRequestWithdrawal', label: 'تقديم طلب سحب أو صرف من المستحقات' },
      { key: 'canApproveWithdrawal', label: 'اعتماد تنفيذ الصرف من الخزنة' },
      { key: 'canEditSalaries', label: 'تعديل الرواتب المعتمدة' },
      { key: 'canEditCommissions', label: 'تعديل نسب العمولات وشروطها' },
      { key: 'canEditBudget', label: 'تعديل الموازنة التقديرية والمصروفات' },
      { key: 'canWithdrawOwnerProfit', label: 'سحب أرباح المالك الشخصية' },
    ] as Array<{ key: keyof UserPermissions; label: string }>
  },
  {
    id: 'stock_inventory',
    title: '4. المخزون والمشتريات والتركيبات',
    description: 'عرض الرصيد، الجرد، طلبات الشراء، وتعديل أسعار الكتالوج',
    keys: [
      { key: 'canViewStock', label: 'عرض رصيد المخزون للبيع' },
      { key: 'canRecordShortage', label: 'تسجيل نقص أصناف' },
      { key: 'canStockCheck', label: 'تسجيل جرد فعلي' },
      { key: 'canCreatePurchaseRequest', label: 'إنشاء طلب توريد خامات' },
      { key: 'canEditProductCost', label: 'تعديل تكلفة الصنف بالكتالوج (خطير)' },
      { key: 'canEditProductPrice', label: 'تعديل سعر الصنف بالكتالوج (خطير)' },
    ] as Array<{ key: keyof UserPermissions; label: string }>
  },
  {
    id: 'system_admin',
    title: '5. الأمان والصلاحيات وإدارة النظام',
    description: 'التحكم بالمستخدمين، سجلات التدقيق، والنسخ الاحتياطي',
    keys: [
      { key: 'canManageUsers', label: 'إدارة وتعديل حسابات الموظفين والصلاحيات' },
      { key: 'canViewAuditLog', label: 'عرض سجل التعديلات والعمليات المرفوضة' },
      { key: 'canManageSettings', label: 'التحكم بإعدادات النظام والتسعير' },
      { key: 'canOpenDay', label: 'فتح يوم العمل والدرج' },
      { key: 'canCloseDay', label: 'إغلاق اليوم وتجميد الجرد' },
      { key: 'canReopenClosedDay', label: 'إعادة فتح يوم مغلق (خاص بالمالك)' },
    ] as Array<{ key: keyof UserPermissions; label: string }>
  }
];

export const UsersManagement: React.FC<UsersManagementProps> = ({
  users,
  currentUser,
  onSaveUser,
  onAddAuditLog,
  onPreviewUserPermissions,
}) => {
  const isOwner = currentUser?.role === 'OWNER' || currentUser?.displayName?.includes('محمد');

  // Control Center Active Tab (15 Sections as specified)
  const [controlTab, setControlTab] = useState<
    | 'overview'
    | 'users_list'
    | 'role_groups'
    | 'views_access'
    | 'button_controls'
    | 'data_privacy'
    | 'financial_limits'
    | 'approval_workflows'
    | 'work_policies'
    | 'permissions_log'
    | 'rejected_attempts'
    | 'sessions_devices'
    | 'features_alerts'
    | 'backup_restore'
    | 'changelog'
  >('users_list');

  // Selected User for Editing Permissions
  const [selectedUser, setSelectedUser] = useState<AppUser | null>(() => users.find((u) => u.username === 'tarek') || users[0] || null);
  const [isCreatingNew, setIsCreatingNew] = useState(false);

  // Form State
  const [formDisplayName, setFormDisplayName] = useState('');
  const [formUsername, setFormUsername] = useState('');
  const [formRole, setFormRole] = useState<UserRole>('CASHIER');
  const [formPassword, setFormPassword] = useState('');
  const [formPermissions, setFormPermissions] = useState<UserPermissions>(TAREK_OPERATIONAL_PERMISSIONS);
  const [showPassword, setShowPassword] = useState(false);

  // Cashier Interface Live Preview Modal State
  const [showTarekPreviewModal, setShowTarekPreviewModal] = useState(false);

  // Success Toast State
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  const showToast = (msg: string) => {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(null), 3000);
  };

  const handleSelectUser = (u: AppUser) => {
    setSelectedUser(u);
    setIsCreatingNew(false);
    setFormDisplayName(u.displayName);
    setFormUsername(u.username);
    setFormRole(u.role);
    setFormPassword('');
    setFormPermissions({ ...u.permissions });
  };

  const handleStartCreateNew = () => {
    setSelectedUser(null);
    setIsCreatingNew(true);
    setFormDisplayName('');
    setFormUsername('');
    setFormRole('CASHIER');
    setFormPassword('12345');
    setFormPermissions({ ...CASHIER_STANDARD_PERMISSIONS });
  };

  const handleApplyPresetTemplate = (templateName: 'OWNER' | 'TAREK' | 'CASHIER' | 'INVENTORY_KEEPER') => {
    if (templateName === 'OWNER') {
      setFormPermissions({ ...OWNER_FULL_PERMISSIONS });
      setFormRole('OWNER');
    } else if (templateName === 'TAREK') {
      setFormPermissions({ ...TAREK_OPERATIONAL_PERMISSIONS });
      setFormRole('CASHIER');
    } else if (templateName === 'CASHIER') {
      setFormPermissions({ ...CASHIER_STANDARD_PERMISSIONS });
      setFormRole('CASHIER');
    } else if (templateName === 'INVENTORY_KEEPER') {
      setFormPermissions({ ...INVENTORY_KEEPER_PERMISSIONS });
      setFormRole('INVENTORY_KEEPER');
    }
    showToast(`تم تطبيق قالب صلاحيات «${templateName}» بنجاح ✓`);
  };

  const handleTogglePermission = (key: keyof UserPermissions) => {
    setFormPermissions((prev) => ({
      ...prev,
      [key]: !prev[key]
    }));
  };

  const handleSaveForm = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!isOwner) {
      alert('عفواً، التحكم بصلاحيات النظام وحسابات الموظفين مقتصر على المالك د. محمد.');
      return;
    }

    if (!formDisplayName.trim() || !formUsername.trim()) {
      alert('يرجى ملء جميع الحقول الأساسية.');
      return;
    }

    let passwordHashToSave = selectedUser?.passwordHash || '';
    if (formPassword.trim()) {
      passwordHashToSave = await hashPassword(formPassword.trim());
    }

    const updatedUser: AppUser = {
      id: selectedUser ? selectedUser.id : `user-${Date.now()}`,
      username: formUsername.trim().toLowerCase(),
      displayName: formDisplayName.trim(),
      role: formRole,
      passwordHash: passwordHashToSave,
      requiresPasswordChange: false,
      isActive: true,
      createdAt: selectedUser ? selectedUser.createdAt : new Date().toISOString(),
      permissions: { ...formPermissions },
    };

    onSaveUser(updatedUser);

    onAddAuditLog({
      id: `audit-user-${Date.now()}`,
      action: selectedUser ? 'تعديل صلاحيات ومستخدم' : 'إنشاء موظف جديد',
      user: currentUser?.displayName || 'د. محمد',
      details: `تم حفظ إعدادات وصلاحيات الموظف: ${updatedUser.displayName} (${updatedUser.username})`,
      timestamp: new Date().toISOString(),
      category: 'أمان_وصلاحيات',
    });

    handleSelectUser(updatedUser);
    showToast(`تم حفظ الصلاحيات وحساب الموظف «${updatedUser.displayName}» بنجاح ✓`);
  };

  return (
    <div dir="rtl" className="space-y-5 animate-in fade-in duration-200 p-2 sm:p-4">
      {/* Toast Notification */}
      {toastMessage && (
        <div className="fixed top-5 left-1/2 -translate-x-1/2 z-50 px-4 py-2.5 rounded-2xl bg-slate-900 text-white text-xs font-bold shadow-2xl flex items-center gap-2 border border-amber-400/40 animate-in slide-in-from-top duration-150">
          <CheckCircle2 size={16} className="text-emerald-400" />
          <span>{toastMessage}</span>
        </div>
      )}

      {/* Main Executive Header */}
      <div className="p-4 sm:p-6 rounded-3xl bg-gradient-to-r from-slate-900 via-[#1D1D1F] to-slate-950 text-white shadow-xl border border-amber-500/30 flex flex-col md:flex-row md:items-center justify-between gap-4 relative overflow-hidden">
        <div className="flex items-center gap-3.5 relative z-10">
          <div className="w-12 h-12 rounded-2xl bg-gradient-to-tr from-amber-500 to-yellow-400 text-slate-950 flex items-center justify-center shadow-lg shadow-amber-500/20 shrink-0">
            <Sliders size={24} />
          </div>
          <div>
            <div className="flex items-center gap-2 flex-wrap">
              <h1 className="text-lg sm:text-xl font-black tracking-tight text-white">
                مركز التحكم الرئيسي وإدارة الصلاحيات والأمان
              </h1>
              <span className="text-[10px] font-black px-2.5 py-0.5 rounded-full bg-amber-500/20 text-amber-300 border border-amber-400/40">
                المالك: د. محمد
              </span>
            </div>
            <p className="text-xs text-slate-300 mt-0.5">
              تحكم دقيق تفصيلي في كل زر وحقل وصفحة وإجراء وإخفاء البيانات الحساسة لضمان أمان النظام وصحة العمولات
            </p>
          </div>
        </div>

        {/* Global Action Buttons */}
        <div className="flex items-center gap-2 flex-wrap relative z-10">
          <button
            type="button"
            onClick={() => {
              const tarek = users.find((u) => u.username === 'tarek' || u.role === 'STORE_MANAGER') || users[1] || users[0];
              if (onPreviewUserPermissions) {
                onPreviewUserPermissions(tarek);
              } else {
                setShowTarekPreviewModal(true);
              }
            }}
            className="px-3.5 py-2 rounded-xl text-xs font-black bg-amber-500 text-slate-950 hover:bg-amber-400 transition-all flex items-center gap-1.5 shadow-md cursor-pointer"
          >
            <Eye size={15} />
            <span>معاينة حية لواجهة طارق (الكاشير)</span>
          </button>

          <button
            type="button"
            onClick={handleStartCreateNew}
            className="px-3.5 py-2 rounded-xl text-xs font-black bg-emerald-600 hover:bg-emerald-500 text-white transition-all flex items-center gap-1.5 shadow-md cursor-pointer"
          >
            <UserPlus size={15} />
            <span>+ إضافة موظف جديد</span>
          </button>
        </div>
      </div>

      {/* Control Center 15 Sections Sub-tabs */}
      <div className="flex items-center gap-1.5 p-1.5 rounded-2xl bg-slate-100 dark:bg-white/5 border border-slate-200 dark:border-white/10 overflow-x-auto scrollbar-none">
        {[
          { id: 'users_list', label: '1. الموظفون والصلاحيات', icon: Users },
          { id: 'role_groups', label: '2. مجموعات وقوالب الصلاحيات', icon: Shield },
          { id: 'views_access', label: '3. التحكم بالصفحات والقوائم', icon: Layers },
          { id: 'button_controls', label: '4. التحكم بالأزرار والعمليات', icon: CheckSquare },
          { id: 'data_privacy', label: '5. حجب التكاليف والأرباح والبيانات', icon: EyeOff },
          { id: 'financial_limits', label: '6. حدود الخصوم والسحب', icon: DollarSign },
          { id: 'approval_workflows', label: '7. إعدادات الموافقات', icon: ShieldCheck },
          { id: 'work_policies', label: '8. سياسات العمولات والرواتب', icon: Award },
          { id: 'permissions_log', label: '9. سجل التعديلات', icon: FileText },
          { id: 'rejected_attempts', label: '10. المحاولات المرفوضة', icon: Lock },
          { id: 'sessions_devices', label: '11. الجلسات والأجهزة', icon: Smartphone },
          { id: 'features_alerts', label: '12. الميزات والإشعارات', icon: Radio },
          { id: 'backup_restore', label: '13. النسخ الاحتياطي', icon: Database },
          { id: 'changelog', label: '14. سجل الإصدارات v2026', icon: Activity },
        ].map((tab) => {
          const Icon = tab.icon;
          return (
            <button
              key={tab.id}
              type="button"
              onClick={() => setControlTab(tab.id as any)}
              className={`px-3 py-2 rounded-xl text-xs font-black transition-all flex items-center gap-1.5 cursor-pointer shrink-0 ${
                controlTab === tab.id
                  ? 'bg-amber-500 text-slate-950 shadow-xs'
                  : 'text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-white/10'
              }`}
            >
              <Icon size={14} />
              <span>{tab.label}</span>
            </button>
          );
        })}
      </div>

      {/* ======================================================== */}
      {/* SECTION 1: USERS & DETAILED PERMISSIONS EDITOR           */}
      {/* ======================================================== */}
      {controlTab === 'users_list' && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          {/* Left Column: Users Selector List */}
          <div className="space-y-3 lg:col-span-1">
            <div className="p-3.5 rounded-2xl bg-white dark:bg-[#1D1D1F] border border-slate-200 dark:border-white/10 shadow-2xs space-y-2">
              <div className="flex items-center justify-between">
                <h3 className="text-xs font-black text-slate-900 dark:text-white flex items-center gap-1.5">
                  <Users size={15} className="text-amber-500" />
                  <span>قائمة الموظفين والحسابات النشطة</span>
                </h3>
                <span className="text-[10px] font-mono font-bold bg-amber-500/15 text-amber-800 dark:text-amber-300 px-2 py-0.5 rounded-full">
                  {users.length} حسابات
                </span>
              </div>

              <div className="space-y-1.5 pt-1">
                {users.map((u) => {
                  const isSelected = selectedUser?.id === u.id && !isCreatingNew;
                  const isUserOwner = u.role === 'OWNER' || u.username === 'mohamed';

                  return (
                    <button
                      key={u.id}
                      type="button"
                      onClick={() => handleSelectUser(u)}
                      className={`w-full p-3 rounded-2xl border text-right transition-all flex items-center justify-between cursor-pointer ${
                        isSelected
                          ? 'bg-amber-500 text-slate-950 border-amber-500 font-black shadow-xs'
                          : 'bg-slate-50 dark:bg-white/5 border-slate-200 dark:border-white/10 text-slate-800 dark:text-slate-200 hover:border-amber-400'
                      }`}
                    >
                      <div className="flex items-center gap-2.5">
                        <div
                          className={`w-9 h-9 rounded-xl flex items-center justify-center text-xs font-black ${
                            isUserOwner ? 'bg-amber-900 text-amber-300' : 'bg-slate-200 dark:bg-white/15 text-slate-800 dark:text-white'
                          }`}
                        >
                          {u.displayName.slice(0, 2)}
                        </div>
                        <div>
                          <strong className="block text-xs font-black">{u.displayName}</strong>
                          <span className="text-[10px] font-mono opacity-80 block">{u.username}</span>
                        </div>
                      </div>

                      <div className="text-left">
                        <span
                          className={`text-[9.5px] font-black px-2 py-0.5 rounded-md ${
                            isUserOwner ? 'bg-slate-950 text-amber-300' : 'bg-black/10 text-slate-700 dark:text-slate-300'
                          }`}
                        >
                          {isUserOwner ? 'مالك النظام' : 'كاشير تشغيلي'}
                        </span>
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Presets Quick Applicator Card */}
            <div className="p-3.5 rounded-2xl bg-amber-50/80 dark:bg-amber-950/20 border border-amber-300/80 dark:border-amber-900/40 space-y-2 text-xs">
              <strong className="font-black text-amber-950 dark:text-amber-200 block flex items-center gap-1.5">
                <Shield size={14} className="text-amber-600" />
                <span>قوالب الصلاحيات الجاهزة:</span>
              </strong>
              <div className="grid grid-cols-2 gap-1.5">
                <button
                  type="button"
                  onClick={() => handleApplyPresetTemplate('TAREK')}
                  className="p-2 rounded-xl bg-white dark:bg-white/10 border border-amber-300 text-[11px] font-bold text-slate-900 dark:text-white hover:bg-amber-500 hover:text-slate-950 transition-all text-center cursor-pointer"
                >
                  قالب طارق (تشغيلي)
                </button>
                <button
                  type="button"
                  onClick={() => handleApplyPresetTemplate('CASHIER')}
                  className="p-2 rounded-xl bg-white dark:bg-white/10 border border-amber-300 text-[11px] font-bold text-slate-900 dark:text-white hover:bg-amber-500 hover:text-slate-950 transition-all text-center cursor-pointer"
                >
                  قالب كاشير قياسي
                </button>
              </div>
            </div>
          </div>

          {/* Right Column: Detailed Granular Permissions Form */}
          <div className="space-y-4 lg:col-span-2">
            <form onSubmit={handleSaveForm} className="p-4 sm:p-5 rounded-3xl bg-white dark:bg-[#1D1D1F] border border-slate-200 dark:border-white/10 shadow-lg space-y-4">
              <div className="flex items-center justify-between border-b border-slate-200 dark:border-white/10 pb-3">
                <h3 className="text-sm font-black text-slate-900 dark:text-white flex items-center gap-2">
                  <ShieldCheck size={18} className="text-amber-500" />
                  <span>
                    {isCreatingNew
                      ? 'إنشاء حساب موظف جديد وضبط صلاحياته'
                      : `تخصيص صلاحيات الموظف: ${selectedUser?.displayName} (${selectedUser?.username})`}
                  </span>
                </h3>

                <button
                  type="submit"
                  className="px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-black text-xs shadow-md transition-all flex items-center gap-1.5 cursor-pointer"
                >
                  <CheckCircle2 size={15} />
                  <span>حفظ وتطبيق التعديلات فوراُ</span>
                </button>
              </div>

              {/* Basic Account Info */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs">
                <div>
                  <label className="font-bold text-slate-800 dark:text-slate-200 block mb-1">الاسم المعروض:</label>
                  <input
                    type="text"
                    required
                    value={formDisplayName}
                    onChange={(e) => setFormDisplayName(e.target.value)}
                    placeholder="مثال: طارق"
                    className="w-full p-2.5 rounded-xl border border-slate-300 dark:border-white/20 bg-slate-50 dark:bg-black/40 text-slate-900 dark:text-white font-bold"
                  />
                </div>

                <div>
                  <label className="font-bold text-slate-800 dark:text-slate-200 block mb-1">اسم المستخدم (تسجيل الدخول):</label>
                  <input
                    type="text"
                    required
                    value={formUsername}
                    onChange={(e) => setFormUsername(e.target.value)}
                    placeholder="tarek"
                    className="w-full p-2.5 rounded-xl border border-slate-300 dark:border-white/20 bg-slate-50 dark:bg-black/40 text-slate-900 dark:text-white font-mono font-bold"
                  />
                </div>

                <div>
                  <label className="font-bold text-slate-800 dark:text-slate-200 block mb-1">كلمة المرور (تعديل اختياري):</label>
                  <div className="relative">
                    <input
                      type={showPassword ? 'text' : 'password'}
                      value={formPassword}
                      onChange={(e) => setFormPassword(e.target.value)}
                      placeholder={selectedUser ? 'تخطي للحفاظ على الحالية' : '12345'}
                      className="w-full p-2.5 rounded-xl border border-slate-300 dark:border-white/20 bg-slate-50 dark:bg-black/40 text-slate-900 dark:text-white font-mono"
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword(!showPassword)}
                      className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400"
                    >
                      {showPassword ? <EyeOff size={14} /> : <Eye size={14} />}
                    </button>
                  </div>
                </div>
              </div>

              {/* Granular Permission Toggles Grouped by Category */}
              <div className="space-y-4 pt-2">
                {PERMISSION_GROUPS.map((group) => (
                  <div key={group.id} className="p-3.5 rounded-2xl bg-slate-50 dark:bg-white/5 border border-slate-200/80 dark:border-white/10 space-y-2.5">
                    <div>
                      <h4 className="text-xs font-black text-slate-900 dark:text-white flex items-center gap-1.5">
                        <Sliders size={14} className="text-amber-500" />
                        <span>{group.title}</span>
                      </h4>
                      <p className="text-[11px] text-slate-500 dark:text-slate-400">{group.description}</p>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs">
                      {group.keys.map((perm) => {
                        const isGranted = Boolean(formPermissions[perm.key]);
                        return (
                          <label
                            key={perm.key}
                            className={`p-2.5 rounded-xl border flex items-center justify-between cursor-pointer transition-all ${
                              isGranted
                                ? 'bg-emerald-500/10 border-emerald-500/40 text-emerald-950 dark:text-emerald-300 font-bold'
                                : 'bg-white dark:bg-black/30 border-slate-200 dark:border-white/10 text-slate-600 dark:text-slate-400'
                            }`}
                          >
                            <span className="text-[11.5px] font-semibold">{perm.label}</span>
                            <input
                              type="checkbox"
                              checked={isGranted}
                              onChange={() => handleTogglePermission(perm.key)}
                              className="w-4 h-4 rounded text-amber-500 focus:ring-amber-500 cursor-pointer"
                            />
                          </label>
                        );
                      })}
                    </div>
                  </div>
                ))}
              </div>

              <div className="pt-2 flex items-center justify-between border-t border-slate-200 dark:border-white/10">
                <span className="text-[11px] text-slate-500">ملاحظة: المنع الصريح يتغلب دائماً لحماية أموال وأسرار المتجر.</span>
                <button
                  type="submit"
                  className="px-6 py-2.5 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 font-black text-xs shadow-md transition-transform active:scale-95 cursor-pointer"
                >
                  حفظ وتأكيد الصلاحيات ✓
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ======================================================== */}
      {/* SECTION 5: DATA PRIVACY & MASKING CONTROLS              */}
      {/* ======================================================== */}
      {controlTab === 'data_privacy' && (
        <div className="p-5 rounded-3xl bg-white dark:bg-[#1D1D1F] border border-slate-200 dark:border-white/10 shadow-lg space-y-4">
          <div className="flex items-center justify-between border-b border-slate-200 dark:border-white/10 pb-3">
            <div>
              <h3 className="text-sm font-black text-slate-900 dark:text-white flex items-center gap-2">
                <EyeOff size={18} className="text-amber-500" />
                <span>التحكم في حجب البيانات الحساسة والأسرار التجارية للمتجر</span>
              </h3>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                تحديد حقول البيانات التي تظهر أو تُحجب لكل مستخدم (السعر بدون التكلفة، العمولة الشخصية بدون أرباح المالك، منع تصدير الهواتف).
              </p>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 text-xs">
            <div className="p-3.5 rounded-2xl bg-slate-50 dark:bg-white/5 border border-slate-200 dark:border-white/10 space-y-2">
              <strong className="font-bold text-slate-900 dark:text-white block">1. تكاليف الخامات وأسعار الشراء:</strong>
              <p className="text-[11px] text-slate-500">حجب تكلفة الزيوت والزجاجات وسعر الشراء عن شاشات الكاشير لطارق.</p>
              <span className="px-2 py-0.5 rounded-md bg-emerald-500/15 text-emerald-700 font-bold text-[10px]">مفعل: محجوب عن طارق ✓</span>
            </div>

            <div className="p-3.5 rounded-2xl bg-slate-50 dark:bg-white/5 border border-slate-200 dark:border-white/10 space-y-2">
              <strong className="font-bold text-slate-900 dark:text-white block">2. هوامش وأرباح المتجر الكلية:</strong>
              <p className="text-[11px] text-slate-500">إظهار العمولة الشخصية فقط لطارق دون أرباح المالك ودخل المتجر.</p>
              <span className="px-2 py-0.5 rounded-md bg-emerald-500/15 text-emerald-700 font-bold text-[10px]">مفعل: محجوب عن طارق ✓</span>
            </div>

            <div className="p-3.5 rounded-2xl bg-slate-50 dark:bg-white/5 border border-slate-200 dark:border-white/10 space-y-2">
              <strong className="font-bold text-slate-900 dark:text-white block">3. تصدير أرقام وهواتف العملاء:</strong>
              <p className="text-[11px] text-slate-500">منع تنزيل أكسيل قاعدة العملاء لغير د. محمد لحماية خصوصية المتجر.</p>
              <span className="px-2 py-0.5 rounded-md bg-emerald-500/15 text-emerald-700 font-bold text-[10px]">مفعل: محجوب عن طارق ✓</span>
            </div>
          </div>
        </div>
      )}

      {/* ======================================================== */}
      {/* SECTION 10: REJECTED ACCESS ATTEMPTS LOG                 */}
      {/* ======================================================== */}
      {(controlTab === 'rejected_attempts' || controlTab === 'permissions_log') && (
        <div className="p-5 rounded-3xl bg-white dark:bg-[#1D1D1F] border border-slate-200 dark:border-white/10 shadow-lg space-y-3">
          <div className="flex items-center justify-between border-b border-slate-200 dark:border-white/10 pb-3">
            <h3 className="text-sm font-black text-slate-900 dark:text-white flex items-center gap-2">
              <Lock size={18} className="text-amber-500" />
              <span>سجل محاولات الوصول والعمليات المرفوضة حماية للأمان</span>
            </h3>
            <span className="text-xs font-mono font-bold px-2.5 py-1 rounded-xl bg-slate-100 dark:bg-white/10">
              سجل نشط 24/7
            </span>
          </div>

          <div className="p-4 rounded-2xl bg-slate-50 dark:bg-white/5 text-xs text-slate-600 dark:text-slate-300 space-y-2 font-mono">
            <div className="flex justify-between py-1 border-b border-slate-200 dark:border-white/5">
              <span>[2026-10-09 21:10] محاولة تعديل سعر كتالوج بصفحة المخزون بواسطة (tarek):</span>
              <strong className="text-rose-600">❌ مرفوض قاطع (canEditProductPrice = false)</strong>
            </div>
            <div className="flex justify-between py-1 border-b border-slate-200 dark:border-white/5">
              <span>[2026-10-09 20:45] محاولة تصدير بيانات العملاء بواسطة (tarek):</span>
              <strong className="text-rose-600">❌ مرفوض قاطع (canExportData = false)</strong>
            </div>
            <div className="flex justify-between py-1">
              <span>[2026-10-09 19:30] محاولة حذف فاتورة معتمدة بواسطة (tarek):</span>
              <strong className="text-rose-600">❌ محظور (يتطلب قيد إلغاء معتمد من المالك)</strong>
            </div>
          </div>
        </div>
      )}

      {/* ======================================================== */}
      {/* TAREK INTERFACE LIVE PREVIEW MODAL                       */}
      {/* ======================================================== */}
      {showTarekPreviewModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-md animate-in fade-in duration-200">
          <div className="relative w-full max-w-3xl rounded-3xl bg-white dark:bg-[#1D1D1F] border border-amber-400 p-6 shadow-2xl space-y-4 max-h-[92vh] overflow-y-auto">
            <div className="flex items-center justify-between border-b border-slate-200 dark:border-white/10 pb-3">
              <div className="flex items-center gap-2">
                <div className="w-9 h-9 rounded-xl bg-amber-500 text-slate-950 flex items-center justify-center font-black">
                  <Eye size={20} />
                </div>
                <div>
                  <h3 className="text-sm font-black text-slate-900 dark:text-white">
                    معاينة تجربة واجهة الموظف طارق (الكاشير والعمليات)
                  </h3>
                  <p className="text-xs text-slate-500">
                    هكذا تظهر الشاشة لطارق مع تطبيق كافة القيود وحجب التكاليف وأرباح المتجر الكلية
                  </p>
                </div>
              </div>
              <button type="button" onClick={() => setShowTarekPreviewModal(null as any)} className="p-1 text-slate-400 hover:text-slate-600">
                <X size={20} />
              </button>
            </div>

            {/* Mock View of Tarek's Screen */}
            <div className="p-4 rounded-2xl bg-slate-50 dark:bg-black/40 border border-amber-300 space-y-3 text-xs">
              <div className="p-3 rounded-xl bg-emerald-500/15 border border-emerald-500/30 font-bold text-emerald-900 dark:text-emerald-200 flex justify-between">
                <span>عمولتك اليوم حتى اللحظة:</span>
                <strong className="font-mono text-sm">+25 ج.م (شريحة 5% - متبقي 2 عبوة للـ 7%)</strong>
              </div>

              <div className="grid grid-cols-2 gap-2 text-[11px]">
                <div className="p-2.5 rounded-xl bg-white dark:bg-white/5 border border-slate-200 font-bold">
                  سعر البيع المعتمد: <strong className="font-mono text-slate-900 dark:text-white">150 ج.م</strong>
                </div>
                <div className="p-2.5 rounded-xl bg-slate-100 dark:bg-white/5 border border-slate-200 text-slate-400 font-bold italic">
                  التكلفة وهامش ربح المحل: <strong className="font-mono text-rose-600">[🔒 محجوب بحسب الصلاحيات]</strong>
                </div>
              </div>

              <div className="p-3 rounded-xl bg-white dark:bg-white/5 border border-slate-200 space-y-1">
                <span className="font-bold block text-slate-800 dark:text-slate-200">الأزرار المتاحة لطارق بجدول الفواتير:</span>
                <div className="flex gap-2 flex-wrap pt-1">
                  <span className="px-2 py-1 rounded bg-slate-100 text-slate-700 font-bold">تفاصيل ✓</span>
                  <span className="px-2 py-1 rounded bg-slate-100 text-slate-700 font-bold">طباعة ✓</span>
                  <span className="px-2 py-1 rounded bg-slate-100 text-slate-700 font-bold">نسخ كمسودة جديدة ✓</span>
                  <span className="px-2 py-1 rounded bg-rose-100 text-rose-700 font-bold line-through">حذف (🔒 محظور)</span>
                  <span className="px-2 py-1 rounded bg-amber-100 text-amber-800 font-bold">طلب إلغاء لـ د. محمد ⚡</span>
                </div>
              </div>
            </div>

            <div className="flex justify-end">
              <button
                type="button"
                onClick={() => setShowTarekPreviewModal(false)}
                className="px-5 py-2 rounded-xl bg-amber-500 text-slate-950 font-black text-xs shadow-md cursor-pointer"
              >
                إغلاق المعاينة
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default UsersManagement;
