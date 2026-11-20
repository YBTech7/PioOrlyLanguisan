import React, { useMemo, useState } from 'react';
import {
  AlertCircle,
  CheckCircle2,
  Eye,
  EyeOff,
  Loader2,
  Mail,
} from 'lucide-react';
import { apiFetch } from '../../lib/apiClient';
import { navigateApp } from '../../lib/adminRouter';
import { AdminAuthLayout } from './AdminAuthLayout';

function getPasswordChecks(pw: string) {
  return [
    { label: 'At least 12 characters', pass: pw.length >= 12 },
    { label: 'Contains uppercase letter', pass: /[A-Z]/.test(pw) },
    { label: 'Contains lowercase letter', pass: /[a-z]/.test(pw) },
    { label: 'Contains number or symbol', pass: /[0-9!@#$%^&*()_+\-=[\]{};':"\\|,.<>/?]/.test(pw) },
  ];
}

export const AdminForgotPasswordPage: React.FC<{ customLogoUrl?: string | null }> = ({
  customLogoUrl,
}) => {
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sentMessage, setSentMessage] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSentMessage(null);
    setLoading(true);
    try {
      const res = await apiFetch<{ ok: boolean; message: string }>('/api/auth/forgot-password', {
        method: 'POST',
        body: JSON.stringify({ email: email.trim().toLowerCase() }),
      });
      setSentMessage(res.message);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : 'Unable to send password recovery instructions.'
      );
    } finally {
      setLoading(false);
    }
  };

  return (
    <AdminAuthLayout
      title="Password Recovery"
      subtitle="Admin Console"
      customLogoUrl={customLogoUrl}
    >
      {sentMessage ? (
        <div className="space-y-5">
          <div
            role="status"
            className="flex items-start gap-2.5 rounded-xl border border-[#D1A953]/35 bg-[#061823]/90 p-4 text-xs leading-relaxed text-[#DFC585]"
          >
            <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-[#D1A953]" aria-hidden="true" />
            <span>{sentMessage}</span>
          </div>
          <button
            type="button"
            onClick={() => navigateApp('/admin/login')}
            className="min-h-[44px] w-full rounded-lg bg-[#D1A953] px-4 py-2.5 text-sm font-semibold text-[#061823] hover:bg-[#DFC585]"
          >
            Return to Sign In
          </button>
        </div>
      ) : (
        <form onSubmit={handleSubmit} className="space-y-4">
          <p className="text-xs leading-relaxed text-[#C2D0D6]">
            Enter the email address associated with your administrator or staff account. If email
            delivery is enabled and the account is active, a single-use recovery link will be
            sent.
          </p>

          <div>
            <label htmlFor="recovery-email" className="block text-xs font-medium text-[#DFC585]">
              Account Email Address
            </label>
            <input
              id="recovery-email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="name@company.com"
              autoComplete="email"
              required
              className="mt-1.5 min-h-[44px] w-full rounded-lg border border-[#325E6D] bg-[#061823] px-3.5 py-2 text-sm text-[#F5F2EB] placeholder:text-[#C2D0D6]/45 focus:border-[#D1A953] focus:outline-none focus-visible:ring-2 focus-visible:ring-[#D1A953]"
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
            className="inline-flex min-h-[44px] w-full items-center justify-center gap-2 rounded-lg bg-[#D1A953] px-4 py-2.5 text-sm font-semibold text-[#061823] transition-colors hover:bg-[#DFC585] disabled:opacity-60"
          >
            {loading ? (
              <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
            ) : (
              <Mail className="h-4 w-4" aria-hidden="true" />
            )}
            <span>{loading ? 'Sending Request…' : 'Send Recovery Link'}</span>
          </button>

          <div className="pt-2 text-center">
            <button
              type="button"
              onClick={() => navigateApp('/admin/login')}
              className="text-xs font-medium text-[#DFC585] hover:underline"
            >
              Back to Admin Sign In
            </button>
          </div>
        </form>
      )}
    </AdminAuthLayout>
  );
};

interface TokenPasswordFormProps {
  mode: 'reset' | 'invite';
  token: string;
  customLogoUrl?: string | null;
}

