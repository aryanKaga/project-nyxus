import React, { useState } from 'react';
import { 
  Terminal, 
  Copy, 
  Check, 
  ExternalLink, 
  ShieldCheck, 
  Layers, 
  Radio, 
  Cpu, 
  FileCode, 
  FolderGit2, 
  Sparkles,
  Command,
  ArrowUpRight
} from 'lucide-react';

export default function UserIdDashboard({ user, onOpenExtension }) {
  const [copiedId, setCopiedId] = useState(false);
  const [copiedSettings, setCopiedSettings] = useState(false);
  const [copiedDeepLink, setCopiedDeepLink] = useState(false);
  const [copiedCli, setCopiedCli] = useState(false);
  const [launchStatus, setLaunchStatus] = useState(null);

  if (!user) return null;

  const deepLink = `vscode://aryanKaga.nyxus-coding-agent-replica/auth?userId=${encodeURIComponent(user.email)}`;
  const cursorDeepLink = `cursor://aryanKaga.nyxus-coding-agent-replica/auth?userId=${encodeURIComponent(user.email)}`;
  const insidersDeepLink = `vscode-insiders://aryanKaga.nyxus-coding-agent-replica/auth?userId=${encodeURIComponent(user.email)}`;

  const settingsSnippet = JSON.stringify({
    "nyxusReplica.userId": user.email,
    "nyxusReplica.url": "http://54.79.152.236",
    "nyxusReplica.enableWorkspaceSync": true
  }, null, 2);

  const cliCommand = `code --command nyxusReplica.openSidebar`;

  const copyToClipboard = (text, setCopiedFn) => {
    navigator.clipboard.writeText(text);
    setCopiedFn(true);
    setTimeout(() => setCopiedFn(false), 2000);
  };

  const handleLaunch = (url, name) => {
    setLaunchStatus(`Dispatching URI to ${name}...`);
    window.location.href = url;
    setTimeout(() => {
      setLaunchStatus(`Extension triggered with User ID: ${user.email}`);
    }, 1500);
    setTimeout(() => {
      setLaunchStatus(null);
    }, 5000);
  };

  return (
    <section id="extension" className="py-16 bg-black relative border-y border-zinc-800">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        {/* Section Header */}
        <div className="text-center max-w-3xl mx-auto mb-12">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-zinc-900 border border-zinc-700 text-xs font-mono text-zinc-300 mb-3">
            <Radio className="w-3.5 h-3.5 text-white animate-pulse" />
            <span>AUTHENTICATED DEVELOPER IDENTIFIER</span>
          </div>
          <h2 className="text-3xl sm:text-4xl font-extrabold tracking-tight text-white font-mono">
            Your Nyxus User ID Configuration
          </h2>
          <p className="mt-3 text-sm sm:text-base text-zinc-400 font-sans">
            Your email has been assigned as your unique Nyxus User ID. Launch your extension with one click to bind local staging to your isolated cloud pods.
          </p>
        </div>

        {/* Main Grid: Card & Extension Action Panel */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
          {/* Left Column: Futuristic Monochrome ID Credential Card */}
          <div className="lg:col-span-5">
            <div className="relative rounded-2xl bg-gradient-to-br from-zinc-900 via-black to-zinc-950 border border-zinc-700/80 p-6 sm:p-7 shadow-2xl overflow-hidden group hover:border-zinc-500 transition-all">
              {/* Corner tech lines */}
              <div className="absolute top-0 right-0 w-24 h-24 bg-white/[0.03] rotate-45 pointer-events-none" />
              <div className="absolute -bottom-8 -right-8 w-32 h-32 bg-white/[0.02] rounded-full blur-xl pointer-events-none" />

              {/* Card top banner */}
              <div className="flex items-center justify-between pb-5 border-b border-zinc-800/80">
                <div className="flex items-center gap-2.5">
                  <div className="w-8 h-8 rounded-lg bg-white flex items-center justify-center">
                    <img src="/logo.svg" alt="Nyxus" className="w-5 h-5" />
                  </div>
                  <div>
                    <span className="text-xs font-mono font-bold tracking-widest text-white uppercase">NYXUS PASS</span>
                    <span className="block text-[10px] font-mono text-zinc-500">K8S AGENT PROTOCOL</span>
                  </div>
                </div>
                <span className="flex items-center gap-1.5 px-2 py-0.5 rounded text-[10px] font-mono bg-zinc-800 text-white border border-zinc-700">
                  <ShieldCheck className="w-3 h-3 text-white" />
                  ACTIVE
                </span>
              </div>

              {/* Card Middle: Primary User ID (Email) */}
              <div className="py-6 space-y-4">
                <div>
                  <label className="text-[10px] font-mono uppercase tracking-widest text-zinc-500 block mb-1">
                    Assigned User ID (Email)
                  </label>
                  <div className="flex items-center justify-between p-3 rounded-xl bg-zinc-900/90 border border-zinc-700/90 group/box hover:border-white transition-colors">
                    <div className="font-mono text-sm sm:text-base font-bold text-white tracking-tight break-all">
                      {user.email}
                    </div>
                    <button
                      onClick={() => copyToClipboard(user.email, setCopiedId)}
                      className="ml-2 p-1.5 text-zinc-400 hover:text-white rounded-md hover:bg-zinc-800 transition-colors shrink-0"
                      title="Copy User ID"
                    >
                      {copiedId ? <Check className="w-4 h-4 text-white" /> : <Copy className="w-4 h-4" />}
                    </button>
                  </div>
                </div>

                {/* Sub Metadata Fields */}
                <div className="grid grid-cols-2 gap-3 pt-2 text-xs font-mono">
                  <div className="p-2.5 rounded-lg bg-zinc-900/40 border border-zinc-800">
                    <span className="text-[10px] text-zinc-500 block uppercase">Gateway Endpoint</span>
                    <span className="text-zinc-300 font-medium">http://54.79.152.236</span>
                  </div>
                  <div className="p-2.5 rounded-lg bg-zinc-900/40 border border-zinc-800">
                    <span className="text-[10px] text-zinc-500 block uppercase">Namespace Scope</span>
                    <span className="text-zinc-300 font-medium">nyxus / dynamic</span>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3 text-xs font-mono">
                  <div className="p-2.5 rounded-lg bg-zinc-900/40 border border-zinc-800">
                    <span className="text-[10px] text-zinc-500 block uppercase">Auth Scheme</span>
                    <span className="text-zinc-300 font-medium">{user.authType === 'google' ? 'Google OAuth 2.0' : 'Direct Developer'}</span>
                  </div>
                  <div className="p-2.5 rounded-lg bg-zinc-900/40 border border-zinc-800">
                    <span className="text-[10px] text-zinc-500 block uppercase">Pod Idle Timeout</span>
                    <span className="text-zinc-300 font-medium">20 mins (Reaper)</span>
                  </div>
                </div>
              </div>

              {/* Barcode / Cryptographic Visual Strip */}
              <div className="pt-4 border-t border-zinc-800/80 flex items-center justify-between font-mono text-[10px] text-zinc-500">
                <span className="tracking-widest">ID::{user.email.replace(/[@.]/g, '_').toUpperCase()}</span>
                <span className="opacity-75">NYX-K8S-V2</span>
              </div>
            </div>
          </div>

          {/* Right Column: Launch Extension & Integration Center */}
          <div className="lg:col-span-7 space-y-6">
            {/* Primary Action Card */}
            <div className="p-6 rounded-2xl bg-zinc-950 border border-zinc-800 shadow-xl">
              <div className="flex items-center gap-3 mb-4">
                <div className="p-2 rounded-lg bg-white text-black">
                  <Terminal className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-lg font-bold font-mono text-white">
                    Direct Extension Synchronization
                  </h3>
                  <p className="text-xs text-zinc-400 font-sans">
                    Instantly opens VS Code and injects your exact User ID configuration into SecretStorage.
                  </p>
                </div>
              </div>

              {/* Launch Status Notification Banner */}
              {launchStatus && (
                <div className="mb-4 p-3 rounded-lg bg-zinc-900 border border-white/20 text-xs font-mono text-white flex items-center gap-2 animate-in fade-in">
                  <Check className="w-4 h-4 text-white" />
                  <span>{launchStatus}</span>
                </div>
              )}

              {/* Big Launch Button */}
              <div className="space-y-3">
                <button
                  onClick={() => handleLaunch(deepLink, 'VS Code')}
                  className="w-full flex items-center justify-between px-6 py-4 rounded-xl bg-white text-black font-mono font-bold text-sm hover:bg-zinc-200 transition-all shadow-[0_0_30px_rgba(255,255,255,0.2)] hover:scale-[1.01] active:scale-[0.99] group"
                >
                  <div className="flex items-center gap-3">
                    <Terminal className="w-5 h-5" />
                    <div className="text-left">
                      <div className="leading-tight">Open in Visual Studio Code</div>
                      <div className="text-[11px] font-normal text-zinc-700">
                        Applies userId = "{user.email}" and reveals sidebar
                      </div>
                    </div>
                  </div>
                  <ArrowUpRight className="w-5 h-5 transition-transform group-hover:translate-x-0.5 group-hover:-translate-y-0.5" />
                </button>

                {/* Secondary Editor Launchers */}
                <div className="grid grid-cols-2 gap-3 pt-1">
                  <button
                    onClick={() => handleLaunch(cursorDeepLink, 'Cursor')}
                    className="flex items-center justify-center gap-2 py-2.5 px-3 rounded-lg bg-zinc-900 hover:bg-zinc-850 border border-zinc-800 hover:border-zinc-700 text-xs font-mono text-zinc-300 transition-colors"
                  >
                    <span>Open in Cursor</span>
                    <ExternalLink className="w-3.5 h-3.5 text-zinc-500" />
                  </button>
                  <button
                    onClick={() => handleLaunch(insidersDeepLink, 'VS Code Insiders')}
                    className="flex items-center justify-center gap-2 py-2.5 px-3 rounded-lg bg-zinc-900 hover:bg-zinc-850 border border-zinc-800 hover:border-zinc-700 text-xs font-mono text-zinc-300 transition-colors"
                  >
                    <span>Open in VS Code Insiders</span>
                    <ExternalLink className="w-3.5 h-3.5 text-zinc-500" />
                  </button>
                </div>
              </div>

              {/* Step indicator */}
              <div className="mt-6 pt-5 border-t border-zinc-850 grid grid-cols-3 gap-2 text-center text-xs font-mono">
                <div className="p-2 rounded bg-zinc-900/60 border border-zinc-800">
                  <span className="text-[10px] text-zinc-500 block">STEP 1</span>
                  <span className="text-zinc-300 font-semibold">Logged In</span>
                </div>
                <div className="p-2 rounded bg-zinc-900/60 border border-zinc-800">
                  <span className="text-[10px] text-zinc-500 block">STEP 2</span>
                  <span className="text-zinc-300 font-semibold">Click Launch</span>
                </div>
                <div className="p-2 rounded bg-zinc-900/60 border border-zinc-800">
                  <span className="text-[10px] text-zinc-500 block">STEP 3</span>
                  <span className="text-white font-semibold">Ready to Code</span>
                </div>
              </div>
            </div>

            {/* Manual Configuration & JSON Snippet */}
            <div className="p-5 rounded-2xl bg-zinc-950 border border-zinc-850 space-y-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2 text-xs font-mono font-semibold text-zinc-300">
                  <FileCode className="w-4 h-4 text-white" />
                  <span>Manual VS Code settings.json Config</span>
                </div>
                <button
                  onClick={() => copyToClipboard(settingsSnippet, setCopiedSettings)}
                  className="flex items-center gap-1.5 text-[11px] font-mono text-zinc-400 hover:text-white px-2 py-1 rounded bg-zinc-900 border border-zinc-800 hover:border-zinc-700 transition"
                >
                  {copiedSettings ? <Check className="w-3.5 h-3.5 text-white" /> : <Copy className="w-3.5 h-3.5" />}
                  <span>{copiedSettings ? 'Copied JSON' : 'Copy JSON'}</span>
                </button>
              </div>

              <pre className="p-3 rounded-lg bg-zinc-900/90 border border-zinc-800 font-mono text-xs text-zinc-300 overflow-x-auto">
                <code>{settingsSnippet}</code>
              </pre>

              {/* Deep Link URL Copy */}
              <div className="flex items-center justify-between pt-2 border-t border-zinc-850 text-xs font-mono">
                <span className="text-zinc-500 truncate max-w-[280px] sm:max-w-[420px]">
                  URI: {deepLink}
                </span>
                <button
                  onClick={() => copyToClipboard(deepLink, setCopiedDeepLink)}
                  className="text-zinc-300 hover:text-white underline text-[11px] shrink-0"
                >
                  {copiedDeepLink ? 'Copied Deep Link' : 'Copy URI'}
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
