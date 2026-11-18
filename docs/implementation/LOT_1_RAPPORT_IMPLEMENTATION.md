# Lot 1 — Rapport d'implémentation : API Security & Authentication

## 1. Statut

**Implémentation locale : partielle et testée. Lot 1 : non clôturé.**

La validation JWT Bearer Entra, le contexte authentifié, la politique d'accès API et l'acquisition MSAL d'un jeton distinct pour l'API sont implémentés. Le point d'accès OBO backend est préparé avec Microsoft.Identity.Web, mais aucun échange OBO réel n'a été exécuté : l'enregistrement API, le scope exposé, le consentement Graph, le credential confidentiel backend et les scopes approuvés ne sont pas disponibles/vérifiés. La restauration reproductible du frontend est également bloquée par le lockfile npm préexistant incohérent.

Aucun appel métier Microsoft Graph backend, aucune route de traitement métier et aucun travail du Lot 2 n'ont été ajoutés.

## 2. Contrôle de continuité et état initial

- Branche observée : `main`, HEAD `db687cf`.
- Worktree déjà sale avant les changements de ce lot : plusieurs sources frontend, fichiers d'infrastructure, scripts, lockfiles, documents de préparation/conception/continuité et projets du Lot 0 étaient modifiés ou non suivis. Leur attribution n'est pas démontrable ; ils ont été préservés.
- Les fichiers .NET du Lot 0 étaient bien présents dans le dépôt réel : solution, quatre projets `net10.0`, `Program.cs`, `appsettings.json`. Restore/build backend réussis ; le Lot 0 n'a pas été réimplémenté.
- Le dossier contient également `prompt-continuuite`, absent des listes de la passation ; il n'a pas été ouvert ni modifié.
- Versions observées : .NET SDK `10.0.115`, Node.js `v26.13.1`, npm `11.20.0`. Le SDK .NET respecte le `global.json` (`10.0.100`, `latestFeature`). Node/npm diffèrent de Node 22 décrit dans la passation ; les commandes frontend ont néanmoins fonctionné sous les versions présentes.
- `.env.local` existe ; son contenu n'a pas été lu. Aucun secret ou token n'a été recherché ni publié.

### Écarts à la passation

1. `12_PREPARATION_OPERATIONNELLE_IMPLEMENTATION.md` décrit un backend absent, alors que les projets et le point d'entrée Lot 0 sont présents ici. Écart non bloquant pour le Lot 1 ; le rapport de continuité est plus récent sur cet état.
2. Des projets, `Program.cs` et `appsettings.json` sont non suivis/modifiables ; ils ont été examinés puis complétés sans les remplacer globalement.
3. Le lockfile `package-lock.json` préexistant ne correspond pas au manifeste : `npm ci` échoue car des dépendances optionnelles de plateformes sont absentes du lockfile. Il n'a pas été modifié.
4. Les versions Node/npm présentes ne sont pas celles de la CI. Elles n'ont pas empêché lint, tests transcript et build locaux.

## 3. Architecture de sécurité mise en place

### API et validation Bearer

L'API utilise `Microsoft.Identity.Web` et `JwtBearer` avec l'autorité Entra mono-tenant configurée. Pour toute route protégée, le middleware valide :

- signature avec les clés de signature publiées par les métadonnées Entra ;
- issuer v2 exact `https://login.microsoftonline.com/{TenantId}/v2.0` ;
- audience strictement égale à `AzureAd:Audience` ;
- durée de validité (`exp`/`nbf`) ;
- présence et cohérence des claims d'identité utilisés par la politique.

Les paramètres requis manquants ou mal formés font échouer le démarrage. Aucun issuer, audience, tenant ou scope de production n'est codé en dur.

La politique `ApiUser` requiert un utilisateur authentifié, un `tid` égal au tenant configuré, un `oid` UUID, le scope délégué API configuré dans `scp`, et un client appelant égal à `AllowedClientId` (`azp`, ou `appid` si présent). Aucun rôle métier DGF n'a été créé.

### Endpoints et réponses

