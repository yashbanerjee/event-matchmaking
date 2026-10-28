'use client';

import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
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

const PROFILE_KEYS = [
  { value: 'categories', label: 'Categories (vendor)' },
  { value: 'preferredCategories', label: 'Preferred categories (company)' },
  { value: 'capabilities', label: 'Capabilities' },
  { value: 'industry', label: 'Industry' },
  { value: 'regions', label: 'Regions / area' },
  { value: 'commercialTags', label: 'Commercial tags' },
];

export default function AdminFiltersPage() {
  const qc = useQueryClient();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [dimOpen, setDimOpen] = useState(false);
  const [dimForm, setDimForm] = useState({
    name: '',
    code: '',
    description: '',
    profileKey: 'categories',
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
          profileKey: dimForm.profileKey,
        }),
      }),
    onSuccess: (created) => {
      setDimOpen(false);
      setDimForm({
        name: '',
        code: '',
        description: '',
        profileKey: 'categories',
      });
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

  const profileLabel = useMemo(() => {
    const key = selected?.profileKey;
    return PROFILE_KEYS.find((p) => p.value === key)?.label ?? key;
  }, [selected?.profileKey]);

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Match & meet"
        title="Filters"
        description="Create tag groups (category, industry, area, …). Attach them to form dropdowns, then map related tags on Matchmaking."
        actions={
          <Button onClick={() => setDimOpen(true)}>Add filter group</Button>
        }
      />

      <div className="grid gap-4 lg:grid-cols-[280px_minmax(0,1fr)]">
        <Card className="h-fit">
          <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-[var(--muted)]">
            Filter groups
          </h2>
          {dimensions.isLoading ? (
            <p className="text-sm text-[var(--muted)]">Loading…</p>
          ) : items.length === 0 ? (
            <EmptyState
              title="No filters yet"
              description="Add a group such as Category or Industry, then add tags."
            />
          ) : (
            <div className="space-y-1">
              {items.map((dim) => (
                <button
                  key={dim.id}
                  type="button"
                  onClick={() => setSelectedId(dim.id)}
                  className={`flex w-full items-center justify-between rounded-xl px-3 py-2 text-left text-sm ${
                    selected?.id === dim.id
                      ? 'bg-[var(--accent-soft)] font-semibold text-[var(--accent-hover)]'
                      : 'hover:bg-[var(--card-elevated)]'
                  }`}
                >
                  <span>{dim.name}</span>
                  <Badge variant="secondary">{dim.tags.length}</Badge>
                </button>
              ))}
            </div>
          )}
        </Card>

        <Card>
          {!selected ? (
            <EmptyState
              title="Select a filter group"
              description="Or create one to start adding tags."
            />
          ) : (
            <div className="space-y-4">
              <div>
                <h2 className="text-lg font-semibold">{selected.name}</h2>
                <p className="text-sm text-[var(--muted)]">
                  Code <code>{selected.code}</code> · maps to {profileLabel}
                </p>
                {selected.description ? (
                  <p className="mt-1 text-sm">{selected.description}</p>
                ) : null}
              </div>

              <div className="flex flex-col gap-2 sm:flex-row">
                <Input
                  placeholder="New tag label (e.g. Food, Hotel)"
                  value={tagLabel}
                  onChange={(e) => setTagLabel(e.target.value)}
                />
                <Button
                  onClick={() => addTag.mutate()}
                  disabled={!tagLabel.trim() || addTag.isPending}
                >
                  Add tag
                </Button>
              </div>
              {addTag.error ? (
                <p className="text-sm text-rose-700">
                  {(addTag.error as Error).message}
                </p>
              ) : null}

              {selected.tags.length === 0 ? (
                <EmptyState
                  title="No tags"
                  description="Add options that will appear in form dropdowns."
                />
              ) : (
                <Table>
                  <THead>
                    <TR>
                      <TH>Label</TH>
                      <TH>Value</TH>
                      <TH>Status</TH>
                      <TH />
                    </TR>
                  </THead>
                  <TBody>
                    {selected.tags.map((tag) => (
                      <TR key={tag.id}>
                        <TD className="font-medium">{tag.label}</TD>
                        <TD>
                          <code className="text-xs">{tag.value}</code>
                        </TD>
                        <TD>
                          <Badge
                            variant={tag.isActive ? 'success' : 'secondary'}
                          >
                            {tag.isActive ? 'Active' : 'Inactive'}
                          </Badge>
                        </TD>
                        <TD className="space-x-2 text-right">
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => toggleTag.mutate(tag)}
                          >
                            {tag.isActive ? 'Disable' : 'Enable'}
                          </Button>
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => deleteTag.mutate(tag.id)}
                          >
                            Delete
                          </Button>
                        </TD>
                      </TR>
                    ))}
                  </TBody>
                </Table>
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
        <div className="space-y-3">
          <div>
            <label className="mb-1.5 block text-sm font-medium">Name</label>
            <Input
              value={dimForm.name}
              onChange={(e) =>
                setDimForm({ ...dimForm, name: e.target.value })
              }
              placeholder="Category"
            />
          </div>
          <div>
            <label className="mb-1.5 block text-sm font-medium">
              Code (optional)
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
              Profile field
            </label>
            <select
              className="h-10 w-full rounded-xl border border-[var(--border)] bg-white px-3 text-sm"
              value={dimForm.profileKey}
              onChange={(e) =>
                setDimForm({ ...dimForm, profileKey: e.target.value })
              }
            >
              {PROFILE_KEYS.map((key) => (
                <option key={key.value} value={key.value}>
                  {key.label}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="mb-1.5 block text-sm font-medium">
              Description
            </label>
            <Input
              value={dimForm.description}
              onChange={(e) =>
                setDimForm({ ...dimForm, description: e.target.value })
              }
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
