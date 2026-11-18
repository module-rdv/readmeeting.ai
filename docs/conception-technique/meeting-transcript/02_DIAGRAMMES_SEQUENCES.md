# 02 — Diagrammes de séquences du moteur Meeting & Transcript Processing

## 1. Objectif

Ce document décrit les flux de traitement à partir du dépôt réel. Il vise à illustrer les flux :

- de l'authentification au traitement de transcription ;
- de la résolution d'une réunion jusqu'à la mise à disposition structurée ;
- des exceptions Graph et des retours de fallback.

Les diagrammes ci-dessous reflètent la réalité du dépôt et la cible de conception. Les éléments non validés sont explicitement signalés.

## 2. Diagramme de flux existant côté navigateur (code observé)

```mermaid
sequenceDiagram
    participant U as Utilisateur DGF
    participant FE as Frontend React/Vite
    participant MSAL as MSAL / Entra ID
    participant GRAPH as Microsoft Graph
    participant TS as transcriptService
    participant PARSER as Parser VTT / non attribué
    participant UI as UI / Diagnostic

    U->>FE: Ouvre la réunion / lance le contrôle
    FE->>MSAL: acquireTokenSilent / popup
    MSAL-->>FE: Jeton Graph
    FE->>GRAPH: /me/calendarView
    GRAPH-->>FE: Liste des réunions
    FE->>TS: resolveOnlineMeetingId(joinWebUrl)
    TS->>GRAPH: /me/onlineMeetings?$filter=JoinWebUrl eq ...
    GRAPH-->>TS: onlineMeetingId
    TS->>GRAPH: /me/onlineMeetings/{id}/transcripts
    GRAPH-->>TS: liste des transcriptions
    TS->>GRAPH: /me/onlineMeetings/{id}/transcripts/{id}/content?$format=text/vtt
    alt SpeakerAttributionNotAllowed
        GRAPH-->>TS: 403 / innerError.code SpeakerAttributionNotAllowed
        TS->>GRAPH: Accept: application/vnd.microsoft.graph.transcript+text
            GRAPH-->>TS: contenu texte chronologique
        TS->>PARSER: parseUnattributedTranscript()
    else VTT autorisé
        GRAPH-->>TS: contenu VTT
        TS->>PARSER: parseVttTranscript()
    end
    PARSER-->>TS: segments, horodatages, intervenants
    TS-->>UI: résultat, diagnostics, statut
    UI-->>U: transcription visible / diagnostic métier
```

## 3. Diagramme cible backend orienté API (asynchrone, non implémenté)

```mermaid
sequenceDiagram
    participant U as Utilisateur DGF
    participant API as API ASP.NET Core
    participant AUTH as Validation JWT API / OBO
    participant GRAPH as Microsoft Graph
    participant ORCH as Processing Orchestrator
    participant REPO as Transcript Repository

    U->>API: POST /api/v1/meetings/{meetingId}/transcript-runs + Idempotency-Key
    API->>AUTH: valider signature, issuer, audience, exp, tid, oid
    AUTH-->>API: identité et tenant autorisés
    API->>AUTH: acquérir jeton Graph délégué (OBO backend)
    AUTH-->>API: jeton Graph conservé côté serveur
    API->>ORCH: acquérir atomiquement le run
    ORCH-->>API: runId + queued
    API-->>U: 202 Accepted + Location /api/v1/processing-runs/{runId}
    ORCH->>GRAPH: résolution / découverte / contenu Graph
    GRAPH-->>ORCH: données source
    ORCH->>ORCH: parse + normalise + valide
    ORCH->>REPO: persister source immuable + segments + métadonnées
    ORCH->>REPO: état terminal + événements de traitement
    U->>API: GET /api/v1/processing-runs/{runId}
    API-->>U: état / erreur sûre / transcript localId si terminé
```

## 4. Diagramme d'erreur et de reprise

