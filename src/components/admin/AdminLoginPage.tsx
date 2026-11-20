import React, { useEffect, useState } from 'react';
import {
  AlertCircle,
  Eye,
  EyeOff,
  KeyRound,
  Loader2,
  Lock,
  ShieldCheck,
  UserPlus,
} from 'lucide-react';
import { ApiError, apiFetch } from '../../lib/apiClient';
import { buildAppHref, navigateApp } from '../../lib/adminRouter';
import type { AdminRole } from '../../types';
import { AdminAuthLayout } from './AdminAuthLayout';

const REMEMBERED_EMAIL_KEY = 'pl_admin_remembered_email';

export interface AuthSessionInfo {
  token: string;
  csrfToken?: string;
  expiresAt?: string;
  mfaRequired?: false;
  user: {
    id: string | null;
    email: string;
    name: string;
    role: AdminRole;
    mfaEnabled?: boolean;
  };
}

interface LoginMfaChallengeResponse {
  mfaRequired: true;
  mfaChallenge: string;
}

type AccountLoginResponse = AuthSessionInfo | LoginMfaChallengeResponse;

interface AdminLoginPageProps {
  hasAdminUsers: boolean;
  bootstrapConfigured: boolean;
  passcodeConfigured: boolean;
  customLogoUrl?: string | null;
  expiredReason?: string | null;
  onAuthenticated: (session: AuthSessionInfo) => void;
}

