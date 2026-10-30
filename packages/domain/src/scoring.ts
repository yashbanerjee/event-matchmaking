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

  const parts = [
    `capability ${breakdown.capability.toFixed(0)}`,
    `industry ${breakdown.industry.toFixed(0)}`,
    `requirements ${breakdown.requirements.toFixed(0)}`,
    `geography ${breakdown.geography.toFixed(0)}`,
    `commercial ${breakdown.commercial.toFixed(0)}`,
    `preferences ${breakdown.mutualPreferences.toFixed(0)}`,
  ];

  const explanation = `Score ${rounded}/100 from weighted dimensions (${parts.join(', ')}).${
    missingDimensions.length
      ? ` Incomplete data for: ${missingDimensions.join(', ')} (scored as 0).`
      : ''
  }`;

  return {
    totalScore: rounded,
    breakdown,
    explanation,
    missingDimensions,
  };
}
