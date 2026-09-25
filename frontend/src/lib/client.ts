/**
 * Typed calls to every API route. In the static build the same calls read the JSON files
 * exported at build time and run jq in the browser, so every page works without a server.
 */

import { apiJson, apiSend, ApiError, problemOf } from '@/lib/api'
import { compareOutputs } from '@/lib/diff'
import { runLocally } from '@/lib/local/engine'
import { STATIC, staticUrl } from '@/lib/runtime'
import type {
    Builtin,
    Chapter,
    ChapterSummary,
    Example,
    ExampleGroup,
    Fetched,
    FetchRequest,
    InputSpec,
    RunOptions,
    RunResult,
    SourceInfo,
    SourceKind,
    StepCheckResult,
    Tutorial,
    TutorialSummary,
} from '@/lib/types'

export interface RunRequest {
    program: string
    input?: string
    source?: { id: SourceKind; fetch: FetchRequest }
    options: RunOptions
}

async function staticFile(path: string): Promise<Response> {
    let response: Response
    try {
        response = await fetch(staticUrl(path))
    } catch {
        throw new ApiError(problemOf(0, null, path))
    }
    if (!response.ok) throw new ApiError(problemOf(response.status, null, path))
    return response
}

async function staticJson<T>(path: string): Promise<T> {
    return (await (await staticFile(path)).json()) as T
}

async function staticText(ref: string): Promise<string> {
    const [source, preset] = ref.split(':')
    return (await staticFile(`inputs/${source ?? ''}/${preset ?? ''}.txt`)).text()
}

export async function runProgram(request: RunRequest): Promise<RunResult> {
    if (!STATIC) return apiSend<RunResult>('/run', request)
    const input =
        request.source === undefined
            ? (request.input ?? '')
            : await staticText(`${request.source.id}:${request.source.fetch.preset ?? ''}`)
    return runLocally(request.program, input, request.options)
}

export const listSources = () =>
    STATIC ? staticJson<SourceInfo[]>('sources.json') : apiJson<SourceInfo[]>('/sources')

export async function fetchSource(source: SourceKind, request: FetchRequest): Promise<Fetched> {
    if (!STATIC) return apiSend<Fetched>(`/sources/${source}/fetch`, request)
    const sources = await listSources()
    const preset = sources
        .find((info) => info.id === source)
        ?.presets.find((item) => item.id === request.preset)
    if (preset === undefined) {
        throw new ApiError({
            status: 404,
            title: 'Not Found',
            detail: 'This build has no server: only the recorded inputs are available.',
            code: 'static.no_live',
            problems: [],
            instance: null,
        })
    }
    const text = await staticText(`${source}:${preset.id}`)
    return {
        source,
        preset: preset.id,
        text,
        format: preset.format,
        snapshot: true,
        cached: false,
        url: null,
        bytes: new TextEncoder().encode(text).length,
    }
}

export const listExamples = () =>
    STATIC ? staticJson<ExampleGroup[]>('examples.json') : apiJson<ExampleGroup[]>('/examples')

export const getExample = (id: string) =>
    STATIC
        ? staticJson<Example>(`examples/${encodeURIComponent(id)}.json`)
        : apiJson<Example>(`/examples/${encodeURIComponent(id)}`)

export async function resolveInput(spec: InputSpec): Promise<{ text: string }> {
    if (!STATIC) return apiSend<{ text: string }>('/inputs/resolve', spec)
    if (spec.text !== null) return { text: spec.text }
    return { text: spec.ref === null ? '' : await staticText(spec.ref) }
}

export const listTutorials = () =>
    STATIC ? staticJson<TutorialSummary[]>('tutorials.json') : apiJson<TutorialSummary[]>('/tutorials')

export const getTutorial = (id: string) =>
    STATIC
        ? staticJson<Tutorial>(`tutorials/${encodeURIComponent(id)}.json`)
        : apiJson<Tutorial>(`/tutorials/${encodeURIComponent(id)}`)

export async function checkStep(id: string, step: number, program: string): Promise<StepCheckResult> {
    if (!STATIC) {
        return apiSend<StepCheckResult>(`/tutorials/${encodeURIComponent(id)}/steps/${String(step)}/check`, {
            program,
        })
    }
    const tutorial = await getTutorial(id)
    const current = tutorial.steps[step - 1]
    if (current === undefined) throw new ApiError(problemOf(404, null, `tutorials/${id}/${String(step)}`))
    const { text } = await resolveInput(tutorial.input)
    const result = await runLocally(program, text, current.options)
    const expected = current.expected ?? []
    if (current.error !== null) {
        const said = result.errors.map((error) => error.message).join(' ')
        const passed = !result.ok && said.includes(current.error)
        return {
            passed,
            reason: passed ? '' : `expected an error containing "${current.error}"`,
            result,
            expected,
        }
    }
    if (!result.ok) {
        return {
            passed: false,
            reason: result.errors.map((error) => `${error.kind}: ${error.message}`).join('; '),
            result,
            expected,
        }
    }
    const comparison = compareOutputs(expected, result.outputs, { unordered: current.unordered })
    return { passed: comparison.same, reason: comparison.same ? '' : comparison.summary, result, expected }
}

export const guideToc = () =>
    STATIC ? staticJson<ChapterSummary[]>('guide.json') : apiJson<ChapterSummary[]>('/guide')

export const getChapter = (slug: string) =>
    STATIC
        ? staticJson<Chapter>(`guide/${encodeURIComponent(slug)}.json`)
        : apiJson<Chapter>(`/guide/${encodeURIComponent(slug)}`)

export const listBuiltins = () =>
    STATIC ? staticJson<Builtin[]>('builtins.json') : apiJson<Builtin[]>('/builtins')
