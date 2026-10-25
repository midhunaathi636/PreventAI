/**
 * The one live thing on the landing page.
 *
 * Move a value, watch the risk move. This is not a mock: it posts to the real
 * `/v1/risk` endpoint on the deployed agent service and renders what the Risk
 * agent actually returns, including the factors it fired and their rationales.
 * Scoring stores nothing, so it runs without a session.
 *
 * If the service cannot be reached the control still renders and says so,
 * rather than leaving a dead slider on the page.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { agentService, type AgentRiskAssessment } from '@/lib/agent-service';
import { classNames, humanize } from '@/lib/utils';

interface Values {
  age: number;
  systolic_bp: number;
  bmi: number;
  fasting_glucose: number;
  smoker: boolean;
}

const INITIAL: Values = {
  age: 52,
  systolic_bp: 138,
  bmi: 28,
  fasting_glucose: 104,
  smoker: false,
};

const CONTROLS: {
  key: keyof Omit<Values, 'smoker'>;
  label: string;
  min: number;
  max: number;
  step: number;
  unit: string;
}[] = [
  { key: 'age', label: 'Age', min: 20, max: 85, step: 1, unit: 'years' },
  { key: 'systolic_bp', label: 'Systolic BP', min: 95, max: 185, step: 1, unit: 'mmHg' },
  { key: 'bmi', label: 'BMI', min: 17, max: 42, step: 0.5, unit: '' },
  { key: 'fasting_glucose', label: 'Fasting glucose', min: 75, max: 160, step: 1, unit: 'mg/dL' },
];

function bandColor(risk: number): string {
  if (risk < 20) return 'var(--risk-low)';
  if (risk < 40) return 'var(--risk-moderate)';
  if (risk < 60) return 'var(--risk-high)';
  return 'var(--risk-very-high)';
}

export function LiveRiskDemo() {
  const [values, setValues] = useState<Values>(INITIAL);
  const [result, setResult] = useState<AgentRiskAssessment | null>(null);
  const [failed, setFailed] = useState(false);
  const latest = useRef(0);

  const score = useCallback(async (v: Values) => {
    const ticket = ++latest.current;
    try {
      const assessment = await agentService.risk({ patient_id: 'public-demo', ...v });
      // A slower earlier request must not overwrite a newer answer.
      if (ticket === latest.current) {
        setResult(assessment);
        setFailed(false);
      }
    } catch {
      if (ticket === latest.current) setFailed(true);
    }
  }, []);

  // Debounced so dragging a slider does not fire a request per pixel.
  useEffect(() => {
    const timer = setTimeout(() => void score(values), 180);
    return () => clearTimeout(timer);
  }, [values, score]);

  const risk = result?.overall_risk ?? 0;
  const color = bandColor(risk);

  return (
    <div className="grid gap-10 lg:grid-cols-[1fr_1fr] lg:gap-16">
      {/* Controls */}
      <div>
        <div className="space-y-6">
          {CONTROLS.map((control) => (
            <div key={control.key}>
              <div className="mb-2 flex items-baseline justify-between">
                <label htmlFor={control.key} className="text-small font-semibold text-ink-dim">
                  {control.label}
                </label>
                <span className="tabular font-display text-2xl leading-none text-ink">
                  {values[control.key]}
                  {control.unit && (
                    <span className="ml-1 text-small font-normal text-ink-faint">
                      {control.unit}
                    </span>
                  )}
                </span>
              </div>
              <input
                id={control.key}
                type="range"
                min={control.min}
                max={control.max}
                step={control.step}
                value={values[control.key]}
                onChange={(e) =>
                  setValues((v) => ({ ...v, [control.key]: Number(e.target.value) }))
                }
                className="h-1.5 w-full cursor-pointer appearance-none rounded-full bg-surface-3 accent-[var(--accent)]"
              />
            </div>
          ))}

          <button
            type="button"
            onClick={() => setValues((v) => ({ ...v, smoker: !v.smoker }))}
            aria-pressed={values.smoker}
            className={classNames(
              'w-full rounded border px-4 py-3 text-left text-small font-semibold transition-colors',
              values.smoker
                ? 'border-risk-very-high/40 bg-risk-very-high/10 text-risk-very-high'
                : 'border-hairline text-ink-dim hover:border-accent hover:text-accent'
            )}
          >
            {values.smoker ? 'Current smoker' : 'Non-smoker'}
            <span className="ml-2 font-normal text-ink-faint">tap to change</span>
          </button>
        </div>
      </div>

      {/* Readout */}
      <div className="border-t border-hairline pt-8 lg:border-l lg:border-t-0 lg:pl-16 lg:pt-0">
        {failed ? (
          <p className="text-small text-ink-dim">
            The agent service is not reachable right now, so this control cannot score. Everything
            else on the page still works.
          </p>
        ) : (
          <>
            <div className="flex items-end gap-4">
              <div
                className="tabular font-display leading-[0.8] transition-colors duration-500"
                style={{ fontSize: 'clamp(4.5rem, 13vw, 9rem)', color }}
              >
                {Math.round(risk)}
              </div>
              <div className="pb-3">
                <div className="font-display text-2xl uppercase leading-none" style={{ color }}>
                  {humanize(result?.risk_level, 'low')}
                </div>
                <div className="text-small text-ink-faint">overall risk</div>
              </div>
            </div>

            {/* Four tracks, scored separately. */}
            <dl className="mt-8 space-y-3">
              {(
                [
                  ['Cardiovascular', result?.cvd_risk],
                  ['Diabetes', result?.diabetes_risk],
                  ['Cancer', result?.cancer_risk],
                  ['Stroke', result?.stroke_risk],
                ] as const
              ).map(([label, value]) => (
                <div key={label} className="flex items-center gap-4">
                  <dt className="w-32 flex-shrink-0 text-small text-ink-dim">{label}</dt>
                  <dd className="flex min-w-0 flex-1 items-center gap-3">
                    <div className="h-1 flex-1 overflow-hidden rounded-full bg-surface-3">
                      <div
                        className="h-full rounded-full transition-[width] duration-500 ease-out"
                        style={{ width: `${value ?? 0}%`, background: bandColor(value ?? 0) }}
                      />
                    </div>
                    <span className="tabular w-10 text-right text-small text-ink">
                      {Math.round(value ?? 0)}
                    </span>
                  </dd>
                </div>
              ))}
            </dl>

            {result && result.factors.length > 0 && (
              <div className="mt-8">
                <p className="text-small font-semibold text-ink-faint">What is driving it</p>
                <ul className="mt-2 space-y-1.5">
                  {result.factors.slice(0, 4).map((factor) => (
                    <li key={factor.code} className="text-small text-ink-dim">
                      <span className="text-ink">{factor.name}</span>
                      <span className="text-ink-faint"> · {factor.value}</span>
                      {!factor.modifiable && (
                        <span className="ml-2 text-ink-faint">(not modifiable)</span>
                      )}
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
