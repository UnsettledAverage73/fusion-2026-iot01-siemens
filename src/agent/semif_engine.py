"""
SemIf Direct-Logit Engine for Predictive Maintenance.

Implements the SemIf paradigm:
Instead of generating autoregressive tokens to classify or choose actions,
SemIf directly reads logits/logprobs assigned to allowed candidate options
from open models (local via Ollama/PyTorch or cloud via Groq/OpenAI logprobs).

Converts logprobs into a normalized probability distribution using Softmax,
enabling typed, zero-generation-latency System 1 decisions.
"""

import math
import os
import requests
from typing import Dict, List, Optional, Tuple, Any

try:
    from groq import Groq
except ImportError:
    Groq = None

# Canonical industrial decision actions
DEFAULT_ACTIONS = [
    "EMERGENCY_SHUTDOWN",
    "INSPECT_BEARING",
    "LUBRICATE_ASSET",
    "THROTTLE_LOAD",
    "CALIBRATE_SENSORS",
    "NORMAL_MONITORING"
]

# Action definitions with operational impact metadata
ACTION_DEFINITIONS = {
    "EMERGENCY_SHUTDOWN": {
        "label": "Emergency Shutdown",
        "severity": "CRITICAL",
        "description": "Trigger immediate interlock shutdown to prevent catastrophic asset failure."
    },
    "INSPECT_BEARING": {
        "label": "Inspect Bearing",
        "severity": "HIGH",
        "description": "Despatch technician to inspect mechanical bearings, vibration signatures, or misalignment."
    },
    "LUBRICATE_ASSET": {
        "label": "Lubricate Asset",
        "severity": "MEDIUM",
        "description": "Apply grease or synthetic lubricant to relieve friction and thermal accumulation."
    },
    "THROTTLE_LOAD": {
        "label": "Throttle Load",
        "severity": "MEDIUM",
        "description": "Derate machine operational speed/load by 20-30% to stabilize temperatures."
    },
    "CALIBRATE_SENSORS": {
        "label": "Calibrate Sensors",
        "severity": "LOW",
        "description": "Verify sensor telemetry against physical reference gauges to resolve drift."
    },
    "NORMAL_MONITORING": {
        "label": "Normal Monitoring",
        "severity": "INFO",
        "description": "Operating within nominal design envelope. Continue standard telemetry sampling."
    }
}


def softmax(scores: Dict[str, float], temperature: float = 1.0) -> Dict[str, float]:
    """Compute softmax probabilities from logit or logprob scores."""
    if not scores:
        return {}
    temperature = max(temperature, 1e-4)
    max_val = max(scores.values())
    exp_scores = {k: math.exp((v - max_val) / temperature) for k, v in scores.items()}
    total = sum(exp_scores.values())
    if total <= 0:
        return {k: 1.0 / len(scores) for k in scores}
    return {k: round(v / total, 4) for k, v in exp_scores.items()}


