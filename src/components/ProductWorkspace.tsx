import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useMsal } from '@azure/msal-react';
import {
  ActionItemSummary,
  AiStatus,
  DecisionSummary,
  MeetingDetails,
  MeetingReportDetails,
  MeetingReportSummary,
  MeetingSummary,
  ProcessingRunDetails,
  ProcessingRunSummary,
  SharePointDrive,
  SharePointFolder,
  SharePointPublicationResult,
  SharePointSite,
  TranscriptDetails,
  TranscriptSummary,
  meetingApiClient,
} from '../services/meetingApiClient';
import {
  fetchGraphDashboardData,
  fetchUpcomingGraphMeetings,
  GraphDashboardData,
  TranscriptCheckProgress,
} from '../services/graphDashboardService';
import { syntheticCoordinationTranscript } from '../demo/syntheticCoordinationTranscript';

export type ProductSection =
  | 'dashboard'
  | 'meetings'
  | 'transcripts'
  | 'reports'
  | 'decisions'
  | 'actions'
  | 'settings';

interface ProductWorkspaceProps {
  section: ProductSection;
  selectedMeetingId: string | null;
  onSelectMeeting: (meetingId: string) => void;
  onNavigate: (section: ProductSection) => void;
}

interface TranscriptRow {
  meeting: MeetingSummary;
  transcript: TranscriptSummary;
}

interface ReportRow {
  meeting: MeetingSummary;
  report: MeetingReportSummary;
}

interface DecisionRow {
  meeting: MeetingSummary;
  decision: DecisionSummary;
}

interface ActionRow {
  meeting: MeetingSummary;
  action: ActionItemSummary;
}

interface EvidenceReference {
  quote: string;
  timestamp: string | null;
}

interface TextExtraction {
  text: string;
  evidence: EvidenceReference[];
}

interface StructuredAnalysis {
  executiveSummary: string;
  summaryEvidence: EvidenceReference[];
  context: string;
  participants: { name: string; evidence: EvidenceReference }[];
  topics: { title: string; summary: string; evidence: EvidenceReference[] }[];
  facts: TextExtraction[];
  proposals: TextExtraction[];
  decisions: TextExtraction[];
  actions: {
    description: string;
    responsible: string | null;
    deadlineText: string | null;
    evidence: EvidenceReference[];
  }[];
  risks: TextExtraction[];
  reservations: TextExtraction[];
  unresolved: TextExtraction[];
}

const dateLabel = (value: string | null) =>
  value ? new Intl.DateTimeFormat('fr-FR', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(value)) : 'Non précisée';

const toDateTimeLocal = (value: string | null) => {
  if (!value) return '';
  const date = new Date(value);
  return new Date(date.getTime() - date.getTimezoneOffset() * 60_000).toISOString().slice(0, 16);
};

const statusLabel = (value: string) =>
  ({
    Scheduled: 'Planifiée',
    Available: 'Disponible',
    Parsed: 'Analysée',
    RejectedTranscript: 'Rejetée',
    InProgress: 'En cours',
    Completed: 'Terminée',
    Transcribing: 'Transcription en cours',
    Transcribed: 'Transcrite',
    ReportGenerated: 'Compte rendu produit',
    Archived: 'Archivée',
    Failed: 'En erreur',
    Queued: 'En attente',
    ParsingTranscript: 'Analyse de la transcription',
    ValidatingTranscript: 'Validation des résultats',
    PersistingTranscript: 'Enregistrement des résultats',
    ResolvingMeeting: 'Préparation de la réunion',
    DiscoveringTranscript: 'Recherche de la transcription',
    DownloadingTranscript: 'Récupération de la transcription',
    Succeeded: 'Terminé',
    FailedRetryable: 'Erreur — réessayable',
    FailedPermanent: 'Erreur définitive',
    Draft: 'Brouillon',
    UnderReview: 'En relecture',
    Approved: 'Validé',
    Publishing: 'Publication en cours',
    PublicationFailed: 'Échec de publication',
    Published: 'Publié',
    Rejected: 'Rejeté',
    Proposed: 'Proposition',
    Decided: 'Décision',
    Confirmed: 'Confirmée',
    Pending: 'En attente',
    InProgressAction: 'En cours',
    CompletedAction: 'Terminée',
    Deferred: 'Reportée',
  })[value] ?? value;

const cardClass = 'rounded-xl border border-slate-800 bg-slate-900 p-5 shadow-sm';
const buttonClass = 'rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-emerald-500 disabled:cursor-not-allowed disabled:opacity-50';
const secondaryButtonClass = 'rounded-lg border border-slate-700 bg-slate-900 px-4 py-2 text-sm font-medium text-slate-200 transition hover:border-slate-500 disabled:opacity-50';

