import { AccountInfo, IPublicClientApplication } from '@azure/msal-browser';
import { MeetingItem, UserMeetingRole } from '../types/meeting';
import { DgfUserProfile } from '../types/auth';
import { TranscriptCheckResult } from '../types/transcript';
import {
  OutlookCalendarEvent,
  createTranscriptGraphClient,
  fetchCalendarViewEvents,
  fetchGraphUserProfile,
  getTranscriptAccessToken,
  isTeamsOnlineMeeting,
} from './graphClient';
import { checkMeetingTranscriptStatus } from './transcriptService';
import { normalizeEmailAddress } from './organizerClassification';

const TRANSCRIPT_CHECK_CONCURRENCY = 3;
const UPCOMING_WINDOW_MINUTES = 60;

export interface UpcomingGraphMeeting {
  id: string;
  subject: string;
  start: string;
  end: string | null;
  organizerName: string | null;
  organizerEmail: string | null;
  participants: Array<{ name: string | null; email: string | null }>;
  participantCount: number | null;
  type: 'Teams' | 'Présentielle' | 'Autre réunion en ligne';
  joinWebUrl: string | null;
  location: string | null;
}

export interface GraphDashboardData {
  year: number;
  meetingsThisYear: number;
  meetingsOrganized: number;
  meetingsInvited: number;
  averageParticipants: number | null;
  averageParticipantMeetingCount: number;
  transcriptChecks: number;
  transcriptsAvailable: number;
  transcriptsUnavailable: number;
  transcriptPermissionMissing: number;
  transcriptUnresolved: number;
  transcriptAccessRefused: number;
  transcriptAuthenticationErrors: number;
  transcriptTemporaryErrors: number;
  transcriptPending: number;
  transcriptPermissionMessage: string | null;
  upcomingMeetings: UpcomingGraphMeeting[];
  refreshedAt: string;
  upcomingRefreshedAt: string;
}

export interface TranscriptCheckProgress {
  completed: number;
  total: number;
}

interface ParticipantCount {
  count: number;
  hasUsableData: boolean;
}

