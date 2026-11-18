import React, { useState } from 'react';
import { ArrowUpRight, Check, Sparkles } from 'lucide-react';
import {
  CLIENT_TIER_SOLUTIONS,
  NETWORK_VISUAL_URL,
  SERVICE_OFFERINGS,
  resolveAssetUrl,
} from '../data/profileData';
import { apiFetch } from '../lib/apiClient';
import type {
  AiScopeRecommendation,
  ClientTierId,
  ServiceDomainId,
} from '../types';

interface ServicesAndSolutionsProps {
  selectedTier: ClientTierId;
  onSelectTier: (tier: ClientTierId) => void;
  onSelectServiceForConsult: (serviceId: ServiceDomainId, tierId?: ClientTierId) => void;
  onApplyAiScope: (scope: AiScopeRecommendation) => void;
}

const TIER_CHART_SERIES: Record<
  ClientTierId,
  {
    label: string;
    slaTarget: string;
    cycleReduction: string;
    points: { quarter: string; baseline: number; optimized: number }[];
  }
> = {
  individual: {
    label: 'Personal Workflow Efficiency Index',
    slaTarget: '99.2%',
    cycleReduction: '-38%',
    points: [
      { quarter: 'W1', baseline: 58, optimized: 68 },
      { quarter: 'W2', baseline: 60, optimized: 78 },
      { quarter: 'W3', baseline: 59, optimized: 88 },
      { quarter: 'W4', baseline: 62, optimized: 95 },
    ],
  },
  startup: {
    label: 'First-Response Resolution Velocity',
    slaTarget: '97.5%',
    cycleReduction: '-44%',
    points: [
      { quarter: 'Q1', baseline: 48, optimized: 64 },
      { quarter: 'Q2', baseline: 51, optimized: 76 },
      { quarter: 'Q3', baseline: 50, optimized: 86 },
      { quarter: 'Q4', baseline: 53, optimized: 93 },
    ],
  },
  smb: {
    label: 'Cross-Team SLA & Account Health',
    slaTarget: '98.1%',
    cycleReduction: '-41%',
    points: [
      { quarter: 'Q1', baseline: 55, optimized: 70 },
      { quarter: 'Q2', baseline: 57, optimized: 81 },
      { quarter: 'Q3', baseline: 56, optimized: 89 },
      { quarter: 'Q4', baseline: 58, optimized: 96 },
    ],
  },
  enterprise: {
    label: 'Multi-Tier Escalation Consistency',
    slaTarget: '99.4%',
    cycleReduction: '-47%',
    points: [
      { quarter: 'Q1', baseline: 62, optimized: 74 },
      { quarter: 'Q2', baseline: 63, optimized: 84 },
      { quarter: 'Q3', baseline: 61, optimized: 92 },
      { quarter: 'Q4', baseline: 64, optimized: 98 },
    ],
  },
};

