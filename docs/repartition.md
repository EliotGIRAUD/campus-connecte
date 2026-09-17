# Répartition des journées

| Jour | Qui | Fichier plan | Thème |
|---|---|---|---|
| J1 | équipe | [J1.md](J1.md) (réalisé) | Capteur → téléphone |
| J2 | collègue | [J2.md](J2.md) | Données fiables (doublon, retard, cache) |
| J3 | toi | [J3.md](J3.md) | Fiabiliser / observer (validation, pannes, Grafana+Loki) |
| J4 | collègue | [J4.md](J4.md) | Commander un objet et confirmer l’exécution (ACK, timeout, idempotence) |
| J5 | équipe | [J5.md](J5.md) | Produit exploitable (alertes, README, gel fonctionnel) |
| J6 | équipe | soutenance | Stabilisation et preuves — pas de nouvelles features |

Enchaînement : **J2 → J3 → J4 → J5**. Chaque journée se termine par un push, un tag `J2` / `J3` / `J4` / `J5`, et le remplissage des rubriques *Fonctionne / Incomplet / Limites / Contributions* dans le fichier du jour.

**Note J3 :** l’ancien plan « auth / QR / commandes » ne correspondait pas à l’énoncé ; J3 = fiabilité + observabilité. Les commandes + ACK sont J4 ; alertes et gel sont J5.

**Fin J5 :** gel du périmètre fonctionnel. Entre J5 et J6, aucun volume de travail d’implémentation n’est supposé — seulement stabilisation et preuves pour la soutenance.

Chaque membre doit pouvoir expliquer **les deux axes** (IoT et mobile), même s’il n’a pas codé la journée.
