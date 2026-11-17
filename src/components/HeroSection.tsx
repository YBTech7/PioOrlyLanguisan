import React from 'react';
import { ArrowRight, MessageSquare } from 'lucide-react';
import ProfilePhoto from './ProfilePhoto';

interface HeroSectionProps {
  onBookConsultation: () => void;
  onOpenAdvisor: () => void;
}

const CAPABILITY_PILLARS = [
  {
    index: '01',
    label: 'Technical Support',
    detail: 'Structured triage, escalation playbooks & systems continuity',
  },
  {
    index: '02',
    label: 'Data Analytics',
    detail: 'Normalized KPI dashboards, SLA variance & executive reporting',
  },
  {
    index: '03',
    label: 'Operations & Accounts',
    detail: 'Administrative governance, client onboarding & renewal QBRs',
  },
  {
    index: '04',
    label: 'Web & AI Systems',
    detail: 'Responsive client platforms & Gemini-guided service workflows',
  },
];

export const HeroSection: React.FC<HeroSectionProps> = ({
  onBookConsultation,
  onOpenAdvisor,
}) => {
  return (
    <section id="top" className="relative z-10 border-b border-[#E5CE93]/15 pt-12 pb-16 sm:pt-16 sm:pb-20">
      <div className="mx-auto max-w-[1280px] px-5 sm:px-8">
        <div className="grid grid-cols-1 items-stretch gap-10 lg:grid-cols-12 lg:gap-12">
          <div className="flex flex-col justify-between lg:col-span-7">
            <div className="space-y-6">
              <p className="text-xs font-medium tracking-[0.14em] uppercase text-[#E5CE93]">
                Technology · Operations · Analytics
              </p>

              <h1
                className="font-display font-semibold tracking-tight text-[#F5F2EB] max-w-2xl"
                style={{
                  fontSize: 'clamp(2.25rem, 4vw, 3.75rem)',
                  lineHeight: 1.08,
                  textWrap: 'balance',
                }}
              >
                Operational discipline and intelligent systems for modern teams.
              </h1>

              <p className="max-w-[65ch] text-base leading-relaxed text-[#F5F2EB]/80 sm:text-lg">
                Pio Languisan partners with individuals, startups, small businesses, and enterprise
                clients across technical support, customer operations, data analytics, account
                management, administrative execution, and custom web platforms.
              </p>

              <div className="flex flex-wrap items-center gap-5 pt-2">
                <button
                  type="button"
                  onClick={onBookConsultation}
                  className="inline-flex min-h-[44px] items-center gap-2 rounded-lg bg-[#C8A253] px-6 py-3 text-sm font-semibold text-[#071B20] whitespace-nowrap transition-colors duration-150 hover:bg-[#E5CE93] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#F5F2EB]"
                >
                  <span>Book Consultation</span>
                  <ArrowRight className="h-4 w-4" aria-hidden="true" />
                </button>

                <button
                  type="button"
                  onClick={onOpenAdvisor}
                  className="inline-flex min-h-[44px] items-center gap-2 rounded-lg border border-[#E5CE93]/25 bg-[#0D2B32]/80 px-5 py-3 text-sm font-medium text-[#F5F2EB] whitespace-nowrap transition-colors duration-150 hover:border-[#C8A253] hover:text-[#E5CE93] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#C8A253]"
                >
                  <MessageSquare className="h-4 w-4 text-[#C8A253]" aria-hidden="true" />
                  <span>Ask Gemini Service Advisor</span>
                </button>
              </div>
            </div>

            <div className="mt-10 grid grid-cols-1 gap-4 border-t border-[#E5CE93]/15 pt-6 sm:grid-cols-3">
              <div>
                <p className="font-mono text-xs tabular-nums text-[#E5CE93]">06</p>
                <p className="mt-1 text-sm font-medium text-[#F5F2EB]">Core Practice Domains</p>
                <p className="mt-0.5 text-xs text-[#F5F2EB]/65">
                  Support, service, analytics, ops, accounts & web
                </p>
              </div>
              <div>
                <p className="font-mono text-xs tabular-nums text-[#E5CE93]">04</p>
                <p className="mt-1 text-sm font-medium text-[#F5F2EB]">Client Organization Tiers</p>
                <p className="mt-0.5 text-xs text-[#F5F2EB]/65">
                  Individuals, startups, SMBs & enterprise teams
                </p>
              </div>
              <div>
                <p className="font-mono text-xs tabular-nums text-[#E5CE93]">24h</p>
                <p className="mt-1 text-sm font-medium text-[#F5F2EB]">Discovery Turnaround</p>
                <p className="mt-0.5 text-xs text-[#F5F2EB]/65">
                  Structured scope brief on every inquiry
                </p>
              </div>
            </div>
          </div>

          <div className="lg:col-span-5 flex items-center justify-center">
            <ProfilePhoto priority={true} />
          </div>
        </div>

        <div className="mt-12 grid grid-cols-1 gap-4 border-t border-[#E5CE93]/15 pt-8 sm:grid-cols-2 lg:grid-cols-4">
          {CAPABILITY_PILLARS.map((pillar) => (
            <div
              key={pillar.index}
              className="rounded-xl border border-[#E5CE93]/12 bg-[#0D2B32]/65 p-5"
            >
              <span className="font-mono text-xs tabular-nums text-[#C8A253]">
                {pillar.index}
              </span>
              <h2 className="mt-2 font-display text-base font-semibold text-[#F5F2EB]">
                {pillar.label}
              </h2>
              <p className="mt-1.5 text-sm leading-relaxed text-[#F5F2EB]/70">
                {pillar.detail}
              </p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
};
