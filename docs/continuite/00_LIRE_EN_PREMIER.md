# ReadMeeting.ai | DGF — Lire en premier

## Finalité

ReadMeeting.ai vise à aider la Direction Générale des Financements (DGF) à récupérer et exploiter les transcriptions de réunions Microsoft Teams, puis à soutenir un processus contrôlé de préparation et de publication de comptes rendus institutionnels. La transcription est une source : elle ne vaut pas décision administrative et ne doit pas conduire à inventer des intervenants, responsables, échéances ou faits.

Le périmètre de la première brique technique est le traitement des réunions et transcriptions : récupération, parsing, normalisation, validation structurelle, persistance, suivi et consultation. Extraction IA, rédaction institutionnelle, génération de documents et publication sont des lots séparés.

## Architecture retenue

- Frontend React 19 / Vite 8 / TypeScript. MSAL et Microsoft Graph existent actuellement côté navigateur.
- Backend cible ASP.NET Core / .NET 10, organisé en projets API, Application, Domain et Infrastructure.
- À terme, l’API validera les jetons destinés à son audience, appliquera l’autorisation des ressources et utilisera OBO côté serveur pour accéder à Graph au nom de l’utilisateur. Ce flux backend n’est pas implémenté.
- Microsoft Graph fournit réunions et transcriptions. La récupération VTT est prioritaire ; le format alternatif non attribué est réservé à l’erreur précise `SpeakerAttributionNotAllowed`.
- La persistance, l’orchestration et le suivi durable des traitements sont des capacités cibles, pas des capacités du Lot 0.
- Les futurs lots IA et documentaires doivent préserver les preuves sources, la validation humaine versionnée et les frontières de sécurité.

Les contrats et détails normatifs se trouvent dans [la conception technique](../conception-technique/meeting-transcript/) et le référentiel global dans [preparation-architecture](../preparation-architecture/).

## État d’avancement

**Faits vérifiés dans cette reprise (13 novembre 2026) :**
- Le worktree contient le frontend et les projets .NET du socle Lot 0.
- Les quatre projets ciblent `net10.0`. Le seul endpoint enregistré dans `Program.cs` est `GET /health`.
- Le contrôleur `MeetingsController` existe dans le code, mais `Program.cs` n’enregistre ni contrôleurs ni leurs routes. Il n’expose donc pas de route métier.
- La branche courante est `main`. Le worktree comporte plusieurs modifications et fichiers non suivis ; leur attribution exhaustive ne peut être démontrée depuis l’état présent.
- L’environnement actuel annonce Node.js 22.23.4, npm 10.9.9 et .NET SDK 10.0.403. Ces versions locales ne seront pas automatiquement conservées après réinstallation.

**Déclarations antérieures du responsable et rapports du projet :**
- Lot 0 déclaré clôturé et validé localement.
- Les rapports enregistrent restauration/build .NET réussis, `npm run lint`, `npm run build`, démarrage de l’API et HTTP 200 sur `/health`.
- Une validation terrain Graph de récupération de transcriptions a été rapportée antérieurement ; elle ne valide pas l’API backend ou OBO.

**À vérifier dans le nouvel environnement :**
- sauvegarde et restauration de tous les changements Git non commis, y compris les fichiers non suivis ;
- tests reproductibles après réinstallation et exécution distante de la CI ;
- configuration Entra réelle, scopes effectivement consentis et accès Graph selon identité, réunion et politique tenant ;
- exigences et prérequis de sécurité du Lot 1 avant modification de code.

La CI distante n’est pas confirmée comme exécutée. Les rapports et leur distinction entre résultats locaux, tests mockés et validations terrain sont dans [implementation](../implementation/).

## Règles essentielles et interdictions

- Préserver le tenant vérifié côté serveur ; ne jamais faire autorité d’un `tenantId` fourni par le client.
- Ne jamais exposer un jeton Graph au frontend, ni des tokens, secrets ou transcriptions complètes dans les logs.
- Ne jamais inventer un nom d’intervenant pour un transcript non attribué.
- Ne pas présenter une cible documentaire comme fonctionnalité déjà codée.
- Ne pas relancer un lot déjà clôturé sans demande explicite ; ne pas dépasser le périmètre autorisé.
- Ne pas ouvrir, copier ou reporter de valeur issue d’un `.env` dans les documents ou sorties.
- Ne pas nettoyer, réinitialiser, déplacer ou remplacer des travaux Git locaux.

## Prochaine mission autorisée

Le Lot 1 — **API Security & Authentication** — est déclaré autorisé mais pas commencé. Le périmètre proposé et ses inconnues sont détaillés dans [06_PROCHAINE_MISSION_LOT_1.md](./06_PROCHAINE_MISSION_LOT_1.md). Cette passation n’autorise pas à commencer cette mission : le nouvel agent doit d’abord relire la mission active du responsable, les documents de conception et l’état réel du dépôt, puis agir uniquement sur autorisation toujours valable.

## Ordre de reprise

Lire ensuite [README.md](./README.md) et les six autres documents de passation avant toute action. Le document [07_INSTRUCTIONS_NOUVEL_AGENT.md](./07_INSTRUCTIONS_NOUVEL_AGENT.md) définit le protocole de travail.
