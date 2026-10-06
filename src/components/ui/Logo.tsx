/**
 * The TakaKori logotype.
 *
 * The mark is a wallet with two cards going in: the dark body is the wallet,
 * the two emerald bands are the cards, and the knocked-out dot is the snap.
 * It is drawn rather than imported so it inherits the theme — the same
 * component is correct on a white card and on a dark-mode screen — and so no
 * raster asset can go stale against the palette.
 *
 * `size` is the height of the whole lockup in px. The mark is always square;
 * the wordmark beside it is what makes the lockup wider.
 */
export function Logo({
  size = 32,
  variant = 'lockup',
  className,
}: {
  size?: number
  /** `mark` is the icon alone (app bar, favicon); `lockup` adds the word. */
  variant?: 'mark' | 'lockup'
  className?: string
}) {
  if (variant === 'mark') {
    return <Mark size={size} className={className} />
  }

  return (
    <span className={`flex items-center gap-2 ${className ?? ''}`} style={{ height: size }}>
      <Mark size={size} />
      {/* `fontSize` is set from `size` directly, with no `em` multiplier. The
          earlier `text-[1.05em]` compounded with this inline size, so the
          wordmark rendered at 17.68px — a value no token produced, derived from
          whatever size it happened to be nested in. */}
      <span
        className="leading-none font-semibold tracking-[-0.03em]"
        style={{ fontSize: size * 0.52 }}
      >
        {/* `text-content`, not `text-ink-900`: a hard-coded ink step is the
            background colour in dark mode, so "Taka" disappears exactly where
            the mark is least legible. The wallet body uses the same token. */}
        <span className="text-content">Taka</span>
        <span className="text-accent">Kori</span>
      </span>
    </span>
  )
}

/**
 * The mark on its own.
 *
 * Geometry is on a 40-unit grid. The two bands share a slant and a gap, which
 * is what makes them read as one object rather than two strokes; the body
 * clips under them so the cards appear to be entering the wallet.
 */
function Mark({ size, className }: { size: number; className?: string }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 40 40"
      fill="none"
      aria-hidden="true"
      focusable="false"
      className={className}
    >
      {/* Upper band, furthest from the wallet. */}
      <path
        d="M6.2 15.6 22.8 7.7a2.6 2.6 0 0 1 3.3.35l1.5 2a2.6 2.6 0 0 1-.35 3.35L10.6 21.4a2.6 2.6 0 0 1-3.35-.35l-1.5-2a2.6 2.6 0 0 1 .45-3.45Z"
        style={{ fill: 'var(--hue-brand)' }}
      />
      {/* Lower band, entering the wallet. */}
      <path
        d="M10.6 22.4 27.2 14.5a2.6 2.6 0 0 1 3.3.35l1.5 2a2.6 2.6 0 0 1-.35 3.35L15 28.2a2.6 2.6 0 0 1-3.35-.35l-1.5-2a2.6 2.6 0 0 1 .45-3.45Z"
        style={{ fill: 'var(--accent)' }}
      />
      {/* Wallet body. `fill-content` rather than `fill-ink-900`: in dark mode
          ink-900 *is* the background, so a fixed step erases the wallet. */}
      <rect x="4" y="19" width="32" height="18.5" rx="6" className="fill-content" />
      {/* The snap. Cut out of the body rather than filled, so it is the surface
          colour in either scheme without a second token. */}
      <circle cx="28.5" cy="28.25" r="4" className="fill-canvas" />
    </svg>
  )
}
