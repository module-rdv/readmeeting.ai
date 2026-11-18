import { detectUserMeetingRole, isOrganizerExternal, checkMeetingTranscriptStatus, purgeTranscriptCache } from '../src/services/transcriptService';
import { classifyOrganizerDomain, isOrganizerIdentity, normalizeEmailAddress } from '../src/services/organizerClassification';
import { MeetingItem } from '../src/types/meeting';
import { DgfUserProfile } from '../src/types/auth';

let passed = 0;
let failed = 0;

function assert(condition: boolean, testName: string, details?: string) {
  if (condition) {
    console.log(`  \x1b[32m✔\x1b[0m ${testName}`);
    passed++;
  } else {
    console.error(`  \x1b[31m✖\x1b[0m ${testName}`);
    if (details) console.error(`    \x1b[33mDétails : ${details}\x1b[0m`);
    failed++;
  }
}

function createMockClient({
  meetingId = 'meeting-123',
  transcripts = [{ id: 'transcript-001', meetingId, createdDateTime: '2026-03-04T10:00:00Z', transcriptContentUrl: '/transcripts/transcript-001/content' }],
  transcriptContent = 'WEBVTT\n\n00:00:01.000 --> 00:00:05.000\n<v Alice>Alice</v>\n',
  failureMode,
}: {
  meetingId?: string;
  transcripts?: any[];
  transcriptContent?: string;
  failureMode?: 'restricted' | 'empty' | 'unresolved';
}) {
  return {
    api: (endpoint: string) => ({
      filter: () => ({
        select: () => ({
          get: async () => {
            if (endpoint === '/me/onlineMeetings') {
              if (failureMode === 'unresolved') return { value: [] };
              return { value: [{ id: meetingId }] };
            }
            return { value: [] };
          },
        }),
      }),
      select: () => ({
        get: async () => {
          if (endpoint.includes('/transcripts')) {
            if (failureMode === 'restricted') {
              const error: any = new Error('AccessDenied: Organizer restricted transcript access to organizers and co-organizers only');
              error.statusCode = 403;
              error.code = 'SharingRestriction';
              throw error;
            }
            if (failureMode === 'empty') {
              return { value: [] };
            }
            return { value: transcripts };
          }
          return { value: [] };
        },
      }),
      query: () => ({
        responseType: () => ({
          get: async () => transcriptContent,
        }),
      }),
    }),
  } as any;
}

console.log('\n========================================================================');
console.log('BANC D\'ESSAI : CLASSIFICATION DGF.CI — DOMAINE INTERNE ET RÔLES');
console.log('========================================================================\n');

const mockCurrentUser: DgfUserProfile = {
  id: 'user-kouassi-id',
  displayName: 'Kouassi Jean-Marc',
  userPrincipalName: 'jm.kouassi@dgf.ci',
  mail: 'jm.kouassi@dgf.ci',
  jobTitle: 'Chargé d\'Études Senior',
  department: 'DFEE',
  officeLocation: 'Tour C, 14ème étage',
};

const organizerInternal: MeetingItem = {
  id: 'm-org',
  title: 'Comité A',
  organizer: { name: 'Jean-Marc Kouassi', email: 'jm.kouassi@dgf.ci' },
  start: '2026-03-01T10:00:00Z',
  end: '2026-03-01T11:00:00Z',
  status: 'completed',
  captureMethod: 'teams_native',
  isDgfMeeting: true,
  attendees: [],
  hasTranscript: true,
  hasOfficialReport: false,
};

const organizerAttendee: MeetingItem = {
  id: 'm-att',
  title: 'Comité B',
  organizer: { name: 'Directeur Général', email: 'dg@dgf.ci' },
  start: '2026-03-01T10:00:00Z',
  end: '2026-03-01T11:00:00Z',
  status: 'completed',
  captureMethod: 'teams_native',
  isDgfMeeting: true,
  attendees: [{ name: 'Kouassi Jean-Marc', email: 'jm.kouassi@dgf.ci', type: 'required', responseStatus: 'accepted' }],
  hasTranscript: true,
  hasOfficialReport: false,
};

const organizerUnknown: MeetingItem = {
  id: 'm-undet',
  title: 'Comité C',
  organizer: { name: 'Directeur Général', email: 'dg@dgf.ci' },
  start: '2026-03-01T10:00:00Z',
  end: '2026-03-01T11:00:00Z',
  status: 'completed',
  captureMethod: 'teams_native',
  isDgfMeeting: true,
  attendees: [{ name: 'Autre Personne', email: 'autre@dgf.ci', type: 'required' }],
  hasTranscript: true,
  hasOfficialReport: false,
};

