'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { apiFetch } from '@/lib/api';
import { getAccessToken } from '@/lib/auth-store';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';

export default function FormsPage() {
  const qc = useQueryClient();
  const [code, setCode] = useState('vendor-manufacturing');
  const [name, setName] = useState('Manufacturing vendor onboarding');

  const forms = useQuery({
    queryKey: ['forms'],
    queryFn: () =>
      apiFetch<
        Array<{
          id: string;
          code: string;
          name: string;
          versions: Array<{ id: string; version: number; status: string }>;
        }>
      >('/forms', { token: getAccessToken() }),
  });

  const create = useMutation({
    mutationFn: () =>
      apiFetch('/forms', {
        method: 'POST',
        token: getAccessToken(),
        body: JSON.stringify({
          code,
          name,
          targetType: 'VENDOR',
          fields: [
            {
              fieldKey: 'capabilities',
              label: 'Capabilities',
              fieldType: 'TAGS',
              required: true,
              displayOrder: 0,
            },
            {
              fieldKey: 'categories',
              label: 'Categories',
              fieldType: 'MULTI_SELECT',
              required: true,
              displayOrder: 1,
              options: ['manufacturing', 'logistics', 'strategic'],
            },
            {
              fieldKey: 'operatingRegions',
              label: 'Operating regions',
              fieldType: 'TAGS',
              required: true,
              displayOrder: 2,
            },
            {
              fieldKey: 'commercialTags',
              label: 'Commercial preferences',
              fieldType: 'TAGS',
              required: false,
              displayOrder: 3,
            },
          ],
        }),
      }),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ['forms'] }),
  });

  const publish = useMutation({
    mutationFn: (id: string) =>
      apiFetch(`/forms/${id}/publish`, {
        method: 'POST',
        token: getAccessToken(),
      }),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ['forms'] }),
  });

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Form builder</h1>
        <p className="text-sm text-[var(--muted)]">
          Published form versions are immutable. Assign different forms per vendor type.
        </p>
      </div>
      <Card className="space-y-3">
        <Input value={code} onChange={(e) => setCode(e.target.value)} placeholder="Code" />
        <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Name" />
        <Button onClick={() => create.mutate()}>Create manufacturing template</Button>
      </Card>
      <Card>
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-[var(--muted)] border-b border-[var(--border)]">
              <th className="py-2">Code</th>
              <th>Name</th>
              <th>Latest version</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {forms.data?.map((form) => {
              const latest = form.versions[0];
              return (
                <tr key={form.id} className="border-b border-[var(--border)]">
                  <td className="py-2 font-mono text-xs">{form.code}</td>
                  <td>{form.name}</td>
                  <td>
                    v{latest?.version} ({latest?.status})
                  </td>
                  <td>
                    {latest?.status === 'DRAFT' && (
                      <Button size="sm" variant="outline" onClick={() => publish.mutate(form.id)}>
                        Publish
                      </Button>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </Card>
    </div>
  );
}
