'use client';

import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import { useEffect } from 'react';
import { login as apiLogin, logout as apiLogout, me as apiMe, setToken, type AuthUser } from './api';

interface AuthState {
  user: AuthUser | null;
  token: string | null;
  initialized: boolean;
  setUser: (user: AuthUser | null) => void;
  setAuthToken: (token: string | null) => void;
  markInitialized: () => void;
}

const useAuthStore = create<AuthState>()(
  persist(
    (set) => ({
      user: null,
      token: null,
      initialized: false,
      setUser: (user) => set({ user }),
      setAuthToken: (token) => {
        setToken(token);
        set({ token });
      },
      markInitialized: () => set({ initialized: true }),
    }),
    {
      name: 'al-ruya-auth',
      storage: createJSONStorage(() => (typeof window !== 'undefined' ? window.localStorage : (undefined as unknown as Storage))),
      partialize: (s) => ({ user: s.user, token: s.token }),
    }
  )
);

export function useAuth() {
  const { user, token, initialized, setUser, setAuthToken, markInitialized } = useAuthStore();

  useEffect(() => {
    if (initialized) return;
    let cancelled = false;
    (async () => {
      if (token) {
        try {
          const u = await apiMe();
          if (!cancelled) setUser(u);
        } catch {
          if (!cancelled) {
            setAuthToken(null);
            setUser(null);
          }
        }
      }
      if (!cancelled) markInitialized();
    })();
    return () => {
      cancelled = true;
    };
  }, [initialized, token, setUser, setAuthToken, markInitialized]);

  async function login(email: string, password: string) {
    const res = await apiLogin(email, password);
    setAuthToken(res.token);
    setUser(res.user);
    return res.user;
  }

  async function logout() {
    try {
      await apiLogout();
    } finally {
      setAuthToken(null);
      setUser(null);
    }
  }

  return { user, token, initialized, login, logout };
}
