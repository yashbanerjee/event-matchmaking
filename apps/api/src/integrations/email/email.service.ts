import { Injectable, Logger } from '@nestjs/common';
import { EnvService } from '../../config/env.service';
import { PrismaService } from '../../prisma/prisma.service';
import type { EmailMessage, EmailProvider } from './email.provider';
import { ConsoleEmailProvider } from './console-email.provider';
import { SmtpEmailProvider } from './smtp-email.provider';
import { SendgridEmailProvider } from './sendgrid-email.provider';

@Injectable()
export class EmailService {
  private readonly logger = new Logger(EmailService.name);
  private readonly provider: EmailProvider;

  constructor(
    private readonly env: EnvService,
    private readonly prisma: PrismaService,
  ) {
    this.provider = this.createProvider();
  }

  getProviderName() {
    return this.provider.name;
  }

  async send(message: EmailMessage) {
    const event = await this.prisma.notificationEvent.create({
      data: {
        templateCode: 'direct',
        recipientEmail: message.to,
        payload: {
          subject: message.subject,
          text: message.text,
        },
        idempotencyKey:
          message.idempotencyKey ??
          `email:${message.to}:${message.subject}:${Date.now()}`,
      },
    });

    try {
      const result = await this.provider.send(message);
      await this.prisma.notificationDelivery.create({
        data: {
          eventId: event.id,
          status: 'SENT',
          provider: result.provider,
          providerResponse: (result.raw as object) ?? { messageId: result.messageId },
          attempt: 1,
          sentAt: new Date(),
        },
      });
      return result;
    } catch (err) {
      this.logger.error(`Email send failed: ${(err as Error).message}`);
      await this.prisma.notificationDelivery.create({
        data: {
          eventId: event.id,
          status: 'FAILED',
          provider: this.provider.name,
          providerResponse: { error: (err as Error).message },
          attempt: 1,
        },
      });
      throw err;
    }
  }

  private createProvider(): EmailProvider {
    const raw = this.env.raw;
    switch (raw.EMAIL_PROVIDER) {
      case 'smtp':
        if (!raw.SMTP_HOST) {
          this.logger.warn('SMTP_HOST missing; falling back to console email');
          return new ConsoleEmailProvider();
        }
        return new SmtpEmailProvider(raw.EMAIL_FROM, {
          host: raw.SMTP_HOST,
          port: raw.SMTP_PORT,
          user: raw.SMTP_USER || undefined,
          pass: raw.SMTP_PASS || undefined,
        });
      case 'sendgrid':
        if (!raw.SENDGRID_API_KEY) {
          this.logger.warn('SENDGRID_API_KEY missing; falling back to console email');
          return new ConsoleEmailProvider();
        }
        return new SendgridEmailProvider(raw.SENDGRID_API_KEY, raw.EMAIL_FROM);
      default:
        return new ConsoleEmailProvider();
    }
  }
}
