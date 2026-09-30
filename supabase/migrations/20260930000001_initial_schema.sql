-- TakaKori: initial schema
--
-- Design decisions encoded here (see docs/decisions.md):
--
--   * Single tenancy key `workspace_id` on every user-owned table. Ownership
--     is derived through workspace_members, never duplicated as user_id, so a
--     row can never point at an account belonging to a different workspace.
--   * Money is `numeric(14,2)`, never float. It crosses the API as a string;
--     see src/lib/money.ts.
--   * Transfers are a first-class `type`, not a category. Moving money
--     between accounts is neither income nor expense.
--   * RLS wraps auth.uid() in a subquery so it is evaluated once per query
--     rather than once per row.
--   * Every timestamp is timestamptz; `occurred_on` is a plain date because
--     the user's calendar day is the meaningful unit.

-- ---------------------------------------------------------------------------
-- Profiles
-- ---------------------------------------------------------------------------
create table if not exists public.profiles (
  id          uuid primary key references auth.users (id) on delete cascade,
  full_name   text,
  -- IANA timezone. All date ranges are computed in this zone, never UTC.
  timezone    text        not null default 'Asia/Dhaka',
  currency    text        not null default 'BDT',
  locale      text        not null default 'bn-BD',
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),

  constraint profiles_currency_check check (char_length(currency) = 3),
  -- Reject a bad timezone early rather than failing at query time.
  constraint profiles_timezone_check check (timezone = any (select name from pg_timezone_names))
);

comment on column public.profiles.timezone is
  'IANA zone used to compute reporting ranges. Never derive month boundaries in UTC.';

-- ---------------------------------------------------------------------------
-- Workspaces
-- ---------------------------------------------------------------------------
create table if not exists public.workspaces (
  id          uuid primary key default gen_random_uuid(),
  name        text        not null,
  kind        text        not null default 'personal',
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),

  constraint workspaces_kind_check check (kind in ('personal', 'business', 'family')),
  constraint workspaces_name_check check (char_length(btrim(name)) > 0)
);

comment on table public.workspaces is
  'Tenancy boundary. V1 creates exactly one personal workspace per user, but every query and policy is already written against workspace_id.';

create table if not exists public.workspace_members (
  workspace_id uuid        not null references public.workspaces (id) on delete cascade,
  user_id      uuid        not null references auth.users (id) on delete cascade,
  role         text        not null default 'owner',
  created_at   timestamptz not null default now(),

  primary key (workspace_id, user_id),
  constraint workspace_members_role_check check (role in ('owner', 'member'))
);

-- Membership lookups happen in every RLS policy, so this index is on the hot path.
create index if not exists workspace_members_user_id_idx
  on public.workspace_members (user_id);

-- A user must belong to at most one workspace for now. Revisit when shared
-- workspaces ship; the unique index is the only thing to drop.
create unique index if not exists workspace_members_one_per_user_idx
  on public.workspace_members (user_id);

-- ---------------------------------------------------------------------------
-- Accounts
-- ---------------------------------------------------------------------------
create table if not exists public.accounts (
  id               uuid primary key default gen_random_uuid(),
  workspace_id     uuid        not null references public.workspaces (id) on delete cascade,
  name             text        not null,
  kind             text        not null default 'cash',
  opening_balance  numeric(14, 2) not null default 0,
  is_archived      boolean     not null default false,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),

  constraint accounts_name_check check (char_length(btrim(name)) > 0),
  constraint accounts_kind_check
    check (kind in ('cash', 'bank', 'mobile', 'credit_card'))
  -- opening_balance may legitimately be negative (credit card already owed),
  -- so no sign constraint here. Transaction amounts are the ones that must be
  -- positive, and transactions_amount_check enforces that.
);

create index if not exists accounts_workspace_id_idx on public.accounts (workspace_id);

-- ---------------------------------------------------------------------------
-- Categories
-- ---------------------------------------------------------------------------
create table if not exists public.categories (
  id           uuid primary key default gen_random_uuid(),
  workspace_id uuid        not null references public.workspaces (id) on delete cascade,
  name         text        not null,
  -- Drives which side of the dashboard this category appears on.
  type         text        not null,
  icon         text,
  is_system    boolean     not null default false,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),

  constraint categories_name_check check (char_length(btrim(name)) > 0),
  constraint categories_type_check check (type in ('income', 'expense'))
);

create index if not exists categories_workspace_id_idx on public.categories (workspace_id);

-- Category names are unique per workspace per side, so "Food" cannot be added twice.
create unique index if not exists categories_workspace_type_name_key
  on public.categories (workspace_id, type, lower(name));

-- ---------------------------------------------------------------------------
-- Transactions
-- ---------------------------------------------------------------------------
create table if not exists public.transactions (
  id                      uuid primary key default gen_random_uuid(),
  workspace_id            uuid           not null references public.workspaces (id) on delete cascade,
  account_id              uuid           not null references public.accounts (id) on delete restrict,
  category_id             uuid           references public.categories (id) on delete set null,
  -- Destination account, transfer rows only.
  counterparty_account_id uuid           references public.accounts (id) on delete restrict,
  type                    text           not null,
  amount                  numeric(14, 2) not null,
  description             text,
  -- A calendar date, not a timestamp: the user's day is the unit of meaning.
  occurred_on             date           not null default (now() at time zone 'utc')::date,
  created_at              timestamptz    not null default now(),
  updated_at              timestamptz    not null default now(),

  constraint transactions_type_check check (type in ('income', 'expense', 'transfer')),
  constraint transactions_amount_check check (amount > 0),
  constraint transactions_description_check
    check (description is null or char_length(description) <= 500),

  -- Shape of the row must match its type. This is what makes it impossible to
  -- record a transfer without a real destination, or an expense that quietly
  -- points at another account.
  constraint transactions_shape_check check (
    case type
      when 'transfer' then
        counterparty_account_id is not null
        and counterparty_account_id <> account_id
        and category_id is null
      else
        counterparty_account_id is null
    end
  )
);

-- Primary read path: a workspace's transactions within a date range.
create index if not exists transactions_workspace_occurred_idx
  on public.transactions (workspace_id, occurred_on desc);

create index if not exists transactions_account_id_idx
  on public.transactions (account_id);

create index if not exists transactions_category_id_idx
  on public.transactions (category_id)
  where category_id is not null;

-- ---------------------------------------------------------------------------
-- updated_at maintenance
-- ---------------------------------------------------------------------------
create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger profiles_set_updated_at
  before update on public.profiles
  for each row execute function public.set_updated_at();

create trigger workspaces_set_updated_at
  before update on public.workspaces
  for each row execute function public.set_updated_at();

create trigger accounts_set_updated_at
  before update on public.accounts
  for each row execute function public.set_updated_at();

create trigger categories_set_updated_at
  before update on public.categories
  for each row execute function public.set_updated_at();

create trigger transactions_set_updated_at
  before update on public.transactions
  for each row execute function public.set_updated_at();