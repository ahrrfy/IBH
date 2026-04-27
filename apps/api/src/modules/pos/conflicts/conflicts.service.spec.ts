/**
 * Unit tests for PosConflictsService (I003)
 *
 * Tests the three conflict detection rules:
 *   1. price_mismatch: POS price differs from server by > 5%
 *   2. insufficient_stock: server stock < POS qty at sync time
 *   3. product_inactive: variant marked inactive or not found
 *
 * Business invariant: Receipt is ALWAYS posted regardless of conflicts.
 */

import { PosConflictsService, PRICE_TOLERANCE_PCT } from './conflicts.service';

/** Minimal mock factory for Prisma TX client */
function makePrismaMock(overrides: {
  variant?: Partial<{ id: string; isActive: boolean; sku: string }> | null;
  priceItem?: { priceIqd: string | number } | null;
  balance?: { qtyOnHand: string | number } | null;
}) {
  return {
    productVariant: {
      findUnique: jest.fn().mockResolvedValue(
        overrides.variant !== undefined
          ? overrides.variant
          : { id: 'VARIANT01', isActive: true, sku: 'SKU-001' },
      ),
    },
    priceListItem: {
      findFirst: jest.fn().mockResolvedValue(
        overrides.priceItem !== undefined ? overrides.priceItem : null,
      ),
    },
    inventoryBalance: {
      findUnique: jest.fn().mockResolvedValue(
        overrides.balance !== undefined
          ? overrides.balance
          : { qtyOnHand: 100 },
      ),
    },
    posConflictLog: {
      createMany: jest.fn().mockResolvedValue({ count: 0 }),
      findMany: jest.fn().mockResolvedValue([]),
      count: jest.fn().mockResolvedValue(0),
    },
  } as any;
}

function makeService(prismaMock: any) {
  const auditMock = { log: jest.fn().mockResolvedValue(undefined) } as any;
  return new PosConflictsService(prismaMock, auditMock);
}

const BASE_INPUT = {
  receiptId: 'RECEIPT01',
  clientUlid: 'CLIENTULID01234567890123',
  branchId: 'BRANCH001234567890123456',
  lines: [
    {
      variantId: 'VARIANT01234567890123456',
      qty: 2,
      unitPriceIqd: 10000,
    },
  ],
  warehouseId: 'WH000001234567890123456',
};

