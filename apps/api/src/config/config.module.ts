import { Global, Module } from '@nestjs/common';
import { ConfigModule as NestConfigModule } from '@nestjs/config';
import { existsSync } from 'fs';
import { resolve } from 'path';
import { envSchema } from './env.schema';
import { EnvService } from './env.service';

function resolveEnvFiles(): string[] {
  const candidates = [
    resolve(process.cwd(), '.env'),
    resolve(__dirname, '../../.env'), // apps/api/.env (from dist/config)
    resolve(process.cwd(), '../../.env'),
    resolve(__dirname, '../../../../.env'), // repo root .env
  ];
  return [...new Set(candidates.filter((path) => existsSync(path)))];
}

@Global()
@Module({
  imports: [
    NestConfigModule.forRoot({
      isGlobal: true,
      envFilePath: resolveEnvFiles(),
      validate: (config) => {
        const parsed = envSchema.safeParse(config);
        if (!parsed.success) {
          const message = parsed.error.issues
            .map((i) => `${i.path.join('.')}: ${i.message}`)
            .join('; ');
          throw new Error(`Invalid environment configuration: ${message}`);
        }
        return parsed.data;
      },
    }),
  ],
  providers: [EnvService],
  exports: [EnvService],
})
export class AppConfigModule {}
