import { useEffect, useState } from 'react';
import { View, Text, FlatList, StyleSheet, ActivityIndicator } from 'react-native';
import { api } from '../api';

interface Order { id: string; number: string; customer?: { nameAr?: string }; totalIqd: number; status: string }

export default function OrdersScreen() {
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
        <View style={s.row}>
          <Text style={s.num}>{item.number}</Text>
          <Text style={s.cust}>{item.customer?.nameAr ?? '—'}</Text>
          <Text style={s.total}>{Math.round(item.totalIqd).toLocaleString()} د.ع</Text>
        </View>
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
