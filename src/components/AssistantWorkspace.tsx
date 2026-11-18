import React, { useEffect, useMemo, useState } from 'react';
import { Database, Settings2, ShieldCheck } from 'lucide-react';
import { useMsal } from '@azure/msal-react';
import { AssistantLayout, RecentConversationItem, WorkspaceSection } from './AssistantLayout';
import { CalendarView } from './CalendarView';
import { ConversationSession, ConversationView } from './ConversationView';
import { DashboardView } from './DashboardView';
import { MeetingsView } from './MeetingsView';
import { AuthDiagnosticPanel } from './AuthDiagnosticPanel';
import { ProductSection, ProductWorkspace } from './ProductWorkspace';
import { AiStatus, meetingApiClient, TranscriptChatResponse, TranscriptChatTurn, TeamsTranscriptAnalysisResult } from '../services/meetingApiClient';
import { MeetingItem } from '../types/meeting';
import { TranscriptCheckResult } from '../types/transcript';
import { DgfUserProfile, MsalRuntimeConfig } from '../types/auth';
import { GraphErrorExplanation } from '../services/graphClient';
import { AdminNotificationConfig } from '../types/adminNotification';
import { AdminConsentWorkflowState } from '../types/adminConsentWorkflow';
import { NativeConsentExecutionResult, ConsentVerificationResult } from '../services/adminConsentService';

interface AssistantWorkspaceProps {
  user: DgfUserProfile | null;
  config: MsalRuntimeConfig;
  meetings: MeetingItem[];
  isLoadingMeetings: boolean;
  calendarPeriod: 'rolling' | 'next_7_days' | 'past_30_days' | 'past_90_days';
  onRefreshMeetings: () => Promise<void>;
  onChangeCalendarPeriod: (period: 'rolling' | 'next_7_days' | 'past_30_days' | 'past_90_days') => Promise<void>;
  onLoadCalendarRange: (start: string, end: string) => Promise<void>;
  onCheckTranscript: (meeting: MeetingItem, forceRefresh?: boolean) => Promise<TranscriptCheckResult>;
  onAskQuestion: (
    meeting: MeetingItem,
    transcript: TranscriptCheckResult,
    question: string,
    history: TranscriptChatTurn[]
  ) => Promise<TranscriptChatResponse>;
  onAnalyzeMeeting: (meeting: MeetingItem, transcript: TranscriptCheckResult) => Promise<TeamsTranscriptAnalysisResult>;
  selectedGraphMeetingId: string | null;
  onSelectGraphMeeting: (meetingId: string | null) => void;
  onLogout: () => void;
  adminConfig: AdminNotificationConfig;
  onUpdateAdminConfig: (config: Partial<AdminNotificationConfig>) => void;
  onRunTechnicalCheck: () => Promise<{ success: boolean; message: string; details?: string }>;
  isCheckingTechnical: boolean;
  workflowState: AdminConsentWorkflowState;
  onRequestConsent: (justification?: string) => Promise<NativeConsentExecutionResult>;
  onVerifyConsent: () => Promise<ConsentVerificationResult>;
  onUpdateWorkflowState: (partial: Partial<AdminConsentWorkflowState>) => void;
  isRequestingConsent: boolean;
  isVerifyingConsent: boolean;
  authDiagnosticProps: {
    lastError: GraphErrorExplanation | null;
    graphRawResponse: unknown;
    apiTestMessage: string | null;
    isLoggingIn: boolean;
    isTestingGraph: boolean;
    isTestingApi: boolean;
    onLoginPopup: () => void;
    onLoginRedirect: () => void;
    onTestGraph: () => Promise<void>;
    onTestApi: () => Promise<void>;
    onRefreshConfig: () => void | Promise<void>;
  };
}

