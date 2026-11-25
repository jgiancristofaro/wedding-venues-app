import { Mail, Sparkles } from 'lucide-react';
import { useState } from 'react';
import { backend } from '../backend';
import { useApp } from '../store/app';
import { Modal } from './ui';

function redirectUrl() {
  return `${location.origin}${import.meta.env.BASE_URL}`;
}

function GoogleMark() {
  return (
    <svg width="18" height="18" viewBox="0 0 48 48" aria-hidden>
      <path fill="#FFC107" d="M43.6 20.5H42V20H24v8h11.3C33.7 32.7 29.2 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.3-.1-2.4-.4-3.5z" />
      <path fill="#FF3D00" d="m6.3 14.7 6.6 4.8C14.7 15.1 19 12 24 12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 16.3 4 9.7 8.3 6.3 14.7z" />
      <path fill="#4CAF50" d="M24 44c5.2 0 9.9-2 13.4-5.2l-6.2-5.2C29.2 35.1 26.7 36 24 36c-5.2 0-9.6-3.3-11.3-7.9l-6.5 5C9.5 39.6 16.2 44 24 44z" />
      <path fill="#1976D2" d="M43.6 20.5H42V20H24v8h11.3c-.8 2.2-2.2 4.2-4.1 5.6l6.2 5.2C37 39.2 44 34 44 24c0-1.3-.1-2.4-.4-3.5z" />
    </svg>
  );
}

export function SignInDialog() {
  const { open, reason } = useApp((s) => s.signIn);
  const close = useApp((s) => s.closeSignIn);
  const handleError = useApp((s) => s.handleError);
  const [email, setEmail] = useState('');
  const [sent, setSent] = useState(false);
  const [busy, setBusy] = useState(false);
  const demo = backend.mode === 'demo';

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    try {
      if (demo) await backend.signInDemo!(email);
      else {
        await backend.signInWithEmail(email, redirectUrl());
        setSent(true);
      }
    } catch (err) {
      handleError(err, 'Sign-in failed');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal open={open} onClose={close} title="Sign in to Vellum">
      <div className="space-y-5 pb-2">
        <p className="text-muted text-sm flex gap-2">
          <Sparkles size={16} className="text-gold shrink-0 mt-0.5" aria-hidden />
          {reason ?? 'Save venues, notes and rankings to your private library — available on any device.'}
        </p>
        {sent ? (
          <div className="rounded-2xl bg-sunken p-5 text-sm" role="status">
            <p className="font-medium mb-1">Check your inbox</p>
            We sent a sign-in link to <strong>{email}</strong>. Open it on this device and you’ll land right back here — we’ll finish what you were doing.
          </div>
        ) : (
          <>
            <button
              className="btn-secondary w-full h-12"
              onClick={async () => {
                setBusy(true);
                try {
                  await backend.signInWithGoogle(redirectUrl());
                } catch (err) {
                  handleError(err, 'Google sign-in failed');
                } finally {
                  setBusy(false);
                }
              }}
              disabled={busy}
            >
              <GoogleMark /> Continue with Google
            </button>
            <div className="flex items-center gap-3 text-xs text-muted">
              <div className="h-px flex-1 bg-line" /> or <div className="h-px flex-1 bg-line" />
            </div>
            <form onSubmit={submit} className="space-y-3">
              <label htmlFor="signin-email" className="text-sm font-medium">
                Email
              </label>
              <input id="signin-email" type="email" required autoComplete="email" className="input" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@example.com" />
              <button className="btn-primary w-full h-12" disabled={busy || !email}>
                <Mail size={16} /> {demo ? 'Continue (demo account)' : 'Email me a magic link'}
              </button>
            </form>
            {demo && (
              <p className="text-xs text-muted rounded-xl bg-sunken p-3">
                <strong>Demo mode:</strong> this site isn’t connected to a cloud backend yet, so sign-in is simulated and your library is stored only in this browser. Use <code>admin@demo.vellum</code> to try the admin tools.
              </p>
            )}
          </>
        )}
      </div>
    </Modal>
  );
}
