# UI/UX review — TakaKori

An audit of the app as built, with every claim below measured in a real browser
at phone widths rather than judged from the source. Written 6 October 2026,
against commit `ff82820`.

**How to read this.** Section 1 is the answer to a specific question you asked
about one element. Sections 2–4 are findings, ordered by how much they cost the
user. Section 5 is a short list of things that are working and should not be
touched. Section 6 is what I would do first.

Findings are marked:

- **P0** — costs the user money, data, or the ability to complete a task
- **P1** — visibly wrong, or breaks a stated rule of the design system
- **P2** — polish; real but cheap to defer
- **P3** — speculative; a judgement call, not a defect

---

## 1. The `p-1` list card — you were right, it is a bug

> _"why padding only 4px while top card has 20px"_

You found a real defect. The 4px was deliberate in one narrow sense and wrong in
every way that shows on screen.

**What was intended.** List cards get `p-1` (4px) instead of the default 20px so
the hairline dividers between rows run edge-to-edge like a native list, rather
than stopping 20px short and looking like floating rules. That part was right.

**What went wrong.** `.tk-row` has no horizontal padding of its own — only
`padding-block`. So the 20px of horizontal inset that makes card content line up
disappeared, and the rows inherited the 4px instead. Measured on your dashboard at
390px:

| Element                         | Left edge |
| ------------------------------- | --------- |
| Screen title ("Transactions")   | 20px      |
| Hero card eyebrow ("Spent in…") | 40px      |
| Nested balance card             | 56px      |
| **List row icon tile**          | **24px**  |
| **List row title**              | **82px**  |

Four different left edges on one screen. The row titles sit 62px further right
than the hero card's text while their icon tiles sit 4px further left — the two
halves of the same row point in opposite directions, and nothing in the list
lines up with anything above it. The tile being at 24px is the worst of it: the
icon almost touches the card's own edge.

This is exactly what a design system is supposed to make impossible, and it
happened because the padding lived on the container while the insets that matter
lived on the children. Two places to be right instead of one.

**The fix.** Rows should carry their own horizontal padding, and the list card
should have none:

```css
.tk-card {
  padding: 1.25rem;
}
.tk-list {
  padding: 0;
} /* dividers run full-bleed */
.tk-row {
  padding: 0.875rem 1.25rem;
} /* each row insets itself */
```

That makes the row's left edge land at 40px — flush with the hero card — while
the divider still runs from edge to edge, which was the original goal. One place
to be right.

I have **not** applied this. It changes the visual rhythm of every list in the
app and it is your call, not mine — see Recommendation 1.

---

## 2. Findings

### 2.1 P0 — `Save transaction` can sit under the tab bar

**Measured.** On `/transactions` at 390×844, scrolled to the bottom, the fixed
tab bar's top edge is at y=768 and **113 focusable elements have their centre
below that line**, including the form's own "Save transaction" button. Scrolling
to the very bottom of the page does not clear them.

**Why it matters.** `main` has `padding-bottom: 128px` against a nav that is
77px tall, so the _last_ element is clear. But the form sits in the middle of the
page, and the failure is not about the last element — it is that the nav is
`position: fixed` and covers whatever happens to be there when the user stops
scrolling. Any long screen has this; `/transactions` just has the most content
above the fold.

The `Save transaction` case is the expensive one: a user who fills the form,
scrolls to check the list, and taps where they believe the button is hits the tab
bar instead. Nothing tells them they missed.

**Fix.** Two parts, both cheap:

1. Give `main` a bottom padding derived from the nav's measured height rather
   than a hand-picked `128px`, so the two cannot drift apart.
2. For a form this long, the real fix is not padding — it is making the save
   action **sticky within the form**, so it is present regardless of scroll
   position. That is a design change, not a bug fix, so I have left it.

### 2.2 P0 — `.tk-caption` fails contrast in both schemes

**Measured** (WCAG 2.1 AA, text under 18.66px needs 4.5:1):

