import React, { useState } from 'react';
import { Terminal, Cpu, FileText, CheckCircle2, RefreshCw } from 'lucide-react';

export default function TerminalPreview() {
  const [activeTab, setActiveTab] = useState('session');
  const [isSimulating, setIsSimulating] = useState(false);
  const [simStep, setSimStep] = useState(3);

  const restartSimulation = () => {
    setIsSimulating(true);
    setSimStep(0);
    setTimeout(() => setSimStep(1), 500);
    setTimeout(() => setSimStep(2), 1200);
    setTimeout(() => setSimStep(3), 2000);
    setTimeout(() => setIsSimulating(false), 2400);
  };

  return (
    <section id="terminal" className="py-20 bg-black relative border-t border-zinc-900">
      <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
        {/* Section title */}
        <div className="flex flex-col md:flex-row md:items-end justify-between mb-8 pb-4 border-b border-zinc-800">
          <div>
            <span className="text-xs font-mono uppercase tracking-widest text-zinc-500">Live Workspace Execution</span>
            <h2 className="text-2xl sm:text-3xl font-bold font-mono text-white mt-1">
              Staging & Ephemeral Pod Telemetry
            </h2>
          </div>
          <div className="mt-4 md:mt-0 flex items-center gap-2">
            <button
              onClick={restartSimulation}
              disabled={isSimulating}
              className="inline-flex items-center gap-2 px-3 py-1.5 rounded-lg bg-zinc-900 border border-zinc-700 text-xs font-mono text-zinc-300 hover:text-white hover:bg-zinc-800 transition"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${isSimulating ? 'animate-spin' : ''}`} />
              <span>Simulate Staging Cycle</span>
            </button>
          </div>
        </div>

        {/* Terminal Chrome Window */}
        <div className="rounded-2xl border border-zinc-700/80 bg-zinc-950 overflow-hidden shadow-2xl font-mono text-xs">
          {/* Top Bar */}
          <div className="flex items-center justify-between px-4 py-3 bg-zinc-900/90 border-b border-zinc-800">
            <div className="flex items-center gap-2">
              <span className="w-3 h-3 rounded-full bg-zinc-700 inline-block border border-zinc-600" />
              <span className="w-3 h-3 rounded-full bg-zinc-700 inline-block border border-zinc-600" />
              <span className="w-3 h-3 rounded-full bg-zinc-700 inline-block border border-zinc-600" />
              <span className="ml-2 text-zinc-400 font-medium">nyxus-runtime://workspace-session</span>
            </div>

            {/* Tabs */}
            <div className="flex items-center gap-1 bg-black/60 p-1 rounded-lg border border-zinc-800">
              <button
                onClick={() => setActiveTab('session')}
                className={`px-2.5 py-1 rounded text-[11px] font-medium transition ${
                  activeTab === 'session' ? 'bg-zinc-800 text-white' : 'text-zinc-500 hover:text-zinc-300'
                }`}
              >
                Staging Log
              </button>
              <button
                onClick={() => setActiveTab('k8s')}
                className={`px-2.5 py-1 rounded text-[11px] font-medium transition ${
                  activeTab === 'k8s' ? 'bg-zinc-800 text-white' : 'text-zinc-500 hover:text-zinc-300'
                }`}
              >
                K8s Pod Gateway
              </button>
              <button
                onClick={() => setActiveTab('answer')}
                className={`px-2.5 py-1 rounded text-[11px] font-medium transition ${
                  activeTab === 'answer' ? 'bg-zinc-800 text-white' : 'text-zinc-500 hover:text-zinc-300'
                }`}
              >
                answer.md Stream
              </button>
            </div>
          </div>

          {/* Terminal Body */}
          <div className="p-5 sm:p-6 min-h-[300px] bg-black text-zinc-300 space-y-3 leading-relaxed">
            {activeTab === 'session' && (
              <>
                <div className="text-zinc-500 font-mono">
                  [Nyxus Extension v0.0.3 initialized in VS Code]
                </div>
                <div className="text-zinc-400">
                  <span className="text-white font-bold">&gt; GIT SCAN:</span> Inspecting staged working tree
                </div>
                <div className="pl-4 border-l border-zinc-800 text-zinc-300">
                  .gitignore loaded &bull; Excluded: node_modules/, .venv/, .env, dist/
                </div>

                {simStep >= 1 && (
                  <>
                    <div className="text-zinc-400 pt-1">
                      <span className="text-white font-bold">&gt; PACKAGING:</span> Compressing staged git files into archive
                    </div>
                    <div className="pl-4 border-l border-zinc-800 text-zinc-400">
                      Target: <span className="text-zinc-200">.nyxus/nyxus_workspace.zip</span> &bull; 48 tracked files (1.2 MB)
                    </div>
                  </>
                )}

                {simStep >= 2 && (
                  <>
                    <div className="text-zinc-400 pt-1">
                      <span className="text-white font-bold">&gt; GATEWAY UPLOAD:</span> POST http://54.79.152.236/upload
                    </div>
                    <div className="pl-4 border-l border-zinc-800 text-zinc-400">
                      Status: <span className="text-white font-bold">200 OK</span> &bull; Assigned Workspace ID: <span className="text-white font-mono">ws_demo_8a49c</span>
                      <br />
                      Dispatching to Cluster Gateway (:3000)...
                    </div>
                  </>
                )}

                {simStep >= 3 && (
                  <>
                    <div className="text-white font-bold pt-1 flex items-center gap-2">
                      <CheckCircle2 className="w-4 h-4 text-white" />
                      <span>&gt; POD CONNECTED: WebSocket stream established on namespace 'nyxus'</span>
                    </div>
                    <div className="pl-4 border-l border-white/40 text-zinc-300">
                      Pod: <span className="text-white">agent-pod-k3s-runner</span> initialized.
                      <br />
                      CodeGraph AST indexed. Ready for questions in sidebar or auto-streaming to <span className="text-white underline">answer.md</span>.
                    </div>
                  </>
                )}
              </>
            )}

            {activeTab === 'k8s' && (
              <div className="space-y-2 text-zinc-400">
                <div className="text-zinc-500">
                  [cluster_gateway.py: k8s_client.CoreV1Api connected to in-cluster K3s]
                </div>
                <div>
                  <span className="text-zinc-600">[19:45:01]</span> <span className="text-white">PROVISION_POD</span> for workspace ws_demo_8a49c
                </div>
                <div>
                  <span className="text-zinc-600">[19:45:03]</span> Pod status: <span className="text-white font-semibold">Running</span> (Pod IP: 10.42.0.84)
                </div>
                <div>
                  <span className="text-zinc-600">[19:45:04]</span> Forwarding Socket.IO event stream to LangGraph runtime (port 3000)...
                </div>
                <div>
                  <span className="text-zinc-600">[19:45:05]</span> Langfuse session active &bull; Idle reaper armed (20-minute timeout).
                </div>
              </div>
            )}

            {activeTab === 'answer' && (
              <div className="space-y-3 font-sans text-xs">
                <div className="flex items-center gap-2 pb-2 border-b border-zinc-800 font-mono text-[11px] text-zinc-400">
                  <FileText className="w-3.5 h-3.5 text-white" />
                  <span>workspace/answer.md (Live Dual Stream)</span>
                </div>
                <h4 className="text-sm font-bold text-white font-mono">
                  # Nyxus Multi-Agent Execution Plan
                </h4>
                <p className="text-zinc-300">
                  The staged files have been analyzed. Here is the suggested implementation:
                </p>
                <div className="p-3 rounded bg-zinc-900/90 border border-zinc-800 font-mono text-[11px] text-zinc-300">
                  <code>
                    1. Staged files verified: .gitignore preserved secret tokens.<br />
                    2. CodeGraph AST indexed: 14 functions, 3 classes mapped.<br />
                    3. Solution streamed in real-time to answer.md and sidebar webview.
                  </code>
                </div>
              </div>
            )}
          </div>

          {/* Terminal Footer Status */}
          <div className="px-4 py-2 bg-zinc-900/70 border-t border-zinc-800/80 flex items-center justify-between text-[11px] text-zinc-400 font-mono">
            <div className="flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-white animate-pulse" />
              <span>Workspace Staging: Active</span>
            </div>
            <span>Protocol: WebSocket &bull; Port: 80/NGINX</span>
          </div>
        </div>
      </div>
    </section>
  );
}
