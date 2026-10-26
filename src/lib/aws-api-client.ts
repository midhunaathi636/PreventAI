/**
 * PreventAI API client – AWS Amplify Auth (Cognito) + Amplify Data (AppSync/DynamoDB).
 * No localStorage demo data. Requires Amplify backend (sandbox or cloud deploy).
 */

import { Amplify } from 'aws-amplify';
import {
  signIn,
  signUp,
  signOut,
  getCurrentUser,
  fetchAuthSession,
  fetchUserAttributes,
  confirmSignUp,
  autoSignIn,
  type SignInOutput,
} from 'aws-amplify/auth';
import { generateClient } from 'aws-amplify/data';
import type { Schema } from '../../amplify/data/resource';
import {
  agentService,
  buildSnapshot,
  registerAgentServiceUrl,
  type PatientSnapshot,
} from './agent-service';

let outputsLoaded = false;

export async function configureAmplify() {
  if (outputsLoaded) return;
  try {
    const outputs = await import('../../amplify_outputs.json');
    const resolved = outputs.default ?? outputs;
    Amplify.configure(resolved);
    // Picks up `custom.agentServiceUrl`, written by the backend at deploy
    // time, so the agent service needs no manual configuration.
    registerAgentServiceUrl(resolved);
    outputsLoaded = true;
  } catch {
    console.warn(
      '[PreventAI] amplify_outputs.json not found. Run `npx ampx sandbox` to provision AWS resources.'
    );
  }
}

const client = generateClient<Schema>();

export interface CognitoUser {
  sub: string;
  email: string;
  given_name?: string;
  family_name?: string;
  'cognito:groups'?: string[];
  role?: string;
}

async function currentSub(): Promise<string | null> {
  try {
    const user = await getCurrentUser();
    return user.userId;
  } catch {
    return null;
  }
}

async function toCognitoUser(): Promise<CognitoUser | null> {
  try {
    const user = await getCurrentUser();
    const attrs = await fetchUserAttributes();
    const session = await fetchAuthSession();
    const groups =
      (session.tokens?.accessToken?.payload['cognito:groups'] as string[]) ?? [];

    return {
      sub: user.userId,
      email: attrs.email ?? '',
      given_name: attrs.given_name,
      family_name: attrs.family_name,
      'cognito:groups': groups,
      role:
        (attrs['custom:role'] as string) ||
        (groups.includes('Clinicians') ? 'clinician' : 'patient'),
    };
  } catch {
    return null;
  }
}

function mapProfile(row: any) {
  if (!row) return null;
  return {
    id: row.id,
    email: row.email,
    role: row.role,
    first_name: row.firstName,
    last_name: row.lastName,
    date_of_birth: row.dateOfBirth ?? null,
    gender: row.gender ?? '',
    phone: row.phone ?? '',
    address: row.address ?? '',
    health_preferences: asObject(row.healthPreferences),
    constraints: asArray(row.constraints).map(String),
    genetic_markers: asObject(row.geneticMarkers),
    clinician_id: row.clinicianId ?? null,
    created_at: row.createdAt,
    updated_at: row.updatedAt,
  };
}

function filterNonNull<T>(arr: (T | null | undefined)[]): T[] {
  return arr.filter((x): x is T => x != null);
}

function asArray(value: any): any[] {
  if (!value) return [];
  if (Array.isArray(value)) return value;
  if (Array.isArray(value.items)) return value.items;
  if (Array.isArray(value.data)) return value.data;
  return [];
}

/**
 * Read an `a.json()` column into a plain object.
 *
 * AppSync's AWSJSON scalar round-trips as a JSON *string*, so these columns
 * come back encoded. Parsing is done in a loop because a value written by an
 * older build may be double-encoded; without that, `JSON.parse` returns a
 * string, the object check fails, and the record silently reads as empty.
 */
function asObject(value: any): Record<string, unknown> {
  if (!value) return {};

  let current: unknown = value;
  for (let depth = 0; depth < 3 && typeof current === 'string'; depth++) {
    try {
      current = JSON.parse(current);
    } catch {
      return {};
    }
  }

  if (current && typeof current === 'object' && !Array.isArray(current)) {
    return current as Record<string, unknown>;
  }
  return {};
}

/**
 * Encode a value for an `a.json()` column.
 *
 * AWSJSON expects a JSON-encoded string. Passing a raw object makes AppSync
 * reject the whole mutation with "Variable '<field>' has an invalid value",
 * which is what broke saving a profile.
 */
function toJsonField(value: unknown): string {
  return JSON.stringify(asObject(value));
}



function mapRisk(row: any) {
  if (!row) return null;
  return {
    id: row.id,
    patient_id: row.patientId,
    cvd_risk: row.cvdRisk ?? 0,
    diabetes_risk: row.diabetesRisk ?? 0,
    cancer_risk: row.cancerRisk ?? 0,
    stroke_risk: row.strokeRisk ?? 0,
    overall_risk: row.overallRisk,
    risk_level: row.riskLevel,
    contributing_factors: asArray(row.contributingFactors).map(String),
    recorded_at: row.recordedAt,
    created_at: row.createdAt,
    score: row.overallRisk,
    level: row.riskLevel,
    factors: asArray(row.contributingFactors).map((f: any) => ({
      name: String(f),
      weight: 0,
      value: '',
    })),
  };
}

function mapPlan(row: any) {
  if (!row) return null;
  return {
    id: row.id,
    patient_id: row.patientId,
    clinician_id: row.clinicianId,
    status: row.status,
    title: row.title,
    summary: row.summary,
    expected_risk_reduction: row.expectedRiskReduction,
    ai_explanation: row.aiExplanation,
    safety_verified: row.safetyVerified,
    safety_notes: row.safetyNotes,
    approved_by: row.approvedBy,
    approved_at: row.approvedAt,
    plan_version: row.planVersion,
    review_comments: row.reviewComments,
    created_at: row.createdAt,
    updated_at: row.updatedAt,
    actions: filterNonNull(asArray(row.actions).map(mapAction)),
  };
}

/** The fields of a profile that seed a patient snapshot. */
type SnapshotSource = {
  gender?: string | null;
  date_of_birth?: string | null;
  health_preferences?: Record<string, unknown> | null;
  constraints?: string[] | null;
};

