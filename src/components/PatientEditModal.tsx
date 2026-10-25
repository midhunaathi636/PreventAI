/**
 * Clinician-facing editor for a patient's record.
 *
 * Two groups of fields, and the split matters:
 *
 *   Identity   name, date of birth, contact. Stored as Profile columns.
 *   Clinical   vitals, labs, history, behaviour, constraints, medications,
 *              allergies. Stored inside `health_preferences`.
 *
 * The clinical group is exactly what the Risk agent reads, so a clinician who
 * corrects a blood pressure here and re-runs the assessment gets a different
 * score. That is the point of the screen — it is not a contact-details form.
 *
 * Nothing is written until Save, and only fields that actually changed are
 * sent, so an edit to one value cannot blank another.
 */

import { useMemo, useState } from 'react';
import { Save, X } from 'lucide-react';
import { Button, Input, Select, Textarea, Spinner, Toggle } from '@/components/ui';
import type { Profile } from '@/lib/types';

export interface PatientEditValues {
  first_name: string;
  last_name: string;
  date_of_birth: string;
  gender: string;
  phone: string;
  address: string;
  health_preferences: Record<string, unknown>;
  constraints: string[];
}

const NUMERIC_FIELDS: { key: string; label: string; unit: string; placeholder: string }[] = [
  { key: 'systolic_bp', label: 'Systolic BP', unit: 'mmHg', placeholder: '128' },
  { key: 'diastolic_bp', label: 'Diastolic BP', unit: 'mmHg', placeholder: '82' },
  { key: 'total_cholesterol', label: 'Total cholesterol', unit: 'mg/dL', placeholder: '205' },
  { key: 'hdl', label: 'HDL', unit: 'mg/dL', placeholder: '48' },
  { key: 'ldl', label: 'LDL', unit: 'mg/dL', placeholder: '125' },
  { key: 'fasting_glucose', label: 'Fasting glucose', unit: 'mg/dL', placeholder: '98' },
  { key: 'bmi', label: 'BMI', unit: '', placeholder: '26' },
  { key: 'activity_minutes_week', label: 'Activity', unit: 'min/week', placeholder: '90' },
  { key: 'alcohol_drinks_week', label: 'Alcohol', unit: 'drinks/week', placeholder: '3' },
];

const FLAGS: { key: string; label: string }[] = [
  { key: 'smoker', label: 'Current smoker' },
  { key: 'diabetes', label: 'Diagnosed diabetes' },
  { key: 'family_history_cvd', label: 'Family history — cardiovascular' },
  { key: 'family_history_cancer', label: 'Family history — cancer' },
];

/** `["a","b"]` <-> `"a, b"` for the free-text list fields. */
const toList = (text: string): string[] =>
  text
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);

const fromList = (value: unknown): string =>
  Array.isArray(value) ? value.map(String).join(', ') : '';

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="mb-1.5 block text-small font-semibold text-ink-dim">{label}</label>
      {children}
    </div>
  );
}

function SectionTitle({ children, note }: { children: React.ReactNode; note?: string }) {
  return (
    <div className="mb-4 mt-2 border-b border-hairline pb-2">
      <h3 className="font-display text-xl uppercase text-ink">{children}</h3>
      {note && <p className="mt-1 text-small text-ink-dim">{note}</p>}
    </div>
  );
}

