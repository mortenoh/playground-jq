import { ExternalLink } from 'lucide-react'
import { useCallback, useMemo } from 'react'
import { useSearchParams } from 'react-router'

import { Markdown } from '@/components/Markdown'
import { Loading, ProblemNote } from '@/components/PageState'
import { Input } from '@/components/ui/input'
import { useRead } from '@/hooks/use-read'
import { builtins } from '@/lib/builtins'
import type { Builtin } from '@/lib/types'

const SECTION_ORDER = [
    'Builtin operators and functions',
    'Conditionals and Comparisons',
    'Regular expressions',
    'Advanced features',
    'Math',
    'I/O',
    'Streaming',
    'Assignment',
    'Other',
]

export default function ReferencePage() {
    const read = useCallback(() => builtins(), [])
    const catalogue = useRead(read)
    const [params, setParams] = useSearchParams()
    const query = params.get('q') ?? ''

    const sections = useMemo(() => {
        const words = query.toLowerCase().split(/\s+/).filter(Boolean)
        const shown = (catalogue.value ?? []).filter((builtin) => {
            const haystack =
                `${builtin.name} ${builtin.signatures.join(' ')} ${builtin.summary}`.toLowerCase()
            return words.every((word) => haystack.includes(word))
        })
        const grouped = new Map<string, Builtin[]>()
        for (const builtin of shown)
            grouped.set(builtin.section, [...(grouped.get(builtin.section) ?? []), builtin])
        return [...grouped.entries()].toSorted(
            ([a], [b]) => SECTION_ORDER.indexOf(a) - SECTION_ORDER.indexOf(b),
        )
    }, [catalogue.value, query])

    if (catalogue.problem !== null) return <ProblemNote problem={catalogue.problem} />
    if (catalogue.value === null) return <Loading what="the reference" />

    return (
        <div className="h-full overflow-auto">
            <div className="mx-auto max-w-5xl px-4 py-6">
                <h1 className="text-2xl font-semibold tracking-tight">Builtin reference</h1>
                <p className="mt-1 text-sm text-muted-foreground">
                    Every builtin in jq 1.8 ({catalogue.value.length}), with the manual's description. Derived
                    from the{' '}
                    <a
                        href="https://jqlang.org/manual/v1.8/"
                        className="text-primary-ink underline"
                        target="_blank"
                        rel="noreferrer"
                    >
                        jq manual
                    </a>{' '}
                    (CC BY 3.0).
                </p>
                <div className="sticky top-0 z-10 bg-background py-3">
                    <Input
                        aria-label="Search builtins"
                        placeholder="Search builtins: map, test, paths, @csv ..."
                        value={query}
                        onChange={(event) =>
                            setParams(event.target.value === '' ? {} : { q: event.target.value }, {
                                replace: true,
                            })
                        }
                        className="max-w-md"
                        autoFocus
                    />
                </div>
                {sections.map(([section, entries]) => (
                    <section key={section} className="mt-4">
                        <h2 className="border-b pb-1 text-lg font-semibold">{section}</h2>
                        <dl className="divide-y">
                            {entries.map((builtin) => (
                                <div key={builtin.name} className="py-3" id={`builtin-${builtin.name}`}>
                                    <dt className="flex flex-wrap items-center gap-2">
                                        {builtin.signatures.map((signature) => (
                                            <code
                                                key={signature}
                                                className="rounded-sm bg-muted px-1.5 py-0.5 font-mono text-sm"
                                            >
                                                {signature}
                                            </code>
                                        ))}
                                        <a
                                            href={builtin.manual}
                                            target="_blank"
                                            rel="noreferrer"
                                            className="ml-auto text-muted-foreground hover:text-foreground"
                                            aria-label={`${builtin.name} in the jq manual`}
                                        >
                                            <ExternalLink className="size-3.5" />
                                        </a>
                                    </dt>
                                    <dd className="mt-1">
                                        {builtin.body !== '' ? (
                                            <details>
                                                <summary className="cursor-pointer text-sm text-muted-foreground">
                                                    {builtin.summary}
                                                </summary>
                                                <Markdown text={builtin.body} className="mt-2" />
                                            </details>
                                        ) : (
                                            <p className="text-sm text-muted-foreground">{builtin.summary}</p>
                                        )}
                                    </dd>
                                </div>
                            ))}
                        </dl>
                    </section>
                ))}
            </div>
        </div>
    )
}
