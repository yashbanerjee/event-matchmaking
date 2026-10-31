/** User-facing labels for organization types (routes/APIs stay company/vendor). */

export const ORG_LABEL = {
  company: {
    singular: 'Investor',
    plural: 'Investors',
    workspace: 'Investor workspace',
    panel: 'Investor panel',
    user: 'Investor user',
  },
  vendor: {
    singular: 'Innovator',
    plural: 'Innovators',
    workspace: 'Innovator workspace',
    panel: 'Innovator panel',
    user: 'Innovator user',
  },
} as const;

export function orgKindLabel(
  kind: 'company' | 'vendor',
  form: 'singular' | 'plural' = 'singular',
) {
  return ORG_LABEL[kind][form];
}
