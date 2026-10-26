import React, { useState } from 'react';
import { 
  Download, 
  FileText, 
  FolderGit2, 
  Terminal, 
  Check, 
  Copy, 
  ExternalLink, 
  ShieldAlert, 
  Sparkles, 
  Layers, 
  ArrowRight,
  Code2,
  CheckCircle2,
  Play
} from 'lucide-react';

export default function GettingStarted({ onOpenExtension }) {
  const [copiedStep, setCopiedStep] = useState(null);
  const [activePreset, setActivePreset] = useState('fullstack');

  const copyText = (key, text) => {
    navigator.clipboard.writeText(text);
    setCopiedStep(key);
    setTimeout(() => setCopiedStep(null), 2000);
  };

  const gitignoreTemplates = {
    fullstack: `# Nyxus Recommended .gitignore
# Environment variables and secrets (CRITICAL)
.env
.env.*
*.env
atlast-credentials.env

# Dependencies & Package Managers
node_modules/
.pnp
.pnp.js

# Python Virtual Environments & Bytecode
.venv/
venv/
env/
__pycache__/
*.py[cod]

# Build Outputs & Bundlers
dist/
build/
out/
.next/
.nuxt/

# Nyxus Local State & Archives
.nyxus/
*.log
nyxus_auto_memory.txt

# OS Files
.DS_Store
Thumbs.db
`,
    node: `# Node.js & Web .gitignore
node_modules/
npm-debug.log*
yarn-debug.log*
yarn-error.log*
.pnpm-debug.log*

.env
.env.local
.env.production

dist/
build/
.cache/
.nyxus/
`,
    python: `# Python .gitignore
__pycache__/
*.py[cod]
*$py.class
*.so
.Python
env/
venv/
.venv/
build/
dist/

.env
*.env
.nyxus/
`
  };

  return (
    <section id="workflow" className="py-24 bg-black relative border-t border-zinc-850">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        {/* Section Header */}
        <div className="text-center max-w-3xl mx-auto mb-20">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-zinc-900 border border-zinc-700 text-xs font-mono text-zinc-300 mb-3">
            <Layers className="w-3.5 h-3.5 text-white" />
            <span>DEVELOPER WORKFLOW</span>
          </div>
          <h2 className="text-3xl sm:text-5xl font-extrabold tracking-tight text-white font-mono">
            How to Use Nyxus
          </h2>
          <p className="mt-4 text-sm sm:text-base text-zinc-400 font-sans leading-relaxed">
            Follow this 4-step guide to install the extension, secure your repository with <code className="text-white">.gitignore</code>, stage code using <code className="text-white">git add .</code>, and launch dynamic Kubernetes reasoning pods.
          </p>
        </div>

        {/* Step 1: Download & Install */}
        <div id="install" className="mb-20 scroll-mt-24">
          <div className="rounded-2xl bg-zinc-950 border border-zinc-800 p-6 sm:p-10 shadow-2xl relative overflow-hidden group hover:border-zinc-600 transition-colors">
            <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-8">
              <div className="space-y-4 max-w-2xl">
                <div className="flex items-center gap-3">
                  <span className="flex items-center justify-center w-8 h-8 rounded-lg bg-white text-black font-mono font-bold text-sm">
                    01
                  </span>
                  <span className="text-xs font-mono uppercase tracking-widest text-zinc-400">Step One</span>
                </div>
                <h3 className="text-2xl sm:text-3xl font-bold font-mono text-white">
                  Download & Install the Extension in VS Code
                </h3>
                <p className="text-sm text-zinc-400 font-sans leading-relaxed">
                  You can install Nyxus directly from the Visual Studio Code Extensions Marketplace or execute the CLI installation command in your terminal.
                </p>

                <div className="pt-2 flex flex-wrap items-center gap-3">
                  <button
                    onClick={onOpenExtension}
                    className="inline-flex items-center gap-2 px-5 py-2.5 rounded-lg bg-white text-black font-mono font-bold text-xs hover:bg-zinc-200 transition-all shadow-md active:scale-95"
                  >
                    <Download className="w-4 h-4" />
                    <span>Open in VS Code</span>
                    <ExternalLink className="w-3.5 h-3.5 ml-1" />
                  </button>

                  <a
                    href="vscode:extension/aryanKaga.nyxus-coding-agent-replica"
                    className="inline-flex items-center gap-2 px-5 py-2.5 rounded-lg bg-zinc-900 border border-zinc-700 text-xs font-mono text-zinc-200 hover:bg-zinc-800 hover:text-white transition-all"
                  >
                    <span>Marketplace Deep Link</span>
                    <ExternalLink className="w-3.5 h-3.5 text-zinc-400" />
                  </a>
                </div>
              </div>

              {/* CLI command box */}
              <div className="w-full lg:w-auto lg:min-w-[380px] p-5 rounded-xl bg-black border border-zinc-800/90 font-mono text-xs space-y-3">
                <div className="flex items-center justify-between text-zinc-400 text-[11px] pb-2 border-b border-zinc-900">
                  <span>TERMINAL INSTALLATION</span>
                  <button
                    onClick={() => copyText('cli', 'code --install-extension aryanKaga.nyxus-coding-agent-replica')}
                    className="flex items-center gap-1 text-zinc-400 hover:text-white transition"
                  >
                    {copiedStep === 'cli' ? <Check className="w-3.5 h-3.5 text-white" /> : <Copy className="w-3.5 h-3.5" />}
                    <span>{copiedStep === 'cli' ? 'Copied' : 'Copy'}</span>
                  </button>
                </div>
                <div className="p-3 rounded-lg bg-zinc-950 border border-zinc-850 text-zinc-300 overflow-x-auto">
                  <code>code --install-extension aryanKaga.nyxus-coding-agent-replica</code>
                </div>
                <p className="text-[11px] text-zinc-500 font-sans">
                  Or press <kbd className="px-1.5 py-0.5 rounded bg-zinc-900 border border-zinc-700 text-zinc-300 font-mono text-[10px]">Ctrl+Shift+X</kbd> in VS Code and search for <strong>Nyxus</strong>.
                </p>
              </div>
            </div>
          </div>
        </div>

        {/* Step 2: Create .gitignore */}
        <div id="gitignore" className="mb-20 scroll-mt-24">
          <div className="rounded-2xl bg-zinc-950 border border-zinc-800 p-6 sm:p-10 shadow-2xl relative overflow-hidden group hover:border-zinc-600 transition-colors">
            <div className="flex flex-col lg:flex-row justify-between gap-8">
              <div className="space-y-4 max-w-xl">
                <div className="flex items-center gap-3">
                  <span className="flex items-center justify-center w-8 h-8 rounded-lg bg-white text-black font-mono font-bold text-sm">
                    02
                  </span>
                  <span className="text-xs font-mono uppercase tracking-widest text-zinc-400">Step Two</span>
                </div>
                <h3 className="text-2xl sm:text-3xl font-bold font-mono text-white">
                  Create a Clean <code className="text-white bg-zinc-900 px-2 py-0.5 rounded border border-zinc-800">.gitignore</code>
                </h3>
                <p className="text-sm text-zinc-400 font-sans leading-relaxed">
                  Before staging your repository, it is <strong>critical</strong> to have a <code className="text-white">.gitignore</code> file in your project root.
                </p>

                {/* Important notice alert */}
                <div className="p-4 rounded-xl bg-zinc-900/80 border border-zinc-700/80 text-xs text-zinc-300 space-y-2 font-sans">
                  <div className="flex items-center gap-2 font-mono font-bold text-white text-[11px] uppercase tracking-wider">
                    <ShieldAlert className="w-4 h-4 text-white" />
                    <span>Why .gitignore is mandatory:</span>
                  </div>
                  <ul className="list-disc list-inside space-y-1.5 text-zinc-400 text-xs">
                    <li><strong className="text-zinc-200">Security:</strong> Prevents API keys, passwords, and <code className="text-zinc-200">.env</code> files from being packaged.</li>
                    <li><strong className="text-zinc-200">Speed:</strong> Excludes huge dependency trees like <code className="text-zinc-200">node_modules/</code> or <code className="text-zinc-200">.venv/</code>, keeping your zip archive under 2MB.</li>
                    <li><strong className="text-zinc-200">Accuracy:</strong> Allows the AST CodeGraph parser to index only your real source code.</li>
                  </ul>
                </div>

                {/* Preset switcher */}
                <div className="pt-2">
                  <span className="text-[11px] font-mono uppercase text-zinc-500 block mb-2">Select Preset Template:</span>
                  <div className="flex items-center gap-2">
                    {['fullstack', 'node', 'python'].map((key) => (
                      <button
                        key={key}
                        onClick={() => setActivePreset(key)}
                        className={`px-3 py-1.5 rounded-lg text-xs font-mono transition capitalize ${
                          activePreset === key 
                            ? 'bg-white text-black font-bold' 
                            : 'bg-zinc-900 text-zinc-400 hover:text-white border border-zinc-800'
                        }`}
                      >
                        {key === 'fullstack' ? 'Full Stack' : key === 'node' ? 'Node.js' : 'Python'}
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              {/* .gitignore Code Preview Window */}
              <div className="w-full lg:w-7/12 rounded-xl bg-black border border-zinc-800 font-mono text-xs overflow-hidden flex flex-col justify-between">
                <div className="flex items-center justify-between px-4 py-2.5 bg-zinc-900 border-b border-zinc-800 text-[11px]">
                  <div className="flex items-center gap-2 text-zinc-300">
                    <FileText className="w-3.5 h-3.5 text-white" />
                    <span>.gitignore ({activePreset})</span>
                  </div>
                  <button
                    onClick={() => copyText('gitignore', gitignoreTemplates[activePreset])}
                    className="flex items-center gap-1.5 text-zinc-400 hover:text-white px-2.5 py-1 rounded bg-zinc-800 hover:bg-zinc-700 transition"
                  >
                    {copiedStep === 'gitignore' ? <Check className="w-3.5 h-3.5 text-white" /> : <Copy className="w-3.5 h-3.5" />}
                    <span>{copiedStep === 'gitignore' ? 'Copied .gitignore' : 'Copy Content'}</span>
                  </button>
                </div>
                <pre className="p-4 text-zinc-300 max-h-[300px] overflow-y-auto overflow-x-auto text-[11px] leading-relaxed bg-black">
                  <code>{gitignoreTemplates[activePreset]}</code>
                </pre>
                <div className="px-4 py-2 bg-zinc-900/60 border-t border-zinc-900 text-[10px] text-zinc-500 flex items-center justify-between">
                  <span>Place this file in the root of your project</span>
                  <span>Nyxus ignores ignored files automatically</span>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Step 3: Run git add . */}
        <div id="staging" className="mb-20 scroll-mt-24">
          <div className="rounded-2xl bg-zinc-950 border border-zinc-800 p-6 sm:p-10 shadow-2xl relative overflow-hidden group hover:border-zinc-600 transition-colors">
            <div className="flex flex-col lg:flex-row justify-between gap-8">
              <div className="space-y-4 max-w-xl">
                <div className="flex items-center gap-3">
                  <span className="flex items-center justify-center w-8 h-8 rounded-lg bg-white text-black font-mono font-bold text-sm">
                    03
                  </span>
                  <span className="text-xs font-mono uppercase tracking-widest text-zinc-400">Step Three</span>
                </div>
                <h3 className="text-2xl sm:text-3xl font-bold font-mono text-white">
                  Stage Changes with <code className="text-white bg-zinc-900 px-2 py-0.5 rounded border border-zinc-800">git add .</code>
                </h3>
                <p className="text-sm text-zinc-400 font-sans leading-relaxed">
                  Nyxus snapshots your <strong>staged working tree</strong>. Staging your files tells Nyxus exactly which source files and modifications should be transmitted to your cloud pod.
                </p>

                <div className="space-y-2 text-xs font-sans text-zinc-300">
                  <div className="flex items-start gap-2">
                    <CheckCircle2 className="w-4 h-4 text-white shrink-0 mt-0.5" />
                    <span>If your folder isn't a Git repository yet, initialize it with <code className="text-white font-mono bg-zinc-900 px-1 py-0.5 rounded">git init</code>.</span>
                  </div>
                  <div className="flex items-start gap-2">
                    <CheckCircle2 className="w-4 h-4 text-white shrink-0 mt-0.5" />
                    <span>Run <code className="text-white font-mono bg-zinc-900 px-1 py-0.5 rounded">git add .</code> to stage your codebase while respecting <code className="text-white font-mono">.gitignore</code>.</span>
                  </div>
                  <div className="flex items-start gap-2">
                    <CheckCircle2 className="w-4 h-4 text-white shrink-0 mt-0.5" />
                    <span>Verify staged files with <code className="text-white font-mono bg-zinc-900 px-1 py-0.5 rounded">git status</code>.</span>
                  </div>
                </div>
              </div>

              {/* Terminal command execution block */}
              <div className="w-full lg:w-7/12 rounded-xl bg-black border border-zinc-800 font-mono text-xs overflow-hidden">
                <div className="flex items-center justify-between px-4 py-2.5 bg-zinc-900 border-b border-zinc-800 text-[11px]">
                  <div className="flex items-center gap-2 text-zinc-300">
                    <Terminal className="w-3.5 h-3.5 text-white" />
                    <span>Terminal / Command Prompt</span>
                  </div>
                  <button
                    onClick={() => copyText('gitadd', 'git init\ngit add .\ngit status')}
                    className="flex items-center gap-1.5 text-zinc-400 hover:text-white px-2.5 py-1 rounded bg-zinc-800 hover:bg-zinc-700 transition"
                  >
                    {copiedStep === 'gitadd' ? <Check className="w-3.5 h-3.5 text-white" /> : <Copy className="w-3.5 h-3.5" />}
                    <span>{copiedStep === 'gitadd' ? 'Copied' : 'Copy Commands'}</span>
                  </button>
                </div>
                <div className="p-4 space-y-3 bg-black text-zinc-300">
                  <div>
                    <span className="text-zinc-600 select-none">$ </span>
                    <span className="text-white font-bold">git init</span>
                    <span className="text-zinc-500 block text-[11px] mt-0.5"># Initialized empty Git repository (if not already done)</span>
                  </div>
                  <div>
                    <span className="text-zinc-600 select-none">$ </span>
                    <span className="text-white font-bold">git add .</span>
                    <span className="text-zinc-500 block text-[11px] mt-0.5"># Stages all unignored project files into the Git index</span>
                  </div>
                  <div>
                    <span className="text-zinc-600 select-none">$ </span>
                    <span className="text-white font-bold">git status</span>
                  </div>
                  <div className="p-2.5 rounded bg-zinc-950 border border-zinc-850 text-zinc-400 text-[11px] leading-tight">
                    On branch main<br />
                    Changes to be committed:<br />
                    &nbsp;&nbsp;<span className="text-zinc-200">new file:   src/index.js</span><br />
                    &nbsp;&nbsp;<span className="text-zinc-200">new file:   package.json</span><br />
                    &nbsp;&nbsp;<span className="text-zinc-200">new file:   .gitignore</span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Step 4: Stage the Workspace in VS Code */}
        <div className="scroll-mt-24">
          <div className="rounded-2xl bg-gradient-to-br from-zinc-950 via-black to-zinc-900 border border-zinc-700 p-6 sm:p-10 shadow-2xl relative overflow-hidden group hover:border-white transition-colors">
            <div className="flex flex-col lg:flex-row justify-between gap-8">
              <div className="space-y-4 max-w-xl">
                <div className="flex items-center gap-3">
                  <span className="flex items-center justify-center w-8 h-8 rounded-lg bg-white text-black font-mono font-bold text-sm">
                    04
                  </span>
                  <span className="text-xs font-mono uppercase tracking-widest text-zinc-300">Final Step</span>
                </div>
                <h3 className="text-2xl sm:text-3xl font-bold font-mono text-white">
                  Open Nyxus Sidebar & Click "Stage Workspace"
                </h3>
                <p className="text-sm text-zinc-400 font-sans leading-relaxed">
                  With your files added to Git, open the Nyxus sidebar in VS Code. Click the <strong>Stage Workspace</strong> button to package, upload, and spin up your agent pod.
                </p>

                <div className="space-y-2.5 pt-1 text-xs font-sans text-zinc-300">
                  <div className="p-3 rounded-lg bg-zinc-900/90 border border-zinc-800">
                    <span className="text-white font-mono font-bold block mb-1">1. Archive Generation</span>
                    Nyxus automatically packages your staged files into <code className="text-zinc-300 font-mono">.nyxus/nyxus_workspace.zip</code>.
                  </div>
                  <div className="p-3 rounded-lg bg-zinc-900/90 border border-zinc-800">
                    <span className="text-white font-mono font-bold block mb-1">2. Gateway Upload</span>
                    Transfers the archive to <code className="text-zinc-300 font-mono">http://54.79.152.236/upload</code> via HTTP with your workspace token.
                  </div>
                  <div className="p-3 rounded-lg bg-zinc-900/90 border border-zinc-800">
                    <span className="text-white font-mono font-bold block mb-1">3. Dynamic Pod Allocation</span>
                    The Cluster Gateway provisions a sandboxed K3s Kubernetes runner and connects via Socket.IO.
                  </div>
                </div>

                <div className="pt-2">
                  <button
                    onClick={onOpenExtension}
                    className="inline-flex items-center gap-2.5 px-6 py-3.5 rounded-xl bg-white text-black font-mono font-bold text-xs hover:bg-zinc-200 transition-all shadow-[0_0_25px_rgba(255,255,255,0.2)] active:scale-95"
                  >
                    <Play className="w-4 h-4 fill-current" />
                    <span>Launch Nyxus Sidebar Now</span>
                    <ExternalLink className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>

              {/* Sidebar UI Mockup */}
              <div className="w-full lg:w-7/12 rounded-xl bg-zinc-950 border border-zinc-700 font-mono text-xs overflow-hidden shadow-2xl">
                <div className="px-4 py-3 bg-zinc-900 border-b border-zinc-800 flex items-center justify-between text-zinc-300">
                  <div className="flex items-center gap-2">
                    <img src="/logo.svg" alt="Nyxus" className="w-4 h-4 invert" />
                    <span className="font-bold">Nyxus Agent &bull; Sidebar View</span>
                  </div>
                  <span className="px-2 py-0.5 rounded bg-zinc-800 border border-zinc-700 text-[10px] text-white">
                    ONLINE
                  </span>
                </div>

                <div className="p-5 space-y-4 bg-black">
                  <div className="p-3.5 rounded-lg bg-zinc-900/80 border border-zinc-800 space-y-2">
                    <div className="flex items-center justify-between text-[11px]">
                      <span className="text-zinc-400">Workspace Status:</span>
                      <span className="text-white font-bold">READY TO STAGE</span>
                    </div>
                    <div className="flex items-center justify-between text-[11px]">
                      <span className="text-zinc-400">Staged Files:</span>
                      <span className="text-zinc-200 font-mono">48 files detected</span>
                    </div>
                    <div className="flex items-center justify-between text-[11px]">
                      <span className="text-zinc-400">Target Server:</span>
                      <span className="text-zinc-200 font-mono">54.79.152.236</span>
                    </div>
                  </div>

                  {/* Staging Button Mockup */}
                  <div className="p-4 rounded-xl bg-white text-black text-center font-bold text-xs shadow-lg cursor-default select-none flex items-center justify-center gap-2">
                    <CheckCircle2 className="w-4 h-4" />
                    <span>Stage Workspace & Connect Pod</span>
                  </div>

                  {/* Output Preview */}
                  <div className="p-3 rounded-lg bg-zinc-950 border border-zinc-850 text-zinc-400 text-[11px] space-y-1 font-mono">
                    <div className="text-zinc-300 font-semibold">&gt; answer.md is automatically created!</div>
                    <div>When you ask a question, the reasoning graph executes and streams solutions into <span className="text-white">answer.md</span> in your workspace root.</div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>

      </div>
    </section>
  );
}
