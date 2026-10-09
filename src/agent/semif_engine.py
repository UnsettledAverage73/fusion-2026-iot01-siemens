"""
SemIf Direct-Logit Decision Engine for Sovereign Predictive Maintenance.

Implements the SemIf paradigm:
Evaluates real-time machine telemetry, physical hardware signals, and ML ensemble models
(Dataset 1 Terminal & Dataset 2 Transformer) to compute direct decision logits across
canonical industrial actions without conversational hallucinations:
- EMERGENCY_SHUTDOWN
- THROTTLE_LOAD
- INSPECT_BEARING
- LUBRICATE_ASSET
- CALIBRATE_SENSORS
- NORMAL_MONITORING

Softmax normalizes direct logits into an exact probability distribution for System-1 triage.
"""

import math
import os
import json
import requests
from typing import Dict, List, Optional, Tuple, Any

try:
    from groq import Groq
except ImportError:
    Groq = None

# Canonical industrial decision actions
DEFAULT_ACTIONS = [
    "EMERGENCY_SHUTDOWN",
    "THROTTLE_LOAD",
    "INSPECT_BEARING",
    "LUBRICATE_ASSET",
    "CALIBRATE_SENSORS",
    "NORMAL_MONITORING"
]

# Action definitions with operational impact metadata
ACTION_DEFINITIONS = {
    "EMERGENCY_SHUTDOWN": {
        "label": "Emergency Shutdown",
        "severity": "CRITICAL",
        "description": "Trigger immediate interlock shutdown to prevent catastrophic asset failure or electrical fire."
    },
    "THROTTLE_LOAD": {
        "label": "Throttle Load",
        "severity": "MEDIUM",
        "description": "Derate operational throughput or speed by 25-35% to arrest thermal/electrical accumulation."
    },
    "INSPECT_BEARING": {
        "label": "Inspect Bearing / Mechanism",
        "severity": "HIGH",
        "description": "Despatch technician to inspect mechanical bearings, vibration harmonics, or contact misalignment."
    },
    "LUBRICATE_ASSET": {
        "label": "Lubricate Asset",
        "severity": "MEDIUM",
        "description": "Apply grease or synthetic lubricant to relieve mechanical friction and dissipate localized heat."
    },
    "CALIBRATE_SENSORS": {
        "label": "Calibrate Sensors",
        "severity": "LOW",
        "description": "Verify sensor telemetry against physical reference gauges to resolve transducer drift or contact error."
    },
    "NORMAL_MONITORING": {
        "label": "Normal Monitoring",
        "severity": "INFO",
        "description": "Operating strictly within nominal design envelope. Continue standard high-cadence telemetry stream."
    }
}


def softmax(scores: Dict[str, float], temperature: float = 1.0) -> Dict[str, float]:
    """Compute softmax probabilities from logit scores."""
    if not scores:
        return {}
    temperature = max(temperature, 1e-4)
    max_val = max(scores.values())
    exp_scores = {k: math.exp((v - max_val) / temperature) for k, v in scores.items()}
    total = sum(exp_scores.values())
    if total <= 0:
        return {k: round(1.0 / len(scores), 4) for k in scores}
    return {k: round(v / total, 4) for k, v in exp_scores.items()}


