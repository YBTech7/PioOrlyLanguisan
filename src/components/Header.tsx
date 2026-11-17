import React, { useEffect, useState } from 'react';
import { Menu, X } from 'lucide-react';
import { BrandMark } from './BrandMark';

interface HeaderProps {
  customLogoUrl?: string | null;
  onBookConsultation: () => void;
}

const NAV_ITEMS = [
  { label: 'About', href: '#about' },
  { label: 'Services', href: '#services' },
  { label: 'Solutions', href: '#solutions' },
  { label: 'Projects', href: '#projects' },
  { label: 'Insights', href: '#insights' },
];

export const Header: React.FC<HeaderProps> = ({
  customLogoUrl,
  onBookConsultation,
}) => {
  const [mobileOpen, setMobileOpen] = useState(false);

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && mobileOpen) setMobileOpen(false);
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [mobileOpen]);

  const handleNavClick = (href: string) => {
    setMobileOpen(false);
    const target = document.querySelector(href);
    if (target) {
      target.scrollIntoView({ behavior: 'smooth' });
    }
  };

  return (
    <header className="sticky top-0 z-40 border-b border-[#E5CE93]/15 bg-[#071B20]/90 backdrop-blur-md">
      <div className="mx-auto flex h-16 max-w-[1280px] items-center justify-between gap-8 px-5 sm:px-8">
        <a
          href="#top"
          className="flex items-center gap-3 whitespace-nowrap shrink-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#C8A253] rounded-md"
        >
          <BrandMark customLogoUrl={customLogoUrl} size={32} />
          <span className="font-display text-lg font-semibold tracking-tight text-[#F5F2EB] whitespace-nowrap shrink-0">
            Pio Languisan
          </span>
        </a>

        <nav
          aria-label="Primary Navigation"
          className="hidden md:flex items-center gap-7 text-sm font-medium text-[#F5F2EB]/75"
        >
          {NAV_ITEMS.map((item) => (
            <a
              key={item.href}
              href={item.href}
              className="relative py-1 whitespace-nowrap shrink-0 transition-colors duration-150 hover:text-[#E5CE93] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#C8A253] rounded"
            >
              {item.label}
            </a>
          ))}
        </nav>

        <div className="flex items-center gap-3 shrink-0">
          <button
            type="button"
            onClick={onBookConsultation}
            className="hidden sm:inline-flex items-center justify-center rounded-lg bg-[#C8A253] px-4 py-2 text-xs font-semibold text-[#071B20] whitespace-nowrap shrink-0 transition-colors duration-150 hover:bg-[#E5CE93] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#F5F2EB]"
          >
            Book Consultation
          </button>

          <button
            type="button"
            aria-label={mobileOpen ? 'Close navigation menu' : 'Open navigation menu'}
            aria-expanded={mobileOpen}
            aria-controls="mobile-navigation-drawer"
            onClick={() => setMobileOpen((prev) => !prev)}
            className="inline-flex md:hidden items-center justify-center rounded-lg border border-[#E5CE93]/20 p-2 text-[#F5F2EB] min-h-[40px] min-w-[40px] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#C8A253]"
          >
            {mobileOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
          </button>
        </div>
      </div>

      {mobileOpen && (
        <div
          id="mobile-navigation-drawer"
          className="border-t border-[#E5CE93]/15 bg-[#0A242B] px-5 py-4 md:hidden"
        >
          <nav className="flex flex-col gap-3" aria-label="Mobile Navigation">
            {NAV_ITEMS.map((item) => (
              <button
                key={item.href}
                type="button"
                onClick={() => handleNavClick(item.href)}
                className="flex min-h-[44px] items-center text-left text-sm font-medium text-[#F5F2EB]/90 hover:text-[#E5CE93] whitespace-nowrap"
              >
                {item.label}
              </button>
            ))}
            <button
              type="button"
              onClick={() => {
                setMobileOpen(false);
                onBookConsultation();
              }}
              className="mt-1 flex min-h-[44px] items-center justify-center rounded-lg bg-[#C8A253] px-4 py-2 text-sm font-semibold text-[#071B20] whitespace-nowrap"
            >
              Book Consultation
            </button>
          </nav>
        </div>
      )}
    </header>
  );
};
