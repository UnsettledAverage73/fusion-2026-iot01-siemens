"""
Real-Time Machine Sentinel & Multi-Model Fleet Monitor.
Powered by Industrial RAG Engine (Grok + Sarvam AI).

Inspects live telemetry and runs physics & ML models across all three machine sources:
1. Physical Hardware: ESP32-HARDWARE-01 (DHT11 Temp/Humidity, ACS712 Current, Hall RPM, Button)
2. Dataset 1: Smart Grid Terminal (SGT-TERM-01, terminal_fault_model.joblib)
3. Dataset 2: Power Transformer DGA (XFMR-315MVA-01, transformer_health_model.joblib)

Evaluates machine health using ISO 10816, IEEE C57.104, ML ensemble fault models,
and safety interlocks via IndustrialRAGEngine.
Dispatches critical alerts to Slack (#all-average) when safety thresholds are breached.
"""

import os
import json
import time
from typing import Dict, Any, List, Optional
from src.agent.rag_engine import IndustrialRAGEngine
from src.data.database import get_machine_health_summary
from src.services.alerts import create_ai_alert
from src.services.substation_service import predict_terminal, predict_transformer, PRESET_SCENARIOS
from src.notifications.slack import send_slack_alert


class RealTimeSentinel:
    def __init__(self, rag_engine: Optional[IndustrialRAGEngine] = None, **kwargs):
        self.rag_engine = rag_engine or IndustrialRAGEngine()
        self._last_slack_alert_time: Dict[str, float] = {}

    def get_hardware_telemetry(self) -> Dict[str, Any]:
        """Fetches live telemetry for physical ESP32 hardware."""
        health = get_machine_health_summary("ESP32-HARDWARE-01")
        metrics = health.get("live_metrics", {})
        
        # If no readings yet, fallback to default quiescent physical baseline
        temp = float(metrics.get("temperature", 32.3))
        hum = float(metrics.get("humidity", 65.0))
        current = float(metrics.get("current_draw", 4.12))
        rpm = float(metrics.get("rpm", 1450.0))
        btn_val = metrics.get("push_button") if metrics.get("push_button") is not None else metrics.get("button_state")
        btn_pressed = str(btn_val).strip().upper() in ("1", "PRESSED", "1.0", "TRUE")
        vib = float(metrics.get("vibration_rms", metrics.get("vibration", 0.05)))
        
        return {
            "machine_id": "ESP32-HARDWARE-01",
            "name": "Dataset 3: Physical ESP32 Hardware Node",
            "telemetry": {
                "temperature": temp,
                "humidity": hum,
                "current_draw": current,
                "rpm": rpm,
                "push_button": "PRESSED" if btn_pressed else "RELEASED",
                "vibration_rms": vib,
                "source": metrics.get("source", "usb_serial_direct")
            },
            "alerts": [f"{a.get('reason', '')} (Logged at {a.get('timestamp', '')})" for a in health.get("alerts", []) if a.get("reason")]
        }

    def get_dataset1_terminal_state(self) -> Dict[str, Any]:
        """Runs Dataset 1 Terminal Model prediction against active/live parameters."""
        health = get_machine_health_summary("SGT-TERM-01")
        live = health.get("live_metrics", {})
        
        # Baseline parameters merged with live readings
        params = dict(PRESET_SCENARIOS["nominal"]["terminal"])
        if "temperature" in live and float(live["temperature"]) > 0:
            params["temperature"] = float(live["temperature"])
        if "current_draw" in live and float(live["current_draw"]) > 0:
            params["current"] = float(live["current_draw"])
        if "vibration" in live and float(live["vibration"]) > 0:
            params["vibration_level"] = float(live["vibration"])

        ml_pred = predict_terminal(params)

        return {
            "machine_id": "SGT-TERM-01",
            "name": "Dataset 1: Smart Grid Terminal (CB-01)",
            "telemetry": {
                "voltage": params.get("voltage", 230.0),
                "current": params.get("current", 35.0),
                "temperature": params.get("temperature", 42.5),
                "vibration": params.get("vibration_level", 1.25),
                "power_factor": params.get("power_factor", 0.94)
            },
            "ml_insights": {
                "fault_probability": ml_pred.get("fault_probability", 0.0),
                "fault_status_label": ml_pred.get("fault_status_label", "NOMINAL"),
                "health_score": ml_pred.get("health_score", 100.0),
                "top_drivers": ml_pred.get("top_drivers", [])
            },
            "alerts": [a.get("reason", "") for a in health.get("alerts", [])]
        }

    def get_dataset2_transformer_state(self) -> Dict[str, Any]:
        """Runs Dataset 2 Power Transformer DGA Model prediction against active/live parameters."""
        health = get_machine_health_summary("XFMR-315MVA-01")
        live = health.get("live_metrics", {})
        
        params = dict(PRESET_SCENARIOS["nominal"]["transformer"])
        if "temperature" in live and float(live["temperature"]) > 0:
            params["oil_temp"] = float(live["temperature"])

        ml_pred = predict_transformer(params)

        return {
            "machine_id": "XFMR-315MVA-01",
            "name": "Dataset 2: Power Transformer DGA Health (315 MVA)",
            "telemetry": {
                "h2": params.get("h2", 18.5),
                "ch4": params.get("ch4", 22.1),
                "c2h4": params.get("c2h4", 15.4),
                "c2h2": params.get("c2h2", 0.45),
                "bdv": params.get("bdv", 68.5),
                "oil_temp": params.get("oil_temp", 52.0),
                "moisture": params.get("moisture", 12.0)
            },
            "ml_insights": {
                "predicted_fault": ml_pred.get("predicted_fault_class", "Nominal_Normal"),
                "health_index": ml_pred.get("health_index", 95.0),
                "ieee_c57_status": ml_pred.get("ieee_c57_status", "IEEE Condition 1 (Normal)")
            },
            "alerts": [a.get("reason", "") for a in health.get("alerts", [])]
        }

    def inspect_fleet(self, target_machine_id: str = "GLOBAL", dispatch_alerts: bool = True) -> Dict[str, Any]:
        """
        Comprehensive Real-Time Fleet Sentinel Scan:
        Scans Hardware, Dataset 1, and Dataset 2 simultaneously using RAG physics & standards evaluation.
        """
        hw_state = self.get_hardware_telemetry()
        d1_state = self.get_dataset1_terminal_state()
        d2_state = self.get_dataset2_transformer_state()

        # Multi-Asset Health Evaluation
        hw_eval = self.rag_engine.evaluate_asset_health(hw_state)
        d1_eval = self.rag_engine.evaluate_asset_health(d1_state)
        d2_eval = self.rag_engine.evaluate_asset_health(d2_state)

        def _format_decision(ev):
            return {
                "decision": ev["action"],
                "severity": ev["severity"],
                "confidence": ev["urgency_score"],
                "key_drivers": ev["key_drivers"],
                "action_metadata": {"description": ev["description"]},
                "anomalies": ev["anomalies"],
                "scoring_source": "RAG Physics & ML Standards Engine"
            }

        hw_decision = _format_decision(hw_eval)
        d1_decision = _format_decision(d1_eval)
        d2_decision = _format_decision(d2_eval)

        fleet_summary = [
            {"asset": hw_state, "health": hw_decision, "semif": hw_decision},
            {"asset": d1_state, "health": d1_decision, "semif": d1_decision},
            {"asset": d2_state, "health": d2_decision, "semif": d2_decision}
        ]

        # Determine target asset focus
        primary_triage = None
        if target_machine_id and target_machine_id != "GLOBAL":
            for item in fleet_summary:
                if item["asset"]["machine_id"] == target_machine_id:
                    primary_triage = item
                    break

        if not primary_triage:
            # Pick highest severity asset across fleet (CRITICAL > WARNING > NOMINAL)
            severity_rank = {"CRITICAL": 3, "WARNING": 2, "NOMINAL": 1}
            sorted_by_risk = sorted(
                fleet_summary,
                key=lambda x: (
                    severity_rank.get(x["health"]["severity"], 0),
                    x["health"]["confidence"]
                ),
                reverse=True
            )
            primary_triage = sorted_by_risk[0]

        # Check if critical alert dispatch to Slack is required
        if dispatch_alerts:
            self._check_and_dispatch_slack(fleet_summary)

        return {
            "fleet_summary": fleet_summary,
            "primary_triage": primary_triage,
            "hardware": {"state": hw_state, "decision": hw_decision},
            "dataset1_terminal": {"state": d1_state, "decision": d1_decision},
            "dataset2_transformer": {"state": d2_state, "decision": d2_decision}
        }

    def _check_and_dispatch_slack(self, fleet_summary: List[Dict[str, Any]]):
        """Dispatches automated Slack alert if any machine exhibits critical emergency state."""
        now = time.time()
        for item in fleet_summary:
            asset = item["asset"]
            h = item["health"]
            mid = asset["machine_id"]
            if h.get("severity") == "CRITICAL":
                last_time = self._last_slack_alert_time.get(mid, 0.0)
                # 60s cooldown per machine to prevent spam
                if now - last_time > 60.0:
                    self._last_slack_alert_time[mid] = now
                    reason = f"Safety Breach: {h['decision']} ({h['confidence']}% urgency). Drivers: {', '.join(h.get('key_drivers', []))}"
                    prescription = h["action_metadata"].get("description", "Inspect asset immediately.")
                    create_ai_alert(mid, "CRITICAL", reason, prescription)
                    send_slack_alert(
                        equipment_id=mid,
                        severity="CRITICAL",
                        reason=reason,
                        prescription=prescription
                    )

    def generate_sentinel_markdown(self, scan_result: Dict[str, Any]) -> str:
        """
        Builds a rich, real-time diagnostic dashboard card in Markdown to embed directly
        in the AI response for every prompt.
        """
        hw = scan_result["hardware"]
        d1 = scan_result["dataset1_terminal"]
        d2 = scan_result["dataset2_transformer"]
        prim = scan_result["primary_triage"]
        h = prim["health"]
        asset = prim["asset"]

        hw_tel = hw["state"]["telemetry"]
        d1_tel = d1["state"]["telemetry"]
        d1_ml = d1["state"]["ml_insights"]
        d2_tel = d2["state"]["telemetry"]
        d2_ml = d2["state"]["ml_insights"]

        btn_badge = "🔴 PRESSED (E-STOP)" if hw_tel.get("push_button") == "PRESSED" else "🟢 RELEASED (Healthy)"

        card = f"""### 🛡️ Real-Time Machine Sentinel & Multi-Source RAG Scan
| Monitored Domain | Asset ID | Primary Live Telemetry | ML / Health Status | Recommended Action |
| :--- | :--- | :--- | :--- | :--- |
| **Physical Hardware** | `{hw['state']['machine_id']}` | **Temp**: {hw_tel.get('temperature', 0):.1f}°C • **Current**: {hw_tel.get('current_draw', 0):.2f}A • **RPM**: {hw_tel.get('rpm', 0):.0f} • **Button**: {btn_badge} | Live Edge Stream (USB) | `{hw['decision']['decision']}` ({hw['decision']['confidence']}%) |
| **Dataset 1: Terminal** | `{d1['state']['machine_id']}` | **Voltage**: {d1_tel.get('voltage', 0):.1f}V • **Current**: {d1_tel.get('current', 0):.1f}A • **Vib**: {d1_tel.get('vibration', 0):.2f} mm/s | **Fault Prob**: {d1_ml.get('fault_probability', 0)*100:.1f}% • **Health**: {d1_ml.get('health_score', 100):.1f}/100 | `{d1['decision']['decision']}` ({d1['decision']['confidence']}%) |
| **Dataset 2: Transformer** | `{d2['state']['machine_id']}` | **C2H2**: {d2_tel.get('c2h2', 0):.2f} ppm • **C2H4**: {d2_tel.get('c2h4', 0):.1f} ppm • **BDV**: {d2_tel.get('bdv', 0):.1f} kV | **Fault Class**: `{d2_ml.get('predicted_fault', 'Nominal')}` • **Health**: {d2_ml.get('health_index', 95):.1f}/100 | `{d2['decision']['decision']}` ({d2['decision']['confidence']}%) |

---

### ⚙️ Multi-Source Engineering Diagnostics (Grok & Sarvam RAG)
- **Target Asset Focus**: `{asset['machine_id']}` ({asset.get('name', 'Asset')})
- **Recommended Action**: **`{h['decision']}`**
- **Condition Severity**: **{h['severity']}**
- **Action Urgency**: **{h['confidence']}%**
- **Engineering Scope**: *{h['action_metadata']['description']}*
- **Primary Driving Factors**:
  {chr(10).join([f"  • {d}" for d in h.get('key_drivers', ['Nominal parameter envelope'])])}
"""
        return card
