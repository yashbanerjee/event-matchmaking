# JAV AI Matchmaking — How It Works

| | |
| --- | --- |
| **Document title** | JAV (Jev) AI scoring and descriptions |
| **Product** | Ethara Event Matchmaking |
| **Audience** | Clients, product owners, and developers |
| **Related** | [System flows](./SYSTEM_FLOWS.md) · [Matchmaking architecture](./MATCHMAKING_ARCHITECTURE.md) |

---

## 1. What JAV is

**JAV** is the platform’s AI provider for matchmaking and recommendations. In practice it uses **Jev** (model id such as `~typesafe/jev-latest`) through **OpenRouter**.

JAV does **not** replace the normal tag-based matching. It adds an extra opinion:

> “How strong is the fit between this client and this guest for a short Ethara networking meeting?”

That opinion becomes:

- an **AI score** (shown as 0–100)
- a short **description** (why the AI thinks they fit)

Those values appear in **Admin → Recommendations** and, when AI is enabled on a run, inside matchmaking candidate explanations.

---

## 2. What problem it solves

Tag matching answers: *Do their categories, services, venues, and commercial tags overlap?*

JAV answers: *Given the full story in their profiles (about text, focus events, goals), does a meeting look valuable?*

Together they produce a fairer ranking:

| Layer | Role |
| --- | --- |
| Rule / tag score | Transparent, repeatable fit from structured Ethara fields |
| JAV AI score | Semantic / judgment fit from full profile narratives |
| Final score | Blend of both (default: mostly rules, partly AI) |

---

## 3. End-to-end flow (plain language)

1. Client and guest complete the **Ethara onboarding form** and are approved.
2. The system builds a short **text profile** for each side (industry, about, focus events, categories, capabilities, venues, commercial tags).
3. The **rule engine** scores the pair on six dimensions (capability, industry, requirements, geography, commercial, preferences) → **rule score 0–100**.
4. If AI is enabled, **JAV** reads both profiles and returns a fit rating plus a short reason → **AI score 0–100** and **description**.
5. The platform **blends** the two scores into a **final score**.
6. Higher final scores rank higher for recommendations and for automatic meeting scheduling.

```text
Rule score (tags)  ──┐
                     ├──►  Final score  ──►  Ranking / scheduling
JAV AI score       ──┘
         │
         └──►  Description (shown to admin)
```

---

## 4. How the AI score is calculated

### 4.1 Default mode: LLM / Jev Decisions (`ai.matchmakingMode = llm`)

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

**Step B — Ask Jev a scored question**

JAV calls OpenRouter’s **Decisions** API with:

- Matching instructions (system prompt)
- Client profile text
- Guest profile text
- One question: how strong the match is for a short networking meeting

**Step C — Jev returns a level from 0 to 4**

| Jev level | Meaning |
| ---: | --- |
| **0** | Poor fit — little overlap in needs or categories |
| **1** | Weak fit — some overlap but limited meeting value |
| **2** | Moderate fit — clear shared interests worth exploring |
| **3** | Strong fit — strong commercial or category alignment |
| **4** | Excellent fit — highly complementary profiles; prioritize meeting |

**Step D — Convert to a 0–100 score**

```text
AI score (0–100) = (Jev level ÷ 4) × 100
```

**Examples**

| Jev level | Calculation | AI score shown |
| ---: | --- | ---: |
| 0 | 0 / 4 × 100 | 0 |
| 2 | 2 / 4 × 100 | 50 |
| 3 | 3 / 4 × 100 | 75 |
| 4 | 4 / 4 × 100 | 100 |

**Important:** This is a **fit rating**, not a statistical probability. Saying “75” means “strong fit (level 3 of 4)”, not “75% chance they will meet.”

### 4.2 Optional modes

Configured as `ai.matchmakingMode`:

| Mode | Behaviour |
| --- | --- |
| **llm** (default) | Jev Decisions score only (as above) |
| **embedding** | Convert both profile texts to vectors; AI score = cosine similarity × 100 |
| **hybrid** | Average of embedding score and Jev score |