export const ProductWorkspace: React.FC<ProductWorkspaceProps> = ({
  section,
  selectedMeetingId,
  onSelectMeeting,
  onNavigate,
}) => {
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
  const [dashboard, setDashboard] = useState<GraphDashboardData | null>(null);
  const [dashboardRefreshKey, setDashboardRefreshKey] = useState(0);
  const [transcriptCheckProgress, setTranscriptCheckProgress] = useState<TranscriptCheckProgress>({
    completed: 0,
    total: 0,
  });
  const [upcomingError, setUpcomingError] = useState<string | null>(null);
  const [upcomingRefreshing, setUpcomingRefreshing] = useState(false);
  const [aiStatus, setAiStatus] = useState<AiStatus | null>(null);
  const [meetings, setMeetings] = useState<MeetingSummary[]>([]);
  const [meetingDetails, setMeetingDetails] = useState<MeetingDetails | null>(null);
  const [transcripts, setTranscripts] = useState<TranscriptRow[]>([]);
  const [selectedTranscript, setSelectedTranscript] = useState<TranscriptDetails | null>(null);
  const [runs, setRuns] = useState<ProcessingRunSummary[]>([]);
  const [reports, setReports] = useState<ReportRow[]>([]);
  const [selectedReport, setSelectedReport] = useState<MeetingReportDetails | null>(null);
  const [sharePointSearch, setSharePointSearch] = useState('');
  const [sharePointSites, setSharePointSites] = useState<SharePointSite[]>([]);
  const [sharePointDrives, setSharePointDrives] = useState<SharePointDrive[]>([]);
  const [sharePointFolders, setSharePointFolders] = useState<SharePointFolder[]>([]);
  const [selectedSharePointSiteId, setSelectedSharePointSiteId] = useState('');
  const [selectedSharePointDriveId, setSelectedSharePointDriveId] = useState('');
  const [selectedSharePointFolderId, setSelectedSharePointFolderId] = useState('');
  const [sharePointBusy, setSharePointBusy] = useState(false);
  const [publishingReport, setPublishingReport] = useState(false);
  const [decisions, setDecisions] = useState<DecisionRow[]>([]);
  const [actions, setActions] = useState<ActionRow[]>([]);
  const [analysis, setAnalysis] = useState<ProcessingRunDetails | null>(null);
  const [busy, setBusy] = useState(false);
  const [processing, setProcessing] = useState(false);
  const [savingReport, setSavingReport] = useState(false);
  const [savingItemId, setSavingItemId] = useState<string | null>(null);
  const [creatingDemo, setCreatingDemo] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const selectedMeeting = useMemo(
    () => meetings.find((meeting) => meeting.id === selectedMeetingId) ?? null,
    [meetings, selectedMeetingId]
  );
  const accountRoles = account?.idTokenClaims && typeof account.idTokenClaims === 'object'
    ? (account.idTokenClaims as { roles?: unknown }).roles
    : undefined;
  const isReportValidator = Array.isArray(accountRoles)
    && accountRoles.includes('ReadMeeting.ReportValidator');
  const isSelectedReportEditable = selectedReport
    ? ['Draft', 'UnderReview', 'Rejected'].includes(selectedReport.approvalStatus)
    : false;

  useEffect(() => {
    if (!account || !analysis || ![
      'Queued',
      'ResolvingMeeting',
      'DiscoveringTranscript',
      'DownloadingTranscript',
      'ParsingTranscript',
      'ValidatingTranscript',
      'PersistingTranscript',
      'FailedRetryable',
    ].includes(analysis.status)) {
      return;
    }

    const timer = window.setTimeout(() => {
      meetingApiClient.processingRun(instance, account, analysis.id)
        .then(setAnalysis)
        .catch((pollError) => setError(
          pollError instanceof Error ? pollError.message : "Le statut du traitement n'a pas pu être actualisé."
        ));
    }, analysis.status === 'FailedRetryable' ? 5000 : 1500);
    return () => window.clearTimeout(timer);
  }, [account, analysis, instance]);

  useEffect(() => {
    if (!account || analysis?.status !== 'Succeeded' || !selectedMeetingId) return;
    let active = true;

    const refreshResults = async () => {
      const [reportSummaries, decisionSummaries, actionSummaries] = await Promise.all([
        meetingApiClient.reports(instance, account, selectedMeetingId),
        meetingApiClient.decisions(instance, account, selectedMeetingId),
        meetingApiClient.actions(instance, account, selectedMeetingId),
      ]);
      if (!active) return;

      const meeting = meetings.find((item) => item.id === selectedMeetingId) ?? meetingDetails;
      if (!meeting) return;
      setReports(reportSummaries.map((report) => ({ meeting, report })));
      setDecisions(decisionSummaries.map((decision) => ({ meeting, decision })));
      setActions(actionSummaries.map((action) => ({ meeting, action })));

      if (reportSummaries[0]) {
        const report = await meetingApiClient.report(
          instance,
          account,
          selectedMeetingId,
          reportSummaries[0].id
        );
        if (active) setSelectedReport(report);
      }
    };

    void refreshResults().catch((refreshError) => {
      if (active) {
        setError(refreshError instanceof Error
          ? refreshError.message
          : 'Les résultats enregistrés ne peuvent pas être actualisés.');
      }
    });

    return () => { active = false; };
  }, [account, analysis?.id, analysis?.status, instance, meetings, meetingDetails, selectedMeetingId]);

  const loadMeetingList = useCallback(async () => {
    if (!account) return [];
    const result = await meetingApiClient.list(instance, account);
    setMeetings(result);
    if (result.length > 0 && !result.some((meeting) => meeting.id === selectedMeetingId)) {
      onSelectMeeting(result[0].id);
    }
    return result;
  }, [account, instance, onSelectMeeting, selectedMeetingId]);

  useEffect(() => {
    if (!account) return;
    let active = true;
    setBusy(true);
    setError(null);
    setNotice(null);

    const load = async () => {
      try {
        if (section === 'dashboard') {
          setTranscriptCheckProgress({ completed: 0, total: 0 });
          const summary = await fetchGraphDashboardData(
            instance,
            account,
            (progress) => {
              if (active) setTranscriptCheckProgress(progress);
            }
          );
          if (active) {
            setDashboard(summary);
            setUpcomingError(null);
          }
          return;
        }

        if (section === 'settings') {
          const ai = await meetingApiClient.aiStatus(instance, account);
          if (active) setAiStatus(ai);
          return;
        }

        const [allMeetings] = await Promise.all([
          loadMeetingList(),
          ...(section === 'meetings'
            ? [meetingApiClient.aiStatus(instance, account).then((status) => {
                if (active) setAiStatus(status);
              })]
            : []),
        ]);
        if (!active) return;
        if (section === 'meetings') return;

        if (section === 'transcripts') {
          const groups = await Promise.all(allMeetings.map(async (meeting) => ({
            meeting,
            transcripts: await meetingApiClient.transcripts(instance, account, meeting.id),
          })));
          if (active) setTranscripts(groups.flatMap(({ meeting, transcripts: items }) =>
            items.map((transcript) => ({ meeting, transcript }))
          ));
        } else if (section === 'reports') {
          const groups = await Promise.all(allMeetings.map(async (meeting) => ({
            meeting,
            reports: await meetingApiClient.reports(instance, account, meeting.id),
          })));
          if (active) setReports(groups.flatMap(({ meeting, reports: items }) =>
            items.map((report) => ({ meeting, report }))
          ));
        } else if (section === 'decisions') {
          const groups = await Promise.all(allMeetings.map(async (meeting) => ({
            meeting,
            decisions: await meetingApiClient.decisions(instance, account, meeting.id),
          })));
          if (active) setDecisions(groups.flatMap(({ meeting, decisions: items }) =>
            items.map((decision) => ({ meeting, decision }))
          ));
        } else if (section === 'actions') {
          const groups = await Promise.all(allMeetings.map(async (meeting) => ({
            meeting,
            actions: await meetingApiClient.actions(instance, account, meeting.id),
          })));
          if (active) setActions(groups.flatMap(({ meeting, actions: items }) =>
            items.map((action) => ({ meeting, action }))
          ));
        }
      } catch (loadError) {
        if (active) setError(loadError instanceof Error ? loadError.message : 'Le chargement des données a échoué.');
      } finally {
        if (active) setBusy(false);
      }
    };

    void load();
    return () => { active = false; };
  }, [account, dashboardRefreshKey, instance, section, loadMeetingList]);

  useEffect(() => {
    if (!account || section !== 'dashboard') return;
    let active = true;
    let refreshing = false;
    const refreshUpcoming = async () => {
      if (refreshing) return;
      refreshing = true;
      if (active) setUpcomingRefreshing(true);
      try {
        const upcomingMeetings = await fetchUpcomingGraphMeetings(instance, account);
        if (active) {
          setDashboard((current) => current
            ? {
                ...current,
                upcomingMeetings,
                upcomingRefreshedAt: new Date().toISOString(),
              }
            : current);
          setUpcomingError(null);
        }
      } catch (refreshError) {
        if (active) {
          setUpcomingError(refreshError instanceof Error
            ? refreshError.message
            : 'Les réunions à venir ne peuvent pas être actualisées depuis Microsoft Graph.');
        }
      } finally {
        refreshing = false;
        if (active) setUpcomingRefreshing(false);
      }
    };
    const intervalId = window.setInterval(() => void refreshUpcoming(), 60_000);
    return () => {
      active = false;
      window.clearInterval(intervalId);
    };
  }, [account, instance, section]);

  useEffect(() => {
    if (!account || section !== 'meetings' || !selectedMeetingId) return;
    let active = true;
    setBusy(true);
    setError(null);
    setNotice(null);
    setAnalysis(null);
    setSelectedTranscript(null);
    setSelectedReport(null);

    Promise.all([
      meetingApiClient.get(instance, account, selectedMeetingId),
      meetingApiClient.transcripts(instance, account, selectedMeetingId),
      meetingApiClient.processingRuns(instance, account, selectedMeetingId),
      meetingApiClient.reports(instance, account, selectedMeetingId),
      meetingApiClient.decisions(instance, account, selectedMeetingId),
      meetingApiClient.actions(instance, account, selectedMeetingId),
    ]).then(async ([details, transcriptList, processingRuns, reportList, decisionList, actionList]) => {
      if (!active) return;
      setMeetingDetails(details);
      setRuns(processingRuns);
      if (processingRuns[0]) {
        const latestRun = await meetingApiClient.processingRun(
          instance,
          account,
          processingRuns[0].id
        );
        if (active) setAnalysis(latestRun);
      }
      const selectedReportSummary = reportList[0];
      if (selectedReportSummary) {
        const fullReport = await meetingApiClient.report(instance, account, selectedMeetingId, selectedReportSummary.id);
        if (active) setSelectedReport(fullReport);
      }
      if (transcriptList[0]) {
        const fullTranscript = await meetingApiClient.transcriptById(
          instance,
          account,
          selectedMeetingId,
          transcriptList[0].id
        );
        if (active) setSelectedTranscript(fullTranscript);
      }
      setTranscripts(transcriptList.map((transcript) => ({ meeting: details, transcript })));
      setReports(reportList.map((report) => ({ meeting: details, report })));
      setDecisions(decisionList.map((decision) => ({ meeting: details, decision })));
      setActions(actionList.map((action) => ({ meeting: details, action })));
    }).catch((loadError) => {
      if (active) setError(loadError instanceof Error ? loadError.message : 'Les détails de la réunion sont indisponibles.');
    }).finally(() => {
      if (active) setBusy(false);
    });

    return () => { active = false; };
  }, [account, instance, section, selectedMeetingId]);

  const loadTranscript = async (meeting: MeetingSummary, transcript: TranscriptSummary) => {
    if (!account) return;
    setError(null);
    setSelectedTranscript(null);
    try {
      const result = await meetingApiClient.transcriptById(instance, account, meeting.id, transcript.id);
      setSelectedTranscript(result);
      onSelectMeeting(meeting.id);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : 'La transcription ne peut pas être chargée.');
    }
  };

  const startProcessing = async () => {
    if (!account || !selectedMeetingId || !selectedTranscript || !aiStatus?.configured) return;
    setProcessing(true);
    setError(null);
    setNotice(null);
    try {
      const result = await meetingApiClient.createProcessingRun(instance, account, selectedMeetingId, {
        transcriptId: selectedTranscript.id,
      });
      setAnalysis(result);
      setRuns((previous) => [result, ...previous.filter((run) => run.id !== result.id)]);
      setNotice(result.status === 'Succeeded'
        ? 'Analyse terminée et enregistrée avec les références sources.'
        : result.status === 'FailedPermanent' || result.status === 'FailedRetryable'
          ? result.errorMessage ?? 'Le traitement a échoué. Consultez le statut du traitement.'
          : 'Analyse mise en file. Le statut et les résultats seront actualisés automatiquement.');
    } catch (processingError) {
      setError(processingError instanceof Error ? processingError.message : 'Le traitement IA a échoué.');
    } finally {
      setProcessing(false);
    }
  };

  const createDemoScenario = async () => {
    if (!account) return;
    setCreatingDemo(true);
    setError(null);
    setNotice(null);
    let createdMeetingId: string | null = null;
    let transcriptSaved = false;
    try {
      const demoTitle = 'Coordination du suivi des décaissements — scénario synthétique';
      const existingMeetings = await loadMeetingList();
      const existingDemo = existingMeetings.find((meeting) => meeting.title === demoTitle);
      if (existingDemo) {
        createdMeetingId = existingDemo.id;
        const existingTranscripts = await meetingApiClient.transcripts(instance, account, existingDemo.id);
        if (existingTranscripts[0]) {
          const transcript = await meetingApiClient.transcriptById(
            instance,
            account,
            existingDemo.id,
            existingTranscripts[0].id
          );
          setSelectedTranscript(transcript);
          onSelectMeeting(existingDemo.id);
          setNotice('Le scénario synthétique existe déjà; sa transcription est sélectionnée.');
          return;
        }
      }

      const startTime = new Date();
      startTime.setHours(9, 0, 0, 0);
      const endTime = new Date(startTime.getTime() + 60 * 60 * 1000);

      let meeting: MeetingDetails;
      if (existingDemo) {
        meeting = await meetingApiClient.get(instance, account, existingDemo.id);
      } else {
        meeting = await meetingApiClient.createManual(instance, account, {
          title: demoTitle,
          description: 'Réunion de démonstration constituée exclusivement de données fictives.',
          startTime: startTime.toISOString(),
          endTime: endTime.toISOString(),
          organizerName: 'Mme Aïcha N’Dri (personnage fictif)',
          departmentCode: 'DGF — scénario de démonstration',
        });
      }

      createdMeetingId = meeting.id;
      const transcript = await meetingApiClient.createTranscript(instance, account, meeting.id, {
        content: syntheticCoordinationTranscript,
        contentFormat: 'TextVtt',
        language: 'fr',
      });
      transcriptSaved = true;
      await loadMeetingList();
      setMeetingDetails(meeting);
      setSelectedTranscript(transcript);
      onSelectMeeting(meeting.id);
      setNotice('Réunion et transcription synthétiques créées dans le tenant. Sélectionnez « Analyser cette transcription » pour démarrer le traitement.');
    } catch (createError) {
      const reason = createError instanceof Error ? createError.message : 'La préparation du scénario a échoué.';
      setError(createdMeetingId
        ? `La réunion synthétique ${transcriptSaved ? 'et sa transcription ont été enregistrées, mais son actualisation a échoué' : 'est disponible, mais sa transcription n’a pas été enregistrée'}. Réunion : ${createdMeetingId}. ${reason}`
        : reason);
    } finally {
      setCreatingDemo(false);
    }
  };

  const openReport = async (row: ReportRow) => {
    if (!account) return;
    setError(null);
    setSelectedReport(null);
    onSelectMeeting(row.meeting.id);
    try {
      const result = await meetingApiClient.report(instance, account, row.meeting.id, row.report.id);
      setSelectedReport(result);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : 'Le compte rendu ne peut pas être chargé.');
    }
  };

  const searchSharePointSites = async () => {
    if (!account || !sharePointSearch.trim()) return;
    setSharePointBusy(true);
    setError(null);
    try {
      const sites = await meetingApiClient.sharePointSites(instance, account, sharePointSearch.trim());
      setSharePointSites(sites);
      setSharePointDrives([]);
      setSharePointFolders([]);
      setSelectedSharePointSiteId('');
      setSelectedSharePointDriveId('');
      setSelectedSharePointFolderId('');
    } catch (searchError) {
      setError(searchError instanceof Error ? searchError.message : "La recherche des sites SharePoint a échoué.");
    } finally {
      setSharePointBusy(false);
    }
  };

  const loadSharePointDrives = async (siteId: string) => {
    if (!account) return;
    setSelectedSharePointSiteId(siteId);
    setSelectedSharePointDriveId('');
    setSharePointDrives([]);
    setSharePointFolders([]);
    setSelectedSharePointFolderId('');
    if (!siteId) return;

    setSharePointBusy(true);
    setError(null);
    try {
      setSharePointDrives(await meetingApiClient.sharePointDrives(instance, account, siteId));
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Les bibliothèques SharePoint n'ont pas pu être chargées.");
    } finally {
      setSharePointBusy(false);
    }
  };

  const loadSharePointFolders = async (driveId: string) => {
    if (!account) return;
    setSelectedSharePointDriveId(driveId);
    setSharePointFolders([]);
    setSelectedSharePointFolderId('');
    if (!driveId) return;

    setSharePointBusy(true);
    setError(null);
    try {
      setSharePointFolders(await meetingApiClient.sharePointFolders(instance, account, driveId, 'root'));
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Les dossiers SharePoint n'ont pas pu être chargés.");
    } finally {
      setSharePointBusy(false);
    }
  };

  const saveReport = async (status: 'Draft' | 'UnderReview' | 'Approved' | 'Rejected') => {
    if (!account || !selectedReport) return;
    setSavingReport(true);
    setError(null);
    setNotice(null);
    try {
      const updated = await meetingApiClient.updateReport(
        instance,
        account,
        selectedReport.meetingId,
        selectedReport.id,
        {
          title: selectedReport.title,
          executiveSummary: selectedReport.executiveSummary,
          decisionsAgreed: selectedReport.decisionsAgreed,
          keyDiscussionPoints: selectedReport.keyDiscussionPoints,
          structuredContentJson: selectedReport.structuredContentJson,
          rejectionReason: selectedReport.rejectionReason,
          approvalStatus: status,
        }
      );
      setSelectedReport(updated);
      setReports((current) => current.map((row) =>
        row.report.id === updated.id ? { ...row, report: updated } : row
      ));
      setNotice(`Compte rendu enregistré : ${statusLabel(updated.approvalStatus)}.`);
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "L'enregistrement du compte rendu a échoué.");
    } finally {
      setSavingReport(false);
    }
  };

  const publishSelectedReport = async () => {
    if (!account || !selectedReport || !isReportValidator) return;
    const destinationName = sharePointFolders.find((folder) => folder.id === selectedSharePointFolderId)?.name
      ?? (selectedSharePointFolderId === 'root' ? 'Racine de la bibliothèque' : 'Destination configurée');
    if (!window.confirm(`Publier « ${selectedReport.title} » vers ${destinationName} sur SharePoint ?`)) return;

    setPublishingReport(true);
    setError(null);
    setNotice(null);
    let result: SharePointPublicationResult;
    try {
      result = await meetingApiClient.publishReport(
        instance,
        account,
        selectedReport.meetingId,
        selectedReport.id,
        {
          siteId: selectedSharePointSiteId,
          driveId: selectedSharePointDriveId,
          folderId: selectedSharePointFolderId,
        }
      );
    } catch (publishError) {
      setError(publishError instanceof Error
        ? publishError.message
        : "La publication SharePoint a échoué. Le compte rendu n'est pas marqué comme publié.");
      try {
        const updated = await meetingApiClient.report(
          instance,
          account,
          selectedReport.meetingId,
          selectedReport.id
        );
        setSelectedReport(updated);
        setReports((current) => current.map((row) =>
          row.report.id === updated.id ? { ...row, report: updated } : row
        ));
      } catch {
        setError((current) => `${current ?? "La publication SharePoint a échoué."} Le statut du compte rendu n'a pas pu être actualisé.`);
      }
      setPublishingReport(false);
      return;
    }

    try {
      const updated = await meetingApiClient.report(
        instance,
        account,
        selectedReport.meetingId,
        selectedReport.id
      );
      setSelectedReport(updated);
      setReports((current) => current.map((row) =>
        row.report.id === updated.id ? { ...row, report: updated } : row
      ));
      setNotice(`Publication confirmée par Microsoft Graph : ${result.fileName}.`);
    } catch (refreshError) {
      setNotice(`Publication confirmée par Microsoft Graph : ${result.fileName}.`);
      setError(refreshError instanceof Error
        ? `La publication a réussi, mais le statut du rapport n'a pas pu être actualisé : ${refreshError.message}`
        : "La publication a réussi, mais le statut du rapport n'a pas pu être actualisé.");
    } finally {
      setPublishingReport(false);
    }
  };

  const saveDecision = async (row: DecisionRow) => {
    if (!account) return;
    setSavingItemId(row.decision.id);
    setError(null);
    try {
      const updated = await meetingApiClient.updateDecision(
        instance,
        account,
        row.meeting.id,
        row.decision.id,
        {
          text: row.decision.text,
          status: row.decision.status,
          decisionType: row.decision.decisionType,
          approvedByName: row.decision.approvedByName,
        }
      );
      setDecisions((current) => current.map((item) =>
        item.decision.id === updated.id ? { ...item, decision: updated } : item
      ));
      setNotice('Décision corrigée et enregistrée.');
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "La correction de la décision a échoué.");
    } finally {
      setSavingItemId(null);
    }
  };

  const saveAction = async (row: ActionRow) => {
    if (!account) return;
    setSavingItemId(row.action.id);
    setError(null);
    try {
      const updated = await meetingApiClient.updateAction(
        instance,
        account,
        row.meeting.id,
        row.action.id,
        {
          title: row.action.title,
          description: row.action.description,
          assigneeName: row.action.assigneeName,
          assigneeEmail: row.action.assigneeEmail,
          dueDate: row.action.dueDate,
          deadlineText: row.action.deadlineText,
          priority: row.action.priority,
          status: row.action.status,
        }
      );
      setActions((current) => current.map((item) =>
        item.action.id === updated.id ? { ...item, action: updated } : item
      ));
      setNotice('Action corrigée et enregistrée.');
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "La correction de l'action a échoué.");
    } finally {
      setSavingItemId(null);
    }
  };

  const updateDecision = (decisionId: string, patch: Partial<DecisionRow['decision']>) => {
    setDecisions((current) => current.map((row) => row.decision.id === decisionId
      ? { ...row, decision: { ...row.decision, ...patch } }
      : row
    ));
  };

  const updateAction = (actionId: string, patch: Partial<ActionRow['action']>) => {
    setActions((current) => current.map((row) => row.action.id === actionId
      ? { ...row, action: { ...row.action, ...patch } }
      : row
    ));
  };

  if (!account) {
    return (
      <section className={cardClass}>
        <h1 className="text-xl font-semibold text-white">Connexion requise</h1>
        <p className="mt-2 text-sm text-slate-400">Connectez-vous avec votre compte professionnel pour consulter les données ReadMeeting.ai de votre tenant.</p>
      </section>
    );
  }

  return (
    <div className="mx-auto max-w-7xl space-y-6 pb-12">
      {error && section !== 'dashboard' && <div role="alert" className="rounded-lg border border-rose-800 bg-rose-950/70 px-4 py-3 text-sm text-rose-200">{error}</div>}
      {notice && <div role="status" className="rounded-lg border border-emerald-800 bg-emerald-950/60 px-4 py-3 text-sm text-emerald-200">{notice}</div>}
      {busy && <div className="text-sm text-slate-400" role="status">{section === 'dashboard' ? 'Chargement des données Microsoft Graph…' : 'Chargement des données du tenant…'}</div>}

      {section === 'dashboard' && (
        <DashboardSection
          dashboard={dashboard}
          loading={busy}
          error={error}
          transcriptCheckProgress={transcriptCheckProgress}
          upcomingError={upcomingError}
          upcomingRefreshing={upcomingRefreshing}
          onRefresh={() => setDashboardRefreshKey((current) => current + 1)}
        />
      )}

      {section === 'meetings' && (
        <section className="space-y-5">
          <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-emerald-400">Espace de travail</p>
              <h1 className="mt-1 text-2xl font-semibold text-white">Réunions</h1>
              <p className="mt-1 text-sm text-slate-400">Réunions enregistrées dans la base de données du tenant.</p>
            </div>
            <select
              aria-label="Réunion sélectionnée"
              value={selectedMeetingId ?? ''}
              onChange={(event) => onSelectMeeting(event.target.value)}
              className="min-w-64 rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-slate-100"
            >
              {meetings.map((meeting) => <option key={meeting.id} value={meeting.id}>{meeting.title}</option>)}
            </select>
          </div>
          <div className="flex flex-col gap-2 rounded-xl border border-amber-900/70 bg-amber-950/20 p-4 sm:flex-row sm:items-center sm:justify-between">
            <p className="text-xs leading-5 text-amber-100/80">
              Scénario de démonstration : personnages et transcription entièrement fictifs. La création est manuelle et enregistre ces éléments dans le tenant courant.
            </p>
            <button type="button" className={secondaryButtonClass} onClick={() => void createDemoScenario()} disabled={creatingDemo}>
              {creatingDemo ? 'Création du scénario…' : 'Créer la réunion synthétique'}
            </button>
          </div>
          {meetings.length === 0 && !busy && <EmptyState text="Aucune réunion n'est enregistrée dans ce tenant." />}
          {meetingDetails && (
            <div className="grid gap-5 lg:grid-cols-[1.1fr_0.9fr]">
              <div className={cardClass}>
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <h2 className="text-lg font-semibold text-white">{meetingDetails.title}</h2>
                    <p className="mt-1 text-sm text-slate-400">{meetingDetails.description || 'Aucune description renseignée.'}</p>
                  </div>
                  <StatusPill value={meetingDetails.status} />
                </div>
                <dl className="mt-5 grid gap-3 text-sm sm:grid-cols-2">
                  <Detail label="Début" value={dateLabel(meetingDetails.startTime)} />
                  <Detail label="Fin" value={dateLabel(meetingDetails.endTime)} />
                  <Detail label="Organisateur" value={meetingDetails.organizerName || 'Non identifié'} />
                  <Detail label="Direction" value={meetingDetails.departmentCode || 'Non précisée'} />
                </dl>
                <div className="mt-5 flex flex-wrap gap-2">
                  <button className={secondaryButtonClass} onClick={() => onNavigate('transcripts')}>Voir la transcription</button>
                  <button className={secondaryButtonClass} onClick={() => onNavigate('reports')}>Comptes rendus</button>
                  <button className={secondaryButtonClass} onClick={() => onNavigate('decisions')}>Décisions</button>
                  <button className={secondaryButtonClass} onClick={() => onNavigate('actions')}>Actions</button>
                </div>
              </div>
              <div className={cardClass}>
                <h2 className="font-semibold text-white">Parcours de traitement</h2>
                <ol className="mt-4 space-y-3">
                  <PipelineStep label="Réunion enregistrée" complete />
                  <PipelineStep label="Transcription disponible" complete={Boolean(selectedTranscript)} />
                  <PipelineStep label="Analyse IA" complete={runs.some((run) => run.status === 'Succeeded')} />
                  <PipelineStep label="Compte rendu provisoire" complete={reports.length > 0} />
                  <PipelineStep label="Validation humaine" complete={reports.some(({ report }) => ['Approved', 'Published'].includes(report.approvalStatus))} />
                </ol>
              </div>
              <div className={`${cardClass} lg:col-span-2`}>
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <h2 className="font-semibold text-white">Transcription source et traitement</h2>
                    <p className="mt-1 text-xs text-slate-400">Seule la transcription persistée dans l'API est analysée. Aucun résultat de démonstration n'est généré.</p>
                  </div>
                  {selectedTranscript && (
                    <button className={buttonClass} onClick={startProcessing} disabled={processing || !aiStatus?.configured}>
                      {processing ? 'Traitement…' : 'Analyser cette transcription'}
                    </button>
                  )}
                </div>
                {!aiStatus?.configured && (
                  <p className="mt-4 rounded-lg border border-amber-800 bg-amber-950/50 p-3 text-sm text-amber-200">
                    Gemini n'est pas configuré côté serveur. L'administrateur doit renseigner Ai__Gemini__ApiKey et Ai__Gemini__Model dans la configuration serveur de l'API.
                  </p>
                )}
                {transcripts.length > 0 && (
                  <div className="mt-4 flex flex-wrap gap-2">
                    {transcripts.map(({ transcript }) => (
                      <button
                        key={transcript.id}
                        className={transcript.id === selectedTranscript?.id ? buttonClass : secondaryButtonClass}
                        onClick={() => {
                          const meeting = selectedMeeting ?? meetingDetails;
                          if (meeting) void loadTranscript(meeting, transcript);
                        }}
                      >
                        Transcription · {statusLabel(transcript.status)}
                      </button>
                    ))}
                  </div>
                )}
                {selectedTranscript ? (
                  <pre className="mt-4 max-h-80 overflow-auto whitespace-pre-wrap rounded-lg border border-slate-800 bg-slate-950 p-4 text-xs leading-6 text-slate-300">{selectedTranscript.content || 'Le contenu de cette transcription n’est pas accessible.'}</pre>
                ) : (
                  <p className="mt-4 text-sm text-slate-400">Aucune transcription disponible pour cette réunion.</p>
                )}
                {runs.length > 0 && (
                  <div className="mt-5 border-t border-slate-800 pt-4">
                    <h3 className="text-sm font-semibold text-slate-200">Historique des traitements</h3>
                    <div className="mt-2 space-y-2">
                      {runs.map((run) => (
                        <button
                          key={run.id}
                          onClick={async () => {
                            if (!account) return;
                            try {
                              setAnalysis(await meetingApiClient.processingRun(instance, account, run.id));
                            } catch (loadError) {
                              setError(loadError instanceof Error ? loadError.message : "Impossible de charger le traitement.");
                            }
                          }}
                          className="flex w-full items-center justify-between gap-3 rounded-lg border border-slate-800 px-3 py-2 text-left text-sm hover:bg-slate-800/60"
                        >
                          <span>{dateLabel(run.createdAt)}</span><StatusPill value={run.status} />
                        </button>
                      ))}
                    </div>
                  </div>
                )}
              </div>
              {analysis && (
                <div className={`${cardClass} lg:col-span-2`}>
                  <h2 className="font-semibold text-white">Résultat structuré · {statusLabel(analysis.status)}</h2>
                  {analysis.errorMessage && <p className="mt-2 text-sm text-rose-300">{analysis.errorMessage}</p>}
                  {analysis.analysisJson
                    ? <StructuredAnalysisView json={analysis.analysisJson} />
                    : <p className="mt-2 text-sm text-slate-400">Aucun résultat structuré n'est disponible pour ce traitement.</p>}
                </div>
              )}
            </div>
          )}
        </section>
      )}

      {section === 'transcripts' && (
        <section className="space-y-5">
          <PageHeading title="Transcriptions" subtitle="Sources réellement enregistrées par réunion, avec accès au texte original." />
          {transcripts.length === 0 && !busy ? <EmptyState text="Aucune transcription disponible dans les réunions enregistrées." /> : (
            <div className="grid gap-4 lg:grid-cols-[0.85fr_1.15fr]">
              <div className="space-y-2">
                {transcripts.map((row) => (
                  <button key={row.transcript.id} onClick={() => void loadTranscript(row.meeting, row.transcript)} className="w-full rounded-xl border border-slate-800 bg-slate-900 p-4 text-left hover:border-emerald-800">
                    <div className="flex justify-between gap-3"><span className="font-medium text-white">{row.meeting.title}</span><StatusPill value={row.transcript.status} /></div>
                    <p className="mt-2 text-xs text-slate-400">{row.transcript.contentFormat} · {dateLabel(row.transcript.retrievedAt)}</p>
                  </button>
                ))}
              </div>
              <div className={cardClass}>
                <h2 className="font-semibold text-white">{selectedTranscript ? `Transcription · ${selectedTranscript.contentFormat}` : 'Sélectionnez une transcription'}</h2>
                {selectedTranscript && <pre className="mt-4 max-h-[34rem] overflow-auto whitespace-pre-wrap text-xs leading-6 text-slate-300">{selectedTranscript.content || 'Contenu non disponible.'}</pre>}
              </div>
            </div>
          )}
        </section>
      )}

      {section === 'reports' && (
        <section className="space-y-5">
          <PageHeading title="Comptes rendus" subtitle="Rapports du tenant chargés depuis l’API, validation humaine et publication SharePoint." />
          {reports.length === 0 && !busy ? <EmptyState text="Aucun compte rendu n'a été produit." /> : (
            <div className="grid gap-4 lg:grid-cols-[0.8fr_1.2fr]">
              <div className="space-y-2">
                {reports.map((row) => (
                  <button key={row.report.id} onClick={() => void openReport(row)} className="w-full rounded-xl border border-slate-800 bg-slate-900 p-4 text-left hover:border-emerald-800">
                    <div className="flex items-start justify-between gap-3"><span className="font-medium text-white">{row.report.title}</span><StatusPill value={row.report.approvalStatus} /></div>
                    <p className="mt-2 text-xs text-slate-400">{row.meeting.title} · {dateLabel(row.report.generatedAt)}</p>
                    <p className="mt-2 line-clamp-2 text-xs text-slate-400">{row.report.referenceNumber}</p>
                  </button>
                ))}
              </div>
              {selectedReport ? (
                <div className={`${cardClass} space-y-4`}>
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div>
                      <h2 className="font-semibold text-white">Relecture humaine</h2>
                      <p className="mt-1 text-xs text-slate-400">{selectedReport.referenceNumber} · {statusLabel(selectedReport.approvalStatus)}</p>
                    </div>
                    <StatusPill value={selectedReport.approvalStatus} />
                  </div>
                  <label className="block text-xs font-medium text-slate-300">Titre<input disabled={!isSelectedReportEditable} value={selectedReport.title} onChange={(event) => setSelectedReport({ ...selectedReport, title: event.target.value })} className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-white disabled:opacity-70" /></label>
                  <label className="block text-xs font-medium text-slate-300">Synthèse exécutive<textarea disabled={!isSelectedReportEditable} value={selectedReport.executiveSummary} onChange={(event) => setSelectedReport({ ...selectedReport, executiveSummary: event.target.value })} rows={4} className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm leading-6 text-white disabled:opacity-70" /></label>
                  <label className="block text-xs font-medium text-slate-300">Décisions<textarea disabled={!isSelectedReportEditable} value={selectedReport.decisionsAgreed} onChange={(event) => setSelectedReport({ ...selectedReport, decisionsAgreed: event.target.value })} rows={3} className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm leading-6 text-white disabled:opacity-70" /></label>
                  <label className="block text-xs font-medium text-slate-300">Points abordés<textarea disabled={!isSelectedReportEditable} value={selectedReport.keyDiscussionPoints} onChange={(event) => setSelectedReport({ ...selectedReport, keyDiscussionPoints: event.target.value })} rows={3} className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm leading-6 text-white disabled:opacity-70" /></label>
                  <label className="block text-xs font-medium text-slate-300">Contenu structuré JSON<textarea disabled={!isSelectedReportEditable} value={selectedReport.structuredContentJson ?? ''} onChange={(event) => setSelectedReport({ ...selectedReport, structuredContentJson: event.target.value })} rows={10} spellCheck={false} className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 font-mono text-xs leading-5 text-slate-200 disabled:opacity-70" /></label>
                  <label className="block text-xs font-medium text-slate-300">Motif de rejet (obligatoire en cas de rejet)<textarea disabled={!isSelectedReportEditable} value={selectedReport.rejectionReason ?? ''} onChange={(event) => setSelectedReport({ ...selectedReport, rejectionReason: event.target.value })} rows={3} className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm leading-6 text-white disabled:opacity-70" /></label>
                  <p className="text-xs text-slate-400">La validation, le rejet et la publication exigent le rôle Entra ID <code>ReadMeeting.ReportValidator</code>. L’API vérifie toujours ce rôle.</p>
                  {selectedReport.sharePointPublicationError && (
                    <p role="alert" className="rounded-lg border border-rose-800 bg-rose-950/50 p-3 text-sm text-rose-200">
                      Échec de publication : {selectedReport.sharePointPublicationError}
                    </p>
                  )}
                  {selectedReport.approvalStatus === 'Published' && selectedReport.sharePointDocxUrl && (
                    <div className="rounded-lg border border-emerald-900 bg-emerald-950/30 p-3 text-sm">
                      <a href={selectedReport.sharePointDocxUrl} target="_blank" rel="noopener noreferrer" className="font-medium text-emerald-300 underline">
                        Ouvrir le document SharePoint publié
                      </a>
                      <p className="mt-1 text-xs text-slate-400">
                        Publié le {dateLabel(selectedReport.sharePointPublishedAt)} · {selectedReport.sharePointPublishedBy || 'Utilisateur non renseigné'}
                        {selectedReport.sharePointVersion ? ` · Version ${selectedReport.sharePointVersion}` : ''}
                      </p>
                    </div>
                  )}
                  {(selectedReport.approvalStatus === 'Approved' || selectedReport.approvalStatus === 'PublicationFailed') && (
                    <div className="space-y-3 rounded-lg border border-slate-800 bg-slate-950/60 p-4">
                      <h3 className="text-sm font-semibold text-slate-200">Destination SharePoint accessible</h3>
                      <p className="text-xs text-slate-400">La sélection est facultative si la destination DSI est configurée côté serveur. Les choix sont vérifiés par Microsoft Graph avant l’envoi.</p>
                      <div className="grid gap-3 md:grid-cols-[1fr_auto]">
                        <input value={sharePointSearch} onChange={(event) => setSharePointSearch(event.target.value)} placeholder="Rechercher un site SharePoint" className="rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-white" />
                        <button className={secondaryButtonClass} disabled={sharePointBusy || !sharePointSearch.trim()} onClick={() => void searchSharePointSites()}>
                          {sharePointBusy ? 'Chargement…' : 'Rechercher'}
                        </button>
                      </div>
                      <div className="grid gap-3 md:grid-cols-3">
                        <label className="text-xs text-slate-300">Site
                          <select value={selectedSharePointSiteId} onChange={(event) => void loadSharePointDrives(event.target.value)} className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-white">
                            <option value="">Destination configurée</option>
                            {sharePointSites.map((site) => <option key={site.id} value={site.id}>{site.name}</option>)}
                          </select>
                        </label>
                        <label className="text-xs text-slate-300">Bibliothèque
                          <select value={selectedSharePointDriveId} onChange={(event) => void loadSharePointFolders(event.target.value)} className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-white">
                            <option value="">Bibliothèque configurée</option>
                            {sharePointDrives.map((drive) => <option key={drive.id} value={drive.id}>{drive.name}</option>)}
                          </select>
                        </label>
                        <label className="text-xs text-slate-300">Dossier
                          <select value={selectedSharePointFolderId} onChange={(event) => setSelectedSharePointFolderId(event.target.value)} className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-white">
                            <option value="">Dossier configuré</option>
                            <option value="root">Racine de la bibliothèque</option>
                            {sharePointFolders.map((folder) => <option key={folder.id} value={folder.id}>{folder.name}</option>)}
                          </select>
                        </label>
                      </div>
                    </div>
                  )}
                  <div className="flex flex-wrap justify-end gap-2">
                    {selectedReport.approvalStatus === 'Draft' && (
                      <button className={secondaryButtonClass} disabled={savingReport || !isReportValidator} onClick={() => void saveReport('UnderReview')}>Soumettre en relecture</button>
                    )}
                    {selectedReport.approvalStatus === 'UnderReview' && (
                      <>
                        <button className={secondaryButtonClass} disabled={savingReport || !isReportValidator || !selectedReport.rejectionReason?.trim()} onClick={() => void saveReport('Rejected')}>Rejeter</button>
                        <button className={buttonClass} disabled={savingReport || !isReportValidator} onClick={() => void saveReport('Approved')}>{savingReport ? 'Enregistrement…' : 'Approuver'}</button>
                      </>
                    )}
                    {['Approved', 'Rejected', 'PublicationFailed'].includes(selectedReport.approvalStatus) && (
                      <button className={secondaryButtonClass} disabled={savingReport || !isReportValidator} onClick={() => void saveReport('UnderReview')}>Rouvrir en relecture</button>
                    )}
                    {['Approved', 'PublicationFailed'].includes(selectedReport.approvalStatus) && (
                      <button className={buttonClass} disabled={publishingReport || !isReportValidator} onClick={() => void publishSelectedReport()}>
                        {publishingReport ? 'Publication en cours…' : selectedReport.approvalStatus === 'PublicationFailed' ? 'Réessayer la publication' : 'Publier sur SharePoint'}
                      </button>
                    )}
                  </div>
                </div>
              ) : <div className={cardClass}><p className="text-sm text-slate-400">Sélectionnez un compte rendu pour le relire.</p></div>}
            </div>
          )}
        </section>
      )}

      {section === 'decisions' && (
        <section className="space-y-5">
          <PageHeading title="Décisions" subtitle="Décisions et propositions reliées aux réunions sources." />
          <p className="text-xs text-slate-400">La correction des décisions nécessite le rôle Entra ID <code>ReadMeeting.ReportValidator</code>.</p>
          {decisions.length === 0 && !busy ? <EmptyState text="Aucune décision ni proposition n'a été enregistrée." /> : (
            <div className="grid gap-3 md:grid-cols-2">
              {decisions.map((row) => (
                <article key={row.decision.id} className={`${cardClass} space-y-3`}>
                  <label className="block text-xs font-medium text-slate-300">Texte<input value={row.decision.text} onChange={(event) => updateDecision(row.decision.id, { text: event.target.value })} className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-white" /></label>
                  <div className="grid gap-3 sm:grid-cols-2">
                    <label className="block text-xs font-medium text-slate-300">Qualification<select value={row.decision.status} onChange={(event) => updateDecision(row.decision.id, { status: event.target.value as DecisionSummary['status'] })} className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-white">{['Proposed', 'Confirmed', 'Decided', 'Rejected', 'Reported', 'ToConfirm'].map((status) => <option key={status} value={status}>{statusLabel(status)}</option>)}</select></label>
                    <label className="block text-xs font-medium text-slate-300">Mode de décision<select value={row.decision.decisionType} onChange={(event) => updateDecision(row.decision.id, { decisionType: event.target.value as DecisionSummary['decisionType'] })} className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-white">{['Consensus', 'Vote', 'ChairDecision', 'ExternalValidation', 'Unspecified'].map((type) => <option key={type} value={type}>{statusLabel(type)}</option>)}</select></label>
                  </div>
                  <label className="block text-xs font-medium text-slate-300">Validée par<input value={row.decision.approvedByName ?? ''} onChange={(event) => updateDecision(row.decision.id, { approvedByName: event.target.value || null })} className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-white" /></label>
                  <div className="flex items-center justify-between gap-3 pt-1">
                    <button onClick={() => { onSelectMeeting(row.meeting.id); onNavigate('meetings'); }} className="text-left text-xs text-emerald-300 hover:text-emerald-200">{row.meeting.title}</button>
                    <button className={secondaryButtonClass} disabled={savingItemId === row.decision.id} onClick={() => void saveDecision(row)}>{savingItemId === row.decision.id ? 'Enregistrement…' : 'Enregistrer la décision'}</button>
                  </div>
                </article>
              ))}
            </div>
          )}
        </section>
      )}

      {section === 'actions' && (
        <section className="space-y-5">
          <PageHeading title="Actions à suivre" subtitle="Actions enregistrées, échéances et responsables explicitement identifiés." />
          <p className="text-xs text-slate-400">La correction des actions nécessite le rôle Entra ID <code>ReadMeeting.ReportValidator</code>.</p>
          {actions.length === 0 && !busy ? <EmptyState text="Aucune action n'a été enregistrée." /> : (
            <div className="grid gap-4">
              {actions.map((row) => (
                <article key={row.action.id} className={`${cardClass} space-y-3`}>
                  <p className="text-xs text-emerald-300">{row.meeting.title}</p>
                  <div className="grid gap-3 md:grid-cols-2">
                    <label className="block text-xs font-medium text-slate-300">Intitulé<input value={row.action.title ?? ''} onChange={(event) => updateAction(row.action.id, { title: event.target.value || null })} className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-white" /></label>
                    <label className="block text-xs font-medium text-slate-300">Responsable<input value={row.action.assigneeName ?? ''} onChange={(event) => updateAction(row.action.id, { assigneeName: event.target.value || null })} className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-white" /></label>
                  </div>
                  <label className="block text-xs font-medium text-slate-300">Description<textarea value={row.action.description} onChange={(event) => updateAction(row.action.id, { description: event.target.value })} rows={2} className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm leading-6 text-white" /></label>
                  <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
                    <label className="block text-xs font-medium text-slate-300">Courriel du responsable<input type="email" value={row.action.assigneeEmail ?? ''} onChange={(event) => updateAction(row.action.id, { assigneeEmail: event.target.value || null })} className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-white" /></label>
                    <label className="block text-xs font-medium text-slate-300">Échéance<input type="datetime-local" value={toDateTimeLocal(row.action.dueDate)} onChange={(event) => updateAction(row.action.id, { dueDate: event.target.value ? new Date(event.target.value).toISOString() : null })} className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-white" /></label>
                    <label className="block text-xs font-medium text-slate-300">Échéance mentionnée<input value={row.action.deadlineText ?? ''} onChange={(event) => updateAction(row.action.id, { deadlineText: event.target.value || null })} className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-white" /></label>
                    <label className="block text-xs font-medium text-slate-300">Statut<select value={row.action.status} onChange={(event) => updateAction(row.action.id, { status: event.target.value as ActionItemSummary['status'] })} className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-white">{['Pending', 'InProgress', 'Completed', 'Deferred'].map((status) => <option key={status} value={status}>{statusLabel(status)}</option>)}</select></label>
                    <label className="block text-xs font-medium text-slate-300">Priorité<select value={row.action.priority} onChange={(event) => updateAction(row.action.id, { priority: event.target.value as ActionItemSummary['priority'] })} className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-white">{['Low', 'Medium', 'High', 'Critical'].map((priority) => <option key={priority} value={priority}>{statusLabel(priority)}</option>)}</select></label>
                  </div>
                  <div className="flex justify-end">
                    <button className={secondaryButtonClass} disabled={savingItemId === row.action.id} onClick={() => void saveAction(row)}>{savingItemId === row.action.id ? 'Enregistrement…' : 'Enregistrer l’action'}</button>
                  </div>
                </article>
              ))}
            </div>
          )}
        </section>
      )}

      {section === 'settings' && (
        <section className="space-y-5">
          <PageHeading title="Paramètres" subtitle="État des intégrations serveur et dépendances de configuration." />
          <div className="grid gap-4 md:grid-cols-2">
            <div className={cardClass}>
              <h2 className="font-semibold text-white">Moteur Google Gemini</h2>
              <div className="mt-3"><StatusPill value={aiStatus?.configured ? 'Configured' : 'NotConfigured'} /></div>
              <p className="mt-3 text-sm leading-6 text-slate-400">
                État du service IA côté serveur : {aiStatus
                  ? aiStatus.configured ? 'configuré' : 'non configuré'
                  : 'indisponible'}.
                {aiStatus?.model && <> Modèle Gemini actif : <span className="font-mono text-slate-300">{aiStatus.model}</span>.</>}
                {' '}La clé API n’est jamais transmise à cette interface.
              </p>
            </div>
            <div className={cardClass}><h2 className="font-semibold text-white">Persistance et sécurité</h2><p className="mt-3 text-sm leading-6 text-slate-400">Les API ReadMeeting appliquent l’isolation par tenant à partir des claims Entra ID. La disponibilité réelle de la base dépend de la chaîne ConnectionStrings__DefaultConnection fournie à l’API.</p></div>
          </div>
        </section>
      )}
    </div>
  );
};

