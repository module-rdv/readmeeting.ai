# Rapport de consolidation — dossier Microsoft Entra ID DGF

**Date : 15 novembre 2026**
**Périmètre : revue documentaire uniquement**

## A. Synthèse exécutive

La revue croisée des cinq documents administratifs a été effectuée en les confrontant aux fichiers d'authentification API, MSAL, client Graph et configuration actuellement présents. Aucune information documentaire n'a été considérée comme preuve d'un enregistrement, d'un consentement ou d'un accès effectif.

Le dossier est cohérent sur la séparation SPA/API, l'audience et le scope API, le contexte utilisateur issu des claims validés, et l'absence de capacité OBO/Graph backend démontrée. La fiche distingue désormais les trois environnements et trace les preuves. Le plan différencie les tests d'intégration synthétiques des vrais tests Entra et identifie ceux bloqués.

**Conclusion : Non prêt à transmettre comme dossier sans réserve tant que la valeur non-placeholder au format de credential détectée dans `.env.example` n'a pas été examinée par la DSI/sécurité.** Son authenticité n'est pas vérifiable ; elle n'est pas reproduite ici et aucun fichier d'environnement n'a été modifié. Le dossier documentaire peut être communiqué séparément par un canal DSI approuvé, sans joindre ni recopier le fichier d'environnement. Le Lot 1 reste non clôturé ; aucun test Entra/OBO/Graph réel n'a été réalisé.

## B. Documents examinés

Les cinq documents préexistants ont été lus intégralement avant modification.

| Document | État avant consolidation | Modifications effectuées |
|---|---|---|
| [00_RAPPORT_PREPARATION_ENTRA_DGF.md](./00_RAPPORT_PREPARATION_ENTRA_DGF.md) | Rapport initial des constats, paramètres manquants et limites. | Historique conservé ; résultat de classification environnement, modifications apportées, prérequis DSI et conclusion de consolidation ajoutés. |
| [ENTRA_GUIDE_ADMINISTRATEUR_DGF.md](./ENTRA_GUIDE_ADMINISTRATEUR_DGF.md) | Guide détaillant SPA, API, scopes, OBO et environnement. | Clarification de l'absence de vérification distincte du claim `ver` ; liens croisés et état de validation ajoutés. |
| [ENTRA_FICHE_PARAMETRES_DGF.md](./ENTRA_FICHE_PARAMETRES_DGF.md) | Fiche avec des paramètres non segmentés par environnement et sans preuve structurée ni matrice de permissions. | Réécrite en trois sections d'environnement, colonne « Preuve / Référence », statuts de consentement et matrice Graph. |
| [ENTRA_PLAN_VALIDATION_DGF.md](./ENTRA_PLAN_VALIDATION_DGF.md) | Plan des huit tests, sans état de réalisabilité détaillé. | Chaque test indique couverture synthétique, état réel, blocages, procédure et référence de preuve attendue. |
| [NOTE_TRANSMISSION_ADMINISTRATEUR_DGF.md](./NOTE_TRANSMISSION_ADMINISTRATEUR_DGF.md) | Note de contexte et opérations demandées. | Liens vers guide, fiche, plan et rapports ; livrables attendus de la DSI explicités. |

Nouveau document créé : le présent rapport de consolidation. Aucun autre document n'a été créé par cette mission.

## C. Résultats de la revue technique

### Cohérences confirmées

- `AzureAd:TenantId`, `AzureAd:ClientId`, `AzureAd:AllowedClientId`, `AzureAd:Audience` et `AzureAd:RequiredScope` sont lus par le backend ; les identifiants nécessaires sont validés au démarrage.
- L'issuer attendu est construit strictement sous la forme `https://login.microsoftonline.com/{TenantId}/v2.0`. La validation d'audience compare exactement `aud` à `AzureAd:Audience`.
- La politique `ApiUser` vérifie le tenant `tid`, un `oid` UUID, le scope de `scp`, et `azp` ou `appid` comparé à `AzureAd:AllowedClientId`. Elle privilégie `azp` lorsqu'il est présent.
- `AzureAd:ClientId` est transmis à Microsoft.Identity.Web comme configuration de l'API ; `AzureAd:AllowedClientId` joue un rôle distinct de liste de clients appelants autorisés.
- L'unique endpoint protégé raccordé est `GET /api/v1/security/context`. Les champs retournés proviennent des claims authentifiés, pas d'un `tenantId` fourni par le client.
- Le frontend demande un token API distinct via `VITE_READMEETING_API_SCOPE` et restreint l'appel à l'origine de `VITE_READMEETING_API_BASE_URL`.
- Les scopes Graph sont déclarés dans le flux MSAL frontend ; un token Graph n'est pas interchangeable avec le token API.

