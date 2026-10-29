/** User-facing labels for organization types (routes/APIs stay company/vendor). */

export const ORG_LABEL = {
  company: {
    singular: 'Client',
    plural: 'Clients',
    workspace: 'Client workspace',
    panel: 'Client panel',
    user: 'Client user',
  },
  vendor: {
    singular: 'Guest',
    plural: 'Guests',
    workspace: 'Guest workspace',
    panel: 'Guest panel',
    user: 'Guest user',
  },
} as const;

export function orgKindLabel(
  kind: 'company' | 'vendor',
  form: 'singular' | 'plural' = 'singular',
) {
  return ORG_LABEL[kind][form];
}
