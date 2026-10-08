'use client';

import { useState } from 'react';
import { 
  X, Plus, Sparkles, Cpu, AlertTriangle, Check, Layers, 
  Terminal, Gauge, Activity, Radio, ArrowRight
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { api } from '@/lib/api';

export interface CustomSensorData {
  id?: string;
  name: string;
  metric: string;
  unit: string;
  category: string;
  interface_type: string;
  pin_esp32: string;
  pin_pi: string;
  pin_arduino: string;
  default_value: number;
  normal_min: number;
  normal_max: number;
  warning_threshold: number;
  critical_threshold: number;
  calibration_formula?: string;
  description?: string;
  code_snippet_c?: string;
  code_snippet_py?: string;
}

interface CustomSensorModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSensorCreated: (sensor: CustomSensorData) => void;
}

const CATEGORIES = [
  { id: 'vibration', label: 'Vibration & Motion' },
  { id: 'temperature', label: 'Thermal & IR' },
  { id: 'electrical', label: 'Current & Voltage' },
  { id: 'pressure', label: 'Fluid & Pneumatic' },
  { id: 'speed', label: 'Tachometer & RPM' },
  { id: 'acoustic', label: 'Ultrasonic & Acoustic' },
  { id: 'environmental', label: 'Environmental & Gas' },
  { id: 'general', label: 'General Analog/Digital' },
];

const INTERFACES = [
  { id: 'analog', label: 'Analog ADC (0-3.3V / 0-5V)' },
  { id: 'digital', label: 'Digital GPIO / Interrupt' },
  { id: 'i2c', label: 'I2C Bus (SDA / SCL)' },
  { id: 'spi', label: 'SPI Bus (MOSI / MISO / SCK)' },
  { id: '4_20ma', label: 'Industrial 4-20mA Current Loop' },
];

