import React from 'react';
import { Terminal, Download, ExternalLink, BookOpen, Layers } from 'lucide-react';

export default function Navbar({ onOpenExtension }) {
  return (
    <header className="sticky top-0 z-50 border-b border-zinc-800/80 bg-black/85 backdrop-blur-xl">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
        {/* Brand */}
        <a href="#" className="flex items-center gap-3 group">
          <div className="relative flex items-center justify-center w-10 h-10 rounded-lg border border-zinc-700 bg-zinc-900/80 overflow-hidden group-hover:border-zinc-500 transition-colors">
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
        </a>

        {/* Center Links */}
        <nav className="hidden md:flex items-center gap-8 text-xs font-mono text-zinc-400">
          <a href="#workflow" className="hover:text-white transition-colors">How to Use</a>
          <a href="#install" className="hover:text-white transition-colors">Install</a>
          <a href="#gitignore" className="hover:text-white transition-colors">.gitignore</a>
          <a href="#staging" className="hover:text-white transition-colors">Git Add & Staging</a>
          <a href="#architecture" className="hover:text-white transition-colors">Architecture</a>
        </nav>

        {/* Right Action */}
        <div className="flex items-center gap-3">
          <div className="hidden lg:flex items-center gap-2 px-2.5 py-1 rounded-full bg-zinc-900/90 border border-zinc-800 text-xs font-mono text-zinc-400">
            <span className="w-2 h-2 rounded-full bg-white animate-pulse" />
            <span>K8S GATEWAY ACTIVE</span>
          </div>

          <a
            href="#install"
            className="inline-flex items-center gap-2 px-3.5 py-2 text-xs font-mono font-semibold rounded-md bg-white text-black hover:bg-zinc-200 transition-all border border-white shadow-sm hover:shadow-white/20 active:scale-95"
          >
            <Download className="w-3.5 h-3.5" />
            <span>Install Extension</span>
          </a>
        </div>
      </div>
    </header>
  );
}
