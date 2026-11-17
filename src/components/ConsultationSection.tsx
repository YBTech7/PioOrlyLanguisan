import React, { useEffect, useState } from 'react';
import { CheckCircle2, Send } from 'lucide-react';
import { CLIENT_TIER_SOLUTIONS, SERVICE_OFFERINGS } from '../data/profileData';
import type { ClientTierId, InquiryRecord, ServiceDomainId } from '../types';

interface ConsultationSectionProps {
  preselectedTier: ClientTierId;
  preselectedService: ServiceDomainId;
  preselectedTimeline?: string;
  preselectedSummary?: string;
}

export const ConsultationSection: React.FC<ConsultationSectionProps> = ({
  preselectedTier,
  preselectedService,
  preselectedTimeline,
  preselectedSummary,
}) => {
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [company, setCompany] = useState('');
  const [tier, setTier] = useState<ClientTierId>(preselectedTier);
  const [serviceDomain, setServiceDomain] = useState<ServiceDomainId>(preselectedService);
  const [timeline, setTimeline] = useState(preselectedTimeline || 'Within 30 days');
  const [message, setMessage] = useState(preselectedSummary || '');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [submittedRecord, setSubmittedRecord] = useState<InquiryRecord | null>(null);

  useEffect(() => {
    setTier(preselectedTier);
  }, [preselectedTier]);

  useEffect(() => {
    setServiceDomain(preselectedService);
  }, [preselectedService]);

  useEffect(() => {
    if (preselectedTimeline) setTimeline(preselectedTimeline);
  }, [preselectedTimeline]);

  useEffect(() => {
    if (preselectedSummary) setMessage(preselectedSummary);
  }, [preselectedSummary]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (name.trim().length < 2) {
      setError('Please enter your full name.');
      return;
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) {
      setError('Please enter a valid work or personal email address.');
      return;
    }
    if (message.trim().length < 10) {
      setError('Please share at least a brief overview (10+ characters) of your objectives.');
      return;
    }

    setSubmitting(true);
    try {
      const res = await fetch('/api/inquiries', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: name.trim(),
          email: email.trim(),
          company: company.trim(),
          tier,
          serviceDomain,
          timeline,
          message: message.trim(),
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Unable to submit consultation request.');
      }
      setSubmittedRecord(data.inquiry);
      setName('');
      setEmail('');
      setCompany('');
      setMessage('');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Submission failed. Please try again.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <section id="contact" className="relative z-10 py-16 sm:py-20">
      <div className="mx-auto max-w-[1280px] px-5 sm:px-8">
        <div className="grid grid-cols-1 gap-10 lg:grid-cols-12 lg:gap-12">
          <div className="lg:col-span-5 space-y-5">
            <p className="text-xs font-medium tracking-[0.14em] uppercase text-[#E5CE93]">
              Consultation & Contact
            </p>
            <h2
              className="font-display text-3xl font-semibold tracking-tight text-[#F5F2EB] sm:text-4xl"
              style={{ textWrap: 'balance' }}
            >
              Start a structured discovery conversation.
            </h2>
            <p className="text-base leading-relaxed text-[#F5F2EB]/80">
              Whether you need hands-on technical support governance, executive KPI analytics,
              account management workflows, or a custom web platform, submit your parameters below.
            </p>

            <div className="space-y-4 border-t border-[#E5CE93]/15 pt-6 text-sm text-[#F5F2EB]/75">
              <div>
                <p className="text-xs font-medium text-[#E5CE93]">Direct Inquiries</p>
                <p className="mt-1 font-mono text-sm text-[#F5F2EB]">pio.executive@gmail.com</p>
              </div>
              <div>
                <p className="text-xs font-medium text-[#E5CE93]">Response Commitment</p>
                <p className="mt-1">
                  Every consultation request receives an immediate tracking reference and a tailored
                  agenda within 1 business day.
                </p>
              </div>
            </div>
          </div>

          <div className="lg:col-span-7">
            <div className="rounded-2xl border border-[#E5CE93]/20 bg-[#0D2B32]/90 p-6 sm:p-8">
              {submittedRecord ? (
                <div className="space-y-4 py-4">
                  <div className="flex items-center gap-3 text-[#E5CE93]">
                    <CheckCircle2 className="h-6 w-6" aria-hidden="true" />
                    <h3 className="font-display text-xl font-semibold text-[#F5F2EB]">
                      Consultation Request Recorded
                    </h3>
                  </div>
                  <p className="text-sm leading-relaxed text-[#F5F2EB]/80">
                    Thank you, {submittedRecord.name}. Your inquiry has been logged for review.
                  </p>
                  <div className="rounded-xl border border-[#E5CE93]/15 bg-[#071B20] p-4 text-xs text-[#F5F2EB]/80 space-y-1.5">
                    <p>
                      Reference ID:{' '}
                      <span className="font-mono font-semibold text-[#E5CE93]">
                        {submittedRecord.id}
                      </span>
                    </p>
                    <p>Organization Tier: {submittedRecord.tier}</p>
                    <p>Primary Focus: {submittedRecord.serviceDomain}</p>
                    <p>Target Timeline: {submittedRecord.timeline}</p>
                  </div>
                  <button
                    type="button"
                    onClick={() => setSubmittedRecord(null)}
                    className="rounded-lg border border-[#E5CE93]/25 px-4 py-2 text-xs font-semibold text-[#E5CE93] hover:bg-[#144B54]"
                  >
                    Submit Another Request
                  </button>
                </div>
              ) : (
                <form onSubmit={handleSubmit} className="space-y-5" noValidate>
                  <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                    <div>
                      <label
                        htmlFor="consult-name"
                        className="block text-xs font-medium text-[#E5CE93]"
                      >
                        Full Name *
                      </label>
                      <input
                        id="consult-name"
                        type="text"
                        required
                        value={name}
                        onChange={(e) => setName(e.target.value)}
                        placeholder="Alex Rivera"
                        className="mt-1.5 min-h-[42px] w-full rounded-lg border border-[#E5CE93]/20 bg-[#071B20] px-3.5 py-2 text-sm text-[#F5F2EB] placeholder:text-[#F5F2EB]/35 focus:border-[#C8A253] focus:outline-none"
                      />
                    </div>
                    <div>
                      <label
                        htmlFor="consult-email"
                        className="block text-xs font-medium text-[#E5CE93]"
                      >
                        Email Address *
                      </label>
                      <input
                        id="consult-email"
                        type="email"
                        required
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                        placeholder="alex@company.com"
                        className="mt-1.5 min-h-[42px] w-full rounded-lg border border-[#E5CE93]/20 bg-[#071B20] px-3.5 py-2 text-sm text-[#F5F2EB] placeholder:text-[#F5F2EB]/35 focus:border-[#C8A253] focus:outline-none"
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                    <div>
                      <label
                        htmlFor="consult-company"
                        className="block text-xs font-medium text-[#E5CE93]"
                      >
                        Organization / Practice
                      </label>
                      <input
                        id="consult-company"
                        type="text"
                        value={company}
                        onChange={(e) => setCompany(e.target.value)}
                        placeholder="Optional company or team name"
                        className="mt-1.5 min-h-[42px] w-full rounded-lg border border-[#E5CE93]/20 bg-[#071B20] px-3.5 py-2 text-sm text-[#F5F2EB] placeholder:text-[#F5F2EB]/35 focus:border-[#C8A253] focus:outline-none"
                      />
                    </div>
                    <div>
                      <label
                        htmlFor="consult-tier"
                        className="block text-xs font-medium text-[#E5CE93]"
                      >
                        Organization Tier
                      </label>
                      <select
                        id="consult-tier"
                        value={tier}
                        onChange={(e) => setTier(e.target.value as ClientTierId)}
                        className="mt-1.5 min-h-[42px] w-full rounded-lg border border-[#E5CE93]/20 bg-[#071B20] px-3.5 py-2 text-sm text-[#F5F2EB] focus:border-[#C8A253] focus:outline-none"
                      >
                        {CLIENT_TIER_SOLUTIONS.map((t) => (
                          <option key={t.id} value={t.id}>
                            {t.label}
                          </option>
                        ))}
                      </select>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                    <div>
                      <label
                        htmlFor="consult-service"
                        className="block text-xs font-medium text-[#E5CE93]"
                      >
                        Primary Service Domain
                      </label>
                      <select
                        id="consult-service"
                        value={serviceDomain}
                        onChange={(e) => setServiceDomain(e.target.value as ServiceDomainId)}
                        className="mt-1.5 min-h-[42px] w-full rounded-lg border border-[#E5CE93]/20 bg-[#071B20] px-3.5 py-2 text-sm text-[#F5F2EB] focus:border-[#C8A253] focus:outline-none"
                      >
                        {SERVICE_OFFERINGS.map((s) => (
                          <option key={s.id} value={s.id}>
                            {s.index}. {s.title}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <label
                        htmlFor="consult-timeline"
                        className="block text-xs font-medium text-[#E5CE93]"
                      >
                        Target Timeline
                      </label>
                      <select
                        id="consult-timeline"
                        value={timeline}
                        onChange={(e) => setTimeline(e.target.value)}
                        className="mt-1.5 min-h-[42px] w-full rounded-lg border border-[#E5CE93]/20 bg-[#071B20] px-3.5 py-2 text-sm text-[#F5F2EB] focus:border-[#C8A253] focus:outline-none"
                      >
                        <option value="Immediate (1–2 weeks)">Immediate (1–2 weeks)</option>
                        <option value="Within 30 days">Within 30 days</option>
                        <option value="This quarter">This quarter</option>
                        <option value="Advisory / Ongoing">Advisory / Ongoing</option>
                      </select>
                    </div>
                  </div>

                  <div>
                    <label
                      htmlFor="consult-message"
                      className="block text-xs font-medium text-[#E5CE93]"
                    >
                      Project Context & Objectives *
                    </label>
                    <textarea
                      id="consult-message"
                      required
                      rows={4}
                      value={message}
                      onChange={(e) => setMessage(e.target.value)}
                      placeholder="Briefly describe your current systems, operational bottleneck, or target deliverables..."
                      className="mt-1.5 w-full rounded-lg border border-[#E5CE93]/20 bg-[#071B20] px-3.5 py-2.5 text-sm text-[#F5F2EB] placeholder:text-[#F5F2EB]/35 focus:border-[#C8A253] focus:outline-none"
                    />
                  </div>

                  {error && (
                    <p role="alert" className="text-xs font-medium text-amber-300">
                      {error}
                    </p>
                  )}

                  <div className="flex items-center justify-end">
                    <button
                      type="submit"
                      disabled={submitting}
                      className="inline-flex min-h-[44px] items-center gap-2 rounded-lg bg-[#C8A253] px-6 py-2.5 text-sm font-semibold text-[#071B20] whitespace-nowrap transition-colors hover:bg-[#E5CE93] disabled:opacity-60"
                    >
                      <Send className="h-4 w-4" aria-hidden="true" />
                      <span>{submitting ? 'Submitting...' : 'Submit Consultation Request'}</span>
                    </button>
                  </div>
                </form>
              )}
            </div>
          </div>
        </div>
      </div>
    </section>
  );
};
