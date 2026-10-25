/**
 * Tailwind reads the design tokens from src/index.css rather than redefining
 * them, so there is exactly one place a colour or a type step is decided.
 *
 * @type {import('tailwindcss').Config}
 */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    screens: {
      xs: '420px',
      sm: '640px',
      md: '768px',
      lg: '1024px',
      xl: '1280px',
      '2xl': '1536px',
    },
    extend: {
      colors: {
        bg: 'var(--bg)',
        'bg-deep': 'var(--bg-deep)',
        surface: 'var(--surface)',
        'surface-2': 'var(--surface-2)',
        'surface-3': 'var(--surface-3)',
        hairline: 'var(--hairline)',
        ink: 'var(--ink)',
        'ink-dim': 'var(--ink-dim)',
        'ink-faint': 'var(--ink-faint)',
        accent: 'var(--accent)',
        'accent-bright': 'var(--accent-bright)',
        'accent-deep': 'var(--accent-deep)',
        'accent-soft': 'var(--accent-soft)',
        'accent-ink': 'var(--accent-ink)',
        risk: {
          low: 'var(--risk-low)',
          moderate: 'var(--risk-moderate)',
          high: 'var(--risk-high)',
          'very-high': 'var(--risk-very-high)',
        },
        agent: {
          risk: 'var(--agent-risk)',
          plan: 'var(--agent-plan)',
          personalize: 'var(--agent-personalize)',
          safety: 'var(--agent-safety)',
        },
      },
      fontFamily: {
        display: 'var(--font-display)',
        sans: 'var(--font-text)',
        mono: 'var(--font-mono)',
      },
      fontSize: {
        small: 'var(--step-small)',
        body: 'var(--step-body)',
        lead: 'var(--step-lead)',
        sub: 'var(--step-sub)',
        head: 'var(--step-head)',
      },
      borderRadius: {
        DEFAULT: 'var(--radius)',
        sm: 'var(--radius-sm)',
        none: '0',
        full: '999px',
      },
      boxShadow: {
        lift: 'var(--lift)',
        'lift-hover': 'var(--lift-hover)',
        none: 'none',
      },
      transitionTimingFunction: {
        out: 'var(--ease-out)',
        'in-out': 'var(--ease-in-out)',
      },
    },
  },
  plugins: [],
};
