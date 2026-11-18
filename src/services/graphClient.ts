import { AccountInfo, InteractionRequiredAuthError, IPublicClientApplication } from '@azure/msal-browser';
import { Client } from '@microsoft/microsoft-graph-client';
import { loginRequest } from '../config/msalConfig';
import { DgfUserProfile } from '../types/auth';
import { MeetingItem } from '../types/meeting';
import { TranscriptDiagnosticReporter } from '../types/transcript';
import { classifyOrganizerDomain, isOrganizerIdentity } from './organizerClassification';

export interface GraphErrorExplanation {
  code: string;
  title: string;
  description: string;
  actionRequired: string;
}

export function explainEntraIdError(error: unknown): GraphErrorExplanation {
  const errStr = String(error);
  const errMsg = (error as { message?: string })?.message || errStr;

  if (errMsg.includes('AADSTS50011') || errMsg.includes('reply URL')) {
    return {
      code: 'AADSTS50011',
      title: 'URI de redirection non reconnue',
      description: "L'URL de l'application active dans votre navigateur n'est pas configurée dans les Redirect URIs de l'application Entra ID.",
      actionRequired: "Ouvrez le portail Entra ID > Inscriptions d'applications > Authentification > Plateforme SPA > Ajoutez l'URI exacte indiquée dans la console de diagnostic.",
    };
  }

  if (errMsg.includes('AADSTS65001') || errMsg.includes('consent')) {
    return {
      code: 'AADSTS65001',
      title: 'Consentement administrateur requis',
      description: "Les autorisations demandées (notamment pour les transcriptions de réunions Teams) nécessitent l'accord préalable d'un administrateur du tenant.",
      actionRequired: "Un administrateur M365 DGF doit se rendre sur l'application dans Entra ID et cliquer sur « Accorder un consentement d'administrateur ».",
    };
  }

  if (errMsg.includes('AADSTS700016') || errMsg.includes('was not found in the directory')) {
    return {
      code: 'AADSTS700016',
      title: "Application non trouvée dans l'annuaire",
      description: "Le Client ID ou le Tenant ID renseigné n'existe pas ou ne correspond à aucune inscription active dans ce locataire.",
      actionRequired: "Vérifiez que le Client ID et le Tenant ID correspondent fidèlement aux GUIDs générés dans le portail Microsoft Entra.",
    };
  }

  const errorCode = String((error as { errorCode?: string; code?: string })?.errorCode
    || (error as { code?: string })?.code
    || '').toLowerCase();
  const subError = String((error as { subError?: string })?.subError || '').toLowerCase();
  const timeoutMessage = `${errMsg} ${subError}`.toLowerCase();
  if (
    errorCode === 'timed_out'
    || ['redirect_bridge_timeout', 'popup_relay_timeout', 'monitor_window_timeout']
      .some((marker) => timeoutMessage.includes(marker))
  ) {
    return {
      code: 'POPUP_TIMEOUT',
      title: 'La fenêtre de connexion Microsoft a expiré',
      description: "La connexion par fenêtre n'a pas abouti. La session n'est pas considérée comme connectée; vous pouvez réessayer avec la redirection pleine page.",
      actionRequired: "Fermez toute fenêtre Microsoft encore ouverte, puis choisissez « Se connecter par redirection ». Cette option démarre après l'échec du popup, jamais en parallèle.",
    };
  }

  if (errMsg.includes('user_cancelled')) {
    return {
      code: 'USER_CANCELLED',
      title: 'Authentification interrompue',
      description: "La fenêtre pop-up d'authentification a été fermée avant la fin de la validation des identifiants.",
      actionRequired: "Cliquez à nouveau sur « Se connecter » pour finaliser la saisie de vos identifiants Microsoft 365.",
    };
  }

  if (errMsg.includes('interaction_in_progress')) {
    return {
      code: 'INTERACTION_IN_PROGRESS',
      title: 'Opération d authentification déjà en cours',
      description: "Une demande de connexion est déjà en attente dans une autre fenêtre ou un autre onglet.",
      actionRequired: "Fermez les fenêtres de connexion ouvertes ou attendez quelques secondes avant de relancer.",
    };
  }

  if (errMsg.includes('interaction_required') || errMsg.includes('consent_required')) {
    return {
      code: 'INTERACTION_REQUIRED',
      title: 'Action requise de l utilisateur',
      description: 'Une validation MFA (authentification multifacteur) ou un consentement utilisateur est nécessaire.',
      actionRequired: 'Cliquez à nouveau sur « Se connecter avec Microsoft Entra ID » pour valider vos informations.',
    };
  }

  return {
    code: 'GRAPH_API_ERROR',
    title: 'Erreur Microsoft Graph / Entra ID',
    description: errMsg,
    actionRequired: "Consultez les détails de l'erreur dans la console de diagnostic ou vérifiez vos autorisations dans Microsoft Entra ID.",
  };
}

