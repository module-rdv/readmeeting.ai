/**
 * ReadMeeting.ai | Direction Générale des Financements (DGF)
 * Suite de tests unitaires et d'intégration exhaustive pour le service de transcription Teams,
 * la distinction rigoureuse des erreurs Graph, et les règles de gouvernance DGF.
 */

import {
  getMeetingTemporalStatus,
  detectUserMeetingRole,
  timeStringToSeconds,
  parseVttTranscript,
  parseUnattributedTranscript,
  NON_ATTRIBUTED_SPEAKER_LABEL,
  createTranscriptExport,
  explainTranscriptError,
  checkMeetingTranscriptStatus,
  enforceHumanValidationGate,
  purgeTranscriptCache,
  resolveOnlineMeetingId,
  fetchMeetingTranscripts,
  fetchTranscriptContent
} from '../src/services/transcriptService';
import { getTranscriptAccessToken } from '../src/services/graphClient';
import { DgfUserProfile } from '../src/types/auth';
import { MeetingItem } from '../src/types/meeting';

let passedTests = 0;
let totalTests = 0;

function assert(condition: boolean, testName: string, detail: string = '') {
  totalTests++;
  if (condition) {
    passedTests++;
    console.log(`[SUCCÈS] Test ${totalTests} : ${testName}`);
  } else {
    console.error(`[ÉCHEC] Test ${totalTests} : ${testName} - ${detail}`);
    process.exitCode = 1;
  }
}

function createMockGraphClient(
  handler: (
    endpoint: string,
    filter?: string,
    query?: Record<string, string>,
    headers?: Record<string, string>
  ) => unknown | Promise<unknown>
) {
  return {
    api: (endpoint: string) => {
      let filterValue: string | undefined;
      let queryValue: Record<string, string> | undefined;
      const headerValues: Record<string, string> = {};
      const request = {
        filter(value: string) {
          filterValue = value;
          return request;
        },
        select() {
          return request;
        },
        query(value: Record<string, string>) {
          queryValue = value;
          return request;
        },
        header(name: string, value: string) {
          headerValues[name] = value;
          return request;
        },
        headers(value: Record<string, string>) {
          Object.assign(headerValues, value);
          return request;
        },
        responseType() {
          return request;
        },
        get() {
          return handler(endpoint, filterValue, queryValue, headerValues);
        },
      };
      return request;
    },
  } as any;
}

function rawGraphResponse(
  status: number,
  body: unknown,
  requestId = 'test-request-id',
  contentType?: string
) {
  const text = typeof body === 'string' ? body : JSON.stringify(body);
  return {
    status,
    headers: {
      get: (name: string) => {
        const headers: Record<string, string> = {
          'content-type': contentType || (typeof body === 'string' ? 'text/vtt' : 'application/json'),
          'request-id': requestId,
        };
        return headers[name.toLowerCase()] || null;
      },
    },
    text: async () => text,
  };
}

console.log('========================================================================');
console.log('TESTS DE CONSOLIDATION TRANSCRIPTIONS TEAMS MICROSOFT GRAPH — READMEETING.AI');
console.log('========================================================================\n');

// --- 1. Statut temporel de réunion & Absence de prétention de capture ---
console.log('--- 1. Évaluation du statut temporel & absence de capture audio autonome ---');
const now = new Date('2026-03-04T12:00:00Z');

const futureStart = '2026-03-04T14:00:00Z';
const futureEnd = '2026-03-04T16:00:00Z';
assert(
  getMeetingTemporalStatus(futureStart, futureEnd, now) === 'scheduled',
  'Réunion future correctement identifiée comme scheduled'
);

const currentStart = '2026-03-04T11:30:00Z';
const currentEnd = '2026-03-04T13:00:00Z';
assert(
  getMeetingTemporalStatus(currentStart, currentEnd, now) === 'in_progress',
  'Réunion en cours correctement identifiée comme in_progress'
);

const pastStart = '2026-03-04T08:00:00Z';
const pastEnd = '2026-03-04T10:00:00Z';
assert(
  getMeetingTemporalStatus(pastStart, pastEnd, now) === 'completed',
  'Réunion passée correctement identifiée comme completed'
);

// --- 2. Conversion des timestamps et parsing WebVTT ---
console.log('\n--- 2. Parsing et extraction des transcriptions WebVTT ---');
assert(timeStringToSeconds('00:01:30.500') === 90.5, 'Conversion 00:01:30.500 en secondes (90.5s)');
assert(timeStringToSeconds('01:00:00.000') === 3600, 'Conversion 01:00:00.000 en secondes (3600s)');

const sampleVtt = `WEBVTT

00:00:05.100 --> 00:00:12.400
<v Kouassi Jean-Marc>Bonjour à tous, nous ouvrons la séance du comité de cadrage budgétaire DGF.</v>

00:00:13.000 --> 00:00:22.500
<v Bamba Salimata>Merci Monsieur le Directeur. Concernant les décaissements de la Banque Mondiale, le taux actuel est de 74%.</v>

00:00:23.000 --> 00:00:30.000
<v Kouassi Jean-Marc>Parfait, nous actons l'arbitrage en faveur du programme d'infrastructures solaires.</v>
`;

