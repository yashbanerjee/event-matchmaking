import { Logger } from '@nestjs/common';
import type { EmailMessage, EmailProvider, EmailSendResult } from './email.provider';

export class ConsoleEmailProvider implements EmailProvider {
  readonly name = 'console';
  private readonly logger = new Logger(ConsoleEmailProvider.name);

  async send(message: EmailMessage): Promise<EmailSendResult> {
    this.logger.log(
      {
        to: message.to,
        subject: message.subject,
        idempotencyKey: message.idempotencyKey,
        text: message.text.slice(0, 500),
      },
      'Console email dispatch',
    );
    return {
      provider: this.name,
      messageId: `console-${Date.now()}`,
      accepted: true,
    };
  }
}