```mermaid
stateDiagram-v2
    [*] --> queued
    queued --> resolving_meeting
    resolving_meeting --> discovering_transcript
    discovering_transcript --> downloading_transcript
    downloading_transcript --> parsing_transcript
    parsing_transcript --> validating_transcript
    validating_transcript --> persisting_transcript
    persisting_transcript --> succeeded

    resolving_meeting --> failed_retryable: timeout / 429 / 5xx transitoire
    discovering_transcript --> failed_retryable: timeout / 429 / 5xx transitoire
    downloading_transcript --> failed_retryable: timeout / 429 / 5xx transitoire
    persisting_transcript --> failed_retryable: indisponibilité transitoire
    resolving_meeting --> failed_permanent: introuvable / accès refusé
    discovering_transcript --> failed_permanent: transcript absent / accès refusé
    downloading_transcript --> failed_permanent: refus non récupérable
    parsing_transcript --> failed_permanent: format invalide
    validating_transcript --> failed_permanent: invariant violé
    failed_retryable --> queued: reprise avec le même runId et tentative suivante
```

## 5. Diagramme de fallback attribution refusée

```mermaid
sequenceDiagram
    participant GRAPH as Microsoft Graph
    participant FE as transcriptService côté frontend actuel
    participant PARSER as Parser
    participant DIAG as Diagnostics

    FE->>GRAPH: GET /content?$format=text/vtt
    GRAPH-->>FE: 403 + innerError.code = SpeakerAttributionNotAllowed
    FE->>DIAG: notifier le déclenchement du fallback
    FE->>GRAPH: GET même endpoint et même graphTranscriptId + Accept: application/vnd.microsoft.graph.transcript+text
    GRAPH-->>FE: contenu horodaté sans attribution (HTTP constaté dans l'événement)
    FE->>PARSER: parseUnattributedTranscript
    PARSER-->>FE: segments et timestamps sans invention de nom
    FE-->>DIAG: parse success/failure + format + code/HTTP ; aucun texte intégral loggé
```

## 6. Diagramme de persistance candidate

```mermaid
classDiagram
    class Meeting
    class Transcript
    class TranscriptRevision
    class TranscriptCue
    class ProcessingRun
    class ErrorEvent
    class TraceabilityRecord

    Meeting "1" --> "0..*" Transcript
    Transcript "1" --> "0..*" TranscriptRevision
    TranscriptRevision "1" --> "0..*" TranscriptCue
    Transcript "1" --> "0..*" ProcessingRun
    ProcessingRun "1" --> "0..*" ErrorEvent
    ProcessingRun "1" --> "0..*" ProcessingEvent
    SourceEvidence "1" --> "0..*" EvidenceLink
    EvidenceSubject "1" --> "1..*" EvidenceLink
```

## 7. Contraintes à respecter

- les routes cibles sont uniquement celles de [06_CONTRATS_API.md](./06_CONTRATS_API.md) ; aucun endpoint backend n'est attesté comme livré ;
- le flux OBO est une cible, pas un mécanisme existant dans le dépôt actuel ;
- le POST asynchrone renvoie `202` avec l'identifiant local du run et une URL de suivi ; il ne signifie pas que le traitement est terminé ;
- le jeton Graph acquis par OBO ne sort jamais du backend ;
- les erreurs Graph doivent être journalisées différemment selon les cas : permission, tenant, débit, parsing, persistance ;
- l'idempotence, le verrouillage atomique et le statut des runs suivent le contrat normatif des documents 04, 06 et 07 ;
- la persistance du contenu brut et du contenu normalisé doit rester séparée ;
- le périmètre s'arrête à la consultation structurée : aucune sortie IA ou génération documentaire n'est impliquée.

## 8. Statut par composant

- EXISTANT CÔTÉ CLIENT : Graph resolution/retrieval, parsing, fallback, diagnostics ; scénarios de tests mockés
- PARTIEL : garde-fou logique d'approbation humaine, sans workflow documentaire persistant
- À DÉVELOPPER : API backend, repository, persistance, orchestration centrale, validation structurelle, OBO
- À CONFIRMER : moteur de persistance, séparation raw/normalized, stratégie de stockage fichiers
- VALIDATION DGF / M365 : permissions Graph avancées, éventuel Participation Teams

## 9. Points d'attention

- les diagrammes de séquence doivent refléter le fait que le client front ne doit pas être la seule zone de logique métier ;
- la validation terrain des scénarios de transcription rapportée par le responsable est distincte des tests mockés et n'est pas reproduite par ce diagramme ;
- le fallback d'attribution ne remplace ni la qualification des droits effectifs du tenant ni la validation structurelle ;
- la persistance doit conserver la preuve d'origine, pas seulement le transcript normalisé.