- `GET /health` reste public et ne donne pas accès aux fonctions métier.
- `GET /api/v1/security/context` est protégé par `ApiUser` et retourne uniquement `tid` et `oid` issus du principal authentifié.
- Aucun contrôleur métier n'est mappé. Le contrôleur legacy `MeetingsController` demeure hors routes actives ; aucun accès Graph métier n'est introduit.
- CORS n'autorise que les origines HTTPS explicitement configurées (HTTP localhost uniquement en développement).
- Réponse **401** : token absent, malformé, signature/issuer/audience/durée incorrects.
- Réponse **403** : token valide mais scope, tenant ou application cliente non autorisé.
- Les erreurs 401/403 utilisent le mécanisme de Problem Details/status code pages ASP.NET Core.

Le serveur ne lit jamais un `tenantId` venant du query, du header ou du corps comme autorité. Le contexte est dérivé des claims vérifiés.

## 4. Frontend : séparation des jetons

Le nouveau client `apiClient.ts` acquiert via `acquireTokenSilent` un access token au scope API fourni par `VITE_READMEETING_API_SCOPE`, puis le transmet en `Authorization: Bearer` à l'origine de `VITE_READMEETING_API_BASE_URL`. Les chemins sont limités à cette origine et HTTP est refusé hors localhost.

Le panneau de diagnostic offre un test API distinct du test Graph existant. Les appels calendrier/transcription et leurs scopes Graph restent dans leur flux antérieur ; le jeton Graph n'est pas envoyé à l'API comme substitut du jeton API. Aucun secret confidentiel n'est placé dans le frontend.

Le scope API et l'URL ne sont pas configurés dans cet environnement ; le test frontend API n'a donc pas été exécuté contre une instance réelle.

## 5. Entra ID, audience et scopes

### Valeurs réellement observées

- Une constante de tenant `9ddae6a3-6cb4-40e3-a4cd-305e2fe8c32a` apparaît dans `src/types/adminConsentWorkflow.ts`. C'est une valeur littérale de la configuration de demande de consentement côté client, pas une preuve d'inscription API active ni de tenant actuellement validé. L'administrateur DGF doit la confirmer.
- Le frontend existant lit `VITE_AZURE_CLIENT_ID`, `VITE_AZURE_TENANT_ID` et `VITE_AZURE_REDIRECT_URI`. La présence éventuelle de valeurs dans `.env.local` ou le navigateur n'a pas été inspectée.
- Les scopes Graph demandés par l'existant sont `User.Read`, `Calendars.Read`, `OnlineMeetings.Read` et `OnlineMeetingTranscript.Read.All`. Leur présence dans le code ne prouve ni consentement effectif ni autorisation d'accès à une réunion.
- Aucun identifiant vérifié de l'application API, audience API, scope API exposé, client SPA autorisé à l'API, configuration OBO ou credential backend n'a été établi.

### Valeurs à fournir/confirmer par l'administrateur Entra/M365

| Paramètre | Configuration consommée | État |
|---|---|---|
| Tenant ID autorisé | `AzureAd:TenantId` | Valeur source à confirmer par DGF ; aucun test sur le tenant réel. |
| Client ID de l'API | `AzureAd:ClientId` | Non établi. |
| Client ID SPA autorisé | `AzureAd:AllowedClientId` | Non établi ; utilisé pour contrôler `azp`/`appid`. |
| Audience / Application ID URI exacte | `AzureAd:Audience` | Non établi ; doit correspondre au claim `aud` émis pour l'API. |
| Scope délégué exposé par l'API | `AzureAd:RequiredScope` | Non établi ; nom de scope à créer/valider. |
| Origines front autorisées | `Cors:AllowedOrigins` | Non établies ; liste explicite HTTPS requise. |
| Scopes Graph destinés à OBO | `Graph:Scopes` | Tableau vide par défaut ; scopes à approuver avant configuration. |

Le frontend devra demander le scope complet correspondant au scope exposé par l'API (format configuré dans Entra, typiquement `api://<API-client-id>/<scope>`). Cette notation est un modèle, pas une valeur d'application réelle.

### Prérequis administrateur DGF

1. Confirmer l'application SPA existante et son client ID, l'application API (ou créer/valider son enregistrement), son tenant et son audience.
2. Exposer le scope délégué API attendu, autoriser le client SPA à le demander et accorder le consentement requis.
3. Régler la version de jeton de l'API sur v2, cohérente avec l'issuer v2 exact vérifié par ce service.
4. Approuver le client SPA autorisé, les URI de redirection et les origines CORS de chaque environnement.
5. Pour OBO ultérieur, ajouter à l'application API uniquement les permissions Graph déléguées nécessaires, faire approuver le consentement administrateur et vérifier le droit réel sur une réunion de test autorisée.
6. Choisir et fournir au backend un credential confidentiel (certificat ou secret selon la politique DGF), avec stockage/rotation hors dépôt et sans variable `VITE_*`. Aucune valeur n'est demandée ou ajoutée ici.

