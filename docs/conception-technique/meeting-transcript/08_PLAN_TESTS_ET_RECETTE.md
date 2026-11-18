# 08 — Plan de tests et de recette

## 1. Objet et niveaux de preuve

Les cas ci-dessous sont des exigences de validation, pas des résultats de test déclarés. Aucun test, build ou lint n'a été exécuté dans le cadre de l'harmonisation documentaire.

Les scripts TypeScript existants, notamment `scripts/test-transcript-service.ts`, utilisent un client Graph simulé pour une partie des scénarios. Ils vérifient la logique locale, non une identité/token/permission Microsoft 365 réelle. Le responsable du projet a rapporté séparément la validation terrain des scénarios A/B ; ne pas la présenter comme une reproduction par les scripts.

### Niveaux

1. **UT — unitaire, mocks/fakes** : parseurs, diagnostics, contrats et règles déterministes.
2. **IT — intégration contrôlée** : API, base/storage de test, OBO simulé ou tenant de test explicitement isolé.
3. **Graph AUTH — validation Graph authentifiée** : environnement de test autorisé, identité, tenant, consentements, réunion et résultat consignés ; aucune donnée réelle hors périmètre.
4. **REC DGF — recette fonctionnelle** : jeux approuvés par le métier, critères de décision, résultats et approbation DGF documentés.

Un résultat d'un niveau inférieur n'établit pas automatiquement le niveau supérieur.

## 2. Format obligatoire d'un cas de test

Chaque cas possède un identifiant unique, objectif, préconditions, données d'entrée, scénario, résultat attendu, assertions, niveau et preuve de réussite. Les cas Graph AUTH et REC DGF doivent conserver date, build/version, environnement/tenant, compte de test, corrélation/request IDs non secrets et verdict. Aucun token ni contenu sensible complet ne doit figurer dans la preuve de test.

## 3. Cas unitaires — parsing et erreurs

| ID | Objectif | Préconditions et entrée | Scénario | Résultat et assertions | Niveau / preuve |
|---|---|---|---|---|---|
| UT-TR-001 | Préserver le parsing VTT existant | VTT valide avec 2 cues/speakers et timestamps | Analyser le VTT | 2 cues attendus, texte/nom/timestamps exacts, ordre d'entrée conservé, durée correcte | UT ; sortie d'assertions |
| UT-TR-002 | Parser format Graph sans attribution | Texte alternatif horodaté, cues désordonnées, lignes de continuation | Parser le contenu | Texte conservé, cues ordonnées par timestamp selon règle spécifiée, `speakerName=null`, label `unattributed`, `speakersCount=0` | UT ; assertions + fixture non sensible |
| UT-TR-003 | Rejeter timestamps invalides | Cues négatives, illisibles ou fin antérieure au début | Appeler validateur structurel | Échec codé, aucune révision publiée comme valide, pas de correction silencieuse | UT ; code d'erreur/assertions |
| UT-TR-004 | Ne pas perdre le contenu source | Raw VTT et raw texte avec retours lignes | Parser puis comparer | Révision source/hash identiques à l'entrée octet ; normalisation séparée | UT ; hash attendu |
| UT-TR-005 | Fallback strictement ciblé | Mock premier retour 403 innerError `SpeakerAttributionNotAllowed`; second 200 | Appeler le service | Deux appels même chemin et même transcriptId ; premier `$format=text/vtt`; second Accept exact sans `$format`; parseur non attribué | UT ; trace mock d'appels |
| UT-TR-006 | Ne pas déclencher fallback pour autre erreur | Mock 403 `AccessDenied` | Appeler le service | Un seul appel, erreur Graph originale conservée | UT ; assertions |
| UT-TR-007 | Conserver erreur du fallback refusé | Premier appel SpeakerAttributionNotAllowed, second Graph 403 autre code | Appeler le service | Aucun faux succès ; status/code/request-id du second appel conservés ; premier diagnostic fallback relié au run | UT ; assertions |
| UT-TR-008 | Respecter Retry-After | Mock Graph 429 avec header valide | Classer l'erreur | Erreur `retryable`, secondes extraites et non négatives ; aucun retry immédiat imposé par le parseur | UT ; assertions |
| UT-TR-009 | Redaction journal | Erreur simulée contenant token/URL/contenu | Émettre diagnostics | Aucun bearer/token ni texte source dans l'événement ; codes/status/correlation conservés | UT ; capture de logs |

## 4. Cas d'intégration — API, persistance, concurrence

