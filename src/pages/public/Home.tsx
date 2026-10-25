/**
 * Landing page.
 *
 * Two-column hero: the claim on the left, a real reading of the product on
 * the right. No abstract graphic — showing the thing itself is both more
 * honest and more useful than a diagram of it.
 *
 * Copy is kept short on purpose. Every section says one thing and stops.
 */

import { ArrowRight, Check } from 'lucide-react';
import { Link } from '@/context/RouterContext';
import { PublicNav, PublicFooter } from '@/components/PublicChrome';
import { HeroCard } from '@/components/HeroCard';
import { LiveRiskDemo } from '@/components/LiveRiskDemo';

const STAGES = [
  {
    clause: 'First it scores you.',
    note: 'Cardiovascular, diabetes, cancer and stroke, from clinical rules you can read.',
    color: 'var(--agent-risk)',
  },
  {
    clause: 'Then it writes a plan.',
    note: 'Actions chosen against the factors that actually drove your score.',
    color: 'var(--agent-plan)',
  },
  {
    clause: 'Then it fits your life.',
    note: 'Vegetarian, shift work, a knee that will not take running.',
    color: 'var(--agent-personalize)',
  },
  {
    clause: 'Then it can refuse.',
    note: 'Anything unsafe for your medications or conditions is removed and reported.',
    color: 'var(--agent-safety)',
  },
];

const GUARANTEES = [
  ['Rules, not a black box', 'Every threshold is a reviewable row with the reason it exists.'],
  ['The same input gives the same plan', 'Scoring is deterministic.'],
  ['The AI cannot clear a safety flag', 'It may rewrite an explanation. Nothing else.'],
  ['A rejected action is reported', 'A plan stripped to nothing is a failure, not a pass.'],
];

const FAQS = [
  {
    q: 'Is this medical advice?',
    a: 'No. It produces a plan for a clinician to review. It does not diagnose, and it does not replace your doctor.',
  },
  {
    q: 'What happens when something is rejected?',
    a: 'The action is removed, listed by name with the rule that caught it, and the plan is held as a draft for clinician review.',
  },
  {
    q: 'Who can see my data?',
    a: 'You and your assigned clinician. Sign-in is Amazon Cognito and records are stored per owner.',
  },
];

