/**
 * The PreventAI mark.
 *
 * This renders the supplied badge artwork (`public/logo.png`) rather than a
 * drawn vector. The source was black line art on white; the white has been
 * turned into transparency so one file sits on any surface, and the margin
 * trimmed so the badge fills its box.
 *
 * A badge with text around its rim needs room. `LogoBadge` is for places
 * where the brand is the subject — the sign-in panel, the footer. `LogoLockup`
 * pairs a smaller badge with the name set in type, which is what a header
 * needs, because the rim text stops being legible below about 40px and the
 * wordmark carries the name instead.
 */

/**
 * Two renderings of the same badge: the accent-green one for the app's own
 * surfaces, and the near-black one for anywhere the green would not read.
 * Both are the supplied artwork, recoloured at build time rather than tinted
 * with a CSS filter, which cannot reliably hit an exact brand colour.
 */
const LOGO_ACCENT = '/logo-accent.png';
const LOGO_INK = '/logo-ink.png';

export function LogoBadge({
  size = 128,
  className,
  alt = 'PreventAI',
  tone = 'accent',
}: {
  size?: number;
  className?: string;
  alt?: string;
  tone?: 'accent' | 'ink';
}) {
  return (
    <img
      src={tone === 'ink' ? LOGO_INK : LOGO_ACCENT}
      width={size}
      height={size}
      alt={alt}
      className={className}
      style={{ width: size, height: size, objectFit: 'contain' }}
      loading="lazy"
      decoding="async"
    />
  );
}

/**
 * The badge alone, at header scale. Decorative here because the wordmark
 * beside it already names the product, so screen readers are not told twice.
 */
export function LogoMark({
  size = 36,
  className,
  tone = 'accent',
}: {
  size?: number;
  className?: string;
  tone?: 'accent' | 'ink';
}) {
  return (
    <img
      src={tone === 'ink' ? LOGO_INK : LOGO_ACCENT}
      width={size}
      height={size}
      alt=""
      aria-hidden="true"
      className={className}
      style={{ width: size, height: size, objectFit: 'contain' }}
      decoding="async"
    />
  );
}

/** Badge plus wordmark — the usual header lockup. */
export function LogoLockup({
  className,
  markSize = 36,
  showText = true,
}: {
  className?: string;
  markSize?: number;
  showText?: boolean;
}) {
  return (
    <span className={className ?? 'flex items-center gap-2.5'}>
      <LogoMark size={markSize} className="flex-shrink-0" />
      {showText && (
        <span className="font-display text-2xl uppercase leading-none tracking-tight text-ink">
          PreventAI
        </span>
      )}
    </span>
  );
}
