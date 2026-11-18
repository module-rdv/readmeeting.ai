import React, { ReactNode, useState } from 'react';
import {
  CalendarDays,
  ChevronLeft,
  ChevronRight,
  FileText,
  LayoutDashboard,
  LogOut,
  Menu,
  MessageSquare,
  Settings2,
  ShieldCheck,
  Users,
  Video,
  X,
  CheckSquare,
} from 'lucide-react';
import { DgfUserProfile } from '../types/auth';

export type WorkspaceSection =
  | 'chat'
  | 'dashboard'
  | 'meetings'
  | 'graph_meetings'
  | 'transcripts'
  | 'calendar'
  | 'reports'
  | 'decisions'
  | 'actions'
  | 'settings'
  | 'microsoft'
  | 'auth_diagnostic'
  | 'architecture';

export interface RecentConversationItem {
  id: string;
  title: string;
  meetingTitle: string | null;
}

interface AssistantLayoutProps {
  section: WorkspaceSection;
  user: DgfUserProfile | null;
  conversations: RecentConversationItem[];
  activeConversationId: string | null;
  onNavigate: (section: WorkspaceSection) => void;
  onNewConversation: () => void;
  onSelectConversation: (id: string) => void;
  onLogout: () => void;
  children: ReactNode;
}

const primaryNavigation = [
  { id: 'dashboard', label: 'Tableau de bord', icon: LayoutDashboard },
  { id: 'meetings', label: 'Réunions', icon: Users },
  { id: 'transcripts', label: 'Transcriptions', icon: FileText },
  { id: 'calendar', label: 'Calendrier', icon: CalendarDays },
  { id: 'graph_meetings', label: 'Teams / Outlook', icon: Video },
  { id: 'reports', label: 'Comptes rendus', icon: FileText },
] as const;

const otherNavigation = [
  { id: 'decisions', label: 'Décisions', icon: CheckSquare },
  { id: 'actions', label: 'Actions à suivre', icon: LayoutDashboard },
  { id: 'settings', label: 'Paramètres', icon: Settings2 },
] as const;

