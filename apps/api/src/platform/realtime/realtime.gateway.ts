import { Logger } from '@nestjs/common';
import {
  OnGatewayConnection,
  OnGatewayDisconnect,
  OnGatewayInit,
  WebSocketGateway,
  WebSocketServer,
} from '@nestjs/websockets';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import type { Server, Socket } from 'socket.io';

/**
 * JWT payload shape used across the auth engine. Mirrors the contract in
 * engines/auth/jwt.strategy.ts (sub, companyId, branchId, roles[]).
 */
interface AuthPayload {
  sub: string;
  companyId?: string | null;
  branchId?: string | null;
  roles?: string[];
}

interface AuthedSocketData {
  userId: string;
  companyId: string | null;
  branchId: string | null;
  roles: string[];
}

/**
 * Realtime WebSocket gateway (T31).
 *
 * - Mounted at /realtime, transports: websocket only (no long-polling fallback to keep latency tight).
 * - JWT auth at handshake via `auth.token` (preferred) or `?token=...` query.
 * - Each socket joins three rooms:
 *     user:<userId>    user-targeted notifications
 *     branch:<branchId> branch-scoped operational events (POS, deliveries, stock)
 *     company:<companyId> tenant-wide broadcasts (license, plan changes)
 *
 * EventRelayService consumes wildcard EventEmitter2 events and calls
 * `broadcast()` here to fan them out to the right rooms.
 */
@WebSocketGateway({
  namespace: '/realtime',
  transports: ['websocket'],
  cors: {
    origin: (origin: string | undefined, cb: (err: Error | null, allow?: boolean) => void) => cb(null, true),
    credentials: true,
  },
})
export class RealtimeGateway
  implements OnGatewayInit, OnGatewayConnection, OnGatewayDisconnect
{
  private readonly logger = new Logger(RealtimeGateway.name);
  @WebSocketServer() server!: Server;

  constructor(
    private readonly jwt: JwtService,
    private readonly config: ConfigService,
  ) {}

  afterInit(): void {
    this.logger.log('Realtime gateway initialised on /realtime');
  }

  async handleConnection(client: Socket): Promise<void> {
    try {
      const token = this.extractToken(client);
      if (!token) {
        this.logger.warn(`Reject ${client.id}: no token`);
        client.emit('auth_error', { reason: 'missing_token' });
        client.disconnect(true);
        return;
      }

      const payload = await this.jwt.verifyAsync<AuthPayload>(token, {
        secret: this.config.getOrThrow<string>('JWT_SECRET'),
      });

      const data: AuthedSocketData = {
        userId: payload.sub,
        companyId: payload.companyId ?? null,
        branchId: payload.branchId ?? null,
        roles: payload.roles ?? [],
      };
      client.data = data;

      await client.join(`user:${data.userId}`);
      if (data.branchId) await client.join(`branch:${data.branchId}`);
      if (data.companyId) await client.join(`company:${data.companyId}`);

      client.emit('connected', {
        userId: data.userId,
        companyId: data.companyId,
        branchId: data.branchId,
        rooms: Array.from(client.rooms),
        serverTime: new Date().toISOString(),
      });

      this.logger.debug(
        `Connected ${client.id} u=${data.userId} c=${data.companyId} b=${data.branchId}`,
      );
    } catch (err) {
      const message = err instanceof Error ? err.message : 'unknown';
      this.logger.warn(`Reject ${client.id}: ${message}`);
      client.emit('auth_error', { reason: 'invalid_token' });
      client.disconnect(true);
    }
  }

  handleDisconnect(client: Socket): void {
    const userId = (client.data as AuthedSocketData | undefined)?.userId ?? 'anon';
    this.logger.debug(`Disconnected ${client.id} u=${userId}`);
  }

  /**
   * Broadcast an event to one or more rooms.
   * Used by EventRelayService.
   */
  broadcast(rooms: string[], event: string, payload: unknown): void {
    if (!this.server || rooms.length === 0) return;
    this.server.to(rooms).emit(event, {
      event,
      payload,
      ts: new Date().toISOString(),
    });
  }

  private extractToken(client: Socket): string | null {
    const auth = client.handshake.auth as Record<string, unknown> | undefined;
    const fromAuth = auth && typeof auth.token === 'string' ? auth.token : null;
    if (fromAuth) return fromAuth;

    const query = client.handshake.query?.token;
    if (typeof query === 'string') return query;

    const header = client.handshake.headers?.authorization;
    if (typeof header === 'string' && header.startsWith('Bearer ')) {
      return header.slice(7);
    }
    return null;
  }
}
