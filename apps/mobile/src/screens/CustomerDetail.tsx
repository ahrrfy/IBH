import { useEffect, useState } from 'react';
import { View, Text, ScrollView, StyleSheet, ActivityIndicator } from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { api } from '../api';
import type { RootStackParamList } from '../../App';

type Props = NativeStackScreenProps<RootStackParamList, 'CustomerDetail'>;

interface Customer {
  id: string;
  code: string;
  nameAr: string;
  nameEn?: string;
  phone?: string;
  email?: string;
  address?: string;
  creditBalanceIqd?: number;
  creditLimitIqd?: number;
}

export default function CustomerDetailScreen({ route }: Props) {
  const { id } = route.params;
  const [data, setData] = useState<Customer | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.get<Customer>(`/sales/customers/${id}`)
      .then((r) => setData(r.data))
      .catch(() => setData(null))
      .finally(() => setLoading(false));
  }, [id]);

  if (loading) return <ActivityIndicator style={{ marginTop: 40 }} />;
  if (!data) return <Text style={s.err}>تعذَّر التحميل</Text>;

  return (
    <ScrollView style={s.wrap}>
      <Text style={s.h1}>{data.nameAr}</Text>
      <Text style={s.meta}>{data.code}{data.nameEn ? ` · ${data.nameEn}` : ''}</Text>

      <Text style={s.section}>معلومات الاتصال</Text>
      <Row label="الهاتف"  value={data.phone ?? '—'} />
      <Row label="البريد"  value={data.email ?? '—'} />
      <Row label="العنوان" value={data.address ?? '—'} />

      <Text style={s.section}>الرصيد</Text>
      <Row label="الرصيد المدين"  value={`${Math.round(data.creditBalanceIqd ?? 0).toLocaleString()} د.ع`} />
      <Row label="حد الائتمان"    value={`${Math.round(data.creditLimitIqd ?? 0).toLocaleString()} د.ع`} />
    </ScrollView>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <View style={s.row}>
      <Text style={s.label}>{label}</Text>
      <Text style={s.value}>{value}</Text>
    </View>
  );
}

const s = StyleSheet.create({
  wrap:    { flex: 1, padding: 16, backgroundColor: '#fff' },
  h1:      { fontSize: 22, fontWeight: '700', textAlign: 'right' },
  meta:    { color: '#64748b', marginTop: 4, textAlign: 'right' },
  section: { fontSize: 16, fontWeight: '600', marginTop: 20, marginBottom: 8, textAlign: 'right' },
  row:     { flexDirection: 'row-reverse', justifyContent: 'space-between', paddingVertical: 8, borderBottomWidth: 1, borderColor: '#e2e8f0' },
  label:   { color: '#64748b' },
  value:   { fontWeight: '500' },
  err:     { padding: 24, textAlign: 'center', color: '#dc2626' },
});
