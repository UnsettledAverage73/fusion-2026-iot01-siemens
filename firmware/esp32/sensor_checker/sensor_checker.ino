#include <Arduino.h>
#include <DHT.h>

// Pin Definitions matching your configuration
#define DHT_PIN          4        // DHT11 Data -> GPIO 4
#define DHT_TYPE         DHT11

#define ACS712_PIN       34       // Current Sensor -> GPIO 34 (ADC1_CH6)
#define HALL_A0_PIN      35       // Hall Analog -> GPIO 35 (ADC1_CH7)
#define HALL_D0_PIN      25       // Hall Digital -> GPIO 25 (Interrupt)
#define BUZZER_PIN       13       // Buzzer -> GPIO 13
#define BUTTON_PIN       27       // Push Button -> GPIO 27 (INPUT_PULLUP)

DHT dht(DHT_PIN, DHT_TYPE);

volatile unsigned long hallPulses = 0;
void IRAM_ATTR onHallPulse() {
  hallPulses++;
}

void setup() {
  Serial.begin(115200);
  delay(1000);

  Serial.println("\n\n========================================================");
  Serial.println("   ESP32 REAL-TIME HARDWARE DIAGNOSTICS & PIN CHECKER   ");
  Serial.println("========================================================");

  // Initialize Buzzer
  pinMode(BUZZER_PIN, OUTPUT);
  Serial.print("[TEST] Testing Piezo Buzzer on GPIO 13 (Short Beep)... ");
  digitalWrite(BUZZER_PIN, HIGH);
  delay(150);
  digitalWrite(BUZZER_PIN, LOW);
  Serial.println("DONE. (Did you hear a beep?)");

  // Initialize Button
  pinMode(BUTTON_PIN, INPUT_PULLUP);

  // Initialize Hall Sensor
  pinMode(HALL_D0_PIN, INPUT_PULLUP);
  pinMode(HALL_A0_PIN, INPUT);
  attachInterrupt(digitalPinToInterrupt(HALL_D0_PIN), onHallPulse, FALLING);

  // Initialize Current Sensor
  pinMode(ACS712_PIN, INPUT);

  // Initialize DHT
  pinMode(DHT_PIN, INPUT_PULLUP);
  dht.begin();
  Serial.println("[Init] Allowing 2.0s for DHT11 sensor internal stabilization...");
  delay(2000);

  Serial.println("\nStarting continuous sensor diagnostic loop...\n");
}

void loop() {
  Serial.println("------------- [HARDWARE DIAGNOSTIC REPORT] -------------");

  // 1. Check DHT11 (with instant retry to filter single-wire jitter)
  float temp = dht.readTemperature();
  float hum = dht.readHumidity();
  if (isnan(temp) || isnan(hum)) {
    delay(200);
    temp = dht.readTemperature();
    hum = dht.readHumidity();
  }
  if (isnan(temp) || isnan(hum)) {
    int pinVoltAdc = analogRead(DHT_PIN);
    int pinDigital = digitalRead(DHT_PIN);
    Serial.println("  ❌ DHT11 (GPIO 4): NOT DETECTED / READ ERROR");
    Serial.print("     -> Pin Electrical State: Digital = ");
    Serial.print(pinDigital == HIGH ? "HIGH (3.3V)" : "LOW (0V / Ground)");
    Serial.print(" | ADC = ");
    Serial.println(pinVoltAdc);

    if (pinDigital == LOW) {
      Serial.println("     ⚠️ ROOT CAUSE: Line is stuck LOW (0V / GND).");
      Serial.println("        • Check module pinout: Many 3-pin modules are [S, +, -] NOT [+, out, -]!");
      Serial.println("        • If DATA is accidentally connected to GND, the line is shorted.");
      Serial.println("        • Check if VCC is disconnected (unpowered sensor pulls line LOW).");
    } else {
      Serial.println("     ⚠️ ROOT CAUSE: Line is HIGH (pull-up active), but sensor does not respond.");
      Serial.println("        • Power DHT11 from VIN (5V) instead of 3.3V (most clone DHT11 require >3.5V to operate!).");
      Serial.println("        • Verify wire is firmly in GPIO 4 (marked 'D4' or 'G4' on ESP32 board).");
      Serial.println("        • If 4-pin bare sensor: Add a 4.7k-10k resistor between VCC and DATA.");
    }
  } else {
    Serial.print("  ✅ DHT11 (GPIO 4): CONNECTED & WORKING | Temp: ");
    Serial.print(temp, 1);
    Serial.print(" °C | Humidity: ");
    Serial.print(hum, 1);
    Serial.println(" %");
  }

  // 2. Check ACS712 Current Sensor
  int acsAdc = analogRead(ACS712_PIN);
  float acsVolt = acsAdc * (3.3f / 4095.0f);
  Serial.print("  📊 ACS712 Current (GPIO 34): Raw ADC = ");
  Serial.print(acsAdc);
  Serial.print(" (");
  Serial.print(acsVolt, 2);
  Serial.print(" V)");
  if (acsAdc < 100) {
    Serial.println(" -> WARNING: Very low/floating or GND. Ensure VCC is connected to VIN/5V.");
  } else if (acsAdc > 4000) {
    Serial.println(" -> WARNING: High/Saturated ADC. Check wiring.");
  } else {
    Serial.println(" -> ✅ SIGNAL DETECTED (Quiescent baseline active)");
  }

  // 3. Check Hall Effect Sensor
  int hallD0State = digitalRead(HALL_D0_PIN);
  int hallA0Adc = analogRead(HALL_A0_PIN);
  noInterrupts();
  unsigned long pulses = hallPulses;
  interrupts();

  Serial.print("  🧲 Hall Effect Sensor: D0 (GPIO 25) = ");
  Serial.print(hallD0State == HIGH ? "HIGH (No Magnet)" : "LOW (Magnet Present)");
  Serial.print(" | Total Pulses = ");
  Serial.print(pulses);
  Serial.print(" | A0 (GPIO 35) ADC = ");
  Serial.println(hallA0Adc);

  // 4. Check Button
  int btnState = digitalRead(BUTTON_PIN);
  Serial.print("  🔘 Push Button (GPIO 27): ");
  if (btnState == LOW) {
    Serial.println("PRESSED [LOW] (Working!)");
  } else {
    Serial.println("RELEASED [HIGH] (Pull-up healthy, press button to test)");
  }

  Serial.println("--------------------------------------------------------\n");
  delay(2000);
}
