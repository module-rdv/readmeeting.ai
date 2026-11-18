/**
 * ReadMeeting.ai | Direction Générale des Financements (DGF)
 * Service de récupération, de diagnostic et de gestion du cache des transcriptions Microsoft Teams.
 * Conforme à Microsoft Graph API v1.0, aux stratégies Teams et aux exigences de gouvernance DGF.
 */

import { Client, GraphRequest, ResponseType } from '@microsoft/microsoft-graph-client';
import { MeetingItem, UserMeetingRole, TranscriptAccessibilityStatus } from '../types/meeting';
import { DgfUserProfile } from '../types/auth';
import {
  classifyOrganizerDomain,
  isOrganizerIdentity,
  normalizeEmailAddress,
} from './organizerClassification';
import {
  MeetingTemporalStatus,
  TranscriptCheckResult,
  TranscriptContent,
  TranscriptCue,
  TranscriptErrorDetail,
  TranscriptMetadata,
  TranscriptStatus,
  HumanValidationAudit,
  IdentifiedSpeaker,
  TranscriptRetrievalAudit,
  TranscriptDiagnosticEvent,
  TranscriptDiagnosticReporter
} from '../types/transcript';

// Cache en mémoire pour éviter les requêtes Graph répétées et le dépassement de quota (HTTP 429)
interface CacheEntry {
  result: TranscriptCheckResult;
  expiresAt: number;
}

const memoryCache = new Map<string, CacheEntry>();
const CACHE_TTL_SUCCESS_MS = 10 * 60 * 1000; // 10 minutes pour une transcription confirmée
const CACHE_TTL_ERROR_MS = 2 * 60 * 1000;     // 2 minutes pour une absence ou erreur temporaire

/**
 * 1. Détermine le statut temporel d'une réunion (programmée, en cours, terminée)
 * Basé strictement sur l'horloge et les heures de début et fin de convocation.
 */
export function getMeetingTemporalStatus(
  startIso: string,
  endIso: string,
  now: Date = new Date()
): MeetingTemporalStatus {
  const startDate = new Date(startIso);
  const endDate = new Date(endIso);

  if (now < startDate) {
    return 'scheduled';
  }
  if (now >= startDate && now <= endDate) {
    return 'in_progress';
  }
  return 'completed';
}

/**
  * Détermine le rôle de l'utilisateur connecté dans la réunion :
  * - 'organizer' : L'utilisateur est l'organisateur convoquant
  * - 'coorganizer' : L'utilisateur a été désigné coorganisateur
  * - 'attendee' : L'utilisateur a été convoqué comme participant invité
  * - 'undetermined' : Simple détenteur de lien, absent de l'invitation
  */
export function detectUserMeetingRole(
  meeting: MeetingItem,
  user: DgfUserProfile | null
): UserMeetingRole {
  if (!user) return 'undetermined';

  const userMail = normalizeEmailAddress(user.mail);
  const userUpn = normalizeEmailAddress(user.userPrincipalName);
  const orgEmail = normalizeEmailAddress(meeting.organizer.email);

  // 1. Contrôle du rôle Organisateur
  if (isOrganizerIdentity(orgEmail, [userMail, userUpn])) {
    return 'organizer';
  }

  // 2. Contrôle de la convocation dans la liste des participants
  if (Array.isArray(meeting.attendees)) {
    const matchingAttendee = meeting.attendees.find((att) => {
      const attEmail = normalizeEmailAddress(att.email);
      return (userMail && attEmail === userMail) || (userUpn && attEmail === userUpn);
    });

    if (matchingAttendee) {
      if (
        matchingAttendee.role === 'coorganizer' ||
        matchingAttendee.type === 'coorganizer'
      ) {
        return 'coorganizer';
      }
      return 'attendee';
    }
  }

  // 3. Simple détention du lien sans convocation formelle
  return 'undetermined';
}

/**
 * Détecte si l'organisateur de la réunion appartient à une organisation / locataire externe.
 */
export function isOrganizerExternal(
  organizerEmail: string,
  _userUpnOrMail?: string
): boolean {
  return classifyOrganizerDomain(organizerEmail) === 'external';
}

/**
 * Convertit un timestamp WebVTT (HH:MM:SS.mmm ou MM:SS.mmm) en secondes
 */
export function timeStringToSeconds(timeStr: string): number {
  const parts = timeStr.trim().split(':');
  if (parts.length === 3) {
    const hours = parseFloat(parts[0]);
    const minutes = parseFloat(parts[1]);
    const seconds = parseFloat(parts[2]);
    return hours * 3600 + minutes * 60 + seconds;
  }
  if (parts.length === 2) {
    const minutes = parseFloat(parts[0]);
    const seconds = parseFloat(parts[1]);
    return minutes * 60 + seconds;
  }
  return 0;
}

/**
 * Analyse et structure le contenu brut WebVTT d'une transcription Teams
 */
export function parseVttTranscript(rawVtt: string): TranscriptContent {
  const lines = rawVtt.replace(/\r\n/g, '\n').replace(/\r/g, '\n').split('\n');
  const cues: TranscriptCue[] = [];
  const speakersSet = new Set<string>();

  const timeRegex = /((\d{2}:)?\d{2}:\d{2}\.\d{3})\s*-->\s*((\d{2}:)?\d{2}:\d{2}\.\d{3})/;
  const voiceTagRegex = /<v\s+([^>]+)>(.*?)<\/v>/i;
  const legacyVoiceTagRegex = /<v\s+([^>]+)>(.*)/i;

  let currentStartTime = '';
  let currentEndTime = '';
  let currentSpeaker = 'Intervenant';
  let currentTextBuffer: string[] = [];

  const finalizeCue = () => {
    if (currentStartTime && currentEndTime && currentTextBuffer.length > 0) {
      const fullText = currentTextBuffer.join(' ').trim();
      if (fullText) {
        cues.push({
          id: `cue-${cues.length + 1}`,
          speakerName: currentSpeaker,
          startTime: currentStartTime,
          endTime: currentEndTime,
          startSeconds: timeStringToSeconds(currentStartTime),
          endSeconds: timeStringToSeconds(currentEndTime),
          text: fullText,
        });
        speakersSet.add(currentSpeaker);
      }
    }
    currentTextBuffer = [];
  };

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();

    if (!line || line.startsWith('WEBVTT') || line.startsWith('NOTE')) {
      continue;
    }

    const timeMatch = line.match(timeRegex);
    if (timeMatch) {
      finalizeCue();
      currentStartTime = timeMatch[1];
      currentEndTime = timeMatch[3];
      currentSpeaker = 'Intervenant';
      continue;
    }

    // Détection de balise voix Teams <v Nom Prénom>Texte</v>
    const voiceMatch = line.match(voiceTagRegex) || line.match(legacyVoiceTagRegex);
    if (voiceMatch) {
      currentSpeaker = voiceMatch[1].trim();
      const spokenText = voiceMatch[2].replace(/<\/v>/g, '').trim();
      if (spokenText) {
        currentTextBuffer.push(spokenText);
      }
      continue;
    }

    // Ligne de texte ordinaire
    if (currentStartTime) {
      currentTextBuffer.push(line);
    }
  }

  finalizeCue();

  const totalWords = cues.reduce((acc, c) => acc + c.text.split(/\s+/).filter(Boolean).length, 0);
  const durationSeconds = cues.length > 0 ? cues[cues.length - 1].endSeconds : 0;

  // Calcul des statistiques par intervenant pour l'attribution des locuteurs
  const speakerStatsMap = new Map<string, { interventionsCount: number; totalWords: number }>();
  for (const cue of cues) {
    const words = cue.text.split(/\s+/).filter(Boolean).length;
    const existing = speakerStatsMap.get(cue.speakerName) || { interventionsCount: 0, totalWords: 0 };
    speakerStatsMap.set(cue.speakerName, {
      interventionsCount: existing.interventionsCount + 1,
      totalWords: existing.totalWords + words,
    });
  }

  const AVATAR_GRADIENTS = [
    'from-emerald-600 to-teal-800',
    'from-blue-600 to-indigo-800',
    'from-purple-600 to-violet-800',
    'from-amber-600 to-orange-800',
    'from-rose-600 to-pink-800',
    'from-cyan-600 to-blue-800',
  ];

  const speakers: IdentifiedSpeaker[] = Array.from(speakerStatsMap.entries()).map(([name, stats], idx) => ({
    name,
    interventionsCount: stats.interventionsCount,
    totalWords: stats.totalWords,
    avatarColor: AVATAR_GRADIENTS[idx % AVATAR_GRADIENTS.length],
  }));

  return {
    format: 'text/vtt',
    rawContent: rawVtt,
    cues,
    totalWords,
    durationSeconds,
    speakersCount: speakerStatsMap.size,
    speakers,
  };
}

