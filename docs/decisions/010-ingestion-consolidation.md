# 010 — Pipeline ingestion / consolidation découplé

- **Problème :** un seul handler MQTT faisait Mongo → validation → Postgres → agrégats. Postgres lent ou down bloquait / cassait le même chemin ; le lake n’était pas une file rejouable.
- **Options :** (A) documenter la limite ; (B) ajouter un statut sur `mqtt_events` (casse l’append-only) ; (C) **lake append-only + collection `consolidation_jobs` + N workers**.
- **Choix :** (C)
  - **Ingestion** = `insert` lake + `enqueue` job (`status: pending`). Pas de Postgres sur le hot path MQTT.
  - **Consolidation** = workers (`CONSOLIDATION_WORKERS`) qui claim atomiquement (`findOneAndUpdate`) puis écrivent Postgres (validation métier : [009](009-business-validation-room-concurrency.md)).
  - États : `pending | processing | processed | rejected | error` + backoff `availableAt` + reprise des locks périmés.
  - Échec lake → ingestion refusée (pas d’écriture métier orpheline).
- **Vérification :** `GET /health` → `consolidation.workers` ; stop Postgres → `mqtt.queued` continue, jobs en `pending`/`error` ; Postgres revient → file se vide (`pending=0`).
- **Limite :** workers in-process (scale via env, pas un service séparé) ; pas de transaction distribuée lake↔job (orphan lake sans job possible si crash entre les deux inserts).
