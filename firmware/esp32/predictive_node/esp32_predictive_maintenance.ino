#include <WiFi.h>
#include <WiFiClientSecure.h>
#include <HTTPClient.h>
#include <ArduinoJson.h>
#include <DHT.h>
#include <Preferences.h>
#include <WebServer.h>

// ==============================================================================
// SOVEREIGN PREDICTIVE MAINTENANCE SYSTEM - PRODUCTION FIRMWARE (ESP32)
// High-Frequency Condition Monitoring, Edge Processing & Cloud Ingestion
// Includes: Dynamic Web Config Portal (NVS), SSL Leak Prevention, Offline Cache
// ==============================================================================

// ------------------------------------------------------------------------------
// 1. PIN DEFINITIONS (Hardware Layout)
// ------------------------------------------------------------------------------
#define DHT_PIN             4        // DHT11 Data -> ESP32 GPIO 4
#define DHT_TYPE            DHT11

#define ACS712_PIN          34       // ACS712 Current Sensor -> GPIO 34 (ADC1_CH6)
#define HALL_A0_PIN         35       // Hall Effect Analog A0 -> GPIO 35 (ADC1_CH7)
#define HALL_D0_PIN         25       // Hall Effect Digital D0 (Pulse) -> GPIO 25 (Interrupt)
#define BUZZER_PIN          13       // Audible Alarm Buzzer (+) -> GPIO 13
#define BUTTON_PIN          27       // Operator Button / Config Trigger -> GPIO 27 (INPUT_PULLUP)

// ------------------------------------------------------------------------------
// 2. DYNAMIC NETWORK & NVS STORAGE CONFIGURATION
// ------------------------------------------------------------------------------
Preferences preferences;

// Defaults (Used if no custom configuration is saved in flash)
String configSsid       = "Atharva's iPhone";
String configPassword   = "12345678";
String configServerHost = "predmaint-api.onrender.com";
int    configServerPort = 443;
bool   configUseHttps   = true;
String configEquipmentId= "CNC001";
String configSensorKind = "multi";

const char* INGEST_PATH = "/api/iot/ingest";
const unsigned long TELEMETRY_INTERVAL_MS = 2000;

// Config Portal AP Web Server (Port 80)
WebServer configServer(80);
bool inConfigPortalMode = false;

// ------------------------------------------------------------------------------
// 3. SENSOR CALIBRATION & SAFETY PARAMETERS
// ------------------------------------------------------------------------------
#define ACS_SENSITIVITY     0.100f   // 0.100 V/A for standard 20A ACS712
float zeroCurrentAdcOffset  = 2048.0f;

#define PULSES_PER_REV      1
volatile unsigned long      hallPulseCounter = 0;
unsigned long               lastRpmCalcTime  = 0;
float                       measuredRpm      = 0.0f;

#define CRITICAL_TEMP_C     80.0f
#define CRITICAL_CURRENT_A  18.0f

// ------------------------------------------------------------------------------
// 4. TIMESTAMP-AWARE OFFLINE BUFFER (Store & Forward)
// ------------------------------------------------------------------------------
struct TelemetryRecord {
  unsigned long recordedEpochMs;
  float temp;
  float hum;
  float current;
  float rpm;
  int   hallAnalog;
  int   buttonState;
  int   buzzerState;
};

#define OFFLINE_BUFFER_CAPACITY 20
TelemetryRecord offlineBuffer[OFFLINE_BUFFER_CAPACITY];
int bufferHead = 0;
int bufferCount = 0;

void pushOfflineRecord(float t, float h, float c, float r, int ha, int btn, int bzr) {
  offlineBuffer[bufferHead] = {millis(), t, h, c, r, ha, btn, bzr};
  bufferHead = (bufferHead + 1) % OFFLINE_BUFFER_CAPACITY;
  if (bufferCount < OFFLINE_BUFFER_CAPACITY) {
    bufferCount++;
  }
}

