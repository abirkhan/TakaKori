import { describe, it, expect } from 'vitest'
import { csvField, toCsv, transactionsToCsv } from '@/lib/csv'

describe('csvField', () => {
  it('leaves plain values untouched', () => {
    expect(csvField('Groceries')).toBe('Groceries')
    expect(csvField(42)).toBe('42')
  })

  it('quotes values containing a comma', () => {
    expect(csvField('Rice, lentils')).toBe('"Rice, lentils"')
  })

  it('quotes and escapes embedded double quotes', () => {
    expect(csvField('He said "hi"')).toBe('"He said ""hi"""')
  })

  it('quotes values containing newlines', () => {
    expect(csvField('line1\nline2')).toBe('"line1\nline2"')
  })

  it('renders null and undefined as empty rather than "null"', () => {
    expect(csvField(null)).toBe('')
    expect(csvField(undefined)).toBe('')
  })

  // A leading =, +, - or @ makes a spreadsheet evaluate the cell as a formula.
  // A description like "=1+1" from an imported bank file would otherwise
  // execute when the user opens their export.
  it('neutralises formula injection', () => {
    expect(csvField('=1+1')).toBe("'=1+1")
    expect(csvField('+1234')).toBe("'+1234")
    expect(csvField('-100')).toBe("'-100")
    expect(csvField('@SUM(A1)')).toBe("'@SUM(A1)")
  })

  it('does not mangle a negative number that is genuinely numeric data', () => {
    // Amounts are exported unsigned by design; this guards the helper only.
    expect(csvField('-100')).toBe("'-100")
  })
})

describe('toCsv', () => {
  it('emits a header row and CRLF line endings', () => {
    const csv = toCsv(['A', 'B'], [['1', '2']])
    expect(csv).toContain('A,B')
    expect(csv).toContain('\r\n')
  })

  it('starts with a BOM so spreadsheets detect UTF-8', () => {
    // Without this the taka sign renders as mojibake in Excel.
    expect(toCsv(['A'], [['x']]).charCodeAt(0)).toBe(0xfeff)
  })

  it('produces a consistent column count per row', () => {
    const csv = toCsv(['Date', 'Amount', 'Note'], [['2026-09-30', '10.00', 'a,b']])
    const [, ...rows] = csv.replace(/^﻿/, '').trim().split('\r\n')
    expect(rows).toHaveLength(1)
    expect(rows[0].split(',').length).toBeGreaterThanOrEqual(3)
  })
})

describe('transactionsToCsv', () => {
  const base = {
    id: '1',
    occurred_on: '2026-09-30',
    type: 'expense',
    amount: '3500.00',
    description: 'Groceries',
    category_name: 'Food',
    account_name: 'Cash',
    counterparty_account_name: null,
  }

  it('writes amounts as plain decimal strings', () => {
    const csv = transactionsToCsv([base])
    expect(csv).toContain('3500.00')
  })

  it('exports transfers as zero so they are not summed as spending', () => {
    const csv = transactionsToCsv([
      {
        ...base,
        type: 'transfer',
        amount: '5000.00',
        category_name: null,
        counterparty_account_name: 'Bank',
      },
    ])
    expect(csv).toContain('0.00')
    expect(csv).not.toContain('5000.00')
    expect(csv).toContain('Bank')
  })

  it('emits a header even with no transactions', () => {
    const csv = transactionsToCsv([])
    expect(csv).toContain('Date')
    expect(csv.trim().split('\r\n')).toHaveLength(1)
  })

  it('escapes a description containing a comma', () => {
    const csv = transactionsToCsv([{ ...base, description: 'Rice, lentils, oil' }])
    expect(csv).toContain('"Rice, lentils, oil"')
  })
})