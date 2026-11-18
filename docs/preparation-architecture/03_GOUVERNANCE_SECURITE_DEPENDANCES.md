# 03 - Gouvernance, sécurité et dépendances

## 1. Objet

Ce document précise les choix de gouvernance, les dépendances techniques et les sécurités à maîtriser avant toute mise en production de la chaîne DGF : récupération de transcriptes, extraction, génération documentaire, publication SharePoint et potentiel agent Teams silencieux.

Il s’appuie sur les éléments réellement présents dans le dépôt, sans supposer qu’une documentation d’architecture équivaut à un système opérationnel.

## 2. Gouvernance IA

### 2.1. Contexte

Le dépôt contient des traces d’idée d’utilisation d’IA (notamment `@google/genai` et références documentaires à Azure OpenAI / Copilot), mais aucune implémentation exploitable d’IA documentaire n’est observée comme un composant fonctionnel final.

La décision de fournisseur IA doit donc être traitée comme une décision de gouvernance DGF, et non comme un simple choix technique de code.

### 2.2. Comparatif des fournisseurs envisagés

| Critère | Gemini | Azure OpenAI | Observation |
|---|---|---|---|
| Confidentialité | Variable selon configuration et contrat | Très forte, plus alignée sur le modèle Microsoft 365 / DGF | La conformité doit être validée par la DGF |
| Localisation / traitement | À vérifier selon contrat et zone de service | Plus clair dans le contexte Azure/Microsoft | Dépend du modèle de service retenu |
| Conservation des données | À définir par contrat | Plus maîtrisable avec Azure | À valider par gouvernance |
| Conditions contractuelles | À vérifier | Souvent plus lisible dans l’écosystème Microsoft | Nécessite revue juridique et sécurité |
| Sécurité | Bonne si configuration conforme | Très bonne, gestion centralisée | À valider selon architecture DGF |
| Coût | Souvent compétitif | Potentiellement plus élevé, plus structuré | À comparer au périmètre de production |
| Qualité | Variable selon modèle et usage | Très bonne sur modèles de synthèse et de rédaction | À tester sur corpus DGF |
| Latence | Bon | Très bon | À tester par usage réel |
| Traçabilité | À sécuriser côté app | Meilleur niveau en architecture Azure | Nécessite journalisation métier |

### 2.3. Recommandation de gouvernance

Le choix entre Gemini et Azure OpenAI ne doit pas être fait sans validation de la gouvernance DGF. La recommandation prudente est la suivante :

- ne pas considérer un fournisseur comme acceptable par défaut ;
- exiger un cadrage juridique et technique sur :
  - conservation des données,
  - localisation du traitement,
  - droits de rétention,
  - niveau d’accès aux transcriptions,
  - mode d’anonymisation des données sensibles,
  - traçabilité à chaque étape.

### 2.4. Conditions à satisfaire avant sélection

- contrat de traitement conforme aux exigences DGF ;
- limite explicite de la conservation ;
- traçabilité des appels et des sorties ;
- blocage des entrées non autorisées ;
- séparation claire sur les données de la réunion ;
- mécanisme de suppression et de purge ;
- preuves que les contenus sensibles ne sont pas réutilisés sans autorisation.

## 3. Microsoft Graph

### 3.1. Permissions déjà validées dans le dépôt

Le dépôt documente explicitement et met en œuvre la logique suivante :

| Permission | Usage réel | Statut |
|---|---|---|
| `User.Read` | Profil utilisateur, identité | Déjà attendue |
| `Calendars.Read` | Lecture du calendrier Outlook | Déjà attendue |
| `OnlineMeetings.Read` | Récupération des réunions en ligne | Déjà attendue |
| `OnlineMeetingTranscript.Read.All` | Lecture de transcriptions Teams | Déjà attendue / valide pour la récupération |

Le dossier montre que l’architecture a bien identifié le besoin de consentement administrateur sur la permission `OnlineMeetingTranscript.Read.All`.

### 3.2. Permissions à étudier et à valider

