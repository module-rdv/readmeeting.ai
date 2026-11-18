# 05 — Intégration Microsoft Graph

## 1. Objet et niveaux de preuve

Ce document distingue l'intégration TypeScript côté navigateur observée, la validation terrain rapportée par le responsable et l'intégration backend cible. Ces niveaux ne sont pas interchangeables.

La validation terrain rapportée des scénarios A/B de récupération transcript est conservée comme référence globale. Les scripts du dépôt utilisent des mocks pour certaines requêtes : ils ne reproduisent pas l'authentification ni l'accès réel au tenant DGF.

## 2. Implémentation observée dans le dépôt

### 2.1 MSAL et Graph côté navigateur

Fichiers principaux :
- `src/config/msalConfig.ts` : configuration MSAL et contrôle du redirect URI ;
- `src/services/graphClient.ts` : MSAL, acquisition de token délégué, scopes demandés, client Graph et diagnostics ;
- `src/services/transcriptService.ts` : calendrier/résolution Teams/transcripts, récupération, parseurs et diagnostic ;
- `src/types/transcript.ts` : types des contenus et diagnostics.

Fonctions observées : `getTranscriptAccessToken`, `createTranscriptGraphClient`, `fetchRealCalendarMeetings`, `resolveOnlineMeetingId`, `fetchMeetingTranscripts`, `fetchTranscriptContent`, `parseVttTranscript`, `parseUnattributedTranscript`, `explainTranscriptError`.

Le code demandé les scopes `User.Read`, `Calendars.Read`, `OnlineMeetings.Read`, `OnlineMeetingTranscript.Read.All`. Leur présence signifie **scope demandé/configuré**, pas consentement effectif ou accès à toutes les ressources.

### 2.2 Flux de récupération et fallback

1. Le client obtient par MSAL un token délégué et consulte les ressources Graph dans son contexte utilisateur.
2. Il résout une réunion Teams et découvre son/ses `graphTranscriptId`.
3. La première demande de contenu utilise le endpoint `/content` et `$format=text/vtt`.
4. Seul `innerError.code === SpeakerAttributionNotAllowed` provoque une seconde demande au même endpoint et avec le même `graphTranscriptId`.
5. La seconde demande porte `Accept: application/vnd.microsoft.graph.transcript+text`, sans `$format` alternatif.
6. Le contenu VTT suit le parseur VTT ; le contenu alternatif suit le parseur non attribué. Aucun nom de locuteur n'est inventé.

Les scripts `scripts/test-transcript-service.ts` vérifient ces propriétés avec un Graph mocké. Les appels authentifiés réels ne font pas partie des contrôles exécutés pour ce document.

## 3. Modèle de preuve pour les autorisations

Toute documentation de statut doit nommer précisément le niveau observé :

| État de preuve | Signification | N'affirme pas |
|---|---|---|
| Scope présent dans le code/configuration | L'application le demande | Consentement du tenant ou accès à la ressource |
| Scope observé dans un résultat MSAL | Portée accordée dans cette acquisition/context utilisateur | Permission universelle ou politique Teams autorisant la transcription |
| Appel Graph authentifié réussi | L'opération testée a réussi pour l'identité, la ressource et le moment consignés | Droits pour d'autres utilisateurs/réunions |
| Test automatisé mocké réussi | La logique locale traite la réponse simulée comme prévu | Authentification ou accès réel Microsoft 365 |
| Validation terrain rapportée par le responsable | Résultats A/B tels que rapportés dans le référentiel global | Test de l'API backend/OBO ou preuve fournie par cette revue |

`OnlineMeetingTranscript.Read.All` ne doit pas être décrit comme « permission validée » sur la seule base du code.

## 4. Authentification backend cible (OBO, non implémentée)

Le dépôt observé ne démontre ni API ASP.NET Core complète, ni OBO, ni service Graph backend opérationnel. L'interface `IMicrosoftGraphService` est un contrat C#, pas une preuve d'implémentation.

