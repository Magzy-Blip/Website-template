import { useMemo, useState, type ChangeEvent, type FormEvent } from 'react'; // React hooks
import { Link, useSearchParams } from 'react-router-dom';// React Router for navigation
import { isValidEmailFormat, validatePasswordStrength } from './passwordRules';// Utility functions for validating email/passwords

/// Base URL
const API_BASE = 'http://localhost:5000';

/// Page for submitting a password reset with token 
export function ResetPassword() {
  const [params] = useSearchParams();
  const initialEmail = useMemo(() => params.get('email') ?? '', [params]);
  const initialToken = useMemo(() => params.get('token') ?? '', [params]);

  const [email, setEmail] = useState(initialEmail);
  const [token, setToken] = useState(initialToken);
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [message, setMessage] = useState<{ type: 'error' | 'success'; text: string } | null>(null);
// Handle form submission for validation.
  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setMessage(null);
    if (!isValidEmailFormat(email)) {
      setMessage({ type: 'error', text: 'Enter a valid email address.' });
      return;
    }
    if (!token.trim()) {
      setMessage({ type: 'error', text: 'Paste the reset token from the forgot-password response or your email.' });
      return;
    }
    const pwErr = validatePasswordStrength(password);
    if (pwErr) {
      setMessage({ type: 'error', text: pwErr });
      return;
    }
    if (password !== confirm) {
      setMessage({ type: 'error', text: 'Passwords do not match.' });
      return;
    }
    setIsLoading(true);
    try {
      const res = await fetch(`${API_BASE}/api/reset-password`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: email.trim().toLowerCase(),
          token: token.trim(),
          password,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error((data as { message?: string }).message || 'Reset failed');
      }
      setMessage({ type: 'success', text: (data as { message?: string }).message || 'Password updated.' });
    } catch (err: unknown) {
      setMessage({ type: 'error', text: err instanceof Error ? err.message : String(err) });
    } finally {
      setIsLoading(false);
    }
  };
// Render the reset password form with validation messages
  return (
    <div className="min-h-screen bg-slate-950 flex flex-col items-center justify-center p-6 text-slate-200">
      <main className="w-full max-w-sm bg-slate-900 border border-slate-800 rounded-2xl shadow-2xl p-8">
        <header className="text-center mb-8">
          <h1 className="text-2xl font-bold text-white uppercase tracking-widest">Reset password</h1>
          <p className="mt-2 text-xs text-slate-500 leading-relaxed">
            Use the token from forgot-password (dev) or from your email once outbound mail is configured.
          </p>
        </header>
        // Show validation or success messages
        {message && (
          <div
            className={`mb-6 p-3 rounded-lg text-xs text-center border ${
              message.type === 'error'
                ? 'bg-red-500/10 border-red-500/50 text-red-400'
                : 'bg-emerald-500/10 border-emerald-500/50 text-emerald-400'
            }`}
          >
            {message.text}
          </div>
        )}
      // Form for email, token, new password, and confirmation.
        <form className="space-y-4" onSubmit={handleSubmit}>
          <input
            type="email"
            placeholder="Email"
            required
            value={email}
            onChange={(e: ChangeEvent<HTMLInputElement>) => setEmail(e.target.value)}
            className="w-full bg-slate-950 border border-slate-800 p-3 rounded-lg outline-none focus:ring-2 focus:ring-sky-500"
          />
        // Token input for password reset
          <input
            type="text"
            placeholder="Reset token"
            required
            value={token}
            onChange={(e: ChangeEvent<HTMLInputElement>) => setToken(e.target.value)}
            className="w-full bg-slate-950 border border-slate-800 p-3 rounded-lg outline-none focus:ring-2 focus:ring-sky-500 font-mono text-xs"
          />
          // New password input
          <input
            type="password"
            placeholder="New password"
            required
            value={password}
            onChange={(e: ChangeEvent<HTMLInputElement>) => setPassword(e.target.value)}
            className="w-full bg-slate-950 border border-slate-800 p-3 rounded-lg outline-none focus:ring-2 focus:ring-sky-500"
          />
          // Confirmation input for new password
          <input
            type="password"
            placeholder="Confirm new password"
            required
            value={confirm}
            onChange={(e: ChangeEvent<HTMLInputElement>) => setConfirm(e.target.value)}
            className="w-full bg-slate-950 border border-slate-800 p-3 rounded-lg outline-none focus:ring-2 focus:ring-sky-500"
          />
          // Submit button with loading state
          <button
            type="submit"
            disabled={isLoading}
            className="w-full py-3 bg-sky-500 text-slate-900 font-bold rounded-lg hover:bg-sky-400 disabled:opacity-50"
          >
            // Shows an updating loading screen or just shows success messege"
            {isLoading ? 'Updating…' : 'Update password'}
          </button>
        </form>
        // Link to go back to the signin page
        <Link
          to="/"
          className="mt-6 block text-center text-sm text-slate-400 hover:text-sky-400"
        >
          Back to sign in
        </Link>
      </main>
    </div>
  );
}
