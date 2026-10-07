import { ReportsData } from '@/components/reports/ReportsData'

/**
 * Reports.
 *
 * **This is the first screen that no longer renders without JavaScript, and it is
 * a real cost rather than an oversight.**
 *
 * The other converted screens kept their headings and links server-rendered, so a
 * reader without JavaScript still got a meaningful document. Reports cannot: the
 * period control lives in `ReportsData`, and so does everything derived from it,
 * because the range is resolved from the profile's timezone — which is a client
 * read now. Splitting the header out and leaving the figures behind would give a
 * page with a period selector and no numbers under it, which is worse than an
 * empty page: it looks broken rather than unavailable.
 *
 * So the choice was "shell and figures together, or neither". For a screen whose
 * entire content is aggregates of the user's own transactions, neither is the more
 * honest of the two, and no reader who cannot run JavaScript can use this screen
 * anyway.
 *
 * The period control is still real `<a>` elements rather than click handlers, so
 * the range is chosen by a genuine navigation when the bundle is merely slow.
 */
export default function ReportsPage() {
  return (
    <div className="tk-stack">
      <ReportsData />
    </div>
  )
}
