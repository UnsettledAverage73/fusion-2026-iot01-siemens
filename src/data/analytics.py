import sqlite3
from datetime import datetime
import numpy as np
import sys
import os

# Add src to python path for internal module discovery
sys.path.append(os.path.join(os.path.dirname(__file__), '../../'))

try:
    import rust_engine
except ImportError:
    rust_engine = None

def calculate_historical_failure_factor(machine_id: str) -> float:
    """
    Analyzes past incident tickets to find recurring failure modes.
    Example: Specific bearing that fails every 500 hours.
    Returns: A risk factor (0.0 to 1.5) based on current runtime vs historical failure cycle.
    """
    from src.data.database import DB_PATH, get_latest_usage_snapshot
    
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    cursor = conn.cursor()
    
    # Get all manual logs for this machine, ordered by timestamp
    cursor.execute("""
        SELECT timestamp, action_taken, parts_replaced 
        FROM manual_logs 
        WHERE equipment_id = ? 
        ORDER BY timestamp ASC
    """, (machine_id,))
    logs = cursor.fetchall()
    
    if len(logs) < 2:
        conn.close()
        return 0.0

    # Group by action/part to find cycles
    cycles = {} # action -> [timestamps]
    for log in logs:
        key = (log['action_taken'] or log['parts_replaced'] or "general").lower()
        # Simplify key for grouping
        if "bearing" in key: key = "bearing_replacement"
        elif "seal" in key: key = "seal_replacement"
        elif "belt" in key: key = "belt_adjustment"
        
        if key not in cycles: cycles[key] = []
        cycles[key].append(datetime.fromisoformat(log['timestamp']))

    max_factor = 0.0
    
    # Get current runtime
    usage = get_latest_usage_snapshot(machine_id)
    current_runtime = usage.get("runtime_hours", 0) if usage else 0

    for key, timestamps in cycles.items():
        if len(timestamps) < 2: continue
        
        # Calculate average time between failures (in hours approx)
        intervals = []
        for i in range(1, len(timestamps)):
            delta = (timestamps[i] - timestamps[i-1]).total_seconds() / 3600.0
            intervals.append(delta)
        
        avg_interval = np.mean(intervals)
        
        # If the cycle is consistent, check if we're approaching the limit
        if avg_interval > 0:
            time_since_last = (datetime.now() - timestamps[-1]).total_seconds() / 3600.0
            progress = time_since_last / avg_interval
            if progress > 0.8:
                factor = min(1.5, (progress - 0.8) * 5.0) # Scale to 1.5 at 110% progress
                max_factor = max(max_factor, factor)

    conn.close()
    return round(max_factor, 2)

def calculate_log_risk_score(logs):
    """
    Analyzes textual logs to determine a risk score (0-100).
    Focuses on keyword detection (including Hinglish) and report frequency.
    """
    if not logs:
        return 0

    # Risk Weight Keywords
    CRITICAL_KEYWORDS = ["dhuan", "smoke", "fire", "aag", "breakdown", "shat down", "fail", "total downtime", "leak", "phata", "hissing"]
    HIGH_KEYWORDS = ["awaz", "noise", "vibration", "vibrate", "garam", "hot", "overheat", "smell", "badhu", "lag", "atki"]
    MEDIUM_KEYWORDS = ["slow", "halki", "minor", "check", "dekho", "servicing", "replacement"]

    score = 0
    recent_logs = logs[:5]  # Only analyze last 5 events
    
    for entry in recent_logs:
        text = str(entry.get('note', entry.get('action_taken', ''))).lower()
        
        # Keyword matching
        if any(kw in text for kw in CRITICAL_KEYWORDS):
            score += 50
        elif any(kw in text for kw in HIGH_KEYWORDS):
            score += 25
        elif any(kw in text for kw in MEDIUM_KEYWORDS):
            score += 10
            
    # Cap score at 100
    return min(100, score)

