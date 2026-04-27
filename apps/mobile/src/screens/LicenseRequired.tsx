import { View, Text, StyleSheet, Pressable } from 'react-native';

/**
 * T66 — Mobile license-required screen. Shown when the API reports the
 * tenant has no active subscription. Read-only: actual reactivation
 * happens via super-admin tooling on the web.
 */

interface Props {
  status?: string | null;
  onSignOut: () => void;
}

export default function LicenseRequiredScreen({ status, onSignOut }: Props) {
  return (
    <View style={s.wrap}>
      <Text style={s.icon}>🔒</Text>
      <Text style={s.h1}>الاشتراك غير نشط</Text>
      <Text style={s.h2}>Subscription is not active</Text>
      <Text style={s.body}>
        تم إيقاف الوصول إلى التطبيق لأن اشتراك شركتك ليس نشطاً.
        تواصل مع المسؤول لتجديد الاشتراك.
      </Text>
      <Text style={s.code}>status: {status ?? 'missing'}</Text>
      <Pressable style={s.btn} onPress={onSignOut}>
        <Text style={s.btnText}>تسجيل خروج / Sign out</Text>
      </Pressable>
    </View>
  );
}

const s = StyleSheet.create({
  wrap: { flex: 1, padding: 24, justifyContent: 'center', alignItems: 'center', backgroundColor: '#fff1f2' },
  icon: { fontSize: 64, marginBottom: 12 },
  h1:   { fontSize: 22, fontWeight: '700', color: '#9f1239', textAlign: 'center' },
  h2:   { fontSize: 14, color: '#be123c', marginBottom: 16, textAlign: 'center' },
  body: { fontSize: 14, color: '#475569', textAlign: 'center', marginBottom: 16, lineHeight: 22 },
  code: { fontSize: 12, color: '#64748b', fontFamily: 'monospace', marginBottom: 24 },
  btn:  { backgroundColor: '#0369a1', paddingHorizontal: 24, paddingVertical: 12, borderRadius: 8 },
  btnText: { color: '#fff', fontSize: 14, fontWeight: '600' },
});