Flux cible :

1. Le frontend MSAL demande un **access token destiné à l'audience de l'API ReadMeeting**, et l'envoie en `Authorization: Bearer`.
2. L'API valide la signature via les métadonnées/keys de l'émetteur, l'issuer/tenant autorisé, l'audience exacte, `exp`, `nbf` et les claims nécessaires. `tid` vérifié identifie le tenant, `oid` vérifié l'acteur.
3. Le serveur résout `tid` vers le `TenantId` interne, vérifie l'appartenance de la réunion au tenant et l'autorisation de l'acteur sur la ressource/opération. Un `tenantId`, `userId`, Graph ID ou rôle fourni dans le corps ne fait pas autorité.
4. Le client confidentiel Entra configuré côté serveur réalise le flux OAuth 2.0 On-Behalf-Of avec le token API validé comme assertion et les scopes Graph délégués approuvés.
5. Le token Graph sert uniquement côté serveur à appeler Graph. Il ne transite pas dans la réponse API, dans un événement ou dans un log.
6. Le backend transforme les erreurs en réponses métier sûres et persistées sans exposer de détails/secrets qui permettent une fuite de données.

Le choix OBO, l'audience API, l'enregistrement d'application, le secret/certificat, les scopes demandés et consentements effectifs sont à confirmer par architecture et M365. Aucun mécanisme alternatif d'accès applicatif n'est présumé.

## 5. Permissions Graph et accès par ressource

- Distinguer les permissions déléguées nécessaires à la consultation du calendrier, à la résolution de réunion et à la lecture des transcriptions ; ne pas élargir les scopes sans besoin.
- Les permissions d'écriture SharePoint sont indépendantes de la lecture des transcriptions et hors périmètre brique 01.
- Une permission accordée n'annule pas les contrôles Graph sur organisateur, utilisateur, réunion ou politiques tenant.
- Le backend applique l'autorisation locale de la ressource, puis Graph décide selon le token délégué et les règles Microsoft 365.
- Les erreurs `401`, `403`, restrictions tenant, `404`, `429` et `5xx` conservent status HTTP, code Graph/innerError et request-id, sans enregistrer le contenu transcript ni le token.

## 6. Format et contenu

- VTT primaire : conserver le contenu reçu et parser les cues/speakers présents.
- Fallback : déclenchement strict sur l'inner error spécifiée, même endpoint et transcriptId, header `Accept` obligatoire ; aucun `$format=application/vnd.microsoft.graph.transcript+text`.
- Non attribué : conserver les timestamps et le texte ; renseigner le marqueur non attribué sans convertir ce marqueur en identité.
- Le brut, la révision normalisée, le hash, le format demandé/répondu et les diagnostics sont conservés séparément selon la politique de rétention.

## 7. Périmètre d'intégration de la brique 01

Inclut la récupération de réunions et transcriptions post-réunion, résolution, découverte, téléchargement, fallback, parsing, normalisation et persistance/consultation prévues par les documents 01, 04 et 06.

N'inclut pas : extraction IA, génération institutionnelle, publication SharePoint ou participation Teams live. Ces lots nécessitent leurs décisions et permissions propres ; les trois scénarios métier de l'agent restent des exigences de conception du lot live et ne sont pas une fonction Graph transcript.

## 8. État de validation

- **Observé dans le code :** client MSAL/Graph front, scopes demandés, fonctions de récupération, deux parseurs et diagnostics.
- **Vérifié par scripts mockés :** règles locales de fallback, header, parseur et traitement des erreurs simulées.
- **Rapporté par le responsable :** validation terrain A/B de récupération transcript.
- **À développer :** API sécurisée, validation JWT, OBO, autorisation par ressource, service Graph backend et persistence durable.
- **À confirmer :** audience API, consentement effectif par scope, politique tenant, droits selon identités/réunions, déploiement et secrets.
- Aucun statut ci-dessus ne vaut autorisation SharePoint ni validation de l'agent Teams.
