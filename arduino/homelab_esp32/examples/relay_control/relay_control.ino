/*
 * HomeLab ESP32 — Switch Control Example
 * ========================================
 * Controls two outputs (relay and LED) from the HomeLab dashboard.
 *
 * Required library: PubSubClient (install via Library Manager)
 *
 * ── Dashboard setup ───────────────────────────────────────────────────────────
 * Add two Switch widgets to your dashboard. The PIN NAME must match exactly:
 *
 *   Widget type : Switch
 *   Label       : Relay          (displayed on the card — call it anything)
 *   Pin name    : relay          ← must match getControl("relay") below
 *
 *   Widget type : Switch
 *   Label       : LED            (displayed on the card — call it anything)
 *   Pin name    : led            ← must match getControl("led") below
 *
 * The Label is just a display name. The Pin name is what links the dashboard
 * widget to this Arduino code — spelling and capitalisation must match exactly.
 * ─────────────────────────────────────────────────────────────────────────────
 */

#include <homelab_esp32.h>

// ── Fill in these 4 values ────────────────────────────────────────────────────
const char* WIFI_SSID     = "YourWiFiName";
const char* WIFI_PASSWORD = "YourWiFiPassword";
const char* AUTH_TOKEN    = "paste_your_token_here";   // from the Devices page
const char* SERVER_IP     = "192.168.1.100";            // laptop IP
// ─────────────────────────────────────────────────────────────────────────────

const int RELAY_PIN = 26;   // change to match your wiring
const int LED_PIN   = 25;   // change to match your wiring

void setup() {
  Serial.begin(115200);
  pinMode(RELAY_PIN, OUTPUT);
  pinMode(LED_PIN,   OUTPUT);

  Homelab.begin(WIFI_SSID, WIFI_PASSWORD, AUTH_TOKEN, SERVER_IP);
  Serial.println("[Example] Switch control example running");
}

void loop() {
  Homelab.loop();  // always call this first

  // Read relay control from dashboard (1 = ON, 0 = OFF)
  bool relayOn = Homelab.getControl("relay") != 0;
  digitalWrite(RELAY_PIN, relayOn ? HIGH : LOW);

  // Read LED control from dashboard
  bool ledOn = Homelab.getControl("led") != 0;
  digitalWrite(LED_PIN, ledOn ? HIGH : LOW);

  // Print status every second
  static unsigned long lastPrint = 0;
  if (millis() - lastPrint >= 1000) {
    lastPrint = millis();
    Serial.print("[Control] relay=");
    Serial.print(relayOn ? "ON" : "OFF");
    Serial.print("  led=");
    Serial.println(ledOn ? "ON" : "OFF");
  }

  delay(50);
}
