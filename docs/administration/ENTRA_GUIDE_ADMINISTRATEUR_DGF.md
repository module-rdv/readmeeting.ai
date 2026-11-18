# Guide administrateur — Microsoft Entra ID DGF

## 1. Objet et état initial

Ce guide prépare la configuration Entra nécessaire à l'authentification de l'API ReadMeeting.ai et à une validation OBO ultérieure. Il décrit le code présent dans le dépôt ; il ne signifie pas que les applications, permissions ou consentements sont déjà configurés dans le tenant.

L'API valide les jetons v2 pour un tenant unique : issuer exact `https://login.microsoftonline.com/{TenantId}/v2.0`, audience exacte configurée et durée de validité. Sa politique `ApiUser` vérifie également `tid`, `oid`, le scope dans `scp` et l'identifiant client dans `azp` ou `appid`. L'unique endpoint protégé actuellement raccordé est `GET /api/v1/security/context`.

Le frontend conserve son accès Microsoft Graph direct. Il dispose en outre d'un client API séparé qui demande un token de l'API ReadMeeting.ai. Le fournisseur OBO du backend est présent, mais aucun endpoint ne l'appelle, aucun appel Graph backend n'est raccordé et aucun échange OBO réel n'a été validé.

## A. Préparation

### Prérequis et responsabilités

- Un administrateur Microsoft 365 / Entra ID habilité à examiner les inscriptions, API permissions et consentements concernés.
- Un responsable DGF/DSI sécurité pour approuver le moindre privilège, le périmètre du tenant, les permissions Graph et le mode de credential serveur.
- Un environnement de test autorisé, une identité DGF de test et des réunions de test accessibles pour les validations qui toucheront Microsoft Graph.
- Un responsable technique pour associer les identifiants confirmés aux environnements d'exécution sans les inscrire dans Git.

Le consentement doit être accordé par un administrateur autorisé par la politique DGF pour les permissions demandées. Le rôle exact requis dépend des permissions et des règles du tenant : le confirmer dans le portail et ne pas accorder de privilèges plus élevés que nécessaire.

### Vérifications avant toute création

1. Rechercher l'inscription SPA réellement utilisée par le déploiement et confirmer son Client ID, son tenant, ses propriétaires et ses URI de redirection.
2. Rechercher une inscription API ReadMeeting.ai existante, son Application ID URI, ses scopes exposés et ses permissions. Ne pas créer de doublon si une inscription réutilisable existe.
3. Vérifier si l'inscription API et l'inscription SPA sont distinctes. Le code est configuré pour distinguer `AzureAd:ClientId` (API) et `AzureAd:AllowedClientId` (client SPA autorisé) ; toute inscription commune ou atypique doit être examinée avec l'équipe technique avant modification.
4. Vérifier que les valeurs de configuration du déploiement correspondent bien aux inscriptions ciblées. Le MSAL du frontend peut privilégier des identifiants enregistrés dans le stockage local du navigateur aux valeurs d'environnement.
5. Ne pas traiter la présence d'un scope dans le code ou dans un fichier modèle comme une preuve de consentement ou d'accès effectif.

## B. Application cliente SPA

### Valeurs et comportement observés

Le MSAL existant lit `VITE_AZURE_CLIENT_ID`, `VITE_AZURE_TENANT_ID` et `VITE_AZURE_REDIRECT_URI`. Les identifiants client et tenant enregistrés dans le stockage local du navigateur peuvent prévaloir sur les variables d'environnement. L'URI de redirection d'environnement est utilisée lorsqu'elle est valide.

Le code déclare l'URI de production `https://readmeeting-ai-dgf.ai.studio/redirect.html` et utilise, pour un autre environnement actif, le chemin `/redirect.html` sur l'origine de cet environnement. L'administrateur doit confirmer les URI effectivement déployées ; une URI n'est pas à ajouter sur la seule base de ce guide.

Le code frontend demande actuellement à Microsoft Graph les permissions déléguées suivantes :

