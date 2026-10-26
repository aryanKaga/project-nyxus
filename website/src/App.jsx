import React, { useState } from 'react';
import Navbar from './components/Navbar';
import Hero from './components/Hero';
import GettingStarted from './components/GettingStarted';
import TerminalPreview from './components/TerminalPreview';
import ArchitectureSection from './components/ArchitectureSection';
import Features from './components/Features';
import Footer from './components/Footer';
import { Check } from 'lucide-react';

export default function App() {
  const [toastMessage, setToastMessage] = useState(null);

  const showToast = (msg) => {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(null), 3500);
  };

  const handleOpenExtension = () => {
    showToast('Opening Visual Studio Code...');
    window.location.href = 'vscode://aryanKaga.nyxus-coding-agent-replica';
  };

  return (
    <div className="min-h-screen bg-black text-white selection:bg-white selection:text-black font-sans relative">
      {/* Subtle grid background */}
      <div className="fixed inset-0 bg-grid-pattern opacity-60 pointer-events-none" />
      <div className="fixed top-0 left-1/2 -translate-x-1/2 w-3/4 h-[350px] bg-white/[0.02] rounded-full blur-[140px] pointer-events-none" />

      {/* Floating Toast Notification */}
      {toastMessage && (
        <div className="fixed bottom-6 right-6 z-50 flex items-center gap-2.5 px-4 py-3 rounded-xl bg-zinc-900 border border-zinc-700 text-xs font-mono text-white shadow-2xl animate-in slide-in-from-bottom-5">
          <Check className="w-4 h-4 text-white shrink-0" />
          <span>{toastMessage}</span>
        </div>
      )}

      {/* Navigation */}
      <Navbar onOpenExtension={handleOpenExtension} />

      <main className="relative z-10">
        {/* Hero Section */}
        <Hero onOpenExtension={handleOpenExtension} />

        {/* 4-Step How-To Guide: Install, .gitignore, git add ., Stage Workspace */}
        <GettingStarted onOpenExtension={handleOpenExtension} />

        {/* Live Staging & K8s Terminal Simulator */}
        <TerminalPreview />

        {/* Architecture Section */}
        <ArchitectureSection />

        {/* Features Bento */}
        <Features />
      </main>

      {/* Footer */}
      <Footer />
    </div>
  );
}