export const TRANSCRIPT_REQUIRED_SCOPES = [
  'User.Read',
  'Calendars.Read',
  'OnlineMeetings.Read',
  'OnlineMeetingTranscript.Read.All',
];

export interface TranscriptTokenResult {
  token: string | null;
  hasPermission: boolean;
  status: 'granted' | 'pending_admin_consent' | 'interaction_required' | 'error';
  grantedScopes?: string[];
  error?: string;
}

function safeDiagnosticMessage(message: string): string {
  return message
    .replace(/Bearer\s+\S+/gi, 'Bearer [redacted]')
    .replace(/(access_token|refresh_token|authorization_code|code)=([^&\s]+)/gi, '$1=[redacted]')
    .replace(/https?:\/\/\S+/gi, '[URL masquée]')
    .replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi, '[adresse masquée]');
}

/**
 * ÉTAPE 1 & 2 : Vérifie les autorisations et acquiert le jeton Graph pour les transcriptions
 * Privilégie strictement acquireTokenSilent, gère InteractionRequiredAuthError
 * et ne divulgue jamais la valeur secrète du jeton dans les journaux ou l'interface.
 */
export async function getTranscriptAccessToken(
  msal: IPublicClientApplication,
  account: AccountInfo,
  onDiagnostic?: TranscriptDiagnosticReporter,
  attempt: number = 1
): Promise<TranscriptTokenResult> {
  try {
    const silentResponse = await msal.acquireTokenSilent({
      account,
      scopes: TRANSCRIPT_REQUIRED_SCOPES,
    });

    const granted = (silentResponse.scopes || []).map((s) => s.toLowerCase());
    const hasTranscriptScope = granted.includes('onlinemeetingtranscript.read.all');
    onDiagnostic?.({
      stage: 'token',
      outcome: hasTranscriptScope ? 'success' : 'error',
      attempt,
      requestedScopes: TRANSCRIPT_REQUIRED_SCOPES,
      grantedScopes: silentResponse.scopes || [],
      hasTranscriptScope,
      message: hasTranscriptScope ? undefined : "Le scope OnlineMeetingTranscript.Read.All est absent du résultat MSAL.",
      recordedAt: new Date().toISOString(),
    });

    if (hasTranscriptScope) {
      return {
        token: silentResponse.accessToken,
        hasPermission: true,
        status: 'granted',
        grantedScopes: silentResponse.scopes,
      };
    }

    return {
      token: null,
      hasPermission: false,
      status: 'pending_admin_consent',
      error: "Autorisation administrateur en attente : 'OnlineMeetingTranscript.Read.All' absente du jeton.",
      grantedScopes: silentResponse.scopes,
    };
  } catch (err: any) {
    const interactionRequired =
      err instanceof InteractionRequiredAuthError ||
      err?.errorCode === 'consent_required' ||
      err?.errorCode === 'interaction_required';
    const errorCode = err?.errorCode || err?.code;
    onDiagnostic?.({
      stage: 'token',
      outcome: interactionRequired ? 'interaction_required' : 'error',
      attempt,
      requestedScopes: TRANSCRIPT_REQUIRED_SCOPES,
      hasTranscriptScope: false,
      interactionRequired,
      msalErrorCode: errorCode ? String(errorCode) : undefined,
      message: safeDiagnosticMessage(err?.message || String(err)),
      recordedAt: new Date().toISOString(),
    });

    if (
      err instanceof InteractionRequiredAuthError ||
      err?.errorCode === 'consent_required' ||
      err?.errorCode === 'interaction_required' ||
      err?.message?.includes('AADSTS65001') ||
      err?.message?.includes('AADSTS90094')
    ) {
      return {
        token: null,
        hasPermission: false,
        status: interactionRequired ? 'interaction_required' : 'pending_admin_consent',
        error: "Autorisation administrateur en attente : le consentement du locataire DGF n'est pas encore accordé.",
      };
    }

    return {
      token: null,
      hasPermission: false,
      status: 'error',
      error: err?.message || String(err),
    };
  }
}

/**
 * Crée un client Microsoft Graph spécifiquement configuré pour les transcriptions Teams.
 * Les échecs d'acquisition sont typés sans les présenter comme des réponses HTTP Graph.
 */
