/*
 * HomeLab ESP32 — Raw MQTT (No Library Wrapper)
 * ===============================================
 * This example does exactly what the HomeLab library does internally,
 * but written out in full so you can see every step.
 *
 * Use this to understand how MQTT works under the hood.
 * For normal projects, use the HomeLab library — it handles all of this for you.
 *
 * What this sketch does:
 *   - Connects to WiFi
 *   - Connects directly to the HomeLab MQTT broker
 *   - Subscribes to a control topic  (dashboard → ESP32)
 *   - Publishes a sensor value        (ESP32 → dashboard graph)
 *   - Receives switch commands and turns the built-in LED on/off
 *
 * Required library: PubSubClient by Nick O'Leary (install via Library Manager)
 *
 * ── Dashboard setup ───────────────────────────────────────────────────────────
 *
 *   Widget type : Graph
 *   Label       : Counter
 *   Pin name    : counter
 *
 *   Widget type : Switch
 *   Label       : LED
 *   Pin name    : led
 *
 * ─────────────────────────────────────────────────────────────────────────────
 */

#include <WiFi.h>
#include <PubSubClient.h>

// ── Fill in these 4 values ────────────────────────────────────────────────────
const char* WIFI_SSID     = "YourWiFiName";
const char* WIFI_PASSWORD = "YourWiFiPassword";
const char* AUTH_TOKEN    = "paste_your_token_here";   // from the Devices page
const char* SERVER_IP     = "192.168.1.100";           // laptop IP
// ─────────────────────────────────────────────────────────────────────────────

#define LED_PIN  2   // built-in LED on most ESP32 boards

// ── MQTT topic helpers ────────────────────────────────────────────────────────
// The HomeLab server uses this topic structure:
//   home/{token}/sensor/{pin}   ← ESP32 publishes sensor values here
//   home/{token}/control/{pin}  ← ESP32 subscribes here for dashboard commands

String topicSensor(const char* pin) {
  return String("home/") + AUTH_TOKEN + "/sensor/" + pin;
}
String topicControl(const char* pin) {
  return String("home/") + AUTH_TOKEN + "/control/" + pin;
}

// ── WiFi + MQTT objects ───────────────────────────────────────────────────────
WiFiClient   wifiClient;
PubSubClient mqtt(wifiClient);

// ── Callback: called automatically when a message arrives ────────────────────
void onMessageReceived(char* topic, byte* payload, unsigned int length) {
  // Convert the payload bytes into a String
  String value = "";
  for (unsigned int i = 0; i < length; i++) {
    value += (char)payload[i];
  }

  Serial.print("[MQTT] Received  topic: ");
  Serial.print(topic);
  Serial.print("  value: ");
  Serial.println(value);

  // Check which pin the message is for and act on it
  if (String(topic) == topicControl("led")) {
    bool ledOn = (value == "1");
    digitalWrite(LED_PIN, ledOn ? HIGH : LOW);
    Serial.print("[LED] Turned ");
    Serial.println(ledOn ? "ON" : "OFF");
  }
}

// ── Connect to WiFi ───────────────────────────────────────────────────────────
void connectWiFi() {
  Serial.print("[WiFi] Connecting to ");
  Serial.print(WIFI_SSID);
  WiFi.begin(WIFI_SSID, WIFI_PASSWORD);
  while (WiFi.status() != WL_CONNECTED) {
    delay(500);
    Serial.print(".");
  }
  Serial.println();
  Serial.print("[WiFi] Connected, IP: ");
  Serial.println(WiFi.localIP());
}

// ── Connect to MQTT broker ────────────────────────────────────────────────────
void connectMQTT() {
  while (!mqtt.connected()) {
    Serial.print("[MQTT] Connecting to broker...");

    // Client ID must start with "homelab-" so the server recognises the device
    String clientId = String("homelab-") + AUTH_TOKEN;

    // Last-will message — sent automatically by the broker if we disconnect
    String statusTopic = String("home/") + AUTH_TOKEN + "/status";

    if (mqtt.connect(clientId.c_str(), NULL, NULL,
                     statusTopic.c_str(), 1, false, "offline")) {
      Serial.println(" connected!");

      // Tell the server we are online
      mqtt.publish(statusTopic.c_str(), "online");

      // Subscribe to all control topics for this device
      // The # wildcard means "any pin name"
      String subTopic = String("home/") + AUTH_TOKEN + "/control/#";
      mqtt.subscribe(subTopic.c_str(), 1);

      Serial.print("[MQTT] Subscribed to: ");
      Serial.println(subTopic);

    } else {
      Serial.print(" failed (rc=");
      Serial.print(mqtt.state());
      Serial.println(") — retrying in 5s");
      delay(5000);
    }
  }
}

// ── setup() ──────────────────────────────────────────────────────────────────
void setup() {
  Serial.begin(115200);
  pinMode(LED_PIN, OUTPUT);

  connectWiFi();

  mqtt.setServer(SERVER_IP, 1883);      // point to the HomeLab broker
  mqtt.setCallback(onMessageReceived);  // register our message handler
  mqtt.setBufferSize(512);

  connectMQTT();

  Serial.println("[Ready] Publishing counter every 3 seconds.");
}

// ── loop() ───────────────────────────────────────────────────────────────────
void loop() {
  // Reconnect if connection was lost
  if (!mqtt.connected()) connectMQTT();

  // MUST call mqtt.loop() every iteration — processes incoming messages
  mqtt.loop();

  // Publish a counter value to the dashboard every 3 seconds
  static unsigned long lastSend = 0;
  static int counter = 0;

  if (millis() - lastSend >= 3000) {
    lastSend = millis();
    counter++;

    // Convert the number to a string and publish it
    String value   = String(counter);
    String topic   = topicSensor("counter");

    mqtt.publish(topic.c_str(), value.c_str());

    Serial.print("[MQTT] Published  topic: ");
    Serial.print(topic);
    Serial.print("  value: ");
    Serial.println(value);
  }
}
