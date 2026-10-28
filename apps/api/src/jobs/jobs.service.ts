import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { OutboxService } from '../messaging/outbox.service';
import { AuditService } from '../audit/audit.service';
import type { AuthUser } from '../common/decorators';

@Injectable()
export class JobsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly outbox: OutboxService,
    private readonly audit: AuditService,
  ) {}

  list(params: { page?: number; pageSize?: number; status?: string }) {
    const page = params.page ?? 1;
    const pageSize = Math.min(params.pageSize ?? 20, 100);
    const where = params.status
      ? { status: params.status as never }
      : undefined;
    return Promise.all([
      this.prisma.jobExecutionRecord.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      this.prisma.jobExecutionRecord.count({ where }),
      this.prisma.outboxEvent.groupBy({
        by: ['status'],
        _count: true,
      }),
    ]).then(([items, total, outbox]) => ({
      items,
      page,
      pageSize,
      total,
      outbox,
    }));
  }

  async retry(actor: AuthUser, id: string) {
    const job = await this.prisma.jobExecutionRecord.findUnique({
      where: { id },
    });
    if (!job) throw new NotFoundException('Job not found');
    if (!['FAILED', 'DEAD_LETTERED'].includes(job.status)) {
      throw new BadRequestException('Only failed jobs can be retried');
    }

    const updated = await this.prisma.$transaction(async (tx) => {
      const next = await tx.jobExecutionRecord.update({
        where: { id },
        data: {
          status: 'QUEUED',
          lastError: null,
        },
      });
      await this.outbox.enqueue(tx, {
        aggregateType: 'JobExecutionRecord',
        aggregateId: id,
        eventType: job.jobType.includes('report')
          ? 'report.generate'
          : 'notification.retry',
        idempotencyKey: `job.retry:${id}:${Date.now()}`,
        payload: job.payload as object,
      });
      return next;
    });

    await this.audit.record({
      actorId: actor.id,
      action: 'job.retry',
      entityType: 'JobExecutionRecord',
      entityId: id,
      outcome: 'SUCCESS',
    });

    return updated;
  }
}