export function PatientEditModal({
  patient,
  open,
  onClose,
  onSave,
}: {
  patient: Profile;
  open: boolean;
  onClose: () => void;
  onSave: (updates: Partial<PatientEditValues>) => Promise<void>;
}) {
  const initial = useMemo(() => {
    const hp = (patient.health_preferences ?? {}) as Record<string, unknown>;
    return {
      first_name: patient.first_name ?? '',
      last_name: patient.last_name ?? '',
      date_of_birth: patient.date_of_birth ?? '',
      gender: patient.gender ?? '',
      phone: patient.phone ?? '',
      address: patient.address ?? '',
      constraints: (patient.constraints ?? []).join(', '),
      diet_quality: String(hp.diet_quality ?? ''),
      current_medications: fromList(hp.current_medications),
      allergies: fromList(hp.allergies),
      ...Object.fromEntries(
        NUMERIC_FIELDS.map((f) => [f.key, hp[f.key] === undefined ? '' : String(hp[f.key])])
      ),
      ...Object.fromEntries(FLAGS.map((f) => [f.key, Boolean(hp[f.key])])),
    } as Record<string, string | boolean>;
  }, [patient]);

  const [form, setForm] = useState(initial);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!open) return null;

  const set = (key: string, value: string | boolean) =>
    setForm((prev) => ({ ...prev, [key]: value }));

  const str = (key: string) => String(form[key] ?? '');

  async function handleSave() {
    setSaving(true);
    setError(null);
    try {
      // Rebuild health_preferences from the existing object so keys this form
      // does not expose (anything set elsewhere) survive the edit.
      const hp: Record<string, unknown> = {
        ...((patient.health_preferences ?? {}) as Record<string, unknown>),
      };

      for (const field of NUMERIC_FIELDS) {
        const raw = str(field.key);
        if (raw === '') delete hp[field.key];
        else {
          const n = Number(raw);
          if (Number.isFinite(n)) hp[field.key] = n;
        }
      }
      for (const flag of FLAGS) hp[flag.key] = Boolean(form[flag.key]);

      if (str('diet_quality')) hp.diet_quality = str('diet_quality');
      else delete hp.diet_quality;

      hp.current_medications = toList(str('current_medications'));
      hp.allergies = toList(str('allergies'));

      await onSave({
        first_name: str('first_name'),
        last_name: str('last_name'),
        date_of_birth: str('date_of_birth') || '',
        gender: str('gender'),
        phone: str('phone'),
        address: str('address'),
        constraints: toList(str('constraints')),
        health_preferences: hp,
      });
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setSaving(false);
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto p-4 py-10"
      role="dialog"
      aria-modal="true"
      aria-label={`Edit ${patient.first_name} ${patient.last_name}`}
    >
      <div className="absolute inset-0 bg-ink/25" onClick={saving ? undefined : onClose} />

      <div className="relative w-full max-w-3xl rounded border border-hairline bg-surface shadow-2xl">
        <header className="sticky top-0 z-10 flex items-center justify-between gap-4 rounded-t border-b border-hairline bg-surface p-5">
          <div className="min-w-0">
            <h2 className="font-display text-2xl uppercase text-ink">Edit patient</h2>
            <p className="mt-0.5 truncate text-small text-ink-dim">
              {patient.first_name} {patient.last_name} · {patient.email}
            </p>
          </div>
          <button
            onClick={onClose}
            disabled={saving}
            aria-label="Close"
            className="rounded p-1 text-ink-faint transition-colors hover:text-ink disabled:opacity-40"
          >
            <X size={20} />
          </button>
        </header>

        <div className="max-h-[65vh] overflow-y-auto p-5">
          <SectionTitle>Identity</SectionTitle>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="First name">
              <Input value={str('first_name')} onChange={(v) => set('first_name', v)} />
            </Field>
            <Field label="Last name">
              <Input value={str('last_name')} onChange={(v) => set('last_name', v)} />
            </Field>
            <Field label="Date of birth">
              <Input
                type="date"
                value={str('date_of_birth')}
                onChange={(v) => set('date_of_birth', v)}
              />
            </Field>
            <Select
              label="Sex"
              value={str('gender')}
              onChange={(v) => set('gender', v)}
              options={[
                { value: '', label: 'Not recorded' },
                { value: 'male', label: 'Male' },
                { value: 'female', label: 'Female' },
                { value: 'other', label: 'Other' },
              ]}
            />
            <Field label="Phone">
              <Input value={str('phone')} onChange={(v) => set('phone', v)} />
            </Field>
            <Field label="Address">
              <Input value={str('address')} onChange={(v) => set('address', v)} />
            </Field>
          </div>

          <SectionTitle note="These are the values the Risk agent reads. Leave a field blank and the agent uses a population default, which lowers the confidence of the score.">
            Vitals and labs
          </SectionTitle>
          <div className="grid gap-4 sm:grid-cols-3">
            {NUMERIC_FIELDS.map((field) => (
              <Field key={field.key} label={field.unit ? `${field.label} (${field.unit})` : field.label}>
                <Input
                  type="number"
                  value={str(field.key)}
                  onChange={(v) => set(field.key, v)}
                  placeholder={field.placeholder}
                />
              </Field>
            ))}
            <Select
              label="Diet quality"
              value={str('diet_quality')}
              onChange={(v) => set('diet_quality', v)}
              options={[
                { value: '', label: 'Not recorded' },
                { value: 'poor', label: 'Poor' },
                { value: 'fair', label: 'Fair' },
                { value: 'good', label: 'Good' },
                { value: 'excellent', label: 'Excellent' },
              ]}
            />
          </div>

          <SectionTitle>History</SectionTitle>
          <div className="grid gap-3 sm:grid-cols-2">
            {FLAGS.map((flag) => (
              <Toggle
                key={flag.key}
                checked={Boolean(form[flag.key])}
                onChange={(v) => set(flag.key, v)}
                label={flag.label}
              />
            ))}
          </div>

          <SectionTitle note="Comma separated. The Safety agent screens every action against medications and allergies, and the Personalization agent adapts actions to constraints.">
            Safety context
          </SectionTitle>
          <div className="grid gap-4">
            <Field label="Current medications">
              <Textarea
                rows={2}
                value={str('current_medications')}
                onChange={(v) => set('current_medications', v)}
                placeholder="metformin 500mg, warfarin 5mg"
              />
            </Field>
            <Field label="Allergies">
              <Textarea
                rows={2}
                value={str('allergies')}
                onChange={(v) => set('allergies', v)}
                placeholder="penicillin, peanut"
              />
            </Field>
            <Field label="Constraints">
              <Textarea
                rows={2}
                value={str('constraints')}
                onChange={(v) => set('constraints', v)}
                placeholder="pregnant, knee_injury, vegetarian, shift_work"
              />
            </Field>
          </div>

          {error && (
            <p className="mt-5 rounded border border-risk-very-high/40 bg-risk-very-high/5 p-3 text-small text-risk-very-high">
              Could not save: {error}
            </p>
          )}
        </div>

        <footer className="flex items-center justify-between gap-4 rounded-b border-t border-hairline bg-surface-2 p-5">
          <p className="text-small text-ink-dim">
            Saved changes feed the next assessment you run for this patient.
          </p>
          <div className="flex flex-shrink-0 gap-2">
            <Button variant="outline" onClick={onClose} disabled={saving}>
              Cancel
            </Button>
            <Button onClick={handleSave} disabled={saving}>
              {saving ? (
                <>
                  <Spinner className="h-4 w-4" /> Saving
                </>
              ) : (
                <>
                  <Save size={16} /> Save changes
                </>
              )}
            </Button>
          </div>
        </footer>
      </div>
    </div>
  );
}