/** Plan status ranked by how current it is. */
const PLAN_STATUS_RANK: Record<string, number> = {
  active: 4,
  pending_review: 3,
  draft: 2,
  completed: 1,
  overridden: 0,
};

/** The single plan a patient should see, from a newest-first list. */
export function pickCurrentPlan<T extends { status?: string; created_at?: string }>(
  plans: T[]
): T | null {
  if (!plans?.length) return null;
  return [...plans].sort((a, b) => {
    const rank = (PLAN_STATUS_RANK[b.status ?? ''] ?? 0) - (PLAN_STATUS_RANK[a.status ?? ''] ?? 0);
    if (rank !== 0) return rank;
    return new Date(b.created_at ?? 0).getTime() - new Date(a.created_at ?? 0).getTime();
  })[0];
}

function mapAction(row: any) {
  if (!row) return null;
  return {
    id: row.id,
    plan_id: row.planId,
    domain: row.domain,
    title: row.title,
    description: row.description,
    frequency: row.frequency,
    expected_impact: row.expectedImpact,
    status: row.status,
    sort_order: row.sortOrder,
    target_date: row.targetDate,
    created_at: row.createdAt,
  };
}

class AmplifyApiClient {
  async register(
    email: string,
    password: string,
    role: 'patient' | 'clinician',
    firstName: string,
    lastName: string
  ): Promise<{ error: string | null; needsConfirmation?: boolean }> {
    try {
      await signUp({
        username: email,
        password,
        options: {
          userAttributes: {
            email,
            given_name: firstName,
            family_name: lastName,
            'custom:role': role,
          },
          autoSignIn: true,
        },
      });
      return { error: null, needsConfirmation: true };
    } catch (e: any) {
      return { error: e.message || 'Registration failed' };
    }
  }

  async confirmRegistration(email: string, code: string): Promise<{ error: string | null }> {
    try {
      await confirmSignUp({ username: email, confirmationCode: code });
      try {
        await autoSignIn();
      } catch {
        /* user can sign in manually */
      }
      await this.ensureProfile();
      return { error: null };
    } catch (e: any) {
      return { error: e.message || 'Confirmation failed' };
    }
  }

  async login(email: string, password: string): Promise<{ error: string | null }> {
    try {
      const result: SignInOutput = await signIn({ username: email, password });
      if (result.isSignedIn) {
        await this.ensureProfile();
        return { error: null };
      }
      if (result.nextStep?.signInStep === 'CONFIRM_SIGN_UP') {
        return { error: 'Please confirm your email before signing in.' };
      }
      return { error: 'Additional sign-in steps required' };
    } catch (e: any) {
      return { error: e.message || 'Login failed' };
    }
  }

  async logout(): Promise<void> {
    await signOut();
  }

  getCurrentUser(): CognitoUser | null {
    return null;
  }

  async getCurrentUserAsync(): Promise<CognitoUser | null> {
    return toCognitoUser();
  }

  isAuthenticated(): boolean {
    return false;
  }

  private async ensureProfile() {
    const user = await toCognitoUser();
    if (!user) return;

    const { data: existing } = await client.models.Profile.get({ id: user.sub });
    if (existing) return;

    const role = (user.role as 'patient' | 'clinician') || 'patient';
    await client.models.Profile.create({
      id: user.sub,
      email: user.email,
      role,
      firstName: user.given_name || '',
      lastName: user.family_name || '',
    });
  }

  async getPatientProfile() {
    const sub = await currentSub();
    if (!sub) throw new Error('Not authenticated');
    let row: any = null;
    try {
      const got = await client.models.Profile.get({ id: sub });
      row = got.data;
    } catch {
      row = null;
    }
    if (!row) {
      const { data: listed } = await client.models.Profile.list({
        filter: { id: { eq: sub } },
      });
      row = listed?.[0] ?? null;
    }
    return mapProfile(row) ?? {
      id: sub,
      email: '',
      role: 'patient',
      first_name: '',
      last_name: '',
      date_of_birth: null,
      gender: '',
      phone: '',
      address: '',
      health_preferences: {},
      constraints: [],
      genetic_markers: {},
      clinician_id: null,
    };
  }

  /**
   * Write profile fields for a given id.
   *
   * Shared by the patient editing themselves and a clinician editing a
   * patient on their panel, so the snake_case -> Amplify mapping exists once.
   * Only keys actually present in `updates` are sent, so a partial edit never
   * blanks a field it did not touch.
   */
  async writeProfile(id: string, updates: Record<string, any>) {
    const payload: { id: string } & Record<string, unknown> = { id };
    if (updates.first_name !== undefined) payload.firstName = updates.first_name;
    if (updates.last_name !== undefined) payload.lastName = updates.last_name;
    if (updates.date_of_birth !== undefined) payload.dateOfBirth = updates.date_of_birth;
    if (updates.gender !== undefined) payload.gender = updates.gender;
    if (updates.phone !== undefined) payload.phone = updates.phone;
    if (updates.address !== undefined) payload.address = updates.address;
    if (updates.health_preferences !== undefined)
      payload.healthPreferences = toJsonField(updates.health_preferences);
    if (updates.constraints !== undefined)
      payload.constraints = asArray(updates.constraints).map(String);
    if (updates.genetic_markers !== undefined)
      payload.geneticMarkers = toJsonField(updates.genetic_markers);
    if (updates.clinician_id !== undefined) payload.clinicianId = updates.clinician_id;

    const { data, errors } = await client.models.Profile.update(payload);
    if (errors?.length) {
      throw new Error(errors.map((e: { message: string }) => e.message).join('; '));
    }
    return mapProfile(data);
  }

  /** The signed-in patient editing their own record. */
  async updatePatientProfile(updates: Record<string, any>) {
    const sub = await currentSub();
    if (!sub) throw new Error('Not authenticated');
    return this.writeProfile(sub, updates);
  }

  /**
   * A clinician editing a patient on their panel.
   *
   * The Profile model grants update to any authenticated user, which is what
   * makes this possible; the clinical values written here are the same ones
   * the Risk agent reads, so an edit followed by a re-run changes the score.
   */
  async updatePatientProfileById(patientId: string, updates: Record<string, any>) {
    const sub = await currentSub();
    if (!sub) throw new Error('Not authenticated');
    if (!patientId) throw new Error('No patient selected');
    return this.writeProfile(patientId, updates);
  }

