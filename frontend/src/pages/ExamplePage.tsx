import { ArrowLeft, ExternalLink, Play, ShieldCheck } from 'lucide-react'
import { useCallback, useEffect, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router'

import { LevelChip, SourceChip } from '@/components/Chips'
import { CodePane } from '@/components/editor/CodePane'
import { Markdown } from '@/components/Markdown'
import { Loading, ProblemNote } from '@/components/PageState'
import { Button } from '@/components/ui/button'
import { useRead } from '@/hooks/use-read'
import { getExample, resolveInput } from '@/lib/client'
import { changedOptions } from '@/lib/share'
import { openExample } from '@/lib/open'
import type { InputSpec } from '@/lib/types'

/** How to show an example's input: the text when inline or small, a preview when large. */
function useInputPreview(spec: InputSpec | undefined): string | null {
    const [resolved, setResolved] = useState<{ ref: string; text: string } | null>(null)
    const ref = spec?.ref ?? null
    useEffect(() => {
        if (ref === null) return
        let wanted = true
        void resolveInput({ ref, text: null }).then(({ text }) => {
            if (!wanted) return
            const preview =
                text.length > 20_000
                    ? `${text.slice(0, 20_000)}\n... (${String(Math.round(text.length / 1024))} KB in total; open in the playground to see it all)`
                    : text
            setResolved({ ref, text: preview })
        })
        return () => {
            wanted = false
        }
    }, [ref])
    if (spec === undefined) return null
    if (spec.text !== null) return spec.text
    return resolved?.ref === ref ? resolved.text : null
}

export default function ExamplePage() {
    const { id = '' } = useParams()
    const navigate = useNavigate()
    const read = useCallback(() => getExample(id), [id])
    const example = useRead(read)
    const input = useInputPreview(example.value?.input)

    if (example.problem !== null) return <ProblemNote problem={example.problem} />
    if (example.value === null) return <Loading what="the example" />
    const value = example.value
    const flags = Object.entries(changedOptions(value.options))
    const expected =
        value.expected !== null
            ? value.expected.map((item) => JSON.stringify(item, null, 2)).join('\n')
            : value.digest !== null
              ? `(large output, verified by digest ${value.digest.slice(0, 12)}...; run it to see it)`
              : ''

    return (
        <div className="h-full overflow-auto">
            <div className="mx-auto max-w-5xl px-4 py-6">
                <Link
                    to="/examples"
                    className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
                >
                    <ArrowLeft className="size-4" aria-hidden /> Examples
                </Link>
                <div className="mt-3 flex flex-wrap items-center gap-2">
                    <h1 className="text-2xl font-semibold tracking-tight">{value.title}</h1>
                    <LevelChip level={value.level} long />
                    <SourceChip
                        source={
                            value.input.text !== null
                                ? 'inline'
                                : ((value.input.ref ?? 'static').split(':')[0] as 'static')
                        }
                    />
                    <span
                        className="inline-flex items-center gap-1 text-xs text-good-ink"
                        title="Run by the test suite on every change"
                    >
                        <ShieldCheck className="size-4" aria-hidden /> verified
                    </span>
                </div>
                <div className="mt-1 flex flex-wrap gap-1">
                    {value.tags.map((tag) => (
                        <span
                            key={tag}
                            className="rounded-sm bg-muted px-1.5 py-0.5 font-mono text-xs text-muted-foreground"
                        >
                            {tag}
                        </span>
                    ))}
                </div>
                {value.explanation !== '' && <Markdown text={value.explanation} className="mt-4" />}
                <h2 className="mt-6 mb-2 text-sm font-semibold">Program</h2>
                <div className="h-32 overflow-hidden rounded-md border">
                    <CodePane
                        value={value.program}
                        language="jq"
                        path={`example-program-${value.id}`}
                        label="Program"
                        readOnly
                    />
                </div>
                {flags.length > 0 && (
                    <p className="mt-2 font-mono text-xs text-muted-foreground">
                        flags: {flags.map(([key, item]) => `${key}=${JSON.stringify(item)}`).join(', ')}
                    </p>
                )}
                <div className="mt-4 grid gap-4 md:grid-cols-2">
                    <div>
                        <h2 className="mb-2 text-sm font-semibold">
                            Input{' '}
                            {value.input.ref !== null && (
                                <span className="font-mono text-xs font-normal text-muted-foreground">
                                    ({value.input.ref})
                                </span>
                            )}
                        </h2>
                        <div className="h-72 overflow-hidden rounded-md border">
                            {input === null ? (
                                <Loading what="the input" />
                            ) : (
                                <CodePane
                                    value={input}
                                    language="json"
                                    path={`example-input-${value.id}`}
                                    label="Input"
                                    readOnly
                                />
                            )}
                        </div>
                    </div>
                    <div>
                        <h2 className="mb-2 text-sm font-semibold">
                            {value.error !== null ? 'Fails with' : 'Output'}
                        </h2>
                        <div className="h-72 overflow-hidden rounded-md border">
                            <CodePane
                                value={value.error !== null ? value.error : expected}
                                language={value.error !== null ? 'plaintext' : 'json'}
                                path={`example-output-${value.id}`}
                                label="Expected output"
                                readOnly
                            />
                        </div>
                    </div>
                </div>
                <div className="mt-4 flex flex-wrap items-center gap-3">
                    <Button
                        onClick={() => {
                            void openExample(value).then(() => navigate('/'))
                        }}
                    >
                        <Play /> Open in the playground
                    </Button>
                    {value.manual.map((link) => (
                        <a
                            key={link}
                            href={link}
                            target="_blank"
                            rel="noreferrer"
                            className="inline-flex items-center gap-1 text-sm text-primary-ink underline"
                        >
                            jq manual <ExternalLink className="size-3.5" aria-hidden />
                        </a>
                    ))}
                    {value.guide.map((slug) => (
                        <Link key={slug} to={`/guide/${slug}`} className="text-sm text-primary-ink underline">
                            Guide: {slug}
                        </Link>
                    ))}
                </div>
                {value.attribution !== null && (
                    <p className="mt-4 text-xs text-muted-foreground">Source: {value.attribution}</p>
                )}
            </div>
        </div>
    )
}
