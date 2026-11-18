# Déploiement ReadMeeting.ai : Render et Google Cloud Run

État : préparation locale uniquement. Aucun secret n'a été consulté, aucun dépôt n'a été synchronisé avec Google AI Studio et aucun service cloud ni base distante n'a été modifié.

## A. Architecture cible recommandée

- **Données** : Aiven PostgreSQL existante, accessible depuis Render avec TLS `VerifyFull`.
- **API** : service web Render construit avec le Dockerfile racine, ASP.NET Core .NET 10.
- **Interface** : application React 19 / Vite / TypeScript conservée dans ce dépôt. Google AI Studio Build Mode peut servir d'environnement de conception assistée; GitHub reste la référence du code.
- **Publication UI** : Cloud Run, soit depuis AI Studio après validation du projet importé, soit via un déploiement Cloud Run dédié à l'application Vite. Les deux parcours ne doivent pas être confondus.

Ne pas déployer le dépôt racine avec `gcloud run deploy --source .` en supposant qu'il s'agit de l'interface : le `Dockerfile` racine construit l'API backend pour Render. Aucune URL publique n'est présumée dans ce document.

## B. Backend Render

### Docker et port

Render prend en charge les déploiements Docker et fournit la variable d'environnement `PORT` (par défaut `10000`). Le service doit écouter sur `0.0.0.0`. Le Dockerfile lance désormais ASP.NET Core avec `ASPNETCORE_URLS=http://0.0.0.0:${PORT:-10000}` et utilise `10000` comme port exposé par défaut. Cela respecte une valeur `PORT` différente définie par Render.

L'API cible `net10.0`; les étapes SDK/runtime .NET 10 du Dockerfile sont adaptées à un service Render de type Docker. Créer le service Render depuis la racine du dépôt, avec le Dockerfile racine. Aucune commande de migration n'est intégrée à l'image.

### Certificat Aiven et TLS

Render rend un fichier secret disponible à l'exécution dans `/etc/secrets/<nom-du-fichier>`. Déposer le CA Aiven officiel comme fichier secret, par exemple `aiven-ca.pem`, puis fournir à Npgsql le chemin :

`Root Certificate=/etc/secrets/aiven-ca.pem`

Le paramètre doit être dans `ConnectionStrings__DefaultConnection`, avec `SSL Mode=VerifyFull`. Le code existant transmet la chaîne à Npgsql sans la réécrire. Aucun changement de la connexion locale, des identifiants, de la base ni du schéma Aiven n'a été fait. Le Dockerfile n'incorpore pas le certificat; `.dockerignore` exclut les fichiers `.pem` du contexte et l'image utilise l'utilisateur du runtime membre du groupe `1000`, comme requis pour lire les fichiers secrets Docker Render.

Le service ne doit ni désactiver la validation TLS ni remplacer le CA par `Trust Server Certificate=true`. Après sélection de la région Render, vérifier les plages d'IP sortantes associées et les exigences d'accès réseau Aiven. Render utilise des plages régionales partagées; des IP sortantes dédiées existent selon le plan.

### Santé, journaux et erreurs

- `/health` ne contrôle que la vivacité de l'API.
- `/health/ready` ouvre réellement une connexion PostgreSQL et renvoie un état générique, sans chaîne de connexion ni détail sensible.
- Les journaux du health check indiquent le type d'erreur, sans enregistrer le secret. Les logs ASP.NET Core sont disponibles sur la sortie standard et doivent être consultés depuis Render.
- Render impose un délai court aux contrôles HTTP et peut redémarrer les instances en échec. Pour éviter qu'une panne Aiven entraîne des redémarrages répétés, utiliser `/health` comme contrôle de processus Render et superviser `/health/ready` séparément; si le contrôle Render est configuré sur `/health/ready`, confirmer que la connexion répond dans le délai de la plateforme et accepter qu'une panne DB rende l'instance non saine.

### Traitements en arrière-plan

`ProcessingRunWorker` est enregistré comme `BackgroundService` dans le processus API et consomme les traitements persistés en PostgreSQL via `ProcessingRunQueue`; un service Render Background Worker distinct n'est donc pas nécessaire pour activer ce code. La prise de travail utilise `FOR UPDATE SKIP LOCKED` et la base comme file durable. Sur plusieurs instances API, vérifier la capacité et la concurrence de la base; le traitement ne doit pas être remplacé par une file en mémoire.