If the AI provider is unavailable, the system falls back to a simple local text overlap so demos still produce a number.

---

## 5. How the description is created

The **description** is the human-readable reason next to the AI score.

### When Jev / LLM mode is used

1. Jev returns the 0–4 score.
2. The system maps that level to a short sentence (from Jev’s legend or from the fixed criteria table in section 4.1).
3. That sentence is stored as:
   - **`aiDescription`** on peer recommendations  
   - **`rationale`** inside the matchmaking candidate explanation  

**Example description**

> Strong fit — strong commercial or category alignment

### If Jev does not return a reason

The system uses, in order:

1. Rule-based match reasons (shared categories, capabilities, venues, and so on), or  
2. A generic line such as: `AI compatibility 75/100`

### What admins see

On **Recommendations**:

- **AI score** — the 0–100 JAV value  
- **Description** — the short rationale  

On **Matchmaking** (when AI is enabled on the run):

- Candidate explanation includes both the rule explanation and an AI line, for example:  
  `AI boost (jav, blend 0.3): 75 — Strong fit — strong commercial or category alignment → blended 68/100`

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
- **30%** from JAV  

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

## 7. Where JAV is used in the product

| Place | What happens |
| --- | --- |
| **Admin → Recommendations** | Precomputed client↔guest rows with rule score, AI score, description, and total |
| **Admin → Matchmaking** | Optional “Use AI to boost matching” on a run; AI score blends into candidate totals before scheduling |
| **Discover / recommendations APIs** | Participants see ranked suggestions driven by the same preference + AI pipeline |

JAV does **not** invent meetings by itself. Scheduling still uses the blended scores and the greedy slot engine (no double-booking, meeting length, day window).

---

## 8. Configuration (operators)

Under **Admin → Settings / Integrations** (AI group):

| Setting | Purpose |
| --- | --- |
| AI enabled | Master switch |
| Primary provider | Set to `jav` |
| OpenRouter API key | Authentication for Jev |
| Jev model id | Default `~typesafe/jev-latest` |
| Matchmaking AI mode | `llm` (recommended), `hybrid`, or `embedding` |
| AI blend weight | How much AI affects the final score (default 0.3) |
| Matchmaking system prompt | Optional instructions for how Jev should judge fit |
| Jev temperature | Lower = more stable scores (typical 0.2) |

Without a valid API key, AI calls fail soft and the platform continues with rules (and/or local text fallback).

---

## 9. Summary for stakeholders

1. **Rules first** — Ethara categories, services, venues, and commercial tags create a clear baseline score.  
2. **JAV second** — Jev reads the full profiles and rates the meeting fit on a 0–4 scale, shown as 0–100.  
3. **Description** — A short sentence explains that AI rating.  
4. **Blend** — Final ranking uses mostly rules, with a configurable share of AI.  
5. **Outcome** — Better ordering of who should meet whom, with explanations admins can show or audit.

---

## 10. Technical reference

| Item | Location |
| --- | --- |
| JAV provider (Decisions + embeddings) | `apps/api/src/integrations/ai/jav.provider.ts` |
| AI orchestration | `apps/api/src/integrations/ai/ai.service.ts` |
| Default scoring prompt | `apps/api/src/integrations/ai/matchmaking-prompt.ts` |
| Matchmaking blend | `apps/api/src/matchmaking/matchmaking.service.ts` |
| Recommendations AI score / description | `apps/api/src/meetings/peer-recommendations.service.ts` |
| Settings catalog | `apps/api/src/settings/integration-settings.catalog.ts` |

**Core formulas**

```text
Jev level ∈ {0, 1, 2, 3, 4}

AI score = (Jev level / 4) × 100

Final score = (1 − blend) × Rule score + blend × AI score
```

**Description source**

```text
aiDescription = Jev rationale / legend text
             OR rule-based reasons
             OR "AI compatibility {score}/100"
```
