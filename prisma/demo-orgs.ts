/** Demo company + vendor catalogs for local/staging seed data. */

export type DemoCompany = {
  code: string;
  name: string;
  industry: string;
  country: string;
  region: string;
  city: string;
  website: string;
  email: string;
  sizeBand: string;
  categories: string[];
  capabilities: string[];
};

export type DemoVendor = {
  code: string;
  name: string;
  displayName: string;
  industry: string;
  country: string;
  region: string;
  website: string;
  email: string;
  categories: string[];
  capabilities: string[];
  services: string[];
  operatingRegions: string[];
  capacityPerDay: number;
};

const COMPANY_SEED: Array<Omit<DemoCompany, 'code' | 'email' | 'website'>> = [
  {
    name: 'Nordic Alloy Works',
    industry: 'Metals & Mining',
    country: 'SE',
    region: 'Nordics',
    city: 'Gothenburg',
    sizeBand: '500-1000',
    categories: ['manufacturing', 'metals'],
    capabilities: ['CNC', 'ISO9001', 'Casting'],
  },
  {
    name: 'Gulf Logistics Hub',
    industry: 'Logistics',
    country: 'AE',
    region: 'GCC',
    city: 'Dubai',
    sizeBand: '1000-5000',
    categories: ['logistics', 'warehousing'],
    capabilities: ['ColdChain', 'LastMile', 'ISO28000'],
  },
  {
    name: 'Helix Pharma Labs',
    industry: 'Life Sciences',
    country: 'CH',
    region: 'Europe',
    city: 'Basel',
    sizeBand: '200-500',
    categories: ['pharma', 'lab'],
    capabilities: ['GMP', 'ColdChain', 'ISO13485'],
  },
  {
    name: 'Atlas Renewable Energy',
    industry: 'Energy',
    country: 'ES',
    region: 'Europe',
    city: 'Madrid',
    sizeBand: '500-1000',
    categories: ['energy', 'sustainability'],
    capabilities: ['Solar', 'GridIntegration', 'ISO14001'],
  },
  {
    name: 'Pacific Semiconductor Co',
    industry: 'Electronics',
    country: 'SG',
    region: 'APAC',
    city: 'Singapore',
    sizeBand: '1000-5000',
    categories: ['electronics', 'semiconductor'],
    capabilities: ['CleanRoom', 'SMT', 'ISO9001'],
  },
  {
    name: 'Horizon Food Brands',
    industry: 'FMCG',
    country: 'NL',
    region: 'Europe',
    city: 'Rotterdam',
    sizeBand: '500-1000',
    categories: ['food', 'packaging'],
    capabilities: ['HACCP', 'ColdChain', 'ISO22000'],
  },
  {
    name: 'Summit Construction Group',
    industry: 'Construction',
    country: 'SA',
    region: 'GCC',
    city: 'Riyadh',
    sizeBand: '1000-5000',
    categories: ['construction', 'infrastructure'],
    capabilities: ['SteelFab', 'ProjectMgmt', 'ISO45001'],
  },
  {
    name: 'Bluewave Marine Systems',
    industry: 'Maritime',
    country: 'NO',
    region: 'Nordics',
    city: 'Bergen',
    sizeBand: '200-500',
    categories: ['maritime', 'engineering'],
    capabilities: ['ShipRepair', 'Welding', 'ISO9001'],
  },
  {
    name: 'Vertex Automotive OEM',
    industry: 'Automotive',
    country: 'DE',
    region: 'Europe',
    city: 'Stuttgart',
    sizeBand: '5000+',
    categories: ['automotive', 'manufacturing'],
    capabilities: ['CNC', 'Welding', 'IATF16949'],
  },
  {
    name: 'Cedar Healthcare Network',
    industry: 'Healthcare',
    country: 'CA',
    region: 'North America',
    city: 'Toronto',
    sizeBand: '1000-5000',
    categories: ['healthcare', 'services'],
    capabilities: ['HIPAA', 'SterileSupply', 'ISO13485'],
  },
  {
    name: 'Ember Retail Collective',
    industry: 'Retail',
    country: 'GB',
    region: 'UK',
    city: 'London',
    sizeBand: '500-1000',
    categories: ['retail', 'ecommerce'],
    capabilities: ['Omnichannel', 'LastMile', 'POS'],
  },
  {
    name: 'Sahara Agro Exports',
    industry: 'Agriculture',
    country: 'EG',
    region: 'MENA',
    city: 'Cairo',
    sizeBand: '200-500',
    categories: ['agriculture', 'export'],
    capabilities: ['ColdChain', 'HACCP', 'ExportDocs'],
  },
  {
    name: 'Quantum Data Centers',
    industry: 'Technology',
    country: 'IE',
    region: 'Europe',
    city: 'Dublin',
    sizeBand: '200-500',
    categories: ['technology', 'infrastructure'],
    capabilities: ['Colocation', 'PowerMgmt', 'ISO27001'],
  },
  {
    name: 'Ironclad Security Systems',
    industry: 'Security',
    country: 'IL',
    region: 'MENA',
    city: 'Tel Aviv',
    sizeBand: '200-500',
    categories: ['security', 'electronics'],
    capabilities: ['AccessControl', 'CCTV', 'ISO27001'],
  },
  {
    name: 'Lotus Textile Mills',
    industry: 'Textiles',
    country: 'IN',
    region: 'South Asia',
    city: 'Coimbatore',
    sizeBand: '500-1000',
    categories: ['textiles', 'manufacturing'],
    capabilities: ['Weaving', 'Dyeing', 'GOTS'],
  },
  {
    name: 'Cascade Water Solutions',
    industry: 'Utilities',
    country: 'US',
    region: 'North America',
    city: 'Seattle',
    sizeBand: '200-500',
    categories: ['utilities', 'environment'],
    capabilities: ['WaterTreatment', 'ISO14001', 'SCADA'],
  },
  {
    name: 'Mercator Trade Finance',
    industry: 'Financial Services',
    country: 'LU',
    region: 'Europe',
    city: 'Luxembourg',
    sizeBand: '200-500',
    categories: ['finance', 'trade'],
    capabilities: ['TradeFinance', 'Compliance', 'KYC'],
  },
  {
    name: 'Aurora Media Studios',
    industry: 'Media',
    country: 'KR',
    region: 'APAC',
    city: 'Seoul',
    sizeBand: '100-200',
    categories: ['media', 'creative'],
    capabilities: ['PostProduction', 'Streaming', 'Localization'],
  },
  {
    name: 'Granite Mining Holdings',
    industry: 'Mining',
    country: 'AU',
    region: 'APAC',
    city: 'Perth',
    sizeBand: '1000-5000',
    categories: ['mining', 'metals'],
    capabilities: ['Extraction', 'Safety', 'ISO45001'],
  },
  {
    name: 'Cedar Gate Hospitality',
    industry: 'Hospitality',
    country: 'QA',
    region: 'GCC',
    city: 'Doha',
    sizeBand: '500-1000',
    categories: ['hospitality', 'events'],
    capabilities: ['EventOps', 'Catering', 'ISO22000'],
  },
];

