# Microsoft 365, Entra ID et DGF

## Ce que montre le code

- L’application frontend utilise MSAL Browser/React et Graph côté navigateur. Voir `src/config/msalConfig.ts` et `src/services/graphClient.ts`.
- La liste de scopes de transcription du code est `User.Read`, `Calendars.Read`, `OnlineMeetings.Read`, `OnlineMeetingTranscript.Read.All`. Un scope demandé/configuré ne prouve ni consentement effectif, ni accès pour tous les utilisateurs ou réunions.
- La configuration permet une URI de redirection de forme `/redirect.html`; le développement Vite est déclaré sur le port 3000. L’URI exacte d’un environnement dépend de la configuration locale et de l’inscription Entra, et n’est pas copiée ici.
- `src/services/transcriptService.ts` contient la récupération VTT et le fallback limité à `SpeakerAttributionNotAllowed`, avec le même transcript et l’en-tête `Accept: application/vnd.microsoft.graph.transcript+text`. Le parser alternatif utilise un libellé non attribué ; le chemin export existe côté client.
- Les scénarios du script `scripts/test-transcript-service.ts` incluent la validation mockée du fallback, du format sans attribution et de l’export. Un mock ne valide pas les permissions ou le service tenant.
- Le backend ne valide actuellement aucun JWT, n’effectue pas OBO et ne possède pas de service Graph concret.

## Déclarations terrain rapportées

- Le responsable a rapporté une authentification et résolution de réunion réussies, une transcription découverte, puis un HTTP 403 `SpeakerAttributionNotAllowed` lors du téléchargement VTT.
- Les documents de référence rapportent ensuite les validations terrain A/B de récupération Graph. Ces résultats sont des déclarations/éléments du référentiel projet, non une exécution authentifiée de cette passation et non une validation de l’API backend.
- La stratégie de fallback découle de la documentation Graph et des exigences utilisateur du projet ; elle ne modifie aucune permission, configuration Teams ou Entra et ne contourne pas une autorisation.

## Tests et niveaux de preuve

1. **Code observé :** fonctions MSAL/Graph, scopes demandés, fallback/parsers/diagnostics.
2. **Tests automatisés mockés :** le script de test transcript contient des assertions ciblant la règle de fallback et l’export. Les tests ne sont pas assimilables à des appels réels.
3. **Validation Graph authentifiée :** validation A/B rapportée par le responsable ; une nouvelle exécution dans le nouvel environnement doit être autorisée et consignée séparément.
4. **Backend/OBO :** non implémenté et non validé.

Ne pas qualifier les scopes de « consentis » simplement parce qu’ils sont codés. Ne pas considérer une validation de récupération navigateur comme validation de l’accès backend, OBO, ou autorisation par ressource.

## Points à confirmer après réinstallation

- Le responsable/administrateur DGF confirme le tenant et l’application Entra qui doivent être utilisés ; aucun identifiant tenant/client n’est consigné dans ce document.
- La configuration SPA est disponible dans un coffre sûr ; les URI de redirection locales et autorisées correspondent à l’origine du nouvel environnement.
- Les permissions déléguées nécessaires sont effectivement consenties et leur usage est autorisé par la politique M365/Teams.
- Pour Lot 1 : inscription d’API, audience/scope exposé, issuer/tenant autorisé, client SPA, consentement API et prérequis OBO sont à définir/valider. Ne pas inventer de valeur ni élargir les permissions.
- Reproduire les cas Graph avec identité, réunion de test, autorisation explicite, date et request-id/correlation non sensibles consignés ; ne pas inclure token ni transcript intégral dans la preuve.
- Revalider `SpeakerAttributionNotAllowed` et le fallback authentifié si le responsable l’autorise. Si le fallback est lui-même refusé, conserver son erreur Graph réelle ; ne pas déclarer la récupération opérationnelle.

Pour les contrats et décisions détaillées, consulter [l’intégration Graph de la brique 01](../conception-technique/meeting-transcript/05_INTEGRATION_MICROSOFT_GRAPH.md), [les décisions techniques](../conception-technique/meeting-transcript/09_DECISIONS_TECHNIQUES_ET_POINTS_A_CONFIRMER.md) et le référentiel global sécurité.
