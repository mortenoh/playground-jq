/** Typed calls to every API route. */

import { apiJson, apiSend } from '@/lib/api'
import type {
    Builtin,
    Chapter,
    ChapterSummary,
    Example,
    ExampleGroup,
    Fetched,
    FetchRequest,
    GeoJsonReport,
    InputSpec,
    JsonValue,
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

export const runProgram = (request: RunRequest) => apiSend<RunResult>('/run', request)

export const listSources = () => apiJson<SourceInfo[]>('/sources')

export const fetchSource = (source: SourceKind, request: FetchRequest) =>
    apiSend<Fetched>(`/sources/${source}/fetch`, request)

export const validateGeoJson = (value: JsonValue) => apiSend<GeoJsonReport>('/geojson/validate', value)

export const listExamples = () => apiJson<ExampleGroup[]>('/examples')

export const getExample = (id: string) => apiJson<Example>(`/examples/${encodeURIComponent(id)}`)

export const resolveInput = (spec: InputSpec) => apiSend<{ text: string }>('/inputs/resolve', spec)

export const listTutorials = () => apiJson<TutorialSummary[]>('/tutorials')

export const getTutorial = (id: string) => apiJson<Tutorial>(`/tutorials/${encodeURIComponent(id)}`)

export const checkStep = (id: string, step: number, program: string) =>
    apiSend<StepCheckResult>(`/tutorials/${encodeURIComponent(id)}/steps/${String(step)}/check`, { program })

export const guideToc = () => apiJson<ChapterSummary[]>('/guide')

export const getChapter = (slug: string) => apiJson<Chapter>(`/guide/${encodeURIComponent(slug)}`)

export const listBuiltins = () => apiJson<Builtin[]>('/builtins')
