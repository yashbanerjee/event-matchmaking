import { Injectable, Logger } from '@nestjs/common';
import { EnvService } from '../../config/env.service';
import { PrismaService } from '../../prisma/prisma.service';
import { EffectiveConfigService } from '../../settings/effective-config.service';
import type { EmailMessage, EmailProvider } from './email.provider';
import { ConsoleEmailProvider } from './console-email.provider';
import { SmtpEmailProvider } from './smtp-email.provider';
import { SendgridEmailProvider } from './sendgrid-email.provider';

@Injectable()
export class EmailService {
  private readonly logger = new Logger(EmailService.name);

  constructor(
    private readonly env: EnvService,
    private readonly prisma: PrismaService,
    private readonly config: EffectiveConfigService,
  ) {}

  async getProviderName() {
    return this.config.getString('email.provider', this.env.emailProvider);
  }

  async send(message: EmailMessage) {
    const provider = await this.resolveProvider();
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
      const result = await provider.send(message);
      await this.prisma.notificationDelivery.create({
        data: {
          eventId: event.id,
          status: 'SENT',
          provider: result.provider,
          providerResponse:
            (result.raw as object) ?? { messageId: result.messageId },
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
          provider: provider.name,
          providerResponse: { error: (err as Error).message },
          attempt: 1,
        },
      });
      throw err;
    }
  }

  private async resolveProvider(): Promise<EmailProvider> {
    const providerName = await this.config.getString(
      'email.provider',
      this.env.emailProvider,
    );
    const from = await this.config.getString('email.from', this.env.emailFrom);

    if (providerName === 'smtp') {
      const host = await this.config.getString('email.smtpHost', '');
      if (!host) {
        this.logger.warn('SMTP host missing; falling back to console email');
        return new ConsoleEmailProvider();
      }
      return new SmtpEmailProvider(from, {
        host,
        port: await this.config.getNumber('email.smtpPort', 587),
        user: (await this.config.getString('email.smtpUser', '')) || undefined,
        pass: (await this.config.getString('email.smtpPass', '')) || undefined,
      });
    }

    if (providerName === 'sendgrid') {
      const apiKey = await this.config.getString('email.sendgridApiKey', '');
      if (!apiKey) {
        this.logger.warn('SendGrid key missing; falling back to console email');
        return new ConsoleEmailProvider();
      }
      return new SendgridEmailProvider(apiKey, from);
    }

    return new ConsoleEmailProvider();
  }
}
