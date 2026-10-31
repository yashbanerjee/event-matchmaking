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

  it('allows confirmed or awaiting -> in progress', () => {
    assert.equal(canTransition('CONFIRMED', 'IN_PROGRESS'), true);
    assert.equal(canTransition('AWAITING_CONFIRMATION', 'IN_PROGRESS'), true);
  });

  it('allows in progress -> completed', () => {
    assert.equal(canTransition('IN_PROGRESS', 'COMPLETED'), true);
  });
});
