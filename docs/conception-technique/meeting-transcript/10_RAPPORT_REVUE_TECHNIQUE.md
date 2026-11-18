# 10 — Rapport de revue technique

## 1. Synthèse exécutive

Les neuf documents décrivent correctement plusieurs invariants importants — récupération Graph post-réunion, fallback de format, absence d'invention des intervenants, séparation entre contenu source et données normalisées, et nécessité d'une validation humaine. Ils distinguent aussi, dans plusieurs passages, la cible proposée des composants présents dans le dépôt.

Ils ne forment toutefois pas encore une spécification directement implémentable sans arbitrages. Des écarts touchent des contrats fondamentaux : cardinalité des preuves, isolation des tenants, vocabulaire et transitions des statuts, ordre d'approbation/publication, périmètre d'authentification Graph et idempotence. Certains composants sont en outre décrits comme « vérifiés » alors que le code correspondant ne fournit qu'une fonction plus limitée ou qu'une logique côté navigateur.

**Verdict : BLOQUANT pour lancer l'implémentation de production sur la base de ces documents sans correction préalable.** La récupération et l'analyse de transcript côté client peuvent rester le socle existant, mais le modèle persistant, les frontières d'autorisation, les statuts et les contrats de traitement doivent être harmonisés et validés. Ce verdict ne remet pas en cause la validation de terrain des scénarios de transcription rapportée par le responsable du projet ; il constate que les documents et tests du dépôt ne suffisent pas à eux seuls à spécifier le service backend de production.

### Périmètre et méthode

Les neuf livrables de conception ont été lus intégralement. Les sept documents de `docs/preparation-architecture/` ont été consultés sur les thèmes de cohérence transversale demandés. Les affirmations relatives au code ont été confrontées notamment à [transcriptService.ts](../../../src/services/transcriptService.ts), [graphClient.ts](../../../src/services/graphClient.ts), [test-transcript-service.ts](../../../scripts/test-transcript-service.ts), [IMicrosoftGraphService.cs](../../../backend/src/ReadMeeting.Application/Interfaces/IMicrosoftGraphService.cs) et [Meeting.cs](../../../backend/src/ReadMeeting.Domain/Entities/Meeting.cs).

La revue était documentaire et en lecture seule : aucun test, build ou lint n'a été exécuté. Les tests existants ont été inspectés, pas relancés. Le worktree comportait déjà des modifications applicatives et documentaires sans rapport avec cette revue ; elles n'ont pas été modifiées.

## 2. Tableau des neuf documents examinés