### Divergences et précisions documentaires apportées

1. **`aud` et Application ID URI** : aucune valeur réelle d'inscription/token n'est disponible. Le document exige maintenant de confirmer `aud` depuis un vrai token destiné à l'API, sans assimiler automatiquement cette valeur à l'Application ID URI.
2. **Scope API** : `VITE_READMEETING_API_SCOPE` est le scope complet demandé par MSAL ; `AzureAd:RequiredScope` est comparé par le code à la valeur de scope dans `scp`. Le nom et le lien entre ces formats restent à fournir par la DSI/administrateur et l'équipe API.
3. **Version du token** : l'API impose un issuer v2 exact, mais ne teste pas séparément un claim `ver`. Les documents le disent désormais explicitement ; `ver` peut être une observation de preuve, pas un contrôle applicatif distinct.
4. **CORS et redirection** : les origines de `Cors:AllowedOrigins` sont distinctes des URI de redirection SPA. La production contient une URI déclarée dans le code, mais l'URI réellement déployée reste à confirmer ; les autres environnements n'ont pas de valeur fournie.
5. **Configuration MSAL** : le frontend lit `VITE_AZURE_CLIENT_ID`, `VITE_AZURE_TENANT_ID`, `VITE_AZURE_REDIRECT_URI`; les identifiants client/tenant du stockage local peuvent prévaloir sur ceux d'environnement.
6. **Variable d'exemple non exploitée** : `VITE_GRAPH_SCOPES` apparaît dans `.env.example`, mais les scopes Graph sont définis en code dans le MSAL examiné ; cette variable d'exemple n'est pas consommée par ce flux.
7. **Configuration backend additionnelle** : `Instance` est présent dans `appsettings.json`. Le code construit explicitement son `validIssuer` avec le tenant et l'URL de connexion Microsoft ; les clés des métadonnées Entra assurent la validation de signature. Les champs configurés restent vides dans le fichier suivi.

### Points restant à confirmer

Inscriptions et propriétaires SPA/API, tenant, Client IDs, Application ID URI, audience réelle, scope API exposé, préautorisation SPA, consentement, version d'access token configurée, URI/origines par environnement, permissions Graph autorisées, credential/backend secret store, rotation, scopes OBO, environnement et ressources de test.

## D. Matrice des permissions Graph

Les permissions ci-dessous sont celles déclarées ou demandées dans le frontend observé. Elles ne constituent pas une recommandation pour l'inscription API. Consentement accordé et capacité effective ne sont pas prouvés par le code.