assert(detectUserMeetingRole(organizerInternal, mockCurrentUser) === 'organizer', 'Rôle organisateur : UPN identique -> organizer');
assert(detectUserMeetingRole(organizerAttendee, mockCurrentUser) === 'attendee', 'Rôle participant : participant dans la liste -> attendee');
assert(detectUserMeetingRole(organizerUnknown, mockCurrentUser) === 'undetermined', 'Rôle inconnu : personne absente de la convocation -> undetermined');
assert(isOrganizerExternal(' leonce.ouattara@DGF.CI ', mockCurrentUser.userPrincipalName) === false, 'Domaine interne : dgf.ci est interne malgré casse et espaces');
assert(isOrganizerExternal('x.prenom@dgf.ci', mockCurrentUser.userPrincipalName) === false && isOrganizerExternal('prenom.nom@dgf.ci', mockCurrentUser.userPrincipalName) === false, 'Formats DGF : x.prenom@dgf.ci et prenom.nom@dgf.ci sont internes');
assert(isOrganizerExternal('agent@service.gouv.ci', mockCurrentUser.userPrincipalName) === true, 'Domaine externe : service.gouv.ci et autres domaines non DGF sont externes');
assert(isOrganizerExternal('s.toure@afdb.org', mockCurrentUser.userPrincipalName) === true, 'Domaine externe : afdb.org est externe');
assert(classifyOrganizerDomain('') === 'unknown' && isOrganizerExternal('', mockCurrentUser.userPrincipalName) === false, 'Adresse vide : inconnu sans faux externe');
assert(normalizeEmailAddress('  Leonce.Ouattara@DGF.CI  ') === 'leonce.ouattara@dgf.ci', 'Normalisation : espaces enlevés et casse uniformisée');
assert(isOrganizerIdentity(' leonce.ouattara@DGF.CI ', ['leonce.ouattara@dgf.ci']), 'Identité : correspondance exacte après normalisation');
assert(!isOrganizerIdentity('leonce.ouattara@dgf.ci', ['autre@dgf.ci']), 'Identité : un autre agent dgf.ci n’est pas le bon compte');
assert(classifyOrganizerDomain('agent@dgf.ci') === 'internal' && classifyOrganizerDomain('agent@dgf.ci.example.com') === 'external', 'Classification exacte : seul dgf.ci est interne');

const userWithDifferentUpnAndMail: DgfUserProfile = {
  ...mockCurrentUser,
  userPrincipalName: 'leonce.alias@dgf.ci',
  mail: 'leonce.ouattara@dgf.ci',
};
const meetingByProfileMail: MeetingItem = {
  ...organizerInternal,
  organizer: { name: 'Autre nom', email: ' LEONCE.OUATTARA@DGF.CI ' },
};
assert(detectUserMeetingRole(meetingByProfileMail, userWithDifferentUpnAndMail) === 'organizer', 'Rôle organisateur : mail exact accepté même si UPN diffère');

const meetingNameOnlyMatch: MeetingItem = {
  ...organizerInternal,
  organizer: { name: mockCurrentUser.displayName, email: 'autre@dgf.ci' },
};
assert(detectUserMeetingRole(meetingNameOnlyMatch, mockCurrentUser) === 'undetermined', 'Rôle : correspondance de nom seule ne suffit pas');

purgeTranscriptCache();
const successMeeting: MeetingItem = {
  id: 'meeting-success',
  title: 'Réunion DGF accessible',
  organizer: { name: 'Jean-Marc Kouassi', email: 'jm.kouassi@dgf.ci' },
  start: '2026-03-02T10:00:00Z',
  end: '2026-03-02T11:00:00Z',
  isOnlineMeeting: true,
  joinWebUrl: 'https://teams.microsoft.com/l/meetup-join/19%3ameeting_success%40thread.v2/0',
  status: 'completed',
  captureMethod: 'teams_native',
  isDgfMeeting: true,
  attendees: [{ name: 'Jean-Marc Kouassi', email: 'jm.kouassi@dgf.ci', type: 'required' }],
  hasTranscript: true,
  hasOfficialReport: false,
};
const successRes = await checkMeetingTranscriptStatus(createMockClient({}), successMeeting, true, mockCurrentUser, true);
assert(successRes.status === 'transcript_available' && successRes.accessibility === 'accessible', 'Service : réunion interne DGF accessible');

purgeTranscriptCache();
const restrictedMeeting: MeetingItem = {
  id: 'meeting-restricted',
  title: 'Réunion DGF restreinte',
  organizer: { name: 'Directeur Général', email: 'dg@dgf.ci' },
  start: '2026-03-02T12:00:00Z',
  end: '2026-03-02T13:00:00Z',
  isOnlineMeeting: true,
  joinWebUrl: 'https://teams.microsoft.com/l/meetup-join/19%3ameeting_restricted%40thread.v2/0',
  status: 'completed',
  captureMethod: 'teams_native',
  isDgfMeeting: true,
  attendees: [{ name: 'Kouassi Jean-Marc', email: 'jm.kouassi@dgf.ci', type: 'required' }],
  hasTranscript: true,
  hasOfficialReport: false,
};
const restrictedRes = await checkMeetingTranscriptStatus(createMockClient({ failureMode: 'restricted' }), restrictedMeeting, true, mockCurrentUser, true);
assert(restrictedRes.status === 'sharing_restricted_by_organizer' && restrictedRes.accessibility === 'restricted_by_sharing', 'Service : restriction de partage correctement classée');

console.log('\n========================================================================');
console.log(`RÉSULTAT DU BANC D'ESSAI : ${passed} tests réussis, ${failed} tests échoués`);
console.log('========================================================================\n');

if (failed > 0) {
  process.exit(1);
} else {
  process.exit(0);
}