export const NON_ATTRIBUTED_SPEAKER_LABEL = 'Intervenant non attribué';

/**
 * Analyse le format Graph horodaté sans balises d'identification des intervenants.
 */
export function parseUnattributedTranscript(rawText: string): TranscriptContent {
  const lines = rawText.replace(/\r\n/g, '\n').replace(/\r/g, '\n').split('\n');
  const cues: TranscriptCue[] = [];
  const timestampPattern = '(?:\\d{2}:)?\\d{2}:\\d{2}\\.\\d{3}';
  const timestampLineRegex = new RegExp(
    `^\\s*\\[?(${timestampPattern})\\]?(?:\\s*-->\\s*\\[?(${timestampPattern})\\]?)?\\s*(.*)$`
  );
  let currentStartTime = '';
  let currentEndTime = '';
  let currentTextBuffer: string[] = [];

  const finalizeCue = () => {
    const text = currentTextBuffer.join(' ').replace(/\s+/g, ' ').trim();
    if (currentStartTime && text) {
      cues.push({
        id: `cue-${cues.length + 1}`,
        speakerName: NON_ATTRIBUTED_SPEAKER_LABEL,
        startTime: currentStartTime,
        endTime: currentEndTime,
        startSeconds: timeStringToSeconds(currentStartTime),
        endSeconds: timeStringToSeconds(currentEndTime),
        text,
      });
    }
    currentTextBuffer = [];
  };

  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (!line || line.startsWith('WEBVTT') || line.startsWith('NOTE')) continue;

    const timestampMatch = line.match(timestampLineRegex);
    if (timestampMatch) {
      finalizeCue();
      currentStartTime = timestampMatch[1];
      currentEndTime = timestampMatch[2] || timestampMatch[1];
      if (timestampMatch[3]) currentTextBuffer.push(timestampMatch[3]);
    } else if (currentStartTime) {
      currentTextBuffer.push(line);
    }
  }
  finalizeCue();

  cues.sort((left, right) => left.startSeconds - right.startSeconds);
  cues.forEach((cue, index) => {
    cue.id = `cue-${index + 1}`;
  });
  const totalWords = cues.reduce((total, cue) => total + cue.text.split(/\s+/).filter(Boolean).length, 0);
  const durationSeconds = cues.reduce((duration, cue) => Math.max(duration, cue.endSeconds), 0);

  return {
    format: 'text/plain',
    rawContent: rawText,
    cues,
    totalWords,
    durationSeconds,
    speakersCount: 0,
    speakers: [],
  };
}

export function createTranscriptExport(
  content: TranscriptContent,
  meetingTitle: string
): { content: string; mimeType: string; filename: string } {
  const isVtt = content.format === 'text/vtt';
  const sanitizedTitle = meetingTitle.replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 40);
  return {
    content: content.rawContent,
    mimeType: isVtt ? 'text/vtt;charset=utf-8' : 'text/plain;charset=utf-8',
    filename: `Transcription_Teams_${sanitizedTitle}.${isVtt ? 'vtt' : 'txt'}`,
  };
}

interface GraphRequestDiagnosticOptions {
  stage: TranscriptDiagnosticEvent['stage'];
  attempt: number;
  endpoint: string;
  userRole?: UserMeetingRole;
  joinWebUrl?: string;
  format: 'json' | 'text';
  requestedFormat?: TranscriptDiagnosticEvent['requestedFormat'];
  transcriptId?: string;
  onDiagnostic?: TranscriptDiagnosticReporter;
}

interface GraphRequestDiagnosticResult<T> {
  data: T;
  event: TranscriptDiagnosticEvent;
}

interface RawGraphResponse {
  status: number;
  ok?: boolean;
  headers: { get(name: string): string | null };
  text(): Promise<string>;
}

function isRawGraphResponse(response: unknown): response is RawGraphResponse {
  const candidate = response as RawGraphResponse | null;
  return Boolean(
    candidate &&
    typeof candidate.status === 'number' &&
    typeof candidate.headers?.get === 'function' &&
    typeof candidate.text === 'function'
  );
}

function safeDiagnosticMessage(message: string, joinWebUrl?: string): string {
  let safeMessage = message
    .replace(/Bearer\s+\S+/gi, 'Bearer [redacted]')
    .replace(/(access_token|refresh_token|authorization_code|code)=([^&\s]+)/gi, '$1=[redacted]');
  safeMessage = safeMessage
    .replace(/https?:\/\/\S+/gi, '[URL masquée]')
    .replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi, '[adresse masquée]');
  if (joinWebUrl) {
    safeMessage = safeMessage
      .split(joinWebUrl).join('[JoinWebUrl masqué]')
      .split(encodeURIComponent(joinWebUrl)).join('[JoinWebUrl masqué]');
  }
  return safeMessage;
}

function graphErrorParts(error: any): {
  graphErrorCode?: string;
  graphInnerErrorCode?: string;
  requestId?: string;
} {
  const body = error?.error?.error || error?.error || error?.body?.error || {};
  const headers = error?.headers || error?.response?.headers;
  const requestId =
    error?.requestId ||
    headers?.get?.('request-id') ||
    headers?.get?.('client-request-id') ||
    undefined;
  return {
    graphErrorCode: body?.code || error?.graphErrorCode || error?.code || undefined,
    graphInnerErrorCode:
      body?.innerError?.code ||
      body?.innererror?.code ||
      error?.graphInnerErrorCode ||
      undefined,
    requestId,
  };
}

function emitDiagnostic(
  reporter: TranscriptDiagnosticReporter | undefined,
  event: TranscriptDiagnosticEvent
): void {
  reporter?.(event);
}