describe('PosConflictsService.detectConflicts', () => {
  // ── price_mismatch tests ────────────────────────────────────────────────────

  describe('price_mismatch', () => {
    it('should detect no conflict when price is within tolerance', async () => {
      // Server price 10300, POS price 10000 → diff = 3% < 5%
      const prisma = makePrismaMock({
        variant: { id: 'VARIANT01234567890123456', isActive: true, sku: 'SKU-001' },
        priceItem: { priceIqd: 10300 },
        balance: { qtyOnHand: 10 },
      });
      const service = makeService(prisma);

      const conflicts = await service.detectConflicts(BASE_INPUT);

      expect(conflicts.filter((c) => c.conflictType === 'price_mismatch')).toHaveLength(0);
    });

    it('should detect conflict when price exceeds tolerance', async () => {
      // Server price 11000, POS price 10000 → diff = 10% > 5%
      const prisma = makePrismaMock({
        variant: { id: 'VARIANT01234567890123456', isActive: true, sku: 'SKU-001' },
        priceItem: { priceIqd: 11000 },
        balance: { qtyOnHand: 10 },
      });
      const service = makeService(prisma);

      const conflicts = await service.detectConflicts(BASE_INPUT);

      const priceMismatches = conflicts.filter((c) => c.conflictType === 'price_mismatch');
      expect(priceMismatches).toHaveLength(1);
      expect(priceMismatches[0].resolution).toBe('pending_review');
      expect(priceMismatches[0].variantId).toBe('VARIANT01234567890123456');
      expect(priceMismatches[0].posValue).toContain('10000');
      expect(priceMismatches[0].serverValue).toContain('11000');
    });

    it('should detect conflict at exact tolerance boundary (5%)', async () => {
      // diffPct = abs((posPrice - serverPrice) / serverPrice) * 100
      // posPrice=10000, serverPrice=9500 → diff = (10000-9500)/9500 = 5.26% > 5%
      const prisma = makePrismaMock({
        variant: { id: 'VARIANT01234567890123456', isActive: true, sku: 'SKU-001' },
        priceItem: { priceIqd: 9500 }, // POS over server by 5.26%
        balance: { qtyOnHand: 10 },
      });
      const service = makeService(prisma);

      const conflicts = await service.detectConflicts(BASE_INPUT);

      expect(conflicts.filter((c) => c.conflictType === 'price_mismatch')).toHaveLength(1);
    });

    it('should NOT detect conflict when no server price is found', async () => {
      // No price list item on server — no price to compare against
      const prisma = makePrismaMock({
        variant: { id: 'VARIANT01234567890123456', isActive: true, sku: 'SKU-001' },
        priceItem: null,
        balance: { qtyOnHand: 10 },
      });
      const service = makeService(prisma);

      const conflicts = await service.detectConflicts(BASE_INPUT);

      expect(conflicts.filter((c) => c.conflictType === 'price_mismatch')).toHaveLength(0);
    });

    it(`PRICE_TOLERANCE_PCT constant should be ${PRICE_TOLERANCE_PCT}`, () => {
      expect(PRICE_TOLERANCE_PCT).toBe(5);
    });
  });

  // ── insufficient_stock tests ────────────────────────────────────────────────

  describe('insufficient_stock', () => {
    it('should detect conflict when server stock is less than requested qty', async () => {
      // POS requested qty=2, server has qty=1
      const prisma = makePrismaMock({
        variant: { id: 'VARIANT01234567890123456', isActive: true, sku: 'SKU-001' },
        priceItem: null,
        balance: { qtyOnHand: 1 },
      });
      const service = makeService(prisma);

      const conflicts = await service.detectConflicts(BASE_INPUT);

      const stockConflicts = conflicts.filter((c) => c.conflictType === 'insufficient_stock');
      expect(stockConflicts).toHaveLength(1);
      expect(stockConflicts[0].resolution).toBe('pending_review');
      expect(stockConflicts[0].posValue).toContain('qty_requested=2');
      expect(stockConflicts[0].serverValue).toContain('qty_available=1');
    });

    it('should detect conflict when server has ZERO stock', async () => {
      const prisma = makePrismaMock({
        variant: { id: 'VARIANT01234567890123456', isActive: true, sku: 'SKU-001' },
        priceItem: null,
        balance: { qtyOnHand: 0 },
      });
      const service = makeService(prisma);

      const conflicts = await service.detectConflicts(BASE_INPUT);

      expect(conflicts.filter((c) => c.conflictType === 'insufficient_stock')).toHaveLength(1);
    });

    it('should detect conflict when server has NO balance record (treated as 0)', async () => {
      const prisma = makePrismaMock({
        variant: { id: 'VARIANT01234567890123456', isActive: true, sku: 'SKU-001' },
        priceItem: null,
        balance: null, // no balance record = zero stock
      });
      const service = makeService(prisma);

      const conflicts = await service.detectConflicts(BASE_INPUT);

      const stockConflicts = conflicts.filter((c) => c.conflictType === 'insufficient_stock');
      expect(stockConflicts).toHaveLength(1);
      expect(stockConflicts[0].serverValue).toContain('qty_available=0');
    });

    it('should NOT detect stock conflict when server has sufficient stock', async () => {
      const prisma = makePrismaMock({
        variant: { id: 'VARIANT01234567890123456', isActive: true, sku: 'SKU-001' },
        priceItem: null,
        balance: { qtyOnHand: 100 },
      });
      const service = makeService(prisma);

      const conflicts = await service.detectConflicts(BASE_INPUT);

      expect(conflicts.filter((c) => c.conflictType === 'insufficient_stock')).toHaveLength(0);
    });
  });

  // ── product_inactive tests ──────────────────────────────────────────────────

  describe('product_inactive', () => {
    it('should detect conflict when variant is marked inactive server-side', async () => {
      const prisma = makePrismaMock({
        variant: { id: 'VARIANT01234567890123456', isActive: false, sku: 'SKU-001' },
        priceItem: null,
        balance: { qtyOnHand: 10 },
      });
      const service = makeService(prisma);

      const conflicts = await service.detectConflicts(BASE_INPUT);

      const inactiveConflicts = conflicts.filter((c) => c.conflictType === 'product_inactive');
      expect(inactiveConflicts).toHaveLength(1);
      expect(inactiveConflicts[0].resolution).toBe('pending_review');
      expect(inactiveConflicts[0].serverValue).toContain('active=false');
    });

    it('should detect conflict when variant does not exist on server', async () => {
      const prisma = makePrismaMock({
        variant: null, // not found
        priceItem: null,
        balance: null,
      });
      const service = makeService(prisma);

      const conflicts = await service.detectConflicts(BASE_INPUT);

      const inactiveConflicts = conflicts.filter((c) => c.conflictType === 'product_inactive');
      expect(inactiveConflicts).toHaveLength(1);
      expect(inactiveConflicts[0].serverValue).toBe('variant_not_found');
    });

    it('should NOT detect inactive conflict when variant is active', async () => {
      const prisma = makePrismaMock({
        variant: { id: 'VARIANT01234567890123456', isActive: true, sku: 'SKU-001' },
        priceItem: null,
        balance: { qtyOnHand: 10 },
      });
      const service = makeService(prisma);

      const conflicts = await service.detectConflicts(BASE_INPUT);

      expect(conflicts.filter((c) => c.conflictType === 'product_inactive')).toHaveLength(0);
    });
  });

  // ── compound conflict tests ─────────────────────────────────────────────────

  describe('compound conflicts', () => {
    it('should detect multiple conflict types for the same line', async () => {
      // Server: inactive variant, insufficient stock, price mismatch
      const prisma = makePrismaMock({
        variant: { id: 'VARIANT01234567890123456', isActive: false, sku: 'SKU-001' },
        priceItem: { priceIqd: 15000 }, // 50% diff from POS 10000
        balance: { qtyOnHand: 0 },
      });
      const service = makeService(prisma);

      const conflicts = await service.detectConflicts(BASE_INPUT);

      expect(conflicts.filter((c) => c.conflictType === 'product_inactive')).toHaveLength(1);
      // price_mismatch and insufficient_stock checks still run even when variant is inactive
      // (variant exists but inactive — the loop continues)
      expect(conflicts.filter((c) => c.conflictType === 'price_mismatch')).toHaveLength(1);
      expect(conflicts.filter((c) => c.conflictType === 'insufficient_stock')).toHaveLength(1);
    });

    it('should return empty array when everything is clean', async () => {
      const prisma = makePrismaMock({
        variant: { id: 'VARIANT01234567890123456', isActive: true, sku: 'SKU-001' },
        priceItem: { priceIqd: 10100 }, // 1% diff — within tolerance
        balance: { qtyOnHand: 100 },
      });
      const service = makeService(prisma);

      const conflicts = await service.detectConflicts(BASE_INPUT);

      expect(conflicts).toHaveLength(0);
    });
  });
});

