import { marked } from 'marked'
import { Fragment, useMemo, type ReactNode } from 'react'

import { cn } from '@/lib/utils'

marked.use({ gfm: true, breaks: false })

/** Markdown to HTML. The content is the app's own (guide, tutorials, manual), not user input. */
export function toHtml(markdown: string): string {
    return marked.parse(markdown, { async: false })
}

/** A block of markdown. */
export function Markdown({ text, className }: { text: string; className?: string }) {
    const html = useMemo(() => toHtml(text), [text])
    return <div className={cn('prose-jq', className)} dangerouslySetInnerHTML={{ __html: html }} />
}

/** The marker a chapter leaves where a snippet goes. */
const MARKER = /<!-- snippet:([A-Za-z0-9_-]+) -->/

/** Markdown with `<!-- snippet:ID -->` markers replaced by rendered components. */
export function MarkdownWithSnippets({
    text,
    render,
    className,
}: {
    text: string
    render: (id: string) => ReactNode
    className?: string
}) {
    const parts = useMemo(() => text.split(MARKER), [text])
    return (
        <div className={className}>
            {parts.map((part, index) =>
                index % 2 === 1 ? (
                    <Fragment key={`s-${part}`}>{render(part)}</Fragment>
                ) : (
                    <Markdown key={`m-${String(index)}`} text={part} />
                ),
            )}
        </div>
    )
}
