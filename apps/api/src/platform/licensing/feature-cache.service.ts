import { Inject, Injectable, Logger } from '@nestjs/common';
import type Redis from 'ioredis';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { PrismaService } from '../prisma/prisma.service';
import { REDIS_CLIENT } from '../redis/redis.constants';
import { emitRealtime } from '../realtime/emit-realtime';

/**
 * Cached licensing snapshot for a single tenant (company).
 *
 * `features` is a flat list of enabled feature codes derived from:
 *   1. The plan's PlanFeature rows (isEnabled = true), AND
 *   2. SubscriptionFeature overrides (which can additionally enable or
 *      disable features for a specific subscription, optionally with
 *      an expiry).
 *
 * `status` mirrors the underlying Subscription.status so callers can
 * distinguish between expired, suspended, grace, etc. without re-querying.
 */
export interface CompanyLicenseSnapshot {
  companyId: string;
  subscriptionId: string;
  planId: string;
  planCode: string;
  status: string;
  validUntil: string | null;
  graceUntil: string | null;
  features: string[];
}

/**
 * Negative-cache marker for companies with no active subscription.
 * Keeps repeated cache lookups O(1) instead of hitting Postgres each time.
 */
const NO_LICENSE_MARKER = '__NO_LICENSE__';

const TTL_SECONDS = 300;

const REDIS_KEY = (companyId: string): string => `license:features:${companyId}`;

/**
 * FeatureCacheService — Redis-cached lookup of `companyId → planId → features[]`
 * with a 5-minute TTL.
 *
 * The cache MUST be invalidated whenever a company's plan or subscription
 * features change. The `invalidate(companyId)` method does that and ALSO
 * emits a realtime `license.plan.changed` event scoped to the tenant so
 * any connected sessions can react instantly (T31 bidirectional flow).
 */
@Injectable()
export class FeatureCacheService {
  private readonly logger = new Logger(FeatureCacheService.name);

  constructor(
    private readonly prisma: PrismaService,
    @Inject(REDIS_CLIENT) private readonly redis: Redis,
    private readonly events: EventEmitter2,
  ) {}

  /**
   * Get the licensing snapshot for a company. Returns `null` when the
   * company has no active subscription on record.
   *
   * Resolution order: Redis cache → Postgres → cache populate.
   */
  async get(companyId: string): Promise<CompanyLicenseSnapshot | null> {
    const key = REDIS_KEY(companyId);

    const cached = await this.safeGet(key);
    if (cached === NO_LICENSE_MARKER) return null;
    if (cached) {
      try {
        return JSON.parse(cached) as CompanyLicenseSnapshot;
      } catch (err) {
        // Corrupted cache entry — drop and rebuild.
        this.logger.warn(`feature-cache parse error for ${companyId}: ${(err as Error).message}`);
      }
    }

    const fresh = await this.loadFromDb(companyId);
    await this.safeSet(key, fresh ? JSON.stringify(fresh) : NO_LICENSE_MARKER, TTL_SECONDS);
    return fresh;
  }

  /**
   * Drop the cache entry for a company AND emit a realtime event so any
   * running sessions for that tenant pick up the new permission set
   * immediately, without restarting.
   */
  async invalidate(companyId: string): Promise<void> {
    await this.safeDel(REDIS_KEY(companyId));
    emitRealtime(this.events, 'license.plan.changed', {
      companyId,
      reason: 'invalidate',
      at: new Date().toISOString(),
    });
    this.logger.debug(`feature-cache invalidated for ${companyId}`);
  }

  /**
   * Build the snapshot from Postgres. Picks the most recently created
   * subscription that is in an entitlement-granting status. Plan features
   * form the baseline; per-subscription overrides apply on top.
   */
  private async loadFromDb(companyId: string): Promise<CompanyLicenseSnapshot | null> {
    const sub = await this.prisma.subscription.findFirst({
      where: {
        companyId,
        status: { in: ['active', 'trial', 'grace'] },
      },
      orderBy: { createdAt: 'desc' },
      include: {
        plan: {
          include: { features: true },
        },
        featureOverrides: true,
      },
    });

    if (!sub) return null;

    const enabled = new Set<string>();
    for (const pf of sub.plan.features) {
      if (pf.isEnabled) enabled.add(pf.featureCode);
    }

    const now = Date.now();
    for (const ov of sub.featureOverrides) {
      if (ov.expiresAt && ov.expiresAt.getTime() < now) continue;
      if (ov.isEnabled) enabled.add(ov.featureCode);
      else enabled.delete(ov.featureCode);
    }

    const validUntil =
      sub.currentPeriodEndAt?.toISOString() ??
      sub.trialEndsAt?.toISOString() ??
      null;

    return {
      companyId,
      subscriptionId: sub.id,
      planId: sub.planId,
      planCode: sub.plan.code,
      status: sub.status,
      validUntil,
      graceUntil: sub.gracePeriodEndsAt?.toISOString() ?? null,
      features: [...enabled].sort(),
    };
  }

  // ── Redis helpers — never throw upward; cache miss is acceptable. ───────

  private async safeGet(key: string): Promise<string | null> {
    try {
      return await this.redis.get(key);
    } catch (err) {
      this.logger.warn(`redis get(${key}) failed: ${(err as Error).message}`);
      return null;
    }
  }

  private async safeSet(key: string, value: string, ttl: number): Promise<void> {
    try {
      await this.redis.set(key, value, 'EX', ttl);
    } catch (err) {
      this.logger.warn(`redis set(${key}) failed: ${(err as Error).message}`);
    }
  }

  private async safeDel(key: string): Promise<void> {
    try {
      await this.redis.del(key);
    } catch (err) {
      this.logger.warn(`redis del(${key}) failed: ${(err as Error).message}`);
    }
  }
}
