# 009 — Validation métier, autorité room_id, atomicité du latest

## Contexte

Après J3, trois investigations ont montré que le contrat Zod (structure / types / unités) ne suffit pas : des mesures physiquement absurdes ou datées dans le futur passent ; le `room_id` du payload peut diverger du registre ; la règle « ne pas régresser le latest » n’est pas atomique sous concurrence.

## Décisions

### 1. Trois niveaux de validation

| Niveau | Rôle | Où |
|---|---|---|
| **Contrat** | JSON, littéraux, types, unités (`°C`, `ppm`) | Zod `telemetrySchema` |
| **Technique** | Topic ↔ `device_id`, device connu, dédup `message_id` | `ingest.ts` |
| **Métier** | Plages physiques + cohérence temporelle | `telemetrySchema` / garde avant insert |

**Règles métier retenues (correction) :**

- température ∈ **[-40, 80] °C** (hors plage → `telemetry.rejected` `reason=out_of_range`) ;
- CO₂ ∈ **[0, 5000] ppm** (couvre le modèle kit + incidents `high-co2`, refuse 99999) ;
- `observed_at` ne doit pas être dans le futur au-delà d’une tolérance d’horloge (**60 s**) → rejet `observed_at_in_future`.

Le data lake Mongo continue de recevoir le brut (audit) ; le refus concerne PostgreSQL métier.

### 2. Autorité du `room_id`

**Le registre backend (`Device.roomId`, catalogue) fait foi** pour l’affectation salle exposée par l’API et pour les écritures `Measurement` / moyennes.

Le `room_id` du payload MQTT reste dans le contrat (kit) : utile pour audit et détection d’incohérence. En cas de divergence :

- log `telemetry.room_mismatch` (device + payloadRoomId + registryRoomId) ;
- persistance métier avec **`Device.roomId`**, pas `salle-666`.

Pourquoi garder le champ dans la télémétrie : contrat kit, diagnostic, future association QR — pas pour déplacer l’objet silencieusement.

### 3. Latest sous concurrence

La lecture `lastObservedAt` puis `update` n’est pas atomique. Preuve modèle : `concurrency.model.test.ts`.

**Correction :** `updateMany` conditionnel  
`WHERE lastObservedAt IS NULL OR lastObservedAt <= incoming` ; si `count = 0`, journaliser comme `telemetry.stale_kept` (course perdue ou message plus ancien).

Limite restante : un seul process backend dans le TP ; l’atomicité SQL protège aussi un scale horizontal modeste.

## Conséquences

- Une date future ne peut plus « verrouiller » le latest jusqu’en 2099.
- L’UI ne peut plus afficher −300 °C / 99999 ppm comme état courant via le chemin métier.
- L’API rooms reste alignée sur le catalogue même si le payload ment sur la salle.
- Le test séquentiel `tools incident … delay` reste valide ; la concurrence est couverte par le modèle + l’update conditionnel.

## Preuves

Voir investigations dans [docs/J3.md](../J3.md) § « Investigations post-J3 ».
