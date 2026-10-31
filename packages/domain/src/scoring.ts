import {
  defaultMatchingWeights,
  type MatchingWeights,
} from '@em/shared';
import {
  geographyMatchScore,
  mandateCoverageScore,
  orgTypeBonusPoints,
  stageFitScore,
  ticketFitScore,
} from './water-match.js';

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
  investmentStages: string[];
  ticketSize: string | null;
  partnershipGoal?: string | null;
  impactMetrics?: string | null;
  about?: string | null;
  focusEvents?: string | null;
}

export interface ScoreBreakdown {
  challenge: number;
  solution: number;
  geography: number;
  commercial: number;
  stage: number;
  ticket: number;
  orgTypeBonus: number;
}

export interface MatchScoreResult {
  totalScore: number;
  breakdown: ScoreBreakdown;
  /** Human-readable bullets for “why this match” UIs */
  reasons: string[];
  explanation: string;
  missingDimensions: string[];
  /** Overlapping challenge tags (for diversity when picking top recs). */
  matchedChallengeTags: string[];
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

function matchedChallengeSlugs(
  company: ProfileFeatures,
  vendor: ProfileFeatures,
  equivalences: TagEquivalence[],
): string[] {
  const investor = expandWithMappings(company.preferredCategories, equivalences);
  const innovator = expandWithMappings(
    vendor.categories.length ? vendor.categories : vendor.mutualPreferenceTags,
    equivalences,
  );
  const innovatorSet = new Set(innovator.map((t) => t.toLowerCase()));
  return investor.filter((t) => innovatorSet.has(t.toLowerCase()));
}

/**
 * Build short, user-facing reasons from overlapping profile dimensions.
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

  const challengeTags = intersectDisplayTags(
    company.preferredCategories,
    vendor.categories.length ? vendor.categories : vendor.mutualPreferenceTags,
    equivalences,
    4,
    tagLabels,
  );
  if (breakdown.challenge >= threshold || challengeTags.length > 0) {
    reasons.push(
      challengeTags.length
        ? `Water challenges in common: ${formatTagList(challengeTags)}`
        : 'Strong alignment on water challenges you fund',
    );
  }

  const solutionTags = intersectDisplayTags(
    company.requirements,
    vendor.capabilities,
    equivalences,
    4,
    tagLabels,
  );
  if (breakdown.solution >= threshold || solutionTags.length > 0) {
    reasons.push(
      solutionTags.length
        ? `Solution fit: ${formatTagList(solutionTags)}`
        : 'Innovator capabilities match solutions you seek',
    );
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
        ? `Shared geographies: ${formatTagList(tags)}`
        : 'Compatible geographic focus',
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
        ? `Capital / partnership overlap: ${formatTagList(tags)}`
        : 'Compatible capital or partnership instruments',
    );
  }

  if (breakdown.stage >= threshold) {
    reasons.push('Stage maturity fits your preferred investment stages');
  }

  if (breakdown.ticket >= threshold) {
    reasons.push('Ticket size bands are compatible');
  }

  if (breakdown.orgTypeBonus >= 3) {
    reasons.push('Complementary investor and innovator profiles');
  }

  return reasons.slice(0, 4);
}

/**
 * Deterministic weighted score on a 0–100 scale (plus up to +5 org-type bonus).
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

  const innovatorCategories =
    vendor.categories.length > 0
      ? vendor.categories
      : vendor.mutualPreferenceTags;

  const breakdown: ScoreBreakdown = {
    challenge: mandateCoverageScore(
      company.preferredCategories,
      innovatorCategories,
      expand,
    ),
    solution: mandateCoverageScore(
      company.requirements,
      vendor.capabilities,
      expand,
    ),
    geography: geographyMatchScore(company.regions, vendor.regions, expand),
    commercial: overlapScore(
      expand(company.commercialTags),
      expand(vendor.commercialTags),
    ),
    stage: stageFitScore(
      company.investmentStages,
      vendor.investmentStages,
    ),
    ticket: ticketFitScore(company.ticketSize, vendor.ticketSize),
    orgTypeBonus: orgTypeBonusPoints(company.industry, vendor.industry),
  };

  const missingDimensions: string[] = [];
  if (
    company.preferredCategories.length === 0 ||
    innovatorCategories.length === 0
  ) {
    missingDimensions.push('challenge');
  }
  if (company.requirements.length === 0 || vendor.capabilities.length === 0) {
    missingDimensions.push('solution');
  }
  if (company.regions.length === 0 || vendor.regions.length === 0) {
    missingDimensions.push('geography');
  }
  if (company.investmentStages.length === 0 || vendor.investmentStages.length === 0) {
    missingDimensions.push('stage');
  }
  if (!company.ticketSize || !vendor.ticketSize) {
    missingDimensions.push('ticket');
  }

  const weighted =
    breakdown.challenge * weights.challenge +
    breakdown.solution * weights.solution +
    breakdown.geography * weights.geography +
    breakdown.commercial * weights.commercial +
    breakdown.stage * weights.stage +
    breakdown.ticket * weights.ticket;

  const totalScore = Math.min(
    100,
    Math.round((weighted + breakdown.orgTypeBonus) * 100) / 100,
  );

  const reasons = buildMatchReasons(
    company,
    vendor,
    breakdown,
    equivalences,
    tagLabels,
  );

  const parts = [
    `challenge ${breakdown.challenge.toFixed(0)}`,
    `solution ${breakdown.solution.toFixed(0)}`,
    `geography ${breakdown.geography.toFixed(0)}`,
    `commercial ${breakdown.commercial.toFixed(0)}`,
    `stage ${breakdown.stage.toFixed(0)}`,
    `ticket ${breakdown.ticket.toFixed(0)}`,
    `orgType +${breakdown.orgTypeBonus.toFixed(0)}`,
  ];

  const technical = `Score ${totalScore}/100 from weighted dimensions (${parts.join(', ')}).${
    missingDimensions.length
      ? ` Incomplete data for: ${missingDimensions.join(', ')} (scored as 0).`
      : ''
  }`;

  const explanation = reasons.length
    ? `${reasons.join(' · ')} (${technical})`
    : technical;

  return {
    totalScore,
    breakdown,
    reasons,
    explanation,
    missingDimensions,
    matchedChallengeTags: matchedChallengeSlugs(company, vendor, equivalences),
  };
}
