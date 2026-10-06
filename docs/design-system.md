# Design system

How TakaKori looks, and why. Read this before designing a screen or adding a
component. The tokens live in `src/app/globals.css` and the operational rules
live in `.opencode/skills/brand-design/SKILL.md` — this document is the
reasoning that connects them.

If you change a value here, change it there too. Three copies of the truth is
one more than a codebase can hold.

---

## 1. The position

TakaKori is a personal finance tracker for people in Bangladesh, used on a
phone, on a metered connection, often one-handed, often in a hurry. Every
decision below follows from that.

The two failure modes this system exists to prevent:

**Generic.** Interchangeable purple gradients, a hero with a stock gradient and
three feature cards, icons in circles for no reason. It renders correctly and
communicates nothing, because nothing about it is a decision. It also fails
review: nobody can say why any of it is there.

**Illegible at arm's length.** A 12px grey label, a 32px tap target, an amount
in a proportional font. Correct on a 27-inch monitor, unusable on a 6-inch
phone in daylight.

The rules that follow are chosen against those two.

---

## 2. Colour

### 2.1 The palette comes from the logo

The logotype is a dark ink and an emerald. Those two are the brand, and the
interface is built from them rather than from a palette borrowed from a
template.

| Ramp        | Role                                                          |
| ----------- | ------------------------------------------------------------- |
| `--ink-*`   | Text and near-black surfaces. The wallet body's colour.       |
| `--brand-*` | Primary action, income, the wash, the tab bar's active state. |

`--brand-600` (`#0a8a5b`) is the single most important colour in the app: it is
the primary button, the active tab, the progress fill, and the manifest's
`theme_color`. It is chosen for contrast on white (≈3.9:1 for the button's
white label, ≥4.5:1 for `brand-700` text) and for being unmistakably the same
hue as the logo's green.

### 2.2 Roles, not palette slots

Every colour a component can use is a **role**: `surface`, `canvas`, `content`,
`muted`, `accent`, `income`, `expense`, `warning`.

```css
/* wrong — a decision that has to be reversed by hand */
text-emerald-700

/* right — a role that survives a rebrand */
class="tk-income"
```

Roles are resolved through CSS custom properties in `@theme inline`, which means
a single component class works in both colour schemes with no `dark:` variants
anywhere in the codebase. Dark mode is one block of variable overrides in
`globals.css`, not a parallel set of styles to keep in sync.

### 2.3 Income is green, expense is red, and that is not negotiable

Users read finance lists by colour before they read the words. Green for income
and red for expense is the convention so well established that inverting it
costs every user a moment of comprehension.

**Transfers get neither.** They render in `muted`. A transfer is money moving
inside the user's own world, not money entering or leaving it, and colouring it
green inflates the apparent income of a month that only saw a transfer between
two of the user's own accounts. This is the same rule the ledger follows
(ADR-005); the display has to agree with the accounting or it is lying about
something more important than a colour.

### 2.4 The wash

Every screen opens with a soft emerald gradient behind the header, fading to
nothing by about 400px down the page.

It is the reason the app looks like one thing. Navigation between tabs feels
like moving within a surface rather than loading a document, and it carries the
brand without a logo being the loudest element on the screen. It is defined
once, absolutely positioned, `pointer-events: none`, and sits behind every
screen in both the authenticated and auth shells.

It is not decoration on top of a card. It never overlaps content, never sits
behind text, and never changes per screen.

### 2.5 Categorical hues

Six tones — `brand`, `sky`, `amber`, `rose`, `violet`, `teal` — for user-defined
things like categories.

Six, not twelve: past six, tiles in a grid stop being tellable apart, and a
category grid is scanned in rows rather than compared pairwise. Each tone's fill
is the hue mixed into the current surface, so one class works in both schemes.

The hue for a category is derived from its **name**, not its id or position
(`src/lib/tone.ts`). Adding a category in the middle of an alphabetical list
must not recolour half the grid.

---

## 3. Typography

One family, **Geist**, at five sizes and three weights. A second family would
cost a font download on a metered connection to say nothing.