## 6. OBO : mécanisme et blocage

Le service serveur `GraphOnBehalfOfTokenProvider` utilise `ITokenAcquisition.GetAccessTokenForUserAsync` avec les scopes définis dans `Graph:Scopes`. Microsoft.Identity.Web est configuré pour l'acquisition downstream et un cache mémoire de développement. Le fournisseur refuse explicitement de fonctionner si aucun scope n'est configuré. Le token obtenu reste une valeur interne au backend ; aucun endpoint ne le retourne et aucun appel métier Graph n'a été ajouté.

**OBO réel non validé et actuellement bloqué** : l'enregistrement/API audience, les permissions Graph déléguées, le consentement administrateur, la configuration du client confidentiel et le mode de stockage du credential ne sont pas confirmés. La configuration `Graph:Scopes` demeure vide et aucun credential n'a été lu/configuré. Aucun échange OBO réussi n'est simulé ni revendiqué. Le cache mémoire est uniquement adapté à un test/pilote mono-instance ; une exploitation durable nécessiterait un cache distribué validé.

## 7. Fichiers créés ou modifiés

- `backend/src/ReadMeeting.Api/Program.cs` — configuration JWT/issuer/audience, politique scope/tenant/client, endpoint de contexte, CORS et réponses d'erreur.
- `backend/src/ReadMeeting.Api/ReadMeeting.Api.csproj` — référence `Microsoft.Identity.Web` 4.18.0.
- `backend/src/ReadMeeting.Api/appsettings.json` — clés de configuration non secrètes et valeurs volontairement vides.
- `backend/src/ReadMeeting.Api/Security/GraphOnBehalfOfTokenProvider.cs` — fournisseur OBO interne, sans appel Graph métier.
- `backend/tests/ReadMeeting.Api.Tests/ReadMeeting.Api.Tests.csproj` et `AuthenticationIntegrationTests.cs` — tests d'intégration API à signature locale.
- `backend/ReadMeeting.sln` — ajout du projet de tests.
- `src/services/apiClient.ts` — acquisition et transport du token API distinct.
- `src/App.tsx`, `src/components/AuthDiagnosticPanel.tsx` — action de test API séparée du test Graph.
- `.github/workflows/ci.yml` — exécution des tests .NET après compilation.
- `docs/implementation/LOT_1_RAPPORT_IMPLEMENTATION.md` — présent rapport.

Les fichiers et documents préexistants non liés à ce périmètre n'ont pas été remplacés. Aucun `.env`, document de conception, fichier d'infrastructure ou ressource Azure n'a été modifié par ce lot.

## 8. Tests et validations réellement exécutés

### Intégration API (claims et clé de signature locales synthétiques)

`dotnet test backend/ReadMeeting.sln --no-build --configuration Release` :

**11 tests réussis, 0 échec.**

Cas couverts :
- token absent et token malformé : 401 ;
- signature invalide, token expiré, audience incorrecte, issuer incorrect : 401 ;
- token signé valide pour tenant/audience/client/scope de test : accès autorisé ;
- scope manquant, tenant différent ou client appelant non autorisé : 403 ;
- contexte tenant/utilisateur issu des claims et séparation entre deux utilisateurs ;
- query/header `tenantId` forgés sans effet sur le contexte ;
- absence du marqueur de bearer dans les journaux capturés ;
- prévol CORS accepté uniquement pour l'origine de test configurée.

Ces tests sont des **tests d'intégration locale** de la pipeline et de l'autorisation, avec clé de signature synthétique de test. Ils ne valident pas la signature par les clés Entra réelles, les métadonnées du tenant DGF ou un jeton émis par Microsoft.

### Build et dépendances backend

- `dotnet restore backend/ReadMeeting.sln` : réussi.
- `dotnet build backend/ReadMeeting.sln --no-restore --configuration Release` : réussi, 0 erreur, 0 avertissement.
- `dotnet list backend/ReadMeeting.sln package --vulnerable --include-transitive` : aucun package vulnérable signalé par les sources NuGet consultées.

