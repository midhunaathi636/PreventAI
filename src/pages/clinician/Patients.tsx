import { useEffect, useState, useCallback } from 'react';
import { Search, Users, TrendingUp, ArrowRight, UserPlus } from 'lucide-react';
import { useAuth } from '@/context/AuthContext';
import { Link } from '@/context/RouterContext';
import { apiClient } from '@/lib/aws-api-client';
import { Card, CardBody, Badge, EmptyState, Spinner, Avatar, StatCard, Button } from '@/components/ui';
import { riskLevelColor, riskLevelLabel, getInitials, timeAgo } from '@/lib/utils';
import type { Profile, RiskScore } from '@/lib/types';

type PatientRow = Profile & {
  latest_risk?: RiskScore;
  riskScore?: number;
  riskLevel?: string;
  assigned_to_me?: boolean;
};

export function ClinicianPatients() {
  const { profile } = useAuth();
  const [loading, setLoading] = useState(true);
  const [patients, setPatients] = useState<PatientRow[]>([]);
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState('all');
  const [assigning, setAssigning] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!profile) return;
    try {
      const data = await apiClient.getClinicianPatients();
      setPatients((data.patients || []).filter((p: any) => p && p.id) as PatientRow[]);
    } catch (error) {
      console.error('Failed to load patients:', error);
    } finally {
      setLoading(false);
    }
  }, [profile]);

  useEffect(() => {
    load();
  }, [load]);

  async function assign(patientId: string) {
    setAssigning(patientId);
    try {
      await apiClient.assignPatientToMe(patientId);
      await load();
    } catch (err) {
      console.error(err);
      alert('Could not assign patient. Ensure backend Profile update is allowed for authenticated users.');
    } finally {
      setAssigning(null);
    }
  }

  if (loading) {
    return (
      <div className="flex justify-center py-20">
        <Spinner className="h-8 w-8" />
      </div>
    );
  }

  const filtered = patients.filter((p) => {
    const q = search.toLowerCase();
    const matchesSearch =
      !q ||
      `${p.first_name} ${p.last_name}`.toLowerCase().includes(q) ||
      (p.email || '').toLowerCase().includes(q);
    const level = p.latest_risk?.risk_level || p.riskLevel || 'low';
    const matchesFilter = filter === 'all' || level === filter || (filter === 'mine' && p.assigned_to_me);
    return matchesSearch && matchesFilter;
  });

  const highRisk = patients.filter(
    (p) => p.latest_risk && (p.latest_risk.risk_level === 'high' || p.latest_risk.risk_level === 'very_high')
  ).length;
  const moderateRisk = patients.filter((p) => p.latest_risk?.risk_level === 'moderate').length;
  const lowRisk = patients.filter((p) => !p.latest_risk || p.latest_risk.risk_level === 'low').length;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-ink">Patients</h1>
        <p className="text-ink-dim mt-1">
          All registered patients. Assign a patient to your panel to manage their care.
        </p>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard label="Total Patients" value={patients.length} icon={<Users size={20} />} color="teal" />
        <StatCard label="High Risk" value={highRisk} icon={<TrendingUp size={20} />} color="red" />
        <StatCard label="Moderate Risk" value={moderateRisk} icon={<TrendingUp size={20} />} color="amber" />
        <StatCard label="Low Risk" value={lowRisk} icon={<Users size={20} />} color="emerald" />
      </div>

      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-ink-faint" />
          <input
            className="w-full pl-9 pr-3 py-2.5 rounded border border-hairline"
            placeholder="Search by name or email..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <select
          className="rounded border border-hairline px-3 py-2.5"
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
        >
          <option value="all">All Risk Levels</option>
          <option value="mine">Assigned to me</option>
          <option value="low">Low</option>
          <option value="moderate">Moderate</option>
          <option value="high">High</option>
          <option value="very_high">Very High</option>
        </select>
      </div>

      {filtered.length === 0 ? (
        <Card>
          <CardBody>
            <EmptyState
              icon={<Users size={32} />}
              title={patients.length === 0 ? 'No patients yet' : 'No patients match your search'}
              message={
                patients.length === 0
                  ? 'When patients register, they appear here. Ask them to run AI Assessment so risk scores show up.'
                  : 'Try adjusting your search or filter.'
              }
            />
          </CardBody>
        </Card>
      ) : (
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {filtered.map((p) => {
            const risk = p.latest_risk;
            const colors = risk
              ? riskLevelColor(risk.risk_level)
              : {
                  bg: 'bg-surface-2',
                  text: 'text-ink-dim',
                  border: 'border-hairline',
                  dot: 'bg-ink-faint',
                };
            return (
              <Card key={p.id} className="p-5 hover: hover:border-accent transition-all h-full">
                <Link to={`/clinician/patient/${p.id}`} className="block">
                  <div className="flex items-center gap-3 mb-4">
                    <Avatar initials={getInitials(p.first_name, p.last_name)} size="lg" />
                    <div className="flex-1 min-w-0">
                      <div className="font-semibold text-ink truncate">
                        {p.first_name} {p.last_name}
                      </div>
                      <div className="text-sm text-ink-dim truncate">{p.email}</div>
                      {p.assigned_to_me && (
                        <Badge className="mt-1 bg-accent/10 text-accent border-accent/30">Assigned to you</Badge>
                      )}
                    </div>
                  </div>
                  <div className="space-y-2">
                    {risk ? (
                      <>
                        <div className="flex items-center justify-between">
                          <span className="text-sm text-ink-dim">Risk Score</span>
                          <span className="font-bold text-ink">{risk.overall_risk}/100</span>
                        </div>
                        <Badge className={`${colors.bg} ${colors.text} ${colors.border}`}>
                          <span className={`h-1.5 w-1.5 rounded-full ${colors.dot}`} />
                          {riskLevelLabel(risk.risk_level)}
                        </Badge>
                        <div className="text-xs text-ink-faint pt-1">Updated {timeAgo(risk.recorded_at)}</div>
                      </>
                    ) : (
                      <div className="text-sm text-ink-faint">No risk assessment yet</div>
                    )}
                  </div>
                  <div className="mt-4 pt-3 border-t border-hairline flex items-center justify-between text-sm text-accent font-medium">
                    View Details <ArrowRight size={16} />
                  </div>
                </Link>
                {!p.assigned_to_me && (
                  <Button
                    size="sm"
                    variant="outline"
                    className="w-full mt-3"
                    disabled={assigning === p.id}
                    onClick={() => { void assign(p.id); }}
                  >
                    <UserPlus size={14} />
                    {assigning === p.id ? 'Assigning…' : 'Assign to my panel'}
                  </Button>
                )}
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
