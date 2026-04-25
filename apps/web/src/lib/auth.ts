'use client';

import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import { useEffect } from 'react';
import {
  login as apiLogin,
  verifyMfaLogin as apiVerifyMfaLogin,
  logout as apiLogout,
  me as apiMe,
  setToken,
  type AuthUser,
  type LoginResponse,
  type MfaChallengeResponse,
} from './api';

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

  /**
   * Step 1 of login. Returns either:
   *   - { mfaRequired: true, mfaToken, userId, hint }  → caller shows TOTP form
   *   - { mfaRequired: false, user }                   → fully signed in
   */
  async function login(emailOrUsername: string, password: string): Promise<
    | { mfaRequired: true; mfaToken: string; userId: string; hint: string }
    | { mfaRequired: false; user: AuthUser }
  > {
    const res = await apiLogin(emailOrUsername, password);

    if ('requires2FA' in res && res.requires2FA) {
      // MFA challenge — do NOT set token/user yet; caller must call verifyMfa()
      return { mfaRequired: true, mfaToken: res.mfaToken, userId: res.userId, hint: res.hint };
    }

    // Full login (no MFA required for this user)
    const success = res as { accessToken: string; token?: string; user: AuthUser };
    setAuthToken(success.accessToken ?? success.token ?? null);
    setUser(success.user);
    return { mfaRequired: false, user: success.user };
  }

  /** Step 2 of login (when MFA required) */
  async function verifyMfa(mfaToken: string, code: string): Promise<AuthUser> {
    const res = await apiVerifyMfaLogin(mfaToken, code);
    setAuthToken(res.accessToken ?? res.token ?? null);
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

  return { user, token, initialized, login, verifyMfa, logout };
}
