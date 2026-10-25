import { useState, useEffect } from 'react';
import { Bell, Lock, Download, Trash2, Settings as SettingsIcon, Shield } from 'lucide-react';
import { useAuth } from '@/context/AuthContext';
import { apiClient } from '@/lib/aws-api-client';
import { Card, CardHeader, CardBody, Button, Toggle, Spinner } from '@/components/ui';

export function PatientSettings() {
  const { profile, signOut } = useAuth();
  const [saving, setSaving] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [notifPrefs, setNotifPrefs] = useState({
    risk_alerts: true,
    plan_updates: true,
    adherence_reminders: true,
    agent_activity: false,
  });
  const [privacyControls, setPrivacyControls] = useState({
    share_anonymized: true,
    clinician_access: true,
  });

  useEffect(() => {
    if (profile) {
      const prefs = (profile.health_preferences as Record<string, unknown>)?.notifications as Record<string, boolean> | undefined;
      if (prefs) setNotifPrefs({ ...notifPrefs, ...prefs });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [profile]);

  async function saveSettings() {
    if (!profile) return;
    setSaving(true);
    try {
      await apiClient.updatePatientProfile({
        health_preferences: {
          ...(profile.health_preferences as Record<string, unknown>),
          notifications: notifPrefs,
          privacy: privacyControls,
        },
      });
    } catch (error) {
      console.error('Failed to save settings', error);
    } finally {
      setSaving(false);
    }
  }

  async function exportData() {
    if (!profile) return;
    setExporting(true);
    try {
      const [risk, plans, readings, logs] = await Promise.all([
        apiClient.getRiskTrajectory().catch(() => []),
        apiClient.getPreventionPlans().catch(() => []),
        apiClient.getWearableReadings().catch(() => []),
        apiClient.getAdherence().catch(() => []),
      ]);

      const exportObj = {
        profile: { email: profile.email, first_name: profile.first_name, last_name: profile.last_name, role: profile.role },
        risk_scores: risk,
        prevention_plans: plans,
        wearable_readings: readings,
        adherence_logs: logs,
        feedback: [],
        exported_at: new Date().toISOString(),
      };

      const blob = new Blob([JSON.stringify(exportObj, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `preventai-data-export-${Date.now()}.json`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (error) {
      console.error('Failed to export data', error);
    } finally {
      setExporting(false);
    }
  }

  if (!profile) return <div className="flex justify-center py-20"><Spinner className="h-8 w-8" /></div>;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-ink">Settings</h1>
        <p className="text-ink-dim mt-1">Manage notifications, privacy, and your account</p>
      </div>

      <Card>
        <CardHeader title="Notification Preferences" subtitle="Choose what alerts you receive" icon={<Bell size={20} />} />
        <CardBody>
          <div className="space-y-4">
            <SettingToggle label="Risk Alerts" desc="Get notified when your risk score changes significantly" checked={notifPrefs.risk_alerts} onChange={(v) => setNotifPrefs({ ...notifPrefs, risk_alerts: v })} />
            <SettingToggle label="Plan Updates" desc="Notifications when plans are created or updated" checked={notifPrefs.plan_updates} onChange={(v) => setNotifPrefs({ ...notifPrefs, plan_updates: v })} />
            <SettingToggle label="Adherence Reminders" desc="Daily reminders to complete plan actions" checked={notifPrefs.adherence_reminders} onChange={(v) => setNotifPrefs({ ...notifPrefs, adherence_reminders: v })} />
            <SettingToggle label="Agent Activity" desc="Real-time notifications when AI agents run" checked={notifPrefs.agent_activity} onChange={(v) => setNotifPrefs({ ...notifPrefs, agent_activity: v })} />
          </div>
        </CardBody>
      </Card>

      <Card>
        <CardHeader title="Privacy Controls" subtitle="Manage how your data is used" icon={<Shield size={20} />} />
        <CardBody>
          <div className="space-y-4">
            <SettingToggle label="Share Anonymized Data" desc="Allow anonymized data to improve AI models" checked={privacyControls.share_anonymized} onChange={(v) => setPrivacyControls({ ...privacyControls, share_anonymized: v })} />
            <SettingToggle label="Clinician Access" desc="Allow your linked clinician to view your health data" checked={privacyControls.clinician_access} onChange={(v) => setPrivacyControls({ ...privacyControls, clinician_access: v })} />
          </div>
        </CardBody>
      </Card>

      <Card>
        <CardHeader title="Data Export" subtitle="Download all your health data" icon={<Download size={20} />} />
        <CardBody>
          <p className="text-sm text-ink-dim mb-4">Export your complete health data including risk scores, plans, wearable readings, adherence logs, and feedback in JSON format.</p>
          <Button variant="outline" onClick={exportData} disabled={exporting}>
            {exporting ? <Spinner className="h-4 w-4" /> : <><Download size={16} /> Export My Data</>}
          </Button>
        </CardBody>
      </Card>

      <Card>
        <CardHeader title="Account Management" subtitle="Account actions" icon={<SettingsIcon size={20} />} />
        <CardBody>
          <div className="space-y-3">
            <div className="flex items-center justify-between p-4 rounded bg-surface-2">
              <div>
                <div className="font-medium text-ink">Sign Out</div>
                <div className="text-sm text-ink-dim">Sign out of your account on this device</div>
              </div>
              <Button variant="ghost" onClick={() => signOut()}>Sign Out</Button>
            </div>
            <div className="flex items-center justify-between p-4 rounded bg-risk-very-high/10 border border-red-100">
              <div>
                <div className="font-medium text-red-900">Delete Account</div>
                <div className="text-sm text-risk-very-high">Permanently delete your account and all associated data</div>
              </div>
              <Button variant="danger" size="sm" onClick={() => alert('Account deletion requires verification. Please contact support.')}>
                <Trash2 size={16} /> Delete
              </Button>
            </div>
          </div>
        </CardBody>
      </Card>

      <div className="flex justify-end">
        <Button onClick={saveSettings} disabled={saving}>
          {saving ? <Spinner className="h-4 w-4" /> : 'Save Settings'}
        </Button>
      </div>
    </div>
  );
}

function SettingToggle({ label, desc, checked, onChange }: { label: string; desc: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <div className="flex items-center justify-between">
      <div>
        <div className="text-sm font-medium text-ink">{label}</div>
        <div className="text-xs text-ink-dim">{desc}</div>
      </div>
      <Toggle checked={checked} onChange={onChange} />
    </div>
  );
}
