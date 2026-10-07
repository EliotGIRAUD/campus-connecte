# Review 4-5-6 — Ingestion / lake / health

**Périmètre :** points 4, 5 et 6 de la revue architecturale (découplage, garanties du data lake, healthcheck).  
**Méthode :** observer → comprendre → argumenter → décider → prouver.  
**Décision globale :** **corriger** le pipeline (découplage + garanties lake) et **préciser** le health (liveness / readiness / degraded).

Définitions retenues :

| Terme | Définition opérationnelle |
|---|---|
| **Ingestion réussie** | Document durable dans Mongo `mqtt_events` **et** job créé dans `consolidation_jobs` (`pending`) |
| **Consolidation réussie** | Règles métier appliquées dans PostgreSQL (ou rejet métier explicite) + job `processed` / `rejected` |
| **Chaîne IoT opérationnelle** | MQTT connecté **et** Mongo up **et** Postgres up **et** lag consolidation sous seuil |

---

## 4. Découplage ingestion / consolidation et scalabilité

### Comportement observé (avant correction)

Flux unique dans `handleMqttMessage` :

`MQTT → insert Mongo → validation → PostgreSQL → agrégats → purge → Device`

Expérience `docker compose stop postgres` (~25 s) :

| Indicateur | Valeur |
|---|---|
| Mongo `mqtt_events` | 55123 → 55174 (**+51**, lake continue) |
| Logs | `mqtt.handle_failed` (Prisma `Can't reach database server`) |
| Marquage « à consolider » | **aucun** |
| Au retour de Postgres | seuls les **nouveaux** messages sont traités ; **pas de rattrapage** |
| `/health` | `503`, `ok:false`, `db:down`, `mqtt:connected` |

### Cause comprise

Pas de frontière runtime. Mongo était une archive best-effort, pas une file. Le consommateur MQTT enchaînait immédiatement Postgres : panne ou lenteur Postgres = échec / backpressure sur le même chemin.

### Risque / conséquence

- Perte métier pendant une panne Postgres malgré des bruts en lake.
- Impossible d’augmenter indépendamment capacité d’ingestion et de consolidation.
- Postgres à 2 s/mesure → accumulation de promesses concurrentes dans le process MQTT (ACK QoS 1 avant fin métier).

### Décision : **corriger**

Pipeline :

```text
MQTT → lake append-only (mqtt_events)
     → enqueue consolidation_jobs (pending)
     → workers N (claim atomique) → PostgreSQL / agrégats / Device
```

- Lake reste **append-only** (ADR 004 conservé).
- File séparée `consolidation_jobs` avec états `pending | processing | processed | rejected | error`.
- Claim : `findOneAndUpdate` ; locks périmés repris ; backoff `availableAt` sur erreur.
- Scale consolidation : `CONSOLIDATION_WORKERS` (défaut 2). Scale ingestion : concurrence des handlers MQTT / réplicas (attention `clientId`).

### Justification

Rentable pour le rendu : répond aux questions du prof avec un comportement prouvable (panne Postgres ≠ perte définitive des événements déjà enqueued). Alternative « documenter seulement » laissée de côté car le gap était structurel.

### Preuve reproductible (après correction)

```powershell
# Nominal
curl.exe http://localhost:3000/health
docker exec mobile-mongo-1 mongosh campus_lake --quiet --eval 'db.consolidation_jobs.countDocuments({status:"processed"})'

# Panne Postgres + rattrapage
docker compose stop postgres
# attendre ~20 s — logs consolidation.failed ; health consolidation.pending/error ↑ ; compteurs lake/jobs ↑
# (mqtt.queued est en LOG_LEVEL=debug pour limiter le bruit Loki)
docker compose start postgres
# attendre healthy + ~25 s — pending=0, error=0
```

Mesures du 2026-09-17 :

| Phase | Lake Δ | Jobs | pending / error / processed | Health |
|---|---|---|---|---|
| Avant | — | 129 | 0 / 0 / … | healthy |
| Postgres down ~20 s | **+33** | 165 | **28 / 3** / 132 | `unavailable`, lag ~25 s |
| Après retour | — | 222 | **0 / 0 / 219** | healthy |

