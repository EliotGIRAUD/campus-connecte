# 008 — Indisponibilité broker, QoS et session MQTT

## Contexte

Le broker peut s’arrêter ; le backend aussi. MQTT offre QoS 0 / 1 / 2. Il faut documenter ce qui est **vraiment** garanti dans *notre* déploiement (pas la théorie seule).

## Décision

- Client backend : `clean: false`, `clientId` **stable** (`campus-backend` / `MQTT_CLIENT_ID`), `reconnectPeriod: 2000`, abonnements QoS **1** (aligné contrat kit).
- Mosquitto : `persistence true` (volume `broker-data`), `max_queued_messages 5000` pour la file offline du client persistant.
- Simulateur : publie la télémétrie en QoS **1**, **sans** retained ; `state` / `availability` sont retained.
- En panne broker : événements `mqtt.disconnected` / `mqtt.reconnecting` / `mqtt.connected` ; pas d’attente infinie silencieuse.
- En panne backend : tant que le **broker** reste up, les publications QoS ≥ 1 destinées au client `campus-backend` sont **mises en file** et **livrées au retour** (session persistante).

## Alternatives envisagées

| Option | Intérêt | Limite |
|---|---|---|
| **Session persistante + QoS 1** | Moins de perte à la reprise backend | `clientId` unique (un seul replica MQTT) ; file bornée ; doublons possibles |
| QoS 2 | Exactement une fois (théorie) | Coût, peu utile ici |
| File applicative hors ligne | Reprise métier | Risque de commandes fantômes (interdit plus tard pour commandes) |
| Clean + QoS 1 + logs | Simple | Trou de données si backend down |

## Conséquences

- QoS 1 ⇒ at-least-once ⇒ **doublons possibles** (surtout à la reprise de file) → contrainte unique `message_id`.
- `clientId` fixe : **ne pas** scaler plusieurs backends MQTT avec le même id (kick mutuel). Un seul consommateur `campus-backend`.
- File Mosquitto bornée (`max_queued_messages`) : une panne backend **très longue** peut encore perdre les messages au-delà de la limite.
- Panne **broker** : la file offline du client ne s’applique pas de la même façon ; le simulateur suspend / messages en transit fragiles.
- QoS 0 testé à chaud : livré si broker + subscriber UP ; n’améliore pas la survie à une panne.
- Une mesure retained « anormale » avec ancien `observed_at` est stockée mais **ne devient pas** le latest (`stale_kept`) ; la fraîcheur API reste basée sur `observed_at`.
- Preuves : [docs/J3.md](../J3.md) scénarios broker, backend, QoS, retained.