const TokenPasswordForm: React.FC<TokenPasswordFormProps> = ({
  mode,
  token,
  customLogoUrl,
}) => {
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [showPw, setShowPw] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [doneMessage, setDoneMessage] = useState<string | null>(null);

  const checks = useMemo(() => getPasswordChecks(password), [password]);
  const allChecksPass = checks.every((c) => c.pass);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (!allChecksPass) {
      setError('Please meet all password complexity requirements.');
      return;
    }
    if (password !== confirm) {
      setError('Passwords do not match.');
      return;
    }
    setLoading(true);
    try {
      const endpoint = mode === 'reset' ? '/api/auth/reset-password' : '/api/auth/accept-invite';
      await apiFetch(endpoint, {
        method: 'POST',
        body: JSON.stringify({ token, password }),
      });
      setDoneMessage(
        mode === 'reset'
          ? 'Your password has been updated and previous sessions have been revoked.'
          : 'Your account has been activated. You can now sign in to the Admin Console.'
      );
      setPassword('');
      setConfirm('');
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : mode === 'reset'
            ? 'Unable to reset password.'
            : 'Unable to activate invitation.'
      );
    } finally {
      setLoading(false);
    }
  };

  return (
    <AdminAuthLayout
      title={mode === 'reset' ? 'Set New Password' : 'Activate Team Account'}
      subtitle="Admin Console"
      customLogoUrl={customLogoUrl}
    >
      {!token ? (
        <div className="space-y-4">
          <div
            role="alert"
            className="flex items-start gap-2 rounded-lg border border-amber-400/35 bg-amber-500/10 p-3.5 text-xs font-medium text-amber-200"
          >
            <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
            <span>
              This {mode === 'reset' ? 'password recovery' : 'team invitation'} link is missing a
              valid verification token.
            </span>
          </div>
          <button
            type="button"
            onClick={() =>
              navigateApp(mode === 'reset' ? '/admin/forgot-password' : '/admin/login')
            }
            className="min-h-[44px] w-full rounded-lg bg-[#D1A953] px-4 py-2.5 text-sm font-semibold text-[#061823] hover:bg-[#DFC585]"
          >
            {mode === 'reset' ? 'Request New Recovery Link' : 'Go to Sign In'}
          </button>
        </div>
      ) : doneMessage ? (
        <div className="space-y-5">
          <div
            role="status"
            className="flex items-start gap-2.5 rounded-xl border border-[#D1A953]/35 bg-[#061823]/90 p-4 text-xs leading-relaxed text-[#DFC585]"
          >
            <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-[#D1A953]" aria-hidden="true" />
            <span>{doneMessage}</span>
          </div>
          <button
            type="button"
            onClick={() => navigateApp('/admin/login')}
            className="min-h-[44px] w-full rounded-lg bg-[#D1A953] px-4 py-2.5 text-sm font-semibold text-[#061823] hover:bg-[#DFC585]"
          >
            Proceed to Sign In
          </button>
        </div>
      ) : (
        <form onSubmit={handleSubmit} className="space-y-4">
          <p className="text-xs leading-relaxed text-[#C2D0D6]">
            {mode === 'reset'
              ? 'Choose a strong password for your Admin Console account.'
              : 'Set a strong password to complete your Admin Console team invitation.'}
          </p>

          <div>
            <label htmlFor="reset-password" className="block text-xs font-medium text-[#DFC585]">
              New Password
            </label>
            <div className="relative mt-1.5">
              <input
                id="reset-password"
                type={showPw ? 'text' : 'password'}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                autoComplete="new-password"
                required
                className="min-h-[44px] w-full rounded-lg border border-[#325E6D] bg-[#061823] pl-3.5 pr-11 py-2 text-sm text-[#F5F2EB] focus:border-[#D1A953] focus:outline-none focus-visible:ring-2 focus-visible:ring-[#D1A953]"
              />
              <button
                type="button"
                onClick={() => setShowPw((p) => !p)}
                aria-label={showPw ? 'Hide password' : 'Show password'}
                className="absolute right-1 top-1/2 flex h-10 w-10 -translate-y-1/2 items-center justify-center rounded-md text-[#C2D0D6] hover:text-[#DFC585]"
              >
                {showPw ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </button>
            </div>
          </div>

          <div>
            <label
              htmlFor="reset-confirm-password"
              className="block text-xs font-medium text-[#DFC585]"
            >
              Confirm Password
            </label>
            <input
              id="reset-confirm-password"
              type={showPw ? 'text' : 'password'}
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
              autoComplete="new-password"
              required
              className="mt-1.5 min-h-[44px] w-full rounded-lg border border-[#325E6D] bg-[#061823] px-3.5 py-2 text-sm text-[#F5F2EB] focus:border-[#D1A953] focus:outline-none focus-visible:ring-2 focus-visible:ring-[#D1A953]"
            />
          </div>

          <ul className="space-y-1 rounded-lg border border-[#D1A953]/15 bg-[#061823]/70 p-3 text-[11px]">
            {checks.map((item) => (
              <li
                key={item.label}
                className={`flex items-center gap-2 ${
                  item.pass ? 'text-[#DFC585]' : 'text-[#C2D0D6]/75'
                }`}
              >
                <span aria-hidden="true">{item.pass ? '✓' : '·'}</span>
                <span>{item.label}</span>
              </li>
            ))}
          </ul>

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
            className="inline-flex min-h-[44px] w-full items-center justify-center gap-2 rounded-lg bg-[#D1A953] px-4 py-2.5 text-sm font-semibold text-[#061823] hover:bg-[#DFC585] disabled:opacity-60"
          >
            {loading && <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />}
            <span>{mode === 'reset' ? 'Update Password' : 'Activate Account'}</span>
          </button>
        </form>
      )}
    </AdminAuthLayout>
  );
};

export const AdminResetPasswordPage: React.FC<{ token: string; customLogoUrl?: string | null }> = ({
  token,
  customLogoUrl,
}) => <TokenPasswordForm mode="reset" token={token} customLogoUrl={customLogoUrl} />;

export const AdminAcceptInvitePage: React.FC<{ token: string; customLogoUrl?: string | null }> = ({
  token,
  customLogoUrl,
}) => <TokenPasswordForm mode="invite" token={token} customLogoUrl={customLogoUrl} />;
