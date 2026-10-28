import { createTransport, type Transporter } from 'nodemailer';
import type { EmailMessage, EmailProvider, EmailSendResult } from './email.provider';

export class SmtpEmailProvider implements EmailProvider {
  readonly name = 'smtp';
  private readonly transporter: Transporter;

  constructor(
    private readonly from: string,
    config: {
      host: string;
      port: number;
      user?: string;
      pass?: string;
    },
  ) {
    this.transporter = createTransport({
      host: config.host,
      port: config.port,
      secure: config.port === 465,
      auth:
        config.user && config.pass
          ? { user: config.user, pass: config.pass }
          : undefined,
    });
  }

  async send(message: EmailMessage): Promise<EmailSendResult> {
    const info = await this.transporter.sendMail({
      from: this.from,
      to: message.to,
      subject: message.subject,
      text: message.text,
      html: message.html,
      headers: message.idempotencyKey
        ? { 'X-Idempotency-Key': message.idempotencyKey }
        : undefined,
    });
    return {
      provider: this.name,
      messageId: info.messageId,
      accepted: true,
      raw: { accepted: info.accepted, rejected: info.rejected },
    };
  }
}
