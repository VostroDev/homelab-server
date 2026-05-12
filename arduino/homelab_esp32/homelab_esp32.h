#pragma once
/*
 * HomeLab ESP32 Library
 * Connects your ESP32 to the HomeLab classroom IoT server via MQTT.
 *
 * Students only need to fill in 4 constants and call these functions:
 *   publishSensor(pin, value)  — send a sensor reading
 *   getControl(pin)            — read latest value sent from the dashboard
 *   loop()                     — call this in your Arduino loop()
 */

#include <Arduino.h>
#include <WiFi.h>
#include <PubSubClient.h>  // Install via Library Manager: "PubSubClient" by Nick O'Leary

class HomeLab {
public:
  HomeLab() {}

  /*
   * Call once in setup().
   * Blocks until WiFi + MQTT are connected, then prints status to Serial.
   */
  void begin(const char* ssid,
             const char* password,
             const char* authToken,
             const char* serverIP,
             uint16_t    mqttPort = 1883);

  /*
   * Call in every loop() iteration.
   * Handles MQTT keep-alive, reconnection, and incoming messages.
   */
  void loop();

  /*
   * Publish a numeric sensor value (float).
   * The dashboard graph/gauge widgets subscribe to this pin.
   *
   * Example: publishSensor("temperature", 23.4);
   */
  void publishSensor(const char* pin, float value);

  /*
   * Publish a string value (for status / text pins).
   */
  void publishSensor(const char* pin, const char* value);

  /*
   * Get the last value sent from the dashboard to this pin.
   * Returns 0.0 if no value has been received yet.
   *
   * Example: float brightness = getControl("led_dim");
   */
  float getControl(const char* pin);

  /*
   * Get the last value as a String.
   */
  String getControlString(const char* pin);

  /*
   * Returns true if currently connected to the MQTT broker.
   */
  bool connected();

private:
  WiFiClient   _wifiClient;
  PubSubClient _mqtt;

  const char* _token    = nullptr;
  const char* _serverIP = nullptr;
  uint16_t    _port     = 1883;

  // Simple key-value store for last control values (up to 16 pins)
  static const uint8_t MAX_PINS = 16;
  char   _pinNames[MAX_PINS][32];
  char   _pinValues[MAX_PINS][64];
  uint8_t _pinCount = 0;

  void connectWiFi(const char* ssid, const char* password);
  void connectMQTT();
  void setControl(const char* pin, const char* value);

  static void _onMessage(char* topic, uint8_t* payload, unsigned int length);
  static HomeLab* _instance;
};

extern HomeLab Homelab;
