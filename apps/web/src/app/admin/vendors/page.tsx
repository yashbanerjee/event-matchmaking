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
    vendor?: { approvalStatus: string; matchingEligible: boolean };
  }>;
};

export default function VendorsPage() {
  const qc = useQueryClient();
  const [form, setForm] = useState({
    code: '',
    name: '',
    industry: 'Manufacturing',
    capabilities: 'CNC,ISO9001',
    categories: 'manufacturing',
  });

  const { data } = useQuery({
    queryKey: ['vendors'],
    queryFn: () =>
      apiFetch<OrgList>('/organizations?type=VENDOR', {
        token: getAccessToken(),
      }),
  });

  const create = useMutation({
    mutationFn: () =>
      apiFetch('/organizations/vendors', {
        method: 'POST',
        token: getAccessToken(),
        body: JSON.stringify({
          code: form.code,
          name: form.name,
          industry: form.industry,
          capabilities: form.capabilities.split(',').map((s) => s.trim()),
          categories: form.categories.split(',').map((s) => s.trim()),
        }),
      }),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ['vendors'] }),
  });

  const approve = useMutation({
    mutationFn: (id: string) =>
      apiFetch(`/organizations/vendors/${id}/approve`, {
        method: 'POST',
        token: getAccessToken(),
      }),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ['vendors'] }),
  });

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Vendors</h1>
        <p className="text-sm text-[var(--muted)]">
          Onboard vendors, approve eligibility, and track status.
        </p>
      </div>
      <Card>
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
            placeholder="Capabilities (comma-separated)"
            value={form.capabilities}
            onChange={(e) => setForm({ ...form, capabilities: e.target.value })}
          />
        </div>
        <Button className="mt-3" onClick={() => create.mutate()}>
          Create vendor
        </Button>
      </Card>
      <Card>
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-[var(--muted)] border-b border-[var(--border)]">
              <th className="py-2">Code</th>
              <th>Name</th>
              <th>Approval</th>
              <th>Eligible</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {data?.items.map((org) => (
              <tr key={org.id} className="border-b border-[var(--border)]">
                <td className="py-2 font-mono text-xs">{org.code}</td>
                <td>{org.name}</td>
                <td>{org.vendor?.approvalStatus ?? org.status}</td>
                <td>{org.vendor?.matchingEligible ? 'Yes' : 'No'}</td>
                <td>
                  {org.vendor?.approvalStatus !== 'APPROVED' && (
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => approve.mutate(org.id)}
                    >
                      Approve
                    </Button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>
    </div>
  );
}