class SemIfEngine:
    """
    Direct-Logit decision scorer.
    Evaluates state and allowed actions across physical hardware, Dataset 1, and Dataset 2.
    """
    def __init__(
        self,
        groq_api_key: Optional[str] = None,
        ollama_url: Optional[str] = None,
        default_model: Optional[str] = None
    ):
        self.groq_api_key = groq_api_key or os.getenv("GROQ_API_KEY")
        self.ollama_url = ollama_url or os.getenv("OLLAMA_URL", "http://localhost:11434/api")
        self.default_model = default_model or os.getenv("GROQ_MODEL", "qwen/qwen3.8-27b")
        
        self.groq_client = None
        if self.groq_api_key and Groq:
            try:
                self.groq_client = Groq(api_key=self.groq_api_key)
            except Exception:
                self.groq_client = None

    def score_with_llm_guidance(
        self,
        state: Dict[str, Any],
        candidate_options: List[str]
    ) -> Optional[Dict[str, float]]:
        """
        Uses Groq LLM (Qwen/Llama) with structured JSON scoring to assign logit potentials
        to each candidate option based on technical operational context.
        """
        if not self.groq_client:
            return None

        prompt = f"""You are an industrial high-speed reflex safety triage controller.
Evaluate the current asset telemetry and anomalies, then assign an operational affinity score (from -10.0 to +10.0)
to each allowed action code based on safety standards (ISO 10816, IEC 60038, IEEE C57).

ASSET: {state.get('machine_id', 'UNKNOWN')} ({state.get('machine_name', 'Industrial Asset')})
TELEMETRY: {json.dumps(state.get('telemetry', {}))}
ACTIVE ANOMALIES: {json.dumps(state.get('alerts', []))}
ML PREDICTIONS: {json.dumps(state.get('ml_insights', {}))}
CONTEXT: {state.get('context', 'Routine real-time monitoring')}

ALLOWED ACTIONS: {candidate_options}

Return ONLY a JSON object mapping each allowed action to its score (float between -10.0 and +10.0).
Example: {{"NORMAL_MONITORING": 8.5, "THROTTLE_LOAD": -2.0, ...}}"""

        try:
            response = self.groq_client.chat.completions.create(
                model=self.default_model,
                messages=[
                    {"role": "system", "content": "You are a typed industrial decision scorer. Output valid JSON only."},
                    {"role": "user", "content": prompt}
                ],
                max_tokens=200,
                temperature=0.0,
                response_format={"type": "json_object"}
            )
            raw = response.choices[0].message.content
            parsed = json.loads(raw)
            scores = {}
            for opt in candidate_options:
                val = float(parsed.get(opt, -5.0))
                scores[opt] = val
            return scores
        except Exception:
            return None

    def score_with_physics_ensemble(
        self,
        state: Dict[str, Any],
        candidate_options: List[str]
    ) -> Tuple[Dict[str, float], List[str]]:
        """
        Calibrated, deterministic direct-logit scoring based on physics standards & ML models.
        Sub-millisecond latency, zero network dependency, guaranteed safety bounds.
        """
        telemetry = state.get("telemetry", {})
        alerts = state.get("alerts", [])
        ml = state.get("ml_insights", {})
        machine_id = str(state.get("machine_id", "")).upper()
        
        raw_logits = {opt: -1.5 for opt in candidate_options}
        if "NORMAL_MONITORING" in raw_logits:
            raw_logits["NORMAL_MONITORING"] = 3.5

        drivers: List[str] = []

        # Extract telemetry across sensor names
        temp = float(telemetry.get("temperature") or telemetry.get("temp") or telemetry.get("winding_temp") or telemetry.get("oil_temp") or 0.0)
        vib = float(telemetry.get("vibration_rms") or telemetry.get("vibration") or telemetry.get("vibration_level") or 0.0)
        current = float(telemetry.get("current_draw") or telemetry.get("current") or 0.0)
        voltage = float(telemetry.get("voltage") or 0.0)
        rpm = float(telemetry.get("rpm") or telemetry.get("speed") or 0.0)
        button_pressed = bool(
            str(telemetry.get("push_button", "")).upper() in ("PRESSED", "1", "TRUE") or
            str(telemetry.get("button", "")).upper() in ("PRESSED", "1", "TRUE")
        )
        c2h2 = float(telemetry.get("c2h2") or 0.0)
        c2h4 = float(telemetry.get("c2h4") or 0.0)
        bdv = float(telemetry.get("bdv") or 0.0)
        
        # ML model signals
        fault_prob = float(ml.get("fault_probability") or ml.get("fault_prob") or 0.0)
        health_index = float(ml.get("health_index") or (100.0 if not ml else 80.0))
        dga_diag = str(ml.get("dga_diagnosis") or ml.get("predicted_fault") or "").upper()

        # 1. Physical Push Button (Emergency E-Stop interlock)
        if button_pressed:
            drivers.append("Physical emergency E-Stop button pressed on hardware")
            raw_logits["EMERGENCY_SHUTDOWN"] = 8.5
            raw_logits["NORMAL_MONITORING"] = -8.0

        # 2. Dataset 2: Transformer DGA Arcing / Dielectric Breakdown (IEEE C57.104)
        elif "XFMR" in machine_id or c2h2 > 0 or bdv > 0:
            if c2h2 >= 4.0 or "ARCING" in dga_diag or "D1" in dga_diag or "D2" in dga_diag:
                drivers.append(f"High-energy electrical arcing detected (C2H2 = {c2h2:.1f} ppm)")
                raw_logits["EMERGENCY_SHUTDOWN"] = 8.0
                raw_logits["NORMAL_MONITORING"] = -7.0
            elif bdv > 0 and bdv < 30.0:
                drivers.append(f"Dielectric breakdown voltage critical collapse (BDV = {bdv:.1f} kV)")
                raw_logits["EMERGENCY_SHUTDOWN"] = 7.0
                raw_logits["THROTTLE_LOAD"] = 4.0
                raw_logits["NORMAL_MONITORING"] = -5.0
            elif c2h4 > 150.0 or "T3" in dga_diag or "THERMAL" in dga_diag:
                drivers.append(f"Severe thermal hotspot degradation (C2H4 = {c2h4:.1f} ppm)")
                raw_logits["THROTTLE_LOAD"] = 6.5
                raw_logits["LUBRICATE_ASSET"] = 3.5
                raw_logits["NORMAL_MONITORING"] = -4.0
            elif health_index < 50.0:
                drivers.append(f"Transformer health index degraded ({health_index:.1f}/100)")
                raw_logits["THROTTLE_LOAD"] = 5.0
                raw_logits["INSPECT_BEARING"] = 4.0
                raw_logits["NORMAL_MONITORING"] = -2.0

        # 3. Dataset 1: Smart Grid Terminal / Switchgear (IEC 60038 / IEC 62271)
        elif "SGT" in machine_id or "TERM" in machine_id or fault_prob > 0.0:
            if fault_prob >= 0.70:
                drivers.append(f"Terminal ML fault classifier triggered trip risk ({fault_prob*100:.1f}%)")
                raw_logits["EMERGENCY_SHUTDOWN"] = 7.5
                raw_logits["NORMAL_MONITORING"] = -6.0
            elif fault_prob >= 0.40 or (voltage > 0 and (voltage < 207.0 or voltage > 253.0)):
                drivers.append(f"Voltage deviation breach or elevated fault probability ({fault_prob*100:.1f}%)")
                raw_logits["THROTTLE_LOAD"] = 6.0
                raw_logits["CALIBRATE_SENSORS"] = 4.0
                raw_logits["NORMAL_MONITORING"] = -3.0

        # 4. Physical Hardware Node (ESP32 Live Sensors: DHT11, ACS712, Hall)
        elif "ESP32" in machine_id or "HARDWARE" in machine_id:
            if temp > 35.0:
                drivers.append(f"DHT11 temperature critical breach ({temp:.1f}°C > 35.0°C safety cap)")
                raw_logits["EMERGENCY_SHUTDOWN"] = 6.8
                raw_logits["THROTTLE_LOAD"] = 4.5
                raw_logits["NORMAL_MONITORING"] = -5.0
            elif temp > 30.0:
                drivers.append(f"DHT11 temperature elevated warning ({temp:.1f}°C)")
                raw_logits["THROTTLE_LOAD"] = 5.2
                raw_logits["LUBRICATE_ASSET"] = 3.0
                raw_logits["NORMAL_MONITORING"] = -2.0
            
            if current > 15.0:
                drivers.append(f"ACS712 current draw overcurrent ({current:.1f} A)")
                raw_logits["THROTTLE_LOAD"] = max(raw_logits.get("THROTTLE_LOAD", 0), 5.5)
                raw_logits["EMERGENCY_SHUTDOWN"] = max(raw_logits.get("EMERGENCY_SHUTDOWN", 0), 4.5)

        # 5. General Industrial Physics Standards (ISO 10816 Vibration & Thermal)
        if vib >= 5.0:
            drivers.append(f"ISO 10816 Zone D dangerous vibration ({vib:.2f} mm/s)")
            raw_logits["EMERGENCY_SHUTDOWN"] = max(raw_logits.get("EMERGENCY_SHUTDOWN", -1.5), 7.2)
            raw_logits["INSPECT_BEARING"] = max(raw_logits.get("INSPECT_BEARING", -1.5), 6.5)
            raw_logits["NORMAL_MONITORING"] = -6.0
        elif vib >= 3.2:
            drivers.append(f"ISO 10816 Zone C restricted operation vibration ({vib:.2f} mm/s)")
            raw_logits["INSPECT_BEARING"] = max(raw_logits.get("INSPECT_BEARING", -1.5), 6.0)
            raw_logits["THROTTLE_LOAD"] = max(raw_logits.get("THROTTLE_LOAD", -1.5), 4.0)
            raw_logits["NORMAL_MONITORING"] = -3.0

        if temp >= 80.0:
            drivers.append(f"Extreme thermal hotspot ({temp:.1f}°C)")
            raw_logits["EMERGENCY_SHUTDOWN"] = max(raw_logits.get("EMERGENCY_SHUTDOWN", -1.5), 7.0)
            raw_logits["THROTTLE_LOAD"] = max(raw_logits.get("THROTTLE_LOAD", -1.5), 6.0)
            raw_logits["NORMAL_MONITORING"] = -5.0
        elif temp >= 65.0:
            drivers.append(f"Elevated operating temperature ({temp:.1f}°C)")
            raw_logits["THROTTLE_LOAD"] = max(raw_logits.get("THROTTLE_LOAD", -1.5), 5.0)
            raw_logits["LUBRICATE_ASSET"] = max(raw_logits.get("LUBRICATE_ASSET", -1.5), 4.5)
            raw_logits["NORMAL_MONITORING"] = -2.0

        if not drivers:
            drivers.append("All operational parameters within standard continuous duty envelope")

        return raw_logits, drivers

    def evaluate_decision(
        self,
        state: Dict[str, Any],
        candidate_options: Optional[List[str]] = None
    ) -> Dict[str, Any]:
        """
        Main SemIf entrypoint:
        1. Formulates state across hardware, Dataset 1, and Dataset 2.
        2. Tries LLM-guided logit extraction via Groq (Qwen/Llama) if requested.
        3. Fuses with calibrated Physics & ML-Ensemble direct-logit scorers.
        4. Softmax normalizes into probability distribution across candidate actions.
        5. Returns argmax action, probability distribution, confidence, and drivers.
        """
        options = candidate_options or list(DEFAULT_ACTIONS)
        source = "physics_ensemble_logit"

        # 1. Calibrated Physics & ML-Ensemble direct-logit baseline
        physics_logits, drivers = self.score_with_physics_ensemble(state, options)
        final_logits = dict(physics_logits)

        # 2. If Groq client is active and context asks for complex triage, refine with LLM logits
        if self.groq_client and state.get("use_llm_scoring", False):
            llm_logits = self.score_with_llm_guidance(state, options)
            if llm_logits:
                source = "fused_llm_physics_logit"
                # Weighted fusion: 60% physics/ML safety bounds + 40% LLM operational context
                for opt in options:
                    final_logits[opt] = round(0.6 * physics_logits.get(opt, 0.0) + 0.4 * llm_logits.get(opt, 0.0), 3)

        # 3. Softmax normalizer
        probabilities = softmax(final_logits, temperature=1.0)
        best_action = max(probabilities.items(), key=lambda item: item[1])[0]
        confidence = probabilities.get(best_action, 0.0)

        action_meta = ACTION_DEFINITIONS.get(best_action, {
            "label": best_action,
            "severity": "INFO",
            "description": "Standard operational action"
        })

        return {
            "decision": best_action,
            "confidence": round(confidence * 100, 2),
            "probabilities": probabilities,
            "severity": action_meta["severity"],
            "action_metadata": action_meta,
            "scoring_source": source,
            "allowed_options": options,
            "key_drivers": drivers,
            "is_emergency": best_action == "EMERGENCY_SHUTDOWN" and confidence >= 0.60
        }
