import { AccountInfo, IPublicClientApplication } from '@azure/msal-browser';
import { fetchReadMeetingApi } from './apiClient';

export type MeetingStatus =
  | 'Scheduled'
  | 'InProgress'
  | 'Completed'
  | 'Transcribing'
  | 'Transcribed'
  | 'ReportGenerated'
  | 'Archived'
  | 'Failed';

export interface MeetingSummary {
  id: string;
  title: string;
  startTime: string | null;
  endTime: string | null;
  organizerName: string | null;
  status: MeetingStatus;
}

export interface MeetingDetails extends MeetingSummary {
  description: string | null;
  organizerEmail: string | null;
  departmentCode: string | null;
  joinWebUrl: string | null;
  createdAt: string;
}

export interface CreateManualMeetingRequest {
  title: string;
  description?: string | null;
  startTime?: string | null;
  endTime?: string | null;
  organizerEmail?: string | null;
  organizerName?: string | null;
  departmentCode?: string | null;
}

export interface TranscriptSummary {
  id: string;
  graphTranscriptId: string | null;
  contentFormat: 'TextVtt' | 'TextPlainUnattributed' | 'Unknown';
  status: 'Pending' | 'Available' | 'Failed' | 'Rejected' | 'Parsed';
  retrievedAt: string | null;
}

export interface TranscriptDetails {
  id: string;
  meetingId: string;
  contentFormat: 'TextVtt' | 'TextPlainUnattributed' | 'Unknown';
  status: 'Pending' | 'Available' | 'Failed' | 'Rejected' | 'Parsed';
  language: string | null;
  content: string | null;
  sha256: string | null;
  retrievedAt: string;
}

export interface CreateTranscriptRequest {
  content: string;
  contentFormat: 'TextVtt' | 'TextPlainUnattributed';
  language?: string | null;
}

export interface AnalyzeTeamsTranscriptRequest {
  graphMeetingId: string;
  title: string;
  description?: string | null;
  startTime?: string | null;
  endTime?: string | null;
  organizerEmail?: string | null;
  organizerName?: string | null;
  departmentCode?: string | null;
  joinWebUrl?: string | null;
  graphTranscriptId: string;
  content: string;
  contentFormat: 'TextVtt' | 'TextPlainUnattributed';
  language?: string | null;
}

export interface TeamsTranscriptAnalysisResult {
  meetingId: string;
  transcriptId: string;
  aiConfigured: boolean;
  processingRun: ProcessingRunDetails | null;
  persisted?: boolean;
  modelUsed?: string;
  analysis?: MeetingAnalysis;
}

export interface ProcessingRunSummary {
  id: string;
  status:
    | 'Queued'
    | 'ResolvingMeeting'
    | 'DiscoveringTranscript'
    | 'DownloadingTranscript'
    | 'ParsingTranscript'
    | 'ValidatingTranscript'
    | 'PersistingTranscript'
    | 'FailedRetryable'
    | 'Succeeded'
    | 'FailedPermanent';
  attemptCount: number;
  createdAt: string;
  startedAt: string | null;
  completedAt: string | null;
}

export interface ProcessingRunDetails extends ProcessingRunSummary {
  meetingId: string;
  transcriptId: string | null;
  modelUsed: string | null;
  errorMessage: string | null;
  analysisJson: string | null;
}

export interface MeetingDashboardSummary {
  meetingCount: number;
  transcriptCount: number;
  reportCount: number;
  decisionCount: number;
  pendingActionCount: number;
  activeOrFailedProcessingCount: number;
  recentMeetings: MeetingSummary[];
}

export interface AiStatus {
  configured: boolean;
  persistenceConfigured: boolean;
  persistenceAvailable: boolean;
  model: string | null;
}

async function getApiError(response: Response): Promise<Error> {
  let detail: string | undefined;
  try {
    const body: unknown = await response.json();
    if (typeof body === 'object' && body !== null) {
      const problem = body as { detail?: unknown; title?: unknown };
      detail = typeof problem.detail === 'string'
        ? problem.detail
        : typeof problem.title === 'string'
          ? problem.title
          : undefined;
    }
  } catch {
    detail = undefined;
  }
  return new Error(detail || `ReadMeeting API request failed with status ${response.status}.`);
}

export interface MeetingAnalysisEvidence {
  quote: string;
  timestamp: string | null;
}

export interface MeetingAnalysisItem {
  text: string;
  evidence: MeetingAnalysisEvidence[];
}

