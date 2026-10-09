import streamlit as st
import requests
import json
import os
import sys
import numpy as np
import pandas as pd
import matplotlib.pyplot as plt
import matplotlib.patches as patches

# Ensure project root is in python path
ROOT_DIR = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
if ROOT_DIR not in sys.path:
    sys.path.insert(0, ROOT_DIR)

# Import fallback service for standalone execution
try:
    from src.services.substation_service import (
        predict_terminal,
        predict_transformer,
        evaluate_substation_system,
        get_substation_topology,
        PRESET_SCENARIOS,
        DEFAULT_TOPOLOGY
    )
    DIRECT_SERVICE_AVAILABLE = True
except Exception as e:
    DIRECT_SERVICE_AVAILABLE = False
    print(f"Direct service fallback unavailable: {e}")

# Page Configuration
st.set_page_config(
    page_title="Siemens Smart Grid Substation | Predictive Diagnostics",
    page_icon="⚡",
    layout="wide",
    initial_sidebar_state="expanded"
)

# Custom High-Tech SCADA Theme
st.markdown("""
<style>
    .reportview-container, .main {
        background-color: #0b1120;
        color: #f1f5f9;
    }
    .metric-card {
        background: linear-gradient(135deg, #1e293b 0%, #0f172a 100%);
        border: 1px solid #334155;
        border-radius: 10px;
        padding: 16px;
        margin-bottom: 12px;
        box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.3);
    }
    .stButton>button {
        background: linear-gradient(90deg, #0284c7 0%, #0369a1 100%);
        color: white;
        border-radius: 8px;
        font-weight: 600;
        border: none;
    }
    .status-healthy {
        color: #10b981;
        font-weight: bold;
    }
    .status-warning {
        color: #f59e0b;
        font-weight: bold;
    }
    .status-critical {
        color: #ef4444;
        font-weight: bold;
    }
</style>
""", unsafe_allow_html=True)

# API Configuration
API_BASE_URL = os.getenv("API_BASE_URL", "http://localhost:8000")

def check_backend_health():
    try:
        r = requests.get(f"{API_BASE_URL}/health", timeout=1.0)
        return r.status_code == 200
    except Exception:
        return False

BACKEND_LIVE = check_backend_health()

@st.cache_data
def load_testing_datasets():
    df_term = pd.read_csv("data/terminal_faults.csv") if os.path.exists("data/terminal_faults.csv") else None
    df_tx = pd.read_csv("data/transformer_failures.csv") if os.path.exists("data/transformer_failures.csv") else None
    return df_term, df_tx

df_term_data, df_tx_data = load_testing_datasets()

# ==========================================
# SIDEBAR NAVIGATION & PRESETS
# ==========================================
st.sidebar.image("https://upload.wikimedia.org/wikipedia/commons/3/36/Siemens_AG_logo.svg", width=180)
st.sidebar.title("⚡ Smart Substation AI")
st.sidebar.caption("Siemens IOT-01 — Predictive Failure Detection")

backend_badge = "🟢 FastAPI Live" if BACKEND_LIVE else "🟡 Local Core Active"
st.sidebar.markdown(f"**Backend Status:** `{backend_badge}`")

mode = st.sidebar.radio(
    "Select Diagnostic Mode:",
    [
        "🌐 Substation Digital Twin (Topology & Cascades)",
        "📡 Live Telemetry Stream & Random Dataset Replay (Testing Set)",
        "⚡ Circuit Breaker & Terminal Diagnostics (Dataset 1 - Manual Input)",
        "🧪 Power Transformer DGA & Health Index (Dataset 2 - Manual Input)"
    ]
)

st.sidebar.markdown("---")
st.sidebar.subheader("🎯 Quick Preset Scenarios")
preset_choice = st.sidebar.selectbox(
    "Load Real-World Scenario:",
    [
        "Custom Parameters",
        "Nominal Baseload (All Healthy)",
        "Transformer T1 Winding Hotspot (T3 > 700°C)",
        "High-Energy Bushing Arcing (D1/D2)",
        "Circuit Breaker CB-01 Contact Thermal Wear"
    ]
)

# Preset mapping
active_terminal_preset = None
active_tx_preset = None

if preset_choice == "Nominal Baseload (All Healthy)":
    active_terminal_preset = PRESET_SCENARIOS["nominal"]["terminal"]
    active_tx_preset = PRESET_SCENARIOS["nominal"]["transformer"]
elif preset_choice == "Transformer T1 Winding Hotspot (T3 > 700°C)":
    active_terminal_preset = PRESET_SCENARIOS["thermal_t3_hotspot"]["terminal"]
    active_tx_preset = PRESET_SCENARIOS["thermal_t3_hotspot"]["transformer"]
elif preset_choice == "High-Energy Bushing Arcing (D1/D2)":
    active_terminal_preset = PRESET_SCENARIOS["electrical_arcing"]["terminal"]
    active_tx_preset = PRESET_SCENARIOS["electrical_arcing"]["transformer"]
elif preset_choice == "Circuit Breaker CB-01 Contact Thermal Wear":
    active_terminal_preset = PRESET_SCENARIOS["breaker_contact_overheat"]["terminal"]
    active_tx_preset = PRESET_SCENARIOS["breaker_contact_overheat"]["transformer"]

