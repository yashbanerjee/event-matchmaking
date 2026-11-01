import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import {
  calculateMatchScore,
  evaluateEligibility,
} from '@em/domain';
import {
  defaultMatchingWeights,
  matchingWeightsSchema,
  meetsTagCategoryThresholds,
  resolveMatchingWeights,
  resolveTagCategoryThresholds,
  renderMeetingEmail,
  scheduleConfigSchema,
  type MatchingWeights,
} from '@em/shared';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { OutboxService } from '../messaging/outbox.service';
import { EffectiveConfigService } from '../settings/effective-config.service';
import { EmailService } from '../integrations/email/email.service';
import { EnvService } from '../config/env.service';
import { FiltersService } from '../filters/filters.service';
import { AiService } from '../integrations/ai/ai.service';
import { buildMatchmakingPairCards } from '../integrations/ai/profile-narrative';
import { companyToProfileFeatures, vendorToProfileFeatures } from '@em/domain';
import { PlacesService } from '../places/places.service';
import type { AuthUser } from '../common/decorators';
import { generateSecureToken } from '../common/crypto.util';

function isOrgActive(status: string): boolean {
  return status === 'ACTIVE' || status === 'APPROVED';
}

function isVendorVerified(approvalStatus: string): boolean {
  return approvalStatus === 'VERIFIED' || approvalStatus === 'APPROVED';
}

/** Token Jaccard when no AI provider is configured — keeps demo AI mode useful. */
function localTextSimilarity(left: string, right: string): number {
  const tokenize = (text: string) =>
    new Set(
      text
        .toLowerCase()
        .split(/[^a-z0-9]+/)
        .filter((t) => t.length > 2),
    );
  const a = tokenize(left);
  const b = tokenize(right);
  if (a.size === 0 || b.size === 0) return 0;
  let intersection = 0;
  for (const token of a) {
    if (b.has(token)) intersection += 1;
  }
  return intersection / new Set([...a, ...b]).size;
}

