# Fiche de paramètres Microsoft Entra ID — DGF

À compléter avec la DSI, l'administrateur Entra et les responsables applicatifs. Les valeurs d'environnement inconnues sont indiquées « À confirmer par la DSI ». Ne jamais inscrire un token, un secret, un certificat privé ou la valeur d'un credential dans cette fiche.

Pour chaque paramètre, joindre une **preuve/référence non sensible** : capture administrative expurgée, référence d'une configuration approuvée, ticket DSI, compte rendu de test, référence de test ou décision d'approbation. Ne pas joindre de jeton ou de clé privée.

## 1. Paramètres par environnement

Chaque environnement possède ses propres inscriptions/valeurs si la DSI l'a décidé. Aucun identifiant ne doit être recopié entre environnements sans confirmation. Pour chaque ligne, préciser le statut et ajouter une référence de preuve ; les informations inconnues restent « À confirmer par la DSI ».

### Développement local

| Paramètre | Valeur | Responsable | Statut | Preuve / Référence |
|---|---|---|---|---|
| Tenant ID | À confirmer par la DSI | Administrateur Entra | À confirmer | À renseigner |
| Client ID SPA | À confirmer par la DSI | Administrateur Entra | À confirmer | À renseigner |
| Client ID API (`AzureAd:ClientId`) | À confirmer par la DSI | Administrateur Entra | À confirmer | À renseigner |
| Application ID URI de l'API | À confirmer par la DSI | Administrateur Entra | À confirmer | À renseigner |
| Audience réelle (`AzureAd:Audience`, claim `aud`) | À confirmer par la DSI après émission d'un token API de test | Administrateur Entra + équipe API | À confirmer | À renseigner |
| Scope complet demandé par la SPA (`VITE_READMEETING_API_SCOPE`) | À confirmer par la DSI | Administrateur Entra + équipe frontend | À confirmer | À renseigner |
| Valeur de scope attendue dans `scp` (`AzureAd:RequiredScope`) | À confirmer par la DSI | Administrateur Entra + équipe API | À confirmer | À renseigner |
| URI de redirection SPA | À confirmer par la DSI ; code local autorise HTTP uniquement sur localhost | Administrateur Entra + équipe frontend | À confirmer | À renseigner |
| Origines CORS (`Cors:AllowedOrigins`) | À confirmer par la DSI ; HTTP autorisé uniquement sur localhost/127.0.0.1 | DSI exploitation + équipe API | À confirmer | À renseigner |
| URL de base API (`VITE_READMEETING_API_BASE_URL`) | À confirmer par la DSI | DSI exploitation + équipe frontend | À confirmer | À renseigner |
| Client ID autorisé (`AzureAd:AllowedClientId`) | À confirmer par la DSI ; doit correspondre au client SPA autorisé | Administrateur Entra + équipe API | À confirmer | À renseigner |
| Permissions Graph déléguées SPA | À confirmer par la DSI ; le code demande `User.Read`, `Calendars.Read`, `OnlineMeetings.Read`, `OnlineMeetingTranscript.Read.All` | Administrateur Entra | Déclarations code connues ; consentement inconnu | À renseigner |
| Permissions Graph déléguées backend/OBO | À confirmer par la DSI ; `Graph:Scopes` est vide par défaut et aucun endpoint Graph backend n'est raccordé | DGF/DSI sécurité + administrateur Entra | Aucun scope OBO confirmé | À renseigner |
| Consentement API et Graph | À confirmer par la DSI pour chaque permission et chaque inscription | Administrateur Entra habilité | À confirmer | À renseigner |
| Méthode de credential backend | À confirmer par la DSI (certificat recommandé ou secret explicitement autorisé) | DSI sécurité | À confirmer | À renseigner |
| Référence du coffre sécurisé (sans valeur de credential) | À confirmer par la DSI | DSI exploitation / sécurité | À confirmer | À renseigner |
| Responsable de rotation et de révocation | À confirmer par la DSI | DSI sécurité | À confirmer | À renseigner |

### Test / recette

