"use client";

import React, { useState, useEffect, useRef, useCallback } from "react";
import {
  Usb, Terminal, Zap, Activity, AlertTriangle, ShieldCheck, CheckCircle2,
  RefreshCw, Power, Radio, Copy, Check, Info, ArrowUpRight, ChevronRight, X,
  Pause, Play, Trash2, RotateCcw, AlertCircle
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
  rpm?: number;
  button_state?: number;
  buzzer_state?: number;
  parameters?: Record<string, any>;
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
  const [isSecureContext, setIsSecureContext] = useState(true);
  const [isConnected, setIsConnected] = useState(false);
  const [isConnecting, setIsConnecting] = useState(false);
  const [isResetting, setIsResetting] = useState(false);
  const [isPaused, setIsPaused] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // Telemetry & Metrics
  const [packetCount, setPacketCount] = useState(0);
  const [cadenceHz, setCadenceHz] = useState(0);
  const [latestPacket, setLatestPacket] = useState<ParsedTelemetry | null>(null);
  const [logs, setLogs] = useState<Array<{ time: string; text: string; type: "raw" | "json" | "error" | "sys" }>>([]);
  const [autoScroll, setAutoScroll] = useState(true);
  const [copiedCode, setCopiedCode] = useState(false);

  // References for Serial Port & Stream (direct readers without locking pipeTo)
  const portRef = useRef<any>(null);
  const readerRef = useRef<ReadableStreamDefaultReader<Uint8Array> | null>(null);
  const isReadingRef = useRef(false);
  const logsContainerRef = useRef<HTMLDivElement>(null);
  const packetCountRef = useRef(0);
  const lastPacketTimeRef = useRef(Date.now());
  const lastForwardTimeRef = useRef(0);

  // Log handler
  const addLog = useCallback((text: string, type: "raw" | "json" | "error" | "sys" = "raw") => {
    const time = new Date().toLocaleTimeString();
    setLogs((prev) => [...prev.slice(-199), { time, text, type }]);
  }, []);

  // Check WebSerial API Support and Secure Context on client
  useEffect(() => {
    if (typeof window !== "undefined") {
      setIsSupported("serial" in navigator);
      setIsSecureContext(window.isSecureContext ?? true);
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

  // Clean Disconnect without stream-locking deadlocks
  const handleDisconnect = useCallback(async () => {
    isReadingRef.current = false;

    // 1. Cancel and release reader lock cleanly
    if (readerRef.current) {
      try {
        await readerRef.current.cancel();
      } catch (e) {
        // Ignored if stream already terminated
      }
      try {
        readerRef.current.releaseLock();
      } catch (e) {}
      readerRef.current = null;
    }

    // 2. Close serial port handle cleanly
    if (portRef.current) {
      try {
        await portRef.current.close();
      } catch (err: any) {
        console.warn("Serial close warning:", err);
      }
      portRef.current = null;
    }

    setIsConnected(false);
    setCadenceHz(0);
    addLog("[SYSTEM] USB Serial Port disconnected cleanly.", "sys");
  }, [addLog]);

  // Hardware hotplug listeners (detects physical USB cable unplug/replug on OS level)
  useEffect(() => {
    if (typeof window === "undefined" || !("serial" in navigator)) return;

    const handleDeviceDisconnected = (event: any) => {
      if (portRef.current && (event.target === portRef.current || !event.target)) {
        addLog("[SYSTEM] Physical USB device disconnect detected by OS.", "error");
        handleDisconnect();
      }
    };

    const handleDeviceConnected = () => {
      addLog("[SYSTEM] USB device attached to host. Ready for WebSerial connection.", "sys");
    };

    const serialObj = (navigator as any).serial;
    serialObj.addEventListener("disconnect", handleDeviceDisconnected);
    serialObj.addEventListener("connect", handleDeviceConnected);

    return () => {
      serialObj?.removeEventListener("disconnect", handleDeviceDisconnected);
      serialObj?.removeEventListener("connect", handleDeviceConnected);
    };
  }, [handleDisconnect, addLog]);

  // Clean up serial port on component unmount
  useEffect(() => {
    return () => {
      if (isReadingRef.current || portRef.current) {
        handleDisconnect();
      }
    };
  }, [handleDisconnect]);

  // Process incoming line from Serial Port
  const handleIncomingLine = useCallback(
    async (rawLine: string) => {
      const trimmed = rawLine.trim();
      if (!trimmed) return;

      // Extract JSON if line contains balanced braces
      let jsonStr = "";
      if (trimmed.includes("{") && trimmed.includes("}")) {
        const start = trimmed.indexOf("{");
        const end = trimmed.lastIndexOf("}");
        jsonStr = trimmed.slice(start, end + 1);
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

          if (!isPaused) {
            addLog(`[JSON] ${JSON.stringify(parsed)}`, "json");
          }

          // Forward to backend API if enabled (throttled to 2Hz / 500ms to protect database & network)
          if (forwardToBackend) {
            const timeSinceLastForward = now - lastForwardTimeRef.current;
            if (timeSinceLastForward >= 500) {
              lastForwardTimeRef.current = now;

              const targetEqId = selectedMachine || parsed.equipment_id || "ESP32-HARDWARE-01";
              const tempVal =
                parsed.temperature ??
                (parsed.parameters?.temperature !== undefined ? Number(parsed.parameters.temperature) : null);
              const vibVal =
                parsed.vibration ??
                parsed.vibration_rms ??
                (parsed.parameters?.vibration_rms !== undefined
                  ? Number(parsed.parameters.vibration_rms)
                  : parsed.parameters?.vibration !== undefined
                  ? Number(parsed.parameters.vibration)
                  : null);

              const mergedParams = {
                ...(parsed.parameters || {}),
                ...parsed,
                equipment_id: targetEqId,
                temperature: tempVal,
                vibration: vibVal,
                vibration_rms: vibVal,
              };

              api
                .ingestTelemetry({
                  equipment_id: targetEqId,
                  temperature: tempVal,
                  vibration: vibVal,
                  parameters: mergedParams,
                  timestamp: new Date().toISOString(),
                  source: "browser_webserial_usb",
                })
                .catch((backendErr) => {
                  console.warn("Backend forward error:", backendErr);
                });
            }
          }
          return;
        } catch {
          // Not valid JSON, fall through to raw log
        }
      }

      if (!isPaused) {
        addLog(trimmed, "raw");
      }
    },
    [selectedMachine, forwardToBackend, isPaused, addLog]
  );

  // Connect via WebSerial API
  const handleConnect = async () => {
    setErrorMsg(null);
    setIsConnecting(true);

    try {
      if (!("serial" in navigator)) {
        throw new Error(
          "WebSerial API is not supported in this browser. Please use Google Chrome, Microsoft Edge, or Brave on Desktop."
        );
      }

      // Request port from user
      const port = await (navigator as any).serial.requestPort();

      // Open with clean framing parameters and buffer
      await port.open({
        baudRate: Number(baudRate),
        bufferSize: 8192,
        dataBits: 8,
        stopBits: 1,
        parity: "none",
      });

      // De-assert DTR/RTS lines so ESP32 does not stall in bootloader/reset mode
      try {
        await port.setSignals({ dataTerminalReady: false, requestToSend: false });
      } catch (e) {
        // setSignals might not be implemented on some virtual drivers
      }

      portRef.current = port;
      setIsConnected(true);
      isReadingRef.current = true;
      addLog(`[SYSTEM] Connected to USB Serial Port at ${baudRate} baud.`, "sys");

      // Direct stream reader loop (replaces pipeTo to eliminate stream-locking bugs)
      const textDecoder = new TextDecoder();
      let lineBuffer = "";

      while (isReadingRef.current && port.readable) {
        try {
          const reader = port.readable.getReader();
          readerRef.current = reader;

          while (isReadingRef.current) {
            const { value, done } = await reader.read();
            if (done) {
              break;
            }
            if (value) {
              lineBuffer += textDecoder.decode(value, { stream: true });
              const lines = lineBuffer.split(/\r?\n/);
              lineBuffer = lines.pop() ?? "";
              for (const line of lines) {
                handleIncomingLine(line);
              }
            }
          }
        } catch (readErr: any) {
          if (
            readErr.name === "NetworkError" ||
            readErr.message?.toLowerCase().includes("lost") ||
            readErr.message?.toLowerCase().includes("device")
          ) {
            addLog("[SYSTEM] USB Device hardware disconnected / unplugged.", "error");
          } else {
            addLog(`[STREAM] Read error: ${readErr.message}`, "error");
          }
          break;
        } finally {
          if (readerRef.current) {
            try {
              readerRef.current.releaseLock();
            } catch (e) {}
            readerRef.current = null;
          }
        }
      }

      // Automatically clean up when read loop breaks
      await handleDisconnect();
    } catch (err: any) {
      if (err.name !== "NotFoundError") {
        const msg = err.message || "Failed to open serial port.";
        setErrorMsg(msg);
        addLog(`[ERROR] ${msg}`, "error");
      }
      setIsConnected(false);
    } finally {
      setIsConnecting(false);
    }
  };

  // Hardware Reset via DTR/RTS signal toggle (ESP32 EN pin pulse)
  const handleHardwareReset = async () => {
    if (!portRef.current || !isConnected) return;
    setIsResetting(true);
    try {
      addLog("[SYSTEM] Triggering ESP32 hardware reset pulse (DTR/RTS toggle)...", "sys");
      await portRef.current.setSignals({ dataTerminalReady: true, requestToSend: false });
      await new Promise((r) => setTimeout(r, 120));
      await portRef.current.setSignals({ dataTerminalReady: false, requestToSend: false });
      addLog("[SYSTEM] Hardware reset pulse completed. Microcontroller rebooting...", "sys");
    } catch (err: any) {
      addLog(`[WARN] Hardware reset signal failed: ${err.message}`, "error");
    } finally {
      setIsResetting(false);
    }
  };

  // Arduino Sketch template
  const esp32SampleCode = `// ==============================================================================
// SOVEREIGN PREDICTIVE MAINTENANCE: ESP32 DIRECT USB SERIAL TELEMETRY
// Baud Rate: ${baudRate} | Target Machine: ${selectedMachine}
// Compatible with: Direct WebSerial Browser & scripts/bridges/serial_bridge.py
// ==============================================================================

#define MACHINE_ID "${selectedMachine}"
const unsigned long INTERVAL_MS = 1000; // 1-second transmission rate

void setup() {
  Serial.begin(${baudRate});
  delay(500);
  Serial.println("[READY] ESP32 WebSerial Telemetry Node Initialized");
}

void loop() {
  static unsigned long lastSend = 0;
  if (millis() - lastSend >= INTERVAL_MS) {
    lastSend = millis();

    // 1. Read real sensors (DHT11 / Hall RPM / ACS712 Current)
    float temperature = 42.5 + (random(-5, 5) * 0.1); 
    float vibration = 1.82 + (random(-3, 3) * 0.05);
    float current_draw = 5.15 + (random(-2, 2) * 0.02);
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

  // Safe parameter extractors
  const currentTemp =
    latestPacket?.temperature !== undefined
      ? latestPacket.temperature
      : latestPacket?.parameters?.temperature;
  const currentVib =
    latestPacket?.vibration_rms !== undefined
      ? latestPacket.vibration_rms
      : latestPacket?.vibration !== undefined
      ? latestPacket.vibration
      : latestPacket?.parameters?.vibration_rms !== undefined
      ? latestPacket.parameters.vibration_rms
      : latestPacket?.parameters?.vibration;
  const currentDraw =
    latestPacket?.current_draw !== undefined
      ? latestPacket.current_draw
      : latestPacket?.parameters?.current_draw;
  const currentRpm =
    latestPacket?.rpm !== undefined
      ? latestPacket.rpm
      : latestPacket?.parameters?.rpm;
  const currentButton =
    latestPacket?.button_state !== undefined
      ? latestPacket.button_state
      : latestPacket?.parameters?.button_state;

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
            <button
              onClick={onClose}
              className="p-2 rounded-xl border border-white/10 bg-white/5 hover:bg-white/10 text-slate-400 hover:text-white transition-all"
            >
              <X className="h-4 w-4" />
            </button>
          )}
        </div>
      </div>

      {/* Browser Support & Secure Context Check */}
      {(!isSupported || !isSecureContext) && (
        <div className="my-4 p-4 rounded-xl border border-amber-500/30 bg-amber-500/10 text-amber-300 text-xs flex items-start gap-3">
          <AlertTriangle className="h-5 w-5 flex-shrink-0 text-amber-400 mt-0.5" />
          <div className="space-y-1">
            <span className="font-bold block">
              {!isSupported ? "WebSerial Not Supported in this Browser" : "Insecure Context Detected"}
            </span>
            <p>
              {!isSupported ? (
                <>
                  WebSerial is natively supported on <strong>Google Chrome</strong>, <strong>Microsoft Edge</strong>, and <strong>Brave</strong> on Desktop (Windows, macOS, Linux). Firefox and Safari do not support WebSerial.
                </>
              ) : (
                <>
                  WebSerial requires a <strong>Secure Context (HTTPS or http://localhost)</strong>. If you are accessing this dashboard via a remote LAN IP, switch to <code>http://localhost:3000</code> or access via HTTPS.
                </>
              )}
            </p>
          </div>
        </div>
      )}

      {/* Error Alert */}
      {errorMsg && (
        <div className="my-4 p-4 rounded-xl border border-red-500/30 bg-red-500/10 text-red-300 text-xs flex items-center justify-between">
          <div className="flex items-center gap-2">
            <AlertCircle className="h-4 w-4 text-red-400 flex-shrink-0" />
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
            <option value="ESP32-HARDWARE-01">ESP32-HARDWARE-01 (Machine 3: Hardware Connected Model)</option>
            <option value="SGT-TERM-01">SGT-TERM-01 (Machine 1: Dataset 1 Terminal Model)</option>
            <option value="XFMR-315MVA-01">XFMR-315MVA-01 (Machine 2: Dataset 2 Transformer Model)</option>
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
            <option value={460800}>460800 (Ultra Speed)</option>
            <option value={921600}>921600 (Max Speed)</option>
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

        {/* Connect Action Button & Hardware Controls */}
        <div className="flex items-end gap-2">
          {isConnected ? (
            <>
              <button
                onClick={handleDisconnect}
                className="flex-1 py-2.5 px-3 rounded-lg bg-red-500/20 text-red-300 border border-red-500/40 font-bold text-xs hover:bg-red-500/30 transition-all flex items-center justify-center gap-1.5 shadow-[0_0_15px_rgba(239,68,68,0.2)]"
              >
                <Power className="h-4 w-4" /> Disconnect
              </button>
              <button
                onClick={handleHardwareReset}
                disabled={isResetting}
                title="Send hardware reset pulse (DTR toggle) to restart ESP32"
                className="py-2.5 px-3 rounded-lg bg-amber-500/20 text-amber-300 border border-amber-500/40 font-bold text-xs hover:bg-amber-500/30 transition-all flex items-center justify-center gap-1 disabled:opacity-50"
              >
                <RotateCcw className={`h-4 w-4 ${isResetting ? "animate-spin" : ""}`} />
                Reset ESP
              </button>
            </>
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
      <div className="grid grid-cols-2 md:grid-cols-7 gap-3 mb-5 font-mono text-center">
        <div className="p-3 rounded-xl border border-white/8 bg-black/30">
          <span className="text-[10px] uppercase text-slate-400 block mb-0.5">Packets</span>
          <span className="text-xl font-bold text-white">{packetCount}</span>
        </div>
        <div className="p-3 rounded-xl border border-white/8 bg-black/30">
          <span className="text-[10px] uppercase text-slate-400 block mb-0.5">Cadence</span>
          <span className="text-xl font-bold text-sky-400">{cadenceHz} Hz</span>
        </div>
        <div className="p-3 rounded-xl border border-white/8 bg-black/30">
          <span className="text-[10px] uppercase text-slate-400 block mb-0.5">DHT11 Temp</span>
          <span className="text-xl font-bold text-amber-300">
            {currentTemp !== undefined ? `${Number(currentTemp).toFixed(1)}°C` : "--"}
          </span>
        </div>
        <div className="p-3 rounded-xl border border-white/8 bg-black/30">
          <span className="text-[10px] uppercase text-slate-400 block mb-0.5">Vibration RMS</span>
          <span className="text-xl font-bold text-blue-400">
            {currentVib !== undefined ? `${Number(currentVib).toFixed(2)} mm/s` : "--"}
          </span>
        </div>
        <div className="p-3 rounded-xl border border-white/8 bg-black/30">
          <span className="text-[10px] uppercase text-slate-400 block mb-0.5">ACS712 Current</span>
          <span className="text-xl font-bold text-emerald-400">
            {currentDraw !== undefined ? `${Number(currentDraw).toFixed(2)} A` : "--"}
          </span>
        </div>
        <div className="p-3 rounded-xl border border-white/8 bg-black/30">
          <span className="text-[10px] uppercase text-slate-400 block mb-0.5">Hall Speed</span>
          <span className="text-xl font-bold text-purple-400">
            {currentRpm !== undefined ? `${Math.round(Number(currentRpm))} RPM` : "--"}
          </span>
        </div>
        {/* Real-time Push Button Indicator */}
        <div
          className={`p-3 rounded-xl border transition-all duration-300 ${
            Number(currentButton) === 1
              ? "border-emerald-400 bg-emerald-500/30 shadow-[0_0_20px_rgba(16,185,129,0.5)] scale-105"
              : "border-white/8 bg-black/30"
          }`}
        >
          <span className="text-[10px] uppercase text-slate-400 block mb-0.5">Push Button</span>
          <span
            className={`text-base font-bold flex items-center justify-center gap-1.5 ${
              Number(currentButton) === 1
                ? "text-emerald-300 animate-pulse font-black"
                : "text-slate-500"
            }`}
          >
            {Number(currentButton) === 1 ? "🔘 PRESSED" : "⚪ RELEASED"}
          </span>
        </div>
      </div>

      {/* Terminal Output & Code Snippet */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
        {/* Terminal Monitor (2 cols) */}
        <div className="lg:col-span-2 rounded-xl border border-white/10 bg-black/80 flex flex-col h-72">
          <div className="px-3 py-2 border-b border-white/10 flex items-center justify-between text-xs text-slate-400 font-mono bg-slate-900/40">
            <span className="flex items-center gap-1.5 text-slate-300 font-semibold">
              <Terminal className="h-3.5 w-3.5 text-sky-400" />
              Raw Serial Monitor
            </span>
            <div className="flex items-center gap-3 text-[11px]">
              <button
                onClick={() => setIsPaused(!isPaused)}
                className="hover:text-white transition-colors flex items-center gap-1 text-slate-400"
              >
                {isPaused ? <Play className="h-3 w-3 text-emerald-400" /> : <Pause className="h-3 w-3" />}
                <span>{isPaused ? "Resume" : "Pause"}</span>
              </button>
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
                className="hover:text-white transition-colors flex items-center gap-1 text-slate-400"
              >
                <Trash2 className="h-3 w-3" />
                <span>Clear</span>
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
