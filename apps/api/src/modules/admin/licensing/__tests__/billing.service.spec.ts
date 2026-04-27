/**
 * T70 — BillingService unit tests.
 *
 * Covers:
 *   - listInvoices: filtering by status & companyId, pagination
 *   - markPaid: creates LicensePayment, idempotent on duplicate reference
 *   - markFailed: only on open/failed; rejects paid/voided
 *   - retryFailedInvoice: only on failed
 *   - voidInvoice: only on open/failed
 *   - generatePeriodInvoices: creates one invoice per due subscription,
 *     skips already-invoiced periods on re-run (idempotent)
 *
 * Prisma is stubbed in-memory.
 */
import { BillingService } from '../billing.service';
import { BadRequestException, NotFoundException } from '@nestjs/common';

interface FakeInvoice {
  id: string;
  companyId: string;
  subscriptionId: string;
  periodStart: Date;
  periodEnd: Date;
  amountIqd: any;
  status: string;
  dueDate: Date | null;
  paidAt: Date | null;
  paymentMethod: string;
  paymentReference: string | null;
  notes: string | null;
  createdAt: Date;
  updatedAt: Date;
  createdBy: string | null;
}
interface FakePayment {
  id: string;
  invoiceId: string;
  amountIqd: any;
  paidAt: Date;
  method: string;
  reference: string | null;
  recordedBy: string | null;
  notes: string | null;
  status: string;
  createdAt: Date;
}
interface FakeSub {
  id: string;
  companyId: string;
  planId: string;
  status: string;
  billingCycle: 'monthly' | 'annual' | 'bundle';
  priceIqd: any;
  currentPeriodStartAt: Date | null;
  currentPeriodEndAt: Date | null;
  plan?: { monthlyPriceIqd: any };
}

function dec(v: number) {
  const obj: any = Object(v);
  obj.toString = () => String(v);
  return obj;
}

function makePrisma(initial: {
  invoices?: FakeInvoice[];
  payments?: FakePayment[];
  subs?: FakeSub[];
  companies?: any[];
}) {
  const invoices = initial.invoices ?? [];
  const payments = initial.payments ?? [];
  const subs = initial.subs ?? [];
  const companies = initial.companies ?? [];
  let nextId = 1000;

  const matchWhere = (row: any, where: any): boolean => {
    if (!where) return true;
    for (const [k, v] of Object.entries(where)) {
      if (v && typeof v === 'object' && !(v instanceof Date)) {
        const cond = v as any;
        if ('in' in cond && !cond.in.includes(row[k])) return false;
        if ('gte' in cond && !(row[k] >= cond.gte)) return false;
        if ('lte' in cond && !(row[k] <= cond.lte)) return false;
        if ('lt' in cond && !(row[k] < cond.lt)) return false;
        if ('gt' in cond && !(row[k] > cond.gt)) return false;
        if ('not' in cond && cond.not === null && row[k] === null) return false;
      } else {
        if (row[k] !== v) return false;
      }
    }
    return true;
  };

  const licenseInvoice = {
    findUnique: async ({ where }: any) =>
      invoices.find((i) => i.id === where.id) ?? null,
    findFirst: async ({ where }: any) =>
      invoices.find((i) => matchWhere(i, where)) ?? null,
    findMany: async ({ where, skip = 0, take = 50, orderBy }: any) => {
      let rows = invoices.filter((i) => matchWhere(i, where));
      if (orderBy?.createdAt) {
        rows = [...rows].sort((a, b) =>
          orderBy.createdAt === 'desc'
            ? b.createdAt.getTime() - a.createdAt.getTime()
            : a.createdAt.getTime() - b.createdAt.getTime(),
        );
      }
      // attach include shape
      return rows.slice(skip, skip + take).map((r) => ({
        ...r,
        subscription: {
          ...(subs.find((s) => s.id === r.subscriptionId) ?? {}),
          plan: { code: 'starter', name: 'Starter' },
        },
        payments: payments.filter((p) => p.invoiceId === r.id),
      }));
    },
    count: async ({ where }: any) =>
      invoices.filter((i) => matchWhere(i, where)).length,
    create: async ({ data }: any) => {
      const exists = invoices.find(
        (i) =>
          i.subscriptionId === data.subscriptionId &&
          i.periodStart.getTime() === new Date(data.periodStart).getTime() &&
          i.periodEnd.getTime() === new Date(data.periodEnd).getTime(),
      );
      if (exists) throw new Error('UNIQUE_VIOLATION');
      const inv: FakeInvoice = {
        id: `INV${nextId++}`,
        companyId: data.companyId,
        subscriptionId: data.subscriptionId,
        periodStart: new Date(data.periodStart),
        periodEnd: new Date(data.periodEnd),
        amountIqd: dec(Number(data.amountIqd)),
        status: data.status ?? 'open',
        dueDate: data.dueDate ?? null,
        paidAt: null,
        paymentMethod: data.paymentMethod ?? 'pending',
        paymentReference: null,
        notes: null,
        createdAt: new Date(),
        updatedAt: new Date(),
        createdBy: null,
      };
      invoices.push(inv);
      return inv;
    },
    update: async ({ where, data }: any) => {
      const inv = invoices.find((i) => i.id === where.id)!;
      Object.assign(inv, data, { updatedAt: new Date() });
      return inv;
    },
  };

  const licensePayment = {
    findFirst: async ({ where }: any) =>
      payments.find((p) => matchWhere(p, where)) ?? null,
    create: async ({ data }: any) => {
      const p: FakePayment = {
        id: `PAY${nextId++}`,
        invoiceId: data.invoiceId,
        amountIqd: data.amountIqd,
        paidAt: data.paidAt ?? new Date(),
        method: data.method,
        reference: data.reference ?? null,
        recordedBy: data.recordedBy ?? null,
        notes: data.notes ?? null,
        status: data.status ?? 'recorded',
        createdAt: new Date(),
      };
      payments.push(p);
      return p;
    },
  };

  const subscription = {
    findMany: async ({ where }: any) =>
      subs
        .filter((s) => {
          if (where?.status?.in && !where.status.in.includes(s.status)) return false;
          if (where?.currentPeriodEndAt?.lt && !(s.currentPeriodEndAt && s.currentPeriodEndAt < where.currentPeriodEndAt.lt))
            return false;
          if (where?.currentPeriodEndAt?.not === null && s.currentPeriodEndAt === null)
            return false;
          return true;
        })
        .map((s) => ({ ...s })),
  };

  const company = {
    findMany: async ({ where }: any) =>
      companies.filter((c) => where.id.in.includes(c.id)),
    findUnique: async ({ where }: any) =>
      companies.find((c) => c.id === where.id) ?? null,
  };

  const tx = { licenseInvoice, licensePayment, subscription, company };
  return Object.assign({}, tx, {
    $transaction: async (fn: any) => fn(tx),
    _state: { invoices, payments, subs },
  });
}