const DashboardSection: React.FC<{
  dashboard: GraphDashboardData | null;
  loading: boolean;
  error: string | null;
  transcriptCheckProgress: TranscriptCheckProgress;
  upcomingError: string | null;
  upcomingRefreshing: boolean;
  onRefresh: () => void;
}> = ({
  dashboard,
  loading,
  error,
  transcriptCheckProgress,
  upcomingError,
  upcomingRefreshing,
  onRefresh,
}) => {
  const now = new Date();
  const formatLocalDateTime = (value: string) =>
    new Intl.DateTimeFormat('fr-FR', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(value));

  return (
    <section className="space-y-6">
      <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-end">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-emerald-400">Microsoft 365 · Calendrier Outlook</p>
          <h1 className="mt-1 text-2xl font-semibold text-white">Tableau de bord</h1>
          <p className="mt-1 text-sm text-slate-400">Données du compte Microsoft 365 connecté, récupérées depuis Microsoft Graph.</p>
        </div>
        <button type="button" className={secondaryButtonClass} onClick={onRefresh} disabled={loading}>
          {loading ? 'Actualisation…' : 'Actualiser les données'}
        </button>
      </div>

      {error && <div role="alert" className="rounded-lg border border-rose-800 bg-rose-950/70 px-4 py-3 text-sm text-rose-200">Microsoft Graph n’a pas permis de charger le tableau de bord : {error}</div>}
      {!dashboard && loading && <p role="status" className="text-sm text-slate-400">Chargement du calendrier, du profil Microsoft et des statuts de transcription confirmés par Graph…</p>}
      {!dashboard && !loading && error && <p className="text-sm text-slate-400">Aucune valeur n’est affichée tant que le calendrier réel n’a pas été chargé.</p>}

      {dashboard && (
        <>
          <p className="text-xs text-slate-500">
            Données annuelles actualisées le {formatLocalDateTime(dashboard.refreshedAt)} · fuseau local du navigateur.
          </p>
          {loading && (
            <p role="status" className="text-xs text-slate-400">
              Actualisation en cours{transcriptCheckProgress.total > 0
                ? ` — vérification des transcriptions ${transcriptCheckProgress.completed}/${transcriptCheckProgress.total}`
                : ''}…
            </p>
          )}

          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            <Metric label={`Réunions inscrites en ${dashboard.year}`} value={dashboard.meetingsThisYear} />
            <Metric label="Réunions organisées par moi" value={dashboard.meetingsOrganized} />
            <Metric label="Réunions où je suis invité(e) (pas une preuve de présence)" value={dashboard.meetingsInvited} />
            <Metric label="Transcriptions disponibles (métadonnées Graph confirmées)" value={dashboard.transcriptsAvailable} />
            <Metric
              label="Moyenne des participants — organisateur et ressources exclus"
              value={dashboard.averageParticipants === null ? '—' : dashboard.averageParticipants.toFixed(1)}
              detail={`${dashboard.averageParticipantMeetingCount} réunion(s) avec une liste de participants exploitable`}
            />
            <Metric label="Réunions à venir dans la prochaine heure" value={dashboard.upcomingMeetings.length} />
          </div>

          <div className={cardClass}>
            <h2 className="font-semibold text-white">État des vérifications de transcription</h2>
            <p className="mt-1 text-xs text-slate-400">
              Seules les métadonnées retournées par Graph sont comptées comme disponibles; le contenu des transcriptions n’est pas téléchargé ici.
              Vérifications terminées : {dashboard.transcriptChecks}.
            </p>
            {dashboard.transcriptPermissionMessage && (
              <p role="status" className="mt-3 rounded-lg border border-amber-800 bg-amber-950/40 p-3 text-sm text-amber-200">
                {dashboard.transcriptPermissionMessage}
              </p>
            )}
            {dashboard.transcriptChecks === 0 ? (
              <p className="mt-4 text-sm text-slate-400">Aucune réunion Teams terminée et vérifiable dans l’année.</p>
            ) : (
              <div className="mt-4 grid gap-3 text-sm sm:grid-cols-2 lg:grid-cols-4">
                <Metric label="Transcription indisponible" value={dashboard.transcriptsUnavailable} />
                <Metric label="Autorisation manquante" value={dashboard.transcriptPermissionMissing} />
                <Metric label="Réunion Teams non résolue" value={dashboard.transcriptUnresolved} />
                <Metric label="Accès refusé / partage restreint" value={dashboard.transcriptAccessRefused} />
                <Metric label="Erreur d’authentification Graph" value={dashboard.transcriptAuthenticationErrors} />
                <Metric label="Erreur temporaire / limitation Graph" value={dashboard.transcriptTemporaryErrors} />
                <Metric label="Transcription en attente" value={dashboard.transcriptPending} />
              </div>
            )}
          </div>

          <div className={cardClass}>
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <h2 className="font-semibold text-white">Réunions à venir dans la prochaine heure</h2>
                <p className="mt-1 text-xs text-slate-400">
                  Agenda actualisé le {formatLocalDateTime(dashboard.upcomingRefreshedAt)}.
                  {upcomingRefreshing && ' Actualisation automatique en cours…'}
                </p>
              </div>
            </div>
            {upcomingError && <p role="alert" className="mt-4 rounded-lg border border-rose-800 bg-rose-950/50 p-3 text-sm text-rose-200">{upcomingError}</p>}
            {dashboard.upcomingMeetings.length === 0 ? (
              <p className="mt-4 text-sm text-slate-400">Aucune réunion ne commence ou n’est en cours dans la prochaine heure.</p>
            ) : (
              <div className="mt-4 divide-y divide-slate-800">
                {dashboard.upcomingMeetings.map((meeting) => {
                  const start = new Date(meeting.start);
                  const end = meeting.end ? new Date(meeting.end) : null;
                  const inProgress = start <= now && Boolean(end && end > now);
                  return (
                    <article key={meeting.id} className="py-4">
                      <div className="flex flex-wrap items-start justify-between gap-2">
                        <h3 className="font-medium text-white">{meeting.subject}</h3>
                        <span className="rounded-full border border-slate-700 px-2 py-1 text-xs text-slate-300">{inProgress ? 'En cours' : 'À venir'}</span>
                      </div>
                      <dl className="mt-3 grid gap-2 text-sm sm:grid-cols-2">
                        <Detail label="Début" value={formatLocalDateTime(meeting.start)} />
                        <Detail label="Fin" value={meeting.end ? formatLocalDateTime(meeting.end) : 'Non renseignée par Graph'} />
                        <Detail label="Organisateur" value={[meeting.organizerName, meeting.organizerEmail].filter(Boolean).join(' · ') || 'Non renseigné par Graph'} />
                        <Detail label="Type" value={meeting.type} />
                        <Detail label="Lieu" value={meeting.location || 'Non renseigné par Graph'} />
                        <Detail label="Participants (organisateur et ressources exclus)" value={meeting.participantCount === null ? 'Non renseigné par Graph' : String(meeting.participantCount)} />
                      </dl>
                      <p className="mt-2 text-xs text-slate-400">
                        Participants : {meeting.participants.length
                          ? meeting.participants.map((person) => person.name || person.email || 'Participant sans identité fournie').join(', ')
                          : 'Liste non renseignée par Graph'}
                      </p>
                      {meeting.joinWebUrl && (
                        <a className="mt-3 inline-block text-sm text-emerald-300 underline hover:text-emerald-200" href={meeting.joinWebUrl} target="_blank" rel="noreferrer">
                          Rejoindre dans Teams
                        </a>
                      )}
                    </article>
                  );
                })}
              </div>
            )}
          </div>
        </>
      )}
    </section>
  );
};

