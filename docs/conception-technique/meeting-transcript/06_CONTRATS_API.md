# 06 — Contrats API de la brique Meeting & Transcript Processing

## 1. Statut et conventions

Les contrats ci-dessous sont **cibles, non implémentés**. Ils décrivent uniquement la brique 01 : réunions, traitement transcript, suivi du run et consultation structurée. Les routes utilisent un UUID local `meetingId`, `transcriptId`, `runId` ; jamais un ID Graph en guise de clé de ressource API.

Le tenant et l'utilisateur sont issus exclusivement des claims validés côté API (`tid`, `oid`) et de leur mapping local. Aucun champ client `tenantId` ou `userId` n'est autoritaire.

## 2. Sécurité d'API et authentification

- Toute route métier requiert un access token Entra avec l'audience exacte de l'API ReadMeeting.
- L'API vérifie cryptographiquement le token, `iss`, `aud`, `exp`, `nbf`, tenant autorisé, et claims/scopes/roles configurés. Elle mappe `tid` vérifié vers `tenant_id` et `oid` vers l'utilisateur local.
- L'autorisation est vérifiée à chaque accès de ressource après tenant scoping (meeting, transcript, run). Un ID valide n'est pas une preuve d'autorisation.
- `tenantId` de query/path/body est rejeté ou ignoré ; ne jamais baser un filtre de sécurité sur lui.
- Le flux OBO est effectué par le backend uniquement pour appeler Graph. Le token Graph, ses scopes détaillés s'ils révèlent des droits, et les secrets OBO ne sont jamais renvoyés au front.

## 3. Consultation des réunions

### 3.1 `GET /api/v1/meetings?start={utc}&end={utc}&limit={n}&cursor={opaque}`

Liste les réunions accessibles par l'utilisateur dans le tenant issu du token.

**Validation :** dates UTC valides, `start < end`, limite dans la plage définie par le serveur. Le client ne transmet pas de tenant faisant autorité.

**200** :
```json
{
  "items": [{
    "meetingId": "local-uuid",
    "graphMeetingId": "opaque-or-null",
    "title": "string-or-null",
    "organizer": {"displayName": "string-or-null", "m365ObjectId": "opaque-or-null"},
    "startAt": "2026-01-01T09:00:00Z",
    "endAt": "2026-01-01T10:00:00Z",
    "resolutionStatus": "resolved"
  }],
  "nextCursor": null
}
```

Le client ne choisit pas `graphMeetingId` comme identifiant local de route.

### 3.2 `GET /api/v1/meetings/{meetingId}`

`200 MeetingDetail` si la réunion appartient au tenant et est accessible ; sinon réponse selon politique anti-enumeration (404 pour ressource inexistante ou hors périmètre, éventuellement 403 pour objet connu mais opération refusée). Les détails Graph sensibles ne sont inclus que si nécessaires.

## 4. Démarrage asynchrone d'un traitement

### 4.1 `POST /api/v1/meetings/{meetingId}/transcript-runs`

Un seul endpoint canonique est utilisé dans tous les diagrammes et contrats.

**Headers**
- `Authorization: Bearer <API access token>`
- `Idempotency-Key: <opaque key>` (obligatoire, 16–128 caractères, non sensible)
- `Content-Type: application/json`

**Requête**
```json
{
  "graphTranscriptId": "optional opaque Graph transcript id",
  "forceReprocess": false
}
```

`graphTranscriptId` est le nom explicite de la référence Graph externe. S'il est absent, l'API découvre les transcripts admissibles de la réunion locale. `forceReprocess=true` demande un run distinct après vérification des droits ; il requiert une nouvelle clé d'idempotence. Ni le corps ni les headers ne contiennent `tenantId`/`userId`.

