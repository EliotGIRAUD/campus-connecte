# 011 — Cycle de vie des commandes, timeout et idempotence

- **Contexte :** le téléphone demande une action (ventilation) ; MQTT et l’objet n’offrent pas de transaction. Il faut distinguer acceptation API, publication, réception objet et exécution réelle, sans présenter un succès avant ACK.
- **Décision :**
  - Contrat MQTT kit : `…/commands` (backend → objet) et `…/results` (ACK / reject), QoS 1, **jamais retained**.
  - États persistés : `PENDING` → `SENT` → `ACKNOWLEDGED` | `FAILED` | `TIMEOUT`.
  - `expires_at` = `now + COMMAND_TIMEOUT_MS` (défaut 15 s) ; balayage 1 s → `TIMEOUT` si pas d’ACK.
  - Corrélation stricte sur `command_id` (aussi `commandId` dans les logs / LogQL).
  - **ACK tardif** (après `TIMEOUT`) : champs résultat + `late_ack_at` renseignés, **statut reste `TIMEOUT`** (l’UI ne repasse pas en succès).
  - **Idempotence :** même `command_id` + même contenu → API renvoie la commande existante ; ACK dupliqué sur état terminal → `command.ack_duplicate` ignoré. Le simulateur refuse un même id avec un contenu différent.
- **Alternatives envisagées :** basculer `TIMEOUT` → `ACKNOWLEDGED` sur ACK tardif (rejeté : mentirait à l’utilisateur) ; file offline des commandes (hors périmètre J4 — sessions clean côté objet).
- **Conséquences :** le mobile poll `GET …/commands/:id` jusqu’à un état terminal ; preuves filtrables sur `commandId` ; objet hors ligne ⇒ timeout reproductible (pas de rétention des commandes côté kit).
