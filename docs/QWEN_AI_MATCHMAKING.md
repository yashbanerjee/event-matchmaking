# Qwen AI Matchmaking — How It Works

| | |
| --- | --- |
| **Document title** | Qwen AI scoring and descriptions |
| **Product** | Ethara Event Matchmaking |
| **Audience** | Investors, product owners, and developers |
| **Related** | [System flows](./SYSTEM_FLOWS.md) · [Matchmaking architecture](./MATCHMAKING_ARCHITECTURE.md) |

---

## 1. What Qwen is

**Qwen** is the platform’s matchmaking LLM (default model: `qwen/qwen-2.5-72b-instruct` via OpenRouter today; **self-hosted vLLM / LiteLLM** later via the same OpenAI-compatible base URL).

**Recommended setup:**

| Admin setting | Value |
| --- | --- |
| OpenRouter API key | Your `sk-or-v1-…` key |
| API base URL | `https://openrouter.ai/api/v1` (or your server `/v1`) |
| Matchmaking model id | `qwen/qwen-2.5-72b-instruct` (or another Qwen / open chat model) |
| Pair scoring method | **`structured_json`** — JSON `score` + **`rationale`** (2–3 sentences) |
| Matchmaking system prompt | Tune scoring rules (editable in Admin → Settings) |
| Matchmaking user message template | `{{investorProfile}}` / `{{innovatorProfile}}` placeholders |
| Include onboarding in profile text | On — sends form answers to the model |

Legacy **Jev Decisions** (`jev_decisions`) only returns tier labels (e.g. “Strong fit…”), not bespoke summaries. Ethara does **not** use JAV as the product AI — scoring runs on **Qwen**.

Qwen does **not** replace the normal tag-based matching. It adds an extra opinion:

> “How strong is the fit between this investor and this innovator for a short Ethara networking meeting?”

That opinion becomes:

- an **AI score** (shown as 0–100)
- a short **description** (why the model thinks they fit)

Those values appear in **Admin → Recommendations** and, when AI is enabled on a run, inside matchmaking candidate explanations.

---

## 2. What problem it solves

Tag matching answers: *Do their categories, services, venues, and commercial tags overlap?*

Qwen answers: *Given the full story in their profiles (about text, focus events, goals), does a meeting look valuable?*

Together they produce a fairer ranking:

| Layer | Role |
| --- | --- |
| Rule / tag score | Transparent, repeatable fit from structured Ethara fields |
| Qwen AI score | Semantic / judgment fit from full profile narratives |
| Final score | Blend of both (default: mostly rules, partly AI) |

---

## 3. End-to-end flow (plain language)

1. Investor and innovator complete the **Ethara onboarding form** and are approved.
2. The system builds a short **text profile** for each side (industry, about, focus events, categories, capabilities, venues, commercial tags).
3. The **rule engine** scores the pair on six dimensions (capability, industry, requirements, geography, commercial, preferences) → **rule score 0–100**.
4. If AI is enabled, **Qwen** reads both profiles and returns a fit rating plus a short reason → **AI score 0–100** and **description**.
5. The platform **blends** the two scores into a **final score**.
6. Higher final scores rank higher for recommendations and for automatic meeting scheduling.

```text
Rule score (tags)  ──┐
                     ├──►  Final score  ──►  Ranking / scheduling
Qwen AI score      ──┘
         │
         └──►  Description (shown to admin)
```

---

## 4. How the AI score is calculated

### 4.1 Default mode: structured JSON via Qwen (`ai.pairScoringMethod = structured_json`)

This is the recommended mode.

**Step A — Build profile text**

For each organization the system concatenates fields such as:

- About the organization  
- Focus Ethara events / work  
- Industry  
- Categories  
- Capabilities / services  
- Venues / locations  
- Commercial / partnership tags  

**Step B — Ask Qwen for a scored match**

The platform calls the OpenAI-compatible **chat completions** API (OpenRouter or self-hosted) with:

- Matching instructions (system prompt)
- Investor profile text
- Innovator profile text
- Instructions to return JSON: `{ "score": 0–100, "rationale": "…" }`

**Step C — Qwen returns score + rationale**

| Field | Meaning |
| --- | --- |
| **score** | Fit rating from **0–100** |
| **rationale** | Short 2–3 sentence reason stored as the AI description |

**Important:** This is a **fit rating**, not a statistical probability. Saying “75” means “strong meeting fit,” not “75% chance they will meet.”

### 4.2 Optional modes

Configured as `ai.matchmakingMode`:

| Mode | Behaviour |
| --- | --- |
| **llm** (default) | Qwen structured JSON score + rationale (as above) |
| **embedding** | Convert both profile texts to vectors; AI score = cosine similarity × 100 |
| **hybrid** | Average of embedding score and Qwen score |

Legacy `jev_decisions` maps a 0–4 tier to 0–100 and is kept only for older configs.

If the AI provider is unavailable, the system falls back to a simple local text overlap so demos still produce a number.

---

## 5. How the description is created

