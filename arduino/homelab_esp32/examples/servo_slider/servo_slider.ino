/*
 * HomeLab ESP32 — Servo & LED Brightness Sliders
 * ================================================
 * Two sliders on the dashboard:
 *   - One controls a servo motor position (0° – 180°)
 *   - One controls LED brightness (off → full brightness)
 *
 * Required libraries (install via Tools → Manage Libraries):
 *   - PubSubClient  by Nick O'Leary
 *   - ESP32Servo    by Kevin Harrington
 *
 * Wiring:
 *   Servo signal wire  → GPIO 13  (change SERVO_PIN below if different)
 *   Servo red wire     → 5V  (or external power for large servos)
 *   Servo brown/black  → GND
 *
 *   LED long leg (+)   → GPIO 25 via 220Ω resistor
 *   LED short leg (-)  → GND
 *
 * ── Dashboard setup ───────────────────────────────────────────────────────────
 *
 *   Widget type : Slider
 *   Label       : Servo Position
 *   Pin name    : servo          ← matches getControl("servo") below
 *   Min         : 0
 *   Max         : 180
 *
 *   Widget type : Slider
 *   Label       : LED Brightness
 *   Pin name    : brightness     ← matches getControl("brightness") below
 *   Min         : 0
 *   Max         : 255
 *
 * ─────────────────────────────────────────────────────────────────────────────
 */

#include <homelab_esp32.h>
#include <ESP32Servo.h>

// ── Fill in these 4 values ────────────────────────────────────────────────────
const char* WIFI_SSID     = "YourWiFiName";
const char* WIFI_PASSWORD = "YourWiFiPassword";
const char* AUTH_TOKEN    = "paste_your_token_here";  // from the Devices page
const char* SERVER_IP     = "192.168.1.100";           // laptop IP
// ─────────────────────────────────────────────────────────────────────────────

#define SERVO_PIN  13   // servo signal pin
#define LED_PIN    25   // LED pin (must be PWM capable)

Servo myServo;

void setup() {
  Serial.begin(115200);

  myServo.attach(SERVO_PIN);
  pinMode(LED_PIN, OUTPUT);

  Homelab.begin(WIFI_SSID, WIFI_PASSWORD, AUTH_TOKEN, SERVER_IP);
  Serial.println("Ready! Move the sliders on the dashboard.");
}

void loop() {
  Homelab.loop();  // always call this first

  // ── Servo ──────────────────────────────────────────────────────────────────
  // getControl("servo") returns whatever value the dashboard slider is set to
  int servoAngle = (int)Homelab.getControl("servo");
  servoAngle = constrain(servoAngle, 0, 180);  // keep it within safe range
  myServo.write(servoAngle);

  // ── LED brightness ─────────────────────────────────────────────────────────
  int brightness = (int)Homelab.getControl("brightness");
  brightness = constrain(brightness, 0, 255);
  analogWrite(LED_PIN, brightness);

  // Print status every second so you can see values in Serial Monitor
  static unsigned long lastPrint = 0;
  if (millis() - lastPrint >= 1000) {
    lastPrint = millis();
    Serial.print("Servo: ");
    Serial.print(servoAngle);
    Serial.print("°   LED: ");
    Serial.println(brightness);
  }

  delay(20);  // small delay keeps servo movement smooth
}