async function executeGraphRequest<T>(
  request: GraphRequest,
  options: GraphRequestDiagnosticOptions
): Promise<GraphRequestDiagnosticResult<T>> {
  const event: TranscriptDiagnosticEvent = {
    stage: options.stage,
    outcome: 'error',
    attempt: options.attempt,
    endpoint: options.endpoint,
    userRole: options.userRole,
    requestedFormat: options.requestedFormat,
    transcriptId: options.transcriptId,
    recordedAt: new Date().toISOString(),
  };

  try {
    const rawResponse = await request.responseType(ResponseType.RAW).get();
    if (!isRawGraphResponse(rawResponse)) {
      // The SDK resolves parsed payloads only for successful HTTP responses; this path also supports existing unit mocks.
      event.httpStatus = 200;
      event.outcome = 'success';
      emitDiagnostic(options.onDiagnostic, event);
      return { data: rawResponse as T, event };
    }

    event.httpStatus = rawResponse.status;
    event.requestId =
      rawResponse.headers.get('request-id') ||
      rawResponse.headers.get('client-request-id') ||
      undefined;
    event.contentType = rawResponse.headers.get('content-type') || undefined;

    const responseText = await rawResponse.text();
    if (rawResponse.status < 200 || rawResponse.status >= 300) {
      let payload: any;
      try {
        payload = responseText ? JSON.parse(responseText) : undefined;
      } catch {
        payload = undefined;
      }

      const graphError = payload?.error || {};
      event.outcome = 'error';
      event.graphErrorCode = graphError.code || undefined;
      event.graphInnerErrorCode =
        graphError.innerError?.code || graphError.innererror?.code || undefined;
      event.message = safeDiagnosticMessage(
        graphError.message || `Microsoft Graph a répondu HTTP ${rawResponse.status}.`,
        options.joinWebUrl
      );
      emitDiagnostic(options.onDiagnostic, event);

      const graphRequestError: any = new Error(event.message);
      graphRequestError.statusCode = rawResponse.status;
      graphRequestError.code = event.graphInnerErrorCode || event.graphErrorCode;
      graphRequestError.graphErrorCode = event.graphErrorCode;
      graphRequestError.graphInnerErrorCode = event.graphInnerErrorCode;
      graphRequestError.requestId = event.requestId;
      graphRequestError.headers = rawResponse.headers;
      graphRequestError.error = payload;
      throw graphRequestError;
    }

    let data: T;
    if (options.format === 'text') {
      data = responseText as T;
      event.contentSizeBytes = new TextEncoder().encode(responseText).length;
    } else {
      try {
        data = (responseText ? JSON.parse(responseText) : undefined) as T;
      } catch {
        event.outcome = 'invalid_response';
        event.message = 'La réponse Graph HTTP 200 ne contient pas un JSON valide.';
        emitDiagnostic(options.onDiagnostic, event);
        const invalidResponseError: any = new Error(event.message);
        invalidResponseError.statusCode = rawResponse.status;
        invalidResponseError.code = 'GRAPH_INVALID_RESPONSE';
        invalidResponseError.requestId = event.requestId;
        throw invalidResponseError;
      }
    }

    event.outcome = 'success';
    emitDiagnostic(options.onDiagnostic, event);
    return { data, event };
  } catch (error: any) {
    const authProviderFailure = [
      'TOKEN_SCOPE_MISSING',
      'INTERACTION_REQUIRED',
      'TOKEN_ACQUISITION_FAILED',
    ].includes(error?.code);
    if (authProviderFailure) {
      event.outcome = 'skipped';
      event.msalErrorCode = error.code;
      event.message = 'Aucun appel HTTP Microsoft Graph n’a été envoyé, car l’acquisition du jeton a échoué.';
      emitDiagnostic(options.onDiagnostic, event);
      throw error;
    }

    if (event.outcome !== 'error' && event.outcome !== 'invalid_response') {
      const parts = graphErrorParts(error);
      event.outcome = 'error';
      event.httpStatus = event.httpStatus ?? error?.statusCode ?? error?.status;
      event.graphErrorCode = parts.graphErrorCode;
      event.graphInnerErrorCode = parts.graphInnerErrorCode;
      event.requestId = event.requestId || parts.requestId;
      event.message = safeDiagnosticMessage(error?.message || String(error), options.joinWebUrl);
      emitDiagnostic(options.onDiagnostic, event);
    }
    throw error;
  }
}

/**
 * Traduit et qualifie rigoureusement les erreurs Microsoft Graph sur les transcriptions.
 * Distingue explicitement :
 * - Permission absente / consentement non accordé
 * - GraphAccessToTranscriptsDisabled (désactivation au niveau du tenant Teams)
 * - Réunion introuvable ou expirée (HTTP 404)
 * - Limitation de débit (HTTP 429)
 * - Erreur temporaire serveur (HTTP 5xx)
 * Ne confond jamais un 403 avec une simple permission, ni un 404 avec une absence d'enregistrement.
 */
export interface ErrorContext {
  userRole?: UserMeetingRole;
  isExternalOrganizer?: boolean;
  hasTranscriptPermission?: boolean;
  organizerName?: string;
  organizerEmail?: string;
}

/**
 * Traduit et qualifie rigoureusement les erreurs Microsoft Graph sur les transcriptions.
 * Distingue explicitement :
 * - Permission absente / consentement non accordé
 * - GraphAccessToTranscriptsDisabled (désactivation au niveau du tenant Teams)
 * - Refus de partage Teams par l'organisateur (Organizers only)
 * - Réunion issue d'un tenant externe (accès cross-tenant restreint)
 * - Réunion introuvable ou expirée (HTTP 404)
 * - Limitation de débit (HTTP 429)
 * - Erreur temporaire serveur (HTTP 5xx)
 */
