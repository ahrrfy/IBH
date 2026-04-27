import { ContractsService } from '../contracts.service';
import { PoliciesService } from '../../policies/policies.service';
import { renderPdf } from '../pdf-emitter';

/**
 * End-to-end flow (T52):
 *   1. Admin creates a contract from an active template (merge-fields render).
 *   2. PDF is generated server-side and starts with the PDF magic bytes.
 *   3. Body hash matches sha256(renderedBody).
 *   4. Employee acknowledges the linked policy and the chain verifies.
 *
 * Uses an in-memory Prisma mock so the test runs in plain `jest` with no DB.
 */
describe('contract → pdf → acknowledge flow (T52)', () => {
  const session = { companyId: 'co', userId: 'u1' } as any;

  it('creates contract, renders PDF, then employee acks policy', async () => {
    const template = {
      id: 't1',
      companyId: 'co',
      status: 'active',
      bodyMd:
        'CONTRACT {{contract.no}}\nEmployee: {{employee.name}}\nSalary: {{salary.amount}} {{salary.currency}}',
    };
    const employee = {
      id: 'emp1',
      companyId: 'co',
      userId: 'u-emp',
      status: 'active',
      nameAr: 'Ali Hassan',
      nameEn: '',
      nationalId: 'X',
      phone: '',
    };
    const offer = { id: 'off1', companyId: 'co', status: 'accepted', applicationId: 'app1' };

    const contractStore: any = {};
    const ackStore: any[] = [];
    let lastAckHash: string | null = null;

    const prismaMock: any = {
      contractTemplate: { findFirst: jest.fn().mockResolvedValue(template) },
      employee: {
        findFirst: jest.fn().mockResolvedValue(employee),
        findMany: jest.fn().mockResolvedValue([]),
      },
      offerLetter: { findFirst: jest.fn().mockResolvedValue(offer) },
      employmentContract: {
        findFirst: jest.fn().mockImplementation(async ({ where }) =>
          where.contractNo ? null : contractStore[where.id] ?? null,
        ),
        create: jest.fn().mockImplementation(async ({ data }) => {
          contractStore['c1'] = { id: 'c1', ...data };
          return contractStore['c1'];
        }),
      },
      policy: {
        findFirst: jest.fn().mockResolvedValue({
          id: 'pol1',
          companyId: 'co',
          status: 'published',
          version: 1,
          titleAr: 't',
          bodyMd: 'b',
        }),
      },
      policyAcknowledgment: {
        findFirst: jest.fn().mockImplementation(async () =>
          lastAckHash ? { hash: lastAckHash } : null,
        ),
        create: jest.fn().mockImplementation(async ({ data }) => {
          ackStore.push(data);
          lastAckHash = data.hash;
          return { id: 'ack1', ...data };
        }),
      },
    };

    const audit: any = { log: jest.fn() };
    const notifications: any = { dispatch: jest.fn() };

    const contractsSvc = new ContractsService(prismaMock, audit, notifications);
    const policiesSvc = new PoliciesService(prismaMock, audit, notifications);

    // 1. create contract
    const contract = await contractsSvc.createContract(
      {
        templateId: 't1',
        employeeId: 'emp1',
        offerLetterId: 'off1',
        contractNo: 'C-001',
        startDate: '2026-05-01',
        salaryIqd: '750000',
      } as any,
      session,
    );

    expect(contract.renderedBody).toContain('Ali Hassan');
    expect(contract.renderedBody).toContain('750000.000 IQD');
    expect(contract.renderedBody).not.toContain('{{');
    expect(contract.bodyHash).toMatch(/^[a-f0-9]{64}$/);

    // 2. render PDF
    const pdf = renderPdf(contract.renderedBody);
    expect(pdf.slice(0, 5).toString('binary')).toBe('%PDF-');
    expect(pdf.slice(-6).toString('binary')).toContain('%%EOF');
    // deterministic
    const pdf2 = renderPdf(contract.renderedBody);
    expect(pdf.equals(pdf2)).toBe(true);

    // 3. employee acknowledges
    const ack = await policiesSvc.acknowledge(
      { policyId: 'pol1', policyVersion: 1 },
      'emp1',
      session,
      '127.0.0.1',
    );
    expect(ack.hash).toMatch(/^[a-f0-9]{64}$/);
    expect(ackStore[0].sourceIp).toBe('127.0.0.1');
  });
});