class SemIfEngine:
    """
    Direct-Logit decision scorer.
    Evaluates state and allowed actions without autoregressive generation.
    """
    def __init__(
        self,
        groq_api_key: Optional[str] = None,
        ollama_url: Optional[str] = None,
        default_model: str = "llama-3.1-8b-instant"
    ):
        self.groq_api_key = groq_api_key or os.getenv("GROQ_API_KEY")
        self.ollama_url = ollama_url or os.getenv("OLLAMA_URL", "http://localhost:11434/api")
        self.default_model = default_model
        
        self.groq_client = None
        if self.groq_api_key and Groq:
            try:
                self.groq_client = Groq(api_key=self.groq_api_key)
            except Exception:
                self.groq_client = None

    def build_scoring_prompt(
        self,
        state: Dict[str, Any],
        candidate_options: List[str]
    ) -> str:
        """
        Builds the prompt formatted for direct option logit extraction.
        Options are enumerated with letter tokens: A, B, C, D...
        """
        options_formatted = "\n".join(
            [f"{chr(65 + i)}: {opt}" for i, opt in enumerate(candidate_options)]
        )
        telemetry_lines = "\n".join(
            [f"- {k}: {v}" for k, v in state.get("telemetry", {}).items()]
        ) or "None recorded"
        alerts_lines = "\n".join(
            [f"- {a}" for a in state.get("alerts", [])]
        ) or "None"

        prompt = f"""You are an industrial high-speed reflex triage controller.
Evaluate the current asset telemetry and anomalies, then select the single best immediate action code.

ASSET: {state.get('machine_id', 'UNKNOWN')} ({state.get('machine_name', 'Industrial Asset')})
TELEMETRY:
{telemetry_lines}

ALERTS:
{alerts_lines}

CONTEXT: {state.get('context', 'Routine real-time monitoring')}

ALLOWED ACTIONS:
{options_formatted}

Select exactly one letter representing the best action from the allowed list:"""
        return prompt

    def score_with_groq_logprobs(
        self,
        prompt: str,
        candidate_options: List[str]
    ) -> Optional[Dict[str, float]]:
        """
        Executes a 1-token generation with logprobs=True via Groq.
        Extracts native log probabilities for candidate tokens (A, B, C, D...).
        """
        if not self.groq_client:
            return None

        try:
            response = self.groq_client.chat.completions.create(
                model=self.default_model,
                messages=[
                    {"role": "system", "content": "You are a typed industrial decision scorer. Output exactly one option letter."},
                    {"role": "user", "content": prompt}
                ],
                max_tokens=1,
                temperature=0.0,
                logprobs=True,
                top_logprobs=10
            )

            choice = response.choices[0]
            if not choice.logprobs or not choice.logprobs.content:
                return None

            top_logprobs = choice.logprobs.content[0].top_logprobs
            token_logprobs = {t.token.strip().upper(): t.logprob for t in top_logprobs}

            # Map option letter tokens back to candidate action strings
            scores = {}
            for i, opt in enumerate(candidate_options):
                letter = chr(65 + i)
                # If the letter was in top_logprobs, use its logprob, else floor with -15.0
                lp = token_logprobs.get(letter, -15.0)
                scores[opt] = lp

            return scores
        except Exception:
            return None

    def score_with_local_heuristics(
        self,
        state: Dict[str, Any],
        candidate_options: List[str]
    ) -> Dict[str, float]:
        """
        Deterministic, zero-latency logit approximation based on asset physics.
        Serves as a robust local sovereign fallback when network APIs are offline.
        """
        telemetry = state.get("telemetry", {})
        alerts = state.get("alerts", [])

        # Extract primary metrics
        vib = float(telemetry.get("vibration_rms") or telemetry.get("vibration") or 0.0)
        temp = float(telemetry.get("temperature") or 0.0)
        pressure = float(telemetry.get("pressure") or 0.0)

        # Baseline logits
        raw_logits = {opt: -2.0 for opt in candidate_options}
        if "NORMAL_MONITORING" in raw_logits:
            raw_logits["NORMAL_MONITORING"] = 2.0

        # Critical threshold breaches -> EMERGENCY_SHUTDOWN
        if vib > 5.0 or temp > 95.0 or any("CRITICAL" in str(a).upper() for a in alerts):
            if "EMERGENCY_SHUTDOWN" in raw_logits:
                raw_logits["EMERGENCY_SHUTDOWN"] = 6.5
            if "NORMAL_MONITORING" in raw_logits:
                raw_logits["NORMAL_MONITORING"] = -6.0

        # High vibration -> INSPECT_BEARING
        elif vib > 3.2:
            if "INSPECT_BEARING" in raw_logits:
                raw_logits["INSPECT_BEARING"] = 5.0
            if "NORMAL_MONITORING" in raw_logits:
                raw_logits["NORMAL_MONITORING"] = -3.0

        # High temperature with moderate vibration -> LUBRICATE_ASSET or THROTTLE_LOAD
        elif temp > 75.0:
            if "LUBRICATE_ASSET" in raw_logits:
                raw_logits["LUBRICATE_ASSET"] = 4.2
            if "THROTTLE_LOAD" in raw_logits:
                raw_logits["THROTTLE_LOAD"] = 3.5
            if "NORMAL_MONITORING" in raw_logits:
                raw_logits["NORMAL_MONITORING"] = -2.0

        return raw_logits

    def evaluate_decision(
        self,
        state: Dict[str, Any],
        candidate_options: Optional[List[str]] = None
    ) -> Dict[str, Any]:
        """
        Main SemIf entrypoint:
        1. Formulates state + candidate options.
        2. Tries Groq logprobs (SemIf cloud direct-logit).
        3. Falls back to physics-informed direct scoring.
        4. Softmax normalizes into action probabilities.
        5. Returns argmax action, probability distribution, and latency profile.
        """
        options = candidate_options or list(DEFAULT_ACTIONS)
        prompt = self.build_scoring_prompt(state, options)

        source = "groq_direct_logit"
        scores = self.score_with_groq_logprobs(prompt, options)

        if not scores:
            source = "local_physics_logit"
            scores = self.score_with_local_heuristics(state, options)

        probabilities = softmax(scores)
        best_action = max(probabilities.items(), key=lambda item: item[1])[0]
        confidence = probabilities.get(best_action, 0.0)

        action_meta = ACTION_DEFINITIONS.get(best_action, {
            "label": best_action,
            "severity": "INFO",
            "description": "Standard action"
        })

        return {
            "decision": best_action,
            "confidence": round(confidence * 100, 2),
            "probabilities": probabilities,
            "severity": action_meta["severity"],
            "action_metadata": action_meta,
            "scoring_source": source,
            "allowed_options": options,
            "is_emergency": best_action == "EMERGENCY_SHUTDOWN" and confidence >= 0.70
        }
