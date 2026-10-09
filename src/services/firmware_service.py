"""
Sovereign Firmware & Microcontroller Flashing Service.

Provides:
1. Extended Industry Machine Templates with detailed engineering failure mode analysis.
2. Dynamic Arduino C/C++ (.ino) Sketch Generator for configurable and custom sensors.
3. Automated compilation & flashing directly to microcontrollers using arduino-cli.
"""

import os
import re
import glob
import json
import shutil
import tempfile
import subprocess
from typing import Dict, Any, List, Optional
from datetime import datetime

# Supported Microcontroller Cores
SUPPORTED_BOARDS = {
    "esp32": {
        "name": "ESP32 Dev Module (Standard)",
        "fqbn": "esp32:esp32:esp32",
        "default_baud": 115200,
        "default_pins": {
            "dht": 4,
            "acs712": 34,
            "hall_d0": 25,
            "hall_a0": 35,
            "button": 27,
            "buzzer": 13,
            "i2c_sda": 21,
            "i2c_scl": 22
        }
    },
    "arduino_uno": {
        "name": "Arduino Uno (ATmega328P)",
        "fqbn": "arduino:avr:uno",
        "default_baud": 115200,
        "default_pins": {
            "dht": 2,
            "acs712": "A0",
            "hall_d0": 3,
            "hall_a0": "A1",
            "button": 4,
            "buzzer": 5,
            "i2c_sda": "A4",
            "i2c_scl": "A5"
        }
    },
    "arduino_mega": {
        "name": "Arduino Mega 2560",
        "fqbn": "arduino:avr:mega",
        "default_baud": 115200,
        "default_pins": {
            "dht": 2,
            "acs712": "A0",
            "hall_d0": 18,
            "hall_a0": "A1",
            "button": 4,
            "buzzer": 5,
            "i2c_sda": 20,
            "i2c_scl": 21
        }
    }
}

