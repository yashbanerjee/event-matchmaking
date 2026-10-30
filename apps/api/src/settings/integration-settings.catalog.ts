export type SettingFieldType =
  | 'string'
  | 'textarea'
  | 'number'
  | 'boolean'
  | 'select'
  | 'secret'
  | 'date';

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
      'Pace outbound SMTP. Default 4000 ms ≈ 15 emails/minute (Hostinger-safe).',
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
    description: 'Use jav for Ethara JAV matchmaking models',
    group: 'ai',
    type: 'select',
    options: ['none', 'jav', 'openai', 'anthropic'],
  },
  {
    key: 'ai.secondaryProvider',
    envKey: 'AI_SECONDARY_PROVIDER',
    label: 'Secondary AI provider',
    group: 'ai',
    type: 'select',
    options: ['none', 'jav', 'openai', 'anthropic'],
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
    key: 'ai.javBaseUrl',
    envKey: 'JAV_AI_BASE_URL',
    label: 'JAV AI base URL',
    description:
      'OpenAI-compatible API root, e.g. https://your-jav-host/v1 (must expose /models, /embeddings, /chat/completions)',
    group: 'ai',
    type: 'string',
  },
  {
    key: 'ai.javApiKey',
    envKey: 'JAV_AI_API_KEY',
    label: 'JAV AI API key',
    group: 'ai',
    type: 'secret',
    secret: true,
  },
  {
    key: 'ai.javChatModel',
    envKey: 'JAV_AI_CHAT_MODEL',
    label: 'JAV chat model',
    description: 'Base chat model id when no fine-tuned model is set',
    group: 'ai',
    type: 'string',
  },
  {
    key: 'ai.javEmbeddingModel',
    envKey: 'JAV_AI_EMBEDDING_MODEL',
    label: 'JAV embedding model',
    group: 'ai',
    type: 'string',
  },
  {
    key: 'ai.javFineTunedModel',
    envKey: 'JAV_AI_FINE_TUNED_MODEL',
    label: 'JAV fine-tuned model id',
    description:
      'Optional fine-tuned / custom deployment id. When set, matchmaking chat scoring uses this instead of the base chat model.',
    group: 'ai',
    type: 'string',
  },
  {
    key: 'ai.javTemperature',
    envKey: 'JAV_AI_TEMPERATURE',
    label: 'JAV temperature',
    description: '0–1 creativity for pair scoring (lower = more deterministic)',
    group: 'ai',
    type: 'number',
  },
  {
    key: 'ai.matchmakingMode',
    envKey: 'AI_MATCHMAKING_MODE',
    label: 'Matchmaking AI mode',
    description:
      'embedding = semantic vectors; llm = prompt-scored pairs (uses fine-tuned model); hybrid = average of both',
    group: 'ai',
    type: 'select',
    options: ['embedding', 'llm', 'hybrid'],
  },
  {
    key: 'ai.matchmakingBlendWeight',
    envKey: 'AI_MATCHMAKING_BLEND_WEIGHT',
    label: 'AI blend weight',
    description:
      'How much AI contributes to the final score (0–1). Example 0.3 = 70% rules + 30% AI.',
    group: 'ai',
    type: 'number',
  },
  {
    key: 'ai.matchmakingPrompt',
    envKey: 'AI_MATCHMAKING_PROMPT',
    label: 'Matchmaking system prompt',
    description:
      'Fine-tune scoring behaviour without retraining. Used in llm/hybrid modes. Model must return JSON {"score":0-100,"rationale":"…"}.',
    group: 'ai',
    type: 'textarea',
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
    key: 'ops.meetingWindowStart',
    envKey: 'MEETING_WINDOW_START',
    label: 'Meeting period start',
    description:
      'First date clients and guests can book meetings (YYYY-MM-DD). Leave empty for no start limit.',
    group: 'ops',
    type: 'date',
  },
  {
    key: 'ops.meetingWindowEnd',
    envKey: 'MEETING_WINDOW_END',
    label: 'Meeting period end',
    description:
      'Last date clients and guests can book meetings (YYYY-MM-DD). Leave empty for no end limit.',
    group: 'ops',
    type: 'date',
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
