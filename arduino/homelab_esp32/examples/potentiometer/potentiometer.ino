/*
 * HomeLab ESP32 — Potentiometer (Analog Input)
 * ==============================================
 * Reads a potentiometer (or any analog sensor) and sends the value
 * to the HomeLab dashboard every 2 seconds.
 *
 * No extra libraries needed — just PubSubClient.
 *
 * Wiring:
 *   Pot left leg  → GND
 *   Pot middle leg → GPIO 34  (analog input — change POT_PIN below if different)
 *   Pot right leg  → 3.3V
 *
 * ── Dashboard setup ───────────────────────────────────────────────────────────
 *
 *   Widget type : Gauge
 *   Label       : Knob
 *   Pin name    : knob           ← matches publishSensor("knob", ...) below
 *   Min         : 0
 *   Max         : 100            ← we map the raw value to a percentage
 *
 *   Widget type : Graph
 *   Label       : Knob over time
 *   Pin name    : knob           ← same pin, both widgets update together
 *
 * ─────────────────────────────────────────────────────────────────────────────
 */

#include <homelab_esp32.h>

// ── Fill in these 4 values ────────────────────────────────────────────────────
const char* WIFI_SSID     = "YourWiFiName";
const char* WIFI_PASSWORD = "YourWiFiPassword";
const char* AUTH_TOKEN    = "paste_your_token_here";  // from the Devices page
const char* SERVER_IP     = "192.168.1.100";           // laptop IP
// ─────────────────────────────────────────────────────────────────────────────

#define POT_PIN  34   // analog input pin — use 34, 35, 36, or 39 on ESP32

void setup() {
  Serial.begin(115200);
  Homelab.begin(WIFI_SSID, WIFI_PASSWORD, AUTH_TOKEN, SERVER_IP);
  Serial.println("Ready! Reading potentiometer every 2 seconds.");
}

void loop() {
  Homelab.loop();  // always call this first

  static unsigned long lastSend = 0;
  if (millis() - lastSend >= 2000) {
    lastSend = millis();

    int   raw        = analogRead(POT_PIN);    // 0 – 4095  (12-bit ADC on ESP32)
    float percentage = (raw / 4095.0) * 100.0; // convert to 0 – 100 %

    Homelab.publishSensor("knob", percentage);

    Serial.print("Potentiometer: ");
    Serial.print(percentage, 1);  // 1 decimal place
    Serial.println(" %");
  }
}