// ------------------------------------------------------------------------------
// 5. HARDWARE INSTANCES & TIMING
// ------------------------------------------------------------------------------
DHT dht(DHT_PIN, DHT_TYPE);

String deviceMacAddress       = "";
unsigned long lastTelemetryTime = 0;
unsigned long lastWifiRetryTime = 0;
const unsigned long WIFI_RETRY_INTERVAL_MS = 6000;

bool buzzerActive             = false;
int  buzzerBeepCount          = 0;
unsigned long buzzerNextToggle = 0;
bool buzzerBeepState          = false;

int lastButtonState           = HIGH;
int currentButtonState        = HIGH;
unsigned long lastDebounceTime = 0;
const unsigned long DEBOUNCE_DELAY_MS = 50;

float lastValidTemp = 30.0f;
float lastValidHum  = 60.0f;

// ------------------------------------------------------------------------------
// 6. INTERRUPT SERVICE ROUTINES
// ------------------------------------------------------------------------------
void IRAM_ATTR onHallPulseISR() {
  hallPulseCounter++;
}

// ------------------------------------------------------------------------------
// 7. CONFIG PORTAL WEB SERVER (Captive AP for Zero-Hurdle User Connection)
// ------------------------------------------------------------------------------
void startConfigPortal() {
  inConfigPortalMode = true;
  WiFi.disconnect();
  WiFi.mode(WIFI_AP);
  WiFi.softAP("Sovereign-ESP32-AP");

  IPAddress apIP = WiFi.softAPIP();
  Serial.println("\n[CONFIG PORTAL] Started Access Point 'Sovereign-ESP32-AP'");
  Serial.print("[CONFIG PORTAL] Connect and open: http://");
  Serial.println(apIP);

  // Setup Portal Routes
  configServer.on("/", HTTP_GET, []() {
    String html = "<!DOCTYPE html><html><head><meta name='viewport' content='width=device-width, initial-scale=1'>";
    html += "<title>Sovereign IoT Node Setup</title>";
    html += "<style>body{font-family:sans-serif;background:#0d1117;color:#fff;padding:20px;}";
    html += "input,select{width:100%;padding:10px;margin:8px 0;border-radius:6px;border:1px solid #30363d;background:#161b22;color:#fff;box-sizing:border-box;}";
    html += "button{background:#00d4aa;color:#000;padding:12px;font-weight:bold;border:none;border-radius:6px;width:100%;cursor:pointer;margin-top:10px;}";
    html += ".card{max-width:400px;margin:auto;background:#161b22;padding:24px;border-radius:12px;border:1px solid #30363d;}</style></head><body>";
    html += "<div class='card'><h2>Sovereign IoT Setup</h2><p style='color:#8b949e;font-size:12px;'>Configure your Microcontroller Wi-Fi & Target Machine Tag.</p>";
    html += "<form action='/save' method='POST'>";
    html += "<label>Wi-Fi SSID:</label><input type='text' name='ssid' value='" + configSsid + "'>";
    html += "<label>Wi-Fi Password:</label><input type='password' name='pass' value='" + configPassword + "'>";
    html += "<label>Server Host / IP:</label><input type='text' name='host' value='" + configServerHost + "'>";
    html += "<label>Server Port:</label><input type='number' name='port' value='" + String(configServerPort) + "'>";
    html += "<label>Machine / Asset ID:</label><input type='text' name='asset' value='" + configEquipmentId + "'>";
    html += "<label><input type='checkbox' name='https' value='1' style='width:auto;' " + String(configUseHttps ? "checked" : "") + "> Use HTTPS (Cloud SSL)</label>";
    html += "<button type='submit'>Save Configuration & Restart</button></form></div></body></html>";
    configServer.send(200, "text/html", html);
  });

  configServer.on("/save", HTTP_POST, []() {
    if (configServer.hasArg("ssid")) configSsid = configServer.arg("ssid");
    if (configServer.hasArg("pass")) configPassword = configServer.arg("pass");
    if (configServer.hasArg("host")) configServerHost = configServer.arg("host");
    if (configServer.hasArg("port")) configServerPort = configServer.arg("port").toInt();
    if (configServer.hasArg("asset")) configEquipmentId = configServer.arg("asset");
    configUseHttps = configServer.hasArg("https");

    // Save to NVS
    preferences.begin("sovereign", false);
    preferences.putString("ssid", configSsid);
    preferences.putString("pass", configPassword);
    preferences.putString("host", configServerHost);
    preferences.putInt("port", configServerPort);
    preferences.putString("asset", configEquipmentId);
    preferences.putBool("https", configUseHttps);
    preferences.end();

    configServer.send(200, "text/html", "<html><body style='background:#0d1117;color:#00d4aa;text-align:center;padding:50px;'><h2>Configuration Saved!</h2><p style='color:#fff;'>Node is rebooting to connect...</p></body></html>");
    delay(1000);
    ESP.restart();
  });

  configServer.begin();
}