export function PublicHome() {
  return (
    <div className="min-h-screen bg-bg">
      <PublicNav />

      {/* ── Hero ───────────────────────────────────────────────────────── */}
      <section className="page-gutter pb-24 pt-12 sm:pt-20">
        <div className="mx-auto grid max-w-6xl items-center gap-16 lg:grid-cols-[1.05fr_1fr] lg:gap-20">
          <div className="rise">
            <span className="inline-flex items-center gap-2 rounded-full border border-hairline bg-surface px-3.5 py-1.5 text-small text-ink-dim">
              <span className="h-1.5 w-1.5 rounded-full bg-accent" />
              Four agents, one prevention plan
            </span>

            {/* No forced break: the measure decides where it wraps, which
                keeps it to two lines at every width. */}
            <h1 className="mt-6 text-sub leading-[0.95]">
              Catch risk <span className="text-accent">before it catches you.</span>
            </h1>

            <p className="mt-6 max-w-lg text-lead text-ink-dim">
              PreventAI scores your risk, builds a plan around what is actually driving it, fits
              that plan to your life, and throws out anything unsafe.
            </p>

            <div className="mt-9 flex flex-wrap gap-3">
              <Link
                to="/register"
                className="inline-flex items-center gap-2 rounded-full bg-accent px-6 py-3 font-semibold text-accent-ink transition-colors hover:bg-accent-bright"
              >
                Start your assessment
                <ArrowRight size={16} />
              </Link>
              <Link
                to="/how-it-works"
                className="inline-flex items-center gap-2 rounded-full border border-hairline bg-surface px-6 py-3 font-semibold text-ink transition-colors hover:border-accent hover:text-accent"
              >
                How it works
              </Link>
            </div>

            <ul className="mt-9 flex flex-wrap gap-x-7 gap-y-3 text-small text-ink-dim">
              {['Clinician reviewed', 'Safety screened', 'Explainable'].map((item) => (
                <li key={item} className="flex items-center gap-2">
                  <Check size={15} className="text-accent" />
                  {item}
                </li>
              ))}
            </ul>
          </div>

          <div className="rise lg:pl-6" style={{ animationDelay: '120ms' }}>
            <HeroCard />
          </div>
        </div>
      </section>

      {/* ── Live demo ──────────────────────────────────────────────────── */}
      <section className="page-gutter border-t border-hairline py-[var(--section-gap)]">
        <div className="mx-auto max-w-6xl">
          <div className="grid gap-6 lg:grid-cols-[1fr_1fr] lg:gap-16">
            <h2 className="text-sub">Move a value. Watch it score.</h2>
            <p className="self-end text-ink-dim">
              This is the Risk agent itself, not a mock-up. The factors listed are the ones it
              fired.
            </p>
          </div>
          <div className="mt-14">
            <LiveRiskDemo />
          </div>
        </div>
      </section>

      {/* ── The four stages ────────────────────────────────────────────── */}
      <section className="page-gutter border-t border-hairline py-[var(--section-gap)]">
        <div className="mx-auto max-w-6xl">
          <ol className="space-y-12">
            {STAGES.map((stage, i) => (
              <li
                key={stage.clause}
                className="lg:ml-[var(--indent)]"
                style={{ '--indent': `${i * 6}vw` } as React.CSSProperties}
              >
                <h2
                  className="font-display uppercase leading-[0.95]"
                  style={{
                    fontSize: 'clamp(2rem, 5.5vw, 4.25rem)',
                    color: i === 3 ? stage.color : 'var(--ink)',
                  }}
                >
                  {stage.clause}
                </h2>
                <p className="mt-3 max-w-[36ch] text-ink-dim">{stage.note}</p>
              </li>
            ))}
          </ol>
        </div>
      </section>

      {/* ── The gate ───────────────────────────────────────────────────── */}
      <section className="border-t border-hairline bg-surface py-[var(--section-gap)]">
        <div className="page-gutter mx-auto max-w-6xl">
          <div className="grid gap-12 lg:grid-cols-[1.1fr_1fr] lg:gap-20">
            <div>
              <h2 className="text-sub">Most of the work is saying no.</h2>
              <p className="mt-6 text-ink-dim">
                A plan generator that only adds is easy. The hard part is the screen that runs
                after it: insulin against a fasting protocol, weight loss in pregnancy, an allergy
                named in an action.
              </p>
              <p className="mt-4 text-ink-dim">
                Those checks match whole words, so a{' '}
                <span className="text-ink">fasting lipid panel</span> is never mistaken for a
                fasting protocol and taken from the patient who needs it.
              </p>
            </div>

            <div className="rounded border border-hairline bg-bg p-6" data-ui>
              <p className="text-small font-semibold text-ink-faint">Safety screen · 1 rejected</p>
              <ul className="mt-4 space-y-3">
                <li className="text-small">
                  <span className="text-ink-dim line-through opacity-60">
                    Target a 5–7% body weight reduction
                  </span>
                  <span className="ml-2 text-risk-very-high">removed</span>
                  <p className="mt-1 text-ink-faint">
                    PREG_WEIGHT_LOSS · not appropriate during pregnancy
                  </p>
                </li>
                <li className="text-small">
                  <span className="text-ink">Bring alcohol within low-risk limits</span>
                  <span className="ml-2 text-risk-moderate">adapted</span>
                  <p className="mt-1 text-ink-faint">PREG_ALCOHOL · replaced with abstinence</p>
                </li>
                <li className="text-small">
                  <span className="text-ink">Confirm glycaemic status with HbA1c</span>
                  <span className="ml-2 text-risk-low">kept</span>
                </li>
              </ul>
              <p className="mt-5 border-t border-hairline pt-4 text-small text-ink-dim">
                Held as a draft for clinician review.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* ── Guarantees ─────────────────────────────────────────────────── */}
      <section className="page-gutter border-t border-hairline py-[var(--section-gap)]">
        <div className="mx-auto max-w-6xl">
          <h2 className="text-sub">What the system guarantees</h2>
          <dl className="mt-12">
            {GUARANTEES.map(([claim, detail]) => (
              <div
                key={claim}
                className="grid gap-2 border-t border-hairline py-6 lg:grid-cols-[1fr_1.2fr] lg:gap-12"
              >
                <dt className="font-display text-2xl uppercase leading-tight text-ink">{claim}</dt>
                <dd className="text-ink-dim">{detail}</dd>
              </div>
            ))}
          </dl>
        </div>
      </section>

      {/* ── FAQ ────────────────────────────────────────────────────────── */}
      <section className="border-t border-hairline">
        <h2 className="sr-only">Questions</h2>
        {FAQS.map((faq, i) => (
          <div key={faq.q} className={i % 2 === 0 ? 'bg-surface' : 'bg-bg'}>
            <div className="page-gutter mx-auto grid max-w-6xl gap-4 py-12 lg:grid-cols-[1fr_1.3fr] lg:gap-16">
              <h3 className="font-display text-2xl uppercase leading-tight text-ink">{faq.q}</h3>
              <p className="text-ink-dim">{faq.a}</p>
            </div>
          </div>
        ))}
      </section>

      {/* ── Close ──────────────────────────────────────────────────────── */}
      <section className="page-gutter border-t border-hairline py-[var(--section-gap)]">
        <div className="mx-auto max-w-3xl text-center">
          <h2 className="text-sub">See your own four stages.</h2>
          <p className="mx-auto mt-5 max-w-lg text-ink-dim">
            Enter what you know and watch the pipeline run against your record. Your plan reaches a
            clinician before it reaches anyone else.
          </p>
          <div className="mt-9 flex flex-wrap justify-center gap-3">
            <Link
              to="/register"
              className="inline-flex items-center gap-2 rounded-full bg-accent px-6 py-3 font-semibold text-accent-ink transition-colors hover:bg-accent-bright"
            >
              Create account
              <ArrowRight size={16} />
            </Link>
            <Link
              to="/login"
              className="inline-flex items-center gap-2 rounded-full border border-hairline bg-surface px-6 py-3 font-semibold text-ink transition-colors hover:border-accent hover:text-accent"
            >
              Sign in
            </Link>
          </div>
        </div>
      </section>

      <PublicFooter />
    </div>
  );
}
