'use client';

import {
  FIELD_TYPES,
  normalizeFormSchemaKeys,
  normalizeInternalKey,
  type FieldType,
  type FormField,
  type FormSchemaDefinition,
} from '@em/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useParams } from 'next/navigation';
import { useEffect, useRef, useState, type ChangeEvent } from 'react';
import { FormRenderer, formControlClass } from '@/components/form-renderer';
import { PageHeader } from '@/components/page-header';
import { Button } from '@/components/ui/button';
import { ApiError, apiFetch } from '@/lib/api';
import { getAccessToken } from '@/lib/auth-store';

type FormDetail = {
  id: string;
  name: string;
  description?: string | null;
  draftSchema: FormSchemaDefinition;
  versions: { id: string; version: number; status: string }[];
};

const palette = FIELD_TYPES.filter((type) => type !== 'repeater');

function arrayMove<T>(items: T[], from: number, to: number): T[] {
  const next = [...items];
  const [item] = next.splice(from, 1);
  if (!item) return items;
  next.splice(to, 0, item);
  return next;
}

export default function FormBuilderPage() {
  const params = useParams<{ id: string }>();
  const client = useQueryClient();
  const query = useQuery({
    queryKey: ['form', params.id],
    queryFn: () =>
      apiFetch<FormDetail>(`/forms/${params.id}`, {
        token: getAccessToken(),
      }),
  });
  const [schema, setSchema] = useState<FormSchemaDefinition | null>(null);
  const [name, setName] = useState('');
  const [selected, setSelected] = useState<string | null>(null);
  const [values, setValues] = useState<Record<string, unknown>>({});
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const hydratedForId = useRef<string | null>(null);

  const filterDimensions = useQuery({
    queryKey: ['filter-dimensions'],
    queryFn: () =>
      apiFetch<
        Array<{
          id: string;
          name: string;
          code: string;
          profileKey: string;
          tags: Array<{ value: string; label: string; isActive: boolean }>;
        }>
      >('/filters/dimensions?activeOnly=1', {
        token: getAccessToken(),
      }),
  });

  useEffect(() => {
    hydratedForId.current = null;
    setSchema(null);
    setSelected(null);
    setValues({});
    setMessage('');
    setError('');
  }, [params.id]);

  useEffect(() => {
    if (!query.data || hydratedForId.current === params.id) return;
    setSchema(normalizeFormSchemaKeys(query.data.draftSchema));
    setName(query.data.name);
    hydratedForId.current = params.id;
  }, [query.data, params.id]);

  const save = useMutation({
    mutationFn: () => {
      if (!schema) throw new Error('Form is still loading');
      const normalized = normalizeFormSchemaKeys(schema);
      setSchema(normalized);
      return apiFetch(`/forms/${params.id}/draft`, {
        method: 'PUT',
        token: getAccessToken(),
        body: JSON.stringify({ name, schema: normalized }),
      });
    },
    onSuccess: async () => {
      setMessage('Draft saved.');
      setError('');
      await client.invalidateQueries({ queryKey: ['form', params.id] });
    },
    onError: (caught) =>
      setError(caught instanceof ApiError ? caught.message : 'Save failed.'),
  });

  const publish = useMutation({
    mutationFn: async () => {
      if (!schema) throw new Error('Form is still loading');
      const normalized = normalizeFormSchemaKeys(schema);
      setSchema(normalized);
      await apiFetch(`/forms/${params.id}/draft`, {
        method: 'PUT',
        token: getAccessToken(),
        body: JSON.stringify({ name, schema: normalized }),
      });
      return apiFetch(`/forms/${params.id}/publish`, {
        method: 'POST',
        token: getAccessToken(),
      });
    },
    onSuccess: async () => {
      setMessage('Published a new immutable version.');
      setError('');
      await client.invalidateQueries({ queryKey: ['form', params.id] });
      await client.invalidateQueries({ queryKey: ['forms'] });
    },
    onError: (caught) =>
      setError(caught instanceof ApiError ? caught.message : 'Publish failed.'),
  });

  if (!schema) {
    return <p className="text-sm text-[var(--muted)]">Loading form…</p>;
  }

  const sectionId = schema.sections[0]?.id;
  const field = schema.fields.find((item) => item.id === selected) ?? null;
  const published = (query.data?.versions ?? [])
    .filter((version) => version.status === 'PUBLISHED')
    .map((version) => `v${version.version}`)
    .join(', ');

  function uniqueKey(preferred: string) {
    const used = new Set(schema!.fields.map((item) => item.key));
    let key = normalizeInternalKey(preferred);
    let n = 2;
    const base = key;
    while (used.has(key)) {
      key = normalizeInternalKey(`${base}_${n++}`);
    }
    return key;
  }

  function addField(type: FieldType) {
    if (!sectionId) return;
    const id = crypto.randomUUID();
    const next: FormField = {
      id,
      key: uniqueKey(`${type}_${schema!.fields.length + 1}`),
      type,
      label: labelFor(type),
      description: '',
      required: false,
      placeholder: '',
      options: ['select', 'multiselect', 'radio', 'checkbox'].includes(type)
        ? [{ value: 'option_1', label: 'Option 1' }]
        : [],
      validation: {},
      sectionId,
      order: schema!.fields.length,
      conditional: null,
      readOnly: type === 'info',
      filterDimensionId: null,
      children: [],
    };
    setSchema({ ...schema!, fields: [...schema!.fields, next] });
    setSelected(id);
  }

  function addFilterField(dimension: {
    id: string;
    name: string;
    code: string;
    profileKey: string;
    tags: Array<{ value: string; label: string; isActive: boolean }>;
  }) {
    if (!sectionId) return;
    const options = dimension.tags
      .filter((tag) => tag.isActive)
      .map((tag) => ({ value: tag.value, label: tag.label }));
    if (options.length === 0) {
      setError(
        `“${dimension.name}” has no active tags yet. Add tags under Admin → Filters first.`,
      );
      return;
    }
    const id = crypto.randomUUID();
    const next: FormField = {
      id,
      key: uniqueKey(dimension.profileKey || dimension.code || dimension.name),
      type: 'select',
      label: dimension.name,
      description: `Choose one ${dimension.name.toLowerCase()} option`,
      required: true,
      placeholder: `Select ${dimension.name.toLowerCase()}`,
      options,
      validation: {},
      sectionId,
      order: schema!.fields.length,
      conditional: null,
      readOnly: false,
      filterDimensionId: dimension.id,
      children: [],
    };
    setError('');
    setSchema({ ...schema!, fields: [...schema!.fields, next] });
    setSelected(id);
  }

  function updateField(id: string, patch: Partial<FormField>) {
    const nextPatch =
      patch.key !== undefined
        ? { ...patch, key: normalizeInternalKey(patch.key) }
        : patch;
    setSchema({
      ...schema!,
      fields: schema!.fields.map((item) =>
        item.id === id ? { ...item, ...nextPatch } : item,
      ),
    });
  }

  function move(id: string, direction: number) {
    const index = schema!.fields.findIndex((item) => item.id === id);
    const target = index + direction;
    if (target < 0 || target >= schema!.fields.length) return;
    const moved = arrayMove(schema!.fields, index, target).map(
      (item, order) => ({ ...item, order }),
    );
    setSchema({ ...schema!, fields: moved });
  }

  return (
    <div className="space-y-4">
      <div>
        <PageHeader
          title={name || 'Form'}
          description={`This canvas is the form recipients will fill in. Click a field to edit it. Published versions: ${published || 'none yet'}`}
          actions={
            <div className="flex gap-2">
              <Button
                variant="outline"
                onClick={() => save.mutate()}
                loading={save.isPending}
              >
                {save.isPending ? 'Saving…' : 'Save draft'}
              </Button>
              <Button
                onClick={() => publish.mutate()}
                loading={publish.isPending}
              >
                {publish.isPending ? 'Publishing…' : 'Publish'}
              </Button>
            </div>
          }
        />
        {error ? (
          <p className="mb-3 text-sm text-[var(--danger)]">{error}</p>
        ) : null}
        {message ? (
          <p className="mb-3 text-sm text-[var(--success)]">{message}</p>
        ) : null}
        <label className="mb-2 block text-sm font-medium">
          Form name
          <input
            className={`${formControlClass} mt-1 max-w-md`}
            value={name}
            onChange={(event) => setName(event.target.value)}
          />
        </label>
      </div>
      <div className="grid items-start gap-4 lg:grid-cols-[220px_minmax(0,1fr)_minmax(240px,320px)]">
        <aside className="min-w-0 rounded-2xl border border-[var(--border)] bg-[var(--card)] p-3 lg:sticky lg:top-6 lg:max-h-[calc(100dvh-3rem)] lg:overflow-y-auto">
          <h2 className="mb-2 text-xs font-semibold uppercase text-[var(--muted)]">
            Filter tags
          </h2>
          <p className="mb-2 text-[11px] leading-snug text-[var(--muted)]">
            Adds a single-choice dropdown from Admin → Filters.
          </p>
          {filterDimensions.isLoading ? (
            <p className="mb-3 text-xs text-[var(--muted)]">Loading filters…</p>
          ) : (filterDimensions.data ?? []).length === 0 ? (
            <p className="mb-3 rounded-lg border border-dashed border-[var(--border)] px-2 py-2 text-xs text-[var(--muted)]">
              No filter groups yet. Create Category / Industry under Filters.
            </p>
          ) : (
            <div className="mb-4 grid gap-1">
              {(filterDimensions.data ?? []).map((dim) => (
                <button
                  key={dim.id}
                  type="button"
                  className="rounded-lg border border-[var(--accent)]/30 bg-[var(--accent-soft)] px-2 py-1.5 text-left text-sm font-medium text-[var(--accent-hover)] hover:bg-[var(--accent-soft)]/80"
                  onClick={() => addFilterField(dim)}
                >
                  {dim.name}
                  <span className="mt-0.5 block text-[11px] font-normal text-[var(--muted)]">
                    {dim.tags.filter((t) => t.isActive).length} options
                  </span>
                </button>
              ))}
            </div>
          )}
          <h2 className="mb-2 text-xs font-semibold uppercase text-[var(--muted)]">
            Add a field
          </h2>
          <div className="grid gap-1">
            {palette.map((type) => (
              <button
                key={type}
                type="button"
                className="rounded-lg border border-[var(--border)] px-2 py-1.5 text-left text-sm hover:bg-[var(--card-elevated)]"
                onClick={() => addField(type)}
              >
                {labelFor(type)}
              </button>
            ))}
          </div>
        </aside>
        <div className="min-w-0">
          {schema.fields.length === 0 ? (
            <p className="mb-3 text-sm text-[var(--muted)]">
              Add a field. It appears here the same way a recipient will see it.
            </p>
          ) : null}
          <FormRenderer
            schema={schema}
            values={values}
            selectedFieldId={selected}
            onSelectField={setSelected}
            onChange={(fieldId, value) => {
              setSelected(fieldId);
              setValues((current) => ({ ...current, [fieldId]: value }));
            }}
            onUpload={async (_field, file) => ({
              documentId: crypto.randomUUID(),
              filename: file.name,
            })}
          />
        </div>
        <aside className="min-w-0 rounded-2xl border border-[var(--border)] bg-[var(--card)] lg:sticky lg:top-6 lg:max-h-[calc(100dvh-3rem)] lg:overflow-y-auto">
          <h2 className="px-3 pt-3 text-xs font-semibold uppercase text-[var(--muted)]">
            Configuration
          </h2>
          <div className="p-3 pb-6">
            {!field ? (
              <p className="text-sm text-[var(--muted)]">
                Select a field in the form.
              </p>
            ) : (
              <div className="grid min-w-0 gap-3 break-words">
                <label className="grid gap-1 text-sm font-medium">
                  Label
                  <input
                    className={formControlClass}
                    value={field.label}
                    onChange={(event) =>
                      updateField(field.id, { label: event.target.value })
                    }
                  />
                </label>
                <label className="grid gap-1 text-sm font-medium">
                  Internal key
                  <input
                    className={formControlClass}
                    value={field.key}
                    onChange={(event) =>
                      updateField(field.id, { key: event.target.value })
                    }
                  />
                </label>
                <label className="grid gap-1 text-sm font-medium">
                  Help text
                  <input
                    className={formControlClass}
                    value={field.description ?? ''}
                    onChange={(event) =>
                      updateField(field.id, {
                        description: event.target.value,
                      })
                    }
                  />
                </label>
                {field.type === 'reupload' ? (
                  <TemplateFile
                    field={field}
                    onChange={(template) => updateField(field.id, { template })}
                  />
                ) : (
                  <label className="grid gap-1 text-sm font-medium">
                    Placeholder
                    <input
                      className={formControlClass}
                      value={field.placeholder ?? ''}
                      onChange={(event) =>
                        updateField(field.id, {
                          placeholder: event.target.value,
                        })
                      }
                    />
                  </label>
                )}
                {['select', 'multiselect', 'radio', 'checkbox'].includes(
                  field.type,
                ) ? (
                  <>
                    <label className="grid gap-1 text-sm font-medium">
                      Linked filter group
                      <select
                        className={formControlClass}
                        value={field.filterDimensionId ?? ''}
                        onChange={(event) => {
                          const dimensionId = event.target.value || null;
                          const dimension = (filterDimensions.data ?? []).find(
                            (item) => item.id === dimensionId,
                          );
                          const options = (dimension?.tags ?? [])
                            .filter((tag) => tag.isActive)
                            .map((tag) => ({
                              value: tag.value,
                              label: tag.label,
                            }));
                          updateField(field.id, {
                            filterDimensionId: dimensionId,
                            type: dimensionId ? 'select' : field.type,
                            ...(dimension
                              ? {
                                  options,
                                  label: field.label || dimension.name,
                                  placeholder: `Select ${dimension.name.toLowerCase()}`,
                                  key: normalizeInternalKey(
                                    dimension.profileKey || field.key,
                                  ),
                                }
                              : {}),
                          });
                        }}
                      >
                        <option value="">Custom options (manual)</option>
                        {(filterDimensions.data ?? []).map((dim) => (
                          <option key={dim.id} value={dim.id}>
                            {dim.name} (
                            {dim.tags.filter((t) => t.isActive).length} tags)
                          </option>
                        ))}
                      </select>
                    </label>
                    {field.filterDimensionId ? (
                      <div className="rounded-xl border border-[var(--border)] bg-[var(--card-elevated)] p-2.5">
                        <p className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-[var(--muted)]">
                          Dropdown options
                        </p>
                        <ul className="max-h-40 space-y-1 overflow-y-auto text-sm">
                          {(field.options ?? []).map((option) => (
                            <li
                              key={option.value}
                              className="flex items-center justify-between gap-2 rounded-lg bg-white px-2 py-1"
                            >
                              <span>{option.label}</span>
                              <code className="text-[11px] text-[var(--muted)]">
                                {option.value}
                              </code>
                            </li>
                          ))}
                        </ul>
                        <p className="mt-2 text-xs text-[var(--muted)]">
                          Guests/clients pick one value from this dropdown.
                          Save or publish to refresh tags from Filters.
                        </p>
                      </div>
                    ) : (
                      <label className="grid gap-1 text-sm font-medium">
                        Options (one per line, value|label)
                        <textarea
                          className={`${formControlClass} min-h-24 py-2`}
                          value={(field.options ?? [])
                            .map((option) =>
                              option.value === option.label
                                ? option.label
                                : `${option.value}|${option.label}`,
                            )
                            .join('\n')}
                          onChange={(event) =>
                            updateField(field.id, {
                              options: event.target.value
                                .split('\n')
                                .map((line) => line.trim())
                                .filter(Boolean)
                                .map((line) => {
                                  const [value, label] = line.split('|');
                                  return {
                                    value: (value ?? '').trim(),
                                    label: (label ?? value ?? '').trim(),
                                  };
                                }),
                            })
                          }
                        />
                      </label>
                    )}
                  </>
                ) : null}
                <label className="flex items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    checked={field.required}
                    onChange={(event) =>
                      updateField(field.id, {
                        required: event.target.checked,
                      })
                    }
                  />
                  Compulsory
                </label>
                <p className="text-xs text-[var(--muted)]">
                  A compulsory field must be filled before submit.
                </p>
                <label className="flex items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    checked={Boolean(field.sensitive)}
                    onChange={(event) =>
                      updateField(field.id, {
                        sensitive: event.target.checked,
                      })
                    }
                  />
                  Sensitive
                </label>
                <p className="text-xs text-[var(--muted)]">
                  Sensitive answers stay off recommended public profiles. Admins
                  still see them in reviews.
                </p>
                <div className="flex flex-wrap gap-2">
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => move(field.id, -1)}
                  >
                    Move up
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => move(field.id, 1)}
                  >
                    Move down
                  </Button>
                </div>
                <Button
                  size="sm"
                  variant="danger"
                  onClick={() => {
                    setSchema({
                      ...schema,
                      fields: schema.fields.filter(
                        (item) => item.id !== field.id,
                      ),
                    });
                    setSelected(null);
                  }}
                >
                  Remove
                </Button>
              </div>
            )}
          </div>
        </aside>
      </div>
    </div>
  );
}

function labelFor(type: FieldType) {
  if (type === 'reupload') return 'Download & reupload';
  return type
    .replaceAll('_', ' ')
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function TemplateFile({
  field,
  onChange,
}: {
  field: FormField;
  onChange: (template: { assetId: string; filename: string }) => void;
}) {
  function pick(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    onChange({ assetId: crypto.randomUUID(), filename: file.name });
  }

  return (
    <div className="grid min-w-0 gap-2">
      <p className="text-xs font-semibold uppercase text-[var(--muted)]">
        File for recipients
      </p>
      <p className="text-xs text-[var(--muted)]">
        Recipients download this file, then upload their completed copy.
      </p>
      {field.template?.assetId && field.template.filename ? (
        <p className="break-all text-sm font-medium">
          {field.template.filename}
        </p>
      ) : (
        <p className="text-sm text-[var(--muted)]">No file uploaded yet.</p>
      )}
      <label className="inline-flex h-9 w-fit cursor-pointer items-center rounded-lg border border-[var(--border)] px-3 text-sm hover:bg-[var(--card-elevated)]">
        <input className="sr-only" type="file" onChange={pick} />
        Choose file
      </label>
    </div>
  );
}
