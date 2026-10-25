# PreventAI Agent Service

The four clinical agents, as a standalone FastAPI service.

```
PatientSnapshot
      │
      ▼
┌─────────────┐   ┌──────────────────┐   ┌──────────────────┐   ┌─────────────┐
│ 1. Risk     │──▶│ 2. Plan          │──▶│ 3. Personalize   │──▶│ 4. Safety   │
│             │   │    Generation    │   │                  │   │   (gate)    │
└─────────────┘   └──────────────────┘   └──────────────────┘   └─────────────┘
   scores +          actions that           adapt to            block / adapt /
   factors +         answer those           constraints &       escalate; final
   explanation       factors                preferences         verdict
      │                   │                      │                    │
      └───────────────────┴──────────────────────┴────────────────────┘
                                    ▼
                    PipelineResult (risk, plan, safety, trace)
```

## Run it

```bash
cd backend
python -m venv .venv && source .venv/bin/activate
pip install -r requirements-dev.txt
uvicorn app.main:app --reload
```

Interactive docs at <http://localhost:8000/docs>.

```bash
pytest          # 54 tests
ruff check app tests
```

No API key, no AWS account, no configuration is needed to run or test it.

## Endpoints

| Method | Path | Purpose |
|---|---|---|
| `GET` | `/v1/health` | Version, LLM state, agent list |
| `GET` | `/v1/agents` | Pipeline description (drives the frontend trace UI) |
| `POST` | `/v1/assessment` | Run all four agents; returns plan + full trace |
| `POST` | `/v1/risk` | Risk scoring only — fast enough for a live what-if control |

```bash
curl -s localhost:8000/v1/assessment -H 'Content-Type: application/json' -d '{
  "patient": {
    "patient_id": "demo", "age": 58, "sex": "male",
    "systolic_bp": 152, "total_cholesterol": 244, "fasting_glucose": 118,
    "bmi": 31.2, "smoker": true, "activity_minutes_week": 40,
    "diet_quality": "poor", "constraints": ["vegetarian", "knee_injury"],
    "current_medications": ["warfarin 5mg"]
  }
}' | jq '.risk.overall_risk, .plan.actions[].title, .safety.passed'
```

## The four agents

### 1. Risk — `app/agents/risk.py`
Scores four tracks (CVD, diabetes, cancer, stroke) and rolls them into one
headline number. Scoring is **table-driven**: every threshold lives in
`app/knowledge/risk_rules.py` as a row with its points, the risks it feeds and
the reason it exists. The engine never changes; the table is what gets reviewed.

Two things the rules table buys you that an `if/else` chain does not:

- **Bands don't stack.** A 67-year-old matches the ≥45, ≥55 and ≥65 rules.
  Grouped rules collapse to the single highest match, so age is counted once.
- **Confidence is real.** Every clinical value left at its population default
  drops the assessment's confidence, so a score built on assumptions says so.

### 2. Plan Generation — `app/agents/plan.py`
Selects from the intervention catalogue (`app/knowledge/interventions.py`) and
ranks by how much of *this* patient's measured risk each action answers.

- The relevance bonus is **capped** and non-modifiable factors earn half credit.
  Without that, age — which feeds all four tracks — floats routine screening
  above blood-pressure control for a hypertensive patient.
- Expected reduction is **discounted for overlap**, not summed. Eight actions at
  face value would promise a reduction no prevention plan delivers.
- The plan is capped at 8 actions, because a plan nobody can follow reduces
  nothing.

### 3. Personalization — `app/agents/personalization.py`
Adapts each action to stated constraints and preferences, recording every
change on the action itself (`personalized`, `adaptations`).

The boundary that matters: this agent changes **how** an action is done, never
**whether** it is clinically indicated. It will swap running for swimming. It
will not drop the blood-pressure review because the patient would rather not.
Anything that would change clinical intent is the Safety agent's call.

### 4. Safety — `app/agents/safety.py`
A gate, and the last word. Rules in `app/knowledge/safety_rules.py` either
**block** an action (removed, reported, run escalated) or **adapt** it (kept,
with a safety caveat prepended).

Three deliberate properties:

- It runs **after** personalization, because personalization rewrites action
  text — a screen run earlier would be checking text that no longer exists.
- A blocked action is **reported**, not silently dropped.
- A plan stripped to nothing is a **failure**, not a pass.

## Hybrid reasoning

The deterministic core is always the clinical ground truth. The LLM layer is
optional enrichment and is structurally prevented from doing anything else:

| | Rules | LLM |
|---|---|---|
| Risk scores | ✅ | ❌ |
| Which actions are in the plan | ✅ | ❌ |
| Safety verdict (`passed`) | ✅ | ❌ |
| Explanations and summaries | ✅ fallback | ✅ may rewrite |

Enrichment runs only when a provider key is configured. If it times out, errors
or returns an unexpected shape, the agent returns its deterministic result and
marks the trace `degraded` — a provider outage cannot take down an assessment.
This is covered by tests (`test_enrichment_failure_degrades_instead_of_raising`,
`test_llm_cannot_overturn_a_safety_verdict`).

Enable it:

```bash
PREVENTAI_LLM_PROVIDER=anthropic
PREVENTAI_ANTHROPIC_API_KEY=sk-ant-...
pip install anthropic
```

## Auth

Off by default so the service runs locally with no AWS account. Set
`PREVENTAI_COGNITO_USER_POOL_ID` and every request must carry a valid Cognito
access token, verified against the pool's JWKS. A patient may only assess their
own record; members of the `clinician` or `doctor` group may assess anyone.

See `.env.example` for all settings.

## Layout

```
app/
├── main.py              FastAPI app, CORS, lifespan
├── config.py            Settings
├── schemas.py           Pydantic contracts — the wire format
├── security.py          Cognito JWT verification (opt-in)
├── api/routes.py        HTTP surface
├── agents/
│   ├── base.py          Agent ABC: tracing, timing, graceful degradation
│   ├── risk.py          Agent 1
│   ├── plan.py          Agent 2
│   ├── personalization.py  Agent 3
│   ├── safety.py        Agent 4
│   └── orchestrator.py  Sequencing + trace assembly
├── knowledge/           Clinical content as reviewable data tables
│   ├── risk_rules.py
│   ├── interventions.py
│   ├── personalization_rules.py
│   └── safety_rules.py
└── llm/                 Optional enrichment
    ├── client.py
    └── prompts.py
```

## Adding a rule

Clinical content lives in `knowledge/`; you should not need to touch an agent.

```python
# app/knowledge/risk_rules.py
RiskRule(
    code="SLEEP_APNEA",
    name="Diagnosed sleep apnoea",
    applies=lambda p: "sleep_apnea" in p.normalized_constraints(),
    points={"cvd": 7, "stroke": 6},
    describe=lambda p: "diagnosed",
    rationale="Untreated apnoea raises nocturnal blood pressure.",
)
```

Add a test alongside it in `tests/`, and the ranking, explanation and trace pick
it up automatically.
