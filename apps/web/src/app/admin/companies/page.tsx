'use client';

import {
  keepPreviousData,
  useMutation,
  useQuery,
  useQueryClient,
} from '@tanstack/react-query';
import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import type { FormSchemaDefinition } from '@em/shared';
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
import { FormRenderer } from '@/components/form-renderer';
import { Modal } from '@/components/ui/modal';
import { Select } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { Table, TBody, TD, TH, THead, TR } from '@/components/ui/table';
import {
  formatDayMeetingRatio,
  formatTableWindow,
  type MeetingStats,
  type TableAssignment,
} from '@/lib/org-directory';
import { formatEventDate } from '@/lib/event-schedule';
import { formatNearDate } from '@/lib/utils';

type OrgList = {
  items: Array<{
    id: string;
    code: string;
    name: string;
    status: string;
    createdAt?: string;
    workflowStatus?: string;
    contactEmail?: string | null;
    logoUrl?: string | null;
    industry: string | null;
    country?: string | null;
    region?: string | null;
    website?: string | null;
    address?: string | null;
    company?: { approvalStatus?: string; featured?: boolean } | null;
    latestSubmission?: {
      id: string;
      status: string;
      submittedAt?: string | null;
    } | null;
    tableAssignment?: TableAssignment | null;
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

const DEFAULT_PAGE_SIZE = 10;

const COUNTRY_CODES = [
  { code: '+971', label: 'AE +971' },
  { code: '+91', label: 'IN +91' },
  { code: '+1', label: 'US/CA +1' },
  { code: '+44', label: 'UK +44' },
  { code: '+49', label: 'DE +49' },
];

function parseCsv(text: string) {
  const lines = text
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);
  if (!lines.length) return [];
  const header = lines[0]!.toLowerCase().split(',').map((h) => h.trim());
  const nameIdx = header.findIndex((h) => h === 'name' || h === 'company');
  const emailIdx = header.findIndex((h) => h === 'email');
  const phoneIdx = header.findIndex((h) => h === 'phone');
  const codeIdx = header.findIndex(
    (h) => h === 'code' || h === 'countrycode' || h === 'phone_country_code',
  );
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

export default function CompaniesPage() {
  const qc = useQueryClient();
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(DEFAULT_PAGE_SIZE);
  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [dateSort, setDateSort] = useState<'createdAt_desc' | 'createdAt_asc'>(
    'createdAt_desc',
  );
  const [addOpen, setAddOpen] = useState(false);
  const [csvOpen, setCsvOpen] = useState(false);
  const [csvText, setCsvText] = useState(
    'name,email,phone,phoneCountryCode\n',
  );
  const [csvResult, setCsvResult] = useState<string | null>(null);
  const [form, setForm] = useState({
    name: '',
    email: '',
    phone: '',
    phoneCountryCode: '+971',
    industry: 'Manufacturing',
    formId: '',
    formVersionId: '',
    sendInvitation: true as boolean,
  });
  const [adminFill, setAdminFill] = useState<{
    organizationId: string;
    formVersionId: string;
    formName: string;
    schema: FormSchemaDefinition;
  } | null>(null);
  const [adminValues, setAdminValues] = useState<Record<string, unknown>>({});

  useEffect(() => {
    const handle = window.setTimeout(() => {
      setDebouncedSearch(search.trim());
    }, 250);
    return () => window.clearTimeout(handle);
  }, [search]);

  useEffect(() => {
    setPage(1);
  }, [debouncedSearch, dateSort, pageSize]);

  const queryKey = ['companies', page, pageSize, debouncedSearch, dateSort] as const;

  const { data, isLoading, isFetching, error } = useQuery({
    queryKey,
    queryFn: () => {
      const params = new URLSearchParams({
        type: 'COMPANY',
        page: String(page),
        pageSize: String(pageSize),
        sort: dateSort,
      });
      if (debouncedSearch) params.set('q', debouncedSearch);
      return apiFetch<OrgList>(`/organizations?${params}`, {
        token: getAccessToken(),
      });
    },
    placeholderData: keepPreviousData,
  });

  const forms = useQuery({
    queryKey: ['forms-for-company-invite'],
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
              code: f.code,
              name: f.name,
              targetType: f.targetType ?? null,
              formVersionId: published.id,
              version: published.version,
            }
          : null;
      })
      .filter(Boolean) as Array<{
      id: string;
      code: string;
      name: string;
      targetType: string | null;
      formVersionId: string;
      version: number;
    }>;
  }, [forms.data]);

  const investorForms = useMemo(() => {
    const preferred = publishedForms.filter(
      (f) =>
        f.targetType === 'COMPANY' ||
        f.code.toUpperCase().includes('INVESTOR'),
    );
    return preferred.length > 0 ? preferred : publishedForms;
  }, [publishedForms]);

  const items = data?.items ?? [];
  const eventDates = data?.eventDates ?? [];

  const resetAddForm = (preset?: {
    formId?: string;
    formVersionId?: string;
  }) => {
    setForm({
      name: '',
      email: '',
      phone: '',
      phoneCountryCode: '+971',
      industry: 'Manufacturing',
      formId: preset?.formId ?? '',
      formVersionId: preset?.formVersionId ?? '',
      sendInvitation: true,
    });
  };

  useEffect(() => {
    if ((!addOpen && !csvOpen) || form.formId || investorForms.length === 0) {
      return;
    }
    const preferred =
      investorForms.find((f) =>
        f.code.toUpperCase().includes('INVESTOR'),
      ) ?? investorForms[0];
    if (!preferred) return;
    setForm((prev) => ({
      ...prev,
      formId: preferred.id,
      formVersionId: preferred.formVersionId,
    }));
  }, [addOpen, csvOpen, form.formId, investorForms]);

  const invite = useMutation({
    mutationFn: () =>
      apiFetch<{ inviteUrl: string }>('/organizations/companies/invite', {
        method: 'POST',
        token: getAccessToken(),
        body: JSON.stringify({
          name: form.name.trim(),
          email: form.email.trim(),
          phone: form.phone.trim() || undefined,
          phoneCountryCode: form.phone.trim()
            ? form.phoneCountryCode
            : undefined,
          industry: form.industry.trim() || undefined,
          formId: form.formId || undefined,
          formVersionId: form.formVersionId || undefined,
        }),
      }),
    onSuccess: () => {
      setAddOpen(false);
      resetAddForm();
      void qc.invalidateQueries({ queryKey: ['companies'] });
    },
  });

  const startAdminFill = useMutation({
    mutationFn: () =>
      apiFetch<{
        organization: { id: string; name: string };
        formVersionId: string;
        formName: string;
        schema: FormSchemaDefinition;
      }>('/organizations/companies/admin-fill', {
        method: 'POST',
        token: getAccessToken(),
        body: JSON.stringify({
          name: form.name.trim(),
          email: form.email.trim(),
          phone: form.phone.trim() || undefined,
          phoneCountryCode: form.phone.trim()
            ? form.phoneCountryCode
            : undefined,
          industry: form.industry.trim() || undefined,
          formId: form.formId,
          formVersionId: form.formVersionId,
        }),
      }),
    onSuccess: (res) => {
      setAddOpen(false);
      setAdminFill({
        organizationId: res.organization.id,
        formVersionId: res.formVersionId,
        formName: res.formName,
        schema: res.schema,
      });
      setAdminValues({});
      resetAddForm();
      void qc.invalidateQueries({ queryKey: ['companies'] });
    },
  });

  const completeAdminFill = useMutation({
    mutationFn: () => {
      if (!adminFill) throw new Error('Missing company draft');
      const keyed: Record<string, unknown> = { ...adminValues };
      for (const field of adminFill.schema.fields) {
        if (adminValues[field.id] !== undefined) {
          keyed[field.key] = adminValues[field.id];
        }
      }
      return apiFetch(
        `/organizations/companies/${adminFill.organizationId}/admin-fill`,
        {
          method: 'POST',
          token: getAccessToken(),
          body: JSON.stringify({
            formVersionId: adminFill.formVersionId,
            responses: keyed,
          }),
        },
      );
    },
    onSuccess: () => {
      setAdminFill(null);
      setAdminValues({});
      void qc.invalidateQueries({ queryKey: ['companies'] });
    },
  });

  const importCsv = useMutation({
    mutationFn: async () => {
      const rows = parseCsv(csvText).map((row) => ({
        ...row,
        industry: form.industry || undefined,
      }));
      let succeeded = 0;
      let failed = 0;
      const results: Array<{ email: string; ok: boolean; error?: string }> = [];
      for (const row of rows) {
        try {
          await apiFetch('/organizations/companies/invite', {
            method: 'POST',
            token: getAccessToken(),
            body: JSON.stringify({
              ...row,
              formId: form.formId || undefined,
              formVersionId: form.formVersionId || undefined,
            }),
          });
          succeeded += 1;
          results.push({ email: row.email, ok: true });
        } catch (err) {
          failed += 1;
          results.push({
            email: row.email,
            ok: false,
            error: (err as Error).message,
          });
        }
      }
      return { total: rows.length, succeeded, failed, results };
    },
    onSuccess: (res) => {
      setCsvResult(
        `Imported ${res.succeeded}/${res.total}. Failed: ${res.failed}.`,
      );
      void qc.invalidateQueries({ queryKey: ['companies'] });
    },
  });

  function exportCsv() {
    const rows = data?.items ?? [];
    const header = 'code,name,email,industry,status\n';
    const body = rows
      .map((org) =>
        [
          org.code,
          org.name,
          org.contactEmail ?? '',
          org.industry ?? '',
          org.workflowStatus ?? org.status,
        ]
          .map((v) => `"${String(v).replaceAll('"', '""')}"`)
          .join(','),
      )
      .join('\n');
    const blob = new Blob([header + body], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'companies.csv';
    a.click();
    URL.revokeObjectURL(url);
  }

  function submitAdd() {
    if (!form.formId || !form.formVersionId) return;
    if (form.sendInvitation) {
      invite.mutate();
      return;
    }
    startAdminFill.mutate();
  }

  const addPending = invite.isPending || startAdminFill.isPending;
  const formSelected = Boolean(form.formId && form.formVersionId);

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Organizations"
        title="Investor"
        description="Invite investors by email or fill their profile yourself and mark them verified."
        actions={
          <>
            <Button variant="outline" onClick={exportCsv}>
              Export
            </Button>
            <Button
              variant="outline"
              onClick={() => {
                setCsvResult(null);
                setCsvOpen(true);
              }}
            >
              Import
            </Button>
            <Button
              onClick={() => {
                invite.reset();
                startAdminFill.reset();
                resetAddForm();
                setAddOpen(true);
              }}
            >
              Add
            </Button>
          </>
        }
      />

      <Card className="overflow-hidden p-4 sm:p-5">
        <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <h2 className="text-lg font-semibold">Directory</h2>
          <div className="flex w-full min-w-0 flex-col gap-2 sm:w-auto sm:flex-row sm:items-center">
            <Select
              className="w-full sm:w-56"
              value={dateSort}
              onChange={(e) =>
                setDateSort(
                  e.target.value === 'createdAt_asc'
                    ? 'createdAt_asc'
                    : 'createdAt_desc',
                )
              }
              aria-label="Sort by meeting bookings"
            >
              <option value="createdAt_desc">
                Bookings: high → low
              </option>
              <option value="createdAt_asc">
                Bookings: low → high
              </option>
            </Select>
            <Input
              className="w-full sm:max-w-xs"
              placeholder="Search name or email…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
        </div>

        {isLoading && <p className="text-[var(--muted)]">Loading…</p>}
        {error && <p className="text-rose-700">{(error as Error).message}</p>}

        {!isLoading && items.length === 0 ? (
          <EmptyState
            title={
              debouncedSearch ? 'No matching investors' : 'No investors yet'
            }
            description={
              debouncedSearch
                ? 'Try another name or email.'
                : 'Use Add to invite an investor by email, or fill the form as admin.'
            }
          />
        ) : (
          <>
            <div
              className={`grid gap-3 sm:hidden ${
                isFetching ? 'opacity-70 transition-opacity' : ''
              }`}
            >
              {items.map((org) => {
                const status =
                  org.workflowStatus ??
                  org.company?.approvalStatus ??
                  org.status;
                const stats = org.meetingStats;
                const table = org.tableAssignment;
                const near = formatNearDate(org.createdAt);
                return (
                  <div
                    key={org.id}
                    className="min-w-0 rounded-2xl border border-[var(--border)] bg-[linear-gradient(180deg,#ffffff_0%,#f7fbfd_100%)] p-4"
                  >
                    <div className="flex items-start gap-3">
                      {org.logoUrl ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          src={org.logoUrl}
                          alt=""
                          className="mt-0.5 h-10 w-10 shrink-0 rounded-md object-cover"
                        />
                      ) : null}
                      <div className="min-w-0 flex-1">
                        <div className="flex items-start justify-between gap-2">
                          <div className="min-w-0">
                            <div className="flex flex-wrap items-center gap-2">
                              <Link
                                href={`/admin/companies/${org.id}`}
                                className="break-words font-semibold text-[#172B4D] hover:text-[var(--accent)] hover:underline"
                              >
                                {org.name}
                              </Link>
                              {org.company?.featured ? (
                                <Badge variant="accent">Featured</Badge>
                              ) : null}
                            </div>
                            <p className="mt-0.5 break-all text-xs text-[#626F86]">
                              {org.contactEmail ?? 'No email'} · {org.code}
                            </p>
                          </div>
                          <div className="shrink-0">
                            <OrgRowActions
                              org={org}
                              kind="company"
                              queryKey={[...queryKey]}
                            />
                          </div>
                        </div>
                        <div className="mt-2 flex flex-wrap items-center gap-2">
                          <Badge variant={statusTone(status)}>
                            {formatVendorStatus(status)}
                          </Badge>
                          <span
                            title={near.title}
                            className="text-xs text-[#626F86]"
                          >
                            Created {near.label}
                          </span>
                        </div>
                      </div>
                    </div>

                    <div className="mt-3 rounded-xl bg-white/70 px-3 py-2.5">
                      <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-[#626F86]">
                        Table allotted
                      </p>
                      {table ? (
                        <div className="mt-1">
                          <p className="font-medium text-[#172B4D]">
                            {table.placeName}
                          </p>
                          <p className="text-xs text-[#626F86]">
                            {formatTableWindow(table)}
                          </p>
                        </div>
                      ) : (
                        <p className="mt-1 text-sm text-[#626F86]">Unassigned</p>
                      )}
                    </div>

                    {eventDates.length > 0 ? (
                      <div
                        className="mt-3 grid gap-2"
                        style={{
                          gridTemplateColumns: `repeat(${Math.min(eventDates.length, 3)}, minmax(0, 1fr))`,
                        }}
                      >
                        {eventDates.map((date) => (
                          <div
                            key={`${org.id}-m-${date}`}
                            className="rounded-xl border border-[#DFE1E6] bg-white px-2 py-2 text-center"
                          >
                            <p className="text-[10px] font-semibold uppercase tracking-wide text-[#626F86]">
                              {formatEventDate(date, 'chip')}
                            </p>
                            <p className="mt-1 text-sm font-semibold tabular-nums text-[#172B4D]">
                              {formatDayMeetingRatio(stats, date)}
                            </p>
                          </div>
                        ))}
                      </div>
                    ) : null}
                  </div>
                );
              })}
            </div>

            <div className="hidden min-w-0 sm:block">
              <Table
                className={
                  isFetching ? 'opacity-70 transition-opacity' : undefined
                }
              >
                <THead>
                  <TR>
                    <TH>Name</TH>
                    <TH>Status</TH>
                    <TH>Created</TH>
                    <TH>Table allotted</TH>
                    {eventDates.map((date) => (
                      <TH key={date} className="whitespace-nowrap text-center">
                        <span className="block">
                          {formatEventDate(date, 'chip')}
                        </span>
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
                      org.company?.approvalStatus ??
                      org.status;
                    const stats = org.meetingStats;
                    const table = org.tableAssignment;
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
                                  href={`/admin/companies/${org.id}`}
                                  className="font-semibold text-[#172B4D] hover:text-[var(--accent)] hover:underline"
                                >
                                  {org.name}
                                </Link>
                                {org.company?.featured ? (
                                  <Badge variant="accent">Featured</Badge>
                                ) : null}
                              </div>
                              <p className="text-xs text-[#626F86]">
                                {org.contactEmail ?? 'No email'} · {org.code}
                              </p>
                            </div>
                          </div>
                        </TD>
                        <TD>
                          <Badge variant={statusTone(status)}>
                            {formatVendorStatus(status)}
                          </Badge>
                        </TD>
                        <TD className="whitespace-nowrap text-sm">
                          {(() => {
                            const near = formatNearDate(org.createdAt);
                            return (
                              <span
                                title={near.title}
                                className="text-[#172B4D]"
                              >
                                {near.label}
                              </span>
                            );
                          })()}
                        </TD>
                        <TD className="whitespace-normal">
                          {table ? (
                            <div>
                              <p className="font-medium">{table.placeName}</p>
                              <p className="text-xs text-[#626F86]">
                                {formatTableWindow(table)}
                              </p>
                            </div>
                          ) : (
                            <span className="text-[#626F86]">Unassigned</span>
                          )}
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
                            kind="company"
                            queryKey={[...queryKey]}
                          />
                        </TD>
                      </TR>
                    );
                  })}
                </TBody>
              </Table>
            </div>
            <Pagination
              page={data?.page ?? page}
              pageSize={data?.pageSize ?? pageSize}
              total={data?.total ?? 0}
              onPageChange={setPage}
              onPageSizeChange={setPageSize}
            />
          </>
        )}
      </Card>

      <Modal
        open={addOpen}
        title="Add investor"
        description="Send an invitation link, or fill the investor form yourself and verify immediately."
        onClose={() => setAddOpen(false)}
        wide
        footer={
          <>
            <Button variant="outline" onClick={() => setAddOpen(false)}>
              Close
            </Button>
            <Button
              onClick={submitAdd}
              loading={addPending}
              disabled={
                !form.name.trim() ||
                !form.email.trim() ||
                !formSelected
              }
            >
              {addPending
                ? 'Working…'
                : form.sendInvitation
                  ? 'Add & send invitation'
                  : 'Create & fill form'}
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          <div>
            <p className="mb-2 text-sm font-medium">
              Send invitation link for data?
            </p>
            <div className="flex gap-4 text-sm">
              <label className="inline-flex items-center gap-2">
                <input
                  type="radio"
                  checked={form.sendInvitation}
                  onChange={() => setForm({ ...form, sendInvitation: true })}
                />
                Yes — email invitation (same as innovator)
              </label>
              <label className="inline-flex items-center gap-2">
                <input
                  type="radio"
                  checked={!form.sendInvitation}
                  onChange={() => setForm({ ...form, sendInvitation: false })}
                />
                No — I will fill the form
              </label>
            </div>
          </div>

          <div>
            <label className="mb-1.5 block text-sm font-medium">
              Select form (required)
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
              {investorForms.map((f) => (
                <option key={f.id} value={`${f.id}::${f.formVersionId}`}>
                  {f.name} (v{f.version})
                </option>
              ))}
            </Select>
            {forms.isLoading ? (
              <p className="mt-1 text-xs text-[var(--muted)]">Loading forms…</p>
            ) : (
              <p className="mt-1 text-xs text-[var(--muted)]">
                {form.sendInvitation
                  ? 'Invitation link opens this form after the investor creates an account.'
                  : 'You will fill this form next and verify the investor.'}
              </p>
            )}
          </div>

          <div>
            <label className="mb-1.5 block text-sm font-medium">
              Investor name
            </label>
            <Input
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              placeholder="Investor name"
            />
          </div>

          <div>
            <label className="mb-1.5 block text-sm font-medium">Email</label>
            <Input
              type="email"
              value={form.email}
              onChange={(e) => setForm({ ...form, email: e.target.value })}
              placeholder="buyer@company.com"
            />
          </div>

          <div>
            <label className="mb-1.5 block text-sm font-medium">Industry</label>
            <Input
              value={form.industry}
              onChange={(e) => setForm({ ...form, industry: e.target.value })}
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

          {(invite.error || startAdminFill.error) && (
            <p className="rounded-xl bg-rose-50 px-3 py-2 text-sm text-rose-700">
              {(
                (invite.error || startAdminFill.error) as Error
              ).message}
            </p>
          )}
        </div>
      </Modal>

      <Modal
        open={Boolean(adminFill)}
        title={adminFill ? `Fill ${adminFill.formName}` : 'Fill form'}
        description="Complete the investor profile. On submit it is marked verified immediately."
        onClose={() => setAdminFill(null)}
        size="xl"
        footer={
          <>
            <Button variant="outline" onClick={() => setAdminFill(null)}>
              Cancel
            </Button>
            <Button
              loading={completeAdminFill.isPending}
              onClick={() => completeAdminFill.mutate()}
            >
              {completeAdminFill.isPending
                ? 'Saving…'
                : 'Submit & mark verified'}
            </Button>
          </>
        }
      >
        {adminFill ? (
          <div className="space-y-3">
            {completeAdminFill.error ? (
              <p className="text-sm text-rose-700">
                {(completeAdminFill.error as Error).message}
              </p>
            ) : null}
            <FormRenderer
              schema={adminFill.schema}
              values={adminValues}
              onChange={(fieldId, value) =>
                setAdminValues((current) => ({
                  ...current,
                  [fieldId]: value,
                }))
              }
              onUpload={async (_field, file) => ({
                documentId: crypto.randomUUID(),
                filename: file.name,
              })}
            />
          </div>
        ) : null}
      </Modal>

      <Modal
        open={csvOpen}
        title="CSV import"
        description="Columns: name, email, phone (optional), phoneCountryCode (optional). Each row is invited by email."
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
              disabled={!csvText.trim() || !formSelected}
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
              {investorForms.map((f) => (
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
