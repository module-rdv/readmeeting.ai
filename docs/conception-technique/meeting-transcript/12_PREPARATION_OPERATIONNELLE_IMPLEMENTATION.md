# 12 — Préparation opérationnelle de l'implémentation

## 1. Objet, périmètre et méthode

Ce dossier traduit la conception de la brique 01 en une trajectoire de réalisation MVP pilote. Il distingue les éléments observés dans le dépôt, les composants partiels et la cible à construire. Les décisions proposées ci-dessous ne valent ni approbation DGF/Microsoft 365, ni preuve de déploiement.

Références normatives : documents 01 à 09 du présent dossier technique ; le document 10 est l'historique de revue ; le document 11 trace les corrections et arbitrages non résolus. Les sept fichiers de `docs/preparation-architecture/` restent le référentiel global et ne sont pas modifiés.

L'inspection porte sur l'état courant du worktree, qui comporte déjà des modifications non commises dans des fichiers source/configuration. L'état décrit est donc celui observé pendant cette mission, pas une comparaison exhaustive au dernier commit. Ces fichiers préexistants n'ont pas été modifiés par cette mission.

Les contrôles ont consisté à lire les fichiers et inventorier les projets, scripts et ressources déclarées. Aucun test, lint, build, restore .NET, appel Graph authentifié ou déploiement n'a été exécuté. `.env.local` n'a pas été lu. Aucune valeur de credential n'est reproduite dans ce document.

## A. État initial du dépôt

