'use client';

import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiFetch } from '@/lib/api';
import { getAccessToken } from '@/lib/auth-store';
import { EmptyState } from '@/components/empty-state';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Table, TBody, TD, TH, THead, TR } from '@/components/ui/table';

type FilterTag = {
  id: string;
  value: string;
  label: string;
  isActive: boolean;
};

type FilterDimension = {
  id: string;
  name: string;
  code: string;
  tags: FilterTag[];
};

type Mapping = {
  id: string;
  bidirectional: boolean;
  fromTag: {
    id: string;
    label: string;
    value: string;
    dimension: { name: string; code: string };
  };
  toTag: {
    id: string;
    label: string;
    value: string;
    dimension: { name: string; code: string };
  };
};

export function TagMappingsPanel() {
  const qc = useQueryClient();
  const [fromTagId, setFromTagId] = useState('');
  const [toTagId, setToTagId] = useState('');
  const [bidirectional, setBidirectional] = useState(true);

  const dimensions = useQuery({
    queryKey: ['filter-dimensions'],
    queryFn: () =>
      apiFetch<FilterDimension[]>('/filters/dimensions?activeOnly=1', {
        token: getAccessToken(),
      }),
  });

  const mappings = useQuery({
    queryKey: ['filter-mappings'],
    queryFn: () =>
      apiFetch<Mapping[]>('/filters/mappings', {
        token: getAccessToken(),
      }),
  });

  const tagOptions = useMemo(() => {
    const list: Array<{ id: string; label: string }> = [];
    for (const dim of dimensions.data ?? []) {
      for (const tag of dim.tags.filter((t) => t.isActive)) {
        list.push({
          id: tag.id,
          label: `${dim.name}: ${tag.label}`,
        });
      }
    }
    return list;
  }, [dimensions.data]);

  const create = useMutation({
    mutationFn: () =>
      apiFetch('/filters/mappings', {
        method: 'POST',
        token: getAccessToken(),
        body: JSON.stringify({ fromTagId, toTagId, bidirectional }),
      }),
    onSuccess: () => {
      setFromTagId('');
      setToTagId('');
      void qc.invalidateQueries({ queryKey: ['filter-mappings'] });
    },
  });

  const remove = useMutation({
    mutationFn: (id: string) =>
      apiFetch(`/filters/mappings/${id}`, {
        method: 'DELETE',
        token: getAccessToken(),
      }),
    onSuccess: () =>
      void qc.invalidateQueries({ queryKey: ['filter-mappings'] }),
  });

  return (
    <Card>
      <div className="mb-4">
        <h2 className="text-lg font-semibold">Tag matching</h2>
        <p className="mt-1 text-sm text-[var(--muted)]">
          Link related tags so recommendations cross-match. Example: Category
          Food ↔ Category Hotel shows those users to each other.
        </p>
      </div>

      <div className="mb-4 grid gap-3 sm:grid-cols-[1fr_1fr_auto_auto] sm:items-end">
        <label className="grid gap-1 text-sm font-medium">
          From tag
          <select
            className="h-10 rounded-xl border border-[var(--border)] bg-white px-3 text-sm"
            value={fromTagId}
            onChange={(e) => setFromTagId(e.target.value)}
          >
            <option value="">Select…</option>
            {tagOptions.map((opt) => (
              <option key={opt.id} value={opt.id}>
                {opt.label}
              </option>
            ))}
          </select>
        </label>
        <label className="grid gap-1 text-sm font-medium">
          To tag
          <select
            className="h-10 rounded-xl border border-[var(--border)] bg-white px-3 text-sm"
            value={toTagId}
            onChange={(e) => setToTagId(e.target.value)}
          >
            <option value="">Select…</option>
            {tagOptions.map((opt) => (
              <option key={opt.id} value={opt.id}>
                {opt.label}
              </option>
            ))}
          </select>
        </label>
        <label className="flex items-center gap-2 pb-2 text-sm">
          <input
            type="checkbox"
            checked={bidirectional}
            onChange={(e) => setBidirectional(e.target.checked)}
          />
          Both ways
        </label>
        <Button
          onClick={() => create.mutate()}
          disabled={!fromTagId || !toTagId || create.isPending}
        >
          Link tags
        </Button>
      </div>
      {create.error ? (
        <p className="mb-3 text-sm text-rose-700">
          {(create.error as Error).message}
        </p>
      ) : null}

      {mappings.isLoading ? (
        <p className="text-sm text-[var(--muted)]">Loading…</p>
      ) : (mappings.data ?? []).length === 0 ? (
        <EmptyState
          title="No tag links yet"
          description="Create filters and tags first, then link related options here."
        />
      ) : (
        <Table>
          <THead>
            <TR>
              <TH>From</TH>
              <TH>To</TH>
              <TH>Direction</TH>
              <TH />
            </TR>
          </THead>
          <TBody>
            {(mappings.data ?? []).map((row) => (
              <TR key={row.id}>
                <TD>
                  <span className="font-medium">{row.fromTag.label}</span>
                  <span className="ml-2 text-xs text-[var(--muted)]">
                    {row.fromTag.dimension.name}
                  </span>
                </TD>
                <TD>
                  <span className="font-medium">{row.toTag.label}</span>
                  <span className="ml-2 text-xs text-[var(--muted)]">
                    {row.toTag.dimension.name}
                  </span>
                </TD>
                <TD>{row.bidirectional ? 'Both ways' : 'One way'}</TD>
                <TD className="text-right">
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => remove.mutate(row.id)}
                  >
                    Remove
                  </Button>
                </TD>
              </TR>
            ))}
          </TBody>
        </Table>
      )}
    </Card>
  );
}
