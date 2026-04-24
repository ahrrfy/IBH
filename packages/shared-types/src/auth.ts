import type { ULID, DateTimeISO } from './common';
import type { SystemRole } from './permissions';

// ─── Auth & Session Types ─────────────────────────────────────────────────────

export interface UserSession {
  userId: ULID;
  companyId: ULID;
  branchId: ULID | null;
  tenantId: ULID;           // alias for companyId in multi-tenant context
  roles: SystemRole[];
  permissions: string[];    // cached flat list: "Invoice:Create", "Invoice:Approve"...
  locale: 'ar' | 'en' | 'ku';
  expiresAt: DateTimeISO;
  deviceId: string;
  ipAddress: string;
}

export interface JwtPayload {
  sub: ULID;               // userId
  cid: ULID;               // companyId
  bid: ULID | null;        // branchId
  roles: string[];
  iat: number;
  exp: number;
  jti: string;             // unique token ID for revocation
}

export interface RefreshTokenPayload {
  sub: ULID;
  jti: string;
  deviceId: string;
  iat: number;
  exp: number;
}

export interface LoginRequest {
  email: string;
  password: string;
  deviceId: string;
  companyCode?: string;    // for multi-company login
}

export interface LoginResponse {
  accessToken: string;     // JWT, 15 min expiry
  refreshToken: string;    // JWT, 30 days expiry
  user: AuthenticatedUser;
}

export interface AuthenticatedUser {
  id: ULID;
  email: string;
  nameAr: string;
  nameEn?: string;
  companyId: ULID;
  companyNameAr: string;
  branchId: ULID | null;
  branchNameAr: string | null;
  roles: SystemRole[];
  avatarUrl: string | null;
  locale: 'ar' | 'en' | 'ku';
  requires2FA: boolean;
  twoFactorVerified: boolean;
}

export interface TwoFactorRequest {
  userId: ULID;
  code: string;            // 6-digit TOTP
}

export interface PasswordChangeRequest {
  currentPassword: string;
  newPassword: string;     // min 10 chars, complexity enforced
}

export type DeviceType = 'web' | 'desktop-tauri' | 'mobile-ios' | 'mobile-android' | 'pos';
