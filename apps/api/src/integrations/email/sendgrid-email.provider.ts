import type { EmailMessage, EmailProvider, EmailSendResult } from './email.provider';

export class SendgridEmailProvider implements EmailProvider {
  readonly name = 'sendgrid';

  constructor(
    private readonly apiKey: string,
    private readonly from: string,
  ) {}

  async send(message: EmailMessage): Promise<EmailSendResult> {
    const response = await fetch('https://api.sendgrid.com/v3/mail/send', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${this.apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        personalizations: [{ to: [{ email: message.to }] }],
        from: { email: this.from },
        subject: message.subject,
        content: [
          { type: 'text/plain', value: message.text },
          { type: 'text/html', value: message.html },
        ],
        custom_args: message.idempotencyKey
          ? { idempotency_key: message.idempotencyKey }
          : undefined,
      }),
    });

    if (!response.ok) {
      const body = await response.text();
      throw new Error(`SendGrid failed (${response.status}): ${body}`);
    }

    return {
      provider: this.name,
      messageId: response.headers.get('x-message-id') ?? undefined,
      accepted: true,
    };
  }
}
