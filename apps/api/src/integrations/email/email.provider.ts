export interface EmailMessage {
  to: string;
  subject: string;
  html: string;
  text: string;
  idempotencyKey?: string;
}

export interface EmailSendResult {
  provider: string;
  messageId?: string;
  accepted: boolean;
  raw?: unknown;
}

export interface EmailProvider {
  readonly name: string;
  send(message: EmailMessage): Promise<EmailSendResult>;
}
