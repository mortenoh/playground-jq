/**
 * Outputs printed the way the jq command line prints them for a set of flags: indentation,
 * `-c`, `--tab`, `-S`, `-a`, `-r`, `-j` and `--seq`. Used where only the values are recorded
 * (guide snippets) and the text has to be shown.
 */

import { canonical } from '@/lib/diff'
import type { JsonValue, RunOptions } from '@/lib/types'

function sortKeys(value: JsonValue): JsonValue {
    return JSON.parse(canonical(value)) as JsonValue
}

function asciiOnly(text: string): string {
    let result = ''
    for (const char of text) {
        const code = char.codePointAt(0) ?? 0
        if (code < 0x80) {
            result += char
        } else if (code > 0xffff) {
            const high = Math.floor((code - 0x10000) / 0x400) + 0xd800
            const low = ((code - 0x10000) % 0x400) + 0xdc00
            result += `\\u${high.toString(16)}\\u${low.toString(16)}`
        } else {
            result += `\\u${code.toString(16).padStart(4, '0')}`
        }
    }
    return result
}

/** One output as jq prints it. */
export function printValue(value: JsonValue, options: RunOptions): string {
    if (typeof value === 'string' && (options.raw_output || options.join_output)) return value
    const shown = options.sort_keys ? sortKeys(value) : value
    const compact = options.compact || (options.indent === 0 && !options.tab)
    const indent = compact ? undefined : options.tab ? '\t' : options.indent
    const text = JSON.stringify(shown, null, indent)
    return options.ascii_output ? asciiOnly(text) : text
}

/** Every output as jq prints the stream. */
export function printOutputs(values: JsonValue[], options: RunOptions): string {
    const parts = values.map((value) => (options.seq ? '\u001e' : '') + printValue(value, options))
    return options.join_output ? parts.join('') : parts.join('\n')
}