| Paramètre | Valeur | Responsable | Statut | Preuve / Référence |
|---|---|---|---|---|
| Tenant ID | À confirmer par la DSI | Administrateur Entra | À confirmer | À renseigner |
| Client ID SPA | À confirmer par la DSI | Administrateur Entra | À confirmer | À renseigner |
| Client ID API (`AzureAd:ClientId`) | À confirmer par la DSI | Administrateur Entra | À confirmer | À renseigner |
| Application ID URI de l'API | À confirmer par la DSI | Administrateur Entra | À confirmer | À renseigner |
| Audience réelle (`AzureAd:Audience`, claim `aud`) | À confirmer par la DSI après émission d'un token API de test | Administrateur Entra + équipe API | À confirmer | À renseigner |
| Scope complet demandé par la SPA (`VITE_READMEETING_API_SCOPE`) | À confirmer par la DSI | Administrateur Entra + équipe frontend | À confirmer | À renseigner |
| Valeur de scope attendue dans `scp` (`AzureAd:RequiredScope`) | À confirmer par la DSI | Administrateur Entra + équipe API | À confirmer | À renseigner |
| URI de redirection SPA | À confirmer par la DSI ; confirmer l'URI exacte de recette | Administrateur Entra + équipe frontend | À confirmer | À renseigner |
| Origines CORS (`Cors:AllowedOrigins`) | À confirmer par la DSI ; origine HTTPS exacte | DSI exploitation + équipe API | À confirmer | À renseigner |
| URL de base API (`VITE_READMEETING_API_BASE_URL`) | À confirmer par la DSI | DSI exploitation + équipe frontend | À confirmer | À renseigner |
| Client ID autorisé (`AzureAd:AllowedClientId`) | À confirmer par la DSI ; doit correspondre au client SPA autorisé | Administrateur Entra + équipe API | À confirmer | À renseigner |
| Permissions Graph déléguées SPA | À confirmer par la DSI ; les scopes déclarés dans le code ne prouvent pas leur consentement | Administrateur Entra | À confirmer | À renseigner |
| Permissions Graph déléguées backend/OBO | À confirmer par la DSI après définition des opérations backend ; aucune liste OBO confirmée | DGF/DSI sécurité + administrateur Entra | Aucun scope OBO confirmé | À renseigner |
| Consentement API et Graph | À confirmer par la DSI pour chaque permission et chaque inscription | Administrateur Entra habilité | À confirmer | À renseigner |
| Méthode de credential backend | À confirmer par la DSI (certificat recommandé ou secret explicitement autorisé) | DSI sécurité | À confirmer | À renseigner |
| Référence du coffre sécurisé (sans valeur de credential) | À confirmer par la DSI | DSI exploitation / sécurité | À confirmer | À renseigner |
| Responsable de rotation et de révocation | À confirmer par la DSI | DSI sécurité | À confirmer | À renseigner |

### Production

| Paramètre | Valeur | Responsable | Statut | Preuve / Référence |
|---|---|---|---|---|
| Tenant ID | À confirmer par la DSI | Administrateur Entra | À confirmer | À renseigner |
| Client ID SPA | À confirmer par la DSI | Administrateur Entra | À confirmer | À renseigner |
| Client ID API (`AzureAd:ClientId`) | À confirmer par la DSI | Administrateur Entra | À confirmer | À renseigner |
| Application ID URI de l'API | À confirmer par la DSI | Administrateur Entra | À confirmer | À renseigner |
| Audience réelle (`AzureAd:Audience`, claim `aud`) | À confirmer par la DSI après émission d'un token API de production autorisé | Administrateur Entra + équipe API | À confirmer | À renseigner |
| Scope complet demandé par la SPA (`VITE_READMEETING_API_SCOPE`) | À confirmer par la DSI | Administrateur Entra + équipe frontend | À confirmer | À renseigner |
| Valeur de scope attendue dans `scp` (`AzureAd:RequiredScope`) | À confirmer par la DSI | Administrateur Entra + équipe API | À confirmer | À renseigner |
| URI de redirection SPA | À confirmer par la DSI ; le code contient une URI de production à vérifier avant usage | Administrateur Entra + équipe frontend | À confirmer | À renseigner |
| Origines CORS (`Cors:AllowedOrigins`) | À confirmer par la DSI ; origine HTTPS exacte | DSI exploitation + équipe API | À confirmer | À renseigner |
| URL de base API (`VITE_READMEETING_API_BASE_URL`) | À confirmer par la DSI | DSI exploitation + équipe frontend | À confirmer | À renseigner |
| Client ID autorisé (`AzureAd:AllowedClientId`) | À confirmer par la DSI ; doit correspondre au client SPA autorisé | Administrateur Entra + équipe API | À confirmer | À renseigner |
| Permissions Graph déléguées SPA | À confirmer par la DSI ; scopes et consentements réels à vérifier | Administrateur Entra | À confirmer | À renseigner |
| Permissions Graph déléguées backend/OBO | À confirmer par la DSI après approbation des opérations ; aucune liste OBO confirmée | DGF/DSI sécurité + administrateur Entra | Aucun scope OBO confirmé | À renseigner |
| Consentement API et Graph | À confirmer par la DSI pour chaque permission et chaque inscription | Administrateur Entra habilité | À confirmer | À renseigner |
| Méthode de credential backend | À confirmer par la DSI ; aucun credential configuré par le code actuel | DSI sécurité | À confirmer | À renseigner |
| Référence du coffre sécurisé (sans valeur de credential) | À confirmer par la DSI | DSI exploitation / sécurité | À confirmer | À renseigner |
| Responsable de rotation et de révocation | À confirmer par la DSI | DSI sécurité | À confirmer | À renseigner |

