import { describe, expect, it } from 'vitest'
import { chartSource, parseCsv } from '../src/csv.ts'

describe('parseCsv', () => {
  it('reads comma, semicolon and tab separated files', () => {
    expect(parseCsv('a,b\n1,2\n')).toEqual([['a', 'b'], ['1', '2']])
    expect(parseCsv('a;b\r\n1,5;2\r\n')).toEqual([['a', 'b'], ['1,5', '2']])
    expect(parseCsv('a\tb\n1\t2')).toEqual([['a', 'b'], ['1', '2']])
  })

  it('handles quotes, Excel’s UTF-8 marker and empty lines', () => {
    expect(parseCsv('﻿"Name, first",x\n"say ""hi""",2\n\n')).toEqual([['Name, first', 'x'], ['say "hi"', '2']])
  })
})

describe('chartSource', () => {
  const rows = [['Reason', 'Telemonitoring', 'Usual care'], ['Heart failure', '9', '19'], ['Other', '5,5', '7']]

  it('makes a bar chart with one series per column', () => {
    expect(chartSource(rows, { y: 'Patients (n)' })).toBe(
      ['xychart', '  x-axis "Reason" ["Heart failure", "Other"]', '  y-axis "Patients (n)"', '  bar "Telemonitoring" [9, 5.5]', '  bar "Usual care" [19, 7]'].join('\n'),
    )
  })

  it('makes horizontal bars and lines', () => {
    expect(chartSource(rows, { horizontal: true }).split('\n')[0]).toBe('xychart horizontal')
    expect(chartSource(rows, { type: 'line' })).toContain('  line "Usual care" [19, 7]')
  })

  it('makes a pie chart from the first two columns', () => {
    expect(chartSource(rows, { type: 'pie' })).toBe('pie\n  "Heart failure" : 9\n  "Other" : 5.5')
  })
})
