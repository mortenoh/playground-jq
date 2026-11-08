import type { ReactNode } from 'react'

import { Markdown as Rendered } from '@winterop-com/sokkel-ui/Markdown'

/**
 * The app's markdown (guide, tutorials, examples, the manual's builtin entries) through
 * sokkel-ui's Markdown: GitHub-flavored, jq fences highlighted. Math is off, since jq's `$name`
 * variables would otherwise read as LaTeX.
 */
export function Markdown({ text, className }: { text: string; className?: string }) {
    return <Rendered content={text} math={false} className={className} />
}

/**
 * A guide chapter: markdown at a document's heading sizes, with every `<!-- snippet:ID -->`
 * marker replaced by the component `render` draws for that ID.
 */
export function MarkdownWithSnippets({
    text,
    render,
    className,
}: {
    text: string
    render: (id: string) => ReactNode
    className?: string
}) {
    return (
        <Rendered
            content={text}
            math={false}
            scale="document"
            anchors
            parts={render}
            partMarker="snippet"
            className={className}
        />
    )
}
