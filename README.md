# PreventAI

Personalized preventive health platform. A four-agent clinical pipeline in
Python, a React frontend, and AWS Amplify for auth, data and hosting.

```
┌────────────────────────┐          ┌──────────────────────────────┐
│  React + Vite          │   HTTPS  │  Agent service (FastAPI)     │
│  Amplify Hosting       │ ───────▶ │  Python 3.12 Lambda          │
│                        │          │  behind a Function URL       │
│  • patient dashboards  │          │                              │
│  • clinician desk      │ ◀─────── │  1. Risk                     │
│  • live pipeline trace │          │  2. Plan Generation          │
└───────────┬────────────┘          │  3. Personalization          │
            │                       │  4. Safety  (gate)           │
            │                       └──────────────────────────────┘
            │ Amplify (Cognito / AppSync / DynamoDB)
            ▼
   auth · profiles · plans · appointments · records
```

Everything above deploys from one repo: a push to GitHub builds the frontend
**and** provisions Cognito, AppSync and the agent Lambda. See
[DEPLOY.md](DEPLOY.md).

The agents used to run in the browser as a chain of `if`/`else` blocks. They now
run as a typed, tested Python service — so the clinical logic can be reviewed,
versioned and tested on its own, and the same pipeline can serve a mobile client
or a batch job later. Amplify keeps doing what it is good at: identity, data and
hosting.

## Deploy to AWS

Push to GitHub, connect the repo in the Amplify console, done. The agent
Lambda's URL is published into `amplify_outputs.json` at deploy time and the
frontend picks it up — nothing to configure by hand.

Full walkthrough, including CDK bootstrap and service-role permissions:
**[DEPLOY.md](DEPLOY.md)**.

## Run locally

```bash
npm install
npm run sandbox       # builds the Lambda bundle, then provisions the backend
npm run dev           # http://localhost:5173
```

`npm run sandbox` deploys the agent Lambda too, so the local frontend talks to
the deployed service. To run the agents on your own machine instead:

```bash
cd backend && pip install -r requirements-dev.txt && uvicorn app.main:app --reload
echo 'VITE_AGENT_SERVICE_URL=http://localhost:8000' > .env.local
```

The agent service needs no API key — it runs on its deterministic rules out of
the box.

## The four agents

| # | Agent | Input | Output |
|---|---|---|---|
| 1 | **Risk** | Patient snapshot | Four risk scores, ranked contributing factors with rationales, confidence, plain-language explanation |
| 2 | **Plan Generation** | Snapshot + risk | Ranked actions across lifestyle / screening / behavioural / adherence, each with expected impact |
| 3 | **Personalization** | Snapshot + plan | The same plan adapted to constraints and preferences, every change recorded |
| 4 | **Safety** | Snapshot + plan | `SafetyReport` — pass/fail, issues by severity, blocked and adapted actions, escalation flag |

Safety runs last and its verdict is final. Nothing downstream can clear a
critical finding, and a plan that fails the screen is saved as `draft` rather
than `pending_review`, so it cannot be mistaken for something a clinician has
looked at.

Full design notes, including why the ordering and the overlap discount work the
way they do: [`backend/README.md`](backend/README.md).

## Hybrid reasoning

Rules are the clinical ground truth; the LLM is optional and may only touch
prose. It cannot change a score, add an action, or overturn a safety verdict.
With no key configured the pipeline is fully functional and fully
deterministic — the same input always produces the same plan.

```bash
# optional
PREVENTAI_LLM_PROVIDER=anthropic
PREVENTAI_ANTHROPIC_API_KEY=sk-ant-...
```

## The frontend

**The idea.** The pipeline's fourth agent is a gate that can reject what the
first three proposed, so the interface is composed around that: the four agents
read left to right and the safety agent is the only one drawn as a barrier.
Nothing in the diagram is decorative — the core's size is the risk score, the
payload count is the number of actions, and a rejected payload is an action the
safety agent genuinely removed.

**`AgentPipeline`** pairs that scene with the trace beneath it: which agent is
working, what each concluded, how long it took, whether the LLM was involved,
and exactly what was removed and why. The scene is the dramatic reading, the
trace is the auditable one, and neither depends on the other.

**`LiveRiskDemo`** on the landing page is the one live thing: move a value and
the real Risk agent scores it, listing the factors it actually fired. It posts
to `/v1/risk`, which stores nothing and therefore needs no session.

**`PipelineDiagram`** draws it flat, in SVG. Nothing loops or idles; the only
movement is the stage highlight while a run is in flight and the gate closing
when something has been rejected.

**Clinician-ordered assessments.** A clinician can run the same four agents
against a patient from that patient's detail page. The plan comes back stamped
with the clinician and lands in their review queue; the service authorises it
(a patient may assess only themselves, a clinician may assess anyone).

**Theme.** Light clinical: an off-white ground, soft rounded panels separated
by elevation, one green accent and generous space. Two colour systems are kept
apart deliberately — the green *accent* is the system voice (buttons, focus,
the product) and the green→amber→orange→red *risk ramp* is the clinical voice,
in different hues so a button can never read as a risk level.