const VENDOR_PREFIXES = [
  'Apex',
  'Bright',
  'Cobalt',
  'Delta',
  'Everest',
  'Forge',
  'Granite',
  'Harbor',
  'Ion',
  'Jade',
  'Kinetic',
  'Lumen',
  'Meridian',
  'Nimbus',
  'Orbit',
  'Prism',
  'Quartz',
  'Ridge',
  'Summit',
  'Titan',
  'Umbra',
  'Vector',
  'Willow',
  'Zenith',
  'Arrow',
];

const VENDOR_SUFFIXES = [
  'Components',
  'Solutions',
  'Industries',
  'Systems',
  'Supply',
  'Fabrication',
  'Logistics',
  'Engineering',
  'Materials',
  'Services',
  'Technologies',
  'Partners',
  'Works',
  'Group',
  'Labs',
  'Manufacturing',
  'Trading',
  'International',
  'Global',
  'Consulting',
];

const VENDOR_INDUSTRIES = [
  'Manufacturing',
  'Logistics',
  'Electronics',
  'Packaging',
  'Automotive',
  'Energy',
  'Construction',
  'Life Sciences',
  'Textiles',
  'IT Services',
];

const VENDOR_COUNTRIES: Array<{ country: string; region: string }> = [
  { country: 'DE', region: 'Europe' },
  { country: 'AE', region: 'GCC' },
  { country: 'IN', region: 'South Asia' },
  { country: 'US', region: 'North America' },
  { country: 'CN', region: 'APAC' },
  { country: 'GB', region: 'UK' },
  { country: 'SG', region: 'APAC' },
  { country: 'NL', region: 'Europe' },
  { country: 'TR', region: 'MENA' },
  { country: 'PL', region: 'Europe' },
];