- `User.Read` pour le profil utilisateur ;
- `Calendars.Read` pour les calendriers ;
- `OnlineMeetings.Read` pour les réunions en ligne ;
- `OnlineMeetingTranscript.Read.All` pour le scénario de lecture des transcriptions.

Ces permissions sont demandées par le client Graph du navigateur. Leur présence dans le code ne prouve ni le consentement, ni l'accès à une réunion donnée. Le code et la documentation de projet indiquent que `OnlineMeetingTranscript.Read.All` nécessite un consentement administrateur ; les exigences effectives des autres permissions doivent être confirmées dans le tenant DGF.

### Opérations à vérifier dans Entra

- Inscription de type application monopage (SPA) pour le client utilisé par MSAL.
- URI de redirection de type SPA exactes pour chaque environnement autorisé ; confirmer notamment l'URI de production ci-dessus.
- Paramètres d'authentification et origines/URLs autorisées cohérents avec l'hébergement réel. Les URI de redirection Entra et les origines CORS de l'API sont deux réglages distincts.
- Permission déléguée vers le scope de l'API ReadMeeting.ai décrit en section C, si l'inscription API est confirmée.
- Permissions Graph déléguées demandées par l'application cliente existante, limitées aux besoins réellement validés.
- Consentement applicable selon la politique DGF. Pour la permission de transcript, vérifier explicitement le consentement administrateur.

Le fichier `.env.example` contient aussi `VITE_GRAPH_SCOPES`, mais le MSAL consulté construit actuellement ses scopes Graph en code ; cette variable d'exemple n'est pas la source utilisée par `msalConfig.ts`.

## C. Application API ReadMeeting.ai

### Vérifier ou créer une inscription

1. Vérifier d'abord si une inscription API ReadMeeting.ai existe et peut être réutilisée.
2. Si aucune inscription adéquate n'existe, faire valider par DSI/sécurité la création d'une seule inscription d'API, distincte du client SPA, avant toute création.
3. Confirmer le tenant, les propriétaires, les types de comptes autorisés et l'usage de l'API comme ressource déléguée.
4. Confirmer son Client ID, qui alimente `AzureAd:ClientId` côté backend.

### Exposer et autoriser le scope API

