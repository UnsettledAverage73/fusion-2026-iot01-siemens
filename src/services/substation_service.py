import os
import json
import joblib
import numpy as np
import pandas as pd
from typing import Dict, Any, List, Optional

MODELS_DIR = "models"
DATA_DIR = "data"
TERMINAL_MODEL_PATH = os.path.join(MODELS_DIR, "terminal_fault_model.joblib")
TRANSFORMER_MODEL_PATH = os.path.join(MODELS_DIR, "transformer_health_model.joblib")
TOPOLOGY_PATH = os.path.join(DATA_DIR, "substation_topology.json")

# In-memory cached artifacts
_terminal_artifacts = None
_transformer_artifacts = None

def get_terminal_model():
    global _terminal_artifacts
    if _terminal_artifacts is None and os.path.exists(TERMINAL_MODEL_PATH):
        try:
            _terminal_artifacts = joblib.load(TERMINAL_MODEL_PATH)
        except Exception as e:
            print(f"Error loading terminal model: {e}")
    return _terminal_artifacts

def get_transformer_model():
    global _transformer_artifacts
    if _transformer_artifacts is None and os.path.exists(TRANSFORMER_MODEL_PATH):
        try:
            _transformer_artifacts = joblib.load(TRANSFORMER_MODEL_PATH)
        except Exception as e:
            print(f"Error loading transformer model: {e}")
    return _transformer_artifacts

# Preset Scenarios for instant testing in Streamlit & API
PRESET_SCENARIOS = {
    "nominal": {
        "title": "🟢 Nominal Baseload (All Healthy)",
        "description": "Standard 400kV substation operation with nominal thermal, electrical, and gas levels.",
        "terminal": {
            "voltage": 230.8,
            "current": 38.5,
            "temperature": 43.2,
            "frequency": 50.02,
            "power_factor": 0.94,
            "vibration_level": 1.25,
            "device_age": 4.5,
            "terminal_efficiency": 94.2,
            "load_variation": 12.4,
            "signal_strength": -64.0,
            "apparent_power": 8.88,
            "real_power": 8.35,
            "energy_consumed": 142.0,
            "anomaly_score": 0.12
        },
        "transformer": {
            "h2": 18.5,
            "ch4": 22.1,
            "c2h6": 12.0,
            "c2h4": 15.4,
            "c2h2": 0.45,
            "co": 220.0,
            "co2": 2100.0,
            "bdv": 68.5,
            "moisture": 12.0,
            "oil_temp": 52.0,
            "winding_temp": 64.5,
            "age": 6.0
        }
    },
    "thermal_t3_hotspot": {
        "title": "🔴 Critical: Transformer T1 Winding Hotspot (T3 > 700°C)",
        "description": "Severe thermal runaway inside transformer main tank. Ethylene (C2H4) spike indicating acute cellulose & core overheating.",
        "terminal": {
            "voltage": 224.2,
            "current": 52.0,
            "temperature": 68.5,
            "frequency": 49.91,
            "power_factor": 0.88,
            "vibration_level": 3.8,
            "device_age": 12.0,
            "terminal_efficiency": 78.5,
            "load_variation": 28.5,
            "signal_strength": -68.0,
            "apparent_power": 11.65,
            "real_power": 10.25,
            "energy_consumed": 185.0,
            "anomaly_score": 0.65
        },
        "transformer": {
            "h2": 65.0,
            "ch4": 195.0,
            "c2h6": 85.0,
            "c2h4": 820.0,  # Dominant T3 gas
            "c2h2": 4.2,
            "co": 580.0,
            "co2": 3200.0,
            "bdv": 52.0,
            "moisture": 24.5,
            "oil_temp": 88.0,
            "winding_temp": 118.0,
            "age": 14.5
        }
    },
    "electrical_arcing": {
        "title": "⚡ Critical: Bushing Flashover & High-Energy Arcing (D1/D2)",
        "description": "Acetylene (C2H2) explosion accompanied by breakdown voltage collapse. Imminent catastrophic dielectric failure.",
        "terminal": {
            "voltage": 204.5,
            "current": 68.0,
            "temperature": 74.0,
            "frequency": 49.78,
            "power_factor": 0.79,
            "vibration_level": 7.4,
            "device_age": 9.5,
            "terminal_efficiency": 71.0,
            "load_variation": 34.0,
            "signal_strength": -76.0,
            "apparent_power": 13.9,
            "real_power": 10.98,
            "energy_consumed": 210.0,
            "anomaly_score": 0.82
        },
        "transformer": {
            "h2": 480.0,
            "ch4": 75.0,
            "c2h6": 32.0,
            "c2h4": 92.0,
            "c2h2": 340.0,  # Massive Acetylene indicates arcing
            "co": 310.0,
            "co2": 2400.0,
            "bdv": 24.0,    # Severe BDV drop
            "moisture": 28.0,
            "oil_temp": 72.0,
            "winding_temp": 89.0,
            "age": 11.0
        }
    },
    "breaker_contact_overheat": {
        "title": "🟠 Warning: SF6 Circuit Breaker CB-01 Contact Wear",
        "description": "Mechanical vibration shock and high contact terminal resistance causing terminal overheating without transformer internal faults.",
        "terminal": {
            "voltage": 218.0,
            "current": 58.5,
            "temperature": 86.4,  # High terminal temp
            "frequency": 49.95,
            "power_factor": 0.85,
            "vibration_level": 8.9,  # Severe mechanical vibration
            "device_age": 14.0,
            "terminal_efficiency": 68.0,
            "load_variation": 31.0,
            "signal_strength": -71.0,
            "apparent_power": 12.75,
            "real_power": 10.84,
            "energy_consumed": 195.0,
            "anomaly_score": 0.78
        },
        "transformer": {
            "h2": 22.0,
            "ch4": 28.0,
            "c2h6": 15.0,
            "c2h4": 18.0,
            "c2h2": 0.6,
            "co": 240.0,
            "co2": 2200.0,
            "bdv": 64.0,
            "moisture": 14.0,
            "oil_temp": 56.0,
            "winding_temp": 68.0,
            "age": 7.0
        }
    }
}

