# Architecture — Campus connecté

## Chaîne de la donnée

```mermaid
flowchart LR
    S["Simulateur fourni"] -->|"MQTT campus/v1"| M["Mosquitto"]
    M -->|"mqtt.js QoS 1"| B["Backend Express"]
    B --> LAKE[("MongoDB campus_lake")]
    B --> PG[("PostgreSQL campus")]
    B -->|"REST GET /api"| A["Expo / React Native"]
```

| Étape | Rôle | Technologie |
|---|---|---|
| Capteur | Produit température, CO₂, état, disponibilité | Simulateur Python du kit |
| Transport | Publication / abonnement, retained, Last Will | Mosquitto MQTT 3.1.1 |
| Backend | Valide, identifie l’objet, persiste, expose l’API | Node.js, Express, mqtt.js, Zod |
| Data lake | Tout message MQTT brut, timestampé, TTL 7 jours | MongoDB `campus_lake` |
| Stockage API | Dernier état + 200 mesures + moyennes 10 min / 30 j | PostgreSQL `campus`, Prisma |
| Mobile | Affiche mesures, cache local, états réseau distincts | React Native, Expo, Zustand, AsyncStorage, NetInfo |

Le téléphone ne se connecte pas au broker. Le backend porte les règles, l’historique et (à partir de J3) les droits et le suivi des commandes.

## Pourquoi une API et un broker n’ont pas le même rôle

Le broker achemine des messages sans connaître les salles, les utilisateurs ni l’historique métier. L’API répond à des requêtes du téléphone : dernier état d’une salle, fraîcheur, erreurs explicites. MQTT est publication/abonnement ; HTTP est requête/réponse.

## Actualisation et fraîcheur

L’application interroge `GET /api/rooms` toutes les 3 secondes. Le **détail d’une salle** charge `GET /api/devices/:id/history` (moyennes 10 min, synthèse 30 jours). Une mesure est **récente** (`fresh`) si son `observed_at` a moins de **10 s** (`FRESHNESS_MS`) ; sinon `stale`. La disponibilité MQTT (`online` / `offline`) est distincte : un objet peut rester `online` sans télémétrie (`pause`) — l’UI affiche alors « Donnée ancienne », pas « Téléphone hors ligne ».

## Deux bases

| Base | Rôle | Contenu | Consommateur |
|---|---|---|---|
| `campus_lake` (MongoDB) | Data lake — flux brut | collection `mqtt_events` (append-only, TTL 7 j) | audit |
| `campus` (PostgreSQL) | Données **propres** pour le produit | `Device`, `Measurement` (200), `MeasurementAverage` (30 j) | `GET /api/*`, mobile |

Chaque message MQTT est d’abord **inséré** dans Mongo (`insertOne`, jamais d’update), puis traité par les règles métier. L’API ne lit **jamais** le lake.

## Persistance API (`campus`)

- **`Measurement`** : journal append-only (sauf purge de borne). Contrainte unique sur `message_id` → doublon MQTT ignoré.
- **`MeasurementAverage`** : moyenne 10 min (sommes + compteur), conservée 30 jours. Calculée à chaque insertion valide.
- **`Device`** : projection du dernier état. Une mesure en retard est stockée mais ne fait pas reculer `lastObservedAt`.
- **Borne brute** : après insertion, au plus `HISTORY_LIMIT` (200) mesures par objet (les plus récentes par `observedAt`).

## Data lake (`campus_lake` / MongoDB)

- Collection **`mqtt_events`** : `topic`, `deviceId`, `messageKind`, `messageId`, `payloadRaw`, `payload`, `receivedAt`.
- **Append-only** : pas de verrou « update après insert » ; adapté à un volume élevé.
- **TTL 7 jours** sur `receivedAt` (`mqtt_events_ttl`). Indexes de lecture : `receivedAt`, `(deviceId, receivedAt)`, `messageId` (sparse).

## Cache mobile

Après une lecture réussie, les salles sont sauvées dans AsyncStorage avec `cachedAt`. L’état UI (salles, salle ouverte, historique, période du graphique) est dans un store **Zustand** (`mobile/src/store.ts`). Hors ligne (NetInfo), l’app affiche ce cache avec dates. Au retour au premier plan (AppState `active`), un seul polling reprend sans écran de chargement infini si le cache existe. Pas de file de commandes hors ligne (J3).

Trois bandeaux distincts :

| Signal | Signification |
|---|---|
| Téléphone hors ligne | NetInfo : pas de réseau sur le mobile |
| Donnée ancienne | `freshness: stale` (mesure trop vieille) |
| Objet hors ligne | `availability: offline` (MQTT / LWT) |

## Identifiants

Les objets `sensor-001` à `sensor-003` restent les mêmes du topic MQTT jusqu’à l’écran. `message_id` identifie une observation. `room_id` initial vient du kit ; le registre backend pourra diverger après association QR (J3).

## Paramètres

| Clé | Valeur |
|---|---|
| `FRESHNESS_MS` | 10000 |
| `COMMAND_TIMEOUT_MS` | 15000 (prévu J3) |
| `ALERT_CO2_PPM` | 1500 (prévu J4) |
| `HISTORY_LIMIT` | 200 |
| `AVERAGE_WINDOW_MS` | 600000 (10 min) |
| `AVERAGE_RETENTION_MS` | 2592000000 (30 j) |
| `LAKE_TTL_SECONDS` | 604800 (7 j) |

Pourquoi PostgreSQL et un CQRS léger : [décision 002](decisions/002-architecture.md). Déduplication et cache : [décision 003](decisions/003-deduplication-cache.md). Lake Mongo + API Postgres : [décision 004](decisions/004-dual-database.md). Rétention : [décision 005](decisions/005-retention.md).