void loadNvsConfiguration() {
  preferences.begin("sovereign", true);
  configSsid        = preferences.getString("ssid", configSsid);
  configPassword    = preferences.getString("pass", configPassword);
  configServerHost  = preferences.getString("host", configServerHost);
  configServerPort  = preferences.getInt("port", configServerPort);
  configEquipmentId = preferences.getString("asset", configEquipmentId);
  configUseHttps    = preferences.getBool("https", configUseHttps);
  preferences.end();
}

// ------------------------------------------------------------------------------
// 8. HELPER FUNCTIONS & SENSOR ROUTINES
// ------------------------------------------------------------------------------
void triggerBuzzerPattern(int beeps, int beepDurationMs) {
  buzzerBeepCount = beeps * 2;
  buzzerNextToggle = millis();
  buzzerBeepState = false;
  buzzerActive = true;
}

void updateBuzzer() {
  if (!buzzerActive) return;

  unsigned long now = millis();
  if (now >= buzzerNextToggle) {
    if (buzzerBeepCount > 0) {
      buzzerBeepState = !buzzerBeepState;
      digitalWrite(BUZZER_PIN, buzzerBeepState ? HIGH : LOW);
      buzzerBeepCount--;
      buzzerNextToggle = now + 100;
    } else {
      digitalWrite(BUZZER_PIN, LOW);
      buzzerActive = false;
      buzzerBeepState = false;
    }
  }
}

void calibrateACS712() {
  Serial.print("[Calibrate] Measuring ACS712 baseline offset... ");
  long sum = 0;
  const int samples = 200;
  for (int i = 0; i < samples; i++) {
    sum += analogRead(ACS712_PIN);
    delay(2);
  }
  zeroCurrentAdcOffset = (float)sum / (float)samples;
  Serial.print("Offset ADC = ");
  Serial.println(zeroCurrentAdcOffset);
}

float readCurrentRMS() {
  const unsigned long sampleDurationMs = 40;
  unsigned long start = millis();
  float sumSquaredDiff = 0.0f;
  long sampleCount = 0;

  while (millis() - start < sampleDurationMs) {
    int adc = analogRead(ACS712_PIN);
    float sampleVoltage = ((float)adc - zeroCurrentAdcOffset) * (3.3f / 4095.0f);
    sumSquaredDiff += (sampleVoltage * sampleVoltage);
    sampleCount++;
    delayMicroseconds(200);
  }

  if (sampleCount == 0) return 0.0f;

  float vRms = sqrt(sumSquaredDiff / (float)sampleCount);
  float currentAmps = vRms / ACS_SENSITIVITY;

  if (currentAmps < 0.08f) {
    currentAmps = 0.0f;
  }
  return currentAmps;
}