## 2. Matrice des permissions Microsoft Graph

Cette matrice décrit les permissions déclarées/demandées par le frontend observé, non une recommandation OBO. Le dépôt ne contient pas d'opération Graph backend raccordée. « Consentement accordé » et « capacité effective » ne sont pas attestés par la présence d'un scope dans le code.

| Permission Graph | Type | Application concernée | Opération métier | Endpoint Graph observé | Justification | Consentement requis | Consentement accordé | Capacité effective |
|---|---|---|---|---|---|---|---|---|
| `User.Read` | Déléguée | SPA frontend | Charger le profil de l'utilisateur connecté | `GET /me` | Le frontend lit le profil pour son affichage | Selon la permission et la politique du tenant ; à confirmer par la DSI | À confirmer par la DSI | Appel frontend présent dans le code ; accès réel non validé. Backend/OBO : aucune opération implémentée. |
| `Calendars.Read` | Déléguée | SPA frontend | Lire les événements de calendrier | `GET /me/calendarView` | Le frontend récupère les réunions du calendrier | Selon la permission et la politique du tenant ; à confirmer par la DSI | À confirmer par la DSI | Appel frontend présent dans le code ; accès réel non validé. Backend/OBO : aucune opération implémentée. |
| `OnlineMeetings.Read` | Déléguée | SPA frontend | Résoudre une réunion Teams à partir du Join URL | `GET /me/onlineMeetings`, avec un parcours invité pouvant utiliser `GET /users/{organizer}/onlineMeetings` | Le frontend résout les métadonnées de la réunion | Selon la permission et la politique du tenant ; à confirmer par la DSI | À confirmer par la DSI | Appel frontend présent dans le code ; accès réel non validé. Backend/OBO : aucune opération implémentée. |
| `OnlineMeetingTranscript.Read.All` | Déléguée | SPA frontend | Découvrir les transcripts et lire leur contenu | `GET /me/onlineMeetings/{id}/transcripts`, `/users/{organizer}/onlineMeetings/{id}/transcripts` et les routes `/content` correspondantes | Le frontend vérifie et récupère les transcripts Teams | Le code et la documentation de projet indiquent qu'un consentement administrateur est requis ; confirmer dans le tenant | À confirmer par la DSI | Appel frontend présent dans le code ; consentement, politiques Teams et accès à une réunion réelle non validés. Backend/OBO : aucune opération implémentée. |
| Aucune permission OBO backend confirmée | Déléguée, à déterminer si une opération backend est approuvée | API backend | Aucune opération Graph backend raccordée | Aucun endpoint Graph backend dans le code actuel | Aucune permission ne peut être retenue sans opération serveur, endpoint et justification approuvés | Non déterminable avant définition du besoin ; aucune permission à ajouter sur la seule base du frontend | Aucune preuve de consentement OBO | Aucun accès Graph OBO opérationnel démontré ; `Graph:Scopes` est vide par défaut. |

Toute permission future côté API doit être reliée à une opération backend, un endpoint Graph et une justification de moindre privilège. Ne pas ajouter de permission applicative au scénario OBO délégué.

## 3. Distinctions techniques à conserver

- `AzureAd:ClientId` désigne la configuration de l'API backend ; `AzureAd:AllowedClientId` est le Client ID client comparé au claim `azp`, ou `appid` si `azp` est absent.
- `AzureAd:Audience` est comparé au claim `aud`. L'Application ID URI n'est pas assimilée automatiquement à l'audience.
- `AzureAd:RequiredScope` est comparé à la valeur de scope dans `scp`. `VITE_READMEETING_API_SCOPE` contient le scope complet demandé par le frontend.
- Le backend exige un issuer v2 exact construit depuis `AzureAd:TenantId`. La politique personnalisée ne vérifie pas séparément un claim `ver`.
- La SPA/MSAL est distincte du futur flux API/OBO. Un token Graph du navigateur n'est pas un token destiné à l'API.
- La présence du fournisseur OBO ne prouve ni l'existence d'une credential backend, ni un échange OBO réussi.
- Les valeurs `VITE_*` sont publiques dans le bundle. Ne jamais y inscrire de secret ou de credential.

## 4. Références de dossier

- [Guide administrateur Entra DGF](./ENTRA_GUIDE_ADMINISTRATEUR_DGF.md)
- [Plan de validation Entra/OBO](./ENTRA_PLAN_VALIDATION_DGF.md)
- [Note de transmission à la DSI](./NOTE_TRANSMISSION_ADMINISTRATEUR_DGF.md)
- [Rapport de préparation](./00_RAPPORT_PREPARATION_ENTRA_DGF.md)
- [Rapport de consolidation](./01_RAPPORT_CONSOLIDATION_ENTRA_DGF.md)
