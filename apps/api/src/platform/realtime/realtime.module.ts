import { Global, Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { RealtimeGateway } from './realtime.gateway';
import { EventRelayService } from './event-relay.service';

/**
 * Real-time infrastructure (T31).
 *
 * Provides WebSocket gateway + event relay so any module can publish
 * domain events via @nestjs/event-emitter and have them broadcast to
 * the relevant client rooms with sub-200ms latency.
 *
 * Usage from any service:
 *   constructor(private events: EventEmitter2) {}
 *   this.events.emit('inventory.changed', { branchId, productId, qty });
 *
 * The relay matches event names against routing rules and forwards to:
 *   - branch:<branchId>   (everyone in that branch)
 *   - user:<userId>       (a specific user)
 *   - company:<companyId> (everyone in the tenant)
 */
@Global()
@Module({
  imports: [
    JwtModule.registerAsync({
      imports: [ConfigModule],
      useFactory: (config: ConfigService) => ({
        secret: config.getOrThrow<string>('JWT_SECRET'),
      }),
      inject: [ConfigService],
    }),
  ],
  providers: [RealtimeGateway, EventRelayService],
  exports: [RealtimeGateway],
})
export class RealtimeModule {}
