"""
Unit and integration tests for Industrial RAG Engine (Grok + Sarvam AI).
Validates multi-source context retrieval, physics & standards health evaluation,
and multi-model orchestration.
"""

import pytest
from unittest.mock import MagicMock, patch
from src.agent.rag_engine import IndustrialRAGEngine
from src.agent.maintenance_agent import MaintenanceAgent


def test_rag_engine_initialization():
    engine = IndustrialRAGEngine()
    assert engine is not None
    assert engine.sarvam_base_url == "https://api.sarvam.ai"


def test_rag_context_retrieval():
    engine = IndustrialRAGEngine()
    ctx = engine.retrieve_context("check bearing vibration and temperature", machine_id="ESP32-HARDWARE-01")
    assert ctx["query"] == "check bearing vibration and temperature"
    assert "retrieved_docs" in ctx
    assert len(ctx["retrieved_docs"]) > 0
    # ISO standards should be retrieved for vibration
    sources = [d["source"] for d in ctx["retrieved_docs"]]
    assert any("ISO 10816" in s or "Bearing" in s for s in sources)


def test_asset_health_evaluation_critical_temperature():
    engine = IndustrialRAGEngine()
    state = {
        "machine_id": "MTR-IND-01",
        "telemetry": {
            "temperature": 95.0,
            "critical_temp_threshold": 80.0,
            "vibration_rms": 1.1
        }
    }
    eval_res = engine.evaluate_asset_health(state)
    assert eval_res["severity"] == "CRITICAL"
    assert eval_res["urgency_score"] >= 90.0
    assert any("Temperature Breach" in a for a in eval_res["anomalies"])


def test_asset_health_evaluation_vibration_zone_d():
    engine = IndustrialRAGEngine()
    state = {
        "machine_id": "PUMP-01",
        "telemetry": {
            "temperature": 55.0,
            "vibration_rms": 5.2
        }
    }
    eval_res = engine.evaluate_asset_health(state)
    assert eval_res["severity"] == "CRITICAL"
    assert any("Zone D" in a for a in eval_res["anomalies"])


def test_asset_health_evaluation_nominal():
    engine = IndustrialRAGEngine()
    state = {
        "machine_id": "FAN-01",
        "telemetry": {
            "temperature": 35.0,
            "vibration_rms": 0.8
        }
    }
    eval_res = engine.evaluate_asset_health(state)
    assert eval_res["severity"] == "NOMINAL"
    assert eval_res["action"] == "NOMINAL_MONITORING"


def test_rag_answer_generation():
    engine = IndustrialRAGEngine()
    ans = engine.generate_rag_answer(
        query="What is the ISO 10816 vibration limit for centrifugal pumps?",
        machine_id="ESP32-HARDWARE-01"
    )
    assert "message" in ans
    assert "engine" in ans
    assert len(ans["message"]) > 0
    assert len(ans["sources"]) >= 1


def test_maintenance_agent_fast_triage_rag():
    agent = MaintenanceAgent("data/sample_maintenance_data.json")
    triage = agent.fast_triage("ESP32-HARDWARE-01")
    assert "decision" in triage
    assert "severity" in triage
    assert "confidence" in triage
    assert "action_metadata" in triage


def test_maintenance_agent_orchestrate_triad():
    agent = MaintenanceAgent("data/sample_maintenance_data.json")
    res = agent.orchestrate_triad(
        machine_id="ESP32-HARDWARE-01",
        query="High temperature detected, what action is needed?",
        target_language="hi-IN"
    )
    assert "tier1_health" in res
    assert "tier2_reasoning" in res
    assert "tier3_sarvam" in res