- Exposer un scope **délégué** dans l'inscription API. Son nom exact reste à définir et doit être communiqué à l'équipe technique ; ne pas le déduire d'un exemple.
- Autoriser explicitement le Client ID SPA confirmé à demander ce scope (préautorisation du client dans l'inscription API, si retenue par DGF) et déclarer la permission déléguée correspondante dans l'inscription SPA.
- Faire accorder le consentement demandé par un administrateur habilité conformément à la politique du tenant.
- Le code compare `AzureAd:RequiredScope` à la valeur de scope portée par le claim `scp`. Le frontend, lui, demande le scope complet configuré pour l'API dans `VITE_READMEETING_API_SCOPE`. Ces deux paramètres n'ont donc pas le même format : faire valider leur correspondance par l'équipe technique avant mise en production.

### Application ID URI, audience et version du jeton

- Définir ou confirmer l'Application ID URI de l'inscription API ; ne pas inventer ni modifier sa valeur sans coordination technique.
- Le backend compare strictement le claim `aud` à `AzureAd:Audience`. L'audience à fournir est donc la valeur exacte attendue dans le jeton d'accès v2 émis pour cette API.
- Ne pas supposer que l'Application ID URI et le claim `aud` sont identiques. La valeur de `aud` doit être vérifiée sur un véritable jeton d'accès destiné à l'API, dans un environnement autorisé, puis rapprochée de la configuration de l'inscription et du backend. Ne jamais transmettre ni archiver le jeton lui-même.
- Confirmer que l'inscription émet des access tokens v2 (`requestedAccessTokenVersion` égal à 2 dans le manifeste, si ce réglage est fait par manifeste). Le backend exige l'issuer v2 exact construit à partir de `AzureAd:TenantId`; il ne vérifie pas séparément un claim `ver` dans sa politique personnalisée. Le claim `ver` peut être consigné comme preuve diagnostique non secrète, mais l'issuer v2 exact est le contrôle d'issuer mis en œuvre.

### Autoriser l'application cliente

Confirmer que le scope API est déclaré comme permission déléguée côté SPA et que le Client ID de cette SPA correspond exactement à `AzureAd:AllowedClientId`. La politique backend compare cette valeur au claim `azp`, ou au claim `appid` si `azp` est absent. Une autorisation Entra ne remplace pas ce contrôle dans l'API, et ce contrôle API ne remplace pas le consentement Entra.

## D. Permissions Microsoft Graph pour OBO

### État exact dans le dépôt

`Graph:Scopes` est une liste vide par défaut. `GraphOnBehalfOfTokenProvider` transmet les scopes configurés à `GetAccessTokenForUserAsync`, mais aucun endpoint n'utilise actuellement ce fournisseur et aucun appel Microsoft Graph n'est raccordé dans le backend. Il n'existe donc pas encore de liste de permissions OBO backend confirmée, ni de preuve qu'une permission OBO précise est nécessaire au code serveur livré.

Les permissions actuellement utilisées côté frontend ne doivent pas être recopiées automatiquement dans l'inscription API :

| Permission déléguée observée côté SPA | Besoin frontend documenté | Conclusion OBO backend actuelle |
|---|---|---|
| `User.Read` | Lecture du profil par le frontend | À ajouter seulement si un endpoint backend futur appelle effectivement Graph pour le profil utilisateur. |
| `Calendars.Read` | Lecture du calendrier par le frontend | À évaluer si la lecture du calendrier est transférée à un endpoint backend. |
| `OnlineMeetings.Read` | Lecture/résolution des réunions en ligne par le frontend | À évaluer avec les endpoints backend réellement retenus. |
| `OnlineMeetingTranscript.Read.All` | Lecture de transcriptions par le frontend ; le projet indique qu'un consentement administrateur est requis | À évaluer pour un scénario de lecture de transcript backend et à faire approuver explicitement. |

Avant d'ajouter une permission Graph à l'API :

1. établir la liste des opérations Graph que le backend exécutera réellement et les endpoints Graph correspondants ;
2. déterminer la permission déléguée minimale requise pour chacune, en tenant compte de l'identité utilisateur et des restrictions de réunion ;
3. faire approuver cette liste par DGF/DSI sécurité ;
4. ajouter uniquement ces permissions **déléguées** à l'inscription API et demander le consentement administrateur lorsqu'il est exigé par la permission ou la politique DGF.

Aucune permission applicative Graph n'est demandée pour le scénario OBO délégué décrit ici. Les permissions SharePoint et les futurs traitements métiers ne font pas partie de cette configuration.

## E. Credential confidentiel du backend

L'OBO nécessite une application backend confidentielle. Le code actuel ne contient ni certificat, ni secret client, ni nom de variable de credential configuré. Le mode d'injection et le paramétrage du client confidentiel restent donc à définir ; ne pas en déduire une clé de configuration non présente dans le dépôt.

### Options à arbitrer par DGF

1. **Certificat** — option à privilégier si la politique DGF le permet. La clé privée doit rester dans un coffre de secrets ou un HSM/mécanisme serveur approuvé ; seule l'identité et la référence du certificat sont configurées pour l'application.
2. **Secret client** — uniquement si explicitement autorisé par DGF. Le secret doit être créé dans Entra par un administrateur habilité et injecté directement dans le backend via un gestionnaire de secrets approuvé. Ne pas le transmettre par courriel ordinaire, document, canal non approuvé, variable `VITE_*` ou dépôt Git.

Le credential n'est pas une donnée à communiquer dans la fiche de paramètres : communiquer uniquement la méthode retenue, le propriétaire et la référence/emplacement sécurisé, via le canal approuvé. Définir avant activation le responsable de rotation, la fréquence selon la politique DGF, la procédure de chevauchement/renouvellement et la procédure de révocation immédiate en cas de suspicion.

Le cache de tokens configuré dans le code est en mémoire. Il convient au test local/pilote mono-instance, mais doit être réévalué avant exploitation multi-instance.

## F. Configuration des environnements

Les valeurs sont volontairement absentes de ce guide. Les clés backend ci-dessous sont celles lues dans `Program.cs`/`appsettings.json`. Les valeurs publiques SPA ne sont pas des secrets, mais doivent tout de même être confirmées pour l'environnement ciblé.

| Paramètre exact | Application concernée et rôle | Origine de la valeur | Public/confidentiel | Responsable |
|---|---|---|---|---|
| `AzureAd:TenantId` | Backend ; tenant attendu, issuer v2 et comparaison du claim `tid` | Tenant ID confirmé par l'administrateur DGF | Public (identifiant) | Administrateur Entra |
| `AzureAd:ClientId` | Backend ; Client ID de l'inscription API fourni à Microsoft.Identity.Web | Inscription API réutilisée ou créée et confirmée | Public (identifiant) | Administrateur Entra |
| `AzureAd:AllowedClientId` | Backend ; Client ID SPA autorisé, comparé à `azp`/`appid` | Inscription SPA réellement utilisée | Public (identifiant) | Administrateur Entra |
| `AzureAd:Audience` | Backend ; égalité stricte avec le claim `aud` du token API v2 | À confirmer depuis l'inscription et un vrai token de test API ; ne pas l'assimiler automatiquement à l'Application ID URI | Public (identifiant d'audience) | Administrateur Entra + équipe API |
| `AzureAd:RequiredScope` | Backend ; valeur de scope attendue dans le claim `scp` | Scope délégué API exposé et confirmé | Public (identifiant de permission) | Administrateur Entra + équipe API |
| `Cors:AllowedOrigins` | Backend ; liste d'origines frontend autorisées par CORS | Origines exactes des déploiements autorisés ; HTTPS requis sauf localhost HTTP en développement | Public | DSI exploitation + équipe API |
| `Graph:Scopes` | Backend ; scopes Graph délégués passés au fournisseur OBO | Liste minimale approuvée après définition des appels Graph backend ; vide par défaut | Identifiants publics, mais permissions sensibles | DGF/DSI sécurité + administrateur Entra |
| `VITE_READMEETING_API_SCOPE` | SPA ; scope complet demandé à MSAL pour le token ReadMeeting API | Scope API exposé, préautorisation et configuration SPA confirmés | Public dans le bundle | Administrateur Entra + équipe frontend |
| `VITE_READMEETING_API_BASE_URL` | SPA ; origine de l'API appelée avec le bearer API | URL de déploiement de l'API approuvée | Public | DSI exploitation + équipe frontend |
| `VITE_AZURE_CLIENT_ID` | SPA ; Client ID de l'application cliente MSAL | Inscription SPA existante confirmée | Public (identifiant) | Administrateur Entra |
| `VITE_AZURE_TENANT_ID` | SPA ; autorité tenant MSAL | Tenant DGF confirmé | Public (identifiant) | Administrateur Entra |
| `VITE_AZURE_REDIRECT_URI` | SPA ; URI de retour MSAL | URI exacte de l'environnement et chemin `/redirect.html` validés | Public | DSI exploitation + administrateur Entra |