| Document | Évaluation | Constats principaux |
|---|---|---|
| [01_ARCHITECTURE_DETAILLEE.md](./01_ARCHITECTURE_DETAILLEE.md) | **MAJEUR** | Bonne séparation des composants et statut de la cible, mais les graphes de flux ne distinguent pas toujours clairement le parcours frontend existant de l'architecture backend cible. Les composants « orchestrateur » et « validateur » sont décrits comme existants/adaptables malgré l'absence d'orchestrateur backend et de validateur structurel correspondant. |
| [02_DIAGRAMMES_SEQUENCES.md](./02_DIAGRAMMES_SEQUENCES.md) | **MAJEUR** | Le flux Graph existant et le fallback sont lisibles. Le flux cible indique une réponse de traitement achevé avant la réponse API, alors que le contrat API prévoit `202` et une consultation ultérieure. Le parcours de traitement et l'appel IA ne sont pas raccordés de façon cohérente au diagramme d'architecture. Certaines transitions de reprise sont discutables ou incompatibles avec les règles non retryables. |
| [03_SPECIFICATIONS_COMPOSANTS.md](./03_SPECIFICATIONS_COMPOSANTS.md) | **MAJEUR** | Les responsabilités visées sont utiles, mais la classification du `Transcript Validator` comme « existant et vérifié » est trop large : les fonctions présentes catégorisent des erreurs et contrôlent un état d'approbation, sans implémenter les validations de segments, doublons et cohérence décrites ici. Le Processing Orchestrator n'est pas un composant backend opérationnel. |
| [04_MODELE_DONNEES.md](./04_MODELE_DONNEES.md) | **BLOQUANT** | Modèle candidat utile, mais pas de relation persistante exploitable garantissant plusieurs preuves par élément métier ; clés d'idempotence incompatiblement définies ; certaines colonnes référencées dans les contraintes ne figurent pas dans les attributs ; les règles de tenant et de statut ne sont pas entièrement traduites en contraintes. |
| [05_INTEGRATION_MICROSOFT_GRAPH.md](./05_INTEGRATION_MICROSOFT_GRAPH.md) | **MAJEUR** | Le flux navigateur existant et la cible OBO sont distingués. En revanche, la présence de scopes dans le code ne démontre ni consentement effectif, ni droits tenant, et la formulation de « permissions déjà validées » doit rester limitée à ce qui est réellement observé. L'OBO reste une option cible, non implémentée ni validée. |
| [06_CONTRATS_API.md](./06_CONTRATS_API.md) | **BLOQUANT** | Contrats utiles pour amorcer le travail, mais authentification/autorisation et tenant scope insuffisamment spécifiés ; `tenantId` est fourni comme paramètre facultatif ; les routes diffèrent du diagramme de séquence ; semantics de `requestId`, `forceRefresh`, `retry` et réponse `202` incomplètes. |
| [07_ERREURS_REPRISES_IDEMPOTENCE.md](./07_ERREURS_REPRISES_IDEMPOTENCE.md) | **MAJEUR** | Bonne taxonomie initiale et règles de journalisation. Les transitions `FailedPermission -> Pending` et `Completed -> skipped_duplicate` contredisent la classification non retryable et l'idée d'un run terminé immuable. Les règles de concurrence et d'idempotence ne permettent pas encore une implémentation sans doublons. |
| [08_PLAN_TESTS_ET_RECETTE.md](./08_PLAN_TESTS_ET_RECETTE.md) | **MAJEUR** | Bonne séparation conceptuelle entre tests locaux, mocks, validation réelle tenant et recette métier. Plusieurs critères restent des intentions sans cas identifiés, données, assertions ou seuils de réussite détaillés ; le rapport ne doit pas assimiler scripts automatisés et tests authentifiés DGF. |
| [09_DECISIONS_TECHNIQUES_ET_POINTS_A_CONFIRMER.md](./09_DECISIONS_TECHNIQUES_ET_POINTS_A_CONFIRMER.md) | **MAJEUR** | Le registre des incertitudes est pertinent. Les décisions justifiées autour de Graph et du fallback doivent toutefois préciser qu'elles justifient la réutilisation d'un code présent et de tests de logique, et ne valent pas validation de l'API backend, de la persistance ou des permissions effectives. |

## 3. Anomalies et incohérences

### 3.1. BLOQUANT — Les preuves multiples ne sont pas représentées par un contrat relationnel effectif

Le modèle technique exige qu'un fait ou élément métier soit étayé par une ou plusieurs preuves. Pourtant, dans [04_MODELE_DONNEES.md](./04_MODELE_DONNEES.md), `Fact` ne porte qu'un `source_evidence_id` nullable et la table `SourceEvidence` ne comporte aucun lien vers l'entité métier propriétaire. Les relations Mermaid indiquent des liens depuis plusieurs types d'éléments vers les preuves, mais le schéma relationnel ne définit ni clés étrangères correspondantes, ni tables de jonction. Le modèle métier consolidé présente aussi un seul `source_evidence_id` pour `Fact` et n'explicite pas de table de liaison permettant plusieurs preuves pour chaque décision/action.

Conséquence : l'exigence de preuve multiple est exprimée en prose mais n'est pas garantie par les données ; il est également impossible de retrouver sans ambiguïté tous les éléments soutenus par une preuve. La relation source-cue et la copie éventuelle de `source_text` ne suffisent pas à garantir l'intégrité avec le passage original.

**Correction requise :** définir des associations explicites (par exemple des tables de liaison typées ou une association polymorphe contrôlée), cardinalités, clés étrangères, règles de suppression et contraintes prouvant qu'une décision/action ne peut être persistée sans au moins une preuve valide. Inclure la localisation immuable du passage (transcript/version, cue ou offsets, horodatage) et le comportement si la source est purgée.

