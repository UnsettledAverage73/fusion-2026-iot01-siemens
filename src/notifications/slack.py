import os
import json
import urllib.request
import urllib.error
from datetime import datetime
from typing import Optional, Dict, Any
from dotenv import load_dotenv

load_dotenv()

DEFAULT_SLACK_CHANNEL = os.getenv("SLACK_CHANNEL", "all-average")


def send_slack_alert(
    equipment_id: str,
    severity: str,
    reason: str,
    prescription: str,
    parameters: Optional[Dict[str, Any]] = None,
    channel: Optional[str] = None
) -> Optional[Dict[str, Any]]:
    """
    Dispatches rich Block Kit industrial alerts directly to Slack.
    Uses SLACK_BOT_TOKEN and SLACK_CHANNEL from environment.
    """
    load_dotenv()
    bot_token = os.getenv("SLACK_BOT_TOKEN")
    if not bot_token:
        print("[Slack Alert] Skipped: SLACK_BOT_TOKEN not configured in environment.", flush=True)
        return None

    target_channel = channel or os.getenv("SLACK_CHANNEL", DEFAULT_SLACK_CHANNEL)
    sev_upper = severity.upper()
    is_critical = sev_upper == "CRITICAL"

    header_emoji = "🚨" if is_critical else "⚠️"
    header_text = f"{header_emoji} [{sev_upper}] Sovereign Condition Monitoring Alert"

    # Assemble parameter summary if provided
    param_fields = []
    if parameters:
        if "temperature" in parameters:
            param_fields.append({"type": "mrkdwn", "text": f"*🌡️ Temp:* `{parameters['temperature']} °C`"})
        if "vibration" in parameters or "vibration_rms" in parameters:
            vib = parameters.get("vibration_rms", parameters.get("vibration"))
            param_fields.append({"type": "mrkdwn", "text": f"*📳 Vibration:* `{vib} mm/s`"})
        if "current_draw" in parameters:
            param_fields.append({"type": "mrkdwn", "text": f"*⚡ Current:* `{parameters['current_draw']} A`"})
        if "rpm" in parameters:
            param_fields.append({"type": "mrkdwn", "text": f"*🔄 Speed:* `{parameters['rpm']} RPM`"})

    # Build Slack Block Kit
    blocks = [
        {
            "type": "header",
            "text": {
                "type": "plain_text",
                "text": header_text,
                "emoji": True
            }
        },
        {
            "type": "section",
            "fields": [
                {
                    "type": "mrkdwn",
                    "text": f"*Asset Target:*\n`{equipment_id}`"
                },
                {
                    "type": "mrkdwn",
                    "text": f"*Severity Level:*\n*{'🔴 CRITICAL' if is_critical else '🟡 WARNING'}*"
                },
                {
                    "type": "mrkdwn",
                    "text": f"*Detection Source:*\n`Hardware Real-Time Stream`"
                },
                {
                    "type": "mrkdwn",
                    "text": f"*Timestamp:*\n<!date^{int(datetime.now().timestamp())}^{{date_num}} {{time_secs}}|{datetime.now().strftime('%Y-%m-%d %H:%M:%S')}>"
                }
            ]
        }
    ]

    if param_fields:
        blocks.append({
            "type": "section",
            "fields": param_fields[:8]
        })

    blocks.extend([
        {
            "type": "section",
            "text": {
                "type": "mrkdwn",
                "text": f"*Root Cause / Breach Reason:*\n>{reason}"
            }
        },
        {
            "type": "section",
            "text": {
                "type": "mrkdwn",
                "text": f"*🤖 AI Technical Prescription:*\n```{prescription}```"
            }
        },
        {
            "type": "context",
            "elements": [
                {
                    "type": "mrkdwn",
                    "text": "🛡️ *Sovereign Predictive Maintenance Sentinel* • ISO 10816-3 & IEC 62682 Latch"
                }
            ]
        },
        {
            "type": "divider"
        }
    ])

    fallback_text = f"[{sev_upper}] Machine Alert for {equipment_id}: {reason} | Prescription: {prescription}"

    req_payload = {
        "channel": target_channel,
        "text": fallback_text,
        "blocks": blocks
    }

    try:
        data = json.dumps(req_payload).encode("utf-8")
        req = urllib.request.Request(
            "https://slack.com/api/chat.postMessage",
            data=data,
            headers={
                "Content-Type": "application/json; charset=utf-8",
                "Authorization": f"Bearer {bot_token}"
            }
        )
        with urllib.request.urlopen(req, timeout=5.0) as resp:
            resp_body = resp.read().decode("utf-8")
            res_json = json.loads(resp_body)
            if res_json.get("ok"):
                ts = res_json.get("ts")
                chan = res_json.get("channel")
                print(f"✅ [Slack Alert] Dispatched to channel #{target_channel} (ts={ts})", flush=True)
                return {"status": "success", "channel": chan, "ts": ts}
            else:
                err = res_json.get("error", "unknown_error")
                print(f"❌ [Slack Alert Error] Failed to post: {err}", flush=True)
                return {"status": "error", "error": err}
    except Exception as exc:
        print(f"❌ [Slack Alert Exception] Network error: {exc}", flush=True)
        return {"status": "error", "error": str(exc)}