  async getPatientRiskTrajectory() {
    const sub = await currentSub();
    if (!sub) throw new Error('Not authenticated');
    const { data } = await client.models.RiskScore.list({
      filter: { patientId: { eq: sub } },
    });
    return { trajectories: (data ?? []).map(mapRisk) };
  }

  async getRiskTrajectory() {
    const { trajectories } = await this.getPatientRiskTrajectory();
    return trajectories;
  }

  /**
   * Every plan this patient has, newest first.
   *
   * DynamoDB returns list results in no meaningful order, so callers that
   * took `plans[0]` were picking an arbitrary plan rather than the current
   * one. Sorting here fixes that for every caller at once.
   */
  async getPatientPlans() {
    const sub = await currentSub();
    if (!sub) throw new Error('Not authenticated');
    const { data } = await client.models.PreventionPlan.list({
      filter: { patientId: { eq: sub } },
    });
    const plans = filterNonNull((data ?? []).map(mapPlan)).sort(
      (a: { created_at?: string }, b: { created_at?: string }) =>
        new Date(b.created_at ?? 0).getTime() - new Date(a.created_at ?? 0).getTime()
    );
    // Hydrate PlanAction rows (hasMany may not expand on list)
    for (const plan of plans) {
      try {
        const { data: actions } = await client.models.PlanAction.list({
          filter: { planId: { eq: plan.id } },
        });
        plan.actions = filterNonNull(asArray(actions).map(mapAction)).sort(
          (a: { sort_order?: number }, b: { sort_order?: number }) =>
            (a.sort_order ?? 0) - (b.sort_order ?? 0)
        );
      } catch {
        plan.actions = plan.actions || [];
      }
    }
    return plans;
  }

  /**
   * Mark every other open plan for this patient as superseded.
   *
   * Only draft / pending_review / active plans are touched; a completed plan
   * is history and stays as it is. Failures are swallowed per-row so one
   * stale record cannot fail the assessment that just succeeded.
   */
  async supersedePlansExcept(patientId: string, keepPlanId: string) {
    const { data } = await client.models.PreventionPlan.list({
      filter: { patientId: { eq: patientId } },
    });
    const stale = (data ?? []).filter(
      (p) =>
        p?.id &&
        p.id !== keepPlanId &&
        ['draft', 'pending_review', 'active'].includes(p.status ?? '')
    );
    await Promise.all(
      stale.map((p) =>
        client.models.PreventionPlan.update({ id: p.id, status: 'overridden' }).catch((err) => {
          console.error('[PreventAI] could not supersede plan', p.id, err);
          return null;
        })
      )
    );
  }

  /**
   * The one plan a patient should be looking at.
   *
   * Active beats pending review beats draft; ties break on recency. Returns
   * null when the patient has never run an assessment.
   */
  async getCurrentPlan() {
    const plans = await this.getPatientPlans();
    return pickCurrentPlan(plans);
  }

  async getPreventionPlans() {
    return this.getPatientPlans();
  }

  /**
   * Full AI assessment.
   *
   * The four agents run in the FastAPI service (`backend/`), not in the
   * browser. This method's job is the bit that has to happen here: build the
   * snapshot from the Amplify profile, call the pipeline, and persist the
   * result — risk score, plan, actions, per-agent trace and a notification.
   *
   * Persistence is best-effort after the first two writes: if a plan action
   * fails to save, the assessment is still returned rather than lost.
   */
  /**
   * Run the four agents for the signed-in patient and persist the result.
   */
  async runFullAssessment(overrides: Partial<PatientSnapshot> = {}) {
    const sub = await currentSub();
    if (!sub) throw new Error('Not authenticated');
    const rawProfile = (await this.getPatientProfile()) as SnapshotSource | null;
    return this.assessAndPersist(sub, rawProfile, overrides);
  }

  /**
   * Run the four agents for a patient the clinician is viewing.
   *
   * Same pipeline, same persistence; the only differences are whose profile
   * seeds the snapshot and that the resulting plan is stamped with the
   * clinician who ordered it. The service authorises this: a patient may only
   * assess themselves, a clinician may assess anyone.
   */
  async runAssessmentForPatient(patientId: string, overrides: Partial<PatientSnapshot> = {}) {
    const clinicianId = await currentSub();
    if (!clinicianId) throw new Error('Not authenticated');
    if (!patientId) throw new Error('No patient selected');

    const detail = (await this.getClinicianPatientDetail(patientId)) as {
      patient?: SnapshotSource | null;
      profile?: SnapshotSource | null;
    };
    const profile = detail?.patient ?? detail?.profile ?? null;

    return this.assessAndPersist(patientId, profile, overrides, clinicianId);
  }

