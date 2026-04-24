// ─── Standard API Response Envelope ──────────────────────────────────────────
// ALL API responses follow this shape — no exceptions.

export interface ApiSuccess<T> {
  success: true;
  data: T;
  meta?: ResponseMeta;
}

export interface ApiError {
  success: false;
  error: {
    code: ErrorCode;
    message: string;           // English (for logs)
    messageAr: string;         // Arabic (for users)
    details?: unknown;         // validation errors, etc.
    traceId?: string;          // for support lookup
  };
}

export type ApiResponse<T> = ApiSuccess<T> | ApiError;

export interface ResponseMeta {
  requestId: string;
  timestamp: string;
  duration?: number;          // ms
  version?: string;           // API version
}

// ─── Error Codes ──────────────────────────────────────────────────────────────
export type ErrorCode =
  // Auth
  | 'UNAUTHORIZED'
  | 'FORBIDDEN'
  | 'TOKEN_EXPIRED'
  | 'INVALID_2FA'
  | 'ACCOUNT_LOCKED'
  // Validation
  | 'VALIDATION_ERROR'
  | 'INVALID_INPUT'
  // Business Rules
  | 'INSUFFICIENT_STOCK'
  | 'NEGATIVE_STOCK_FORBIDDEN'
  | 'PERIOD_LOCKED'
  | 'DUPLICATE_ENTRY'
  | 'APPROVAL_REQUIRED'
  | 'DISCOUNT_EXCEEDS_LIMIT'
  | 'CREDIT_LIMIT_EXCEEDED'
  | 'PAYMENT_MISMATCH'
  | 'THREE_WAY_MATCH_FAILED'
  | 'SHIFT_NOT_OPEN'
  | 'SHIFT_ALREADY_CLOSED'
  // Data
  | 'NOT_FOUND'
  | 'CONFLICT'
  | 'IMMUTABLE_RECORD'
  // System
  | 'INTERNAL_ERROR'
  | 'SERVICE_UNAVAILABLE'
  | 'RATE_LIMIT_EXCEEDED'
  | 'LICENSE_EXPIRED'
  | 'FEATURE_NOT_LICENSED';