Tokens live in `src/index.css`; Tailwind reads them rather than redefining
them, so a colour or type step is decided in exactly one place and all sixteen
screens inherit it. The logo is vector (`src/components/Logo.tsx`) in two
forms: the full seal where the brand is the subject, and the mark alone where
it has to survive 24px.

## Project layout

```
backend/              Agent service (FastAPI, pytest, Dockerfile)
  app/agents/         The four agents + orchestrator
  app/knowledge/      Clinical rules as reviewable data tables
  app/llm/            Optional enrichment
  lambda_handler.py   Mangum adapter — the Lambda entry point
  tests/              58 tests

amplify/
  agents/resource.ts  Agent Lambda + Function URL (CDK)
  auth, data          Cognito + AppSync/DynamoDB
  backend.ts          Wires all three, publishes the service URL

scripts/
  build-agent-bundle.mjs   Vendors Python deps into the Lambda package

src/
  lib/agent-service.ts  Typed client + snapshot builder
  lib/ai-agents.ts      Façade used by the UI
  lib/aws-api-client.ts Amplify auth/data + persistence of agent results
  components/AgentPipeline.tsx
  pages/patient/        Overview, plan, risk trajectory, wearables, care
  pages/clinician/      Patients, risk monitor, plans review, analytics, care desk

```

## Features

**Patient** — risk trajectory and overview, AI prevention plans with adherence
tracking, wearables, care and records (book appointment slots, prescriptions,
symptom notes, care plans).

**Clinician** — patient list, risk monitor, plans review, analytics, and a care
desk for publishing slots, accepting or declining appointments, and writing
notes, prescriptions and care plans.

### Appointment flow

1. Doctor → Care Desk → date → select times → **Publish slots**
2. Patient → Care & Records → clinician + date → open slot → request
3. Doctor → Accept / Decline
4. Doctor adds notes, prescription, care plan
5. Patient sees them under Care & Records

One patient per slot (`DoctorSlot.isBooked`).

## Checking the APIs

There are two API layers and they are checked differently.

### 1. The agent service (FastAPI) — checkable from outside

```bash
npm run check:api                        # localhost:8000
npm run check:api -- <function-url>      # a deployed Function URL
```

With no argument it reads `custom.agentServiceUrl` from
`amplify_outputs.json`, so after a sandbox or a deploy it finds the real
service on its own.

Each check exercises a real code path rather than pinging a port. The
assessment case sends a pregnant patient on insulin, which the Safety agent
*must* reject — so a pass means the gate is working, not just that the
endpoint returned 200.

```
  GET  /v1/health                 PASS  v4.0.0 · 4 agents · LLM off (rules only)
  GET  /v1/agents                 PASS  risk → plan_generation → personalization → safety
  POST /v1/risk                   PASS  risk 38.9% (moderate) · 6 factors
  POST /v1/assessment             PASS  4 agents ran · 6 actions kept · 1 rejected
  POST /v1/assessment (bad input) PASS  rejected age 900 with 422
```

Exit code is 0 when everything passed and 1 otherwise, so it works in CI. A
failing run prints where to look.

A single endpoint, without the script:

```bash
curl https://<id>.lambda-url.<region>.on.aws/v1/health
```

**Once Cognito auth is on**, `/v1/assessment` returns 401 from the script —
that is correct, because it persists a plan and so requires a signed-in user.
`/health`, `/agents` and `/risk` still pass. Test assessment from the app.

### 2. Amplify Data (AppSync + DynamoDB) — checked signed in

These are GraphQL operations behind Cognito, so there is nothing useful to
curl. Three ways, cheapest first:

- **Use the app.** Sign in, open the browser console, and watch for failures
  as you move between pages. Every data call logs its error.
- **Browser console**, on a page where you are signed in:

  ```js
  const { generateClient } = await import('aws-amplify/data');
  const client = generateClient();
  await client.models.Profile.list();        // one model
  await client.models.PreventionPlan.list();
  ```

  An empty `data: []` with no `errors` means the API works and you simply have
  no rows. An `errors` array with `Unauthorized` means auth, not the API.
- **AppSync console** → your API → **Queries**, which runs authenticated
  queries against the live schema.

The 15 models in `amplify/data/resource.ts` are all exercised by the app:
Profile, RiskScore, PreventionPlan, PlanAction, AdherenceLog, WearableDevice,
WearableReading, Notification, AgentActivity, Feedback, DoctorSlot,
Appointment, SymptomNote, Prescription and CarePlanDocument.

## Tests

```bash
cd backend && pytest && ruff check app tests   # 61 tests
npm run typecheck
npm run lint
npm run check:agents        # is the deployed service up, and do all four run?
```

`check:agents` resolves the service URL from `amplify_outputs.json` (or takes
one as an argument) and exercises health, the agent list, risk scoring, a full
assessment and input validation. Point it at the Amplify Hosting domain by
mistake and it says so rather than failing with a parse error.

## Version

**4.0.0** — agents extracted to a Python service with a hybrid rules + LLM
architecture, deployed as a Lambda from the same Amplify backend.
