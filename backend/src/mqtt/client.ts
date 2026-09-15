import mqtt, { type MqttClient } from "mqtt";
import { config } from "../config";
import { logger } from "../logger";
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
    logger.info({ url: config.mqtt.url }, "mqtt connecte");
    client?.subscribe(TOPICS, { qos: 1 }, (error) => {
      if (error) {
        logger.error({ err: error }, "abonnement mqtt echoue");
        return;
      }
      logger.info({ topics: TOPICS }, "abonnements mqtt actifs");
    });
  });

  client.on("reconnect", () => {
    connected = false;
    logger.warn("mqtt reconnexion");
  });

  client.on("close", () => {
    connected = false;
    logger.warn("mqtt deconnecte");
  });

  client.on("error", (error) => {
    logger.error({ err: error }, "erreur mqtt");
  });

  client.on("message", (topic, payload) => {
    void handleMqttMessage(topic, payload).catch((error) => {
      logger.error({ err: error, topic }, "traitement mqtt echoue");
    });
  });

  return client;
}
