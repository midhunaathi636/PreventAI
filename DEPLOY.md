# Deploying PreventAI to AWS

Everything deploys from one GitHub repo. No local setup is required — you can
do all of this from the browser.

```
GitHub push
     │
     ▼
Amplify Hosting build
     ├── backend phase  → Cognito · AppSync/DynamoDB · Agent Lambda + Function URL
     └── frontend phase → React build, reading amplify_outputs.json
```

The agent service's URL is written into `amplify_outputs.json` as
`custom.agentServiceUrl` during the backend phase, and the frontend reads it
from there. **There is no environment variable to set by hand.**

---

## 1. Push the code to GitHub

Create an empty repository on GitHub, then upload this project to it. Either
drag the unzipped folder into GitHub's web uploader, or:

```bash
git init
git add .
git commit -m "PreventAI v4 — four-agent pipeline on Amplify"
git branch -M main
git remote add origin https://github.com/<you>/preventai.git
git push -u origin main
```

`.gitignore` already excludes `node_modules/`, `amplify_outputs.json` and the
generated Lambda bundle — all three are produced during the build.

## 2. Bootstrap CDK once per account and region

Amplify Gen 2 deploys through CDK, which needs a one-time bootstrap. The
Amplify console offers to do this for you on first connect. If you would
rather run it yourself (requires the AWS CLI):

```bash
npx aws-cdk@latest bootstrap aws://<ACCOUNT_ID>/<REGION>
```

Skipping this is the single most common cause of a first deploy failing.

## 3. Connect the repo in the Amplify console

1. AWS Console → **AWS Amplify** → **Create new app** → **GitHub**
2. Authorise AWS to read the repository, pick it and the `main` branch
3. Amplify detects `amplify.yml`; leave the build settings as they are
4. Under **Advanced settings → Service role**, let Amplify create one, or pick
   a role that can deploy the backend (see §4)
5. **Save and deploy**

The first build takes roughly 10–15 minutes, most of it provisioning Cognito
and AppSync. Later builds are far quicker.

## 4. Add the SPA rewrite rule (one time)

**Do this or deep links will 404.** Opening `https://…/patient/my-plan`
directly asks the host for a file that does not exist; only `/` does. Amplify
must be told to serve the app shell for unknown paths.

Amplify console → your app → **Hosting → Rewrites and redirects** → **Add
rule**:

| Source | Target | Type |
|---|---|---|
| `/<*>` | `/index.html` | `200 (Rewrite)` |

Leave it below any existing asset rules. This is a console setting; it cannot
be committed to the repo, which is why it is a manual step.

Until you add it, the build still emits a `404.html` copy of the shell as a
safety net, so deep links load the app rather than showing an error page — but
they return a 404 status, so add the rule properly.

## 5. Service role permissions

The Amplify service role needs to create the backend resources, which now
includes a Lambda. If you let Amplify create the role it is handled for you.
For an existing role, it needs `AmplifyBackendDeployFullAccess` or an
equivalent policy covering CloudFormation, Cognito, AppSync, DynamoDB, IAM
role creation, Lambda and CloudWatch Logs.

Symptom of a role that is too narrow: the frontend builds fine and the app
loads, but the backend phase fails and `amplify_outputs.json` is never
generated.

## 6. Check the deploy

Open the Amplify app URL and:

1. Sign up as a patient
2. Go to the overview page and press **Run AI Assessment**
3. You should see the four agents step through with real timings

To check the agent service directly, find the Function URL in the Amplify
build log (or Lambda console → the `AgentService` function → Function URL):

```bash
curl https://<id>.lambda-url.<region>.on.aws/v1/health
```

It should return the version, the four agent names, and `llm_enabled: false`.

---

## How the agent service is deployed

Defined in [`amplify/agents/resource.ts`](amplify/agents/resource.ts) and wired
up in [`amplify/backend.ts`](amplify/backend.ts).

| | |
|---|---|
| Runtime | Python 3.12, x86_64 |
| Entry point | `lambda_handler.handler` — the FastAPI app through Mangum |
| Memory / timeout | 1024 MB / 30s |
| Invocation | Function URL (no API Gateway) |
| Auth | Cognito JWT verified inside the function |
| Logs | CloudWatch, JSON format, 14-day retention |

**Why a Function URL rather than API Gateway.** One known origin calls this
service, and the service already verifies Cognito tokens itself. API Gateway
would add a second place to configure the same rule, plus its own cost.

**Why `authType: NONE` is not "unauthenticated".** It means the *Function URL*
does not require SigV4. Every request is still checked against the Cognito
pool inside the function, and a patient can only assess their own record. IAM
auth would force the browser to SigV4-sign requests, which is the wrong tool
when the client already holds a Cognito access token.

**Why CORS is configured in the app, not on the Function URL.** A Function URL
with its own `cors` block applies headers at the edge *in addition to* what the
application returns, so the browser receives two
`access-control-allow-origin` values and rejects the response. FastAPI's
CORSMiddleware owns CORS outright, which also means behaviour is identical
locally and deployed. Origins come from `PREVENTAI_CORS_ORIGINS`.

