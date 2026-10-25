#!/usr/bin/env node
/**
 * Health check for the PreventAI agent service.
 *
 *   npm run check:api                      # http://localhost:8000
 *   npm run check:api -- <function-url>    # a deployed Lambda Function URL
 *
 * With no argument it reads `custom.agentServiceUrl` from
 * `amplify_outputs.json` when that file exists, so after `ampx sandbox` or a
 * deploy it checks the real service without being told where it is.
 *
 * Every check exercises a real code path rather than just pinging a port: the
 * assessment case deliberately sends a patient whose plan the safety agent
 * must reject, so a pass means the gate is actually working and not just
 * returning 200.
 *
 * Exits 0 when everything passed, 1 otherwise — so CI can run it.
 */

import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const TIMEOUT_MS = 40_000; // a cold Lambda can take a few seconds

const GREEN = '\x1b[32m';
const RED = '\x1b[31m';
const DIM = '\x1b[2m';
const YELLOW = '\x1b[33m';
const OFF = '\x1b[0m';

/**
 * Pointing this at the Amplify Hosting domain is the easy mistake: that host
 * serves the React app, so it answers with HTML and any JSON parse fails at
 * character 0. The agents are a Lambda on their own domain.
 */
function rejectHostingDomain(url) {
  if (!/amplifyapp\.com/i.test(url)) return;
  console.log(`\n${RED}That is the Amplify Hosting domain, not the agent service.${OFF}`);
  console.log(`${DIM}  ${url} serves the web app, so /v1/* returns HTML, not JSON.`);
  console.log('  The agent service is a Lambda at https://<id>.lambda-url.<region>.on.aws');
  console.log('  Find it in amplify_outputs.json (custom.agentServiceUrl), or in the');
  console.log(`  Lambda console under the AgentService function -> Function URL.${OFF}\n`);
  process.exit(1);
}

function resolveBaseUrl() {
  const fromArg = process.argv[2];
  if (fromArg) {
    const url = fromArg.replace(/\/+$/, '');
    rejectHostingDomain(url);
    return url;
  }

  if (process.env.VITE_AGENT_SERVICE_URL) {
    const url = process.env.VITE_AGENT_SERVICE_URL.replace(/\/+$/, '');
    rejectHostingDomain(url);
    console.log(`${DIM}Using VITE_AGENT_SERVICE_URL${OFF}`);
    return url;
  }

  try {
    const outputs = JSON.parse(readFileSync(resolve(ROOT, 'amplify_outputs.json'), 'utf8'));
    const url = outputs?.custom?.agentServiceUrl;
    if (typeof url === 'string' && url) {
      console.log(`${DIM}Using agentServiceUrl from amplify_outputs.json${OFF}`);
      return url.replace(/\/+$/, '');
    }
  } catch {
    /* not provisioned yet; fall through to localhost */
  }
  return 'http://localhost:8000';
}

const BASE = resolveBaseUrl();

async function call(path, init) {
  const started = Date.now();
  const response = await fetch(`${BASE}${path}`, {
    ...init,
    signal: AbortSignal.timeout(TIMEOUT_MS),
    headers: { 'Content-Type': 'application/json', ...(init?.headers ?? {}) },
  });
  const ms = Date.now() - started;
  let body = null;
  try {
    body = await response.json();
  } catch {
    /* non-JSON response */
  }
  return { status: response.status, ok: response.ok, body, ms };
}

/**
 * Each check returns a short line describing what it proved, or throws.
 * `expectStatus` lets a check assert a rejection is still working.
 */
