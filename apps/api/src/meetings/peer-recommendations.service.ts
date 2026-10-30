import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import {
  calculateMatchScore,
  type ProfileFeatures,
} from '@em/domain';
import { defaultMatchingWeights } from '@em/shared';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { FiltersService } from '../filters/filters.service';
import { AiService } from '../integrations/ai/ai.service';
import { EffectiveConfigService } from '../settings/effective-config.service';
import { DEFAULT_MATCHMAKING_PROMPT } from '../integrations/ai/matchmaking-prompt';

function profileNarrative(
  features: ProfileFeatures,
  extras?: { about?: string; focusEvents?: string },
): string {
  return [
    extras?.about,
    extras?.focusEvents,
    features.industry,
    features.preferredCategories.join(' '),
    features.categories.join(' '),
    features.capabilities.join(' '),
    features.requirements.join(' '),
    features.regions.join(' '),
    features.commercialTags.join(' '),
  ]
    .filter(Boolean)
    .join('\n');
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
  ) {}

  /**
   * Fire-and-forget recompute for a newly eligible client/guest.
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

  async listForOrganization(organizationId: string, limit = 50) {
    const org = await this.prisma.organization.findUnique({
      where: { id: organizationId },
      select: { id: true, name: true, type: true },
    });
    if (!org) throw new NotFoundException('Organization not found');

    const max = Math.min(Math.max(limit, 1), 100);
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

    return {
      organization: org,
      items: items.map((row) => ({
        id: row.id,
        toOrg: row.toOrg,
        perspective: row.perspective,
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
            take: 5,
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
          totalScore: row.totalScore,
          aiScore: row.aiScore,
          aiDescription: row.aiDescription,
          reasons: row.reasons,
          computedAt: row.computedAt,
        })),
      })),
      page,
      pageSize,
      total,
    };
  }

  async recomputeForOrganization(organizationId: string) {
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
      ? await this.config.getString('ai.matchmakingMode', 'embedding')
      : 'embedding';
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
      const companyFeatures = this.toCompanyFeatures(org.company, org);

      for (const vendor of vendors) {
        const vendorFeatures = this.toVendorFeatures(
          vendor,
          vendor.organization,
        );
        const pair = await this.scorePair({
          companyFeatures,
          vendorFeatures,
          companyNorm: org.company.normalizedProfile,
          vendorNorm: vendor.normalizedProfile,
          equivalences,
          tagLabels,
          aiEnabled,
          aiMode,
          blend,
          systemPrompt,
          temperature,
        });

        await this.upsertBothDirections({
          companyOrgId: org.id,
          vendorOrgId: vendor.organizationId,
          companyProfileVersion: org.company.profileVersion,
          vendorProfileVersion: vendor.profileVersion,
          pair,
        });
        upserted += 2;
      }

      // Drop stale outbound rows for counterparts no longer eligible
      const keepIds = vendors.map((v) => v.organizationId);
      await this.prisma.orgPeerRecommendation.deleteMany({
        where: {
          fromOrgId: org.id,
          ...(keepIds.length ? { toOrgId: { notIn: keepIds } } : {}),
        },
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
      const vendorFeatures = this.toVendorFeatures(org.vendor, org);

      for (const company of companies) {
        const companyFeatures = this.toCompanyFeatures(
          company,
          company.organization,
        );
        const pair = await this.scorePair({
          companyFeatures,
          vendorFeatures,
          companyNorm: company.normalizedProfile,
          vendorNorm: org.vendor.normalizedProfile,
          equivalences,
          tagLabels,
          aiEnabled,
          aiMode,
          blend,
          systemPrompt,
          temperature,
        });

        await this.upsertBothDirections({
          companyOrgId: company.organizationId,
          vendorOrgId: org.id,
          companyProfileVersion: company.profileVersion,
          vendorProfileVersion: org.vendor.profileVersion,
          pair,
        });
        upserted += 2;
      }

      const keepIds = companies.map((c) => c.organizationId);
      await this.prisma.orgPeerRecommendation.deleteMany({
        where: {
          fromOrgId: org.id,
          ...(keepIds.length ? { toOrgId: { notIn: keepIds } } : {}),
        },
      });
    }

    return { upserted };
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
  }) {
    const score = calculateMatchScore(
      input.companyFeatures,
      input.vendorFeatures,
      defaultMatchingWeights,
      input.equivalences,
      input.tagLabels,
    );

    const companyNorm = (input.companyNorm ?? {}) as Record<string, unknown>;
    const vendorNorm = (input.vendorNorm ?? {}) as Record<string, unknown>;
    const left = profileNarrative(input.companyFeatures, {
      about:
        typeof companyNorm.about === 'string' ? companyNorm.about : undefined,
      focusEvents:
        typeof companyNorm.focusEvents === 'string'
          ? companyNorm.focusEvents
          : undefined,
    });
    const right = profileNarrative(input.vendorFeatures, {
      about:
        typeof vendorNorm.about === 'string' ? vendorNorm.about : undefined,
      focusEvents:
        typeof vendorNorm.focusEvents === 'string'
          ? vendorNorm.focusEvents
          : undefined,
    });

    let aiScore: number | null = null;
    let aiDescription: string | null =
      score.reasons.length > 0 ? score.reasons.join(' · ') : null;
    const breakdown: Record<string, number | string> = {
      ...score.breakdown,
    };

    if (input.aiEnabled && input.blend > 0) {
      const wantsEmbedding =
        input.aiMode === 'embedding' || input.aiMode === 'hybrid';
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
          systemPrompt: input.systemPrompt || DEFAULT_MATCHMAKING_PROMPT,
          temperature: input.temperature,
        });
        if (pair) {
          llm01 = pair.score;
          rationale = pair.rationale;
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
      reasons: score.reasons,
      aiDescription,
      scoreBreakdown: breakdown,
    };
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
      ruleScore: input.pair.ruleScore,
      aiScore: input.pair.aiScore,
      totalScore: input.pair.totalScore,
      reasons: input.pair.reasons,
      aiDescription: input.pair.aiDescription,
      scoreBreakdown: input.pair.scoreBreakdown as Prisma.InputJsonValue,
      computedAt: now,
    };

    await this.prisma.orgPeerRecommendation.upsert({
      where: {
        fromOrgId_toOrgId: {
          fromOrgId: input.companyOrgId,
          toOrgId: input.vendorOrgId,
        },
      },
      create: {
        fromOrgId: input.companyOrgId,
        toOrgId: input.vendorOrgId,
        perspective: 'COMPANY',
        fromProfileVersion: input.companyProfileVersion,
        toProfileVersion: input.vendorProfileVersion,
        ...dataBase,
      },
      update: {
        ...dataBase,
        fromProfileVersion: input.companyProfileVersion,
        toProfileVersion: input.vendorProfileVersion,
      },
    });

    await this.prisma.orgPeerRecommendation.upsert({
      where: {
        fromOrgId_toOrgId: {
          fromOrgId: input.vendorOrgId,
          toOrgId: input.companyOrgId,
        },
      },
      create: {
        fromOrgId: input.vendorOrgId,
        toOrgId: input.companyOrgId,
        perspective: 'VENDOR',
        fromProfileVersion: input.vendorProfileVersion,
        toProfileVersion: input.companyProfileVersion,
        ...dataBase,
      },
      update: {
        ...dataBase,
        fromProfileVersion: input.vendorProfileVersion,
        toProfileVersion: input.companyProfileVersion,
      },
    });
  }

  private toCompanyFeatures(
    company: {
      organizationId: string;
      preferredCategories: string[];
      requiredCapabilities: string[];
      commercialPrefs: unknown;
      normalizedProfile?: unknown;
    },
    organization: { industry: string | null; region: string | null },
  ): ProfileFeatures {
    const prefs = (company.commercialPrefs ?? {}) as Record<string, unknown>;
    const normalized = (company.normalizedProfile ?? {}) as Record<
      string,
      unknown
    >;
    const regionTags = Array.isArray(normalized.regions)
      ? (normalized.regions as string[]).filter((v) => typeof v === 'string')
      : [];
    return {
      organizationId: company.organizationId,
      industry: organization.industry,
      capabilities: [],
      categories: company.preferredCategories,
      regions:
        regionTags.length > 0
          ? regionTags
          : organization.region
            ? [organization.region]
            : [],
      requirements: company.requiredCapabilities,
      preferredCategories: company.preferredCategories,
      commercialTags: (prefs.tags as string[]) ?? [],
      mutualPreferenceTags: [],
    };
  }

  private toVendorFeatures(
    vendor: {
      organizationId: string;
      capabilities: string[];
      categories: string[];
      operatingRegions: string[];
      commercialPrefs: unknown;
    },
    organization: { industry: string | null },
  ): ProfileFeatures {
    const prefs = (vendor.commercialPrefs ?? {}) as Record<string, unknown>;
    return {
      organizationId: vendor.organizationId,
      industry: organization.industry,
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
