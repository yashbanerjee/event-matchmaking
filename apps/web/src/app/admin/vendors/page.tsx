'use client';

import {
  keepPreviousData,
  useMutation,
  useQuery,
  useQueryClient,
} from '@tanstack/react-query';
import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
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
import { Modal } from '@/components/ui/modal';
import { Select } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { Table, TBody, TD, TH, THead, TR } from '@/components/ui/table';
import {
  formatDayMeetingRatio,
  type MeetingStats,
} from '@/lib/org-directory';
import { formatEventDate } from '@/lib/event-schedule';

type OrgList = {
  items: Array<{
    id: string;
    code: string;
    name: string;
    status: string;
    workflowStatus?: string;
    contactEmail?: string | null;
    logoUrl?: string | null;
    industry?: string | null;
    country?: string | null;
    region?: string | null;
    website?: string | null;
    address?: string | null;
    vendor?: {
      displayName?: string | null;
      approvalStatus: string;
      matchingEligible: boolean;
      featured?: boolean;
      categories?: string[];
      capabilities?: string[];
    };
    latestSubmission?: {
      id: string;
      status: string;
      submittedAt?: string | null;
    } | null;
    meetingStats?: MeetingStats;
  }>;
  eventDates?: string[];
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
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [dateSort, setDateSort] = useState<'createdAt_desc' | 'createdAt_asc'>(
    'createdAt_desc',
  );
  const [addOpen, setAddOpen] = useState(false);
  const [csvOpen, setCsvOpen] = useState(false);
  const [csvResult, setCsvResult] = useState<string | null>(null);
  const [form, setForm] = useState({
    name: '',
    email: '',
    phone: '',
    phoneCountryCode: '+971',
    formId: '',
    formVersionId: '',
  });
  const [csvText, setCsvText] = useState(
    'name,email,phone,phoneCountryCode\n',
  );

  useEffect(() => {
    const handle = window.setTimeout(() => {
      setDebouncedSearch(search.trim());
    }, 250);
    return () => window.clearTimeout(handle);
  }, [search]);

  useEffect(() => {
    setPage(1);
  }, [debouncedSearch, dateSort]);

  const queryKey = ['vendors', page, debouncedSearch, dateSort] as const;

  const { data, isLoading, isFetching, error } = useQuery({
    queryKey,
    queryFn: () => {
      const params = new URLSearchParams({
        type: 'VENDOR',
        page: String(page),
        pageSize: String(PAGE_SIZE),
        sort: dateSort,
      });
      if (debouncedSearch) params.set('q', debouncedSearch);
      return apiFetch<OrgList>(`/organizations?${params}`, {
        token: getAccessToken(),
      });
    },
    placeholderData: keepPreviousData,
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
              targetType: f.targetType ?? null,
              formVersionId: published.id,
              version: published.version,
            }
          : null;
      })
      .filter(Boolean) as Array<{
      id: string;
      name: string;
      code: string;
      targetType: string | null;
      formVersionId: string;
      version: number;
    }>;
  }, [forms.data]);

  const innovatorForms = useMemo(() => {
    const preferred = publishedForms.filter(
      (f) =>
        f.targetType === 'VENDOR' ||
        f.code.toUpperCase().includes('INNOVATOR'),
    );
    return preferred.length > 0 ? preferred : publishedForms;
  }, [publishedForms]);

  const items = data?.items ?? [];
  const eventDates = data?.eventDates ?? [];

  useEffect(() => {
    if ((!addOpen && !csvOpen) || form.formId || innovatorForms.length === 0) {
      return;
    }
    const preferred =
      innovatorForms.find((f) =>
        f.code.toUpperCase().includes('INNOVATOR'),
      ) ?? innovatorForms[0];
    if (!preferred) return;
    setForm((prev) => ({
      ...prev,
      formId: preferred.id,
      formVersionId: preferred.formVersionId,
    }));
  }, [addOpen, csvOpen, form.formId, innovatorForms]);

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
          formId: form.formId,
          formVersionId: form.formVersionId,
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
        title="Innovators"
        description="Invite innovators by email and choose which onboarding form they complete."
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
          <div className="flex w-full flex-col gap-2 sm:w-auto sm:flex-row sm:items-center">
            <Select
              className="sm:w-52"
              value={dateSort}
              onChange={(e) =>
                setDateSort(
                  e.target.value === 'createdAt_asc'
                    ? 'createdAt_asc'
                    : 'createdAt_desc',
                )
              }
              aria-label="Sort by date"
            >
              <option value="createdAt_desc">Date: high to low</option>
              <option value="createdAt_asc">Date: low to high</option>
            </Select>
            <Input
              className="max-w-xs"
              placeholder="Search name or email…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
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

        {!isLoading && !error && items.length === 0 ? (
          <EmptyState
            title={debouncedSearch ? 'No matching innovators' : 'No innovators yet'}
            description={
              debouncedSearch
                ? 'Try another name or email.'
                : 'Use Add to invite an innovator by email, or import a CSV.'
            }
          />
        ) : null}

        {!isLoading && !error && items.length > 0 ? (
          <>
            <Table
              className={
                isFetching ? 'opacity-70 transition-opacity' : undefined
              }
            >
              <THead>
                <TR>
                  <TH>Name</TH>
                  <TH>Status</TH>
                  {eventDates.map((date) => (
                    <TH key={date} className="whitespace-nowrap text-center">
                      <span className="block">{formatEventDate(date, 'chip')}</span>
                      <span className="mt-0.5 block text-[10px] font-medium normal-case tracking-normal text-[#626F86]">
                        approved / total
                      </span>
                    </TH>
                  ))}
                  <TH className="w-12 text-right"> </TH>
                </TR>
              </THead>
              <TBody>
                {items.map((org) => {
                  const status =
                    org.workflowStatus ??
                    org.vendor?.approvalStatus ??
                    org.status;
                  const stats = org.meetingStats;
                  return (
                  <TR key={org.id}>
                    <TD className="whitespace-normal">
                      <div className="flex min-w-[16rem] items-start gap-2.5">
                        {org.logoUrl ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img
                            src={org.logoUrl}
                            alt=""
                            className="mt-0.5 h-8 w-8 rounded-md object-cover"
                          />
                        ) : null}
                        <div>
                          <div className="flex flex-wrap items-center gap-2">
                            <Link
                              href={`/admin/vendors/${org.id}`}
                              className="font-semibold text-[#172B4D] hover:text-[var(--accent)] hover:underline"
                            >
                              {org.name}
                            </Link>
                            {org.vendor?.featured ? (
                              <Badge variant="accent">Featured</Badge>
                            ) : null}
                          </div>
                          <p className="text-xs text-[#626F86]">
                            {org.contactEmail ?? 'No email'} · {org.code}
                          </p>
                          <p className="text-xs text-[#626F86]">
                            Matching:{' '}
                            {org.vendor?.matchingEligible
                              ? 'Eligible'
                              : 'Not eligible'}
                          </p>
                        </div>
                      </div>
                    </TD>
                    <TD>
                      <Badge variant={statusTone(status)}>
                        {formatVendorStatus(status)}
                      </Badge>
                    </TD>
                    {eventDates.map((date) => (
                      <TD
                        key={`${org.id}-${date}`}
                        className="text-center tabular-nums font-medium"
                      >
                        {formatDayMeetingRatio(stats, date)}
                      </TD>
                    ))}
                    <TD className="text-right">
                      <OrgRowActions
                        org={org}
                        kind="vendor"
                        queryKey={[...queryKey]}
                        verifying={
                          approve.isPending && approve.variables === org.id
                        }
                        onVerify={() => approve.mutate(org.id)}
                      />
                    </TD>
                  </TR>
                  );
                })}
              </TBody>
            </Table>
            <Pagination
              page={data?.page ?? page}
              pageSize={data?.pageSize ?? PAGE_SIZE}
              total={data?.total ?? items.length}
              onPageChange={setPage}
            />
          </>
        ) : null}
      </Card>

      <Modal
        open={addOpen}
        title="Invite innovator"
        description="Send an email with a registration link and the selected onboarding form."
        onClose={() => setAddOpen(false)}
        wide
        footer={
          <>
            <Button variant="outline" onClick={() => setAddOpen(false)}>
              Close
            </Button>
            <Button
              onClick={() => invite.mutate()}
              loading={invite.isPending}
              disabled={
                !form.name.trim() ||
                !form.email.trim() ||
                !form.formId ||
                !form.formVersionId
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
              Select form (required)
            </label>
            <Select
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
              <option value="">Select form</option>
              {innovatorForms.map((f) => (
                <option key={f.id} value={`${f.id}::${f.formVersionId}`}>
                  {f.name} (v{f.version})
                </option>
              ))}
            </Select>
            {forms.isLoading ? (
              <p className="mt-1 text-xs text-[var(--muted)]">Loading forms…</p>
            ) : (
              <p className="mt-1 text-xs text-[var(--muted)]">
                Invitation link opens this form after the innovator creates an
                account.
              </p>
            )}
          </div>

          <div>
            <label className="mb-1.5 block text-sm font-medium">Innovator name</label>
            <Input
              placeholder="Innovator organization name"
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
              <Select
                className="px-2.5"
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
              </Select>
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
              loading={importCsv.isPending}
              disabled={
                !csvText.trim() || !form.formId || !form.formVersionId
              }
            >
              {importCsv.isPending ? 'Importing…' : 'Import & invite'}
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          <div>
            <label className="mb-1.5 block text-sm font-medium">
              Select form for all rows (required)
            </label>
            <Select
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
              <option value="">Select form</option>
              {innovatorForms.map((f) => (
                <option key={f.id} value={`${f.id}::${f.formVersionId}`}>
                  {f.name} (v{f.version})
                </option>
              ))}
            </Select>
          </div>
          <Textarea
            className="min-h-48 font-mono text-xs"
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

    </div>
  );
}