  /**
   * The shared body of an assessment: build the snapshot, call the agent
   * service, then persist risk, plan, actions, trace and a notification.
   *
   * Persistence after the first two writes is best-effort: if one plan action
   * fails to save, the assessment is still returned rather than lost.
   */
  async assessAndPersist(
    patientId: string,
    rawProfile: SnapshotSource | null,
    overrides: Partial<PatientSnapshot> = {},
    clinicianId?: string
  ) {
    const snapshot = buildSnapshot(
      {
        id: patientId,
        gender: rawProfile?.gender,
        date_of_birth: rawProfile?.date_of_birth,
        health_preferences: rawProfile?.health_preferences ?? {},
        constraints: rawProfile?.constraints ?? [],
      },
      overrides
    );

    const result = await agentService.assess(snapshot);
    const { risk, plan, safety, trace } = result;

    const { data: riskRow } = await client.models.RiskScore.create({
      patientId,
      cvdRisk: risk.cvd_risk,
      diabetesRisk: risk.diabetes_risk,
      cancerRisk: risk.cancer_risk,
      strokeRisk: risk.stroke_risk,
      overallRisk: risk.overall_risk,
      riskLevel: risk.risk_level,
      contributingFactors: risk.contributing_factors,
      recordedAt: risk.assessed_at ?? new Date().toISOString(),
    });

    // A plan that failed its safety screen must never land in a state a
    // clinician could mistake for approved.
    const { data: planRow } = await client.models.PreventionPlan.create({
      patientId,
      clinicianId: clinicianId ?? undefined,
      status: safety.passed ? 'pending_review' : 'draft',
      title: plan.title,
      summary: plan.summary,
      expectedRiskReduction: plan.expected_risk_reduction,
      aiExplanation: plan.explanation,
      safetyVerified: plan.safety_verified,
      safetyNotes: plan.safety_notes,
      planVersion: 1,
    });

    // A new assessment supersedes whatever came before it. Without this the
    // patient accumulates plans and every screen that lists them repeats the
    // same actions once per run.
    if (planRow) {
      await this.supersedePlansExcept(patientId, planRow.id);

      await Promise.all(
        plan.actions.map((action) =>
          client.models.PlanAction.create({
            planId: planRow.id,
            domain: action.domain,
            title: action.title,
            description: action.description,
            frequency: action.frequency,
            expectedImpact: action.expected_impact,
            status: 'pending',
            sortOrder: action.sort_order,
          }).catch((err) => {
            console.error('[PreventAI] failed to persist plan action', action.code, err);
            return null;
          })
        )
      );
    }

    await Promise.all(
      trace.map((step) =>
        client.models.AgentActivity.create({
          patientId,
          agentType: step.agent,
          status: step.status,
          message: `${step.message} (${Math.round(step.duration_ms)}ms${step.llm_used ? ', LLM' : ''})`.slice(0, 500),
        }).catch((err) => {
          console.error('[PreventAI] failed to persist agent trace', step.agent, err);
          return null;
        })
      )
    );

    // The notification goes to the patient, whoever ordered the run.
    await client.models.Notification.create({
      userId: patientId,
      type: safety.passed ? 'plan_update' : 'risk_alert',
      title: safety.passed ? 'AI assessment complete' : 'AI assessment needs clinician review',
      body: safety.passed
        ? `Risk ${risk.overall_risk}% (${risk.risk_level}). Plan: ${plan.actions.length} actions.`
        : `Risk ${risk.overall_risk}% (${risk.risk_level}). Safety screen flagged ${safety.issues.filter((i) => i.severity === 'critical').length} critical issue(s).`,
      read: false,
    }).catch(() => null);

    return {
      risk: mapRisk(riskRow) ?? {
        id: riskRow?.id,
        patient_id: patientId,
        cvd_risk: risk.cvd_risk,
        diabetes_risk: risk.diabetes_risk,
        cancer_risk: risk.cancer_risk,
        stroke_risk: risk.stroke_risk,
        overall_risk: risk.overall_risk,
        risk_level: risk.risk_level,
        contributing_factors: risk.contributing_factors,
        recorded_at: risk.assessed_at,
      },
      plan: mapPlan(planRow),
      safety,
      trace,
      /** @deprecated use `trace` — kept so older callers keep working. */
      agent_log: trace.map((t) => ({ agent: t.agent, status: t.status, message: t.message })),
      explanation: risk.explanation,
      pipeline: result,
    };
  }


  async generatePlan(overrides: Record<string, any> = {}) {
    const result = await this.runFullAssessment(overrides);
    return result.plan;
  }

  /**
   * Score risk without generating or persisting anything.
   *
   * Used by the what-if control: the patient moves a value and sees the score
   * move, with no write to their record.
   */
  async previewRisk(overrides: Partial<PatientSnapshot> = {}) {
    const sub = await currentSub();
    if (!sub) throw new Error('Not authenticated');
    const rawProfile: any = await this.getPatientProfile();
    const snapshot = buildSnapshot(
      {
        id: sub,
        gender: rawProfile?.gender,
        date_of_birth: rawProfile?.date_of_birth,
        health_preferences: rawProfile?.health_preferences ?? {},
        constraints: rawProfile?.constraints ?? [],
      },
      overrides
    );
    return agentService.risk(snapshot);
  }

  /** Is the agent service reachable? Used to warn before the user clicks Run. */
  async agentServiceHealth() {
    return agentService.health();
  }

  async getAdherenceRecords() {
    const sub = await currentSub();
    if (!sub) throw new Error('Not authenticated');
    const { data } = await client.models.AdherenceLog.list({
      filter: { patientId: { eq: sub } },
    });
    return {
      records: (data ?? []).map((r) => ({
        id: r.id,
        planActionId: r.planActionId,
        completed: r.completed,
        notes: r.notes,
        recorded_at: r.completedAt,
        completed_at: r.completedAt,
        created_at: r.createdAt,
        plan_action_id: r.planActionId,
        patient_id: r.patientId,
      })),
    };
  }

  async getAdherence() {
    const { records } = await this.getAdherenceRecords();
    return records;
  }

  async recordAdherence(planActionId: string, completed: boolean, notes?: string) {
    const sub = await currentSub();
    if (!sub) throw new Error('Not authenticated');
    const { data } = await client.models.AdherenceLog.create({
      planActionId,
      patientId: sub,
      completed,
      notes: notes ?? '',
      completedAt: new Date().toISOString(),
    });
    if (completed) {
      await client.models.PlanAction.update({ id: planActionId, status: 'completed' });
    }
    return data;
  }

  async getPatientWearables() {
    const sub = await currentSub();
    if (!sub) throw new Error('Not authenticated');
    const [devices, readings] = await Promise.all([
      client.models.WearableDevice.list({ filter: { patientId: { eq: sub } } }),
      client.models.WearableReading.list({ filter: { patientId: { eq: sub } } }),
    ]);
    return {
      devices: (devices.data ?? []).map((d) => ({
        id: d.id,
        type: d.deviceType,
        name: d.deviceName,
        status: d.status,
        patient_id: d.patientId,
        device_type: d.deviceType,
        device_name: d.deviceName,
        manufacturer: d.manufacturer,
        last_synced_at: d.lastSyncedAt,
      })),
      // snake_case throughout, matching the WearableReading type and every
      // other mapper here. This one emitted camelCase, so `reading_type` came
      // back undefined and the wearables table crashed on `.replace`.
      readings: (readings.data ?? []).map((r) => ({
        id: r.id,
        patient_id: r.patientId,
        device_id: r.deviceId ?? null,
        reading_type: r.readingType ?? '',
        value: r.value ?? 0,
        unit: r.unit ?? '',
        device_type: r.deviceType ?? '',
        recorded_at: r.recordedAt,
        created_at: r.createdAt,
      })),
    };
  }

