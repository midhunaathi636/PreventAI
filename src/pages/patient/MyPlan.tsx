import { useCallback, useEffect, useMemo, useState } from 'react';
import { Check, CheckCircle2, Circle, Dumbbell, HeartPulse, MessageSquare, Pill, RotateCcw, Star, TrendingUp, Upload } from 'lucide-react';
import { useAuth } from '@/context/AuthContext';
import { apiClient, pickCurrentPlan } from '@/lib/aws-api-client';
import { Card, CardBody, CardHeader, Badge, EmptyState, Spinner, Button, Textarea, ProgressBar, StatCard } from '@/components/ui';
import { AdherenceCalendar, type DayStatus } from '@/components/AdherenceCalendar';
import { domainLabel, domainColor, formatDate } from '@/lib/utils';
import type { DoctorPlanItem, DoctorPlanItemLog, PreventionPlan, PlanAction, AdherenceLog, Feedback } from '@/lib/types';

function today() {
  return new Date().toISOString().slice(0, 10);
}

function monthRange(year: number, month: number) {
  const start = `${year}-${String(month + 1).padStart(2, '0')}-01`;
  const end = `${year}-${String(month + 2).padStart(2, '0')}-01`;
  return { start, end };
}

export function PatientMyPlan() {
  const { profile } = useAuth();
  const [items, setItems] = useState<DoctorPlanItem[]>([]);
  const [logs, setLogs] = useState<DoctorPlanItemLog[]>([]);
  const [monthLogs, setMonthLogs] = useState<DoctorPlanItemLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [savingId, setSavingId] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [selectedDate, setSelectedDate] = useState<string>(today());
  const todayKey = useMemo(today, []);

  // Prevention plan + adherence data
  const [plan, setPlan] = useState<(PreventionPlan & { actions?: PlanAction[] }) | null>(null);
  const [adherenceLogs, setAdherenceLogs] = useState<AdherenceLog[]>([]);
  const [feedbacks, setFeedbacks] = useState<Feedback[]>([]);
  const [showFeedback, setShowFeedback] = useState(false);
  const [rating, setRating] = useState(3);
  const [outcomeNotes, setOutcomeNotes] = useState('');
  const [symptomsImproved, setSymptomsImproved] = useState(false);
  const [sideEffects, setSideEffects] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const loadItems = useCallback(async () => {
    if (!profile) return;
    try {
      // Only the CURRENT plan. Each assessment run creates a new
      // PreventionPlan row, so flattening every plan's actions into one list
      // repeated the whole plan once per run.
      const plan = (await apiClient.getCurrentPlan()) as any;
      const mapped: DoctorPlanItem[] = [];

      if (plan) {
        const actions = (plan.actions || []).filter(Boolean);
        if (actions.length) {
          // Guard against a half-written plan: the same action persisted twice
          // would otherwise show twice.
          const seen = new Set<string>();
          for (const a of actions) {
            const key = (a.title || '').trim().toLowerCase();
            if (!key || seen.has(key)) continue;
            seen.add(key);
            mapped.push({
              id: a.id,
              patient_id: plan.patient_id || '',
              doctor_id: plan.clinician_id || '',
              item_type: a.domain === 'medication_adherence' ? 'medication' : 'workout',
              title: a.title || plan.title || 'Plan action',
              details: a.description || '',
              frequency: a.frequency || '',
              active: plan.status === 'active',
              created_at: a.created_at || plan.created_at || '',
              updated_at: plan.updated_at || '',
            });
          }
        } else if (plan.id) {
          mapped.push({
            id: plan.id,
            patient_id: plan.patient_id || '',
            doctor_id: plan.clinician_id || '',
            item_type: 'workout',
            title: plan.title || 'Prevention plan',
            details: plan.summary || plan.ai_explanation || '',
            frequency: '',
            active: plan.status === 'active',
            created_at: plan.created_at || '',
            updated_at: plan.updated_at || '',
          });
        }
      }
      setItems(mapped);
    } catch (error) {
      console.warn('Plan items load soft-fail', error);
      setItems([]);
    }
  }, [profile]);

  const loadDayLogs = useCallback(async () => {
    if (!profile) return;
    try {
      const data = await apiClient.getAdherence();
      const mappedLogs: DoctorPlanItemLog[] = (Array.isArray(data) ? data : []).map((r: any) => ({
        id: r.id,
        item_id: r.plan_action_id || r.planActionId || '',
        patient_id: r.patient_id || r.patientId || '',
        completed_on: (r.completed_at || r.completedAt || r.recorded_at || '').slice(0, 10),
        completed: !!r.completed,
        created_at: r.created_at || r.createdAt || '',
        updated_at: r.created_at || r.createdAt || '',
      }));
      setLogs(mappedLogs);
    } catch (error) {
      console.warn('Day logs soft-fail', error);
      setLogs([]);
    }
  }, [profile, selectedDate]);

  const loadMonthLogs = useCallback(async (year: number, month: number) => {
    if (!profile) return;
    try {
      const data = await apiClient.getAdherence();
      const mappedLogs: DoctorPlanItemLog[] = (Array.isArray(data) ? data : []).map((r: any) => ({
        id: r.id,
        item_id: r.plan_action_id || r.planActionId || '',
        patient_id: r.patient_id || r.patientId || '',
        completed_on: (r.completed_at || r.completedAt || r.recorded_at || '').slice(0, 10),
        completed: !!r.completed,
        created_at: r.created_at || r.createdAt || '',
        updated_at: r.created_at || r.createdAt || '',
      }));
      setMonthLogs(mappedLogs);
    } catch (error) {
      setMonthLogs([]);
    }
  }, [profile]);

  const loadPlanAndAdherence = useCallback(async () => {
    if (!profile) return;
    try {
      const [plans, logs, feedbacks] = await Promise.all([
        apiClient.getPatientPlans().catch(() => []),
        apiClient.getAdherence().catch(() => []),
        apiClient.getAdherence().catch(() => []),
      ]);

      const p = pickCurrentPlan((plans as PreventionPlan[]) ?? []);
      if (p) {
        setPlan(p);
        setAdherenceLogs(
          (Array.isArray(logs) ? logs : []).map((r: any) => ({
            id: r.id,
            plan_action_id: r.plan_action_id || r.planActionId || '',
            patient_id: r.patient_id || r.patientId || '',
            completed: !!r.completed,
            notes: r.notes ?? '',
            completed_at: r.completed_at || r.completedAt || r.recorded_at || '',
            created_at: r.created_at || r.createdAt || '',
          })) as AdherenceLog[]
        );
        setFeedbacks((feedbacks as Feedback[]) || []);
      }
    } catch (error) {
      console.error('Failed to load plan and adherence', error);
    }
  }, [profile]);

  useEffect(() => {
    void Promise.all([loadItems(), loadPlanAndAdherence()]).finally(() => setLoading(false));
  }, [loadItems, loadPlanAndAdherence]);

  useEffect(() => { void loadDayLogs(); }, [loadDayLogs]);

  useEffect(() => {
    const d = new Date(selectedDate);
    void loadMonthLogs(d.getFullYear(), d.getMonth());
  }, [loadMonthLogs, selectedDate]);

  async function toggleItem(item: DoctorPlanItem) {
    if (!profile) return;
    const existing = logs.find((log) => log.item_id === item.id);
    const completed = !existing?.completed;
    setSavingId(item.id);
    setMessage(null);
    try {
      await apiClient.recordAdherence(item.id, completed);
      await loadDayLogs();
      const d = new Date(selectedDate);
      await loadMonthLogs(d.getFullYear(), d.getMonth());
    } catch (error) {
      setMessage('Could not update this item. Please try again.');
    } finally {
      setSavingId(null);
    }
  }

  async function toggleAction(action: PlanAction) {
    if (!profile) return;
    const newStatus = action.status === 'completed' ? 'pending' : 'completed';
    try {
      await apiClient.recordAdherence(action.id, newStatus === 'completed');
      loadPlanAndAdherence();
    } catch (error) {
      console.error('Failed to update action', error);
    }
  }

  async function submitFeedback() {
    if (!profile || !plan) return;
    setSubmitting(true);
    try {
      await apiClient.submitFeedback({
        plan_id: plan.id,
        rating,
        outcome_notes: outcomeNotes,
        symptoms_improved: symptomsImproved,
        side_effects: sideEffects,
      });
      setShowFeedback(false);
      setOutcomeNotes('');
      setSideEffects('');
      setRating(3);
      loadPlanAndAdherence();
    } catch (error) {
      console.error('Failed to submit feedback', error);
    } finally {
      setSubmitting(false);
    }
  }

  const dayStatuses: DayStatus[] = useMemo(() => {
    const map: Record<string, { completed: number; total: number }> = {};
    for (const log of monthLogs) {
      if (!map[log.completed_on]) map[log.completed_on] = { completed: 0, total: 0 };
      if (log.completed) map[log.completed_on].completed++;
    }
    const statuses: DayStatus[] = [];
    for (const log of monthLogs) {
      if (!statuses.find((s) => s.date === log.completed_on)) {
        statuses.push({ date: log.completed_on, completed: map[log.completed_on]?.completed || 0, total: items.length });
      }
    }
    return statuses;
  }, [monthLogs, items]);

  if (loading) return <div className="flex justify-center py-20"><Spinner className="h-8 w-8" /></div>;

  const medications = items.filter((item) => item.item_type === 'medication');
  const workouts = items.filter((item) => item.item_type === 'workout');
  const completedCount = items.filter((item) => logs.some((log) => log.item_id === item.id && log.completed)).length;
  const isToday = selectedDate === todayKey;
  const isFuture = selectedDate > todayKey;

  const planActions = plan?.actions || [];
  const planCompleted = planActions.filter((a) => a.status === 'completed').length;
  const planTotal = planActions.length;
  const planRate = planTotal > 0 ? Math.round((planCompleted / planTotal) * 100) : 0;
  const recentLogs = adherenceLogs.slice(0, 10);

  const hasAnyPlan = items.length > 0 || plan;

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-ink">My Plan</h1>
          <p className="text-ink-dim mt-1">Your daily tasks, prevention actions, and progress — all in one place.</p>
        </div>
        {plan && (
          <Button onClick={() => setShowFeedback(true)} variant="outline">
            <MessageSquare size={16} /> Submit Feedback
          </Button>
        )}
      </div>
      {message && <div className="p-3 rounded bg-risk-very-high/10 border border-risk-very-high/30 text-risk-very-high text-sm">{message}</div>}

      {!hasAnyPlan ? (
        <Card><CardBody>
          <EmptyState icon={<HeartPulse size={32} />} title="No plan assigned yet" message="Run an AI assessment from Overview, or wait for your clinician to assign tasks." />
        </CardBody></Card>
      ) : (
        <>
          {/* Daily tasks section */}
          {items.length > 0 && (
            <>
              <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                <StatCard label="Today's Progress" value={`${completedCount}/${items.length}`} sublabel={isToday ? 'Today' : new Date(selectedDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })} icon={<HeartPulse size={20} />} color="teal" />
                <StatCard label="Daily Completion" value={`${items.length > 0 ? Math.round((completedCount / items.length) * 100) : 0}%`} icon={<TrendingUp size={20} />} color="emerald" />
                <StatCard label="Medications" value={medications.length} icon={<Pill size={20} />} color="blue" />
                <StatCard label="Workouts" value={workouts.length} icon={<Dumbbell size={20} />} color="amber" />
              </div>

              <div className="grid lg:grid-cols-2 gap-6">
                <Card>
                  <CardHeader title="Adherence calendar" subtitle="Tap any day to log or review progress" icon={<HeartPulse size={20} />} />
                  <CardBody>
                    <AdherenceCalendar
                      monthStatuses={dayStatuses}
                      selectedDate={selectedDate}
                      onSelectDate={setSelectedDate}
                      futureDisabled
                    />
                  </CardBody>
                </Card>

                <div className="space-y-6">
                  <Card className="bg-surface-2 border-accent/30">
                    <CardBody>
                      <div className="flex items-center gap-4">
                        <div className="h-14 w-14 rounded bg-accent text-ink flex items-center justify-center"><HeartPulse size={28} /></div>
                        <div className="flex-1">
                          <p className="text-sm text-ink-dim">{isToday ? "Today's progress" : `Progress for ${new Date(selectedDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}`}</p>
                          <p className="text-2xl font-bold text-ink">{completedCount} of {items.length} completed</p>
                        </div>
                        <div className="h-14 w-14 rounded-full border-4 border-accent/30 flex items-center justify-center text-sm font-bold text-accent">{Math.round((completedCount / items.length) * 100)}%</div>
                      </div>
                    </CardBody>
                  </Card>

                  {isFuture ? (
                    <Card><CardBody><EmptyState icon={<HeartPulse size={32} />} title="Future date" message="You cannot log progress for a future date. Select today or a past day." /></CardBody></Card>
                  ) : (
                    <>
                      {medications.length > 0 && <ItemGroup title="Medications" subtitle="Take these exactly as your doctor instructed" icon={<Pill size={20} />} items={medications} logs={logs} savingId={savingId} onToggle={toggleItem} />}
                      {workouts.length > 0 && <ItemGroup title="Workouts" subtitle="Move safely and follow the assigned routine" icon={<Dumbbell size={20} />} items={workouts} logs={logs} savingId={savingId} onToggle={toggleItem} />}
                    </>
                  )}
                </div>
              </div>
            </>
          )}

          {/* Prevention plan actions section */}
          {plan && (
            <>
              <div className="border-t border-hairline pt-6" />

              {items.length > 0 && (
                <div>
                  <h2 className="text-lg font-bold text-ink mb-1">Prevention Plan Actions</h2>
                  <p className="text-sm text-ink-dim mb-4">Track your AI-generated prevention plan and share how it's working.</p>
                </div>
              )}

              <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                <StatCard label="Plan Adherence" value={`${planRate}%`} sublabel={`${planCompleted}/${planTotal} actions`} icon={<TrendingUp size={20} />} color={planRate >= 75 ? 'emerald' : 'amber'} />
                <StatCard label="Completed" value={planCompleted} icon={<CheckCircle2 size={20} />} color="teal" />
                <StatCard label="Pending" value={planTotal - planCompleted} icon={<Circle size={20} />} color="amber" />
                <StatCard label="Feedback" value={feedbacks.length} icon={<Star size={20} />} color="violet" />
              </div>

              <Card>
                <CardHeader title="Prevention Plan Progress" subtitle={`Plan v${plan.plan_version}`} icon={<TrendingUp size={20} />} />
                <CardBody>
                  <div className="mb-4">
                    <div className="flex justify-between text-sm mb-2">
                      <span className="text-ink-dim">Overall adherence</span>
                      <span className="font-semibold text-ink">{planRate}%</span>
                    </div>
                    <ProgressBar value={planRate} barClassName={planRate >= 75 ? 'bg-risk-low/100' : 'bg-risk-moderate/100'} className="h-3" />
                  </div>
                </CardBody>
              </Card>

              <Card>
                <CardHeader title="Mark Prevention Actions Complete" subtitle="Tap to toggle completion" icon={<CheckCircle2 size={20} />} />
                <CardBody>
                  <div className="space-y-2">
                    {planActions.map((action) => {
                      const colors = domainColor(action.domain);
                      return (
                        <button
                          key={action.id}
                          onClick={() => toggleAction(action)}
                          className={`w-full flex items-start gap-4 p-4 rounded border transition-all text-left ${
                            action.status === 'completed' ? 'border-risk-low/30 bg-risk-low/10/50' : 'border-hairline hover:border-hairline bg-surface'
                          }`}
                        >
                          <div className="flex-shrink-0 mt-0.5">
                            {action.status === 'completed' ? (
                              <CheckCircle2 size={22} className="text-risk-low" />
                            ) : (
                              <Circle size={22} className="text-ink-faint" />
                            )}
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 mb-1">
                              <span className={`px-2 py-0.5 rounded text-xs font-medium ${colors.bg} ${colors.text}`}>{domainLabel(action.domain)}</span>
                              {action.status === 'completed' && <Badge className="bg-risk-low/10 text-risk-low border-risk-low/30">Completed</Badge>}
                            </div>
                            <div className="font-medium text-ink">{action.title}</div>
                            <div className="text-sm text-ink-dim mt-0.5">{action.frequency}</div>
                          </div>
                          <Badge className="bg-accent/10 text-accent border-accent/30 flex-shrink-0">-{action.expected_impact}%</Badge>
                        </button>
                      );
                    })}
                  </div>
                </CardBody>
              </Card>

              {/* Recent activity */}
              {recentLogs.length > 0 && (
                <Card>
                  <CardHeader title="Recent Activity" subtitle="Latest adherence logs" icon={<TrendingUp size={20} />} />
                  <CardBody>
                    <div className="space-y-2">
                      {recentLogs.map((log) => (
                        <div key={log.id} className="flex items-center gap-3 p-3 rounded bg-surface-2">
                          <CheckCircle2 size={16} className="text-risk-low flex-shrink-0" />
                          <div className="flex-1 text-sm text-ink-dim truncate">{log.notes || 'Action completed'}</div>
                          <div className="text-xs text-ink-faint flex-shrink-0">{formatDate(log.completed_at)}</div>
                        </div>
                      ))}
                    </div>
                  </CardBody>
                </Card>
              )}

              {/* Previous feedback */}
              {feedbacks.length > 0 && (
                <Card>
                  <CardHeader title="Your Feedback" subtitle="Outcome reports you've submitted" icon={<Star size={20} />} />
                  <CardBody>
                    <div className="space-y-3">
                      {feedbacks.map((fb) => (
                        <div key={fb.id} className="p-4 rounded bg-surface-2">
                          <div className="flex items-center justify-between mb-2">
                            <div className="flex items-center gap-1">
                              {[1, 2, 3, 4, 5].map((s) => (
                                <Star key={s} size={14} className={s <= fb.rating ? 'text-amber-400 fill-amber-400' : 'text-ink-faint'} />
                              ))}
                            </div>
                            <span className="text-xs text-ink-faint">{formatDate(fb.created_at)}</span>
                          </div>
                          {fb.outcome_notes && <p className="text-sm text-ink-dim">{fb.outcome_notes}</p>}
                          {fb.symptoms_improved && <Badge className="mt-2 bg-risk-low/10 text-risk-low border-risk-low/30">Symptoms improved</Badge>}
                          {fb.side_effects && <p className="text-sm text-risk-moderate mt-1">Side effects: {fb.side_effects}</p>}
                        </div>
                      ))}
                    </div>
                  </CardBody>
                </Card>
              )}
            </>
          )}
        </>
      )}

      {/* Feedback modal */}
      {showFeedback && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-bg-deep/40 backdrop-blur-sm" onClick={() => setShowFeedback(false)} />
          <Card className="relative max-w-lg w-full">
            <div className="p-6">
              <h2 className="text-lg font-semibold text-ink mb-4">Submit Outcome Feedback</h2>
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-ink-dim mb-2">Rate your current plan</label>
                  <div className="flex gap-2">
                    {[1, 2, 3, 4, 5].map((s) => (
                      <button key={s} onClick={() => setRating(s)} type="button">
                        <Star size={28} className={s <= rating ? 'text-amber-400 fill-amber-400' : 'text-ink-faint hover:text-amber-300'} />
                      </button>
                    ))}
                  </div>
                </div>
                <Textarea label="Outcome notes" value={outcomeNotes} onChange={setOutcomeNotes} placeholder="How has the plan been working for you?" rows={3} />
                <label className="flex items-center gap-3 cursor-pointer">
                  <input type="checkbox" checked={symptomsImproved} onChange={(e) => setSymptomsImproved(e.target.checked)} className="h-5 w-5 rounded text-accent focus:ring-accent" />
                  <span className="text-sm text-ink-dim">My symptoms have improved</span>
                </label>
                <Textarea label="Side effects (if any)" value={sideEffects} onChange={setSideEffects} placeholder="Describe any side effects experienced" rows={2} />
                <div className="flex gap-3 justify-end">
                  <Button variant="ghost" onClick={() => setShowFeedback(false)}>Cancel</Button>
                  <Button onClick={submitFeedback} disabled={submitting}>
                    {submitting ? <Spinner className="h-4 w-4" /> : <><Upload size={16} /> Submit</>}
                  </Button>
                </div>
              </div>
            </div>
          </Card>
        </div>
      )}
    </div>
  );
}