@Injectable()
export class MatchmakingService {
  private readonly logger = new Logger(MatchmakingService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly outbox: OutboxService,
    private readonly config: EffectiveConfigService,
    private readonly email: EmailService,
    private readonly env: EnvService,
    private readonly filters: FiltersService,
    private readonly ai: AiService,
    private readonly places: PlacesService,
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

  async getDefaultRuleConfig() {
    const rule = await this.ensureDefaultRule();
    const latest = await this.prisma.matchingRuleVersion.findFirst({
      where: { ruleId: rule.id },
      orderBy: { version: 'desc' },
    });
    return {
      ruleId: rule.id,
      version: latest?.version ?? 1,
      weights: resolveMatchingWeights(
        latest?.weights ?? defaultMatchingWeights,
      ),
      minScore: latest?.minScore ?? 40,
    };
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
    const forceRegenerate = Boolean(incoming.forceRegenerate);
    delete incoming.forceRegenerate;
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
    const bookingWindow = await this.config.getMeetingBookingWindow();
    this.config.assertDateInMeetingWindow(config.scheduleDate, bookingWindow);
    if (config.startTime < bookingWindow.activeStart) {
      throw new BadRequestException(
        `Start time must be on or after ${bookingWindow.activeStart}`,
      );
    }
    if (config.endTime > bookingWindow.activeEnd) {
      throw new BadRequestException(
        `End time must be on or before ${bookingWindow.activeEnd}`,
      );
    }
    const existingForDate = await this.countActiveMeetingsForDate(
      config.scheduleDate,
    );
    if (existingForDate > 0 && !forceRegenerate) {
      throw new ConflictException({
        message: `Meetings already exist for ${config.scheduleDate} (${existingForDate}). Remove them or regenerate.`,
        code: 'SCHEDULE_DATE_EXISTS',
        scheduleDate: config.scheduleDate,
        meetingCount: existingForDate,
      });
    }
    if (existingForDate > 0 && forceRegenerate) {
      await this.cancelMeetingsForDate(
        actor,
        config.scheduleDate,
        'Regenerated matchmaking for this date',
      );
    }

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
      const weights = resolveMatchingWeights(
        ruleVersion?.weights ?? defaultMatchingWeights,
      );
      const minScore = ruleVersion?.minScore ?? 40;
      const config = scheduleConfigSchema.parse(run.config);

      const companies = (
        await this.prisma.company.findMany({
          include: { organization: true },
        })
      ).filter(
        (company) =>
          isVendorVerified(company.approvalStatus) &&
          company.matchingEligible &&
          isOrgActive(company.organization.status),
      );
      const vendors = (
        await this.prisma.vendor.findMany({
          include: { organization: true },
          // normalizedProfile carries about / focusEvents for AI narrative
        })
      ).filter(
        (vendor) =>
          isVendorVerified(vendor.approvalStatus) &&
          vendor.matchingEligible &&
          vendor.onboardingComplete &&
          isOrgActive(vendor.organization.status),
      );
      const [equivalences, tagLabels] = await Promise.all([
        this.filters.listEquivalences(),
        this.filters.listTagLabelIndex(),
      ]);

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
      const aiGloballyEnabled = await this.ai.isEnabled();
      const useAi = Boolean(config.useAi) && aiGloballyEnabled;
      let aiPairsScored = 0;
      const aiModeSetting = useAi
        ? await this.config.getString('ai.matchmakingMode', 'llm')
        : 'embedding';
      const includeOnboarding = useAi
        ? await this.config.getBoolean('ai.includeOnboardingInProfile', false)
        : false;
      const recommendationThreshold = Math.max(
        0,
        Math.min(
          100,
          await this.config.getNumber('ops.recommendationScoreThreshold', 50),
        ),
      );
      const tagCategoryThresholds = resolveTagCategoryThresholds(
        await this.config.getRaw('ops.tagCategoryThresholds'),
      );
      const aiBlendWeight = useAi
        ? Math.max(
            0,
            Math.min(
              1,
              await this.config.getNumber('ai.matchmakingBlendWeight', 0.3),
            ),
          )
        : 0.3;
      const aiSystemPrompt = useAi
        ? await this.config.getString('ai.matchmakingPrompt', '')
        : '';
      const aiTemperature = useAi
        ? await this.config.getNumber('ai.javTemperature', 0.2)
        : 0.2;

      for (const company of companies) {
        for (const vendor of vendors) {
          // Verified matching-eligible orgs are schedulable; capability fit
          // still influences score, but does not hard-block the pair.
          const eligibility = evaluateEligibility({
            companyActive: true,
            vendorActive: true,
            companyOnboardingComplete: true,
            vendorOnboardingComplete: true,
            vendorApproved: true,
            companyMatchingEligible: true,
            vendorMatchingEligible: true,
            mandatoryCapabilities: [],
            vendorCapabilities: vendor.capabilities,
            explicitlyExcluded: false,
            sharedSlotAvailable: true,
            companyCapacityExhausted: false,
            vendorCapacityExhausted: false,
            duplicatePairingProhibited: false,
            policyViolation: false,
          });

          const companyFeatures = companyToProfileFeatures({
            organizationId: company.organizationId,
            preferredCategories: company.preferredCategories,
            requiredCapabilities: company.requiredCapabilities,
            commercialPrefs: company.commercialPrefs,
            normalizedProfile: company.normalizedProfile,
            organization: company.organization,
          });
          const vendorFeatures = vendorToProfileFeatures({
            organizationId: vendor.organizationId,
            capabilities: vendor.capabilities,
            categories: vendor.categories,
            operatingRegions: vendor.operatingRegions,
            commercialPrefs: vendor.commercialPrefs,
            normalizedProfile: vendor.normalizedProfile,
            organization: vendor.organization,
          });
          const score = calculateMatchScore(
            companyFeatures,
            vendorFeatures,
            weights,
            equivalences,
            tagLabels,
          );

          let totalScore = score.totalScore;
          let explanation = score.explanation;
          const breakdown: Record<string, number> = {
            ...score.breakdown,
          };

          if (useAi) {
            void includeOnboarding;
            const cards = buildMatchmakingPairCards({
              company: companyFeatures,
              vendor: vendorFeatures,
              tagLabels,
            });
            const left = cards.investor;
            const right = cards.innovator;

            let embedding01: number | null = null;
            let llm01: number | null = null;
            let llmRationale: string | undefined;
            let llmReasons: string[] | undefined;
            let aiSource = 'local';

            const wantsEmbedding =
              aiModeSetting === 'embedding' || aiModeSetting === 'hybrid';
            const wantsLlm =
              aiModeSetting === 'llm' || aiModeSetting === 'hybrid';

            if (wantsEmbedding) {
              embedding01 = await this.ai.semanticSimilarity({ left, right });
              if (embedding01 != null) aiSource = 'embedding';
            }

            if (wantsLlm) {
              const pair = await this.ai.pairMatchScore({
                left,
                right,
                systemPrompt: aiSystemPrompt || undefined,
                temperature: aiTemperature,
              });
              if (pair) {
                llm01 = pair.score;
                llmRationale = pair.rationale;
                llmReasons = pair.reasons;
                aiSource = pair.provider;
              }
            }

            let semantic01: number;
            if (embedding01 != null && llm01 != null) {
              semantic01 = (embedding01 + llm01) / 2;
              aiSource = `${aiSource}+hybrid`;
            } else if (llm01 != null) {
              semantic01 = llm01;
            } else if (embedding01 != null) {
              semantic01 = embedding01;
            } else {
              semantic01 = localTextSimilarity(left, right);
              aiSource = 'local';
            }

            const blend = aiBlendWeight;
            const aiScore = Math.round(semantic01 * 10000) / 100;
            breakdown.aiSemantic = aiScore;
            if (llm01 != null) {
              breakdown.aiLlm = Math.round(llm01 * 10000) / 100;
            }
            if (embedding01 != null) {
              breakdown.aiEmbedding = Math.round(embedding01 * 10000) / 100;
            }
            breakdown.aiBlendWeight = blend;

            totalScore =
              Math.round(
                (score.totalScore * (1 - blend) + aiScore * blend) * 100,
              ) / 100;
            if (llmRationale?.trim()) {
              const bullets =
                llmReasons?.length && llmReasons.length > 0
                  ? ` ${llmReasons.join(' · ')}`
                  : '';
              explanation = `${llmRationale.trim()}${bullets} (AI score ${aiScore.toFixed(0)}, blended ${totalScore}/100).`;
            } else {
              explanation = `${score.explanation} AI boost (${aiSource}, blend ${blend}): ${aiScore.toFixed(0)} → blended ${totalScore}/100.`;
            }
            aiPairsScored += 1;
          }

          // Eligible when total score and per-tag-category floors are met.
          const scoreFloor = Math.max(recommendationThreshold, Math.min(minScore, 20));
          const tagGate = meetsTagCategoryThresholds(
            breakdown,
            tagCategoryThresholds,
          );
          candidates.push({
            runId,
            companyOrgId: company.organizationId,
            vendorOrgId: vendor.organizationId,
            totalScore,
            scoreBreakdown: breakdown as unknown as Prisma.InputJsonValue,
            explanation,
            eligible:
              eligibility.eligible &&
              totalScore >= scoreFloor &&
              tagGate.ok,
            ineligibilityReasons: [
              ...eligibility.reasons,
              ...(totalScore < scoreFloor ? ['BELOW_SCORE_THRESHOLD'] : []),
              ...tagGate.failed.map((key) => `BELOW_TAG_THRESHOLD_${key.toUpperCase()}`),
            ],
            companyProfileVersion: company.profileVersion,
            vendorProfileVersion: vendor.profileVersion,
          });
        }
      }

      if (useAi) {
        this.logger.log(
          `AI matchmaking scored ${aiPairsScored} pairs for run ${runId}`,
        );
      }

      await this.prisma.matchCandidate.createMany({ data: candidates });

      // Score-only run: participants choose who to meet, then self-schedule via meeting requests.
      await this.prisma.matchmakingRun.update({
        where: { id: runId },
        data: {
          status: 'PREVIEW_READY',
          completedAt: new Date(),
        },
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
              where: { status: { not: 'CANCELLED' } },
              orderBy: { startsAt: 'asc' },
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
          take: 1000,
        },
      },
    });
    if (!run) {
      throw new NotFoundException('Run not found');
    }
    return run;
  }

  async publishSchedule(_actor: AuthUser, _scheduleVersionId: string) {
    throw new BadRequestException(
      'Automatic schedule publish is disabled. Matchmaking runs score pairs only; participants express interest from recommendations and pick time and place under Requests.',
    );
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

    const duplicatePair = await this.prisma.meeting.findFirst({
      where: {
        scheduleVersionId: schedule.id,
        companyOrgId: input.companyOrgId,
        vendorOrgId: input.vendorOrgId,
        status: { not: 'CANCELLED' },
      },
      select: { id: true },
    });
    if (duplicatePair) {
      throw new BadRequestException(
        'This company and vendor already have a meeting on this schedule',
      );
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
      throw new BadRequestException(
        'Scheduling conflict: company or vendor is already booked in that slot',
      );
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
          status: schedule.status === 'PUBLISHED' ? 'CONFIRMED' : 'PROPOSED',
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

      await this.places.applyAssignedPlaces(
        [
          {
            id: created.id,
            companyOrgId: created.companyOrgId,
            startsAt: created.startsAt,
            endsAt: created.endsAt,
          },
        ],
        tx,
      );

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
    if (input.startsAt) {
      const bookingWindow = await this.config.getMeetingBookingWindow();
      this.config.assertInstantInMeetingWindow(
        startsAt,
        bookingWindow,
        meeting.durationMinutes,
      );
    }
    const endsAt = new Date(
      startsAt.getTime() + meeting.durationMinutes * 60_000,
    );

    if (
      companyOrgId !== meeting.companyOrgId ||
      vendorOrgId !== meeting.vendorOrgId
    ) {
      const duplicatePair = await this.prisma.meeting.findFirst({
        where: {
          id: { not: meeting.id },
          scheduleVersionId: meeting.scheduleVersionId,
          companyOrgId,
          vendorOrgId,
          status: { not: 'CANCELLED' },
        },
        select: { id: true },
      });
      if (duplicatePair) {
        throw new BadRequestException(
          'This company and vendor already have a meeting on this schedule',
        );
      }
    }

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

      await this.places.applyAssignedPlaces(
        [
          {
            id: meeting.id,
            companyOrgId,
            startsAt,
            endsAt,
          },
        ],
        tx,
      );

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

    if (
      meeting.scheduleVersion?.status === 'PUBLISHED' &&
      (timeChanged || partiesChanged)
    ) {
      void this.notifyMeetingParties(updated.id, 'updated', reason).catch(
        (err) => {
          this.logger.warn(
            `Meeting update emails failed: ${(err as Error).message}`,
          );
        },
      );
    }

    return updated;
  }

  async deleteMeeting(
    actor: AuthUser,
    meetingId: string,
    reason?: string,
  ) {
    const meeting = await this.prisma.meeting.findUnique({
      where: { id: meetingId },
      include: { scheduleVersion: true },
    });
    if (!meeting) {
      throw new NotFoundException('Meeting not found');
    }
    if (meeting.status === 'CANCELLED') {
      return { id: meeting.id, status: 'CANCELLED' as const };
    }
    if (['COMPLETED', 'NO_SHOW', 'IN_PROGRESS'].includes(meeting.status)) {
      throw new BadRequestException(
        `Cannot delete a meeting in status ${meeting.status}`,
      );
    }

    const note = reason?.trim() || 'Removed by admin';

    await this.prisma.$transaction(async (tx) => {
      await tx.meetingOccupancy.deleteMany({ where: { meetingId: meeting.id } });
      await tx.meetingStatusHistory.create({
        data: {
          meetingId: meeting.id,
          fromStatus: meeting.status,
          toStatus: 'CANCELLED',
          reason: note,
          actorId: actor.id,
        },
      });
      await tx.meeting.update({
        where: { id: meeting.id },
        data: {
          status: 'CANCELLED',
          cancellationReason: note,
          version: { increment: 1 },
        },
      });
    });

    await this.audit.record({
      actorId: actor.id,
      action: 'meeting.admin_delete',
      entityType: 'Meeting',
      entityId: meeting.id,
      outcome: 'SUCCESS',
      metadata: { reason: note },
    });

    return { id: meeting.id, status: 'CANCELLED' as const };
  }

  /**
   * Create a one-off confirmed meeting for a company/vendor at an absolute start time.
   * Attaches to an existing schedule for that date when possible; otherwise creates a manual schedule.
   */
  async createManualMeeting(
    actor: AuthUser,
    input: {
      companyOrgId: string;
      vendorOrgId: string;
      startsAt: string;
      durationMinutes?: number;
      reason?: string;
    },
  ) {
    if (!input.companyOrgId || !input.vendorOrgId) {
      throw new BadRequestException('Company and vendor are required');
    }
    if (input.companyOrgId === input.vendorOrgId) {
      throw new BadRequestException('Company and vendor must be different');
    }

    const startsAt = new Date(input.startsAt);
    if (Number.isNaN(startsAt.getTime())) {
      throw new BadRequestException('Invalid start time');
    }
    const durationMinutes =
      input.durationMinutes && input.durationMinutes > 0
        ? Math.round(input.durationMinutes)
        : await this.config.getNumber('ops.meetingDurationMinutes', 15);
    const bookingWindow = await this.config.getMeetingBookingWindow();
    this.config.assertInstantInMeetingWindow(
      startsAt,
      bookingWindow,
      durationMinutes,
    );
    const endsAt = new Date(startsAt.getTime() + durationMinutes * 60_000);
    const reason = input.reason?.trim() || 'Manual meeting created by admin';
    const scheduleDate = startsAt.toISOString().slice(0, 10);

    const [company, vendor] = await Promise.all([
      this.prisma.organization.findUnique({ where: { id: input.companyOrgId } }),
      this.prisma.organization.findUnique({ where: { id: input.vendorOrgId } }),
    ]);
    if (!company || company.type !== 'COMPANY') {
      throw new BadRequestException('Invalid company');
    }
    if (!vendor || vendor.type !== 'VENDOR') {
      throw new BadRequestException('Invalid vendor');
    }

    const conflict = await this.prisma.meetingOccupancy.findFirst({
      where: {
        participantKey: {
          in: [`org:${input.companyOrgId}`, `org:${input.vendorOrgId}`],
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

    const schedule = await this.resolveOrCreateManualSchedule(
      actor,
      scheduleDate,
    );

    const duplicatePair = await this.prisma.meeting.findFirst({
      where: {
        scheduleVersionId: schedule.id,
        companyOrgId: input.companyOrgId,
        vendorOrgId: input.vendorOrgId,
        status: { not: 'CANCELLED' },
      },
      select: { id: true },
    });
    if (duplicatePair) {
      throw new BadRequestException(
        'This company and vendor already have a meeting on this schedule',
      );
    }

    const meeting = await this.prisma.$transaction(async (tx) => {
      const match = await tx.match.create({
        data: {
          runId: schedule.runId,
          companyOrgId: input.companyOrgId,
          vendorOrgId: input.vendorOrgId,
          totalScore: 0,
          scoreBreakdown: {},
          explanation: `Manual meeting: ${reason}`,
          isManual: true,
          overrideReason: reason,
        },
      });

      const created = await tx.meeting.create({
        data: {
          scheduleVersionId: schedule.id,
          matchId: match.id,
          companyOrgId: input.companyOrgId,
          vendorOrgId: input.vendorOrgId,
          startsAt,
          endsAt,
          timeZone: 'UTC',
          durationMinutes,
          status: 'CONFIRMED',
          idempotencyKey: `manual-meeting:${schedule.id}:${input.companyOrgId}:${input.vendorOrgId}:${startsAt.toISOString()}`,
        },
        include: {
          companyOrg: true,
          vendorOrg: true,
        },
      });

      await tx.meetingOccupancy.createMany({
        data: [
          {
            meetingId: created.id,
            participantKey: `org:${input.companyOrgId}`,
            startsAt,
            endsAt,
          },
          {
            meetingId: created.id,
            participantKey: `org:${input.vendorOrgId}`,
            startsAt,
            endsAt,
          },
        ],
      });

      await this.places.applyAssignedPlaces(
        [
          {
            id: created.id,
            companyOrgId: created.companyOrgId,
            startsAt: created.startsAt,
            endsAt: created.endsAt,
          },
        ],
        tx,
      );

      await tx.meetingStatusHistory.create({
        data: {
          meetingId: created.id,
          fromStatus: 'PROPOSED',
          toStatus: 'CONFIRMED',
          reason,
          actorId: actor.id,
        },
      });

      return created;
    });

    await this.audit.record({
      actorId: actor.id,
      action: 'meeting.manual_create',
      entityType: 'Meeting',
      entityId: meeting.id,
      outcome: 'SUCCESS',
      metadata: { reason, scheduleDate },
    });

    return meeting;
  }

  async countActiveMeetingsForDate(scheduleDate: string) {
    const { dayStart, dayEnd } = this.dayBoundsUtc(scheduleDate);
    return this.prisma.meeting.count({
      where: {
        startsAt: { gte: dayStart, lt: dayEnd },
        status: { not: 'CANCELLED' },
      },
    });
  }

  /**
   * Clear scoring runs (and cancel open meetings) for a schedule date so
   * admins can start matchmaking fresh.
   */
  async resetMatchmaking(actor: AuthUser, scheduleDate: string) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(scheduleDate)) {
      throw new BadRequestException('Invalid schedule date');
    }
    const { dayStart, dayEnd } = this.dayBoundsUtc(scheduleDate);

    const cancelled = await this.cancelMeetingsForDate(
      actor,
      scheduleDate,
      'Matchmaking reset by admin',
    );

    const runs = await this.prisma.matchmakingRun.findMany({
      where: { scheduleDate: { gte: dayStart, lt: dayEnd } },
      select: {
        id: true,
        scheduleVersions: { select: { id: true } },
        matches: { select: { id: true } },
      },
    });
    const scheduleVersionIds = runs.flatMap((r) =>
      r.scheduleVersions.map((s) => s.id),
    );
    const matchIds = runs.flatMap((r) => r.matches.map((m) => m.id));
    const runIds = runs.map((r) => r.id);

    if (scheduleVersionIds.length || matchIds.length) {
      await this.prisma.meeting.updateMany({
        where: {
          OR: [
            ...(scheduleVersionIds.length
              ? [{ scheduleVersionId: { in: scheduleVersionIds } }]
              : []),
            ...(matchIds.length ? [{ matchId: { in: matchIds } }] : []),
          ],
        },
        data: {
          scheduleVersionId: null,
          slotId: null,
          matchId: null,
        },
      });
    }

    if (runIds.length) {
      await this.prisma.matchmakingRun.deleteMany({
        where: { id: { in: runIds } },
      });
    }

    // Do not wipe OrgPeerRecommendation here — those are profile matches for
    // investor↔innovator Recommendations, not schedule-date artefacts.

    await this.audit.record({
      actorId: actor.id,
      action: 'matchmaking.reset',
      entityType: 'MatchmakingRun',
      entityId: scheduleDate,
      outcome: 'SUCCESS',
      metadata: {
        scheduleDate,
        cancelledMeetings: cancelled.cancelled,
        deletedRuns: runIds.length,
      },
    });

    return {
      scheduleDate,
      cancelledMeetings: cancelled.cancelled,
      deletedRuns: runIds.length,
      clearedPeerRecommendations: 0,
    };
  }

  async cancelMeetingsForDate(
    actor: AuthUser,
    scheduleDate: string,
    reason: string,
  ) {
    const { dayStart, dayEnd } = this.dayBoundsUtc(scheduleDate);
    const meetings = await this.prisma.meeting.findMany({
      where: {
        startsAt: { gte: dayStart, lt: dayEnd },
        status: { notIn: ['CANCELLED', 'COMPLETED', 'NO_SHOW', 'IN_PROGRESS'] },
      },
      select: { id: true, status: true },
    });

    if (!meetings.length) return { cancelled: 0 };

    await this.prisma.$transaction(async (tx) => {
      const ids = meetings.map((m) => m.id);
      await tx.meetingOccupancy.deleteMany({
        where: { meetingId: { in: ids } },
      });
      for (const meeting of meetings) {
        await tx.meetingStatusHistory.create({
          data: {
            meetingId: meeting.id,
            fromStatus: meeting.status,
            toStatus: 'CANCELLED',
            reason,
            actorId: actor.id,
          },
        });
      }
      await tx.meeting.updateMany({
        where: { id: { in: ids } },
        data: {
          status: 'CANCELLED',
          cancellationReason: reason,
        },
      });
    });

    await this.audit.record({
      actorId: actor.id,
      action: 'meeting.cancel_for_date',
      entityType: 'MatchmakingRun',
      entityId: scheduleDate,
      outcome: 'SUCCESS',
      metadata: { scheduleDate, cancelled: meetings.length, reason },
    });

    return { cancelled: meetings.length };
  }

  private dayBoundsUtc(scheduleDate: string) {
    const dayStart = new Date(`${scheduleDate}T00:00:00.000Z`);
    const dayEnd = new Date(dayStart);
    dayEnd.setUTCDate(dayEnd.getUTCDate() + 1);
    if (Number.isNaN(dayStart.getTime())) {
      throw new BadRequestException('Invalid schedule date');
    }
    return { dayStart, dayEnd };
  }

  private async resolveOrCreateManualSchedule(
    actor: AuthUser,
    scheduleDate: string,
  ) {
    const { dayStart, dayEnd } = this.dayBoundsUtc(scheduleDate);
    const published = await this.prisma.scheduleVersion.findFirst({
      where: {
        status: 'PUBLISHED',
        run: { scheduleDate: { gte: dayStart, lt: dayEnd } },
      },
      orderBy: { createdAt: 'desc' },
      include: { run: true },
    });
    if (published) return published;

    const existing = await this.prisma.scheduleVersion.findFirst({
      where: {
        status: 'PREVIEW_READY',
        run: { scheduleDate: { gte: dayStart, lt: dayEnd } },
      },
      orderBy: { createdAt: 'desc' },
      include: { run: true },
    });
    if (existing) return existing;

    const rule = await this.ensureDefaultRule();
    const ruleVersion = await this.prisma.matchingRuleVersion.findFirst({
      where: { ruleId: rule.id },
      orderBy: { version: 'desc' },
    });
    if (!ruleVersion) {
      throw new BadRequestException('No matching rule version published');
    }

    return this.prisma.$transaction(async (tx) => {
      const run = await tx.matchmakingRun.create({
        data: {
          matchingRuleId: rule.id,
          matchingRuleVersion: ruleVersion.version,
          scheduleDate: dayStart,
          timeZone: 'UTC',
          status: 'PUBLISHED',
          config: {
            scheduleDate,
            startTime: '00:00',
            endTime: '23:59',
            timeZone: 'UTC',
            mode: 'VIRTUAL',
            source: 'manual',
          } as Prisma.InputJsonValue,
          idempotencyKey: `manual-schedule:${scheduleDate}:${generateSecureToken(8)}`,
          createdById: actor.id,
          completedAt: new Date(),
        },
      });

      return tx.scheduleVersion.create({
        data: {
          runId: run.id,
          version: 1,
          status: 'PUBLISHED',
          publishedAt: new Date(),
          publishedById: actor.id,
          config: { source: 'manual' } as Prisma.InputJsonValue,
        },
        include: { run: true },
      });
    });
  }

  private async notifySchedulePublished(scheduleVersionId: string) {
    const meetings = await this.prisma.meeting.findMany({
      where: {
        scheduleVersionId,
        status: { not: 'CANCELLED' },
      },
      select: { id: true },
      orderBy: { startsAt: 'asc' },
    });

    for (const meeting of meetings) {
      await this.notifyMeetingParties(meeting.id, 'published');
    }
  }

  private async notifyMeetingParties(
    meetingId: string,
    variant: 'published' | 'updated',
    changeReason?: string,
  ) {
    const meeting = await this.prisma.meeting.findUnique({
      where: { id: meetingId },
      include: {
        companyOrg: {
          include: {
            invitations: {
              orderBy: { createdAt: 'desc' },
              take: 1,
              select: { email: true },
            },
            members: {
              take: 1,
              orderBy: { joinedAt: 'asc' },
              include: { user: { select: { email: true } } },
            },
          },
        },
        vendorOrg: {
          include: {
            invitations: {
              orderBy: { createdAt: 'desc' },
              take: 1,
              select: { email: true },
            },
            members: {
              take: 1,
              orderBy: { joinedAt: 'asc' },
              include: { user: { select: { email: true } } },
            },
          },
        },
      },
    });
    if (!meeting) return;

    const fromName = await this.email.getFromName();
    const portalUrl = `${this.env.appUrl.replace(/\/$/, '')}/portal`;
    const companyEmail = this.resolveOrgEmail(meeting.companyOrg);
    const vendorEmail = this.resolveOrgEmail(meeting.vendorOrg);

    const recipients: Array<{
      to: string;
      audience: 'company' | 'vendor';
    }> = [];
    if (companyEmail) {
      recipients.push({ to: companyEmail, audience: 'company' });
    } else {
      this.logger.warn(
        `No company email for meeting ${meetingId} (${meeting.companyOrg.name})`,
      );
    }
    if (vendorEmail) {
      recipients.push({ to: vendorEmail, audience: 'vendor' });
    } else {
      this.logger.warn(
        `No vendor email for meeting ${meetingId} (${meeting.vendorOrg.name})`,
      );
    }

    for (const recipient of recipients) {
      const template = renderMeetingEmail({
        brandName: fromName,
        audience: recipient.audience,
        variant,
        companyName: meeting.companyOrg.name,
        vendorName: meeting.vendorOrg.name,
        startsAt: meeting.startsAt,
        endsAt: meeting.endsAt,
        durationMinutes: meeting.durationMinutes,
        mode: meeting.mode,
        portalUrl,
        changeReason,
      });
      try {
        await this.email.send({
          to: recipient.to,
          subject: template.subject,
          text: template.text,
          html: template.html,
          idempotencyKey: `meeting.${variant}:${meetingId}:${recipient.audience}:${meeting.version}:${Date.now()}`,
          templateCode:
            variant === 'updated' ? 'meeting_update' : 'meeting_published',
        });
      } catch (err) {
        this.logger.warn(
          `Failed ${variant} email to ${recipient.to}: ${(err as Error).message}`,
        );
      }
    }
  }

  private resolveOrgEmail(org: {
    customAttrs: unknown;
    invitations: Array<{ email: string }>;
    members: Array<{ user: { email: string } }>;
  }): string | null {
    const attrs =
      org.customAttrs && typeof org.customAttrs === 'object'
        ? (org.customAttrs as Record<string, unknown>)
        : {};
    const attrEmail =
      typeof attrs.contactEmail === 'string' ? attrs.contactEmail.trim() : '';
    const inviteEmail = org.invitations[0]?.email?.trim() ?? '';
    const memberEmail = org.members[0]?.user.email?.trim() ?? '';
    const email = (inviteEmail || attrEmail || memberEmail).toLowerCase();
    return email || null;
  }

}
