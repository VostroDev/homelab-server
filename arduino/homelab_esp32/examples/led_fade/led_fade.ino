/*
 * HomeLab ESP32 — LED Fade with Slider
 * ======================================
 * A slider on the dashboard controls LED brightness.
 * Drag the slider left = LED dims, drag right = LED brightens.
 *
 * No extra libraries needed — just PubSubClient.
 *
 * Wiring:
 *   LED long leg (+) → GPIO 25 via 220Ω resistor → GND
 *   LED short leg (−) → GND
 *   (The built-in LED on GPIO 2 also works for a quick test)
 *
 * ── Dashboard setup ───────────────────────────────────────────────────────────
 *
 *   Widget type : Slider
 *   Label       : LED Brightness   (or any name you like)
 *   Pin name    : brightness        ← must match getControl("brightness") below
 *   Min         : 0                 ← fully off
 *   Max         : 255               ← fully on
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

#define LED_PIN  25   // any GPIO pin — GPIO 2 (built-in LED) also works

void setup() {
  Serial.begin(115200);

  pinMode(LED_PIN, OUTPUT);
  Homelab.begin(WIFI_SSID, WIFI_PASSWORD, AUTH_TOKEN, SERVER_IP);
  Serial.println("Ready! Move the brightness slider on the dashboard.");
}

void loop() {
  Homelab.loop();  // always call this first

  // Read the slider value from the dashboard (0 = off, 255 = full brightness)
  int brightness = (int)Homelab.getControl("brightness");

  // constrain() makes sure the value never goes outside 0–255
  // (protects against unexpected values from the network)
  brightness = constrain(brightness, 0, 255);

  // Set the LED brightness using PWM (0 = off, 255 = full brightness)
  analogWrite(LED_PIN, brightness);

  // Print the brightness value every second so you can see it in Serial Monitor
  static unsigned long lastPrint = 0;
  if (millis() - lastPrint >= 1000) {
    lastPrint = millis();
    Serial.print("Brightness: ");
    Serial.print(brightness);
    Serial.print(" / 255  (");
    Serial.print((brightness / 255.0) * 100, 0);
    Serial.println(" %)");
  }

  delay(20);  // small delay keeps PWM updates smooth
}
