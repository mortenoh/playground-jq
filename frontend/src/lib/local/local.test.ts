import { describe, expect, it } from 'vitest'

import { equivalentCommand, inputFlags, outputFlags, shellQuote } from '@/lib/local/command'
import { compileErrors, readStreams } from '@/lib/local/diagnostics'
import { isGeoJson } from '@/lib/local/geojson'
import { DEFAULT_OPTIONS } from '@/lib/types'

describe('command', () => {
    it('quotes like shlex.quote', () => {
        expect(shellQuote('.a')).toBe('.a')
        expect(shellQuote('.[] | .a')).toBe("'.[] | .a'")
        expect(shellQuote("it's")).toBe(`'it'"'"'s'`)
        expect(shellQuote('')).toBe("''")
    })

    it('builds the same command line as the server', () => {
        const options = {
            ...DEFAULT_OPTIONS,
            null_input: true,
            args: { name: 'jq' },
            argjson: { n: { x: 41 } },
        }
        expect(equivalentCommand('"\\($name) \\($n.x + 1)"', options, false)).toBe(
            `jq -n --arg name jq --argjson n '{"x":41}' '"\\($name) \\($n.x + 1)"'`,
        )
        expect(equivalentCommand('.a', DEFAULT_OPTIONS, true)).toBe('jq .a input.json')
    })

    it('splits reading flags from printing flags', () => {
        const options = { ...DEFAULT_OPTIONS, slurp: true, raw_output: true, indent: 4 }
        expect(inputFlags(options)).toEqual(['-s'])
        expect(outputFlags(options)).toEqual(['-r', '--indent', '4'])
    })
})

describe('diagnostics', () => {
    it('locates compile errors', () => {
        const [error] = compileErrors(
            'jq: error: foo/0 is not defined at <top-level>, line 2, column 9:\n    f, (1 | foo)\n            ^^^\njq: 1 compile error',
        )
        expect(error).toMatchObject({
            kind: 'compile',
            message: 'foo/0 is not defined',
            line: 2,
            column: 9,
            end_column: 12,
        })
    })

    it('reads runtime errors, parse errors and debug messages', () => {
        expect(readStreams('jq: error (at /dev/stdin:0): boom', 5).errors[0]).toMatchObject({
            kind: 'runtime',
            message: 'boom',
        })
        expect(readStreams('jq: parse error: Unfinished JSON term', 5).errors[0]?.kind).toBe('input')
        expect(readStreams('["DEBUG:",1]', 0)).toEqual({ errors: [], messages: ['DEBUG: 1'] })
        expect(readStreams('bye', 5).errors[0]?.message).toBe('bye')
    })
})

describe('isGeoJson', () => {
    it('accepts valid objects and refuses broken ones', () => {
        expect(isGeoJson({ type: 'Point', coordinates: [1, 2] })).toBe(true)
        expect(isGeoJson({ type: 'FeatureCollection', features: [] })).toBe(true)
        expect(isGeoJson({ type: 'Feature', geometry: null, properties: null })).toBe(true)
        expect(
            isGeoJson({
                type: 'Polygon',
                coordinates: [
                    [
                        [0, 0],
                        [1, 1],
                        [0, 0],
                    ],
                ],
            }),
        ).toBe(false)
        expect(
            isGeoJson({
                type: 'Polygon',
                coordinates: [
                    [
                        [0, 0],
                        [1, 0],
                        [1, 1],
                        [0, 0],
                    ],
                ],
            }),
        ).toBe(true)
        expect(isGeoJson({ type: 'Feature', geometry: { type: 'Point', coordinates: [1, 2] } })).toBe(false)
        expect(isGeoJson({ type: 'Circle' })).toBe(false)
        expect(isGeoJson([1])).toBe(false)
    })
})
