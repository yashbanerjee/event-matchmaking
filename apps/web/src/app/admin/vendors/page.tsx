'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useMemo, useState } from 'react';
import { apiFetch } from '@/lib/api';
import { getAccessToken } from '@/lib/auth-store';
import { formatVendorStatus, statusTone } from '@/lib/status';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Pagination } from '@/components/ui/pagination';
import { PageHeader } from '@/components/page-header';
import { EmptyState } from '@/components/empty-state';
import { OrgRowActions } from '@/components/org-actions';
import { SubmissionReviewModal } from '@/components/submission-review-modal';
import { Modal } from '@/components/ui/modal';
import { Table, TBody, TD, TH, THead, TR } from '@/components/ui/table';

type OrgList = {
  items: Array<{
    id: string;
    code: string;
    name: string;
    status: string;
    workflowStatus?: string;
    contactEmail?: string | null;
    industry?: string | null;
    country?: string | null;
    region?: string | null;
    website?: string | null;
    address?: string | null;
    vendor?: {
      displayName?: string | null;
      approvalStatus: string;
      matchingEligible: boolean;
      categories?: string[];
      capabilities?: string[];
    };
    latestSubmission?: {
      id: string;
      status: string;
      submittedAt?: string | null;
    } | null;
  }>;
  total: number;
  page: number;
  pageSize: number;
};

type FormListItem = {
  id: string;
  code: string;
  name: string;
  targetType?: string | null;
  versions: Array<{ id: string; version: number; status: string }>;
};

const PAGE_SIZE = 10;

const COUNTRY_CODES = [
  { code: '+971', label: 'AE +971' },
  { code: '+91', label: 'IN +91' },
  { code: '+1', label: 'US/CA +1' },
  { code: '+44', label: 'UK +44' },
  { code: '+49', label: 'DE +49' },
  { code: '+33', label: 'FR +33' },
  { code: '+966', label: 'SA +966' },
  { code: '+974', label: 'QA +974' },
];

function parseCsv(text: string) {
  const lines = text
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);
  if (!lines.length) return [];
  const header = lines[0]!.toLowerCase().split(',').map((h) => h.trim());
  const nameIdx = header.findIndex((h) => h === 'name' || h === 'vendor');
  const emailIdx = header.findIndex((h) => h === 'email');
  const phoneIdx = header.findIndex((h) => h === 'phone');
  const codeIdx = header.findIndex((h) => h === 'code' || h === 'countrycode' || h === 'phone_country_code');
  const start = nameIdx >= 0 && emailIdx >= 0 ? 1 : 0;
  const rows = [];
  for (const line of lines.slice(start)) {
    const cols = line.split(',').map((c) => c.trim().replace(/^"|"$/g, ''));
    const name = nameIdx >= 0 ? cols[nameIdx] : cols[0];
    const email = emailIdx >= 0 ? cols[emailIdx] : cols[1];
    const phone = phoneIdx >= 0 ? cols[phoneIdx] : cols[2];
    const phoneCountryCode = codeIdx >= 0 ? cols[codeIdx] : cols[3];
    if (!name || !email) continue;
    rows.push({
      name,
      email,
      phone: phone || undefined,
      phoneCountryCode: phoneCountryCode || undefined,
    });
  }
  return rows;
}