Les appels Gemini ont un délai maximal de 30 secondes par requête et trois tentatives au plus avec attente exponentielle et jitter pour les erreurs temporaires (quota, capacité ou timeout). Les erreurs d'authentification et autres erreurs permanentes ne sont pas retentées. Aucun autre modèle n'est sélectionné automatiquement; le modèle effectivement configuré est enregistré avec le traitement.

## C. Variables Render et valeurs nécessaires

Configurer les variables dans le tableau de bord Render ou un Environment Group protégé. Ne pas les mettre dans le Dockerfile, dans `render.yaml` avec une valeur réelle, dans GitHub ou dans une commande enregistrée. Render transmet aussi les variables aux builds Docker sous forme de build args; le Dockerfile backend ne les référence pas.

| Clé | Usage / état constaté | Origine |
|---|---|---|
| `ASPNETCORE_ENVIRONMENT` | Requis opérationnellement : `Production` | Paramètre Render |
| `PORT` | Fourni par Render; le Dockerfile l'utilise directement. Valeur Render par défaut : `10000` | Render; ne pas figer une autre valeur dans l'image |
| `ConnectionStrings__DefaultConnection` | Obligatoire hors Development; contient les mêmes paramètres d'accès Aiven déjà validés et `SSL Mode=VerifyFull;Root Certificate=/etc/secrets/aiven-ca.pem` | Secret Render, alimenté par l'administrateur autorisé |
| Fichier secret `aiven-ca.pem` | Accessible dans le conteneur sous `/etc/secrets/aiven-ca.pem` | Certificat officiel téléchargé depuis Aiven |
| `Ai__Gemini__ApiKey` | Requise pour les opérations IA; vide dans la configuration versionnée | Responsable IA/DSI, secret Render |
| `Ai__Gemini__Model` | `gemini-4-hydrogen`, modèle cible demandé; vérifier son accès effectif au démarrage et lors d'un appel de génération | Responsable IA/DSI |
| `AzureAd__TenantId` | Requis au démarrage; valeur versionnée vide | Administrateur Entra |
| `AzureAd__ClientId` | Requis au démarrage; ID de l'application API | Administrateur Entra |
| `AzureAd__AllowedClientId` | Requis au démarrage; ID de l'application frontend autorisée | Administrateur Entra |
| `AzureAd__Audience` | Requis au démarrage; doit correspondre à la revendication `aud` du jeton API | Administrateur Entra |
| `AzureAd__RequiredScope` | Requis au démarrage; scope API attendu dans `scp` | Administrateur Entra |
| Credential confidentiel API Entra | À configurer pour les acquisitions OBO Graph; aucun credential n'est dans `appsettings.json` | Administrateur Entra/DSI; secret ou certificat suivant la politique approuvée |
| `Graph__Scopes__0` et suivants | Aucun scope n'est configuré dans le fichier versionné; le fournisseur OBO exige au moins un scope approuvé à l'exécution | Administrateur Entra; scopes approuvés et consentis |
| `Cors__AllowedOrigins__0` et suivants | Au moins une origine est obligatoire au démarrage; chaque origine doit être HTTPS exacte, sans chemin ni joker | URL(s) publique(s) Cloud Run confirmée(s) |
| `AllowedHosts` | Actuellement `*`; à restreindre au nom d'hôte Render confirmé si la configuration d'hôte est activée | Responsable Render |

`AzureAd__Instance` a déjà une valeur par défaut Microsoft dans `appsettings.json`. Les identifiants Entra ne sont pas des secrets, mais doivent être fournis par la DSI; aucun ID ni scope ne doit être deviné. Le credential OBO et la clé Gemini sont des secrets et restent côté serveur.

Le chemin du CA n'a pas de variable séparée dans le code actuel : il est fourni dans l'option Npgsql `Root Certificate` de la chaîne de connexion. Il n'existe pas de clé `Aiven__CaCertificatePath` lue par l'API.

## D. Frontend : Google AI Studio, MSAL et appels API

L'interface existante utilise React 19, Vite et TypeScript. `main.tsx` initialise MSAL avant de monter l'application, `redirect.html` est déjà un point d'entrée de build séparé, les vues et services restent dans le dépôt. Le client API utilise `acquireTokenSilent` pour obtenir le scope API et transmet `Authorization: Bearer ...`. Les appels Graph navigateur restent dans les services MSAL/Graph existants. Aucun appel direct à Gemini n'est effectué depuis le frontend; l'appel Gemini reste côté backend.

