"use client";

import React, { useState, useMemo, useEffect } from "react";
import {
  ResponsiveContainer,
  AreaChart,
  Area,
  LineChart,
  Line,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
  ReferenceLine,
} from "recharts";
import {
  Activity,
  Zap,
  Flame,
  ShieldCheck,
  Sliders,
  RefreshCw,
  TrendingUp,
  Cpu,
  Layers,
  Sparkles,
  CheckCircle2,
  AlertTriangle,
} from "lucide-react";
import { cn } from "@/lib/utils";

interface AdvancedMonitoringProps {
  machineId?: string;
  machineName?: string;
  initialSpeedRpm?: number;
  initialLoadPct?: number;
  initialTemp?: number;
  className?: string;
}

export function AdvancedIndustrialMonitoringMatrix({
  machineId = "ESP32-HARDWARE-01",
  machineName = "Main Feed Induction Motor",
  initialSpeedRpm = 1450,
  initialLoadPct = 68,
  initialTemp = 42.5,
  className,
}: AdvancedMonitoringProps) {
  // Optimistic Simulation State (Sub-millisecond reactivity)
  const [speedRpm, setSpeedRpm] = useState(initialSpeedRpm);
  const [loadPct, setLoadPct] = useState(initialLoadPct);
  const [ambientTemp, setAmbientTemp] = useState(28);
  const [bearingWear, setBearingWear] = useState(18); // 0-100%
  const [activeTab, setActiveTab] = useState<"fft" | "power" | "thermal" | "weibull">("fft");
  const [isLiveStreaming, setIsLiveStreaming] = useState(true);
  const [tick, setTick] = useState(0);
  const [isCommitting, setIsCommitting] = useState(false);
  const [committedFeedback, setCommittedFeedback] = useState<string | null>(null);

  // Background ticker for live optimistic micro-variations
  useEffect(() => {
    if (!isLiveStreaming) return;
    const interval = setInterval(() => {
      setTick((prev) => (prev + 1) % 1000);
    }, 1200);
    return () => clearInterval(interval);
  }, [isLiveStreaming]);

  // 1. FFT Vibration Spectrum Calculation (Derived Optimistically from speed & wear)
  const fftData = useMemo(() => {
    const fundamentalHz = Math.round(speedRpm / 60); // 1X RPM running frequency
    const wearFactor = bearingWear / 100;
    const loadFactor = loadPct / 100;

    const data = [];
    for (let f = 5; f <= 250; f += 5) {
      // Base background white noise
      let amplitude = 0.12 + Math.sin(f * 0.1 + tick) * 0.05;

      // 1X Running Speed Peak
      if (Math.abs(f - fundamentalHz) < 4) {
        amplitude += (1.4 + loadFactor * 0.8) * Math.exp(-Math.pow(f - fundamentalHz, 2) / 6);
      }
      // 2X Harmonic (Shaft Misalignment indicator)
      if (Math.abs(f - fundamentalHz * 2) < 4) {
        amplitude += (0.6 + loadFactor * 0.5 + wearFactor * 0.4) * Math.exp(-Math.pow(f - fundamentalHz * 2, 2) / 6);
      }
      // 3X Harmonic (Looseness / Casing Resonance)
      if (Math.abs(f - fundamentalHz * 3) < 5) {
        amplitude += (0.35 + wearFactor * 0.6) * Math.exp(-Math.pow(f - fundamentalHz * 3, 2) / 8);
      }
      // Ball Pass Frequency Outer Race (BPFO) Bearing Fault Peak (~4.2x running speed)
      const bpfoHz = Math.round(fundamentalHz * 4.2);
      if (Math.abs(f - bpfoHz) < 5) {
        amplitude += (wearFactor * 2.8) * Math.exp(-Math.pow(f - bpfoHz, 2) / 8);
      }

      data.push({
        frequency: `${f} Hz`,
        amplitude: Number(amplitude.toFixed(2)),
        zoneA: 1.12, // ISO 10816 Zone A Boundary
        zoneB: 2.8,  // ISO 10816 Zone B Boundary
        zoneC: 7.1,  // ISO 10816 Zone C Boundary
      });
    }
    return data;
  }, [speedRpm, bearingWear, loadPct, tick]);

  // 2. 3-Phase Electrical AC Power Waveform Data (20ms cycle simulation)
  const powerData = useMemo(() => {
    const loadFactor = loadPct / 100;
    const voltagePeak = 325; // 230V RMS * sqrt(2)
    const currentPeak = (6.2 * loadFactor + (bearingWear > 50 ? 1.5 : 0)) * 1.414;
    const points = [];

    // Simulate 1 full 50Hz cycle over 20 milliseconds in 1ms steps
    for (let t = 0; t <= 20; t += 0.5) {
      const omega = (2 * Math.PI * 50 * t) / 1000;
      // Phase 1 (0 deg), Phase 2 (120 deg), Phase 3 (240 deg)
      const vA = voltagePeak * Math.sin(omega);
      const vB = voltagePeak * Math.sin(omega - (2 * Math.PI) / 3);
      const vC = voltagePeak * Math.sin(omega - (4 * Math.PI) / 3);

      // Current lags by power factor angle (approx 25 deg under load)
      const lag = 0.45;
      const iA = currentPeak * Math.sin(omega - lag);

      points.push({
        time: `${t.toFixed(1)}ms`,
        phaseA_V: Math.round(vA),
        phaseB_V: Math.round(vB),
        phaseC_V: Math.round(vC),
        current_A: Number(iA.toFixed(2)),
      });
    }
    return points;
  }, [loadPct, bearingWear]);

  // 3. Thermal Rise Gradient Trajectory (Thermodynamic model)
  const thermalData = useMemo(() => {
    const baseCoreTemp = ambientTemp + (loadPct * 0.42) + (bearingWear * 0.15);
    const data = [];
    const now = Date.now();

    for (let i = 10; i >= 0; i--) {
      const offsetMinutes = i * 2;
      const progressFactor = 1 - Math.exp(-((10 - i + 2) / 6)); // First-order thermal time constant
      const statorCore = ambientTemp + (baseCoreTemp - ambientTemp) * progressFactor + Math.sin(i + tick) * 0.4;
      const bearingHousing = ambientTemp + (baseCoreTemp - ambientTemp) * 0.82 * progressFactor + (bearingWear * 0.22);
      const terminalBox = ambientTemp + (baseCoreTemp - ambientTemp) * 0.45 * progressFactor;

      data.push({
        time: `-${offsetMinutes}m`,
        statorCore: Number(statorCore.toFixed(1)),
        bearingHousing: Number(bearingHousing.toFixed(1)),
        terminalBox: Number(terminalBox.toFixed(1)),
        ambient: ambientTemp,
        classFMax: 155, // IEC 60034 Class F limit
        alarmThreshold: 75,
      });
    }
    return data;
  }, [ambientTemp, loadPct, bearingWear, tick]);

  // 4. Weibull Reliability Survival Probability (Cumulative Failure RUL Model)
  const weibullData = useMemo(() => {
    // Weibull parameters: Shape beta (beta > 1 = wearout phase), Scale eta (characteristic life)
    const beta = 2.4; // Wearout slope
    const eta = 12000 / (1 + (bearingWear / 100) * 0.8 + (loadPct > 80 ? 0.3 : 0)); // hours
    const currentRunHours = 4820;

    const points = [];
    for (let t = 0; t <= 12000; t += 1000) {
      // Survival function: R(t) = exp(-(t/eta)^beta)
      const survival = Math.exp(-Math.pow(t / eta, beta)) * 100;
      points.push({
        hours: `${t / 1000}k hrs`,
        survivalRate: Number(survival.toFixed(1)),
        currentOperatingPoint: t === 5000 ? Number(survival.toFixed(1)) : null,
      });
    }
    return { points, eta: Math.round(eta) };
  }, [bearingWear, loadPct]);

  // Calculated high-level metrics
  const activePowerKw = useMemo(() => {
    return Number(((230 * (loadPct * 0.082) * 1.732 * 0.88) / 1000).toFixed(2));
  }, [loadPct]);

  const thdPercent = useMemo(() => {
    return Number((2.8 + (bearingWear > 40 ? 1.4 : 0) + (loadPct > 85 ? 1.8 : 0)).toFixed(1));
  }, [bearingWear, loadPct]);

  const maxVibrationRms = useMemo(() => {
    const peak = Math.max(...fftData.map((d) => d.amplitude));
    return Number(peak.toFixed(2));
  }, [fftData]);

  const handleCommitSetpoint = () => {
    setIsCommitting(true);
    setTimeout(() => {
      setIsCommitting(false);
      setCommittedFeedback(`Setpoint Synced to Edge IPC: ${speedRpm} RPM @ ${loadPct}% load`);
      setTimeout(() => setCommittedFeedback(null), 3500);
    }, 700);
  };

  const resetNominal = () => {
    setSpeedRpm(1450);
    setLoadPct(65);
    setAmbientTemp(28);
    setBearingWear(15);
  };

  return (
    <div className={cn("surface-card hairline rounded-2xl p-6 relative overflow-hidden backdrop-blur-xl border border-white/10 bg-[#090d14]/90", className)}>
      {/* Top Header & Mode Toggle */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 pb-6 border-b border-white/10">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <span className="flex h-2.5 w-2.5 rounded-full bg-[var(--color-primary)] shadow-[0_0_10px_rgba(0,212,170,0.8)] animate-pulse" />
            <span className="text-[11px] font-mono uppercase tracking-[0.22em] text-[var(--color-primary)]">
              Multi-Domain High-Frequency Telemetry
            </span>
            <span className="bg-white/10 text-slate-300 text-[10px] px-2 py-0.5 rounded-full font-mono border border-white/10">
              Sub-ms Optimistic Sync
            </span>
          </div>
          <h2 className="text-xl font-bold tracking-tight text-white flex items-center gap-2">
            Industrial Diagnostic Matrix: {machineName}
            <span className="text-xs font-mono text-slate-400 font-normal">({machineId})</span>
          </h2>
        </div>

        {/* Navigation Tabs */}
        <div className="flex items-center gap-1.5 p-1 rounded-xl bg-white/5 border border-white/10 overflow-x-auto">
          <button
            onClick={() => setActiveTab("fft")}
            className={cn(
              "flex items-center gap-2 px-3.5 py-1.5 rounded-lg text-xs font-semibold transition-all whitespace-nowrap",
              activeTab === "fft"
                ? "bg-[var(--color-primary)] text-black shadow-[0_0_15px_rgba(0,212,170,0.4)]"
                : "text-slate-400 hover:text-white hover:bg-white/5"
            )}
          >
            <Activity className="w-3.5 h-3.5" />
            FFT Vibration Spectrum
          </button>
          <button
            onClick={() => setActiveTab("power")}
            className={cn(
              "flex items-center gap-2 px-3.5 py-1.5 rounded-lg text-xs font-semibold transition-all whitespace-nowrap",
              activeTab === "power"
                ? "bg-[var(--color-primary)] text-black shadow-[0_0_15px_rgba(0,212,170,0.4)]"
                : "text-slate-400 hover:text-white hover:bg-white/5"
            )}
          >
            <Zap className="w-3.5 h-3.5" />
            AC Power Quality
          </button>
          <button
            onClick={() => setActiveTab("thermal")}
            className={cn(
              "flex items-center gap-2 px-3.5 py-1.5 rounded-lg text-xs font-semibold transition-all whitespace-nowrap",
              activeTab === "thermal"
                ? "bg-[var(--color-primary)] text-black shadow-[0_0_15px_rgba(0,212,170,0.4)]"
                : "text-slate-400 hover:text-white hover:bg-white/5"
            )}
          >
            <Flame className="w-3.5 h-3.5" />
            Thermal Gradient
          </button>
          <button
            onClick={() => setActiveTab("weibull")}
            className={cn(
              "flex items-center gap-2 px-3.5 py-1.5 rounded-lg text-xs font-semibold transition-all whitespace-nowrap",
              activeTab === "weibull"
                ? "bg-[var(--color-primary)] text-black shadow-[0_0_15px_rgba(0,212,170,0.4)]"
                : "text-slate-400 hover:text-white hover:bg-white/5"
            )}
          >
            <ShieldCheck className="w-3.5 h-3.5" />
            Weibull Reliability
          </button>
        </div>
      </div>

      {/* KPI Quick-Strip */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 py-4">
        <div className="surface-card p-3 rounded-xl border border-white/5 bg-white/2">
          <p className="text-[10px] uppercase font-mono tracking-wider text-slate-400">Peak Harmonic RMS</p>
          <div className="flex items-baseline gap-2 mt-1">
            <span className={cn(
              "text-lg font-bold font-mono",
              maxVibrationRms > 2.8 ? "text-amber-400" : "text-emerald-400"
            )}>
              {maxVibrationRms} mm/s
            </span>
            <span className="text-[10px] font-mono text-slate-400">
              {maxVibrationRms <= 1.12 ? "ISO Zone A" : maxVibrationRms <= 2.8 ? "ISO Zone B" : "ISO Zone C"}
            </span>
          </div>
        </div>

        <div className="surface-card p-3 rounded-xl border border-white/5 bg-white/2">
          <p className="text-[10px] uppercase font-mono tracking-wider text-slate-400">Active Power & THD</p>
          <div className="flex items-baseline gap-2 mt-1">
            <span className="text-lg font-bold font-mono text-cyan-400">{activePowerKw} kW</span>
            <span className="text-[10px] font-mono text-slate-400">THD: {thdPercent}%</span>
          </div>
        </div>

        <div className="surface-card p-3 rounded-xl border border-white/5 bg-white/2">
          <p className="text-[10px] uppercase font-mono tracking-wider text-slate-400">Stator Core Heat</p>
          <div className="flex items-baseline gap-2 mt-1">
            <span className="text-lg font-bold font-mono text-amber-300">
              {thermalData[thermalData.length - 1]?.statorCore || 48}°C
            </span>
            <span className="text-[10px] font-mono text-slate-400">ΔT: +{(thermalData[thermalData.length - 1]?.statorCore - ambientTemp).toFixed(1)}°C</span>
          </div>
        </div>

        <div className="surface-card p-3 rounded-xl border border-white/5 bg-white/2">
          <p className="text-[10px] uppercase font-mono tracking-wider text-slate-400">Projected MTBF (η)</p>
          <div className="flex items-baseline gap-2 mt-1">
            <span className="text-lg font-bold font-mono text-emerald-400">{weibullData.eta.toLocaleString()} hrs</span>
            <span className="text-[10px] font-mono text-slate-400">β: 2.4</span>
          </div>
        </div>
      </div>

      {/* Main Chart Area */}
      <div className="mt-2 min-h-[320px] w-full">
        {activeTab === "fft" && (
          <div className="space-y-2">
            <div className="flex items-center justify-between text-xs text-slate-400">
              <span className="flex items-center gap-1.5 font-mono">
                <span className="w-2 h-2 rounded-full bg-cyan-400" />
                Discrete Fourier Transform: Vibration Amplitude vs Frequency (5 - 250 Hz)
              </span>
              <div className="flex items-center gap-3 font-mono text-[11px]">
                <span className="text-emerald-400">Zone A ≤1.12</span>
                <span className="text-cyan-400">Zone B ≤2.8</span>
                <span className="text-amber-400">Zone C ≤7.1</span>
              </div>
            </div>
            <div className="h-[280px] w-full">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={fftData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                  <defs>
                    <linearGradient id="fftGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#00d4aa" stopOpacity={0.7} />
                      <stop offset="95%" stopColor="#00d4aa" stopOpacity={0.02} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" />
                  <XAxis dataKey="frequency" tick={{ fill: "#94a3b8", fontSize: 10 }} />
                  <YAxis tick={{ fill: "#94a3b8", fontSize: 10 }} domain={[0, "auto"]} />
                  <Tooltip
                    contentStyle={{ backgroundColor: "#0b121e", borderColor: "rgba(255,255,255,0.15)", borderRadius: "8px", fontSize: "12px" }}
                  />
                  <ReferenceLine y={1.12} stroke="#10b981" strokeDasharray="3 3" label={{ value: "ISO Zone A", fill: "#10b981", fontSize: 10 }} />
                  <ReferenceLine y={2.8} stroke="#06b6d4" strokeDasharray="3 3" label={{ value: "ISO Zone B", fill: "#06b6d4", fontSize: 10 }} />
                  <ReferenceLine y={7.1} stroke="#f59e0b" strokeDasharray="3 3" label={{ value: "ISO Zone C", fill: "#f59e0b", fontSize: 10 }} />
                  <Area type="monotone" dataKey="amplitude" stroke="#00d4aa" strokeWidth={2} fillOpacity={1} fill="url(#fftGrad)" name="Amplitude (mm/s RMS)" />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </div>
        )}

        {activeTab === "power" && (
          <div className="space-y-2">
            <div className="flex items-center justify-between text-xs text-slate-400">
              <span className="flex items-center gap-1.5 font-mono">
                <span className="w-2 h-2 rounded-full bg-amber-400" />
                3-Phase AC Voltage (Va, Vb, Vc in Volts) & Motor Current Waveform (Ia in Amps)
              </span>
              <span className="font-mono text-[11px] text-cyan-400">50 Hz AC Grid Standard (20ms Full Cycle)</span>
            </div>
            <div className="h-[280px] w-full">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={powerData} margin={{ top: 10, right: 10, left: -10, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" />
                  <XAxis dataKey="time" tick={{ fill: "#94a3b8", fontSize: 10 }} />
                  <YAxis yAxisId="volt" tick={{ fill: "#94a3b8", fontSize: 10 }} domain={[-360, 360]} />
                  <YAxis yAxisId="curr" orientation="right" tick={{ fill: "#38bdf8", fontSize: 10 }} domain={[-15, 15]} />
                  <Tooltip
                    contentStyle={{ backgroundColor: "#0b121e", borderColor: "rgba(255,255,255,0.15)", borderRadius: "8px", fontSize: "12px" }}
                  />
                  <Line yAxisId="volt" type="monotone" dataKey="phaseA_V" stroke="#ef4444" dot={false} strokeWidth={1.5} name="Phase L1 (V)" />
                  <Line yAxisId="volt" type="monotone" dataKey="phaseB_V" stroke="#eab308" dot={false} strokeWidth={1.5} name="Phase L2 (V)" />
                  <Line yAxisId="volt" type="monotone" dataKey="phaseC_V" stroke="#3b82f6" dot={false} strokeWidth={1.5} name="Phase L3 (V)" />
                  <Line yAxisId="curr" type="monotone" dataKey="current_A" stroke="#00d4aa" dot={false} strokeWidth={2.5} name="Current L1 (A)" />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </div>
        )}

        {activeTab === "thermal" && (
          <div className="space-y-2">
            <div className="flex items-center justify-between text-xs text-slate-400">
              <span className="flex items-center gap-1.5 font-mono">
                <span className="w-2 h-2 rounded-full bg-rose-400" />
                Multi-Point Thermodynamic Rise Gradient (Stator, Bearings & Terminals)
              </span>
              <span className="font-mono text-[11px] text-rose-400">IEC 60034 Class F Ceiling: 155°C</span>
            </div>
            <div className="h-[280px] w-full">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={thermalData} margin={{ top: 10, right: 10, left: -10, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" />
                  <XAxis dataKey="time" tick={{ fill: "#94a3b8", fontSize: 10 }} />
                  <YAxis tick={{ fill: "#94a3b8", fontSize: 10 }} domain={[15, 100]} />
                  <Tooltip
                    contentStyle={{ backgroundColor: "#0b121e", borderColor: "rgba(255,255,255,0.15)", borderRadius: "8px", fontSize: "12px" }}
                  />
                  <ReferenceLine y={75} stroke="#ef4444" strokeDasharray="3 3" label={{ value: "Alarm (75°C)", fill: "#ef4444", fontSize: 10 }} />
                  <Line type="monotone" dataKey="statorCore" stroke="#f43f5e" strokeWidth={2.5} dot={false} name="Stator Core (°C)" />
                  <Line type="monotone" dataKey="bearingHousing" stroke="#f97316" strokeWidth={2} dot={false} name="Bearing Housing (°C)" />
                  <Line type="monotone" dataKey="terminalBox" stroke="#eab308" strokeWidth={1.5} dot={false} name="Terminal Block (°C)" />
                  <Line type="monotone" dataKey="ambient" stroke="#64748b" strokeDasharray="4 4" dot={false} name="Ambient Ref (°C)" />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </div>
        )}

        {activeTab === "weibull" && (
          <div className="space-y-2">
            <div className="flex items-center justify-between text-xs text-slate-400">
              <span className="flex items-center gap-1.5 font-mono">
                <span className="w-2 h-2 rounded-full bg-emerald-400" />
                Weibull Cumulative Survival Curve R(t) & Predictive Machine Wear Horizon
              </span>
              <span className="font-mono text-[11px] text-emerald-400">Characteristic Life η = {weibullData.eta}h</span>
            </div>
            <div className="h-[280px] w-full">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={weibullData.points} margin={{ top: 10, right: 10, left: -10, bottom: 0 }}>
                  <defs>
                    <linearGradient id="weibullGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#10b981" stopOpacity={0.6} />
                      <stop offset="95%" stopColor="#10b981" stopOpacity={0.02} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" />
                  <XAxis dataKey="hours" tick={{ fill: "#94a3b8", fontSize: 10 }} />
                  <YAxis tick={{ fill: "#94a3b8", fontSize: 10 }} domain={[0, 100]} />
                  <Tooltip
                    contentStyle={{ backgroundColor: "#0b121e", borderColor: "rgba(255,255,255,0.15)", borderRadius: "8px", fontSize: "12px" }}
                  />
                  <ReferenceLine x="5k hrs" stroke="#38bdf8" strokeDasharray="3 3" label={{ value: "Current Age", fill: "#38bdf8", fontSize: 10 }} />
                  <Area type="monotone" dataKey="survivalRate" stroke="#10b981" strokeWidth={2.5} fill="url(#weibullGrad)" name="Survival Probability %" />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </div>
        )}
      </div>

      {/* Optimistic Simulation & Tuning Controls */}
      <div className="mt-6 pt-5 border-t border-white/10">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <Sliders className="w-4 h-4 text-[var(--color-primary)]" />
            <span className="text-xs font-bold uppercase tracking-wider text-slate-300">
              Interactive Optimistic Simulation Controls
            </span>
            <span className="text-[11px] text-slate-400">
              (Live recalculation on slider change with instant visual feedback)
            </span>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={() => setIsLiveStreaming(!isLiveStreaming)}
              className={cn(
                "px-2.5 py-1 rounded-md text-[11px] font-mono border transition-all flex items-center gap-1.5",
                isLiveStreaming
                  ? "border-emerald-500/40 text-emerald-400 bg-emerald-500/10"
                  : "border-white/10 text-slate-400 bg-white/5"
              )}
            >
              <span className={cn("w-1.5 h-1.5 rounded-full", isLiveStreaming ? "bg-emerald-400 animate-pulse" : "bg-slate-500")} />
              {isLiveStreaming ? "Live Micro-Stream Active" : "Stream Paused"}
            </button>
            <button
              onClick={resetNominal}
              className="px-2.5 py-1 rounded-md text-[11px] font-mono border border-white/10 text-slate-400 hover:text-white hover:bg-white/5 transition-all"
            >
              Reset Nominal
            </button>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          {/* Slider 1: Shaft Speed */}
          <div className="p-3 rounded-xl bg-white/3 border border-white/5">
            <div className="flex justify-between text-xs font-mono mb-2">
              <span className="text-slate-400">Shaft RPM</span>
              <span className="text-emerald-400 font-bold">{speedRpm} RPM</span>
            </div>
            <input
              type="range"
              min="600"
              max="3000"
              step="50"
              value={speedRpm}
              onChange={(e) => setSpeedRpm(Number(e.target.value))}
              className="w-full accent-[var(--color-primary)] cursor-pointer"
            />
            <span className="text-[10px] text-slate-500 font-mono">Governs 1X harmonic peak</span>
          </div>

          {/* Slider 2: Motor Load */}
          <div className="p-3 rounded-xl bg-white/3 border border-white/5">
            <div className="flex justify-between text-xs font-mono mb-2">
              <span className="text-slate-400">Load Factor</span>
              <span className="text-cyan-400 font-bold">{loadPct}%</span>
            </div>
            <input
              type="range"
              min="10"
              max="140"
              step="5"
              value={loadPct}
              onChange={(e) => setLoadPct(Number(e.target.value))}
              className="w-full accent-cyan-400 cursor-pointer"
            />
            <span className="text-[10px] text-slate-500 font-mono">Modulates current & thermal rise</span>
          </div>

          {/* Slider 3: Bearing Wear */}
          <div className="p-3 rounded-xl bg-white/3 border border-white/5">
            <div className="flex justify-between text-xs font-mono mb-2">
              <span className="text-slate-400">Bearing Wear</span>
              <span className={cn("font-bold", bearingWear > 50 ? "text-amber-400" : "text-slate-300")}>
                {bearingWear}%
              </span>
            </div>
            <input
              type="range"
              min="0"
              max="95"
              step="5"
              value={bearingWear}
              onChange={(e) => setBearingWear(Number(e.target.value))}
              className="w-full accent-amber-400 cursor-pointer"
            />
            <span className="text-[10px] text-slate-500 font-mono">Triggers BPFO fault harmonics</span>
          </div>

          {/* Slider 4: Ambient Temp */}
          <div className="p-3 rounded-xl bg-white/3 border border-white/5">
            <div className="flex justify-between text-xs font-mono mb-2">
              <span className="text-slate-400">Ambient Temp</span>
              <span className="text-rose-400 font-bold">{ambientTemp}°C</span>
            </div>
            <input
              type="range"
              min="10"
              max="55"
              step="1"
              value={ambientTemp}
              onChange={(e) => setAmbientTemp(Number(e.target.value))}
              className="w-full accent-rose-400 cursor-pointer"
            />
            <span className="text-[10px] text-slate-500 font-mono">Baseline thermodynamic floor</span>
          </div>
        </div>

        {/* Sync to Edge IPC action */}
        <div className="mt-4 flex flex-col sm:flex-row items-center justify-between gap-3 pt-3 border-t border-white/5">
          <div className="text-xs font-mono text-slate-400 flex items-center gap-2">
            {committedFeedback ? (
              <span className="text-emerald-400 flex items-center gap-1.5 animate-in fade-in">
                <CheckCircle2 className="w-4 h-4" />
                {committedFeedback}
              </span>
            ) : (
              <span>Optimistic pipeline active: Changes stream to local WebGL / Canvas instantly without lag</span>
            )}
          </div>

          <button
            onClick={handleCommitSetpoint}
            disabled={isCommitting}
            className="w-full sm:w-auto px-4 py-2 rounded-lg bg-[var(--color-primary)] hover:bg-[#00e6b8] text-black font-semibold text-xs font-mono flex items-center justify-center gap-2 transition-all shadow-[0_0_15px_rgba(0,212,170,0.3)] disabled:opacity-50"
          >
            {isCommitting ? (
              <RefreshCw className="w-3.5 h-3.5 animate-spin" />
            ) : (
              <Cpu className="w-3.5 h-3.5" />
            )}
            Commit Simulation Setpoint to PLC Bus
          </button>
        </div>
      </div>
    </div>
  );
}
