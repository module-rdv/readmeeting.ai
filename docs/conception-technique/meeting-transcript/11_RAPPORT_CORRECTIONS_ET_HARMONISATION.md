# 11 — Rapport de corrections et d'harmonisation

## 1. Objet et périmètre

Ce rapport documente la correction documentaire de la brique 01, effectuée à partir des constats du [rapport de revue technique](./10_RAPPORT_REVUE_TECHNIQUE.md).

Documents corrigés : les neuf fichiers `01` à `09` de `docs/conception-technique/meeting-transcript/`. Le rapport historique `10_RAPPORT_REVUE_TECHNIQUE.md` a été conservé sans modification. Les sept fichiers de `docs/preparation-architecture/` ont été consultés comme références et ne sont ni recréés ni remplacés.

La mission est documentaire : aucun code applicatif, dépendance, configuration, migration, ressource Microsoft 365 ou déploiement n'a été modifié.

## 2. Constats de la revue initiale

La revue avait établi les principaux écarts suivants :

1. Une exigence de preuves multiples était exprimée en texte sans relation de persistance et de clés étrangères suffisantes.
2. L'isolation tenant n'était pas garantie de bout en bout ; `tenantId` pouvait apparaître comme paramètre client sans règle de source d'autorité.
3. Les identifiants locaux et Microsoft Graph, les routes API, et le comportement asynchrone n'étaient pas cohérents entre diagrammes et contrats.
4. Les statuts et transitions mélangeaient traitement, décisions métier et documents ; les diagrammes de publication n'exprimaient pas partout le même ordre.
5. Idempotence, concurrence, reprise et mutation de runs terminés n'étaient pas spécifiées de façon déterministe.
6. Des composants cibles (validator, orchestrateur, backend) étaient décrits comme existants/vérifiés au-delà de ce que leurs fonctions observées démontraient.
7. Le plan de tests ne détaillait pas chaque cas et pouvait être lu comme confondant mocks et validation réelle Microsoft 365.
8. La première brique n'était pas toujours distinguée des lots IA, documents, SharePoint et agent Teams live.

## 3. Corrections apportées

| Thème | Correction documentaire | Fichiers concernés |
|---|---|---|
| Classification et périmètre | Requalification des éléments observés côté client, partiels et à développer ; distinction du parsing, du validateur structurel à créer et du simple `enforceHumanValidationGate`; exclusion de l'extraction IA, génération, SharePoint et Teams live des critères de la brique 01. | 01, 02, 03, 05, 09 |
| Preuves multiples | Ajout de `EvidenceSubject` / `EvidenceLink` en M:N ; définition de PK/FK composites, cardinalités, tenant et réunion ; une preuve peut soutenir plusieurs sujets, et un sujet peut avoir plusieurs preuves. Les entités IA restent futures. | 04, 02 (diagramme), 09 |
| Provenance source | Ajout de TranscriptRevision immuable, hash du contenu brut, cue rattachée à une révision et preuves localisables ; règles de suppression en `RESTRICT` et purge auditées. | 04, 05 |
| Isolation tenant | Source de vérité définie côté serveur par `tid` vérifié et `oid` vérifié ; `tenantId` client non autoritaire ; FKs composites interdisant les liens inter-tenant ; autorisation par ressource et tests négatifs prescrits. | 04, 05, 06, 08 |
| Authentification Graph/API | Définition du JWT destiné à l'audience API et du flux OBO cible côté serveur ; jeton Graph non retourné au frontend ; séparation entre scopes demandés, consentement observé, test mocké et validation terrain rapportée. | 05, 06, 08, 09 |
| Contrats API | Routes unifiées `/api/v1`, UUID locaux et IDs Graph explicitement nommés, schémas de requête/réponse, `202 Accepted`, `Location`, suivi de run et erreurs codées. | 02, 06 |
| Statuts et transitions | Dictionnaire canonique de `ProcessingRun`, états initiaux/intermédiaires/terminaux, transitions, erreur retryable vs permanente et immutabilité des états terminaux. | 02, 03, 04, 06, 07, 08 |
| Idempotence/concurrence | Clé d'idempotence et portée, hash de payload, fingerprint source + version parser, reprocessing volontaire, acquisition atomique/lease, reprise d'interruption et traitement d'un résultat existant ; nouveau run jamais utilisé pour muter l'ancien. | 04, 06, 07, 08 |
| Trace des demandes | Ajout d'un événement append-only par arrivée HTTP, y compris réutilisation ou conflit ; l'événement de requête est distinct du run de calcul. | 04, 06, 07, 08 |
| Tests | Cas UT/IT/Graph authentifié/recette DGF dotés d'identifiants, préconditions, données, scénario, assertions et preuve attendue. | 08 |
| Fallback | Règle rappelée explicitement : déclenchement uniquement sur `innerError.code=SpeakerAttributionNotAllowed`, même endpoint/transcriptId, header `Accept` alternatif, pas de `$format` alternatif. | 02, 03, 05, 08, 09 |

