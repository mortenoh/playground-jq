import { BookOpen, FunctionSquare, GraduationCap, Library } from 'lucide-react'

import type { SearchGroup, SearchResult, SearchSource } from '@winterop-com/sokkel-ui/lib/search'

import { builtins } from '@/lib/builtins'
import { guideToc, listExamples, listTutorials } from '@/lib/client'

/**
 * The palette's search over the content: tutorials, guide chapters, builtins and examples, each
 * result carrying where choosing it goes. The catalogue is read on the first query and kept.
 */

/** A result and the path choosing it navigates to. */
export interface ContentResult extends SearchResult {
    to: string
}

interface Kind {
    kind: string
    title: string
    results: ContentResult[]
}

const LIMIT = 8

let catalogue: Promise<Kind[]> | null = null

function load(): Promise<Kind[]> {
    catalogue ??= Promise.all([listTutorials(), guideToc(), builtins(), listExamples()]).then(
        ([tutorials, chapters, loaded, examples]) => [
            {
                kind: 'tutorials',
                title: 'Tutorials',
                results: tutorials.map((tutorial) => ({
                    id: `t:${tutorial.id}`,
                    title: tutorial.title,
                    detail: `jq ${String(tutorial.level)} - ${tutorial.summary}`,
                    icon: GraduationCap,
                    to: `/learn/${tutorial.id}/1`,
                })),
            },
            {
                kind: 'guide',
                title: 'Guide',
                results: chapters.map((chapter) => ({
                    id: `g:${chapter.slug}`,
                    title: `${String(chapter.number)}. ${chapter.title}`,
                    detail: chapter.summary,
                    icon: BookOpen,
                    to: `/guide/${chapter.slug}`,
                })),
            },
            {
                kind: 'builtins',
                title: 'Builtins',
                results: loaded.map((builtin) => ({
                    id: `b:${builtin.name}`,
                    title: builtin.signatures.join(', '),
                    // The summary is markdown; a palette row shows it as plain words.
                    detail: builtin.summary.replaceAll('`', ''),
                    icon: FunctionSquare,
                    to: `/reference?q=${encodeURIComponent(builtin.name)}`,
                })),
            },
            {
                kind: 'examples',
                title: 'Examples',
                results: examples.flatMap((group) =>
                    group.examples.map((example) => ({
                        id: `e:${example.id}`,
                        title: example.title,
                        detail: `${group.title} - ${example.program}`,
                        icon: Library,
                        keywords: example.tags.join(' '),
                        to: `/examples/${example.id}`,
                    })),
                ),
            },
        ],
    )
    catalogue.catch(() => {
        catalogue = null
    })
    return catalogue
}

function matches(result: ContentResult & { keywords?: string }, words: string[]): boolean {
    const haystack = `${result.title} ${result.detail ?? ''} ${result.keywords ?? ''}`.toLowerCase()
    return words.every((word) => haystack.includes(word))
}

/** Every word typed must appear in a result's title, line or tags; each kind lists its first few. */
export const contentSearch: SearchSource = async (query) => {
    const words = query.toLowerCase().split(/\s+/).filter(Boolean)
    if (words.length === 0) return []
    const kinds = await load()
    const groups: SearchGroup[] = []
    for (const { kind, title, results } of kinds) {
        const found = results.filter((result) => matches(result, words))
        if (found.length > 0)
            groups.push({ kind, title, results: found.slice(0, LIMIT), total: found.length })
    }
    return groups
}
