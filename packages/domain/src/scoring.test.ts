import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  calculateMatchScore,
  expandWithMappings,
  overlapScore,
} from './scoring.js';

const baseInvestor = {
  organizationId: 'c1',
  industry: 'Venture capital',
  capabilities: [] as string[],
  categories: [] as string[],
  regions: ['mena'],
  requirements: ['treatment-tech', 'data-ai'],
  preferredCategories: ['drinking-water', 'water-quality'],
  commercialTags: ['equity'],
  mutualPreferenceTags: [] as string[],
  investmentStages: ['early-revenue', 'growth'],
  ticketSize: '1m-5m',
};

const baseInnovator = {
  organizationId: 'v1',
  industry: 'Startup / scale-up',
  capabilities: ['treatment-tech', 'data-ai'],
  categories: ['drinking-water'],
  regions: ['mena', 'gcc'],
  requirements: [] as string[],
  preferredCategories: [] as string[],
  commercialTags: ['equity'],
  mutualPreferenceTags: ['drinking-water'],
  investmentStages: ['early-revenue'],
  ticketSize: '250k-1m',
};

describe('overlapScore', () => {
  it('returns 0 when either side is empty', () => {
    assert.equal(overlapScore([], ['a']), 0);
    assert.equal(overlapScore(['a'], []), 0);
  });

  it('returns 100 for identical sets', () => {
    assert.equal(overlapScore(['Logistics'], ['logistics']), 100);
  });
});

describe('calculateMatchScore', () => {
  it('scores water complementarity with stage and ticket', () => {
    const result = calculateMatchScore(baseInvestor, baseInnovator);

    assert.ok(result.totalScore > 50);
    assert.ok(result.breakdown.challenge > 0);
    assert.ok(result.breakdown.solution > 0);
    assert.ok(result.breakdown.stage >= 60);
    assert.ok(result.breakdown.ticket >= 60);
    assert.ok(result.matchedChallengeTags.includes('drinking-water'));
    assert.ok(result.reasons.length > 0);
  });

  it('does not treat missing data as a positive match', () => {
    const empty = {
      ...baseInvestor,
      industry: null,
      preferredCategories: [],
      requirements: [],
      regions: [],
      commercialTags: [],
      investmentStages: [],
      ticketSize: null,
    };
    const emptyVendor = {
      ...baseInnovator,
      industry: null,
      categories: [],
      capabilities: [],
      regions: [],
      commercialTags: [],
      investmentStages: [],
      ticketSize: null,
    };

    const result = calculateMatchScore(empty, emptyVendor);
    assert.equal(result.totalScore, 0);
    assert.ok(result.missingDimensions.length > 0);
  });

  it('matches preferred categories through tag equivalences', () => {
    const equivalences = [
      { from: 'food', to: 'hotel', bidirectional: true },
    ];
    assert.deepEqual(expandWithMappings(['food'], equivalences).sort(), [
      'food',
      'hotel',
    ]);

    const result = calculateMatchScore(
      { ...baseInvestor, preferredCategories: ['food'] },
      { ...baseInnovator, categories: ['hotel'] },
      undefined,
      equivalences,
    );

    assert.equal(result.breakdown.challenge, 100);
  });

  it('explains equivalence matches with display labels', () => {
    const equivalences = [
      { from: 'concerts', to: 'arts-culture', bidirectional: true },
    ];
    const tagLabels = {
      concerts: 'Concerts',
      'arts-culture': 'Arts & Culture',
    };

    const result = calculateMatchScore(
      { ...baseInvestor, preferredCategories: ['concerts'] },
      { ...baseInnovator, categories: ['arts-culture'] },
      undefined,
      equivalences,
      tagLabels,
    );

    assert.equal(result.breakdown.challenge, 100);
    assert.ok(
      result.reasons.some((reason) =>
        reason.includes('Concerts ↔ Arts & Culture'),
      ),
    );
  });
});