**One endpoint is public.** `POST /v1/risk` scores a snapshot sent in the
request body: it reads nothing, writes nothing, and returns only a score for
what the caller supplied, so the landing page's live demo can call it without a
session. `POST /v1/assessment`, which persists a plan against a patient
record, always requires a token. Turn the public one off with
`PREVENTAI_ALLOW_ANONYMOUS_RISK=false`.

**How the Python gets into the Lambda.** `scripts/build-agent-bundle.mjs`
vendors the dependencies into `backend/.lambda-bundle/`, which CDK uploads as
the code asset. It runs in the backend build phase before `ampx
pipeline-deploy`, because Amplify's build container has Python but not Docker.
Wheels are fetched for `manylinux2014_x86_64` / cp312 explicitly, so the bundle
is correct even if you build it on macOS or Windows.

## How a clinician is recognised (and how to harden it)

Sign-up records whether someone is a patient or a clinician in two places:
the `role` column on their Profile row, and the Cognito `custom:role` user
attribute. It does **not** put them in a Cognito group, even though the pool
defines `Patients` and `Clinicians`.

That matters for the agent service, which has to decide whether a caller may
run an assessment against someone else's record. It reads two claims:

| Claim | Set by | Can the user change it? |
|---|---|---|
| `cognito:groups` | an administrator | No |
| `custom:role` | sign-up | Yes — the attribute is mutable |

Groups win when present. Today none are assigned, so the role attribute is
what actually grants a clinician access. The frontend therefore sends the
**ID token**, since Cognito access tokens carry groups but no custom
attributes at all.

**To make this authoritative**, assign the Cognito group at sign-up with a
post-confirmation Lambda trigger that reads `custom:role` and calls
`AdminAddUserToGroup`. Once groups are populated the service prefers them
automatically — no code change needed — and a user editing their own
attribute no longer gains anything. Existing accounts need adding to their
group once, by hand or by a short script.

**A larger, separate issue.** `amplify/data/resource.ts` grants
`allow.authenticated().to(['read', 'update'])` on `Profile`, `RiskScore` and
`PreventionPlan`. Any signed-in user can therefore read or modify any
patient's record straight through AppSync, regardless of what the agent
service decides. Tightening that needs either owner-plus-group rules on each
model or a custom authorization resolver, and it is worth doing before this
handles anyone's real data.

## Cold starts

The first request after idle takes roughly 1.5–3s while Lambda loads the
runtime and builds the pipeline; warm requests are a few milliseconds. The
pipeline is cached per execution environment, which is why it is constructed
lazily rather than on ASGI lifespan — Lambda freezes the environment between
invocations.

If cold starts bother you in a demo, set provisioned concurrency to 1 on the
function, or press **Run AI Assessment** once before showing it to anyone.

## Optional: enable LLM enrichment

The pipeline runs fully on its deterministic rules with no key. To turn on the
enrichment layer:

1. Store the key in AWS Secrets Manager
2. Add `anthropic` (or `openai`) to `backend/requirements-lambda.txt`
3. Uncomment the `llm` block in `amplify/backend.ts`, passing the secret
   reference — never a literal key
4. Push

The LLM can only rewrite explanatory prose. It cannot change a risk score, add
an action, or overturn a safety verdict, and if the provider errors the agent
returns its deterministic result marked `degraded`.

## Optional: lock down CORS

`amplify/backend.ts` ships with `corsOrigins: ['*']`, because the Amplify
domain is not known at synthesis time. Once deployed, replace it with your
domain and push:

```ts
corsOrigins: ['https://main.d1234abcd.amplifyapp.com'],
```

The service authenticates by bearer token rather than cookies, so a wildcard
origin is not a credential-leak risk — but narrowing it is still worth doing.

## Costs

Within the AWS Free Tier for demo-level use: Lambda bills per request with 1M
free monthly, DynamoDB and Cognito have generous free tiers, and Amplify
Hosting charges for build minutes and bandwidth. The agent Lambda is only
invoked when someone presses **Run AI Assessment**.

## Tearing down

Delete the Amplify app in the console; it removes the CloudFormation stacks
including the agent Lambda. If you also used a local sandbox:

```bash
npm run sandbox:delete
```

---

## Running locally (optional)

Not required for deployment, but useful for development.

```bash
npm install
npm run sandbox         # builds the Lambda bundle, then provisions a sandbox
npm run dev
```

`npm run sandbox` deploys the agent Lambda too, so the local frontend talks to
the deployed service with no extra configuration. To run the agents on your own
machine instead, start uvicorn and point the frontend at it:

```bash
cd backend && pip install -r requirements-dev.txt && uvicorn app.main:app --reload
echo 'VITE_AGENT_SERVICE_URL=http://localhost:8000' > .env.local
```

That variable overrides the deployed URL, which is why it is the first thing to
remove when something works in the cloud but not locally.
