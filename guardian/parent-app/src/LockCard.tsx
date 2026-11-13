import { useState } from 'react';
import { Text, TextInput, View } from 'react-native';
import { useAuth } from './auth';
import { useTheme } from './theme';
import { Button } from './ui';
import { formatDate } from './labels';

export interface LockInfo {
  locked: boolean;
  lockedUntil: string | null;
  message: string | null;
  consented: boolean;
  devices: { id: string; model: string | null; lockCapable: boolean | null }[];
}

const DURATIONS: [number | null, string][] = [[30, '30 دقيقة'], [60, 'ساعة'], [null, 'حتى أفتحه']];

/** Lock / unlock the child's phone. */
export function LockCard({ childId, info, onChange }: { childId: string; info: LockInfo | null; onChange: () => void }) {
  const { api } = useAuth();
  const { s, c } = useTheme();
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!info) return null;
  if (!info.consented) {
    return <View style={s.card}><Text style={s.muted}>🔒 قفل الجهاز غير مفعّل. فعّله من الموافقة في لوحة الويب.</Text></View>;
  }

  async function act(fn: () => Promise<unknown>) {
    setBusy(true);
    setError(null);
    try {
      await fn();
      setMessage('');
      onChange();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  const cannotLock = info.devices.filter((d) => d.lockCapable === false);

  return (
    <View style={[s.card, info.locked && { borderRightWidth: 4, borderRightColor: c.danger }]}>
      {info.locked ? (
        <>
          <Text style={s.h2}>🔒 الجهاز مقفل {info.lockedUntil ? `حتى ${formatDate(info.lockedUntil)}` : 'حتى تفتحه'}</Text>
          {info.message && <Text style={s.muted}>الرسالة للطفل: «{info.message}»</Text>}
          <Button title="فتح القفل" disabled={busy} onPress={() => act(() => api('DELETE', `/children/${childId}/lock`))} />
        </>
      ) : (
        <>
          <Text style={s.h2}>قفل الجهاز</Text>
          <TextInput style={s.input} placeholder="رسالة للطفل (اختياري)" maxLength={140} value={message} onChangeText={setMessage}
                     accessibilityLabel="رسالة للطفل" />
          <View style={[s.row, { flexWrap: 'wrap' }]}>
            {DURATIONS.map(([minutes, label]) => (
              <View key={label} style={{ flexGrow: 1 }}>
                <Button title={`قفل ${label}`} variant={minutes === null ? 'danger' : 'primary'} disabled={busy || info.devices.length === 0}
                        onPress={() => act(() => api('PUT', `/children/${childId}/lock`, { minutes, ...(message.trim() && { message: message.trim() }) }))} />
              </View>
            ))}
          </View>
          <Text style={s.muted}>يُطبَّق خلال 30 ثانية تقريباً إن كان الجهاز متصلاً.</Text>
        </>
      )}
      {info.devices.length === 0 && <Text style={s.muted}>لا يوجد جهاز مرتبط.</Text>}
      {cannotLock.map((d) => (
        <Text key={d.id} style={s.error}>{d.model ?? 'جهاز'}: صلاحية قفل الشاشة غير مفعّلة في تطبيق الطفل.</Text>
      ))}
      {error && <Text style={s.error}>{error}</Text>}
    </View>
  );
}