Les variables `VITE_*` sont incorporées au bundle frontend : elles ne doivent contenir aucun secret, certificat, clé privée ou credential confidentiel. Le credential backend n'a actuellement aucun paramètre nommé configuré dans le code.

Le dépôt contient `VITE_GRAPH_SCOPES` dans le fichier exemple, mais le MSAL courant définit ses scopes Graph dans le code ; ne pas utiliser cette variable comme preuve de la configuration effective. `.env.local` n'a pas été consulté.

## G. Validation administrative — checklist ordonnée

| Ordre | Action Entra / DGF | Résultat attendu |
|---|---|---|
| 1 | Identifier les inscriptions SPA et API existantes, leurs propriétaires, leurs Client IDs et leur tenant. | Les deux identités applicatives sont confirmées et aucun doublon n'est créé. |
| 2 | Confirmer l'inscription SPA, son type de plateforme, chaque URI de redirection déployée et son Client ID effectif. | Le MSAL de l'environnement peut utiliser l'inscription SPA attendue ; les URI correspondent exactement. |
| 3 | Confirmer ou créer, après vérification, l'inscription API et son Application ID URI. | Une seule inscription API approuvée est la ressource des tokens ReadMeeting. |
| 4 | Exposer un scope délégué API et communiquer sa valeur de scope ainsi que son identifiant complet à l'équipe technique. | `scp` correspondra à `AzureAd:RequiredScope` et le scope demandé par SPA sera configuré dans `VITE_READMEETING_API_SCOPE`. |
| 5 | Préautoriser/autoriser le Client ID SPA pour le scope API et déclarer cette permission déléguée dans l'inscription cliente ; appliquer le consentement requis par DGF. | La SPA peut demander un access token destiné à l'API et le Client ID présenté correspond au contrôle `AllowedClientId`. |
| 6 | Régler/confirmer la version d'access token v2 pour l'API. | Le token de test porte la version v2 et l'issuer correspond au format exact accepté par l'API. |
| 7 | Dans un environnement autorisé, obtenir un token pour l'API et vérifier de manière sûre `iss`, `aud`, `tid`, `ver`, `scp`, `azp`/`appid`, sans conserver le token. | Les claims observés déterminent les valeurs exactes de tenant, audience, scope et client autorisé à configurer. |
| 8 | Définir avec DGF/DSI le périmètre des opérations Graph qui seront effectuées côté serveur et les permissions déléguées minimales. | Aucune permission n'est copiée depuis la SPA sans besoin backend approuvé ; aucun droit applicatif n'est ajouté au flux délégué. |
| 9 | Si OBO est autorisé, ajouter les permissions Graph déléguées retenues à l'inscription API et faire accorder leur consentement par l'administrateur habilité. | Les permissions effectives correspondent à la matrice approuvée et le consentement est visible dans le tenant. |
| 10 | Choisir le certificat ou, si explicitement approuvé, le secret client ; définir coffre, accès, rotation et révocation. | Credential accessible uniquement au backend via le mécanisme serveur DGF ; aucune valeur n'est transmise dans un document/courriel/Git. |
| 11 | Communiquer les paramètres non secrets par le canal approuvé ; installer le credential directement dans le mécanisme sécurisé serveur. | L'équipe peut remplir la fiche de paramètres sans recevoir ni enregistrer le secret lui-même. |
| 12 | Confirmer les origines frontend pour `Cors:AllowedOrigins`, distinctement des URI de redirection MSAL. | Seules les origines exactes autorisées sont déclarées, en HTTPS hors développement localhost. |
| 13 | Exécuter le plan de validation de `ENTRA_PLAN_VALIDATION_DGF.md` en environnement de test. | Les cas d'authentification négatifs et positifs sont tracés ; OBO/Graph ne sont déclarés réussis qu'après un véritable échange et appel autorisé. |

