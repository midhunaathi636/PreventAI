import { useEffect, useState } from 'react';
import { User, Save, Dna, Heart, Activity } from 'lucide-react';
import { useAuth } from '@/context/AuthContext';
import { apiClient } from '@/lib/aws-api-client';
import { Card, CardHeader, CardBody, Button, Input, Select, Spinner, Badge } from '@/components/ui';
import { getAge, humanize } from '@/lib/utils';

const CONSTRAINT_OPTIONS = [
  'vegetarian',
  'vegan',
  'knee_injury',
  'mobility_limit',
  'pregnant',
  'shift_work',
];

export function PatientProfile() {
  const { profile, refreshProfile } = useAuth();
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [dob, setDob] = useState('');
  const [gender, setGender] = useState('');
  const [phone, setPhone] = useState('');
  const [address, setAddress] = useState('');
  const [constraints, setConstraints] = useState<string[]>([]);
  const [prefExercise, setPrefExercise] = useState('');
  const [geneticApoE, setGeneticApoE] = useState(false);
  const [geneticBrca, setGeneticBrca] = useState(false);
  const [geneticMthfr, setGeneticMthfr] = useState(false);

  // Vitals for AI agents (stored in health_preferences)
  const [systolicBp, setSystolicBp] = useState('128');
  const [diastolicBp, setDiastolicBp] = useState('82');
  const [totalChol, setTotalChol] = useState('205');
  const [hdl, setHdl] = useState('48');
  const [ldl, setLdl] = useState('125');
  const [glucose, setGlucose] = useState('98');
  const [bmi, setBmi] = useState('26');
  const [activity, setActivity] = useState('90');
  const [alcohol, setAlcohol] = useState('3');
  const [dietQuality, setDietQuality] = useState('fair');
  const [smoker, setSmoker] = useState(false);
  const [diabetes, setDiabetes] = useState(false);
  const [fhCvd, setFhCvd] = useState(false);
  const [fhCancer, setFhCancer] = useState(false);
  const [meds, setMeds] = useState('');
  const [allergies, setAllergies] = useState('');

  useEffect(() => {
    if (!profile) return;
    setFirstName(profile.first_name || '');
    setLastName(profile.last_name || '');
    setDob(profile.date_of_birth || '');
    setGender(profile.gender || '');
    setPhone(profile.phone || '');
    setAddress(profile.address || '');
    setConstraints(profile.constraints || []);
    const hp = (profile.health_preferences || {}) as Record<string, any>;
    setPrefExercise(hp.preferred_exercise || '');
    setSystolicBp(String(hp.systolic_bp ?? '128'));
    setDiastolicBp(String(hp.diastolic_bp ?? '82'));
    setTotalChol(String(hp.total_cholesterol ?? '205'));
    setHdl(String(hp.hdl ?? '48'));
    setLdl(String(hp.ldl ?? '125'));
    setGlucose(String(hp.fasting_glucose ?? '98'));
    setBmi(String(hp.bmi ?? '26'));
    setActivity(String(hp.activity_minutes_week ?? '90'));
    setAlcohol(String(hp.alcohol_drinks_week ?? '3'));
    setDietQuality(hp.diet_quality || 'fair');
    setSmoker(!!hp.smoker);
    setDiabetes(!!hp.diabetes);
    setFhCvd(!!hp.family_history_cvd);
    setFhCancer(!!hp.family_history_cancer);
    setMeds(Array.isArray(hp.current_medications) ? hp.current_medications.join(', ') : '');
    setAllergies(Array.isArray(hp.allergies) ? hp.allergies.join(', ') : '');
    setGeneticApoE(!!(profile.genetic_markers as Record<string, boolean>)?.apoe_e4);
    setGeneticBrca(!!(profile.genetic_markers as Record<string, boolean>)?.brac_positive);
    setGeneticMthfr(!!(profile.genetic_markers as Record<string, boolean>)?.mthfr_variant);
  }, [profile]);

  function toggleConstraint(c: string) {
    setConstraints((prev) => (prev.includes(c) ? prev.filter((x) => x !== c) : [...prev, c]));
  }

  async function save() {
    if (!profile) return;
    setSaving(true);
    setSaveError(null);
    try {
      await apiClient.updatePatientProfile({
        first_name: firstName,
        last_name: lastName,
        date_of_birth: dob || null,
        gender,
        phone,
        address,
        constraints,
        health_preferences: {
          preferred_exercise: prefExercise,
          systolic_bp: Number(systolicBp) || 128,
          diastolic_bp: Number(diastolicBp) || 82,
          total_cholesterol: Number(totalChol) || 205,
          hdl: Number(hdl) || 48,
          ldl: Number(ldl) || 125,
          fasting_glucose: Number(glucose) || 98,
          bmi: Number(bmi) || 26,
          activity_minutes_week: Number(activity) || 90,
          alcohol_drinks_week: Number(alcohol) || 0,
          diet_quality: dietQuality,
          smoker,
          diabetes,
          family_history_cvd: fhCvd,
          family_history_cancer: fhCancer,
          current_medications: meds
            .split(',')
            .map((s) => s.trim())
            .filter(Boolean),
          allergies: allergies
            .split(',')
            .map((s) => s.trim())
            .filter(Boolean),
          coaching: 'digital',
        },
        genetic_markers: {
          apoe_e4: geneticApoE,
          brac_positive: geneticBrca,
          mthfr_variant: geneticMthfr,
        },
      });
      await refreshProfile();
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } catch (error) {
      // Shown on the page rather than in an alert: the useful part is the
      // message the API returned, and an alert throws that away.
      console.error('Failed to save profile', error);
      setSaveError(error instanceof Error ? error.message : String(error));
    } finally {
      setSaving(false);
    }
  }

  if (!profile) {
    return (
      <div className="flex justify-center py-20">
        <Spinner className="h-8 w-8" />
      </div>
    );
  }

  const age = getAge(profile.date_of_birth);

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-ink">Profile</h1>
          <p className="text-ink-dim mt-1">Personal info + vitals used by AI risk & plan agents</p>
        </div>
        <Button onClick={save} disabled={saving}>
          <Save size={16} />
          {saving ? 'Saving…' : saved ? 'Saved' : 'Save profile'}
        </Button>
      </div>

      <Card>
        <CardHeader title="Personal Information" subtitle="Basic demographic data" icon={<User size={20} />} />
        <CardBody>
          <div className="grid sm:grid-cols-2 gap-4">
            <Input label="First Name" value={firstName} onChange={setFirstName} />
            <Input label="Last Name" value={lastName} onChange={setLastName} />
            <Input label="Date of Birth" type="date" value={dob} onChange={setDob} />
            <Select
              label="Gender"
              value={gender}
              onChange={setGender}
              options={[
                { value: '', label: 'Prefer not to say' },
                { value: 'male', label: 'Male' },
                { value: 'female', label: 'Female' },
                { value: 'other', label: 'Other' },
              ]}
            />
            <Input label="Phone" value={phone} onChange={setPhone} placeholder="+1 555-010-1234" />
            <Input label="Address" value={address} onChange={setAddress} placeholder="123 Main St, City, State" />
          </div>
          {age !== null && (
            <div className="mt-4 text-sm text-ink-dim">
              Age: <strong className="text-ink-dim">{age} years</strong>
            </div>
          )}
        </CardBody>
      </Card>

      <Card>
        <CardHeader
          title="Clinical vitals for AI assessment"
          subtitle="Risk & plan agents use these values. Save before running AI Assessment."
          icon={<Activity size={20} />}
        />
        <CardBody>
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
            <Input label="Systolic BP (mmHg)" value={systolicBp} onChange={setSystolicBp} />
            <Input label="Diastolic BP (mmHg)" value={diastolicBp} onChange={setDiastolicBp} />
            <Input label="BMI" value={bmi} onChange={setBmi} />
            <Input label="Total cholesterol (mg/dL)" value={totalChol} onChange={setTotalChol} />
            <Input label="HDL (mg/dL)" value={hdl} onChange={setHdl} />
            <Input label="LDL (mg/dL)" value={ldl} onChange={setLdl} />
            <Input label="Fasting glucose (mg/dL)" value={glucose} onChange={setGlucose} />
            <Input label="Activity min / week" value={activity} onChange={setActivity} />
            <Input label="Alcohol drinks / week" value={alcohol} onChange={setAlcohol} />
            <Select
              label="Diet quality"
              value={dietQuality}
              onChange={setDietQuality}
              options={[
                { value: 'poor', label: 'Poor' },
                { value: 'fair', label: 'Fair' },
                { value: 'good', label: 'Good' },
                { value: 'excellent', label: 'Excellent' },
              ]}
            />
          </div>
          <div className="mt-4 flex flex-wrap gap-4 text-sm">
            <label className="flex items-center gap-2">
              <input type="checkbox" checked={smoker} onChange={(e) => setSmoker(e.target.checked)} />
              Current smoker
            </label>
            <label className="flex items-center gap-2">
              <input type="checkbox" checked={diabetes} onChange={(e) => setDiabetes(e.target.checked)} />
              Diagnosed diabetes
            </label>
            <label className="flex items-center gap-2">
              <input type="checkbox" checked={fhCvd} onChange={(e) => setFhCvd(e.target.checked)} />
              Family history CVD
            </label>
            <label className="flex items-center gap-2">
              <input type="checkbox" checked={fhCancer} onChange={(e) => setFhCancer(e.target.checked)} />
              Family history cancer
            </label>
          </div>
          <div className="grid sm:grid-cols-2 gap-4 mt-4">
            <Input
              label="Current medications (comma-separated)"
              value={meds}
              onChange={setMeds}
              placeholder="lisinopril, metformin"
            />
            <Input
              label="Allergies (comma-separated)"
              value={allergies}
              onChange={setAllergies}
              placeholder="penicillin"
            />
          </div>
        </CardBody>
      </Card>

      <Card>
        <CardHeader
          title="Health Preferences"
          subtitle="Personalization agent uses these to tailor your plan"
          icon={<Heart size={20} />}
        />
        <CardBody>
          <div className="space-y-4">
            <Select
              label="Preferred Exercise Type"
              value={prefExercise}
              onChange={setPrefExercise}
              options={[
                { value: '', label: 'No preference' },
                { value: 'walking', label: 'Walking' },
                { value: 'running', label: 'Running' },
                { value: 'swimming', label: 'Swimming' },
                { value: 'cycling', label: 'Cycling' },
                { value: 'yoga', label: 'Yoga' },
                { value: 'strength', label: 'Strength Training' },
              ]}
            />
            <div>
              <label className="block text-sm font-medium text-ink-dim mb-2">Constraints</label>
              <div className="flex flex-wrap gap-2">
                {CONSTRAINT_OPTIONS.map((c) => (
                  <button
                    key={c}
                    type="button"
                    onClick={() => toggleConstraint(c)}
                    className={`px-3 py-1.5 rounded-full text-sm border ${
                      constraints.includes(c)
                        ? 'bg-accent text-ink border-accent'
                        : 'bg-surface text-ink-dim border-hairline'
                    }`}
                  >
                    {humanize(c)}
                  </button>
                ))}
              </div>
            </div>
          </div>
        </CardBody>
      </Card>

      <Card>
        <CardHeader title="Genetic markers (optional)" subtitle="Informational flags for clinicians" icon={<Dna size={20} />} />
        <CardBody>
          <div className="flex flex-wrap gap-4 text-sm">
            <label className="flex items-center gap-2">
              <input type="checkbox" checked={geneticApoE} onChange={(e) => setGeneticApoE(e.target.checked)} />
              APOE ε4
            </label>
            <label className="flex items-center gap-2">
              <input type="checkbox" checked={geneticBrca} onChange={(e) => setGeneticBrca(e.target.checked)} />
              BRCA positive
            </label>
            <label className="flex items-center gap-2">
              <input type="checkbox" checked={geneticMthfr} onChange={(e) => setGeneticMthfr(e.target.checked)} />
              MTHFR variant
            </label>
          </div>
        </CardBody>
      </Card>

      {saveError && (
        <div className="rounded border border-risk-very-high/40 bg-risk-very-high/5 p-4">
          <p className="font-semibold text-risk-very-high">Could not save your profile</p>
          <p className="mt-1 text-small text-ink-dim">{saveError}</p>
        </div>
      )}

      <div className="flex justify-end">
        <Button onClick={save} disabled={saving}>
          {saving ? 'Saving…' : saved ? (
            <Badge className="bg-risk-low/10 text-risk-low border-risk-low/30">Saved</Badge>
          ) : (
            <>
              <Save size={16} /> Save profile
            </>
          )}
        </Button>
      </div>
    </div>
  );
}
