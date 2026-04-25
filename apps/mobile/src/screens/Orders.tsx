import { useEffect, useState } from 'react';
import { View, Text, FlatList, StyleSheet, ActivityIndicator, Pressable } from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { api } from '../api';
import type { RootStackParamList } from '../../App';

interface Order { id: string; number: string; customer?: { nameAr?: string }; totalIqd: number; status: string }

type Props = NativeStackScreenProps<RootStackParamList, 'Orders'>;

export default function OrdersScreen({ navigation }: Props) {
  const [items, setItems] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.get<{ items: Order[] }>('/sales/orders')
      .then((r) => setItems(r.data.items ?? []))
      .catch(() => setItems([]))
      .finally(() => setLoading(false));
  }, []);

  if (loading) return <ActivityIndicator style={{ marginTop: 40 }} />;

  return (
    <FlatList
      data={items}
      keyExtractor={(o) => o.id}
      ListEmptyComponent={<Text style={s.empty}>لا توجد أوامر</Text>}
      renderItem={({ item }) => (
        <Pressable style={s.row} onPress={() => navigation.navigate('OrderDetail', { id: item.id })}>
          <Text style={s.num}>{item.number}</Text>
          <Text style={s.cust}>{item.customer?.nameAr ?? '—'}</Text>
          <Text style={s.total}>{Math.round(item.totalIqd).toLocaleString()} د.ع</Text>
        </Pressable>
      )}
    />
  );
}

const s = StyleSheet.create({
  row:   { padding: 14, borderBottomWidth: 1, borderColor: '#e2e8f0', flexDirection: 'row-reverse', justifyContent: 'space-between' },
  num:   { fontWeight: '700', color: '#0369a1' },
  cust:  { flex: 1, textAlign: 'center' },
  total: { fontWeight: '600' },
  empty: { textAlign: 'center', padding: 40, color: '#64748b' },
});