| Composant | État constaté | Fichiers concernés | Réutilisation possible | Travail restant |
|---|---|---|---|---|
| Application web React/Vite/TypeScript | Existant | [src/App.tsx](../../../src/App.tsx), [src/main.tsx](../../../src/main.tsx), [package.json](../../../package.json), [vite.config.ts](../../../vite.config.ts) | Conserver l'application, ses composants, sa navigation et ses scripts npm. `App` orchestre actuellement calendrier et consultation. | Remplacer progressivement les appels Graph métier directs par les appels API cibles ; obtenir un access token destiné à l'API ; gérer les états asynchrones et erreurs de run. |
| Tableau de bord et sélection de réunion | Existant côté client | [src/components/DashboardView.tsx](../../../src/components/DashboardView.tsx), [src/types/meeting.ts](../../../src/types/meeting.ts) | Réutiliser la liste, la sélection, les indications de statut et les composants d'interface existants. | Alimenter les réunions et états par l'API ; ne pas assimiler les exemples de démonstration de l'UI à des données Graph validées. |
| Consultation et export de transcription | Existant côté client | [src/components/TranscriptViewerModal.tsx](../../../src/components/TranscriptViewerModal.tsx), [src/services/transcriptService.ts](../../../src/services/transcriptService.ts), [src/types/transcript.ts](../../../src/types/transcript.ts) | Réutiliser l'affichage, les filtres et `createTranscriptExport`; préserver le rendu du mode VTT et le libellé sans attribution. | Adapter les types/props à `transcriptId`, `revisionId`, `speakerAttribution` et aux cues retournés par l'API ; distinguer explicitement récupération VTT et fallback dans l'interface. |
| Authentification Microsoft côté SPA | Existant, orienté accès Graph direct | [src/config/msalConfig.ts](../../../src/config/msalConfig.ts), [src/services/graphClient.ts](../../../src/services/graphClient.ts), [src/types/auth.ts](../../../src/types/auth.ts) | Réutiliser MSAL Browser/React, le compte actif, les diagnostics et la validation de redirect URI. | Enregistrer/configurer l'audience et le scope de l'API ; demander un jeton API. Le jeton Graph actuellement acquis côté navigateur ne doit pas être transmis comme jeton API ni exposé par le futur backend. |
| Calendrier, résolution, découverte Graph | Existant côté client | [src/services/graphClient.ts](../../../src/services/graphClient.ts) (`fetchRealCalendarMeetings`), [src/services/transcriptService.ts](../../../src/services/transcriptService.ts) (`resolveOnlineMeetingId`, `fetchMeetingTranscripts`) | Réutiliser les comportements et cas de test comme référence fonctionnelle et corpus de parité. | Implémenter les connecteurs dans le backend ASP.NET Core afin que le client appelle l'API ; vérifier les scopes et droits effectifs dans le tenant. |
| Récupération du contenu et fallback | Existant côté client | [src/services/transcriptService.ts](../../../src/services/transcriptService.ts) (`fetchTranscriptContent`) | Conserver la règle VTT d'abord ; fallback uniquement sur `innerError.code === SpeakerAttributionNotAllowed`, même transcriptId/endpoint et en-tête `Accept` alternatif. | Porter ou reproduire le comportement dans le service Graph backend ; ajouter les diagnostics serveur redacted et le test Graph authentifié. Aucun élargissement de permission n'est proposé ici. |
| Parsing et export côté navigateur | Existant côté client | [src/services/transcriptService.ts](../../../src/services/transcriptService.ts) (`parseVttTranscript`, `parseUnattributedTranscript`, `createTranscriptExport`), [scripts/test-transcript-service.ts](../../../scripts/test-transcript-service.ts) | Conserver les règles fonctionnelles, fixtures et assertions VTT/non attribué comme référence de parité. | Le serveur doit parser avant persistance et validation. Proposition de réalisation dans la stack .NET retenue, sans runtime Node séparé ; confirmer ce choix au lot parsing et tester la parité avec les cas TypeScript. |
| Validation structurelle complète | Absent comme composant serveur ; parsing client partiel | [src/services/transcriptService.ts](../../../src/services/transcriptService.ts), spécification du [validateur](./03_SPECIFICATIONS_COMPOSANTS.md) | Réutiliser les données de parsing et diagnostics déjà disponibles. | Développer un validateur déterministe/versionné : timestamps, cues, séquence, texte, invariants et refus avant persistance. Ne pas le confondre avec `enforceHumanValidationGate`, qui n'est pas une validation structurelle ou un workflow humain persistant. |
| API ASP.NET Core exécutable | Absent dans l'état observé ; squelette partiel | [backend/ReadMeeting.sln](../../../backend/ReadMeeting.sln), [MeetingsController.cs](../../../backend/src/ReadMeeting.Api/Controllers/MeetingsController.cs) | Réutiliser les concepts et les entités pertinentes après revue. Le contrôleur actuel fournit un exemple de route, pas le contrat cible. | Aucun `.csproj`, `Program.cs`, `Startup.cs` ou `appsettings*.json` n'a été trouvé sous `backend/`. Créer/compléter les projets et l'entrée API, le middleware JWT, l'injection, les erreurs et les routes `/api/v1` harmonisées. La compilation n'a pas pu être tentée : `dotnet` est indisponible dans l'environnement inspecté. |
| Authentification API, autorisation ressource et OBO | Absent comme implémentation démontrée | [MeetingsController.cs](../../../backend/src/ReadMeeting.Api/Controllers/MeetingsController.cs), [05_INTEGRATION_MICROSOFT_GRAPH.md](./05_INTEGRATION_MICROSOFT_GRAPH.md), [06_CONTRATS_API.md](./06_CONTRATS_API.md) | La cible JWT/OBO documentée est le contrat de réalisation. L'attribut `[Authorize]` existant ne démontre ni validation JWT configurée, ni tenant scoping, ni OBO. | Valider le JWT pour l'audience API, mapper les claims vérifiés `tid`/`oid`, autoriser chaque ressource, acquérir un jeton Graph délégué côté serveur et ne jamais renvoyer ce jeton au frontend. |
| Backend Graph concret | Absent ; interface seule | [IMicrosoftGraphService.cs](../../../backend/src/ReadMeeting.Application/Interfaces/IMicrosoftGraphService.cs) | Réutiliser l'interface après l'avoir alignée sur le périmètre brique 01. | Il n'existe pas d'implémentation concrète trouvée. Séparer lecture Graph de la méthode SharePoint présente dans l'interface ; l'écriture SharePoint est hors de cette brique. |
| Modèles de domaine .NET | Partiels et orientés réunion/compte rendu | [Meeting.cs](../../../backend/src/ReadMeeting.Domain/Entities/Meeting.cs), [MeetingReport.cs](../../../backend/src/ReadMeeting.Domain/Entities/MeetingReport.cs), [ActionItem.cs](../../../backend/src/ReadMeeting.Domain/Entities/ActionItem.cs) | `Meeting` peut informer le mapping, sous réserve d'alignement des IDs et du tenant. | Le modèle de transcription/révision/cue/run/events cible du document 04 n'est pas présent. `Meeting.RawTranscript` ne remplace ni les révisions immuables ni le modèle de traitement. |
| Persistance, migrations et stockage brut | Absent dans le code examiné | Aucun projet Infrastructure matérialisé par des fichiers, aucun `.csproj`, migration, schéma ou repository observé ; modèle cible dans [04_MODELE_DONNEES.md](./04_MODELE_DONNEES.md). | Réutiliser le modèle logique harmonisé et les contraintes composites tenant. | Choisir le moteur, créer le repository et les migrations, définir les transactions, rétention, chiffrement et stockage du brut avant le lot de persistance. |
| Suivi asynchrone, idempotence et reprise | Absent côté backend | [06_CONTRATS_API.md](./06_CONTRATS_API.md), [07_ERREURS_REPRISES_IDEMPOTENCE.md](./07_ERREURS_REPRISES_IDEMPOTENCE.md) | Implémenter les routes, états et invariants déjà harmonisés, sans inventer de statuts concurrents. | Construire ProcessingRun/Event, les événements de demande, l'acquisition atomique/lease, la reprise et la stratégie de worker. Aucun broker effectif n'est attesté. |
| Tests frontend transcript | Existants, scripts de test disponibles | [package.json](../../../package.json), [scripts/test-transcript-service.ts](../../../scripts/test-transcript-service.ts), [scripts/test-real-teams-transcript.ts](../../../scripts/test-real-teams-transcript.ts) | `npm run test:transcript` couvre des règles locales importantes, notamment parsing, fallback et erreurs Graph mockées. | Exécuter ces tests dans le futur pipeline. Le script nommé `test-real-teams-transcript` utilise des objets MSAL/Graph simulés dans le contenu inspecté ; son nom ne constitue pas une preuve d'accès réel au tenant. |
| Tests backend | Absent dans l'arborescence observée | Aucun projet de test .NET trouvé | Les cas `UT`, `IT`, `Graph AUTH` et `REC DGF` du [plan de tests](./08_PLAN_TESTS_ET_RECETTE.md) définissent les objectifs. | Créer des tests adaptés à l'API et à la persistance lorsqu'elles existent ; les tests avec mocks ne remplacent pas une validation authentifiée. |
| CI | Présente, à réaligner | [.github/workflows/ci.yml](../../../.github/workflows/ci.yml) | Réutiliser GitHub Actions comme point de contrôle. | La CI exécute actuellement `npm run build`, puis `dotnet restore/build` sur une solution dont les projets ne sont pas présents dans l'inventaire. Le job est intitulé Next.js alors que le package est Vite ; la compilation CI n'a pas été exécutée dans cette mission. Ajouter les tests ciblés après que le backend soit réellement restaurable. |
| Infrastructure déclarative | Partielle ; template non preuve de provisionnement | [infra/main.bicep](../../../infra/main.bicep) | Examiner App Service Linux, Azure SQL et Service Bus comme candidats déjà déclarés, sans supposer qu'ils existent dans un abonnement DGF. | Vérifier propriétaire, abonnement, région, réseau, sécurité, coûts et disponibilité réelle avant réutilisation. Azure AI Search est déclaré mais n'est pas requis pour cette brique. Le template active l'accès réseau public SQL ; ce réglage doit être validé avant tout déploiement. |
| Configuration et secrets | À vérifier avant usage | [.env.example](../../../.env.example), `.env.local` (présent, contenu non lu) | Réutiliser uniquement les identifiants explicitement approuvés et stockés au bon endroit. | Ne pas mettre de secret OBO dans une variable `VITE_*` ou dans le bundle SPA. Le fichier modèle contient une valeur de credential qui n'est pas reproduite ici : confirmer qu'elle est fictive ; si elle est réelle, la traiter comme exposée et la renouveler avant toute utilisation. |

