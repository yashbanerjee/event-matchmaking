import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { OutboxService } from '../messaging/outbox.service';
import { AuditService } from '../audit/audit.service';
import type { AuthUser } from '../common/decorators';
import { generateSecureToken } from '../common/crypto.util';

export type ReportMetricKey =
  | 'participation'
  | 'onboarding'
  | 'matching'
  | 'meetings'
  | 'feedback'
  | 'conversion';

@Injectable()
export class ReportsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly outbox: OutboxService,
    private readonly audit: AuditService,
  ) {}

  /**
   * Metric definitions:
   * - companyParticipation / vendorParticipation: distinct orgs with ≥1 published meeting
   * - onboardingCompletion: vendors with onboardingComplete / total vendors
   * - matchGeneration: match count; matchAcceptance: confirmed meetings / scheduled
   * - meetingCompletion / attendance / cancellations / noShows from meeting statuses
   * - feedbackCompletion: meetings with ≥1 feedback / completed meetings
   * - matchToMeeting: meetings with matchId / matches
   * - meetingToFollowUp: follow-ups / completed meetings
   */
  async summary() {
    const generatedAt = new Date().toISOString();
    const [
      companyParticipation,
      vendorParticipation,
      totalVendors,
      onboardedVendors,
      matches,
      scheduled,
      confirmed,
      completed,
      cancelled,
      noShows,
      feedbackCount,
      followUps,
      avgQuality,
      unmatchedCompanies,
      unmatchedVendors,
      manualOverrides,
    ] = await Promise.all([
      this.prisma.meeting.findMany({
        where: { status: { not: 'CANCELLED' } },
        distinct: ['companyOrgId'],
        select: { companyOrgId: true },
      }),
      this.prisma.meeting.findMany({
        where: { status: { not: 'CANCELLED' } },
        distinct: ['vendorOrgId'],
        select: { vendorOrgId: true },
      }),
      this.prisma.vendor.count(),
      this.prisma.vendor.count({ where: { onboardingComplete: true } }),
      this.prisma.match.count(),
      this.prisma.meeting.count({ where: { status: { not: 'CANCELLED' } } }),
      this.prisma.meeting.count({ where: { status: 'CONFIRMED' } }),
      this.prisma.meeting.count({ where: { status: 'COMPLETED' } }),
      this.prisma.meeting.count({ where: { status: 'CANCELLED' } }),
      this.prisma.meeting.count({ where: { status: 'NO_SHOW' } }),
      this.prisma.meetingFeedback.count(),
      this.prisma.followUpAction.count(),
      this.prisma.meetingFeedback.aggregate({
        _avg: { meetingQuality: true },
      }),
      this.prisma.company.count({
        where: {
          matchingEligible: true,
          organization: { meetingsAsCompany: { none: {} } },
        },
      }),
      this.prisma.vendor.count({
        where: {
          matchingEligible: true,
          organization: { meetingsAsVendor: { none: {} } },
        },
      }),
      this.prisma.match.count({ where: { isManual: true } }),
    ]);

    return {
      generatedAt,
      companyParticipation: companyParticipation.length,
      vendorParticipation: vendorParticipation.length,
      onboardingCompletionRate:
        totalVendors === 0 ? 0 : onboardedVendors / totalVendors,
      matchGeneration: matches,
      matchAcceptanceRate: scheduled === 0 ? 0 : confirmed / scheduled,
      meetingsScheduled: scheduled,
      meetingsCompleted: completed,
      cancellations: cancelled,
      noShows,
      feedbackCompletionRate: completed === 0 ? 0 : feedbackCount / (completed * 2),
      averageMeetingRating: avgQuality._avg.meetingQuality ?? 0,
      followUpActions: followUps,
      matchToMeetingConversion: matches === 0 ? 0 : scheduled / matches,
      meetingToFollowUpConversion: completed === 0 ? 0 : followUps / completed,
      unmatchedParticipants: unmatchedCompanies + unmatchedVendors,
      manualOverrideFrequency: manualOverrides,
    };
  }

  async exportCsv(actor: AuthUser, kind: 'meetings' | 'feedback' | 'summary') {
    if (kind === 'summary') {
      const summary = await this.summary();
      const rows = Object.entries(summary).map(([k, v]) => [k, String(v)]);
      return {
        fileName: `summary-${Date.now()}.csv`,
        contentType: 'text/csv',
        body: toCsv(['metric', 'value'], rows),
        generatedAt: summary.generatedAt,
      };
    }

    if (kind === 'feedback') {
      const items = await this.prisma.meetingFeedback.findMany({
        include: {
          organization: { select: { name: true, code: true } },
          meeting: {
            select: {
              id: true,
              startsAt: true,
              companyOrg: { select: { name: true } },
              vendorOrg: { select: { name: true } },
            },
          },
        },
        orderBy: { createdAt: 'desc' },
        take: 5000,
      });
      const rows = items.map((f) => [
        f.id,
        f.meetingId,
        f.organization.code,
        f.outcome,
        String(f.meetingQuality ?? ''),
        String(f.followUpRequired),
        f.isConfidential ? 'yes' : 'no',
        f.createdAt.toISOString(),
      ]);
      await this.audit.record({
        actorId: actor.id,
        action: 'report.export',
        entityType: 'Feedback',
        outcome: 'SUCCESS',
        metadata: { kind, rows: rows.length },
      });
      return {
        fileName: `feedback-${Date.now()}.csv`,
        contentType: 'text/csv',
        body: toCsv(
          [
            'id',
            'meetingId',
            'orgCode',
            'outcome',
            'quality',
            'followUpRequired',
            'confidential',
            'createdAt',
          ],
          rows,
        ),
        generatedAt: new Date().toISOString(),
      };
    }

    const meetings = await this.prisma.meeting.findMany({
      include: {
        companyOrg: { select: { name: true, code: true } },
        vendorOrg: { select: { name: true, code: true } },
      },
      orderBy: { startsAt: 'asc' },
      take: 5000,
    });
    const rows = meetings.map((m) => [
      m.id,
      m.companyOrg.code,
      m.vendorOrg.code,
      m.status,
      String(m.matchScore ?? ''),
      m.startsAt.toISOString(),
      m.endsAt.toISOString(),
    ]);
    await this.audit.record({
      actorId: actor.id,
      action: 'report.export',
      entityType: 'Meeting',
      outcome: 'SUCCESS',
      metadata: { kind, rows: rows.length },
    });
    return {
      fileName: `meetings-${Date.now()}.csv`,
      contentType: 'text/csv',
      body: toCsv(
        [
          'id',
          'company',
          'vendor',
          'status',
          'score',
          'startsAt',
          'endsAt',
        ],
        rows,
      ),
      generatedAt: new Date().toISOString(),
    };
  }

  async enqueueAsyncReport(actor: AuthUser, kind: string) {
    const idempotencyKey = `report:${kind}:${generateSecureToken(8)}`;
    const job = await this.prisma.$transaction(async (tx) => {
      const record = await tx.jobExecutionRecord.create({
        data: {
          jobType: 'report.generate',
          queueName: 'em.reports',
          idempotencyKey,
          status: 'QUEUED',
          payload: { kind, requestedBy: actor.id },
        },
      });
      await this.outbox.enqueue(tx, {
        aggregateType: 'JobExecutionRecord',
        aggregateId: record.id,
        eventType: 'report.generate',
        idempotencyKey,
        payload: { jobId: record.id, kind },
      });
      return record;
    });
    return job;
  }
}

function toCsv(headers: string[], rows: string[][]) {
  const escape = (value: string) =>
    /[",\n]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value;
  return [headers, ...rows].map((r) => r.map(escape).join(',')).join('\n');
}
