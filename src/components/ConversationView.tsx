import React, { useMemo, useState } from 'react';
import { ArrowUp, FileText, LoaderCircle, MessageSquareText, Sparkles } from 'lucide-react';
import { MeetingItem } from '../types/meeting';
import { TranscriptCheckResult } from '../types/transcript';
import {
  MeetingAnalysis,
  MeetingAnalysisEvidence,
  TranscriptChatTurn,
  TranscriptChatResponse,
  TeamsTranscriptAnalysisResult,
} from '../services/meetingApiClient';

export interface ConversationMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  answerable?: boolean;
  citations?: MeetingAnalysisEvidence[];
  analysis?: MeetingAnalysis;
  modelUsed?: string;
  notPersisted?: boolean;
}

export interface ConversationSession {
  id: string;
  title: string;
  meetingId: string | null;
  messages: ConversationMessage[];
}

interface ConversationViewProps {
  meetings: MeetingItem[];
  activeConversationId: string;
  conversations: ConversationSession[];
  setConversations: React.Dispatch<React.SetStateAction<ConversationSession[]>>;
  initialMeetingId: string | null;
  onSelectMeeting: (id: string) => void;
  onCheckTranscript: (meeting: MeetingItem, forceRefresh?: boolean) => Promise<TranscriptCheckResult>;
  onAskQuestion: (
    meeting: MeetingItem,
    transcript: TranscriptCheckResult,
    question: string,
    history: TranscriptChatTurn[]
  ) => Promise<TranscriptChatResponse>;
  onAnalyzeMeeting: (
    meeting: MeetingItem,
    transcript: TranscriptCheckResult
  ) => Promise<TeamsTranscriptAnalysisResult>;
}

const promptSuggestions = [
  { title: 'Analyser une réunion', prompt: 'Analyser la réunion et produire une synthèse structurée.' , action: 'analysis' as const },
  { title: 'Produire un compte rendu', prompt: 'Préparer un compte rendu institutionnel provisoire à partir des éléments établis.', action: 'analysis' as const },
  { title: 'Extraire les décisions et actions', prompt: 'Quelles décisions sont explicitement prises et quelles actions sont confiées ? Distingue les propositions des décisions.', action: 'question' as const },
  { title: 'Identifier les risques et blocages', prompt: 'Quels risques, réserves et points non résolus sont explicitement mentionnés ?', action: 'question' as const },
];

