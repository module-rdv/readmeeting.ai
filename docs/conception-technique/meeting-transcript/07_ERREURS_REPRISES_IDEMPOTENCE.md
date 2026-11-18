# 07 — Erreurs, reprises, statuts et idempotence

## 1. Objet et autorité normative

Ce document est la source normative unique des statuts de `ProcessingRun`, de ses transitions et de sa stratégie d'idempotence pour la brique 01. Les documents 01, 02, 03, 04, 06 et 08 doivent reprendre ces noms sans variantes.

Les statuts métier d'extraction/décision et les statuts documentaires ne sont pas des états de `ProcessingRun`. L'extraction IA et le workflow documentaire restent hors périmètre brique 01.

## 2. États de ProcessingRun

### 2.1 États initiaux et intermédiaires

- `queued` : demande persistée et prête à être prise en charge.
- `resolving_meeting` : résolution/validation de la réunion.
- `discovering_transcript` : découverte ou sélection du transcript Graph.
- `downloading_transcript` : demande du contenu Graph, y compris le fallback permis.
- `parsing_transcript` : parsing du VTT ou du format texte alternatif.
- `validating_transcript` : contrôles structurels.
- `persisting_transcript` : persistance atomique de révision et cues.
- `failed_retryable` : tentative temporairement échouée, run non terminal éligible à reprise.

### 2.2 États terminaux

- `succeeded` : le transcript/résultat associé est persisté et consultable.
- `failed_permanent` : échec non récupérable sans correction/configuration ou nouvelle demande.

Un run terminal est immuable. On ne le fait jamais transiter vers `skipped_duplicate` ou un nouvel état. La déduplication est un résultat de la nouvelle requête, pas une mutation de l'ancien run.

### 2.3 Transitions autorisées

```text
queued -> resolving_meeting
resolving_meeting -> discovering_transcript | failed_retryable | failed_permanent
discovering_transcript -> downloading_transcript | failed_retryable | failed_permanent
downloading_transcript -> parsing_transcript | failed_retryable | failed_permanent
parsing_transcript -> validating_transcript | failed_permanent
validating_transcript -> persisting_transcript | failed_permanent
persisting_transcript -> succeeded | failed_retryable | failed_permanent
failed_retryable -> queued
```

Le fallback `SpeakerAttributionNotAllowed` est une branche interne de `downloading_transcript`, pas un statut de run terminal : le premier 403 est journalisé, la deuxième requête est faite, puis la suite dépend de son résultat.

Une transition non répertoriée est refusée et journalisée comme erreur d'état. `succeeded` et `failed_permanent` n'ont pas de transition sortante.

## 3. Classification des erreurs

### 3.1 Retry automatique ou contrôlé

Éligibles à `failed_retryable` lorsque l'échec est temporaire :
- HTTP Graph 429 en respectant `Retry-After` ;
- HTTP Graph 5xx, timeout ou coupure réseau ;
- indisponibilité transitoire du repository/stockage ;
- arrêt du worker ou expiration du lease permettant la reprise.

Le nombre maximal d'essais, délais exponentiels/jitter et durée maximale de traitement sont des paramètres d'exploitation à valider avant production. Aucun seuil n'est fixé ici.

### 3.2 Non réessayables automatiquement

Doivent aller à `failed_permanent` :
- JWT invalide, tenant non autorisé, accès ressource refusé ;
- consentement ou permission Graph manquants ;
- restriction/politique tenant, si aucun fallback autorisé ne permet le contenu ;
- réunion/transcript inexistant ou aucun transcript admissible ;
- réponse du fallback refusée : conserver code et status de cette réponse ;
- type/contenu non supporté, parsing invalide ou invariants structurels violés ;
- requête invalide ou même clé idempotence réutilisée avec payload différent.

Après correction de la cause, le client soumet une nouvelle requête avec une nouvelle clé ; un run terminal existant n'est pas réouvert. Pour les erreurs d'authentification, une nouvelle acquisition de token puis une nouvelle requête est requise.

## 4. Clé d'idempotence, empreinte et résultats existants

### 4.1 Clé client

