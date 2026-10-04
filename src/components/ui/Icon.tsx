import type { ReactNode } from 'react'

/**
 * The TakaKori icon set.
 *
 * Hand-rolled rather than pulled from a library, for the reason already recorded
 * in `components/reports/Charts.tsx`: this app targets users on metered
 * connections, and an icon package plus its tree-shaking assumptions is a large
 * dependency for twenty glyphs.
 *
 * Rules that keep the set coherent:
 *   - 24×24 viewBox, `currentColor`, stroke only. No fills except where a glyph
 *     is meaningless without one.
 *   - `stroke-width` 1.8 default. 2.0 reads heavier next to text at 13px, 1.5
 *     disappears at 16px.
 *   - Round caps and joins everywhere, matching the pill geometry of the rest of
 *     the interface.
 *   - Rounded-square silhouettes rather than detailed illustration. A glyph that
 *     needs a caption to be understood does not belong at 20px.
 *
 * To add one: draw it on a 24×24 grid with a 2px padding, add it to PATHS, and
 * add the name to `IconName`. Nothing else in the codebase hardcodes an SVG.
 */

const PATHS = {
  home: (
    <path d="M3.5 10.5 12 3.5l8.5 7M5.75 9.25V19a1.75 1.75 0 0 0 1.75 1.75h9a1.75 1.75 0 0 0 1.75-1.75V9.25" />
  ),
  receipt: (
    <>
      <path d="M6 3.25h12v17.5l-2.5-1.5-2.5 1.5-2.5-1.5L8 20.75l-2-1.5V3.25Z" />
      <path d="M9 8.5h6M9 12.5h6" />
    </>
  ),
  chart: (
    <>
      <path d="M4 4v15.5h16" />
      <path d="m7.5 15 3.25-4 2.75 2.5L20 7.5" />
    </>
  ),
  user: (
    <>
      <circle cx="12" cy="8" r="3.75" />
      <path d="M4.75 20.25a7.25 7.25 0 0 1 14.5 0" />
    </>
  ),
  plus: <path d="M12 5.25v13.5M5.25 12h13.5" />,
  minus: <path d="M5.25 12h13.5" />,
  chevronRight: <path d="m9.5 5.5 6.5 6.5-6.5 6.5" />,
  chevronDown: <path d="m5.5 9.5 6.5 6.5 6.5-6.5" />,
  arrowUpRight: <path d="M7.5 16.5 16.5 7.5M9.5 7.5h7v7" />,
  arrowDownLeft: <path d="M16.5 7.5 7.5 16.5M14.5 16.5h-7v-7" />,
  bell: (
    <>
      <path d="M18 9.75a6 6 0 1 0-12 0c0 4.5-2 5.75-2 5.75h16s-2-1.25-2-5.75Z" />
      <path d="M10.25 19.25a2 2 0 0 0 3.5 0" />
    </>
  ),
  sliders: (
    <>
      <path d="M4 7.5h8M17 7.5h3M4 16.5h3M12 16.5h8" />
      <circle cx="14.5" cy="7.5" r="2.25" />
      <circle cx="9.5" cy="16.5" r="2.25" />
    </>
  ),
  search: (
    <>
      <circle cx="11" cy="11" r="6.75" />
      <path d="m16 16 4 4" />
    </>
  ),
  calendar: (
    <>
      <rect x="3.25" y="5.25" width="17.5" height="15.5" rx="3" />
      <path d="M8 3.25v4M16 3.25v4M3.25 10.25h17.5" />
    </>
  ),
  check: <path d="m5 12.75 4.5 4.5L19 6.75" />,
  close: <path d="m6.5 6.5 11 11M17.5 6.5l-11 11" />,
  wallet: (
    <>
      <path d="M3.25 8.25V6.5a2 2 0 0 1 2-2h11.5a2 2 0 0 1 2 2v1.5" />
      <path d="M3.25 8.25v9.25a2.5 2.5 0 0 0 2.5 2.5h12.5a2 2 0 0 0 2-2v-6a2 2 0 0 0-2-2H5.75a2.5 2.5 0 0 1-2.5-2Z" />
      <circle cx="16.25" cy="14.25" r="1.1" />
    </>
  ),
  card: (
    <>
      <rect x="2.75" y="5.25" width="18.5" height="13.5" rx="3" />
      <path d="M2.75 10h18.5M7 15h3.5" />
    </>
  ),
  phone: (
    <>
      <rect x="7" y="2.75" width="10" height="18.5" rx="2.75" />
      <path d="M10.5 18.25h3" />
    </>
  ),
  bank: (
    <>
      <path d="M12 3 3 7.75h18L12 3Z" />
      <path d="M5.75 7.75v9M10 7.75v9M14 7.75v9M18.25 7.75v9M3 21h18" />
    </>
  ),
  tag: (
    <>
      <path d="M4 3.75h6.6l9.4 9.4-6.6 6.6-9.4-9.4V3.75Z" />
      <circle cx="8.25" cy="8.25" r="1.35" />
    </>
  ),
  repeat: <path d="M4 9.25h14l-3.5-3.5M20 14.75H6l3.5 3.5" />,
  target: (
    <>
      <circle cx="12" cy="12" r="8.75" />
      <circle cx="12" cy="12" r="4.75" />
      <circle cx="12" cy="12" r="1.25" />
    </>
  ),
  trash: <path d="M4 7h16M9 7V4.75h6V7M6 7l1 13.25h10L18 7" />,
  pencil: (
    <>
      <path d="M4 20.25h4.25L18.75 9.75a2.12 2.12 0 0 0-3-3L5.25 17.25v3Z" />
      <path d="m14.25 6.25 3.5 3.5" />
    </>
  ),
  download: <path d="M12 3.75v11.5M7.75 11.5 12 15.75l4.25-4.25M4 20.25h16" />,
  alert: (
    <>
      <path d="M12 3.75 2.75 20.25h18.5L12 3.75Z" />
      <path d="M12 10v4.25M12 17.25h.01" />
    </>
  ),
  info: (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 11v5.25M12 7.75h.01" />
    </>
  ),
  logout: (
    <path d="M15 4.25h2.75a2 2 0 0 1 2 2v11.5a2 2 0 0 1-2 2H15M10 16.25 5.75 12 10 7.75M6.25 12h8" />
  ),
  filter: <path d="M4 6.75h16M7 12h10M10 17.25h4" />,
  shield: (
    <>
      <path d="M12 3 4.5 5.75V11c0 4.75 3.15 8.1 7.5 9.25 4.35-1.15 7.5-4.5 7.5-9.25V5.75L12 3Z" />
      <path d="m9 12 2.25 2.25L15.5 10" />
    </>
  ),
  lock: (
    <>
      <rect x="4.75" y="10.25" width="14.5" height="10" rx="3" />
      <path d="M8.25 10.25V7.5a3.75 3.75 0 0 1 7.5 0v2.75" />
    </>
  ),
  eye: (
    <>
      <path d="M2.75 12S6.5 5.75 12 5.75 21.25 12 21.25 12 17.5 18.25 12 18.25 2.75 12 2.75 12Z" />
      <circle cx="12" cy="12" r="2.75" />
    </>
  ),
  eyeOff: (
    <>
      <path d="M9.75 6.25A7.9 7.9 0 0 1 12 5.75c5.5 0 9.25 6.25 9.25 6.25a15.5 15.5 0 0 1-2.5 3.4" />
      <path d="M6.1 8.1A15.6 15.6 0 0 0 2.75 12S6.5 18.25 12 18.25a8.6 8.6 0 0 0 3.5-.75" />
      <path d="M4 4l16 16" />
    </>
  ),
  grid: (
    <>
      <rect x="3.75" y="3.75" width="7" height="7" rx="2.25" />
      <rect x="13.25" y="3.75" width="7" height="7" rx="2.25" />
      <rect x="3.75" y="13.25" width="7" height="7" rx="2.25" />
      <rect x="13.25" y="13.25" width="7" height="7" rx="2.25" />
    </>
  ),
  dots: (
    <>
      <circle cx="5.5" cy="12" r="1.4" />
      <circle cx="12" cy="12" r="1.4" />
      <circle cx="18.5" cy="12" r="1.4" />
    </>
  ),
} satisfies Record<string, ReactNode>

export type IconName = keyof typeof PATHS

const ACCOUNT_KIND_ICONS = {
  cash: 'wallet',
  bank: 'bank',
  mobile: 'phone',
  credit_card: 'card',
} as const satisfies Record<string, IconName>

/** The glyph that represents an account of a given kind. */
export function iconForAccountKind(kind: string): IconName {
  return ACCOUNT_KIND_ICONS[kind as keyof typeof ACCOUNT_KIND_ICONS] ?? 'wallet'
}

export function Icon({
  name,
  size = 20,
  className,
  strokeWidth = 1.8,
}: {
  name: IconName
  size?: number
  className?: string
  strokeWidth?: number
}) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
      className={className}
    >
      {PATHS[name]}
    </svg>
  )
}
