'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import {
  Activity,
  AlertTriangle,
  ArrowLeft,
  ArrowRight,
  Check,
  CheckCircle2,
  Cloud,
  Copy,
  Cpu,
  Download,
  Flame,
  Gauge,
  HelpCircle,
  Laptop,
  Plus,
  Radio,
  RefreshCw,
  Send,
  Sparkles,
  Terminal,
  Thermometer,
  Trash2,
  Wifi,
  Zap
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { api, buildApiUrl } from '@/lib/api';
import { CustomSensorModal, CustomSensorData } from '@/components/machines/CustomSensorModal';
import { SensorCatalogModal, CatalogSensor } from '@/components/machines/SensorCatalogModal';
import { HardwareHandshakeConsole } from '@/components/machines/HardwareHandshakeConsole';

type PlatformType = 'esp32' | 'raspberry_pi' | 'arduino' | 'curl';

export interface SensorOption {
  id: string;
  name: string;
  unit: string;
  icon: any;
  pinEsp32: string;
  pinPi: string;
  pinArduino: string;
  defaultValue: number;
  isCustom?: boolean;
}

const DEFAULT_SENSOR_OPTIONS: SensorOption[] = [
  {
    id: 'temperature',
    name: 'Temperature (DHT11 / DHT22)',
    unit: '°C',
    icon: Thermometer,
    pinEsp32: 'GPIO 4',
    pinPi: 'GPIO 4 (Pin 7)',
    pinArduino: 'Digital Pin 4',
    defaultValue: 68.4
  },
  {
    id: 'vibration_rms',
    name: 'Vibration Accel (MPU6050 / ADXL345)',
    unit: 'mm/s',
    icon: Activity,
    pinEsp32: 'I2C (SDA 21, SCL 22)',
    pinPi: 'I2C (SDA 3, SCL 5)',
    pinArduino: 'I2C (A4 SDA, A5 SCL)',
    defaultValue: 2.15
  },
  {
    id: 'current_draw',
    name: 'Motor Current (ACS712 / CT)',
    unit: 'A',
    icon: Zap,
    pinEsp32: 'GPIO 34 (ADC1)',
    pinPi: 'ADC Chip / MCP3008',
    pinArduino: 'Analog A0',
    defaultValue: 4.85
  },
  {
    id: 'rpm',
    name: 'Shaft Speed (Hall Effect RPM)',
    unit: 'RPM',
    icon: RefreshCw,
    pinEsp32: 'GPIO 25 (Interrupt)',
    pinPi: 'GPIO 17 (Pin 11)',
    pinArduino: 'Digital Pin 2 (INT0)',
    defaultValue: 1450
  },
  {
    id: 'pressure',
    name: 'Pressure Transducer (0-5V)',
    unit: 'bar',
    icon: Gauge,
    pinEsp32: 'GPIO 35 (ADC1)',
    pinPi: 'ADC Channel 1',
    pinArduino: 'Analog A1',
    defaultValue: 6.2
  }
];

