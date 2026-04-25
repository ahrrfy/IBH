import { useEffect, useState } from 'react';
import { View, Text, FlatList, StyleSheet, ActivityIndicator, Pressable } from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { api } from '../api';
import type { RootStackParamList } from '../../App';

type Props = NativeStackScreenProps<RootStackParamList, 'Customers'>;

interface Customer { id: string; nameAr: string; phone?: string; creditBalanceIqd?: number }

export default function CustomersScreen({ navigation }: Props) {
  const [items, setItems] = useState<Customer[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.get<{ items: Customer[] }>('/sales/customers')
      .then((r) => setItems(r.data.items ?? []))
      .catch(() => setItems([]))
      .finally(() => setLoading(false));
  }, []);

  if (loading) return <ActivityIndicator style={{ marginTop: 40 }} />;

  return (
    <FlatList
      data={items}
      keyExtractor={(c) => c.id}
      ListEmptyComponent={<Text style={s.empty}>لا يوجد عملاء</Text>}
      renderItem={({ item }) => (
        <Pressable style={s.row} onPress={() => navigation.navigate('CustomerDetail', { id: item.id })}>
          <Text style={s.name}>{item.nameAr}</Text>
          <Text style={s.phone}>{item.phone ?? '—'}</Text>
        </Pressable>
      )}
    />
  );
}

const s = StyleSheet.create({
  row:   { padding: 14, borderBottomWidth: 1, borderColor: '#e2e8f0', flexDirection: 'row-reverse', justifyContent: 'space-between' },
  name:  { fontWeight: '600', flex: 1, textAlign: 'right' },
  phone: { color: '#64748b' },
  empty: { textAlign: 'center', padding: 40, color: '#64748b' },
});
