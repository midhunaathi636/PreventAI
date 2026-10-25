/**
 * Thin façade over the agent pipeline.
 *
 * The agents themselves live in the FastAPI service (`backend/`); this module
 * exists so UI code has one obvious place to call and does not reach into the
 * Amplify client directly.
 */

import { apiClient } from '@/lib/aws-api-client';
import {
  agentService,
  AgentServiceError,
  type AgentPipelineResult,
  type AgentRiskAssessment,
  type PatientSnapshot,
} from '@/lib/agent-service';
import type { PreventionPlan, RiskScore } from '@/lib/types';

export { AgentServiceError };
export type { AgentPipelineResult, AgentRiskAssessment };

/** The latest persisted risk score for the signed-in patient. */
export async function getRiskScore(): Promise<RiskScore | null> {
  const trajectories = await apiClient.getRiskTrajectory();
  const list = (trajectories as RiskScore[]) || [];
  return list.length ? list[list.length - 1] : null;
}

/** The patient's current prevention plan. */
export async function getPreventionPlan(): Promise<PreventionPlan | null> {
  const plans = await apiClient.getPatientPlans();
  return plans?.[0] ?? null;
}

/**
 * Run all four agents and persist the result.
 *
 * `overrides` lets a caller substitute values into the snapshot — used by the
 * clinician's what-if view.
 */
export async function runAIAssessment(overrides: Partial<PatientSnapshot> = {}) {
  return apiClient.runFullAssessment(overrides);
}

/** @deprecated name kept for existing callers; use {@link runAIAssessment}. */
export const triggerPlanGeneration = (
  _patientId?: string,
  overrides: Partial<PatientSnapshot> = {}
) => runAIAssessment(overrides);

/** Score risk without writing anything — safe to call on every slider move. */
export async function previewRisk(overrides: Partial<PatientSnapshot> = {}) {
  return apiClient.previewRisk(overrides);
}

/** Is the agent service up? Never throws. */
export async function isAgentServiceAvailable(): Promise<boolean> {
  return agentService.isAvailable();
}
