import { useEffect, useState } from 'react';
import { View, Text, ScrollView, StyleSheet, ActivityIndicator } from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { api } from '../api';
import type { RootStackParamList } from '../../App';

type Props = NativeStackScreenProps<RootStackParamList, 'OrderDetail'>;

interface Line { id: string; variant?: { nameAr?: string }; variantId: string; qty: number; unitPriceIqd: number; lineTotalIqd: number }
interface Order {
  id: string;
  number: string;
  customer?: { nameAr?: string };
  status: string;
  totalIqd: number;
  lines: Line[];
}

export default function OrderDetailScreen({ route }: Props) {
  const { id } = route.params;
  const [data, setData] = useState<Order | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.get<Order>(`/sales/orders/${id}`)
      .then((r) => setData(r.data))
      .catch(() => setData(null))
      .finally(() => setLoading(false));
  }, [id]);

  if (loading) return <ActivityIndicator style={{ marginTop: 40 }} />;
  if (!data) return <Text style={s.err}>تعذَّر التحميل</Text>;

  return (
    <ScrollView style={s.wrap}>
      <Text style={s.h1}>{data.number}</Text>
      <Text style={s.meta}>{data.customer?.nameAr ?? '—'} · {data.status}</Text>
      <Text style={s.total}>{Math.round(data.totalIqd).toLocaleString()} د.ع</Text>

      <Text style={s.section}>البنود</Text>
      {data.lines.map((l) => (
        <View key={l.id} style={s.line}>
          <Text style={s.lineName}>{l.variant?.nameAr ?? l.variantId}</Text>
          <Text style={s.lineQty}>{l.qty} × {Math.round(l.unitPriceIqd).toLocaleString()}</Text>
          <Text style={s.lineTotal}>{Math.round(l.lineTotalIqd).toLocaleString()}</Text>
        </View>
      ))}
    </ScrollView>
  );
}

const s = StyleSheet.create({
  wrap:      { flex: 1, padding: 16, backgroundColor: '#fff' },
  h1:        { fontSize: 22, fontWeight: '700', textAlign: 'right' },
  meta:      { color: '#64748b', marginTop: 4, textAlign: 'right' },
  total:     { fontSize: 20, fontWeight: '700', marginTop: 8, textAlign: 'right' },
  section:   { fontSize: 16, fontWeight: '600', marginTop: 20, marginBottom: 8, textAlign: 'right' },
  line:      { flexDirection: 'row-reverse', justifyContent: 'space-between', paddingVertical: 8, borderBottomWidth: 1, borderColor: '#e2e8f0' },
  lineName:  { flex: 1, textAlign: 'right' },
  lineQty:   { color: '#64748b' },
  lineTotal: { fontWeight: '600' },
  err:       { padding: 24, textAlign: 'center', color: '#dc2626' },
});
