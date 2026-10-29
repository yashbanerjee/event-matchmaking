'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { apiFetch } from '@/lib/api';
import { getAccessToken } from '@/lib/auth-store';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';

export default function InvitationsPage() {
  const qc = useQueryClient();
  const [form, setForm] = useState({
    email: '',
    organizationId: '',
    roleCode: 'VENDOR_USER',
  });
  const [createdToken, setCreatedToken] = useState<string | null>(null);

  const orgs = useQuery({
    queryKey: ['all-orgs'],
    queryFn: () =>
      apiFetch<{ items: Array<{ id: string; name: string; code: string }> }>(
        '/organizations?pageSize=100',
        { token: getAccessToken() },
      ),
  });

  const list = useQuery({
    queryKey: ['invitations'],
    queryFn: () =>
      apiFetch<{
        items: Array<{
          id: string;
          email: string;
          status: string;
          expiresAt: string;
          organization: { name: string };
          role: { code: string };
        }>;
      }>('/invitations', { token: getAccessToken() }),
  });

  const create = useMutation({
    mutationFn: () =>
      apiFetch<{ registrationToken?: string }>('/invitations', {
        method: 'POST',
        token: getAccessToken(),
        body: JSON.stringify(form),
      }),
    onSuccess: (res) => {
      setCreatedToken(res.registrationToken ?? null);
      void qc.invalidateQueries({ queryKey: ['invitations'] });
    },
  });

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Invitations</h1>
        <p className="text-sm text-[var(--muted)]">
          Invite users with hashed single-use tokens delivered via outbox/RabbitMQ.
        </p>
      </div>
      <Card className="space-y-3">
        <Input
          placeholder="Email"
          value={form.email}
          onChange={(e) => setForm({ ...form, email: e.target.value })}
        />
        <select
          className="h-10 w-full rounded-md border border-[var(--border)] bg-[var(--card)] px-3 text-sm"
          value={form.organizationId}
          onChange={(e) => setForm({ ...form, organizationId: e.target.value })}
        >
          <option value="">Select organization</option>
          {orgs.data?.items.map((o) => (
            <option key={o.id} value={o.id}>
              {o.code} — {o.name}
            </option>
          ))}
        </select>
        <select
          className="h-10 w-full rounded-md border border-[var(--border)] bg-[var(--card)] px-3 text-sm"
          value={form.roleCode}
          onChange={(e) => setForm({ ...form, roleCode: e.target.value })}
        >
          <option value="COMPANY_USER">Client user</option>
          <option value="VENDOR_USER">Guest user</option>
          <option value="ADMIN">Administrator</option>
          <option value="OPERATIONS_MANAGER">Operations manager</option>
        </select>
        <Button onClick={() => create.mutate()} disabled={!form.email || !form.organizationId}>
          Send invitation
        </Button>
        {createdToken && (
          <p className="text-xs break-all bg-slate-100 p-2 rounded">
            Dev registration token: {createdToken}
          </p>
        )}
      </Card>
      <Card>
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-[var(--muted)] border-b border-[var(--border)]">
              <th className="py-2">Email</th>
              <th>Org</th>
              <th>Role</th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody>
            {list.data?.items.map((inv) => (
              <tr key={inv.id} className="border-b border-[var(--border)]">
                <td className="py-2">{inv.email}</td>
                <td>{inv.organization.name}</td>
                <td>{inv.role.code}</td>
                <td>{inv.status}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>
    </div>
  );
}
