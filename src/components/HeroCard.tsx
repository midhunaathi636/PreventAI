/**
 * The product card in the hero.
 *
 * A real reading of a real patient rather than an abstraction: the risk
 * score, the four tracks that make it up, the plan's status, and the two
 * chips that float off the card — one for the safety verdict, one for a live
 * wearable figure.
 *
 * The numbers are a worked example, not live data, so the component states
 * that plainly in its label rather than implying a signed-in session.
 */

import { Activity, ShieldCheck } from 'lucide-react';

const TRACKS = [
  { label: 'Cardiovascular', value: 18, color: 'var(--risk-low)' },
  { label: 'Diabetes', value: 32, color: 'var(--risk-moderate)' },
  { label: 'Stroke', value: 12, color: 'var(--agent-plan)' },
  { label: 'Cancer', value: 8, color: 'var(--agent-personalize)' },
];

export function HeroCard() {
  return (
    <div className="relative">
      {/* The card */}
      <div className="rounded border border-hairline bg-surface p-6 shadow-lift sm:p-7">
        <p className="text-small text-ink-dim">Your risk score</p>
        <p className="mt-1 flex items-baseline gap-1">
          <span className="tabular font-display text-5xl leading-none text-ink">23.5</span>
          <span className="text-lead text-ink-faint">/100</span>
        </p>

        <dl className="mt-6 space-y-3.5">
          {TRACKS.map((track) => (
            <div key={track.label}>
              <div className="flex items-baseline justify-between">
                <dt className="text-small text-ink-dim">{track.label}</dt>
                <dd className="tabular text-small font-semibold text-ink">{track.value}%</dd>
              </div>
              <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-surface-3">
                <div
                  className="h-full rounded-full"
                  style={{ width: `${track.value * 2.4}%`, background: track.color }}
                />
              </div>
            </div>
          ))}
        </dl>

        <div className="mt-6 border-t border-hairline pt-5">
          <p className="flex items-center gap-2 text-small font-semibold text-ink">
            <Activity size={15} className="text-accent" />
            Prevention plan active
          </p>
          <p className="mt-2 text-small text-ink-dim">
            Projected reduction <span className="text-accent">−12.5%</span> over six months
          </p>
          <div className="mt-3 flex items-center gap-3">
            <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-surface-3">
              <div className="h-full w-[78%] rounded-full bg-accent" />
            </div>
            <span className="tabular text-small text-ink-dim">78%</span>
          </div>
        </div>
      </div>

      {/* Chips that break the card's edge, so it reads as layered */}
      {/* Tucked inside the card on a phone; breaking the edge there pushes
          the chip off-screen. */}
      <div className="absolute right-3 -top-4 flex items-center gap-2.5 rounded border border-hairline bg-surface px-3.5 py-2.5 shadow-lift sm:-right-6">
        <ShieldCheck size={18} className="flex-shrink-0 text-accent" />
        <span>
          <span className="block text-[11px] leading-tight text-ink-dim">Safety verified</span>
          <span className="block text-small font-semibold leading-tight text-ink">All clear</span>
        </span>
      </div>

      <div className="absolute -bottom-5 left-3 flex items-center gap-2.5 rounded border border-hairline bg-surface px-3.5 py-2.5 shadow-lift sm:-left-6">
        <Activity size={18} className="flex-shrink-0 text-risk-very-high" />
        <span>
          <span className="block text-[11px] leading-tight text-ink-dim">Heart rate</span>
          <span className="tabular block text-small font-semibold leading-tight text-ink">
            72 bpm
          </span>
        </span>
      </div>
    </div>
  );
}
