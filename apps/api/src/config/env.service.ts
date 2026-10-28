import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Env } from './env.schema';

@Injectable()
export class EnvService {
  constructor(private readonly config: ConfigService<Env, true>) {}

  get nodeEnv() {
    return this.config.get('NODE_ENV', { infer: true });
  }

  get apiPort() {
    const railwayPort = this.config.get('PORT', { infer: true });
    if (railwayPort) return railwayPort;
    return this.config.get('API_PORT', { infer: true });
  }

  get corsOrigins() {
    const normalize = (value: string) => value.trim().replace(/\/+$/, '');
    const fromList = this.config
      .get('CORS_ORIGINS', { infer: true })
      .split(',')
      .map(normalize)
      .filter(Boolean);
    const appUrl = normalize(
      this.config.get('APP_URL', { infer: true }) ?? '',
    );
    return [...new Set([...fromList, ...(appUrl ? [appUrl] : [])])];
  }

  get databaseUrl() {
    return this.config.get('DATABASE_URL', { infer: true });
  }

  get redisUrl() {
    return this.config.get('REDIS_URL', { infer: true });
  }

  get rabbitUrl() {
    return this.config.get('RABBITMQ_URL', { infer: true });
  }

  get rabbitExchange() {
    return this.config.get('RABBITMQ_EXCHANGE', { infer: true });
  }

  get jwtAccessSecret() {
    return this.config.get('JWT_ACCESS_SECRET', { infer: true });
  }

  get jwtRefreshSecret() {
    return this.config.get('JWT_REFRESH_SECRET', { infer: true });
  }

  get jwtAccessTtl() {
    return this.config.get('JWT_ACCESS_TTL', { infer: true });
  }

  get jwtRefreshTtl() {
    return this.config.get('JWT_REFRESH_TTL', { infer: true });
  }

  get bcryptCost() {
    return this.config.get('BCRYPT_COST', { infer: true });
  }

  get invitationTtlDays() {
    return this.config.get('INVITATION_TTL_DAYS', { infer: true });
  }

  get appUrl() {
    return this.config.get('APP_URL', { infer: true });
  }

  get emailProvider() {
    return this.config.get('EMAIL_PROVIDER', { infer: true });
  }

  get emailFrom() {
    return this.config.get('EMAIL_FROM', { infer: true });
  }

  get aiEnabled() {
    return this.config.get('AI_ENABLED', { infer: true });
  }

  get storageProvider() {
    return this.config.get('STORAGE_PROVIDER', { infer: true });
  }

  get storageLocalPath() {
    return this.config.get('STORAGE_LOCAL_PATH', { infer: true });
  }

  get raw(): Env {
    return {
      NODE_ENV: this.nodeEnv,
      APP_NAME: this.config.get('APP_NAME', { infer: true }),
      APP_URL: this.appUrl,
      API_URL: this.config.get('API_URL', { infer: true }),
      API_PORT: this.apiPort,
      LOG_LEVEL: this.config.get('LOG_LEVEL', { infer: true }),
      DATABASE_URL: this.databaseUrl,
      DATABASE_POOL_SIZE: this.config.get('DATABASE_POOL_SIZE', {
        infer: true,
      }),
      REDIS_URL: this.redisUrl,
      RABBITMQ_URL: this.rabbitUrl,
      RABBITMQ_EXCHANGE: this.rabbitExchange,
      RABBITMQ_PREFETCH: this.config.get('RABBITMQ_PREFETCH', { infer: true }),
      JWT_ACCESS_SECRET: this.jwtAccessSecret,
      JWT_REFRESH_SECRET: this.jwtRefreshSecret,
      JWT_ACCESS_TTL: this.jwtAccessTtl,
      JWT_REFRESH_TTL: this.jwtRefreshTtl,
      BCRYPT_COST: this.bcryptCost,
      INVITATION_TTL_DAYS: this.invitationTtlDays,
      SESSION_COOKIE_NAME: this.config.get('SESSION_COOKIE_NAME', {
        infer: true,
      }),
      CORS_ORIGINS: this.config.get('CORS_ORIGINS', { infer: true }),
      EMAIL_PROVIDER: this.emailProvider,
      EMAIL_FROM: this.emailFrom,
      EMAIL_FROM_NAME: this.config.get('EMAIL_FROM_NAME', { infer: true }),
      SMTP_HOST: this.config.get('SMTP_HOST', { infer: true }),
      SMTP_PORT: this.config.get('SMTP_PORT', { infer: true }),
      SMTP_SECURE: this.config.get('SMTP_SECURE', { infer: true }),
      SMTP_USER: this.config.get('SMTP_USER', { infer: true }),
      SMTP_PASS: this.config.get('SMTP_PASS', { infer: true }),
      SMTP_MIN_INTERVAL_MS: this.config.get('SMTP_MIN_INTERVAL_MS', {
        infer: true,
      }),
      SMTP_FALLBACK_HOST: this.config.get('SMTP_FALLBACK_HOST', { infer: true }),
      SMTP_FALLBACK_PORT: this.config.get('SMTP_FALLBACK_PORT', { infer: true }),
      SMTP_FALLBACK_SECURE: this.config.get('SMTP_FALLBACK_SECURE', {
        infer: true,
      }),
      SMTP_FALLBACK_USER: this.config.get('SMTP_FALLBACK_USER', { infer: true }),
      SMTP_FALLBACK_PASS: this.config.get('SMTP_FALLBACK_PASS', { infer: true }),
      SMTP_FALLBACK_FROM: this.config.get('SMTP_FALLBACK_FROM', { infer: true }),
      SENDGRID_API_KEY: this.config.get('SENDGRID_API_KEY', { infer: true }),
      STORAGE_PROVIDER: this.storageProvider,
      STORAGE_LOCAL_PATH: this.storageLocalPath,
      S3_BUCKET: this.config.get('S3_BUCKET', { infer: true }),
      S3_REGION: this.config.get('S3_REGION', { infer: true }),
      S3_ACCESS_KEY: this.config.get('S3_ACCESS_KEY', { infer: true }),
      S3_SECRET_KEY: this.config.get('S3_SECRET_KEY', { infer: true }),
      S3_ENDPOINT: this.config.get('S3_ENDPOINT', { infer: true }),
      AI_ENABLED: this.aiEnabled,
      AI_PRIMARY_PROVIDER: this.config.get('AI_PRIMARY_PROVIDER', {
        infer: true,
      }),
      AI_SECONDARY_PROVIDER: this.config.get('AI_SECONDARY_PROVIDER', {
        infer: true,
      }),
      OPENAI_API_KEY: this.config.get('OPENAI_API_KEY', { infer: true }),
      ANTHROPIC_API_KEY: this.config.get('ANTHROPIC_API_KEY', { infer: true }),
      AI_REQUEST_TIMEOUT_MS: this.config.get('AI_REQUEST_TIMEOUT_MS', {
        infer: true,
      }),
      AI_MAX_RETRIES: this.config.get('AI_MAX_RETRIES', { infer: true }),
      FEATURE_SEMANTIC_SEARCH: this.config.get('FEATURE_SEMANTIC_SEARCH', {
        infer: true,
      }),
      BACKUP_RETENTION_DAYS: this.config.get('BACKUP_RETENTION_DAYS', {
        infer: true,
      }),
      RPO_HOURS: this.config.get('RPO_HOURS', { infer: true }),
      RTO_HOURS: this.config.get('RTO_HOURS', { infer: true }),
    };
  }
}
