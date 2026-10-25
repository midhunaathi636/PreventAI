/**
 * Typed client for the PreventAI agent service (FastAPI).
 *
 * The four agents no longer run in the browser. This module owns the wire
 * contract with the Python service: building a snapshot from the Amplify
 * profile, calling the pipeline, and surfacing failures in a way the UI can
 * actually show a user.
 */

import { fetchAuthSession } from 'aws-amplify/auth';

const trimSlash = (url: string) => url.replace(/\/+$/, '');

/**
 * Where the agent service lives, resolved in priority order:
 *
 *   1. `VITE_AGENT_SERVICE_URL` — an explicit override, mainly for pointing a
 *      local frontend at a deployed service.
 *   2. `custom.agentServiceUrl` in `amplify_outputs.json` — written by the
 *      Amplify backend at deploy time (see amplify/backend.ts). This is the
 *      normal path: nothing to configure by hand.
 *   3. `http://localhost:8000` — a local uvicorn.
 *
 * Resolved lazily, because `amplify_outputs.json` is loaded asynchronously
 * during app startup and may not be present when this module is first
 * evaluated.
 */
const LOCAL_DEFAULT = 'http://localhost:8000';

let discoveredUrl: string | null = null;

/**
 * Called by `configureAmplify()` with the parsed `amplify_outputs.json`.
 *
 * The raw outputs are read rather than `Amplify.getConfig()`, because the
 * `custom` block is not guaranteed to survive into the parsed config.
 */
export function registerAgentServiceUrl(outputs: unknown): void {
  const custom = (outputs as { custom?: Record<string, unknown> } | null)?.custom;
  const url = custom?.agentServiceUrl;
  if (typeof url === 'string' && url.trim()) {
    discoveredUrl = trimSlash(url.trim());
  }
}

export function resolveAgentServiceUrl(): string {
  const override = import.meta.env.VITE_AGENT_SERVICE_URL as string | undefined;
  if (override?.trim()) return trimSlash(override.trim());
  return discoveredUrl ?? LOCAL_DEFAULT;
}

// --------------------------------------------------------------------------- //
// Wire types — mirror backend/app/schemas.py
// --------------------------------------------------------------------------- //

export type AgentRiskLevel = 'low' | 'moderate' | 'high' | 'very_high';
export type AgentActionDomain = 'lifestyle' | 'screening' | 'behavioral' | 'medication_adherence';
export type AgentSeverity = 'info' | 'warning' | 'critical';
export type AgentStepName = 'risk' | 'plan_generation' | 'personalization' | 'safety';
export type AgentStepStatus = 'completed' | 'degraded' | 'needs_review' | 'failed';

export interface PatientSnapshot {
  patient_id: string;
  age?: number;
  sex?: 'male' | 'female' | 'other';
  systolic_bp?: number;
  diastolic_bp?: number;
  total_cholesterol?: number;
  hdl?: number;
  ldl?: number;
  fasting_glucose?: number;
  bmi?: number;
  smoker?: boolean;
  diabetes?: boolean;
  family_history_cvd?: boolean;
  family_history_cancer?: boolean;
  activity_minutes_week?: number;
  diet_quality?: 'poor' | 'fair' | 'good' | 'excellent';
  alcohol_drinks_week?: number;
  preferences?: Record<string, unknown>;
  constraints?: string[];
  current_medications?: string[];
  allergies?: string[];
}

export interface AgentRiskFactor {
  code: string;
  name: string;
  value: string;
  contribution: number;
  targets: string[];
  modifiable: boolean;
  rationale: string;
}

export interface AgentRiskAssessment {
  patient_id: string;
  cvd_risk: number;
  diabetes_risk: number;
  cancer_risk: number;
  stroke_risk: number;
  overall_risk: number;
  risk_level: AgentRiskLevel;
  factors: AgentRiskFactor[];
  contributing_factors: string[];
  modifiable_factors: string[];
  confidence: number;
  explanation: string;
  assessed_at: string;
}

export interface AgentPlanAction {
  code: string;
  domain: AgentActionDomain;
  title: string;
  description: string;
  frequency: string;
  expected_impact: number;
  sort_order: number;
  tags: string[];
  targets: string[];
  evidence: string;
  personalized: boolean;
  safety_adapted: boolean;
  adaptations: string[];
}

export interface AgentPreventionPlan {
  patient_id: string;
  title: string;
  summary: string;
  actions: AgentPlanAction[];
  expected_risk_reduction: number;
  explanation: string;
  source_risk_level: AgentRiskLevel | null;
  personalization_notes: string[];
  safety_verified: boolean;
  safety_notes: string;
  requires_clinician_review: boolean;
}