describe('PosConflictsService.persistConflicts', () => {
  it('should call createMany with correct data', async () => {
    const prisma = makePrismaMock({});
    const service = makeService(prisma);

    const detectedConflicts = [
      {
        conflictType: 'price_mismatch' as const,
        variantId: 'VARIANT01234567890123456',
        posValue: 'price=10000.000 IQD',
        serverValue: 'price=12000.000 IQD (diff=20.0%)',
        resolution: 'pending_review' as const,
      },
    ];

    await service.persistConflicts('COMPANY01', BASE_INPUT, detectedConflicts);

    expect(prisma.posConflictLog.createMany).toHaveBeenCalledWith({
      data: [
        expect.objectContaining({
          companyId: 'COMPANY01',
          branchId: BASE_INPUT.branchId,
          receiptId: BASE_INPUT.receiptId,
          clientUlid: BASE_INPUT.clientUlid,
          conflictType: 'price_mismatch',
          variantId: 'VARIANT01234567890123456',
          posValue: 'price=10000.000 IQD',
          serverValue: 'price=12000.000 IQD (diff=20.0%)',
          resolution: 'pending_review',
        }),
      ],
    });
  });

  it('should not call createMany when conflicts list is empty', async () => {
    const prisma = makePrismaMock({});
    const service = makeService(prisma);

    await service.persistConflicts('COMPANY01', BASE_INPUT, []);

    expect(prisma.posConflictLog.createMany).not.toHaveBeenCalled();
  });
});