  async getWearableDevices() {
    const data = await this.getPatientWearables();
    return data.devices;
  }

  async getWearableReadings() {
    const data = await this.getPatientWearables();
    return data.readings;
  }

  async recordWearableDevice(device: {
    type: string;
    name: string;
    status?: string;
    manufacturer?: string;
  }) {
    const sub = await currentSub();
    if (!sub) throw new Error('Not authenticated');
    const { data } = await client.models.WearableDevice.create({
      patientId: sub,
      deviceType: device.type,
      deviceName: device.name,
      manufacturer: device.manufacturer ?? '',
      status: (device.status as 'connected' | 'disconnected') || 'connected',
    });
    return data;
  }

  async recordWearableReading(
    readingType: string,
    value: number,
    unit?: string,
    deviceType?: string
  ) {
    const sub = await currentSub();
    if (!sub) throw new Error('Not authenticated');
    const { data } = await client.models.WearableReading.create({
      patientId: sub,
      readingType,
      value,
      unit: unit ?? '',
      deviceType: deviceType ?? 'manual',
      recordedAt: new Date().toISOString(),
    });
    return data;
  }

  async syncWearableDevice(deviceId: string) {
    await client.models.WearableDevice.update({
      id: deviceId,
      lastSyncedAt: new Date().toISOString(),
      status: 'connected',
    });
    return { success: true, deviceId, synced_at: new Date().toISOString() };
  }

  async getNotifications() {
    const sub = await currentSub();
    if (!sub) return [];
    const { data } = await client.models.Notification.list({
      filter: { userId: { eq: sub } },
    });
    return (data ?? []).map((n) => ({
      id: n.id,
      user_id: n.userId ?? '',
      type: n.type ?? 'system',
      title: n.title ?? '',
      body: n.body ?? '',
      message: n.body ?? n.title ?? '',
      read: !!n.read,
      created_at: n.createdAt ?? new Date().toISOString(),
    }));
  }

  async markNotificationRead(notificationId: string) {
    await client.models.Notification.update({ id: notificationId, read: true });
    return { success: true };
  }

  async deleteNotification(notificationId: string) {
    await client.models.Notification.delete({ id: notificationId });
    return { success: true };
  }

  async getAgentActivity() {
    const sub = await currentSub();
    if (!sub) return [];
    const { data } = await client.models.AgentActivity.list({
      filter: { patientId: { eq: sub } },
    });
    return (data ?? [])
      .sort((a, b) => String(b.createdAt || '').localeCompare(String(a.createdAt || '')))
      .map((a) => ({
        id: a.id,
        patient_id: a.patientId,
        agent_type: a.agentType,
        status: a.status ?? '',
        // `action` is what the UI renders; the model stores status + message.
        action: a.message ?? a.status ?? '',
        message: a.message ?? '',
        details: {},
        created_at: a.createdAt,
      }));
  }

  async submitFeedback(payload: {
    plan_id?: string;
    rating: number;
    outcome_notes?: string;
    symptoms_improved?: boolean;
    side_effects?: string;
  }) {
    const sub = await currentSub();
    if (!sub) throw new Error('Not authenticated');
    const { data } = await client.models.Feedback.create({
      patientId: sub,
      planId: payload.plan_id,
      rating: payload.rating,
      outcomeNotes: payload.outcome_notes,
      symptomsImproved: payload.symptoms_improved,
      sideEffects: payload.side_effects,
    });
    return data;
  }

  async getClinicianPatients() {
    const sub = await currentSub();
    const { data } = await client.models.Profile.list({
      filter: { role: { eq: 'patient' } },
    });
    const patients: any[] = [];
    for (const p of data ?? []) {
      const mapped = mapProfile(p);
      if (!mapped || !mapped.id) continue;
      // Prefer patients assigned to this clinician; still list unassigned so doctor can claim
      const { data: risks } = await client.models.RiskScore.list({
        filter: { patientId: { eq: p.id } },
      });
      const sorted = [...(risks ?? [])].sort((a: any, b: any) =>
        String(b.recordedAt || '').localeCompare(String(a.recordedAt || ''))
      );
      const latest = sorted[0];
      // The one before it, so the UI can show a direction of travel rather
      // than a bare score. Absent on a patient's first assessment.
      const previous = sorted[1];
      const riskMapped = latest ? mapRisk(latest) : null;
      const prevMapped = previous ? mapRisk(previous) : null;
      patients.push({
        ...mapped,
        riskScore: latest?.overallRisk ?? riskMapped?.overall_risk ?? 0,
        riskLevel: (latest?.riskLevel as any) ?? riskMapped?.risk_level ?? 'low',
        latest_risk: riskMapped ?? undefined,
        prev_risk: prevMapped ?? undefined,
        assessment_count: sorted.length,
        assigned_to_me: !!(mapped.clinician_id && sub && mapped.clinician_id === sub),
      });
    }
    // Assigned patients first
    patients.sort((a, b) => Number(b.assigned_to_me) - Number(a.assigned_to_me));
    return { patients };
  }

  /** Doctor claims / links a patient to their panel */
  async assignPatientToMe(patientId: string) {
    const sub = await currentSub();
    if (!sub) throw new Error('Not authenticated');
    const { data } = await client.models.Profile.update({
      id: patientId,
      clinicianId: sub,
    });
    return mapProfile(data);
  }