export interface AgentSafetyIssue {
  severity: AgentSeverity;
  code: string;
  message: string;
  related_action: string | null;
  resolution: 'blocked' | 'adapted' | 'flagged';
}

export interface AgentSafetyReport {
  patient_id: string;
  passed: boolean;
  issues: AgentSafetyIssue[];
  blocked_actions: string[];
  adapted_actions: string[];
  escalate_to_clinician: boolean;
  notes: string;
}

export interface AgentTrace {
  agent: AgentStepName;
  status: AgentStepStatus;
  message: string;
  duration_ms: number;
  llm_used: boolean;
  details: Record<string, unknown>;
  started_at: string;
}

export interface AgentPipelineResult {
  run_id: string;
  patient_id: string;
  risk: AgentRiskAssessment;
  plan: AgentPreventionPlan;
  safety: AgentSafetyReport;
  trace: AgentTrace[];
  llm_enabled: boolean;
  total_duration_ms: number;
  generated_at: string;
}

export interface AgentServiceHealth {
  status: 'ok';
  version: string;
  llm_enabled: boolean;
  llm_provider: string | null;
  agents: AgentStepName[];
}

// --------------------------------------------------------------------------- //
// Errors
// --------------------------------------------------------------------------- //

/** Thrown for anything the UI should show the user verbatim. */
export class AgentServiceError extends Error {
  constructor(
    message: string,
    readonly status?: number,
    readonly unreachable = false
  ) {
    super(message);
    this.name = 'AgentServiceError';
  }
}

function unreachableHint(url: string): string {
  const local = url.includes('localhost') || url.includes('127.0.0.1');
  return (
    `Could not reach the agent service at ${url}. ` +
    (local
      ? 'Start it with `cd backend && uvicorn app.main:app --reload`.'
      : 'The deployed agent Lambda may still be warming up, or the backend deploy has not finished.')
  );
}

// --------------------------------------------------------------------------- //
// Transport
// --------------------------------------------------------------------------- //

async function authHeader(): Promise<Record<string, string>> {
  try {
    const session = await fetchAuthSession();
    // The ID token, not the access token.
    //
    // Cognito access tokens carry `sub`, `client_id` and `cognito:groups`
    // but no custom attributes. This app records whether someone is a
    // clinician in `custom:role`, which only appears on the ID token — send
    // the access token and the service sees no role at all and refuses a
    // clinician's assessment for their own patient.
    const token =
      session.tokens?.idToken?.toString() ?? session.tokens?.accessToken?.toString();
    return token ? { Authorization: `Bearer ${token}` } : {};
  } catch {
    // The service runs open in dev; a missing token is not fatal there.
    return {};
  }
}

/**
 * A cold Lambda takes a couple of seconds to answer its first request, and a
 * transient edge failure during that window is indistinguishable from the
 * service being down. One silent retry covers it; beyond that the error is
 * real and belongs in front of the user.
 */
const COLD_START_RETRIES = 1;
const RETRY_DELAY_MS = 1200;
const REQUEST_TIMEOUT_MS = 35_000; // Lambda itself times out at 30s.

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

async function request<T>(path: string, init?: RequestInit, attempt = 0): Promise<T> {
  const baseUrl = resolveAgentServiceUrl();
  let response: Response;
  try {
    response = await fetch(`${baseUrl}${path}`, {
      ...init,
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      headers: {
        'Content-Type': 'application/json',
        ...(await authHeader()),
        ...(init?.headers as Record<string, string> | undefined),
      },
    });
  } catch (err) {
    const timedOut = err instanceof DOMException && err.name === 'TimeoutError';
    if (!timedOut && attempt < COLD_START_RETRIES) {
      await sleep(RETRY_DELAY_MS);
      return request<T>(path, init, attempt + 1);
    }
    throw new AgentServiceError(
      timedOut
        ? 'The agent service took too long to respond. Please try again.'
        : unreachableHint(baseUrl),
      undefined,
      !timedOut
    );
  }

  if (!response.ok) {
    // 502/503/504 from a Function URL usually means the Lambda was still
    // starting. A real application error arrives with a JSON detail body.
    if (response.status >= 502 && response.status <= 504 && attempt < COLD_START_RETRIES) {
      await sleep(RETRY_DELAY_MS);
      return request<T>(path, init, attempt + 1);
    }

    let detail = `${response.status} ${response.statusText}`;
    try {
      const body = await response.json();
      if (body?.detail) {
        detail = typeof body.detail === 'string' ? body.detail : JSON.stringify(body.detail);
      }
    } catch {
      /* non-JSON error body; the status line is all we have */
    }
    if (response.status === 401) {
      detail = 'Your session has expired. Sign out and back in, then try again.';
    }
    throw new AgentServiceError(detail, response.status);
  }

  return (await response.json()) as T;
}

