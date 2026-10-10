"use client";

import React, { createContext, useContext, useState, useEffect, useRef, useCallback } from "react";
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
  hall_analog?: number;
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

export interface SerialLogEntry {
  id: string;
  text: string;
  type: "sys" | "json" | "report" | "error" | "warn";
  time: string;
}

interface HardwareStreamContextType {
  isSupported: boolean;
  isConnected: boolean;
  isConnecting: boolean;
  errorMsg: string | null;
  selectedMachine: string;
  baudRate: number;
  packetCount: number;
  cadenceHz: number;
  forwardToBackend: boolean;
  latestPacket: ParsedTelemetry | null;
  realtimeHistory: RealtimeDataPoint[];
  logs: SerialLogEntry[];
  connectSerial: (options?: { machineId?: string; baudRate?: number }) => Promise<void>;
  disconnectSerial: () => Promise<void>;
  setSelectedMachine: (machineId: string) => void;
  setBaudRate: (rate: number) => void;
  setForwardToBackend: (val: boolean) => void;
  clearLogs: () => void;
  isStreamingMachine: (machineId: string) => boolean;
}

const HardwareStreamContext = createContext<HardwareStreamContextType | null>(null);

export function HardwareStreamProvider({ children }: { children: React.ReactNode }) {
  const [isSupported, setIsSupported] = useState(true);
  const [isConnected, setIsConnected] = useState(false);
  const [isConnecting, setIsConnecting] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [selectedMachine, setSelectedMachine] = useState<string>("ESP32-HARDWARE-01");
  const [baudRate, setBaudRate] = useState<number>(115200);
  const [forwardToBackend, setForwardToBackend] = useState<boolean>(true);
  const [packetCount, setPacketCount] = useState<number>(0);
  const [cadenceHz, setCadenceHz] = useState<number>(0);
  const [latestPacket, setLatestPacket] = useState<ParsedTelemetry | null>(null);
  const [realtimeHistory, setRealtimeHistory] = useState<RealtimeDataPoint[]>([]);
  const [logs, setLogs] = useState<SerialLogEntry[]>([]);

  // Persistent Refs that survive route unmounts
  const portRef = useRef<any>(null);
  const readerRef = useRef<any>(null);
  const isReadingRef = useRef<boolean>(false);
  const packetCountRef = useRef<number>(0);
  const lastPacketTimeRef = useRef<number>(Date.now());
  const lastForwardTimeRef = useRef<number>(0);
  const currentFrameRef = useRef<ParsedTelemetry>({
    equipment_id: "ESP32-HARDWARE-01",
    temperature: 33.0,
    humidity: 72.0,
    current_draw: 4.12,
    voltage: 1.65,
    rpm: 1450,
    button_state: 0,
    push_button: 0,
    buzzer_state: 0,
  });

  const addLog = useCallback((text: string, type: "sys" | "json" | "report" | "error" | "warn" = "sys") => {
    const entry: SerialLogEntry = {
      id: `${Date.now()}-${Math.random().toString(36).substr(2, 4)}`,
      text,
      type,
      time: new Date().toLocaleTimeString([], { hour12: false, minute: "2-digit", second: "2-digit" }),
    };
    setLogs((prev) => [...prev.slice(-150), entry]);
  }, []);

  const clearLogs = useCallback(() => {
    setLogs([]);
  }, []);

  // Check browser support
  useEffect(() => {
    if (typeof window !== "undefined") {
      const supported = "serial" in navigator;
      setIsSupported(supported);
      if (!supported) {
        addLog("[SYSTEM] WebSerial API not supported in this browser. Use Chrome/Edge/Opera.", "warn");
      }
    }
  }, [addLog]);

  // Clean Disconnect
  const disconnectSerial = useCallback(async () => {
    isReadingRef.current = false;

    if (readerRef.current) {
      try {
        await readerRef.current.cancel();
      } catch (e) {}
      try {
        readerRef.current.releaseLock();
      } catch (e) {}
      readerRef.current = null;
    }

    if (portRef.current) {
      try {
        await portRef.current.close();
      } catch (err: any) {
        console.warn("Serial close warning:", err);
      }
      portRef.current = null;
    }

    setIsConnected(false);
    setIsConnecting(false);
    setCadenceHz(0);
    addLog("[SYSTEM] USB Serial Port disconnected cleanly.", "sys");
    if (typeof window !== "undefined") {
      window.dispatchEvent(new CustomEvent("hardware-connection-changed", { detail: { isConnected: false } }));
    }
  }, [addLog]);

  // Telemetry processor & backend forwarder
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

      // Update waveform history
      setRealtimeHistory((prev) => {
        const timeLabel = new Date().toLocaleTimeString([], { hour12: false, minute: "2-digit", second: "2-digit" });
        const lastPt = prev[prev.length - 1];
        const newTemp =
          packet.temperature !== undefined ? Number(packet.temperature.toFixed(1)) : lastPt?.temperature ?? 33.0;
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

      // Dispatch global browser event for instant subscription
      if (typeof window !== "undefined") {
        window.dispatchEvent(
          new CustomEvent("hardware-telemetry-packet", {
            detail: {
              ...packet,
              machineId: selectedMachine || packet.equipment_id || "ESP32-HARDWARE-01",
            },
          })
        );
      }

      // Forward to backend API (throttled at 2 Hz / 500ms)
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
            .catch(() => {});
        }
      }
    },
    [forwardToBackend, selectedMachine]
  );

  // Line parser for JSON and text diagnostic reports
  const handleIncomingLine = useCallback(
    (rawLine: string) => {
      const trimmed = rawLine.trim();
      if (!trimmed) return;

      // ROUTE 1: JSON TELEMETRY PACKET
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
          addLog(`[JSON] ${JSON.stringify(parsed)}`, "json");
          return;
        } catch {}
      }

      // ROUTE 2: TEXT HARDWARE DIAGNOSTIC REPORT PARSER
      let matchedAny = false;

      // 1. DHT11
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

      // 2. ACS712 Current / Voltage / ADC
      const adcMatch = trimmed.match(/Raw\s*ADC\s*=\s*(\d+)/i) || trimmed.match(/ADC\s*=\s*(\d+)/i);
      const voltMatch = trimmed.match(/\(([\d\.]+)\s*V\)/i) || trimmed.match(/([\d\.]+)\s*V\b/i);
      const ampMatch = trimmed.match(/([\d\.]+)\s*A\b/i);
      if (voltMatch) {
        const volts = parseFloat(voltMatch[1]);
        currentFrameRef.current.voltage = volts;
        const currentCalc = Math.abs((volts - 1.65) / 0.185);
        currentFrameRef.current.current_draw = parseFloat(currentCalc.toFixed(2));
        matchedAny = true;
      } else if (ampMatch) {
        currentFrameRef.current.current_draw = parseFloat(ampMatch[1]);
        matchedAny = true;
      }
      if (adcMatch) {
        currentFrameRef.current.raw_current_adc = parseInt(adcMatch[1], 10);
        matchedAny = true;
      }

      // 3. Hall Effect Sensor (RPM / Pulses / Analog Flux)
      const pulseMatch = trimmed.match(/Total\s*Pulses\s*=\s*(\d+)/i) || trimmed.match(/Pulses\s*:\s*(\d+)/i);
      const fluxMatch = trimmed.match(/A0(?:\s*\(GPIO\s*\d+\))?\s*ADC\s*=\s*(\d+)/i);
      const rpmMatch = trimmed.match(/(\d+)\s*RPM/i);
      if (pulseMatch) {
        const pulses = parseInt(pulseMatch[1], 10);
        currentFrameRef.current.hall_pulses = pulses;
        currentFrameRef.current.rpm = pulses * 60;
        matchedAny = true;
      }
      if (rpmMatch) {
        currentFrameRef.current.rpm = parseInt(rpmMatch[1], 10);
        matchedAny = true;
      }
      if (fluxMatch) {
        currentFrameRef.current.hall_analog = parseInt(fluxMatch[1], 10);
        currentFrameRef.current.hall_flux = parseInt(fluxMatch[1], 10);
        matchedAny = true;
      }

      // 4. Push Button State
      if (trimmed.includes("Button") || trimmed.includes("GPIO 27")) {
        matchedAny = true;
        if (trimmed.toUpperCase().includes("PRESSED") || trimmed.toUpperCase().includes("LOW")) {
          currentFrameRef.current.button_state = 1;
          currentFrameRef.current.push_button = 1;
        } else if (trimmed.toUpperCase().includes("RELEASED") || trimmed.toUpperCase().includes("HIGH")) {
          currentFrameRef.current.button_state = 0;
          currentFrameRef.current.push_button = 0;
        }
      }

      // 5. Alarm Buzzer State
      if (trimmed.includes("Buzzer") || trimmed.includes("GPIO 13") || trimmed.includes("ALARM")) {
        matchedAny = true;
        if (trimmed.toUpperCase().includes("ACTIVE") || trimmed.toUpperCase().includes("ON") || trimmed.includes("= 1")) {
          currentFrameRef.current.buzzer_state = 1;
        } else {
          currentFrameRef.current.buzzer_state = 0;
        }
      }

      // Report Header or End of Frame triggers packet emission
      if (trimmed.startsWith("---") || trimmed.includes("DIAGNOSTIC REPORT") || matchedAny) {
        addLog(trimmed, matchedAny ? "report" : "sys");

        if (
          trimmed.includes("Push Button") ||
          trimmed.includes("DIAGNOSTIC REPORT") ||
          trimmed.startsWith("---")
        ) {
          const snapshot: ParsedTelemetry = {
            ...currentFrameRef.current,
            equipment_id: selectedMachine,
            timestamp: new Date().toISOString(),
          };
          processTelemetryPacket(snapshot);
        }
      } else {
        addLog(trimmed, "sys");
      }
    },
    [addLog, processTelemetryPacket, selectedMachine]
  );

  // Connect to Serial Port
  const connectSerial = useCallback(
    async (options?: { machineId?: string; baudRate?: number }) => {
      if (typeof window === "undefined" || !("serial" in navigator)) {
        setErrorMsg("WebSerial is not supported in this browser.");
        return;
      }

      const targetBaud = options?.baudRate || baudRate;
      if (options?.machineId) {
        setSelectedMachine(options.machineId);
      }

      setIsConnecting(true);
      setErrorMsg(null);

      try {
        let port: any = null;
        // Check for existing granted ports or request a new one
        const grantedPorts = await (navigator as any).serial.getPorts();
        if (grantedPorts.length > 0 && !portRef.current) {
          port = grantedPorts[0];
        } else {
          port = await (navigator as any).serial.requestPort();
        }

        if (!port) {
          throw new Error("No USB serial port selected.");
        }

        portRef.current = port;

        // If port is already open, close it cleanly first
        try {
          if (port.readable) {
            await port.close();
          }
        } catch {}

        await port.open({ baudRate: targetBaud });
        setIsConnected(true);
        setIsConnecting(false);
        addLog(`[SYSTEM] USB Serial Port opened successfully @ ${targetBaud} baud. Background stream active.`, "sys");

        if (typeof window !== "undefined") {
          window.dispatchEvent(
            new CustomEvent("hardware-connection-changed", {
              detail: { isConnected: true, machineId: options?.machineId || selectedMachine },
            })
          );
        }

        // Start reading loop
        isReadingRef.current = true;
        const textDecoder = new TextDecoderStream();
        const readableClosed = port.readable.pipeTo(textDecoder.writable);
        const reader = textDecoder.readable.getReader();
        readerRef.current = reader;

        let lineBuffer = "";

        while (isReadingRef.current) {
          const { value, done } = await reader.read();
          if (done) break;
          if (value) {
            lineBuffer += value;
            const lines = lineBuffer.split(/\r?\n/);
            lineBuffer = lines.pop() || "";
            for (const line of lines) {
              handleIncomingLine(line);
            }
          }
        }

        await readableClosed.catch(() => {});
      } catch (err: any) {
        console.error("WebSerial connection error:", err);
        setErrorMsg(err.message || "Failed to open USB serial port");
        setIsConnecting(false);
        setIsConnected(false);
        addLog(`[ERROR] ${err.message || "Failed to open serial port"}`, "error");
      }
    },
    [baudRate, handleIncomingLine, addLog, selectedMachine]
  );

  // Hardware hotplug listener
  useEffect(() => {
    if (typeof window === "undefined" || !("serial" in navigator)) return;

    const handleDeviceDisconnected = (event: any) => {
      if (portRef.current && (event.target === portRef.current || !event.target)) {
        addLog("[SYSTEM] Physical USB device disconnect detected by OS.", "error");
        disconnectSerial();
      }
    };

    const handleDeviceConnected = () => {
      addLog("[SYSTEM] USB device attached to host. Ready to stream.", "sys");
    };

    const serialObj = (navigator as any).serial;
    serialObj.addEventListener("disconnect", handleDeviceDisconnected);
    serialObj.addEventListener("connect", handleDeviceConnected);

    return () => {
      serialObj?.removeEventListener("disconnect", handleDeviceDisconnected);
      serialObj?.removeEventListener("connect", handleDeviceConnected);
    };
  }, [disconnectSerial, addLog]);

  const isStreamingMachine = useCallback(
    (machineId: string) => {
      return isConnected && (selectedMachine === machineId || machineId === "ESP32-HARDWARE-01");
    },
    [isConnected, selectedMachine]
  );

  const value = {
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
    isStreamingMachine,
  };

  return <HardwareStreamContext.Provider value={value}>{children}</HardwareStreamContext.Provider>;
}

export function useHardwareStream() {
  const context = useContext(HardwareStreamContext);
  if (!context) {
    throw new Error("useHardwareStream must be used within a HardwareStreamProvider");
  }
  return context;
}