export const AdminLoginPage: React.FC<AdminLoginPageProps> = ({
  hasAdminUsers,
  bootstrapConfigured,
  passcodeConfigured,
  customLogoUrl,
  expiredReason,
  onAuthenticated,
}) => {
  const [viewMode, setViewMode] = useState<'account' | 'passcode' | 'bootstrap'>('account');
  const [email, setEmail] = useState(() => {
    if (typeof window === 'undefined') return '';
    try {
      return window.localStorage.getItem(REMEMBERED_EMAIL_KEY) || '';
    } catch {
      return '';
    }
  });
  const [rememberEmail, setRememberEmail] = useState(() => {
    if (typeof window === 'undefined') return false;
    try {
      return Boolean(window.localStorage.getItem(REMEMBERED_EMAIL_KEY));
    } catch {
      return false;
    }
  });
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);

  // MFA challenge step
  const [mfaChallenge, setMfaChallenge] = useState<string | null>(null);
  const [mfaCode, setMfaCode] = useState('');

  // Passcode fallback mode
  const [passcode, setPasscode] = useState('');
  const [showPasscode, setShowPasscode] = useState(false);

  // Initial Super Admin bootstrap mode
  const [bootstrapToken, setBootstrapToken] = useState('');
  const [bootName, setBootName] = useState('');
  const [bootEmail, setBootEmail] = useState('');
  const [bootPassword, setBootPassword] = useState('');
  const [showBootPassword, setShowBootPassword] = useState(false);

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [emailError, setEmailError] = useState<string | null>(null);

  useEffect(() => {
    if (!rememberEmail && typeof window !== 'undefined') {
      try {
        window.localStorage.removeItem(REMEMBERED_EMAIL_KEY);
      } catch {
        // Ignore storage errors
      }
    }
  }, [rememberEmail]);

  const validateEmailField = (val: string): boolean => {
    const clean = val.trim();
    if (!clean || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(clean)) {
      setEmailError('Enter a valid work email address.');
      return false;
    }
    setEmailError(null);
    return true;
  };

  const persistRememberedEmail = (cleanEmail: string) => {
    if (typeof window === 'undefined') return;
    try {
      if (rememberEmail) {
        window.localStorage.setItem(REMEMBERED_EMAIL_KEY, cleanEmail);
      } else {
        window.localStorage.removeItem(REMEMBERED_EMAIL_KEY);
      }
    } catch {
      // Ignore storage errors
    }
  };

  const handleAccountSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (!validateEmailField(email)) return;
    if (!password) {
      setError('Password is required.');
      return;
    }

    const cleanEmail = email.trim().toLowerCase();
    setLoading(true);
    try {
      const response = await apiFetch<AccountLoginResponse>('/api/auth/login', {
        method: 'POST',
        body: JSON.stringify({ email: cleanEmail, password }),
      });
      persistRememberedEmail(cleanEmail);
      if ('mfaRequired' in response && response.mfaRequired) {
        setPassword('');
        setMfaChallenge(response.mfaChallenge);
        setMfaCode('');
        return;
      }
      setPassword('');
      onAuthenticated(response);
    } catch (err) {
      if (err instanceof ApiError && err.status === 429) {
        setError(err.message);
      } else {
        setError(err instanceof Error ? err.message : 'Unable to sign in.');
      }
    } finally {
      setLoading(false);
    }
  };

  const handleMfaSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!mfaChallenge) return;
    setError(null);
    setLoading(true);
    try {
      const data = await apiFetch<AuthSessionInfo>('/api/auth/login/mfa', {
        method: 'POST',
        body: JSON.stringify({ mfaChallenge, code: mfaCode.trim() }),
      });
      setMfaChallenge(null);
      setMfaCode('');
      onAuthenticated(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Invalid verification code.');
    } finally {
      setLoading(false);
    }
  };

  const handlePasscodeSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const data = await apiFetch<AuthSessionInfo>('/api/admin/login', {
        method: 'POST',
        body: JSON.stringify({ passcode }),
      });
      setPasscode('');
      onAuthenticated(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to sign in with passcode.');
    } finally {
      setLoading(false);
    }
  };

  const handleBootstrapSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const data = await apiFetch<AuthSessionInfo>('/api/auth/bootstrap', {
        method: 'POST',
        body: JSON.stringify({
          bootstrapToken,
          name: bootName.trim(),
          email: bootEmail.trim().toLowerCase(),
          password: bootPassword,
        }),
      });
      setBootstrapToken('');
      setBootPassword('');
      onAuthenticated(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to create administrator account.');
    } finally {
      setLoading(false);
    }
  };

  const forgotHref = buildAppHref('/admin/forgot-password');

  return (
    <AdminAuthLayout
      title={
        mfaChallenge
          ? 'Two-Factor Verification'
          : viewMode === 'bootstrap'
            ? 'Initial Super Admin Setup'
            : viewMode === 'passcode'
              ? 'Executive Passcode Sign In'
              : 'Secure Dashboard Access'
      }
      subtitle="Admin Console"
      customLogoUrl={customLogoUrl}
    >
      {expiredReason === 'expired' && !error && (
        <div
          role="status"
          className="mb-5 flex items-start gap-2.5 rounded-xl border border-[#D1A953]/35 bg-[#061823]/90 p-3.5 text-xs text-[#DFC585]"
        >
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-[#D1A953]" aria-hidden="true" />
          <span>Your administrator session expired. Please sign in again to continue.</span>
        </div>
      )}

      {mfaChallenge ? (
        <form onSubmit={handleMfaSubmit} className="space-y-4">
          <div className="flex items-start gap-2.5 text-xs leading-relaxed text-[#C2D0D6]">
            <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-[#D1A953]" aria-hidden="true" />
            <span>
              Enter the 6-digit verification code from your authenticator app to complete sign-in.
            </span>
          </div>

          <div>
            <label htmlFor="admin-mfa-code" className="block text-xs font-medium text-[#DFC585]">
              Authenticator Code
            </label>
            <input
              id="admin-mfa-code"
              type="text"
              inputMode="numeric"
              autoComplete="one-time-code"
              maxLength={8}
              value={mfaCode}
              onChange={(e) => setMfaCode(e.target.value)}
              placeholder="000000"
              required
              className="mt-1.5 min-h-[44px] w-full rounded-lg border border-[#325E6D] bg-[#061823] px-3.5 py-2 font-mono text-base tracking-[0.22em] text-[#F5F2EB] placeholder:text-[#C2D0D6]/40 focus:border-[#D1A953] focus:outline-none focus-visible:ring-2 focus-visible:ring-[#D1A953]"
            />
          </div>

          {error && (
            <div
              role="alert"
              className="flex items-start gap-2 rounded-lg border border-amber-400/35 bg-amber-500/10 p-3 text-xs font-medium text-amber-200"
            >
              <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
              <span>{error}</span>
            </div>
          )}

          <button
            type="submit"
            disabled={loading}
            className="inline-flex min-h-[44px] w-full items-center justify-center gap-2 rounded-lg bg-[#D1A953] px-4 py-2.5 text-sm font-semibold text-[#061823] transition-colors hover:bg-[#DFC585] disabled:opacity-60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#F5F2EB]"
          >
            {loading && <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />}
            <span>{loading ? 'Verifying Code…' : 'Verify & Open Dashboard'}</span>
          </button>

          <button
            type="button"
            onClick={() => {
              setMfaChallenge(null);
              setMfaCode('');
              setError(null);
            }}
            className="min-h-[40px] w-full text-center text-xs text-[#C2D0D6] hover:text-[#DFC585]"
          >
            Use a different account
          </button>
        </form>
      ) : viewMode === 'account' ? (
        <form onSubmit={handleAccountSubmit} noValidate className="space-y-4">
          <p className="text-xs leading-relaxed text-[#C2D0D6]">
            Sign in with your administrator or authorized team credentials to manage consultation
            cases, timelines, and analytics.
          </p>

          <div>
            <label htmlFor="admin-login-email" className="block text-xs font-medium text-[#DFC585]">
              Email Address
            </label>
            <input
              id="admin-login-email"
              type="email"
              value={email}
              onChange={(e) => {
                setEmail(e.target.value);
                if (emailError) validateEmailField(e.target.value);
              }}
              onBlur={() => {
                if (email.trim()) validateEmailField(email);
              }}
              placeholder="name@company.com"
              autoComplete="email"
              required
              aria-invalid={Boolean(emailError)}
              aria-describedby={emailError ? 'admin-login-email-err' : undefined}
              className="mt-1.5 min-h-[44px] w-full rounded-lg border border-[#325E6D] bg-[#061823] px-3.5 py-2 text-sm text-[#F5F2EB] placeholder:text-[#C2D0D6]/45 focus:border-[#D1A953] focus:outline-none focus-visible:ring-2 focus-visible:ring-[#D1A953]"
            />
            {emailError && (
              <p id="admin-login-email-err" className="mt-1.5 text-xs text-amber-300">
                {emailError}
              </p>
            )}
          </div>

          <div>
            <div className="flex items-center justify-between gap-2">
              <label
                htmlFor="admin-login-password"
                className="block text-xs font-medium text-[#DFC585]"
              >
                Password
              </label>
              <a
                href={forgotHref}
                onClick={(e) => {
                  e.preventDefault();
                  navigateApp('/admin/forgot-password');
                }}
                className="text-xs font-medium text-[#DFC585] hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#D1A953] rounded"
              >
                Forgot password?
              </a>
            </div>
            <div className="relative mt-1.5">
              <input
                id="admin-login-password"
                type={showPassword ? 'text' : 'password'}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Enter your password"
                autoComplete="current-password"
                required
                className="min-h-[44px] w-full rounded-lg border border-[#325E6D] bg-[#061823] pl-3.5 pr-11 py-2 text-sm text-[#F5F2EB] placeholder:text-[#C2D0D6]/45 focus:border-[#D1A953] focus:outline-none focus-visible:ring-2 focus-visible:ring-[#D1A953]"
              />
              <button
                type="button"
                onClick={() => setShowPassword((prev) => !prev)}
                aria-label={showPassword ? 'Hide password' : 'Show password'}
                aria-pressed={showPassword}
                className="absolute right-1 top-1/2 flex h-10 w-10 -translate-y-1/2 items-center justify-center rounded-md text-[#C2D0D6] hover:text-[#DFC585] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#D1A953]"
              >
                {showPassword ? (
                  <EyeOff className="h-4 w-4" aria-hidden="true" />
                ) : (
                  <Eye className="h-4 w-4" aria-hidden="true" />
                )}
              </button>
            </div>
          </div>

          <div className="flex items-center justify-between gap-3 pt-1">
            <label className="inline-flex min-h-[36px] cursor-pointer items-center gap-2 text-xs text-[#C2D0D6]">
              <input
                type="checkbox"
                checked={rememberEmail}
                onChange={(e) => setRememberEmail(e.target.checked)}
                className="h-4 w-4 rounded border-[#325E6D] bg-[#061823] accent-[#D1A953]"
              />
              <span>Remember email</span>
            </label>
          </div>

          {error && (
            <div
              role="alert"
              className="flex items-start gap-2 rounded-lg border border-amber-400/35 bg-amber-500/10 p-3 text-xs font-medium text-amber-200"
            >
              <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
              <span>{error}</span>
            </div>
          )}

          <button
            type="submit"
            disabled={loading}
            className="inline-flex min-h-[44px] w-full items-center justify-center gap-2 rounded-lg bg-[#D1A953] px-4 py-2.5 text-sm font-semibold text-[#061823] transition-colors hover:bg-[#DFC585] disabled:opacity-60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#F5F2EB]"
          >
            {loading ? (
              <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
            ) : (
              <Lock className="h-4 w-4" aria-hidden="true" />
            )}
            <span>{loading ? 'Authenticating…' : 'Secure Sign In'}</span>
          </button>
        </form>
      ) : viewMode === 'passcode' ? (
        <form onSubmit={handlePasscodeSubmit} className="space-y-4">
          <div className="flex items-start gap-2.5 text-xs leading-relaxed text-[#C2D0D6]">
            <Lock className="mt-0.5 h-4 w-4 shrink-0 text-[#D1A953]" aria-hidden="true" />
            <span>
              Enter the server-configured executive passcode for temporary Super Administrator
              console access.
            </span>
          </div>

          <div>
            <label htmlFor="admin-passcode-input" className="block text-xs font-medium text-[#DFC585]">
              Executive Passcode
            </label>
            <div className="relative mt-1.5">
              <input
                id="admin-passcode-input"
                type={showPasscode ? 'text' : 'password'}
                value={passcode}
                onChange={(e) => setPasscode(e.target.value)}
                placeholder="Enter executive passcode"
                autoComplete="current-password"
                required
                className="min-h-[44px] w-full rounded-lg border border-[#325E6D] bg-[#061823] pl-3.5 pr-11 py-2 text-sm text-[#F5F2EB] placeholder:text-[#C2D0D6]/45 focus:border-[#D1A953] focus:outline-none focus-visible:ring-2 focus-visible:ring-[#D1A953]"
              />
              <button
                type="button"
                onClick={() => setShowPasscode((prev) => !prev)}
                aria-label={showPasscode ? 'Hide passcode' : 'Show passcode'}
                aria-pressed={showPasscode}
                className="absolute right-1 top-1/2 flex h-10 w-10 -translate-y-1/2 items-center justify-center rounded-md text-[#C2D0D6] hover:text-[#DFC585]"
              >
                {showPasscode ? (
                  <EyeOff className="h-4 w-4" aria-hidden="true" />
                ) : (
                  <Eye className="h-4 w-4" aria-hidden="true" />
                )}
              </button>
            </div>
          </div>

          {error && (
            <div
              role="alert"
              className="flex items-start gap-2 rounded-lg border border-amber-400/35 bg-amber-500/10 p-3 text-xs font-medium text-amber-200"
            >
              <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
              <span>{error}</span>
            </div>
          )}

          <button
            type="submit"
            disabled={loading}
            className="inline-flex min-h-[44px] w-full items-center justify-center gap-2 rounded-lg bg-[#D1A953] px-4 py-2.5 text-sm font-semibold text-[#061823] transition-colors hover:bg-[#DFC585] disabled:opacity-60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#F5F2EB]"
          >
            {loading && <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />}
            <span>{loading ? 'Verifying…' : 'Sign In with Passcode'}</span>
          </button>
        </form>
      ) : (
        <form onSubmit={handleBootstrapSubmit} className="space-y-4">
          <div className="flex items-start gap-2.5 text-xs leading-relaxed text-[#C2D0D6]">
            <UserPlus className="mt-0.5 h-4 w-4 shrink-0 text-[#D1A953]" aria-hidden="true" />
            <span>
              {bootstrapConfigured
                ? 'Provision the initial Super Administrator account using your server bootstrap verification token.'
                : 'Set ADMIN_BOOTSTRAP_TOKEN or ADMIN_PASSCODE in the server environment to activate initial Super Administrator setup.'}
            </span>
          </div>

          <div>
            <label htmlFor="boot-token" className="block text-xs font-medium text-[#DFC585]">
              Server Bootstrap Token
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
                className="min-h-[44px] w-full rounded-lg border border-[#325E6D] bg-[#061823] pl-9 pr-3.5 py-2 text-sm text-[#F5F2EB] focus:border-[#D1A953] focus:outline-none focus-visible:ring-2 focus-visible:ring-[#D1A953]"
              />
            </div>
          </div>

          <div>
            <label htmlFor="boot-name" className="block text-xs font-medium text-[#DFC585]">
              Full Name
            </label>
            <input
              id="boot-name"
              type="text"
              value={bootName}
              onChange={(e) => setBootName(e.target.value)}
              placeholder="Pio Languisan"
              required
              className="mt-1.5 min-h-[44px] w-full rounded-lg border border-[#325E6D] bg-[#061823] px-3.5 py-2 text-sm text-[#F5F2EB] focus:border-[#D1A953] focus:outline-none focus-visible:ring-2 focus-visible:ring-[#D1A953]"
            />
          </div>

          <div>
            <label htmlFor="boot-email" className="block text-xs font-medium text-[#DFC585]">
              Work Email
            </label>
            <input
              id="boot-email"
              type="email"
              value={bootEmail}
              onChange={(e) => setBootEmail(e.target.value)}
              placeholder="admin@company.com"
              required
              className="mt-1.5 min-h-[44px] w-full rounded-lg border border-[#325E6D] bg-[#061823] px-3.5 py-2 text-sm text-[#F5F2EB] focus:border-[#D1A953] focus:outline-none focus-visible:ring-2 focus-visible:ring-[#D1A953]"
            />
          </div>

          <div>
            <label htmlFor="boot-password" className="block text-xs font-medium text-[#DFC585]">
              Password (12+ chars, upper/lower/digit or symbol)
            </label>
            <div className="relative mt-1.5">
              <input
                id="boot-password"
                type={showBootPassword ? 'text' : 'password'}
                minLength={12}
                value={bootPassword}
                onChange={(e) => setBootPassword(e.target.value)}
                required
                className="min-h-[44px] w-full rounded-lg border border-[#325E6D] bg-[#061823] pl-3.5 pr-11 py-2 text-sm text-[#F5F2EB] focus:border-[#D1A953] focus:outline-none focus-visible:ring-2 focus-visible:ring-[#D1A953]"
              />
              <button
                type="button"
                onClick={() => setShowBootPassword((p) => !p)}
                aria-label={showBootPassword ? 'Hide password' : 'Show password'}
                className="absolute right-1 top-1/2 flex h-10 w-10 -translate-y-1/2 items-center justify-center rounded-md text-[#C2D0D6] hover:text-[#DFC585]"
              >
                {showBootPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </button>
            </div>
          </div>

          {error && (
            <div
              role="alert"
              className="flex items-start gap-2 rounded-lg border border-amber-400/35 bg-amber-500/10 p-3 text-xs font-medium text-amber-200"
            >
              <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
              <span>{error}</span>
            </div>
          )}

          <button
            type="submit"
            disabled={loading}
            className="inline-flex min-h-[44px] w-full items-center justify-center gap-2 rounded-lg bg-[#D1A953] px-4 py-2.5 text-sm font-semibold text-[#061823] transition-colors hover:bg-[#DFC585] disabled:opacity-60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#F5F2EB]"
          >
            {loading && <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />}
            <span>{loading ? 'Creating Super Admin…' : 'Create Super Administrator'}</span>
          </button>
        </form>
      )}

      {!mfaChallenge && (!hasAdminUsers || passcodeConfigured || viewMode !== 'account') && (
        <div className="mt-6 flex flex-wrap items-center justify-center gap-x-4 gap-y-2 border-t border-[#D1A953]/15 pt-4 text-xs text-[#C2D0D6]">
          {viewMode !== 'account' && (
            <button
              type="button"
              onClick={() => {
                setViewMode('account');
                setError(null);
              }}
              className="font-medium text-[#DFC585] hover:underline"
            >
              Sign in with Email &amp; Password
            </button>
          )}
          {!hasAdminUsers && viewMode !== 'bootstrap' && (
            <button
              type="button"
              onClick={() => {
                setViewMode('bootstrap');
                setError(null);
              }}
              className="font-medium text-[#DFC585] hover:underline"
            >
              First-Time Admin Setup
            </button>
          )}
          {passcodeConfigured && viewMode !== 'passcode' && (
            <button
              type="button"
              onClick={() => {
                setViewMode('passcode');
                setError(null);
              }}
              className="hover:text-[#DFC585] hover:underline"
            >
              Executive Passcode Access
            </button>
          )}
        </div>
      )}
    </AdminAuthLayout>
  );
};
