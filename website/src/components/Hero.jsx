import React from 'react';
import { ArrowRight, Terminal, Shield, Zap, Sparkles, CheckCircle, ExternalLink } from 'lucide-react';

export default function Hero({ user, onOpenAuthModal, onOpenExtension }) {
  return (
    <section className="relative pt-20 pb-16 md:pt-32 md:pb-24 overflow-hidden">
      {/* Background radial gradient */}
      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] bg-white/[0.03] rounded-full blur-3xl pointer-events-none" />

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 relative z-10 text-center">
        {/* Top announcement badge */}
        <div className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full border border-zinc-700/80 bg-zinc-900/60 text-xs font-mono text-zinc-300 mb-8 backdrop-blur-md">
          <span className="flex h-2 w-2 relative">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-white opacity-75"></span>
            <span className="relative inline-flex rounded-full h-2 w-2 bg-white"></span>
          </span>
          <span className="text-zinc-400">NYXUS RUNTIME 2.0</span>
          <span className="text-zinc-600">|</span>
          <span className="text-white font-medium">Deep-Context Cloud Pair Programmer</span>
        </div>

        {/* Main Headline */}
        <h1 className="text-4xl sm:text-6xl lg:text-7xl font-extrabold tracking-tight text-white max-w-5xl mx-auto leading-[1.1] font-sans">
          Autonomous Coding Intelligence.
          <br />
          <span className="text-transparent bg-clip-text bg-gradient-to-b from-white via-zinc-200 to-zinc-500">
            Connected to your Editor.
          </span>
        </h1>

        {/* Subtitle */}
        <p className="mt-6 text-base sm:text-lg lg:text-xl text-zinc-400 max-w-3xl mx-auto font-normal leading-relaxed">
          Nyxus isolates repository context into ephemeral Kubernetes agent pods, orchestrating multi-agent LangGraph workflows and streaming markdown solutions directly into VS Code.
        </p>

        {/* Call to Actions */}
        <div className="mt-10 flex flex-col sm:flex-row items-center justify-center gap-4">
          {user ? (
            <>
              <button
                onClick={onOpenExtension}
                className="w-full sm:w-auto inline-flex items-center justify-center gap-2.5 px-6 py-3.5 rounded-lg bg-white text-black font-mono font-semibold text-sm hover:bg-zinc-200 transition-all shadow-[0_0_25px_rgba(255,255,255,0.25)] hover:shadow-[0_0_35px_rgba(255,255,255,0.4)] hover:scale-[1.02] active:scale-[0.98]"
              >
                <Terminal className="w-4 h-4" />
                <span>Launch Extension with User ID</span>
                <ExternalLink className="w-4 h-4 text-zinc-800" />
              </button>

              <a
                href="#extension"
                className="w-full sm:w-auto inline-flex items-center justify-center gap-2 px-6 py-3.5 rounded-lg bg-zinc-900 border border-zinc-700/80 text-zinc-200 font-mono text-sm hover:bg-zinc-800 hover:text-white transition-all hover:border-zinc-500"
              >
                <Shield className="w-4 h-4 text-zinc-400" />
                <span>View Configuration Card</span>
              </a>
            </>
          ) : (
            <>
              <button
                onClick={onOpenAuthModal}
                className="w-full sm:w-auto inline-flex items-center justify-center gap-3 px-7 py-3.5 rounded-lg bg-white text-black font-mono font-semibold text-sm hover:bg-zinc-200 transition-all shadow-[0_0_25px_rgba(255,255,255,0.25)] hover:scale-[1.02] active:scale-[0.98]"
              >
                <svg className="w-4 h-4" viewBox="0 0 24 24">
                  <path
                    fill="currentColor"
                    d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
                  />
                  <path
                    fill="currentColor"
                    d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
                  />
                  <path
                    fill="currentColor"
                    d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z"
                  />
                  <path
                    fill="currentColor"
                    d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z"
                  />
                </svg>
                <span>Authenticate with Google</span>
                <ArrowRight className="w-4 h-4" />
              </button>

              <a
                href="#architecture"
                className="w-full sm:w-auto inline-flex items-center justify-center gap-2 px-6 py-3.5 rounded-lg bg-zinc-900 border border-zinc-700/80 text-zinc-300 font-mono text-sm hover:bg-zinc-800 hover:text-white transition-all hover:border-zinc-500"
              >
                <span>System Architecture</span>
                <ArrowRight className="w-4 h-4 text-zinc-500" />
              </a>
            </>
          )}
        </div>

        {/* User state preview badge if logged in */}
        {user && (
          <div className="mt-8 max-w-xl mx-auto p-3 rounded-lg border border-zinc-700/70 bg-zinc-900/50 backdrop-blur-md flex items-center justify-between">
            <div className="flex items-center gap-2.5 text-xs font-mono text-zinc-300">
              <CheckCircle className="w-4 h-4 text-white" />
              <span>Provisioned User ID:</span>
              <span className="text-white font-bold bg-zinc-800 px-2 py-0.5 rounded border border-zinc-700">
                {user.email}
              </span>
            </div>
            <span className="text-[10px] font-mono uppercase tracking-wider text-zinc-500 bg-black/60 px-2 py-1 rounded border border-zinc-800">
              Session Bound
            </span>
          </div>
        )}

        {/* Feature stats footer */}
        <div className="mt-16 pt-8 border-t border-zinc-800/60 grid grid-cols-2 md:grid-cols-4 gap-6 max-w-4xl mx-auto text-left font-mono">
          <div>
            <div className="text-2xl font-bold text-white">0 ms</div>
            <div className="text-xs text-zinc-400 uppercase tracking-wider mt-1">Local CPU Overhead</div>
          </div>
          <div>
            <div className="text-2xl font-bold text-white">&lt; 15s</div>
            <div className="text-xs text-zinc-400 uppercase tracking-wider mt-1">Pod Cold-Start</div>
          </div>
          <div>
            <div className="text-2xl font-bold text-white">100%</div>
            <div className="text-xs text-zinc-400 uppercase tracking-wider mt-1">Git Delta Sync</div>
          </div>
          <div>
            <div className="text-2xl font-bold text-white">K3s + Atlas</div>
            <div className="text-xs text-zinc-400 uppercase tracking-wider mt-1">Ephemeral Mesh</div>
          </div>
        </div>
      </div>
    </section>
  );
}
