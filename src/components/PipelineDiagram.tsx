/**
 * The four-agent pipeline, drawn flat.
 *
 * This replaces the WebGL scene that used to sit here. It carries the same
 * idea in a fraction of the weight: four agents reading left to right, with
 * the fourth drawn as a barrier rather than a node, because it is the only
 * one that can reject what the others proposed.
 *
 * Nothing here loops or idles. The only movement is the stage highlight while
 * a run is in flight, which is feedback rather than decoration, and the bars
 * of the gate closing when the safety agent has blocked something.
 *
 * Everything shown is real: the core's size is the risk score, the payload
 * count is the number of actions, and a rejected payload is an action the
 * safety agent genuinely removed.
 */

import { classNames } from '@/lib/utils';

/** -1 when idle, otherwise the index of the agent currently working. */
export type PipelineStage = -1 | 0 | 1 | 2 | 3;

const AGENTS = [
  { label: 'Risk', color: 'var(--agent-risk)' },
  { label: 'Plan', color: 'var(--agent-plan)' },
  { label: 'Adapt', color: 'var(--agent-personalize)' },
  { label: 'Safety', color: 'var(--agent-safety)' },
] as const;

const NODE_X = [70, 230, 390, 540] as const;
const AXIS_Y = 92;

function riskColor(risk: number): string {
  if (risk < 20) return 'var(--risk-low)';
  if (risk < 40) return 'var(--risk-moderate)';
  if (risk < 60) return 'var(--risk-high)';
  return 'var(--risk-very-high)';
}

export function PipelineDiagram({
  stage = -1,
  risk = 0,
  actions = 6,
  blocked = 0,
  className,
}: {
  stage?: PipelineStage;
  risk?: number;
  actions?: number;
  blocked?: number;
  className?: string;
}) {
  const core = riskColor(risk);
  // Clamp so an unusually long plan cannot overflow the cluster.
  const cubes = Math.max(3, Math.min(actions, 7));
  const gateClosed = blocked > 0;

  /** A cluster of small squares standing for the plan's actions. */
  const cluster = (cx: number, color: string, tight: boolean, dim: boolean) =>
    Array.from({ length: cubes }, (_, i) => {
      const angle = (i / cubes) * Math.PI * 2 - Math.PI / 2;
      const r = tight ? 22 : 30;
      return (
        <rect
          key={i}
          x={cx + Math.cos(angle) * r - 5}
          y={AXIS_Y + Math.sin(angle) * r - 5}
          width="10"
          height="10"
          rx="2"
          fill={color}
          opacity={dim ? 0.3 : 0.9}
        />
      );
    });

  return (
    <div
      className={classNames(
        'flex h-full w-full items-center justify-center bg-surface-2 p-6',
        className
      )}
    >
      <svg
        viewBox="0 0 610 170"
        className="h-full max-h-[240px] w-full"
        preserveAspectRatio="xMidYMid meet"
        role="img"
        aria-label={
          stage >= 0 && stage <= 3
            ? `Agent pipeline, ${AGENTS[stage as 0 | 1 | 2 | 3].label} stage running`
            : 'Agent pipeline: risk, plan, adapt, safety'
        }
      >
        {/* The rail the plan travels along */}
        <line
          x1={NODE_X[0]}
          y1={AXIS_Y}
          x2={NODE_X[3]}
          y2={AXIS_Y}
          stroke="var(--hairline)"
          strokeWidth="2"
        />

        {/* 1 — Risk core. Its size is the score. */}
        <circle
          cx={NODE_X[0]}
          cy={AXIS_Y}
          r={18 + (risk / 100) * 13}
          fill={core}
          opacity={stage === 0 || stage === -1 ? 0.95 : 0.6}
        />
        <circle
          cx={NODE_X[0]}
          cy={AXIS_Y}
          r={30 + (risk / 100) * 17}
          fill="none"
          stroke={core}
          strokeWidth="1.5"
          opacity="0.35"
        />

        {/* 2 and 3 — the plan, then the same plan reshaped */}
        <g>{cluster(NODE_X[1], AGENTS[1].color, false, !(stage >= 1 || stage === -1))}</g>
        <g>{cluster(NODE_X[2], AGENTS[2].color, true, !(stage >= 2 || stage === -1))}</g>

        {/* 4 — the gate. The one node shaped like a barrier. */}
        <g>
          <circle
            cx={NODE_X[3]}
            cy={AXIS_Y}
            r="32"
            fill="none"
            stroke={AGENTS[3].color}
            strokeWidth="2.5"
            opacity={stage === 3 || stage === -1 ? 1 : 0.5}
          />
          <rect
            x={NODE_X[3] - 24}
            y={gateClosed ? AXIS_Y - 9 : AXIS_Y - 31}
            width="48"
            height="5"
            rx="2.5"
            fill={AGENTS[3].color}
            className="transition-all duration-500 ease-out"
          />
          <rect
            x={NODE_X[3] - 24}
            y={gateClosed ? AXIS_Y + 4 : AXIS_Y + 26}
            width="48"
            height="5"
            rx="2.5"
            fill={AGENTS[3].color}
            className="transition-all duration-500 ease-out"
          />
        </g>

        {/* A rejected payload, turned back at the gate */}
        {gateClosed && (
          <g>
            <circle cx={NODE_X[3] - 62} cy={AXIS_Y - 24} r="5.5" fill="var(--risk-very-high)" />
            <path
              d={`M${NODE_X[3] - 52} ${AXIS_Y - 28} q16 -11 30 -3`}
              fill="none"
              stroke="var(--risk-very-high)"
              strokeWidth="1.8"
              strokeLinecap="round"
              opacity="0.8"
            />
          </g>
        )}

        {/* Labels */}
        {AGENTS.map((agent, i) => {
          const isCurrent = stage === i;
          return (
            <text
              key={agent.label}
              x={NODE_X[i]}
              y="150"
              textAnchor="middle"
              fill={isCurrent ? agent.color : 'var(--ink-faint)'}
              style={{
                font: `600 13px var(--font-text)`,
                letterSpacing: '0.03em',
              }}
            >
              {agent.label}
            </text>
          );
        })}
      </svg>
    </div>
  );
}
