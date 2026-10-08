"""
Industrial Real-Time Multiplexed Stream Hub for Predictive Maintenance System.
Provides a single, resilient WebSocket endpoint (/ws/stream) that multiplexes:
  - telemetry:<machine_id> and telemetry:all
  - alerts
  - schedule
  - factory (aggregate KPIs)
  - factory_usage (capacity/utilization bars)
"""

import asyncio
import json
import logging
import os
import time
from datetime import datetime
from typing import Any, Dict, Optional, Set
from fastapi import WebSocket, WebSocketDisconnect
import redis.asyncio as redis

logger = logging.getLogger("stream_hub")

REDIS_HOST = os.getenv("REDIS_HOST", "localhost")
REDIS_PORT = int(os.getenv("REDIS_PORT", 6379))
REDIS_CHANNEL = "telemetry_stream"
SCHEDULE_CHANNEL = "schedule_updates"
ALERT_CHANNEL = os.getenv("ALERT_CHANNEL", "ai_alerts_channel")
FACTORY_USAGE_CHANNEL = "factory_usage"


class MultiplexClientSession:
    """Represents a single connected WebSocket client session with active subscriptions."""

    def __init__(self, websocket: Optional[WebSocket]):
        self.websocket = websocket
        self.subscribed_channels: Set[str] = set()
        self.connected_at = time.time()
        self.last_ping = time.time()
        self.is_alive = True

    def subscribe(self, channels: list[str]) -> list[str]:
        added = []
        for ch in channels:
            if isinstance(ch, str) and ch.strip():
                normalized = ch.strip()
                self.subscribed_channels.add(normalized)
                added.append(normalized)
        return added

    def unsubscribe(self, channels: list[str]) -> list[str]:
        removed = []
        for ch in channels:
            if isinstance(ch, str):
                normalized = ch.strip()
                if normalized in self.subscribed_channels:
                    self.subscribed_channels.remove(normalized)
                    removed.append(normalized)
        return removed

    def is_subscribed_to_telemetry(self, machine_id: str) -> bool:
        return (
            "telemetry:all" in self.subscribed_channels
            or f"telemetry:{machine_id}" in self.subscribed_channels
            or f"telemetry:{machine_id.upper()}" in self.subscribed_channels
            or f"telemetry:{machine_id.lower()}" in self.subscribed_channels
        )

    def is_subscribed_to_alerts(self) -> bool:
        return "alerts" in self.subscribed_channels or "alerts:all" in self.subscribed_channels

    def is_subscribed_to_schedule(self) -> bool:
        return "schedule" in self.subscribed_channels or "schedule:all" in self.subscribed_channels

    def is_subscribed_to_factory(self) -> bool:
        return "factory" in self.subscribed_channels or "facility" in self.subscribed_channels

    async def send_frame(self, frame_type: str, channel: str, data: Any, extra: Optional[Dict[str, Any]] = None):
        if not self.is_alive or self.websocket is None:
            return
        payload = {
            "type": frame_type,
            "channel": channel,
            "timestamp": datetime.now().isoformat(),
            "data": data,
        }
        if extra:
            payload.update(extra)
        try:
            await self.websocket.send_json(payload)
        except Exception:
            self.is_alive = False


