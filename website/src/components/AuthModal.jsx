import React, { useEffect, useRef, useState } from 'react';
import { X, ShieldCheck, Mail, Sparkles, Key, AlertTriangle, Check, ArrowRight, HelpCircle, ExternalLink } from 'lucide-react';
import { jwtDecode } from 'jwt-decode';

export default function AuthModal({ isOpen, onClose, onAuthSuccess, currentClientId, onSaveClientId }) {
  const googleBtnRef = useRef(null);
  const [customEmail, setCustomEmail] = useState('');
  const [showConfig, setShowConfig] = useState(false);
  const [tempClientId, setTempClientId] = useState(currentClientId || '');
  const [clientSaved, setClientSaved] = useState(false);
  const [gsiError, setGsiError] = useState(null);

  const isRealGoogleClientId = Boolean(
    currentClientId &&
    currentClientId.trim().length > 20 &&
    currentClientId.includes('.apps.googleusercontent.com') &&
    !currentClientId.includes('your-google-oauth-client-id')
  );

  useEffect(() => {
    if (!isOpen) return;
    setGsiError(null);

    // Only attempt GIS initialization if a genuine Google Cloud Client ID is configured
    if (window.google && isRealGoogleClientId) {
      try {
        window.google.accounts.id.initialize({
          client_id: currentClientId.trim(),
          callback: (response) => {
            try {
              const decoded = jwtDecode(response.credential);
              const userProfile = {
                email: decoded.email,
                name: decoded.name || decoded.email.split('@')[0],
                picture: decoded.picture || null,
                sub: decoded.sub,
                token: response.credential,
                authType: 'google'
              };
              onAuthSuccess(userProfile);
              onClose();
            } catch (err) {
              console.error('Failed to decode Google token', err);
              setGsiError('Could not decode token received from Google.');
            }
          },
          auto_select: false,
          cancel_on_tap_outside: true,
        });

        if (googleBtnRef.current) {
          googleBtnRef.current.innerHTML = '';
          window.google.accounts.id.renderButton(googleBtnRef.current, {
            theme: 'filled_black',
            size: 'large',
            shape: 'rectangular',
            width: 340,
            text: 'continue_with',
          });
        }
      } catch (e) {
        console.warn('GIS initialization error:', e);
        setGsiError(e instanceof Error ? e.message : 'Google OAuth initialization failed.');
      }
    }
  }, [isOpen, currentClientId, isRealGoogleClientId, onAuthSuccess, onClose]);

  if (!isOpen) return null;

  const handleEmailLogin = (emailToUse) => {
    const email = emailToUse || customEmail;
    if (!email || !email.trim()) return;

    const cleanEmail = email.trim().toLowerCase();
    const userProfile = {
      email: cleanEmail,
      name: cleanEmail.split('@')[0],
      picture: null,
      sub: `usr_${Date.now()}`,
      token: 'nyxus_auth_token',
      authType: 'google_email'
    };
    onAuthSuccess(userProfile);
    onClose();
  };

  const handleSaveClientId = (e) => {
    e.preventDefault();
    onSaveClientId(tempClientId.trim());
    setClientSaved(true);
    setTimeout(() => setClientSaved(false), 2000);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/85 backdrop-blur-md animate-in fade-in duration-200">
      <div 
        className="relative w-full max-w-lg rounded-2xl bg-zinc-950 border border-zinc-700/80 p-6 sm:p-8 shadow-[0_0_60px_rgba(0,0,0,0.9)] text-zinc-100 font-sans max-h-[90vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Close Button */}
        <button
          onClick={onClose}
          className="absolute top-4 right-4 p-2 text-zinc-400 hover:text-white rounded-lg hover:bg-zinc-800 transition-colors"
          title="Close"
        >
          <X className="w-5 h-5" />
        </button>

        {/* Header */}
        <div className="text-center mb-6">
          <div className="inline-flex items-center justify-center w-12 h-12 rounded-xl bg-zinc-900 border border-zinc-700 mb-3 shadow-inner">
            <img src="/logo.svg" alt="Nyxus" className="w-7 h-7 invert brightness-200" />
          </div>
          <h2 className="text-xl sm:text-2xl font-bold font-mono tracking-tight text-white">
            Sign in to Nyxus
          </h2>
          <p className="text-xs font-mono text-zinc-400 mt-1.5">
            Authenticate with your Google email. Your email will be assigned as your <span className="text-white font-semibold underline">User ID</span> for the VS Code extension.
          </p>
        </div>

        {/* Primary Auth Form: Enter Google Email */}
        <div className="space-y-4 mb-6">
          <form
            onSubmit={(e) => {
              e.preventDefault();
              handleEmailLogin();
            }}
            className="space-y-3"
          >
            <div>
              <label className="block text-xs font-mono text-zinc-300 font-semibold mb-1.5">
                Sign in with your Google Account Email:
              </label>
              <div className="relative">
                <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-400" />
                <input
                  type="email"
                  required
                  autoFocus
                  value={customEmail}
                  onChange={(e) => setCustomEmail(e.target.value)}
                  placeholder="your-name@gmail.com"
                  className="w-full pl-9 pr-3 py-2.5 rounded-lg bg-zinc-900 border border-zinc-700 text-sm font-mono text-white placeholder-zinc-500 focus:outline-none focus:border-white focus:ring-1 focus:ring-white transition-all"
                />
              </div>
            </div>

            <button
              type="submit"
              className="w-full py-3 px-4 rounded-xl bg-white text-black font-mono font-bold text-xs hover:bg-zinc-200 transition-all shadow-[0_0_20px_rgba(255,255,255,0.15)] flex items-center justify-center gap-2.5 hover:scale-[1.01] active:scale-[0.99]"
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
              <span>Continue with Google Email</span>
              <ArrowRight className="w-3.5 h-3.5 ml-0.5" />
            </button>
          </form>

          {/* Quick Demo Profile Shortcut */}
          <div className="flex items-center justify-between px-1 text-[11px] font-mono text-zinc-500">
            <span>Quick test profile:</span>
            <button
              type="button"
              onClick={() => handleEmailLogin('aryan@gmail.com')}
              className="text-zinc-300 hover:text-white underline hover:no-underline transition"
            >
              Sign in as aryan@gmail.com
            </button>
          </div>
        </div>

        {/* Live Google Cloud GIS Section (if client ID is provided) */}
        {isRealGoogleClientId ? (
          <div className="pt-4 border-t border-zinc-850">
            <div className="text-center mb-3">
              <span className="text-[11px] font-mono text-zinc-400">
                Or authenticate via Google Identity Popup:
              </span>
            </div>
            <div ref={googleBtnRef} className="w-full flex justify-center min-h-[44px]" />
            {gsiError && (
              <p className="text-[11px] font-mono text-red-400 text-center mt-2">
                {gsiError}
              </p>
            )}
          </div>
        ) : null}

        {/* Explanation of "invalid client" and Google Cloud setup */}
        <div className="mt-6 pt-5 border-t border-zinc-850">
          <div className="p-3.5 rounded-xl bg-zinc-900/60 border border-zinc-800 text-xs font-mono">
            <div className="flex items-center justify-between mb-1.5">
              <div className="flex items-center gap-1.5 text-zinc-300 font-semibold">
                <HelpCircle className="w-3.5 h-3.5 text-white" />
                <span>Why does Google show "Invalid Client"?</span>
              </div>
              <button
                onClick={() => setShowConfig(!showConfig)}
                className="text-[11px] text-zinc-400 hover:text-white underline"
              >
                {showConfig ? 'Hide Settings' : 'Configure Client ID'}
              </button>
            </div>
            <p className="text-[11px] text-zinc-400 leading-relaxed font-sans">
              Google returns <code className="text-white">Error 401: invalid_client</code> when using a placeholder ID or when your Google Cloud OAuth app doesn't have <code className="text-white">http://localhost:5173</code> in its <strong>Authorized JavaScript Origins</strong>.
            </p>
          </div>

          {/* Expandable Client ID input & step by step */}
          {showConfig && (
            <div className="mt-3 p-4 rounded-xl bg-zinc-900 border border-zinc-700 text-xs font-mono space-y-3 animate-in fade-in">
              <div className="text-[11px] text-zinc-300 font-semibold">
                To connect a real Google Cloud OAuth 2.0 Client:
              </div>
              <ol className="list-decimal list-inside space-y-1 text-[11px] text-zinc-400 leading-normal font-sans">
                <li>
                  Open <a href="https://console.cloud.google.com/apis/credentials" target="_blank" rel="noreferrer" className="text-white underline inline-flex items-center gap-1">Google Cloud Credentials <ExternalLink className="w-2.5 h-2.5" /></a>
                </li>
                <li>Create Credentials &rarr; <strong>OAuth 2.0 Client ID</strong> (Web application)</li>
                <li>Add <code className="text-white bg-black px-1 py-0.5 rounded">http://localhost:5173</code> to <strong>Authorized JavaScript origins</strong></li>
                <li>Paste the resulting Client ID below:</li>
              </ol>

              <form onSubmit={handleSaveClientId} className="space-y-2 pt-1">
                <input
                  type="text"
                  value={tempClientId}
                  onChange={(e) => setTempClientId(e.target.value)}
                  placeholder="xxxx.apps.googleusercontent.com"
                  className="w-full px-3 py-2 rounded-lg bg-black border border-zinc-700 text-xs text-zinc-200 focus:outline-none focus:border-white font-mono"
                />
                <div className="flex justify-between items-center pt-1">
                  <span className="text-[10px] text-zinc-500">
                    Saves to browser & .env
                  </span>
                  <button
                    type="submit"
                    className="px-3 py-1.5 bg-white text-black font-semibold text-xs rounded-md hover:bg-zinc-200 transition"
                  >
                    {clientSaved ? 'Saved!' : 'Save Client ID'}
                  </button>
                </div>
              </form>
            </div>
          )}
        </div>

        {/* Security badge */}
        <div className="mt-4 flex items-center justify-center gap-1.5 text-[10px] font-mono text-zinc-500">
          <ShieldCheck className="w-3.5 h-3.5 text-zinc-400" />
          <span>Local authentication &bull; Email injected into VS Code extension</span>
        </div>
      </div>
    </div>
  );
}