| Token                   | Light      | Dark       | Verdict      |
| ----------------------- | ---------- | ---------- | ------------ |
| `.tk-caption` (12px)    | **3.24:1** | **4.28:1** | FAIL both    |
| `.tk-btn-primary` label | **4.38:1** | 8.56:1     | FAIL light   |
| `.tk-label` (13px)      | 4.95:1     | 6.87:1     | pass         |
| `.tk-body` (15px)       | 4.51:1     | 7.51:1     | pass, barely |
| `.tk-title` (26px)      | 16.63:1    | 14.68:1    | pass         |

**Why it matters.** `--subtle` (`#7f929a`) carries `.tk-caption`, which is used
**56 times on `/transactions` alone** — every date, every category name, every
account name in a transaction row. At 12px, 3.24:1 is not "slightly soft grey",
it is genuinely hard to read outdoors, which is exactly the condition this app is
used in. This is the single highest-value fix in the document.

The primary button is the other one that matters, and it is close: 4.38:1 against
a 4.5:1 requirement, on the app's single most important control. Darkening
`--brand-600` one step fixes both without touching the logo relationship.

`.tk-body` passing at 4.51:1 is worth noting as a risk: it has 0.01 of headroom.
Any future darkening of `--canvas` breaks it.

### 2.3 P1 — the FAB sits on top of content it does not belong to

The floating add button overlaps the tab bar by design (ADR-028) and reads well
in isolation. In a screenshot it covers the boundary between the "Transactions"
and "Analytics" labels, and on `/transactions` it lands over the filter row. It is
a 56px target sitting on top of two other targets.

I would keep it — it is the right pattern and the right instinct — but it should
be tested against the _scroll position_ of a real list, not against a static
mock. On the current build it reads as a collision rather than a layer.

### 2.4 P1 — four small tap targets, two of which matter

**Measured** under 44px:

| Element          | Height   | Screen       | Assessment                         |
| ---------------- | -------- | ------------ | ---------------------------------- |
| Logo / home link | 34px     | all          | fine, large horizontal target      |
| "Sign out"       | 36px     | all          | fine                               |
| "Export CSV"     | 36px     | transactions | borderline — destructive-adjacent  |
| **"See all"**    | **17px** | dashboard    | **too small, and it's a real nav** |
| "See them"       | 16px     | reports      | too small                          |
| Segment items    | 40px     | reports      | borderline                         |

`See all` is the important one. It is a 17px-tall link that takes you to the
Transactions tab — the primary "I want to look at my spending" action on the home
screen, and the reason the FAB exists alongside it. It should be a 44px target
or a button, not a caption with an underline.

The 64 `sr-only` inputs reported under 44px are a false positive — they are
1px, visually hidden, and driven by their labels. Worth noting so nobody
"fixes" them later.

### 2.5 P1 — the transactions page opens with a form, not with data

`/transactions` is the second tab and its first screenful is the add-transaction
form. A user tapping "Transactions" to _see_ their spending gets a form. The
actual list — the reason they navigated — is below a six-field form.

This is a structural decision, and it is defensible for a "I came here to post
something" flow. But it means the FAB (`/transactions#add`) lands on a page where
the form is already open and at the top, so the FAB's only job is to scroll to
something already visible. The two entry points contradict each other.

Either the form collapses to a summary row that expands (letting the list own the
screen), or the FAB points somewhere else. Worth a decision rather than drift.

### 2.6 P1 — 13px secondary text is doing too much work

**Measured type sizes in use** across five screens: `12px`, `13px`, `14px`, `15px`,
`17.68px`, `18px`, `26px`, `32px`, `40px` — **nine distinct sizes**.

`17.68px` is the interesting one: nothing in the token set produces it. It is
`text-[1.05em]` in the logo lockup compounding with the parent's size, so the
wordmark's size depends on whatever wraps it. That is a token system leaking, and
it will drift further.

