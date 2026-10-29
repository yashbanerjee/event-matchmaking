import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { LoggerModule } from 'nestjs-pino';
import { AppConfigModule } from './config/config.module';
import { PrismaModule } from './prisma/prisma.module';
import { AuditModule } from './audit/audit.module';
import { MessagingModule } from './messaging/messaging.module';
import { IntegrationsModule } from './integrations/integrations.module';
import { AuthModule } from './auth/auth.module';
import { HealthModule } from './health/health.module';
import { InvitationsModule } from './invitations/invitations.module';
import { OrganizationsModule } from './organizations/organizations.module';
import { DashboardModule } from './dashboard/dashboard.module';
import { MatchmakingModule } from './matchmaking/matchmaking.module';
import { FormsModule } from './forms/forms.module';
import { MeetingsModule } from './meetings/meetings.module';
import { PlacesModule } from './places/places.module';
import { FiltersModule } from './filters/filters.module';
import { DocumentsModule } from './documents/documents.module';
import { ReportsModule } from './reports/reports.module';
import { JobsModule } from './jobs/jobs.module';
import { UsersModule } from './users/users.module';
import { SettingsModule } from './settings/settings.module';
import { OpsModule } from './ops/ops.module';
import { RegistrationModule } from './registration/registration.module';

@Module({
  imports: [
    AppConfigModule,
    LoggerModule.forRoot({
      pinoHttp: {
        transport:
          process.env.NODE_ENV !== 'production'
            ? { target: 'pino-pretty', options: { singleLine: true } }
            : undefined,
        redact: {
          paths: [
            'req.headers.authorization',
            'req.headers.cookie',
            'password',
            'passwordHash',
            'token',
            'refreshToken',
          ],
          remove: true,
        },
      },
    }),
    ThrottlerModule.forRoot([{ ttl: 60_000, limit: 120 }]),
    PrismaModule,
    AuditModule,
    MessagingModule,
    IntegrationsModule,
    AuthModule,
    HealthModule,
    InvitationsModule,
    OrganizationsModule,
    DashboardModule,
    MatchmakingModule,
    FormsModule,
    MeetingsModule,
    PlacesModule,
    FiltersModule,
    DocumentsModule,
    ReportsModule,
    JobsModule,
    UsersModule,
    SettingsModule,
    OpsModule,
    RegistrationModule,
  ],
  providers: [
    {
      provide: APP_GUARD,
      useClass: ThrottlerGuard,
    },
  ],
})
export class AppModule {}