Les messages absorbés pendant la panne sont **automatiquement retraités**.

### Scalabilité 100k (explication, non démontrée)

| Question | Réponse architecture actuelle |
|---|---|
| 4 workers | `CONSOLIDATION_WORKERS=4` puis rebuild/restart backend |
| Éviter double traitement | claim atomique Mongo ; idempotence Postgres via `message_id` unique |
| États | oui : pending / processing / processed / rejected / error |
| Worker mort | lock `processing` + `lockedAt` ; repris si `now - lockedAt > CONSOLIDATION_LOCK_MS` |
| Lag | `GET /health` → `consolidation.lagMs`, `pending`, `oldestPendingAt` ; log `consolidation.lag` |

Évolution si débit ↑↑ : séparer process consolidateur, partitionner la file, métriques Prometheus ; lake reste la source brute.

---

## 5. Garantie réelle du data lake MongoDB

### Comportement observé

**Avant :** `recordRawMessage` avalait l’erreur lake puis continuait vers Postgres → possible **métier sans lake**.

**Après :** échec lake → `lake.write_failed` + throw → **pas** d’enqueue, **pas** d’écriture Postgres.

Expérience `docker compose stop mongo` (~12 s) :

- Health : `unavailable`, `lake_db:down`, `db:up`
- Logs : `lake.write_failed` / `mqtt.handle_failed` uniquement
- **Aucun** `telemetry.ingested` pendant la panne (ingestion refusée avant enqueue)
- Messages MQTT de cette fenêtre : **conservés** côté broker si session persistante (`clean:false`) et broker up ; sinon perdus

### Cause comprise

Deux stockages sans transaction distribuée. La garantie « lake d’abord » n’existe que si le code **refuse** de consolider sans écriture lake réussie. La file `consolidation_jobs` matérialise ensuite « à consolider ».

### Risque / conséquence

| Situation | Avant | Après |
|---|---|---|
| PG présent, lake absent | Possible | **Empêché** (ingestion refusée) |
| Lake présent, PG absent | Possible, **sans rejeu** | Possible temporairement, **rejeu via file** |
| Crash entre insert lake et enqueue | — | Orphelin lake sans job (rare) ; rejeu manuel possible depuis `mqtt_events` |

### Décision : **corriger** (+ documenter les limites restantes)

- Ingestion refuse si lake KO.
- Rejeu automatique si Postgres KO (jobs).
- Limite acceptée : pas de XA ; orphelins lake→job possibles ; TTL 7 j sur le lake.

### Justification

Sans cette correction, le lake ne permettait **pas** de rejouer le système. Avec file + workers, le lake + jobs deviennent la base d’un vrai pipeline.

### Preuve reproductible

```powershell
docker compose stop mongo
# logs: lake.write_failed ; pas de telemetry.ingested
curl.exe http://localhost:3000/health   # unavailable, lake_db down
docker compose start mongo
```

### Détection des écarts

| Écart | Détection |
|---|---|
| Brute en lake, non consolidée | `consolidation_jobs` avec `status in (pending, processing, error)` ; `health.consolidation.lagMs` |
| Métier PG sans lake | Ne doit plus se produire à chaud ; historique : comparer `Measurement.messageId` absents de `mqtt_events.messageId` |
| Lake sans job | `mqtt_events` sans doc `consolidation_jobs.lakeEventId` (script de réconciliation possible) |

---

## 6. Healthcheck et état réel de la chaîne IoT

### Comportement observé

**Avant :** `ok = db && lake` ; MQTT exposé mais **n’influençait pas** le statut HTTP.

**Après :**

| Endpoint | Rôle | 200 si… |
|---|---|---|
| `GET /health/live` | Liveness | process up |
| `GET /health/ready` | Readiness | Postgres + Mongo up |
| `GET /health` | Synthèse | prêt (200) ou indisponible (503) ; champ `status`: `healthy` \| `degraded` \| `unavailable` |

Expériences :

