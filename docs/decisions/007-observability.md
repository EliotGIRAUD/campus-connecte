# 007 — Observabilité : Loki + logs structurés

## Contexte

J3 exige de **reproduire** et **prouver** des défauts (doublon, rejet, panne broker…) sans chercher dans plusieurs terminaux. `docker compose logs` ne suffit pas pour une personne extérieure ni pour des filtres stables (`deviceId`, `eventType`).

## Décision

- **Backend** : logs JSON sur stdout via pino + helper `logEvent` (`eventType`, `deviceId`, `eventId`, `topic`, `status`, `reason`, `service`).
- **Stack Compose** : Loki (stockage) + Promtail (scrape Docker) + Grafana (Explore / dashboard).
- Promtail scrape **uniquement** le service `backend` en local (volume de logs des autres services saturait Loki — 429).

## Alternatives envisagées

| Option | Intérêt | Limite |
|---|---|---|
| `docker compose logs \| grep` | Zéro infra | Pas centralisé, pas reproductible pour un externe |
| ELK / OpenSearch | Puissant | Trop lourd pour 5 jours |
| **Grafana + Loki** | Demandé par l’énoncé, léger | Limites d’ingestion à calibrer |

## Conséquences

- Grafana : http://localhost:3001 ; requêtes : [observability/README.md](../../observability/README.md).
- Preuves J3 = filtre LogQL + éventuellement `eventId`.
- Les mots de passe Grafana du `.env.example` sont **pédagogiques**.
- Dédup / fraîcheur restent documentés dans [003](003-deduplication-cache.md) ; ici on parle seulement d’**observation**.
