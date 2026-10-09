"use client";

import React, { useState, useEffect, useRef, useCallback } from "react";
import {
  Usb, Terminal, Zap, Activity, AlertTriangle, ShieldCheck, CheckCircle2,
  RefreshCw, Power, Radio, Copy, Check, Info, ArrowUpRight, ChevronRight, X
} from "lucide-react";
import { api } from "@/lib/api";

interface WebSerialDirectConnectorProps {
  initialMachineId?: string;
  onClose?: () => void;
  className?: string;
}

interface ParsedTelemetry {
  equipment_id?: string;
  temperature?: number;
  vibration?: number;
  vibration_rms?: number;
  current_draw?: number;
  voltage?: number;
  humidity?: number;
  h2?: number;
  ch4?: number;
  c2h4?: number;
  c2h2?: number;
  timestamp?: string;
  [key: string]: any;
}

export function WebSerialDirectConnector({
  initialMachineId = "SGT-TERM-01",
  onClose,
  className = ""
}: WebSerialDirectConnectorProps) {
  // Machine Selection
  const [selectedMachine, setSelectedMachine] = useState(initialMachineId);
  const [baudRate, setBaudRate] = useState(115200);
  const [forwardToBackend, setForwardToBackend] = useState(true);

  // Connection State
  const [isSupported, setIsSupported] = useState(true);
  const [isConnected, setIsConnected] = useState(false);
  const [isConnecting, setIsConnecting] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // Telemetry & Metrics
  const [packetCount, setPacketCount] = useState(0);
  const [cadenceHz, setCadenceHz] = useState(0);
  const [latestPacket, setLatestPacket] = useState<ParsedTelemetry | null>(null);
  const [logs, setLogs] = useState<Array<{ time: string; text: string; type: "raw" | "json" | "error" | "sys" }>>([]);
  const [autoScroll, setAutoScroll] = useState(true);
  const [copiedCode, setCopiedCode] = useState(false);

  // References for Serial Port & Stream
  const portRef = useRef<any>(null);
  const readerRef = useRef<any>(null);
  const isReadingRef = useRef(false);
  const logsContainerRef = useRef<HTMLDivElement>(null);
  const packetCountRef = useRef(0);
  const lastPacketTimeRef = useRef(Date.now());

  // Check WebSerial API Support on client
  useEffect(() => {
    if (typeof window !== "undefined") {
      setIsSupported("serial" in navigator);
    }
  }, []);

  // Compute Cadence (Hz)
  useEffect(() => {
    const interval = setInterval(() => {
      const now = Date.now();
      const elapsed = (now - lastPacketTimeRef.current) / 1000;
      if (elapsed > 3) {
        setCadenceHz(0);
      }
    }, 1000);
    return () => clearInterval(interval);
  }, []);

  // Auto-scroll logs
  useEffect(() => {
    if (autoScroll && logsContainerRef.current) {
      logsContainerRef.current.scrollTop = logsContainerRef.current.scrollHeight;
    }
  }, [logs, autoScroll]);

  const addLog = useCallback((text: string, type: "raw" | "json" | "error" | "sys" = "raw") => {
    const time = new Date().toLocaleTimeString();
    setLogs((prev) => [...prev.slice(-150), { time, text, type }]);
  }, []);

  // Process incoming line from Serial Port
  const handleIncomingLine = useCallback(async (rawLine: string) => {
    if (!rawLine.trim()) return;

    // Check if line contains JSON
    let jsonStr = "";
    if (rawLine.includes("{") && rawLine.includes("}")) {
      const start = rawLine.indexOf("{");
      const end = rawLine.lastIndexOf("}");
      jsonStr = rawLine.slice(start, end + 1);
    }

    if (jsonStr) {
      try {
        const parsed = JSON.parse(jsonStr) as ParsedTelemetry;
        setLatestPacket(parsed);
        setPacketCount((c) => c + 1);
        packetCountRef.current += 1;

        const now = Date.now();
        const delta = (now - lastPacketTimeRef.current) / 1000;
        if (delta > 0 && delta < 5) {
          setCadenceHz(parseFloat((1 / delta).toFixed(1)));
        }
        lastPacketTimeRef.current = now;

        addLog(`[JSON] ${JSON.stringify(parsed)}`, "json");

        // Forward to production backend if enabled
        if (forwardToBackend) {
          try {
            await api.ingestTelemetry({
              equipment_id: parsed.equipment_id || selectedMachine,
              temperature: parsed.temperature ?? (parsed.parameters?.temperature ?? null),
              vibration: parsed.vibration ?? parsed.vibration_rms ?? (parsed.parameters?.vibration_rms ?? null),
              parameters: parsed.parameters || parsed,
              timestamp: new Date().toISOString(),
              source: "browser_webserial_usb"
            });
          } catch (backendErr) {
            console.warn("Backend forward error:", backendErr);
          }
        }
        return;
      } catch {
        // Fallback to raw log
      }
    }

    addLog(rawLine, "raw");
  }, [selectedMachine, forwardToBackend, addLog]);

  // Connect via WebSerial API
  const handleConnect = async () => {
    setErrorMsg(null);
    setIsConnecting(true);

    try {
      if (!("serial" in navigator)) {
        throw new Error("WebSerial API is not supported in this browser. Please use Google Chrome, Edge, or Brave.");
      }

      // Request port from user
      const port = await (navigator as any).serial.requestPort();
      await port.open({ baudRate: Number(baudRate) });

      portRef.current = port;
      setIsConnected(true);
      isReadingRef.current = true;
      addLog(`[SYSTEM] Connected to USB Serial Port at ${baudRate} baud.`, "sys");

      // Read loop with TextDecoder
      const textDecoder = new TextDecoderStream();
      port.readable.pipeTo(textDecoder.writable).catch(() => {});
      const reader = textDecoder.readable.getReader();
      readerRef.current = reader;

      let lineBuffer = "";

      while (isReadingRef.current) {
        const { value, done } = await reader.read();
        if (done) {
          break;
        }
        if (value) {
          lineBuffer += value;
          const lines = lineBuffer.split("\n");
          lineBuffer = lines.pop() || "";
          for (const line of lines) {
            handleIncomingLine(line.replace(/\r/g, ""));
          }
        }
      }
    } catch (err: any) {
      if (err.name !== "NotFoundError") {
        setErrorMsg(err.message || "Failed to open serial port.");
        addLog(`[ERROR] ${err.message || "Failed to open serial port."}`, "error");
      }
    } finally {
      setIsConnecting(false);
    }
  };

  // Disconnect cleanly
  const handleDisconnect = async () => {
    isReadingRef.current = false;
    try {
      if (readerRef.current) {
        await readerRef.current.cancel();
        readerRef.current = null;
      }
      if (portRef.current) {
        await portRef.current.close();
        portRef.current = null;
      }
      addLog("[SYSTEM] USB Serial Port disconnected.", "sys");
    } catch (err: any) {
      console.warn("Error during serial close:", err);
    } finally {
      setIsConnected(false);
      setCadenceHz(0);
    }
  };

  // Arduino Sketch template
  const esp32SampleCode = `// ==============================================================================
// SOVEREIGN PREDICTIVE MAINTENANCE: ESP32 DIRECT USB SERIAL TELEMETRY
// Baud Rate: ${baudRate} | Target Machine: ${selectedMachine}
// ==============================================================================

#define MACHINE_ID "${selectedMachine}"
const unsigned long INTERVAL_MS = 1000; // 1-second transmission rate

void setup() {
  Serial.begin(${baudRate});
  while (!Serial);
  delay(500);
  Serial.println("[READY] ESP32 WebSerial Telemetry Node Initialized");
}

void loop() {
  static unsigned long lastSend = 0;
  if (millis() - lastSend >= INTERVAL_MS) {
    lastSend = millis();

    // 1. Read sensors (e.g. DHT11 / Hall Sensor / ACS712)
    // Replace with your real pin reads:
    float temperature = 42.5 + (random(-5, 5) * 0.1); 
    float vibration = 1.82 + (random(-3, 3) * 0.05);
    float current_draw = 5.15 + (random(-2, 2) * 0.02);

    // 2. Stream compact JSON line to Serial port
    Serial.print("{\\"equipment_id\\":\\"" MACHINE_ID "\\",");
    Serial.print("\\"temperature\\":"); Serial.print(temperature, 2); Serial.print(",");
    Serial.print("\\"vibration\\":"); Serial.print(vibration, 2); Serial.print(",");
    Serial.print("\\"current_draw\\":"); Serial.print(current_draw, 2); Serial.print(",");
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

  return (
    <div className={`rounded-2xl border border-white/10 bg-[#0b1120] p-6 text-slate-100 shadow-2xl ${className}`}>
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-5 border-b border-white/10">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <span className="inline-flex items-center gap-1.5 rounded-full border border-sky-500/30 bg-sky-500/10 px-3 py-0.5 text-[11px] font-semibold uppercase tracking-wider text-sky-400">
              <Usb className="h-3.5 w-3.5" />
              Approach 2 • Direct Browser USB
            </span>
            <span className="text-xs font-mono text-slate-400">WebSerial API Engine</span>
          </div>
          <h2 className="text-xl sm:text-2xl font-bold tracking-tight text-white flex items-center gap-2">
            Direct Microcontroller USB Connector
          </h2>
          <p className="mt-1 text-xs text-slate-400">
            Streams real-time sensor packets directly from your plugged ESP32 / Arduino into this Next.js dashboard without requiring any external bridge scripts.
          </p>
        </div>

        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2 px-3 py-1.5 rounded-xl border border-white/10 bg-black/40 font-mono text-xs">
            <span className={`h-2 w-2 rounded-full ${isConnected ? "bg-emerald-400 animate-pulse" : "bg-slate-500"}`} />
            <span className={isConnected ? "text-emerald-400 font-bold" : "text-slate-400"}>
              {isConnected ? "LIVE STREAMING" : "DISCONNECTED"}
            </span>
          </div>
          {onClose && (
            <button onClick={onClose} className="p-2 rounded-xl border border-white/10 bg-white/5 hover:bg-white/10 text-slate-400 hover:text-white transition-all">
              <X className="h-4 w-4" />
            </button>
          )}
        </div>
      </div>

      {/* Browser Support Check */}
      {!isSupported && (
        <div className="my-4 p-4 rounded-xl border border-amber-500/30 bg-amber-500/10 text-amber-300 text-xs flex items-start gap-3">
          <AlertTriangle className="h-5 w-5 flex-shrink-0 text-amber-400 mt-0.5" />
          <div>
            <span className="font-bold block mb-0.5">WebSerial Not Detected in this Browser</span>
            WebSerial is currently supported on <strong>Google Chrome</strong>, <strong>Microsoft Edge</strong>, and <strong>Brave</strong> on Desktop. If you are using Firefox or Safari, switch to Chrome or use Approach 1 (WiFi Ingestion).
          </div>
        </div>
      )}

      {/* Error Alert */}
      {errorMsg && (
        <div className="my-4 p-4 rounded-xl border border-red-500/30 bg-red-500/10 text-red-300 text-xs flex items-center justify-between">
          <div className="flex items-center gap-2">
            <AlertTriangle className="h-4 w-4 text-red-400" />
            <span>{errorMsg}</span>
          </div>
          <button onClick={() => setErrorMsg(null)} className="text-red-400 hover:text-white">
            <X className="h-4 w-4" />
          </button>
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
            <option value="SGT-TERM-01">SGT-TERM-01 (Dataset 1: Terminal Breaker)</option>
            <option value="XFMR-315MVA-01">XFMR-315MVA-01 (Dataset 2: Sensformer)</option>
            <option value="CNC-MILL-01">CNC-MILL-01 (Haas VF-2 CNC)</option>
            <option value="ROBOT-ARM-01">ROBOT-ARM-01 (KUKA KR-16)</option>
            <option value="PUMP-01">PUMP-01 (Centrifugal Slurry Pump)</option>
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
            <span>Auto-forward to AI Models</span>
          </label>
        </div>

        {/* Connect Action Button */}
        <div className="flex items-end">
          {isConnected ? (
            <button
              onClick={handleDisconnect}
              className="w-full py-2.5 px-4 rounded-lg bg-red-500/20 text-red-300 border border-red-500/40 font-bold text-xs hover:bg-red-500/30 transition-all flex items-center justify-center gap-2 shadow-[0_0_15px_rgba(239,68,68,0.2)]"
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
              {isConnecting ? "Selecting Port..." : "Connect USB Device"}
            </button>
          )}
        </div>
      </div>

      {/* Live Metrics HUD */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-5 font-mono text-center">
        <div className="p-3 rounded-xl border border-white/8 bg-black/30">
          <span className="text-[10px] uppercase text-slate-400 block mb-0.5">Packets Received</span>
          <span className="text-xl font-bold text-white">{packetCount}</span>
        </div>
        <div className="p-3 rounded-xl border border-white/8 bg-black/30">
          <span className="text-[10px] uppercase text-slate-400 block mb-0.5">Cadence (Rate)</span>
          <span className="text-xl font-bold text-sky-400">{cadenceHz} Hz</span>
        </div>
        <div className="p-3 rounded-xl border border-white/8 bg-black/30">
          <span className="text-[10px] uppercase text-slate-400 block mb-0.5">Live Temperature</span>
          <span className="text-xl font-bold text-amber-300">
            {latestPacket?.temperature !== undefined ? `${latestPacket.temperature}°C` : "--"}
          </span>
        </div>
        <div className="p-3 rounded-xl border border-white/8 bg-black/30">
          <span className="text-[10px] uppercase text-slate-400 block mb-0.5">Vibration / Current</span>
          <span className="text-xl font-bold text-emerald-400">
            {latestPacket?.vibration !== undefined
              ? `${latestPacket.vibration} mm/s`
              : latestPacket?.current_draw !== undefined
              ? `${latestPacket.current_draw} A`
              : "--"}
          </span>
        </div>
      </div>

      {/* Terminal Output & Code Carousel */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
        {/* Terminal Monitor (2 cols) */}
        <div className="lg:col-span-2 rounded-xl border border-white/10 bg-black/80 flex flex-col h-72">
          <div className="px-3 py-2 border-b border-white/10 flex items-center justify-between text-xs text-slate-400 font-mono bg-slate-900/40">
            <span className="flex items-center gap-1.5 text-slate-300 font-semibold">
              <Terminal className="h-3.5 w-3.5 text-sky-400" />
              Raw Serial Monitor
            </span>
            <div className="flex items-center gap-3 text-[11px]">
              <label className="flex items-center gap-1 cursor-pointer">
                <input
                  type="checkbox"
                  checked={autoScroll}
                  onChange={(e) => setAutoScroll(e.target.checked)}
                  className="accent-sky-500 h-3 w-3"
                />
                <span>Auto-scroll</span>
              </label>
              <button
                onClick={() => setLogs([])}
                className="hover:text-white transition-colors"
              >
                Clear
              </button>
            </div>
          </div>
          <div
            ref={logsContainerRef}
            className="flex-1 p-3 overflow-y-auto font-mono text-[11px] space-y-1 select-text"
          >
            {logs.length === 0 ? (
              <div className="text-slate-600 italic py-8 text-center">
                Waiting for serial data. Plug ESP32 into USB and click &quot;Connect USB Device&quot; above...
              </div>
            ) : (
              logs.map((log, idx) => (
                <div key={idx} className="flex gap-2 leading-relaxed">
                  <span className="text-slate-600 select-none">[{log.time}]</span>
                  <span
                    className={
                      log.type === "json"
                        ? "text-emerald-400 font-semibold"
                        : log.type === "sys"
                        ? "text-sky-300"
                        : log.type === "error"
                        ? "text-red-400 font-semibold"
                        : "text-slate-300"
                    }
                  >
                    {log.text}
                  </span>
                </div>
              ))
            )}
          </div>
        </div>

        {/* Quick Arduino Code snippet */}
        <div className="rounded-xl border border-white/10 bg-slate-900/60 p-4 flex flex-col justify-between h-72">
          <div>
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-bold uppercase tracking-wider text-slate-300 flex items-center gap-1.5">
                <Copy className="h-3.5 w-3.5 text-sky-400" />
                ESP32 Flash Sketch
              </span>
              <button
                onClick={handleCopyCode}
                className="text-[11px] font-mono text-sky-400 hover:text-sky-300 flex items-center gap-1 bg-sky-500/10 px-2 py-0.5 rounded border border-sky-500/20"
              >
                {copiedCode ? <Check className="h-3 w-3 text-emerald-400" /> : <Copy className="h-3 w-3" />}
                {copiedCode ? "Copied!" : "Copy Code"}
              </button>
            </div>
            <p className="text-[11px] text-slate-400 mb-2 leading-relaxed">
              Flash this code to your ESP32 in Arduino IDE. It transmits telemetry JSON over USB at 115200 baud once per second.
            </p>
            <pre className="text-[10px] font-mono bg-black/60 p-2.5 rounded-lg border border-white/5 text-slate-300 overflow-x-auto max-h-40">
              {esp32SampleCode}
            </pre>
          </div>
        </div>
      </div>
    </div>
  );
}