function parseGraphUtcDate(value: string | undefined): Date | null {
  if (!value) return null;
  const parsed = new Date(/[zZ]|[+-]\d{2}:\d{2}$/.test(value) ? value : `${value}Z`);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function eventStart(event: OutlookCalendarEvent): Date | null {
  return parseGraphUtcDate(event.start?.dateTime);
}

function eventEnd(event: OutlookCalendarEvent): Date | null {
  return parseGraphUtcDate(event.end?.dateTime);
}

function isTeamsEvent(event: OutlookCalendarEvent): boolean {
  return isTeamsOnlineMeeting(event);
}

function isMeetingEvent(event: OutlookCalendarEvent): boolean {
  const hasPersonAttendee = event.attendees?.some((attendee) =>
    attendee.type !== 'resource'
    && Boolean(attendee.emailAddress?.address?.trim() || attendee.emailAddress?.name?.trim())
  );
  return !event.isCancelled
    && event.type !== 'seriesMaster'
    && Boolean(hasPersonAttendee || event.isOnlineMeeting || event.onlineMeetingProvider);
}

function uniqueEvents(events: OutlookCalendarEvent[]): OutlookCalendarEvent[] {
  return Array.from(new Map(events.map((event) => [event.id, event])).values());
}

function userEmails(account: AccountInfo, profile: DgfUserProfile): Set<string> {
  return new Set(
    [account.username, profile.mail, profile.userPrincipalName]
      .map(normalizeEmailAddress)
      .filter(Boolean)
  );
}

function countAttendees(
  event: OutlookCalendarEvent,
  organizerEmail: string | undefined,
  organizerName: string | undefined
): ParticipantCount {
  if (!Array.isArray(event.attendees)) return { count: 0, hasUsableData: false };

  const organizer = normalizeEmailAddress(organizerEmail);
  const organizerDisplayName = organizerName?.trim().toLocaleLowerCase() || '';
  const people = new Map<string, true>();
  for (const attendee of event.attendees) {
    if (attendee.type === 'resource') continue;
    const email = normalizeEmailAddress(attendee.emailAddress?.address);
    const name = attendee.emailAddress?.name?.trim() || '';
    if (email && email === organizer) continue;
    if (!email && name && organizerDisplayName && name.toLocaleLowerCase() === organizerDisplayName) continue;
    if (!email && !name) continue;
    const key = email || `name:${name.toLocaleLowerCase()}`;
    people.set(key, true);
  }

  return {
    count: people.size,
    hasUsableData: event.attendees.some((attendee) =>
      attendee.type !== 'resource'
      &&
        Boolean(attendee.emailAddress?.address?.trim() || attendee.emailAddress?.name?.trim())
    ),
  };
}

function getLocalYearRange(now: Date): { start: Date; end: Date } {
  return {
    start: new Date(now.getFullYear(), 0, 1),
    end: new Date(now.getFullYear() + 1, 0, 1),
  };
}

function toUpcomingMeeting(
  event: OutlookCalendarEvent,
  now: Date
): UpcomingGraphMeeting | null {
  const start = eventStart(event);
  const end = eventEnd(event);
  if (!event.id || !start || (end && end <= now)) return null;

  const organizerEmail = event.organizer?.emailAddress?.address;
  const organizerName = event.organizer?.emailAddress?.name;
  const normalizedOrganizerName = organizerName?.trim().toLocaleLowerCase() || '';
  const attendeeCount = countAttendees(event, organizerEmail, organizerName);
  const participants = (event.attendees ?? [])
    .filter((attendee) => attendee.type !== 'resource')
    .map((attendee) => ({
      name: attendee.emailAddress?.name?.trim() || null,
      email: attendee.emailAddress?.address?.trim() || null,
    }))
    .filter((attendee) =>
      (attendee.name || attendee.email)
      && !(attendee.email && normalizeEmailAddress(attendee.email) === normalizeEmailAddress(organizerEmail))
      && !(!attendee.email
        && attendee.name
        && normalizedOrganizerName
        && attendee.name.toLocaleLowerCase() === normalizedOrganizerName)
    );
  const teams = isTeamsEvent(event);

  return {
    id: event.id,
    subject: event.subject?.trim() || 'Objet non renseigné',
    start: start.toISOString(),
    end: end?.toISOString() ?? null,
    organizerName: event.organizer?.emailAddress?.name?.trim() || null,
    organizerEmail: organizerEmail?.trim() || null,
    participants,
    participantCount: attendeeCount.hasUsableData ? attendeeCount.count : null,
    type: teams
      ? 'Teams'
      : event.isOnlineMeeting
        ? 'Autre réunion en ligne'
        : 'Présentielle',
    joinWebUrl: event.onlineMeeting?.joinUrl || null,
    location: event.location?.displayName?.trim() || null,
  };
}

export async function fetchUpcomingGraphMeetings(
  msal: IPublicClientApplication,
  account: AccountInfo,
  now: Date = new Date()
): Promise<UpcomingGraphMeeting[]> {
  const windowEnd = new Date(now.getTime() + UPCOMING_WINDOW_MINUTES * 60_000);
  const queryStart = new Date(now.getTime() - UPCOMING_WINDOW_MINUTES * 60_000);
  const events = await fetchCalendarViewEvents(
    msal,
    account,
    queryStart.toISOString(),
    windowEnd.toISOString()
  );

  return uniqueEvents(events)
    .filter(isMeetingEvent)
    .filter((event) => {
      const start = eventStart(event);
      const end = eventEnd(event);
      return Boolean(start && start <= windowEnd && (start >= now || (end && end > now)));
    })
    .map((event) => toUpcomingMeeting(event, now))
    .filter((meeting): meeting is UpcomingGraphMeeting => meeting !== null)
    .sort((first, second) => Date.parse(first.start) - Date.parse(second.start));
}

function toMeetingItem(event: OutlookCalendarEvent, profile: DgfUserProfile, account: AccountInfo): MeetingItem | null {
  const start = eventStart(event);
  const end = eventEnd(event);
  if (!event.id || !start || !end) return null;

  const currentUserEmails = userEmails(account, profile);
  const organizerEmail = event.organizer?.emailAddress?.address || '';
  const organizedByUser = currentUserEmails.has(normalizeEmailAddress(organizerEmail));
  const invited = (event.attendees ?? []).some((attendee) =>
    currentUserEmails.has(normalizeEmailAddress(attendee.emailAddress?.address))
  );
  const userRole: UserMeetingRole = organizedByUser
    ? 'organizer'
    : invited
      ? 'attendee'
      : 'undetermined';
  const teams = isTeamsEvent(event);

  return {
    id: event.id,
    graphId: event.id,
    title: event.subject?.trim() || 'Objet non renseigné',
    subject: event.subject,
    organizer: {
      name: event.organizer?.emailAddress?.name || '',
      email: organizerEmail,
    },
    start: start.toISOString(),
    end: end.toISOString(),
    startTimeZone: 'UTC',
    endTimeZone: 'UTC',
    location: event.location?.displayName,
    isOnlineMeeting: Boolean(event.isOnlineMeeting || teams),
    onlineMeetingProvider: event.onlineMeetingProvider,
    joinWebUrl: event.onlineMeeting?.joinUrl || undefined,
    webLink: event.webLink,
    status: end <= new Date() ? 'completed' : 'scheduled',
    ...(teams ? { captureMethod: 'teams_native' as const } : {}),
    isDgfMeeting: false,
    attendees: (event.attendees ?? []).map((attendee) => ({
      name: attendee.emailAddress?.name || '',
      email: attendee.emailAddress?.address || '',
      type: attendee.type || 'required',
      responseStatus: attendee.status?.response,
    })),
    hasTranscript: false,
    hasOfficialReport: false,
    userRole,
    transcriptAccessibility: 'pending_check',
    processingStatus: 'idle',
  };
}

function updateTranscriptCounts(
  data: GraphDashboardData,
  result: TranscriptCheckResult
): void {
  if (result.metadataConfirmed || result.metadata) {
    data.transcriptsAvailable += 1;
    return;
  }

  switch (result.status) {
    case 'transcript_unavailable':
      data.transcriptsUnavailable += 1;
      break;
    case 'permission_missing':
      data.transcriptPermissionMissing += 1;
      break;
    case 'authentication_error':
      data.transcriptAuthenticationErrors += 1;
      break;
    case 'access_refused':
    case 'sharing_restricted_by_organizer':
      data.transcriptAccessRefused += 1;
      break;
    case 'meeting_unresolved':
    case 'meeting_not_found':
    case 'external_tenant_restricted':
      data.transcriptUnresolved += 1;
      break;
    case 'transient_error':
    case 'tenant_access_disabled':
      data.transcriptTemporaryErrors += 1;
      break;
    case 'transcript_pending':
      data.transcriptPending += 1;
      break;
    default:
      data.transcriptUnresolved += 1;
      break;
  }
}

export async function fetchGraphDashboardData(
  msal: IPublicClientApplication,
  account: AccountInfo,
  onTranscriptProgress?: (progress: TranscriptCheckProgress) => void,
  now: Date = new Date()
): Promise<GraphDashboardData> {
  const { start, end } = getLocalYearRange(now);
  const [profile, calendarEvents, upcomingMeetings] = await Promise.all([
    fetchGraphUserProfile(msal, account),
    fetchCalendarViewEvents(msal, account, start.toISOString(), end.toISOString()),
    fetchUpcomingGraphMeetings(msal, account, now),
  ]);
  const events = uniqueEvents(calendarEvents)
    .filter(isMeetingEvent)
    .filter((event) => {
      const startDate = eventStart(event);
      return Boolean(startDate && startDate >= start && startDate < end);
    });
  const identities = userEmails(account, profile);
  const nowStamp = new Date();
  const attendeesByMeeting = events.map((event) =>
    countAttendees(event, event.organizer?.emailAddress?.address, event.organizer?.emailAddress?.name)
  );
  const totalParticipants = attendeesByMeeting.reduce((total, item) => total + item.count, 0);
  const averageParticipantMeetingCount = attendeesByMeeting.filter((item) => item.hasUsableData).length;
  const transcriptCandidates = events.filter((event) => {
    const endDate = eventEnd(event);
    return isTeamsEvent(event) && Boolean(endDate && endDate < nowStamp);
  });
  const meetingsWithoutJoinUrl = transcriptCandidates.filter((event) => !event.onlineMeeting?.joinUrl);
  const meetingsToCheck = transcriptCandidates
    .filter((event) => Boolean(event.onlineMeeting?.joinUrl))
    .map((event) => toMeetingItem(event, profile, account))
    .filter((meeting): meeting is MeetingItem => meeting !== null);

  const data: GraphDashboardData = {
    year: now.getFullYear(),
    meetingsThisYear: events.length,
    meetingsOrganized: events.filter((event) =>
      identities.has(normalizeEmailAddress(event.organizer?.emailAddress?.address))
    ).length,
    meetingsInvited: events.filter((event) => {
      if (identities.has(normalizeEmailAddress(event.organizer?.emailAddress?.address))) return false;
      return (event.attendees ?? []).some((attendee) =>
        identities.has(normalizeEmailAddress(attendee.emailAddress?.address))
      );
    }).length,
    averageParticipants: averageParticipantMeetingCount
      ? totalParticipants / averageParticipantMeetingCount
      : null,
    averageParticipantMeetingCount,
    transcriptChecks: transcriptCandidates.length,
    transcriptsAvailable: 0,
    transcriptsUnavailable: 0,
    transcriptPermissionMissing: 0,
    transcriptUnresolved: meetingsWithoutJoinUrl.length,
    transcriptAccessRefused: 0,
    transcriptAuthenticationErrors: 0,
    transcriptTemporaryErrors: 0,
    transcriptPending: 0,
    transcriptPermissionMessage: null,
    upcomingMeetings,
    refreshedAt: new Date().toISOString(),
    upcomingRefreshedAt: new Date().toISOString(),
  };

  if (meetingsToCheck.length === 0) {
    onTranscriptProgress?.({ completed: 0, total: 0 });
    return data;
  }

  const tokenResult = await getTranscriptAccessToken(msal, account);
  if (!tokenResult.hasPermission) {
    if (tokenResult.status === 'pending_admin_consent') {
      data.transcriptPermissionMissing += meetingsToCheck.length;
      data.transcriptPermissionMessage =
        tokenResult.error || "Le consentement à OnlineMeetingTranscript.Read.All est requis.";
    } else {
      data.transcriptAuthenticationErrors += meetingsToCheck.length;
      data.transcriptPermissionMessage =
        tokenResult.error || "L'acquisition du jeton de lecture des transcriptions a échoué.";
    }
    onTranscriptProgress?.({ completed: meetingsToCheck.length, total: meetingsToCheck.length });
    return data;
  }

  const client = createTranscriptGraphClient(msal, account);
  let nextIndex = 0;
  let completed = 0;
  const checkNext = async (): Promise<void> => {
    while (nextIndex < meetingsToCheck.length) {
      const meeting = meetingsToCheck[nextIndex++];
      try {
        const result = await checkMeetingTranscriptStatus(
          client,
          meeting,
          false,
          profile,
          true,
          undefined,
          true
        );
        updateTranscriptCounts(data, result);
      } catch {
        data.transcriptTemporaryErrors += 1;
        data.transcriptPermissionMessage =
          'Au moins une vérification Graph a échoué sans confirmer l’absence de transcription. Réessayez l’actualisation.';
      }
      completed += 1;
      onTranscriptProgress?.({ completed, total: meetingsToCheck.length });
    }
  };

  await Promise.all(
    Array.from(
      { length: Math.min(TRANSCRIPT_CHECK_CONCURRENCY, meetingsToCheck.length) },
      () => checkNext()
    )
  );

  return data;
}
