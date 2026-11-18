import React from 'react';
import { Building2, KeyRound, ShieldCheck } from 'lucide-react';
import { GraphErrorExplanation } from '../services/graphClient';
import { MsalRuntimeConfig } from '../types/auth';

interface SignInViewProps {
  config: MsalRuntimeConfig;
  isLoggingIn: boolean;
  lastError: GraphErrorExplanation | null;
  onLoginPopup: () => void;
  onLoginRedirect: () => void;
  onOpenDiagnostics: () => void;
}

export const SignInView: React.FC<SignInViewProps> = ({
  config,
  isLoggingIn,
  lastError,
  onLoginPopup,
  onLoginRedirect,
  onOpenDiagnostics,
}) => (
  <main className="flex min-h-screen items-center justify-center bg-[#0d1117] px-5 py-12 text-slate-100">
    <div className="w-full max-w-md">
      <div className="mb-9 text-center">
        <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl border border-emerald-500/30 bg-emerald-500/10 text-emerald-300">
          <Building2 size={26} />
        </div>
        <p className="text-xl font-semibold tracking-tight">ReadMeeting<span className="text-emerald-400">.ai</span></p>
        <p className="mt-2 text-sm text-slate-400">Direction Générale des Financements</p>
      </div>
      <section className="rounded-2xl border border-slate-800 bg-[#151b23] p-6 shadow-2xl sm:p-8">
        <h1 className="text-center text-xl font-semibold">Votre assistant intelligent pour les réunions de la DGF</h1>
        <p className="mt-3 text-center text-sm leading-6 text-slate-400">
          Connectez-vous avec votre compte professionnel Microsoft 365 pour retrouver vos réunions et transcriptions autorisées.
        </p>
        <button
          type="button"
          onClick={onLoginPopup}
          disabled={isLoggingIn || !config.isConfigured}
          className="mt-7 flex w-full items-center justify-center gap-2 rounded-xl bg-emerald-600 px-4 py-3 text-sm font-semibold text-white transition hover:bg-emerald-500 disabled:cursor-not-allowed disabled:opacity-50"
        >
          <KeyRound size={17} />
          {isLoggingIn ? 'Connexion en cours…' : 'Continuer avec Microsoft 365'}
        </button>
        <button
          type="button"
          onClick={onLoginRedirect}
          disabled={isLoggingIn || !config.isConfigured}
          className="mt-2 w-full rounded-xl border border-slate-700 px-4 py-2.5 text-sm font-medium text-slate-300 transition hover:border-slate-500 hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-50"
        >
          Se connecter par redirection
        </button>
        {!config.isConfigured && (
          <p role="alert" className="mt-4 rounded-lg border border-amber-900 bg-amber-950/40 p-3 text-xs leading-5 text-amber-200">
            La configuration MSAL du frontend est incomplète. Vérifiez le Client ID et le Tenant ID.
          </p>
        )}
        {lastError && (
          <div role="alert" className="mt-4 rounded-lg border border-rose-900 bg-rose-950/40 p-3">
            <p className="text-sm font-semibold text-rose-200">{lastError.title}</p>
            <p className="mt-1 text-xs leading-5 text-rose-200/80">{lastError.description}</p>
            <p className="mt-2 text-xs leading-5 text-rose-300">{lastError.actionRequired}</p>
            <button type="button" onClick={onOpenDiagnostics} className="mt-3 text-xs font-medium text-rose-200 underline underline-offset-2">
              Ouvrir les diagnostics Microsoft
            </button>
          </div>
        )}
        <div className="mt-6 flex items-start gap-2 border-t border-slate-800 pt-5 text-xs leading-5 text-slate-500">
          <ShieldCheck className="mt-0.5 shrink-0 text-emerald-500" size={15} />
          <p>Authentification Microsoft Entra ID. Les autorisations Graph restent celles accordées à votre organisation.</p>
        </div>
      </section>
      <p className="mt-6 text-center text-[11px] text-slate-600">République de Côte d'Ivoire · Ministère des Finances et du Budget</p>
    </div>
  </main>
);