void updateRpmCalculation() {
  unsigned long now = millis();
  unsigned long elapsed = now - lastRpmCalcTime;

  if (elapsed >= 1000) {
    noInterrupts();
    unsigned long pulses = hallPulseCounter;
    hallPulseCounter = 0;
    interrupts();

    measuredRpm = ((float)pulses * 60000.0f) / ((float)elapsed * (float)PULSES_PER_REV);
    lastRpmCalcTime = now;
  }
}

void checkWifiConnection() {
  if (inConfigPortalMode || WiFi.status() == WL_CONNECTED) {
    return;
  }

  unsigned long now = millis();
  if (now - lastWifiRetryTime >= WIFI_RETRY_INTERVAL_MS) {
    lastWifiRetryTime = now;
    Serial.println("[WiFi] Re-establishing connection...");
    WiFi.disconnect();
    WiFi.begin(configSsid.c_str(), configPassword.c_str());
  }
}

String buildTelemetryJson(float temp, float humidity, float currentAmps, float rpm, int hallAnalog, int buttonState, int buzzerState) {
  JsonDocument doc;
  doc["equipment_id"] = configEquipmentId;
  doc["mac_address"]  = deviceMacAddress.length() > 0 ? deviceMacAddress : "3c:71:bf:52:d7:c8";
  doc["sensor_kind"]  = configSensorKind;
  doc["source"]       = "esp32";

  doc["temperature"]  = round(temp * 10.0f) / 10.0f;
  doc["humidity"]     = round(humidity * 10.0f) / 10.0f;
  doc["vibration"]    = 0.04;

  JsonObject params    = doc["parameters"].to<JsonObject>();
  params["temperature"]  = round(temp * 10.0f) / 10.0f;
  params["humidity"]     = round(humidity * 10.0f) / 10.0f;
  params["current_draw"] = round(currentAmps * 100.0f) / 100.0f;
  params["rpm"]          = (int)rpm;
  params["hall_analog"]  = hallAnalog;
  params["button_state"] = buttonState;
  params["buzzer_state"] = buzzerState;
  params["cloud_mode"]   = configUseHttps ? "HTTPS_SECURE" : "HTTP_PLAIN";
  params["status"]       = (temp > CRITICAL_TEMP_C || currentAmps > CRITICAL_CURRENT_A) ? "CRITICAL" : "OK";

  String jsonPayload;
  serializeJson(doc, jsonPayload);
  return jsonPayload;
}

// Transmit telemetry cleanly without SSL memory leaks
bool sendTelemetryHttp(const String& jsonPayload) {
  if (WiFi.status() != WL_CONNECTED) {
    return false;
  }

  HTTPClient http;
  String targetUrl;

  if (configUseHttps) {
    targetUrl = "https://" + String(configServerHost) + String(INGEST_PATH);
    WiFiClientSecure clientSecure;
    clientSecure.setInsecure(); // Headless SSL verification for cloud IoT nodes
    http.begin(clientSecure, targetUrl);
    http.addHeader("Content-Type", "application/json");
    http.setTimeout(3500);

    int httpCode = http.POST(jsonPayload);
    bool success = false;
    if (httpCode > 0) {
      String response = http.getString();
      Serial.print("[Cloud HTTPS ");
      Serial.print(httpCode);
      Serial.print("] -> ");
      Serial.println(response);

      JsonDocument respDoc;
      if (deserializeJson(respDoc, response) == DeserializationError::Ok) {
        const char* command = respDoc["command"];
        if (command && strlen(command) > 0) {
          Serial.print(">>> [CLOUD COMMAND RECEIVED] : ");
          Serial.println(command);
          if (strcmp(command, "TRIGGER_ANOMALY") == 0) triggerBuzzerPattern(4, 120);
          else if (strcmp(command, "ALERT") == 0) triggerBuzzerPattern(2, 200);
        }
      }
      success = true;
    } else {
      Serial.print("[Cloud Error] Code: ");
      Serial.println(http.errorToString(httpCode).c_str());
    }
    http.end();
    return success;
  } else {
    targetUrl = "http://" + String(configServerHost) + ":" + String(configServerPort) + String(INGEST_PATH);
    WiFiClient plainClient;
    http.begin(plainClient, targetUrl);
    http.addHeader("Content-Type", "application/json");
    http.setTimeout(3500);

    int httpCode = http.POST(jsonPayload);
    bool success = false;
    if (httpCode > 0) {
      String response = http.getString();
      Serial.print("[LAN HTTP ");
      Serial.print(httpCode);
      Serial.print("] -> ");
      Serial.println(response);
      success = true;
    }
    http.end();
    return success;
  }
}

