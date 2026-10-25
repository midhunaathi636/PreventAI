import type { RiskLevel } from './types';

export function classNames(...classes: (string | false | undefined | null)[]): string {
  return classes.filter(Boolean).join(' ');
}

export function formatDate(date: string | null | undefined): string {
  if (!date) return '—';
  return new Date(date).toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });
}

export function formatDateTime(date: string | null | undefined): string {
  if (!date) return '—';
  return new Date(date).toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export function timeAgo(date: string | null | undefined): string {
  if (!date) return '—';
  const seconds = Math.floor((Date.now() - new Date(date).getTime()) / 1000);
  if (seconds < 60) return 'just now';
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days}d ago`;
  const months = Math.floor(days / 30);
  if (months < 12) return `${months}mo ago`;
  return `${Math.floor(months / 12)}y ago`;
}

export function riskLevelColor(level: RiskLevel): {
  bg: string;
  text: string;
  border: string;
  dot: string;
} {
  // The clinical severity ramp. Kept separate from the cyan system accent so
  // a UI highlight can never be mistaken for a risk level.
  switch (level) {
    case 'low':
      return {
        bg: 'bg-risk-low/10',
        text: 'text-risk-low',
        border: 'border-risk-low/30',
        dot: 'bg-risk-low',
      };
    case 'moderate':
      return {
        bg: 'bg-risk-moderate/10',
        text: 'text-risk-moderate',
        border: 'border-risk-moderate/30',
        dot: 'bg-risk-moderate',
      };
    case 'high':
      return {
        bg: 'bg-risk-high/10',
        text: 'text-risk-high',
        border: 'border-risk-high/30',
        dot: 'bg-risk-high',
      };
    case 'very_high':
      return {
        bg: 'bg-risk-very-high/10',
        text: 'text-risk-very-high',
        border: 'border-risk-very-high/30',
        dot: 'bg-risk-very-high',
      };
  }
}

export function riskLevelLabel(level: RiskLevel): string {
  switch (level) {
    case 'low': return 'Low Risk';
    case 'moderate': return 'Moderate Risk';
    case 'high': return 'High Risk';
    case 'very_high': return 'Very High Risk';
  }
}

export function domainLabel(domain: string): string {
  switch (domain) {
    case 'lifestyle': return 'Lifestyle';
    case 'screening': return 'Screening';
    case 'behavioral': return 'Behavioral';
    case 'medication_adherence': return 'Medication Adherence';
    default: return domain;
  }
}

export function domainColor(domain: string): { bg: string; text: string } {
  switch (domain) {
    case 'lifestyle':
      return { bg: 'bg-accent/10', text: 'text-accent' };
    case 'screening':
      return { bg: 'bg-agent-plan/10', text: 'text-agent-plan' };
    case 'behavioral':
      return { bg: 'bg-agent-personalize/10', text: 'text-agent-personalize' };
    case 'medication_adherence':
      return { bg: 'bg-agent-safety/10', text: 'text-agent-safety' };
    default:
      return { bg: 'bg-surface-3', text: 'text-ink-dim' };
  }
}

export function planStatusLabel(status: string): string {
  switch (status) {
    case 'draft': return 'Draft';
    case 'pending_review': return 'Pending Review';
    case 'active': return 'Active';
    case 'completed': return 'Completed';
    case 'overridden': return 'Overridden';
    default: return status;
  }
}

export function planStatusColor(status: string): { bg: string; text: string; border: string } {
  switch (status) {
    case 'draft':
      return { bg: 'bg-surface-3', text: 'text-ink-dim', border: 'border-hairline' };
    case 'pending_review':
      return {
        bg: 'bg-risk-moderate/10',
        text: 'text-risk-moderate',
        border: 'border-risk-moderate/30',
      };
    case 'active':
      return { bg: 'bg-risk-low/10', text: 'text-risk-low', border: 'border-risk-low/30' };
    case 'completed':
      return { bg: 'bg-agent-plan/10', text: 'text-agent-plan', border: 'border-agent-plan/30' };
    case 'overridden':
      return {
        bg: 'bg-risk-very-high/10',
        text: 'text-risk-very-high',
        border: 'border-risk-very-high/30',
      };
    default:
      return { bg: 'bg-surface-3', text: 'text-ink-dim', border: 'border-hairline' };
  }
}

export function agentTypeLabel(type: string): string {
  switch (type) {
    case 'risk': return 'Risk Agent';
    case 'plan_generation': return 'Plan Generation Agent';
    case 'personalization': return 'Personalization Agent';
    case 'safety': return 'Safety Agent';
    default: return type;
  }
}

export function agentTypeColor(type: string): string {
  // One colour per agent, shared with the 3D scene so the same agent reads
  // the same whether you see it as a node or as a row in the trace.
  switch (type) {
    case 'risk':
      return 'text-agent-risk bg-agent-risk/10';
    case 'plan_generation':
      return 'text-agent-plan bg-agent-plan/10';
    case 'personalization':
      return 'text-agent-personalize bg-agent-personalize/10';
    case 'safety':
      return 'text-agent-safety bg-agent-safety/10';
    default:
      return 'text-ink-dim bg-surface-3';
  }
}

export function getInitials(first: string, last: string): string {
  return `${first.charAt(0) || ''}${last.charAt(0) || ''}`.toUpperCase() || '?';
}

export function getAge(dob: string | null): number | null {
  if (!dob) return null;
  const birth = new Date(dob);
  const diff = Date.now() - birth.getTime();
  return Math.floor(diff / (365.25 * 24 * 60 * 60 * 1000));
}

/**
 * Render an enum-ish string for people: `very_high` -> `very high`.
 *
 * Returns the fallback for null/undefined rather than throwing. A missing
 * field should leave a dash in one table cell, not take down the page — which
 * is exactly what a bare `value.replace(...)` inside a `.map()` did when one
 * mapper emitted the wrong casing.
 */
export function humanize(value: string | null | undefined, fallback = '—'): string {
  if (value === null || value === undefined) return fallback;
  const text = String(value).replace(/_/g, ' ').trim();
  return text || fallback;
}
