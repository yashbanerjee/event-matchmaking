/**
 * Branded HTML email templates aligned with the Event Matchmaking admin UI
 * (teal accent, soft blue-gray atmosphere, navy text).
 */

export type EmailTemplateKind =
  | 'invitation'
  | 'correction'
  | 'test'
  | 'notice'
  | 'approved'
  | 'rejected'
  | 'meeting'
  | 'meeting_update'
  | 'registration_otp'
  | 'registration_ack'
  | 'registration_admin_notify';

export type EmailAudience = 'vendor' | 'company' | 'admin' | 'recipient';

type Theme = {
  label: string;
  accent: string;
  accentSoft: string;
  action: string;
};

const THEMES: Record<EmailTemplateKind, Theme> = {
  invitation: {
    label: 'Invitation',
    accent: '#0f766e',
    accentSoft: '#ccfbf1',
    action: 'Accept invitation',
  },
  correction: {
    label: 'Updates requested',
    accent: '#b45309',
    accentSoft: '#fef3c7',
    action: 'Update marked fields',
  },
  test: {
    label: 'SMTP test',
    accent: '#0369a1',
    accentSoft: '#e0f2fe',
    action: 'Open Event Matchmaking',
  },
  notice: {
    label: 'Notice',
    accent: '#0f766e',
    accentSoft: '#ccfbf1',
    action: 'Open portal',
  },
  approved: {
    label: 'Verified',
    accent: '#047857',
    accentSoft: '#d1fae5',
    action: 'View profile',
  },
  rejected: {
    label: 'Action needed',
    accent: '#be123c',
    accentSoft: '#ffe4e6',
    action: 'Review submission',
  },
  meeting: {
    label: 'Meeting scheduled',
    accent: '#0f766e',
    accentSoft: '#ccfbf1',
    action: 'View meetings',
  },
  meeting_update: {
    label: 'Meeting updated',
    accent: '#0369a1',
    accentSoft: '#e0f2fe',
    action: 'View meetings',
  },
  registration_otp: {
    label: 'Email verification',
    accent: '#0f766e',
    accentSoft: '#ccfbf1',
    action: 'Enter code',
  },
  registration_ack: {
    label: 'Registration received',
    accent: '#0f766e',
    accentSoft: '#ccfbf1',
    action: 'Open dashboard',
  },
  registration_admin_notify: {
    label: 'New registration',
    accent: '#0369a1',
    accentSoft: '#e0f2fe',
    action: 'Review submission',
  },
};

const BRAND = {
  name: 'Event Matchmaking',
  foreground: '#0f1c27',
  muted: '#5b6f7e',
  border: '#d5e0e8',
  card: '#ffffff',
  pageBg: '#eef3f7',
  sidebar: '#0b1b2b',
  highlight: '#0369a1',
};

export function escapeHtml(value: string) {
  return value.replace(/[&<>"']/g, (character) => {
    const entities: Record<string, string> = {
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      '"': '&quot;',
      "'": '&#39;',
    };
    return entities[character] ?? character;
  });
}

function audienceLabel(audience: EmailAudience) {
  switch (audience) {
    case 'vendor':
      return 'a vendor contact';
    case 'company':
      return 'a company contact';
    case 'admin':
      return 'an administrator';
    default:
      return 'you';
  }
}

