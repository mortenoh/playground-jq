/** The jq command-line flags for a set of options. Mirrors `playground_jq.jq.formatting`. */

import type { RunOptions } from '@/lib/types'

/** Quote a word for a POSIX shell the way Python's `shlex.quote` does. */
export function shellQuote(word: string): string {
    if (word === '') return "''"
    if (/^[\w@%+=:,./-]+$/.test(word)) return word
    return `'${word.replaceAll("'", `'"'"'`)}'`
}

/** Flags that change what jq reads or which variables it has; `--seq` changes reading and printing. */
export function inputFlags(options: RunOptions): string[] {
    const flags: string[] = []
    if (options.seq) flags.push('--seq')
    if (options.null_input) flags.push('-n')
    if (options.slurp) flags.push('-s')
    if (options.raw_input) flags.push('-R')
    if (options.stream) flags.push('--stream')
    for (const [name, value] of Object.entries(options.args)) flags.push('--arg', name, value)
    for (const [name, value] of Object.entries(options.argjson))
        flags.push('--argjson', name, JSON.stringify(value))
    return flags
}

/** Flags that change how jq prints. */
export function outputFlags(options: RunOptions): string[] {
    const flags: string[] = []
    if (options.join_output) flags.push('-j')
    else if (options.raw_output) flags.push('-r')
    if (options.ascii_output) flags.push('-a')
    if (options.compact) flags.push('-c')
    if (options.sort_keys) flags.push('-S')
    if (options.tab) flags.push('--tab')
    if (options.indent !== 2 && !options.tab && !options.compact)
        flags.push('--indent', String(options.indent))
    return flags
}

/** The equivalent `jq` command line. */
export function equivalentCommand(program: string, options: RunOptions, withInput: boolean): string {
    const flags: string[] = []
    for (const [enabled, flag] of [
        [options.null_input, '-n'],
        [options.slurp, '-s'],
        [options.raw_input, '-R'],
        [options.join_output, '-j'],
        [options.raw_output && !options.join_output, '-r'],
        [options.ascii_output, '-a'],
        [options.compact, '-c'],
        [options.sort_keys, '-S'],
        [options.tab, '--tab'],
        [options.seq, '--seq'],
        [options.stream, '--stream'],
    ] as const) {
        if (enabled) flags.push(flag)
    }
    if (options.indent !== 2 && !options.tab && !options.compact)
        flags.push('--indent', String(options.indent))
    for (const [name, value] of Object.entries(options.args)) flags.push('--arg', name, shellQuote(value))
    for (const [name, value] of Object.entries(options.argjson))
        flags.push('--argjson', name, shellQuote(JSON.stringify(value)))
    const command = ['jq', ...flags, shellQuote(program)]
    if (withInput) command.push('input.json')
    return command.join(' ')
}

/** Whether a run reads input text at all. */
export function readsInput(program: string, options: RunOptions): boolean {
    return !options.null_input || /(?<![\w$.])inputs?\b/.test(program)
}
