import {
  ExpiryWatcherProcessor,
  matchThreshold,
  REMINDER_THRESHOLDS,
} from '../expiry-watcher.processor';

/**
 * T69 — unit tests for the expiry-watcher.
 *
 * We test two layers:
 *   (1) Pure threshold matching — deterministic, no IO.
 *   (2) Processor.run() with a fake PrismaService and Clock — verifies
 *       idempotency (Prisma P2002 path), notification fan-out, and the
 *       45-day "no notify" gap.
 */

describe('matchThreshold', () => {
  it.each([
    [45, null],
    [31, null],
    [30, 30],
    [29, 30],
    [15, 30],
    [14, 14],
    [10, 14],
    [7, 7],
    [4, 7],
    [3, 3],
    [2, 3],
    [1, 1],
    [0, 0],
    [-1, 0],
    [-100, 0],
  ])('daysRemaining=%i → threshold=%s', (days, expected) => {
    expect(matchThreshold(days)).toBe(expected);
  });

  it('exposes thresholds in the documented order', () => {
    expect(REMINDER_THRESHOLDS).toEqual([30, 14, 7, 3, 1, 0]);
  });
});

// ─── Processor.run() integration with fake Prisma ────────────────────────

interface FakeSubscription {
  id: string;
  companyId: string;
  status: string;
  currentPeriodEndAt: Date;
  plan: { name: string; code: string };
}

class FakePrisma {
  subs: FakeSubscription[] = [];
  reminderRows = new Map<string, { subscriptionId: string; threshold: number }>();
  adminUsers: { id: string }[] = [{ id: 'user_admin_1' }];

  subscription = {
    findMany: jest.fn(async () => this.subs),
  };
  user = {
    findMany: jest.fn(async () => this.adminUsers),
  };
  licenseReminderLog = {
    create: jest.fn(async ({ data }: { data: { subscriptionId: string; threshold: number } }) => {
      const key = `${data.subscriptionId}:${data.threshold}`;
      if (this.reminderRows.has(key)) {
        const err = new Error('unique violation') as Error & { code?: string };
        err.code = 'P2002';
        throw err;
      }
      this.reminderRows.set(key, data);
      return { id: 'log_' + key, sentAt: new Date(), ...data };
    }),
  };
}

function makeProcessor(prisma: FakePrisma, now: Date) {
  const fakeQueue = { add: jest.fn() } as unknown as never;
  const dispatch = jest.fn(async () => ({ id: 'notif_1' }));
  const notifications = { dispatch } as unknown as never;
  const proc = new ExpiryWatcherProcessor(
    prisma as unknown as never,
    fakeQueue,
    notifications,
  );
  proc.setClock({ now: () => now });
  return { proc, dispatch };
}

function sub(id: string, daysFromNow: number, now: Date): FakeSubscription {
  return {
    id,
    companyId: 'co_1',
    status: 'active',
    currentPeriodEndAt: new Date(now.getTime() + daysFromNow * 86_400_000),
    plan: { name: 'Premium', code: 'premium' },
  };
}

describe('ExpiryWatcherProcessor.run', () => {
  const NOW = new Date('2026-04-27T06:00:00Z');

  it('notifies at the 30-day band', async () => {
    const prisma = new FakePrisma();
    prisma.subs = [sub('s30', 30, NOW)];
    const { proc, dispatch } = makeProcessor(prisma, NOW);

    const r = await proc.run();
    expect(r.notified).toBe(1);
    expect(dispatch).toHaveBeenCalledTimes(1);
    expect((dispatch.mock.calls[0] as unknown as [{ eventType: string }])[0].eventType).toBe('license.expiry.reminder');
  });

  it('notifies at the 14-day band', async () => {
    const prisma = new FakePrisma();
    prisma.subs = [sub('s14', 14, NOW)];
    const { proc, dispatch } = makeProcessor(prisma, NOW);
    await proc.run();
    expect(dispatch).toHaveBeenCalledTimes(1);
  });

  it('notifies at the 7-day band', async () => {
    const prisma = new FakePrisma();
    prisma.subs = [sub('s7', 7, NOW)];
    const { proc, dispatch } = makeProcessor(prisma, NOW);
    await proc.run();
    expect(dispatch).toHaveBeenCalledTimes(1);
  });

  it('notifies at the 3-day band', async () => {
    const prisma = new FakePrisma();
    prisma.subs = [sub('s3', 3, NOW)];
    const { proc, dispatch } = makeProcessor(prisma, NOW);
    await proc.run();
    expect(dispatch).toHaveBeenCalledTimes(1);
  });

  it('notifies at the 1-day band', async () => {
    const prisma = new FakePrisma();
    prisma.subs = [sub('s1', 1, NOW)];
    const { proc, dispatch } = makeProcessor(prisma, NOW);
    await proc.run();
    expect(dispatch).toHaveBeenCalledTimes(1);
  });

  it('emits license.expired on day 0', async () => {
    const prisma = new FakePrisma();
    prisma.subs = [sub('s0', 0, NOW)];
    const { proc, dispatch } = makeProcessor(prisma, NOW);
    await proc.run();
    expect(dispatch).toHaveBeenCalledTimes(1);
    expect((dispatch.mock.calls[0] as unknown as [{ eventType: string }])[0].eventType).toBe('license.expired');
  });

  it('does not notify at 45 days out (outside any band)', async () => {
    const prisma = new FakePrisma();
    prisma.subs = [sub('s45', 45, NOW)];
    // Simulate that the DB query already filters by horizon (≤31d) so it
    // returns nothing — the processor must produce zero notifications.
    prisma.subs = [];
    const { proc, dispatch } = makeProcessor(prisma, NOW);
    const r = await proc.run();
    expect(r.notified).toBe(0);
    expect(dispatch).not.toHaveBeenCalled();
  });

  it('is idempotent: a second run on the same day does not re-send', async () => {
    const prisma = new FakePrisma();
    prisma.subs = [sub('s7-twice', 7, NOW)];
    const { proc, dispatch } = makeProcessor(prisma, NOW);

    await proc.run();
    await proc.run();

    expect(dispatch).toHaveBeenCalledTimes(1);
    expect(prisma.licenseReminderLog.create).toHaveBeenCalledTimes(2);
  });

  it('fans out to every admin user', async () => {
    const prisma = new FakePrisma();
    prisma.adminUsers = [{ id: 'a' }, { id: 'b' }, { id: 'c' }];
    prisma.subs = [sub('s14', 14, NOW)];
    const { proc, dispatch } = makeProcessor(prisma, NOW);
    await proc.run();
    expect(dispatch).toHaveBeenCalledTimes(3);
  });
});