### Scripts et outils constatés

Les scripts présents dans [package.json](../../../package.json) sont `dev` (`vite`), `build` (`vite build`), `preview`, `lint` (`tsc --noEmit`), `test:uri`, `test:graph`, `test:transcript`, `test:notification`, `test:consent`, `test:real-transcript` et `test:attendee`. Ils ont été inventoriés, pas exécutés. Node.js et npm étaient disponibles dans l'environnement inspecté ; le SDK .NET ne l'était pas.

Le seul script de nettoyage `clean` supprime des sorties générées ; il n'a pas été lancé. Aucun package n'a été installé.

## B. Architecture d'implémentation retenue

### B.1 Frontend React/Vite/TypeScript

- Conserver React/Vite et les composants de sélection/consultation existants.
- Le frontend authentifie l'utilisateur avec MSAL, demande un jeton dont l'audience est l'API ReadMeeting, puis appelle les contrats du document 06.
- Le frontend liste les réunions, démarre un `ProcessingRun`, suit son `runId`, puis consulte le transcript local et ses cues.
- Il ne transmet pas un `tenantId` ou `userId` faisant autorité et ne porte pas la logique d'orchestration.
- Il ne reçoit ni ne conserve de jeton Graph OBO. Le mode de récupération, le caractère attribué/non attribué et les erreurs sûres sont rendus depuis la réponse API.

### B.2 API backend ASP.NET Core

- Créer des projets .NET exécutables compatibles avec la solution existante et le choix de framework à confirmer ; les fichiers de projet et l'entrée de démarrage manquent actuellement.
- Exposer les routes `/api/v1` du document 06, valider les entrées, appliquer une politique d'autorisation par ressource et produire des erreurs structurées/redacted.
- Le POST de traitement persiste atomiquement la demande et renvoie `202 Accepted` avec le `runId` et `Location` si le résultat n'est pas déjà terminal. `202` ne signifie pas que le transcript est prêt.
- Les routes de statut et de consultation renvoient uniquement les ressources locales autorisées.
- Le contrôleur legacy `/api/meetings` ne constitue pas un substitut aux contrats cible.

### B.3 Authentification et autorisation

1. MSAL obtient un access token destiné à l'audience exacte de l'API ; l'API vérifie signature, issuer, audience, expiration, tenant autorisé et claims requis.
2. Le serveur dérive l'identité de `tid` et `oid` vérifiés, les mappe aux identifiants locaux puis filtre les requêtes sur le tenant et vérifie l'accès à la réunion, au transcript et au run.
3. Le corps client n'est jamais la source d'autorité d'un tenant, utilisateur ou droit.
4. Le serveur exécute OBO pour Graph avec les permissions déléguées approuvées. Le credential confidentiel reste dans un gestionnaire de secrets serveur approuvé ; aucun secret ou jeton Graph n'entre dans le frontend, une réponse ou un log.
5. Cette cible demande l'enregistrement de l'API, l'audience, les scopes et le consentement. Aucun de ces éléments n'est démontré par l'interface C# ou par les scopes Graph présents dans la SPA.

### B.4 Microsoft Graph

- Implémenter le service Graph côté backend : consultation calendrier, résolution du `onlineMeetingId`, découverte d'un `graphTranscriptId`, téléchargement du contenu.
- Garder explicite la distinction `meetingId`/`transcriptId` local et `graphMeetingId`/`graphTranscriptId` externe.
- Conserver l'ordre VTT puis fallback strict et les diagnostics décrits dans le document 05.
- Respecter les permissions déjà approuvées ; ne modifier aucune permission tenant dans le cadre de la préparation.
- L'accès Graph reste délégué au contexte autorisé. Une validation terrain rapportée n'est pas une validation de l'OBO backend.

### B.5 Orchestration asynchrone et suivi

- Persist `ProcessingRun`, `ProcessingEvent` et `ProcessingRequestEvent` avec les statuts canoniques du document 07.
- Avant tout travail Graph, acquérir atomiquement une exécution active selon la portée d'idempotence prescrite ; protéger les écritures avec un lease/fencing token.
- Pour limiter les ressources du pilote, proposition à arbitrer : un worker hébergé avec l'API et une file durable portée par la base, plutôt qu'ajouter d'emblée un broker. Il doit pouvoir reprendre les runs éligibles après redémarrage. Cette option n'est acceptable qu'après validation du verrouillage transactionnel du moteur retenu et du mode d'hébergement.
- Le Service Bus déclaré dans le Bicep n'est ni réputé provisionné ni imposé par la conception. Il reste une option si le besoin d'exploitation ou de débit le justifie.

### B.6 Parsing, normalisation et validation

