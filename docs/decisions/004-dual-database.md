# 004 — Deux bases PostgreSQL : data lake et API

- **Problème :** l’API mobile a besoin de données **propres, triées et bornées** ; l’équipe veut aussi **conserver tout** ce qui arrive du broker (rejets, doublons, retards, payloads bruts) pour audit et analyse.
- **Options :** une seule base avec tables brutes + tables métier ; deux moteurs (Postgres + Mongo/S3) ; **deux bases PostgreSQL** sur le même conteneur.
- **Choix et compromis :**
  - **`campus_lake`** (data lake) : table append-only `RawMqttEvent` — topic, payload brut/JSON, `outcome` (`ingested`, `rejected`, `duplicate`, `stale`, …). Pas de borne : tout est gardé.
  - **`campus`** (API) : `Device` + `Measurement` — données validées, dédupliquées, historique borné (`HISTORY_LIMIT`). Seule cette base sert les `GET /api/*`.
  - Même moteur PostgreSQL, deux Prisma schemas, deux URLs (`DATABASE_URL`, `LAKE_DATABASE_URL`).
  - Flux : MQTT → **lake d’abord** → règles métier → API DB si propre.
- **Vérification :** `GET /health` → `db: up`, `lake_db: up` ; messages MQTT visibles dans `RawMqttEvent` même si rejetés côté API.
- **Limite :** pas de pipeline ETL séparé ; la projection API reste synchrone dans `ingest.ts`. Pas d’endpoint public sur le lake (J3+).
