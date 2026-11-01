'use client';

import { useEffect, useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { apiFetch } from '@/lib/api';
import { getAccessToken } from '@/lib/auth-store';

/** Keep in sync with apps/api DEFAULT_MATCHMAKING_* for reset-to-default. */
const DEFAULT_MATCHMAKING_PROMPT = `You are Ethara's event matchmaking analyst for investor–innovator meetings at a water-sector networking event.

Given an INVESTOR profile and an INNOVATOR profile built from match fields only (topics, regions, capabilities, funding, thesis/solution — never personal contact details), judge how valuable a short in-person meeting would be.

Respond with JSON only — no markdown fences:
{
  "score": <integer 0-100>,
  "rationale": "<2-3 sentences for admins: why this meeting makes sense, citing specific fields from the profiles. Do not invent facts.>",
  "reasons": ["<short bullet 1>", "<short bullet 2>", "<optional bullet 3>"],
  "mismatch": "<one sentence on the main risk or gap, or empty string if none>",
  "agenda": "<one sentence suggested focus for a 15-minute meeting>"
}

The "reasons" array must have 2–4 concise bullets an event admin can scan quickly (each under 120 characters).

Scoring guide:
- 0–25 poor fit
- 26–50 weak fit
- 51–70 moderate fit
- 71–85 strong fit
- 86–100 excellent fit`;

const DEFAULT_MATCHMAKING_USER_TEMPLATE = `Investor profile:
{{investorProfile}}

Innovator profile:
{{innovatorProfile}}

Score how well they should meet for a short networking session at the event.`;

const FINE_TUNE_KEYS = [
  'ops.recommendationScoreThreshold',
  'ai.matchmakingBlendWeight',
  'ai.javTemperature',
  'ai.matchmakingMode',
  'ai.javChatModel',
  'ai.javFineTunedModel',
  'ai.matchmakingPrompt',
  'ai.matchmakingUserTemplate',
] as const;

type FineTuneKey = (typeof FINE_TUNE_KEYS)[number];

type SettingField = {
  key: string;
  value: unknown;
  envDefault: unknown;
  label?: string;
  description?: string;
};

type FineTuneDraft = Record<FineTuneKey, string>;

const DEFAULTS: FineTuneDraft = {
  'ops.recommendationScoreThreshold': '50',
  'ai.matchmakingBlendWeight': '0.3',
  'ai.javTemperature': '0.2',
  'ai.matchmakingMode': 'llm',
  'ai.javChatModel': 'qwen/qwen-2.5-72b-instruct',
  'ai.javFineTunedModel': '',
  'ai.matchmakingPrompt': DEFAULT_MATCHMAKING_PROMPT,
  'ai.matchmakingUserTemplate': DEFAULT_MATCHMAKING_USER_TEMPLATE,
};

function fieldToString(field: SettingField | undefined, fallback: string) {
  if (!field) return fallback;
  const raw =
    field.value !== undefined && field.value !== null && field.value !== ''
      ? field.value
      : (field.envDefault ?? fallback);
  return String(raw ?? fallback);
}

function buildDraft(
  fields: SettingField[] | undefined,
): FineTuneDraft {
  const byKey = new Map((fields ?? []).map((f) => [f.key, f]));
  return {
    'ops.recommendationScoreThreshold': fieldToString(
      byKey.get('ops.recommendationScoreThreshold'),
      DEFAULTS['ops.recommendationScoreThreshold'],
    ),
    'ai.matchmakingBlendWeight': fieldToString(
      byKey.get('ai.matchmakingBlendWeight'),
      DEFAULTS['ai.matchmakingBlendWeight'],
    ),
    'ai.javTemperature': fieldToString(
      byKey.get('ai.javTemperature'),
      DEFAULTS['ai.javTemperature'],
    ),
    'ai.matchmakingMode': fieldToString(
      byKey.get('ai.matchmakingMode'),
      DEFAULTS['ai.matchmakingMode'],
    ),
    'ai.javChatModel': fieldToString(
      byKey.get('ai.javChatModel'),
      DEFAULTS['ai.javChatModel'],
    ),
    'ai.javFineTunedModel': fieldToString(
      byKey.get('ai.javFineTunedModel'),
      DEFAULTS['ai.javFineTunedModel'],
    ),
    'ai.matchmakingPrompt': fieldToString(
      byKey.get('ai.matchmakingPrompt'),
      DEFAULTS['ai.matchmakingPrompt'],
    ),
    'ai.matchmakingUserTemplate': fieldToString(
      byKey.get('ai.matchmakingUserTemplate'),
      DEFAULTS['ai.matchmakingUserTemplate'],
    ),
  };
}

type Props = {
  disabled?: boolean;
};

export function AiFineTunePanel({ disabled = false }: Props) {
  const qc = useQueryClient();
  const [open, setOpen] = useState(true);
  const [draft, setDraft] = useState<FineTuneDraft>(DEFAULTS);
  const [dirty, setDirty] = useState(false);
  const [saveNote, setSaveNote] = useState<string | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);

  const settings = useQuery({
    queryKey: ['settings-ai-matchmaking'],
    queryFn: () =>
      apiFetch<{
        integration: Array<{
          id: string;
          fields: SettingField[];
        }>;
      }>('/settings', { token: getAccessToken() }),
  });

  const aiFields = useMemo(() => {
    return settings.data?.integration.find((g) => g.id === 'ai')?.fields;
  }, [settings.data]);

  useEffect(() => {
    if (!aiFields || dirty) return;
    setDraft(buildDraft(aiFields));
  }, [aiFields, dirty]);

  const setField = (key: FineTuneKey, value: string) => {
    setDirty(true);
    setSaveNote(null);
    setSaveError(null);
    setDraft((prev) => ({ ...prev, [key]: value }));
  };

  const save = useMutation({
    mutationFn: async () => {
      setSaveError(null);
      setSaveNote(null);
      const threshold = Number(draft['ops.recommendationScoreThreshold']);
      const blend = Number(draft['ai.matchmakingBlendWeight']);
      const temperature = Number(draft['ai.javTemperature']);
      if (!Number.isFinite(threshold) || threshold < 0 || threshold > 100) {
        throw new Error('Threshold must be a number between 0 and 100');
      }
      if (!Number.isFinite(blend) || blend < 0 || blend > 1) {
        throw new Error('AI blend weight must be a number between 0 and 1');
      }
      if (!Number.isFinite(temperature) || temperature < 0 || temperature > 1) {
        throw new Error('Temperature must be a number between 0 and 1');
      }

      const values = [
        {
          key: 'ops.recommendationScoreThreshold',
          value: threshold,
        },
        {
          key: 'ai.matchmakingBlendWeight',
          value: blend,
        },
        {
          key: 'ai.javTemperature',
          value: temperature,
        },
        {
          key: 'ai.matchmakingMode',
          value: draft['ai.matchmakingMode'] || 'llm',
        },
        {
          key: 'ai.javChatModel',
          value: draft['ai.javChatModel'].trim(),
        },
        {
          key: 'ai.javFineTunedModel',
          value: draft['ai.javFineTunedModel'].trim(),
        },
        {
          key: 'ai.matchmakingPrompt',
          value: draft['ai.matchmakingPrompt'],
        },
        {
          key: 'ai.matchmakingUserTemplate',
          value: draft['ai.matchmakingUserTemplate'],
        },
      ];

      return apiFetch('/settings/integrations', {
        method: 'PUT',
        token: getAccessToken(),
        body: JSON.stringify({ values }),
      });
    },
    onSuccess: () => {
      setDirty(false);
      setSaveNote('AI fine-tune settings saved. Re-run scoring to apply.');
      void qc.invalidateQueries({ queryKey: ['settings-ai-matchmaking'] });
      void qc.invalidateQueries({ queryKey: ['settings'] });
      void qc.invalidateQueries({ queryKey: ['integrations-health-ai'] });
    },
    onError: (err: Error) => {
      setSaveError(err.message || 'Failed to save AI fine-tune settings');
    },
  });

  const resetPrompts = () => {
    setDirty(true);
    setSaveNote(null);
    setSaveError(null);
    setDraft((prev) => ({
      ...prev,
      'ai.matchmakingPrompt': DEFAULT_MATCHMAKING_PROMPT,
      'ai.matchmakingUserTemplate': DEFAULT_MATCHMAKING_USER_TEMPLATE,
    }));
  };

  const discard = () => {
    setDirty(false);
    setSaveNote(null);
    setSaveError(null);
    setDraft(buildDraft(aiFields));
  };

  return (
    <Card className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="text-lg font-semibold">Fine-tune AI</h2>
            {dirty ? <Badge variant="warning">Unsaved</Badge> : null}
          </div>
          <p className="mt-1 text-sm text-[var(--muted)]">
            Edit scoring knobs and prompts used for matchmaking. Changes apply
            on the next scoring run or peer recompute.
          </p>
        </div>
        <Button
          type="button"
          variant="outline"
          onClick={() => setOpen((v) => !v)}
        >
          {open ? 'Hide' : 'Edit'}
        </Button>
      </div>

      {open ? (
        <div className="space-y-4">
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <label className="space-y-1 text-sm">
              <span className="text-[var(--muted)]">Score threshold (0–100)</span>
              <Input
                type="number"
                min={0}
                max={100}
                step={1}
                value={draft['ops.recommendationScoreThreshold']}
                disabled={disabled || save.isPending}
                onChange={(e) =>
                  setField('ops.recommendationScoreThreshold', e.target.value)
                }
              />
              <span className="block text-xs text-[var(--muted)]">
                Only show recommendations at or above this score.
              </span>
            </label>

            <label className="space-y-1 text-sm">
              <span className="text-[var(--muted)]">AI blend weight (0–1)</span>
              <Input
                type="number"
                min={0}
                max={1}
                step={0.05}
                value={draft['ai.matchmakingBlendWeight']}
                disabled={disabled || save.isPending}
                onChange={(e) =>
                  setField('ai.matchmakingBlendWeight', e.target.value)
                }
              />
              <span className="block text-xs text-[var(--muted)]">
                0.3 = 70% rules + 30% AI.
              </span>
            </label>

            <label className="space-y-1 text-sm">
              <span className="text-[var(--muted)]">Temperature (0–1)</span>
              <Input
                type="number"
                min={0}
                max={1}
                step={0.05}
                value={draft['ai.javTemperature']}
                disabled={disabled || save.isPending}
                onChange={(e) => setField('ai.javTemperature', e.target.value)}
              />
              <span className="block text-xs text-[var(--muted)]">
                Lower = more consistent scores.
              </span>
            </label>

            <label className="space-y-1 text-sm">
              <span className="text-[var(--muted)]">AI mode</span>
              <Select
                value={draft['ai.matchmakingMode']}
                disabled={disabled || save.isPending}
                onChange={(e) => setField('ai.matchmakingMode', e.target.value)}
              >
                <option value="llm">llm (recommended)</option>
                <option value="hybrid">hybrid</option>
                <option value="embedding">embedding</option>
              </Select>
            </label>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <label className="space-y-1 text-sm">
              <span className="text-[var(--muted)]">Matchmaking model id</span>
              <Input
                value={draft['ai.javChatModel']}
                disabled={disabled || save.isPending}
                onChange={(e) => setField('ai.javChatModel', e.target.value)}
                placeholder="qwen/qwen-2.5-72b-instruct"
              />
            </label>
            <label className="space-y-1 text-sm">
              <span className="text-[var(--muted)]">
                Fine-tuned / override model id
              </span>
              <Input
                value={draft['ai.javFineTunedModel']}
                disabled={disabled || save.isPending}
                onChange={(e) =>
                  setField('ai.javFineTunedModel', e.target.value)
                }
                placeholder="Optional — pins a fine-tuned model"
              />
              <span className="block text-xs text-[var(--muted)]">
                If set, replaces the matchmaking model id above.
              </span>
            </label>
          </div>

          <label className="block space-y-1 text-sm">
            <span className="text-[var(--muted)]">System prompt</span>
            <Textarea
              rows={12}
              value={draft['ai.matchmakingPrompt']}
              disabled={disabled || save.isPending}
              onChange={(e) => setField('ai.matchmakingPrompt', e.target.value)}
              className="font-mono text-xs"
            />
            <span className="block text-xs text-[var(--muted)]">
              Instructs the model. Keep JSON score + rationale format.
            </span>
          </label>

          <label className="block space-y-1 text-sm">
            <span className="text-[var(--muted)]">User message template</span>
            <Textarea
              rows={8}
              value={draft['ai.matchmakingUserTemplate']}
              disabled={disabled || save.isPending}
              onChange={(e) =>
                setField('ai.matchmakingUserTemplate', e.target.value)
              }
              className="font-mono text-xs"
            />
            <span className="block text-xs text-[var(--muted)]">
              Placeholders: {'{{investorProfile}}'}, {'{{innovatorProfile}}'}{' '}
              (aliases {'{{left}}'}, {'{{right}}'}).
            </span>
          </label>

          {saveError ? (
            <p className="text-sm text-[var(--danger)]" role="alert">
              {saveError}
            </p>
          ) : null}
          {saveNote ? (
            <p className="text-sm text-emerald-700">{saveNote}</p>
          ) : null}

          <div className="flex flex-wrap gap-2">
            <Button
              loading={save.isPending}
              disabled={disabled || save.isPending || !dirty}
              onClick={() => save.mutate()}
            >
              Save fine-tune
            </Button>
            <Button
              type="button"
              variant="outline"
              disabled={disabled || save.isPending || !dirty}
              onClick={discard}
            >
              Discard
            </Button>
            <Button
              type="button"
              variant="outline"
              disabled={disabled || save.isPending}
              onClick={resetPrompts}
            >
              Reset prompts to default
            </Button>
          </div>
        </div>
      ) : null}
    </Card>
  );
}
