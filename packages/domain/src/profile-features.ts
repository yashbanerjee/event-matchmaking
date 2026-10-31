import type { ProfileFeatures } from './scoring.js';

export type CommercialPrefsJson = {
  tags?: string[];
  investmentStages?: string[];
  ticketSize?: string | null;
};

function asStringArray(value: unknown): string[] {
  if (!value) return [];
  if (Array.isArray(value)) {
    return value
      .map((v) => (typeof v === 'string' ? v.trim() : String(v).trim()))
      .filter(Boolean);
  }
  if (typeof value === 'string' && value.trim()) return [value.trim()];
  return [];
}

function firstString(value: unknown): string | null {
  if (typeof value === 'string' && value.trim()) return value.trim();
  return null;
}

function readCommercialPrefs(raw: unknown): CommercialPrefsJson {
  return (raw ?? {}) as CommercialPrefsJson;
}

export function companyToProfileFeatures(input: {
  organizationId: string;
  preferredCategories: string[];
  requiredCapabilities: string[];
  commercialPrefs: unknown;
  normalizedProfile?: unknown;
  organization: { industry: string | null; region: string | null };
}): ProfileFeatures {
  const prefs = readCommercialPrefs(input.commercialPrefs);
  const normalized = (input.normalizedProfile ?? {}) as Record<string, unknown>;
  const responses = (normalized.responses ?? {}) as Record<string, unknown>;

  const regionTags = Array.isArray(normalized.regions)
    ? (normalized.regions as string[]).filter((v) => typeof v === 'string')
    : [];

  const investmentStages =
    asStringArray(prefs.investmentStages).length > 0
      ? asStringArray(prefs.investmentStages)
      : asStringArray(responses.investment_stages);

  const ticketSize =
    firstString(prefs.ticketSize) ??
    firstString(normalized.ticketSize) ??
    firstString(responses.ticket_size);

  return {
    organizationId: input.organizationId,
    industry: input.organization.industry,
    capabilities: [],
    categories: input.preferredCategories,
    regions:
      regionTags.length > 0
        ? regionTags
        : input.organization.region
          ? [input.organization.region]
          : [],
    requirements: input.requiredCapabilities,
    preferredCategories: input.preferredCategories,
    commercialTags: asStringArray(prefs.tags),
    mutualPreferenceTags: [],
    investmentStages,
    ticketSize,
    partnershipGoal:
      firstString(normalized.partnershipGoal) ??
      firstString(responses.partnership_goal),
    impactMetrics: null,
    about:
      firstString(normalized.about) ??
      firstString(responses.organization_summary),
    focusEvents:
      firstString(normalized.focusEvents) ??
      firstString(responses.focus_events),
  };
}

export function vendorToProfileFeatures(input: {
  organizationId: string;
  capabilities: string[];
  categories: string[];
  operatingRegions: string[];
  commercialPrefs: unknown;
  normalizedProfile?: unknown;
  organization: { industry: string | null };
}): ProfileFeatures {
  const prefs = readCommercialPrefs(input.commercialPrefs);
  const normalized = (input.normalizedProfile ?? {}) as Record<string, unknown>;
  const responses = (normalized.responses ?? {}) as Record<string, unknown>;

  const investmentStages =
    asStringArray(prefs.investmentStages).length > 0
      ? asStringArray(prefs.investmentStages)
      : asStringArray(responses.investment_stages);

  const ticketSize =
    firstString(prefs.ticketSize) ??
    firstString(normalized.ticketSize) ??
    firstString(responses.ticket_size);

  return {
    organizationId: input.organizationId,
    industry: input.organization.industry,
    capabilities: input.capabilities,
    categories: input.categories,
    regions: input.operatingRegions,
    requirements: [],
    preferredCategories: [],
    commercialTags: asStringArray(prefs.tags),
    mutualPreferenceTags: input.categories,
    investmentStages,
    ticketSize,
    partnershipGoal:
      firstString(normalized.partnershipGoal) ??
      firstString(responses.partnership_goal),
    impactMetrics:
      firstString(normalized.impactMetrics) ??
      firstString(responses.impact_metrics),
    about:
      firstString(normalized.about) ??
      firstString(responses.organization_summary),
    focusEvents:
      firstString(normalized.focusEvents) ??
      firstString(responses.focus_events),
  };
}