def get_preset_scenarios():
    return PRESET_SCENARIOS

DEFAULT_TOPOLOGY = {
    "substation_id": "SUB-SIEMENS-400KV-NORTH",
    "name": "Siemens 400kV / 220kV Grid Substation Alpha",
    "voltage_levels": ["400 kV", "220 kV", "33 kV"],
    "nodes": {
        "INCOMER_HV": {"type": "incomer", "label": "400kV HV Incomer", "x": 0.10, "y": 0.50, "voltage": "400 kV", "weight": 0.50},
        "CB_01": {"type": "circuit_breaker", "label": "CB-01 (Incomer Breaker)", "x": 0.25, "y": 0.50, "voltage": "400 kV", "weight": 0.35},
        "TRANSFORMER_T1": {"type": "transformer", "label": "Transformer T1 (315 MVA)", "x": 0.45, "y": 0.72, "voltage": "400/220 kV", "weight": 0.45},
        "TRANSFORMER_T2": {"type": "transformer", "label": "Transformer T2 (315 MVA)", "x": 0.45, "y": 0.28, "voltage": "400/220 kV", "weight": 0.45},
        "BUS_A": {"type": "busbar", "label": "Main Busbar A (220kV)", "x": 0.65, "y": 0.72, "voltage": "220 kV", "weight": 0.30},
        "BUS_B": {"type": "busbar", "label": "Transfer Busbar B (220kV)", "x": 0.65, "y": 0.28, "voltage": "220 kV", "weight": 0.30},
        "CB_02": {"type": "circuit_breaker", "label": "CB-02 (Feeder-1 Breaker)", "x": 0.80, "y": 0.72, "voltage": "220 kV", "weight": 0.20},
        "CB_03": {"type": "circuit_breaker", "label": "CB-03 (Feeder-2 Breaker)", "x": 0.80, "y": 0.28, "voltage": "220 kV", "weight": 0.20},
        "FEEDER_F1": {"type": "feeder", "label": "Feeder F1 (Heavy Industrial)", "x": 0.95, "y": 0.72, "voltage": "33 kV", "weight": 0.15},
        "FEEDER_F2": {"type": "feeder", "label": "Feeder F2 (Urban Residential)", "x": 0.95, "y": 0.28, "voltage": "33 kV", "weight": 0.15}
    },
    "edges": [
        ("INCOMER_HV", "CB_01"),
        ("CB_01", "TRANSFORMER_T1"),
        ("CB_01", "TRANSFORMER_T2"),
        ("TRANSFORMER_T1", "BUS_A"),
        ("TRANSFORMER_T2", "BUS_B"),
        ("BUS_A", "CB_02"),
        ("BUS_B", "CB_03"),
        ("CB_02", "FEEDER_F1"),
        ("CB_03", "FEEDER_F2")
    ]
}

