# ⚡ Siemens Smart Grid Substation - Streamlit Command Center

### High-Voltage Predictive Diagnostics & Digital Twin Dashboard

This Streamlit application interfaces directly with the **FastAPI backend** (`src/api.py`) and our pre-trained **Dual-Tier Machine Learning Models** (`models/terminal_fault_model.joblib` & `models/transformer_health_model.joblib`).

---

## 🚀 How to Run

### Step 1: Start the FastAPI Backend
In your terminal, launch the FastAPI server:
```bash
uvicorn src.api:app --host 0.0.0.0 --port 8000 --reload
```
The Substation API endpoints will be accessible at:
* Swagger Documentation: `http://localhost:8000/docs`
* Substation Topology: `GET http://localhost:8000/api/v1/substation/topology`
* Terminal Prediction: `POST http://localhost:8000/api/v1/substation/predict-terminal`
* Transformer DGA: `POST http://localhost:8000/api/v1/substation/predict-transformer`
* System Evaluation: `POST http://localhost:8000/api/v1/substation/evaluate-system`

---

### Step 2: Start the Streamlit Dashboard
In a separate terminal tab:
```bash
streamlit run streamlit_app/app.py --server.port 8501
```
Open your browser to:
👉 **`http://localhost:8501`**

---

## 🎯 Showcase Features for Judges

1. **🌐 Substation Digital Twin (SLD Topology & Cascades):**
   * Visual Single-Line Diagram with color-coded operational health states.
   * Cascading outage risk gauge ($0-100\%$).
   * Prescriptive autonomous grid dispatch work orders.
2. **⚡ Circuit Breaker & Terminal Diagnostics (Dataset 1):**
   * Live user inputs for Voltage, Current, Frequency, Temperature, Vibration, and Load Variation.
   * TreeSHAP sensor attribution waterfall identifying the exact driving triggers.
   * Comprehensive parameter status table.
3. **🧪 Power Transformer DGA & Health Index (Dataset 2):**
   * Dissolved gas sliders ($H_2, CH_4, C_2H_6, C_2H_4, C_2H_2, CO, CO_2$), Breakdown Voltage, and Moisture.
   * Continuous Asset Health Index ($0-100\%$).
   * Duval's Triangle coordinate breakdown and Rogers Ratios.
