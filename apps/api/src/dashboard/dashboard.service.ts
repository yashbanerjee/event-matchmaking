import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

const DEFAULT_DAILY_CAPACITY = 8;
const EVENT_TZ = 'Asia/Dubai';

type MeetingRow = {
  id: string;
  status: string;
  startsAt: Date;
  endsAt: Date;
  companyOrgId: string;
  vendorOrgId: string;
  place: { name: string } | null;
  venue: string | null;
  companyOrg: { id: string; name: string };
  vendorOrg: { id: string; name: string };
  feedbacks: Array<{
    meetingQuality: number | null;
    relevance: number | null;
    businessPotential: number | null;
    communicationQuality: number | null;
    interestLevel: number | null;
    outcome: string;
    followUpRequired: boolean;
  }>;
};

function dubaiDayBounds(now = new Date()) {
  const day = new Intl.DateTimeFormat('en-CA', {
    timeZone: EVENT_TZ,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(now);
  const start = new Date(`${day}T00:00:00+04:00`);
  const end = new Date(`${day}T24:00:00+04:00`);
  return { start, end, day };
}

function overlaps(
  startsAt: Date,
  endsAt: Date,
  windowStart: Date,
  windowEnd: Date,
) {
  return startsAt < windowEnd && endsAt > windowStart;
}

function isClosed(status: string) {
  return ['COMPLETED', 'CANCELLED', 'NO_SHOW'].includes(status);
}

function isActiveBooked(status: string) {
  return !['CANCELLED'].includes(status);
}

function avg(values: number[]) {
  if (!values.length) return 0;
  return values.reduce((sum, n) => sum + n, 0) / values.length;
}

function snapshot(
  meetings: MeetingRow[],
  windowStart?: Date,
  windowEnd?: Date,
) {
  const rows =
    windowStart && windowEnd
      ? meetings.filter((m) =>
          overlaps(m.startsAt, m.endsAt, windowStart, windowEnd),
        )
      : meetings;
  const planned = rows.filter((m) => isActiveBooked(m.status)).length;
  const inProgress = rows.filter((m) => m.status === 'IN_PROGRESS').length;
  const completed = rows.filter((m) => m.status === 'COMPLETED').length;
  const missed = rows.filter((m) => m.status === 'NO_SHOW').length;
  const cancelled = rows.filter((m) => m.status === 'CANCELLED').length;
  const confirmed = rows.filter((m) =>
    ['CONFIRMED', 'IN_PROGRESS', 'COMPLETED'].includes(m.status),
  ).length;
  const remaining = rows.filter((m) =>
    [
      'PROPOSED',
      'PUBLISHED',
      'AWAITING_CONFIRMATION',
      'CONFIRMED',
      'RESCHEDULED',
      'RESCHEDULE_REQUESTED',
    ].includes(m.status),
  ).length;
  const closed = completed + missed + cancelled;
  const withFeedback = rows.filter((m) => m.feedbacks.length > 0).length;
  const feedbackEligible = rows.filter((m) =>
    ['COMPLETED', 'IN_PROGRESS'].includes(m.status),
  ).length;

  return {
    planned,
    inProgress,
    completed,
    missed,
    cancelled,
    remaining,
    confirmed,
    successRate: closed ? completed / closed : 0,
    confirmationRate: planned ? confirmed / planned : 0,
    noShowRate: planned ? missed / planned : 0,
    feedbackCoverage: feedbackEligible
      ? withFeedback / feedbackEligible
      : 0,
  };
}

/**
 * Metric definitions (server-side):
 * - totalCompanies: organizations where type=COMPANY and status != ARCHIVED
 * - totalVendors: organizations where type=VENDOR and status != ARCHIVED
 * - activeUsers: users with status=ACTIVE
 * - pendingInvitations: invitations in PENDING|SENT|DELIVERED
 * - eligibleParticipants: companies+vendors with matchingEligible=true
 * - generatedMatches / scheduledMeetings / etc. from respective tables
 * - pulse: live event snapshot (today in Asia/Dubai + whole event)
 */
@Injectable()
export class DashboardService {
  constructor(private readonly prisma: PrismaService) {}

  async overview() {
    const { start: todayStart, end: todayEnd, day } = dubaiDayBounds();

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
      meetings,
      investors,
      innovators,
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
      this.prisma.meeting.findMany({
        include: {
          companyOrg: { select: { id: true, name: true } },
          vendorOrg: { select: { id: true, name: true } },
          place: { select: { name: true } },
          feedbacks: {
            select: {
              meetingQuality: true,
              relevance: true,
              businessPotential: true,
              communicationQuality: true,
              interestLevel: true,
              outcome: true,
              followUpRequired: true,
            },
          },
        },
      }),
      this.prisma.organization.findMany({
        where: { type: 'COMPANY', status: { not: 'ARCHIVED' } },
        select: { id: true, name: true },
        orderBy: { name: 'asc' },
      }),
      this.prisma.organization.findMany({
        where: { type: 'VENDOR', status: { not: 'ARCHIVED' } },
        select: {
          id: true,
          name: true,
          vendor: { select: { capacityPerDay: true } },
        },
        orderBy: { name: 'asc' },
      }),
    ]);

    const meetingDenom = scheduledMeetings || 1;
    const todayPulse = snapshot(meetings, todayStart, todayEnd);
    const eventPulse = snapshot(meetings);

    const statusCounts = new Map<string, number>();
    for (const meeting of meetings) {
      statusCounts.set(
        meeting.status,
        (statusCounts.get(meeting.status) ?? 0) + 1,
      );
    }
    const statusBreakdown = [...statusCounts.entries()]
      .map(([status, count]) => ({ status, count }))
      .sort((a, b) => b.count - a.count);

    const ratingValues = {
      meetingQuality: [] as number[],
      relevance: [] as number[],
      businessPotential: [] as number[],
      communicationQuality: [] as number[],
      interestLevel: [] as number[],
    };
    const outcomeCounts = new Map<string, number>();
    let followUpSignals = 0;
    for (const meeting of meetings) {
      for (const fb of meeting.feedbacks) {
        if (fb.meetingQuality != null)
          ratingValues.meetingQuality.push(fb.meetingQuality);
        if (fb.relevance != null) ratingValues.relevance.push(fb.relevance);
        if (fb.businessPotential != null)
          ratingValues.businessPotential.push(fb.businessPotential);
        if (fb.communicationQuality != null)
          ratingValues.communicationQuality.push(fb.communicationQuality);
        if (fb.interestLevel != null)
          ratingValues.interestLevel.push(fb.interestLevel);
        outcomeCounts.set(
          fb.outcome,
          (outcomeCounts.get(fb.outcome) ?? 0) + 1,
        );
        if (fb.followUpRequired) followUpSignals += 1;
      }
    }
    const dimensionAverages = {
      meetingQuality: avg(ratingValues.meetingQuality),
      relevance: avg(ratingValues.relevance),
      businessPotential: avg(ratingValues.businessPotential),
      communicationQuality: avg(ratingValues.communicationQuality),
      interestLevel: avg(ratingValues.interestLevel),
    };
    const ratingSample = Object.values(ratingValues).reduce(
      (sum, list) => sum + list.length,
      0,
    );
    const overallRating = avg(Object.values(dimensionAverages).filter(Boolean));

    const hourlyToday = Array.from({ length: 13 }, (_, i) => {
      const hour = i + 8;
      const slotStart = new Date(todayStart.getTime() + hour * 60 * 60_000);
      const slotEnd = new Date(slotStart.getTime() + 60 * 60_000);
      const booked = meetings.filter(
        (m) =>
          isActiveBooked(m.status) &&
          overlaps(m.startsAt, m.endsAt, slotStart, slotEnd),
      ).length;
      return { hour, booked };
    });

    const investorActivity = investors.map((org) => {
      const all = meetings.filter(
        (m) => m.companyOrgId === org.id && isActiveBooked(m.status),
      );
      const today = all.filter((m) =>
        overlaps(m.startsAt, m.endsAt, todayStart, todayEnd),
      );
      const inMeeting = today.some((m) => m.status === 'IN_PROGRESS');
      const capacity = DEFAULT_DAILY_CAPACITY;
      return {
        id: org.id,
        name: org.name,
        bookedToday: today.length,
        bookedTotal: all.length,
        completed: all.filter((m) => m.status === 'COMPLETED').length,
        capacity,
        fillRate: capacity ? today.length / capacity : 0,
        available: !inMeeting && today.length < capacity,
        inMeeting,
      };
    });

    const innovatorActivity = innovators.map((org) => {
      const all = meetings.filter(
        (m) => m.vendorOrgId === org.id && isActiveBooked(m.status),
      );
      const today = all.filter((m) =>
        overlaps(m.startsAt, m.endsAt, todayStart, todayEnd),
      );
      const inMeeting = today.some((m) => m.status === 'IN_PROGRESS');
      const capacity = org.vendor?.capacityPerDay ?? DEFAULT_DAILY_CAPACITY;
      return {
        id: org.id,
        name: org.name,
        bookedToday: today.length,
        bookedTotal: all.length,
        completed: all.filter((m) => m.status === 'COMPLETED').length,
        capacity,
        fillRate: capacity ? today.length / capacity : 0,
        available: !inMeeting && today.length < capacity,
        inMeeting,
      };
    });

    const sortByFill = <T extends { bookedToday: number; bookedTotal: number }>(
      rows: T[],
    ) =>
      [...rows].sort(
        (a, b) =>
          b.bookedToday - a.bookedToday || b.bookedTotal - a.bookedTotal,
      );

    const liveMeetings = meetings
      .filter((m) => m.status === 'IN_PROGRESS')
      .sort((a, b) => a.startsAt.getTime() - b.startsAt.getTime())
      .map((m) => ({
        id: m.id,
        investor: m.companyOrg.name,
        innovator: m.vendorOrg.name,
        startsAt: m.startsAt,
        endsAt: m.endsAt,
        place: m.place?.name ?? m.venue,
        status: m.status,
      }));

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
      timezone: EVENT_TZ,
      today: day,
      pulse: {
        today: todayPulse,
        event: eventPulse,
      },
      statusBreakdown,
      hourlyToday,
      ratings: {
        overall: overallRating,
        sampleSize: ratingSample,
        followUpSignals,
        ...dimensionAverages,
      },
      outcomes: [...outcomeCounts.entries()]
        .map(([outcome, count]) => ({ outcome, count }))
        .sort((a, b) => b.count - a.count),
      investorActivity: sortByFill(investorActivity),
      innovatorActivity: sortByFill(innovatorActivity),
      liveMeetings,
      idleInvestors: investorActivity.filter((row) => row.bookedTotal === 0)
        .length,
      idleInnovators: innovatorActivity.filter((row) => row.bookedTotal === 0)
        .length,
      investorsInMeeting: investorActivity.filter((row) => row.inMeeting)
        .length,
      innovatorsInMeeting: innovatorActivity.filter((row) => row.inMeeting)
        .length,
      investorsAvailable: investorActivity.filter((row) => row.available)
        .length,
      innovatorsAvailable: innovatorActivity.filter((row) => row.available)
        .length,
      closedMeetings: meetings.filter((m) => isClosed(m.status)).length,
    };
  }
}