| Permission Graph | Type | Application concernée | Opération / endpoint Graph observé | Justification | Consentement requis | Consentement accordé | Capacité effective |
|---|---|---|---|---|---|---|---|
| `User.Read` | Déléguée | SPA frontend | Profil : `GET /me` | Affichage du profil connecté | À confirmer selon la permission et la politique du tenant | À confirmer | Appel frontend présent ; appel réel non validé. Aucune opération backend correspondante. |
| `Calendars.Read` | Déléguée | SPA frontend | Calendrier : `GET /me/calendarView` | Afficher les événements/réunions de l'utilisateur | À confirmer selon la permission et la politique du tenant | À confirmer | Appel frontend présent ; appel réel non validé. Aucune opération backend correspondante. |
| `OnlineMeetings.Read` | Déléguée | SPA frontend | Résolution : `GET /me/onlineMeetings`, et parcours invité éventuel `GET /users/{organizer}/onlineMeetings` | Résoudre la réunion Teams | À confirmer selon la permission et la politique du tenant | À confirmer | Appel frontend présent ; appel réel non validé. Aucune opération backend correspondante. |
| `OnlineMeetingTranscript.Read.All` | Déléguée | SPA frontend | Métadonnées `/me/onlineMeetings/{id}/transcripts` ou `/users/{organizer}/onlineMeetings/{id}/transcripts`, puis routes `/content` correspondantes | Découvrir et lire une transcription | Le code et la documentation projet indiquent un consentement administrateur requis ; confirmer dans le tenant | À confirmer | Appels frontend présents ; consentement, politique Teams et accès réel à une réunion non validés. Aucune opération backend correspondante. |
| Aucune permission OBO déterminée | Déléguée si une opération backend est approuvée ; aucune permission applicative recommandée | API backend | Aucune opération ni route Graph backend raccordée | Pas de besoin OBO justifié par une opération serveur actuelle | Indéterminable avant définition des endpoints et permissions minimales | Aucune preuve de consentement backend | `Graph:Scopes` est vide par défaut ; aucun échange OBO ni accès Graph backend démontré. |

La liste des opérations Graph frontend est issue de `src/services/graphClient.ts` et `src/services/transcriptService.ts`. Toute permission OBO future doit être liée à une opération backend effectivement décidée, à son endpoint Graph et à une justification de moindre privilège.

## E. Vérification des environnements

| Paramètre | Disponibilité observée | État DSI |
|---|---|---|
| Tenant ID | Valeurs runtime absentes du dossier ; une ancienne constante frontend ne prouve pas l'inscription API active. | À confirmer par la DSI pour chaque environnement. |
| Client ID SPA / API | Aucun Client ID vérifié pour les inscriptions visées. | À confirmer par la DSI. |
| Application ID URI / audience | Aucune valeur réelle vérifiée ; `aud` est exigé strictement. | À confirmer par inscription et token d'essai autorisé. |
| Scope API | Le code consomme `VITE_READMEETING_API_SCOPE` et `AzureAd:RequiredScope`, mais aucun nom/valeur d'application n'est établi. | À confirmer par la DSI et l'équipe API. |
| URI de redirection | URI de production et chemin par environnement présents dans le code ; déploiements réels non vérifiés. | À confirmer par la DSI par environnement. |
| Origines CORS / URL API | `Cors:AllowedOrigins` requis ; URL frontend API vient de `VITE_READMEETING_API_BASE_URL`, mais aucune valeur runtime confirmée. | À confirmer par la DSI exploitation. |
| `AzureAd:AllowedClientId` | Contrôle d'appel configuré, Client ID réel inconnu. | À confirmer par la DSI. |
| Permissions Graph / consentements | Scopes SPA déclarés ; aucun consentement effectif constaté. Liste OBO absente. | À confirmer par administrateur Entra et DSI sécurité. |
| Credential et coffre | Aucun secret/certificat ni mécanisme backend configuré dans le code inspecté. | Choix, référence et responsable de rotation à confirmer par la DSI. |
| Développement local, recette, production | Pas de triplet de configuration validé. | Champs conservés « À confirmer par la DSI » dans la fiche. |

La fiche décline séparément les paramètres applicables à chaque environnement. Aucun paramètre n'est inventé.

## F. Vérification de sécurité

Le fichier `.env.example` a été examiné en lecture seule. Une entrée commentée présente une chaîne non vide au format ressemblant à un credential, sans marqueur évident de placeholder. Sa nature reste invérifiable : **« Nature de la valeur non vérifiable »**. Sa valeur n'est ni reproduite, ni recopiée dans un autre document ou un terminal.

Recommandation : la DSI/propriétaire vérifie l'origine et l'usage de cette entrée par un canal sécurisé. Si elle correspond à un credential réel, le traiter comme exposé et appliquer la procédure DGF de révocation/rotation. Aucun fichier d'environnement n'a été modifié.

