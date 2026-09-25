/**
 * Playground state in the URL hash, so a program, its input and its flags can be linked to.
 *
 * An input that came from a source preset is written as its reference (`dhis2:system-info`)
 * rather than its text, which keeps links short for megabyte-sized GeoJSON. Only the flags that
 * differ from the defaults are written.
 */

import { compressToEncodedURIComponent, decompressFromEncodedURIComponent } from 'lz-string'

import { DEFAULT_OPTIONS, type RunOptions } from '@/lib/types'

export interface SharedState {
    program: string
    /** Inline input text, when the input was typed or pasted. */
    input?: string
    /** A source preset reference, when the input came from one. */
    ref?: string
    options: RunOptions
}

interface Packed {
    p: string
    i?: string
    r?: string
    o?: Partial<RunOptions>
}

const PREFIX = '#s='

/** The flags that differ from the defaults. */
export function changedOptions(options: RunOptions): Partial<RunOptions> {
    const changed: Record<string, unknown> = {}
    for (const key of Object.keys(DEFAULT_OPTIONS) as (keyof RunOptions)[]) {
        if (JSON.stringify(options[key]) !== JSON.stringify(DEFAULT_OPTIONS[key])) changed[key] = options[key]
    }
    return changed as Partial<RunOptions>
}

/** The hash fragment for a state. */
export function encodeState(state: SharedState): string {
    const packed: Packed = { p: state.program }
    if (state.ref !== undefined) packed.r = state.ref
    else if (state.input !== undefined) packed.i = state.input
    const changed = changedOptions(state.options)
    if (Object.keys(changed).length > 0) packed.o = changed
    return PREFIX + compressToEncodedURIComponent(JSON.stringify(packed))
}

/** The state a hash fragment carries, or null when it carries none or is damaged. */
export function decodeState(hash: string): SharedState | null {
    if (!hash.startsWith(PREFIX)) return null
    const text = decompressFromEncodedURIComponent(hash.slice(PREFIX.length))
    if (!text) return null
    try {
        const packed = JSON.parse(text) as Packed
        if (typeof packed.p !== 'string') return null
        return {
            program: packed.p,
            input: packed.i,
            ref: packed.r,
            options: { ...DEFAULT_OPTIONS, ...packed.o },
        }
    } catch {
        return null
    }
}
