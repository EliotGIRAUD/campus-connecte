# Campus connecté

Backend IoT (Express) et application mobile (React Native / Expo) pour superviser un campus simulé : température, CO₂ et ventilation.

Kit simulateur : [MdsIoTMobile](https://github.com/LargeGaultier/MdsIoTMobile) version `852f1b1`.

## Prérequis

- Docker Desktop (conteneurs Linux) avec `docker compose`
- Node.js 22+
- Un émulateur Android, un téléphone, ou Expo Web pour la démo

## Démarrage

```powershell
Copy-Item .env.example .env
docker compose up -d --build --wait
```

Vérifier le broker et le simulateur :

```powershell
docker compose logs --tail 30 simulator
docker compose run --rm --build tools watch --count 10
```

Vérifier l’API :

```powershell
curl http://localhost:3000/health
curl http://localhost:3000/api/rooms
```

### Observabilité (J3)

| Service | URL |
|---|---|
| Grafana | http://localhost:3001 (Viewer anonyme ; admin / `campus-demo`) |
| Loki | http://localhost:3100 |
| **Dashboard ops** | http://localhost:3001/d/campus-ops |
| **Dashboard recettes J3** | http://localhost:3001/d/campus-j3-recettes |

Requêtes LogQL : [observability/README.md](observability/README.md).

Application mobile :

```powershell
cd mobile
npm install
npx expo start
```

Adresse de l’API selon le terminal :

| Priorité | Source | Exemple |
|---|---|---|
| 1 | `EXPO_PUBLIC_API_URL` si défini | `http://10.0.2.2:3000` (émulateur Android) |
| 2 | Hôte LAN détecté via Expo | `http://192.168.x.x:3000` (téléphone physique) |
| 3 | Défaut | `http://localhost:3000` (Expo Web / simulateur iOS) |

`localhost` sur un téléphone désigne le téléphone, pas l’ordinateur. Sur un émulateur Android, définir explicitement `EXPO_PUBLIC_API_URL=http://10.0.2.2:3000`.

## Arrêt

```powershell
docker compose down
```

Remise à zéro (broker, Postgres, Mongo, Loki, Grafana) :

```powershell
docker compose down -v
```

## Paramètres métier

| Paramètre | Valeur | Signification |
|---|---|---|
| Fraîcheur | 10 s | Une mesure est récente si `now - observed_at < 10 s` |
| Timeout commande | 15 s | Prévu journée commandes |
| Alerte CO₂ | 1500 ppm | Prévu journée alertes |
| Historique brut | 200 mesures / objet | Dernières mesures affichables |
| Moyenne 10 min | 30 jours | Historique allégé (détail salle) |
| Lake Mongo | 7 jours | TTL sur le flux brut |

Secrets : copier `.env.example` → `.env` ; **ne pas committer** `.env` avec des secrets réels. Les mots de passe du kit (`*-demo`) et Grafana `campus-demo` sont pédagogiques.

## Structure

```
backend/         API Express, client MQTT, PostgreSQL (API) + MongoDB (data lake)
mobile/          Application Expo
infra/           Kit Mosquitto + simulateur (non modifié)
observability/   Loki, Promtail, Grafana (provisioning)
docs/            Architecture, décisions, journaux J1–J5 (voir docs/repartition.md)
```
