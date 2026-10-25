import { useEffect, useState, useCallback } from 'react';
import { ArrowLeft, TrendingDown, ClipboardList, CheckCircle2, Brain, Shield, Activity, Check, Ban, Sparkles, Pencil } from 'lucide-react';
import { useAuth } from '@/context/AuthContext';
import { Link, useRouter } from '@/context/RouterContext';
import { apiClient } from '@/lib/aws-api-client';
import { Card, CardHeader, CardBody, Badge, Spinner, EmptyState, Button, Avatar, StatCard } from '@/components/ui';
import { AgentPipeline } from '@/components/AgentPipeline';
import { PatientEditModal, type PatientEditValues } from '@/components/PatientEditModal';
import type { AgentPipelineResult } from '@/lib/agent-service';
import { LineChart } from '@/components/charts';
import { riskLevelColor, riskLevelLabel, getInitials, formatDate, getAge, domainLabel, domainColor, planStatusLabel, planStatusColor } from '@/lib/utils';
import type { Profile, RiskScore, PreventionPlan, PlanAction, AdherenceLog } from '@/lib/types';

export function ClinicianPatientDetail({ patientId }: { patientId: string }) {
  const { profile } = useAuth();
  const { navigate } = useRouter();
  const [loading, setLoading] = useState(true);
  const [patient, setPatient] = useState<Profile | null>(null);
  const [riskScores, setRiskScores] = useState<RiskScore[]>([]);
  const [plans, setPlans] = useState<(PreventionPlan & { actions?: PlanAction[] })[]>([]);
  const [adherence, setAdherence] = useState<AdherenceLog[]>([]);
  const [runningAI, setRunningAI] = useState(false);
  const [pipeline, setPipeline] = useState<AgentPipelineResult | null>(null);
  const [aiError, setAiError] = useState<string | null>(null);
  const [editing, setEditing] = useState(false);

  /** Persist clinician edits, then reload so the page shows the new record. */
  async function handleSavePatient(updates: Partial<PatientEditValues>) {
    await apiClient.updatePatientProfileById(patientId, updates);
    await load();
  }

  /**
   * Order an assessment for this patient.
   *
   * Runs the same four agents the patient's own button runs; the plan comes
   * back stamped with this clinician and lands in their review queue.
   */
  async function handleRunAssessment() {
    if (!patientId) return;
    setRunningAI(true);
    setAiError(null);
    setPipeline(null);
    try {
      const result = await apiClient.runAssessmentForPatient(patientId);
      setPipeline(result.pipeline);
      await load();
    } catch (err) {
      setAiError(err instanceof Error ? err.message : String(err));
    } finally {
      setRunningAI(false);
    }
  }

  const load = useCallback(async () => {
    try {
      const data = await apiClient.getClinicianPatientDetail(patientId);
      setPatient(data.profile || null);
      const risks = (data.risk?.trajectories || data.risk || []) as any[];
      setRiskScores(risks.filter(Boolean) as RiskScore[]);
      const planList = (data.plans?.plans || data.plans || []) as any[];
      setPlans(planList.filter(Boolean) as (PreventionPlan & { actions?: PlanAction[] })[]);
      const adh = (data.adherence?.records || data.adherence || []) as any[];
      setAdherence(
        adh.filter(Boolean).map((r: any) => ({
          id: r.id,
          plan_action_id: r.plan_action_id ?? r.planActionId ?? '',
          patient_id: r.patient_id ?? r.patientId ?? '',
          completed: !!r.completed,
          notes: r.notes ?? '',
          completed_at: r.completed_at ?? r.completedAt ?? r.recorded_at ?? '',
          created_at: r.created_at ?? r.createdAt ?? '',
        })) as AdherenceLog[]
      );
    } catch (error) {
      console.error('Failed to load patient detail:', error);
      setPatient(null);
    } finally {
      setLoading(false);
    }
  }, [patientId]);

  useEffect(() => { load(); }, [load]);

  async function approvePlan(plan: PreventionPlan) {
    try {
      await apiClient.approvePlan(plan.id, true);
      load();
    } catch (error) {
      console.error('Failed to approve plan:', error);
    }
  }

  async function overridePlan(plan: PreventionPlan) {
    try {
      await apiClient.approvePlan(plan.id, false);
      load();
    } catch (error) {
      console.error('Failed to override plan:', error);
    }
  }

  if (loading) return <div className="flex justify-center py-20"><Spinner className="h-8 w-8" /></div>;
  if (!patient) return (
    <Card><CardBody>
      <EmptyState icon={<Activity size={32} />} title="Patient not found" message="This patient may not exist or isn't assigned to you." />
    </CardBody></Card>
  );

  const latestRisk = riskScores[riskScores.length - 1];
  const riskColors = latestRisk ? riskLevelColor(latestRisk.risk_level) : null;
  const chartData = riskScores.map((r) => ({ label: formatDate(r.recorded_at).split(' ').slice(0, 2).join(' '), value: r.overall_risk }));
  const completedActions = adherence.filter((a) => a.completed).length;
  const adherenceRate = adherence.length > 0 ? Math.round((completedActions / adherence.length) * 100) : 0;
  const age = getAge(patient.date_of_birth);
  const pendingPlan = plans.find((p) => p.status === 'pending_review');

  return (
    <div className="space-y-6">
      <button onClick={() => navigate('/clinician')} className="flex items-center gap-2 text-sm text-ink-dim hover:text-ink-dim">
        <ArrowLeft size={16} /> Back to Patients
      </button>

      <Card className="p-6">
        <div className="flex items-start gap-4">
          <Avatar initials={getInitials(patient.first_name, patient.last_name)} size="lg" />
          <div className="flex-1">
            <h1 className="text-2xl font-bold text-ink">{patient.first_name} {patient.last_name}</h1>
            <div className="text-ink-dim">{patient.email}</div>
            <div className="flex flex-wrap items-center gap-3 mt-2 text-sm text-ink-dim">
              {age && <span>Age: {age}</span>}
              {patient.gender && <span>· {patient.gender}</span>}
              <span>· Joined {formatDate(patient.created_at)}</span>
            </div>
          </div>
          <div className="flex flex-shrink-0 flex-col items-end gap-3">
            {latestRisk && riskColors && (
              <Badge className={`${riskColors.bg} ${riskColors.text} ${riskColors.border}`}>
                <span className={`h-1.5 w-1.5 rounded-full ${riskColors.dot}`} />
                {riskLevelLabel(latestRisk.risk_level)} · {latestRisk.overall_risk}/100
              </Badge>
            )}
            <Button variant="outline" size="sm" onClick={() => setEditing(true)}>
              <Pencil size={15} /> Edit patient
            </Button>
          </div>
        </div>
      </Card>

      {/* Clinician-ordered assessment. Same pipeline as the patient's own. */}
      <Card>
        <CardHeader
          title="AI Assessment"
          subtitle="Run the four agents against this patient's record"
          icon={<Sparkles size={20} />}
          action={
            <Button onClick={handleRunAssessment} disabled={runningAI}>
              {runningAI ? (
                <>
                  <Spinner className="h-4 w-4" /> Running
                </>
              ) : (
                <>
                  <Sparkles size={16} /> Run assessment
                </>
              )}
            </Button>
          }
        />
        {(runningAI || pipeline || aiError) && (
          <CardBody>
            <AgentPipeline running={runningAI} result={pipeline} error={aiError} />
          </CardBody>
        )}
        {!runningAI && !pipeline && !aiError && (
          <CardBody>
            <p className="text-small text-ink-dim">
              Scores risk, generates a plan, adapts it to this patient's constraints, then screens
              it for safety. The result is saved to their record and queued for your review.
            </p>
          </CardBody>
        )}
      </Card>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard label="Overall Risk" value={latestRisk ? `${latestRisk.overall_risk}` : '—'} icon={<TrendingDown size={20} />} color="teal" />
        <StatCard label="Active Plans" value={plans.filter((p) => p.status === 'active').length} icon={<ClipboardList size={20} />} color="blue" />
        <StatCard label="Adherence" value={`${adherenceRate}%`} icon={<CheckCircle2 size={20} />} color="emerald" />
        <StatCard label="Pending Review" value={pendingPlan ? 1 : 0} icon={<Shield size={20} />} color="amber" />
      </div>

      {chartData.length > 1 && (
        <Card>
          <CardHeader title="Risk Trajectory" subtitle="Historical overall risk scores" icon={<TrendingDown size={20} />} />
          <CardBody>
            <LineChart data={chartData} />
          </CardBody>
        </Card>
      )}

      {pendingPlan && (
        <Card className="border-risk-moderate/30">
          <CardHeader title="Plan Pending Review" subtitle={`Plan v${pendingPlan.plan_version}`} icon={<Brain size={20} />} />
          <CardBody>
            <p className="text-sm text-ink-dim mb-4">{pendingPlan.ai_explanation}</p>
            <div className="flex flex-wrap gap-2 mb-4">
              {(pendingPlan.actions || []).slice(0, 8).map((a) => (
                <span key={a.id} className={`px-2 py-1 rounded text-xs font-medium ${domainColor(a.domain).bg} ${domainColor(a.domain).text}`}>
                  {domainLabel(a.domain)}: {a.title}
                </span>
              ))}
            </div>
            <div className="flex gap-2">
              <Button size="sm" onClick={() => approvePlan(pendingPlan)}><Check size={14} /> Approve</Button>
              <Button size="sm" variant="danger" onClick={() => overridePlan(pendingPlan)}><Ban size={14} /> Override</Button>
            </div>
          </CardBody>
        </Card>
      )}

      <Card>
        <CardHeader title="Prevention Plans" subtitle="All plans for this patient" icon={<ClipboardList size={20} />} />
        <CardBody>
          {plans.length > 0 ? (
            <div className="space-y-3">
              {plans.map((plan) => {
                const sc = planStatusColor(plan.status);
                return (
                  <div key={plan.id} className="flex items-center gap-3 p-3 rounded border border-hairline">
                    <div className="flex-1">
                      <div className="font-medium text-ink">Plan v{plan.plan_version}</div>
                      <div className="text-xs text-ink-dim">{formatDate(plan.created_at)} · Expected reduction: -{plan.expected_risk_reduction}%</div>
                    </div>
                    <Badge className={`${sc.bg} ${sc.text} ${sc.border}`}>{planStatusLabel(plan.status)}</Badge>
                  </div>
                );
              })}
            </div>
          ) : (
            <EmptyState icon={<ClipboardList size={28} />} title="No plans yet" message="AI-generated plans will appear here" />
          )}
        </CardBody>
      </Card>

      {patient && (
        <PatientEditModal
          patient={patient}
          open={editing}
          onClose={() => setEditing(false)}
          onSave={handleSavePatient}
        />
      )}
    </div>
  );
}
