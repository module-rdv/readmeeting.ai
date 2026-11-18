# Audit préalable — `InitialPostgres`

## Périmètre et état distant

Audit en lecture seule de la migration `20261116140923_InitialPostgres`, du modèle EF Core PostgreSQL, du snapshot et de la base Aiven configurée localement. Aucune migration ni modification de données n'a été exécutée.

La connexion a été ouverte via le `ReadMeetingDbContext` de l'application dans une transaction PostgreSQL déclarée `READ ONLY`.

| Vérification | Résultat observé |
|---|---|
| Base courante | `defaultdb` |
| Schéma courant | `public` |
| Version serveur | PostgreSQL 18.7 |
| TLS de la session d'audit | Actif, TLS 1.3 |
| Schémas non système | `public` uniquement |
| Relations dans les schémas non système | Aucune |
| `public.__EFMigrationsHistory` | Absente |
| Conflit de nom avec une table prévue dans `public` | Aucun |

L'absence de relations a été constatée dans les catalogues PostgreSQL; aucun objet n'a été créé pour cet audit.

## Résultat de comparaison

- La migration, son fichier Designer et `ReadMeetingDbContextModelSnapshot` correspondent au modèle PostgreSQL examiné.
- `dotnet ef migrations has-pending-model-changes` a réussi et a indiqué qu'aucune modification n'existe depuis la dernière migration.
- Les 17 entités métier persistées et les 17 tables de l'`Up` concordent. Les deux entités d'association (`DecisionEvidence`, `ActionEvidence`) sont également présentes.
- Le fournisseur est Npgsql EF Core 10.0.3 avec EF Core 10.0.13. Les migrations PostgreSQL sont isolées dans `ReadMeeting.PostgreSqlMigrations`; les migrations historiques SQL Server ne font pas partie de cette série.

## Opérations `Up`

L'`Up` crée 17 tables et 32 index. Il définit 26 clés étrangères, 18 clés primaires (17 applicatives plus celle de l'historique EF), 3 clés alternatives/uniques déclarées comme contraintes et 8 contraintes `CHECK`. Il n'y a pas d'`ALTER`, de `DROP`, de reprise ou de copie de données dans `Up`.

Les types PostgreSQL employés sont `uuid`, `boolean`, `integer`, `bigint`, `character varying(n)`, `character(n)`, `text` et `timestamp with time zone`. Les énumérations/status sont stockés sous forme de chaînes `character varying`; les dates sont des timestamps avec fuseau; les GUID sont les identifiants de clé. Le snapshot contient l'annotation Npgsql d'identité par défaut, mais cette migration n'a pas de colonne numérique auto-incrémentée.

| Table | Colonnes et principaux types |
|---|---|
| `Tenants` | `Id`, `EntraTenantId` UUID; `TenantCode` varchar(100), `DisplayName` varchar(300), `Status` varchar(24); dates timestamptz |
| `Users` | clés et `EntraObjectId` UUID; `Upn`/`Mail` varchar(320), `DisplayName` varchar(300), `IsActive` boolean; dates |
| `HostProfiles` | clés et `UserAccountId` UUID; nom préféré varchar(300), poste et bureau varchar(200); dates |
| `Meetings` | clés et organisateur UUID; Graph ID varchar(500), titre varchar(500), description varchar(4000), dates de réunion timestamptz, email varchar(320), nom varchar(300), code de service varchar(100), URL varchar(2048), statut varchar(32) |
| `Captures` | clés UUID; méthode varchar(32), statut varchar(24), référence source varchar(2048), date de capture |
| `Transcripts` | clés UUID; Graph transcript ID varchar(500), format/mode varchar(40), langue varchar(20), statut varchar(24), dates de récupération/analyse |
| `TranscriptRevisions` | clés UUID; numéro integer, format/mode varchar(40), contenu brut text, référence varchar(2048), hash `character(64)`, type de contenu et Graph request ID varchar(200), date de récupération |
| `TranscriptCues` | clés UUID; séquence integer, temps bigint, locuteur varchar(300), attribution varchar(24), texte et texte normalisé text |
| `ProcessingRuns` | clés/références UUID; idempotency key varchar(200), hashes varchar(64), version parseur varchar(100), modèle varchar(200), erreur varchar(2000), analyse text, statut varchar(40), tentative integer, dates |
| `ProcessingEvents` | clés UUID; tentative/HTTP/retry integer; étapes, statuts et codes varchar; message expurgé varchar(2000), date d'événement |
| `MeetingReports` | clés UUID; titre varchar(500), référence varchar(100), résumés et contenu JSON text, URL SharePoint varchar(2048), ID SharePoint varchar(500), approbation varchar(24), email varchar(320), dates |
| `Decisions` | clés/références UUID; texte varchar(4000), statut varchar(24), type varchar(32), nom du valideur varchar(300) |
| `ActionItems` | clés/références UUID; titre varchar(500), description varchar(4000), responsable varchar(300), email varchar(320), échéance timestamptz et texte varchar(300), priorité/statut varchar(24) |
| `SourceEvidence` | clés/références UUID; type varchar(32), locator/URI varchar(2048), extrait varchar(4000), hash `character(64)`, temps bigint |
| `AuditLogs` | clés/références UUID; type d'entité varchar(200), action varchar(100), détails JSON text, request ID varchar(200), IP varchar(64) |
| `ActionEvidence` | clé primaire composite UUID `(TenantId, ActionItemId, SourceEvidenceId)` |
| `DecisionEvidence` | clé primaire composite UUID `(TenantId, DecisionId, SourceEvidenceId)` |

`CreatedAt`, `UpdatedAt` et les autres dates de création/traitement sont `timestamp with time zone`. Les détails complets, nullabilités, longueurs exactes et noms de contraintes/index sont dans le [script SQL généré](./initial-postgres.sql).