- Le parsing serveur reprend les comportements existants de `parseVttTranscript` et `parseUnattributedTranscript`, avec VTT et texte sans attribution séparés.
- Proposition de mise en œuvre : porter les règles dans le backend .NET, éviter un runtime Node séparé en production et garder les cas TypeScript existants comme fixtures/assertions de parité. Ce choix de langage d'implémentation du parseur doit être confirmé avant le lot parsing.
- Normaliser les timestamps et l'ordre sans perdre la source, le format, la version de parseur ou le hash.
- Pour les paroles sans attribution, stocker `speakerName = null` et l'état d'attribution explicite ; ne jamais déduire un nom.
- Développer le validateur structurel comme composant indépendant du parseur et du futur workflow de validation humaine.

### B.7 Persistance, révisions et journalisation

- Appliquer le modèle logique tenant-scoped du document 04 : meeting, transcript, révisions immuables, cues, runs et événements ; clés composites empêchant les références inter-tenant.
- Écrire la révision et les cues de manière transactionnelle. Une nouvelle récupération/reprise ne modifie pas une ancienne révision ni un run terminal.
- Choisir le moteur relationnel avant la migration. Le modèle technique laisse PostgreSQL comme option, tandis que le Bicep courant décrit Azure SQL ; aucune des deux options n'est déclarée provisionnée ou approuvée par la DGF.
- Définir où réside le brut. Option MVP à valider : contenu dans la base relationnelle avec chiffrement au repos, taille et durée de conservation bornées, si la politique DGF l'autorise ; sinon choisir un stockage chiffré contrôlé et ne garder en base que sa référence et son hash.
- Journaliser étapes, status HTTP, codes Graph/innerError, request-id, résultat du parsing, corrélation et reprise. Ne jamais journaliser token, credential, contenu transcript intégral, URL sensible ou secret.

## C. Découpage en lots de développement

Les dossiers ci-dessous sont des emplacements cibles ; ils ne sont pas présentés comme existants. Les noms de services sont indicatifs et devront suivre les conventions des projets .NET créés.

| Lot | Objectif et fonctionnalités | Composants/fichiers à créer ou modifier | Dépendances | Résultat et critères d'acceptation | Tests / preuve de fin | Passage au lot suivant |
|---|---|---|---|---|---|---|
| 0 — Socle exécutable et arbitrages | Compléter la solution .NET, choisir le framework cible, démarrer une API minimale et réaligner le job CI. Arrêter les choix requis sur audience API, stockage et environnement de test. | `backend/src/ReadMeeting.Api/*.csproj`, `Program.cs`, configuration d'options et projets référencés à créer ; [backend/ReadMeeting.sln](../../../backend/ReadMeeting.sln) ; [.github/workflows/ci.yml](../../../.github/workflows/ci.yml) à modifier plus tard. | Décision architecture/équipe ; SDK .NET disponible en CI et local ; pas besoin d'accès M365 pour tester un démarrage sans Graph. | `dotnet restore/build` réussit sur les projets réels ; API démarre avec configuration non secrète ; tests existants restent exécutables. Aucun comportement legacy n'est supprimé dans ce lot. | Preuve de restore/build, démarrage/health et CI verte ; exécution ciblée `npm run lint` et `npm run build` sur le commit concerné. | Solution/API démarre et framework cible accepté ; sinon aucun lot backend n'est intégrable. |
| 1 — Frontière API et identité | Configurer validation JWT API, tenant allow-list/mapping, claims `tid`/`oid`, politiques d'autorisation et contrats d'erreurs ; obtenir un jeton API côté SPA. | Backend : configuration auth, middleware, services d'identité/autorisation et endpoint protégé ; frontend : MSAL config et client API dans `src/config/`/`src/services/` ; tests API. | Lot 0 ; registration/audience API Entra à confirmer pour l'auth réelle. | JWT Graph refusé comme JWT API ; tokens invalide, mauvaise audience/issuer/expiry rejetés ; aucun tenant client n'accorde un accès ; aucun jeton Graph ne traverse la réponse API. | UT de validation claims ; IT `IT-API-001`, `IT-TEN-001` et endpoints protégés. En attendant l'enregistrement Entra, fakes signés ne prouvent pas l'intégration tenant. | Identité API et refus négatifs démontrés ; validation M365 de l'audience préparée avant OBO authentifié. |
| 2 — Modèle et persistance tenant-scoped | Implémenter tenants, utilisateurs, réunions, transcript, révisions, cues, runs/events et contraintes composites ; migrations ; transaction de persistance. | `ReadMeeting.Domain/Entities/` à étendre ; projet Infrastructure à créer ; contexte/repositories/migrations ; configurations runtime et tests intégration. | Lot 0 ; choix DB, rétention, chiffrement et stratégie de brut arbitrés ; autorisation de créer une base de test. | FKs composites interdisent les relations tenant-croisées ; IDs Graph distincts des IDs locaux ; brut/révisions et cues traçables ; écritures atomiques ; purge n'est pas une cascade implicite. | Tests DB `IT-TEN-002`, `IT-STORE-001`, tests de contraintes et rollback ; preuve de migration sur une base de test autorisée. | Schéma et règles d'intégrité validés techniquement et DGF/DSI ; aucune donnée réelle avant politique de conservation. |
| 3 — OBO et API de réunions/transcripts découvrables | Mettre en place le client confidentiel/OBO backend et le service Graph ; lister réunions, résoudre une réunion Teams et découvrir ses transcripts ; intégrer la sélection UI à l'API. | `IMicrosoftGraphService` à aligner ; implémentation Infrastructure Graph ; API meeting/list/detail et discovery selon [06_CONTRATS_API.md](./06_CONTRATS_API.md) ; client API frontend ; diagnostics redacted. | Lots 1–2 ; Entra API et application OBO configurées ; scopes Graph délégués approuvés/consentis ; compte et réunions de test autorisés. | La liste renvoie les réunions accessibles ; les IDs Graph sont étiquetés comme tels ; la découverte ne confond pas absence avec accès refusé ; token Graph uniquement côté serveur. | UT Graph mocké ; IT avec JWT/tenant de test ; ensuite cas `Graph AUTH` pour calendrier, résolution et découverte, avec request-id non secret et preuve d'environnement. | Tests mockés et IT verts ; accès Graph authentifié confirmé par M365 sur compte/réunion de test. |
| 4 — ProcessingRun, idempotence et worker | Démarrer `POST .../transcript-runs` en `202`, suivi GET, événements de demande, acquisition atomique, lease, transitions et reprises. | API de run selon document 06 ; `ProcessingRun`/`ProcessingEvent`/`ProcessingRequestEvent`, orchestrateur, worker de fond, repository et configuration de délais. | Lots 1–3 ; base transactionnelle ; choix validé entre worker DB et broker ; seuils de retry/lease/timeout définis. | Même clé/payload réutilise le run ; payload différent produit 409 ; traitement actif unique ; run terminal immuable ; redémarrage ne perd pas la demande ; `202` n'annonce pas un résultat terminé. | IT `IT-API-002/003`, `IT-IDEM-001..005`, `IT-RUN-001/002` ; tests de concurrence déterministes et preuve de panne/reprise. | Acquisition et reprise démontrées en tests multi-worker ; revue d'exploitation approuvée. |
| 5 — Téléchargement, parsing, normalisation, validation | Récupérer VTT, déclencher le fallback strict, convertir en cues normalisées et valider avant écriture. | Service Graph contenu ; parser/normalizer/validator backend ; modèles de résultat/version ; diagnostics ; tests de parité fondés sur [scripts/test-transcript-service.ts](../../../scripts/test-transcript-service.ts). | Lots 3–4 ; scopes Graph effectifs ; format parser versionné ; limites de taille/temps et règles d'erreurs approuvées. | VTT conserve noms/cues ; fallback uniquement sur l'innerError exact et l'Accept prescrit ; contenu alternatif garde horodatages/ordre sans nom inventé ; erreurs invalides deviennent codées, non persistées comme succès. | UT `UT-TR-001..009`, notamment fallback et redaction ; Graph AUTH séparé pour le 403 tenant réel et la réponse alternative ; aucune fixture mock ne vaut test réel. | Tests unitaires et intégration passent ; au moins un test Graph authentifié autorisé pour le scénario concerné, si l'environnement le permet. |
| 6 — Persistance de résultat et consultation UI | Persister la révision et les cues transactionnellement ; consulter la liste, le statut et le transcript local structuré ; brancher le viewer et l'export. | API GET de run/transcripts ; repositories et mapping DTO ; adaptation de `src/App.tsx`, `DashboardView.tsx`, `TranscriptViewerModal.tsx`, `src/types/transcript.ts`. | Lots 2–5 ; politique brut/rétention arrêtée ; endpoints et DTO stables ; UI API auth prête. | Flux de bout en bout : réunion sélectionnée → Graph → transcript découvert/récupéré → parse/validation → persistance → consultation/filtre/export ; toutes les requêtes respectent tenant et ACL ; résultat source est conservé. | IT end-to-end avec Graph mocké et DB de test ; tests tenant/idempotence/reprise ; test d'export VTT et non attribué ; recette DGF sur réunion/corpus approuvé avec preuve distincte. | Critères du document 08 acceptés, preuve Graph Auth et PV de recette DGF séparés ; approbation de mise en pilote explicite. |

