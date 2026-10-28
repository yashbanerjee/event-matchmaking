'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { apiFetch } from '@/lib/api';
import { getAccessToken } from '@/lib/auth-store';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';

type OrgList = {
  items: Array<{
    id: string;
    code: string;
    name: string;
    status: string;
    industry: string | null;
  }>;
  total: number;
};

export default function CompaniesPage() {
  const qc = useQueryClient();
  const [form, setForm] = useState({
    code: '',
    name: '',
    industry: 'Manufacturing',
    country: 'DE',
    region: 'EU',
  });

  const { data, isLoading, error } = useQuery({
    queryKey: ['companies'],
    queryFn: () =>
      apiFetch<OrgList>('/organizations?type=COMPANY', {
        token: getAccessToken(),
      }),
  });

  const create = useMutation({
    mutationFn: () =>
      apiFetch('/organizations/companies', {
        method: 'POST',
        token: getAccessToken(),
        body: JSON.stringify(form),
      }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['companies'] });
      setForm({
        code: '',
        name: '',
        industry: 'Manufacturing',
        country: 'DE',
        region: 'EU',
      });
    },
  });

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Companies</h1>
        <p className="text-sm text-[var(--muted)]">
          Create and manage company organizations.
        </p>
      </div>

      <Card>
        <h2 className="font-medium mb-3">Create company</h2>
        <div className="grid gap-3 md:grid-cols-3">
          <Input
            placeholder="Code"
            value={form.code}
            onChange={(e) => setForm({ ...form, code: e.target.value })}
          />
          <Input
            placeholder="Name"
            value={form.name}
            onChange={(e) => setForm({ ...form, name: e.target.value })}
          />
          <Input
            placeholder="Industry"
            value={form.industry}
            onChange={(e) => setForm({ ...form, industry: e.target.value })}
          />
        </div>
        <Button
          className="mt-3"
          onClick={() => create.mutate()}
          disabled={create.isPending || !form.code || !form.name}
        >
          Create
        </Button>
        {create.error && (
          <p className="text-sm text-red-700 mt-2">
            {(create.error as Error).message}
          </p>
        )}
      </Card>

      <Card>
        {isLoading && <p>Loading…</p>}
        {error && <p className="text-red-700">{(error as Error).message}</p>}
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-[var(--muted)] border-b border-[var(--border)]">
              <th className="py-2">Code</th>
              <th>Name</th>
              <th>Industry</th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody>
            {data?.items.map((org) => (
              <tr key={org.id} className="border-b border-[var(--border)]">
                <td className="py-2 font-mono text-xs">{org.code}</td>
                <td>{org.name}</td>
                <td>{org.industry ?? '—'}</td>
                <td>{org.status}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>
    </div>
  );
}
