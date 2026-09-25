import { describe, expect, it } from 'vitest'

import { canonical, compareOutputs } from '@/lib/diff'

describe('compareOutputs', () => {
    it('ignores object key order', () => {
        expect(canonical({ b: 1, a: [{ d: 1, c: 2 }] })).toBe('{"a":[{"c":2,"d":1}],"b":1}')
        expect(compareOutputs([{ a: 1, b: 2 }], [{ b: 2, a: 1 }]).same).toBe(true)
    })

    it('reports a count mismatch', () => {
        const comparison = compareOutputs([1, 2], [1])
        expect(comparison.same).toBe(false)
        expect(comparison.summary).toBe('Expected 2 outputs, got 1.')
        expect(comparison.rows).toHaveLength(2)
    })

    it('reports a type mismatch at the first differing output', () => {
        expect(compareOutputs([1, 'a'], [1, ['a']]).summary).toBe(
            'Output 2 should be a string, not an array.',
        )
        expect(compareOutputs([{ a: 1 }], [{ a: 2 }]).summary).toBe(
            'Output 1 differs from what was expected.',
        )
    })

    it('compares as a multiset when order does not matter', () => {
        expect(compareOutputs([1, 2, 3], [3, 1, 2], { unordered: true }).same).toBe(true)
        expect(compareOutputs([1, 2, 3], [3, 1, 2]).same).toBe(false)
    })
})
