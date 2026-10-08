import json
import os
import sys
import time
import redis
import asyncio
from typing import List, Tuple, Dict, Any, Optional
from datetime import datetime

# Add src to python path for internal module discovery
sys.path.append(os.path.join(os.path.dirname(__file__), '../../'))

from src.agent.maintenance_agent import MaintenanceAgent
from src.data.database import (
    init_db,
    log_sensor_reading,
    get_last_alert_timestamp,
    get_machine_parameters,
    log_telemetry_point,
)
from src.services.alerts import create_ai_alert, alarm_rationalizer
from src.data.analytics import evaluate_iso_10816_severity

# --- CONFIGURATION PROTOCOLS ---
IPC_FILE = os.path.join("data", "iot_stream.json")
COMMAND_FILE = os.path.join("data", "commands.json") # AI -> Hardware Bridge
ALERT_COOLDOWN = 300  # 5 Minutes to prevent token bleed
POLL_INTERVAL = 0.5   # Real-time responsiveness

# Redis Configuration
REDIS_HOST = os.getenv("REDIS_HOST", "localhost")
REDIS_PORT = int(os.getenv("REDIS_PORT", 6379))
REDIS_CHANNEL = "telemetry_stream"
REDIS_STREAM_KEY = os.getenv("REDIS_STREAM_KEY", "telemetry_stream_events")

r = redis.Redis(host=REDIS_HOST, port=REDIS_PORT, decode_responses=True)

# --- PREDICTIVE TREND CONFIGURATION ---
ROC_THRESHOLDS = {
    "temperature": 0.5,      # °C per second
    "vibration": 0.1,        # G per second
    "vibration_rms": 0.1,    # mm/s per second
    "pressure": 0.2,         # bar per second
    "current_draw": 2.0      # A per second
}

class TrendAnalyzer:
    """Detects rapid parameter shifts (Rate of Change) before they hit critical thresholds."""
    def __init__(self, history_size=5):
        self.history = {} # (machine_id, param) -> [(timestamp, value)]
        self.history_size = history_size

    def analyze(self, machine_id: str, param: str, value: float, ts: float) -> Tuple[bool, str]:
        key = (machine_id, param)
        if key not in self.history:
            self.history[key] = []
        
        # Add new point
        self.history[key].append((ts, value))
        if len(self.history[key]) > self.history_size:
            self.history[key].pop(0)

        if len(self.history[key]) < 2:
            return False, ""

        # Calculate ROC over the window
        first_ts, first_val = self.history[key][0]
        time_delta = ts - first_ts
        if time_delta <= 0:
            return False, ""

        roc = abs(value - first_val) / time_delta
        threshold = ROC_THRESHOLDS.get(param, 1.0) # Default 1.0 units/sec

        if roc > threshold:
            direction = "Rising" if value > first_val else "Falling"
            reason = f"Rapid {param} shift: {direction} at {roc:.2f} units/sec (Threshold: {threshold})"
            return True, reason
        
        return False, ""

# Initialize Database Schema
init_db()

# Load Sovereign AI Agent
agent = MaintenanceAgent("data/sample_maintenance_data.json")
trend_engine = TrendAnalyzer()

FIELD_ALIASES = {
    "temperature": ["temperature"],
    "vibration_rms": ["vibration_rms", "vibration"],
    "pressure": ["pressure"],
    "rpm": ["rpm"],
    "current_draw": ["current_draw"],
}


def _coerce_float(value):
    try:
        if value is None or isinstance(value, bool):
            return None
        return float(value)
    except (TypeError, ValueError):
        return None


def _log_payload_telemetry(eq_id: str, payload: dict) -> None:
    items = dict(payload)
    if "parameters" in items and isinstance(items["parameters"], dict):
        for p_k, p_v in items["parameters"].items():
            if p_k not in items:
                items[p_k] = p_v
        items.pop("parameters", None)

    for key, value in items.items():
        if key in {"equipment_id", "timestamp", "parameters"}:
            continue
        numeric_value = _coerce_float(value)
        if numeric_value is not None:
            log_telemetry_point(eq_id, key, numeric_value)
        else:
            log_telemetry_point(eq_id, key, None, str(value))


