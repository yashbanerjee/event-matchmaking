'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useMemo, useState } from 'react';
import { apiFetch } from '@/lib/api';
import { getAccessToken } from '@/lib/auth-store';
import { statusTone } from '@/lib/status';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Pagination } from '@/components/ui/pagination';
import { PageHeader } from '@/components/page-header';
import { EmptyState } from '@/components/empty-state';
import { Modal } from '@/components/ui/modal';
import { ConfirmDialog } from '@/components/ui/dialog';
import { Table, TBody, TD, TH, THead, TR } from '@/components/ui/table';

type FormItem = {
  id: string;
  code: string;
  name: string;
  description?: string | null;
  targetType?: string | null;
  versions: Array<{
    id: string;
    version: number;
    status: string;
  }>;
};

const PAGE_SIZE = 10;

export default function FormsPage() {
  const router = useRouter();
  const qc = useQueryClient();
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [open, setOpen] = useState(false);
  const [name, setName] = useState('');
  const [deleteId, setDeleteId] = useState<string | null>(null);

  const forms = useQuery({
    queryKey: ['forms'],
    queryFn: () =>
      apiFetch<FormItem[]>('/forms', { token: getAccessToken() }),
    retry: 1,
  });

  const filtered = useMemo(() => {
    const items = forms.data ?? [];
    const q = search.trim().toLowerCase();
    if (!q) return items;
    return items.filter(
      (f) =>
        f.name.toLowerCase().includes(q) ||
        f.code.toLowerCase().includes(q) ||
        (f.targetType ?? '').toLowerCase().includes(q),
    );
  }, [forms.data, search]);

  const total = filtered.length;
  const pageItems = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  const create = useMutation({
    mutationFn: () =>
      apiFetch<FormItem>('/forms', {
        method: 'POST',
        token: getAccessToken(),
        body: JSON.stringify({ name: name.trim(), isTemplate: true }),
      }),
    onSuccess: async (created) => {
      setOpen(false);
      setName('');
      await qc.invalidateQueries({ queryKey: ['forms'] });
      router.push(`/admin/forms/${created.id}`);
    },
  });

  const remove = useMutation({
    mutationFn: (id: string) =>
      apiFetch(`/forms/${id}`, {
        method: 'DELETE',
        token: getAccessToken(),
      }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['forms'] });
      setDeleteId(null);
    },
  });

  return (
    <div className="space-y-6">
      <PageHeader
        title="Forms"
        description="Write the questions companies and vendors answer online. Publish a form when it is ready to assign."
        actions={
          <Button onClick={() => setOpen(true)}>New form</Button>
        }
      />

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <Input
          className="max-w-sm"
          placeholder="Search forms…"
          value={search}
          onChange={(event) => {
            setSearch(event.target.value);
            setPage(1);
          }}
        />
      </div>

      {forms.isLoading ? (
        <p className="text-sm text-[var(--muted)]">Loading forms…</p>
      ) : pageItems.length === 0 ? (
        <div className="space-y-4">
          <EmptyState
            title="No forms yet"
            description="Create a draft form, then design fields on the canvas."
          />
          <Button onClick={() => setOpen(true)}>New form</Button>
        </div>
      ) : (
        <>
          <div className="overflow-hidden rounded-2xl border border-[var(--border)] bg-[var(--card)]">
            <Table>
              <THead>
                <TR>
                  <TH>Name</TH>
                  <TH>Code</TH>
                  <TH>Status</TH>
                  <TH>Latest version</TH>
                  <TH className="text-right">Actions</TH>
                </TR>
              </THead>
              <TBody>
                {pageItems.map((form) => {
                  const latest = form.versions[0];
                  const status = latest?.status ?? 'DRAFT';
                  return (
                    <TR key={form.id}>
                      <TD>
                        <Link
                          className="font-medium underline decoration-[var(--border)] underline-offset-4 hover:decoration-[var(--accent)]"
                          href={`/admin/forms/${form.id}`}
                        >
                          {form.name}
                        </Link>
                      </TD>
                      <TD className="text-[var(--muted)]">{form.code}</TD>
                      <TD>
                        <Badge variant={statusTone(status)}>{status}</Badge>
                      </TD>
                      <TD>
                        {latest
                          ? latest.status === 'PUBLISHED'
                            ? `v${latest.version}`
                            : `Draft v${latest.version}`
                          : 'Draft'}
                      </TD>
                      <TD className="text-right">
                        <div className="flex justify-end gap-2">
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() =>
                              router.push(`/admin/forms/${form.id}`)
                            }
                          >
                            Open
                          </Button>
                          <Button
                            size="sm"
                            variant="danger"
                            onClick={() => setDeleteId(form.id)}
                          >
                            Delete
                          </Button>
                        </div>
                      </TD>
                    </TR>
                  );
                })}
              </TBody>
            </Table>
          </div>
          <Pagination
            page={page}
            pageSize={PAGE_SIZE}
            total={total}
            onPageChange={setPage}
          />
        </>
      )}

      <Modal
        open={open}
        title="New form"
        description="Create a draft, then add fields on the form canvas."
        onClose={() => setOpen(false)}
        footer={
          <>
            <Button variant="outline" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button
              disabled={!name.trim() || create.isPending}
              onClick={() => create.mutate()}
            >
              Create draft
            </Button>
          </>
        }
      >
        <label className="grid gap-1 text-sm font-medium">
          Name
          <Input
            required
            value={name}
            onChange={(event) => setName(event.target.value)}
            placeholder="Vendor onboarding"
            onKeyDown={(event) => {
              if (event.key === 'Enter' && name.trim()) create.mutate();
            }}
          />
        </label>
        {create.isError ? (
          <p className="mt-3 text-sm text-[var(--danger)]">
            Could not create the form. Try again.
          </p>
        ) : null}
      </Modal>

      <ConfirmDialog
        open={Boolean(deleteId)}
        title="Delete form?"
        description="This permanently removes the form and its versions."
        confirmLabel="Delete"
        onCancel={() => setDeleteId(null)}
        onConfirm={() => deleteId && remove.mutate(deleteId)}
      />
    </div>
  );
}