| Scénario | `status` | HTTP | API `/api/rooms` |
|---|---|---|---|
| Postgres down | `unavailable` | 503 | KO lecture métier |
| Mongo down | `unavailable` | 503 | ready false |
| MQTT down 1 h (simulé ~8 s) | **`degraded`** | **200** | **OK** (3 salles) — télémétrie neuve stoppée |
| Tout OK | `healthy` | 200 | OK |

### Cause comprise

« Le système fonctionne » n’est pas binaire : l’API de lecture peut vivre sans broker ; la chaîne IoT d’acquisition, non.

### Risque / conséquence

Si on tue le pod dès que MQTT est down → redémarrages inutiles alors que l’API sert encore le dernier état. Si on ignore MQTT dans le health → fausse impression d’une chaîne IoT saine.

### Décision : **corriger** (sémantique health) + **documenter** la politique d’orchestreur

| État | Action orchestrateur / exploitant |
|---|---|
| Liveness fail | **Redémarrer** le backend |
| Readiness fail (PG ou Mongo) | Retirer du load balancer / ne pas router ; alerter ; redémarrer seulement si persistant |
| `degraded` (MQTT down ou lag consolidation) | **Alerter** l’exploitant ; **ne pas** redémarrer uniquement pour ça |
| `healthy` | RAS |

Composants **obligatoires** pour dire « chaîne IoT opérationnelle » : broker MQTT + backend connecté + Mongo (ingestion) + Postgres (consolidation / API) + devices publiant.  
Composants pour « API de supervision utile » : Postgres + backend (Mongo utile pour santé pipeline ; MQTT optionnel en lecture seule dégradée).

### Justification

Aligné sur les pratiques liveness/readiness : redémarrer un process zombie, pas une dépendance externe temporaire.

### Preuve reproductible

```powershell
curl.exe http://localhost:3000/health/live
curl.exe http://localhost:3000/health/ready
curl.exe http://localhost:3000/health

docker compose stop mosquitto
curl.exe http://localhost:3000/health   # status=degraded, ok=true, mqtt=disconnected
curl.exe http://localhost:3000/api/rooms
docker compose start mosquitto
```

---

## Synthèse des décisions

| # | Sujet | Décision |
|---|---|---|
| 4 | Découplage / scale | **Corriger** — file Mongo + workers |
| 5 | Garantie lake | **Corriger** — lake obligatoire avant consolidation ; rejeu via jobs |
| 6 | Health | **Corriger** — live / ready / degraded documentés |

## Fichiers touchés

- `backend/src/mqtt/ingest.ts`, `lake.ts`, `consolidate.ts`, `queue.ts`, `worker.ts`
- `backend/src/lake-db.ts`, `config.ts`, `index.ts`, `api/app.ts`
- `compose.yaml`, `.env.example`
- ADR [010](decisions/010-ingestion-consolidation.md)

## Limites restantes (assumées)

- Workers **in-process** (pas un Deployment séparé).
- Pas de transaction multi-documents Mongo (standalone) : fenêtre rare lake sans job.
- Session MQTT `clean:false` + `clientId` stable : messages QoS ≥ 1 pendant backend down sont mis en file par Mosquitto (bornée par `max_queued_messages`).
- Jobs en `error` après `CONSOLIDATION_MAX_ATTEMPTS` exigent intervention (reset manuel / ↑ tentatives).
- **Pas de backfill** des `mqtt_events` antérieurs à l’introduction de `consolidation_jobs` : ce sont des archives d’audit ; les rejouer créerait un tsunami de jobs pour des mesures déjà (ou jamais) consolidées. Le pipeline ne s’applique qu’aux nouveaux messages.
- `mqtt.queued` est en niveau **debug** (bruit Loki) ; le signal opérationnel reste `telemetry.ingested`, `consolidation.failed` et `GET /health`.

## Lien avec les points 1–3 (collègue)

Le passage à plusieurs workers de consolidation rend le point 3 (courses sur `lastObservedAt`) **réel**. Côté 4–6, la MAJ du latest utilise `updateMany` conditionnel (`lastObservedAt IS NULL OR lastObservedAt < observedAt`) pour ne pas régresser sous concurrence. L’investigation pédagogique du scénario A/B reste au collègue (points 1–3).
