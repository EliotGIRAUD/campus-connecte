# Campus connecté

Backend IoT (Express) et application mobile (React Native / Expo) pour superviser un campus simulé : température, CO₂ et ventilation.

Kit simulateur : [MdsIoTMobile](https://github.com/LargeGaultier/MdsIoTMobile) version `852f1b1`.

## Prérequis

- Docker Desktop (conteneurs Linux) avec `docker compose`
- Node.js 22+
- Un émulateur Android, un téléphone, ou Expo Web pour la démo J1

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

Application mobile :

```powershell
cd mobile
npm install
npx expo start
```

Adresse de l’API selon le terminal :

| Terminal | `EXPO_PUBLIC_API_URL` |
|---|---|
| Expo Web / simulateur iOS | `http://localhost:3000` |
| Émulateur Android | `http://10.0.2.2:3000` |
| Téléphone physique | `http://IP_LAN_DU_PC:3000` |

`localhost` sur un téléphone désigne le téléphone, pas l’ordinateur.

## Arrêt

```powershell
docker compose down
```

Remise à zéro du broker et de PostgreSQL :

```powershell
docker compose down -v
```

## Paramètres métier

| Paramètre | Valeur | Signification |
|---|---|---|
| Fraîcheur | 10 s | Une mesure est récente si `now - observed_at < 10 s` |
| Timeout commande | 15 s | À implémenter J3 |
| Alerte CO₂ | 1500 ppm | À implémenter J4 |
| Historique | 200 mesures / objet | Borne de lecture |

## Structure

```
backend/   API Express, client MQTT, PostgreSQL (API) + MongoDB (data lake)
mobile/    Application Expo
infra/     Kit Mosquitto + simulateur (non modifié)
docs/      Architecture, décisions, plans et journaux J1–J4 (voir docs/repartition.md)
```
