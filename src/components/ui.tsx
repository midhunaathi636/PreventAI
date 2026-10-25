/**
 * UI primitives.
 *
 * Every page in the app composes from these, so restyling here is what
 * carries the instrument direction across all sixteen screens without
 * rewriting each one. The exported API is unchanged on purpose.
 *
 * These are app-screen components, so they follow app-screen conventions:
 * quiet borders, repeated panels and small labels are correct here. The
 * marketing page's rules (no rules, no panels) apply to Home, not to a
 * clinical table.
 */

import type { ReactNode } from 'react';
import { classNames } from '@/lib/utils';

export function Card({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div
      className={classNames(
        // Light theme: panels separate from the ground by elevation and a
        // hairline, not by a heavy border.
        'rounded border border-hairline/70 bg-surface shadow-lift transition-shadow duration-200',
        className
      )}
    >
      {children}
    </div>
  );
}

export function CardHeader({
  title,
  subtitle,
  icon,
  action,
}: {
  title: string;
  subtitle?: string;
  icon?: ReactNode;
  action?: ReactNode;
}) {
  return (
    <div className="flex items-start justify-between gap-4 border-b border-hairline p-5">
      <div className="flex min-w-0 items-center gap-3">
        {icon && <div className="flex-shrink-0 text-accent">{icon}</div>}
        <div className="min-w-0">
          <h3 className="font-display text-xl uppercase tracking-tight text-ink">{title}</h3>
          {subtitle && <p className="mt-1 text-small text-ink-dim">{subtitle}</p>}
        </div>
      </div>
      {action}
    </div>
  );
}

