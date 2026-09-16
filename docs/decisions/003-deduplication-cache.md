# 003 — Déduplication, historique borné et cache mobile

- **Problème :** MQTT peut rejouer une mesure, en livrer une ancienne après une récente, ou se taire ; le téléphone peut perdre le réseau. Il faut garder un historique fiable sans explosion de volume, et distinguer « téléphone coupé » de « objet silencieux ».
- **Options :** garder tout l’historique ; purger à la lecture ; borner à l’écriture ; cache HTTP vs AsyncStorage.
- **Choix et compromis :**
  - **Unique `message_id`** (contrainte Prisma) + log `doublon ignore` : pas de doublon métier.
  - **`shouldUpdateLatest`** : une mesure plus ancienne est **conservée** dans `Measurement` mais ne remplace pas `Device` ; log `mesure ancienne conservee`.
  - **`HISTORY_LIMIT` (200)** : après chaque insertion réussie, supprimer les mesures au-delà de la borne par objet (`historique borne`).
  - **Cache AsyncStorage** des dernières salles + `cachedAt` ; bandeau NetInfo « Téléphone hors ligne » distinct de « Donnée ancienne » (fraîcheur) et « Objet hors ligne » (availability).
- **Vérification :** `tools incident … duplicate|delay|pause` ; `GET /api/devices/sensor-001` ; mode avion après une lecture réussie.
- **Limite :** pas de file de commandes hors ligne (J3) ; le cache ne recalcule pas la fraîcheur serveur une fois figé.