| Token         | Size / weight | Use                                        |
| ------------- | ------------- | ------------------------------------------ |
| `.tk-title`   | 26 / 600      | The one `h1` per screen. Never twice.      |
| `.tk-section` | 15 / 600      | Section and card headings.                 |
| `.tk-body`    | 15 / 400      | Body copy, row titles.                     |
| `.tk-label`   | 14 / 500      | Form field labels.                         |
| `.tk-eyebrow` | 13 / 500      | The grey line above a figure.              |
| `.tk-caption` | 13 / 400      | The grey line below a figure, row meta.    |
| `.tk-badge`   | 12 / 600      | A badge. Often the only label a state has. |

**Nothing is below 12px, and there is no 12px/13px split for two roles that read
the same.** The scale previously carried a 12px caption in `--subtle` beside a
13px eyebrow in `--muted`, which was both a hierarchy nobody could perceive and
the token that failed WCAG AA — 3.24:1 on white, carrying 56 elements on
`/transactions` alone. One step (13px) and one grey (`--muted`) fixed the
contrast and collapsed two visually identical sizes at once. `--ink-400` moved
down to `#5f717a` and `--ink-500` to `#566a72` so both clear 4.5:1 with headroom.

If you find yourself wanting a 12px or a 11px caption, you want `.tk-badge`, or
you want to delete the text.

### 3.1 Money is its own scale, and always tabular

`.tk-money` (32/600) and `.tk-money-lg` (40/600) exist only for money, and both
set `font-variant-numeric: tabular-nums` without exception.

Not a preference. Columns of taka that change width as digits change are
impossible to scan, and this app is columns of taka. A proportional figure is a
bug here even when it looks fine in isolation.

`.tk-field-money` applies the same rule to the amount input, because a user
correcting the fourth digit needs the digits to stay where they were.

Money is formatted by `formatMinor` and never by arithmetic elsewhere
(ADR-004, ADR-011).

### 3.2 Titles are left-aligned at every breakpoint

Centred titles read well for two words and collapse into two centred lines the
moment a title wraps. "Recurring transactions" wraps.

---

## 4. Shape

Corners are the brand's voice as much as colour is.

| Token            | Radius | Applies to                             |
| ---------------- | ------ | -------------------------------------- |
| `--radius-tile`  | 16px   | Icon tiles.                            |
| `--radius-card`  | 24px   | Cards, sheets, empty states.           |
| `--radius-field` | 14px   | Inputs and selects.                    |
| `--radius-pill`  | 999px  | Buttons, chips, segments, nav, badges. |

The rule: **containers are round, controls are round, fields are tightened.**
Anything sharper reads as a different product. Cards at 24px on a phone is what
makes a list of them feel like one continuous surface rather than a stack of
bills.

### 4.1 No borders on cards

Cards sit on `--canvas` and carry a soft, large-blur shadow. A 1px border around
every card makes a dense screen look like a form.

Borders appear only as `.tk-divider` — a hairline _between_ things inside a
surface. It separates without adding a second edge.

### 4.2 Shadows are wide, soft and low-contrast

`--shadow-card` is `0 1px 2px` at 4% plus `0 10px 30px -18px` at 18%. The
second shadow is doing the work and its offset is negative, meaning it is
tighter than the blur — that is what produces a shadow that reads as ambient
rather than as a hard object lifted off the page.

---

## 5. Layout

### 5.1 Mobile is the design; desktop is the accommodation

The primary navigation is a **bottom tab bar with a floating add button**. Top
navigation is a desktop pattern that puts every destination one row deep; on a
390px screen that row either scrolls or shrinks to illegibility.

Four tabs, deliberately: Home, Transactions, Analytics, Account. Anything that
does not fit is reached from Account, whose job is "everything about you and
your setup". Five or seven tabs is not more navigable; it is a menu with icons.

From `md` up, the tabs move into the header and the bar disappears. A fixed
bottom bar on a desktop window covers content and cannot be dismissed.

The floating add button sits _above_ the bar rather than in it. It is the one
thing a user opens the app to do, and burying it in a row of peers makes it a
target they have to aim at. It sits at the bar's **right edge**, not its centre:
centred, it straddled the boundary between the "Transactions" and "Analytics"
labels and landed on top of two other targets. The thumb still reaches the
bottom-right corner — it is the side the hand already grips.

It links to `/transactions?sheet=add` rather than opening a sheet directly, so it
keeps working before hydration and the back button closes the sheet.

`--nav-height` and `--nav-clear` are declared together in `globals.css` and the
bar is sized from `--nav-height`, because `main`'s clearance used to be a literal
`128px` against an implicit ~77px bar. Nothing can tell those apart in review; a
measurement on a 390×844 screen found **113 focusable elements whose centre sat
under the bar**, including the transaction form's own save button.

