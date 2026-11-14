'use client';

import { useState } from 'react';
import { call } from '@/lib/client';
import type { FamilyMember } from '@/lib/types';
import { useAction } from '../useAction';

const ERRORS: Record<string, string> = {
  'That username or email is already taken': 'اسم المستخدم أو البريد مستخدم من قبل.',
  'username: 3–30 letters, digits, dot, dash or underscore': 'اسم المستخدم: 3–30 حرفاً إنجليزياً أو أرقاماً أو . _ -',
  'password: at least 10 characters': 'كلمة المرور 10 أحرف على الأقل.',
};

/** Owner-only: add other adults (co-parent, grandparent) who can follow the children. */
export function FamilyPanel({ members, isOwner }: { members: FamilyMember[]; isOwner: boolean }) {
  const { run, busy, error } = useAction();
  const [resetFor, setResetFor] = useState<string | null>(null);
  const [newPassword, setNewPassword] = useState('');
  const [added, setAdded] = useState<string | null>(null);

  async function add(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = e.currentTarget;
    const d = new FormData(form);
    const username = String(d.get('username')).trim();
    const ok = await run(() => call('POST', '/family/members', {
      fullName: d.get('fullName'), username, password: d.get('password'),
    }));
    if (ok) { form.reset(); setAdded(username.toLowerCase()); }
  }

  return (
    <div className="card stack" id="family">
      <h2>العائلة</h2>
      <p className="muted small">من يستطيع متابعة الأطفال. فرد العائلة يرى التنبيهات والموقع ويستطيع قفل الجهاز، لكنه لا يستطيع إضافة أفراد أو حذف طفل.</p>
      <ul className="list">
        {members.map((m) => (
          <li key={m.id} className="stack">
            <div className="row spread">
              <span>
                <strong>{m.fullName}</strong>{m.isYou && ' (أنت)'} · {m.role === 'owner' ? 'صاحب الحساب' : 'فرد من العائلة'}
                <br /><span className="muted small ltr">{m.username ?? m.email}</span>
              </span>
              {isOwner && m.role !== 'owner' && (
                <span className="row">
                  <button type="button" className="btn-secondary" disabled={busy} onClick={() => { setResetFor(m.id); setNewPassword(''); }}>تغيير كلمة المرور</button>
                  <button type="button" className="btn-secondary" disabled={busy}
                          onClick={() => run(() => call('DELETE', `/family/members/${m.id}`), { confirm: `إزالة ${m.fullName}؟ سيفقد الوصول فوراً.` })}>إزالة</button>
                </span>
              )}
            </div>
            {resetFor === m.id && (
              <div className="row">
                <input type="password" aria-label="كلمة المرور الجديدة" placeholder="كلمة المرور الجديدة (10 أحرف على الأقل)"
                       value={newPassword} onChange={(e) => setNewPassword(e.target.value)} className="ltr" style={{ maxWidth: 280 }} autoComplete="new-password" />
                <button type="button" disabled={busy || newPassword.length < 10}
                        onClick={async () => {
                          if (await run(() => call('PUT', `/family/members/${m.id}/password`, { password: newPassword }))) setResetFor(null);
                        }}>حفظ</button>
              </div>
            )}
          </li>
        ))}
      </ul>

      {isOwner && (
        <form onSubmit={add} className="stack">
          <h3>إضافة فرد من العائلة</h3>
          <div className="row">
            <div style={{ flex: '1 1 160px' }}><label htmlFor="fm-name">الاسم</label><input id="fm-name" name="fullName" required maxLength={100} placeholder="بابا" /></div>
            <div style={{ flex: '1 1 160px' }}>
              <label htmlFor="fm-user">اسم المستخدم للدخول</label>
              <input id="fm-user" name="username" required pattern="[A-Za-z0-9._\-]{3,30}" className="ltr" autoCapitalize="none" spellCheck={false} placeholder="baba" />
            </div>
            <div style={{ flex: '1 1 160px' }}>
              <label htmlFor="fm-pass">كلمة المرور</label>
              <input id="fm-pass" name="password" type="password" required minLength={10} className="ltr" autoComplete="new-password" />
            </div>
          </div>
          <div><button type="submit" disabled={busy}>إضافة</button></div>
          {added && <p className="notice small">تمت الإضافة ✓ يدخل من نفس الموقع باسم المستخدم <strong className="ltr">{added}</strong> وكلمة المرور التي اخترتها.</p>}
        </form>
      )}
      {error && <p className="error">{ERRORS[error] ?? error}</p>}
    </div>
  );
}
