/** Course levels and source kinds, and the hue each chip wears. */

import type { Level, SourceKind } from '@/lib/types'

export const LEVELS: { level: Level; name: string; blurb: string; hue: string }[] = [
    {
        level: 101,
        name: 'Beginner',
        blurb: 'Identity, fields, arrays, pipes, building objects, select and map.',
        hue: 'green',
    },
    {
        level: 201,
        name: 'Intermediate',
        blurb: 'Grouping, reduce, variables, strings and regex, paths, formats and errors.',
        hue: 'blue',
    },
    {
        level: 301,
        name: 'Advanced',
        blurb: 'foreach, recursion, your own functions, streaming, and idioms for real data.',
        hue: 'violet',
    },
]

export function levelHue(level: Level): string {
    return LEVELS.find((entry) => entry.level === level)?.hue ?? 'blue'
}

export function levelName(level: Level): string {
    return LEVELS.find((entry) => entry.level === level)?.name ?? String(level)
}

export const SOURCE_LABELS: Record<SourceKind | 'inline', { label: string; hue: string }> = {
    inline: { label: 'inline', hue: 'teal' },
    static: { label: 'static', hue: 'teal' },
    echo: { label: 'postman-echo', hue: 'pink' },
    dhis2: { label: 'DHIS2', hue: 'violet' },
}

/** The CSS variables a `.chip` reads for a hue. */
export function chipStyle(hue: string): Record<string, string> {
    return { '--chip': `var(--kind-${hue})`, '--chip-ink': `var(--kind-${hue}-ink)` }
}