More broadly: 12px and 13px carry 140 elements on `/transactions`. A type scale
with three steps below 15px is not a scale, it is a set of nudges — and the two
smallest steps are the two that fail contrast (2.2). Collapsing 12px and 13px
into one step would fix the contrast failure and simplify the system at once.

### 2.7 P2 — the dashboard answers a different question than the tab implies

Home is the first tab, so it is the app's opening argument. It leads with
"Spent in October — ৳2,095.00 — No spending recorded last month."

"No spending recorded last month" is honest (I built it deliberately to avoid a
false "0% change"), but it is the _second_ thing on the screen and it reads as an
absence of data rather than a good result. The strongest true statement available
— you saved ৳2,905 this month — is demoted to the third tile.

A user opening a money app wants one sentence about whether they are okay. That
sentence is currently assembled from three tiles and a delta the user has to
interpret.

### 2.8 P2 — "Account" is doing three unrelated jobs

`/accounts` carries balances, the account-creation form, and navigation to
budgets/recurring/categories/reports. It is the tab labelled "Account" (singular,
about you) but it is also the settings screen and the planning hub.

This is a known consequence of the four-tab ceiling (ADR-028) and the right
trade for the constraint. But the _label_ is wrong: "Account" promises one thing.
"More" or "You" would describe the screen honestly without adding a tab.

### 2.9 P2 — no empty state is reachable in the seeded account

Every screen has a well-designed empty state, and I could not photograph one,
because the test account is full. Empty states are the screens a _new_ user sees
first, so they are currently the least-verified part of the app. I would want a
fresh account rendered at 320px before shipping.

### 2.10 P3 — speculative: the two-column desktop layout is under-used

At 1440px the dashboard shows a 1.55fr/1fr split that works, but the primary
column's cards are wide and sparse — a single row of transactions spanning 700px
with an amount marooned at the right. A three-column arrangement (figures /
transactions / planning) would use the space better. Not a phone problem, and
the phone is the priority, so this is last.

---

## 3. What the measurements say about consistency

Worth recording, because these are the things that _are_ holding together:

- **The 4px/20px padding defect is the only left-edge inconsistency.** Everything
  else lands on 20/40/56 or on a deliberate icon+title offset.
- **Vertical rhythm is consistent** — 20px between blocks, 12px between related
  items, via two tokens.
- **The wash, radii, and shadows are applied uniformly.** No screen deviates.
- **Every list uses the same card + hairline construction.** Six screens, one
  pattern.

So the system is doing its job everywhere except the one place where a child's
padding was assumed rather than declared.

---

## 4. Priority summary

| #   | Finding                                    | Sev    | Effort | Fix                                                           |
| --- | ------------------------------------------ | ------ | ------ | ------------------------------------------------------------- |
| 1   | List row padding misaligned (your finding) | P1     | S      | `.tk-row` gets horizontal padding; `.tk-list` gets none       |
| 2   | `.tk-caption` contrast 3.24:1 / 4.28:1     | **P0** | S      | Darken `--subtle`; it carries 56 elements on one screen       |
| 3   | Primary button label 4.38:1                | P0     | S      | Darken `--brand-600` one step                                 |
| 4   | Controls under the fixed nav               | P0     | M      | Derive `main` padding from nav height; consider a sticky save |
| 5   | "See all" is a 17px target                 | P1     | S      | Promote to a 44px target                                      |
| 6   | Transactions opens with a form             | P1     | L      | Decide: collapsed form, or repoint the FAB                    |
| 7   | Nine type sizes; `17.68px` is a leak       | P1     | M      | Collapse 12/13px; fix the logo's `em`                         |
| 8   | `.tk-body` at 4.51:1 has no headroom       | P2     | S      | Note it; re-check when `--canvas` changes                     |
| 9   | Dashboard's strongest fact is demoted      | P2     | M      | Lead with the month's outcome                                 |
| 10  | "Account" label under-describes the screen | P2     | S      | Consider "More"                                               |
| 11  | Empty states unverified on a fresh account | P2     | S      | Render at 320px with an empty account                         |
| 12  | Desktop could use a third column           | P3     | L      | Only after the phone is right                                 |