const parsed = parseVttTranscript(sampleVtt);
assert(parsed.cues.length === 3, 'Extraction exacte de 3 répliques WebVTT');
assert(parsed.speakersCount === 2, 'Identification exacte de 2 intervenants distincts (Kouassi Jean-Marc, Bamba Salimata)');
assert(parsed.cues[0].speakerName === 'Kouassi Jean-Marc', 'Intervenant 1 fidèlement extrait');
assert(parsed.cues[1].speakerName === 'Bamba Salimata', 'Intervenant 2 fidèlement extrait');
assert(parsed.durationSeconds === 30, 'Durée totale calculée à 30 secondes');

const identityMeeting: MeetingItem = {
  id: 'identity-meeting',
  title: 'Identity check',
  organizer: { name: 'Organisateur', email: 'organizer@example.test' },
  start: '2026-03-04T08:00:00Z',
  end: '2026-03-04T10:00:00Z',
  status: 'completed',
  isDgfMeeting: false,
  attendees: [
    { name: 'Ada Lovelace', email: 'different.person@example.test', responseStatus: 'accepted' },
  ],
  hasTranscript: false,
  hasOfficialReport: false,
};
const identityProfile: DgfUserProfile = {
  displayName: 'Ada Lovelace',
  mail: 'ada@example.test',
  userPrincipalName: 'ada@example.test',
};
assert(
  detectUserMeetingRole(identityMeeting, identityProfile) === 'undetermined',
  'Un nom identique sans adresse email correspondante ne suffit pas à identifier un participant'
);
identityMeeting.attendees[0].email = 'ADA@example.test';
assert(
  detectUserMeetingRole(identityMeeting, identityProfile) === 'attendee',
  'Un participant invité est identifié par adresse email exacte, sans inférer une présence réelle'
);

const unattributedText = `00:00:13.000 --> 00:00:22.500
Deuxième intervention.

00:00:05.100 --> 00:00:12.400
Première intervention.
Suite de la première intervention.`;
const parsedUnattributed = parseUnattributedTranscript(unattributedText);
assert(
  parsedUnattributed.cues.length === 2 &&
  parsedUnattributed.cues[0].startSeconds === 5.1 &&
  parsedUnattributed.cues[0].text === 'Première intervention. Suite de la première intervention.' &&
  parsedUnattributed.cues[1].startSeconds === 13,
  'Transcription sans attribution : horodatages interprétés et segments ordonnés chronologiquement'
);
assert(
  parsedUnattributed.cues.every((cue) => cue.speakerName === NON_ATTRIBUTED_SPEAKER_LABEL) &&
  parsedUnattributed.speakersCount === 0 &&
  parsedUnattributed.speakers.length === 0,
  'Transcription sans attribution : aucun nom d’intervenant n’est inventé'
);
const unattributedExport = createTranscriptExport(parsedUnattributed, 'Comité DGF');
assert(
  unattributedExport.filename.endsWith('.txt') &&
  unattributedExport.mimeType.startsWith('text/plain') &&
  unattributedExport.content === unattributedText,
  'Export de la transcription sans attribution en texte brut sans perte du contenu'
);

// --- 3. Distinction rigoureuse des erreurs Graph (403 Permission vs 403 Tenant Access vs 404 vs 429) ---
console.log('\n--- 3. Qualification fine des erreurs Microsoft Graph & Entra ID ---');

// 3.A : 403 Permission déléguée manquante
const errPermission = explainTranscriptError({
  statusCode: 403,
  code: 'AccessDenied',
  message: 'AccessDenied: OnlineMeetingTranscript.Read.All is required'
});
assert(
  errPermission.code === 'PERMISSION_MISSING' && errPermission.missingPermission === 'OnlineMeetingTranscript.Read.All',
  '403 qualifié avec précision comme PERMISSION_MISSING (scope Entra ID)'
);

// 3.B : 403 Désactivation au niveau du tenant Teams (GraphAccessToTranscriptsDisabled)
const errTenantDisabled = explainTranscriptError({
  statusCode: 403,
  code: 'GraphAccessToTranscriptsDisabled',
  message: 'Access to transcripts is disabled for this tenant'
});
assert(
  errTenantDisabled.code === 'GRAPH_ACCESS_DISABLED' &&
  errTenantDisabled.title.includes('désactivé sur le locataire DGF'),
  '403 qualifié avec précision comme GRAPH_ACCESS_DISABLED (stratégie Teams Admin)'
);

// 3.C : 404 Réunion ou ressource introuvable
const err404 = explainTranscriptError({ statusCode: 404, code: 'ItemNotFound', message: 'ItemNotFound' });
assert(err404.code === 'MEETING_NOT_FOUND', '404 qualifié comme MEETING_NOT_FOUND (réunion inexistante ou expirée)');

// 3.D : 429 Limitation de débit avec extraction du Retry-After
const err429 = explainTranscriptError({
  statusCode: 429,
  headers: { get: (name: string) => (name.toLowerCase() === 'retry-after' ? '45' : null) },
});
assert(
  err429.code === 'RATE_LIMIT_EXCEEDED' && err429.retryAfterSeconds === 45,
  '429 qualifié avec extraction du Retry-After (45s)'
);

