/**
 * The playground's state: the program, the input, the flags, and where the input came from.
 * It lives outside React so every page can open something in the playground by writing here.
 */

import { persistedStore } from '@/lib/store'
import { DEFAULT_OPTIONS, type RunOptions } from '@/lib/types'

/** Where the input text came from, for the input pane's header and for share links. */
export interface InputOrigin {
    /** `static:bookstore`, `dhis2:system-info`, ... */
    ref: string
    title: string
    /** Fetched live rather than read from a recorded snapshot. */
    live: boolean
}

/** A lesson shown beside the playground when an example or snippet was opened into it. */
export interface Lesson {
    kind: 'example' | 'snippet'
    id: string
    title: string
    explanation: string
    manual: string[]
    attribution: string | null
}

export interface PlaygroundState {
    program: string
    input: string
    options: RunOptions
    origin: InputOrigin | null
    lesson: Lesson | null
    /** The program last suggested for an input; a program still equal to it may be replaced. */
    suggested?: string | null
}

export const STARTER: PlaygroundState = {
    program: '.store.books[] | select(.price < 10) | {title, price}',
    input: JSON.stringify(
        {
            store: {
                name: 'The jq bookshop',
                books: [
                    { title: 'Learning jq', author: 'A. Filter', price: 8.5, tags: ['jq', 'cli'] },
                    { title: 'JSON at Scale', author: 'B. Stream', price: 24, tags: ['json'] },
                    { title: 'Pipes and Paths', author: 'C. Reduce', price: 6.25, tags: ['jq', 'unix'] },
                ],
            },
        },
        null,
        2,
    ),
    options: DEFAULT_OPTIONS,
    origin: null,
    lesson: null,
}

/** The playground, remembered across reloads. */
export const playground = persistedStore<PlaygroundState>('pjq.playground', STARTER)

/** Open a program and input in the playground, replacing what is there. */
export function openInPlayground(state: Partial<PlaygroundState> & { program: string }): void {
    playground.set({
        ...STARTER,
        options: DEFAULT_OPTIONS,
        origin: null,
        lesson: null,
        input: '',
        ...state,
    })
}
