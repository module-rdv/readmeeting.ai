# Note de transmission — Configuration Microsoft Entra ID

**À l'attention de la DSI et de l'administrateur Microsoft 365 / Entra ID de la DGF**

## Objet

Dans le cadre du projet ReadMeeting.ai | DGF, l'authentification JWT de l'API et la demande frontend d'un token API distinct ont été préparées dans le dépôt. La validation locale est disponible, mais aucune validation avec un token du tenant DGF ni aucun échange OBO réel n'a encore été réalisé.

## Opérations demandées

Nous sollicitons votre appui pour :

1. identifier et confirmer les inscriptions Entra SPA et API déjà existantes, sans créer de doublon ;
2. confirmer les Client IDs, le tenant, l'Application ID URI, l'audience réelle, la version du token et les URI de redirection par environnement ;
3. valider le scope délégué API à exposer, l'autorisation de la SPA à le demander et le consentement requis ;
4. confirmer les origines frontend qui pourront être autorisées par CORS ;
5. examiner les besoins Graph du futur flux serveur, approuver seulement les permissions déléguées justifiées par une opération backend et accorder le consentement applicable ;
6. décider si l'OBO est autorisé et sélectionner un credential serveur compatible avec la politique de sécurité DGF.

Le code compare le claim `aud` à une valeur exacte et le claim `scp` à la valeur du scope exposé. Il faudra donc confirmer l'audience depuis un vrai token v2 destiné à l'API et distinguer le scope complet demandé par le frontend de la valeur de scope présente dans `scp`.

## Transmission sécurisée

Les identifiants non secrets et décisions administratives peuvent être reportés dans `ENTRA_FICHE_PARAMETRES_DGF.md` puis communiqués par le canal approuvé par la DSI. Ne transmettez aucun token, clé privée, secret client ou credential par courriel ordinaire, dans un document partagé non approuvé, dans une variable frontend `VITE_*` ou dans un dépôt Git.

Si un credential backend est approuvé, il doit être créé/provisionné et déposé directement dans le coffre ou mécanisme serveur autorisé par DGF. La fiche de paramètres ne doit contenir que la méthode, la référence sécurisée, le responsable de rotation et le statut, jamais la valeur du credential.

## Vérifications ultérieures

Après confirmation et configuration, l'équipe technique prévoit les tests d'authentification API, d'audience, de scope, de client appelant, d'isolation du contexte utilisateur et des réponses d'erreur décrits dans `ENTRA_PLAN_VALIDATION_DGF.md`.

Le test OBO ne pourra être exécuté qu'après l'approbation des permissions Graph, l'installation sécurisée du credential et le raccordement du parcours OBO côté backend. Le test d'accès Graph nécessitera en outre un endpoint backend et une réunion de test autorisée. Aucun de ces tests réels n'est réputé effectué par la présente note.

## Documents de travail et livrables attendus de la DSI

Merci de vous appuyer sur :

- le [guide administrateur Entra DGF](./ENTRA_GUIDE_ADMINISTRATEUR_DGF.md) pour les vérifications et actions dans le portail ;
- la [fiche de paramètres DGF](./ENTRA_FICHE_PARAMETRES_DGF.md) pour consigner les décisions par environnement et leurs références de preuve ;
- le [plan de validation Entra/OBO](./ENTRA_PLAN_VALIDATION_DGF.md) pour distinguer les tests locaux synthétiques des validations réelles ;
- le [rapport de préparation](./00_RAPPORT_PREPARATION_ENTRA_DGF.md) et le [rapport de consolidation](./01_RAPPORT_CONSOLIDATION_ENTRA_DGF.md) pour l'état technique, les limites et les blocages.

Les éléments attendus de la DSI sont :

1. confirmation des inscriptions SPA et API existantes, de leurs propriétaires et des environnements concernés ;
2. fiche de paramètres renseignée, avec une référence non sensible pour chaque décision ou valeur confirmée ;
3. décisions sur les permissions déléguées Graph, le périmètre réellement nécessaire et les consentements accordés ou refusés ;
4. confirmation des URI de redirection et origines CORS autorisées par environnement ;
5. décision explicite sur l'autorisation du flux OBO ;
6. choix du mécanisme de credential confidentiel backend, du coffre approuvé et des modalités de rotation/révocation ; aucune valeur de credential ne doit être transmise dans la fiche ou par courriel ordinaire ;
7. identification du responsable technique et communication des contraintes de sécurité, d'exploitation et de preuve applicables aux tests.

Nous vous remercions de confirmer les propriétaires des inscriptions et de signaler toute contrainte DGF applicable avant les tests. La présence d'un paramètre ou d'une permission dans le code ne constitue pas une confirmation de configuration, de consentement ou de capacité effective.