Chaque POST de démarrage fournit `Idempotency-Key`. Sa portée d'unicité est :

```text
(tenant_id vérifié, utilisateur oid vérifié, idempotency_key)
```

Le serveur conserve également `request_payload_hash`, calculé sur une représentation canonique incluant `meeting_id` local, `graphTranscriptId` éventuel et `forceReprocess`. Un corps ne contient jamais de tenant d'autorité.

Chaque arrivée HTTP produit un `ProcessingRequestEvent` distinct, même lorsque la clé et le payload reproduisent une demande antérieure ; cet événement conserve l'issue de la requête et le run réutilisé sans créer un second worker.

- clé et payload identiques : renvoyer le même `runId`/résultat précédent ;
- clé identique, payload différent : 409 `IDEMPOTENCY_KEY_REUSED` ;
- clé nouvelle : demande logique distincte ; voir concurrence et résultats existants ci-dessous.

### 4.2 Identité du traitement logique et empreinte source

Après téléchargement, définir le fingerprint :

```text
SHA-256(raw_content_bytes) + source_format + parser_version
```

Le fingerprint source ne remplace pas l'Idempotency-Key : il permet de reconnaître le même contenu traité avec le même parseur. La clé Graph source inclut le tenant, `graphMeetingId`/`graphTranscriptId` sans les utiliser comme clés locales.

### 4.3 Nouvelle demande, doublon actif ou résultat déjà réussi

- Nouvelle clé pendant qu'un run équivalent est actif : acquérir atomiquement le run actif et répondre avec son `runId`, `202`, `reused: true`. Aucun second worker ne traite la même entrée simultanément.
- Nouvelle clé quand un résultat réussi correspondant au même fingerprint/parseur existe : sans `forceReprocess`, retourner le résultat existant en `200`, `reused: true`; ne créer ni muter un run.
- `forceReprocess=true` nécessite une nouvelle clé ; crée un nouveau run et un nouvel historique, sans écraser le résultat précédent.
- Un nouveau contenu ou une nouvelle version de parseur a un fingerprint différent et peut générer un résultat distinct.

## 5. Concurrence et acquisition du traitement

1. Transaction DB atomique : insérer le run ou retrouver la clé idempotente existante.
2. Une contrainte unique garantit `(tenant_id, requested_by_user_id, idempotency_key)`.
3. Un verrou/lease ou une contrainte unique partielle sur les traitements logiques actifs est acquis avant que le worker appelle Graph. L'acquisition et la transition à `resolving_meeting` sont transactionnelles.
4. Le lease porte un propriétaire opaque, une date d'expiration et un heartbeat ; son expiration permet une reprise contrôlée du même run, pas la création concurrente silencieuse d'un autre run.
5. Avant chaque écriture, le worker vérifie son lease/fencing token pour empêcher un ancien worker de publier un résultat après perte du verrou.
6. La persistance des cues et de la révision se fait en transaction ; une transaction échouée ne laisse pas un résultat partiel déclaré `succeeded`.

Les mécanismes concrets (advisory lock, verrou de ligne, contrainte partielle ou service distribué) dépendent du moteur d'hébergement retenu, encore à confirmer.

## 6. Reprise après interruption

- `failed_retryable -> queued` conserve le même `ProcessingRunId`, incrémente `attempt_count` et ajoute un nouvel événement append-only.
- Si le worker s'arrête avant l'état persistant, la récupération après lease expiré réconcilie le dernier événement et reprend à une frontière idempotente ; elle ne suppose pas que l'appel Graph précédent a été absent.
- Après un téléchargement réussi mais avant persistance, le contenu temporaire chiffré et son hash peuvent être réutilisés si sa conservation est autorisée ; sinon le contenu est récupéré à nouveau puis le hash vérifié.
- Les cues sont remplacées uniquement dans une nouvelle révision transactionnelle. Il ne faut pas insérer des segments partiels ni altérer une révision validée.
- Toute reprise manuelle d'un run `failed_permanent` crée une nouvelle requête/run après correction ; elle n'efface pas l'erreur précédente.

## 7. Événements et journalisation

