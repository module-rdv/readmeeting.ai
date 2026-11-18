# Historique des décisions et orientations

Ce relevé synthétise les référentiels existants sans les remplacer. Les statuts « confirmé », « rapporté », « cible » et « à valider » doivent rester distincts.

## Socle technologique

- **Frontend :** conserver React 19 / Vite 8 / TypeScript ; ne pas migrer vers Next.js sans décision explicite. C’est le stack du dépôt observé.
- **Backend :** ASP.NET Core / .NET 10 retenu pour le socle. Le projet est maintenant compilable selon les résultats locaux rapportés ; seules les routes de santé sont actives.
- **Architecture logique :** séparation Domain, Application, Infrastructure et API. Aucun accès Graph, persistance ni traitement métier backend n’est encore une capacité du Lot 0.

## Authentification, tenants et Graph

- **État existant :** MSAL et Graph sont utilisés depuis le navigateur.
- **Cible :** frontend obtient un jeton pour l’audience ReadMeeting API ; l’API valide signature, issuer, audience, dates et claims. Le serveur dérive tenant/utilisateur de claims vérifiés, applique les autorisations de ressource et utilise OBO pour Graph.
- **Sécurité multi-tenant :** un `tenantId` client n’est jamais autoritaire ; les relations inter-tenant doivent être impossibles par conception et tests négatifs.
- **OBO :** orientation d’architecture documentée, pas implémentée. Audience, tenant autorisé, inscription d’application, credential serveur, scopes et consentements effectifs restent à confirmer par les responsables compétents.
- Ne jamais transmettre de jeton Graph au frontend, enregistrer de token ou exposer de transcription complète dans les logs.

## Transcription Microsoft Teams

- Récupérer VTT en premier et préserver le parseur existant.
- Déclencher le fallback uniquement sur `innerError.code === SpeakerAttributionNotAllowed`, pour le même transcript Graph et endpoint, avec `Accept: application/vnd.microsoft.graph.transcript+text`. Ne pas passer ce format par `$format`.
- Parser distinctement les formats ; conserver les timestamps et l’ordre ; lorsqu’il n’y a pas d’attribution, garder le locuteur explicitement non attribué et ne jamais inventer de nom.
- Les tests mockés vérifient la logique locale, pas les permissions effectives ni le comportement d’un tenant réel.

## Modèle métier et traitement

- Les IDs locaux UUID sont distincts des IDs opaques Microsoft Graph.
- La conception de la brique 01 prévoit tenant-scoping, références de provenance, contenu brut immuable par révision, cues et ProcessingRun append-only.
- La conception prescrit les statuts canoniques, transitions, idempotence, concurrence atomique, reprise, runs terminaux immuables et événement distinct par demande. Aucun de ces mécanismes n’est encore dans le backend Lot 0.
- Le choix de persistance et de stockage brut n’est pas définitivement arrêté ; PostgreSQL reste une option dans les documents techniques.

## Frontières entre briques

1. **Brique 01 — Meeting & Transcript Processing :** récupération de réunion/transcript, résolution, parsing, normalisation, validation structurelle, persistance, suivi et consultation.
2. **Extraction IA et preuves :** chantier distinct ; choix fournisseur IA et gouvernance DGF sont à valider. Les preuves doivent relier les éléments futurs aux cues source et pouvoir être réutilisées.
3. **Compte rendu institutionnel :** modèle officiel DGF à fournir ; workflow retenu : extraction/preuves → brouillon → validation humaine → génération/version finale → contrôles → publication. La validation humaine porte sur une version précise ; toute modification post-validation appelle une nouvelle validation.
4. **SharePoint :** publication et permissions sont distinctes de la lecture des transcriptions. Site, bibliothèque, identité, versioning et droits effectifs restent à confirmer.
5. **Agent Teams live :** chantier séparé de la récupération post-réunion Graph ; faisabilité M365 et scénarios métier doivent être validés indépendamment.

## Points explicitement ouverts

- audience/API Entra et prérequis OBO ;
- consentements effectifs et accès Graph réel selon politique, utilisateur et réunion ;
- autorisation par ressource et tests d’isolation ;
- stockage, rétention, chiffrement, sauvegarde et purge ;
- validation DGF du modèle, des critères de recette et du processus documentaire ;
- gouvernance/fournisseur IA, publication SharePoint et agent live ;
- arbitrages du référentiel global signalés dans `09_DECISIONS_TECHNIQUES_ET_POINTS_A_CONFIRMER.md`.

Sources principales : [référentiel global](../preparation-architecture/), [conception technique](../conception-technique/meeting-transcript/), [rapport Lot 0](../implementation/LOT_0_RAPPORT_IMPLEMENTATION.md) et [audit final Lot 0](../implementation/LOT_0_AUDIT_FINAL.md).