**Sémantique**
- L'API authentifie, autorise, valide et persiste atomiquement la demande ; le travail n'est pas nécessairement exécuté avant la réponse.
- `202 Accepted` signifie que le run a été accepté (nouveau ou déjà actif). Cela ne signifie ni succès ni résultat final. `Location` pointe vers le run.
- Même clé et même hash de payload : restitue le même run (202 tant que son état n'est pas terminal, y compris `failed_retryable` ; 200 si terminal, avec sa représentation actuelle).
- Même clé et payload différent : `409 IDEMPOTENCY_KEY_REUSED`.
- Nouvelle clé alors qu'un run identique est actif : renvoie le run actif réutilisé avec `202` et `reused: true`; aucun nouveau traitement concurrent.
- Nouvelle clé après un run réussi : par défaut, renvoie le résultat existant sans altérer l'ancien run (`200`, `reused: true`). Si `forceReprocess=true`, crée un nouveau run (`202`).
- Chaque appel HTTP accepté ou rejeté produit un `ProcessingRequestEvent` distinct, avec un résultat (`created`, `reused_active`, `reused_result`, `forced_reprocess`, `rejected_conflict`, `rejected_invalid`) et une corrélation. La réutilisation signifie réutilisation du calcul/run, jamais effacement de la nouvelle demande de l'historique.

**202**
```json
{
  "runId": "local-uuid",
  "meetingId": "local-uuid",
  "transcriptId": null,
  "status": "queued",
  "reused": false,
  "statusUrl": "/api/v1/processing-runs/local-uuid"
}
```

**200 déjà terminé**
```json
{
  "runId": "local-uuid",
  "meetingId": "local-uuid",
  "transcriptId": "local-uuid",
  "status": "succeeded",
  "reused": true,
  "resultUrl": "/api/v1/transcripts/local-uuid"
}
```

## 5. Suivi et consultation du transcript

### 5.1 `GET /api/v1/processing-runs/{runId}`

Retourne l'état et les métadonnées autorisées du run. Le contrôle tenant et ressource est requis.

```json
{
  "runId": "local-uuid",
  "meetingId": "local-uuid",
  "transcriptId": "local-uuid-or-null",
  "status": "downloading_transcript",
  "attemptCount": 1,
  "currentStage": "downloading_transcript",
  "createdAt": "2026-01-01T10:00:00Z",
  "startedAt": "2026-01-01T10:00:01Z",
  "completedAt": null,
  "lastError": null
}
```

`lastError` ne contient que `code`, `retryable`, `httpStatus` et message redacted ; jamais contenu brut, token, secrets ou données hors périmètre.

### 5.2 `GET /api/v1/meetings/{meetingId}/transcripts`

Retourne les transcripts locaux de la réunion, pas une liste arbitraire de résultats Graph.

```json
{
  "items": [{
    "transcriptId": "local-uuid",
    "graphTranscriptId": "opaque",
    "sourceFormat": "vtt",
    "retrievalMode": "vtt_primary",
    "status": "available",
    "latestRevisionId": "local-uuid",
    "retrievedAt": "2026-01-01T10:03:00Z"
  }]
}
```

### 5.3 `GET /api/v1/transcripts/{transcriptId}`

Renvoie une représentation structurée autorisée :
```json
{
  "transcriptId": "local-uuid",
  "meetingId": "local-uuid",
  "revisionId": "local-uuid",
  "sourceFormat": "graph_transcript_text",
  "retrievalMode": "unattributed_fallback",
  "rawSha256": "hex",
  "parserVersion": "string",
  "speakerAttribution": "unattributed",
  "cues": [{
    "cueId": "local-uuid",
    "sequenceNumber": 1,
    "startMs": 1200,
    "endMs": 3400,
    "speakerName": null,
    "speakerAttribution": "unattributed",
    "text": "paroles horodatées"
  }]
}
```

L'accès au brut n'est pas inclus par défaut. Un endpoint de téléchargement brut, s'il est requis, doit être autorisé séparément et respecter la politique de conservation.

## 6. Erreurs HTTP

Les erreurs respectent un schéma stable :
```json
{
  "code": "GRAPH_TRANSCRIPT_ACCESS_DENIED",
  "message": "La transcription n'est pas accessible.",
  "retryable": false,
  "correlationId": "opaque"
}
```

| HTTP | Codes métier représentatifs | Usage |
|---|---|---|
| 400 | `INVALID_REQUEST`, `INVALID_DATE_RANGE` | Entrée mal formée |
| 401 | `INVALID_API_TOKEN` | Token absent/invalide, issuer ou audience incorrect |
| 403 | `RESOURCE_FORBIDDEN`, `CONSENT_REQUIRED` | Acteur/opération interdits ou consentement requis |
| 404 | `MEETING_NOT_FOUND`, `TRANSCRIPT_NOT_FOUND`, `RUN_NOT_FOUND` | Ressource absente/hors périmètre selon politique anti-enumeration |
| 409 | `IDEMPOTENCY_KEY_REUSED`, `INVALID_RUN_STATE` | Même clé/payload différent ou état incompatible |
| 422 | `GRAPH_TRANSCRIPT_UNAVAILABLE`, `UNSUPPORTED_CONTENT`, `STRUCTURAL_VALIDATION_FAILED` | Demande comprise mais non traitable |
| 429 | `RATE_LIMITED` | Limite API; inclure `Retry-After` |
| 502/503 | `GRAPH_UPSTREAM_ERROR`, `DEPENDENCY_UNAVAILABLE` | Dépendance amont temporaire |
| 500 | `INTERNAL_ERROR` | Erreur inattendue, message public générique |

Le code Graph, `innerError.code`, status HTTP, request-id et Retry-After sont persistés/redacted selon le document 07 ; l'erreur publique ne divulgue pas de contenu de transcript ou de secret.

## 7. Cohérence avec états et persistance

- Les états et transitions autorisés sont définis uniquement dans [07_ERREURS_REPRISES_IDEMPOTENCE.md](./07_ERREURS_REPRISES_IDEMPOTENCE.md).
- Identifiants et contraintes de stockage suivent [04_MODELE_DONNEES.md](./04_MODELE_DONNEES.md).
- Le POST ne retourne jamais un faux succès sous forme d'un état `completed` synchronisé si l'exécution est asynchrone.
- Le run terminé reste immuable ; une nouvelle demande est un nouvel événement/run ou une réutilisation explicite du résultat.

## 8. Hors périmètre

Pas de routes d'acquisition/exposition de token Graph, d'extraction IA, d'approbation documentaire, de génération DOCX/PDF, de publication SharePoint ou d'agent Teams live dans le contrat de la brique 01. Ces interfaces appartiendront à des lots distincts avec validation gouvernance.

## 9. État de validation

- **Observé :** aucun de ces endpoints API cible n'est attesté comme implémenté.
- **Proposé :** routes, schémas et sémantique documentés ici.
- **À confirmer :** audience Entra, scopes/roles API, OBO et scopes Graph autorisés, autorisation par ressource, règles anti-enumeration, limites de débit et durées.
- **Non démontré :** backend exécutable, intégration OBO ou persistance opérationnelle.
