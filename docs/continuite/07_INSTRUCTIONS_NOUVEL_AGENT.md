# Instructions impératives au nouvel agent

1. Lire [00_LIRE_EN_PREMIER.md](./00_LIRE_EN_PREMIER.md) en premier.
2. Lire ensuite les six autres documents de passation numérotés `01` à `06`, puis cet index si nécessaire.
3. Lire les documents de conception existants et le référentiel global avant toute modification, en particulier les documents pertinents de `docs/conception-technique/meeting-transcript/` et `docs/preparation-architecture/`.
4. Inspecter le dépôt réel, le statut Git, la branche et les fichiers non suivis ; comparer ces faits avec la passation et corriger toute divergence dans le compte rendu de reprise.
5. Ne jamais recommencer un lot déjà validé sans demande explicite.
6. Ne jamais régénérer, remplacer, déplacer ou supprimer un document existant sans instruction explicite.
7. Travailler exclusivement sur la mission activement autorisée par le responsable. La mention « Lot 1 autorisé » dans ce dossier ne permet pas de commencer si la mission active ou les prérequis ne sont pas confirmés.
8. Fournir un rapport factuel à chaque lot : fichiers, résultats réels, limites, éléments non testés et niveaux de preuve.
9. Attendre une validation explicite du responsable avant le lot suivant.
10. Ne jamais inventer un test, un résultat, une permission, une fonctionnalité, une configuration tenant ou une infrastructure.

## Protection et véracité

- Ne lire ni n’afficher les valeurs des `.env`, secrets, tokens, mots de passe ou credentials. Au besoin, relever seulement les noms des variables.
- Ne jamais envoyer de credential dans une variable `VITE_*`, un rapport, une réponse HTTP ou un log.
- Préserver tout travail local, même non commité. Ne pas réinitialiser Git, nettoyer les fichiers non suivis, ni faire de commit global.
- Séparer les constats de code, tests mockés, tests locaux, validations authentifiées et déclarations du responsable.
- Les documents de conception sont des cibles et contraintes, pas une preuve d’implémentation.
- Le Lot 0 n’expose que `/health`; ne pas présenter `[Authorize]` sur un contrôleur non enregistré comme une API sécurisée et opérationnelle.
- Ne pas déployer d’infrastructure ni modifier les permissions Entra/Microsoft 365 sans autorisation explicite.
