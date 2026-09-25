import { Play, Terminal } from 'lucide-react'
import { useNavigate } from 'react-router'

import { Button } from '@/components/ui/button'
import { equivalentCommand } from '@/lib/local/command'
import { printOutputs } from '@/lib/local/print'
import { openSnippet } from '@/lib/open'
import type { Snippet } from '@/lib/types'

const PREVIEW_LIMIT = 600

function preview(text: string): string {
    return text.length > PREVIEW_LIMIT ? `${text.slice(0, PREVIEW_LIMIT)}\n...` : text
}

/** The command line for a snippet, with the program elided (it is shown below). */
function commandOf(snippet: Snippet): string {
    const command = equivalentCommand('PROGRAM', snippet.options, snippet.input !== null).replace(
        'PROGRAM',
        "'...'",
    )
    const source = snippet.input?.ref ?? null
    return source === null ? command.replace(' input.json', '') : command.replace('input.json', `< ${source}`)
}

/** A runnable guide snippet: program, input, output, and a button that opens it in the playground. */
export function SnippetCard({ snippet, chapterTitle }: { snippet: Snippet; chapterTitle: string }) {
    const navigate = useNavigate()
    const output =
        snippet.error !== null
            ? `error: ${snippet.error}`
            : snippet.expected !== null
              ? printOutputs(snippet.expected, snippet.options)
              : '(large output: open it to see)'
    return (
        <figure
            className="my-4 overflow-hidden rounded-md border bg-card"
            data-testid={`snippet-${snippet.id}`}
        >
            <div className="flex items-center gap-2 border-b bg-muted/40 px-3 py-1.5">
                <Terminal className="size-3.5 text-muted-foreground" aria-hidden />
                <code className="flex-1 truncate font-mono text-xs text-muted-foreground">
                    {commandOf(snippet)}
                </code>
                {snippet.cli_only && <span className="text-xs text-warning-ink">jq binary</span>}
                <Button
                    size="xs"
                    variant="outline"
                    onClick={() => {
                        void openSnippet(snippet, chapterTitle).then(() => navigate('/'))
                    }}
                >
                    <Play /> Try it
                </Button>
            </div>
            <div className="grid md:grid-cols-[1fr_1fr]">
                <div className="border-b md:border-r md:border-b-0">
                    <div className="px-3 pt-2 text-xs font-semibold text-muted-foreground uppercase">
                        Program
                    </div>
                    <pre className="overflow-x-auto px-3 pb-3 font-mono text-sm whitespace-pre-wrap text-foreground">
                        {snippet.program}
                    </pre>
                    {snippet.input !== null && snippet.input.text !== null && (
                        <>
                            <div className="px-3 pt-1 text-xs font-semibold text-muted-foreground uppercase">
                                Input
                            </div>
                            <pre className="max-h-48 overflow-auto px-3 pb-3 font-mono text-xs text-muted-foreground">
                                {preview(snippet.input.text)}
                            </pre>
                        </>
                    )}
                </div>
                <div>
                    <div className="px-3 pt-2 text-xs font-semibold text-muted-foreground uppercase">
                        Output
                    </div>
                    <pre className="max-h-64 overflow-auto px-3 pb-3 font-mono text-xs whitespace-pre-wrap text-good-ink">
                        {preview(output)}
                    </pre>
                </div>
            </div>
            {snippet.caption !== '' && (
                <figcaption className="border-t px-3 py-1.5 text-xs text-muted-foreground">
                    {snippet.caption}
                </figcaption>
            )}
        </figure>
    )
}