| ID | Objectif | Préconditions et entrée | Scénario | Résultat et assertions | Niveau / preuve |
|---|---|---|---|---|---|
| IT-API-001 | Valider le JWT API | API de test, tokens valides/invalide, audience connue | Appeler route avec token | Valide : accès selon rôles ; mauvaise signature/issuer/audience/exp : 401 ; token Graph destiné à Graph n'est pas accepté comme token API | IT ; rapport API |
| IT-TEN-001 | Bloquer le tenant fourni par client | Deux tenants A/B et réunions isolées ; utilisateur A | A demande tenantId=B ou réunion B | Serveur prend `tid` vérifié, refuse/masque la ressource ; aucune donnée B révélée | IT ; assertions négatives et DB |
| IT-TEN-002 | Bloquer les relations inter-tenant | Données A/B ; tentative FK Evidence/Link croisée | Insérer relation dont parent est B sous tenant A | Contrainte FK composite refuse ; transaction sans ligne partielle | IT ; rapport DB |
| IT-API-002 | Contrat de démarrage asynchrone | Utilisateur autorisé, meeting local présent | POST route canonique avec clé idempotence | `202`, `Location`, run local `queued`, aucun faux état terminal ni token dans réponse | IT ; JSON/header capturés |
| IT-API-003 | Suivre un run | Run créé dans différents états | GET `/api/v1/processing-runs/{runId}` | Retourne statut exact, accès tenant vérifié, erreurs redacted, résultat seulement après `succeeded` | IT ; réponses vérifiées |
| IT-IDEM-001 | Rejouer même clé et payload | Première demande déjà enregistrée | Répéter POST identique | Même runId ; 202 actif ou 200 terminal ; aucune duplication de run/segments | IT ; assertions DB/API |
| IT-IDEM-002 | Réutilisation de clé incompatible | Clé existante, payload modifié | POST avec même clé | `409 IDEMPOTENCY_KEY_REUSED`; aucun second run créé | IT ; assertion API/DB |
| IT-IDEM-003 | Deux demandes simultanées | Workers concurrents, même entrée logique | POST concurrent avec clés distinctes | Un run actif acquis ; réponses pointent vers le même run ; un seul worker possède lease valide | IT ; trace concurrence |
| IT-IDEM-004 | Reprocessing volontaire | Résultat `succeeded`, nouvelle clé et `forceReprocess=true` | Relancer traitement | Nouveau run et historique ; ancien run reste immuable ; nouvelle révision ne détruit pas l'ancienne | IT ; comparaison DB |
| IT-IDEM-005 | Tracer chaque demande distincte | Même résultat existant, nouvelle arrivée HTTP | Soumettre une nouvelle clé puis une répétition de clé identique | Chaque arrivée produit un `ProcessingRequestEvent` distinct avec l'issue correcte ; aucune duplication worker/run pour la répétition | IT ; événements append-only + DB |
| IT-RUN-001 | Reprise après panne worker | Run actif, lease expiré, événements append-only | Reprendre le job | Même runId, tentative incrémentée, ancien événement conservé, pas de double insertion | IT ; journaux/DB |
| IT-STORE-001 | Atomicité de persistance | Base de test, injection panne pendant les cues | Échouer la transaction | Aucun run `succeeded` et aucune série de cues partielle ; source/empreinte conforme à stratégie | IT ; vérification DB |
| IT-RUN-002 | États terminaux immuables | Runs succeeded/failed_permanent | Tenter transition ultérieure | Refusée et auditée ; nouveau traitement exige nouvelle demande | IT ; assertions |

## 5. Cas Graph authentifiés — exécution future requise

Les cas ci-dessous doivent être exécutés uniquement avec autorisation DGF/M365, identité de test approuvée et réunions de test. Leur description ne constitue pas un résultat déjà obtenu.