### Interfaces de lots distincts

Les points d'extension vers extraction IA, preuves métier, workflow documentaire, SharePoint et agent Teams live ne sont pas nécessaires pour accepter les lots 0 à 6. Aucune route, permission ou service de ces lots ne doit être ajouté comme dépendance implicite.

## D. Environnement minimal du MVP pilote

Les ressources décrites ci-dessous sont des besoins à organiser. La présence d'un paramètre ou d'une ressource dans Bicep ne prouve pas qu'elle existe dans un abonnement, qu'elle est disponible pour DGF ou qu'elle a été approuvée.

| Ressource / décision | Nécessaire avant développement | Nécessaire avant tests d'intégration | Nécessaire avant recette DGF | Reportable / réserve |
|---|---|---|---|---|
| Poste et CI .NET/Node | Oui : installer/activer un SDK .NET aligné sur la décision de framework ; Node/npm du dépôt disponibles. | Oui : versions épinglées/reproductibles dans CI et runner. | Oui : build du candidat de recette reproductible. | L'environnement inspecté dispose de Node/npm mais pas de `dotnet`; l'équipe devra combler cet écart avant le lot 0. |
| API ASP.NET Core hébergée | Non pour parser localement ; nécessaire au premier slice exécutable backend. | Oui : endpoint de test HTTPS joignable depuis le frontend/testeur, configuration non production. | Oui : environnement pilote DGF approuvé, TLS, disponibilité et accès administré. | Le Bicep décrit App Service Linux ; aucune instance déployée n'a été confirmée. |
| Enregistrement Entra de l'API et audience | Décider le propriétaire et la séparation SPA/API dès le lot 0–1. | Oui avant IT d'auth/OBO ; audience, issuer/tenant autorisé et scopes API exacts. | Oui, validé par DSI/M365 et limité au tenant pilote. | Aucun `audience` API n'est attesté dans la configuration frontend consultée. |
| Application/credential serveur OBO | Peut être simulé pour UT ; définir le propriétaire, le credential et son cycle de rotation avant le lot Graph. | Oui : credential non exporté, injecté par mécanisme serveur approuvé, consentement effectif vérifié. | Oui : secret/certificat sous contrôle DSI, accès minimal et rotation tracée. | Ne pas réutiliser une clé frontend ou une valeur du fichier `.env.example`. La disponibilité de Key Vault ou équivalent n'est pas établie. |
| Permissions Graph déléguées | Revue de besoin avant développement de l'adaptateur ; ne rien élargir dans cette mission. | Oui : scopes effectifs, consentement et accès à un compte/réunion/transcript de test confirmés par M365. | Oui : compte pilote et accès aux réunions éligibles validés ; comportement refusé compris. | Les scopes écrits dans le code indiquent une demande, pas une autorisation effective. Aucune permission SharePoint n'est requise pour la brique 01. |
| Base relationnelle | Choisir moteur et responsable avant le lot 2 ; définir tenant key, schéma, migration, chiffrement, backup et rétention. | Oui : base isolée autorisée, migrations automatisables, contraintes testables et restauration vérifiable. | Oui : instance pilote, réseau, accès, sauvegarde/restauration et purge approuvés. | PostgreSQL est une option du modèle technique ; Azure SQL apparaît dans Bicep. Le moteur reste à décider ; ne pas provisionner au seul vu du template. |
| Stockage brut et révisions | Décider si contenu brut en DB ou stockage séparé et durée maximale avant de persister des transcriptions. | Oui si les tests persistance contiennent un brut ; données synthétiques ou de test approuvées. | Oui : chiffrement, accès, rétention et suppression conformes au cadre DGF. | Un stockage objet dédié n'est pas observé. Option base relationnelle possible uniquement après validation de taille/rétention. |
| Worker/queue et concurrence | Fixer un modèle cible avant lot 4 ; le POST asynchrone et reprise sont obligatoires. | Oui : worker, acquisition atomique, lease/heartbeat, limites et test d'arrêt configurés. | Oui : comportement au redémarrage/indisponibilité et alertes opérationnelles éprouvés. | Proposition MVP : worker dans l'API avec runs durables en DB ; Service Bus n'est pas obligatoire sans décision de charge/opérations, bien qu'il figure au Bicep. |
| Journalisation/monitoring | Définir les champs autorisés, corrélation et règles de redaction avant d'ajouter des logs serveur. | Oui : vérifier absence de tokens, secrets, URL sensibles et transcript intégral dans captures de logs. | Oui : destination, accès, rétention, alertes et support validés par DSI/DGF. | Une solution de monitoring dédiée peut être reportée tant que les logs structurés minimaux et alertes d'exploitation sont présents. |
| Environnement M365 de test et corpus DGF | Pas nécessaire pour développer les parseurs avec fixtures non sensibles. | Oui pour la phase Graph authentifiée : identité/réunion/transcript autorisés par M365. | Oui : cas et données approuvés par les propriétaires DGF, participants informés selon règles locales, critères signés. | Les tests mockés restent utilisables en continu mais ne remplacent pas ces environnements. |
| Sauvegarde/restauration et exploitation | Définir RPO/RTO et propriétaire avant pilote ; pas nécessaire aux tests unitaires. | Vérifier une restauration de base avant recette de sécurité/persistance. | Obligatoire avant d'utiliser des données réelles : runbook, alertes, sauvegardes testées et responsabilité d'incident. | La taille/architecture de sauvegarde peut être dimensionnée après estimation d'usage, pas les exigences de protection/rétention. |

