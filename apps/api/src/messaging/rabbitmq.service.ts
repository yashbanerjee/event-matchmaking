import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import amqp from 'amqplib';
import { EnvService } from '../config/env.service';

@Injectable()
export class RabbitMqService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(RabbitMqService.name);
  private connection: amqp.ChannelModel | null = null;
  private channel: amqp.ConfirmChannel | null = null;
  private healthy = false;

  constructor(private readonly env: EnvService) {}

  async onModuleInit() {
    await this.connect();
  }

  async onModuleDestroy() {
    try {
      await this.channel?.close();
    } catch {
      // ignore
    }
    try {
      await this.connection?.close();
    } catch {
      // ignore
    }
  }

  isHealthy() {
    return this.healthy;
  }

  private async connect() {
    try {
      const connection = await amqp.connect(this.env.rabbitUrl);
      this.connection = connection;
      this.channel = await connection.createConfirmChannel();
      await this.channel.assertExchange(this.env.rabbitExchange, 'topic', {
        durable: true,
      });
      this.healthy = true;
      connection.connection.on('close', () => {
        this.healthy = false;
        this.logger.warn('RabbitMQ connection closed');
      });
      connection.connection.on('error', (err: Error) => {
        this.healthy = false;
        this.logger.error(`RabbitMQ error: ${err.message}`);
      });
      this.logger.log('RabbitMQ connected');
    } catch (err) {
      this.healthy = false;
      this.logger.error(
        `RabbitMQ unavailable at startup: ${(err as Error).message}`,
      );
    }
  }

  async publish(
    routingKey: string,
    payload: unknown,
    options?: { persistent?: boolean; messageId?: string },
  ): Promise<boolean> {
    if (!this.channel || !this.healthy) {
      return false;
    }
    const body = Buffer.from(JSON.stringify(payload));
    try {
      this.channel.publish(this.env.rabbitExchange, routingKey, body, {
        persistent: options?.persistent ?? true,
        contentType: 'application/json',
        messageId: options?.messageId,
      });
      await this.channel.waitForConfirms();
      return true;
    } catch (err) {
      this.logger.error(`Publish failed: ${(err as Error).message}`);
      return false;
    }
  }
}
