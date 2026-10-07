-- Fix: 'yearly' was walking one MONTH at a time.
--
-- `private.recurring_add` special-cased 'daily' and 'weekly' and let everything
-- else fall through to the month-shifting branch. 'yearly' therefore advanced
-- one month per step instead of twelve.
--
-- The visible effect: a yearly rule anchored on 29 February resolved to
-- 2025-01-29, where `src/lib/recurrence.ts` resolves 2025-02-28. The UI
-- predicts occurrences with the TypeScript; the database validates them here.
-- A disagreement means the app offers a date the ledger then refuses, and a
-- yearly rule silently never fires on the day the user chose.
--
-- Found by the parity matrix in `scripts/.parity.ts`, which runs the same
-- sixteen cases through both implementations and compares. It was not found by
-- reading either one, and it was not found by any test: the previous
-- implementation was TypeScript, which was correct, so all 147 unit tests passed
-- throughout. ADR-012's argument, applied to itself — plausible-looking code,
-- correct-looking results, wrong behaviour.
--
-- The fix multiplies by twelve inside the function rather than at the call site,
-- so "add N periods" means the same thing for all four frequencies.

create or replace function private.recurring_add(
  base date,
  frequency text,
  periods int
)
returns date
language plpgsql
immutable
set search_path = ''
as $$
declare
  shifted date;
  target_max_day int;
  months int := periods;
begin
  if frequency = 'daily' then
    return (base + (periods::int * interval '1 day'))::date;
  end if;

  if frequency = 'weekly' then
    return (base + (periods::int * 7 * interval '1 day'))::date;
  end if;

  -- A year is twelve months of shift.
  if frequency = 'yearly' then
    months := periods * 12;
  end if;

  shifted := (date_trunc('month', base) + (months::int * interval '1 month'))::date;
  target_max_day := extract(
    day from (date_trunc('month', shifted) + interval '1 month - 1 day')
  )::int;

  return make_date(
    extract(year from shifted)::int,
    extract(month from shifted)::int,
    least(extract(day from base)::int, target_max_day)
  );
end;
$$;

comment on function private.recurring_add(date, text, int) is
  'Add N periods to a date, clamping day-of-month. Mirrors src/lib/recurrence.ts: yearly is monthly x12.';