## E. Décisions et dépendances bloquantes

| Décision ou dépendance | Justification | Responsable de validation | Impact si non résolu | Moment limite | Solution provisoire acceptable |
|---|---|---|---|---|---|
| Rendre la solution .NET réellement exécutable et fixer le framework cible | Le `.sln` référence quatre projets mais aucun `.csproj`, `Program.cs` ou configuration de lancement n'a été trouvé ; le contrôleur seul ne peut être considéré comme une API livrable. | Équipe projet / architecture / DSI | Bloque tout build backend, toute API intégrable et la chaîne CI. | Avant le lot 0 et tout développement serveur. | Aucun contournement de production ; maquettes/tests parser isolés peuvent avancer sans prétendre livrer l'API. |
| Enregistrement API, audience et flux OBO | La SPA actuelle obtient des jetons Graph directs ; la cible est JWT d'audience API puis OBO côté serveur. | Administrateur Microsoft 365 / DSI sécurité / équipe architecture | Sans audience/consentement/credential serveur, authentification backend et appels Graph réels ne peuvent être validés. | Décisions au lot 1 ; valeurs et consentements avant le lot 3/IT Graph. | UT avec authentification simulée pour le code local uniquement ; jamais comme preuve DGF. |
| Permissions Graph effectives et périmètre des réunions autorisées | Le code contient des scopes demandés, mais ils ne prouvent pas le consentement ni l'accès à chaque ressource. | Administrateur Microsoft 365 et propriétaire DGF | Les tests Graph peuvent échouer ou atteindre des ressources non prévues ; aucun accès ne doit être contourné. | Avant le premier appel authentifié et avant recette. | Utiliser un tenant/corpus de test autorisé et confirmer l'accès, sans ajouter de permissions par défaut. |
| Moteur relationnel et topologie réseau | Le modèle cible n'arrête pas PostgreSQL ; le template décrit Azure SQL, non provisionné confirmé. | DSI / architecture / sécurité DGF | Bloque migrations, contraintes transactionnelles, leases, sauvegardes et isolation vérifiable. | Avant le lot 2. | Garder les ports d'accès via interfaces/repositories ; aucun moteur ne doit être choisi silencieusement. |
| Rétention, classification et stockage du transcript brut | Les transcriptions peuvent contenir des données sensibles ; le modèle garde brut/révisions et n'impose pas de durée. | DGF métier / sécurité / juridique / DSI | Bloque la persistance de données réelles et la recette avec contenu DGF. | Avant le premier stockage, lot 2 ; au plus tard avant tout Graph end-to-end persistant. | Développement avec fixtures synthétiques non sensibles ; aucun brut réel conservé provisoirement. |
| Worker, atomicité et limites de reprise | L'API est asynchrone et promet idempotence/reprise ; aucun broker/worker n'existe aujourd'hui. | Équipe architecture / DSI opérations | Risque de doubles traitements, runs perdus ou faux `succeeded` après arrêt/concurrence. | Avant le lot 4. | Worker mono-instance avec file DB et lease peut être proposé, sous tests d'arrêt/redémarrage et validation du moteur ; pas de simple tâche mémoire volatile. |
| ACL métier par réunion et politique anti-enumeration | Les routes exigent vérification de ressource ; rôle Graph seul ou ID opaque ne suffit pas. | DGF métier / DSI / administrateur Microsoft 365 | Risque d'accès inter-utilisateur ou de divulgation de l'existence d'une réunion/transcript. | Avant API consultable et tests du lot 1–3. | Refus par défaut ; pas de liste globale ni de fallback d'identité par UPN supposé. |
| Paramètres d'exploitation, volumétrie et sauvegarde | Timeouts, taille limite, retries, lease, rétention et reprise sont à fixer pour le pilote. | DSI opérations / équipe projet / DGF | Risque de saturation, replays incontrôlés et incapacité de restauration. | Valeurs minimales avant lot 4 ; runbook avant recette. | Paramètres bornés par configuration serveur, documentés et conservateurs ; pas de valeur supposée présentée comme décision. |
| Valeur de credential dans le fichier de modèle | Un champ credential non manifestement neutre est présent dans `.env.example` ; sa validité n'a pas été vérifiée et sa valeur est volontairement omise. | Équipe projet / sécurité DSI | Si valeur réelle, elle peut être exposée et compromettre le service ou un compte. | Vérifier avant toute nouvelle utilisation, publication ou intégration. | Ne pas la réutiliser ; si elle est réelle, la révoquer/renouveler selon la procédure DSI. Aucune modification n'a été effectuée dans cette mission. |

