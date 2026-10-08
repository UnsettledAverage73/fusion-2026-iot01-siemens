import unittest
import json
import os
import sys

# Ensure project root is on sys.path
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), '../../')))

from fastapi.testclient import TestClient
from src.api import app
from src.services.stream_hub import MultiplexClientSession

class TestMultiplexStream(unittest.TestCase):
    def test_session_channel_filtering(self):
        """Test channel subscription logic in MultiplexClientSession."""
        session = MultiplexClientSession(None)
        
        # Initially empty
        self.assertFalse(session.is_subscribed_to_telemetry("CNC-01"))
        self.assertFalse(session.is_subscribed_to_alerts())
        self.assertFalse(session.is_subscribed_to_schedule())
        self.assertFalse(session.is_subscribed_to_factory())

        # Subscribe to specific machine and alerts
        added = session.subscribe(["telemetry:CNC-01", "alerts"])
        self.assertIn("telemetry:CNC-01", added)
        self.assertIn("alerts", added)

        self.assertTrue(session.is_subscribed_to_telemetry("CNC-01"))
        self.assertFalse(session.is_subscribed_to_telemetry("LATHE-02"))
        self.assertTrue(session.is_subscribed_to_alerts())
        self.assertFalse(session.is_subscribed_to_schedule())

        # Subscribe to telemetry:all
        session.subscribe(["telemetry:all", "factory"])
        self.assertTrue(session.is_subscribed_to_telemetry("LATHE-02"))
        self.assertTrue(session.is_subscribed_to_factory())

        # Unsubscribe
        removed = session.unsubscribe(["alerts", "telemetry:all"])
        self.assertIn("alerts", removed)
        self.assertIn("telemetry:all", removed)
        self.assertFalse(session.is_subscribed_to_alerts())
        self.assertFalse(session.is_subscribed_to_telemetry("LATHE-02"))
        # Still subscribed to CNC-01
        self.assertTrue(session.is_subscribed_to_telemetry("CNC-01"))

    def test_websocket_handshake_and_ping(self):
        """Test the live WebSocket /ws/stream handshake and ping/pong."""
        import concurrent.futures
        client = TestClient(app)
        try:
            with client.websocket_connect("/ws/stream") as websocket:
                # 1. Connection established frame
                welcome = websocket.receive_json()
                self.assertEqual(welcome.get("type"), "connection_established")
                self.assertEqual(welcome.get("channel"), "system")
                self.assertEqual(welcome.get("data", {}).get("status"), "connected")

                # 2. Ping-pong round trip
                websocket.send_text(json.dumps({"action": "ping", "client_time": 1000.5}))
                pong = websocket.receive_json()
                self.assertEqual(pong.get("type"), "pong")
                self.assertEqual(pong.get("client_time"), 1000.5)
                self.assertIn("server_time", pong)

                # 3. Channel subscription
                websocket.send_text(json.dumps({"action": "subscribe", "channels": ["alerts", "telemetry:CNC-01"]}))
                sub_ack = websocket.receive_json()
                self.assertEqual(sub_ack.get("type"), "subscribed")
                self.assertIn("alerts", sub_ack.get("channels", []))
                self.assertIn("telemetry:CNC-01", sub_ack.get("channels", []))

                # 4. Channel unsubscription
                websocket.send_text(json.dumps({"action": "unsubscribe", "channels": ["alerts"]}))
                unsub_ack = websocket.receive_json()
                self.assertEqual(unsub_ack.get("type"), "unsubscribed")
                self.assertNotIn("alerts", unsub_ack.get("channels", []))
                self.assertIn("telemetry:CNC-01", unsub_ack.get("channels", []))
        except concurrent.futures.CancelledError:
            # Expected Starlette TestClient context cancellation on Python 3.14 exit
            pass

if __name__ == "__main__":
    unittest.main()
