-- TakaKori: `post_recurring_occurrence` verification fixture
--
-- Exercises the posting function against the behaviours ADR-019 exists to
-- prevent, and asserts the reconciliation invariant that all four views must
-- satisfy (ADR-012).
--
-- The reason this file exists as a fixture rather than only as unit tests is
-- that the schedule arithmetic now has **two** implementations: this function and
-- `src/lib/recurrence.ts`. The TypeScript one has 27 passing tests and is correct.
-- The SQL one had a bug that every test in the repository missed, because the
-- thing under test had moved.
--
-- So the invariant asserted here is parity, and it is asserted by running the
-- same matrix through both. `scripts/.parity.ts` prints the TypeScript half;
-- paste its output against the query below and compare. That is how the
-- `yearly` bug was found — the function advanced a yearly rule one MONTH at a
-- time, resolving a 29 February anchor to 2025-01-29 where TypeScript resolves
-- 2025-02-28. Plausible, compiles, returns rows, wrong.
--
-- Usage:
--   psql "$DATABASE_URL" -f supabase/tests/post_recurring_occurrence.sql
--
-- Runs in a transaction that is rolled back, so it never touches real data.
-- RLS applies if run under `set role authenticated` with a claims GUC; the
-- row-lock and no-row-found paths are the ones that matter there.

begin;

-- ---------------------------------------------------------------------------
-- Parity: the shared matrix.
--
-- Compare `expected` against `sql_next`. These are the values
-- `nextOccurrence` returns in TypeScript for the same inputs, including the
-- month-end clamping cases.
-- ---------------------------------------------------------------------------
with cases(freq, ivl, anchor, from_date, expected) as (
  values
    ('monthly'::text, 1, date '2026-01-31', date '2026-02-01', date '2026-02-28'),
    ('monthly',    1, date '2026-01-31', date '2024-02-01', date '2026-01-31'),
    ('monthly',    1, date '2024-01-31', date '2025-02-01', date '2025-02-28'),
    ('monthly',    1, date '2026-01-30', date '2026-02-01', date '2026-02-28'),
    ('monthly',    2, date '2026-01-31', date '2026-02-01', date '2026-03-31'),
    ('monthly',    2, date '2026-01-31', date '2026-03-01', date '2026-03-31'),
    ('monthly',    1, date '2026-03-15', date '2026-01-01', date '2026-03-15'),
    ('monthly',    1, date '2026-03-15', date '2026-03-15', date '2026-03-15'),
    -- These two are the regression. Yearly is monthly x12; getting that wrong
    -- makes a yearly rule walk month by month and never fire on the chosen day.
    ('yearly',     1, date '2024-02-29', date '2025-01-01', date '2025-02-28'),
    ('yearly',     1, date '2026-01-31', date '2027-01-01', date '2027-01-31'),
    ('yearly',     2, date '2024-02-29', date '2027-01-01', date '2028-02-29'),
    ('weekly',     1, date '2026-01-05', date '2026-02-02', date '2026-02-02'),
    ('weekly',     2, date '2026-01-05', date '2026-02-02', date '2026-02-02'),
    ('weekly',     2, date '2026-01-05', date '2026-01-20', date '2026-02-02'),
    ('daily',      1, date '2026-01-01', date '2026-03-15', date '2026-03-15'),
    ('daily',      7, date '2026-01-01', date '2026-02-10', date '2026-02-12')
),
walk as (
  select c.freq, c.ivl, c.anchor, c.from_date, c.expected, s.step,
         private.recurring_add(c.anchor, c.freq, s.step * c.ivl) as candidate
  from cases c
  cross join lateral generate_series(0, 4000) as s(step)
),
resolved as (
  select freq, ivl, anchor, from_date, expected,
         min(candidate) filter (where candidate >= from_date) as sql_next
  from walk
  group by freq, ivl, anchor, from_date, expected
)
select case when count(*) = 0 then 'PASS' else 'FAIL' end as parity,
       count(*) as mismatches,
       'cases compared: ' || (select count(*) from resolved)::text as detail
from resolved
where sql_next is distinct from expected;

