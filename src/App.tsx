import React, { useState, useEffect, useCallback } from 'react';
import { useMsal } from '@azure/msal-react';
import { IPublicClientApplication } from '@azure/msal-browser';
import { AuthDiagnosticPanel } from './components/AuthDiagnosticPanel';
import { AssistantWorkspace } from './components/AssistantWorkspace';
import { SignInView } from './components/SignInView';
import {
  getMsalRuntimeConfig,
  loginRequest,
  resetMsalInstance
} from './config/msalConfig';
import { fetchReadMeetingApi } from './services/apiClient';
import {
  explainEntraIdError,
  fetchGraphUserProfile,
  fetchRealCalendarMeetings,
  createGraphClient,
  createTranscriptGraphClient,
  GraphErrorExplanation
} from './services/graphClient';
import { DgfUserProfile, MsalRuntimeConfig } from './types/auth';
import { MeetingItem } from './types/meeting';
import { checkMeetingTranscriptStatus, explainTranscriptError } from './services/transcriptService';
import { TranscriptCheckResult } from './types/transcript';
import { meetingApiClient, TranscriptChatTurn } from './services/meetingApiClient';
import { AdminNotificationConfig } from './types/adminNotification';
import { AdminConsentWorkflowState } from './types/adminConsentWorkflow';
import {
  getStoredAdminConsentState,
  updateAdminConsentState,
  triggerNativeAdminConsentRequest,
  verifyEntraConsentStatus,
  NativeConsentExecutionResult,
  ConsentVerificationResult,
} from './services/adminConsentService';

const ADMIN_NOTIF_STORAGE_KEY = 'dgf_admin_perm_notification_v1';
const DEFAULT_MEETINGS_PAST_DAYS = 180;
const DEFAULT_MEETINGS_FUTURE_DAYS = 365;

const getConfiguredMeetingWindowDays = (
  value: string | undefined,
  defaultValue: number,
  variableName: string
): number => {
  if (!value?.trim()) return defaultValue;

  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < 1 || parsed > 730) {
    console.warn(`${variableName} doit être un nombre entier entre 1 et 730. Valeur par défaut utilisée : ${defaultValue}.`);
    return defaultValue;
  }
  return parsed;
};

const MEETINGS_PAST_DAYS = getConfiguredMeetingWindowDays(
  import.meta.env.VITE_MEETINGS_PAST_DAYS,
  DEFAULT_MEETINGS_PAST_DAYS,
  'VITE_MEETINGS_PAST_DAYS'
);
const MEETINGS_FUTURE_DAYS = getConfiguredMeetingWindowDays(
  import.meta.env.VITE_MEETINGS_FUTURE_DAYS,
  DEFAULT_MEETINGS_FUTURE_DAYS,
  'VITE_MEETINGS_FUTURE_DAYS'
);

const getRollingMeetingRange = () => {
  const now = new Date();
  const start = new Date(now);
  start.setDate(start.getDate() - MEETINGS_PAST_DAYS);
  start.setHours(0, 0, 0, 0);
  const end = new Date(now);
  end.setDate(end.getDate() + MEETINGS_FUTURE_DAYS);
  end.setHours(23, 59, 59, 999);
  return { start: start.toISOString(), end: end.toISOString() };
};

const mergeMeetings = (existing: MeetingItem[], incoming: MeetingItem[]): MeetingItem[] => {
  const meetingsById = new Map<string, MeetingItem>();
  for (const meeting of [...existing, ...incoming]) {
    meetingsById.set(meeting.graphId || meeting.id, meeting);
  }
  return Array.from(meetingsById.values())
    .sort((a, b) => new Date(a.start).getTime() - new Date(b.start).getTime());
};

const getInitialAdminConfig = (): AdminNotificationConfig => {
  try {
    const raw = localStorage.getItem(ADMIN_NOTIF_STORAGE_KEY);
    if (raw) {
      return JSON.parse(raw);
    }
  } catch (e) {
    console.warn('[Storage Error]', e);
  }
  return {
    status: 'pending',
    lastUpdated: new Date().toISOString(),
    isBannerCollapsed: false,
  };
};

