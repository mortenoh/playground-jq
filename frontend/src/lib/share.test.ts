import { describe, expect, it } from 'vitest'

import { changedOptions, decodeState, encodeState } from '@/lib/share'
import { DEFAULT_OPTIONS } from '@/lib/types'

describe('share', () => {
    it('round-trips a program, inline input and flags', () => {
        const state = {
            program: '.[] | select(.price < 10)',
            input: '[{"price": 5}]',
            options: { ...DEFAULT_OPTIONS, compact: true, args: { name: 'jq' } },
        }
        const hash = encodeState(state)
        expect(hash.startsWith('#s=')).toBe(true)
        expect(decodeState(hash)).toEqual({ ...state, ref: undefined })
    })

    it('writes a preset reference instead of its text', () => {
        const hash = encodeState({
            program: '.features | length',
            ref: 'dhis2:org-units-geojson-level-2',
            input: 'x'.repeat(10_000),
            options: DEFAULT_OPTIONS,
        })
        expect(hash.length).toBeLessThan(200)
        expect(decodeState(hash)?.ref).toBe('dhis2:org-units-geojson-level-2')
        expect(decodeState(hash)?.input).toBeUndefined()
    })

    it('writes only changed flags', () => {
        expect(changedOptions(DEFAULT_OPTIONS)).toEqual({})
        expect(changedOptions({ ...DEFAULT_OPTIONS, slurp: true, indent: 4 })).toEqual({
            slurp: true,
            indent: 4,
        })
    })

    it('refuses damaged or foreign hashes', () => {
        expect(decodeState('')).toBeNull()
        expect(decodeState('#other')).toBeNull()
        expect(decodeState('#s=%%%')).toBeNull()
    })
})
