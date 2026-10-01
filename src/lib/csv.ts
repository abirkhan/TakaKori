/**
 * CSV export.
 *
 * Users storing financial records must be able to get their data out. This is
 * not a convenience feature; if they cannot leave with their data, the product
 * is not trustworthy.
 *
 * Every CSV value is quoted defensively. A description containing a comma, a
 * newline, or a leading '=' would otherwise corrupt the file — and a leading
 * '=' is a formula-injection vector in Excel and Sheets.
 */
import { toMinor, toNumericString } from '@/lib/money'

/**
 * Escape a single CSV field.
 *
 * Prefixes a single quote to values starting with =, +, -, @, tab or CR so a
 * spreadsheet treats them as text rather than executing them.
 */
export function csvField(value: string | number | null | undefined): string {
  if (value === null || value === undefined) return ''

  let text = String(value)

  if (/^[=+\-@\t\r]/.test(text)) {
    text = `'${text}`
  }

  if (/[",\n\r]/.test(text)) {
    return `"${text.replace(/"/g, '""')}"`
  }

  return text
}

export function toCsv(headers: string[], rows: (string | number | null | undefined)[][]): string {
  const lines = [headers.map(csvField).join(',')]
  for (const row of rows) {
    lines.push(row.map(csvField).join(','))
  }
  // Excel expects CRLF and a BOM to detect UTF-8 (needed for the taka sign).
  return `﻿${lines.join('\r\n')}\r\n`
}

export interface ExportableTransaction {
  id: string
  occurred_on: string
  type: string
  amount: string | number
  description: string | null
  category_name: string | null
  account_name: string | null
  counterparty_account_name: string | null
}

/**
 * Render transactions as CSV.
 *
 * Amounts are written as plain decimal strings ("3500.00"), not the raw
 * Postgres format, so the file opens correctly in a spreadsheet. Money is
 * converted through lib/money.ts — never formatted here by hand.
 */
export function transactionsToCsv(transactions: ExportableTransaction[]): string {
  const headers = ['Date', 'Type', 'Amount', 'Category', 'Account', 'To account', 'Description']

  const rows = transactions.map((t) => {
    const amount = toNumericString(toMinor(t.amount))
    return [
      t.occurred_on,
      t.type,
      // Transfers carry no economic value of their own, so export them as 0
      // to avoid them being summed as spending or income downstream.
      t.type === 'transfer' ? '0.00' : amount,
      t.type === 'transfer' ? '' : (t.category_name ?? ''),
      t.account_name ?? '',
      t.counterparty_account_name ?? '',
      t.description ?? '',
    ]
  })

  return toCsv(headers, rows)
}