| ID | Objectif | Préconditions/entrée | Scénario | Résultat attendu/assertions | Niveau / preuve |
|---|---|---|---|---|---|
| GA-001 | Accès VTT standard | Consentement effectif, réunion/transcript test accessibles | Auth MSAL/OBO autorisé, liste et contenu VTT | Résolution, découverte, téléchargement et parse réussis ; identité, tenant, endpoint et request-id tracés sans token/contenu | Graph AUTH ; compte rendu de test signé |
| GA-002 | Fallback tenant attribution | Tenant/réunion où le premier format retourne le code exact | Appel VTT puis fallback | Première réponse exacte consignée ; second appel même endpoint/transcriptId avec Accept requis ; résultat Graph réel et parsing vérifiés | Graph AUTH ; request-ids des 2 appels |
| GA-003 | Erreur permission/tenant | Identité de test sans droit ou politique de test contrôlée | Appel bloqué | Erreur Graph fidèle et absence de fallback hors code ciblé ; aucune fuite | Graph AUTH ; rapport administrateur |
| GA-004 | Rate limit et Retry-After | Environnement/simulation Graph autorisée | Réponse 429 effective ou mock explicitement séparé | Service attend selon politique avant retry, garde limite, pas de run dupliqué | Graph AUTH si possible, sinon IT explicitement marquée |
| GA-005 | Identités et accès ressource | Scénarios d'identité autorisés (organisateur/invité) | Tester uniquement droits approuvés | Résultats distincts et vérifiés ; aucun accès supposé par présence du scope | Graph AUTH ; matrice identité/meeting |

## 6. Recette fonctionnelle DGF — cas hors périmètre direct ou de frontière

| ID | Objectif | Préconditions/entrée | Scénario | Résultat attendu/assertions | Niveau / preuve |
|---|---|---|---|---|---|
| DGF-TR-001 | Utilisabilité du transcript attribué | Réunion de test approuvée, résultat `succeeded` | Opérateur consulte les cues | Contenu exploitable, provenance et timestamps cohérents avec la source | REC DGF ; PV métier |
| DGF-TR-002 | Utilisabilité du transcript non attribué | Transcript fallback accessible | Opérateur consulte la transcription | Mode sans attribution visible, aucun nom fabriqué, chronologie compréhensible | REC DGF ; PV métier |
| DGF-TR-003 | Contrôle d'accès par réunion | Utilisateur DGF sans droit sur un Meeting | Tente lecture et démarrage | Aucune consultation ni traitement ; refus expliqué sans divulgation | REC DGF + IT |
| DGF-TR-004 | Limite de la brique 01 | Résultat transcript persistant | Vérifier les sorties proposées | Aucun résultat IA, document officiel, publication SharePoint ou présence Teams revendiqué comme produit de cette brique | REC DGF ; checklist de périmètre |

### Cas de frontière du futur lot documentaire (non bloquants pour livrer la brique 01)

| ID | Objectif | Préconditions/entrée | Scénario | Résultat attendu/assertions | Niveau / preuve |
|---|---|---|---|---|---|
| DOC-001 | Validation attachée à la version | Brouillon immuable et version de revue avec hash; reviewer autorisé | Approuver puis modifier le contenu | Approbation réfère à l'ancienne version/hash ; modification crée une nouvelle version et invalide l'approbation pour publication | IT/REC DGF ; assertions version et audit |
| DOC-002 | Ordre de publication | Version approuvée, génération finale et contrôles définis | Tenter publication avant validation, puis après modification approuvée | Pré-validation ou approbation périmée bloque ; seul le contenu final correspondant au contenu approuvé et ayant passé les contrôles peut être publié | IT/REC DGF ; transitions et référence publication |

La validation métier de décisions/actions, génération documentaire et approbation versionnée appartient à un lot distinct. Ces cas seront planifiés lors de ce lot et ne sont pas un critère d'acceptation de la brique 01.

## 7. Critères d'acceptation mesurables de la brique 01

À faire valider par DGF et sécurité avant exécution :

- 100 % des réponses fallback utilisent le même transcriptId et l'en-tête Accept exact, sans `$format` alternatif ;
- 100 % des cues non attribuées n'ont aucun nom d'intervenant attribué ;
- 100 % des cues persistées référencent une révision/hash source et respectent les invariants de structure ;
- 0 relation ou réponse inter-tenant dans tous les tests négatifs prévus ;
- 0 doublon de run actif pour la même entrée logique dans les tests de concurrence ;
- 0 transition de run terminal ;
- 0 token, secret ou texte intégral de transcript dans les journaux techniques ;
- tous les cas de persistance réussissent sur le moteur/version de base retenus avant acceptation.

Ces seuils sont des propositions techniques, pas des seuils métier approuvés.

## 8. Éléments disponibles et limites

- `scripts/test-transcript-service.ts` contient des tests/logiques avec Graph mocké pour parsing, fallback et erreurs ; ils sont une base de régression frontend.
- Les tests API, JWT/OBO, persistance, isolation DB, concurrence et reprise backend sont à développer après validation de l'architecture cible.
- La validation terrain rapportée par le responsable des scénarios A/B demeure distincte ; aucun test Graph AUTH n'a été exécuté dans le cadre de ce document.
- Aucun seuil DGF, environnement M365 de test ou permission SharePoint n'est confirmé par le présent plan.