### Relations et isolation par tenant

Toutes les entités métier tenant-scoped ont une clé primaire composite `(TenantId, Id)`; les clés étrangères vers ces entités incluent `TenantId`. La racine `Tenants` a `Id` comme clé et `Users`/`Meetings` la référencent. Cette modélisation empêche les références relationnelles inter-tenant.

Relations créées :

- `Users` → `Tenants`; `HostProfiles` → `Users` (relation 1:1, index unique).
- `Meetings` → `Tenants` et, facultativement, → organisateur `Users`.
- `Captures`, `Transcripts`, `MeetingReports`, `Decisions`, `ActionItems`, `SourceEvidence` → `Meetings`.
- `Decisions` → utilisateur valideur facultatif; `ActionItems` → décision et responsable utilisateur facultatifs.
- `TranscriptRevisions` → `Transcripts`, avec clé composite qui impose le même meeting; `TranscriptCues` → révision.
- `ProcessingRuns` → meeting, transcript facultatif associé au même meeting, et utilisateur demandeur; `ProcessingEvents` → traitement.
- `SourceEvidence` → meeting, et facultativement révision/cue de transcription. Les clés composites imposent la cohérence tenant, meeting et révision.
- `ActionEvidence` → action et source; `DecisionEvidence` → décision et source.

Les suppressions référencées sont `RESTRICT`. Les tables d'association ont des clés primaires composites couvrant le tenant et les deux références. Les contraintes `CHECK` couvrent l'ordre des dates de réunion, les compteurs/hash de traitement, les numéros et positions de révision/cue ainsi que le lien d'une preuve à un cue.

Les filtres globaux EF Core et la validation du tenant dans `SaveChanges` complètent ces contraintes. Aucun Row-Level Security PostgreSQL n'est défini dans cette migration: l'isolation de lecture dépend donc aussi du chemin applicatif et des permissions du rôle SQL; les clés/FK composites constituent la protection structurelle contre les associations croisées.

### Index, valeurs par défaut et règles métier

Les 32 index incluent les index de parcours tenant/statut/date, les références Graph uniques filtrées lorsqu'elles sont nulles, les références de compte rendu uniques par tenant, l'idempotence des traitements et l'unicité d'un traitement actif par transcript/version de parseur. La migration ne déclare aucun `DEFAULT` SQL. Les valeurs initialisées dans les entités (statuts, GUID, dates) restent des valeurs fournies par l'application, pas des valeurs par défaut garanties lors d'un insert SQL direct.

Les principaux contrôles SQL sont :

- fin de réunion strictement après le début quand les deux dates existent;
- `AttemptCount >= 0` et hash de requête de longueur 64;
- numéro de révision et séquence de cue strictement positifs;
- début de cue non négatif et fin non antérieure au début;
- cohérence requise entre type de preuve et présence d'un cue.

## Compatibilité et risques

- Les types et fonctions employés (`uuid`, `timestamptz`, `character varying`, `character`, `LENGTH`, index partiels, blocs `DO`) sont compatibles avec PostgreSQL 18 et générés par le fournisseur Npgsql.
- Les noms d'objets sont quotés et conservent leur casse; l'accès SQL manuel devra donc utiliser la casse exacte.
- L'`Up` ne transforme ni ne supprime de données existantes. L'instance examinée est vide de relations utilisateur et d'historique EF; aucun conflit prévisible n'a été observé.
- Le `Down` supprime les 17 tables: l'exécuter après insertion de données entraînerait leur perte. Ne pas utiliser de rollback sans sauvegarde et validation.
- Les réunions, transcriptions, noms, emails, éléments d'audit, contenus bruts et analyses sont persistés sans chiffrement applicatif visible dans ce modèle. TLS protège le transport; les exigences de chiffrement au repos, sauvegarde, accès, conservation et suppression doivent être vérifiées côté Aiven/exploitation.
- La contrainte `CK_ProcessingRun_RequestPayloadHash` valide la longueur, pas le format hexadécimal. Ce n'est pas un blocage de création mais la validation stricte du format relève de l'application si elle est requise.

## Script prévisionnel

Le fichier [initial-postgres.sql](./initial-postgres.sql) a été généré avec EF Core en mode idempotent pour la migration `20261116140923_InitialPostgres`. Il n'a pas été exécuté. Il contient la création standard de `__EFMigrationsHistory`, les gardes sur l'identifiant de migration, les 17 créations de tables, les index et l'enregistrement de la migration. Les gardes idempotentes portent sur l'historique EF; elles ne rendent pas inoffensif un conflit avec un objet préexistant. L'inventaire distant actuel ne révèle aucun tel objet.

Le SQL généré ne fixe pas le nom de la base et n'ajoute pas de qualification `public.` aux objets : la base est choisie par la connexion, et le schéma effectif dépend de `search_path`. Sur la connexion Aiven vérifiée, la base courante est `defaultdb`, `current_schema()` vaut `public` et aucun autre schéma utilisateur n'existe. Pour reproduire ce ciblage lors d'une exécution manuelle, se connecter à `defaultdb` avec `search_path` résolvant vers `public` (ou utiliser le DbContext de l'application avec sa configuration vérifiée).

## Verdict

**Prête techniquement pour une première application sur l'état Aiven observé**, sans incohérence modèle/snapshot/migration ni conflit de noms constaté. Le verdict ne vaut que pour l'état lu à cet instant; refaire l'inventaire immédiatement avant le déploiement si le schéma a pu changer.

**Aucune migration n'a été appliquée.** L'application de `InitialPostgres` reste suspendue à l'autorisation explicite de l'utilisateur.