export function renderBrandedEmail(input: {
  kind: EmailTemplateKind;
  audience?: EmailAudience;
  /** Product / from-name shown in the header */
  brandName?: string;
  /** Organization or context name under the brand */
  contextName?: string;
  title: string;
  /** Plain text body; paragraphs separated by blank lines */
  body: string;
  actionUrl?: string;
  actionLabel?: string;
  /** Optional detail rows (label/value) shown in a soft panel */
  details?: Array<{ label: string; value: string }>;
  /** Optional bullet / numbered list under the body */
  list?: string[];
  footerNote?: string;
}): { html: string; text: string } {
  const theme = THEMES[input.kind] ?? THEMES.notice;
  const brandName = input.brandName?.trim() || BRAND.name;
  const action = input.actionLabel?.trim() || theme.action;
  const audience = input.audience ?? 'recipient';

  const paragraphs = input.body
    .split(/\n{2,}/)
    .map((paragraph) => paragraph.trim())
    .filter(Boolean);

  const textParts = [
    brandName,
    input.contextName,
    theme.label,
    input.title,
    '',
    input.body,
    input.list?.length
      ? `\n${input.list.map((item, i) => `${i + 1}. ${item}`).join('\n')}`
      : '',
    input.details?.length
      ? `\n${input.details.map((d) => `${d.label}: ${d.value}`).join('\n')}`
      : '',
    input.actionUrl ? `\n${action}: ${input.actionUrl}` : '',
    input.footerNote ? `\n${input.footerNote}` : '',
  ].filter((line) => line !== undefined && line !== '');

  const bodyHtml = paragraphs
    .map(
      (paragraph) =>
        `<p style="margin:0 0 14px;line-height:1.55;color:${BRAND.foreground};font-size:15px;">${escapeHtml(paragraph).replace(/\n/g, '<br>')}</p>`,
    )
    .join('');

  const listHtml =
    input.list && input.list.length
      ? `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:4px 0 16px;background:${theme.accentSoft};border:1px solid ${BRAND.border};border-radius:12px;">
          <tr><td style="padding:14px 16px;">
            <p style="margin:0 0 8px;font-size:12px;font-weight:700;letter-spacing:.08em;text-transform:uppercase;color:${theme.accent};">Details</p>
            <ol style="margin:0;padding-left:18px;color:${BRAND.foreground};font-size:14px;line-height:1.55;">
              ${input.list
                .map(
                  (item) =>
                    `<li style="margin:0 0 8px;">${escapeHtml(item).replace(/\n/g, '<br>')}</li>`,
                )
                .join('')}
            </ol>
          </td></tr>
        </table>`
      : '';

  const detailsHtml =
    input.details && input.details.length
      ? `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:4px 0 16px;border:1px solid ${BRAND.border};border-radius:12px;overflow:hidden;">
          ${input.details
            .map(
              (row, index) => `<tr>
                <td style="padding:10px 14px;background:${index % 2 === 0 ? '#f8fbfd' : '#ffffff'};border-top:${index === 0 ? '0' : `1px solid ${BRAND.border}`};width:36%;font-size:12px;font-weight:600;color:${BRAND.muted};text-transform:uppercase;letter-spacing:.04em;">${escapeHtml(row.label)}</td>
                <td style="padding:10px 14px;background:${index % 2 === 0 ? '#f8fbfd' : '#ffffff'};border-top:${index === 0 ? '0' : `1px solid ${BRAND.border}`};font-size:14px;color:${BRAND.foreground};">${escapeHtml(row.value)}</td>
              </tr>`,
            )
            .join('')}
        </table>`
      : '';

  const buttonHtml = input.actionUrl
    ? `<table role="presentation" cellpadding="0" cellspacing="0" style="margin:8px 0 4px;">
        <tr>
          <td style="border-radius:10px;background:${theme.accent};">
            <a href="${escapeHtml(input.actionUrl)}" style="display:inline-block;padding:12px 20px;font-size:14px;font-weight:700;color:#ecfdf8;text-decoration:none;border-radius:10px;">${escapeHtml(action)}</a>
          </td>
        </tr>
      </table>
      <p style="margin:10px 0 0;font-size:12px;line-height:1.5;color:${BRAND.muted};word-break:break-all;">Or paste this link into your browser:<br><a href="${escapeHtml(input.actionUrl)}" style="color:${BRAND.highlight};">${escapeHtml(input.actionUrl)}</a></p>`
    : '';

  const contextHtml = input.contextName
    ? `<p style="margin:10px 0 0;font-size:12px;letter-spacing:.18em;text-transform:uppercase;color:${theme.accentSoft};opacity:.9;">${escapeHtml(input.contextName)}</p>`
    : '';

  const footer =
    input.footerNote?.trim() ||
    `This message was sent to ${audienceLabel(audience)}. If you were not expecting it, you can ignore this email.`;

  const html = `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>${escapeHtml(input.title)}</title>
  </head>
  <body style="margin:0;padding:0;background:${BRAND.pageBg};color:${BRAND.foreground};font-family:'Segoe UI',Figtree,Arial,sans-serif;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:linear-gradient(180deg,#f5f8fb 0%,${BRAND.pageBg} 48%,#e7eef4 100%);padding:28px 14px;">
      <tr>
        <td align="center">
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:580px;background:${BRAND.card};border:1px solid ${BRAND.border};border-radius:16px;overflow:hidden;box-shadow:0 16px 40px rgba(15,28,39,0.08);">
            <tr>
              <td style="background:${BRAND.sidebar};padding:22px 24px 20px;">
                <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
                  <tr>
                    <td>
                      <div style="display:inline-block;width:36px;height:36px;border-radius:10px;background:${theme.accent};color:#ecfdf8;font-weight:800;font-size:14px;line-height:36px;text-align:center;">EM</div>
                      <p style="margin:12px 0 0;font-size:18px;font-weight:700;letter-spacing:-0.02em;color:#e8eef4;">${escapeHtml(brandName)}</p>
                      ${contextHtml}
                    </td>
                    <td align="right" valign="top">
                      <span style="display:inline-block;background:${theme.accent};color:#ecfdf8;border-radius:999px;padding:4px 10px;font-size:11px;font-weight:700;letter-spacing:.06em;text-transform:uppercase;">${escapeHtml(theme.label)}</span>
                    </td>
                  </tr>
                </table>
              </td>
            </tr>
            <tr>
              <td style="height:4px;background:${theme.accent};font-size:0;line-height:0;">&nbsp;</td>
            </tr>
            <tr>
              <td style="padding:24px 24px 8px;">
                <h1 style="margin:0;font-size:22px;line-height:1.3;letter-spacing:-0.02em;color:${BRAND.foreground};font-weight:700;">${escapeHtml(input.title)}</h1>
              </td>
            </tr>
            <tr>
              <td style="padding:8px 24px 28px;">
                ${bodyHtml}
                ${listHtml}
                ${detailsHtml}
                ${buttonHtml}
                <p style="margin:28px 0 0;padding-top:16px;border-top:1px solid ${BRAND.border};font-size:12px;line-height:1.5;color:${BRAND.muted};">${escapeHtml(footer)}</p>
              </td>
            </tr>
          </table>
          <p style="margin:16px 0 0;font-size:11px;color:${BRAND.muted};">&copy; ${new Date().getFullYear()} ${escapeHtml(brandName)}</p>
        </td>
      </tr>
    </table>
  </body>
</html>`;

  return { html, text: textParts.join('\n') };
}

