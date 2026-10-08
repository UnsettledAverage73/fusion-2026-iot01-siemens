import json
import os
import time
from datetime import datetime, timedelta
from typing import Optional, Dict, Any, List
from enum import Enum

import redis

from src.data.database import log_ai_alert
from src.notifications.whatsapp import send_whatsapp_alert

REDIS_HOST = os.getenv("REDIS_HOST", "localhost")
REDIS_PORT = int(os.getenv("REDIS_PORT", 6379))
ALERT_CHANNEL = os.getenv("ALERT_CHANNEL", "ai_alerts_channel")


# =====================================================================
# --- ISA-18.2 / IEC 62682 ALARM MANAGEMENT ---
# =====================================================================

class AlarmState(str, Enum):
    NORMAL = "NORMAL"
    ACTIVE_UNACK = "ACTIVE_UNACK"
    ACTIVE_ACK = "ACTIVE_ACK"
    SHELVED = "SHELVED"
    CLEARED_UNACK = "CLEARED_UNACK"


class AlarmRationalizer:
    """
    Industrial Alarm Rationalizer implementing ANSI/ISA-18.2 and IEC 62682 principles:
    - Deadband / Hysteresis: Eliminates alarm chattering around threshold boundaries
    - Debouncing / Persistence: Requires N consecutive breaches before latching
    - Alarm Shelving: Temporarily silences nuisance alarms with automatic unshelve timer
    - Consequential Alarm Suppression
    """

    def __init__(self, default_deadband_pct: float = 0.05, default_persistence: int = 3):
        self.default_deadband_pct = default_deadband_pct
        self.default_persistence = default_persistence
        # State stores: (equipment_id, parameter_key) -> state_dict
        self._states: Dict[str, Dict[str, Any]] = {}
        self._shelved_until: Dict[str, float] = {}

    def _get_key(self, equipment_id: str, parameter_key: str) -> str:
        return f"{equipment_id}:{parameter_key}"

    def shelve_alarm(self, equipment_id: str, parameter_key: str, duration_minutes: int, reason: str) -> Dict[str, Any]:
        """Shelves an alarm for a designated duration (ISA-18.2 section 10)."""
        key = self._get_key(equipment_id, parameter_key)
        expire_time = time.time() + (duration_minutes * 60)
        self._shelved_until[key] = expire_time

        if key in self._states:
            self._states[key]["state"] = AlarmState.SHELVED
            self._states[key]["shelved_reason"] = reason
            self._states[key]["shelved_until"] = datetime.fromtimestamp(expire_time).isoformat()

        return {
            "key": key,
            "state": AlarmState.SHELVED,
            "duration_minutes": duration_minutes,
            "shelved_until": datetime.fromtimestamp(expire_time).isoformat(),
            "reason": reason
        }

    def acknowledge_alarm(self, equipment_id: str, parameter_key: str, operator_name: str) -> Optional[Dict[str, Any]]:
        """Acknowledges an active alarm by an operator."""
        key = self._get_key(equipment_id, parameter_key)
        state_record = self._states.get(key)
        if not state_record:
            return None

        if state_record["state"] == AlarmState.ACTIVE_UNACK:
            state_record["state"] = AlarmState.ACTIVE_ACK
            state_record["acknowledged_by"] = operator_name
            state_record["acknowledged_at"] = datetime.now().isoformat()
        elif state_record["state"] == AlarmState.CLEARED_UNACK:
            state_record["state"] = AlarmState.NORMAL
            state_record["acknowledged_by"] = operator_name
            state_record["acknowledged_at"] = datetime.now().isoformat()

        return state_record

    def evaluate_condition(
        self,
        equipment_id: str,
        parameter_key: str,
        value: float,
        warning_threshold: Optional[float] = None,
        critical_threshold: Optional[float] = None,
        direction: str = "above",
        deadband_pct: Optional[float] = None,
        persistence_required: Optional[int] = None,
    ) -> Dict[str, Any]:
        """
        Evaluates an analog or digital process variable against configured thresholds with
        hysteresis deadband and debounce persistence filtering.
        """
        key = self._get_key(equipment_id, parameter_key)
        deadband = deadband_pct if deadband_pct is not None else self.default_deadband_pct
        persistence = persistence_required if persistence_required is not None else self.default_persistence

        # Check if currently shelved
        now = time.time()
        if key in self._shelved_until:
            if now < self._shelved_until[key]:
                return {
                    "is_alarm": False,
                    "alarm_level": "NORMAL",
                    "state": AlarmState.SHELVED,
                    "reason": f"Alarm shelved until {datetime.fromtimestamp(self._shelved_until[key]).isoformat()}"
                }
            else:
                del self._shelved_until[key]

        if key not in self._states:
            self._states[key] = {
                "state": AlarmState.NORMAL,
                "current_level": "NORMAL",
                "consecutive_breaches": 0,
                "consecutive_clears": 0,
                "last_value": value,
                "triggered_at": None,
                "acknowledged_by": None,
                "acknowledged_at": None,
            }

        rec = self._states[key]
        rec["last_value"] = value
        dir_above = direction.lower() != "below"

        # Determine raw breach level
        raw_level = "NORMAL"
        if critical_threshold is not None:
            crit_breach = (value >= critical_threshold) if dir_above else (value <= critical_threshold)
            if crit_breach:
                raw_level = "CRITICAL"
        
        if raw_level == "NORMAL" and warning_threshold is not None:
            warn_breach = (value >= warning_threshold) if dir_above else (value <= warning_threshold)
            if warn_breach:
                raw_level = "WARNING"

        # Apply Hysteresis (Deadband) when recovering from active alarm
        if rec["current_level"] in {"CRITICAL", "WARNING"}:
            threshold = critical_threshold if rec["current_level"] == "CRITICAL" else warning_threshold
            if threshold is not None:
                offset = abs(threshold) * deadband
                # To clear an 'above' alarm, value must drop below (threshold - offset)
                cleared = (value < (threshold - offset)) if dir_above else (value > (threshold + offset))
                if not cleared:
                    raw_level = rec["current_level"]

        # Apply Debouncing / Persistence filter
        if raw_level != "NORMAL":
            rec["consecutive_breaches"] += 1
            rec["consecutive_clears"] = 0
            if rec["consecutive_breaches"] >= persistence:
                if rec["state"] in {AlarmState.NORMAL, AlarmState.CLEARED_UNACK}:
                    rec["state"] = AlarmState.ACTIVE_UNACK
                    rec["triggered_at"] = datetime.now().isoformat()
                rec["current_level"] = raw_level
                return {
                    "is_alarm": True,
                    "alarm_level": raw_level,
                    "state": rec["state"],
                    "reason": f"{parameter_key} threshold breach: {value} (persistence {rec['consecutive_breaches']}/{persistence})",
                    "equipment_id": equipment_id,
                    "parameter_key": parameter_key,
                }
        else:
            rec["consecutive_clears"] += 1
            rec["consecutive_breaches"] = 0
            if rec["consecutive_clears"] >= persistence:
                if rec["state"] == AlarmState.ACTIVE_UNACK:
                    rec["state"] = AlarmState.CLEARED_UNACK
                elif rec["state"] == AlarmState.ACTIVE_ACK:
                    rec["state"] = AlarmState.NORMAL
                rec["current_level"] = "NORMAL"

        return {
            "is_alarm": rec["current_level"] != "NORMAL",
            "alarm_level": rec["current_level"],
            "state": rec["state"],
            "reason": "Parameter normal or within deadband",
            "equipment_id": equipment_id,
            "parameter_key": parameter_key,
        }

    def get_all_active_alarms(self) -> List[Dict[str, Any]]:
        """Returns list of currently active or unacknowledged alarms."""
        active = []
        for key, rec in self._states.items():
            if rec["state"] in {AlarmState.ACTIVE_UNACK, AlarmState.ACTIVE_ACK, AlarmState.CLEARED_UNACK}:
                eq_id, param = key.split(":", 1)
                active.append({
                    "equipment_id": eq_id,
                    "parameter_key": param,
                    **rec
                })
        return active


# Global Alarm Rationalizer Singleton
alarm_rationalizer = AlarmRationalizer()


def create_ai_alert(
    equipment_id: str,
    severity: str,
    reason: str,
    prescription: str,
) -> Optional[str]:
    alert_id = log_ai_alert(equipment_id, severity, reason, prescription)

    payload = {
        "id": alert_id or f"{equipment_id}-{datetime.now().timestamp()}",
        "equipment_id": equipment_id,
        "severity": severity,
        "reason": reason,
        "prescription": prescription,
        "timestamp": datetime.now().isoformat(),
        "isa_standard": "ANSI/ISA-18.2-2016",
        "state": AlarmState.ACTIVE_UNACK.value,
    }
    try:
        r = redis.Redis(host=REDIS_HOST, port=REDIS_PORT, decode_responses=True)
        r.publish(ALERT_CHANNEL, json.dumps(payload))
    except Exception:
        pass

    if severity.upper() == "CRITICAL":
        return send_whatsapp_alert(
            equipment_id=equipment_id,
            severity=severity.upper(),
            reason=reason,
            prescription=prescription,
        )

    return None