def get_substation_topology():
    if os.path.exists(TOPOLOGY_PATH):
        try:
            with open(TOPOLOGY_PATH, "r") as f:
                data = json.load(f)
                if "topology" in data:
                    return data["topology"]
        except Exception as e:
            print(f"Error reading topology: {e}")
    return DEFAULT_TOPOLOGY

def predict_terminal(params: Dict[str, float]) -> Dict[str, Any]:
    """Runs Tier-1 Terminal & Circuit Breaker Fault Prediction with XAI."""
    v = float(params.get("voltage") or 230.0)
    i = float(params.get("current") or 35.0)
    t = float(params.get("temperature") or 45.0)
    f = float(params.get("frequency") or 50.0)
    pf = float(params.get("power_factor") or 0.92)
    vib = float(params.get("vibration_level") or 1.5)
    age = float(params.get("device_age") or 5.0)
    eff = float(params.get("terminal_efficiency") or 90.0)
    load_var = float(params.get("load_variation") or 15.0)
    sig = float(params.get("signal_strength") or -65.0)
    app_p = float(params.get("apparent_power")) if params.get("apparent_power") is not None else (v * i) / 1000.0
    real_p = float(params.get("real_power")) if params.get("real_power") is not None else (app_p * pf)
    energy = float(params.get("energy_consumed")) if params.get("energy_consumed") is not None else (real_p * 18.0)
    anomaly = float(params.get("anomaly_score")) if params.get("anomaly_score") is not None else 0.2

    # Feature engineering matching notebook pipeline
    mean_i = 35.0
    thermal_stress = t * ((i / (mean_i + 1e-5)) ** 2)
    volt_dev = abs(v - 230.0) / 230.0
    freq_dev = abs(f - 50.0)
    pf_loss = 1.0 - pf
    impedance = v / (i + 0.01)
    mech_thermal = (vib * t) / 100.0

    # Advanced IEC 60038 / IEC 62271 / ISO 10816 Physics Features
    iec_under_v = max(0.0, 212.0 - v)
    iec_over_v = max(0.0, v - 248.0)
    v_excursion = iec_under_v + iec_over_v
    iec_thermal = max(0.0, t - 68.0)
    iso_vib_d = max(0.0, vib - 5.5)
    vib_shock = (vib ** 2) / 10.0
    sag_vib = iec_under_v * vib
    phys_trip = (
        (1.0 if t > 72.0 else 0.0) * 2.0 +
        (1.0 if vib > 6.0 else 0.0) * 2.5 +
        (1.0 if (v < 212.0 or v > 248.0) else 0.0) * 2.0
    )
    joint_fail = (iec_thermal / 10.0) + (iso_vib_d / 2.0) + (v_excursion / 10.0)
    app_real_loss = app_p - real_p
    eff_loss = (100.0 - eff) * thermal_stress / 1000.0

    raw_row = {
        "Voltage(V)": v, "Current(A)": i, "Temperature(C)": t, "Frequency(Hz)": f,
        "Power_Factor": pf, "Vibration_Level": vib, "Device_Age(Years)": age,
        "Terminal_Efficiency(%)": eff, "Load_Variation(%)": load_var,
        "Signal_Strength(dB)": sig, "Apparent_Power(kVA)": app_p,
        "Real_Power(kW)": real_p, "Energy_Consumed(kWh)": energy,
        "Anomaly_Score": anomaly, "Thermal_Stress_Index": thermal_stress,
        "Voltage_Deviation_Ratio": volt_dev, "Frequency_Deviation": freq_dev,
        "Power_Factor_Loss": pf_loss, "Impedance_Proxy": impedance,
        "Mech_Thermal_Shock": mech_thermal,
        "IEC_UnderVoltage_Margin": iec_under_v,
        "IEC_OverVoltage_Margin": iec_over_v,
        "Voltage_Excursion_Severity": v_excursion,
        "IEC_Thermal_Excursion": iec_thermal,
        "ISO_Vib_ZoneD_Excursion": iso_vib_d,
        "Vibration_Pure_Shock": vib_shock,
        "Sag_Vibration_Coupling": sag_vib,
        "Physical_Trip_Indicator": phys_trip,
        "Joint_Failure_Vector": joint_fail,
        "Apparent_Real_Loss": app_real_loss,
        "Efficiency_Loss_Factor": eff_loss
    }

    # Model inference
    model_art = get_terminal_model()
    if model_art is not None:
        model = model_art["model"]
        cols = model_art["feature_names"]
        df_in = pd.DataFrame([raw_row])
        # Ensure all required features are present
        for col in cols:
            if col not in df_in.columns:
                df_in[col] = 0.0
        df_in = df_in[cols]
        probs = model.predict_proba(df_in)[0]
        fault_prob = float(probs[1])
        fault_status = int(fault_prob >= 0.50)
    else:
        # High-fidelity physics heuristic fallback
        z_score = (thermal_stress / 120.0) * 0.4 + (volt_dev * 10.0) * 0.3 + (vib / 5.0) * 0.3
        fault_prob = float(np.clip(1.0 / (1.0 + np.exp(-(z_score - 1.2) * 3.0)), 0.01, 0.99))
        fault_status = int(fault_prob >= 0.50)

    # Compute sensor attribution (SHAP proxy)
    drivers = []
    if t > 65.0:
        drivers.append({"sensor": "Temperature(C)", "value": t, "status": "CRITICAL" if t > 80 else "WARNING", "impact": round((t - 50.0) / 10.0, 2)})
    if vib > 4.0:
        drivers.append({"sensor": "Vibration_Level", "value": vib, "status": "CRITICAL" if vib > 7 else "WARNING", "impact": round(vib / 2.0, 2)})
    if volt_dev > 0.08:
        drivers.append({"sensor": "Voltage_Deviation_Ratio", "value": round(volt_dev, 3), "status": "WARNING", "impact": round(volt_dev * 15, 2)})
    if load_var > 25.0:
        drivers.append({"sensor": "Load_Variation(%)", "value": load_var, "status": "WARNING", "impact": round((load_var - 20) / 5.0, 2)})
    if not drivers:
        drivers.append({"sensor": "All Electrical Sensors", "value": 1.0, "status": "NORMAL", "impact": -1.5})

    return {
        "equipment": "Circuit Breaker / Switchgear Terminal",
        "fault_status": fault_status,
        "fault_status_label": "CRITICAL TRIP / FAULT" if fault_status == 1 else "NOMINAL HEALTHY",
        "fault_probability": round(fault_prob, 4),
        "fault_probability_percent": round(fault_prob * 100, 2),
        "health_score": round(max(0.0, 100.0 - fault_prob * 100.0), 1),
        "top_drivers": drivers,
        "features": {
            "Thermal_Stress_Index": round(thermal_stress, 2),
            "Voltage_Deviation_Ratio": round(volt_dev, 4),
            "Dynamic_Impedance": round(impedance, 2),
            "Mech_Thermal_Shock": round(mech_thermal, 2)
        }
    }

