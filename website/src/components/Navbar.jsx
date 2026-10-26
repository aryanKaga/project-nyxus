import React from 'react';
import { Terminal, Shield, LogOut, ExternalLink, Cpu, CheckCircle2 } from 'lucide-react';

export default function Navbar({ user, onSignOut, onOpenAuthModal, onOpenExtension }) {
  return (
    <header className="sticky top-0 z-50 border-b border-zinc-800/80 bg-black/80 backdrop-blur-xl">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
        {/* Brand */}
        <div className="flex items-center gap-3">
          <div className="relative flex items-center justify-center w-10 h-10 rounded-lg border border-zinc-700 bg-zinc-900/80 overflow-hidden group">
            <img 
              src="/logo.svg" 
              alt="Nyxus Fox Logo" 
              className="w-7 h-7 object-contain transition-transform duration-300 group-hover:scale-110 invert filter brightness-200"
            />
            <div className="absolute inset-0 bg-white/5 opacity-0 group-hover:opacity-100 transition-opacity" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="font-bold tracking-widest text-lg text-white font-mono">NYXUS</span>
              <span className="px-1.5 py-0.5 text-[10px] uppercase font-mono font-semibold tracking-wider bg-zinc-900 border border-zinc-700 text-zinc-300 rounded">
                v2.0
              </span>
            </div>
            <p className="text-[11px] text-zinc-400 font-mono tracking-tight hidden sm:block">
              Autonomous Cloud-Native Agent
            </p>
          </div>
        </div>

        {/* Center Links */}
        <nav className="hidden md:flex items-center gap-8 text-sm font-mono text-zinc-400">
          <a href="#features" className="hover:text-white transition-colors">Features</a>
          <a href="#architecture" className="hover:text-white transition-colors">Architecture</a>
          <a href="#extension" className="hover:text-white transition-colors">Extension Config</a>
          <a href="#terminal" className="hover:text-white transition-colors">Live Agent</a>
        </nav>

        {/* Right Section */}
        <div className="flex items-center gap-3">
          {/* System status pill */}
          <div className="hidden lg:flex items-center gap-2 px-2.5 py-1 rounded-full bg-zinc-900/90 border border-zinc-800 text-xs font-mono text-zinc-400">
            <span className="w-2 h-2 rounded-full bg-white animate-pulse" />
            <span>K8S GATEWAY ACTIVE</span>
          </div>

          {user ? (
            <div className="flex items-center gap-3">
              <button
                onClick={onOpenExtension}
                className="hidden sm:inline-flex items-center gap-2 px-3 py-1.5 text-xs font-mono font-medium rounded-md bg-white text-black hover:bg-zinc-200 transition-all border border-white shadow-sm hover:shadow-white/20"
                title="Launch VS Code Extension with this User ID"
              >
                <Terminal className="w-3.5 h-3.5" />
                <span>Open Extension</span>
                <ExternalLink className="w-3 h-3 text-zinc-700" />
              </button>

              <div className="flex items-center gap-2 pl-2 border-l border-zinc-800">
                {user.picture ? (
                  <img 
                    src={user.picture} 
                    alt={user.name || user.email} 
                    className="w-8 h-8 rounded-full border border-zinc-700 object-cover"
                    onError={(e) => { e.target.style.display = 'none'; }}
                  />
                ) : (
                  <div className="w-8 h-8 rounded-full bg-zinc-800 border border-zinc-700 flex items-center justify-center text-xs font-mono font-bold text-white">
                    {user.email.charAt(0).toUpperCase()}
                  </div>
                )}
                
                <div className="hidden sm:block text-left">
                  <div className="text-xs font-mono text-zinc-200 font-medium truncate max-w-[130px]">
                    {user.name || user.email.split('@')[0]}
                  </div>
                  <div className="text-[10px] font-mono text-zinc-500 truncate max-w-[130px]">
                    ID: {user.email}
                  </div>
                </div>

                <button
                  onClick={onSignOut}
                  className="p-1.5 text-zinc-400 hover:text-white hover:bg-zinc-850 rounded-md transition-colors"
                  title="Sign Out"
                >
                  <LogOut className="w-4 h-4" />
                </button>
              </div>
            </div>
          ) : (
            <button
              onClick={onOpenAuthModal}
              className="inline-flex items-center gap-2 px-4 py-2 text-xs font-mono font-semibold rounded-md bg-white text-black hover:bg-zinc-200 transition-all border border-white hover:scale-[1.02] active:scale-[0.98]"
            >
              <svg className="w-3.5 h-3.5" viewBox="0 0 24 24">
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
              <span>Sign in with Google</span>
            </button>
          )}
        </div>
      </div>
    </header>
  );
}