export function renderInvitationEmail(input: {
  brandName?: string;
  organizationName: string;
  kind: 'vendor' | 'company';
  registrationUrl: string;
  expiresAt: Date | string;
  formAttached?: boolean;
}): { subject: string; html: string; text: string } {
  const expires =
    input.expiresAt instanceof Date
      ? input.expiresAt
      : new Date(input.expiresAt);
  const label = input.kind === 'company' ? 'company' : 'vendor';
  const rendered = renderBrandedEmail({
    kind: 'invitation',
    audience: input.kind,
    brandName: input.brandName,
    contextName: input.organizationName,
    title: `You're invited to join ${input.organizationName}`,
    body: [
      `Hello,`,
      ``,
      `You have been invited to register as a ${label} on ${input.brandName?.trim() || BRAND.name}.`,
      input.formAttached
        ? `After you open the link, you can complete your profile form and submit it for review.`
        : `Use the button below to create your account and get started.`,
    ].join('\n'),
    actionUrl: input.registrationUrl,
    actionLabel: 'Accept invitation',
    details: [
      { label: 'Organization', value: input.organizationName },
      { label: 'Role', value: input.kind === 'company' ? 'Company' : 'Vendor' },
      {
        label: 'Expires',
        value: expires.toUTCString(),
      },
    ],
    footerNote:
      'If you were not expecting this invitation, you can safely ignore this email. The link will expire automatically.',
  });

  return {
    subject: `You are invited to ${input.organizationName}`,
    ...rendered,
  };
}

