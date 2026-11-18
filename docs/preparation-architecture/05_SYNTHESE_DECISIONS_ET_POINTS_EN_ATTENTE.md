# 05 - Synthèse des décisions et points en attente

## 1. Objet

Ce registre consolide les décisions déjà prises, les décisions proposées et les points encore à valider avant toute mise en œuvre technique. Il s’appuie sur les quatre livrables précédents et sur les constats de terrain déjà validés par le responsable du projet.

## 2. Règles de lecture

- Toute décision est identifiée par un code unique.
- Le statut est explicite : `confirmé`, `proposé`, `à valider DGF`, `à valider M365`, `bloqué`, `en attente technique`.
- Le responsable de validation est indiqué lorsqu’il est connu.
- Les impacts sont précisés en termes de sécurité, architecture, exploitation ou gouvernance.
- Les points non résolus sont conservés sans pression sur une décision non validée.

## 3. Registre des décisions

| ID | Domaine | Décision | Statut | Responsable de validation | Impact | Observation |
|---|---|---|---|---|---|---|
| DEC-001 | Transcription | Conserver la récupération Microsoft Graph native pour les transcriptions Teams | Confirmé | Responsable projet / DGF | Élevé | Validation terrain déjà confirmée par le responsable du projet |
| DEC-002 | Graph | Conserver le fallback VTT → format non attribué sur `SpeakerAttributionNotAllowed` | Confirmé | Équipe technique / DGF | Élevé | Conforme aux constats de récupération existants |
| DEC-003 | Données | Conserver le parseur VTT historique et ajouter un parser non attribué distinct | Confirmé | Équipe technique | Élevé | Respecte la différence entre attribution et absence d’attribution |
| DEC-004 | Architecture | Conserver React/Vite + backend .NET comme socle de référence | Proposé / à valider | DGF + équipe technique | Élevé | Décision prudente, compatible avec le dépôt |
| DEC-005 | IA | Ne pas sélectionner de fournisseur IA sans validation DGF | Confirmé | DGF / sécurité | Élevé | Gouvernance IA non clôturée |
| DEC-006 | SharePoint | Ne pas supposer l’écriture documentaire sans validation des droits SharePoint | Confirmé | Administrateur M365 / DGF | Élevé | Distinction claire avec permissions transcription |
| DEC-007 | Validation métier | Exiger une validation humaine avant publication d’un compte rendu | Confirmé | DGF / métier | Élevé | Nécessaire à la gouvernance documentaire |
| DEC-008 | Agent Teams | Séparer la récupération post-réunion de la participation live Teams | Confirmé | DGF + M365 + technique | Élevé | Graph post-réunion ≠ architecture de réunion live |
| DEC-009 | Sécurité | Ne pas enregistrer les tokens ni les transcriptions complètes dans les journaux | Confirmé | Sécurité / technique | Élevé | Conformité technique et protection |
| DEC-010 | Données | Isoler les données par tenant et conserver les preuves sources | Confirmé | DGF / technique | Élevé | Exigence de modèle de données |
| DEC-011 | Document | Produire le modèle DGF officiel avant la génération documentaire automatique | À valider DGF | DGF / métier | Élevé | Bloquant pour génération documentaire |
| DEC-012 | Agent Teams | Trois scénarios obligatoires de participation silencieuse à intégrer comme exigences métier | Confirmé | DGF + M365 | Élevé | Scénarios hôte organisateur / invité / instance unique |
| DEC-013 | IA / Rédaction | Introduire un moteur de preuve avec traçabilité avant synthèse documentaire | Proposé | DGF + technique | Élevé | Nécessaire pour éviter les inventions de faits |
| DEC-014 | Publication | Vérifier la publication sur SharePoint et la versioning documentaire | À valider M365 | Administrateur M365 / technique | Élevé | Non couvert par les permissions de transcription |
| DEC-015 | Réception | Ne pas considérer les scripts automatisés comme équivalents aux tests authentifiés | Confirmé | Responsable projet | Moyen | Clarification essentielle de validation terrain |

## 4. Décisions proposées à valider

| ID | Problème / décision | Statut | Responsable | Impact |
|---|---|---|---|---|
| PROP-001 | Choix entre Gemini et Azure OpenAI pour la synthèse et la rédaction | Proposé | DGF / sécurité / architecture | Élevé |
| PROP-002 | Choix du backend de traitements IA et documentaires | Proposé | Technique / architecture | Élevé |
| PROP-003 | Déploiement d’un agent Teams silencieux, si la DGF l’autorise | Proposé | DGF + M365 | Élevé |
| PROP-004 | Définition du workflow DGF de compte rendu (cartouche, sections, validation, publication) | Proposé | DGF / métier | Élevé |
| PROP-005 | Sélection du site SharePoint et de la bibliothèque documentaire de publication | Proposé | Administrateur M365 / DGF | Élevé |

