from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field
from typing import Dict, Any, Optional, List
from src.services.substation_service import (
    get_substation_topology,
    get_preset_scenarios,
    predict_terminal,
    predict_transformer,
    evaluate_substation_system,
    PRESET_SCENARIOS
)

router = APIRouter(prefix="/api/v1/substation", tags=["Siemens Smart Grid Substation"])

class TerminalPredictionRequest(BaseModel):
    voltage: float = Field(230.0, description="Terminal Voltage (V)")
    current: float = Field(35.0, description="Current (A)")
    temperature: float = Field(45.0, description="Temperature (°C)")
    frequency: float = Field(50.0, description="Frequency (Hz)")
    power_factor: float = Field(0.92, description="Power Factor")
    vibration_level: float = Field(1.5, description="Vibration Level (mm/s)")
    device_age: Optional[float] = Field(5.0, description="Age in Years")
    terminal_efficiency: Optional[float] = Field(90.0, description="Efficiency (%)")
    load_variation: Optional[float] = Field(15.0, description="Load Variation (%)")
    signal_strength: Optional[float] = Field(-65.0, description="Signal Strength (dB)")
    apparent_power: Optional[float] = Field(None, description="Apparent Power (kVA)")
    real_power: Optional[float] = Field(None, description="Real Power (kW)")
    energy_consumed: Optional[float] = Field(None, description="Energy Consumed (kWh)")
    anomaly_score: Optional[float] = Field(0.2, description="Anomaly Score")

class TransformerPredictionRequest(BaseModel):
    h2: float = Field(20.0, description="Hydrogen H2 (ppm)")
    ch4: float = Field(25.0, description="Methane CH4 (ppm)")
    c2h6: float = Field(15.0, description="Ethane C2H6 (ppm)")
    c2h4: float = Field(20.0, description="Ethylene C2H4 (ppm)")
    c2h2: float = Field(0.5, description="Acetylene C2H2 (ppm)")
    co: float = Field(250.0, description="Carbon Monoxide CO (ppm)")
    co2: float = Field(2200.0, description="Carbon Dioxide CO2 (ppm)")
    bdv: float = Field(65.0, description="Breakdown Voltage (kV)")
    moisture: float = Field(12.0, description="Moisture in Oil (ppm)")
    oil_temp: float = Field(55.0, description="Top Oil Temperature (°C)")
    winding_temp: float = Field(67.0, description="Winding Temperature (°C)")
    age: Optional[float] = Field(5.0, description="Transformer Age (Years)")

class SystemEvaluationRequest(BaseModel):
    terminal: Optional[Dict[str, float]] = None
    transformer: Optional[Dict[str, float]] = None

@router.get("/topology")
def get_topology():
    """Returns the Substation Single-Line Diagram (SLD) topology graph."""
    return {"status": "success", "data": get_substation_topology()}

@router.get("/presets")
def get_presets():
    """Returns ready-to-test demonstration preset scenarios."""
    return {"status": "success", "presets": PRESET_SCENARIOS}

@router.post("/predict-terminal")
def api_predict_terminal(req: TerminalPredictionRequest):
    """Predicts Circuit Breaker / Terminal trip risk and identifies driving sensors."""
    data = req.model_dump()
    result = predict_terminal(data)
    return {"status": "success", "data": result}

@router.post("/predict-transformer")
def api_predict_transformer(req: TransformerPredictionRequest):
    """Predicts Power Transformer DGA fault class and continuous Health Index."""
    data = req.model_dump()
    result = predict_transformer(data)
    return {"status": "success", "data": result}

@router.post("/evaluate-system")
def api_evaluate_system(req: SystemEvaluationRequest):
    """Evaluates combined substation cascading outage risk and operator prescriptions."""
    t_data = req.terminal or PRESET_SCENARIOS["nominal"]["terminal"]
    tx_data = req.transformer or PRESET_SCENARIOS["nominal"]["transformer"]
    result = evaluate_substation_system(t_data, tx_data)
    return {"status": "success", "data": result}
