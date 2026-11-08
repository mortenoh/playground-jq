/** The builtin catalogue, read once and shared by the editor, the palette search and the reference. */

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