From `md` up the bar disappears — but the transactions screen still needs a way
to add, so `PageHeader` carries an Add action there. A mobile-only trigger is a
missing feature on desktop, not a responsive detail.

### 5.2 Safe areas

`viewportFit: 'cover'` and `env(safe-area-inset-bottom)` on the tab bar, on the
main column's bottom padding, and on a sheet's footer. Without all three, the home
indicator sits on top of the last row of a list — or the last button of a modal —
and the app looks broken in exactly the situation it was designed for.

### 5.3 No field renders under 16px

**The most important rule on this page, and the least visible in review.**

iOS Safari zooms the _page_ in whenever a focused field computes under 16px, and
it does not zoom back out when focus leaves. What you get is a permanently
zoomed viewport: the fixed tab bar is sized against the visual viewport rather
than the layout one, so it sits over the content, and a layout built for 390px
is being read at an effective ~300px with a horizontal scrollbar. It looks
exactly like a broken bottom nav.

Three separate causes shipped here before it was found, so it is enforced by a
test rather than by convention:

| Element            | Was  | Cause                                                                                   |
| ------------------ | ---- | --------------------------------------------------------------------------------------- |
| `.tk-field`        | 15px | Set to match the 13px label rhythm                                                      |
| `input[type=date]` | 15px | Same                                                                                    |
| `input.sr-only`    | 14px | Inherited from the label — a keyboard user tabbing to the type selector zoomed the page |

`maximumScale: 1` is set in the viewport export, but it **does not prevent this
on iOS** — Safari has ignored `user-scalable=no` since iOS 10. Field size is the
only thing that works there.

Disabling pinch-zoom is a WCAG 1.4.4 failure. It is accepted because a zoomed
state of this layout is genuinely unusable and there is no dense content that
benefits from zooming, but it should be revisited if the app ever gains
long-form reading or a data table.

### 5.4 Horizontal overflow is a bug, not a layout choice

`documentElement.scrollWidth` must equal `clientWidth` on every screen. A page
that pans sideways is broken, and it is invisible in code review.

Four distinct causes appeared here, each of which looked correct in isolation:

- **A grid track with no explicit columns.** The implicit track is `auto`, floored
  at its content's min-content width. A transaction row's min-content is ~430px,
  so a 390px phone got a 459px-wide page. Use `grid-cols-1` or `minmax(0, 1fr)`.
- **`sr-only` inside a scroll container.** `sr-only` is `position: absolute`, so
  with no positioned ancestor its containing block is the _viewport_: the hidden
  radios landed past the right edge and widened the document even though the
  segment itself scrolled correctly. The scroll container needs
  `position: relative`.
- **Nested flex rows.** A `.tk-row` inside a `.tk-row` gives the inner one
  `min-width: auto`, so it refuses to shrink below its own min-content. One flex
  row per row — `RowContents` exists for exactly this.
- **Too many options for a fixed segment.** Four or more labels do not fit 320px;
  use `.tk-segment-scroll` rather than letting the control overflow its card.

`e2e/layout.spec.ts` asserts all of this at 320/360/390/412px.

### 5.5 Rhythm

`.tk-stack` for 20px between blocks, `.tk-stack-tight` for 12px between related
items, `.tk-shell` for the 20/24px side gutters and the three column widths
(30rem phone, 48rem tablet, 72rem desktop).

20px gutters, not 16px: 16px is a device inset, and matching it makes content
look like it is escaping the screen.

### 5.6 One left edge: 20, 40, or 98

Every screen has exactly three left edges, and knowing which is which is most of
the alignment work:

| Left edge | What sits there                                         |
| --------- | ------------------------------------------------------- |
| **20px**  | The page gutter. Page titles, section headings.         |
| **40px**  | Card content, and a row's icon tile.                    |
| **98px**  | A row's title and subtitle — 40 + 44px tile + 14px gap. |

Anything else is a bug. A screen that shows five different left edges is not
expressive, it is unaligned.

**Rows carry their own horizontal padding, not their container.** `.tk-list`
removes a card's padding; `.tk-row` supplies `0.875rem 1.25rem`. An earlier
version put `p-1` on the list and left rows with vertical padding only, which
put list content at 24px while card content sat at 40px — the defect that had a
`ul.tk-card` and its first child disagreeing about where the margin was.

