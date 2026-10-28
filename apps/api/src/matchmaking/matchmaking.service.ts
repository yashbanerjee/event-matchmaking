import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  calculateMatchScore,
  evaluateEligibility,
  buildDailySlots,
  scheduleGreedy,
  type ProfileFeatures,
} from '@em/domain';
import {
  defaultMatchingWeights,
  matchingWeightsSchema,
  scheduleConfigSchema,
  type MatchingWeights,
} from '@em/shared';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { OutboxService } from '../messaging/outbox.service';
import { EffectiveConfigService } from '../settings/effective-config.service';
import type { AuthUser } from '../common/decorators';
import { generateSecureToken } from '../common/crypto.util';

function isOrgActive(status: string): boolean {
  return status === 'ACTIVE' || status === 'APPROVED';
}

function isVendorVerified(approvalStatus: string): boolean {
  return approvalStatus === 'VERIFIED' || approvalStatus === 'APPROVED';
}

@Injectable()
export class MatchmakingService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly outbox: OutboxService,
    private readonly config: EffectiveConfigService,
  ) {}

  async ensureDefaultRule() {
    const existing = await this.prisma.matchingRule.findUnique({
      where: { code: 'DEFAULT' },
    });
    if (existing) {
      return existing;
    }
    return this.prisma.matchingRule.create({
      data: {
        code: 'DEFAULT',
        name: 'Default weighted matching',
        versions: {
          create: {
            version: 1,
            weights: defaultMatchingWeights,
            minScore: 40,
            publishedAt: new Date(),
          },
        },
      },
    });
  }

  async updateWeights(actor: AuthUser, weights: MatchingWeights) {
    const parsed = matchingWeightsSchema.parse(weights);
    const rule = await this.ensureDefaultRule();
    const latest = await this.prisma.matchingRuleVersion.findFirst({
      where: { ruleId: rule.id },
      orderBy: { version: 'desc' },
    });
    const version = (latest?.version ?? 0) + 1;
    const created = await this.prisma.matchingRuleVersion.create({
      data: {
        ruleId: rule.id,
        version,
        weights: parsed,
        minScore: latest?.minScore ?? 40,
        publishedAt: new Date(),
      },
    });
    await this.audit.record({
      actorId: actor.id,
      action: 'matching.weights.update',
      entityType: 'MatchingRuleVersion',
      entityId: created.id,
      outcome: 'SUCCESS',
      after: parsed,
    });
    return created;
  }

  async startRun(
    actor: AuthUser,
    rawConfig: unknown,
  ) {
    const incoming =
      rawConfig && typeof rawConfig === 'object'
        ? { ...(rawConfig as Record<string, unknown>) }
        : {};
    if (
      incoming.meetingDurationMinutes === undefined ||
      incoming.meetingDurationMinutes === null ||
      incoming.meetingDurationMinutes === ''
    ) {
      incoming.meetingDurationMinutes = await this.config.getNumber(
        'ops.meetingDurationMinutes',
        15,
      );
    }
    const config = scheduleConfigSchema.parse(incoming);
    const rule = await this.ensureDefaultRule();
    const ruleVersion = await this.prisma.matchingRuleVersion.findFirst({
      where: { ruleId: rule.id },
      orderBy: { version: 'desc' },
    });
    if (!ruleVersion) {
      throw new BadRequestException('No matching rule version published');
    }

    const idempotencyKey = `matchmaking:${config.scheduleDate}:${generateSecureToken(8)}`;

    const run = await this.prisma.$transaction(async (tx) => {
      const created = await tx.matchmakingRun.create({
        data: {
          matchingRuleId: rule.id,
          matchingRuleVersion: ruleVersion.version,
          scheduleDate: new Date(config.scheduleDate),
          timeZone: config.timeZone,
          status: 'QUEUED',
          config: config as unknown as Prisma.InputJsonValue,
          idempotencyKey,
          createdById: actor.id,
        },
      });

      await this.outbox.enqueue(tx, {
        aggregateType: 'MatchmakingRun',
        aggregateId: created.id,
        eventType: 'matchmaking.run',
        idempotencyKey: `matchmaking.run:${created.id}`,
        payload: { runId: created.id },
      });

      return created;
    });

    // Process synchronously for reliability in Phase 1–3; worker also consumes the same event.
    await this.processRun(run.id);

    await this.audit.record({
      actorId: actor.id,
      action: 'matchmaking.run.start',
      entityType: 'MatchmakingRun',
      entityId: run.id,
      outcome: 'SUCCESS',
    });

    return this.getRun(run.id);
  }

  async processRun(runId: string) {
    const run = await this.prisma.matchmakingRun.findUnique({
      where: { id: runId },
    });
    if (!run) {
      throw new NotFoundException('Run not found');
    }

    await this.prisma.matchmakingRun.update({
      where: { id: runId },
      data: { status: 'PROCESSING', startedAt: new Date() },
    });

    try {
      const ruleVersion = await this.prisma.matchingRuleVersion.findFirst({
        where: {
          ruleId: run.matchingRuleId,
          version: run.matchingRuleVersion,
        },
      });
      const weights = matchingWeightsSchema.parse(
        ruleVersion?.weights ?? defaultMatchingWeights,
      );
      const minScore = ruleVersion?.minScore ?? 40;
      const config = scheduleConfigSchema.parse(run.config);

      const companies = await this.prisma.company.findMany({
        include: { organization: true },
      });
      const vendors = await this.prisma.vendor.findMany({
        include: { organization: true },
      });

      const candidates: Array<{
        runId: string;
        companyOrgId: string;
        vendorOrgId: string;
        totalScore: number;
        scoreBreakdown: Prisma.InputJsonValue;
        explanation: string;
        eligible: boolean;
        ineligibilityReasons: string[];
        companyProfileVersion: number;
        vendorProfileVersion: number;
      }> = [];
      for (const company of companies) {
        for (const vendor of vendors) {
          const eligibility = evaluateEligibility({
            companyActive: isOrgActive(company.organization.status),
            vendorActive: isOrgActive(vendor.organization.status),
            companyOnboardingComplete: true,
            vendorOnboardingComplete: vendor.onboardingComplete,
            vendorApproved: isVendorVerified(vendor.approvalStatus),
            companyMatchingEligible: company.matchingEligible,
            vendorMatchingEligible: vendor.matchingEligible,
            mandatoryCapabilities: company.requiredCapabilities,
            vendorCapabilities: vendor.capabilities,
            explicitlyExcluded: false,
            sharedSlotAvailable: true,
            companyCapacityExhausted: false,
            vendorCapacityExhausted: false,
            duplicatePairingProhibited: false,
            policyViolation: false,
          });

          const companyFeatures = this.toCompanyFeatures(company);
          const vendorFeatures = this.toVendorFeatures(vendor);
          const score = calculateMatchScore(
            companyFeatures,
            vendorFeatures,
            weights,
          );

          candidates.push({
            runId,
            companyOrgId: company.organizationId,
            vendorOrgId: vendor.organizationId,
            totalScore: score.totalScore,
            scoreBreakdown: score.breakdown as unknown as Prisma.InputJsonValue,
            explanation: score.explanation,
            eligible:
              eligibility.eligible && score.totalScore >= minScore,
            ineligibilityReasons: [
              ...eligibility.reasons,
              ...(score.totalScore < minScore ? ['BELOW_MIN_SCORE'] : []),
            ],
            companyProfileVersion: company.profileVersion,
            vendorProfileVersion: vendor.profileVersion,
          });
        }
      }

      await this.prisma.matchCandidate.createMany({ data: candidates });

      const eligible = candidates
        .filter((c) => c.eligible)
        .map((c) => ({
          companyOrgId: c.companyOrgId,
          vendorOrgId: c.vendorOrgId,
          score: c.totalScore,
        }));

      const [startH, startM] = config.startTime.split(':').map(Number) as [
        number,
        number,
      ];
      const [endH, endM] = config.endTime.split(':').map(Number) as [
        number,
        number,
      ];
      const dayMinutes = endH * 60 + endM - (startH * 60 + startM);
      const cycleMinutes = Math.max(
        1,
        config.meetingDurationMinutes + config.bufferMinutes,
      );
      const derivedSlotCount = Math.max(
        1,
        Math.min(24, Math.floor(dayMinutes / cycleMinutes)),
      );
      const slotCount = Math.max(config.slotCount, derivedSlotCount);

      const slots = buildDailySlots({
        date: config.scheduleDate,
        startTime: config.startTime,
        meetingDurationMinutes: config.meetingDurationMinutes,
        bufferMinutes: config.bufferMinutes,
        slotCount,
      });

      const dayStart = slots[0]?.startsAt;
      const dayEnd = slots[slots.length - 1]?.endsAt;
      const existingOccupancy =
        dayStart && dayEnd
          ? await this.prisma.meetingOccupancy.findMany({
              where: {
                startsAt: { lt: dayEnd },
                endsAt: { gt: dayStart },
              },
            })
          : [];

      const scheduled = scheduleGreedy(
        eligible,
        slots,
        {
          maxMeetingsPerParticipant: config.maxMeetingsPerParticipant,
        },
        existingOccupancy.map((row) => ({
          participantId: row.participantKey.replace(/^org:/, ''),
          startsAt: row.startsAt,
          endsAt: row.endsAt,
        })),
      );

      await this.prisma.$transaction(async (tx) => {
        const schedule = await tx.scheduleVersion.create({
          data: {
            runId,
            version: 1,
            status: 'PREVIEW_READY',
            config: config as unknown as Prisma.InputJsonValue,
          },
        });

        for (const slot of slots) {
          await tx.meetingSlot.create({
            data: {
              scheduleVersionId: schedule.id,
              slotIndex: slot.slotIndex,
              startsAt: slot.startsAt,
              endsAt: slot.endsAt,
              timeZone: config.timeZone,
              isBreak: slot.isBreak,
            },
          });
        }

        const persistedSlots = await tx.meetingSlot.findMany({
          where: { scheduleVersionId: schedule.id },
        });

        for (const assignment of scheduled.assignments) {
          const match = await tx.match.create({
            data: {
              runId,
              companyOrgId: assignment.companyOrgId,
              vendorOrgId: assignment.vendorOrgId,
              totalScore: assignment.score,
              scoreBreakdown:
                candidates.find(
                  (c) =>
                    c.companyOrgId === assignment.companyOrgId &&
                    c.vendorOrgId === assignment.vendorOrgId,
                )?.scoreBreakdown ?? {},
              explanation:
                candidates.find(
                  (c) =>
                    c.companyOrgId === assignment.companyOrgId &&
                    c.vendorOrgId === assignment.vendorOrgId,
                )?.explanation ?? '',
            },
          });

          const slot = persistedSlots.find(
            (s) => s.slotIndex === assignment.slotIndex,
          );
          if (!slot) continue;

          const meeting = await tx.meeting.create({
            data: {
              scheduleVersionId: schedule.id,
              slotId: slot.id,
              matchId: match.id,
              companyOrgId: assignment.companyOrgId,
              vendorOrgId: assignment.vendorOrgId,
              startsAt: assignment.startsAt,
              endsAt: assignment.endsAt,
              timeZone: config.timeZone,
              durationMinutes: config.meetingDurationMinutes,
              mode: config.mode,
              matchScore: assignment.score,
              status: 'PROPOSED',
              idempotencyKey: `meeting:${schedule.id}:${assignment.companyOrgId}:${assignment.vendorOrgId}`,
            },
          });

          await tx.meetingOccupancy.createMany({
            data: [
              {
                meetingId: meeting.id,
                participantKey: `org:${assignment.companyOrgId}`,
                startsAt: assignment.startsAt,
                endsAt: assignment.endsAt,
              },
              {
                meetingId: meeting.id,
                participantKey: `org:${assignment.vendorOrgId}`,
                startsAt: assignment.startsAt,
                endsAt: assignment.endsAt,
              },
            ],
          });
        }

        await tx.matchmakingRun.update({
          where: { id: runId },
          data: {
            status: 'PREVIEW_READY',
            completedAt: new Date(),
          },
        });
      });
    } catch (err) {
      await this.prisma.matchmakingRun.update({
        where: { id: runId },
        data: {
          status: 'FAILED',
          errorMessage: (err as Error).message,
          completedAt: new Date(),
        },
      });
      throw err;
    }
  }

  async getRun(id: string) {
    const run = await this.prisma.matchmakingRun.findUnique({
      where: { id },
      include: {
        scheduleVersions: {
          include: {
            slots: true,
            meetings: {
              include: {
                companyOrg: true,
                vendorOrg: true,
                match: true,
              },
            },
          },
        },
        candidates: {
          orderBy: { totalScore: 'desc' },
          take: 100,
        },
      },
    });
    if (!run) {
      throw new NotFoundException('Run not found');
    }
    return run;
  }

  async publishSchedule(actor: AuthUser, scheduleVersionId: string) {
    const schedule = await this.prisma.scheduleVersion.findUnique({
      where: { id: scheduleVersionId },
      include: { meetings: true, run: true },
    });
    if (!schedule) {
      throw new NotFoundException('Schedule not found');
    }
    if (schedule.status === 'PUBLISHED') {
      throw new BadRequestException('Schedule already published');
    }

    await this.prisma.$transaction(async (tx) => {
      await tx.scheduleVersion.update({
        where: { id: scheduleVersionId },
        data: {
          status: 'PUBLISHED',
          publishedAt: new Date(),
          publishedById: actor.id,
        },
      });
      await tx.meeting.updateMany({
        where: { scheduleVersionId },
        data: { status: 'AWAITING_CONFIRMATION' },
      });
      await tx.matchmakingRun.update({
        where: { id: schedule.runId },
        data: { status: 'PUBLISHED' },
      });

      await this.outbox.enqueue(tx, {
        aggregateType: 'ScheduleVersion',
        aggregateId: scheduleVersionId,
        eventType: 'notification.schedule_published',
        idempotencyKey: `schedule.publish:${scheduleVersionId}`,
        payload: {
          scheduleVersionId,
          meetingIds: schedule.meetings.map((m) => m.id),
        },
      });
    });

    await this.audit.record({
      actorId: actor.id,
      action: 'schedule.publish',
      entityType: 'ScheduleVersion',
      entityId: scheduleVersionId,
      outcome: 'SUCCESS',
    });

    return this.prisma.scheduleVersion.findUnique({
      where: { id: scheduleVersionId },
      include: { meetings: true },
    });
  }

  async manualAssign(
    actor: AuthUser,
    input: {
      scheduleVersionId: string;
      companyOrgId: string;
      vendorOrgId: string;
      slotIndex: number;
      reason: string;
    },
  ) {
    if (!input.reason?.trim()) {
      throw new BadRequestException('Override reason is required');
    }

    const schedule = await this.prisma.scheduleVersion.findUnique({
      where: { id: input.scheduleVersionId },
      include: { slots: true, run: true },
    });
    if (!schedule) {
      throw new NotFoundException('Schedule not found');
    }
    const slot = schedule.slots.find((s) => s.slotIndex === input.slotIndex);
    if (!slot || slot.isBreak) {
      throw new BadRequestException('Invalid slot');
    }

    const conflict = await this.prisma.meetingOccupancy.findFirst({
      where: {
        participantKey: {
          in: [`org:${input.companyOrgId}`, `org:${input.vendorOrgId}`],
        },
        startsAt: { lt: slot.endsAt },
        endsAt: { gt: slot.startsAt },
      },
    });
    if (conflict) {
      throw new BadRequestException('Scheduling conflict detected');
    }

    const meeting = await this.prisma.$transaction(async (tx) => {
      const match = await tx.match.create({
        data: {
          runId: schedule.runId,
          companyOrgId: input.companyOrgId,
          vendorOrgId: input.vendorOrgId,
          totalScore: 0,
          scoreBreakdown: {},
          explanation: `Manual assignment: ${input.reason}`,
          isManual: true,
          overrideReason: input.reason,
        },
      });

      const created = await tx.meeting.create({
        data: {
          scheduleVersionId: schedule.id,
          slotId: slot.id,
          matchId: match.id,
          companyOrgId: input.companyOrgId,
          vendorOrgId: input.vendorOrgId,
          startsAt: slot.startsAt,
          endsAt: slot.endsAt,
          timeZone: schedule.run.timeZone,
          durationMinutes: Math.round(
            (slot.endsAt.getTime() - slot.startsAt.getTime()) / 60_000,
          ),
          status:
            schedule.status === 'PUBLISHED'
              ? 'AWAITING_CONFIRMATION'
              : 'PROPOSED',
          idempotencyKey: `manual:${schedule.id}:${input.companyOrgId}:${input.vendorOrgId}:${input.slotIndex}:${Date.now()}`,
        },
      });

      await tx.meetingOccupancy.createMany({
        data: [
          {
            meetingId: created.id,
            participantKey: `org:${input.companyOrgId}`,
            startsAt: slot.startsAt,
            endsAt: slot.endsAt,
          },
          {
            meetingId: created.id,
            participantKey: `org:${input.vendorOrgId}`,
            startsAt: slot.startsAt,
            endsAt: slot.endsAt,
          },
        ],
      });

      return created;
    });

    await this.audit.record({
      actorId: actor.id,
      action: 'schedule.manual_assign',
      entityType: 'Meeting',
      entityId: meeting.id,
      outcome: 'SUCCESS',
      metadata: { reason: input.reason },
    });

    return meeting;
  }

  async updateMeeting(
    actor: AuthUser,
    meetingId: string,
    input: {
      companyOrgId?: string;
      vendorOrgId?: string;
      startsAt?: string;
      reason?: string;
    },
  ) {
    const meeting = await this.prisma.meeting.findUnique({
      where: { id: meetingId },
      include: {
        scheduleVersion: true,
        match: true,
      },
    });
    if (!meeting) {
      throw new NotFoundException('Meeting not found');
    }
    if (['CANCELLED', 'COMPLETED', 'NO_SHOW'].includes(meeting.status)) {
      throw new BadRequestException(
        `Cannot edit a meeting in status ${meeting.status}`,
      );
    }

    const companyOrgId = input.companyOrgId ?? meeting.companyOrgId;
    const vendorOrgId = input.vendorOrgId ?? meeting.vendorOrgId;
    if (companyOrgId === vendorOrgId) {
      throw new BadRequestException('Company and vendor must be different');
    }

    const [company, vendor] = await Promise.all([
      this.prisma.organization.findUnique({ where: { id: companyOrgId } }),
      this.prisma.organization.findUnique({ where: { id: vendorOrgId } }),
    ]);
    if (!company || company.type !== 'COMPANY') {
      throw new BadRequestException('Invalid company');
    }
    if (!vendor || vendor.type !== 'VENDOR') {
      throw new BadRequestException('Invalid vendor');
    }

    const startsAt = input.startsAt
      ? new Date(input.startsAt)
      : meeting.startsAt;
    if (Number.isNaN(startsAt.getTime())) {
      throw new BadRequestException('Invalid start time');
    }
    const endsAt = new Date(
      startsAt.getTime() + meeting.durationMinutes * 60_000,
    );

    const conflict = await this.prisma.meetingOccupancy.findFirst({
      where: {
        meetingId: { not: meeting.id },
        participantKey: {
          in: [`org:${companyOrgId}`, `org:${vendorOrgId}`],
        },
        startsAt: { lt: endsAt },
        endsAt: { gt: startsAt },
      },
    });
    if (conflict) {
      throw new BadRequestException(
        'Scheduling conflict: company or vendor is already booked in that window',
      );
    }

    const reason =
      input.reason?.trim() ||
      'Admin updated meeting company, vendor, or time';
    const timeChanged =
      startsAt.getTime() !== meeting.startsAt.getTime() ||
      endsAt.getTime() !== meeting.endsAt.getTime();
    const partiesChanged =
      companyOrgId !== meeting.companyOrgId ||
      vendorOrgId !== meeting.vendorOrgId;

    const updated = await this.prisma.$transaction(async (tx) => {
      if (meeting.matchId && partiesChanged) {
        await tx.match.update({
          where: { id: meeting.matchId },
          data: {
            companyOrgId,
            vendorOrgId,
            isManual: true,
            overrideReason: reason,
            explanation: `Admin update: ${reason}`,
          },
        });
      }

      if (timeChanged) {
        await tx.meetingReschedule.create({
          data: {
            meetingId: meeting.id,
            previousStartsAt: meeting.startsAt,
            previousEndsAt: meeting.endsAt,
            newStartsAt: startsAt,
            newEndsAt: endsAt,
            reason,
            actorId: actor.id,
          },
        });
      }

      const next = await tx.meeting.update({
        where: { id: meeting.id },
        data: {
          companyOrgId,
          vendorOrgId,
          startsAt,
          endsAt,
          slotId: timeChanged ? null : meeting.slotId,
          version: { increment: 1 },
          ...(timeChanged && meeting.status === 'CONFIRMED'
            ? { status: 'RESCHEDULED' }
            : {}),
        },
        include: {
          companyOrg: true,
          vendorOrg: true,
          match: true,
        },
      });

      await tx.meetingOccupancy.deleteMany({ where: { meetingId: meeting.id } });
      await tx.meetingOccupancy.createMany({
        data: [
          {
            meetingId: meeting.id,
            participantKey: `org:${companyOrgId}`,
            startsAt,
            endsAt,
          },
          {
            meetingId: meeting.id,
            participantKey: `org:${vendorOrgId}`,
            startsAt,
            endsAt,
          },
        ],
      });

      await tx.meetingStatusHistory.create({
        data: {
          meetingId: meeting.id,
          fromStatus: meeting.status,
          toStatus: next.status,
          reason,
          actorId: actor.id,
        },
      });

      return next;
    });

    await this.audit.record({
      actorId: actor.id,
      action: 'meeting.admin_update',
      entityType: 'Meeting',
      entityId: meeting.id,
      outcome: 'SUCCESS',
      metadata: {
        reason,
        companyOrgId,
        vendorOrgId,
        startsAt: startsAt.toISOString(),
      },
    });

    return updated;
  }

  private toCompanyFeatures(company: {
    organizationId: string;
    organization: { industry: string | null; region: string | null };
    requiredCapabilities: string[];
    preferredCategories: string[];
    commercialPrefs: unknown;
    normalizedProfile: unknown;
  }): ProfileFeatures {
    const prefs = (company.commercialPrefs ?? {}) as Record<string, unknown>;
    const normalized = (company.normalizedProfile ?? {}) as Record<
      string,
      unknown
    >;
    return {
      organizationId: company.organizationId,
      industry: company.organization.industry,
      capabilities: [],
      categories: [],
      regions: company.organization.region
        ? [company.organization.region]
        : ((normalized.regions as string[]) ?? []),
      requirements: company.requiredCapabilities,
      preferredCategories: company.preferredCategories,
      commercialTags: (prefs.tags as string[]) ?? [],
      mutualPreferenceTags: [],
    };
  }

  private toVendorFeatures(vendor: {
    organizationId: string;
    organization: { industry: string | null };
    capabilities: string[];
    categories: string[];
    operatingRegions: string[];
    commercialPrefs: unknown;
  }): ProfileFeatures {
    const prefs = (vendor.commercialPrefs ?? {}) as Record<string, unknown>;
    return {
      organizationId: vendor.organizationId,
      industry: vendor.organization.industry,
      capabilities: vendor.capabilities,
      categories: vendor.categories,
      regions: vendor.operatingRegions,
      requirements: [],
      preferredCategories: [],
      commercialTags: (prefs.tags as string[]) ?? [],
      mutualPreferenceTags: vendor.categories,
    };
  }
}
