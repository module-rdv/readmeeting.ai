# 03 — Spécifications des composants du moteur Meeting & Transcript Processing

## 1. But du document

Ce document décrit les composants du moteur cible, en les classant selon leur état réellement constaté dans le dépôt.

## 2. Classification des composants

### 2.1. EXISTANT CÔTÉ CLIENT (code observé, non équivalent à un service backend)

#### Meeting Connector
- Responsabilité : récupération du calendrier, reconnaissance des réunions Teams.
- Entrées : compte MSAL, plage temporelle, profil utilisateur.
- Sorties : liste structurée de réunions.
- Implémentation actuelle : [src/services/graphClient.ts](../../../src/services/graphClient.ts), fonction `fetchRealCalendarMeetings`.
- Observations : la logique de récupération est présente et fonctionnelle au niveau des tests.

#### Meeting Resolver
- Responsabilité : résolution de la réunion à partir du `JoinWebUrl`.
- Entrées : URL de meeting, contexte utilisateur.
- Sorties : `onlineMeetingId` Graph opaque, distinct du `meetingId` local de la future API.
- Implémentation actuelle : [src/services/transcriptService.ts](../../../src/services/transcriptService.ts), fonction `resolveOnlineMeetingId`.

#### Transcript Discovery
- Responsabilité : identification des transcriptions disponibles pour une réunion.
- Entrées : `onlineMeetingId`, contexte d'accès.
- Sorties : liste de `graphTranscriptId` et métadonnées ; un `transcriptId` API local n'existe qu'après persistance.
- Implémentation actuelle : [src/services/transcriptService.ts](../../../src/services/transcriptService.ts), fonction `fetchMeetingTranscripts`.

#### Transcript Retrieval
- Responsabilité : récupération du contenu Graph sous `text/vtt` ou format alternatif.
- Entrées : `onlineMeetingId`, `transcriptId`, contexte utilisateur, autorisations.
- Sorties : contenu brut + métadonnées du flux.
- Implémentation actuelle : [src/services/transcriptService.ts](../../../src/services/transcriptService.ts), fonction `fetchTranscriptContent`.

#### Transcript Parser
- Responsabilité : extraire les segments, timestamps et noms d'intervenants si fournis.
- Implémentation actuelle : `parseVttTranscript` et `parseUnattributedTranscript` dans `src/services/transcriptService.ts`.
- Règle métier importante : ne jamais inventer un nom d'intervenant.

#### Diagnostics et garde-fou d'approbation (partiels)
- Implémentation actuelle : `explainTranscriptError` et `enforceHumanValidationGate` dans `src/services/transcriptService.ts`.
- Limites : le premier classe des erreurs et le second vérifie des champs d'approbation fournis en entrée. Cela ne constitue ni un validateur structurel complet des cues, ni un workflow humain persistant/auditable.

### 2.2. À DÉVELOPPER — validation structurelle et orchestration

#### Transcript Structural Validator
- Vérifie les timestamps, bornes, séquences, cues vides/invalides, cohérence du format et les invariants de persistance.
- Reçoit le contenu analysé et sa provenance ; renvoie un résultat déterministe/versionné et des erreurs codées.
- N'effectue pas l'extraction IA ni la validation métier d'un compte rendu.

#### Processing Orchestrator
- Statut : À DÉVELOPPER ; aucun orchestrateur backend opérationnel n'est établi dans le dépôt.
- Coordonne les étapes et transitions du dictionnaire de statuts du document 07.
- Garantit la création/concurrence atomique du run avec le repository, sans déplacer silencieusement le tenant ou l'identité.

### 2.3. À DÉVELOPPER — persistance et interfaces

#### Transcript Repository
- Stocker les textes bruts, segments structurés, métadonnées de provenance.
- Objet métier : garder le transcript original et les versions normalisées distinctes.

#### Processing Run Store
- Enregistrer chaque exécution de traitement : début/fin, durée, statut, erreurs, retentatives.

#### Graph Backend Service
- Positionner la logique Microsoft Graph dans un service backend ASP.NET Core, séparé du front.

#### Data Access Layer
- Couche de persistance pour le moteur relationnel à décider ; PostgreSQL reste une option, non un choix acté.

#### Secure File Store
- Stockage des contenus bruts longs ou volumineux (si justification technique).

### 2.4. À CONFIRMER

#### Flux OBO (On-Behalf-Of)
- La cible suppose une API ASP.NET Core qui valide un JWT d'accès destiné à l'API, puis échange l'assertion utilisateur via OBO pour obtenir un jeton Graph délégué.
- Ce mécanisme n'est pas présent dans le dépôt actuel.
- Le jeton Graph reste exclusivement côté backend ; seuls les scopes/statuts non sensibles sont retournés au frontend.
- Audience API, scopes Graph, application Entra, consentement et accès effectif restent à valider.

#### Cible de persistance PostgreSQL
- Signalée dans la documentation, mais non validée par un schéma réel de base.
- À confirmer : tables, index, migration, sécurité, backup, retention.

#### Sélection du stockage brut vs. base relationnelle
- Le dépôt indique le besoin de conserver le contenu brut et les segments séparés.
- Le design précis du stockage doit être confirmé avant implémentation.

### 2.5. LOTS HORS PÉRIMÈTRE DE LA BRIQUE 01

#### Extraction IA, documents, SharePoint et agent Teams live
- Ils ne sont pas des dépendances du moteur de récupération/persistance de transcription.
- Leurs interfaces pourront être conçues ultérieurement, après décision DGF/Microsoft 365 distincte.
- Les trois scénarios métier de l'agent restent des exigences du lot live, mais ne sont pas à réaliser dans la brique 01.


