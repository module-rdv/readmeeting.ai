# Finalisation Teams et SharePoint

## Parcours livré

- Les réunions ne sont classées Teams que lorsque Microsoft Graph indique `teamsForBusiness` ou que `onlineMeeting.joinUrl` utilise un domaine Teams reconnu. `isOnlineMeeting` seul et le lien Outlook `webLink` ne suffisent pas.
- L'identité d'un participant est rapprochée par adresse électronique exacte. Une invitation ou sa réponse RSVP n'est pas considérée comme une preuve de présence.
- La résolution d'une réunion organisée par un utilisateur externe est tentée avec le compte courant ; seuls les résultats et refus effectivement renvoyés par Graph déterminent l'accessibilité.
- Les transcriptions Teams suivent toutes les pages `@odata.nextLink`. Les liens de pagination sont limités aux domaines Graph HTTPS connus ; les erreurs Graph existantes, dont les refus de permission, les erreurs de tenant, `SpeakerAttributionNotAllowed` et le délai `Retry-After`, restent distinctes.
- Le statut `Published` ne peut plus être défini par les endpoints génériques de création ou de mise à jour des rapports. Seul l'endpoint de publication SharePoint peut le définir après une réponse Graph contenant un DriveItem vérifiable et après persistance de ses identifiants.

## SharePoint

Le backend fournit la recherche des sites accessibles, la liste des bibliothèques et la navigation des dossiers :

- `GET /api/v1/sharepoint/sites?search=...`
- `GET /api/v1/sharepoint/sites/{siteId}/drives`
- `GET /api/v1/sharepoint/drives/{driveId}/folders?parentFolderId=...`
- `POST /api/v1/meetings/{meetingId}/reports/{reportId}/publish`

Le navigateur appelle ces endpoints avec l'authentification existante ; aucun jeton Graph n'est exposé à l'interface. La publication requiert le rôle Entra ID `ReadMeeting.ReportValidator`.

Le document Word est construit à partir des données persistées du compte rendu approuvé, avec les informations de réunion connues et les sections structurées disponibles. Les sections sans contenu approuvé restent explicitement « Non renseigné » ; elles ne sont pas complétées par des données inventées.

Le nom du fichier est déterministe par rapport à la référence et à l'identifiant du rapport. Une nouvelle tentative remplace le même DriveItem au lieu de créer une copie par défaut. Le versionnement effectif est celui configuré dans la bibliothèque SharePoint ; Graph fournit l'ETag/CTag enregistré comme marqueur de version lorsqu'il est disponible. La publication conserve le DriveItem ID, l'URL, le Drive, le dossier, la date, l'utilisateur, la marque de version et l'erreur éventuelle. Les tentatives sont aussi consignées dans `AuditLogs`.

## Configuration attendue de la DSI

Aucune valeur DGF n'est codée en dur. Les valeurs suivantes doivent être fournies à l'API via User Secrets en local et le gestionnaire de secrets de l'hébergeur en production, jamais dans `appsettings.json`, le frontend ou Git :

| Clé | Besoin |
| --- | --- |
| `AzureAd:TenantId` | Tenant Entra ID de l'API |
| `AzureAd:ClientId` | Client ID de l'application API |
| `AzureAd:ClientSecret` ou `AzureAd:ClientCertificates` | Credential confidentiel de l'API pour OBO |
| `Graph:Scopes` | Scopes délégués approuvés pour découvrir le site/la bibliothèque et écrire le document |
| `Graph:SharePoint:SiteId` | Site autorisé (facultatif si sélectionné depuis l'interface) |
| `Graph:SharePoint:DriveId` | Bibliothèque autorisée (facultatif si sélectionnée depuis l'interface) |
| `Graph:SharePoint:DestinationFolderId` | Dossier par défaut (facultatif si sélectionné depuis l'interface) |
| `Graph:BaseUrl` | Facultatif ; Graph v1.0, domaine Microsoft Graph approuvé |

La DSI doit valider les permissions minimales (lecture des sites/bibliothèques et écriture limitée à la destination retenue), le consentement, le credential OBO et la politique de versionnement. Des scopes larges tels que `Sites.Read.All` ou `Files.ReadWrite.All` ne sont pas ajoutés par défaut. Le backend refuse l'acquisition si les scopes ou le credential confidentiel sont absents et n'émet jamais de jeton simulé.

## États et migration

Transitions normales : `Draft → UnderReview → Approved → Publishing → Published`. Une erreur laisse `PublicationFailed`, depuis lequel le validateur peut réessayer ; il peut aussi rouvrir le rapport en relecture avant de le modifier et de le faire approuver à nouveau. Les rapports publiés et en cours de publication sont verrouillés contre les modifications génériques.

La migration PostgreSQL `20261118123700_AddSharePointPublicationMetadata` ajoute les champs de destination, version, date/auteur de publication et dernière erreur. Elle est créée mais **n'a pas été appliquée** ; aucune base Aiven n'a été contactée ou modifiée.

## Limites de vérification

Les builds, tests ciblés et la génération DOCX sont vérifiés localement avec des tests hors tenant. Aucun appel authentifié au tenant DGF n'a été réalisé. La découverte réelle, l'obtention OBO, les permissions effectives, le dépôt, le versionnement et l'accès au document doivent être validés après réception de la configuration DSI.
