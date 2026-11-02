import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { blendPreferenceAwareScore } from './matching.js';

describe('blendPreferenceAwareScore', () => {
  it('does not let AI rescue a weak preference pair', () => {
    const total = blendPreferenceAwareScore({
      ruleScore: 40,
      aiScore: 95,
      blend: 0.3,
      challenge: 10,
      geography: 10,
      stage: 10,
    });
    assert.ok(total < 55, `expected weak-preference total under 55, got ${total}`);
    assert.ok(total <= 45, `expected little AI lift, got ${total}`);
  });

  it('allows AI to refine strong preference pairs', () => {
    const total = blendPreferenceAwareScore({
      ruleScore: 72,
      aiScore: 90,
      blend: 0.25,
      challenge: 80,
      geography: 70,
      stage: 75,
    });
    assert.ok(total > 72, `expected AI uplift on strong fit, got ${total}`);
    assert.ok(total <= 90, `expected capped uplift, got ${total}`);
  });

  it('returns rule score when blend is zero', () => {
    assert.equal(
      blendPreferenceAwareScore({
        ruleScore: 66,
        aiScore: 99,
        blend: 0,
        challenge: 80,
        geography: 80,
        stage: 80,
      }),
      66,
    );
  });
});
