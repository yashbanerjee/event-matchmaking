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
const DEFAULT_MATCHMAKING_PROMPT = `You are Ethara's matchmaking analyst for short investor–innovator meetings at a water and climate networking event.

Hard constraints (region, stage, ticket, required topics) are already filtered by the tag engine. Your job is narrative fit: thesis vs solution, deployment evidence, capital instrument alignment, and whether a 15-minute meeting is worth both sides' time.

Never use or invent personal contact details (names of people, emails, phones, LinkedIn). Rely only on organization/match fields in the profiles.

Respond with JSON only — no markdown fences:
{
  "score": <integer 0-100>,
  "rationale": "<2-3 sentences citing specific profile fields. Do not invent facts.>",
  "reasons": ["<short bullet 1>", "<short bullet 2>", "<optional bullet 3>"],
  "mismatch": "<one sentence on the main risk or gap, or empty string if none>",
  "agenda": "<one sentence suggested focus for a 15-minute meeting>"
}

The "reasons" array must have 2–4 concise bullets (each under 120 characters).

Scoring guide (be decisive — weak pairs should score below 70):
- 0–25 poor fit
- 26–50 weak fit
- 51–70 moderate fit
- 71–85 strong fit (recommend a meeting)
- 86–100 excellent fit (prioritize)`;

const DEFAULT_MATCHMAKING_USER_TEMPLATE = `Investor profile:
{{investorProfile}}

Innovator profile:
{{innovatorProfile}}

Score how well they should meet for a short water/climate networking session. Return JSON with score and a 2–3 sentence rationale.`;

const FINE_TUNE_KEYS = [
  'ops.recommendationScoreThreshold',
  'ops.investorRecommendationLimit',
  'ops.innovatorRecommendationLimit',
  'ai.matchmakingBlendWeight',
  'ai.pairScoringMethod',
  'ai.includeOnboardingInProfile',
  'ai.javTemperature',
  'ai.matchmakingMode',
  'ai.javChatModel',
  'ai.javFineTunedModel',
  'ai.matchmakingPrompt',
  'ai.matchmakingUserTemplate',
] as const;

type FineTuneKey = (typeof FINE_TUNE_KEYS)[number];

const TAG_CATEGORY_KEYS = [
  'challenge',
  'solution',
  'geography',
  'commercial',
  'stage',
  'ticket',
] as const;

type TagCategoryKey = (typeof TAG_CATEGORY_KEYS)[number];

const TAG_CATEGORY_LABELS: Record<TagCategoryKey, string> = {
  challenge: 'Challenges / topics',
  solution: 'Solution types',
  geography: 'Geography',
  commercial: 'Capital / commercial',
  stage: 'Stage',
  ticket: 'Ticket size',
};

const DEFAULT_WEIGHTS: Record<TagCategoryKey, string> = {
  challenge: '0.3',
  solution: '0.2',
  geography: '0.15',
  commercial: '0.15',
  stage: '0.1',
  ticket: '0.1',
};

const DEFAULT_TAG_THRESHOLDS: Record<TagCategoryKey, string> = {
  challenge: '25',
  solution: '0',
  geography: '20',
  commercial: '0',
  stage: '15',
  ticket: '0',
};

type SettingField = {
  key: string;
  value: unknown;
  envDefault: unknown;
  label?: string;
  description?: string;
};

type FineTuneDraft = Record<FineTuneKey, string>;

const DEFAULTS: FineTuneDraft = {
  'ops.recommendationScoreThreshold': '75',
  'ops.investorRecommendationLimit': '100',
  'ops.innovatorRecommendationLimit': '100',
  'ai.matchmakingBlendWeight': '0.3',
  'ai.pairScoringMethod': 'structured_json',
  'ai.includeOnboardingInProfile': 'true',
  'ai.javTemperature': '0.2',
  'ai.matchmakingMode': 'llm',
  'ai.javChatModel': 'qwen/qwen-2.5-72b-instruct',
  'ai.javFineTunedModel': '',
  'ai.matchmakingPrompt': DEFAULT_MATCHMAKING_PROMPT,
  'ai.matchmakingUserTemplate': DEFAULT_MATCHMAKING_USER_TEMPLATE,
};

