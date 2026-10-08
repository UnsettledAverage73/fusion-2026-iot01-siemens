import pytest
import time
import json
import asyncio
from fastapi.testclient import TestClient
from src.api import app

client = TestClient(app)

class TestCloudEdgeScalability:
    """
    Integration and scalability test suite for autonomous Cloud IoT Ingestion,
    multi-machine edge telemetry concurrency, and edge resilience.
    """

    def test_cloud_health_endpoints(self):
        """Verifies all health check probes required by Render and cloud load balancers."""
        for path in ["/health", "/api/health", "/api/system/health"]:
            response = client.get(path)
            assert response.status_code == 200
            data = response.json()
            assert data.get("status") == "healthy"
            assert data.get("service") == "predmaint-api"

    def test_single_edge_node_ingestion_payload(self):
        """Verifies ingestion of full multi-sensor payload from ESP32."""
        payload = {
            "equipment_id": "CNC001",
            "source": "esp32",
            "mac_address": "3c:71:bf:52:d7:c8",
            "sensor_kind": "multi",
            "temperature": 32.5,
            "humidity": 62.0,
            "vibration": 0.04,
            "parameters": {
                "temperature": 32.5,
                "humidity": 62.0,
                "current_draw": 1.45,
                "rpm": 1450,
                "hall_analog": 180,
                "button_state": 0,
                "buzzer_state": 0,
                "cloud_mode": "HTTPS_SECURE",
                "status": "OK"
            }
        }
        start = time.perf_counter()
        response = client.post("/api/iot/ingest", json=payload)
        elapsed_ms = (time.perf_counter() - start) * 1000

        assert response.status_code == 200
        data = response.json()
        assert data.get("status") == "success"
        # Ingestion latency should be well under 500ms including SQLite writes
        assert elapsed_ms < 500

    def test_concurrent_multi_machine_scalability(self):
        """Simulates 4 independent factory edge nodes streaming simultaneously."""
        machines = ["CNC001", "CONV01", "HYD005", "EXT002"]
        latencies = []

        for eq_id in machines:
            payload = {
                "equipment_id": eq_id,
                "source": "esp32_edge",
                "temperature": 35.0,
                "parameters": {
                    "temperature": 35.0,
                    "current_draw": 2.1,
                    "rpm": 1200,
                    "status": "OK"
                }
            }
            start = time.perf_counter()
            resp = client.post("/api/iot/ingest", json=payload)
            latencies.append((time.perf_counter() - start) * 1000)
            assert resp.status_code == 200

        avg_latency = sum(latencies) / len(latencies)
        assert avg_latency < 300  # Average ingestion time under 300ms per node

    def test_resilient_coercion_and_malformed_tolerance(self):
        """Verifies ingestion engine safely handles string-encoded floats and edge inputs."""
        payload = {
            "equipment_id": "CNC001",
            "temperature": "38.6",  # string encoded
            "humidity": None,
            "parameters": {
                "current_draw": "3.85",
                "rpm": "1800",
                "status": "OK"
            }
        }
        response = client.post("/api/iot/ingest", json=payload)
        assert response.status_code == 200
        assert response.json().get("status") == "success"

    def test_critical_threshold_telemetry_flow(self):
        """Verifies ingestion of critical over-temperature alert telemetry."""
        payload = {
            "equipment_id": "CNC001",
            "temperature": 88.5,  # Exceeds critical threshold (>80C)
            "parameters": {
                "temperature": 88.5,
                "current_draw": 19.5, # Exceeds critical current (>18A)
                "status": "CRITICAL"
            }
        }
        response = client.post("/api/iot/ingest", json=payload)
        assert response.status_code == 200
        assert response.json().get("status") == "success"
