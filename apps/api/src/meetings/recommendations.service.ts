import { Injectable } from '@nestjs/common';
import { calculateMatchScore, type ProfileFeatures } from '@em/domain';
import { defaultMatchingWeights } from '@em/shared';
import { PrismaService } from '../prisma/prisma.service';
import { FiltersService } from '../filters/filters.service';
import type { AuthUser } from '../common/decorators';

@Injectable()
export class RecommendationsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly filters: FiltersService,
  ) {}

  async forActor(actor: AuthUser, limit = 12) {
    const orgIds = actor.organizationIds ?? [];
    if (!orgIds.length) return { items: [] };

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
          approvalStatus: { in: ['VERIFIED', 'APPROVED'] },
          onboardingComplete: true,
        },
        include: { organization: true },
        take: 200,
      });
      const companyFeatures = this.toCompanyFeatures(
        companyOrg.company,
        companyOrg,
      );
      const items = vendors
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
            explanation: score.explanation,
            logoUrl: this.logoOf(vendor.organization.customAttrs),
          };
        })
        .sort((a, b) => b.score - a.score)
        .slice(0, limit);
      return { items, perspective: 'COMPANY' as const };
    }

    if (vendorOrg?.vendor) {
      const companies = await this.prisma.company.findMany({
        where: {
          matchingEligible: true,
          approvalStatus: { in: ['VERIFIED', 'APPROVED'] },
        },
        include: { organization: true },
        take: 200,
      });
      const vendorFeatures = this.toVendorFeatures(
        vendorOrg.vendor,
        vendorOrg,
      );
      const items = companies
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
            explanation: score.explanation,
            logoUrl: this.logoOf(company.organization.customAttrs),
          };
        })
        .sort((a, b) => b.score - a.score)
        .slice(0, limit);
      return { items, perspective: 'VENDOR' as const };
    }

    return { items: [] };
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
    },
    organization: { industry: string | null; region: string | null },
  ): ProfileFeatures {
    const prefs = (company.commercialPrefs ?? {}) as Record<string, unknown>;
    return {
      organizationId: company.organizationId,
      industry: organization.industry,
      capabilities: [],
      categories: [],
      regions: organization.region ? [organization.region] : [],
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
