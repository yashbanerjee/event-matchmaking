'use client';

import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ApiError, apiFetch } from '@/lib/api';
import { getAccessToken } from '@/lib/auth-store';
import { PageHeader } from '@/components/page-header';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Modal } from '@/components/ui/modal';
import { Table, TBody, TD, TH, THead, TR } from '@/components/ui/table';
import { EmptyState } from '@/components/empty-state';
import { LocationMapPicker } from '@/components/location-map-picker';
import { MeetingPlaceLink } from '@/components/meeting-place-link';

type Place = {
  id: string;
  name: string;
  code: string;
  description: string | null;
  capacity: number | null;
  location: string | null;
  latitude: number | null;
  longitude: number | null;
  mapAddress: string | null;
  isActive: boolean;
};

const emptyForm = {
  name: '',
  code: '',
  description: '',
  capacity: '',
  location: '',
  latitude: null as number | null,
  longitude: null as number | null,
  mapAddress: '',
};

export default function AdminPlacesPage() {
  const qc = useQueryClient();
  const [creating, setCreating] = useState(false);
  const [edit, setEdit] = useState<Place | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [form, setForm] = useState(emptyForm);
  const [error, setError] = useState<string | null>(null);

  const places = useQuery({
    queryKey: ['places'],
    queryFn: () =>
      apiFetch<Place[]>('/places', { token: getAccessToken() }),
  });

  const payload = () => ({
    name: form.name.trim(),
    code: form.code.trim() || undefined,
    description: form.description.trim() || undefined,
    capacity: form.capacity ? Number(form.capacity) : undefined,
    location: form.location.trim() || undefined,
    latitude: form.latitude,
    longitude: form.longitude,
    mapAddress: form.mapAddress.trim() || null,
  });

  const create = useMutation({
    mutationFn: () =>
      apiFetch<Place>('/places', {
        method: 'POST',
        token: getAccessToken(),
        body: JSON.stringify(payload()),
      }),
    onSuccess: () => {
      setCreating(false);
      setForm(emptyForm);
      setError(null);
      void qc.invalidateQueries({ queryKey: ['places'] });
    },
    onError: (err) =>
      setError(err instanceof ApiError ? err.message : (err as Error).message),
  });

  const update = useMutation({
    mutationFn: () => {
      if (!edit) throw new Error('No place selected');
      return apiFetch<Place>(`/places/${edit.id}`, {
        method: 'PATCH',
        token: getAccessToken(),
        body: JSON.stringify({
          name: form.name.trim(),
          code: form.code.trim() || undefined,
          description: form.description.trim() || null,
          capacity: form.capacity ? Number(form.capacity) : null,
          location: form.location.trim() || null,
          latitude: form.latitude,
          longitude: form.longitude,
          mapAddress: form.mapAddress.trim() || null,
        }),
      });
    },
    onSuccess: () => {
      setEdit(null);
      setForm(emptyForm);
      setError(null);
      void qc.invalidateQueries({ queryKey: ['places'] });
    },
    onError: (err) =>
      setError(err instanceof ApiError ? err.message : (err as Error).message),
  });

  const toggle = useMutation({
    mutationFn: (place: Place) =>
      apiFetch(`/places/${place.id}`, {
        method: 'PATCH',
        token: getAccessToken(),
        body: JSON.stringify({ isActive: !place.isActive }),
      }),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ['places'] }),
    onError: (err) =>
      setError(err instanceof ApiError ? err.message : (err as Error).message),
  });

  const remove = useMutation({
    mutationFn: (placeId: string) =>
      apiFetch(`/places/${placeId}`, {
        method: 'DELETE',
        token: getAccessToken(),
      }),
    onMutate: (id) => setDeletingId(id),
    onSuccess: () => {
      setError(null);
      void qc.invalidateQueries({ queryKey: ['places'] });
    },
    onError: (err) =>
      setError(err instanceof ApiError ? err.message : (err as Error).message),
    onSettled: () => setDeletingId(null),
  });

  const items = places.data ?? [];

  function openCreate() {
    setForm(emptyForm);
    setError(null);
    setCreating(true);
  }

  function openEdit(place: Place) {
    setEdit(place);
    setForm({
      name: place.name,
      code: place.code,
      description: place.description ?? '',
      capacity: place.capacity != null ? String(place.capacity) : '',
      location: place.location ?? '',
      latitude: place.latitude ?? null,
      longitude: place.longitude ?? null,
      mapAddress: place.mapAddress ?? '',
    });
    setError(null);
  }

  function confirmDelete(place: Place) {
    const ok = window.confirm(
      `Delete place "${place.name}"? Meetings that used it will keep their times but lose this place link.`,
    );
    if (!ok) return;
    remove.mutate(place.id);
  }

  const formFields = (
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
        <label className="mb-1.5 block text-sm font-medium">
          On-site label
        </label>
        <Input
          value={form.location}
          onChange={(e) => setForm({ ...form, location: e.target.value })}
          placeholder="Hall B · Booth 12"
        />
        <p className="mt-1 text-xs text-[var(--muted)]">
          Short label shown on site (hall, booth, table area).
        </p>
      </div>
      <LocationMapPicker
        value={{
          latitude: form.latitude,
          longitude: form.longitude,
          mapAddress: form.mapAddress,
        }}
        onChange={(next) =>
          setForm({
            ...form,
            latitude: next.latitude,
            longitude: next.longitude,
            mapAddress: next.mapAddress,
          })
        }
      />
      <div>
        <label className="mb-1.5 block text-sm font-medium">Capacity</label>
        <Input
          type="number"
          value={form.capacity}
          onChange={(e) => setForm({ ...form, capacity: e.target.value })}
        />
      </div>
      <div>
        <label className="mb-1.5 block text-sm font-medium">Description</label>
        <Input
          value={form.description}
          onChange={(e) => setForm({ ...form, description: e.target.value })}
        />
      </div>
      {error ? <p className="text-sm text-rose-700">{error}</p> : null}
    </div>
  );

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Match & meet"
        title="Places"
        description="Meeting tables and rooms. Pin each place on the map so guests can navigate there."
        actions={<Button onClick={openCreate}>Add place</Button>}
      />

      <Card>
        {error && !creating && !edit ? (
          <p className="mb-3 text-sm text-rose-700">{error}</p>
        ) : null}
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
                  <TD className="min-w-[12rem]">
                    <MeetingPlaceLink place={place} compact />
                  </TD>
                  <TD>{place.capacity ?? '—'}</TD>
                  <TD>
                    <Badge variant={place.isActive ? 'success' : 'secondary'}>
                      {place.isActive ? 'Active' : 'Inactive'}
                    </Badge>
                  </TD>
                  <TD className="space-x-2 text-right">
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => openEdit(place)}
                    >
                      Edit
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      loading={
                        toggle.isPending && toggle.variables?.id === place.id
                      }
                      onClick={() => toggle.mutate(place)}
                    >
                      {place.isActive ? 'Deactivate' : 'Activate'}
                    </Button>
                    <Button
                      size="sm"
                      variant="danger"
                      loading={deletingId === place.id}
                      onClick={() => confirmDelete(place)}
                    >
                      {deletingId === place.id ? 'Deleting…' : 'Delete'}
                    </Button>
                  </TD>
                </TR>
              ))}
            </TBody>
          </Table>
        )}
      </Card>

      <Modal
        open={creating}
        title="Add place"
        description="Places appear when a party proposes a time. Search or pin the map so people can navigate."
        size="lg"
        onClose={() => {
          setCreating(false);
          setError(null);
        }}
        footer={
          <>
            <Button
              variant="outline"
              onClick={() => {
                setCreating(false);
                setError(null);
              }}
            >
              Cancel
            </Button>
            <Button
              onClick={() => create.mutate()}
              loading={create.isPending}
              disabled={!form.name.trim()}
            >
              {create.isPending ? 'Saving…' : 'Save place'}
            </Button>
          </>
        }
      >
        {formFields}
      </Modal>

      <Modal
        open={Boolean(edit)}
        title="Edit place"
        description="Update table or room details and map pin used for on-site meetings."
        size="lg"
        onClose={() => {
          setEdit(null);
          setForm(emptyForm);
          setError(null);
        }}
        footer={
          <>
            <Button
              variant="outline"
              onClick={() => {
                setEdit(null);
                setForm(emptyForm);
                setError(null);
              }}
            >
              Cancel
            </Button>
            <Button
              onClick={() => update.mutate()}
              loading={update.isPending}
              disabled={!form.name.trim()}
            >
              {update.isPending ? 'Saving…' : 'Save changes'}
            </Button>
          </>
        }
      >
        {formFields}
      </Modal>
    </div>
  );
}