export function renderCorrectionEmail(input: {
  brandName?: string;
  organizationName: string;
  formName: string;
  correctionUrl: string;
  fields: Array<{ label: string; note: string }>;
  audience?: 'vendor' | 'company';
}): { subject: string; html: string; text: string } {
  const count = input.fields.length;
  const rendered = renderBrandedEmail({
    kind: 'correction',
    audience: input.audience ?? 'vendor',
    brandName: input.brandName,
    contextName: input.organizationName,
    title: `Please update ${count} field${count === 1 ? '' : 's'}`,
    body: [
      `Hello,`,
      ``,
      `Our team reviewed ${input.formName} for ${input.organizationName} and needs a few updates before verification can continue.`,
      `Open the secure link below and change only the marked fields. Your other answers stay as they are.`,
    ].join('\n'),
    actionUrl: input.correctionUrl,
    actionLabel: 'Update marked fields',
    list: input.fields.map(
      (field) => `${field.label}\nComment: ${field.note}`,
    ),
    details: [
      { label: 'Organization', value: input.organizationName },
      { label: 'Form', value: input.formName },
      { label: 'Fields', value: String(count) },
    ],
    footerNote:
      'This link is unique to your organization. If you did not submit this form, contact the event team.',
  });

  return {
    subject: `Please update ${count} field${count === 1 ? '' : 's'} on ${input.formName}`,
    ...rendered,
  };
}

export function renderTestEmail(input: {
  brandName?: string;
  appUrl?: string;
}): { subject: string; html: string; text: string } {
  const brandName = input.brandName?.trim() || BRAND.name;
  const rendered = renderBrandedEmail({
    kind: 'test',
    audience: 'admin',
    brandName,
    title: 'SMTP is working',
    body: [
      `Hello,`,
      ``,
      `This is a test message from ${brandName}.`,
      `If you received it, outbound email is configured correctly and branded templates are active.`,
    ].join('\n'),
    actionUrl: input.appUrl,
    actionLabel: 'Open admin',
    details: [
      { label: 'From name', value: brandName },
      { label: 'Purpose', value: 'SMTP connectivity check' },
    ],
  });

  return {
    subject: `${brandName} SMTP test`,
    ...rendered,
  };
}

function formatMeetingWhen(value: Date | string) {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return String(value);
  return date.toUTCString();
}

export function renderMeetingEmail(input: {
  brandName?: string;
  audience: 'vendor' | 'company';
  variant: 'published' | 'updated';
  companyName: string;
  vendorName: string;
  startsAt: Date | string;
  endsAt: Date | string;
  durationMinutes: number;
  mode?: string;
  portalUrl?: string;
  changeReason?: string;
}): { subject: string; html: string; text: string } {
  const brandName = input.brandName?.trim() || BRAND.name;
  const counterpart =
    input.audience === 'company' ? input.vendorName : input.companyName;
  const isUpdate = input.variant === 'updated';
  const title = isUpdate
    ? `Your meeting with ${counterpart} was updated`
    : `Meeting scheduled with ${counterpart}`;
  const body = isUpdate
    ? [
        `Hello,`,
        ``,
        `Your matchmaking meeting details were updated by the event team.`,
        `Please review the new time and counterpart below.`,
        input.changeReason ? `Reason: ${input.changeReason}` : '',
      ]
        .filter(Boolean)
        .join('\n')
    : [
        `Hello,`,
        ``,
        `A matchmaking meeting has been scheduled for you.`,
        `Please review the details below and confirm in the portal when ready.`,
      ].join('\n');

  const rendered = renderBrandedEmail({
    kind: isUpdate ? 'meeting_update' : 'meeting',
    audience: input.audience,
    brandName,
    contextName:
      input.audience === 'company' ? input.companyName : input.vendorName,
    title,
    body,
    actionUrl: input.portalUrl,
    actionLabel: 'View meetings',
    details: [
      { label: 'Company', value: input.companyName },
      { label: 'Vendor', value: input.vendorName },
      { label: 'Starts', value: formatMeetingWhen(input.startsAt) },
      { label: 'Ends', value: formatMeetingWhen(input.endsAt) },
      { label: 'Duration', value: `${input.durationMinutes} minutes` },
      ...(input.mode ? [{ label: 'Mode', value: input.mode }] : []),
    ],
    footerNote: isUpdate
      ? 'If this change does not work for you, contact the event team or request a reschedule in the portal.'
      : 'Please confirm attendance in the portal. If you cannot attend, request a reschedule there.',
  });

  return {
    subject: isUpdate
      ? `Updated meeting: ${input.companyName} ↔ ${input.vendorName}`
      : `Meeting scheduled: ${input.companyName} ↔ ${input.vendorName}`,
    ...rendered,
  };
}

