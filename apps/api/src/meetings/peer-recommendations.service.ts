import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import {
  calculateMatchScore,
  companyToProfileFeatures,
  selectDiverseTop,
  vendorToProfileFeatures,
  type ProfileFeatures,
} from '@em/domain';
import {
  blendPreferenceAwareScore,
  clampRecommendationLimit,
  DEFAULT_INNOVATOR_RECOMMENDATION_LIMIT,
  DEFAULT_INVESTOR_RECOMMENDATION_LIMIT,
  defaultMatchingWeights,
  meetsTagCategoryThresholds,
  PEER_RECOMMENDATIONS_ABSOLUTE_MAX,
  resolveMatchingWeights,
  resolveTagCategoryThresholds,
  type MatchingWeights,
  type TagCategoryThresholds,
} from '@em/shared';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { FiltersService } from '../filters/filters.service';
import { AiService } from '../integrations/ai/ai.service';
import { EffectiveConfigService } from '../settings/effective-config.service';
import { formatPreferenceFitForPrompt } from '../integrations/ai/matchmaking-prompt';
import { buildMatchmakingPairCards } from '../integrations/ai/profile-narrative';
import type { AuthUser } from '../common/decorators';
import { AuditService } from '../audit/audit.service';

const DEFAULT_PEER_RECOMPUTE_LLM_CANDIDATES = 12;
const DEFAULT_PEER_RECOMPUTE_CONCURRENCY = 5;

/** How sync treats existing COMPUTED recommendations. */
type PeerRecPruneMode = 'sticky' | 'reevaluate';

/**
 * sticky — keep existing matches on refresh/view (only drop dismissed / gone peers);
 *          fill empty slots with new high-scoring pairs.
 * reevaluate — also drop matches that no longer meet threshold/tag floors
 *              (profile edits, threshold settings changes, explicit Recompute).
 */
function pruneModeForReason(reason: string): PeerRecPruneMode {
  if (reason.startsWith('settings.')) return 'reevaluate';
  if (
    reason.startsWith('profile.') ||
    reason === 'eligibility' ||
    reason === 'company.create' ||
    reason === 'company.admin_fill' ||
    reason === 'vendor.approve' ||
    reason === 'manual.recompute'
  ) {
    return 'reevaluate';
  }
  return 'sticky';
}

function preferReevaluateReason(
  current: string | undefined,
  incoming: string,
): string {
  if (!current) return incoming;
  if (pruneModeForReason(incoming) === 'reevaluate') return incoming;
  if (pruneModeForReason(current) === 'reevaluate') return current;
  return incoming;
}

/** Name, display name, member login, invite address, or stored contact email. */
function organizationNameOrEmailFilter(
  q: string,
): Prisma.OrganizationWhereInput {
  return {
    OR: [
      { name: { contains: q, mode: 'insensitive' } },
      {
        vendor: {
          displayName: { contains: q, mode: 'insensitive' },
        },
      },
      {
        invitations: {
          some: {
            email: { contains: q, mode: 'insensitive' },
          },
        },
      },
      {
        members: {
          some: {
            user: {
              email: { contains: q, mode: 'insensitive' },
            },
          },
        },
      },
      {
        customAttrs: {
          path: ['contactEmail'],
          string_contains: q,
        },
      },
    ],
  };
}

function contactEmailOf(org: {
  customAttrs?: unknown;
  members?: Array<{ user: { email: string } }>;
  invitations?: Array<{ email: string }>;
}): string | null {
  const attrs =
    org.customAttrs &&
    typeof org.customAttrs === 'object' &&
    !Array.isArray(org.customAttrs)
      ? (org.customAttrs as Record<string, unknown>)
      : {};
  const attrEmail =
    typeof attrs.contactEmail === 'string' ? attrs.contactEmail.trim() : '';
  return (
    org.members?.[0]?.user.email?.trim() ||
    org.invitations?.[0]?.email?.trim() ||
    attrEmail ||
    null
  );
}

async function mapWithConcurrency<T, R>(
  items: T[],
  concurrency: number,
  fn: (item: T, index: number) => Promise<R>,
): Promise<R[]> {
  if (items.length === 0) return [];
  const results = new Array<R>(items.length);
  let nextIndex = 0;
  const workerCount = Math.min(Math.max(1, concurrency), items.length);

  await Promise.all(
    Array.from({ length: workerCount }, async () => {
      for (;;) {
        const index = nextIndex;
        nextIndex += 1;
        if (index >= items.length) return;
        results[index] = await fn(items[index]!, index);
      }
    }),
  );

  return results;
}

