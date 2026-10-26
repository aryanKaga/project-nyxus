import React, { useState } from 'react';
import { ArrowRight, Terminal, Download, Copy, Check, ExternalLink, ShieldCheck, Cpu, GitBranch } from 'lucide-react';

export default function Hero({ onOpenExtension }) {
  const [copiedCmd, setCopiedCmd] = useState(false);
  const installCmd = 'code --install-extension aryanKaga.nyxus-coding-agent-replica';

  const copyInstall = () => {
    navigator.clipboard.writeText(installCmd);
    setCopiedCmd(true);
    setTimeout(() => setCopiedCmd(false), 2000);
  };

  return (
    <section className="relative pt-20 pb-16 md:pt-28 md:pb-20 overflow-hidden">
      {/* Background radial gradient */}
      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[650px] h-[650px] bg-white/[0.03] rounded-full blur-3xl pointer-events-none" />

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 relative z-10 text-center">
        {/* Top announcement badge */}
        <div className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full border border-zinc-700/80 bg-zinc-900/60 text-xs font-mono text-zinc-300 mb-8 backdrop-blur-md">
          <span className="flex h-2 w-2 relative">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-white opacity-75"></span>
            <span className="relative inline-flex rounded-full h-2 w-2 bg-white"></span>
          </span>
          <span className="text-zinc-400">NYXUS RUNTIME 2.0</span>
          <span className="text-zinc-600">|</span>
          <span className="text-white font-medium">Cloud-Native Pair Programmer</span>
        </div>

        {/* Main Headline */}
        <h1 className="text-4xl sm:text-6xl lg:text-7xl font-extrabold tracking-tight text-white max-w-5xl mx-auto leading-[1.1] font-sans">
          The Autonomous Coding Agent
          <br />
          <span className="text-transparent bg-clip-text bg-gradient-to-b from-white via-zinc-200 to-zinc-500">
            Engineered for VS Code.
          </span>
        </h1>

        {/* Subtitle */}
        <p className="mt-6 text-base sm:text-lg text-zinc-400 max-w-3xl mx-auto font-normal leading-relaxed font-sans">
          Offload complex repository reasoning to ephemeral Kubernetes pods. Create a <code className="text-white bg-zinc-900 px-1.5 py-0.5 rounded border border-zinc-800">.gitignore</code>, stage your changes with <code className="text-white bg-zinc-900 px-1.5 py-0.5 rounded border border-zinc-800">git add .</code>, and watch answers stream directly into <code className="text-white bg-zinc-900 px-1.5 py-0.5 rounded border border-zinc-800">answer.md</code>.
        </p>

        {/* Call to Actions */}
        <div className="mt-10 flex flex-col sm:flex-row items-center justify-center gap-4">
          <a
            href="#workflow"
            className="w-full sm:w-auto inline-flex items-center justify-center gap-2 px-7 py-3.5 rounded-lg bg-white text-black font-mono font-bold text-xs hover:bg-zinc-200 transition-all shadow-[0_0_25px_rgba(255,255,255,0.25)] hover:scale-[1.02] active:scale-[0.98]"
          >
            <span>Read 4-Step Setup Guide</span>
            <ArrowRight className="w-4 h-4" />
          </a>

          <button
            onClick={onOpenExtension}
            className="w-full sm:w-auto inline-flex items-center justify-center gap-2.5 px-6 py-3.5 rounded-lg bg-zinc-900 border border-zinc-700/80 text-zinc-200 font-mono text-xs hover:bg-zinc-800 hover:text-white transition-all hover:border-zinc-500"
          >
            <Terminal className="w-4 h-4 text-zinc-400" />
            <span>Launch Extension Sidebar</span>
            <ExternalLink className="w-3.5 h-3.5 text-zinc-500" />
          </button>
        </div>

        {/* Terminal Quick Copy Bar */}
        <div className="mt-8 max-w-xl mx-auto p-2.5 rounded-xl border border-zinc-800 bg-zinc-950/80 backdrop-blur-md flex items-center justify-between font-mono text-xs text-zinc-300">
          <div className="flex items-center gap-2 overflow-x-auto pr-2">
            <span className="text-zinc-600 select-none">$</span>
            <span className="text-zinc-300">{installCmd}</span>
          </div>
          <button
            onClick={copyInstall}
            className="p-1.5 rounded-md hover:bg-zinc-800 text-zinc-400 hover:text-white transition shrink-0"
            title="Copy Command"
          >
            {copiedCmd ? <Check className="w-4 h-4 text-white" /> : <Copy className="w-4 h-4" />}
          </button>
        </div>

        {/* Metric Badges */}
        <div className="mt-14 pt-8 border-t border-zinc-900 grid grid-cols-2 md:grid-cols-4 gap-6 max-w-4xl mx-auto text-left font-mono">
          <div>
            <div className="text-xl font-bold text-white">Marketplace</div>
            <div className="text-[11px] text-zinc-500 uppercase tracking-wider mt-1">One-Click Install</div>
          </div>
          <div>
            <div className="text-xl font-bold text-white">git add .</div>
            <div className="text-[11px] text-zinc-500 uppercase tracking-wider mt-1">Snapshot Staging</div>
          </div>
          <div>
            <div className="text-xl font-bold text-white">.gitignore</div>
            <div className="text-[11px] text-zinc-500 uppercase tracking-wider mt-1">Zero Secrets Leaked</div>
          </div>
          <div>
            <div className="text-xl font-bold text-white">answer.md</div>
            <div className="text-[11px] text-zinc-500 uppercase tracking-wider mt-1">Dual Stream Output</div>
          </div>
        </div>
      </div>
    </section>
  );
}