The consequence worth keeping: the hairline dividers between rows run edge to
edge while the content stays on 40px. Inset content, full-bleed separators —
the pattern iOS and Android lists both use, and it only works if the inset lives
on the row.

---

## 6. Components

Twelve primitives. Compose them. If a screen needs a shape that is not here, the
shape is missing from the system rather than the screen needing to improvise.

| Component            | File                        | Notes                                         |
| -------------------- | --------------------------- | --------------------------------------------- |
| `PageHeader`         | `ui/PageHeader.tsx`         | Owns the `h1`. One per screen.                |
| `Row` / `RowLink`    | `ui/Row.tsx`                | Icon tile, title, subtitle, trailing, action. |
| `StatTile`           | `ui/StatTile.tsx`           | Icon, value, label. Value is second.          |
| `Modal`              | `ui/Modal.tsx`              | Bottom sheet. Focus trap and Escape are free. |
| `ConfirmDeleteSheet` | `ui/ConfirmDeleteSheet.tsx` | Destructive confirmation. Cancel is default.  |
| `RowActionsSheet`    | `ui/RowActionsSheet.tsx`    | A row's own Edit / Delete.                    |
| `SegmentedControl`   | `ui/SegmentedControl.tsx`   | 2–3 mutually exclusive options.               |
| `TextField` etc.     | `ui/Field.tsx`              | Label, error, `aria-describedby`.             |
| `ProgressRing`       | `ui/ProgressRing.tsx`       | One number, one ring.                         |
| `Icon`               | `ui/Icon.tsx`               | Hand-rolled, 24×24, stroke only.              |
| `Logo`               | `ui/Logo.tsx`               | Mark or lockup, theme-aware.                  |
| `Alert`              | `ui/Alert.tsx`              | Tinted fill, never a border plus a fill.      |
| `EmptyState`         | `ui/EmptyState.tsx`         | Dashed outline, always says what to do.       |

### 6.1 Modals are sheets, built on `<dialog>`

Three rules, each of which exists because ignoring it produced a specific bug:

**1. A create form is a sheet, never a section.** The Transactions screen is the
second tab. A user tapping it to _see_ their spending was met by a six-field
form occupying the whole first screenful. The list is the screen; the form is an
interruption of it, so it interrupts. `/accounts` follows the same rule, which is
what lets the tab label "Account" be honest about what the screen is.

**2. Build on `<dialog>`, not a div.** The things a modal must get right are
behaviours, not styles: focus trapped and moved in, Escape to close, the rest of
the page inert, and rendering above every `z-index` including the fixed tab bar.
Reimplementing those is how modals end up looking perfect in a screenshot and
being unusable with a keyboard. One consequence to respect: never declare
`display` on `.tk-modal` unconditionally — it overrides the UA's
`dialog:not([open]) { display: none }` and closed sheets stay painted. Scope it to
`.tk-modal[open]`.

**3. The primary action goes in a pinned footer.** A long form's save button at
the end is a target the user has to go looking for; pinned, it is present at
every scroll position. It is a `<button form="…">` pointing at the body form by
id — the HTML `form` attribute is what lets one form span two elements.

**And the fields are controlled.** React resets an uncontrolled `<form>` once its
action resolves, _including when the action fails_. Uncontrolled fields therefore
wipe everything on a validation error and leave the user retyping the form beside
the message explaining what they got wrong. Hold the draft in a child component
that is mounted only while the sheet is open — remounting then _is_ the reset, so
there is no reset effect and no `setState` inside one.

Sheet state lives in the URL (`?sheet=add`), not in React state. The trigger can
therefore be a real `<Link>` that works before hydration, and the back button
closes the sheet, which is what a user pressing back on a modal expects.

### 6.2 One action target per row

A row that shows its own Edit _and_ Delete links carries two 44px hitboxes, and
the link text makes it ~40% taller — on every row of a fifty-row list, for
actions a user runs once or twice a year, with a mis-tap sitting in a list of
financial records.

So: one `⋯` button, which opens a `RowActionsSheet` with two 56px options. Delete
sits behind two deliberate taps, which is the right friction for something with no
undo.

