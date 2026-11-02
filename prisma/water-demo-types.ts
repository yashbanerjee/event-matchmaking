/** Build a realistic org email from a person local-part and company website. */
export function emailForOrg(localPart: string, website: string): string {
  const local = localPart
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9.]+/g, '')
    .replace(/^\.+|\.+$/g, '');
  let host = 'ethara.com';
  try {
    host = new URL(website).hostname.replace(/^www\./i, '');
  } catch {
    /* keep fallback */
  }
  return `${local || 'contact'}@${host}`;
}

export type WaterDemoInvestor = {
  code: string;
  name: string;
  email: string;
  firstName: string;
  lastName: string;
  title: string;
  industry: string;
  country: string;
  region: string;
  website: string;
  preferredCategories: string[];
  requiredCapabilities: string[];
  regions: string[];
  commercialTags: string[];
  featured: boolean;
  about: string;
  focusEvents: string;
  partnershipGoal: string;
  ticketSize: string;
  investmentStages: string[];
};

export type WaterDemoInnovator = {
  code: string;
  name: string;
  displayName: string;
  email: string;
  firstName: string;
  lastName: string;
  title: string;
  industry: string;
  country: string;
  region: string;
  website: string;
  categories: string[];
  capabilities: string[];
  operatingRegions: string[];
  commercialTags: string[];
  featured: boolean;
  about: string;
  focusEvents: string;
  partnershipGoal: string;
  ticketSize: string;
  stage: string;
  impactMetrics: string;
};
