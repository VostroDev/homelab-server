/*
 * HomeLab ESP32 — DHT Temperature & Humidity Sensor
 * ===================================================
 * Reads temperature and humidity from a DHT11 or DHT22 sensor
 * and sends both values to the HomeLab dashboard every 5 seconds.
 *
 * Required libraries (install via Tools → Manage Libraries):
 *   - PubSubClient  by Nick O'Leary
 *   - DHT sensor library  by Adafruit
 *   - Adafruit Unified Sensor  by Adafruit  (required by DHT library)
 *
 * Wiring:
 *   DHT pin 1 (VCC)  → 3.3V
 *   DHT pin 2 (DATA) → GPIO 4  (change DATA_PIN below if different)
 *   DHT pin 4 (GND)  → GND
 *   Put a 10kΩ resistor between VCC and DATA
 *
 * ── Dashboard setup ───────────────────────────────────────────────────────────
 *
 *   Widget type : Graph  (or Gauge, min: -10, max: 50)
 *   Label       : Temperature
 *   Pin name    : temperature    ← matches publishSensor("temperature", ...) below
 *
 *   Widget type : Graph  (or Gauge, min: 0, max: 100)
 *   Label       : Humidity
 *   Pin name    : humidity       ← matches publishSensor("humidity", ...) below
 *
 * ─────────────────────────────────────────────────────────────────────────────
 */

#include <homelab_esp32.h>
#include <DHT.h>

// ── Fill in these 4 values ────────────────────────────────────────────────────
const char* WIFI_SSID     = "YourWiFiName";
const char* WIFI_PASSWORD = "YourWiFiPassword";
const char* AUTH_TOKEN    = "paste_your_token_here";  // from the Devices page
const char* SERVER_IP     = "192.168.1.100";           // laptop IP
// ─────────────────────────────────────────────────────────────────────────────

#define DATA_PIN   4      // GPIO pin connected to DHT data line
#define DHT_TYPE   DHT11  // change to DHT22 if you have the DHT22 sensor

DHT dht(DATA_PIN, DHT_TYPE);

void setup() {
  Serial.begin(115200);
  dht.begin();
  Homelab.begin(WIFI_SSID, WIFI_PASSWORD, AUTH_TOKEN, SERVER_IP);
  Serial.println("Ready! Sending temperature and humidity every 5 seconds.");
}

void loop() {
  Homelab.loop();  // always call this first

  static unsigned long lastSend = 0;
  if (millis() - lastSend >= 5000) {
    lastSend = millis();

    float temperature = dht.readTemperature();  // Celsius
    float humidity    = dht.readHumidity();

    // readTemperature() returns NaN if the sensor is not connected
    if (isnan(temperature) || isnan(humidity)) {
      Serial.println("DHT sensor not found — check wiring!");
      return;
    }

    // Send both values to the dashboard
    Homelab.publishSensor("temperature", temperature);
    Homelab.publishSensor("humidity",    humidity);

    Serial.print("Temperature: ");
    Serial.print(temperature);
    Serial.print(" °C    Humidity: ");
    Serial.print(humidity);
    Serial.println(" %");
  }
}