export default function VendorsPage() {
  const qc = useQueryClient();
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [addOpen, setAddOpen] = useState(false);
  const [csvOpen, setCsvOpen] = useState(false);
  const [csvResult, setCsvResult] = useState<string | null>(null);
  const [formReview, setFormReview] = useState<{
    id: string;
    name: string;
    submissionId?: string | null;
  } | null>(null);
  const [form, setForm] = useState({
    name: '',
    email: '',
    phone: '',
    phoneCountryCode: '+971',
    formId: '',
    formVersionId: '',
  });
  const [csvText, setCsvText] = useState(
    'name,email,phone,phoneCountryCode\nAcme Supplies,vendor@example.com,501234567,+971',
  );

  const queryKey = ['vendors', page] as const;

  const { data, isLoading, error } = useQuery({
    queryKey,
    queryFn: () =>
      apiFetch<OrgList>(
        `/organizations?type=VENDOR&page=${page}&pageSize=${PAGE_SIZE}`,
        { token: getAccessToken() },
      ),
    retry: 1,
  });

  const forms = useQuery({
    queryKey: ['forms-for-vendor-invite'],
    enabled: addOpen || csvOpen,
    queryFn: () =>
      apiFetch<FormListItem[]>('/forms', { token: getAccessToken() }),
  });

  const publishedForms = useMemo(() => {
    return (forms.data ?? [])
      .map((f) => {
        const published = f.versions.find((v) => v.status === 'PUBLISHED');
        return published
          ? {
              id: f.id,
              name: f.name,
              code: f.code,
              formVersionId: published.id,
              version: published.version,
            }
          : null;
      })
      .filter(Boolean) as Array<{
      id: string;
      name: string;
      code: string;
      formVersionId: string;
      version: number;
    }>;
  }, [forms.data]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q || !data?.items) return data?.items ?? [];
    return data.items.filter(
      (org) =>
        org.name.toLowerCase().includes(q) ||
        org.code.toLowerCase().includes(q) ||
        (org.contactEmail ?? '').toLowerCase().includes(q),
    );
  }, [data?.items, search]);

  const invite = useMutation({
    mutationFn: () =>
      apiFetch<{
        inviteUrl: string;
        organization: { id: string; name: string };
      }>('/organizations/vendors/invite', {
        method: 'POST',
        token: getAccessToken(),
        body: JSON.stringify({
          name: form.name,
          email: form.email,
          phone: form.phone || undefined,
          phoneCountryCode: form.phone ? form.phoneCountryCode : undefined,
          formId: form.formId || undefined,
          formVersionId: form.formVersionId || undefined,
        }),
      }),
    onSuccess: () => {
      setAddOpen(false);
      setForm({
        name: '',
        email: '',
        phone: '',
        phoneCountryCode: '+971',
        formId: '',
        formVersionId: '',
      });
      void qc.invalidateQueries({ queryKey: ['vendors'] });
    },
  });

  const importCsv = useMutation({
    mutationFn: () => {
      const rows = parseCsv(csvText).map((row) => ({
        ...row,
        formId: form.formId || undefined,
        formVersionId: form.formVersionId || undefined,
      }));
      return apiFetch<{
        total: number;
        succeeded: number;
        failed: number;
        results: Array<{ email: string; ok: boolean; error?: string }>;
      }>('/organizations/vendors/import-csv', {
        method: 'POST',
        token: getAccessToken(),
        body: JSON.stringify({ rows }),
      });
    },
    onSuccess: (res) => {
      setCsvResult(
        `Imported ${res.succeeded}/${res.total}. Failed: ${res.failed}.`,
      );
      void qc.invalidateQueries({ queryKey: ['vendors'] });
    },
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
      <PageHeader
        eyebrow="Organizations"
        title="Vendors"
        description="Invite vendors by email with an optional onboarding form link."
        actions={
          <>
            <Button variant="outline" onClick={() => setCsvOpen(true)}>
              CSV Import
            </Button>
            <Button
              onClick={() => {
                invite.reset();
                setForm({
                  name: '',
                  email: '',
                  phone: '',
                  phoneCountryCode: '+971',
                  formId: '',
                  formVersionId: '',
                });
                setAddOpen(true);
              }}
            >
              Add
            </Button>
          </>
        }
      />

      <Card>
        <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <h2 className="text-lg font-semibold">Directory</h2>
          <Input
            className="max-w-xs"
            placeholder="Search vendors…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>

        {isLoading && <p className="text-[var(--muted)]">Loading…</p>}
        {error && (
          <p className="text-rose-700">
            {(error as Error).message}
            {(error as { status?: number }).status === 401
              ? ' — your session expired. Sign in again.'
              : ''}
          </p>
        )}

        {!isLoading && !error && filtered.length === 0 ? (
          <EmptyState
            title="No vendors yet"
            description="Use Add to invite a vendor by email, or import a CSV."
          />
        ) : null}

        {!isLoading && !error && filtered.length > 0 ? (
          <>
            <Table>
              <THead>
                <TR>
                  <TH>Code</TH>
                  <TH>Name</TH>
                  <TH>Email</TH>
                  <TH>Status</TH>
                  <TH>Eligible</TH>
                  <TH className="text-right">Actions</TH>
                </TR>
              </THead>
              <TBody>
                {filtered.map((org) => {
                  const status =
                    org.workflowStatus ??
                    org.vendor?.approvalStatus ??
                    org.status;
                  const canReview = Boolean(org.latestSubmission?.id);
                  const verified =
                    status === 'VERIFIED' || status === 'APPROVED';
                  return (
                  <TR key={org.id}>
                    <TD className="font-mono text-xs">{org.code}</TD>
                    <TD className="font-medium">{org.name}</TD>
                    <TD className="text-[var(--muted)]">
                      {org.contactEmail ?? '—'}
                    </TD>
                    <TD>
                      <Badge variant={statusTone(status)}>
                        {formatVendorStatus(status)}
                      </Badge>
                    </TD>
                    <TD>
                      <Badge
                        variant={
                          org.vendor?.matchingEligible ? 'success' : 'secondary'
                        }
                      >
                        {org.vendor?.matchingEligible ? 'Yes' : 'No'}
                      </Badge>
                    </TD>
                    <TD className="text-right">
                      <div className="inline-flex flex-nowrap items-center justify-end gap-1">
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() =>
                            setFormReview({
                              id: org.id,
                              name: org.name,
                              submissionId: org.latestSubmission?.id ?? null,
                            })
                          }
                        >
                          {canReview
                            ? 'View form'
                            : 'Form status'}
                        </Button>
                        {!verified && (
                          <Button
                            size="sm"
                            variant="secondary"
                            onClick={() => approve.mutate(org.id)}
                          >
                            Verify
                          </Button>
                        )}
                        <OrgRowActions
                          org={org}
                          kind="vendor"
                          queryKey={[...queryKey]}
                        />
                      </div>
                    </TD>
                  </TR>
                  );
                })}
              </TBody>
            </Table>
            <Pagination
              page={data?.page ?? page}
              pageSize={data?.pageSize ?? PAGE_SIZE}
              total={data?.total ?? filtered.length}
              onPageChange={setPage}
            />
          </>
        ) : null}
      </Card>

      <Modal
        open={addOpen}
        title="Invite vendor"
        description="Send an email with a registration link. Optionally attach a form for profile details."
        onClose={() => setAddOpen(false)}
        wide
        footer={
          <>
            <Button variant="outline" onClick={() => setAddOpen(false)}>
              Close
            </Button>
            <Button
              onClick={() => invite.mutate()}
              disabled={
                invite.isPending || !form.name.trim() || !form.email.trim()
              }
            >
              {invite.isPending ? 'Sending…' : 'Add & send email'}
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          <div>
            <label className="mb-1.5 block text-sm font-medium">
              Select form link
            </label>
            <select
              className="h-10 w-full rounded-xl border border-[var(--border)] bg-white px-3 text-sm"
              value={
                form.formId
                  ? `${form.formId}::${form.formVersionId}`
                  : ''
              }
              onChange={(e) => {
                const value = e.target.value;
                if (!value) {
                  setForm({ ...form, formId: '', formVersionId: '' });
                  return;
                }
                const [formId, formVersionId] = value.split('::');
                setForm({
                  ...form,
                  formId: formId ?? '',
                  formVersionId: formVersionId ?? '',
                });
              }}
            >
              <option value="">No form (invite only)</option>
              {publishedForms.map((f) => (
                <option key={f.id} value={`${f.id}::${f.formVersionId}`}>
                  {f.name} (v{f.version})
                </option>
              ))}
            </select>
            {forms.isLoading && (
              <p className="mt-1 text-xs text-[var(--muted)]">Loading forms…</p>
            )}
          </div>

          <div>
            <label className="mb-1.5 block text-sm font-medium">Vendor name</label>
            <Input
              placeholder="Vendor company name"
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
            />
          </div>

          <div>
            <label className="mb-1.5 block text-sm font-medium">Email</label>
            <Input
              type="email"
              placeholder="vendor@company.com"
              value={form.email}
              onChange={(e) => setForm({ ...form, email: e.target.value })}
            />
          </div>

          <div>
            <label className="mb-1.5 block text-sm font-medium">
              Phone number (optional)
            </label>
            <div className="grid grid-cols-[140px_1fr] gap-2">
              <select
                className="h-10 rounded-xl border border-[var(--border)] bg-white px-2 text-sm"
                value={form.phoneCountryCode}
                onChange={(e) =>
                  setForm({ ...form, phoneCountryCode: e.target.value })
                }
              >
                {COUNTRY_CODES.map((c) => (
                  <option key={c.code} value={c.code}>
                    {c.label}
                  </option>
                ))}
              </select>
              <Input
                placeholder="501234567"
                value={form.phone}
                onChange={(e) => setForm({ ...form, phone: e.target.value })}
              />
            </div>
          </div>

          {invite.error && (
            <p className="rounded-xl bg-rose-50 px-3 py-2 text-sm text-rose-700">
              {(invite.error as Error).message}
            </p>
          )}
        </div>
      </Modal>

      <Modal
        open={csvOpen}
        title="CSV import"
        description="Columns: name, email, phone (optional), phoneCountryCode (optional)."
        onClose={() => setCsvOpen(false)}
        wide
        footer={
          <>
            <Button variant="outline" onClick={() => setCsvOpen(false)}>
              Close
            </Button>
            <Button
              onClick={() => importCsv.mutate()}
              disabled={importCsv.isPending || !csvText.trim()}
            >
              {importCsv.isPending ? 'Importing…' : 'Import & invite'}
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          <div>
            <label className="mb-1.5 block text-sm font-medium">
              Optional form for all rows
            </label>
            <select
              className="h-10 w-full rounded-xl border border-[var(--border)] bg-white px-3 text-sm"
              value={
                form.formId ? `${form.formId}::${form.formVersionId}` : ''
              }
              onChange={(e) => {
                const value = e.target.value;
                if (!value) {
                  setForm({ ...form, formId: '', formVersionId: '' });
                  return;
                }
                const [formId, formVersionId] = value.split('::');
                setForm({
                  ...form,
                  formId: formId ?? '',
                  formVersionId: formVersionId ?? '',
                });
              }}
            >
              <option value="">No form</option>
              {publishedForms.map((f) => (
                <option key={f.id} value={`${f.id}::${f.formVersionId}`}>
                  {f.name} (v{f.version})
                </option>
              ))}
            </select>
          </div>
          <textarea
            className="min-h-48 w-full rounded-xl border border-[var(--border)] bg-white p-3 font-mono text-xs"
            value={csvText}
            onChange={(e) => setCsvText(e.target.value)}
          />
          {importCsv.error && (
            <p className="text-sm text-rose-700">
              {(importCsv.error as Error).message}
            </p>
          )}
          {csvResult && (
            <p className="rounded-xl bg-emerald-50 px-3 py-2 text-sm text-emerald-900">
              {csvResult}
            </p>
          )}
        </div>
      </Modal>

      <SubmissionReviewModal
        open={Boolean(formReview)}
        onClose={() => setFormReview(null)}
        organizationId={formReview?.id ?? ''}
        organizationName={formReview?.name ?? ''}
        kind="vendor"
        submissionId={formReview?.submissionId}
        listQueryKey={[...queryKey]}
      />
    </div>
  );
}
