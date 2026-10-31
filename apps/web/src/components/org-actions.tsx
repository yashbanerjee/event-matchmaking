'use client';

import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import Link from 'next/link';
import { MoreHorizontal } from 'lucide-react';
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
  latestSubmission?: { id: string } | null;
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
  onVerify,
  verifying,
}: {
  org: OrgRow;
  kind: 'company' | 'vendor';
  queryKey: unknown[];
  onVerify?: () => void;
  verifying?: boolean;
}) {
  const qc = useQueryClient();
  const buttonRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const [menuPos, setMenuPos] = useState({ top: 0, left: 0 });
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

  const profileHref =
    kind === 'company'
      ? `/admin/companies/${org.id}`
      : `/admin/vendors/${org.id}`;
  const formHref = org.latestSubmission?.id
    ? `${profileHref}/form?submissionId=${org.latestSubmission.id}`
    : `${profileHref}/form`;
  const status =
    org.vendor?.approvalStatus ?? org.company?.approvalStatus ?? org.status;
  const verified = status === 'VERIFIED' || status === 'APPROVED';

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

  useEffect(() => {
    if (!open) return;
    const update = () => {
      const rect = buttonRef.current?.getBoundingClientRect();
      if (!rect) return;
      const width = 196;
      setMenuPos({
        top: rect.bottom + 6,
        left: Math.max(8, rect.right - width),
      });
    };
    update();
    const onPointer = (event: MouseEvent) => {
      const target = event.target as Node;
      if (buttonRef.current?.contains(target) || menuRef.current?.contains(target)) {
        return;
      }
      setOpen(false);
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false);
    };
    window.addEventListener('resize', update);
    window.addEventListener('scroll', update, true);
    document.addEventListener('mousedown', onPointer);
    document.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('resize', update);
      window.removeEventListener('scroll', update, true);
      document.removeEventListener('mousedown', onPointer);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

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
      setOpen(false);
    },
  });

  const itemClass =
    'block w-full px-3 py-2 text-left text-sm text-[var(--foreground)] hover:bg-black/5';

  return (
    <>
      <Button
        ref={buttonRef}
        type="button"
        size="sm"
        variant="ghost"
        className="h-8 w-8 px-0"
        aria-label={`Actions for ${org.name}`}
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((value) => !value)}
      >
        <MoreHorizontal className="h-4 w-4" />
      </Button>

      {open && typeof document !== 'undefined'
        ? createPortal(
            <div
              ref={menuRef}
              role="menu"
              className="fixed z-[80] min-w-48 overflow-hidden rounded-xl border border-[var(--border)] bg-white py-1 shadow-[var(--shadow)]"
              style={{ top: menuPos.top, left: menuPos.left }}
            >
              <Link
                href={formHref}
                className={itemClass}
                onClick={() => setOpen(false)}
              >
                {org.latestSubmission ? 'View form' : 'Form status'}
              </Link>
              {kind === 'company' ? (
                <Link
                  href={`${profileHref}#table`}
                  className={itemClass}
                  onClick={() => setOpen(false)}
                >
                  Allot table
                </Link>
              ) : null}
              {kind === 'vendor' && !verified && onVerify ? (
                <button
                  type="button"
                  className={itemClass}
                  disabled={verifying}
                  onClick={() => {
                    setOpen(false);
                    onVerify();
                  }}
                >
                  {verifying ? 'Verifying…' : 'Verify'}
                </button>
              ) : null}
              <button
                type="button"
                className={itemClass}
                onClick={() => {
                  setOpen(false);
                  setMode('edit');
                }}
              >
                Edit
              </button>
              <Link
                href={`/admin/recommendations?orgId=${org.id}`}
                className={itemClass}
                onClick={() => setOpen(false)}
              >
                Recommendations
              </Link>
              <button
                type="button"
                className={itemClass}
                disabled={toggleFeatured.isPending}
                onClick={() => toggleFeatured.mutate()}
              >
                {isFeatured ? 'Unfeature' : 'Feature'}
              </button>
              <button
                type="button"
                className={`${itemClass} text-[var(--danger)]`}
                onClick={() => {
                  setOpen(false);
                  setConfirmDelete(true);
                }}
              >
                Delete
              </button>
            </div>,
            document.body,
          )
        : null}

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
