import { describe, expect, it } from 'vitest'

import { printOutputs } from '@/lib/local/print'
import { DEFAULT_OPTIONS } from '@/lib/types'

describe('printOutputs', () => {
    it('indents, compacts and tabs like jq', () => {
        expect(printOutputs([{ a: [1] }], DEFAULT_OPTIONS)).toBe('{\n  "a": [\n    1\n  ]\n}')
        expect(printOutputs([{ a: [1] }], { ...DEFAULT_OPTIONS, compact: true })).toBe('{"a":[1]}')
        expect(printOutputs([[1]], { ...DEFAULT_OPTIONS, tab: true })).toBe('[\n\t1\n]')
        expect(printOutputs([{ a: [1] }], { ...DEFAULT_OPTIONS, indent: 0 })).toBe('{\n"a": [\n1\n]\n}')
    })

    it('sorts keys, escapes non-ASCII and prints raw strings', () => {
        expect(printOutputs([{ b: 1, a: 2 }], { ...DEFAULT_OPTIONS, compact: true, sort_keys: true })).toBe(
            '{"a":2,"b":1}',
        )
        expect(printOutputs(['ø'], { ...DEFAULT_OPTIONS, ascii_output: true })).toBe('"\\u00f8"')
        expect(printOutputs(['a', 'b'], { ...DEFAULT_OPTIONS, raw_output: true })).toBe('a\nb')
        expect(printOutputs(['a', 1], { ...DEFAULT_OPTIONS, join_output: true })).toBe('a1')
        expect(printOutputs([1], { ...DEFAULT_OPTIONS, seq: true })).toBe('\u001e1')
    })
})
