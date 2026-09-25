import { Check, Copy, Map as MapIcon, TriangleAlert } from 'lucide-react'
import { Suspense, lazy, useState } from 'react'

import { CodePane } from '@/components/editor/CodePane'
import { Button } from '@/components/ui/button'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import type { RunResult } from '@/lib/types'
import { cn } from '@/lib/utils'

const MapView = lazy(() => import('@/components/playground/MapView'))

const KIND_LABEL: Record<string, string> = {
    compile: 'Compile error',
    input: 'Input error',
    runtime: 'Runtime error',
    timeout: 'Timed out',
    limit: 'Limit reached',
    unavailable: 'Unavailable',
}

export function CopyButton({ text, label }: { text: string; label: string }) {
    const [copied, setCopied] = useState(false)
    return (
        <Button
            variant="ghost"
            size="icon-xs"
            aria-label={label}
            onClick={() => {
                void navigator.clipboard.writeText(text).then(() => {
                    setCopied(true)
                    setTimeout(() => {
                        setCopied(false)
                    }, 1200)
                })
            }}
        >
            {copied ? <Check /> : <Copy />}
        </Button>
    )
}

/** What a run produced: the formatted output, errors, stderr messages, the CLI command, and a map. */
export function OutputPanel({
    result,
    running,
    path = 'output',
    raw = false,
    className,
}: {
    result: RunResult | null
    running: boolean
    path?: string
    /** The output is raw text (`-r`, `-j`, `--seq`) rather than JSON. */
    raw?: boolean
    className?: string
}) {
    const [tab, setTab] = useState('output')
    const shownTab = tab === 'map' && !result?.is_geojson ? 'output' : tab

    return (
        <section className={cn('flex min-h-0 flex-col', className)} aria-label="Output">
            <Tabs
                value={shownTab}
                onValueChange={(value) => setTab(String(value))}
                className="flex min-h-0 flex-1 flex-col gap-0"
            >
                <div className="flex h-9 shrink-0 items-center gap-2 border-b px-2">
                    <span className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">
                        Output
                    </span>
                    <TabsList variant="line" className="h-8">
                        <TabsTrigger value="output">Result</TabsTrigger>
                        <TabsTrigger value="command">Command</TabsTrigger>
                        {result?.is_geojson === true && (
                            <TabsTrigger value="map">
                                <MapIcon className="size-3.5" aria-hidden /> Map
                            </TabsTrigger>
                        )}
                    </TabsList>
                    <div
                        className="ml-auto flex items-center gap-2 text-xs text-muted-foreground"
                        data-testid="run-status"
                    >
                        {running && <span>running</span>}
                        {!running && result !== null && (
                            <>
                                <span>
                                    {result.outputs.length} output{result.outputs.length === 1 ? '' : 's'}
                                </span>
                                <span>{result.duration_ms.toFixed(1)} ms</span>
                                <span title="Which jq ran the program">
                                    {result.engine === 'cli' ? 'jq binary' : 'jq.py'}
                                </span>
                                {result.truncated && <span className="text-warning-ink">truncated</span>}
                            </>
                        )}
                        {result !== null && <CopyButton text={result.text} label="Copy the output" />}
                    </div>
                </div>
                {result !== null && result.errors.length > 0 && (
                    <div
                        className="shrink-0 border-b border-critical/30 bg-critical/10 px-3 py-2 text-sm"
                        role="alert"
                        data-testid="run-errors"
                    >
                        {result.errors.map((error, index) => (
                            <p key={index} className="flex items-start gap-2">
                                <TriangleAlert
                                    className="mt-0.5 size-4 shrink-0 text-critical-ink"
                                    aria-hidden
                                />
                                <span>
                                    <span className="font-medium text-critical-ink">
                                        {KIND_LABEL[error.kind] ?? error.kind}
                                    </span>
                                    {error.line !== null && (
                                        <span className="text-muted-foreground">
                                            {' '}
                                            at line {error.line}
                                            {error.column !== null ? `, column ${String(error.column)}` : ''}
                                        </span>
                                    )}
                                    : <span className="font-mono text-xs">{error.message}</span>
                                </span>
                            </p>
                        ))}
                    </div>
                )}
                {result !== null && result.messages.length > 0 && (
                    <div className="max-h-28 shrink-0 overflow-auto border-b bg-muted/40 px-3 py-1.5 font-mono text-xs text-muted-foreground">
                        {result.messages.map((message, index) => (
                            <div key={index}>stderr: {message}</div>
                        ))}
                    </div>
                )}
                <TabsContent value="output" className="min-h-0 flex-1">
                    <CodePane
                        value={result?.text ?? ''}
                        language={raw ? 'plaintext' : 'json'}
                        path={path}
                        label="Output"
                        readOnly
                        lineNumbers={false}
                    />
                </TabsContent>
                <TabsContent value="command" className="min-h-0 flex-1 overflow-auto p-3">
                    <p className="mb-2 text-sm text-muted-foreground">
                        The same run on the command line, with the input saved as{' '}
                        <code className="font-mono">input.json</code>:
                    </p>
                    <div className="flex items-start gap-2 rounded-md border bg-muted/40 p-3">
                        <pre
                            className="flex-1 overflow-x-auto font-mono text-sm whitespace-pre-wrap"
                            data-testid="cli-command"
                        >
                            {result?.command ?? ''}
                        </pre>
                        {result !== null && <CopyButton text={result.command} label="Copy the command" />}
                    </div>
                </TabsContent>
                {result?.is_geojson === true && (
                    <TabsContent value="map" className="min-h-0 flex-1">
                        <Suspense
                            fallback={<p className="p-3 text-sm text-muted-foreground">Loading the map.</p>}
                        >
                            <MapView value={result.outputs[0]} />
                        </Suspense>
                    </TabsContent>
                )}
            </Tabs>
        </section>
    )
}
