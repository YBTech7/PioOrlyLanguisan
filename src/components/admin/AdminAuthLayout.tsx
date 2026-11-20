import React from 'react';
import { ArrowLeft, Shield } from 'lucide-react';
import { buildAppHref, navigateApp } from '../../lib/adminRouter';
import { BrandMark } from '../BrandMark';
import { NetworkCanvas } from '../NetworkCanvas';

interface AdminAuthLayoutProps {
  title: string;
  subtitle: string;
  customLogoUrl?: string | null;
  children: React.ReactNode;
}

export const AdminAuthLayout: React.FC<AdminAuthLayoutProps> = ({
  title,
  subtitle,
  customLogoUrl,
  children,
}) => {
  const publicHref = buildAppHref('/');

  return (
    <div className="relative flex min-h-screen flex-col justify-between overflow-x-hidden bg-[#061823] text-[#F5F2EB]">
      <div
        aria-hidden="true"
        className="pointer-events-none fixed inset-0 z-0 bg-[radial-gradient(ellipse_at_top,_rgba(18,56,70,0.55)_0%,_rgba(6,24,35,0.94)_58%,_#05111A_100%)]"
      />
      <NetworkCanvas />

      <a
        href="#admin-auth-main"
        className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-50 focus:rounded-lg focus:bg-[#D1A953] focus:px-4 focus:py-2 focus:text-xs focus:font-semibold focus:text-[#061823]"
      >
        Skip to sign-in form
      </a>

      <header className="relative z-10 mx-auto flex w-full max-w-[1120px] items-center justify-between px-5 pt-6 sm:px-8">
        <a
          href={publicHref}
          onClick={(e) => {
            e.preventDefault();
            navigateApp('/');
          }}
          className="inline-flex min-h-[44px] items-center gap-2 rounded-lg border border-[#D1A953]/22 bg-[#0B2531]/85 px-3.5 py-2 text-xs font-medium text-[#C2D0D6] transition-colors hover:border-[#D1A953]/60 hover:text-[#DFC585] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#D1A953]"
        >
          <ArrowLeft className="h-3.5 w-3.5" aria-hidden="true" />
          <span>Return to Main Website</span>
        </a>

        <div className="hidden sm:flex items-center gap-2 text-[11px] font-medium tracking-[0.12em] uppercase text-[#DFC585]">
          <Shield className="h-3.5 w-3.5 text-[#D1A953]" aria-hidden="true" />
          <span>Protected Admin Boundary</span>
        </div>
      </header>

      <main
        id="admin-auth-main"
        tabIndex={-1}
        className="relative z-10 mx-auto flex w-full max-w-md flex-1 flex-col justify-center px-4 py-8 sm:px-6 focus:outline-none"
      >
        <div className="mb-6 flex flex-col items-center text-center">
          <div className="rounded-full border border-[#D1A953]/30 bg-[#0B2531]/90 p-2 shadow-[0_0_28px_rgba(209,169,83,0.12)]">
            <BrandMark
              customLogoUrl={customLogoUrl}
              size={48}
              decorative={false}
              alt="Pio Languisan monogram"
            />
          </div>
          <p className="mt-3 font-editorial text-lg font-semibold tracking-wide text-[#F5F2EB]">
            Pio Languisan
          </p>
          <p className="mt-0.5 text-[11px] tracking-[0.16em] uppercase text-[#C2D0D6]">
            Technology · Operations · Analytics
          </p>
        </div>

        <section
          aria-labelledby="auth-card-heading"
          className="w-full rounded-2xl border border-[#D1A953]/25 bg-[#0B2531]/95 p-6 sm:p-8 shadow-[0_24px_60px_rgba(2,10,16,0.65)] backdrop-blur-md"
        >
          <div className="border-b border-[#D1A953]/15 pb-5">
            <p className="text-[11px] font-medium tracking-[0.14em] uppercase text-[#DFC585]">
              {subtitle}
            </p>
            <h1
              id="auth-card-heading"
              className="mt-1.5 font-editorial text-2xl font-semibold text-[#F5F2EB]"
            >
              {title}
            </h1>
          </div>

          <div className="mt-6">{children}</div>
        </section>
      </main>

      <footer className="relative z-10 border-t border-[#D1A953]/12 bg-[#05111A]/80 py-5 text-center text-xs text-[#C2D0D6]/85">
        © {new Date().getFullYear()} Pio Languisan. All rights reserved.
      </footer>
    </div>
  );
};
