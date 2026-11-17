import React, { useEffect, useState } from 'react';
import { ChevronDown, X } from 'lucide-react';
import type { FaqItem, InsightArticle, ProjectCase } from '../types';

interface ProjectsAndInsightsProps {
  projects: ProjectCase[];
  insights: InsightArticle[];
  faqs: FaqItem[];
}

export const ProjectsAndInsights: React.FC<ProjectsAndInsightsProps> = ({
  projects,
  insights,
  faqs,
}) => {
  const [domainFilter, setDomainFilter] = useState<string>('All');
  const [activeProject, setActiveProject] = useState<ProjectCase | null>(null);
  const [activeArticle, setActiveArticle] = useState<InsightArticle | null>(null);
  const [openFaqId, setOpenFaqId] = useState<string | null>(faqs[0]?.id || null);

  const domains = ['All', ...Array.from(new Set(projects.map((p) => p.domain)))];
  const filteredProjects =
    domainFilter === 'All'
      ? projects
      : projects.filter((p) => p.domain === domainFilter);

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setActiveProject(null);
        setActiveArticle(null);
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, []);

  return (
    <>
      {/* Projects & Blueprints */}
      <section id="projects" className="relative z-10 border-b border-[#E5CE93]/15 py-16 sm:py-20">
        <div className="mx-auto max-w-[1280px] px-5 sm:px-8">
          <div className="flex flex-col justify-between gap-6 md:flex-row md:items-end">
            <div className="max-w-2xl">
              <p className="text-xs font-medium tracking-[0.14em] uppercase text-[#E5CE93]">
                Projects & Architecture
              </p>
              <h2
                className="mt-2 font-display text-3xl font-semibold tracking-tight text-[#F5F2EB] sm:text-4xl"
                style={{ textWrap: 'balance' }}
              >
                Representative systems and operational blueprints.
              </h2>
            </div>

            <div className="inline-flex flex-wrap gap-1 rounded-xl border border-[#E5CE93]/15 bg-[#0D2B32] p-1">
              {domains.map((dom) => {
                const isActive = dom === domainFilter;
                return (
                  <button
                    key={dom}
                    type="button"
                    onClick={() => setDomainFilter(dom)}
                    className={`rounded-lg px-3 py-1.5 text-xs font-medium whitespace-nowrap transition-colors ${
                      isActive
                        ? 'bg-[#C8A253] text-[#071B20]'
                        : 'text-[#F5F2EB]/75 hover:text-[#F5F2EB]'
                    }`}
                  >
                    {dom}
                  </button>
                );
              })}
            </div>
          </div>

          <div className="mt-10 grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-3">
            {filteredProjects.map((project) => (
              <article
                key={project.id}
                className="group flex flex-col overflow-hidden rounded-2xl border border-[#E5CE93]/15 bg-[#0D2B32]/85 transition-colors hover:border-[#C8A253]/45"
              >
                <div className="relative aspect-[4/3] w-full overflow-hidden bg-[#071B20]">
                  <img
                    src={project.imageUrl}
                    alt={project.title}
                    referrerPolicy="no-referrer"
                    className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-[1.03]"
                  />
                  <div
                    aria-hidden="true"
                    className="pointer-events-none absolute inset-0 bg-gradient-to-t from-[#071B20]/80 via-transparent to-transparent"
                  />
                  <div className="absolute bottom-3 left-4 right-4 flex items-baseline justify-between gap-2">
                    <span className="font-mono text-2xl font-semibold tabular-nums text-[#E5CE93]">
                      {project.metricValue}
                    </span>
                    <span className="text-xs text-[#F5F2EB]/85 text-right">
                      {project.metricLabel}
                    </span>
                  </div>
                </div>

                <div className="flex flex-1 flex-col justify-between p-6">
                  <div>
                    <p className="text-xs text-[#E5CE93]">
                      {project.domain} · {project.timeframe} · {project.tier}
                    </p>
                    <h3 className="mt-2 font-display text-lg font-semibold text-[#F5F2EB]">
                      {project.title}
                    </h3>
                    <p className="mt-2 text-sm leading-relaxed text-[#F5F2EB]/75">
                      {project.summary}
                    </p>
                  </div>

                  <div className="mt-5 border-t border-[#E5CE93]/10 pt-4">
                    <button
                      type="button"
                      onClick={() => setActiveProject(project)}
                      className="text-xs font-semibold text-[#E5CE93] hover:text-[#F5F2EB] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#C8A253] rounded"
                    >
                      Inspect Blueprint Details
                    </button>
                  </div>
                </div>
              </article>
            ))}
          </div>
        </div>
      </section>

      {/* Insights & Knowledge Center */}
      <section id="insights" className="relative z-10 border-b border-[#E5CE93]/15 py-16 sm:py-20">
        <div className="mx-auto max-w-[1280px] px-5 sm:px-8">
          <div className="grid grid-cols-1 gap-12 lg:grid-cols-12">
            {/* Editorial Insights */}
            <div className="lg:col-span-7">
              <p className="text-xs font-medium tracking-[0.14em] uppercase text-[#E5CE93]">
                Insights & Briefings
              </p>
              <h2 className="mt-2 font-display text-3xl font-semibold tracking-tight text-[#F5F2EB]">
                Field notes on operations, analytics, and systems.
              </h2>

              <div className="mt-8 divide-y divide-[#E5CE93]/15 border-y border-[#E5CE93]/15">
                {insights.map((article) => (
                  <article key={article.id} className="py-6">
                    <p className="text-xs text-[#E5CE93]">
                      {article.category} · {article.publishedAt} · {article.readTime}
                    </p>
                    <h3 className="mt-2 font-display text-xl font-semibold text-[#F5F2EB]">
                      {article.title}
                    </h3>
                    <p className="mt-2 text-sm leading-relaxed text-[#F5F2EB]/75">
                      {article.excerpt}
                    </p>
                    <button
                      type="button"
                      onClick={() => setActiveArticle(article)}
                      className="mt-3 text-xs font-semibold text-[#C8A253] hover:text-[#E5CE93] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#C8A253] rounded"
                    >
                      Read Full Briefing
                    </button>
                  </article>
                ))}
              </div>
            </div>

            {/* Knowledge Center / FAQs */}
            <div className="lg:col-span-5">
              <p className="text-xs font-medium tracking-[0.14em] uppercase text-[#E5CE93]">
                Knowledge Center
              </p>
              <h2 className="mt-2 font-display text-3xl font-semibold tracking-tight text-[#F5F2EB]">
                Frequently asked questions.
              </h2>

              <div className="mt-8 space-y-3">
                {faqs.map((faq) => {
                  const isOpen = openFaqId === faq.id;
                  return (
                    <div
                      key={faq.id}
                      className="rounded-xl border border-[#E5CE93]/15 bg-[#0D2B32]/85"
                    >
                      <button
                        type="button"
                        aria-expanded={isOpen}
                        onClick={() => setOpenFaqId(isOpen ? null : faq.id)}
                        className="flex w-full items-center justify-between gap-4 px-5 py-4 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#C8A253] rounded-xl"
                      >
                        <span className="text-sm font-medium text-[#F5F2EB]">
                          {faq.question}
                        </span>
                        <ChevronDown
                          className={`h-4 w-4 shrink-0 text-[#C8A253] transition-transform duration-150 ${
                            isOpen ? 'rotate-180' : ''
                          }`}
                          aria-hidden="true"
                        />
                      </button>
                      {isOpen && (
                        <div className="border-t border-[#E5CE93]/10 px-5 py-4 text-sm leading-relaxed text-[#F5F2EB]/75">
                          {faq.answer}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Project Lightbox Modal */}
      {activeProject && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="project-modal-title"
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 p-4 backdrop-blur-sm"
          onClick={() => setActiveProject(null)}
        >
          <div
            className="relative max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-2xl border border-[#E5CE93]/25 bg-[#0D2B32] p-6 sm:p-8 shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <button
              type="button"
              onClick={() => setActiveProject(null)}
              aria-label="Close project details"
              className="absolute right-4 top-4 rounded-lg border border-[#E5CE93]/20 p-2 text-[#F5F2EB] hover:bg-[#144B54]"
            >
              <X className="h-4 w-4" />
            </button>

            <p className="text-xs text-[#E5CE93]">
              {activeProject.domain} · {activeProject.timeframe} · {activeProject.tier}
            </p>
            <h3
              id="project-modal-title"
              className="mt-2 pr-8 font-display text-2xl font-semibold text-[#F5F2EB]"
            >
              {activeProject.title}
            </h3>

            <div className="mt-5 overflow-hidden rounded-xl border border-[#E5CE93]/15">
              <img
                src={activeProject.imageUrl}
                alt={activeProject.title}
                referrerPolicy="no-referrer"
                className="aspect-video w-full object-cover"
              />
            </div>

            <div className="mt-5 flex items-baseline gap-3 border-b border-[#E5CE93]/15 pb-4">
              <span className="font-mono text-2xl font-semibold tabular-nums text-[#C8A253]">
                {activeProject.metricValue}
              </span>
              <span className="text-sm text-[#F5F2EB]/80">{activeProject.metricLabel}</span>
            </div>

            <p className="mt-4 text-sm leading-relaxed text-[#F5F2EB]/80">
              {activeProject.summary}
            </p>

            <div className="mt-5">
              <p className="text-xs font-semibold text-[#E5CE93]">Architecture Components</p>
              <ul className="mt-2 space-y-1.5 text-sm text-[#F5F2EB]/75">
                {activeProject.architecture.map((item) => (
                  <li key={item}>· {item}</li>
                ))}
              </ul>
            </div>
          </div>
        </div>
      )}

      {/* Article Reader Modal */}
      {activeArticle && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="article-modal-title"
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 p-4 backdrop-blur-sm"
          onClick={() => setActiveArticle(null)}
        >
          <div
            className="relative max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-2xl border border-[#E5CE93]/25 bg-[#0D2B32] p-6 sm:p-8 shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <button
              type="button"
              onClick={() => setActiveArticle(null)}
              aria-label="Close article"
              className="absolute right-4 top-4 rounded-lg border border-[#E5CE93]/20 p-2 text-[#F5F2EB] hover:bg-[#144B54]"
            >
              <X className="h-4 w-4" />
            </button>

            <p className="text-xs text-[#E5CE93]">
              {activeArticle.category} · {activeArticle.publishedAt} · {activeArticle.readTime}
            </p>
            <h3
              id="article-modal-title"
              className="mt-2 pr-8 font-display text-2xl font-semibold text-[#F5F2EB]"
            >
              {activeArticle.title}
            </h3>

            <div className="mt-6 space-y-4 text-sm leading-relaxed text-[#F5F2EB]/85 sm:text-base">
              {activeArticle.paragraphs.map((p, idx) => (
                <p key={idx}>{p}</p>
              ))}
            </div>
          </div>
        </div>
      )}
    </>
  );
};