---

## 5. What is working — do not change

- **Income green / expense red / transfer neutral.** Conforms to a convention
  users already know, and transfer neutrality matches the ledger (ADR-005).
- **Tabular numerals on all money.** Non-negotiable and correctly applied.
- **The four-tab bar with a floating add.** The thumb-reach reasoning holds, and
  the FAB has an `aria-label` and a 56px target.
- **Every colour state has a word.** Budget states read "over" / "left" / "N%
  used" rather than relying on the bar's colour.
- **Empty states that name a next action.** Well-judged copy throughout.
- **Safe-area handling.** `viewport-fit: cover` plus
  `env(safe-area-inset-bottom)` on the nav, asserted by a test.
- **The layout guard.** `e2e/layout.spec.ts` caught two bugs I had already fixed
  the obvious instance of. It is the highest-leverage test in the repo.
- **No new dependencies.** The icon set and charts cost ~2 KB and 0 KB of JS
  respectively against ~100 KB for the obvious alternatives.
- **Dark mode.** Every surface re-derives from tokens; no component carries a
  `dark:` variant. It is genuinely maintained, not a flipped filter.

---

## 6. What I would do, in order

**This week (small, high-confidence):**

1. Fix the list padding (§1). You found it; it is a two-line change and it
   touches six screens.
2. Darken `--subtle` until `.tk-caption` clears 4.5:1 in both schemes, and
   `--brand-600` one step for the button label. Two values, whole-app effect, and
   it fixes the only P0 that is purely visual.
3. Promote "See all" to a proper target.

**This month:**

4. Derive the nav clearance from the nav's measured height rather than a literal.
5. Collapse the 12/13px type steps into one; fix the logo's `1.05em`.
6. Settle the transactions-page question (§2.5) — it is a real product decision,
   not a styling one, and it should be yours.

**Before launch:**

7. Render every screen with a **fresh empty account** at 320px. The empty states
   are a new user's first impression and they are the least-verified surfaces in
   the app.
8. Re-run the contrast check. `.tk-body` at 4.51:1 means the next palette tweak
   will silently break it.

---

## Appendix — how these were measured

Not from reading the code. Chromium via Playwright, at 390×844 with
`isMobile: true`, signed in against the linked Supabase project:

- **Overflow** — `documentElement.scrollWidth` vs `clientWidth`, plus a
  per-element bounding-box sweep, at 320/360/390/412px on all 7 routes and 4
  public routes. Now asserted in `e2e/layout.spec.ts`.
- **Alignment** — collected every element with direct text content, bucketed by
  `getBoundingClientRect().left`, and reported each distinct edge with three
  sample selectors. That table in §1 is that output.
- **Contrast** — computed relative luminance per WCAG 2.1, resolving each
  element's effective background by walking ancestors until an opaque colour is
  found, with the 4.5:1 / 3:1 threshold chosen by computed font-size and weight.
- **Tap targets** — every `a`, `button`, `select`, `input`, `summary` and
  `[role=button]` with a non-zero box, excluding fixed-position elements.
- **Type scale** — counted distinct `font-size / font-weight` pairs across
  `main` and `header`.

The audit scripts were throwaway and have been deleted; `e2e/layout.spec.ts` is
the only thing committed from this review.

**Not measured here, and worth doing:**

- **WebKit / real iOS.** Every finding above is Chromium. The 16px-field fix is
  aimed at iOS Safari's auto-zoom and cannot be verified from here at all. Test
  the PWA on a real device in standalone mode, where
  `env(safe-area-inset-bottom)` resolves differently from a browser tab.
- **Screen reader output.** VoiceOver and TalkBack were not run. The
  `aria-current`, `role="alert"` and `aria-pressed` usage looks right on
  inspection; inspection is not testing.
- **Real users.** Section 2.7 is my judgement about what the dashboard should
  lead with. It is a guess until someone who tracks their own money says
  otherwise.
