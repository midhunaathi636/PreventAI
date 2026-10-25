/**
 * The agent pipeline, as an instrument.
 *
 * Two halves that describe the same run: the WebGL scene on top, and the
 * trace beneath it. The scene is the dramatic reading — you watch a payload
 * fail to pass the gate — and the trace is the auditable one, with timings,
 * statuses and the structured detail each agent emitted. Neither is
 * decoration for the other; if WebGL is unavailable the trace still carries
 * everything.
 */

import { useEffect, useState } from 'react';
import { AlertTriangle, Check, ChevronDown, CircleAlert } from 'lucide-react';
import type { AgentStepName, AgentTrace, AgentPipelineResult } from '@/lib/agent-service';
import { PipelineDiagram, type PipelineStage } from '@/components/PipelineDiagram';
import { classNames, humanize } from '@/lib/utils';

const STEPS: { name: AgentStepName; label: string; blurb: string; color: string }[] = [
  {
    name: 'risk',
    label: 'Risk',
    blurb: 'Scores cardiovascular, diabetes, cancer and stroke risk',
    color: 'var(--agent-risk)',
  },
  {
    name: 'plan_generation',
    label: 'Plan Generation',
    blurb: 'Selects preventive actions that answer those risks',
    color: 'var(--agent-plan)',
  },
  {
    name: 'personalization',
    label: 'Personalization',
    blurb: 'Adapts each action to your constraints and preferences',
    color: 'var(--agent-personalize)',
  },
  {
    name: 'safety',
    label: 'Safety',
    blurb: 'Screens for contraindications and interactions, and can reject',
    color: 'var(--agent-safety)',
  },
];

const STATUS: Record<string, { dot: string; text: string; label: string }> = {
  completed: { dot: 'bg-risk-low', text: 'text-risk-low', label: 'Completed' },
  degraded: { dot: 'bg-risk-moderate', text: 'text-risk-moderate', label: 'Completed, reduced' },
  needs_review: { dot: 'bg-risk-very-high', text: 'text-risk-very-high', label: 'Needs review' },
  failed: { dot: 'bg-risk-very-high', text: 'text-risk-very-high', label: 'Failed' },
};