## 4. Choix de conception retenus

### 4.1 Modèle de preuves

Le supertype `EvidenceSubject` et la table `EvidenceLink` apportent une relation M:N vérifiable sans imposer les traitements d'extraction IA dans la brique de transcription. Des FK composites tenant/réunion et des liens obligatoires vers TranscriptRevision/Cue rendent l'origine vérifiable. Les tables d'entités métier typées restent à concevoir dans leur lot.

### 4.2 Identité et accès

Le `tenant_id` interne découle du `tid` vérifié par l'API ; l'acteur découle de `oid`. Les IDs locaux ne sont pas des IDs Graph. L'API filtre et autorise chaque ressource ; les contraintes composites constituent une protection d'intégrité additionnelle. Le scope Graph seul ne donne pas une autorisation applicative.

### 4.3 Traitement et asynchronisme

Le POST de traitement est asynchrone : `202` indique acceptation, jamais réussite. Un `runId` local et une URL de suivi permettent d'observer les étapes et l'état terminal. Le fallback est une branche interne du stade de téléchargement, pas une transition métier.

### 4.4 Idempotence

Une même clé et un même payload renvoient le run déjà référencé ; une même clé avec payload différent renvoie conflit ; une demande distincte est enregistrée comme `ProcessingRequestEvent`; un run actif équivalent est réutilisé sans second worker ; `forceReprocess` avec nouvelle clé crée un nouveau run. Les résultats terminés restent immuables.

### 4.5 Niveaux de validation

- **Observé dans le code :** client MSAL/Graph et parseurs côté frontend, diagnostics.
- **Tests mockés :** scripts vérifiant des réponses simulées et la logique locale.
- **Validation terrain rapportée :** scénarios A/B de récupération transcript, telle que confirmée par le responsable dans le référentiel global.
- **À construire :** backend API/OBO, persistance, validation structurelle complète, run store, intégrité tenant, concurrence.

Aucun de ces niveaux n'est présenté comme preuve d'un autre niveau.

## 5. Cohérence obtenue entre documents techniques

- Architecture et spécifications distinguent now le code frontend observé des composants backend à développer.
- Diagramme cible et contrat utilisent les mêmes routes `/api/v1`, même sémantique `202` et suivi par `runId`.
- Le modèle relie les IDs locaux, IDs Graph, révisions, cues et preuves sans traversée de tenant.
- Les noms de statuts de ProcessingRun et transitions ont le document 07 comme source normative.
- L'authentification cible est identique dans diagrammes, contrat API et intégration Graph.
- Le plan de tests sépare mocks, intégration, Graph authentifié et recette DGF, sans déclarer les trois derniers réalisés.
- L'ordre documentaire futur est décrit comme extraction/preuves → brouillon → validation liée à une version → génération/version finale → contrôles → publication ; il est hors périmètre de la brique 01.
- La distinction entre récupération post-réunion et présence Teams en direct reste explicite.

## 6. Points non résolus et validations humaines requises

### DGF / sécurité / architecture

- Valider le périmètre de production de la brique 01, les rôles utilisateurs et l'autorisation par réunion.
- Choisir le moteur de données, l'hébergement, le chiffrement, le stockage du brut, les sauvegardes, la rétention et la purge.
- Approuver le comportement des erreurs, la stratégie d'essais/leases et les indicateurs/critères de recette.
- Valider que `EvidenceSubject/EvidenceLink` correspond au futur modèle métier.
- Confirmer l'audience de l'API et les exigences de sécurité associées.

