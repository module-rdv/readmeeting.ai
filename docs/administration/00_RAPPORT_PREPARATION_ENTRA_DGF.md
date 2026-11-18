# Rapport de préparation Entra ID DGF

## Statut

**Dossier administratif préparé ; aucune opération Entra n'a été réalisée.**

Cette mission est documentaire uniquement. Aucun code, fichier de configuration, fichier `.env`, document de conception, inscription Entra, permission, consentement ou ressource Azure n'a été modifié. Aucun test réel Entra, OBO ou Graph n'a été exécuté. Le Lot 2 n'est pas commencé.

## Livrables créés

- `docs/administration/ENTRA_GUIDE_ADMINISTRATEUR_DGF.md` — guide opératoire par application, permissions, credential et configuration.
- `docs/administration/ENTRA_FICHE_PARAMETRES_DGF.md` — fiche de paramètres à compléter sans credential.
- `docs/administration/ENTRA_PLAN_VALIDATION_DGF.md` — prérequis, procédures, résultats attendus, état de réalisabilité, preuves et responsables pour les huit tests demandés.
- `docs/administration/NOTE_TRANSMISSION_ADMINISTRATEUR_DGF.md` — note de transmission à la DSI / administration Entra.
- `docs/administration/00_RAPPORT_PREPARATION_ENTRA_DGF.md` — présent rapport.
- `docs/administration/01_RAPPORT_CONSOLIDATION_ENTRA_DGF.md` — rapport de revue croisée et consolidation finale.

## Paramètres vérifiés dans le code

### Backend

- `AzureAd:TenantId`, `AzureAd:ClientId`, `AzureAd:AllowedClientId`, `AzureAd:Audience` et `AzureAd:RequiredScope` sont lus par `Program.cs` et les valeurs nécessaires doivent être renseignées pour démarrer.
- `AzureAd:TenantId` construit l'issuer v2 mono-tenant ; le claim `tid` est aussi comparé au tenant configuré.
- `AzureAd:Audience` est comparé strictement au claim `aud`.
- `AzureAd:RequiredScope` est recherché dans les valeurs séparées par espaces du claim `scp`.
- `AzureAd:AllowedClientId` est comparé à `azp`, ou `appid` si `azp` est absent.
- `AzureAd:ClientId` est passé à Microsoft.Identity.Web comme configuration de l'inscription API.
- `Cors:AllowedOrigins` est obligatoire et limité aux origines HTTPS ; HTTP est permis uniquement pour localhost/127.0.0.1 en développement.
- `Graph:Scopes` est vide par défaut et transmis par `GraphOnBehalfOfTokenProvider` à l'acquisition de token délégué.
- `appsettings.json` ne contient pas de credential confidentiel.
- Le seul endpoint API protégé actuellement raccordé est `GET /api/v1/security/context`. Le contexte `tid`/`oid` provient des claims validés, non d'une valeur client.

### Frontend et MSAL

- Le client API utilise `VITE_READMEETING_API_SCOPE` pour demander un token API et `VITE_READMEETING_API_BASE_URL` pour déterminer l'origine ciblée.
- Le MSAL existant utilise `VITE_AZURE_CLIENT_ID`, `VITE_AZURE_TENANT_ID`, `VITE_AZURE_REDIRECT_URI`. Les Client ID et tenant enregistrés dans le stockage local peuvent prévaloir sur leurs valeurs d'environnement.
- L'URI de production présente dans le code est `https://readmeeting-ai-dgf.ai.studio/redirect.html`; les autres origines actives utilisent le chemin `/redirect.html` et doivent être confirmées pour chaque déploiement.
- Les scopes Graph actuellement demandés côté frontend sont `User.Read`, `Calendars.Read`, `OnlineMeetings.Read` et `OnlineMeetingTranscript.Read.All`. Leur présence ne prouve pas un consentement ou des droits effectifs.
- `VITE_GRAPH_SCOPES` apparaît dans le fichier exemple, mais le MSAL courant définit les scopes Graph en code et ne lit pas cette variable.
- Les variables `VITE_*` sont publiques dans le bundle et ne conviennent jamais à un credential confidentiel.

## Paramètres restant à confirmer

Tenant DGF, inscriptions SPA et API existantes, Client IDs, Application ID URI, audience réelle du token v2, nom/valeur du scope API, version de token, URI de redirection par environnement, origines CORS, préautorisation et consentement SPA, permissions Graph déléguées OBO, consentement administrateur, méthode et coffre du credential backend, scopes OBO approuvés et ressources de test.

Aucune valeur n'a été inventée. Une valeur de tenant présente dans une configuration frontend préexistante ne démontre ni l'inscription API active ni l'état actuel du tenant et n'est pas présentée comme une valeur confirmée.

## Ambiguïtés et blocages techniques