const createConversation = (): ConversationSession => ({
  id: globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(16).slice(2)}`,
  title: 'Nouvelle conversation',
  meetingId: null,
  messages: [],
});

export const AssistantWorkspace: React.FC<AssistantWorkspaceProps> = (props) => {
  const { instance, accounts } = useMsal();
  const activeAccount = instance.getActiveAccount();
  const fallbackAccount = accounts[0] ?? null;
  const account = useMemo(
    () => activeAccount ?? fallbackAccount,
    [
      activeAccount?.homeAccountId,
      activeAccount?.localAccountId,
      activeAccount?.tenantId,
      fallbackAccount?.homeAccountId,
      fallbackAccount?.localAccountId,
      fallbackAccount?.tenantId,
    ]
  );
  const [section, setSection] = useState<WorkspaceSection>('chat');
  const [conversations, setConversations] = useState<ConversationSession[]>(() => [createConversation()]);
  const [activeConversationId, setActiveConversationId] = useState(() => conversations[0]?.id ?? '');
  const [aiStatus, setAiStatus] = useState<AiStatus | null>(null);
  const [apiStatusError, setApiStatusError] = useState<string | null>(null);
  const [selectedApiMeetingId, setSelectedApiMeetingId] = useState<string | null>(null);

  useEffect(() => {
    if (!account) return;
    let active = true;
    meetingApiClient.aiStatus(instance, account)
      .then((status) => {
        if (active) {
          setAiStatus(status);
          setApiStatusError(null);
        }
      })
      .catch((statusError) => {
        if (active) {
          setApiStatusError(statusError instanceof Error ? statusError.message : "L'état de l'API ReadMeeting est indisponible.");
        }
      });
    return () => { active = false; };
  }, [account, instance]);

  const activeSession = conversations.find((item) => item.id === activeConversationId) ?? conversations[0];
  const recentConversations: RecentConversationItem[] = useMemo(() =>
    [...conversations].reverse().map((conversation) => ({
      id: conversation.id,
      title: conversation.title,
      meetingTitle: props.meetings.find((meeting) => meeting.id === conversation.meetingId)?.title ?? null,
    })),
  [conversations, props.meetings]);

  const newConversation = () => {
    const conversation = createConversation();
    setConversations((items) => [...items, conversation]);
    setActiveConversationId(conversation.id);
    props.onSelectGraphMeeting(null);
  };

  const selectConversation = (id: string) => {
    const conversation = conversations.find((item) => item.id === id);
    setActiveConversationId(id);
    props.onSelectGraphMeeting(conversation?.meetingId ?? null);
  };

  const setConversationMeeting = (meetingId: string) => {
    props.onSelectGraphMeeting(meetingId || null);
    setConversations((items) => items.map((item) => item.id === activeConversationId
      ? { ...item, meetingId: meetingId || null }
      : item));
  };

  const openConversationForMeeting = (meeting: MeetingItem) => {
    props.onSelectGraphMeeting(meeting.id);
    setConversations((items) => items.map((item) => item.id === activeConversationId
      ? { ...item, meetingId: meeting.id }
      : item));
    setSection('chat');
  };

  const selectGraphMeeting = (meetingId: string) => {
    props.onSelectGraphMeeting(meetingId);
  };

  const navigateProduct = (target: ProductSection) => setSection(target);

  const renderConnectedContent = () => {
    if (section === 'chat') {
      return null;
    }
    if (section === 'graph_meetings') {
      return (
        <MeetingsView
          meetings={props.meetings}
          selectedMeetingId={props.selectedGraphMeetingId}
          isLoading={props.isLoadingMeetings}
          onRefresh={props.onRefreshMeetings}
          onCheckTranscript={props.onCheckTranscript}
          onSelectMeeting={selectGraphMeeting}
          onOpenConversation={openConversationForMeeting}
        />
      );
    }
    if (section === 'calendar') {
      return (
        <CalendarView
          meetings={props.meetings}
          isLoading={props.isLoadingMeetings}
          onLoadRange={props.onLoadCalendarRange}
          onOpenMeeting={(meeting) => {
            props.onSelectGraphMeeting(meeting.id);
            setSection('graph_meetings');
          }}
        />
      );
    }
    if (section === 'microsoft') {
      return (
        <DashboardView
          user={props.user}
          meetings={props.meetings}
          isLoadingMeetings={props.isLoadingMeetings}
          onRefreshMeetings={props.onRefreshMeetings}
          calendarPeriod={props.calendarPeriod}
          onChangeCalendarPeriod={props.onChangeCalendarPeriod}
          onNavigateToAuth={() => setSection('auth_diagnostic')}
          onSelectMeetingForReport={() => setSection('reports')}
          onCheckTranscript={props.onCheckTranscript}
          adminConfig={props.adminConfig}
          onUpdateAdminConfig={props.onUpdateAdminConfig}
          onRunTechnicalCheck={props.onRunTechnicalCheck}
          isCheckingTechnical={props.isCheckingTechnical}
          workflowState={props.workflowState}
          onRequestConsent={props.onRequestConsent}
          onVerifyConsent={props.onVerifyConsent}
          onUpdateWorkflowState={props.onUpdateWorkflowState}
          isRequestingConsent={props.isRequestingConsent}
          isVerifyingConsent={props.isVerifyingConsent}
        />
      );
    }
    if (section === 'auth_diagnostic') {
      return (
        <div className="mx-auto max-w-7xl p-4 sm:p-7">
          <AuthDiagnosticPanel
            config={props.config}
            user={props.user}
            onRefreshConfig={props.authDiagnosticProps.onRefreshConfig}
            onLoginClick={props.authDiagnosticProps.onLoginPopup}
            onLoginRedirectClick={props.authDiagnosticProps.onLoginRedirect}
            onTestGraphCall={props.authDiagnosticProps.onTestGraph}
            onTestApiCall={props.authDiagnosticProps.onTestApi}
            isLoggingIn={props.authDiagnosticProps.isLoggingIn}
            isTestingGraph={props.authDiagnosticProps.isTestingGraph}
            isTestingApi={props.authDiagnosticProps.isTestingApi}
            apiTestMessage={props.authDiagnosticProps.apiTestMessage}
            lastError={props.authDiagnosticProps.lastError}
            graphRawResponse={props.authDiagnosticProps.graphRawResponse}
          />
        </div>
      );
    }
    if (section === 'architecture') {
      return <div className="p-6 text-sm text-slate-400">La vue d’architecture est accessible depuis le diagnostic technique.</div>;
    }

    if (
      section === 'dashboard'
      || section === 'meetings'
      || section === 'transcripts'
      || section === 'reports'
      || section === 'decisions'
      || section === 'actions'
      || section === 'settings'
    ) {
      if (!aiStatus?.persistenceAvailable) {
        return (
          <section className="mx-auto mt-10 max-w-2xl rounded-xl border border-slate-800 bg-[#151b23] p-6">
            <Database className="text-amber-300" size={20} />
            <h1 className="mt-3 text-lg font-semibold text-white">
              {section === 'settings'
                ? 'État des services'
                : aiStatus?.persistenceConfigured
                  ? 'PostgreSQL indisponible'
                  : 'Persistance PostgreSQL requise'}
            </h1>
            <p className="mt-2 text-sm leading-6 text-slate-400">
              {apiStatusError || (aiStatus
                ? aiStatus.persistenceConfigured
                  ? 'PostgreSQL est configuré mais la vérification de disponibilité a échoué. Consultez /health/ready et réessayez; aucune donnée fictive ne sera affichée.'
                  : 'Cette rubrique consulte les données persistées par l’API. PostgreSQL n’est pas configuré; aucune donnée fictive ne sera affichée.'
                : 'Vérification de la configuration API en cours…')}
            </p>
            {section === 'settings' && (
              <div className="mt-5 space-y-3 text-xs text-slate-400">
                <p>Microsoft Graph : compte {props.user?.userPrincipalName || 'connecté'}.</p>
                <p>Google Gemini : {aiStatus?.configured ? `configuré côté backend${aiStatus.model ? ` (${aiStatus.model})` : ''}` : apiStatusError ? 'état non vérifiable' : 'non configuré ou non vérifié'}.</p>
                <p>PostgreSQL : {aiStatus?.persistenceAvailable ? 'connecté et disponible' : aiStatus?.persistenceConfigured ? 'configuré mais indisponible' : 'non configuré'}.</p>
                <button type="button" onClick={() => setSection('auth_diagnostic')} className="inline-flex items-center gap-2 rounded-lg border border-slate-700 px-3 py-2 text-slate-200 hover:bg-slate-800">
                  <ShieldCheck size={14} /> Diagnostics d’accès API
                </button>
              </div>
            )}
          </section>
        );
      }

      return (
        <ProductWorkspace
          section={section}
          selectedMeetingId={selectedApiMeetingId}
          onSelectMeeting={setSelectedApiMeetingId}
          onNavigate={navigateProduct}
        />
      );
    }
    return null;
  };

  return (
    <AssistantLayout
      section={section}
      user={props.user}
      conversations={recentConversations}
      activeConversationId={activeConversationId}
      onNavigate={setSection}
      onNewConversation={newConversation}
      onSelectConversation={selectConversation}
      onLogout={props.onLogout}
    >
      <div className={section === 'chat' ? 'h-full' : 'hidden'}>
        {activeSession && (
          <ConversationView
            meetings={props.meetings}
            activeConversationId={activeSession.id}
            conversations={conversations}
            setConversations={setConversations}
            initialMeetingId={props.selectedGraphMeetingId}
            onSelectMeeting={setConversationMeeting}
            onCheckTranscript={props.onCheckTranscript}
            onAskQuestion={props.onAskQuestion}
            onAnalyzeMeeting={props.onAnalyzeMeeting}
          />
        )}
      </div>
      {section !== 'chat' && renderConnectedContent()}
      {section === 'settings' && aiStatus?.persistenceAvailable && (
        <div className="mx-auto mt-5 max-w-7xl px-4 sm:px-7">
          <div className="rounded-xl border border-slate-800 bg-[#151b23] p-5 text-xs text-slate-400">
            <p className="flex items-center gap-2 text-sm font-medium text-slate-200"><Settings2 size={16} /> Services côté serveur</p>
            <p className="mt-3">Google Gemini : {aiStatus.configured ? `configuré${aiStatus.model ? ` — modèle ${aiStatus.model}` : ''}` : 'non configuré'}. PostgreSQL : {aiStatus.persistenceAvailable ? 'connecté et disponible' : aiStatus.persistenceConfigured ? 'configuré mais indisponible' : 'non configuré'}.</p>
          </div>
        </div>
      )}
    </AssistantLayout>
  );
};
