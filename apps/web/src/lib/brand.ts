/** Ethara demo branding — aligned with ethara.com visual language. */
export const BRAND = {
  name: 'Ethara',
  product: 'Event Matchmaking',
  tagline: 'Making moments that matter',
  demoNote:
    'This platform is for demo exclusively for Ethara.',
  siteUrl: 'https://www.ethara.com/en/',
} as const;

export const brandLabel = `${BRAND.name} ${BRAND.product}`;