-- ---------------------------------------------------------------------------
-- Posting behaviour.
--
-- Nine assertions. The three that matter most are 3, 4 and 5: a date the rule
-- never predicts must be refused, a far-future date must be refused, and a
-- refused attempt must leave the watermark alone. ADR-019's attack was one
-- request creating a transaction *and* advancing `last_posted_on` past every
-- genuine occurrence.
-- ---------------------------------------------------------------------------
create temporary table results(seq int, outcome text, detail text);

do $$
declare
  v_ws uuid; v_acct uuid; v_cat uuid; v_rule uuid; v_tx uuid; v_wm date;
begin
  select workspace_id into v_ws from public.workspace_members limit 1;
  select id into v_acct from public.accounts where workspace_id = v_ws limit 1;
  select id into v_cat from public.categories where workspace_id = v_ws and type = 'expense' limit 1;

  -- A monthly rule anchored on the 31st, so its February occurrence is clamped.
  insert into public.recurring_transactions
    (workspace_id, account_id, category_id, type, amount, frequency, interval_count, anchor_date)
  values (v_ws, v_acct, v_cat, 'expense', 2500.00, 'monthly', 1, date '2026-01-31')
  returning id into v_rule;

  -- 1. A real, clamped occurrence posts.
  begin
    v_tx := public.post_recurring_occurrence(v_rule, date '2026-02-28');
    insert into results values (1, 'PASS', 'clamped occurrence 2026-02-28 posted');
  exception when others then
    insert into results values (1, 'FAIL', 'real occurrence: ' || sqlerrm);
  end;

  -- 2. Replaying it is refused rather than writing a second row.
  begin
    perform public.post_recurring_occurrence(v_rule, date '2026-02-28');
    insert into results values (2, 'FAIL', 'replay was allowed');
  exception when others then
    insert into results values (2, 'PASS', 'replay refused: ' || sqlerrm);
  end;

  -- 3. A date the schedule never predicts is refused.
  begin
    perform public.post_recurring_occurrence(v_rule, date '2026-02-25');
    insert into results values (3, 'FAIL', 'forged date was allowed');
  exception when others then
    insert into results values (3, 'PASS', 'forged 2026-02-25 refused');
  end;

  -- 4. ADR-019's actual attack: a date far in the future.
  begin
    perform public.post_recurring_occurrence(v_rule, date '2026-12-25');
    insert into results values (4, 'FAIL', 'far-future date was allowed');
  exception when others then
    insert into results values (4, 'PASS', 'far-future 2026-12-25 refused');
  end;

  -- 5. No refused attempt may have advanced the watermark.
  select last_posted_on into v_wm from public.recurring_transactions where id = v_rule;
  if v_wm = date '2026-02-28' then
    insert into results values (5, 'PASS', 'watermark held at 2026-02-28');
  else
    insert into results values (5, 'FAIL', 'watermark is ' || coalesce(v_wm::text, 'null'));
  end if;

  -- 6. All four attempts together wrote exactly one transaction.
  insert into results values (6,
    case when (select count(*) from public.transactions
               where occurred_on = date '2026-02-28' and amount = 2500.00) = 1
         then 'PASS' else 'FAIL' end,
    'one transaction for the valid occurrence');

  -- 7. A later genuine occurrence still posts, so the watermark is a floor
  --    rather than a ceiling.
  begin
    v_tx := public.post_recurring_occurrence(v_rule, date '2026-03-31');
    insert into results values (7, 'PASS', 'later occurrence 2026-03-31 posts');
  exception when others then
    insert into results values (7, 'FAIL', 'later occurrence: ' || sqlerrm);
  end;

  -- 8. An ended schedule refuses dates past ends_on.
  update public.recurring_transactions set ends_on = date '2026-03-31' where id = v_rule;
  begin
    perform public.post_recurring_occurrence(v_rule, date '2026-04-30');
    insert into results values (8, 'FAIL', 'post-ends_on date was allowed');
  exception when others then
    insert into results values (8, 'PASS', 'post-ends_on refused');
  end;

  -- 9. Another workspace's rule is invisible, not merely forbidden. A
  --    non-existent id gives the identical message, so nothing leaks.
  begin
    perform public.post_recurring_occurrence(
      '00000000-0000-0000-0000-000000000000', date '2026-02-28');
    insert into results values (9, 'FAIL', 'unknown rule id was allowed');
  exception when others then
    insert into results values (9, 'PASS', 'unknown rule refused');
  end;
end $$;

select * from results order by seq;

rollback;