## 5. Décisions à valider par la DGF

| ID | Sujet | Responsable | Risque si non validé |
|---|---|---|---|
| DGF-001 | Modèle officiel du compte rendu DGF | Direction / service métier | document non conforme |
| DGF-002 | Règles de publication sur SharePoint | DGF / administrateur documentaire | mauvaise cible de publication |
| DGF-003 | Politique de confidentialité et conservation | DGF / sécurité | non conformité |
| DGF-004 | Validation humaine du document final | DGF / responsable de séance | publication non contrôlée |
| DGF-005 | Cadrage IA et traitement des transcriptions | DGF / sécurité | risques réglementaires |

## 6. Décisions à valider par l’administrateur Microsoft 365

| ID | Sujet | Responsable | Risque si non validé |
|---|---|---|---|
| M365-001 | Permissions spécifiques SharePoint / Files / Sites | Administrateur M365 | publication impossible |
| M365-002 | Validité tenant des accès d’écriture | Administrateur M365 | erreurs de publication |
| M365-003 | Configurations Teams liées à la participation live | Administrateur M365 | agent non faisable |
| M365-004 | Policies de salle d’attente / refus / approbation de réunion | Administrateur M365 | participation non conforme |
| M365-005 | Vérification de la politique de versioning SharePoint | Administrateur M365 | perte de contrôle documentaire |

## 7. Points à vérifier techniquement

| ID | Point | Impact | Priorité |
|---|---|---|---|
| TECH-001 | Vérification de l’implémentation réelle d’IA dans le dépôt | élevé | P0 |
| TECH-002 | Vérification du contrat SharePoint réel, si présent | élevé | P0 |
| TECH-003 | Vérification des permissions Graph pour l’écriture documentaire | élevé | P0 |
| TECH-004 | Vérification des composants de génération Word/PDF | élevé | P1 |
| TECH-005 | Vérification de la présence de services d’audit et de versioning | élevé | P1 |
| TECH-006 | Vérification de la logique de preuve source et d’historique | élevé | P0 |
| TECH-007 | Vérification de la cohérence des statuts métier | élevé | P0 |
| TECH-008 | Vérification des contraintes de multi-tenancy | élevé | P0 |
| TECH-009 | Vérification de la gestion des doublons de publication | élevé | P1 |
| TECH-010 | Vérification du comportement de l’agent Teams dans les trois scénarios | élevé | P1 |

## 8. Risques bloquants

| ID | Risque | Description | Niveau |
|---|---|---|---|
| RISK-001 | Invention de faits | Le moteur de synthèse peut générer des décisions non étayées | Bloquant |
| RISK-002 | Publication documentaire mal ciblée | Les documents peuvent être mis dans le mauvais site/bibliothèque | Bloquant |
| RISK-003 | Non conformité au modèle DGF | Le document final peut ne pas correspondre au référentiel officiel | Bloquant |
| RISK-004 | Permissions Microsoft incomplètes | L’écriture documentaire ou la participation live est impossible ou non autorisée | Bloquant |
| RISK-005 | Intégration IA non gouvernée | Le fournisseur choisi peut être non conforme au cadre DGF | Bloquant |
| RISK-006 | Agent Teams non conforme | Participation sans respect des règles du tenant ou des participants | Bloquant |
| RISK-007 | Perte de traçabilité | Impossible de retracer les preuves sources, la décision, la validation et la publication | Bloquant |

## 9. Points en attente

- validation du modèle officiel DGF du compte rendu ;
- validation de la cible SharePoint et des permissions d’écriture ;
- validation de l’IA par la gouvernance DGF ;
- validation du périmètre Microsoft 365 pour l’agent Teams silencieux ;
- validation des seuils de recette métier ;
- validation du workflow de publication et de versioning.

## 10. Conclusion

Les décisions les plus critiques sont déjà formulées : la récupération de transcriptionTeams est un socle validé, mais le reste du flux documentaire, IA, publication et agent live exige un cadrage métier et technique avant mise en œuvre. Le dossier de préparation est cohérent sur le point essentiel : on ne mélange pas la preuve de transcription avec la preuve de décision. Cette distinction doit être conservée jusqu’à validation définitive.
