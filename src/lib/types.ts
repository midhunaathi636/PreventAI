export type UserRole = 'patient' | 'doctor' | 'clinician';

export type RiskLevel = 'low' | 'moderate' | 'high' | 'very_high';

export type PlanStatus = 'draft' | 'pending_review' | 'active' | 'completed' | 'overridden';

export type ActionDomain = 'lifestyle' | 'screening' | 'behavioral' | 'medication_adherence';

export type ActionStatus = 'pending' | 'in_progress' | 'completed';

export type NotificationType =
  | 'risk_alert'
  | 'plan_update'
  | 'adherence_reminder'
  | 'agent_activity'
  | 'system';

export type AgentType = 'risk' | 'plan_generation' | 'personalization' | 'safety';

export type DeviceStatus = 'connected' | 'disconnected';

export interface Profile {
  id: string;
  email: string;
  role: UserRole;
  first_name: string;
  last_name: string;
  date_of_birth: string | null;
  gender: string;
  phone: string;
  address: string;
  health_preferences: Record<string, unknown>;
  constraints: string[];
  genetic_markers: Record<string, unknown>;
  clinician_id: string | null;
  created_at: string;
  updated_at: string;
}

export interface Appointment {
  id: string;
  patient_id: string;
  doctor_id: string;
  appointment_date: string;
  appointment_time: string;
  reason: string;
  notes: string;
  status: 'requested' | 'confirmed' | 'completed' | 'cancelled';
  created_by: string;
  created_at: string;
  updated_at: string;
}

export interface DoctorLeave {
  id: string;
  doctor_id: string;
  leave_date: string;
  start_time: string | null;
  end_time: string | null;
  reason: string;
  created_at: string;
}

export interface PatientReport {
  id: string;
  patient_id: string;
  author_id: string;
  report_type: 'symptoms' | 'general_note';
  title: string;
  details: string;
  recorded_at: string;
  created_at: string;
}

export interface PatientMedication {
  id: string;
  patient_id: string;
  author_id: string;
  medication_name: string;
  dosage: string;
  frequency: string;
  started_on: string | null;
  ended_on: string | null;
  notes: string;
  created_at: string;
}

export interface MedicalRecord {
  id: string;
  patient_id: string;
  doctor_id: string;
  record_type: string;
  value: number;
  secondary_value: number | null;
  unit: string;
  notes: string;
  recorded_at: string;
  created_at: string;
}

export interface DoctorPlan {
  id: string;
  patient_id: string;
  doctor_id: string;
  title: string;
  goals: string;
  instructions: string;
  follow_up_date: string | null;
  status: 'draft' | 'active' | 'completed' | 'cancelled';
  created_at: string;
  updated_at: string;
}

export type DoctorPlanItemType = 'medication' | 'workout';

export interface DoctorPlanItem {
  id: string;
  patient_id: string;
  doctor_id: string;
  item_type: DoctorPlanItemType;
  title: string;
  details: string;
  frequency: string;
  active: boolean;
  created_at: string;
  updated_at: string;
}

export interface DoctorPlanItemLog {
  id: string;
  item_id: string;
  patient_id: string;
  completed_on: string;
  completed: boolean;
  created_at: string;
  updated_at: string;
}

export interface RiskScore {
  id: string;
  patient_id: string;
  cvd_risk: number;
  diabetes_risk: number;
  cancer_risk: number;
  stroke_risk: number;
  overall_risk: number;
  risk_level: RiskLevel;
  contributing_factors: string[];
  recorded_at: string;
  created_at: string;
  score?: number;
  level?: RiskLevel;
  factors?: { name: string; weight: number; value: string }[];
}

export interface PreventionPlan {
  id: string;
  patient_id: string;
  clinician_id: string | null;
  status: PlanStatus;
  title?: string;
  summary?: string;
  expected_risk_reduction: number;
  ai_explanation: string;
  safety_verified: boolean;
  safety_notes: string;
  approved_by: string | null;
  approved_at: string | null;
  plan_version: number;
  review_comments?: string;
  created_at: string;
  updated_at: string;
  actions?: PlanAction[];
}

export interface PlanAction {
  id: string;
  plan_id: string;
  domain: ActionDomain;
  title: string;
  description: string;
  frequency: string;
  expected_impact: number;
  status: ActionStatus;
  sort_order: number;
  created_at: string;
}

export interface AdherenceLog {
  id: string;
  plan_action_id: string;
  patient_id: string;
  completed: boolean;
  notes: string;
  completed_at: string;
  created_at: string;
}

export interface WearableDevice {
  id: string;
  patient_id: string;
  device_type: string;
  device_name: string;
  manufacturer: string;
  status: DeviceStatus;
  last_synced_at: string | null;
  created_at: string;
}

export interface WearableReading {
  id: string;
  patient_id: string;
  device_id: string | null;
  reading_type: string;
  value: number;
  unit: string;
  recorded_at: string;
  created_at: string;
}

export interface Notification {
  id: string;
  user_id: string;
  title: string;
  message: string;
  body?: string | null;
  type: NotificationType;
  read: boolean;
  created_at: string;
}

export interface AgentActivity {
  id: string;
  patient_id: string;
  agent_type: AgentType;
  action: string;
  details: Record<string, unknown>;
  created_at: string;
}

export interface Feedback {
  id: string;
  patient_id: string;
  plan_id: string | null;
  rating: number;
  outcome_notes: string;
  symptoms_improved: boolean;
  side_effects: string;
  created_at: string;
}

export interface QuestionnaireResponse {
  id: string;
  patient_id: string;
  responses: Record<string, unknown>;
  submitted_at: string;
  created_at: string;
}

export interface PlanWithActions extends PreventionPlan {
  actions?: PlanAction[];
}

export interface RiskScoreWithPatient extends RiskScore {
  patient?: Pick<Profile, 'id' | 'first_name' | 'last_name' | 'email'>;
}
