import { createTransport, type Transporter } from 'nodemailer';
import type { EmailMessage, EmailProvider, EmailSendResult } from './email.provider';

export type SmtpEndpoint = {
  host: string;
  port: number;
  secure: boolean;
  user?: string;
  pass?: string;
  from: string;
};

export class SmtpEmailProvider implements EmailProvider {
  readonly name = 'smtp';
  private readonly transports = new Map<string, Transporter>();

  constructor(private readonly routes: SmtpEndpoint[]) {
    if (!routes.length) {
      throw new Error('At least one SMTP route is required');
    }
  }

  async send(message: EmailMessage): Promise<EmailSendResult> {
    const failures: string[] = [];
    for (const route of this.routes) {
      try {
        const transporter = this.transportFor(route);
        const info = await transporter.sendMail({
          from: route.from,
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
          raw: {
            accepted: info.accepted,
            rejected: info.rejected,
            host: route.host,
          },
        };
      } catch (err) {
        failures.push(
          `${route.host}: ${err instanceof Error ? err.message : String(err)}`,
        );
      }
    }
    throw new Error(failures.join(' | ') || 'SMTP send failed');
  }

  private transportFor(route: SmtpEndpoint) {
    const key = `${route.host}:${route.port}:${route.user ?? ''}`;
    const cached = this.transports.get(key);
    if (cached) return cached;
    const transport =
      route.host === 'json'
        ? createTransport({ jsonTransport: true })
        : createTransport({
            pool: true,
            host: route.host,
            port: route.port,
            secure: route.secure,
            auth:
              route.user && route.pass
                ? { user: route.user, pass: route.pass }
                : undefined,
            maxConnections: 1,
            maxMessages: 100,
          });
    this.transports.set(key, transport);
    return transport;
  }
}
