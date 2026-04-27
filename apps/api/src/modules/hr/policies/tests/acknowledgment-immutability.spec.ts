import { ConflictException } from '@nestjs/common';
import { PoliciesService } from '../policies.service';

/**
 * Policy acknowledgment immutability + hash-chain integrity (T52).
 *
 * - Re-acknowledging the same (policy, version) is rejected (DB unique → P2002).
 * - Successive acks chain: `prevHash` of N == `hash` of N-1.
 * - `verifyChain` recomputes hashes deterministically and accepts the chain.
 */
describe('PoliciesService acknowledgment chain (T52)', () => {
  const session = { companyId: 'co', userId: 'u1' } as any;
  const policy = {
    id: 'p1',
    companyId: 'co',
    status: 'published',
    version: 1,
    titleAr: 't',
    bodyMd: 'b',
  };

  it('rejects duplicate acknowledgment with POLICY_ALREADY_ACKNOWLEDGED', async () => {
    const prismaMock: any = {
      policy: { findFirst: jest.fn().mockResolvedValue(policy) },
      policyAcknowledgment: {
        findFirst: jest.fn().mockResolvedValue(null),
        create: jest.fn().mockRejectedValue({ code: 'P2002' }),
      },
    };
    const svc = new PoliciesService(prismaMock, { log: jest.fn() } as any, {
      dispatch: jest.fn(),
    } as any);
    await expect(
      svc.acknowledge({ policyId: 'p1', policyVersion: 1 }, 'emp1', session),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it('chains hashes: ack[N].prevHash == ack[N-1].hash', async () => {
    let lastHash: string | null = null;
    const stored: any[] = [];
    const prismaMock: any = {
      policy: {
        findFirst: jest.fn().mockImplementation(async ({ where }) => ({
          ...policy,
          id: where.id,
          version: where.id === 'p2' ? 1 : 1,
        })),
      },
      policyAcknowledgment: {
        findFirst: jest.fn().mockImplementation(async () =>
          lastHash ? { hash: lastHash } : null,
        ),
        create: jest.fn().mockImplementation(async ({ data }) => {
          stored.push(data);
          lastHash = data.hash;
          return { id: `a${stored.length}`, ...data };
        }),
        findMany: jest.fn().mockImplementation(async () => stored),
      },
    };
    const svc = new PoliciesService(prismaMock, { log: jest.fn() } as any, {
      dispatch: jest.fn(),
    } as any);

    await svc.acknowledge({ policyId: 'p1', policyVersion: 1 }, 'emp1', session);
    await svc.acknowledge({ policyId: 'p2', policyVersion: 1 }, 'emp1', session);

    expect(stored).toHaveLength(2);
    expect(stored[0].prevHash).toBeNull();
    expect(stored[1].prevHash).toBe(stored[0].hash);
    expect(stored[1].hash).not.toBe(stored[0].hash);

    const ok = await svc.verifyChain('co', 'emp1');
    expect(ok).toBe(true);
  });

  it('verifyChain detects mutation', async () => {
    const stored = [
      {
        companyId: 'co',
        employeeId: 'emp1',
        policyId: 'p1',
        policyVersion: 1,
        acknowledgedAt: new Date('2026-01-01T00:00:00Z'),
        hash: 'wrong-hash',
        prevHash: null,
      },
    ];
    const prismaMock: any = {
      policyAcknowledgment: {
        findMany: jest.fn().mockResolvedValue(stored),
      },
    };
    const svc = new PoliciesService(prismaMock, { log: jest.fn() } as any, {
      dispatch: jest.fn(),
    } as any);
    expect(await svc.verifyChain('co', 'emp1')).toBe(false);
  });
});
