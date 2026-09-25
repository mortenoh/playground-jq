/**
 * Comparing a learner's outputs with the expected ones, for the tutorial check panel.
 */

import type { JsonValue } from '@/lib/types'

export interface OutputComparison {
    /** Whether the two lists are equal as JSON. */
    same: boolean
    /** A sentence saying what differs first, for a learner. */
    summary: string
    /** Per-position comparison, up to the longer list's length. */
    rows: { index: number; expected: JsonValue | undefined; actual: JsonValue | undefined; same: boolean }[]
}

/** JSON with object keys sorted, so key order never makes two values differ. */
export function canonical(value: JsonValue | undefined): string {
    if (value === undefined) return 'undefined'
    return JSON.stringify(sortKeys(value))
}

function sortKeys(value: JsonValue): JsonValue {
    if (Array.isArray(value)) return value.map(sortKeys)
    if (value !== null && typeof value === 'object') {
        return Object.fromEntries(
            Object.keys(value)
                .toSorted()
                .map((key) => [key, sortKeys(value[key])]),
        )
    }
    return value
}

function typeName(value: JsonValue | undefined): string {
    if (value === undefined) return 'nothing'
    if (value === null) return 'null'
    if (Array.isArray(value)) return 'an array'
    if (typeof value === 'object') return 'an object'
    return `a ${typeof value}`
}

/** Compare outputs position by position, or as a multiset when order does not matter. */
export function compareOutputs(
    expected: JsonValue[],
    actual: JsonValue[],
    { unordered = false }: { unordered?: boolean } = {},
): OutputComparison {
    const left = unordered ? expected.toSorted((a, b) => canonical(a).localeCompare(canonical(b))) : expected
    const right = unordered ? actual.toSorted((a, b) => canonical(a).localeCompare(canonical(b))) : actual
    const length = Math.max(left.length, right.length)
    const rows = Array.from({ length }, (_, index) => ({
        index,
        expected: left[index],
        actual: right[index],
        same: canonical(left[index]) === canonical(right[index]),
    }))
    const same = rows.every((row) => row.same)
    let summary = 'Your outputs match.'
    if (!same) {
        if (left.length !== right.length) {
            summary = `Expected ${String(left.length)} output${left.length === 1 ? '' : 's'}, got ${String(right.length)}.`
        } else {
            const first = rows.find((row) => !row.same)!
            const kinds = typeName(first.expected) !== typeName(first.actual)
            summary = kinds
                ? `Output ${String(first.index + 1)} should be ${typeName(first.expected)}, not ${typeName(first.actual)}.`
                : `Output ${String(first.index + 1)} differs from what was expected.`
        }
    }
    return { same, summary, rows }
}