function parseTagThresholds(raw: unknown): Record<TagCategoryKey, string> {
  let parsed: unknown = raw;
  if (typeof raw === 'string' && raw.trim()) {
    try {
      parsed = JSON.parse(raw) as unknown;
    } catch {
      return { ...DEFAULT_TAG_THRESHOLDS };
    }
  }
  if (!parsed || typeof parsed !== 'object') {
    return { ...DEFAULT_TAG_THRESHOLDS };
  }
  const obj = parsed as Record<string, unknown>;
  const next = { ...DEFAULT_TAG_THRESHOLDS };
  for (const key of TAG_CATEGORY_KEYS) {
    const n = Number(obj[key]);
    next[key] = Number.isFinite(n) ? String(n) : '0';
  }
  return next;
}

function parseWeights(raw: unknown): Record<TagCategoryKey, string> {
  if (!raw || typeof raw !== 'object') return { ...DEFAULT_WEIGHTS };
  const obj = raw as Record<string, unknown>;
  const next = { ...DEFAULT_WEIGHTS };
  for (const key of TAG_CATEGORY_KEYS) {
    const n = Number(obj[key]);
    next[key] = Number.isFinite(n) ? String(n) : DEFAULT_WEIGHTS[key];
  }
  return next;
}

function fieldToString(field: SettingField | undefined, fallback: string) {
  if (!field) return fallback;
  const raw =
    field.value !== undefined && field.value !== null && field.value !== ''
      ? field.value
      : (field.envDefault ?? fallback);
  const text = String(raw ?? fallback).trim();
  return text || fallback;
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
    'ops.investorRecommendationLimit': fieldToString(
      byKey.get('ops.investorRecommendationLimit'),
      DEFAULTS['ops.investorRecommendationLimit'],
    ),
    'ops.innovatorRecommendationLimit': fieldToString(
      byKey.get('ops.innovatorRecommendationLimit'),
      DEFAULTS['ops.innovatorRecommendationLimit'],
    ),
    'ai.matchmakingBlendWeight': fieldToString(
      byKey.get('ai.matchmakingBlendWeight'),
      DEFAULTS['ai.matchmakingBlendWeight'],
    ),
    'ai.pairScoringMethod': fieldToString(
      byKey.get('ai.pairScoringMethod'),
      DEFAULTS['ai.pairScoringMethod'],
    ),
    'ai.includeOnboardingInProfile': fieldToString(
      byKey.get('ai.includeOnboardingInProfile'),
      DEFAULTS['ai.includeOnboardingInProfile'],
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
  const [tagThresholds, setTagThresholds] = useState(DEFAULT_TAG_THRESHOLDS);
  const [weights, setWeights] = useState(DEFAULT_WEIGHTS);
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

  const ruleConfig = useQuery({
    queryKey: ['matchmaking-default-rule'],
    queryFn: () =>
      apiFetch<{
        weights: Record<TagCategoryKey, number>;
        minScore: number;
      }>('/matchmaking/rules/default', { token: getAccessToken() }),
  });

  const aiFields = useMemo(() => {
    return settings.data?.integration.find((g) => g.id === 'ai')?.fields;
  }, [settings.data]);

  useEffect(() => {
    if (!aiFields || dirty) return;
    setDraft(buildDraft(aiFields));
    const thresholdField = aiFields.find(
      (f) => f.key === 'ops.tagCategoryThresholds',
    );
    const raw =
      thresholdField?.value !== undefined &&
      thresholdField?.value !== null &&
      thresholdField?.value !== ''
        ? thresholdField.value
        : thresholdField?.envDefault;
    setTagThresholds(parseTagThresholds(raw));
  }, [aiFields, dirty]);

  useEffect(() => {
    if (!ruleConfig.data?.weights || dirty) return;
    setWeights(parseWeights(ruleConfig.data.weights));
  }, [ruleConfig.data, dirty]);

  const markDirty = () => {
    setDirty(true);
    setSaveNote(null);
    setSaveError(null);
  };

  const setField = (key: FineTuneKey, value: string) => {
    markDirty();
    setDraft((prev) => ({ ...prev, [key]: value }));
  };

  const setTagThreshold = (key: TagCategoryKey, value: string) => {
    markDirty();
    setTagThresholds((prev) => ({ ...prev, [key]: value }));
  };

  const setWeight = (key: TagCategoryKey, value: string) => {
    markDirty();
    setWeights((prev) => ({ ...prev, [key]: value }));
  };

  const save = useMutation({
    mutationFn: async () => {
      setSaveError(null);
      setSaveNote(null);
      const threshold = Number(draft['ops.recommendationScoreThreshold']);
      const investorLimit = Number(draft['ops.investorRecommendationLimit']);
      const innovatorLimit = Number(draft['ops.innovatorRecommendationLimit']);
      const blend = Number(draft['ai.matchmakingBlendWeight']);
      const temperature = Number(draft['ai.javTemperature']);
      if (!Number.isFinite(threshold) || threshold < 0 || threshold > 100) {
        throw new Error('Threshold must be a number between 0 and 100');
      }
      if (
        !Number.isFinite(investorLimit) ||
        investorLimit < 1 ||
        investorLimit > 500
      ) {
        throw new Error('Investor match count must be between 1 and 20');
      }
      if (
        !Number.isFinite(innovatorLimit) ||
        innovatorLimit < 1 ||
        innovatorLimit > 500
      ) {
        throw new Error('Innovator match count must be between 1 and 20');
      }
      if (!Number.isFinite(blend) || blend < 0 || blend > 1) {
        throw new Error('AI blend weight must be a number between 0 and 1');
      }
      if (!Number.isFinite(temperature) || temperature < 0 || temperature > 1) {
        throw new Error('Temperature must be a number between 0 and 1');
      }

      const parsedTagThresholds: Record<TagCategoryKey, number> = {
        challenge: 0,
        solution: 0,
        geography: 0,
        commercial: 0,
        stage: 0,
        ticket: 0,
      };
      for (const key of TAG_CATEGORY_KEYS) {
        const n = Number(tagThresholds[key]);
        if (!Number.isFinite(n) || n < 0 || n > 100) {
          throw new Error(
            `${TAG_CATEGORY_LABELS[key]} threshold must be 0–100`,
          );
        }
        parsedTagThresholds[key] = n;
      }

      const parsedWeights: Record<TagCategoryKey, number> = {
        challenge: 0,
        solution: 0,
        geography: 0,
        commercial: 0,
        stage: 0,
        ticket: 0,
      };
      let weightSum = 0;
      for (const key of TAG_CATEGORY_KEYS) {
        const n = Number(weights[key]);
        if (!Number.isFinite(n) || n < 0 || n > 1) {
          throw new Error(`${TAG_CATEGORY_LABELS[key]} weight must be 0–1`);
        }
        parsedWeights[key] = n;
        weightSum += n;
      }
      if (Math.abs(weightSum - 1) > 0.001) {
        throw new Error(
          `Tag category weights must sum to 1.0 (currently ${weightSum.toFixed(3)})`,
        );
      }

      await apiFetch('/settings/integrations', {
        method: 'PUT',
        token: getAccessToken(),
        body: JSON.stringify({
          values: [
            {
              key: 'ops.recommendationScoreThreshold',
              value: threshold,
            },
            {
              key: 'ops.investorRecommendationLimit',
              value: Math.round(investorLimit),
            },
            {
              key: 'ops.innovatorRecommendationLimit',
              value: Math.round(innovatorLimit),
            },
            {
              key: 'ops.tagCategoryThresholds',
              value: parsedTagThresholds,
            },
            {
              key: 'ai.matchmakingBlendWeight',
              value: blend,
            },
            {
              key: 'ai.pairScoringMethod',
              value:
                draft['ai.pairScoringMethod'] === 'jev_decisions'
                  ? 'jev_decisions'
                  : 'structured_json',
            },
            {
              key: 'ai.includeOnboardingInProfile',
              value:
                draft['ai.includeOnboardingInProfile'] === 'true' ||
                draft['ai.includeOnboardingInProfile'] === '1',
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
          ],
        }),
      });

      await apiFetch('/matchmaking/rules/default/weights', {
        method: 'PUT',
        token: getAccessToken(),
        body: JSON.stringify(parsedWeights),
      });
    },
    onSuccess: () => {
      setDirty(false);
      setSaveNote('AI fine-tune settings saved. Re-run scoring to apply.');
      void qc.invalidateQueries({ queryKey: ['settings-ai-matchmaking'] });
      void qc.invalidateQueries({ queryKey: ['settings'] });
      void qc.invalidateQueries({ queryKey: ['integrations-health-ai'] });
      void qc.invalidateQueries({ queryKey: ['matchmaking-default-rule'] });
    },
    onError: (err: Error) => {
      setSaveError(err.message || 'Failed to save AI fine-tune settings');
    },
  });

  const resetPrompts = () => {
    markDirty();
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
    const thresholdField = aiFields?.find(
      (f) => f.key === 'ops.tagCategoryThresholds',
    );
    const raw =
      thresholdField?.value !== undefined &&
      thresholdField?.value !== null &&
      thresholdField?.value !== ''
        ? thresholdField.value
        : thresholdField?.envDefault;
    setTagThresholds(parseTagThresholds(raw));
    setWeights(parseWeights(ruleConfig.data?.weights));
  };

  const weightSum = TAG_CATEGORY_KEYS.reduce(
    (sum, key) => sum + (Number(weights[key]) || 0),
    0,
  );

  return (
    <Card className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2">
          <h2 className="text-lg font-semibold">Fine-tune AI</h2>
          {dirty ? <Badge variant="warning">Unsaved</Badge> : null}
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
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
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
            </label>

            <label className="space-y-1 text-sm">
              <span className="text-[var(--muted)]">
                Investor match count (1–500)
              </span>
              <Input
                type="number"
                min={1}
                max={500}
                step={1}
                value={draft['ops.investorRecommendationLimit']}
                disabled={disabled || save.isPending}
                onChange={(e) =>
                  setField('ops.investorRecommendationLimit', e.target.value)
                }
              />
            </label>

            <label className="space-y-1 text-sm">
              <span className="text-[var(--muted)]">
                Innovator match count (1–500)
              </span>
              <Input
                type="number"
                min={1}
                max={500}
                step={1}
                value={draft['ops.innovatorRecommendationLimit']}
                disabled={disabled || save.isPending}
                onChange={(e) =>
                  setField('ops.innovatorRecommendationLimit', e.target.value)
                }
              />
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
            </label>

            <label className="space-y-1 text-sm">
              <span className="text-[var(--muted)]">Pair scoring method</span>
              <Select
                value={draft['ai.pairScoringMethod']}
                disabled={disabled || save.isPending}
                onChange={(e) =>
                  setField('ai.pairScoringMethod', e.target.value)
                }
              >
                <option value="structured_json">
                  structured_json (score + rationale)
                </option>
                <option value="jev_decisions">jev_decisions (legacy)</option>
              </Select>
            </label>

            <label className="space-y-1 text-sm">
              <span className="text-[var(--muted)]">Richer AI profiles</span>
              <Select
                value={
                  draft['ai.includeOnboardingInProfile'] === 'true' ||
                  draft['ai.includeOnboardingInProfile'] === '1'
                    ? 'true'
                    : 'false'
                }
                disabled={disabled || save.isPending}
                onChange={(e) =>
                  setField('ai.includeOnboardingInProfile', e.target.value)
                }
              >
                <option value="true">On — include onboarding text</option>
                <option value="false">Off — tags only</option>
              </Select>
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

          <div className="space-y-2 rounded-xl border border-[var(--border)] bg-[var(--surface-2)] p-3">
            <h3 className="text-sm font-semibold">Tag category thresholds</h3>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {TAG_CATEGORY_KEYS.map((key) => (
                <label key={`th-${key}`} className="space-y-1 text-sm">
                  <span className="text-[var(--muted)]">
                    {TAG_CATEGORY_LABELS[key]}
                  </span>
                  <Input
                    type="number"
                    min={0}
                    max={100}
                    step={5}
                    value={tagThresholds[key]}
                    disabled={disabled || save.isPending}
                    onChange={(e) => setTagThreshold(key, e.target.value)}
                  />
                </label>
              ))}
            </div>
          </div>

          <div className="space-y-2 rounded-xl border border-[var(--border)] bg-[var(--surface-2)] p-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h3 className="text-sm font-semibold">Tag category weights</h3>
              <Badge
                variant={Math.abs(weightSum - 1) < 0.001 ? 'success' : 'warning'}
              >
                Sum {weightSum.toFixed(2)}
              </Badge>
            </div>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {TAG_CATEGORY_KEYS.map((key) => (
                <label key={`wt-${key}`} className="space-y-1 text-sm">
                  <span className="text-[var(--muted)]">
                    {TAG_CATEGORY_LABELS[key]}
                  </span>
                  <Input
                    type="number"
                    min={0}
                    max={1}
                    step={0.05}
                    value={weights[key]}
                    disabled={disabled || save.isPending}
                    onChange={(e) => setWeight(key, e.target.value)}
                  />
                </label>
              ))}
            </div>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <label className="space-y-1 text-sm">
              <span className="text-[var(--muted)]">
                Matchmaking model id (Qwen)
              </span>
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
            </label>
          </div>

          <label className="block space-y-1 text-sm">
            <span className="text-[var(--muted)]">System prompt</span>
            <Textarea
              rows={12}
              value={draft['ai.matchmakingPrompt']}
              disabled={disabled || save.isPending}
              onChange={(e) => setField('ai.matchmakingPrompt', e.target.value)}
              placeholder={DEFAULT_MATCHMAKING_PROMPT}
              className="font-mono text-xs"
            />
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
              placeholder={DEFAULT_MATCHMAKING_USER_TEMPLATE}
              className="font-mono text-xs"
            />
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