export function CardBody({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={classNames('p-5', className)}>{children}</div>;
}

export function Badge({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <span
      className={classNames(
        'inline-flex items-center gap-1.5 rounded border px-2 py-0.5 text-small font-semibold',
        className
      )}
    >
      {children}
    </span>
  );
}

export function Button({
  children,
  onClick,
  variant = 'primary',
  size = 'md',
  className,
  disabled,
  type = 'button',
}: {
  children: ReactNode;
  onClick?: () => void;
  variant?: 'primary' | 'secondary' | 'ghost' | 'danger' | 'outline';
  size?: 'sm' | 'md' | 'lg';
  className?: string;
  disabled?: boolean;
  type?: 'button' | 'submit';
}) {
  // One shape for the whole app: soft corners, flat fill, no gradient.
  const variants = {
    primary: 'bg-accent text-accent-ink shadow-lift hover:bg-accent-bright active:translate-y-px',
    secondary: 'bg-surface-3 text-ink hover:bg-hairline active:translate-y-px',
    ghost: 'text-ink-dim hover:bg-surface-3 hover:text-ink',
    danger: 'bg-risk-very-high text-white hover:brightness-95 active:translate-y-px',
    outline: 'border border-hairline bg-surface text-ink hover:border-accent hover:text-accent',
  };
  const sizes = {
    sm: 'px-3 py-1.5 text-small',
    md: 'px-4 py-2.5 text-small',
    lg: 'px-6 py-3 text-body',
  };
  return (
    <button
      type={type}
      onClick={onClick}
      disabled={disabled}
      className={classNames(
        'inline-flex items-center justify-center gap-2 rounded-full font-semibold',
        'transition-[background-color,color,border-color,transform] duration-150',
        'disabled:cursor-not-allowed disabled:opacity-40',
        variants[variant],
        sizes[size],
        className
      )}
    >
      {children}
    </button>
  );
}

const FIELD = [
  'w-full rounded-sm border border-hairline bg-surface px-3.5 py-2.5',
  'text-body text-ink placeholder:text-ink-faint',
  'transition-colors focus:border-accent focus:outline-none',
].join(' ');

const LABEL = 'mb-1.5 block text-small font-semibold text-ink-dim';

export function Input({
  label,
  type = 'text',
  value,
  onChange,
  placeholder,
  required,
  name,
  autoComplete,
}: {
  label?: string;
  type?: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  required?: boolean;
  name?: string;
  autoComplete?: string;
}) {
  return (
    <div>
      {label && <label className={LABEL}>{label}</label>}
      <input
        type={type}
        name={name}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        required={required}
        autoComplete={autoComplete}
        className={FIELD}
      />
    </div>
  );
}

export function Select({
  label,
  value,
  onChange,
  options,
  required,
}: {
  label?: string;
  value: string;
  onChange: (v: string) => void;
  options: { value: string; label: string }[];
  required?: boolean;
}) {
  return (
    <div>
      {label && <label className={LABEL}>{label}</label>}
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        required={required}
        className={FIELD}
      >
        {options.map((opt) => (
          <option key={opt.value} value={opt.value} className="bg-surface-2 text-ink">
            {opt.label}
          </option>
        ))}
      </select>
    </div>
  );
}

export function Textarea({
  label,
  value,
  onChange,
  placeholder,
  rows = 4,
}: {
  label?: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  rows?: number;
}) {
  return (
    <div>
      {label && <label className={LABEL}>{label}</label>}
      <textarea
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        rows={rows}
        className={classNames(FIELD, 'resize-none')}
      />
    </div>
  );
}

export function Spinner({ className }: { className?: string }) {
  return (
    <div
      className={classNames(
        'inline-block animate-spin rounded-full border-2 border-hairline border-t-accent',
        className || 'h-6 w-6'
      )}
    />
  );
}

export function EmptyState({
  icon,
  title,
  message,
  action,
}: {
  icon: ReactNode;
  title: string;
  message: string;
  action?: ReactNode;
}) {
  return (
    <div className="flex flex-col items-center justify-center px-6 py-16 text-center">
      <div className="mb-4 text-ink-faint">{icon}</div>
      <h3 className="font-display text-2xl uppercase text-ink">{title}</h3>
      <p className="mt-2 max-w-md text-small text-ink-dim">{message}</p>
      {action && <div className="mt-5">{action}</div>}
    </div>
  );
}

export function ProgressBar({
  value,
  className,
  barClassName,
}: {
  value: number;
  className?: string;
  barClassName?: string;
}) {
  const pct = Math.min(100, Math.max(0, value));
  return (
    <div
      className={classNames('w-full overflow-hidden rounded-full bg-surface-3', className || 'h-2')}
      role="progressbar"
      aria-valuenow={Math.round(pct)}
      aria-valuemin={0}
      aria-valuemax={100}
    >
      <div
        className={classNames(
          'h-full rounded-full transition-[width] duration-700 ease-out',
          barClassName || 'bg-accent'
        )}
        style={{ width: `${pct}%` }}
      />
    </div>
  );
}

export function StatCard({
  label,
  value,
  sublabel,
  icon,
  color = 'teal',
}: {
  label: string;
  value: string | number;
  sublabel?: string;
  icon?: ReactNode;
  /** Names kept for call-site compatibility; mapped onto the token palette. */
  color?: 'teal' | 'blue' | 'amber' | 'red' | 'emerald' | 'violet';
}) {
  const accents: Record<string, string> = {
    teal: 'text-accent',
    blue: 'text-agent-plan',
    amber: 'text-risk-moderate',
    red: 'text-risk-very-high',
    emerald: 'text-risk-low',
    violet: 'text-agent-personalize',
  };
  return (
    <Card className="lift-hover p-5">
      <div className="mb-4 flex items-start justify-between gap-3">
        <span className="text-small font-semibold text-ink-dim">{label}</span>
        {icon && <div className={classNames('flex-shrink-0', accents[color])}>{icon}</div>}
      </div>
      <div className="tabular font-display text-4xl leading-none text-ink">{value}</div>
      {sublabel && <div className="mt-2 text-small text-ink-dim">{sublabel}</div>}
    </Card>
  );
}

export function Modal({
  open,
  onClose,
  title,
  children,
  maxWidth = 'max-w-lg',
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
  maxWidth?: string;
}) {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" role="dialog" aria-modal="true">
      <div className="absolute inset-0 bg-ink/25" onClick={onClose} />
      <div
        className={classNames(
          'relative w-full rounded border border-hairline bg-surface shadow-2xl',
          maxWidth
        )}
      >
        <div className="flex items-center justify-between border-b border-hairline p-5">
          <h2 className="font-display text-xl uppercase text-ink">{title}</h2>
          <button
            onClick={onClose}
            aria-label="Close"
            className="rounded p-1 text-ink-faint transition-colors hover:text-ink"
          >
            <svg width="20" height="20" viewBox="0 0 20 20" fill="none" aria-hidden="true">
              <path d="M5 5l10 10M15 5L5 15" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
            </svg>
          </button>
        </div>
        <div className="max-h-[70vh] overflow-y-auto p-5">{children}</div>
      </div>
    </div>
  );
}

export function Avatar({
  initials,
  size = 'md',
  className,
}: {
  initials: string;
  size?: 'sm' | 'md' | 'lg';
  className?: string;
}) {
  const sizes = { sm: 'h-8 w-8 text-small', md: 'h-10 w-10 text-small', lg: 'h-14 w-14 text-body' };
  return (
    <div
      className={classNames(
        'flex flex-shrink-0 items-center justify-center rounded-full bg-accent-soft font-semibold text-accent',
        sizes[size],
        className
      )}
    >
      {initials}
    </div>
  );
}

export function Toggle({
  checked,
  onChange,
  label,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  label?: string;
}) {
  return (
    <label className="inline-flex cursor-pointer items-center gap-3">
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        onClick={() => onChange(!checked)}
        className={classNames(
          'relative inline-flex h-6 w-11 flex-shrink-0 rounded-full transition-colors duration-200',
          checked ? 'bg-accent' : 'bg-surface-3'
        )}
      >
        <span
          className={classNames(
            'mt-0.5 inline-block h-5 w-5 rounded-full transition-transform duration-200',
            checked ? 'translate-x-5 bg-white' : 'translate-x-0.5 bg-white'
          )}
        />
      </button>
      {label && <span className="text-small text-ink-dim">{label}</span>}
    </label>
  );
}
