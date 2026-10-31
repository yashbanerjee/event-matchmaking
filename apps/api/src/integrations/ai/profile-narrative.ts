import type { ProfileFeatures } from '@em/domain';
import { formatTicketSize } from '@em/domain';

type TagLabels = Record<string, string> | undefined;

function labelTag(raw: string, labels?: TagLabels): string {
  const key = raw.trim().toLowerCase();
  if (!key) return raw;
  return labels?.[key] ?? labels?.[raw] ?? raw;
}

function formatTagList(values: string[], labels?: TagLabels): string {
  const parts = values.map((v) => labelTag(v, labels)).filter(Boolean);
  return parts.length ? parts.join(', ') : '—';
}

function formatStages(values: string[], labels?: TagLabels): string {
  return formatTagList(values, labels);
}

/**
 * Structured investor card for LLM pair scoring (no raw form key dump).
 */
export function buildInvestorMatchmakingCard(
  features: ProfileFeatures,
  tagLabels?: TagLabels,
): string {
  const lines = [
    features.industry ? `Type: ${features.industry}` : '',
    features.about ? `Thesis: ${features.about}` : '',
    features.focusEvents ? `Event goal: ${features.focusEvents}` : '',
    features.preferredCategories.length
      ? `Funds water challenges: ${formatTagList(features.preferredCategories, tagLabels)}`
      : '',
    features.regions.length
      ? `Priority geographies: ${formatTagList(features.regions, tagLabels)}`
      : '',
    features.requirements.length
      ? `Solution types of interest: ${formatTagList(features.requirements, tagLabels)}`
      : '',
    features.commercialTags.length
      ? `Instruments: ${formatTagList(features.commercialTags, tagLabels)}`
      : '',
    features.investmentStages.length
      ? `Preferred stages: ${formatStages(features.investmentStages, tagLabels)}`
      : '',
    features.ticketSize
      ? `Typical ticket: ${formatTicketSize(features.ticketSize)}`
      : '',
    features.partnershipGoal
      ? `Meeting success: ${features.partnershipGoal}`
      : '',
  ];
  return lines.filter(Boolean).join('\n');
}

/**
 * Structured innovator card for LLM pair scoring.
 */
export function buildInnovatorMatchmakingCard(
  features: ProfileFeatures,
  tagLabels?: TagLabels,
): string {
  const categories =
    features.categories.length > 0
      ? features.categories
      : features.mutualPreferenceTags;

  const lines = [
    features.industry ? `Type: ${features.industry}` : '',
    features.about ? `Solution: ${features.about}` : '',
    features.focusEvents ? `Event goal: ${features.focusEvents}` : '',
    categories.length
      ? `Addresses challenges: ${formatTagList(categories, tagLabels)}`
      : '',
    features.regions.length
      ? `Deploys in: ${formatTagList(features.regions, tagLabels)}`
      : '',
    features.capabilities.length
      ? `Capabilities: ${formatTagList(features.capabilities, tagLabels)}`
      : '',
    features.investmentStages.length
      ? `Maturity: ${formatStages(features.investmentStages, tagLabels)}`
      : '',
    features.commercialTags.length
      ? `Seeking: ${formatTagList(features.commercialTags, tagLabels)}`
      : '',
    features.ticketSize
      ? `Capital sought: ${formatTicketSize(features.ticketSize)}`
      : '',
    features.impactMetrics ? `Impact & traction: ${features.impactMetrics}` : '',
    features.partnershipGoal
      ? `Meeting success: ${features.partnershipGoal}`
      : '',
  ];
  return lines.filter(Boolean).join('\n');
}

/** @deprecated Use role-specific cards; kept for embedding similarity fallback. */
export function buildMatchmakingProfileText(
  features: ProfileFeatures,
  normalized?: Record<string, unknown> | null,
  options?: { includeOnboardingResponses?: boolean },
): string {
  void options;
  void normalized;
  const isInvestor =
    features.requirements.length > 0 ||
    features.preferredCategories.length > 0;
  if (isInvestor && features.capabilities.length === 0) {
    return buildInvestorMatchmakingCard(features);
  }
  return buildInnovatorMatchmakingCard(features);
}

export function buildMatchmakingPairCards(input: {
  company: ProfileFeatures;
  vendor: ProfileFeatures;
  tagLabels?: TagLabels;
}): { investor: string; innovator: string } {
  return {
    investor: buildInvestorMatchmakingCard(input.company, input.tagLabels),
    innovator: buildInnovatorMatchmakingCard(input.vendor, input.tagLabels),
  };
}
