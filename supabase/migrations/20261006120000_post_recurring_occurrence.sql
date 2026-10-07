-- Post a recurring occurrence as one atomic, server-authoritative operation.
--
-- **Why this exists.** `postRecurringOccurrence` validated in application code
-- that a client-supplied date was genuinely an occurrence of a rule before
-- writing anything (ADR-019). That was correct while the code ran on a server.
-- The moment transactions are posted from the browser, that validation is a
-- suggestion: whatever ships to the client can be edited, and the check goes
-- with it.
--
-- ADR-019 records what the check was preventing. For a monthly rule anchored on
-- the 1st, a client could post 2026-12-25; one request created a transaction
-- for a day the rule never predicted *and* advanced `last_posted_on` past every
-- genuine occurrence, permanently suppressing them. Both halves of the ledger
-- were corrupted by a single request.
--
-- So the whole operation moves here. `SECURITY INVOKER` keeps RLS
-- authoritative — this is not a privileged bypass, it runs as the calling user
-- with the same policies as any other read. What the database gains is that the
-- schedule arithmetic and the watermark can no longer be edited client-side.
--
-- **The occurrence walk mirrors `src/lib/recurrence.ts` deliberately.** Same
-- step-forward-from-the-anchor loop, same clamping, same `MAX_STEPS` cap. That
-- file says "correctness beats cleverness here" and this is where that decision
-- has to hold: two implementations of month-end clamping that disagree produce
-- a schedule the UI offers and the database refuses.
--
-- ADR-012 is the standing warning about plausible-looking wrong numbers, so the
-- invariant is asserted below rather than argued for in a comment.

-- ---------------------------------------------------------------------------
-- Add `n` periods to a date, clamping the day to the target month's length.
--
-- A 31st anchor lands on 28 February in a common year and 29 February in a leap
-- year. Clamping to 28 always loses a day in a leap year; overflowing into March
-- makes February show no payment and shifts the totals a month.
--
-- Yearly is monthly with twelve times the step, which is how the TS models it.
-- ---------------------------------------------------------------------------
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
begin
  if frequency = 'daily' then
    return (base + (periods::int * interval '1 day'))::date;
  end if;

  if frequency = 'weekly' then
    return (base + (periods::int * 7 * interval '1 day'))::date;
  end if;

  -- Normalise through the first of the month, so a day-of-31 cannot overflow
  -- during the arithmetic itself.
  shifted := (date_trunc('month', base) + (periods::int * interval '1 month'))::date;
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
  'Add N periods to a date, clamping day-of-month. Mirrors addMonthsClamped in src/lib/recurrence.ts.';

-- ---------------------------------------------------------------------------
-- Post one occurrence. Returns the new transaction's id.
--
-- Atomic in the sense that matters: the row lock, the validation, the insert and
-- the watermark advance are one statement, so a raise anywhere rolls all of it
-- back. The previous implementation inserted and *then* advanced the watermark,
-- which left a window in which a transaction existed with nothing recording it.
-- ---------------------------------------------------------------------------
create or replace function public.post_recurring_occurrence(
  target_recurring_id uuid,
  occurrence_date date
)
returns uuid
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_rule public.recurring_transactions%rowtype;
  v_step int := 0;
  v_candidate date;
  v_transaction_id uuid;
  -- Matches MAX_STEPS in src/lib/recurrence.ts. A daily rule over ten years is
  -- ~3,600 steps; the cap only exists so a pathological row cannot spin.
  max_steps constant int := 4000;
begin
  -- FOR UPDATE serialises concurrent posts of the same rule, which is stronger
  -- than the old `.or(last_posted_on.is.null, last_posted_on.lt.<date>)`
  -- watermark guard: that guard made the duplicate a no-op *after* the insert
  -- had already been attempted. Under a row lock there is no window at all.
  --
  -- RLS applies, so a rule belonging to another workspace is simply not found.
  -- The message below is deliberately the same one a deleted rule produces: the
  -- caller learns nothing about whether the id exists elsewhere.
  select * into v_rule
  from public.recurring_transactions
  where id = target_recurring_id
    for update;

  if not found then
    raise exception 'That recurring transaction no longer exists.'
      using errcode = 'no_data_found';
  end if;

  -- Walk forward from the anchor until the candidate reaches the requested
  -- date. Identical in shape to `nextOccurrence`: iterative, not clever, so the
  -- clamping and the interval arithmetic cannot be got wrong in a new way.
  v_candidate := private.recurring_add(v_rule.anchor_date, v_rule.frequency, 0);
  while v_candidate < occurrence_date loop
    v_step := v_step + 1;
    if v_step > max_steps then
      raise exception 'Could not resolve the schedule for that date.'
        using errcode = 'check_violation';
    end if;
    v_candidate := private.recurring_add(
      v_rule.anchor_date,
      v_rule.frequency,
      v_step * v_rule.interval_count
    );
  end loop;

  -- The core of ADR-019. If the walk landed anywhere other than the requested
  -- date, the date is not a real occurrence of this schedule.
  if v_candidate <> occurrence_date then
    raise exception 'That date is not an occurrence of this schedule.'
      using errcode = 'check_violation';
  end if;

  if v_rule.ends_on is not null and occurrence_date > v_rule.ends_on then
    raise exception 'This schedule has ended.'
      using errcode = 'check_violation';
  end if;

  if v_rule.last_posted_on is not null and occurrence_date <= v_rule.last_posted_on then
    raise exception 'That occurrence has already been posted.'
      using errcode = 'unique_violation';
  end if;

  -- Amount is copied as numeric and never round-tripped through a float, per
  -- ADR-004. The shape CHECK on `transactions` and the
  -- `private.assert_same_workspace` trigger both re-verify what the rule's own
  -- CHECK already allowed, so a rule edited after creation still cannot produce
  -- a transaction that points outside its workspace.
  insert into public.transactions (
    workspace_id,
    account_id,
    category_id,
    counterparty_account_id,
    type,
    amount,
    description,
    occurred_on
  )
  values (
    v_rule.workspace_id,
    v_rule.account_id,
    v_rule.category_id,
    v_rule.counterparty_account_id,
    v_rule.type,
    v_rule.amount,
    v_rule.description,
    occurrence_date
  )
  returning id into v_transaction_id;

  update public.recurring_transactions
  set last_posted_on = occurrence_date
  where id = target_recurring_id
    and workspace_id = v_rule.workspace_id;

  return v_transaction_id;
end;
$$;

comment on function public.post_recurring_occurrence(uuid, date) is
  'Posts one occurrence of a recurring rule atomically. SECURITY INVOKER: RLS applies. Validates that occurrence_date is a real occurrence (ADR-019).';

-- The other reporting functions are all granted to authenticated; this one has
-- to be reachable the same way, or a client-side caller cannot use it.
grant execute on function public.post_recurring_occurrence(uuid, date) to authenticated;
