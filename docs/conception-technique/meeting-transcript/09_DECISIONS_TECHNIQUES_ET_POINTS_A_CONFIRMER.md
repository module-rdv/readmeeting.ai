# 09 — Décisions techniques et points à confirmer

## 1. Objet et règles de lecture

Ce registre distingue les décisions de conception proposées pour la brique 01, les constats observés dans le dépôt et les validations encore requises. Une décision technique proposée n'est pas une fonctionnalité livrée ni une validation DGF/Microsoft 365.

Les documents `docs/preparation-architecture/01..07` restent le référentiel global, non remplacé par ce dossier. Tout arbitrage incompatible est signalé ci-dessous, sans modifier ce référentiel.

## 2. Décisions de conception proposées pour la brique 01

| ID | Décision proposée | Justification | État |
|---|---|---|---|
| DTC-001 | Conserver/réutiliser le code TypeScript Graph et parsing observé côté navigateur comme référence fonctionnelle. | Évite de reconstruire les règles existantes ; tests mockés disponibles. | Proposition technique ; validation terrain A/B rapportée séparément |
| DTC-002 | Conserver le fallback strict : VTT d'abord ; uniquement `innerError.code=SpeakerAttributionNotAllowed` provoque même endpoint/transcriptId avec le header Accept alternatif. | Correspond au code et aux scripts de régression observés. | Règle normative à préserver |
| DTC-003 | Séparer contenu brut immuable, révision parsée, cues et événements d'exécution. | Intégrité, audit et retraitement sans écrasement. | Cible |
| DTC-004 | Ajouter API backend sécurisée, persistance tenant-scoped et ProcessingRun asynchrone. | Les capacités de persistance/orchestration backend ne sont pas établies comme opérationnelles. | Cible à concevoir |
| DTC-005 | Modéliser preuves en M:N via EvidenceSubject/EvidenceLink avec FK composites tenant. | Supporte plusieurs preuves par futur élément et réutilisation d'une preuve sans forcer l'extraction IA dans le MVP. | Cible, à valider avant migration |
| DTC-006 | Dériver tenant/acteur des claims `tid`/`oid` d'un token API validé côté serveur ; ignorer le tenant client comme autorité. | Défense contre accès croisé et falsification du tenant. | Exigence de sécurité proposée |
| DTC-007 | Employer les statuts/transitions ProcessingRun canoniques du document 07 ; run terminal immuable. | Évite les doubles sens et l'altération de l'historique. | Normatif pour les documents techniques |
| DTC-008 | Définir les contrats API sous `/api/v1` avec UUID locaux et IDs Graph nommés explicitement. | Cohérence de l'identité des ressources et suivi asynchrone. | Cible |
| DTC-009 | Limiter la brique 01 à récupération, parsing, validation structurelle, persistance et consultation du transcript. | Permet un lot autonome et préserve les frontières de sécurité. | Proposition de périmètre à confirmer |

## 3. Points à confirmer avant implémentation de la brique 01

| ID | Sujet | Décision/validation attendue | Responsable |
|---|---|---|---|
| PTC-001 | Backend .NET exécutable | Confirmer création/complétude de l'API, validation JWT, hébergement, CI et modèle de déploiement. | Architecture / équipe technique |
| PTC-002 | Base et stockage brut | Choisir le moteur, stratégie de chiffrement, object store éventuel, migrations, rétention, sauvegarde et purge. | DGF SI / sécurité / équipe technique |
| PTC-003 | Audience API et OBO | Confirmer application Entra API, audience/issuer, credentials serveur, scopes Graph délégués approuvés et consentement. | Administrateur M365 / sécurité |
| PTC-004 | Autorisation par réunion | Définir quels utilisateurs peuvent lister, traiter et consulter un meeting/transcript selon l'identité organisateur/invité et le tenant. | DGF métier / M365 / technique |
| PTC-005 | Retry/concurrence | Fixer nombre d'essais, délais, lease, timeouts, comportement des jobs interrompus et limites de débit. | Architecture / opérations |
| PTC-006 | Rétention | Fixer durée de contenu brut, cues, erreurs, événements et identifiants externes, et procédure d'effacement audité. | DGF / sécurité / juridique |
| PTC-007 | Critères de recette | Approuver seuils proposés et corpus non sensible de recette, distinguer tests mocks et Graph AUTH. | DGF métier / QA |

## 4. Arbitrages globaux à signaler (référentiel conservé)

Les documents globaux ne sont pas modifiés dans cette mission. Les écarts suivants doivent être arbitrés par leurs propriétaires avant le lot métier correspondant :

1. `docs/preparation-architecture/02_MODELE_DONNEES_METIER.md` emploie `reported` dans les statuts et ne reflète pas exactement le vocabulaire technique proposé `proposed, confirmed, decided, rejected, postponed, to_confirm`. DGF doit décider du statut canonique ; remplacer `reported` par `postponed` n'est pas décidé unilatéralement ici.
2. Le statut opérationnel d'une action (`in_progress`, `completed`) doit être distinct de son statut décisionnel. Le modèle global peut nécessiter un ajustement lorsque l'ActionItem sera implémenté.
3. Le diagramme de publication de `docs/preparation-architecture/01_ARCHITECTURE_CIBLE.md` place visuellement la publication en amont de la validation humaine, alors que le diagramme détaillé et le plan de recette demandent validation avant version finale/contrôles/publication. Le propriétaire du référentiel doit corriger cet ordre global.
4. Le flux documentaire (extraction + preuves → brouillon → validation liée à une version → génération/version finale → contrôles → publication) est hors brique 01, mais reste requis si le lot documentaire est autorisé.
5. Les trois scénarios métier de l'agent Teams définis globalement restent impératifs dans le lot live : hôte organisateur, hôte invité, instance déjà lancée. Ils ne constituent pas une capacité de récupération Graph post-réunion.

## 5. Validations Graph et Microsoft 365 — état explicitement séparé

- **Observé dans le code :** scopes demandés, appels Graph côté navigateur, récupération et parseurs.
- **Scripts mockés :** comportement local des réponses simulées, notamment fallback et erreurs.
- **Rapporté par le responsable :** tests terrain A/B de récupération transcript réussis. Cette validation ne doit être ni contestée ni confondue avec les scripts automatisés.
- **Non démontré par la revue documentaire :** nouvel appel Graph authentifié, OBO backend, consentement effectif de chaque scope, accès universel selon rôle/organisateur, permission de publication SharePoint.

À faire valider par M365 : identité d'application, audience API, scopes délégués minimaux, consentement, politiques d'accès et autorisation aux réunions réelles. Toute permission SharePoint est indépendante et hors lot brique 01.

## 6. Lots explicitement distincts

- **Brique 01 :** réunions, résolution, découverte/récupération Graph, fallback, parsing, normalisation, validation structurelle, persistance, suivi, consultation.
- **Lot IA métier :** Topics/Facts/Proposals/Decisions/Actions et EvidenceLinks, décisions gouvernance/fournisseur et recette métier.
- **Lot documentaire :** modèle DGF, brouillon, validation humaine versionnée, génération DOCX/PDF, contrôles et publication SharePoint.
- **Lot agent Teams live :** faisabilité Microsoft distincte, hébergement et permissions dédiés, avec les trois scénarios métier obligatoires.

Les interfaces futures ne doivent pas être confondues avec des dépendances déjà disponibles.

## 7. Conclusion

La conception corrigée peut servir de base à une spécification de la brique 01 après arbitrage des PTC-001 à PTC-007. Les points du référentiel global listés section 4 sont explicitement en attente de leurs propriétaires ; aucun changement silencieux n'a été appliqué aux sept documents.
