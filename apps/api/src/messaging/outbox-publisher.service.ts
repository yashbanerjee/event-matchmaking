import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { RabbitMqService } from './rabbitmq.service';

@Injectable()
export class OutboxPublisherService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(OutboxPublisherService.name);
  private timer: NodeJS.Timeout | null = null;

  constructor(
    private readonly prisma: PrismaService,
    private readonly rabbit: RabbitMqService,
  ) {}

  onModuleInit() {
    this.timer = setInterval(() => {
      void this.flush();
    }, 2000);
  }

  onModuleDestroy() {
    if (this.timer) {
      clearInterval(this.timer);
    }
  }

  async flush(limit = 50) {
    if (!this.rabbit.isHealthy()) {
      return;
    }

    const events = await this.prisma.outboxEvent.findMany({
      where: { status: 'PENDING' },
      orderBy: { createdAt: 'asc' },
      take: limit,
    });

    for (const event of events) {
      const ok = await this.rabbit.publish(event.eventType, event.payload, {
        messageId: event.idempotencyKey,
      });
      if (ok) {
        await this.prisma.outboxEvent.update({
          where: { id: event.id },
          data: {
            status: 'PUBLISHED',
            publishedAt: new Date(),
            attempts: { increment: 1 },
          },
        });
      } else {
        await this.prisma.outboxEvent.update({
          where: { id: event.id },
          data: {
            attempts: { increment: 1 },
            lastError: 'RabbitMQ publish failed',
            status: event.attempts + 1 >= 10 ? 'FAILED' : 'PENDING',
          },
        });
        this.logger.warn(`Outbox publish failed for ${event.id}`);
      }
    }
  }
}