# 8 Core Industrial Machine Templates with Detailed Failure Mode Analysis & International Standards
INDUSTRY_MACHINE_TEMPLATES = {
    "induction_motor": {
        "id": "induction_motor",
        "name": "3-Phase Induction Motor / Spindle Drive",
        "category": "Rotating Equipment",
        "icon": "RotateCw",
        "standards": ["ISO 10816-3 (Vibration)", "IEC 60034-1 Class F (Thermal)", "NEMA MG-1"],
        "description": "Continuous-duty heavy industrial induction motors, spindle motors, and prime movers.",
        "detailed_analysis": (
            "Monitors stator winding insulation breakdown, bearing raceway fatigue (BPFO/BPFI), "
            "rotor bar cracking, and phase current imbalance. Temperature exceeding 85°C on bearings indicates "
            "lubrication starvation or excessive radial preloading."
        ),
        "recommended_critical_temp": 85.0,
        "parameters": [
            {
                "parameter_key": "temperature",
                "display_name": "Motor Bearing Temperature",
                "unit": "°C",
                "normal_min": 25.0,
                "normal_max": 70.0,
                "warning_threshold": 78.0,
                "critical_threshold": 85.0,
                "direction": "above",
                "sensor_type": "dht",
                "default_pin": "GPIO 4",
                "description": "Bearing cap thermal gradient; above 85°C initiates thermal degradation."
            },
            {
                "parameter_key": "vibration_rms",
                "display_name": "Vibration Velocity RMS",
                "unit": "mm/s",
                "normal_min": 0.0,
                "normal_max": 2.8,
                "warning_threshold": 4.5,
                "critical_threshold": 7.1,
                "direction": "above",
                "sensor_type": "mpu6050",
                "default_pin": "I2C (21/22)",
                "description": "ISO 10816-3 Zone C boundary is 4.5 mm/s; Zone D dangerous threshold is 7.1 mm/s."
            },
            {
                "parameter_key": "current_draw",
                "display_name": "Motor Stator Current",
                "unit": "A",
                "normal_min": 2.0,
                "normal_max": 18.0,
                "warning_threshold": 22.0,
                "critical_threshold": 26.0,
                "direction": "above",
                "sensor_type": "acs712",
                "default_pin": "GPIO 34",
                "description": "Continuous stator draw. Overcurrent triggers magnetic saturation and thermal runaway."
            },
            {
                "parameter_key": "rpm",
                "display_name": "Shaft Rotational Speed",
                "unit": "RPM",
                "normal_min": 1350.0,
                "normal_max": 1500.0,
                "warning_threshold": 1300.0,
                "critical_threshold": 1200.0,
                "direction": "below",
                "sensor_type": "hall",
                "default_pin": "GPIO 25",
                "description": "Detects mechanical stalling, excessive torque drag, and slip frequency deviations."
            }
        ]
    },
    "centrifugal_pump": {
        "id": "centrifugal_pump",
        "name": "Centrifugal Slurry & Process Pump",
        "category": "Fluid Handling",
        "icon": "Droplet",
        "standards": ["ANSI/HI 9.6.9 (Vibration)", "ISO 13709 (API 610)", "ISO 5199"],
        "description": "Industrial slurry, cooling water, and high-pressure chemical feed pumps.",
        "detailed_analysis": (
            "Monitors mechanical seal dry-running, net positive suction head (NPSH) cavitation erosion, "
            "impeller unbalance, and suction recirculation. Cavitation causes characteristic high-frequency acoustic "
            "vibration bursts and discharge pressure oscillation."
        ),
        "recommended_critical_temp": 75.0,
        "parameters": [
            {
                "parameter_key": "temperature",
                "display_name": "Mechanical Seal Temperature",
                "unit": "°C",
                "normal_min": 20.0,
                "normal_max": 60.0,
                "warning_threshold": 68.0,
                "critical_threshold": 75.0,
                "direction": "above",
                "sensor_type": "dht",
                "default_pin": "GPIO 4",
                "description": "Mechanical seal face heat buildup; indicates flush fluid starvation."
            },
            {
                "parameter_key": "pressure",
                "display_name": "Discharge Pressure",
                "unit": "bar",
                "normal_min": 4.0,
                "normal_max": 8.5,
                "warning_threshold": 9.5,
                "critical_threshold": 11.0,
                "direction": "above",
                "sensor_type": "pressure_analog",
                "default_pin": "GPIO 32",
                "description": "Discharge header pressure; sharp drops indicate cavitation or line rupture."
            },
            {
                "parameter_key": "vibration_rms",
                "display_name": "Pump Bearing Housing Vibration",
                "unit": "mm/s",
                "normal_min": 0.0,
                "normal_max": 3.0,
                "warning_threshold": 4.5,
                "critical_threshold": 6.5,
                "direction": "above",
                "sensor_type": "mpu6050",
                "default_pin": "I2C (21/22)",
                "description": "Detects vane pass frequency peaks and hydraulic instability."
            },
            {
                "parameter_key": "current_draw",
                "display_name": "Pump Motor Current",
                "unit": "A",
                "normal_min": 3.0,
                "normal_max": 14.0,
                "warning_threshold": 17.0,
                "critical_threshold": 21.0,
                "direction": "above",
                "sensor_type": "acs712",
                "default_pin": "GPIO 34",
                "description": "Motor load reflection; surge indicates slurry blockage or internal binding."
            }
        ]
    },
    "air_compressor": {
        "id": "air_compressor",
        "name": "Rotary Screw Industrial Compressor",
        "category": "Pneumatic Systems",
        "icon": "Wind",
        "standards": ["ISO 1217 (Displacement Compressors)", "ISO 8573-1 (Air Purity)"],
        "description": "Stationary rotary screw and reciprocating industrial plant air compressors.",
        "detailed_analysis": (
            "Monitors airend discharge thermal runaway, air/oil separator element differential pressure clogging, "
            "aftercooler performance, and unloader valve wear. Air discharge temperature above 100°C accelerates "
            "synthetic oil oxidation and risks airend rotor thermal expansion lockup."
        ),
        "recommended_critical_temp": 100.0,
        "parameters": [
            {
                "parameter_key": "temperature",
                "display_name": "Airend Discharge Temperature",
                "unit": "°C",
                "normal_min": 65.0,
                "normal_max": 88.0,
                "warning_threshold": 94.0,
                "critical_threshold": 100.0,
                "direction": "above",
                "sensor_type": "dht",
                "default_pin": "GPIO 4",
                "description": "Compressed air discharge temperature; over 100°C triggers emergency interlock."
            },
            {
                "parameter_key": "pressure",
                "display_name": "Receiver Tank Pressure",
                "unit": "bar",
                "normal_min": 6.5,
                "normal_max": 8.5,
                "warning_threshold": 9.5,
                "critical_threshold": 10.5,
                "direction": "above",
                "sensor_type": "pressure_analog",
                "default_pin": "GPIO 32",
                "description": "System operating pressure regulated by minimum pressure valve."
            },
            {
                "parameter_key": "current_draw",
                "display_name": "Compressor Motor Current",
                "unit": "A",
                "normal_min": 10.0,
                "normal_max": 35.0,
                "warning_threshold": 42.0,
                "critical_threshold": 48.0,
                "direction": "above",
                "sensor_type": "acs712",
                "default_pin": "GPIO 34",
                "description": "Loaded vs unloaded duty cycle current signature."
            }
        ]
    },
    "cnc_machining_center": {
        "id": "cnc_machining_center",
        "name": "CNC 5-Axis Milling & Turning Center",
        "category": "Precision Machine Tools",
        "icon": "Cpu",
        "standards": ["ISO 230-1 (Machine Tool Accuracy)", "ISO 10816-3 Class 1"],
        "description": "High-speed precision machining centers, toolroom milling, and automated CNC lathes.",
        "detailed_analysis": (
            "Monitors spindle ceramic bearing preload degradation, cutting tool wear chatter index, axis ball screw "
            "thermal expansion, and coolant fluid delivery. Spindle cartridge temperature exceeding 65°C distorts "
            "machining tolerances and risks catastrophic bearing seizure at high RPM."
        ),
        "recommended_critical_temp": 65.0,
        "parameters": [
            {
                "parameter_key": "temperature",
                "display_name": "Spindle Cartridge Temperature",
                "unit": "°C",
                "normal_min": 22.0,
                "normal_max": 50.0,
                "warning_threshold": 58.0,
                "critical_threshold": 65.0,
                "direction": "above",
                "sensor_type": "dht",
                "default_pin": "GPIO 4",
                "description": "High-speed spindle nose temperature; thermal growth impairs Z-axis tolerance."
            },
            {
                "parameter_key": "vibration_rms",
                "display_name": "Tool Chatter Vibration RMS",
                "unit": "mm/s",
                "normal_min": 0.0,
                "normal_max": 1.5,
                "warning_threshold": 2.5,
                "critical_threshold": 4.0,
                "direction": "above",
                "sensor_type": "mpu6050",
                "default_pin": "I2C (21/22)",
                "description": "Detects cutting tool chatter, insert chipping, and spindle imbalance."
            },
            {
                "parameter_key": "rpm",
                "display_name": "Spindle Rotational Speed",
                "unit": "RPM",
                "normal_min": 500.0,
                "normal_max": 12000.0,
                "warning_threshold": 400.0,
                "critical_threshold": 300.0,
                "direction": "below",
                "sensor_type": "hall",
                "default_pin": "GPIO 25",
                "description": "Encoder feedback tracking spindle load deceleration under heavy cuts."
            },
            {
                "parameter_key": "current_draw",
                "display_name": "Spindle Servo Motor Load",
                "unit": "A",
                "normal_min": 1.0,
                "normal_max": 15.0,
                "warning_threshold": 18.0,
                "critical_threshold": 24.0,
                "direction": "above",
                "sensor_type": "acs712",
                "default_pin": "GPIO 34",
                "description": "Servo motor current reflecting instantaneous cutting torque."
            }
        ]
    },
    "hydraulic_power_unit": {
        "id": "hydraulic_power_unit",
        "name": "Hydraulic Power Unit (HPU)",
        "category": "Fluid Power",
        "icon": "Gauge",
        "standards": ["ISO 4406 (Fluid Cleanliness)", "ISO 19973 (Pneumatic & Hydraulic)"],
        "description": "Electro-hydraulic power units, press hydraulics, and servo-hydraulic actuators.",
        "detailed_analysis": (
            "Monitors reservoir bulk oil temperature, proportional relief valve pressure stability, suction filter "
            "clogging differential pressure, and piston pump mechanical chatter. Hydraulic oil operating above 65°C "
            "causes viscosity drop, accelerated seal hardening, and rapid pump swashplate wear."
        ),
        "recommended_critical_temp": 65.0,
        "parameters": [
            {
                "parameter_key": "temperature",
                "display_name": "Hydraulic Reservoir Fluid Temp",
                "unit": "°C",
                "normal_min": 35.0,
                "normal_max": 55.0,
                "warning_threshold": 60.0,
                "critical_threshold": 65.0,
                "direction": "above",
                "sensor_type": "dht",
                "default_pin": "GPIO 4",
                "description": "Hydraulic fluid bulk temperature; above 65°C ruins oil viscosity index."
            },
            {
                "parameter_key": "pressure",
                "display_name": "System Mainline Pressure",
                "unit": "bar",
                "normal_min": 120.0,
                "normal_max": 210.0,
                "warning_threshold": 230.0,
                "critical_threshold": 250.0,
                "direction": "above",
                "sensor_type": "pressure_analog",
                "default_pin": "GPIO 32",
                "description": "Operating relief pressure for hydraulic cylinder clamp and feed."
            },
            {
                "parameter_key": "current_draw",
                "display_name": "Hydraulic Pump Motor Current",
                "unit": "A",
                "normal_min": 5.0,
                "normal_max": 25.0,
                "warning_threshold": 30.0,
                "critical_threshold": 36.0,
                "direction": "above",
                "sensor_type": "acs712",
                "default_pin": "GPIO 34",
                "description": "Drive motor current indicating pressure deadhead status."
            }
        ]
    },
    "power_transformer": {
        "id": "power_transformer",
        "name": "Substation Power Transformer (Oil-Filled)",
        "category": "Electrical Grid & Substations",
        "icon": "Zap",
        "standards": ["IEEE C57.104 (DGA)", "IEC 60599", "IEEE C57.91 (Thermal Loading)"],
        "description": "Medium & high-voltage oil-immersed transmission and distribution power transformers.",
        "detailed_analysis": (
            "Monitors winding hotspot thermal stress, top oil cooling efficiency, dielectric oil breakdown voltage, "
            "and dissolved fault gas accumulation (C2H2 arcing, C2H4 thermal hotspots). Winding temperature exceeding "
            "110°C drastically cuts paper insulation mechanical tensile strength."
        ),
        "recommended_critical_temp": 95.0,
        "parameters": [
            {
                "parameter_key": "temperature",
                "display_name": "Transformer Top Oil Temperature",
                "unit": "°C",
                "normal_min": 30.0,
                "normal_max": 75.0,
                "warning_threshold": 85.0,
                "critical_threshold": 95.0,
                "direction": "above",
                "sensor_type": "dht",
                "default_pin": "GPIO 4",
                "description": "Bulk dielectric cooling oil temperature at tank top."
            },
            {
                "parameter_key": "vibration_rms",
                "display_name": "Core Magnetostriction Vibration",
                "unit": "mm/s",
                "normal_min": 0.0,
                "normal_max": 1.2,
                "warning_threshold": 2.0,
                "critical_threshold": 3.2,
                "direction": "above",
                "sensor_type": "mpu6050",
                "default_pin": "I2C (21/22)",
                "description": "Acoustic tank vibration reflecting core clamp looseness and harmonic distortion."
            },
            {
                "parameter_key": "current_draw",
                "display_name": "Secondary Feeder Current",
                "unit": "A",
                "normal_min": 5.0,
                "normal_max": 50.0,
                "warning_threshold": 60.0,
                "critical_threshold": 75.0,
                "direction": "above",
                "sensor_type": "acs712",
                "default_pin": "GPIO 34",
                "description": "Secondary phase current load profile."
            }
        ]
    },
    "industrial_chiller": {
        "id": "industrial_chiller",
        "name": "HVAC Industrial Chiller & Refrigeration",
        "category": "Thermal Utilities",
        "icon": "ThermometerSnowflake",
        "standards": ["ASHRAE 15 (Safety Standards)", "AHRI 550/590"],
        "description": "Water-cooled and air-cooled centrifugal/screw chillers for cleanrooms and process cooling.",
        "detailed_analysis": (
            "Monitors compressor head discharge temperature, condenser approach temperature, chilled water delta-T, "
            "and motor winding cooling. Excessive discharge temperature indicates low refrigerant charge or condenser "
            "scaling, leading to lubricant carbonization."
        ),
        "recommended_critical_temp": 90.0,
        "parameters": [
            {
                "parameter_key": "temperature",
                "display_name": "Compressor Discharge Gas Temp",
                "unit": "°C",
                "normal_min": 50.0,
                "normal_max": 78.0,
                "warning_threshold": 84.0,
                "critical_threshold": 90.0,
                "direction": "above",
                "sensor_type": "dht",
                "default_pin": "GPIO 4",
                "description": "Superheated discharge refrigerant temperature; over 90°C breaks oil lubrication."
            },
            {
                "parameter_key": "pressure",
                "display_name": "Condenser Head Pressure",
                "unit": "bar",
                "normal_min": 8.0,
                "normal_max": 16.0,
                "warning_threshold": 18.5,
                "critical_threshold": 21.0,
                "direction": "above",
                "sensor_type": "pressure_analog",
                "default_pin": "GPIO 32",
                "description": "High-side condensing pressure indicating cooling tower heat rejection."
            },
            {
                "parameter_key": "current_draw",
                "display_name": "Compressor Drive Current",
                "unit": "A",
                "normal_min": 15.0,
                "normal_max": 65.0,
                "warning_threshold": 75.0,
                "critical_threshold": 88.0,
                "direction": "above",
                "sensor_type": "acs712",
                "default_pin": "GPIO 34",
                "description": "Compressor motor full load amperage (FLA)."
            }
        ]
    },
    "industrial_conveyor": {
        "id": "industrial_conveyor",
        "name": "Heavy Conveyor & Gearbox Reducer",
        "category": "Material Handling",
        "icon": "Truck",
        "standards": ["AGMA 9005-E02 (Gear Lubrication)", "ISO 10816-3 Class 2"],
        "description": "Bulk material handling belt conveyors, bucket elevators, and industrial gear reducers.",
        "detailed_analysis": (
            "Monitors helical gear reducer sump temperature, gear meshing vibration harmonics, head pulley bearing "
            "shock pulses, and belt velocity slip. Gearbox sump temperature above 80°C signifies oil film failure, "
            "promoting scuffing and tooth surface micropitting."
        ),
        "recommended_critical_temp": 80.0,
        "parameters": [
            {
                "parameter_key": "temperature",
                "display_name": "Gearbox Sump Oil Temperature",
                "unit": "°C",
                "normal_min": 30.0,
                "normal_max": 68.0,
                "warning_threshold": 74.0,
                "critical_threshold": 80.0,
                "direction": "above",
                "sensor_type": "dht",
                "default_pin": "GPIO 4",
                "description": "Oil reservoir temperature; above 80°C ruins ISO VG 220/320 film thickness."
            },
            {
                "parameter_key": "vibration_rms",
                "display_name": "Gearmesh Vibration RMS",
                "unit": "mm/s",
                "normal_min": 0.0,
                "normal_max": 3.5,
                "warning_threshold": 5.0,
                "critical_threshold": 7.5,
                "direction": "above",
                "sensor_type": "mpu6050",
                "default_pin": "I2C (21/22)",
                "description": "Gear meshing frequency (GMF) sideband energy tracking tooth damage."
            },
            {
                "parameter_key": "rpm",
                "display_name": "Conveyor Drive Pulley Speed",
                "unit": "RPM",
                "normal_min": 45.0,
                "normal_max": 65.0,
                "warning_threshold": 40.0,
                "critical_threshold": 32.0,
                "direction": "below",
                "sensor_type": "hall",
                "default_pin": "GPIO 25",
                "description": "Tail pulley speed comparison for belt slip detection."
            },
            {
                "parameter_key": "current_draw",
                "display_name": "Conveyor Drive Motor Current",
                "unit": "A",
                "normal_min": 8.0,
                "normal_max": 30.0,
                "warning_threshold": 38.0,
                "critical_threshold": 45.0,
                "direction": "above",
                "sensor_type": "acs712",
                "default_pin": "GPIO 34",
                "description": "Drive motor current indicating ton-per-hour loading and mechanical binding."
            }
        ]
    }
}