export interface MeetingAnalysis {
  executiveSummary: string;
  summaryEvidence: MeetingAnalysisEvidence[];
  context: string;
  participants: { name: string; evidence: MeetingAnalysisEvidence }[];
  topics: { title: string; summary: string; evidence: MeetingAnalysisEvidence[] }[];
  facts: MeetingAnalysisItem[];
  proposals: MeetingAnalysisItem[];
  decisions: MeetingAnalysisItem[];
  actions: {
    description: string;
    responsible: string | null;
    deadlineText: string | null;
    evidence: MeetingAnalysisEvidence[];
  }[];
  risks: MeetingAnalysisItem[];
  reservations: MeetingAnalysisItem[];
  unresolved: MeetingAnalysisItem[];
}

export interface TranscriptChatTurn {
  role: 'user' | 'assistant';
  content: string;
}

export interface TranscriptChatResponse {
  meetingId: string;
  transcriptId: string;
  modelUsed: string;
  answer: string;
  answerable: boolean;
  citations: MeetingAnalysisEvidence[];
}

export interface CreateProcessingRunRequest {
  transcriptId: string;
}

export interface MeetingReportSummary {
  id: string;
  title: string;
  referenceNumber: string;
  approvalStatus: ReportApprovalStatus;
  generatedAt: string;
}

export type ReportApprovalStatus =
  | 'Draft'
  | 'UnderReview'
  | 'Approved'
  | 'Publishing'
  | 'PublicationFailed'
  | 'Published'
  | 'Rejected';

export interface MeetingReportDetails extends MeetingReportSummary {
  meetingId: string;
  executiveSummary: string;
  decisionsAgreed: string;
  keyDiscussionPoints: string;
  sharePointDocxUrl: string | null;
  sharePointFileId: string | null;
  validatedByEmail: string | null;
  structuredContentJson: string | null;
  rejectionReason: string | null;
  sharePointDriveId: string | null;
  sharePointFolderId: string | null;
  sharePointVersion: string | null;
  sharePointPublishedAt: string | null;
  sharePointPublishedBy: string | null;
  sharePointPublicationError: string | null;
}

export interface DecisionSummary {
  id: string;
  text: string;
  status: 'Proposed' | 'Confirmed' | 'Decided' | 'Rejected' | 'Reported' | 'ToConfirm';
  decisionType: 'Consensus' | 'Vote' | 'ChairDecision' | 'ExternalValidation' | 'Unspecified';
  approvedByName: string | null;
  createdAt: string;
}

export interface ActionItemSummary {
  id: string;
  meetingId: string;
  title: string | null;
  description: string;
  assigneeName: string | null;
  assigneeEmail: string | null;
  dueDate: string | null;
  deadlineText: string | null;
  priority: 'Low' | 'Medium' | 'High' | 'Critical';
  status: 'Pending' | 'InProgress' | 'Completed' | 'Deferred';
  createdAt: string;
}

export interface CreateMeetingReportRequest {
  title: string;
  referenceNumber: string;
  executiveSummary: string;
  decisionsAgreed: string;
  keyDiscussionPoints: string;
  approvalStatus?: 'Draft';
}

export interface CreateDecisionRequest {
  text: string;
  status?: 'Proposed' | 'Confirmed' | 'Decided' | 'Rejected' | 'Reported' | 'ToConfirm';
  decisionType?: 'Consensus' | 'Vote' | 'ChairDecision' | 'ExternalValidation';
  approvedByName?: string | null;
}

export interface CreateActionItemRequest {
  title?: string | null;
  description: string;
  assigneeName?: string | null;
  assigneeEmail?: string | null;
  dueDate?: string | null;
  deadlineText?: string | null;
  priority?: 'Low' | 'Medium' | 'High' | 'Critical';
  status?: 'Pending' | 'InProgress' | 'Completed' | 'Deferred';
  decisionId?: string | null;
}

export interface UpdateMeetingReportRequest {
  title: string;
  executiveSummary: string;
  decisionsAgreed: string;
  keyDiscussionPoints: string;
  structuredContentJson: string | null;
  rejectionReason: string | null;
  approvalStatus: 'Draft' | 'UnderReview' | 'Approved' | 'Rejected';
}

export interface SharePointSite {
  id: string;
  name: string;
  webUrl: string | null;
}

export interface SharePointDrive {
  id: string;
  name: string;
  driveType: string | null;
}

export interface SharePointFolder {
  id: string;
  name: string;
  webUrl: string | null;
}