def calculate_failure_probability(readings):
    """
    Analyzes telemetry slope to predict failure.
    Returns: Probability (0-100) and Estimated Minutes to Failure.
    """
    if len(readings) < 5:
        return 0, None

    # Ensure readings are chronologically ordered (oldest to newest)
    if any('timestamp' in r for r in readings):
        try:
            sorted_readings = sorted(readings, key=lambda x: str(x.get('timestamp', '')))
            temps = [r.get('temperature', 0) for r in sorted_readings if 'temperature' in r]
        except Exception:
            temps = [r.get('temperature', 0) for r in readings if 'temperature' in r]
    else:
        temps = [r.get('temperature', 0) for r in readings if 'temperature' in r]

    if not temps:
        return 0, None
        
    times = np.arange(len(temps))

    # --- RUST INTEGRATION ---
    max_temp = max(temps)
    if rust_engine and len(temps) > 50:
        st = rust_engine.SegmentTree(temps)
        max_temp = st.query_max(0, len(temps))

    # Calculate Slope (m)
    slope, intercept = np.polyfit(times, temps, 1)

    # If temperature is dropping or stable, risk is low
    if slope <= 0:
        return 5, None

    # Predict time to hit 130C
    target_time = (130 - intercept) / slope
    mins_remaining = max(0, target_time - len(temps))

    # Probability logic: higher slope = higher immediate risk
    base_probability = min(100, int(slope * 50)) 
    if max_temp > 110:
        base_probability = max(base_probability, 80)
    
    # Check vibration if available in readings
    vibs = [r.get('vibration_rms', r.get('vibration', 0)) for r in readings if ('vibration_rms' in r or 'vibration' in r)]
    if vibs:
        max_vib = max(vibs)
        # Standard Class II warning is 2.8 mm/s, critical is 7.1 mm/s
        if max_vib >= 7.1:
            base_probability = max(base_probability, 95)
        elif max_vib >= 2.8:
            base_probability = max(base_probability, 65)

    return base_probability, round(mins_remaining, 1)


# =====================================================================
# --- ISO 10816-3 & ISO 20816 VIBRATION SEVERITY EVALUATION ---
# =====================================================================

class MachineClass:
    CLASS_I = "Class I"      # Small machines/motors up to 15 kW
    CLASS_II = "Class II"    # Medium machines 15 kW - 75 kW or rigid foundation up to 300 kW
    CLASS_III = "Class III"  # Large machines with rigid foundation (>75 kW)
    CLASS_IV = "Class IV"    # Large machines with flexible/soft foundation (>75 kW)


ISO_10816_LIMITS = {
    MachineClass.CLASS_I: (0.71, 1.80, 4.50),
    MachineClass.CLASS_II: (1.12, 2.80, 7.10),
    MachineClass.CLASS_III: (1.80, 4.50, 11.20),
    MachineClass.CLASS_IV: (2.80, 7.10, 18.00),
}


def normalize_machine_class(machine_class: str) -> str:
    """Maps arbitrary machine classification strings to standard ISO 10816-3 classes."""
    if not machine_class:
        return MachineClass.CLASS_II
    norm = str(machine_class).lower().strip()
    if "class iv" in norm or "tier3" in norm or "large_flexible" in norm or "soft" in norm:
        return MachineClass.CLASS_IV
    if "class iii" in norm or "large" in norm or "rigid" in norm:
        return MachineClass.CLASS_III
    if "class ii" in norm or "tier2" in norm or "medium" in norm:
        return MachineClass.CLASS_II
    if "class i" in norm or "tier1" in norm or "small" in norm:
        return MachineClass.CLASS_I
    return MachineClass.CLASS_II


