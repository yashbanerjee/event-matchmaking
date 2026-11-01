import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  calculateMatchScore,
  companyToProfileFeatures,
  vendorToProfileFeatures,
} from '@em/domain';
import {
  collectPublicProfileFields,
  defaultMatchingWeights,
  PEER_RECOMMENDATIONS_MAX_PER_ORG,
  formSchemaDefinition,
  type FormSchemaDefinition,
  type PublicProfileField,
} from '@em/shared';
import { PrismaService } from '../prisma/prisma.service';
import { FiltersService } from '../filters/filters.service';
import { EffectiveConfigService } from '../settings/effective-config.service';
import type { AuthUser } from '../common/decorators';

type RecommendationItem = {
  organizationId: string;
  name: string;
  type: 'COMPANY' | 'VENDOR';
  industry: string | null;
  categories: string[];
  capabilities: string[];
  score: number;
  /** User-facing “why this match” bullets */
  reasons: string[];
  explanation: string;
  aiScore?: number | null;
  aiDescription?: string | null;
  logoUrl: string | null;
  featured: boolean;
};

@Injectable()
export class RecommendationsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly filters: FiltersService,
    private readonly config: EffectiveConfigService,
  ) {}

  private async getRecommendationThreshold(): Promise<number> {
    const raw = await this.config.getNumber(
      'ops.recommendationScoreThreshold',
      50,
    );
    if (!Number.isFinite(raw)) return 50;
    return Math.max(0, Math.min(100, raw));
  }

  async forActor(actor: AuthUser, limit = PEER_RECOMMENDATIONS_MAX_PER_ORG) {
    const max = Math.min(
      Math.max(Number(limit) || PEER_RECOMMENDATIONS_MAX_PER_ORG, 1),
      PEER_RECOMMENDATIONS_MAX_PER_ORG,
    );
    const orgIds = actor.organizationIds ?? [];
    if (!orgIds.length) return { items: [], featured: [], perspective: null };

    const [equivalences, tagLabels] = await Promise.all([
      this.filters.listEquivalences(),
      this.filters.listTagLabelIndex(),
    ]);

    const myOrgs = await this.prisma.organization.findMany({
      where: { id: { in: orgIds } },
      include: { company: true, vendor: true },
    });

    const companyOrg = myOrgs.find((o) => o.type === 'COMPANY' && o.company);
    const vendorOrg = myOrgs.find((o) => o.type === 'VENDOR' && o.vendor);

    // Hard rule: investors only see innovators; innovators only see investors.
    // Prefer the actor's primary org type (company first only if they have one).
    const perspectiveOrg = companyOrg ?? vendorOrg;
    if (!perspectiveOrg) {
      return { items: [], featured: [], perspective: null };
    }

    const perspective = perspectiveOrg.type as 'COMPANY' | 'VENDOR';
    // COMPANY (investor) → VENDOR (innovator); VENDOR (innovator) → COMPANY (investor)
    const peerType = perspective === 'COMPANY' ? 'VENDOR' : 'COMPANY';

    const stored = await this.fromStored({
      fromOrgId: perspectiveOrg.id,
      perspective,
      peerType,
      max,
      tagLabels,
      excludeOrgIds: orgIds,
    });
    if (stored) {
      return { ...stored, perspective };
    }

    if (perspective === 'COMPANY' && companyOrg?.company) {
      const vendors = await this.prisma.vendor.findMany({
        where: {
          matchingEligible: true,
          approvalStatus: 'VERIFIED',
          verificationStatus: 'VERIFIED',
          onboardingComplete: true,
          organizationId: { notIn: orgIds },
          organization: {
            status: { not: 'ARCHIVED' },
            type: 'VENDOR',
          },
        },
        include: { organization: true },
        take: 200,
      });
      const companyFeatures = companyToProfileFeatures({
        organizationId: companyOrg.company.organizationId,
        preferredCategories: companyOrg.company.preferredCategories,
        requiredCapabilities: companyOrg.company.requiredCapabilities,
        commercialPrefs: companyOrg.company.commercialPrefs,
        normalizedProfile: companyOrg.company.normalizedProfile,
        organization: companyOrg,
      });
      const scored: RecommendationItem[] = vendors
        .filter((vendor) => vendor.organization.type === 'VENDOR')
        .map((vendor) => {
          const score = calculateMatchScore(
            companyFeatures,
            vendorToProfileFeatures({
              organizationId: vendor.organizationId,
              capabilities: vendor.capabilities,
              categories: vendor.categories,
              operatingRegions: vendor.operatingRegions,
              commercialPrefs: vendor.commercialPrefs,
              normalizedProfile: vendor.normalizedProfile,
              organization: vendor.organization,
            }),
            defaultMatchingWeights,
            equivalences,
            tagLabels,
          );
          return {
            organizationId: vendor.organizationId,
            name: vendor.organization.name,
            type: 'VENDOR' as const,
            industry: this.labelOf(
              vendor.organization.industry,
              tagLabels,
            ),
            categories: this.labelsOf(vendor.categories, tagLabels),
            capabilities: this.labelsOf(vendor.capabilities, tagLabels),
            score: score.totalScore,
            reasons: score.reasons,
            explanation: score.explanation,
            logoUrl: this.logoOf(vendor.organization.customAttrs),
            featured: vendor.featured,
          };
        })
        .sort((a, b) => {
          if (a.featured !== b.featured) return a.featured ? -1 : 1;
          return b.score - a.score;
        });

      return {
        ...this.splitRecommendations(scored, max),
        perspective: 'COMPANY' as const,
      };
    }

    if (perspective === 'VENDOR' && vendorOrg?.vendor) {
      const companies = await this.prisma.company.findMany({
        where: {
          matchingEligible: true,
          approvalStatus: 'VERIFIED',
          verificationStatus: 'VERIFIED',
          organizationId: { notIn: orgIds },
          organization: {
            status: { not: 'ARCHIVED' },
            type: 'COMPANY',
          },
        },
        include: { organization: true },
        take: 200,
      });
      const vendorFeatures = vendorToProfileFeatures({
        organizationId: vendorOrg.vendor.organizationId,
        capabilities: vendorOrg.vendor.capabilities,
        categories: vendorOrg.vendor.categories,
        operatingRegions: vendorOrg.vendor.operatingRegions,
        commercialPrefs: vendorOrg.vendor.commercialPrefs,
        normalizedProfile: vendorOrg.vendor.normalizedProfile,
        organization: vendorOrg,
      });
      const scored: RecommendationItem[] = companies
        .filter((company) => company.organization.type === 'COMPANY')
        .map((company) => {
          const score = calculateMatchScore(
            companyToProfileFeatures({
              organizationId: company.organizationId,
              preferredCategories: company.preferredCategories,
              requiredCapabilities: company.requiredCapabilities,
              commercialPrefs: company.commercialPrefs,
              normalizedProfile: company.normalizedProfile,
              organization: company.organization,
            }),
            vendorFeatures,
            defaultMatchingWeights,
            equivalences,
            tagLabels,
          );
          return {
            organizationId: company.organizationId,
            name: company.organization.name,
            type: 'COMPANY' as const,
            industry: this.labelOf(
              company.organization.industry,
              tagLabels,
            ),
            categories: this.labelsOf(
              company.preferredCategories,
              tagLabels,
            ),
            capabilities: this.labelsOf(
              company.requiredCapabilities,
              tagLabels,
            ),
            score: score.totalScore,
            reasons: score.reasons,
            explanation: score.explanation,
            logoUrl: this.logoOf(company.organization.customAttrs),
            featured: company.featured,
          };
        })
        .sort((a, b) => {
          if (a.featured !== b.featured) return a.featured ? -1 : 1;
          return b.score - a.score;
        });

      return {
        ...this.splitRecommendations(scored, max),
        perspective: 'VENDOR' as const,
      };
    }

    return { items: [], featured: [], perspective: null };
  }

  /**
   * Peer-facing organization profile built from the latest approved form
   * submission. Fields marked sensitive are excluded.
   */
  async publicProfile(actor: AuthUser, organizationId: string) {
    const orgIds = actor.organizationIds ?? [];
    if (!orgIds.length) {
      throw new ForbiddenException('Organization membership required');
    }
    if (orgIds.includes(organizationId)) {
      throw new BadRequestException(
        'Use your own workspace to view your form answers',
      );
    }

    const organization = await this.prisma.organization.findUnique({
      where: { id: organizationId },
      include: { company: true, vendor: true },
    });
    if (!organization || organization.status === 'ARCHIVED') {
      throw new NotFoundException('Organization not found');
    }

    // Same direction as the feed: investors view innovators, innovators view investors
    const viewerOrgs = await this.prisma.organization.findMany({
      where: { id: { in: orgIds } },
      select: { type: true },
    });
    const viewerIsInvestor = viewerOrgs.some((o) => o.type === 'COMPANY');
    const viewerIsInnovator = viewerOrgs.some((o) => o.type === 'VENDOR');
    if (viewerIsInvestor && !viewerIsInnovator && organization.type !== 'VENDOR') {
      throw new ForbiddenException('Investors can only view innovator profiles');
    }
    if (viewerIsInnovator && !viewerIsInvestor && organization.type !== 'COMPANY') {
      throw new ForbiddenException('Innovators can only view investor profiles');
    }
    if (viewerIsInvestor && viewerIsInnovator) {
      // Prefer investor perspective when both memberships exist
      if (organization.type !== 'VENDOR' && organization.type !== 'COMPANY') {
        throw new ForbiddenException('Unsupported organization type');
      }
    }

    const submission = await this.prisma.formSubmission.findFirst({
      where: {
        organizationId,
        status: { in: ['APPROVED', 'SUBMITTED', 'UNDER_REVIEW'] },
        submittedAt: { not: null },
      },
      include: {
        formVersion: {
          include: { form: { select: { name: true } } },
        },
      },
      orderBy: [{ reviewedAt: 'desc' }, { submittedAt: 'desc' }],
    });

    const schema = this.resolveSubmissionSchema(
      submission?.formVersion.schemaJson,
    );
    const responses =
      (submission?.responses as Record<string, unknown> | null) ?? {};
    const fields: PublicProfileField[] = schema
      ? collectPublicProfileFields(schema, responses)
      : [];
    const tagLabels = await this.filters.listTagLabelIndex();

    return {
      organizationId: organization.id,
      name: organization.name,
      type: organization.type,
      industry: this.labelOf(organization.industry, tagLabels),
      region: organization.region,
      website: organization.website,
      logoUrl: this.logoOf(organization.customAttrs),
      categories: this.labelsOf(
        organization.vendor?.categories ??
          organization.company?.preferredCategories ??
          [],
        tagLabels,
      ),
      capabilities: this.labelsOf(
        organization.vendor?.capabilities ??
          organization.company?.requiredCapabilities ??
          [],
        tagLabels,
      ),
      featured: Boolean(
        organization.vendor?.featured || organization.company?.featured,
      ),
      formName: submission?.formVersion.form.name ?? null,
      fields,
      sensitiveFieldsHidden: true,
    };
  }

  private resolveSubmissionSchema(
    schemaJson: unknown,
  ): FormSchemaDefinition | null {
    const parsed = formSchemaDefinition.safeParse(schemaJson);
    return parsed.success ? parsed.data : null;
  }

  /** Featured first, then category matches — hard cap of `max` total (max 5). */
  private splitRecommendations(scored: RecommendationItem[], max: number) {
    const featured = scored.filter((item) => item.featured).slice(0, max);
    const remaining = Math.max(0, max - featured.length);
    const items = scored
      .filter((item) => !item.featured)
      .slice(0, remaining);
    return { items, featured };
  }

  private logoOf(customAttrs: unknown): string | null {
    if (!customAttrs || typeof customAttrs !== 'object') return null;
    const logo = (customAttrs as Record<string, unknown>).logoUrl;
    return typeof logo === 'string' ? logo : null;
  }

  private async fromStored(input: {
    fromOrgId: string;
    perspective: 'COMPANY' | 'VENDOR';
    peerType: 'COMPANY' | 'VENDOR';
    max: number;
    tagLabels: Record<string, string>;
    excludeOrgIds: string[];
  }): Promise<{
    items: RecommendationItem[];
    featured: RecommendationItem[];
  } | null> {
    const rows = await this.prisma.orgPeerRecommendation.findMany({
      where: {
        fromOrgId: input.fromOrgId,
        // Enforce engine direction at read time
        perspective: input.perspective,
        toOrgId: { notIn: input.excludeOrgIds },
        toOrg: {
          type: input.peerType,
          status: { not: 'ARCHIVED' },
        },
      },
      include: {
        toOrg: {
          include: { company: true, vendor: true },
        },
      },
      orderBy: [{ totalScore: 'desc' }, { computedAt: 'desc' }],
      take: Math.max(input.max * 3, 30),
    });
    if (!rows.length) return null;

    const threshold = await this.getRecommendationThreshold();
    const scored: RecommendationItem[] = rows
      .filter(
        (row) =>
          row.toOrg.type === input.peerType &&
          (row.source === 'MANUAL' || row.totalScore >= threshold),
      )
      .map((row) => {
        const peer = row.toOrg;
        const featured = Boolean(
          peer.company?.featured || peer.vendor?.featured,
        );
        const reasons =
          row.reasons.length > 0
            ? row.reasons
            : row.aiDescription
              ? [row.aiDescription]
              : [];
        return {
          organizationId: peer.id,
          name: peer.name,
          type: peer.type as 'COMPANY' | 'VENDOR',
          industry: this.labelOf(peer.industry, input.tagLabels),
          categories: this.labelsOf(
            peer.vendor?.categories ??
              peer.company?.preferredCategories ??
              [],
            input.tagLabels,
          ),
          capabilities: this.labelsOf(
            peer.vendor?.capabilities ??
              peer.company?.requiredCapabilities ??
              [],
            input.tagLabels,
          ),
          score: row.totalScore,
          reasons,
          explanation:
            row.aiDescription ??
            (reasons.length
              ? reasons.join(' · ')
              : `Score ${row.totalScore}`),
          aiScore: row.aiScore,
          aiDescription: row.aiDescription,
          logoUrl: this.logoOf(peer.customAttrs),
          featured,
        };
      });

    if (!scored.length) return null;
    return this.splitRecommendations(scored, input.max);
  }

  private labelOf(
    value: string | null | undefined,
    tagLabels: Record<string, string>,
  ): string | null {
    if (!value) return null;
    return tagLabels[value.trim().toLowerCase()] ?? value;
  }

  private labelsOf(
    values: string[],
    tagLabels: Record<string, string>,
  ): string[] {
    return values.map((value) => this.labelOf(value, tagLabels) ?? value);
  }

}
