/** The builtin catalogue, read once and shared by the editor, the palette and the reference. */

import { listBuiltins } from '@/lib/client'
import type { Builtin } from '@/lib/types'

let pending: Promise<Builtin[]> | null = null

export function builtins(): Promise<Builtin[]> {
    pending ??= listBuiltins().catch((error: unknown) => {
        pending = null
        throw error
    })
    return pending
}

/** Names usable as completions: the identifier part of each builtin. */
export function completionNames(catalogue: Builtin[]): string[] {
    return [...new Set(catalogue.map((builtin) => builtin.name))].toSorted()
}
