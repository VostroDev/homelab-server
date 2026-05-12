/*
 * HomeLab ESP32 — Getting Started Example
 * =========================================
 * The simplest possible example:
 *   - A Switch on the dashboard turns the built-in LED on and off
 *   - A sensor value (potentiometer or any analog pin) appears on a Gauge/Graph
 *
 * Required library: PubSubClient  (Tools → Manage Libraries → search PubSubClient)
 *
 * ── Step 1: Fill in your details below ───────────────────────────────────────
 * ── Step 2: Add these two widgets to your dashboard ──────────────────────────
 *
 *   Widget type : Switch
 *   Label       : LED            (or any name you like)
 *   Pin name    : led            ← must match getControl("led") in this code
 *
 *   Widget type : Gauge   (or Graph)
 *   Label       : Sensor         (or any name you like)
 *   Pin name    : sensor         ← must match publishSensor("sensor", ...) below
 *   Min / Max   : 0 / 4095
 *
 * ─────────────────────────────────────────────────────────────────────────────
 */

#include <homelab_esp32.h>

// ── Fill in these 4 values ────────────────────────────────────────────────────
const char* WIFI_SSID     = "YourWiFiName";
const char* WIFI_PASSWORD = "YourWiFiPassword";
const char* AUTH_TOKEN    = "paste_your_token_here";  // from the Devices page
const char* SERVER_IP     = "192.168.1.100";           // laptop IP (shown on server startup)
// ─────────────────────────────────────────────────────────────────────────────

const int LED_PIN    = 2;   // GPIO 2 = built-in LED on most ESP32 boards
const int SENSOR_PIN = 34;  // any analog input pin (e.g. potentiometer)

void setup() {
  Serial.begin(115200);
  pinMode(LED_PIN, OUTPUT);

  // Connect to WiFi and the HomeLab server — this handles everything automatically
  Homelab.begin(WIFI_SSID, WIFI_PASSWORD, AUTH_TOKEN, SERVER_IP);

  Serial.println("Ready!");
}

void loop() {
  Homelab.loop();  // keep the connection alive — always call this first

  // ── LED control ────────────────────────────────────────────────────────────
  // getControl("led") returns 1 when the dashboard switch is ON, 0 when OFF
  bool ledOn = Homelab.getControl("led") != 0;      // 1 != 0 → true and 0 != 0 → false
  digitalWrite(LED_PIN, ledOn ? HIGH : LOW);        // condition ? value_if_true : value_if_false

  // ── Sensor reading ─────────────────────────────────────────────────────────
  // The send interval controls how much time the graph covers.
  // The graph shows the last 60 live points, so:
  //
  //   2,000     ms (  2 sec) →  graph covers ~2 minutes   (fast sensor, e.g. noise)
  //   5,000     ms (  5 sec) →  graph covers ~5 minutes   (light, motion)
  //   10,000    ms ( 10 sec) →  graph covers ~10 minutes  (temperature)
  //   60,000    ms (  1 min) →  graph covers ~1 hour      (slow trends)
  //   300,000   ms (  5 min) →  graph covers ~5 hours     (room conditions)
  //   1,440,000 ms ( 24 min) →  graph covers ~24 hours    (full day view)
  //   4,320,000 ms ( 72 min) →  graph covers ~3 days      (long term trend)
  //
  //
  // Change the number below to zoom the graph in or out:
  static unsigned long lastSend = 0;
  if (millis() - lastSend >= 2000) {  // <-- change this interval
    lastSend = millis();

    int sensorValue = analogRead(SENSOR_PIN);  // 0 – 4095 on ESP32
    Homelab.publishSensor("sensor", sensorValue);

    // Also print to Serial so you can see what is happening
    Serial.print("LED: ");
    Serial.print(ledOn ? "ON " : "OFF");
    Serial.print("   Sensor: ");
    Serial.println(sensorValue);
  }
}