const makeId = () => globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(16).slice(2)}`;

const EvidenceList: React.FC<{ items: MeetingAnalysisEvidence[] }> = ({ items }) => (
  items.length ? (
    <ul className="mt-2 space-y-1.5">
      {items.map((item, index) => (
        <li key={`${item.quote}-${index}`} className="border-l-2 border-emerald-800 pl-2.5 text-[11px] leading-5 text-slate-400">
          « {item.quote} »{item.timestamp ? <span className="ml-1 text-slate-500">· {item.timestamp}</span> : null}
        </li>
      ))}
    </ul>
  ) : null
);

const AnalysisCard: React.FC<{ analysis: MeetingAnalysis; modelUsed?: string; notPersisted?: boolean }> = ({
  analysis,
  modelUsed,
  notPersisted,
}) => (
  <div className="mt-3 space-y-4 rounded-xl border border-slate-700 bg-[#10161e] p-4 text-xs leading-5">
    <div className="flex flex-wrap items-center justify-between gap-2">
      <h3 className="font-semibold text-emerald-200">Analyse structurée · brouillon</h3>
      <span className="text-[10px] text-slate-500">{modelUsed ? `Modèle ${modelUsed}` : ''}{notPersisted ? ' · aperçu non enregistré' : ''}</span>
    </div>
    <section>
      <h4 className="font-semibold text-slate-200">Résumé exécutif</h4>
      <p className="mt-1 whitespace-pre-wrap text-slate-300">{analysis.executiveSummary}</p>
      <EvidenceList items={analysis.summaryEvidence} />
    </section>
    {analysis.context && <section><h4 className="font-semibold text-slate-200">Contexte</h4><p className="mt-1 text-slate-300">{analysis.context}</p></section>}
    <section>
      <h4 className="font-semibold text-slate-200">Sujets abordés</h4>
      <div className="mt-2 space-y-2">
        {analysis.topics.map((topic, index) => (
          <div key={`${topic.title}-${index}`} className="rounded-lg border border-slate-800 bg-slate-900/60 p-3">
            <p className="font-medium text-slate-100">{topic.title}</p>
            <p className="mt-1 text-slate-400">{topic.summary}</p>
            <EvidenceList items={topic.evidence} />
          </div>
        ))}
        {analysis.topics.length === 0 && <p className="text-slate-500">Aucun sujet exploitable extrait.</p>}
      </div>
    </section>
    <AnalysisItems title="Faits établis" items={analysis.facts} />
    <AnalysisItems title="Propositions" items={analysis.proposals} />
    <AnalysisItems title="Décisions identifiées" items={analysis.decisions} />
    <section>
      <h4 className="font-semibold text-slate-200">Actions</h4>
      <div className="mt-2 space-y-2">
        {analysis.actions.map((action, index) => (
          <div key={`${action.description}-${index}`} className="rounded-lg border border-slate-800 bg-slate-900/60 p-3">
            <p className="text-slate-200">{action.description}</p>
            <p className="mt-1 text-[11px] text-slate-500">Responsable : {action.responsible || 'Non précisé'} · Échéance : {action.deadlineText || 'Non précisée'}</p>
            <EvidenceList items={action.evidence} />
          </div>
        ))}
        {analysis.actions.length === 0 && <p className="text-slate-500">Aucune action attribuable identifiée.</p>}
      </div>
    </section>
    <AnalysisItems title="Risques et points de vigilance" items={analysis.risks} />
    <AnalysisItems title="Réserves et désaccords" items={analysis.reservations} />
    <AnalysisItems title="Points non résolus" items={analysis.unresolved} />
    <details className="rounded-lg border border-slate-800 p-3">
      <summary className="cursor-pointer font-medium text-slate-300">Participants et structure complète</summary>
      <div className="mt-3 space-y-2">
        {analysis.participants.map((participant, index) => (
          <div key={`${participant.name}-${index}`}><span className="text-slate-200">{participant.name}</span><EvidenceList items={[participant.evidence]} /></div>
        ))}
        <pre className="max-h-80 overflow-auto whitespace-pre-wrap break-words text-[10px] text-slate-500">{JSON.stringify(analysis, null, 2)}</pre>
      </div>
    </details>
  </div>
);

const AnalysisItems: React.FC<{ title: string; items: { text: string; evidence: MeetingAnalysisEvidence[] }[] }> = ({ title, items }) => (
  <section>
    <h4 className="font-semibold text-slate-200">{title}</h4>
    {items.length ? (
      <ul className="mt-2 space-y-2">
        {items.map((item, index) => (
          <li key={`${item.text}-${index}`} className="rounded-lg border border-slate-800 bg-slate-900/60 p-3">
            <p className="text-slate-300">{item.text}</p><EvidenceList items={item.evidence} />
          </li>
        ))}
      </ul>
    ) : <p className="mt-1 text-slate-500">Aucun élément identifié.</p>}
  </section>
);

export const ConversationView: React.FC<ConversationViewProps> = ({
  meetings,
  activeConversationId,
  conversations,
  setConversations,
  initialMeetingId,
  onSelectMeeting,
  onCheckTranscript,
  onAskQuestion,
  onAnalyzeMeeting,
}) => {
  const [composer, setComposer] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sourceState, setSourceState] = useState<string | null>(null);
  const session = conversations.find((item) => item.id === activeConversationId);
  const meetingId = session?.meetingId ?? initialMeetingId ?? '';
  const meeting = meetings.find((item) => item.id === meetingId) ?? null;
  const recentTurns = useMemo(() => (session?.messages ?? []).slice(-12), [session?.messages]);

  const updateSession = (updater: (current: ConversationSession) => ConversationSession) => {
    setConversations((items) => items.map((item) => item.id === activeConversationId ? updater(item) : item));
  };

  const setContextMeeting = (id: string) => {
    onSelectMeeting(id);
    updateSession((current) => ({ ...current, meetingId: id }));
    setSourceState(null);
  };

  const getTranscript = async (target: MeetingItem) => {
    setSourceState('Vérification de la transcription Teams via Microsoft Graph…');
    const result = await onCheckTranscript(target, true);
    if (!result.content?.rawContent || !result.metadata?.id) {
      throw new Error(result.error?.message || 'Aucune transcription réelle accessible pour cette réunion.');
    }
    setSourceState(`Transcription récupérée via Graph · ${result.content.totalWords.toLocaleString('fr-FR')} mots.`);
    return result;
  };

  const addUserMessage = (content: string) => {
    const message: ConversationMessage = { id: makeId(), role: 'user', content };
    updateSession((current) => ({
      ...current,
      title: current.messages.some((item) => item.role === 'user') ? current.title : content.slice(0, 52),
      messages: [...current.messages, message],
    }));
  };

  const askQuestion = async (question: string) => {
    if (!session || !meeting) {
      setError('Sélectionnez une réunion Outlook ou Teams pour associer une transcription à cette conversation.');
      return;
    }
    if (!meeting.graphId) {
      setError('L’identifiant Microsoft Graph de cette réunion est indisponible.');
      return;
    }
    setBusy(true);
    setError(null);
    addUserMessage(question);
    try {
      const transcript = await getTranscript(meeting);
      const history: TranscriptChatTurn[] = recentTurns
        .filter((message) => message.content.trim())
        .map((message) => ({ role: message.role, content: message.content.slice(0, 3_000) }));
      const response = await onAskQuestion(meeting, transcript, question, history);
      updateSession((current) => ({
        ...current,
        messages: [...current.messages, {
          id: makeId(),
          role: 'assistant',
          content: response.answer,
          answerable: response.answerable,
          citations: response.citations,
          modelUsed: response.modelUsed,
        }],
      }));
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : 'La réponse du service de traitement est indisponible.');
    } finally {
      setBusy(false);
    }
  };

  const analyzeMeeting = async (label: string) => {
    if (!session || !meeting) {
      setError('Sélectionnez une réunion avant de lancer son analyse.');
      return;
    }
    if (!meeting.graphId) {
      setError('L’identifiant Microsoft Graph de cette réunion est indisponible.');
      return;
    }
    setBusy(true);
    setError(null);
    addUserMessage(label);
    try {
      const transcript = await getTranscript(meeting);
      const result = await onAnalyzeMeeting(meeting, transcript);
      let analysis = result.analysis;
      if (!analysis && result.processingRun?.analysisJson) {
        try {
          analysis = JSON.parse(result.processingRun.analysisJson) as MeetingAnalysis;
        } catch {
          throw new Error('Le backend a renvoyé un résultat structuré illisible.');
        }
      }
      if (!analysis) {
        const status = result.processingRun?.status;
        if (status && [
          'Queued',
          'ResolvingMeeting',
          'DiscoveringTranscript',
          'DownloadingTranscript',
          'ParsingTranscript',
          'ValidatingTranscript',
          'PersistingTranscript',
        ].includes(status)) {
          updateSession((current) => ({
            ...current,
            messages: [...current.messages, {
              id: makeId(),
              role: 'assistant',
              content: 'Analyse mise en file par le serveur. Consultez la rubrique Réunions pour suivre le traitement et relire le compte rendu enregistré.',
            }],
          }));
          return;
        }
        throw new Error(result.processingRun?.errorMessage || 'Le traitement n’a pas produit de résultat structuré.');
      }
      updateSession((current) => ({
        ...current,
        messages: [...current.messages, {
          id: makeId(),
          role: 'assistant',
          content: result.persisted
            ? 'Analyse terminée et persistée par l’API.'
            : 'Analyse réelle retournée par le backend. Cet aperçu n’est pas enregistré.',
          analysis,
          modelUsed: result.modelUsed ?? result.processingRun?.modelUsed ?? undefined,
          notPersisted: result.persisted === false,
        }],
      }));
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : 'L’analyse de la réunion a échoué.');
    } finally {
      setBusy(false);
    }
  };

  const runComposer = async () => {
    const question = composer.trim();
    if (!question || busy) return;
    setComposer('');
    await askQuestion(question);
  };

  const useSuggestion = (suggestion: typeof promptSuggestions[number]) => {
    if (suggestion.action === 'analysis') {
      void analyzeMeeting(suggestion.prompt);
    } else {
      setComposer(suggestion.prompt);
    }
  };

  return (
    <div className="relative flex h-full min-h-0 flex-col">
      <header className="flex h-[60px] shrink-0 items-center justify-between gap-3 border-b border-slate-800/80 px-4 sm:px-7">
        <div className="min-w-0">
          <p className="truncate text-xs font-medium text-slate-300">Assistant DGF</p>
          <p className="truncate text-[10px] text-slate-600">Les échanges de cette conversation restent en mémoire de session uniquement.</p>
        </div>
        <label className="flex max-w-[55%] items-center gap-2 rounded-lg border border-slate-800 bg-[#151b23] px-2.5 py-2">
          <span className="hidden text-[10px] text-slate-500 sm:inline">Réunion</span>
          <select aria-label="Réunion associée à la conversation" value={meetingId} onChange={(event) => setContextMeeting(event.target.value)} className="min-w-0 bg-transparent text-xs text-slate-200 outline-none">
            <option value="">Choisir une réunion</option>
            {meetings.map((item) => <option key={item.id} value={item.id}>{item.title}</option>)}
          </select>
        </label>
      </header>

      <div className="min-h-0 flex-1 overflow-y-auto">
        <div className="mx-auto flex min-h-full w-full max-w-3xl flex-col px-4 pb-8 pt-8 sm:px-8">
          {!session?.messages.length ? (
            <div className="my-auto">
              <div className="mb-5 flex h-11 w-11 items-center justify-center rounded-2xl border border-emerald-700/40 bg-emerald-950/50 text-emerald-300"><Sparkles size={20} /></div>
              <h1 className="text-2xl font-semibold tracking-tight text-white sm:text-3xl">Que souhaitez-vous analyser aujourd'hui&nbsp;?</h1>
              <p className="mt-2 text-sm text-slate-400">Votre assistant intelligent pour les réunions de la DGF.</p>
              {!meeting && (
                <p className="mt-6 rounded-lg border border-slate-800 bg-slate-900/60 p-3 text-xs leading-5 text-slate-400">
                  Choisissez une réunion ci-dessus ou ouvrez la rubrique Réunions. Les réponses nécessitent une transcription Teams réelle et accessible.
                </p>
              )}
              <div className="mt-6 grid gap-2 sm:grid-cols-2">
                {promptSuggestions.map((suggestion) => (
                  <button key={suggestion.title} type="button" onClick={() => useSuggestion(suggestion)} disabled={busy || !meeting} className="rounded-xl border border-slate-800 bg-[#151b23] p-3.5 text-left transition hover:border-slate-600 hover:bg-slate-800/70 disabled:cursor-not-allowed disabled:opacity-45">
                    <span className="flex items-center gap-2 text-xs font-medium text-slate-200">
                      {suggestion.action === 'analysis' ? <FileText size={14} className="text-emerald-400" /> : <MessageSquareText size={14} className="text-slate-400" />}
                      {suggestion.title}
                    </span>
                    <span className="mt-1.5 block text-[11px] leading-4 text-slate-500">{suggestion.prompt}</span>
                  </button>
                ))}
              </div>
            </div>
          ) : (
            <div className="space-y-7">
              {session.messages.map((message) => (
                <article key={message.id} className={message.role === 'user' ? 'ml-auto max-w-[90%] rounded-2xl bg-slate-800/80 px-4 py-3 sm:max-w-[78%]' : 'max-w-full'}>
                  {message.role === 'assistant' && (
                    <div className="mb-2 flex items-center gap-2 text-[11px] font-medium text-emerald-300">
                      <span className="flex h-6 w-6 items-center justify-center rounded-lg bg-emerald-950"><Sparkles size={13} /></span>
                      ReadMeeting.ai
                      {message.modelUsed && <span className="font-normal text-slate-600">· {message.modelUsed}</span>}
                    </div>
                  )}
                  <p className={`whitespace-pre-wrap text-sm leading-7 ${message.role === 'user' ? 'text-slate-100' : 'text-slate-300'}`}>{message.content}</p>
                  {message.answerable === false && <p className="mt-2 text-[11px] text-amber-300">La transcription ne permet pas d’étayer une réponse à cette question.</p>}
                  {message.citations && <EvidenceList items={message.citations} />}
                  {message.analysis && <AnalysisCard analysis={message.analysis} modelUsed={message.modelUsed} notPersisted={message.notPersisted} />}
                </article>
              ))}
              {busy && (
                <div role="status" className="flex items-center gap-2 text-xs text-slate-400"><LoaderCircle size={15} className="animate-spin text-emerald-400" />{sourceState || 'Le backend analyse la transcription…'}</div>
              )}
            </div>
          )}
        </div>
      </div>

      <div className="shrink-0 border-t border-slate-800/80 bg-[#0d1117] px-3 pb-3 pt-3 sm:px-6 sm:pb-5">
        <div className="mx-auto max-w-3xl">
          {error && <p role="alert" className="mb-2 rounded-lg border border-rose-900/70 bg-rose-950/30 px-3 py-2 text-xs text-rose-200">{error}</p>}
          {sourceState && !busy && <p className="mb-2 text-[10px] text-slate-500">{sourceState}</p>}
          <form onSubmit={(event) => { event.preventDefault(); void runComposer(); }} className="flex items-end gap-2 rounded-2xl border border-slate-700 bg-[#151b23] p-2 shadow-lg shadow-black/10 focus-within:border-slate-500">
            <textarea
              value={composer}
              onChange={(event) => setComposer(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === 'Enter' && !event.shiftKey) {
                  event.preventDefault();
                  void runComposer();
                }
              }}
              rows={1}
              maxLength={4000}
              placeholder={meeting ? 'Posez une question sur la transcription…' : 'Sélectionnez une réunion pour commencer…'}
              aria-label="Votre question sur la réunion"
              className="max-h-36 min-h-10 flex-1 resize-y bg-transparent px-2 py-2 text-sm leading-6 text-slate-100 outline-none placeholder:text-slate-600"
            />
            <button type="submit" disabled={!composer.trim() || busy || !meeting} aria-label="Envoyer la question" className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-emerald-600 text-white transition hover:bg-emerald-500 disabled:cursor-not-allowed disabled:bg-slate-700 disabled:text-slate-500">
              {busy ? <LoaderCircle size={16} className="animate-spin" /> : <ArrowUp size={17} />}
            </button>
          </form>
          <p className="mt-2 text-center text-[10px] text-slate-600">Les réponses s’appuient sur la transcription sélectionnée. Vérifiez les citations avant toute validation administrative.</p>
        </div>
      </div>
    </div>
  );
};