function ItemGroup({ title, subtitle, icon, items, logs, savingId, onToggle }: { title: string; subtitle: string; icon: React.ReactNode; items: DoctorPlanItem[]; logs: DoctorPlanItemLog[]; savingId: string | null; onToggle: (item: DoctorPlanItem) => Promise<void> }) {
  return <Card><CardHeader title={title} subtitle={subtitle} icon={icon} /><CardBody><div className="space-y-3">{items.map((item) => { const completed = logs.some((log) => log.item_id === item.id && log.completed); return <button key={item.id} onClick={() => void onToggle(item)} disabled={savingId === item.id} className={`w-full flex items-start gap-4 p-4 rounded border text-left transition-all ${completed ? 'bg-risk-low/10 border-risk-low/30' : 'bg-surface border-hairline hover:border-accent hover:bg-surface-2/40'} disabled:opacity-60`}><span className={`mt-0.5 h-6 w-6 rounded border-2 flex items-center justify-center shrink-0 ${completed ? 'bg-risk-low/100 border-emerald-500 text-ink' : 'border-hairline text-transparent'}`}>{savingId === item.id ? <RotateCcw size={14} className="animate-spin text-ink-faint" /> : <Check size={15} />}</span><span className="flex-1 min-w-0"><span className={`block font-semibold ${completed ? 'text-emerald-800 line-through' : 'text-ink'}`}>{item.title}</span>{item.details && <span className="block text-sm text-ink-dim mt-1">{item.details}</span>}{item.frequency && <span className="block text-xs text-ink-dim mt-2">{item.frequency}</span>}</span>{completed && <CheckCircle2 size={20} className="text-risk-low shrink-0" />}</button>; })}</div></CardBody></Card>;
}
