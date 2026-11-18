# 04 - Plan d’implémentation et de recette

## 1. Objet

Ce plan décrit la mise en œuvre progressive du flux DGF à partir de la récupération validée des transcriptions Microsoft Teams. Il s’appuie sur le dépôt actuel, ses composants existants et les exigences métier définies dans les livrables précédents.

Le plan est volontairement séquentiel, avec distinction entre travaux bloquants et travaux parallélisables. Il ne prescrit aucune refonte générale du dépôt, ni une modification des permissions ou du code existant sans validation technique et métier.

## 2. Hypothèses de départ

- La récupération réelle de transcriptions Graph est validée sur le terrain pour les scénarios A et B par le responsable du projet.
- Les scripts automatiques dans le dépôt sont utiles pour la validation technique, mais ne remplacent pas cette validation terrain.
- Le flux de transcription est le socle opérationnel à préserver.
- Les éléments IA, rédaction et publication documentaire restent à construire dans un cadre contrôlé de preuve, traçabilité et validation humaine.

## 3. Phase 0 — Assainissement et préparation technique

### 3.1. Objectif

Préparer le socle technique et les règles de gouvernance avant la mise en œuvre des composants métier avancés.

### 3.2. Prérequis

- validation du périmètre DGF ;
- confirmation de la politique de confidentialité ;
- validation des autorisations Graph et SharePoint ;
- définition des équipes de responsabilité ;
- identification des locataires, sites et bibliothèques cibles.

### 3.3. Tâches techniques

- cartographier les composants du dépôt existant ;
- identifier les responsabilités fonctionnelles ;
- définir le périmètre de stockage des transcriptions et des documents ;
- définir les règles de journalisation sans exposer les tokens ni les contenus sensibles ;
- documenter les niveaux de validation de la DGF ;
- établir la liste des dépendances à valider (IA, SharePoint, Teams, Graph).

### 3.4. Fichiers existants concernés

- `src/services/graphClient.ts`
- `src/services/transcriptService.ts`
- `src/types/transcript.ts`
- `docs/architecture.md`
- `infra/main.bicep`

### 3.5. Nouveaux fichiers à créer

- `src/domain/tenant/tenant.model.ts` ou équivalent backend
- `src/services/auditLogService.ts`
- `src/config/securityPolicies.ts`
- `docs/preparation-architecture/` (livrables de préparation)

### 3.6. Dépendances

- validation des autorités et permissions ;
- validation de la gouvernance DGF ;
- validation du besoin documentaire final.

### 3.7. Livrables

- périmètre technique validé ;
- matrice de responsabilités ;
- règles de journalisation ;
- liste des dépendances et d’évaluation de risque.

### 3.8. Tests

- tests de conformité des règles de sécurité ;
- validation de la non exposition des jetons ;
- validation de la non exposition des contenus transcrits dans les journaux.

### 3.9. Critères d’acceptation

- aucune donnée sensible dans les journaux techniques ;
- la politique tenant est documentée ;
- les frontières de responsabilité sont claires ;
- les rôles de validation sont identifiés.

### 3.10. Risques

- configuration Graph ou SharePoint non conforme ;
- divergence entre documentation et réalité tenant ;
- risques de fuite de données dans les journaux.

### 3.11. Conditions de passage

- validation de la gouvernance DGF ;
- validation des accès Graph et SharePoint ;
- accord sur le confinement des données.

### 3.12. Travaux bloquants / parallélisables

Bloquants :

- validation tenant et sécurité ;
- clarification du périmètre documentaire.

Parallélisables :

- préparation des rapports de gouvernance ;
- rédaction des règles de journalisation.

## 4. Phase 1 — Modèle de données et persistance

### 4.1. Objectif

Réaliser le socle de persistance unifié pour les réunions, transcriptions, faits, décisions, actions, validations et publications.

### 4.2. Prérequis

- modèle de données validé par le métier DGF ;
- définition des statuts et des règles d’intégrité ;
- sélection du moteur de persistance (base relationnelle compatible avec l’architecture existante).

### 4.3. Tâches techniques