export const ServicesAndSolutions: React.FC<ServicesAndSolutionsProps> = ({
  selectedTier,
  onSelectTier,
  onSelectServiceForConsult,
  onApplyAiScope,
}) => {
  const [goalInput, setGoalInput] = useState('');
  const [scopeLoading, setScopeLoading] = useState(false);
  const [scopeError, setScopeError] = useState<string | null>(null);
  const [scopeResult, setScopeResult] = useState<AiScopeRecommendation | null>(null);

  const activeSolution =
    CLIENT_TIER_SOLUTIONS.find((t) => t.id === selectedTier) || CLIENT_TIER_SOLUTIONS[1];
  const chartData = TIER_CHART_SERIES[selectedTier];

  const handleGenerateScope = async (e: React.FormEvent) => {
    e.preventDefault();
    if (goalInput.trim().length < 5) {
      setScopeError('Describe your operational challenge or project goal in at least a few words.');
      return;
    }

    setScopeLoading(true);
    setScopeError(null);
    try {
      const data = await apiFetch<{ scope: AiScopeRecommendation }>('/api/assistant/scope', {
        method: 'POST',
        body: JSON.stringify({ goal: goalInput.trim() }),
      });
      setScopeResult(data.scope);
    } catch (err) {
      setScopeError(
        err instanceof Error ? err.message : 'Unable to reach Gemini service advisor.'
      );
    } finally {
      setScopeLoading(false);
    }
  };

  return (
    <>
      {/* About & Practice Philosophy */}
      <section id="about" className="scroll-mt-20 relative z-10 border-b border-[#E5CE93]/15 py-16 sm:py-20">
        <div className="mx-auto max-w-[1280px] px-5 sm:px-8">
          <div className="grid grid-cols-1 items-center gap-10 lg:grid-cols-12 lg:gap-12">
            <div className="lg:col-span-6 space-y-5">
              <p className="text-xs font-medium tracking-[0.14em] uppercase text-[#E5CE93]">
                Executive Profile
              </p>
              <h2
                className="font-display text-3xl font-semibold tracking-tight text-[#F5F2EB] sm:text-4xl"
                style={{ textWrap: 'balance' }}
              >
                Where hands-on operations meet clear technical execution.
              </h2>
              <p className="text-base leading-relaxed text-[#F5F2EB]/80">
                Modern organizations rarely stall from a lack of tools—they stall when customer
                support queues, data reporting, account handoffs, and web systems operate in
                disconnected silos.
              </p>
              <p className="text-base leading-relaxed text-[#F5F2EB]/75">
                Drawing from direct experience across technical support, customer service, data
                analytics, administrative operations, strategic account management, and web creation,
                Pio Languisan builds cohesive systems that scale cleanly from solo practices to
                enterprise teams.
              </p>

              <div className="grid grid-cols-1 gap-4 border-t border-[#E5CE93]/15 pt-6 sm:grid-cols-3">
                <div>
                  <p className="font-mono text-xs text-[#C8A253]">01</p>
                  <p className="mt-1 text-sm font-semibold text-[#F5F2EB]">Diagnose</p>
                  <p className="mt-1 text-xs leading-relaxed text-[#F5F2EB]/65">
                    Audit queues, spreadsheets, and client handoffs for hidden friction.
                  </p>
                </div>
                <div>
                  <p className="font-mono text-xs text-[#C8A253]">02</p>
                  <p className="mt-1 text-sm font-semibold text-[#F5F2EB]">Structure</p>
                  <p className="mt-1 text-xs leading-relaxed text-[#F5F2EB]/65">
                    Establish clean SOPs, SLA governance, and normalized data models.
                  </p>
                </div>
                <div>
                  <p className="font-mono text-xs text-[#C8A253]">03</p>
                  <p className="mt-1 text-sm font-semibold text-[#F5F2EB]">Automate</p>
                  <p className="mt-1 text-xs leading-relaxed text-[#F5F2EB]/65">
                    Deploy web portals, executive reporting, and Gemini-assisted workflows.
                  </p>
                </div>
              </div>
            </div>

            <div className="lg:col-span-6">
              <div className="overflow-hidden rounded-2xl border border-[#E5CE93]/20 bg-[#0D2B32]">
                <img
                  src={resolveAssetUrl(NETWORK_VISUAL_URL)}
                  alt="Distributed network topology representing interconnected operational systems"
                  referrerPolicy="no-referrer"
                  loading="lazy"
                  className="aspect-video w-full object-cover"
                />
                <div className="flex flex-wrap items-center justify-between gap-2 border-t border-[#E5CE93]/15 px-5 py-3.5 text-xs text-[#F5F2EB]/75">
                  <span>Connected Operations Architecture</span>
                  <span className="text-[#E5CE93]">Support · Analytics · Accounts · Web</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Core Services Asymmetric Bento Grid */}
      <section id="services" className="scroll-mt-20 relative z-10 border-b border-[#E5CE93]/15 py-16 sm:py-20">
        <div className="mx-auto max-w-[1280px] px-5 sm:px-8">
          <div className="flex flex-col justify-between gap-4 border-b border-[#E5CE93]/15 pb-8 md:flex-row md:items-end">
            <div className="max-w-2xl">
              <p className="text-xs font-medium tracking-[0.14em] uppercase text-[#E5CE93]">
                Core Services
              </p>
              <h2
                className="mt-2 font-display text-3xl font-semibold tracking-tight text-[#F5F2EB] sm:text-4xl"
                style={{ textWrap: 'balance' }}
              >
                Six practice disciplines built for measurable delivery.
              </h2>
            </div>
            <p className="max-w-md text-sm leading-relaxed text-[#F5F2EB]/70">
              Select any capability below to pre-configure a focused consultation brief tailored to
              your operational priorities.
            </p>
          </div>

          <div className="mt-10 grid grid-cols-1 gap-6 lg:grid-cols-12">
            {SERVICE_OFFERINGS.map((service, idx) => {
              const isWide = idx === 0 || idx === 3 || idx === 4;
              const colSpan = isWide ? 'lg:col-span-7' : 'lg:col-span-5';
              return (
                <article
                  key={service.id}
                  className={`${colSpan} flex flex-col justify-between rounded-2xl border border-[#E5CE93]/15 bg-[#0D2B32]/85 p-6 sm:p-7 transition-colors duration-150 hover:border-[#C8A253]/45`}
                >
                  <div>
                    <div className="flex items-center justify-between gap-4 text-xs text-[#F5F2EB]/65">
                      <span className="font-mono tabular-nums text-[#E5CE93]">
                        {service.index}
                      </span>
                      <span>{service.cadence}</span>
                    </div>

                    <h3 className="mt-3 font-display text-xl font-semibold text-[#F5F2EB]">
                      {service.index}. {service.title}
                    </h3>

                    <p className="mt-2.5 text-sm leading-relaxed text-[#F5F2EB]/75">
                      {service.summary}
                    </p>

                    <div className="mt-5 grid grid-cols-1 gap-4 border-t border-[#E5CE93]/10 pt-5 sm:grid-cols-2">
                      <div>
                        <p className="text-xs font-medium text-[#E5CE93]">Operational Outcomes</p>
                        <ul className="mt-2 space-y-1.5 text-xs leading-relaxed text-[#F5F2EB]/75">
                          {service.outcomes.map((outcome) => (
                            <li key={outcome} className="flex items-start gap-2">
                              <Check
                                className="mt-0.5 h-3.5 w-3.5 shrink-0 text-[#C8A253]"
                                aria-hidden="true"
                              />
                              <span>{outcome}</span>
                            </li>
                          ))}
                        </ul>
                      </div>
                      <div>
                        <p className="text-xs font-medium text-[#E5CE93]">Key Deliverables</p>
                        <ul className="mt-2 space-y-1.5 text-xs leading-relaxed text-[#F5F2EB]/70">
                          {service.deliverables.map((del) => (
                            <li key={del}>· {del}</li>
                          ))}
                        </ul>
                      </div>
                    </div>
                  </div>

                  <div className="mt-6 flex items-center justify-end border-t border-[#E5CE93]/10 pt-4">
                    <button
                      type="button"
                      onClick={() => onSelectServiceForConsult(service.id)}
                      className="inline-flex items-center gap-1.5 text-xs font-semibold text-[#E5CE93] whitespace-nowrap transition-colors hover:text-[#F5F2EB] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#C8A253] rounded px-1 py-0.5"
                    >
                      <span>Scope {service.shortTitle}</span>
                      <ArrowUpRight className="h-3.5 w-3.5" aria-hidden="true" />
                    </button>
                  </div>
                </article>
              );
            })}
          </div>
        </div>
      </section>

      {/* Business Solutions & Interactive Analytics + AI Scope */}
      <section id="solutions" className="scroll-mt-20 relative z-10 border-b border-[#E5CE93]/15 py-16 sm:py-20">
        <div className="mx-auto max-w-[1280px] px-5 sm:px-8">
          <div className="flex flex-col justify-between gap-6 lg:flex-row lg:items-end">
            <div className="max-w-2xl">
              <p className="text-xs font-medium tracking-[0.14em] uppercase text-[#E5CE93]">
                Business Solutions
              </p>
              <h2
                className="mt-2 font-display text-3xl font-semibold tracking-tight text-[#F5F2EB] sm:text-4xl"
                style={{ textWrap: 'balance' }}
              >
                Structured engagement models for every stage of growth.
              </h2>
            </div>

            <div
              role="tablist"
              aria-label="Client Organization Tiers"
              className="inline-flex flex-wrap gap-1 rounded-xl border border-[#E5CE93]/15 bg-[#0D2B32] p-1"
            >
              {CLIENT_TIER_SOLUTIONS.map((tier) => {
                const isActive = tier.id === selectedTier;
                return (
                  <button
                    key={tier.id}
                    type="button"
                    role="tab"
                    aria-selected={isActive}
                    onClick={() => onSelectTier(tier.id)}
                    className={`rounded-lg px-3.5 py-2 text-xs font-semibold whitespace-nowrap shrink-0 transition-colors duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#C8A253] ${
                      isActive
                        ? 'bg-[#C8A253] text-[#071B20]'
                        : 'text-[#F5F2EB]/75 hover:text-[#F5F2EB]'
                    }`}
                  >
                    {tier.label}
                  </button>
                );
              })}
            </div>
          </div>

          <div className="mt-10 grid grid-cols-1 gap-8 lg:grid-cols-12">
            {/* Tier Solution Brief */}
            <div className="flex flex-col justify-between rounded-2xl border border-[#E5CE93]/15 bg-[#0D2B32]/85 p-7 lg:col-span-6">
              <div>
                <p className="text-xs text-[#E5CE93]">
                  {activeSolution.label} · {activeSolution.typicalTimeline}
                </p>
                <h3 className="mt-2 font-display text-2xl font-semibold text-[#F5F2EB]">
                  {activeSolution.headline}
                </h3>
                <p className="mt-3 text-sm leading-relaxed text-[#F5F2EB]/80">
                  {activeSolution.description}
                </p>

                <div className="mt-6 space-y-4 border-t border-[#E5CE93]/15 pt-5">
                  <div>
                    <p className="text-xs font-medium text-[#E5CE93]">Recommended Pillars</p>
                    <p className="mt-1 text-sm text-[#F5F2EB]/85">
                      {activeSolution.recommendedServices.join(' · ')}
                    </p>
                  </div>
                  <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                    <div>
                      <p className="text-xs font-medium text-[#E5CE93]">Engagement Cadence</p>
                      <p className="mt-1 text-sm text-[#F5F2EB]/80">
                        {activeSolution.engagementModel}
                      </p>
                    </div>
                    <div>
                      <p className="text-xs font-medium text-[#E5CE93]">Anchor Deliverable</p>
                      <p className="mt-1 text-sm text-[#F5F2EB]/80">
                        {activeSolution.keyDeliverable}
                      </p>
                    </div>
                  </div>
                </div>
              </div>

              <div className="mt-8 flex items-center justify-between border-t border-[#E5CE93]/15 pt-5">
                <span className="text-xs text-[#F5F2EB]/65">
                  Tailored discovery call included
                </span>
                <button
                  type="button"
                  onClick={() =>
                    onSelectServiceForConsult('technical-support', activeSolution.id)
                  }
                  className="inline-flex items-center gap-1.5 rounded-lg bg-[#C8A253] px-4 py-2 text-xs font-semibold text-[#071B20] whitespace-nowrap transition-colors hover:bg-[#E5CE93]"
                >
                  <span>Request {activeSolution.label} Scope</span>
                  <ArrowUpRight className="h-3.5 w-3.5" aria-hidden="true" />
                </button>
              </div>
            </div>

            {/* Interactive Operations & Analytics Preview */}
            <div className="flex flex-col justify-between rounded-2xl border border-[#E5CE93]/15 bg-[#0D2B32]/85 p-7 lg:col-span-6">
              <div>
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <p className="text-xs text-[#E5CE93]">Analytics & SLA Model</p>
                    <h3 className="mt-1 font-display text-lg font-semibold text-[#F5F2EB]">
                      {chartData.label}
                    </h3>
                  </div>
                  <div className="flex items-center gap-5 text-right">
                    <div>
                      <p className="font-mono text-lg font-semibold tabular-nums text-[#E5CE93]">
                        {chartData.slaTarget}
                      </p>
                      <p className="text-[11px] text-[#F5F2EB]/60">Target SLA</p>
                    </div>
                    <div>
                      <p className="font-mono text-lg font-semibold tabular-nums text-[#F5F2EB]">
                        {chartData.cycleReduction}
                      </p>
                      <p className="text-[11px] text-[#F5F2EB]/60">Cycle Latency</p>
                    </div>
                  </div>
                </div>

                {/* Clean Tabular Bar Visualization */}
                <div className="mt-6 space-y-4 border-t border-[#E5CE93]/10 pt-5">
                  {chartData.points.map((pt) => (
                    <div key={pt.quarter} className="space-y-1.5">
                      <div className="flex items-center justify-between text-xs">
                        <span className="font-mono tabular-nums text-[#F5F2EB]/75">
                          {pt.quarter}
                        </span>
                        <span className="font-mono tabular-nums text-[#E5CE93]">
                          Baseline {pt.baseline}% · Structured {pt.optimized}%
                        </span>
                      </div>
                      <div className="relative h-2.5 w-full overflow-hidden rounded-full bg-[#071B20]">
                        <div
                          className="absolute inset-y-0 left-0 rounded-full bg-[#144B54]"
                          style={{ width: `${pt.baseline}%` }}
                        />
                        <div
                          className="absolute inset-y-0 left-0 rounded-full bg-gradient-to-r from-[#8C5A3C] to-[#C8A253] transition-all duration-300"
                          style={{ width: `${pt.optimized}%`, opacity: 0.9 }}
                        />
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Quick AI Scope Builder */}
              <div className="mt-7 border-t border-[#E5CE93]/15 pt-5">
                <form onSubmit={handleGenerateScope} className="space-y-3">
                  <div className="flex items-center justify-between gap-2">
                    <label
                      htmlFor="ai-scope-input"
                      className="flex items-center gap-2 text-xs font-semibold text-[#E5CE93]"
                    >
                      <Sparkles className="h-3.5 w-3.5" aria-hidden="true" />
                      <span>Gemini Consultation Scope Generator</span>
                    </label>
                    <span className="text-[11px] text-[#F5F2EB]/55">
                      Server-side Gemini reasoning
                    </span>
                  </div>
                  <div className="flex flex-col gap-2 sm:flex-row">
                    <input
                      id="ai-scope-input"
                      type="text"
                      value={goalInput}
                      onChange={(e) => setGoalInput(e.target.value)}
                      placeholder="e.g. We have 4 support agents and messy weekly Excel SLA reports..."
                      className="min-h-[42px] flex-1 rounded-lg border border-[#E5CE93]/20 bg-[#071B20] px-3.5 py-2 text-sm text-[#F5F2EB] placeholder:text-[#F5F2EB]/40 focus:border-[#C8A253] focus:outline-none"
                    />
                    <button
                      type="submit"
                      disabled={scopeLoading}
                      className="inline-flex min-h-[42px] items-center justify-center rounded-lg bg-[#144B54] px-4 py-2 text-xs font-semibold text-[#F5F2EB] whitespace-nowrap transition-colors hover:bg-[#195E69] disabled:opacity-60"
                    >
                      {scopeLoading ? 'Scoping...' : 'Generate Scope'}
                    </button>
                  </div>
                </form>

                {scopeError && (
                  <p role="alert" className="mt-2.5 text-xs text-amber-300">
                    {scopeError}
                  </p>
                )}

                {scopeResult && (
                  <div className="mt-4 rounded-xl border border-[#C8A253]/30 bg-[#071B20]/90 p-4 text-xs">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <span className="font-semibold text-[#E5CE93]">
                        Recommended: {scopeResult.recommendedService.replace('-', ' ')} ·{' '}
                        {scopeResult.recommendedTimeline}
                      </span>
                      <button
                        type="button"
                        onClick={() => onApplyAiScope(scopeResult)}
                        className="font-semibold text-[#C8A253] underline underline-offset-4 hover:text-[#F5F2EB]"
                      >
                        Apply to Consultation Form
                      </button>
                    </div>
                    <p className="mt-2 leading-relaxed text-[#F5F2EB]/85">
                      {scopeResult.executiveSummary}
                    </p>
                    <ul className="mt-2 space-y-1 text-[#F5F2EB]/70">
                      {scopeResult.actionPlan.map((step) => (
                        <li key={step}>· {step}</li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      </section>
    </>
  );
};