# ==============================================================================
# VIEW 1: SUBSTATION DIGITAL TWIN & CASCADING RISK (Option 1 Master Layout)
# ==============================================================================
if mode == "🌐 Substation Digital Twin (Topology & Cascades)":
    st.title("🌐 Substation Digital Twin & Cascading Failure Engine")
    st.markdown("""
    **Predictive Multi-Tier Substation Single-Line Diagram (SLD)**  
    Real-time fusion of **Terminal High-Frequency Telemetry** and **Power Transformer DGA Degradation Models** assessing grid-level cascading outage risks.
    """)

    # Quick scenario injection buttons
    col_btn1, col_btn2, col_btn3 = st.columns(3)
    with col_btn1:
        if st.button("🟢 Run Nominal Baseload"):
            active_terminal_preset = PRESET_SCENARIOS["nominal"]["terminal"]
            active_tx_preset = PRESET_SCENARIOS["nominal"]["transformer"]
    with col_btn2:
        if st.button("🔴 Inject Transformer T1 Hotspot (T3)"):
            active_terminal_preset = PRESET_SCENARIOS["thermal_t3_hotspot"]["terminal"]
            active_tx_preset = PRESET_SCENARIOS["thermal_t3_hotspot"]["transformer"]
    with col_btn3:
        if st.button("⚡ Inject Bushing Arcing & Trip"):
            active_terminal_preset = PRESET_SCENARIOS["electrical_arcing"]["terminal"]
            active_tx_preset = PRESET_SCENARIOS["electrical_arcing"]["transformer"]

    # Current parameters
    t_input = active_terminal_preset or PRESET_SCENARIOS["nominal"]["terminal"]
    tx_input = active_tx_preset or PRESET_SCENARIOS["nominal"]["transformer"]

    # Call Backend or Fallback
    eval_result = None
    if BACKEND_LIVE:
        try:
            resp = requests.post(f"{API_BASE_URL}/api/v1/substation/evaluate-system", json={"terminal": t_input, "transformer": tx_input}, timeout=2.0)
            if resp.status_code == 200:
                eval_result = resp.json()["data"]
        except Exception as e:
            st.warning(f"Backend call failed, using local engine: {e}")

    if eval_result is None and DIRECT_SERVICE_AVAILABLE:
        eval_result = evaluate_substation_system(t_input, tx_input)

    if eval_result:
        risk_score = eval_result["substation_risk_score"]
        status_label = eval_result["overall_status"]
        t_res = eval_result["terminal_evaluation"]
        tx_res = eval_result["transformer_evaluation"]

        # Top Metric Row
        m_col1, m_col2, m_col3, m_col4 = st.columns(4)
        with m_col1:
            st.metric("Substation Risk Index", f"{risk_score}%", delta=f"{risk_score - 20:.1f}% vs. Base", delta_color="inverse")
        with m_col2:
            badge_color = "#ef4444" if status_label == "CRITICAL" else ("#f59e0b" if status_label == "WARNING" else "#10b981")
            st.markdown(f"**Operational Status:**<br><span style='font-size:24px; color:{badge_color}; font-weight:bold;'>{status_label}</span>", unsafe_allow_html=True)
        with m_col3:
            st.metric("Transformer T1 Health", f"{tx_res['health_index']}%", tx_res['fault_class'])
        with m_col4:
            st.metric("Breaker Trip Probability", f"{t_res['fault_probability_percent']}%", t_res['fault_status_label'])

        st.markdown("---")

        # Visual Mock Substation Layout Diagram (SLD)
        st.subheader("🗺️ Substation Mock Layout (Single-Line Diagram)")
        fig, ax = plt.subplots(figsize=(14, 6))
        ax.set_facecolor('#0b1329')
        fig.patch.set_facecolor('#0b1329')

        topology = eval_result["topology"]
        nodes = topology["nodes"]
        edges = topology["edges"]

        # Draw busbar & cable lines
        for u, v in edges:
            x1, y1 = nodes[u]["x"], nodes[u]["y"]
            x2, y2 = nodes[v]["x"], nodes[v]["y"]
            ax.plot([x1, x2], [y1, y2], color='#334155', lw=3.5, zorder=1)

        # Draw Assets
        for asset_id, info in nodes.items():
            x, y = info["x"], info["y"]
            if "TRANSFORMER_T1" in asset_id:
                color = "#ef4444" if tx_res["health_index"] < 55 else ("#f59e0b" if tx_res["health_index"] < 80 else "#10b981")
                subtext = f"HI: {tx_res['health_index']}%"
            elif "CB_01" in asset_id:
                color = "#ef4444" if t_res["fault_probability"] > 0.50 else ("#f59e0b" if t_res["fault_probability"] > 0.30 else "#10b981")
                subtext = f"Risk: {t_res['fault_probability_percent']}%"
            else:
                color = "#10b981"
                subtext = "Nominal"

            rect = patches.FancyBboxPatch(
                (x - 0.065, y - 0.07), 0.13, 0.14,
                boxstyle="round,pad=0.015",
                facecolor='#1e293b', edgecolor=color, linewidth=2.8, zorder=2
            )
            ax.add_patch(rect)
            ax.text(x, y + 0.02, asset_id.replace("_", " "), color='white', weight='bold', ha='center', va='center', fontsize=8.5, zorder=3)
            ax.text(x, y - 0.03, subtext, color=color, weight='bold', ha='center', va='center', fontsize=8, zorder=3)
            ax.scatter([x + 0.05], [y + 0.05], color=color, s=50, zorder=4)

        ax.set_xlim(0.02, 1.05)
        ax.set_ylim(0.12, 0.95)
        ax.axis('off')
        plt.tight_layout()
        st.pyplot(fig)

        col_act, col_attr = st.columns([1, 1])
        with col_act:
            st.subheader("📋 Autonomous Grid Dispatch Prescriptions")
            for action_item in eval_result["prescriptive_actions"]:
                st.info(action_item)

        with col_attr:
            st.subheader("🔍 Top Driving Sensor & Gas Triggers")
            st.markdown("**Transformer Diagnostic Drivers:**")
            for d in tx_res["driving_gases"]:
                st.write(f"- **{d['gas']}**: `{d['concentration_ppm']} ppm` → {d['indicator']} ({d['status']})")
            st.markdown("**Switchgear Terminal Drivers:**")
            for d in t_res["top_drivers"]:
                st.write(f"- **{d['sensor']}**: `{d['value']}` → Impact `{d['impact']:+}` ({d['status']})")