- créer les entités métier et les relations ;
- mettre en place les clés de tenant ;
- définir les index obligatoires ;
- intégrer le stockage des preuves sources ;
- préparer les contraintes de non-invention de faits ;
- mettre en place les journaux d’audit et de publication.

### 4.4. Fichiers existants concernés

- `backend/src/ReadMeeting.Domain/Entities/Meeting.cs`
- `backend/src/ReadMeeting.Domain/Entities/MeetingReport.cs`
- `backend/src/ReadMeeting.Domain/Entities/ActionItem.cs`
- `src/types/transcript.ts`

### 4.5. Nouveaux fichiers à créer

- `backend/src/ReadMeeting.Domain/Entities/Tenant.cs`
- `backend/src/ReadMeeting.Domain/Entities/Transcript.cs`
- `backend/src/ReadMeeting.Domain/Entities/SourceEvidence.cs`
- `backend/src/ReadMeeting.Domain/Entities/Decision.cs`
- `backend/src/ReadMeeting.Domain/Entities/ActionItem.cs` (si structure complémentaire)
- `backend/src/ReadMeeting.Domain/Entities/HumanValidation.cs`
- `backend/src/ReadMeeting.Domain/Entities/AuditLog.cs`

### 4.6. Dépendances

- modèle métier validé ;
- règles de sécurité et d’isolation des tenants ;
- architecture du backend.

### 4.7. Livrables

- schéma relationnel complet ;
- entités métier documentées ;
- contraintes d’intégrité ;
- index de performance ;
- règles de traçabilité.

### 4.8. Tests

- tests de cohérence et d’intégrité ;
- tests de tenant isolation ;
- tests sur les nuls et les valeurs absentes ;
- tests de collision / doublons.

### 4.9. Critères d’acceptation

- toute décision/action a une preuve source ;
- le système autorise `NULL` pour responsable ou échéance non renseignés ;
- les données sont isolées par tenant ;
- les événements sont traçables.

### 4.10. Risques

- sur-modélisation inutile ;
- manque de preuve source ;
- difficulté d’isolation multi-tenant.

### 4.11. Conditions de passage

- validation des entités par le métier ;
- validation des statuts et des contraintes d’intégrité ;
- validation de la politique d’audit.

### 4.12. Travaux bloquants / parallélisables

Bloquants :

- définition du modèle de données ;
- validation des statuts métier.

Parallélisables :

- conception des index ;
- conception des règles de journalisation.

## 5. Phase 2 — Compréhension, extraction et vérification IA

### 5.1. Objectif

Passer de la transcription brute à un ensemble d’éléments structurés cohérents : faits, sujets, décisions, propositions, risques, réserves, désaccords, points non-tranchés.

### 5.2. Prérequis

- transcriptions Graph fonctionnelles ;
- modèle de données validé ;
- source-evidenceовая structure définie ;
- règles métier de preuve et de source.

### 5.3. Tâches techniques

- exploiter le parsing existant pour VTT et format non attribué ;
- identifier les sources de preuve par horodatage ;
- classifier les segments par sujet ;
- extraire les propositions, réserves et désaccords ;
- distinguer `proposed`, `confirmed`, `decided`, `rejected`, `reported`, `to_confirm` ;
- introduire un niveau d’incertitude et de contradiction ;
- refuser le fait inventé ou la décision non source.

### 5.4. Fichiers existants concernés

- `src/services/transcriptService.ts`
- `src/types/transcript.ts`
- `src/components/TranscriptViewerModal.tsx`

### 5.5. Nouveaux fichiers à créer

- `src/services/extractionService.ts`
- `src/services/evidenceLinkService.ts`
- `src/services/decisionValidationService.ts`
- `src/services/factClassifier.ts`

### 5.6. Dépendances

- persistance valide ;
- service de preuve source ;
- service IA ou moteur de classification sélectionné.

### 5.7. Livrables

- résultats structurés de réunion ;
- faits, décisions et actions identifiés ;
- journaux de provenance ;
- règles de non-invention de faits.

### 5.8. Tests

