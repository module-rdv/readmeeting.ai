# Prochaine mission — Lot 1 : API Security & Authentication

## Statut et limite

Le responsable du projet déclare le Lot 1 autorisé mais non commencé. Cette note prépare le passage de contexte ; elle ne réalise pas le lot, n’ajoute pas de configuration Entra et ne vaut pas autorisation à dépasser l’instruction de mission active.

## Objectifs à cadrer

- Valider les JWT Microsoft Entra destinés à l’API ASP.NET Core : signature, émetteur, audience exacte, expiration/not-before et claims/scopes requis.
- Définir quels tenants et utilisateurs sont autorisés et comment `tid`/`oid` validés sont mappés au contexte de sécurité.
- Faire obtenir au frontend un jeton d’accès de l’audience API et protéger les appels HTTP.
- Construire un contexte d’identité serveur fiable ; ne pas utiliser l’identité ou le tenant déclarés dans le corps comme autorité.
- Préparer puis implémenter OBO côté backend uniquement si les prérequis d’application, credentials, scopes, consentement et décisions de sécurité sont confirmés.
- Vérifier les accès autorisés et refusés, les erreurs, les logs et l’absence de fuite de token/secret.

La portée exacte doit être rapprochée de la demande d’implémentation Lot 1 du responsable. Ne pas ajouter de routes métier, Graph backend ou orchestration à moins qu’ils soient explicitement autorisés par cette demande.

## Prérequis connus

- Socle API et solution .NET 10 existent ; le seul endpoint enregistré est `/health`.
- Le frontend a déjà MSAL et utilise un jeton Graph directement pour ses flux actuels ; cela ne fournit pas un jeton API.
- La conception décrit un flux cible JWT API → validation des claims → contexte tenant/utilisateur → OBO côté serveur → jeton Graph serveur.
- Les tests doivent distinguer un JWT API d’un jeton destiné à Graph et couvrir refus d’issuer, audience, signature, expiration et utilisateur/tenant non autorisé.
- Les secrets serveur ne sont jamais placés dans le frontend, un `VITE_*`, un fichier suivi ou les logs.

## Inconnues et validations requises

| Décision / dépendance | À confirmer par | Impact si non résolu |
|---|---|---|
| Inscription Entra de l’API, issuer et tenants acceptés | Responsable projet, administrateur Entra/M365, sécurité | Impossible de valider correctement les tokens et la frontière tenant |
| Audience exacte/API identifier URI et scope exposé | Administrateur Entra/M365, architecture | Frontend ne peut demander un jeton pour l’API attendue |
| Client SPA autorisé à demander le scope API et consentement | Administrateur Entra/M365 | Appels API refusés ou consentement manquant |
| Autorisation API : rôles/scopes, utilisateurs admis, règles de ressources | DGF métier, sécurité, architecture | Authentification seule ne suffit pas à autoriser une ressource |
| OBO autorisé, application cliente/confidentielle et credential serveur (secret/certificat/identité fédérée selon décision) | Sécurité, administrateur Entra/M365, opérations | Aucun échange OBO fiable ; ne pas simuler le succès |
| Scopes Graph délégués minimum et consentement effectif | Administrateur M365 et responsable métier | OBO peut échouer ou demander des droits injustifiés |
| Stockage et rotation du credential serveur | Sécurité / opérations DGF | Risque de compromission et absence de fonctionnement sécurisé |
| Environnements de test, identité et ressources autorisées | Responsable projet / DGF / M365 | Tests intégrés réels impossibles ou non autorisés |

Ne pas inventer ces valeurs et ne pas changer les permissions du tenant sans autorisation explicite.

## Tests et preuves attendus à préciser

- Tests unitaires de validation et de mapping des claims avec tokens/fakes adaptés, sans valeur secrète.
- Tests d’intégration : token valide pour l’audience API accepté ; mauvais issuer, audience Graph, signature invalide, expiration, tenant/utilisateur non autorisé refusés.
- Tests négatifs d’accès tenant et ressource dès que les ressources de test existent ; aucune donnée d’un tenant tiers ne doit fuiter.
- Test OBO réel uniquement avec enregistrement, consentement, credential serveur et scénario autorisés ; démontrer que le token Graph reste côté serveur.
- Observabilité redacted : code/status/correlation, pas de token, credential ni transcript.
- Rapporter les résultats réellement exécutés et distinguer mocks, intégration contrôlée et appel authentifié M365.

## Séquence de reprise suggérée

1. Relire les contrats API, l’intégration Graph, les décisions non résolues, le plan de tests, la préparation opérationnelle et les rapports Lot 0.
2. Refaire `git status --short` et sauvegarder le worktree avant toute modification.
3. Obtenir les décisions et ressources Entra/M365 manquantes ; si elles bloquent l’implémentation, rendre un rapport de blocage plutôt que coder des valeurs fictives.
4. Confirmer avec le responsable les fichiers et tests autorisés pour la mission Lot 1.
5. Implémenter uniquement l’authentification/autorisation définie, tester, produire un rapport et attendre validation avant tout autre lot.