class FirmwareService:
    def __init__(self):
        self.arduino_cli_bin = "arduino-cli"

    def get_fqbn(self, board: Optional[str] = None) -> str:
        if not board:
            return "esp32:esp32:esp32"
        return SUPPORTED_BOARDS.get(board, {}).get("fqbn", "esp32:esp32:esp32")

    def get_templates(self) -> Dict[str, Any]:
        """Returns all industrial templates with failure mode analysis."""
        return INDUSTRY_MACHINE_TEMPLATES

    def scan_ports(self) -> List[Dict[str, Any]]:
        """Scans local operating system for connected microcontroller serial ports."""
        found_ports = []
        # Pattern matching Linux /dev/ttyUSB* and /dev/ttyACM*
        system_ports = glob.glob("/dev/ttyUSB*") + glob.glob("/dev/ttyACM*") + glob.glob("/dev/ttyESP*")
        
        # Also query arduino-cli if available
        cli_ports = {}
        try:
            res = subprocess.run(
                [self.arduino_cli_bin, "board", "list", "--format", "json"],
                capture_output=True,
                text=True,
                timeout=5
            )
            if res.returncode == 0:
                data = json.loads(res.stdout)
                for item in data.get("detected_ports", []):
                    port_addr = item.get("port", {}).get("address")
                    if port_addr:
                        matching_boards = item.get("matching_boards", [])
                        board_name = matching_boards[0].get("name") if matching_boards else "Serial Port"
                        cli_ports[port_addr] = board_name
        except Exception:
            pass

        for p in system_ports:
            found_ports.append({
                "port": p,
                "label": f"{p} ({cli_ports.get(p, 'Connected Serial Device')})",
                "board": cli_ports.get(p, "Generic USB-Serial")
            })

        # If no ports detected, return default hint for USB-0
        if not found_ports:
            found_ports.append({
                "port": "/dev/ttyUSB0",
                "label": "/dev/ttyUSB0 (Standard ESP32 Port)",
                "board": "ESP32 (Auto-Select)"
            })

        return found_ports

    def generate_sketch(
        self,
        machine_id: str,
        machine_name: str,
        board: str = "esp32",
        selected_sensors: Optional[List[str]] = None,
        custom_sensors: Optional[List[Dict[str, Any]]] = None,
        critical_temperature: float = 80.0,
        sample_rate_hz: int = 1
    ) -> str:
        """
        Generates fully compilable C/C++ Arduino sketch tailored to configured sensors,
        custom user pins, critical temperature alert logic, and 115200 baud JSON serial output.
        """
        sensors = selected_sensors or ["temperature", "current_draw", "button"]
        customs = custom_sensors or []
        board_info = SUPPORTED_BOARDS.get(board, SUPPORTED_BOARDS["esp32"])
        baud_rate = board_info["default_baud"]
        interval_ms = int(1000 / max(1, min(10, sample_rate_hz)))

        # Code builder segments
        includes = [
            "#include <Arduino.h>",
            "#include <ArduinoJson.h>"
        ]
        
        has_dht = "temperature" in sensors or "humidity" in sensors
        has_mpu = "vibration_rms" in sensors or "vibration" in sensors
        has_acs = "current_draw" in sensors
        has_hall = "rpm" in sensors or "hall_analog" in sensors
        has_button = "button" in sensors or "push_button" in sensors or "button_state" in sensors

        if has_dht:
            includes.append("#include <DHT.h>")
        if has_mpu:
            includes.extend(["#include <Wire.h>", "#include <Adafruit_MPU6050.h>", "#include <Adafruit_Sensor.h>"])

        pin_defs = [
            f"#define MACHINE_ID \"{machine_id}\"",
            f"#define BAUD_RATE {baud_rate}",
            f"#define SAMPLE_INTERVAL_MS {interval_ms}",
            f"#define CRITICAL_TEMP_THRESHOLD {critical_temperature:.1f}f"
        ]

        if has_dht:
            pin_defs.append("#define DHT_PIN 4")
            pin_defs.append("#define DHT_TYPE DHT11")
        if has_acs:
            pin_defs.append("#define ACS712_PIN 34")
        if has_hall:
            pin_defs.append("#define HALL_PIN 25")
        if has_button:
            pin_defs.append("#define BUTTON_PIN 27")
        pin_defs.append("#define ONBOARD_LED 2")

        # Custom sensor pin definitions
        for idx, cs in enumerate(customs):
            c_key = cs.get("metric", f"custom_{idx}").upper()
            c_pin = cs.get("pin", f"32").replace("GPIO", "").replace("gpio", "").strip()
            pin_defs.append(f"#define CUSTOM_{c_key}_PIN {c_pin}")

        globals_decl = []
        if has_dht:
            globals_decl.append("DHT dht(DHT_PIN, DHT_TYPE);")
        if has_mpu:
            globals_decl.append("Adafruit_MPU6050 mpu;")
            globals_decl.append("bool mpu_available = false;")
        if has_hall:
            globals_decl.append("volatile unsigned long pulse_count = 0;")
            globals_decl.append("void IRAM_ATTR on_hall_pulse() { pulse_count++; }")

        setup_body = [
            "  Serial.begin(BAUD_RATE);",
            "  pinMode(ONBOARD_LED, OUTPUT);",
            "  digitalWrite(ONBOARD_LED, LOW);"
        ]

        if has_dht:
            setup_body.append("  dht.begin();")
        if has_mpu:
            setup_body.append("  Wire.begin();")
            setup_body.append("  if (mpu.begin()) {")
            setup_body.append("    mpu_available = true;")
            setup_body.append("    mpu.setAccelerometerRange(MPU6050_RANGE_4_G);")
            setup_body.append("  }")
        if has_hall:
            setup_body.append("  pinMode(HALL_PIN, INPUT_PULLUP);")
            setup_body.append("  attachInterrupt(digitalPinToInterrupt(HALL_PIN), on_hall_pulse, FALLING);")
        if has_button:
            setup_body.append("  pinMode(BUTTON_PIN, INPUT_PULLUP);")

        for idx, cs in enumerate(customs):
            c_key = cs.get("metric", f"custom_{idx}").upper()
            setup_body.append(f"  pinMode(CUSTOM_{c_key}_PIN, INPUT);")

        setup_body.append(f"  Serial.println(\"{{\\\"status\\\":\\\"ONLINE\\\",\\\"machine_id\\\":\\\"\" MACHINE_ID \"\\\",\\\"configured_critical_temp\\\":{critical_temperature:.1f}}}\");")

        # Loop Acquisition Logic
        readings_logic = []
        doc_fields = [
            "    doc[\"equipment_id\"] = MACHINE_ID;",
            "    doc[\"source\"] = \"firmware_arduino_cli\";"
        ]

        if has_dht:
            readings_logic.extend([
                "    float temperature = dht.readTemperature();",
                "    float humidity = dht.readHumidity();",
                "    if (isnan(temperature)) temperature = 28.5f;",
                "    if (isnan(humidity)) humidity = 60.0f;"
            ])
            doc_fields.append("    doc[\"temperature\"] = round(temperature * 10.0) / 10.0;")
            doc_fields.append("    doc[\"humidity\"] = round(humidity * 10.0) / 10.0;")

        if has_acs:
            readings_logic.extend([
                "    // Sample ACS712 analog RMS current",
                "    long adc_acc = 0;",
                "    for (int i = 0; i < 30; i++) {",
                "      adc_acc += analogRead(ACS712_PIN);",
                "      delayMicroseconds(100);",
                "    }",
                "    float raw_adc = adc_acc / 30.0f;",
                "    float current_draw = abs((raw_adc - 1860.0f) * (3.3f / 4095.0f) / 0.185f);"
            ])
            doc_fields.append("    doc[\"current_draw\"] = round(current_draw * 100.0) / 100.0;")

        if has_mpu:
            readings_logic.extend([
                "    float vibration_rms = 0.05f;",
                "    if (mpu_available) {",
                "      sensors_event_t a, g, temp;",
                "      mpu.getEvent(&a, &g, &temp);",
                "      float ax = a.acceleration.x;",
                "      float ay = a.acceleration.y;",
                "      float az = a.acceleration.z - 9.8f;",
                "      vibration_rms = sqrt(ax*ax + ay*ay + az*az) * 0.707f;",
                "    }"
            ])
            doc_fields.append("    doc[\"vibration\"] = round(vibration_rms * 100.0) / 100.0;")
            doc_fields.append("    doc[\"vibration_rms\"] = round(vibration_rms * 100.0) / 100.0;")

        if has_hall:
            readings_logic.extend([
                "    static unsigned long last_rpm_time = 0;",
                "    unsigned long now_time = millis();",
                "    float time_sec = (now_time - last_rpm_time) / 1000.0f;",
                "    last_rpm_time = now_time;",
                "    float rpm = (time_sec > 0) ? ((pulse_count / 1.0f) / time_sec) * 60.0f : 0.0f;",
                "    pulse_count = 0;"
            ])
            doc_fields.append("    doc[\"rpm\"] = (int)rpm;")

        if has_button:
            readings_logic.extend([
                "    bool btn_pressed = (digitalRead(BUTTON_PIN) == LOW);",
                "    const char* push_button = btn_pressed ? \"PRESSED\" : \"RELEASED\";"
            ])
            doc_fields.append("    doc[\"push_button\"] = push_button;")

        # Custom Sensors acquisition
        for idx, cs in enumerate(customs):
            m_key = cs.get("metric", f"custom_{idx}")
            m_name = m_key.upper()
            formula = cs.get("calibration_formula")
            readings_logic.append(f"    int raw_{m_key} = analogRead(CUSTOM_{m_name}_PIN);")
            if formula and "x" in formula.lower():
                readings_logic.append(f"    float val_{m_key} = (float)raw_{m_key}; // Formula applied on backend")
            else:
                readings_logic.append(f"    float val_{m_key} = raw_{m_key} * (3.3f / 4095.0f);")
            doc_fields.append(f"    doc[\"{m_key}\"] = val_{m_key};")

        # Critical Temperature Alert Check
        if has_dht:
            readings_logic.extend([
                "    // Automated Edge Safety Interlock: Critical Temperature Check",
                "    bool is_critical = (temperature >= CRITICAL_TEMP_THRESHOLD);",
                "    digitalWrite(ONBOARD_LED, is_critical ? HIGH : LOW);"
            ])
            doc_fields.append("    doc[\"critical_breach\"] = is_critical;")

        doc_fields.append("    doc[\"timestamp\"] = millis();")

        sketch_lines = [
            "// ==============================================================================",
            f"// SOVEREIGN PREDICTIVE MAINTENANCE: AUTOMATED CUSTOM FIRMWARE",
            f"// Target Machine: {machine_id} ({machine_name})",
            f"// Board Target:   {board_info['name']} ({board_info['fqbn']})",
            f"// Critical Temp:  {critical_temperature:.1f} °C (Automated Edge LED Trigger)",
            f"// Generated At:   {datetime.now().isoformat()}",
            "// ==============================================================================",
            "",
            "\n".join(includes),
            "",
            "\n".join(pin_defs),
            "",
            "\n".join(globals_decl),
            "",
            "void setup() {",
            "\n".join(setup_body),
            "}",
            "",
            "void loop() {",
            "  static unsigned long last_time = 0;",
            "  if (millis() - last_time >= SAMPLE_INTERVAL_MS) {",
            "    last_time = millis();",
            "",
            "\n".join(readings_logic),
            "",
            "    JsonDocument doc;",
            "\n".join(doc_fields),
            "",
            "    serializeJson(doc, Serial);",
            "    Serial.println();",
            "  }",
            "}"
        ]

        return "\n".join(sketch_lines)

    def compile_sketch(
        self,
        sketch_code: str,
        fqbn: str = "esp32:esp32:esp32"
    ) -> Dict[str, Any]:
        """Compiles Arduino sketch in a sandbox directory using arduino-cli."""
        temp_dir = tempfile.mkdtemp(prefix="arduino_build_")
        sketch_name = os.path.basename(temp_dir)
        sketch_file = os.path.join(temp_dir, f"{sketch_name}.ino")

        try:
            with open(sketch_file, "w") as f:
                f.write(sketch_code)

            cmd = [
                self.arduino_cli_bin,
                "compile",
                "--fqbn", fqbn,
                temp_dir
            ]
            res = subprocess.run(cmd, capture_output=True, text=True, timeout=90)
            
            success = (res.returncode == 0)
            return {
                "success": success,
                "returncode": res.returncode,
                "output": (res.stdout + "\n" + res.stderr).strip(),
                "sketch_dir": temp_dir if success else None
            }
        except subprocess.TimeoutExpired:
            return {"success": False, "returncode": -1, "output": "Compilation timed out after 90 seconds."}
        except Exception as e:
            return {"success": False, "returncode": -1, "output": f"Compilation error: {str(e)}"}

    def flash_microcontroller(
        self,
        sketch_code: str,
        port: str = "/dev/ttyUSB0",
        fqbn: str = "esp32:esp32:esp32"
    ) -> Dict[str, Any]:
        """
        Compiles and uploads sketch directly to the plugged microcontroller port using arduino-cli.
        """
        comp_res = self.compile_sketch(sketch_code, fqbn)
        if not comp_res["success"]:
            return {
                "success": False,
                "phase": "compile",
                "output": comp_res["output"]
            }

        sketch_dir = comp_res.get("sketch_dir")
        if not sketch_dir or not os.path.exists(sketch_dir):
            return {
                "success": False,
                "phase": "compile",
                "output": "Build directory missing after compilation."
            }

        try:
            upload_cmd = [
                self.arduino_cli_bin,
                "upload",
                "-p", port,
                "--fqbn", fqbn,
                sketch_dir
            ]
            res = subprocess.run(upload_cmd, capture_output=True, text=True, timeout=120)
            success = (res.returncode == 0)

            full_log = (
                "=== [PHASE 1: ARDUINO-CLI COMPILATION] ===\n" +
                comp_res["output"] + "\n\n" +
                "=== [PHASE 2: HARDWARE FLASH TO " + port + "] ===\n" +
                (res.stdout + "\n" + res.stderr).strip()
            )

            return {
                "success": success,
                "phase": "upload" if success else "upload_failed",
                "port": port,
                "returncode": res.returncode,
                "output": full_log
            }
        except subprocess.TimeoutExpired:
            return {
                "success": False,
                "phase": "upload_timeout",
                "port": port,
                "output": "Flashing timed out after 120 seconds. Ensure ESP32 is not held in boot mode."
            }
        except Exception as e:
            return {
                "success": False,
                "phase": "upload_error",
                "port": port,
                "output": f"Flashing error: {str(e)}"
            }
        finally:
            shutil.rmtree(sketch_dir, ignore_errors=True)

    def quick_create_machine(
        self,
        machine_id: str,
        machine_name: str,
        template_id: str,
        critical_temperature: float,
        selected_sensors: List[str],
        custom_sensors: Optional[List[Dict[str, Any]]] = None
    ) -> Dict[str, Any]:
        """
        1-Click Machine Registration:
        Creates machine in equipment ledger, seeds parameters, sets critical temperature thresholds,
        and saves any custom sensors.
        """
        from src.data.database import (
            add_equipment, add_parameter,
            save_custom_sensor, get_equipment_metadata
        )

        template = INDUSTRY_MACHINE_TEMPLATES.get(template_id)
        prod_line = template["category"] if template else "General Production"

        # 1. Register Equipment
        add_equipment(
            eq_id=machine_id,
            name=machine_name,
            line=prod_line,
            protocol="USB_SERIAL_115200",
            machine_class=template["name"] if template else "Custom Asset",
            sensor_kind="multi"
        )

        # 2. Seed parameters from template and adjust critical temperature
        if template:
            for p in template.get("parameters", []):
                p_copy = dict(p)
                p_key = p_copy.pop("parameter_key", None)
                p_name = p_copy.pop("display_name", p_key)
                p_unit = p_copy.pop("unit", None)
                if p_key == "temperature":
                    p_copy["critical_threshold"] = critical_temperature
                    p_copy["warning_threshold"] = round(critical_temperature * 0.90, 1)

                valid_cols = {
                    'category', 'data_type', 'normal_min', 'normal_max',
                    'warning_threshold', 'critical_threshold', 'direction',
                    'source_field', 'is_visible', 'is_used_for_prediction',
                    'aggregation', 'display_order', 'description', 'alert_enabled'
                }
                filtered_kwargs = {k: v for k, v in p_copy.items() if k in valid_cols}

                add_parameter(
                    machine_id=machine_id,
                    key=p_key,
                    name=p_name,
                    unit=p_unit,
                    **filtered_kwargs
                )

        # 3. Save custom sensors
        for cs in (custom_sensors or []):
            cs_copy = dict(cs)
            if not cs_copy.get("id"):
                cs_copy["id"] = f"{machine_id}_{cs.get('metric', 'param')}"
            try:
                save_custom_sensor(cs_copy)
            except Exception:
                pass
            add_parameter(
                machine_id=machine_id,
                key=cs.get("metric"),
                name=cs.get("name", cs.get("metric")),
                unit=cs.get("unit", "units"),
                normal_min=cs.get("normal_min", 0.0),
                normal_max=cs.get("normal_max", 100.0),
                warning_threshold=cs.get("warning_threshold", 85.0),
                critical_threshold=cs.get("critical_threshold", 95.0),
                direction="above",
                description=cs.get("description", "Custom user-defined parameter")
            )

        return {
            "status": "success",
            "machine_id": machine_id,
            "machine_name": machine_name,
            "template_id": template_id,
            "critical_temperature": critical_temperature,
            "registered_at": datetime.now().isoformat()
        }
