'use client';

import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Table, TBody, TD, TH, THead, TR } from '@/components/ui/table';
import { useAdminQuery } from '@/lib/admin-query';

export default function ProfilesPage() {
  const { data, isLoading, error } = useAdminQuery<{
    companies: Array<{
      organizationId: string;
      matchingEligible: boolean;
      profileVersion: number;
      requiredCapabilities: string[];
      organization: { code: string; name: string; industry: string | null };
    }>;
    vendors: Array<{
      organizationId: string;
      matchingEligible: boolean;
      profileVersion: number;
      capabilities: string[];
      approvalStatus: string;
      organization: { code: string; name: string; industry: string | null };
    }>;
  }>(['profiles'], '/profiles');

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Profiles & preferences</h1>
        <p className="text-sm text-[var(--muted)]">
          Normalized matchmaking profiles (separate from raw form responses).
        </p>
      </div>
      {error && <p className="text-red-700">{(error as Error).message}</p>}
      <Card>
        <h2 className="font-medium mb-3">Client</h2>
        {isLoading ? (
          <p>Loading…</p>
        ) : (
          <Table>
            <THead>
              <TR>
                <TH>Code</TH>
                <TH>Name</TH>
                <TH>Capabilities required</TH>
                <TH>Version</TH>
                <TH>Eligible</TH>
              </TR>
            </THead>
            <TBody>
              {data?.companies.map((c) => (
                <TR key={c.organizationId}>
                  <TD className="font-mono text-xs">{c.organization.code}</TD>
                  <TD>{c.organization.name}</TD>
                  <TD>{c.requiredCapabilities.join(', ') || '—'}</TD>
                  <TD>{c.profileVersion}</TD>
                  <TD>
                    <Badge variant={c.matchingEligible ? 'success' : 'warning'}>
                      {c.matchingEligible ? 'Yes' : 'No'}
                    </Badge>
                  </TD>
                </TR>
              ))}
            </TBody>
          </Table>
        )}
      </Card>
      <Card>
        <h2 className="font-medium mb-3">Guests</h2>
        <Table>
          <THead>
            <TR>
              <TH>Code</TH>
              <TH>Name</TH>
              <TH>Capabilities</TH>
              <TH>Approval</TH>
              <TH>Eligible</TH>
            </TR>
          </THead>
          <TBody>
            {data?.vendors.map((v) => (
              <TR key={v.organizationId}>
                <TD className="font-mono text-xs">{v.organization.code}</TD>
                <TD>{v.organization.name}</TD>
                <TD>{v.capabilities.join(', ') || '—'}</TD>
                <TD>{v.approvalStatus}</TD>
                <TD>
                  <Badge variant={v.matchingEligible ? 'success' : 'warning'}>
                    {v.matchingEligible ? 'Yes' : 'No'}
                  </Badge>
                </TD>
              </TR>
            ))}
          </TBody>
        </Table>
      </Card>
    </div>
  );
}
