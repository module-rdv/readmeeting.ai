# État des lots et intégrité Git

## Suivi des lots

| Lot | Désignation | État | Observations et preuves |
|---|---|---|---|
| 0 | Socle .NET exécutable | **Clôturé selon le responsable ; validation locale rapportée** | Rapports Lot 0 : restore/build .NET, lint/build frontend, démarrage de l’API et HTTP 200 sur `/health`. Le rapport d’audit final existe. Le workflow distant GitHub Actions n’est pas confirmé comme exécuté. |
| 1 | API Security & Authentication | **Autorisé, non commencé** | État déclaré par le responsable. Aucun JWT/API audience/OBO n’est établi dans `Program.cs`. Voir le cadrage de passation, pas une autorisation d’exécution supplémentaire. |
| Suivants | Brique 01 métier et lots IA, documents, SharePoint, Teams live | **À planifier selon les référentiels** | Ne pas commencer avant mission explicite et résolution des décisions/prérequis correspondant au lot. |

### Détails des preuves du Lot 0

- **Vérifié dans le code maintenant :** projets `net10.0`, point d’entrée API, références entre projets, mapping de `/health`.
- **Résultats antérieurs documentés :** `dotnet restore`, build Release, `npm run lint`, `npm run build`, démarrage et réponse HTTP 200 `Healthy`.
- **Non confirmé :** exécution actuelle de toutes ces commandes après réinstallation, CI distante, déploiement Azure.
- Le build frontend a rapporté un avertissement de gros chunks, non bloquant.

## État Git observé le 13 novembre 2026

- Branche courante : `main`.
- Derniers commits visibles : `db687cf` (HEAD et `origin/main`) puis `6885337`; les deux sont présentés comme `first commit`.
- Le dépôt n’est pas propre. Le statut comprend les éléments ci-dessous ; aucun n’a été nettoyé, restauré ou commité durant la préparation de la passation.

### Fichiers modifiés suivis

`.env.example`, `.github/workflows/ci.yml`, `bun.lock`, `infra/main.bicep`, `package.json`, `scripts/test-attendee-transcripts.ts`, `scripts/test-real-teams-transcript.ts`, `scripts/test-transcript-service.ts`, `src/App.tsx`, `src/components/DashboardView.tsx`, `src/components/TranscriptViewerModal.tsx`, `src/services/graphClient.ts`, `src/services/transcriptService.ts`, `src/types/meeting.ts`, `src/types/transcript.ts`.

### Fichiers non suivis observés

- Backend Lot 0 : `global.json`, les quatre `.csproj`, `Program.cs`, `appsettings.json`.
- Frontend : `src/services/organizerClassification.ts`.
- Lockfile npm : `package-lock.json`.
- Documents : tout `docs/preparation-architecture/`, `docs/conception-technique/`, `docs/implementation/`.

La liste exacte est à reconfirmer avec `git status --short` dans l’environnement de reprise : elle décrit le worktree inspecté et peut changer.

## Attribution et limites

- **Attribués au Lot 0 par ses rapports :** création du socle de projets .NET et `global.json`; modification de CI et `infra/main.bicep`; rapports documentaires Lot 0.
- **Présents dans le worktree, mais attribution non prouvable exhaustivement :** modifications des sources frontend/transcript et scripts, modifications `.env.example`, `package.json`, `bun.lock`, ajout `organizerClassification.ts` et `package-lock.json`, ainsi que les dossiers documentaires de conception/préparation. Ils peuvent refléter des missions antérieures, du travail préexistant ou des changements ultérieurs.
- `docs/continuite/` est ajouté pour cette passation.
- Les commits disponibles ne fournissent pas un point de comparaison fiable pour distinguer chaque modification de l’état précédant les missions. Ne pas présumer que tout le worktree appartient au Lot 0 ou à la passation.
- `.env.local` est présent selon l’environnement de session ; aucune valeur n’a été consultée. Le statut de ce fichier n’est pas inféré ici.

## Sauvegarde avant réinstallation

Faire une sauvegarde complète du worktree, y compris fichiers non suivis, documents, changements suivis et état de branche. Les secrets ne doivent pas être placés dans un dépôt, un rapport, un commit ou une archive non protégée. Préserver `.env.local` séparément via un mécanisme sécurisé choisi par le responsable ; ne pas le recopier dans les documents de passation. Confirmer ensuite que la sauvegarde contient bien les sources et documents listés, sans afficher ses valeurs sensibles.
