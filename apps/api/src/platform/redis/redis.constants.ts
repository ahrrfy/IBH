export const REDIS_CLIENT = 'REDIS_CLIENT';

/** Redis key namespaces */
export const REDIS_KEYS = {
  session:        (userId: string)      => `session:${userId}`,
  revokedToken:   (jti: string)         => `revoked:${jti}`,
  loginAttempts:  (email: string)       => `login_attempts:${email}`,
  rateLimit:      (ip: string)          => `rate:${ip}`,
  policyCache:    (companyId: string)   => `policy:${companyId}`,
  sequenceKey:    (key: string)         => `seq:${key}`,
} as const;
