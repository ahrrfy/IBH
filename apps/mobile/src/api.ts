import axios from 'axios';
import * as SecureStore from 'expo-secure-store';

const BASE = process.env.EXPO_PUBLIC_API_URL ?? 'http://10.0.2.2:3000';

export const api = axios.create({ baseURL: BASE, timeout: 8000 });

api.interceptors.request.use(async (config) => {
  const token = await SecureStore.getItemAsync('al-ruya.token');
  if (token) {
    config.headers = config.headers ?? {};
    (config.headers as Record<string, string>).Authorization = `Bearer ${token}`;
  }
  return config;
});

export async function login(email: string, password: string): Promise<string> {
  const { data } = await api.post('/auth/login', { email, password });
  await SecureStore.setItemAsync('al-ruya.token', data.accessToken);
  return data.accessToken;
}

export async function logout(): Promise<void> {
  await SecureStore.deleteItemAsync('al-ruya.token');
}
