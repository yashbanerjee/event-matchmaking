import { Controller, Get } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { PrismaService } from '../prisma/prisma.service';
import { RabbitMqService } from '../messaging/rabbitmq.service';
import { EnvService } from '../config/env.service';
import Redis from 'ioredis';

@ApiTags('health')
@Controller('health')
export class HealthController {
  private redis: Redis;

  constructor(
    private readonly prisma: PrismaService,
    private readonly rabbit: RabbitMqService,
    private readonly env: EnvService,
  ) {
    this.redis = new Redis(this.env.redisUrl, {
      maxRetriesPerRequest: 1,
      lazyConnect: true,
      enableOfflineQueue: false,
    });
  }

  @Get()
  async index() {
    return this.ready();
  }

  @Get('live')
  live() {
    return { status: 'ok' };
  }

  @Get('ready')
  async ready() {
    const checks: Record<string, { status: string; detail?: string }> = {};

    try {
      await this.prisma.$queryRaw`SELECT 1`;
      checks.postgres = { status: 'up' };
    } catch (err) {
      checks.postgres = {
        status: 'down',
        detail: (err as Error).message,
      };
    }

    try {
      if (this.redis.status !== 'ready') {
        await this.redis.connect();
      }
      const pong = await this.redis.ping();
      checks.redis = { status: pong === 'PONG' ? 'up' : 'down' };
    } catch (err) {
      checks.redis = {
        status: 'down',
        detail: (err as Error).message,
      };
    }

    checks.rabbitmq = {
      status: this.rabbit.isHealthy() ? 'up' : 'degraded',
    };

    checks.ai = {
      status: this.env.aiEnabled ? 'configured' : 'disabled',
    };

    // Postgres is required. Redis/RabbitMQ can be degraded without blocking
    // HTTP API readiness (JWT auth does not depend on Redis).
    const criticalDown = checks.postgres?.status !== 'up';

    return {
      status: criticalDown ? 'not_ready' : 'ready',
      checks,
    };
  }
}