### 3.2. BLOQUANT — L'isolation tenant est déclarée mais pas spécifiée au niveau de l'intégrité et de l'API

Le modèle consolidé dit que chaque donnée opérationnelle doit être isolée par `tenant_id`, mais le schéma ne porte pas ce champ sur toutes les entités enfants et ne prévoit pas de clés étrangères composites garantissant que les parents d'une même relation appartiennent au même tenant. Les documents API exposent `tenantId?` en entrée de `GET /api/meetings`, sans préciser que le tenant autorisé doit être dérivé des claims vérifiés côté serveur plutôt que choisi par l'appelant.

**Correction requise :** spécifier la source de vérité tenant (claims Entra validés et mapping autorisé), l'autorisation par objet, les contraintes d'intégrité inter-tenant et le filtrage systématique (ou mécanisme équivalent tel que Row-Level Security, si retenu). Les identifiants locaux et Graph ne doivent pas être interchangeables. Ajouter des tests négatifs d'accès croisé entre tenants.

### 3.3. MAJEUR — Statuts, transitions et ordre du workflow divergent

- Les documents emploient des vocabulaires différents : `reported` au lieu de `postponed/deferred`, `to_confirm`/`pending_validation`, statuts d'action propres (`in_progress`, `done`), et statuts de document `review` ou `under_review`. Le jeu d'états métier requis n'est donc pas harmonisé.
- Dans le diagramme consolidé de publication de [01_ARCHITECTURE_CIBLE.md](../../preparation-architecture/01_ARCHITECTURE_CIBLE.md), le flux global relie la publication SharePoint avant la validation humaine ; le diagramme détaillé de publication et le plan de recette placent au contraire la validation avant la génération finale et la publication.
- Le diagramme de [02_DIAGRAMMES_SEQUENCES.md](./02_DIAGRAMMES_SEQUENCES.md) montre la persistance, puis l'appel du dépôt vers le moteur IA ; la responsabilité est inversée par rapport au flux d'orchestration et au modèle cible.

**Correction requise :** publier un dictionnaire unique de statuts par agrégat, ses transitions autorisées et ses gardes, puis corriger tous les diagrammes selon l'ordre métier retenu : extraction et preuves → brouillon → validation humaine → génération/version finale → contrôles → publication. Distinguer une version de brouillon d'une version finale ; une modification après approbation doit invalider cette approbation.

### 3.4. MAJEUR — Contrats API non alignés et frontières d'autorisation incomplètes

Le diagramme cible utilise `POST /meetings/{id}/transcript/process`, tandis que [06_CONTRATS_API.md](./06_CONTRATS_API.md) spécifie `POST /api/meetings/{meetingId}/transcripts/process`. Le diagramme paraît retourner le résultat du traitement dans la même séquence, tandis que le contrat annonce `202 Accepted`, `processingRunId` et une consultation ultérieure. Les documents ne définissent pas si `{meetingId}` est un identifiant local ou Microsoft Graph, ni la manière de déterminer l'utilisateur organisateur et la ressource Graph autorisée.

Le contrat `/api/auth/graph/obtain` peut laisser entendre qu'un jeton Graph est un objet d'API à obtenir ou exposer. Dans une cible OBO, le jeton doit rester dans le backend et être obtenu au moment de l'appel Graph ; le client ne devrait recevoir qu'un statut non sensible. De plus, `tenantId?`, `forceRefresh`, `requestId`, `manualOverride` et `reason` n'ont pas de sémantique de sécurité/idempotence normative.

**Correction requise :** définir un OpenAPI cohérent, routes canoniques, identifiants, schémas/erreurs, codes HTTP et machine d'état asynchrone ; préciser l'audience et la validation JWT, les rôles/ressources autorisés, le tenant issu des claims, le comportement OBO et la non-exposition du jeton ; supprimer tout tenant fourni par le client comme source d'autorité.

### 3.5. MAJEUR — Intégration Graph : scopes observés ≠ autorisations tenant validées