## 9. Évolution — tableau de bord personnel Microsoft Graph

Le tableau de bord personnel utilise les événements réels du calendrier Outlook de l'utilisateur authentifié comme source de référence. Les agrégats de la base ReadMeeting et les données de démonstration ne doivent pas alimenter ses indicateurs.

### Règles de calcul et de collecte

- Profil : appeler `/me` et comparer les adresses exactes `mail` / `userPrincipalName` avec l'organisateur et la liste `attendees`. Ne pas déduire le rôle du titre ou du nom d'affichage.
- Période annuelle : interroger `/me/calendarView` de minuit le 1er janvier à minuit le 1er janvier suivant, bornes calculées dans le fuseau local du navigateur puis converties en instants UTC. Suivre chaque `@odata.nextLink` et dédupliquer par identifiant Graph. Les occurrences récurrentes distinctes restent des réunions distinctes.
- Événement compté comme réunion : événement non annulé, hors `seriesMaster`, et ayant une liste de participants ou les attributs de réunion en ligne fournis par Graph.
- « Organisées par moi » : adresse e-mail exacte de l'organisateur identique à une identité du profil Graph/MSAL.
- « Où je suis invité(e) » : adresse e-mail exacte présente dans `attendees` et différente de l'organisateur. Cela établit une invitation, pas une présence effective.
- Moyenne : compter les entrées `attendees` uniques fournies par Graph, organisateur et ressources exclus; ne pas ajouter un organisateur absent de cette liste. Exclure du dénominateur les réunions sans liste exploitable et afficher le nombre de réunions retenues.
- Transcriptions : vérifier uniquement les réunions Teams terminées avec le service de résolution existant. Une métadonnée de transcription retournée par Graph confirme sa disponibilité; le tableau de bord ne télécharge pas le contenu. Le cache du service est conservé (10 minutes après confirmation, 2 minutes après erreur, sauf règle `Retry-After` existante).
- Présenter distinctement absence confirmée, autorisation manquante, authentification, refus/partage restreint, réunion non résolue et erreur temporaire. Une erreur 403, 429 ou 5xx ne signifie jamais « aucune transcription ».
- Réunions imminentes : requêter les événements de la prochaine heure, afficher également les réunions actuellement en cours, trier par début et actualiser cette section automatiquement chaque minute. N'afficher que les attributs et liens réellement renvoyés par Graph.
- Les lectures calendrier/profil utilisent les permissions déléguées déjà configurées (`User.Read`, `Calendars.Read`, `OnlineMeetings.Read`). La vérification des transcriptions requiert le scope délégué existant `OnlineMeetingTranscript.Read.All` et le consentement administrateur applicable; aucune permission nouvelle n'est implicite.

### Cas de validation ciblés

| ID | Objectif | Résultat attendu | Niveau / preuve |
|---|---|---|---|
| GD-001 | Charger les événements d'une année avec pagination | Toutes les pages sont parcourues; aucun doublon d'identifiant; événements annulés et éléments non réunions exclus | UT/Graph AUTH ; nombre de pages et assertions |
| GD-002 | Compter organisateur et participant | Comparaison exacte des adresses du profil; une invitation n'est jamais présentée comme une présence | UT/Graph AUTH ; assertions sur événements non sensibles |
| GD-003 | Calculer la moyenne des participants | Organisateur exclu, participants uniques, réunions sans données exploitables hors dénominateur | UT ; total, dénominateur et moyenne |
| GD-004 | Distinguer les états de transcription | Seules les métadonnées confirmées sont comptées; 403/429/5xx restent des états d'accès/erreur | UT/Graph AUTH ; réponses et catégories |
| GD-005 | Afficher les réunions imminentes | Toutes les réunions dans la fenêtre sont triées et affichent les données Graph disponibles; actualisation manuelle et périodique | Graph AUTH ; vérification navigateur |
| GD-006 | Vérifier le refus de permission | Scope manquant affiché comme autorisation manquante; aucune valeur de transcription n'est inventée | Graph AUTH ; diagnostic MSAL sans jeton |

Une compilation ou des tests avec Graph simulé ne constituent pas une preuve Graph AUTH. La recette réelle doit être exécutée avec le compte et le tenant autorisés; aucune transcription réelle ne doit être envoyée à un fournisseur IA par cette fonctionnalité.
