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
    label: 'AI matchmaking',
    description:
      'Turn AI matchmaking on or off. When off, scoring and recommendations use rule-based tag matching only (no model calls).',
    group: 'ai',
    type: 'boolean',
  },
  {
    key: 'ai.primaryProvider',
    envKey: 'AI_PRIMARY_PROVIDER',
    label: 'Primary AI provider',
    description:
      'Use jav for OpenRouter / self-hosted base URL. openai/anthropic are optional fallbacks.',
    group: 'ai',
    type: 'select',
    options: ['jav', 'openai', 'anthropic', 'none'],
  },
  {
    key: 'ai.secondaryProvider',
    envKey: 'AI_SECONDARY_PROVIDER',
    label: 'Secondary AI provider',
    group: 'ai',
    type: 'select',
    options: ['none', 'openai', 'jav', 'anthropic'],
  },
  {
    key: 'ai.javBaseUrl',
    envKey: 'JAV_AI_BASE_URL',
    label: 'API base URL',
    description:
      'OpenRouter: https://openrouter.ai/api/v1 — Self-hosted (vLLM, LiteLLM, etc.): your /v1 endpoint.',
    group: 'ai',
    type: 'string',
  },
  {
    key: 'ai.openrouterApiKey',
    envKey: 'OPENROUTER_API_KEY',
    label: 'OpenRouter API key',
    description:
      'Paste your sk-or-v1-… key here (Admin settings only — not .env).',
    group: 'ai',
    type: 'secret',
    secret: true,
  },
  {
    key: 'ai.javChatModel',
    envKey: 'JAV_AI_CHAT_MODEL',
    label: 'Matchmaking model id',
    description:
      'Default: qwen/qwen-2.5-72b-instruct on OpenRouter. Or any OpenAI-compatible chat model id for structured JSON scores + match reasons.',
    group: 'ai',
    type: 'string',
  },
  {
    key: 'ai.javFineTunedModel',
    envKey: 'JAV_AI_FINE_TUNED_MODEL',
    label: 'Override model id',
    description:
      'If set, replaces Matchmaking model id (pin a specific version or internal fine-tune).',
    group: 'ai',
    type: 'string',
  },
  {
    key: 'ai.javTemperature',
    envKey: 'JAV_AI_TEMPERATURE',
    label: 'Model temperature',
    description: '0–1 (lower = more deterministic pair scores and reasons)',
    group: 'ai',
    type: 'number',
  },
  {
    key: 'ai.pairScoringMethod',
    envKey: 'AI_PAIR_SCORING_METHOD',
    label: 'Pair scoring method',
    description:
      'structured_json = chat JSON score + custom rationale (open models on OpenRouter or self-hosted). jev_decisions = legacy Jev tier labels only.',
    group: 'ai',
    type: 'select',
    options: ['structured_json', 'jev_decisions'],
  },
  {
    key: 'ai.matchmakingMode',
    envKey: 'AI_MATCHMAKING_MODE',
    label: 'Matchmaking AI mode',
    description:
      'llm = model scores each pair (recommended). hybrid also blends embeddings if configured.',
    group: 'ai',
    type: 'select',
    options: ['llm', 'hybrid', 'embedding'],
  },
  {
    key: 'ops.recommendationScoreThreshold',
    envKey: 'RECOMMENDATION_SCORE_THRESHOLD',
    label: 'Recommendation score threshold',
    description:
      'Only show Recommendations at or above this score (default 75). Full innovator directory stays available under Innovators. Personal contact fields are never sent to AI.',
    group: 'ai',
    type: 'number',
  },
  {
    key: 'ops.investorRecommendationLimit',
    envKey: 'INVESTOR_RECOMMENDATION_LIMIT',
    label: 'Investor recommendation count',
    description:
      'How many innovator matches to keep for each investor (1–20). Default 10.',
    group: 'ai',
    type: 'number',
  },
  {
    key: 'ops.innovatorRecommendationLimit',
    envKey: 'INNOVATOR_RECOMMENDATION_LIMIT',
    label: 'Innovator recommendation count',
    description:
      'How many investor matches to keep for each innovator (1–20). Default 5.',
    group: 'ai',
    type: 'number',
  },
  {
    key: 'ops.tagCategoryThresholds',
    envKey: 'TAG_CATEGORY_THRESHOLDS',
    label: 'Tag category thresholds (JSON)',
    description:
      'Minimum 0–100 scores per tag category before a pair can be recommended. Keys: challenge, solution, geography, commercial, stage, ticket. 0 = no minimum. Prefer editing these on the Matchmaking Fine-tune panel.',
    group: 'ai',
    type: 'textarea',
  },
  {
    key: 'ai.matchmakingBlendWeight',
    envKey: 'AI_MATCHMAKING_BLEND_WEIGHT',
    label: 'AI blend weight',
    description:
      'How much AI contributes to the final score (0–1). Default 0.3 (70% tags + 30% AI). Keep ~0.25–0.35 so tags still dominate hard fit.',
    group: 'ai',
    type: 'number',
  },
  {
    key: 'ai.peerRecomputeLlmCandidates',
    envKey: 'AI_PEER_RECOMPUTE_LLM_CANDIDATES',
    label: 'Peer recompute LLM candidates',
    description:
      'How many top rule-based matches get a full Qwen reason per org (default 12). Lower = faster recompute; final stored count still follows investor/innovator limits.',
    group: 'ai',
    type: 'number',
  },
  {
    key: 'ai.peerRecomputeConcurrency',
    envKey: 'AI_PEER_RECOMPUTE_CONCURRENCY',
    label: 'Peer recompute parallel LLM calls',
    description:
      'Concurrent OpenRouter requests while recomputing one profile (default 5). Raise for speed if your quota allows.',
    group: 'ai',
    type: 'number',
  },
  {
    key: 'ai.matchmakingPrompt',
    envKey: 'AI_MATCHMAKING_PROMPT',
    label: 'Matchmaking system prompt',
    description:
      'Instructions for the model. With structured_json scoring, the model must return JSON {"score":0-100,"rationale":"…"}.',
    group: 'ai',
    type: 'textarea',
  },
  {
    key: 'ai.matchmakingUserTemplate',
    envKey: 'AI_MATCHMAKING_USER_TEMPLATE',
    label: 'Matchmaking user message template',
    description:
      'Placeholders: {{investorProfile}}, {{innovatorProfile}} (aliases {{left}}, {{right}}). Sent as the user message to the model.',
    group: 'ai',
    type: 'textarea',
  },
  {
    key: 'ai.includeOnboardingInProfile',
    envKey: 'AI_INCLUDE_ONBOARDING_IN_PROFILE',
    label: 'Include onboarding answers in AI profile text',
    description:
      'Default on. Adds safe free-text from onboarding (thesis, impact, goals) on top of structured match fields. Personal contact details are never sent to AI.',
    group: 'ai',
    type: 'boolean',
  },
  {
    key: 'ai.javEmbeddingModel',
    envKey: 'JAV_AI_EMBEDDING_MODEL',
    label: 'Embedding model (optional)',
    description:
      'Only for embedding/hybrid modes. Jev itself is chat/decision — e.g. openai/text-embedding-3-small.',
    group: 'ai',
    type: 'string',
  },
  {
    key: 'ai.openaiApiKey',
    envKey: 'OPENAI_API_KEY',
    label: 'OpenAI API key (optional fallback)',
    group: 'ai',
    type: 'secret',
    secret: true,
  },
  {
    key: 'ai.anthropicApiKey',
    envKey: 'ANTHROPIC_API_KEY',
    label: 'Anthropic API key (optional fallback)',
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
    key: 'ops.inProgressAutoCompleteMinutes',
    envKey: 'MEETING_IN_PROGRESS_AUTO_COMPLETE_MINUTES',
    label: 'Auto-stop in-progress meetings (minutes)',
    description:
      'If an investor starts a meeting and forgets to stop it, the system completes it after this many minutes (default 45).',
    group: 'ops',
    type: 'number',
  },
  {
    key: 'ops.eventDates',
    envKey: 'MEETING_EVENT_DATES',
    label: 'Event dates',
    description:
      'Comma-separated event days (YYYY-MM-DD). Meetings can only be booked on these dates.',
    group: 'ops',
    type: 'string',
  },
  {
    key: 'ops.eventActiveStart',
    envKey: 'MEETING_ACTIVE_START',
    label: 'Active hours start',
    description: 'Earliest meeting start time on each event day (HH:MM, Dubai time).',
    group: 'ops',
    type: 'string',
  },
  {
    key: 'ops.eventActiveEnd',
    envKey: 'MEETING_ACTIVE_END',
    label: 'Active hours end',
    description: 'Latest meeting end time on each event day (HH:MM, Dubai time).',
    group: 'ops',
    type: 'string',
  },
  {
    key: 'ops.meetingWindowStart',
    envKey: 'MEETING_WINDOW_START',
    label: 'Meeting period start',
    description:
      'Derived from the first event date. Kept for compatibility.',
    group: 'ops',
    type: 'date',
  },
  {
    key: 'ops.meetingWindowEnd',
    envKey: 'MEETING_WINDOW_END',
    label: 'Meeting period end',
    description:
      'Derived from the last event date. Kept for compatibility.',
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
