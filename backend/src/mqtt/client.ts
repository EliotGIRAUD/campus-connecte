import mqtt, { type MqttClient } from "mqtt";
import { config } from "../config";
import { logEvent } from "../logger";
import { handleMqttMessage } from "./ingest";

let client: MqttClient | null = null;
let connected = false;

const TOPICS = [
  "campus/v1/devices/+/telemetry",
  "campus/v1/devices/+/state",
  "campus/v1/devices/+/availability",
];

export function isMqttConnected(): boolean {
  return connected;
}

export function connectMqtt(): MqttClient {
  client = mqtt.connect(config.mqtt.url, {
    username: config.mqtt.username,
    password: config.mqtt.password,
    clientId: `campus-backend-${process.pid}`,
    clean: true,
    reconnectPeriod: 2000,
    connectTimeout: 10_000,
  });

  client.on("connect", () => {
    connected = true;
    logEvent(
      "info",
      { eventType: "mqtt.connected", status: "ok", topic: config.mqtt.url },
      "mqtt connecte",
    );
    client?.subscribe(TOPICS, { qos: 1 }, (error) => {
      if (error) {
        logEvent(
          "error",
          {
            eventType: "mqtt.subscribe_failed",
            status: "error",
            reason: error.message,
            topics: TOPICS,
          },
          "abonnement mqtt echoue",
        );
        return;
      }
      logEvent(
        "info",
        { eventType: "mqtt.subscribed", status: "ok", topics: TOPICS },
        "abonnements mqtt actifs",
      );
    });
  });

  client.on("reconnect", () => {
    connected = false;
    logEvent(
      "warn",
      { eventType: "mqtt.reconnecting", status: "degraded", reason: "reconnect_attempt" },
      "mqtt reconnexion",
    );
  });

  client.on("close", () => {
    connected = false;
    logEvent(
      "warn",
      { eventType: "mqtt.disconnected", status: "down", reason: "connection_closed" },
      "mqtt deconnecte",
    );
  });

  client.on("error", (error) => {
    logEvent(
      "error",
      { eventType: "mqtt.error", status: "error", reason: error.message },
      "erreur mqtt",
    );
  });

  client.on("message", (topic, payload) => {
    void handleMqttMessage(topic, payload).catch((error) => {
      logEvent(
        "error",
        {
          eventType: "mqtt.handle_failed",
          topic,
          status: "error",
          reason: error instanceof Error ? error.message : String(error),
        },
        "traitement mqtt echoue",
      );
    });
  });

  return client;
}