export function explainTranscriptError(error: any, context?: ErrorContext): TranscriptErrorDetail {
  const status = error?.statusCode || error?.status || error?.response?.status;
  const message = error?.message || String(error);
  const code = error?.code || error?.error?.code || '';
  const graphParts = graphErrorParts(error);

  if (code === 'GRAPH_INVALID_RESPONSE') {
    return {
      code,
      graphErrorCode: graphParts.graphErrorCode,
      requestId: graphParts.requestId,
      title: 'Réponse Microsoft Graph invalide',
      message: safeDiagnosticMessage(message),
      httpStatus: status,
      actionRequired: 'La réponse Graph ne correspond pas au format attendu. Cette réponse ne confirme pas l’absence de transcription.',
    };
  }

  if (code === 'TOKEN_SCOPE_MISSING') {
    return {
      code: 'PERMISSION_MISSING',
      title: 'Scope de transcription absent du résultat MSAL',
      message: 'Aucun appel Microsoft Graph n’a été exécuté : le scope requis est absent des scopes retournés par MSAL.',
      actionRequired: 'Vérifiez le consentement déjà accordé et relancez le diagnostic. Cette situation ne constitue pas un refus HTTP Graph.',
      missingPermission: 'OnlineMeetingTranscript.Read.All',
    };
  }

  if (code === 'INTERACTION_REQUIRED' || code === 'TOKEN_ACQUISITION_FAILED') {
    return {
      code,
      title: code === 'INTERACTION_REQUIRED' ? 'Interaction Microsoft requise' : 'Échec d’authentification Microsoft',
      message: safeDiagnosticMessage(message),
      actionRequired: code === 'INTERACTION_REQUIRED'
        ? 'Une interaction Microsoft supplémentaire est requise. Relancez le parcours de connexion avant de retenter le diagnostic.'
        : 'Vérifiez la session Microsoft connectée puis relancez le diagnostic.',
    };
  }

  // 1. Accès désactivé au niveau du tenant Microsoft Teams (GraphAccessToTranscriptsDisabled)
  if (
    code === 'GraphAccessToTranscriptsDisabled' ||
    message.includes('GraphAccessToTranscriptsDisabled') ||
    message.includes('transcripts is disabled') ||
    message.includes('Access to transcripts is disabled')
  ) {
    return {
      code: 'GRAPH_ACCESS_DISABLED',
      graphErrorCode: graphParts.graphErrorCode,
      requestId: graphParts.requestId,
      title: 'Accès API aux transcriptions désactivé sur le locataire DGF',
      message: "L'accès de Microsoft Graph aux transcriptions Teams est désactivé au niveau du locataire Microsoft 365 (stratégie de sécurité GraphAccessToTranscriptsDisabled).",
      httpStatus: status,
      actionRequired: "Un administrateur Teams DGF doit activer l'accès API dans le Teams Admin Center (Meetings > Meeting settings > Transcript API access > Microsoft Graph access = On) ou via PowerShell: Set-CsTeamsMeetingConfiguration -Identity Global -EnableGraphTranscriptAccess $true.",
      teamsPolicyNote: "Par défaut chez Microsoft, cette option de sécurité est désactivée pour tous les locataires d'entreprise.",
    };
  }

  // 2. Attribution des locuteurs désactivée dans Teams (EnableAttributedTranscripts)
  if (
    code === 'AttributedTranscriptDisabled' ||
    message.includes('AttributedTranscriptDisabled') ||
    message.includes('EnableAttributedTranscripts') ||
    message.includes('attribution is disabled')
  ) {
    return {
      code: 'SPEAKER_ATTRIBUTION_DISABLED',
      graphErrorCode: graphParts.graphErrorCode,
      requestId: graphParts.requestId,
      title: 'Attribution des locuteurs non autorisée',
      message: "L'attribution nominale des interventions aux locuteurs convoqués est désactivée par stratégie dans le locataire Teams.",
      httpStatus: 403,
      actionRequired: "Un administrateur Teams DGF doit activer le paramètre EnableAttributedTranscripts ($true) via PowerShell ou Teams Admin Center.",
      teamsPolicyNote: "La transcription reste lisible mais les balises d'intervenants ne sont pas attribuées nominativement.",
    };
  }

  // 3. Réunion organisée par un locataire externe (Scénario cross-tenant restreint)
  if (
    code === 'CrossTenantAccessRestricted' ||
    message.includes('CrossTenantAccessRestricted') ||
    message.includes('external tenant')
  ) {
    return {
      code: 'EXTERNAL_TENANT_RESTRICTED',
      graphErrorCode: graphParts.graphErrorCode,
      requestId: graphParts.requestId,
      title: 'Réunion organisée par un locataire externe',
      message: "L'organisateur de cette réunion appartient à un locataire Microsoft 365 externe. L'accès délégué inter-organisations aux transcriptions Teams est restreint par les politiques de sécurité Entra ID.",
      httpStatus: 403,
      actionRequired: "Pour les réunions organisées par des partenaires ou bailleurs externes (ex: BAD, AFD), demandez à l'organisateur d'exporter le fichier WebVTT ou d'activer une collaboration inter-locataires autorisée (B2B).",
      teamsPolicyNote: "Conformité de gouvernance DGF : Les flux de transcription des locataires externes ne sont pas accessibles via les droits délégués du tenant DGF.",
    };
  }

  // 4. Refus de partage par l'organisateur (Organizers and co-organizers only)
  // Détecté lorsque l'utilisateur est participant invité et que Graph renvoie 403 Forbidden sur /transcripts alors que la permission OnlineMeetingTranscript.Read.All est accordée
  if (
    code === 'SharingRestriction' ||
    code === 'TranscriptSharingRestricted' ||
    code === 'OrganizerOnly' ||
    message.includes('SharingRestriction') ||
    message.includes('OrganizerOnly') ||
    message.includes('Who can view transcripts')
  ) {
    return {
      code: 'SHARING_RESTRICTED_BY_ORGANIZER',
      graphErrorCode: graphParts.graphErrorCode,
      requestId: graphParts.requestId,
      title: "Accès à la transcription restreint par l'organisateur",
      message: "Cette transcription n'est pas accessible avec les droits de votre compte Microsoft 365. Veuillez demander à l'organisateur de vous accorder l'accès.",
      httpStatus: 403,
      actionRequired: `L'organisateur de la réunion (${context?.organizerName || 'Organisateur'}) a configuré les options Teams pour restreindre la consultation aux organisateurs et coorganisateurs. Demandez-lui d'autoriser le partage sur « Tous les participants » (Everyone) dans les options de la réunion Teams.`,
      teamsPolicyNote: "Paramètres de réunion Teams : « Qui peut afficher la transcription » configuré sur « Organisateurs et coorganisateurs ».",
    };
  }

  // 5. Permission déléguée absente ou consentement non accordé
  if (
    status !== 401 &&
    (code === 'PERMISSION_MISSING' ||
      context?.hasTranscriptPermission === false ||
      message.includes('OnlineMeetingTranscript.Read.All') ||
      message.includes('AADSTS65001') ||
      message.includes('AADSTS90094'))
  ) {
    return {
      code: 'PERMISSION_MISSING',
      graphErrorCode: graphParts.graphErrorCode,
      requestId: graphParts.requestId,
      title: 'Autorisation administrateur en attente',
      message: "L'autorisation déléguée 'OnlineMeetingTranscript.Read.All' requiert le consentement préalable de l'administrateur du locataire DGF. Aucune tentative de contournement n'est autorisée.",
      httpStatus: status,
      actionRequired: "Un administrateur du locataire Microsoft 365 DGF doit accorder le consentement d'administrateur pour la permission déléguée 'OnlineMeetingTranscript.Read.All'.",
      missingPermission: 'OnlineMeetingTranscript.Read.All',
    };
  }

  if (status === 401) {
    return {
      code: 'AUTHENTICATION_REQUIRED',
      graphErrorCode: graphParts.graphErrorCode,
      requestId: graphParts.requestId,
      title: 'Authentification Microsoft Graph requise',
      message: safeDiagnosticMessage(message),
      httpStatus: 401,
      actionRequired: 'La session ou le jeton Microsoft doit être renouvelé avant de réessayer.',
    };
  }

  if (status === 403) {
    return {
      code: 'ACCESS_DENIED',
      graphErrorCode: graphParts.graphErrorCode,
      requestId: graphParts.requestId,
      title: 'Accès à la transcription refusé par Microsoft Graph',
      message: safeDiagnosticMessage(message),
      httpStatus: 403,
      actionRequired: 'Vérifiez les droits effectifs sur cette réunion et les stratégies Microsoft Teams. Cette réponse ne confirme pas une absence de transcription.',
    };
  }

  // 6. Réunion introuvable ou expirée dans Microsoft Graph (HTTP 404)
  if (status === 404 || code === 'ItemNotFound' || code === 'MeetingNotFound' || message.includes('ItemNotFound')) {
    return {
      code: 'MEETING_NOT_FOUND',
      title: 'Réunion Teams introuvable ou expirée',
      message: "L'identifiant de la réunion est introuvable ou la session a expiré dans le service Microsoft Teams (404 Not Found).",
      httpStatus: 404,
      actionRequired: "Vérifiez que le lien de réunion est valide et que l'événement n'a pas été supprimé du calendrier.",
    };
  }

  // 7. Limitation de débit / Quota Microsoft Graph (HTTP 429)
  if (status === 429 || message.includes('TooManyRequests') || code === 'TooManyRequests') {
    const retryAfter = error?.headers?.get?.('Retry-After') || 10;
    return {
      code: 'RATE_LIMIT_EXCEEDED',
      title: 'Quota Microsoft Graph temporairement dépassé (HTTP 429)',
      message: `Trop de requêtes adressées à l'API Microsoft Graph. Veuillez patienter ${retryAfter} secondes.`,
      httpStatus: 429,
      actionRequired: `Attendez la fin de la période d'attente imposée par Microsoft (${retryAfter}s) avant de réinterroger.`,
      retryAfterSeconds: parseInt(String(retryAfter), 10) || 10,
    };
  }

  // 8. Session expirée ou non autorisée (HTTP 401)
  if (status === 401 || message.includes('Unauthorized') || code === 'InvalidAuthenticationToken') {
    return {
      code: 'UNAUTHORIZED',
      title: 'Session Microsoft 365 expirée',
      message: 'Le jeton de session Entra ID est expiré ou invalide.',
      httpStatus: 401,
      actionRequired: 'Veuillez vous reconnecter via la mire institutionnelle Microsoft.',
    };
  }

  // 9. Erreur temporaire de service (HTTP 500, 502, 503, 504)
  if (status && status >= 500) {
    return {
      code: 'TRANSIENT_SERVICE_ERROR',
      title: 'Service Microsoft Graph temporairement indisponible',
      message: `Les serveurs Microsoft ont renvoyé une erreur temporaire (HTTP ${status}).`,
      httpStatus: status,
      actionRequired: 'Veuillez renouveler votre demande dans quelques instants.',
    };
  }

  return {
    code: 'GRAPH_TRANSCRIPT_ERROR',
    title: 'Erreur technique Microsoft Graph',
    message,
    httpStatus: status,
    actionRequired: 'Consultez le journal de diagnostic ou renouvelez votre tentative ultérieurement.',
  };
}

export interface MeetingResolutionOptions {
  organizerEmail?: string;
  userRole?: UserMeetingRole;
  isExternalOrganizer?: boolean;
  organizerName?: string;
  hasTranscriptPermission?: boolean;
  onDiagnostic?: TranscriptDiagnosticReporter;
}

/**
 * 2. Tente de résoudre l'ID Teams (onlineMeetingId) à partir de l'URL JoinWebUrl de la réunion Outlook.
 * Prend en charge :
 * - SCÉNARIO A : Utilisateur organisateur (/me/onlineMeetings)
 * - SCÉNARIO B : Utilisateur participant invité (/me/onlineMeetings puis /users/{organizerEmail}/onlineMeetings si même tenant)
 * - Garde-fou local explicite pour les organisateurs externes, sans fabriquer un refus Graph
 */