// --------------------------------------------------------------------------- //
// Snapshot construction
// --------------------------------------------------------------------------- //

function ageFromDob(dob: string | null | undefined): number | undefined {
  if (!dob) return undefined;
  const parsed = new Date(dob);
  if (Number.isNaN(parsed.getTime())) return undefined;
  const years = Math.floor((Date.now() - parsed.getTime()) / (365.25 * 24 * 3600 * 1000));
  return years >= 0 && years <= 120 ? years : undefined;
}

function num(value: unknown): number | undefined {
  const n = Number(value);
  return Number.isFinite(n) ? n : undefined;
}

function strings(value: unknown): string[] | undefined {
  if (!Array.isArray(value)) return undefined;
  const out = value.map((v) => String(v).trim()).filter(Boolean);
  return out.length ? out : undefined;
}

/** Drop undefined keys — the backend forbids unknown fields and prefers absence to null. */
function compact<T extends Record<string, unknown>>(obj: T): T {
  return Object.fromEntries(Object.entries(obj).filter(([, v]) => v !== undefined)) as T;
}

export interface ProfileLike {
  id: string;
  gender?: string | null;
  date_of_birth?: string | null;
  health_preferences?: Record<string, unknown> | null;
  constraints?: string[] | null;
}

/**
 * Turn an Amplify profile into the snapshot the pipeline reasons about.
 *
 * Clinical values live under `health_preferences` in the Amplify schema;
 * anything absent is simply omitted so the backend applies its own default and
 * lowers the assessment's confidence accordingly.
 */
export function buildSnapshot(
  profile: ProfileLike,
  overrides: Partial<PatientSnapshot> = {}
): PatientSnapshot {
  const hp = (profile.health_preferences ?? {}) as Record<string, unknown>;
  const rawSex = String(profile.gender ?? hp.sex ?? '').toLowerCase();
  const sex: PatientSnapshot['sex'] = rawSex.startsWith('m')
    ? 'male'
    : rawSex.startsWith('f')
      ? 'female'
      : rawSex
        ? 'other'
        : undefined;

  const diet = String(hp.diet_quality ?? '').toLowerCase();

  return compact({
    patient_id: profile.id,
    age: ageFromDob(profile.date_of_birth) ?? num(hp.age),
    sex,
    systolic_bp: num(hp.systolic_bp),
    diastolic_bp: num(hp.diastolic_bp),
    total_cholesterol: num(hp.total_cholesterol),
    hdl: num(hp.hdl),
    ldl: num(hp.ldl),
    fasting_glucose: num(hp.fasting_glucose),
    bmi: num(hp.bmi),
    smoker: hp.smoker === undefined ? undefined : Boolean(hp.smoker),
    diabetes: hp.diabetes === undefined ? undefined : Boolean(hp.diabetes),
    family_history_cvd:
      hp.family_history_cvd === undefined ? undefined : Boolean(hp.family_history_cvd),
    family_history_cancer:
      hp.family_history_cancer === undefined ? undefined : Boolean(hp.family_history_cancer),
    activity_minutes_week: num(hp.activity_minutes_week),
    diet_quality: ['poor', 'fair', 'good', 'excellent'].includes(diet)
      ? (diet as PatientSnapshot['diet_quality'])
      : undefined,
    alcohol_drinks_week: num(hp.alcohol_drinks_week),
    preferences: (hp.preferences as Record<string, unknown> | undefined) ?? undefined,
    constraints: strings(profile.constraints) ?? strings(hp.constraints),
    current_medications: strings(hp.current_medications),
    allergies: strings(hp.allergies),
    ...overrides,
  }) as PatientSnapshot;
}

// --------------------------------------------------------------------------- //
// Calls
// --------------------------------------------------------------------------- //

export const agentService = {
  health(): Promise<AgentServiceHealth> {
    return request<AgentServiceHealth>('/v1/health');
  },

  /** Run all four agents. */
  assess(patient: PatientSnapshot, useLlm?: boolean): Promise<AgentPipelineResult> {
    return request<AgentPipelineResult>('/v1/assessment', {
      method: 'POST',
      body: JSON.stringify(compact({ patient, use_llm: useLlm })),
    });
  },

  /** Risk scoring only — fast enough for a live what-if control. */
  risk(patient: PatientSnapshot): Promise<AgentRiskAssessment> {
    return request<AgentRiskAssessment>('/v1/risk', {
      method: 'POST',
      body: JSON.stringify({ patient }),
    });
  },

  /** True when the service is up. Never throws. */
  async isAvailable(): Promise<boolean> {
    try {
      await this.health();
      return true;
    } catch {
      return false;
    }
  },
};
