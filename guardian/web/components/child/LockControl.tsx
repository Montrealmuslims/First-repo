'use client';

import { useState } from 'react';
import Link from 'next/link';
import { call } from '@/lib/client';
import { formatDate } from '@/lib/labels';
import type { LockInfo } from '@/lib/types';
import { useAction } from '../useAction';

const DURATIONS: [number | null, string][] = [[30, '30 دقيقة'], [60, 'ساعة'], [120, 'ساعتان'], [null, 'حتى أفتحه']];

export function LockControl({ childId, childName, info }: { childId: string; childName: string; info: LockInfo }) {
  const [message, setMessage] = useState('');
  const { run, busy, error } = useAction();

  if (!info.consented) {
    return (
      <div className="card row spread">
        <span className="muted">🔒 قفل الجهاز غير مفعّل لـ {childName}.</span>
        <Link href={`/children/${childId}?tab=consent`} className="btn btn-secondary">تفعيله من الموافقة</Link>
      </div>
    );
  }

  const cannotLock = info.devices.filter((d) => d.lockCapable === false);
  const noDevices = info.devices.length === 0;

  return (
    <div className={`card stack ${info.locked ? 'notice-danger' : ''}`}>
      {info.locked ? (
        <div className="row spread">
          <span>
            <strong>🔒 جهاز {childName} مقفل</strong>{' '}
            {info.lockedUntil ? <>حتى {formatDate(info.lockedUntil)}</> : 'حتى تفتحه'}
            {info.message && <><br /><span className="muted small">الرسالة للطفل: «{info.message}»</span></>}
          </span>
          <button type="button" disabled={busy} onClick={() => run(() => call('DELETE', `/children/${childId}/lock`))}>فتح القفل</button>
        </div>
      ) : (
        <>
          <div className="row spread">
            <strong>قفل جهاز {childName}</strong>
            <span className="muted small">يُطبَّق خلال 30 ثانية تقريباً إن كان الجهاز متصلاً</span>
          </div>
          <input aria-label="رسالة للطفل (اختياري)" placeholder="رسالة للطفل (اختياري)، مثل: وقت النوم" maxLength={140}
                 value={message} onChange={(e) => setMessage(e.target.value)} />
          <div className="row">
            {DURATIONS.map(([minutes, label]) => (
              <button key={label} type="button" className={minutes === null ? 'btn-danger' : undefined} disabled={busy || noDevices}
                      onClick={() => run(() => call('PUT', `/children/${childId}/lock`, { minutes, ...(message.trim() && { message: message.trim() }) }))}>
                قفل {label}
              </button>
            ))}
          </div>
        </>
      )}
      {noDevices && <p className="muted small">لا يوجد جهاز مرتبط. اربط جهاز الطفل من تبويب «الأجهزة».</p>}
      {cannotLock.map((d) => (
        <p key={d.id} className="error small">
          {d.model ?? 'جهاز'}: صلاحية «قفل الشاشة» غير مفعّلة في تطبيق الطفل، فلن يُقفل هذا الجهاز. افتح التطبيق على الجهاز وفعّلها.
        </p>
      ))}
      {error && <p className="error">{error === 'Device lock is not covered by the current consent' ? 'قفل الجهاز غير مشمول بالموافقة الحالية.' : error}</p>}
    </div>
  );
}
