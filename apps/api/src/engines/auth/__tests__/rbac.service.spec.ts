import { RbacService } from '../rbac.service';

/**
 * Unit tests for T47 — RBAC Enterprise Service.
 *
 * The PrismaService is stubbed via duck-typed fakes — these are pure logic
 * tests. DB-level concerns (FK ON DELETE SET NULL, JSONB constraint) are
 * covered by the migration tests under test/.
 */

interface FakeRole {
  id: string;
  parentRoleId: string | null;
  permissions: Record<string, number> | null;
  validFrom?: Date | null;
  validUntil?: Date | null;
}

interface FakeUserRole {
  userId: string;
  roleId: string;
  role: FakeRole;
}

interface FakeSod {
  id: string;
  roleId: string;
  conflictingActions: string[];
}

interface FakeAudit {
  userId: string;
  entityType: string;
  entityId: string;
  action: string;
  occurredAt: Date;
}

function makePrisma(opts: {
  roles: FakeRole[];
  userRoles: FakeUserRole[];
  sod?: FakeSod[];
  audit?: FakeAudit[];
}) {
  const { roles, userRoles, sod = [], audit = [] } = opts;
  return {
    userRole: {
      findMany: jest.fn(async (args: { where: { userId: string } }) =>
        userRoles.filter((ur) => ur.userId === args.where.userId),
      ),
    },
    role: {
      findUnique: jest.fn(async (args: { where: { id: string } }) =>
        roles.find((r) => r.id === args.where.id) ?? null,
      ),
    },
    roleSeparationOfDuties: {
      findMany: jest.fn(async (args: { where: { roleId: { in: string[] } } }) =>
        sod.filter((s) => args.where.roleId.in.includes(s.roleId)),
      ),
    },
    auditLog: {
      findFirst: jest.fn(
        async (args: {
          where: {
            userId: string;
            entityType: string;
            entityId: string;
            action: { in: string[] };
            occurredAt: { gte: Date };
          };
        }) => {
          const w = args.where;
          return (
            audit.find(
              (a) =>
                a.userId === w.userId &&
                a.entityType === w.entityType &&
                a.entityId === w.entityId &&
                w.action.in.includes(a.action) &&
                a.occurredAt >= w.occurredAt.gte,
            ) ?? null
          );
        },
      ),
    },
  } as unknown as ConstructorParameters<typeof RbacService>[0];
}

