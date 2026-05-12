#include "homelab_esp32.h"

HomeLab* HomeLab::_instance = nullptr;
HomeLab  Homelab;

void HomeLab::begin(const char* ssid,
                    const char* password,
                    const char* authToken,
                    const char* serverIP,
                    uint16_t    mqttPort) {
  _instance = this;
  _token    = authToken;
  _serverIP = serverIP;
  _port     = mqttPort;

  _mqtt.setClient(_wifiClient);
  _mqtt.setServer(serverIP, mqttPort);
  _mqtt.setCallback(_onMessage);
  _mqtt.setKeepAlive(60);
  _mqtt.setBufferSize(512);

  connectWiFi(ssid, password);
  connectMQTT();
}

void HomeLab::loop() {
  if (!_mqtt.connected()) connectMQTT();
  _mqtt.loop();
}

void HomeLab::publishSensor(const char* pin, float value) {
  char topic[128];
  snprintf(topic, sizeof(topic), "home/%s/sensor/%s", _token, pin);

  char payload[32];
  // Up to 4 decimal places, strip trailing zeros
  dtostrf(value, 0, 4, payload);
  // Trim trailing zeros after decimal point
  char* dot = strchr(payload, '.');
  if (dot) {
    char* end = payload + strlen(payload) - 1;
    while (end > dot && *end == '0') *end-- = '\0';
    if (*end == '.') *end = '\0';
  }

  _mqtt.publish(topic, payload, false);
}

void HomeLab::publishSensor(const char* pin, const char* value) {
  char topic[128];
  snprintf(topic, sizeof(topic), "home/%s/sensor/%s", _token, pin);
  _mqtt.publish(topic, value, false);
}

float HomeLab::getControl(const char* pin) {
  String val = getControlString(pin);
  return val.toFloat();
}

String HomeLab::getControlString(const char* pin) {
  for (uint8_t i = 0; i < _pinCount; i++) {
    if (strcmp(_pinNames[i], pin) == 0) return String(_pinValues[i]);
  }
  return String("0");
}

bool HomeLab::connected() { return _mqtt.connected(); }

// ── Private ───────────────────────────────────────────────────────────────────

void HomeLab::connectWiFi(const char* ssid, const char* password) {
  Serial.print("[HomeLab] Connecting to WiFi: ");
  Serial.print(ssid);
  WiFi.mode(WIFI_STA);
  WiFi.begin(ssid, password);
  unsigned long start = millis();
  while (WiFi.status() != WL_CONNECTED) {
    delay(500); Serial.print('.');
    if (millis() - start > 20000) {
      Serial.println("\n[HomeLab] WiFi timeout — check SSID/password and reboot.");
      while (true) delay(1000);
    }
  }
  Serial.println();
  Serial.print("[HomeLab] WiFi connected, IP: ");
  Serial.println(WiFi.localIP());
}

void HomeLab::connectMQTT() {
  uint8_t retries = 0;
  while (!_mqtt.connected()) {
    Serial.print("[HomeLab] Connecting to MQTT broker...");
    char clientId[32];
    snprintf(clientId, sizeof(clientId), "homelab-%s", _token);

    // Last-will message so server knows we went offline
    char statusTopic[128];
    snprintf(statusTopic, sizeof(statusTopic), "home/%s/status", _token);

    if (_mqtt.connect(clientId, nullptr, nullptr, statusTopic, 1, false, "offline")) {
      Serial.println(" connected!");

      // Publish online status
      _mqtt.publish(statusTopic, "online", false);

      // Subscribe to all control topics for this device
      char sub[128];
      snprintf(sub, sizeof(sub), "home/%s/control/#", _token);
      _mqtt.subscribe(sub, 1);

      Serial.print("[HomeLab] Subscribed to ");
      Serial.println(sub);
    } else {
      Serial.print(" failed (rc=");
      Serial.print(_mqtt.state());
      Serial.println(") — retrying in 5s");
      retries++;
      if (retries > 10) {
        Serial.println("[HomeLab] MQTT broker unreachable — check SERVER_IP and that the server is running.");
      }
      delay(5000);
    }
  }
}

void HomeLab::setControl(const char* pin, const char* value) {
  // Update existing entry
  for (uint8_t i = 0; i < _pinCount; i++) {
    if (strcmp(_pinNames[i], pin) == 0) {
      strncpy(_pinValues[i], value, 63);
      _pinValues[i][63] = '\0';
      return;
    }
  }
  // Add new entry
  if (_pinCount < MAX_PINS) {
    strncpy(_pinNames[_pinCount], pin, 31);
    _pinNames[_pinCount][31] = '\0';
    strncpy(_pinValues[_pinCount], value, 63);
    _pinValues[_pinCount][63] = '\0';
    _pinCount++;
  }
}

void HomeLab::_onMessage(char* topic, uint8_t* payload, unsigned int length) {
  if (!_instance) return;

  // topic = home/{token}/control/{pin}
  // Extract pin name from topic
  char topicStr[128];
  strncpy(topicStr, topic, 127);
  topicStr[127] = '\0';

  // Find "control/" section
  const char* ctrl = strstr(topicStr, "/control/");
  if (!ctrl) return;
  const char* pin = ctrl + 9; // skip "/control/"

  char value[64];
  uint8_t len = (length < 63) ? length : 63;
  memcpy(value, payload, len);
  value[len] = '\0';

  _instance->setControl(pin, value);
}
