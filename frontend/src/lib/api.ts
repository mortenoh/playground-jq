/**
 * The one place the app calls `fetch`.
 *
 * The API prefix is read once from `/config.json` (the server decides it), and every refusal
 * arrives as an RFC 9457 problem document, wrapped here in an `ApiError`.
 */

export const CONFIG_PATH = '/config.json'

export interface AppConfig {
    api_prefix: string
    version: string
}

export interface Issue {
    loc: (string | number)[]
    msg: string
}

export interface Problem {
    status: number
    title: string
    detail: string
    code: string
    problems: Issue[]
    instance: string | null
}

export class ApiError extends Error {
    readonly status: number
    readonly problem: Problem

    constructor(problem: Problem) {
        super(problem.detail)
        this.name = 'ApiError'
        this.status = problem.status
        this.problem = problem
    }
}

/** A problem document from a response body, or a stand-in when the body is not one. */
export function problemOf(status: number, body: unknown, path: string): Problem {
    const fallback: Problem = {
        status,
        title: status === 0 ? 'No answer' : `HTTP ${String(status)}`,
        detail:
            status === 0
                ? 'The server did not answer. It may be starting, or the connection was lost.'
                : `The server answered ${String(status)} with no problem document.`,
        code: status === 0 ? 'client.no_answer' : 'client.no_problem_document',
        problems: [],
        instance: path,
    }
    if (body === null || typeof body !== 'object') return fallback
    const candidate = body as Record<string, unknown>
    if (typeof candidate.detail !== 'string' || typeof candidate.title !== 'string') return fallback
    return {
        status: typeof candidate.status === 'number' ? candidate.status : status,
        title: candidate.title,
        detail: candidate.detail,
        code: typeof candidate.code === 'string' ? candidate.code : fallback.code,
        problems: Array.isArray(candidate.problems) ? (candidate.problems as Issue[]) : [],
        instance: typeof candidate.instance === 'string' ? candidate.instance : path,
    }
}

let pending: Promise<AppConfig> | null = null

/** The server's config document, read once and shared. */
export function appConfig(): Promise<AppConfig> {
    pending ??= readConfig().catch((error: unknown) => {
        pending = null
        throw error
    })
    return pending
}

/** Forget the cached config (tests). */
export function forgetConfig(): void {
    pending = null
}

async function readConfig(): Promise<AppConfig> {
    const response = await fetch(CONFIG_PATH, { headers: { accept: 'application/json' } })
    const body: unknown = await response.json().catch(() => null)
    if (!response.ok) throw new ApiError(problemOf(response.status, body, CONFIG_PATH))
    const candidate = body as Record<string, unknown> | null
    if (candidate === null || typeof candidate.api_prefix !== 'string') {
        throw new ApiError(problemOf(response.status, null, CONFIG_PATH))
    }
    return { api_prefix: candidate.api_prefix, version: String(candidate.version ?? '') }
}

/** An API path joined to the prefix. */
export function apiUrl(prefix: string, path: string): string {
    if (!path.startsWith('/')) throw new Error(`an API path must start with '/': ${path}`)
    return `${prefix}${path}`
}

/** GET (or any method) an API path and parse the JSON answer, raising `ApiError` on a refusal. */
export async function apiJson<T>(path: string, init: RequestInit = {}): Promise<T> {
    let response: Response
    try {
        const config = await appConfig()
        const headers = new Headers(init.headers)
        if (!headers.has('accept')) headers.set('accept', 'application/json')
        response = await fetch(apiUrl(config.api_prefix, path), { ...init, headers })
    } catch (error) {
        if (error instanceof ApiError) throw error
        throw new ApiError(problemOf(0, null, path))
    }
    const body: unknown = await response.json().catch(() => null)
    if (!response.ok) throw new ApiError(problemOf(response.status, body, path))
    return body as T
}

/** POST a JSON body to an API path. */
export function apiSend<T>(path: string, body: unknown, method = 'POST'): Promise<T> {
    return apiJson<T>(path, {
        method,
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(body),
    })
}