describe('RbacService — hierarchy walk', () => {
  it('inherits parent permissions through a 2-level chain', async () => {
    const grandparent: FakeRole = {
      id: 'R_GP',
      parentRoleId: null,
      permissions: { Invoice: 2 /* Read */ },
    };
    const parent: FakeRole = {
      id: 'R_P',
      parentRoleId: 'R_GP',
      permissions: { Invoice: 4 /* Update */ },
    };
    const child: FakeRole = {
      id: 'R_C',
      parentRoleId: 'R_P',
      permissions: { Invoice: 1 /* Create */ },
    };

    const prisma = makePrisma({
      roles: [grandparent, parent, child],
      userRoles: [{ userId: 'U1', roleId: 'R_C', role: child }],
    });
    const svc = new RbacService(prisma);

    // Expect Read (2) — inherited from grandparent through parent.
    const decisionRead = await svc.hasPermission('U1', 'Invoice', 'Read');
    expect(decisionRead).toEqual({ allowed: true });

    // Expect Update (4) — inherited from parent.
    const decisionUpdate = await svc.hasPermission('U1', 'Invoice', 'Update');
    expect(decisionUpdate).toEqual({ allowed: true });

    // Expect Create (1) — directly on child.
    const decisionCreate = await svc.hasPermission('U1', 'Invoice', 'Create');
    expect(decisionCreate).toEqual({ allowed: true });

    // Delete (8) is on no role in the chain — must deny.
    const decisionDelete = await svc.hasPermission('U1', 'Invoice', 'Delete');
    expect(decisionDelete.allowed).toBe(false);
  });

  it('aborts safely on a cycle (does not infinite-loop)', async () => {
    // Cycle: R_A -> R_B -> R_A
    const a: FakeRole = {
      id: 'R_A',
      parentRoleId: 'R_B',
      permissions: { Foo: 2 },
    };
    const b: FakeRole = {
      id: 'R_B',
      parentRoleId: 'R_A',
      permissions: { Foo: 4 },
    };

    const prisma = makePrisma({
      roles: [a, b],
      userRoles: [{ userId: 'U1', roleId: 'R_A', role: a }],
    });
    const svc = new RbacService(prisma);

    // Should still resolve permissions from the visited roles and not throw.
    const decision = await svc.hasPermission('U1', 'Foo', 'Read');
    expect(decision).toEqual({ allowed: true });
  });

  it('skips temporally-invalid roles', async () => {
    const past = new Date('2000-01-01');
    const future = new Date('2099-01-01');
    const expired: FakeRole = {
      id: 'R1',
      parentRoleId: null,
      permissions: { Foo: 2 },
      validUntil: past,
    };

    const prisma = makePrisma({
      roles: [expired],
      userRoles: [{ userId: 'U1', roleId: 'R1', role: expired }],
    });
    const svc = new RbacService(prisma);

    const decision = await svc.hasPermission('U1', 'Foo', 'Read');
    expect(decision.allowed).toBe(false);
    expect((decision as { reason?: string }).reason).toBe('TemporalRoleInvalid');

    // And a not-yet-active role (validFrom in the future) is also rejected.
    const notYet: FakeRole = {
      id: 'R2',
      parentRoleId: null,
      permissions: { Foo: 2 },
      validFrom: future,
    };
    const prisma2 = makePrisma({
      roles: [notYet],
      userRoles: [{ userId: 'U1', roleId: 'R2', role: notYet }],
    });
    const decision2 = await new RbacService(prisma2).hasPermission('U1', 'Foo', 'Read');
    expect(decision2.allowed).toBe(false);
  });
});

describe('RbacService — Separation of Duties', () => {
  it('denies when a conflicting prior action exists in the lookback window', async () => {
    const role: FakeRole = {
      id: 'R1',
      parentRoleId: null,
      permissions: { PurchaseOrder: 1 | 32 /* Create + Approve */ },
    };
    const sod: FakeSod = {
      id: 'S1',
      roleId: 'R1',
      conflictingActions: ['create', 'approve'],
    };
    const audit: FakeAudit = {
      userId: 'U1',
      entityType: 'PurchaseOrder',
      entityId: 'PO1',
      action: 'create',
      occurredAt: new Date(Date.now() - 60_000), // 1 minute ago
    };

    const prisma = makePrisma({
      roles: [role],
      userRoles: [{ userId: 'U1', roleId: 'R1', role }],
      sod: [sod],
      audit: [audit],
    });
    const svc = new RbacService(prisma);

    const decision = await svc.hasPermission('U1', 'PurchaseOrder', 'approve', {
      entityType: 'PurchaseOrder',
      entityId: 'PO1',
    });

    expect(decision.allowed).toBe(false);
    expect((decision as { reason?: string }).reason).toBe('SoDViolation');
    expect((decision as { conflictingAction?: string }).conflictingAction).toBe('create');
  });

  it('allows when no conflicting prior action exists', async () => {
    const role: FakeRole = {
      id: 'R1',
      parentRoleId: null,
      permissions: { PurchaseOrder: 32 /* Approve */ },
    };
    const sod: FakeSod = {
      id: 'S1',
      roleId: 'R1',
      conflictingActions: ['create', 'approve'],
    };

    const prisma = makePrisma({
      roles: [role],
      userRoles: [{ userId: 'U1', roleId: 'R1', role }],
      sod: [sod],
      audit: [], // empty
    });
    const svc = new RbacService(prisma);

    const decision = await svc.hasPermission('U1', 'PurchaseOrder', 'approve', {
      entityType: 'PurchaseOrder',
      entityId: 'PO1',
    });
    expect(decision).toEqual({ allowed: true });
  });
});