| Catégorie | Permission possible | Usage attendu | Remarque |
|---|---|---|---|
| Déléguée | `Files.ReadWrite.All` | Publication / gestion de fichiers SharePoint | Distincte de transcription |
| Déléguée | `Sites.ReadWrite.All` | Accès documentaire et bibliothèque SharePoint | Nécessite revue du tenant |
| Déléguée | `Drive.ReadWrite.All` | Dépôt document dans SharePoint / OneDrive | À valider |
| Applicative | `Sites.ReadWrite.All` | publication documentaire automatisée | Nécessite app registration et posture admin |
| Applicative | `Files.ReadWrite.All` | écriture documentaire | À vérifier selon contexte |
| Applicative | `Group.ReadWrite.All` | si besoin de groupes / sites | Non requis sans besoin métier |

### 3.3. Consentement administrateur

La logique présente dans `graphClient.ts` montre une bonne distinction entre :

- autorisation absente ;
- consentement administrateur requis ;
- interaction utilisateur nécessaire ;
- erreur Graph / Entra ID.

Cela est correct pour la récupération de transcription, mais ne garantit pas l’écriture documentaire dans SharePoint ou le dépôt de fichiers dans des bibliothèques administratives.

### 3.4. Conditions d’accès effectif

L’accès ne doit pas être supposé effectif simplement parce qu’une permission de transcription est connue :

- le tenant peut encore désactiver l’accès aux transcriptions ;
- le locataire peut restreindre la session de l’utilisateur ;
- les droits SharePoint sont distincts des droits de transcription ;
- les permissions applicatives ne sont pas équivalentes aux permissions déléguées.

## 4. SharePoint

### 4.1. Permissions et mécanismes nécessaires

Pour publier un document Word / PDF sur SharePoint Online, il faut un mécanisme explicite pour :

- identifier le site cible ;
- identifier la bibliothèque documentaire ;
- créer ou trouver le dossier de destination ;
- vérifier les droits de fichier ;
- publier en version ou en remplacement ;
- gérer les doublons ;
- conserver les références de publication.

### 4.2. Informations encore inconnues

Le dépôt ne permet pas de conclure sur les éléments suivants sans validation tenant :

- site SharePoint de destination exact ;
- bibliothèque documentaire cible ;
- dossier de publication (si l’architecture impose un dossier métier) ;
- identité utilisée pour la publication (utilisateur ou application) ;
- droits effectifs et niveau d’accès ;
- politique de versioning du site ;
- règle de duplication et de remplacement.

### 4.3. Recommandation de conception

Le système doit définir un contrat de publication très strict :

- `site_id`, `drive_id`, `folder_path`, `file_id`, `web_url` ;
- vérification de la publication réelle ;
- objet `SharePointPublication` avec statut explicite ;
- journal des erreurs et des identités de publication ;
- blocage de publication si validation humaine absente.

## 5. Sécurité

### 5.1. Authentification

- Authentification MSAL pour l’utilisateur final ;
- session Entra ID avec scopes minimaux ;
- distinction claire entre authentification de consultation et publication documentaire ;
- aucun secret de production dans le dépôt.

### 5.2. Autorisation

- autorisation tenant par tenant ;
- autorisation de réunion par utilisateur / rôle ;
- validation du rôle de l’utilisateur `organizer`, `coorganizer`, `attendee`, `undetermined` ;
- règles de partage de documents à respecter.

### 5.3. Isolation des tenants

Tout objet métier doit contenir ou référencer le `tenant_id`.

À mettre en place :

- filtres système sur chaque requête ;
- politique de séparation des données de réunion ;
- accès multi-tenant strictement contrôlé ;
- journal d’audit sur toutes les mutations.

### 5.4. Secrets

- jamais stocker le jeton d’accès dans le code ;
- jamais afficher les tokens dans les journaux ;
- masquer les URLs et adresses électroniques dans les diagnostics ;
- sécuriser les variables d’environnement et les secrets d’Azure / Entra ID.

### 5.5. Transcriptions

- conserver uniquement les données nécessaires ;
- éviter le stockage brut des transcriptions complètes dans les logs techniques ;
- stocker les preuves sources de manière sécurisée ;
- garantir la possibilité de recouper un passage à son horodatage original.

### 5.6. Documents

- toujours relié à une version document ;
- hash SHA-256 recommandé pour contrôle de non-altération ;
- stockage de la référence de publication sur SharePoint ;
- conservation des versions ;
- séparation entre version brouillon et version finale.

