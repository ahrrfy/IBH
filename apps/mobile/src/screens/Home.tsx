import { View, Text, Pressable, StyleSheet } from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { RootStackParamList } from '../../App';

type Props = NativeStackScreenProps<RootStackParamList, 'Home'>;

export default function HomeScreen({ navigation }: Props) {
  return (
    <View style={s.wrap}>
      <Text style={s.h1}>مرحباً</Text>
      <Tile label="أوامر البيع"  onPress={() => navigation.navigate('Orders')} />
      <Tile label="العملاء"        onPress={() => navigation.navigate('Customers')} />
    </View>
  );
}

function Tile({ label, onPress }: { label: string; onPress: () => void }) {
  return (
    <Pressable style={s.tile} onPress={onPress}>
      <Text style={s.tileText}>{label}</Text>
    </Pressable>
  );
}

const s = StyleSheet.create({
  wrap:     { flex: 1, padding: 16, backgroundColor: '#f1f5f9' },
  h1:       { fontSize: 24, fontWeight: '700', marginBottom: 16, textAlign: 'right' },
  tile:     { backgroundColor: '#fff', padding: 20, borderRadius: 10, marginBottom: 12, elevation: 2 },
  tileText: { fontSize: 18, textAlign: 'right' },
});
