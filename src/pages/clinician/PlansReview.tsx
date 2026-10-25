import { useEffect, useState, useCallback } from 'react';
import { ClipboardCheck, Shield, Check, Ban, ArrowRight, AlertTriangle, Brain } from 'lucide-react';
import { useAuth } from '@/context/AuthContext';
import { Link } from '@/context/RouterContext';
import { apiClient } from '@/lib/aws-api-client';
import { Card, CardHeader, CardBody, Badge, EmptyState, Spinner, Button, StatCard, Avatar } from '@/components/ui';
import { planStatusLabel, planStatusColor, formatDate, getInitials, domainLabel, domainColor } from '@/lib/utils';
import type { Profile, PreventionPlan, PlanAction } from '@/lib/types';

export function ClinicianPlansReview() {
  const { profile } = useAuth();
  const [loading, setLoading] = useState(true);
  const [pendingPlans, setPendingPlans] = useState<(PreventionPlan & { actions?: PlanAction[]; patient?: Profile })[]>([]);
  const [flaggedPlans, setFlaggedPlans] = useState<(PreventionPlan & { actions?: PlanAction[]; patient?: Profile })[]>([]);
  const [recentDecisions, setRecentDecisions] = useState<(PreventionPlan & { patient?: Profile })[]>([]);

  const load = useCallback(async () => {
    if (!profile) return;
    try {
      const data = await apiClient.getClinicianPendingPlans();

      type ApiPlan = PreventionPlan & {
        actions?: PlanAction[];
        patient?: Profile;
        patient_name?: string;
        patient_email?: string;
      };

      // The API returns `patient_name` as one string; the UI wants a profile.
      const withPatient = (list: ApiPlan[]) =>
        list.map((p) => ({
          ...p,
          patient:
            p.patient ||
            (p.patient_name
              ? ({
                  id: p.patient_id,
                  first_name: p.patient_name.split(' ')[0] || '',
                  last_name: p.patient_name.split(' ').slice(1).join(' ') || '',
                  email: p.patient_email || '',
                } as Profile)
              : undefined),
        }));

      const pending = withPatient((data.plans || []) as ApiPlan[]);
      // Decisions come from their own list. Filtering the pending list for
      // decided statuses could never match, which is why this was empty.
      const decided = withPatient((data.decided || []) as ApiPlan[]);

      setPendingPlans(pending);
      setFlaggedPlans(pending.filter((p) => p.safety_verified === false));
      setRecentDecisions(decided);
    } catch (error) {
      console.error('Failed to load plans review:', error);
    } finally {
      setLoading(false);
    }
  }, [profile]);

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

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-ink">Plans Review</h1>
        <p className="text-ink-dim mt-1">Review and approve AI-generated prevention plans</p>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard label="Pending Review" value={pendingPlans.length} icon={<ClipboardCheck size={20} />} color="amber" />
        <StatCard label="Safety Flags" value={flaggedPlans.length} icon={<Shield size={20} />} color="red" />
        <StatCard label="Approved" value={recentDecisions.filter((p) => p.status === 'active').length} icon={<Check size={20} />} color="emerald" />
        <StatCard label="Total Reviewed" value={recentDecisions.length} icon={<Check size={20} />} color="teal" />
      </div>

      {/* Pending plans */}
      <Card>
        <CardHeader title="Pending Plans" subtitle="Awaiting your review and approval" icon={<ClipboardCheck size={20} />} />
        <CardBody>
          {pendingPlans.length > 0 ? (
            <div className="space-y-4">
              {pendingPlans.map((plan) => {
                const sc = planStatusColor(plan.status);
                return (
                  <div key={plan.id} className="p-5 rounded border border-hairline">
                    <div className="flex items-start justify-between gap-4 mb-3">
                      <div className="flex items-center gap-3">
                        {plan.patient && <Avatar initials={getInitials(plan.patient.first_name, plan.patient.last_name)} size="sm" />}
                        <div>
                          <div className="font-semibold text-ink">{plan.patient?.first_name} {plan.patient?.last_name}</div>
                          <div className="text-sm text-ink-dim">Plan v{plan.plan_version} · {formatDate(plan.created_at)}</div>
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <Badge className={`${sc.bg} ${sc.text} ${sc.border}`}>{planStatusLabel(plan.status)}</Badge>
                        {plan.safety_verified ? (
                          <Badge className="bg-risk-low/10 text-risk-low border-risk-low/30"><Shield size={12} /> Safe</Badge>
                        ) : (
                          <Badge className="bg-risk-moderate/10 text-risk-moderate border-risk-moderate/30"><AlertTriangle size={12} /> Safety Review</Badge>
                        )}
                      </div>
                    </div>

                    <div className="grid sm:grid-cols-2 gap-3 mb-3">
                      <div className="p-3 rounded bg-accent/10/50">
                        <div className="flex items-center gap-2 mb-1">
                          <Brain size={14} className="text-accent" />
                          <span className="text-xs font-medium text-ink-dim">AI Explanation</span>
                        </div>
                        <p className="text-xs text-ink-dim line-clamp-3">{plan.ai_explanation}</p>
                      </div>
                      <div className="p-3 rounded bg-risk-moderate/10/50">
                        <div className="flex items-center gap-2 mb-1">
                          <Shield size={14} className="text-risk-moderate" />
                          <span className="text-xs font-medium text-ink-dim">Safety Notes</span>
                        </div>
                        <p className="text-xs text-ink-dim line-clamp-3">{plan.safety_notes}</p>
                      </div>
                    </div>

                    <div className="flex flex-wrap gap-2 mb-3">
                      {(plan.actions || []).slice(0, 6).map((a) => (
                        <span key={a.id} className={`px-2 py-1 rounded text-xs font-medium ${domainColor(a.domain).bg} ${domainColor(a.domain).text}`}>
                          {domainLabel(a.domain)}: {a.title}
                        </span>
                      ))}
                    </div>

                    <div className="flex items-center justify-between pt-3 border-t border-hairline">
                      <span className="text-sm text-accent font-medium">Expected reduction: -{plan.expected_risk_reduction}%</span>
                      <div className="flex gap-2">
                        <Link to={`/clinician/patient/${plan.patient_id}`}>
                          <Button variant="ghost" size="sm">Details <ArrowRight size={14} /></Button>
                        </Link>
                        <Button size="sm" onClick={() => approvePlan(plan)}><Check size={14} /> Approve</Button>
                        <Button size="sm" variant="danger" onClick={() => overridePlan(plan)}><Ban size={14} /> Override</Button>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <EmptyState icon={<ClipboardCheck size={28} />} title="No pending plans" message="All plans have been reviewed" />
          )}
        </CardBody>
      </Card>

      {/* Safety flags */}
      {flaggedPlans.length > 0 && (
        <Card className="border-risk-very-high/30">
          <CardHeader title="Safety Agent Flags" subtitle="Plans with safety concerns requiring attention" icon={<Shield size={20} />} />
          <CardBody>
            <div className="space-y-3">
              {flaggedPlans.map((plan) => (
                <div key={plan.id} className="flex items-center gap-3 p-4 rounded bg-risk-very-high/10 border border-red-100">
                  <AlertTriangle size={20} className="text-risk-very-high flex-shrink-0" />
                  <div className="flex-1">
                    <div className="font-medium text-ink">{plan.patient?.first_name} {plan.patient?.last_name}</div>
                    <div className="text-sm text-ink-dim">{plan.safety_notes}</div>
                  </div>
                  <Link to={`/clinician/patient/${plan.patient_id}`}>
                    <Button variant="ghost" size="sm">Review <ArrowRight size={14} /></Button>
                  </Link>
                </div>
              ))}
            </div>
          </CardBody>
        </Card>
      )}

      {/* Recent decisions */}
      <Card>
        <CardHeader title="Recent Decisions" subtitle="Plans you've recently approved or overridden" icon={<Check size={20} />} />
        <CardBody>
          {recentDecisions.length > 0 ? (
            <div className="space-y-2">
              {recentDecisions.slice(0, 10).map((plan) => {
                const sc = planStatusColor(plan.status);
                const approved = plan.status === 'active';
                return (
                  <Link key={plan.id} to={`/clinician/patient/${plan.patient_id}`}>
                    <div className="flex items-center gap-3 p-3 rounded hover:bg-surface-2 transition-colors">
                      {plan.patient && (
                        <Avatar
                          initials={getInitials(plan.patient.first_name, plan.patient.last_name)}
                          size="sm"
                        />
                      )}
                      <div className="min-w-0 flex-1">
                        <div className="text-sm font-medium text-ink">
                          {plan.patient?.first_name} {plan.patient?.last_name}
                        </div>
                        {/* No action count here: `actions` is a lazy relation
                            that a list query does not hydrate, so it would
                            always read "0 actions". */}
                        <div className="text-xs text-ink-dim">
                          {approved ? 'Approved' : 'Overridden'}{' '}
                          {formatDate(plan.approved_at || plan.updated_at)} · Plan v
                          {plan.plan_version}
                        </div>
                        {plan.review_comments && (
                          <div className="mt-1 truncate text-xs italic text-ink-faint">
                            “{plan.review_comments}”
                          </div>
                        )}
                      </div>
                      <Badge className={`${sc.bg} ${sc.text} ${sc.border}`}>
                        {planStatusLabel(plan.status)}
                      </Badge>
                    </div>
                  </Link>
                );
              })}
            </div>
          ) : (
            <EmptyState icon={<Check size={28} />} title="No recent decisions" message="Plans you review will appear here" />
          )}
        </CardBody>
      </Card>
    </div>
  );
}