export function createTranscriptGraphClient(
  msal: IPublicClientApplication,
  account: AccountInfo,
  onDiagnostic?: TranscriptDiagnosticReporter
): Client {
  let tokenAttempt = 0;
  return Client.init({
    authProvider: async (done) => {
      tokenAttempt += 1;
      const tokenRes = await getTranscriptAccessToken(msal, account, onDiagnostic, tokenAttempt);
      if (tokenRes.token && tokenRes.hasPermission) {
        done(null, tokenRes.token);
      } else {
        const error = new Error(
          tokenRes.error || "Autorisation administrateur en attente pour 'OnlineMeetingTranscript.Read.All'."
        );
        (error as any).code =
          tokenRes.status === 'interaction_required'
            ? 'INTERACTION_REQUIRED'
            : tokenRes.status === 'pending_admin_consent'
            ? 'TOKEN_SCOPE_MISSING'
            : 'TOKEN_ACQUISITION_FAILED';
        done(error, null);
      }
    },
  });
}

export function createGraphClient(
  msal: IPublicClientApplication,
  account: AccountInfo,
  customScopes?: string[]
): Client {
  const targetScopes = customScopes && customScopes.length > 0 ? customScopes : loginRequest.scopes;
  return Client.init({
    authProvider: async (done) => {
      try {
        const response = await msal.acquireTokenSilent({
          scopes: targetScopes,
          account,
        });
        done(null, response.accessToken);
      } catch (error) {
        if (error instanceof InteractionRequiredAuthError) {
          try {
            const popupResponse = await msal.acquireTokenPopup({
              scopes: targetScopes,
              account,
            });
            done(null, popupResponse.accessToken);
          } catch (popupErr) {
            done(popupErr as Error, null);
          }
        } else {
          done(error as Error, null);
        }
      }
    },
  });
}

export async function fetchGraphUserProfile(
  msal: IPublicClientApplication,
  account: AccountInfo
): Promise<DgfUserProfile> {
  const client = createGraphClient(msal, account);
  const data = await client
    .api('/me')
    .select('id,displayName,givenName,surname,mail,userPrincipalName,jobTitle,officeLocation,department')
    .get();

  return {
    id: data.id || undefined,
    displayName: data.displayName || account.name || 'Collaborateur DGF',
    givenName: data.givenName || undefined,
    surname: data.surname || undefined,
    mail: data.mail || undefined,
    userPrincipalName: data.userPrincipalName || account.username,
    jobTitle: data.jobTitle || undefined,
    officeLocation: data.officeLocation || undefined,
    department: data.department || undefined,
  };
}

export interface OutlookCalendarEvent {
  id: string;
  type?: string;
  isCancelled?: boolean;
  iCalUId?: string;
  seriesMasterId?: string;
  subject?: string;
  bodyPreview?: string;
  start?: { dateTime?: string; timeZone?: string };
  end?: { dateTime?: string; timeZone?: string };
  organizer?: { emailAddress?: { name?: string; address?: string } };
  location?: { displayName?: string };
  isOnlineMeeting?: boolean;
  onlineMeeting?: { joinUrl?: string; conferenceId?: string };
  onlineMeetingProvider?: string;
  webLink?: string;
  attendees?: Array<{
    type?: string;
    status?: { response?: string; time?: string };
    emailAddress?: { name?: string; address?: string };
  }>;
}

export function isTeamsOnlineMeeting(
  event: Pick<OutlookCalendarEvent, 'onlineMeetingProvider' | 'onlineMeeting'>
): boolean {
  let joinHost = '';
  let isSecureJoinUrl = false;
  try {
    if (event.onlineMeeting?.joinUrl) {
      const joinUrl = new URL(event.onlineMeeting.joinUrl);
      joinHost = joinUrl.hostname.toLowerCase();
      isSecureJoinUrl = joinUrl.protocol === 'https:';
    }
  } catch {
    joinHost = '';
  }
  return event.onlineMeetingProvider === 'teamsForBusiness'
    || (isSecureJoinUrl && (
      joinHost === 'teams.microsoft.com'
      || joinHost === 'teams.live.com'
      || joinHost.endsWith('.teams.microsoft.com')
    ));
}

export async function fetchCalendarViewEvents(
  msal: IPublicClientApplication,
  account: AccountInfo,
  startIso: string,
  endIso: string
): Promise<OutlookCalendarEvent[]> {
  const client = createGraphClient(msal, account);
  const firstPageResponse = await client
    .api('/me/calendarView')
    .header('Prefer', 'outlook.timezone="UTC"')
    .query({
      startDateTime: startIso,
      endDateTime: endIso,
      $top: 100,
      $orderby: 'start/dateTime asc',
      $select: 'id,type,isCancelled,iCalUId,seriesMasterId,subject,bodyPreview,start,end,location,organizer,attendees,isOnlineMeeting,onlineMeeting,onlineMeetingProvider,webLink',
    })
    .get();

  const rawEvents: OutlookCalendarEvent[] = Array.isArray(firstPageResponse?.value)
    ? [...firstPageResponse.value]
    : [];
  let nextLink: string | undefined = firstPageResponse?.['@odata.nextLink'];
  const visitedPageLinks = new Set<string>();

  while (nextLink) {
    if (visitedPageLinks.has(nextLink)) {
      throw new Error('Microsoft Graph a renvoyé un lien de pagination déjà traité.');
    }
    visitedPageLinks.add(nextLink);

    const nextPageResponse = await client.api(nextLink).header('Prefer', 'outlook.timezone="UTC"').get();
    if (Array.isArray(nextPageResponse?.value)) {
      rawEvents.push(...nextPageResponse.value);
    }
    nextLink = nextPageResponse?.['@odata.nextLink'];
  }

  return Array.from(new Map(rawEvents.filter((event) => event.id).map((event) => [event.id, event])).values());
}

