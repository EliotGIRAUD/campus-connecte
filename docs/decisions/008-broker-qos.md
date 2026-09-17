# 008 — Indisponibilité broker, QoS et session MQTT

## Contexte

Le broker peut s’arrêter ; le backend aussi. MQTT offre QoS 0 / 1 / 2. Il faut documenter ce qui est **vraiment** garanti dans *notre* déploiement (pas la théorie seule).

## Décision

- Client backend : `clean: true`, `reconnectPeriod: 2000`, abonnements QoS **1** (aligné contrat kit).
- Simulateur : publie la télémétrie en QoS **1**, **sans** retained ; `state` / `availability` sont retained.
- En panne broker : événements `mqtt.disconnected` / `mqtt.reconnecting` / `mqtt.connected` ; pas d’attente infinie silencieuse.
- En panne backend : les publications continue côté simulateur **ne sont pas** rejouées au backend (session propre).

## Alternatives envisagées

| Option | Intérêt | Limite |
|---|---|---|
| Session persistante + QoS 1 | Moins de perte à la reprise | Plus complexe ; hors délai / kit clean sessions |
| QoS 2 | Exactement une fois (théorie) | Coût, peu utile ici |
| File applicative hors ligne | Reprise métier | Risque de commandes fantômes (interdit plus tard pour commandes) |
| **Clean + QoS 1 + logs de reconnexion** | Simple, honnête sur les pertes | Trou de données si backend down |

## Conséquences

- QoS 1 ⇒ at-least-once ⇒ **doublons possibles** → d’où la contrainte unique `message_id`.
- QoS 0 testé à chaud : livré si broker + subscriber UP ; n’améliore pas la survie à une panne broker.
- Une mesure retained « anormale » avec ancien `observed_at` est stockée mais **ne devient pas** le latest (`stale_kept`) ; la fraîcheur API reste basée sur `observed_at`.
- Preuves : [docs/J3.md](../J3.md) scénarios broker, backend, QoS, retained.
