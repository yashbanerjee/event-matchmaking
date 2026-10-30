import {
  defaultMatchingWeights,
  type MatchingWeights,
} from '@em/shared';

export interface ProfileFeatures {
  organizationId: string;
  industry?: string | null;
  capabilities: string[];
  categories: string[];
  regions: string[];
  requirements: string[];
  preferredCategories: string[];
  commercialTags: string[];
  mutualPreferenceTags: string[];
}

export interface ScoreBreakdown {
  capability: number;
  industry: number;
  requirements: number;
  geography: number;
  commercial: number;
  mutualPreferences: number;
}

export interface MatchScoreResult {
  totalScore: number;
  breakdown: ScoreBreakdown;
  /** Human-readable bullets for “why this match” UIs */
  reasons: string[];
  explanation: string;
  missingDimensions: string[];
}

export type TagEquivalence = {
  from: string;
  to: string;
  bidirectional?: boolean;
};

function normalizeSet(values: string[]): Set<string> {
  return new Set(
    values
      .map((v) => v.trim().toLowerCase())
      .filter((v) => v.length > 0),
  );
}

/**
 * Expand tags with admin-defined equivalences (e.g. food ↔ hotel).
 * Bidirectional by default so either side appears in the other's recommendations.
 */
export function expandWithMappings(
  values: string[],
  equivalences: TagEquivalence[] = [],
): string[] {
  if (!equivalences.length) {
    return [...normalizeSet(values)];
  }

  const adjacency = new Map<string, Set<string>>();
  const touch = (key: string) => {
    if (!adjacency.has(key)) adjacency.set(key, new Set([key]));
  };

  for (const edge of equivalences) {
    const from = edge.from.trim().toLowerCase();
    const to = edge.to.trim().toLowerCase();
    if (!from || !to) continue;
    touch(from);
    touch(to);
    adjacency.get(from)!.add(to);
    if (edge.bidirectional !== false) {
      adjacency.get(to)!.add(from);
    }
  }

  const out = new Set<string>();
  for (const raw of values) {
    const key = raw.trim().toLowerCase();
    if (!key) continue;
    const syn = adjacency.get(key);
    if (syn) {
      for (const value of syn) out.add(value);
    } else {
      out.add(key);
    }
  }
  return [...out];
}

/**
 * Jaccard-like overlap. Missing/empty data on either side yields 0 (never a positive match).
 */
export function overlapScore(a: string[], b: string[]): number {
  const left = normalizeSet(a);
  const right = normalizeSet(b);
  if (left.size === 0 || right.size === 0) {
    return 0;
  }
  let intersection = 0;
  for (const value of left) {
    if (right.has(value)) {
      intersection += 1;
    }
  }
  const union = new Set([...left, ...right]).size;
  return union === 0 ? 0 : (intersection / union) * 100;
}

export type TagLabelIndex = ReadonlyMap<string, string> | Record<string, string>;

function labelLookup(index: TagLabelIndex | undefined, raw: string): string {
  const trimmed = raw.trim();
  if (!trimmed) return trimmed;
  const key = trimmed.toLowerCase();
  return toLabelMap(index).get(key) ?? trimmed;
}

function toLabelMap(index?: TagLabelIndex): Map<string, string> {
  if (!index) return new Map();
  if (index instanceof Map) return new Map(index);
  return new Map(Object.entries(index));
}

/**
 * Shared tags with Ethara display labels (not slugs).
 * Equivalences expand both sides before intersecting.
 * Equivalence-only overlaps render as "YourTag ↔ TheirTag".
 */
export function intersectDisplayTags(
  preferred: string[],
  other: string[],
  equivalences: TagEquivalence[] = [],
  limit = 4,
  tagLabels?: TagLabelIndex,
): string[] {
  const pairs = matchTagPairs(preferred, other, equivalences, tagLabels, limit);
  return pairs.map((pair) =>
    pair.viaEquivalence &&
    pair.viewerLabel.toLowerCase() !== pair.counterpartLabel.toLowerCase()
      ? `${pair.viewerLabel} ↔ ${pair.counterpartLabel}`
      : pair.viewerLabel,
  );
}

export type MatchedTagPair = {
  viewerLabel: string;
  counterpartLabel: string;
  viaEquivalence: boolean;
};

/**
 * Pair each viewer tag with a counterpart tag that overlaps after equivalences.
 */
