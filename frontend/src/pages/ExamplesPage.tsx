import { useCallback, useMemo, useState } from 'react'
import { Link, useSearchParams } from 'react-router'

import { LevelChip, SourceChip } from '@/components/Chips'
import { NativeSelect } from '@/components/NativeSelect'
import { Loading, ProblemNote } from '@/components/PageState'
import { Input } from '@/components/ui/input'
import { useRead } from '@/hooks/use-read'
import { listExamples } from '@/lib/client'
import type { ExampleGroup } from '@/lib/types'

const TRACKS: { id: ExampleGroup['track'] | ''; label: string }[] = [
    { id: '', label: 'All tracks' },
    { id: 'language', label: 'The jq language' },
    { id: 'dhis2', label: 'DHIS2' },
    { id: 'echo', label: 'postman-echo' },
    { id: 'patterns', label: 'Real-world patterns' },
    { id: 'manual', label: 'From the jq manual' },
]

export default function ExamplesPage() {
    const read = useCallback(() => listExamples(), [])
    const groups = useRead(read)
    const [params, setParams] = useSearchParams()
    const [query, setQuery] = useState(params.get('q') ?? '')
    const track = params.get('track') ?? ''
    const level = params.get('level') ?? ''
    const source = params.get('source') ?? ''

    const shown = useMemo(() => {
        const words = query.toLowerCase().split(/\s+/).filter(Boolean)
        return (groups.value ?? [])
            .filter((group) => track === '' || group.track === track)
            .map((group) => ({
                ...group,
                examples: group.examples.filter((example) => {
                    if (level !== '' && String(example.level) !== level) return false
                    if (source !== '' && example.source !== source) return false
                    const haystack =
                        `${example.title} ${example.program} ${example.tags.join(' ')} ${group.title}`.toLowerCase()
                    return words.every((word) => haystack.includes(word))
                }),
            }))
            .filter((group) => group.examples.length > 0)
    }, [groups.value, query, track, level, source])

    const total = shown.reduce((count, group) => count + group.examples.length, 0)

    function setParam(key: string, value: string): void {
        const next = new URLSearchParams(params)
        if (value === '') next.delete(key)
        else next.set(key, value)
        setParams(next, { replace: true })
    }

    if (groups.problem !== null) return <ProblemNote problem={groups.problem} />
    if (groups.value === null) return <Loading what="the examples" />

    return (
        <div className="h-full overflow-auto">
            <div className="mx-auto max-w-6xl px-4 py-6">
                <h1 className="text-2xl font-semibold tracking-tight">Examples</h1>
                <p className="mt-1 text-sm text-muted-foreground">
                    Every example runs in the test suite against its input, so each one is verified. Open any
                    of them in the playground to change it.
                </p>
                <div className="sticky top-0 z-10 mt-4 flex flex-wrap items-center gap-2 bg-background py-2">
                    <Input
                        aria-label="Search examples"
                        placeholder="Search titles, programs and tags"
                        value={query}
                        onChange={(event) => {
                            setQuery(event.target.value)
                            setParam('q', event.target.value)
                        }}
                        className="max-w-sm"
                    />
                    <NativeSelect
                        aria-label="Track"
                        value={track}
                        onChange={(event) => setParam('track', event.target.value)}
                    >
                        {TRACKS.map((entry) => (
                            <option key={entry.id} value={entry.id}>
                                {entry.label}
                            </option>
                        ))}
                    </NativeSelect>
                    <NativeSelect
                        aria-label="Level"
                        value={level}
                        onChange={(event) => setParam('level', event.target.value)}
                    >
                        <option value="">All levels</option>
                        <option value="101">jq 101</option>
                        <option value="201">jq 201</option>
                        <option value="301">jq 301</option>
                    </NativeSelect>
                    <NativeSelect
                        aria-label="Source"
                        value={source}
                        onChange={(event) => setParam('source', event.target.value)}
                    >
                        <option value="">All inputs</option>
                        <option value="static">static datasets</option>
                        <option value="inline">inline</option>
                        <option value="dhis2">DHIS2</option>
                        <option value="echo">postman-echo</option>
                    </NativeSelect>
                    <span className="text-xs text-muted-foreground" data-testid="example-count">
                        {total} example{total === 1 ? '' : 's'}
                    </span>
                </div>
                {shown.map((group) => (
                    <section key={group.id} className="mt-6" aria-labelledby={`group-${group.id}`}>
                        <h2 id={`group-${group.id}`} className="text-lg font-semibold">
                            {group.title}
                        </h2>
                        {group.description !== '' && (
                            <p className="mt-0.5 text-sm text-muted-foreground">{group.description}</p>
                        )}
                        <ul className="mt-2 grid gap-2 md:grid-cols-2">
                            {group.examples.map((example) => (
                                <li key={example.id}>
                                    <Link
                                        to={`/examples/${example.id}`}
                                        className="block h-full rounded-md border bg-card p-3 hover:border-primary/60 hover:bg-accent/30"
                                    >
                                        <div className="flex items-center gap-2">
                                            <span className="flex-1 truncate text-sm font-medium">
                                                {example.title}
                                            </span>
                                            <LevelChip level={example.level} />
                                            <SourceChip source={example.source} />
                                        </div>
                                        <pre className="mt-2 truncate font-mono text-xs text-muted-foreground">
                                            {example.program}
                                        </pre>
                                    </Link>
                                </li>
                            ))}
                        </ul>
                    </section>
                ))}
            </div>
        </div>
    )
}