## 3. Description détaillée par composant

### 3.1. Meeting Connector

Règles de fonctionnement :
- interroger un calendrier source ;
- filtrer les événements pouvant être des réunions Teams ;
- transmettre des données minimales nécessaires au traitement ;
- ne jamais modifier le rôle ni la résolution du tenant.

Interactions :
- reçoit des comptes utilisateurs depuis le frontend ou l'API ;
- appelle Microsoft Graph ;
- alimente le `Meeting Resolver`.

### 3.2. Meeting Resolver

Règles de fonctionnement :
- ne pas supposer qu'une réunion est Teams si la référence `JoinWebUrl` est absente ;
- ne pas transformer une réunion inconnue en réunion transcrite ;
- distinguer `meeting_unresolved`, `not_found`, `not_teams`.

### 3.3. Transcript Discovery

Règles de fonctionnement :
- ne pas considérer un `200 OK` avec `value: []` comme une erreur Graph ;
- distinguer `no_transcript` de `access_refused` de `tenant_access_disabled` ;
- conserver la distinction entre `graphTranscriptId` externe et `transcriptId` local après persistance.

### 3.4. Transcript Retrieval

Règles de fonctionnement :
- respecter l'ordre `VTT` puis fallback si nécessaire ;
- utiliser `Accept: application/vnd.microsoft.graph.transcript+text` seulement pour l'alternative, sans `$format` alternatif ;
- déclencher le fallback uniquement sur `innerError.code === SpeakerAttributionNotAllowed` ;
- ne pas exposer le contenu complet dans les logs ;
- conserver la trace de l'erreur Graph et l'état du fallback.

### 3.5. Transcript Parser

Règles de fonctionnement :
- conserver les timestamps ;
- préserver le brut et produire des cues normalisées ordonnées chronologiquement, sans modifier les timestamps ;
- ne pas inventer de noms pour un intervenant absent ;
- garder le format brut distinct du format normalisé.

### 3.6. Transcript Normalizer

Règles de fonctionnement :
- normaliser les retours sous un modèle uniforme ;
- conserver la référence source ;
- produire des segments avec `start_seconds`, `end_seconds`, `speaker_label`, `text` ;
- signaler `speaker_unknown`.

### 3.7. Transcript Structural Validator

État : à développer. Règles à spécifier/tester :
- valide les timestamps et l'ordre des cues normalisées ; le brut reste immuable et l'ordre de source demeure retraçable ;
- rejette le contenu non analysable avec une erreur codée ;
- vérifie que chaque cue persistée référence le transcript source et sa version ;
- n'effectue pas de classement IA ni ne conclut qu'un élément métier est « décidé ».

### 3.8. Processing Orchestrator

État : à développer en backend, non opérationnel actuellement.

Règles de fonctionnement :
- ne doit pas exécuter un traitement si la réunion est déjà en cours de traitement ;
- doit employer les statuts canoniques `queued`, `resolving_meeting`, `discovering_transcript`, `downloading_transcript`, `parsing_transcript`, `validating_transcript`, `persisting_transcript`, `failed_retryable`, `succeeded` et `failed_permanent` du document 07 ;
- la reprise doit conserver le résultat précédent et ne pas l'écraser sans signal explicite.

### 3.9. Transcript Repository

Règles de fonctionnement :
- enregistrer les métadonnées de provenance ;
- stocker le texte original sans transformation ;
- stocker les segments structurés distinctement ;
- sécuriser les accès selon le tenant.

### 3.10. Status & Traceability

Règles de fonctionnement :
- tracer les tentatives de récupération ;
- tracer les diagnostics Graph ;
- enregistrer les appels, status, requestId et erreurs ;
- conserver les données de provenance et de traitement séparées.

## 4. Périmètre livré par la brique 01

Inclut : récupération des réunions, résolution Teams, découverte/récupération Graph, fallback VTT/texte, parsing, normalisation, validation structurelle, persistance, suivi des runs et consultation structurée.

Exclut : extraction IA, décisions/actions métier, génération de comptes rendus, validation documentaire humaine, publication SharePoint et agent Teams en direct. Des interfaces d'extension peuvent être prévues sans rendre ces lots prérequis.

## 5. Résumé décisionnel

Le moteur technique réutilise le code Graph et parsing observé côté client, puis doit être renforcé par un backend de traitement, validation structurelle et persistance. L'extraction IA reste un lot distinct et ne conditionne pas l'acceptation de cette brique.

## 6. Points à confirmer avant implémentation

- architecture backend ASP.NET Core réelle et complète ;
- choix exact de PostgreSQL et de format de stockage ;
- mécanisme d'authentification backend / OBO ;
- niveau d'isolation par tenant ;
- permissions Graph exactes de lecture, et permissions SharePoint si publication ultérieure ;
- rôles autorisés par ressource et stratégie de concurrency/reprise.

## 7. État de la conception

- OBSERVÉ CÔTÉ CLIENT : Graph + parsing + fallback + diagnostics ; tests de logique mockés
- PARTIEL : garde-fou d'approbation côté client, pas un workflow humain persistant
- À DÉVELOPPER : validator structurel, orchestrateur, repository + pipeline backend + persistance + JWT/OBO
- À CONFIRMER : schéma PostgreSQL + stratégie de fichiers + permissions
- LOT DISTINCT : IA / documents / SharePoint / Teams live, selon validation DGF/M365 propre à chaque lot