### Administrateur Microsoft 365

- Confirmer enregistrement/audience API, consentement et scopes Graph délégués requis pour les opérations de brique 01.
- Valider l'OBO cible, les credentials serveur, politiques tenant et accès effectif selon l'identité de réunion.
- Toute publication SharePoint exige des décisions propres (site, bibliothèque, identité, permissions effectives, versioning) et reste hors périmètre.

### Arbitrages du référentiel global à ne pas modifier silencieusement

1. `docs/preparation-architecture/02_MODELE_DONNEES_METIER.md` inclut `reported` ; le vocabulaire technique proposé inclut `postponed`. DGF doit choisir le statut métier canonique avant le lot extraction/action.
2. L'avancement d'une action (`in_progress`, `completed`) doit être distinct de son statut décisionnel. L'évolution du document global nécessite une approbation métier.
3. Le diagramme de publication de `docs/preparation-architecture/01_ARCHITECTURE_CIBLE.md` place visuellement SharePoint avant la validation humaine, contrairement à son flux détaillé. Le propriétaire du référentiel doit arbitrer/corriger cet ordre global.
4. Le choix du fournisseur IA et les règles de conservation/traitement restent ouverts.
5. Les trois scénarios agent Teams restent impératifs dans le lot live : hôte organisateur → jonction automatique lorsque l'hôte rejoint ; hôte invité → attente de sollicitation ; instance déjà appelée → ne pas lancer de doublon et informer l'hôte. Faisabilité, transparence, hébergement et permissions sont à valider séparément par DGF/M365.

## 7. Vérifications effectuées et limites

Vérifications documentaires effectuées :
- présence et lecture des neuf documents source et du rapport historique 10 ;
- lecture croisée des sept documents globaux de préparation pour les décisions et contradictions transversales ;
- inspection ciblée des fonctions TypeScript, de l'interface Graph .NET, du modèle Meeting et des scripts de test pertinents ;
- contrôle des noms de routes, états, règles d'idempotence, relations de preuve et classifications après correction.

Limites :
- aucun test automatisé, lint, build ou test Graph authentifié n'a été exécuté ;
- aucune permission, configuration Entra/M365, ressource SharePoint, base de données ou API backend n'a été vérifiée en fonctionnement ;
- aucun schéma SQL ou migration n'a été créé ;
- les documents globaux restent inchangés et conservent les arbitrages signalés ci-dessus ;
- le rapport 10 est conservé comme constat historique, pas réécrit pour refléter les corrections présentes.

## 8. Fichiers concernés

Documents techniques harmonisés :
1. `01_ARCHITECTURE_DETAILLEE.md`
2. `02_DIAGRAMMES_SEQUENCES.md`
3. `03_SPECIFICATIONS_COMPOSANTS.md`
4. `04_MODELE_DONNEES.md`
5. `05_INTEGRATION_MICROSOFT_GRAPH.md`
6. `06_CONTRATS_API.md`
7. `07_ERREURS_REPRISES_IDEMPOTENCE.md`
8. `08_PLAN_TESTS_ET_RECETTE.md`
9. `09_DECISIONS_TECHNIQUES_ET_POINTS_A_CONFIRMER.md`
10. `11_RAPPORT_CORRECTIONS_ET_HARMONISATION.md` (présent rapport)

Historique conservé sans modification : `10_RAPPORT_REVUE_TECHNIQUE.md`.

## 9. Conclusion

Les neuf documents techniques sont harmonisés autour d'une proposition cohérente et directement exploitable pour détailler une implémentation de la brique 01, après validation des points de sécurité, stockage et exploitation listés ci-dessus. Il s'agit toujours d'une **spécification cible**, pas de la preuve que le backend ou la persistance existent, ni d'une autorisation de mise en production.

L'extraction IA, la génération documentaire/SharePoint et l'agent Teams live demeurent des lots distincts. Les sept documents globaux et le rapport 10 sont préservés ; aucune décision métier globale n'a été remplacée sans approbation.