Le code [graphClient.ts](../../../src/services/graphClient.ts) contient des scopes demandés par MSAL, dont `OnlineMeetingTranscript.Read.All`. Cela prouve une demande configurée, pas le consentement administrateur, les droits effectifs sur toute réunion, ni la configuration de politique Teams. Les documents de gouvernance reconnaissent en partie cette distinction, mais le tableau « permissions déjà validées » et certaines mentions « valide pour la récupération » peuvent être lus comme une validation de permissions Microsoft 365.

Le mécanisme OBO décrit est une cible uniquement. Le backend présent n'inclut pas de projet `.csproj`, de `Program.cs` ou de `DbContext` observé lors de cette revue ; la solution .NET visible n'est donc pas une preuve d'API exécutable. Le contrat `IMicrosoftGraphService` ne suffit pas à démontrer l'implémentation Graph ou SharePoint.

**Correction requise :** remplacer « permission validée » par une qualification explicite : scope demandé dans le code, consentement observé ou non, validation tenant rapportée séparément, permission déléguée/applicative et endpoint concerné. Spécifier le modèle OBO et l'identité de ressource avant implémentation. Conserver la validation terrain des transcriptions rapportée par le responsable comme un niveau de preuve distinct des scripts automatisés.

### 3.6. MAJEUR — Classification de composants trop affirmative

Dans [01_ARCHITECTURE_DETAILLEE.md](./01_ARCHITECTURE_DETAILLEE.md) et [03_SPECIFICATIONS_COMPOSANTS.md](./03_SPECIFICATIONS_COMPOSANTS.md), `Transcript Validator` est « existant et vérifié » avec des responsabilités de validation d'horodatages, de segments et de contenu incohérent. Le code observé fournit notamment `explainTranscriptError` et `enforceHumanValidationGate`; cette dernière est une garde logique qui examine des champs d'approbation, et non un processus complet de validation humaine persisté. Aucun validateur indépendant de cohérence des segments ou orchestrateur persistant backend n'a été établi par les fichiers examinés.

**Correction requise :** reclasser ces éléments comme « logique partielle côté client » ou « à développer », associer chaque responsabilité à une fonction réellement présente, et séparer le garde-fou de publication d'un workflow de validation humaine auditable.

### 3.7. MAJEUR — Idempotence et reprises non déterministes

Le modèle [04_MODELE_DONNEES.md](./04_MODELE_DONNEES.md) rend `ProcessingRun` unique par `(meeting_id, transcript_id, run_key)`, puis déclare `run_key` seul unique. Le contrat API fournit un `requestId` et un booléen `forceRefresh`, sans définir leur rôle par rapport à `run_key` et au hash de contenu. Il manque la politique sur les appels simultanés, l'acquisition atomique d'un run actif, les versions de parser, les échecs après téléchargement, et la reprise d'un résultat partiellement persisté.

Dans [07_ERREURS_REPRISES_IDEMPOTENCE.md](./07_ERREURS_REPRISES_IDEMPOTENCE.md), `FailedPermission -> Pending` est en conflit avec le caractère non retryable d'une erreur de permission ; `Completed -> skipped_duplicate` modifie un état terminal au lieu de représenter le doublon comme résultat d'une nouvelle demande.

**Correction requise :** choisir une clé d'idempotence et son périmètre (requête client, contenu source, version du traitement), définir unicité et transactions/concurrence, séparer l'état du run de la décision « doublon », rendre immuable un run terminé et documenter les relances avec limites, temporisation et conditions de reprise.

### 3.8. MAJEUR — Plan de test insuffisamment mesurable pour la recette de production

Le plan contient les bons sujets (VTT, fallback, erreurs Graph, doublons, isolation, validation), mais nombre de tests ne précisent ni jeux d'entrée, ni résultat exact, ni critères d'échec. Les assertions des scripts TypeScript existants vérifient notamment l'en-tête `Accept`, l'absence de `$format` sur le fallback, le même endpoint simulé, le parsing et les diagnostics ; ce sont des tests automatisés avec Graph mocké, pas des appels authentifiés au tenant. Aucun test de persistance backend ne peut être confirmé puisque la persistance et l'API ne sont pas présentes dans le périmètre observé.

