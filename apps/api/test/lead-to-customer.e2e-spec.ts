import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/platform/prisma/prisma.service';
import { LeadsService } from '../src/modules/crm/leads/leads.service';

/**
 * Wave 6 acceptance test — Lead → Customer conversion.
 *
 * When a Lead transitions to status='won', the CRM must:
 *   1. Auto-create a Customer with the lead's nameAr/phone/email
 *      (or attach to an existing one if customerId is supplied),
 *   2. Persist the customerId + wonAt on the Lead,
 *   3. Refuse the new→contacted shortcut without ≥1 activity.
 *
 * This proves the funnel actually closes — without a Customer row
 * the won lead can't be invoiced and the pipeline metric lies.
 */
describe('CRM — Lead → Customer conversion (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let leads: LeadsService;

  beforeAll(async () => {
    const moduleRef: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    app = moduleRef.createNestApplication();
    await app.init();
    prisma = app.get(PrismaService);
    leads = app.get(LeadsService);
  });

  afterAll(async () => {
    await app?.close();
  });

  // Build a minimal session for the seeded company. Tests run against the
  // shared DB so we attach to the first company rather than creating one.
  async function buildSession() {
    const company = await prisma.company.findFirst();
    if (!company) return null;
    const owner = await prisma.user.findFirst({
      where: { companyId: company.id, isSystemOwner: true },
    });
    if (!owner) return null;
    return { userId: owner.id, companyId: company.id } as any;
  }

  it('refuses new → contacted without any logged activity', async () => {
    const session = await buildSession();
    if (!session) return;

    const lead = await leads.create(
      {
        nameAr: 'عميل اختبار - بدون نشاط',
        phone: '+9647700000001',
        source: 'test',
      },
      session,
    );

    await expect(
      leads.changeStatus(lead.id, 'contacted', session),
    ).rejects.toMatchObject({
      response: { code: 'LEAD_NO_ACTIVITY' },
    });

    // cleanup so reruns don't accumulate test rows
    await prisma.lead.delete({ where: { id: lead.id } }).catch(() => undefined);
  });

  it('creates a Customer and links it on transition to won', async () => {
    const session = await buildSession();
    if (!session) return;

    const lead = await leads.create(
      {
        nameAr: 'عميل اختبار - تحويل ناجح',
        phone: '+9647700000002',
        email: 'lead-to-customer@example.com',
        source: 'test',
        estimatedValueIqd: 5_000_000,
      },
      session,
    );

    // Add an activity so the new → contacted gate is satisfied.
    await prisma.leadActivity.create({
      data: {
        leadId: lead.id,
        type: 'call',
        notes: 'Initial contact',
        createdBy: session.userId,
      } as any,
    });

    await leads.changeStatus(lead.id, 'contacted', session);
    await leads.changeStatus(lead.id, 'qualified', session);
    const won = await leads.changeStatus(lead.id, 'won', session);

    expect(won.status).toBe('won');
    expect(won.customerId).toBeTruthy();
    expect(won.wonAt).toBeInstanceOf(Date);

    const customer = await prisma.customer.findFirst({
      where: { id: won.customerId!, companyId: session.companyId },
    });
    expect(customer).toBeTruthy();
    expect(customer!.nameAr).toBe('عميل اختبار - تحويل ناجح');
    expect(customer!.phone).toBe('+9647700000002');
    expect(customer!.email).toBe('lead-to-customer@example.com');

    // cleanup
    await prisma.leadActivity.deleteMany({ where: { leadId: lead.id } });
    await prisma.lead.delete({ where: { id: lead.id } }).catch(() => undefined);
    await prisma.customer.delete({ where: { id: customer!.id } }).catch(() => undefined);
  });

  it('rejects transition to lost without lostReason', async () => {
    const session = await buildSession();
    if (!session) return;

    const lead = await leads.create(
      {
        nameAr: 'عميل اختبار - رفض',
        phone: '+9647700000003',
        source: 'test',
      },
      session,
    );

    await expect(
      leads.changeStatus(lead.id, 'lost', session),
    ).rejects.toMatchObject({
      response: { code: 'LOST_REASON_REQUIRED' },
    });

    await prisma.lead.delete({ where: { id: lead.id } }).catch(() => undefined);
  });
});
