"use client";

import React, { useState, useMemo } from "react";
import Link from "next/link";
import {
  Building2,
  Cpu,
  Layers,
  Network,
  ShieldCheck,
  TrendingUp,
  Zap,
  Radio,
  Server,
  DollarSign,
  ArrowRight,
  CheckCircle2,
  HardDrive,
  Workflow,
  Sparkles,
  Download,
  Share2,
} from "lucide-react";
import { cn } from "@/lib/utils";

export default function IndustrialScalePage() {
  // Interactive ROI Calculator State
  const [machineCount, setMachineCount] = useState(60);
  const [outagesPerYear, setOutagesPerYear] = useState(14);
  const [downtimeHoursPerOutage, setDowntimeHoursPerOutage] = useState(3.5);
  const [hourlyDowntimeCost, setHourlyDowntimeCost] = useState(16500); // USD/hour
  const [activeTab, setActiveTab] = useState<"architecture" | "protocols" | "roi" | "compliance" | "roadmap">("architecture");

  // Dynamic ROI Calculations
  const calculations = useMemo(() => {
    const totalOutageHours = outagesPerYear * downtimeHoursPerOutage;
    const grossAnnualOutageCost = totalOutageHours * hourlyDowntimeCost;
    // Early prediction cuts unplanned downtime by 76% based on industrial EPRI studies
    const preventedOutageHours = totalOutageHours * 0.76;
    const grossAnnualSavings = preventedOutageHours * hourlyDowntimeCost;
    const hardwareSensorsCapex = machineCount * 180; // $180 per industrial sensor node
    const edgeServerCapex = Math.ceil(machineCount / 200) * 4500; // Edge gateway servers
    const platformAnnualOpex = machineCount * 320; // Enterprise subscription
    const totalFirstYearInvestment = hardwareSensorsCapex + edgeServerCapex + platformAnnualOpex;
    const netFirstYearRoiPct = Math.round(((grossAnnualSavings - totalFirstYearInvestment) / totalFirstYearInvestment) * 100);
    const paybackPeriodMonths = Math.max(0.4, Number((totalFirstYearInvestment / (grossAnnualSavings / 12)).toFixed(1)));

    return {
      grossAnnualOutageCost,
      grossAnnualSavings,
      preventedOutageHours: Math.round(preventedOutageHours),
      totalFirstYearInvestment,
      netFirstYearRoiPct,
      paybackPeriodMonths,
    };
  }, [machineCount, outagesPerYear, downtimeHoursPerOutage, hourlyDowntimeCost]);

  return (
    <div className="space-y-8 animate-in fade-in duration-300">
      {/* Hero Header */}
      <div className="relative overflow-hidden rounded-3xl border border-white/10 bg-[radial-gradient(ellipse_at_top,_var(--tw-gradient-stops))] from-emerald-950/40 via-[#0c1320] to-[#070b12] p-8 md:p-10 shadow-2xl">
        <div className="absolute top-0 right-0 -mt-10 -mr-10 w-96 h-96 bg-[var(--color-primary)]/10 rounded-full blur-3xl pointer-events-none" />

        <div className="relative z-10 max-w-4xl space-y-4">
          <div className="inline-flex items-center gap-2 rounded-full border border-[var(--color-primary)]/30 bg-[var(--color-primary)]/10 px-3.5 py-1 text-xs font-mono font-semibold text-[var(--color-primary)]">
            <Building2 className="w-3.5 h-3.5" />
            ENTERPRISE DEPLOYMENT & INDUSTRIAL SCALING BLUEPRINT
          </div>

          <h1 className="text-3xl md:text-5xl font-extrabold tracking-tight text-white leading-tight">
            Scaling Sovereign AI Predictive Maintenance Across Heavy Industries
          </h1>

          <p className="text-slate-300 text-sm md:text-base leading-relaxed">
            Architectural strategy for transitioning from a single benchtop ESP32 node to multi-plant fleet
            deployments monitoring 10,000+ critical turbomachinery, induction motors, and substation transformers with
            sub-millisecond deterministic edge ingest, Kafka backbones, and SAP PM / IBM Maximo integrations.
          </p>

          <div className="flex flex-wrap items-center gap-3 pt-2">
            <button
              onClick={() => setActiveTab("roi")}
              className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-[var(--color-primary)] text-black font-bold text-xs uppercase tracking-wider hover:bg-[#00e6b8] transition-all shadow-[0_0_20px_rgba(0,212,170,0.4)]"
            >
              <DollarSign className="w-4 h-4" />
              Calculate Downtime ROI
            </button>
            <button
              onClick={() => setActiveTab("architecture")}
              className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl border border-white/15 bg-white/5 text-white font-semibold text-xs tracking-wider hover:bg-white/10 transition-all"
            >
              <Layers className="w-4 h-4" />
              Explore ISA-95 Architecture
            </button>
            <a
              href="mailto:industrial-scale@plant-apex.io"
              className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl border border-white/10 text-slate-400 hover:text-white text-xs font-mono transition-colors"
            >
              <Share2 className="w-3.5 h-3.5" />
              Enterprise Briefing
            </a>
          </div>
        </div>
      </div>

      {/* Navigation Tabs */}
      <div className="flex items-center gap-2 border-b border-white/10 pb-4 overflow-x-auto">
        {[
          { id: "architecture", label: "ISA-95 Architecture", icon: Layers },
          { id: "protocols", label: "Industrial Protocols & Fieldbus", icon: Network },
          { id: "roi", label: "Downtime ROI Calculator", icon: TrendingUp },
          { id: "compliance", label: "Standards & Cybersecurity (IEC 62443)", icon: ShieldCheck },
          { id: "roadmap", label: "Multi-Plant Rollout Roadmap", icon: Workflow },
        ].map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id as any)}
            className={cn(
              "flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold transition-all whitespace-nowrap",
              activeTab === tab.id
                ? "bg-[var(--color-primary)] text-black shadow-[0_0_15px_rgba(0,212,170,0.4)]"
                : "text-slate-400 hover:text-white hover:bg-white/5"
            )}
          >
            <tab.icon className="w-4 h-4" />
            {tab.label}
          </button>
        ))}
      </div>

      {/* TAB 1: ISA-95 ARCHITECTURE */}
      {activeTab === "architecture" && (
        <div className="space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <div className="surface-card p-5 rounded-2xl border border-white/10 bg-[#0d141e]/90 space-y-3">
              <div className="w-10 h-10 rounded-xl bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center text-emerald-400">
                <Radio className="w-5 h-5" />
              </div>
              <h3 className="text-base font-bold text-white">Level 0 & 1: Field Edge</h3>
              <p className="text-xs text-slate-400 leading-relaxed">
                Physical sensor telemetry from ESP32, Arduino, Modbus RTU sensors, IEPE piezo accelerometers, and Rogowski coils.
                Ultra-low latency sampling at up to 10 kHz.
              </p>
              <div className="text-[11px] font-mono text-emerald-400">Deterministic Edge Read</div>
            </div>

            <div className="surface-card p-5 rounded-2xl border border-white/10 bg-[#0d141e]/90 space-y-3">
              <div className="w-10 h-10 rounded-xl bg-cyan-500/10 border border-cyan-500/20 flex items-center justify-center text-cyan-400">
                <Cpu className="w-5 h-5" />
              </div>
              <h3 className="text-base font-bold text-white">Level 2: On-Prem Aggregator</h3>
              <p className="text-xs text-slate-400 leading-relaxed">
                Zero-copy Rust/C++ ingestion engine processing 100,000 packets/sec per node. Local circular RAM ring buffers
                prevent telemetry drops during factory WAN dropouts.
              </p>
              <div className="text-[11px] font-mono text-cyan-400">Zero-Loss Local Buffer</div>
            </div>

            <div className="surface-card p-5 rounded-2xl border border-white/10 bg-[#0d141e]/90 space-y-3">
              <div className="w-10 h-10 rounded-xl bg-amber-500/10 border border-amber-500/20 flex items-center justify-center text-amber-400">
                <Server className="w-5 h-5" />
              </div>
              <h3 className="text-base font-bold text-white">Level 3: Distributed Bus</h3>
              <p className="text-xs text-slate-400 leading-relaxed">
                Partitioned Apache Kafka / Redpanda streaming backbone. Multi-plant routing enables synchronized
                telemetry ingestion across Detroit, Stuttgart, and Yokohama plants.
              </p>
              <div className="text-[11px] font-mono text-amber-400">10M+ Events/Sec Pipeline</div>
            </div>

            <div className="surface-card p-5 rounded-2xl border border-white/10 bg-[#0d141e]/90 space-y-3">
              <div className="w-10 h-10 rounded-xl bg-rose-500/10 border border-rose-500/20 flex items-center justify-center text-rose-400">
                <Workflow className="w-5 h-5" />
              </div>
              <h3 className="text-base font-bold text-white">Level 4: AI & CMMS ERP</h3>
              <p className="text-xs text-slate-400 leading-relaxed">
                Pre-trained LightGBM, ONNX, and Weibull survival models classify degradation in &lt;1.2ms. Automatic work orders
                spawned directly in SAP PM, IBM Maximo, or Twilio WhatsApp.
              </p>
              <div className="text-[11px] font-mono text-rose-400">Autonomous ERP Dispatch</div>
            </div>
          </div>

          {/* Architectural Diagram Card */}
          <div className="surface-card p-6 rounded-2xl border border-white/10 bg-[#0d141e]/90">
            <h3 className="text-lg font-bold text-white mb-3 flex items-center gap-2">
              <HardDrive className="w-5 h-5 text-[var(--color-primary)]" />
              Enterprise High-Availability Edge-to-Cloud Topology
            </h3>
            <div className="p-4 rounded-xl bg-black/40 border border-white/10 font-mono text-xs text-slate-300 leading-relaxed space-y-3 overflow-x-auto">
              <div className="text-emerald-400 font-bold">[LEVEL 0/1: SHOP FLOOR SENSORS]</div>
              <div className="pl-4">
                ├─ ESP32-HARDWARE-01 (DHT11, ACS712, Hall RPM, Piezo Vibration) ──[WebSerial / USB 115200 Baud]──┐
                <br />
                ├─ Rockwell Allen-Bradley PLC ──────────────────[EtherNet/IP CIP]────────────────────────────────┤
                <br />
                ├─ Siemens S7-1500 Controller ──────────────────[PROFINET / S7 Protocol]────────────────────────┤
                <br />
                └─ Schneider Electric Power Meter ──────────────[Modbus TCP Port 502]───────────────────────────┘
              </div>
              <div className="text-cyan-400 font-bold">[LEVEL 2: ON-PREMISE EDGE AGGREGATOR (RUST MICRO-ENGINE)]</div>
              <div className="pl-4">
                ├─ Ingestion Throughput: 100,000 samples/sec | Memory Footprint: &lt; 45 MB RAM
                <br />
                ├─ DSP Pipeline: Fast Fourier Transform (FFT), RMS, Kurtosis, Crest Factor extraction
                <br />
                └─ Local Persistence: Redis TimeSeries Ring Buffer (72-hour air-gapped buffering)
              </div>
              <div className="text-amber-400 font-bold">[LEVEL 3: SECURE ENTERPRISE MESSAGE BACKBONE]</div>
              <div className="pl-4">
                ├─ Kafka / Redpanda Cluster (Partitioned by Plant: Detroit-01, Stuttgart-02, Tokyo-03)
                <br />
                └─ mTLS 1.3 Encryption | ISO 27001 & IEC 62443 Level 3 Network Zones
              </div>
              <div className="text-rose-400 font-bold">[LEVEL 4: SOVEREIGN DIAGNOSTICS & ENTERPRISE INTEGRATION]</div>
              <div className="pl-4">
                ├─ Zero-Dependency .model LightGBM Ensembles + Weibull RUL Survival Calculation
                <br />
                ├─ SAP PM (Plant Maintenance) BAPI Work Order Creation (RFC / OData)
                <br />
                ├─ IBM Maximo REST Connector & Infor EAM Integration
                <br />
                └─ WhatsApp Critical Alarm Escalation (Twilio Business API Webhooks)
              </div>
            </div>
          </div>
        </div>
      )}

      {/* TAB 2: INDUSTRIAL PROTOCOLS */}
      {activeTab === "protocols" && (
        <div className="space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {[
              {
                protocol: "OPC Unified Architecture (OPC-UA)",
                standard: "IEC 62541",
                status: "Supported (Native Driver)",
                badge: "Industrial Gold Standard",
                desc: "Full address space browsing, encrypted sessions, and subscription model for Siemens, ABB, and Omron controllers.",
              },
              {
                protocol: "Modbus TCP / RTU",
                standard: "Modbus-IDA Protocol",
                status: "Supported (Poll & Push)",
                badge: "Legacy & Substation",
                desc: "Discrete inputs, coils, input registers, and holding registers supporting substation relays and power meters.",
              },
              {
                protocol: "MQTT / Sparkplug B",
                standard: "Eclipse Foundation Specification",
                status: "Supported (Broker & Client)",
                badge: "IoT Standard",
                desc: "Lightweight publish/subscribe with birth/death state management and standardized industrial topic namespaces.",
              },
              {
                protocol: "WebSerial API (Direct Hardware)",
                standard: "W3C Web Incubator Spec",
                status: "Native Browser Bridge",
                badge: "Zero-Software Plug & Play",
                desc: "Direct USB microcontroller streaming from ESP32, Arduino, and STM32 boards without installing drivers or daemon scripts.",
              },
              {
                protocol: "EtherNet/IP (CIP)",
                standard: "ODVA Specification",
                status: "Adapter Integration",
                badge: "Automotive & Discrete",
                desc: "Seamless connectivity to Rockwell ControlLogix and CompactLogix PLCs using Common Industrial Protocol tags.",
              },
              {
                protocol: "SECS/GEM",
                standard: "SEMI E4 / E5 / E30 / E37",
                status: "Semiconductor Module",
                badge: "Fab & Cleanroom",
                desc: "Standardized equipment communication interface for wafer fabs and cleanroom manufacturing tooling.",
              },
            ].map((item, i) => (
              <div key={i} className="surface-card p-5 rounded-2xl border border-white/10 bg-[#0d141e]/90 space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-[10px] font-mono font-bold uppercase tracking-wider text-[var(--color-primary)] bg-[var(--color-primary)]/10 px-2 py-0.5 rounded-full border border-[var(--color-primary)]/20">
                    {item.badge}
                  </span>
                  <span className="text-[11px] font-mono text-slate-400">{item.standard}</span>
                </div>
                <h4 className="text-base font-bold text-white">{item.protocol}</h4>
                <p className="text-xs text-slate-400 leading-relaxed">{item.desc}</p>
                <div className="pt-2 border-t border-white/5 flex items-center gap-1.5 text-xs text-emerald-400 font-mono">
                  <CheckCircle2 className="w-3.5 h-3.5" />
                  {item.status}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* TAB 3: DOWNTIME ROI CALCULATOR */}
      {activeTab === "roi" && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          {/* Sliders Panel */}
          <div className="lg:col-span-6 surface-card p-6 rounded-2xl border border-white/10 bg-[#0d141e]/90 space-y-6">
            <div>
              <h3 className="text-lg font-bold text-white flex items-center gap-2">
                <DollarSign className="w-5 h-5 text-emerald-400" />
                Industrial Downtime ROI Model Parameters
              </h3>
              <p className="text-xs text-slate-400 mt-1">
                Customize operational parameters to calculate economic savings from early predictive fault intervention.
              </p>
            </div>

            {/* Slider 1 */}
            <div className="space-y-2">
              <div className="flex justify-between text-xs font-mono">
                <span className="text-slate-300">Fleet Machine Count</span>
                <span className="text-[var(--color-primary)] font-bold">{machineCount} Assets</span>
              </div>
              <input
                type="range"
                min="5"
                max="500"
                step="5"
                value={machineCount}
                onChange={(e) => setMachineCount(Number(e.target.value))}
                className="w-full accent-[var(--color-primary)] cursor-pointer"
              />
              <p className="text-[10px] text-slate-500 font-mono">Critical turbomachinery, compressors & conveyor lines</p>
            </div>

            {/* Slider 2 */}
            <div className="space-y-2">
              <div className="flex justify-between text-xs font-mono">
                <span className="text-slate-300">Unplanned Outages / Year (Baseline)</span>
                <span className="text-amber-400 font-bold">{outagesPerYear} Events</span>
              </div>
              <input
                type="range"
                min="2"
                max="50"
                step="1"
                value={outagesPerYear}
                onChange={(e) => setOutagesPerYear(Number(e.target.value))}
                className="w-full accent-amber-400 cursor-pointer"
              />
              <p className="text-[10px] text-slate-500 font-mono">Industry average: 10-20 catastrophic unplanned trips/year</p>
            </div>

            {/* Slider 3 */}
            <div className="space-y-2">
              <div className="flex justify-between text-xs font-mono">
                <span className="text-slate-300">Mean Downtime Duration per Outage</span>
                <span className="text-cyan-400 font-bold">{downtimeHoursPerOutage} Hours</span>
              </div>
              <input
                type="range"
                min="1"
                max="12"
                step="0.5"
                value={downtimeHoursPerOutage}
                onChange={(e) => setDowntimeHoursPerOutage(Number(e.target.value))}
                className="w-full accent-cyan-400 cursor-pointer"
              />
              <p className="text-[10px] text-slate-500 font-mono">Tear-down, spare parts procurement, re-commissioning</p>
            </div>

            {/* Slider 4 */}
            <div className="space-y-2">
              <div className="flex justify-between text-xs font-mono">
                <span className="text-slate-300">Cost of Downtime per Hour</span>
                <span className="text-rose-400 font-bold">${hourlyDowntimeCost.toLocaleString()} / hr</span>
              </div>
              <input
                type="range"
                min="2000"
                max="50000"
                step="1000"
                value={hourlyDowntimeCost}
                onChange={(e) => setHourlyDowntimeCost(Number(e.target.value))}
                className="w-full accent-rose-400 cursor-pointer"
              />
              <p className="text-[10px] text-slate-500 font-mono">Lost production throughput + scrap + idle labor cost</p>
            </div>
          </div>

          {/* Results Card */}
          <div className="lg:col-span-6 surface-card p-6 rounded-2xl border border-emerald-500/20 bg-gradient-to-b from-[#0e1c1f] to-[#0a121d] space-y-6">
            <div>
              <div className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 text-xs font-mono">
                <Sparkles className="w-3.5 h-3.5" />
                Validated EPRI / IEEE 841 Financial Model
              </div>
              <h3 className="text-2xl font-black text-white mt-2">Projected Financial Impact</h3>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="p-4 rounded-xl bg-white/5 border border-white/10">
                <p className="text-[10px] font-mono uppercase tracking-wider text-slate-400">Baseline Annual Loss</p>
                <p className="text-2xl font-bold font-mono text-rose-400 mt-1">
                  ${Math.round(calculations.grossAnnualOutageCost).toLocaleString()}
                </p>
                <p className="text-[10px] text-slate-500 mt-1">Reactive breakdown cost</p>
              </div>

              <div className="p-4 rounded-xl bg-emerald-500/10 border border-emerald-500/30">
                <p className="text-[10px] font-mono uppercase tracking-wider text-emerald-400 font-semibold">
                  Prevented Annual Loss
                </p>
                <p className="text-2xl font-bold font-mono text-emerald-300 mt-1">
                  ${Math.round(calculations.grossAnnualSavings).toLocaleString()}
                </p>
                <p className="text-[10px] text-emerald-400/80 mt-1">76% fault trip reduction</p>
              </div>

              <div className="p-4 rounded-xl bg-white/5 border border-white/10">
                <p className="text-[10px] font-mono uppercase tracking-wider text-slate-400">First-Year Total TCO</p>
                <p className="text-xl font-bold font-mono text-slate-200 mt-1">
                  ${Math.round(calculations.totalFirstYearInvestment).toLocaleString()}
                </p>
                <p className="text-[10px] text-slate-500 mt-1">Sensors + Edge Gateways + Cloud</p>
              </div>

              <div className="p-4 rounded-xl bg-cyan-500/10 border border-cyan-500/30">
                <p className="text-[10px] font-mono uppercase tracking-wider text-cyan-400 font-semibold">
                  Capital Payback
                </p>
                <p className="text-xl font-bold font-mono text-cyan-300 mt-1">
                  {calculations.paybackPeriodMonths} Months
                </p>
                <p className="text-[10px] text-cyan-400/80 mt-1">Full investment breakeven</p>
              </div>
            </div>

            <div className="p-4 rounded-xl bg-black/40 border border-white/10">
              <div className="flex justify-between items-center">
                <span className="text-xs font-mono text-slate-300">Estimated First-Year Net ROI:</span>
                <span className="text-2xl font-black font-mono text-emerald-400">
                  +{calculations.netFirstYearRoiPct}%
                </span>
              </div>
              <div className="w-full bg-white/10 rounded-full h-2 mt-3 overflow-hidden">
                <div
                  className="bg-gradient-to-r from-emerald-500 to-cyan-400 h-2 rounded-full"
                  style={{ width: `${Math.min(100, Math.max(15, calculations.netFirstYearRoiPct / 10))}%` }}
                />
              </div>
            </div>
          </div>
        </div>
      )}

      {/* TAB 4: COMPLIANCE & CYBERSECURITY */}
      {activeTab === "compliance" && (
        <div className="space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="surface-card p-6 rounded-2xl border border-white/10 bg-[#0d141e]/90 space-y-4">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center text-emerald-400">
                  <ShieldCheck className="w-5 h-5" />
                </div>
                <div>
                  <h4 className="text-base font-bold text-white">IEC 62443 Industrial Cybersecurity</h4>
                  <p className="text-xs text-slate-400 font-mono">Zones and Conduits Architecture (Security Level 3)</p>
                </div>
              </div>
              <ul className="space-y-2 text-xs text-slate-300">
                <li className="flex items-start gap-2">
                  <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
                  <span><strong>Zero-Trust Mutual TLS (mTLS 1.3):</strong> All edge gateways require hardware TPM 2.0 cryptoprocessors for device identity.</span>
                </li>
                <li className="flex items-start gap-2">
                  <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
                  <span><strong>Air-Gapped Operation:</strong> Predictive ML models execute strictly within local network boundaries without requiring continuous Internet uplinks.</span>
                </li>
                <li className="flex items-start gap-2">
                  <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
                  <span><strong>Role-Based Access Control (RBAC):</strong> Integration with Active Directory / Google OAuth 2.0 enforcing granular technician permissions.</span>
                </li>
              </ul>
            </div>

            <div className="surface-card p-6 rounded-2xl border border-white/10 bg-[#0d141e]/90 space-y-4">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-cyan-500/10 border border-cyan-500/20 flex items-center justify-center text-cyan-400">
                  <Layers className="w-5 h-5" />
                </div>
                <div>
                  <h4 className="text-base font-bold text-white">ISO 10816 & ISO 55000 Asset Framework</h4>
                  <p className="text-xs text-slate-400 font-mono">Standardized Machinery Severity Boundaries</p>
                </div>
              </div>
              <ul className="space-y-2 text-xs text-slate-300">
                <li className="flex items-start gap-2">
                  <CheckCircle2 className="w-4 h-4 text-cyan-400 shrink-0 mt-0.5" />
                  <span><strong>ISO 10816-3 Zone A to D:</strong> Automated mechanical grading conforming to international machinery vibration classification.</span>
                </li>
                <li className="flex items-start gap-2">
                  <CheckCircle2 className="w-4 h-4 text-cyan-400 shrink-0 mt-0.5" />
                  <span><strong>ISO 55000 Asset Lifecycle:</strong> Seamless alignment with standard corporate asset maintenance management cycles.</span>
                </li>
                <li className="flex items-start gap-2">
                  <CheckCircle2 className="w-4 h-4 text-cyan-400 shrink-0 mt-0.5" />
                  <span><strong>IEC 60034 Thermal Class Ratings:</strong> Temperature limits mapped against Class B (130°C) and Class F (155°C) insulation ceilings.</span>
                </li>
              </ul>
            </div>
          </div>
        </div>
      )}

      {/* TAB 5: ROADMAP */}
      {activeTab === "roadmap" && (
        <div className="surface-card p-6 rounded-2xl border border-white/10 bg-[#0d141e]/90 space-y-6">
          <h3 className="text-lg font-bold text-white">4-Phase Enterprise Industrial Deployment Plan</h3>
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <div className="p-4 rounded-xl bg-white/5 border border-white/10 space-y-2">
              <span className="text-[10px] font-mono font-bold text-[var(--color-primary)]">PHASE 1 (WEEKS 1-4)</span>
              <h4 className="text-sm font-bold text-white">Pilot Bench & Edge Telemetry</h4>
              <p className="text-xs text-slate-400">
                Deploy 10 ESP32/Modbus nodes on high-criticality assets. Establish baseline FFT harmonics and temperature gradients.
              </p>
            </div>

            <div className="p-4 rounded-xl bg-white/5 border border-white/10 space-y-2">
              <span className="text-[10px] font-mono font-bold text-cyan-400">PHASE 2 (WEEKS 5-8)</span>
              <h4 className="text-sm font-bold text-white">Plant-Wide Bus Integration</h4>
              <p className="text-xs text-slate-400">
                Install on-premise Rust edge aggregator and deploy Kafka streaming cluster. Connect existing Rockwell/Siemens PLCs over OPC-UA.
              </p>
            </div>

            <div className="p-4 rounded-xl bg-white/5 border border-white/10 space-y-2">
              <span className="text-[10px] font-mono font-bold text-amber-400">PHASE 3 (WEEKS 9-12)</span>
              <h4 className="text-sm font-bold text-white">ERP & WhatsApp Dispatch</h4>
              <p className="text-xs text-slate-400">
                Activate automated SAP PM / IBM Maximo work-order generation and link Twilio WhatsApp notifications for immediate technician triage.
              </p>
            </div>

            <div className="p-4 rounded-xl bg-white/5 border border-white/10 space-y-2">
              <span className="text-[10px] font-mono font-bold text-rose-400">PHASE 4 (MONTHS 4+)</span>
              <h4 className="text-sm font-bold text-white">Multi-Plant Federation</h4>
              <p className="text-xs text-slate-400">
                Scale to multi-region plants with sovereign data governance, fleet-wide Weibull MTBF benchmarking, and global parts inventory planning.
              </p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
