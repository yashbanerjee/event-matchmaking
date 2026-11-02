import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  collectPublicProfileFields,
  PEER_RECOMMENDATIONS_ABSOLUTE_MAX,
  formSchemaDefinition,
  type FormSchemaDefinition,
  type PublicProfileField,
} from '@em/shared';
import { PrismaService } from '../prisma/prisma.service';
import { FiltersService } from '../filters/filters.service';
import { EffectiveConfigService } from '../settings/effective-config.service';
import { PeerRecommendationsService } from './peer-recommendations.service';
import type { AuthUser } from '../common/decorators';

type MatchSource = 'ai' | 'tags' | 'admin';

/** Portal feed ordering: open matches → already in pipeline → dismissed. */
type EngagementStatus = 'active' | 'engaged' | 'dismissed';

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
  engagementStatus: EngagementStatus;
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
      75,
    );
    if (!Number.isFinite(raw)) return 75;
    return Math.max(0, Math.min(100, raw));
  }

  /** Investors always browse innovators; innovators only when admin enables it. */
  private async counterpartDirectoryEnabled(
    perspective: 'COMPANY' | 'VENDOR',
  ): Promise<boolean> {
    if (perspective === 'COMPANY') return true;
    return this.config.getBoolean(
      'ops.showInvestorDirectoryToInnovators',
      false,
    );
  }

  async forActor(actor: AuthUser, limit?: number) {
    const orgIds = actor.organizationIds ?? [];
    if (!orgIds.length) {
      return {
        items: [],
        featured: [],
        perspective: null,
        computing: false,
        counterpartDirectoryEnabled: false,
      };
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
      return {
        items: [],
        featured: [],
        perspective: null,
        computing: false,
        counterpartDirectoryEnabled: false,
      };
    }

    const perspective = perspectiveOrg.type as 'COMPANY' | 'VENDOR';
    const peerType = perspective === 'COMPANY' ? 'VENDOR' : 'COMPANY';
    const roleLimit = await this.peers.getRecommendationLimit(perspective);
    // Ignore client `limit` (older mobile apps send 10/12). Always return up to
    // the configured role ceiling so the installed app shows the full list.
    void limit;
    const max = Math.min(roleLimit, PEER_RECOMMENDATIONS_ABSOLUTE_MAX);
    const { computing } = await this.peers.ensureComputed(perspectiveOrg.id);
    const [dismissedIds, engagedIds, directoryEnabled] = await Promise.all([
      this.listDismissedPeerIds(perspectiveOrg.id),
      this.listEngagedPeerIds(perspectiveOrg.id),
      this.counterpartDirectoryEnabled(perspective),
    ]);

    const [stored, scoreThreshold] = await Promise.all([
      this.fromStored({
        fromOrgId: perspectiveOrg.id,
        perspective,
        peerType,
        max,
        tagLabels,
        // Never hide self; engaged + dismissed stay visible in later sections.
        excludeOrgIds: orgIds,
        dismissedIds: new Set(dismissedIds),
        engagedIds: new Set(engagedIds),
      }),
      this.getRecommendationThreshold(),
    ]);

    // Directory browse (Innovators / Investors) is separate. Recommendations
    // show sticky stored peers: active first, then meeting/request, then not interested.
    return {
      items: stored?.items ?? [],
      featured: stored?.featured ?? [],
      perspective,
      recommendationLimit: roleLimit,
      scoreThreshold,
      computing,
      counterpartDirectoryEnabled: directoryEnabled,
    };
  }

  /** Hide a peer from this actor's recommendation feed permanently. */
  async dismissPeer(actor: AuthUser, toOrgId: string) {
    const orgIds = actor.organizationIds ?? [];
    if (!orgIds.length) {
      throw new ForbiddenException('Organization membership required');
    }
    if (orgIds.includes(toOrgId)) {
      throw new BadRequestException('Cannot dismiss your own organization');
    }

    const myOrgs = await this.prisma.organization.findMany({
      where: { id: { in: orgIds } },
      select: { id: true, type: true },
    });
    const companyOrg = myOrgs.find((o) => o.type === 'COMPANY');
    const vendorOrg = myOrgs.find((o) => o.type === 'VENDOR');
    const perspectiveOrg = companyOrg ?? vendorOrg;
    if (!perspectiveOrg) {
      throw new ForbiddenException('No investor or innovator organization found');
    }

    const peer = await this.prisma.organization.findUnique({
      where: { id: toOrgId },
      select: { id: true, type: true, status: true },
    });
    if (!peer || peer.status === 'ARCHIVED') {
      throw new NotFoundException('Organization not found');
    }
    const expectedPeerType =
      perspectiveOrg.type === 'COMPANY' ? 'VENDOR' : 'COMPANY';
    if (peer.type !== expectedPeerType) {
      throw new BadRequestException(
        perspectiveOrg.type === 'COMPANY'
          ? 'Investors can only dismiss innovators'
          : 'Innovators can only dismiss investors',
      );
    }

    await this.prisma.orgPeerRecommendationDismissal.upsert({
      where: {
        fromOrgId_toOrgId: {
          fromOrgId: perspectiveOrg.id,
          toOrgId,
        },
      },
      create: {
        fromOrgId: perspectiveOrg.id,
        toOrgId,
      },
      update: {},
    });

    // Keep the stored peer row so the match stays visible under "Not interested"
    // and a free slot can still open for a new active recommendation on recompute.

    return { ok: true, fromOrgId: perspectiveOrg.id, toOrgId };
  }

  private async listDismissedPeerIds(fromOrgId: string): Promise<string[]> {
    const rows = await this.prisma.orgPeerRecommendationDismissal.findMany({
      where: { fromOrgId },
      select: { toOrgId: true },
    });
    return rows.map((row) => row.toOrgId);
  }

  /**
   * Peers already in an open meeting request or active meeting with this org.
   * Hidden from Recommendations and directory browse until declined/cancelled.
   */
  private async listEngagedPeerIds(orgId: string): Promise<string[]> {
    const openRequestStatuses = [
      'PENDING',
      'INTEREST_ACCEPTED',
      'AWAITING_CONFIRMATION',
      'SCHEDULED',
    ] as const;

    const [outbound, inbound, asCompany, asVendor] = await Promise.all([
      this.prisma.meetingRequest.findMany({
        where: {
          fromOrgId: orgId,
          status: { in: [...openRequestStatuses] },
        },
        select: { toOrgId: true },
      }),
      this.prisma.meetingRequest.findMany({
        where: {
          toOrgId: orgId,
          status: { in: [...openRequestStatuses] },
        },
        select: { fromOrgId: true },
      }),
      this.prisma.meeting.findMany({
        where: {
          companyOrgId: orgId,
          status: { notIn: ['CANCELLED', 'NO_SHOW'] },
        },
        select: { vendorOrgId: true },
      }),
      this.prisma.meeting.findMany({
        where: {
          vendorOrgId: orgId,
          status: { notIn: ['CANCELLED', 'NO_SHOW'] },
        },
        select: { companyOrgId: true },
      }),
    ]);

    return [
      ...new Set([
        ...outbound.map((row) => row.toOrgId),
        ...inbound.map((row) => row.fromOrgId),
        ...asCompany.map((row) => row.vendorOrgId),
        ...asVendor.map((row) => row.companyOrgId),
      ]),
    ];
  }

  /**
   * Full counterpart directory (not score-capped): investors browse all
   * eligible innovators; innovators browse all eligible investors.
   * Optional tag values filter across every active filter dimension.
   */
  async browsePeers(
    actor: AuthUser,
    input?: {
      q?: string;
      page?: number;
      pageSize?: number;
      tags?: string[];
    },
  ) {
    const orgIds = actor.organizationIds ?? [];
    if (!orgIds.length) {
      throw new ForbiddenException('Organization membership required');
    }

    const myOrgs = await this.prisma.organization.findMany({
      where: { id: { in: orgIds } },
      select: { id: true, type: true },
    });
    const companyOrg = myOrgs.find((o) => o.type === 'COMPANY');
    const vendorOrg = myOrgs.find((o) => o.type === 'VENDOR');
    const perspectiveOrg = companyOrg ?? vendorOrg;
    if (!perspectiveOrg) {
      return {
        items: [],
        total: 0,
        page: 1,
        pageSize: 0,
        perspective: null as 'COMPANY' | 'VENDOR' | null,
        counterpartLabel: 'partners',
        directoryEnabled: false,
      };
    }

    const perspective = perspectiveOrg.type as 'COMPANY' | 'VENDOR';
    const directoryEnabled =
      await this.counterpartDirectoryEnabled(perspective);
    if (!directoryEnabled) {
      return {
        items: [],
        total: 0,
        page: 1,
        pageSize: 0,
        perspective,
        counterpartLabel: 'investors',
        directoryEnabled: false,
      };
    }

    // No hard ceiling: investors/innovators can browse the full counterpart list.
    // Optional page/pageSize still work for UI chunking; omit pageSize to return all.
    const page = Math.max(1, input?.page ?? 1);
    const pageSize =
      input?.pageSize == null || !Number.isFinite(input.pageSize)
        ? null
        : Math.max(1, Math.round(input.pageSize));
    const q = input?.q?.trim().replace(/\s+/g, ' ') ?? '';
    const selectedTags = [
      ...new Set(
        (input?.tags ?? [])
          .map((tag) => tag.trim())
          .filter(Boolean),
      ),
    ];
    const [dismissedIds, engagedIds] = await Promise.all([
      this.listDismissedPeerIds(perspectiveOrg.id),
      this.listEngagedPeerIds(perspectiveOrg.id),
    ]);
    const excludeOrgIds = [...orgIds, ...dismissedIds, ...engagedIds];

    const [tagLabels, tagIndex] = await Promise.all([
      this.filters.listTagLabelIndex(),
      this.filters.listTagProfileIndex(),
    ]);
    const grouped = this.groupTagsByProfileKey(selectedTags, tagIndex);

    if (perspective === 'COMPANY') {
      const vendors = await this.prisma.vendor.findMany({
        where: {
          matchingEligible: true,
          approvalStatus: 'VERIFIED',
          verificationStatus: 'VERIFIED',
          onboardingComplete: true,
          organizationId: { notIn: excludeOrgIds },
          organization: {
            status: { not: 'ARCHIVED' },
            ...(q
              ? {
                  OR: [
                    { name: { contains: q, mode: 'insensitive' as const } },
                    {
                      industry: { contains: q, mode: 'insensitive' as const },
                    },
                  ],
                }
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
              customAttrs: true,
            },
          },
        },
        orderBy: [{ featured: 'desc' }, { organization: { name: 'asc' } }],
      });

      const filtered = vendors.filter((vendor) =>
        this.matchesBrowseTagFilters(
          {
            industry: vendor.organization.industry,
            categories: vendor.categories,
            capabilities: vendor.capabilities,
            regions: vendor.operatingRegions,
            commercialPrefs: vendor.commercialPrefs,
          },
          grouped,
          tagLabels,
        ),
      );
      const total = filtered.length;
      const slice =
        pageSize == null
          ? filtered
          : filtered.slice((page - 1) * pageSize, page * pageSize);
      return {
        items: slice.map((vendor) => ({
          organizationId: vendor.organization.id,
          name: vendor.organization.name,
          type: 'VENDOR' as const,
          // Keep stored tag values (not labels) so client filters match chips.
          industry: vendor.organization.industry,
          industryLabel: this.labelOf(vendor.organization.industry, tagLabels),
          region: vendor.organization.region,
          categories: vendor.categories,
          categoryLabels: this.labelsOf(vendor.categories, tagLabels),
          capabilities: vendor.capabilities,
          capabilityLabels: this.labelsOf(vendor.capabilities, tagLabels),
          regions: vendor.operatingRegions,
          regionLabels: this.labelsOf(vendor.operatingRegions, tagLabels),
          commercialTags: this.commercialTagValues(vendor.commercialPrefs),
          commercialTagLabels: this.labelsOf(
            this.commercialTagValues(vendor.commercialPrefs),
            tagLabels,
          ),
          featured: Boolean(vendor.featured),
          logoUrl: this.logoOf(vendor.organization.customAttrs),
        })),
        total,
        page,
        pageSize: pageSize ?? total,
        perspective,
        counterpartLabel: 'innovators',
        directoryEnabled: true,
      };
    }

    const companies = await this.prisma.company.findMany({
      where: {
        matchingEligible: true,
        approvalStatus: 'VERIFIED',
        verificationStatus: 'VERIFIED',
        organizationId: { notIn: excludeOrgIds },
        organization: {
          status: { not: 'ARCHIVED' },
          ...(q
            ? {
                OR: [
                  { name: { contains: q, mode: 'insensitive' as const } },
                  {
                    industry: { contains: q, mode: 'insensitive' as const },
                  },
                ],
              }
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
            customAttrs: true,
          },
        },
      },
      orderBy: [{ featured: 'desc' }, { organization: { name: 'asc' } }],
    });

    const filtered = companies.filter((company) =>
      this.matchesBrowseTagFilters(
        {
          industry: company.organization.industry,
          categories: [
            ...company.preferredCategories,
          ],
          capabilities: company.requiredCapabilities,
          regions: this.readNormalizedRegions(company.normalizedProfile),
          commercialPrefs: company.commercialPrefs,
        },
        {
          ...grouped,
          categories: [
            ...grouped.categories,
            ...grouped.preferredCategories,
          ],
          preferredCategories: [],
        },
        tagLabels,
      ),
    );
    const total = filtered.length;
    const slice =
      pageSize == null
        ? filtered
        : filtered.slice((page - 1) * pageSize, page * pageSize);
    return {
      items: slice.map((company) => {
        const regions = this.readNormalizedRegions(company.normalizedProfile);
        const commercialTags = this.commercialTagValues(
          company.commercialPrefs,
        );
        return {
          organizationId: company.organization.id,
          name: company.organization.name,
          type: 'COMPANY' as const,
          industry: company.organization.industry,
          industryLabel: this.labelOf(
            company.organization.industry,
            tagLabels,
          ),
          region: company.organization.region,
          categories: company.preferredCategories,
          categoryLabels: this.labelsOf(
            company.preferredCategories,
            tagLabels,
          ),
          capabilities: company.requiredCapabilities,
          capabilityLabels: this.labelsOf(
            company.requiredCapabilities,
            tagLabels,
          ),
          regions,
          regionLabels: this.labelsOf(regions, tagLabels),
          commercialTags,
          commercialTagLabels: this.labelsOf(commercialTags, tagLabels),
          featured: Boolean(company.featured),
          logoUrl: this.logoOf(company.organization.customAttrs),
        };
      }),
      total,
      page,
      pageSize: pageSize ?? total,
      perspective,
      counterpartLabel: 'investors',
      directoryEnabled: true,
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

  private engagementRank(status: EngagementStatus): number {
    if (status === 'active') return 0;
    if (status === 'engaged') return 1;
    return 2;
  }

  /** Featured first, then active → engaged → dismissed (score within each). */
  private splitRecommendations(scored: RecommendationItem[], max: number) {
    const ordered = [...scored].sort((a, b) => {
      const byStatus =
        this.engagementRank(a.engagementStatus) -
        this.engagementRank(b.engagementStatus);
      if (byStatus !== 0) return byStatus;
      return b.score - a.score;
    });
    const featured = ordered.filter((item) => item.featured).slice(0, max);
    const featuredIds = new Set(featured.map((item) => item.organizationId));
    const remaining = Math.max(0, max - featured.length);
    const items = ordered
      .filter((item) => !featuredIds.has(item.organizationId))
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
    dismissedIds: Set<string>;
    engagedIds: Set<string>;
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
      // Fetch extra so engagement sections and featured pins can fill `max`.
      take: Math.min(
        PEER_RECOMMENDATIONS_ABSOLUTE_MAX,
        Math.max(input.max * 3, 30),
      ),
    });
    if (!rows.length) return null;

    // Sticky: keep every stored peer (including below-threshold / dismissed /
    // engaged). Threshold only gates *adding* new COMPUTED rows on recompute.
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
        const engagementStatus: EngagementStatus = input.dismissedIds.has(
          peer.id,
        )
          ? 'dismissed'
          : input.engagedIds.has(peer.id)
            ? 'engaged'
            : 'active';
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
          engagementStatus,
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

  private groupTagsByProfileKey(
    tags: string[],
    tagIndex: Record<string, string>,
  ) {
    const groups = {
      categories: [] as string[],
      preferredCategories: [] as string[],
      capabilities: [] as string[],
      industry: [] as string[],
      regions: [] as string[],
      commercialTags: [] as string[],
    };
    for (const raw of tags) {
      const key = raw.trim().toLowerCase();
      const profileKey = tagIndex[key] ?? 'categories';
      if (profileKey === 'preferredCategories') {
        groups.preferredCategories.push(raw);
      } else if (profileKey === 'capabilities') {
        groups.capabilities.push(raw);
      } else if (profileKey === 'industry') {
        groups.industry.push(raw);
      } else if (profileKey === 'regions') {
        groups.regions.push(raw);
      } else if (profileKey === 'commercialTags') {
        groups.commercialTags.push(raw);
      } else {
        groups.categories.push(raw);
      }
    }
    return groups;
  }

  private commercialTagValues(prefs: unknown): string[] {
    if (!prefs || typeof prefs !== 'object' || Array.isArray(prefs)) return [];
    const record = prefs as Record<string, unknown>;
    const tags = [
      ...this.asStringArray(record.tags),
      ...this.asStringArray(record.roleTags),
      ...this.asStringArray(record.visitPurpose),
      ...this.asStringArray(record.investmentStages),
    ];
    const ticket = record.ticketSize;
    if (typeof ticket === 'string' && ticket.trim()) tags.push(ticket.trim());
    return [...new Set(tags)];
  }

  private readNormalizedRegions(normalized: unknown): string[] {
    if (!normalized || typeof normalized !== 'object' || Array.isArray(normalized)) {
      return [];
    }
    return this.asStringArray(
      (normalized as Record<string, unknown>).regions,
    );
  }

  private asStringArray(value: unknown): string[] {
    if (!Array.isArray(value)) return [];
    return value
      .map((item) => {
        if (typeof item === 'string') return item.trim();
        if (item && typeof item === 'object' && 'value' in item) {
          return String((item as { value: unknown }).value ?? '').trim();
        }
        return '';
      })
      .filter(Boolean);
  }

  /**
   * Tag filters: OR within a profile field, AND across selected fields.
   * Matches tag values or labels case-insensitively so stored form data
   * and filter chips stay aligned.
   */
  private matchesBrowseTagFilters(
    profile: {
      industry?: string | null;
      categories?: string[];
      capabilities?: string[];
      regions?: string[];
      commercialPrefs?: unknown;
    },
    grouped: ReturnType<RecommendationsService['groupTagsByProfileKey']>,
    tagLabels: Record<string, string>,
  ) {
    const checks: Array<{ selected: string[]; haystack: string[] }> = [
      {
        selected: grouped.industry,
        haystack: profile.industry ? [profile.industry] : [],
      },
      {
        selected: grouped.categories,
        haystack: profile.categories ?? [],
      },
      {
        selected: grouped.preferredCategories,
        haystack: profile.categories ?? [],
      },
      {
        selected: grouped.capabilities,
        haystack: profile.capabilities ?? [],
      },
      {
        selected: grouped.regions,
        haystack: profile.regions ?? [],
      },
      {
        selected: grouped.commercialTags,
        haystack: this.commercialTagValues(profile.commercialPrefs),
      },
    ];

    for (const check of checks) {
      if (!check.selected.length) continue;
      if (!this.haystackMatchesAny(check.haystack, check.selected, tagLabels)) {
        return false;
      }
    }
    return true;
  }

  private haystackMatchesAny(
    haystack: string[],
    selected: string[],
    tagLabels: Record<string, string>,
  ) {
    if (!selected.length) return true;
    const hay = this.expandTagAliases(haystack, tagLabels);
    for (const tag of selected) {
      const needles = this.expandTagAliases([tag], tagLabels);
      for (const needle of needles) {
        if (hay.has(needle)) return true;
      }
    }
    return false;
  }

  private expandTagAliases(
    values: string[],
    tagLabels: Record<string, string>,
  ) {
    const aliases = new Set<string>();
    for (const raw of values) {
      const value = raw.trim();
      if (!value) continue;
      const lower = value.toLowerCase();
      aliases.add(lower);
      const label = tagLabels[lower];
      if (label) aliases.add(label.trim().toLowerCase());
    }
    // Also map labels back to known values.
    for (const [key, label] of Object.entries(tagLabels)) {
      const labelKey = label.trim().toLowerCase();
      if (aliases.has(labelKey) || aliases.has(key)) {
        aliases.add(key);
        aliases.add(labelKey);
      }
    }
    return aliases;
  }

}
