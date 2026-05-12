/*
 * HomeLab ESP32 — Basic Sensor Example
 * ======================================
 * Reads a temperature sensor (or simulated value) and sends it
 * to the HomeLab dashboard every 2 seconds.
 *
 * Dashboard widgets to add:
 *   - Graph card  → pin: "temperature"
 *   - Gauge card  → pin: "temperature"  (min: 0, max: 50, unit: °C)
 *
 * Required library: PubSubClient (install via Library Manager)
 */

#include <homelab_esp32.h>

// ── Fill in these 4 values ────────────────────────────────────────────────────
const char* WIFI_SSID     = "YourWiFiName";
const char* WIFI_PASSWORD = "YourWiFiPassword";
const char* AUTH_TOKEN    = "paste_your_token_here";   // from the Devices page
const char* SERVER_IP     = "192.168.1.100";            // laptop IP on your network
// ─────────────────────────────────────────────────────────────────────────────

// Optional: connect a real DS18B20 or DHT22 — for now we simulate
float readTemperature() {
  // Replace this with your actual sensor read
  return 20.0 + (random(0, 100) / 10.0);  // 20.0 – 30.0 °C simulated
}

void setup() {
  Serial.begin(115200);
  Homelab.begin(WIFI_SSID, WIFI_PASSWORD, AUTH_TOKEN, SERVER_IP);
  Serial.println("[Example] Basic sensor example running");
}

void loop() {
  Homelab.loop();  // always call this first

  static unsigned long lastSend = 0;
  if (millis() - lastSend >= 2000) {
    lastSend = millis();

    float temp = readTemperature();
    Homelab.publishSensor("temperature", temp);

    Serial.print("[Sensor] Temperature: ");
    Serial.print(temp);
    Serial.println(" °C");
  }
}