Risques techniques restant à traiter avant exploitation : credential OBO non configuré, OBO non raccordé à une route, scopes Graph backend non approuvés, cache de token mémoire uniquement et valeurs d'environnement Entra non renseignées/validées.

## G. Traçabilité des preuves

### Références locales disponibles

- Le rapport `docs/implementation/LOT_1_RAPPORT_IMPLEMENTATION.md` consigne les résultats antérieurs : 11 tests d'intégration backend locaux réussis avec clé synthétique, plus les vérifications frontend de régression.
- `backend/tests/ReadMeeting.Api.Tests/AuthenticationIntegrationTests.cs` contient les cas synthétiques de token valide, token absent/malformé, signature invalide, expiration, audience/issuer incorrects, scope/client/tenant refusés, isolation du contexte, absence de fuite du bearer dans les logs et CORS.
- Ces éléments prouvent seulement les comportements locaux utilisant des données de test.

### Preuves manquantes

Aucune capture administrative Entra, fiche approuvée, ticket de consentement, vrai token DGF, échange OBO, appel Graph backend, request-id Graph ou rapport de test réel n'est disponible. Les documents exigent désormais une référence de preuve non sensible pour chaque exécution, sans token, secret, clé privée, assertion OBO ou transcript.

## H. Inventaire des modifications

### Modifiés par cette consolidation

- `docs/administration/00_RAPPORT_PREPARATION_ENTRA_DGF.md`
- `docs/administration/ENTRA_GUIDE_ADMINISTRATEUR_DGF.md`
- `docs/administration/ENTRA_FICHE_PARAMETRES_DGF.md`
- `docs/administration/ENTRA_PLAN_VALIDATION_DGF.md`
- `docs/administration/NOTE_TRANSMISSION_ADMINISTRATEUR_DGF.md`

### Créé par cette consolidation

- `docs/administration/01_RAPPORT_CONSOLIDATION_ENTRA_DGF.md`

### Fichiers vérifiés mais non modifiés

- `backend/src/ReadMeeting.Api/Program.cs`
- `backend/src/ReadMeeting.Api/appsettings.json`
- `backend/src/ReadMeeting.Api/Security/GraphOnBehalfOfTokenProvider.cs`
- `backend/src/ReadMeeting.Api/ReadMeeting.Api.csproj`
- `src/services/apiClient.ts`
- `src/config/msalConfig.ts`
- `src/services/graphClient.ts`
- `src/services/transcriptService.ts`
- `backend/tests/ReadMeeting.Api.Tests/AuthenticationIntegrationTests.cs`
- `.env.example` (lu en lecture seule pour classifier une entrée ; valeur non reproduite)
- `.env.local` (contenu non consulté)

### Hors périmètre, non modifié par cette mission

Le code source, les fichiers de configuration et `.env`, les documents de conception, les inscriptions Entra, permissions et consentements n'ont pas été modifiés. Le statut Git initial montrait déjà plusieurs fichiers modifiés et non suivis, dont `.env.example` et les projets/dossiers Lot 1 ; ils ont été préservés et ne sont pas attribués à cette consolidation.

## I. Conclusion et décision

### Décision : Non prêt à transmettre comme dossier sans réserve — vérification sécurité préalable nécessaire

La cohérence technique et documentaire est améliorée, et les documents ne contiennent pas la valeur suspecte. Cependant, le fichier d'exemple du dépôt présente une chaîne non-placeholder au format credential, dont l'authenticité n'est pas vérifiable. La DSI/propriétaire doit effectuer la vérification et déterminer si une révocation/rotation est requise avant d'attester que le dépôt est exempt de credential exposé.

Le dossier administratif peut être envoyé à la DSI séparément, via le canal approuvé, sans joindre le fichier `.env.example` ni divulguer sa valeur, afin de déclencher cette vérification. La fiche de paramètres et les tests réels restent incomplets jusqu'aux décisions Entra et aux raccordements techniques.

**État du Lot 1 : non clôturé.** Il n'y a pas de validation réelle de token Entra DGF, d'échange OBO ou d'accès Graph backend. Le Lot 2 n'a pas commencé et ne doit pas commencer sans validation explicite du responsable du projet.