**Correction requise :** transformer les scénarios en cas numérotés avec données, assertions, type de test et preuve attendue ; séparer mock, intégration contrôlée, validation terrain rapportée et recette DGF ; définir seuils mesurables pour parsing, reprise, isolation et absence de fuite. Aucun seuil métier ne doit être présenté comme approuvé avant validation DGF.

### 3.9. MINEUR — Conservation et provenance de la source à préciser

La séparation brut/normalisé et l'empreinte sont de bons principes. Il reste à préciser le caractère immuable du brut, le format effectivement renvoyé (VTT ou média texte Graph), les métadonnées de requête à conserver sans contenu sensible, la version de normalisation et la politique de rétention/suppression. Les attributs `source_transcript_id` évoqués dans les contraintes du modèle technique ne figurent pas dans la liste d'attributs de `Transcript`.

**Correction recommandée :** harmoniser les noms/types, distinguer identifiant Graph de l'identifiant local, associer chaque résultat normalisé à l'empreinte et à la version de parsing de sa source et établir les règles de conservation avec la DGF.

### 3.10. MINEUR — Périmètre de la première brique à figer

Les documents de conception de Meeting & Transcript Processing incluent des échanges vers le moteur IA, des entités métier de compte rendu, la génération documentaire et l'agent Teams. Les documents consolidés disent pourtant que l'IA et la génération sont à construire et séparent explicitement la récupération post-réunion de la participation live Teams.

**Correction recommandée :** limiter l'acceptation de cette première brique à la résolution de réunion, découverte/récupération Graph, fallback, parsing, diagnostic et (si approuvés) stockage/consultation sécurisés. Traiter extraction IA, publication et participation live comme des lots et décisions distincts.

## 4. Éléments conformes

- **Fallback Graph : CONFORME dans le code et les tests mockés.** [fetchTranscriptContent](../../../src/services/transcriptService.ts) déclenche le fallback seulement lorsque `innerError.code` vaut `SpeakerAttributionNotAllowed`, réutilise le chemin de contenu/transcript et envoie `Accept: application/vnd.microsoft.graph.transcript+text` sans `$format` alternatif. [test-transcript-service.ts](../../../scripts/test-transcript-service.ts) vérifie explicitement ces propriétés et la conservation de l'erreur si le second appel échoue. Cela ne constitue pas un nouveau test authentifié.
- **Intervenants non attribués : CONFORME au principe.** Le parseur sans attribution affecte le libellé non attribué, expose zéro intervenant identifié et ne fabrique pas de nom ; l'export texte est testé par script.
- **Séparation de niveaux de preuve : CONFORME dans l'intention.** Les documents consolidés distinguent validation terrain rapportée, tests automatisés et architecture à construire. Cette distinction doit être conservée dans les formulations corrigées.
- **Graph post-réunion vs agent Teams live : CONFORME dans les documents consolidés.** Le besoin live est identifié comme une architecture distincte et dépendante de validations DGF/Microsoft 365 ; les trois scénarios métier obligatoires sont rappelés.
- **Sécurité des journaux : CONFORME comme exigence.** Les documents interdisent d'enregistrer jetons et transcription complète dans les journaux techniques. La mise en œuvre durable de ces garanties reste à tester.
- **SharePoint et gouvernance IA : CONFORME comme décisions ouvertes.** Site, bibliothèque, identité, permissions effectives, rétention et fournisseur IA ne sont pas présentés comme des validations à acquérir par simple présence de contrats ou dépendances.

## 5. Points manquants avant implémentation

1. Modèle relationnel exécutable de preuves multiples et contraintes de cohérence tenant.
2. Dictionnaire canonique des statuts, transitions et états terminaux, aligné entre transcript, run, décision/action et document.
3. Contrat API cohérent et modèle d'autorisation complet, notamment tenant, réunion locale/Graph, OBO et opérations asynchrones.
4. Décision documentée sur la persistance et le stockage brut, l'immutabilité, les index, la rétention, la purge, les sauvegardes et l'accès.
5. Stratégie d'idempotence/concurrence testable et règles de reprise Graph.
6. Backend .NET exécutable, configuration d'authentification/persistance et tests de contrat/intégration — à construire ou à confirmer, pas à supposer.
7. Matrice de permissions Graph effective et consentements administrateur, séparant le code présent, l'état tenant observé et la validation terrain rapportée.
8. Définition du périmètre accepté pour cette première brique, sans dépendance implicite à l'IA, SharePoint ou Teams live.

