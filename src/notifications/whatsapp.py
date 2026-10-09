import json
import os
from typing import Optional

import requests
from dotenv import load_dotenv

CONFIG_FILE = "data/config.json"

load_dotenv()


def get_config():
    if os.path.exists(CONFIG_FILE):
        try:
            with open(CONFIG_FILE, "r") as f:
                return json.load(f)
        except Exception:
            pass
    return {"whatsapp_number": os.getenv("MY_PHONE_NUMBER", "+919923927703")}


def save_config(config):
    os.makedirs("data", exist_ok=True)
    with open(CONFIG_FILE, "w") as f:
        json.dump(config, f)


def send_whatsapp_alert(
    equipment_id: str,
    severity: str,
    reason: str,
    prescription: str,
) -> Optional[str]:
    # Reload environment to pick up any dynamic updates
    load_dotenv()
    account_sid = os.getenv("TWILIO_ACCOUNT_SID")
    auth_token = os.getenv("TWILIO_AUTH_TOKEN")
    if not account_sid or not auth_token:
        print("WhatsApp Dispatch Skipped: Twilio credentials missing.")
        return None

    config = get_config()
    to_number = (config.get("whatsapp_number") or os.getenv("MY_PHONE_NUMBER", "")).strip()
    if not to_number:
        print("WhatsApp Dispatch Skipped: Recipient phone number missing.")
        return None

    to_whatsapp = to_number if to_number.startswith("whatsapp:") else f"whatsapp:{to_number}"
    sandbox_from = os.getenv("TWILIO_WHATSAPP_FROM", "whatsapp:+17372508034")
    content_sid = os.getenv("TWILIO_WHATSAPP_CONTENT_SID", "HXfe5ab5f00277942d4d4200328b4d403c").strip()

    endpoint = f"https://api.twilio.com/2010-04-01/Accounts/{account_sid}/Messages.json"
    auth = (account_sid, auth_token)

    variables = {
        "1": equipment_id,
        "2": severity,
        "3": reason,
        "4": prescription,
    }

    # Attempt 1: Content Template SID
    if content_sid:
        try:
            print(f"--- [TWILIO] Dispatching Template SID {content_sid} to {to_whatsapp}")
            payload = {
                "From": sandbox_from,
                "To": to_whatsapp,
                "ContentSid": content_sid,
                "ContentVariables": json.dumps(variables),
            }
            res = requests.post(endpoint, auth=auth, data=payload, timeout=10)
            if res.status_code in (200, 201):
                sid = res.json().get("sid")
                print(f"✅ [TWILIO] WhatsApp Template Message Sent! SID: {sid}")
                return sid
            else:
                print(f"--- [TWILIO] Template send returned status {res.status_code}: {res.text}. Trying fallback body...")
        except Exception as t_err:
            print(f"--- [TWILIO] Template send network notice: {t_err}. Falling back to standard body...")

    # Attempt 2: Standard Body message
    message_body = (
        f"🚨 CRITICAL MACHINE ALERT\n\n"
        f"Asset: {equipment_id}\n"
        f"Severity: {severity}\n"
        f"Reason: {reason}\n\n"
        f"AI Prescription:\n{prescription}\n"
    )
    try:
        print(f"--- [TWILIO] Dispatching Standard Body to {to_whatsapp}")
        payload = {
            "From": sandbox_from,
            "To": to_whatsapp,
            "Body": message_body,
        }
        res = requests.post(endpoint, auth=auth, data=payload, timeout=10)
        if res.status_code in (200, 201):
            sid = res.json().get("sid")
            print(f"✅ [TWILIO] WhatsApp Standard Message Sent! SID: {sid}")
            return sid
        else:
            print(f"❌ [TWILIO] WhatsApp Dispatch Error: {res.status_code} - {res.text}")
            return None
    except Exception as exc:
        print(f"❌ [TWILIO] WhatsApp Dispatch Network Exception: {exc}")
        return None
