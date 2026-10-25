import { useCallback, useEffect, useState } from 'react';
import { Calendar, Pill, FileText, Stethoscope, Clock, CheckCircle2 } from 'lucide-react';
import { useAuth } from '@/context/AuthContext';
import { apiClient } from '@/lib/aws-api-client';
import { Card, CardHeader, CardBody, Badge, EmptyState, Spinner, Button } from '@/components/ui';
import { formatDate } from '@/lib/utils';

const DEFAULT_TIMES = [
  '09:00', '09:30', '10:00', '10:30', '11:00', '11:30',
  '14:00', '14:30', '15:00', '15:30', '16:00', '16:30',
];

export function PatientCare() {
  const { profile } = useAuth();
  const [loading, setLoading] = useState(true);
  const [appointments, setAppointments] = useState<any[]>([]);
  const [prescriptions, setPrescriptions] = useState<any[]>([]);
  const [carePlans, setCarePlans] = useState<any[]>([]);
  const [notes, setNotes] = useState<any[]>([]);
  const [clinicians, setClinicians] = useState<any[]>([]);
  const [clinicianId, setClinicianId] = useState('');
  const [date, setDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [slots, setSlots] = useState<any[]>([]);
  const [selectedSlot, setSelectedSlot] = useState<any>(null);
  const [reason, setReason] = useState('');
  const [patientNotes, setPatientNotes] = useState('');
  const [booking, setBooking] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!profile) return;
    try {
      const [appts, rx, plans, docs, cliniciansList] = await Promise.all([
        apiClient.getMyAppointments().catch(() => []),
        apiClient.getPrescriptions().catch(() => []),
        apiClient.getCarePlans().catch(() => []),
        apiClient.getSymptomNotes(profile.id).catch(() => []),
        apiClient.listClinicians().catch(() => []),
      ]);
      setAppointments(appts || []);
      setPrescriptions(rx || []);
      setCarePlans(plans || []);
      setNotes(docs || []);
      setClinicians(cliniciansList || []);
      if (profile.clinician_id) setClinicianId(profile.clinician_id);
      else if (cliniciansList?.[0]?.id) setClinicianId(cliniciansList[0].id);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  }, [profile]);

  useEffect(() => { void load(); }, [load]);

  useEffect(() => {
    if (!clinicianId || !date) return;
    apiClient.getAvailableSlots(clinicianId, date).then(setSlots).catch(() => setSlots([]));
    setSelectedSlot(null);
  }, [clinicianId, date]);

  async function book() {
    if (!selectedSlot || !clinicianId) return;
    setBooking(true);
    setMsg(null);
    try {
      await apiClient.bookAppointment({
        clinicianId,
        slotId: selectedSlot.id,
        appointmentDate: date,
        appointmentTime: selectedSlot.slotTime,
        reason,
        patientNotes,
      });
      setMsg('Appointment requested. Waiting for doctor confirmation.');
      setReason('');
      setPatientNotes('');
      setSelectedSlot(null);
      await load();
      const available = await apiClient.getAvailableSlots(clinicianId, date);
      setSlots(available);
    } catch (e: any) {
      setMsg(e.message || 'Booking failed');
    } finally {
      setBooking(false);
    }
  }

  if (loading) return <div className="flex justify-center py-20"><Spinner className="h-8 w-8" /></div>;
  if (!profile) return null;

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

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-ink">Care & Records</h1>
        <p className="text-ink-dim mt-1">Book slots, view prescriptions, notes, and care plans</p>
      </div>

      {msg && (
        <div className="rounded border border-accent/30 bg-accent/10 px-4 py-3 text-sm text-accent-deep">{msg}</div>
      )}

      <div className="grid lg:grid-cols-2 gap-6">
        <Card>
          <CardHeader title="Book appointment" subtitle="One patient per time slot" icon={<Calendar size={20} />} />
          <CardBody className="space-y-4">
            <div>
              <label className="text-sm font-medium text-ink-dim">Clinician</label>
              <select
                className="mt-1 w-full rounded border border-hairline px-3 py-2.5"
                value={clinicianId}
                onChange={(e) => setClinicianId(e.target.value)}
              >
                <option value="">Select clinician</option>
                {clinicians.map((c) => (
                  <option key={c.id} value={c.id}>
                    Dr. {c.first_name} {c.last_name} ({c.email})
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="text-sm font-medium text-ink-dim">Date</label>
              <input
                type="date"
                className="mt-1 w-full rounded border border-hairline px-3 py-2.5"
                value={date}
                min={new Date().toISOString().slice(0, 10)}
                onChange={(e) => setDate(e.target.value)}
              />
            </div>
            <div>
              <label className="text-sm font-medium text-ink-dim">Available slots</label>
              {slots.length === 0 ? (
                <p className="text-sm text-ink-dim mt-2">No open slots for this date. Ask your doctor to publish availability.</p>
              ) : (
                <div className="mt-2 flex flex-wrap gap-2">
                  {slots.map((s) => (
                    <button
                      key={s.id}
                      type="button"
                      onClick={() => setSelectedSlot(s)}
                      className={`px-3 py-1.5 rounded text-sm border ${
                        selectedSlot?.id === s.id
                          ? 'bg-accent text-ink border-accent'
                          : 'bg-surface text-ink-dim border-hairline hover:border-accent'
                      }`}
                    >
                      <Clock size={14} className="inline mr-1" />
                      {s.slotTime}
                    </button>
                  ))}
                </div>
              )}
            </div>
            <div>
              <label className="text-sm font-medium text-ink-dim">Reason</label>
              <input
                className="mt-1 w-full rounded border border-hairline px-3 py-2.5"
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                placeholder="e.g. Follow-up, new symptoms"
              />
            </div>
            <div>
              <label className="text-sm font-medium text-ink-dim">Notes for doctor</label>
              <textarea
                className="mt-1 w-full rounded border border-hairline px-3 py-2.5 min-h-[80px]"
                value={patientNotes}
                onChange={(e) => setPatientNotes(e.target.value)}
              />
            </div>
            <Button onClick={book} disabled={!selectedSlot || booking}>
              {booking ? 'Booking…' : 'Request appointment'}
            </Button>
            <p className="text-xs text-ink-faint">
              Default slot times doctors may open: {DEFAULT_TIMES.slice(0, 4).join(', ')}…
            </p>
          </CardBody>
        </Card>

        <Card>
          <CardHeader title="My appointments" subtitle="Status updates from your clinician" icon={<CheckCircle2 size={20} />} />
          <CardBody>
            {appointments.length === 0 ? (
              <EmptyState icon={<Calendar size={28} />} title="No appointments" message="Book a slot to get started." />
            ) : (
              <ul className="space-y-3">
                {appointments.map((a) => (
                  <li key={a.id} className="rounded border border-hairline p-3 flex items-start justify-between gap-3">
                    <div>
                      <div className="font-medium text-ink">
                        {formatDate(a.appointment_date)} · {a.appointment_time}
                      </div>
                      <div className="text-sm text-ink-dim mt-0.5">{a.reason || 'Visit'}</div>
                      {a.clinician_notes && (
                        <div className="text-sm text-ink-dim mt-1">Doctor: {a.clinician_notes}</div>
                      )}
                    </div>
                    <Badge className={statusColor(a.status)}>{a.status}</Badge>
                  </li>
                ))}
              </ul>
            )}
          </CardBody>
        </Card>

        <Card>
          <CardHeader title="Prescriptions" subtitle="Medications from your clinician" icon={<Pill size={20} />} />
          <CardBody>
            {prescriptions.length === 0 ? (
              <EmptyState icon={<Pill size={28} />} title="No prescriptions" message="Your doctor can add these after a visit." />
            ) : (
              <ul className="space-y-3">
                {prescriptions.map((r) => (
                  <li key={r.id} className="rounded border border-hairline p-3">
                    <div className="font-medium text-ink">{r.medication_name}</div>
                    <div className="text-sm text-ink-dim">
                      {[r.dosage, r.frequency, r.duration].filter(Boolean).join(' · ')}
                    </div>
                    {r.notes && <div className="text-sm text-ink-dim mt-1">{r.notes}</div>}
                  </li>
                ))}
              </ul>
            )}
          </CardBody>
        </Card>

        <Card>
          <CardHeader title="Care plans" subtitle="Plans uploaded by your doctor" icon={<FileText size={20} />} />
          <CardBody>
            {carePlans.length === 0 ? (
              <EmptyState icon={<FileText size={28} />} title="No care plans yet" message="Care plans appear after your clinician uploads them." />
            ) : (
              <ul className="space-y-3">
                {carePlans.map((p) => (
                  <li key={p.id} className="rounded border border-hairline p-3">
                    <div className="font-medium text-ink">{p.title}</div>
                    {p.goals && <div className="text-sm text-ink-dim mt-1"><strong>Goals:</strong> {p.goals}</div>}
                    <div className="text-sm text-ink-dim mt-1 whitespace-pre-wrap">{p.content}</div>
                    {p.instructions && <div className="text-sm text-ink-dim mt-1">{p.instructions}</div>}
                    {p.follow_up_date && (
                      <div className="text-xs text-ink-faint mt-2">Follow-up: {p.follow_up_date}</div>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </CardBody>
        </Card>

        <Card className="lg:col-span-2">
          <CardHeader title="Clinical notes" subtitle="Symptom notes from visits" icon={<Stethoscope size={20} />} />
          <CardBody>
            {notes.length === 0 ? (
              <EmptyState icon={<Stethoscope size={28} />} title="No notes yet" message="Notes your clinician records will show here." />
            ) : (
              <ul className="space-y-3">
                {notes.map((n) => (
                  <li key={n.id} className="rounded border border-hairline p-3">
                    <div className="font-medium text-ink">{n.title}</div>
                    <div className="text-sm text-ink-dim mt-1 whitespace-pre-wrap">{n.details}</div>
                    <div className="text-xs text-ink-faint mt-2">{n.recorded_at ? formatDate(n.recorded_at) : ''}</div>
                  </li>
                ))}
              </ul>
            )}
          </CardBody>
        </Card>
      </div>
    </div>
  );
}