Chaque tentative append-only conserve :
- `processing_run_id`, `attempt_number`, stage, statut précédent/nouveau ;
- heure UTC début/fin, durée ;
- code local, code Graph et `innerError.code` ;
- status HTTP, Graph request-id et `Retry-After` lorsqu'ils existent ;
- parser version, source format, hash du contenu après téléchargement ;
- correlationId interne.

Ne jamais conserver dans les logs : access/refresh tokens, secret/certificat, assertion OBO, contenu intégral ou extrait de transcription, URL avec données sensibles. Les messages sont redacted ; le contenu source protégé est stocké à part selon les règles de rétention.

## 8. Dictionnaire de statuts hors traitement

Ces états sont normatifs pour les futurs lots métier/documentaires, pas des valeurs du `ProcessingRun`. Les listes doivent être validées par la DGF avant leur implémentation.

### 8.1 État métier d'une proposition/décision/action

Vocabulaire partagé :
- `proposed` : proposé, pas encore accepté ;
- `to_confirm` : point ouvert nécessitant une confirmation/validation ;
- `confirmed` : explicitement confirmé, sans que cela signifie nécessairement une décision formelle ;
- `decided` : décision explicitement prise ;
- `postponed` : point reporté à plus tard ;
- `rejected` : explicitement rejeté.

Transitions proposées : `proposed -> to_confirm|confirmed|decided|postponed|rejected`; `to_confirm -> confirmed|decided|postponed|rejected`; `confirmed -> decided|postponed|rejected`; `postponed -> to_confirm|decided|rejected`. Une décision historique ne se réécrit pas silencieusement : une révocation/correction ajoute un événement/une nouvelle version et conserve l'état antérieur.

Pour `ActionItem`, l'exécution est un axe distinct `not_started -> in_progress -> completed`; le statut métier ci-dessus ne devient pas `completed`, et `rejected`/`postponed` ne signifient pas action terminée.

### 8.2 Cycle documentaire futur (hors brique 01)

Ordre normatif : extraction et preuves → brouillon → validation humaine → génération/version finale → contrôles → publication.

- `DocumentDraft.status` : `draft`, `under_review`, `changes_requested`, `approved_for_generation`, `rejected`.
- `DocumentVersion.status` : `review_candidate`, `approved_content`, `final_generated`, `controls_passed`, `published`, `superseded`, `rejected`.
- `HumanValidation.status` : `pending`, `approved`, `changes_requested`, `rejected`.
- `SharePointPublication.status` : `pending`, `published`, `failed`, `duplicate`.

Toute `HumanValidation` référence une version locale immuable et son hash de contenu. La génération finale doit référencer le contenu approuvé. Si le contenu est modifié après approbation, l'approbation antérieure reste historisée mais n'autorise plus publication ; une nouvelle version doit repasser par validation avant génération finale, contrôles et publication. Il n'y a pas de publication avant contrôles réussis et approbation encore valide.

Ces statuts et cette séquence ne sont ni développés ni testés dans la brique 01.

**Écart avec le référentiel global à arbitrer :** `docs/preparation-architecture/02_MODELE_DONNEES_METIER.md` utilise `reported` dans les statuts d'éléments et ne fournit pas exactement la présente liste. Ce document global est conservé ; DGF doit décider s'il faut remplacer `reported` par `postponed` et adopter un champ distinct d'avancement des actions avant l'implémentation du lot métier.

## 9. Référence à l'existant

Le code TypeScript contient des diagnostics Graph et des scripts mockés de fallback. Il ne contient pas la machine d'état persistée, le verrouillage, le lease, la reprise DB ou l'idempotence décrits ici. Les mécanismes de cette spécification sont des exigences à développer et tester.

## 10. Paramètres restant à valider

- seuil de retries, backoff/jitter et durée maximale ;
- durée de lease/heartbeat et mécanisme de verrouillage selon le stockage retenu ;
- durée de conservation des événements et contenus temporaires ;
- résultat en cas de transcript renouvelé par Graph ;
- choix métier pour le vocabulaire `reported`/`postponed` et les statuts d'ActionItem.
