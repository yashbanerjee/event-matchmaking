'use client';

import { useQuery } from '@tanstack/react-query';
import { apiFetch } from '@/lib/api';
import { getAccessToken } from '@/lib/auth-store';
import { Badge } from '@/components/ui/badge';
import { Modal } from '@/components/ui/modal';
import { Button } from '@/components/ui/button';

export type RecommendationProfile = {
  organizationId: string;
  name: string;
  type: string;
  industry: string | null;
  region: string | null;
  website: string | null;
  logoUrl: string | null;
  categories: string[];
  capabilities: string[];
  featured: boolean;
  formName: string | null;
  fields: Array<{
    key: string;
    label: string;
    type: string;
    value: unknown;
    sectionTitle: string | null;
  }>;
  sensitiveFieldsHidden: boolean;
};

function formatValue(value: unknown): string {
  if (value === null || value === undefined) return '—';
  if (typeof value === 'boolean') return value ? 'Yes' : 'No';
  if (Array.isArray(value)) {
    return value
      .map((item) => {
        if (item && typeof item === 'object' && 'label' in item) {
          return String((item as { label: unknown }).label);
        }
        return String(item);
      })
      .filter(Boolean)
      .join(', ');
  }
  if (typeof value === 'object') {
    try {
      return JSON.stringify(value);
    } catch {
      return String(value);
    }
  }
  return String(value);
}

export function RecommendationProfileModal({
  organizationId,
  open,
  onClose,
  onRequestMeeting,
}: {
  organizationId: string | null;
  open: boolean;
  onClose: () => void;
  onRequestMeeting?: () => void;
}) {
  const profile = useQuery({
    queryKey: ['recommendation-profile', organizationId],
    enabled: open && Boolean(organizationId),
    queryFn: () =>
      apiFetch<RecommendationProfile>(
        `/recommendations/${organizationId}/profile`,
        { token: getAccessToken() },
      ),
  });

  const data = profile.data;
  const sections = new Map<string, RecommendationProfile['fields']>();
  for (const field of data?.fields ?? []) {
    const key = field.sectionTitle || 'Profile details';
    const list = sections.get(key) ?? [];
    list.push(field);
    sections.set(key, list);
  }

  return (
    <Modal
      open={open}
      title={data?.name ?? 'Partner profile'}
      description={
        data
          ? [
              data.industry || data.type,
              data.region,
              data.formName ? `From ${data.formName}` : null,
            ]
              .filter(Boolean)
              .join(' · ')
          : 'Loading public profile details…'
      }
      onClose={onClose}
      wide
      footer={
        <div className="flex w-full flex-wrap items-center justify-between gap-2">
          <p className="text-xs text-[var(--muted)]">
            Sensitive form fields are hidden from this view.
          </p>
          <div className="flex gap-2">
            <Button variant="outline" onClick={onClose}>
              Close
            </Button>
            {onRequestMeeting ? (
              <Button onClick={onRequestMeeting}>Request meeting</Button>
            ) : null}
          </div>
        </div>
      }
    >
      {profile.isLoading ? (
        <p className="text-sm text-[var(--muted)]">Loading profile…</p>
      ) : profile.error ? (
        <p className="text-sm text-rose-700">
          {(profile.error as Error).message}
        </p>
      ) : data ? (
        <div className="space-y-5">
          <div className="flex flex-wrap gap-2">
            {data.featured ? <Badge variant="accent">Admin pick</Badge> : null}
            <Badge variant="secondary">{data.type}</Badge>
            {data.website ? (
              <a
                href={data.website}
                target="_blank"
                rel="noreferrer"
                className="text-sm font-medium text-[var(--accent-hover)] underline-offset-2 hover:underline"
              >
                Website
              </a>
            ) : null}
          </div>

          {(data.categories.length > 0 || data.capabilities.length > 0) && (
            <p className="text-sm leading-relaxed text-[var(--muted)]">
              {[...data.categories, ...data.capabilities].join(' · ')}
            </p>
          )}

          {data.fields.length === 0 ? (
            <p className="rounded-xl border border-[var(--border)] bg-[var(--card-elevated)] px-4 py-3 text-sm text-[var(--muted)]">
              No public profile fields are available yet. Sensitive answers stay
              private.
            </p>
          ) : (
            [...sections.entries()].map(([section, fields]) => (
              <section key={section} className="space-y-3">
                <h3 className="text-xs font-semibold uppercase tracking-[0.14em] text-[var(--muted)]">
                  {section}
                </h3>
                <div className="overflow-hidden rounded-2xl border border-[var(--border)]">
                  {fields.map((field, index) => (
                    <div
                      key={field.key}
                      className={`grid gap-1 px-4 py-3 sm:grid-cols-[minmax(0,0.4fr)_minmax(0,0.6fr)] ${
                        index > 0 ? 'border-t border-[var(--border)]' : ''
                      }`}
                    >
                      <p className="text-sm font-medium text-[var(--muted)]">
                        {field.label}
                      </p>
                      <p className="text-sm font-semibold text-[var(--foreground)]">
                        {formatValue(field.value)}
                      </p>
                    </div>
                  ))}
                </div>
              </section>
            ))
          )}
        </div>
      ) : null}
    </Modal>
  );
}
