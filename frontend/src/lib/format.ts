/**
 * JSON formatting for the input pane: indented, with arrays of plain numbers on one line so
 * GeoJSON coordinates stay readable. Mirrors `dump_json` in `playground_jq.sources.base`.
 */

import type { JsonValue } from '@/lib/types'

function dump(value: JsonValue, depth: number): string {
    const pad = '  '.repeat(depth + 1)
    const end = '  '.repeat(depth)
    if (Array.isArray(value)) {
        if (value.length === 0) return '[]'
        if (value.every((item) => typeof item === 'number'))
            return `[${value.map((item) => JSON.stringify(item)).join(', ')}]`
        return `[\n${value.map((item) => pad + dump(item, depth + 1)).join(',\n')}\n${end}]`
    }
    if (value !== null && typeof value === 'object') {
        const entries = Object.entries(value)
        if (entries.length === 0) return '{}'
        return `{\n${entries.map(([key, item]) => `${pad}${JSON.stringify(key)}: ${dump(item, depth + 1)}`).join(',\n')}\n${end}}`
    }
    return JSON.stringify(value)
}

/** Format every JSON value in a text (several values, as jq reads them, are kept apart). */
export function formatJson(text: string): string | null {
    try {
        return `${dump(JSON.parse(text) as JsonValue, 0)}\n`
    } catch {
        return null
    }
}