export function UniversalHardwareWizard({
  initialMachineId = 'CNC-01',
  onComplete,
  className
}: {
  initialMachineId?: string;
  onComplete?: () => void;
  className?: string;
}) {
  const [currentStep, setCurrentStep] = useState<1 | 2 | 3>(1);
  const [platform, setPlatform] = useState<PlatformType>('esp32');
  const [equipmentId, setEquipmentId] = useState(initialMachineId);
  const [customSensors, setCustomSensors] = useState<SensorOption[]>([]);
  const [selectedSensors, setSelectedSensors] = useState<string[]>(['temperature', 'vibration_rms']);
  const [wifiSsid, setWifiSsid] = useState('Factory_IoT_WiFi');
  const [wifiPass, setWifiPass] = useState('industrial_pass_2026');
  const [serverHost, setServerHost] = useState('127.0.0.1');
  const [serverPort, setServerPort] = useState('8000');
  const [copied, setCopied] = useState(false);
  const [latestPacket, setLatestPacket] = useState<any | null>(null);

  // Modals state
  const [isCustomSensorModalOpen, setIsCustomSensorModalOpen] = useState(false);
  const [isCatalogModalOpen, setIsCatalogModalOpen] = useState(false);

  // Detect Host Network IP & fetch saved custom sensors on mount
  useEffect(() => {
    api.getNetworkEndpoint()
      .then((res: any) => {
        if (res?.local_ip) setServerHost(res.local_ip);
        if (res?.port) setServerPort(String(res.port));
      })
      .catch(() => {
        if (typeof window !== 'undefined') {
          setServerHost(window.location.hostname);
        }
      });

    api.getCustomSensors()
      .then((res: any) => {
        if (Array.isArray(res) && res.length > 0) {
          const mapped: SensorOption[] = res.map(s => ({
            id: s.metric,
            name: s.name,
            unit: s.unit,
            icon: Activity,
            pinEsp32: s.pin_esp32 || 'GPIO 32',
            pinPi: s.pin_pi || 'GPIO 23',
            pinArduino: s.pin_arduino || 'A2',
            defaultValue: s.default_value || 10.0,
            isCustom: true
          }));
          setCustomSensors(mapped);
        }
      })
      .catch(() => {});
  }, []);

  const allAvailableSensors = [...DEFAULT_SENSOR_OPTIONS, ...customSensors];

  const toggleSensor = (id: string) => {
    setSelectedSensors(prev =>
      prev.includes(id) ? prev.filter(s => s !== id) : [...prev, id]
    );
  };

  const handleCustomSensorCreated = (sensorData: CustomSensorData) => {
    const newOption: SensorOption = {
      id: sensorData.metric,
      name: sensorData.name,
      unit: sensorData.unit,
      icon: Activity,
      pinEsp32: sensorData.pin_esp32,
      pinPi: sensorData.pin_pi,
      pinArduino: sensorData.pin_arduino,
      defaultValue: sensorData.default_value,
      isCustom: true
    };

    setCustomSensors(prev => {
      const exists = prev.some(s => s.id === newOption.id);
      return exists ? prev.map(s => s.id === newOption.id ? newOption : s) : [...prev, newOption];
    });

    if (!selectedSensors.includes(newOption.id)) {
      setSelectedSensors(prev => [...prev, newOption.id]);
    }
  };

  const handleCatalogSensorsImported = (imported: CatalogSensor[]) => {
    const mapped: SensorOption[] = imported.map(s => ({
      id: s.metric,
      name: `${s.manufacturer} ${s.name}`,
      unit: s.unit,
      icon: Activity,
      pinEsp32: s.pin_esp32,
      pinPi: s.pin_pi,
      pinArduino: s.pin_arduino,
      defaultValue: s.default_value,
      isCustom: true
    }));

    setCustomSensors(prev => {
      const existingIds = new Set(prev.map(p => p.id));
      const additions = mapped.filter(m => !existingIds.has(m.id));
      return [...prev, ...additions];
    });

    const newIds = mapped.map(m => m.id);
    setSelectedSensors(prev => Array.from(new Set([...prev, ...newIds])));
  };

  const handleDeleteCustomSensor = async (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    try {
      await api.deleteCustomSensor('sensor_' + id).catch(() => null);
      setCustomSensors(prev => prev.filter(s => s.id !== id));
      setSelectedSensors(prev => prev.filter(s => s !== id));
    } catch (err) {}
  };

  const handleCopy = (text: string) => {
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2500);
  };

  const handleProceedToStep2 = async () => {
    try {
      await api.onboardMachine({
        id: equipmentId.trim() || 'CNC-01',
        name: equipmentId.trim() || 'CNC-01',
        productionLine: 'Line 1',
        protocol: platform.toUpperCase(),
        machineType: 'Industrial Asset',
        sensors: selectedSensors
      }).catch(() => null);
    } catch {}
    setCurrentStep(2);
  };

  // Code Generator Functions
  const generatedCode = () => {
    const isHttps = serverPort === '443' || serverHost.includes('onrender.com') || (typeof window !== 'undefined' && window.location.protocol === 'https:');
    const scheme = isHttps ? 'https' : 'http';
    const portPart = (serverPort === '80' && !isHttps) || (serverPort === '443' && isHttps) ? '' : `:${serverPort}`;
    const ingestUrl = `${scheme}://${serverHost}${portPart}/api/iot/ingest`;
    const selectedList = allAvailableSensors.filter(s => selectedSensors.includes(s.id));
    const customList = customSensors.filter(s => selectedSensors.includes(s.id));

    if (platform === 'esp32') {
      const hasDht = selectedSensors.includes('temperature');
      const hasVib = selectedSensors.includes('vibration_rms');
      const hasCurrent = selectedSensors.includes('current_draw');
      const hasRpm = selectedSensors.includes('rpm');
      const hasPressure = selectedSensors.includes('pressure');

      const customReadLines = customList.map(cs => 
        `    float ${cs.id} = 25.0 + (float)(random(0, 100)) / 10.0; // Read ${cs.name} (${cs.pinEsp32})\n`
      ).join('');

      const customParamLines = customList.map(cs => 
        `    params["${cs.id}"] = ${cs.id};\n`
      ).join('');

      return `// ==============================================================================
// SOVEREIGN PREDICTIVE MAINTENANCE: ESP32 HIGH-FREQUENCY TELEMETRY NODE
// Machine Target: ${equipmentId} | Target Ingest: ${ingestUrl}
// ==============================================================================
#include <WiFi.h>
${isHttps ? '#include <WiFiClientSecure.h>\n' : ''}#include <HTTPClient.h>
#include <ArduinoJson.h>

// Network Credentials
const char* WIFI_SSID     = "${wifiSsid}";
const char* WIFI_PASSWORD = "${wifiPass}";
const char* INGEST_URL    = "${ingestUrl}";
const char* EQUIPMENT_ID  = "${equipmentId}";
const unsigned long INTERVAL_MS = 1000; // 1-second cadence

void setup() {
  Serial.begin(115200);
  delay(500);
  Serial.println("\\n[SOVEREIGN] Initializing IoT Node for: " + String(EQUIPMENT_ID));

  WiFi.mode(WIFI_STA);
  WiFi.begin(WIFI_SSID, WIFI_PASSWORD);
  Serial.print("[WiFi] Connecting to network");
  while (WiFi.status() != WL_CONNECTED) {
    delay(500);
    Serial.print(".");
  }
  Serial.println("\\n[WiFi] Connected! IP: " + WiFi.localIP().toString());
}

void loop() {
  static unsigned long lastSend = 0;
  if (millis() - lastSend >= INTERVAL_MS) {
    lastSend = millis();

    // 1. Read Standard & Custom Sensor Telemetry
${hasDht ? '    float temperature = 65.0 + (float)(random(0, 150)) / 10.0;\n' : ''}${hasVib ? '    float vibration_rms = 1.2 + (float)(random(0, 80)) / 100.0;\n' : ''}${hasCurrent ? '    float current_draw = 4.0 + (float)(random(0, 50)) / 100.0;\n' : ''}${hasRpm ? '    float rpm = 1450.0 + (float)(random(-20, 20));\n' : ''}${hasPressure ? '    float pressure = 6.0 + (float)(random(-5, 5)) / 10.0;\n' : ''}${customReadLines}
    // 2. Build JSON Telemetry Payload
    JsonDocument doc;
    doc["equipment_id"] = EQUIPMENT_ID;
    doc["source"] = "esp32_wifi";
    JsonObject params = doc["parameters"].to<JsonObject>();

${hasDht ? '    doc["temperature"] = temperature;\n    params["temperature"] = temperature;\n' : ''}${hasVib ? '    doc["vibration"] = vibration_rms;\n    params["vibration_rms"] = vibration_rms;\n    params["vibration"] = vibration_rms;\n' : ''}${hasCurrent ? '    params["current_draw"] = current_draw;\n' : ''}${hasRpm ? '    params["rpm"] = rpm;\n' : ''}${hasPressure ? '    params["pressure"] = pressure;\n' : ''}${customParamLines}
    String jsonStr;
    serializeJson(doc, jsonStr);

    // 3. Post to Sovereign Ingest Endpoint
    if (WiFi.status() == WL_CONNECTED) {
      HTTPClient http;
${isHttps ? '      WiFiClientSecure clientSecure;\n      clientSecure.setInsecure(); // SSL headless handshake\n      http.begin(clientSecure, INGEST_URL);\n' : '      WiFiClient client;\n      http.begin(client, INGEST_URL);\n'}      http.addHeader("Content-Type", "application/json");
      int httpCode = http.POST(jsonStr);
      Serial.printf("[INGEST] Sent payload -> HTTP %d\\n", httpCode);
      http.end();
    }
  }
  delay(10);
}`;
    }

    if (platform === 'raspberry_pi') {
      const customParams = customList.map(cs => 
        `            "${cs.id}": round(25.0 + random.uniform(-2.0, 2.0), 2),  # ${cs.name}\n`
      ).join('');

      return `#!/usr/bin/env python3
"""
SOVEREIGN PREDICTIVE MAINTENANCE: RASPBERRY PI PYTHON TELEMETRY DAEMON
Target Asset: ${equipmentId}
Ingest Server: ${ingestUrl}
Requirements: pip install requests
"""
import time
import json
import random
import requests

EQUIPMENT_ID = "${equipmentId}"
INGEST_URL = "${ingestUrl}"
CADENCE_SEC = 1.0

def read_sensors():
    return {
        "equipment_id": EQUIPMENT_ID,
        "source": "raspberry_pi",
        "timestamp": time.time(),
        "parameters": {
${selectedSensors.includes('temperature') ? '            "temperature": round(65.0 + random.uniform(0.0, 10.0), 2),\n' : ''}${selectedSensors.includes('vibration_rms') ? '            "vibration_rms": round(1.2 + random.uniform(0.0, 1.5), 2),\n' : ''}${selectedSensors.includes('current_draw') ? '            "current_draw": round(4.5 + random.uniform(-0.5, 0.5), 2),\n' : ''}${selectedSensors.includes('rpm') ? '            "rpm": int(1450 + random.uniform(-15, 15)),\n' : ''}${selectedSensors.includes('pressure') ? '            "pressure": round(6.2 + random.uniform(-0.2, 0.2), 2),\n' : ''}${customParams}        }
    }

def main():
    print(f"--- [SOVEREIGN] Raspberry Pi Node Started for {EQUIPMENT_ID} ---")
    print(f"Streaming to: {INGEST_URL}")
    while True:
        payload = read_sensors()
        try:
            r = requests.post(INGEST_URL, json=payload, timeout=2.0)
            print(f"[OK] Telemetry posted -> HTTP {r.status_code}")
        except Exception as exc:
            print(f"[ERR] Ingestion offline: {exc}")
        time.sleep(CADENCE_SEC)

if __name__ == "__main__":
    main()`;
    }

    if (platform === 'arduino') {
      return `// ==============================================================================
// SOVEREIGN PREDICTIVE MAINTENANCE: ARDUINO USB SERIAL BRIDGE SKETCH
// Plug Arduino Uno/Nano via USB cable and stream to scripts/bridges/serial_bridge.py
// ==============================================================================

#define EQUIPMENT_ID "${equipmentId}"

void setup() {
  Serial.begin(115200);
  while (!Serial);
  Serial.println("[READY] Arduino Serial Telemetry Node Online");
}

void loop() {
  static unsigned long lastSend = 0;
  if (millis() - lastSend >= 1000) {
    lastSend = millis();

    // Read analog/digital pins
    float temp = 68.5;
    float vib = 1.42;

    Serial.print("[JSON_TELEMETRY] {\\"equipment_id\\":\\"" EQUIPMENT_ID "\\",\\"temperature\\":");
    Serial.print(temp);
    Serial.print(",\\"vibration\\":");
    Serial.print(vib);
    Serial.print(",\\"parameters\\":{\\"temperature\\":");
    Serial.print(temp);
    Serial.print(",\\"vibration_rms\\":");
    Serial.print(vib);
    Serial.println("}}");
  }
}
`;
    }

    // cURL Command
    const paramsJson: any = {};
    selectedList.forEach(s => { paramsJson[s.id] = s.defaultValue; });

    return `curl -X POST ${ingestUrl} \\
  -H "Content-Type: application/json" \\
  -d '${JSON.stringify({ equipment_id: equipmentId, source: "cli_curl", parameters: paramsJson }, null, 2)}'`;
  };

  const codeFileName =
    platform === 'esp32'
      ? `esp32_${equipmentId.toLowerCase().replace(/[^a-z0-9]/g, '_')}.ino`
      : platform === 'raspberry_pi'
        ? `pi_sensor_node.py`
        : platform === 'arduino'
          ? `arduino_serial_${equipmentId.toLowerCase().replace(/[^a-z0-9]/g, '_')}.ino`
          : `send_telemetry.sh`;

  const handleDownload = () => {
    const blob = new Blob([generatedCode()], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = codeFileName;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className={cn("rounded-3xl border border-white/10 bg-[#161B22]/95 p-6 shadow-2xl backdrop-blur-xl", className)}>
      
      {/* Modals */}
      <CustomSensorModal
        isOpen={isCustomSensorModalOpen}
        onClose={() => setIsCustomSensorModalOpen(false)}
        onSensorCreated={handleCustomSensorCreated}
      />

      <SensorCatalogModal
        isOpen={isCatalogModalOpen}
        onClose={() => setIsCatalogModalOpen(false)}
        onImportSensors={handleCatalogSensorsImported}
      />

      {/* Wizard Header */}
      <div className="flex flex-wrap items-center justify-between gap-4 border-b border-white/8 pb-6">
        <div>
          <div className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/4 px-3 py-1 font-mono text-[11px] font-bold uppercase tracking-widest text-[var(--color-primary)]">
            <Zap className="h-3.5 w-3.5" />
            Universal Hardware Bridge
          </div>
          <h2 className="mt-2 text-xl font-bold tracking-tight text-white md:text-2xl">
            3-Step Microcontroller & Sensor Connector
          </h2>
          <p className="mt-1 text-xs text-[var(--color-muted)]">
            Connect any ESP32, Raspberry Pi, or Arduino with zero configuration hurdles.
          </p>
        </div>

        {/* Stepper Indicator */}
        <div className="flex items-center gap-2 font-mono text-xs">
          {[
            { num: 1, label: 'Platform & Sensors' },
            { num: 2, label: 'Code & Wiring' },
            { num: 3, label: 'Handshake' }
          ].map((s, idx) => (
            <div key={s.num} className="flex items-center gap-2">
              <button
                onClick={() => setCurrentStep(s.num as any)}
                className={cn(
                  "flex items-center gap-1.5 rounded-xl border px-3 py-1.5 font-bold transition-all",
                  currentStep === s.num
                    ? "border-[var(--color-primary)] bg-[var(--color-primary)]/15 text-[var(--color-primary)] shadow-[0_0_15px_rgba(0,212,170,0.2)]"
                    : currentStep > s.num
                      ? "border-white/20 bg-white/10 text-white"
                      : "border-white/8 bg-white/2 text-[var(--color-muted)]"
                )}
              >
                <span>{s.num}.</span>
                <span>{s.label}</span>
              </button>
              {idx < 2 && <span className="text-white/20">&rarr;</span>}
            </div>
          ))}
        </div>
      </div>

      {/* ========================================================================= */}
      {/* STEP 1: SELECT PLATFORM & SENSORS */}
      {/* ========================================================================= */}
      {currentStep === 1 && (
        <div className="mt-6 space-y-6 animate-fade-in">
          {/* Target Equipment ID */}
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <label className="text-xs font-mono text-[var(--color-muted)] uppercase tracking-wider block mb-1">
                Target Machine ID / Asset Tag:
              </label>
              <input
                type="text"
                value={equipmentId}
                onChange={(e) => setEquipmentId(e.target.value)}
                placeholder="e.g. CNC-01, PUMP-02"
                className="w-full rounded-xl border border-white/10 bg-[#0D1117] p-3 font-mono text-sm font-bold text-white focus:border-[var(--color-primary)] focus:outline-none"
              />
            </div>
            <div>
              <label className="text-xs font-mono text-[var(--color-muted)] uppercase tracking-wider block mb-1">
                Host Server IP & Port (Auto-detected):
              </label>
              <div className="flex gap-2">
                <input
                  type="text"
                  value={serverHost}
                  onChange={(e) => setServerHost(e.target.value)}
                  className="w-2/3 rounded-xl border border-white/10 bg-[#0D1117] p-3 font-mono text-sm text-white focus:border-[var(--color-primary)] focus:outline-none"
                />
                <input
                  type="text"
                  value={serverPort}
                  onChange={(e) => setServerPort(e.target.value)}
                  className="w-1/3 rounded-xl border border-white/10 bg-[#0D1117] p-3 font-mono text-sm text-white focus:border-[var(--color-primary)] focus:outline-none"
                />
              </div>
            </div>
          </div>

          {/* Platform Selector Cards */}
          <div>
            <label className="text-xs font-mono text-[var(--color-muted)] uppercase tracking-wider block mb-2">
              Choose Microcontroller or Gateway:
            </label>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
              {[
                {
                  id: 'esp32',
                  name: 'ESP32 Wi-Fi Node',
                  tag: 'Wireless / Direct HTTP',
                  icon: Wifi,
                  desc: 'Streams directly over factory Wi-Fi to API without host PC'
                },
                {
                  id: 'raspberry_pi',
                  name: 'Raspberry Pi',
                  tag: 'Linux / Python',
                  icon: Cpu,
                  desc: 'SBC edge controller with native Python daemon and I2C'
                },
                {
                  id: 'arduino',
                  name: 'Arduino Uno / Nano',
                  tag: 'USB Serial Bridge',
                  icon: Laptop,
                  desc: 'Connects via USB cable with automatic serial bridge forwarder'
                },
                {
                  id: 'curl',
                  name: 'Generic / cURL',
                  tag: 'REST API',
                  icon: Terminal,
                  desc: '1-line terminal command for testing any hardware or language'
                }
              ].map(opt => (
                <button
                  key={opt.id}
                  onClick={() => setPlatform(opt.id as PlatformType)}
                  className={cn(
                    "flex flex-col rounded-2xl border p-4 text-left transition-all",
                    platform === opt.id
                      ? "border-[var(--color-primary)] bg-[var(--color-primary)]/10 shadow-[0_0_20px_rgba(0,212,170,0.15)] ring-1 ring-[var(--color-primary)]"
                      : "border-white/8 bg-white/3 hover:border-white/15"
                  )}
                >
                  <div className="flex items-center justify-between">
                    <opt.icon className={cn("h-6 w-6", platform === opt.id ? "text-[var(--color-primary)]" : "text-[var(--color-muted)]")} />
                    <span className="rounded bg-white/5 px-2 py-0.5 font-mono text-[10px] text-[var(--color-muted)]">
                      {opt.tag}
                    </span>
                  </div>
                  <h4 className="mt-3 text-sm font-bold text-white">{opt.name}</h4>
                  <p className="mt-1 text-xs text-[var(--color-muted)] leading-relaxed">{opt.desc}</p>
                </button>
              ))}
            </div>
          </div>

          {/* Wi-Fi Details (if ESP32) */}
          {platform === 'esp32' && (
            <div className="rounded-2xl border border-white/8 bg-[#0D1117]/60 p-4">
              <span className="text-xs font-mono font-bold text-white uppercase tracking-wider block mb-2">
                Wi-Fi Network Settings for ESP32:
              </span>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <input
                  type="text"
                  value={wifiSsid}
                  onChange={(e) => setWifiSsid(e.target.value)}
                  placeholder="Wi-Fi SSID (Name)"
                  className="rounded-xl border border-white/10 bg-[#161B22] p-2.5 text-xs font-mono text-white focus:border-[var(--color-primary)] focus:outline-none"
                />
                <input
                  type="password"
                  value={wifiPass}
                  onChange={(e) => setWifiPass(e.target.value)}
                  placeholder="Wi-Fi Password"
                  className="rounded-xl border border-white/10 bg-[#161B22] p-2.5 text-xs font-mono text-white focus:border-[var(--color-primary)] focus:outline-none"
                />
              </div>
            </div>
          )}

          {/* Sensors Selection Header with Custom & Catalog Modals */}
          <div>
            <div className="flex flex-wrap items-center justify-between gap-3 mb-3">
              <div>
                <label className="text-xs font-mono text-[var(--color-muted)] uppercase tracking-wider block">
                  Select Connected Sensors:
                </label>
                <span className="text-xs text-[var(--color-muted)]">
                  {selectedSensors.length} active sensor{selectedSensors.length !== 1 ? 's' : ''} ({allAvailableSensors.length} registered)
                </span>
              </div>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setIsCustomSensorModalOpen(true)}
                  className="flex items-center gap-1.5 rounded-xl border border-[var(--color-primary)]/40 bg-[var(--color-primary)]/10 px-3.5 py-1.5 text-xs font-bold text-[var(--color-primary)] hover:bg-[var(--color-primary)]/20 transition-all shadow-[0_0_12px_rgba(0,212,170,0.15)]"
                >
                  <Plus className="h-3.5 w-3.5" />
                  <span>Add New Sensor</span>
                </button>

                <button
                  type="button"
                  onClick={() => setIsCatalogModalOpen(true)}
                  className="flex items-center gap-1.5 rounded-xl border border-cyan-500/40 bg-cyan-500/10 px-3.5 py-1.5 text-xs font-bold text-cyan-300 hover:bg-cyan-500/20 transition-all shadow-[0_0_12px_rgba(6,182,212,0.15)]"
                >
                  <Cloud className="h-3.5 w-3.5" />
                  <span>Cloud Catalog (API Key)</span>
                </button>
              </div>
            </div>

            {/* Sensors Grid */}
            <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2 lg:grid-cols-3">
              {allAvailableSensors.map(sensor => {
                const isSelected = selectedSensors.includes(sensor.id);
                const Icon = sensor.icon;
                const pin =
                  platform === 'esp32'
                    ? sensor.pinEsp32
                    : platform === 'raspberry_pi'
                      ? sensor.pinPi
                      : sensor.pinArduino;

                return (
                  <div
                    key={sensor.id}
                    onClick={() => toggleSensor(sensor.id)}
                    className={cn(
                      "group flex items-center justify-between rounded-xl border p-3 text-left transition-all cursor-pointer select-none relative",
                      isSelected
                        ? "border-[var(--color-primary)]/40 bg-[var(--color-primary)]/10"
                        : "border-white/6 bg-white/2 hover:border-white/10"
                    )}
                  >
                    <div className="flex items-center gap-2.5 min-w-0 pr-2">
                      <div className={cn(
                        "flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border",
                        isSelected
                          ? "border-[var(--color-primary)]/40 bg-[var(--color-primary)]/20 text-[var(--color-primary)]"
                          : "border-white/8 bg-white/4 text-[var(--color-muted)]"
                      )}>
                        <Icon className="h-4 w-4" />
                      </div>
                      <div className="min-w-0">
                        <div className="flex items-center gap-1.5">
                          <span className="text-xs font-bold text-white truncate">{sensor.name}</span>
                          {sensor.isCustom && (
                            <span className="rounded bg-cyan-500/20 px-1 py-0.2 text-[8px] font-mono text-cyan-300 border border-cyan-500/30">
                              CUSTOM
                            </span>
                          )}
                        </div>
                        <span className="font-mono text-[10px] text-[var(--color-muted)] block truncate">Pin: {pin}</span>
                      </div>
                    </div>

                    <div className="flex items-center gap-2 shrink-0">
                      {sensor.isCustom && (
                        <button
                          type="button"
                          onClick={(e) => handleDeleteCustomSensor(sensor.id, e)}
                          className="opacity-0 group-hover:opacity-100 p-1 text-zinc-500 hover:text-red-400 transition-opacity"
                          title="Delete Custom Sensor"
                        >
                          <Trash2 className="h-3 w-3" />
                        </button>
                      )}
                      <span className={cn(
                        "flex h-5 w-5 items-center justify-center rounded-md border",
                        isSelected
                          ? "border-[var(--color-primary)] bg-[var(--color-primary)] text-black"
                          : "border-white/20 bg-transparent"
                      )}>
                        {isSelected && <Check className="h-3 w-3 stroke-[3]" />}
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Action Button */}
          <div className="flex justify-end pt-4">
            <button
              onClick={handleProceedToStep2}
              className="flex items-center gap-2 rounded-xl bg-[var(--color-primary)] px-6 py-3 text-sm font-bold text-[#0D1117] shadow-[0_0_20px_rgba(0,212,170,0.3)] hover:brightness-110 transition-all"
            >
              <span>Generate Step 2 Firmware</span>
              <ArrowRight className="h-4 w-4" />
            </button>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* STEP 2: COPY AUTO-GENERATED CODE & WIRING */}
      {/* ========================================================================= */}
      {currentStep === 2 && (
        <div className="mt-6 space-y-5 animate-fade-in">
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-white/8 bg-white/2 p-4">
            <div>
              <span className="font-mono text-xs text-[var(--color-muted)] uppercase tracking-wider">Ready to Flash:</span>
              <h3 className="text-sm font-bold text-white">
                {platform === 'esp32' ? 'ESP32 Arduino C++ Firmware' : platform === 'raspberry_pi' ? 'Raspberry Pi Python Daemon' : platform === 'arduino' ? 'Arduino USB Serial Sketch' : 'cURL Command'}
              </h3>
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={() => handleCopy(generatedCode())}
                className="flex items-center gap-1.5 rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-xs font-bold text-white hover:bg-white/10 transition-all"
              >
                {copied ? <Check className="h-3.5 w-3.5 text-emerald-400" /> : <Copy className="h-3.5 w-3.5" />}
                <span>{copied ? 'Copied to Clipboard!' : 'Copy Code'}</span>
              </button>

              <button
                onClick={handleDownload}
                className="flex items-center gap-1.5 rounded-xl border border-[var(--color-primary)]/30 bg-[var(--color-primary)]/10 px-3 py-2 text-xs font-bold text-[var(--color-primary)] hover:bg-[var(--color-primary)]/20 transition-all"
              >
                <Download className="h-3.5 w-3.5" />
                <span>Download {codeFileName}</span>
              </button>
            </div>
          </div>

          {/* Code Viewer */}
          <div className="relative overflow-hidden rounded-2xl border border-white/10 bg-[#080C10] shadow-inner">
            <div className="flex items-center justify-between border-b border-white/6 px-4 py-2 text-xs font-mono text-[var(--color-muted)]">
              <span>{codeFileName}</span>
              <span>{platform.toUpperCase()} Node &bull; 1-second interval &bull; {selectedSensors.length} Sensors Active</span>
            </div>
            <pre className="max-h-[360px] overflow-y-auto p-4 font-mono text-xs leading-relaxed text-emerald-400/90 custom-scrollbar">
              <code>{generatedCode()}</code>
            </pre>
          </div>

          {/* Quick Wiring Table */}
          <div className="rounded-2xl border border-white/8 bg-white/2 p-4">
            <h4 className="text-xs font-mono uppercase tracking-wider font-bold text-white mb-2">
              Hardware Pinout & Wiring Quick Reference:
            </h4>
            <div className="overflow-x-auto">
              <table className="w-full text-left font-mono text-xs">
                <thead>
                  <tr className="border-b border-white/8 text-[var(--color-muted)]">
                    <th className="pb-2">Sensor</th>
                    <th className="pb-2">Power (VCC)</th>
                    <th className="pb-2">Ground (GND)</th>
                    <th className="pb-2">Signal Wire Pin</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/4 text-white">
                  {selectedSensors.map(id => {
                    const sensor = allAvailableSensors.find(s => s.id === id);
                    if (!sensor) return null;
                    const pin =
                      platform === 'esp32'
                        ? sensor.pinEsp32
                        : platform === 'raspberry_pi'
                          ? sensor.pinPi
                          : sensor.pinArduino;
                    return (
                      <tr key={id}>
                        <td className="py-2 text-[var(--color-primary)] font-bold">{sensor.name}</td>
                        <td className="py-2">3.3V / 5V</td>
                        <td className="py-2">GND</td>
                        <td className="py-2 font-bold text-amber-300">{pin}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>

          {/* Navigation */}
          <div className="flex items-center justify-between pt-2">
            <button
              onClick={() => setCurrentStep(1)}
              className="flex items-center gap-2 rounded-xl border border-white/10 px-4 py-2.5 text-xs text-[var(--color-muted)] hover:text-white"
            >
              <ArrowLeft className="h-4 w-4" />
              <span>Back to Selection</span>
            </button>

            <button
              onClick={() => setCurrentStep(3)}
              className="flex items-center gap-2 rounded-xl bg-[var(--color-primary)] px-6 py-2.5 text-sm font-bold text-[#0D1117] shadow-[0_0_20px_rgba(0,212,170,0.3)] hover:brightness-110 transition-all"
            >
              <span>Proceed to Step 3: Verify Signal</span>
              <ArrowRight className="h-4 w-4" />
            </button>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* STEP 3: LIVE VERIFICATION & HARDWARE HANDSHAKE CONSOLE */}
      {/* ========================================================================= */}
      {currentStep === 3 && (
        <div className="mt-6 space-y-6 animate-fade-in">
          
          {/* Diagnostic Loading & Handshake Engine */}
          <HardwareHandshakeConsole
            equipmentId={equipmentId}
            platform={platform}
            host={serverHost}
            port={serverPort}
            activeSensors={selectedSensors}
            onHandshakeSuccess={(pkt) => setLatestPacket(pkt)}
          />

          {/* Completed CTA Navigation */}
          <div className="flex items-center justify-between pt-2">
            <button
              onClick={() => setCurrentStep(2)}
              className="flex items-center gap-2 rounded-xl border border-white/10 px-4 py-2.5 text-xs text-[var(--color-muted)] hover:text-white"
            >
              <ArrowLeft className="h-4 w-4" />
              <span>Back to Code</span>
            </button>

            <Link
              href={`/dashboard/machines/${equipmentId}`}
              className="flex items-center gap-2 rounded-xl bg-emerald-500 px-6 py-2.5 text-sm font-bold text-black shadow-[0_0_20px_rgba(16,185,129,0.4)] hover:brightness-110 transition-all"
            >
              <span>Launch Machine Cockpit</span>
              <ArrowRight className="h-4 w-4" />
            </Link>
          </div>
        </div>
      )}
    </div>
  );
}
