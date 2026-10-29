'use client';

import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiFetch } from '@/lib/api';
import { getAccessToken } from '@/lib/auth-store';
import { formatVendorStatus, statusTone } from '@/lib/status';
import { orgKindLabel } from '@/lib/org-labels';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Modal } from '@/components/ui/modal';
import { ConfirmDialog } from '@/components/ui/dialog';

export type OrgRow = {
  id: string;
  code: string;
  name: string;
  status: string;
  industry?: string | null;
  country?: string | null;
  region?: string | null;
  website?: string | null;
  address?: string | null;
  timeZone?: string;
  type?: string;
  vendor?: {
    displayName?: string | null;
    approvalStatus?: string;
    matchingEligible?: boolean;
    featured?: boolean;
    categories?: string[];
    capabilities?: string[];
  } | null;
  company?: {
    approvalStatus?: string;
    matchingEligible?: boolean;
    featured?: boolean;
  } | null;
};

type OrgDetail = OrgRow & {
  members?: Array<{
    user: {
      id: string;
      email: string;
      firstName: string | null;
      lastName: string | null;
      status: string;
    };
  }>;
};

export function OrgRowActions({
  org,
  kind,
  queryKey,
}: {
  org: OrgRow;
  kind: 'company' | 'vendor';
  queryKey: unknown[];
}) {
  const qc = useQueryClient();
  const [mode, setMode] = useState<'view' | 'edit' | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [form, setForm] = useState({
    name: org.name,
    industry: org.industry ?? '',
    country: org.country ?? '',
    region: org.region ?? '',
    website: org.website ?? '',
    address: org.address ?? '',
    displayName: org.vendor?.displayName ?? org.name,
    categories: (org.vendor?.categories ?? []).join(', '),
    capabilities: (org.vendor?.capabilities ?? []).join(', '),
  });

  useEffect(() => {
    if (mode === 'edit') {
      setForm({
        name: org.name,
        industry: org.industry ?? '',
        country: org.country ?? '',
        region: org.region ?? '',
        website: org.website ?? '',
        address: org.address ?? '',
        displayName: org.vendor?.displayName ?? org.name,
        categories: (org.vendor?.categories ?? []).join(', '),
        capabilities: (org.vendor?.capabilities ?? []).join(', '),
      });
    }
  }, [mode, org]);

  const detail = useQuery({
    queryKey: ['organization', org.id],
    enabled: mode === 'view',
    queryFn: () =>
      apiFetch<OrgDetail>(`/organizations/${org.id}`, {
        token: getAccessToken(),
      }),
  });

  const save = useMutation({
    mutationFn: () =>
      apiFetch(`/organizations/${org.id}`, {
        method: 'PATCH',
        token: getAccessToken(),
        body: JSON.stringify({
          name: form.name,
          industry: form.industry || null,
          country: form.country || null,
          region: form.region || null,
          website: form.website || null,
          address: form.address || null,
          ...(kind === 'vendor'
            ? {
                displayName: form.displayName || form.name,
                categories: form.categories
                  .split(',')
                  .map((s) => s.trim())
                  .filter(Boolean),
                capabilities: form.capabilities
                  .split(',')
                  .map((s) => s.trim())
                  .filter(Boolean),
              }
            : {}),
        }),
      }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey });
      void qc.invalidateQueries({ queryKey: ['organization', org.id] });
      setMode(null);
    },
  });

  const remove = useMutation({
    mutationFn: () =>
      apiFetch(`/organizations/${org.id}`, {
        method: 'DELETE',
        token: getAccessToken(),
      }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey });
      setConfirmDelete(false);
    },
  });

  const isFeatured =
    kind === 'vendor'
      ? Boolean(org.vendor?.featured)
      : Boolean(org.company?.featured);

  const toggleFeatured = useMutation({
    mutationFn: () =>
      apiFetch(`/organizations/${org.id}/featured`, {
        method: 'PATCH',
        token: getAccessToken(),
        body: JSON.stringify({ featured: !isFeatured }),
      }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey });
      void qc.invalidateQueries({ queryKey: ['organization', org.id] });
      void qc.invalidateQueries({ queryKey: ['recommendations'] });
    },
  });

  const viewed = detail.data ?? org;

  return (
    <>
      <div className="inline-flex flex-nowrap items-center gap-1">
        <Button size="sm" variant="ghost" onClick={() => setMode('view')}>
          View
        </Button>
        <Button size="sm" variant="outline" onClick={() => setMode('edit')}>
          Edit
        </Button>
        <Button
          size="sm"
          variant={isFeatured ? 'secondary' : 'outline'}
          disabled={toggleFeatured.isPending}
          onClick={() => toggleFeatured.mutate()}
          title={
            isFeatured
              ? 'Remove from admin suggestions'
              : 'Show as admin suggestion on the counterpart panel'
          }
        >
          {isFeatured ? 'Unfeature' : 'Feature'}
        </Button>
        <Button
          size="sm"
          variant="danger"
          onClick={() => setConfirmDelete(true)}
        >
          Delete
        </Button>
      </div>

      <Modal
        open={mode === 'view'}
        title={viewed.name}
        description={`${orgKindLabel(kind)} details`}
        onClose={() => setMode(null)}
        wide
        footer={
          <>
            <Button variant="outline" onClick={() => setMode(null)}>
              Close
            </Button>
            <Button
              onClick={() => {
                setMode('edit');
              }}
            >
              Edit
            </Button>
          </>
        }
      >
        {detail.isLoading && <p className="text-[var(--muted)]">Loading…</p>}
        {detail.error && (
          <p className="text-rose-700">{(detail.error as Error).message}</p>
        )}
        <dl className="overflow-hidden rounded-xl border border-[var(--border)]">
          {(
            [
              ['Code', viewed.code],
              ['Status', viewed.status, 'status'],
              ['Industry', viewed.industry ?? '—'],
              ['Country', viewed.country ?? '—'],
              ['Region', viewed.region ?? '—'],
              ['Website', viewed.website ?? '—'],
              ['Address', viewed.address ?? '—'],
              [
                'Featured',
                (kind === 'vendor'
                  ? viewed.vendor?.featured
                  : viewed.company?.featured)
                  ? 'Yes'
                  : 'No',
              ],
              ...(kind === 'vendor'
                ? ([
                    ['Display name', viewed.vendor?.displayName ?? '—'],
                    [
                      'Approval',
                      viewed.vendor?.approvalStatus ?? '—',
                      'status',
                    ],
                    [
                      'Eligible',
                      viewed.vendor?.matchingEligible ? 'Yes' : 'No',
                    ],
                    [
                      'Categories',
                      (viewed.vendor?.categories ?? []).join(', ') || '—',
                    ],
                    [
                      'Capabilities',
                      (viewed.vendor?.capabilities ?? []).join(', ') || '—',
                    ],
                  ] as Array<[string, string, string?]>)
                : []),
            ] as Array<[string, string, string?]>
          ).map(([label, value, kindOf], index) => (
            <div
              key={label}
              className={`grid grid-cols-[8.5rem_minmax(0,1fr)] items-start gap-x-4 gap-y-1 px-4 py-3 text-left sm:grid-cols-[10rem_minmax(0,1fr)] ${
                index > 0 ? 'border-t border-[var(--border)]' : ''
              } ${index % 2 === 0 ? 'bg-white' : 'bg-[var(--card-elevated)]'}`}
            >
              <dt className="pt-0.5 text-xs font-semibold uppercase tracking-wide text-[var(--muted)]">
                {label}
              </dt>
              <dd className="min-w-0 break-words text-sm font-medium text-[var(--foreground)]">
                {kindOf === 'status' ? (
                  <Badge variant={statusTone(String(value))}>
                    {formatVendorStatus(String(value))}
                  </Badge>
                ) : (
                  value
                )}
              </dd>
            </div>
          ))}
        </dl>

        {detail.data?.members && detail.data.members.length > 0 ? (
          <div className="mt-5">
            <h3 className="mb-2 text-sm font-semibold">Members</h3>
            <ul className="overflow-hidden rounded-xl border border-[var(--border)]">
              {detail.data.members.map((m, index) => (
                <li
                  key={m.user.id}
                  className={`px-4 py-3 text-left text-sm ${
                    index > 0 ? 'border-t border-[var(--border)]' : ''
                  }`}
                >
                  <span className="font-medium">{m.user.email}</span>
                  <span className="text-[var(--muted)]">
                    {' '}
                    ·{' '}
                    {[m.user.firstName, m.user.lastName]
                      .filter(Boolean)
                      .join(' ') || 'No name'}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        ) : null}
      </Modal>

      <Modal
        open={mode === 'edit'}
        title={`Edit ${orgKindLabel(kind).toLowerCase()}`}
        description={`Update ${org.code}`}
        onClose={() => setMode(null)}
        wide
        footer={
          <>
            <Button variant="outline" onClick={() => setMode(null)}>
              Cancel
            </Button>
            <Button
              onClick={() => save.mutate()}
              disabled={save.isPending || !form.name.trim()}
            >
              {save.isPending ? 'Saving…' : 'Save changes'}
            </Button>
          </>
        }
      >
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="sm:col-span-2">
            <label className="mb-1 block text-sm font-medium">Name</label>
            <Input
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
            />
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium">Industry</label>
            <Input
              value={form.industry}
              onChange={(e) => setForm({ ...form, industry: e.target.value })}
            />
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium">Country</label>
            <Input
              value={form.country}
              onChange={(e) => setForm({ ...form, country: e.target.value })}
            />
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium">Region</label>
            <Input
              value={form.region}
              onChange={(e) => setForm({ ...form, region: e.target.value })}
            />
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium">Website</label>
            <Input
              value={form.website}
              onChange={(e) => setForm({ ...form, website: e.target.value })}
            />
          </div>
          <div className="sm:col-span-2">
            <label className="mb-1 block text-sm font-medium">Address</label>
            <Input
              value={form.address}
              onChange={(e) => setForm({ ...form, address: e.target.value })}
            />
          </div>
          {kind === 'vendor' ? (
            <>
              <div className="sm:col-span-2">
                <label className="mb-1 block text-sm font-medium">
                  Display name
                </label>
                <Input
                  value={form.displayName}
                  onChange={(e) =>
                    setForm({ ...form, displayName: e.target.value })
                  }
                />
              </div>
              <div className="sm:col-span-2">
                <label className="mb-1 block text-sm font-medium">
                  Categories (comma-separated)
                </label>
                <Input
                  value={form.categories}
                  onChange={(e) =>
                    setForm({ ...form, categories: e.target.value })
                  }
                />
              </div>
              <div className="sm:col-span-2">
                <label className="mb-1 block text-sm font-medium">
                  Capabilities (comma-separated)
                </label>
                <Input
                  value={form.capabilities}
                  onChange={(e) =>
                    setForm({ ...form, capabilities: e.target.value })
                  }
                />
              </div>
            </>
          ) : null}
        </div>
        {save.error && (
          <p className="mt-3 text-sm text-rose-700">
            {(save.error as Error).message}
          </p>
        )}
      </Modal>

      <ConfirmDialog
        open={confirmDelete}
        title={`Delete ${org.name}?`}
        description="This archives the organization. It will no longer appear in active directories."
        confirmLabel={remove.isPending ? 'Deleting…' : 'Delete'}
        onCancel={() => setConfirmDelete(false)}
        onConfirm={() => remove.mutate()}
      />
    </>
  );
}
