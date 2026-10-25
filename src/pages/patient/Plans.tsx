import { useEffect, useState } from 'react';
import { ClipboardList, Download, Eye, Calendar } from 'lucide-react';
import { useAuth } from '@/context/AuthContext';
import { Link } from '@/context/RouterContext';
import { apiClient } from '@/lib/aws-api-client';
import { Card, CardBody, Badge, EmptyState, Spinner, Button, Select } from '@/components/ui';
import { planStatusLabel, planStatusColor, formatDate, domainColor } from '@/lib/utils';
import type { PreventionPlan, PlanAction } from '@/lib/types';

export function PatientPlans() {
  const { profile } = useAuth();
  const [loading, setLoading] = useState(true);
  const [plans, setPlans] = useState<(PreventionPlan & { actions?: PlanAction[] })[]>([]);
  const [filter, setFilter] = useState('all');

  useEffect(() => {
    if (profile) load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [profile]);

  async function load() {
    if (!profile) return;
    try {
      const data = await apiClient.getPatientPlans();
      const planList = (Array.isArray(data) ? data : (data as any)?.plans || []) as (PreventionPlan & { actions?: PlanAction[] })[];
      setPlans(planList.filter(Boolean));
    } catch (error) {
      console.error('Failed to load plans:', error);
      setPlans([]);
    } finally {
      setLoading(false);
    }
  }

  if (loading) return <div className="flex justify-center py-20"><Spinner className="h-8 w-8" /></div>;

  const filtered = filter === 'all' ? plans : plans.filter((p) => p.status === filter);

  function downloadPlan(plan: PreventionPlan & { actions?: PlanAction[] }) {
    const lines = [
      'PreventAI - Prevention Plan',
      `Status: ${planStatusLabel(plan.status)}`,
      `Expected Risk Reduction: ${plan.expected_risk_reduction}%`,
      `Safety Verified: ${plan.safety_verified ? 'Yes' : 'Pending'}`,
      `Created: ${formatDate(plan.created_at)}`,
      '',
      'AI Explanation:',
      plan.ai_explanation,
      '',
      'Actions:',
      ...(plan.actions || []).map((a, i) =>
        `  ${i + 1}. [${a.domain}] ${a.title} - ${a.frequency} (Impact: -${a.expected_impact}%)`
      ),
    ];
    const blob = new Blob([lines.join('\n')], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `prevention-plan-v${plan.plan_version}.txt`;
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-ink">Prevention Plans</h1>
          <p className="text-ink-dim mt-1">All your AI-generated prevention plans</p>
        </div>
        <div className="w-48">
          <Select
            value={filter}
            onChange={setFilter}
            options={[
              { value: 'all', label: 'All Plans' },
              { value: 'active', label: 'Active' },
              { value: 'pending_review', label: 'Pending Review' },
              { value: 'completed', label: 'Completed' },
              { value: 'overridden', label: 'Overridden' },
            ]}
          />
        </div>
      </div>

      {filtered.length === 0 ? (
        <Card>
          <CardBody>
            <EmptyState
              icon={<ClipboardList size={32} />}
              title="No plans found"
              message={filter === 'all' ? "Run an AI assessment from the Overview page to generate your first prevention plan." : `No ${planStatusLabel(filter).toLowerCase()} plans found.`}
              action={filter !== 'all' ? <Button variant="secondary" onClick={() => setFilter('all')}>Show all plans</Button> : undefined}
            />
          </CardBody>
        </Card>
      ) : (
        <div className="space-y-4">
          {filtered.map((plan) => {
            const statusColors = planStatusColor(plan.status);
            return (
              <Card key={plan.id} className="overflow-hidden hover: transition-shadow">
                <div className="p-5">
                  <div className="flex items-start justify-between gap-4 mb-4">
                    <div>
                      <div className="flex items-center gap-2 mb-1">
                        <h3 className="text-lg font-semibold text-ink">Plan v{plan.plan_version}</h3>
                        <Badge className={`${statusColors.bg} ${statusColors.text} ${statusColors.border}`}>
                          {planStatusLabel(plan.status)}
                        </Badge>
                        {plan.safety_verified && (
                          <Badge className="bg-risk-low/10 text-risk-low border-risk-low/30">
                            <span className="h-1.5 w-1.5 rounded-full bg-risk-low/100" /> Safety Verified
                          </Badge>
                        )}
                      </div>
                      <div className="text-sm text-ink-dim flex items-center gap-3">
                        <span className="flex items-center gap-1"><Calendar size={14} /> {formatDate(plan.created_at)}</span>
                        <span className="text-accent font-medium">Expected reduction: -{plan.expected_risk_reduction}%</span>
                      </div>
                    </div>
                    <div className="flex gap-2">
                      <Button variant="ghost" size="sm" onClick={() => downloadPlan(plan)}>
                        <Download size={16} /> Download
                      </Button>
                      <Link to="/patient/current-plan">
                        <Button variant="outline" size="sm"><Eye size={16} /> View</Button>
                      </Link>
                    </div>
                  </div>

                  <p className="text-sm text-ink-dim line-clamp-2 mb-4">{plan.ai_explanation}</p>

                  <div className="flex flex-wrap gap-2">
                    {(plan.actions || []).slice(0, 6).map((action) => (
                      <div key={action.id} className={`px-2.5 py-1.5 rounded text-xs font-medium ${domainColor(action.domain).bg} ${domainColor(action.domain).text}`}>
                        {action.title}
                      </div>
                    ))}
                    {(plan.actions || []).length > 6 && (
                      <div className="px-2.5 py-1.5 rounded text-xs font-medium bg-surface-2 text-ink-dim">
                        +{(plan.actions || []).length - 6} more
                      </div>
                    )}
                  </div>
                </div>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
