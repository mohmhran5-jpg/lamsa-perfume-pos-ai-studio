import { type FormEvent, useEffect, useMemo, useState } from 'react';
import { Bell, RefreshCw, ShieldCheck, UserPlus, UserX } from 'lucide-react';
import type { AuditLogRecord } from '../types';
import { TAREK_AUTH_EMAIL, type AssignedOperationalRole } from '../services/authPolicy';
import {
  setEmailRoleAssignmentActiveCloud,
  saveEmailRoleAssignmentCloud,
  subscribeToOperationalAccessRequestsCloud,
  dismissOperationalAccessRequestCloud,
  subscribeToEmailRoleAssignments,
  type EmailRoleAssignment,
  type OperationalAccessRequest,
} from '../services/firebase';

interface Props {
  onAddAuditLog: (log: AuditLogRecord) => void;
}

export default function EmailAccessManager({ onAddAuditLog }: Props) {
  const [assignments, setAssignments] = useState<EmailRoleAssignment[]>([]);
  const [accessRequests, setAccessRequests] = useState<OperationalAccessRequest[]>([]);
  const [emailInput, setEmailInput] = useState('');
  const [role, setRole] = useState<AssignedOperationalRole>('INVENTORY_VIEWER');
  const [busyEmail, setBusyEmail] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  useEffect(() => subscribeToEmailRoleAssignments(
    setAssignments,
    (reason) => setError(reason.message || 'تعذر تحميل قائمة الصلاحيات.'),
  ), []);

  useEffect(() => subscribeToOperationalAccessRequestsCloud(
    setAccessRequests,
    (reason) => setError(reason.message || 'تعذر تحميل طلبات الوصول.'),
  ), []);

  const visibleAssignments = useMemo(() => {
    const rows = [...assignments];
    if (!rows.some((item) => item.email === TAREK_AUTH_EMAIL)) {
      rows.unshift({
        email: TAREK_AUTH_EMAIL,
        role: 'STORE_MANAGER',
        active: true,
        updatedAt: '',
        updatedBy: 'صلاحية طارق الحالية',
        legacyAccess: true,
      });
    }
    return rows.sort((a, b) => a.email.localeCompare(b.email));
  }, [assignments]);

  const handleGrant = async (event: FormEvent) => {
    event.preventDefault();
    const email = emailInput.trim().toLowerCase();
    if (!email) return;
    setBusyEmail(email);
    setError(null);
    setNotice(null);
    try {
      await saveEmailRoleAssignmentCloud(email, role);
      onAddAuditLog({
        id: `audit-role-grant-${Date.now()}`,
        action: 'منح صلاحية تشغيلية لبريد Google',
        user: 'المالك',
        timestamp: new Date().toISOString(),
        entityType: 'user',
        entityId: email,
        entityName: email,
        oldValue: null,
        newValue: { role, active: true },
        reason: `منح مساحة التشغيل للعنوان ${email}.`,
        category: 'مستخدمين_وأمان',
      });
      setEmailInput('');
      setRole('INVENTORY_VIEWER');
      setNotice(`مُنح وصول مساحة التشغيل لـ ${email}.`);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'تعذر حفظ الصلاحية.');
    } finally {
      setBusyEmail(null);
    }
  };

  const handleToggle = async (assignment: EmailRoleAssignment, active: boolean) => {
    setBusyEmail(assignment.email);
    setError(null);
    setNotice(null);
    try {
      await setEmailRoleAssignmentActiveCloud(assignment.email, active);
      onAddAuditLog({
        id: `audit-role-toggle-${Date.now()}`,
        action: active ? 'إعادة تفعيل صلاحية تشغيلية' : 'إيقاف صلاحية تشغيلية',
        user: 'المالك',
        timestamp: new Date().toISOString(),
        entityType: 'user',
        entityId: assignment.email,
        entityName: assignment.email,
        oldValue: { active: !active },
        newValue: { role: assignment.role, active },
        reason: `${active ? 'إعادة تفعيل' : 'إيقاف'} وصول ${assignment.email}.`,
        category: 'مستخدمين_وأمان',
      });
      setNotice(`${active ? 'أُعيد تفعيل' : 'أُوقف'} وصول ${assignment.email}.`);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'تعذر تحديث الصلاحية.');
    } finally {
      setBusyEmail(null);
    }
  };

  const handleDismissRequest = async (request: OperationalAccessRequest) => {
    setBusyEmail(request.email);
    setError(null);
    setNotice(null);
    try {
      await dismissOperationalAccessRequestCloud(request.email);
      onAddAuditLog({
        id: `audit-access-request-dismiss-${Date.now()}`,
        action: 'إغلاق طلب وصول دون منح صلاحية',
        user: 'المالك',
        timestamp: new Date().toISOString(),
        entityType: 'user',
        entityId: request.email,
        entityName: request.email,
        oldValue: { status: 'pending' },
        newValue: { status: 'dismissed' },
        reason: `أُغلق طلب الوصول الوارد من ${request.email} دون إنشاء منحة.`,
        category: 'مستخدمين_وأمان',
      });
      setNotice(`أُغلق الطلب دون منح وصول لـ ${request.email}.`);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'تعذر إغلاق الطلب.');
    } finally {
      setBusyEmail(null);
    }
  };

  return (
    <section dir="rtl" className="rounded-3xl border border-emerald-200 bg-white p-5 shadow-sm dark:border-emerald-900/50 dark:bg-slate-900">
      <div className="flex items-start gap-3">
        <div className="rounded-xl bg-emerald-50 p-2 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300">
          <ShieldCheck size={20} />
        </div>
        <div>
          <h2 className="font-black">الوصول بالبريد الموثّق</h2>
          <p className="mt-1 text-xs leading-6 text-slate-600 dark:text-slate-300">
            امنح أي بريد Google دوراً محدداً للقراءة فقط. يجب أن يسجّل المستخدم الدخول بالبريد نفسه وأن يكون موثّقاً؛ لا ينشئ هذا حساب Firebase ولا يتيح البيع أو الأسعار أو الأرباح أو إعدادات المالك.
          </p>
        </div>
      </div>

      <div className="mt-4 rounded-2xl border border-amber-200 bg-amber-50/70 p-4 dark:border-amber-900/50 dark:bg-amber-950/20">
        <div className="flex items-center gap-2 text-sm font-black text-amber-900 dark:text-amber-200">
          <Bell size={16} /> طلبات وصول جديدة ({accessRequests.length})
        </div>
        <p className="mt-1 text-xs leading-5 text-amber-800/80 dark:text-amber-200/70">
          الطلب لا يمنح أي صلاحية. اختر البريد، ثم حدّد الدور بنفسك واضغط «منح الوصول»؛ أو أغلق الطلب دون منح.
        </p>
        {accessRequests.length > 0 ? (
          <div className="mt-3 divide-y divide-amber-200 rounded-xl border border-amber-200 bg-white dark:divide-amber-900/50 dark:border-amber-900/50 dark:bg-slate-950">
            {accessRequests.map((request) => (
              <div key={request.email} className="flex flex-wrap items-center justify-between gap-3 p-3">
                <div className="min-w-0">
                  <p className="break-all text-sm font-bold">{request.email}</p>
                  <p className="mt-0.5 text-[11px] text-slate-500">
                    {request.displayName} · {new Date(request.requestedAt).toLocaleString('ar-EG')}
                  </p>
                </div>
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => { setEmailInput(request.email); setNotice('تم إدراج البريد؛ اختر الدور المطلوب ثم امنح الوصول يدوياً.'); }}
                    className="rounded-lg bg-emerald-700 px-3 py-2 text-xs font-bold text-white"
                  >
                    اختيار البريد
                  </button>
                  <button
                    type="button"
                    disabled={busyEmail !== null}
                    onClick={() => void handleDismissRequest(request)}
                    className="rounded-lg bg-slate-100 px-3 py-2 text-xs font-bold text-slate-700 disabled:opacity-50 dark:bg-white/10 dark:text-slate-200"
                  >
                    إغلاق دون منح
                  </button>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <p className="mt-3 rounded-xl border border-dashed border-amber-300 p-3 text-xs text-amber-900/70 dark:border-amber-800 dark:text-amber-200/70">
            لا توجد طلبات معلقة حالياً.
          </p>
        )}
      </div>

      <form onSubmit={handleGrant} className="mt-4 flex flex-col gap-2 sm:flex-row">
        <input
          type="email"
          required
          autoComplete="email"
          value={emailInput}
          onChange={(event) => setEmailInput(event.target.value)}
          placeholder="name@example.com"
          className="min-w-0 flex-1 rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm outline-none focus:border-emerald-500 dark:border-white/10 dark:bg-slate-950"
        />
        <select
          value={role}
          onChange={(event) => setRole(event.target.value as AssignedOperationalRole)}
          className="rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm outline-none focus:border-emerald-500 dark:border-white/10 dark:bg-slate-950"
        >
          <option value="INVENTORY_VIEWER">المخزون فقط</option>
          <option value="STORE_MANAGER">المخزون + تكاليف التشغيل</option>
        </select>
        <button
          type="submit"
          disabled={busyEmail !== null}
          className="inline-flex items-center justify-center gap-2 rounded-xl bg-emerald-700 px-4 py-2.5 text-sm font-bold text-white disabled:opacity-50"
        >
          <UserPlus size={16} /> منح وصول التشغيل
        </button>
      </form>

      {notice && <p role="status" className="mt-3 text-sm font-semibold text-emerald-700">{notice}</p>}
      {error && <p role="alert" className="mt-3 text-sm font-semibold text-rose-700">{error}</p>}

      <div className="mt-5 divide-y divide-slate-100 rounded-2xl border border-slate-100 dark:divide-white/10 dark:border-white/10">
        {visibleAssignments.map((assignment) => (
          <div key={assignment.email} className="flex flex-wrap items-center justify-between gap-3 p-3">
            <div className="min-w-0">
              <p className="break-all text-sm font-bold">{assignment.email}</p>
              <p className="mt-0.5 text-[11px] text-slate-500">
                {assignment.legacyAccess
                  ? 'وصول طارق الحالي · المخزون وتكاليف التشغيل'
                  : assignment.role === 'STORE_MANAGER'
                  ? 'المخزون وتكاليف التشغيل · قراءة فقط'
                  : 'المخزون فقط · قراءة فقط'}
                {' · '}{assignment.active ? 'نشط' : 'موقوف'}
              </p>
            </div>
            <button
              type="button"
              disabled={busyEmail !== null}
              onClick={() => void handleToggle(assignment, !assignment.active)}
              className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-2 text-xs font-bold disabled:opacity-50 ${assignment.active ? 'bg-rose-50 text-rose-700 hover:bg-rose-100 dark:bg-rose-950/40 dark:text-rose-300' : 'bg-slate-100 text-slate-700 hover:bg-slate-200 dark:bg-white/10 dark:text-slate-200'}`}
            >
              {busyEmail === assignment.email ? <RefreshCw size={14} className="animate-spin" /> : assignment.active ? <UserX size={14} /> : <RefreshCw size={14} />}
              {assignment.active ? 'إيقاف الوصول' : 'إعادة التفعيل'}
            </button>
          </div>
        ))}
        {visibleAssignments.length === 0 && <p className="p-4 text-sm text-slate-500">لا توجد منح وصول مسجلة.</p>}
      </div>
    </section>
  );
}