### Décisions pouvant être reportées

- L'IA d'extraction, le fournisseur IA et le modèle métier de preuves peuvent attendre un lot distinct ; ils ne sont pas une dépendance du flux de transcription.
- Le modèle institutionnel, la validation humaine de compte rendu, la génération DOCX/PDF et SharePoint peuvent attendre les lots documentaires ; aucune permission SharePoint n'est requise ici.
- L'agent Teams en direct et ses trois scénarios globaux (hôte organisateur, hôte invité, instance déjà lancée) restent un lot séparé et ne doivent pas être confondus avec Graph post-réunion.
- Azure AI Search du Bicep, les indexations vectorielles et les fonctions d'analyse IA ne sont pas nécessaires au MVP de la brique 01.
- Un broker dédié peut être reporté si le modèle worker/lease DB proposé passe les tests de fiabilité et si le pilote mono-instance est accepté.
- Les choix `reported`/`postponed` et le diagramme global de publication du référentiel restent à arbitrer dans le lot métier/documentaire ; ils ne bloquent pas le transcript engine.

## F. Stratégie de tests et de validation

Chaque lot se termine par un ensemble de preuves conservées sans jeton ni contenu sensible complet. Les identifiants et niveaux suivent le [plan de tests harmonisé](./08_PLAN_TESTS_ET_RECETTE.md).

| Niveau | Couverture attendue | Preuve de lot terminé | Ne permet pas d'affirmer |
|---|---|---|---|
| Tests unitaires (UT) | Parser VTT et texte non attribué ; validation structurelle ; transitions ; fallback strict ; redaction ; hash/version parser. | Sortie d'assertions reproductible, fixtures synthétiques et version de commit/build. | Accès Graph authentifié, consentement effectif ou comportement tenant. |
| Tests d'intégration (IT) | API + validation JWT + base ; migrations ; isolation tenant ; transactions ; idempotence et concurrence ; worker/reprise ; DTO et erreurs. | Résultats de tests sur ressources de test isolées, preuves de requêtes/DB/logs redacted et restauration. | Réponse réelle Microsoft Graph ou approbation DGF. |
| Tests Microsoft Graph authentifiés | OBO réel dans environnement autorisé ; calendrier, résolution, découverte, téléchargement VTT et scénario fallback si un cas autorisé le produit ; permissions effectives selon compte/meeting. | Build/version, tenant et identité de test non sensibles, date, endpoints/scénario, status, codes, request-id/correlation, résultat d'analyse et approbation M365. Ne pas archiver tokens ou transcript intégral. | Accès universel à toutes les réunions, validation de SharePoint ou validation fonctionnelle métier. |
| Tests d'isolation tenant | Faux `tenantId`, IDs locaux d'un autre tenant, utilisateur non autorisé, relations FK croisées et états suspendus. | Assertions négatives API et DB ; réponse conforme à la politique anti-enumeration ; absence de données révélées. | Isolation démontrée pour des routes ou systèmes non inclus dans le test. |
| Idempotence/concurrence | Même clé/même payload, même clé/autre payload, demandes simultanées, run actif/terminé, force reprocess et événement par arrivée. | Assertions API et données persistées prouvant un worker actif unique, `202`/`200`/`409` exacts et runs terminaux immuables. | Résilience du déploiement si le test n'inclut ni arrêt de worker ni reprise. |
| Reprise après erreur | HTTP 429/5xx, timeout Graph, coupure base, arrêt worker/lease expiré et échec pendant écriture des cues. | Événements de tentative, même `runId` pour reprise éligible, transaction annulée sans succès partiel et respect des limites configurées. | Comportement réel du tenant si les réponses Graph sont simulées. |
| Recette fonctionnelle DGF | Sélection d'une réunion autorisée et parcours complet, affichage/export du transcript, mode d'attribution, erreurs compréhensibles, contrôle d'accès et rétention. | Cas REC DGF approuvés, environnement/compte de test, verdict signé par le représentant métier et anomalies tracées. | Conformité globale des lots IA, documents, SharePoint ou Teams live. |

