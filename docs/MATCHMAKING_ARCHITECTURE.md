# Matchmaking Architecture

| | |
| --- | --- |
| **Document** | Matchmaking architecture diagram |
| **Product** | Ethara Event Matchmaking |
| **Audience** | Clients, product owners, developers |
| **Related** | [System flows](./SYSTEM_FLOWS.md) · [Architecture](./ARCHITECTURE.md) |

---

## Overview

Matchmaking has four layers:

1. **Inputs** — who can be matched and under which rules  
2. **Scoring** — how strong each client–guest fit is (0–100)  
3. **Scheduling** — when those pairs meet  
4. **Outputs** — candidates, draft meetings, then published confirmed meetings  

Deterministic tag scoring always runs. **AI is optional** and only adjusts the final score.

---

## Architecture diagram

![Matchmaking architecture](./matchmaking-architecture.png)

*Source: [`matchmaking-architecture.mmd`](./matchmaking-architecture.mmd) · PNG: [`matchmaking-architecture.png`](./matchmaking-architecture.png)*

<details>
<summary>Mermaid source (editable)</summary>

```mermaid
flowchart TB
  subgraph inputs [1. Inputs]
    Clients[Eligible clients<br/>verified + matching eligible]
    Guests[Eligible guests<br/>verified + onboarding complete]
    Filters[Filters / tags<br/>+ equivalences]
    Weights[Matching weights<br/>capability industry geography…]
    Config[Run config<br/>date · time · duration · useAi]
  end

  subgraph scoring [2. Scoring engine]
    Pair[All client × guest pairs]
    Expand[Expand tags with equivalences]
    Dims[Six dimension scores]
    Det[Deterministic score 0–100]
    AI{useAi?}
    Sem[AI / local semantic similarity]
    Blend[Blended final score]
    CandRow[MatchCandidate<br/>score · breakdown · explanation]
  end

  subgraph schedule [3. Scheduling engine]
    Rank[Sort eligible pairs by score]
    Slots[Build daily slots<br/>buffers · breaks]
    Greedy[Greedy placement<br/>no double-booking]
  end

  subgraph outputs [4. Outputs]
    Preview[Preview<br/>proposed meetings]
    Publish[Admin publishes]
    Confirmed[Confirmed meetings]
    Notify[Notifications / emails]
  end

  Clients --> Pair
  Guests --> Pair
  Filters --> Expand
  Weights --> Dims
  Config --> AI
  Config --> Slots

  Pair --> Expand --> Dims --> Det --> AI
  AI -->|Yes| Sem --> Blend --> CandRow
  AI -->|No| CandRow
  Det -.-> CandRow

  CandRow --> Rank --> Slots --> Greedy
  Greedy --> Preview --> Publish --> Confirmed --> Notify
```

</details>

---

## Component view (code)

```mermaid
flowchart LR
  UI[Admin Matchmaking UI<br/>apps/web] --> API[MatchmakingService<br/>apps/api]
  API --> DomainScore["calculateMatchScore<br/>packages/domain"]
  API --> DomainSched["scheduleGreedy<br/>packages/domain"]
  API --> Filters[FiltersService<br/>equivalences]
  API --> AI[AiService<br/>optional]
  API --> DB[(PostgreSQL<br/>candidates · meetings)]
  DomainScore --> Shared[Weights schema<br/>packages/shared]
```

---

## Scoring dimensions

| Dimension | Default weight | Compares |
| --- | --- | --- |
| Capability | 30% | Client needs ↔ guest capabilities |
| Industry | 20% | Industry alignment |
| Requirements | 20% | Needs ↔ guest categories / capabilities |
| Geography | 10% | Venues / locations |
| Commercial | 10% | Partnership tags |
| Preferences | 10% | Preferred categories ↔ guest categories |

Optional AI blend (default ~30% of final score when enabled):

```text
finalScore = (1 − blendWeight) × tagScore + blendWeight × aiScore
```

---

## Data flow summary

| Step | Input | Output |
| --- | --- | --- |
| 1 | Approved profiles + filters | Pair list |
| 2 | Tags + weights (+ AI text) | Scored candidates |
| 3 | Candidates + time window | Proposed meetings in slots |
| 4 | Admin publish | Confirmed meetings + notifications |

---

## How to use / regenerate

- **Share with client:** attach or embed `docs/matchmaking-architecture.png`.
- **Regenerate PNG** after editing the `.mmd` file:

```bash
npx @mermaid-js/mermaid-cli -i docs/matchmaking-architecture.mmd -o docs/matchmaking-architecture.png -b white -s 2
```
