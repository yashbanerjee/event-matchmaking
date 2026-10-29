'use client';

import { useEffect, useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiFetch } from '@/lib/api';
import { getAccessToken } from '@/lib/auth-store';
import { EmptyState } from '@/components/empty-state';
import { Badge } from '@/components/ui/badge';
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

  const allTagOptions = useMemo(() => {
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

  /** Tags already used on the left (from) side of any existing link. */
  const usedFromTagIds = useMemo(() => {
    const ids = new Set<string>();
    for (const row of mappings.data ?? []) {
      ids.add(row.fromTag.id);
    }
    return ids;
  }, [mappings.data]);

  const fromTagOptions = useMemo(
    () => allTagOptions.filter((opt) => !usedFromTagIds.has(opt.id)),
    [allTagOptions, usedFromTagIds],
  );

  const toTagOptions = allTagOptions;

  useEffect(() => {
    if (fromTagId && usedFromTagIds.has(fromTagId)) {
      setFromTagId('');
    }
  }, [fromTagId, usedFromTagIds]);

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

  const rows = mappings.data ?? [];

  return (
    <Card className="space-y-5 p-5">
      <div>
        <h2 className="text-lg font-semibold">Tag matching</h2>
        <p className="mt-1 text-sm text-[var(--muted)]">
          Link related tags so recommendations cross-match. Previously linked
          tags stay listed below. The left dropdown only shows tags not yet
          used as a “from” link; the right dropdown shows every tag.
        </p>
      </div>

      <div className="rounded-2xl border border-[var(--border)] bg-[var(--card-elevated)]/50 p-4">
        <div className="grid gap-3 sm:grid-cols-[1fr_1fr_auto_auto] sm:items-end">
          <label className="grid gap-1.5 text-sm font-medium">
            From tag
            <select
              className="h-10 rounded-xl border border-[var(--border)] bg-white px-3 text-sm"
              value={fromTagId}
              onChange={(e) => setFromTagId(e.target.value)}
            >
              <option value="">Select unused tag…</option>
              {fromTagOptions.map((opt) => (
                <option key={opt.id} value={opt.id}>
                  {opt.label}
                </option>
              ))}
            </select>
            <span className="text-xs font-normal text-[var(--muted)]">
              {fromTagOptions.length} available
            </span>
          </label>
          <label className="grid gap-1.5 text-sm font-medium">
            To tag
            <select
              className="h-10 rounded-xl border border-[var(--border)] bg-white px-3 text-sm"
              value={toTagId}
              onChange={(e) => setToTagId(e.target.value)}
            >
              <option value="">Select any tag…</option>
              {toTagOptions.map((opt) => (
                <option key={opt.id} value={opt.id}>
                  {opt.label}
                </option>
              ))}
            </select>
            <span className="text-xs font-normal text-[var(--muted)]">
              All {toTagOptions.length} tags
            </span>
          </label>
          <label className="flex items-center gap-2 pb-6 text-sm">
            <input
              type="checkbox"
              checked={bidirectional}
              onChange={(e) => setBidirectional(e.target.checked)}
            />
            Both ways
          </label>
          <Button
            className="mb-5"
            onClick={() => create.mutate()}
            disabled={
              !fromTagId ||
              !toTagId ||
              fromTagId === toTagId ||
              create.isPending
            }
          >
            {create.isPending ? 'Linking…' : 'Link tags'}
          </Button>
        </div>
        {create.error ? (
          <p className="mt-2 text-sm text-rose-700">
            {(create.error as Error).message}
          </p>
        ) : null}
      </div>

      <div>
        <div className="mb-3 flex items-center justify-between gap-2">
          <h3 className="text-sm font-semibold">Previously linked tags</h3>
          <Badge variant="secondary">
            {rows.length} link{rows.length === 1 ? '' : 's'}
          </Badge>
        </div>

        {mappings.isLoading ? (
          <p className="text-sm text-[var(--muted)]">Loading…</p>
        ) : rows.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-[var(--border)] px-4 py-8">
            <EmptyState
              title="No tag links yet"
              description="Create filters and tags first, then link related options above."
            />
          </div>
        ) : (
          <div className="overflow-hidden rounded-2xl border border-[var(--border)]">
            <Table>
              <THead>
                <TR>
                  <TH>From</TH>
                  <TH>To</TH>
                  <TH>Direction</TH>
                  <TH className="text-right">Actions</TH>
                </TR>
              </THead>
              <TBody>
                {rows.map((row) => (
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
                    <TD>
                      <Badge
                        variant={row.bidirectional ? 'accent' : 'secondary'}
                      >
                        {row.bidirectional ? 'Both ways' : 'One way'}
                      </Badge>
                    </TD>
                    <TD className="text-right">
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => remove.mutate(row.id)}
                        disabled={remove.isPending}
                      >
                        Remove
                      </Button>
                    </TD>
                  </TR>
                ))}
              </TBody>
            </Table>
          </div>
        )}
      </div>
    </Card>
  );
}
