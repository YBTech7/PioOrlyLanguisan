import React, { useState } from 'react';
import { KeyRound, Lock, ShieldCheck, UserPlus } from 'lucide-react';
import { apiFetch } from '../../lib/apiClient';
import type { AdminRole } from '../../types';

export interface AuthSessionInfo {
  token: string;
  csrfToken?: string;
  user: {
    id: string | null;
    email: string;
    name: string;
    role: AdminRole;
  };
}

interface AdminAuthScreenProps {
  hasAdminUsers: boolean;
  bootstrapConfigured: boolean;
  passcodeConfigured: boolean;
  onAuthenticated: (session: AuthSessionInfo) => void;
  onClose: () => void;
}

export const AdminAuthScreen: React.FC<AdminAuthScreenProps> = ({
  hasAdminUsers,
  bootstrapConfigured,
  passcodeConfigured,
  onAuthenticated,
  onClose,
}) => {
  const defaultMode: 'account' | 'passcode' | 'bootstrap' = hasAdminUsers
    ? 'account'
    : passcodeConfigured
      ? 'passcode'
      : 'bootstrap';

  const [mode, setMode] = useState<'account' | 'passcode' | 'bootstrap'>(defaultMode);

  // Account login state
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');

  // Passcode login state
  const [passcode, setPasscode] = useState('');

  // Bootstrap state
  const [bootstrapToken, setBootstrapToken] = useState('');
  const [bootName, setBootName] = useState('');
  const [bootEmail, setBootEmail] = useState('');
  const [bootPassword, setBootPassword] = useState('');

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handlePasscodeSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      const data = await apiFetch<AuthSessionInfo>('/api/admin/login', {
        method: 'POST',
        body: JSON.stringify({ passcode }),
      });
      setPasscode('');
      onAuthenticated(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to sign in.');
    } finally {
      setLoading(false);
    }
  };

  const handleAccountSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      const data = await apiFetch<AuthSessionInfo>('/api/auth/login', {
        method: 'POST',
        body: JSON.stringify({ email, password }),
      });
      setPassword('');
      onAuthenticated(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to sign in.');
    } finally {
      setLoading(false);
    }
  };

  const handleBootstrapSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      const data = await apiFetch<AuthSessionInfo>('/api/auth/bootstrap', {
        method: 'POST',
        body: JSON.stringify({
          bootstrapToken,
          name: bootName,
          email: bootEmail,
          password: bootPassword,
        }),
      });
      setBootstrapToken('');
      setBootPassword('');
      onAuthenticated(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to bootstrap administrator.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex min-h-full items-center justify-center bg-[#061823] p-4 sm:p-8">
      <div className="w-full max-w-md rounded-2xl border border-[#D1A953]/25 bg-[#0C2935] p-6 sm:p-8 shadow-2xl">
        <div className="flex items-start justify-between gap-4 border-b border-[#D1A953]/15 pb-5">
          <div>
            <p className="text-xs font-medium tracking-[0.12em] uppercase text-[#DFC585]">
              Executive Case Management
            </p>
            <h2
              id="admin-portal-title"
              className="mt-1 font-editorial text-2xl font-semibold text-[#F5F2EB]"
            >
              Admin Console Sign In
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="min-h-[40px] rounded-lg border border-[#D1A953]/25 px-3 py-1.5 text-xs font-medium text-[#C2D0D6] hover:border-[#D1A953] hover:text-[#F5F2EB] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#D1A953]"
          >
            Back to Site
          </button>
        </div>

        <div
          role="tablist"
          aria-label="Authentication methods"
          className="mt-5 grid grid-cols-3 gap-1 rounded-xl border border-[#D1A953]/18 bg-[#061823] p-1"
        >
          <button
            type="button"
            role="tab"
            aria-selected={mode === 'passcode'}
            onClick={() => {
              setMode('passcode');
              setError(null);
            }}
            className={`min-h-[38px] rounded-lg px-2 py-1.5 text-xs font-medium transition-colors whitespace-nowrap ${
              mode === 'passcode'
                ? 'bg-[#D1A953] text-[#061823]'
                : 'text-[#C2D0D6] hover:text-[#F5F2EB]'
            }`}
          >
            Passcode
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={mode === 'account'}
            onClick={() => {
              setMode('account');
              setError(null);
            }}
            className={`min-h-[38px] rounded-lg px-2 py-1.5 text-xs font-medium transition-colors whitespace-nowrap ${
              mode === 'account'
                ? 'bg-[#D1A953] text-[#061823]'
                : 'text-[#C2D0D6] hover:text-[#F5F2EB]'
            }`}
          >
            Team Account
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={mode === 'bootstrap'}
            onClick={() => {
              setMode('bootstrap');
              setError(null);
            }}
            className={`min-h-[38px] rounded-lg px-2 py-1.5 text-xs font-medium transition-colors whitespace-nowrap ${
              mode === 'bootstrap'
                ? 'bg-[#D1A953] text-[#061823]'
                : 'text-[#C2D0D6] hover:text-[#F5F2EB]'
            }`}
          >
            First Setup
          </button>
        </div>

        {mode === 'passcode' && (
          <form onSubmit={handlePasscodeSubmit} className="mt-6 space-y-4">
            <div className="flex items-start gap-2.5 text-xs leading-relaxed text-[#C2D0D6]">
              <Lock className="mt-0.5 h-4 w-4 shrink-0 text-[#D1A953]" aria-hidden="true" />
              <span>
                Enter the server-configured executive passcode to manage consultation cases,
                analytics, and team access.
              </span>
            </div>
            <div>
              <label htmlFor="admin-passcode-input" className="block text-xs font-medium text-[#DFC585]">
                Executive Passcode
              </label>
              <input
                id="admin-passcode-input"
                type="password"
                value={passcode}
                onChange={(e) => setPasscode(e.target.value)}
                placeholder="Passcode"
                aria-label="Executive passcode"
                autoComplete="current-password"
                required
                className="mt-1.5 min-h-[42px] w-full rounded-lg border border-[#D1A953]/25 bg-[#061823] px-3.5 py-2 text-sm text-[#F5F2EB] focus:border-[#D1A953] focus:outline-none focus-visible:ring-2 focus-visible:ring-[#D1A953]"
              />
            </div>
            {error && (
              <p role="alert" className="text-xs font-medium text-amber-300">
                {error}
              </p>
            )}
            <button
              type="submit"
              disabled={loading}
              className="w-full min-h-[44px] rounded-lg bg-[#D1A953] px-4 py-2 text-sm font-semibold text-[#061823] transition-colors hover:bg-[#DFC585] disabled:opacity-60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#F5F2EB]"
            >
              {loading ? 'Verifying...' : 'Unlock Console'}
            </button>
          </form>
        )}

        {mode === 'account' && (
          <form onSubmit={handleAccountSubmit} className="mt-6 space-y-4">
            <div className="flex items-start gap-2.5 text-xs leading-relaxed text-[#C2D0D6]">
              <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-[#D1A953]" aria-hidden="true" />
              <span>
                Sign in with your assigned administrator or staff account credentials.
              </span>
            </div>
            <div>
              <label htmlFor="admin-login-email" className="block text-xs font-medium text-[#DFC585]">
                Work Email
              </label>
              <input
                id="admin-login-email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="admin@company.com"
                autoComplete="email"
                required
                className="mt-1.5 min-h-[42px] w-full rounded-lg border border-[#D1A953]/25 bg-[#061823] px-3.5 py-2 text-sm text-[#F5F2EB] focus:border-[#D1A953] focus:outline-none focus-visible:ring-2 focus-visible:ring-[#D1A953]"
              />
            </div>
            <div>
              <label htmlFor="admin-login-password" className="block text-xs font-medium text-[#DFC585]">
                Password
              </label>
              <input
                id="admin-login-password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Enter password"
                autoComplete="current-password"
                required
                className="mt-1.5 min-h-[42px] w-full rounded-lg border border-[#D1A953]/25 bg-[#061823] px-3.5 py-2 text-sm text-[#F5F2EB] focus:border-[#D1A953] focus:outline-none focus-visible:ring-2 focus-visible:ring-[#D1A953]"
              />
            </div>
            {error && (
              <p role="alert" className="text-xs font-medium text-amber-300">
                {error}
              </p>
            )}
            <button
              type="submit"
              disabled={loading}
              className="w-full min-h-[44px] rounded-lg bg-[#D1A953] px-4 py-2 text-sm font-semibold text-[#061823] transition-colors hover:bg-[#DFC585] disabled:opacity-60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#F5F2EB]"
            >
              {loading ? 'Signing in...' : 'Sign In'}
            </button>
          </form>
        )}

        {mode === 'bootstrap' && (
          <form onSubmit={handleBootstrapSubmit} className="mt-6 space-y-4">
            <div className="flex items-start gap-2.5 text-xs leading-relaxed text-[#C2D0D6]">
              <UserPlus className="mt-0.5 h-4 w-4 shrink-0 text-[#D1A953]" aria-hidden="true" />
              <span>
                {hasAdminUsers
                  ? 'An administrator account is already active. Please sign in with Team Account or Passcode.'
                  : bootstrapConfigured
                    ? 'Create the first administrator account using your server-configured bootstrap token.'
                    : 'Set ADMIN_BOOTSTRAP_TOKEN or ADMIN_PASSCODE on the server to enable initial administrator setup.'}
              </span>
            </div>
            {!hasAdminUsers && (
              <>
                <div>
                  <label htmlFor="boot-token" className="block text-xs font-medium text-[#DFC585]">
                    Server Bootstrap Token / Passcode
                  </label>
                  <div className="relative mt-1.5">
                    <KeyRound
                      className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[#D1A953]/70"
                      aria-hidden="true"
                    />
                    <input
                      id="boot-token"
                      type="password"
                      value={bootstrapToken}
                      onChange={(e) => setBootstrapToken(e.target.value)}
                      required
                      className="min-h-[42px] w-full rounded-lg border border-[#D1A953]/25 bg-[#061823] pl-9 pr-3.5 py-2 text-sm text-[#F5F2EB] focus:border-[#D1A953] focus:outline-none focus-visible:ring-2 focus-visible:ring-[#D1A953]"
                    />
                  </div>
                </div>
                <div>
                  <label htmlFor="boot-name" className="block text-xs font-medium text-[#DFC585]">
                    Administrator Name
                  </label>
                  <input
                    id="boot-name"
                    type="text"
                    value={bootName}
                    onChange={(e) => setBootName(e.target.value)}
                    placeholder="Pio Languisan"
                    required
                    className="mt-1.5 min-h-[42px] w-full rounded-lg border border-[#D1A953]/25 bg-[#061823] px-3.5 py-2 text-sm text-[#F5F2EB] focus:border-[#D1A953] focus:outline-none focus-visible:ring-2 focus-visible:ring-[#D1A953]"
                  />
                </div>
                <div>
                  <label htmlFor="boot-email" className="block text-xs font-medium text-[#DFC585]">
                    Administrator Email
                  </label>
                  <input
                    id="boot-email"
                    type="email"
                    value={bootEmail}
                    onChange={(e) => setBootEmail(e.target.value)}
                    placeholder="admin@domain.com"
                    required
                    className="mt-1.5 min-h-[42px] w-full rounded-lg border border-[#D1A953]/25 bg-[#061823] px-3.5 py-2 text-sm text-[#F5F2EB] focus:border-[#D1A953] focus:outline-none focus-visible:ring-2 focus-visible:ring-[#D1A953]"
                  />
                </div>
                <div>
                  <label htmlFor="boot-password" className="block text-xs font-medium text-[#DFC585]">
                    Password (12+ characters)
                  </label>
                  <input
                    id="boot-password"
                    type="password"
                    minLength={12}
                    value={bootPassword}
                    onChange={(e) => setBootPassword(e.target.value)}
                    required
                    className="mt-1.5 min-h-[42px] w-full rounded-lg border border-[#D1A953]/25 bg-[#061823] px-3.5 py-2 text-sm text-[#F5F2EB] focus:border-[#D1A953] focus:outline-none focus-visible:ring-2 focus-visible:ring-[#D1A953]"
                  />
                </div>
                {error && (
                  <p role="alert" className="text-xs font-medium text-amber-300">
                    {error}
                  </p>
                )}
                <button
                  type="submit"
                  disabled={loading}
                  className="w-full min-h-[44px] rounded-lg bg-[#D1A953] px-4 py-2 text-sm font-semibold text-[#061823] transition-colors hover:bg-[#DFC585] disabled:opacity-60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#F5F2EB]"
                >
                  {loading ? 'Provisioning...' : 'Create Administrator Account'}
                </button>
              </>
            )}
          </form>
        )}
      </div>
    </div>
  );
};