  async getClinicianPatientDetail(patientId: string) {
    // Profile.get can fail under some auth shapes; fall back to list filter
    let profileRow: any = null;
    try {
      const got = await client.models.Profile.get({ id: patientId });
      profileRow = got.data;
    } catch {
      profileRow = null;
    }
    if (!profileRow) {
      const { data: listed } = await client.models.Profile.list({
        filter: { id: { eq: patientId } },
      });
      profileRow = listed?.[0] ?? null;
    }

    const [risks, plans, devices, readings, adherence] = await Promise.all([
      client.models.RiskScore.list({ filter: { patientId: { eq: patientId } } }),
      client.models.PreventionPlan.list({ filter: { patientId: { eq: patientId } } }),
      client.models.WearableDevice.list({ filter: { patientId: { eq: patientId } } }),
      client.models.WearableReading.list({ filter: { patientId: { eq: patientId } } }),
      client.models.AdherenceLog.list({ filter: { patientId: { eq: patientId } } }),
    ]);

    const planMapped = filterNonNull((plans.data ?? []).map(mapPlan));
    for (const plan of planMapped) {
      try {
        const { data: actions } = await client.models.PlanAction.list({
          filter: { planId: { eq: plan.id } },
        });
        plan.actions = filterNonNull(asArray(actions).map(mapAction));
      } catch {
        plan.actions = plan.actions || [];
      }
    }

    const trajectories = filterNonNull((risks.data ?? []).map(mapRisk)).sort(
      (a: any, b: any) =>
        String(a.recorded_at || '').localeCompare(String(b.recorded_at || ''))
    );

    return {
      profile: mapProfile(profileRow),
      risk: { trajectories },
      plans: { plans: planMapped },
      wearables: { devices: devices.data ?? [], readings: readings.data ?? [] },
      adherence: {
        records: (adherence.data ?? []).map((r: any) => ({
          id: r.id,
          plan_action_id: r.planActionId,
          patient_id: r.patientId,
          completed: !!r.completed,
          notes: r.notes ?? '',
          completed_at: r.completedAt,
          created_at: r.createdAt,
        })),
      },
    };
  }

  /**
   * Everything the Risk Monitor screen shows.
   *
   * It used to return only id/name/score/level with `factors: []`, which is
   * why the screen rendered zeros and empty panels: the previous score it
   * needed for a trend was never fetched, and the agent activity log was
   * never queried at all even though every assessment writes one row per
   * agent.
   */
  async getClinicianRiskMonitor() {
    const { patients } = await this.getClinicianPatients();
    const activity = await this.getClinicianAgentActivity();

    return {
      patients: patients
        .map((p: any) => ({
          id: p.id,
          name: `${p.first_name} ${p.last_name}`.trim(),
          email: p.email,
          score: p.riskScore ?? 0,
          level: p.riskLevel ?? 'low',
          factors: p.latest_risk?.contributing_factors ?? [],
          recorded_at: p.latest_risk?.recorded_at ?? null,
          prev_score: p.prev_risk?.overall_risk ?? null,
          prev_level: p.prev_risk?.risk_level ?? null,
          prev_recorded_at: p.prev_risk?.recorded_at ?? null,
          assessment_count: p.assessment_count ?? 0,
        }))
        .sort((a: any, b: any) => b.score - a.score),
      activity,
    };
  }

  /**
   * Agent trace rows across every patient, newest first.
   *
   * `getAgentActivity` is deliberately scoped to the signed-in user's own
   * record; a clinician needs the panel-wide view, so this is a separate
   * call rather than a flag on that one.
   */
  async getClinicianAgentActivity(limit = 40) {
    const { data } = await client.models.AgentActivity.list({});
    const rows = [...(data ?? [])].sort((a, b) =>
      String(b.createdAt || '').localeCompare(String(a.createdAt || ''))
    );

    // One profile lookup per patient, not per row: a single assessment
    // writes four rows and they all share a patient.
    const names = new Map<string, string>();
    const nameFor = async (patientId: string) => {
      const cached = names.get(patientId);
      if (cached !== undefined) return cached;
      let name = '';
      try {
        const { data: profile } = await client.models.Profile.get({ id: patientId });
        if (profile) name = `${profile.firstName ?? ''} ${profile.lastName ?? ''}`.trim();
      } catch {
        /* a deleted profile should not drop the trace row */
      }
      names.set(patientId, name);
      return name;
    };

    const out = [];
    for (const a of rows.slice(0, limit)) {
      const name = await nameFor(a.patientId);
      out.push({
        id: a.id,
        patient_id: a.patientId,
        patient_name: name,
        agent_type: a.agentType,
        status: a.status ?? '',
        // The UI reads `action`; the model stores status + message. Keep both
        // so neither the patient nor the clinician view renders "undefined".
        action: a.message ?? a.status ?? '',
        message: a.message ?? '',
        details: {},
        created_at: a.createdAt,
      });
    }
    return out;
  }

  /**
   * Plans for the review queue, plus the ones already decided.
   *
   * `plans` is what still needs a decision; `decided` is what a clinician has
   * approved or rejected, newest first. They are returned together because
   * the review screen shows both, and the query used to fetch only pending
   * ones — which is why "Recent Decisions" was permanently empty.
   *
   * A decision is identified by `approved_by` being set, not by status.
   * Status alone cannot tell them apart: `overridden` means both "a clinician
   * rejected this" and "a newer assessment superseded it", and only the
   * former has someone's id stamped on it.
   */
  async getClinicianPendingPlans() {
    const { data } = await client.models.PreventionPlan.list({
      filter: {
        or: [
          { status: { eq: 'pending_review' } },
          { status: { eq: 'draft' } },
          { status: { eq: 'active' } },
          { status: { eq: 'overridden' } },
          { status: { eq: 'completed' } },
        ],
      },
    });

    // One lookup per patient rather than per plan: a patient with several
    // plans was costing a profile fetch for each of them.
    const profileCache = new Map<string, { name: string; email: string }>();
    const lookup = async (patientId: string) => {
      const cached = profileCache.get(patientId);
      if (cached) return cached;
      let entry = { name: patientId, email: '' };
      try {
        const { data: profile } = await client.models.Profile.get({ id: patientId });
        if (profile) {
          entry = { name: `${profile.firstName} ${profile.lastName}`, email: profile.email };
        }
      } catch {
        /* a missing profile should not drop the plan from the queue */
      }
      profileCache.set(patientId, entry);
      return entry;
    };

    const all = [];
    for (const row of data ?? []) {
      const mapped = mapPlan(row);
      if (!mapped) continue;
      const patient = await lookup(row.patientId);
      all.push({ ...mapped, patient_name: patient.name, patient_email: patient.email });
    }

    const plans = all.filter(
      (p) => p.status === 'pending_review' || p.status === 'draft'
    );

    const decided = all
      .filter((p) => Boolean(p.approved_by))
      .sort(
        (a, b) =>
          new Date(b.approved_at ?? 0).getTime() - new Date(a.approved_at ?? 0).getTime()
      );

    return { plans, decided };
  }

