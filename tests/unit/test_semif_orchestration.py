"""
Unit and integration tests for SemIf Direct-Logit Decision Scorer
and Grok / Sarvam Model Orchestration.
"""

import pytest
from unittest.mock import MagicMock, patch
from src.agent.semif_engine import SemIfEngine, softmax, DEFAULT_ACTIONS
from src.agent.maintenance_agent import MaintenanceAgent


def test_softmax_function():
    scores = {"A": 2.0, "B": 1.0, "C": 0.0}
    probs = softmax(scores)
    assert round(sum(probs.values()), 2) == 1.0
    assert probs["A"] > probs["B"] > probs["C"]


def test_semif_local_heuristics_critical():
    engine = SemIfEngine()
    state_crit = {
        "machine_id": "PUMP-01",
        "telemetry": {"vibration_rms": 5.8, "temperature": 99.0},
        "alerts": ["CRITICAL: Thermal breach"]
    }
    res = engine.evaluate_decision(state_crit)
    assert res["decision"] == "EMERGENCY_SHUTDOWN"
    assert res["severity"] == "CRITICAL"
    assert res["confidence"] >= 90.0
    assert res["is_emergency"] is True


def test_semif_local_heuristics_vibration():
    engine = SemIfEngine()
    state_vib = {
        "machine_id": "CNC-02",
        "telemetry": {"vibration_rms": 3.9, "temperature": 60.0},
        "alerts": []
    }
    res = engine.evaluate_decision(state_vib)
    assert res["decision"] == "INSPECT_BEARING"
    assert res["severity"] == "HIGH"
    assert res["confidence"] > 50.0


def test_semif_local_heuristics_normal():
    engine = SemIfEngine()
    state_norm = {
        "machine_id": "FAN-01",
        "telemetry": {"vibration_rms": 0.8, "temperature": 40.0},
        "alerts": []
    }
    res = engine.evaluate_decision(state_norm)
    assert res["decision"] == "NORMAL_MONITORING"
    assert res["severity"] == "INFO"
    assert res["confidence"] > 70.0


def test_semif_with_groq_logprobs_mock():
    engine = SemIfEngine(groq_api_key="mock_key")
    
    mock_token = MagicMock()
    mock_token.token = "A"
    mock_token.logprob = -0.05
    
    mock_token_b = MagicMock()
    mock_token_b.token = "B"
    mock_token_b.logprob = -3.5

    mock_choice = MagicMock()
    mock_content = MagicMock()
    mock_content.top_logprobs = [mock_token, mock_token_b]
    mock_choice.logprobs.content = [mock_content]
    
    mock_response = MagicMock()
    mock_response.choices = [mock_choice]

    mock_client = MagicMock()
    mock_client.chat.completions.create.return_value = mock_response
    engine.groq_client = mock_client

    state = {
        "machine_id": "MTR-01",
        "telemetry": {"vibration_rms": 6.0},
        "alerts": []
    }
    res = engine.evaluate_decision(state)
    assert res["decision"] == DEFAULT_ACTIONS[0] # "EMERGENCY_SHUTDOWN"
    assert res["scoring_source"] == "groq_direct_logit"
    assert res["confidence"] > 90.0


def test_agent_orchestrate_triad_mock():
    with patch("src.data.database.get_machine_health_summary") as mock_health:
        mock_health.return_value = {
            "name": "Centrifugal Pump Alpha",
            "telemetry": [{"vibration_rms": 4.1, "temperature": 68.0}],
            "alerts": []
        }
        
        agent = MaintenanceAgent(data_path="data/sample_maintenance_data.json")
        agent.grok_key = "mock_grok_key"
        
        # Mock Grok response
        with patch.object(agent, "_call_grok_node", return_value="1. Inspect drive bearing. 2. Verify dynamic balance."):
            # Mock Sarvam response
            with patch.object(agent, "_get_sarvam_inference", return_value="1. ड्राइव बेयरिंग का निरीक्षण करें। 2. गतिशील संतुलन सत्यापित करें।"):
                res = agent.orchestrate_triad(
                    machine_id="PUMP_01",
                    query="Unusual harmonic sound on drive end",
                    target_language="hi-IN",
                    synthesize_audio=False
                )
                
                assert "tier1_semif" in res
                assert res["tier1_semif"]["decision"] == "INSPECT_BEARING"
                assert "tier2_reasoning" in res
                assert res["tier2_reasoning"]["engine"] == "grok"
                assert "Inspect drive bearing" in res["tier2_reasoning"]["prescription"]
                assert "tier3_sarvam" in res
                assert res["tier3_sarvam"]["target_language"] == "hi-IN"
                assert "ड्राइव बेयरिंग" in res["tier3_sarvam"]["translated_text"]