def predict_transformer(params: Dict[str, float]) -> Dict[str, Any]:
    """Runs Tier-2 Power Transformer DGA & Health Index Prediction with IEEE C57.104 ratios."""
    h2 = float(params.get("h2", 20.0))
    ch4 = float(params.get("ch4", 25.0))
    c2h6 = float(params.get("c2h6", 15.0))
    c2h4 = float(params.get("c2h4", 20.0))
    c2h2 = float(params.get("c2h2", 0.5))
    co = float(params.get("co", 250.0))
    co2 = float(params.get("co2", 2200.0))
    bdv = float(params.get("bdv", 65.0))
    moisture = float(params.get("moisture", 12.0))
    oil_t = float(params.get("oil_temp", 55.0))
    wind_t = float(params.get("winding_temp", 67.0))
    age = float(params.get("age", 5.0))

    # IEEE C57.104 & IEC 60599 calculations
    tcg = h2 + ch4 + c2h6 + c2h4 + c2h2 + co
    duval_denom = ch4 + c2h4 + c2h2 + 1e-5
    duval_ch4 = (ch4 / duval_denom) * 100.0
    duval_c2h4 = (c2h4 / duval_denom) * 100.0
    duval_c2h2 = (c2h2 / duval_denom) * 100.0

    r1 = ch4 / (h2 + 1e-4)
    r2 = c2h2 / (c2h4 + 1e-4)
    r3 = c2h4 / (c2h6 + 1e-4)
    delta_t = wind_t - oil_t
    dielectric_deg = moisture / (bdv + 0.1)
    co2_co = co2 / (co + 1e-4)

    raw_row = {
        "H2(ppm)": h2, "CH4(ppm)": ch4, "C2H6(ppm)": c2h6, "C2H4(ppm)": c2h4,
        "C2H2(ppm)": c2h2, "CO(ppm)": co, "CO2(ppm)": co2, "BDV(kV)": bdv,
        "Moisture(ppm)": moisture, "Oil_Temp(C)": oil_t, "Winding_Temp(C)": wind_t,
        "Age(Years)": age, "TCG(ppm)": tcg, "Duval_CH4_%": duval_ch4,
        "Duval_C2H4_%": duval_c2h4, "Duval_C2H2_%": duval_c2h2,
        "Rogers_R1_CH4_H2": r1, "Rogers_R2_C2H2_C2H4": r2, "Rogers_R3_C2H4_C2H6": r3,
        "Delta_Temp_Winding_Oil": delta_t, "Dielectric_Degradation_Index": dielectric_deg,
        "CO2_CO_Ratio": co2_co
    }

    model_art = get_transformer_model()
    if model_art is not None:
        cls_model = model_art["classifier"]
        reg_model = model_art["regressor"]
        cols = model_art["feature_names"]
        classes = model_art["classes"]
        df_in = pd.DataFrame([raw_row])
        for c in cols:
            if c not in df_in.columns:
                df_in[c] = 0.0
        df_in = df_in[cols]
        probs = cls_model.predict_proba(df_in)[0]
        pred_idx = int(np.argmax(probs))
        fault_class = classes[pred_idx]
        health_index = float(np.clip(reg_model.predict(df_in)[0], 0.0, 100.0))
        class_probs = {classes[i]: round(float(probs[i]), 4) for i in range(len(classes))}
    else:
        # Deterministic IEC standard fallback
        if c2h2 > 50.0:
            fault_class = "Electrical_Arcing"
        elif c2h4 > 200.0:
            fault_class = "Thermal_Fault_T3"
        elif ch4 > 100.0 or c2h6 > 80.0:
            fault_class = "Thermal_Fault_T1_T2"
        elif h2 > 150.0:
            fault_class = "Partial_Discharge"
        else:
            fault_class = "Nominal_Normal"

        penalty = (tcg / 35.0) + ((70.0 - min(70.0, bdv)) * 0.8) + (moisture * 0.7) + (age * 0.5)
        health_index = float(np.clip(100.0 - penalty, 5.0, 99.0))
        class_probs = {fault_class: 0.95, "Nominal_Normal": 0.05}

    # Driver attribution
    gas_drivers = []
    if c2h2 > 2.0:
        gas_drivers.append({"gas": "Acetylene (C2H2)", "concentration_ppm": c2h2, "normal_limit": 1.0, "status": "CRITICAL" if c2h2 > 20 else "WARNING", "indicator": "Arcing / Sparking Discharge"})
    if c2h4 > 50.0:
        gas_drivers.append({"gas": "Ethylene (C2H4)", "concentration_ppm": c2h4, "normal_limit": 30.0, "status": "CRITICAL" if c2h4 > 200 else "WARNING", "indicator": "High-Temp Hotspot (>700°C)"})
    if h2 > 100.0:
        gas_drivers.append({"gas": "Hydrogen (H2)", "concentration_ppm": h2, "normal_limit": 50.0, "status": "WARNING", "indicator": "Partial Discharge / Corona"})
    if bdv < 40.0:
        gas_drivers.append({"gas": "Breakdown Voltage (BDV)", "concentration_ppm": bdv, "normal_limit": 55.0, "status": "CRITICAL", "indicator": "Dielectric Insulation Collapse"})
    if not gas_drivers:
        gas_drivers.append({"gas": "Total Combustible Gas (TCG)", "concentration_ppm": round(tcg, 1), "normal_limit": 500.0, "status": "NORMAL", "indicator": "Nominal Insulation Condition"})

    return {
        "equipment": "Power Transformer (Siemens Sensformer 315 MVA)",
        "fault_class": fault_class,
        "health_index": round(health_index, 1),
        "health_status": "CRITICAL" if health_index < 55 else ("WARNING" if health_index < 80 else "HEALTHY"),
        "tcg_ppm": round(tcg, 1),
        "duval_coordinates": {
            "CH4_percent": round(duval_ch4, 1),
            "C2H4_percent": round(duval_c2h4, 1),
            "C2H2_percent": round(duval_c2h2, 1)
        },
        "rogers_ratios": {
            "R1_CH4_H2": round(r1, 3),
            "R2_C2H2_C2H4": round(r2, 3),
            "R3_C2H4_C2H6": round(r3, 3)
        },
        "class_probabilities": class_probs,
        "driving_gases": gas_drivers
    }

