/**
 * jq's error text as structured errors. Mirrors `playground_jq.jq.diagnostics` and the stderr
 * reading in `playground_jq.jq.binary`, for the in-browser engine.
 */

import type { ErrorKind, JqError } from '@/lib/types'

const COMPILE_ERROR =
    /jq: error: (?<message>.+?) at <[^>]+>, line (?<line>\d+)(?:, column (?<column>\d+))?:(?:\n(?<source>[^\n]*)\n(?<marker>[ \t]*\^+))?/g

const TALLY = /^jq: \d+ compile errors?$/gm

const RUNTIME_PREFIX = /^jq: error \(at [^)]*\): /

function error(
    kind: ErrorKind,
    message: string,
    line: number | null = null,
    column: number | null = null,
    end: number | null = null,
): JqError {
    return { kind, message, line, column, end_column: end }
}

/** Every compile error in jq's stderr, located where jq says. */
export function compileErrors(text: string): JqError[] {
    const found: JqError[] = []
    for (const match of text.matchAll(COMPILE_ERROR)) {
        const groups = match.groups ?? {}
        const line = Number(groups.line)
        const column = groups.column === undefined ? null : Number(groups.column)
        const marker = groups.marker
        const end =
            column !== null && marker !== undefined
                ? column + Math.max((marker.match(/\^/g) ?? []).length, 1)
                : null
        found.push(error('compile', groups.message ?? '', line, column, end))
    }
    if (found.length > 0) return found
    const cleaned = text
        .replace(TALLY, '')
        .trim()
        .replace(/^jq: error: /, '')
    return [error('compile', cleaned || text.trim())]
}

/** Outputs, errors and stderr messages from one run's streams and exit code. */
export function readStreams(stderr: string, exitCode: number): { errors: JqError[]; messages: string[] } {
    if (exitCode === 3) return { errors: compileErrors(stderr), messages: [] }
    const errors: JqError[] = []
    const messages: string[] = []
    for (const line of stderr.split('\n')) {
        if (line === '') continue
        if (line.startsWith('jq: parse error:')) errors.push(error('input', line.replace(/^jq: /, '')))
        else if (line.startsWith('jq: error'))
            errors.push(error('runtime', line.replace(RUNTIME_PREFIX, '').replace(/^jq: error: /, '')))
        else if (line.startsWith('["DEBUG:",')) {
            const parsed = JSON.parse(line) as [string, unknown]
            messages.push(`DEBUG: ${JSON.stringify(parsed[1])}`)
        } else messages.push(line)
    }
    if (exitCode !== 0 && errors.length === 0) {
        errors.push(error('runtime', messages.join('\n') || `jq exited with status ${String(exitCode)}`))
        return { errors, messages: [] }
    }
    return { errors, messages }
}
