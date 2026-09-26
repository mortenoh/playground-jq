/** jq command lines for a set of options. Mirrors `playground_jq.jq.formatting` flag for flag. */

import type { RunOptions } from '@/lib/types'

/** Quote a word for a POSIX shell the way Python's `shlex.quote` does. */
export function shellQuote(word: string): string {
    if (word === '') return "''"
    if (/^[\w@%+=:,./-]+$/.test(word)) return word
    return `'${word.replaceAll("'", `'"'"'`)}'`
}

/** Flags that change what jq reads (`--seq` changes reading as well as printing). */
export function readingFlags(options: RunOptions): string[] {
    const flags: string[] = []
    if (options.null_input) flags.push('-n')
    if (options.slurp) flags.push('-s')
    if (options.raw_input) flags.push('-R')
    if (options.stream) flags.push('--stream')
    if (options.seq) flags.push('--seq')
    return flags
}

/** Flags that change printing (and `-e`), in the order the command shows them. */
export function outputFlags(options: RunOptions): string[] {
    const flags: string[] = []
    if (options.join_output) flags.push('-j')
    else if (options.raw_output0) flags.push('--raw-output0')
    else if (options.raw_output) flags.push('-r')
    if (options.ascii_output) flags.push('-a')
    if (options.color) flags.push('-C')
    if (options.compact) flags.push('-c')
    if (options.sort_keys) flags.push('-S')
    if (options.tab) flags.push('--tab')
    if (options.seq) flags.push('--seq')
    if (options.exit_status) flags.push('-e')
    if (options.indent !== 2 && !options.tab && !options.compact)
        flags.push('--indent', String(options.indent))
    return flags
}

/** `--arg`, `--argjson`, `--slurpfile`, `--rawfile` and `-L`, with the file names the command shows. */
export function variableFlags(options: RunOptions): string[] {
    const flags: string[] = []
    for (const [name, value] of Object.entries(options.args)) flags.push('--arg', name, value)
    for (const [name, value] of Object.entries(options.argjson))
        flags.push('--argjson', name, JSON.stringify(value))
    for (const name of Object.keys(options.slurpfile)) flags.push('--slurpfile', name, `${name}.json`)
    for (const name of Object.keys(options.rawfile)) flags.push('--rawfile', name, `${name}.txt`)
    if (Object.keys(options.modules).length > 0) flags.push('-L', 'modules')
    return flags
}

/** The program, and after it the positional arguments with the flag that introduces them. */
export function programAndPositional(program: string, options: RunOptions): string[] {
    if (options.positional.length === 0) return [program]
    return [options.positional_json ? '--jsonargs' : '--args', program, ...options.positional]
}

/** The equivalent `jq` command line. */
export function equivalentCommand(program: string, options: RunOptions, withInput: boolean): string {
    const reading = readingFlags(options).filter((flag) => flag !== '--seq')
    const words = [...reading, ...outputFlags(options), ...variableFlags(options)]
    const command = [
        'jq',
        ...words.map(shellQuote),
        ...programAndPositional(program, options).map(shellQuote),
    ]
    // With positional arguments a file name would be read as one, so the input is redirected.
    if (withInput) command.push(...(options.positional.length > 0 ? ['<', 'input.json'] : ['input.json']))
    return command.join(' ')
}

/** Whether a run reads input text at all. */
export function readsInput(program: string, options: RunOptions): boolean {
    return !options.null_input || /(?<![\w$.])inputs?\b/.test(program)
}
