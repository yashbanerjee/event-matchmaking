import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
  forwardRef,
} from '@nestjs/common';
import { FieldType, Prisma } from '@prisma/client';
import {
  assertLockedFieldsUnchanged,
  formSchemaDefinition,
  normalizeFormSchemaKeys,
  renderCorrectionEmail,
  renderRejectedEmail,
  renderVerifiedEmail,
  type FormSchemaDefinition,
  type FieldType as BuilderFieldType,
} from '@em/shared';
import { ZodError } from 'zod';
import { randomUUID } from 'crypto';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { OutboxService } from '../messaging/outbox.service';
import { EnvService } from '../config/env.service';
import { EmailService } from '../integrations/email/email.service';
import { PeerRecommendationsService } from '../meetings/peer-recommendations.service';
import { generateSecureToken, hashToken } from '../common/crypto.util';
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
  private readonly logger = new Logger(FormsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly outbox: OutboxService,
    private readonly env: EnvService,
    private readonly email: EmailService,
    @Inject(forwardRef(() => PeerRecommendationsService))
    private readonly peerRecs: PeerRecommendationsService,
  ) {}

  /** Snapshot filter-dimension tags into field.options for select/radio fields. */
  private async hydrateFilterOptions(
    schema: FormSchemaDefinition,
  ): Promise<FormSchemaDefinition> {
    const dimensionIds = [
      ...new Set(
        schema.fields
          .map((field) => field.filterDimensionId)
          .filter((id): id is string => Boolean(id)),
      ),
    ];
    if (!dimensionIds.length) return schema;

    const tags = await this.prisma.filterTag.findMany({
      where: { dimensionId: { in: dimensionIds }, isActive: true },
      orderBy: [{ sortOrder: 'asc' }, { label: 'asc' }],
    });
    const byDimension = new Map<string, { value: string; label: string }[]>();
    for (const tag of tags) {
      const list = byDimension.get(tag.dimensionId) ?? [];
      list.push({ value: tag.value, label: tag.label });
      byDimension.set(tag.dimensionId, list);
    }

    return {
      ...schema,
      fields: schema.fields.map((field) => {
        if (!field.filterDimensionId) return field;
        const options = byDimension.get(field.filterDimensionId) ?? [];
        return { ...field, options };
      }),
    };
  }

  async createForm(
    actor: AuthUser,
    input: {
      code?: string;
      name: string;
      description?: string;
      targetType?: 'COMPANY' | 'VENDOR' | 'PLATFORM';
      isTemplate?: boolean;
      fields?: FormFieldInput[];
      schema?: FormSchemaDefinition;
    },
  ) {
    const schema = input.schema ?? emptySchema();
    const code =
      input.code?.trim() ||
      `${slugCode(input.name)}_${randomUUID().slice(0, 8)}`;

    const form = await this.prisma.$transaction(async (tx) => {
      const created = await tx.form.create({
        data: {
          code,
          name: input.name,
          description: input.description,
          targetType: input.targetType,
          isTemplate: input.isTemplate ?? true,
        },
      });
      const version = await tx.formVersion.create({
        data: {
          formId: created.id,
          version: 1,
          status: 'DRAFT',
          schemaJson: schema as unknown as Prisma.InputJsonValue,
        },
      });
      if (input.fields?.length) {
        await tx.formField.createMany({
          data: input.fields.map((f, index) => fieldRow(version.id, f, index)),
        });
      } else {
        await syncFieldsFromSchema(tx, version.id, schema);
      }
      return tx.form.findUnique({
        where: { id: created.id },
        include: {
          versions: {
            orderBy: { version: 'desc' },
            include: { fields: { orderBy: { displayOrder: 'asc' } } },
          },
        },
      });
    });

    await this.audit.record({
      actorId: actor.id,
      action: 'form.create',
      entityType: 'Form',
      entityId: form!.id,
      outcome: 'SUCCESS',
    });

    return withDraftSchema(form!);
  }

  async saveDraft(
    actor: AuthUser,
    formId: string,
    input: {
      name?: string;
      description?: string;
      schema: FormSchemaDefinition;
    },
  ) {
    let schema: FormSchemaDefinition;
    try {
      schema = formSchemaDefinition.parse(
        normalizeFormSchemaKeys(input.schema),
      );
    } catch (err) {
      if (err instanceof ZodError) {
        throw new BadRequestException(
          err.issues
            .map((issue) => {
              const where = issue.path.length
                ? `${issue.path.join('.')}: `
                : '';
              return `${where}${issue.message}`;
            })
            .join('; '),
        );
      }
      throw err;
    }
    const existing = await this.prisma.form.findUnique({
      where: { id: formId },
    });
    if (!existing) {
      throw new NotFoundException('Form not found');
    }

    schema = await this.hydrateFilterOptions(schema);

    const form = await this.prisma.$transaction(async (tx) => {
      await tx.form.update({
        where: { id: formId },
        data: {
          ...(input.name !== undefined ? { name: input.name } : {}),
          ...(input.description !== undefined
            ? { description: input.description }
            : {}),
        },
      });

      let draft = await tx.formVersion.findFirst({
        where: { formId, status: 'DRAFT' },
        orderBy: { version: 'desc' },
      });
      if (!draft) {
        const latest = await tx.formVersion.findFirst({
          where: { formId },
          orderBy: { version: 'desc' },
        });
        draft = await tx.formVersion.create({
          data: {
            formId,
            version: (latest?.version ?? 0) + 1,
            status: 'DRAFT',
            schemaJson: schema as unknown as Prisma.InputJsonValue,
          },
        });
      } else {
        await tx.formVersion.update({
          where: { id: draft.id },
          data: {
            schemaJson: schema as unknown as Prisma.InputJsonValue,
          },
        });
      }

      await syncFieldsFromSchema(tx, draft.id, schema);

      return tx.form.findUnique({
        where: { id: formId },
        include: {
          versions: {
            orderBy: { version: 'desc' },
            include: { fields: { orderBy: { displayOrder: 'asc' } } },
          },
        },
      });
    });

    await this.audit.record({
      actorId: actor.id,
      action: 'form.draft.save',
      entityType: 'Form',
      entityId: formId,
      outcome: 'SUCCESS',
    });

    return withDraftSchema(form!);
  }

  async updateForm(
    actor: AuthUser,
    formId: string,
    input: {
      name?: string;
      description?: string | null;
      targetType?: 'COMPANY' | 'VENDOR' | 'PLATFORM' | null;
      isTemplate?: boolean;
      fields?: FormFieldInput[];
    },
  ) {
    const existing = await this.prisma.form.findUnique({
      where: { id: formId },
      include: {
        versions: { orderBy: { version: 'desc' }, take: 1 },
      },
    });
    if (!existing) {
      throw new NotFoundException('Form not found');
    }

    const form = await this.prisma.$transaction(async (tx) => {
      await tx.form.update({
        where: { id: formId },
        data: {
          ...(input.name !== undefined ? { name: input.name } : {}),
          ...(input.description !== undefined
            ? { description: input.description }
            : {}),
          ...(input.targetType !== undefined
            ? { targetType: input.targetType }
            : {}),
          ...(input.isTemplate !== undefined
            ? { isTemplate: input.isTemplate }
            : {}),
        },
      });

      if (input.fields) {
        let draft = await tx.formVersion.findFirst({
          where: { formId, status: 'DRAFT' },
          orderBy: { version: 'desc' },
        });
        if (!draft) {
          const latest = await tx.formVersion.findFirst({
            where: { formId },
            orderBy: { version: 'desc' },
          });
          draft = await tx.formVersion.create({
            data: {
              formId,
              version: (latest?.version ?? 0) + 1,
              status: 'DRAFT',
            },
          });
        } else {
          await tx.formField.deleteMany({ where: { formVersionId: draft.id } });
        }

        if (input.fields.length) {
          await tx.formField.createMany({
            data: input.fields.map((f, index) =>
              fieldRow(draft!.id, f, index),
            ),
          });
        }
      }

      return tx.form.findUnique({
        where: { id: formId },
        include: {
          versions: {
            orderBy: { version: 'desc' },
            include: { fields: { orderBy: { displayOrder: 'asc' } } },
          },
        },
      });
    });

    await this.audit.record({
      actorId: actor.id,
      action: 'form.update',
      entityType: 'Form',
      entityId: formId,
      outcome: 'SUCCESS',
    });

    return withDraftSchema(form!);
  }

  async removeForm(actor: AuthUser, formId: string) {
    const existing = await this.prisma.form.findUnique({ where: { id: formId } });
    if (!existing) {
      throw new NotFoundException('Form not found');
    }
    await this.prisma.form.delete({ where: { id: formId } });
    await this.audit.record({
      actorId: actor.id,
      action: 'form.delete',
      entityType: 'Form',
      entityId: formId,
      outcome: 'SUCCESS',
      before: { code: existing.code, name: existing.name },
    });
    return { id: formId, deleted: true };
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

    const schema = await this.hydrateFilterOptions(
      resolveSchema(draft.schemaJson, draft.fields),
    );
    if (
      !schema.fields.some(
        (field) => field.type !== 'heading' && field.type !== 'info',
      )
    ) {
      throw new ConflictException(
        'Add at least one input field before publishing.',
      );
    }
    const keys = new Set<string>();
    for (const field of schema.fields) {
      if (keys.has(field.key)) {
        throw new ConflictException(
          `The internal key ${field.key} is used more than once.`,
        );
      }
      keys.add(field.key);
    }

    await this.prisma.$transaction(async (tx) => {
      await syncFieldsFromSchema(tx, draft.id, schema);
      await tx.formVersion.update({
        where: { id: draft.id },
        data: {
          schemaJson: schema as unknown as Prisma.InputJsonValue,
        },
      });
    });

    const published = await this.prisma.$transaction(async (tx) => {
      const next = await tx.formVersion.update({
        where: { id: draft.id },
        data: {
          status: 'PUBLISHED',
          publishedAt: new Date(),
          schemaHash: `v${draft.version}:${schema.fields.length}`,
        },
        include: { fields: true },
      });

      // Point open assignments at the newly published version so vendors/companies
      // immediately see added/removed fields (unless they already submitted).
      const assignments = await tx.formAssignment.findMany({
        where: { formId },
        select: { id: true, organizationId: true, formVersionId: true },
      });
      for (const assignment of assignments) {
        if (!assignment.organizationId) {
          await tx.formAssignment.update({
            where: { id: assignment.id },
            data: { formVersionId: next.id },
          });
          continue;
        }
        const lockedSubmission = await tx.formSubmission.findFirst({
          where: {
            organizationId: assignment.organizationId,
            formVersion: { formId },
            status: { in: ['SUBMITTED', 'UNDER_REVIEW', 'APPROVED'] },
          },
          select: { id: true },
        });
        if (lockedSubmission) continue;
        await tx.formAssignment.update({
          where: { id: assignment.id },
          data: { formVersionId: next.id },
        });
      }

      return next;
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

    const schema = resolveSchema(latest.schemaJson, latest.fields);

    return this.prisma.$transaction(async (tx) => {
      const version = await tx.formVersion.create({
        data: {
          formId,
          version: latest.version + 1,
          status: 'DRAFT',
          schemaJson: schema as unknown as Prisma.InputJsonValue,
        },
      });
      await syncFieldsFromSchema(tx, version.id, schema);
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

  /** Assignments + submission/correction state for the signed-in participant. */
  async getMyOnboarding(actor: AuthUser) {
    const orgIds = actor.organizationIds ?? [];
    if (!orgIds.length) {
      return { items: [], pendingCount: 0 };
    }

    const assignments = await this.prisma.formAssignment.findMany({
      where: { organizationId: { in: orgIds } },
      include: {
        form: { select: { id: true, name: true, code: true } },
        formVersion: { include: { form: true, fields: true } },
        organization: {
          include: { vendor: true, company: true },
        },
      },
      orderBy: { assignedAt: 'desc' },
    });

    const items: Array<{
      assignmentId: string;
      organizationId: string;
      organizationName: string;
      organizationType: string;
      formId: string;
      formVersionId: string;
      formName: string;
      schema: FormSchemaDefinition;
      workflowStatus: string;
      submission: {
        id: string;
        status: string;
        submittedAt: Date | null;
        responses: Record<string, unknown>;
      } | null;
      openCorrection: {
        id: string;
        editableFieldIds: string[];
        notes: Array<{ fieldId: string; note: string }>;
      } | null;
      canEdit: boolean;
      locked: boolean;
      action: 'submit' | 'correct' | 'view';
    }> = [];

    for (const assignment of assignments) {
      if (!assignment.organizationId || !assignment.organization) continue;

      const organization = assignment.organization;
      const organizationId = assignment.organizationId;

      const latestPublished = await this.prisma.formVersion.findFirst({
        where: { formId: assignment.formId, status: 'PUBLISHED' },
        orderBy: { version: 'desc' },
        include: { fields: true, form: true },
      });
      if (!latestPublished) continue;

      // Prefer the latest published schema for orgs that have not submitted yet.
      const submission = await this.prisma.formSubmission.findFirst({
        where: {
          organizationId,
          formVersion: { formId: assignment.formId },
        },
        orderBy: { createdAt: 'desc' },
        include: {
          formVersion: { include: { fields: true } },
          corrections: {
            where: { status: 'OPEN' },
            include: { fields: true },
            orderBy: { createdAt: 'desc' },
            take: 1,
          },
        },
      });

      const openCorrection = submission?.corrections[0] ?? null;
      const needsCorrection =
        submission?.status === 'NEEDS_INFO' && Boolean(openCorrection);
      const lockedStatuses = new Set([
        'SUBMITTED',
        'UNDER_REVIEW',
        'APPROVED',
      ]);

      // Pending vendors always get the latest published fields.
      // After submit (or during correction), keep the submission's version.
      const versionForUi = !submission
        ? latestPublished
        : submission.formVersion;
      const schema = await this.hydrateFilterOptions(
        resolveSchema(versionForUi.schemaJson, versionForUi.fields),
      );

      if (!submission && assignment.formVersionId !== latestPublished.id) {
        await this.prisma.formAssignment.update({
          where: { id: assignment.id },
          data: { formVersionId: latestPublished.id },
        });
      }

      const workflowStatus =
        organization.vendor?.approvalStatus ??
        organization.company?.approvalStatus ??
        organization.status;

      const canEdit = !submission || needsCorrection;
      const action: 'submit' | 'correct' | 'view' = !submission
        ? 'submit'
        : needsCorrection
          ? 'correct'
          : 'view';

      items.push({
        assignmentId: assignment.id,
        organizationId,
        organizationName: organization.name,
        organizationType: organization.type,
        formId: assignment.formId,
        formVersionId: versionForUi.id,
        formName: assignment.form.name,
        schema,
        workflowStatus,
        submission: submission
          ? {
              id: submission.id,
              status: submission.status,
              submittedAt: submission.submittedAt,
              responses: submission.responses as Record<string, unknown>,
            }
          : null,
        openCorrection: openCorrection
          ? {
              id: openCorrection.id,
              editableFieldIds: openCorrection.fields.map(
                (field: { fieldId: string }) => field.fieldId,
              ),
              notes: openCorrection.fields.map(
                (field: { fieldId: string; note: string }) => ({
                  fieldId: field.fieldId,
                  note: field.note,
                }),
              ),
            }
          : null,
        canEdit,
        locked: submission
          ? lockedStatuses.has(submission.status)
          : false,
        action,
      });
    }

    const pendingCount = items.filter(
      (item) => item.action === 'submit' || item.action === 'correct',
    ).length;

    return { items, pendingCount };
  }

  async resubmitMyCorrection(
    actor: AuthUser,
    correctionId: string,
    responses: Record<string, unknown>,
  ) {
    const correction = await this.prisma.submissionCorrection.findFirst({
      where: { id: correctionId, status: 'OPEN' },
      include: {
        fields: true,
        submission: {
          include: {
            formVersion: { include: { fields: true } },
          },
        },
      },
    });
    if (!correction) {
      throw new NotFoundException('Correction request not found');
    }
    if (
      !actor.organizationIds.includes(correction.submission.organizationId) &&
      !actor.permissions.includes('submissions:review')
    ) {
      throw new BadRequestException('Not allowed to update this form');
    }

    const schema = resolveSchema(
      correction.submission.formVersion.schemaJson,
      correction.submission.formVersion.fields,
    );
    const editable = new Set(correction.fields.map((f) => f.fieldId));
    const previous = correction.submission.responses as Record<string, unknown>;

    try {
      assertLockedFieldsUnchanged({
        fields: schema.fields,
        previous,
        next: responses,
        editableFieldIds: editable,
      });
    } catch {
      throw new BadRequestException(
        'Only the fields marked for resubmit can be changed',
      );
    }

    const merged = { ...previous, ...responses };
    for (const fieldId of editable) {
      const field = schema.fields.find((f) => f.id === fieldId);
      if (!field) continue;
      const value = merged[fieldId] ?? merged[field.key];
      if (
        field.required &&
        (value === undefined || value === null || value === '')
      ) {
        throw new BadRequestException(`${field.label} is required`);
      }
    }

    const updated = await this.prisma.$transaction(async (tx) => {
      const next = await tx.formSubmission.update({
        where: { id: correction.submissionId },
        data: {
          responses: merged as Prisma.InputJsonValue,
          status: 'SUBMITTED',
          submittedAt: new Date(),
          reviewNotes: null,
        },
      });
      await tx.submissionCorrection.update({
        where: { id: correction.id },
        data: { status: 'RESOLVED', resolvedAt: new Date() },
      });
      await tx.vendor.updateMany({
        where: { organizationId: correction.submission.organizationId },
        data: { approvalStatus: 'WAITING_FOR_REVIEW' },
      });
      await tx.company.updateMany({
        where: { organizationId: correction.submission.organizationId },
        data: { approvalStatus: 'WAITING_FOR_REVIEW' },
      });
      await this.outbox.enqueue(tx, {
        aggregateType: 'FormSubmission',
        aggregateId: next.id,
        eventType: 'profile.normalize',
        idempotencyKey: `profile.normalize:${next.id}:resubmit:${Date.now()}`,
        payload: { submissionId: next.id },
      });
      return next;
    });

    await this.normalizeProfile(updated.id);
    return { submissionId: updated.id, status: updated.status };
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

    const existing = await this.prisma.formSubmission.findFirst({
      where: {
        organizationId: input.organizationId,
        formVersionId: input.formVersionId,
      },
      orderBy: { createdAt: 'desc' },
      include: {
        corrections: {
          where: { status: 'OPEN' },
          take: 1,
        },
      },
    });
    if (existing) {
      if (existing.status === 'NEEDS_INFO' && existing.corrections.length) {
        throw new BadRequestException(
          'Use the correction form to update the fields requested by admin',
        );
      }
      if (['SUBMITTED', 'UNDER_REVIEW', 'APPROVED'].includes(existing.status)) {
        throw new ConflictException(
          'This form is already submitted and locked until admin requests changes',
        );
      }
    }

    const schema = resolveSchema(version.schemaJson, version.fields);
    for (const field of schema.fields) {
      if (field.type === 'heading' || field.type === 'info') continue;
      if (!field.required) continue;
      const value =
        input.responses[field.key] ?? input.responses[field.id];
      if (value === undefined || value === null || value === '') {
        throw new BadRequestException(`${field.label} is required`);
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

      await tx.vendor.updateMany({
        where: {
          organizationId: input.organizationId,
          approvalStatus: {
            in: ['INVITED', 'RESEND_FOR_IMPROVEMENTS', 'PENDING'],
          },
        },
        data: { approvalStatus: 'WAITING_FOR_REVIEW' },
      });
      await tx.company.updateMany({
        where: {
          organizationId: input.organizationId,
          approvalStatus: {
            in: ['INVITED', 'RESEND_FOR_IMPROVEMENTS', 'PENDING', 'IN_REVIEW'],
          },
        },
        data: { approvalStatus: 'WAITING_FOR_REVIEW' },
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

    await this.normalizeProfile(submission.id);

    return submission;
  }

  async listSubmissions(params: {
    organizationId?: string;
    status?:
      | 'DRAFT'
      | 'SUBMITTED'
      | 'UNDER_REVIEW'
      | 'APPROVED'
      | 'REJECTED'
      | 'NEEDS_INFO';
  }) {
    return this.prisma.formSubmission.findMany({
      where: {
        ...(params.organizationId
          ? { organizationId: params.organizationId }
          : {}),
        ...(params.status ? { status: params.status } : {}),
      },
      orderBy: { createdAt: 'desc' },
      include: {
        organization: { include: { vendor: true } },
        formVersion: { include: { form: true, fields: true } },
        corrections: {
          where: { status: 'OPEN' },
          include: { fields: true },
          take: 1,
        },
      },
    });
  }

  async getSubmission(id: string) {
    const submission = await this.prisma.formSubmission.findUnique({
      where: { id },
      include: {
        organization: { include: { vendor: true } },
        formVersion: { include: { form: true, fields: true } },
        corrections: {
          orderBy: { createdAt: 'desc' },
          include: { fields: true },
        },
      },
    });
    if (!submission) {
      throw new NotFoundException('Submission not found');
    }
    const schema = resolveSchema(
      submission.formVersion.schemaJson,
      submission.formVersion.fields,
    );
    const openCorrection =
      submission.corrections.find((c) => c.status === 'OPEN') ?? null;
    return {
      ...submission,
      schema,
      openCorrection,
    };
  }

  async startReview(actor: AuthUser, submissionId: string) {
    const submission = await this.prisma.formSubmission.findUnique({
      where: { id: submissionId },
    });
    if (!submission) {
      throw new NotFoundException('Submission not found');
    }
    if (!['SUBMITTED', 'UNDER_REVIEW', 'NEEDS_INFO'].includes(submission.status)) {
      throw new BadRequestException('Submission cannot enter review');
    }

    const updated = await this.prisma.$transaction(async (tx) => {
      const next = await tx.formSubmission.update({
        where: { id: submissionId },
        data: {
          status: 'UNDER_REVIEW',
          reviewedAt: new Date(),
        },
      });
      await tx.vendor.updateMany({
        where: { organizationId: submission.organizationId },
        data: { approvalStatus: 'IN_REVIEW' },
      });
      await tx.company.updateMany({
        where: { organizationId: submission.organizationId },
        data: { approvalStatus: 'IN_REVIEW' },
      });
      return next;
    });

    await this.audit.record({
      actorId: actor.id,
      action: 'submission.review.start',
      entityType: 'FormSubmission',
      entityId: submissionId,
      outcome: 'SUCCESS',
    });

    return updated;
  }

  private async resolveOrganizationContact(organizationId: string, submittedById?: string | null) {
    if (submittedById) {
      const submitter = await this.prisma.user.findUnique({
        where: { id: submittedById },
        select: { email: true, firstName: true, lastName: true },
      });
      if (submitter?.email) {
        return {
          email: submitter.email,
          name: [submitter.firstName, submitter.lastName]
            .filter(Boolean)
            .join(' ')
            .trim() || null,
        };
      }
    }

    const organization = await this.prisma.organization.findUnique({
      where: { id: organizationId },
      select: { customAttrs: true, type: true },
    });
    const attrs =
      organization?.customAttrs && typeof organization.customAttrs === 'object'
        ? (organization.customAttrs as Record<string, unknown>)
        : {};
    if (typeof attrs.contactEmail === 'string' && attrs.contactEmail.trim()) {
      return {
        email: attrs.contactEmail.trim(),
        name:
          typeof attrs.contactName === 'string' ? attrs.contactName.trim() : null,
      };
    }

    const member = await this.prisma.organizationMember.findFirst({
      where: { organizationId },
      include: {
        user: { select: { email: true, firstName: true, lastName: true } },
      },
      orderBy: [{ isPrimary: 'desc' }, { joinedAt: 'asc' }],
    });
    if (member?.user.email) {
      return {
        email: member.user.email,
        name: [member.user.firstName, member.user.lastName]
          .filter(Boolean)
          .join(' ')
          .trim() || null,
      };
    }

    const invitation = await this.prisma.invitation.findFirst({
      where: {
        organizationId,
        status: { in: ['ACCEPTED', 'SENT', 'DELIVERED', 'PENDING'] },
      },
      orderBy: { createdAt: 'desc' },
      select: { email: true },
    });
    if (invitation?.email) {
      return { email: invitation.email, name: null };
    }

    return null;
  }

  private dashboardUrlForOrgType(type: string) {
    if (type === 'COMPANY') return `${this.env.appUrl}/portal`;
    if (type === 'VENDOR') return `${this.env.appUrl}/vendor`;
    return this.env.appUrl;
  }

  async approveSubmission(actor: AuthUser, submissionId: string) {
    const submission = await this.prisma.formSubmission.findUnique({
      where: { id: submissionId },
      include: {
        organization: true,
        formVersion: { include: { form: true } },
      },
    });
    if (!submission) {
      throw new NotFoundException('Submission not found');
    }

    const updated = await this.prisma.$transaction(async (tx) => {
      const next = await tx.formSubmission.update({
        where: { id: submissionId },
        data: {
          status: 'APPROVED',
          reviewedAt: new Date(),
        },
      });
      await tx.vendor.updateMany({
        where: { organizationId: submission.organizationId },
        data: {
          approvalStatus: 'VERIFIED',
          verificationStatus: 'VERIFIED',
          onboardingComplete: true,
          matchingEligible: true,
        },
      });
      await tx.company.updateMany({
        where: { organizationId: submission.organizationId },
        data: {
          approvalStatus: 'VERIFIED',
          verificationStatus: 'VERIFIED',
          matchingEligible: true,
        },
      });
      await tx.organization.update({
        where: { id: submission.organizationId },
        data: { status: 'APPROVED' },
      });
      await tx.submissionCorrection.updateMany({
        where: { submissionId, status: 'OPEN' },
        data: { status: 'RESOLVED', resolvedAt: new Date() },
      });
      return next;
    });

    const contact = await this.resolveOrganizationContact(
      submission.organizationId,
      submission.submittedById,
    );
    let emailSent = false;
    if (contact?.email) {
      try {
        const fromName = await this.email.getFromName();
        const audience =
          submission.organization.type === 'COMPANY' ? 'company' : 'vendor';
        const template = renderVerifiedEmail({
          brandName: fromName,
          organizationName: submission.organization.name,
          formName: submission.formVersion.form.name,
          audience,
          recipientName: contact.name,
          dashboardUrl: this.dashboardUrlForOrgType(submission.organization.type),
        });
        await this.email.send({
          to: contact.email,
          subject: template.subject,
          text: template.text,
          html: template.html,
          idempotencyKey: `submission.verified.email:${submissionId}`,
          templateCode: 'approved',
        });
        emailSent = true;
      } catch (err) {
        this.logger.warn(
          `Verified email failed for ${contact.email}: ${(err as Error).message}`,
        );
      }
    } else {
      this.logger.warn(
        `No contact email for verified submission ${submissionId}`,
      );
    }

    await this.audit.record({
      actorId: actor.id,
      action: 'submission.approve',
      entityType: 'FormSubmission',
      entityId: submissionId,
      outcome: 'SUCCESS',
      after: { emailSent, email: contact?.email ?? null },
    });

    this.peerRecs.scheduleRecompute(
      submission.organizationId,
      'submission.approve',
    );

    return { ...updated, emailSent, email: contact?.email ?? null };
  }

  async rejectSubmission(
    actor: AuthUser,
    submissionId: string,
    input: { reason?: string } = {},
  ) {
    const reason = input.reason?.trim() || null;
    const submission = await this.prisma.formSubmission.findUnique({
      where: { id: submissionId },
      include: {
        organization: true,
        formVersion: { include: { form: true } },
      },
    });
    if (!submission) {
      throw new NotFoundException('Submission not found');
    }
    if (submission.status === 'APPROVED') {
      throw new BadRequestException('Verified submissions cannot be rejected');
    }

    const updated = await this.prisma.$transaction(async (tx) => {
      const next = await tx.formSubmission.update({
        where: { id: submissionId },
        data: {
          status: 'REJECTED',
          reviewedAt: new Date(),
          reviewNotes: reason,
        },
      });
      await tx.vendor.updateMany({
        where: { organizationId: submission.organizationId },
        data: {
          approvalStatus: 'REJECTED',
          matchingEligible: false,
        },
      });
      await tx.company.updateMany({
        where: { organizationId: submission.organizationId },
        data: {
          approvalStatus: 'REJECTED',
          matchingEligible: false,
        },
      });
      await tx.organization.update({
        where: { id: submission.organizationId },
        data: { status: 'REJECTED' },
      });
      await tx.submissionCorrection.updateMany({
        where: { submissionId, status: 'OPEN' },
        data: { status: 'SUPERSEDED', resolvedAt: new Date() },
      });
      return next;
    });

    const contact = await this.resolveOrganizationContact(
      submission.organizationId,
      submission.submittedById,
    );
    let emailSent = false;
    if (contact?.email) {
      try {
        const fromName = await this.email.getFromName();
        const audience =
          submission.organization.type === 'COMPANY' ? 'company' : 'vendor';
        const template = renderRejectedEmail({
          brandName: fromName,
          organizationName: submission.organization.name,
          formName: submission.formVersion.form.name,
          audience,
          recipientName: contact.name,
          reason,
          dashboardUrl: this.dashboardUrlForOrgType(submission.organization.type),
        });
        await this.email.send({
          to: contact.email,
          subject: template.subject,
          text: template.text,
          html: template.html,
          idempotencyKey: `submission.rejected.email:${submissionId}`,
          templateCode: 'rejected',
        });
        emailSent = true;
      } catch (err) {
        this.logger.warn(
          `Rejected email failed for ${contact.email}: ${(err as Error).message}`,
        );
      }
    } else {
      this.logger.warn(
        `No contact email for rejected submission ${submissionId}`,
      );
    }

    await this.audit.record({
      actorId: actor.id,
      action: 'submission.reject',
      entityType: 'FormSubmission',
      entityId: submissionId,
      outcome: 'SUCCESS',
      after: { reason, emailSent, email: contact?.email ?? null },
    });

    return { ...updated, emailSent, email: contact?.email ?? null };
  }

  async requestCorrection(
    actor: AuthUser,
    submissionId: string,
    input: { fields: Array<{ fieldId: string; note: string }> },
  ) {
    if (!input.fields?.length) {
      throw new BadRequestException('Select at least one field to resubmit');
    }
    for (const field of input.fields) {
      if (!field.fieldId || !field.note?.trim()) {
        throw new BadRequestException(
          'Each marked field needs a comment for the recipient',
        );
      }
    }

    const submission = await this.prisma.formSubmission.findUnique({
      where: { id: submissionId },
      include: {
        organization: true,
        formVersion: { include: { form: true, fields: true } },
      },
    });
    if (!submission) {
      throw new NotFoundException('Submission not found');
    }
    if (!['SUBMITTED', 'UNDER_REVIEW', 'NEEDS_INFO'].includes(submission.status)) {
      throw new BadRequestException(
        'Only submissions waiting for or in review can request improvements',
      );
    }

    const schema = resolveSchema(
      submission.formVersion.schemaJson,
      submission.formVersion.fields,
    );
    const known = new Set(
      schema.fields
        .filter((f) => f.type !== 'heading' && f.type !== 'info')
        .map((f) => f.id),
    );
    for (const field of input.fields) {
      if (!known.has(field.fieldId)) {
        throw new BadRequestException(
          'A selected field is not part of this form version',
        );
      }
    }

    const contact = await this.resolveOrganizationContact(
      submission.organizationId,
      submission.submittedById,
    );
    if (!contact?.email) {
      throw new BadRequestException(
        'No contact email found to send the correction link',
      );
    }

    const token = generateSecureToken(32);
    const tokenHash = hashToken(token);
    const fieldRows = input.fields.map((field) => {
      const match = schema.fields.find((item) => item.id === field.fieldId);
      return {
        fieldId: field.fieldId,
        label: match?.label ?? field.fieldId,
        note: field.note.trim(),
      };
    });
    const labels = fieldRows
      .map(
        (field, index) =>
          `${index + 1}. ${field.label}\nComment: ${field.note}`,
      )
      .join('\n\n');
    const correctionUrl = `${this.env.appUrl}/portal/corrections/${token}`;
    const audience =
      submission.organization.type === 'COMPANY' ? 'company' : 'vendor';

    const correction = await this.prisma.$transaction(async (tx) => {
      await tx.submissionCorrection.updateMany({
        where: { submissionId, status: 'OPEN' },
        data: { status: 'SUPERSEDED', resolvedAt: new Date() },
      });

      const created = await tx.submissionCorrection.create({
        data: {
          submissionId,
          requestedById: actor.id,
          accessTokenHash: tokenHash,
          fields: {
            create: fieldRows.map((field) => ({
              fieldId: field.fieldId,
              note: field.note,
            })),
          },
        },
        include: { fields: true },
      });

      await tx.formSubmission.update({
        where: { id: submissionId },
        data: {
          status: 'NEEDS_INFO',
          reviewNotes: labels,
          reviewedAt: new Date(),
        },
      });

      await tx.vendor.updateMany({
        where: { organizationId: submission.organizationId },
        data: { approvalStatus: 'RESEND_FOR_IMPROVEMENTS' },
      });
      await tx.company.updateMany({
        where: { organizationId: submission.organizationId },
        data: { approvalStatus: 'RESEND_FOR_IMPROVEMENTS' },
      });

      await this.outbox.enqueue(tx, {
        aggregateType: 'SubmissionCorrection',
        aggregateId: created.id,
        eventType: 'invitation.send',
        idempotencyKey: `correction.send:${created.id}`,
        payload: {
          correctionId: created.id,
          submissionId,
          email: contact.email,
          recipientName: contact.name,
          organizationName: submission.organization.name,
          organizationType: submission.organization.type,
          formName: submission.formVersion.form.name,
          correctionUrl,
          fieldSummary: labels,
          fields: fieldRows.map(({ label, note }) => ({ label, note })),
          fieldCount: fieldRows.length,
          purpose: 'CORRECTION',
        },
      });

      return created;
    });

    let emailSent = false;
    let emailError: string | null = null;
    try {
      const fromName = await this.email.getFromName();
      const template = renderCorrectionEmail({
        brandName: fromName,
        organizationName: submission.organization.name,
        formName: submission.formVersion.form.name,
        correctionUrl,
        fields: fieldRows.map(({ label, note }) => ({ label, note })),
        audience,
        recipientName: contact.name,
      });
      await this.email.send({
        to: contact.email,
        subject: template.subject,
        text: template.text,
        html: template.html,
        idempotencyKey: `correction.email:${correction.id}`,
        templateCode: 'correction',
      });
      emailSent = true;
    } catch (err) {
      emailError = (err as Error).message;
      this.logger.warn(
        `Correction email failed for ${contact.email}: ${emailError}`,
      );
    }

    await this.audit.record({
      actorId: actor.id,
      action: 'submission.correction.request',
      entityType: 'FormSubmission',
      entityId: submissionId,
      outcome: emailSent ? 'SUCCESS' : 'PARTIAL',
      after: {
        fieldCount: input.fields.length,
        emailSent,
        email: contact.email,
        emailError,
      },
    });

    if (!emailSent) {
      throw new BadRequestException(
        `Improvement request saved, but email to ${contact.email} failed${emailError ? `: ${emailError}` : ''}. Share this link manually: ${correctionUrl}`,
      );
    }

    return {
      correction,
      correctionUrl,
      emailQueued: true,
      emailSent,
      email: contact.email,
    };
  }

  async getCorrectionByToken(token: string) {
    const tokenHash = hashToken(token);
    const correction = await this.prisma.submissionCorrection.findFirst({
      where: { accessTokenHash: tokenHash, status: 'OPEN' },
      include: {
        fields: true,
        submission: {
          include: {
            organization: true,
            formVersion: { include: { form: true, fields: true } },
          },
        },
      },
    });
    if (!correction) {
      throw new NotFoundException('Correction link is invalid or expired');
    }

    const schema = resolveSchema(
      correction.submission.formVersion.schemaJson,
      correction.submission.formVersion.fields,
    );
    const editableFieldIds = correction.fields.map((f) => f.fieldId);
    const notes = correction.fields.map((f) => ({
      fieldId: f.fieldId,
      note: f.note,
    }));

    return {
      correctionId: correction.id,
      submissionId: correction.submissionId,
      organizationName: correction.submission.organization.name,
      formName: correction.submission.formVersion.form.name,
      schema,
      responses: correction.submission.responses as Record<string, unknown>,
      editableFieldIds,
      notes,
    };
  }

  async resubmitCorrection(
    token: string,
    responses: Record<string, unknown>,
  ) {
    const tokenHash = hashToken(token);
    const correction = await this.prisma.submissionCorrection.findFirst({
      where: { accessTokenHash: tokenHash, status: 'OPEN' },
      include: {
        fields: true,
        submission: {
          include: {
            formVersion: { include: { fields: true } },
          },
        },
      },
    });
    if (!correction) {
      throw new NotFoundException('Correction link is invalid or expired');
    }

    const schema = resolveSchema(
      correction.submission.formVersion.schemaJson,
      correction.submission.formVersion.fields,
    );
    const editable = new Set(correction.fields.map((f) => f.fieldId));
    const previous = correction.submission.responses as Record<string, unknown>;

    try {
      assertLockedFieldsUnchanged({
        fields: schema.fields,
        previous,
        next: responses,
        editableFieldIds: editable,
      });
    } catch {
      throw new BadRequestException(
        'Only the fields marked for resubmit can be changed',
      );
    }

    const merged = { ...previous, ...responses };
    for (const fieldId of editable) {
      const field = schema.fields.find((f) => f.id === fieldId);
      if (!field) continue;
      const value = merged[fieldId];
      if (
        field.required &&
        (value === undefined || value === null || value === '')
      ) {
        throw new BadRequestException(`${field.label} is required`);
      }
    }

    const updated = await this.prisma.$transaction(async (tx) => {
      const next = await tx.formSubmission.update({
        where: { id: correction.submissionId },
        data: {
          responses: merged as Prisma.InputJsonValue,
          status: 'SUBMITTED',
          submittedAt: new Date(),
          reviewNotes: null,
        },
      });
      await tx.submissionCorrection.update({
        where: { id: correction.id },
        data: { status: 'RESOLVED', resolvedAt: new Date() },
      });
      await tx.vendor.updateMany({
        where: { organizationId: correction.submission.organizationId },
        data: { approvalStatus: 'WAITING_FOR_REVIEW' },
      });
      await tx.company.updateMany({
        where: { organizationId: correction.submission.organizationId },
        data: { approvalStatus: 'WAITING_FOR_REVIEW' },
      });
      await this.outbox.enqueue(tx, {
        aggregateType: 'FormSubmission',
        aggregateId: next.id,
        eventType: 'profile.normalize',
        idempotencyKey: `profile.normalize:${next.id}:resubmit:${Date.now()}`,
        payload: { submissionId: next.id },
      });
      return next;
    });

    await this.normalizeProfile(updated.id);
    return { submissionId: updated.id, status: updated.status };
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

    const industry = firstString(responses.industry);
    const region = firstString(
      responses.region ?? responses.regions ?? responses.area,
    );

    if (industry || region) {
      await this.prisma.organization.update({
        where: { id: org.id },
        data: {
          ...(industry ? { industry } : {}),
          ...(region ? { region } : {}),
        },
      });
    }

    const about = firstString(
      responses.organization_summary ?? responses.about,
    );
    const focusEvents = firstString(
      responses.focus_events ?? responses.focusEvents,
    );
    const regionTags = asStringArray(
      responses.regions ?? responses.operatingRegions ?? responses.area,
    );

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
            about,
            focusEvents,
            regions: regionTags,
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
            responses.capabilities ??
              responses.requiredCapabilities ??
              responses.services,
          ),
          categories: asStringArray(
            responses.categories ?? responses.preferredCategories,
          ),
          operatingRegions: asStringArray(
            responses.operatingRegions ?? responses.regions ?? responses.area,
          ),
          commercialPrefs: {
            tags: asStringArray(responses.commercialTags),
          } as unknown as Prisma.InputJsonValue,
          normalizedProfile: {
            sourceSubmissionId: submission.id,
            about,
            focusEvents,
            responses,
          } as unknown as Prisma.InputJsonValue,
          profileVersion: { increment: 1 },
          onboardingComplete: true,
          matchingEligible:
            org.vendor.approvalStatus === 'VERIFIED' ||
            org.vendor.approvalStatus === 'APPROVED',
        },
      });
    }

    const refreshed = await this.prisma.organization.findUnique({
      where: { id: org.id },
      include: { company: true, vendor: true },
    });
    const ready =
      (refreshed?.company?.matchingEligible &&
        refreshed.company.approvalStatus === 'VERIFIED') ||
      (refreshed?.vendor?.matchingEligible &&
        refreshed.vendor.approvalStatus === 'VERIFIED');
    if (ready) {
      this.peerRecs.scheduleRecompute(org.id, 'profile.normalize');
    }
  }

  async list() {
    const rows = await this.prisma.form.findMany({
      include: {
        versions: {
          orderBy: { version: 'desc' },
          take: 3,
          include: { fields: { orderBy: { displayOrder: 'asc' } } },
        },
      },
      orderBy: { createdAt: 'desc' },
    });
    return rows.map((row) => withDraftSchema(row));
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
    return withDraftSchema(form);
  }
}

function emptySchema(): FormSchemaDefinition {
  return {
    sections: [
      { id: randomUUID(), title: 'General', description: '', order: 0 },
    ],
    fields: [],
  };
}

function slugCode(name: string) {
  const base = name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 40);
  return base || 'form';
}

function fieldRow(formVersionId: string, f: FormFieldInput, index: number) {
  return {
    formVersionId,
    fieldKey: f.fieldKey,
    label: f.label,
    description: f.description,
    fieldType: f.fieldType,
    required: f.required ?? false,
    defaultValue: (f.defaultValue as Prisma.InputJsonValue) ?? undefined,
    validationRules: (f.validationRules as Prisma.InputJsonValue) ?? {},
    displayOrder: f.displayOrder ?? index,
    conditionalLogic: (f.conditionalLogic as Prisma.InputJsonValue) ?? {},
    options: (f.options as Prisma.InputJsonValue) ?? [],
    fileRestrictions: (f.fileRestrictions as Prisma.InputJsonValue) ?? {},
    sensitivity: f.sensitivity ?? ('INTERNAL' as const),
  };
}

function mapBuilderType(type: BuilderFieldType): FieldType {
  const map: Record<BuilderFieldType, FieldType> = {
    text: 'SHORT_TEXT',
    textarea: 'LONG_TEXT',
    email: 'EMAIL',
    tel: 'PHONE',
    number: 'NUMBER',
    currency: 'CURRENCY',
    date: 'DATE',
    time: 'TIME',
    datetime: 'DATE',
    select: 'SINGLE_SELECT',
    multiselect: 'MULTI_SELECT',
    radio: 'RADIO',
    checkbox: 'CHECKBOX',
    toggle: 'BOOLEAN',
    file: 'FILE',
    files: 'MULTI_FILE',
    reupload: 'FILE',
    image: 'IMAGE',
    url: 'WEBSITE',
    address: 'SHORT_TEXT',
    country: 'COUNTRY_REGION',
    heading: 'READ_ONLY',
    info: 'READ_ONLY',
    repeater: 'REPEATABLE_GROUP',
  };
  return map[type] ?? 'SHORT_TEXT';
}

async function syncFieldsFromSchema(
  tx: Prisma.TransactionClient,
  formVersionId: string,
  schema: FormSchemaDefinition,
) {
  await tx.formField.deleteMany({ where: { formVersionId } });
  const rows = schema.fields
    .filter((f) => f.type !== 'heading' && f.type !== 'info')
    .map((f, index) => ({
      formVersionId,
      fieldKey: f.key,
      label: f.label,
      description: f.description ?? null,
      fieldType: mapBuilderType(f.type),
      required: f.required,
      defaultValue:
        f.defaultValue !== undefined
          ? (f.defaultValue as Prisma.InputJsonValue)
          : undefined,
      validationRules: (f.validation ?? {}) as Prisma.InputJsonValue,
      displayOrder: f.order ?? index,
      conditionalLogic: (f.conditional ?? {}) as Prisma.InputJsonValue,
      options: (f.options ?? []) as Prisma.InputJsonValue,
      fileRestrictions: (f.file ?? {}) as Prisma.InputJsonValue,
      sensitivity: f.sensitive ? ('CONFIDENTIAL' as const) : ('PUBLIC' as const),
    }));
  if (rows.length) {
    await tx.formField.createMany({ data: rows });
  }
}

function resolveSchema(
  schemaJson: unknown,
  fields: Array<{
    fieldKey: string;
    label: string;
    description: string | null;
    fieldType: FieldType;
    required: boolean;
    displayOrder: number;
    options: unknown;
  }>,
): FormSchemaDefinition {
  const parsed = formSchemaDefinition.safeParse(schemaJson);
  if (parsed.success) return parsed.data;

  const sectionId = randomUUID();
  const reverse: Partial<Record<FieldType, BuilderFieldType>> = {
    SHORT_TEXT: 'text',
    LONG_TEXT: 'textarea',
    EMAIL: 'email',
    PHONE: 'tel',
    NUMBER: 'number',
    CURRENCY: 'currency',
    DATE: 'date',
    TIME: 'time',
    SINGLE_SELECT: 'select',
    MULTI_SELECT: 'multiselect',
    RADIO: 'radio',
    CHECKBOX: 'checkbox',
    BOOLEAN: 'toggle',
    FILE: 'file',
    MULTI_FILE: 'files',
    IMAGE: 'image',
    WEBSITE: 'url',
    COUNTRY_REGION: 'country',
    READ_ONLY: 'info',
    REPEATABLE_GROUP: 'repeater',
    TAGS: 'multiselect',
  };

  return {
    sections: [
      { id: sectionId, title: 'General', description: '', order: 0 },
    ],
    fields: fields.map((f, index) => {
      const options = Array.isArray(f.options)
        ? f.options.map((opt, i) =>
            typeof opt === 'string'
              ? { value: opt, label: opt }
              : opt && typeof opt === 'object' && 'value' in (opt as object)
                ? (opt as { value: string; label: string })
                : { value: `option_${i + 1}`, label: String(opt) },
          )
        : [];
      return {
        id: randomUUID(),
        key: f.fieldKey,
        type: reverse[f.fieldType] ?? 'text',
        label: f.label,
        description: f.description ?? '',
        required: f.required,
        placeholder: '',
        options,
        validation: {},
        sectionId,
        order: f.displayOrder ?? index,
        conditional: null,
        children: [],
      };
    }),
  };
}

function withDraftSchema<
  T extends {
    versions: Array<{
      status: string;
      schemaJson?: unknown;
      fields: Array<{
        fieldKey: string;
        label: string;
        description: string | null;
        fieldType: FieldType;
        required: boolean;
        displayOrder: number;
        options: unknown;
      }>;
    }>;
  },
>(form: T) {
  const draft =
    form.versions.find((v) => v.status === 'DRAFT') ?? form.versions[0];
  const draftSchema = draft
    ? resolveSchema(draft.schemaJson, draft.fields)
    : emptySchema();
  return { ...form, draftSchema };
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

function firstString(value: unknown): string | null {
  if (typeof value === 'string' && value.trim()) return value.trim();
  if (Array.isArray(value)) {
    const first = value.find((item) => String(item ?? '').trim());
    return first != null ? String(first).trim() : null;
  }
  return null;
}