export const AssistantLayout: React.FC<AssistantLayoutProps> = ({
  section,
  user,
  conversations,
  activeConversationId,
  onNavigate,
  onNewConversation,
  onSelectConversation,
  onLogout,
  children,
}) => {
  const [collapsed, setCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const sidebarWidth = collapsed ? 'w-[76px]' : 'w-[260px]';

  const navigate = (target: WorkspaceSection) => {
    onNavigate(target);
    setMobileOpen(false);
  };

  const renderNavigation = (
    items: ReadonlyArray<{ id: WorkspaceSection; label: string; icon: typeof Users }>
  ) => items.map(({ id, label, icon: Icon }) => (
    <button
      key={id}
      type="button"
      title={collapsed ? label : undefined}
      onClick={() => navigate(id)}
      className={`flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left text-[13px] transition ${
        section === id ? 'bg-slate-800 text-white' : 'text-slate-400 hover:bg-slate-800/70 hover:text-slate-100'
      } ${collapsed ? 'justify-center px-2' : ''}`}
    >
      <Icon size={17} className="shrink-0" />
      {!collapsed && <span>{label}</span>}
    </button>
  ));

  return (
    <div className="flex h-screen min-h-[560px] overflow-hidden bg-[#0d1117] text-slate-100">
      {mobileOpen && (
        <button
          type="button"
          aria-label="Fermer le menu"
          onClick={() => setMobileOpen(false)}
          className="fixed inset-0 z-40 bg-black/60 md:hidden"
        />
      )}
      <aside className={`fixed inset-y-0 left-0 z-50 flex ${sidebarWidth} flex-col border-r border-slate-800 bg-[#10151c] transition-[width,transform] md:relative md:translate-x-0 ${mobileOpen ? 'translate-x-0' : '-translate-x-full md:translate-x-0'}`}>
        <div className={`flex h-[68px] items-center border-b border-slate-800 px-4 ${collapsed ? 'justify-center' : 'justify-between'}`}>
          <button type="button" onClick={() => navigate('chat')} className="flex min-w-0 items-center gap-2.5 text-left">
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-emerald-500/15 text-emerald-300">
              <MessageSquare size={18} />
            </span>
            {!collapsed && <span className="truncate text-sm font-semibold">ReadMeeting<span className="text-emerald-400">.ai</span></span>}
          </button>
          {!collapsed && (
            <button type="button" onClick={() => setMobileOpen(false)} aria-label="Fermer" className="rounded-md p-1.5 text-slate-500 hover:bg-slate-800 md:hidden">
              <X size={17} />
            </button>
          )}
        </div>

        <div className="px-3 pt-4">
          <button
            type="button"
            title={collapsed ? 'Nouvelle conversation' : undefined}
            onClick={() => {
              onNewConversation();
              navigate('chat');
            }}
            className={`flex w-full items-center justify-center gap-2 rounded-lg border border-slate-700 bg-slate-800/60 px-3 py-2.5 text-[13px] font-medium text-slate-100 transition hover:bg-slate-800 ${collapsed ? 'px-2' : ''}`}
          >
            <span className="text-lg leading-none">+</span>
            {!collapsed && 'Nouvelle conversation'}
          </button>
        </div>

        <nav aria-label="Navigation principale" className="mt-5 space-y-1 px-3">
          {!collapsed && <p className="mb-2 px-3 text-[10px] font-semibold uppercase tracking-[0.16em] text-slate-600">Espace de travail</p>}
          {renderNavigation(primaryNavigation)}
          {!collapsed && <p className="mb-2 mt-5 px-3 text-[10px] font-semibold uppercase tracking-[0.16em] text-slate-600">Gestion</p>}
          {renderNavigation(otherNavigation)}
        </nav>

        <div className="mt-6 min-h-0 flex-1 overflow-y-auto px-3">
          {!collapsed && (
            <>
              <div className="mb-2 flex items-center justify-between px-3">
                <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-slate-600">Récentes · session</p>
                {conversations.length > 0 && <span className="text-[10px] text-slate-600">{conversations.length}</span>}
              </div>
              <div className="space-y-1">
                {conversations.slice(0, 8).map((conversation) => (
                  <button
                    key={conversation.id}
                    type="button"
                    onClick={() => {
                      onSelectConversation(conversation.id);
                      navigate('chat');
                    }}
                    className={`w-full truncate rounded-lg px-3 py-2 text-left text-xs ${
                      activeConversationId === conversation.id ? 'bg-slate-800 text-slate-100' : 'text-slate-500 hover:bg-slate-800/60 hover:text-slate-300'
                    }`}
                    title={conversation.meetingTitle ?? conversation.title}
                  >
                    {conversation.title}
                  </button>
                ))}
                {conversations.length === 0 && <p className="px-3 py-2 text-[11px] leading-5 text-slate-600">Les échanges apparaîtront ici pendant cette session.</p>}
              </div>
            </>
          )}
        </div>

        <div className="border-t border-slate-800 p-3">
          {!collapsed && (
            <div className="mb-2 flex items-center gap-2 rounded-lg px-2 py-2">
              <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-slate-700 text-xs font-semibold text-slate-200">
                {(user?.displayName || user?.userPrincipalName || 'DGF').slice(0, 2).toUpperCase()}
              </span>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-xs font-medium text-slate-200">{user?.displayName || 'Compte Microsoft'}</span>
                <span className="block truncate text-[10px] text-slate-500">{user?.mail || user?.userPrincipalName || 'DGF'}</span>
              </span>
              <button type="button" onClick={onLogout} aria-label="Se déconnecter" title="Se déconnecter" className="rounded-md p-1.5 text-slate-500 hover:bg-slate-800 hover:text-rose-300">
                <LogOut size={15} />
              </button>
            </div>
          )}
          <button type="button" onClick={() => navigate('microsoft')} className={`flex w-full items-center gap-3 rounded-lg px-3 py-2 text-xs text-slate-500 hover:bg-slate-800 hover:text-slate-200 ${collapsed ? 'justify-center px-2' : ''}`} title={collapsed ? 'Microsoft 365' : undefined}>
            <ShieldCheck size={16} />
            {!collapsed && 'Microsoft 365'}
          </button>
          {!collapsed && (
            <button type="button" onClick={() => navigate('auth_diagnostic')} className="mt-1 flex w-full items-center gap-3 rounded-lg px-3 py-2 text-xs text-slate-500 hover:bg-slate-800 hover:text-slate-200">
              <Settings2 size={16} />
              Diagnostics
            </button>
          )}
          <button type="button" onClick={() => setCollapsed(!collapsed)} aria-label={collapsed ? 'Développer le menu' : 'Réduire le menu'} className={`mt-2 hidden w-full items-center gap-2 rounded-lg px-3 py-2 text-xs text-slate-600 hover:bg-slate-800 hover:text-slate-300 md:flex ${collapsed ? 'justify-center px-2' : ''}`}>
            {collapsed ? <ChevronRight size={16} /> : <><ChevronLeft size={16} /> Réduire le menu</>}
          </button>
        </div>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex h-[60px] shrink-0 items-center gap-3 border-b border-slate-800/80 px-4 md:hidden">
          <button type="button" onClick={() => setMobileOpen(true)} aria-label="Ouvrir le menu" className="rounded-md p-2 text-slate-400 hover:bg-slate-800">
            <Menu size={19} />
          </button>
          <span className="text-sm font-semibold">ReadMeeting<span className="text-emerald-400">.ai</span></span>
          <button type="button" onClick={onLogout} aria-label="Se déconnecter" className="ml-auto rounded-md p-2 text-slate-500 hover:bg-slate-800 hover:text-rose-300">
            <LogOut size={16} />
          </button>
        </header>
        <main className="min-h-0 flex-1 overflow-y-auto">{children}</main>
      </div>
    </div>
  );
};