def _find_payload_value(payload: dict, parameter: dict):
    source_field = (parameter.get("source_field") or "").strip()
    candidate_keys = [source_field] if source_field else []
    candidate_keys.extend(FIELD_ALIASES.get(parameter["parameter_key"], []))
    if not candidate_keys:
        candidate_keys.append(parameter["parameter_key"])

    for key in candidate_keys:
        if key and key in payload:
            return key, payload[key]
    return None, None


def _is_critical(parameter: dict, numeric_value: float) -> bool:
    threshold = parameter.get("critical_threshold")
    if threshold is None:
        return False
    direction = (parameter.get("direction") or "above").lower()
    if direction == "below":
        return numeric_value <= float(threshold)
    return numeric_value >= float(threshold)


def _evaluate_parameter_alerts(eq_id: str, payload: dict) -> List[Tuple[str, float, dict]]:
    critical_breaches: List[Tuple[str, float, dict]] = []
    
    # 1. Configured Machine Parameters with ISA-18.2 Rationalizer (Hysteresis + Debouncing)
    for parameter in get_machine_parameters(eq_id):
        if not parameter.get("alert_enabled", 1):
            continue
        source_key, raw_value = _find_payload_value(payload, parameter)
        if not source_key:
            continue
        numeric_value = _coerce_float(raw_value)
        if numeric_value is None:
            continue
        
        param_key = parameter.get("parameter_key") or source_key
        crit_th = _coerce_float(parameter.get("critical_threshold"))
        warn_th = _coerce_float(parameter.get("warning_threshold"))
        direction = parameter.get("direction") or "above"

        # Evaluate through ISA-18.2 alarm rationalizer
        result = alarm_rationalizer.evaluate_condition(
            equipment_id=eq_id,
            parameter_key=param_key,
            value=numeric_value,
            warning_threshold=warn_th,
            critical_threshold=crit_th,
            direction=direction,
            deadband_pct=0.05,
            persistence_required=2,
        )
        if result.get("is_alarm") and result.get("alarm_level") == "CRITICAL":
            critical_breaches.append((source_key, numeric_value, parameter))
        elif crit_th is not None and _is_critical(parameter, numeric_value):
            critical_breaches.append((source_key, numeric_value, parameter))

    # 2. ISO 10816-3 Vibration Severity Check
    vib_raw = payload.get("vibration_rms") or payload.get("vibration")
    numeric_vib = _coerce_float(vib_raw)
    if numeric_vib is not None:
        iso_res = evaluate_iso_10816_severity(machine_class="Class II", vibration_rms=numeric_vib)
        if iso_res.get("zone") == "D":
            iso_param = {
                "parameter_key": "vibration_rms",
                "display_name": f"ISO 10816-3 Vibration Severity (Zone D: {iso_res['status']})",
                "critical_threshold": iso_res["limits"]["zone_c_max"],
                "direction": "above",
                "unit": "mm/s"
            }
            if not any(b[0] in {"vibration", "vibration_rms"} for b in critical_breaches):
                critical_breaches.append(("vibration_rms", numeric_vib, iso_param))

    return critical_breaches


def _build_alert_reason(critical_breaches: List[Tuple[str, float, dict]]) -> str:
    formatted = []
    for source_key, numeric_value, parameter in critical_breaches:
        threshold = parameter.get("critical_threshold")
        direction = (parameter.get("direction") or "above").lower()
        comparator = ">=" if direction != "below" else "<="
        unit = parameter.get("unit") or ""
        unit_suffix = f" {unit}".rstrip()
        formatted.append(
            f"{parameter['display_name']} ({source_key}) {numeric_value}{unit_suffix} "
            f"{comparator} {threshold}{unit_suffix}"
        )
    return "Critical parameter threshold breach: " + "; ".join(formatted)


