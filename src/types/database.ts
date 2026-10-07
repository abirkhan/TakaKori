/**
 * Database types for TakaKori.
 *
 * Hand-maintained, and verified against `information_schema` on 2026-10-06 —
 * which is how the staleness was found and fixed. The file previously declared
 * six tables and `Functions: Record<never, never>`, so `budgets` and
 * `recurring_transactions` were missing and none of the five callable functions
 * had a signature at all. Regenerate with:
 *
 *   npx supabase gen types src/types/database.ts --lang typescript --linked
 *
 * (requires `npx supabase login` first)
 *
 * Note that `amount` and `opening_balance` are `numeric` in Postgres, which
 * crosses PostgREST as a **string**. The generated types say `number` because
 * supabase-js models numeric that way, so the real wire type is `string` —
 * see src/lib/money.ts. Treat money with the helpers there, never as a number.
 */

export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[]

export type Database = {
  public: {
    Tables: {
      accounts: {
        Row: {
          id: string
          workspace_id: string
          name: string
          kind: string
          opening_balance: number
          is_archived: boolean
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          workspace_id: string
          name: string
          kind?: string
          opening_balance?: number
          is_archived?: boolean
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          workspace_id?: string
          name?: string
          kind?: string
          opening_balance?: number
          is_archived?: boolean
          created_at?: string
          updated_at?: string
        }
        Relationships: []
      }

      categories: {
        Row: {
          id: string
          workspace_id: string
          name: string
          type: string
          icon: string | null
          is_system: boolean
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          workspace_id: string
          name: string
          type: string
          icon?: string | null
          is_system?: boolean
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          workspace_id?: string
          name?: string
          type?: string
          icon?: string | null
          is_system?: boolean
          created_at?: string
          updated_at?: string
        }
        Relationships: []
      }

      profiles: {
        Row: {
          id: string
          full_name: string | null
          timezone: string
          currency: string
          locale: string
          created_at: string
          updated_at: string
        }
        Insert: {
          id: string
          full_name?: string | null
          timezone?: string
          currency?: string
          locale?: string
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          full_name?: string | null
          timezone?: string
          currency?: string
          locale?: string
          created_at?: string
          updated_at?: string
        }
        Relationships: []
      }

      transactions: {
        Row: {
          id: string
          workspace_id: string
          account_id: string
          category_id: string | null
          counterparty_account_id: string | null
          type: string
          amount: number
          description: string | null
          occurred_on: string
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          workspace_id: string
          account_id: string
          category_id?: string | null
          counterparty_account_id?: string | null
          type: string
          amount: number
          description?: string | null
          occurred_on?: string
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          workspace_id?: string
          account_id?: string
          category_id?: string | null
          counterparty_account_id?: string | null
          type?: string
          amount?: number
          description?: string | null
          occurred_on?: string
          created_at?: string
          updated_at?: string
        }
        Relationships: []
      }

      workspace_members: {
        Row: {
          workspace_id: string
          user_id: string
          role: string
          created_at: string
        }
        Insert: {
          workspace_id: string
          user_id: string
          role?: string
          created_at?: string
        }
        Update: {
          workspace_id?: string
          user_id?: string
          role?: string
          created_at?: string
        }
        Relationships: []
      }

      /**
       * A rule that predicts recurring transactions. ADR-016: it never posts
       * anything by itself. `last_posted_on` is a watermark advanced only by
       * `post_recurring_occurrence`, which is what makes a replay a no-op.
       */
      recurring_transactions: {
        Row: {
          id: string
          workspace_id: string
          account_id: string
          category_id: string | null
          counterparty_account_id: string | null
          type: string
          amount: number
          description: string | null
          frequency: string
          interval_count: number
          anchor_date: string
          ends_on: string | null
          last_posted_on: string | null
          is_active: boolean
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          workspace_id: string
          account_id: string
          category_id?: string | null
          counterparty_account_id?: string | null
          type: string
          amount: number
          description?: string | null
          frequency?: string
          interval_count?: number
          anchor_date: string
          ends_on?: string | null
          last_posted_on?: string | null
          is_active?: boolean
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          workspace_id?: string
          account_id?: string
          category_id?: string | null
          counterparty_account_id?: string | null
          type?: string
          amount?: number
          description?: string | null
          frequency?: string
          interval_count?: number
          anchor_date?: string
          ends_on?: string | null
          last_posted_on?: string | null
          is_active?: boolean
          created_at?: string
          updated_at?: string
        }
        Relationships: []
      }

      /**
       * A monthly cap. `category_id = null` is the overall cap, and two partial
       * unique indexes enforce one of each per workspace — a single unique index
       * would allow unlimited overall budgets, because NULLs are distinct in
       * Postgres (ADR-017).
       */
      budgets: {
        Row: {
          id: string
          workspace_id: string
          category_id: string | null
          amount: number
          is_active: boolean
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          workspace_id: string
          category_id?: string | null
          amount: number
          is_active?: boolean
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          workspace_id?: string
          category_id?: string | null
          amount?: number
          is_active?: boolean
          created_at?: string
          updated_at?: string
        }
        Relationships: []
      }

      workspaces: {
        Row: {
          id: string
          name: string
          kind: string
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          name: string
          kind?: string
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          name?: string
          kind?: string
          created_at?: string
          updated_at?: string
        }
        Relationships: []
      }
    }

    Views: {
      workspace_totals: {
        Row: {
          workspace_id: string
          total_income: number
          total_expense: number
          net_balance: number
          total_transferred: number
        }
      }
      account_balances: {
        Row: {
          workspace_id: string
          account_id: string
          name: string
          kind: string
          balance: number
        }
      }
      expense_by_category: {
        Row: {
          workspace_id: string
          category_id: string | null
          category_name: string | null
          total: number
        }
      }
    }

    /**
     * Every reporting aggregate, and the one write function.
     *
     * This was `Record<never, never>` until 2026-10-06, which meant the five
     * callable functions had no declared signature at all — the query modules
     * hand-cast around them. `post_recurring_occurrence` is the newest and the
     * most load-bearing: it is the only thing standing between a client and
     * ADR-019's attack, so a typo in its argument names would surface as a
     * runtime error rather than a compile error, at the moment a user posts an
     * occurrence.
     *
     * Every one is `SECURITY INVOKER`, so calling them from the browser applies
     * exactly the same RLS policies a Server Component gets.
     */
    Functions: {
      workspace_totals_for_range: {
        Args: {
          target_workspace_id: string
          range_from: string
          range_to: string
        }
        Returns: {
          total_income: number
          total_expense: number
          net_balance: number
          total_transferred: number
          transaction_count: number
        }[]
      }
      monthly_totals_for_range: {
        Args: {
          target_workspace_id: string
          range_from: string
          range_to: string
        }
        Returns: {
          month: string
          total_income: number
          total_expense: number
          net_balance: number
          tx_count: number
        }[]
      }
      expense_by_category_for_range: {
        Args: {
          target_workspace_id: string
          range_from: string
          range_to: string
        }
        Returns: {
          category_id: string | null
          category_name: string | null
          total: number
        }[]
      }
      income_by_category_for_range: {
        Args: {
          target_workspace_id: string
          range_from: string
          range_to: string
        }
        Returns: {
          category_id: string | null
          category_name: string | null
          total: number
        }[]
      }
      /**
       * Posts one occurrence of a recurring rule atomically. ADR-032.
       *
       * Returns the new transaction's id. Raises `23514` when the date is not a
       * real occurrence of the schedule or the schedule has ended, `23505` when
       * it has already been posted, and `P0002` when the rule is not visible —
       * which covers both "does not exist" and "belongs to another workspace",
       * deliberately indistinguishable.
       */
      post_recurring_occurrence: {
        Args: {
          target_recurring_id: string
          occurrence_date: string
        }
        Returns: string
      }
    }
    Enums: Record<never, never>
    CompositeTypes: Record<never, never>
  }
}

/** Narrow the loose `type`/`kind`/`role` text columns to their CHECK-constrained values. */
export type TransactionType = 'income' | 'expense' | 'transfer'
export type CategoryType = 'income' | 'expense'
export type AccountKind = 'cash' | 'bank' | 'mobile' | 'credit_card'
export type WorkspaceKind = 'personal' | 'business' | 'family'
export type MemberRole = 'owner' | 'member'

export type Tables<T extends keyof Database['public']['Tables']> =
  Database['public']['Tables'][T]['Row']
export type TablesInsert<T extends keyof Database['public']['Tables']> =
  Database['public']['Tables'][T]['Insert']
export type TablesUpdate<T extends keyof Database['public']['Tables']> =
  Database['public']['Tables'][T]['Update']