export function matchTagPairs(
  viewer: string[],
  counterpart: string[],
  equivalences: TagEquivalence[] = [],
  tagLabels?: TagLabelIndex,
  limit = 4,
): MatchedTagPair[] {
  const labels = toLabelMap(tagLabels);
  const pairs: MatchedTagPair[] = [];
  const seen = new Set<string>();

  for (const viewerRaw of viewer) {
    const viewerKey = viewerRaw.trim().toLowerCase();
    if (!viewerKey) continue;
    const viewerExpanded = new Set(
      expandWithMappings([viewerRaw], equivalences),
    );

    for (const counterpartRaw of counterpart) {
      const counterpartKey = counterpartRaw.trim().toLowerCase();
      if (!counterpartKey) continue;
      const counterpartExpanded = new Set(
        expandWithMappings([counterpartRaw], equivalences),
      );

      let connected = false;
      for (const key of viewerExpanded) {
        if (counterpartExpanded.has(key)) {
          connected = true;
          break;
        }
      }
      if (!connected) continue;

      const id = `${viewerKey}::${counterpartKey}`;
      if (seen.has(id)) continue;
      seen.add(id);

      pairs.push({
        viewerLabel: labelLookup(labels, viewerRaw),
        counterpartLabel: labelLookup(labels, counterpartRaw),
        viaEquivalence: viewerKey !== counterpartKey,
      });
      if (pairs.length >= limit) return pairs;
    }
  }

  return pairs;
}

function formatTagList(tags: string[]): string {
  if (tags.length <= 2) return tags.join(' and ');
  return `${tags.slice(0, -1).join(', ')}, and ${tags[tags.length - 1]}`;
}

/**
 * Build short, user-facing reasons from overlapping profile dimensions.
 * Uses Ethara filter labels when provided so reasons match what users see.
 */
export function buildMatchReasons(
  company: ProfileFeatures,
  vendor: ProfileFeatures,
  breakdown: ScoreBreakdown,
  equivalences: TagEquivalence[] = [],
  tagLabels?: TagLabelIndex,
): string[] {
  const reasons: string[] = [];
  const threshold = 25;
  const resolve = (raw: string) => labelLookup(tagLabels, raw);

  if (breakdown.industry >= threshold) {
    const industry = resolve(
      company.industry?.trim() ||
        vendor.industry?.trim() ||
        'your industry',
    );
    reasons.push(`Same industry focus (${industry})`);
  }

  const needTags = intersectDisplayTags(
    company.requirements,
    vendor.capabilities,
    equivalences,
    4,
    tagLabels,
  );
  const categoryNeedTags = intersectDisplayTags(
    company.requirements,
    vendor.categories,
    equivalences,
    4,
    tagLabels,
  );

  if (breakdown.capability >= threshold || needTags.length > 0) {
    if (needTags.length) {
      reasons.push(`Matches your needs: ${formatTagList(needTags)}`);
    } else if (breakdown.capability >= threshold) {
      reasons.push('Strong overlap with the capabilities you need');
    }
  }

  if (
    (breakdown.requirements >= threshold || categoryNeedTags.length > 0) &&
    categoryNeedTags.length > 0 &&
    !(
      needTags.length &&
      categoryNeedTags.every((t) =>
        needTags.some((n) => n.toLowerCase() === t.toLowerCase()),
      )
    )
  ) {
    reasons.push(
      `Offers categories that fit your requirements: ${formatTagList(categoryNeedTags)}`,
    );
  } else if (
    breakdown.requirements >= threshold &&
    !needTags.length &&
    !categoryNeedTags.length
  ) {
    reasons.push('Categories and services fit what you are looking for');
  }

  if (breakdown.geography >= threshold) {
    const tags = intersectDisplayTags(
      company.regions,
      vendor.regions,
      equivalences,
      4,
      tagLabels,
    );
    reasons.push(
      tags.length
        ? `Shared regions: ${formatTagList(tags)}`
        : 'Overlapping geographic coverage',
    );
  }

  const preferenceTags = intersectDisplayTags(
    company.preferredCategories,
    vendor.categories.length ? vendor.categories : vendor.mutualPreferenceTags,
    equivalences,
    4,
    tagLabels,
  );
  if (breakdown.mutualPreferences >= threshold || preferenceTags.length > 0) {
    reasons.push(
      preferenceTags.length
        ? `Linked to your preferences: ${formatTagList(preferenceTags)}`
        : 'Matches categories you prefer to meet',
    );
  }

  if (breakdown.commercial >= threshold) {
    const tags = intersectDisplayTags(
      company.commercialTags,
      vendor.commercialTags,
      equivalences,
      4,
      tagLabels,
    );
    reasons.push(
      tags.length
        ? `Similar commercial profile: ${formatTagList(tags)}`
        : 'Compatible commercial profile',
    );
  }

  return reasons.slice(0, 4);
}