export function CustomSensorModal({ isOpen, onClose, onSensorCreated }: CustomSensorModalProps) {
  const [formData, setFormData] = useState<CustomSensorData>({
    name: 'Laser Displacement Runout Sensor',
    metric: 'shaft_runout_um',
    unit: 'µm',
    category: 'vibration',
    interface_type: 'analog',
    pin_esp32: 'GPIO 32 (ADC1)',
    pin_pi: 'MCP3008 ADC CH3',
    pin_arduino: 'Analog A2',
    default_value: 12.4,
    normal_min: 0.0,
    normal_max: 25.0,
    warning_threshold: 35.0,
    critical_threshold: 50.0,
    calibration_formula: '(adc / 4095.0 * 3.3) * 20.0',
    description: 'Measures radial and axial shaft vibration runout with optical triangulation.'
  });

  const [isSaving, setIsSaving] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  if (!isOpen) return null;

  const handleInterfaceChange = (iface: string) => {
    let pinEsp = 'GPIO 32';
    let pinPi = 'MCP3008 ADC CH3';
    let pinArd = 'Analog A2';

    if (iface === 'i2c') {
      pinEsp = 'I2C (SDA 21, SCL 22)';
      pinPi = 'I2C (SDA 3, SCL 5)';
      pinArd = 'I2C (A4 SDA, A5 SCL)';
    } else if (iface === 'digital') {
      pinEsp = 'GPIO 26 (Interrupt)';
      pinPi = 'GPIO 18 (Pin 12)';
      pinArd = 'Digital Pin 3 (INT1)';
    } else if (iface === '4_20ma') {
      pinEsp = 'GPIO 33 (via 150Ω shunt)';
      pinPi = 'ADC CH4 (via shunt)';
      pinArd = 'Analog A3 (via 250Ω shunt)';
    }

    setFormData(prev => ({
      ...prev,
      interface_type: iface,
      pin_esp32: pinEsp,
      pin_pi: pinPi,
      pin_arduino: pinArd,
    }));
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.name.trim() || !formData.metric.trim() || !formData.unit.trim()) {
      setErrorMsg('Please fill in Sensor Name, Metric Key, and Unit.');
      return;
    }

    setIsSaving(true);
    setErrorMsg(null);

    const sensorId = 'sensor_' + formData.metric.toLowerCase().replace(/[^a-z0-9]/g, '_');
    const fullSensor: CustomSensorData = {
      ...formData,
      id: sensorId,
      code_snippet_c: `float ${formData.metric} = ${formData.calibration_formula || 'analogRead(pin)'};`,
      code_snippet_py: `${formData.metric} = round(${formData.calibration_formula || 'read_adc()'}, 2)`
    };

    try {
      await api.saveCustomSensor(fullSensor).catch(() => null);
      onSensorCreated(fullSensor);
      onClose();
    } catch (err: any) {
      setErrorMsg(err.message || 'Failed to save sensor');
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md animate-in fade-in duration-200">
      <div className="relative w-full max-w-2xl max-h-[90vh] overflow-y-auto rounded-3xl border border-white/10 bg-[#161B22] p-6 shadow-2xl custom-scrollbar">
        
        {/* Header */}
        <div className="flex items-center justify-between border-b border-white/10 pb-4 mb-6">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl border border-[var(--color-primary)]/30 bg-[var(--color-primary)]/10 text-[var(--color-primary)]">
              <Sparkles className="h-5 w-5" />
            </div>
            <div>
              <h3 className="text-lg font-bold text-white">Create Custom Physical Sensor</h3>
              <p className="text-xs text-[var(--color-muted)]">Register a custom transducer and auto-generate its hardware firmware routines.</p>
            </div>
          </div>
          <button 
            onClick={onClose}
            className="rounded-xl border border-white/10 p-2 text-zinc-400 hover:text-white hover:bg-white/5 transition-all"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {errorMsg && (
          <div className="mb-4 flex items-center gap-2 rounded-xl border border-red-500/30 bg-red-500/10 p-3 text-xs text-red-300">
            <AlertTriangle className="h-4 w-4 shrink-0" />
            <span>{errorMsg}</span>
          </div>
        )}

        <form onSubmit={handleSave} className="space-y-5">
          {/* Row 1: Name & Metric */}
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <label className="text-xs font-mono uppercase tracking-wider text-[var(--color-muted)] block mb-1">
                Sensor Commercial Name:
              </label>
              <input
                type="text"
                value={formData.name}
                onChange={e => setFormData({ ...formData, name: e.target.value })}
                placeholder="e.g. Laser Runout Triangulation"
                className="w-full rounded-xl border border-white/10 bg-[#0D1117] p-3 text-xs font-bold text-white focus:border-[var(--color-primary)] focus:outline-none"
                required
              />
            </div>

            <div>
              <label className="text-xs font-mono uppercase tracking-wider text-[var(--color-muted)] block mb-1">
                Telemetry Metric Key (JSON Key):
              </label>
              <input
                type="text"
                value={formData.metric}
                onChange={e => setFormData({ ...formData, metric: e.target.value.toLowerCase().replace(/\s+/g, '_') })}
                placeholder="e.g. shaft_runout_um"
                className="w-full rounded-xl border border-white/10 bg-[#0D1117] p-3 font-mono text-xs text-emerald-400 focus:border-[var(--color-primary)] focus:outline-none"
                required
              />
            </div>
          </div>

          {/* Row 2: Category & Interface */}
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <label className="text-xs font-mono uppercase tracking-wider text-[var(--color-muted)] block mb-1">
                Measurement Category:
              </label>
              <select
                value={formData.category}
                onChange={e => setFormData({ ...formData, category: e.target.value })}
                className="w-full rounded-xl border border-white/10 bg-[#0D1117] p-3 text-xs text-white focus:border-[var(--color-primary)] focus:outline-none"
              >
                {CATEGORIES.map(c => (
                  <option key={c.id} value={c.id}>{c.label}</option>
                ))}
              </select>
            </div>

            <div>
              <label className="text-xs font-mono uppercase tracking-wider text-[var(--color-muted)] block mb-1">
                Electrical Interface:
              </label>
              <select
                value={formData.interface_type}
                onChange={e => handleInterfaceChange(e.target.value)}
                className="w-full rounded-xl border border-white/10 bg-[#0D1117] p-3 text-xs text-white focus:border-[var(--color-primary)] focus:outline-none"
              >
                {INTERFACES.map(i => (
                  <option key={i.id} value={i.id}>{i.label}</option>
                ))}
              </select>
            </div>
          </div>

          {/* Row 3: Unit & Calibration Formula */}
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <label className="text-xs font-mono uppercase tracking-wider text-[var(--color-muted)] block mb-1">
                Engineering Unit:
              </label>
              <input
                type="text"
                value={formData.unit}
                onChange={e => setFormData({ ...formData, unit: e.target.value })}
                placeholder="e.g. µm, bar, mm/s, °C, mA"
                className="w-full rounded-xl border border-white/10 bg-[#0D1117] p-3 text-xs text-white focus:border-[var(--color-primary)] focus:outline-none"
                required
              />
            </div>

            <div>
              <label className="text-xs font-mono uppercase tracking-wider text-[var(--color-muted)] block mb-1">
                ADC Conversion Formula:
              </label>
              <input
                type="text"
                value={formData.calibration_formula}
                onChange={e => setFormData({ ...formData, calibration_formula: e.target.value })}
                placeholder="e.g. (adc / 4095.0 * 3.3) * 20.0"
                className="w-full rounded-xl border border-white/10 bg-[#0D1117] p-3 font-mono text-xs text-amber-300 focus:border-[var(--color-primary)] focus:outline-none"
              />
            </div>
          </div>

          {/* Row 4: Pinout Mappings */}
          <div className="rounded-2xl border border-white/10 bg-white/2 p-4">
            <h4 className="text-xs font-mono uppercase tracking-wider font-bold text-white mb-3 flex items-center gap-2">
              <Cpu className="h-4 w-4 text-[var(--color-primary)]" />
              Hardware Pin Assignments:
            </h4>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
              <div>
                <label className="text-[10px] font-mono text-[var(--color-muted)] block mb-1">ESP32 Pin:</label>
                <input
                  type="text"
                  value={formData.pin_esp32}
                  onChange={e => setFormData({ ...formData, pin_esp32: e.target.value })}
                  className="w-full rounded-lg border border-white/10 bg-[#0D1117] p-2 text-xs font-mono text-white"
                />
              </div>
              <div>
                <label className="text-[10px] font-mono text-[var(--color-muted)] block mb-1">Raspberry Pi GPIO:</label>
                <input
                  type="text"
                  value={formData.pin_pi}
                  onChange={e => setFormData({ ...formData, pin_pi: e.target.value })}
                  className="w-full rounded-lg border border-white/10 bg-[#0D1117] p-2 text-xs font-mono text-white"
                />
              </div>
              <div>
                <label className="text-[10px] font-mono text-[var(--color-muted)] block mb-1">Arduino Pin:</label>
                <input
                  type="text"
                  value={formData.pin_arduino}
                  onChange={e => setFormData({ ...formData, pin_arduino: e.target.value })}
                  className="w-full rounded-lg border border-white/10 bg-[#0D1117] p-2 text-xs font-mono text-white"
                />
              </div>
            </div>
          </div>

          {/* Row 5: Operational Thresholds */}
          <div className="rounded-2xl border border-white/10 bg-white/2 p-4">
            <h4 className="text-xs font-mono uppercase tracking-wider font-bold text-white mb-3 flex items-center gap-2">
              <Gauge className="h-4 w-4 text-cyan-400" />
              Operational Limits & Alarm Limits:
            </h4>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              <div>
                <label className="text-[10px] font-mono text-[var(--color-muted)] block mb-1">Normal Min:</label>
                <input
                  type="number"
                  step="any"
                  value={formData.normal_min}
                  onChange={e => setFormData({ ...formData, normal_min: parseFloat(e.target.value) || 0 })}
                  className="w-full rounded-lg border border-white/10 bg-[#0D1117] p-2 text-xs font-mono text-white"
                />
              </div>
              <div>
                <label className="text-[10px] font-mono text-[var(--color-muted)] block mb-1">Normal Max:</label>
                <input
                  type="number"
                  step="any"
                  value={formData.normal_max}
                  onChange={e => setFormData({ ...formData, normal_max: parseFloat(e.target.value) || 0 })}
                  className="w-full rounded-lg border border-white/10 bg-[#0D1117] p-2 text-xs font-mono text-white"
                />
              </div>
              <div>
                <label className="text-[10px] font-mono text-amber-400 block mb-1">Warning Threshold:</label>
                <input
                  type="number"
                  step="any"
                  value={formData.warning_threshold}
                  onChange={e => setFormData({ ...formData, warning_threshold: parseFloat(e.target.value) || 0 })}
                  className="w-full rounded-lg border border-amber-500/30 bg-[#0D1117] p-2 text-xs font-mono text-amber-400"
                />
              </div>
              <div>
                <label className="text-[10px] font-mono text-red-400 block mb-1">Critical Trip Limit:</label>
                <input
                  type="number"
                  step="any"
                  value={formData.critical_threshold}
                  onChange={e => setFormData({ ...formData, critical_threshold: parseFloat(e.target.value) || 0 })}
                  className="w-full rounded-lg border border-red-500/30 bg-[#0D1117] p-2 text-xs font-mono text-red-400"
                />
              </div>
            </div>
          </div>

          {/* Description */}
          <div>
            <label className="text-xs font-mono uppercase tracking-wider text-[var(--color-muted)] block mb-1">
              Description / Industrial Application:
            </label>
            <textarea
              rows={2}
              value={formData.description}
              onChange={e => setFormData({ ...formData, description: e.target.value })}
              placeholder="e.g. Monitors machine tool head deflection under cutting load."
              className="w-full rounded-xl border border-white/10 bg-[#0D1117] p-3 text-xs text-white focus:border-[var(--color-primary)] focus:outline-none"
            />
          </div>

          {/* Submit Actions */}
          <div className="flex items-center justify-end gap-3 pt-4 border-t border-white/10">
            <button
              type="button"
              onClick={onClose}
              className="rounded-xl border border-white/10 px-4 py-2.5 text-xs text-[var(--color-muted)] hover:text-white"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isSaving}
              className="flex items-center gap-2 rounded-xl bg-[var(--color-primary)] px-6 py-2.5 text-xs font-bold text-[#0D1117] shadow-[0_0_20px_rgba(0,212,170,0.3)] hover:brightness-110 transition-all disabled:opacity-50"
            >
              <Plus className="h-4 w-4" />
              <span>{isSaving ? 'Registering Sensor...' : 'Save & Register Sensor'}</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
