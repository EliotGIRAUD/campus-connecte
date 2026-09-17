# 006 — Identité des devices et surface d’attaque MQTT

## Contexte

Plusieurs capteurs publient en parallèle. Un client mal configuré (ou le compte pédagogique `teacher`) peut publier sur le topic d’un autre objet. Il faut savoir **qui** est l’objet, et ce qui empêche (ou non) une usurpation.

## Décision

L’identité métier d’un objet est le `device_id` stable (`sensor-001` …), aligné sur :

1. le **segment de topic** `campus/v1/devices/{device_id}/…` ;
2. le champ `device_id` du payload (doit **égaliser** le topic, sinon rejet `device_id_mismatch`) ;
3. la clé primaire PostgreSQL `Device.id` (registre backend) ;
4. les logs (`deviceId`) et la corrélation mesure (`eventId` = `message_id`).

L’accès au broker repose sur des **comptes Mosquitto + ACL** (simulator / backend / teacher), pas sur mTLS ni certificats par device.

## Alternatives envisagées

| Option | Intérêt | Pourquoi pas ici |
|---|---|---|
| Faire confiance au seul payload | Simple | Usurpation triviale |
| mTLS / certificat par capteur | Forte authentification device | Hors kit, hors délai pédagogique |
| Un seul topic pour tous | Moins de topics | Mélange des flux, filtrage fragile |
| **Topic + cohérence payload + ACL** | Déjà dans le kit ; démontrable | Isolation imparfaite si on possède `teacher` |

## Conséquences

- Un message avec `device_id` ≠ topic est **rejeté** avant PostgreSQL (`telemetry.rejected`).
- Sans credentials ACL, on ne peut pas publier sur les topics devices.
- Avec le compte `teacher` (readwrite `campus/#`), on **peut** publier un faux message **cohérent** topic/payload : limitation pédagogique à expliquer en soutenance.
- Voir preuves scénario « Usurpation » dans [docs/J3.md](../J3.md).