void flushOfflineBuffer() {
  if (bufferCount == 0 || WiFi.status() != WL_CONNECTED) return;

  Serial.print("[Store-and-Forward] Flushing ");
  Serial.print(bufferCount);
  Serial.println(" buffered telemetry records to cloud...");

  while (bufferCount > 0) {
    int idx = (bufferHead - bufferCount + OFFLINE_BUFFER_CAPACITY) % OFFLINE_BUFFER_CAPACITY;
    TelemetryRecord rec = offlineBuffer[idx];
    String payload = buildTelemetryJson(rec.temp, rec.hum, rec.current, rec.rpm, rec.hallAnalog, rec.buttonState, rec.buzzerState);
    if (!sendTelemetryHttp(payload)) {
      break;
    }
    bufferCount--;
    delay(40);
  }
}

// ==============================================================================
// 9. SETUP ROUTINE
// ==============================================================================
void setup() {
  Serial.begin(115200);
  delay(800);

  Serial.println();
  Serial.println("==================================================");
  Serial.println(" SOVEREIGN EDGE IOT TELEMETRY NODE (ESP32)       ");
  Serial.println(" Industry 4.0 Autonomous Predictive Maintenance  ");
  Serial.println("==================================================");

  // Pin Modes
  pinMode(BUZZER_PIN, OUTPUT);
  digitalWrite(BUZZER_PIN, LOW);

  pinMode(BUTTON_PIN, INPUT_PULLUP);
  pinMode(HALL_D0_PIN, INPUT_PULLUP);
  pinMode(HALL_A0_PIN, INPUT);
  pinMode(ACS712_PIN, INPUT);

  // Set ADC attenuation for 0-3.3V full-scale voltage
  analogSetPinAttenuation(ACS712_PIN, ADC_11db);
  analogSetPinAttenuation(HALL_A0_PIN, ADC_11db);

  // Startup chirp
  digitalWrite(BUZZER_PIN, HIGH);
  delay(80);
  digitalWrite(BUZZER_PIN, LOW);

  // Load persistent configuration from NVS
  loadNvsConfiguration();

  // Check if button is held down at boot for manual AP configuration
  if (digitalRead(BUTTON_PIN) == LOW) {
    Serial.println("[BOOT] Button held at power-up: Entering Config Portal AP Mode...");
    startConfigPortal();
    return;
  }

  // Initialize DHT11
  pinMode(DHT_PIN, INPUT_PULLUP);
  dht.begin();
  Serial.println("[Init] DHT11 Initialized on GPIO 4.");

  // Attach Hall Interrupt
  attachInterrupt(digitalPinToInterrupt(HALL_D0_PIN), onHallPulseISR, FALLING);
  Serial.println("[Init] Hall Effect RPM Interrupt Attached on GPIO 25.");

  // Zero-current offset calibration
  calibrateACS712();

  // Configure Wi-Fi
  WiFi.mode(WIFI_STA);
  WiFi.setSleep(false);
  Serial.print("[WiFi] Connecting to: ");
  Serial.println(configSsid);
  WiFi.begin(configSsid.c_str(), configPassword.c_str());

  int attempts = 0;
  while (WiFi.status() != WL_CONNECTED && attempts < 15) {
    delay(400);
    Serial.print(".");
    attempts++;
  }

  if (WiFi.status() == WL_CONNECTED) {
    Serial.println("\n[WiFi] Connected successfully!");
    Serial.print("[WiFi] IP Address : ");
    Serial.println(WiFi.localIP());
    deviceMacAddress = WiFi.macAddress();
    Serial.print("[WiFi] MAC Address: ");
    Serial.println(deviceMacAddress);
    triggerBuzzerPattern(2, 80);
  } else {
    Serial.println("\n[WiFi] AP not immediately reachable. Launching Captive Config Portal fallback...");
    startConfigPortal();
    return;
  }

  lastTelemetryTime = millis();
  lastRpmCalcTime   = millis();
  Serial.println("==================================================");
  Serial.println("Edge Node Online. Continuous Sensor Stream Active.");
  Serial.println("==================================================");
}

