import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  collectPublicProfileFields,
  meetsTagCategoryThresholds,
  PEER_RECOMMENDATIONS_MAX_PER_ORG,
  formSchemaDefinition,
  resolveTagCategoryThresholds,
  type FormSchemaDefinition,
  type PublicProfileField,
} from '@em/shared';
import { PrismaService } from '../prisma/prisma.service';
import { FiltersService } from '../filters/filters.service';
import { EffectiveConfigService } from '../settings/effective-config.service';
import { PeerRecommendationsService } from './peer-recommendations.service';
import type { AuthUser } from '../common/decorators';

type MatchSource = 'ai' | 'tags' | 'admin';

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
  matchSource: MatchSource;
};

@Injectable()
export class RecommendationsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly filters: FiltersService,
    private readonly config: EffectiveConfigService,
    private readonly peers: PeerRecommendationsService,
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
    if (!orgIds.length) {
      return { items: [], featured: [], perspective: null, computing: false };
    }

    const tagLabels = await this.filters.listTagLabelIndex();

    const myOrgs = await this.prisma.organization.findMany({
      where: { id: { in: orgIds } },
      include: { company: true, vendor: true },
    });

    const companyOrg = myOrgs.find((o) => o.type === 'COMPANY' && o.company);
    const vendorOrg = myOrgs.find((o) => o.type === 'VENDOR' && o.vendor);

    // Hard rule: investors only see innovators; innovators only see investors.
    const perspectiveOrg = companyOrg ?? vendorOrg;
    if (!perspectiveOrg) {
      return { items: [], featured: [], perspective: null, computing: false };
    }

    const perspective = perspectiveOrg.type as 'COMPANY' | 'VENDOR';
    const peerType = perspective === 'COMPANY' ? 'VENDOR' : 'COMPANY';
    const { computing } = await this.peers.ensureComputed(perspectiveOrg.id);

    const stored = await this.fromStored({
      fromOrgId: perspectiveOrg.id,
      perspective,
      peerType,
      max,
      tagLabels,
      excludeOrgIds: orgIds,
    });
    if (stored) {
      return { ...stored, perspective, computing };
    }

    return {
      items: [],
      featured: [],
      perspective,
      computing,
    };
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

  /** Featured first, then scored matches — hard cap of `max` total. */
  private splitRecommendations(scored: RecommendationItem[], max: number) {
    const qualified = scored.filter(
      (item) =>
        item.matchSource === 'admin' ||
        (Number.isFinite(item.score) && item.score > 0),
    );
    const featured = qualified.filter((item) => item.featured).slice(0, max);
    const remaining = Math.max(0, max - featured.length);
    const items = qualified
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
    const tagCategoryThresholds = resolveTagCategoryThresholds(
      await this.config.getRaw('ops.tagCategoryThresholds'),
    );
    const scored: RecommendationItem[] = rows
      .filter((row) => {
        if (row.toOrg.type !== input.peerType) return false;
        if (row.source === 'MANUAL') return true;
        if (row.totalScore < threshold) return false;
        const breakdown =
          row.scoreBreakdown &&
          typeof row.scoreBreakdown === 'object' &&
          !Array.isArray(row.scoreBreakdown)
            ? (row.scoreBreakdown as Record<string, unknown>)
            : {};
        return meetsTagCategoryThresholds(breakdown, tagCategoryThresholds)
          .ok;
      })
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
          matchSource:
            row.source === 'MANUAL'
              ? ('admin' as const)
              : row.aiScore != null
                ? ('ai' as const)
                : ('tags' as const),
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