# ==============================================================================
# VIEW 2: LIVE TELEMETRY STREAM & RANDOM DATASET REPLAY (NEW SECTION!)
# ==============================================================================
elif mode == "📡 Live Telemetry Stream & Random Dataset Replay (Testing Set)":
    st.title("📡 Live Telemetry Stream & Testing Dataset Replay")
    st.markdown("""
    **Testing Set Verification & Real-Time Anomaly Stream**  
    Draws random operational telemetry points directly from the **1,500 Terminal Fault records** and **1,200 Power Transformer records**, dynamically computing health metrics, parameter deviations, and driving sensor attributions.
    """)

    eq_type = st.radio(
        "Select Equipment Telemetry Stream:",
        [
            "⚡ High-Voltage Circuit Breaker / Terminal (Dataset 1: 1,500 samples)",
            "🧪 Power Transformer DGA & Oil Tank (Dataset 2: 1,200 samples)"
        ],
        horizontal=True
    )

    # Filtering options
    col_f1, col_f2, col_f3 = st.columns([1.5, 1.5, 2])
    with col_f1:
        filter_mode = st.selectbox(
            "Filter Test Samples By:",
            ["🎲 Any Random Record", "🟢 Nominal / Healthy Records Only", "🔴 Critical Fault / Trip Records Only"]
        )

    # Manage random sample index in session_state
    if "telemetry_sample_idx_term" not in st.session_state:
        st.session_state.telemetry_sample_idx_term = 0
    if "telemetry_sample_idx_tx" not in st.session_state:
        st.session_state.telemetry_sample_idx_tx = 0

    with col_f2:
        if st.button("🎲 Draw Random Telemetry Sample", use_container_width=True):
            if "Circuit Breaker" in eq_type and df_term_data is not None:
                if "Nominal" in filter_mode:
                    sub_df = df_term_data[df_term_data["Fault_Status"] == 0]
                elif "Critical" in filter_mode:
                    sub_df = df_term_data[df_term_data["Fault_Status"] == 1]
                else:
                    sub_df = df_term_data
                st.session_state.telemetry_sample_idx_term = int(sub_df.sample(1).index[0])
            elif "Power Transformer" in eq_type and df_tx_data is not None:
                if "Nominal" in filter_mode:
                    sub_df = df_tx_data[df_tx_data["Fault_Class"] == "Nominal_Normal"]
                elif "Critical" in filter_mode:
                    sub_df = df_tx_data[df_tx_data["Fault_Class"] != "Nominal_Normal"]
                else:
                    sub_df = df_tx_data
                st.session_state.telemetry_sample_idx_tx = int(sub_df.sample(1).index[0])

    # -------------------------------------------------------------
    # SUBSECTION A: CIRCUIT BREAKER / TERMINAL TELEMETRY
    # -------------------------------------------------------------
    if "Circuit Breaker" in eq_type:
        if df_term_data is not None:
            max_idx = len(df_term_data) - 1
            curr_idx = min(st.session_state.telemetry_sample_idx_term, max_idx)
            
            with col_f3:
                curr_idx = st.slider("Or Select Specific Row Index:", 0, max_idx, curr_idx)
                st.session_state.telemetry_sample_idx_term = curr_idx

            row = df_term_data.iloc[curr_idx]
            actual_fault = int(row["Fault_Status"])
            actual_label = "CRITICAL FAULT (Trip) 🔴" if actual_fault == 1 else "NOMINAL (Healthy) 🟢"

            # Prepare payload
            payload = {
                "voltage": float(row["Voltage(V)"]),
                "current": float(row["Current(A)"]),
                "temperature": float(row["Temperature(C)"]),
                "frequency": float(row["Frequency(Hz)"]),
                "power_factor": float(row["Power_Factor"]),
                "vibration_level": float(row["Vibration_Level"]),
                "device_age": float(row["Device_Age(Years)"]),
                "load_variation": float(row["Load_Variation(%)"])
            }

            # Inference
            res = None
            if BACKEND_LIVE:
                try:
                    r = requests.post(f"{API_BASE_URL}/api/v1/substation/predict-terminal", json=payload, timeout=2.0)
                    if r.status_code == 200:
                        res = r.json()["data"]
                except Exception:
                    pass
            if res is None and DIRECT_SERVICE_AVAILABLE:
                res = predict_terminal(payload)

            if res:
                pred_fault = res["fault_status"]
                pred_prob = res["fault_probability_percent"]
                pred_label = res["fault_status_label"]
                match = (actual_fault == pred_fault)

                st.markdown("---")
                # Ground Truth vs Prediction Comparison Card
                c_card1, c_card2, c_card3, c_card4 = st.columns(4)
                with c_card1:
                    st.metric("Sample Record ID", f"Row #{curr_idx}")
                with c_card2:
                    st.markdown(f"**Ground Truth in Dataset:**<br><span style='font-size:18px; font-weight:bold;'>{actual_label}</span>", unsafe_allow_html=True)
                with c_card3:
                    st.metric("AI Predicted Fault Risk", f"{pred_prob}%", pred_label)
                with c_card4:
                    match_badge = "✅ MATCH (100% Agreement)" if match else "⚠️ Boundary Deviation"
                    st.markdown(f"**Verification Status:**<br><span style='font-size:18px; color:#10b981; font-weight:bold;'>{match_badge}</span>", unsafe_allow_html=True)

                st.markdown("---")

                # GRAPHS SECTION
                st.subheader("📈 Telemetry Visualizations & Severity Analysis")
                g_col1, g_col2 = st.columns([1, 1])

                with g_col1:
                    st.markdown("##### 1. Normalized Sensor Anomaly Deviation from Baseline (Z-Score)")
                    # Compute deviation for all electrical and operational features
                    # Dynamically calculate baseline statistics directly from dataset if available
                    if df_term_data is not None:
                        healthy_subset = df_term_data[df_term_data['Fault_Status'] == 0]
                        baseline_means = healthy_subset.mean().to_dict()
                        baseline_stds = healthy_subset.std().replace(0, 1.0).to_dict()
                    else:
                        baseline_means = {
                            "Voltage(V)": 230.19, "Current(A)": 5.10, "Temperature(C)": 45.0,
                            "Frequency(Hz)": 50.0, "Power_Factor": 0.95, "Vibration_Level": 1.95,
                            "Load_Variation(%)": 14.8, "Anomaly_Score": 75.0
                        }
                        baseline_stds = {
                            "Voltage(V)": 9.8, "Current(A)": 1.5, "Temperature(C)": 7.8,
                            "Frequency(Hz)": 0.3, "Power_Factor": 0.03, "Vibration_Level": 0.5,
                            "Load_Variation(%)": 5.0, "Anomaly_Score": 34.0
                        }
                    
                    dev_labels = []
                    dev_scores = []
                    dev_colors = []
                    for k in ["Voltage(V)", "Current(A)", "Temperature(C)", "Frequency(Hz)", "Power_Factor", "Vibration_Level", "Load_Variation(%)", "Anomaly_Score"]:
                        val = float(row[k])
                        m = baseline_means.get(k, 1.0)
                        s = baseline_stds.get(k, 1.0) if baseline_stds.get(k, 1.0) > 1e-4 else 1.0
                        z = abs(val - m) / s
                        dev_labels.append(k.split("(")[0])
                        dev_scores.append(round(z, 2))
                        if z > 2.5:
                            dev_colors.append('#ef4444') # Critical
                        elif z > 1.5:
                            dev_colors.append('#f59e0b') # Warning
                        else:
                            dev_colors.append('#10b981') # Normal

                    fig_dev, ax_dev = plt.subplots(figsize=(6, 4.0))
                    ax_dev.set_facecolor('#0f172a')
                    fig_dev.patch.set_facecolor('#0f172a')
                    ax_dev.barh(dev_labels, dev_scores, color=dev_colors)
                    ax_dev.axvline(2.5, color='#ef4444', linestyle='--', label='Critical Limit (2.5σ)')
                    ax_dev.axvline(1.5, color='#f59e0b', linestyle=':', label='Warning Limit (1.5σ)')
                    ax_dev.set_xlabel("Deviation Severity (σ from nominal)", color='white')
                    ax_dev.tick_params(colors='white')
                    ax_dev.legend(facecolor='#1e293b', edgecolor='none', labelcolor='white', fontsize=8)
                    st.pyplot(fig_dev)

                with g_col2:
                    st.markdown("##### 2. Simulated 10-Second Telemetry Trajectory Leading to Sample")
                    # Synthesize smooth trend culminating in current sample
                    t_steps = np.arange(-9, 1)
                    t_val = float(row["Temperature(C)"])
                    
                    t_traj = np.linspace(max(20, t_val - 15), t_val, 10) + np.random.normal(0, 0.5, 10)
                    t_traj[-1] = t_val
                    
                    fig_traj, ax_traj = plt.subplots(figsize=(6, 4.0))
                    ax_traj.set_facecolor('#0f172a')
                    fig_traj.patch.set_facecolor('#0f172a')
                    ax_traj.plot(t_steps, t_traj, color='#38bdf8', marker='o', lw=2, label='Temperature (°C)')
                    ax_traj.axhline(60.0, color='#f59e0b', linestyle=':', label='IEC Warning Limit (60°C)')
                    ax_traj.axhline(75.0, color='#ef4444', linestyle='--', label='Max Thermal Trip Limit (75°C)')
                    ax_traj.set_xlabel("Time (seconds relative to sample)", color='white')
                    ax_traj.set_ylabel("Temperature (°C)", color='white')
                    ax_traj.tick_params(colors='white')
                    ax_traj.legend(facecolor='#1e293b', edgecolor='none', labelcolor='white', fontsize=8)
                    st.pyplot(fig_traj)

                # Detailed Parameter-by-Parameter Table using Official IEC & IEEE Standards
                st.subheader("📋 Parameter Health Inspection (IEC & IEEE Standard Compliance)")
                ieee_iec_standards = {
                    "Voltage(V)": {
                        "standard": "IEC 60038 / EN 50160",
                        "nominal": "230.0 V (±10% allowable: 207 - 253 V)",
                        "eval": lambda v: "ANOMALOUS 🔴" if abs(v - 230) > 23 else ("DEVIATION 🟡" if abs(v - 230) > 11.5 else "NORMAL 🟢")
                    },
                    "Current(A)": {
                        "standard": "IEC 60947-1 / IEEE C37.04",
                        "nominal": "1.0 - 8.0 A (Rated Continuous In)",
                        "eval": lambda v: "OVERLOAD 🔴" if v > 8.0 else ("HIGH LOAD 🟡" if v > 6.5 else "NORMAL 🟢")
                    },
                    "Temperature(C)": {
                        "standard": "IEC 62271-1 (Sec 6.5)",
                        "nominal": "20.0 - 55.0 °C (Max Contact Limit 60°C)",
                        "eval": lambda v: "CRITICAL 🔴" if v > 60.0 else ("WARNING 🟡" if v > 50.0 else "NORMAL 🟢")
                    },
                    "Frequency(Hz)": {
                        "standard": "EN 50160 / IEC 60034-1",
                        "nominal": "50.00 Hz (49.50 - 50.50 Hz)",
                        "eval": lambda v: "GRID COLLAPSE 🔴" if abs(v - 50.0) > 0.5 else ("FREQ DRIFT 🟡" if abs(v - 50.0) > 0.3 else "NORMAL 🟢")
                    },
                    "Power_Factor": {
                        "standard": "IEEE 1459 / IEEE 519",
                        "nominal": "0.90 - 1.00 (Utility Target > 0.90)",
                        "eval": lambda v: "CRITICAL LOSS 🔴" if v < 0.88 else ("LOW EFFICIENCY 🟡" if v < 0.92 else "NORMAL 🟢")
                    },
                    "Vibration_Level": {
                        "standard": "ISO 10816-3 / ISO 20816",
                        "nominal": "< 3.00 mm/s (Normal Operating Zone A/B)",
                        "eval": lambda v: "CRITICAL 🔴" if v >= 3.50 else ("WARNING 🟡" if v > 3.00 else "NORMAL 🟢")
                    },
                    "Load_Variation(%)": {
                        "standard": "IEC 61000-4-30",
                        "nominal": "≤ 20.0% Rapid Fluctuation Limit",
                        "eval": lambda v: "HIGH SURGE 🔴" if v > 25.0 else ("WARNING 🟡" if v > 20.0 else "NORMAL 🟢")
                    },
                    "Anomaly_Score": {
                        "standard": "IEEE 1415 Substation Health",
                        "nominal": "< 110.0 Baseline Latent Risk Score",
                        "eval": lambda v: "CRITICAL RISK 🔴" if v > 135.0 else ("ELEVATED RISK 🟡" if v > 110.0 else "NORMAL 🟢")
                    }
                }

                p_rows = []
                for col_name in ["Voltage(V)", "Current(A)", "Temperature(C)", "Frequency(Hz)", "Power_Factor", "Vibration_Level", "Load_Variation(%)", "Anomaly_Score"]:
                    val = float(row[col_name])
                    std_info = ieee_iec_standards.get(col_name)
                    if std_info:
                        std_name = std_info["standard"]
                        nominal_str = std_info["nominal"]
                        status_str = std_info["eval"](val)
                    else:
                        std_name = "IEC Standard"
                        nominal_str = "Nominal Operation"
                        status_str = "NORMAL 🟢"
                    
                    p_rows.append({
                        "Telemetry Signal": col_name,
                        "Sampled Value": val,
                        "Governing Standard": std_name,
                        "Standard Nominal Range": nominal_str,
                        "Compliance Status": status_str
                    })
                st.dataframe(pd.DataFrame(p_rows), use_container_width=True)

    # -------------------------------------------------------------
    # SUBSECTION B: POWER TRANSFORMER DGA TELEMETRY
    # -------------------------------------------------------------
    else:
        if df_tx_data is not None:
            max_idx = len(df_tx_data) - 1
            curr_idx = min(st.session_state.telemetry_sample_idx_tx, max_idx)

            with col_f3:
                curr_idx = st.slider("Or Select Specific Row Index:", 0, max_idx, curr_idx)
                st.session_state.telemetry_sample_idx_tx = curr_idx

            row = df_tx_data.iloc[curr_idx]
            actual_class = str(row["Fault_Class"])
            actual_hi = float(row["Health_Index"])

            payload = {
                "h2": float(row["H2(ppm)"]),
                "ch4": float(row["CH4(ppm)"]),
                "c2h6": float(row["C2H6(ppm)"]),
                "c2h4": float(row["C2H4(ppm)"]),
                "c2h2": float(row["C2H2(ppm)"]),
                "co": float(row["CO(ppm)"]),
                "co2": float(row["CO2(ppm)"]),
                "bdv": float(row["BDV(kV)"]),
                "moisture": float(row["Moisture(ppm)"]),
                "oil_temp": float(row["Oil_Temp(C)"]),
                "winding_temp": float(row["Winding_Temp(C)"]),
                "age": float(row["Age(Years)"])
            }

            res = None
            if BACKEND_LIVE:
                try:
                    r = requests.post(f"{API_BASE_URL}/api/v1/substation/predict-transformer", json=payload, timeout=2.0)
                    if r.status_code == 200:
                        res = r.json()["data"]
                except Exception:
                    pass
            if res is None and DIRECT_SERVICE_AVAILABLE:
                res = predict_transformer(payload)

            if res:
                pred_class = res["fault_class"]
                pred_hi = res["health_index"]
                match = (actual_class == pred_class)

                st.markdown("---")
                c1, c2, c3, c4 = st.columns(4)
                with c1:
                    st.metric("Sample Record ID", f"Transformer #{curr_idx}")
                with c2:
                    st.markdown(f"**Ground Truth Fault:**<br><span style='font-size:18px; font-weight:bold;'>{actual_class}</span>", unsafe_allow_html=True)
                with c3:
                    st.metric("AI Predicted Mode", pred_class.replace("_", " "), f"Health: {pred_hi}%")
                with c4:
                    match_badge = "✅ MATCH (100% Agreement)" if match else "⚠️ Class Difference"
                    st.markdown(f"**Verification Status:**<br><span style='font-size:18px; color:#10b981; font-weight:bold;'>{match_badge}</span>", unsafe_allow_html=True)

                st.markdown("---")

                # GRAPHS SECTION
                st.subheader("📈 Dissolved Gas Concentrations & Duval Triangle Coordinates")
                tx_g1, tx_g2 = st.columns([1, 1])

                with tx_g1:
                    st.markdown("##### 1. Dissolved Combustible Gas Concentrations (PPM)")
                    gases = ["H2", "CH4", "C2H6", "C2H4", "C2H2"]
                    ppm_vals = [float(row[f"{g}(ppm)"]) for g in gases]
                    limits = [50.0, 40.0, 30.0, 30.0, 1.0]

                    fig_gas, ax_gas = plt.subplots(figsize=(6, 3.2))
                    ax_gas.set_facecolor('#0f172a')
                    fig_gas.patch.set_facecolor('#0f172a')
                    
                    colors = ['#ef4444' if ppm_vals[i] > limits[i] * 2 else ('#f59e0b' if ppm_vals[i] > limits[i] else '#10b981') for i in range(len(gases))]
                    ax_gas.bar(gases, ppm_vals, color=colors)
                    ax_gas.set_ylabel("Concentration (ppm)", color='white')
                    ax_gas.tick_params(colors='white')
                    st.pyplot(fig_gas)

                with tx_g2:
                    st.markdown("##### 2. Duval Triangle Fault Coordinates (% of CH₄ + C₂H₄ + C₂H₂)")
                    duval = res["duval_coordinates"]
                    fig_duval, ax_duval = plt.subplots(figsize=(6, 3.2))
                    ax_duval.set_facecolor('#0f172a')
                    fig_duval.patch.set_facecolor('#0f172a')
                    ax_duval.barh(["% CH₄", "% C₂H₄", "% C₂H₂"], [duval["CH4_percent"], duval["C2H4_percent"], duval["C2H2_percent"]], color=['#38bdf8', '#f59e0b', '#ef4444'])
                    ax_duval.set_xlim(0, 100)
                    ax_duval.set_xlabel("Duval Coordinate (%)", color='white')
                    ax_duval.tick_params(colors='white')
                    st.pyplot(fig_duval)

                # Parameter Table
                st.subheader("📋 Transformer Oil & Insulation Parameter Inspection")
                tx_table = []
                for p_key, p_label, ref_val in [
                    ("H2(ppm)", "Hydrogen (H2)", "< 50 ppm"),
                    ("CH4(ppm)", "Methane (CH4)", "< 40 ppm"),
                    ("C2H6(ppm)", "Ethane (C2H6)", "< 30 ppm"),
                    ("C2H4(ppm)", "Ethylene (C2H4)", "< 30 ppm"),
                    ("C2H2(ppm)", "Acetylene (C2H2)", "< 1 ppm (Critical Arcing)"),
                    ("BDV(kV)", "Breakdown Voltage", "> 55 kV"),
                    ("Moisture(ppm)", "Moisture Content", "< 20 ppm"),
                    ("Winding_Temp(C)", "Winding Hotspot", "< 95 °C")
                ]:
                    v = float(row[p_key])
                    if "C2H2" in p_key:
                        stat = "CRITICAL 🔴" if v > 2.0 else "NORMAL 🟢"
                    elif "C2H4" in p_key:
                        stat = "CRITICAL 🔴" if v > 150.0 else ("WARNING 🟡" if v > 50.0 else "NORMAL 🟢")
                    elif "BDV" in p_key:
                        stat = "CRITICAL 🔴" if v < 35.0 else ("WARNING 🟡" if v < 50.0 else "NORMAL 🟢")
                    else:
                        stat = "NORMAL 🟢"
                    
                    tx_table.append({
                        "Diagnostic Parameter": p_label,
                        "Sampled Value": v,
                        "IEEE C57 Standard Limit": ref_val,
                        "Condition Status": stat
                    })
                st.dataframe(pd.DataFrame(tx_table), use_container_width=True)

