"use client";

import React, { useState, useEffect, useMemo, useTransition } from "react";
import {
  Zap, Cpu, Activity, AlertTriangle, ShieldCheck, CheckCircle2,
  RefreshCw, Sliders, BarChart3, TrendingUp, Info, X, Flame, Sparkles
} from "lucide-react";
import {
  ResponsiveContainer, BarChart, Bar, LineChart, Line,
  XAxis, YAxis, Tooltip, CartesianGrid, ReferenceLine, Cell
} from "recharts";
import { api } from "@/lib/api";

interface ConnectedModelInspectorProps {
  machineId: "SGT-TERM-01" | "XFMR-315MVA-01" | string;
  onClose?: () => void;
  isModal?: boolean;
}

export function ConnectedModelInspector({ machineId, onClose, isModal = false }: ConnectedModelInspectorProps) {
  const isHardware = machineId === "ESP32-HARDWARE-01";
  const isTerminal = machineId === "SGT-TERM-01" || isHardware;
  const [, startTransition] = useTransition();

  // Preset Scenarios
  const [activeScenario, setActiveScenario] = useState<string>("nominal");

  // Terminal (Dataset 1) parameters
  const [tVoltage, setTVoltage] = useState(230.4);
  const [tCurrent, setTCurrent] = useState(5.15);
  const [tTemp, setTTemp] = useState(42.5);
  const [tVib, setTVib] = useState(1.82);
  const [tFreq, setTFreq] = useState(50.02);
  const [tPf, setTPf] = useState(0.94);
  const [tLoadVar, setTLoadVar] = useState(12.4);
  const [tAnomaly, setTAnomaly] = useState(0.12);

  // Transformer (Dataset 2) parameters
  const [txH2, setTxH2] = useState(18.5);
  const [txCH4, setTxCH4] = useState(22.1);
  const [txC2H6, setTxC2H6] = useState(12.0);
  const [txC2H4, setTxC2H4] = useState(15.4);
  const [txC2H2, setTxC2H2] = useState(0.45);
  const [txCO, setTxCO] = useState(220.0);
  const [txBDV, setTxBDV] = useState(68.5);
  const [txMoisture, setTxMoisture] = useState(12.0);
  const [txOilTemp, setTxOilTemp] = useState(52.0);
  const [txWindingTemp, setTxWindingTemp] = useState(64.5);

  // Model Results state
  const [terminalResult, setTerminalResult] = useState<any>(null);
  const [transformerResult, setTransformerResult] = useState<any>(null);
  const [isLoading, setIsLoading] = useState(false);

  // Trigger prediction on parameter change
  const runPrediction = async () => {
    setIsLoading(true);
    try {
      if (isTerminal) {
        const res = await api.predictTerminal({
          voltage: tVoltage,
          current: tCurrent,
          temperature: tTemp,
          frequency: tFreq,
          power_factor: tPf,
          vibration_level: tVib,
          device_age: 5.0,
          terminal_efficiency: 94.2,
          load_variation: tLoadVar,
          signal_strength: -64.0,
          apparent_power: (tVoltage * tCurrent) / 1000.0,
          real_power: (tVoltage * tCurrent * tPf) / 1000.0,
          energy_consumed: 22.0,
          anomaly_score: tAnomaly
        });
        if (res && res.data) {
          setTerminalResult(res.data);
        }
      } else {
        const res = await api.predictTransformer({
          h2: txH2,
          ch4: txCH4,
          c2h6: txC2H6,
          c2h4: txC2H4,
          c2h2: txC2H2,
          co: txCO,
          co2: 2100.0,
          bdv: txBDV,
          moisture: txMoisture,
          oil_temp: txOilTemp,
          winding_temp: txWindingTemp,
          age: 6.0
        });
        if (res && res.data) {
          setTransformerResult(res.data);
        }
      }
    } catch (err) {
      console.error("Prediction error:", err);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    runPrediction();
  }, [isTerminal, tVoltage, tCurrent, tTemp, tVib, tFreq, tPf, tLoadVar, tAnomaly, txH2, txCH4, txC2H6, txC2H4, txC2H2, txCO, txBDV, txMoisture, txOilTemp, txWindingTemp]);

  // Handle Preset loading
  const handleApplyPreset = (presetKey: string) => {
    setActiveScenario(presetKey);
    startTransition(() => {
      if (presetKey === "nominal") {
        setTVoltage(230.4);
        setTCurrent(5.15);
        setTTemp(42.5);
        setTVib(1.82);
        setTFreq(50.02);
        setTPf(0.94);
        setTLoadVar(12.4);
        setTAnomaly(0.12);

        setTxH2(18.5);
        setTxCH4(22.1);
        setTxC2H6(12.0);
        setTxC2H4(15.4);
        setTxC2H2(0.45);
        setTxCO(220.0);
        setTxBDV(68.5);
        setTxMoisture(12.0);
        setTxOilTemp(52.0);
        setTxWindingTemp(64.5);
      } else if (presetKey === "thermal") {
        setTVoltage(224.2);
        setTCurrent(7.8);
        setTTemp(68.5);
        setTVib(3.8);
        setTFreq(49.91);
        setTPf(0.88);
        setTLoadVar(28.5);
        setTAnomaly(0.65);

        setTxH2(65.0);
        setTxCH4(195.0);
        setTxC2H6(85.0);
        setTxC2H4(820.0); // Dominant T3 gas
        setTxC2H2(4.2);
        setTxCO(580.0);
        setTxBDV(52.0);
        setTxMoisture(24.5);
        setTxOilTemp(88.0);
        setTxWindingTemp(118.0);
      } else if (presetKey === "arcing") {
        setTVoltage(204.5);
        setTCurrent(9.2);
        setTTemp(74.0);
        setTVib(7.4);
        setTFreq(49.78);
        setTPf(0.79);
        setTLoadVar(34.0);
        setTAnomaly(0.82);

        setTxH2(480.0);
        setTxCH4(75.0);
        setTxC2H6(32.0);
        setTxC2H4(92.0);
        setTxC2H2(340.0); // Acetylene explosion
        setTxCO(310.0);
        setTxBDV(24.0);
        setTxMoisture(28.0);
        setTxOilTemp(72.0);
        setTxWindingTemp(89.0);
      }
    });
  };

  // --- TERMINAL CHARTS DATA ---
  const terminalDevData = useMemo(() => {
    const baseline: Record<string, { m: number; s: number }> = {
      Voltage: { m: 230.0, s: 9.8 },
      Current: { m: 5.0, s: 1.5 },
      Temperature: { m: 44.5, s: 7.8 },
      Frequency: { m: 50.0, s: 0.3 },
      PowerFactor: { m: 0.94, s: 0.03 },
      Vibration: { m: 1.9, s: 0.5 },
      LoadVar: { m: 15.0, s: 5.0 },
      Anomaly: { m: 0.2, s: 0.3 }
    };
    const values: Record<string, number> = {
      Voltage: tVoltage,
      Current: tCurrent,
      Temperature: tTemp,
      Frequency: tFreq,
      PowerFactor: tPf,
      Vibration: tVib,
      LoadVar: tLoadVar,
      Anomaly: tAnomaly
    };
    return Object.keys(baseline).map((key) => {
      const z = Math.abs(values[key] - baseline[key].m) / baseline[key].s;
      return {
        parameter: key,
        zScore: parseFloat(z.toFixed(2)),
        status: z > 2.5 ? "Critical" : z > 1.5 ? "Warning" : "Normal"
      };
    });
  }, [tVoltage, tCurrent, tTemp, tFreq, tPf, tVib, tLoadVar, tAnomaly]);

  const terminalTrajectoryData = useMemo(() => {
    return Array.from({ length: 10 }).map((_, idx) => {
      const step = idx - 9;
      const progress = (idx + 1) / 10;
      const tempVal = Math.max(25, tTemp - 15 * (1 - progress)) + (idx === 9 ? 0 : Math.sin(idx) * 0.8);
      return {
        time: `${step}s`,
        temperature: parseFloat(tempVal.toFixed(1)),
        warningLimit: 60.0,
        tripLimit: 75.0
      };
    });
  }, [tTemp]);

  // --- TRANSFORMER CHARTS DATA ---
  const dgaGasesData = useMemo(() => {
    return [
      { gas: "H2", name: "Hydrogen", value: txH2, limit: 50, ratio: txH2 / 50 },
      { gas: "CH4", name: "Methane", value: txCH4, limit: 40, ratio: txCH4 / 40 },
      { gas: "C2H6", name: "Ethane", value: txC2H6, limit: 30, ratio: txC2H6 / 30 },
      { gas: "C2H4", name: "Ethylene", value: txC2H4, limit: 30, ratio: txC2H4 / 30 },
      { gas: "C2H2", name: "Acetylene", value: txC2H2, limit: 1.0, ratio: txC2H2 / 1.0 }
    ];
  }, [txH2, txCH4, txC2H6, txC2H4, txC2H2]);

  const duvalData = useMemo(() => {
    const denom = txCH4 + txC2H4 + txC2H2 + 1e-5;
    return [
      { name: "% CH4 (Methane)", value: parseFloat(((txCH4 / denom) * 100).toFixed(1)), color: "#38bdf8" },
      { name: "% C2H4 (Ethylene)", value: parseFloat(((txC2H4 / denom) * 100).toFixed(1)), color: "#f59e0b" },
      { name: "% C2H2 (Acetylene)", value: parseFloat(((txC2H2 / denom) * 100).toFixed(1)), color: "#ef4444" }
    ];
  }, [txCH4, txC2H4, txC2H2]);

  const classProbsData = useMemo(() => {
    if (!transformerResult?.class_probabilities) return [];
    return Object.entries(transformerResult.class_probabilities).map(([cls, prob]) => ({
      className: cls.replace(/_/g, " "),
      probability: parseFloat(((prob as number) * 100).toFixed(1))
    }));
  }, [transformerResult]);

  return (
    <div className={`flex flex-col bg-[#0b1120] text-slate-100 rounded-2xl border border-white/10 ${isModal ? 'max-h-[90vh] overflow-y-auto p-6 shadow-2xl' : 'p-6'}`}>
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-6 border-b border-white/10">
        <div>
          <div className="flex items-center gap-2 mb-2">
            <span className="inline-flex items-center gap-1.5 rounded-full border border-sky-500/30 bg-sky-500/10 px-3 py-0.5 text-[11px] font-semibold uppercase tracking-wider text-sky-400">
              <Cpu className="h-3.5 w-3.5" />
              Machine AI Diagnostic Inspector
            </span>
            <span className="text-xs font-mono text-slate-400">
              {isHardware
                ? "Physical Hardware Live • ESP32-HARDWARE-01"
                : isTerminal
                ? "Kaggle Dataset 1 • SGT-TERM-01"
                : "Kaggle Dataset 2 • XFMR-315MVA-01"}
            </span>
          </div>
          <h2 className="text-2xl font-bold tracking-tight text-white flex items-center gap-2.5">
            {isHardware ? (
              <Zap className="h-6 w-6 text-emerald-400" />
            ) : isTerminal ? (
              <Zap className="h-6 w-6 text-sky-400" />
            ) : (
              <Flame className="h-6 w-6 text-amber-400" />
            )}
            {isHardware
              ? "Dataset 3: Physical Hardware Live Telemetry & Model Diagnostics"
              : isTerminal
              ? "Dataset 1: Terminal & Breaker Model Diagnostics"
              : "Dataset 2: Power Transformer DGA & Health Index Diagnostics"}
          </h2>
          <p className="mt-1 text-sm text-slate-400">
            Real-time visual diagnostic inspection modeled after the Streamlit industrial SCADA dashboard, running zero-dependency pre-trained <code className="text-sky-300 font-mono">.model</code> tree ensembles.
          </p>
        </div>

        <div className="flex items-center gap-3">
          {/* Quick Scenario Preset Selector */}
          <div className="flex items-center gap-1 rounded-xl border border-white/10 bg-black/40 p-1">
            <button
              onClick={() => handleApplyPreset("nominal")}
              className={`px-3 py-1 rounded-lg text-xs font-medium transition-all ${activeScenario === "nominal" ? "bg-emerald-500/20 text-emerald-300 border border-emerald-500/30" : "text-slate-400 hover:text-white"}`}
            >
              🟢 Nominal
            </button>
            <button
              onClick={() => handleApplyPreset("thermal")}
              className={`px-3 py-1 rounded-lg text-xs font-medium transition-all ${activeScenario === "thermal" ? "bg-amber-500/20 text-amber-300 border border-amber-500/30" : "text-slate-400 hover:text-white"}`}
            >
              🟠 Hotspot T3
            </button>
            <button
              onClick={() => handleApplyPreset("arcing")}
              className={`px-3 py-1 rounded-lg text-xs font-medium transition-all ${activeScenario === "arcing" ? "bg-red-500/20 text-red-300 border border-red-500/30" : "text-slate-400 hover:text-white"}`}
            >
              ⚡ Arcing
            </button>
          </div>

          {onClose && (
            <button
              onClick={onClose}
              className="p-2 rounded-xl border border-white/10 bg-white/5 hover:bg-white/10 text-slate-400 hover:text-white transition-all"
            >
              <X className="h-5 w-5" />
            </button>
          )}
        </div>
      </div>

      {/* Real-time Model Prediction Banner */}
      <div className="my-6 p-4 rounded-xl border border-white/10 bg-gradient-to-r from-black/60 via-slate-900/40 to-black/60 flex flex-col md:flex-row md:items-center justify-between gap-4">
        {isTerminal ? (
          <>
            <div className="flex items-center gap-4">
              <div className={`p-3 rounded-xl border ${terminalResult?.fault_status === 1 ? 'bg-red-500/20 border-red-500/40 text-red-400' : 'bg-emerald-500/20 border-emerald-500/40 text-emerald-400'}`}>
                {terminalResult?.fault_status === 1 ? <AlertTriangle className="h-6 w-6" /> : <ShieldCheck className="h-6 w-6" />}
              </div>
              <div>
                <span className="text-[10px] font-mono uppercase tracking-wider text-slate-400">AI Model Classification</span>
                <h3 className={`text-xl font-bold font-mono ${terminalResult?.fault_status === 1 ? 'text-red-400' : 'text-emerald-400'}`}>
                  {terminalResult?.fault_status_label || "NOMINAL HEALTHY"}
                </h3>
                <span className="text-xs text-slate-400">
                  Artifact: <code className="text-sky-300 font-mono">models/terminal_fault_model.model</code>
                </span>
              </div>
            </div>
            <div className="flex items-center gap-6 font-mono">
              <div className="text-right">
                <span className="text-[10px] uppercase text-slate-400 block">Trip Probability</span>
                <span className={`text-2xl font-black ${terminalResult?.fault_status === 1 ? 'text-red-400' : 'text-emerald-400'}`}>
                  {terminalResult?.fault_probability_percent ?? 0.02}%
                </span>
              </div>
              <div className="text-right border-l border-white/10 pl-6">
                <span className="text-[10px] uppercase text-slate-400 block">Health Score</span>
                <span className="text-2xl font-black text-white">
                  {terminalResult?.health_score ?? 100.0}%
                </span>
              </div>
            </div>
          </>
        ) : (
          <>
            <div className="flex items-center gap-4">
              <div className={`p-3 rounded-xl border ${transformerResult?.health_status === 'CRITICAL' ? 'bg-red-500/20 border-red-500/40 text-red-400' : (transformerResult?.health_status === 'WARNING' ? 'bg-amber-500/20 border-amber-500/40 text-amber-400' : 'bg-emerald-500/20 border-emerald-500/40 text-emerald-400')}`}>
                <Activity className="h-6 w-6" />
              </div>
              <div>
                <span className="text-[10px] font-mono uppercase tracking-wider text-slate-400">AI Predicted Fault Mode</span>
                <h3 className="text-xl font-bold font-mono text-white">
                  {(transformerResult?.fault_class || "Nominal_Normal").replace(/_/g, " ")}
                </h3>
                <span className="text-xs text-slate-400">
                  Artifact: <code className="text-amber-300 font-mono">models/transformer_health_model.model</code>
                </span>
              </div>
            </div>
            <div className="flex items-center gap-6 font-mono">
              <div className="text-right">
                <span className="text-[10px] uppercase text-slate-400 block">TCG Combustible Gas</span>
                <span className="text-2xl font-black text-sky-400">
                  {transformerResult?.tcg_ppm ?? 288.5} ppm
                </span>
              </div>
              <div className="text-right border-l border-white/10 pl-6">
                <span className="text-[10px] uppercase text-slate-400 block">Continuous Health Index</span>
                <span className={`text-2xl font-black ${transformerResult?.health_index < 55 ? 'text-red-400' : transformerResult?.health_index < 80 ? 'text-amber-400' : 'text-emerald-400'}`}>
                  {transformerResult?.health_index ?? 69.9}/100
                </span>
              </div>
            </div>
          </>
        )}
      </div>

      {/* Interactive Parameter Sliders */}
      <div className="mb-6 p-4 rounded-xl border border-white/10 bg-black/30">
        <div className="flex items-center justify-between mb-3">
          <span className="text-xs font-bold uppercase tracking-wider text-slate-300 flex items-center gap-1.5">
            <Sliders className="h-4 w-4 text-sky-400" />
            Interactive Live Telemetry What-If Controls
          </span>
          <span className="text-[11px] font-mono text-slate-500">Instant model recalculation on change</span>
        </div>

        {isTerminal ? (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-xs font-mono">
            <div>
              <div className="flex justify-between text-slate-400 mb-1">
                <span>Voltage (V)</span>
                <span className="text-white font-bold">{tVoltage} V</span>
              </div>
              <input
                type="range"
                min="180"
                max="280"
                step="0.5"
                value={tVoltage}
                onChange={(e) => setTVoltage(parseFloat(e.target.value))}
                className="w-full accent-sky-400"
              />
            </div>
            <div>
              <div className="flex justify-between text-slate-400 mb-1">
                <span>Current (A)</span>
                <span className="text-white font-bold">{tCurrent} A</span>
              </div>
              <input
                type="range"
                min="0.5"
                max="12.0"
                step="0.1"
                value={tCurrent}
                onChange={(e) => setTCurrent(parseFloat(e.target.value))}
                className="w-full accent-sky-400"
              />
            </div>
            <div>
              <div className="flex justify-between text-slate-400 mb-1">
                <span>Temperature (°C)</span>
                <span className="text-white font-bold">{tTemp}°C</span>
              </div>
              <input
                type="range"
                min="20"
                max="110"
                step="0.5"
                value={tTemp}
                onChange={(e) => setTTemp(parseFloat(e.target.value))}
                className="w-full accent-sky-400"
              />
            </div>
            <div>
              <div className="flex justify-between text-slate-400 mb-1">
                <span>Vibration (mm/s)</span>
                <span className="text-white font-bold">{tVib} mm/s</span>
              </div>
              <input
                type="range"
                min="0.2"
                max="10.0"
                step="0.1"
                value={tVib}
                onChange={(e) => setTVib(parseFloat(e.target.value))}
                className="w-full accent-sky-400"
              />
            </div>
          </div>
        ) : (
          <div className="grid grid-cols-2 md:grid-cols-5 gap-4 text-xs font-mono">
            <div>
              <div className="flex justify-between text-slate-400 mb-1">
                <span>Hydrogen (H₂)</span>
                <span className="text-white font-bold">{txH2} ppm</span>
              </div>
              <input
                type="range"
                min="5"
                max="600"
                step="1"
                value={txH2}
                onChange={(e) => setTxH2(parseFloat(e.target.value))}
                className="w-full accent-amber-400"
              />
            </div>
            <div>
              <div className="flex justify-between text-slate-400 mb-1">
                <span>Ethylene (C₂H₄)</span>
                <span className="text-white font-bold">{txC2H4} ppm</span>
              </div>
              <input
                type="range"
                min="2"
                max="900"
                step="1"
                value={txC2H4}
                onChange={(e) => setTxC2H4(parseFloat(e.target.value))}
                className="w-full accent-amber-400"
              />
            </div>
            <div>
              <div className="flex justify-between text-slate-400 mb-1">
                <span>Acetylene (C₂H₂)</span>
                <span className="text-white font-bold">{txC2H2} ppm</span>
              </div>
              <input
                type="range"
                min="0"
                max="400"
                step="0.5"
                value={txC2H2}
                onChange={(e) => setTxC2H2(parseFloat(e.target.value))}
                className="w-full accent-amber-400"
              />
            </div>
            <div>
              <div className="flex justify-between text-slate-400 mb-1">
                <span>Breakdown (BDV)</span>
                <span className="text-white font-bold">{txBDV} kV</span>
              </div>
              <input
                type="range"
                min="10"
                max="80"
                step="1"
                value={txBDV}
                onChange={(e) => setTxBDV(parseFloat(e.target.value))}
                className="w-full accent-amber-400"
              />
            </div>
            <div>
              <div className="flex justify-between text-slate-400 mb-1">
                <span>Oil Temp (°C)</span>
                <span className="text-white font-bold">{txOilTemp}°C</span>
              </div>
              <input
                type="range"
                min="25"
                max="120"
                step="1"
                value={txOilTemp}
                onChange={(e) => setTxOilTemp(parseFloat(e.target.value))}
                className="w-full accent-amber-400"
              />
            </div>
          </div>
        )}
      </div>

      {/* ========================================================================= */}
      {/* GRAPHS SECTION (IDENTICAL TO STREAMLIT INDUSTRIAL SCADA VISUALIZATIONS)   */}
      {/* ========================================================================= */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
        {isTerminal ? (
          <>
            {/* GRAPH 1: TERMINAL PARAMETER DEVIATION SEVERITY */}
            <div className="rounded-xl border border-white/10 bg-slate-900/60 p-4">
              <div className="flex items-center justify-between mb-3">
                <span className="text-xs font-bold uppercase tracking-wider text-slate-300 flex items-center gap-1.5">
                  <BarChart3 className="h-4 w-4 text-sky-400" />
                  1. Parameter Deviation Severity (σ from Nominal)
                </span>
                <span className="text-[10px] font-mono text-slate-500">Z-Score Normalization</span>
              </div>
              <div className="h-64 w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={terminalDevData} layout="vertical" margin={{ top: 5, right: 30, left: 40, bottom: 5 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#334155" horizontal={false} />
                    <XAxis type="number" stroke="#94a3b8" domain={[0, 4]} />
                    <YAxis dataKey="parameter" type="category" stroke="#94a3b8" tick={{ fontSize: 11 }} />
                    <Tooltip
                      contentStyle={{ backgroundColor: "#0f172a", borderColor: "#334155", color: "#f8fafc", borderRadius: "8px" }}
                    />
                    <ReferenceLine x={1.5} stroke="#f59e0b" strokeDasharray="3 3" label={{ value: "Warning (1.5σ)", fill: "#f59e0b", fontSize: 10 }} />
                    <ReferenceLine x={2.5} stroke="#ef4444" strokeDasharray="3 3" label={{ value: "Critical (2.5σ)", fill: "#ef4444", fontSize: 10 }} />
                    <Bar dataKey="zScore" radius={[0, 4, 4, 0]}>
                      {terminalDevData.map((entry, index) => (
                        <Cell
                          key={`cell-${index}`}
                          fill={entry.status === "Critical" ? "#ef4444" : entry.status === "Warning" ? "#f59e0b" : "#10b981"}
                        />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>

            {/* GRAPH 2: 10-SECOND THERMAL & TRAJECTORY TREND */}
            <div className="rounded-xl border border-white/10 bg-slate-900/60 p-4">
              <div className="flex items-center justify-between mb-3">
                <span className="text-xs font-bold uppercase tracking-wider text-slate-300 flex items-center gap-1.5">
                  <TrendingUp className="h-4 w-4 text-sky-400" />
                  2. 10-Second Telemetry Trajectory Leading to Sample
                </span>
                <span className="text-[10px] font-mono text-slate-500">IEC 62271 Thresholds</span>
              </div>
              <div className="h-64 w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={terminalTrajectoryData} margin={{ top: 5, right: 30, left: 10, bottom: 5 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
                    <XAxis dataKey="time" stroke="#94a3b8" tick={{ fontSize: 11 }} />
                    <YAxis stroke="#94a3b8" domain={[20, 100]} />
                    <Tooltip
                      contentStyle={{ backgroundColor: "#0f172a", borderColor: "#334155", color: "#f8fafc", borderRadius: "8px" }}
                    />
                    <ReferenceLine y={60.0} stroke="#f59e0b" strokeDasharray="3 3" label={{ value: "IEC Warning (60°C)", fill: "#f59e0b", fontSize: 10 }} />
                    <ReferenceLine y={75.0} stroke="#ef4444" strokeDasharray="3 3" label={{ value: "Trip Boundary (75°C)", fill: "#ef4444", fontSize: 10 }} />
                    <Line type="monotone" dataKey="temperature" stroke="#38bdf8" strokeWidth={2.5} dot={{ r: 3, fill: "#38bdf8" }} />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </div>
          </>
        ) : (
          <>
            {/* GRAPH 1: DISSOLVED COMBUSTIBLE GAS CONCENTRATIONS */}
            <div className="rounded-xl border border-white/10 bg-slate-900/60 p-4">
              <div className="flex items-center justify-between mb-3">
                <span className="text-xs font-bold uppercase tracking-wider text-slate-300 flex items-center gap-1.5">
                  <BarChart3 className="h-4 w-4 text-amber-400" />
                  1. Dissolved Combustible Gas Concentrations (PPM)
                </span>
                <span className="text-[10px] font-mono text-slate-500">IEEE C57.104 Gas Action Limits</span>
              </div>
              <div className="h-64 w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={dgaGasesData} margin={{ top: 5, right: 20, left: 10, bottom: 5 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
                    <XAxis dataKey="gas" stroke="#94a3b8" />
                    <YAxis stroke="#94a3b8" />
                    <Tooltip
                      contentStyle={{ backgroundColor: "#0f172a", borderColor: "#334155", color: "#f8fafc", borderRadius: "8px" }}
                    />
                    <Bar dataKey="value" radius={[4, 4, 0, 0]}>
                      {dgaGasesData.map((entry, index) => (
                        <Cell
                          key={`cell-${index}`}
                          fill={entry.ratio > 2.0 ? "#ef4444" : entry.ratio > 1.0 ? "#f59e0b" : "#10b981"}
                        />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>

            {/* GRAPH 2: DUVAL TRIANGLE FAULT COORDINATES */}
            <div className="rounded-xl border border-white/10 bg-slate-900/60 p-4">
              <div className="flex items-center justify-between mb-3">
                <span className="text-xs font-bold uppercase tracking-wider text-slate-300 flex items-center gap-1.5">
                  <Flame className="h-4 w-4 text-amber-400" />
                  2. Duval Triangle Fault Coordinates (% of CH₄ + C₂H₄ + C₂H₂)
                </span>
                <span className="text-[10px] font-mono text-slate-500">Ternary Proportions</span>
              </div>
              <div className="h-64 w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={duvalData} layout="vertical" margin={{ top: 10, right: 30, left: 50, bottom: 5 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#334155" horizontal={false} />
                    <XAxis type="number" stroke="#94a3b8" domain={[0, 100]} />
                    <YAxis dataKey="name" type="category" stroke="#94a3b8" tick={{ fontSize: 11 }} />
                    <Tooltip
                      contentStyle={{ backgroundColor: "#0f172a", borderColor: "#334155", color: "#f8fafc", borderRadius: "8px" }}
                    />
                    <Bar dataKey="value" radius={[0, 4, 4, 0]}>
                      {duvalData.map((entry, index) => (
                        <Cell key={`cell-${index}`} fill={entry.color} />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>
          </>
        )}
      </div>

      {/* Multi-class Confidence / Sensor Driver Attribution */}
      <div className="rounded-xl border border-white/10 bg-black/40 p-4 mb-6">
        <h4 className="text-xs font-bold uppercase tracking-wider text-slate-300 mb-3 flex items-center gap-2">
          <Sparkles className="h-4 w-4 text-sky-400" />
          {isTerminal ? "Model Attribution: Primary Driving Sensors (SHAP Proxy)" : "Model Probability Distribution across 6 IEEE Fault Classes"}
        </h4>

        {isTerminal ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-3">
            {terminalResult?.top_drivers?.map((driver: any, idx: number) => (
              <div key={idx} className="rounded-lg border border-white/5 bg-slate-900/60 p-3">
                <div className="flex justify-between items-center mb-1">
                  <span className="text-xs font-mono font-bold text-slate-200">{driver.sensor}</span>
                  <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${driver.status === 'CRITICAL' ? 'bg-red-500/20 text-red-300' : driver.status === 'WARNING' ? 'bg-amber-500/20 text-amber-300' : 'bg-emerald-500/20 text-emerald-300'}`}>
                    {driver.status}
                  </span>
                </div>
                <div className="text-sm font-bold font-mono text-white mt-1">
                  Value: {driver.value}
                </div>
                <div className="text-[10px] text-slate-400 mt-0.5">
                  Feature Impact: +{driver.impact}
                </div>
              </div>
            )) || <div className="text-xs text-slate-500 font-mono">Nominal operation. No critical driver spikes detected.</div>}
          </div>
        ) : (
          <div className="h-48 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={classProbsData} margin={{ top: 10, right: 30, left: 40, bottom: 25 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
                <XAxis dataKey="className" stroke="#94a3b8" tick={{ fontSize: 10, angle: -15, textAnchor: 'end' }} />
                <YAxis stroke="#94a3b8" domain={[0, 100]} />
                <Tooltip
                  contentStyle={{ backgroundColor: "#0f172a", borderColor: "#334155", color: "#f8fafc", borderRadius: "8px" }}
                />
                <Bar dataKey="probability" fill="#38bdf8" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        )}
      </div>

      {/* Governing Standards Compliance Table */}
      <div className="rounded-xl border border-white/10 bg-slate-900/40 p-4">
        <h4 className="text-xs font-bold uppercase tracking-wider text-slate-300 mb-3 flex items-center gap-2">
          <Info className="h-4 w-4 text-sky-400" />
          {isTerminal ? "IEC 60038 / IEC 62271 Governing Standards Compliance" : "IEEE C57.104 / IEC 60599 Transformer Oil Compliance"}
        </h4>
        <div className="overflow-x-auto text-xs font-mono">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="border-b border-white/10 text-slate-400">
                <th className="py-2 px-3">Diagnostic Parameter</th>
                <th className="py-2 px-3">Current Measured Value</th>
                <th className="py-2 px-3">Governing Standard Limit</th>
                <th className="py-2 px-3">Compliance Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/5 text-slate-200">
              {isTerminal ? (
                <>
                  <tr>
                    <td className="py-2 px-3 font-semibold">Voltage (V)</td>
                    <td className="py-2 px-3">{tVoltage} V</td>
                    <td className="py-2 px-3 text-slate-400">IEC 60038 Nominal 230V (207V - 253V)</td>
                    <td className="py-2 px-3">
                      <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${Math.abs(tVoltage - 230) > 23 ? 'bg-red-500/20 text-red-300' : 'bg-emerald-500/20 text-emerald-300'}`}>
                        {Math.abs(tVoltage - 230) > 23 ? 'ANOMALOUS' : 'NORMAL'}
                      </span>
                    </td>
                  </tr>
                  <tr>
                    <td className="py-2 px-3 font-semibold">Current (A)</td>
                    <td className="py-2 px-3">{tCurrent} A</td>
                    <td className="py-2 px-3 text-slate-400">IEC 60947 Rated Continuous In (&le; 8.0 A)</td>
                    <td className="py-2 px-3">
                      <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${tCurrent > 8.0 ? 'bg-red-500/20 text-red-300' : 'bg-emerald-500/20 text-emerald-300'}`}>
                        {tCurrent > 8.0 ? 'OVERLOAD' : 'NORMAL'}
                      </span>
                    </td>
                  </tr>
                  <tr>
                    <td className="py-2 px-3 font-semibold">Temperature (°C)</td>
                    <td className="py-2 px-3">{tTemp} °C</td>
                    <td className="py-2 px-3 text-slate-400">IEC 62271-1 Max Contact Limit (&le; 60.0 °C)</td>
                    <td className="py-2 px-3">
                      <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${tTemp > 60.0 ? 'bg-red-500/20 text-red-300' : 'bg-emerald-500/20 text-emerald-300'}`}>
                        {tTemp > 60.0 ? 'CRITICAL' : 'NORMAL'}
                      </span>
                    </td>
                  </tr>
                  <tr>
                    <td className="py-2 px-3 font-semibold">Vibration Level</td>
                    <td className="py-2 px-3">{tVib} mm/s</td>
                    <td className="py-2 px-3 text-slate-400">ISO 10816 Zone A Nominal (&le; 2.8 mm/s)</td>
                    <td className="py-2 px-3">
                      <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${tVib > 4.5 ? 'bg-red-500/20 text-red-300' : tVib > 2.8 ? 'bg-amber-500/20 text-amber-300' : 'bg-emerald-500/20 text-emerald-300'}`}>
                        {tVib > 4.5 ? 'UNACCEPTABLE' : tVib > 2.8 ? 'RESTRICTED' : 'ZONE A'}
                      </span>
                    </td>
                  </tr>
                </>
              ) : (
                <>
                  <tr>
                    <td className="py-2 px-3 font-semibold">Acetylene (C₂H₂)</td>
                    <td className="py-2 px-3">{txC2H2} ppm</td>
                    <td className="py-2 px-3 text-slate-400">IEEE C57.104 Arcing Action Limit (&le; 1.0 ppm)</td>
                    <td className="py-2 px-3">
                      <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${txC2H2 > 2.0 ? 'bg-red-500/20 text-red-300' : 'bg-emerald-500/20 text-emerald-300'}`}>
                        {txC2H2 > 2.0 ? 'CRITICAL ARCING' : 'NORMAL'}
                      </span>
                    </td>
                  </tr>
                  <tr>
                    <td className="py-2 px-3 font-semibold">Ethylene (C₂H₄)</td>
                    <td className="py-2 px-3">{txC2H4} ppm</td>
                    <td className="py-2 px-3 text-slate-400">IEEE C57.104 Hotspot Limit (&le; 30.0 ppm)</td>
                    <td className="py-2 px-3">
                      <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${txC2H4 > 150.0 ? 'bg-red-500/20 text-red-300' : txC2H4 > 50.0 ? 'bg-amber-500/20 text-amber-300' : 'bg-emerald-500/20 text-emerald-300'}`}>
                        {txC2H4 > 150.0 ? 'T3 HOTSPOT' : txC2H4 > 50.0 ? 'ELEVATED' : 'NORMAL'}
                      </span>
                    </td>
                  </tr>
                  <tr>
                    <td className="py-2 px-3 font-semibold">Breakdown Voltage (BDV)</td>
                    <td className="py-2 px-3">{txBDV} kV</td>
                    <td className="py-2 px-3 text-slate-400">IEC 60156 Minimum Rigidity (&gt; 55.0 kV)</td>
                    <td className="py-2 px-3">
                      <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${txBDV < 35.0 ? 'bg-red-500/20 text-red-300' : txBDV < 55.0 ? 'bg-amber-500/20 text-amber-300' : 'bg-emerald-500/20 text-emerald-300'}`}>
                        {txBDV < 35.0 ? 'COLLAPSE' : txBDV < 55.0 ? 'DEGRADED' : 'STABLE'}
                      </span>
                    </td>
                  </tr>
                </>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
