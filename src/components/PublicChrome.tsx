/**
 * Navigation and footer for the public pages.
 *
 * A plain bar: wordmark, a few links, one action. No pill, no blur, no
 * floating chrome. The footer is a designed close rather than a sitemap —
 * the name returns at full width, which is what the direction calls for.
 */

import type { ReactNode } from 'react';
import { Link } from '@/context/RouterContext';
import { LogoBadge, LogoMark } from '@/components/Logo';

export function Wordmark({ className }: { className?: string }) {
  return (
    <Link to="/" className={className ?? 'flex items-center gap-2.5'} aria-label="PreventAI home">
      <LogoMark size={38} className="flex-shrink-0" />
      {/* The glyph alone on a phone: the wordmark collides with the nav. */}
      <span className="hidden font-display text-2xl uppercase leading-none text-ink xs:inline">
        PreventAI
      </span>
    </Link>
  );
}

export function PublicNav() {
  return (
    <header className="page-gutter sticky top-0 z-30 flex h-16 items-center justify-between border-b border-hairline bg-bg">
      <Wordmark />
      <nav className="flex items-center gap-4 sm:gap-6">
        <Link
          to="/how-it-works"
          className="hidden text-small text-ink-dim transition-colors hover:text-ink sm:block"
        >
          How it works
        </Link>
        <Link
          to="/about"
          className="hidden text-small text-ink-dim transition-colors hover:text-ink sm:block"
        >
          About
        </Link>
        <Link
          to="/login"
          className="whitespace-nowrap text-small text-ink-dim transition-colors hover:text-ink"
        >
          Sign in
        </Link>
        <Link
          to="/register"
          className="whitespace-nowrap rounded bg-accent px-4 py-2 text-small font-semibold text-accent-ink transition-colors hover:bg-accent-bright"
        >
          Create account
        </Link>
      </nav>
    </header>
  );
}

export function PublicFooter() {
  return (
    <footer className="page-gutter border-t border-hairline pb-10 pt-16">
      <div className="mx-auto max-w-7xl">
        <div className="flex flex-wrap gap-x-12 gap-y-8">
          <div className="min-w-[12rem]">
            <h2 className="font-display text-xl uppercase text-ink-dim">Product</h2>
            <div className="mt-3 space-y-2">
              <Link to="/how-it-works" className="block text-small text-ink-dim hover:text-ink">
                How it works
              </Link>
              <Link to="/about" className="block text-small text-ink-dim hover:text-ink">
                About
              </Link>
              <Link to="/contact" className="block text-small text-ink-dim hover:text-ink">
                Contact
              </Link>
            </div>
          </div>
          <div className="min-w-[12rem]">
            <h2 className="font-display text-xl uppercase text-ink-dim">Legal</h2>
            <div className="mt-3 space-y-2">
              <Link to="/privacy" className="block text-small text-ink-dim hover:text-ink">
                Privacy
              </Link>
              <Link to="/terms" className="block text-small text-ink-dim hover:text-ink">
                Terms
              </Link>
            </div>
          </div>
          <div className="min-w-[12rem]">
            <h2 className="font-display text-xl uppercase text-ink-dim">Account</h2>
            <div className="mt-3 space-y-2">
              <Link to="/login" className="block text-small text-ink-dim hover:text-ink">
                Sign in
              </Link>
              <Link to="/register" className="block text-small text-ink-dim hover:text-ink">
                Create account
              </Link>
            </div>
          </div>
        </div>

        {/* The name returns at full width as the close, with the seal beside it. */}
        <div className="mt-16 flex flex-wrap items-center gap-8">
          <LogoBadge size={104} className="flex-shrink-0 opacity-70" />
          <div
            className="font-display uppercase leading-[0.8] text-accent/15"
            style={{ fontSize: 'clamp(3rem, 13vw, 12rem)' }}
            aria-hidden="true"
          >
            PreventAI
          </div>
        </div>

        <p className="mt-6 max-w-2xl text-small text-ink-faint">
          PreventAI supports preventive care decisions. It does not diagnose, and no plan it produces
          replaces advice from your own clinician.
        </p>
      </div>
    </footer>
  );
}

export function PublicPage({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-screen bg-bg">
      <PublicNav />
      {children}
      <PublicFooter />
    </div>
  );
}