The **description** is the human-readable reason next to the AI score.

### When structured JSON / Qwen is used

1. Qwen returns `score` and `rationale`.
2. That `rationale` is stored as:
   - **`aiDescription`** on peer recommendations  
   - **`rationale`** inside the matchmaking candidate explanation  

**Example description**

> Strong commercial overlap on water treatment and clear shared interest in Gulf venue partnerships.

### If Qwen does not return a reason

The system uses, in order:

1. Rule-based match reasons (shared categories, capabilities, venues, and so on), or  
2. A generic line such as: `AI compatibility 75/100`

### What admins see

On **Recommendations**:

- **AI score** — the 0–100 Qwen value  
- **Description** — the short rationale  

On **Matchmaking** (when AI is enabled on the run):

- Candidate explanation includes both the rule explanation and an AI line, for example:  
  `AI boost (blend 0.3): 75 — Strong commercial overlap… → blended 68/100`

---

## 6. How the final score is blended

After the rule score and AI score exist:

```text
Final score =
  (1 − blendWeight) × Rule score
  + blendWeight × AI score
```

**Default blend weight = 0.3**

That means:

- **70%** from structured Ethara tag matching  
- **30%** from Qwen  

**Example**

| Component | Value |
| --- | ---: |
| Rule score | 60 |
| AI score | 80 |
| Blend weight | 0.3 |
| Final score | 0.7 × 60 + 0.3 × 80 = **66** |

You can change the blend in Admin settings (`ai.matchmakingBlendWeight`).  
`0` = rules only. `1` = AI only. Values between keep a mix.

---

## 7. Where Qwen is used in the product

| Place | What happens |
| --- | --- |
| **Admin → Recommendations** | Precomputed investor↔innovator rows with rule score, AI score, description, and total |
| **Admin → Matchmaking** | Optional “Use AI to boost matching” on a run; AI score blends into candidate totals before scheduling |
| **Discover / recommendations APIs** | Participants see ranked suggestions driven by the same preference + AI pipeline |

Qwen does **not** invent meetings by itself. Scheduling still uses the blended scores and the greedy slot engine (no double-booking, meeting length, day window).

---

## 8. Configuration (operators)

Under **Admin → Matchmaking → Fine-tune AI** (or Settings → AI):

| Setting | Solid default | Purpose |
| --- | --- | --- |
| AI enabled | on | Master switch |
| Pair scoring method | `structured_json` | JSON `score` + 2–3 sentence `rationale` |
| Matchmaking model id | `qwen/qwen-2.5-72b-instruct` | Qwen chat model on OpenRouter |
| Include onboarding in profile | on | Richer AI text from form answers (no personal contact) |
| Recommendation score threshold | **75** | Only strong matches on Recommendations (full list on Innovators) |
| AI blend weight | **0.3** | ~70% tags + 30% AI (keep ~0.25–0.35) |
| Tag category floors | challenge 25 / geography 20 / stage 15 | Hard requirements stay tag-gated |
| Matchmaking AI mode | `llm` | Model scores pairs |
| Water/climate system prompt | shipped default | Tune once for the event theme, then leave |
| OpenRouter API key | required | Authentication |

Approving a form submission or innovator **recomputes** peer recommendations so AI scores refresh automatically.

Without a valid API key, AI calls fail soft and the platform continues with rules (and/or local text fallback).

> **Note:** Some setting keys and env vars still use the historical `jav` / `JAV_AI_*` names in code. They configure the **Qwen** OpenRouter path — not a separate JAV product.

---

## 9. Summary for stakeholders

1. **Rules first** — Ethara categories, services, venues, and commercial tags create a clear baseline score.  
2. **Qwen second** — The model reads the full profiles and returns a 0–100 fit score plus a short reason.  
3. **Description** — That rationale explains the AI rating.  
4. **Blend** — Final ranking uses mostly rules, with a configurable share of AI.  
5. **Outcome** — Better ordering of who should meet whom, with explanations admins can show or audit.

---

## 10. Technical reference

| Item | Location |
| --- | --- |
| OpenAI-compatible provider (Qwen via OpenRouter) | `apps/api/src/integrations/ai/jav.provider.ts` |
| Structured JSON pair scoring | `apps/api/src/integrations/ai/pair-score-chat.ts` |
| AI orchestration | `apps/api/src/integrations/ai/ai.service.ts` |
| Default model + scoring prompt | `apps/api/src/integrations/ai/matchmaking-prompt.ts` |
| Matchmaking blend | `apps/api/src/matchmaking/matchmaking.service.ts` |
| Recommendations AI score / description | `apps/api/src/meetings/peer-recommendations.service.ts` |
| Settings catalog | `apps/api/src/settings/integration-settings.catalog.ts` |

**Core formulas**

```text
AI score ∈ [0, 100]   (from Qwen structured JSON)

Final score = (1 − blend) × Rule score + blend × AI score
```

**Description source**

```text
aiDescription = Qwen rationale
             OR rule-based reasons
             OR "AI compatibility {score}/100"
```
