import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { evaluateEligibility } from './eligibility.js';

const base = {
  companyActive: true,
  vendorActive: true,
  companyOnboardingComplete: true,
  vendorOnboardingComplete: true,
  vendorApproved: true,
  companyMatchingEligible: true,
  vendorMatchingEligible: true,
  mandatoryCapabilities: ['CNC'],
  vendorCapabilities: ['CNC'],
  explicitlyExcluded: false,
  sharedSlotAvailable: true,
  companyCapacityExhausted: false,
  vendorCapacityExhausted: false,
  duplicatePairingProhibited: false,
  policyViolation: false,
};

describe('evaluateEligibility', () => {
  it('allows fully eligible pairs', () => {
    const result = evaluateEligibility(base);
    assert.equal(result.eligible, true);
    assert.deepEqual(result.reasons, []);
  });

  it('rejects inactive vendors regardless of score context', () => {
    const result = evaluateEligibility({ ...base, vendorActive: false });
    assert.equal(result.eligible, false);
    assert.ok(result.reasons.includes('VENDOR_INACTIVE'));
  });

  it('rejects missing mandatory capabilities', () => {
    const result = evaluateEligibility({
      ...base,
      vendorCapabilities: ['Welding'],
    });
    assert.equal(result.eligible, false);
    assert.ok(result.reasons.includes('MANDATORY_CAPABILITY_ABSENT'));
  });
});