export async function fetchRealCalendarMeetings(
  msal: IPublicClientApplication,
  account: AccountInfo,
  startIso: string,
  endIso: string,
  profile?: DgfUserProfile | null
): Promise<MeetingItem[]> {
  const uniqueEvents = await fetchCalendarViewEvents(msal, account, startIso, endIso);
  const now = new Date();

  return uniqueEvents.map((evt) => {
    const subject = evt.subject || 'Réunion sans objet';
    const isTeams = isTeamsOnlineMeeting(evt);

    const isDgf =
      subject.toUpperCase().includes('DGF') ||
      subject.toUpperCase().includes('FINANCEMENT') ||
      subject.toUpperCase().includes('PROJET') ||
      subject.toUpperCase().includes('BUDGET') ||
      Boolean(evt.organizer?.emailAddress?.address?.includes('finances.gouv.ci'));

    const attendees = (evt.attendees || []).map((att) => ({
      name: att.emailAddress?.name || 'Participant',
      email: att.emailAddress?.address || '',
      type: att.type || 'required',
      responseStatus: att.status?.response,
      isExternal: !att.emailAddress?.address?.includes('gouv.ci'),
    }));

    // Formatage UTC normalisé ISO
    const startDate = evt.start?.dateTime
      ? evt.start.dateTime.endsWith('Z')
        ? evt.start.dateTime
        : `${evt.start.dateTime}Z`
      : new Date().toISOString();

    const endDate = evt.end?.dateTime
      ? evt.end.dateTime.endsWith('Z')
        ? evt.end.dateTime
        : `${evt.end.dateTime}Z`
      : new Date().toISOString();

    const isPast = new Date(endDate) < now;

    const userEmails = new Set(
      [account.username, profile?.mail, profile?.userPrincipalName]
        .filter((email): email is string => Boolean(email))
        .map((email) => email.trim().toLowerCase())
    );
    const orgEmail = (evt.organizer?.emailAddress?.address || '').toLowerCase();
    const organizerClassification = classifyOrganizerDomain(orgEmail);
    const isCurrentUserOrganizer = isOrganizerIdentity(orgEmail, [
      account.username,
      profile?.mail,
      profile?.userPrincipalName,
    ]);

    let userRole: 'organizer' | 'coorganizer' | 'attendee' | 'undetermined' = 'undetermined';
    if (isCurrentUserOrganizer) {
      userRole = 'organizer';
    } else {
      const matchAttendee = attendees.find((attendee) =>
        userEmails.has(attendee.email.trim().toLowerCase())
      );
      if (matchAttendee) {
        userRole = 'attendee';
      }
    }

    const isExternalOrg = organizerClassification === 'external';

    return {
      id: evt.id,
      graphId: evt.id,
      title: subject,
      subject,
      bodyPreview: evt.bodyPreview || undefined,
      organizer: {
        name: evt.organizer?.emailAddress?.name || 'Organisateur inconnu',
        email: evt.organizer?.emailAddress?.address || '',
        isExternal: isExternalOrg,
      },
      start: startDate,
      end: endDate,
      startTimeZone: evt.start?.timeZone || 'UTC',
      endTimeZone: evt.end?.timeZone || 'UTC',
      location: evt.location?.displayName || (isTeams ? 'Microsoft Teams (En ligne)' : 'Salle non spécifiée'),
      isOnlineMeeting: isTeams,
      onlineMeetingProvider: evt.onlineMeetingProvider,
      joinWebUrl: evt.onlineMeeting?.joinUrl || undefined,
      webLink: evt.webLink || undefined,
      status: isPast ? 'completed' : 'scheduled',
      ...(isTeams ? { captureMethod: 'teams_native' as const } : {}),
      isDgfMeeting: isDgf,
      departmentCode: isDgf ? 'DGF' : undefined,
      attendees,
      hasTranscript: false,
      hasOfficialReport: false,
      userRole,
      isExternalOrganizer: isExternalOrg,
      transcriptAccessibility: isTeams ? (isPast ? 'pending_check' : 'pending_check') : 'no_transcript',
      processingStatus: 'idle',
    };
  });
}