export interface SharePointPublicationResult {
  reportId: string;
  fileName: string;
  fileId: string;
  webUrl: string;
  driveId: string;
  folderId: string;
  version: string | null;
  publishedAt: string;
}

export interface PublishMeetingReportRequest {
  siteId: string;
  driveId: string;
  folderId: string;
}

export interface UpdateDecisionRequest {
  text: string;
  status: DecisionSummary['status'];
  decisionType: DecisionSummary['decisionType'];
  approvedByName: string | null;
}

export interface UpdateActionItemRequest {
  title: string | null;
  description: string;
  assigneeName: string | null;
  assigneeEmail: string | null;
  dueDate: string | null;
  deadlineText: string | null;
  priority: 'Low' | 'Medium' | 'High' | 'Critical';
  status: ActionItemSummary['status'];
}

async function getJson<T>(
  msal: IPublicClientApplication,
  account: AccountInfo,
  path: string
): Promise<T> {
  const response = await fetchReadMeetingApi(msal, account, path);
  if (!response.ok) {
    throw await getApiError(response);
  }
  return response.json() as Promise<T>;
}

export const meetingApiClient = {
  dashboard(
    msal: IPublicClientApplication,
    account: AccountInfo
  ): Promise<MeetingDashboardSummary> {
    return getJson(msal, account, '/api/v1/dashboard');
  },

  aiStatus(
    msal: IPublicClientApplication,
    account: AccountInfo
  ): Promise<AiStatus> {
    return getJson(msal, account, '/api/v1/ai/status');
  },

  list(
    msal: IPublicClientApplication,
    account: AccountInfo,
    from?: string,
    to?: string
  ): Promise<MeetingSummary[]> {
    const query = new URLSearchParams();
    if (from) query.set('from', from);
    if (to) query.set('to', to);
    const suffix = query.size > 0 ? `?${query.toString()}` : '';
    return getJson(msal, account, `/api/v1/meetings${suffix}`);
  },

  get(
    msal: IPublicClientApplication,
    account: AccountInfo,
    meetingId: string
  ): Promise<MeetingDetails> {
    return getJson(msal, account, `/api/v1/meetings/${encodeURIComponent(meetingId)}`);
  },

  async createManual(
    msal: IPublicClientApplication,
    account: AccountInfo,
    request: CreateManualMeetingRequest
  ): Promise<MeetingDetails> {
    const response = await fetchReadMeetingApi(msal, account, '/api/v1/meetings', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(request),
    });
    if (!response.ok) {
      throw await getApiError(response);
    }
    return response.json() as Promise<MeetingDetails>;
  },

  transcripts(
    msal: IPublicClientApplication,
    account: AccountInfo,
    meetingId: string
  ): Promise<TranscriptSummary[]> {
    return getJson(
      msal,
      account,
      `/api/v1/meetings/${encodeURIComponent(meetingId)}/transcripts`
    );
  },

  transcript(
    msal: IPublicClientApplication,
    account: AccountInfo,
    meetingId: string
  ): Promise<TranscriptDetails> {
    return getJson(
      msal,
      account,
      `/api/v1/meetings/${encodeURIComponent(meetingId)}/transcript`
    );
  },

  transcriptById(
    msal: IPublicClientApplication,
    account: AccountInfo,
    meetingId: string,
    transcriptId: string
  ): Promise<TranscriptDetails> {
    return getJson(
      msal,
      account,
      `/api/v1/meetings/${encodeURIComponent(meetingId)}/transcripts/${encodeURIComponent(transcriptId)}`
    );
  },

  async createTranscript(
    msal: IPublicClientApplication,
    account: AccountInfo,
    meetingId: string,
    request: CreateTranscriptRequest
  ): Promise<TranscriptDetails> {
    const response = await fetchReadMeetingApi(
      msal,
      account,
      `/api/v1/meetings/${encodeURIComponent(meetingId)}/transcript`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(request),
      }
    );
    if (!response.ok) {
      throw await getApiError(response);
    }
    return response.json() as Promise<TranscriptDetails>;
  },

  async analyzeTeamsTranscript(
    msal: IPublicClientApplication,
    account: AccountInfo,
    request: AnalyzeTeamsTranscriptRequest
  ): Promise<TeamsTranscriptAnalysisResult> {
    const response = await fetchReadMeetingApi(
      msal,
      account,
      '/api/v1/meetings/teams-transcript-analysis',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(request),
      }
    );
    if (!response.ok) {
      throw await getApiError(response);
    }
    return response.json() as Promise<TeamsTranscriptAnalysisResult>;
  },

  async previewTeamsTranscriptAnalysis(
    msal: IPublicClientApplication,
    account: AccountInfo,
    request: AnalyzeTeamsTranscriptRequest
  ): Promise<TeamsTranscriptAnalysisResult> {
    const response = await fetchReadMeetingApi(
      msal,
      account,
      '/api/v1/ai/analyze-transcript',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(request),
      }
    );
    if (!response.ok) {
      const detail = await response.text();
      throw new Error(
        `ReadMeeting API request failed with status ${response.status}${detail ? `: ${detail}` : '.'}`
      );
    }
    const preview = await response.json() as {
      meetingId: string;
      transcriptId: string;
      aiConfigured: boolean;
      persisted: boolean;
      modelUsed: string;
      analysis: MeetingAnalysis;
    };
    return { ...preview, processingRun: null };
  },

  async askTranscriptQuestion(
    msal: IPublicClientApplication,
    account: AccountInfo,
    request: {
      graphMeetingId: string;
      graphTranscriptId: string;
      content: string;
      question: string;
      history: TranscriptChatTurn[];
    }
  ): Promise<TranscriptChatResponse> {
    const response = await fetchReadMeetingApi(msal, account, '/api/v1/ai/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(request),
    });
    if (!response.ok) {
      const body = await response.json().catch(() => null);
      throw new Error(body?.detail ?? `ReadMeeting API request failed with status ${response.status}.`);
    }
    return response.json() as Promise<TranscriptChatResponse>;
  },

  processingRuns(
    msal: IPublicClientApplication,
    account: AccountInfo,
    meetingId: string
  ): Promise<ProcessingRunSummary[]> {
    return getJson(
      msal,
      account,
      `/api/v1/meetings/${encodeURIComponent(meetingId)}/processing-runs`
    );
  },

  async createProcessingRun(
    msal: IPublicClientApplication,
    account: AccountInfo,
    meetingId: string,
    request: CreateProcessingRunRequest
  ): Promise<ProcessingRunDetails> {
    const response = await fetchReadMeetingApi(
      msal,
      account,
      `/api/v1/meetings/${encodeURIComponent(meetingId)}/processing-runs`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(request),
      }
    );
    if (!response.ok) {
      throw await getApiError(response);
    }
    return response.json() as Promise<ProcessingRunDetails>;
  },

  processingRun(
    msal: IPublicClientApplication,
    account: AccountInfo,
    processingRunId: string
  ): Promise<ProcessingRunDetails> {
    return getJson(
      msal,
      account,
      `/api/v1/processing-runs/${encodeURIComponent(processingRunId)}`
    );
  },

  reports(
    msal: IPublicClientApplication,
    account: AccountInfo,
    meetingId: string
  ): Promise<MeetingReportSummary[]> {
    return getJson(msal, account, `/api/v1/meetings/${encodeURIComponent(meetingId)}/reports`);
  },

  report(
    msal: IPublicClientApplication,
    account: AccountInfo,
    meetingId: string,
    reportId: string
  ): Promise<MeetingReportDetails> {
    return getJson(
      msal,
      account,
      `/api/v1/meetings/${encodeURIComponent(meetingId)}/reports/${encodeURIComponent(reportId)}`
    );
  },

  async createReport(
    msal: IPublicClientApplication,
    account: AccountInfo,
    meetingId: string,
    request: CreateMeetingReportRequest
  ): Promise<MeetingReportDetails> {
    const response = await fetchReadMeetingApi(
      msal,
      account,
      `/api/v1/meetings/${encodeURIComponent(meetingId)}/reports`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(request),
      }
    );
    if (!response.ok) {
      throw new Error(`ReadMeeting API request failed with status ${response.status}.`);
    }
    return response.json() as Promise<MeetingReportDetails>;
  },

  async updateReport(
    msal: IPublicClientApplication,
    account: AccountInfo,
    meetingId: string,
    reportId: string,
    request: UpdateMeetingReportRequest
  ): Promise<MeetingReportDetails> {
    const response = await fetchReadMeetingApi(
      msal,
      account,
      `/api/v1/meetings/${encodeURIComponent(meetingId)}/reports/${encodeURIComponent(reportId)}`,
      {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(request),
      }
    );
    if (!response.ok) {
      const body = await response.json().catch(() => null);
      throw new Error(
        body?.detail ?? `ReadMeeting API request failed with status ${response.status}.`
      );
    }
    return response.json() as Promise<MeetingReportDetails>;
  },

  sharePointSites(
    msal: IPublicClientApplication,
    account: AccountInfo,
    search: string
  ): Promise<SharePointSite[]> {
    const query = new URLSearchParams({ search });
    return getJson(msal, account, `/api/v1/sharepoint/sites?${query.toString()}`);
  },

  sharePointDrives(
    msal: IPublicClientApplication,
    account: AccountInfo,
    siteId: string
  ): Promise<SharePointDrive[]> {
    return getJson(
      msal,
      account,
      `/api/v1/sharepoint/sites/${encodeURIComponent(siteId)}/drives`
    );
  },

  sharePointFolders(
    msal: IPublicClientApplication,
    account: AccountInfo,
    driveId: string,
    parentFolderId?: string
  ): Promise<SharePointFolder[]> {
    const query = parentFolderId ? `?parentFolderId=${encodeURIComponent(parentFolderId)}` : '';
    return getJson(
      msal,
      account,
      `/api/v1/sharepoint/drives/${encodeURIComponent(driveId)}/folders${query}`
    );
  },

  async publishReport(
    msal: IPublicClientApplication,
    account: AccountInfo,
    meetingId: string,
    reportId: string,
    request: PublishMeetingReportRequest
  ): Promise<SharePointPublicationResult> {
    const response = await fetchReadMeetingApi(
      msal,
      account,
      `/api/v1/meetings/${encodeURIComponent(meetingId)}/reports/${encodeURIComponent(reportId)}/publish`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(request),
      }
    );
    if (!response.ok) throw await getApiError(response);
    return response.json() as Promise<SharePointPublicationResult>;
  },

  async updateDecision(
    msal: IPublicClientApplication,
    account: AccountInfo,
    meetingId: string,
    decisionId: string,
    request: UpdateDecisionRequest
  ): Promise<DecisionSummary> {
    const response = await fetchReadMeetingApi(
      msal,
      account,
      `/api/v1/meetings/${encodeURIComponent(meetingId)}/decisions/${encodeURIComponent(decisionId)}`,
      {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(request),
      }
    );
    if (!response.ok) {
      const body = await response.json().catch(() => null);
      throw new Error(body?.detail ?? `ReadMeeting API request failed with status ${response.status}.`);
    }
    return response.json() as Promise<DecisionSummary>;
  },

  decisions(
    msal: IPublicClientApplication,
    account: AccountInfo,
    meetingId: string
  ): Promise<DecisionSummary[]> {
    return getJson(msal, account, `/api/v1/meetings/${encodeURIComponent(meetingId)}/decisions`);
  },

  async createDecision(
    msal: IPublicClientApplication,
    account: AccountInfo,
    meetingId: string,
    request: CreateDecisionRequest
  ): Promise<DecisionSummary> {
    const response = await fetchReadMeetingApi(
      msal,
      account,
      `/api/v1/meetings/${encodeURIComponent(meetingId)}/decisions`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(request),
      }
    );
    if (!response.ok) {
      throw new Error(`ReadMeeting API request failed with status ${response.status}.`);
    }
    return response.json() as Promise<DecisionSummary>;
  },

  actions(
    msal: IPublicClientApplication,
    account: AccountInfo,
    meetingId: string
  ): Promise<ActionItemSummary[]> {
    return getJson(msal, account, `/api/v1/meetings/${encodeURIComponent(meetingId)}/actions`);
  },

  async createAction(
    msal: IPublicClientApplication,
    account: AccountInfo,
    meetingId: string,
    request: CreateActionItemRequest
  ): Promise<ActionItemSummary> {
    const response = await fetchReadMeetingApi(
      msal,
      account,
      `/api/v1/meetings/${encodeURIComponent(meetingId)}/actions`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(request),
      }
    );
    if (!response.ok) {
      throw new Error(`ReadMeeting API request failed with status ${response.status}.`);
    }
    return response.json() as Promise<ActionItemSummary>;
  },

  async updateAction(
    msal: IPublicClientApplication,
    account: AccountInfo,
    meetingId: string,
    actionItemId: string,
    request: UpdateActionItemRequest
  ): Promise<ActionItemSummary> {
    const response = await fetchReadMeetingApi(
      msal,
      account,
      `/api/v1/meetings/${encodeURIComponent(meetingId)}/actions/${encodeURIComponent(actionItemId)}`,
      {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(request),
      }
    );
    if (!response.ok) {
      const body = await response.json().catch(() => null);
      throw new Error(body?.detail ?? `ReadMeeting API request failed with status ${response.status}.`);
    }
    return response.json() as Promise<ActionItemSummary>;
  },
};