La configuration Entra ne rend pas à elle seule l'OBO opérationnel : l'endpoint/API Graph backend nécessaire aux tests 6 et 7 reste à implémenter/raccorder et devra faire l'objet d'une validation technique distincte.

## H. Documents associés et état des validations

- [Fiche de paramètres à renseigner](./ENTRA_FICHE_PARAMETRES_DGF.md) — champs séparés par environnement, permissions Graph et références de preuve.
- [Plan de validation Entra/OBO](./ENTRA_PLAN_VALIDATION_DGF.md) — état local synthétique, prérequis, blocages et preuves attendues pour chaque test.
- [Note de transmission à la DSI](./NOTE_TRANSMISSION_ADMINISTRATEUR_DGF.md) — demande et livrables attendus.
- [Rapport de préparation](./00_RAPPORT_PREPARATION_ENTRA_DGF.md) — constats et statut de la mission documentaire.
- [Rapport de consolidation](./01_RAPPORT_CONSOLIDATION_ENTRA_DGF.md) — revue croisée, écarts et conclusion de transmission.

Les tests d'intégration locale à jetons synthétiques sont distincts des tests avec de vrais jetons du tenant DGF. Aucun consentement, échange OBO ou accès Graph backend réel n'est attesté ; les tests OBO/Graph restent bloqués par l'absence de parcours serveur raccordé.