def evaluate_substation_system(terminal_inputs: Dict[str, float], transformer_inputs: Dict[str, float]) -> Dict[str, Any]:
    """Combines Tier-1 and Tier-2 into Substation Cascading Risk Assessment."""
    t_res = predict_terminal(terminal_inputs)
    tx_res = predict_transformer(transformer_inputs)

    p_breaker = t_res["fault_probability"]
    p_transformer = 1.0 - (tx_res["health_index"] / 100.0)

    # Cascading risk formula
    cascade_risk = 100.0 * (1.0 - (1.0 - p_transformer * 0.50) * (1.0 - p_breaker * 0.35))
    cascade_risk = round(float(np.clip(cascade_risk, 2.0, 99.5)), 1)

    if cascade_risk >= 65.0:
        overall_status = "CRITICAL"
        action = [
            "🚨 CRITICAL ALERT: Trip Bus Coupler CB-02 to isolate faulted equipment immediately.",
            "⚡ Load Transfer: Transfer Feeder F2 urban load to redundant Transformer T2 via Transfer Bus B.",
            "📉 Load Shedding: Shed 30 MW non-essential industrial load on Feeder F1 to avert grid-wide frequency collapse."
        ]
    elif cascade_risk >= 35.0:
        overall_status = "WARNING"
        action = [
            "⚠️ WARNING: Increase cooling radiator fan bank stage 2 on Transformer T1.",
            "🔍 Dispatch field technician to inspect SF6 circuit breaker terminal thermography.",
            "📊 Pre-arm bus tie switching relay for automated feeder transfer if temperature rises further."
        ]
    else:
        overall_status = "HEALTHY"
        action = [
            "✅ Nominal Operation: All smart grid terminal and transformer parameters within IEEE C57/IEC limits.",
            "📈 Continue automated 1-second SCADA streaming."
        ]

    topology = get_substation_topology()
    return {
        "substation_id": topology.get("substation_id", "SUB-SIEMENS-400KV-NORTH"),
        "substation_name": topology.get("name", "Siemens 400kV / 220kV Grid Substation Alpha"),
        "overall_status": overall_status,
        "substation_risk_score": cascade_risk,
        "terminal_evaluation": t_res,
        "transformer_evaluation": tx_res,
        "prescriptive_actions": action,
        "topology": topology
    }
