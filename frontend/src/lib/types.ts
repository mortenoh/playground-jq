/**
 * The wire shapes, written by hand to mirror the pydantic schemas in `playground_jq`.
 * Each interface names the model it mirrors.
 */

export type JsonValue = null | boolean | number | string | JsonValue[] | { [key: string]: JsonValue }

/** Mirrors `playground_jq.jq.models.RunOptions`. */
export interface RunOptions {
    slurp: boolean
    null_input: boolean
    raw_input: boolean
    raw_output: boolean
    join_output: boolean
    ascii_output: boolean
    compact: boolean
    sort_keys: boolean
    tab: boolean
    indent: number
    seq: boolean
    stream: boolean
    args: Record<string, string>
    argjson: Record<string, JsonValue>
    exit_status: boolean
    raw_output0: boolean
    color: boolean
    positional: string[]
    positional_json: boolean
    slurpfile: Record<string, string>
    rawfile: Record<string, string>
    modules: Record<string, string>
    engine: 'auto' | 'library' | 'cli'
}

export const DEFAULT_OPTIONS: RunOptions = {
    slurp: false,
    null_input: false,
    raw_input: false,
    raw_output: false,
    join_output: false,
    ascii_output: false,
    compact: false,
    sort_keys: false,
    tab: false,
    indent: 2,
    seq: false,
    stream: false,
    args: {},
    argjson: {},
    exit_status: false,
    raw_output0: false,
    color: false,
    positional: [],
    positional_json: false,
    slurpfile: {},
    rawfile: {},
    modules: {},
    engine: 'auto',
}

export type ErrorKind = 'compile' | 'input' | 'runtime' | 'timeout' | 'limit' | 'unavailable'

/** Mirrors `playground_jq.jq.models.JqError`. */
export interface JqError {
    kind: ErrorKind
    message: string
    line: number | null
    column: number | null
    end_column: number | null
}

/** Mirrors `playground_jq.jq.models.RunResult`. */
export interface RunResult {
    ok: boolean
    engine: 'library' | 'cli'
    outputs: JsonValue[]
    text: string
    errors: JqError[]
    messages: string[]
    truncated: boolean
    duration_ms: number
    is_geojson: boolean
    command: string
    exit_code: number | null
}

export type SourceKind = 'static' | 'echo' | 'dhis2'
export type InputFormat = 'json' | 'ndjson' | 'text' | 'geojson'

/** Mirrors `playground_jq.sources.base.Preset`. */
export interface Preset {
    id: string
    title: string
    description: string
    format: InputFormat
    tags: string[]
    request: Record<string, JsonValue>
    /** The program the playground suggests for this input (verified like every example). */
    program: string | null
    options: Partial<RunOptions>
}

/** Mirrors `playground_jq.sources.base.SourceInfo`. */
export interface SourceInfo {
    id: SourceKind
    title: string
    description: string
    live: boolean
    available: boolean
    presets: Preset[]
    base_url: string | null
}

/** Mirrors `playground_jq.sources.base.FetchRequest`. */
export interface FetchRequest {
    preset?: string | null
    request?: Record<string, JsonValue>
    mode?: 'live' | 'snapshot'
}

/** Mirrors `playground_jq.sources.base.Fetched`. */
export interface Fetched {
    source: SourceKind
    preset: string | null
    text: string
    format: InputFormat
    snapshot: boolean
    cached: boolean
    url: string | null
    bytes: number
}

/** Mirrors `playground_jq.sources.geojson.GeoJsonReport`. */
export interface GeoJsonReport {
    valid: boolean
    type: string | null
    features: number | null
    problems: string[]
}

export type Level = 101 | 201 | 301

/** Mirrors `playground_jq.content.models.InputSpec`. */
export interface InputSpec {
    ref: string | null
    text: string | null
}

/** Mirrors `playground_jq.content.models.Check`. */
export interface Check {
    expected: JsonValue[] | null
    digest: string | null
    error: string | null
    unordered: boolean
    geojson: boolean
}

/** Mirrors `playground_jq.content.models.Example`. */
export interface Example extends Check {
    id: string
    title: string
    group: string
    level: Level
    tags: string[]
    explanation: string
    program: string
    input: InputSpec
    options: RunOptions
    manual: string[]
    guide: string[]
    live: boolean
    attribution: string | null
}

/** Mirrors `playground_jq.routes.content.ExampleSummary`. */
export interface ExampleSummary {
    id: string
    title: string
    group: string
    level: Level
    tags: string[]
    source: SourceKind | 'inline'
    program: string
}

/** Mirrors `playground_jq.routes.content.GroupOut`. */
export interface ExampleGroup {
    id: string
    title: string
    description: string
    track: 'language' | 'dhis2' | 'echo' | 'patterns' | 'manual'
    examples: ExampleSummary[]
}

/** Mirrors `playground_jq.content.models.TutorialStep`. */
export interface TutorialStep extends Check {
    title: string
    body: string
    task: string
    hints: string[]
    solution: string
    starter: string
    options: RunOptions
    why: string
}

/** Mirrors `playground_jq.content.models.Tutorial`. */
export interface Tutorial {
    id: string
    level: Level
    order: number
    title: string
    summary: string
    input: InputSpec
    guide: string[]
    steps: TutorialStep[]
}

/** Mirrors `playground_jq.routes.content.TutorialSummary`. */
export interface TutorialSummary {
    id: string
    level: Level
    title: string
    summary: string
    steps: number
}

/** Mirrors `playground_jq.routes.content.StepCheckResult`. */
export interface StepCheckResult {
    passed: boolean
    reason: string
    result: RunResult
    expected: JsonValue[]
}

/** Mirrors `playground_jq.content.models.ChapterSummary`. */
export interface ChapterSummary {
    slug: string
    number: number
    title: string
    summary: string
    level: Level
}

/** Mirrors `playground_jq.content.models.Snippet`. */
export interface Snippet extends Check {
    id: string
    program: string
    input: InputSpec | null
    options: RunOptions
    caption: string
    cli_only: boolean
}

/** Mirrors `playground_jq.content.models.Chapter`. */
export interface Chapter extends ChapterSummary {
    markdown: string
    snippets: Snippet[]
}

/** Mirrors `playground_jq.content.models.Builtin`. */
export interface Builtin {
    name: string
    signatures: string[]
    summary: string
    section: string
    body: string
    manual: string
}