export async function resolveOnlineMeetingId(
  client: Client,
  joinWebUrl: string,
  options?: MeetingResolutionOptions
): Promise<{ onlineMeetingId: string | null; error?: TranscriptErrorDetail }> {
  const cleanUrl = joinWebUrl.split('?')[0];
  const routes = [
    { path: '/me/onlineMeetings', endpoint: '/me/onlineMeetings' },
  ];
  let lastError: any;
  let meFoundNoResult = false;

  for (const [index, route] of routes.entries()) {
    try {
      const request = client
        .api(route.path)
        .filter(`JoinWebUrl eq '${joinWebUrl}'`)
        .select('id,subject,joinWebUrl');
      const { data, event } = await executeGraphRequest<{ value?: Array<{ id?: string }> }>(request, {
        stage: 'resolution',
        attempt: index + 1,
        endpoint: route.endpoint,
        userRole: options?.userRole,
        joinWebUrl,
        format: 'json',
        onDiagnostic: options?.onDiagnostic,
      });

      if (!data || !Array.isArray(data.value)) {
        event.outcome = 'invalid_response';
        event.message = 'La réponse Graph HTTP 200 ne contient pas une collection value valide.';
        throw Object.assign(new Error(event.message), {
          statusCode: event.httpStatus || 200,
          code: 'GRAPH_INVALID_RESPONSE',
          requestId: event.requestId,
        });
      }

      event.itemCount = data.value.length;
      event.outcome = data.value.length ? 'success' : 'empty';
      if (data.value.length > 0 && data.value[0].id) {
        return { onlineMeetingId: data.value[0].id };
      }
      meFoundNoResult = true;
    } catch (error: any) {
      lastError = error;
      if (['TOKEN_SCOPE_MISSING', 'INTERACTION_REQUIRED', 'TOKEN_ACQUISITION_FAILED'].includes(error?.code)) {
        return {
          onlineMeetingId: null,
          error: explainTranscriptError(error, { userRole: options?.userRole }),
        };
      }
      const status = error?.statusCode || error?.status;
      if (status === 401 || status === 403 || status === 429 || status >= 500) {
        return {
          onlineMeetingId: null,
          error: explainTranscriptError(error, {
            userRole: options?.userRole,
            organizerName: options?.organizerName,
          }),
        };
      }
      if (status === 404) {
        meFoundNoResult = true;
      }

      if (cleanUrl !== joinWebUrl) {
        try {
          const { data, event } = await executeGraphRequest<{ value?: Array<{ id?: string }> }>(
            client
              .api(route.path)
              .filter(`JoinWebUrl eq '${cleanUrl}'`)
              .select('id,subject,joinWebUrl'),
            {
              stage: 'resolution',
              attempt: index + 2,
              endpoint: route.endpoint,
              userRole: options?.userRole,
              joinWebUrl,
              format: 'json',
              onDiagnostic: options?.onDiagnostic,
            }
          );
          if (!data || !Array.isArray(data.value)) {
            event.outcome = 'invalid_response';
            event.message = 'La réponse Graph HTTP 200 ne contient pas une collection value valide.';
            throw Object.assign(new Error(event.message), {
              statusCode: event.httpStatus || 200,
              code: 'GRAPH_INVALID_RESPONSE',
              requestId: event.requestId,
            });
          }
          event.itemCount = data.value.length;
          event.outcome = data.value.length ? 'success' : 'empty';
          if (data.value.length > 0 && data.value[0].id) {
            return { onlineMeetingId: data.value[0].id };
          }
          meFoundNoResult = true;
          lastError = undefined;
        } catch (retryError: any) {
          lastError = retryError;
          const retryStatus = retryError?.statusCode || retryError?.status;
          if (retryStatus === 401 || retryStatus === 403 || retryStatus === 429 || retryStatus >= 500) {
            return {
              onlineMeetingId: null,
              error: explainTranscriptError(retryError, { userRole: options?.userRole }),
            };
          }
          if (retryStatus === 404) {
            meFoundNoResult = true;
          }
        }
      }
    }
  }

  if (options?.organizerEmail && options.userRole === 'attendee' && meFoundNoResult) {
    const organizerPath = `/users/${options.organizerEmail}/onlineMeetings`;
    try {
      const { data, event } = await executeGraphRequest<{ value?: Array<{ id?: string }> }>(
        client
          .api(organizerPath)
          .filter(`JoinWebUrl eq '${joinWebUrl}'`)
          .select('id,subject,joinWebUrl'),
        {
          stage: 'resolution',
          attempt: 3,
          endpoint: '/users/{organizer}/onlineMeetings',
          userRole: options.userRole,
          joinWebUrl,
          format: 'json',
          onDiagnostic: options.onDiagnostic,
        }
      );
      if (!data || !Array.isArray(data.value)) {
        event.outcome = 'invalid_response';
        event.message = 'La réponse Graph HTTP 200 ne contient pas une collection value valide.';
        throw Object.assign(new Error(event.message), {
          statusCode: event.httpStatus || 200,
          code: 'GRAPH_INVALID_RESPONSE',
          requestId: event.requestId,
        });
      }
      event.itemCount = data.value.length;
      event.outcome = data.value.length ? 'success' : 'empty';
      if (data.value.length > 0 && data.value[0].id) {
        return { onlineMeetingId: data.value[0].id };
      }
    } catch (error: any) {
      lastError = error;
    }
  }

  if (lastError) {
    return {
      onlineMeetingId: null,
      error: explainTranscriptError(lastError, {
        userRole: options?.userRole,
        organizerName: options?.organizerName,
      }),
    };
  }

  return {
    onlineMeetingId: null,
    error: {
      code: 'MEETING_UNRESOLVED',
      title: 'Réunion Teams non résolue via Microsoft Graph',
      message: "Microsoft Graph n'a retourné aucun onlineMeeting correspondant au JoinWebUrl dans les contextes interrogés.",
      actionRequired: "Vérifiez que l'événement et la réunion Teams correspondent, et que le compte connecté a accès à cette réunion.",
    },
  };
}

/**
 * 3. Récupère la liste des métadonnées de transcription pour une réunion Teams.
 * Interroge /me/onlineMeetings/{id}/transcripts ou /users/{organizerEmail}/onlineMeetings/{id}/transcripts selon le rôle.
 */
export async function fetchMeetingTranscripts(
  client: Client,
  onlineMeetingId: string,
  options?: MeetingResolutionOptions
): Promise<{ transcripts: TranscriptMetadata[]; error?: TranscriptErrorDetail }> {
  const request = async (path: string, endpoint: string, attempt: number) => {
    const transcripts: TranscriptMetadata[] = [];
    const visitedLinks = new Set<string>();
    let nextLink: string | undefined = path;
    let page = 0;

    while (nextLink) {
      if (nextLink.startsWith('http')) {
        let parsedLink: URL;
        try {
          parsedLink = new URL(nextLink);
        } catch {
          throw Object.assign(new Error('Microsoft Graph returned an invalid transcript pagination link.'), {
            code: 'GRAPH_INVALID_PAGINATION_LINK',
          });
        }
        const allowedGraphHosts = new Set([
          'graph.microsoft.com',
          'graph.microsoft.us',
          'graph.microsoft.de',
          'microsoftgraph.chinacloudapi.cn',
        ]);
        if (parsedLink.protocol !== 'https:' || !allowedGraphHosts.has(parsedLink.hostname.toLowerCase())) {
          throw Object.assign(new Error('Microsoft Graph returned an untrusted transcript pagination link.'), {
            code: 'GRAPH_INVALID_PAGINATION_LINK',
          });
        }
      }
      if (visitedLinks.has(nextLink)) {
        throw Object.assign(new Error('Microsoft Graph returned a repeated transcript pagination link.'), {
          code: 'GRAPH_INVALID_PAGINATION_LINK',
        });
      }
      visitedLinks.add(nextLink);

      const result: GraphRequestDiagnosticResult<{ value?: any[]; '@odata.nextLink'?: string }> =
        await executeGraphRequest<{ value?: any[]; '@odata.nextLink'?: string }>(
        client.api(nextLink),
        {
          stage: 'transcripts',
          attempt: attempt + page,
          endpoint,
          userRole: options?.userRole,
          format: 'json',
          onDiagnostic: options?.onDiagnostic,
        }
      );
      if (!result.data || !Array.isArray(result.data.value)) {
        result.event.outcome = 'invalid_response';
        result.event.message = 'La réponse Graph HTTP 200 ne contient pas une collection value valide.';
        throw Object.assign(new Error(result.event.message), {
          statusCode: result.event.httpStatus || 200,
          code: 'GRAPH_INVALID_RESPONSE',
          requestId: result.event.requestId,
        });
      }

      result.event.itemCount = result.data.value.length;
      result.event.outcome = result.data.value.length ? 'success' : 'empty';
      const pageTranscripts: TranscriptMetadata[] = result.data.value.map((item: any) => ({
        id: item.id,
        meetingId: item.meetingId || onlineMeetingId,
        createdDateTime: item.createdDateTime || new Date().toISOString(),
        transcriptContentUrl: item.transcriptContentUrl || `${path}/${item.id}/content`,
      }));
      result.event.transcriptId = pageTranscripts[0]?.id;
      transcripts.push(...pageTranscripts);
      nextLink = result.data['@odata.nextLink'];
      page += 1;
    }

    return transcripts;
  };

  try {
    return {
      transcripts: await request(
        `/me/onlineMeetings/${onlineMeetingId}/transcripts`,
        '/me/onlineMeetings/{onlineMeetingId}/transcripts',
        1
      ),
    };
  } catch (error: any) {
    const status = error?.statusCode || error?.status;
    if (
      status === 404 &&
      options?.organizerEmail &&
      options.userRole === 'attendee'
    ) {
      try {
        return {
          transcripts: await request(
            `/users/${options.organizerEmail}/onlineMeetings/${onlineMeetingId}/transcripts`,
            '/users/{organizer}/onlineMeetings/{onlineMeetingId}/transcripts',
            2
          ),
        };
      } catch (fallbackError: any) {
        return {
          transcripts: [],
          error: explainTranscriptError(fallbackError, {
            userRole: options.userRole,
            hasTranscriptPermission: options.hasTranscriptPermission,
            organizerName: options.organizerName,
            organizerEmail: options.organizerEmail,
          }),
        };
      }
    }

    return {
      transcripts: [],
      error: explainTranscriptError(error, {
        userRole: options?.userRole,
        hasTranscriptPermission: options?.hasTranscriptPermission,
        organizerName: options?.organizerName,
        organizerEmail: options?.organizerEmail,
      }),
    };
  }
}