Le client lisait `VITE_READMEETING_API_BASE_URL`, alors que la configuration demandée utilise `VITE_API_BASE_URL`. Le client accepte maintenant `VITE_API_BASE_URL` en priorité et conserve l'ancien nom comme alias de compatibilité. `.env.example` utilise le nouveau nom. Les deux valeurs sont publiques et intégrées au bundle Vite au moment du build; ce ne sont pas des paramètres secrets injectables après compilation.

### Import et évolution dans Google AI Studio

La documentation actuelle d'AI Studio Build Mode décrit l'import d'un projet GitHub existant et une synchronisation bidirectionnelle (push depuis AI Studio et pull depuis l'IDE). Elle décrit également la création d'applications web React avec un runtime Node.js et la publication d'applications Build Mode vers Cloud Run.

Donc, le dépôt existant peut être importé comme base de travail; cela ne justifie pas de le régénérer. La compatibilité de ce dépôt précis avec l'aperçu et le bouton Publish n'a pas été démontrée ici. Utiliser un dépôt/branche de développement isolé, demander uniquement des changements ciblés, puis examiner le diff Git avant tout merge. Rejeter toute génération qui supprime ou remplace l'authentification MSAL, `redirect.html`, les services API/Graph, la navigation ou les vues existantes.

AI Studio Build Mode gère un runtime Node full-stack; il ne faut pas supposer que sa publication est équivalente à une publication statique Vite existante. De plus, le dépôt n'a pas de script `start` de production Vite et son Dockerfile racine sert l'API .NET. Si AI Studio ne publie pas directement le projet importé sans restructuration, conserver l'application telle quelle et préparer un chemin Cloud Run distinct pour son build statique (serveur de fichiers/containeur frontend ou pipeline dédié). Aucun serveur frontend ni aucune nouvelle architecture n'a été ajoutée dans cette intervention.

## E. GitHub comme source de référence

1. Conserver la branche principale protégée et utiliser une branche dédiée pour connecter AI Studio.
2. N'accorder à l'intégration Google que l'accès au dépôt nécessaire, après validation des règles DSI sur le code et son traitement par un service tiers.
3. Synchroniser vers une branche de travail; examiner et intégrer les modifications par Pull Request.
4. Configurer Render pour déployer la branche backend approuvée; ne pas connecter un déploiement automatique à chaque branche expérimentale AI Studio.
5. Ne jamais synchroniser `.env.local`, un certificat ou des secrets. `.gitignore` exclut les fichiers `.env*` sauf `.env.example`; le contenu de `.env.local` n'a pas été ouvert. La configuration Render doit rester hors Git.

Aucun dépôt n'a été importé, lié ou synchronisé pendant cette mission.

## F. Frontend vers backend

`VITE_API_BASE_URL` doit être l'URL HTTPS publique du service Render, sans chemin d'API. Elle est définie au build Vite et nécessite un nouveau build si elle change. L'URL Render n'est pas encore connue et n'est pas inventée ici.

Configurer côté API `Cors__AllowedOrigins__0` avec l'origine exacte de l'interface Cloud Run (schéma et hôte seulement, pas de chemin). Le frontend utilise des jetons Bearer, pas une session cookie; garder la validation CORS restrictive.

Pour Entra, enregistrer dans la plateforme SPA les URI de redirection correspondant à chaque domaine effectivement utilisé : `https://<origine-frontend>/redirect.html`. La valeur `VITE_AZURE_REDIRECT_URI`, si définie au build, doit être identique. Le code retombe sinon sur l'origine active du navigateur avec `/redirect.html`. Entra doit aussi fournir `VITE_AZURE_CLIENT_ID`, `VITE_AZURE_TENANT_ID` et le scope API exact `VITE_READMEETING_API_SCOPE`. Ces valeurs doivent correspondre à la configuration backend `AzureAd:*`. Conserver les scopes Graph et permissions existants; aucune modification de consentement n'a été faite.

Ne jamais placer `Ai__Gemini__ApiKey`, une chaîne PostgreSQL ou un credential Entra confidentiel dans une variable `VITE_*`, car les valeurs Vite sont publiques dans les fichiers JavaScript compilés.

## G. Déploiement Render proposé

