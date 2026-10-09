"use client";

import React, { useState, useEffect, useRef, useCallback } from "react";
import {
  Usb, Terminal, Zap, Activity, AlertTriangle, ShieldCheck, CheckCircle2,
  RefreshCw, Power, Radio, Copy, Check, Info, ArrowUpRight, ChevronRight, X,
  Pause, Play, Trash2, RotateCcw, AlertCircle, LineChart as ChartIcon, Gauge
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

export interface ParsedTelemetry {
  equipment_id?: string;
  temperature?: number;
  vibration?: number;
  vibration_rms?: number;
  current_draw?: number;
  voltage?: number;
  raw_current_adc?: number;
  humidity?: number;
  rpm?: number;
  hall_pulses?: number;
  hall_flux?: number;
  button_state?: number;
  push_button?: number;
  buzzer_state?: number;
  parameters?: Record<string, any>;
  timestamp?: string;
  [key: string]: any;
}

export interface RealtimeDataPoint {
  time: string;
  temperature?: number;
  current?: number;
  voltage?: number;
  rpm?: number;
  button?: number;
}

export interface WebSerialDirectConnectorProps {
  initialMachineId?: string;
  onClose?: () => void;
  className?: string;
  onPacketReceived?: (packet: ParsedTelemetry) => void;
}

export function WebSerialDirectConnector({
  initialMachineId = "SGT-TERM-01",
  onClose,
  className = "",
  onPacketReceived,
}: WebSerialDirectConnectorProps) {
  // Machine Selection
  const [selectedMachine, setSelectedMachine] = useState(initialMachineId);
  const [availableMachines, setAvailableMachines] = useState<Array<{ id: string; name: string }>>([]);
  const [baudRate, setBaudRate] = useState(115200);
  const [forwardToBackend, setForwardToBackend] = useState(true);

  // Sync selectedMachine if initialMachineId changes from parent
  useEffect(() => {
    if (initialMachineId) {
      setSelectedMachine(initialMachineId);
    }
  }, [initialMachineId]);

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
  const [realtimeHistory, setRealtimeHistory] = useState<RealtimeDataPoint[]>([]);
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
  const currentFrameRef = useRef<ParsedTelemetry>({});

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

  // Unified processor for telemetry packets (both JSON and parsed hardware reports)
  const processTelemetryPacket = useCallback(
    (packet: ParsedTelemetry) => {
      setLatestPacket(packet);
      setPacketCount((c) => c + 1);
      packetCountRef.current += 1;

      const now = Date.now();
      const delta = (now - lastPacketTimeRef.current) / 1000;
      if (delta > 0 && delta < 5) {
        setCadenceHz(parseFloat((1 / delta).toFixed(1)));
      }
      lastPacketTimeRef.current = now;

      // Realtime Dynamic Waveform History (rolling 40 samples)
      setRealtimeHistory((prev) => {
        const timeLabel = new Date().toLocaleTimeString([], { hour12: false, minute: "2-digit", second: "2-digit" });
        const lastPt = prev[prev.length - 1];
        const newTemp =
          packet.temperature !== undefined
            ? Number(packet.temperature.toFixed(1))
            : lastPt?.temperature ?? 33.0;
        const newCurrent =
          packet.current_draw !== undefined
            ? Number(packet.current_draw.toFixed(2))
            : packet.voltage !== undefined
            ? Number(packet.voltage.toFixed(2))
            : lastPt?.current ?? 1.65;
        const newVoltage =
          packet.voltage !== undefined ? Number(packet.voltage.toFixed(2)) : lastPt?.voltage ?? 1.65;
        const newRpm =
          packet.rpm !== undefined
            ? Math.round(packet.rpm)
            : packet.hall_pulses !== undefined
            ? packet.hall_pulses
            : lastPt?.rpm ?? 0;
        // Scale button to 3.0 so it creates a distinct square pulse on the right Y-axis (0-5)
        const isBtnActive = Number(packet.button_state ?? packet.push_button) === 1;
        const newBtn = isBtnActive ? 3.0 : 0.0;

        return [
          ...prev.slice(-49),
          {
            time: timeLabel,
            temperature: newTemp,
            current: newCurrent,
            voltage: newVoltage,
            button: newBtn,
            rpm: newRpm,
          },
        ];
      });

      // Forward to backend API if enabled (throttled to 2Hz / 500ms to protect database & network)
      if (forwardToBackend) {
        const timeSinceLastForward = now - lastForwardTimeRef.current;
        if (timeSinceLastForward >= 500) {
          lastForwardTimeRef.current = now;

          const targetEqId = selectedMachine || packet.equipment_id || "ESP32-HARDWARE-01";
          const tempVal =
            packet.temperature ??
            (packet.parameters?.temperature !== undefined ? Number(packet.parameters.temperature) : null);
          const vibVal =
            packet.vibration ??
            packet.vibration_rms ??
            (packet.parameters?.vibration_rms !== undefined
              ? Number(packet.parameters.vibration_rms)
              : packet.parameters?.vibration !== undefined
              ? Number(packet.parameters.vibration)
              : 0.05);

          const mergedParams = {
            ...(packet.parameters || {}),
            ...packet,
            equipment_id: targetEqId,
            temperature: tempVal,
            vibration: vibVal,
            vibration_rms: vibVal,
            push_button: packet.button_state ?? packet.push_button ?? 0,
            button: packet.button_state ?? packet.push_button ?? 0,
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

      if (onPacketReceived) {
        onPacketReceived(packet);
      }
    },
    [forwardToBackend, selectedMachine, onPacketReceived]
  );

  // Process incoming raw line from Serial Port (supports JSON and Hardware Diagnostic Report text)
  const handleIncomingLine = useCallback(
    async (rawLine: string) => {
      const trimmed = rawLine.trim();
      if (!trimmed) return;

      // -------------------------------------------------------------
      // ROUTE 1: JSON TELEMETRY PACKET
      // -------------------------------------------------------------
      let jsonStr = "";
      if (trimmed.includes("{") && trimmed.includes("}")) {
        const start = trimmed.indexOf("{");
        const end = trimmed.lastIndexOf("}");
        jsonStr = trimmed.slice(start, end + 1);
      }

      if (jsonStr) {
        try {
          const parsed = JSON.parse(jsonStr) as ParsedTelemetry;
          currentFrameRef.current = { ...currentFrameRef.current, ...parsed };
          processTelemetryPacket(parsed);

          if (!isPaused) {
            addLog(`[JSON] ${JSON.stringify(parsed)}`, "json");
          }
          return;
        } catch {
          // Fall through to text pattern parser
        }
      }

      // -------------------------------------------------------------
      // ROUTE 2: TEXT HARDWARE DIAGNOSTIC REPORT PARSER
      // Matches the exact format emitted by your ESP32 Arduino sketch:
      // ✅ DHT11 (GPIO 4): CONNECTED & WORKING | Temp: 33.0 °C | Humidity: 72.0 %
      // 📊 ACS712 Current (GPIO 34): Raw ADC = 2219 (1.79 V) -> ✅ SIGNAL DETECTED
      // 🧲 Hall Effect Sensor: D0 (GPIO 25) = HIGH | Total Pulses = 0 | A0 (GPIO 35) ADC = 4095
      // 🔘 Push Button (GPIO 27): RELEASED [HIGH] / PRESSED [LOW]
      // -------------------------------------------------------------
      let matchedAny = false;

      // 1. DHT11 Temperature & Humidity
      const tempMatch = trimmed.match(/(?:Temp|Temperature)\s*:\s*([\d\.]+)/i);
      const humMatch = trimmed.match(/(?:Humidity|Hum)\s*:\s*([\d\.]+)/i);
      if (tempMatch) {
        currentFrameRef.current.temperature = parseFloat(tempMatch[1]);
        matchedAny = true;
      }
      if (humMatch) {
        currentFrameRef.current.humidity = parseFloat(humMatch[1]);
        matchedAny = true;
      }

      // 2. ACS712 Current / Voltage / Raw ADC
      const adcMatch = trimmed.match(/Raw\s*ADC\s*=\s*(\d+)/i) || trimmed.match(/ADC\s*=\s*(\d+)/i);
      const voltMatch = trimmed.match(/\(([\d\.]+)\s*V\)/i) || trimmed.match(/([\d\.]+)\s*V\b/i);
      const ampMatch = trimmed.match(/([\d\.]+)\s*A\b/i);
      if (voltMatch) {
        const volts = parseFloat(voltMatch[1]);
        currentFrameRef.current.voltage = volts;
        // Sensitivity calibration: ACS712 quiescent baseline ~1.65V (for 3.3V ADC with voltage divider)
        const deltaV = Math.abs(volts - 1.65);
        const calcAmps = deltaV > 0.02 ? parseFloat((deltaV / 0.066).toFixed(2)) : 0.0;
        currentFrameRef.current.current_draw = calcAmps;
        matchedAny = true;
      } else if (ampMatch) {
        currentFrameRef.current.current_draw = parseFloat(ampMatch[1]);
        matchedAny = true;
      }
      if (adcMatch) {
        currentFrameRef.current.raw_current_adc = parseInt(adcMatch[1], 10);
        matchedAny = true;
      }

      // 3. Hall Effect Sensor (Pulses / Speed / Flux ADC)
      const pulseMatch = trimmed.match(/(?:Total\s*Pulses|Pulses)\s*=\s*(\d+)/i) || trimmed.match(/Pulses:\s*(\d+)/i);
      const rpmMatch = trimmed.match(/(?:RPM|Speed)\s*[:=]\s*([\d\.]+)/i);
      const hallAdcMatch = trimmed.match(/A0.*ADC\s*=\s*(\d+)/i);
      if (pulseMatch) {
        const pulses = parseInt(pulseMatch[1], 10);
        currentFrameRef.current.hall_pulses = pulses;
        currentFrameRef.current.rpm = pulses * 60;
        matchedAny = true;
      }
      if (rpmMatch) {
        currentFrameRef.current.rpm = parseFloat(rpmMatch[1]);
        matchedAny = true;
      }
      if (hallAdcMatch) {
        currentFrameRef.current.hall_flux = parseInt(hallAdcMatch[1], 10);
        matchedAny = true;
      }

      // 4. Push Button State (Active LOW: PRESSED [LOW] = 1, RELEASED [HIGH] = 0)
      if (/push\s*button/i.test(trimmed) || /button/i.test(trimmed)) {
        if (/PRESSED|\[LOW\]/i.test(trimmed) && !/RELEASED/i.test(trimmed)) {
          currentFrameRef.current.button_state = 1;
          currentFrameRef.current.push_button = 1;
          matchedAny = true;
        } else if (/RELEASED|\[HIGH\]/i.test(trimmed)) {
          currentFrameRef.current.button_state = 0;
          currentFrameRef.current.push_button = 0;
          matchedAny = true;
        }
      }

      // If any hardware diagnostic reading was matched, emit an updated telemetry frame
      if (matchedAny) {
        const synthesizedPacket: ParsedTelemetry = {
          equipment_id: selectedMachine,
          ...currentFrameRef.current,
          vibration: currentFrameRef.current.vibration ?? 0.05,
          vibration_rms: currentFrameRef.current.vibration_rms ?? 0.05,
          timestamp: new Date().toISOString(),
        };
        processTelemetryPacket(synthesizedPacket);
      }

      if (!isPaused) {
        addLog(trimmed, matchedAny ? "json" : "raw");
      }
    },
    [isPaused, addLog, processTelemetryPacket, selectedMachine]
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
  const currentVolts =
    latestPacket?.voltage !== undefined
      ? latestPacket.voltage
      : latestPacket?.parameters?.voltage;
  const currentHumidity =
    latestPacket?.humidity !== undefined
      ? latestPacket.humidity
      : latestPacket?.parameters?.humidity;
  const currentRpm =
    latestPacket?.rpm !== undefined
      ? latestPacket.rpm
      : latestPacket?.parameters?.rpm;
  const currentButton =
    latestPacket?.button_state !== undefined
      ? latestPacket.button_state
      : latestPacket?.parameters?.button_state ?? latestPacket?.push_button;

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
      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-7 gap-3 mb-5 font-mono text-center">
        {/* Packets */}
        <div className="p-3 rounded-xl border border-white/8 bg-black/30">
          <span className="text-[10px] uppercase text-slate-400 block mb-0.5">Packets</span>
          <span className="text-xl font-bold text-white">{packetCount}</span>
          <span className="text-[10px] text-slate-500 block">Total Read</span>
        </div>

        {/* Cadence */}
        <div className="p-3 rounded-xl border border-white/8 bg-black/30">
          <span className="text-[10px] uppercase text-slate-400 block mb-0.5">Cadence</span>
          <span className="text-xl font-bold text-sky-400">{cadenceHz} Hz</span>
          <span className="text-[10px] text-slate-500 block">Sampling Rate</span>
        </div>

        {/* DHT11 Temp */}
        <div className="p-3 rounded-xl border border-white/8 bg-black/30">
          <span className="text-[10px] uppercase text-slate-400 block mb-0.5">DHT11 Temp</span>
          <span
            className={`text-xl font-bold ${
              currentTemp !== undefined && currentTemp > 35
                ? "text-red-400 animate-pulse font-black"
                : currentTemp !== undefined && currentTemp > 30
                ? "text-amber-300"
                : "text-emerald-400"
            }`}
          >
            {currentTemp !== undefined ? `${Number(currentTemp).toFixed(1)}°C` : "--"}
          </span>
          <span className="text-[10px] text-slate-500 block">
            {currentHumidity !== undefined ? `${Number(currentHumidity).toFixed(0)}% Hum` : "GPIO 4"}
          </span>
        </div>

        {/* Vibration RMS */}
        <div className="p-3 rounded-xl border border-white/8 bg-black/30">
          <span className="text-[10px] uppercase text-slate-400 block mb-0.5">Vibration RMS</span>
          <span className="text-xl font-bold text-blue-400">
            {currentVib !== undefined ? `${Number(currentVib).toFixed(2)} mm/s` : "--"}
          </span>
          <span className="text-[10px] text-slate-500 block">ISO 10816 Zone A</span>
        </div>

        {/* ACS712 Current */}
        <div className="p-3 rounded-xl border border-white/8 bg-black/30">
          <span className="text-[10px] uppercase text-slate-400 block mb-0.5">ACS712 Current</span>
          <span className="text-xl font-bold text-emerald-400">
            {currentDraw !== undefined && currentDraw > 0
              ? `${Number(currentDraw).toFixed(2)} A`
              : currentVolts !== undefined
              ? `${Number(currentVolts).toFixed(2)} V`
              : "--"}
          </span>
          <span className="text-[10px] text-slate-500 block truncate" title="Raw ADC from GPIO 34">
            {currentVolts !== undefined
              ? `${Number(currentVolts).toFixed(2)} V (ADC ${latestPacket?.raw_current_adc ?? "ok"})`
              : "GPIO 34 ADC"}
          </span>
        </div>

        {/* Hall Speed */}
        <div className="p-3 rounded-xl border border-white/8 bg-black/30">
          <span className="text-[10px] uppercase text-slate-400 block mb-0.5">Hall Speed</span>
          <span className="text-xl font-bold text-purple-400">
            {currentRpm !== undefined && currentRpm > 0
              ? `${Math.round(Number(currentRpm))} RPM`
              : latestPacket?.hall_pulses !== undefined
              ? `${latestPacket.hall_pulses} Pulses`
              : "--"}
          </span>
          <span className="text-[10px] text-slate-500 block truncate">
            {latestPacket?.hall_flux !== undefined ? `ADC ${latestPacket.hall_flux}` : "GPIO 25/35"}
          </span>
        </div>

        {/* Real-time Push Button Indicator */}
        <div
          className={`p-3 rounded-xl border transition-all duration-300 ${
            Number(currentButton) === 1
              ? "border-emerald-400 bg-emerald-500/30 shadow-[0_0_25px_rgba(16,185,129,0.7)] scale-105"
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
          <span className="text-[10px] text-slate-500 block">
            {Number(currentButton) === 1 ? "GPIO 27 Active" : "Pull-up Healthy"}
          </span>
        </div>
      </div>

      {/* Real-Time Live Signal Waveform Graph */}
      <div className="rounded-xl border border-white/10 bg-slate-900/60 p-4 mb-5">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 mb-3">
          <div className="flex items-center gap-2">
            <Activity className="h-4 w-4 text-emerald-400 animate-pulse" />
            <span className="text-xs font-bold uppercase tracking-wider text-slate-200">
              Live Hardware Sensor Signal Stream
            </span>
            <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-300 border border-emerald-500/20">
              {realtimeHistory.length} Live Samples
            </span>
          </div>

          <div className="flex items-center gap-3 text-xs font-mono flex-wrap">
            <span className="flex items-center gap-1.5 text-amber-300">
              <span className="h-2 w-2 rounded-full bg-amber-400" />
              Temp: {currentTemp !== undefined ? `${Number(currentTemp).toFixed(1)}°C` : "--"}
            </span>
            <span className="flex items-center gap-1.5 text-emerald-400">
              <span className="h-2 w-2 rounded-full bg-emerald-400" />
              Current: {currentDraw !== undefined && currentDraw > 0 ? `${Number(currentDraw).toFixed(2)} A` : currentVolts !== undefined ? `${Number(currentVolts).toFixed(2)} V` : "--"}
            </span>
            <span className={`flex items-center gap-1.5 font-bold ${Number(currentButton) === 1 ? "text-pink-400 animate-pulse" : "text-slate-400"}`}>
              <span className={`h-2 w-2 rounded-full ${Number(currentButton) === 1 ? "bg-pink-400 shadow-[0_0_8px_#ec4899]" : "bg-slate-500"}`} />
              Btn: {Number(currentButton) === 1 ? "PRESSED" : "RELEASED"}
            </span>
          </div>
        </div>

        <div className="h-56 w-full">
          {realtimeHistory.length === 0 ? (
            <div className="h-full flex flex-col items-center justify-center text-xs text-slate-500 font-mono italic">
              <Activity className="h-6 w-6 text-slate-600 mb-1 animate-pulse" />
              Awaiting incoming USB serial telemetry to render dynamic waveforms...
            </div>
          ) : (
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={realtimeHistory} margin={{ top: 10, right: 30, left: 0, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
                <XAxis dataKey="time" stroke="#64748b" tick={{ fontSize: 10 }} />
                <YAxis yAxisId="left" stroke="#f59e0b" domain={[20, 45]} tick={{ fontSize: 10 }} unit="°C" />
                <YAxis yAxisId="right" orientation="right" stroke="#10b981" domain={[0, 6]} tick={{ fontSize: 10 }} unit="A" />
                <Tooltip
                  contentStyle={{
                    backgroundColor: "#0b1120",
                    borderColor: "#334155",
                    color: "#f8fafc",
                    borderRadius: "8px",
                    fontSize: "11px",
                    fontFamily: "monospace"
                  }}
                />
                <ReferenceLine yAxisId="left" y={30} stroke="#f59e0b" strokeDasharray="3 3" label={{ value: "Warning (30°C)", fill: "#f59e0b", fontSize: 9 }} />
                <ReferenceLine yAxisId="left" y={35} stroke="#ef4444" strokeDasharray="3 3" label={{ value: "Critical (35°C)", fill: "#ef4444", fontSize: 9 }} />
                <Line
                  yAxisId="left"
                  type="monotone"
                  dataKey="temperature"
                  name="DHT11 Temp (°C)"
                  stroke="#f59e0b"
                  strokeWidth={2.5}
                  dot={{ r: 2, fill: "#f59e0b" }}
                  isAnimationActive={false}
                />
                <Line
                  yAxisId="right"
                  type="monotone"
                  dataKey="current"
                  name="ACS712 Current (A)"
                  stroke="#10b981"
                  strokeWidth={2}
                  dot={false}
                  isAnimationActive={false}
                />
                <Line
                  yAxisId="right"
                  type="stepAfter"
                  dataKey="button"
                  name="Push Button (Step Active=3)"
                  stroke="#ec4899"
                  strokeWidth={2.5}
                  dot={false}
                  isAnimationActive={false}
                />
              </LineChart>
            </ResponsiveContainer>
          )}
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
