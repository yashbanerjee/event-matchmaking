import { Injectable, Logger } from '@nestjs/common';
import { EnvService } from '../../config/env.service';
import { PrismaService } from '../../prisma/prisma.service';
import { EffectiveConfigService } from '../../settings/effective-config.service';
import type { EmailMessage, EmailProvider } from './email.provider';
import { ConsoleEmailProvider } from './console-email.provider';
import { SmtpEmailProvider, type SmtpEndpoint } from './smtp-email.provider';
import { SendgridEmailProvider } from './sendgrid-email.provider';

@Injectable()
export class EmailService {
  private readonly logger = new Logger(EmailService.name);
  private lastSendAt = 0;

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
    if (provider.name === 'smtp') {
      await this.pace();
    }

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
      this.lastSendAt = Date.now();
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

  async sendTest(to: string) {
    const fromName = await this.config.getString(
      'email.fromName',
      'Event Matchmaking',
    );
    return this.send({
      to,
      subject: 'Event Matchmaking SMTP test',
      text: `This is a test email from ${fromName}. If you received it, SMTP is configured correctly.`,
      html: `<p>This is a test email from <strong>${fromName}</strong>.</p><p>If you received it, SMTP is configured correctly.</p>`,
      idempotencyKey: `email.test:${to}:${Date.now()}`,
    });
  }

  private async pace() {
    const interval = await this.config.getNumber(
      'email.smtpMinIntervalMs',
      5000,
    );
    if (interval <= 0 || !this.lastSendAt) return;
    const wait = this.lastSendAt + interval - Date.now();
    if (wait > 0) {
      await new Promise((resolve) => setTimeout(resolve, wait));
    }
  }

  private async resolveProvider(): Promise<EmailProvider> {
    const providerName = await this.config.getString(
      'email.provider',
      this.env.emailProvider,
    );
    const fromAddress = await this.config.getString(
      'email.from',
      this.env.emailFrom,
    );
    const fromName = await this.config.getString(
      'email.fromName',
      'Event Matchmaking',
    );
    const from = fromName ? `${fromName} <${fromAddress}>` : fromAddress;

    if (providerName === 'smtp') {
      const host = await this.config.getString('email.smtpHost', '');
      if (!host) {
        this.logger.warn('SMTP host missing; falling back to console email');
        return new ConsoleEmailProvider();
      }

      const primary: SmtpEndpoint = {
        host,
        port: await this.config.getNumber('email.smtpPort', 587),
        secure: await this.config.getBoolean('email.smtpSecure', false),
        user:
          (await this.config.getString('email.smtpUser', '')) || undefined,
        pass:
          (await this.config.getString('email.smtpPass', '')) || undefined,
        from,
      };

      const routes: SmtpEndpoint[] = [primary];
      const fallbackHost = await this.config.getString(
        'email.smtpFallbackHost',
        '',
      );
      if (fallbackHost) {
        const fallbackFrom =
          (await this.config.getString('email.smtpFallbackFrom', '')) || from;
        routes.push({
          host: fallbackHost,
          port: await this.config.getNumber('email.smtpFallbackPort', 587),
          secure: await this.config.getBoolean(
            'email.smtpFallbackSecure',
            false,
          ),
          user:
            (await this.config.getString('email.smtpFallbackUser', '')) ||
            undefined,
          pass:
            (await this.config.getString('email.smtpFallbackPass', '')) ||
            undefined,
          from: fallbackFrom,
        });
      }

      return new SmtpEmailProvider(routes);
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
