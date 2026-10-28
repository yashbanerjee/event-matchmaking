import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

/**
 * Metric definitions (server-side):
 * - totalCompanies: organizations where type=COMPANY and status != ARCHIVED
 * - totalVendors: organizations where type=VENDOR and status != ARCHIVED
 * - activeUsers: users with status=ACTIVE
 * - pendingInvitations: invitations in PENDING|SENT|DELIVERED
 * - eligibleParticipants: companies+vendors with matchingEligible=true
 * - generatedMatches / scheduledMeetings / etc. from respective tables
 */
@Injectable()
export class DashboardService {
  constructor(private readonly prisma: PrismaService) {}

  async overview() {
    const [
      totalCompanies,
      totalVendors,
      activeUsers,
      pendingInvitations,
      eligibleCompanies,
      eligibleVendors,
      generatedMatches,
      scheduledMeetings,
      confirmedMeetings,
      completedMeetings,
      cancelledMeetings,
      noShowMeetings,
      pendingFeedbackMeetings,
      followUpsOpen,
      avgMatch,
      jobFailures,
    ] = await Promise.all([
      this.prisma.organization.count({
        where: { type: 'COMPANY', status: { not: 'ARCHIVED' } },
      }),
      this.prisma.organization.count({
        where: { type: 'VENDOR', status: { not: 'ARCHIVED' } },
      }),
      this.prisma.user.count({ where: { status: 'ACTIVE' } }),
      this.prisma.invitation.count({
        where: { status: { in: ['PENDING', 'SENT', 'DELIVERED'] } },
      }),
      this.prisma.company.count({ where: { matchingEligible: true } }),
      this.prisma.vendor.count({ where: { matchingEligible: true } }),
      this.prisma.match.count(),
      this.prisma.meeting.count({
        where: { status: { notIn: ['CANCELLED'] } },
      }),
      this.prisma.meeting.count({ where: { status: 'CONFIRMED' } }),
      this.prisma.meeting.count({ where: { status: 'COMPLETED' } }),
      this.prisma.meeting.count({ where: { status: 'CANCELLED' } }),
      this.prisma.meeting.count({ where: { status: 'NO_SHOW' } }),
      this.prisma.meeting.count({
        where: {
          status: 'COMPLETED',
          feedbacks: { none: {} },
        },
      }),
      this.prisma.followUpAction.count({ where: { completedAt: null } }),
      this.prisma.match.aggregate({ _avg: { totalScore: true } }),
      this.prisma.jobExecutionRecord.count({
        where: { status: { in: ['FAILED', 'DEAD_LETTERED'] } },
      }),
    ]);

    const meetingDenom = scheduledMeetings || 1;

    return {
      totalCompanies,
      totalVendors,
      activeUsers,
      pendingInvitations,
      eligibleParticipants: eligibleCompanies + eligibleVendors,
      generatedMatches,
      scheduledMeetings,
      confirmedMeetings,
      completedMeetings,
      cancellationRate: cancelledMeetings / meetingDenom,
      noShowRate: noShowMeetings / meetingDenom,
      pendingFeedback: pendingFeedbackMeetings,
      followUpsRequired: followUpsOpen,
      averageMatchScore: avgMatch._avg.totalScore ?? 0,
      backgroundJobFailures: jobFailures,
    };
  }
}
