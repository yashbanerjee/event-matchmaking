import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { FieldType, Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { OutboxService } from '../messaging/outbox.service';
import type { AuthUser } from '../common/decorators';

export interface FormFieldInput {
  fieldKey: string;
  label: string;
  description?: string;
  fieldType: FieldType;
  required?: boolean;
  defaultValue?: unknown;
  validationRules?: Record<string, unknown>;
  displayOrder?: number;
  conditionalLogic?: Record<string, unknown>;
  options?: unknown[];
  fileRestrictions?: Record<string, unknown>;
  sensitivity?: 'PUBLIC' | 'INTERNAL' | 'CONFIDENTIAL' | 'RESTRICTED';
}

@Injectable()
export class FormsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly outbox: OutboxService,
  ) {}

  async createForm(
    actor: AuthUser,
    input: {
      code: string;
      name: string;
      description?: string;
      targetType?: 'COMPANY' | 'VENDOR' | 'PLATFORM';
      isTemplate?: boolean;
      fields?: FormFieldInput[];
    },
  ) {
    const form = await this.prisma.$transaction(async (tx) => {
      const created = await tx.form.create({
        data: {
          code: input.code,
          name: input.name,
          description: input.description,
          targetType: input.targetType,
          isTemplate: input.isTemplate ?? false,
        },
      });
      const version = await tx.formVersion.create({
        data: {
          formId: created.id,
          version: 1,
          status: 'DRAFT',
        },
      });
      if (input.fields?.length) {
        await tx.formField.createMany({
          data: input.fields.map((f, index) => ({
            formVersionId: version.id,
            fieldKey: f.fieldKey,
            label: f.label,
            description: f.description,
            fieldType: f.fieldType,
            required: f.required ?? false,
            defaultValue: (f.defaultValue as Prisma.InputJsonValue) ?? undefined,
            validationRules: (f.validationRules as Prisma.InputJsonValue) ?? {},
            displayOrder: f.displayOrder ?? index,
            conditionalLogic:
              (f.conditionalLogic as Prisma.InputJsonValue) ?? {},
            options: (f.options as Prisma.InputJsonValue) ?? [],
            fileRestrictions:
              (f.fileRestrictions as Prisma.InputJsonValue) ?? {},
            sensitivity: f.sensitivity ?? 'INTERNAL',
          })),
        });
      }
      return tx.form.findUnique({
        where: { id: created.id },
        include: { versions: { include: { fields: true } } },
      });
    });

    await this.audit.record({
      actorId: actor.id,
      action: 'form.create',
      entityType: 'Form',
      entityId: form!.id,
      outcome: 'SUCCESS',
    });

    return form;
  }

  async publishVersion(actor: AuthUser, formId: string) {
    const draft = await this.prisma.formVersion.findFirst({
      where: { formId, status: 'DRAFT' },
      orderBy: { version: 'desc' },
      include: { fields: true },
    });
    if (!draft) {
      throw new BadRequestException('No draft version to publish');
    }

    const published = await this.prisma.formVersion.update({
      where: { id: draft.id },
      data: {
        status: 'PUBLISHED',
        publishedAt: new Date(),
        schemaHash: `v${draft.version}:${draft.fields.length}`,
      },
      include: { fields: true },
    });

    await this.audit.record({
      actorId: actor.id,
      action: 'form.publish',
      entityType: 'FormVersion',
      entityId: published.id,
      outcome: 'SUCCESS',
    });

    return published;
  }

  async duplicateAsNewVersion(actor: AuthUser, formId: string) {
    const latest = await this.prisma.formVersion.findFirst({
      where: { formId },
      orderBy: { version: 'desc' },
      include: { fields: true },
    });
    if (!latest) {
      throw new NotFoundException('Form version not found');
    }
    if (latest.status === 'DRAFT') {
      throw new BadRequestException('Draft already exists');
    }

    return this.prisma.$transaction(async (tx) => {
      const version = await tx.formVersion.create({
        data: {
          formId,
          version: latest.version + 1,
          status: 'DRAFT',
        },
      });
      await tx.formField.createMany({
        data: latest.fields.map((f) => ({
          formVersionId: version.id,
          fieldKey: f.fieldKey,
          label: f.label,
          description: f.description,
          fieldType: f.fieldType,
          required: f.required,
          defaultValue: f.defaultValue ?? undefined,
          validationRules: f.validationRules ?? {},
          displayOrder: f.displayOrder,
          conditionalLogic: f.conditionalLogic ?? {},
          options: f.options ?? [],
          fileRestrictions: f.fileRestrictions ?? {},
          sensitivity: f.sensitivity,
          permissions: f.permissions ?? {},
        })),
      });
      await this.audit.record({
        actorId: actor.id,
        action: 'form.version.duplicate',
        entityType: 'FormVersion',
        entityId: version.id,
        outcome: 'SUCCESS',
      });
      return tx.formVersion.findUnique({
        where: { id: version.id },
        include: { fields: true },
      });
    });
  }

  async assignForm(
    actor: AuthUser,
    input: {
      formId: string;
      formVersionId: string;
      organizationId: string;
      dueAt?: string;
    },
  ) {
    const version = await this.prisma.formVersion.findUnique({
      where: { id: input.formVersionId },
    });
    if (!version || version.status !== 'PUBLISHED') {
      throw new BadRequestException('Only published form versions can be assigned');
    }

    const assignment = await this.prisma.formAssignment.create({
      data: {
        formId: input.formId,
        formVersionId: input.formVersionId,
        organizationId: input.organizationId,
        dueAt: input.dueAt ? new Date(input.dueAt) : null,
      },
    });

    await this.audit.record({
      actorId: actor.id,
      action: 'form.assign',
      entityType: 'FormAssignment',
      entityId: assignment.id,
      outcome: 'SUCCESS',
    });

    return assignment;
  }

  async submit(
    actor: AuthUser,
    input: {
      formVersionId: string;
      organizationId: string;
      responses: Record<string, unknown>;
    },
  ) {
    if (!actor.organizationIds.includes(input.organizationId)) {
      const isAdmin = actor.permissions.includes('submissions:review');
      if (!isAdmin) {
        throw new BadRequestException('Not a member of this organization');
      }
    }

    const version = await this.prisma.formVersion.findUnique({
      where: { id: input.formVersionId },
      include: { fields: true },
    });
    if (!version || version.status !== 'PUBLISHED') {
      throw new BadRequestException('Invalid form version');
    }

    for (const field of version.fields) {
      if (field.required) {
        const value = input.responses[field.fieldKey];
        if (value === undefined || value === null || value === '') {
          throw new BadRequestException(`Field ${field.fieldKey} is required`);
        }
      }
    }

    const submission = await this.prisma.$transaction(async (tx) => {
      const created = await tx.formSubmission.create({
        data: {
          formVersionId: input.formVersionId,
          organizationId: input.organizationId,
          submittedById: actor.id,
          status: 'SUBMITTED',
          responses: input.responses as Prisma.InputJsonValue,
          submittedAt: new Date(),
        },
      });

      await this.outbox.enqueue(tx, {
        aggregateType: 'FormSubmission',
        aggregateId: created.id,
        eventType: 'profile.normalize',
        idempotencyKey: `profile.normalize:${created.id}`,
        payload: { submissionId: created.id },
      });

      return created;
    });

    // Deterministic profile normalization (also handled by worker)
    await this.normalizeProfile(submission.id);

    return submission;
  }

  async normalizeProfile(submissionId: string) {
    const submission = await this.prisma.formSubmission.findUnique({
      where: { id: submissionId },
      include: {
        organization: { include: { company: true, vendor: true } },
        formVersion: { include: { fields: true } },
      },
    });
    if (!submission) {
      return;
    }

    const responses = submission.responses as Record<string, unknown>;
    const org = submission.organization;

    if (org.company) {
      await this.prisma.company.update({
        where: { organizationId: org.id },
        data: {
          requiredCapabilities: asStringArray(
            responses.requiredCapabilities ?? responses.capabilities,
          ),
          preferredCategories: asStringArray(
            responses.preferredCategories ?? responses.categories,
          ),
          commercialPrefs: {
            tags: asStringArray(responses.commercialTags),
          } as unknown as Prisma.InputJsonValue,
          normalizedProfile: {
            sourceSubmissionId: submission.id,
            responses,
          } as unknown as Prisma.InputJsonValue,
          profileVersion: { increment: 1 },
          matchingEligible: true,
        },
      });
    }

    if (org.vendor) {
      await this.prisma.vendor.update({
        where: { organizationId: org.id },
        data: {
          capabilities: asStringArray(
            responses.capabilities ?? responses.services,
          ),
          categories: asStringArray(responses.categories),
          operatingRegions: asStringArray(
            responses.operatingRegions ?? responses.regions,
          ),
          commercialPrefs: {
            tags: asStringArray(responses.commercialTags),
          } as unknown as Prisma.InputJsonValue,
          normalizedProfile: {
            sourceSubmissionId: submission.id,
            responses,
          } as unknown as Prisma.InputJsonValue,
          profileVersion: { increment: 1 },
          onboardingComplete: true,
          matchingEligible: org.vendor.approvalStatus === 'APPROVED',
        },
      });
    }
  }

  async list() {
    return this.prisma.form.findMany({
      include: {
        versions: {
          orderBy: { version: 'desc' },
          take: 3,
          include: { fields: { orderBy: { displayOrder: 'asc' } } },
        },
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  async get(id: string) {
    const form = await this.prisma.form.findUnique({
      where: { id },
      include: {
        versions: {
          orderBy: { version: 'desc' },
          include: { fields: { orderBy: { displayOrder: 'asc' } } },
        },
        assignments: true,
      },
    });
    if (!form) {
      throw new NotFoundException('Form not found');
    }
    return form;
  }
}

function asStringArray(value: unknown): string[] {
  if (Array.isArray(value)) {
    return value.map(String);
  }
  if (typeof value === 'string' && value.trim()) {
    return value.split(',').map((s) => s.trim());
  }
  return [];
}