function makeAudit() {
  const calls: any[] = [];
  return { audit: { log: async (p: any) => calls.push(p) } as any, calls };
}

const ACTOR = 'U-ADMIN';

function fixtureSubs(): FakeSub[] {
  return [
    {
      id: 'SUB-A',
      companyId: 'CO-A',
      planId: 'P1',
      status: 'active',
      billingCycle: 'monthly',
      priceIqd: dec(50_000),
      currentPeriodStartAt: new Date('2026-03-01'),
      currentPeriodEndAt: new Date('2026-04-01'),
      plan: { monthlyPriceIqd: dec(50_000) },
    },
    {
      id: 'SUB-B',
      companyId: 'CO-B',
      planId: 'P1',
      status: 'active',
      billingCycle: 'monthly',
      priceIqd: dec(150_000),
      currentPeriodStartAt: new Date('2026-03-15'),
      currentPeriodEndAt: new Date('2026-04-15'),
      plan: { monthlyPriceIqd: dec(150_000) },
    },
  ];
}

function fixtureInvoices(): FakeInvoice[] {
  const base = (over: Partial<FakeInvoice>): FakeInvoice => ({
    id: '',
    companyId: 'CO-A',
    subscriptionId: 'SUB-A',
    periodStart: new Date('2026-01-01'),
    periodEnd: new Date('2026-02-01'),
    amountIqd: dec(50_000),
    status: 'open',
    dueDate: null,
    paidAt: null,
    paymentMethod: 'pending',
    paymentReference: null,
    notes: null,
    createdAt: new Date('2026-02-02'),
    updatedAt: new Date('2026-02-02'),
    createdBy: null,
    ...over,
  });
  return [
    base({ id: 'I1', status: 'open', periodStart: new Date('2026-01-01'), periodEnd: new Date('2026-02-01') }),
    base({ id: 'I2', status: 'paid', periodStart: new Date('2026-02-01'), periodEnd: new Date('2026-03-01'), paidAt: new Date('2026-03-02') }),
    base({ id: 'I3', companyId: 'CO-B', subscriptionId: 'SUB-B', status: 'failed', periodStart: new Date('2026-02-15'), periodEnd: new Date('2026-03-15') }),
  ];
}