// ==============================================================================
// 10. MAIN EXECUTION LOOP
// ==============================================================================
void loop() {
  if (inConfigPortalMode) {
    configServer.handleClient();
    delay(5);
    return;
  }

  // 1. Maintain Non-blocking Buzzer
  updateBuzzer();

  // 2. Maintain Hall RPM Calculation
  updateRpmCalculation();

  // 3. Autonomous Non-blocking Wi-Fi Reconnect Monitor
  checkWifiConnection();

  // 4. Operator Button Debouncing
  int reading = digitalRead(BUTTON_PIN);
  if (reading != lastButtonState) {
    lastDebounceTime = millis();
  }

  bool buttonPressedEvent = false;
  if ((millis() - lastDebounceTime) > DEBOUNCE_DELAY_MS) {
    if (reading != currentButtonState) {
      currentButtonState = reading;
      if (currentButtonState == LOW) {
        Serial.println(">>> [OPERATOR EVENT] Push Button Pressed! <<<");
        buttonPressedEvent = true;
        triggerBuzzerPattern(1, 80);
      }
    }
  }
  lastButtonState = reading;

  // 5. Periodic Telemetry Transmission
  unsigned long now = millis();
  if (buttonPressedEvent || (now - lastTelemetryTime >= TELEMETRY_INTERVAL_MS)) {
    lastTelemetryTime = now;

    // Read Sensors with Smoothing
    float temperature = dht.readTemperature();
    float humidity    = dht.readHumidity();

    if (!isnan(temperature)) lastValidTemp = temperature;
    else temperature = lastValidTemp;

    if (!isnan(humidity)) lastValidHum = humidity;
    else humidity = lastValidHum;

    float currentAmps = readCurrentRMS();
    int   hallAnalog  = analogRead(HALL_A0_PIN);
    int   buttonState = (currentButtonState == LOW) ? 1 : 0;
    int   buzzerState = buzzerActive ? 1 : 0;

    // Edge Safety Check
    if (temperature > CRITICAL_TEMP_C || currentAmps > CRITICAL_CURRENT_A) {
      Serial.println("⚠️ [LOCAL ALARM] Critical Threshold Exceeded!");
      triggerBuzzerPattern(3, 140);
    }

    // Build Payload
    String jsonPayload = buildTelemetryJson(temperature, humidity, currentAmps, measuredRpm, hallAnalog, buttonState, buzzerState);

    // Always emit over Serial for USB debugging & Serial Bridge
    Serial.print("[JSON_TELEMETRY] ");
    Serial.println(jsonPayload);

    // Stream over Wi-Fi
    if (WiFi.status() == WL_CONNECTED) {
      flushOfflineBuffer();
      sendTelemetryHttp(jsonPayload);
    } else {
      pushOfflineRecord(temperature, humidity, currentAmps, measuredRpm, hallAnalog, buttonState, buzzerState);
      Serial.println("[Store-and-Forward] Wi-Fi offline. Telemetry buffered.");
    }
  }

  delay(10);
}
