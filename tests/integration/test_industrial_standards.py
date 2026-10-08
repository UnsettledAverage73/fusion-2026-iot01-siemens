import unittest
import numpy as np
from fastapi.testclient import TestClient
from src.api import app
from src.data.analytics import (
    MachineClass,
    evaluate_iso_10816_severity,
    extract_vibration_dsp_features,
)
from src.services.alerts import AlarmRationalizer, AlarmState


class TestIndustrialStandards(unittest.TestCase):
    def setUp(self):
        self.client = TestClient(app)

    # =========================================================================
    # 1. ISO 10816-3 Vibration Severity Standards Tests
    # =========================================================================
    def test_iso_10816_zone_classification(self):
        """Verify standard ISO 10816-3 boundary classifications for Class II machines."""
        # Class II limits: Zone A <= 1.12, Zone B <= 2.80, Zone C <= 7.10, Zone D > 7.10
        res_a = evaluate_iso_10816_severity("Class II", 0.8)
        self.assertEqual(res_a["zone"], "A")
        self.assertEqual(res_a["status"], "GOOD")
        self.assertEqual(res_a["severity"], "NORMAL")

        res_b = evaluate_iso_10816_severity("Class II", 2.1)
        self.assertEqual(res_b["zone"], "B")
        self.assertEqual(res_b["status"], "ACCEPTABLE")
        self.assertEqual(res_b["severity"], "LOW")

        res_c = evaluate_iso_10816_severity("Class II", 4.5)
        self.assertEqual(res_c["zone"], "C")
        self.assertEqual(res_c["status"], "WARNING")
        self.assertEqual(res_c["severity"], "WARNING")

        res_d = evaluate_iso_10816_severity("Class II", 8.9)
        self.assertEqual(res_d["zone"], "D")
        self.assertEqual(res_d["status"], "CRITICAL")
        self.assertEqual(res_d["severity"], "CRITICAL")
        self.assertGreaterEqual(res_d["risk_score"], 80.0)

    def test_iso_10816_api_endpoint(self):
        """Verify the /api/analytics/iso10816 REST endpoint."""
        response = self.client.post("/api/analytics/iso10816", json={
            "machine_class": "Class I",
            "vibration_rms": 5.2
        })
        self.assertEqual(response.status_code, 200)
        data = response.json()
        self.assertEqual(data["zone"], "D")
        self.assertEqual(data["status"], "CRITICAL")

    # =========================================================================
    # 2. Digital Signal Processing (DSP) Feature Extraction Tests
    # =========================================================================
    def test_dsp_vibration_feature_extraction(self):
        """Test statistical feature extraction on synthetic healthy vs bearing damaged signal."""
        # Baseline healthy sinusoid
        t = np.linspace(0, 1, 1000)
        healthy = list(np.sin(2 * np.pi * 50 * t))
        feat_healthy = extract_vibration_dsp_features(healthy)

        self.assertAlmostEqual(feat_healthy["rms"], 0.707, delta=0.05)
        self.assertAlmostEqual(feat_healthy["peak"], 1.0, delta=0.05)
        self.assertAlmostEqual(feat_healthy["crest_factor"], 1.414, delta=0.1)
        self.assertFalse(feat_healthy["bearing_fault_suspected"])

        # Impulsive bearing spalling defect: high kurtosis and high crest factor
        damaged = np.array(healthy)
        # Add sharp periodic impact spikes
        damaged[100] = 12.0
        damaged[300] = 14.0
        damaged[600] = 13.5
        feat_damaged = extract_vibration_dsp_features(list(damaged))

        self.assertGreater(feat_damaged["kurtosis"], 4.0)
        self.assertGreater(feat_damaged["crest_factor"], 4.5)
        self.assertTrue(feat_damaged["bearing_fault_suspected"])

    def test_dsp_api_endpoint(self):
        """Verify the /api/analytics/dsp/vibration REST endpoint."""
        samples = [1.0, 2.0, -1.5, 0.5, 3.2, -2.1, 1.1]
        response = self.client.post("/api/analytics/dsp/vibration", json={"samples": samples})
        self.assertEqual(response.status_code, 200)
        data = response.json()
        self.assertIn("rms", data)
        self.assertIn("crest_factor", data)
        self.assertIn("kurtosis", data)

    # =========================================================================
    # 3. ISA-18.2 Alarm Rationalization Tests (Deadbands, Debouncing, Shelving)
    # =========================================================================
    def test_alarm_debouncing_persistence(self):
        """Verify that single-sample noise glitches are filtered out by debouncing."""
        rationalizer = AlarmRationalizer(default_deadband_pct=0.05, default_persistence=3)
        eq_id = "TEST-CNC-01"
        param = "spindle_temp"

        # Reading 1: Spike above threshold (85C)
        res1 = rationalizer.evaluate_condition(eq_id, param, 86.0, warning_threshold=75.0, critical_threshold=85.0)
        # 1 breach out of 3 required -> Not yet latched as active alarm
        self.assertFalse(res1["is_alarm"])

        # Reading 2: Still above threshold
        res2 = rationalizer.evaluate_condition(eq_id, param, 87.0, warning_threshold=75.0, critical_threshold=85.0)
        self.assertFalse(res2["is_alarm"])

        # Reading 3: 3rd consecutive breach -> Latches ACTIVE_UNACK CRITICAL alarm
        res3 = rationalizer.evaluate_condition(eq_id, param, 88.0, warning_threshold=75.0, critical_threshold=85.0)
        self.assertTrue(res3["is_alarm"])
        self.assertEqual(res3["alarm_level"], "CRITICAL")
        self.assertEqual(res3["state"], AlarmState.ACTIVE_UNACK)

    def test_alarm_hysteresis_deadband(self):
        """Verify that hysteresis prevents chattering when value hovers around threshold."""
        rationalizer = AlarmRationalizer(default_deadband_pct=0.10, default_persistence=1)
        eq_id = "TEST-PUMP-01"
        param = "pressure"

        # Trigger Critical Alarm at 100 bar (deadband 10% = 10 bar, clears below 90 bar)
        res1 = rationalizer.evaluate_condition(eq_id, param, 101.0, critical_threshold=100.0)
        self.assertTrue(res1["is_alarm"])

        # Drops to 95 bar: Below 100, but still within the 10% deadband!
        res2 = rationalizer.evaluate_condition(eq_id, param, 95.0, critical_threshold=100.0)
        self.assertTrue(res2["is_alarm"], "Alarm should remain active inside deadband")

        # Drops to 88 bar: Outside deadband -> Clears
        res3 = rationalizer.evaluate_condition(eq_id, param, 88.0, critical_threshold=100.0)
        self.assertFalse(res3["is_alarm"], "Alarm should clear once crossing deadband boundary")

    def test_alarm_shelving_and_acknowledgement(self):
        """Verify ISA-18.2 alarm acknowledgement and temporary shelving."""
        rationalizer = AlarmRationalizer(default_persistence=1)
        eq_id = "TEST-COMP-01"
        param = "vibration_rms"

        # Trigger alarm
        rationalizer.evaluate_condition(eq_id, param, 9.0, critical_threshold=7.0)

        # Operator acknowledges alarm
        ack_res = rationalizer.acknowledge_alarm(eq_id, param, "Senior Technician Raj")
        self.assertIsNotNone(ack_res)
        self.assertEqual(ack_res["state"], AlarmState.ACTIVE_ACK)
        self.assertEqual(ack_res["acknowledged_by"], "Senior Technician Raj")

        # Shelve alarm for 30 minutes
        shelve_res = rationalizer.shelve_alarm(eq_id, param, duration_minutes=30, reason="Scheduled bearing greasing")
        self.assertEqual(shelve_res["state"], AlarmState.SHELVED)

        # During shelved period, evaluate_condition returns shelved
        res_during_shelve = rationalizer.evaluate_condition(eq_id, param, 10.0, critical_threshold=7.0)
        self.assertFalse(res_during_shelve["is_alarm"])
        self.assertEqual(res_during_shelve["state"], AlarmState.SHELVED)

    def test_alarm_management_endpoints(self):
        """Test /api/alarms/active, acknowledge, and shelve endpoints."""
        # Trigger an alarm in global rationalizer
        from src.services.alerts import alarm_rationalizer
        alarm_rationalizer.evaluate_condition("CNC-99", "temp", 150.0, critical_threshold=100.0, persistence_required=1)

        # 1. Get active alarms
        resp_list = self.client.get("/api/alarms/active")
        self.assertEqual(resp_list.status_code, 200)
        active_list = resp_list.json()
        self.assertTrue(any(a["equipment_id"] == "CNC-99" for a in active_list))

        # 2. Acknowledge alarm
        ack_resp = self.client.post("/api/alarms/acknowledge", json={
            "equipment_id": "CNC-99",
            "parameter_key": "temp",
            "operator_name": "Test Operator"
        })
        self.assertEqual(ack_resp.status_code, 200)
        self.assertEqual(ack_resp.json()["alarm"]["state"], AlarmState.ACTIVE_ACK)

        # 3. Shelve alarm
        shelve_resp = self.client.post("/api/alarms/shelve", json={
            "equipment_id": "CNC-99",
            "parameter_key": "temp",
            "duration_minutes": 15,
            "reason": "Calibration"
        })
        self.assertEqual(shelve_resp.status_code, 200)
        self.assertEqual(shelve_resp.json()["alarm"]["state"], AlarmState.SHELVED)

    # =========================================================================
    # 4. Custom Sensor Registry & Cloud Catalog API Tests
    # =========================================================================
    def test_sensor_catalog_api_key_auth(self):
        """Verify API key authentication and catalog fetching."""
        # 1. Invalid / short key should fail with 401
        fail_resp = self.client.post("/api/sensors/catalog/fetch", json={"api_key": "123"})
        self.assertEqual(fail_resp.status_code, 401)
        
        # 2. Valid key should authenticate and return sensors
        ok_resp = self.client.post("/api/sensors/catalog/fetch", json={"api_key": "IND-CATALOG-KEY-9921X"})
        self.assertEqual(ok_resp.status_code, 200)
        data = ok_resp.json()
        self.assertEqual(data["status"], "authenticated")
        self.assertTrue(len(data["sensors"]) >= 5)
        self.assertTrue(any(s["id"] == "bosch_bme680" for s in data["sensors"]))

    def test_custom_sensor_crud(self):
        """Verify saving, retrieving, and deleting a user-defined custom sensor."""
        payload = {
            "id": "sensor_test_ultrasonic_flow",
            "name": "Ultrasonic Clamp-on Flowmeter",
            "metric": "flow_rate_lpm",
            "unit": "L/min",
            "category": "fluid",
            "interface_type": "analog",
            "pin_esp32": "GPIO 32",
            "pin_pi": "GPIO 23",
            "pin_arduino": "A2",
            "default_value": 15.5,
            "normal_min": 5.0,
            "normal_max": 25.0,
            "warning_threshold": 30.0,
            "critical_threshold": 40.0,
            "description": "Non-invasive ultrasonic pipe flow sensor"
        }
        
        # 1. Create
        create_resp = self.client.post("/api/sensors/custom", json=payload)
        self.assertEqual(create_resp.status_code, 200)
        
        # 2. Retrieve
        list_resp = self.client.get("/api/sensors/custom")
        self.assertEqual(list_resp.status_code, 200)
        sensors = list_resp.json()
        self.assertTrue(any(s["id"] == "sensor_test_ultrasonic_flow" for s in sensors))
        
        # 3. Delete
        del_resp = self.client.delete("/api/sensors/custom/sensor_test_ultrasonic_flow")
        self.assertEqual(del_resp.status_code, 200)

    def test_diagnostic_handshake_flow(self):
        """Verify the 5-phase hardware handshake and diagnostic execution."""
        req = {
            "equipment_id": "TEST-SPINDLE-01",
            "platform": "esp32",
            "sensors": ["temperature", "vibration_rms", "current_draw"]
        }
        resp = self.client.post("/api/iot/diagnostic-handshake", json=req)
        self.assertEqual(resp.status_code, 200)
        data = resp.json()
        self.assertEqual(data["status"], "success")
        self.assertTrue(data["handshake_verified"])
        self.assertEqual(len(data["steps"]), 5)
        self.assertIn("packet", data)


if __name__ == "__main__":
    unittest.main()
