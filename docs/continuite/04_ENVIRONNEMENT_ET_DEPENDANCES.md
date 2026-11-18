# Environnement, dépendances et réinstallation

## Versions constatées

| Outil | Version constatée | Niveau de preuve / remarque |
|---|---|---|
| Node.js | 22.23.4 | `node --version` lors de la préparation |
| npm | 10.9.9 | `npm --version` lors de la préparation |
| .NET SDK sélectionné | 10.0.403 | `dotnet --version` avec `$HOME/.dotnet` dans PATH |
| SDK .NET installé dans ce profil | 10.0.100 et 10.0.403 | `dotnet --list-sdks`; local à cette machine/session, à réinstaller ou configurer après réinstallation |
| Frontend | React `^19.0.1`, Vite `^8.3.0`, TypeScript `^7.0.2` | Versions déclarées dans `package.json` |
| Backend | `net10.0` sur les quatre projets | Ciblage explicite dans les `.csproj` |

`global.json` exige la famille SDK 10.0.100 et permet `latestFeature`; la CI installe `10.0.x`. Après réinstallation, installer un SDK .NET 10 compatible avant tout `dotnet` dans ce dépôt. Le runtime de déploiement est décrit dans Bicep, mais aucun déploiement n’est prouvé.

## Dossiers principaux

- `src/`, `scripts/` : frontend, services Graph/transcript et tests TypeScript.
- `backend/ReadMeeting.sln`, `backend/src/ReadMeeting.*` : solution et couches .NET.
- `infra/` : infrastructure déclarative Bicep.
- `.github/workflows/ci.yml` : CI déclarée.
- `docs/preparation-architecture/` : référentiel global.
- `docs/conception-technique/meeting-transcript/` : conception brique 01.
- `docs/implementation/` : rapports Lot 0.
- `docs/continuite/` : présente passation.

## Commandes utiles

Depuis la racine :

```sh
npm install
npm run dev
npm run lint
npm run test:transcript
npm run build

dotnet --info
dotnet restore backend/ReadMeeting.sln
dotnet build backend/ReadMeeting.sln --no-restore --configuration Release
dotnet run --project backend/src/ReadMeeting.Api/ReadMeeting.Api.csproj --urls http://127.0.0.1:5078
curl -i http://127.0.0.1:5078/health
```

Le serveur Vite utilise le port 3000 selon `package.json`. L’API minimale peut utiliser une URL locale/port choisi avec `--urls`. Le Lot 0 n’établit aucun proxy frontend vers l’API.

Scripts présents supplémentaires : `test:uri`, `test:graph`, `test:notification`, `test:consent`, `test:real-transcript`, `test:attendee`. Les tests nommés `real` ne doivent pas être considérés comme exécutables ou comme preuves Graph réelles sans inspecter leur mode d’authentification et leurs prérequis ; les scripts Graph mockés ne remplacent pas la validation tenant.

## Variables d’environnement — noms uniquement

Noms relevés sans lire ni reporter les valeurs :

- `GEMINI_API_KEY` — clé indiquée par le README d’origine pour l’application AI Studio ; la présence d’une dépendance ou de cette variable ne prouve pas une intégration métier approuvée. Vérifier sa nature et sa gouvernance avec le responsable/DSI.
- `APP_URL` — URL applicative indiquée dans l’exemple d’environnement ; usage courant à confirmer.
- `VITE_AZURE_CLIENT_ID` — identifiant client public de la SPA.
- `VITE_AZURE_TENANT_ID` — tenant configuré pour MSAL.
- `VITE_AZURE_REDIRECT_URI` — URI de retour MSAL ; doit correspondre à la configuration Entra de l’environnement.
- `VITE_GRAPH_SCOPES` — nom présent dans les fichiers d’environnement ; vérifier s’il est effectivement consommé. Le code `msalConfig.ts` définit aussi des scopes directement.

Les variables `VITE_*` sont incorporées au frontend et ne doivent jamais porter de credential serveur. Les valeurs de `.env.local` ne sont pas documentées. Ne pas réutiliser une valeur d’exemple dont la nature est incertaine. Ne jamais mettre secret client/OBO, token ou credential serveur dans une variable `VITE_*`.

## À reconfigurer après réinstallation

1. Installer Git, Node.js 22/npm et .NET SDK 10 compatible avec `global.json`.
2. Récupérer le dépôt et restaurer **aussi** les fichiers non suivis sauvegardés ; le remote seul ne contient pas forcément ce travail.
3. Installer les dépendances frontend et vérifier le lockfile réellement sauvegardé/suivi.
4. Restaurer les variables locales nécessaires depuis un coffre ou une sauvegarde protégée ; vérifier leur validité sans les publier.
5. Confirmer l’URI de redirection de l’environnement local dans Entra, le tenant/client utilisés et les consentements effectivement disponibles.
6. Rejouer les tests locaux et vérifier `/health`; ne pas appeler de test Graph authentifié sans accord et compte/réunion de test autorisés.

La configuration Entra et les permissions ne sont pas reconstituées automatiquement par la restauration du dépôt.