def evaluate_iso_10816_severity(machine_class: str, vibration_rms: float) -> dict:
    """
    Evaluates vibration severity (RMS velocity in mm/s) based on ISO 10816-3.
    
    Zone A: Vibration of newly commissioned machines (Good)
    Zone B: Machines acceptable for unrestricted long-term operation
    Zone C: Vibration considered unsatisfactory for long-term continuous operation (Restricted/Warning)
    Zone D: Vibration values sufficiently severe to cause machine damage (Critical/Trip)
    """
    norm_class = normalize_machine_class(machine_class)
    limit_a, limit_b, limit_c = ISO_10816_LIMITS.get(norm_class, ISO_10816_LIMITS[MachineClass.CLASS_II])
    v_rms = max(0.0, float(vibration_rms or 0.0))

    if v_rms <= limit_a:
        zone = "A"
        status = "GOOD"
        score = round((v_rms / max(0.01, limit_a)) * 25.0, 1)
        action = "Normal operation. No maintenance required."
        severity = "NORMAL"
    elif v_rms <= limit_b:
        zone = "B"
        status = "ACCEPTABLE"
        progress = (v_rms - limit_a) / max(0.01, (limit_b - limit_a))
        score = round(25.0 + progress * 25.0, 1)
        action = "Unrestricted continuous operation. Routine monitoring."
        severity = "LOW"
    elif v_rms <= limit_c:
        zone = "C"
        status = "WARNING"
        progress = (v_rms - limit_b) / max(0.01, (limit_c - limit_b))
        score = round(50.0 + progress * 30.0, 1)
        action = "Restricted operation. Plan remedial maintenance or alignment."
        severity = "WARNING"
    else:
        zone = "D"
        status = "CRITICAL"
        overshoot = min(20.0, (v_rms - limit_c) * 5.0)
        score = round(min(100.0, 80.0 + overshoot), 1)
        action = "Danger: Immediate intervention required. Machine damage imminent."
        severity = "CRITICAL"

    return {
        "machine_class": norm_class,
        "vibration_rms": v_rms,
        "zone": zone,
        "status": status,
        "severity": severity,
        "risk_score": score,
        "recommended_action": action,
        "limits": {
            "zone_a_max": limit_a,
            "zone_b_max": limit_b,
            "zone_c_max": limit_c,
            "unit": "mm/s"
        }
    }


def extract_vibration_dsp_features(samples: list) -> dict:
    """
    Computes time-domain statistical DSP features from raw or windowed vibration waveform:
    - RMS (Root Mean Square)
    - Peak Amplitude & Peak-to-Peak
    - Crest Factor (Peak / RMS) -> sensitive early indicator of bearing race spalling
    - Kurtosis -> 4th statistical moment, sensitive to sharp impact bursts (healthy ~ 3.0)
    - Skewness -> 3rd statistical moment
    """
    if not samples or len(samples) == 0:
        return {
            "rms": 0.0,
            "peak": 0.0,
            "peak_to_peak": 0.0,
            "crest_factor": 0.0,
            "kurtosis": 3.0,
            "skewness": 0.0,
            "sample_count": 0,
            "bearing_fault_suspected": False
        }

    arr = np.array(samples, dtype=float)
    count = len(arr)
    rms = float(np.sqrt(np.mean(arr ** 2)))
    peak = float(np.max(np.abs(arr)))
    p2p = float(np.ptp(arr))
    crest_factor = float(peak / rms) if rms > 1e-6 else 0.0

    # Higher moments
    mean = float(np.mean(arr))
    std = float(np.std(arr))
    if std > 1e-6 and count >= 4:
        normalized = (arr - mean) / std
        skewness = float(np.mean(normalized ** 3))
        kurtosis = float(np.mean(normalized ** 4))
    else:
        skewness = 0.0
        kurtosis = 3.0

    # Industrial rule: Kurtosis > 3.5 or Crest Factor > 4.5 indicates impulsive impact defects
    bearing_fault_suspected = bool(kurtosis > 3.8 or crest_factor > 4.5)

    return {
        "rms": round(rms, 3),
        "peak": round(peak, 3),
        "peak_to_peak": round(p2p, 3),
        "crest_factor": round(crest_factor, 2),
        "kurtosis": round(kurtosis, 2),
        "skewness": round(skewness, 2),
        "sample_count": count,
        "bearing_fault_suspected": bearing_fault_suspected
    }