1. Confirmer le workspace, les droits et le plan Render adaptés à la production; choisir la région en tenant compte d'Aiven, de la latence et des règles de résidence.
2. Créer un Web Service depuis le dépôt GitHub et la branche backend validée. Choisir le runtime Docker, la racine du dépôt et le Dockerfile racine.
3. Ajouter le CA Aiven comme Secret File `aiven-ca.pem`. Vérifier son accessibilité par l'utilisateur non-root du conteneur et la rotation du certificat.
4. Ajouter les variables de production du tableau dans Render; mettre les valeurs sensibles uniquement dans les paramètres secrets. Ne pas lancer de migration au démarrage.
5. Configurer `/health` comme contrôle de processus Render; superviser `/health/ready` pour la disponibilité PostgreSQL ou choisir explicitement ce dernier comme health check après validation du délai et du comportement de redémarrage.
6. Déployer une première version contrôlée; examiner les logs, vérifier `/health`, `/health/ready`, l'authentification API et les appels vers Aiven, Graph et Gemini. Ne pas afficher les valeurs de configuration.
7. Après confirmation des IP sortantes Render, faire autoriser seulement les plages requises par le responsable Aiven si une restriction réseau est en vigueur. Aucune liste IP n'est supposée et aucune règle Aiven n'a été changée.

## H. Publication Google AI Studio / Cloud Run

**Option 1 — AI Studio Publish, après validation du projet importé :**

1. Importer le dépôt de travail via GitHub; ne jamais joindre `.env.local` ni fournir des secrets dans le prompt.
2. Vérifier dans l'aperçu que les pages, les appels API, MSAL et le callback `/redirect.html` fonctionnent encore.
3. Contrôler les changements proposés, synchroniser vers la branche de travail et faire relire le diff.
4. Vérifier l'éligibilité AI Studio/Google Cloud et les paramètres région, accès public, billing et domaine avant Publish. La documentation AI Studio indique que le Starter Tier est limité (notamment deux applications) et exclut certains comptes, dont Google Workspace; une organisation DGF devra probablement utiliser un projet Google Cloud payant, à confirmer.
5. Configurer les valeurs Vite publiques avant le build/publish et enregistrer l'URL Cloud Run finale dans CORS et Entra; ne pas présumer cette URL.

**Option 2 — pipeline Cloud Run dédié au Vite existant :**

Le dépôt contient le Dockerfile backend à sa racine; une publication source Cloud Run de la racine construirait donc ce backend, pas l'interface. Pour publier la SPA existante sans la réécrire, il faudra un build frontend distinct qui compile Vite puis sert `dist` sur le port `PORT` de Cloud Run. Cette configuration n'est pas créée ici, afin de ne pas imposer un serveur ou un nouveau mode de publication avant d'avoir choisi entre AI Studio Publish et un pipeline frontend dédié.

## I. Interventions externes et coûts

- **DSI / Entra** : IDs tenant et applications, audience, scope API, credential confidentiel OBO, scopes Graph approuvés et consentis, URI SPA Cloud Run, politiques de traitement du code par Google.
- **Responsable Render** : workspace, plan et région, nom de service/domaine, variables secrètes, fichier CA, logs/alertes, et plages d'IP sortantes.
- **Responsable Aiven** : confirmer la politique d'accès réseau et autoriser les egress Render retenus si nécessaire; ne pas toucher à la chaîne locale déjà validée.
- **Administrateur Google Cloud** : compte/projet, région Cloud Run, facturation, IAM, contraintes de domaine et politique de publication AI Studio. Le Starter Tier ne peut pas être présumé disponible pour un compte institutionnel.
- **Responsable frontend** : origine publique Cloud Run, URL publique Render, valeur exacte du scope API et valeurs Vite de build.

Render facture suivant le type/plan de service; le coût définitif dépend du dimensionnement, du plan de production, du réseau et des fonctions choisies. Cloud Run facture selon région, CPU/mémoire, modèle de facturation et nombre d'instances, avec un niveau gratuit soumis à conditions. Aiven et Google Gemini restent des coûts séparés. Faire les estimations dans les calculateurs officiels après choix de région et de charge; aucun prix mensuel arbitraire n'est fourni.

## Références officielles

- [Docker sur Render](https://render.com/docs/docker)
- [Web Services et port `PORT`](https://render.com/docs/web-services)
- [Variables et fichiers secrets Render](https://render.com/docs/configure-environment-variables)
- [Fichiers secrets pour Docker Render](https://render.com/docs/docker-secrets)
- [Health checks Render](https://render.com/docs/health-checks)
- [IP sortantes Render](https://render.com/docs/outbound-ip-addresses)
- [Google AI Studio Build Mode](https://aistudio.google.com/docs/aistudio-build-mode)
- [Publication d'apps AI Studio sur Cloud Run](https://aistudio.google.com/docs/aistudio-deploying)
- [Déploiement Cloud Run depuis le code source](https://cloud.google.com/run/docs/deploying-source-code)
- [Tarification Cloud Run](https://cloud.google.com/run/pricing)