  /**
   * Record a clinician's decision on a plan.
   *
   * Who decided and when are stamped for a rejection as well as an approval.
   * Previously a rejection cleared both, which left no record of who made the
   * call and made a rejected plan indistinguishable from one the system
   * superseded automatically.
   */
  async approvePlan(planId: string, approved: boolean, comments?: string) {
    const sub = await currentSub();
    if (!sub) throw new Error('Not authenticated');

    const { data, errors } = await client.models.PreventionPlan.update({
      id: planId,
      status: approved ? 'active' : 'overridden',
      approvedBy: sub,
      approvedAt: new Date().toISOString(),
      reviewComments: comments ?? '',
    });
    if (errors?.length) {
      throw new Error(errors.map((e: { message: string }) => e.message).join('; '));
    }
    return { success: true, plan: mapPlan(data) };
  }

  async getClinicianAnalytics() {
    const { patients } = await this.getClinicianPatients();
    const pending = await this.getClinicianPendingPlans();
    const riskRes = await this.getClinicianRiskMonitor();
    return {
      totalPatients: patients.length,
      highRiskCount: patients.filter(
        (p: any) => p.riskLevel === 'high' || p.riskLevel === 'very_high'
      ).length,
      averageRiskScore:
        patients.length === 0
          ? 0
          : Math.round(
              patients.reduce((s: number, p: any) => s + (p.riskScore ?? 0), 0) /
                patients.length
            ),
      patients: riskRes.patients,
      plansPending: pending.plans?.length ?? 0,
    };
  }

  // ─── Appointments & Care ───────────────────────────────────────────

  async listClinicians() {
    const { data } = await client.models.Profile.list({
      filter: { or: [{ role: { eq: 'clinician' } }, { role: { eq: 'doctor' } }] },
    });
    return filterNonNull((data ?? []).map(mapProfile));
  }

  async createDoctorSlots(slotDate: string, times: string[], durationMinutes = 30) {
    const sub = await currentSub();
    if (!sub) throw new Error('Not authenticated');
    const created = [];
    for (const slotTime of times) {
      // skip if slot already exists
      const { data: existing } = await client.models.DoctorSlot.list({
        filter: {
          and: [
            { clinicianId: { eq: sub } },
            { slotDate: { eq: slotDate } },
            { slotTime: { eq: slotTime } },
          ],
        },
      });
      if (existing && existing.length > 0) continue;
      const { data } = await client.models.DoctorSlot.create({
        clinicianId: sub,
        slotDate,
        slotTime,
        durationMinutes,
        isBooked: false,
      });
      if (data) created.push(data);
    }
    return created;
  }

  async getDoctorSlots(clinicianId?: string, slotDate?: string) {
    const sub = await currentSub();
    const cid = clinicianId || sub;
    if (!cid) return [];
    const filter: any = { clinicianId: { eq: cid } };
    if (slotDate) {
      const { data } = await client.models.DoctorSlot.list({
        filter: {
          and: [{ clinicianId: { eq: cid } }, { slotDate: { eq: slotDate } }],
        },
      });
      return data ?? [];
    }
    const { data } = await client.models.DoctorSlot.list({ filter });
    return (data ?? []).sort((a: any, b: any) =>
      `${a.slotDate}${a.slotTime}`.localeCompare(`${b.slotDate}${b.slotTime}`)
    );
  }

  async getAvailableSlots(clinicianId: string, slotDate: string) {
    const slots = await this.getDoctorSlots(clinicianId, slotDate);
    return slots.filter((s: any) => !s.isBooked);
  }

  async bookAppointment(payload: {
    clinicianId: string;
    slotId: string;
    appointmentDate: string;
    appointmentTime: string;
    reason?: string;
    patientNotes?: string;
  }) {
    const sub = await currentSub();
    if (!sub) throw new Error('Not authenticated');

    // Enforce one patient per slot
    const { data: slot } = await client.models.DoctorSlot.get({ id: payload.slotId });
    if (!slot) throw new Error('Slot not found');
    if (slot.isBooked) throw new Error('This slot is already booked. Choose another time.');
    if (slot.clinicianId !== payload.clinicianId) throw new Error('Invalid slot');

    const { data: appt } = await client.models.Appointment.create({
      patientId: sub,
      clinicianId: payload.clinicianId,
      slotId: payload.slotId,
      appointmentDate: payload.appointmentDate,
      appointmentTime: payload.appointmentTime,
      status: 'requested',
      reason: payload.reason ?? '',
      patientNotes: payload.patientNotes ?? '',
      createdBy: sub,
    });
    if (!appt) throw new Error('Failed to create appointment');

    await client.models.DoctorSlot.update({
      id: payload.slotId,
      isBooked: true,
      appointmentId: appt.id,
    });

    // Notify clinician
    await client.models.Notification.create({
      userId: payload.clinicianId,
      type: 'system',
      title: 'New appointment request',
      body: `Patient requested ${payload.appointmentDate} at ${payload.appointmentTime}`,
      read: false,
    });

    return this.mapAppointment(appt);
  }

  mapAppointment(row: any) {
    if (!row) return null;
    return {
      id: row.id,
      patient_id: row.patientId,
      doctor_id: row.clinicianId,
      clinician_id: row.clinicianId,
      slot_id: row.slotId,
      appointment_date: row.appointmentDate,
      appointment_time: row.appointmentTime,
      status: row.status,
      reason: row.reason ?? '',
      patient_notes: row.patientNotes ?? '',
      clinician_notes: row.clinicianNotes ?? '',
      notes: row.clinicianNotes ?? row.patientNotes ?? '',
      created_by: row.createdBy,
      created_at: row.createdAt,
      updated_at: row.updatedAt,
    };
  }

  async getMyAppointments() {
    const sub = await currentSub();
    if (!sub) return [];
    const { data } = await client.models.Appointment.list({
      filter: { patientId: { eq: sub } },
    });
    return filterNonNull((data ?? []).map((r) => this.mapAppointment(r)));
  }

  async getDoctorAppointments() {
    const sub = await currentSub();
    if (!sub) return [];
    const { data } = await client.models.Appointment.list({
      filter: { clinicianId: { eq: sub } },
    });
    const list = filterNonNull((data ?? []).map((r) => this.mapAppointment(r)));
    // attach patient names
    const enriched = [];
    for (const a of list) {
      let patient_name = a.patient_id;
      let patient_email = '';
      try {
        const { data: p } = await client.models.Profile.get({ id: a.patient_id });
        if (p) {
          patient_name = `${p.firstName} ${p.lastName}`;
          patient_email = p.email;
        }
      } catch { /* ignore */ }
      enriched.push({ ...a, patient_name, patient_email });
    }
    return enriched.sort((x: any, y: any) =>
      `${y.appointment_date}${y.appointment_time}`.localeCompare(
        `${x.appointment_date}${x.appointment_time}`
      )
    );
  }

