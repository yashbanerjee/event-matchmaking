'use client';

import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiFetch } from '@/lib/api';
import { getAccessToken } from '@/lib/auth-store';
import { PageHeader } from '@/components/page-header';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Modal } from '@/components/ui/modal';
import { Table, TBody, TD, TH, THead, TR } from '@/components/ui/table';
import { EmptyState } from '@/components/empty-state';

type Place = {
  id: string;
  name: string;
  code: string;
  description: string | null;
  capacity: number | null;
  location: string | null;
  isActive: boolean;
};

const emptyForm = {
  name: '',
  code: '',
  description: '',
  capacity: '',
  location: '',
};

export default function AdminPlacesPage() {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState(emptyForm);

  const places = useQuery({
    queryKey: ['places'],
    queryFn: () =>
      apiFetch<Place[]>('/places', { token: getAccessToken() }),
  });

  const create = useMutation({
    mutationFn: () =>
      apiFetch<Place>('/places', {
        method: 'POST',
        token: getAccessToken(),
        body: JSON.stringify({
          name: form.name.trim(),
          code: form.code.trim() || undefined,
          description: form.description.trim() || undefined,
          capacity: form.capacity ? Number(form.capacity) : undefined,
          location: form.location.trim() || undefined,
        }),
      }),
    onSuccess: () => {
      setOpen(false);
      setForm(emptyForm);
      void qc.invalidateQueries({ queryKey: ['places'] });
    },
  });

  const toggle = useMutation({
    mutationFn: (place: Place) =>
      apiFetch(`/places/${place.id}`, {
        method: 'PATCH',
        token: getAccessToken(),
        body: JSON.stringify({ isActive: !place.isActive }),
      }),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ['places'] }),
  });

  const items = places.data ?? [];

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Match & meet"
        title="Places"
        description="Meeting tables and rooms. Only free places are offered when parties pick a slot."
        actions={
          <Button onClick={() => setOpen(true)}>Add place</Button>
        }
      />

      <Card>
        {places.isLoading ? (
          <p className="text-sm text-[var(--muted)]">Loading…</p>
        ) : items.length === 0 ? (
          <EmptyState
            title="No places yet"
            description="Add tables or rooms that participants can book for peer meetings."
          />
        ) : (
          <Table>
            <THead>
              <TR>
                <TH>Name</TH>
                <TH>Code</TH>
                <TH>Location</TH>
                <TH>Capacity</TH>
                <TH>Status</TH>
                <TH />
              </TR>
            </THead>
            <TBody>
              {items.map((place) => (
                <TR key={place.id}>
                  <TD className="font-medium">{place.name}</TD>
                  <TD>{place.code}</TD>
                  <TD>{place.location ?? '—'}</TD>
                  <TD>{place.capacity ?? '—'}</TD>
                  <TD>
                    <Badge variant={place.isActive ? 'success' : 'secondary'}>
                      {place.isActive ? 'Active' : 'Inactive'}
                    </Badge>
                  </TD>
                  <TD className="text-right">
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => toggle.mutate(place)}
                    >
                      {place.isActive ? 'Deactivate' : 'Activate'}
                    </Button>
                  </TD>
                </TR>
              ))}
            </TBody>
          </Table>
        )}
      </Card>

      <Modal
        open={open}
        title="Add place"
        description="Places appear when a party proposes a time for a meeting."
        onClose={() => setOpen(false)}
        footer={
          <>
            <Button variant="outline" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button
              onClick={() => create.mutate()}
              disabled={create.isPending || !form.name.trim()}
            >
              {create.isPending ? 'Saving…' : 'Save place'}
            </Button>
          </>
        }
      >
        <div className="space-y-3">
          <div>
            <label className="mb-1.5 block text-sm font-medium">Name</label>
            <Input
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              placeholder="Table A1"
            />
          </div>
          <div>
            <label className="mb-1.5 block text-sm font-medium">
              Code (optional)
            </label>
            <Input
              value={form.code}
              onChange={(e) => setForm({ ...form, code: e.target.value })}
              placeholder="A1"
            />
          </div>
          <div>
            <label className="mb-1.5 block text-sm font-medium">Location</label>
            <Input
              value={form.location}
              onChange={(e) => setForm({ ...form, location: e.target.value })}
              placeholder="Hall B"
            />
          </div>
          <div>
            <label className="mb-1.5 block text-sm font-medium">Capacity</label>
            <Input
              type="number"
              value={form.capacity}
              onChange={(e) => setForm({ ...form, capacity: e.target.value })}
            />
          </div>
          <div>
            <label className="mb-1.5 block text-sm font-medium">
              Description
            </label>
            <Input
              value={form.description}
              onChange={(e) =>
                setForm({ ...form, description: e.target.value })
              }
            />
          </div>
          {create.error ? (
            <p className="text-sm text-rose-700">
              {(create.error as Error).message}
            </p>
          ) : null}
        </div>
      </Modal>
    </div>
  );
}
