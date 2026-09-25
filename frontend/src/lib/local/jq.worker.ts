/**
 * jq in a Web Worker. jq-wasm runs synchronously, so a program that never ends would freeze
 * the page if it ran on the main thread; here the page terminates the worker instead.
 */

import { loadJq } from 'jq-wasm'
import wasmUrl from 'jq-wasm/jq.wasm?url'

export interface WorkerRequest {
    id: number
    input: string
    program: string
    flags: string[]
}

export interface WorkerReply {
    id: number
    stdout: string
    stderr: string
    exitCode: number
}

const ready = loadJq({ wasmURL: wasmUrl })

self.onmessage = async (event: MessageEvent<WorkerRequest>) => {
    const { id, input, program, flags } = event.data
    const jq = await ready
    const result = jq.raw(input, program, flags)
    const reply: WorkerReply = { id, stdout: result.stdout, stderr: result.stderr, exitCode: result.exitCode }
    self.postMessage(reply)
}
