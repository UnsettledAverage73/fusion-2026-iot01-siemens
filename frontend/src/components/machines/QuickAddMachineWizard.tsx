'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import {
  Activity,
  AlertTriangle,
  ArrowLeft,
  ArrowRight,
  CheckCircle2,
  ChevronRight,
  Code2,
  Copy,
  Cpu,
  Download,
  Flame,
  Gauge,
  Layers,
  Loader2,
  Play,
  Plus,
  RefreshCw,
  ShieldAlert,
  Sliders,
  Sparkles,
  Terminal,
  Thermometer,
  Trash2,
  Usb,
  X,
  Zap
} from 'lucide-react';
import { api } from '@/lib/api';
import { cn } from '@/lib/utils';

interface QuickAddMachineWizardProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess?: (machineId: string) => void;
}

interface CustomSensor {
  id?: string;
  name: string;
  metric: string;
  pin: string;
  unit: string;
  normal_min: number;
  normal_max: number;
  warning_threshold: number;
  critical_threshold: number;
  calibration_formula?: string;
  description?: string;
}

export function QuickAddMachineWizard({ isOpen, onClose, onSuccess }: QuickAddMachineWizardProps) {
  const router = useRouter();

  // Step state
  const [currentStep, setCurrentStep] = useState<1 | 2 | 3>(1);

  // Template & Machine info
  const [templates, setTemplates] = useState<Record<string, any>>({});
  const [selectedTemplateKey, setSelectedTemplateKey] = useState<string>('induction_motor');
  const [machineId, setMachineId] = useState<string>('MTR-IND-01');
  const [machineName, setMachineName] = useState<string>('Heavy-Duty 3-Phase Induction Motor');
  const [board, setBoard] = useState<string>('esp32');

  // Sensors & Thresholds
  const [selectedSensors, setSelectedSensors] = useState<string[]>([
    'temperature',
    'current_draw',
    'vibration_rms',
    'button'
  ]);
  const [customSensors, setCustomSensors] = useState<CustomSensor[]>([]);
  const [criticalTemp, setCriticalTemp] = useState<number>(85.0);
  const [sampleRateHz, setSampleRateHz] = useState<number>(1);

  // Custom sensor inline form
  const [isAddingCustom, setIsAddingCustom] = useState<boolean>(false);
  const [customForm, setCustomForm] = useState<CustomSensor>({
    name: 'Bearing Oil Pressure',
    metric: 'oil_pressure',
    pin: 'GPIO 36',
    unit: 'bar',
    normal_min: 2.0,
    normal_max: 6.0,
    warning_threshold: 1.5,
    critical_threshold: 1.0,
    calibration_formula: 'x * (6.0 / 4095.0)',
    description: 'Lubrication header pressure monitoring'
  });

  // Step 3: Firmware & Flashing
  const [generatedSketch, setGeneratedSketch] = useState<string>('');
  const [ports, setPorts] = useState<Array<{ port: string; label: string; board: string }>>([]);
  const [selectedPort, setSelectedPort] = useState<string>('/dev/ttyUSB0');
  const [isGenerating, setIsGenerating] = useState<boolean>(false);
  const [isCompiling, setIsCompiling] = useState<boolean>(false);
  const [isFlashing, setIsFlashing] = useState<boolean>(false);
  const [isRegistering, setIsRegistering] = useState<boolean>(false);
  const [actionLog, setActionLog] = useState<string>('');
  const [compilationSuccess, setCompilationSuccess] = useState<boolean | null>(null);
  const [flashSuccess, setFlashSuccess] = useState<boolean | null>(null);
  const [copiedCode, setCopiedCode] = useState<boolean>(false);

  // Load Templates & Ports on Mount
  useEffect(() => {
    if (!isOpen) return;

    const loadData = async () => {
      try {
        const [temps, portsData] = await Promise.all([
          api.getFirmwareTemplates(),
          api.getFirmwarePorts()
        ]);
        setTemplates(temps || {});
        if (portsData?.ports?.length) {
          setPorts(portsData.ports);
          setSelectedPort(portsData.ports[0].port);
        }
      } catch (err) {
        console.error('Failed to load firmware setup data:', err);
      }
    };

    loadData();
  }, [isOpen]);

  // Sync selected template defaults
  const handleSelectTemplate = (key: string) => {
    setSelectedTemplateKey(key);
    const tmpl = templates[key];
    if (tmpl) {
      const generatedId = `${key.slice(0, 3).toUpperCase()}-${Math.floor(100 + Math.random() * 900)}`;
      setMachineId(generatedId);
      setMachineName(tmpl.name || 'Industrial Asset');
      if (tmpl.recommended_critical_temp) {
        setCriticalTemp(tmpl.recommended_critical_temp);
      }
      if (tmpl.default_sensors) {
        setSelectedSensors(tmpl.default_sensors);
      }
    }
  };

  // Toggle Standard Sensor
  const toggleSensor = (sensorKey: string) => {
    setSelectedSensors((prev) =>
      prev.includes(sensorKey) ? prev.filter((s) => s !== sensorKey) : [...prev, sensorKey]
    );
  };

  // Add Custom Sensor
  const handleAddCustomSensor = () => {
    if (!customForm.metric || !customForm.name) return;
    setCustomSensors((prev) => [...prev, { ...customForm, id: `${machineId}_${customForm.metric}` }]);
    setIsAddingCustom(false);
    setCustomForm({
      name: '',
      metric: '',
      pin: 'GPIO 36',
      unit: 'units',
      normal_min: 0,
      normal_max: 100,
      warning_threshold: 85,
      critical_threshold: 95,
      calibration_formula: 'x * (3.3 / 4095.0)',
      description: ''
    });
  };

  const handleRemoveCustomSensor = (idx: number) => {
    setCustomSensors((prev) => prev.filter((_, i) => i !== idx));
  };

  // Generate Arduino Code
  const handleGenerateCode = async () => {
    setIsGenerating(true);
    setActionLog('Generating tailored C/C++ firmware sketch...');
    try {
      const res = await api.generateFirmwareSketch({
        machine_id: machineId,
        machine_name: machineName,
        board: board,
        selected_sensors: selectedSensors,
        custom_sensors: customSensors,
        critical_temperature: criticalTemp,
        sample_rate_hz: sampleRateHz
      });
      setGeneratedSketch(res.sketch_code || '');
      setActionLog(`Firmware generated successfully for ${machineId} (${board.toUpperCase()}). Ready for compilation & flashing.`);
      setCurrentStep(3);
    } catch (err: any) {
      setActionLog(`Error generating sketch: ${err.message || err}`);
    } finally {
      setIsGenerating(false);
    }
  };

  // Refresh Serial Ports
  const handleRefreshPorts = async () => {
    try {
      const res = await api.getFirmwarePorts();
      if (res?.ports?.length) {
        setPorts(res.ports);
        setSelectedPort(res.ports[0].port);
        setActionLog(`Found ${res.ports.length} connected serial device(s).`);
      } else {
        setActionLog('No serial ports detected. Check USB connection.');
      }
    } catch (err: any) {
      setActionLog(`Failed to scan ports: ${err.message || err}`);
    }
  };

  // Compile via arduino-cli
  const handleCompileOnly = async () => {
    if (!generatedSketch) return;
    setIsCompiling(true);
    setCompilationSuccess(null);
    setActionLog('Compiling sketch in sandbox with arduino-cli...');
    try {
      const res = await api.compileFirmwareSketch({
        sketch_code: generatedSketch,
        board: board
      });
      setCompilationSuccess(res.success);
      setActionLog(res.output || (res.success ? 'Compilation succeeded!' : 'Compilation failed.'));
    } catch (err: any) {
      setCompilationSuccess(false);
      setActionLog(`Compilation error: ${err.message || err}`);
    } finally {
      setIsCompiling(false);
    }
  };

  // Direct Hardware Flash via arduino-cli
  const handleFlashMicrocontroller = async () => {
    if (!generatedSketch) return;
    setIsFlashing(true);
    setFlashSuccess(null);
    setActionLog(`Starting compile and upload to ${selectedPort} using arduino-cli...`);
    try {
      const res = await api.flashMicrocontroller({
        sketch_code: generatedSketch,
        port: selectedPort,
        board: board
      });
      setFlashSuccess(res.success);
      setActionLog(res.output || (res.success ? 'Upload complete! Hardware is transmitting telemetry.' : 'Upload failed.'));
    } catch (err: any) {
      setFlashSuccess(false);
      setActionLog(`Flashing failure: ${err.message || err}`);
    } finally {
      setIsFlashing(false);
    }
  };

  // 1-Click Register Machine & Finish
  const handleRegisterAndFinish = async () => {
    setIsRegistering(true);
    try {
      await api.quickCreateMachine({
        machine_id: machineId,
        machine_name: machineName,
        template_id: selectedTemplateKey,
        critical_temperature: criticalTemp,
        selected_sensors: selectedSensors,
        custom_sensors: customSensors
      });

      if (onSuccess) {
        onSuccess(machineId);
      }
      onClose();
      router.push(`/dashboard/machines/${machineId}`);
    } catch (err: any) {
      setActionLog(`Failed to register machine: ${err.message || err}`);
    } finally {
      setIsRegistering(false);
    }
  };

  const handleCopyCode = () => {
    if (!generatedSketch) return;
    navigator.clipboard.writeText(generatedSketch);
    setCopiedCode(true);
    setTimeout(() => setCopiedCode(false), 2000);
  };

  const handleDownloadIno = () => {
    if (!generatedSketch) return;
    const blob = new Blob([generatedSketch], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${machineId.toLowerCase().replace(/[^a-z0-9_-]/g, '_')}_firmware.ino`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  if (!isOpen) return null;

  const currentTemplate = templates[selectedTemplateKey];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-md p-4 sm:p-6 overflow-y-auto animate-in fade-in duration-200">
      <div className="relative w-full max-w-5xl rounded-3xl border border-[var(--color-border)] bg-[var(--color-surface)] shadow-2xl flex flex-col max-h-[92vh] overflow-hidden">
        
        {/* Modal Header */}
        <div className="flex items-center justify-between border-b border-[var(--color-border)] px-6 py-4 bg-[var(--color-background)]/80">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-emerald-500/10 text-emerald-500 border border-emerald-500/20">
              <Zap className="h-5 w-5" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-[var(--color-foreground)] flex items-center gap-2">
                Quick Add Machine & Microcontroller Flasher
                <span className="text-[10px] font-mono uppercase bg-emerald-500/10 text-emerald-400 px-2 py-0.5 rounded-full border border-emerald-500/30">
                  arduino-cli native
                </span>
              </h2>
              <p className="text-xs text-[var(--color-muted)]">
                Guided 3-step setup: Industry Failure Modes → Custom Sensors & Alerts → 1-Click Hardware Flashing
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="rounded-xl p-2 text-[var(--color-muted)] hover:bg-[var(--color-surface-hover)] hover:text-[var(--color-foreground)] transition-colors"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Step Indicator Bar */}
        <div className="flex items-center justify-between border-b border-[var(--color-border)]/60 bg-[var(--color-surface)] px-8 py-3 text-xs">
          <button
            onClick={() => setCurrentStep(1)}
            className={cn(
              "flex items-center gap-2 font-medium transition-colors",
              currentStep === 1 ? "text-emerald-400 font-semibold" : "text-[var(--color-muted)] hover:text-white"
            )}
          >
            <span className={cn(
              "flex h-6 w-6 items-center justify-center rounded-full text-[11px]",
              currentStep === 1 ? "bg-emerald-500 text-black font-bold" : "bg-[var(--color-surface-hover)] text-zinc-400"
            )}>1</span>
            Machine & Industry Template
          </button>

          <ChevronRight className="h-4 w-4 text-[var(--color-muted)]" />

          <button
            onClick={() => setCurrentStep(2)}
            className={cn(
              "flex items-center gap-2 font-medium transition-colors",
              currentStep === 2 ? "text-emerald-400 font-semibold" : "text-[var(--color-muted)] hover:text-white"
            )}
          >
            <span className={cn(
              "flex h-6 w-6 items-center justify-center rounded-full text-[11px]",
              currentStep === 2 ? "bg-emerald-500 text-black font-bold" : "bg-[var(--color-surface-hover)] text-zinc-400"
            )}>2</span>
            Sensors & Critical Thresholds
          </button>

          <ChevronRight className="h-4 w-4 text-[var(--color-muted)]" />

          <button
            onClick={() => {
              if (generatedSketch) setCurrentStep(3);
            }}
            className={cn(
              "flex items-center gap-2 font-medium transition-colors",
              currentStep === 3 ? "text-emerald-400 font-semibold" : "text-[var(--color-muted)] hover:text-white"
            )}
          >
            <span className={cn(
              "flex h-6 w-6 items-center justify-center rounded-full text-[11px]",
              currentStep === 3 ? "bg-emerald-500 text-black font-bold" : "bg-[var(--color-surface-hover)] text-zinc-400"
            )}>3</span>
            Arduino Code & Flash Microcontroller
          </button>
        </div>

        {/* Modal Scrollable Body */}
        <div className="flex-1 overflow-y-auto p-6 space-y-6">
          
          {/* ================= STEP 1: MACHINE & TEMPLATE ================= */}
          {currentStep === 1 && (
            <div className="space-y-6 animate-in fade-in duration-300">
              {/* Machine Identifiers */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div>
                  <label className="text-xs font-semibold text-[var(--color-muted)] uppercase tracking-wider block mb-1">
                    Machine ID
                  </label>
                  <input
                    type="text"
                    value={machineId}
                    onChange={(e) => setMachineId(e.target.value.toUpperCase())}
                    className="w-full rounded-xl border border-[var(--color-border)] bg-[var(--color-background)] px-3 py-2 text-sm text-[var(--color-foreground)] font-mono outline-none focus:border-emerald-500"
                    placeholder="e.g. MTR-IND-01"
                  />
                  <p className="text-[11px] text-[var(--color-muted)] mt-1">Unique asset tag for telemetry ingestion</p>
                </div>

                <div>
                  <label className="text-xs font-semibold text-[var(--color-muted)] uppercase tracking-wider block mb-1">
                    Machine Name
                  </label>
                  <input
                    type="text"
                    value={machineName}
                    onChange={(e) => setMachineName(e.target.value)}
                    className="w-full rounded-xl border border-[var(--color-border)] bg-[var(--color-background)] px-3 py-2 text-sm text-[var(--color-foreground)] outline-none focus:border-emerald-500"
                    placeholder="e.g. Induction Motor - Line 1"
                  />
                  <p className="text-[11px] text-[var(--color-muted)] mt-1">Human readable asset title</p>
                </div>

                <div>
                  <label className="text-xs font-semibold text-[var(--color-muted)] uppercase tracking-wider block mb-1">
                    Target Microcontroller
                  </label>
                  <select
                    value={board}
                    onChange={(e) => setBoard(e.target.value)}
                    className="w-full rounded-xl border border-[var(--color-border)] bg-[var(--color-background)] px-3 py-2 text-sm text-[var(--color-foreground)] outline-none focus:border-emerald-500"
                  >
                    <option value="esp32">ESP32 Dev Module (Recommended - 115200)</option>
                    <option value="arduino_uno">Arduino Uno (ATmega328P)</option>
                    <option value="arduino_mega">Arduino Mega 2560</option>
                  </select>
                  <p className="text-[11px] text-[var(--color-muted)] mt-1">Microcontroller compilation target</p>
                </div>
              </div>

              {/* Industry Machine Templates Selector */}
              <div>
                <div className="flex items-center justify-between mb-3">
                  <div>
                    <h3 className="text-sm font-semibold text-[var(--color-foreground)] flex items-center gap-2">
                      <Layers className="h-4 w-4 text-emerald-400" />
                      Select Industrial Machine Template (8 Extended Standards)
                    </h3>
                    <p className="text-xs text-[var(--color-muted)]">
                      Pre-calibrated with ISO/IEEE standards, failure physics models, and recommended thresholds
                    </p>
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3">
                  {Object.entries(templates).map(([key, tmpl]: [string, any]) => {
                    const isSelected = selectedTemplateKey === key;
                    return (
                      <div
                        key={key}
                        onClick={() => handleSelectTemplate(key)}
                        className={cn(
                          "cursor-pointer rounded-2xl border p-4 transition-all duration-200 flex flex-col justify-between text-left",
                          isSelected
                            ? "border-emerald-500/80 bg-emerald-500/10 shadow-lg shadow-emerald-500/5 ring-1 ring-emerald-500"
                            : "border-[var(--color-border)] bg-[var(--color-background)] hover:border-[var(--color-border-hover)] hover:bg-[var(--color-surface)]"
                        )}
                      >
                        <div>
                          <div className="flex items-center justify-between mb-1.5">
                            <span className="text-[10px] font-mono uppercase bg-[var(--color-surface)] border border-[var(--color-border)] px-1.5 py-0.5 rounded text-[var(--color-muted)]">
                              {tmpl.category}
                            </span>
                            {isSelected && (
                              <CheckCircle2 className="h-4 w-4 text-emerald-400" />
                            )}
                          </div>
                          <h4 className="text-xs font-bold text-[var(--color-foreground)] leading-tight mb-1">
                            {tmpl.name}
                          </h4>
                          <span className="text-[10px] text-emerald-400 font-mono block mb-2">
                            {tmpl.standard}
                          </span>
                          <p className="text-[11px] text-[var(--color-muted)] line-clamp-2 leading-relaxed">
                            {tmpl.description}
                          </p>
                        </div>

                        <div className="mt-3 pt-2 border-t border-[var(--color-border)]/50 flex items-center justify-between text-[10px]">
                          <span className="text-[var(--color-muted)]">Crit Temp:</span>
                          <span className="font-semibold text-rose-400 font-mono">
                            {tmpl.recommended_critical_temp}°C
                          </span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Detailed Engineering Analysis Box for Selected Template */}
              {currentTemplate && (
                <div className="rounded-2xl border border-[var(--color-border)] bg-[var(--color-background)] p-4 space-y-3">
                  <div className="flex items-center justify-between border-b border-[var(--color-border)]/50 pb-2">
                    <div className="flex items-center gap-2">
                      <ShieldAlert className="h-4 w-4 text-amber-400" />
                      <span className="text-xs font-bold uppercase tracking-wider text-[var(--color-foreground)]">
                        Engineering Failure Mode Analysis: {currentTemplate.name}
                      </span>
                    </div>
                    <span className="text-xs font-mono text-[var(--color-muted)]">
                      Standard: {currentTemplate.standard}
                    </span>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-xs">
                    <div>
                      <span className="text-[var(--color-muted)] block mb-1 font-medium">Critical Failure Modes:</span>
                      <ul className="space-y-1">
                        {currentTemplate.failure_modes?.map((mode: string, idx: number) => (
                          <li key={idx} className="flex items-center gap-2 text-amber-200/90 text-[11px]">
                            <span className="h-1.5 w-1.5 rounded-full bg-amber-400" />
                            {mode}
                          </li>
                        ))}
                      </ul>
                    </div>

                    <div>
                      <span className="text-[var(--color-muted)] block mb-1 font-medium">Recommended Parameters:</span>
                      <div className="flex flex-wrap gap-1.5">
                        {currentTemplate.parameters?.map((p: any, idx: number) => (
                          <span
                            key={idx}
                            className="bg-[var(--color-surface)] border border-[var(--color-border)] px-2 py-0.5 rounded text-[10px] font-mono text-zinc-300"
                          >
                            {p.display_name} (Crit: {p.critical_threshold} {p.unit})
                          </span>
                        ))}
                      </div>
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* ================= STEP 2: SENSORS & CRITICAL TEMP ================= */}
          {currentStep === 2 && (
            <div className="space-y-6 animate-in fade-in duration-300">
              
              {/* Critical Temperature Slider & Sentinel Integration Alert */}
              <div className="rounded-3xl border border-rose-500/30 bg-gradient-to-r from-rose-950/20 to-orange-950/20 p-5 space-y-4 shadow-lg">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-rose-500/20 text-rose-400 border border-rose-500/30">
                      <Flame className="h-5 w-5" />
                    </div>
                    <div>
                      <h3 className="text-sm font-bold text-white flex items-center gap-2">
                        Real-Time Critical Temperature Threshold
                        <span className="text-[10px] font-mono bg-rose-500/20 text-rose-300 px-2 py-0.5 rounded-full border border-rose-500/30">
                          Automated Sentinel Trigger
                        </span>
                      </h3>
                      <p className="text-xs text-rose-200/70">
                        Governs edge MCU hardware interlock, Grok/Sarvam RAG Sentinel, and Slack alerts (#all-average)
                      </p>
                    </div>
                  </div>
                  <div className="text-right">
                    <span className="text-2xl font-bold font-mono text-rose-400">{criticalTemp.toFixed(1)}</span>
                    <span className="text-sm font-bold text-rose-400 ml-1">°C</span>
                  </div>
                </div>

                <div className="space-y-2">
                  <input
                    type="range"
                    min="40"
                    max="140"
                    step="0.5"
                    value={criticalTemp}
                    onChange={(e) => setCriticalTemp(parseFloat(e.target.value))}
                    className="w-full accent-rose-500 cursor-pointer h-2 bg-zinc-800 rounded-lg"
                  />
                  <div className="flex justify-between text-[10px] font-mono text-zinc-400">
                    <span>40.0°C (Light Duty)</span>
                    <span className="text-amber-400 font-semibold">Warning: {(criticalTemp * 0.9).toFixed(1)}°C (90%)</span>
                    <span className="text-rose-400 font-bold">Trip: {criticalTemp.toFixed(1)}°C</span>
                    <span>140.0°C (High Temp Furnace)</span>
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 pt-2 text-[11px] border-t border-rose-500/20">
                  <div className="flex items-center gap-2 text-rose-200/80">
                    <span className="h-2 w-2 rounded-full bg-rose-500 animate-pulse" />
                    <span>1. Onboard LED (GPIO 2) locks HIGH</span>
                  </div>
                  <div className="flex items-center gap-2 text-rose-200/80">
                    <span className="h-2 w-2 rounded-full bg-rose-500 animate-pulse" />
                    <span>2. RAG Sentinel evaluates physics & ML</span>
                  </div>
                  <div className="flex items-center gap-2 text-rose-200/80">
                    <span className="h-2 w-2 rounded-full bg-rose-500 animate-pulse" />
                    <span>3. Dispatches Slack alert to #all-average</span>
                  </div>
                </div>
              </div>

              {/* Standard Sensors Configurator */}
              <div>
                <h3 className="text-sm font-semibold text-[var(--color-foreground)] flex items-center gap-2 mb-3">
                  <Sliders className="h-4 w-4 text-emerald-400" />
                  Select & Pin-Map Configurable Sensors
                </h3>

                <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
                  {[
                    {
                      id: 'temperature',
                      name: 'Temperature & Humidity',
                      sensor: 'DHT11 / DHT22',
                      pin: 'GPIO 4',
                      unit: '°C / %',
                      desc: 'Monitors thermal runaway & ambient moisture'
                    },
                    {
                      id: 'current_draw',
                      name: 'Current Draw & Power',
                      sensor: 'ACS712 Hall Sensor',
                      pin: 'GPIO 34 (ADC)',
                      unit: 'Amps',
                      desc: 'Quiescent baseline & motor load sensing'
                    },
                    {
                      id: 'vibration_rms',
                      name: 'Vibration RMS (ISO 10816)',
                      sensor: 'MPU6050 6-Axis I2C',
                      pin: 'SDA:21 | SCL:22',
                      unit: 'mm/s RMS',
                      desc: 'Bearing chatter & structural vibration'
                    },
                    {
                      id: 'rpm',
                      name: 'Rotational Speed / RPM',
                      sensor: 'Hall Effect Switch',
                      pin: 'GPIO 25 (D0) / 35 (A0)',
                      unit: 'RPM',
                      desc: 'Shaft tachometer & pulse counter'
                    },
                    {
                      id: 'button',
                      name: 'Emergency Stop Button',
                      sensor: 'Tactile Switch',
                      pin: 'GPIO 27 (Pull-Up)',
                      unit: 'Digital',
                      desc: 'Operator emergency trip & diagnostic ping'
                    }
                  ].map((s) => {
                    const isChecked = selectedSensors.includes(s.id);
                    return (
                      <div
                        key={s.id}
                        onClick={() => toggleSensor(s.id)}
                        className={cn(
                          "cursor-pointer rounded-2xl border p-4 transition-all duration-200 select-none",
                          isChecked
                            ? "border-emerald-500/80 bg-emerald-500/10 shadow-sm"
                            : "border-[var(--color-border)] bg-[var(--color-background)] opacity-60 hover:opacity-100"
                        )}
                      >
                        <div className="flex items-center justify-between mb-2">
                          <span className="text-xs font-bold text-[var(--color-foreground)]">{s.name}</span>
                          <input
                            type="checkbox"
                            checked={isChecked}
                            readOnly
                            className="h-4 w-4 rounded accent-emerald-500"
                          />
                        </div>
                        <div className="flex items-center justify-between text-[11px] font-mono text-emerald-400 mb-1">
                          <span>{s.sensor}</span>
                          <span className="bg-zinc-800 text-zinc-300 px-1.5 py-0.5 rounded text-[10px]">{s.pin}</span>
                        </div>
                        <p className="text-[11px] text-[var(--color-muted)] leading-tight">{s.desc}</p>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Custom Sensor Support (User Idea: Any sensor can be added) */}
              <div className="rounded-2xl border border-[var(--color-border)] bg-[var(--color-background)] p-4 space-y-4">
                <div className="flex items-center justify-between">
                  <div>
                    <h3 className="text-sm font-semibold text-[var(--color-foreground)] flex items-center gap-2">
                      <Sparkles className="h-4 w-4 text-emerald-400" />
                      Add Custom Sensors (Analog / Digital / Voltage Divider)
                    </h3>
                    <p className="text-xs text-[var(--color-muted)]">
                      Connect non-standard transducers (e.g. pressure, gas, flow, ultrasonic) with custom pin mapping
                    </p>
                  </div>
                  {!isAddingCustom && (
                    <button
                      onClick={() => setIsAddingCustom(true)}
                      className="flex items-center gap-1.5 rounded-xl bg-emerald-500/10 border border-emerald-500/30 px-3 py-1.5 text-xs font-semibold text-emerald-400 hover:bg-emerald-500/20 transition-colors"
                    >
                      <Plus className="h-3.5 w-3.5" />
                      Add Sensor
                    </button>
                  )}
                </div>

                {/* Custom sensors list */}
                {customSensors.length > 0 && (
                  <div className="space-y-2">
                    {customSensors.map((cs, idx) => (
                      <div
                        key={idx}
                        className="flex items-center justify-between rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-2 text-xs"
                      >
                        <div className="flex items-center gap-3">
                          <span className="font-semibold text-white">{cs.name}</span>
                          <span className="font-mono text-emerald-400 text-[11px]">Pin: {cs.pin}</span>
                          <span className="font-mono text-[var(--color-muted)] text-[11px]">Key: {cs.metric}</span>
                          <span className="text-zinc-400 text-[11px]">Crit: {cs.critical_threshold} {cs.unit}</span>
                        </div>
                        <button
                          onClick={() => handleRemoveCustomSensor(idx)}
                          className="text-rose-400 hover:text-rose-300 p-1"
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </div>
                    ))}
                  </div>
                )}

                {/* Inline Add Custom Sensor Form */}
                {isAddingCustom && (
                  <div className="rounded-xl border border-emerald-500/30 bg-emerald-950/10 p-4 space-y-3">
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                      <div>
                        <label className="text-[11px] font-semibold text-[var(--color-muted)] block mb-1">Sensor Name</label>
                        <input
                          type="text"
                          value={customForm.name}
                          onChange={(e) => setCustomForm({ ...customForm, name: e.target.value })}
                          placeholder="e.g. Lube Oil Pressure"
                          className="w-full rounded-lg border border-[var(--color-border)] bg-[var(--color-background)] px-2.5 py-1.5 text-xs text-white"
                        />
                      </div>
                      <div>
                        <label className="text-[11px] font-semibold text-[var(--color-muted)] block mb-1">Metric Key (JSON)</label>
                        <input
                          type="text"
                          value={customForm.metric}
                          onChange={(e) => setCustomForm({ ...customForm, metric: e.target.value.toLowerCase().replace(/\s+/g, '_') })}
                          placeholder="e.g. oil_pressure"
                          className="w-full rounded-lg border border-[var(--color-border)] bg-[var(--color-background)] px-2.5 py-1.5 text-xs font-mono text-emerald-400"
                        />
                      </div>
                      <div>
                        <label className="text-[11px] font-semibold text-[var(--color-muted)] block mb-1">Microcontroller Pin</label>
                        <input
                          type="text"
                          value={customForm.pin}
                          onChange={(e) => setCustomForm({ ...customForm, pin: e.target.value })}
                          placeholder="e.g. GPIO 36"
                          className="w-full rounded-lg border border-[var(--color-border)] bg-[var(--color-background)] px-2.5 py-1.5 text-xs font-mono text-white"
                        />
                      </div>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-4 gap-3">
                      <div>
                        <label className="text-[11px] font-semibold text-[var(--color-muted)] block mb-1">Unit</label>
                        <input
                          type="text"
                          value={customForm.unit}
                          onChange={(e) => setCustomForm({ ...customForm, unit: e.target.value })}
                          placeholder="e.g. bar, psi, ppm"
                          className="w-full rounded-lg border border-[var(--color-border)] bg-[var(--color-background)] px-2.5 py-1.5 text-xs text-white"
                        />
                      </div>
                      <div>
                        <label className="text-[11px] font-semibold text-[var(--color-muted)] block mb-1">Normal Max</label>
                        <input
                          type="number"
                          value={customForm.normal_max}
                          onChange={(e) => setCustomForm({ ...customForm, normal_max: parseFloat(e.target.value) || 0 })}
                          className="w-full rounded-lg border border-[var(--color-border)] bg-[var(--color-background)] px-2.5 py-1.5 text-xs text-white"
                        />
                      </div>
                      <div>
                        <label className="text-[11px] font-semibold text-[var(--color-muted)] block mb-1">Warning Threshold</label>
                        <input
                          type="number"
                          value={customForm.warning_threshold}
                          onChange={(e) => setCustomForm({ ...customForm, warning_threshold: parseFloat(e.target.value) || 0 })}
                          className="w-full rounded-lg border border-[var(--color-border)] bg-[var(--color-background)] px-2.5 py-1.5 text-xs text-amber-300"
                        />
                      </div>
                      <div>
                        <label className="text-[11px] font-semibold text-[var(--color-muted)] block mb-1">Critical Threshold</label>
                        <input
                          type="number"
                          value={customForm.critical_threshold}
                          onChange={(e) => setCustomForm({ ...customForm, critical_threshold: parseFloat(e.target.value) || 0 })}
                          className="w-full rounded-lg border border-[var(--color-border)] bg-[var(--color-background)] px-2.5 py-1.5 text-xs text-rose-400"
                        />
                      </div>
                    </div>

                    <div className="flex items-center justify-end gap-2 pt-2">
                      <button
                        onClick={() => setIsAddingCustom(false)}
                        className="px-3 py-1.5 text-xs text-zinc-400 hover:text-white"
                      >
                        Cancel
                      </button>
                      <button
                        onClick={handleAddCustomSensor}
                        className="rounded-lg bg-emerald-500 px-4 py-1.5 text-xs font-semibold text-black hover:bg-emerald-400 transition-colors"
                      >
                        Confirm Sensor
                      </button>
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* ================= STEP 3: ARDUINO CODE & FLASHING ================= */}
          {currentStep === 3 && (
            <div className="space-y-6 animate-in fade-in duration-300">
              
              {/* Direct Hardware Flashing Console */}
              <div className="rounded-3xl border border-emerald-500/30 bg-gradient-to-b from-[var(--color-surface)] to-[var(--color-background)] p-5 space-y-4">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                  <div className="flex items-center gap-3">
                    <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                      <Cpu className="h-5 w-5" />
                    </div>
                    <div>
                      <h3 className="text-sm font-bold text-white flex items-center gap-2">
                        Direct Microcontroller Flasher (arduino-cli)
                        {flashSuccess === true && (
                          <span className="text-[10px] bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 px-2 py-0.5 rounded-full">
                            SUCCESSFULLY FLASHED
                          </span>
                        )}
                      </h3>
                      <p className="text-xs text-[var(--color-muted)]">
                        Compiles and uploads C/C++ sketch to your plugged ESP32 without opening Arduino IDE
                      </p>
                    </div>
                  </div>

                  {/* Serial Port Selector */}
                  <div className="flex items-center gap-2">
                    <select
                      value={selectedPort}
                      onChange={(e) => setSelectedPort(e.target.value)}
                      className="rounded-xl border border-[var(--color-border)] bg-[var(--color-background)] px-3 py-2 text-xs font-mono text-emerald-400 outline-none"
                    >
                      {ports.map((p, idx) => (
                        <option key={idx} value={p.port}>
                          {p.label}
                        </option>
                      ))}
                    </select>

                    <button
                      onClick={handleRefreshPorts}
                      title="Scan Serial Ports"
                      className="rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] p-2 text-zinc-300 hover:text-white hover:bg-[var(--color-surface-hover)]"
                    >
                      <RefreshCw className="h-4 w-4" />
                    </button>
                  </div>
                </div>

                {/* Action Buttons */}
                <div className="flex flex-wrap items-center gap-3 pt-2">
                  <button
                    onClick={handleCompileOnly}
                    disabled={isCompiling || isFlashing}
                    className="flex items-center gap-2 rounded-xl border border-zinc-700 bg-zinc-800/80 px-4 py-2 text-xs font-semibold text-white hover:bg-zinc-700 disabled:opacity-50 transition-colors"
                  >
                    {isCompiling ? <Loader2 className="h-4 w-4 animate-spin text-emerald-400" /> : <Terminal className="h-4 w-4 text-emerald-400" />}
                    <span>1. Compile Test Only</span>
                  </button>

                  <button
                    onClick={handleFlashMicrocontroller}
                    disabled={isCompiling || isFlashing}
                    className="flex items-center gap-2 rounded-xl bg-emerald-500 px-5 py-2 text-xs font-bold text-black hover:bg-emerald-400 disabled:opacity-50 transition-all shadow-lg shadow-emerald-500/20"
                  >
                    {isFlashing ? <Loader2 className="h-4 w-4 animate-spin" /> : <Usb className="h-4 w-4" />}
                    <span>2. Flash Microcontroller ({selectedPort})</span>
                  </button>

                  <button
                    onClick={handleRegisterAndFinish}
                    disabled={isRegistering}
                    className="ml-auto flex items-center gap-2 rounded-xl border border-emerald-500/50 bg-emerald-500/20 px-5 py-2 text-xs font-bold text-emerald-300 hover:bg-emerald-500/30 transition-colors"
                  >
                    {isRegistering ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}
                    <span>3. Register Machine & Go To Fleet</span>
                  </button>
                </div>

                {/* Compilation / Flashing Live Terminal Log */}
                <div className="rounded-2xl border border-zinc-800 bg-black/90 p-4 font-mono text-[11px] text-zinc-300 space-y-2">
                  <div className="flex items-center justify-between text-[10px] text-zinc-500 border-b border-zinc-800 pb-1.5">
                    <span className="flex items-center gap-1.5">
                      <Terminal className="h-3 w-3 text-emerald-400" />
                      arduino-cli stdout & esptool flash log
                    </span>
                    <span>Baud: 115200</span>
                  </div>
                  <pre className="max-h-36 overflow-y-auto whitespace-pre-wrap leading-relaxed text-zinc-300">
                    {actionLog || "Ready to compile or flash. Connect your ESP32 via USB and click 'Flash Microcontroller' above."}
                  </pre>
                </div>
              </div>

              {/* Code Preview & Download */}
              <div className="rounded-2xl border border-[var(--color-border)] bg-[var(--color-background)] p-4 space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Code2 className="h-4 w-4 text-emerald-400" />
                    <span className="text-xs font-bold text-white uppercase tracking-wider">
                      Generated Production Arduino Sketch (.ino)
                    </span>
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={handleCopyCode}
                      className="flex items-center gap-1.5 rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] px-2.5 py-1 text-xs text-zinc-300 hover:text-white"
                    >
                      <Copy className="h-3.5 w-3.5" />
                      {copiedCode ? 'Copied!' : 'Copy Sketch'}
                    </button>
                    <button
                      onClick={handleDownloadIno}
                      className="flex items-center gap-1.5 rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-2.5 py-1 text-xs text-emerald-400 hover:bg-emerald-500/20"
                    >
                      <Download className="h-3.5 w-3.5" />
                      Download .ino
                    </button>
                  </div>
                </div>

                <div className="rounded-xl border border-zinc-800 bg-[#0d1117] p-3 max-h-56 overflow-y-auto font-mono text-[11px] text-zinc-300 leading-relaxed">
                  <pre>{generatedSketch || "// Generating sketch..."}</pre>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Modal Footer Controls */}
        <div className="flex items-center justify-between border-t border-[var(--color-border)] px-6 py-4 bg-[var(--color-background)]">
          {currentStep > 1 ? (
            <button
              onClick={() => setCurrentStep((prev) => (prev - 1) as any)}
              className="flex items-center gap-2 rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] px-4 py-2 text-xs font-semibold text-zinc-300 hover:text-white hover:bg-[var(--color-surface-hover)] transition-colors"
            >
              <ArrowLeft className="h-4 w-4" />
              Previous
            </button>
          ) : (
            <div />
          )}

          {currentStep === 1 && (
            <button
              onClick={() => setCurrentStep(2)}
              className="flex items-center gap-2 rounded-xl bg-emerald-500 px-5 py-2 text-xs font-bold text-black hover:bg-emerald-400 transition-colors shadow-lg shadow-emerald-500/20"
            >
              Next: Configure Sensors
              <ArrowRight className="h-4 w-4" />
            </button>
          )}

          {currentStep === 2 && (
            <button
              onClick={handleGenerateCode}
              disabled={isGenerating}
              className="flex items-center gap-2 rounded-xl bg-emerald-500 px-5 py-2 text-xs font-bold text-black hover:bg-emerald-400 disabled:opacity-50 transition-colors shadow-lg shadow-emerald-500/20"
            >
              {isGenerating ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
              Generate Firmware & Proceed to Flash
              <ArrowRight className="h-4 w-4" />
            </button>
          )}

          {currentStep === 3 && (
            <button
              onClick={handleRegisterAndFinish}
              disabled={isRegistering}
              className="flex items-center gap-2 rounded-xl bg-emerald-500 px-5 py-2 text-xs font-bold text-black hover:bg-emerald-400 disabled:opacity-50 transition-colors shadow-lg shadow-emerald-500/20"
            >
              {isRegistering ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}
              Complete Registration & Open Machine
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
