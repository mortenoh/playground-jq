import { TriangleAlert } from 'lucide-react'

import type { Problem } from '@/lib/api'

export function Loading({ what }: { what: string }) {
    return <p className="p-6 text-sm text-muted-foreground">Loading {what}.</p>
}

export function ProblemNote({ problem }: { problem: Problem }) {
    return (
        <div className="m-4 flex items-start gap-2 rounded-md border border-critical/40 bg-critical/10 p-3 text-sm">
            <TriangleAlert className="mt-0.5 size-4 shrink-0 text-critical-ink" aria-hidden />
            <div>
                <p className="font-medium">{problem.title}</p>
                <p className="text-muted-foreground">{problem.detail}</p>
            </div>
        </div>
    )
}