/**
 * 4. Récupère le contenu textuel / VTT d'une transcription Teams
 * Endpoint : GET /me/onlineMeetings/{onlineMeetingId}/transcripts/{transcriptId}/content?$format=text/vtt
 * ou /users/{organizerEmail}/... pour les réunions de tiers autorisées.
 */
export async function fetchTranscriptContent(
  client: Client,
  onlineMeetingId: string,
  transcriptId: string,
  options?: MeetingResolutionOptions
): Promise<{
  content: string;
  format?: TranscriptContent['format'];
  error?: TranscriptErrorDetail;
  diagnostic?: TranscriptDiagnosticEvent;
}> {
  const unattributedFormat = 'application/vnd.microsoft.graph.transcript+text' as const;
  let latestDiagnostic: TranscriptDiagnosticEvent | undefined;
  const request = async (
    path: string,
    endpoint: string,
    attempt: number,
    format: 'text/vtt' | typeof unattributedFormat
  ) => {
    const isVtt = format === 'text/vtt';
    const { data, event } = await executeGraphRequest<string>(
      isVtt
        ? client.api(path).query({ $format: 'text/vtt' })
        : client.api(path).header('Accept', unattributedFormat),
      {
        stage: 'content',
        attempt,
        endpoint,
        userRole: options?.userRole,
        format: 'text',
        requestedFormat: format,
        transcriptId,
        onDiagnostic: (diagnostic) => {
          latestDiagnostic = diagnostic;
          emitDiagnostic(options?.onDiagnostic, diagnostic);
        },
      }
    );
    event.contentType = event.contentType || (isVtt ? 'text/vtt' : 'text/plain');
    event.contentSizeBytes = new TextEncoder().encode(data).length;
    return {
      content: data,
      format: isVtt ? 'text/vtt' as const : 'text/plain' as const,
      diagnostic: event,
    };
  };

  const requestWithAttributionFallback = async (path: string, endpoint: string, attempt: number) => {
    try {
      return await request(path, `${endpoint}?$format=text/vtt`, attempt, 'text/vtt');
    } catch (error: any) {
      if (graphErrorParts(error).graphInnerErrorCode !== 'SpeakerAttributionNotAllowed') {
        throw error;
      }

      emitDiagnostic(options?.onDiagnostic, {
        ...(latestDiagnostic || {
          stage: 'content',
          outcome: 'skipped',
          attempt,
          endpoint: `${endpoint}?$format=text/vtt`,
          transcriptId,
          recordedAt: new Date().toISOString(),
        }),
        outcome: 'skipped',
        fallbackTriggered: true,
        message: 'Repli vers la transcription sans attribution des intervenants.',
        recordedAt: new Date().toISOString(),
      });

      try {
        return await request(path, endpoint, attempt + 1, unattributedFormat);
      } catch (fallbackError) {
        (fallbackError as any).speakerAttributionFallbackAttempted = true;
        throw fallbackError;
      }
    }
  };

  const failureResult = (error: any) => {
    const errorDetail = explainTranscriptError(error, {
      userRole: options?.userRole,
      hasTranscriptPermission: options?.hasTranscriptPermission,
      organizerName: options?.organizerName,
      organizerEmail: options?.organizerEmail,
    });
    errorDetail.graphInnerErrorCode = graphErrorParts(error).graphInnerErrorCode;
    return {
      content: '',
      error: errorDetail,
      diagnostic: latestDiagnostic,
    };
  };

  try {
    const path = `/me/onlineMeetings/${onlineMeetingId}/transcripts/${transcriptId}/content`;
    const endpoint = '/me/onlineMeetings/{onlineMeetingId}/transcripts/{transcriptId}/content';
    return await requestWithAttributionFallback(path, endpoint, 1);
  } catch (error: any) {
    const status = error?.statusCode || error?.status;
    if (
      status === 404 &&
      !error?.speakerAttributionFallbackAttempted &&
      options?.organizerEmail &&
      options.userRole === 'attendee'
    ) {
      try {
        const path = `/users/${options.organizerEmail}/onlineMeetings/${onlineMeetingId}/transcripts/${transcriptId}/content`;
        const endpoint = '/users/{organizer}/onlineMeetings/{onlineMeetingId}/transcripts/{transcriptId}/content';
        return await requestWithAttributionFallback(path, endpoint, 2);
      } catch (fallbackError: any) {
        return failureResult(fallbackError);
      }
    }
    return failureResult(error);
  }
}

/**
 * 5. Fonction principale : Orchestre la vérification complète d'une réunion avec gestion du cache
 * Strictement conforme aux limites :
 * - Ne prétend jamais capturer d'audio
 * - Ne déclare "disponible" qu'en cas de confirmation réelle par Microsoft Graph
 * - Distingue explicitement les erreurs 403 (droit vs tenant), les 404, et les collections vides 200 OK
 */