const CAPABILITY_POOL = [
  'CNC',
  'ISO9001',
  'Welding',
  'SMT',
  'InjectionMolding',
  'Packaging',
  'ColdChain',
  'LastMile',
  'CAD',
  'PLC',
  '3DPrinting',
  'QA',
  'Lean',
  'SixSigma',
  'ISO14001',
  'IATF16949',
  'GMP',
  'Assembly',
];

const CATEGORY_POOL = [
  'manufacturing',
  'logistics',
  'electronics',
  'packaging',
  'automotive',
  'energy',
  'construction',
  'strategic',
];

const SERVICE_POOL = [
  'Contract manufacturing',
  'Prototype development',
  'Warehousing',
  'Freight forwarding',
  'Quality inspection',
  'Spare parts supply',
  'Installation & commissioning',
  'After-sales support',
];

function slugify(value: string) {
  return value
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, '_')
    .replace(/^_|_$/g, '')
    .slice(0, 18);
}

/** Public logo URL (initials avatar) suitable for demos. */
export function logoUrlFor(name: string) {
  const label = encodeURIComponent(name.replace(/\s+/g, ' ').trim());
  return `https://ui-avatars.com/api/?name=${label}&background=0F766E&color=fff&bold=true&format=png&size=128`;
}

export function demoCompanies(): DemoCompany[] {
  return COMPANY_SEED.map((company, index) => {
    const code = `CMP${String(index + 1).padStart(2, '0')}_${slugify(company.name).slice(0, 10)}`;
    const domain = company.name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '')
      .slice(0, 28);
    return {
      ...company,
      code,
      website: `https://www.${domain}.example`,
      email: `procurement@${domain}.example`,
    };
  });
}

export function demoVendors(count = 200): DemoVendor[] {
  const vendors: DemoVendor[] = [];
  for (let i = 0; i < count; i += 1) {
    const prefix = VENDOR_PREFIXES[i % VENDOR_PREFIXES.length]!;
    const suffix = VENDOR_SUFFIXES[Math.floor(i / VENDOR_PREFIXES.length) % VENDOR_SUFFIXES.length]!;
    const name = `${prefix} ${suffix}`;
    const industry = VENDOR_INDUSTRIES[i % VENDOR_INDUSTRIES.length]!;
    const geo = VENDOR_COUNTRIES[i % VENDOR_COUNTRIES.length]!;
    const domain = `${prefix}${suffix}`
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '')
      .slice(0, 24);
    const code = `VND${String(i + 1).padStart(3, '0')}`;
    const categories = [
      CATEGORY_POOL[i % CATEGORY_POOL.length]!,
      CATEGORY_POOL[(i + 3) % CATEGORY_POOL.length]!,
    ];
    const capabilities = [
      CAPABILITY_POOL[i % CAPABILITY_POOL.length]!,
      CAPABILITY_POOL[(i + 5) % CAPABILITY_POOL.length]!,
      CAPABILITY_POOL[(i + 9) % CAPABILITY_POOL.length]!,
    ];
    const services = [
      SERVICE_POOL[i % SERVICE_POOL.length]!,
      SERVICE_POOL[(i + 4) % SERVICE_POOL.length]!,
    ];
    vendors.push({
      code,
      name,
      displayName: name,
      industry,
      country: geo.country,
      region: geo.region,
      website: `https://www.${domain}.example`,
      email: `sales@${domain}.example`,
      categories: [...new Set(categories)],
      capabilities: [...new Set(capabilities)],
      services: [...new Set(services)],
      operatingRegions: [geo.region, i % 2 === 0 ? 'GCC' : 'Europe'],
      capacityPerDay: 20 + ((i * 7) % 180),
    });
  }
  return vendors;
}
