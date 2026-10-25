import { useCallback, useEffect, useState } from 'react';
import {
  Calendar, Clock, Check, X, FileText, Pill, StickyNote, Activity, User,
} from 'lucide-react';
import { useAuth } from '@/context/AuthContext';
import { apiClient } from '@/lib/aws-api-client';
import { Card, CardHeader, CardBody, Badge, EmptyState, Spinner, Button } from '@/components/ui';
import { formatDate } from '@/lib/utils';

const SLOT_TIMES = [
  '09:00', '09:30', '10:00', '10:30', '11:00', '11:30',
  '14:00', '14:30', '15:00', '15:30', '16:00', '16:30',
];

export function DoctorCare() {
  const { profile } = useAuth();
  const [loading, setLoading] = useState(true);
  const [appointments, setAppointments] = useState<any[]>([]);
  const [slotDate, setSlotDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [mySlots, setMySlots] = useState<any[]>([]);
  const [selectedTimes, setSelectedTimes] = useState<string[]>([]);
  const [publishing, setPublishing] = useState(false);
  const [active, setActive] = useState<any>(null);
  const [bundle, setBundle] = useState<any>(null);
  const [msg, setMsg] = useState<string | null>(null);

  // forms
  const [noteTitle, setNoteTitle] = useState('Visit notes');
  const [noteDetails, setNoteDetails] = useState('');
  const [rxName, setRxName] = useState('');
  const [rxDose, setRxDose] = useState('');
  const [rxFreq, setRxFreq] = useState('');
  const [rxNotes, setRxNotes] = useState('');
  const [planTitle, setPlanTitle] = useState('Care plan');
  const [planContent, setPlanContent] = useState('');
  const [planGoals, setPlanGoals] = useState('');
  const [planInstructions, setPlanInstructions] = useState('');
  const [planFollowUp, setPlanFollowUp] = useState('');
  const [clinicianNotes, setClinicianNotes] = useState('');
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    if (!profile) return;
    try {
      const [appts, slots] = await Promise.all([
        apiClient.getDoctorAppointments().catch(() => []),
        apiClient.getDoctorSlots(undefined, slotDate).catch(() => []),
      ]);
      setAppointments(appts || []);
      setMySlots(slots || []);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  }, [profile, slotDate]);

  useEffect(() => { void load(); }, [load]);

  async function publishSlots() {
    if (!selectedTimes.length) return;
    setPublishing(true);
    setMsg(null);
    try {
      await apiClient.createDoctorSlots(slotDate, selectedTimes);
      setMsg(`Published ${selectedTimes.length} slot(s) for ${slotDate}`);
      setSelectedTimes([]);
      await load();
    } catch (e: any) {
      setMsg(e.message || 'Failed to publish slots');
    } finally {
      setPublishing(false);
    }
  }

  function toggleTime(t: string) {
    setSelectedTimes((prev) =>
      prev.includes(t) ? prev.filter((x) => x !== t) : [...prev, t]
    );
  }

  async function setStatus(id: string, status: 'confirmed' | 'rejected' | 'completed' | 'cancelled') {
    setSaving(true);
    try {
      await apiClient.updateAppointmentStatus(id, status, clinicianNotes || undefined);
      setMsg(`Appointment ${status}`);
      await load();
      if (active?.id === id) {
        setActive((a: any) => (a ? { ...a, status } : a));
      }
    } catch (e: any) {
      setMsg(e.message || 'Update failed');
    } finally {
      setSaving(false);
    }
  }

  async function openPatient(appt: any) {
    setActive(appt);
    setClinicianNotes(appt.clinician_notes || '');
    setBundle(null);
    try {
      const b = await apiClient.getPatientCareBundle(appt.patient_id);
      setBundle(b);
    } catch (e) {
      console.error(e);
    }
  }

  async function saveNote() {
    if (!active || !noteDetails.trim()) return;
    setSaving(true);
    try {
      await apiClient.addSymptomNote({
        patientId: active.patient_id,
        appointmentId: active.id,
        title: noteTitle || 'Visit notes',
        details: noteDetails,
      });
      setMsg('Symptom note saved');
      setNoteDetails('');
      const b = await apiClient.getPatientCareBundle(active.patient_id);
      setBundle(b);
    } catch (e: any) {
      setMsg(e.message || 'Failed to save note');
    } finally {
      setSaving(false);
    }
  }

  async function saveRx() {
    if (!active || !rxName.trim()) return;
    setSaving(true);
    try {
      await apiClient.addPrescription({
        patientId: active.patient_id,
        appointmentId: active.id,
        medicationName: rxName,
        dosage: rxDose,
        frequency: rxFreq,
        notes: rxNotes,
      });
      setMsg('Prescription added');
      setRxName('');
      setRxDose('');
      setRxFreq('');
      setRxNotes('');
      const b = await apiClient.getPatientCareBundle(active.patient_id);
      setBundle(b);
    } catch (e: any) {
      setMsg(e.message || 'Failed to add prescription');
    } finally {
      setSaving(false);
    }
  }

  async function saveCarePlan() {
    if (!active || !planContent.trim()) return;
    setSaving(true);
    try {
      await apiClient.uploadCarePlan({
        patientId: active.patient_id,
        appointmentId: active.id,
        title: planTitle || 'Care plan',
        content: planContent,
        goals: planGoals,
        instructions: planInstructions,
        followUpDate: planFollowUp || undefined,
      });
      setMsg('Care plan uploaded');
      setPlanContent('');
      setPlanGoals('');
      setPlanInstructions('');
      const b = await apiClient.getPatientCareBundle(active.patient_id);
      setBundle(b);
    } catch (e: any) {
      setMsg(e.message || 'Failed to upload care plan');
    } finally {
      setSaving(false);
    }
  }

  if (loading) return <div className="flex justify-center py-20"><Spinner className="h-8 w-8" /></div>;

  const statusColor = (s: string) => {
    switch (s) {
      case 'confirmed': return 'bg-risk-low/10 text-risk-low border-risk-low/30';
      case 'requested': return 'bg-risk-moderate/10 text-risk-moderate border-risk-moderate/30';
      case 'rejected':
      case 'cancelled': return 'bg-risk-very-high/10 text-risk-very-high border-risk-very-high/30';
      case 'completed': return 'bg-surface-3 text-ink-dim border-hairline';
      default: return 'bg-surface-2 text-ink-dim border-hairline';
    }
  };

  const pending = appointments.filter((a) => a.status === 'requested');
  const upcoming = appointments.filter((a) => a.status === 'confirmed');

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-ink">Care Desk</h1>
        <p className="text-ink-dim mt-1">
          Publish slots (1 patient each), accept visits, notes, prescriptions, care plans
        </p>
      </div>

      {msg && (
        <div className="rounded border border-accent/30 bg-accent/10 px-4 py-3 text-sm text-accent-deep">{msg}</div>
      )}

      <div className="grid lg:grid-cols-2 gap-6">
        {/* Publish slots */}
        <Card>
          <CardHeader title="Publish available slots" subtitle="Patients can book only open slots" icon={<Clock size={20} />} />
          <CardBody className="space-y-4">
            <div>
              <label className="text-sm font-medium text-ink-dim">Date</label>
              <input
                type="date"
                className="mt-1 w-full rounded border border-hairline px-3 py-2.5"
                value={slotDate}
                min={new Date().toISOString().slice(0, 10)}
                onChange={(e) => setSlotDate(e.target.value)}
              />
            </div>
            <div className="flex flex-wrap gap-2">
              {SLOT_TIMES.map((t) => {
                const already = mySlots.some((s) => s.slotTime === t);
                const selected = selectedTimes.includes(t);
                return (
                  <button
                    key={t}
                    type="button"
                    disabled={already}
                    onClick={() => toggleTime(t)}
                    className={`px-3 py-1.5 rounded text-sm border ${
                      already
                        ? 'bg-surface-3 text-ink-faint border-hairline cursor-not-allowed'
                        : selected
                          ? 'bg-accent text-ink border-accent'
                          : 'bg-surface text-ink-dim border-hairline hover:border-accent'
                    }`}
                  >
                    {t}{already ? (mySlots.find((s) => s.slotTime === t)?.isBooked ? ' · booked' : ' · open') : ''}
                  </button>
                );
              })}
            </div>
            <Button onClick={publishSlots} disabled={!selectedTimes.length || publishing}>
              {publishing ? 'Publishing…' : `Publish ${selectedTimes.length || ''} slot(s)`}
            </Button>
          </CardBody>
        </Card>

        {/* Appointment queue */}
        <Card>
          <CardHeader title="Appointment requests" subtitle={`${pending.length} pending`} icon={<Calendar size={20} />} />
          <CardBody>
            {appointments.length === 0 ? (
              <EmptyState icon={<Calendar size={28} />} title="No appointments" message="When patients book your slots, they appear here." />
            ) : (
              <ul className="space-y-2 max-h-80 overflow-y-auto">
                {appointments.map((a) => (
                  <li
                    key={a.id}
                    className={`rounded border p-3 cursor-pointer hover:border-accent ${
                      active?.id === a.id ? 'border-accent bg-accent/10/40' : 'border-hairline'
                    }`}
                    onClick={() => openPatient(a)}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <div className="font-medium text-ink flex items-center gap-2">
                          <User size={14} /> {a.patient_name || a.patient_id}
                        </div>
                        <div className="text-sm text-ink-dim">
                          {formatDate(a.appointment_date)} · {a.appointment_time}
                        </div>
                        <div className="text-sm text-ink-dim">{a.reason || 'Visit'}</div>
                      </div>
                      <Badge className={statusColor(a.status)}>{a.status}</Badge>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </CardBody>
        </Card>
      </div>

      {/* Active appointment workspace */}
      {active && (
        <Card>
          <CardHeader
            title={`${active.patient_name || 'Patient'} · ${formatDate(active.appointment_date)} ${active.appointment_time}`}
            subtitle={active.patient_email || active.patient_id}
            icon={<Activity size={20} />}
            action={<Badge className={statusColor(active.status)}>{active.status}</Badge>}
          />
          <CardBody className="space-y-6">
            {active.patient_notes && (
              <p className="text-sm text-ink-dim bg-surface-2 rounded p-3">
                <strong>Patient notes:</strong> {active.patient_notes}
              </p>
            )}

            <div className="flex flex-wrap gap-2">
              {active.status === 'requested' && (
                <>
                  <Button onClick={() => setStatus(active.id, 'confirmed')} disabled={saving}>
                    <Check size={16} className="inline mr-1" /> Accept
                  </Button>
                  <Button variant="danger" onClick={() => setStatus(active.id, 'rejected')} disabled={saving}>
                    <X size={16} className="inline mr-1" /> Decline
                  </Button>
                </>
              )}
              {active.status === 'confirmed' && (
                <Button onClick={() => setStatus(active.id, 'completed')} disabled={saving}>
                  Mark completed
                </Button>
              )}
            </div>

            <div>
              <label className="text-sm font-medium text-ink-dim">Clinician notes (optional on accept)</label>
              <textarea
                className="mt-1 w-full rounded border border-hairline px-3 py-2.5 min-h-[60px]"
                value={clinicianNotes}
                onChange={(e) => setClinicianNotes(e.target.value)}
              />
            </div>

            <div className="grid md:grid-cols-3 gap-4">
              {/* Symptom note */}
              <div className="rounded border border-hairline p-4 space-y-2">
                <div className="font-semibold text-ink flex items-center gap-2">
                  <StickyNote size={16} /> Symptom note
                </div>
                <input
                  className="w-full rounded border border-hairline px-3 py-2 text-sm"
                  value={noteTitle}
                  onChange={(e) => setNoteTitle(e.target.value)}
                  placeholder="Title"
                />
                <textarea
                  className="w-full rounded border border-hairline px-3 py-2 text-sm min-h-[100px]"
                  value={noteDetails}
                  onChange={(e) => setNoteDetails(e.target.value)}
                  placeholder="Symptoms, findings, assessment…"
                />
                <Button size="sm" onClick={saveNote} disabled={saving || !noteDetails.trim()}>
                  Save note
                </Button>
              </div>

              {/* Prescription */}
              <div className="rounded border border-hairline p-4 space-y-2">
                <div className="font-semibold text-ink flex items-center gap-2">
                  <Pill size={16} /> Prescription
                </div>
                <input
                  className="w-full rounded border border-hairline px-3 py-2 text-sm"
                  value={rxName}
                  onChange={(e) => setRxName(e.target.value)}
                  placeholder="Medication name"
                />
                <input
                  className="w-full rounded border border-hairline px-3 py-2 text-sm"
                  value={rxDose}
                  onChange={(e) => setRxDose(e.target.value)}
                  placeholder="Dosage e.g. 10mg"
                />
                <input
                  className="w-full rounded border border-hairline px-3 py-2 text-sm"
                  value={rxFreq}
                  onChange={(e) => setRxFreq(e.target.value)}
                  placeholder="Frequency e.g. twice daily"
                />
                <input
                  className="w-full rounded border border-hairline px-3 py-2 text-sm"
                  value={rxNotes}
                  onChange={(e) => setRxNotes(e.target.value)}
                  placeholder="Notes"
                />
                <Button size="sm" onClick={saveRx} disabled={saving || !rxName.trim()}>
                  Add prescription
                </Button>
              </div>

              {/* Care plan */}
              <div className="rounded border border-hairline p-4 space-y-2">
                <div className="font-semibold text-ink flex items-center gap-2">
                  <FileText size={16} /> Upload care plan
                </div>
                <input
                  className="w-full rounded border border-hairline px-3 py-2 text-sm"
                  value={planTitle}
                  onChange={(e) => setPlanTitle(e.target.value)}
                  placeholder="Title"
                />
                <textarea
                  className="w-full rounded border border-hairline px-3 py-2 text-sm min-h-[80px]"
                  value={planContent}
                  onChange={(e) => setPlanContent(e.target.value)}
                  placeholder="Plan content…"
                />
                <input
                  className="w-full rounded border border-hairline px-3 py-2 text-sm"
                  value={planGoals}
                  onChange={(e) => setPlanGoals(e.target.value)}
                  placeholder="Goals"
                />
                <input
                  className="w-full rounded border border-hairline px-3 py-2 text-sm"
                  value={planInstructions}
                  onChange={(e) => setPlanInstructions(e.target.value)}
                  placeholder="Instructions"
                />
                <input
                  type="date"
                  className="w-full rounded border border-hairline px-3 py-2 text-sm"
                  value={planFollowUp}
                  onChange={(e) => setPlanFollowUp(e.target.value)}
                />
                <Button size="sm" onClick={saveCarePlan} disabled={saving || !planContent.trim()}>
                  Upload plan
                </Button>
              </div>
            </div>

            {/* Monitor patient data */}
            {bundle && (
              <div className="grid md:grid-cols-2 gap-4 pt-2 border-t border-hairline">
                <div>
                  <h4 className="font-semibold text-ink mb-2">Notes history</h4>
                  {(bundle.notes || []).length === 0 ? (
                    <p className="text-sm text-ink-dim">None yet</p>
                  ) : (
                    <ul className="space-y-2 text-sm">
                      {bundle.notes.map((n: any) => (
                        <li key={n.id} className="rounded bg-surface-2 p-2">
                          <strong>{n.title}</strong>
                          <div className="text-ink-dim whitespace-pre-wrap">{n.details}</div>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
                <div>
                  <h4 className="font-semibold text-ink mb-2">Prescriptions</h4>
                  {(bundle.prescriptions || []).length === 0 ? (
                    <p className="text-sm text-ink-dim">None yet</p>
                  ) : (
                    <ul className="space-y-2 text-sm">
                      {bundle.prescriptions.map((r: any) => (
                        <li key={r.id} className="rounded bg-surface-2 p-2">
                          <strong>{r.medication_name}</strong>
                          <div className="text-ink-dim">{[r.dosage, r.frequency].filter(Boolean).join(' · ')}</div>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
                <div>
                  <h4 className="font-semibold text-ink mb-2">Care plans</h4>
                  {(bundle.carePlans || []).length === 0 ? (
                    <p className="text-sm text-ink-dim">None yet</p>
                  ) : (
                    <ul className="space-y-2 text-sm">
                      {bundle.carePlans.map((p: any) => (
                        <li key={p.id} className="rounded bg-surface-2 p-2">
                          <strong>{p.title}</strong>
                          <div className="text-ink-dim">{p.content?.slice(0, 120)}</div>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
                <div>
                  <h4 className="font-semibold text-ink mb-2">Risk scores</h4>
                  {(bundle.riskScores || []).length === 0 ? (
                    <p className="text-sm text-ink-dim">No risk data</p>
                  ) : (
                    <ul className="space-y-2 text-sm">
                      {bundle.riskScores.slice(0, 5).map((r: any) => (
                        <li key={r.id} className="rounded bg-surface-2 p-2">
                          Overall {r.overall_risk}% · {r.risk_level}
                          <div className="text-xs text-ink-faint">{r.recorded_at}</div>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              </div>
            )}
          </CardBody>
        </Card>
      )}

      {!active && upcoming.length > 0 && (
        <p className="text-sm text-ink-dim">
          Tip: click an appointment above to accept it and manage notes, prescriptions, and care plans.
        </p>
      )}
    </div>
  );
}
