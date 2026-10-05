# Brand Design

Load this before adding or changing any UI in TakaKori.

The reasoning behind these rules is in `docs/design-system.md`. The tokens are
in `src/app/globals.css`. This file is the operational version: what to reach
for, and what will get the work rejected.

---

## Hard rules

Violating one of these produces a UI that looks subtly wrong and reads as
generic, which is worse than looking broken because it is hard to see why.

1. **Never use a raw palette class on a component.** `text-emerald-700`,
   `bg-neutral-900`, `border-slate-200` — none of these. Use the role class
   (`tk-income`, `tk-muted`, `tk-card`) or the token utility
   (`text-content`, `bg-surface`). Roles survive a rebrand; palette slots do not.

2. **Never write a `dark:` variant.** Dark mode is one block of variable
   overrides in `globals.css`. If a component needs `dark:`, a role is missing
   from the token set — add the role, not the variant.

3. **Never render money in a proportional font.** `.tk-money`, `.tk-money-lg`,
   `.tk-amount*` all set `tabular-nums`; `TextField money` for inputs. Format
   through `formatMinor`. No arithmetic outside `lib/money.ts`.

4. **Income is `tk-income`, expense is `tk-expense`, transfer is `tk-neutral`.**
   Never `amountClass()` or `amountSign()` with a hand-rolled conditional, and
   never a transfer in either of the other two.

5. **Colour is never the only channel.** Every state that has a colour also has a
   word ("over", "left") or a shape. Check it in greyscale.

6. **Minimum 48px tap target.** `.tk-btn` is 48px. Anything smaller is `.tk-btn-sm`
   and needs a reason.

7. **Never let a field compute under 16px.** iOS zooms the page in on focus and
   never zooms back out, which leaves the fixed tab bar sitting over the content
   and the page scrollable sideways — it looks exactly like a broken bottom nav.
   This includes `sr-only` inputs. `maximum-scale` does not prevent it; Safari
   has ignored `user-scalable=no` since iOS 10.

8. **Never introduce horizontal overflow.** `scrollWidth === clientWidth` on
   every screen. The three ways this keeps happening: a grid track with no
   explicit column (`auto` floors at min-content, and a row's min-content is
   ~430px), a `.tk-row` nested inside a `.tk-row` (the inner flex item gets
   `min-width: auto` and refuses to shrink), and four or more options in a
   fixed `.tk-segment` (use `.tk-segment-scroll`).
   `e2e/layout.spec.ts` fails on all three.

9. **Compose from the ten primitives** in `src/components/ui/`. Do not invent a
   new card, row, field or icon. If the shape you need is genuinely missing, add
   it to the system — do not special-case it in one screen.

10. **The tab bar has four tabs.** Home, Transactions, Analytics, Account. New
    destinations go under Account, not onto the bar.

---

## Before you start

Check whether the thing you are building already exists:

```bash
# what primitives are there
ls src/components/ui/
# whether a similar screen exists
ls src/app/\(dashboard\)/
```

Ten primitives and a `.tk-*` class in `globals.css` cover every screen built so
far. A new component is a last resort, and a new colour is nearly always a
symptom of a missing role.

---

## Screen skeleton

```tsx
export default async function SomePage() {
  const data = await requireSomething()

  return (
    <div className="tk-stack">
      <PageHeader eyebrow="Context" title="Screen">
        Sub-heading: a date range, a count, a caveat.
      </PageHeader>

      {/* Cards */}
      <section className="tk-card">…</section>

      {/* Lists: one card, hairline dividers, not a stack of cards */}
      <ul className="tk-card flex flex-col divide-y divide-hairline p-1">
        {items.map((i) => (
          <li key={i.id}>
            <Row icon="tag" title={i.name} subtitle={i.meta} trailing={…} />
          </li>
        ))}
      </ul>

      {/* Forms */}
      <section className="tk-card">
        <SomeForm />
      </section>
    </div>
  )
}
```