### Frontend et régression Graph

- `npm run lint` : réussi.
- `npm run test:transcript` : **47/47 assertions réussies** (tests locaux avec Graph simulé).
- `npm run build` : réussi ; avertissement Vite préexistant sur un chunk > 500 kB.
- `npm ci` : échec avant installation, car le `package-lock.json` préexistant est désynchronisé du `package.json` (plusieurs paquets optionnels de plateformes manquent au lockfile). Le lockfile n'a pas été modifié pour préserver le travail préexistant.
- `npm install --package-lock=false` : réussi sans réécrire le lockfile ; 197 paquets audités, 0 vulnérabilité signalée. npm a indiqué que les scripts `postinstall` d'esbuild/protobufjs n'étaient pas approuvés par la politique locale ; le lint, les tests transcript et le build ont ensuite tous réussi.
- Après cette restauration, `npm run lint`, `npm run test:transcript` et `npm run build` ont été réexécutés avec succès. La build Vite signale toujours un chunk supérieur à 500 kB.

### Validation Entra réelle

Aucune connexion réelle au tenant DGF, aucun jeton Entra réel, aucun consentement, appel Graph authentifié ou échange OBO réel n'a été exécuté pendant cette mission.

## 9. Instructions pour nouvel environnement

1. Installer un SDK .NET 10 compatible avec `global.json`; les quatre projets Lot 0 et le projet de tests sont dans `backend/ReadMeeting.sln`.
2. Restaurer/compiler/tester :
   ```sh
   dotnet restore backend/ReadMeeting.sln
   dotnet build backend/ReadMeeting.sln --no-restore --configuration Release
   dotnet test backend/ReadMeeting.sln --no-build --configuration Release
   ```
3. Pour le frontend, installer Node 22 selon la CI. Le `npm ci` actuel échoue à cause du lockfile incohérent. `npm install --package-lock=false` fonctionne localement sans corriger le lockfile, mais ne constitue pas une restauration lockée reproductible ; faire arbitrer la mise à jour du lockfile préexistant avant de compter sur `npm ci`.
4. Alimenter `AzureAd:TenantId`, `ClientId`, `AllowedClientId`, `Audience`, `RequiredScope`, `Cors:AllowedOrigins` par la configuration protégée de l'environnement ; ne jamais ajouter un secret au dépôt.
5. Dans le frontend, fournir `VITE_READMEETING_API_SCOPE` et `VITE_READMEETING_API_BASE_URL`, ainsi que les valeurs SPA existantes depuis le coffre approuvé. Les variables `VITE_*` sont publiques dans le bundle.
6. Pour OBO, configurer `Graph:Scopes` après approbation M365 et fournir le credential confidentiel au backend via le mécanisme serveur DGF choisi. Ne pas utiliser de vrai token ou credential dans les tests locaux.
7. Après configuration, faire valider par un administrateur le token API issu d'Entra, l'issuer/audience et les consentements dans un environnement de test autorisé avant tout usage réel.

## 10. Limites, risques et prochaines actions

- Le Lot 1 n'est pas prêt à être déclaré terminé/validé tenant : valeurs d'inscription Entra et permissions sont inconnues ou non confirmées.
- Le contrôleur métier historique reste non routé ; aucun accès réunion/transcription backend n'est livré ici.
- Le frontend possède le mécanisme d'appel API et une action de diagnostic, mais les paramètres d'API/Entra manquent pour un appel réel.
- Le test de validité est synthétique ; la seule preuve Entra manquante doit être obtenue dans un tenant de test DGF autorisé, pas par simulation.
- La restauration npm reproductible est bloquée par un lockfile préexistant incohérent, non corrigé dans ce lot.
- Le credential OBO et le cache de tokens de production doivent être arbitrés par DGF/Sécurité/Opérations.

**Prochaines actions avant clôture :** obtenir et confirmer les paramètres API/SPA Entra, l'audience et le scope exposé ; approuver les origines CORS et les permissions OBO ; choisir le credential serveur et le cache de production ; effectuer les tests authentifiés Entra/OBO dans un environnement autorisé ; résoudre séparément l'incohérence du lockfile npm. Attendre la validation explicite du responsable avant tout Lot 2.
