import { CheckCircle2, Circle } from 'lucide-react'
import { useCallback } from 'react'
import { Link } from 'react-router'

import { LevelChip } from '@/components/Chips'
import { Loading, ProblemNote } from '@/components/PageState'
import { Button } from '@/components/ui/button'
import { useRead } from '@/hooks/use-read'
import { useStore } from '@/hooks/use-store'
import { listTutorials } from '@/lib/client'
import { LEVELS } from '@/lib/levels'
import { progress, resetProgress, solvedCount } from '@/lib/progress'

export default function LearnPage() {
    const read = useCallback(() => listTutorials(), [])
    const tutorials = useRead(read)
    const held = useStore(progress)

    if (tutorials.problem !== null) return <ProblemNote problem={tutorials.problem} />
    if (tutorials.value === null) return <Loading what="the tutorials" />

    return (
        <div className="h-full overflow-auto">
            <div className="mx-auto max-w-5xl px-4 py-6">
                <h1 className="text-2xl font-semibold tracking-tight">Learn jq</h1>
                <p className="mt-1 max-w-3xl text-sm text-muted-foreground">
                    Three tracks of guided tutorials over small, static datasets. Each step asks you to write
                    a filter; your output is checked against the expected one, with hints if you are stuck.
                    Progress is kept in this browser.
                </p>
                {LEVELS.map(({ level, name, blurb }) => {
                    const shown = (tutorials.value ?? []).filter((tutorial) => tutorial.level === level)
                    return (
                        <section key={level} className="mt-8" aria-labelledby={`level-${String(level)}`}>
                            <div className="flex items-center gap-2">
                                <h2 id={`level-${String(level)}`} className="text-lg font-semibold">
                                    jq {level}: {name}
                                </h2>
                            </div>
                            <p className="text-sm text-muted-foreground">{blurb}</p>
                            <ol className="mt-3 grid gap-2 md:grid-cols-2">
                                {shown.map((tutorial, index) => {
                                    const solved = solvedCount(held, tutorial.id)
                                    const done = solved >= tutorial.steps
                                    return (
                                        <li key={tutorial.id}>
                                            <Link
                                                to={`/learn/${tutorial.id}/${String(Math.min(solved + 1, tutorial.steps))}`}
                                                className="flex h-full gap-3 rounded-md border bg-card p-3 hover:border-primary/60 hover:bg-accent/30"
                                            >
                                                {done ? (
                                                    <CheckCircle2
                                                        className="mt-0.5 size-5 shrink-0 text-good-ink"
                                                        aria-label="Completed"
                                                    />
                                                ) : (
                                                    <Circle
                                                        className="mt-0.5 size-5 shrink-0 text-faint"
                                                        aria-hidden
                                                    />
                                                )}
                                                <span className="min-w-0 flex-1">
                                                    <span className="flex items-center gap-2">
                                                        <span className="text-sm font-medium">
                                                            {index + 1}. {tutorial.title}
                                                        </span>
                                                        <LevelChip level={tutorial.level} />
                                                    </span>
                                                    <span className="mt-0.5 block text-xs text-muted-foreground">
                                                        {tutorial.summary}
                                                    </span>
                                                    <span className="mt-2 block h-1 overflow-hidden rounded-full bg-muted">
                                                        <span
                                                            className="block h-full bg-good"
                                                            style={{
                                                                width: `${String((solved / tutorial.steps) * 100)}%`,
                                                            }}
                                                        />
                                                    </span>
                                                    <span className="mt-1 block text-xs text-faint">
                                                        {solved} of {tutorial.steps} steps
                                                    </span>
                                                </span>
                                            </Link>
                                        </li>
                                    )
                                })}
                            </ol>
                        </section>
                    )
                })}
                <Button
                    variant="ghost"
                    size="sm"
                    className="mt-8 text-muted-foreground"
                    onClick={resetProgress}
                >
                    Reset my progress
                </Button>
            </div>
        </div>
    )
}
