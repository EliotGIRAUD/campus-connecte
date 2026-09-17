# Campus connecté — mobile

Application Expo (React Native) du projet Campus connecté.

## Scripts

```bash
npm install
npm start
npm test   # tests purs (fraîcheur, libellés) via tsx
```

## Structure

| Chemin | Rôle |
|---|---|
| `App.tsx` | Shell (polling, NetInfo, navigation liste/détail) |
| `src/components/` | Cartes salle, détail, bandeaux, métriques |
| `src/freshness.ts` | Recalcul local `fresh` / `stale` (10 s) |
| `src/store.ts` | Zustand : salles, cache, historique |
| `src/api.ts` | REST ; `EXPO_PUBLIC_API_URL` prioritaire |

Voir le README racine pour l’adresse de l’API selon le terminal.