const CHECKS = [
  {
    name: 'GET  /v1/health',
    proves: 'service is up and all four agents are registered',
    async run() {
      const { ok, status, body, ms } = await call('/v1/health');
      if (!ok) throw new Error(`HTTP ${status}`);
      const agents = body?.agents ?? [];
      const expected = ['risk', 'plan_generation', 'personalization', 'safety'];
      const missing = expected.filter((a) => !agents.includes(a));
      if (missing.length) throw new Error(`missing agents: ${missing.join(', ')}`);
      return `v${body.version} · ${agents.length} agents · LLM ${body.llm_enabled ? `on (${body.llm_provider})` : 'off (rules only)'} · ${ms}ms`;
    },
  },
  {
    name: 'GET  /v1/agents',
    proves: 'pipeline order is intact',
    async run() {
      const { ok, status, body, ms } = await call('/v1/agents');
      if (!ok) throw new Error(`HTTP ${status}`);
      const order = (body?.pipeline ?? []).map((a) => a.name);
      const expected = ['risk', 'plan_generation', 'personalization', 'safety'];
      if (order.join(',') !== expected.join(',')) {
        throw new Error(`wrong order: ${order.join(' → ') || 'empty'}`);
      }
      return `${order.join(' → ')} · ${ms}ms`;
    },
  },
  {
    name: 'POST /v1/risk',
    proves: 'the Risk agent scores and returns its factors',
    async run() {
      const { ok, status, body, ms } = await call('/v1/risk', {
        method: 'POST',
        body: JSON.stringify({
          patient: { patient_id: 'healthcheck', age: 61, smoker: true, systolic_bp: 150 },
        }),
      });
      if (status === 401) {
        throw new Error('401 — anonymous scoring is off (PREVENTAI_ALLOW_ANONYMOUS_RISK=false)');
      }
      if (!ok) throw new Error(`HTTP ${status}`);
      if (typeof body?.overall_risk !== 'number') throw new Error('no overall_risk in response');
      if (!body?.factors?.length) throw new Error('scored but returned no contributing factors');
      return `risk ${body.overall_risk}% (${body.risk_level}) · ${body.factors.length} factors · ${ms}ms`;
    },
  },
  {
    name: 'POST /v1/assessment',
    proves: 'all four agents run and the safety gate actually rejects',
    async run() {
      // Pregnancy + insulin: the Safety agent must remove the weight-loss
      // action and escalate. A 200 that passes this case would mean the gate
      // is not doing its job.
      const { ok, status, body, ms } = await call('/v1/assessment', {
        method: 'POST',
        body: JSON.stringify({
          patient: {
            patient_id: 'healthcheck',
            age: 34,
            sex: 'female',
            bmi: 31.5,
            fasting_glucose: 108,
            systolic_bp: 134,
            constraints: ['pregnant'],
            current_medications: ['insulin glargine'],
          },
        }),
      });
      if (status === 401) {
        throw new Error('401 — needs a Cognito token (expected when auth is on; see note below)');
      }
      if (!ok) throw new Error(`HTTP ${status}`);

      const trace = body?.trace ?? [];
      if (trace.length !== 4) throw new Error(`expected 4 trace rows, got ${trace.length}`);
      const failed = trace.filter((t) => t.status === 'failed');
      if (failed.length) throw new Error(`agent failed: ${failed.map((t) => t.agent).join(', ')}`);

      const blocked = body?.safety?.blocked_actions ?? [];
      if (body?.safety?.passed !== false || blocked.length === 0) {
        throw new Error('safety gate did NOT reject an unsafe plan — check the safety rules');
      }
      return `4 agents ran · ${body.plan.actions.length} actions kept · ${blocked.length} rejected · ${ms}ms`;
    },
  },
  {
    name: 'POST /v1/assessment (bad input)',
    proves: 'input validation rejects nonsense instead of scoring it',
    async run() {
      const { status, ms } = await call('/v1/assessment', {
        method: 'POST',
        body: JSON.stringify({ patient: { patient_id: 'healthcheck', age: 900 } }),
      });
      if (status !== 422) throw new Error(`expected 422, got ${status}`);
      return `rejected age 900 with 422 · ${ms}ms`;
    },
  },
];

console.log(`\nPreventAI agent service · ${BASE}\n`);

let failures = 0;
for (const check of CHECKS) {
  process.stdout.write(`  ${check.name.padEnd(32)}`);
  try {
    const detail = await check.run();
    console.log(`${GREEN}PASS${OFF}  ${DIM}${detail}${OFF}`);
  } catch (err) {
    failures += 1;
    const message = err?.name === 'TimeoutError' ? `no response in ${TIMEOUT_MS / 1000}s` : err.message;
    console.log(`${RED}FAIL${OFF}  ${message}`);
    console.log(`        ${DIM}expected: ${check.proves}${OFF}`);
  }
}

console.log('');
if (failures === 0) {
  console.log(`${GREEN}All ${CHECKS.length} checks passed.${OFF}\n`);
  process.exit(0);
}

console.log(`${RED}${failures} of ${CHECKS.length} checks failed.${OFF}`);
console.log(`
${YELLOW}Where to look:${OFF}
  ${DIM}Everything failed${OFF}        The service is not running or the URL is wrong.
                          Local:  cd backend && uvicorn app.main:app --reload
                          Deployed: check the Lambda exists and its Function URL.
  ${DIM}401 on assessment${OFF}       Expected once Cognito auth is on: that endpoint
                          persists a plan, so it requires a signed-in user.
                          Test it from the app, not from here.
  ${DIM}Timeouts only${OFF}           Likely a Lambda cold start. Run it again.
  ${DIM}Safety gate did not reject${OFF}  Serious: the deployed code is older than the
                          safety rules, or a rule was changed. Redeploy.
`);
process.exit(1);