const Metric: React.FC<{ label: string; value: number | string; detail?: string }> = ({ label, value, detail }) => (
  <article className={cardClass}><p className="text-sm text-slate-400">{label}</p><p className="mt-3 text-3xl font-semibold tracking-tight text-white">{value}</p>{detail && <p className="mt-2 text-xs text-slate-500">{detail}</p>}</article>
);

const PageHeading: React.FC<{ title: string; subtitle: string }> = ({ title, subtitle }) => (
  <div><p className="text-xs font-semibold uppercase tracking-[0.18em] text-emerald-400">ReadMeeting.ai · DGF</p><h1 className="mt-1 text-2xl font-semibold text-white">{title}</h1><p className="mt-1 text-sm text-slate-400">{subtitle}</p></div>
);

const EmptyState: React.FC<{ text: string }> = ({ text }) => <div className={cardClass}><p className="text-sm text-slate-400">{text}</p></div>;

const Detail: React.FC<{ label: string; value: string }> = ({ label, value }) => <div><dt className="text-xs text-slate-500">{label}</dt><dd className="mt-1 text-slate-200">{value}</dd></div>;

const StatusPill: React.FC<{ value: string }> = ({ value }) => {
  const tone = ['Succeeded', 'Completed', 'Approved', 'Published', 'Configured', 'Confirmed', 'Decided'].includes(value)
    ? 'border-emerald-800 bg-emerald-950 text-emerald-300'
    : ['Failed', 'FailedPermanent', 'FailedRetryable', 'PublicationFailed', 'Rejected', 'NotConfigured'].includes(value)
      ? 'border-rose-800 bg-rose-950 text-rose-300'
      : ['Draft', 'UnderReview', 'Proposed', 'Queued', 'Pending'].includes(value)
        ? 'border-amber-800 bg-amber-950 text-amber-200'
        : value === 'Publishing'
          ? 'border-sky-800 bg-sky-950 text-sky-200'
        : 'border-slate-700 bg-slate-800 text-slate-300';
  return <span className={`inline-flex shrink-0 rounded-full border px-2.5 py-1 text-[11px] font-medium ${tone}`}>{statusLabel(value)}</span>;
};

