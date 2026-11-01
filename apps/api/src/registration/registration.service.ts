import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { randomInt, randomUUID } from 'crypto';
import * as bcrypt from 'bcrypt';
import {
  eventRegistrationCompleteSchema,
  eventRegistrationStartSchema,
  eventRegistrationVerifyOtpSchema,
  formSchemaDefinition,
  normalizeFormSchemaKeys,
  renderRegistrationAckEmail,
  renderRegistrationAdminNotifyEmail,
  renderRegistrationOtpEmail,
  type FormSchemaDefinition,
  type EventRegistrationCompleteInput,
  type EventRegistrationStartInput,
  type EventRegistrationVerifyOtpInput,
} from '@em/shared';
import { PrismaService } from '../prisma/prisma.service';
import { EnvService } from '../config/env.service';
import { EmailService } from '../integrations/email/email.service';
import { AuthService } from '../auth/auth.service';
import { FormsService } from '../forms/forms.service';
import { hashToken, timingSafeEqualHex } from '../common/crypto.util';

const OTP_TTL_MS = 10 * 60_000;
const OTP_RESEND_MS = 60_000;
const OTP_MAX_ATTEMPTS = 5;
@Injectable()
export class RegistrationService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly env: EnvService,
    private readonly email: EmailService,
    private readonly jwt: JwtService,
    private readonly auth: AuthService,
    private readonly forms: FormsService,
  ) {}

  async getPublicConfig(role?: 'CLIENT' | 'GUEST') {
    const enabled = await this.getSettingBool('registration.enabled', false);
    if (!enabled) {
      return {
        enabled: false as const,
        schema: null,
        formName: null,
        formVersionId: null as string | null,
        eventDates: [] as Array<{ value: string; label: string }>,
        eventActiveStart: '09:00',
        eventActiveEnd: '17:00',
        eventTimeZone: 'Asia/Dubai',
      };
    }

    const investorFormId = await this.getSettingString(
      'registration.investorFormId',
      '',
    );
    const innovatorFormId = await this.getSettingString(
      'registration.innovatorFormId',
      '',
    );
    const legacyFormId = await this.getSettingString('registration.formId', '');

    const schedule = await this.getEventSchedule();

    if (!role) {
      return {
        enabled: true as const,
        schema: null,
        formName: null,
        formVersionId: null as string | null,
        needsRole: true,
        investorFormConfigured: Boolean(investorFormId || legacyFormId),
        innovatorFormConfigured: Boolean(innovatorFormId || legacyFormId),
        ...schedule,
      };
    }

    const formId =
      role === 'CLIENT'
        ? investorFormId || legacyFormId
        : innovatorFormId || legacyFormId;
    if (!formId) {
      return {
        enabled: true as const,
        schema: null,
        formName: null,
        formVersionId: null as string | null,
        reason: 'no_form',
        role,
        ...schedule,
      };
    }

    const version = await this.prisma.formVersion.findFirst({
      where: { formId, status: 'PUBLISHED' },
      orderBy: { version: 'desc' },
      include: { form: true, fields: true },
    });
    if (!version) {
      return {
        enabled: true as const,
        schema: null,
        formName: null,
        formVersionId: null as string | null,
        reason: 'no_published_version',
        role,
        ...schedule,
      };
    }

    const resolved = this.resolveSchema(version.schemaJson, version.fields);
    const schema = await this.forms.withLiveFilterOptions(resolved);

    return {
      enabled: true as const,
      role,
      formId: version.formId,
      formVersionId: version.id as string,
      formName: version.form.name,
      schema,
      ...schedule,
    };
  }

  async start(raw: EventRegistrationStartInput) {
    const input = eventRegistrationStartSchema.parse(raw);
    const config = await this.getPublicConfig(input.role);
    if (!config.enabled) {
      throw new BadRequestException('Event registration is closed');
    }
    if (!config.formVersionId || !config.schema) {
      throw new BadRequestException(
        'Registration form is not configured. Ask an administrator to select investor and innovator forms in Settings.',
      );
    }

    this.assertAvailabilityResponses(
      input.responses,
      config.eventDates,
      config.eventActiveStart,
      config.eventActiveEnd,
    );

    const email = input.email.trim().toLowerCase();
    const existingUser = await this.prisma.user.findUnique({
      where: { email },
    });
    if (existingUser?.status === 'ACTIVE' && existingUser.passwordHash) {
      throw new BadRequestException(
        'An account with this email already exists. Sign in instead.',
      );
    }

    const pending = await this.prisma.eventRegistration.findFirst({
      where: {
        email,
        status: { in: ['PENDING_OTP', 'OTP_VERIFIED'] },
      },
      orderBy: { createdAt: 'desc' },
    });

    if (pending?.otpSentAt) {
      const wait = OTP_RESEND_MS - (Date.now() - pending.otpSentAt.getTime());
      if (wait > 0 && pending.status === 'PENDING_OTP') {
        throw new BadRequestException(
          `Please wait ${Math.ceil(wait / 1000)}s before requesting another code.`,
        );
      }
    }

    const otp = String(randomInt(100_000, 1_000_000));
    const otpHash = hashToken(otp);
    const otpExpiresAt = new Date(Date.now() + OTP_TTL_MS);

    const registration = pending
      ? await this.prisma.eventRegistration.update({
          where: { id: pending.id },
          data: {
            role: input.role,
            formVersionId: config.formVersionId,
            responses: input.responses as object,
            organizationName: input.organizationName.trim(),
            otpHash,
            otpExpiresAt,
            otpAttempts: 0,
            otpSentAt: new Date(),
            emailVerifiedAt: null,
            status: 'PENDING_OTP',
          },
        })
      : await this.prisma.eventRegistration.create({
          data: {
            email,
            role: input.role,
            formVersionId: config.formVersionId,
            responses: input.responses as object,
            organizationName: input.organizationName.trim(),
            otpHash,
            otpExpiresAt,
            otpSentAt: new Date(),
            status: 'PENDING_OTP',
          },
        });

    const fromName = await this.email.getFromName();
    const mail = renderRegistrationOtpEmail({
      brandName: fromName,
      otp,
      expiresMinutes: 10,
    });
    await this.email.send({
      to: email,
      subject: mail.subject,
      html: mail.html,
      text: mail.text,
      idempotencyKey: `registration.otp:${registration.id}:${otpHash.slice(0, 12)}`,
    });

    return {
      registrationId: registration.id,
      email,
      expiresAt: otpExpiresAt.toISOString(),
    };
  }

  async verifyOtp(raw: EventRegistrationVerifyOtpInput) {
    const input = eventRegistrationVerifyOtpSchema.parse(raw);
    const registration = await this.prisma.eventRegistration.findUnique({
      where: { id: input.registrationId },
    });
    if (!registration || registration.status === 'COMPLETED') {
      throw new NotFoundException('Registration not found');
    }
    if (registration.status === 'EXPIRED') {
      throw new BadRequestException('Registration expired. Start again.');
    }
    if (!registration.otpHash || !registration.otpExpiresAt) {
      throw new BadRequestException('Request a verification code first');
    }
    if (registration.otpExpiresAt.getTime() < Date.now()) {
      await this.prisma.eventRegistration.update({
        where: { id: registration.id },
        data: { status: 'EXPIRED' },
      });
      throw new BadRequestException('Code expired. Request a new one.');
    }
    if (registration.otpAttempts >= OTP_MAX_ATTEMPTS) {
      throw new BadRequestException(
        'Too many attempts. Request a new code and try again.',
      );
    }

    const ok = timingSafeEqualHex(registration.otpHash, hashToken(input.otp));
    if (!ok) {
      await this.prisma.eventRegistration.update({
        where: { id: registration.id },
        data: { otpAttempts: { increment: 1 } },
      });
      throw new BadRequestException('Invalid verification code');
    }

    await this.prisma.eventRegistration.update({
      where: { id: registration.id },
      data: {
        status: 'OTP_VERIFIED',
        emailVerifiedAt: new Date(),
        otpHash: null,
        otpAttempts: 0,
      },
    });

    const registrationToken = await this.jwt.signAsync(
      {
        purpose: 'event_registration',
        registrationId: registration.id,
        email: registration.email,
      },
      {
        secret: this.env.jwtAccessSecret,
        expiresIn: '30m',
      },
    );

    return {
      registrationToken,
      email: registration.email,
      role: registration.role,
      organizationName: registration.organizationName,
    };
  }

  async complete(raw: EventRegistrationCompleteInput) {
    const input = eventRegistrationCompleteSchema.parse(raw);
    let payload: {
      purpose?: string;
      registrationId?: string;
      email?: string;
    };
    try {
      payload = await this.jwt.verifyAsync(input.registrationToken, {
        secret: this.env.jwtAccessSecret,
      });
    } catch {
      throw new BadRequestException(
        'Registration session expired. Verify your email again.',
      );
    }
    if (
      payload.purpose !== 'event_registration' ||
      !payload.registrationId
    ) {
      throw new BadRequestException('Invalid registration token');
    }

    const registration = await this.prisma.eventRegistration.findUnique({
      where: { id: payload.registrationId },
    });
    if (!registration) {
      throw new NotFoundException('Registration not found');
    }
    if (registration.status === 'COMPLETED') {
      throw new BadRequestException('Registration already completed');
    }
    if (registration.status !== 'OTP_VERIFIED') {
      throw new BadRequestException('Verify your email before setting a password');
    }

    const email = registration.email.toLowerCase();
    const existingUser = await this.prisma.user.findUnique({
      where: { email },
    });
    if (existingUser?.status === 'ACTIVE' && existingUser.passwordHash) {
      throw new BadRequestException(
        'An account with this email already exists. Sign in instead.',
      );
    }

    const orgType = registration.role === 'CLIENT' ? 'COMPANY' : 'VENDOR';
    const roleCode =
      registration.role === 'CLIENT' ? 'COMPANY_USER' : 'VENDOR_USER';
    const roleLabel = registration.role === 'CLIENT' ? 'Investor' : 'Innovator';
    const name =
      registration.organizationName?.trim() ||
      `${input.firstName} ${input.lastName}`.trim() ||
      email.split('@')[0] ||
      'Participant';

    const role = await this.prisma.role.findUnique({
      where: { code: roleCode },
    });
    if (!role) {
      throw new BadRequestException(`${roleCode} role is missing`);
    }

    const passwordHash = await bcrypt.hash(input.password, this.env.bcryptCost);
    const code = await this.uniqueOrgCode(name, orgType);

    const created = await this.prisma.$transaction(async (tx) => {
      const user =
        existingUser ??
        (await tx.user.create({
          data: {
            email,
            passwordHash,
            firstName: input.firstName.trim(),
            lastName: input.lastName.trim(),
            status: 'ACTIVE',
          },
        }));

      if (existingUser) {
        await tx.user.update({
          where: { id: existingUser.id },
          data: {
            passwordHash,
            firstName: input.firstName.trim(),
            lastName: input.lastName.trim(),
            status: 'ACTIVE',
          },
        });
      }

      // Public registration is Shark Tank–style: OTP proves email, then the
      // participant is verified and match-eligible immediately.
      const org = await tx.organization.create({
        data: {
          type: orgType,
          code,
          name,
          status: 'APPROVED',
          customAttrs: {
            contactEmail: email,
            registration: true,
            autoVerified: true,
          },
        },
      });

      if (orgType === 'VENDOR') {
        await tx.vendor.create({
          data: {
            organizationId: org.id,
            displayName: name,
            categories: [],
            capabilities: [],
            approvalStatus: 'VERIFIED',
            verificationStatus: 'VERIFIED',
            matchingEligible: true,
            onboardingComplete: true,
          },
        });
      } else {
        await tx.company.create({
          data: {
            organizationId: org.id,
            approvalStatus: 'VERIFIED',
            verificationStatus: 'VERIFIED',
            matchingEligible: true,
          },
        });
      }

      await tx.userRole.upsert({
        where: {
          userId_roleId: { userId: user.id, roleId: role.id },
        },
        create: { userId: user.id, roleId: role.id },
        update: {},
      });

      await tx.organizationMember.upsert({
        where: {
          organizationId_userId: {
            organizationId: org.id,
            userId: user.id,
          },
        },
        create: {
          organizationId: org.id,
          userId: user.id,
          isPrimary: true,
        },
        update: {},
      });

      const formVersion = await tx.formVersion.findUniqueOrThrow({
        where: { id: registration.formVersionId },
      });
      await tx.formAssignment.create({
        data: {
          organizationId: org.id,
          formId: formVersion.formId,
          formVersionId: registration.formVersionId,
        },
      });

      const submission = await tx.formSubmission.create({
        data: {
          formVersionId: registration.formVersionId,
          organizationId: org.id,
          submittedById: user.id,
          status: 'APPROVED',
          responses: registration.responses as object,
          submittedAt: new Date(),
          reviewedAt: new Date(),
        },
      });

      await tx.eventRegistration.update({
        where: { id: registration.id },
        data: {
          status: 'COMPLETED',
          organizationId: org.id,
          userId: user.id,
          submissionId: submission.id,
        },
      });

      return { user, org, submission };
    });

    const fromName = await this.email.getFromName();
    const appUrl = (this.env.appUrl || 'http://localhost:3000').replace(
      /\/$/,
      '',
    );
    const dashboardUrl =
      registration.role === 'CLIENT' ? `${appUrl}/portal` : `${appUrl}/vendor`;
    const reviewUrl =
      registration.role === 'CLIENT'
        ? `${appUrl}/admin/companies/${created.org.id}/form?submissionId=${created.submission.id}`
        : `${appUrl}/admin/vendors/${created.org.id}/form?submissionId=${created.submission.id}`;

    const ack = renderRegistrationAckEmail({
      brandName: fromName,
      firstName: input.firstName,
      roleLabel,
      dashboardUrl,
    });
    await this.email.send({
      to: email,
      subject: ack.subject,
      html: ack.html,
      text: ack.text,
      idempotencyKey: `registration.ack:${registration.id}`,
    });

    const notify = renderRegistrationAdminNotifyEmail({
      brandName: fromName,
      organizationName: name,
      email,
      roleLabel,
      reviewUrl,
    });
    for (const to of await this.notifyEmails()) {
      await this.email.send({
        to,
        subject: notify.subject,
        html: notify.html,
        text: notify.text,
        idempotencyKey: `registration.admin:${registration.id}:${to}`,
      });
    }

    await this.forms.normalizeProfile(created.submission.id);

    return this.auth.createSessionForUser(created.user.id, email);
  }

  private assertAvailabilityResponses(
    responses: Record<string, unknown>,
    eventDates: Array<{ value: string; label: string }>,
    activeStart: string,
    activeEnd: string,
  ) {
    const allowed = new Set(eventDates.map((d) => d.value));
    const dates = Array.isArray(responses.availability_dates)
      ? responses.availability_dates.map(String)
      : [];
    const selected = dates.filter((d) => /^\d{4}-\d{2}-\d{2}$/.test(d));
    if (!selected.length) {
      throw new BadRequestException(
        'Select at least one event day for meetings.',
      );
    }
    if (selected.some((d) => !allowed.has(d))) {
      throw new BadRequestException(
        'Meeting days must be within the published event dates.',
      );
    }

    const windows =
      responses.availability_windows &&
      typeof responses.availability_windows === 'object' &&
      !Array.isArray(responses.availability_windows)
        ? (responses.availability_windows as Record<string, unknown>)
        : {};

    for (const date of selected) {
      const raw = windows[date];
      const row =
        raw && typeof raw === 'object' && !Array.isArray(raw)
          ? (raw as Record<string, unknown>)
          : {};
      const start =
        typeof row.start === 'string'
          ? row.start
          : typeof responses.availability_start_time === 'string'
            ? responses.availability_start_time
            : '';
      const end =
        typeof row.end === 'string'
          ? row.end
          : typeof responses.availability_end_time === 'string'
            ? responses.availability_end_time
            : '';
      if (!/^\d{2}:\d{2}$/.test(start) || !/^\d{2}:\d{2}$/.test(end)) {
        throw new BadRequestException(
          `Choose available times for ${date} within event hours.`,
        );
      }
      if (start < activeStart || end > activeEnd || start >= end) {
        throw new BadRequestException(
          `Availability on ${date} must stay between ${activeStart} and ${activeEnd}.`,
        );
      }
    }
  }

  /** Public event days + fixed active hours (Dubai) for the availability step. */
  private async getEventSchedule() {
    const dates = await this.getEventDateOptions();
    const activeStart =
      (await this.getSettingString('ops.eventActiveStart', '09:00')).trim() ||
      '09:00';
    const activeEnd =
      (await this.getSettingString('ops.eventActiveEnd', '17:00')).trim() ||
      '17:00';
    return {
      eventDates: dates,
      eventActiveStart: /^\d{2}:\d{2}$/.test(activeStart) ? activeStart : '09:00',
      eventActiveEnd: /^\d{2}:\d{2}$/.test(activeEnd) ? activeEnd : '17:00',
      eventTimeZone: 'Asia/Dubai',
    };
  }

  private async getEventDateOptions(): Promise<
    Array<{ value: string; label: string }>
  > {
    const raw = await this.getSettingString('ops.eventDates', '');
    const dates = raw
      .split(/[,\n]/)
      .map((part) => part.trim())
      .filter((part) => /^\d{4}-\d{2}-\d{2}$/.test(part));
    if (!dates.length) {
      const row = await this.prisma.systemSetting.findUnique({
        where: { key: 'ops.eventDates' },
      });
      const value = (row?.value as { value?: unknown } | null)?.value;
      if (Array.isArray(value)) {
        for (const item of value) {
          if (typeof item === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(item)) {
            dates.push(item);
          }
        }
      }
    }
    return dates.map((value) => ({
      value,
      label: new Date(`${value}T12:00:00Z`).toLocaleDateString('en-GB', {
        weekday: 'short',
        day: 'numeric',
        month: 'short',
        year: 'numeric',
        timeZone: 'Asia/Dubai',
      }),
    }));
  }

  private resolveSchema(
    schemaJson: unknown,
    fields: Array<{
      fieldKey: string;
      label: string;
      description: string | null;
      fieldType: string;
      required: boolean;
      displayOrder: number;
      options: unknown;
    }>,
  ): FormSchemaDefinition {
    const parsed = formSchemaDefinition.safeParse(schemaJson);
    if (parsed.success) {
      return normalizeFormSchemaKeys(parsed.data);
    }
    const sectionId = randomUUID();
    return normalizeFormSchemaKeys({
      sections: [{ id: sectionId, title: 'Registration', order: 0 }],
      fields: fields.map((f, index) => ({
        id: randomUUID(),
        key: f.fieldKey,
        type: (f.fieldType as FormSchemaDefinition['fields'][number]['type']) ||
          'text',
        label: f.label,
        description: f.description ?? undefined,
        required: f.required,
        sectionId,
        order: f.displayOrder ?? index,
        options: Array.isArray(f.options)
          ? (f.options as { value: string; label: string }[])
          : undefined,
      })),
    });
  }

  private async uniqueOrgCode(
    name: string,
    type: 'COMPANY' | 'VENDOR',
  ): Promise<string> {
    const prefix = type === 'COMPANY' ? 'CLT' : 'GST';
    const base =
      name
        .toUpperCase()
        .replace(/[^A-Z0-9]+/g, '_')
        .replace(/^_|_$/g, '')
        .slice(0, 18) || prefix;
    for (let i = 0; i < 8; i += 1) {
      const suffix = i === 0 ? '' : `_${randomInt(100, 999)}`;
      const code = `${prefix}_${base}${suffix}`.slice(0, 32);
      const exists = await this.prisma.organization.findUnique({
        where: { code },
      });
      if (!exists) return code;
    }
    return `${prefix}_${Date.now().toString(36).toUpperCase()}`;
  }

  private async notifyEmails(): Promise<string[]> {
    const configured = await this.getSettingString(
      'registration.notifyEmails',
      '',
    );
    const fromConfig = configured
      .split(',')
      .map((s) => s.trim().toLowerCase())
      .filter(Boolean);
    if (fromConfig.length) return [...new Set(fromConfig)];

    const admins = await this.prisma.user.findMany({
      where: {
        status: 'ACTIVE',
        roles: { some: { role: { code: { in: ['SUPER_ADMIN', 'ADMIN'] } } } },
      },
      select: { email: true },
      take: 10,
    });
    return admins.map((a) => a.email.toLowerCase());
  }

  private async getSettingString(key: string, fallback: string) {
    const row = await this.prisma.systemSetting.findUnique({ where: { key } });
    if (!row) return fallback;
    const value = (row.value as { value?: unknown } | null)?.value;
    return typeof value === 'string' ? value : fallback;
  }

  private async getSettingBool(key: string, fallback: boolean) {
    const row = await this.prisma.systemSetting.findUnique({ where: { key } });
    if (!row) return fallback;
    const value = (row.value as { value?: unknown } | null)?.value;
    if (typeof value === 'boolean') return value;
    if (value === 'true') return true;
    if (value === 'false') return false;
    return fallback;
  }
}