### 5.7. Journaux

- journaliser les opérations de lecture, validation, publication, refus ;
- conserver `request_id`, `tenant_id`, `user_id`, `entity_type`, `entity_id` ;
- ne pas logguer les tokens ni transcriptions complètes ;
- conserver en clair uniquement des éléments non sensibles ou destinés à l’audit.

### 5.8. Conservation et suppression

- définir la durée de conservation ;
- définir la purge conforme aux règles DGF ;
- définir le mécanisme de suppression sécurisée et de journal d’effacement ;
- les copies locales temporaires doivent être supprimées.

### 5.9. Sauvegarde et reprise

- sauvegarde des données de base ;
- réversibilité des versions documentaires ;
- reprise après erreur de publication ;
- mécanisme de reprise sur les jobs asynchrones.

## 6. Agent Teams silencieux

### 6.1. Position de l’exigence métier

L’application ne doit pas se limiter à la lecture post-réunion. Trois scénarios sont impératifs :

1. L’hôte est organisateur : l’agent rejoint automatiquement lorsque son hôte rejoint la réunion.
2. L’hôte est invité : l’agent attend que son hôte le sollicite.
3. L’organisateur a déjà appelé une instance ReadMeeting.ai : aucune seconde instance ne doit être lancée et l’hôte doit être informé.

### 6.2. Analyse des options Microsoft

| Option | Description | Faisabilité | Remarques |
|---|---|---|---|
| Graph post-meeting | Récupération des transcriptions après la réunion | Oui | Conforme au dépôt existant |
| Bot Teams | Application bot participative | Possible mais distincte | Nécessite architecture, hébergement, politique tenant |
| App de réunion / meeting app | Participation de l’agent à la réunion | Oui en théorie | Soumis aux permissions et politiques Teams |
| Microsoft Calling / media | Capture audio ou join direct | Possible mais complexe | De nombreuses contraintes techniques |

### 6.3. Contraintes techniques

- Les APIs de transcription par Graph ne suffisent pas à rejoindre une réunion en direct.
- La participation réelle demande une architecture différente du simple téléchargement de transcriptions.
- L’agent doit rester transparent, non intrusif, sans parler ni envoyer de message dans la conversation.
- Les salles d’attente, refus d’accès et politiques de tenant doivent être respectées.
- L’hôte est responsable de l’autorisation de présence.

### 6.4. Exigences de transparence

- l’agent doit être identifiable ;
- il ne doit pas se masquer ou contourner les contrôles ;
- il doit respecter les règles d’usage de Teams ;
- il ne doit pas déployer de comportement caché.

### 6.5. Matrice des décisions à prendre

| Sujet | DGF | Administrateur Microsoft 365 | Équipe technique |
|---|---|---|---|
| Validation du besoin fonctionnel | Oui | Non | Non |
| Validation du périmètre de tenant | Oui | Oui | Conseil |
| Consentements / autorisations | Non | Oui | Conception technique |
| Hébergement du service | Non | Non | Oui |
| Politique d’agent silencieux | Oui | Oui | Conception |
| Exposition et conformité | Oui | Oui | Oui |
| Sélection d’architecture Teams | Consultation | Validation | Réalisation |

### 6.6. Recommandation de conception

Le projet ne doit pas prétendre à la participation silencieuse réelle sans validation tenant et sans architecture dédiée. Il faut séparer clairement :

- récupération de transcription post-réunion (existante, validée) ;
- participation en direct à une réunion Teams (architecture prospective, non validée).

## 7. Réglementation et traitement des données

La configuration de la DGF doit être documentée autour de :

- finalité du traitement ;
- catégories de données ;
- durée de conservation ;
- droits d’accès ;
- sauvegarde et restauration ;
- traçabilité ;
- contrôles de conformité.

## 8. Conclusion

Le dépôt est prêt sur les principes de récupération de transcription Graph et sur les mécanismes de diagnostic et de traçabilité. Le point critique n’est pas la transcription elle-même, mais l’écosystème qui vient ensuite : extraction, IA, gouvernance, validation humaine, publication documentaire et agent Teams.

Aucune décision définitive sur le fournisseur IA, le partage SharePoint ni l’agent Teams ne doit être prise sans validation de la DGF et des administrateurs Microsoft 365.
