/**
 * Simple client-side auth backed by localStorage.
 * Middleware reads the same token from a mirrored cookie so SSR can gate routes.
 */

const TOKEN_KEY = 'al_ruya_token';
const PHONE_KEY = 'al_ruya_phone';
const COOKIE_NAME = 'al_ruya_token';

function isBrowser(): boolean {
  return typeof window !== 'undefined';
}

function setCookie(name: string, value: string, days = 30) {
  if (!isBrowser()) return;
  const maxAge = days * 24 * 60 * 60;
  document.cookie = `${name}=${encodeURIComponent(value)}; Path=/; Max-Age=${maxAge}; SameSite=Lax`;
}

function clearCookie(name: string) {
  if (!isBrowser()) return;
  document.cookie = `${name}=; Path=/; Max-Age=0; SameSite=Lax`;
}

export function setToken(token: string, phone?: string) {
  if (!isBrowser()) return;
  localStorage.setItem(TOKEN_KEY, token);
  if (phone) localStorage.setItem(PHONE_KEY, phone);
  setCookie(COOKIE_NAME, token);
}

export function getToken(): string | null {
  if (!isBrowser()) return null;
  return localStorage.getItem(TOKEN_KEY);
}

export function getPhone(): string | null {
  if (!isBrowser()) return null;
  return localStorage.getItem(PHONE_KEY);
}

export function isLoggedIn(): boolean {
  return !!getToken();
}

export function logout() {
  if (!isBrowser()) return;
  localStorage.removeItem(TOKEN_KEY);
  localStorage.removeItem(PHONE_KEY);
  clearCookie(COOKIE_NAME);
}