- décisions non confirmées ;
- propositions non décidées ;
- négations et réserves ;
- contradictions ;
- responsables inconnus ;
- échéances absentes ;
- transcriptions sans attribution.

### 5.9. Critères d’acceptation

- tout élément métier est rattaché à au moins une preuve ;
- aucune décision ne peut apparaître sans support ;
- les éléments incertains restent explicitement marqués ;
- les transcriptions non attribuées ne créent pas de faux intervenants.

### 5.10. Risques

- sur-interprétation de la transcription ;
- mauvaise différenciation entre information évoquée et validée ;
- confusion autour des réserves.

### 5.11. Conditions de passage

- validation des règles de preuve ;
- validation métier des statuts ;
- validation par échantillons de réunions réelles.

### 5.12. Travaux bloquants / parallélisables

Bloquants :

- validation de la chaîne de preuve ;
- définition des statuts.

Parallélisables :

- classification des sujets ;
- préparation des critères d’extraction.

## 6. Phase 3 — Rédaction institutionnelle et génération DOCX

### 6.1. Objectif

Transformer les éléments validés en compte rendu de niveau institutionnel DGF, puis en document Word.

### 6.2. Prérequis

- modèle de données validé ;
- preuve source et décisions validées ;
- modèle de document DGF à feuille de route ;
- validation des contraintes de mise en page.

### 6.3. Tâches techniques

- définir le modèle DGF de synthèse et de comptes rendus ;
- produire une structure de document en sections ;
- gérer le cartouche, les en-têtes, les tableaux et la pagination ;
- générer un document Word *.docx ;
- générer une version PDF si nécessaire ;
- enregistrer la version et ses métadonnées.

### 6.4. Fichiers existants concernés

- `backend/src/ReadMeeting.Domain/Entities/MeetingReport.cs`
- `src/components/ReportsLibraryView.tsx`
- `docs/architecture.md`

### 6.5. Nouveaux fichiers à créer

- `src/services/documentDraftService.ts`
- `src/services/docxGenerationService.ts`
- `src/services/pdfGenerationService.ts`
- `src/templates/dgf/meeting-report-template.json`
- `src/templates/dgf/meeting-report.docx` ou équivalent généré

### 6.6. Dépendances

- moteur de décision validé ;
- validation humaine prévue ;
- modèle DOCX/DGF validé par la DGF.

### 6.7. Livrables

- document Word DGF de référence ;
- document PDF si validé ;
- historique de versions ;
- règles de mise en page et de conformité.

### 6.8. Tests

- documents multipages ;
- tableaux et sections ;
- validation du cartouche ;
- vérification du contenu final ;
- régression sur la génération.

### 6.9. Critères d’acceptation

- le document est cohérent avec les données validées ;
- aucune information non prouvée n’apparaît ;
- le document contient le bon niveau de structure institutionnelle ;
- l’export est reproductible.

### 6.10. Risques

- modèle DGF non valide ;
- génération automatique non conforme ;
- erreurs de pagination, de tri et de cartouche.

### 6.11. Conditions de passage

- validation du modèle DGF ;
- validation fonctionnelle du document généré ;
- remontée métier sur la qualité du rendu.

### 6.12. Travaux bloquants / parallélisables

Bloquants :

- modèle documentaire DGF ;
- validation métier.

Parallélisables :

- génération des layouts ;
- préparation des styles de document.

## 7. Phase 4 — Validation humaine et SharePoint

### 7.1. Objectif

Mettre en place le mécanisme de validation humaine et le dépôt documentaire sur SharePoint avec traçabilité.

### 7.2. Prérequis

- document DGF généré ;
- modèle de validation défini ;
- autorisations SharePoint validées ;
- politique de publication explicitée.

### 7.3. Tâches techniques

- mettre en place `HumanValidation` ;
- gérer les demandes de modification ;
- vérifier la publication réelle dans SharePoint ;
- gérer les doublons ;
- conserver les références de publication ;
- connecter la publication à `DocumentVersion`.

### 7.4. Fichiers existants concernés

- `backend/src/ReadMeeting.Application/Interfaces/IMicrosoftGraphService.cs`
- `backend/src/ReadMeeting.Domain/Entities/MeetingReport.cs`
- `src/components/ReportsLibraryView.tsx`

