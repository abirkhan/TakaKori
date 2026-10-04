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

One family, **Geist**, at four sizes and three weights. A second family would
cost a font download on a metered connection to say nothing.

| Token         | Size / weight | Use                                   |
| ------------- | ------------- | ------------------------------------- |
| `.tk-title`   | 26 / 600      | The one `h1` per screen. Never twice. |
| `.tk-section` | 15 / 600      | Section and card headings.            |
| `.tk-body`    | 15 / 400      | Body copy, row titles.                |
| `.tk-eyebrow` | 13 / 500      | The grey line above a figure.         |
| `.tk-caption` | 12 / 400      | The grey line below a figure.         |

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
target they have to aim at.

### 5.2 Safe areas

`viewportFit: 'cover'` and `env(safe-area-inset-bottom)` on the tab bar and the
main column's bottom padding. Without both, the home indicator sits on top of
the last row of a list and the app looks broken in exactly the situation it was
designed for.

### 5.3 Rhythm

`.tk-stack` for 20px between blocks, `.tk-stack-tight` for 12px between related
items, `.tk-shell` for the 20/24px side gutters and the three column widths
(30rem phone, 48rem tablet, 72rem desktop).

20px gutters, not 16px: 16px is a device inset, and matching it makes content
look like it is escaping the screen.

---

## 6. Components

Ten primitives. Compose them. If a screen needs a shape that is not here, the
shape is missing from the system rather than the screen needing to improvise.

| Component          | File                      | Notes                                    |
| ------------------ | ------------------------- | ---------------------------------------- |
| `PageHeader`       | `ui/PageHeader.tsx`       | Owns the `h1`. One per screen.           |
| `Row` / `RowLink`  | `ui/Row.tsx`              | Icon tile, title, subtitle, trailing.    |
| `StatTile`         | `ui/StatTile.tsx`         | Icon, value, label. Value is second.     |
| `SegmentedControl` | `ui/SegmentedControl.tsx` | 2–3 mutually exclusive options.          |
| `TextField` etc.   | `ui/Field.tsx`            | Label, error, `aria-describedby`.        |
| `ProgressRing`     | `ui/ProgressRing.tsx`     | One number, one ring.                    |
| `Icon`             | `ui/Icon.tsx`             | Hand-rolled, 24×24, stroke only.         |
| `Logo`             | `ui/Logo.tsx`             | Mark or lockup, theme-aware.             |
| `Alert`            | `ui/Alert.tsx`            | Tinted fill, never a border plus a fill. |
| `EmptyState`       | `ui/EmptyState.tsx`       | Dashed outline, always says what to do.  |

### 6.1 Why segmented controls, and when

Two or three mutually exclusive options a user switches between constantly →
segmented control. Period presets, transaction type, category type.

More than three, or a long list someone has to look up → `SelectField`. Account,
category.

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
- **"No spending recorded last month."** — states the absence rather than
  showing "0% change", which would be a claim, and a false one.
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

| Don't                                   | Do instead                            |
| --------------------------------------- | ------------------------------------- |
| `text-emerald-700`                      | `class="tk-income"`                   |
| A 1px border on a card                  | Card on canvas, soft shadow           |
| A chart library for two bar series      | CSS bars; the data is already a table |
| Colour-only state                       | Colour **and** a word or a shape      |
| A `<select>` for two options            | Segmented control                     |
| A 40px tap target                       | 48px minimum, every time              |
| A centred title                         | Left-aligned at every breakpoint      |
| An icon with no label                   | Icon plus text                        |
| "0% change" against an empty comparison | "No spending recorded last month."    |
| A new font                              | Geist, at a new weight or size        |
| `<select>` styled per-screen            | `.tk-field` / `fieldClass()`          |
