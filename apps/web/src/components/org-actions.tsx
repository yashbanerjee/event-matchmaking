'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { apiFetch } from '@/lib/api';
import { getAccessToken } from '@/lib/auth-store';
import { orgKindLabel } from '@/lib/org-labels';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
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
  const [mode, setMode] = useState<'edit' | null>(null);
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

  return (
    <>
      <div className="inline-flex flex-nowrap items-center gap-1">
        <Button size="sm" variant="outline" onClick={() => setMode('edit')}>
          Edit
        </Button>
        <Link href={`/admin/recommendations?orgId=${org.id}`}>
          <Button size="sm" variant="ghost">
            Recs
          </Button>
        </Link>
        <Button
          size="sm"
          variant="ghost"
          loading={toggleFeatured.isPending}
          onClick={() => toggleFeatured.mutate()}
          title={isFeatured ? 'Unfeature' : 'Feature'}
        >
          {isFeatured ? 'Unfeature' : 'Feature'}
        </Button>
        <Button
          size="sm"
          variant="ghost"
          onClick={() => setConfirmDelete(true)}
        >
          Delete
        </Button>
      </div>

      <Modal
        open={mode === 'edit'}
        title={`Edit ${orgKindLabel(kind).toLowerCase()}`}
        description={org.code}
        onClose={() => setMode(null)}
        footer={
          <>
            <Button variant="outline" onClick={() => setMode(null)}>
              Cancel
            </Button>
            <Button
              onClick={() => save.mutate()}
              loading={save.isPending}
              disabled={!form.name.trim()}
            >
              {save.isPending ? 'Saving…' : 'Save'}
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
        description="This permanently deletes the account, members without other orgs, forms, and related meetings. This cannot be undone."
        confirmLabel={remove.isPending ? 'Deleting…' : 'Delete permanently'}
        loading={remove.isPending}
        onCancel={() => setConfirmDelete(false)}
        onConfirm={() => remove.mutate()}
      />
    </>
  );
}
