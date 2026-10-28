import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { FieldType, Prisma } from '@prisma/client';
import {
  formSchemaDefinition,
  type FormSchemaDefinition,
  type FieldType as BuilderFieldType,
} from '@em/shared';
import { randomUUID } from 'crypto';
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
    const schema = formSchemaDefinition.parse(input.schema);
    const existing = await this.prisma.form.findUnique({
      where: { id: formId },
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

    const schema = resolveSchema(draft.schemaJson, draft.fields);
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

    const published = await this.prisma.formVersion.update({
      where: { id: draft.id },
      data: {
        status: 'PUBLISHED',
        publishedAt: new Date(),
        schemaHash: `v${draft.version}:${schema.fields.length}`,
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
      sensitivity: 'INTERNAL' as const,
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