### 7.5. Nouveaux fichiers à créer

- `src/services/sharePointPublicationService.ts`
- `src/services/humanValidationService.ts`
- `src/services/documentVersioningService.ts`
- `src/services/publicationAuditService.ts`

### 7.6. Dépendances

- validation métier du document ;
- droits Graph / SharePoint ;
- politiques de publication.

### 7.7. Livrables

- workflow de validation humaine ;
- publication SharePoint ;
- historique de versions ;
- journal d’audit de publication.

### 7.8. Tests

- approbation humaine ;
- modification après approbation ;
- publication SharePoint ;
- doublons ;
- erreurs et reprises ;
- publication refusée.

### 7.9. Critères d’acceptation

- un document ne peut être publié sans validation humaine ;
- chaque publication est référencée ;
- les doublons sont signalés et non écrasés ;
- le système enregistre les états publiés et rejetés.

### 7.10. Risques

- mauvaise identité de publication ;
- publication dans la mauvaise bibliothèque ;
- versioning incohérent.

### 7.11. Conditions de passage

- validation de l’interface de publication ;
- validation métier de la validation humaine ;
- validation de l’intégrité SharePoint.

### 7.12. Travaux bloquants / parallélisables

Bloquants :

- droits SharePoint ;
- validation documentaire ;
- mécanisme de versioning.

Parallélisables :

- flows de validation ;
- audit de publication.

## 8. Phase 5 — Faisabilité et prototype de l’agent Teams

### 8.1. Objectif

Évaluer la faisabilité de la présence silencieuse de l’agent pendant une réunion Teams, sans hypothèse irréaliste sur les capacités Graph.

### 8.2. Prérequis

- validation du besoin métier ;
- validation Microsoft / tenant ;
- allocation des responsabilités d’administration ;
- architecture de solution définie.

### 8.3. Tâches techniques

- documenter les scénarios hôte organisateur / invité / instance déjà active ;
- identifier les contraintes Microsoft et les permissions nécessaires ;
- distinguer l’API de transcription post-réunion de la participation en direct ;
- tester la faisabilité solution par solution ;
- définir les états de présence de l’agent ;
- définir les mécanismes de reprise et de duplication.

### 8.4. Fichiers existants concernés

- `docs/architecture.md`
- `src/services/graphClient.ts`
- `src/services/transcriptService.ts`

### 8.5. Nouveaux fichiers à créer

- `src/services/teamsAgentOrchestrator.ts`
- `src/services/meetingPresenceRegistry.ts`
- `src/services/meetingLifecycleMonitor.ts`
- `docs/architecture/teams-agent-architecture.md`

### 8.6. Dépendances

- validation des administrateurs Microsoft 365 ;
- politique de sécurité Teams ;
- architecture de hébergement de l’agent.

### 8.7. Livrables

- architecture cible de l’agent silencieux ;
- scénario de participation ;
- limites et dépendances d’administrateur ;
- solution de reprise et de présence unique.

### 8.8. Tests

- scénario de présence automatique ;
- scénario d’attente de l’hôte invité ;
- scénario de double instance refusée ;
- reprise après coupure réseau ;
- refus d’accès / salle d’attente.

### 8.9. Critères d’acceptation

- une seule instance active par réunion ;
- l’agent ne perturbe pas la réunion ;
- présence transparente et identifiable ;
- aucune interception non autorisée.

### 8.10. Risques

- architecture Teams non compatible ;
- politiques du tenant non compatibles ;
- sur-estimation des capacités de Graph.

### 8.11. Conditions de passage

- validation technique de la solution Microsoft ;
- validation de sécurité et de conformité ;
- validation métier du comportement non interactif.

### 8.12. Travaux bloquants / parallélisables

Bloquants :

- validation tenant et architecture Teams ;
- politique de présence silencieuse.

Parallélisables :

- scénarios de reprise ;
- stockage du registre de présence.

## 9. Phase 6 — Sécurité, recette et préparation à la production

### 9.1. Objectif