def push_telemetry_event(payload: dict) -> bool:
    """
    Pushes a telemetry event into the processing pipeline synchronously.
    Persists to database, broadcasts to Redis Pub/Sub, and streams for anomaly detection.
    """
    if not payload or not isinstance(payload, dict):
        return False
    eq_id = payload.get("equipment_id")
    if not eq_id:
        return False

    temp_raw = payload.get("temperature")
    if temp_raw is None:
        temp_raw = (payload.get("parameters") or {}).get("temperature")

    vib_raw = payload.get("vibration")
    if vib_raw is None:
        vib_raw = payload.get("vibration_rms")
    if vib_raw is None:
        params = payload.get("parameters") or {}
        vib_raw = params.get("vibration") or params.get("vibration_rms")

    temp = _coerce_float(temp_raw)
    vib = _coerce_float(vib_raw)
    ts = payload.get("timestamp") or datetime.now().isoformat()

    try:
        log_sensor_reading(eq_id, temp if temp is not None else 0.0, vib if vib is not None else 0.0, timestamp=ts)
        _log_payload_telemetry(eq_id, payload)
    except Exception as db_err:
        print(f"Warning logging telemetry event to DB: {db_err}")

    try:
        r.publish(REDIS_CHANNEL, json.dumps(payload))
        r.xadd(REDIS_STREAM_KEY, {"data": json.dumps(payload)}, maxlen=10000)
    except Exception:
        pass
    return True


async def _process_payload(payload: dict, last_processed_ts: Dict[str, float], skip_db_write: bool = False) -> None:
    eq_id = payload.get("equipment_id")
    if not eq_id:
        return
    ts = payload.get("timestamp", 0)
    # Convert string ISO timestamp to numeric if needed
    if isinstance(ts, str):
        try:
            ts_num = datetime.fromisoformat(ts).timestamp()
        except ValueError:
            ts_num = time.time()
    else:
        ts_num = float(ts or time.time())

    if ts_num <= last_processed_ts.get(eq_id, 0):
        return

    temp_raw = payload.get("temperature")
    if temp_raw is None:
        temp_raw = (payload.get("parameters") or {}).get("temperature")

    vib_raw = payload.get("vibration")
    if vib_raw is None:
        vib_raw = payload.get("vibration_rms")
    if vib_raw is None:
        params = payload.get("parameters") or {}
        vib_raw = params.get("vibration") or params.get("vibration_rms")

    temp = _coerce_float(temp_raw) or 0.0
    vib = _coerce_float(vib_raw) or 0.0

    # 1. Publish to Redis Pub/Sub for real-time dashboard (if not already published)
    try:
        r.publish(REDIS_CHANNEL, json.dumps(payload))
    except Exception as re:
        pass

    # 2. Log Raw Telemetry (skip if already written by API gateway)
    if not skip_db_write:
        log_sensor_reading(eq_id, temp, vib)
        _log_payload_telemetry(eq_id, payload)

    # 3. Predictive Trend Analysis (ROC)
    trend_reason = ""
    is_trend_anomaly = False
    for key, val in payload.items():
        if key in {"equipment_id", "timestamp"}:
            continue
        num_val = _coerce_float(val)
        if num_val is not None:
            triggered, msg = trend_engine.analyze(eq_id, key, num_val, ts_num)
            if triggered:
                is_trend_anomaly = True
                trend_reason = msg
                break

    # 4. Parameter-driven Anomaly Detection (Thresholds & ISO 10816)
    critical_breaches = _evaluate_parameter_alerts(eq_id, payload)
    is_threshold_anomaly = bool(critical_breaches)
    is_anomaly = is_threshold_anomaly or is_trend_anomaly

    if is_anomaly:
        now = time.time()
        last_alert_ts = get_last_alert_timestamp(eq_id)
        
        if (now - last_alert_ts) > ALERT_COOLDOWN:
            reason = _build_alert_reason(critical_breaches) if is_threshold_anomaly else trend_reason
            severity = "CRITICAL" if is_threshold_anomaly else "WARNING"
            print(f"\n[!!!] {severity} ANOMALY: {eq_id} | {reason} [!!!]")
            
            try:
                # Trigger AI Orchestrator Response
                trigger_query = f"URGENT {severity} ALERT: {reason}. Provide technical analysis and prioritized prescription."
                orchestrator_result = await agent.get_orchestrator_response(
                    query=trigger_query, 
                    machine_id=eq_id,
                    session_id="SYSTEM-INGESTOR"
                )
                
                analysis = orchestrator_result["message"]
                create_ai_alert(eq_id, severity, reason, analysis)
                
                # Zero-Latency Caching
                cache_key = f"ai_latest_summary:{eq_id}"
                summary_data = {
                    "message": analysis,
                    "timestamp": datetime.now().isoformat(),
                    "reason": reason,
                    "sources": orchestrator_result.get("sources", []),
                    "confidence": orchestrator_result.get("confidence", 95)
                }
                r.setex(cache_key, 86400, json.dumps(summary_data))
                print(f"✅ AI STRATEGIC PRESCRIPTION LOGGED & CACHED")
            except Exception as e:
                error_msg = f"AI Layer Offline. Protocol: Manual Inspection. Error: {str(e)[:40]}"
                create_ai_alert(eq_id, "CRITICAL", reason, error_msg)
                print(f"⚠️ AI FALLBACK ACTIVE: {error_msg}")

    last_processed_ts[eq_id] = ts_num


