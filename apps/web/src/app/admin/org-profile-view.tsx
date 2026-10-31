'use client';

import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import { apiFetch } from '@/lib/api';
import { getAccessToken } from '@/lib/auth-store';
import { formatVendorStatus, statusTone } from '@/lib/status';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { PageHeader } from '@/components/page-header';
import { InvestorTablePanel } from '@/components/investor-table-panel';
import {
  CopyInvitationLinkButton,
  type InvitationLinkMeta,
} from '@/components/copy-invitation-link-button';

type ProfilePayload = {
  organization: {
    id: string;
    name: string;
    code: string;
    type: string;
    industry: string | null;
    website: string | null;
    country: string | null;
    region: string | null;
    status: string;
    company?: {
      approvalStatus?: string;
      preferredCategories?: string[];
      requiredCapabilities?: string[];
      matchingEligible?: boolean;
      normalizedProfile?: Record<string, unknown>;
    } | null;
    vendor?: {
      approvalStatus?: string;
      categories?: string[];
      capabilities?: string[];
      operatingRegions?: string[];
      matchingEligible?: boolean;
      normalizedProfile?: Record<string, unknown>;
    } | null;
    members?: Array<{
      title?: string | null;
      user: { email: string; firstName: string | null; lastName: string | null };
    }>;
  };
  submission: {
    id: string;
    status: string;
    submittedAt: string | null;
    formName: string;
  } | null;
  answers: Array<{ key: string; label: string; value: unknown }>;
  activity: Array<{
    id: string;
    at: string;
    kind: string;
    title: string;
    detail?: string | null;
  }>;
  invitationLink?: InvitationLinkMeta | null;
};

function prettyToken(value: string) {
  return value.replaceAll('_', ' ').replaceAll('-', ' ');
}

function displayValue(value: unknown) {
  if (Array.isArray(value)) return value.map((item) => prettyToken(String(item))).join(', ');
  if (value && typeof value === 'object') return JSON.stringify(value);
  if (value == null || value === '') return '—';
  return prettyToken(String(value));
}

export function OrgProfileView({
  orgId,
  kind,
}: {
  orgId: string;
  kind: 'company' | 'vendor';
}) {
  const { data, isLoading, error } = useQuery({
    queryKey: ['org-profile', orgId],
    queryFn: () =>
      apiFetch<ProfilePayload>(`/organizations/${orgId}/profile`, {
        token: getAccessToken(),
      }),
  });

  if (isLoading) return <p className="text-[var(--muted)]">Loading profile…</p>;
  if (error) return <p className="text-rose-700">{(error as Error).message}</p>;
  if (!data) return null;

  const org = data.organization;
  const status =
    org.vendor?.approvalStatus ?? org.company?.approvalStatus ?? org.status;
  const listHref = kind === 'company' ? '/admin/companies' : '/admin/vendors';
  const formHref = `${listHref}/${org.id}/form${
    data.submission ? `?submissionId=${data.submission.id}` : ''
  }`;
  const profile = (org.company?.normalizedProfile ??
    org.vendor?.normalizedProfile ??
    {}) as Record<string, unknown>;

  return (
    <div className="space-y-5">
      <PageHeader
        eyebrow={kind === 'company' ? 'Investor' : 'Innovator'}
        title={org.name}
        description={
          typeof profile.about === 'string'
            ? profile.about
            : 'Profile built from onboarding answers.'
        }
        actions={
          <div className="flex flex-wrap items-start justify-end gap-2">
            <CopyInvitationLinkButton
              organizationId={org.id}
              invitationLink={data.invitationLink}
            />
            <Link href={listHref}>
              <Button variant="outline">Back</Button>
            </Link>
            <Link href={formHref}>
              <Button variant="outline">Review form</Button>
            </Link>
          </div>
        }
      />

      <div className="grid gap-3 sm:grid-cols-4">
        {[
          ['Code', org.code],
          ['Type', org.industry ?? '—'],
          ['Region', org.region ?? org.country ?? '—'],
          ['Status', formatVendorStatus(status)],
        ].map(([label, value]) => (
          <Card key={String(label)} className="py-3">
            <p className="text-[11px] uppercase tracking-[0.16em] text-[var(--muted)]">
              {label}
            </p>
            <p className="mt-1 font-semibold">{value}</p>
          </Card>
        ))}
      </div>

      {kind === 'company' ? (
        <InvestorTablePanel
          organizationId={org.id}
          title="Home table"
          description="Allot a table to this investor for a day or a time window. Meetings with them in that window are marked on that table."
        />
      ) : null}

      <div className="grid gap-5 xl:grid-cols-[1.2fr_0.8fr]">
        <Card>
          <div className="mb-4 flex items-center justify-between">
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[var(--accent)]">
                Onboarding
              </p>
              <h2 className="h-display text-lg">Selections</h2>
            </div>
            {data.submission ? (
              <Badge variant={statusTone(data.submission.status)}>
                {data.submission.formName}
              </Badge>
            ) : null}
          </div>
          {data.answers.length === 0 ? (
            <p className="text-sm text-[var(--muted)]">
              No onboarding answers yet. The invite link sends them through the
              form.
            </p>
          ) : (
            <dl className="space-y-4">
              {data.answers.map((row) => (
                <div key={row.key}>
                  <dt className="text-xs font-semibold uppercase tracking-[0.14em] text-[var(--muted)]">
                    {row.label}
                  </dt>
                  <dd className="mt-1 text-sm leading-relaxed">
                    {displayValue(row.value)}
                  </dd>
                </div>
              ))}
            </dl>
          )}
        </Card>

        <Card>
          <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[var(--accent)]">
            Activity
          </p>
          <h2 className="h-display mb-4 text-lg">Event timeline</h2>
          {data.activity.length === 0 ? (
            <p className="text-sm text-[var(--muted)]">
              Invites, form submissions, and meetings will appear here.
            </p>
          ) : (
            <ol className="space-y-4">
              {data.activity.slice(0, 16).map((item) => (
                <li key={item.id} className="relative pl-5">
                  <span className="absolute left-0 top-1.5 h-2 w-2 rounded-full bg-[var(--accent)]" />
                  <p className="text-sm font-semibold capitalize">{item.title}</p>
                  {item.detail ? (
                    <p className="text-xs text-[var(--muted)]">{item.detail}</p>
                  ) : null}
                  <p className="mt-1 text-[11px] text-[var(--muted)]">
                    {new Date(item.at).toLocaleString()}
                  </p>
                </li>
              ))}
            </ol>
          )}
        </Card>
      </div>

      <Card>
        <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[var(--accent)]">
          Contacts
        </p>
        <div className="mt-3 space-y-2 text-sm">
          {(org.members ?? []).map((member) => (
            <p key={member.user.email}>
              {[member.user.firstName, member.user.lastName]
                .filter(Boolean)
                .join(' ') || 'Member'}{' '}
              · {member.user.email}
              {member.title ? ` · ${member.title}` : ''}
            </p>
          ))}
          {org.website ? (
            <p>
              Website:{' '}
              <a className="text-[var(--accent)]" href={org.website}>
                {org.website}
              </a>
            </p>
          ) : null}
        </div>
      </Card>
    </div>
  );
}
