import React, { useState, useEffect } from 'react';
import Navbar from './components/Navbar';
import Hero from './components/Hero';
import UserIdDashboard from './components/UserIdDashboard';
import TerminalPreview from './components/TerminalPreview';
import ArchitectureSection from './components/ArchitectureSection';
import Features from './components/Features';
import Footer from './components/Footer';
import AuthModal from './components/AuthModal';
import { Shield, Sparkles, Check, Terminal, ExternalLink } from 'lucide-react';

export default function App() {
  const [user, setUser] = useState(() => {
    try {
      const saved = localStorage.getItem('nyxus_user_profile');
      return saved ? JSON.parse(saved) : null;
    } catch {
      return null;
    }
  });

  const [googleClientId, setGoogleClientId] = useState(() => {
    try {
      const raw = localStorage.getItem('nyxus_google_client_id') || import.meta.env.VITE_GOOGLE_CLIENT_ID || '';
      if (!raw || raw.includes('your-google-oauth-client-id') || !raw.includes('.apps.googleusercontent.com')) {
        return '';
      }
      return raw.trim();
    } catch {
      return '';
    }
  });

  const [isAuthOpen, setIsAuthOpen] = useState(false);
  const [toastMessage, setToastMessage] = useState(null);

  const showToast = (msg) => {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(null), 4000);
  };

  const handleAuthSuccess = (userProfile) => {
    setUser(userProfile);
    try {
      localStorage.setItem('nyxus_user_profile', JSON.stringify(userProfile));
    } catch (e) {
      console.warn('Storage error', e);
    }
    showToast(`Welcome! Your User ID has been provisioned as ${userProfile.email}`);
    
    // Automatically smooth-scroll to extension launcher
    setTimeout(() => {
      const el = document.getElementById('extension');
      if (el) el.scrollIntoView({ behavior: 'smooth' });
    }, 300);
  };

  const handleSignOut = () => {
    setUser(null);
    localStorage.removeItem('nyxus_user_profile');
    showToast('Signed out of Nyxus session.');
  };

  const handleSaveClientId = (newId) => {
    setGoogleClientId(newId);
    localStorage.setItem('nyxus_google_client_id', newId);
    showToast('Google Client ID saved.');
  };

  const handleOpenExtension = () => {
    if (!user) {
      setIsAuthOpen(true);
      return;
    }
    const deepLink = `vscode://aryanKaga.nyxus-coding-agent-replica/auth?userId=${encodeURIComponent(user.email)}`;
    showToast(`Opening VS Code with User ID: ${user.email}...`);
    window.location.href = deepLink;
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
      <Navbar
        user={user}
        onSignOut={handleSignOut}
        onOpenAuthModal={() => setIsAuthOpen(true)}
        onOpenExtension={handleOpenExtension}
      />

      <main className="relative z-10">
        {/* Hero Section */}
        <Hero
          user={user}
          onOpenAuthModal={() => setIsAuthOpen(true)}
          onOpenExtension={handleOpenExtension}
        />

        {/* User ID & Extension Launcher Dashboard */}
        {user ? (
          <UserIdDashboard
            user={user}
            onOpenExtension={handleOpenExtension}
          />
        ) : (
          <section id="extension" className="py-16 bg-zinc-950/80 border-y border-zinc-850">
            <div className="max-w-4xl mx-auto px-4 text-center">
              <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-zinc-900 border border-zinc-800 text-xs font-mono text-zinc-400 mb-4">
                <Shield className="w-3.5 h-3.5 text-zinc-300" />
                <span>USER IDENTITY PROVISIONING</span>
              </div>
              <h3 className="text-2xl sm:text-3xl font-bold font-mono text-white">
                Authenticate to Generate Your Nyxus User ID
              </h3>
              <p className="mt-2 text-sm text-zinc-400 max-w-xl mx-auto font-sans">
                Upon sign-in with your Google email, Nyxus immediately configures your user credentials and unlocks the direct extension launcher.
              </p>
              <div className="mt-6 flex flex-col sm:flex-row items-center justify-center gap-3">
                <button
                  onClick={() => setIsAuthOpen(true)}
                  className="px-6 py-3 rounded-xl bg-white text-black font-mono font-bold text-xs hover:bg-zinc-200 transition-all flex items-center gap-2 shadow-[0_0_20px_rgba(255,255,255,0.2)]"
                >
                  <svg className="w-4 h-4" viewBox="0 0 24 24">
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
                  <span>Sign In & Generate User ID</span>
                </button>
              </div>
            </div>
          </section>
        )}

        {/* Live Terminal & Simulation */}
        <TerminalPreview user={user} />

        {/* Architecture Section */}
        <ArchitectureSection />

        {/* Features Bento */}
        <Features />
      </main>

      {/* Footer */}
      <Footer />

      {/* Auth Modal */}
      <AuthModal
        isOpen={isAuthOpen}
        onClose={() => setIsAuthOpen(false)}
        onAuthSuccess={handleAuthSuccess}
        currentClientId={googleClientId}
        onSaveClientId={handleSaveClientId}
      />
    </div>
  );
}
