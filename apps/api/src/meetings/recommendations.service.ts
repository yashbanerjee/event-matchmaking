import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { calculateMatchScore, type ProfileFeatures } from '@em/domain';
import {
  collectPublicProfileFields,
  defaultMatchingWeights,
  formSchemaDefinition,
  type FormSchemaDefinition,
  type PublicProfileField,
} from '@em/shared';
import { PrismaService } from '../prisma/prisma.service';
import { FiltersService } from '../filters/filters.service';
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
  ) {}

  async forActor(actor: AuthUser, limit = 10) {
    const max = Math.min(Math.max(Number(limit) || 10, 1), 10);
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

    // Hard rule: clients only see guests; guests only see clients.
    // Prefer the actor's primary org type (company first only if they have one).
    const perspectiveOrg = companyOrg ?? vendorOrg;
    if (!perspectiveOrg) {
      return { items: [], featured: [], perspective: null };
    }

    const perspective = perspectiveOrg.type as 'COMPANY' | 'VENDOR';
    // COMPANY (client) → VENDOR (guest); VENDOR (guest) → COMPANY (client)
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
      const companyFeatures = this.toCompanyFeatures(
        companyOrg.company,
        companyOrg,
      );
      const scored: RecommendationItem[] = vendors
        .filter((vendor) => vendor.organization.type === 'VENDOR')
        .map((vendor) => {
          const score = calculateMatchScore(
            companyFeatures,
            this.toVendorFeatures(vendor, vendor.organization),
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
      const vendorFeatures = this.toVendorFeatures(
        vendorOrg.vendor,
        vendorOrg,
      );
      const scored: RecommendationItem[] = companies
        .filter((company) => company.organization.type === 'COMPANY')
        .map((company) => {
          const score = calculateMatchScore(
            this.toCompanyFeatures(company, company.organization),
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

    // Same direction as the feed: clients view guests, guests view clients
    const viewerOrgs = await this.prisma.organization.findMany({
      where: { id: { in: orgIds } },
      select: { type: true },
    });
    const viewerIsClient = viewerOrgs.some((o) => o.type === 'COMPANY');
    const viewerIsGuest = viewerOrgs.some((o) => o.type === 'VENDOR');
    if (viewerIsClient && !viewerIsGuest && organization.type !== 'VENDOR') {
      throw new ForbiddenException('Clients can only view guest profiles');
    }
    if (viewerIsGuest && !viewerIsClient && organization.type !== 'COMPANY') {
      throw new ForbiddenException('Guests can only view client profiles');
    }
    if (viewerIsClient && viewerIsGuest) {
      // Prefer client perspective when both memberships exist
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

  /** Featured first, then category matches — hard cap of `max` total (default 10). */
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

    const scored: RecommendationItem[] = rows
      .filter((row) => row.toOrg.type === input.peerType)
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
