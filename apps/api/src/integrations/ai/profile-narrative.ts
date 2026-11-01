import type { ProfileFeatures } from '@em/domain';
import { formatTicketSize } from '@em/domain';

type TagLabels = Record<string, string> | undefined;

/** Keys that must never be sent to the model. */
const CONTACT_KEY_RE =
  /^(email|phone|mobile|whatsapp|linkedin|contact|first_?name|last_?name|full_?name|job_?title|title|name)$/i;

/** Structured fields already represented on the matchmaking cards. */
const ALREADY_ON_CARD = new Set([
  'organization_summary',
  'about',
  'focus_events',
  'focusEvents',
  'partnership_goal',
  'impact_metrics',
  'investment_stages',
  'ticket_size',
  'categories',
  'preferredCategories',
  'capabilities',
  'requiredCapabilities',
  'regions',
  'operatingRegions',
  'commercial_tags',
  'commercialTags',
  'industry',
]);

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

function formatResponseValue(value: unknown): string {
  if (value == null) return '';
  if (typeof value === 'string') return value.trim();
  if (typeof value === 'number' || typeof value === 'boolean') {
    return String(value);
  }
  if (Array.isArray(value)) {
    return value
      .map((item) => {
        if (typeof item === 'string') return item.trim();
        if (item && typeof item === 'object' && 'label' in item) {
          return String((item as { label: unknown }).label ?? '').trim();
        }
        if (item && typeof item === 'object' && 'value' in item) {
          return String((item as { value: unknown }).value ?? '').trim();
        }
        return '';
      })
      .filter(Boolean)
      .join(', ');
  }
  return '';
}

/**
 * Append safe free-text from onboarding responses (skips contact + fields
 * already shown on the structured card).
 */
export function appendOnboardingNarrative(
  card: string,
  normalized: unknown,
): string {
  if (!normalized || typeof normalized !== 'object' || Array.isArray(normalized)) {
    return card;
  }
  const responses = (normalized as Record<string, unknown>).responses;
  if (!responses || typeof responses !== 'object' || Array.isArray(responses)) {
    return card;
  }

  const extras: string[] = [];
  for (const [key, value] of Object.entries(
    responses as Record<string, unknown>,
  )) {
    if (CONTACT_KEY_RE.test(key) || ALREADY_ON_CARD.has(key)) continue;
    if (/email|phone|linkedin|whatsapp|mobile|contact/i.test(key)) continue;
    const text = formatResponseValue(value);
    if (!text || text.length < 12) continue;
    const label = key.replace(/_/g, ' ');
    extras.push(`${label}: ${text.slice(0, 400)}`);
    if (extras.length >= 10) break;
  }

  if (!extras.length) return card;
  return `${card}\n\nAdditional onboarding context:\n${extras.join('\n')}`;
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
  const isInvestor =
    features.requirements.length > 0 ||
    features.preferredCategories.length > 0;
  const base =
    isInvestor && features.capabilities.length === 0
      ? buildInvestorMatchmakingCard(features)
      : buildInnovatorMatchmakingCard(features);
  if (options?.includeOnboardingResponses) {
    return appendOnboardingNarrative(base, normalized);
  }
  return base;
}

export function buildMatchmakingPairCards(input: {
  company: ProfileFeatures;
  vendor: ProfileFeatures;
  tagLabels?: TagLabels;
  companyNormalized?: unknown;
  vendorNormalized?: unknown;
  includeOnboardingResponses?: boolean;
}): { investor: string; innovator: string } {
  let investor = buildInvestorMatchmakingCard(input.company, input.tagLabels);
  let innovator = buildInnovatorMatchmakingCard(input.vendor, input.tagLabels);
  if (input.includeOnboardingResponses) {
    investor = appendOnboardingNarrative(investor, input.companyNormalized);
    innovator = appendOnboardingNarrative(innovator, input.vendorNormalized);
  }
  return { investor, innovator };
}
