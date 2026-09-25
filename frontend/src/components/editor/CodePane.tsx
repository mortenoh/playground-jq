import { Suspense, lazy } from 'react'

import type { CodeEditorProps } from '@/components/editor/CodeEditor'
import { whenIdle } from '@/lib/idle'
import { cn } from '@/lib/utils'

/**
 * The one door to Monaco: a single dynamic import, so the editor and its workers are one chunk
 * fetched once. `warmEditor` fires the same import when the browser is idle. The fallback keeps
 * the editor's box so the layout does not jump when the chunk lands.
 */
const load = () => import('@/components/editor/CodeEditor')

const CodeEditor = lazy(() => load().then((module) => ({ default: module.CodeEditor })))

let warmed = false

export function warmEditor(): void {
    if (warmed) return
    warmed = true
    whenIdle(() => {
        void load().catch(() => undefined)
    })
}

export function CodePane({ className, ...rest }: CodeEditorProps) {
    return (
        <Suspense
            fallback={
                <p className={cn('h-full min-h-24 w-full p-3 text-sm text-muted-foreground', className)}>
                    Loading the editor.
                </p>
            }
        >
            <CodeEditor className={className} {...rest} />
        </Suspense>
    )
}
