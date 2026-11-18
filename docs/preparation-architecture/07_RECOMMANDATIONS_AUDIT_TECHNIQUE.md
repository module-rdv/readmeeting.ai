# 07 - Recommandations d’audit technique

## 1. Objet

Ce document recense les composants du dépôt qui doivent être vérifiés avant toute implémentation. Il distingue les éléments déjà observés, les éléments partiellement observés et les éléments restants à examiner, avec priorité, risque et recommandation.

## 2. Méthode de vérification

Les éléments sont classés selon :

- chemin réel ;
- état observé ;
- état attendu ;
- écart ;
- risque ;
- recommandation ;
- priorité.

## 3. Tableau de recommandations

| Composant | Chemin réel | État observé | État attendu | Écart | Risque | Recommandation | Priorité |
|---|---|---|---|---|---|---|---|
| Transcription Graph | `src/services/graphClient.ts` | oui, présent et documenté | validation fonctionnelle tenant réelle et réplication conforme | faible à modéré | arrêt de récupération si permissions tenant non alignées | conserver, tester et documenter la politique tenant | P0 |
| Parsing de transcriptes | `src/services/transcriptService.ts` | oui, présent | finaliser le flux de preuve source et de chauffage de parité des formats | modéré | mauvaise interprétation des contenus non attribués | conserver la séparation VTT / non attribué | P0 |
| Types de transcriptes | `src/types/transcript.ts` | oui, présent | compléter les règles de source preuve et de session | modéré | doute sur provenance et statut | ajouter contraintes de preuve et de traçabilité | P0 |
| Backend métier | `backend/src/ReadMeeting.Domain` | présent | vérifier les entités et les relations à l’échelle de la base | modéré | modélisation ambiguë | valider schéma relationnel avant implémentation | P0 |
| Contrat Graph / SharePoint | `backend/src/ReadMeeting.Application/Interfaces/IMicrosoftGraphService.cs` | contrat présent | vérifier l’implémentation exacte d’écriture SharePoint | élevé | publication impossible / mauvaise cible | valider les permissions et l’implémentation | P0 |
| Document DGF | `backend/src/ReadMeeting.Domain/Entities/MeetingReport.cs` | modèle présent | valider le modèle officiel DGF avant génération | élevé | document non conforme | demander le référentiel officiel | P0 |
| Génération Word / PDF | absent dans le dépôt | non observé | vérifier ou créer le service de génération | élevé | document final non produisible | établir le flux de génération avant intégration | P1 |
| IA documentaire | références dans `README.md` et `package.json` | dépendance présente, service non observé | vérifier usage réel avant activation | élevé | fournisseur non gouverné | valider le fournisseur et le cadre juridique | P0 |
| SharePoint publication | non observé dans le code | service absent | valider le site, dossier, droits et versioning | élevé | publication mauvaise ou impossible | préparer la publication avec contrat strict | P0 |
| Journaux et audit | `AuditLog` dans le modèle métier | conceptuel, non garanti dans le code | vérifier la mise en œuvre réelle | élevé | traçabilité insuffisante | créer le service d’audit conforme | P0 |
| Agent Teams live | absent dans le dépôt | non observé | validation de faisabilité avec M365 avant tout développement | élevé | architecture non conforme ou hors périmètre | séparer la logique live de la transcription | P0 |
| CI/CD | `.github/workflows/ci.yml` | présent | vérifier qu’il couvre la chaîne documentaire cible | modéré | recette insuffisante | étendre les checks selon le plan | P1 |
| Infrastructure Azure | `infra/main.bicep` | présent | vérifier la compatibilité avec les services documentaires et IA | modéré | sous-dimensionnement / mauvaise cible de service | aligner l’infra sur le plan | P1 |

## 4. Vérifications déjà effectuées

Les éléments suivants ont été vérifiés dans le cadre de cette mission documentaire :

- existence de la logique Graph et de la capture de transcriptions ;
- existence du modèle de données métier ;
- existence de la documentation d’architecture cible ;
- distinction entre les transcriptions VTT, non attribuées et la gouvernance de preuve ;
- distinction entre récupération post-réunion et agent live Teams ;
- présence d’un cadre de gouvernance IA prudente ;
- présence de l’exigence de validation humaine ;
- présence des trois scénarios obligatoires de l’agent Teams.

## 5. Vérifications restant à faire avant implémentation

- validation effective du référentiel DGF du compte rendu ;
- validation des permissions SharePoint d’écriture et du site cible ;
- validation du mécanisme réel de versioning SharePoint ;
- validation de la solution IA, fournisseur, confidentialité et traitement ;
- vérification du backend complet pour les entités, relations et intégrité ;
- vérification du processus de publication, approbation et non-réécriture ;
- vérification de la faisabilité technique de l’agent Teams silencieux ;
- validation de l’administration M365 et des politiques de réunion ;
- validation des seuils de recette métier ;
- vérification des procédures de journalisation et de suppression des données sensibles.

## 6. Recommandations par priorité

### P0 – indispensable avant implémentation

- valider le modèle officiel DGF ;
- valider les permissions et la cible SharePoint ;
- vérifier le contrat Graph/SharePoint réel ;
- vérifier les règles de preuve source et de validation humaine ;
- vérifier la faisabilité de l’agent Teams ;
- vérifier la gouvernance IA et la conformité DGF.

### P1 – indispensable à la valeur métier

- mettre en place le moteur de synthèse et d’extraction ;
- préparer la génération Word / PDF ;
- valider le workflow de document final ;
- intégrer la versioning et l’audit documentaire ;
- finaliser les tests de recette métier.

### P2 – amélioration technique

- ajuster les infrastructures Azure si nécessaire ;
- étendre le CI/CD ;
- améliorer les règles de support et de reprise.

## 7. Conclusion

La vérification technique ne montre pas un dépôt prêt pour une mise en œuvre complète de la génération documentaire DGF. Elle montre un socle solide sur les transcriptions et une architecture de préparation cohérente, mais encore incomplet sur les éléments de gouvernance, de publication et de participation live Microsoft. L’important est de ne pas confondre le niveau de préparation documentaire avec un niveau d’implémentation fonctionnelle validé.
