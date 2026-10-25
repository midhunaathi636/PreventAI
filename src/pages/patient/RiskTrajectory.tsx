import { useEffect, useState } from 'react';
import { TrendingUp, AlertTriangle, Heart, Activity, Droplet, Shield, Footprints, Moon, Watch } from 'lucide-react';
import { useAuth } from '@/context/AuthContext';
import { apiClient } from '@/lib/aws-api-client';
import { Card, CardHeader, CardBody, Badge, EmptyState, Spinner, StatCard, Button } from '@/components/ui';
import { LineChart, BarChart } from '@/components/charts';
import { riskLevelColor, riskLevelLabel, formatDate } from '@/lib/utils';
import type { RiskScore, WearableReading } from '@/lib/types';

export function PatientRiskTrajectory() {
  const { profile } = useAuth();
  const [loading, setLoading] = useState(true);
  const [scores, setScores] = useState<RiskScore[]>([]);
  const [readings, setReadings] = useState<WearableReading[]>([]);
  const [running, setRunning] = useState(false);

  useEffect(() => {
    if (profile) load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [profile]);

  async function load() {
    if (!profile) return;
    try {
      const [trajectories, readings] = await Promise.all([
        apiClient.getRiskTrajectory().catch(() => []),
        apiClient.getWearableReadings().catch(() => []),
      ]);
      setScores((trajectories as RiskScore[]) || []);
      setReadings((readings as WearableReading[]) || []);
    } catch (error) {
      console.error('Failed to load risk trajectory', error);
    } finally {
      setLoading(false);
    }
  }

  async function handleRunAI() {
    setRunning(true);
    try {
      await apiClient.runFullAssessment();
      await load();
    } catch (e) {
      console.error(e);
      alert(`AI assessment failed: ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setRunning(false);
    }
  }

  if (loading) return <div className="flex justify-center py-20"><Spinner className="h-8 w-8" /></div>;

  const latest = scores[scores.length - 1];
  const overallData = scores.map((s) => ({
    label: formatDate(s.recorded_at).split(' ').slice(0, 2).join(' '),
    value: s.overall_risk,
  }));

  const cvdData = scores.map((s) => ({ label: formatDate(s.recorded_at).split(' ').slice(0, 2).join(' '), value: s.cvd_risk }));
  const diabetesData = scores.map((s) => ({ label: formatDate(s.recorded_at).split(' ').slice(0, 2).join(' '), value: s.diabetes_risk }));
  const cancerData = scores.map((s) => ({ label: formatDate(s.recorded_at).split(' ').slice(0, 2).join(' '), value: s.cancer_risk }));
  const strokeData = scores.map((s) => ({ label: formatDate(s.recorded_at).split(' ').slice(0, 2).join(' '), value: s.stroke_risk }));

  const thresholds = [
    { label: 'Low', min: 0, max: 20, color: 'emerald' },
    { label: 'Moderate', min: 20, max: 40, color: 'amber' },
    { label: 'High', min: 40, max: 60, color: 'orange' },
    { label: 'Very High', min: 60, max: 100, color: 'red' },
  ];

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-ink">Risk Trajectory</h1>
          <p className="text-ink-dim mt-1">Your health risk history and category breakdown</p>
        </div>
        <Button onClick={handleRunAI} disabled={running}>
          {running ? 'Running AI…' : 'Run AI Assessment'}
        </Button>
      </div>

      {scores.length === 0 ? (
        <Card>
          <CardBody>
            <EmptyState
              icon={<TrendingUp size={32} />}
              title="No risk data available"
              message="Run an AI assessment to generate your first risk score and trajectory."
              action={<Button onClick={handleRunAI} disabled={running}>{running ? 'Running…' : 'Run AI Assessment'}</Button>}
            />
          </CardBody>
        </Card>
      ) : (
        <>
          {/* Current risk stats */}
          {latest && (
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
              <StatCard label="CVD Risk" value={`${latest.cvd_risk}%`} icon={<Heart size={20} />} color="teal" />
              <StatCard label="Diabetes Risk" value={`${latest.diabetes_risk}%`} icon={<Droplet size={20} />} color="amber" />
              <StatCard label="Cancer Risk" value={`${latest.cancer_risk}%`} icon={<Shield size={20} />} color="violet" />
              <StatCard label="Stroke Risk" value={`${latest.stroke_risk}%`} icon={<Activity size={20} />} color="blue" />
            </div>
          )}

          {/* Overall trajectory */}
          <Card>
            <CardHeader title="Overall Risk Trajectory" subtitle="Combined risk score over time" icon={<TrendingUp size={20} />} />
            <CardBody>
              <LineChart data={overallData} height={280} threshold={40} thresholdLabel="High Risk" />
            </CardBody>
          </Card>

          {/* Category charts */}
          <div className="grid lg:grid-cols-2 gap-6">
            <Card>
              <CardHeader title="Cardiovascular Risk" subtitle="CVD risk over time" icon={<Heart size={20} />} />
              <CardBody>
                <LineChart data={cvdData} height={200} color="#0d9488" threshold={30} thresholdLabel="CVD Alert" />
              </CardBody>
            </Card>
            <Card>
              <CardHeader title="Diabetes Risk" subtitle="Type 2 diabetes risk over time" icon={<Droplet size={20} />} />
              <CardBody>
                <LineChart data={diabetesData} height={200} color="#f59e0b" threshold={30} thresholdLabel="Diabetes Alert" />
              </CardBody>
            </Card>
            <Card>
              <CardHeader title="Cancer Risk" subtitle="Cancer risk over time" icon={<Shield size={20} />} />
              <CardBody>
                <LineChart data={cancerData} height={200} color="#8b5cf6" threshold={20} thresholdLabel="Cancer Alert" />
              </CardBody>
            </Card>
            <Card>
              <CardHeader title="Stroke Risk" subtitle="Stroke risk over time" icon={<Activity size={20} />} />
              <CardBody>
                <LineChart data={strokeData} height={200} color="#3b82f6" threshold={25} thresholdLabel="Stroke Alert" />
              </CardBody>
            </Card>
          </div>

          {/* Wearable data graphs */}
          <Card>
            <CardHeader title="Wearable Health Data" subtitle="Health readings alongside your risk trends" icon={<Watch size={20} />} />
            <CardBody>
              {readings.length > 0 ? (
                <div className="space-y-6">
                  <div>
                    <div className="flex items-center gap-2 mb-3"><Heart size={16} className="text-risk-very-high" /><span className="text-sm font-semibold text-ink-dim">Heart Rate Trend</span></div>
                    {readings.filter((r) => r.reading_type === 'heart_rate').length > 0 ? (
                      <LineChart data={readings.filter((r) => r.reading_type === 'heart_rate').slice(0, 12).reverse().map((r) => ({ label: formatDate(r.recorded_at).split(' ').slice(0, 2).join(' '), value: r.value }))} height={180} color="#ef4444" />
                    ) : <p className="text-sm text-ink-faint">No heart rate readings.</p>}
                  </div>
                  <div className="grid lg:grid-cols-2 gap-6">
                    <div>
                      <div className="flex items-center gap-2 mb-3"><Footprints size={16} className="text-risk-low" /><span className="text-sm font-semibold text-ink-dim">Daily Steps</span></div>
                      {readings.filter((r) => r.reading_type === 'steps').length > 0 ? (
                        <BarChart data={readings.filter((r) => r.reading_type === 'steps').slice(0, 7).reverse().map((r) => ({ label: formatDate(r.recorded_at).split(' ').slice(0, 2).join(' '), value: r.value, color: '#10b981' }))} height={180} />
                      ) : <p className="text-sm text-ink-faint">No step readings.</p>}
                    </div>
                    <div>
                      <div className="flex items-center gap-2 mb-3"><Moon size={16} className="text-blue-500" /><span className="text-sm font-semibold text-ink-dim">Sleep Duration</span></div>
                      {readings.filter((r) => r.reading_type === 'sleep').length > 0 ? (
                        <BarChart data={readings.filter((r) => r.reading_type === 'sleep').slice(0, 7).reverse().map((r) => ({ label: formatDate(r.recorded_at).split(' ').slice(0, 2).join(' '), value: r.value, color: '#3b82f6' }))} height={180} />
                      ) : <p className="text-sm text-ink-faint">No sleep readings.</p>}
                    </div>
                  </div>
                </div>
              ) : (
                <EmptyState icon={<Watch size={28} />} title="No wearable data" message="Connect a device or add readings from the Wearables & Data page to see them here." />
              )}
            </CardBody>
          </Card>

          {/* Risk thresholds */}
          <Card>
            <CardHeader title="Risk Categories & Thresholds" subtitle="How risk levels are classified" icon={<AlertTriangle size={20} />} />
            <CardBody>
              <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
                {thresholds.map((t) => {
                  const colors: Record<string, string> = {
                    emerald: 'bg-risk-low/10 text-risk-low border-risk-low/30',
                    amber: 'bg-risk-moderate/10 text-risk-moderate border-risk-moderate/30',
                    orange: 'bg-risk-high/10 text-risk-high border-risk-high/30',
                    red: 'bg-risk-very-high/10 text-risk-very-high border-risk-very-high/30',
                  };
                  return (
                    <div key={t.label} className={`p-4 rounded border ${colors[t.color]}`}>
                      <div className="font-semibold">{t.label}</div>
                      <div className="text-2xl font-bold mt-1">{t.min}-{t.max}</div>
                      <div className="text-xs opacity-80 mt-1">risk score range</div>
                    </div>
                  );
                })}
              </div>
            </CardBody>
          </Card>

          {/* Alerts & thresholds */}
          {latest && (latest.risk_level === 'high' || latest.risk_level === 'very_high') && (
            <Card className="border-risk-very-high/30 bg-risk-very-high/10">
              <CardBody>
                <div className="flex items-start gap-3">
                  <div className="p-2.5 rounded bg-red-100 text-risk-very-high flex-shrink-0">
                    <AlertTriangle size={24} />
                  </div>
                  <div>
                    <h3 className="font-semibold text-red-900">Risk Alert Active</h3>
                    <p className="text-sm text-risk-very-high mt-1">
                      Your current risk level is <strong>{riskLevelLabel(latest.risk_level)}</strong> with an overall score of {latest.overall_risk}/100.
                      A prevention plan has been generated to help reduce your risk. Check your Current Plan page for details.
                    </p>
                  </div>
                </div>
              </CardBody>
            </Card>
          )}

          {/* History table */}
          <Card>
            <CardHeader title="Risk History" subtitle="All recorded risk assessments" icon={<Activity size={20} />} />
            <CardBody>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-hairline">
                      <th className="text-left py-3 px-2 font-medium text-ink-dim">Date</th>
                      <th className="text-right py-3 px-2 font-medium text-ink-dim">CVD</th>
                      <th className="text-right py-3 px-2 font-medium text-ink-dim">Diabetes</th>
                      <th className="text-right py-3 px-2 font-medium text-ink-dim">Cancer</th>
                      <th className="text-right py-3 px-2 font-medium text-ink-dim">Stroke</th>
                      <th className="text-right py-3 px-2 font-medium text-ink-dim">Overall</th>
                      <th className="text-center py-3 px-2 font-medium text-ink-dim">Level</th>
                    </tr>
                  </thead>
                  <tbody>
                    {[...scores].reverse().map((s) => {
                      const colors = riskLevelColor(s.risk_level);
                      return (
                        <tr key={s.id} className="border-b border-surface-2 hover:bg-surface-2">
                          <td className="py-3 px-2 text-ink-dim">{formatDate(s.recorded_at)}</td>
                          <td className="py-3 px-2 text-right font-medium text-ink">{s.cvd_risk}%</td>
                          <td className="py-3 px-2 text-right font-medium text-ink">{s.diabetes_risk}%</td>
                          <td className="py-3 px-2 text-right font-medium text-ink">{s.cancer_risk}%</td>
                          <td className="py-3 px-2 text-right font-medium text-ink">{s.stroke_risk}%</td>
                          <td className="py-3 px-2 text-right font-bold text-ink">{s.overall_risk}</td>
                          <td className="py-3 px-2 text-center">
                            <Badge className={`${colors.bg} ${colors.text} ${colors.border}`}>
                              <span className={`h-1.5 w-1.5 rounded-full ${colors.dot}`} />
                              {riskLevelLabel(s.risk_level)}
                            </Badge>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </CardBody>
          </Card>
        </>
      )}
    </div>
  );
}
