import { useEffect, useState, useCallback } from 'react';
import { BarChart3, TrendingDown, Users, CheckCircle2, Activity, Heart } from 'lucide-react';
import { useAuth } from '@/context/AuthContext';
import { apiClient } from '@/lib/aws-api-client';
import { Card, CardHeader, CardBody, Spinner, EmptyState, StatCard } from '@/components/ui';
import { BarChart, LineChart, DonutChart } from '@/components/charts';
import { formatDate } from '@/lib/utils';
import type { Profile, RiskScore, PreventionPlan, AdherenceLog } from '@/lib/types';

export function ClinicianAnalytics() {
  const { profile } = useAuth();
  const [loading, setLoading] = useState(true);
  const [patients, setPatients] = useState<Profile[]>([]);
  const [allScores, setAllScores] = useState<RiskScore[]>([]);
  const [allPlans, setAllPlans] = useState<PreventionPlan[]>([]);
  const [allAdherence, setAllAdherence] = useState<AdherenceLog[]>([]);

  const load = useCallback(async () => {
    if (!profile) return;
    try {
      const data = await apiClient.getClinicianAnalytics();
      // API returns summary + patients list (id, name, email, score, level)
      const rawPatients = (data.patients || []) as { id: string; name: string; email: string; score: number; level: string }[];
      const mappedPatients: Profile[] = rawPatients.map((p) => {
        const [first = '', ...rest] = (p.name || '').split(' ');
        return {
          id: p.id,
          email: p.email,
          role: 'patient',
          first_name: first,
          last_name: rest.join(' '),
          date_of_birth: null,
          gender: '',
          phone: '',
          address: '',
          health_preferences: {},
          constraints: [],
          genetic_markers: {},
          clinician_id: null,
          created_at: '',
          updated_at: '',
        };
      });
      setPatients(mappedPatients);
      setAllScores(
        rawPatients.map((p) => ({
          id: p.id,
          patient_id: p.id,
          overall_risk: p.score,
          risk_level: p.level as RiskScore['risk_level'],
          recorded_at: new Date().toISOString(),
          cvd_risk: 0,
          diabetes_risk: 0,
          cancer_risk: 0,
          stroke_risk: 0,
          contributing_factors: [],
          created_at: '',
        }))
      );
      setAllPlans([]);
      setAllAdherence([]);
    } catch (error) {
      console.error('Failed to load analytics:', error);
    } finally {
      setLoading(false);
    }
  }, [profile]);

  useEffect(() => { load(); }, [load]);

  if (loading) return <div className="flex justify-center py-20"><Spinner className="h-8 w-8" /></div>;

  if (patients.length === 0) {
    return (
      <div className="space-y-6">
        <h1 className="text-2xl font-bold text-ink">Analytics</h1>
        <Card><CardBody>
          <EmptyState icon={<BarChart3 size={32} />} title="No data available" message="Analytics will appear once you have patients with health data." />
        </CardBody></Card>
      </div>
    );
  }

  // Aggregate risk reduction: compare first vs latest risk score per patient
  const riskReductions = patients.map((p) => {
    const scores = allScores.filter((s) => s.patient_id === p.id);
    if (scores.length < 2) return null;
    const first = scores[0].overall_risk;
    const latest = scores[scores.length - 1].overall_risk;
    return { patient: p, first, latest, reduction: first - latest };
  }).filter(Boolean);

  const avgReduction = riskReductions.length > 0
    ? Math.round(riskReductions.reduce((s, r) => s + (r!.reduction), 0) / riskReductions.length)
    : 0;

  // Plan effectiveness: avg expected reduction
  const avgExpectedReduction = allPlans.length > 0
    ? Math.round(allPlans.reduce((s, p) => s + p.expected_risk_reduction, 0) / allPlans.length)
    : 0;

  // Adherence rate
  const adherenceRate = allAdherence.length > 0
    ? Math.round((allAdherence.filter((a) => a.completed).length / allAdherence.length) * 100)
    : 0;

  // Plan status distribution
  const planStatusData = [
    { label: 'Active', value: allPlans.filter((p) => p.status === 'active').length, color: '#10b981' },
    { label: 'Pending', value: allPlans.filter((p) => p.status === 'pending_review').length, color: '#f59e0b' },
    { label: 'Completed', value: allPlans.filter((p) => p.status === 'completed').length, color: '#3b82f6' },
    { label: 'Overridden', value: allPlans.filter((p) => p.status === 'overridden').length, color: '#ef4444' },
  ];

  // Risk level distribution (latest scores)
  const latestScores = patients.map((p) => {
    const scores = allScores.filter((s) => s.patient_id === p.id);
    return scores[scores.length - 1];
  }).filter(Boolean);

  const riskDistData = [
    { label: 'Low', value: latestScores.filter((s) => s!.risk_level === 'low').length, color: '#10b981' },
    { label: 'Moderate', value: latestScores.filter((s) => s!.risk_level === 'moderate').length, color: '#f59e0b' },
    { label: 'High', value: latestScores.filter((s) => s!.risk_level === 'high').length, color: '#f97316' },
    { label: 'Very High', value: latestScores.filter((s) => s!.risk_level === 'very_high').length, color: '#ef4444' },
  ];

  // Aggregate risk trend (avg overall risk over time)
  const trendMap = new Map<string, { sum: number; count: number }>();
  allScores.forEach((s) => {
    const key = formatDate(s.recorded_at).split(' ').slice(0, 2).join(' ');
    const existing = trendMap.get(key) || { sum: 0, count: 0 };
    existing.sum += s.overall_risk;
    existing.count += 1;
    trendMap.set(key, existing);
  });
  const trendData = Array.from(trendMap.entries()).map(([label, { sum, count }]) => ({
    label,
    value: Math.round(sum / count),
  })).slice(-12);

  // Per-patient risk comparison
  const patientComparison = patients.map((p) => {
    const scores = allScores.filter((s) => s.patient_id === p.id);
    if (scores.length === 0) return { label: `${p.first_name[0]}${p.last_name[0]}`, value: 0, color: '#94a3b8' };
    const latest = scores[scores.length - 1];
    const color = latest.risk_level === 'low' ? '#10b981' : latest.risk_level === 'moderate' ? '#f59e0b' : latest.risk_level === 'high' ? '#f97316' : '#ef4444';
    return { label: `${p.first_name[0]}${p.last_name[0]}`, value: latest.overall_risk, color };
  });

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-ink">Analytics</h1>
        <p className="text-ink-dim mt-1">Aggregate metrics across all your patients</p>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard label="Avg Risk Reduction" value={avgReduction > 0 ? `-${avgReduction}%` : '—'} sublabel="Across all patients" icon={<TrendingDown size={20} />} color="emerald" />
        <StatCard label="Plan Effectiveness" value={`-${avgExpectedReduction}%`} sublabel="Avg expected reduction" icon={<Activity size={20} />} color="teal" />
        <StatCard label="Adherence Rate" value={`${adherenceRate}%`} sublabel="Across all plans" icon={<CheckCircle2 size={20} />} color={adherenceRate >= 75 ? 'emerald' : 'amber'} />
        <StatCard label="Total Patients" value={patients.length} icon={<Users size={20} />} color="blue" />
      </div>

      <div className="grid lg:grid-cols-2 gap-6">
        <Card>
          <CardHeader title="Aggregate Risk Trend" subtitle="Average risk score across all patients" icon={<TrendingDown size={20} />} />
          <CardBody>
            {trendData.length > 0 ? (
              <LineChart data={trendData} height={240} threshold={40} thresholdLabel="High Risk" />
            ) : (
              <EmptyState icon={<TrendingDown size={28} />} title="No trend data" message="Not enough data points yet" />
            )}
          </CardBody>
        </Card>

        <Card>
          <CardHeader title="Risk Level Distribution" subtitle="Current risk levels of all patients" icon={<Heart size={20} />} />
          <CardBody>
            <div className="flex items-center justify-center">
              <DonutChart
                segments={riskDistData}
                centerValue={patients.length.toString()}
                centerLabel="Patients"
              />
            </div>
            <div className="mt-4 space-y-2">
              {riskDistData.map((d) => (
                <div key={d.label} className="flex items-center gap-3">
                  <div className="h-3 w-3 rounded-full" style={{ backgroundColor: d.color }} />
                  <span className="text-sm text-ink-dim flex-1">{d.label}</span>
                  <span className="text-sm font-semibold text-ink">{d.value}</span>
                </div>
              ))}
            </div>
          </CardBody>
        </Card>
      </div>

      <div className="grid lg:grid-cols-2 gap-6">
        <Card>
          <CardHeader title="Per-Patient Risk" subtitle="Latest overall risk score per patient" icon={<Users size={20} />} />
          <CardBody>
            {patientComparison.length > 0 ? (
              <BarChart data={patientComparison} height={200} maxValue={100} unit="%" />
            ) : (
              <EmptyState icon={<Users size={28} />} title="No data" message="No risk scores available" />
            )}
          </CardBody>
        </Card>

        <Card>
          <CardHeader title="Plan Status Distribution" subtitle="All plans by status" icon={<BarChart3 size={20} />} />
          <CardBody>
            <div className="flex items-center justify-center">
              <DonutChart
                segments={planStatusData}
                centerValue={allPlans.length.toString()}
                centerLabel="Plans"
              />
            </div>
            <div className="mt-4 space-y-2">
              {planStatusData.map((d) => (
                <div key={d.label} className="flex items-center gap-3">
                  <div className="h-3 w-3 rounded-full" style={{ backgroundColor: d.color }} />
                  <span className="text-sm text-ink-dim flex-1">{d.label}</span>
                  <span className="text-sm font-semibold text-ink">{d.value}</span>
                </div>
              ))}
            </div>
          </CardBody>
        </Card>
      </div>

      {/* Risk reduction per patient */}
      {riskReductions.length > 0 && (
        <Card>
          <CardHeader title="Risk Reduction by Patient" subtitle="First vs latest assessment comparison" icon={<TrendingDown size={20} />} />
          <CardBody>
            <div className="space-y-3">
              {riskReductions.map((r) => (
                <div key={r!.patient.id} className="flex items-center gap-4 p-3 rounded bg-surface-2">
                  <div className="flex-1">
                    <div className="text-sm font-medium text-ink">{r!.patient.first_name} {r!.patient.last_name}</div>
                    <div className="text-xs text-ink-dim">{r!.first} → {r!.latest}</div>
                  </div>
                  <div className={`text-lg font-bold ${r!.reduction > 0 ? 'text-risk-low' : r!.reduction < 0 ? 'text-risk-very-high' : 'text-ink-faint'}`}>
                    {r!.reduction > 0 ? '-' : ''}{r!.reduction}
                  </div>
                </div>
              ))}
            </div>
          </CardBody>
        </Card>
      )}
    </div>
  );
}
