import type { FormSchemaDefinition } from '@em/shared';

const IDENTITY_FORM_KEYS = new Set([
  'contact_name',
  'full_name',
  'first_name',
  'last_name',
  'email',
  'work_email',
  'contact_email',
  'organization_name',
  'organization',
  'company_name',
  'org_name',
]);

export type RegistrationIdentity = {
  firstName?: string;
  lastName?: string;
  email?: string;
  organizationName?: string;
};

export function isIdentityFormKey(key: string) {
  return IDENTITY_FORM_KEYS.has(key);
}

export function fullNameFromIdentity(identity: RegistrationIdentity) {
  return [identity.firstName, identity.lastName]
    .map((part) => part?.trim())
    .filter(Boolean)
    .join(' ');
}

function dropEmptySections(schema: FormSchemaDefinition): FormSchemaDefinition {
  const sectionIds = new Set(schema.fields.map((field) => field.sectionId));
  return {
    ...schema,
    sections: schema.sections.filter((section) => sectionIds.has(section.id)),
  };
}

/** Hide name/email/org questions we already have answers for. */
export function withoutKnownIdentityFields(
  schema: FormSchemaDefinition,
  identity: RegistrationIdentity,
): FormSchemaDefinition {
  const fullName = fullNameFromIdentity(identity);
  const fields = schema.fields.filter((field) => {
    if (field.key === 'participant_role' || field.key.startsWith('availability_')) {
      return false;
    }
    if (!isIdentityFormKey(field.key)) return true;
    if (field.key === 'contact_name' || field.key === 'full_name') {
      return !fullName;
    }
    if (field.key === 'first_name') return !identity.firstName?.trim();
    if (field.key === 'last_name') return !identity.lastName?.trim();
    if (
      field.key === 'email' ||
      field.key === 'work_email' ||
      field.key === 'contact_email'
    ) {
      return !identity.email?.trim();
    }
    if (
      field.key === 'organization_name' ||
      field.key === 'organization' ||
      field.key === 'company_name' ||
      field.key === 'org_name'
    ) {
      return !identity.organizationName?.trim();
    }
    return true;
  });
  return dropEmptySections({ ...schema, fields });
}

/** Drop every name/email/org field already collected on the account step. */
export function withoutIdentityFields(
  schema: FormSchemaDefinition,
): FormSchemaDefinition {
  const fields = schema.fields.filter(
    (field) =>
      !isIdentityFormKey(field.key) &&
      field.key !== 'participant_role' &&
      !field.key.startsWith('availability_'),
  );
  return dropEmptySections({ ...schema, fields });
}

/** Copy account identity into hidden form answers so required fields still submit. */
export function applyIdentityResponses(
  schema: FormSchemaDefinition,
  responses: Record<string, unknown>,
  identity: RegistrationIdentity,
): Record<string, unknown> {
  const next = { ...responses };
  const fullName = fullNameFromIdentity(identity);
  for (const field of schema.fields) {
    if (!isIdentityFormKey(field.key)) continue;
    const current = next[field.key];
    const hasValue =
      current !== undefined &&
      current !== null &&
      String(current).trim() !== '';
    if (hasValue) continue;
    if (field.key === 'contact_name' || field.key === 'full_name') {
      if (fullName) next[field.key] = fullName;
    } else if (field.key === 'first_name' && identity.firstName?.trim()) {
      next[field.key] = identity.firstName.trim();
    } else if (field.key === 'last_name' && identity.lastName?.trim()) {
      next[field.key] = identity.lastName.trim();
    } else if (
      (field.key === 'email' ||
        field.key === 'work_email' ||
        field.key === 'contact_email') &&
      identity.email?.trim()
    ) {
      next[field.key] = identity.email.trim();
    } else if (
      (field.key === 'organization_name' ||
        field.key === 'organization' ||
        field.key === 'company_name' ||
        field.key === 'org_name') &&
      identity.organizationName?.trim()
    ) {
      next[field.key] = identity.organizationName.trim();
    }
  }
  return next;
}
