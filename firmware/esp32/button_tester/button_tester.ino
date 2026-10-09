#include <Arduino.h>

#define BUTTON_PIN 27 // GPIO 27

void setup() {
  Serial.begin(115200);
  delay(1000);
  pinMode(BUTTON_PIN, INPUT_PULLUP);
  Serial.println("\n--- GPIO 27 LIVE BUTTON TESTER ---");
  Serial.println("Monitoring GPIO 27 state continuously...\n");
}

int lastState = -1;
unsigned long lastPrint = 0;

void loop() {
  int currentState = digitalRead(BUTTON_PIN);
  
  // Print on state change or every 1 second
  if (currentState != lastState || millis() - lastPrint > 1000) {
    lastState = currentState;
    lastPrint = millis();
    
    if (currentState == LOW) {
      Serial.println("[STATE] Pin 27 = 0 (LOW)  --> DETECTED PRESSED / CONNECTED TO GND");
    } else {
      Serial.println("[STATE] Pin 27 = 1 (HIGH) --> DETECTED RELEASED / PULL-UP HIGH (Idle)");
    }
  }
  delay(50);
}