Valider le système dans son ensemble avant toute mise à disposition production.

### 9.2. Prérequis

- toutes les phases précédentes validées ;
- gouvernance IA et sécurité référencées ;
- validation de SharePoint et de l’agent Teams selon périmètre.

### 9.3. Tâches techniques

- exécuter la recette fonctionnelle ;
- tester l’isolation tenant ;
- tester la traçabilité ;
- vérifier les logs et sécurité ;
- réaliser la recette de validation humaine ;
- sécuriser les accès ;
- préparer les procédures de support et d’exploitation.

### 9.4. Fichiers existants concernés

- `src/services/graphClient.ts`
- `src/services/transcriptService.ts`
- `src/types/transcript.ts`
- `backend/src/ReadMeeting.Domain/Entities/*.cs`

### 9.5. Nouveaux fichiers à créer

- `tests/acceptance/meeting-report-acceptance.spec.ts`
- `tests/security/tenant-isolation.spec.ts`
- `tests/graph/transcript-fallback.spec.ts`
- `tests/document/document-generation.spec.ts`
- `docs/operations/runbook.md`

### 9.6. Dépendances

- validation technique et fonctionnelle ;
- acceptation de la DGF ;
- validation de sécurité.

### 9.7. Livrables

- recette fonctionnelle ;
- seuils d’acceptation documentés ;
- procédures de support ;
- plan de sortie de production ;
- checklist de sécurité de mise en service.

### 9.8. Tests

- décisions non confirmées ;
- propositions / négations / réserves ;
- responsables inconnus ;
- échéances inconnues ;
- contradictions ;
- transcriptions sans attribution ;
- documents multipages ;
- approbation humaine ;
- publication SharePoint ;
- doublons ;
- erreurs et reprises ;
- isolation des données.

### 9.9. Critères d’acceptation

- 100 % des décisions du document sont à l’origine d’une preuve ;
- 100 % des actions ont un responsable explicite ou sont explicitement non renseignées ;
- aucune donnée de tenant n’est visible en dehors du périmètre ;
- les journaux ne contiennent pas de jetons ni de transcriptions complètes ;
- la publication SharePoint est vérifiée par l’URL de document et le `file_id` ;
- la validation humaine est toujours réalisée avant publication.

### 9.10. Risques

- fuite de données ;
- mauvais niveau de preuve ;
- publication documentaire incorrecte ;
- échec de workflow de validation ;
- non conformité tenant.

### 9.11. Conditions de passage à la production

- validation de sécurité ;
- validation métier du document ;
- validation de publication documentaire ;
- validation des droits Microsoft et du tenant ;
- validation de la traçabilité.

## 10. Stratégie de recette

### 10.1. Indicateurs mesurables

- taux de décisions non sourcées ;
- taux de propositions transformées en décisions sans preuve ;
- nombre de réserves ou de négations non couvertes ;
- taux de documents publiés sans approbation ;
- taux de doublons de publication ;
- taux d’erreurs Graph et SharePoint ;
- temps de récupération de transcriptes ;
- temps de génération du document ;
- taux de validation humaine par document ;
- nombre d’événements journalisés sans sensibilité.

### 10.2. Seuils d’acceptation à valider par le métier

À confirmer par le métier DGF, mais les seuils recommandés sont :

- 0 décision non prouvée ;
- 0 action sans preuve ou responsable explicite ;
- 0 publication sans validation humaine ;
- 0 fuite de jetons dans les journaux ;
- 0 document publié en doublon sans signalement ;
- 100 % des décisions/actes doivent avoir une preuve source par horodatage ;
- 100 % des documents publiés doivent être persistés dans la version finale et référencés.

## 11. Conclusion

Le plan proposé est aligné avec le niveau réel de maturité du dépôt : la récupération de transcriptions Microsoft Teams est la base d’exploitation validée ; le reste doit être construit de manière solide, avec preuves, validation humaine, sécurité et traçabilité. Il évite la sur-confiance et répond à la nécessité de produire des comptes rendus institutionnels fiables, exploitable par la DGF et compatibles avec les contraintes Microsoft et documentaires du cas d’usage.
