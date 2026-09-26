/**
 * Running a program in the browser with jq-wasm (jq 1.8.2), for the static build. It answers
 * with the same `RunResult` the server does: the same stand-in `$ENV`, the same located
 * compile errors, the same formatting (jq's own), and the equivalent command line.
 */

import { equivalentCommand, outputFlags, readingFlags, readsInput } from '@/lib/local/command'
import { compileErrors, readStreams } from '@/lib/local/diagnostics'
import { isGeoJson } from '@/lib/local/geojson'
import type { WorkerReply, WorkerRequest } from '@/lib/local/jq.worker'
import type { JsonValue, RunOptions, RunResult } from '@/lib/types'

/** The environment programs see as `$ENV`, as on the server. */
export const SANDBOX_ENV = {
    HOME: '/home/learner',
    USER: 'learner',
    SHELL: '/bin/bash',
    PAGER: 'less',
    LANG: 'C.UTF-8',
    TZ: 'UTC',
}

const SANDBOX_PREFIX = `${JSON.stringify(SANDBOX_ENV)} as $ENV | def env: $ENV; (`
const SANDBOX_SUFFIX = '\n)'

/** What `--seq` prints before every output. */
const RECORD_SEPARATOR = String.fromCharCode(0x1e)

const TIMEOUT_MS = 4000
const MAX_OUTPUTS = 10_000

let worker: Worker | null = null
let sequence = 0
const waiting = new Map<number, (reply: WorkerReply) => void>()

function startWorker(): Worker {
    const created = new Worker(new URL('./jq.worker.ts', import.meta.url), { type: 'module' })
    created.onmessage = (event: MessageEvent<WorkerReply>) => {
        waiting.get(event.data.id)?.(event.data)
        waiting.delete(event.data.id)
    }
    return created
}

class Timeout extends Error {}

/** Run jq once in the worker, terminating it when the time limit is reached. */
function exchange(input: string, program: string, flags: string[]): Promise<WorkerReply> {
    worker ??= startWorker()
    const id = ++sequence
    const request: WorkerRequest = { id, input, program, flags }
    return new Promise((resolve, reject) => {
        const timer = setTimeout(() => {
            waiting.delete(id)
            worker?.terminate()
            worker = null
            reject(new Timeout())
        }, TIMEOUT_MS)
        waiting.set(id, (reply) => {
            clearTimeout(timer)
            resolve(reply)
        })
        worker?.postMessage(request)
    })
}

/** Every output value from compact stdout; `--seq` puts a record separator before each one. */
export function parseLines(stdout: string): { outputs: JsonValue[]; truncated: boolean } {
    const outputs: JsonValue[] = []
    for (const raw of stdout.split('\n')) {
        const line = raw.startsWith(RECORD_SEPARATOR) ? raw.slice(1) : raw
        if (line === '') continue
        if (outputs.length >= MAX_OUTPUTS) return { outputs, truncated: true }
        outputs.push(JSON.parse(line) as JsonValue)
    }
    return { outputs, truncated: false }
}

/** Run a program over an input text in the browser. */
export async function runLocally(program: string, input: string, options: RunOptions): Promise<RunResult> {
    const started = performance.now()
    const command = equivalentCommand(program, options, readsInput(program, options))
    const finish = (partial: Partial<RunResult>): RunResult => ({
        ok: (partial.errors ?? []).length === 0,
        engine: 'cli',
        outputs: [],
        text: '',
        errors: [],
        messages: [],
        truncated: false,
        is_geojson: false,
        command,
        exit_code: null,
        ...partial,
        duration_ms: Math.round((performance.now() - started) * 100) / 100,
    })
    if (Object.keys(options.modules).length > 0) {
        return finish({
            errors: [
                {
                    kind: 'unavailable',
                    message: 'modules (-L) need files on disk; run the playground locally to use them',
                    line: null,
                    column: null,
                    end_column: null,
                },
            ],
        })
    }
    const reading = readingFlags(options)
    try {
        // The browser has no files: a slurp file is bound the way jq binds it, as the array of its
        // values (jq itself reads them, so number literals keep their form), and a raw file as text.
        const variables: string[] = []
        for (const [name, value] of Object.entries(options.args)) variables.push('--arg', name, value)
        for (const [name, value] of Object.entries(options.argjson))
            variables.push('--argjson', name, JSON.stringify(value))
        for (const [name, content] of Object.entries(options.slurpfile)) {
            const slurped = await exchange(content, '.', ['-c', '-s'])
            if (slurped.exitCode !== 0) {
                return finish({
                    errors: [
                        {
                            kind: 'input',
                            message: `--slurpfile ${name}: ${slurped.stderr.replace(/^jq: /, '')}`,
                            line: null,
                            column: null,
                            end_column: null,
                        },
                    ],
                })
            }
            variables.push('--argjson', name, slurped.stdout.trim())
        }
        for (const [name, content] of Object.entries(options.rawfile)) variables.push('--arg', name, content)
        const bound = variables
        // Positional arguments reach the program through $ARGS, which jq builds from every variable.
        let argumentsPrefix = ''
        if (options.positional.length > 0) {
            const named = await exchange('null', '$ARGS.named', ['-n', '-c', ...bound])
            const positional = options.positional_json
                ? `[${options.positional.join(',')}]`
                : JSON.stringify(options.positional)
            argumentsPrefix = `{"positional": ${positional}, "named": ${named.stdout.trim()}} as $ARGS | `
        }
        const wrapped = SANDBOX_PREFIX + argumentsPrefix + program + SANDBOX_SUFFIX
        // One run for the values (compact JSON, one per line), one for the text as jq prints it.
        const values = await exchange(input, wrapped, ['-c', ...reading, ...bound])
        if (values.exitCode === 3) {
            // Compile errors are located against the author's program, not the sandbox wrapper.
            const bare = await exchange('null', program, [
                '-n',
                ...reading.filter((flag) => flag !== '-n'),
                ...bound,
            ])
            return finish({ errors: compileErrors(bare.stderr || values.stderr) })
        }
        const { outputs, truncated } = parseLines(values.stdout)
        const { errors, messages } = readStreams(values.stderr, values.exitCode)
        const printing = [
            ...readingFlags(options).filter((flag) => flag !== '--seq'),
            ...outputFlags(options),
            ...bound,
        ]
        const printed = await exchange(input, wrapped, printing)
        return finish({
            outputs,
            truncated,
            errors,
            messages,
            text: printed.stdout,
            exit_code: printed.exitCode,
            is_geojson: outputs.length === 1 && errors.length === 0 && isGeoJson(outputs[0]),
        })
    } catch (error) {
        if (error instanceof Timeout) {
            return finish({
                errors: [
                    {
                        kind: 'timeout',
                        message: `the program ran longer than ${String(TIMEOUT_MS / 1000)}s and was stopped`,
                        line: null,
                        column: null,
                        end_column: null,
                    },
                ],
            })
        }
        throw error
    }
}