# ==============================================================================
# VIEW 3: CIRCUIT BREAKER & TERMINAL DIAGNOSTICS (Dataset 1 - Manual Input)
# ==============================================================================
elif mode == "⚡ Circuit Breaker & Terminal Diagnostics (Dataset 1 - Manual Input)":
    st.title("⚡ Circuit Breaker & Switchgear Terminal Diagnostic Inspector")
    st.markdown("""
    **Dataset Reference:** `zara2099/smart-grid-terminal-fault-dataset`  
    High-frequency electrical telemetry, mechanical shock, and thermal overload monitoring for **Siemens 3AP1 Circuit Breakers** and **8DN8 GIS bays**.
    """)

    default_t = active_terminal_preset or PRESET_SCENARIOS["nominal"]["terminal"]

    st.subheader("⚙️ Input Parameters (User Adjustable)")
    c1, c2, c3, c4 = st.columns(4)
    with c1:
        v_in = st.slider("Voltage (V)", 170.0, 270.0, float(default_t["voltage"]), 0.5, help="Nominal: 230V")
        pf_in = st.slider("Power Factor", 0.60, 1.00, float(default_t["power_factor"]), 0.01)
    with c2:
        i_in = st.slider("Current (A)", 5.0, 90.0, float(default_t["current"]), 0.5)
        freq_in = st.slider("Frequency (Hz)", 48.0, 52.0, float(default_t["frequency"]), 0.05, help="Nominal: 50.0Hz")
    with c3:
        temp_in = st.slider("Terminal Temp (°C)", 20.0, 110.0, float(default_t["temperature"]), 0.5, help="Critical above 75°C")
        load_var_in = st.slider("Load Variation (%)", 2.0, 50.0, float(default_t["load_variation"]), 0.5)
    with c4:
        vib_in = st.slider("Vibration (mm/s)", 0.1, 12.0, float(default_t["vibration_level"]), 0.1, help="Mechanical shock proxy")
        age_in = st.slider("Device Age (Years)", 1.0, 20.0, float(default_t["device_age"]), 0.5)

    term_payload = {
        "voltage": v_in, "current": i_in, "temperature": temp_in, "frequency": freq_in,
        "power_factor": pf_in, "vibration_level": vib_in, "device_age": age_in,
        "load_variation": load_var_in
    }

    # Run Prediction
    t_output = None
    if BACKEND_LIVE:
        try:
            res = requests.post(f"{API_BASE_URL}/api/v1/substation/predict-terminal", json=term_payload, timeout=2.0)
            if res.status_code == 200:
                t_output = res.json()["data"]
        except Exception:
            pass
    if t_output is None and DIRECT_SERVICE_AVAILABLE:
        t_output = predict_terminal(term_payload)

    if t_output:
        st.markdown("---")
        st.subheader("📊 Diagnostic Outputs & Explainability")
        o1, o2, o3 = st.columns(3)
        with o1:
            st.metric("Fault / Trip Probability", f"{t_output['fault_probability_percent']}%", t_output['fault_status_label'])
        with o2:
            st.metric("Terminal Health Score", f"{t_output['health_score']}/100")
        with o3:
            st.metric("I²R Thermal Stress Index", f"{t_output['features']['Thermal_Stress_Index']}")

        # SHAP Feature Attribution Chart
        st.subheader("🎯 Feature Attribution Waterfall (TreeSHAP Driving Signals)")
        drivers = t_output["top_drivers"]
        df_d = pd.DataFrame(drivers)
        fig_shap, ax_shap = plt.subplots(figsize=(10, 3.5))
        ax_shap.set_facecolor('#0f172a')
        fig_shap.patch.set_facecolor('#0f172a')

        colors = ['#ef4444' if x > 0 else '#10b981' for x in df_d['impact']]
        ax_shap.barh(df_d['sensor'], df_d['impact'], color=colors)
        ax_shap.set_xlabel("SHAP Contribution to Fault Risk", color='white')
        ax_shap.tick_params(colors='white')
        st.pyplot(fig_shap)

        # Input Parameter Health Analysis Table
        st.subheader("📋 Parameter-by-Parameter Inspection")
        param_table = [
            {"Parameter": "Terminal Voltage", "Value": f"{v_in} V", "Normal Range": "220 - 240 V", "Status": "Normal" if 215 <= v_in <= 245 else "Anomalous"},
            {"Parameter": "Terminal Current", "Value": f"{i_in} A", "Normal Range": "10 - 50 A", "Status": "High" if i_in > 55 else "Normal"},
            {"Parameter": "Terminal Temperature", "Value": f"{temp_in} °C", "Normal Range": "30 - 65 °C", "Status": "Critical" if temp_in > 75 else ("Warning" if temp_in > 60 else "Normal")},
            {"Parameter": "Mechanical Vibration", "Value": f"{vib_in} mm/s", "Normal Range": "< 3.0 mm/s", "Status": "Critical" if vib_in > 6.0 else ("Warning" if vib_in > 3.0 else "Normal")},
            {"Parameter": "Grid Frequency", "Value": f"{freq_in} Hz", "Normal Range": "49.8 - 50.2 Hz", "Status": "Normal" if 49.7 <= freq_in <= 50.3 else "Deviation"}
        ]
        st.table(pd.DataFrame(param_table))