export function industryScore(
  companyIndustry?: string | null,
  vendorIndustry?: string | null,
  equivalences: TagEquivalence[] = [],
): number {
  if (!companyIndustry || !vendorIndustry) {
    return 0;
  }
  if (!equivalences.length) {
    return companyIndustry.trim().toLowerCase() ===
      vendorIndustry.trim().toLowerCase()
      ? 100
      : 0;
  }
  return overlapScore(
    expandWithMappings([companyIndustry], equivalences),
    expandWithMappings([vendorIndustry], equivalences),
  );
}

/**
 * Deterministic weighted score on a 0–100 scale.
 * Missing dimensions contribute 0 and are listed for explainability.
 * Optional tag equivalences expand categories/industry before overlap.
 */
export function calculateMatchScore(
  company: ProfileFeatures,
  vendor: ProfileFeatures,
  weights: MatchingWeights = defaultMatchingWeights,
  equivalences: TagEquivalence[] = [],
  tagLabels?: TagLabelIndex,
): MatchScoreResult {
  const expand = (values: string[]) =>
    expandWithMappings(values, equivalences);

  const breakdown: ScoreBreakdown = {
    capability: overlapScore(
      expand(company.requirements),
      expand(vendor.capabilities),
    ),
    industry: industryScore(
      company.industry,
      vendor.industry,
      equivalences,
    ),
    // Ethara-aligned: client needs vs guest event categories / services
    requirements: Math.max(
      overlapScore(expand(company.requirements), expand(vendor.categories)),
      overlapScore(expand(company.requirements), expand(vendor.capabilities)),
    ),
    geography: overlapScore(expand(company.regions), expand(vendor.regions)),
    commercial: overlapScore(
      expand(company.commercialTags),
      expand(vendor.commercialTags),
    ),
    // Client preferred Ethara categories ↔ guest event categories
    mutualPreferences: overlapScore(
      expand(company.preferredCategories),
      expand(
        vendor.categories.length
          ? vendor.categories
          : vendor.mutualPreferenceTags,
      ),
    ),
  };

  const missingDimensions: string[] = [];
  if (company.requirements.length === 0 || vendor.capabilities.length === 0) {
    missingDimensions.push('capability');
  }
  if (!company.industry || !vendor.industry) {
    missingDimensions.push('industry');
  }
  if (company.regions.length === 0 || vendor.regions.length === 0) {
    missingDimensions.push('geography');
  }

  const totalScore =
    breakdown.capability * weights.capability +
    breakdown.industry * weights.industry +
    breakdown.requirements * weights.requirements +
    breakdown.geography * weights.geography +
    breakdown.commercial * weights.commercial +
    breakdown.mutualPreferences * weights.mutualPreferences;

  const rounded = Math.round(totalScore * 100) / 100;
  const reasons = buildMatchReasons(
    company,
    vendor,
    breakdown,
    equivalences,
    tagLabels,
  );

  const parts = [
    `capability ${breakdown.capability.toFixed(0)}`,
    `industry ${breakdown.industry.toFixed(0)}`,
    `requirements ${breakdown.requirements.toFixed(0)}`,
    `geography ${breakdown.geography.toFixed(0)}`,
    `commercial ${breakdown.commercial.toFixed(0)}`,
    `preferences ${breakdown.mutualPreferences.toFixed(0)}`,
  ];

  const technical = `Score ${rounded}/100 from weighted dimensions (${parts.join(', ')}).${
    missingDimensions.length
      ? ` Incomplete data for: ${missingDimensions.join(', ')} (scored as 0).`
      : ''
  }`;

  const explanation = reasons.length
    ? `${reasons.join(' · ')} (${technical})`
    : technical;

  return {
    totalScore: rounded,
    breakdown,
    reasons,
    explanation,
    missingDimensions,
  };
}
