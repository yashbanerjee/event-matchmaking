import { z } from 'zod';

export const envSchema = z.object({
  NODE_ENV: z
    .enum(['development', 'test', 'production'])
    .default('development'),
  APP_NAME: z.string().default('event-matchmaking'),
  APP_URL: z.string().url().default('http://localhost:3000'),
  API_URL: z.string().url().default('http://localhost:4000'),
  // Railway injects PORT; API_PORT remains for local/dev.
  PORT: z.coerce.number().int().positive().optional(),
  API_PORT: z.coerce.number().int().positive().default(4000),
  LOG_LEVEL: z.string().default('info'),
  DATABASE_URL: z.string().min(1),
  DATABASE_POOL_SIZE: z.coerce.number().int().positive().default(10),
  REDIS_URL: z.string().min(1),
  RABBITMQ_URL: z.string().min(1),
  RABBITMQ_EXCHANGE: z.string().default('em.events'),
  RABBITMQ_PREFETCH: z.coerce.number().int().positive().default(10),
  JWT_ACCESS_SECRET: z.string().min(32),
  JWT_REFRESH_SECRET: z.string().min(32),
  JWT_ACCESS_TTL: z.string().default('15m'),
  JWT_REFRESH_TTL: z.string().default('7d'),
  BCRYPT_COST: z.coerce.number().int().min(10).max(14).default(12),
  INVITATION_TTL_DAYS: z.coerce.number().int().positive().default(7),
  SESSION_COOKIE_NAME: z.string().default('em_session'),
  CORS_ORIGINS: z.string().default('http://localhost:3000'),
  // Integration/ops defaults — runtime values come from Admin → System Settings.
  // These remain optional env fallbacks for boot before DB overrides exist.
  EMAIL_PROVIDER: z.enum(['console', 'smtp', 'sendgrid']).default('console'),
  EMAIL_FROM: z.string().email().default('noreply@example.com'),
  EMAIL_FROM_NAME: z.string().optional().default('Event Matchmaking'),
  SMTP_HOST: z.string().optional().default(''),
  SMTP_PORT: z.coerce.number().optional().default(587),
  SMTP_SECURE: z
    .string()
    .transform((v) => v === 'true')
    .optional()
    .default('false'),
  SMTP_USER: z.string().optional().default(''),
  SMTP_PASS: z.string().optional().default(''),
  SMTP_MIN_INTERVAL_MS: z.coerce.number().int().min(0).max(60_000).default(5000),
  SMTP_FALLBACK_HOST: z.string().optional().default(''),
  SMTP_FALLBACK_PORT: z.coerce.number().optional().default(587),
  SMTP_FALLBACK_SECURE: z
    .string()
    .transform((v) => v === 'true')
    .optional()
    .default('false'),
  SMTP_FALLBACK_USER: z.string().optional().default(''),
  SMTP_FALLBACK_PASS: z.string().optional().default(''),
  SMTP_FALLBACK_FROM: z.string().optional().default(''),
  SENDGRID_API_KEY: z.string().optional().default(''),
  STORAGE_PROVIDER: z.enum(['local', 's3']).default('local'),
  STORAGE_LOCAL_PATH: z.string().default('./uploads'),
  S3_BUCKET: z.string().optional().default(''),
  S3_REGION: z.string().optional().default(''),
  S3_ACCESS_KEY: z.string().optional().default(''),
  S3_SECRET_KEY: z.string().optional().default(''),
  S3_ENDPOINT: z.string().optional().default(''),
  // AI credentials/models live in Admin → System Settings (not .env).
  AI_ENABLED: z
    .string()
    .transform((v) => v !== 'false' && v !== '0')
    .default('true'),
  AI_PRIMARY_PROVIDER: z.string().default('jav'),
  AI_SECONDARY_PROVIDER: z.string().default('none'),
  OPENAI_API_KEY: z.string().optional().default(''),
  ANTHROPIC_API_KEY: z.string().optional().default(''),
  JAV_AI_BASE_URL: z.string().optional().default(''),
  JAV_AI_API_KEY: z.string().optional().default(''),
  OPENROUTER_API_KEY: z.string().optional().default(''),
  JAV_AI_CHAT_MODEL: z.string().optional().default(''),
  JAV_AI_EMBEDDING_MODEL: z.string().optional().default(''),
  JAV_AI_FINE_TUNED_MODEL: z.string().optional().default(''),
  JAV_AI_TEMPERATURE: z.coerce.number().min(0).max(2).default(0.2),
  AI_MATCHMAKING_MODE: z
    .enum(['embedding', 'llm', 'hybrid'])
    .default('llm'),
  AI_MATCHMAKING_BLEND_WEIGHT: z.coerce.number().min(0).max(1).default(0.3),
  AI_MATCHMAKING_PROMPT: z.string().optional().default(''),
  AI_REQUEST_TIMEOUT_MS: z.coerce.number().int().positive().default(15000),
  AI_MAX_RETRIES: z.coerce.number().int().min(0).max(5).default(2),
  FEATURE_SEMANTIC_SEARCH: z
    .string()
    .transform((v) => v === 'true')
    .default('false'),
  MEETING_DURATION_MINUTES: z.coerce.number().int().positive().default(15),
  MEETING_WINDOW_START: z.string().optional().default(''),
  MEETING_WINDOW_END: z.string().optional().default(''),
  BACKUP_RETENTION_DAYS: z.coerce.number().int().positive().default(30),
  RPO_HOURS: z.coerce.number().positive().default(24),
  RTO_HOURS: z.coerce.number().positive().default(4),
});

export type Env = z.infer<typeof envSchema>;