1. **Application ID URI vs audience** — le backend exige la valeur exacte de `aud`. Elle ne doit pas être déduite automatiquement de l'Application ID URI ; l'administrateur et l'équipe API doivent confronter l'inscription avec un véritable token v2 obtenu en environnement autorisé.
2. **Scope demandé vs claim `scp`** — le frontend demande un identifiant complet de scope API ; le backend compare la valeur du scope présente dans `scp`. Le nom exact et la correspondance doivent être confirmés après création/validation du scope.
3. **Permissions Graph OBO** — aucun appel Graph backend n'est raccordé et `Graph:Scopes` est vide. Aucune permission OBO précise ne peut être présentée comme nécessaire ou approuvée actuellement. Définir les appels backend avant de retenir un sous-ensemble des permissions Graph frontend.
4. **OBO non activable par la configuration seule** — le fournisseur existe, mais aucun endpoint ne l'appelle ; le code ne configure ni credential confidentiel ni permissions réelles. Un vrai test OBO nécessite ces éléments et un parcours serveur effectivement raccordé.
5. **Graph backend absent** — le test d'accès Graph à une réunion ne peut pas être exécuté par le code actuel ; il demandera l'implémentation/raccordement d'un endpoint backend autorisé. Un test Graph direct du frontend n'est pas une preuve d'OBO.
6. **Cache de tokens** — cache mémoire actuellement configuré, à revoir avant un déploiement multi-instance.
7. **Fichier d'exemple d'environnement** — le fichier modèle inspecté contient une chaîne non vide au format ressemblant à un credential et sans marqueur évident de placeholder. Sa nature reste invérifiable sans validation du propriétaire : elle n'est pas déclarée fictive ni réelle et n'est pas reproduite. La DSI/propriétaire doit la vérifier ; si elle correspond à un credential réel, le traiter comme exposé et appliquer la procédure DGF de révocation/rotation. Aucun fichier d'environnement n'a été modifié.

## Actions attendues de l'administrateur

1. Renseigner la fiche avec les valeurs non secrètes confirmées et les responsables.
2. Vérifier les inscriptions existantes et leurs propriétaires avant toute création ou modification.
3. Confirmer le scope API et autoriser le client SPA ; accorder le consentement applicable.
4. Confirmer les permissions Graph déléguées minimales après validation du scénario backend, puis accorder le consentement administrateur requis.
5. Faire approuver le credential confidentiel, le coffre, les accès et le cycle de rotation ; ne jamais communiquer la valeur du credential.
6. Confirmer les origines CORS et les URI de redirection exactes par environnement.
7. Planifier, avec l'équipe technique, les validations réelles décrites dans le plan après raccordement des parcours backend nécessaires.

## Conditions de validation réelle du Lot 1

- Un token v2 réellement émis par Entra pour l'API DGF passe la validation de signature, issuer, audience, durée, tenant, client appelant et scope.
- Les refus 401/403 sont confirmés sur un environnement autorisé ; le contexte utilisateur est dérivé exclusivement des claims validés.
- Le frontend obtient le bon token API, distinct du token Graph, sans régression de son usage Graph existant.
- Si le Lot 1 inclut la validation OBO, le backend réalise un échange OBO véritable avec les permissions approuvées et le credential sécurisé ; aucune simulation ne suffit.
- Les erreurs ne divulguent ni token, ni credential, ni assertion OBO dans les réponses ou journaux.
- Les appels Graph métier restent hors périmètre actuel ; le test d'accès à une réunion est conditionné au raccordement d'une opération backend approuvée.

### Distinction explicite de fin

1. **Implémentation locale déjà réalisée :** configuration JWT/API, politique de contexte, acquisition frontend d'un token API distinct et fournisseur OBO préparé ; tests locaux synthétiques précédemment documentés dans le rapport du Lot 1.
2. **Configuration Entra restant à effectuer :** confirmation des inscriptions, valeurs, scope API, autorisations, consentements, origines et credential serveur.
3. **Tests réels restant à exécuter :** émission/validation d'un token DGF, contrôles d'audience/scope/client/contexte, échange OBO réel et accès Graph autorisé après raccordement backend. Aucun de ces tests réels n'a été effectué dans cette mission.

Le Lot 1 demeure non clôturé jusqu'à réalisation des validations applicables et approbation du responsable du projet. Aucun travail du Lot 2 ne doit débuter sans validation explicite.

## Consolidation documentaire — 15 novembre 2026

Une revue croisée des cinq documents administratifs a été effectuée à partir du code actuel, sans prendre les documents précédents comme preuve d'implémentation. Les corrections apportées :

- la fiche distingue désormais développement local, test/recette et production, avec responsables, statut et colonne « Preuve / Référence » ;
- la fiche ajoute une matrice Graph qui sépare permissions demandées par le frontend, consentement inconnu et capacité OBO backend absente ;
- le plan indique pour chaque test ce qui est déjà couvert par les tests synthétiques, ce qui requiert une validation Entra et ce qui est bloqué faute de route OBO/Graph ;
- le guide clarifie que le code impose l'issuer v2 exact sans vérifier séparément le claim `ver`, et contient des liens vers les documents associés ;
- la note de transmission référence explicitement le guide, la fiche et le plan, et énumère les livrables attendus de la DSI ;
- la vérification en lecture seule de l'entrée d'environnement a classé sa forme comme non placeholder évident, mais conclut « Nature de la valeur non vérifiable ». La valeur n'est pas reproduite ; aucune action de révocation ne peut être déclarée effectuée.

Documents administratifs modifiés lors de la consolidation : le présent rapport, le guide, la fiche, le plan et la note. Nouveau document créé : `01_RAPPORT_CONSOLIDATION_ENTRA_DGF.md`. Aucun code, configuration, `.env`, document de conception ou inscription Entra n'a été modifié dans la consolidation. Les autres modifications Git préexistantes ont été préservées.

Conclusion de préparation : dossier cohérent sur les frontières SPA/API et sur l'absence de capacité OBO/Graph backend démontrée. **Non prêt à transmettre comme dossier sans réserve — vérification sécurité préalable nécessaire** au sujet de l'entrée d'environnement ; le dossier documentaire peut être communiqué séparément à la DSI par un canal approuvé, sans joindre ni recopier le fichier d'environnement.
