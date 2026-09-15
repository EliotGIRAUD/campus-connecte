# 001 — Choix de stack

- **Problème :** livrer en cinq jours un backend IoT, un stockage, une API et une application mobile, en justifiant les technologies.
- **Options :** FastAPI ou Express ; SQLite ou PostgreSQL ; React Native CLI ou Expo ; polling ou MQTT/WebSocket dans le mobile.
- **Choix et compromis :**
  - **Express + TypeScript** : même langage que React Native, `mqtt.js` mature, Docker simple.
  - **PostgreSQL + Prisma** : contrainte unique sur `message_id`, historique, utilisateurs à venir. Plus lourd que SQLite, plus fiable avec MQTT et HTTP en parallèle.
  - **Expo** : caméra, permissions, SecureStore et NetInfo sans éjecter le projet. Une seule base de code Android/iOS ; les stores ne sont pas exigés.
  - **Polling REST 3 s** : actualisation démontrable sans MQTT dans le téléphone (interdit par le sujet pour le socle).
- **Aide de l’IA :** proposition retenue après comparaison Express/FastAPI et Expo/CLI. Le contrat MQTT n’a pas été inventé : il vient du kit `852f1b1`.
- **Vérification :** `GET /health`, `GET /api/rooms`, observation `tools watch`, affichage mobile.
- **Limite :** pas d’auth JWT avant J3 ; pas de commandes ni d’alertes avant J3/J4.
