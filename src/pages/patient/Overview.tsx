import { useEffect, useState } from 'react';
import { TrendingDown, HeartPulse, ClipboardList, CheckCircle2, ArrowRight, Activity, Sparkles, AlertTriangle } from 'lucide-react';
import { useAuth } from '@/context/AuthContext';
import { Link } from '@/context/RouterContext';
import { apiClient } from '@/lib/aws-api-client';
import { Card, CardHeader, CardBody, StatCard, Button, Badge, EmptyState, Spinner } from '@/components/ui';
import { LineChart, DonutChart } from '@/components/charts';
import { riskLevelLabel, formatDate, domainColor, domainLabel, humanize } from '@/lib/utils';
import { AgentPipeline } from '@/components/AgentPipeline';
import type { AgentPipelineResult } from '@/lib/agent-service';
import type { RiskScore, PreventionPlan, PlanAction, AgentActivity } from '@/lib/types';

export function PatientOverview() {
  const { profile } = useAuth();
  const [loading, setLoading] = useState(true);
  const [runningAI, setRunningAI] = useState(false);
  const [riskScores, setRiskScores] = useState<RiskScore[]>([]);
  const [activePlan, setActivePlan] = useState<(PreventionPlan & { actions?: PlanAction[] }) | null>(null);
  const [adherenceRate, setAdherenceRate] = useState(0);
  const [recentActivity, setRecentActivity] = useState<AgentActivity[]>([]);
  const [pipeline, setPipeline] = useState<AgentPipelineResult | null>(null);
  const [aiError, setAiError] = useState<string | null>(null);

  useEffect(() => {
    if (profile) loadData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [profile]);

  async function loadData() {
    if (!profile) return;

    try {
      const [trajectories, plans, adherence, activity] = await Promise.all([
        apiClient.getRiskTrajectory().catch(() => []),
        apiClient.getPreventionPlans().catch(() => []),
        apiClient.getAdherence().catch(() => []),
        apiClient.getAgentActivity().catch(() => []),
      ]);

      const riskList = Array.isArray(trajectories) ? [...(trajectories as RiskScore[])] : [];
      riskList.sort(
        (a, b) => new Date(a.recorded_at).getTime() - new Date(b.recorded_at).getTime()
      );
      setRiskScores(riskList);

      const plan = (plans as PreventionPlan[])?.[0];
      if (plan) {
        // Plan already includes actions from API
        setActivePlan(plan);
      }

      const logs = (adherence as { completed: boolean }[]) || [];
      if (logs.length > 0) {
        setAdherenceRate(Math.round((logs.filter((l) => l.completed).length / logs.length) * 100));
      }

      setRecentActivity((activity as AgentActivity[]) || []);
    } catch (error) {
      console.error('Failed to load data', error);
    } finally {
      setLoading(false);
    }
  }

  async function handleRunAI() {
    if (!profile) return;
    setRunningAI(true);
    setAiError(null);
    setPipeline(null);
    try {
      const result = await apiClient.runFullAssessment();
      setPipeline(result.pipeline);
      await loadData();
    } catch (err) {
      // Surfaced in the pipeline panel rather than an alert() the user has to
      // dismiss before they can read it.
      setAiError(err instanceof Error ? err.message : String(err));
    } finally {
      setRunningAI(false);
    }
  }

  if (loading) {
    return <div className="flex justify-center py-20"><Spinner className="h-8 w-8" /></div>;
  }

  const latestRisk = riskScores[riskScores.length - 1];
  const previousRisk = riskScores[riskScores.length - 2];
  const riskTrend = latestRisk && previousRisk ? latestRisk.overall_risk - previousRisk.overall_risk : 0;

  const chartData = riskScores.map((r) => ({
    label: formatDate(r.recorded_at).split(' ').slice(0, 2).join(' '),
    value: r.overall_risk,
  }));

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-ink">Welcome back, {profile?.first_name}</h1>
          <p className="text-ink-dim mt-1">Here's your health risk overview</p>
        </div>
        <Button onClick={handleRunAI} disabled={runningAI}>
          {runningAI ? (
            <><Spinner className="h-4 w-4" /> Running AI Agents...</>
          ) : (
            <><Sparkles size={18} /> Run AI Assessment</>
          )}
        </Button>
      </div>

      {/* Agent pipeline — live trace of risk → plan → personalize → safety */}
      <AgentPipeline running={runningAI} result={pipeline} error={aiError} />

      {/* Stats row */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard
          label="Current Risk Score"
          value={latestRisk ? `${latestRisk.overall_risk}/100` : '—'}
          sublabel={latestRisk ? riskLevelLabel(latestRisk.risk_level) : 'No data yet'}
          icon={<TrendingDown size={20} />}
          color={latestRisk ? (latestRisk.risk_level === 'low' ? 'emerald' : latestRisk.risk_level === 'moderate' ? 'amber' : 'red') : 'teal'}
        />
        <StatCard
          label="Risk Trend"
          value={riskTrend === 0 ? '—' : riskTrend > 0 ? `+${riskTrend}` : `${riskTrend}`}
          sublabel={riskTrend < 0 ? 'Improving' : riskTrend > 0 ? 'Rising' : 'Stable'}
          icon={<Activity size={20} />}
          color={riskTrend < 0 ? 'emerald' : riskTrend > 0 ? 'red' : 'teal'}
        />
        <StatCard
          label="Active Plan"
          value={activePlan ? `v${activePlan.plan_version}` : 'None'}
          sublabel={activePlan ? `-${activePlan.expected_risk_reduction}% expected` : 'Run AI to generate'}
          icon={<ClipboardList size={20} />}
          color="blue"
        />
        <StatCard
          label="Adherence"
          value={`${adherenceRate}%`}
          sublabel={adherenceRate >= 75 ? 'On track' : 'Needs improvement'}
          icon={<CheckCircle2 size={20} />}
          color={adherenceRate >= 75 ? 'emerald' : 'amber'}
        />
      </div>

      <div className="grid lg:grid-cols-3 gap-6">
        {/* Risk Trend Chart */}
        <Card className="lg:col-span-2">
          <CardHeader
            title="Risk Trajectory"
            subtitle="Overall risk score over time"
            icon={<TrendingDown size={20} />}
          />
          <CardBody>
            {chartData.length > 0 ? (
              <LineChart data={chartData} height={260} threshold={40} thresholdLabel="High Risk Threshold" />
            ) : (
              <EmptyState
                icon={<TrendingDown size={32} />}
                title="No risk data yet"
                message="Run an AI assessment to generate your first risk score and trajectory."
                action={<Button onClick={handleRunAI} disabled={runningAI}><Sparkles size={16} /> Run AI Assessment</Button>}
              />
            )}
          </CardBody>
        </Card>

        {/* Risk Breakdown */}
        <Card>
          <CardHeader title="Risk Breakdown" subtitle="By category" icon={<HeartPulse size={20} />} />
          <CardBody>
            {latestRisk ? (
              <div className="flex flex-col items-center gap-4">
                <DonutChart
                  segments={[
                    { label: 'CVD', value: latestRisk.cvd_risk, color: '#0d9488' },
                    { label: 'Diabetes', value: latestRisk.diabetes_risk, color: '#f59e0b' },
                    { label: 'Cancer', value: latestRisk.cancer_risk, color: '#8b5cf6' },
                    { label: 'Stroke', value: latestRisk.stroke_risk, color: '#3b82f6' },
                  ]}
                  centerValue={latestRisk.overall_risk.toString()}
                  centerLabel="Overall"
                />
                <div className="w-full space-y-2">
                  <RiskMiniRow label="CVD" value={latestRisk.cvd_risk} color="#0d9488" />
                  <RiskMiniRow label="Diabetes" value={latestRisk.diabetes_risk} color="#f59e0b" />
                  <RiskMiniRow label="Cancer" value={latestRisk.cancer_risk} color="#8b5cf6" />
                  <RiskMiniRow label="Stroke" value={latestRisk.stroke_risk} color="#3b82f6" />
                </div>
              </div>
            ) : (
              <EmptyState icon={<HeartPulse size={32} />} title="No data" message="Run AI assessment to see breakdown" />
            )}
          </CardBody>
        </Card>
      </div>

      {/* Active Plan Summary + Next Action */}
      <div className="grid lg:grid-cols-2 gap-6">
        <Card>
          <CardHeader
            title="Active Prevention Plan"
            subtitle={activePlan ? `Expected reduction: -${activePlan.expected_risk_reduction}%` : 'No active plan'}
            icon={<ClipboardList size={20} />}
            action={activePlan && <Link to="/patient/current-plan" className="text-sm text-accent hover:text-accent font-medium inline-flex items-center gap-1">View <ArrowRight size={14} /></Link>}
          />
          <CardBody>
            {activePlan && activePlan.actions ? (
              <div className="space-y-3">
                {activePlan.safety_verified && (
                  <Badge className="bg-risk-low/10 text-risk-low border-risk-low/30">
                    <CheckCircle2 size={12} /> Safety Verified
                  </Badge>
                )}
                {activePlan.actions.slice(0, 4).map((action) => (
                  <div key={action.id} className="flex items-center gap-3 p-3 rounded bg-surface-2">
                    <div className={`px-2 py-1 rounded text-xs font-medium ${domainColor(action.domain).bg} ${domainColor(action.domain).text}`}>
                      {domainLabel(action.domain)}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-medium text-ink truncate">{action.title}</div>
                      <div className="text-xs text-ink-dim">{action.frequency}</div>
                    </div>
                    <Badge className="bg-accent/10 text-accent border-accent/30">-{action.expected_impact}%</Badge>
                  </div>
                ))}
                {activePlan.actions.length > 4 && (
                  <Link to="/patient/current-plan" className="block text-center text-sm text-accent hover:text-accent py-2">
                    View all {activePlan.actions.length} actions
                  </Link>
                )}
              </div>
            ) : (
              <EmptyState
                icon={<ClipboardList size={32} />}
                title="No active plan"
                message="Run an AI assessment to generate your personalized prevention plan."
              />
            )}
          </CardBody>
        </Card>

        {/* Agent Activity */}
        <Card>
          <CardHeader title="AI Agent Activity" subtitle="Recent multi-agent operations" icon={<Activity size={20} />} />
          <CardBody>
            {recentActivity.length > 0 ? (
              <div className="space-y-3">
                {recentActivity.map((act) => (
                  <div key={act.id} className="flex items-start gap-3">
                    <div className={`mt-0.5 p-1.5 rounded text-xs font-medium ${act.agent_type === 'risk' ? 'bg-risk-high/10 text-risk-high' : act.agent_type === 'plan_generation' ? 'bg-accent/10 text-accent' : act.agent_type === 'safety' ? 'bg-agent-safety/10 text-agent-safety' : 'bg-agent-plan/10 text-agent-plan'}`}>
                      {act.agent_type === 'risk' ? <TrendingDown size={14} /> : act.agent_type === 'plan_generation' ? <ClipboardList size={14} /> : act.agent_type === 'safety' ? <AlertTriangle size={14} /> : <Sparkles size={14} />}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-medium text-ink">{act.action}</div>
                      <div className="text-xs text-ink-dim capitalize">{humanize(act.agent_type)} agent · {formatDate(act.created_at)}</div>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <EmptyState icon={<Activity size={32} />} title="No agent activity" message="Run an AI assessment to see multi-agent operations" />
            )}
          </CardBody>
        </Card>
      </div>

      {/* Risk Factors */}
      {latestRisk && latestRisk.contributing_factors && latestRisk.contributing_factors.length > 0 && (
        <Card>
          <CardHeader title="Contributing Risk Factors" subtitle="Factors identified by the Risk Agent" icon={<AlertTriangle size={20} />} />
          <CardBody>
            <div className="flex flex-wrap gap-2">
              {latestRisk.contributing_factors.map((factor, i) => (
                <Badge key={i} className="bg-risk-moderate/10 text-risk-moderate border-risk-moderate/30">
                  <AlertTriangle size={12} /> {factor}
                </Badge>
              ))}
            </div>
          </CardBody>
        </Card>
      )}
    </div>
  );
}

function RiskMiniRow({ label, value, color }: { label: string; value: number; color: string }) {
  return (
    <div className="flex items-center gap-3">
      <span className="text-sm text-ink-dim w-20">{label}</span>
      <div className="flex-1 h-2 bg-surface-3 rounded-full overflow-hidden">
        <div className="h-full rounded-full transition-all duration-700" style={{ width: `${value}%`, backgroundColor: color }} />
      </div>
      <span className="text-sm font-semibold text-ink w-10 text-right">{value}%</span>
    </div>
  );
}
