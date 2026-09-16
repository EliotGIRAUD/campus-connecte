# 002 — PostgreSQL et architecture (CQRS léger)

## Résumé

Les capteurs **écrivent** en continu (MQTT). Le téléphone **lit** un état déjà validé (HTTP). Ce n’est pas un CRUD : on sépare lecture et écriture, et on stocke ça dans PostgreSQL.

- **PostgreSQL** : plusieurs accès en même temps, pas deux fois la même mesure, historique + dernier état, prêt pour les utilisateurs et les commandes.
- **CQRS léger** : les lectures (`GET`) ne changent rien ; les écritures (télémétrie, plus tard ventilation) passent par un autre chemin. Table `Device` = ce qu’on affiche maintenant. Table `Measurement` = l’historique.

## Problème

Superviser un campus simulé : mesures toutes les 2 secondes, doublons MQTT possibles, messages parfois en retard, téléphone qui affiche le dernier état et un historique. Il faut choisir une base et une façon d’organiser lectures / écritures, sans sur-ingénierie en cinq jours.

## Options

**Base de données**

| Option | Intérêt | Limite ici |
|---|---|---|
| SQLite | Simple, fichier local | Un écrivain à la fois ; fragile dès que MQTT et HTTP tapent ensemble |
| MongoDB | JSON facile | On a déjà un contrat strict (Zod) ; on *veut* le schéma, pas l’abandonner |
| Influx / Timescale | Spécialiste séries temporelles | Trop lourd pour 3 objets et 200 points ; peu adapté aux users / salles / commandes |
| **PostgreSQL** | Contraintes, concurrence, historique et métier dans la même base | Un peu plus lourd que SQLite (un service Docker de plus) |

**Architecture**

| Option | Intérêt | Limite ici |
|---|---|---|
| CRUD unique (`UPDATE` du capteur) | Simple | Un doublon ou un retard écrase n’importe comment l’écran ; un `GET` pourrait déclencher une action |
| Event sourcing complet (rejouer tout l’historique) | Très « pur » | Trop lourd pour 5 jours et 3 capteurs |
| Mobile branché au broker MQTT | Temps réel | Interdit pour le socle ; mélange transport et métier (droits, historique, timeout) |
| **CQRS léger** (écrire d’un côté, lire de l’autre) | Colle à l’IoT : flux vs écran | Ce n’est pas un CQRS « deux bases / bus d’événements » |

## Choix et compromis

**PostgreSQL + Prisma**

- Contrainte unique sur `message_id` : un doublon QoS 1 est ignoré, pas recopié.
- MQTT (écritures) et HTTP (lectures) en parallèle, sans fichier SQLite unique.
- Deux usages dans la même base : dernier état **et** historique borné.
- Même moteur pour la suite : utilisateurs, commandes, association QR.
- Compromis : un conteneur de plus, mais une seule techno à expliquer et à opérer.

**CQRS léger (pas un framework)**

- **Query (lecture)** : `GET /api/rooms`, `GET /api/devices/:id`. Réponse immédiate. Relire ne change rien.
- **Command / écriture** : ingestion MQTT aujourd’hui ; `set_ventilation` à partir de J3. Asynchrone, timeout 15 s, parfois aucune réponse.
- **`Measurement`** : journal. On **ajoute** une mesure valide, on ne la réécrit pas.
- **`Device`** : vue actuelle (projection). Température, CO₂, ventilation, disponibilité : ce que le téléphone affiche sans relire tout l’historique.
- Un message **en retard** est gardé dans l’historique, mais **n’écrase pas** l’état courant.
- Le téléphone ne parle pas à Mosquitto. Le broker achemine ; l’API traduit un état métier (salles, fraîcheur, erreurs).

Ce n’est pas de l’event sourcing complet : on ne reconstruit pas l’état en rejouant toutes les mesures. On tient un journal **et** une copie à jour. Assez pour être correct, assez simple pour J1–J4.

## Aide de l’IA

Comparaison SQLite / PostgreSQL / Mongo et CRUD / CQRS / event sourcing. Le contrat MQTT (topics, `message_id`, commandes) vient du kit `852f1b1`, pas d’une invention backend.

## Vérification

- Doublon MQTT : log `doublon ignore`, une seule ligne `Measurement`.
- Mesure ancienne : log `mesure ancienne conservee` ; `GET /api/rooms` garde la mesure la plus récente.
- `GET /api/rooms` lit `Device` ; `GET /api/devices/:id` lit aussi l’historique `Measurement`.
- `GET /health` : base `up`.

## Limite

- Une seule base API à l’origine ; le data lake (`campus_lake`) est ajouté en [004](004-dual-database.md).
- Pas de bus d’événements ni de replay.
- Commandes, auth et alertes : J3 / J4. Le schéma CQRS est déjà là pour les accueillir : un `GET` ne publiera pas de commande MQTT.
