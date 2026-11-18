import React, { useEffect, useMemo, useState } from 'react';
import { ChevronLeft, ChevronRight, Clock, Video } from 'lucide-react';
import { MeetingItem } from '../types/meeting';

type CalendarMode = 'month' | 'week' | 'day';

interface CalendarViewProps {
  meetings: MeetingItem[];
  isLoading: boolean;
  onLoadRange: (start: string, end: string) => Promise<void>;
  onOpenMeeting: (meeting: MeetingItem) => void;
}

const startOfWeek = (date: Date) => {
  const result = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  const day = (result.getDay() + 6) % 7;
  result.setDate(result.getDate() - day);
  return result;
};

const dateKey = (date: Date) => `${date.getFullYear()}-${date.getMonth()}-${date.getDate()}`;
const timeLabel = (value: string) => new Intl.DateTimeFormat('fr-FR', { hour: '2-digit', minute: '2-digit' }).format(new Date(value));

export const CalendarView: React.FC<CalendarViewProps> = ({
  meetings,
  isLoading,
  onLoadRange,
  onOpenMeeting,
}) => {
  const [mode, setMode] = useState<CalendarMode>('month');
  const [anchorDate, setAnchorDate] = useState(() => new Date());

  const period = useMemo(() => {
    if (mode === 'month') {
      const start = startOfWeek(new Date(anchorDate.getFullYear(), anchorDate.getMonth(), 1));
      const end = new Date(start);
      end.setDate(end.getDate() + 42);
      return {
        start,
        end,
      };
    }
    if (mode === 'week') {
      const start = startOfWeek(anchorDate);
      const end = new Date(start);
      end.setDate(end.getDate() + 7);
      return { start, end };
    }
    const start = new Date(anchorDate.getFullYear(), anchorDate.getMonth(), anchorDate.getDate());
    const end = new Date(start);
    end.setDate(end.getDate() + 1);
    return { start, end };
  }, [anchorDate, mode]);

  useEffect(() => {
    void onLoadRange(period.start.toISOString(), period.end.toISOString());
  }, [onLoadRange, period]);

  const periodLabel = mode === 'month'
    ? new Intl.DateTimeFormat('fr-FR', { month: 'long', year: 'numeric' }).format(anchorDate)
    : mode === 'week'
      ? `${new Intl.DateTimeFormat('fr-FR', { day: 'numeric', month: 'short' }).format(period.start)} – ${new Intl.DateTimeFormat('fr-FR', { day: 'numeric', month: 'short', year: 'numeric' }).format(new Date(period.end.getTime() - 86400000))}`
      : new Intl.DateTimeFormat('fr-FR', { dateStyle: 'full' }).format(anchorDate);

  const movePeriod = (direction: number) => {
    setAnchorDate((current) => {
      const next = new Date(current);
      if (mode === 'month') next.setMonth(next.getMonth() + direction);
      else if (mode === 'week') next.setDate(next.getDate() + direction * 7);
      else next.setDate(next.getDate() + direction);
      return next;
    });
  };

  const meetingsForDay = (date: Date) => meetings
    .filter((meeting) => dateKey(new Date(meeting.start)) === dateKey(date))
    .sort((a, b) => new Date(a.start).getTime() - new Date(b.start).getTime());

  const days = useMemo(() => {
    if (mode === 'month') {
      const first = startOfWeek(new Date(anchorDate.getFullYear(), anchorDate.getMonth(), 1));
      return Array.from({ length: 42 }, (_, index) => {
        const date = new Date(first);
        date.setDate(first.getDate() + index);
        return date;
      });
    }
    if (mode === 'week') {
      const first = startOfWeek(anchorDate);
      return Array.from({ length: 7 }, (_, index) => {
        const date = new Date(first);
        date.setDate(first.getDate() + index);
        return date;
      });
    }
    return [new Date(anchorDate.getFullYear(), anchorDate.getMonth(), anchorDate.getDate())];
  }, [anchorDate, mode]);

  return (
    <div className="mx-auto max-w-[1500px] px-4 py-6 sm:px-7 lg:px-10">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-xs font-medium uppercase tracking-[0.18em] text-emerald-400">Microsoft 365 · calendrier Outlook</p>
          <h1 className="mt-2 text-2xl font-semibold text-white">Calendrier des réunions</h1>
          <p className="mt-1 text-sm text-slate-400">Événements récupérés depuis Microsoft Graph; aucune donnée de calendrier indépendante.</p>
        </div>
        <div className="flex items-center gap-1 rounded-lg border border-slate-800 bg-[#151b23] p-1">
          {(['month', 'week', 'day'] as const).map((value) => (
            <button key={value} type="button" onClick={() => setMode(value)} className={`rounded-md px-3 py-1.5 text-xs ${mode === value ? 'bg-slate-700 text-white' : 'text-slate-400 hover:text-white'}`}>
              {{ month: 'Mois', week: 'Semaine', day: 'Jour' }[value]}
            </button>
          ))}
        </div>
      </div>

      <section className="mt-6 overflow-hidden rounded-xl border border-slate-800 bg-[#121820]">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-800 px-4 py-3 sm:px-5">
          <div className="flex items-center gap-2">
            <button type="button" onClick={() => movePeriod(-1)} aria-label="Période précédente" className="rounded-md p-2 text-slate-400 hover:bg-slate-800 hover:text-white"><ChevronLeft size={17} /></button>
            <button type="button" onClick={() => setAnchorDate(new Date())} className="rounded-md border border-slate-700 px-2.5 py-1.5 text-xs text-slate-300 hover:bg-slate-800">Aujourd'hui</button>
            <button type="button" onClick={() => movePeriod(1)} aria-label="Période suivante" className="rounded-md p-2 text-slate-400 hover:bg-slate-800 hover:text-white"><ChevronRight size={17} /></button>
            <h2 className="ml-1 text-sm font-medium capitalize text-slate-200">{periodLabel}</h2>
          </div>
          {isLoading && <span role="status" className="text-xs text-slate-500">Synchronisation Graph…</span>}
        </div>

        {mode === 'month' && (
          <div className="grid grid-cols-7">
            {['Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam', 'Dim'].map((day) => (
              <div key={day} className="border-b border-r border-slate-800 px-2 py-2 text-center text-[10px] font-medium uppercase text-slate-500">{day}</div>
            ))}
            {days.map((date) => {
              const isCurrentMonth = date.getMonth() === anchorDate.getMonth();
              const dayMeetings = meetingsForDay(date);
              return (
                <div key={date.toISOString()} className={`min-h-[105px] border-b border-r border-slate-800/80 p-1.5 sm:min-h-[128px] sm:p-2 ${isCurrentMonth ? '' : 'bg-black/10'}`}>
                  <span className={`ml-1 text-[11px] ${isCurrentMonth ? 'text-slate-300' : 'text-slate-700'}`}>{date.getDate()}</span>
                  <div className="mt-1 space-y-1">
                    {dayMeetings.slice(0, 3).map((meeting) => (
                      <button key={meeting.id} type="button" onClick={() => onOpenMeeting(meeting)} title={meeting.title} className="block w-full truncate rounded bg-emerald-950/60 px-1.5 py-1 text-left text-[10px] text-emerald-200 hover:bg-emerald-900/70">
                        {timeLabel(meeting.start)} {meeting.title}
                      </button>
                    ))}
                    {dayMeetings.length > 3 && <span className="px-1 text-[10px] text-slate-500">+{dayMeetings.length - 3} autres</span>}
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {mode !== 'month' && (
          <div className={`grid ${mode === 'week' ? 'md:grid-cols-2 xl:grid-cols-7' : 'grid-cols-1'}`}>
            {days.map((date) => {
              const dayMeetings = meetingsForDay(date);
              return (
                <section key={date.toISOString()} className="min-h-48 border-b border-r border-slate-800 p-4">
                  <h3 className="text-xs font-semibold capitalize text-slate-300">{new Intl.DateTimeFormat('fr-FR', { weekday: 'long', day: 'numeric', month: 'short' }).format(date)}</h3>
                  <div className="mt-3 space-y-2">
                    {dayMeetings.map((meeting) => (
                      <button key={meeting.id} type="button" onClick={() => onOpenMeeting(meeting)} className="flex w-full items-start gap-2 rounded-lg border border-slate-800 bg-slate-900/70 p-3 text-left hover:border-emerald-800">
                        <Video size={15} className="mt-0.5 shrink-0 text-emerald-400" />
                        <span className="min-w-0">
                          <span className="block truncate text-xs font-medium text-slate-100">{meeting.title}</span>
                          <span className="mt-1 flex items-center gap-1 text-[10px] text-slate-500"><Clock size={11} />{timeLabel(meeting.start)} · {meeting.organizer.name || 'Organisateur non renseigné'}</span>
                        </span>
                      </button>
                    ))}
                    {dayMeetings.length === 0 && <p className="text-xs text-slate-600">Aucune réunion récupérée ce jour.</p>}
                  </div>
                </section>
              );
            })}
          </div>
        )}
      </section>
    </div>
  );
};
