export type SettingFieldType =
  | 'string'
  | 'number'
  | 'boolean'
  | 'select'
  | 'secret';

export interface SettingFieldDef {
  key: string;
  label: string;
  description?: string;
  type: SettingFieldType;
  secret?: boolean;
  options?: string[];
  group: 'email' | 'storage' | 'ai' | 'ops';
  envKey: string;
}

export const INTEGRATION_SETTING_FIELDS: SettingFieldDef[] = [
  // Email
  {
    key: 'email.provider',
    envKey: 'EMAIL_PROVIDER',
    label: 'Email provider',
    group: 'email',
    type: 'select',
    options: ['console', 'smtp', 'sendgrid'],
  },
  {
    key: 'email.fromName',
    envKey: 'EMAIL_FROM_NAME',
    label: 'From name',
    description: 'Display name shown to recipients',
    group: 'email',
    type: 'string',
  },
  {
    key: 'email.from',
    envKey: 'EMAIL_FROM',
    label: 'From address',
    group: 'email',
    type: 'string',
  },
  {
    key: 'email.smtpHost',
    envKey: 'SMTP_HOST',
    label: 'SMTP host',
    description: 'e.g. smtp.hostinger.com',
    group: 'email',
    type: 'string',
  },
  {
    key: 'email.smtpPort',
    envKey: 'SMTP_PORT',
    label: 'SMTP port',
    group: 'email',
    type: 'number',
  },
  {
    key: 'email.smtpSecure',
    envKey: 'SMTP_SECURE',
    label: 'Use TLS for SMTP',
    description: 'Enable for port 465; leave off for STARTTLS on 587',
    group: 'email',
    type: 'boolean',
  },
  {
    key: 'email.smtpUser',
    envKey: 'SMTP_USER',
    label: 'SMTP username',
    group: 'email',
    type: 'string',
  },
  {
    key: 'email.smtpPass',
    envKey: 'SMTP_PASS',
    label: 'SMTP password',
    group: 'email',
    type: 'secret',
    secret: true,
  },
  {
    key: 'email.smtpMinIntervalMs',
    envKey: 'SMTP_MIN_INTERVAL_MS',
    label: 'Min interval between sends (ms)',
    description:
      'Hostinger allows ~15/min; 5000 sends one every 5 seconds (12/min)',
    group: 'email',
    type: 'number',
  },
  {
    key: 'email.smtpFallbackHost',
    envKey: 'SMTP_FALLBACK_HOST',
    label: 'Fallback SMTP host',
    description: 'Used only when the primary SMTP server rejects a message',
    group: 'email',
    type: 'string',
  },
  {
    key: 'email.smtpFallbackPort',
    envKey: 'SMTP_FALLBACK_PORT',
    label: 'Fallback SMTP port',
    group: 'email',
    type: 'number',
  },
  {
    key: 'email.smtpFallbackSecure',
    envKey: 'SMTP_FALLBACK_SECURE',
    label: 'Fallback SMTP TLS',
    group: 'email',
    type: 'boolean',
  },
  {
    key: 'email.smtpFallbackUser',
    envKey: 'SMTP_FALLBACK_USER',
    label: 'Fallback SMTP username',
    group: 'email',
    type: 'string',
  },
  {
    key: 'email.smtpFallbackPass',
    envKey: 'SMTP_FALLBACK_PASS',
    label: 'Fallback SMTP password',
    group: 'email',
    type: 'secret',
    secret: true,
  },
  {
    key: 'email.smtpFallbackFrom',
    envKey: 'SMTP_FALLBACK_FROM',
    label: 'Fallback from address',
    group: 'email',
    type: 'string',
  },
  {
    key: 'email.sendgridApiKey',
    envKey: 'SENDGRID_API_KEY',
    label: 'SendGrid API key',
    group: 'email',
    type: 'secret',
    secret: true,
  },

  // Storage
  {
    key: 'storage.provider',
    envKey: 'STORAGE_PROVIDER',
    label: 'Storage provider',
    group: 'storage',
    type: 'select',
    options: ['local', 's3'],
  },
  {
    key: 'storage.localPath',
    envKey: 'STORAGE_LOCAL_PATH',
    label: 'Local storage path',
    group: 'storage',
    type: 'string',
  },
  {
    key: 'storage.s3Bucket',
    envKey: 'S3_BUCKET',
    label: 'S3 bucket',
    group: 'storage',
    type: 'string',
  },
  {
    key: 'storage.s3Region',
    envKey: 'S3_REGION',
    label: 'S3 region',
    group: 'storage',
    type: 'string',
  },
  {
    key: 'storage.s3AccessKey',
    envKey: 'S3_ACCESS_KEY',
    label: 'S3 access key',
    group: 'storage',
    type: 'secret',
    secret: true,
  },
  {
    key: 'storage.s3SecretKey',
    envKey: 'S3_SECRET_KEY',
    label: 'S3 secret key',
    group: 'storage',
    type: 'secret',
    secret: true,
  },
  {
    key: 'storage.s3Endpoint',
    envKey: 'S3_ENDPOINT',
    label: 'S3 endpoint (optional)',
    group: 'storage',
    type: 'string',
  },

  // AI
  {
    key: 'ai.enabled',
    envKey: 'AI_ENABLED',
    label: 'AI enabled',
    group: 'ai',
    type: 'boolean',
  },
  {
    key: 'ai.primaryProvider',
    envKey: 'AI_PRIMARY_PROVIDER',
    label: 'Primary AI provider',
    group: 'ai',
    type: 'select',
    options: ['none', 'openai', 'anthropic'],
  },
  {
    key: 'ai.secondaryProvider',
    envKey: 'AI_SECONDARY_PROVIDER',
    label: 'Secondary AI provider',
    group: 'ai',
    type: 'select',
    options: ['none', 'openai', 'anthropic'],
  },
  {
    key: 'ai.openaiApiKey',
    envKey: 'OPENAI_API_KEY',
    label: 'OpenAI API key',
    group: 'ai',
    type: 'secret',
    secret: true,
  },
  {
    key: 'ai.anthropicApiKey',
    envKey: 'ANTHROPIC_API_KEY',
    label: 'Anthropic API key',
    group: 'ai',
    type: 'secret',
    secret: true,
  },
  {
    key: 'ai.requestTimeoutMs',
    envKey: 'AI_REQUEST_TIMEOUT_MS',
    label: 'AI request timeout (ms)',
    group: 'ai',
    type: 'number',
  },
  {
    key: 'ai.maxRetries',
    envKey: 'AI_MAX_RETRIES',
    label: 'AI max retries',
    group: 'ai',
    type: 'number',
  },

  // Ops / feature flags
  {
    key: 'ops.meetingDurationMinutes',
    envKey: 'MEETING_DURATION_MINUTES',
    label: 'Meeting duration (minutes)',
    description:
      'Default length for generated matchmaking meetings (e.g. 15). Used when generating schedules.',
    group: 'ops',
    type: 'number',
  },
  {
    key: 'ops.semanticSearch',
    envKey: 'FEATURE_SEMANTIC_SEARCH',
    label: 'Semantic search',
    group: 'ops',
    type: 'boolean',
  },
  {
    key: 'ops.backupRetentionDays',
    envKey: 'BACKUP_RETENTION_DAYS',
    label: 'Backup retention (days)',
    group: 'ops',
    type: 'number',
  },
  {
    key: 'ops.rpoHours',
    envKey: 'RPO_HOURS',
    label: 'RPO (hours)',
    group: 'ops',
    type: 'number',
  },
  {
    key: 'ops.rtoHours',
    envKey: 'RTO_HOURS',
    label: 'RTO (hours)',
    group: 'ops',
    type: 'number',
  },
];

export const SECRET_SETTING_KEYS = new Set(
  INTEGRATION_SETTING_FIELDS.filter((f) => f.secret).map((f) => f.key),
);

export function maskSecret(value: unknown): string {
  const text = value == null ? '' : String(value);
  if (!text) return '';
  if (text.length <= 4) return '••••';
  return `${'•'.repeat(Math.min(12, text.length - 4))}${text.slice(-4)}`;
}
