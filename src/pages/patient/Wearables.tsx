import { useEffect, useState, useCallback } from 'react';
import { Watch, Heart, Footprints, Moon, Plus, Activity, RefreshCw, Smartphone, CircleDot } from 'lucide-react';
import { useAuth } from '@/context/AuthContext';
import { apiClient } from '@/lib/aws-api-client';
import { Card, CardHeader, CardBody, Badge, EmptyState, Spinner, Button, Input, Select, Modal, StatCard } from '@/components/ui';
import { LineChart, BarChart } from '@/components/charts';
import { formatDate, humanize, timeAgo } from '@/lib/utils';
import type { WearableDevice, WearableReading } from '@/lib/types';

export function PatientWearables() {
  const { profile } = useAuth();
  const [loading, setLoading] = useState(true);
  const [devices, setDevices] = useState<WearableDevice[]>([]);
  const [readings, setReadings] = useState<WearableReading[]>([]);
  const [showAddDevice, setShowAddDevice] = useState(false);
  const [showAddReading, setShowAddReading] = useState(false);
  const [newDeviceType, setNewDeviceType] = useState('smartwatch');
  const [newDeviceName, setNewDeviceName] = useState('');
  const [newDeviceMfr, setNewDeviceMfr] = useState('');
  const [readingType, setReadingType] = useState('heart_rate');
  const [readingValue, setReadingValue] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const load = useCallback(async () => {
    if (!profile) return;
    try {
      const [devices, readings] = await Promise.all([
        apiClient.getWearableDevices().catch(() => []),
        apiClient.getWearableReadings().catch(() => []),
      ]);
      setDevices((devices as WearableDevice[]) || []);
      setReadings((readings as WearableReading[]) || []);
    } catch (error) {
      console.error('Failed to load wearables', error);
    } finally {
      setLoading(false);
    }
  }, [profile]);

  useEffect(() => { load(); }, [load]);

  async function addDevice() {
    if (!profile || !newDeviceName) return;
    setSubmitting(true);
    try {
      await apiClient.recordWearableDevice({
        type: newDeviceType,
        name: newDeviceName,
        manufacturer: newDeviceMfr,
      });
      setShowAddDevice(false);
      setNewDeviceName('');
      setNewDeviceMfr('');
      await load();
    } catch (error) {
      console.error('Failed to add device', error);
    } finally {
      setSubmitting(false);
    }
  }

  async function addReading() {
    if (!profile || !readingValue) return;
    setSubmitting(true);
    try {
      await apiClient.recordWearableReading(
        readingType,
        parseFloat(readingValue)
      );
      setShowAddReading(false);
      setReadingValue('');
      await load();
    } catch (error) {
      console.error('Failed to add reading', error);
    } finally {
      setSubmitting(false);
    }
  }

  async function syncDevice(dev: WearableDevice) {
    try {
      // Call API to sync device - generates synthetic readings
      await apiClient.syncWearableDevice(dev.id);
      await load();
    } catch (error) {
      console.error('Failed to sync device', error);
    }
  }

  if (loading) return <div className="flex justify-center py-20"><Spinner className="h-8 w-8" /></div>;

  const heartRateData = readings.filter((r) => r.reading_type === 'heart_rate').slice(0, 12).reverse().map((r) => ({ label: formatDate(r.recorded_at).split(' ').slice(0, 2).join(' '), value: r.value }));
  const stepsData = readings.filter((r) => r.reading_type === 'steps').slice(0, 7).reverse().map((r) => ({ label: formatDate(r.recorded_at).split(' ').slice(0, 2).join(' '), value: r.value }));
  const sleepData = readings.filter((r) => r.reading_type === 'sleep').slice(0, 7).reverse().map((r) => ({ label: formatDate(r.recorded_at).split(' ').slice(0, 2).join(' '), value: r.value }));

  const latestHR = readings.find((r) => r.reading_type === 'heart_rate');
  const latestSteps = readings.find((r) => r.reading_type === 'steps');
  const latestSleep = readings.find((r) => r.reading_type === 'sleep');

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-ink">Wearables & Data</h1>
          <p className="text-ink-dim mt-1">Connected devices and health readings</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => setShowAddReading(true)}><Plus size={16} /> Manual Entry</Button>
          <Button onClick={() => setShowAddDevice(true)}><Plus size={16} /> Connect Device</Button>
        </div>
      </div>

      {/* Latest readings */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <StatCard label="Heart Rate" value={latestHR ? `${latestHR.value}` : '—'} sublabel={latestHR ? `${latestHR.unit} · ${timeAgo(latestHR.recorded_at)}` : 'No data'} icon={<Heart size={20} />} color="red" />
        <StatCard label="Daily Steps" value={latestSteps ? latestSteps.value.toLocaleString() : '—'} sublabel={latestSteps ? `${latestSteps.unit} · ${timeAgo(latestSteps.recorded_at)}` : 'No data'} icon={<Footprints size={20} />} color="emerald" />
        <StatCard label="Sleep" value={latestSleep ? `${latestSleep.value}h` : '—'} sublabel={latestSleep ? timeAgo(latestSleep.recorded_at) : 'No data'} icon={<Moon size={20} />} color="blue" />
      </div>

      {/* Charts */}
      <div className="grid lg:grid-cols-2 gap-6">
        <Card>
          <CardHeader title="Heart Rate Trend" subtitle="Beats per minute over time" icon={<Heart size={20} />} />
          <CardBody>
            {heartRateData.length > 0 ? (
              <LineChart data={heartRateData} height={200} color="#ef4444" />
            ) : (
              <EmptyState icon={<Heart size={28} />} title="No heart rate data" message="Connect a device or add a manual reading" />
            )}
          </CardBody>
        </Card>
        <Card>
          <CardHeader title="Daily Steps" subtitle="Step count per day" icon={<Footprints size={20} />} />
          <CardBody>
            {stepsData.length > 0 ? (
              <BarChart data={stepsData.map((d) => ({ ...d, color: '#10b981' }))} height={200} />
            ) : (
              <EmptyState icon={<Footprints size={28} />} title="No step data" message="Connect a device or add a manual reading" />
            )}
          </CardBody>
        </Card>
      </div>

      {/* Sleep */}
      <Card>
        <CardHeader title="Sleep Duration" subtitle="Hours of sleep per night" icon={<Moon size={20} />} />
        <CardBody>
          {sleepData.length > 0 ? (
            <BarChart data={sleepData.map((d) => ({ ...d, color: '#3b82f6' }))} height={180} />
          ) : (
            <EmptyState icon={<Moon size={28} />} title="No sleep data" message="Connect a device or add a manual reading" />
          )}
        </CardBody>
      </Card>

      {/* Devices */}
      <Card>
        <CardHeader title="Connected Devices" subtitle={`${devices.length} device${devices.length !== 1 ? 's' : ''}`} icon={<Watch size={20} />} />
        <CardBody>
          {devices.length > 0 ? (
            <div className="space-y-3">
              {devices.map((dev) => (
                <div key={dev.id} className="flex items-center gap-4 p-4 rounded border border-hairline hover:border-hairline transition-colors">
                  <div className="p-3 rounded bg-surface-2 text-ink-dim">
                    {dev.device_type === 'smartwatch' ? <Watch size={22} /> : dev.device_type === 'phone' ? <Smartphone size={22} /> : <CircleDot size={22} />}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="font-medium text-ink">{dev.device_name}</div>
                    <div className="text-sm text-ink-dim capitalize">{dev.manufacturer} · {dev.device_type}</div>
                  </div>
                  <div className="flex items-center gap-3">
                    <Badge className={dev.status === 'connected' ? 'bg-risk-low/10 text-risk-low border-risk-low/30' : 'bg-surface-2 text-ink-dim border-hairline'}>
                      <span className={`h-1.5 w-1.5 rounded-full ${dev.status === 'connected' ? 'bg-risk-low/100' : 'bg-ink-faint'}`} />
                      {dev.status}
                    </Badge>
                    <span className="text-xs text-ink-faint hidden sm:block">{dev.last_synced_at ? timeAgo(dev.last_synced_at) : 'Never'}</span>
                    <Button variant="ghost" size="sm" onClick={() => syncDevice(dev)}>
                      <RefreshCw size={14} /> Sync
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <EmptyState
              icon={<Watch size={32} />}
              title="No devices connected"
              message="Connect a wearable device to automatically sync your health data."
              action={<Button onClick={() => setShowAddDevice(true)}><Plus size={16} /> Connect Device</Button>}
            />
          )}
        </CardBody>
      </Card>

      {/* Recent readings table */}
      <Card>
        <CardHeader title="Recent Readings" subtitle="Latest data points" icon={<Activity size={20} />} />
        <CardBody>
          {readings.length > 0 ? (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-hairline">
                    <th className="text-left py-2 px-2 font-medium text-ink-dim">Type</th>
                    <th className="text-right py-2 px-2 font-medium text-ink-dim">Value</th>
                    <th className="text-right py-2 px-2 font-medium text-ink-dim">Date</th>
                  </tr>
                </thead>
                <tbody>
                  {readings.slice(0, 15).map((r) => (
                    <tr key={r.id} className="border-b border-surface-2">
                      <td className="py-2 px-2 text-ink-dim capitalize">{humanize(r.reading_type)}</td>
                      <td className="py-2 px-2 text-right font-medium text-ink">{r.value} {r.unit}</td>
                      <td className="py-2 px-2 text-right text-ink-dim">{formatDate(r.recorded_at)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <EmptyState icon={<Activity size={28} />} title="No readings yet" message="Connect a device or add manual readings" />
          )}
        </CardBody>
      </Card>

      {/* Add device modal */}
      <Modal open={showAddDevice} onClose={() => setShowAddDevice(false)} title="Connect Device">
        <div className="space-y-4">
          <Select label="Device Type" value={newDeviceType} onChange={setNewDeviceType} options={[
            { value: 'smartwatch', label: 'Smartwatch' },
            { value: 'fitness_tracker', label: 'Fitness Tracker' },
            { value: 'phone', label: 'Phone Sensors' },
            { value: 'blood_pressure_monitor', label: 'Blood Pressure Monitor' },
            { value: 'glucose_monitor', label: 'Glucose Monitor' },
          ]} />
          <Input label="Device Name" value={newDeviceName} onChange={setNewDeviceName} placeholder="e.g. Apple Watch Series 9" />
          <Input label="Manufacturer" value={newDeviceMfr} onChange={setNewDeviceMfr} placeholder="e.g. Apple" />
          <div className="flex gap-3 justify-end">
            <Button variant="ghost" onClick={() => setShowAddDevice(false)}>Cancel</Button>
            <Button onClick={addDevice} disabled={submitting || !newDeviceName}>
              {submitting ? <Spinner className="h-4 w-4" /> : 'Connect'}
            </Button>
          </div>
        </div>
      </Modal>

      {/* Add reading modal */}
      <Modal open={showAddReading} onClose={() => setShowAddReading(false)} title="Manual Data Entry">
        <div className="space-y-4">
          <Select label="Reading Type" value={readingType} onChange={setReadingType} options={[
            { value: 'heart_rate', label: 'Heart Rate (bpm)' },
            { value: 'steps', label: 'Steps' },
            { value: 'sleep', label: 'Sleep (hours)' },
            { value: 'blood_pressure', label: 'Blood Pressure (mmHg)' },
            { value: 'weight', label: 'Weight (kg)' },
            { value: 'glucose', label: 'Glucose (mg/dL)' },
          ]} />
          <Input label="Value" type="number" value={readingValue} onChange={setReadingValue} placeholder="Enter value" />
          <div className="flex gap-3 justify-end">
            <Button variant="ghost" onClick={() => setShowAddReading(false)}>Cancel</Button>
            <Button onClick={addReading} disabled={submitting || !readingValue}>
              {submitting ? <Spinner className="h-4 w-4" /> : 'Add Reading'}
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
