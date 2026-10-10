"use client";

import React, { useState, useEffect, useRef } from "react";
import Link from "next/link";
import {
  Usb, Terminal, Zap, Activity, AlertTriangle, ShieldCheck, CheckCircle2,
  RefreshCw, Power, Radio, Copy, Check, Info, ArrowUpRight, ChevronRight, X,
  Pause, Play, Trash2, RotateCcw, AlertCircle, LineChart as ChartIcon, Gauge, ExternalLink
} from "lucide-react";
import {
  ResponsiveContainer,
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
  ReferenceLine,
  Legend
} from "recharts";
import { api } from "@/lib/api";
import { useHardwareStream, ParsedTelemetry, RealtimeDataPoint } from "@/context/HardwareStreamContext";

export interface WebSerialDirectConnectorProps {
  initialMachineId?: string;
  onClose?: () => void;
  className?: string;
  onPacketReceived?: (packet: ParsedTelemetry) => void;
}

export function WebSerialDirectConnector({
  initialMachineId = "ESP32-HARDWARE-01",
  onClose,
  className = "",
  onPacketReceived,
}: WebSerialDirectConnectorProps) {
  const {
    isSupported,
    isConnected,
    isConnecting,
    errorMsg,
    selectedMachine,
    baudRate,
    packetCount,
    cadenceHz,
    forwardToBackend,
    latestPacket,
    realtimeHistory,
    logs,
    connectSerial,
    disconnectSerial,
    setSelectedMachine,
    setBaudRate,
    setForwardToBackend,
    clearLogs,
  } = useHardwareStream();

  const [availableMachines, setAvailableMachines] = useState<Array<{ id: string; name: string }>>([]);
  const [isPaused, setIsPaused] = useState(false);
  const [autoScroll, setAutoScroll] = useState(true);
  const [copiedCode, setCopiedCode] = useState(false);
  const logsContainerRef = useRef<HTMLDivElement>(null);

  // Sync initialMachineId if provided and not yet bound
  useEffect(() => {
    if (initialMachineId && !isConnected) {
      setSelectedMachine(initialMachineId);
    }
  }, [initialMachineId, isConnected, setSelectedMachine]);

  // Load available equipment list from backend
  useEffect(() => {
    api
      .getEquipment()
      .then((list: any) => {
        if (Array.isArray(list)) {
          setAvailableMachines(list.map((m: any) => ({ id: m.id, name: m.name || m.id })));
        }
      })
      .catch(() => {});
  }, []);

  // Pass latest packet to parent callback if registered
  useEffect(() => {
    if (latestPacket && onPacketReceived) {
      onPacketReceived(latestPacket);
    }
  }, [latestPacket, onPacketReceived]);

  // Auto-scroll logs
  useEffect(() => {
    if (autoScroll && logsContainerRef.current) {
      logsContainerRef.current.scrollTop = logsContainerRef.current.scrollHeight;
    }
  }, [logs, autoScroll]);

  const handleConnect = async () => {
    await connectSerial({ machineId: selectedMachine, baudRate });
  };

  const handleDisconnect = async () => {
    await disconnectSerial();
  };

  const esp32SampleCode = `// ==============================================================================
// SOVEREIGN PREDICTIVE MAINTENANCE: ESP32 DIRECT USB SERIAL TELEMETRY
// Baud Rate: 115200 | Target Machine: ${selectedMachine || "ESP32-HARDWARE-01"}
// ==============================================================================

#define MACHINE_ID "${selectedMachine || "ESP32-HARDWARE-01"}"
const unsigned long INTERVAL_MS = 1000; // 1-second transmission rate

void setup() {
  Serial.begin(115200);
  while (!Serial);
  delay(500);
  Serial.println("[READY] ESP32 WebSerial Telemetry Node Initialized");
}

void loop() {
  static unsigned long lastSend = 0;
  if (millis() - lastSend >= INTERVAL_MS) {
    lastSend = millis();

    // 1. Read sensors (DHT11 / Hall Sensor / ACS712)
    float temperature = 33.0 + (random(-5, 5) * 0.1);
    float vibration = 1.82 + (random(-3, 3) * 0.05);
    float current_draw = 4.12 + (random(-2, 2) * 0.02);
    float rpm = 1450.0 + random(-20, 20);
    int button_state = digitalRead(27) == LOW ? 1 : 0;

    // 2. Stream JSON line to Serial port
    Serial.print("[JSON_TELEMETRY] ");
    Serial.print("{\\"equipment_id\\":\\"" MACHINE_ID "\\",");
    Serial.print("\\"temperature\\":"); Serial.print(temperature, 2); Serial.print(",");
    Serial.print("\\"vibration\\":"); Serial.print(vibration, 2); Serial.print(",");
    Serial.print("\\"vibration_rms\\":"); Serial.print(vibration, 2); Serial.print(",");
    Serial.print("\\"current_draw\\":"); Serial.print(current_draw, 2); Serial.print(",");
    Serial.print("\\"rpm\\":"); Serial.print(rpm, 1); Serial.print(",");
    Serial.print("\\"button_state\\":"); Serial.print(button_state); Serial.print(",");
    Serial.print("\\"source\\":\\"esp32_usb\\"}");
    Serial.println(); // newline triggers parse
  }
}
`;

  const handleCopyCode = () => {
    navigator.clipboard.writeText(esp32SampleCode);
    setCopiedCode(true);
    setTimeout(() => setCopiedCode(false), 2000);
  };

  const currentTemp = latestPacket?.temperature ?? latestPacket?.parameters?.temperature ?? 33.0;
  const currentDraw = latestPacket?.current_draw ?? latestPacket?.parameters?.current_draw ?? 4.12;
  const currentRpm = latestPacket?.rpm ?? latestPacket?.parameters?.rpm ?? 1450;
  const currentHumidity = latestPacket?.humidity ?? latestPacket?.parameters?.humidity ?? 72;
  const isButtonPressed = Number(latestPacket?.button_state ?? latestPacket?.push_button) === 1;

  return (
    <div className={`rounded-2xl border border-white/10 bg-[#0b1120] p-6 text-slate-100 shadow-2xl ${className}`}>
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-5 border-b border-white/10">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <span className="inline-flex items-center gap-1.5 rounded-full border border-sky-500/30 bg-sky-500/10 px-3 py-0.5 text-[11px] font-semibold uppercase tracking-wider text-sky-400">
              <Usb className="h-3.5 w-3.5" />
              Persistent WebSerial Streamer
            </span>
            <span className="text-xs font-mono text-slate-400">Background USB Engine</span>
          </div>
          <h2 className="text-xl sm:text-2xl font-bold tracking-tight text-white flex items-center gap-2">
            Direct Microcontroller USB Connector
          </h2>
          <p className="mt-1 text-xs text-slate-400">
            Streams real-time sensor packets directly from your plugged ESP32 / Arduino. Runs continuously in the background across your entire dashboard.
          </p>
        </div>

        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2 px-3 py-1.5 rounded-xl border border-white/10 bg-black/40 font-mono text-xs">
            <span className={`h-2 w-2 rounded-full ${isConnected ? "bg-emerald-400 animate-pulse" : "bg-slate-500"}`} />
            <span className={isConnected ? "text-emerald-400 font-bold" : "text-slate-400"}>
              {isConnected ? `STREAMING TO ${selectedMachine}` : "DISCONNECTED"}
            </span>
          </div>

          {isConnected && (
            <Link
              href={`/dashboard/machines/${selectedMachine}`}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-black font-bold font-mono text-xs shadow-[0_0_15px_rgba(16,185,129,0.3)] transition-all"
            >
              <span>Visit Machine</span>
              <ChevronRight className="w-3.5 h-3.5" />
            </Link>
          )}

          {onClose && (
            <button
              onClick={onClose}
              className="p-2 rounded-xl border border-white/10 bg-white/5 hover:bg-white/10 text-slate-400 hover:text-white transition-all"
              title="Close panel (Stream continues in background)"
            >
              <X className="h-4 w-4" />
            </button>
          )}
        </div>
      </div>

      {/* Active Background Stream Banner */}
      {isConnected && (
        <div className="my-4 p-3.5 rounded-xl border border-emerald-500/40 bg-emerald-500/10 text-emerald-300 text-xs flex items-center justify-between gap-3">
          <div className="flex items-center gap-2.5 font-mono">
            <span className="w-2.5 h-2.5 rounded-full bg-emerald-400 animate-pulse" />
            <span className="font-bold">BACKGROUND STREAM ACTIVE:</span>
            <span>You can close this window or visit other dashboard tabs freely without losing connection.</span>
          </div>
          <Link
            href={`/dashboard/machines/${selectedMachine}`}
            className="px-3 py-1 rounded-lg bg-emerald-400 text-black font-bold text-xs font-mono shrink-0 hover:bg-white transition-colors"
          >
            Go to {selectedMachine} →
          </Link>
        </div>
      )}

      {/* Error Alert */}
      {errorMsg && (
        <div className="my-4 p-4 rounded-xl border border-red-500/30 bg-red-500/10 text-red-300 text-xs flex items-center justify-between">
          <div className="flex items-center gap-2">
            <AlertCircle className="h-4 w-4 text-red-400 flex-shrink-0" />
            <span>{errorMsg}</span>
          </div>
        </div>
      )}

      {/* Controls Bar */}
      <div className="my-5 grid grid-cols-1 md:grid-cols-4 gap-4 p-4 rounded-xl border border-white/10 bg-slate-900/60">
        {/* Machine Target */}
        <div>
          <label className="block text-[10px] uppercase font-mono tracking-wider text-slate-400 mb-1.5">
            Bind Telemetry To Machine
          </label>
          <select
            value={selectedMachine}
            onChange={(e) => setSelectedMachine(e.target.value)}
            disabled={isConnected}
            className="w-full bg-black/60 border border-white/10 rounded-lg px-3 py-2 text-xs font-mono text-white focus:outline-none focus:border-sky-500 disabled:opacity-50"
          >
            {!availableMachines.some((m) => m.id === selectedMachine) && (
              <option value={selectedMachine}>{selectedMachine} (Current Target)</option>
            )}
            {availableMachines.map((m) => (
              <option key={m.id} value={m.id}>
                {m.id} {m.name && m.name !== m.id ? `(${m.name})` : ""}
              </option>
            ))}
          </select>
        </div>

        {/* Baud Rate */}
        <div>
          <label className="block text-[10px] uppercase font-mono tracking-wider text-slate-400 mb-1.5">
            Serial Baud Rate
          </label>
          <select
            value={baudRate}
            onChange={(e) => setBaudRate(Number(e.target.value))}
            disabled={isConnected}
            className="w-full bg-black/60 border border-white/10 rounded-lg px-3 py-2 text-xs font-mono text-white focus:outline-none focus:border-sky-500 disabled:opacity-50"
          >
            <option value={115200}>115200 (ESP32 Standard)</option>
            <option value={9600}>9600 (Arduino Standard)</option>
            <option value={57600}>57600</option>
            <option value={230400}>230400 (High Speed)</option>
          </select>
        </div>

        {/* Backend Forwarding Toggle */}
        <div className="flex flex-col justify-center">
          <label className="block text-[10px] uppercase font-mono tracking-wider text-slate-400 mb-1.5">
            Sync To Backend (/api/iot/ingest)
          </label>
          <label className="flex items-center gap-2 cursor-pointer mt-1 text-xs font-medium text-slate-300">
            <input
              type="checkbox"
              checked={forwardToBackend}
              onChange={(e) => setForwardToBackend(e.target.checked)}
              className="accent-sky-500 h-4 w-4 rounded"
            />
            <span>Auto-forward to AI Models (2Hz)</span>
          </label>
        </div>

        {/* Connect Action Button */}
        <div className="flex items-end gap-2">
          {isConnected ? (
            <button
              onClick={handleDisconnect}
              className="w-full py-2.5 px-3 rounded-lg bg-red-500/20 text-red-300 border border-red-500/40 font-bold text-xs hover:bg-red-500/30 transition-all flex items-center justify-center gap-1.5 shadow-[0_0_15px_rgba(239,68,68,0.2)]"
            >
              <Power className="h-4 w-4" /> Disconnect USB
            </button>
          ) : (
            <button
              onClick={handleConnect}
              disabled={isConnecting || !isSupported}
              className="w-full py-2.5 px-4 rounded-lg bg-gradient-to-r from-sky-500 to-blue-600 text-white font-bold text-xs hover:brightness-110 transition-all flex items-center justify-center gap-2 shadow-[0_0_20px_rgba(56,189,248,0.3)] disabled:opacity-50"
            >
              {isConnecting ? <RefreshCw className="h-4 w-4 animate-spin" /> : <Usb className="h-4 w-4" />}
              {isConnecting ? "Connecting Port..." : "Connect USB Device"}
            </button>
          )}
        </div>
      </div>

      {/* Metrics Row */}
      <div className="grid grid-cols-2 md:grid-cols-6 gap-3 mb-5">
        <div className="rounded-xl border border-white/5 bg-slate-900/40 p-3">
          <span className="text-[10px] font-mono text-slate-400 uppercase">Packets Ingested</span>
          <div className="text-lg font-bold font-mono text-emerald-400 mt-1">{packetCount}</div>
        </div>

        <div className="rounded-xl border border-white/5 bg-slate-900/40 p-3">
          <span className="text-[10px] font-mono text-slate-400 uppercase">Cadence</span>
          <div className="text-lg font-bold font-mono text-sky-400 mt-1">{cadenceHz} Hz</div>
        </div>

        <div className="rounded-xl border border-white/5 bg-slate-900/40 p-3">
          <span className="text-[10px] font-mono text-slate-400 uppercase">DHT11 Temp</span>
          <div className="text-lg font-bold font-mono text-rose-300 mt-1">{Number(currentTemp).toFixed(1)}°C</div>
        </div>

        <div className="rounded-xl border border-white/5 bg-slate-900/40 p-3">
          <span className="text-[10px] font-mono text-slate-400 uppercase">ACS712 Current</span>
          <div className="text-lg font-bold font-mono text-amber-300 mt-1">{Number(currentDraw).toFixed(2)} A</div>
        </div>

        <div className="rounded-xl border border-white/5 bg-slate-900/40 p-3">
          <span className="text-[10px] font-mono text-slate-400 uppercase">Hall Speed</span>
          <div className="text-lg font-bold font-mono text-cyan-300 mt-1">{Math.round(currentRpm)} RPM</div>
        </div>

        <div className="rounded-xl border border-white/5 bg-slate-900/40 p-3">
          <span className="text-[10px] font-mono text-slate-400 uppercase">Push Button</span>
          <div className={`text-sm font-bold font-mono mt-1 ${isButtonPressed ? "text-emerald-400" : "text-slate-400"}`}>
            {isButtonPressed ? "🔴 PRESSED" : "⚪ RELEASED"}
          </div>
        </div>
      </div>

      {/* Real-Time Waveform Chart */}
      {realtimeHistory.length > 0 && (
        <div className="mb-5 p-4 rounded-xl border border-white/10 bg-slate-900/60">
          <div className="flex items-center justify-between mb-3 text-xs text-slate-400 font-mono">
            <span className="flex items-center gap-1.5 text-white font-bold">
              <ChartIcon className="w-4 h-4 text-sky-400" />
              Live Telemetry Waveform Trajectory (Rolling 50 Samples)
            </span>
            <span className="text-slate-500 text-[11px]">Hardware link: USB CDC Serial</span>
          </div>
          <div className="h-[200px] w-full">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={realtimeHistory} margin={{ top: 5, right: 10, left: -20, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" />
                <XAxis dataKey="time" tick={{ fill: "#94a3b8", fontSize: 10 }} />
                <YAxis yAxisId="analog" tick={{ fill: "#94a3b8", fontSize: 10 }} domain={[0, 60]} />
                <YAxis yAxisId="rpm" orientation="right" tick={{ fill: "#38bdf8", fontSize: 10 }} domain={[0, 2000]} />
                <Tooltip
                  contentStyle={{ backgroundColor: "#0b121e", borderColor: "rgba(255,255,255,0.15)", borderRadius: "8px", fontSize: "11px" }}
                />
                <Legend wrapperStyle={{ fontSize: "11px" }} />
                <Line yAxisId="analog" type="monotone" dataKey="temperature" stroke="#f43f5e" dot={false} strokeWidth={2} name="Temp (°C)" />
                <Line yAxisId="analog" type="monotone" dataKey="current" stroke="#f59e0b" dot={false} strokeWidth={2} name="Current (A)" />
                <Line yAxisId="rpm" type="monotone" dataKey="rpm" stroke="#00d4aa" dot={false} strokeWidth={2} name="Hall RPM" />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>
      )}

      {/* Raw Serial Monitor */}
      <div className="rounded-xl border border-white/10 bg-black/60 overflow-hidden">
        <div className="p-3 border-b border-white/10 flex items-center justify-between bg-white/2">
          <div className="flex items-center gap-2 text-xs font-mono text-slate-300">
            <Terminal className="h-3.5 w-3.5 text-sky-400" />
            <span>Raw Serial Monitor ({logs.length} entries)</span>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setIsPaused(!isPaused)}
              className="text-[11px] font-mono px-2 py-1 rounded bg-white/5 hover:bg-white/10 text-slate-300 flex items-center gap-1"
            >
              {isPaused ? <Play className="w-3 h-3 text-emerald-400" /> : <Pause className="w-3 h-3 text-amber-400" />}
              {isPaused ? "Resume" : "Pause"}
            </button>
            <button
              onClick={clearLogs}
              className="text-[11px] font-mono px-2 py-1 rounded bg-white/5 hover:bg-white/10 text-slate-400 hover:text-white flex items-center gap-1"
            >
              <Trash2 className="w-3 h-3" /> Clear
            </button>
          </div>
        </div>

        <div
          ref={logsContainerRef}
          className="h-44 overflow-y-auto p-3 font-mono text-xs text-slate-300 space-y-1 custom-scrollbar"
        >
          {logs.length === 0 ? (
            <div className="text-slate-500 italic py-6 text-center">
              Waiting for serial data. Plug ESP32 into USB and click "Connect USB Device" above...
            </div>
          ) : (
            logs.map((log) => (
              <div
                key={log.id}
                className={`leading-relaxed whitespace-pre-wrap ${
                  log.type === "json"
                    ? "text-emerald-300"
                    : log.type === "report"
                    ? "text-cyan-300"
                    : log.type === "error"
                    ? "text-red-400"
                    : "text-slate-400"
                }`}
              >
                <span className="text-slate-600 mr-2 select-none">[{log.time}]</span>
                {log.text}
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
