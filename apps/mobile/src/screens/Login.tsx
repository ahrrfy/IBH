import { useState } from 'react';
import { View, Text, TextInput, Pressable, StyleSheet, Alert } from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { login } from '../api';
import type { RootStackParamList } from '../../App';

type Props = NativeStackScreenProps<RootStackParamList, 'Login'>;

export default function LoginScreen({ navigation }: Props) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);

  async function onSubmit() {
    setBusy(true);
    try {
      await login(email, password);
      navigation.replace('Home');
    } catch (e: any) {
      Alert.alert('فشل تسجيل الدخول', e?.response?.data?.messageAr ?? 'تحقق من البيانات');
    } finally {
      setBusy(false);
    }
  }

  return (
    <View style={s.wrap}>
      <Text style={s.title}>الرؤية العربية</Text>
      <TextInput style={s.input} placeholder="البريد" autoCapitalize="none" value={email} onChangeText={setEmail} />
      <TextInput style={s.input} placeholder="كلمة المرور" secureTextEntry value={password} onChangeText={setPassword} />
      <Pressable style={[s.btn, busy && s.btnDisabled]} onPress={onSubmit} disabled={busy}>
        <Text style={s.btnText}>{busy ? '...' : 'دخول'}</Text>
      </Pressable>
    </View>
  );
}

const s = StyleSheet.create({
  wrap:  { flex: 1, padding: 24, justifyContent: 'center', backgroundColor: '#fff' },
  title: { fontSize: 28, fontWeight: '700', textAlign: 'center', marginBottom: 24 },
  input: { borderWidth: 1, borderColor: '#cbd5e1', borderRadius: 8, padding: 12, marginBottom: 12, textAlign: 'right' },
  btn:   { backgroundColor: '#0369a1', padding: 14, borderRadius: 8, alignItems: 'center' },
  btnDisabled: { opacity: 0.5 },
  btnText: { color: '#fff', fontWeight: '600' },
});