// --- 4. Simulation de la résolution de réunions (Organisateur vs Invité vs Résolution impossible) ---
console.log('\n--- 4. Résolution de réunion : Organisateur vs Invité vs Échec ---');

// Mock A : Réunion organisée par l'utilisateur connecté
const mockClientOrganizer = createMockGraphClient(() => ({
  value: [{ id: 'meeting-org-123', subject: 'Comité Trésorerie', joinWebUrl: 'https://teams.microsoft.com/org-call' }],
}));

// Mock B : Réunion à laquelle l'utilisateur est invité (mais résolue par Graph)
const mockClientAttendee = createMockGraphClient(() => ({
  value: [{ id: 'meeting-att-456', subject: 'Revue Banque Mondiale', joinWebUrl: 'https://teams.microsoft.com/att-call' }],
}));

// Mock C : Résolution impossible de la réunion (0 résultat)
const mockClientUnresolved = createMockGraphClient(() => ({ value: [] }));

async function runResolutionAndIntegrationTests() {
  const tokenDiagnostics: any[] = [];
  const tokenResult = await getTranscriptAccessToken(
    {
      acquireTokenSilent: async () => ({
        accessToken: 'mock-access-token',
        scopes: ['User.Read', 'OnlineMeetingTranscript.Read.All'],
      }),
    } as any,
    {} as any,
    (event) => tokenDiagnostics.push(event)
  );
  assert(
    tokenResult.hasPermission &&
    tokenDiagnostics[0]?.hasTranscriptScope === true &&
    !Object.prototype.hasOwnProperty.call(tokenDiagnostics[0], 'token') &&
    !JSON.stringify(tokenDiagnostics).includes('mock-access-token'),
    'Diagnostic MSAL confirme le scope effectif sans exposer de jeton'
  );

  const missingScopeDiagnostics: any[] = [];
  const missingScopeResult = await getTranscriptAccessToken(
    {
      acquireTokenSilent: async () => ({
        accessToken: 'mock-access-token',
        scopes: ['User.Read'],
      }),
    } as any,
    {} as any,
    (event) => missingScopeDiagnostics.push(event)
  );
  assert(
    missingScopeResult.status === 'pending_admin_consent' &&
    missingScopeDiagnostics[0]?.hasTranscriptScope === false,
    'Scope absent des scopes MSAL signalé sans prétendre qu’un appel Graph a eu lieu'
  );

  // Test Organisateur
  const resOrg = await resolveOnlineMeetingId(mockClientOrganizer, 'https://teams.microsoft.com/org-call');
  assert(resOrg.onlineMeetingId === 'meeting-org-123', 'Réunion organisée par l utilisateur résolue avec succès');

  // Test Invité (aucune restriction artificielle)
  const resAtt = await resolveOnlineMeetingId(mockClientAttendee, 'https://teams.microsoft.com/att-call');
  assert(resAtt.onlineMeetingId === 'meeting-att-456', 'Réunion avec statut d invité résolue sans blocage artificiel');

  // Test Résolution impossible
  const resUnres = await resolveOnlineMeetingId(mockClientUnresolved, 'https://teams.microsoft.com/unknown-call');
  assert(
    resUnres.onlineMeetingId === null && resUnres.error?.code === 'MEETING_UNRESOLVED',
    'Réunion non résolue produit le statut explicite MEETING_UNRESOLVED'
  );

  // --- 4.A Liste des transcriptions : requête simple sans sélection OData ---
  const transcriptEndpoint = '/me/onlineMeetings/online-id-list/transcripts';
  const transcriptCalls: Array<{ path: string; selected?: string; query?: Record<string, string> }> = [];
  const transcriptListClient: any = {
    api(path: string) {
      const call: { path: string; selected?: string; query?: Record<string, string> } = { path };
      transcriptCalls.push(call);
      const request: any = {
        select(value: string) {
          call.selected = value;
          return request;
        },
        query(value: Record<string, string>) {
          call.query = value;
          return request;
        },
        responseType() {
          return request;
        },
        get: async () => {
          if (path === transcriptEndpoint) {
            return {
              value: [
                { id: 'transcript-list-1', meetingId: 'online-id-list', createdDateTime: '2026-03-01T10:00:00Z' },
                { id: 'transcript-list-2', meetingId: 'online-id-list', createdDateTime: '2026-03-01T10:05:00Z' },
              ],
            };
          }
          if (path === `${transcriptEndpoint}/transcript-list-2/content`) {
            return sampleVtt;
          }
          throw new Error(`Unexpected Graph endpoint: ${path}`);
        },
      };
      return request;
    },
  };
  const transcriptListResult = await fetchMeetingTranscripts(transcriptListClient, 'online-id-list');
  assert(
    transcriptCalls[0]?.path === transcriptEndpoint &&
    transcriptCalls[0]?.selected === undefined &&
    transcriptCalls[0]?.query === undefined,
    'Liste des transcriptions : endpoint exact sans paramètres OData superflus'
  );
  assert(
    transcriptListResult.transcripts.length === 2 &&
    transcriptListResult.transcripts[0].id === 'transcript-list-1' &&
    !Object.prototype.hasOwnProperty.call(transcriptListResult.transcripts[0], 'meetingOrganizerId'),
    'Liste des transcriptions : plusieurs résultats mappés sans propriété OData invalide'
  );

  const transcriptNextPageLink =
    'https://graph.microsoft.com/v1.0/me/onlineMeetings/online-id-list/transcripts?$skiptoken=page2';
  const transcriptPageCalls: string[] = [];
  const paginatedTranscriptClient = createMockGraphClient((endpoint) => {
    transcriptPageCalls.push(endpoint);
    return endpoint === transcriptEndpoint
      ? {
          value: [{ id: 'transcript-page-1', meetingId: 'online-id-list' }],
          '@odata.nextLink': transcriptNextPageLink,
        }
      : endpoint === transcriptNextPageLink
        ? { value: [{ id: 'transcript-page-2', meetingId: 'online-id-list' }] }
        : undefined;
  });
  const paginatedTranscriptResult = await fetchMeetingTranscripts(
    paginatedTranscriptClient,
    'online-id-list'
  );
  assert(
    transcriptPageCalls.length === 2
      && paginatedTranscriptResult.transcripts.map(item => item.id).join(',') === 'transcript-page-1,transcript-page-2',
    'Liste des transcriptions : toutes les pages @odata.nextLink sont suivies'
  );

  const emptyTranscriptClient = createMockGraphClient((endpoint) =>
    endpoint === transcriptEndpoint ? { value: [] } : undefined
  );
  const emptyTranscriptList = await fetchMeetingTranscripts(emptyTranscriptClient, 'online-id-list');
  assert(
    emptyTranscriptList.transcripts.length === 0 && !emptyTranscriptList.error,
    'Liste des transcriptions : value: [] reste une réponse vide valide'
  );

  const transcriptContentResult = await fetchTranscriptContent(
    transcriptListClient,
    'online-id-list',
    'transcript-list-2'
  );
  assert(
    transcriptCalls[1]?.path === `${transcriptEndpoint}/transcript-list-2/content` &&
    transcriptCalls[1]?.query?.$format === 'text/vtt' &&
    transcriptContentResult.content.startsWith('WEBVTT'),
    'Contenu VTT : téléchargement avec le bon transcriptId et le format text/vtt'
  );

  const transcriptErrorDiagnostics: any[] = [];
  const transcriptErrorClient = createMockGraphClient((endpoint) =>
    endpoint === transcriptEndpoint
      ? rawGraphResponse(400, {
          error: {
            code: 'Request_UnsupportedQuery',
            message: "Could not find a property named 'meetingOrganizerId' on type 'microsoft.graph.callTranscript'.",
          },
        }, 'transcript-list-400')
      : undefined
  );
  const transcriptErrorResult = await fetchMeetingTranscripts(transcriptErrorClient, 'online-id-list', {
    onDiagnostic: (event) => transcriptErrorDiagnostics.push(event),
  });
  assert(
    transcriptErrorResult.error?.httpStatus === 400 &&
    transcriptErrorDiagnostics.some((event) =>
      event.stage === 'transcripts' &&
      event.httpStatus === 400 &&
      event.graphErrorCode === 'Request_UnsupportedQuery' &&
      event.requestId === 'transcript-list-400'
    ),
    'Erreur HTTP Graph lors de la liste conservée avec statut, code et request-id'
  );

  // --- 5. Tests d intégration des statuts de transcription ---
  console.log('\n--- 5. Scénarios complets de statut de transcription ---');

  const completedMeeting: MeetingItem = {
    id: 'meet-complete-1',
    title: 'Comité de Cadrage des Financements Extérieurs',
    start: '2026-03-01T09:00:00Z',
    end: '2026-03-01T10:30:00Z',
    organizer: { name: 'Kouassi Jean-Marc', email: 'jm.kouassi@dgf.ci' },
    isOnlineMeeting: true,
    onlineMeetingProvider: 'teamsForBusiness',
    joinWebUrl: 'https://teams.microsoft.com/org-call',
    status: 'completed',
    captureMethod: 'teams_native',
    isDgfMeeting: true,
    attendees: [],
    hasTranscript: false,
    hasOfficialReport: false,
  };

  // Scénario 5.A : Réunion en cours (in_progress) sans prétention de capture par ReadMeeting.ai
  const ongoingMeeting: MeetingItem = {
    ...completedMeeting,
    id: 'meet-ongoing-1',
    start: new Date(Date.now() - 1800000).toISOString(),
    end: new Date(Date.now() + 1800000).toISOString(),
  };

  const ongoingCheck = await checkMeetingTranscriptStatus(mockClientOrganizer, ongoingMeeting, true);
  assert(
    ongoingCheck.status === 'in_progress' &&
    Boolean(ongoingCheck.error?.message.includes('ReadMeeting.ai interrogera Microsoft Graph une fois la séance achevée')),
    'Réunion en cours affichée avec état temporel sans prétention de capture autonome'
  );

  // Scénario 5.B : Permission Entra ID manquante (HTTP 403 Forbidden)
  purgeTranscriptCache();
  const mockClientPermMissing = createMockGraphClient((endpoint) => {
    if (endpoint === '/me/onlineMeetings') return { value: [{ id: 'online-id-1' }] };
    const err: any = new Error('AccessDenied: OnlineMeetingTranscript.Read.All is required');
    err.statusCode = 403;
    throw err;
  });

  const permCheck = await checkMeetingTranscriptStatus(mockClientPermMissing, completedMeeting, true);
  assert(
    permCheck.status === 'permission_missing' && permCheck.error?.code === 'PERMISSION_MISSING',
    'Réunion terminée avec 403 permission manquante -> statut permission_missing'
  );

  // Scénario 5.C : Paramètre GraphAccessToTranscriptsDisabled (HTTP 403 Tenant)
  purgeTranscriptCache();
  const mockClientTenantDisabled = createMockGraphClient((endpoint) => {
    if (endpoint === '/me/onlineMeetings') return { value: [{ id: 'online-id-1' }] };
    const err: any = new Error('Access to transcripts is disabled for this tenant');
    err.statusCode = 403;
    err.code = 'GraphAccessToTranscriptsDisabled';
    throw err;
  });

  const tenantCheck = await checkMeetingTranscriptStatus(mockClientTenantDisabled, completedMeeting, true);
  assert(
    tenantCheck.status === 'tenant_access_disabled' && tenantCheck.error?.code === 'GRAPH_ACCESS_DISABLED',
    'Réunion terminée avec 403 GraphAccessToTranscriptsDisabled -> statut tenant_access_disabled'
  );

  // Scénario 5.D : Transcription absente (HTTP 200 OK avec collection vide [])
  purgeTranscriptCache();
  const mockClientEmptyTranscripts = createMockGraphClient((endpoint) =>
    endpoint === '/me/onlineMeetings' ? { value: [{ id: 'online-id-1' }] } : { value: [] }
  );

  const emptyCheck = await checkMeetingTranscriptStatus(mockClientEmptyTranscripts, completedMeeting, true);
  assert(
    emptyCheck.status === 'transcript_unavailable' && emptyCheck.error?.code === 'EMPTY_TRANSCRIPTS',
    'HTTP 200 avec collection vide traité comme absence d enregistrement Teams (EMPTY_TRANSCRIPTS)'
  );

  // Scénario 5.E : Transcription disponible avec métadonnées et contenu WebVTT
  purgeTranscriptCache();
  const mockClientSuccess = createMockGraphClient((endpoint) => {
    if (endpoint === '/me/onlineMeetings') return { value: [{ id: 'online-id-success' }] };
    if (endpoint.includes('/content')) return sampleVtt;
    return {
      value: [{
        id: 'transcript-id-999',
        meetingId: 'online-id-success',
        createdDateTime: '2026-03-01T10:35:00Z',
        transcriptContentUrl: '/content',
      }],
    };
  });

  const successDiagnostics: any[] = [];
  const successCheck = await checkMeetingTranscriptStatus(
    mockClientSuccess,
    completedMeeting,
    true,
    undefined,
    true,
    (event) => successDiagnostics.push(event)
  );
  assert(
    successCheck.status === 'transcript_available' &&
    successCheck.content?.speakersCount === 2 &&
    successCheck.metadata?.id === 'transcript-id-999' &&
    successDiagnostics.some((event) => event.stage === 'content' && event.vttParsed === true),
    'Transcription réelle confirmée et disponible avec contenu WebVTT structuré'
  );

  // Scénario 5.E.0 : Le tableau de bord confirme les métadonnées sans télécharger le contenu.
  purgeTranscriptCache();
  const metadataRequestPaths: string[] = [];
  const metadataOnlyClient = createMockGraphClient((endpoint) => {
    metadataRequestPaths.push(endpoint);
    if (endpoint === '/me/onlineMeetings') return { value: [{ id: 'online-id-metadata' }] };
    if (endpoint.endsWith('/transcripts')) {
      return {
        value: [{
          id: 'transcript-id-metadata',
          meetingId: 'online-id-metadata',
          createdDateTime: '2026-03-01T10:35:00Z',
        }],
      };
    }
    throw new Error(`Unexpected Graph endpoint in metadata-only check: ${endpoint}`);
  });
  const metadataCheck = await checkMeetingTranscriptStatus(
    metadataOnlyClient,
    completedMeeting,
    true,
    undefined,
    true,
    undefined,
    true
  );
  const cachedMetadataCheck = await checkMeetingTranscriptStatus(
    metadataOnlyClient,
    completedMeeting,
    false,
    undefined,
    true,
    undefined,
    true
  );
  assert(
    metadataCheck.metadataConfirmed === true &&
    metadataCheck.metadata?.id === 'transcript-id-metadata' &&
    metadataCheck.content === undefined &&
    cachedMetadataCheck.cached === true &&
    metadataRequestPaths.length === 2,
    'Tableau de bord confirme et met en cache les métadonnées sans télécharger le contenu'
  );

  // Scénario 5.E.1 : SpeakerAttributionNotAllowed déclenche le format texte sur le même endpoint.
  purgeTranscriptCache();
  const fallbackTranscriptText = `00:00:02.000 --> 00:00:04.000
Parole sans nom d’intervenant.`;
  const fallbackContentCalls: Array<{
    path: string;
    query?: Record<string, string>;
    headers: Record<string, string>;
  }> = [];
  const fallbackClient = createMockGraphClient((endpoint, _filter, query, headers = {}) => {
    if (endpoint === '/me/onlineMeetings') {
      return rawGraphResponse(200, { value: [{ id: 'online-id-fallback' }] });
    }
    if (endpoint.endsWith('/transcripts')) {
      return rawGraphResponse(200, {
        value: [{
          id: 'transcript-fallback',
          meetingId: 'online-id-fallback',
          createdDateTime: '2026-03-01T10:35:00Z',
        }],
      });
    }
    if (endpoint.includes('/content')) {
      fallbackContentCalls.push({ path: endpoint, query, headers: { ...headers } });
      if (fallbackContentCalls.length === 1) {
        return rawGraphResponse(403, {
          error: {
            code: 'Forbidden',
            innerError: { code: 'SpeakerAttributionNotAllowed' },
          },
        }, 'request-speaker-denied');
      }
      return rawGraphResponse(
        200,
        fallbackTranscriptText,
        'request-unattributed-success',
        'application/vnd.microsoft.graph.transcript+text'
      );
    }
    throw new Error(`Unexpected Graph endpoint: ${endpoint}`);
  });
  const fallbackDiagnostics: any[] = [];
  const fallbackCheck = await checkMeetingTranscriptStatus(
    fallbackClient,
    completedMeeting,
    true,
    undefined,
    true,
    (event) => fallbackDiagnostics.push(event)
  );
  assert(
    fallbackCheck.status === 'transcript_available' &&
    fallbackContentCalls.length === 2 &&
    fallbackContentCalls[0].path === fallbackContentCalls[1].path &&
    fallbackContentCalls[0].query?.$format === 'text/vtt' &&
    fallbackContentCalls[1].query === undefined &&
    fallbackContentCalls[1].headers.Accept === 'application/vnd.microsoft.graph.transcript+text',
    'VTT refusé par SpeakerAttributionNotAllowed : fallback sur le même transcript avec Accept requis et sans $format'
  );
  assert(
    fallbackCheck.content?.format === 'text/plain' &&
    fallbackCheck.content.cues[0]?.speakerName === NON_ATTRIBUTED_SPEAKER_LABEL &&
    fallbackDiagnostics.some((event) =>
      event.stage === 'content' &&
      event.httpStatus === 403 &&
      event.graphInnerErrorCode === 'SpeakerAttributionNotAllowed' &&
      event.requestedFormat === 'text/vtt'
    ) &&
    fallbackDiagnostics.some((event) => event.fallbackTriggered === true) &&
    fallbackDiagnostics.some((event) =>
      event.stage === 'content' &&
      event.attempt === 2 &&
      event.httpStatus === 200 &&
      event.requestedFormat === 'application/vnd.microsoft.graph.transcript+text' &&
      event.contentParsed === true
    ) &&
    !JSON.stringify(fallbackDiagnostics).includes('Parole sans nom'),
    'Fallback analysé et diagnostiqué sans journaliser le contenu de la transcription'
  );

  // Scénario 5.E.2 : un autre code 403 ne déclenche jamais le fallback.
  let unrelatedContentCalls = 0;
  const unrelatedDeniedClient = createMockGraphClient((endpoint) => {
    unrelatedContentCalls++;
    return rawGraphResponse(403, {
      error: { code: 'Forbidden', innerError: { code: 'AccessDenied' } },
    }, 'request-unrelated-denied');
  });
  const unrelatedDenied = await fetchTranscriptContent(
    unrelatedDeniedClient,
    'online-id-unrelated-denied',
    'transcript-unrelated-denied'
  );
  assert(
    unrelatedContentCalls === 1 &&
    unrelatedDenied.error?.graphInnerErrorCode === 'AccessDenied',
    'Le fallback est strictement limité à innerError.code SpeakerAttributionNotAllowed'
  );

  // Scénario 5.E.3 : le refus du format alternatif conserve l’erreur Graph reçue.
  purgeTranscriptCache();
  let deniedFallbackCalls = 0;
  const deniedFallbackClient = createMockGraphClient((endpoint) => {
    if (endpoint === '/me/onlineMeetings') {
      return rawGraphResponse(200, { value: [{ id: 'online-id-fallback-denied' }] });
    }
    if (endpoint.endsWith('/transcripts')) {
      return rawGraphResponse(200, {
        value: [{ id: 'transcript-fallback-denied', meetingId: 'online-id-fallback-denied' }],
      });
    }
    if (endpoint.includes('/content')) {
      deniedFallbackCalls++;
      return deniedFallbackCalls === 1
        ? rawGraphResponse(403, {
            error: { code: 'Forbidden', innerError: { code: 'SpeakerAttributionNotAllowed' } },
          }, 'request-attribution-denied')
        : rawGraphResponse(403, {
            error: { code: 'Forbidden', innerError: { code: 'GraphAccessToTranscriptsDisabled' } },
          }, 'request-unattributed-denied');
    }
    throw new Error(`Unexpected Graph endpoint: ${endpoint}`);
  });
  const deniedFallbackCheck = await checkMeetingTranscriptStatus(
    deniedFallbackClient,
    completedMeeting,
    true
  );
  assert(
    deniedFallbackCheck.status === 'content_unavailable' &&
    deniedFallbackCalls === 2 &&
    deniedFallbackCheck.error?.graphErrorCode === 'Forbidden' &&
    deniedFallbackCheck.error?.graphInnerErrorCode === 'GraphAccessToTranscriptsDisabled' &&
    deniedFallbackCheck.error?.requestId === 'request-unattributed-denied',
    'Échec du format alternatif : statut, code interne, code Graph et request-id conservés'
  );

  // Scénario 5.F : HTTP 200 vide uniquement confirme l'absence de transcription.
  purgeTranscriptCache();
  const rawEmptyClient = createMockGraphClient((endpoint) =>
    endpoint === '/me/onlineMeetings'
      ? rawGraphResponse(200, { value: [{ id: 'online-id-raw-empty' }] })
      : rawGraphResponse(200, { value: [] })
  );
  const rawEmptyDiagnostics: any[] = [];
  const rawEmptyCheck = await checkMeetingTranscriptStatus(
    rawEmptyClient,
    completedMeeting,
    true,
    undefined,
    true,
    (event) => rawEmptyDiagnostics.push(event)
  );
  assert(
    rawEmptyCheck.status === 'transcript_unavailable' &&
    rawEmptyDiagnostics.some((event) => event.stage === 'transcripts' && event.httpStatus === 200 && event.itemCount === 0),
    'HTTP 200 value: [] est distingué d’une erreur Graph et diagnostiqué comme réponse vide'
  );

  // Scénario 5.F.1 : une réponse 200 mal formée n'est pas considérée comme une collection vide.
  purgeTranscriptCache();
  const rawInvalidClient = createMockGraphClient((endpoint) =>
    endpoint === '/me/onlineMeetings'
      ? rawGraphResponse(200, { value: [{ id: 'online-id-invalid' }] })
      : rawGraphResponse(200, { data: [] })
  );
  const invalidDiagnostics: any[] = [];
  const invalidCheck = await checkMeetingTranscriptStatus(
    rawInvalidClient,
    completedMeeting,
    true,
    undefined,
    true,
    (event) => invalidDiagnostics.push(event)
  );
  assert(
    invalidCheck.status === 'transient_error' &&
    invalidCheck.error?.code === 'GRAPH_INVALID_RESPONSE' &&
    !invalidDiagnostics.some((event) => event.stage === 'transcripts' && event.outcome === 'empty'),
    'Réponse Graph 200 invalide reste distincte d’une collection vide'
  );

  // Scénario 5.G : HTTP 403 AccessDenied garde le code et le request-id Graph, sans conclure à l'absence.
  purgeTranscriptCache();
  const rawDeniedClient = createMockGraphClient((endpoint) =>
    endpoint === '/me/onlineMeetings'
      ? rawGraphResponse(200, { value: [{ id: 'online-id-denied' }] })
      : rawGraphResponse(403, { error: { code: 'AccessDenied', message: 'Access denied' } }, 'request-denied-403')
  );
  const deniedDiagnostics: any[] = [];
  const deniedCheck = await checkMeetingTranscriptStatus(
    rawDeniedClient,
    completedMeeting,
    true,
    undefined,
    true,
    (event) => deniedDiagnostics.push(event)
  );
  assert(
    deniedCheck.status === 'access_refused' &&
    deniedCheck.error?.httpStatus === 403 &&
    deniedDiagnostics.some((event) =>
      event.stage === 'transcripts' &&
      event.httpStatus === 403 &&
      event.graphErrorCode === 'AccessDenied' &&
      event.requestId === 'request-denied-403'
    ),
    'HTTP 403 générique reste un refus d’accès et conserve code Graph/request-id réels'
  );

  // Scénario 5.H : HTTP 401 reste une erreur d'authentification.
  purgeTranscriptCache();
  const rawUnauthorizedClient = createMockGraphClient(() =>
    rawGraphResponse(401, { error: { code: 'InvalidAuthenticationToken', message: 'Invalid token' } }, 'request-auth-401')
  );
  const unauthorizedCheck = await checkMeetingTranscriptStatus(rawUnauthorizedClient, completedMeeting, true);
  assert(
    unauthorizedCheck.status === 'authentication_error' &&
    unauthorizedCheck.error?.httpStatus === 401 &&
    unauthorizedCheck.error?.graphErrorCode === 'InvalidAuthenticationToken',
    'HTTP 401 reste une erreur d’authentification et n’est pas assimilé à une transcription absente'
  );

  // Scénario 5.I : métadonnées présentes mais échec de récupération du VTT.
  purgeTranscriptCache();
  const rawVttFailureClient = createMockGraphClient((endpoint) => {
    if (endpoint === '/me/onlineMeetings') return rawGraphResponse(200, { value: [{ id: 'online-id-vtt-failure' }] });
    if (endpoint.includes('/content')) {
      return rawGraphResponse(500, { error: { code: 'ServiceUnavailable', message: 'Temporary service failure' } }, 'request-vtt-500');
    }
    return rawGraphResponse(200, {
      value: [{
        id: 'transcript-vtt-failure',
        meetingId: 'online-id-vtt-failure',
        createdDateTime: '2026-03-01T10:35:00Z',
      }],
    });
  });
  const vttFailureDiagnostics: any[] = [];
  const vttFailureCheck = await checkMeetingTranscriptStatus(
    rawVttFailureClient,
    completedMeeting,
    true,
    undefined,
    true,
    (event) => vttFailureDiagnostics.push(event)
  );
  assert(
    vttFailureCheck.status === 'content_unavailable' &&
    vttFailureCheck.metadata?.id === 'transcript-vtt-failure' &&
    vttFailureCheck.content === undefined &&
    vttFailureCheck.error?.httpStatus === 500 &&
    vttFailureDiagnostics.some((event) =>
      event.stage === 'content' && event.httpStatus === 500 && event.requestId === 'request-vtt-500'
    ),
    'Échec HTTP du téléchargement VTT reste visible malgré les métadonnées disponibles'
  );

  // Scénario 5.I.1 : contenu HTTP 200 reçu mais non WebVTT.
  purgeTranscriptCache();
  const invalidVttClient = createMockGraphClient((endpoint) => {
    if (endpoint === '/me/onlineMeetings') return { value: [{ id: 'online-id-invalid-vtt' }] };
    if (endpoint.includes('/content')) return 'not a WebVTT payload';
    return {
      value: [{
        id: 'transcript-invalid-vtt',
        meetingId: 'online-id-invalid-vtt',
        createdDateTime: '2026-03-01T10:35:00Z',
      }],
    };
  });
  const invalidVttDiagnostics: any[] = [];
  const invalidVttCheck = await checkMeetingTranscriptStatus(
    invalidVttClient,
    completedMeeting,
    true,
    undefined,
    true,
    (event) => invalidVttDiagnostics.push(event)
  );
  assert(
    invalidVttCheck.status === 'content_unavailable' &&
    invalidVttCheck.error?.code === 'INVALID_VTT_CONTENT' &&
    invalidVttDiagnostics.some((event) =>
      event.stage === 'content' && event.outcome === 'invalid_response' && event.vttParsed === false
    ),
    'Corps de réponse non WebVTT est classé contenu indisponible sans masquer l’échec'
  );

  // Scénario 5.J : la résolution d'un organisateur externe est tentée et Graph décide de l'accès.
  let externalGraphCalls = 0;
  const externalClient = createMockGraphClient(() => {
    externalGraphCalls += 1;
    return { value: [] };
  });
  const externalDiagnostics: any[] = [];
  const externalResolution = await resolveOnlineMeetingId(externalClient, 'https://teams.microsoft.com/external', {
    isExternalOrganizer: true,
    userRole: 'attendee',
    onDiagnostic: (event) => externalDiagnostics.push(event),
  });
  assert(
    externalResolution.onlineMeetingId === null &&
    externalResolution.error?.code === 'MEETING_UNRESOLVED' &&
    externalGraphCalls === 1 &&
    externalDiagnostics[0]?.outcome === 'empty' &&
    externalDiagnostics[0]?.httpStatus === 200 &&
    !externalDiagnostics[0]?.graphErrorCode,
    'Organisateur externe non bloqué localement : une réponse Graph vide reste distincte d’un refus'
  );

  // Scénario 5.F : Résolution impossible de la réunion
  purgeTranscriptCache();
  const unresolvedCheck = await checkMeetingTranscriptStatus(mockClientUnresolved, completedMeeting, true);
  assert(
    unresolvedCheck.status === 'meeting_unresolved' && unresolvedCheck.error?.code === 'MEETING_UNRESOLVED',
    'Réunion non résolue produit le statut explicite meeting_unresolved'
  );

  // --- 6. Contrôle du garde-fou de validation humaine ---
  console.log('\n--- 6. Contrôle du garde-fou institutionnel de validation humaine ---');
  assert(
    enforceHumanValidationGate({ isApproved: false, validationStatus: 'draft' }).canPublish === false,
    'Interdiction absolue de publier un brouillon non approuvé'
  );
  assert(
    enforceHumanValidationGate({ isApproved: true, validationStatus: 'approved' }).canPublish === false,
    'Interdiction absolue de publier sans UPN et nom du signataire officiel'
  );
  assert(
    enforceHumanValidationGate({
      isApproved: true,
      validationStatus: 'approved',
      reviewedByUpn: 'dg@dgf.ci',
      reviewedByName: 'M. le Directeur Général'
    }).canPublish === true,
    'Publication autorisée exclusivement avec approbation humaine et signature formelle'
  );

  console.log('\n========================================================================');
  console.log(`BILAN DES TESTS : ${passedTests}/${totalTests} TESTS CONFORMES`);
  console.log('========================================================================');
}

runResolutionAndIntegrationTests().catch((e) => {
  console.error('[Erreur inattendue suite de tests]', e);
  process.exit(1);
});