async def handle_multiplex_stream(websocket: WebSocket):
    """
    Main WebSocket handler for /ws/stream.
    Manages inbound control messages and outbound pub/sub distribution.
    """
    await websocket.accept()
    session = MultiplexClientSession(websocket)

    # Initial welcome handshake
    await session.send_frame(
        frame_type="connection_established",
        channel="system",
            data={
                "status": "connected",
                "server_time": time.time(),
                "available_channels": ["alerts", "schedule", "factory", "factory_usage", "telemetry:all", "telemetry:<machine_id>"],
            },
        )

    r_async = redis.Redis(host=REDIS_HOST, port=REDIS_PORT, decode_responses=True)
    pubsub = r_async.pubsub()

    stop_event = asyncio.Event()

    async def client_reader():
        """Reads incoming control frames from the client: subscribe, unsubscribe, ping."""
        try:
            while not stop_event.is_set():
                raw_text = await websocket.receive_text()
                try:
                    msg = json.loads(raw_text)
                except Exception:
                    continue

                action = msg.get("action", "").lower()

                if action == "ping":
                    client_time = msg.get("client_time") or time.time()
                    await websocket.send_json({
                        "type": "pong",
                        "channel": "system",
                        "client_time": client_time,
                        "server_time": time.time(),
                    })
                    session.last_ping = time.time()

                elif action == "subscribe":
                    channels = msg.get("channels", [])
                    if isinstance(channels, str):
                        channels = [channels]
                    added = session.subscribe(channels)
                    await websocket.send_json({
                        "type": "subscribed",
                        "channel": "system",
                        "channels": list(session.subscribed_channels),
                        "added": added,
                    })

                elif action == "unsubscribe":
                    channels = msg.get("channels", [])
                    if isinstance(channels, str):
                        channels = [channels]
                    removed = session.unsubscribe(channels)
                    await websocket.send_json({
                        "type": "unsubscribed",
                        "channel": "system",
                        "channels": list(session.subscribed_channels),
                        "removed": removed,
                    })

        except (WebSocketDisconnect, asyncio.CancelledError):
            pass
        except Exception as err:
            logger.debug(f"Multiplex client reader exit: {err}")
        finally:
            stop_event.set()

    async def redis_listener():
        """Subscribes to Redis channels and routes messages to client based on active subscriptions."""
        try:
            await pubsub.subscribe(REDIS_CHANNEL, ALERT_CHANNEL, SCHEDULE_CHANNEL)
            while not stop_event.is_set():
                # Check for message with a timeout to remain responsive to cancel
                try:
                    message = await pubsub.get_message(ignore_subscribe_messages=True, timeout=0.5)
                except Exception as get_err:
                    # Redis temporary drop
                    await asyncio.sleep(1.0)
                    continue

                if not message or message.get("type") != "message":
                    await asyncio.sleep(0.01)
                    continue

                channel = message.get("channel")
                raw_data = message.get("data", "")

                if channel == REDIS_CHANNEL:
                    try:
                        data = json.loads(raw_data) if isinstance(raw_data, str) else raw_data
                        eq_id = data.get("equipment_id")
                        if eq_id and session.is_subscribed_to_telemetry(eq_id):
                            ts = data.get("timestamp") or datetime.now().isoformat()
                            telemetry_payload = {
                                "time": ts,
                                "timestamp": ts,
                                **data.get("parameters", {}),
                            }
                            if "temperature" not in telemetry_payload and "temperature" in data:
                                telemetry_payload["temperature"] = data["temperature"]
                            if "vibration" not in telemetry_payload and "vibration" in data:
                                telemetry_payload["vibration"] = data["vibration"]

                            await session.send_frame(
                                frame_type="telemetry",
                                channel=f"telemetry:{eq_id}",
                                data=telemetry_payload,
                                extra={"machineId": eq_id},
                            )
                    except Exception as parse_err:
                        logger.debug(f"Error parsing telemetry frame: {parse_err}")

                elif channel == ALERT_CHANNEL:
                    if session.is_subscribed_to_alerts():
                        try:
                            alert_payload = json.loads(raw_data) if isinstance(raw_data, str) else raw_data
                            await session.send_frame(
                                frame_type="alert",
                                channel="alerts",
                                data=alert_payload,
                            )
                        except Exception as parse_err:
                            logger.debug(f"Error parsing alert frame: {parse_err}")

                elif channel == SCHEDULE_CHANNEL:
                    if session.is_subscribed_to_schedule():
                        try:
                            sched_payload = json.loads(raw_data) if isinstance(raw_data, str) else raw_data
                            await session.send_frame(
                                frame_type="schedule",
                                channel="schedule",
                                data=sched_payload,
                            )
                        except Exception as parse_err:
                            logger.debug(f"Error parsing schedule frame: {parse_err}")

        except Exception as redis_err:
            logger.debug(f"Redis listener error: {redis_err}")
            # Notify client that real-time pubsub stream is degraded
            try:
                await session.send_frame(
                    frame_type="system_notice",
                    channel="system",
                    data={"status": "degraded", "detail": "Redis stream reconnecting"},
                )
            except Exception:
                pass
        finally:
            try:
                await pubsub.unsubscribe(REDIS_CHANNEL, ALERT_CHANNEL, SCHEDULE_CHANNEL)
            except Exception:
                pass

    async def factory_stats_broadcaster():
        """Periodically pushes lightweight factory-level aggregates if client subscribes to 'factory'."""
        while not stop_event.is_set():
            await asyncio.sleep(8.0)
            if not (session.is_subscribed_to_factory() or FACTORY_USAGE_CHANNEL in session.subscribed_channels):
                continue

            try:
                from src.data.database import DB_PATH
                import sqlite3

                if not os.path.exists(DB_PATH):
                    continue

                conn = sqlite3.connect(DB_PATH)
                conn.row_factory = sqlite3.Row
                cur = conn.cursor()
                cur.execute("SELECT COUNT(*) as cnt FROM ai_alerts WHERE feedback_score IS NULL OR feedback_score = 0")
                alert_row = cur.fetchone()
                active_alerts = alert_row["cnt"] if alert_row else 0

                cur.execute("SELECT COUNT(*) as total, SUM(CASE WHEN status='online' THEN 1 ELSE 0 END) as online FROM equipment")
                eq_row = cur.fetchone()
                total_eq = eq_row["total"] if eq_row else 0
                online_eq = eq_row["online"] if eq_row else 0

                cur.execute("SELECT id, name FROM equipment ORDER BY name ASC")
                equipment_rows = cur.fetchall()
                usage_rows = []
                for eq in equipment_rows:
                    cur.execute(
                        "SELECT vibration FROM sensor_readings WHERE equipment_id = ? ORDER BY timestamp DESC LIMIT 1",
                        (eq["id"],),
                    )
                    row = cur.fetchone()
                    vibration = row["vibration"] if row and row["vibration"] is not None else 0
                    usage = min(100, max(0, (float(vibration) / 10) * 100))
                    usage_rows.append({
                        "id": eq["id"],
                        "name": eq["name"] or eq["id"],
                        "usage": round(usage, 1),
                    })

                conn.close()

                avg_health = 98 if active_alerts == 0 else max(40, 100 - (active_alerts * 12))
                factory_status = "Optimal" if active_alerts == 0 else ("Warning" if active_alerts < 3 else "Critical")

                if session.is_subscribed_to_factory():
                    await session.send_frame(
                        frame_type="factory_stats",
                        channel="factory",
                        data={
                            "activeAlerts": active_alerts,
                            "totalMachines": total_eq,
                            "onlineMachines": online_eq,
                            "avgHealth": avg_health,
                            "factoryStatus": factory_status,
                        },
                    )

                if FACTORY_USAGE_CHANNEL in session.subscribed_channels:
                    await session.send_frame(
                        frame_type="factory_usage",
                        channel=FACTORY_USAGE_CHANNEL,
                        data=usage_rows,
                    )
            except Exception as f_err:
                logger.debug(f"Factory broadcaster error: {f_err}")

    # Run tasks concurrently
    tasks = [
        asyncio.create_task(client_reader()),
        asyncio.create_task(redis_listener()),
        asyncio.create_task(factory_stats_broadcaster()),
    ]

    try:
        # Wait until the client reader terminates (disconnect or error)
        await stop_event.wait()
    except asyncio.CancelledError:
        pass
    finally:
        stop_event.set()
        for t in tasks:
            t.cancel()
        await asyncio.gather(*tasks, return_exceptions=True)
        try:
            if hasattr(pubsub, "aclose"):
                await pubsub.aclose()
            else:
                await pubsub.close()
            await r_async.aclose()
        except Exception:
            pass