  async updateAppointmentStatus(
    appointmentId: string,
    status: 'confirmed' | 'rejected' | 'completed' | 'cancelled',
    clinicianNotes?: string
  ) {
    const sub = await currentSub();
    const payload: any = { id: appointmentId, status };
    if (clinicianNotes !== undefined) payload.clinicianNotes = clinicianNotes;
    const { data } = await client.models.Appointment.update(payload);
    const appt = this.mapAppointment(data);

    // free slot if cancelled/rejected
    if ((status === 'cancelled' || status === 'rejected') && data?.slotId) {
      await client.models.DoctorSlot.update({
        id: data.slotId,
        isBooked: false,
        appointmentId: null as any,
      });
    }

    if (appt?.patient_id) {
      const title =
        status === 'confirmed'
          ? 'Appointment confirmed'
          : status === 'rejected'
            ? 'Appointment declined'
            : status === 'completed'
              ? 'Appointment completed'
              : 'Appointment cancelled';
      await client.models.Notification.create({
        userId: appt.patient_id,
        type: 'system',
        title,
        body: `${appt.appointment_date} at ${appt.appointment_time}`,
        read: false,
      });
    }
    return appt;
  }

  async addSymptomNote(payload: {
    patientId: string;
    appointmentId?: string;
    title: string;
    details: string;
  }) {
    const sub = await currentSub();
    if (!sub) throw new Error('Not authenticated');
    const { data } = await client.models.SymptomNote.create({
      patientId: payload.patientId,
      clinicianId: sub,
      appointmentId: payload.appointmentId,
      title: payload.title,
      details: payload.details,
      recordedAt: new Date().toISOString(),
    });
    return data;
  }

  async getSymptomNotes(patientId: string) {
    const { data } = await client.models.SymptomNote.list({
      filter: { patientId: { eq: patientId } },
    });
    return (data ?? []).map((n: any) => ({
      id: n.id,
      patient_id: n.patientId,
      clinician_id: n.clinicianId,
      appointment_id: n.appointmentId,
      title: n.title,
      details: n.details,
      recorded_at: n.recordedAt,
      created_at: n.createdAt,
    }));
  }

  async addPrescription(payload: {
    patientId: string;
    appointmentId?: string;
    medicationName: string;
    dosage?: string;
    frequency?: string;
    duration?: string;
    notes?: string;
    startedOn?: string;
  }) {
    const sub = await currentSub();
    if (!sub) throw new Error('Not authenticated');
    const { data } = await client.models.Prescription.create({
      patientId: payload.patientId,
      clinicianId: sub,
      appointmentId: payload.appointmentId,
      medicationName: payload.medicationName,
      dosage: payload.dosage ?? '',
      frequency: payload.frequency ?? '',
      duration: payload.duration ?? '',
      notes: payload.notes ?? '',
      startedOn: payload.startedOn ?? new Date().toISOString().slice(0, 10),
    });
    return data;
  }

  async getPrescriptions(patientId?: string) {
    const sub = await currentSub();
    const pid = patientId || sub;
    if (!pid) return [];
    const { data } = await client.models.Prescription.list({
      filter: { patientId: { eq: pid } },
    });
    return (data ?? []).map((r: any) => ({
      id: r.id,
      patient_id: r.patientId,
      clinician_id: r.clinicianId,
      appointment_id: r.appointmentId,
      medication_name: r.medicationName,
      dosage: r.dosage ?? '',
      frequency: r.frequency ?? '',
      duration: r.duration ?? '',
      notes: r.notes ?? '',
      started_on: r.startedOn,
      ended_on: r.endedOn,
    }));
  }

  async uploadCarePlan(payload: {
    patientId: string;
    appointmentId?: string;
    title: string;
    content: string;
    goals?: string;
    instructions?: string;
    followUpDate?: string;
  }) {
    const sub = await currentSub();
    if (!sub) throw new Error('Not authenticated');
    const { data } = await client.models.CarePlanDocument.create({
      patientId: payload.patientId,
      clinicianId: sub,
      appointmentId: payload.appointmentId,
      title: payload.title,
      content: payload.content,
      goals: payload.goals ?? '',
      instructions: payload.instructions ?? '',
      followUpDate: payload.followUpDate,
      status: 'active',
    });
    if (payload.patientId) {
      await client.models.Notification.create({
        userId: payload.patientId,
        type: 'plan_update',
        title: 'New care plan',
        body: payload.title,
        read: false,
      });
    }
    return data;
  }

  async getCarePlans(patientId?: string) {
    const sub = await currentSub();
    const pid = patientId || sub;
    if (!pid) return [];
    const { data } = await client.models.CarePlanDocument.list({
      filter: { patientId: { eq: pid } },
    });
    return (data ?? []).map((r: any) => ({
      id: r.id,
      patient_id: r.patientId,
      clinician_id: r.clinicianId,
      appointment_id: r.appointmentId,
      title: r.title,
      content: r.content,
      goals: r.goals ?? '',
      instructions: r.instructions ?? '',
      follow_up_date: r.followUpDate,
      status: r.status,
      created_at: r.createdAt,
    }));
  }

  async getPatientCareBundle(patientId: string) {
    const [notes, prescriptions, carePlans, appointments, risk] = await Promise.all([
      this.getSymptomNotes(patientId),
      this.getPrescriptions(patientId),
      this.getCarePlans(patientId),
      client.models.Appointment.list({ filter: { patientId: { eq: patientId } } }),
      client.models.RiskScore.list({ filter: { patientId: { eq: patientId } } }),
    ]);
    return {
      notes,
      prescriptions,
      carePlans,
      appointments: filterNonNull((appointments.data ?? []).map((r) => this.mapAppointment(r))),
      riskScores: filterNonNull((risk.data ?? []).map(mapRisk)),
    };
  }


}

export const apiClient = new AmplifyApiClient();
