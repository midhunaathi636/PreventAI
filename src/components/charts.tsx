import { useMemo } from 'react';

interface LineChartProps {
  data: { label: string; value: number }[];
  height?: number;
  color?: string;
  maxValue?: number;
  minValue?: number;
  threshold?: number;
  thresholdLabel?: string;
}

export function LineChart({ data, height = 200, color = '#0d9488', maxValue, minValue = 0, threshold, thresholdLabel }: LineChartProps) {
  const { points, maxV, minV, width, padding, chartHeight } = useMemo(() => {
    const w = 800;
    const p = 40;
    const ch = height - p * 2;
    const vals = data.map((d) => d.value);
    const mx = maxValue ?? Math.max(...vals, 1) * 1.1;
    const mn = minValue;
    return { points: data, maxV: mx, minV: mn, width: w, padding: p, chartHeight: ch };
  }, [data, height, maxValue, minValue]);

  if (data.length === 0) {
    return <div className="flex items-center justify-center text-ink-faint text-small" style={{ height }}>No data available</div>;
  }

  const stepX = (width - padding * 2) / Math.max(data.length - 1, 1);
  const scale = (val: number) => {
    const ratio = (val - minV) / (maxV - minV || 1);
    return padding + chartHeight - ratio * chartHeight;
  };

  const linePath = data
    .map((d, i) => `${i === 0 ? 'M' : 'L'} ${padding + i * stepX} ${scale(d.value)}`)
    .join(' ');

  const areaPath = `${linePath} L ${padding + (data.length - 1) * stepX} ${padding + chartHeight} L ${padding} ${padding + chartHeight} Z`;

  const thresholdY = threshold != null ? scale(threshold) : null;

  return (
    <svg viewBox={`0 0 ${width} ${height}`} className="w-full" style={{ height }}>
      <defs>
        <linearGradient id={`grad-${color.slice(1)}`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity="0.15" />
          <stop offset="100%" stopColor={color} stopOpacity="0" />
        </linearGradient>
      </defs>
      {[0, 0.25, 0.5, 0.75, 1].map((ratio) => {
        const y = padding + chartHeight * ratio;
        const val = Math.round(maxV - (maxV - minV) * ratio);
        return (
          <g key={ratio}>
            <line x1={padding} y1={y} x2={width - padding} y2={y} stroke="var(--hairline)" strokeWidth="1" />
            <text x={padding - 8} y={y + 4} textAnchor="end" fontSize="10" fill="var(--ink-faint)">{val}</text>
          </g>
        );
      })}
      {thresholdY != null && (
        <g>
          <line x1={padding} y1={thresholdY} x2={width - padding} y2={thresholdY} stroke="var(--risk-very-high)" strokeWidth="1.5" strokeDasharray="6 4" />
          <text x={width - padding} y={thresholdY - 5} textAnchor="end" fontSize="10" fill="var(--risk-very-high)" fontWeight="600">
            {thresholdLabel || 'Threshold'}
          </text>
        </g>
      )}
      <path d={areaPath} fill={`url(#grad-${color.slice(1)})`} />
      <path d={linePath} fill="none" stroke={color} strokeWidth="2.5" strokeLinejoin="round" strokeLinecap="round" />
      {data.map((d, i) => (
        <g key={i}>
          <circle cx={padding + i * stepX} cy={scale(d.value)} r="4" fill="var(--bg)" stroke={color} strokeWidth="2" />
          <text x={padding + i * stepX} y={height - 12} textAnchor="middle" fontSize="10" fill="var(--ink-faint)">
            {d.label}
          </text>
        </g>
      ))}
    </svg>
  );
}

interface BarChartProps {
  data: { label: string; value: number; color?: string }[];
  height?: number;
  maxValue?: number;
  unit?: string;
}

export function BarChart({ data, height = 200, maxValue, unit }: BarChartProps) {
  if (data.length === 0) {
    return <div className="flex items-center justify-center text-ink-faint text-small" style={{ height }}>No data available</div>;
  }
  const max = maxValue ?? Math.max(...data.map((d) => d.value), 1) * 1.1;
  return (
    <div className="space-y-3" style={{ minHeight: height }}>
      {data.map((d, i) => (
        <div key={i}>
          <div className="flex justify-between items-center mb-1.5">
            <span className="text-small text-ink-dim">{d.label}</span>
            <span className="text-small font-semibold text-ink tabular">
              {d.value}{unit}
            </span>
          </div>
          <div className="w-full bg-surface-3 rounded-full h-2 overflow-hidden">
            <div
              className="h-full rounded-full transition-all duration-700 ease-out"
              style={{ width: `${(d.value / max) * 100}%`, backgroundColor: d.color || '#0d9488' }}
            />
          </div>
        </div>
      ))}
    </div>
  );
}

interface DonutChartProps {
  segments: { label: string; value: number; color: string }[];
  size?: number;
  centerLabel?: string;
  centerValue?: string;
}

export function DonutChart({ segments, size = 180, centerLabel, centerValue }: DonutChartProps) {
  const total = segments.reduce((s, seg) => s + seg.value, 0);
  const radius = size / 2 - 20;
  const strokeWidth = 20;
  const circumference = 2 * Math.PI * radius;

  let offset = 0;
  const arcs = segments.map((seg) => {
    const fraction = total > 0 ? seg.value / total : 0;
    const dash = fraction * circumference;
    const arc = {
      ...seg,
      dasharray: `${dash} ${circumference - dash}`,
      dashoffset: -offset,
    };
    offset += dash;
    return arc;
  });

  return (
    <div className="relative inline-flex items-center justify-center" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="-rotate-90">
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke="var(--surface-3)"
          strokeWidth={strokeWidth}
        />
        {total > 0 && arcs.map((arc, i) => (
          <circle
            key={i}
            cx={size / 2}
            cy={size / 2}
            r={radius}
            fill="none"
            stroke={arc.color}
            strokeWidth={strokeWidth}
            strokeDasharray={arc.dasharray}
            strokeDashoffset={arc.dashoffset}
            strokeLinecap="round"
            className="transition-all duration-700"
          />
        ))}
      </svg>
      {(centerValue || centerLabel) && (
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          {centerValue && <span className="font-display text-4xl text-ink tabular">{centerValue}</span>}
          {centerLabel && <span className="text-small text-ink-dim mt-1">{centerLabel}</span>}
        </div>
      )}
    </div>
  );
}

interface SparklineProps {
  data: number[];
  width?: number;
  height?: number;
  color?: string;
}

export function Sparkline({ data, width = 100, height = 30, color = '#0d9488' }: SparklineProps) {
  if (data.length < 2) return null;
  const max = Math.max(...data);
  const min = Math.min(...data);
  const range = max - min || 1;
  const step = width / (data.length - 1);
  const points = data
    .map((v, i) => `${i * step},${height - ((v - min) / range) * height}`)
    .join(' ');
  return (
    <svg width={width} height={height} className="inline-block">
      <polyline
        points={points}
        fill="none"
        stroke={color}
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
