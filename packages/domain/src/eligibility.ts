export interface EligibilityInput {
  companyActive: boolean;
  vendorActive: boolean;
  companyOnboardingComplete: boolean;
  vendorOnboardingComplete: boolean;
  vendorApproved: boolean;
  companyMatchingEligible: boolean;
  vendorMatchingEligible: boolean;
  mandatoryCapabilities: string[];
  vendorCapabilities: string[];
  explicitlyExcluded: boolean;
  sharedSlotAvailable: boolean;
  companyCapacityExhausted: boolean;
  vendorCapacityExhausted: boolean;
  duplicatePairingProhibited: boolean;
  policyViolation: boolean;
}

export interface EligibilityResult {
  eligible: boolean;
  reasons: string[];
}

/**
 * Hard constraints — never bypassed by a high match score.
 */
export function evaluateEligibility(input: EligibilityInput): EligibilityResult {
  const reasons: string[] = [];

  if (!input.companyActive) reasons.push('COMPANY_INACTIVE');
  if (!input.vendorActive) reasons.push('VENDOR_INACTIVE');
  if (!input.companyOnboardingComplete) {
    reasons.push('COMPANY_ONBOARDING_INCOMPLETE');
  }
  if (!input.vendorOnboardingComplete) {
    reasons.push('VENDOR_ONBOARDING_INCOMPLETE');
  }
  if (!input.vendorApproved) reasons.push('VENDOR_NOT_APPROVED');
  if (!input.companyMatchingEligible) {
    reasons.push('COMPANY_NOT_MATCHING_ELIGIBLE');
  }
  if (!input.vendorMatchingEligible) {
    reasons.push('VENDOR_NOT_MATCHING_ELIGIBLE');
  }
  if (input.explicitlyExcluded) reasons.push('EXPLICITLY_EXCLUDED');
  if (!input.sharedSlotAvailable) reasons.push('NO_SHARED_SLOT');
  if (input.companyCapacityExhausted) {
    reasons.push('COMPANY_CAPACITY_EXHAUSTED');
  }
  if (input.vendorCapacityExhausted) {
    reasons.push('VENDOR_CAPACITY_EXHAUSTED');
  }
  if (input.duplicatePairingProhibited) {
    reasons.push('DUPLICATE_PAIRING_PROHIBITED');
  }
  if (input.policyViolation) reasons.push('POLICY_VIOLATION');

  const missingCapabilities = input.mandatoryCapabilities.filter(
    (cap) =>
      !input.vendorCapabilities
        .map((c) => c.toLowerCase())
        .includes(cap.toLowerCase()),
  );
  if (missingCapabilities.length > 0) {
    reasons.push('MANDATORY_CAPABILITY_ABSENT');
  }

  return { eligible: reasons.length === 0, reasons };
}