`tk-stack` sets the vertical rhythm. Do not add `gap-*` to a screen's root
container — that fights the token.

---

## Choosing a control

| Situation                                      | Control                                 |
| ---------------------------------------------- | --------------------------------------- |
| 2–3 mutually exclusive options, switched often | `SegmentedControl`                      |
| A long list the user looks up                  | `SelectField`                           |
| A row that navigates                           | `RowLink` (whole row is the link)       |
| A row with a trailing figure                   | `Row` + `trailing`                      |
| One number as a share or a ratio               | `ProgressRing`                          |
| Comparing several values over time             | `MonthlyTrend` (CSS bars)               |
| An empty result                                | `EmptyState`, always with a next action |

The frequency test for a segmented control: would a user change this more than a
few times a session? Then it should not cost a three-tap dropdown.

---

## Money on screen

```tsx
// a hero figure
<p className="tk-eyebrow">Spent in {monthLabel(month.from)}</p>
<p className="tk-money-lg">{formatMinor(minor, { currency })}</p>

// a figure in a list
<span className={amountClass(t.type)}>
  {amountSign(t.type)}
  {formatMinor(toMinor(t.amount), { currency, withSymbol: false })}
</span>
```

`amountClass` and `amountSign` exist so the transfer case is handled in exactly
one place. If you find yourself writing `t.type === 'income' ? … : …` in a
template, one of the two is wrong.

A sign is `+` or `−` (U+2212 MINUS SIGN, not a hyphen) so negative amounts
align in a column.

---

## Form fields

`TextField`, `PasswordField` and `SelectField` from `ui/Field.tsx` handle the
label, the error message, `aria-invalid` and `aria-describedby` together. Using
them is not tidiness: hand-rolling that wiring in eight forms is how a
validation message ends up visible to a sighted user and invisible to a screen
reader.

Labels go **above** the control. Beside is tidier on a desktop form and worse on
a phone, where it either wraps or squeezes the input.

The amount field gets `money`:

```tsx
<TextField name="amount" label="Amount" inputMode="decimal" money required />
```

---

## Icons

`ui/Icon.tsx`. Twenty-odd glyphs, 24×24, stroke only, `currentColor`. Do not
import an icon library — see the performance note in `docs/design-system.md`.

```tsx
<Icon name="target" size={18} />
```

An icon never stands alone as the only label on a control, except where it is
inside a labelled row or a `SegmentedControl` item.

---

## Adding a colour

If a screen needs a colour that no role covers, the role is missing. Add it to
`globals.css` in both schemes and expose it in `@theme inline`. Do not reach
for a palette class.

For a user-defined thing like a category, use `toneFor(name)` from
`src/lib/tone.ts` — six categorical hues, derived from the name so a category
keeps its colour everywhere.

---

## Before you report complete

- [ ] No raw palette classes (`emerald-`, `neutral-`, `slate-`, `gray-`, `red-`
      outside `.tk-` and token classes)
- [ ] No `dark:` variants
- [ ] Every money figure is `tabular-nums` and formatted by `formatMinor`
- [ ] Transfers render neutral
- [ ] Every coloured state also has a word or a shape
- [ ] Tap targets ≥ 48px
- [ ] No field computes under 16px, including `sr-only` ones
- [ ] No horizontal overflow at 320px (`e2e/layout.spec.ts`)
- [ ] `prefers-reduced-motion` respected (only via the shared `--ease-brand`
      and the `tk-*` transitions — do not add bespoke keyframes)
- [ ] Dark mode legible: check every new surface against a dark background
- [ ] Empty state says what to do next
- [ ] `npm run verify` passes

---

## Things that will get the work rejected

Adding an icon library. Adding a charting library. A purple gradient that is not
the logo's green. A hero with three feature cards. A centred title. A 1px border
on every card. A shadow with a positive offset. A new font. Money in a
proportional font. Colour as the only signal. A card per row in a list instead
of one card with dividers.
