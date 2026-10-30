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

    const equivalences = await this.filters.listEquivalences();

    const myOrgs = await this.prisma.organization.findMany({
      where: { id: { in: orgIds } },
      include: { company: true, vendor: true },
    });

    const companyOrg = myOrgs.find((o) => o.type === 'COMPANY' && o.company);
    const vendorOrg = myOrgs.find((o) => o.type === 'VENDOR' && o.vendor);

    if (companyOrg?.company) {
      const vendors = await this.prisma.vendor.findMany({
        where: {
          matchingEligible: true,
          approvalStatus: 'VERIFIED',
          verificationStatus: 'VERIFIED',
          onboardingComplete: true,
          organizationId: { notIn: orgIds },
          organization: { status: { not: 'ARCHIVED' } },
        },
        include: { organization: true },
        take: 200,
      });
      const companyFeatures = this.toCompanyFeatures(
        companyOrg.company,
        companyOrg,
      );
      const scored: RecommendationItem[] = vendors
        .map((vendor) => {
          const score = calculateMatchScore(
            companyFeatures,
            this.toVendorFeatures(vendor, vendor.organization),
            defaultMatchingWeights,
            equivalences,
          );
          return {
            organizationId: vendor.organizationId,
            name: vendor.organization.name,
            type: 'VENDOR' as const,
            industry: vendor.organization.industry,
            categories: vendor.categories,
            capabilities: vendor.capabilities,
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

    if (vendorOrg?.vendor) {
      const companies = await this.prisma.company.findMany({
        where: {
          matchingEligible: true,
          approvalStatus: 'VERIFIED',
          verificationStatus: 'VERIFIED',
          organizationId: { notIn: orgIds },
          organization: { status: { not: 'ARCHIVED' } },
        },
        include: { organization: true },
        take: 200,
      });
      const vendorFeatures = this.toVendorFeatures(
        vendorOrg.vendor,
        vendorOrg,
      );
      const scored: RecommendationItem[] = companies
        .map((company) => {
          const score = calculateMatchScore(
            this.toCompanyFeatures(company, company.organization),
            vendorFeatures,
            defaultMatchingWeights,
            equivalences,
          );
          return {
            organizationId: company.organizationId,
            name: company.organization.name,
            type: 'COMPANY' as const,
            industry: company.organization.industry,
            categories: company.preferredCategories,
            capabilities: company.requiredCapabilities,
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

    return {
      organizationId: organization.id,
      name: organization.name,
      type: organization.type,
      industry: organization.industry,
      region: organization.region,
      website: organization.website,
      logoUrl: this.logoOf(organization.customAttrs),
      categories:
        organization.vendor?.categories ??
        organization.company?.preferredCategories ??
        [],
      capabilities:
        organization.vendor?.capabilities ??
        organization.company?.requiredCapabilities ??
        [],
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
