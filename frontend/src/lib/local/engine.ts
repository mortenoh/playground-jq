/**
 * Running a program in the browser with jq-wasm (jq 1.8.2), for the static build. It answers
 * with the same `RunResult` the server does: the same stand-in `$ENV`, the same located
 * compile errors, the same formatting (jq's own), and the equivalent command line.
 */

import { equivalentCommand, inputFlags, outputFlags, readsInput } from '@/lib/local/command'
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

function parseLines(stdout: string): { outputs: JsonValue[]; truncated: boolean } {
    const outputs: JsonValue[] = []
    for (const line of stdout.split('\n')) {
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
        ...partial,
        duration_ms: Math.round((performance.now() - started) * 100) / 100,
    })
    const wrapped = SANDBOX_PREFIX + program + SANDBOX_SUFFIX
    const reading = inputFlags(options)
    try {
        // One run for the values (compact JSON, one per line), one for the text as jq prints it.
        const values = await exchange(input, wrapped, ['-c', ...reading])
        if (values.exitCode === 3) {
            // Compile errors are located against the author's program, not the sandbox wrapper.
            const bare = await exchange('null', program, ['-n', ...reading.filter((flag) => flag !== '-n')])
            return finish({ errors: compileErrors(bare.stderr || values.stderr) })
        }
        const { outputs, truncated } = parseLines(values.stdout)
        const { errors, messages } = readStreams(values.stderr, values.exitCode)
        const printed = await exchange(input, wrapped, [...reading, ...outputFlags(options)])
        const text = printed.stdout === '' ? '' : options.join_output ? printed.stdout : `${printed.stdout}\n`
        return finish({
            outputs,
            truncated,
            errors,
            messages,
            text,
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
