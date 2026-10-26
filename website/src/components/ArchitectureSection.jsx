import React from 'react';
import { ArrowDown, Database, Server, Cpu, Box, HardDrive, Network, CheckCircle } from 'lucide-react';

export default function ArchitectureSection() {
  return (
    <section id="architecture" className="py-24 bg-zinc-950 relative border-t border-zinc-800">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        {/* Header */}
        <div className="text-center max-w-3xl mx-auto mb-16">
          <span className="text-xs font-mono uppercase tracking-widest text-zinc-500">System Topology</span>
          <h2 className="text-3xl sm:text-4xl font-extrabold tracking-tight text-white font-mono mt-1">
            Cloud-Native Agent Infrastructure
          </h2>
          <p className="mt-3 text-sm sm:text-base text-zinc-400 font-sans">
            Nyxus completely decouples your developer workstation from heavy LLM orchestration. 
            All reasoning runs in secure, containerized Kubernetes pods keyed to your User ID.
          </p>
        </div>

        {/* 4 Architecture Pillars */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 font-mono text-xs">
          {/* Node 1 */}
          <div className="p-6 rounded-2xl bg-black border border-zinc-800 hover:border-zinc-500 transition-all shadow-lg flex flex-col justify-between">
            <div>
              <div className="w-10 h-10 rounded-xl bg-zinc-900 border border-zinc-700 flex items-center justify-center text-white mb-4">
                <Box className="w-5 h-5" />
              </div>
              <span className="text-[10px] text-zinc-500 uppercase tracking-widest block">LAYER 01</span>
              <h3 className="text-base font-bold text-white mt-1 mb-2 font-mono">VS Code Client</h3>
              <p className="text-zinc-400 font-sans leading-relaxed text-xs">
                Captures workspace changes, synchronizes incremental Git diffs, receives User ID via deep link URI, and streams responses into <code className="text-white">answer.md</code>.
              </p>
            </div>
            <div className="mt-6 pt-4 border-t border-zinc-900 text-[11px] text-zinc-500">
              Tech: React, Vite, TS, VS Code API
            </div>
          </div>

          {/* Node 2 */}
          <div className="p-6 rounded-2xl bg-black border border-zinc-800 hover:border-zinc-500 transition-all shadow-lg flex flex-col justify-between">
            <div>
              <div className="w-10 h-10 rounded-xl bg-zinc-900 border border-zinc-700 flex items-center justify-center text-white mb-4">
                <Network className="w-5 h-5" />
              </div>
              <span className="text-[10px] text-zinc-500 uppercase tracking-widest block">LAYER 02</span>
              <h3 className="text-base font-bold text-white mt-1 mb-2 font-mono">Ingress Gateway</h3>
              <p className="text-zinc-400 font-sans leading-relaxed text-xs">
                Nginx reverse-proxy on Port 80 routing HTTP uploads to Node.js (:5000) and real-time Socket.IO events to the Cluster Gateway (:3000).
              </p>
            </div>
            <div className="mt-6 pt-4 border-t border-zinc-900 text-[11px] text-zinc-500">
              Tech: Nginx, Express, Multer, Node
            </div>
          </div>

          {/* Node 3 */}
          <div className="p-6 rounded-2xl bg-black border border-zinc-800 hover:border-zinc-500 transition-all shadow-lg flex flex-col justify-between">
            <div>
              <div className="w-10 h-10 rounded-xl bg-zinc-900 border border-zinc-700 flex items-center justify-center text-white mb-4">
                <Database className="w-5 h-5" />
              </div>
              <span className="text-[10px] text-zinc-500 uppercase tracking-widest block">LAYER 03</span>
              <h3 className="text-base font-bold text-white mt-1 mb-2 font-mono">Persistence & Mesh</h3>
              <p className="text-zinc-400 font-sans leading-relaxed text-xs">
                MongoDB Atlas stores workspace metadata and user state. Redis manages active locks, while the K3s single-node cluster manages dynamic pod state.
              </p>
            </div>
            <div className="mt-6 pt-4 border-t border-zinc-900 text-[11px] text-zinc-500">
              Tech: MongoDB Atlas, Redis, K3s
            </div>
          </div>

          {/* Node 4 */}
          <div className="p-6 rounded-2xl bg-black border border-zinc-800 hover:border-zinc-500 transition-all shadow-lg flex flex-col justify-between">
            <div>
              <div className="w-10 h-10 rounded-xl bg-zinc-900 border border-zinc-700 flex items-center justify-center text-white mb-4">
                <Cpu className="w-5 h-5" />
              </div>
              <span className="text-[10px] text-zinc-500 uppercase tracking-widest block">LAYER 04</span>
              <h3 className="text-base font-bold text-white mt-1 mb-2 font-mono">Ephemeral Pods</h3>
              <p className="text-zinc-400 font-sans leading-relaxed text-xs">
                Isolated Kubernetes pods running LangGraph state machines. Features an automated 20-minute reaper daemon to purge idle runtimes safely.
              </p>
            </div>
            <div className="mt-6 pt-4 border-t border-zinc-900 text-[11px] text-zinc-500">
              Tech: Python, LangGraph, Gemini 2.5 Flash
            </div>
          </div>
        </div>

        {/* Visual Lifecycle Steps */}
        <div className="mt-12 p-6 rounded-2xl bg-black border border-zinc-800 font-mono text-xs">
          <div className="flex items-center gap-2 mb-4 text-white font-bold">
            <CheckCircle className="w-4 h-4 text-white" />
            <span>Authenticated Workspace Lifecycle</span>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4 text-zinc-400">
            <div className="p-3 rounded bg-zinc-950 border border-zinc-800/80">
              <span className="text-white block font-semibold mb-1">1. User ID Handshake</span>
              Web portal passes <code className="text-zinc-200">userId (email)</code> via deep link to extension.js.
            </div>
            <div className="p-3 rounded bg-zinc-950 border border-zinc-800/80">
              <span className="text-white block font-semibold mb-1">2. Staged Archive</span>
              Local git archive zipped to <code className="text-zinc-200">.nyxus/nyxus_workspace.zip</code> and uploaded.
            </div>
            <div className="p-3 rounded bg-zinc-950 border border-zinc-800/80">
              <span className="text-white block font-semibold mb-1">3. Pod Allocation</span>
              Cluster gateway queries K8s for user pod, spinning up container in &lt;15 seconds if cold.
            </div>
            <div className="p-3 rounded bg-zinc-950 border border-zinc-800/80">
              <span className="text-white block font-semibold mb-1">4. LangGraph Stream</span>
              Sub-agents parse AST, generate solutions, and stream markdown to <code className="text-zinc-200">answer.md</code>.
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
