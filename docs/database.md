# Database

Single Postgres database, shared by all users, isolated by Row Level Security.
No database-per-user.

Migrations live in `supabase/migrations/` and are the only way the schema
changes. Never edit the schema through the Supabase dashboard.

## Schema

```
auth.users ──┬── profiles          (1:1, preferences)
             └── workspace_members ── workspaces ──┬── accounts ──┬── transactions
                                                   │              └── account_adjustments
                                                   └── categories
```

`account_adjustments` hangs off `accounts` rather than off `workspaces` directly
because an adjustment is meaningless without an account — it is a signed correction
to one account's balance, never a workspace-level figure.

### Tenancy

`workspace_id` is the only tenancy key. `user_id` appears solely on
`workspace_members`. Deriving ownership through membership means a transaction
cannot reference an account in a workspace it does not belong to.

V1 creates exactly one personal workspace per user, enforced by
`workspace_members_one_per_user_idx`. Shared workspaces ship by dropping that
one index — no schema rewrite.

### Tables

**profiles** — one per user, keyed by `auth.users.id`. Holds `timezone` (IANA),
`currency`, and `locale`. All reporting ranges are computed in `timezone`, never
UTC.

**workspaces** — tenancy boundary. `kind` is `personal | business | family`.

**workspace_members** — `role` is `owner | member`.

**accounts** — cash, bank, mobile, credit card. `opening_balance` may be
negative (a card already owed).

**categories** — `type` is `income | expense`. Unique per
`(workspace_id, type, lower(name))`.

**transactions** — see below.

**account_adjustments** — signed corrections to one account's balance, outside income
and expense. `amount` is `numeric(14,2) not null` and **may be negative**, which is the
one place in this schema where a money column carries its own direction: a transaction's
direction is in `type`, and an adjustment has no `type`. `reason` is nullable and
capped at 200 characters. `on delete restrict` on `account_id` — deleting an account
with corrections against it needs a decision, not a cascade.

This table exists instead of a fourth `transactions.type`. See ADR-045 for why the
type route was rejected: every aggregate that splits income from expense by type filter
would have needed to handle a value belonging to neither bucket, and any one left
unchanged would have excluded the adjustment and made `net_balance` quietly wrong.

### The transactions table

```sql
create table transactions (
  id                      uuid primary key default gen_random_uuid(),
  workspace_id            uuid           not null references workspaces (id),
  account_id              uuid           not null references accounts (id),
  category_id             uuid           references categories (id) on delete set null,
  counterparty_account_id uuid           references accounts (id),
  type                    text           not null,  -- income | expense | transfer
  amount                  numeric(14, 2) not null,
  description             text,
  occurred_on             date           not null,
  created_at              timestamptz    not null default now(),
  updated_at              timestamptz    not null default now(),

  constraint transactions_amount_check check (amount > 0),
  constraint transactions_shape_check check (...)
);
```

Four decisions worth stating explicitly:

**`type` is an enum, not a category.** A transfer between your own accounts is
neither income nor expense. Modelling it as a category is the most common way
personal finance apps corrupt their own totals.

**`amount` is unsigned.** Direction comes from `type`, so there is no `-0` and
no double-negative confusion. `CHECK (amount > 0)` enforces it.

**`occurred_on` is a `date`, not a `timestamptz`.** The meaningful unit is the
user's calendar day. Storing an instant would make "today" depend on the
server's timezone, and a user in Dhaka recording an expense at 00:30 would see
it land on the previous day.

**`counterparty_account_id` is the transfer escape hatch.** Adding it now costs
one nullable column. Retrofitting transfers later means rewriting every balance
query and every view.

### Row shape invariant

```sql
check (
  case type
    when 'transfer' then
      counterparty_account_id is not null
      and counterparty_account_id <> account_id
      and category_id is null
    else
      counterparty_account_id is null
  end
)
```

A transfer cannot exist without a destination, cannot transfer to itself, and
cannot carry a category. An income or expense can never have a destination.

## Money

`numeric(14,2)`. Never `float`, which cannot represent `0.1` exactly.

`numeric` is exact in Postgres and crosses PostgREST as a **string**. All
conversion to and from JS minor units lives in `src/lib/money.ts`. All
aggregation lives in SQL.

## Views

Defined in migration `0004_views.sql`, all with `security_invoker = true` so
RLS applies to the caller rather than the view owner.

| View                  | Purpose                                                |
| --------------------- | ------------------------------------------------------ |
| `workspace_totals`    | income, expense, net, transferred per workspace        |
| `account_balances`    | balance per account, transfers applied both directions |
| `expense_by_category` | spend grouped by category                              |

`workspace_totals` excludes transfers from income and expense by construction.
`account_balances` treats a transfer as −amount on the source and +amount on
the destination, so a workspace total correctly nets transfers to zero.

`account_balances` also adds `account_adjustments` as a third movement source. It is
the **only** view whose definition accounts for corrections, and that is the point of
ADR-045: a correction moves a balance, and nothing else. `workspace_totals`
deliberately does not, because a correction is neither income nor spending and adding
it there would file a reconciliation under "income this month".

The migration carries a `DO` block that asserts every account's balance still equals
`opening_balance + movements + adjustments`, and raises if it does not. It is the
invariant ADR-012 exists to protect, expressed as something that fails loudly rather
than as a comment. It earned its place immediately: it caught a rewrite of the view
that had reintroduced the original income-attribution bug — income folded into the
transfer branch under `counterparty_account_id`, which is `NULL` for income, so every
income row was attributed to no account and dropped. The rewrite was written from the
superseded `views.sql` rather than from the live definition.

## Indexes

Every index exists to serve a specific access path.

| Index                                 | Serves                                          |
| ------------------------------------- | ----------------------------------------------- |
| `transactions_workspace_occurred_idx` | the primary read: a workspace over a date range |
| `transactions_account_id_idx`         | per-account balance and history                 |
| `workspace_members_user_id_idx`       | the membership lookup in **every** RLS policy   |
| `categories_workspace_type_name_key`  | category-name uniqueness                        |
| `account_adjustments_account_id`      | the per-account correction list and balance     |
| `account_adjustments_workspace_id`    | workspace-scoped reads and RLS predicate cost   |

Adding an RLS predicate on a column means adding an index on that column.

## Migration workflow

```bash
npx supabase link --project-ref <ref>   # once per machine
npx supabase migration new <name>
npx supabase db push                    # apply to the linked project
npx supabase gen types types/database.ts # regenerate TS types
```

Rules:

- One migration per logical change. Never edit an already-applied migration.
- Every new table ships with RLS enabled and policies in the same migration.
- Regenerate TypeScript types after every schema change and commit them.
- Never run DDL against production by hand.
