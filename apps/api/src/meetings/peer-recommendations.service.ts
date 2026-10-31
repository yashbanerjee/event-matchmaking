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
  defaultMatchingWeights,
  PEER_RECOMMENDATIONS_MAX_PER_ORG,
} from '@em/shared';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { FiltersService } from '../filters/filters.service';
import { AiService } from '../integrations/ai/ai.service';
import { EffectiveConfigService } from '../settings/effective-config.service';
import { buildMatchmakingPairCards } from '../integrations/ai/profile-narrative';
import type { AuthUser } from '../common/decorators';
import { AuditService } from '../audit/audit.service';

const DEFAULT_PEER_RECOMPUTE_LLM_CANDIDATES = 12;
const DEFAULT_PEER_RECOMPUTE_CONCURRENCY = 5;

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

  constructor(
    private readonly prisma: PrismaService,
    private readonly filters: FiltersService,
    private readonly ai: AiService,
    private readonly config: EffectiveConfigService,
    private readonly audit: AuditService,
  ) {}

  /**
   * Fire-and-forget recompute for a newly eligible investor/innovator.
   * Scores this org against all opposite peers (both directions).
   */
  scheduleRecompute(organizationId: string, reason = 'eligibility') {
    if (this.inflight.has(organizationId)) return;
    this.inflight.add(organizationId);
    void this.recomputeForOrganization(organizationId)
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
      .finally(() => this.inflight.delete(organizationId));
  }

  async listForOrganization(
    organizationId: string,
    limit = PEER_RECOMMENDATIONS_MAX_PER_ORG,
  ) {
    const org = await this.prisma.organization.findUnique({
      where: { id: organizationId },
      select: { id: true, name: true, type: true },
    });
    if (!org) throw new NotFoundException('Organization not found');

    const max = Math.min(Math.max(limit, 1), PEER_RECOMMENDATIONS_MAX_PER_ORG);
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
      take: max,
    });

    // Admin pins first, then by score
    items.sort((a, b) => {
      if (a.source !== b.source) return a.source === 'MANUAL' ? -1 : 1;
      return b.totalScore - a.totalScore;
    });

    return {
      organization: org,
      counterpartLabel: org.type === 'COMPANY' ? 'innovators' : 'investors',
      items: items.map((row) => ({
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
      total: items.length,
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
            ...(q
              ? { name: { contains: q, mode: 'insensitive' as const } }
              : {}),
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
        items: vendors.map((v) => v.organization),
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
          ...(q
            ? { name: { contains: q, mode: 'insensitive' as const } }
            : {}),
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
      items: companies.map((c) => c.organization),
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
    const currentCount = await this.prisma.orgPeerRecommendation.count({
      where: { fromOrgId },
    });
    if (!existingPair && currentCount >= PEER_RECOMMENDATIONS_MAX_PER_ORG) {
      throw new BadRequestException(
        `Maximum ${PEER_RECOMMENDATIONS_MAX_PER_ORG} recommendations per organization. Remove one before adding.`,
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

    await this.enforceMaxPerOrg(fromOrgId);

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
    const where: Prisma.OrganizationWhereInput = {
      status: { not: 'ARCHIVED' },
      type: input.type ? input.type : { in: ['COMPANY', 'VENDOR'] },
      ...(input.q?.trim()
        ? {
            name: {
              contains: input.q.trim(),
              mode: 'insensitive' as const,
            },
          }
        : {}),
      AND: [
        {
          OR: [
            { company: { matchingEligible: true } },
            { vendor: { matchingEligible: true } },
          ],
        },
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
          company: { select: { matchingEligible: true, featured: true } },
          vendor: { select: { matchingEligible: true, featured: true } },
          peerRecommendationsFrom: {
            orderBy: { totalScore: 'desc' },
            take: PEER_RECOMMENDATIONS_MAX_PER_ORG,
            include: {
              toOrg: {
                select: { id: true, name: true, type: true, industry: true },
              },
            },
          },
          _count: {
            select: { peerRecommendationsFrom: true },
          },
        },
      }),
    ]);

    return {
      items: orgs.map((org) => ({
        organizationId: org.id,
        name: org.name,
        type: org.type,
        industry: org.industry,
        featured: Boolean(org.company?.featured || org.vendor?.featured),
        recommendationCount: org._count.peerRecommendationsFrom,
        topRecommendations: org.peerRecommendationsFrom.map((row) => ({
          toOrg: row.toOrg,
          source: row.source,
          totalScore: row.totalScore,
          aiScore: row.aiScore,
          aiDescription: row.aiDescription,
          reasons: row.reasons as string[],
          computedAt: row.computedAt,
        })),
      })),
      page,
      pageSize,
      total,
    };
  }

  async recomputeForOrganization(organizationId: string) {
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
            await this.config.getNumber('ai.matchmakingBlendWeight', 0.3),
          ),
        )
      : 0;
    const systemPrompt = aiEnabled
      ? await this.config.getString('ai.matchmakingPrompt', '')
      : '';
    const temperature = await this.config.getNumber('ai.javTemperature', 0.2);

    const llmCandidateLimit = Math.min(
      30,
      Math.max(
        PEER_RECOMMENDATIONS_MAX_PER_ORG,
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
      });

      upserted += await this.syncComputedRecommendations({
        fromOrgId: org.id,
        perspective: 'COMPANY',
        scored,
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
      });

      upserted += await this.syncComputedRecommendations({
        fromOrgId: org.id,
        perspective: 'VENDOR',
        scored,
      });
    }

    const durationMs = Date.now() - started;
    this.logger.log(
      `Peer recompute for ${organizationId}: upserted ${upserted}, ${durationMs}ms (LLM on top ${llmCandidateLimit} at concurrency ${llmConcurrency})`,
    );
    return { upserted, durationMs, llmCandidateLimit, llmConcurrency };
  }

  /**
   * Rule-score every counterpart (fast), then LLM-score only the top candidates
   * (plus any admin MANUAL pins) in parallel — we only persist 5 recommendations.
   */
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
          defaultMatchingWeights,
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
  }) {
    const score = calculateMatchScore(
      input.companyFeatures,
      input.vendorFeatures,
      defaultMatchingWeights,
      input.equivalences,
      input.tagLabels,
    );

    void input.companyNorm;
    void input.vendorNorm;
    void input.includeOnboarding;
    const cards = buildMatchmakingPairCards({
      company: input.companyFeatures,
      vendor: input.vendorFeatures,
      tagLabels: input.tagLabels,
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
        ? Math.round(
            (score.totalScore * (1 - input.blend) + aiScore * input.blend) *
              100,
          ) / 100
        : score.totalScore;

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

  private async enforceMaxPerOrg(fromOrgId: string) {
    const rows = await this.prisma.orgPeerRecommendation.findMany({
      where: { fromOrgId },
      select: { id: true, source: true, totalScore: true },
    });
    rows.sort((a, b) => {
      if (a.source !== b.source) {
        return a.source === 'MANUAL' ? -1 : 1;
      }
      return b.totalScore - a.totalScore;
    });
    const excess = rows.slice(PEER_RECOMMENDATIONS_MAX_PER_ORG);
    if (!excess.length) return;
    await this.prisma.orgPeerRecommendation.deleteMany({
      where: { id: { in: excess.map((row) => row.id) } },
    });
  }

  private async syncComputedRecommendations(input: {
    fromOrgId: string;
    perspective: 'COMPANY' | 'VENDOR';
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
    const manual = await this.prisma.orgPeerRecommendation.findMany({
      where: { fromOrgId: input.fromOrgId, source: 'MANUAL' },
      select: { toOrgId: true },
    });
    const manualToIds = new Set(manual.map((row) => row.toOrgId));
    const computedSlots = Math.max(
      0,
      PEER_RECOMMENDATIONS_MAX_PER_ORG - manualToIds.size,
    );

    const rankedComputed = [...input.scored]
      .sort((a, b) => b.pair.totalScore - a.pair.totalScore)
      .filter((row) => !manualToIds.has(row.toOrgId));
    const topComputed = selectDiverseTop(
      rankedComputed,
      computedSlots,
      (row) => row.matchedChallengeTags?.[0] ?? row.toOrgId,
      2,
    );
    const keepToIds = new Set([
      ...manualToIds,
      ...topComputed.map((row) => row.toOrgId),
    ]);

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

    const now = new Date();
    for (const row of topComputed) {
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
    }

    await this.enforceMaxPerOrg(input.fromOrgId);
    return topComputed.length;
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
