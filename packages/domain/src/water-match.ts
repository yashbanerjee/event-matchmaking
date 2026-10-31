/** Ordered ticket bands from water onboarding forms. */
export const TICKET_SIZE_ORDER = [
  'under-250k',
  '250k-1m',
  '1m-5m',
  '5m-25m',
  '25m-plus',
] as const;

export const INVESTMENT_STAGE_ORDER = [
  'pilot',
  'early-revenue',
  'growth',
  'infrastructure',
  'buyout',
] as const;

const TICKET_LABELS: Record<string, string> = {
  'under-250k': 'Under USD 250k',
  '250k-1m': 'USD 250k – 1m',
  '1m-5m': 'USD 1m – 5m',
  '5m-25m': 'USD 5m – 25m',
  '25m-plus': 'USD 25m+',
};

export function formatTicketSize(slug: string | null | undefined): string {
  if (!slug?.trim()) return '';
  const key = slug.trim().toLowerCase();
  return TICKET_LABELS[key] ?? slug;
}

function normalizeSlug(value: string): string {
  return value.trim().toLowerCase();
}

function expandedSet(values: string[], expand: (v: string[]) => string[]): Set<string> {
  return new Set(expand(values).map(normalizeSlug).filter(Boolean));
}

/**
 * How much of the investor mandate is covered by the innovator (0–100).
 * Empty investor mandate → 0.
 */
export function mandateCoverageScore(
  investorMandate: string[],
  innovatorTags: string[],
  expand: (values: string[]) => string[] = (v) => v,
): number {
  const mandate = expandedSet(investorMandate, expand);
  if (mandate.size === 0) return 0;
  const innovator = expandedSet(innovatorTags, expand);
  if (innovator.size === 0) return 0;
  let hit = 0;
  for (const tag of mandate) {
    if (innovator.has(tag)) hit += 1;
  }
  return (hit / mandate.size) * 100;
}

const GLOBAL_REGION = 'global';

/**
 * Region overlap with softer handling for "global" tags.
 */
export function geographyMatchScore(
  investorRegions: string[],
  innovatorRegions: string[],
  expand: (values: string[]) => string[] = (v) => v,
): number {
  const inv = expandedSet(investorRegions, expand);
  const inn = expandedSet(innovatorRegions, expand);
  if (inv.size === 0 || inn.size === 0) return 0;

  const invHasGlobal = inv.has(GLOBAL_REGION);
  const innHasGlobal = inn.has(GLOBAL_REGION);

  let intersection = 0;
  for (const tag of inv) {
    if (inn.has(tag)) intersection += 1;
  }
  if (intersection > 0) {
    const union = new Set([...inv, ...inn]).size;
    return union === 0 ? 0 : (intersection / union) * 100;
  }

  if (invHasGlobal || innHasGlobal) {
    return 55;
  }
  return 0;
}

function stageIndex(slug: string): number {
  const key = normalizeSlug(slug);
  return INVESTMENT_STAGE_ORDER.indexOf(key as (typeof INVESTMENT_STAGE_ORDER)[number]);
}

/**
 * Investor preferred stages vs innovator maturity (single or list).
 */
export function stageFitScore(
  investorStages: string[],
  innovatorStages: string | string[],
): number {
  const investor = investorStages.map(normalizeSlug).filter(Boolean);
  const innovator = (
    Array.isArray(innovatorStages) ? innovatorStages : [innovatorStages]
  )
    .map(normalizeSlug)
    .filter(Boolean);
  if (investor.length === 0 || innovator.length === 0) return 0;

  let best = 0;
  for (const inn of innovator) {
    const innIdx = stageIndex(inn);
    if (innIdx < 0) continue;
    if (investor.includes(inn)) {
      best = Math.max(best, 100);
      continue;
    }
    for (const inv of investor) {
      const invIdx = stageIndex(inv);
      if (invIdx < 0) continue;
      const dist = Math.abs(invIdx - innIdx);
      if (dist === 0) best = Math.max(best, 100);
      else if (dist === 1) best = Math.max(best, 60);
      else if (dist === 2) best = Math.max(best, 20);
    }
  }
  return best;
}

/**
 * Ticket band compatibility (ordered buckets).
 */
export function ticketFitScore(
  investorTicket: string | null | undefined,
  innovatorTicket: string | null | undefined,
): number {
  const invIdx = investorTicket ? stageIndexForTicket(investorTicket) : -1;
  const innIdx = innovatorTicket ? stageIndexForTicket(innovatorTicket) : -1;
  if (invIdx < 0 || innIdx < 0) return 0;
  const dist = Math.abs(invIdx - innIdx);
  if (dist === 0) return 100;
  if (dist === 1) return 60;
  if (dist === 2) return 20;
  return 0;
}

function stageIndexForTicket(slug: string): number {
  const key = normalizeSlug(slug);
  return TICKET_SIZE_ORDER.indexOf(key as (typeof TICKET_SIZE_ORDER)[number]);
}

/** Soft 0–5 bonus for complementary org types (not weighted). */
export function orgTypeBonusPoints(
  investorType?: string | null,
  innovatorType?: string | null,
): number {
  const inv = (investorType ?? '').trim().toLowerCase();
  const inn = (innovatorType ?? '').trim().toLowerCase();
  if (!inv || !inn) return 0;
  if (inv === inn) return 2;

  const pairs: Array<[RegExp, RegExp, number]> = [
    [/development finance|sovereign|utility|municipality/, /ngo|social enterprise|community/, 5],
    [/venture capital|corporate|strategic/, /startup|scale-up/, 5],
    [/impact|climate fund/, /startup|scale-up|project developer/, 4],
    [/private equity/, /growth|infrastructure|project developer/, 4],
    [/philanthropy|foundation/, /ngo|social enterprise/, 4],
    [/corporate|strategic/, /technology provider|utility|operator/, 3],
  ];
  for (const [invRe, innRe, pts] of pairs) {
    if (invRe.test(inv) && innRe.test(inn)) return pts;
  }
  return 0;
}

/**
 * Pick top N items while limiting duplicates on a primary diversity key.
 */
export function selectDiverseTop<T>(
  sorted: T[],
  limit: number,
  primaryKey: (item: T) => string,
  maxPerPrimary = 2,
): T[] {
  const picked: T[] = [];
  const counts = new Map<string, number>();

  for (const item of sorted) {
    if (picked.length >= limit) break;
    const key = primaryKey(item).trim().toLowerCase() || '__none__';
    const count = counts.get(key) ?? 0;
    if (count >= maxPerPrimary) continue;
    picked.push(item);
    counts.set(key, count + 1);
  }

  if (picked.length < limit) {
    for (const item of sorted) {
      if (picked.length >= limit) break;
      if (picked.includes(item)) continue;
      picked.push(item);
    }
  }

  return picked;
}