### Conditions de preuve du flux complet

La brique 01 ne peut être déclarée « opérationnelle dans l'environnement DGF » qu'après :

1. build/CI du backend réel et tests automatisés réussis ;
2. tests d'intégration avec DB et vérification négative inter-tenant ;
3. au moins un parcours Graph authentifié autorisé du backend OBO dans l'environnement prévu, avec les résultats A/B consignés si les deux variantes sont applicables ;
4. preuves d'idempotence, concurrence et reprise ;
5. recette DGF du parcours de consultation/export avec critères convenus ;
6. validation de rétention, secrets, sauvegarde et runbook pilote.

Un mock Graph, un test TypeScript local, un scope déclaré dans le code, un template Bicep ou une validation terrain rapportée séparément ne suffit pas à lui seul à remplir ces conditions.

## G. Ordre d'exécution recommandé

### Chemin critique

```text
Arbitrages de sécurité/environnement
  -> Lot 0 (solution .NET exécutable)
  -> Lot 1 (JWT API et identité/ACL)
  -> Lot 2 (DB, modèle et intégrité tenant)
  -> Lot 3 (OBO + réunions/découverte Graph)
  -> Lot 4 (ProcessingRun/worker/idempotence)
  -> Lot 5 (récupération, fallback, parsing, validation)
  -> Lot 6 (persistance, consultation/export et recette)
```

Le développement peut préparer en parallèle les cas de test parser/UI et les projets d'authentification locale, tant que les interfaces sont convenues. Les travaux nécessitant la base, le credential OBO ou des réunions DGF réelles ne doivent pas être déclarés terminés avant la disponibilité des dépendances correspondantes.

### Première livraison intermédiaire utile

**Slice 1 — API de lecture et découverte Graph** : une API exécutable et authentifiée liste les réunions autorisées, permet d'en sélectionner une, résout l'objet Teams et présente les métadonnées/présence d'un transcript. Le backend utilise OBO et garde le jeton Graph côté serveur. Cette livraison permet de valider la frontière de sécurité, le chemin d'identité, le Graph backend et l'intégration frontend avant de persister le contenu. Elle n'est pas le moteur complet, ne stocke pas de transcript réel et ne doit pas être annoncée comme telle.

Cette tranche correspond à une partie du lot 3 après les lots 0–1 ; le lot 2 et les arbitrages tenant doivent être suffisamment avancés pour que l'autorisation de réunion ne soit pas simulée comme une règle de production.

### Livraison du flux complet

La livraison complète intervient après le lot 6 : sélection → résolution Graph → découverte → téléchargement VTT/fallback → parsing → normalisation → validation structurelle → persistance de révision/cues et run → consultation/export par ID local. Elle exige les preuves distinctes listées en F, dont test Graph authentifié et recette DGF. Aucun calendrier n'est estimé ici faute de chiffrage fondé.

## H. Hors périmètre

La brique 01 ne comprend pas :

- extraction IA des décisions, propositions, faits et actions ;
- génération du compte rendu administratif ;
- génération DOCX/PDF ;
- publication ou versioning SharePoint ;
- agent Teams en direct.

Ces fonctions feront l'objet de lots distincts avec validations, permissions et critères d'acceptation propres. Les trois scénarios obligatoires du futur agent Teams restent à conserver dans son référentiel ; ils ne constituent pas une fonction de récupération post-réunion.

## 9. Écarts et limites de l'état constaté

Les principaux écarts entre cible et dépôt au moment de l'inspection sont :

1. La logique métier Graph est dans le navigateur, alors que la cible sécurisée requiert un backend Graph/OBO.
2. L'authentification MSAL existe pour l'application SPA et des scopes Graph sont demandés ; l'audience API, sa validation JWT et OBO ne sont pas établis.
3. Le backend est un squelette de domaines/interfaces et un contrôleur legacy ; les fichiers requis pour restaurer, construire et démarrer la solution ne sont pas présents dans l'inventaire.
4. Les modèles `Meeting`, `MeetingReport` et `ActionItem` ne fournissent ni révisions de transcription, ni cues, ni runs, événements ou intégrité tenant cible.
5. L'orchestration asynchrone, la persistance durable, l'idempotence et le contrôle de concurrence ne sont pas implémentés.
6. La CI déclare un job .NET, mais son exécution n'a pas été vérifiée ; ses références de projet ne sont pas présentes dans l'état inspecté et son intitulé frontend ne reflète pas le couple React/Vite observé.
7. Le Bicep décrit des ressources candidates ; aucun provisionnement DGF n'a été vérifié et des décisions DB, réseau, secrets et rétention restent ouvertes.
8. Les tests existants du service transcript testent des réponses simulées ; le script `test-real-teams-transcript.ts` inspecté utilise aussi des mocks. Ils ne constituent pas une validation Microsoft 365.

## 10. Conclusion opérationnelle

Le frontend et la logique cliente de récupération/fallback/parsing forment un socle réutilisable pour l'interface et les règles de parité. La brique de production documentée ne peut toutefois pas démarrer comme flux backend livrable avant la création d'une solution .NET exécutable, l'arbitrage de l'authentification API/OBO et l'arrêt du choix de persistance/rétention.

Les premières décisions peuvent être traitées avant le code serveur ; le parsing et les tests mockés peuvent être préparés avec des données synthétiques. Le chemin de production reste bloqué avant tout accès Graph backend tant que l'identité, l'audience, les credentials et permissions effectives ne sont pas approuvés. La persistance de données DGF est également bloquée tant que le moteur, la classification et la durée de conservation ne sont pas fixés.

Ce document est un dossier de préparation, pas un plan de déploiement ou une approbation de ressources. Il n'atteste aucune nouvelle validation Graph authentifiée.
