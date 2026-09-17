# 005 — Rétention Postgres (moyennes) et TTL Mongo

- **Problème :** 200 mesures brutes ≈ 7 min ; le lake Mongo sans borne finit par saturer le disque ; le téléphone a besoin d’un historique lisible sur un mois.
- **Choix :**
  - **Postgres `Measurement`** : 200 dernières mesures brutes par objet (`HISTORY_LIMIT`).
  - **Postgres `MeasurementAverage`** : 1 moyenne (température + CO₂) par fenêtre de **10 min**, alimentée **à l’insertion** (les 200 brutes ne suffisent pas à recalculer 10 min après coup). Conservation **30 jours**.
  - **Mongo `mqtt_events`** : index TTL **7 jours** sur `receivedAt`. Le lake reste append-only ; Mongo efface tout seul les documents trop vieux.
- **Pourquoi 30 jours / 7 jours :** 30 j × 1 point / 10 min × 3 objets ≈ 13 k lignes Postgres — tenable et démontrable. Le lake brut (tous topics, y compris rejets) est beaucoup plus volumineux : 7 jours suffisent à l’audit pédagogique.
- **Vérification :** `GET /api/devices/:id/history` → `averages` (24 h) + `daily` (30 j) ; `mongosh` `db.mqtt_events.getIndexes()` contient `mqtt_events_ttl`.
- **Limite :** les moyennes n’existent qu’après des mesures **validées** (pas les rejets MQTT). Le TTL Mongo n’est pas immédiat (job interne ~60 s).