## 6. Recommandations de correction par priorité

| Priorité | Catégorie | Action attendue | Livrables à corriger |
|---|---|---|---|
| P0 | **BLOQUANT** | Résoudre cardinalité et contrainte des preuves multiples ; ajouter les relations et contraintes d'intégrité. | 04, puis 01/02/03 et modèle consolidé 02 |
| P0 | **BLOQUANT** | Spécifier la frontière tenant/autorisation, dériver le tenant des claims et rendre cohérente l'API avec le flux backend/OBO. | 01, 02, 05, 06, 09 |
| P1 | **MAJEUR** | Harmoniser statuts et transitions ; corriger ordre de validation, génération finale et publication dans tous les diagrammes. | 01, 02, 04, 07 et préparation 01/02/04 |
| P1 | **MAJEUR** | Définir clé d'idempotence, concurrence, reprise, erreurs terminales et invariants d'un run terminé. | 04, 06, 07, 08 |
| P1 | **MAJEUR** | Reclasser les composants selon les implémentations réellement présentes ; distinguer validation de structure et garde d'approbation. | 01, 03, 05, 09 |
| P1 | **MAJEUR** | Préciser le statut des permissions et de l'OBO sans confondre scopes demandés, consentement tenant et validation terrain. | 05, 06, 09 et préparation 03/05 |
| P1 | **MAJEUR** | Convertir les scénarios de recette en cas traçables avec assertions ; distinguer mocks, intégration et recette réelle. | 08 et préparation 04 |
| P2 | **MINEUR** | Harmoniser identifiants/champs de provenance, politique de conservation et délimitation de la première brique. | 01, 04, 08, 09 |

## 7. Décisions nécessitant encore une validation DGF ou Microsoft 365

### DGF / métier / sécurité

- Périmètre de production de la première brique et rôles autorisés à consulter les transcriptions.
- Politique de conservation, purge, sauvegarde et accès aux contenus originaux.
- Modèle canonique des statuts métier et règles de validation humaine.
- Critères mesurables de recette et corpus métier représentatif.
- Validation juridique et sécurité de l'hébergement/traitement des données.

### Administrateur Microsoft 365

- Consentement effectif et portée des permissions Graph déléguées nécessaires, pour les ressources et réunions concernées.
- Conditions d'accès aux réunions/transcriptions selon identité (organisateur, invité, tiers) et politiques tenant.
- OBO, enregistrement d'application, audiences, consentement et limites du flux backend cible.
- Si SharePoint est inclus : site, bibliothèque, dossier, identité de publication, droits effectifs et versioning.
- L'agent Teams live reste une décision et un prototype séparés ; les scénarios métier requis ne constituent pas une preuve de faisabilité Microsoft.

## 8. Verdict d'aptitude à l'implémentation

**Non apte à une implémentation de production directement guidée par les neuf documents en l'état.** Les corrections P0 sont nécessaires avant de créer le schéma persistant ou d'exposer les contrats API, car elles touchent l'isolation des données et la traçabilité obligatoire des décisions/actions. Les corrections P1 sont nécessaires avant d'implémenter workflow et reprise.

La logique frontend de transcription existante reste réutilisable et les documents constituent une base de conception utile. Le verdict ne conclut ni à l'échec de la validation de terrain rapportée, ni à une validation authentifiée réalisée par cette revue. Aucun test, build, lint, accès Graph tenant ou vérification SharePoint n'a été effectué dans cette mission.

## 9. Opérations effectuées

- Examen intégral des neuf documents de conception et consultation croisée des sept documents consolidés.
- Vérification ciblée des affirmations par lecture du code et des scripts de test pertinents.
- Aucune modification des neuf originaux, du code source, des dépendances ou des configurations.
- Création de ce seul rapport ; aucun test ou déploiement lancé.
