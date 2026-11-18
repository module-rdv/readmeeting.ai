import React, { useMemo, useState } from 'react';
import { CalendarClock, FileText, MessageSquareText, Search, Video } from 'lucide-react';
import { MeetingItem } from '../types/meeting';
import { TranscriptCheckResult } from '../types/transcript';

interface MeetingsViewProps {
  meetings: MeetingItem[];
  selectedMeetingId: string | null;
  isLoading: boolean;
  onRefresh: () => Promise<void>;
  onCheckTranscript: (meeting: MeetingItem, forceRefresh?: boolean) => Promise<TranscriptCheckResult>;
  onSelectMeeting: (meetingId: string) => void;
  onOpenConversation: (meeting: MeetingItem) => void;
}

const dateLabel = (value: string) =>
  new Intl.DateTimeFormat('fr-FR', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(value));

export const MeetingsView: React.FC<MeetingsViewProps> = ({
  meetings,
  selectedMeetingId,
  isLoading,
  onRefresh,
  onCheckTranscript,
  onSelectMeeting,
  onOpenConversation,
}) => {
  const [query, setQuery] = useState('');
  const [period, setPeriod] = useState<'all' | 'past30' | 'past90' | 'upcoming'>('all');
  const [transcriptFilter, setTranscriptFilter] = useState<'all' | 'available' | 'unavailable'>('all');
  const [checks, setChecks] = useState<Record<string, TranscriptCheckResult>>({});
  const [checkingId, setCheckingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const selectedMeeting = meetings.find((meeting) => meeting.id === selectedMeetingId) ?? null;

  const filteredMeetings = useMemo(() => {
    const now = Date.now();
    const since = period === 'past30' ? now - 30 * 86400000
      : period === 'past90' ? now - 90 * 86400000
      : null;
    return meetings.filter((meeting) => {
      const matchesQuery = `${meeting.title} ${meeting.organizer.name} ${meeting.organizer.email}`
        .toLowerCase().includes(query.trim().toLowerCase());
      const start = new Date(meeting.start).getTime();
      const matchesPeriod = period === 'all'
        || (period === 'upcoming' ? start >= now : start >= (since ?? 0) && start < now);
      const checked = checks[meeting.id];
      const available = Boolean(checked?.content);
      const matchesTranscript = transcriptFilter === 'all'
        || (transcriptFilter === 'available' ? available : Boolean(checked && !available));
      return matchesQuery && matchesPeriod && matchesTranscript;
    }).sort((a, b) => new Date(b.start).getTime() - new Date(a.start).getTime());
  }, [checks, meetings, period, query, transcriptFilter]);

  const checkSelectedTranscript = async (meeting: MeetingItem, force = false) => {
    setCheckingId(meeting.id);
    setError(null);
    try {
      const result = await onCheckTranscript(meeting, force);
      setChecks((previous) => ({ ...previous, [meeting.id]: result }));
    } catch (checkError) {
      setError(checkError instanceof Error ? checkError.message : 'La vérification de la transcription a échoué.');
    } finally {
      setCheckingId(null);
    }
  };

  const transcriptStatus = (meeting: MeetingItem) => {
    const check = checks[meeting.id];
    if (!check) return 'Non vérifiée';
    if (check.content) return 'Disponible';
    return check.error?.title || 'Indisponible';
  };

  return (
    <div className="mx-auto max-w-[1500px] px-4 py-6 sm:px-7 lg:px-10">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-xs font-medium uppercase tracking-[0.18em] text-emerald-400">Microsoft 365 · données du compte</p>
          <h1 className="mt-2 text-2xl font-semibold tracking-tight text-white">Réunions</h1>
          <p className="mt-1 text-sm text-slate-400">Réunions Outlook et Teams récupérées via Microsoft Graph.</p>
        </div>
        <button type="button" onClick={() => void onRefresh()} disabled={isLoading} className="rounded-lg border border-slate-700 px-3 py-2 text-xs font-medium text-slate-300 hover:bg-slate-800 disabled:opacity-50">
          {isLoading ? 'Actualisation…' : 'Actualiser depuis Outlook'}
        </button>
      </div>

      <div className="mt-6 grid gap-5 xl:grid-cols-[minmax(0,1.1fr)_minmax(320px,0.9fr)]">
        <section className="min-w-0">
          <div className="mb-3 grid gap-2 sm:grid-cols-[1fr_auto_auto]">
            <label className="flex items-center gap-2 rounded-lg border border-slate-800 bg-[#151b23] px-3">
              <Search size={15} className="text-slate-500" />
              <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Rechercher une réunion ou un organisateur" className="w-full bg-transparent py-2.5 text-xs text-slate-200 outline-none placeholder:text-slate-600" />
            </label>
            <select aria-label="Filtrer par période" value={period} onChange={(event) => setPeriod(event.target.value as typeof period)} className="rounded-lg border border-slate-800 bg-[#151b23] px-3 py-2 text-xs text-slate-300">
              <option value="all">Toutes les dates</option>
              <option value="past30">30 derniers jours</option>
              <option value="past90">90 derniers jours</option>
              <option value="upcoming">À venir</option>
            </select>
            <select aria-label="Filtrer par transcription" value={transcriptFilter} onChange={(event) => setTranscriptFilter(event.target.value as typeof transcriptFilter)} className="rounded-lg border border-slate-800 bg-[#151b23] px-3 py-2 text-xs text-slate-300">
              <option value="all">Transcriptions : toutes</option>
              <option value="available">Disponible (vérifiée)</option>
              <option value="unavailable">Indisponible (vérifiée)</option>
            </select>
          </div>
          <div className="overflow-hidden rounded-xl border border-slate-800 bg-[#121820]">
            {isLoading && <p role="status" className="p-5 text-sm text-slate-400">Chargement des réunions Microsoft Graph…</p>}
            {!isLoading && filteredMeetings.length === 0 && (
              <div className="p-8 text-center">
                <CalendarClock className="mx-auto text-slate-600" size={23} />
                <p className="mt-3 text-sm text-slate-300">{meetings.length ? 'Aucune réunion ne correspond aux filtres.' : 'Aucune réunion Graph chargée pour cette période.'}</p>
                <p className="mt-1 text-xs text-slate-500">Aucune donnée de démonstration n’est affichée.</p>
              </div>
            )}
            <div className="divide-y divide-slate-800/80">
              {filteredMeetings.map((meeting) => (
                <button key={meeting.id} type="button" onClick={() => onSelectMeeting(meeting.id)} className={`w-full px-4 py-4 text-left transition hover:bg-slate-800/40 sm:px-5 ${selectedMeetingId === meeting.id ? 'bg-slate-800/50' : ''}`}>
                  <div className="flex items-start gap-3">
                    <span className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-slate-800 text-slate-400"><Video size={16} /></span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-medium text-slate-100">{meeting.title}</span>
                      <span className="mt-1 flex flex-wrap gap-x-3 gap-y-1 text-[11px] text-slate-500">
                        <span>{dateLabel(meeting.start)}</span>
                        <span>{meeting.organizer.name || 'Organisateur non renseigné'}</span>
                        <span>{meeting.isOnlineMeeting ? 'Microsoft Teams' : 'Outlook'}</span>
                      </span>
                    </span>
                    <span className={`shrink-0 rounded-full border px-2 py-1 text-[10px] ${checks[meeting.id]?.content ? 'border-emerald-900 bg-emerald-950/50 text-emerald-300' : 'border-slate-700 bg-slate-900 text-slate-400'}`}>
                      {transcriptStatus(meeting)}
                    </span>
                  </div>
                </button>
              ))}
            </div>
          </div>
        </section>

        <aside className="h-fit rounded-xl border border-slate-800 bg-[#121820] p-5">
          {!selectedMeeting ? (
            <div className="py-8 text-center">
              <FileText size={22} className="mx-auto text-slate-600" />
              <p className="mt-3 text-sm text-slate-300">Sélectionnez une réunion</p>
              <p className="mt-1 text-xs text-slate-500">Les détails et l’état de transcription vérifié apparaîtront ici.</p>
            </div>
          ) : (
            <>
              <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-slate-500">Détail de la réunion</p>
              <h2 className="mt-2 text-base font-semibold leading-6 text-white">{selectedMeeting.title}</h2>
              <dl className="mt-4 space-y-3 text-xs">
                <div><dt className="text-slate-500">Date</dt><dd className="mt-1 text-slate-300">{dateLabel(selectedMeeting.start)}</dd></div>
                <div><dt className="text-slate-500">Organisateur</dt><dd className="mt-1 text-slate-300">{selectedMeeting.organizer.name || 'Non identifié'}{selectedMeeting.organizer.email ? ` · ${selectedMeeting.organizer.email}` : ''}</dd></div>
                <div><dt className="text-slate-500">Transcription Teams</dt><dd className="mt-1 text-slate-300">{transcriptStatus(selectedMeeting)}</dd></div>
              </dl>
              {selectedMeeting.isOnlineMeeting && (
                <button type="button" onClick={() => void checkSelectedTranscript(selectedMeeting, true)} disabled={checkingId === selectedMeeting.id} className="mt-5 w-full rounded-lg border border-slate-700 px-3 py-2.5 text-xs font-medium text-slate-200 hover:bg-slate-800 disabled:opacity-50">
                  {checkingId === selectedMeeting.id ? 'Vérification Microsoft Graph…' : checks[selectedMeeting.id] ? 'Vérifier à nouveau la transcription' : 'Vérifier la transcription Teams'}
                </button>
              )}
              {checks[selectedMeeting.id]?.error && (
                <p className="mt-3 rounded-lg border border-amber-900/70 bg-amber-950/30 p-3 text-xs leading-5 text-amber-200">
                  {checks[selectedMeeting.id].error?.message || checks[selectedMeeting.id].error?.title}
                </p>
              )}
              {checks[selectedMeeting.id]?.content && (
                <>
                  <div className="mt-4 max-h-56 overflow-y-auto rounded-lg border border-slate-800 bg-[#0d1117] p-3 text-xs leading-5 text-slate-300">
                    <pre className="whitespace-pre-wrap">{checks[selectedMeeting.id].content?.rawContent}</pre>
                  </div>
                  <button type="button" onClick={() => onOpenConversation(selectedMeeting)} className="mt-3 flex w-full items-center justify-center gap-2 rounded-lg bg-emerald-600 px-3 py-2.5 text-xs font-semibold text-white hover:bg-emerald-500">
                    <MessageSquareText size={15} /> Ouvrir une conversation liée
                  </button>
                </>
              )}
              {error && <p role="alert" className="mt-3 text-xs text-rose-300">{error}</p>}
            </>
          )}
        </aside>
      </div>
    </div>
  );
};
