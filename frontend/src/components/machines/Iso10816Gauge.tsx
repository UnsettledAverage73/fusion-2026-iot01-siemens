'use client';

import { useState, useEffect, useMemo } from 'react';
import { ShieldCheck, AlertTriangle, AlertCircle, Info, Activity, Gauge, Cpu } from 'lucide-react';
import { cn } from '@/lib/utils';
import { api } from '@/lib/api';

interface Iso10816GaugeProps {
  currentVibrationRms: number;
  initialMachineClass?: string;
  dspSamples?: number[];
  machineId?: string;
  className?: string;
}

const MACHINE_CLASSES = [
  { id: 'Class I', label: 'Class I: Small (<15 kW)', limits: [0.71, 1.80, 4.50] },
  { id: 'Class II', label: 'Class II: Medium (15-75 kW)', limits: [1.12, 2.80, 7.10] },
  { id: 'Class III', label: 'Class III: Large Rigid (>75 kW)', limits: [1.80, 4.50, 11.20] },
  { id: 'Class IV', label: 'Class IV: Large Flexible (>75 kW)', limits: [2.80, 7.10, 18.00] },
];

export function Iso10816Gauge({
  currentVibrationRms,
  initialMachineClass = 'Class II',
  dspSamples,
  machineId,
  className
}: Iso10816GaugeProps) {
  const [selectedClass, setSelectedClass] = useState(initialMachineClass);
  const [dspMetrics, setDspMetrics] = useState<{
    rms: number;
    peak: number;
    crest_factor: number;
    kurtosis: number;
    bearing_fault_suspected: boolean;
  } | null>(null);

  const currentClassDef = useMemo(() => {
    return MACHINE_CLASSES.find(c => c.id === selectedClass) || MACHINE_CLASSES[1];
  }, [selectedClass]);

  const [limitA, limitB, limitC] = currentClassDef.limits;
  const maxScale = limitC * 1.5;

  // Calculate Zone
  const zoneInfo = useMemo(() => {
    const v = Math.max(0, currentVibrationRms || 0);
    if (v <= limitA) {
      return {
        zone: 'Zone A',
        status: 'Good (New/Commissioned)',
        severity: 'good',
        color: 'text-emerald-400',
        bg: 'bg-emerald-500/10 border-emerald-500/30 text-emerald-400',
        barBg: 'bg-emerald-500',
        action: 'Normal unrestricted operation. Baseline stable.',
        icon: ShieldCheck
      };
    } else if (v <= limitB) {
      return {
        zone: 'Zone B',
        status: 'Acceptable',
        severity: 'acceptable',
        color: 'text-cyan-400',
        bg: 'bg-cyan-500/10 border-cyan-500/30 text-cyan-400',
        barBg: 'bg-cyan-500',
        action: 'Suitable for unrestricted continuous operation.',
        icon: Info
      };
    } else if (v <= limitC) {
      return {
        zone: 'Zone C',
        status: 'Restricted / Warning',
        severity: 'warning',
        color: 'text-amber-400',
        bg: 'bg-amber-500/10 border-amber-500/30 text-amber-400',
        barBg: 'bg-amber-500',
        action: 'Unsatisfactory for long-term continuous use. Schedule maintenance.',
        icon: AlertCircle
      };
    } else {
      return {
        zone: 'Zone D',
        status: 'Critical Danger / Trip',
        severity: 'critical',
        color: 'text-rose-400',
        bg: 'bg-rose-500/15 border-rose-500/40 text-rose-400 animate-pulse',
        barBg: 'bg-rose-500',
        action: 'Severe vibration. Immediate intervention required to prevent catastrophic failure.',
        icon: AlertTriangle
      };
    }
  }, [currentVibrationRms, limitA, limitB, limitC]);

  // Percentage position for marker
  const percentage = Math.min(100, Math.max(0, (currentVibrationRms / maxScale) * 100));

  // Compute or fetch DSP features if samples provided
  useEffect(() => {
    if (dspSamples && dspSamples.length > 5) {
      api.extractDspFeatures(dspSamples)
        .then(res => setDspMetrics(res))
        .catch(() => {});
    }
  }, [dspSamples]);

  const ZoneIcon = zoneInfo.icon;

  return (
    <div className={cn("rounded-2xl border border-white/8 bg-[#161B22]/90 p-5 shadow-2xl backdrop-blur-xl", className)}>
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-white/6 pb-4">
        <div className="flex items-center gap-2.5">
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-[var(--color-primary)]/10 text-[var(--color-primary)] border border-[var(--color-primary)]/20 shadow-[0_0_15px_rgba(0,212,170,0.15)]">
            <Gauge className="h-5 w-5" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h3 className="text-sm font-semibold tracking-wide text-white">ISO 10816-3 Vibration Severity</h3>
              <span className="rounded border border-white/10 bg-white/5 px-1.5 py-0.5 font-mono text-[10px] text-[var(--color-muted)]">
                ISO 20816 Aligned
              </span>
            </div>
            <p className="text-xs text-[var(--color-muted)]">International machinery condition classification</p>
          </div>
        </div>

        {/* Machine Class Selector */}
        <div className="flex items-center gap-2">
          <label className="text-[11px] font-mono text-[var(--color-muted)] uppercase tracking-wider">Class:</label>
          <select
            value={selectedClass}
            onChange={(e) => setSelectedClass(e.target.value)}
            className="rounded-lg border border-white/10 bg-[#0D1117] px-2.5 py-1.5 text-xs font-mono text-white focus:border-[var(--color-primary)] focus:outline-none"
          >
            {MACHINE_CLASSES.map(cls => (
              <option key={cls.id} value={cls.id} className="bg-[#161B22] text-white">
                {cls.label}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* Main Gauge Readout */}
      <div className="mt-5 grid grid-cols-1 gap-6 lg:grid-cols-12 items-center">
        {/* Value and Zone Status */}
        <div className="lg:col-span-4 flex flex-col justify-center">
          <div className="flex items-baseline gap-2">
            <span className="font-mono text-4xl font-bold tracking-tight text-white tabular-nums">
              {(currentVibrationRms || 0).toFixed(2)}
            </span>
            <span className="font-mono text-sm text-[var(--color-muted)]">mm/s RMS</span>
          </div>

          <div className={cn("mt-3 inline-flex items-center gap-2 rounded-xl border px-3 py-1.5 text-xs font-medium", zoneInfo.bg)}>
            <ZoneIcon className="h-4 w-4 shrink-0" />
            <span>{zoneInfo.zone}: {zoneInfo.status}</span>
          </div>

          <p className="mt-2 text-xs leading-relaxed text-[var(--color-muted)]">
            {zoneInfo.action}
          </p>
        </div>

        {/* Segmented Linear Spectrum Bar */}
        <div className="lg:col-span-8 flex flex-col justify-center">
          <div className="relative pt-6 pb-2">
            {/* Pointer Marker */}
            <div 
              className="absolute top-0 flex -translate-x-1/2 flex-col items-center transition-all duration-500 ease-out"
              style={{ left: `${percentage}%` }}
            >
              <span className="rounded-md border border-white/20 bg-white px-1.5 py-0.5 font-mono text-[10px] font-bold text-black shadow-lg">
                {(currentVibrationRms || 0).toFixed(1)}
              </span>
              <div className="h-2 w-0.5 bg-white shadow-[0_0_8px_white]" />
            </div>

            {/* Segmented Track */}
            <div className="relative flex h-4 w-full overflow-hidden rounded-full border border-white/10 bg-black/40 p-0.5 shadow-inner">
              {/* Zone A: Good */}
              <div 
                style={{ width: `${(limitA / maxScale) * 100}%` }}
                className="h-full bg-emerald-500/80 shadow-[inset_0_1px_0_rgba(255,255,255,0.3)] transition-all"
                title={`Zone A: <= ${limitA} mm/s`}
              />
              {/* Zone B: Acceptable */}
              <div 
                style={{ width: `${((limitB - limitA) / maxScale) * 100}%` }}
                className="h-full bg-cyan-500/80 shadow-[inset_0_1px_0_rgba(255,255,255,0.3)] transition-all"
                title={`Zone B: ${limitA} - ${limitB} mm/s`}
              />
              {/* Zone C: Warning */}
              <div 
                style={{ width: `${((limitC - limitB) / maxScale) * 100}%` }}
                className="h-full bg-amber-500/80 shadow-[inset_0_1px_0_rgba(255,255,255,0.3)] transition-all"
                title={`Zone C: ${limitB} - ${limitC} mm/s`}
              />
              {/* Zone D: Danger */}
              <div 
                style={{ width: `${((maxScale - limitC) / maxScale) * 100}%` }}
                className="h-full bg-rose-500/85 shadow-[inset_0_1px_0_rgba(255,255,255,0.3)] transition-all"
                title={`Zone D: > ${limitC} mm/s`}
              />
            </div>
          </div>

          {/* Zone Legend Ticks */}
          <div className="mt-1 flex items-center justify-between font-mono text-[10px] text-[var(--color-muted)]">
            <div className="flex items-center gap-1.5">
              <span className="h-2 w-2 rounded-full bg-emerald-500" />
              <span>Zone A (&le;{limitA})</span>
            </div>
            <div className="flex items-center gap-1.5">
              <span className="h-2 w-2 rounded-full bg-cyan-500" />
              <span>Zone B (&le;{limitB})</span>
            </div>
            <div className="flex items-center gap-1.5">
              <span className="h-2 w-2 rounded-full bg-amber-500" />
              <span>Zone C (&le;{limitC})</span>
            </div>
            <div className="flex items-center gap-1.5">
              <span className="h-2 w-2 rounded-full bg-rose-500" />
              <span>Zone D (&gt;{limitC})</span>
            </div>
          </div>
        </div>
      </div>

      {/* DSP Bearing Diagnostics Banner */}
      {dspMetrics && (
        <div className="mt-4 border-t border-white/6 pt-3">
          <div className="flex flex-wrap items-center justify-between gap-3 text-xs">
            <div className="flex items-center gap-2 text-[var(--color-muted)]">
              <Cpu className="h-4 w-4 text-[var(--color-primary)]" />
              <span>DSP Bearing Features:</span>
            </div>

            <div className="flex items-center gap-4 font-mono text-xs">
              <div>
                <span className="text-[var(--color-muted)]">Crest Factor: </span>
                <span className={cn("font-bold", dspMetrics.crest_factor > 4.5 ? "text-rose-400" : "text-white")}>
                  {dspMetrics.crest_factor.toFixed(2)}
                </span>
              </div>
              <div>
                <span className="text-[var(--color-muted)]">Kurtosis: </span>
                <span className={cn("font-bold", dspMetrics.kurtosis > 3.8 ? "text-rose-400" : "text-white")}>
                  {dspMetrics.kurtosis.toFixed(2)}
                </span>
              </div>
              <div>
                <span className="text-[var(--color-muted)]">Peak: </span>
                <span className="text-white font-bold">{dspMetrics.peak.toFixed(2)}g</span>
              </div>
              {dspMetrics.bearing_fault_suspected && (
                <span className="rounded border border-rose-500/30 bg-rose-500/10 px-2 py-0.5 font-sans font-medium text-rose-400 animate-pulse">
                  Bearing Spall Suspected
                </span>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
