import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { createHash } from 'crypto';
import { PrismaService } from '../prisma/prisma.service';
import { StorageService } from '../integrations/storage/storage.service';
import { AuditService } from '../audit/audit.service';
import { OutboxService } from '../messaging/outbox.service';
import type { AuthUser } from '../common/decorators';

const MAX_BYTES = 10 * 1024 * 1024;
const ALLOWED_MIME = new Set([
  'application/pdf',
  'image/png',
  'image/jpeg',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
]);

@Injectable()
export class DocumentsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: StorageService,
    private readonly audit: AuditService,
    private readonly outbox: OutboxService,
  ) {}

  async upload(
    actor: AuthUser,
    input: {
      organizationId: string;
      fileName: string;
      mimeType: string;
      buffer: Buffer;
    },
  ) {
    if (
      !actor.organizationIds.includes(input.organizationId) &&
      !actor.permissions.includes('orgs:manage')
    ) {
      throw new ForbiddenException('Organization access denied');
    }
    if (input.buffer.byteLength > MAX_BYTES) {
      throw new BadRequestException('File exceeds 10MB limit');
    }
    if (!ALLOWED_MIME.has(input.mimeType)) {
      throw new BadRequestException('MIME type not allowed');
    }

    const key = `orgs/${input.organizationId}/${Date.now()}-${sanitize(input.fileName)}`;
    const stored = await this.storage.putObject({
      key,
      body: input.buffer,
      mimeType: input.mimeType,
    });

    const doc = await this.prisma.$transaction(async (tx) => {
      const created = await tx.document.create({
        data: {
          organizationId: input.organizationId,
          uploadedById: actor.id,
          fileName: input.fileName,
          mimeType: input.mimeType,
          sizeBytes: stored.sizeBytes,
          storageKey: stored.key,
          checksumSha256:
            stored.checksumSha256 ??
            createHash('sha256').update(input.buffer).digest('hex'),
          scanStatus: 'PENDING',
          metadata: { provider: await this.storage.getProviderName() },
        },
      });
      await this.outbox.enqueue(tx, {
        aggregateType: 'Document',
        aggregateId: created.id,
        eventType: 'document.scan',
        idempotencyKey: `document.scan:${created.id}`,
        payload: { documentId: created.id, storageKey: created.storageKey },
      });
      return created;
    });

    await this.audit.record({
      actorId: actor.id,
      action: 'document.upload',
      entityType: 'Document',
      entityId: doc.id,
      outcome: 'SUCCESS',
    });

    return doc;
  }

  async list(actor: AuthUser, organizationId: string) {
    this.assertOrgAccess(actor, organizationId);
    return this.prisma.document.findMany({
      where: { organizationId },
      orderBy: { createdAt: 'desc' },
    });
  }

  async getDownloadUrl(actor: AuthUser, id: string) {
    const doc = await this.prisma.document.findUnique({ where: { id } });
    if (!doc) throw new NotFoundException('Document not found');
    this.assertOrgAccess(actor, doc.organizationId);

    const url = await this.storage.getSignedDownloadUrl(doc.storageKey, 900);
    await this.audit.record({
      actorId: actor.id,
      action: 'document.download_url',
      entityType: 'Document',
      entityId: doc.id,
      outcome: 'SUCCESS',
    });
    return { url, expiresInSeconds: 900, fileName: doc.fileName };
  }

  private assertOrgAccess(actor: AuthUser, organizationId: string) {
    if (
      !actor.organizationIds.includes(organizationId) &&
      !actor.permissions.includes('orgs:manage') &&
      !actor.permissions.includes('orgs:read')
    ) {
      throw new ForbiddenException('Organization access denied');
    }
  }
}

function sanitize(name: string) {
  return name.replace(/[^a-zA-Z0-9._-]/g, '_').slice(0, 180);
}
