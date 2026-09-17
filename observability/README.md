# Observabilité Campus (Grafana + Loki + Promtail)

## Accès

| Service | URL |
|---|---|
| **Grafana** | http://localhost:3001 |
| Loki | http://localhost:3100 |

- Accès anonyme en **Viewer** (pas besoin de login pour lire).
- Admin : `admin` / `campus-demo` (pédagogique, `.env.example`).

Page d’accueil Grafana = dashboard **Campus — Vue opérationnelle**.

## Dashboards provisionnés (dossier *Campus*)

| Dashboard | Lien direct | Contenu |
|---|---|---|
| **Vue opérationnelle** | http://localhost:3001/d/campus-ops | Compteurs, débit/s, ingestions par device, logs filtrables |
| **Recettes J3** | http://localhost:3001/d/campus-j3-recettes | Un panneau par scénario (rejet, doublon, MQTT, eventId…) |
| Logs backend (simple) | http://localhost:3001/d/campus-backend-logs | Flux brut + rejets + MQTT |

Menu : **Dashboards → Campus**.

Si les panels sont vides : plage de temps **Last 30 minutes** (horloge en haut à droite) + attendre ~5 s le refresh.

## Requêtes LogQL (Explore)

Datasource : **Loki**.

### Par device

```logql
{compose_service="backend", deviceId="sensor-001"}
```

### Rejets

```logql
{compose_service="backend", eventType="telemetry.rejected"}
```

### Doublons

```logql
{compose_service="backend", eventType="telemetry.duplicate"}
```

### Mesures anciennes conservées

```logql
{compose_service="backend", eventType="telemetry.stale_kept"}
```

### Suivre une mesure (`eventId` = `message_id`)

```logql
{compose_service="backend"} |= "REMPLACER_MESSAGE_ID"
```

### Erreurs / état MQTT

```logql
{compose_service="backend", eventType=~"mqtt.+"}
```

### Ingestions réussies

```logql
{compose_service="backend", eventType="telemetry.ingested"}
```

## Notes

- Promtail scrape **uniquement** le service `backend` (preuves J3, limite d’ingestion Loki).
- Les lignes sont du JSON pino ; `eventType` / `deviceId` sont aussi des **labels** Loki.
