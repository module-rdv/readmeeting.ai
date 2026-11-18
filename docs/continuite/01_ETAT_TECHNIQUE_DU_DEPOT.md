# État technique du dépôt

## Niveaux de preuve

- **Vérifié ici** : inspection directe du worktree lors de la préparation de la passation.
- **Rapporté** : résultat inscrit dans les rapports du Lot 0 ou déclaré antérieurement ; à ne pas confondre avec une réexécution durant cette reprise.
- **Prévu / absent** : cible documentaire ou absence observée, non une capacité opérationnelle.
- **À vérifier** : dépend d’une exécution, d’un accès tenant, ou d’un état initial qui n’est plus disponible.

## Frontend

| Élément | État observé | Fichiers et preuves | Niveau |
|---|---|---|---|
| Application | React 19, Vite 8 et TypeScript ; scripts npm pour développement, lint/typecheck et build. | `package.json`, `src/App.tsx`, `src/main.tsx` | Versions déclarées vérifiées ; build rapportée OK, non rejouée durant cette passation. |
| Authentification SPA | MSAL Browser/React et configuration runtime avec variables `VITE_AZURE_*`; URI de redirection validée par code. | `src/config/msalConfig.ts`, `src/services/graphClient.ts` | Code observé ; configuration Entra active et valeurs locales non vérifiées. |
| Graph / réunions | Fonctions de calendrier et de résolution présentes côté client. | `src/services/graphClient.ts`, `src/services/transcriptService.ts` | Code observé ; droits effectifs dépendent de l’identité et du tenant. |
| Transcriptions | Récupération VTT, fallback sur format texte non attribué, analyse VTT/non attribuée et export client présents. | `src/services/transcriptService.ts`, `src/types/transcript.ts`, `src/components/TranscriptViewerModal.tsx` | Implémentation observée ; tests mockés présents dans `scripts/test-transcript-service.ts`. Le résultat de ces tests n’est pas certifié ici. |
| Interface et données | Dashboard, consultation de transcript et bibliothèque de rapports présents. | `src/components/`, `src/types/` | Code observé ; UI de rapports n’est pas la preuve d’une génération ou publication réelle. |
| IA | Dépendance `@google/genai` déclarée dans `package.json`; aucune intégration métier fonctionnelle n’est établie par cette inspection. | `package.json`, `src/` | Présence de dépendance vérifiée ; usage opérationnel absent/non démontré. |

## Backend .NET

| Projet / élément | État observé | Niveau |
|---|---|---|
| `ReadMeeting.Domain` | Projet `net10.0`; entités métier historiques telles que `Meeting`, `MeetingReport`, `ActionItem`. | Présence et cible vérifiées. |
| `ReadMeeting.Application` | Projet `net10.0`; contrat `IMicrosoftGraphService` présent. Aucun service Graph concret observé. | Présence vérifiée ; implémentation Graph absente. |
| `ReadMeeting.Infrastructure` | Projet `net10.0`, références de couches présentes. Aucun repository, client Graph ou accès DB concret observé. | Présence vérifiée ; couche encore vide de capacités métier. |
| `ReadMeeting.Api` | Projet web `net10.0`; `Program.cs` ajoute health checks et Problem Details, puis mappe `/health`. | Code vérifié. |
| Références | API référence Application, Domain, Infrastructure ; Application référence Domain ; Infrastructure référence Application et Domain ; Domain est autonome. | Vérifié dans les `.csproj`. |
| Contrôleur Meetings | Fichier `Controllers/MeetingsController.cs` existe et porte `[Authorize]`. `Program.cs` n’appelle ni `AddControllers()` ni `MapControllers()` et ne configure pas l’authentification. | Code vérifié : ses actions ne sont pas des endpoints exposés par le socle actuel. |
| Endpoint effectivement exposé | `GET /health`, réponse de santé ASP.NET Core. | Mapping vérifié ; HTTP 200 déclaré dans le rapport de Lot 0. |
| JWT, audience, OBO, Graph backend, routes métier, persistance, migrations, worker, orchestrateur et parser serveur | Aucun de ces services n’est configuré ou démontré par le socle observé. | Absents / hors Lot 0. |

L’attribut `[Authorize]` du contrôleur non routé ne constitue pas une authentification opérationnelle. Le health endpoint ne teste ni Graph, ni OBO, ni base de données.

## Infrastructure et configuration

- `infra/main.bicep` déclare App Service Linux avec runtime `DOTNETCORE|10.0`, plan, SQL, Search et Service Bus. Le fichier est une description IaC ; aucun déploiement n’a été vérifié ici.
- `global.json` sélectionne SDK `10.0.100` avec `rollForward: latestFeature`. Lors de cette inspection, la commande `dotnet --version` a sélectionné 10.0.403 ; les SDK 10.0.100 et 10.0.403 étaient visibles dans le profil de cet environnement.
- Les `.csproj` ciblent explicitement `net10.0`.
- `.env.local` n’a pas été lu. Les seuls noms de variables relevés sont indiqués dans [04_ENVIRONNEMENT_ET_DEPENDANCES.md](./04_ENVIRONNEMENT_ET_DEPENDANCES.md).
- `.env.example` est modifié dans le worktree ; son contenu n’a pas été reproduit ici. Le responsable et la DSI doivent vérifier séparément toute valeur dont la nature est incertaine.

## CI et tests

Le workflow `.github/workflows/ci.yml` déclare :
- Node.js 22, installation npm, `npm run lint`, `npm run test:transcript`, `npm run build` ;
- .NET `10.0.x`, `dotnet restore backend/ReadMeeting.sln`, puis build Release `--no-restore`.

Les rapports du Lot 0 disent que le restore/build backend, le lint et le build frontend ainsi que le démarrage API ont réussi localement. Le build frontend avait un avertissement de taille de chunks. La CI distante n’a pas été confirmée comme exécutée. Le script `npm run test:transcript` existe, mais son exécution n’est pas établie par les preuves consultées ici.

## Fonctionnel, partiel, absent

- **Présent côté navigateur :** MSAL, accès Graph, calendrier/résolution, découverte et récupération de transcriptions, parsing/export client.
- **Partiel / non persistant :** diagnostics client et garde-fou d’approbation fondé sur données fournies ; cela ne crée ni workflow d’approbation auditable ni validateur structurel serveur.
- **API Lot 0 :** démarrage et health check seulement.
- **Non démontré comme implémenté :** authentification API/OBO, Graph backend, persistance, validation structurelle serveur, orchestration, IA d’extraction, génération DOCX/PDF, publication SharePoint, agent Teams live.

Pour le suivi des changements Git observés, voir [03_ETAT_DES_LOTS.md](./03_ETAT_DES_LOTS.md).
