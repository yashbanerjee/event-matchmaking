import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { canTransition } from './meeting-transitions.js';

describe('meeting transitions', () => {
  it('allows published -> awaiting confirmation', () => {
    assert.equal(canTransition('PUBLISHED', 'AWAITING_CONFIRMATION'), true);
  });

  it('allows proposed -> confirmed on publish', () => {
    assert.equal(canTransition('PROPOSED', 'CONFIRMED'), true);
  });

  it('rejects completed -> confirmed', () => {
    assert.equal(canTransition('COMPLETED', 'CONFIRMED'), false);
  });
});