export async function checkMeetingTranscriptStatus(
  client: Client | null,
  meeting: MeetingItem,
  forceRefresh: boolean = false,
  currentUser?: DgfUserProfile | null,
  hasTranscriptPermission: boolean = true,
  onDiagnostic?: TranscriptDiagnosticReporter,
  metadataOnly: boolean = false
): Promise<TranscriptCheckResult> {
  const temporalStatus = getMeetingTemporalStatus(meeting.start, meeting.end);
  const cacheKey = `${meeting.id}_${currentUser?.userPrincipalName || 'anon'}_${metadataOnly ? 'metadata' : 'content'}`;

  const userRole: UserMeetingRole = meeting.userRole || detectUserMeetingRole(meeting, currentUser || null);
  const isExternal = meeting.isExternalOrganizer ?? isOrganizerExternal(meeting.organizer.email);

  // 1. Vérification du cache si rafraîchissement non forcé
  if (!forceRefresh && memoryCache.has(cacheKey)) {
    const entry = memoryCache.get(cacheKey)!;
    if (Date.now() < entry.expiresAt) {
      return {
        ...entry.result,
        temporalStatus,
        userRole,
        isExternalOrganizer: isExternal,
        cached: true,
      };
    } else {
      memoryCache.delete(cacheKey);
    }
  }

  // 2. Vérification s'il s'agit d'une réunion Teams
  if (!meeting.isOnlineMeeting || !meeting.joinWebUrl) {
    const result: TranscriptCheckResult = {
      meetingId: meeting.id,
      meetingTitle: meeting.title,
      temporalStatus,
      status: 'transcript_unavailable',
      userRole,
      isExternalOrganizer: isExternal,
      accessibility: 'no_transcript',
      checkedAt: new Date().toISOString(),
      error: {
        code: 'NOT_A_TEAMS_MEETING',
        title: 'Séance non éligible à la transcription Teams native',
        message: "Cet événement d'agenda est présentiel ou ne dispose pas d'un lien Teams officiel.",
        actionRequired: "Pour les séances présentielles, utilisez la saisie manuelle ou le futur module d'enregistrement audio de salle.",
      },
    };
    return result;
  }

  // 3. Traitement selon la temporalité de la réunion (sans prétention de capture par ReadMeeting.ai)
  if (temporalStatus === 'scheduled') {
    const result: TranscriptCheckResult = {
      meetingId: meeting.id,
      meetingTitle: meeting.title,
      temporalStatus: 'scheduled',
      status: 'scheduled',
      userRole,
      isExternalOrganizer: isExternal,
      accessibility: 'pending_check',
      checkedAt: new Date().toISOString(),
      error: {
        code: 'MEETING_SCHEDULED',
        title: 'Réunion programmée',
        message: 'Cette séance Teams est planifiée dans le futur. La transcription Teams ne peut être générée que pendant ou après la tenue effective de la réunion.',
        actionRequired: "Attendez la fin de la séance pour interroger la disponibilité de la transcription.",
      },
    };
    return result;
  }

  if (temporalStatus === 'in_progress') {
    const result: TranscriptCheckResult = {
      meetingId: meeting.id,
      meetingTitle: meeting.title,
      temporalStatus: 'in_progress',
      status: 'in_progress',
      userRole,
      isExternalOrganizer: isExternal,
      accessibility: 'pending_check',
      checkedAt: new Date().toISOString(),
      error: {
        code: 'MEETING_IN_PROGRESS',
        title: 'Réunion actuellement en cours',
        message: "La séance Teams est en cours de déroulement. Microsoft Teams génère la transcription en direct si l'organisateur ou un participant autorisé l'a activée dans Teams. ReadMeeting.ai interrogera Microsoft Graph une fois la séance achevée.",
        actionRequired: "Attendez la fin de la réunion pour récupérer le flux de transcription complet.",
      },
    };
    return result;
  }

  // 4. Réunion terminée : vérification auprès de Microsoft Graph
  if (!client) {
    const result: TranscriptCheckResult = {
      meetingId: meeting.id,
      meetingTitle: meeting.title,
      temporalStatus: 'completed',
      status: 'authentication_error',
      userRole,
      isExternalOrganizer: isExternal,
      accessibility: 'pending_check',
      checkedAt: new Date().toISOString(),
      error: {
        code: 'CLIENT_NOT_INITIALIZED',
        title: 'Client Microsoft Graph non connecté',
        message: 'Une session Microsoft Entra ID active est requise pour interroger les services Teams.',
        actionRequired: 'Connectez-vous avec votre compte professionnel Microsoft 365.',
      },
    };
    return result;
  }

  const resolutionOptions: MeetingResolutionOptions = {
    organizerEmail: meeting.organizer.email,
    organizerName: meeting.organizer.name,
    userRole,
    isExternalOrganizer: isExternal,
    hasTranscriptPermission,
    onDiagnostic,
  };

  // 4.a Résolution de l'ID Teams onlineMeeting (Prise en charge Organisateur ET Participant invité)
  const resolveResult = await resolveOnlineMeetingId(client, meeting.joinWebUrl, resolutionOptions);
  if (!resolveResult.onlineMeetingId) {
    const errorCode = resolveResult.error?.code;
    const status: TranscriptStatus =
      errorCode === 'EXTERNAL_TENANT_RESTRICTED'
        ? 'external_tenant_restricted'
        : errorCode === 'PERMISSION_MISSING'
        ? 'permission_missing'
        : errorCode === 'GRAPH_ACCESS_DISABLED'
        ? 'tenant_access_disabled'
        : errorCode === 'ACCESS_DENIED'
        ? 'access_refused'
        : errorCode === 'AUTHENTICATION_REQUIRED' || errorCode === 'TOKEN_ACQUISITION_FAILED' || errorCode === 'INTERACTION_REQUIRED'
        ? 'authentication_error'
        : errorCode === 'MEETING_NOT_FOUND'
        ? 'meeting_not_found'
        : errorCode === 'RATE_LIMIT_EXCEEDED' || (resolveResult.error?.httpStatus || 0) >= 500
        ? 'transient_error'
        : errorCode === 'MEETING_UNRESOLVED' || errorCode === 'EXTERNAL_ORGANIZER_NOT_TESTED'
        ? 'meeting_unresolved'
        : 'transient_error';

    const accessibility: TranscriptAccessibilityStatus =
      status === 'external_tenant_restricted'
        ? 'external_tenant'
        : status === 'permission_missing'
        ? 'permission_missing'
        : status === 'access_refused'
        ? 'access_refused'
        : status === 'authentication_error'
        ? 'authentication_error'
        : status === 'transient_error'
        ? 'transient_error'
        : 'unresolved';

    const result: TranscriptCheckResult = {
      meetingId: meeting.id,
      meetingTitle: meeting.title,
      temporalStatus: 'completed',
      status,
      userRole,
      isExternalOrganizer: isExternal,
      accessibility,
      checkedAt: new Date().toISOString(),
      error: resolveResult.error || {
        code: 'MEETING_UNRESOLVED',
        title: 'Identifiant Teams introuvable',
        message: "Impossible de relier l'événement Outlook à la session Microsoft Teams correspondante.",
        actionRequired: "Vérifiez que le lien Teams est valide et que vous disposez des droits d'accès à la session.",
      },
    };

    memoryCache.set(cacheKey, {
      result,
      expiresAt: Date.now() + CACHE_TTL_ERROR_MS,
    });
    return result;
  }

  const onlineMeetingId = resolveResult.onlineMeetingId;

  // 4.b Interrogation de l'endpoint /transcripts (avec prise en compte du contexte d'invité)
  const transcriptsResult = await fetchMeetingTranscripts(client, onlineMeetingId, resolutionOptions);

  if (transcriptsResult.error) {
    const errCode = transcriptsResult.error.code;
    let status: TranscriptStatus = 'transient_error';
    let accessibility: TranscriptAccessibilityStatus = 'unresolved';

    if (errCode === 'SHARING_RESTRICTED_BY_ORGANIZER') {
      status = 'sharing_restricted_by_organizer';
      accessibility = 'restricted_by_sharing';
    } else if (errCode === 'EXTERNAL_TENANT_RESTRICTED') {
      status = 'external_tenant_restricted';
      accessibility = 'external_tenant';
    } else if (errCode === 'GRAPH_ACCESS_DISABLED') {
      status = 'tenant_access_disabled';
      accessibility = 'unresolved';
    } else if (errCode === 'PERMISSION_MISSING') {
      status = 'permission_missing';
      accessibility = 'permission_missing';
    } else if (errCode === 'MEETING_NOT_FOUND') {
      status = 'meeting_not_found';
      accessibility = 'unresolved';
    } else if (errCode === 'RATE_LIMIT_EXCEEDED') {
      status = 'transient_error';
      accessibility = 'pending_check';
    } else if (errCode === 'AUTHENTICATION_REQUIRED' || errCode === 'TOKEN_ACQUISITION_FAILED' || errCode === 'INTERACTION_REQUIRED') {
      status = 'authentication_error';
      accessibility = 'authentication_error';
    } else if (errCode === 'ACCESS_DENIED') {
      status = 'access_refused';
      accessibility = 'access_refused';
    } else if ((transcriptsResult.error.httpStatus || 0) >= 500) {
      status = 'transient_error';
      accessibility = 'transient_error';
    }

    const result: TranscriptCheckResult = {
      meetingId: meeting.id,
      meetingTitle: meeting.title,
      temporalStatus: 'completed',
      status,
      onlineMeetingId,
      userRole,
      isExternalOrganizer: isExternal,
      accessibility,
      checkedAt: new Date().toISOString(),
      error: transcriptsResult.error,
    };

    const ttl =
      errCode === 'RATE_LIMIT_EXCEEDED'
        ? (transcriptsResult.error.retryAfterSeconds || 10) * 1000
        : CACHE_TTL_ERROR_MS;

    memoryCache.set(cacheKey, {
      result,
      expiresAt: Date.now() + ttl,
    });
    return result;
  }

  // 4.c Collection de transcriptions vide (Réponse HTTP 200 OK avec tableau vide [])
  if (transcriptsResult.transcripts.length === 0) {
    const result: TranscriptCheckResult = {
      meetingId: meeting.id,
      meetingTitle: meeting.title,
      temporalStatus: 'completed',
      status: 'transcript_unavailable',
      onlineMeetingId,
      userRole,
      isExternalOrganizer: isExternal,
      accessibility: 'no_transcript',
      checkedAt: new Date().toISOString(),
      error: {
        code: 'EMPTY_TRANSCRIPTS',
        title: 'Aucune transcription disponible pour cette réunion',
        message: "Microsoft Graph a retourné une collection de transcriptions vide pour cette réunion. Cette réponse confirme qu'aucune transcription n'est actuellement retournée dans le contexte interrogé.",
        actionRequired: "La transcription Teams n'est pas automatique. Pour vos prochaines réunions, activez « Démarrer la transcription » dès le début de séance dans Teams.",
        teamsPolicyNote: "La disponibilité dépend des stratégies Teams (AllowTranscription) attribuées aux organisateurs et participants.",
      },
    };

    memoryCache.set(cacheKey, {
      result,
      expiresAt: Date.now() + CACHE_TTL_ERROR_MS,
    });
    return result;
  }

  // 4.d Transcription existante confirmée par Microsoft Graph
  const primaryMetadata = transcriptsResult.transcripts[0];
  if (metadataOnly) {
    const result: TranscriptCheckResult = {
      meetingId: meeting.id,
      meetingTitle: meeting.title,
      temporalStatus: 'completed',
      status: 'transcript_available',
      onlineMeetingId,
      userRole,
      isExternalOrganizer: isExternal,
      accessibility: 'pending_check',
      metadata: primaryMetadata,
      metadataConfirmed: true,
      checkedAt: new Date().toISOString(),
    };

    memoryCache.set(cacheKey, {
      result,
      expiresAt: Date.now() + CACHE_TTL_SUCCESS_MS,
    });
    return result;
  }

  let parsedContent: TranscriptContent | undefined = undefined;

  // Tentative de récupération du contenu textuel WebVTT
  const contentResult = await fetchTranscriptContent(client, onlineMeetingId, primaryMetadata.id, resolutionOptions);
  let contentError = contentResult.error;
  if (contentResult.content) {
    try {
      const isVtt = contentResult.format === 'text/vtt';
      parsedContent = isVtt
        ? parseVttTranscript(contentResult.content)
        : parseUnattributedTranscript(contentResult.content);
      const validContent = isVtt
        ? /^\s*WEBVTT(?:\s|$)/.test(contentResult.content) && parsedContent.cues.length > 0
        : parsedContent.cues.length > 0;
      if (contentResult.diagnostic) {
        contentResult.diagnostic.vttParsed = isVtt ? validContent : undefined;
        contentResult.diagnostic.contentParsed = validContent;
        if (!validContent) {
          contentResult.diagnostic.outcome = 'invalid_response';
          contentResult.diagnostic.message = isVtt
            ? 'Le contenu reçu ne contient pas de cues WebVTT exploitables.'
            : 'Le contenu reçu ne contient pas de segments horodatés exploitables.';
        }
        emitDiagnostic(resolutionOptions?.onDiagnostic, { ...contentResult.diagnostic });
      }
      if (!validContent) {
        contentError = {
          code: isVtt ? 'INVALID_VTT_CONTENT' : 'INVALID_UNATTRIBUTED_CONTENT',
          title: 'Contenu de transcription indisponible',
          message: isVtt
            ? "Les métadonnées de transcription existent, mais le contenu reçu n'est pas un WebVTT exploitable."
            : "Les métadonnées de transcription existent, mais le contenu reçu ne contient pas de segments horodatés exploitables.",
          httpStatus: contentResult.diagnostic?.httpStatus,
          requestId: contentResult.diagnostic?.requestId,
          graphErrorCode: contentResult.diagnostic?.graphErrorCode,
          actionRequired: 'Réessayez ultérieurement ou vérifiez la réponse de contenu retournée par Microsoft Graph.',
        };
        parsedContent = undefined;
      }
    } catch (error: any) {
      parsedContent = undefined;
      contentError = {
        code: 'VTT_PARSE_ERROR',
        title: 'Échec du parsing WebVTT',
        message: 'Microsoft Graph a retourné un contenu, mais celui-ci ne peut pas être analysé comme WebVTT.',
        httpStatus: contentResult.diagnostic?.httpStatus,
        requestId: contentResult.diagnostic?.requestId,
        actionRequired: 'Réessayez ultérieurement et consultez les métadonnées de diagnostic, sans exporter le contenu.',
      };
      if (contentResult.diagnostic) {
        contentResult.diagnostic.vttParsed = false;
        contentResult.diagnostic.contentParsed = false;
        contentResult.diagnostic.outcome = 'invalid_response';
        emitDiagnostic(resolutionOptions?.onDiagnostic, { ...contentResult.diagnostic });
      }
    }
  }

  // Construction de la piste d'audit institutionnelle DGF
  const auditTrail: TranscriptRetrievalAudit = {
    meetingId: meeting.id,
    meetingTitle: meeting.title,
    onlineMeetingId,
    transcriptId: primaryMetadata.id,
    requestedByUpn: currentUser?.userPrincipalName || currentUser?.mail || 'collaborateur@finances.gouv.ci',
    requestedByName: currentUser?.displayName || 'Collaborateur DGF',
    userRole,
    organizerUpn: meeting.organizer.email,
    organizerName: meeting.organizer.name,
    isExternalOrganizer: isExternal,
    retrievedAt: new Date().toISOString(),
    cuesCount: parsedContent?.cues.length || 0,
    totalWords: parsedContent?.totalWords || 0,
  };

  const result: TranscriptCheckResult = {
    meetingId: meeting.id,
    meetingTitle: meeting.title,
    temporalStatus: 'completed',
    status: parsedContent ? 'transcript_available' : 'content_unavailable',
    onlineMeetingId,
    userRole,
    isExternalOrganizer: isExternal,
    accessibility: parsedContent ? 'accessible' : 'content_unavailable',
    metadata: primaryMetadata,
    metadataConfirmed: true,
    content: parsedContent,
    error: contentError,
    auditTrail,
    checkedAt: new Date().toISOString(),
  };

  memoryCache.set(cacheKey, {
    result,
    expiresAt: Date.now() + CACHE_TTL_SUCCESS_MS,
  });

  return result;
}

/**
 * 6. Garde-fou institutionnel de validation humaine pour le futur traitement documentaire
 * Un compte rendu officiel ne doit JAMAIS être validé automatiquement sans signature humaine.
 */
export function enforceHumanValidationGate(validation: HumanValidationAudit): {
  canPublish: boolean;
  blockReason?: string;
} {
  if (!validation.isApproved) {
    return {
      canPublish: false,
      blockReason: 'Le compte rendu est encore au stade de projet ou de relecture et n a pas été approuvé.',
    };
  }

  if (validation.validationStatus !== 'approved') {
    return {
      canPublish: false,
      blockReason: `Statut non conforme (${validation.validationStatus}). L approbation institutionnelle formelle est requise.`,
    };
  }

  if (!validation.reviewedByUpn || !validation.reviewedByName) {
    return {
      canPublish: false,
      blockReason: "L'identité institutionnelle (UPN et Nom) du rapporteur ou président signataire est obligatoire.",
    };
  }

  return { canPublish: true };
}

/**
 * Purge manuelle du cache des transcriptions
 */
export function purgeTranscriptCache(meetingId?: string): void {
  if (meetingId) {
    memoryCache.delete(meetingId);
  } else {
    memoryCache.clear();
  }
}