const PipelineStep: React.FC<{ label: string; complete: boolean }> = ({ label, complete }) => (
  <li className="flex items-center gap-3 text-sm"><span className={`h-2.5 w-2.5 rounded-full ${complete ? 'bg-emerald-400' : 'bg-slate-700'}`} /><span className={complete ? 'text-slate-200' : 'text-slate-500'}>{label}</span></li>
);

const StructuredAnalysisView: React.FC<{ json: string }> = ({ json }) => {
  let result: StructuredAnalysis;
  try {
    result = JSON.parse(json) as StructuredAnalysis;
  } catch {
    return <p role="alert" className="mt-3 text-sm text-rose-300">Le résultat structuré enregistré est illisible.</p>;
  }

  return (
    <div className="mt-4 grid gap-4 xl:grid-cols-2">
      <article className="rounded-lg border border-slate-800 bg-slate-950 p-4 xl:col-span-2">
        <h3 className="text-sm font-semibold text-emerald-300">Résumé exécutif</h3>
        <p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-slate-200">{result.executiveSummary}</p>
        {result.context && <p className="mt-3 text-xs leading-5 text-slate-400">Contexte : {result.context}</p>}
        <Evidence references={result.summaryEvidence} />
      </article>
      <ExtractionSection title="Sujets abordés" items={result.topics.map((item) => ({ text: `${item.title} — ${item.summary}`, evidence: item.evidence }))} />
      <ExtractionSection title="Faits importants" items={result.facts} />
      <ExtractionSection title="Propositions" items={result.proposals} />
      <ExtractionSection title="Décisions identifiées" items={result.decisions} />
      <ExtractionSection title="Risques et points de vigilance" items={result.risks} />
      <ExtractionSection title="Réserves et désaccords" items={result.reservations} />
      <ExtractionSection title="Points non résolus" items={result.unresolved} />
      <article className="rounded-lg border border-slate-800 bg-slate-950 p-4">
        <h3 className="text-sm font-semibold text-white">Actions et responsables</h3>
        {result.actions.length === 0 ? <p className="mt-2 text-xs text-slate-500">Aucune action explicitement extraite.</p> : result.actions.map((item, index) => (
          <div key={`${item.description}-${index}`} className="mt-3 border-t border-slate-800 pt-3">
            <p className="text-sm text-slate-200">{item.description}</p>
            <p className="mt-1 text-xs text-slate-400">Responsable : {item.responsible || 'Non précisé'} · Échéance : {item.deadlineText || 'Non précisée'}</p>
            <Evidence references={item.evidence} />
          </div>
        ))}
      </article>
      <article className="rounded-lg border border-slate-800 bg-slate-950 p-4">
        <h3 className="text-sm font-semibold text-white">Participants explicitement identifiés</h3>
        {result.participants.length === 0 ? <p className="mt-2 text-xs text-slate-500">Aucun participant identifiable dans la source.</p> : result.participants.map((item) => (
          <div key={item.name} className="mt-3 border-t border-slate-800 pt-3"><p className="text-sm text-slate-200">{item.name}</p><Evidence references={[item.evidence]} /></div>
        ))}
      </article>
    </div>
  );
};

const ExtractionSection: React.FC<{ title: string; items: TextExtraction[] }> = ({ title, items }) => (
  <article className="rounded-lg border border-slate-800 bg-slate-950 p-4">
    <h3 className="text-sm font-semibold text-white">{title}</h3>
    {items.length === 0 ? <p className="mt-2 text-xs text-slate-500">Aucun élément explicitement extrait.</p> : items.map((item, index) => (
      <div key={`${item.text}-${index}`} className="mt-3 border-t border-slate-800 pt-3"><p className="text-sm leading-5 text-slate-200">{item.text}</p><Evidence references={item.evidence} /></div>
    ))}
  </article>
);

const Evidence: React.FC<{ references: EvidenceReference[] }> = ({ references }) => (
  <div className="mt-2 space-y-1">
    {references.map((reference, index) => (
      <blockquote key={`${reference.quote}-${index}`} className="border-l-2 border-emerald-700 pl-2 text-xs leading-5 text-slate-400">
        {reference.timestamp && <span className="mr-2 font-mono text-emerald-500">{reference.timestamp}</span>}
        « {reference.quote} »
      </blockquote>
    ))}
  </div>
);
