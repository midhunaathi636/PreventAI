import { useEffect, useState, useCallback } from 'react';
import { AlertTriangle, TrendingUp, Activity, ArrowRight, Shield } from 'lucide-react';
import { useAuth } from '@/context/AuthContext';
import { Link } from '@/context/RouterContext';
import { apiClient } from '@/lib/aws-api-client';
import { Card, CardHeader, CardBody, Badge, EmptyState, Spinner, StatCard, Avatar } from '@/components/ui';
import { riskLevelColor, riskLevelLabel, getInitials, timeAgo, agentTypeLabel, agentTypeColor } from '@/lib/utils';
import type { Profile, RiskScore, AgentActivity } from '@/lib/types';

export function ClinicianRiskMonitor() {
  const { profile } = useAuth();
  const [loading, setLoading] = useState(true);
  const [highRiskPatients, setHighRiskPatients] = useState<(Profile & { latest_risk?: RiskScore; prev_risk?: RiskScore })[]>([]);
  const [risingRisk, setRisingRisk] = useState<(Profile & { latest_risk?: RiskScore; prev_risk?: RiskScore })[]>([]);
  const [activityLog, setActivityLog] = useState<(AgentActivity & { patient?: Profile })[]>([]);

  const load = useCallback(async () => {
    if (!profile) return;
    try {
      const data = await apiClient.getClinicianRiskMonitor();
      const patients = (data.patients || []) as { id: string; name: string; email: string; score: number; level: string; factors: string[] }[];
      const mapped = patients.map((p) => {
        const [first = '', ...rest] = (p.name || '').split(' ');
        const latest_risk = {
          overall_risk: p.score,
          risk_level: p.level as RiskScore['risk_level'],
          recorded_at: new Date().toISOString(),
          patient_id: p.id,
          id: p.id,
        } as RiskScore;
        return {
          id: p.id,
          email: p.email,
          first_name: first,
          last_name: rest.join(' '),
          role: 'patient' as const,
          latest_risk,
        } as Profile & { latest_risk?: RiskScore };
      });
      setHighRiskPatients(mapped.filter((p) => p.latest_risk && (p.latest_risk.risk_level === 'high' || p.latest_risk.risk_level === 'very_high')));
      setRisingRisk(mapped.filter((p) => p.latest_risk && p.latest_risk.overall_risk >= 40 && p.latest_risk.overall_risk < 70));
      setActivityLog([]);
    } catch (error) {
      console.error('Failed to load risk monitor data:', error);
    } finally {
      setLoading(false);
    }
  }, [profile]);

  useEffect(() => { load(); }, [load]);

  if (loading) return <div className="flex justify-center py-20"><Spinner className="h-8 w-8" /></div>;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-ink">Risk Monitor</h1>
        <p className="text-ink-dim mt-1">High-risk patients, rising risk alerts, and agent activity</p>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard label="High Risk Patients" value={highRiskPatients.length} icon={<AlertTriangle size={20} />} color="red" />
        <StatCard label="Rising Risk" value={risingRisk.length} icon={<TrendingUp size={20} />} color="amber" />
        <StatCard label="Agent Activities" value={activityLog.length} icon={<Activity size={20} />} color="blue" />
        <StatCard label="Safety Flags" value={activityLog.filter((a) => a.agent_type === 'safety').length} icon={<Shield size={20} />} color="violet" />
      </div>

      {/* High risk patients */}
      <Card>
        <CardHeader title="High-Risk Patients" subtitle="Patients with high or very high risk scores" icon={<AlertTriangle size={20} />} />
        <CardBody>
          {highRiskPatients.length > 0 ? (
            <div className="space-y-3">
              {highRiskPatients.map((p) => {
                const colors = riskLevelColor(p.latest_risk!.risk_level);
                return (
                  <Link key={p.id} to={`/clinician/patient/${p.id}`}>
                    <div className="flex items-center gap-4 p-4 rounded border border-hairline hover:border-red-300 transition-colors">
                      <Avatar initials={getInitials(p.first_name, p.last_name)} size="md" />
                      <div className="flex-1 min-w-0">
                        <div className="font-medium text-ink">{p.first_name} {p.last_name}</div>
                        <div className="text-sm text-ink-dim">Score: {p.latest_risk!.overall_risk}/100 · {timeAgo(p.latest_risk!.recorded_at)}</div>
                      </div>
                      <Badge className={`${colors.bg} ${colors.text} ${colors.border}`}>
                        <span className={`h-1.5 w-1.5 rounded-full ${colors.dot}`} />
                        {riskLevelLabel(p.latest_risk!.risk_level)}
                      </Badge>
                      <ArrowRight size={16} className="text-ink-faint" />
                    </div>
                  </Link>
                );
              })}
            </div>
          ) : (
            <EmptyState icon={<AlertTriangle size={28} />} title="No high-risk patients" message="All your patients are at moderate or low risk" />
          )}
        </CardBody>
      </Card>

      {/* Rising risk alerts */}
      <Card>
        <CardHeader title="Rising Risk Alerts" subtitle="Patients whose risk score has increased" icon={<TrendingUp size={20} />} />
        <CardBody>
          {risingRisk.length > 0 ? (
            <div className="space-y-3">
              {risingRisk.map((p) => {
                const delta = p.latest_risk!.overall_risk - p.prev_risk!.overall_risk;
                return (
                  <Link key={p.id} to={`/clinician/patient/${p.id}`}>
                    <div className="flex items-center gap-4 p-4 rounded border border-risk-moderate/30 bg-risk-moderate/10/50 hover:bg-risk-moderate/10 transition-colors">
                      <Avatar initials={getInitials(p.first_name, p.last_name)} size="md" />
                      <div className="flex-1 min-w-0">
                        <div className="font-medium text-ink">{p.first_name} {p.last_name}</div>
                        <div className="text-sm text-ink-dim">Risk: {p.prev_risk!.overall_risk} → {p.latest_risk!.overall_risk}</div>
                      </div>
                      <Badge className="bg-risk-moderate/10 text-risk-moderate border-risk-moderate/30">
                        <TrendingUp size={12} /> +{delta}
                      </Badge>
                      <ArrowRight size={16} className="text-ink-faint" />
                    </div>
                  </Link>
                );
              })}
            </div>
          ) : (
            <EmptyState icon={<TrendingUp size={28} />} title="No rising risk" message="No patients showing significant risk increases" />
          )}
        </CardBody>
      </Card>

      {/* Multi-agent activity log */}
      <Card>
        <CardHeader title="Multi-Agent Activity Log" subtitle="Recent AI agent operations across all patients" icon={<Activity size={20} />} />
        <CardBody>
          {activityLog.length > 0 ? (
            <div className="space-y-2">
              {activityLog.map((act) => (
                <div key={act.id} className="flex items-start gap-3 p-3 rounded bg-surface-2">
                  <div className={`mt-0.5 px-2 py-1 rounded text-xs font-medium ${agentTypeColor(act.agent_type)} flex-shrink-0`}>
                    {agentTypeLabel(act.agent_type)}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-medium text-ink">{act.action}</div>
                    <div className="text-xs text-ink-faint">
                      {act.patient ? `${act.patient.first_name} ${act.patient.last_name}` : 'Unknown'} · {timeAgo(act.created_at)}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <EmptyState icon={<Activity size={28} />} title="No agent activity" message="AI agents haven't run for your patients yet" />
          )}
        </CardBody>
      </Card>
    </div>
  );
}