interface AppProps {
  onInstanceReplaced?: (newInstance: IPublicClientApplication) => void;
}

export default function App({ onInstanceReplaced }: AppProps) {
  // Récupération de l'instance MSAL déjà initialisée et des comptes réactifs depuis MsalProvider
  const { instance, accounts } = useMsal();

  const [msalConfig, setMsalConfig] = useState<MsalRuntimeConfig>(getMsalRuntimeConfig());
  const [user, setUser] = useState<DgfUserProfile | null>(null);
  const [showAuthDiagnostics, setShowAuthDiagnostics] = useState(false);
  const [selectedGraphMeetingId, setSelectedGraphMeetingId] = useState<string | null>(null);
  const [isLoggingIn, setIsLoggingIn] = useState<boolean>(false);
  const [isTestingGraph, setIsTestingGraph] = useState<boolean>(false);
  const [isTestingApi, setIsTestingApi] = useState<boolean>(false);
  const [apiTestMessage, setApiTestMessage] = useState<string | null>(null);
  const [lastError, setLastError] = useState<GraphErrorExplanation | null>(null);
  const [graphRawResponse, setGraphRawResponse] = useState<any>(null);

  const [meetings, setMeetings] = useState<MeetingItem[]>([]);
  const [isLoadingMeetings, setIsLoadingMeetings] = useState<boolean>(false);
  const [calendarPeriod, setCalendarPeriod] = useState<'rolling' | 'next_7_days' | 'past_30_days' | 'past_90_days'>('rolling');

  const handleLoadRealMeetings = useCallback(async (period: 'rolling' | 'next_7_days' | 'past_30_days' | 'past_90_days' = calendarPeriod) => {
    setIsLoadingMeetings(true);
    setLastError(null);
    setCalendarPeriod(period);

    try {
      const account = instance.getActiveAccount() || (accounts.length > 0 ? accounts[0] : null);
      if (!account) return;

      const now = new Date();
      let startIso: string;
      let endIso: string;

      if (period === 'rolling') {
        ({ start: startIso, end: endIso } = getRollingMeetingRange());
      } else if (period === 'past_30_days') {
        startIso = new Date(now.getTime() - 30 * 24 * 3600 * 1000).toISOString();
        endIso = now.toISOString();
      } else if (period === 'past_90_days') {
        startIso = new Date(now.getTime() - 90 * 24 * 3600 * 1000).toISOString();
        endIso = now.toISOString();
      } else {
        // next_7_days
        startIso = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0).toISOString();
        endIso = new Date(now.getTime() + 7 * 24 * 3600 * 1000).toISOString();
      }

      const realMeetings = await fetchRealCalendarMeetings(instance, account, startIso, endIso, user);
      setMeetings((current) => mergeMeetings(current, realMeetings));
    } catch (error: any) {
      console.error('[Fetch Meetings Error]', error);
      setLastError(explainEntraIdError(error));
    } finally {
      setIsLoadingMeetings(false);
    }
  }, [accounts, instance, calendarPeriod, user]);

  const handleLoadCalendarRange = useCallback(async (start: string, end: string) => {
    const account = instance.getActiveAccount() || accounts[0] || null;
    if (!account) return;
    setIsLoadingMeetings(true);
    try {
      const realMeetings = await fetchRealCalendarMeetings(instance, account, start, end, user);
      setMeetings((current) => mergeMeetings(current, realMeetings));
    } catch (error) {
      console.error('[Calendar Graph Error]', error);
      setLastError(explainEntraIdError(error));
    } finally {
      setIsLoadingMeetings(false);
    }
  }, [accounts, instance, user]);

  // Synchronisation réactive avec les comptes MSAL initialisés
  useEffect(() => {
    if (accounts && accounts.length > 0) {
      const activeAccount = instance.getActiveAccount() || accounts[0];
      instance.setActiveAccount(activeAccount);
      fetchGraphUserProfile(instance, activeAccount)
        .then((profile) => {
          setUser(profile);
          const { start, end } = getRollingMeetingRange();
          fetchRealCalendarMeetings(instance, activeAccount, start, end, profile)
            .then((m) => setMeetings((current) => mergeMeetings(current, m)))
            .catch((err) => console.warn('[Auto-fetch meetings error]', err));
        })
        .catch((err) => {
          console.warn('[MSAL Auto-restore warning]', err);
        });
    } else {
      setUser(null);
      setMeetings([]);
      setSelectedGraphMeetingId(null);
    }
  }, [accounts, instance]);

  const handleRefreshConfig = useCallback(async () => {
    try {
      const updatedPca = await resetMsalInstance();
      if (onInstanceReplaced) {
        onInstanceReplaced(updatedPca);
      }
      const updatedConfig = getMsalRuntimeConfig();
      setMsalConfig(updatedConfig);
      setLastError(null);
    } catch (err: any) {
      console.error('[MSAL Reset Error]', err);
      setLastError(explainEntraIdError(err));
    }
  }, [onInstanceReplaced]);

  const handleLogin = async (useRedirect: boolean = false) => {
    setIsLoggingIn(true);
    setLastError(null);
    setGraphRawResponse(null);

    try {
      if (useRedirect) {
        await instance.loginRedirect({
          ...loginRequest,
          prompt: 'select_account',
        });
        return;
      }

      const loginResponse = await instance.loginPopup({
        ...loginRequest,
        prompt: 'select_account',
      });

      if (loginResponse.account) {
        instance.setActiveAccount(loginResponse.account);
        const profile = await fetchGraphUserProfile(instance, loginResponse.account);
        setUser(profile);
        setShowAuthDiagnostics(false);

        const { start, end } = getRollingMeetingRange();
        fetchRealCalendarMeetings(instance, loginResponse.account, start, end, profile)
          .then((m) => setMeetings((current) => mergeMeetings(current, m)))
          .catch((err) => console.warn('[Auto-fetch meetings error]', err));
      }
    } catch (error: any) {
      console.error('[Entra ID Login Exception]', error);
      const explanation = explainEntraIdError(error);
      setLastError(explanation);
      setShowAuthDiagnostics(true);
    } finally {
      setIsLoggingIn(false);
    }
  };

  const handleLogout = async () => {
    try {
      const active = instance.getActiveAccount() || (accounts.length > 0 ? accounts[0] : null);
      if (active) {
        await instance.logoutPopup({ account: active });
      }
    } catch (e) {
      console.warn('[MSAL Logout warning]', e);
    } finally {
      setUser(null);
      setMeetings([]);
      setSelectedGraphMeetingId(null);
      setGraphRawResponse(null);
    }
  };

  const handleTestGraphCall = async () => {
    if (!user) return;
    setIsTestingGraph(true);
    setLastError(null);

    try {
      const account = instance.getActiveAccount() || (accounts.length > 0 ? accounts[0] : null);
      if (!account) throw new Error('Aucun compte actif trouvé dans la session Entra ID.');

      const client = createGraphClient(instance, account);
      const res = await client.api('/me').get();
      setGraphRawResponse(res);
    } catch (error: any) {
      console.error('[Graph Test Error]', error);
      setLastError(explainEntraIdError(error));
    } finally {
      setIsTestingGraph(false);
    }
  };

  const handleTestApiCall = async () => {
    setIsTestingApi(true);
    setApiTestMessage(null);

    try {
      const account = instance.getActiveAccount() || (accounts.length > 0 ? accounts[0] : null);
      if (!account) throw new Error('Une session Microsoft Entra ID active est requise.');

      const response = await fetchReadMeetingApi(
        instance,
        account,
        '/api/v1/security/context'
      );
      if (response.status === 401) {
        throw new Error("L'API a refusé le jeton (401). Vérifiez son issuer et son audience.");
      }
      if (response.status === 403) {
        throw new Error("L'API a refusé l'accès (403). Vérifiez le scope API et le client autorisé.");
      }
      if (!response.ok) {
        throw new Error(`L'API ReadMeeting a répondu HTTP ${response.status}.`);
      }

      const context: unknown = await response.json();
      if (
        typeof context !== 'object'
        || context === null
        || typeof (context as { tenantId?: unknown }).tenantId !== 'string'
        || typeof (context as { userObjectId?: unknown }).userObjectId !== 'string'
      ) {
        throw new Error("La réponse de contexte de l'API est invalide.");
      }
      setApiTestMessage("Jeton d'accès ReadMeeting API accepté ; contexte issu des claims authentifiés.");
    } catch (error) {
      setApiTestMessage(
        error instanceof Error ? error.message : "Échec de l'appel à l'API ReadMeeting."
      );
    } finally {
      setIsTestingApi(false);
    }
  };

  const [adminConfig, setAdminConfig] = useState<AdminNotificationConfig>(getInitialAdminConfig);
  const [isCheckingTechnical, setIsCheckingTechnical] = useState<boolean>(false);

  const [workflowState, setWorkflowState] = useState<AdminConsentWorkflowState>(getStoredAdminConsentState);
  const [isRequestingConsent, setIsRequestingConsent] = useState<boolean>(false);
  const [isVerifyingConsent, setIsVerifyingConsent] = useState<boolean>(false);

  const handleUpdateAdminConfig = useCallback((partial: Partial<AdminNotificationConfig>) => {
    setAdminConfig((prev) => {
      const next = { ...prev, ...partial };
      try {
        localStorage.setItem(ADMIN_NOTIF_STORAGE_KEY, JSON.stringify(next));
      } catch (e) {
        console.warn('[LocalStorage Error]', e);
      }
      return next;
    });
  }, []);

  const handleTriggerAdminConsent = useCallback(
    async (justification?: string): Promise<NativeConsentExecutionResult> => {
      setIsRequestingConsent(true);
      try {
        const account = instance.getActiveAccount() || (accounts.length > 0 ? accounts[0] : null);
        const res = await triggerNativeAdminConsentRequest(instance, account, justification);
        setWorkflowState(getStoredAdminConsentState());
        if (res.status === 'consent_granted') {
          handleUpdateAdminConfig({
            status: 'entra_configured',
            notes: 'Consentement administrateur accordé avec succès via le flux Microsoft.',
          });
        }
        return res;
      } finally {
        setIsRequestingConsent(false);
      }
    },
    [accounts, instance, handleUpdateAdminConfig]
  );

  const handleVerifyAdminConsent = useCallback(async (): Promise<ConsentVerificationResult> => {
    setIsVerifyingConsent(true);
    try {
      const account = instance.getActiveAccount() || (accounts.length > 0 ? accounts[0] : null);
      const res = await verifyEntraConsentStatus(instance, account);
      setWorkflowState(getStoredAdminConsentState());
      if (res.status === 'consent_granted') {
        handleUpdateAdminConfig({
          status: 'entra_configured',
          notes: 'Consentement administrateur vérifié par jeton silencieux.',
        });
      }
      return res;
    } finally {
      setIsVerifyingConsent(false);
    }
  }, [accounts, instance, handleUpdateAdminConfig]);

  const handleUpdateWorkflowState = useCallback((partial: Partial<AdminConsentWorkflowState>) => {
    const updated = updateAdminConsentState(partial);
    setWorkflowState(updated);
  }, []);

  const handleRunAdminTechnicalCheck = useCallback(async (): Promise<{ success: boolean; message: string; details?: string }> => {
    setIsCheckingTechnical(true);
    try {
      const account = instance.getActiveAccount() || (accounts.length > 0 ? accounts[0] : null);
      if (!account) {
        return {
          success: false,
          message: 'Compte Microsoft non connecté',
          details: 'Connectez-vous avec votre compte professionnel DGF pour tester les autorisations Graph.',
        };
      }

      const client = createGraphClient(instance, account);
      try {
        const testRes = await client.api('/me/onlineMeetings').top(1).get();
        return {
          success: true,
          message: 'Accès Microsoft Graph confirmé',
          details: `L'API onlineMeetings a répondu favorablement (${testRes?.value?.length ?? 0} réunion détectée). L'autorisation globale reste soumise au consentement délégué de transcription.`,
        };
      } catch (err: any) {
        const explanation = explainTranscriptError(err);
        if (explanation.code === 'PERMISSION_MISSING') {
          return {
            success: false,
            message: 'Autorisation Entra ID non accordée (403 Forbidden)',
            details: "Le consentement administrateur pour 'OnlineMeetingTranscript.Read.All' n'est pas encore actif.",
          };
        }
        if (explanation.code === 'GRAPH_ACCESS_DISABLED') {
          return {
            success: false,
            message: 'Accès API désactivé dans Teams Admin (403 Forbidden)',
            details: "Le paramètre EnableGraphTranscriptAccess doit être activé par l'administrateur Teams.",
          };
        }
        return {
          success: false,
          message: explanation.title || 'Vérification en échec',
          details: explanation.message,
        };
      }
    } finally {
      setIsCheckingTechnical(false);
    }
  }, [accounts, instance]);

  const handleCheckTranscript = async (
    meeting: MeetingItem,
    forceRefresh: boolean = false
  ): Promise<TranscriptCheckResult> => {
    const diagnostics: TranscriptCheckResult['diagnostics'] = [];
    const onDiagnostic = (event: NonNullable<TranscriptCheckResult['diagnostics']>[number]) => {
      diagnostics.push(event);
    };
    const account = instance.getActiveAccount() || (accounts.length > 0 ? accounts[0] : null);
    if (!account) {
      const result = await checkMeetingTranscriptStatus(null, meeting, forceRefresh, user, false, onDiagnostic);
      return { ...result, diagnostics };
    }
    const client = createTranscriptGraphClient(instance, account, onDiagnostic);
    const result = await checkMeetingTranscriptStatus(client, meeting, forceRefresh, user, true, onDiagnostic);
    return { ...result, diagnostics };
  };

  const handleAnalyzeTranscript = async (
    meeting: MeetingItem,
    transcriptResult: TranscriptCheckResult
  ) => {
    const account = instance.getActiveAccount() || (accounts.length > 0 ? accounts[0] : null);
    if (!account) {
      throw new Error('Une session Microsoft 365 est requise pour transmettre la transcription à l’API ReadMeeting.');
    }
    if (!meeting.graphId || !transcriptResult.content || !transcriptResult.metadata?.id) {
      throw new Error('La réunion ou la transcription Teams ne comporte pas les identifiants nécessaires à son enregistrement.');
    }

    const request = {
      graphMeetingId: meeting.graphId,
      title: meeting.title,
      description: meeting.bodyPreview,
      startTime: meeting.start,
      endTime: meeting.end,
      organizerEmail: meeting.organizer.email || null,
      organizerName: meeting.organizer.name || null,
      departmentCode: meeting.departmentCode,
      joinWebUrl: meeting.joinWebUrl,
      graphTranscriptId: transcriptResult.metadata.id,
      content: transcriptResult.content.rawContent,
      contentFormat: transcriptResult.content.format === 'text/vtt'
        ? ('TextVtt' as const)
        : ('TextPlainUnattributed' as const),
      language: transcriptResult.metadata.language,
    };

    const aiStatus = await meetingApiClient.aiStatus(instance, account);
    if (!aiStatus.configured) {
      throw new Error('Gemini n’est pas configuré dans l’environnement serveur.');
    }

    if (!aiStatus.persistenceConfigured) {
      return meetingApiClient.previewTeamsTranscriptAnalysis(instance, account, request);
    }

    const result = await meetingApiClient.analyzeTeamsTranscript(instance, account, request);
    return result;
  };

  const handleAskQuestion = async (
    meeting: MeetingItem,
    transcript: TranscriptCheckResult,
    question: string,
    history: TranscriptChatTurn[]
  ) => {
    const account = instance.getActiveAccount() || accounts[0] || null;
    if (!account) throw new Error('Une session Microsoft 365 est requise.');
    if (!meeting.graphId || !transcript.metadata?.id || !transcript.content?.rawContent) {
      throw new Error('Les identifiants de réunion et une transcription Teams réelle sont requis.');
    }
    return meetingApiClient.askTranscriptQuestion(instance, account, {
      graphMeetingId: meeting.graphId,
      graphTranscriptId: transcript.metadata.id,
      content: transcript.content.rawContent,
      question,
      history,
    });
  };

  const account = instance.getActiveAccount() || accounts[0] || null;
  if (!account) {
    if (showAuthDiagnostics) {
      return (
        <div className="min-h-screen bg-[#0d1117] p-4 sm:p-7">
          <button type="button" onClick={() => setShowAuthDiagnostics(false)} className="mb-4 rounded-lg border border-slate-700 px-3 py-2 text-xs text-slate-300 hover:bg-slate-800">
            Retour à la connexion
          </button>
          <AuthDiagnosticPanel
            config={msalConfig}
            user={null}
            onRefreshConfig={handleRefreshConfig}
            onLoginClick={() => handleLogin(false)}
            onLoginRedirectClick={() => handleLogin(true)}
            onTestGraphCall={handleTestGraphCall}
            onTestApiCall={handleTestApiCall}
            isLoggingIn={isLoggingIn}
            isTestingGraph={isTestingGraph}
            isTestingApi={isTestingApi}
            apiTestMessage={apiTestMessage}
            lastError={lastError}
            graphRawResponse={graphRawResponse}
          />
        </div>
      );
    }
    return (
      <SignInView
        config={msalConfig}
        isLoggingIn={isLoggingIn}
        lastError={lastError}
        onLoginPopup={() => void handleLogin(false)}
        onLoginRedirect={() => void handleLogin(true)}
        onOpenDiagnostics={() => setShowAuthDiagnostics(true)}
      />
    );
  }

  return (
    <AssistantWorkspace
      user={user}
      config={msalConfig}
      meetings={meetings}
      isLoadingMeetings={isLoadingMeetings}
      calendarPeriod={calendarPeriod}
      onRefreshMeetings={() => handleLoadRealMeetings(calendarPeriod)}
      onChangeCalendarPeriod={handleLoadRealMeetings}
      onLoadCalendarRange={handleLoadCalendarRange}
      onCheckTranscript={handleCheckTranscript}
      onAskQuestion={handleAskQuestion}
      onAnalyzeMeeting={handleAnalyzeTranscript}
      selectedGraphMeetingId={selectedGraphMeetingId}
      onSelectGraphMeeting={setSelectedGraphMeetingId}
      onLogout={handleLogout}
      adminConfig={adminConfig}
      onUpdateAdminConfig={handleUpdateAdminConfig}
      onRunTechnicalCheck={handleRunAdminTechnicalCheck}
      isCheckingTechnical={isCheckingTechnical}
      workflowState={workflowState}
      onRequestConsent={handleTriggerAdminConsent}
      onVerifyConsent={handleVerifyAdminConsent}
      onUpdateWorkflowState={handleUpdateWorkflowState}
      isRequestingConsent={isRequestingConsent}
      isVerifyingConsent={isVerifyingConsent}
      authDiagnosticProps={{
        lastError,
        graphRawResponse,
        apiTestMessage,
        isLoggingIn,
        isTestingGraph,
        isTestingApi,
        onLoginPopup: () => void handleLogin(false),
        onLoginRedirect: () => void handleLogin(true),
        onTestGraph: handleTestGraphCall,
        onTestApi: handleTestApiCall,
        onRefreshConfig: handleRefreshConfig,
      }}
    />
  );
}