export function renderRegistrationOtpEmail(input: {
  brandName?: string;
  otp: string;
  expiresMinutes?: number;
}): { subject: string; html: string; text: string } {
  const minutes = input.expiresMinutes ?? 10;
  const rendered = renderBrandedEmail({
    kind: 'registration_otp',
    brandName: input.brandName,
    title: 'Verify your email',
    body: [
      `Hello,`,
      ``,
      `Use this one-time code to continue your event registration.`,
      ``,
      `Code: ${input.otp}`,
      ``,
      `This code expires in ${minutes} minutes.`,
    ].join('\n'),
    details: [
      { label: 'Verification code', value: input.otp },
      { label: 'Expires in', value: `${minutes} minutes` },
    ],
    footerNote:
      'If you did not start a registration, you can ignore this email.',
  });
  return {
    subject: `${input.otp} is your registration code`,
    ...rendered,
  };
}

export function renderRegistrationAckEmail(input: {
  brandName?: string;
  firstName?: string | null;
  roleLabel: string;
  dashboardUrl: string;
}): { subject: string; html: string; text: string } {
  const name = input.firstName?.trim() || 'there';
  const rendered = renderBrandedEmail({
    kind: 'registration_ack',
    brandName: input.brandName,
    title: 'We received your registration',
    body: [
      `Hello ${name},`,
      ``,
      `Thanks for registering as a ${input.roleLabel}. Your profile form is with the event team for review.`,
      ``,
      `You can sign in to your dashboard now. Matching stays off until an administrator verifies your profile.`,
    ].join('\n'),
    actionUrl: input.dashboardUrl,
    actionLabel: 'Open dashboard',
    details: [{ label: 'Role', value: input.roleLabel }],
    footerNote:
      'You will hear from the event team if any answers need updates.',
  });
  return {
    subject: 'Registration received — under review',
    ...rendered,
  };
}

export function renderRegistrationAdminNotifyEmail(input: {
  brandName?: string;
  organizationName: string;
  email: string;
  roleLabel: string;
  reviewUrl: string;
}): { subject: string; html: string; text: string } {
  const rendered = renderBrandedEmail({
    kind: 'registration_admin_notify',
    audience: 'admin',
    brandName: input.brandName,
    title: 'New event registration to review',
    body: [
      `Hello,`,
      ``,
      `A new ${input.roleLabel.toLowerCase()} registered for the event and submitted a profile form.`,
      ``,
      `Please review and verify (or request improvements) in admin.`,
    ].join('\n'),
    actionUrl: input.reviewUrl,
    actionLabel: 'Review submission',
    details: [
      { label: 'Organization', value: input.organizationName },
      { label: 'Email', value: input.email },
      { label: 'Role', value: input.roleLabel },
    ],
  });
  return {
    subject: `Review registration: ${input.organizationName}`,
    ...rendered,
  };
}
