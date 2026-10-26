import React from 'react';
import { Terminal, Shield, ArrowUp } from 'lucide-react';

export default function Footer() {
  const scrollToTop = () => {
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  return (
    <footer className="border-t border-zinc-900 bg-black text-zinc-400 font-mono text-xs py-12">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex flex-col md:flex-row items-center justify-between gap-6 pb-8 border-b border-zinc-900">
          {/* Logo & Tagline */}
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-zinc-900 border border-zinc-800 flex items-center justify-center">
              <img src="/logo.svg" alt="Nyxus" className="w-5 h-5 invert brightness-200" />
            </div>
            <div>
              <span className="font-bold tracking-widest text-white text-sm">NYXUS</span>
              <p className="text-[11px] text-zinc-500 font-sans">
                Autonomous Cloud-Native Coding Agent for VS Code
              </p>
            </div>
          </div>

          {/* Quick Links */}
          <div className="flex items-center gap-6 text-[11px]">
            <a href="#features" className="hover:text-white transition">Features</a>
            <a href="#architecture" className="hover:text-white transition">Architecture</a>
            <a href="#extension" className="hover:text-white transition">Extension</a>
            <button onClick={scrollToTop} className="flex items-center gap-1 hover:text-white transition">
              <span>Back to Top</span>
              <ArrowUp className="w-3 h-3" />
            </button>
          </div>
        </div>

        {/* Bottom copyright */}
        <div className="pt-6 flex flex-col sm:flex-row items-center justify-between gap-4 text-[11px] text-zinc-400">
          <div>
            &copy; {new Date().getFullYear()} Nyxus Ecosystem. All runtimes ephemeral.
          </div>
          <div className="flex items-center gap-4">
            <span className="flex items-center gap-1.5">
              <span className="w-1.5 h-1.5 rounded-full bg-white" />
              <span>Gateway: http://54.79.152.236</span>
            </span>
          </div>
        </div>
      </div>
    </footer>
  );
}
