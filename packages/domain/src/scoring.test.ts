import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  calculateMatchScore,
  expandWithMappings,
  overlapScore,
} from './scoring.js';

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
  it('produces explainable weighted score', () => {
    const result = calculateMatchScore(
      {
        organizationId: 'c1',
        industry: 'Manufacturing',
        capabilities: [],
        categories: [],
        regions: ['EU'],
        requirements: ['CNC', 'ISO9001'],
        preferredCategories: ['manufacturing'],
        commercialTags: ['net30'],
        mutualPreferenceTags: [],
      },
      {
        organizationId: 'v1',
        industry: 'Manufacturing',
        capabilities: ['CNC', 'ISO9001', 'Welding'],
        categories: ['manufacturing'],
        regions: ['EU', 'UK'],
        requirements: [],
        preferredCategories: [],
        commercialTags: ['net30'],
        mutualPreferenceTags: [],
      },
    );

    assert.ok(result.totalScore > 40);
    assert.ok(result.explanation.includes('Score'));
    assert.ok(result.reasons.length > 0);
    assert.ok(
      result.reasons.some((r) => r.toLowerCase().includes('industry')),
    );
    assert.ok(
      result.reasons.some((r) => r.toLowerCase().includes('cnc')),
    );
    assert.equal(result.breakdown.industry, 100);
  });

  it('does not treat missing data as a positive match', () => {
    const result = calculateMatchScore(
      {
        organizationId: 'c1',
        industry: null,
        capabilities: [],
        categories: [],
        regions: [],
        requirements: [],
        preferredCategories: [],
        commercialTags: [],
        mutualPreferenceTags: [],
      },
      {
        organizationId: 'v1',
        industry: null,
        capabilities: [],
        categories: [],
        regions: [],
        requirements: [],
        preferredCategories: [],
        commercialTags: [],
        mutualPreferenceTags: [],
      },
    );

    assert.equal(result.totalScore, 0);
    assert.ok(result.missingDimensions.includes('capability'));
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
      {
        organizationId: 'c1',
        industry: null,
        capabilities: [],
        categories: [],
        regions: [],
        requirements: [],
        preferredCategories: ['food'],
        commercialTags: [],
        mutualPreferenceTags: [],
      },
      {
        organizationId: 'v1',
        industry: null,
        capabilities: [],
        categories: ['hotel'],
        regions: [],
        requirements: [],
        preferredCategories: [],
        commercialTags: [],
        mutualPreferenceTags: [],
      },
      undefined,
      equivalences,
    );

    assert.equal(result.breakdown.mutualPreferences, 100);
  });
});
