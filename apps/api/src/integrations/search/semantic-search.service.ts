import { Injectable, Logger } from '@nestjs/common';
import { EnvService } from '../../config/env.service';
import { PrismaService } from '../../prisma/prisma.service';
import { AiService } from '../ai/ai.service';

export interface SemanticSearchHit {
  organizationId: string;
  name: string;
  type: string;
  score: number;
  mode: 'semantic' | 'structured_fallback';
}

/**
 * Optional semantic retrieval. Falls back to structured profile matching
 * while preserving authorization and eligibility filters.
 */
@Injectable()
export class SemanticSearchService {
  private readonly logger = new Logger(SemanticSearchService.name);

  constructor(
    private readonly env: EnvService,
    private readonly prisma: PrismaService,
    private readonly ai: AiService,
  ) {}

  async searchVendors(input: {
    query: string;
    limit?: number;
  }): Promise<{ hits: SemanticSearchHit[]; degraded: boolean }> {
    const limit = Math.min(input.limit ?? 20, 100);
    const vendors = await this.prisma.vendor.findMany({
      where: {
        matchingEligible: true,
        organization: { status: { in: ['ACTIVE', 'APPROVED'] } },
      },
      include: { organization: true },
      take: 200,
    });

    const semanticEnabled =
      this.env.raw.FEATURE_SEMANTIC_SEARCH && this.env.aiEnabled;

    if (semanticEnabled) {
      try {
        const scored: SemanticSearchHit[] = [];
        for (const vendor of vendors) {
          const profileText = [
            vendor.organization.name,
            vendor.organization.industry,
            ...vendor.capabilities,
            ...vendor.categories,
            ...vendor.operatingRegions,
          ]
            .filter(Boolean)
            .join(' ');
          const score = await this.ai.semanticSimilarity({
            left: input.query,
            right: profileText,
          });
          if (score == null) {
            throw new Error('No semantic provider available');
          }
          scored.push({
            organizationId: vendor.organizationId,
            name: vendor.organization.name,
            type: 'VENDOR',
            score,
            mode: 'semantic',
          });
        }
        scored.sort((a, b) => b.score - a.score);
        return { hits: scored.slice(0, limit), degraded: false };
      } catch (err) {
        this.logger.warn(
          `Semantic search unavailable, using structured fallback: ${(err as Error).message}`,
        );
      }
    }

    const q = input.query.toLowerCase();
    const hits = vendors
      .map((vendor) => {
        const hay = [
          vendor.organization.name,
          vendor.organization.industry,
          ...vendor.capabilities,
          ...vendor.categories,
          ...vendor.operatingRegions,
        ]
          .filter(Boolean)
          .join(' ')
          .toLowerCase();
        const tokens = q.split(/\s+/).filter(Boolean);
        const hitsCount = tokens.filter((t) => hay.includes(t)).length;
        return {
          organizationId: vendor.organizationId,
          name: vendor.organization.name,
          type: 'VENDOR',
          score: tokens.length ? hitsCount / tokens.length : 0,
          mode: 'structured_fallback' as const,
        };
      })
      .filter((h) => h.score > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, limit);

    return { hits, degraded: true };
  }
}
