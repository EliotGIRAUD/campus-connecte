# 012 — Alertes CO₂ avec hystérésis (une ouverte par objet)

- **Contexte :** J5 exige de signaler une anomalie CO₂ sans créer une nouvelle ligne d’alerte à chaque télémétrie, et de documenter le retour à la normale. Le kit fournit `high-co2` / `normal-co2` pour la démo.
- **Décision :**
  - Type d’alerte produit : `high_co2`.
  - Seuils configurables : ouverture si `CO₂ ≥ ALERT_CO2_PPM` (1500) ; fermeture si `CO₂ ≤ ALERT_CO2_PPM − ALERT_HYSTERESIS_PPM` (1300).
  - Au plus **une** alerte `OPEN` par `(deviceId, type)` — index unique partiel Postgres.
  - Évaluation uniquement quand une télémétrie **met à jour** le latest device (pas sur doublon ni mesure en retard `stale_kept`).
  - États : `OPEN` → `RESOLVED` ; le pic (`peakCo2`) est mis à jour tant que l’alerte reste ouverte.
  - API : `active_alert` sur les devices ; `GET /api/alerts` ; `GET /api/devices/:id/alerts`.
  - Logs : `alert.opened` / `alert.resolved` / `alert.peak_updated` avec `alertId`, `deviceId`, `eventId` (`message_id`).
- **Alternatives envisagées :** alerte purement côté mobile (rejeté : pas de preuve serveur, spam UI) ; ouvrir/fermer au même seuil (rejeté : scintillement autour de 1500) ; file d’alertes push (hors périmètre).
- **Conséquences :** le mobile affiche « Alerte CO₂ » seulement si le backend a une alerte ouverte ; l’air « CO₂ élevé » reste un indice d’affichage local. Preuve démo : incident `high-co2` → une alerte ; `normal-co2` → résolution.