export function AgentPipeline({
  running,
  result,
  error,
}: {
  running: boolean;
  result?: AgentPipelineResult | null;
  error?: string | null;
}) {
  // Real runs finish in milliseconds, far too fast to read. Stepping the
  // display through the stages shows what actually happened, in order,
  // instead of a spinner that says nothing.
  const [stage, setStage] = useState<PipelineStage>(-1);
  const [expanded, setExpanded] = useState<AgentStepName | null>(null);

  useEffect(() => {
    if (!running) return;
    setStage(0);
    setExpanded(null);
    const timer = setInterval(() => {
      setStage((s) => (s < 3 ? ((s + 1) as PipelineStage) : s));
    }, 460);
    return () => clearInterval(timer);
  }, [running]);

  useEffect(() => {
    if (result) setStage(3);
  }, [result]);

  const traceFor = (name: AgentStepName): AgentTrace | undefined =>
    result?.trace.find((t) => t.agent === name);

  if (error) {
    return (
      <div className="rounded border border-risk-very-high/40 bg-risk-very-high/5 p-5">
        <div className="flex items-start gap-3">
          <CircleAlert size={20} className="mt-0.5 flex-shrink-0 text-risk-very-high" />
          <div className="min-w-0">
            <p className="font-display text-xl uppercase text-ink">Assessment could not run</p>
            <p className="mt-1 text-small text-ink-dim">{error}</p>
          </div>
        </div>
      </div>
    );
  }

  if (!running && !result) return null;

  const blocked = result?.safety.blocked_actions.length ?? 0;
  const actions = result?.plan.actions.length ?? 6;
  const risk = result?.risk.overall_risk ?? 0;

  return (
    <section className="overflow-hidden rounded border border-hairline bg-surface">
      {/* The diagram */}
      <div className="relative border-b border-hairline">
        <PipelineDiagram
          className="h-[200px] sm:h-[240px]"
          stage={stage}
          risk={risk}
          actions={actions}
          blocked={blocked}
        />

        {/* Readout over the scene, which is where an instrument puts it. */}
        <div className="pointer-events-none absolute inset-x-0 top-0 flex items-start justify-between p-4">
          <div>
            <div className="text-small font-semibold text-ink-faint">
              {running ? 'Running' : 'Run complete'}
            </div>
            {result && (
              <div className="tabular mt-0.5 text-small text-ink-dim">
                {Math.round(result.total_duration_ms)}ms ·{' '}
                {result.llm_enabled ? 'rules + LLM' : 'rules only'}
              </div>
            )}
          </div>
          {result && (
            <div className="text-right">
              <div className="tabular font-display text-5xl leading-none text-ink">
                {Math.round(result.risk.overall_risk)}
                <span className="text-2xl text-ink-faint">%</span>
              </div>
              <div className="text-small text-ink-dim">
                {humanize(result.risk.risk_level)} risk
              </div>
            </div>
          )}
        </div>
      </div>

      {/* The trace */}
      <ol className="divide-y divide-hairline">
        {STEPS.map((step, index) => {
          const trace = traceFor(step.name);
          const status = trace ? (STATUS[trace.status] ?? STATUS.completed) : null;
          const isOpen = expanded === step.name;
          const isActive = running && stage === index;
          const isDone = Boolean(trace);

          return (
            <li key={step.name}>
              <button
                type="button"
                onClick={() => trace && setExpanded(isOpen ? null : step.name)}
                disabled={!trace}
                aria-expanded={isOpen}
                className={classNames(
                  'flex w-full items-start gap-4 p-4 text-left transition-colors duration-150',
                  trace ? 'cursor-pointer hover:bg-surface-2' : 'cursor-default'
                )}
              >
                <span
                  className="mt-1 h-7 w-1 flex-shrink-0 rounded-full transition-opacity duration-300"
                  style={{
                    background: step.color,
                    opacity: isDone ? 1 : isActive ? 0.9 : 0.2,
                  }}
                  aria-hidden="true"
                />

                <span className="min-w-0 flex-1">
                  <span className="flex flex-wrap items-center gap-x-3 gap-y-1">
                    <span className="font-display text-lg uppercase leading-none text-ink">
                      {step.label}
                    </span>
                    {status && (
                      <span className={classNames('flex items-center gap-1.5 text-small', status.text)}>
                        <span className={classNames('h-1.5 w-1.5 rounded-full', status.dot)} />
                        {status.label}
                      </span>
                    )}
                    {isActive && !trace && (
                      <span className="text-small text-ink-faint">working…</span>
                    )}
                    {trace?.llm_used && (
                      <span className="rounded border border-agent-personalize/30 px-1.5 text-small text-agent-personalize">
                        LLM
                      </span>
                    )}
                  </span>

                  <span className="mt-1 block text-small text-ink-dim">
                    {trace ? trace.message : step.blurb}
                  </span>

                  {isOpen && trace && (
                    <span className="mt-3 block rounded bg-surface-2 p-3">
                      <span className="block text-small text-ink-faint">{step.blurb}</span>
                      <dl className="mt-2 space-y-1">
                        {Object.entries(trace.details).map(([key, value]) => (
                          <div key={key} className="flex gap-2 text-small">
                            <dt className="flex-shrink-0 font-semibold text-ink-dim">
                              {humanize(key)}
                            </dt>
                            <dd className="tabular min-w-0 break-words text-ink-faint">
                              {Array.isArray(value) ? value.join(', ') || '—' : String(value)}
                            </dd>
                          </div>
                        ))}
                      </dl>
                    </span>
                  )}
                </span>

                <span className="flex flex-shrink-0 items-center gap-2 pt-1">
                  {trace && (
                    <span className="tabular text-small text-ink-faint">
                      {Math.round(trace.duration_ms)}ms
                    </span>
                  )}
                  {trace && (
                    <ChevronDown
                      size={15}
                      className={classNames(
                        'text-ink-faint transition-transform duration-200',
                        isOpen && 'rotate-180'
                      )}
                    />
                  )}
                </span>
              </button>
            </li>
          );
        })}
      </ol>

      {result && !result.safety.passed && (
        <div className="border-t border-risk-very-high/30 bg-risk-very-high/5 p-5">
          <div className="flex items-start gap-3">
            <AlertTriangle size={20} className="mt-0.5 flex-shrink-0 text-risk-very-high" />
            <div className="min-w-0">
              <p className="font-display text-xl uppercase text-ink">Held for clinician review</p>
              <p className="mt-1 text-small text-ink-dim">{result.safety.notes}</p>
              {result.safety.blocked_actions.length > 0 && (
                <ul className="mt-3 space-y-1">
                  {result.safety.blocked_actions.map((title) => (
                    <li key={title} className="text-small text-ink-dim">
                      <span className="line-through opacity-60">{title}</span>
                      <span className="ml-2 text-risk-very-high">removed</span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        </div>
      )}

      {result && result.plan.personalization_notes.length > 0 && (
        <div className="border-t border-hairline bg-surface-2 p-5">
          <p className="text-small font-semibold text-ink-faint">Adapted to you</p>
          <ul className="mt-2 space-y-1">
            {result.plan.personalization_notes.map((note) => (
              <li key={note} className="flex items-start gap-2 text-small text-ink-dim">
                <Check size={14} className="mt-0.5 flex-shrink-0 text-accent" />
                {note}
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}