The button hugs the amount (`-ml-1.5` against the row's own gap). Without that it
costs the title 54px, enough that the _date_ — the most useful word on the line —
truncates at 390px.

### 6.3 Why segmented controls, and when

The test is frequency, not count: a period is changed many times a session and
should not cost a three-tap dropdown; an account is chosen once and looked up
among many.

There is no Apply button anywhere. Every filter applies on change, because a
filter that needs confirming is a filter that is not being used.

### 6.2 `sr-only` inputs are not an accessibility afterthought

The segmented control's radio is visually hidden inside its own label. Two
reasons, and the second one surprises people:

1. Keyboard arrow-key navigation works, and the label is the tap target.
2. **A test cannot drive the input directly.** `check()` rejects an invisible
   element, and `check({ force: true })` is worse than useless: it dispatches a
   mouse event at the clipped input's coordinates, where nothing is painted, so
   React never sees the change and the form silently keeps the previous value.
   Click the label. This is recorded in `e2e/flows.spec.ts`.

### 6.3 Colour is never the only channel

Every state that has a colour also has a word or a shape. Over budget is a
`tk-badge-expense` saying "over", not just a red bar. Income and expense bars
keep different corner shapes so they survive greyscale. Charts are `role="img"`
with a label, plus a real table of the figures underneath.

---

## 7. Voice

Direct, specific, and about the user's money rather than about the app.

- **"Nothing matches these filters. Widen the period, or clear the filters."**
  — says what happened and what to do.
- **"You kept ৳2,905 in October."** / **"You overspent ৳1,240 in October."** — the
  dashboard's first line is the month's _outcome_ in words and a figure, not a
  bare "Spent". A user opening a money app wants one sentence about whether they
  are okay. Spending is the supporting detail underneath. Overspending leads with
  the overspend, because that is the case that needs a decision.
- **"First month tracked"** — where a month-over-month badge would otherwise show
  "0%", which is a claim, and a false one.
- **"This cannot be undone."** — the delete confirmation says what is lost. "Are
  you sure?" reports the app's uncertainty; this tells the user what will happen.
- **"At ৳412.50 a day you reach ৳8,250 by month end."** — a forecast the user
  can act on, not "70% used".
- Never "Oops!", never "Something went wrong", never an exclamation mark.
- Bangla is written in Latin digits with the taka sign, which is what
  `formatMinor` produces (ADR-009). The UI copy is English; the numbers are
  formatted the way the user reads them.

Every empty state names a next action. "No transactions yet" is a dead end;
"No transactions yet — add your first one" is an instruction.

---

## 8. Performance

The app is used on metered connections, so:

- **No icon library.** `ui/Icon.tsx` is ~30 hand-drawn glyphs, ~2 KB, tree-shaken
  into one module. The alternative is a package and its bundler assumptions.
- **No charting library.** `components/reports/Charts.tsx` is CSS and SVG. A
  charting package would add roughly 100 KB of client JavaScript to answer
  "two bar series".
- **Icons are inline SVG, not an image request.**
- **Server Components by default.** A screen is a client component only where it
  genuinely needs state.

If either of these decisions is wrong, there is one file to replace in each case.

---

## 9. Anti-patterns

| Don't                                   | Do instead                                    |
| --------------------------------------- | --------------------------------------------- |
| `text-emerald-700`                      | `class="tk-income"`                           |
| A 1px border on a card                  | Card on canvas, soft shadow                   |
| A chart library for two bar series      | CSS bars; the data is already a table         |
| Colour-only state                       | Colour **and** a word or a shape              |
| A `<select>` for two options            | Segmented control                             |
| A 40px tap target                       | 48px minimum, every time                      |
| A centred title                         | Left-aligned at every breakpoint              |
| An icon with no label                   | Icon plus text                                |
| "0% change" against an empty comparison | "First month tracked"                         |
| A new font                              | Geist, at a new weight or size                |
| `<select>` styled per-screen            | `.tk-field` / `fieldClass()`                  |
| An inline create form on a tab screen   | A sheet; the list owns the screen             |
| A `<div>` overlay                       | `<dialog>` + `showModal()`                    |
| Uncontrolled fields in a form action    | Controlled, in a child mounted while open     |
| Two action links on every row           | One `⋯` opening a `RowActionsSheet`           |
| 12px caption text                       | 13px; or `.tk-badge` if it is a label         |
| `pb-32` guessed against a ~77px bar     | `--nav-clear`, declared beside `--nav-height` |