async def run_ingestor():
    print(f"--- [SOVEREIGN] IoT Ingestor Online ---")
    print(f"Monitoring: Redis Stream '{REDIS_STREAM_KEY}' & File '{IPC_FILE}' | Channel: {REDIS_CHANNEL}")
    
    last_processed_ts: Dict[str, float] = {}
    last_stream_id = "0"

    try:
        while True:
            # --- PHASE 1: COMMAND LISTENING (ACTUATION) ---
            if os.path.exists(COMMAND_FILE):
                try:
                    with open(COMMAND_FILE, "r") as f:
                        cmd = json.load(f)
                    print(f"\n[!!!] MITIGATION COMMAND DISPATCHED: {cmd.get('action')} for {cmd.get('equipment_id')} [!!!]")
                except (json.JSONDecodeError, IOError):
                    pass

            # --- PHASE 2A: REDIS STREAM INGESTION (HIGH-THROUGHPUT BUS) ---
            processed_stream = False
            try:
                stream_data = r.xread({REDIS_STREAM_KEY: last_stream_id}, count=50, block=10)
                if stream_data:
                    for stream_name, messages in stream_data:
                        for msg_id, fields in messages:
                            last_stream_id = msg_id
                            raw = fields.get("data") or fields.get("payload")
                            if raw:
                                try:
                                    payload = json.loads(raw) if isinstance(raw, str) else raw
                                    await _process_payload(payload, last_processed_ts, skip_db_write=True)
                                    processed_stream = True
                                except Exception:
                                    pass
            except Exception:
                pass

            # --- PHASE 2B: IPC FILE INGESTION (LEGACY FALLBACK) ---
            if os.path.exists(IPC_FILE):
                try:
                    with open(IPC_FILE, "r") as f:
                        readings = json.load(f)

                    if readings:
                        readings.sort(key=lambda x: x.get('timestamp', 0))
                        for payload in readings:
                            await _process_payload(payload, last_processed_ts)
                except (json.JSONDecodeError, IOError):
                    pass

            await asyncio.sleep(POLL_INTERVAL)

    except KeyboardInterrupt:
        print("\n[!] Sovereign Ingestor: Graceful Shutdown Initiated.")

    except KeyboardInterrupt:
        print("\n[!] Sovereign Ingestor: Graceful Shutdown Initiated.")

if __name__ == "__main__":
    asyncio.run(run_ingestor())
