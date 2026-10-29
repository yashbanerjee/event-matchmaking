'use client';

import { useState, type FormEvent, type KeyboardEvent } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Plus } from 'lucide-react';
import { apiFetch } from '@/lib/api';
import { getAccessToken } from '@/lib/auth-store';
import { PageHeader } from '@/components/page-header';
import { EmptyState } from '@/components/empty-state';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Modal } from '@/components/ui/modal';
import { Table, TBody, TD, TH, THead, TR } from '@/components/ui/table';

type FilterTag = {
  id: string;
  value: string;
  label: string;
  isActive: boolean;
  sortOrder: number;
};

type FilterDimension = {
  id: string;
  code: string;
  name: string;
  description: string | null;
  profileKey: string;
  isActive: boolean;
  tags: FilterTag[];
};

function inferProfileKey(name: string, code?: string) {
  const key = `${code ?? ''} ${name}`.toLowerCase();
  if (key.includes('industr')) return 'industry';
  if (key.includes('region') || key.includes('area')) return 'regions';
  if (key.includes('capabilit')) return 'capabilities';
  if (key.includes('commercial')) return 'commercialTags';
  if (key.includes('prefer')) return 'preferredCategories';
  return 'categories';
}

export default function AdminFiltersPage() {
  const qc = useQueryClient();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [dimOpen, setDimOpen] = useState(false);
  const [dimForm, setDimForm] = useState({
    name: '',
    code: '',
    description: '',
  });
  const [tagLabel, setTagLabel] = useState('');

  const dimensions = useQuery({
    queryKey: ['filter-dimensions'],
    queryFn: () =>
      apiFetch<FilterDimension[]>('/filters/dimensions', {
        token: getAccessToken(),
      }),
  });

  const items = dimensions.data ?? [];
  const selected =
    items.find((d) => d.id === selectedId) ?? items[0] ?? null;

  const createDimension = useMutation({
    mutationFn: () =>
      apiFetch<FilterDimension>('/filters/dimensions', {
        method: 'POST',
        token: getAccessToken(),
        body: JSON.stringify({
          name: dimForm.name.trim(),
          code: dimForm.code.trim() || undefined,
          description: dimForm.description.trim() || undefined,
          profileKey: inferProfileKey(dimForm.name, dimForm.code),
        }),
      }),
    onSuccess: (created) => {
      setDimOpen(false);
      setDimForm({ name: '', code: '', description: '' });
      setSelectedId(created.id);
      void qc.invalidateQueries({ queryKey: ['filter-dimensions'] });
    },
  });

  const addTag = useMutation({
    mutationFn: () => {
      if (!selected) throw new Error('Select a filter first');
      return apiFetch(`/filters/dimensions/${selected.id}/tags`, {
        method: 'POST',
        token: getAccessToken(),
        body: JSON.stringify({ label: tagLabel.trim() }),
      });
    },
    onSuccess: () => {
      setTagLabel('');
      void qc.invalidateQueries({ queryKey: ['filter-dimensions'] });
    },
  });

  const toggleTag = useMutation({
    mutationFn: (tag: FilterTag) =>
      apiFetch(`/filters/tags/${tag.id}`, {
        method: 'PATCH',
        token: getAccessToken(),
        body: JSON.stringify({ isActive: !tag.isActive }),
      }),
    onSuccess: () =>
      void qc.invalidateQueries({ queryKey: ['filter-dimensions'] }),
  });

  const deleteTag = useMutation({
    mutationFn: (id: string) =>
      apiFetch(`/filters/tags/${id}`, {
        method: 'DELETE',
        token: getAccessToken(),
      }),
    onSuccess: () =>
      void qc.invalidateQueries({ queryKey: ['filter-dimensions'] }),
  });

  function submitTag(event?: FormEvent) {
    event?.preventDefault();
    if (!tagLabel.trim() || addTag.isPending) return;
    addTag.mutate();
  }

  function onTagKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === 'Enter') {
      event.preventDefault();
      submitTag();
    }
  }

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Match & meet"
        title="Filters"
        description="Create tag groups (category, industry, area, …). Attach them to form dropdowns, then map related tags on Matchmaking."
        actions={
          <Button onClick={() => setDimOpen(true)}>
            <Plus className="h-4 w-4" />
            Add filter group
          </Button>
        }
      />

      <div className="grid gap-4 lg:grid-cols-[260px_minmax(0,1fr)]">
        <Card className="h-fit p-4">
          <div className="mb-3 flex items-center justify-between gap-2">
            <h2 className="text-[11px] font-semibold uppercase tracking-[0.16em] text-[var(--muted)]">
              Filter groups
            </h2>
            <span className="text-xs text-[var(--muted)]">
              {items.length} group{items.length === 1 ? '' : 's'}
            </span>
          </div>
          {dimensions.isLoading ? (
            <p className="text-sm text-[var(--muted)]">Loading…</p>
          ) : items.length === 0 ? (
            <EmptyState
              title="No filters yet"
              description="Add a group such as Category or Industry, then add tags."
            />
          ) : (
            <div className="space-y-1">
              {items.map((dim) => {
                const active = selected?.id === dim.id;
                return (
                  <button
                    key={dim.id}
                    type="button"
                    onClick={() => setSelectedId(dim.id)}
                    className={`flex w-full items-center justify-between gap-2 rounded-xl px-3 py-2.5 text-left text-sm transition-colors ${
                      active
                        ? 'bg-[var(--accent-soft)] font-semibold text-[var(--accent-hover)] ring-1 ring-[var(--accent)]/20'
                        : 'text-[var(--foreground)] hover:bg-[var(--card-elevated)]'
                    }`}
                  >
                    <span className="truncate">{dim.name}</span>
                    <Badge variant={active ? 'accent' : 'secondary'}>
                      {dim.tags.length}
                    </Badge>
                  </button>
                );
              })}
            </div>
          )}
        </Card>

        <Card className="p-5">
          {!selected ? (
            <EmptyState
              title="Select a filter group"
              description="Or create one to start adding tags."
            />
          ) : (
            <div className="space-y-5">
              <div className="flex flex-wrap items-start justify-between gap-3 border-b border-[var(--border)] pb-4">
                <div>
                  <h2 className="text-xl font-semibold tracking-tight">
                    {selected.name}
                  </h2>
                  <p className="mt-1 text-sm text-[var(--muted)]">
                    Code{' '}
                    <code className="rounded-md bg-slate-100 px-1.5 py-0.5 text-xs">
                      {selected.code}
                    </code>
                    <span className="mx-1.5 text-slate-300">·</span>
                    {selected.tags.length} tag
                    {selected.tags.length === 1 ? '' : 's'}
                  </p>
                  {selected.description ? (
                    <p className="mt-2 max-w-2xl text-sm text-[var(--foreground)]/80">
                      {selected.description}
                    </p>
                  ) : null}
                </div>
              </div>

              <form onSubmit={submitTag} className="space-y-2">
                <label className="block text-sm font-medium">Add a tag</label>
                <div className="flex overflow-hidden rounded-xl border border-[var(--border)] bg-white shadow-sm focus-within:ring-2 focus-within:ring-[var(--ring)]">
                  <Input
                    className="h-11 flex-1 rounded-none border-0 shadow-none focus-visible:ring-0"
                    placeholder="e.g. Food, Hotel, Investor"
                    value={tagLabel}
                    onChange={(e) => setTagLabel(e.target.value)}
                    onKeyDown={onTagKeyDown}
                  />
                  <Button
                    type="submit"
                    className="h-11 shrink-0 rounded-none px-5"
                    disabled={!tagLabel.trim() || addTag.isPending}
                  >
                    <Plus className="h-4 w-4" />
                    {addTag.isPending ? 'Adding…' : 'Add tag'}
                  </Button>
                </div>
                <p className="text-xs text-[var(--muted)]">
                  Press Enter to add. Tags appear as dropdown options on forms.
                </p>
                {addTag.error ? (
                  <p className="text-sm text-rose-700">
                    {(addTag.error as Error).message}
                  </p>
                ) : null}
              </form>

              {selected.tags.length === 0 ? (
                <div className="rounded-2xl border border-dashed border-[var(--border)] bg-[var(--card-elevated)]/60 px-4 py-10">
                  <EmptyState
                    title="No tags yet"
                    description="Add the first option for this filter group."
                  />
                </div>
              ) : (
                <div className="overflow-hidden rounded-2xl border border-[var(--border)]">
                  <Table>
                    <THead>
                      <TR>
                        <TH>Label</TH>
                        <TH>Value</TH>
                        <TH>Status</TH>
                        <TH className="text-right">Actions</TH>
                      </TR>
                    </THead>
                    <TBody>
                      {selected.tags.map((tag) => (
                        <TR key={tag.id}>
                          <TD className="font-medium">{tag.label}</TD>
                          <TD>
                            <code className="rounded-md bg-slate-100 px-1.5 py-0.5 text-xs text-slate-700">
                              {tag.value}
                            </code>
                          </TD>
                          <TD>
                            <Badge
                              variant={tag.isActive ? 'success' : 'secondary'}
                            >
                              {tag.isActive ? 'Active' : 'Inactive'}
                            </Badge>
                          </TD>
                          <TD>
                            <div className="flex justify-end gap-2">
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={() => toggleTag.mutate(tag)}
                                disabled={toggleTag.isPending}
                              >
                                {tag.isActive ? 'Disable' : 'Enable'}
                              </Button>
                              <Button
                                size="sm"
                                variant="danger"
                                onClick={() => deleteTag.mutate(tag.id)}
                                disabled={deleteTag.isPending}
                              >
                                Delete
                              </Button>
                            </div>
                          </TD>
                        </TR>
                      ))}
                    </TBody>
                  </Table>
                </div>
              )}
            </div>
          )}
        </Card>
      </div>

      <Modal
        open={dimOpen}
        title="Add filter group"
        description="Example: Category, Industry, Area. Tags in this group become dropdown options on forms."
        onClose={() => setDimOpen(false)}
        footer={
          <>
            <Button variant="outline" onClick={() => setDimOpen(false)}>
              Cancel
            </Button>
            <Button
              onClick={() => createDimension.mutate()}
              disabled={!dimForm.name.trim() || createDimension.isPending}
            >
              {createDimension.isPending ? 'Saving…' : 'Create'}
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          <div>
            <label className="mb-1.5 block text-sm font-medium">Name</label>
            <Input
              value={dimForm.name}
              onChange={(e) =>
                setDimForm({ ...dimForm, name: e.target.value })
              }
              placeholder="Category"
              autoFocus
            />
          </div>
          <div>
            <label className="mb-1.5 block text-sm font-medium">
              Code <span className="font-normal text-[var(--muted)]">(optional)</span>
            </label>
            <Input
              value={dimForm.code}
              onChange={(e) =>
                setDimForm({ ...dimForm, code: e.target.value })
              }
              placeholder="category"
            />
          </div>
          <div>
            <label className="mb-1.5 block text-sm font-medium">
              Description{' '}
              <span className="font-normal text-[var(--muted)]">(optional)</span>
            </label>
            <textarea
              className="min-h-24 w-full rounded-xl border border-[var(--border)] bg-white px-3 py-2 text-sm shadow-sm placeholder:text-[var(--muted)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)]"
              value={dimForm.description}
              onChange={(e) =>
                setDimForm({ ...dimForm, description: e.target.value })
              }
              placeholder="What this filter group is used for"
            />
          </div>
          {createDimension.error ? (
            <p className="text-sm text-rose-700">
              {(createDimension.error as Error).message}
            </p>
          ) : null}
        </div>
      </Modal>
    </div>
  );
}