# ==============================================================================
# VIEW 4: POWER TRANSFORMER DGA & HEALTH INDEX (Dataset 2 - Manual Input)
# ==============================================================================
elif mode == "🧪 Power Transformer DGA & Health Index (Dataset 2 - Manual Input)":
    st.title("🧪 Power Transformer Dissolved Gas Analysis (DGA) & Health Index")
    st.markdown("""
    **Dataset Reference:** `shashwatwork/failure-analysis-in-power-transformers-dataset`  
    Chemical and insulation diagnostics compliant with **IEEE C57.104** and **IEC 60599** standards for **Siemens Sensformer 315 MVA transformers**.
    """)

    default_tx = active_tx_preset or PRESET_SCENARIOS["nominal"]["transformer"]

    st.subheader("⚙️ Dissolved Gas Concentrations & Oil Parameters")
    g1, g2, g3 = st.columns(3)
    with g1:
        h2_in = st.slider("Hydrogen H₂ (ppm)", 0.0, 800.0, float(default_tx["h2"]), 1.0, help="Normal < 50 ppm")
        ch4_in = st.slider("Methane CH₄ (ppm)", 0.0, 500.0, float(default_tx["ch4"]), 1.0, help="Normal < 40 ppm")
        c2h6_in = st.slider("Ethane C₂H₆ (ppm)", 0.0, 350.0, float(default_tx["c2h6"]), 1.0, help="Normal < 30 ppm")
    with g2:
        c2h4_in = st.slider("Ethylene C₂H₄ (ppm)", 0.0, 1200.0, float(default_tx["c2h4"]), 1.0, help="High-temp hotspot (>700°C) indicator")
        c2h2_in = st.slider("Acetylene C₂H₂ (ppm)", 0.0, 450.0, float(default_tx["c2h2"]), 0.5, help="Key arcing indicator (Normal < 1 ppm)")
        bdv_in = st.slider("Breakdown Voltage BDV (kV)", 10.0, 80.0, float(default_tx["bdv"]), 0.5, help="Dielectric strength (Normal > 55 kV)")
    with g3:
        moisture_in = st.slider("Moisture in Oil (ppm)", 5.0, 45.0, float(default_tx["moisture"]), 0.5, help="Normal < 20 ppm")
        oil_t_in = st.slider("Top Oil Temp (°C)", 30.0, 110.0, float(default_tx["oil_temp"]), 0.5)
        wind_t_in = st.slider("Winding Temp (°C)", 40.0, 135.0, float(default_tx["winding_temp"]), 0.5)

    tx_payload = {
        "h2": h2_in, "ch4": ch4_in, "c2h6": c2h6_in, "c2h4": c2h4_in, "c2h2": c2h2_in,
        "co": 250.0, "co2": 2200.0, "bdv": bdv_in, "moisture": moisture_in,
        "oil_temp": oil_t_in, "winding_temp": wind_t_in, "age": 7.0
    }

    tx_output = None
    if BACKEND_LIVE:
        try:
            res = requests.post(f"{API_BASE_URL}/api/v1/substation/predict-transformer", json=tx_payload, timeout=2.0)
            if res.status_code == 200:
                tx_output = res.json()["data"]
        except Exception:
            pass
    if tx_output is None and DIRECT_SERVICE_AVAILABLE:
        tx_output = predict_transformer(tx_payload)

    if tx_output:
        st.markdown("---")
        st.subheader("📊 Diagnostic Outputs")
        to1, to2, to3 = st.columns(3)
        with to1:
            st.metric("Predicted Failure Mode", tx_output["fault_class"].replace("_", " "))
        with to2:
            st.metric("Asset Health Index (0-100)", f"{tx_output['health_index']}%", tx_output['health_status'])
        with to3:
            st.metric("Total Combustible Gas (TCG)", f"{tx_output['tcg_ppm']} ppm", "IEEE Limit: 500 ppm", delta_color="inverse")

        # Duval Triangle Gas Percentages Plot
        st.subheader("📐 Duval Triangle Gas Proportions (% of CH₄ + C₂H₄ + C₂H₂)")
        duval = tx_output["duval_coordinates"]
        fig_d, ax_d = plt.subplots(figsize=(9, 2.5))
        ax_d.set_facecolor('#0f172a')
        fig_d.patch.set_facecolor('#0f172a')
        ax_d.barh(["% CH₄", "% C₂H₄", "% C₂H₂"], [duval["CH4_percent"], duval["C2H4_percent"], duval["C2H2_percent"]], color=['#38bdf8', '#f59e0b', '#ef4444'])
        ax_d.set_xlim(0, 100)
        ax_d.set_xlabel("Duval Coordinate Percentage (%)", color='white')
        ax_d.tick_params(colors='white')
        st.pyplot(fig_d)

        # Driving Gas Attribution
        st.subheader("🧪 Chemical Driving Indicators")
        for g_info in tx_output["driving_gases"]:
            st.warning(f"**{g_info['gas']}**: {g_info['concentration_ppm']} ppm (Reference limit: {g_info['normal_limit']} ppm) — *{g_info['indicator']}*")

st.markdown("---")
st.caption("Siemens Smart Grid Substation Predictive Maintenance System | Antigravity AI Engine")