describe('BillingService (T70)', () => {
  it('listInvoices: filters by status', async () => {
    const prisma: any = makePrisma({ invoices: fixtureInvoices(), companies: [{ id: 'CO-A', code: 'A', nameAr: 'أ', nameEn: 'A' }, { id: 'CO-B', code: 'B', nameAr: 'ب', nameEn: 'B' }] });
    const { audit } = makeAudit();
    const svc = new BillingService(prisma, audit);
    const res = await svc.listInvoices({ status: 'open' });
    expect(res.total).toBe(1);
    expect(res.items[0].id).toBe('I1');
  });

  it('listInvoices: paginates', async () => {
    const prisma: any = makePrisma({ invoices: fixtureInvoices(), companies: [{ id: 'CO-A', code: 'A', nameAr: 'أ', nameEn: 'A' }, { id: 'CO-B', code: 'B', nameAr: 'ب', nameEn: 'B' }] });
    const { audit } = makeAudit();
    const svc = new BillingService(prisma, audit);
    const res = await svc.listInvoices({ page: 1, limit: 2 });
    expect(res.items.length).toBe(2);
    expect(res.total).toBe(3);
    expect(res.page).toBe(1);
  });

  it('markPaid: records LicensePayment and flips status', async () => {
    const prisma: any = makePrisma({ invoices: fixtureInvoices() });
    const { audit, calls } = makeAudit();
    const svc = new BillingService(prisma, audit);
    const updated = await svc.markPaid('I1', { method: 'manual', reference: 'WIRE-123' }, ACTOR);
    expect(updated!.status).toBe('paid');
    expect(prisma._state.payments).toHaveLength(1);
    expect(prisma._state.payments[0].reference).toBe('WIRE-123');
    expect(calls[0].action).toBe('INVOICE_MARKED_PAID');
  });

  it('markPaid: idempotent on duplicate reference', async () => {
    const prisma: any = makePrisma({ invoices: fixtureInvoices() });
    const { audit } = makeAudit();
    const svc = new BillingService(prisma, audit);
    await svc.markPaid('I1', { method: 'manual', reference: 'REF-DUP' }, ACTOR);
    await svc.markPaid('I1', { method: 'manual', reference: 'REF-DUP' }, ACTOR);
    expect(prisma._state.payments).toHaveLength(1);
  });

  it('markFailed: rejects paid invoice', async () => {
    const prisma: any = makePrisma({ invoices: fixtureInvoices() });
    const { audit } = makeAudit();
    const svc = new BillingService(prisma, audit);
    await expect(svc.markFailed('I2', {}, ACTOR)).rejects.toBeInstanceOf(BadRequestException);
  });

  it('markFailed: transitions open → failed', async () => {
    const prisma: any = makePrisma({ invoices: fixtureInvoices() });
    const { audit } = makeAudit();
    const svc = new BillingService(prisma, audit);
    const updated = await svc.markFailed('I1', { notes: 'wire bounced' }, ACTOR);
    expect(updated.status).toBe('failed');
  });

  it('retryFailedInvoice: only allowed on failed status', async () => {
    const prisma: any = makePrisma({ invoices: fixtureInvoices() });
    const { audit } = makeAudit();
    const svc = new BillingService(prisma, audit);
    const updated = await svc.retryFailedInvoice('I3', ACTOR);
    expect(updated.status).toBe('open');
    await expect(svc.retryFailedInvoice('I2', ACTOR)).rejects.toBeInstanceOf(BadRequestException);
  });

  it('voidInvoice: only open or failed', async () => {
    const prisma: any = makePrisma({ invoices: fixtureInvoices() });
    const { audit } = makeAudit();
    const svc = new BillingService(prisma, audit);
    const updated = await svc.voidInvoice('I1', { notes: 'duplicate' }, ACTOR);
    expect(updated.status).toBe('voided');
    await expect(svc.voidInvoice('I2', {}, ACTOR)).rejects.toBeInstanceOf(BadRequestException);
  });

  it('voidInvoice: 404 on unknown id', async () => {
    const prisma: any = makePrisma({ invoices: fixtureInvoices() });
    const { audit } = makeAudit();
    const svc = new BillingService(prisma, audit);
    await expect(svc.voidInvoice('NOPE', {}, ACTOR)).rejects.toBeInstanceOf(NotFoundException);
  });

  it('generatePeriodInvoices: creates one invoice per due subscription', async () => {
    const prisma: any = makePrisma({ subs: fixtureSubs() });
    const { audit } = makeAudit();
    const svc = new BillingService(prisma, audit);
    const res = await svc.generatePeriodInvoices(new Date('2026-05-01'));
    expect(res.scanned).toBe(2);
    expect(res.created).toBe(2);
    expect(res.skipped).toBe(0);
    expect(prisma._state.invoices).toHaveLength(2);
  });

  it('generatePeriodInvoices: idempotent on re-run', async () => {
    const prisma: any = makePrisma({ subs: fixtureSubs() });
    const { audit } = makeAudit();
    const svc = new BillingService(prisma, audit);
    await svc.generatePeriodInvoices(new Date('2026-05-01'));
    const res = await svc.generatePeriodInvoices(new Date('2026-05-01'));
    expect(res.created).toBe(0);
    expect(res.skipped).toBe(2);
    expect(prisma._state.invoices).toHaveLength(2);
  });
});
