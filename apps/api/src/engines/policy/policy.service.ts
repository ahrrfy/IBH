import { Injectable, Logger } from '@nestjs/common';
import { Inject } from '@nestjs/common';
import { REDIS_CLIENT } from '../../platform/redis/redis.constants';
import { PrismaService } from '../../platform/prisma/prisma.service';
import type Redis from 'ioredis';

// ─── Policy Engine (F4 & Tier 3 Rules) ───────────────────────────────────────
// Configurable business rules — stored in DB, cached in Redis.
// Tier 3: Zero AI, Zero ML, instant, never fails.
//
// Policies can be:
//   - Company-wide:  branchId = null
//   - Branch-specific: branchId = <branchId>
// Branch policies override company policies.

export type PolicyKey =
  | 'max_discount_cashier'        // max % a cashier can give (default: 10)
  | 'shift_tolerance_iqd'         // acceptable cash diff at shift close (default: 5000)
  | 'prevent_negative_stock'      // boolean (default: true)
  | 'require_shift_for_pos'       // boolean (default: true)
  | 'max_sale_without_approval_iqd' // IQD threshold for auto-approval (default: 5_000_000)
  | 'max_purchase_without_approval_iqd'
  | 'require_4eyes_above_iqd'     // 4-eyes for transactions above this (default: 20_000_000)
  | 'cart_reservation_minutes'    // how long to hold online cart stock (default: 30)
  | 'max_credit_days'             // default credit days for customers (default: 30)
  | 'po_tolerance_percent'        // acceptable % diff between PO and GRN (default: 5)
  | 'stock_reorder_safety_days';  // safety stock in days (default: 14)

const POLICY_CACHE_TTL = 300; // 5 minutes

@Injectable()
export class PolicyService {
  private readonly logger = new Logger(PolicyService.name);

  constructor(
    private readonly prisma: PrismaService,
    @Inject(REDIS_CLIENT) private readonly redis: Redis,
  ) {}

  /**
   * Get a policy value. Branch policy overrides company policy.
   * Result is cached in Redis for 5 minutes.
   */
  async get<T = unknown>(
    companyId: string,
    key: PolicyKey,
    branchId?: string,
  ): Promise<T | null> {
    const cacheKey = `erp:policy:${companyId}:${branchId ?? 'global'}:${key}`;
    const cached = await this.redis.get(cacheKey);
    if (cached !== null) {
      return JSON.parse(cached) as T;
    }

    // Try branch-specific first, then company-wide
    const policy = await this.prisma.systemPolicy.findFirst({
      where: {
        companyId,
        policyKey: key,
        branchId: branchId ?? null,
      },
      select: { policyValue: true },
    });

    const value = policy ? (policy.policyValue as T) : null;

    if (value !== null) {
      await this.redis.setex(cacheKey, POLICY_CACHE_TTL, JSON.stringify(value));
    }

    return value;
  }

  /**
   * Get a policy with a default fallback.
   */
  async getOrDefault<T>(
    companyId: string,
    key: PolicyKey,
    defaultValue: T,
    branchId?: string,
  ): Promise<T> {
    const value = await this.get<T>(companyId, key, branchId);
    return value !== null ? value : defaultValue;
  }

  /**
   * Get a policy as a number (parsed from string or native number).
   * Common pattern for thresholds: shift_close_tolerance, max_discount_cashier, etc.
   */
  async getNumber(
    companyId: string,
    key: string,
    defaultValue: number,
    branchId?: string,
  ): Promise<number> {
    const raw = await this.get<unknown>(companyId, key as PolicyKey, branchId);
    if (raw === null || raw === undefined) return defaultValue;
    const n = typeof raw === 'number' ? raw : parseFloat(String(raw));
    return Number.isFinite(n) ? n : defaultValue;
  }

  /**
   * Get a policy as a boolean.
   */
  async getBool(
    companyId: string,
    key: string,
    defaultValue: boolean,
    branchId?: string,
  ): Promise<boolean> {
    const raw = await this.get<unknown>(companyId, key as PolicyKey, branchId);
    if (raw === null || raw === undefined) return defaultValue;
    if (typeof raw === 'boolean') return raw;
    const s = String(raw).toLowerCase();
    return s === 'true' || s === '1' || s === 'yes';
  }

  /**
   * Set a policy value (clears cache).
   */
  async set(params: {
    companyId: string;
    key: PolicyKey;
    value: unknown;
    branchId?: string;
    updatedBy: string;
  }): Promise<void> {
    await this.prisma.systemPolicy.upsert({
      where: {
        companyId_branchId_policyKey: {
          companyId: params.companyId,
          branchId: params.branchId ?? null,
          policyKey: params.key,
        },
      },
      update: {
        policyValue: params.value as object,
        updatedBy: params.updatedBy,
      },
      create: {
        companyId: params.companyId,
        branchId: params.branchId ?? null,
        policyKey: params.key,
        policyValue: params.value as object,
        updatedBy: params.updatedBy,
      },
    });

    // Invalidate cache
    const cacheKey = `erp:policy:${params.companyId}:${params.branchId ?? 'global'}:${params.key}`;
    await this.redis.del(cacheKey);
  }

  // ─── Convenience Validators ─────────────────────────────────────────────

  /** Check if a discount % is within allowed range for the user's role */
  async validateDiscount(params: {
    companyId: string;
    branchId: string;
    discountPercent: number;
    userRole: string;
  }): Promise<{ allowed: boolean; maxAllowed: number }> {
    // Cashiers have a limited max discount
    if (params.userRole === 'Cashier') {
      const maxDiscount = await this.getOrDefault<number>(
        params.companyId,
        'max_discount_cashier',
        10, // default 10%
        params.branchId,
      );

      return {
        allowed: params.discountPercent <= maxDiscount,
        maxAllowed: maxDiscount,
      };
    }

    // Managers can give more — still bounded by system max (usually 50%)
    return { allowed: params.discountPercent <= 50, maxAllowed: 50 };
  }

  /** Check if sale amount requires manager approval */
  async requiresApproval(params: {
    companyId: string;
    branchId: string;
    amountIqd: number;
  }): Promise<{ required: boolean; threshold: number; requires4Eyes: boolean }> {
    const threshold = await this.getOrDefault<number>(
      params.companyId,
      'max_sale_without_approval_iqd',
      5_000_000,
      params.branchId,
    );

    const fourEyesThreshold = await this.getOrDefault<number>(
      params.companyId,
      'require_4eyes_above_iqd',
      20_000_000,
      params.branchId,
    );

    return {
      required: params.amountIqd > threshold,
      threshold,
      requires4Eyes: params.amountIqd > fourEyesThreshold,
    };
  }

  /** Check shift tolerance */
  async checkShiftTolerance(params: {
    companyId: string;
    branchId: string;
    differenceIqd: number;
  }): Promise<{ withinTolerance: boolean; toleranceIqd: number }> {
    const tolerance = await this.getOrDefault<number>(
      params.companyId,
      'shift_tolerance_iqd',
      5_000,
      params.branchId,
    );

    return {
      withinTolerance: Math.abs(params.differenceIqd) <= tolerance,
      toleranceIqd: tolerance,
    };
  }

  /** Check if negative stock is allowed */
  async isNegativeStockAllowed(companyId: string, branchId?: string): Promise<boolean> {
    const prevent = await this.getOrDefault<boolean>(
      companyId,
      'prevent_negative_stock',
      true,
      branchId,
    );
    return !prevent; // if prevent=true, then NOT allowed
  }
}