function localTextSimilarity(left: string, right: string): number {
  const tokenize = (s: string) =>
    new Set(
      s
        .toLowerCase()
        .split(/[^a-z0-9]+/i)
        .filter((t) => t.length > 1),
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
export class PeerRecommendationsService {
  private readonly logger = new Logger(PeerRecommendationsService.name);
  private readonly inflight = new Set<string>();
  private readonly rerun = new Set<string>();
  /** Preserves prune intent when a second recompute is queued mid-flight. */
  private readonly rerunReasons = new Map<string, string>();

  constructor(
    private readonly prisma: PrismaService,
    private readonly filters: FiltersService,
    private readonly ai: AiService,
    private readonly config: EffectiveConfigService,
    private readonly audit: AuditService,
  ) {}

  isRecomputing(organizationId: string) {
    return this.inflight.has(organizationId);
  }

  /**
   * Fire-and-forget recompute for a newly eligible investor/innovator.
   * Scores this org against all opposite peers (both directions).
   * If a run is already in flight, queue one more pass so a later profile
   * update is not dropped.
   */
  scheduleRecompute(organizationId: string, reason = 'eligibility') {
    if (this.inflight.has(organizationId)) {
      this.rerun.add(organizationId);
      this.rerunReasons.set(
        organizationId,
        preferReevaluateReason(this.rerunReasons.get(organizationId), reason),
      );
      return;
    }
    this.inflight.add(organizationId);
    void this.recomputeForOrganization(organizationId, reason)
      .then((result) => {
        this.logger.log(
          `Peer recommendations for ${organizationId} (${reason}): upserted ${result.upserted}`,
        );
      })
      .catch((err) => {
        this.logger.warn(
          `Peer recommendation recompute failed for ${organizationId}: ${(err as Error).message}`,
        );
      })
      .finally(() => {
        this.inflight.delete(organizationId);
        if (this.rerun.has(organizationId)) {
          this.rerun.delete(organizationId);
          const nextReason =
            this.rerunReasons.get(organizationId) ?? 'queued-rerun';
          this.rerunReasons.delete(organizationId);
          this.scheduleRecompute(organizationId, nextReason);
        }
      });
  }

  /**
   * Queue recomputes for every verified investor and innovator so both sides
   * get opposite-type Recommendations (not only the org that opened the page).
   */
  async scheduleRecomputeAllEligible(reason = 'admin.bulk') {
    const [companies, vendors] = await Promise.all([
      this.prisma.company.findMany({
        where: {
          matchingEligible: true,
          approvalStatus: 'VERIFIED',
          verificationStatus: 'VERIFIED',
          organization: { status: { not: 'ARCHIVED' } },
        },
        select: { organizationId: true },
      }),
      this.prisma.vendor.findMany({
        where: {
          matchingEligible: true,
          approvalStatus: 'VERIFIED',
          verificationStatus: 'VERIFIED',
          onboardingComplete: true,
          organization: { status: { not: 'ARCHIVED' } },
        },
        select: { organizationId: true },
      }),
    ]);
    const ids = [
      ...new Set([
        ...companies.map((row) => row.organizationId),
        ...vendors.map((row) => row.organizationId),
      ]),
    ];
    for (const organizationId of ids) {
      this.scheduleRecompute(organizationId, reason);
    }
    return { queued: ids.length };
  }

  /**
   * Start AI/tag scoring when the viewer opens recommendations and nothing
   * has been computed for the current profile yet.
   */
  async ensureComputed(organizationId: string) {
    const existingCount = await this.prisma.orgPeerRecommendation.count({
      where: { fromOrgId: organizationId },
    });
    // If a recompute is running but we already have rows, keep serving them.
    // Reporting computing:true here made the UI poll and flicker empty mid-sync.
    if (this.inflight.has(organizationId)) {
      return { computing: existingCount === 0 };
    }
    const org = await this.prisma.organization.findUnique({
      where: { id: organizationId },
      include: { company: true, vendor: true },
    });
    if (!org || !this.hasMatchableProfile(org)) {
      return { computing: false as const };
    }
    const computed = await this.hasFreshComputation(organizationId);
    if (computed) {
      return { computing: false as const };
    }
    this.scheduleRecompute(organizationId, 'recommendations.view');
    return { computing: existingCount === 0 };
  }

  async listForOrganization(organizationId: string, limit?: number) {
    const org = await this.prisma.organization.findUnique({
      where: { id: organizationId },
      select: { id: true, name: true, type: true },
    });
    if (!org) throw new NotFoundException('Organization not found');

    const threshold = await this.getRecommendationThreshold();
    const roleLimit = await this.getRecommendationLimit(
      org.type === 'VENDOR' ? 'VENDOR' : 'COMPANY',
    );
    const max = Math.min(
      Math.max(limit ?? roleLimit, 1),
      roleLimit,
      PEER_RECOMMENDATIONS_ABSOLUTE_MAX,
    );
    const items = await this.prisma.orgPeerRecommendation.findMany({
      where: { fromOrgId: organizationId },
      include: {
        toOrg: {
          select: {
            id: true,
            name: true,
            type: true,
            industry: true,
            region: true,
          },
        },
      },
      orderBy: [{ totalScore: 'desc' }, { computedAt: 'desc' }],
      take: Math.max(max * 3, 30),
    });

    const tagCategoryThresholds = resolveTagCategoryThresholds(
      await this.config.getRaw('ops.tagCategoryThresholds'),
    );

    // Admin pins first, then by score. COMPUTED rows must meet score + tag floors.
    const visible = this.filterVisibleRecommendations(
      items,
      threshold,
      tagCategoryThresholds,
    ).slice(0, max);

    return {
      organization: org,
      counterpartLabel: org.type === 'COMPANY' ? 'innovators' : 'investors',
      scoreThreshold: threshold,
      recommendationLimit: roleLimit,
      items: visible.map((row) => ({
        id: row.id,
        toOrg: row.toOrg,
        perspective: row.perspective,
        source: row.source,
        ruleScore: row.ruleScore,
        aiScore: row.aiScore,
        totalScore: row.totalScore,
        reasons: row.reasons,
        aiDescription: row.aiDescription,
        scoreBreakdown: row.scoreBreakdown,
        computedAt: row.computedAt,
      })),
      total: visible.length,
    };
  }

  /**
   * Eligible opposite-type orgs not yet recommended for this viewer.
   * Investor → innovators only; innovator → investors only.
   */
  async listCandidates(
    organizationId: string,
    input?: { q?: string; limit?: number },
  ) {
    const org = await this.prisma.organization.findUnique({
      where: { id: organizationId },
      select: { id: true, name: true, type: true },
    });
    if (!org || !['COMPANY', 'VENDOR'].includes(org.type)) {
      throw new NotFoundException('Organization not found');
    }

    const existing = await this.prisma.orgPeerRecommendation.findMany({
      where: { fromOrgId: organizationId },
      select: { toOrgId: true },
    });
    const excludeIds = [
      organizationId,
      ...existing.map((row) => row.toOrgId),
    ];
    const limit = Math.min(Math.max(input?.limit ?? 30, 1), 50);
    const q = input?.q?.trim();

    if (org.type === 'COMPANY') {
      const vendors = await this.prisma.vendor.findMany({
        where: {
          matchingEligible: true,
          approvalStatus: 'VERIFIED',
          verificationStatus: 'VERIFIED',
          onboardingComplete: true,
          organizationId: { notIn: excludeIds },
          organization: {
            status: { not: 'ARCHIVED' },
            ...(q ? organizationNameOrEmailFilter(q) : {}),
          },
        },
        include: {
          organization: {
            select: {
              id: true,
              name: true,
              type: true,
              industry: true,
              region: true,
              customAttrs: true,
              members: {
                take: 1,
                orderBy: [{ isPrimary: 'desc' }, { joinedAt: 'asc' }],
                select: { user: { select: { email: true } } },
              },
              invitations: {
                take: 1,
                orderBy: { createdAt: 'desc' },
                select: { email: true },
              },
            },
          },
        },
        orderBy: { organization: { name: 'asc' } },
        take: limit,
      });
      return {
        organization: org,
        counterpartType: 'VENDOR' as const,
        counterpartLabel: 'innovators' as const,
        items: vendors.map((v) => ({
          id: v.organization.id,
          name: v.organization.name,
          type: v.organization.type,
          industry: v.organization.industry,
          region: v.organization.region,
          email: contactEmailOf(v.organization),
        })),
      };
    }

    const companies = await this.prisma.company.findMany({
      where: {
        matchingEligible: true,
        approvalStatus: 'VERIFIED',
        verificationStatus: 'VERIFIED',
        organizationId: { notIn: excludeIds },
        organization: {
          status: { not: 'ARCHIVED' },
          ...(q ? organizationNameOrEmailFilter(q) : {}),
        },
      },
      include: {
        organization: {
          select: {
            id: true,
            name: true,
            type: true,
            industry: true,
            region: true,
            customAttrs: true,
            members: {
              take: 1,
              orderBy: [{ isPrimary: 'desc' }, { joinedAt: 'asc' }],
              select: { user: { select: { email: true } } },
            },
            invitations: {
              take: 1,
              orderBy: { createdAt: 'desc' },
              select: { email: true },
            },
          },
        },
      },
      orderBy: { organization: { name: 'asc' } },
      take: limit,
    });
    return {
      organization: org,
      counterpartType: 'COMPANY' as const,
      counterpartLabel: 'investors' as const,
      items: companies.map((c) => ({
        id: c.organization.id,
        name: c.organization.name,
        type: c.organization.type,
        industry: c.organization.industry,
        region: c.organization.region,
        email: contactEmailOf(c.organization),
      })),
    };
  }

  async addManual(
    actor: AuthUser,
    fromOrgId: string,
    input: { toOrgId: string; note?: string },
  ) {
    const toOrgId = input.toOrgId?.trim();
    if (!toOrgId) throw new BadRequestException('toOrgId is required');

    const [fromOrg, toOrg] = await Promise.all([
      this.prisma.organization.findUnique({
        where: { id: fromOrgId },
        include: { company: true, vendor: true },
      }),
      this.prisma.organization.findUnique({
        where: { id: toOrgId },
        include: { company: true, vendor: true },
      }),
    ]);
    if (!fromOrg || !['COMPANY', 'VENDOR'].includes(fromOrg.type)) {
      throw new NotFoundException('Organization not found');
    }
    if (!toOrg) throw new NotFoundException('Counterpart organization not found');

    // Same direction as the recommendation engine
    if (fromOrg.type === 'COMPANY' && toOrg.type !== 'VENDOR') {
      throw new BadRequestException('Investors can only be recommended innovators');
    }
    if (fromOrg.type === 'VENDOR' && toOrg.type !== 'COMPANY') {
      throw new BadRequestException('Innovators can only be recommended investors');
    }
    if (fromOrgId === toOrgId) {
      throw new BadRequestException('Cannot recommend an organization to itself');
    }

    const existingPair = await this.prisma.orgPeerRecommendation.findUnique({
      where: { fromOrgId_toOrgId: { fromOrgId, toOrgId } },
      select: { id: true },
    });
    const roleLimit = await this.getRecommendationLimit(
      fromOrg.type as 'COMPANY' | 'VENDOR',
    );
    const currentCount = await this.prisma.orgPeerRecommendation.count({
      where: { fromOrgId },
    });
    if (!existingPair && currentCount >= roleLimit) {
      throw new BadRequestException(
        `Maximum ${roleLimit} recommendations per organization. Remove one before adding.`,
      );
    }

    const note =
      input.note?.trim() ||
      `Admin recommendation for ${fromOrg.name}`;
    const now = new Date();
    const fromProfileVersion =
      fromOrg.type === 'COMPANY'
        ? (fromOrg.company?.profileVersion ?? 1)
        : (fromOrg.vendor?.profileVersion ?? 1);
    const toProfileVersion =
      toOrg.type === 'COMPANY'
        ? (toOrg.company?.profileVersion ?? 1)
        : (toOrg.vendor?.profileVersion ?? 1);

    const row = await this.prisma.orgPeerRecommendation.upsert({
      where: {
        fromOrgId_toOrgId: { fromOrgId, toOrgId },
      },
      create: {
        fromOrgId,
        toOrgId,
        perspective: fromOrg.type as 'COMPANY' | 'VENDOR',
        source: 'MANUAL',
        ruleScore: 100,
        aiScore: null,
        totalScore: 100,
        reasons: ['Admin recommendation'],
        aiDescription: note,
        scoreBreakdown: { source: 'MANUAL', admin: 100 },
        fromProfileVersion,
        toProfileVersion,
        computedAt: now,
      },
      update: {
        source: 'MANUAL',
        ruleScore: 100,
        totalScore: 100,
        reasons: ['Admin recommendation'],
        aiDescription: note,
        scoreBreakdown: { source: 'MANUAL', admin: 100 },
        computedAt: now,
      },
      include: {
        toOrg: {
          select: {
            id: true,
            name: true,
            type: true,
            industry: true,
            region: true,
          },
        },
      },
    });

    await this.enforceMaxPerOrg(fromOrgId, fromOrg.type as 'COMPANY' | 'VENDOR');

    await this.audit.record({
      actorId: actor.id,
      action: 'peer_recommendation.manual_add',
      entityType: 'OrgPeerRecommendation',
      entityId: row.id,
      outcome: 'SUCCESS',
      metadata: { fromOrgId, toOrgId, note },
    });

    return {
      id: row.id,
      toOrg: row.toOrg,
      source: row.source,
      totalScore: row.totalScore,
      aiDescription: row.aiDescription,
      reasons: row.reasons,
    };
  }

  async removeManual(actor: AuthUser, fromOrgId: string, toOrgId: string) {
    const existing = await this.prisma.orgPeerRecommendation.findUnique({
      where: {
        fromOrgId_toOrgId: { fromOrgId, toOrgId },
      },
    });
    if (!existing) {
      throw new NotFoundException('Recommendation not found');
    }

    await this.prisma.orgPeerRecommendation.delete({
      where: { id: existing.id },
    });

    await this.audit.record({
      actorId: actor.id,
      action: 'peer_recommendation.remove',
      entityType: 'OrgPeerRecommendation',
      entityId: existing.id,
      outcome: 'SUCCESS',
      metadata: { fromOrgId, toOrgId, source: existing.source },
    });

    return { id: existing.id, deleted: true as const };
  }

  async listOverview(input: {
    type?: 'COMPANY' | 'VENDOR';
    page?: number;
    pageSize?: number;
    q?: string;
  }) {
    const page = Math.max(1, input.page ?? 1);
    const pageSize = Math.min(Math.max(input.pageSize ?? 20, 1), 50);
    const threshold = await this.getRecommendationThreshold();
    const tagCategoryThresholds = resolveTagCategoryThresholds(
      await this.config.getRaw('ops.tagCategoryThresholds'),
    );
    const q = input.q?.trim().replace(/\s+/g, ' ') ?? '';
    const where: Prisma.OrganizationWhereInput = {
      status: { not: 'ARCHIVED' },
      type: input.type ? input.type : { in: ['COMPANY', 'VENDOR'] },
      AND: [
        {
          OR: [
            { company: { matchingEligible: true } },
            { vendor: { matchingEligible: true } },
          ],
        },
        ...(q ? [organizationNameOrEmailFilter(q)] : []),
      ],
    };

    const [total, orgs] = await Promise.all([
      this.prisma.organization.count({ where }),
      this.prisma.organization.findMany({
        where,
        orderBy: { name: 'asc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
        select: {
          id: true,
          name: true,
          type: true,
          industry: true,
          customAttrs: true,
          company: { select: { matchingEligible: true, featured: true } },
          vendor: { select: { matchingEligible: true, featured: true } },
          members: {
            take: 1,
            orderBy: [{ isPrimary: 'desc' }, { joinedAt: 'asc' }],
            select: { user: { select: { email: true } } },
          },
          invitations: {
            take: 1,
            orderBy: { createdAt: 'desc' },
            select: { email: true },
          },
          peerRecommendationsFrom: {
            orderBy: [{ totalScore: 'desc' }, { computedAt: 'desc' }],
            // Fetch extra so threshold/tag floors can drop low scores and
            // still leave enough visible matches for the overview chips.
            take: Math.max(PEER_RECOMMENDATIONS_ABSOLUTE_MAX * 6, 30),
            include: {
              toOrg: {
                select: { id: true, name: true, type: true, industry: true },
              },
            },
          },
        },
      }),
    ]);

    const [investorLimit, innovatorLimit] = await Promise.all([
      this.getRecommendationLimit('COMPANY'),
      this.getRecommendationLimit('VENDOR'),
    ]);

    return {
      items: orgs.map((org) => {
        const roleLimit =
          org.type === 'VENDOR' ? innovatorLimit : investorLimit;
        const visible = this.filterVisibleRecommendations(
          org.peerRecommendationsFrom,
          threshold,
          tagCategoryThresholds,
        ).slice(0, roleLimit);
        return {
          organizationId: org.id,
          name: org.name,
          email: contactEmailOf(org),
          type: org.type,
          industry: org.industry,
          featured: Boolean(org.company?.featured || org.vendor?.featured),
          recommendationCount: visible.length,
          recommendationLimit: roleLimit,
          scoreThreshold: threshold,
          topRecommendations: visible.map((row) => ({
            toOrg: row.toOrg,
            source: row.source,
            totalScore: row.totalScore,
            aiScore: row.aiScore,
            aiDescription: row.aiDescription,
            reasons: row.reasons as string[],
            computedAt: row.computedAt,
          })),
        };
      }),
      scoreThreshold: threshold,
      investorRecommendationLimit: investorLimit,
      innovatorRecommendationLimit: innovatorLimit,
      page,
      pageSize,
      total,
    };
  }

  /**
   * Persisted recommendations stay visible until pruned (threshold/settings,
   * profile edit, or manual remove). Threshold/tag floors gate *adding* new
   * COMPUTED rows, not hiding ones already on the list.
   */
  private filterVisibleRecommendations<
    T extends {
      source: string;
      totalScore: number;
      scoreBreakdown?: unknown;
    },
  >(
    rows: T[],
    _threshold: number,
    _tagCategoryThresholds: TagCategoryThresholds,
  ): T[] {
    return [...rows].sort((a, b) => {
      if (a.source !== b.source) return a.source === 'MANUAL' ? -1 : 1;
      return b.totalScore - a.totalScore;
    });
  }

  async recomputeForOrganization(
    organizationId: string,
    reason = 'manual.recompute',
  ) {
    const pruneMode = pruneModeForReason(reason);
    const started = Date.now();
    const org = await this.prisma.organization.findUnique({
      where: { id: organizationId },
      include: { company: true, vendor: true },
    });
    if (!org || !['COMPANY', 'VENDOR'].includes(org.type)) {
      return { upserted: 0 };
    }

    const eligible =
      (org.type === 'COMPANY' &&
        org.company?.matchingEligible &&
        org.company.approvalStatus === 'VERIFIED') ||
      (org.type === 'VENDOR' &&
        org.vendor?.matchingEligible &&
        org.vendor.approvalStatus === 'VERIFIED' &&
        org.vendor.onboardingComplete);

    if (!eligible) {
      await this.prisma.orgPeerRecommendation.deleteMany({
        where: {
          OR: [{ fromOrgId: organizationId }, { toOrgId: organizationId }],
        },
      });
      return { upserted: 0 };
    }

    if (!this.hasMatchableProfile(org)) {
      this.logger.log(
        `Skip peer recompute for ${organizationId}: profile tags are empty`,
      );
      return { upserted: 0 };
    }

    const [equivalences, tagLabels] = await Promise.all([
      this.filters.listEquivalences(),
      this.filters.listTagLabelIndex(),
    ]);

    const aiEnabled = await this.ai.isEnabled();
    const aiMode = aiEnabled
      ? await this.config.getString('ai.matchmakingMode', 'llm')
      : 'embedding';
    const includeOnboarding = await this.config.getBoolean(
      'ai.includeOnboardingInProfile',
      true,
    );
    const blend = aiEnabled
      ? Math.max(
          0,
          Math.min(
            1,
            await this.config.getNumber('ai.matchmakingBlendWeight', 0.25),
          ),
        )
      : 0;
    const systemPrompt = aiEnabled
      ? await this.config.getString('ai.matchmakingPrompt', '')
      : '';
    const temperature = await this.config.getNumber('ai.javTemperature', 0.2);
    const tagCategoryThresholds = resolveTagCategoryThresholds(
      await this.config.getRaw('ops.tagCategoryThresholds'),
    );
    const matchingWeights = await this.loadMatchingWeights();

    const roleLimit = await this.getRecommendationLimit(
      org.type as 'COMPANY' | 'VENDOR',
    );
    const llmCandidateLimit = Math.min(
      30,
      Math.max(
        roleLimit,
        await this.config.getNumber(
          'ai.peerRecomputeLlmCandidates',
          DEFAULT_PEER_RECOMPUTE_LLM_CANDIDATES,
        ),
      ),
    );
    const llmConcurrency = Math.min(
      10,
      Math.max(
        1,
        await this.config.getNumber(
          'ai.peerRecomputeConcurrency',
          DEFAULT_PEER_RECOMPUTE_CONCURRENCY,
        ),
      ),
    );

    let upserted = 0;

    if (org.type === 'COMPANY' && org.company) {
      const vendors = await this.prisma.vendor.findMany({
        where: {
          matchingEligible: true,
          approvalStatus: 'VERIFIED',
          verificationStatus: 'VERIFIED',
          onboardingComplete: true,
          organizationId: { not: organizationId },
          organization: { status: { not: 'ARCHIVED' } },
        },
        include: { organization: true },
        take: 200,
      });
      const companyFeatures = companyToProfileFeatures({
        organizationId: org.company.organizationId,
        preferredCategories: org.company.preferredCategories,
        requiredCapabilities: org.company.requiredCapabilities,
        commercialPrefs: org.company.commercialPrefs,
        normalizedProfile: org.company.normalizedProfile,
        organization: org,
      });

      const scored = await this.scoreCounterpartsForRecompute({
        fromOrgId: org.id,
        fromProfileVersion: org.company.profileVersion,
        counterparts: vendors.map((vendor) => ({
          toOrgId: vendor.organizationId,
          toProfileVersion: vendor.profileVersion,
          companyFeatures,
          vendorFeatures: vendorToProfileFeatures({
            organizationId: vendor.organizationId,
            capabilities: vendor.capabilities,
            categories: vendor.categories,
            operatingRegions: vendor.operatingRegions,
            commercialPrefs: vendor.commercialPrefs,
            normalizedProfile: vendor.normalizedProfile,
            organization: vendor.organization,
          }),
          companyNorm: org.company!.normalizedProfile,
          vendorNorm: vendor.normalizedProfile,
        })),
        equivalences,
        tagLabels,
        aiEnabled,
        aiMode,
        blend,
        systemPrompt,
        temperature,
        includeOnboarding,
        llmCandidateLimit,
        llmConcurrency,
        skipEmbedding: true,
        matchingWeights,
      });

      upserted += await this.syncComputedRecommendations({
        fromOrgId: org.id,
        perspective: 'COMPANY',
        scored,
        tagCategoryThresholds,
        pruneMode,
      });
    }

    if (org.type === 'VENDOR' && org.vendor) {
      const companies = await this.prisma.company.findMany({
        where: {
          matchingEligible: true,
          approvalStatus: 'VERIFIED',
          verificationStatus: 'VERIFIED',
          organizationId: { not: organizationId },
          organization: { status: { not: 'ARCHIVED' } },
        },
        include: { organization: true },
        take: 200,
      });
      const vendorFeatures = vendorToProfileFeatures({
        organizationId: org.vendor.organizationId,
        capabilities: org.vendor.capabilities,
        categories: org.vendor.categories,
        operatingRegions: org.vendor.operatingRegions,
        commercialPrefs: org.vendor.commercialPrefs,
        normalizedProfile: org.vendor.normalizedProfile,
        organization: org,
      });

      const scored = await this.scoreCounterpartsForRecompute({
        fromOrgId: org.id,
        fromProfileVersion: org.vendor.profileVersion,
        counterparts: companies.map((company) => ({
          toOrgId: company.organizationId,
          toProfileVersion: company.profileVersion,
          companyFeatures: companyToProfileFeatures({
            organizationId: company.organizationId,
            preferredCategories: company.preferredCategories,
            requiredCapabilities: company.requiredCapabilities,
            commercialPrefs: company.commercialPrefs,
            normalizedProfile: company.normalizedProfile,
            organization: company.organization,
          }),
          vendorFeatures,
          companyNorm: company.normalizedProfile,
          vendorNorm: org.vendor!.normalizedProfile,
        })),
        equivalences,
        tagLabels,
        aiEnabled,
        aiMode,
        blend,
        systemPrompt,
        temperature,
        includeOnboarding,
        llmCandidateLimit,
        llmConcurrency,
        skipEmbedding: true,
        matchingWeights,
      });

      upserted += await this.syncComputedRecommendations({
        fromOrgId: org.id,
        perspective: 'VENDOR',
        scored,
        tagCategoryThresholds,
        pruneMode,
      });
    }

    await this.markComputed(organizationId);

    const durationMs = Date.now() - started;
    this.logger.log(
      `Peer recompute for ${organizationId}: upserted ${upserted}, ${durationMs}ms (LLM on top ${llmCandidateLimit} at concurrency ${llmConcurrency})`,
    );
    return { upserted, durationMs, llmCandidateLimit, llmConcurrency };
  }

  private hasMatchableProfile(org: {
    company: {
      preferredCategories: string[];
      requiredCapabilities: string[];
    } | null;
    vendor: { categories: string[]; capabilities: string[] } | null;
  }) {
    const companyTags =
      (org.company?.preferredCategories.length ?? 0) +
      (org.company?.requiredCapabilities.length ?? 0);
    const vendorTags =
      (org.vendor?.categories.length ?? 0) +
      (org.vendor?.capabilities.length ?? 0);
    return companyTags > 0 || vendorTags > 0;
  }

  private attrsRecord(value: unknown): Record<string, unknown> {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
    return { ...(value as Record<string, unknown>) };
  }

  private async markComputed(organizationId: string) {
    const org = await this.prisma.organization.findUnique({
      where: { id: organizationId },
      select: {
        customAttrs: true,
        company: { select: { profileVersion: true } },
        vendor: { select: { profileVersion: true } },
      },
    });
    const profileVersion =
      org?.company?.profileVersion ?? org?.vendor?.profileVersion ?? 0;
    await this.prisma.organization.update({
      where: { id: organizationId },
      data: {
        customAttrs: {
          ...this.attrsRecord(org?.customAttrs),
          peerRecsComputedAt: new Date().toISOString(),
          peerRecsProfileVersion: profileVersion,
        },
      },
    });
  }

  async hasFreshComputation(organizationId: string): Promise<boolean> {
    const org = await this.prisma.organization.findUnique({
      where: { id: organizationId },
      select: {
        customAttrs: true,
        company: { select: { updatedAt: true, profileVersion: true } },
        vendor: { select: { updatedAt: true, profileVersion: true } },
      },
    });
    if (!org) return false;
    const attrs = this.attrsRecord(org.customAttrs);
    const currentVersion =
      org.company?.profileVersion ?? org.vendor?.profileVersion ?? 0;
    const stampedVersion = Number(attrs.peerRecsProfileVersion);
    // Prefer profileVersion — ignores unrelated updatedAt bumps that used to
    // retrigger recompute and wipe/rebuild the feed.
    if (Number.isFinite(stampedVersion) && stampedVersion === currentVersion) {
      return true;
    }
    const raw = attrs.peerRecsComputedAt;
    if (typeof raw !== 'string' || !raw) return false;
    const computedAt = new Date(raw).getTime();
    if (!Number.isFinite(computedAt)) return false;
    const profileUpdated = Math.max(
      org.company?.updatedAt.getTime() ?? 0,
      org.vendor?.updatedAt.getTime() ?? 0,
    );
    // Legacy stamp fallback (pre profileVersion marker).
    return computedAt + 2000 >= profileUpdated;
  }

  /**
   * Rule-score every counterpart (fast), then LLM-score only the top candidates
   * (plus any admin MANUAL pins) in parallel — we only persist 5 recommendations.
   */
  private async loadMatchingWeights(): Promise<MatchingWeights> {
    const rule = await this.prisma.matchingRule.findUnique({
      where: { code: 'DEFAULT' },
      include: {
        versions: { orderBy: { version: 'desc' }, take: 1 },
      },
    });
    return resolveMatchingWeights(
      rule?.versions[0]?.weights ?? defaultMatchingWeights,
    );
  }

  private async scoreCounterpartsForRecompute(input: {
    fromOrgId: string;
    fromProfileVersion: number;
    counterparts: Array<{
      toOrgId: string;
      toProfileVersion: number;
      companyFeatures: ProfileFeatures;
      vendorFeatures: ProfileFeatures;
      companyNorm: unknown;
      vendorNorm: unknown;
    }>;
    equivalences: Array<{ from: string; to: string; bidirectional: boolean }>;
    tagLabels: Record<string, string>;
    aiEnabled: boolean;
    aiMode: string;
    blend: number;
    systemPrompt: string;
    temperature: number;
    includeOnboarding: boolean;
    llmCandidateLimit: number;
    llmConcurrency: number;
    skipEmbedding?: boolean;
    matchingWeights: MatchingWeights;
  }) {
    type ScoredRow = {
      toOrgId: string;
      fromProfileVersion: number;
      toProfileVersion: number;
      matchedChallengeTags: string[];
      pair: {
        ruleScore: number;
        aiScore: number | null;
        totalScore: number;
        reasons: string[];
        aiDescription: string | null;
        scoreBreakdown: Record<string, number | string>;
      };
    };

    if (input.counterparts.length === 0) return [] as ScoredRow[];

    const ruleRanked = input.counterparts
      .map((row) => {
        const rule = calculateMatchScore(
          row.companyFeatures,
          row.vendorFeatures,
          input.matchingWeights,
          input.equivalences,
          input.tagLabels,
        );
        return { ...row, ruleTotal: rule.totalScore };
      })
      .sort((a, b) => b.ruleTotal - a.ruleTotal);

    const manualRows = await this.prisma.orgPeerRecommendation.findMany({
      where: { fromOrgId: input.fromOrgId, source: 'MANUAL' },
      select: { toOrgId: true },
    });
    const llmTargetIds = new Set(manualRows.map((row) => row.toOrgId));
    for (const row of ruleRanked.slice(0, input.llmCandidateLimit)) {
      llmTargetIds.add(row.toOrgId);
    }

    const useAiGlobally = input.aiEnabled && input.blend > 0;

    return mapWithConcurrency(
      ruleRanked,
      input.llmConcurrency,
      async (row): Promise<ScoredRow> => {
        const runLlm = useAiGlobally && llmTargetIds.has(row.toOrgId);
        const pair = await this.scorePair({
          companyFeatures: row.companyFeatures,
          vendorFeatures: row.vendorFeatures,
          companyNorm: row.companyNorm,
          vendorNorm: row.vendorNorm,
          equivalences: input.equivalences,
          tagLabels: input.tagLabels,
          aiEnabled: runLlm,
          aiMode: input.aiMode,
          blend: input.blend,
          systemPrompt: input.systemPrompt,
          temperature: input.temperature,
          includeOnboarding: input.includeOnboarding,
          skipEmbedding: input.skipEmbedding,
          matchingWeights: input.matchingWeights,
        });
        return {
          toOrgId: row.toOrgId,
          fromProfileVersion: input.fromProfileVersion,
          toProfileVersion: row.toProfileVersion,
          matchedChallengeTags: pair.matchedChallengeTags,
          pair,
        };
      },
    );
  }

  private async scorePair(input: {
    companyFeatures: ProfileFeatures;
    vendorFeatures: ProfileFeatures;
    companyNorm: unknown;
    vendorNorm: unknown;
    equivalences: Array<{ from: string; to: string; bidirectional: boolean }>;
    tagLabels: Record<string, string>;
    aiEnabled: boolean;
    aiMode: string;
    blend: number;
    systemPrompt: string;
    temperature: number;
    includeOnboarding: boolean;
    /** Skip embedding calls during bulk recompute (LLM-only is much faster). */
    skipEmbedding?: boolean;
    matchingWeights?: MatchingWeights;
  }) {
    const score = calculateMatchScore(
      input.companyFeatures,
      input.vendorFeatures,
      input.matchingWeights ?? defaultMatchingWeights,
      input.equivalences,
      input.tagLabels,
    );

    const cards = buildMatchmakingPairCards({
      company: input.companyFeatures,
      vendor: input.vendorFeatures,
      tagLabels: input.tagLabels,
      companyNormalized: input.companyNorm,
      vendorNormalized: input.vendorNorm,
      includeOnboardingResponses: input.includeOnboarding,
    });
    const left = cards.investor;
    const right = cards.innovator;

    let aiScore: number | null = null;
    let aiDescription: string | null =
      score.reasons.length > 0 ? score.reasons.join(' · ') : null;
    const breakdown: Record<string, number | string> = {
      ...score.breakdown,
    };

    let aiReasons: string[] | undefined;

    if (input.aiEnabled && input.blend > 0) {
      const wantsEmbedding =
        !input.skipEmbedding &&
        (input.aiMode === 'embedding' || input.aiMode === 'hybrid');
      const wantsLlm = input.aiMode === 'llm' || input.aiMode === 'hybrid';

      let embedding01: number | null = null;
      let llm01: number | null = null;
      let rationale: string | undefined;

      if (wantsEmbedding) {
        embedding01 = await this.ai.semanticSimilarity({ left, right });
      }
      if (wantsLlm) {
        const pair = await this.ai.pairMatchScore({
          left,
          right,
          systemPrompt: input.systemPrompt || undefined,
          temperature: input.temperature,
          preferenceFit: formatPreferenceFitForPrompt({
            challenge: score.breakdown.challenge,
            solution: score.breakdown.solution,
            geography: score.breakdown.geography,
            commercial: score.breakdown.commercial,
            stage: score.breakdown.stage,
            ticket: score.breakdown.ticket,
            ruleScore: score.totalScore,
            matchedChallengeTags: score.matchedChallengeTags,
          }),
        });
        if (pair) {
          llm01 = pair.score;
          rationale = pair.rationale;
          aiReasons = pair.reasons;
        }
      }

      let semantic01: number;
      if (embedding01 != null && llm01 != null) {
        semantic01 = (embedding01 + llm01) / 2;
      } else if (llm01 != null) {
        semantic01 = llm01;
      } else if (embedding01 != null) {
        semantic01 = embedding01;
      } else {
        semantic01 = localTextSimilarity(left, right);
      }

      aiScore = Math.round(semantic01 * 10000) / 100;
      breakdown.aiSemantic = aiScore;
      if (embedding01 != null) {
        breakdown.aiEmbedding = Math.round(embedding01 * 10000) / 100;
      }
      if (llm01 != null) {
        breakdown.aiLlm = Math.round(llm01 * 10000) / 100;
      }
      breakdown.aiBlendWeight = input.blend;

      if (rationale?.trim()) {
        aiDescription = rationale.trim();
      } else if (score.reasons.length) {
        aiDescription = score.reasons.join(' · ');
      } else {
        aiDescription = `AI compatibility ${aiScore.toFixed(0)}/100`;
      }
    }

    const storedReasons =
      aiReasons?.length && aiReasons.length > 0
        ? aiReasons
        : aiDescription
          ? [aiDescription]
          : score.reasons;

    const totalScore =
      aiScore != null && input.blend > 0
        ? blendPreferenceAwareScore({
            ruleScore: score.totalScore,
            aiScore,
            blend: input.blend,
            challenge: score.breakdown.challenge,
            geography: score.breakdown.geography,
            stage: score.breakdown.stage,
          })
        : score.totalScore;

    if (aiScore != null && input.blend > 0) {
      breakdown.preferenceAwareTotal = totalScore;
    }

    return {
      ruleScore: score.totalScore,
      aiScore,
      totalScore,
      reasons: storedReasons,
      aiDescription,
      scoreBreakdown: breakdown,
      matchedChallengeTags: score.matchedChallengeTags,
    };
  }

  private async enforceMaxPerOrg(
    fromOrgId: string,
    perspective?: 'COMPANY' | 'VENDOR',
  ) {
    const orgType =
      perspective ??
      (
        await this.prisma.organization.findUnique({
          where: { id: fromOrgId },
          select: { type: true },
        })
      )?.type;
    const max = await this.getRecommendationLimit(
      orgType === 'VENDOR' ? 'VENDOR' : 'COMPANY',
    );
    const [rows, dismissals] = await Promise.all([
      this.prisma.orgPeerRecommendation.findMany({
        where: { fromOrgId },
        select: { id: true, toOrgId: true, source: true, totalScore: true },
      }),
      this.prisma.orgPeerRecommendationDismissal.findMany({
        where: { fromOrgId },
        select: { toOrgId: true },
      }),
    ]);
    const dismissedToIds = new Set(dismissals.map((row) => row.toOrgId));
    // Dismissed peers do not count toward the active role ceiling.
    const active = rows.filter((row) => !dismissedToIds.has(row.toOrgId));
    active.sort((a, b) => {
      if (a.source !== b.source) {
        return a.source === 'MANUAL' ? -1 : 1;
      }
      return b.totalScore - a.totalScore;
    });
    const excess = active.slice(max);
    if (!excess.length) return;
    await this.prisma.orgPeerRecommendation.deleteMany({
      where: { id: { in: excess.map((row) => row.id) } },
    });
  }

  private async getRecommendationThreshold(): Promise<number> {
    const raw = await this.config.getNumber(
      'ops.recommendationScoreThreshold',
      75,
    );
    if (!Number.isFinite(raw)) return 75;
    return Math.max(0, Math.min(100, raw));
  }

  async getRecommendationLimit(
    perspective: 'COMPANY' | 'VENDOR',
  ): Promise<number> {
    if (perspective === 'COMPANY') {
      return clampRecommendationLimit(
        await this.config.getNumber(
          'ops.investorRecommendationLimit',
          DEFAULT_INVESTOR_RECOMMENDATION_LIMIT,
        ),
        DEFAULT_INVESTOR_RECOMMENDATION_LIMIT,
      );
    }
    return clampRecommendationLimit(
      await this.config.getNumber(
        'ops.innovatorRecommendationLimit',
        DEFAULT_INNOVATOR_RECOMMENDATION_LIMIT,
      ),
      DEFAULT_INNOVATOR_RECOMMENDATION_LIMIT,
    );
  }

  private async syncComputedRecommendations(input: {
    fromOrgId: string;
    perspective: 'COMPANY' | 'VENDOR';
    tagCategoryThresholds: TagCategoryThresholds;
    pruneMode: PeerRecPruneMode;
    scored: Array<{
      toOrgId: string;
      fromProfileVersion: number;
      toProfileVersion: number;
      matchedChallengeTags?: string[];
      pair: {
        ruleScore: number;
        aiScore: number | null;
        totalScore: number;
        reasons: string[];
        aiDescription: string | null;
        scoreBreakdown: Record<string, number | string>;
      };
    }>;
  }) {
    const threshold = await this.getRecommendationThreshold();
    const roleLimit = await this.getRecommendationLimit(input.perspective);
    const [manual, dismissals, existingComputed] = await Promise.all([
      this.prisma.orgPeerRecommendation.findMany({
        where: { fromOrgId: input.fromOrgId, source: 'MANUAL' },
        select: { toOrgId: true },
      }),
      this.prisma.orgPeerRecommendationDismissal.findMany({
        where: { fromOrgId: input.fromOrgId },
        select: { toOrgId: true },
      }),
      this.prisma.orgPeerRecommendation.findMany({
        where: { fromOrgId: input.fromOrgId, source: 'COMPUTED' },
        select: { toOrgId: true },
      }),
    ]);
    const manualToIds = new Set(manual.map((row) => row.toOrgId));
    const dismissedToIds = new Set(dismissals.map((row) => row.toOrgId));
    const existingToIds = new Set(existingComputed.map((row) => row.toOrgId));
    const scoredByTo = new Map(input.scored.map((row) => [row.toOrgId, row]));

    const passesGates = (row: (typeof input.scored)[number]) => {
      if (row.pair.totalScore < threshold) return false;
      return meetsTagCategoryThresholds(
        row.pair.scoreBreakdown,
        input.tagCategoryThresholds,
      ).ok;
    };

    // Active/manual slots for the role ceiling. Dismissed peers stay stored for
    // the portal "Not interested" section but do not consume active slots.
    const activeKeepToIds = new Set<string>([...manualToIds]);
    const dismissedKeepToIds = new Set<string>();
    const now = new Date();
    let upserted = 0;

    // 1) Refresh sticky existing COMPUTED rows. Dismissed rows are preserved
    //    (not refreshed into active slots). Reevaluate may drop failing actives.
    for (const toOrgId of existingToIds) {
      if (manualToIds.has(toOrgId)) {
        continue;
      }
      if (dismissedToIds.has(toOrgId)) {
        dismissedKeepToIds.add(toOrgId);
        continue;
      }
      const fresh = scoredByTo.get(toOrgId);
      if (!fresh) {
        continue;
      }
      const passes = passesGates(fresh);
      if (!passes && input.pruneMode === 'reevaluate') {
        continue;
      }
      await this.upsertComputedIfNotManual({
        fromOrgId: input.fromOrgId,
        toOrgId,
        perspective: input.perspective,
        fromProfileVersion: fresh.fromProfileVersion,
        toProfileVersion: fresh.toProfileVersion,
        dataBase: {
          source: 'COMPUTED',
          ruleScore: fresh.pair.ruleScore,
          aiScore: fresh.pair.aiScore,
          totalScore: fresh.pair.totalScore,
          reasons: fresh.pair.reasons,
          aiDescription: fresh.pair.aiDescription,
          scoreBreakdown: fresh.pair.scoreBreakdown as Prisma.InputJsonValue,
          computedAt: now,
        },
      });
      activeKeepToIds.add(toOrgId);
      upserted += 1;
    }

    // 2) Fill free slots with new high-scoring matches (diversity among newcomers only).
    const freeSlots = Math.max(0, roleLimit - activeKeepToIds.size);
    const newcomers = [...input.scored]
      .sort((a, b) => b.pair.totalScore - a.pair.totalScore)
      .filter((row) => {
        if (activeKeepToIds.has(row.toOrgId)) return false;
        if (manualToIds.has(row.toOrgId)) return false;
        if (dismissedToIds.has(row.toOrgId)) return false;
        if (dismissedKeepToIds.has(row.toOrgId)) return false;
        return passesGates(row);
      });
    const topNew = selectDiverseTop(
      newcomers,
      freeSlots,
      (row) => row.matchedChallengeTags?.[0] ?? row.toOrgId,
      2,
    );
    for (const row of topNew) {
      await this.upsertComputedIfNotManual({
        fromOrgId: input.fromOrgId,
        toOrgId: row.toOrgId,
        perspective: input.perspective,
        fromProfileVersion: row.fromProfileVersion,
        toProfileVersion: row.toProfileVersion,
        dataBase: {
          source: 'COMPUTED',
          ruleScore: row.pair.ruleScore,
          aiScore: row.pair.aiScore,
          totalScore: row.pair.totalScore,
          reasons: row.pair.reasons,
          aiDescription: row.pair.aiDescription,
          scoreBreakdown: row.pair.scoreBreakdown as Prisma.InputJsonValue,
          computedAt: now,
        },
      });
      activeKeepToIds.add(row.toOrgId);
      upserted += 1;
    }

    const keepToIds = new Set<string>([
      ...activeKeepToIds,
      ...dismissedKeepToIds,
    ]);

    // 3) Prune COMPUTED rows that are no longer kept (gone peers or reevaluate
    //    failures). Sticky refresh never drops a still-scored peer just because
    //    diversity preferred someone else. Dismissed peers stay for the feed.
    if (keepToIds.size === 0) {
      await this.prisma.orgPeerRecommendation.deleteMany({
        where: { fromOrgId: input.fromOrgId, source: 'COMPUTED' },
      });
    } else {
      await this.prisma.orgPeerRecommendation.deleteMany({
        where: {
          fromOrgId: input.fromOrgId,
          source: 'COMPUTED',
          toOrgId: { notIn: [...keepToIds] },
        },
      });
    }

    await this.enforceMaxPerOrg(input.fromOrgId, input.perspective);
    return upserted;
  }

  private async upsertBothDirections(input: {
    companyOrgId: string;
    vendorOrgId: string;
    companyProfileVersion: number;
    vendorProfileVersion: number;
    pair: {
      ruleScore: number;
      aiScore: number | null;
      totalScore: number;
      reasons: string[];
      aiDescription: string | null;
      scoreBreakdown: Record<string, number | string>;
    };
  }) {
    const now = new Date();
    const dataBase = {
      source: 'COMPUTED' as const,
      ruleScore: input.pair.ruleScore,
      aiScore: input.pair.aiScore,
      totalScore: input.pair.totalScore,
      reasons: input.pair.reasons,
      aiDescription: input.pair.aiDescription,
      scoreBreakdown: input.pair.scoreBreakdown as Prisma.InputJsonValue,
      computedAt: now,
    };

    await this.upsertComputedIfNotManual({
      fromOrgId: input.companyOrgId,
      toOrgId: input.vendorOrgId,
      perspective: 'COMPANY',
      fromProfileVersion: input.companyProfileVersion,
      toProfileVersion: input.vendorProfileVersion,
      dataBase,
    });

    await this.upsertComputedIfNotManual({
      fromOrgId: input.vendorOrgId,
      toOrgId: input.companyOrgId,
      perspective: 'VENDOR',
      fromProfileVersion: input.vendorProfileVersion,
      toProfileVersion: input.companyProfileVersion,
      dataBase,
    });
  }

  /** Never overwrite an admin MANUAL pin with engine scores. */
  private async upsertComputedIfNotManual(input: {
    fromOrgId: string;
    toOrgId: string;
    perspective: 'COMPANY' | 'VENDOR';
    fromProfileVersion: number;
    toProfileVersion: number;
    dataBase: {
      source: 'COMPUTED';
      ruleScore: number;
      aiScore: number | null;
      totalScore: number;
      reasons: string[];
      aiDescription: string | null;
      scoreBreakdown: Prisma.InputJsonValue;
      computedAt: Date;
    };
  }) {
    const existing = await this.prisma.orgPeerRecommendation.findUnique({
      where: {
        fromOrgId_toOrgId: {
          fromOrgId: input.fromOrgId,
          toOrgId: input.toOrgId,
        },
      },
      select: { id: true, source: true },
    });
    if (existing?.source === 'MANUAL') return;

    await this.prisma.orgPeerRecommendation.upsert({
      where: {
        fromOrgId_toOrgId: {
          fromOrgId: input.fromOrgId,
          toOrgId: input.toOrgId,
        },
      },
      create: {
        fromOrgId: input.fromOrgId,
        toOrgId: input.toOrgId,
        perspective: input.perspective,
        fromProfileVersion: input.fromProfileVersion,
        toProfileVersion: input.toProfileVersion,
        ...input.dataBase,
      },
      update: {
        ...input.dataBase,
        fromProfileVersion: input.fromProfileVersion,
        toProfileVersion: input.toProfileVersion,
      },
    });
  }

}
