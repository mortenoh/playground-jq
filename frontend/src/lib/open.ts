/** Opening examples and guide snippets in the playground. */

import { resolveInput } from '@/lib/client'
import { openInPlayground } from '@/lib/playground'
import type { Example, InputSpec, RunOptions, Snippet } from '@/lib/types'

async function inputOf(spec: InputSpec | null): Promise<{ text: string; ref: string | null }> {
    if (spec === null) return { text: '', ref: null }
    if (spec.text !== null) return { text: spec.text, ref: null }
    const { text } = await resolveInput(spec)
    return { text, ref: spec.ref }
}

async function open(
    program: string,
    spec: InputSpec | null,
    options: RunOptions,
    lesson: Parameters<typeof openInPlayground>[0]['lesson'],
): Promise<void> {
    const { text, ref } = await inputOf(spec)
    openInPlayground({
        program,
        input: text,
        options,
        origin: ref === null ? null : { ref, title: ref, live: false },
        lesson,
    })
}

export function openExample(example: Example): Promise<void> {
    return open(example.program, example.input, example.options, {
        kind: 'example',
        id: example.id,
        title: example.title,
        explanation: example.explanation,
        manual: example.manual,
        attribution: example.attribution,
    })
}

export function openSnippet(snippet: Snippet, chapterTitle: string): Promise<void> {
    return open(snippet.program, snippet.input, snippet.options, {
        kind: 'snippet',
        id: snippet.id,
        title: `From the guide: ${chapterTitle}`,
        explanation: snippet.caption,
        manual: [],
        attribution: null,
    })
}
