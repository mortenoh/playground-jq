/**
 * Tutorial progress and the playground's run history, kept in this browser only.
 */

import { persistedStore } from '@/lib/store'

/** Solved step numbers per tutorial id. */
export type Progress = Record<string, number[]>

export const progress = persistedStore<Progress>('pjq.progress', {})

/** Mark a step solved. */
export function markSolved(tutorial: string, step: number): void {
    progress.update((held) => {
        const solved = new Set(held[tutorial] ?? [])
        solved.add(step)
        return { ...held, [tutorial]: [...solved].toSorted((a, b) => a - b) }
    })
}

/** How many of a tutorial's steps are solved. */
export function solvedCount(held: Progress, tutorial: string): number {
    return (held[tutorial] ?? []).length
}

/** Forget every tutorial's progress. */
export function resetProgress(): void {
    progress.set({})
}

export interface HistoryEntry {
    program: string
    at: string
}

/** The most recent distinct programs run in the playground, newest first. */
export const history = persistedStore<HistoryEntry[]>('pjq.history', [])

export const HISTORY_LIMIT = 50

/** Remember a program that was run, moving a repeat to the top. */
export function remember(program: string, at: Date = new Date()): void {
    const trimmed = program.trim()
    if (trimmed === '') return
    history.update((held) =>
        [{ program, at: at.toISOString() }, ...held.filter((entry) => entry.program !== program)].slice(
            0,
            HISTORY_LIMIT,
        ),
    )
}
