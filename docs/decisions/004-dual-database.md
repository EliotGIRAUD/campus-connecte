# 004 — Data lake MongoDB + base API PostgreSQL

- **Problème :** stocker **tout** le flux MQTT (historique massif, payloads variables) sans bloquer l’API sur des verrous / mises à jour ; servir au téléphone des données **propres et bornées**.
- **Options :** Postgres lake + updates d’`outcome` ; Postgres JSONB append-only ; **MongoDB append-only** + Postgres API.
- **Choix et compromis :**
  - **`campus_lake` (MongoDB)** : collection `mqtt_events` — un document par message (`topic`, `payload`, `receivedAt`, `deviceId`, `messageId`). **Insert only**, jamais d’`update`. Pas de borne.
  - **`campus` (PostgreSQL)** : `Device` + `Measurement` — validé, dédupliqué, historique borné. Seule source des `GET /api/*`.
  - Flux : MQTT → **insert Mongo** → règles métier → Postgres si propre.
  - Driver natif `mongodb` (pas Prisma sur le lake) : schéma souple, écritures concurrentes sans row-lock SQL.
- **Vérification :** `GET /health` → `db: up`, `lake_db: up`, `lake_engine: mongodb` ; `mongosh campus_lake --eval 'db.mqtt_events.countDocuments()'`.
- **Limite :** pas d’auth Mongo en local (Compose pédagogique) ; pas d’endpoint public sur le lake ; échec lake loggé, l’API continue.
