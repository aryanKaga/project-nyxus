import React from 'react';
import { GitBranch, Shield, Zap, Terminal, Code2, Cpu, Check, Layers } from 'lucide-react';

export default function Features() {
  const features = [
    {
      icon: Cpu,
      title: "Ephemeral Pod Isolation",
      description: "Every staging operation maps to a sandbox container running on K3s. Runtimes dynamically reap after 20 minutes of idle inactivity, minimizing cloud footprint.",
      tag: "INFRASTRUCTURE"
    },
    {
      icon: GitBranch,
      title: "Zero-Trust Git Staging",
      description: "Nyxus packages your workspace using Git tree snapshots, honoring .gitignore automatically so secrets and build artifacts never leave your perimeter.",
      tag: "PRIVACY"
    },
    {
      icon: Terminal,
      title: "answer.md Dual Streaming",
      description: "Reasoning outputs aren't trapped in cramped sidebar textboxes. Answers stream simultaneously into an interactive webview and a full-fidelity answer.md file.",
      tag: "WORKFLOW"
    },
    {
      icon: Layers,
      title: "LangGraph State Machines",
      description: "Sub-agents coordinate cyclically across file discovery, AST indexing, and code generation passes, ensuring multi-file context accuracy.",
      tag: "AI REASONING"
    },
    {
      icon: Shield,
      title: "Deep-Link User ID Mapping",
      description: "One-click authentication from this web portal binds your email as your permanent User ID in VS Code SecretStorage with zero manual typing.",
      tag: "SECURITY"
    },
    {
      icon: Zap,
      title: "Delta Incremental Sync",
      description: "Subsequent requests transmit lightweight file deltas rather than whole archives, keeping round-trip latency under 150 milliseconds.",
      tag: "PERFORMANCE"
    }
  ];

  return (
    <section id="features" className="py-24 bg-black relative border-t border-zinc-800">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="text-center max-w-3xl mx-auto mb-16">
          <span className="text-xs font-mono uppercase tracking-widest text-zinc-500">Core Capabilities</span>
          <h2 className="text-3xl sm:text-4xl font-extrabold tracking-tight text-white font-mono mt-1">
            Engineered for High-Velocity Engineering
          </h2>
          <p className="mt-3 text-sm sm:text-base text-zinc-400 font-sans">
            Minimalist black and white design with deep cloud orchestration under the hood.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {features.map((f, i) => {
            const Icon = f.icon;
            return (
              <div 
                key={i} 
                className="p-7 rounded-2xl bg-zinc-950 border border-zinc-800 hover:border-zinc-500 transition-all duration-300 group hover:-translate-y-1"
              >
                <div className="flex items-center justify-between mb-4">
                  <div className="w-10 h-10 rounded-xl bg-zinc-900 border border-zinc-700 flex items-center justify-center text-white group-hover:bg-white group-hover:text-black transition-colors">
                    <Icon className="w-5 h-5" />
                  </div>
                  <span className="text-[10px] font-mono tracking-wider px-2 py-0.5 rounded bg-zinc-900 text-zinc-400 border border-zinc-800">
                    {f.tag}
                  </span>
                </div>
                <h3 className="text-lg font-bold text-white font-mono mb-2">
                  {f.title}
                </h3>
                <p className="text-xs sm:text-sm text-zinc-400 font-sans leading-relaxed">
                  {f.description}
                </p>
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}
